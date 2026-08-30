/**
 * Trazaloop · QUALITY-13B2 · El mirador de proceso, sin base y sin DOM.
 *
 * QUÉ SE PRUEBA AQUÍ Y QUÉ NO
 *
 * Aquí van las decisiones: el orden de los bloques, qué frase se enseña cuando
 * no hay filas, qué pide atención y qué NO, y las tres reglas que este tramo no
 * puede romper —sin dato no es cero, cada cosa lleva a su causa, todo declara su
 * momento—. Son funciones puras: no hacen falta ni una consulta ni un navegador.
 *
 * El cableado de la pantalla lo prueba la suite de interfaz; los datos, la de
 * base real; y el recorrido entero, la de aceptación.
 *
 * Correr: npm run test:quality13b2-cockpit
 */
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import {
  CURRENT, allDeepLinks, asOf, deepLink, hasDetailRoute, period,
  type ContextSection,
} from "../../lib/domain/quality-integration";
import {
  COCKPIT_BLOCKS, SECTION_NOTE, arrangeCockpit, processAttention, requirementLinkLabel,
  sectionDisplay, sectionTemporalLabel, severityLabel, stateLabel, temporalNotice, visibleCount,
} from "../../lib/domain/quality-process-cockpit";
import {
  QUALITY_EVALUACION_GROUP, QUALITY_PERSONAS_GROUP, QUALITY_SHELL_MODULE,
} from "../../lib/modules/registry";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const leer = (p: string) => readFileSync(p, "utf8");
const PAGINA = leer("app/(app)/(shell)/quality/processes/[processId]/page.tsx");
const FICHA = leer("components/domain/quality/process-detail.tsx");
const MIRADOR = leer("components/domain/quality/process-cockpit.tsx");
const CARGADOR = leer("lib/db/quality-process-cockpit.ts");
const DOMINIO = leer("lib/domain/quality-process-cockpit.ts");

/** Las nueve secciones que B1 compone, con datos, para poder razonar sobre ellas. */
const LLAVES = ["requirements", "risks", "opportunities", "objectives", "indicators",
                "documents", "audit_findings", "cases", "competencies"];

function seccion(key: string, extra: Partial<ContextSection> = {}): ContextSection {
  return {
    key, label: key, status: "ok", count: 1, attentionCount: null,
    items: [], href: "/quality/x", temporal: CURRENT, ...extra,
  };
}

console.log("\nQUALITY-13B2 · Mirador de proceso · decisiones\n");

// ===========================================================================
console.log("A · La ficha de proceso ENSEÑA el mirador");
// ===========================================================================

