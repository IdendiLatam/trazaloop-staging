/**
 * Trazaloop · QUALITY-13B5 · El microarreglo de presentación.
 *
 * QUÉ ENCONTRÓ UNA PERSONA EN TREINTA SEGUNDOS, Y NINGUNA PRUEBA
 *
 *   1 · «Contexto: Proceso: Gestión Comercial» — el tipo dicho dos veces.
 *   2 · «se consultará … 7 fuentes relacionadas con mirador de proceso» —
 *       «mirador de proceso» es el nombre INTERNO de una pantalla, y el 7 es lo
 *       DISPONIBLE dicho con las palabras de lo usado.
 *   3 · «y el Se ampliará el contexto…» — una frase rota de un pegado anterior.
 *   4 · «Evidencia suficiente» junto a «Sin proveedor de IA configurado» y
 *       «Interpretación de la IA»: la pantalla contaba que un modelo había
 *       intervenido cuando no había ninguno.
 *
 * Ninguna de las cuatro rompía nada funcional, y por eso ninguna suite las vio.
 * Esta existe para que no vuelvan.
 *
 * Correr: npm run test:quality13b5-copy
 */
import { readFileSync } from "node:fs";
import {
  CONTEXT_CARD_TITLE, MODEL_SECTION_TITLE, NO_MODEL_HEADER_TITLE,
  NO_MODEL_SECTION_NOTE, NO_MODEL_SECTION_TITLE, anchorNoun, availableSourceCount,
  contextAnchorNote, splitPinnedLabel, CONTEXT_PLANS, INTEGRATED_CONTEXTS,
} from "../../lib/domain/quality-intelligence";
import { EVIDENCE_LABEL, EVIDENCE_MEANING } from "../../lib/domain/quality-ai";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const leer = (p: string) => readFileSync(p, "utf8");
const PANEL = leer("components/domain/quality/copilot/copilot.tsx");
/** El panel SIN comentarios. Explicar qué se arregló obliga a citar el texto
 *  viejo, y buscarlo dentro de esa explicación pondría en rojo el arreglo. */
const CODIGO = PANEL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** El texto que de verdad se lee en pantalla: lo que hay entre etiquetas, más
 *  las constantes de copy que el panel pinta. */
const VISIBLE = [...PANEL.matchAll(/>([^<>{}]{3,})</g)].map((m) => m[1]).join(" ")
  + " " + [CONTEXT_CARD_TITLE, MODEL_SECTION_TITLE, NO_MODEL_HEADER_TITLE,
           NO_MODEL_SECTION_TITLE, NO_MODEL_SECTION_NOTE,
           ...Object.values(EVIDENCE_LABEL), ...Object.values(EVIDENCE_MEANING),
           ...INTEGRATED_CONTEXTS.map((c) => contextAnchorNote(c))].join(" ");

console.log("\nQUALITY-13B5 · Presentación del contexto\n");

// ===========================================================================
console.log("A · La tarjeta de contexto");
// ===========================================================================

check("A1. El tipo NO se dice dos veces", () => {
  const p = splitPinnedLabel("Proceso: Gestión Comercial");
  assert(p.subject === "Gestión Comercial", `el sujeto quedó como «${p.subject}»`);
  assert(p.kind === "Proceso", `el tipo quedó como «${p.kind}»`);
  // Y el rótulo ya no antepone otro «Contexto:».
  assert(!/Contexto: <\/span>|>Contexto: </.test(CODIGO),
    "la tarjeta sigue anteponiendo «Contexto:» a una etiqueta que ya trae su tipo");
  assert(CONTEXT_CARD_TITLE === "Estás preguntando sobre",
    `el rótulo es «${CONTEXT_CARD_TITLE}»`);
});

check("A2. Una etiqueta sin tipo no se parte a la fuerza", () => {
  const p = splitPinnedLabel("Portada de Quality");
  assert(p.subject === "Portada de Quality", `el sujeto quedó como «${p.subject}»`);
  assert(p.kind === null, `se inventó el tipo «${p.kind}»`);
  // Ni una con dos puntos raros.
  assert(splitPinnedLabel(": suelto").kind === null, "partió por unos dos puntos iniciales");
});

check("A3. NO se enseña el nombre interno de ninguna pantalla ni de ninguna capa", () => {
  for (const p of ["mirador de proceso", "process_context", "source plan", "composer",
                   "loader", "sourcesAttempted", "sourcesUsed", "adapter", "adaptador"]) {
    assert(!VISIBLE.toLowerCase().includes(p.toLowerCase()),
      `la pantalla enseña vocabulario de dentro: «${p}»`);
  }
  // Y el rótulo del plan ya no viaja a la pantalla.
  assert(!/CONTEXT_PLANS\[[^\]]+\]\.label|contextPlan\([^)]*\)!?\.label/.test(CODIGO),
    "el panel sigue pintando el nombre interno del plan de contexto");
});

