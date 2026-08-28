/**
 * Trazaloop · PCR/TEXTILES PRE-INTEGRATION · Fase 1 · §8
 * REPRODUCCIÓN de «PCR como destino implícito».
 *
 * QUÉ SE PEDÍA
 *
 * El discovery no encontró un solo enlace de Textiles a una ruta PCR, así que
 * el encargo pedía reproducción determinista o el registro honesto de
 * HUMAN_REPORTED_NOT_YET_REPRODUCED. Se reprodujo. Esto lo deja fijado.
 *
 *
 * LO QUE NO ES EL FALLO
 *
 * No es el resolutor. Que `resolveShellModuleForPath` devuelva CPR cuando
 * nadie reclama la ruta es deliberado, está documentado en el registro y ya lo
 * comprueba `textiles-navigation`. Cambiarlo sin más dejaría el shell sin
 * módulo en las pantallas transversales.
 *
 *
 * LO QUE SÍ ES EL FALLO
 *
 * El módulo activo viaja por las pantallas transversales en un parámetro de
 * presentación —`?m=`— y hay pantallas transversales que lo dejan caer. La
 * barra lateral lo pone bien; la pantalla de destino lo pierde en su propio
 * enlace interno. Dos clics:
 *
 *     barra lateral  →  /support?m=textiles     shell Textil, correcto
 *     «Crear ticket» →  /support/new            shell PCR
 *
 * El segundo `href` está escrito a mano. La persona no pidió cambiar de
 * módulo y acaba con el menú de PCR —Catálogos, Evidencias, Trazabilidad— que
 * su empresa no tiene contratado: cada opción la devolverá a /modules.
 *
 * `/team` ya se arregló así en QUALITY-01.2. Faltan las demás.
 *
 *
 * POR QUÉ ESTA SUITE AFIRMA EL COMPORTAMIENTO DE HOY Y NO EL DESEADO
 *
 * Porque una prueba en rojo no documenta: estorba. Esto es un acta de lo que
 * ocurre hoy, y está construida para volverse ruidosa en cuanto se arregle:
 * la lista de pantallas que pierden el módulo se comprueba EXACTA. Cuando
 * PT-03 arregle una, esta prueba falla y obliga a quitarla de la lista.
 *
 * NO SE MODIFICÓ NINGÚN COMPORTAMIENTO PRODUCTIVO PARA ESCRIBIRLA.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveShellModuleForPath,
  moduleAwareHref,
  SHELL_MODULE_PARAM,
} from "@/lib/modules/registry";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

console.log("\nPCR/TEXTILES pre-integración · §8 · reproducción de navegación\n");

/** Pantallas que no pertenecen a ningún módulo y por las que pasa todo el mundo. */
const TRANSVERSALES = [
  "/team", "/support", "/support/new", "/support/abc",
  "/settings/profile", "/settings/company", "/modules", "/select-org",
];

check("A1. Sin el parámetro, TODA ruta transversal resuelve PCR", () => {
  for (const p of TRANSVERSALES) {
    const k = resolveShellModuleForPath(p, null).key;
    assert(k === "cpr", `${p} resolvió ${k}, se esperaba el defecto cpr`);
  }
});

check("A2. Con el parámetro, la misma ruta conserva el módulo de origen", () => {
  for (const p of TRANSVERSALES) {
    assert(resolveShellModuleForPath(p, "textiles").key === "textiles", `${p} perdió Textiles`);
    assert(resolveShellModuleForPath(p, "quality").key === "quality", `${p} perdió Quality`);
  }
});

check("A3. El parámetro es de PRESENTACIÓN: la ruta de un módulo siempre manda", () => {
  // Es lo que impide que ?m= secuestre una pantalla ajena. Debe seguir así.
  assert(resolveShellModuleForPath("/textiles/evidences", "quality").key === "textiles",
    "?m=quality no puede secuestrar una pantalla de Textiles");
  assert(resolveShellModuleForPath("/dashboard", "quality").key === "cpr",
    "?m=quality no puede disfrazar una pantalla de PCR");
});

