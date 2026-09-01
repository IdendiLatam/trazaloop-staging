/**
 * Trazaloop · PE-03B4 · LA COBERTURA, VIGILADA POR UNA PRUEBA.
 *
 * POR QUÉ ESTA SUITE ES LA MÁS IMPORTANTE DEL TRAMO
 *
 * El encargo dice una frase que no se puede cumplir con una lista escrita a
 * mano: «una pestaña nueva del programa debe hacer fallar las pruebas de
 * cobertura hasta que su tutorial esté registrado o excluido a propósito».
 *
 * Una lista a mano se queda vieja el día que alguien añade una pantalla, y
 * nadie se entera hasta que un cliente pregunta por qué esa no tiene vídeo.
 * Así que esto NO comprueba una lista contra otra lista: enumera las páginas
 * REALES del repositorio —`app/**\/page.tsx`— y exige que cada una esté en el
 * registro o en las exclusiones.
 *
 * Correr: npm run test:pe03b4-coverage
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  PAGE_KEYS, PAGE_KEY_EXCLUSIONS, PAGE_KEY_MODULES, REGISTERED_ROUTES,
  resolvePageKeyForPath, isWellFormedPageKey, isExcludedRoute,
} from "../../lib/modules/page-keys";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

// ---------------------------------------------------------------------------
// La verdad del repositorio: qué pantallas existen de verdad.
// ---------------------------------------------------------------------------

/**
 * Recorre `app/` y devuelve la dirección REAL de cada página.
 *
 * Los grupos de rutas de Next —`(app)`, `(shell)`, `(cpr)`— organizan ficheros
 * y NO aparecen en la URL, así que se quitan. Es el detalle que convierte una
 * comprobación de rutas en una comprobación de carpetas si se olvida.
 */
function rutasDelRepositorio(dir = "app", prefijo = ""): string[] {
  const fuera: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (!statSync(ruta).isDirectory()) {
      if (nombre === "page.tsx") fuera.push(prefijo === "" ? "/" : prefijo);
      continue;
    }
    // Un grupo de rutas no añade segmento.
    const esGrupo = nombre.startsWith("(") && nombre.endsWith(")");
    fuera.push(...rutasDelRepositorio(ruta, esGrupo ? prefijo : `${prefijo}/${nombre}`));
  }
  return fuera;
}

const RUTAS = rutasDelRepositorio().sort();
const REGISTRADAS = new Set(REGISTERED_ROUTES);

console.log("\nPE-03B4 · Cobertura completa de pantallas\n");

// ===========================================================================
console.log("A · Ninguna pantalla se queda sin clasificar");
// ===========================================================================

check("A1. Cada página del repositorio está registrada o excluida", () => {
  const huerfanas = RUTAS.filter((r) => !REGISTRADAS.has(r) && !isExcludedRoute(r));
  assert(huerfanas.length === 0,
    `${huerfanas.length} pantallas sin clasificar:\n      ${huerfanas.join("\n      ")}`);
});

check("A2. Y ninguna clasificación apunta a una pantalla que ya no existe", () => {
  const reales = new Set(RUTAS);
  const fantasmas = [...REGISTRADAS].filter((r) => !reales.has(r));
  assert(fantasmas.length === 0, `rutas registradas que no existen: ${fantasmas.join(", ")}`);
  const excluidasFantasma = PAGE_KEY_EXCLUSIONS
    .map((e) => e.route).filter((r) => !reales.has(r));
  assert(excluidasFantasma.length === 0,
    `rutas excluidas que no existen: ${excluidasFantasma.join(", ")}`);
});

check("A3. Nada está a la vez registrado y excluido", () => {
  const dobles = [...REGISTRADAS].filter((r) => isExcludedRoute(r));
  assert(dobles.length === 0, `rutas en las dos listas: ${dobles.join(", ")}`);
});

check("A4. Toda exclusión dice POR QUÉ", () => {
  for (const e of PAGE_KEY_EXCLUSIONS) {
    assert(e.reason.trim().length >= 10, `«${e.route}» se excluye sin motivo escrito`);
    assert(!/^(no|n\/a|—|-)$/i.test(e.reason.trim()), `«${e.route}» tiene un motivo vacío`);
  }
});

