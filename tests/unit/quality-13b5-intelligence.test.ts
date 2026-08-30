/**
 * Trazaloop · QUALITY-13B5 · La composición integrada, sin base y sin modelo.
 *
 * Aquí van las decisiones: qué fuentes compone cada pantalla, qué preguntas se
 * sugieren, cómo se declara el tiempo cuando no coincide, y —lo que más pesa—
 * que **no hay un segundo motor**.
 *
 * Correr: npm run test:quality13b5-intelligence
 */
import { readFileSync, readdirSync } from "node:fs";
import {
  CONTEXT_PLANS, FORMAL_DECISIONS_RESERVED_TO_PEOPLE, INTEGRATED_CONTEXTS,
  INTEGRATED_QUESTIONS, SUGGESTION_ONLY_NOTE, contextPlan, isScreenContext,
  isSimultaneous, questionsFor, selectSources, temporalConflicts,
} from "../../lib/domain/quality-intelligence";
import { CURRENT, asOf, period } from "../../lib/domain/quality-integration";
import { starterFor } from "../../lib/domain/quality-ai";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const leer = (p: string) => readFileSync(p, "utf8");
const INTEGRADAS = leer("lib/ai/context/integrated.ts");
const BUILDER = leer("lib/ai/context/builder.ts");
const COPILOT = leer("lib/ai/copilot.ts");
const DOMINIO = leer("lib/domain/quality-intelligence.ts");
const HOME_VIEW = leer("components/domain/quality/home-view.tsx");
const ADAPTERS = leer("lib/ai/context/adapters.ts");

console.log("\nQUALITY-13B5 · Intelligence entre dominios\n");

// ===========================================================================
console.log("A · UN motor, y ni uno más");
// ===========================================================================