check("A4. moduleAwareHref decora el enlace transversal y no toca los demás", () => {
  assert(moduleAwareHref("/support", "textiles") === `/support?${SHELL_MODULE_PARAM}=textiles`,
    "un enlace transversal debía llevar el módulo");
  assert(moduleAwareHref("/support", "cpr") === "/support",
    "CPR es el defecto: su URL queda limpia");
  assert(moduleAwareHref("/textiles/evidences", "textiles") === "/textiles/evidences",
    "una ruta que ya declara su módulo no se decora");
});

/**
 * EL ACTA. Cada línea es una pantalla transversal que enlaza a otra pantalla
 * transversal con un `href` literal, perdiendo el módulo activo.
 *
 * PT-03 · Al arreglar una, BORRA su línea. Esta prueba falla si la lista no
 * coincide exactamente, en cualquiera de los dos sentidos.
 */
const PIERDEN_EL_MODULO = [
  "app/(app)/(shell)/support/page.tsx",
  "app/(app)/(shell)/support/new/page.tsx",
  "app/(app)/(shell)/support/[id]/page.tsx",
  "app/(app)/(shell)/settings/company/page.tsx",
  "app/(app)/settings/profile/page.tsx",
  "app/(app)/modules/page.tsx",
];

/** La única transversal ya corregida (QUALITY-01.2). Sirve de patrón. */
const YA_CORREGIDAS = ["app/(app)/(shell)/team/page.tsx"];

check("B1. El acta de pantallas que pierden el módulo es exacta", () => {
  for (const f of PIERDEN_EL_MODULO) {
    const src = read(f);
    assert(!src.includes("moduleAwareHref"),
      `${f} ya usa moduleAwareHref: bórralo del acta`);
    assert(/href="\//.test(src),
      `${f} ya no tiene enlaces literales: bórralo del acta`);
  }
});

check("B2. /team sigue conservando el módulo (el patrón a replicar)", () => {
  for (const f of YA_CORREGIDAS) {
    const src = read(f);
    assert(src.includes("moduleAwareHref"), `${f} perdió la corrección de QUALITY-01.2`);
    assert(src.includes("SHELL_MODULE_PARAM"), `${f} debía leer el módulo de la URL`);
  }
});

check("B3. La barra lateral sí decora sus enlaces transversales", () => {
  const nav = read("components/layout/nav.tsx");
  assert(nav.includes("moduleAwareHref"), "la navegación debía decorar sus enlaces");
  assert(nav.includes("SHELL_MODULE_PARAM"), "la navegación debía leer el módulo de la URL");
});

/**
 * La cadena concreta, escrita como la vive una persona. Es la prueba que PT-03
 * tendrá que invertir: hoy afirma la pérdida, mañana afirmará su ausencia.
 */
check("C1. REPRODUCCIÓN · Textiles → /support → «Crear ticket» → shell PCR", () => {
  const desdeLaBarra = moduleAwareHref("/support", "textiles");
  assert(resolveShellModuleForPath("/support", "textiles").key === "textiles",
    "el primer salto conserva Textiles");
  assert(desdeLaBarra.includes(`${SHELL_MODULE_PARAM}=textiles`), "la barra lateral marca el módulo");

  // El enlace interno de esa pantalla, tal y como está escrito hoy.
  const src = read("app/(app)/(shell)/support/page.tsx");
  assert(src.includes('href="/support/new"'),
    "se esperaba el href literal que provoca la pérdida");

  // Y el destino, sin parámetro, cae en PCR.
  assert(resolveShellModuleForPath("/support/new", null).key === "cpr",
    "el segundo salto debía caer en el shell de PCR");
});

check("C2. Ninguna transversal aparece como prefijo de un módulo", () => {
  // Si mañana alguien 'arregla' esto declarando /support como ruta de PCR, la
  // pérdida dejaría de ser visible sin haberse resuelto. Queda prohibido.
  for (const p of TRANSVERSALES) {
    const conTextil = resolveShellModuleForPath(p, "textiles").key;
    assert(conTextil === "textiles",
      `${p} dejó de ser transversal: ahora la reclama ${conTextil}`);
  }
});

console.log(`\n  ${passed} comprobaciones correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
