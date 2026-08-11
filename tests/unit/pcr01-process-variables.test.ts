/**
 * Trazaloop · Sprint PCR-01 · Punto 13 — variables de proceso SIN JSON
 * manual. Ejercita el dominio puro: parseo defensivo del JSONB legado,
 * validación en español y serialización canónica; y verifica estáticamente
 * que el formulario ya no expone un campo de JSON crudo.
 *
 * Correr: npm run test:pcr01-process-variables
 */
import fs from "node:fs";
import path from "node:path";
import {
  parseProcessVariables,
  validateProcessVariableRows,
  serializeProcessVariableRows,
  formatProcessVariablesSummary,
} from "../../lib/domain/process-variables";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function readSource(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

console.log("PCR-01 · Variables de proceso sin JSON manual (punto 13)");

check("1. Sin variables (null/undefined/[]) → sin filas y sin legado", () => {
  for (const value of [null, undefined, []]) {
    const parsed = parseProcessVariables(value);
    assert(parsed.rows.length === 0 && parsed.unparsedRaw === null, `falló con ${JSON.stringify(value)}`);
  }
});

check("2. Formato canónico [{name,value,unit}] → filas editables", () => {
  const parsed = parseProcessVariables([
    { name: "Temperatura", value: 185, unit: "°C" },
    { name: "Velocidad", value: "90", unit: "rpm" },
  ]);
  assert(parsed.unparsedRaw === null, "no debía marcar legado");
  assert(parsed.rows.length === 2, "debían salir 2 filas");
  assert(parsed.rows[0].name === "Temperatura" && parsed.rows[0].value === "185", "fila 1 incorrecta");
  assert(parsed.rows[1].unit === "rpm", "fila 2 incorrecta");
});

check("3. Objeto plano legacy {clave: primitivo} → filas SIN pérdida", () => {
  const parsed = parseProcessVariables({ temperatura_c: 210, rpm: 90, linea: "A" });
  assert(parsed.unparsedRaw === null, "el objeto plano debía convertirse, no marcarse legado");
  assert(parsed.rows.length === 3, "debían salir 3 filas");
  const byName = Object.fromEntries(parsed.rows.map((r) => [r.name, r.value]));
  assert(byName.temperatura_c === "210" && byName.rpm === "90" && byName.linea === "A", "valores legacy perdidos");
});

check("4. Estructura inesperada (anidada) → se conserva como legado intacto", () => {
  const weird = { perfil: { zona1: 180, zona2: 200 } };
  const parsed = parseProcessVariables(weird);
  assert(parsed.rows.length === 0, "no debía inventar filas de una estructura anidada");
  assert(parsed.unparsedRaw !== null, "debía conservar el JSON legado");
  assert(JSON.parse(parsed.unparsedRaw!).perfil.zona2 === 200, "el legado debía conservarse íntegro");
});

check("5. Texto JSON malformado → conservado sin romper", () => {
  const parsed = parseProcessVariables("{temperatura: 210");
  assert(parsed.rows.length === 0 && parsed.unparsedRaw === "{temperatura: 210", "el malformado debía conservarse tal cual");
});

check("6. Validación en español: nombre y valor obligatorios, límites", () => {
  assert(
    validateProcessVariableRows([{ name: "", value: "185", unit: "" }]) ===
      "Cada variable de proceso necesita un nombre.",
    "faltó el mensaje de nombre"
  );
  assert(
    validateProcessVariableRows([{ name: "Temperatura", value: "", unit: "" }]) ===
      'La variable "Temperatura" necesita un valor.',
    "faltó el mensaje de valor"
  );
  assert(
    validateProcessVariableRows([{ name: "a".repeat(121), value: "1", unit: "" }]) !== null,
    "el nombre largo debía rechazarse"
  );
  assert(
    validateProcessVariableRows([{ name: "T", value: "1", unit: "u".repeat(41) }]) !== null,
    "la unidad larga debía rechazarse"
  );
  assert(
    validateProcessVariableRows([{ name: "", value: "", unit: "" }]) === null,
    "una fila totalmente vacía se ignora"
  );
});

check("7. Serialización canónica: numeriza valores y omite unidades vacías", () => {
  const out = serializeProcessVariableRows([
    { name: "Temperatura", value: "185.5", unit: "°C" },
    { name: "Línea", value: "A", unit: "" },
    { name: "", value: "", unit: "" },
  ]);
  assert(out !== null && out.length === 2, "la fila vacía debía descartarse");
  assert(out![0].value === 185.5 && out![0].unit === "°C", "el valor numérico debía guardarse como number");
  assert(out![1].value === "A" && out![1].unit === null, "el valor textual se conserva y la unidad vacía es null");
});

check("8. Serialización de solo filas vacías → null (columna limpia)", () => {
  assert(serializeProcessVariableRows([{ name: "", value: "", unit: "" }]) === null, "debía dar null");
  assert(serializeProcessVariableRows([]) === null, "vacío debía dar null");
});

check("9. Ida y vuelta: lo serializado se re-parsea como filas idénticas", () => {
  const serialized = serializeProcessVariableRows([
    { name: "Presión", value: "12", unit: "bar" },
  ]);
  const reparsed = parseProcessVariables(serialized);
  assert(reparsed.unparsedRaw === null && reparsed.rows.length === 1, "el canónico debía re-parsearse");
  assert(reparsed.rows[0].name === "Presión" && reparsed.rows[0].value === "12" && reparsed.rows[0].unit === "bar", "roundtrip roto");
});

check("10. Resumen legible: nunca JSON crudo", () => {
  const summary = formatProcessVariablesSummary([{ name: "Temperatura", value: 185, unit: "°C" }]);
  assert(summary === "Temperatura: 185 °C", `resumen inesperado: ${summary}`);
  const legacy = formatProcessVariablesSummary({ perfil: { z: 1 } });
  assert(legacy === "Variables registradas en formato heredado", "el legado debía describirse, no volcarse");
  assert(formatProcessVariablesSummary(null) === null, "sin variables → sin resumen");
});

check("11. El formulario ya no expone JSON crudo y usa el editor humano", () => {
  const form = readSource("../../components/domain/traceability/forms.tsx");
  assert(!form.includes("Variables de proceso, JSON"), "el campo JSON manual debía desaparecer");
  assert(form.includes("ProcessVariablesEditor"), "el formulario debía usar el editor de filas");
  const editor = readSource("../../components/domain/traceability/process-variables-editor.tsx");
  for (const label of ["Variable", "Valor", "Unidad", "+ Agregar variable"]) {
    assert(editor.includes(label), `el editor debía incluir "${label}"`);
  }
  const actions = readSource("../../server/actions/traceability.ts");
  assert(
    actions.includes("serializeProcessVariableRows") && actions.includes("validateProcessVariableRows"),
    "la server action debía validar y serializar con el dominio puro (cliente no confiable)"
  );
  assert(
    actions.includes("process_variables_keep_legacy"),
    "la edición debía poder conservar el formato heredado sin pérdida"
  );
});

if (failures > 0) {
  console.error(`\n${failures} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones de variables de proceso pasaron.");
