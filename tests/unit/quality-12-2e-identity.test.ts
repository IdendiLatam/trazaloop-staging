/**
 * Trazaloop · QUALITY-12.2E · La identidad visible, comprobada.
 *
 * ESTE SPRINT NO CAMBIA COMPORTAMIENTO, Y ESO ES LO DIFÍCIL DE PROBAR
 *
 * Un renombrado parece inofensivo hasta que abre una capacidad, rompe un
 * identificador persistido o deja media pantalla hablando del nombre viejo.
 * Así que esta suite comprueba las dos mitades:
 *
 *   LO QUE TIENE QUE HABER CAMBIADO   el nombre que ve una persona;
 *   LO QUE NO PUEDE HABER CAMBIADO    tablas, variables de entorno, rutas,
 *                                     `use_case`, plantillas y permisos.
 *
 * La segunda mitad es la que evita que un sprint futuro «termine el trabajo»
 * con una migración masiva que no hace falta.
 *
 * Y el guard de cadenas distingue el RUNTIME de la DOCUMENTACIÓN. Los
 * documentos de QUALITY-12 y 12.1 tienen que poder decir «Copilot»: es como se
 * llamaba, y reescribirlos sería falsificar la historia del proyecto para que
 * combine con una etiqueta nueva.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  INTELLIGENCE_PRODUCT_NAME, INTELLIGENCE_SHORT_NAME, INTELLIGENCE_ACTIONS,
  INTELLIGENCE_SETTINGS_TITLE, INTELLIGENCE_SUGGESTIONS_TITLE,
  INTELLIGENCE_NOT_AVAILABLE, KNOWN_USE_CASES, useCaseLabel,
} from "../../lib/domain/intelligence-identity";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const stripComments = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
   .replace(/\/\*[\s\S]*?\*\//g, "")
   .replace(/^\s*\/\/.*$/gm, "");
/** Aplana literales partidos en varias líneas, o las comprobaciones dependen
 *  de dónde el formateador decidiera cortar la frase. */
const flat = (s: string) =>
  s.replace(/`\s*\n\s*\+ "/g, "").replace(/"\s*\n\s*\+ "/g, "")
   .replace(/"\s*\n\s*\+ `/g, "").replace(/\s+/g, " ");

const NAV = read("lib/modules/registry.ts");
const PAGINA = read("app/(app)/(shell)/quality/copilot/page.tsx");
const PANEL = read("components/domain/quality/copilot/copilot.tsx");
const ADMIN = read("components/domain/quality/copilot/admin.tsx");
const BOTON = read("components/domain/quality/copilot/ask-button.tsx");
const QUICK = read("components/domain/documents/quick-edit.tsx");
const REVIEW = read("components/domain/documents/contextual-review.tsx");
const DOMINIO = read("lib/domain/quality-ai.ts");
const IDENT = read("lib/domain/intelligence-identity.ts");

console.log("\nQUALITY-12.2E · Trazaloop Intelligence, identidad visible\n");

// ===========================================================================
console.log("A · LA IDENTIDAD ESTÁ EN UN SOLO SITIO");
// ===========================================================================

check("A1. nombre largo y corto, congelados", () => {
  assert(INTELLIGENCE_PRODUCT_NAME === "Trazaloop Intelligence",
    `nombre largo: ${INTELLIGENCE_PRODUCT_NAME}`);
  assert(INTELLIGENCE_SHORT_NAME === "Intelligence",
    `nombre corto: ${INTELLIGENCE_SHORT_NAME}`);
});

check("A2. las tres acciones, con las palabras acordadas", () => {
  assert(INTELLIGENCE_ACTIONS.ask === "Preguntar a Intelligence", INTELLIGENCE_ACTIONS.ask);
  assert(INTELLIGENCE_ACTIONS.improve === "Mejorar con Intelligence", INTELLIGENCE_ACTIONS.improve);
  assert(INTELLIGENCE_ACTIONS.review === "Revisar con Intelligence", INTELLIGENCE_ACTIONS.review);
});