check("A4. El ancla se explica: de dónde parte y hasta dónde puede llegar", () => {
  const n = contextAnchorNote("quality_process");
  assert(/partirá de la información de este proceso/.test(n),
    `el ancla dice «${n}»`);
  assert(/podrá incorporar información relacionada/.test(n),
    "no se dice que puede ampliar si la pregunta lo pide");
  assert(/tu rol tenga permiso/.test(n), "no se dice que ampliar respeta los permisos");
  // Y NO se sugiere que la pregunta abandone el origen.
  assert(!/puedes preguntar por otras cosas|empieza por aquí/i.test(n),
    "el ancla sugiere que la pregunta se va del origen");
});

check("A5. Cada contexto integrado se nombra en lengua de producto", () => {
  for (const c of INTEGRATED_CONTEXTS) {
    const n = anchorNoun(c);
    assert(n.startsWith("est"), `«${c}» se nombra como «${n}»`);
    assert(!/_/.test(n), `«${c}» se nombra con jerga: «${n}»`);
    assert(!/mirador|portada de quality$/i.test(n) || c === "quality_home",
      `«${c}» usa el nombre de una pantalla`);
  }
  assert(anchorNoun(null) === "este punto de partida", "sin origen no hay ancla que nombrar");
});

check("A6. La frase rota desapareció", () => {
  for (const roto of ["y el Se ampliará", "y el\n            Se ampliará",
                      "Se ampliará el contexto dentro de lo que tu rol puede ver"]) {
    assert(!CODIGO.includes(roto), `sigue la frase rota: «${roto}»`);
  }
  // Y ninguna frase visible empieza en mayúscula tras una conjunción suelta.
  assert(!/\by el\s+[A-ZÁÉÍÓÚ]/.test(VISIBLE), "hay otra frase cortada a medias");
});

// ===========================================================================
console.log("\nB · Disponible NO es usado");
// ===========================================================================

check("B1. Antes de preguntar se dicen las DISPONIBLES", () => {
  assert(/Fuentes disponibles para este contexto/.test(PANEL),
    "no se dice cuántas fuentes hay disponibles");
  // En futuro —una promesa— no puede quedar ninguna. En pasado sí: el bloque de
  // fuentes dice cuántas se consultaron, y eso ya es un hecho.
  assert(!/Se consultará|se consultarán/i.test(CODIGO),
    "se sigue prometiendo lo que se va a consultar, y después no cuadra");
  assert(/Se consultaron/.test(CODIGO),
    "desapareció el recuento de fuentes efectivamente consultadas");
  assert(availableSourceCount("quality_process") === CONTEXT_PLANS.quality_process.sources.length,
    "el número de disponibles no sale del plan");
  assert(availableSourceCount("quality_indicator") === null,
    "se inventa un número para un contexto sin plan");
});

check("B2. Después se dicen las USADAS, y con otras palabras", () => {
  assert(/Fuentes utilizadas en esta respuesta/.test(PANEL),
    "la respuesta no dice cuántas fuentes aportaron algo");
  assert(/meta\.sources\.length/.test(PANEL),
    "el recuento de usadas no sale de las fuentes que aportaron");
});

check("B3. Las dos frases son distintas y no se confunden", () => {
  const disponibles: string = "Fuentes disponibles para este contexto";
  const usadas: string = "Fuentes utilizadas en esta respuesta";
  assert(disponibles !== usadas, "las dos cifras se dicen igual");
  assert(CODIGO.indexOf(disponibles) < CODIGO.indexOf(usadas),
    "lo disponible debería decirse antes de preguntar y lo usado después");
  // Y la de disponibles vive en la tarjeta de contexto, no en la respuesta.
  assert(CODIGO.indexOf(disponibles) < CODIGO.indexOf("function Answer"),
    "lo disponible se dice dentro de la respuesta, cuando ya se sabe lo usado");
});

// ===========================================================================
console.log("\nC · Sin modelo no hay análisis de modelo");
// ===========================================================================

check("C1. La pantalla distingue si intervino un modelo", () => {
  assert(/const modelRan =/.test(PANEL), "la respuesta no distingue si hubo modelo");
  assert(/meta\.live === true && meta\.providerCalled !== false/.test(PANEL),
    "se da por bueno que hubo modelo sin comprobar las dos condiciones");
});