check("A5. Y el registro creció de verdad · once no era una primera ola", () => {
  // PE-02B4 abrió el registro con once entradas. El propietario del producto
  // pidió el producto entero. Esta comprobación no es un número bonito: si
  // alguien recorta el registro, aquí se ve.
  assert(PAGE_KEYS.length > 100,
    `el registro tiene ${PAGE_KEYS.length} entradas; se esperaban más de cien`);
});

// ===========================================================================
console.log("\nB · Los tres módulos, completos");
// ===========================================================================

for (const [modulo, prefijo] of [
  ["quality", "/quality"], ["textiles", "/textiles"],
] as [string, string][]) {
  check(`B. Cada pantalla de ${modulo} está registrada o excluida`, () => {
    const suyas = RUTAS.filter((r) => r === prefijo || r.startsWith(`${prefijo}/`));
    assert(suyas.length > 0, `no se encontró ninguna pantalla de ${modulo}`);
    const fuera = suyas.filter((r) => !REGISTRADAS.has(r) && !isExcludedRoute(r));
    assert(fuera.length === 0, `${modulo} deja fuera: ${fuera.join(", ")}`);
    // Y las que sí están, pertenecen a su módulo.
    for (const e of PAGE_KEYS.filter((p) => suyas.includes(p.route))) {
      assert(e.module === modulo, `«${e.key}» dice ser de «${e.module}»`);
    }
  });
}

check("B. Cada pantalla de PCR está registrada o excluida", () => {
  // PCR es el módulo por defecto del shell: sus rutas no comparten prefijo.
  // Se identifican por las que el registro le atribuye, y se comprueba que
  // ninguna pantalla de sus zonas se quedó fuera.
  const ZONAS = ["/dashboard", "/guided-flow", "/onboarding", "/diagnostic", "/catalog",
    "/evidences", "/traceability", "/recycled-content", "/audit-support", "/audit-prep",
    "/implementation", "/imports", "/trazadocs"];
  const suyas = RUTAS.filter((r) => ZONAS.some((z) => r === z || r.startsWith(`${z}/`)));
  assert(suyas.length > 20, `solo se encontraron ${suyas.length} pantallas de PCR`);
  const fuera = suyas.filter((r) => !REGISTRADAS.has(r) && !isExcludedRoute(r));
  assert(fuera.length === 0, `PCR deja fuera: ${fuera.join(", ")}`);
});

check("B4. Y cada módulo tiene una cobertura real, no simbólica", () => {
  for (const m of ["quality", "cpr", "textiles"]) {
    const n = PAGE_KEYS.filter((p) => p.module === m).length;
    assert(n >= 10, `«${m}» solo tiene ${n} pantallas registradas`);
  }
});

// ===========================================================================
console.log("\nC · Una clave por TIPO de pantalla, no por registro");
// ===========================================================================

check("C1. Ninguna clave lleva un identificador dentro", () => {
  for (const e of PAGE_KEYS) {
    assert(!/[0-9a-f]{8}-[0-9a-f]{4}/.test(e.key), `«${e.key}» lleva un uuid`);
    assert(!/\[|\]/.test(e.key), `«${e.key}» lleva un parámetro de ruta`);
  }
});

check("C2. Dos registros distintos de la misma pantalla dan la MISMA clave", () => {
  const a = resolvePageKeyForPath("/quality/processes/11111111-1111-4111-8111-111111111111");
  const b = resolvePageKeyForPath("/quality/processes/22222222-2222-4222-8222-222222222222");
  assert(a === b && a === "quality.processes.detail",
    `dos procesos distintos dan «${a}» y «${b}»`);
});

check("C3. Y toda clave está bien formada, con un módulo conocido", () => {
  for (const e of PAGE_KEYS) {
    assert(isWellFormedPageKey(e.key), `«${e.key}» está mal formada`);
    assert(PAGE_KEY_MODULES.includes(e.module), `«${e.key}» usa el módulo «${e.module}»`);
    assert(e.key.startsWith(`${e.module}.`), `«${e.key}» no empieza por su módulo`);
  }
});