check("A1. No aparece un segundo copiloto, proveedor ni cliente de modelo", () => {
  const nuevos = readdirSync("lib/ai").filter((f) => f.endsWith(".ts"));
  assert(nuevos.includes("copilot.ts"), "desapareció el orquestador único");
  for (const [n, src] of [["integradas", INTEGRADAS], ["dominio", DOMINIO]] as const) {
    assert(!/openai|anthropic|fetch\(.*https/i.test(src),
      `la capa ${n} habla con un proveedor por su cuenta`);
    assert(!/resolveProvider|callProvider/.test(src),
      `la capa ${n} resuelve su propio proveedor`);
  }
  assert(!/registerProvider|new Provider/.test(INTEGRADAS), "se registró otro proveedor");
});

check("A2. Las fuentes integradas se registran en el MISMO registro", () => {
  assert(/registerAdapter\(\{/.test(INTEGRADAS), "no usan el registro de adaptadores");
  const codigos = [...INTEGRADAS.matchAll(/code: "([a-z_]+)"/g)].map((m) => m[1]);
  assert(codigos.includes("attention") && codigos.includes("process_context"),
    `las fuentes integradas son ${codigos.join(", ")}`);
  assert(codigos.length === 2, `se registraron ${codigos.length} fuentes integradas`);
  assert(COPILOT.includes('import "./context/integrated"'),
    "el orquestador no carga las fuentes integradas");
});

check("A3. El modelo NO consulta la base, ni aquí ni en ningún sitio", () => {
  for (const [n, src] of [["integradas", INTEGRADAS], ["builder", BUILDER]] as const) {
    assert(!/tool|function_call|execute_sql|run_query/i.test(src),
      `la capa ${n} le da herramientas de base al modelo`);
  }
  assert(/El modelo NO consulta la base/.test(BUILDER),
    "el constructor dejó de declarar la regla que lo sostiene");
});

check("A4. Las fuentes integradas NO escriben nada", () => {
  assert(!/\.(insert|update|upsert|delete)\(/.test(INTEGRADAS),
    "una fuente integrada escribe en la base");
});

// ===========================================================================
console.log("\nB · Reutilizar B1, B2 y B3 en vez de repetirlos");
// ===========================================================================

check("B1. La atención sale de B3, y no se vuelven a contar señales", () => {
  assert(/loadAttention/.test(INTEGRADAS), "no se usa la consulta convergida de B3");
  assert(/summarizeAttention/.test(INTEGRADAS), "no se usa el resumen de B3");
  for (const tabla of ["quality_signals", "quality_risk_signals", "quality_supplier_signals",
                       "quality_customer_signals", "quality_knowledge_signals",
                       "work_alerts", "work_tasks"]) {
    assert(!INTEGRADAS.includes(`"${tabla}"`),
      `la fuente integrada lee ${tabla} por su cuenta: eso reintroduce la duplicación de B3`);
  }
});

check("B2. El proceso sale de las primitivas de B1/B2", () => {
  assert(/loadProcessContext/.test(INTEGRADAS), "no se usa el contexto de proceso de B1");
  assert(/deriveProcessSuppliers/.test(INTEGRADAS) && /deriveProcessComplaints/.test(INTEGRADAS),
    "no se usa la derivación de QI-23 de B2");
  for (const tabla of ["quality_risk_processes", "work_case_processes",
                       "quality_objective_processes", "quality_process_documents"]) {
    assert(!INTEGRADAS.includes(`"${tabla}"`),
      `la fuente integrada vuelve a unir ${tabla} por su cuenta`);
  }
});

check("B3. Los enlaces salen del contrato de B1", () => {
  assert(/deepLink: it\.href/.test(INTEGRADAS),
    "el enlace de un punto de atención se escribe a mano");
  const aMano = [...INTEGRADAS.matchAll(/deepLink: `\/[a-z]/g)];
  assert(aMano.length <= 1,
    `hay ${aMano.length} enlaces escritos a mano en la capa integrada`);
});

// ===========================================================================
console.log("\nC · La selección de fuentes");
// ===========================================================================

check("C1. Cinco contextos integrados, y los cinco tienen plan", () => {
  assert(INTEGRATED_CONTEXTS.length === 5, `hay ${INTEGRATED_CONTEXTS.length} contextos`);
  for (const c of INTEGRATED_CONTEXTS) {
    const plan = CONTEXT_PLANS[c];
    assert(plan, `${c} no tiene plan`);
    assert(plan.sources.length > 0, `${c} no carga nada`);
    assert(plan.rationale.length > 60, `${c} no explica por qué esas fuentes`);
  }
});

check("C2. Ningún plan carga las veintitrés fuentes", () => {
  const todas = [...ADAPTERS.matchAll(/code: "([a-z_]+)"/g)].map((m) => m[1]);
  assert(todas.length >= 20, `solo se encontraron ${todas.length} adaptadores`);
  for (const c of INTEGRATED_CONTEXTS) {
    const n = CONTEXT_PLANS[c].sources.length;
    assert(n < todas.length,
      `«${c}» carga ${n} de ${todas.length} fuentes: eso es cargar el sistema entero`);
  }
});

check("C3. La atención está en LOS CINCO planes", () => {
  for (const c of INTEGRATED_CONTEXTS) {
    assert(CONTEXT_PLANS[c].sources.includes("attention"),
      `«${c}» no consume la atención convergida y contaría por su cuenta`);
  }
});

check("C4. Cada fuente de un plan existe de verdad", () => {
  const existentes = new Set([
    ...[...ADAPTERS.matchAll(/code: "([a-z_]+)"/g)].map((m) => m[1]),
    ...[...INTEGRADAS.matchAll(/code: "([a-z_]+)"/g)].map((m) => m[1]),
  ]);
  for (const c of INTEGRATED_CONTEXTS) {
    for (const f of CONTEXT_PLANS[c].sources) {
      assert(existentes.has(f), `«${c}» pide la fuente «${f}», que no existe`);
    }
  }
});

check("C5. Sin origen conocido se comporta como antes", () => {
  assert(selectSources(null) === null, "sin origen se especializa igual, y no debería");
  assert(selectSources("quality_risk") === null,
    "un origen que no es integrado empezó a especializar");
  assert(selectSources("quality_process")!.includes("process_context"),
    "el proceso no compone su contexto");
  assert(contextPlan("quality_home")!.sources.includes("attention"),
    "la portada no compone la atención");
  assert(contextPlan("no_existe") === null, "se inventa un plan");
});

check("C6. El proceso NO carga dominios que no le tocan", () => {
  const p = CONTEXT_PLANS.quality_process.sources;
  for (const fuera of ["knowledge_item", "person_competence", "customer_comment",
                       "supplier", "automation_rule", "control", "signal"]) {
    assert(!p.includes(fuera), `preguntar por un proceso cargaría «${fuera}»`);
  }
});

check("C7. El constructor respeta la selección", () => {
  assert(/if \(req\.sources\) return req\.sources\.includes\(a\.code\)/.test(BUILDER),
    "el constructor ignora la selección de fuentes");
  assert(/sourcesAttempted/.test(BUILDER),
    "el constructor no dice qué fuentes intentó, y no se podría medir la especialización");
});

// ===========================================================================
console.log("\nD · Las preguntas sugeridas");
// ===========================================================================

check("D1. Cada contexto integrado sugiere entre tres y cinco", () => {
  for (const c of INTEGRATED_CONTEXTS) {
    const qs = INTEGRATED_QUESTIONS[c];
    // Contexto (partes interesadas) NO trae lista propia a propósito: ya tenía
    // seis buenas de 12.3B3B, y tres son justo las integradas. Sustituirlas
    // habría quitado producto para poner lo mismo con otras palabras.
    if (!qs) {
      assert(starterFor(c).length >= 5,
        `«${c}» se quedó sin sugerencias al no traer lista propia`);
      continue;
    }
    assert(qs.length >= 3 && qs.length <= 5,
      `«${c}» sugiere ${qs.length} preguntas: una lista larga no se lee`);
    for (const q of qs) {
      assert(q.label.length <= 34, `etiqueta demasiado larga: «${q.label}»`);
      assert(q.question.endsWith("?") || q.question.endsWith("."),
        `«${q.question}» no está escrita como una pregunta ni como una petición`);
    }
  }
});

check("D2. Son PREGUNTAS, no respuestas ni afirmaciones", () => {
  for (const c of INTEGRATED_CONTEXTS) {
    for (const q of INTEGRATED_QUESTIONS[c] ?? starterFor(c)) {
      assert(!/conforme|cumple|certificad|no conformidad/i.test(q.question),
        `«${q.question}» le pide al modelo una decisión formal`);
    }
  }
});

check("D3. Los casos del encargo están cubiertos", () => {
  const todas = [...Object.values(INTEGRATED_QUESTIONS).flat(),
                 ...starterFor("quality_stakeholder_assessment")]
    .map((q) => q.question).join(" ");
  for (const [caso, patron] of [
    ["A · qué requiere atención", /requiere atención/i],
    ["B · procesos con más abierto", /procesos concentran/i],
    ["C · indicadores y riesgos", /indicadores fuera de objetivo/i],
    ["D · cambios desde la revisión", /cambios relevantes desde la última revisión/i],
    ["E · requisitos sin estrategia", /no tienen ninguna estrategia|no tienen estrategia/i],
    ["F · preguntas de auditoría", /prepara preguntas para la próxima auditoría/i],
    ["G · procesos con pendientes", /riesgos, acciones o revisiones pendientes/i],
    ["H · qué revisar hoy", /qué debería revisar hoy/i],
  ] as const) {
    assert(patron.test(todas), `no hay pregunta para el caso ${caso}`);
  }
});

check("D4. Y llegan a la pantalla por el mismo sitio de siempre", () => {
  assert(questionsFor("quality_home")!.length > 0, "la portada no sugiere nada");
  const s = starterFor("quality_home");
  assert(s.some((q) => /requiere atención/i.test(q.question)),
    "las sugerencias integradas no llegan al arranque del copiloto");
  // Y los orígenes de un solo dominio conservan las suyas.
  assert(starterFor("quality_indicator").some((q) => /tendencia/i.test(q.question)),
    "se perdieron las sugerencias de un dominio suelto");
});

// ===========================================================================
console.log("\nE · El tiempo");
// ===========================================================================

check("E1. Momentos distintos NO se juntan callando", () => {
  const fragmentos = [
    { source: "attention", temporal: CURRENT },
    { source: "indicator", temporal: period("2026-01-01", "2026-03-31") },
  ];
  const conflictos = temporalConflicts(asOf("2026-06-30"), fragmentos);
  assert(conflictos.length === 2, `se detectaron ${conflictos.length} desajustes de 2`);
  for (const c of conflictos) {
    assert(c.label.length > 20, `el desajuste de «${c.source}» no se explica`);
  }
  assert(!isSimultaneous(asOf("2026-06-30"), fragmentos),
    "se presentarían como si describieran el mismo momento");
});

check("E2. Y cuando SÍ coinciden, no se avisa de nada", () => {
  const fragmentos = [
    { source: "attention", temporal: CURRENT },
    { source: "process_context", temporal: CURRENT },
  ];
  assert(isSimultaneous(CURRENT, fragmentos), "avisa de una mezcla que no existe");
  assert(temporalConflicts(CURRENT, fragmentos).length === 0, "inventa un desajuste");
});

check("E3. Un periodo no se disfraza de foto a una fecha", () => {
  const c = temporalConflicts(asOf("2026-06-30"),
    [{ source: "objective", temporal: period("2026-01-01", "2026-12-31") }]);
  assert(/periodos completos/.test(c[0].label),
    `el periodo se describe como «${c[0].label}»`);
});

check("E4. El constructor sigue declarando lo que una fuente no sabe reconstruir", () => {
  assert(/no reconstruye su estado en una fecha pasada/.test(BUILDER),
    "se perdió la limitación temporal por fuente");
});

// ===========================================================================
console.log("\nF · Lo que Intelligence NO decide");
// ===========================================================================

check("F1. Las nueve decisiones formales siguen reservadas a las personas", () => {
  assert(FORMAL_DECISIONS_RESERVED_TO_PEOPLE.length === 9,
    `hay ${FORMAL_DECISIONS_RESERVED_TO_PEOPLE.length} decisiones reservadas`);
  for (const [nombre, patron] of [
    ["parte interesada", /parte interesada/],
    ["no conformidad", /no conformidad/],
    ["cerrar una acción", /cerrar una acción/],
    ["aprobar un documento", /aprobar un documento/],
    ["aceptar un riesgo", /aceptar un riesgo/],
    ["cambiar un objetivo", /cambiar un objetivo/],
    ["aprobar un proveedor", /aprobar un proveedor/],
    ["conclusión de la revisión", /revisión por la dirección/],
    ["conformidad con una norma", /conformidad con una norma/],
  ] as const) {
    assert(FORMAL_DECISIONS_RESERVED_TO_PEOPLE.some((d) => patron.test(d)),
      `ya no se reserva: ${nombre}`);
  }
});

check("F2. Y una sugerencia se presenta como sugerencia", () => {
  assert(/sugerencia/i.test(SUGGESTION_ONLY_NOTE), "no se dice que es una sugerencia");
  assert(/no la toma Trazaloop|las toma quien/i.test(SUGGESTION_ONLY_NOTE),
    "no se dice quién decide de verdad");
});

check("F3. Ninguna fuente integrada afirma conformidad", () => {
  const visible = INTEGRADAS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert(!/\bISO\b|certificad|conforme con/i.test(visible),
    "una fuente integrada afirma conformidad");
});

// ===========================================================================
console.log("\nG · Las entradas contextuales");
// ===========================================================================

check("G1. La portada ofrece UNA entrada, y es un enlace", () => {
  assert(/AskCopilotButton/.test(HOME_VIEW), "la portada no ofrece preguntar a Intelligence");
  assert(/type="quality_home"/.test(HOME_VIEW), "la entrada no fija el contexto a la portada");
  const veces = (HOME_VIEW.match(/AskCopilotButton/g) ?? []).length;
  assert(veces === 2, `la portada monta ${veces - 1} entradas: una basta`);
  assert(!/<Chat|useChat|messages/.test(HOME_VIEW), "se incrustó un chat en la portada");
});

check("G2. El mirador de proceso ya tenía la suya, y sigue fijada al proceso", () => {
  const ficha = leer("components/domain/quality/process-detail.tsx");
  assert(/AskCopilotButton/.test(ficha), "la ficha de proceso perdió su entrada");
  assert(/type="quality_process"/.test(ficha), "la entrada no fija el contexto al proceso");
  const cockpit = leer("components/domain/quality/process-cockpit.tsx");
  assert(!/AskCopilotButton/.test(cockpit),
    "se añadió una SEGUNDA entrada en la misma pantalla");
});

check("G3. Un contexto de PANTALLA puede no tener identificador", () => {
  assert(isScreenContext("quality_home"), "la portada no se reconoce como contexto de pantalla");
  assert(!isScreenContext("quality_process"), "un proceso se trata como pantalla");
  assert(!isScreenContext(null), "sin origen se trata como pantalla");
  const boton = leer("components/domain/quality/copilot/ask-button.tsx");
  assert(/id\?: string/.test(boton), "el botón sigue exigiendo un identificador");
});

// ===========================================================================
console.log("\nH · Sin esquema, sin cuota aparte");
// ===========================================================================

/**
 * B5 sí necesitó una migración, y conviene decir exactamente cuál y por qué.
 *
 * `quality_ai_add_reference` rechaza cualquier cita cuya fuente no esté en
 * `quality_ai_sources`: es la guarda de QUALITY-12 que impide citar algo que el
 * catálogo no reconoce. Las dos fuentes integradas no existían cuando se
 * escribió ese catálogo, así que sus citas se rechazaban en silencio y la
 * respuesta enseñaba una fuente que el servidor no había guardado.
 *
 * Se comprobó midiendo: la suite de QUALITY-12 empezó a fallar en «las citas
 * están guardadas y tienen enlace interno». Eso es la necesidad demostrada que
 * §35 exige.
 */
check("H1. La única migración de B5 es un asiento de catálogo", () => {
  const nums = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql")).map((f) => Number(f.slice(0, 4)));
  assert(Math.max(...nums) === 154, `la cabecera es ${Math.max(...nums)}`);
  const m = leer("supabase/migrations/0154_quality_intelligence_integrated_sources.sql");
  assert(!/create table|alter table|drop /i.test(m),
    "0154 hace algo más que sembrar el catálogo");
  assert(/insert into public\.quality_ai_sources/.test(m), "0154 no siembra el catálogo");
  assert(/on conflict \(code\) do nothing/.test(m), "0154 no es idempotente");
  // Nombrarlos en un comentario para explicar qué NO se hace es parte de
  // explicarlo; lo que no puede haber es una sentencia que los toque.
  const sql = m.replace(/^--.*$/gm, "");
  for (const prohibido of ["intelligence_use_cases", "quality_ai_runs",
                           "intelligence_pricing", "rate_limit"]) {
    assert(!sql.includes(prohibido), `0154 toca ${prohibido}`);
  }
});

check("H1b. Las dos fuentes declaran que NO reconstruyen el pasado", () => {
  const m = leer("supabase/migrations/0154_quality_intelligence_integrated_sources.sql");
  const filas = [...m.matchAll(/\('(attention|process_context)'[\s\S]*?'(current|period|as_of)',/g)];
  assert(filas.length === 2, `se sembraron ${filas.length} fuentes`);
  for (const f of filas) {
    assert(f[2] === "current",
      `«${f[1]}» dice reconstruir el pasado con modo ${f[2]}, y no sabe`);
  }
});

check("H2. Se reutiliza el libro de consumo, sin cuota nueva", () => {
  assert(/quality_ai_start_run/.test(COPILOT), "no se usa la apertura de ejecución de siempre");
  assert(/quality_ai_complete_run/.test(COPILOT), "no se cierra la ejecución");
  for (const [n, src] of [["integradas", INTEGRADAS], ["dominio", DOMINIO]] as const) {
    assert(!/quality_ai_runs|rate_limit|cuota|quota/i.test(src),
      `la capa ${n} monta su propio control de consumo`);
  }
});

check("H3. Y no se inventa un caso de uso fuera del catálogo", () => {
  // Los casos de uso nuevos habrían quedado fuera de `intelligence_use_cases`,
  // y con ellos fuera su clase de coste y su tope. Se reutilizan los que hay.
  const usados = [...INTEGRADAS.matchAll(/useCases: \[([^\]]+)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/"([a-z_.]+)"/g)].map((x) => x[1]));
  const catalogo = ["ask", "copilot.ask", "audit_prep", "review_summary", "risk_candidates",
                    "customer_themes", "root_cause", "explain_signal"];
  for (const u of usados) {
    assert(catalogo.includes(u), `se inventó el caso de uso «${u}»`);
  }
});

// ===========================================================================
console.log("\nI · Lo que B2 y B4 dejaron aceptado sigue en pie");
// ===========================================================================

check("I1. La portada conserva su estructura de B4", () => {
  assert(/Necesita atención/.test(HOME_VIEW), "la portada perdió su zona de atención");
  assert(/Dónde entrar/.test(HOME_VIEW), "la portada perdió sus baldosas");
  assert(/loadQualityHome/.test(leer("app/(app)/(shell)/quality/page.tsx")),
    "la portada dejó de componerse por la vía de B4");
  const atencion = HOME_VIEW.indexOf("<AttentionArea");
  const dominios = HOME_VIEW.indexOf("<DomainTiles");
  assert(atencion > 0 && atencion < dominios,
    "se alteró la jerarquía que el humano aceptó en B4");
});

check("I2. El mirador de proceso conserva la suya de B2", () => {
  const cockpit = leer("components/domain/quality/process-cockpit.tsx");
  assert(/El proceso en el sistema de gestión/.test(cockpit),
    "el mirador perdió su encabezado");
  assert(!/<form/.test(cockpit), "el mirador empezó a editar");
  assert(/arrangeCockpit/.test(cockpit), "el mirador dejó de ordenar por bloques");
});

check("I3. Y ninguna pantalla más ganó un botón de Intelligence", () => {
  const conBoton: string[] = [];
  const dirs = ["components/domain/quality"];
  const walk = (d: string) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const ruta = `${d}/${f.name}`;
      if (f.isDirectory()) { walk(ruta); continue; }
      if (!f.name.endsWith(".tsx")) continue;
      if (/<AskCopilotButton/.test(leer(ruta))) conBoton.push(ruta);
    }
  };
  walk(dirs[0]);
  // Las pantallas con entrada contextual, congeladas por QUALITY-13:
  // proceso, portada, partes interesadas, indicador, proveedor, caso, señal…
  assert(conBoton.length <= 10,
    `hay ${conBoton.length} pantallas con botón de Intelligence: proliferación`);
  assert(conBoton.some((f) => f.includes("home-view")), "la portada perdió el suyo");
  assert(conBoton.some((f) => f.includes("process-detail")), "el proceso perdió el suyo");
});

console.log(`\nQUALITY-13B5 · intelligence: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