check("A3. ajustes y propuestas", () => {
  assert(INTELLIGENCE_SETTINGS_TITLE === "Ajustes de Intelligence", INTELLIGENCE_SETTINGS_TITLE);
  assert(INTELLIGENCE_SUGGESTIONS_TITLE === "Propuestas de Intelligence",
    INTELLIGENCE_SUGGESTIONS_TITLE);
});

check("A4. la identidad NO es server-only: la usan las pantallas", () => {
  assert(!/^import "server-only"/m.test(IDENT),
    "el módulo de identidad es server-only y los componentes no podrán importarlo");
});

// ===========================================================================
console.log("\nB · NAVEGACIÓN");
// ===========================================================================

check("B1. el grupo de navegación usa el nombre CORTO", () => {
  const grupo = /QUALITY_COPILOT_GROUP[\s\S]*?\n};/.exec(NAV)?.[0] ?? "";
  assert(/title: INTELLIGENCE_SHORT_NAME/.test(grupo), "el título no sale de la identidad");
  assert(/label: INTELLIGENCE_SHORT_NAME/.test(grupo), "la etiqueta no sale de la identidad");
  assert(!/"Copilot"/.test(grupo), "queda «Copilot» literal en la navegación");
});

check("B2. la navegación NO dice «Quality Intelligence»", () => {
  // Nació en Quality y hoy funciona también en PCR, Textiles y documentos.
  assert(!/Quality Intelligence/i.test(stripComments(NAV)),
    "la navegación ata Intelligence a un módulo");
});

check("B3. el nombre corto cabe en una barra lateral", () => {
  assert(INTELLIGENCE_SHORT_NAME.length <= 14,
    `«${INTELLIGENCE_SHORT_NAME}» tiene ${INTELLIGENCE_SHORT_NAME.length} caracteres`);
  // Se ensancha el tipo a propósito: TypeScript sabe el valor literal de hoy y
  // daría la comparación por imposible, pero lo que se vigila es que MAÑANA
  // nadie lo cambie a «IA».
  const corto: string = INTELLIGENCE_SHORT_NAME;
  assert(corto !== "IA" && corto !== "AI",
    "el nombre corto describe la tecnología, no el producto");
});

// ===========================================================================
console.log("\nC · LA PÁGINA GLOBAL");
// ===========================================================================

check("C1. título y encabezado salen de la identidad", () => {
  assert(/metadata = \{ title: INTELLIGENCE_PRODUCT_NAME \}/.test(PAGINA),
    "el título de la pestaña sigue escrito a mano");
  assert(/\{INTELLIGENCE_PRODUCT_NAME\}/.test(PAGINA), "el encabezado no usa el nombre largo");
  assert(/\{INTELLIGENCE_SHORT_NAME\}/.test(PAGINA), "el h1 no usa el nombre corto");
});

check("C2. no queda «Copilot» visible en la página", () => {
  const codigo = stripComments(PAGINA);
  assert(!/>[^<]*Copilot[^<]*</.test(codigo), "queda texto visible con «Copilot»");
  assert(!/"[^"]*Copilot de Calidad[^"]*"/.test(codigo), "queda el título antiguo");
});

check("C3. la acción principal es «Preguntar a Intelligence»", () => {
  assert(/INTELLIGENCE_ACTIONS\.ask/.test(PANEL), "el botón no usa la acción de la identidad");
  assert(!/"Preguntar al Copilot"/.test(stripComments(PANEL)), "queda la etiqueta antigua");
  assert(/INTELLIGENCE_ACTIONS\.ask/.test(BOTON),
    "el botón repartido por Quality no usa la identidad");
});

// ===========================================================================
console.log("\nD · LAS DOS CAPACIDADES DOCUMENTALES");
// ===========================================================================