check("C2. Sin modelo NO se habla de interpretación ni de análisis de IA", () => {
  assert(/\{modelRan && a\.interpretation\.length > 0/.test(PANEL),
    "el bloque de análisis se pinta aunque no haya intervenido ningún modelo");
  assert(!/Interpretación de la IA/.test(CODIGO),
    "sigue el rótulo que atribuye a la IA algo que compuso el código");
  assert(NO_MODEL_HEADER_TITLE === "Información disponible",
    `sin modelo se encabeza «${NO_MODEL_HEADER_TITLE}»`);
});

check("C3. Sin modelo, los hechos determinísticos siguen viéndose", () => {
  assert(/Hechos encontrados/.test(PANEL), "desaparecieron los hechos");
  // El bloque de hechos NO depende de que hubiera modelo.
  const i = PANEL.indexOf("Hechos encontrados");
  const antes = PANEL.slice(Math.max(0, i - 400), i);
  assert(!/modelRan/.test(antes), "los hechos se escondieron cuando no hay modelo");
});

check("C4. Y el cierre determinístico dice lo que es", () => {
  assert(/\{!modelRan && a\.facts\.length > 0/.test(PANEL),
    "no hay cierre para la respuesta sin modelo");
  assert(NO_MODEL_SECTION_TITLE === "Lectura del contexto",
    `el cierre sin modelo se llama «${NO_MODEL_SECTION_TITLE}»`);
  assert(/datos registrados actualmente en Trazaloop/.test(NO_MODEL_SECTION_NOTE),
    "el cierre no dice que son datos registrados");
  assert(/personas responsables/.test(NO_MODEL_SECTION_NOTE),
    "el cierre no remite a quien responde por el proceso");
  assert(!/IA|modelo|análisis/i.test(NO_MODEL_SECTION_NOTE),
    "el cierre sin modelo menciona un modelo");
});

check("C5. Con modelo hay análisis, y NO dictamen", () => {
  assert(MODEL_SECTION_TITLE === "Análisis de Intelligence",
    `con modelo se rotula «${MODEL_SECTION_TITLE}»`);
  for (const prohibido of ["Conclusión", "Dictamen", "Conformidad", "Veredicto"]) {
    assert(!VISIBLE.includes(prohibido),
      `la respuesta usa un rótulo de decisión formal: «${prohibido}»`);
  }
});

// ===========================================================================
console.log("\nD · «Evidencia» no era la palabra");
// ===========================================================================

check("D1. El nivel habla de CONTEXTO, no de suficiencia probatoria", () => {
  for (const [nivel, etiqueta] of Object.entries(EVIDENCE_LABEL)) {
    assert(!/evidencia/i.test(etiqueta),
      `el nivel «${nivel}» se sigue llamando «${etiqueta}»`);
  }
  assert(EVIDENCE_LABEL.sufficient === "Contexto suficiente",
    `el nivel alto se llama «${EVIDENCE_LABEL.sufficient}»`);
  assert(Object.keys(EVIDENCE_LABEL).join(",") === "sufficient,limited,missing",
    "cambiaron los valores guardados, y solo debía cambiar la etiqueta");
});

check("D2. Y su explicación tampoco suena a juicio formal", () => {
  for (const t of Object.values(EVIDENCE_MEANING)) {
    assert(!/sostienen lo que se afirma|prueba|conformidad|cumple/i.test(t),
      `la explicación suena a dictamen: «${t}»`);
  }
  assert(/fuentes autorizadas relacionadas con tu pregunta/.test(EVIDENCE_MEANING.sufficient),
    "el nivel alto no describe disponibilidad de contexto");
});

// ===========================================================================
console.log("\nE · Lo que NO se tocó");
// ===========================================================================

check("E1. La selección de fuentes sigue igual", () => {
  assert(INTEGRATED_CONTEXTS.length === 5, "cambió el número de contextos integrados");
  assert(CONTEXT_PLANS.quality_process.sources.length === 7,
    `el plan de proceso pide ${CONTEXT_PLANS.quality_process.sources.length} fuentes`);
  assert(CONTEXT_PLANS.quality_home.sources.length === 10,
    `el plan de la portada pide ${CONTEXT_PLANS.quality_home.sources.length} fuentes`);
  for (const c of INTEGRATED_CONTEXTS) {
    assert(CONTEXT_PLANS[c].sources.includes("attention"),
      `«${c}» dejó de consumir la atención convergida`);
  }
});

check("E2. Las citas siguen igual", () => {
  assert(/Fuentes citadas|citadas/.test(PANEL), "desapareció la separación de citas");
  assert(/citadas\.has\(r\.ordinal\)/.test(PANEL),
    "cambió cómo se distinguen las fuentes citadas de las consultadas");
});

check("E3. Y el compositor no se tocó", () => {
  const integradas = leer("lib/ai/context/integrated.ts");
  assert(/loadAttention/.test(integradas) && /loadProcessContext/.test(integradas),
    "las fuentes integradas cambiaron de origen");
  assert(!/interpretación|Evidencia suficiente/i.test(integradas),
    "el arreglo de copy se coló en la capa de composición");
});

check("E4. El aviso de siempre sigue en su sitio", () => {
  assert(/AI_DISCLAIMER/.test(PANEL), "desapareció el aviso de generado con IA");
  assert(/HUMAN_IN_THE_LOOP/.test(PANEL), "desapareció que nada se convierte en registro solo");
});

console.log(`\nQUALITY-13B5 · presentación: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