check("A1. La página compone el mirador en servidor y se lo pasa a la ficha", () => {
  assert(PAGINA.includes("loadProcessCockpit"), "la página no carga el contexto del mirador");
  assert(PAGINA.includes("QualityProcessCockpit"), "la página no monta el mirador");
  assert(/cockpit=\{/.test(PAGINA), "el mirador no se le pasa a la ficha");
  assert(FICHA.includes("{cockpit}"), "la ficha no coloca el mirador en ningún sitio");
});

check("A2. El mirador NO es de cliente: no entra en el paquete del navegador", () => {
  assert(!/^"use client"/m.test(MIRADOR), "el mirador se declaró de cliente");
  // Y la ficha, que sí lo es, lo recibe ya pintado en vez de datos crudos.
  assert(/cockpit\?: React\.ReactNode/.test(FICHA),
    "la ficha recibe datos del mirador en vez del nodo ya compuesto");
});

check("A3. El mirador no edita: ni formularios, ni acciones de servidor", () => {
  assert(!/<form/.test(MIRADOR), "el mirador tiene un formulario");
  assert(!/server\/actions/.test(MIRADOR), "el mirador llama a una acción de servidor");
  assert(!/<button/.test(MIRADOR), "el mirador tiene un botón: es un mirador, no un editor");
});

check("A4. La pantalla no consulta por su cuenta", () => {
  for (const [nombre, src] of [["mirador", MIRADOR], ["ficha", FICHA]] as const) {
    assert(!/from\(["'`]/.test(src), `la ${nombre} construye una consulta a una tabla`);
    assert(!/createServerClient|createBrowserClient/.test(src),
      `la ${nombre} se crea su propio cliente de datos`);
  }
});

// ===========================================================================
console.log("\nB · Las nueve secciones de B1, y ni una inventada");
// ===========================================================================

check("B1. Los bloques cubren EXACTAMENTE las nueve secciones de B1", () => {
  const declaradas = COCKPIT_BLOCKS.flatMap((b) => b.sectionKeys);
  assert(declaradas.length === new Set(declaradas).size,
    "una sección aparece en dos bloques: se enseñaría dos veces");
  for (const k of LLAVES) {
    assert(declaradas.includes(k), `ningún bloque enseña la sección ${k}`);
  }
  for (const k of declaradas) {
    assert(LLAVES.includes(k), `el mirador declara una sección «${k}» que B1 no compone`);
  }
});

check("B2. Un dominio sin relación con el proceso NO produce un bloque vacío", () => {
  // Solo llegan tres secciones: solo se enseñan los bloques de esas tres.
  const bloques = arrangeCockpit([seccion("risks"), seccion("cases"), seccion("documents")]);
  const claves = bloques.flatMap((b) => b.sections.map((s) => s.key));
  assert(claves.length === 3, `esperaba 3 secciones, se pintaron ${claves.length}`);
  assert(!bloques.some((b) => b.sections.length === 0), "hay un bloque sin ninguna sección");
});

check("B3. El orden es el de gestión, no el del cargador", () => {
  const orden = COCKPIT_BLOCKS.flatMap((b) => b.sectionKeys);
  const pos = (k: string) => orden.indexOf(k);
  assert(pos("requirements") < pos("risks"), "los riesgos van antes que lo que se le exige");
  assert(pos("risks") < pos("objectives"), "los objetivos van antes que los riesgos");
  assert(pos("objectives") < pos("audit_findings"), "la verificación va antes que lo esperado");
  assert(pos("audit_findings") < pos("cases"), "el seguimiento va antes que la verificación");
});

check("B4. Objetivo e indicador comparten bloque y NO se funden", () => {
  const bloque = COCKPIT_BLOCKS.find((b) => b.sectionKeys.includes("objectives"))!;
  assert(bloque.sectionKeys.includes("indicators"),
    "objetivos e indicadores quedaron en bloques distintos");
  const bloques = arrangeCockpit([seccion("objectives"), seccion("indicators")]);
  const secciones = bloques.flatMap((b) => b.sections.map((s) => s.key));
  assert(secciones.length === 2, "se fundieron en una sola caja");
  assert(!/métricas|metricas/i.test(bloque.title + bloque.hint),
    "el bloque los llama «métricas», que borra la diferencia entre los dos");
});

// ===========================================================================
console.log("\nC · Sin dato NO es cero");
// ===========================================================================

check("C1. Vacío, denegado y roto son tres cosas distintas", () => {
  const vacia = sectionDisplay(seccion("risks", { count: 0 }));
  const denegada = sectionDisplay(seccion("risks",
    { status: "not_visible", count: null, reason: "Tu rol no da acceso a este dominio." }));
  const rota = sectionDisplay(seccion("risks",
    { status: "unavailable", count: null, reason: "No se pudo leer: PGRST301 permission denied" }));
  assert(vacia.kind === "empty", `vacía llegó como ${vacia.kind}`);
  assert(denegada.kind === "no_access", `denegada llegó como ${denegada.kind}`);
  assert(rota.kind === "unavailable", `rota llegó como ${rota.kind}`);
  const textos = new Set([vacia, denegada, rota]
    .map((d) => ("text" in d ? d.text : "")));
  assert(textos.size === 3, "dos de los tres estados dicen lo mismo");
});

check("C2. Ni la denegada ni la rota enseñan un recuento", () => {
  for (const estado of ["not_visible", "unavailable"] as const) {
    const s = seccion("risks", { status: estado, count: null });
    assert(visibleCount(s) === null, `la sección ${estado} devolvió un recuento`);
    // Y ni siquiera si alguien dejara un número dentro por descuido.
    const sucia = seccion("risks", { status: estado, count: 7 });
    assert(visibleCount(sucia) === null,
      `la sección ${estado} filtró un recuento que no debía enseñar`);
  }
});

check("C3. El motivo técnico NUNCA se pinta", () => {
  // `a.reason` sí se pinta, y debe: es el motivo del punto de atención, escrito
  // en la lengua del dominio. Lo que no se pinta nunca es el `reason` de una
  // SECCIÓN, que es donde viaja el mensaje del motor.
  assert(!/section\.reason|s\.reason|\bd\.reason/.test(MIRADOR),
    "el mirador enseña el motivo interno del fallo, que trae dentro el mensaje del motor");
  const rota = sectionDisplay(seccion("risks",
    { status: "unavailable", reason: 'PGRST301: permission denied for table "quality_risks"' }));
  const visible = "text" in rota ? rota.text : "";
  assert(!/PGRST|permission denied|relation|SQL/i.test(visible),
    `el texto que se enseña filtra jerga del motor: «${visible}»`);
});

check("C4. Una sección denegada no ofrece la puerta de su dominio", () => {
  // Enlazar a un dominio que el rol no puede abrir promete una pantalla que va
  // a rechazarle, y de paso confirma que ahí hay algo.
  assert(/display\.kind === "no_access" \? null :/.test(MIRADOR),
    "el mirador ofrece «Ver…» también cuando el rol no tiene acceso");
});

check("C5. Cada estado vacío dice algo útil, y ninguno dice «0»", () => {
  for (const k of LLAVES) {
    const d = sectionDisplay(seccion(k, { count: 0 }));
    assert(d.kind === "empty", `${k} vacía llegó como ${d.kind}`);
    const texto = "text" in d ? d.text : "";
    assert(texto.length > 20, `${k} tiene un vacío sin explicar: «${texto}»`);
    assert(!/^0\b/.test(texto), `${k} enseña un cero pelado`);
  }
});

// ===========================================================================
console.log("\nD · La muestra está acotada");
// ===========================================================================

check("D1. El cargador limita la muestra y NO la deduce de las filas", () => {
  assert(/const MUESTRA = 4/.test(CARGADOR), "el cargador del mirador no acota la muestra");
  assert(/items\.slice\(0, MUESTRA\)/.test(CARGADOR),
    "lo derivado no se recorta: la muestra crecería con los datos");
});

check("D2. El recuento sale del dominio, NUNCA de las filas cargadas", () => {
  // Cinco riesgos en el dominio, cuatro en la muestra: se enseña 5.
  const s = seccion("risks", {
    count: 5,
    items: Array.from({ length: 4 }, (_, i) => ({
      subjectKind: "quality_risk" as const, subjectId: `r${i}`, label: `Riesgo ${i}`,
      state: "active", severity: null, href: deepLink("quality_risk", `r${i}`),
    })),
  });
  assert(visibleCount(s) === 5, `enseñó ${visibleCount(s)} en vez del recuento del dominio`);
  assert(!/items\.length/.test(MIRADOR),
    "el mirador cuenta las filas que pintó y lo llama total");
});

check("D3. El recuento de lo derivado es el conjunto, no la muestra", () => {
  assert(/total: items\.length, items: items\.slice\(0, MUESTRA\)/.test(CARGADOR),
    "el recuento derivado se calcula sobre la muestra recortada");
});

// ===========================================================================
console.log("\nE · Cada cosa lleva a su causa, y ninguna sale de Quality");
// ===========================================================================

check("E1. Todos los destinos posibles son de Quality", () => {
  for (const h of allDeepLinks()) {
    assert(h.startsWith("/quality/"), `destino fuera de Quality: ${h}`);
  }
});

check("E2. Ni el mirador ni la ficha enlazan a PCR o Textiles", () => {
  for (const [nombre, src] of [["mirador", MIRADOR], ["ficha", FICHA],
                               ["dominio", DOMINIO], ["cargador", CARGADOR]] as const) {
    for (const prohibido of ["/traceability", "/textiles"]) {
      assert(!src.includes(`"${prohibido}`), `el ${nombre} enlaza a ${prohibido}`);
    }
  }
});

check("E3. Ningún enlace se escribe a mano: todos salen de deepLink", () => {
  const literales = [...CARGADOR.matchAll(/href:\s*["'`](\/[^"'`]+)/g)].map((m) => m[1]);
  assert(literales.length === 0,
    `el cargador escribe ${literales.length} enlace(s) a mano: ${literales.join(", ")}`);
  const enMirador = [...MIRADOR.matchAll(/href="(\/[^"]+)"/g)].map((m) => m[1]);
  assert(enMirador.length === 0,
    `el mirador escribe enlaces a mano: ${enMirador.join(", ")}`);
});

check("E4. Un sujeto sin ficha propia NO recibe un destino inventado", () => {
  // Los cuatro que aparecen en el mirador y no tienen página propia.
  for (const k of ["quality_audit_finding", "quality_stakeholder_requirement",
                   "quality_competency", "quality_customer_feedback"] as const) {
    assert(!hasDetailRoute(k), `${k} declara ficha propia y no la tiene`);
    const enlace = deepLink(k, "id-inventado");
    assert(!enlace.includes("id-inventado"),
      `${k} fabricó una URL con el identificador: ${enlace}`);
    assert(enlace.startsWith("/quality/"), `${k} lleva fuera de Quality`);
  }
  // Y la fila solo se enlaza si el sujeto tiene ficha.
  assert(/hasDetailRoute\(item\.subjectKind\)/.test(MIRADOR),
    "el mirador enlaza cada fila sin comprobar si esa fila tiene página");
});

// ===========================================================================
console.log("\nF · Todo declara su momento");
// ===========================================================================

check("F1. Cada sección enseña su etiqueta temporal", () => {
  assert(sectionTemporalLabel(seccion("risks")) === "Estado actual", "el presente no se etiqueta");
  assert(sectionTemporalLabel(seccion("risks", { temporal: asOf("2024-05-01") }))
    .includes("2024-05-01"), "una lectura a fecha no dice a qué fecha");
  assert(sectionTemporalLabel(seccion("risks", { temporal: period("2024-01-01", "2024-12-31") }))
    .includes("2024-12-31"), "un periodo no dice hasta cuándo");
  assert(/sectionTemporalLabel\(section\)/.test(MIRADOR),
    "el mirador no pinta la etiqueta temporal de la sección");
});

check("F2. Ver una revisión pasada AVISA de que lo de alrededor es de hoy", () => {
  const secciones = LLAVES.map((k) => seccion(k));
  const aviso = temporalNotice(period("2024-01-01", "2024-12-31"), secciones);
  assert(aviso, "no avisa de que se están mezclando dos momentos");
  assert(aviso!.includes("2024-01-01") && aviso!.includes("2024-12-31"),
    "el aviso no dice de qué periodo habla el proceso");
  assert(/actual/i.test(aviso!), "el aviso no dice que el contexto es el de hoy");
  assert(/no se reconstruyen/i.test(aviso!),
    "el aviso no explica que esos dominios no se pueden reconstruir a esa fecha");
});

check("F3. Viendo el presente NO hay aviso: no hay nada que aclarar", () => {
  assert(temporalNotice(CURRENT, LLAVES.map((k) => seccion(k))) === null,
    "avisa de una mezcla temporal que no existe");
});

check("F4. Sin secciones no hay aviso temporal que dar", () => {
  assert(temporalNotice(period("2024-01-01", "2024-12-31"), []) === null,
    "avisa de la mezcla de momentos de un contexto vacío");
});

// ===========================================================================
console.log("\nG · La atención del proceso");
// ===========================================================================

const conAtencion = [
  seccion("risks", { label: "Riesgos", count: 5, attentionCount: 3, href: "/quality/risks" }),
  seccion("audit_findings", { label: "Hallazgos", count: 2, attentionCount: 1 }),
  seccion("cases", { label: "Casos", count: 4, attentionCount: 2 }),
  seccion("indicators", { label: "Indicadores", count: 9, attentionCount: null }),
];

check("G1. Sale del recuento del dominio, no de las filas de la muestra", () => {
  const items = processAttention("proc-1", conAtencion);
  const riesgos = items.find((i) => i.domain === "risks");
  assert(riesgos, "no hay atención de riesgos");
  assert(riesgos!.reason.startsWith("3 "), `dice «${riesgos!.reason}» con 3 activos de 5`);
});

check("G2. Cada punto lleva causa, dominio, enlace y momento", () => {
  for (const it of processAttention("proc-1", conAtencion)) {
    assert(it.reason.length > 0, "un punto de atención sin motivo");
    assert(it.domain.length > 0, "un punto sin dominio");
    assert(it.href.startsWith("/quality/"), `enlace inválido: ${it.href}`);
    assert(it.temporal.mode === "current", "un punto sin momento declarado");
    assert(it.observer.kind === "truth_source",
      "el observador no es el estado del propio dominio, y aquí no interviene ninguna regla");
    assert(it.dedupeKey.split(":").length === 4, `clave mal formada: ${it.dedupeKey}`);
  }
});

check("G3. Un indicador fuera de meta NO se convierte en atención aquí", () => {
  const items = processAttention("proc-1", conAtencion);
  assert(!items.some((i) => i.domain === "indicators"),
    "el mirador decidió por su cuenta que un indicador pide atención");
});

check("G4. Y en ningún caso se le llama «no conformidad»", () => {
  const textos = processAttention("proc-1", conAtencion).map((i) => i.reason).join(" ");
  assert(!/no conformidad/i.test(textos), "la atención llama no conformidad a un hallazgo");
  assert(/no es por sí mismo una no conformidad/i.test(SECTION_NOTE.indicators),
    "no se aclara que un indicador fuera de meta no es una no conformidad");
  assert(/lo decide su evaluación/i.test(SECTION_NOTE.audit_findings),
    "no se aclara quién decide si un hallazgo es una no conformidad");
});

check("G5. Una sección rota o denegada NO aporta atención", () => {
  for (const estado of ["unavailable", "not_visible"] as const) {
    const items = processAttention("proc-1",
      [seccion("risks", { status: estado, count: null, attentionCount: 4 })]);
    assert(items.length === 0, `una sección ${estado} produjo atención con un número que no se sabe`);
  }
});

check("G6. Cero pendientes no produce una línea de atención vacía", () => {
  assert(processAttention("proc-1", [seccion("risks", { attentionCount: 0 })]).length === 0,
    "enseña «0 riesgos siguen activos» como si pidiera atención");
});

check("G7. Cada condición tiene identidad propia y estable", () => {
  const a = processAttention("proc-1", conAtencion).map((i) => i.dedupeKey);
  const b = processAttention("proc-1", conAtencion).map((i) => i.dedupeKey);
  assert(a.length === new Set(a).size, "dos condiciones distintas comparten clave");
  assert(JSON.stringify(a) === JSON.stringify(b), "la clave cambia entre dos lecturas iguales");
  // Y no se deduplica por el texto visible.
  assert(!a.some((k) => /siguen activos|sin cerrar|sin evaluar/.test(k)),
    "la clave contiene el texto que se enseña, que cambia al reescribirlo");
});

// ===========================================================================
console.log("\nH · El vocabulario de cada dominio, conservado");
// ===========================================================================

check("H1. Cada estado se dice con la palabra de SU dominio", () => {
  assert(stateLabel("risks", "active") === "Activo", "el riesgo no usa el estado de Riesgos");
  assert(stateLabel("cases", "closed") !== "closed", "el caso enseña jerga de base de datos");
  assert(stateLabel("audit_findings", "pending") !== "pending", "el hallazgo enseña su código");
  assert(stateLabel("documents", "approved") === "Aprobado", "el documento no usa TrazaDocs");
  assert(stateLabel("indicators", "active") !== "active", "el indicador enseña su código");
  assert(requirementLinkLabel("addressed_by") === "Lo gestiona",
    "la relación requisito→proceso no usa la palabra de 12.3");
});

check("H2. Un estado sin etiquetar se enseña tal cual, y se nota", () => {
  assert(stateLabel("risks", "inventado") === "inventado",
    "un estado nuevo se traduce a algo que no significa");
  assert(stateLabel("risks", null) === null, "un estado ausente se inventa");
});

check("H3. La gravedad solo donde el dominio gradúa", () => {
  assert(severityLabel("audit_findings", "major") !== "major",
    "el hallazgo no usa la graduación de Auditorías");
  assert(severityLabel("risks", null) === null, "se inventa una gravedad para el riesgo");
  assert(!/severidad|gravedad de Quality|puntuaci/i.test(DOMINIO.replace(/\*[^\n]*/g, "")),
    "aparece una escala de gravedad propia del mirador");
});

// ===========================================================================
console.log("\nI · Lo derivado se presenta como derivado");
// ===========================================================================

check("I1. Cada fila derivada explica por qué camino llegó", () => {
  const vias = [...CARGADOR.matchAll(/const VIA_[A-Z_]+ = "([^"]+)"/g)].map((m) => m[1]);
  assert(vias.length >= 4, `esperaba los cuatro caminos, hay ${vias.length}`);
  for (const v of vias) {
    assert(/caso|referencia/i.test(v), `un camino que no dice de dónde viene: «${v}»`);
  }
  assert(/\{item\.via\}/.test(MIRADOR), "el mirador no enseña por qué camino llegó cada fila");
});

check("I2. Se advierte de que NO es una relación mantenida a mano", () => {
  assert(/DERIVADA/.test(CARGADOR), "no se advierte que la relación es derivada");
  assert(/\{section\.note\}/.test(MIRADOR), "el mirador no enseña esa advertencia");
});

check("I3. Sin nada que derivar no se enseña una caja vacía", () => {
  assert(/d\.status !== "ok" \|\| \(d\.count \?\? 0\) > 0/.test(CARGADOR),
    "una derivación vacía se enseñaría como sección, invitando a rellenarla");
});

check("I4. No se persiste la relación ni se inventa una tabla", () => {
  for (const prohibida of ["supplier_processes", "complaint_processes",
                           "quality_attention", "quality_process_context",
                           "quality_integration", "quality_dashboard"]) {
    assert(!CARGADOR.includes(`"${prohibida}"`),
      `el cargador lee de una tabla prohibida por QI-23: ${prohibida}`);
  }
  const inserta = /\.(insert|update|upsert|delete)\(/.test(CARGADOR);
  assert(!inserta, "el cargador del mirador escribe: es una capa de lectura");
});

check("I5. De la queja se enseña el asunto, nunca quién", () => {
  const consulta = CARGADOR.match(/quality_customer_feedback"\)\s*\n?\s*\.select\("([^"]+)"/)?.[1] ?? "";
  assert(consulta, "no se encontró la lectura de retroalimentación");
  for (const prohibido of ["reporter_name", "customer_id", "contact_id", "response_id"]) {
    assert(!consulta.includes(prohibido),
      `la queja se lee con ${prohibido}: reidentifica a quien la puso`);
  }
  assert(/nunca quién|nunca quien/i.test(CARGADOR), "no se declara la regla de anonimato");
});

// ===========================================================================
console.log("\nJ · La frontera de la tarea propia · QI-24");
// ===========================================================================

check("J1. Ninguna tarea propia de dominio se convierte en acción", () => {
  for (const tabla of ["quality_learning_activities", "quality_development_plan_items",
                       "quality_measurements", "quality_supplier_evaluations",
                       "quality_stakeholder_reviews", "quality_knowledge_transfer_plans"]) {
    assert(!CARGADOR.includes(tabla),
      `el mirador lee ${tabla} para la sección de acciones: eso es QI-24 al revés`);
  }
  assert(!CARGADOR.includes("work_actions"),
    "el mirador lee acciones por su cuenta en vez de dejárselo al dominio de casos");
});

check("J2. Y se dice en pantalla, porque no es evidente", () => {
  assert(/no es una acción transversal y no se cuenta aquí/i.test(SECTION_NOTE.cases),
    "no se aclara qué NO entra en casos y acciones");
});

// ===========================================================================
console.log("\nK · Sin esquema nuevo");
// ===========================================================================

/**
 * B2 se entregó sobre la cabecera 0152 y NO añadió esquema. Lo que se comprueba
 * es esa promesa, no el número: fijar la cabecera en 152 habría puesto en rojo
 * este tramo el día que otro añadiera una migración por un motivo distinto, que
 * es exactamente lo que pasó en B3. La promesa se sigue verificando; el número,
 * que era una foto y no un invariante, ya no.
 */
check("K1. El mirador se entregó sobre 0152 y no bajó de ahí", () => {
  const nums = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => Number(f.slice(0, 4)))
    .filter((n) => Number.isFinite(n));
  assert(Math.max(...nums) >= 152, `la cabecera es ${Math.max(...nums)}`);
  assert(nums.includes(152), "desapareció la migración sobre la que se construyó B2");
});

check("K2. Ninguna migración existe POR el mirador", () => {
  const dir = "supabase/migrations";
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
    const contenido = readFileSync(`${dir}/${f}`, "utf8");
    for (const prohibida of ["quality_process_cockpit", "quality_attention",
                             "quality_dashboard", "quality_supplier_processes",
                             "quality_complaint_processes"]) {
      assert(!new RegExp(`create table[^;]*${prohibida}`, "i").test(contenido),
        `${f} crea la tabla ${prohibida}`);
    }
  }
});

// ===========================================================================
console.log("\nL · Navegación · QI-25");
// ===========================================================================

check("L1. El grupo pasa a llamarse «Evaluación»", () => {
  assert(QUALITY_EVALUACION_GROUP.title === "Evaluación",
    `el grupo se llama «${QUALITY_EVALUACION_GROUP.title}»`);
  assert(!/desempe/i.test(QUALITY_EVALUACION_GROUP.title),
    "el grupo lleva el título literal del capítulo 9 a la navegación");
  const dentro = QUALITY_EVALUACION_GROUP.items.map((i) => i.label);
  assert(dentro.includes("Objetivos") && dentro.includes("Indicadores"),
    `el grupo perdió entradas: ${dentro.join(", ")}`);
  assert(dentro.length === 2, `el grupo ganó entradas que no le tocaban: ${dentro.join(", ")}`);
});

check("L2. Personas CONSERVA su «Desempeño»", () => {
  const dentro = QUALITY_PERSONAS_GROUP.items.map((i) => i.label);
  assert(dentro.includes("Desempeño"), "se le quitó su nombre propio a la entrada de Personas");
  assert(QUALITY_PERSONAS_GROUP.items.length === 7,
    `Personas tiene ${QUALITY_PERSONAS_GROUP.items.length} entradas en vez de 7`);
});

check("L3. Ya no hay dos «Desempeño» en el mismo menú", () => {
  const titulos = QUALITY_SHELL_MODULE.groups.map((g: { title: string }) => g.title);
  assert(titulos.filter((t: string) => t === "Desempeño").length === 0,
    "sigue habiendo un grupo llamado Desempeño");
  assert(titulos.length === new Set(titulos).size, "hay dos grupos con el mismo título");
});

check("L4. Auditorías y Revisión por la dirección NO se mudaron", () => {
  const titulos = QUALITY_SHELL_MODULE.groups.map((g: { title: string }) => g.title);
  assert(titulos.includes("Auditorías"), "Auditorías dejó de ser un grupo propio");
  assert(titulos.includes("Revisión por la dirección"),
    "Revisión por la dirección dejó de ser un grupo propio");
  assert(QUALITY_EVALUACION_GROUP.items.every((i) => !/auditor|revisi/i.test(i.label)),
    "se reorganizó por capítulos de la norma, que es lo que 13A rechazó");
});

check("L5. Ningún otro grupo cambió de nombre ni de sitio", () => {
  const titulos = QUALITY_SHELL_MODULE.groups.map((g: { title: string }) => g.title);
  const esperados = ["Contexto", "Sistema de gestión", "Personas", "Proveedores",
                     "Voz del cliente", "Evaluación", "Riesgos y oportunidades",
                     "Casos y acciones", "Auditorías", "Revisión por la dirección",
                     "Automatización", "Intelligence", "Documentación"];
  assert(JSON.stringify(titulos) === JSON.stringify(esperados),
    `la navegación cambió más de la cuenta:\n  ${titulos.join(" · ")}`);
});

// ===========================================================================
console.log("\nM · Observación, no multiplicación de puertas");
// ===========================================================================

check("M1. El mirador ofrece VER, nunca CREAR ni EDITAR", () => {
  const enlaces = [...MIRADOR.matchAll(/>\s*\{?\s*(Ver|Crear|Editar|Añadir|Agregar)\b/g)]
    .map((m) => m[1]);
  assert(enlaces.length > 0, "el mirador no ofrece ningún destino");
  for (const verbo of enlaces) {
    assert(verbo === "Ver", `el mirador ofrece «${verbo}»: es un mirador, no una portada de altas`);
  }
});

check("M2. No se inventa una puntuación global del proceso", () => {
  const texto = MIRADOR + DOMINIO;
  assert(!/puntuaci[oó]n|score|semáforo|nota global|índice de calidad/i.test(texto),
    "aparece una puntuación global de Quality");
});

check("M3. Ni lenguaje de garantía", () => {
  for (const [nombre, src] of [["mirador", MIRADOR], ["dominio", DOMINIO]] as const) {
    assert(!/cumplimiento garantizado|certificad|conforme a la norma/i.test(src),
      `el ${nombre} afirma cumplimiento`);
  }
});

// ===========================================================================
console.log(`\nQUALITY-13B2 · mirador (decisiones): ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
