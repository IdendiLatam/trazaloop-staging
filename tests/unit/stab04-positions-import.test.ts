import { readFileSync } from "node:fs";
import {
  POSITIONS_TEMPLATE, POSITIONS_HEADER, POSITIONS_REQUIRED,
  POSITIONS_FORBIDDEN_HEADERS, POSITIONS_TEMPLATE_VERSION, LIMITES,
  dictaminar, plantillaCsv, pareceFormula, celdaSegura,
} from "../../lib/imports/positions";
import { parseCsv } from "../../lib/csv";
import { normalizarIdentidad } from "../../lib/domain/identidad-normalizada";

/**
 * Trazaloop · STABILIZATION-04 · Las reglas del importador de cargos, en puro.
 *
 * Todo lo que se comprueba aquí es lógica sin base de datos: la plantilla, el
 * dictamen fila a fila, los duplicados, la jerarquía y los ciclos. Se puede
 * ejercitar entero y en un segundo, que es justamente por lo que esa lógica vive
 * separada del formato de entrada.
 *
 * Correr: npm run test:stab04
 */

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const fila = (codigo: string, nombre: string, superior = "", extra: Record<string, string> = {}) =>
  ({ codigo, nombre_cargo: nombre, cargo_superior: superior, ...extra });

console.log("\nSTABILIZATION-04 · el importador de cargos\n");

// ===========================================================================
console.log("A · La plantilla");
// ===========================================================================

check("1. Tiene versión y las columnas mínimas", () => {
  assert(POSITIONS_TEMPLATE_VERSION === "cargos-v1", `versión: ${POSITIONS_TEMPLATE_VERSION}`);
  assert(POSITIONS_REQUIRED.includes("codigo") && POSITIONS_REQUIRED.includes("nombre_cargo"),
    `obligatorias: ${POSITIONS_REQUIRED.join(", ")}`);
  assert(POSITIONS_HEADER.includes("cargo_superior"), "no se puede expresar la jerarquía");
  // V1 NO importa competencias: es alcance declarado, no un olvido.
  for (const prohibida of ["competencias", "formacion", "experiencia", "persona"]) {
    assert(!POSITIONS_HEADER.includes(prohibida), `la plantilla trae ${prohibida}`);
  }
  for (const c of POSITIONS_TEMPLATE) {
    assert(c.description.length > 10, `«${c.key}» no explica qué es`);
  }
});

check("2. El archivo NUNCA gobierna la empresa ni los identificadores internos", () => {
  for (const p of ["organization_id", "id", "created_by", "parent_position_id", "normalized_name"]) {
    assert(POSITIONS_FORBIDDEN_HEADERS.includes(p), `${p} no está prohibida`);
    assert(!POSITIONS_HEADER.includes(p), `${p} está en la plantilla`);
  }
});

check("3. La plantilla descargable se abre bien en una hoja de cálculo", () => {
  const csv = plantillaCsv();
  assert(csv.startsWith("﻿"), "sin BOM: Excel rompería las tildes y la ñ");
  assert(csv.includes("\r\n"), "sin CRLF");
  const filas = parseCsv(csv);
  assert(JSON.stringify(filas[0]) === JSON.stringify(POSITIONS_HEADER),
    `encabezado: ${filas[0]?.join(",")}`);
  // Y el ejemplo enseña la jerarquía, que es lo que nadie adivina solo.
  const cuerpo = filas.slice(1).filter((f) => f.some((c) => c.trim() !== ""));
  assert(cuerpo.length >= 3, `el ejemplo trae ${cuerpo.length} filas`);
  assert(cuerpo.some((f) => f[2] !== ""), "ninguna fila del ejemplo depende de otra");
  assert(csv.includes("Coordinación"), "el ejemplo no ejercita los acentos");
});