check("D1. Quick Edit dice «Mejorar con Intelligence»", () => {
  assert(/INTELLIGENCE_ACTIONS\.improve/.test(QUICK), "no usa la acción de la identidad");
});

check("D2. Contextual Review dice «Revisar con Intelligence»", () => {
  assert(/INTELLIGENCE_ACTIONS\.review/.test(REVIEW), "no usa la acción de la identidad");
  assert(!/Revisar consistencia/.test(stripComments(REVIEW)), "queda la etiqueta antigua");
});

check("D3. y siguen siendo DOS cosas distintas", () => {
  // Cambiar el nombre no puede fundir los dos flujos ni sugerir que hacen lo
  // mismo: mejorar mira el texto, revisar lo contrasta con la base.
  const mejorar: string = INTELLIGENCE_ACTIONS.improve;
  const revisar: string = INTELLIGENCE_ACTIONS.review;
  assert(mejorar !== revisar, "las dos acciones se llaman igual");
  assert(/Compara tu texto con lo registrado/.test(REVIEW),
    "la revisión ya no explica qué la diferencia");
  assert(/mejora lo que ya está escrito/.test(flat(QUICK)),
    "la mejora ya no explica qué la diferencia");
});

check("D4. no se antropomorfiza ni se promete infalibilidad", () => {
  const visible = flat(stripComments(QUICK)) + flat(stripComments(REVIEW))
    + flat(stripComments(PANEL));
  for (const frase of [
    /Intelligence sabe/i, /Intelligence entiende/i, /Intelligence garantiza/i,
    /Intelligence piensa/i, /Pensando…/,
  ]) {
    assert(!frase.test(visible), `hay copy que antropomorfiza o promete: ${frase}`);
  }
});

// ===========================================================================
console.log("\nE · AJUSTES Y PROPUESTAS");
// ===========================================================================

check("E1. los títulos salen de la identidad", () => {
  assert(/\{INTELLIGENCE_SETTINGS_TITLE\}/.test(ADMIN), "los ajustes siguen escritos a mano");
  assert(/\{INTELLIGENCE_SUGGESTIONS_TITLE\}/.test(ADMIN), "las propuestas siguen escritas a mano");
});

check("E2. no queda «Copilot» visible en los ajustes", () => {
  const codigo = stripComments(ADMIN);
  assert(!/>[^<]*Copilot[^<]*</.test(codigo), "queda texto visible con «Copilot»");
  assert(!/"Copilot encendido"/.test(codigo), "queda la etiqueta antigua de la casilla");
});

// ===========================================================================
console.log("\nF · LO QUE NO SE TOCA · ESPACIO TÉCNICO");
// ===========================================================================

check("F1. las variables de entorno siguen llamándose igual", () => {
  const cfg = read("lib/ai/config.ts");
  for (const v of ["QUALITY_AI_PROVIDER", "QUALITY_AI_MODEL", "QUALITY_AI_API_KEY",
                   "QUALITY_AI_REASONING_EFFORT"]) {
    assert(cfg.includes(v), `se renombró ${v}`);
  }
});

check("F2. las tablas y funciones de la base siguen igual", () => {
  const mig = read("supabase/migrations/0139_document_contextual_review.sql");
  assert(/quality_ai_runs/.test(mig), "se tocó el espacio de nombres de la base");
  // Y no hay migración nueva SOLO por el renombrado.
  const migraciones = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql")).sort();
  assert(migraciones[migraciones.length - 1] === "0139_document_contextual_review.sql",
    `se creó una migración por un cambio de etiqueta: ${migraciones[migraciones.length - 1]}`);
});

check("F3. los `use_case` persistidos NO se renombran", () => {
  // Un run de hace tres meses con `copilot.ask` sigue siendo esa consulta.
  // Reescribirlo sería falsificar el registro para que combine con la etiqueta.
  for (const uc of ["copilot.ask", "document.quick_edit", "document.contextual_review",
                    "customer_themes", "root_cause"]) {
    assert(KNOWN_USE_CASES.includes(uc), `la presentación no sabe traducir ${uc}`);
  }
  const prompts = read("lib/ai/prompts.ts");
  assert(/name: "copilot\.ask"/.test(prompts), "se renombró la plantilla copilot.ask");
  assert(/name: "copilot\.customer_themes"/.test(prompts), "se renombró una plantilla histórica");
});

