/**
 * Trazaloop · QUALITY-13B4 · La portada, sin base y sin DOM.
 *
 * Aquí van las decisiones: qué se agrupa cómo, cuándo se puede decir que no hay
 * nada, qué dominios existen y qué palabras NO pueden llegar a la pantalla.
 *
 * Y la comprobación que más vale del tramo: que la portada **no vuelve a
 * contar**. La vieja preguntaba a doce dominios con doce formas de contar; si
 * alguno de esos cargadores reapareciera aquí, la duplicación que B3 quitó
 * volvería por la puerta de atrás.
 *
 * Correr: npm run test:quality13b4-home
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  ATTENTION_GROUPS, ATTENTION_NOTE, GROUP_LABEL, HOME_DOMAINS, HOME_SAMPLE,
  INTERNAL_VOCABULARY, attentionNote, attentionState, domainAttention, domainLabel,
  filterHref, filterSummary, groupAttention, groupOf, incompleteNotice, incompleteSources,
  parseFilters, toLine, unplacedDomains,
} from "../../lib/domain/quality-home";
import { summarizeAttention } from "../../lib/domain/quality-attention";
import { CURRENT, attentionKey, type AttentionItem } from "../../lib/domain/quality-integration";
import { OBSERVERS } from "../../lib/domain/quality-observers";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const leer = (p: string) => readFileSync(p, "utf8");
const PAGINA = leer("app/(app)/(shell)/quality/page.tsx");
const COMPOSICION = leer("lib/db/quality-home.ts");
const VISTA = leer("components/domain/quality/home-view.tsx");
const DOMINIO = leer("lib/domain/quality-home.ts");

/** Un punto de atención de mentira, con el observador que se diga. */
function punto(o: {
  observer: string; domain?: string; condition?: string; subjectId?: string;
  severity?: string | null; label?: string;
}): AttentionItem {
  const domain = o.domain ?? "risks";
  const subjectId = o.subjectId ?? "s-1";
  const condition = o.condition ?? "cond";
  return {
    domain, subjectKind: "quality_risk", subjectId,
    label: o.label ?? "Sujeto de prueba", reason: "Motivo del dominio",
    state: "open", severity: o.severity === undefined ? "warning" : o.severity,
    since: null, href: `/quality/risks/${subjectId}`,
    observer: { code: o.observer, kind: "legacy_sweep" },
    temporal: CURRENT,
    dedupeKey: attentionKey({ domain, subjectKind: "quality_risk", subjectId, condition }),
  };
}

const OK = [{ source: "a", label: "A", status: "ok" }, { source: "b", label: "B", status: "ok" }];
const ROTA = [{ source: "a", label: "A", status: "ok" },
              { source: "b", label: "B", status: "unavailable" }];
const DENEGADA = [{ source: "a", label: "A", status: "ok" },
                  { source: "b", label: "B", status: "not_visible" }];

console.log("\nQUALITY-13B4 · Portada de Quality · decisiones\n");

// ===========================================================================
console.log("A · La portada pregunta UNA vez");
// ===========================================================================

