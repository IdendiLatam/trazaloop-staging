/**
 * Trazaloop · PE-03B5 · La cobertura, recontada desde el repositorio.
 *
 * POR QUÉ SE VUELVE A CONTAR
 *
 * El encargo de cierre da unos números —152 claves, 37 exclusiones, 187
 * páginas— y dice: «no los creas a ciegas; recalcula desde el repositorio real
 * e informa de lo que salga».
 *
 * Es la instrucción correcta. Un cierre que confirma sus propios números
 * leyéndolos de un documento no comprueba nada: comprueba que sabe copiar.
 *
 * Así que esta suite no importa ninguna cifra de ningún sitio. Recorre `app/`,
 * cuenta, y compara el resultado con lo que el registro dice de sí mismo.
 *
 * Correr: npm run test:pe03b5-coverage
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  PAGE_KEYS, PAGE_KEY_EXCLUSIONS, REGISTERED_ROUTES, PAGE_KEY_MODULES,
  resolvePageKeyForPath, isExcludedRoute, isWellFormedPageKey, isKnownPageKey,
  exclusionReason,
} from "../../lib/modules/page-keys";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

function rutasDelRepositorio(dir = "app", prefijo = ""): string[] {
  const fuera: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (!statSync(ruta).isDirectory()) {
      if (nombre === "page.tsx") fuera.push(prefijo === "" ? "/" : prefijo);
      continue;
    }
    const esGrupo = nombre.startsWith("(") && nombre.endsWith(")");
    fuera.push(...rutasDelRepositorio(ruta, esGrupo ? prefijo : `${prefijo}/${nombre}`));
  }
  return fuera;
}

const RUTAS = rutasDelRepositorio().sort();
const REGISTRADAS = new Set(REGISTERED_ROUTES);
const porModulo = (m: string) => PAGE_KEYS.filter((p) => p.module === m).length;

console.log("\nPE-03B5 · Cobertura, recontada\n");
console.log(`  páginas en el repositorio ............ ${RUTAS.length}`);
console.log(`  rutas registradas .................... ${REGISTERED_ROUTES.length}`);
console.log(`  claves de tutorial ................... ${PAGE_KEYS.length}`);
console.log(`  exclusiones con motivo ............... ${PAGE_KEY_EXCLUSIONS.length}`);
console.log(`  quality / cpr / textiles / platform .. ${porModulo("quality")} / `
  + `${porModulo("cpr")} / ${porModulo("textiles")} / ${porModulo("platform")}\n`);

// ===========================================================================
console.log("A · El invariante: cada pantalla, exactamente en un sitio");
// ===========================================================================

check("A1. Ninguna pantalla del repositorio queda sin clasificar", () => {
  const huerfanas = RUTAS.filter((r) => !REGISTRADAS.has(r) && !isExcludedRoute(r));
  assert(huerfanas.length === 0,
    `${huerfanas.length} sin clasificar:\n      ${huerfanas.join("\n      ")}`);
});

check("A2. Ninguna está en las dos listas", () => {
  const dobles = RUTAS.filter((r) => REGISTRADAS.has(r) && isExcludedRoute(r));
  assert(dobles.length === 0, `en las dos listas: ${dobles.join(", ")}`);
});

check("A3. Y las cuentas cierran · registradas + excluidas = páginas", () => {
  assert(REGISTERED_ROUTES.length + PAGE_KEY_EXCLUSIONS.length === RUTAS.length,
    `${REGISTERED_ROUTES.length} + ${PAGE_KEY_EXCLUSIONS.length} `
    + `≠ ${RUTAS.length}: hay una pantalla contada dos veces o ninguna`);
});

check("A4. La suma por módulo es el total de claves", () => {
  const suma = PAGE_KEY_MODULES.reduce((a, m) => a + porModulo(m), 0);
  assert(suma === PAGE_KEYS.length,
    `la suma por módulo (${suma}) no es el total (${PAGE_KEYS.length})`);
});

// ===========================================================================
console.log("\nB · Nada apunta al vacío");
// ===========================================================================

check("B1. Ninguna clave apunta a una pantalla que ya no existe", () => {
  const reales = new Set(RUTAS);
  const fantasmas = PAGE_KEYS.filter((p) => !reales.has(p.route)).map((p) => p.key);
  assert(fantasmas.length === 0, `claves sin pantalla: ${fantasmas.join(", ")}`);
});

check("B2. Ni ninguna exclusión", () => {
  const reales = new Set(RUTAS);
  const fantasmas = PAGE_KEY_EXCLUSIONS.filter((e) => !reales.has(e.route)).map((e) => e.route);
  assert(fantasmas.length === 0, `exclusiones sin pantalla: ${fantasmas.join(", ")}`);
});

check("B3. Y toda exclusión sigue diciendo por qué", () => {
  for (const e of PAGE_KEY_EXCLUSIONS) {
    const motivo = exclusionReason(e.route);
    assert(motivo && motivo.trim().length >= 10, `«${e.route}» sin motivo útil`);
  }
});

// ===========================================================================
console.log("\nC · Unicidad de claves");
// ===========================================================================

check("C1. Ninguna clave repetida", () => {
  const k = PAGE_KEYS.map((p) => p.key);
  const repes = k.filter((x, i) => k.indexOf(x) !== i);
  assert(repes.length === 0, `repetidas: ${[...new Set(repes)].join(", ")}`);
});

check("C2. Ninguna pantalla con dos claves · salvo las pestañas declaradas", () => {
  const porRuta = new Map<string, string[]>();
  for (const p of PAGE_KEYS) {
    porRuta.set(p.route, [...(porRuta.get(p.route) ?? []), p.key]);
  }
  for (const [ruta, claves] of porRuta) {
    if (claves.length === 1) continue;
    // Una ruta con varias claves solo se admite si todas menos una declaran
    // pestaña: la que no la declara es la vista por defecto.
    const entradas = PAGE_KEYS.filter((p) => p.route === ruta);
    const porDefecto = entradas.filter((p) => !p.subview);
    assert(porDefecto.length === 1,
      `«${ruta}» tiene ${porDefecto.length} vistas por defecto: ${claves.join(", ")}`);
    const pestanas = entradas.filter((p) => p.subview);
    const valores = pestanas.map((p) => `${p.subview!.param}=${p.subview!.value}`);
    assert(new Set(valores).size === valores.length,
      `«${ruta}» tiene dos pestañas con el mismo parámetro`);
  }
});

check("C3. Ningún alias por errata · dos claves a una letra de distancia", () => {
  const k = [...PAGE_KEYS.map((p) => p.key)].sort();
  for (let i = 1; i < k.length; i += 1) {
    const a = k[i - 1], b = k[i];
    if (a.length !== b.length) continue;
    let d = 0;
    for (let j = 0; j < a.length; j += 1) if (a[j] !== b[j]) d += 1;
    assert(d !== 1, `«${a}» y «${b}» se diferencian en una letra: ¿errata?`);
  }
});

check("C4. Toda clave empieza por su módulo, y el módulo existe", () => {
  for (const p of PAGE_KEYS) {
    assert(isWellFormedPageKey(p.key), `«${p.key}» está mal formada`);
    assert(p.key.startsWith(`${p.module}.`), `«${p.key}» no empieza por «${p.module}»`);
    assert(PAGE_KEY_MODULES.includes(p.module), `módulo desconocido: «${p.module}»`);
  }
});

check("C5. Sin colisiones entre módulos · una ruta pertenece a UN módulo", () => {
  const dueño = new Map<string, string>();
  for (const p of PAGE_KEYS) {
    const previo = dueño.get(p.route);
    assert(!previo || previo === p.module,
      `«${p.route}» la reclaman «${previo}» y «${p.module}»`);
    dueño.set(p.route, p.module);
  }
});

check("C6. Y no hay recaída al módulo por defecto", () => {
  // PCR era el módulo por defecto del shell y esa comodidad escondía olvidos.
  // Ninguna ruta de Quality o Textiles puede haber caído en `cpr`.
  for (const p of PAGE_KEYS) {
    if (p.route.startsWith("/quality")) assert(p.module === "quality", `«${p.key}» es cpr`);
    if (p.route.startsWith("/textiles")) assert(p.module === "textiles", `«${p.key}» es cpr`);
  }
});

// ===========================================================================
console.log("\nD · Rutas dinámicas · el registro no es la identidad");
// ===========================================================================

check("D1. Dos registros de la misma pantalla dan la misma clave · los tres módulos", () => {
  const casos: [string, string, string][] = [
    ["/quality/processes/AAA", "/quality/processes/BBB", "quality.processes.detail"],
    ["/quality/cases/AAA", "/quality/cases/BBB", "quality.cases.detail"],
    ["/traceability/production-orders/AAA", "/traceability/production-orders/BBB",
      "cpr.traceability.production_orders.detail"],
    ["/imports/AAA", "/imports/BBB", "cpr.imports.detail"],
    ["/textiles/passports/AAA", "/textiles/passports/BBB", "textiles.passports.detail"],
    ["/textiles/products/AAA", "/textiles/products/BBB", "textiles.products.detail"],
  ];
  for (const [a, b, esperada] of casos) {
    const ka = resolvePageKeyForPath(a), kb = resolvePageKeyForPath(b);
    assert(ka === kb, `«${a}» y «${b}» dan claves distintas`);
    assert(ka === esperada, `dieron «${ka}» y se esperaba «${esperada}»`);
  }
});

check("D2. Un identificador nunca se convierte en identidad de tutorial", () => {
  const uuid = "9f8c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
  for (const ruta of [`/quality/processes/${uuid}`, `/textiles/passports/${uuid}`]) {
    const k = resolvePageKeyForPath(ruta);
    assert(k && !k.includes(uuid), `«${k}» lleva el identificador dentro`);
    assert(isKnownPageKey(k!), `«${k}» no está en el registro`);
  }
});

check("D3. Una ficha anidada resuelve a su propia clave", () => {
  const k = resolvePageKeyForPath("/quality/suppliers/AAA/sites/BBB");
  assert(k === "quality.suppliers.sites.detail", `resolvió a «${k}»`);
  const p = resolvePageKeyForPath("/quality/people/AAA/onboarding/BBB");
  assert(p === "quality.people.onboarding", `resolvió a «${p}»`);
});

// ===========================================================================
console.log("\nE · Pestañas en la misma dirección");
// ===========================================================================

check("E1. Las dos conocidas siguen resolviendo por separado", () => {
  const pares: [string, string, string, string][] = [
    ["/quality/risks", "vista", "oportunidades", "quality.risks.opportunities"],
    ["/traceability/inventory", "vista", "productos", "cpr.traceability.inventory.products"],
  ];
  for (const [ruta, param, valor, clave] of pares) {
    const conPestana = resolvePageKeyForPath(ruta, { [param]: valor });
    const porDefecto = resolvePageKeyForPath(ruta);
    assert(conPestana !== porDefecto, `«${ruta}» da la misma clave con y sin pestaña`);
    assert(conPestana === clave, `«${ruta}?${param}=${valor}» dio «${conPestana}»`);
  }
});

check("E2. Y no hay ninguna pestaña declarada de más", () => {
  const conPestana = PAGE_KEYS.filter((p) => p.subview);
  assert(conPestana.length === 2,
    `hay ${conPestana.length} pestañas declaradas: ${conPestana.map((p) => p.key).join(", ")}`);
  for (const p of conPestana) {
    assert(p.subview!.param === "vista",
      `«${p.key}» usa el parámetro «${p.subview!.param}» y el producto usa «vista»`);
  }
});

check("E3. Un filtro NO se confunde con una pestaña", () => {
  // `?q=`, `?edit=`, `?page=`, `?version=` eligen un registro o filtran una
  // lista: no cambian de superficie funcional y no merecen clave propia.
  for (const params of [{ q: "algo" }, { edit: "AAA" }, { page: "3" }, { version: "AAA" }]) {
    const k = resolvePageKeyForPath("/quality/documents", params);
    assert(k === "quality.documents", `un filtro cambió la clave a «${k}»`);
  }
});

// ===========================================================================
console.log("\nF · Gana la más específica, siempre");
// ===========================================================================

check("F1. La ficha nunca hereda el tutorial de su listado", () => {
  const pares: [string, string][] = [
    ["/quality/processes", "/quality/processes/AAA"],
    ["/quality/indicators", "/quality/indicators/AAA"],
    ["/quality/objectives", "/quality/objectives/AAA"],
    ["/quality/management-review", "/quality/management-review/AAA"],
    ["/quality/automation/rules", "/quality/automation/rules/AAA"],
    ["/textiles/circularity/assessments", "/textiles/circularity/assessments/AAA"],
    ["/audit-prep/dossiers", "/audit-prep/dossiers/AAA"],
  ];
  for (const [listado, ficha] of pares) {
    const a = resolvePageKeyForPath(listado), b = resolvePageKeyForPath(ficha);
    assert(a && b, `«${listado}» o «${ficha}» no resuelven`);
    assert(a !== b, `«${ficha}» hereda el tutorial de «${listado}»`);
  }
});

check("F2. Una ruta literal gana a una con parámetro", () => {
  // `/textiles/circularity/assessments/new` es literal y compite con
  // `/textiles/circularity/assessments/[id]`. Si ganara la del comodín, la
  // pantalla de crear recibiría el tutorial de la ficha.
  const casos: [string, string][] = [
    ["/textiles/circularity/assessments/new", "textiles.circularity.assessments.new"],
    ["/textiles/passports/new", "textiles.passports.new"],
    ["/textiles/evidences/new", "textiles.evidences.new"],
    ["/quality/audits/list", "quality.audits.list"],
    ["/quality/risks/methodology", "quality.risks.methodology"],
    ["/trazadocs/new", "cpr.trazadocs.new"],
    ["/trazadocs/master", "cpr.trazadocs.master"],
    ["/support/new", "platform.support.new"],
  ];
  for (const [ruta, esperada] of casos) {
    const k = resolvePageKeyForPath(ruta);
    assert(k === esperada, `«${ruta}» resolvió a «${k}» y no a «${esperada}»`);
  }
});

check("F3. Cada una de las claves resuelve a sí misma", () => {
  const mal: string[] = [];
  for (const p of PAGE_KEYS) {
    const concreta = p.route.replace(/\[[^\]]+\]/g, "AAA");
    const params = p.subview ? { [p.subview.param]: p.subview.value } : undefined;
    if (resolvePageKeyForPath(concreta, params) !== p.key) mal.push(p.key);
  }
  assert(mal.length === 0, `no resuelven a su clave: ${mal.join(", ")}`);
});

check("F4. Y una excluida no resuelve a nada", () => {
  for (const e of PAGE_KEY_EXCLUSIONS) {
    const concreta = e.route.replace(/\[[^\]]+\]/g, "AAA");
    const k = resolvePageKeyForPath(concreta);
    assert(k === null, `«${e.route}» está excluida y resolvió a «${k}»`);
  }
});

// ===========================================================================
console.log("\nG · Las etiquetas son para personas");
// ===========================================================================

check("G1. Ninguna etiqueta parece una ruta, un slug o una clave", () => {
  for (const p of PAGE_KEYS) {
    assert(!p.label.includes("/quality") && !p.label.includes("/textiles"),
      `«${p.key}» tiene una ruta por etiqueta: «${p.label}»`);
    assert(!/_/.test(p.label), `«${p.key}» tiene guion bajo en la etiqueta: «${p.label}»`);
    assert(!/\[|\]/.test(p.label), `«${p.key}» tiene un parámetro en la etiqueta`);
    assert(p.label !== p.key, `«${p.key}» usa su clave como etiqueta`);
    assert(/^[A-ZÁÉÍÓÚÑ]/.test(p.label), `«${p.key}» tiene etiqueta en minúscula: «${p.label}»`);
    assert(p.label.length >= 5, `«${p.key}» tiene etiqueta demasiado corta`);
  }
});

check("G2. Y ninguna repite la nomenclatura retirada por RH-01.3", () => {
  // «orden de producción» y «lote de salida» se renombraron. Una etiqueta que
  // los use haría convivir dos vocabularios en la misma consola.
  for (const p of PAGE_KEYS) {
    assert(!/lote de salida|orden de producci[óo]n/i.test(p.label),
      `«${p.key}» usa la nomenclatura retirada: «${p.label}»`);
  }
});

check("G3. Sin etiquetas repetidas · dos pantallas distintas se distinguen", () => {
  const l = PAGE_KEYS.map((p) => p.label);
  const repes = l.filter((x, i) => l.indexOf(x) !== i);
  assert(repes.length === 0, `etiquetas repetidas: ${[...new Set(repes)].join(", ")}`);
});

console.log(`\nPE-03B5 · cobertura: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