check("4. Y no se convierte ella misma en el problema de quien la abra", () => {
  assert(pareceFormula("=1+1") && pareceFormula("+A1") && pareceFormula("-2") && pareceFormula("@SUM"),
    "no reconoce los arranques que una hoja de cálculo interpreta");
  assert(celdaSegura("=1+1").startsWith("'"), "al escribir no se neutraliza la fórmula");
  assert(celdaSegura('con "comillas"').startsWith('"'), "no se escapan las comillas");
  assert(celdaSegura("con,coma").startsWith('"'), "no se escapa la coma");
  assert(!plantillaCsv().split("\r\n").some((l) => /^[=+@]/.test(l)),
    "alguna línea de la plantilla arranca como fórmula");
});

// ===========================================================================
console.log("\nB · El dictamen fila a fila");
// ===========================================================================

check("5. Un archivo bueno sale entero válido", () => {
  const v = dictaminar([
    fila("DIR", "Dirección General"),
    fila("COORD", "Coordinación de Calidad", "DIR"),
    fila("ANL", "Analista de Calidad", "COORD"),
  ]);
  assert(v.total === 3 && v.validas === 3 && v.errores === 0, JSON.stringify(v));
  assert(v.relaciones.length === 2, `relaciones: ${v.relaciones.length}`);
  assert(v.filas[0].fila === 2, "la numeración no cuenta el encabezado");
});

check("6. Falta un campo obligatorio", () => {
  const v = dictaminar([fila("", "Sin código"), fila("X", "")]);
  assert(v.errores === 2, JSON.stringify(v.filas));
  assert(v.filas[0].errores.some((e) => e.includes("código")), v.filas[0].errores.join(" "));
  assert(v.filas[1].errores.some((e) => e.includes("nombre")), v.filas[1].errores.join(" "));
});

check("7. Un campo demasiado largo", () => {
  const v = dictaminar([fila("A", "x".repeat(LIMITES.largoCampo + 1))]);
  assert(v.errores === 1 && v.filas[0].errores.some((e) => e.includes("supera")),
    JSON.stringify(v.filas[0]));
});

check("8. Una celda con forma de fórmula se rechaza", () => {
  const v = dictaminar([fila("A", "=1+1"), fila("B", "Normal", "", { unidad: "@SUM(A1)" })]);
  assert(v.filas[0].estado === "error", "aceptó un nombre con forma de fórmula");
  assert(v.filas[1].estado === "error", "aceptó una unidad con forma de fórmula");
  assert(v.filas[0].errores.some((e) => e.includes("fórmula")), v.filas[0].errores.join(" "));
});

// ===========================================================================
console.log("\nC · Duplicados");
// ===========================================================================

check("9. Mayúsculas, espacios y acentos son el mismo cargo", () => {
  const v = dictaminar([
    fila("A", "Director de Calidad"),
    fila("B", "director de calidad"),
    fila("C", "  Director   de Calidad  "),
    fila("D", "Diréctor de Calidad"),
  ]);
  assert(v.errores === 3, `esperaba 3 choques y hubo ${v.errores}`);
  for (const i of [1, 2, 3]) {
    assert(v.filas[i].errores.some((e) => e.includes("fila 2")),
      `la fila ${i + 2} no señala contra cuál choca: ${v.filas[i].errores.join(" ")}`);
  }
});

check("10. Contra los cargos que YA existen en la empresa", () => {
  const v = dictaminar([fila("A", "  DIRECTOR   de calidad ")], {
    nombresNormalizados: [normalizarIdentidad("Director de Calidad")], codigos: [],
  });
  assert(v.errores === 1, JSON.stringify(v.filas[0]));
  assert(v.filas[0].errores.some((e) => e.includes("CARGO_DUPLICADO")),
    v.filas[0].errores.join(" "));
});

check("11. Y los códigos tampoco se repiten", () => {
  const enArchivo = dictaminar([fila("DIR", "Uno"), fila("dir", "Dos")]);
  assert(enArchivo.errores === 1 && enArchivo.filas[1].errores.some((e) => e.includes("código")),
    JSON.stringify(enArchivo.filas[1]));
  const contraBase = dictaminar([fila("DIR", "Otro")], {
    nombresNormalizados: [], codigos: ["dir"],
  });
  assert(contraBase.filas[0].errores.some((e) => e.includes("CODIGO_DUPLICADO")),
    JSON.stringify(contraBase.filas[0]));
});

