/**
 * Trazaloop · PE-06C2 · Que Producción no salga con la configuración de Staging.
 *
 * POR QUÉ EXISTE
 *
 * Los valores `NEXT_PUBLIC_*` se incrustan AL CONSTRUIR. Preview y Producción
 * son el mismo proyecto de Vercel con dos destinos, así que promover una
 * construcción de Preview a Producción publicaría una aplicación que apunta a la
 * base de Staging. No es una hipótesis: es lo que pasaría, y desde fuera no se
 * nota hasta que alguien mira datos que no son los suyos.
 *
 * Este guion abre el artefacto ya construido y comprueba contra qué proyecto
 * quedó incrustado. Si no es el que se esperaba, falla.
 *
 * Correr:  npx tsx scripts/release/pe06/verify-build-target.ts --expect=<ref>
 *          npm run verify:build-target -- --expect=mvmpadeixomwkpxbnhky
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Los proyectos conocidos, para poder decir QUÉ se encontró y no solo que falla. */
const CONOCIDOS: Record<string, string> = {
  mvmpadeixomwkpxbnhky: "trazaloop-production",
  __local__: "stack LOCAL de desarrollo",
  qchzkxbnbqeyuxinipln: "trazaloop-staging-qa",
  dtrxxqmdweykzncfmahc: "trazaloop-staging (PAUSADO · legado)",
  sadoqnynjwfrxcaupzkk: "extrusion-diagnostic-db (ajeno)",
};

const arg = (n: string) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");

const esperado = arg("expect") ?? process.env.EXPECTED_SUPABASE_PROJECT_REF ?? "";
const raiz = arg("dir") ?? ".next";

function salir(codigo: number, mensaje: string): never {
  console.log(mensaje);
  process.exit(codigo);
}

if (!esperado) {
  salir(2, "BLOQUEADO · falta --expect=<ref del proyecto>. Sin saber qué se "
         + "esperaba, comprobar no significa nada.");
}
if (!existsSync(raiz)) {
  salir(2, `BLOQUEADO · no hay artefacto en «${raiz}». Construye antes de comprobar.`);
}

/** Recorre el artefacto buscando referencias de proyecto incrustadas. */
function referencias(dir: string, encontradas = new Map<string, number>()): Map<string, number> {
  for (const e of readdirSync(dir)) {
    if (e === "cache") continue;                       // no es lo que se publica
    const ruta = join(dir, e);
    const st = statSync(ruta);
    if (st.isDirectory()) { referencias(ruta, encontradas); continue; }
    if (!/\.(js|json|html|txt|map|rsc)$/.test(e)) continue;
    let texto: string;
    try { texto = readFileSync(ruta, "utf8"); } catch { continue; }
    // Cualquier destino de Supabase que haya quedado dentro: el de un proyecto
    // gestionado, o el del stack local. Los dos son «no es Producción».
    for (const m of texto.matchAll(/https?:\/\/([a-z]{20})\.supabase\.co/g)) {
      encontradas.set(m[1], (encontradas.get(m[1]) ?? 0) + 1);
    }
    for (const m of texto.matchAll(/http:\/\/(127\.0\.0\.1|localhost):54321/g)) {
      encontradas.set("__local__", (encontradas.get("__local__") ?? 0) + 1);
    }
  }
  return encontradas;
}

const halladas = referencias(raiz);
const nombre = (r: string) => CONOCIDOS[r] ?? "proyecto DESCONOCIDO";

console.log(`Artefacto: ${raiz}`);
console.log(`Se esperaba: ${esperado} · ${nombre(esperado)}`);
if (halladas.size === 0) {
  console.log("Incrustado: ninguna referencia de Supabase.");
} else {
  for (const [ref, n] of [...halladas].sort((a, b) => b[1] - a[1])) {
    console.log(`Incrustado: ${ref} · ${nombre(ref)} · ${n} apariciones`);
  }
}

const ajenas = [...halladas.keys()].filter((r) => r !== esperado);
if (ajenas.length > 0) {
  salir(1, `\nBLOQUEADO · el artefacto apunta a ${ajenas.map((r) => `${r} (${nombre(r)})`).join(", ")}.\n`
         + "Una construcción de Preview NO se promueve a Producción: se construye "
         + "con destino producción y se vuelve a comprobar.");
}
if (halladas.size === 0) {
  salir(1, "\nBLOQUEADO · no se encontró ninguna referencia de proyecto en el "
         + "artefacto. O no está construido, o la configuración pública no llegó.");
}
console.log("\nOK · el artefacto apunta solo al proyecto esperado.");