check("F4. la traducción vive en la presentación, no en la base", () => {
  assert(useCaseLabel("copilot.ask") === "Pregunta a Intelligence",
    useCaseLabel("copilot.ask"));
  assert(useCaseLabel("document.contextual_review") === "Revisión contextual",
    useCaseLabel("document.contextual_review"));
  // Un identificador desconocido se devuelve tal cual: inventarle un nombre
  // bonito escondería que apareció uno nuevo.
  assert(useCaseLabel("algo.nuevo") === "algo.nuevo", "un caso desconocido se disfraza");
});

check("F5. las rutas no cambian por una etiqueta", () => {
  assert(/href: "\/quality\/copilot"/.test(NAV), "se cambió la ruta por branding");
  assert(/\/quality\/copilot/.test(BOTON), "el botón apunta a otra ruta");
});

check("F6. el prompt del proveedor no se toca", () => {
  // Cambiarlo alteraría el comportamiento y rompería el versionado, que es
  // justo lo que este sprint promete no hacer.
  const prompts = read("lib/ai/prompts.ts");
  assert(/Eres el Copilot de Trazaloop Quality/.test(prompts),
    "se cambió la política enviada al modelo: eso es comportamiento, no identidad");
});

// ===========================================================================
console.log("\nG · PERMISOS Y PLANES, INTACTOS");
// ===========================================================================

check("G1. un renombrado no abre una capacidad", () => {
  const acciones = read("server/actions/quality-ai.ts");
  assert(/requireQuality|gate\(|guard/i.test(acciones), "la acción perdió su puerta");
  const revision = read("server/actions/document-review.ts");
  assert(/requireActiveOrg/.test(revision), "la revisión perdió su comprobación de empresa");
  assert(/MODULO_COMERCIAL/.test(revision), "la revisión perdió la traducción de módulo");
});

check("G2. Demo, Full y Extra siguen decidiéndose en la base", () => {
  const mig = read("supabase/migrations/0139_document_contextual_review.sql");
  assert(/not in \('full', 'extra'\)/.test(mig), "cambió la regla de planes");
  assert(/reason', 'demo'/.test(mig), "Demo dejó de distinguirse");
});

check("G3. no se ha inventado un plan de IA", () => {
  const registro = stripComments(read("lib/modules/registry.ts"));
  for (const inventado of [/plan de Intelligence/i, /Intelligence Plan/i,
                           /Premium AI/i, /plan de IA/i]) {
    assert(!inventado.test(registro), `aparece un plan comercial nuevo: ${inventado}`);
  }
});

// ===========================================================================
console.log("\nH · EL GUARD DE CADENAS VISIBLES");
// ===========================================================================

const IGNORAR = new Set(["node_modules", ".git", ".next", "dist", "build",
  "coverage", ".vercel", "docs", "supabase", "tests", "scripts"]);

function fuentes(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(join(ROOT, dir))) {
    if (IGNORAR.has(n) || n.startsWith(".")) continue;
    const rel = dir === "." ? n : `${dir}/${n}`;
    let st; try { st = statSync(join(ROOT, rel)); } catch { continue; }
    if (st.isDirectory()) fuentes(rel, acc);
    else if (/\.(ts|tsx)$/.test(n)) acc.push(rel);
  }
  return acc;
}

/** Solo cadenas y texto de JSX: los identificadores no los ve nadie. */
const LITERAL = /"([^"\\\n]{3,}?)"|`([^`\\$\n]{3,}?)`|>[ \t]*([^<>{}\n][^<>{}\n]{2,}?)[ \t]*</g;
const VIEJO = /\bcopilot\b|\bcopiloto\b|asistente ia|ai assistant|asistente de calidad/i;