check("A1. La página compone por la vía convergida y no consulta nada", () => {
  assert(PAGINA.includes("loadQualityHome"), "la página no compone la portada");
  assert(COMPOSICION.includes("loadAttention"),
    "la composición no consume la atención convergida de B3");
  assert(!/from\(["'`]/.test(VISTA), "la vista construye una consulta");
  assert(!/createServerClient|createBrowserClient/.test(VISTA),
    "la vista se crea su propio cliente");
});

check("A2. Los cargadores que SOLO contaban atención salieron de la portada", () => {
  // Sus condiciones están todas en la atención convergida; volver a llamarlos
  // sería contar dos veces lo mismo, que es el fallo que B3 arregló.
  const fuera = ["getPeopleSignals", "getCustomerVoiceHomeSignals", "getAuditHomeSignals"];
  for (const f of fuera) {
    assert(!COMPOSICION.includes(f), `la composición sigue llamando a ${f}`);
    assert(!PAGINA.includes(f), `la página sigue llamando a ${f}`);
  }
});

check("A3. Los que quedan sirven para el CONTEXTO, no para contar atención", () => {
  for (const f of ["getQualitySummary", "getRiskSummary", "getCaseSummary",
                   "getManagementReviewHomeSignals", "getSupplierHomeSignals",
                   "getAutomationHomeSignals", "listIndicators", "listObjectives"]) {
    assert(COMPOSICION.includes(f), `desapareció el contexto que daba ${f}`);
  }
  // Y lo que se enseña de ellos NO son condiciones de atención.
  assert(/aboveAppetite/.test(COMPOSICION) && /openNonconformities/.test(COMPOSICION),
    "se perdió el contexto administrativo de riesgos o de casos");
});

check("A4. Todos los recuentos de atención salen del resumen deduplicado", () => {
  assert(/summarizeAttention/.test(COMPOSICION), "la composición no resume lo convergido");
  assert(/domainAttention/.test(VISTA), "la vista no toma la atención por dominio del resumen");
  assert(!/\.length \+/.test(VISTA), "la vista suma longitudes de listas para dar un total");
  assert(!/reduce\(/.test(VISTA), "la vista hace sus propias cuentas");
});

check("A5. La portada no edita nada", () => {
  assert(!/<form/.test(VISTA), "la portada tiene un formulario");
  assert(!/server\/actions/.test(VISTA), "la portada llama a una acción de servidor");
  assert(!/Marcar como resuelto|Resolver|Descartar/i.test(VISTA),
    "la portada ofrece resolver, y resolver es del dominio dueño");
});

// ===========================================================================
console.log("\nB · Sin dato NO es cero, y «no hay nada» tiene UNA condición");
// ===========================================================================

check("B1. Con todo leído y cero asuntos, y SOLO entonces, se puede decir que no hay", () => {
  const e = attentionState(0, OK);
  assert(e.kind === "all_clear", `con todo leído y cero llegó ${e.kind}`);
  assert(/observada ahora mismo/i.test(e.kind === "all_clear" ? e.text : ""),
    "el despejado no dice que habla de lo observado ahora");
});

check("B2. Con una fuente caída y cero asuntos, NO se dice que no hay nada", () => {
  for (const fuentes of [ROTA, DENEGADA]) {
    const e = attentionState(0, fuentes);
    assert(e.kind === "incomplete_empty", `llegó ${e.kind} faltando información`);
    assert(/no es un «todo en orden»/i.test(e.kind === "incomplete_empty" ? e.text : ""),
      "no se advierte de que falta información");
  }
});

check("B3. El despejado NO afirma conformidad", () => {
  const e = attentionState(0, OK);
  const texto = e.kind === "all_clear" ? e.text : "";
  for (const prohibido of ["ISO", "cumple", "conforme", "certificad", "garantiz"]) {
    assert(!new RegExp(prohibido, "i").test(texto),
      `el despejado afirma cumplimiento: «${texto}»`);
  }
  // Solo el texto visible: «aviso» contiene «iso», y buscar la subcadena
  // pondría en rojo una palabra perfectamente inocente.
  const visible = [...VISTA.matchAll(/>([^<>{}]{3,})</g)].map((m) => m[1]).join(" ");
  assert(!/\bISO\b|certificad|cumplimiento garantizado|\bconforme\b/i.test(visible),
    "la portada afirma cumplimiento en algún sitio");
});

check("B4. Se distingue lo que no se pudo leer de lo que no se puede ver", () => {
  const rota = incompleteNotice(ROTA)!;
  const denegada = incompleteNotice(DENEGADA)!;
  assert(rota && denegada, "no se avisa de la información que falta");
  assert(/no fue posible cargar/i.test(rota), `la caída dice «${rota}»`);
  assert(/no da acceso/i.test(denegada), `la denegada dice «${denegada}»`);
  assert(rota !== denegada, "las dos situaciones dicen lo mismo");
  assert(incompleteNotice(OK) === null, "se avisa de una falta que no existe");
  assert(incompleteSources(ROTA).length === 1, "no se identifica la fuente que falta");
});

check("B5. Y no se filtra jerga del motor en ninguno de los dos textos", () => {
  for (const t of [incompleteNotice(ROTA)!, incompleteNotice(DENEGADA)!]) {
    assert(!/PGRST|permission denied|relation|SQL|null/i.test(t), `filtra jerga: «${t}»`);
  }
});

// ===========================================================================
console.log("\nC · El agrupado, y ninguna escala inventada");
// ===========================================================================

check("C1. Tres grupos, y los tres salen de B3", () => {
  assert(ATTENTION_GROUPS.length === 3, `hay ${ATTENTION_GROUPS.length} grupos`);
  assert(groupOf(punto({ observer: "quality_scan_risk_reviews.risk_review_overdue" }))
    === "overdue", "una revisión vencida no se agrupa como vencida");
  assert(groupOf(punto({ observer: "quality_scan_audits.audit_upcoming" }))
    === "due_soon", "una auditoría próxima no se agrupa como próxima");
  assert(groupOf(punto({ observer: "quality_review_control.control_ineffective" }))
    === "state", "un control ineficaz se clasifica en el tiempo, y no habla de fechas");
});

check("C2. NO hay alta / media / baja global", () => {
  const etiquetas = Object.values(GROUP_LABEL).join(" ").toLowerCase();
  for (const prohibido of ["alta", "media", "baja", "crítica", "prioridad"]) {
    assert(!etiquetas.includes(prohibido), `los grupos usan una escala global: ${prohibido}`);
  }
  for (const [n, src] of [["vista", VISTA], ["dominio", DOMINIO]] as const) {
    assert(!/attention_score|quality_score|puntuaci[oó]n|sem[aá]foro/i.test(
      src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")),
      `el ${n} inventa una puntuación global`);
  }
});

check("C3. La gravedad se conserva y no se normaliza", () => {
  const l = toLine(punto({ observer: "x", severity: "critical" }));
  assert(l.severity === "critical", `la gravedad llegó como ${l.severity}`);
  const sin = toLine(punto({ observer: "x", severity: null }));
  assert(sin.severity === null, "se inventó una gravedad donde el dominio no gradúa");
});

check("C4. Sin grupos vacíos", () => {
  const g = groupAttention([punto({ observer: "quality_scan_risk_reviews.risk_review_overdue" })]);
  assert(g.length === 1, `se pintan ${g.length} grupos con una sola clase de punto`);
  assert(groupAttention([]).length === 0, "se pintan grupos sin nada dentro");
});

// ===========================================================================
console.log("\nD · Los dominios de la portada");
// ===========================================================================

check("D1. Contexto está, y es el que faltaba", () => {
  const contexto = HOME_DOMAINS.find((d) => d.key === "context");
  assert(contexto, "Partes interesadas sigue sin aparecer en la portada");
  assert(contexto!.href === "/quality/context/interested-parties",
    `Contexto lleva a ${contexto!.href}`);
  assert(contexto!.attentionDomains.includes("interested_parties"),
    "Contexto no recoge su atención");
});

check("D2. Ningún dominio observado se queda sin baldosa", () => {
  // Se construye un resumen con TODOS los dominios que el inventario observa.
  const items = [...new Set(OBSERVERS.map((o) => o.domain))].map((d, i) =>
    punto({ observer: "x", domain: d, subjectId: `s-${i}` }));
  const huerfanos = unplacedDomains(summarizeAttention(items));
  assert(huerfanos.length === 0,
    `hay atención que la portada no sabe dónde poner: ${huerfanos.join(", ")}`);
});

check("D3. Cada baldosa lleva a una ruta que existe", () => {
  for (const d of HOME_DOMAINS) {
    assert(d.href.startsWith("/quality/"), `${d.key} lleva fuera de Quality: ${d.href}`);
    const carpeta = `app/(app)/(shell)${d.href}`;
    assert(existsSync(carpeta), `${d.key} lleva a una pantalla que no existe: ${d.href}`);
  }
});

check("D4. La atención por baldosa sale del resumen, no de una cuenta propia", () => {
  const resumen = summarizeAttention([
    punto({ observer: "x", domain: "cases", subjectId: "c1" }),
    punto({ observer: "x", domain: "actions", subjectId: "a1" }),
    punto({ observer: "x", domain: "risks", subjectId: "r1" }),
  ]);
  const casos = HOME_DOMAINS.find((d) => d.key === "cases")!;
  assert(domainAttention(casos, resumen) === 2,
    "«Casos y acciones» no suma sus dos dominios de atención");
  const riesgos = HOME_DOMAINS.find((d) => d.key === "risks")!;
  assert(domainAttention(riesgos, resumen) === 1, "riesgos cuenta mal");
  const personas = HOME_DOMAINS.find((d) => d.key === "people")!;
  assert(domainAttention(personas, resumen) === 0, "personas inventa atención");
});

check("D5. Los nombres son de producto, nunca de base de datos", () => {
  for (const d of HOME_DOMAINS) {
    assert(!/_/.test(d.label), `la baldosa ${d.key} enseña un nombre técnico: ${d.label}`);
    assert(d.label[0] === d.label[0].toUpperCase(), `${d.label} no está capitalizado`);
  }
  assert(domainLabel("customer") === "Voz del cliente", "el dominio de clientes se ve en crudo");
  assert(domainLabel("interested_parties") === "Partes interesadas", "el contexto se ve en crudo");
  assert(domainLabel("inventado") === "inventado", "se inventa un nombre para un dominio ajeno");
});

// ===========================================================================
console.log("\nE · Los filtros");
// ===========================================================================

check("E1. Se resuelven en SERVIDOR, con los parámetros de B3", () => {
  assert(/domain: query\.domain/.test(COMPOSICION) && /processId: query\.processId/.test(COMPOSICION),
    "los filtros no llegan a la consulta convergida");
  assert(/searchParams/.test(PAGINA), "la página no lee los filtros de la URL");
  // `.filter(Boolean)` para juntar textos no es filtrar un conjunto de datos;
  // lo que no puede haber es la vista recortando los puntos de atención.
  assert(!/useState|useMemo/.test(VISTA), "la vista mantiene estado propio");
  assert(!/home\.items\.filter|items\.filter\(/.test(VISTA),
    "la vista filtra los puntos de atención sobre una muestra parcial");
  assert(!/summary\.byDomain\[[^\]]+\] \+/.test(VISTA), "la vista recalcula por dominio");
});

check("E2. Un dominio inventado se ignora en vez de vaciar la portada", () => {
  assert(parseFilters({ dominio: "risks" }).domain === "risks", "no acepta un dominio válido");
  assert(parseFilters({ dominio: "tabla_secreta" }).domain === null,
    "acepta un dominio que no existe, y devolvería vacío como si no hubiera nada");
  assert(parseFilters({}).domain === null, "inventa un filtro donde no lo hay");
  assert(parseFilters({ proceso: "abc" }).processId === "abc", "pierde el filtro de proceso");
});

check("E3. El enlace del filtro conserva lo demás", () => {
  assert(filterHref("/quality", { domain: "risks", processId: null })
    === "/quality?dominio=risks", "el enlace de dominio está mal");
  assert(filterHref("/quality", { domain: "risks", processId: "p1" })
    === "/quality?dominio=risks&proceso=p1", "cambiar de dominio pierde el proceso");
  assert(filterHref("/quality", { domain: null, processId: null }) === "/quality",
    "sin filtros se ensucia la URL");
});

check("E4. Se dice qué se está mirando", () => {
  assert(filterSummary({ domain: null, processId: null }, null) === null,
    "se anuncia un filtro inexistente");
  const s = filterSummary({ domain: "risks", processId: "p1" }, "Despacho")!;
  assert(s.includes("Riesgos") && s.includes("Despacho"),
    `el resumen del filtro dice «${s}»`);
});

check("E5. Filtrando por proceso se ofrece el mirador", () => {
  assert(/Ver mirador del proceso/.test(VISTA),
    "no se ofrece el mirador del proceso al filtrar por uno");
  assert(/quality\/processes\/\$\{filters\.processId\}/.test(VISTA),
    "el enlace al mirador no usa el proceso filtrado");
});

// ===========================================================================
console.log("\nF · Lo que NO se enseña");
// ===========================================================================

check("F1. Ni una palabra del motor llega a la pantalla", () => {
  const texto = [...VISTA.matchAll(/>([^<>{}]{4,})</g)].map((m) => m[1]).join(" ").toLowerCase();
  for (const p of INTERNAL_VOCABULARY) {
    assert(!texto.includes(p.toLowerCase()),
      `la portada enseña vocabulario de dentro: «${p}»`);
  }
});

check("F2. El punto de atención NO enseña quién lo observó", () => {
  const l = toLine(punto({ observer: "quality_scan_audits.audit_overdue" }));
  const valores = Object.values(l).join(" ");
  assert(!valores.includes("quality_scan_audits"),
    "la línea de atención enseña el nombre del barrido");
  assert(!/observer|dedupe/i.test(JSON.stringify(Object.keys(l))),
    "la línea expone campos internos");
});

check("F3. Se aclara qué NO es una no conformidad, y en la línea", () => {
  assert(attentionNote("quality_emit_performance_signals.indicator_target_missed"),
    "no se aclara lo del indicador fuera de meta");
  assert(attentionNote("quality_scan_audits.audit_finding_unevaluated"),
    "no se aclara lo del hallazgo sin evaluar");
  assert(attentionNote("quality_scan_customer_voice.complaint_unreviewed"),
    "no se aclara lo de la queja sin revisar");
  for (const [codigo, texto] of Object.entries(ATTENTION_NOTE)) {
    assert(/no conformidad/i.test(texto), `la nota de ${codigo} no dice qué no es`);
    assert(OBSERVERS.some((o) => o.code === codigo),
      `la nota habla de un observador que no existe: ${codigo}`);
  }
  assert(/l\.note/.test(VISTA), "la vista no pinta la aclaración");
});

check("F4. La tarea propia de dominio sigue llevando a su dominio", () => {
  const nativas = OBSERVERS.filter((o) =>
    o.code.startsWith("quality_scan_people_signals.") && o.subjectKind !== "work_action");
  assert(nativas.length >= 5, "el inventario perdió las tareas propias de personas");
  const personas = HOME_DOMAINS.find((d) => d.key === "people")!;
  assert(personas.href.startsWith("/quality/people"),
    "las tareas propias de personas llevarían a otro sitio");
});

// ===========================================================================
console.log("\nG · Muestra, jerarquía y esquema");
// ===========================================================================

check("G1. La muestra está acotada y se dice cuántos faltan", () => {
  assert(HOME_SAMPLE <= 10, `la portada pinta hasta ${HOME_SAMPLE} líneas`);
  assert(/const MUESTRA = 8/.test(COMPOSICION), "la composición no acota la muestra");
  assert(/Se muestran/.test(VISTA), "no se dice que se está viendo una muestra");
});

check("G2. La atención va ANTES que los recuentos administrativos", () => {
  const atencion = VISTA.indexOf("<AttentionArea");
  const dominios = VISTA.indexOf("<DomainTiles");
  assert(atencion > 0 && dominios > 0, "falta alguna de las dos zonas");
  assert(atencion < dominios, "los recuentos administrativos van antes que la atención");
});

check("G3. Y nada se llama «desempeño» siendo completitud", () => {
  const texto = [...VISTA.matchAll(/>([^<>{}]{3,})</g)].map((m) => m[1]).join(" ");
  assert(!/desempe/i.test(texto),
    "la portada vuelve a llamar «desempeño» a algo que no lo es");
});

/**
 * B4 se entregó sin migración: consume B1 y B3. Lo que se comprueba es esa
 * promesa —que ninguna migración existe POR la portada—, no el número de la
 * cabecera, que era una foto del día de la entrega.
 */
check("G4. Ninguna migración existe por la portada", () => {
  for (const f of readdirSync("supabase/migrations").filter((x) => x.endsWith(".sql"))) {
    const c = leer(`supabase/migrations/${f}`).replace(/^--.*$/gm, "");
    // Ninguna estructura de portada ni de tablero de Quality. `v_guided_flow_dashboard`
    // de 0032 es del onboarding de la plataforma y lleva ahí desde antes.
    assert(!/(create|alter) (table|view)[^;]*quality_(home|dashboard)/i.test(c),
      `${f} tiene esquema de la portada de Quality`);
  }
  for (const f of readdirSync("supabase/migrations").filter((x) => x.endsWith(".sql"))) {
    const c = leer(`supabase/migrations/${f}`);
    for (const t of ["quality_attention", "quality_dashboard", "quality_home"]) {
      assert(!new RegExp(`create table[^;]*${t}`, "i").test(c), `${f} crea la tabla ${t}`);
    }
  }
});

check("G5. Ni un enlace a PCR o Textiles", () => {
  for (const [n, src] of [["vista", VISTA], ["dominio", DOMINIO],
                          ["composición", COMPOSICION], ["página", PAGINA]] as const) {
    for (const p of ["/traceability", "/textiles"]) {
      assert(!src.includes(`"${p}`), `la ${n} enlaza a ${p}`);
    }
  }
});

check("G6. Lo asignado a ti no suma al total de la empresa", () => {
  assert(/personalLines/.test(VISTA), "desapareció lo asignado a la persona");
  assert(/ya están contados arriba/.test(VISTA),
    "no se aclara que lo propio ya está dentro del total, y se leería como un total aparte");
  assert(!/personalLines\.length \+/.test(VISTA), "lo personal se suma al total");
});

console.log(`\nQUALITY-13B4 · portada (decisiones): ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
