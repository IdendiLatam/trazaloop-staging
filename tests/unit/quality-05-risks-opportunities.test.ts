/**
 * Trazaloop · QUALITY-05 · Puras y estáticas.
 *
 * Comprueban que las separaciones de RO existan EN EL CÓDIGO y no solo en la
 * prosa: que riesgo y no conformidad no compartan camino, que control y acción
 * sean cosas distintas, que la metodología no esté cableada, y que ninguna
 * versión publicada pueda reescribirse.
 *
 * Ninguna toca base de datos ni red: son las que tienen que seguir verdes en
 * cualquier máquina y en cualquier momento.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGGREGATIONS, AGGREGATION_LABEL, ASSESSMENT_KINDS, ASSESSMENT_KIND_HINT,
  CAUSE_SOURCES, CONTROL_NATURES, CONTROL_NATURE_HINT, CONTROL_NATURE_LABEL,
  CONTROL_STATUSES, DESIGN_VERDICTS, EFFECTIVENESS_VERDICTS, EFFECTIVENESS_VERDICT_LABEL,
  IMPACT_AREAS, IMPLEMENTATION_VERDICTS, MATERIALIZATION_SEVERITIES,
  METHODOLOGY_APPROACHES, METHODOLOGY_SCOPES, NO_AUTOMATIC_NC_NOTICE,
  OPERATION_MODES, OPPORTUNITY_ASSESSMENT_KINDS, OPPORTUNITY_DECISIONS,
  OPPORTUNITY_DECISION_HINT, OPPORTUNITY_DECISION_LABEL, OPPORTUNITY_KINDS,
  OPPORTUNITY_STATUSES, PLAN_STATUSES, RISK_ORIGINS, RISK_STATUSES, RISK_STATUS_LABEL,
  RISK_STRATEGIES, RISK_STRATEGY_HINT, RISK_STRATEGY_LABEL, VERSION_STATUSES,
  acceptanceNeedsApproval, canGovernMethodology, canGovernRisks, canManageRisks,
  controlIsTrustworthy, daysUntil, describeReview, explainDerivation, levelIsAcceptable,
  opportunityIsOpen, reviewIsOverdue, reviewMonthsFrom, riskIsOpen, versionCanAssess,
  versionIsEditable, type Derivation,
} from "../../lib/domain/risks";
import { LIFECYCLE_ENTITIES } from "../../lib/domain/lifecycle";
import { SUBJECT_TYPES, TASK_TYPES, ALERT_TYPES, TASK_TYPE_LABEL, ALERT_TYPE_LABEL } from "../../lib/domain/work-inbox";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, "");
const MIG = "supabase/migrations/0122_quality_risks_and_opportunities.sql";

let passed = 0, failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${name}: ${(e as Error).message}`); }
}

/** Compara ignorando tildes. El texto de la interfaz las lleva —y debe
 *  llevarlas—, pero una aserción no tiene por qué romperse cuando alguien
 *  corrige la ortografía de un mensaje. */
const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

console.log("\nQUALITY-05 · puras y estáticas\n");

// ---------------------------------------------------------------------------
console.log("A · Las separaciones que RO exige");

check("A1. RIESGO ≠ NO CONFORMIDAD · el dominio de riesgos no conoce la clasificación de casos", () => {
  const src = read("lib/domain/risks.ts");
  assert(!/nonconformity|no_conformidad/i.test(src),
    "el vocabulario de riesgos no debe contener la clasificación de no conformidad");
  // Y al revés: los estados de riesgo no incluyen ninguno que suene a juicio.
  for (const s of RISK_STATUSES) {
    assert(!/conform/i.test(s), `el estado «${s}» mezcla riesgo con conformidad`);
  }
});

check("A2. RIESGO MATERIALIZADO ≠ NC · la RPC de materialización no crea ningún caso", () => {
  const sql = stripSql(read(MIG));
  const i = sql.indexOf("function public.quality_materialize_risk");
  const j = sql.indexOf("$$;", sql.indexOf("$$", i) + 3);
  const body = sql.slice(i, j);
  assert(i > 0 && j > i, "no se encontró el cuerpo de quality_materialize_risk");
  assert(!/insert\s+into\s+work_cases/i.test(body),
    "materializar un riesgo NO puede abrir un caso por su cuenta");
  assert(!/classification/i.test(body),
    "materializar no puede tocar la clasificación de nada");
});

