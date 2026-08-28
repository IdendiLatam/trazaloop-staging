/**
 * Trazaloop · Autoriza una migración nueva en TODAS las listas blancas.
 *
 * POR QUÉ EXISTE
 *
 * Una veintena de suites comprueban, cada una por su cuenta, que no ha
 * aparecido una migración que nadie revisó. Es una buena guarda —así se detecta
 * el fichero colado— pero implica que añadir una migración legítima obliga a
 * tocar veinte listas a mano, y olvidar una deja `test:all` en rojo por un
 * motivo que no tiene nada que ver con lo que se estaba haciendo.
 *
 * El script NO relaja la guarda: sigue habiendo una decisión explícita por
 * migración. Lo que quita es el trabajo de copiar la misma línea veinte veces
 * y la posibilidad de saltarse una.
 *
 * Uso: node scripts/authorize-migration.mjs 0142_lo_que_sea 0143_otra …
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const nuevas = process.argv.slice(2).map((n) => (n.endsWith(".sql") ? n : `${n}.sql`));
if (nuevas.length === 0) {
  console.error("Uso: node scripts/authorize-migration.mjs <fichero de migración>…");
  process.exit(1);
}

const existentes = new Set(readdirSync(join(ROOT, "supabase/migrations")));
for (const n of nuevas) {
  if (!existentes.has(n)) {
    console.error(`✘ ${n} no existe en supabase/migrations: no se autoriza lo que no está.`);
    process.exit(1);
  }
}

/** El ancla: la última migración autorizada antes de este sprint. */
const ANCLA = '"0141_intelligence_platform_visibility.sql",';

function ficheros(dir) {
  const salida = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const hijo = `${dir}/${e.name}`;
    if (e.isDirectory()) salida.push(...ficheros(hijo));
    else if (e.name.endsWith(".ts")) salida.push(hijo);
  }
  return salida;
}

let tocados = 0;
for (const f of ficheros("tests")) {
  const ruta = join(ROOT, f);
  let src = readFileSync(ruta, "utf8");
  if (!src.includes(ANCLA)) continue;
  let cambiado = false;
  for (const n of nuevas) {
    if (src.includes(`"${n}"`)) continue;      // ya autorizada
    // Se inserta DETRÁS del ancla, conservando su sangría.
    //
    // Y SOLO cuando el ancla es una entrada PURA de lista, es decir, cuando
    // ocupa la línea entera. La primera versión de este script usó una
    // búsqueda de subcadena y metió el nombre dentro de un `assert(...)` que
    // también mencionaba la 0141, convirtiéndolo en una llamada de tres
    // argumentos que compilaba y no comprobaba nada.
    const lineas = src.split("\n");
    const salida = [];
    for (const linea of lineas) {
      salida.push(linea);
      if (linea.trim() === ANCLA) {
        const sangria = linea.slice(0, linea.length - linea.trimStart().length);
        salida.push(`${sangria}"${n}",`);
      }
    }
    src = salida.join("\n");
    cambiado = true;
  }
  if (cambiado) { writeFileSync(ruta, src); tocados += 1; console.log(`  ✔ ${f}`); }
}
console.log(`\n${tocados} lista(s) actualizada(s) con: ${nuevas.join(", ")}\n`);