check("C4. Sin claves repetidas, y sin etiquetas repetidas", () => {
  const claves = PAGE_KEYS.map((p) => p.key);
  assert(new Set(claves).size === claves.length, "hay claves repetidas");
  const etiquetas = PAGE_KEYS.map((p) => p.label);
  const repes = etiquetas.filter((l, i) => etiquetas.indexOf(l) !== i);
  assert(repes.length === 0, `etiquetas repetidas: ${[...new Set(repes)].join(", ")}`);
});

// ===========================================================================
console.log("\nD · Las pestañas que comparten dirección");
// ===========================================================================

check("D1. Se resuelven a claves distintas, no a la misma", () => {
  const riesgos = resolvePageKeyForPath("/quality/risks");
  const oportunidades = resolvePageKeyForPath("/quality/risks", { vista: "oportunidades" });
  // Se compara ANTES de afirmar cada valor: `assert` estrecha el tipo a la
  // cadena literal, y después TypeScript ve dos literales distintas y avisa de
  // que la comparación sobra. Tiene razón sobre los tipos y no sobre la
  // intención — lo que hay que comprobar es que en EJECUCIÓN son distintas.
  assert(riesgos !== oportunidades, "las dos pestañas comparten tutorial");
  assert(riesgos === "quality.risks", `riesgos resolvió a «${riesgos}»`);
  assert(oportunidades === "quality.risks.opportunities",
    `oportunidades resolvió a «${oportunidades}»`);

  const materiales = resolvePageKeyForPath("/traceability/inventory");
  const productos = resolvePageKeyForPath("/traceability/inventory", { vista: "productos" });
  assert(materiales !== productos, "las dos pestañas del inventario comparten tutorial");
  assert(materiales === "cpr.traceability.inventory", `materiales resolvió a «${materiales}»`);
  assert(productos === "cpr.traceability.inventory.products",
    `producto terminado resolvió a «${productos}»`);
});

check("D2. Un parámetro desconocido cae en la vista por defecto", () => {
  const r = resolvePageKeyForPath("/quality/risks", { vista: "loquesea" });
  assert(r === "quality.risks", `un valor raro resolvió a «${r}»`);
});

check("D3. Y funciona igual con URLSearchParams que con un objeto", () => {
  const a = resolvePageKeyForPath("/quality/risks", new URLSearchParams("vista=oportunidades"));
  const b = resolvePageKeyForPath("/quality/risks", { vista: "oportunidades" });
  assert(a === b && a === "quality.risks.opportunities", `«${a}» frente a «${b}»`);
});

check("D4. No se inventó una ruta falsa para poder distinguirlas", () => {
  // La alternativa barata habría sido registrar `/quality/risks/opportunities`
  // como si fuera una pantalla. No existe, y el producto no se movió para
  // acomodar la ayuda.
  const conPestana = PAGE_KEYS.filter((p) => p.subview);
  assert(conPestana.length === 2, `hay ${conPestana.length} pestañas declaradas, se esperaban 2`);
  for (const p of conPestana) {
    assert(REGISTERED_ROUTES.includes(p.route), `«${p.key}» apunta a una ruta que no existe`);
    const defecto = PAGE_KEYS.find((o) => o.route === p.route && !o.subview);
    assert(defecto, `«${p.key}» no tiene vista por defecto en la misma ruta`);
  }
});

check("D5. Y no nació una segunda familia de claves", () => {
  // El registro sigue siendo UNO. Si alguien crea `tutorial_page_key` o un
  // segundo registro paralelo, esto no lo ve — pero sí ve lo que sí se puede
  // ver desde aquí: que las claves de tutorial son estas.
  const conMayusculas = PAGE_KEYS.filter((p) => /[A-Z]/.test(p.key));
  assert(conMayusculas.length === 0, "hay claves con mayúsculas: otro vocabulario");
});

// ===========================================================================
console.log("\nE · La más específica gana");
// ===========================================================================

check("E1. Una ficha nunca hereda el tutorial de su listado", () => {
  const pares: [string, string][] = [
    ["/quality/processes", "/quality/processes/abc"],
    ["/quality/cases", "/quality/cases/abc"],
    ["/quality/audits", "/quality/audits/abc"],
    ["/quality/suppliers", "/quality/suppliers/abc"],
    ["/textiles/passports", "/textiles/passports/abc"],
    ["/textiles/products", "/textiles/products/abc"],
    ["/imports", "/imports/abc"],
  ];
  for (const [listado, ficha] of pares) {
    const a = resolvePageKeyForPath(listado);
    const b = resolvePageKeyForPath(ficha);
    assert(a && b, `«${listado}» o «${ficha}» no resuelven`);
    assert(a !== b, `«${ficha}» hereda el tutorial de «${listado}»`);
  }
});

