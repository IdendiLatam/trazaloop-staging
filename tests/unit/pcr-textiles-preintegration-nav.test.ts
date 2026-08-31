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
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  resolveShellModuleForPath,
  moduleAwareHref,
  SHELL_MODULE_PARAM,
  SHELL_MODULES,
  SISTEMA_GROUP,
  type ShellModuleKey,
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

check("A1. Sin el parámetro, ninguna ruta transversal pertenece a un módulo", () => {
  // PE-01B · PE-D3 · Antes esto decía «resuelve PCR», porque PCR era el módulo
  // por defecto del shell. Una URL transversal escrita a mano enseñaba el menú
  // y la identidad de PCR a una empresa que no lo tiene. Ahora resuelven a la
  // superficie neutra: el shell ya no inventa un módulo.
  for (const p of TRANSVERSALES) {
    const k = resolveShellModuleForPath(p, null).key;
    assert(k === "platform", `${p} resolvió ${k}, y no pertenece a ningún módulo`);
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
 * Toda página bajo `(shell)` que no pertenezca a un módulo es TRANSVERSAL:
 * se llega a ella desde cualquier módulo y debe conservar el que traía.
 *
 * Se descubren recorriendo el árbol, no enumerándolas: así una pantalla nueva
 * entra sola en la comprobación.
 */
const SHELL_DIR = "app/(app)/(shell)";
const PREFIJOS_DE_MODULO = ["(cpr)", "textiles", "quality"];

function paginasTransversalesDelShell(): string[] {
  const salida: string[] = [];
  const recorrer = (rel: string) => {
    for (const entrada of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      const hijo = `${rel}/${entrada.name}`;
      if (entrada.isDirectory()) recorrer(hijo);
      else if (entrada.name === "page.tsx") salida.push(hijo);
    }
  };
  for (const entrada of readdirSync(join(ROOT, SHELL_DIR), { withFileTypes: true })) {
    if (!entrada.isDirectory()) continue;
    if (PREFIJOS_DE_MODULO.includes(entrada.name)) continue;
    recorrer(`${SHELL_DIR}/${entrada.name}`);
  }
  return salida.sort();
}

check("B1. Toda pantalla transversal del shell conserva el módulo activo", () => {
  const paginas = paginasTransversalesDelShell();
  assert(paginas.length >= 5, `se esperaban al menos 5 pantallas transversales, hay ${paginas.length}`);
  for (const f of paginas) {
    const src = read(f);
    assert(src.includes("activeShellModuleFrom") || src.includes("resolveShellModuleForPath"),
      `${f} no resuelve el módulo activo: sus enlaces devolverán el shell a PCR`);
    assert(src.includes("moduleAwareHref"),
      `${f} resuelve el módulo pero no decora sus enlaces con moduleAwareHref`);
  }
});

check("B2. Ningún enlace transversal quedó escrito a mano en esas pantallas", () => {
  // Un href literal a otra pantalla transversal es exactamente el fallo.
  const TRANSVERSAL = /href="\/(support|team|settings)(\/[a-z-]+)?"/;
  for (const f of paginasTransversalesDelShell()) {
    const m = TRANSVERSAL.exec(read(f));
    assert(m === null, `${f} conserva el enlace literal ${m?.[0]}`);
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
check("C1. La cadena reproducida en Fase 1 ya no pierde el módulo", () => {
  // Fase 1: barra lateral → /support?m=textiles → «Crear ticket» → shell PCR.
  const desdeLaBarra = moduleAwareHref("/support", "textiles");
  assert(desdeLaBarra.includes(`${SHELL_MODULE_PARAM}=textiles`), "la barra lateral marca el módulo");
  assert(resolveShellModuleForPath("/support", "textiles").key === "textiles",
    "el primer salto conserva Textiles");

  const src = read("app/(app)/(shell)/support/page.tsx");
  assert(!src.includes('href="/support/new"'),
    "el href literal de «Crear ticket» ha vuelto: la cadena se rompe otra vez");
  assert(src.includes('moduleAwareHref("/support/new"'),
    "«Crear ticket» debía decorarse con el módulo activo");

  // El formulario de filtros es un GET: solo envía sus campos. Sin el campo
  // oculto, filtrar perdía el módulo igual que un enlace sin decorar.
  assert(src.includes(`name={SHELL_MODULE_PARAM}`),
    "el formulario de filtros debía arrastrar el módulo en un campo oculto");

  // Y el segundo salto llega ya con el módulo puesto.
  assert(resolveShellModuleForPath("/support/new", "textiles").key === "textiles",
    "el segundo salto debía seguir en Textiles");
});

check("C1b. El salto al ticket recién creado tampoco lo pierde", () => {
  const form = read("components/domain/support/new-support-ticket-form.tsx");
  assert(!form.includes("router.push(`/support/${state.ticketId}?created=1`)"),
    "el salto tras crear el ticket volvía a soltar el módulo");
  assert(form.includes("moduleAwareHref(`/support/${state.ticketId}?created=1`"),
    "el salto debía conservar el módulo");
});

check("C1c. Las pantallas FUERA del shell no necesitan el patrón", () => {
  // /settings/profile, /modules y /select-org no pintan barra lateral: por
  // ahí no puede escaparse ninguna identidad. Que no lleven el patrón es
  // correcto, y esta comprobación impide que alguien se lo añada «por
  // simetría» y luego crea que ahí también había un fallo.
  const fuera = ["app/(app)/settings/profile/page.tsx", "app/(app)/modules/page.tsx",
                 "app/(app)/select-org/page.tsx"];
  const dentro = paginasTransversalesDelShell();
  for (const f of fuera) {
    assert(existsSync(join(ROOT, f)), `${f} no existe: la comprobación quedó obsoleta`);
    assert(!f.startsWith(SHELL_DIR), `${f} está bajo el shell y sí necesitaría el patrón`);
    assert(!dentro.includes(f), `${f} apareció entre las transversales del shell`);
  }
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


// ---------------------------------------------------------------------------
// D · Las cinco combinaciones de módulos contratados
// ---------------------------------------------------------------------------
/**
 * Lo que estas comprobaciones pueden y no pueden demostrar, dicho antes de
 * leerlas: el registro es lógica PURA y no sabe qué tiene contratado nadie.
 * La barrera de entitlement es `requireCprModule()` y ya tiene sus pruebas
 * (`t9f1-module-operational-enforcement`). Lo que se comprueba aquí es lo
 * otro: que NAVEGANDO normalmente no aparezca una ruta de otro módulo.
 *
 * Es la mitad que faltaba. El guard impedía ENTRAR a PCR; no impedía que a
 * una empresa sin PCR se le enseñara el menú de PCR y todas sus opciones
 * la devolvieran al selector.
 */
const COMBINACIONES: Array<{ nombre: string; modulos: ShellModuleKey[] }> = [
  { nombre: "solo Textiles",       modulos: ["textiles"] },
  { nombre: "solo Quality",        modulos: ["quality"] },
  { nombre: "Textiles + Quality",  modulos: ["textiles", "quality"] },
  { nombre: "PCR + Textiles",      modulos: ["cpr", "textiles"] },
  { nombre: "todos",               modulos: ["cpr", "textiles", "quality"] },
];

check("D1. Ningún menú de módulo enlaza a una ruta de otro módulo", () => {
  for (const mod of SHELL_MODULES) {
    const enlaces = [...mod.topLevel, ...mod.groups.flatMap((g) => g.items)];
    for (const l of enlaces) {
      const duenno = resolveShellModuleForPath(l.href, null).key;
      assert(duenno === mod.key,
        `el menú de ${mod.key} enlaza a ${l.href}, que pertenece a ${duenno}`);
    }
  }
});

check("D2. Desde cualquier módulo, toda transversal conserva la identidad", () => {
  for (const { nombre, modulos } of COMBINACIONES) {
    for (const key of modulos) {
      if (key === "cpr") continue;  // CPR no decora: sus enlaces ya son suyos
      for (const p of TRANSVERSALES) {
        const destino = moduleAwareHref(p, key);
        const param = new URLSearchParams(destino.split("?")[1] ?? "").get(SHELL_MODULE_PARAM);
        assert(resolveShellModuleForPath(p, param).key === key,
          `${nombre}: ${p} perdió ${key}`);
      }
    }
  }
});

check("D3. El grupo transversal no contiene ninguna ruta de módulo", () => {
  for (const item of SISTEMA_GROUP.items) {
    assert(resolveShellModuleForPath(item.href, null).key === "platform",
      `«${item.label}» (${item.href}) pertenece a un módulo: no es transversal`);
    // Y por tanto DEBE poder decorarse.
    assert(moduleAwareHref(item.href, "textiles").includes(`${SHELL_MODULE_PARAM}=textiles`),
      `«${item.label}» no admite el módulo: se perdería al pulsarlo`);
  }
});

console.log(`\n  ${passed} comprobaciones correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