check("H1. ninguna cadena VISIBLE del runtime dice «Copilot»", () => {
  const culpables: string[] = [];
  for (const f of [...fuentes("app"), ...fuentes("components"),
                   ...fuentes("lib"), ...fuentes("server")]) {
    const codigo = stripComments(read(f));
    for (const m of codigo.matchAll(LITERAL)) {
      const t = (m[1] ?? m[2] ?? m[3] ?? "").trim();
      if (!VIEJO.test(t)) continue;
      // Rutas, imports e identificadores del DOM no son texto visible.
      if (t.startsWith("/") || t.startsWith("@/") || t.startsWith("copilot-")) continue;
      if (/^copilot\.[a-z_]+$/.test(t)) continue;                 // plantillas
      if (/^Eres el Copilot de Trazaloop Quality/.test(t)) continue; // el prompt
      culpables.push(`${f}: «${t.slice(0, 80)}»`);
    }
  }
  assert(culpables.length === 0,
    `cadenas visibles con la identidad antigua:\n      ${culpables.join("\n      ")}`);
});

check("H2. pero la DOCUMENTACIÓN histórica puede seguir diciéndolo", () => {
  // No se reescribe la historia del proyecto para que combine con el nombre
  // nuevo. QUALITY-12 se llamó Copilot y sus documentos lo dicen.
  const doce = read("docs/quality/quality-12/QUALITY_12_ARCHITECTURE.md");
  assert(/copilot/i.test(doce),
    "se reescribió la documentación histórica: eso es falsificar el registro");
});

check("H3. el guard distingue de verdad runtime y documentación", () => {
  // Si el guard mirase también `docs/`, H2 y H1 no podrían ser ciertas a la vez.
  assert(IGNORAR.has("docs"), "el guard mira la documentación");
  assert(IGNORAR.has("tests"), "el guard mira las pruebas");
});

// ===========================================================================
console.log("\nI · MENSAJES DE ESTADO");
// ===========================================================================

check("I1. sin proveedor NO se enseña el nombre de una variable", () => {
  assert(!/QUALITY_AI_API_KEY|QUALITY_AI_PROVIDER/.test(INTELLIGENCE_NOT_AVAILABLE),
    "el mensaje enseña el nombre de una variable de entorno");
  const visible = stripComments(QUICK) + stripComments(REVIEW) + stripComments(PANEL);
  for (const v of ["QUALITY_AI_API_KEY", "QUALITY_AI_PROVIDER", "QUALITY_AI_MODEL"]) {
    assert(!visible.includes(v), `${v} aparece en una pantalla`);
  }
});

check("I2. los errores hablan de la acción, no de la marca", () => {
  const quick = flat(stripComments(read("lib/intelligence/document-authoring/quick-edit.ts")));
  assert(/no está configurada en este entorno/.test(quick), "cambió el fail-safe");
  const review = flat(stripComments(read("lib/intelligence/document-review/contextual-review.ts")));
  assert(/no está configurada en este entorno/.test(review), "cambió el fail-safe");
});

check("I3. la filosofía sigue visible: propone, decide la persona", () => {
  assert(/Sigues teniendo que guardar/.test(flat(QUICK)),
    "Quick Edit ya no dice que hay que guardar");
  assert(/ha cambiado el documento/.test(flat(REVIEW)),
    "la revisión ya no dice que no cambió nada");
  assert(/no es una auditoría ni una no conformidad/.test(flat(REVIEW)),
    "la revisión ya no aclara qué NO es");
});

check("I4. los textos del dominio usan la identidad", () => {
  assert(/INTELLIGENCE_SHORT_NAME/.test(DOMINIO), "los textos del dominio no la usan");
  assert(!/El Copilot no aprende/.test(DOMINIO), "queda el texto antiguo");
});

console.log(`\n${passed} conformes · ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