// ===========================================================================
console.log("\nD · Jerarquía y ciclos");
// ===========================================================================

check("12. El orden de las filas NO importa", () => {
  const v = dictaminar([
    fila("ANL", "Analista", "COORD"),
    fila("DIR", "Dirección"),
    fila("COORD", "Coordinación", "DIR"),
  ]);
  assert(v.errores === 0, JSON.stringify(v.filas.filter((f) => f.estado === "error")));
  assert(v.relaciones.length === 2, `relaciones: ${JSON.stringify(v.relaciones)}`);
});

check("13. Un superior que no está en el archivo", () => {
  const v = dictaminar([fila("A", "Uno", "NO_EXISTE")]);
  assert(v.errores === 1 && v.filas[0].errores.some((e) => e.includes("no está en el archivo")),
    JSON.stringify(v.filas[0]));
});

check("14. Autociclo", () => {
  const v = dictaminar([fila("A", "Uno", "A")]);
  assert(v.errores === 1 && v.filas[0].errores.some((e) => e.includes("su propio superior")),
    JSON.stringify(v.filas[0]));
});

check("15. Ciclo A → B → A", () => {
  const v = dictaminar([fila("A", "Uno", "B"), fila("B", "Dos", "A")]);
  assert(v.errores >= 1, "aceptó un ciclo de dos");
  assert(v.filas.some((f) => f.errores.some((e) => e.includes("se cierra sobre sí misma"))),
    JSON.stringify(v.filas));
});

check("16. Ciclo largo A → B → C → A", () => {
  const v = dictaminar([
    fila("A", "Uno", "C"), fila("B", "Dos", "A"), fila("C", "Tres", "B"),
  ]);
  assert(v.errores >= 1, "aceptó un ciclo de tres");
  assert(v.relaciones.length < 3, "propuso relaciones de un grafo con ciclo");
});

check("17. Una cadena larga y recta sí vale", () => {
  const filas = Array.from({ length: 40 }, (_, i) =>
    fila(`C${i}`, `Cargo ${i}`, i === 0 ? "" : `C${i - 1}`));
  const v = dictaminar(filas);
  assert(v.errores === 0, JSON.stringify(v.filas.filter((f) => f.estado === "error").slice(0, 3)));
  assert(v.relaciones.length === 39, `relaciones: ${v.relaciones.length}`);
});

// ===========================================================================
console.log("\nE · El formato no manda");
// ===========================================================================

check("18. Las reglas no saben qué es un CSV", () => {
  const fuente = readFileSync("lib/imports/positions.ts", "utf8");
  for (const rastro of ["parseCsv", "readFile", "File", "supabase", "createServerClient"]) {
    assert(!new RegExp(`\\b${rastro}\\b`).test(fuente.replace(/\/\*[\s\S]*?\*\//g, "")),
      `las reglas dependen de ${rastro}: añadir .xlsx obligaría a reescribirlas`);
  }
  // Reciben filas canónicas y ya: un adaptador de otro formato encaja sin tocar
  // nada de lo que hay aquí.
  const v = dictaminar([{ codigo: "A", nombre_cargo: "Uno" }]);
  assert(v.validas === 1, "no acepta filas canónicas sueltas");
});

check("19. Tildes y ñ sobreviven al viaje por CSV", () => {
  const csv = plantillaCsv();
  const filas = parseCsv(csv);
  const texto = filas.flat().join(" ");
  assert(texto.includes("Coordinación"), "se perdió la tilde");
  const conEne = dictaminar([fila("N", "Jefe de Diseño y Señalización")]);
  assert(conEne.validas === 1 && conEne.filas[0].nombre === "Jefe de Diseño y Señalización",
    `quedó «${conEne.filas[0].nombre}»`);
});

console.log(`\nSTABILIZATION-04 · importador: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