check("A3. CONTROL ≠ ACCIÓN · son tablas distintas y el control no tiene fecha de vencimiento", () => {
  const sql = stripSql(read(MIG));
  assert(/create table public\.quality_controls/.test(sql), "falta la tabla de controles");
  assert(!/create table public\.risk_actions/.test(sql), "no debe existir risk_actions");
  // Un control no vence: opera. Lo que vence es una acción.
  const i = sql.indexOf("create table public.quality_controls");
  const body = sql.slice(i, sql.indexOf(");", i));
  assert(!/due_on/.test(body), "un control no tiene fecha de vencimiento: eso es una acción");
});

check("A4. CAUSA ≠ EVENTO ≠ CONSECUENCIA · tres sitios distintos, no un textarea", () => {
  const sql = stripSql(read(MIG));
  assert(/create table public\.quality_risk_causes/.test(sql), "falta la tabla de causas");
  assert(/create table public\.quality_risk_consequences/.test(sql), "falta la tabla de consecuencias");
  assert(/event_description\s+text not null/.test(sql), "el evento debe vivir en el riesgo y ser obligatorio");
  // Y no debe existir un campo genérico que las vuelva a mezclar.
  assert(!/risk_description\s+text/.test(sql),
    "un «descripción del riesgo» genérico deshace la separación de RO-13.1");
});

check("A5. INHERENTE ≠ RESIDUAL · dos filas, nunca dos columnas", () => {
  const sql = stripSql(read(MIG));
  assert(/assessment_kind\s+text not null[\s\S]{0,120}'inherent','residual'/.test(sql),
    "el tipo de evaluación debe ser una columna con los dos valores");
  // Se mira el CUERPO de las tablas, no el archivo entero: la vista de
  // proyección sí expone `residual_score` como alias, y debe hacerlo — es
  // justo lo contrario del defecto que se persigue aquí.
  for (const t of ["quality_risks", "quality_risk_assessments"]) {
    const i = sql.indexOf(`create table public.${t} (`);
    const body = sql.slice(i, sql.indexOf("\n);", i));
    assert(!/residual_score|inherent_score/.test(body),
      `${t} guarda el residual junto al inherente: uno de los dos se pisaría en cada revisión`);
  }
});

check("A6. NIVEL ≠ ESTADO (RO-18) · ningún estado de riesgo es un nivel", () => {
  const levelish = ["low", "medium", "high", "extreme", "bajo", "medio", "alto"];
  for (const s of RISK_STATUSES) {
    assert(!levelish.includes(s), `«${s}» es un nivel, no un estado administrativo`);
  }
  // Y la vista los expone como campos separados.
  const sql = stripSql(read(MIG));
  assert(/current_level/.test(sql) && /r\.status/.test(sql),
    "la proyección debe exponer nivel y estado por separado");
});

check("A7. METODOLOGÍA ≠ EVALUACIÓN · la evaluación apunta por FK a una versión inmutable", () => {
  const sql = stripSql(read(MIG));
  assert(/methodology_version_id uuid not null/.test(sql),
    "la evaluación debe apuntar a la versión con la que se hizo");
  assert(/quality_risk_assessments_version_fk/.test(sql), "y con clave foránea real");
});

