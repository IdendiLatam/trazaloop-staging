/**
 * Trazaloop · Sprint 5A · Test unitario de escapado CSV (sin BD).
 * La exportación de la matriz de evidencias usa toCsv: debe escapar
 * comillas, comas y saltos de línea, y el roundtrip con parseCsv debe
 * devolver los valores originales.
 */
import { toCsv, parseCsv } from "../../lib/csv";

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
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

console.log("Trazaloop · escapado CSV de exportaciones\n");

check("comas se encierran en comillas", () => {
  assert(toCsv([["a,b", "c"]]) === '"a,b",c', `fue: ${toCsv([["a,b", "c"]])}`);
});

check("comillas se duplican y se encierran", () => {
  assert(toCsv([['Evidencia "origen"', "x"]]) === '"Evidencia ""origen""",x',
    `fue: ${toCsv([['Evidencia "origen"', "x"]])}`);
});

check("saltos de línea se encierran en comillas", () => {
  const out = toCsv([["línea 1\nlínea 2", "x"]]);
  assert(out === '"línea 1\nlínea 2",x', `fue: ${out}`);
});

check("roundtrip toCsv → parseCsv conserva valores con comas, comillas y saltos", () => {
  const rows = [
    ["evidence_title", "linked_entity_label"],
    ['Certificado de "origen", lote 7', "Proveedor A,\ncon salto"],
    ["simple", "también simple"],
  ];
  const parsed = parseCsv(toCsv(rows));
  assert(JSON.stringify(parsed) === JSON.stringify(rows),
    `roundtrip alterado: ${JSON.stringify(parsed)}`);
});

check("valores vacíos y booleanos serializados quedan intactos", () => {
  const out = toCsv([["", "true", "false"]]);
  assert(out === ",true,false", `fue: ${out}`);
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