check("E2. Una ruta literal gana a una con parámetro de la misma longitud", () => {
  // `/quality/audits/list` es literal y `/quality/audits/[auditId]` casa con
  // cualquier cosa. Las dos tienen tres segmentos.
  const r = resolvePageKeyForPath("/quality/audits/list");
  assert(r === "quality.audits.list", `«/quality/audits/list» resolvió a «${r}»`);
  const p = resolvePageKeyForPath("/quality/audits/programs");
  assert(p === "quality.audits.programs", `«/quality/audits/programs» resolvió a «${p}»`);
});

check("E3. Cada pantalla registrada resuelve a SU clave", () => {
  const mal: string[] = [];
  for (const e of PAGE_KEYS) {
    const prueba = e.route.replace(/\[[^\]]+\]/g, "b1e3c0de-0000-4000-8000-000000000000");
    const params = e.subview ? { [e.subview.param]: e.subview.value } : undefined;
    if (resolvePageKeyForPath(prueba, params) !== e.key) mal.push(e.key);
  }
  assert(mal.length === 0, `no resuelven a su clave: ${mal.join(", ")}`);
});

check("E4. Y una pantalla excluida no resuelve a nada", () => {
  for (const e of PAGE_KEY_EXCLUSIONS) {
    const prueba = e.route.replace(/\[[^\]]+\]/g, "b1e3c0de-0000-4000-8000-000000000000");
    const r = resolvePageKeyForPath(prueba);
    assert(r === null, `«${e.route}» está excluida y resolvió a «${r}»`);
  }
});

check("E5. Una dirección inventada tampoco · y eso no es un fallo", () => {
  for (const r of ["/quality/no-existe", "/inventado", "/textiles/a/b/c/d"]) {
    assert(resolvePageKeyForPath(r) === null, `«${r}» resolvió a algo`);
  }
});

// ===========================================================================
console.log("\nF · Las once de PE-02B4 siguen siendo las mismas");
// ===========================================================================

check("F1. Ninguna clave anterior cambió de nombre", () => {
  // Cambiar una clave existente rompería su tutorial, su ayuda contextual y su
  // historia de publicación. Crecer no puede costar eso.
  const ORIGINALES = [
    "quality.context.interested_parties", "quality.processes", "quality.processes.detail",
    "quality.risks", "quality.indicators", "quality.documents", "quality.cases",
    "cpr.recycled_content", "cpr.traceability.inventory",
    "textiles.passports", "platform.modules",
  ];
  const claves = new Set(PAGE_KEYS.map((p) => p.key));
  for (const k of ORIGINALES) assert(claves.has(k), `desapareció la clave «${k}»`);
  assert(ORIGINALES.length === 11, "la lista histórica dejó de tener once");
});

check("F2. Y siguen apuntando a la misma dirección", () => {
  const esperado: Record<string, string> = {
    "quality.processes": "/quality/processes",
    "quality.processes.detail": "/quality/processes/[processId]",
    "quality.risks": "/quality/risks",
    "cpr.recycled_content": "/recycled-content",
    "cpr.traceability.inventory": "/traceability/inventory",
    "textiles.passports": "/textiles/passports",
    "platform.modules": "/modules",
  };
  for (const [k, ruta] of Object.entries(esperado)) {
    const e = PAGE_KEYS.find((p) => p.key === k);
    assert(e?.route === ruta, `«${k}» apunta a «${e?.route}» y no a «${ruta}»`);
  }
});

console.log(`\nPE-03B4 · cobertura: ${passed} en verde, ${failed} en rojo\n`);
console.log(`  · pantallas en el repositorio: ${RUTAS.length}`);
console.log(`  · registradas: ${REGISTERED_ROUTES.length} (${PAGE_KEYS.length} claves)`);
console.log(`  · excluidas a propósito: ${PAGE_KEY_EXCLUSIONS.length}`);
process.exit(failed === 0 ? 0 : 1);