check("A8. OPORTUNIDAD ≠ ACCIÓN DE MEJORA · catálogos de decisión distintos", () => {
  const shared = (OPPORTUNITY_DECISIONS as readonly string[])
    .filter((d) => (RISK_STRATEGIES as readonly string[]).includes(d));
  assert(shared.length === 0,
    `riesgo y oportunidad no pueden compartir estrategias: ${shared.join(", ")}`);
  // «Evitar» o «transferir» aplicados a una oportunidad no significan nada.
  for (const forbidden of ["avoid", "reduce", "share", "accept"]) {
    assert(!(OPPORTUNITY_DECISIONS as readonly string[]).includes(forbidden),
      `«${forbidden}» es vocabulario de daño y no puede estar en oportunidades`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nB · La metodología no está cableada");

check("B1. no hay ninguna matriz 5×5 escrita en el código", () => {
  for (const f of ["lib/domain/risks.ts", "lib/db/risks.ts", "server/actions/risks.ts",
                   "components/domain/quality/risk-matrix.tsx"]) {
    const src = read(f);
    assert(!/probabilidad\s*[x×*]\s*impacto/i.test(src),
      `${f} cablea probabilidad × impacto`);
    assert(!/\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\s*\]/.test(src),
      `${f} cablea una escala 1–5`);
  }
});

check("B2. las dimensiones salen de la versión, no de una constante", () => {
  const src = read("components/domain/quality/risk-matrix.tsx");
  assert(/version\.scales\.filter\(\(s\) => s\.scaleKind === "dimension"\)/.test(src),
    "la matriz debe leer sus ejes de la versión de metodología");
  assert(/scaleKind === "result"/.test(src),
    "y la escala de resultado también");
});

check("B3. el nivel se deriva en UNA función, usada por la base y por la pantalla", () => {
  const sql = stripSql(read(MIG));
  assert(/function public\.quality_derive_level/.test(sql), "falta quality_derive_level");
  const db = read("lib/db/risks.ts");
  assert(/rpc\("quality_derive_level"/.test(db),
    "la aplicación debe preguntar a la misma función, no reimplementarla");
  // Y las RPC de evaluación tienen que usarla, no calcular por su cuenta.
  for (const fn of ["quality_assess_risk", "quality_assess_opportunity"]) {
    const i = sql.indexOf(`function public.${fn}`);
    const body = sql.slice(i, sql.indexOf("$$;", sql.indexOf("$$", i) + 3));
    assert(/quality_derive_level\(/.test(body), `${fn} debe derivar con la función común`);
  }
});

check("B4. las escalas admiten cualquier número de dimensiones", () => {
  const src = read("components/domain/quality/risk-matrix.tsx");
  assert(/dims\.length !== 2/.test(src),
    "con un número de dimensiones distinto de dos hay que dejar de fingir una cuadrícula");
});

check("B5. la agregación es declarada y cerrada", () => {
  assert(AGGREGATIONS.length >= 3, "debe haber varias reglas de combinación posibles");
  for (const a of AGGREGATIONS) {
    assert(typeof AGGREGATION_LABEL[a] === "string" && AGGREGATION_LABEL[a].length > 0,
      `la regla «${a}» necesita explicación en español`);
    assert(!/[×*]/.test(AGGREGATION_LABEL[a]) || a === "product",
      "las etiquetas se escriben en palabras, no en símbolos");
  }
});

// ---------------------------------------------------------------------------
console.log("\nC · Historical Truth");

check("C1. una versión publicada no se puede reescribir", () => {
  const sql = stripSql(read(MIG));
  assert(/function public\.quality_methodology_version_is_frozen/.test(sql),
    "falta el disparador que congela la versión");
  assert(/trigger quality_risk_methodology_versions_freeze before update/.test(sql),
    "el congelado debe ser un disparador, no una comprobación de pantalla");
});

check("C2. sus escalas tampoco", () => {
  const sql = stripSql(read(MIG));
  assert(/trigger quality_risk_scales_frozen/.test(sql), "faltan las escalas");
  assert(/trigger quality_risk_scale_levels_frozen/.test(sql), "faltan los niveles");
  assert(/before insert or update or delete on public\.quality_risk_scales/.test(sql),
    "congelar solo el update dejaría añadir niveles a una versión publicada");
});

check("C3. las evaluaciones son inmutables por completo", () => {
  const sql = stripSql(read(MIG));
  for (const t of ["quality_risk_assessments", "quality_opportunity_assessments",
                   "quality_control_effectiveness_reviews"]) {
    assert(new RegExp(`trigger ${t}_no_update before update`).test(sql), `${t} admite UPDATE`);
    assert(new RegExp(`trigger ${t}_no_delete before delete`).test(sql), `${t} admite DELETE`);
  }
});

check("C3b. la materialización protege el HECHO, y admite solo enlazar su caso", () => {
  // Distinta de las anteriores a propósito: el relato de lo que pasó es
  // inmutable, pero el caso que alguien decide abrir DESPUÉS no es una
  // reescritura del hecho. Bloquearlo también habría obligado a guardar ese
  // enlace en otro sitio, donde podría contradecir al hecho.
  const sql = stripSql(read(MIG));
  assert(/trigger quality_risk_materializations_protect before update/.test(sql),
    "falta la protección del hecho");
  assert(/trigger quality_risk_materializations_no_delete before delete/.test(sql),
    "un hecho registrado no se borra");
  const i = sql.indexOf("function public.quality_materialization_is_fact");
  const body = sql.slice(i, sql.indexOf("$$;", sql.indexOf("$$", i) + 3));
  for (const col of ["occurred_on", "description", "severity", "reported_by", "observed_consequence"]) {
    assert(new RegExp(`new\\.${col} is distinct from old\\.${col}`).test(body),
      `${col} podría reescribirse`);
  }
  assert(/old\.case_id is not null and new\.case_id is distinct/.test(body),
    "un caso ya enlazado no puede sustituirse por otro");
  // Y la sesión no tiene privilegio de escritura sobre la tabla, así que ni
  // siquiera llega al disparador.
  assert(/revoke all on table public\.quality_risk_materializations\s+from anon, authenticated/.test(sql),
    "la tabla debe revocar DML a la sesión");
});

check("C4. una decisión de tratamiento no se reescribe: se sucede", () => {
  const sql = stripSql(read(MIG));
  assert(/function public\.quality_treatment_plan_is_append_only/.test(sql),
    "falta la protección del plan");
  assert(/superseded_by_plan_id/.test(sql), "y el enlace a la decisión que lo sustituye");
});

check("C5. la evaluación conserva su explicación, no solo su número", () => {
  const sql = stripSql(read(MIG));
  assert(/derivation\s+jsonb not null/.test(sql),
    "sin el rastro de la derivación, el nivel sería una caja negra");
});

// ---------------------------------------------------------------------------
console.log("\nD · No se duplican los motores transversales");

check("D1. no se crean risk_tasks, risk_alerts, risk_actions ni risk_files", () => {
  const sql = stripSql(read(MIG));
  for (const t of ["risk_tasks", "risk_alerts", "risk_actions", "risk_files",
                   "risk_indicators", "opportunity_actions"]) {
    assert(!new RegExp(`create table public\\.${t}\\b`).test(sql),
      `${t} duplica un motor transversal que ya existe`);
  }
});

check("D2. los catálogos transversales se ENSANCHAN, sin perder ningún valor anterior", () => {
  const sql = stripSql(read(MIG));
  // Todo lo que QUALITY-04 admitía tiene que seguir admitiéndose.
  const previous = [
    "document_review", "document_approval", "indicator_measurement_due",
    "case_evaluation", "case_closure", "action_execution", "action_effectiveness",
  ];
  const i = sql.indexOf("add constraint work_tasks_type_check");
  const body = sql.slice(i, sql.indexOf(";", i));
  for (const v of previous) {
    assert(body.includes(`'${v}'`), `el ensanche perdió el tipo de tarea «${v}»`);
  }
  assert(body.includes("'risk_review_due'"), "falta el tipo nuevo de revisión de riesgo");
});

check("D3. work_references sigue siendo un catálogo CERRADO y validado", () => {
  const sql = stripSql(read(MIG));
  assert(/add constraint work_references_ref_kind_check/.test(sql), "falta el ensanche del catálogo");
  assert(!/entity_type\s+text/.test(sql), "no se admite un tipo genérico sin validar");
  // Y la validación debe resolver TODOS los propietarios nuevos.
  const i = sql.indexOf("function public.work_reference_must_be_valid");
  const body = sql.slice(i, sql.indexOf("$$;", sql.indexOf("$$", i) + 3));
  for (const k of ["risk", "opportunity", "control", "risk_assessment"]) {
    assert(new RegExp(`when '${k}'`).test(body),
      `el disparador no sabe validar un propietario de tipo «${k}»`);
  }
});

check("D4. la acción de riesgo usa la MISMA acción de servidor que la de un caso", () => {
  const src = read("components/domain/quality/risk-detail.tsx");
  assert(/createActionAction/.test(src), "debe reutilizar el motor de acciones de QUALITY-04");
  const act = read("server/actions/work-cases.ts");
  assert(/quality_risk|risk_id/.test(act), "createActionAction debe aceptar un riesgo como origen");
  // Y la rama del caso tiene que seguir intacta.
  assert(/origin\.kind === "work_case"/.test(act),
    "el cambio de estado a «en acción» solo puede aplicarse al caso");
});

check("D5. la bandeja conoce los asuntos nuevos, así que los enlaces no caen en Documentos", () => {
  for (const s of ["quality_risk", "quality_opportunity", "quality_control"]) {
    assert((SUBJECT_TYPES as readonly string[]).includes(s), `falta el asunto «${s}»`);
  }
  for (const t of ["risk_review_due", "risk_assessment_due", "risk_treatment_approval"]) {
    assert((TASK_TYPES as readonly string[]).includes(t), `falta el tipo de tarea «${t}»`);
    assert(TASK_TYPE_LABEL[t as never], `«${t}» no tiene etiqueta`);
  }
  for (const a of ["risk_review_overdue", "risk_materialized", "control_ineffective"]) {
    assert((ALERT_TYPES as readonly string[]).includes(a), `falta la alerta «${a}»`);
    assert(ALERT_TYPE_LABEL[a as never], `«${a}» no tiene etiqueta`);
  }
  const view = read("components/domain/quality/tasks-view.tsx");
  assert(/case "quality_risk":\s*\n\s*return `\/quality\/risks\/\$\{subjectId\}`/.test(view),
    "la tarea de un riesgo debe llevar a su ficha");
});

check("D6. el barrido es idempotente por clave de deduplicación", () => {
  const sql = stripSql(read(MIG));
  const i = sql.indexOf("function public.quality_scan_risk_reviews");
  const body = sql.slice(i, sql.indexOf("$$;", sql.indexOf("$$", i) + 3));
  assert(/dedupe_key/.test(body), "sin clave de deduplicación el barrido genera duplicados");
  assert(/not exists/.test(body), "y debe comprobar antes de insertar");
  assert(/next_review_on::text/.test(body),
    "la clave debe incluir la fecha prevista, o una segunda revisión no generaría tarea");
});

// ---------------------------------------------------------------------------
console.log("\nE · Autorización y ciclo de vida");

check("E1. no se inventa ningún rol nuevo", () => {
  // Sin comentarios: el código NOMBRA el rol inventado para decir que no lo
  // usa, y greparlo en crudo convertía esa explicación en un fallo.
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const src = strip(read("lib/domain/risks.ts")) + strip(read("server/actions/risks.ts"));
  assert(!/risk_manager|Risk Manager|gestor de riesgos/i.test(src),
    "los roles son admin, quality y consultant");
  assert(canManageRisks("consultant") && !canGovernRisks("consultant"),
    "un consultor identifica y evalúa, pero no decide el tratamiento");
  assert(canGovernRisks("quality") && canGovernRisks("admin"), "quality y admin gobiernan");
  assert(!canManageRisks(null) && !canGovernMethodology("otro"), "nadie más");
});

check("E2. toda RPC formal comprueba sesión, empresa y rol", () => {
  const sql = stripSql(read(MIG));
  const rpcs = [
    "quality_assess_risk", "quality_decide_risk_treatment", "quality_approve_risk_treatment",
    "quality_materialize_risk", "quality_open_case_from_materialization", "quality_review_risk",
    "quality_close_risk", "quality_reopen_risk", "quality_assess_opportunity",
    "quality_decide_opportunity_treatment", "quality_review_control",
    "quality_publish_methodology_version",
  ];
  for (const fn of rpcs) {
    const i = sql.indexOf(`function public.${fn}`);
    assert(i > 0, `falta la RPC ${fn}`);
    const body = sql.slice(i, sql.indexOf("$$;", sql.indexOf("$$", i) + 3));
    assert(/auth\.uid\(\) is null/.test(body), `${fn} no comprueba la sesión`);
    assert(/has_org_role\(/.test(body), `${fn} no comprueba el rol`);
    assert(/security definer/.test(body), `${fn} no es security definer`);
    assert(/set search_path = public/.test(body), `${fn} no fija search_path`);
  }
});

check("E3. las tablas de historia no admiten DML directo desde la sesión", () => {
  const sql = stripSql(read(MIG));
  for (const t of ["quality_risk_assessments", "quality_opportunity_assessments",
                   "quality_risk_treatment_plans", "quality_risk_materializations",
                   "quality_control_effectiveness_reviews"]) {
    assert(new RegExp(`revoke all on table public\\.${t}\\s+from anon, authenticated`).test(sql),
      `${t} no revoca privilegios: en remoto nacen con arwdDxtm`);
    assert(new RegExp(`grant select on table public\\.${t}\\s+to authenticated`).test(sql),
      `${t} debe permitir leer`);
    assert(!new RegExp(`grant [^;]*insert[^;]*on table public\\.${t}`).test(sql),
      `${t} no puede admitir INSERT directo: se escribe por RPC`);
  }
});

check("E4. RLS activada en todas las tablas nuevas", () => {
  const sql = stripSql(read(MIG));
  const created = [...sql.matchAll(/create table public\.(quality_\w+)/g)].map((m) => m[1]);
  assert(created.length >= 20, `se esperaban muchas tablas nuevas, hay ${created.length}`);
  for (const t of created) {
    assert(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql),
      `${t} se queda sin RLS`);
    assert(new RegExp(`create policy ${t}_select`).test(sql), `${t} no tiene política de lectura`);
  }
});

check("E5. el dictamen de eliminación es UNO y lo usan pantalla y disparador", () => {
  const sql = stripSql(read(MIG));
  for (const e of ["risk", "opportunity", "control", "methodology_version"]) {
    assert((LIFECYCLE_ENTITIES as readonly string[]).includes(e),
      `la aplicación no sabe pedir el dictamen de «${e}»`);
    assert(new RegExp(`when '${e}'`).test(sql), `el despachador no conoce «${e}»`);
  }
  const i = sql.indexOf("function public.quality_ro_guard_hard_delete");
  const body = sql.slice(i, sql.indexOf("$$;", sql.indexOf("$$", i) + 3));
  for (const v of ["quality_risk_deletion_verdict", "quality_opportunity_deletion_verdict",
                   "quality_control_deletion_verdict", "quality_methodology_version_deletion_verdict"]) {
    assert(body.includes(v), `el guardia no usa ${v}: habría dos lógicas y divergirían`);
  }
});

check("E6. el despachador enmascara lo ajeno antes de contar nada", () => {
  const sql = stripSql(read(MIG));
  const i = sql.indexOf("function public.quality_deletion_eligibility");
  const body = sql.slice(i, sql.indexOf("$$;", sql.indexOf("$$", i) + 3));
  const guard = body.indexOf("is_org_member");
  const firstVerdict = body.indexOf("_deletion_verdict(p_id)");
  assert(guard > 0 && firstVerdict > guard,
    "la comprobación de empresa tiene que ir ANTES de llamar a ningún dictamen");
});

check("E7. una versión usada para evaluar no se puede borrar", () => {
  const sql = stripSql(read(MIG));
  const i = sql.indexOf("function public.quality_methodology_version_deletion_verdict");
  const body = sql.slice(i, sql.indexOf("$$;", sql.indexOf("$$", i) + 3));
  assert(/quality_risk_assessments where methodology_version_id/.test(body),
    "el dictamen debe mirar si se usó en evaluaciones de riesgo");
  assert(/quality_opportunity_assessments where methodology_version_id/.test(body),
    "y en las de oportunidad");
});

// ---------------------------------------------------------------------------
console.log("\nF · El vocabulario y sus explicaciones");

check("F1. todo valor de catálogo tiene etiqueta en español", () => {
  const pairs: [readonly string[], Record<string, string>, string][] = [
    [RISK_STATUSES, RISK_STATUS_LABEL, "estado de riesgo"],
    [RISK_STRATEGIES, RISK_STRATEGY_LABEL, "estrategia"],
    [CONTROL_NATURES, CONTROL_NATURE_LABEL, "naturaleza de control"],
    [EFFECTIVENESS_VERDICTS, EFFECTIVENESS_VERDICT_LABEL, "veredicto de eficacia"],
    [OPPORTUNITY_DECISIONS, OPPORTUNITY_DECISION_LABEL, "decisión de oportunidad"],
  ];
  for (const [values, labels, what] of pairs) {
    for (const v of values) {
      assert(typeof labels[v] === "string" && labels[v].length > 0, `falta la etiqueta de ${what} «${v}»`);
    }
  }
});

check("F2. las estrategias y decisiones explican lo que significan", () => {
  for (const s of RISK_STRATEGIES) {
    assert(RISK_STRATEGY_HINT[s].length > 20, `«${s}» necesita explicación`);
  }
  assert(/no es olvidarse/i.test(RISK_STRATEGY_HINT.accept),
    "aceptar tiene que decir explícitamente que no es ignorar");
  for (const d of OPPORTUNITY_DECISIONS) {
    assert(OPPORTUNITY_DECISION_HINT[d].length > 20, `«${d}» necesita explicación`);
  }
});

check("F3. inherente y residual se explican sin jerga", () => {
  assert(/sin contar ningún control/i.test(ASSESSMENT_KIND_HINT.inherent), "la inherente no se explica");
  assert(/controles que ya existen/i.test(ASSESSMENT_KIND_HINT.residual), "la residual no se explica");
});

check("F4. el aviso de «no se creó una no conformidad» es del dominio, no de la pantalla", () => {
  assert(NO_AUTOMATIC_NC_NOTICE.includes("No se ha abierto ninguna no conformidad"),
    "el aviso tiene que decirlo con esas palabras");
  const detail = read("components/domain/quality/risk-detail.tsx");
  assert(detail.includes("NO_AUTOMATIC_NC_NOTICE"),
    "la ficha debe usar la constante, no una copia del texto");
});

check("F5. glosario del proyecto: se dice «empresa», no «organización»", () => {
  for (const f of ["lib/domain/risks.ts", "components/domain/quality/risks-view.tsx",
                   "components/domain/quality/risk-detail.tsx",
                   "components/domain/quality/opportunity-detail.tsx",
                   "components/domain/quality/methodology-view.tsx",
                   "app/(app)/(shell)/quality/risks/page.tsx"]) {
    const src = read(f);
    // Solo el texto visible: `organization_id` es el nombre de la columna.
    const visible = src.replace(/organization_?[iI]d/g, "").replace(/organizationId/g, "");
    assert(!/organizaci[oó]n/i.test(visible), `${f} dice «organización» en texto visible`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nG · La derivación explicada");

const D: Derivation = {
  score: 25, level_id: "x", level_label: "Extremo", is_acceptable: false,
  review_months: 1, color_token: null, aggregation: "product", version_id: "v",
  factors: [
    { scale_code: "prob", scale_label: "Probabilidad", level_label: "Casi segura", value: 5, weight: 1 },
    { scale_code: "imp", scale_label: "Impacto", level_label: "Grave", value: 5, weight: 1 },
  ],
};

check("G1. la explicación nombra factores, regla y resultado", () => {
  const e = explainDerivation(D)!;
  assert(e.includes("Probabilidad Casi segura"), "falta el factor");
  assert(e.includes("multiplicando"), "falta la regla");
  assert(e.includes("Extremo"), "falta el nivel");
  assert(e.includes("25"), "falta el puntaje");
});

check("G2. sin derivación no se inventa una explicación", () => {
  assert(explainDerivation(null) === null, "debe devolver null");
  assert(explainDerivation({ ...D, factors: [] }) === null, "sin factores tampoco hay explicación");
});

check("G3. el apetito sale del nivel, no de una opinión", () => {
  assert(levelIsAcceptable(D) === false, "este nivel no es aceptable");
  assert(levelIsAcceptable({ ...D, is_acceptable: true }) === true, "y este sí");
  assert(levelIsAcceptable(null) === null, "sin evaluación no se puede decir");
});

check("G4. aceptar sobre el criterio exige aprobación; dentro del criterio, no", () => {
  assert(acceptanceNeedsApproval("accept", false) === true, "por encima del apetito, aprobación");
  assert(acceptanceNeedsApproval("accept", true) === false, "dentro del apetito, no");
  assert(acceptanceNeedsApproval("reduce", false) === false, "reducir no es aceptar");
  assert(acceptanceNeedsApproval("accept", null) === false, "sin evaluación no se puede afirmar");
});

check("G5. la periodicidad de revisión sale de la metodología (RO-35)", () => {
  assert(reviewMonthsFrom(D) === 1, "un nivel extremo pide revisión más frecuente");
  assert(reviewMonthsFrom({ ...D, review_months: null }) === null,
    "si la metodología no lo dice, no se impone un aniversario");
  assert(reviewMonthsFrom(null) === null, "sin evaluación, ningún plazo");
});

// ---------------------------------------------------------------------------
console.log("\nH · Fechas y estados");

const TODAY = new Date(2026, 7, 25);

check("H1. los días hasta la revisión se cuentan bien", () => {
  assert(daysUntil("2026-08-25", TODAY) === 0, "hoy son 0 días");
  assert(daysUntil("2026-08-30", TODAY) === 5, "faltan 5");
  assert(daysUntil("2026-08-20", TODAY) === -5, "hace 5");
  assert(daysUntil(null, TODAY) === null, "sin fecha, nada");
});

check("H2. una revisión vencida se dice con esas palabras", () => {
  assert(reviewIsOverdue("2026-08-20", TODAY), "el 20 ya venció");
  assert(!reviewIsOverdue("2026-08-25", TODAY), "hoy todavía no");
  assert(!reviewIsOverdue(null, TODAY), "sin fecha no hay vencimiento");
  assert(describeReview("2026-08-20", TODAY).includes("vencida"), "hay que decirlo");
  assert(describeReview("2026-08-25", TODAY).includes("hoy"), "hoy se dice «hoy»");
  assert(describeReview(null, TODAY) === "Sin revisión programada", "y sin fecha se dice");
});

check("H3. concordancia: un día, no «1 días»", () => {
  assert(describeReview("2026-08-24", TODAY).includes("1 día"), "singular");
  assert(!describeReview("2026-08-24", TODAY).includes("1 días"), "no plural");
});

check("H4. abierto y cerrado se deciden por el estado administrativo", () => {
  assert(riskIsOpen("draft") && riskIsOpen("active"), "borrador y activo están abiertos");
  for (const s of ["closed", "retired", "superseded"] as const) {
    assert(!riskIsOpen(s), `«${s}» no está abierto`);
  }
  assert(opportunityIsOpen("in_progress") && !opportunityIsOpen("discarded"), "lo mismo para oportunidades");
});

check("H5. una versión solo evalúa si está publicada, y solo se edita en borrador", () => {
  assert(versionIsEditable("draft") && !versionIsEditable("published"), "publicada no se edita");
  assert(versionCanAssess("published"), "publicada evalúa");
  for (const s of ["draft", "superseded", "retired"] as const) {
    assert(!versionCanAssess(s), `«${s}» no puede usarse para evaluar`);
  }
});

check("H6. un control eficaz es solo el que se declaró eficaz", () => {
  assert(controlIsTrustworthy("effective"), "eficaz");
  for (const v of ["partially_effective", "ineffective", "not_assessed"] as const) {
    assert(!controlIsTrustworthy(v), `«${v}» no basta`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nI · La migración no rompe lo anterior");

check("I1. es aditiva: no altera ninguna tabla histórica salvo ensanchar sus catálogos", () => {
  const sql = stripSql(read(MIG));
  const alters = [...sql.matchAll(/alter table public\.(\w+)\s+(drop|add) constraint/g)];
  const touched = [...new Set(alters.map((m) => m[1]))].sort();
  const allowed = ["work_alerts", "work_decisions", "work_events", "work_references", "work_tasks"];
  for (const t of touched) {
    assert(allowed.includes(t), `${t} no debería tocarse en este sprint`);
  }
  assert(!/drop table/i.test(sql), "no se elimina ninguna tabla");
  assert(!/drop column/i.test(sql), "no se elimina ninguna columna");
});

check("I2. no borra datos para acomodar el modelo", () => {
  const sql = stripSql(read(MIG));
  assert(!/^\s*delete from/im.test(sql), "una migración de esquema no borra filas");
  assert(!/truncate/i.test(sql), "ni las vacía");
});

check("I3. todas las relaciones entre entidades de empresa validan la MISMA empresa", () => {
  const sql = stripSql(read(MIG));
  // Toda FK compuesta debe llevar organization_id delante (MDR-42).
  const composite = [...sql.matchAll(/foreign key \(organization_id, (\w+)\)/g)];
  assert(composite.length >= 12,
    `se esperaban muchas FK compuestas por empresa, hay ${composite.length}`);
  // Y ninguna FK simple a una tabla de empresa sin la organización.
  assert(!/references public\.quality_risks \(id\)/.test(sql),
    "una FK a un riesgo sin la empresa permitiría cruzar inquilinos");
});

check("I4. los códigos se reservan y no se reciclan (D-04)", () => {
  const sql = stripSql(read(MIG));
  for (const t of ["quality_risk_codes", "quality_control_codes", "quality_opportunity_codes"]) {
    assert(new RegExp(`create table public\\.${t}`).test(sql), `falta ${t}`);
  }
  assert(/function public\.quality_ro_reserve_code/.test(sql), "falta la reserva");
  assert(/ya se uso antes y no puede reutilizarse/.test(sinTildes(sql)),
    "falta el rechazo del reciclaje");
});

check("I5. la numeración cuenta sobre la RESERVA, no sobre las fichas vivas", () => {
  const sql = stripSql(read(MIG));
  const i = sql.indexOf("function public.quality_next_ro_code");
  const body = sql.slice(i, sql.indexOf("$$;", sql.indexOf("$$", i) + 3));
  assert(/from quality_risk_codes/.test(body),
    "contar sobre quality_risks devolvería a la circulación el número de un borrador tirado");
});

// ---------------------------------------------------------------------------
console.log("\nJ · Lo que el sprint NO debía hacer");

check("J1. no se abre ningún dominio fuera de alcance", () => {
  const sql = stripSql(read(MIG));
  for (const t of ["quality_audits", "quality_suppliers", "quality_customer_feedback",
                   "quality_management_reviews", "quality_fmea", "quality_bowtie"]) {
    assert(!new RegExp(`create table public\\.${t}`).test(sql), `${t} está fuera de alcance`);
  }
});

check("J2. no hay IA ni análisis predictivo", () => {
  const src = read("lib/domain/risks.ts") + read("lib/db/risks.ts") + read(MIG);
  assert(!/montecarlo|monte carlo|predictiv|machine learning|openai|anthropic/i.test(src),
    "fuera de alcance");
});

check("J3. no depende de PCR ni de Textiles", () => {
  for (const f of ["lib/domain/risks.ts", "lib/db/risks.ts", "server/actions/risks.ts"]) {
    const src = read(f);
    assert(!/textiles|pcr|passport/i.test(src), `${f} depende de otro módulo`);
  }
});

// ---------------------------------------------------------------------------
console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
