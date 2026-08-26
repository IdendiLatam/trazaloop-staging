/**
 * Trazaloop · QUALITY-07 · Puras y estáticas.
 *
 * Comprueban que las separaciones de GP existan EN EL CÓDIGO y no solo en la
 * prosa del informe:
 *
 *   PROVEEDOR ≠ SEDE ≠ CATEGORÍA ≠ CRITICIDAD
 *   REQUISITO ≠ EVALUACIÓN ≠ DESEMPEÑO ≠ DECISIÓN ≠ ACCIÓN
 *   CRITICIDAD ≠ DESEMPEÑO
 *   PUNTUACIÓN ≠ APROBACIÓN
 *   INCIDENTE ≠ NO CONFORMIDAD
 *   VENCIMIENTO ≠ SUSPENSIÓN
 *
 * y que lo que este dominio NO debe ser —un ERP de compras, un duplicador de
 * proveedores, un motor que homologa solo— no se haya colado por una columna,
 * un enum o un cálculo.
 *
 * Ninguna toca base de datos ni red.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVAL_DECISIONS, APPROVING_DECISIONS, approvalExpired, canDecideSupplierApproval,
  canManageSuppliers, countsTowardsScore, DEFAULT_REEVALUATION_MONTHS, describeScope,
  describeTrend, EVALUATION_KINDS, EXPIRY_IS_NOT_SUSPENSION, EXTRAORDINARY_TRIGGERS,
  INCIDENT_IS_NOT_NC, isApprovedForScope, nextReviewOn, reevaluationOverdue,
  REQUIREMENT_ENFORCEMENTS, RESULT_OUTCOMES, scoreApproves, summarizeOutcomes,
  SUPPLIER_SIGNAL_KINDS, SUPPLIER_SOURCE_MODULES, weightedScore,
} from "../../lib/domain/quality-suppliers";
import { METHODOLOGY_SCOPES } from "../../lib/domain/risks";
import { EXPORT_INVENTORY, promisedKeys } from "../../lib/export/inventory";
import {
  ALERT_TYPES, ALERT_TYPE_LABEL, SUBJECT_TYPES, TASK_TYPES, TASK_TYPE_LABEL,
} from "../../lib/domain/work-inbox";
import { LIFECYCLE_ENTITIES } from "../../lib/domain/lifecycle";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, "");
/** Sin esto, una prueba que busca «ERP» falla justamente por el comentario que
 *  explica que NO se construye un ERP, y la prohibición acaba impidiendo
 *  documentarla. */
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MIG = "supabase/migrations/0125_quality_suppliers_evaluation.sql";
const SQL = stripSql(read(MIG));
const DOMAIN = read("lib/domain/quality-suppliers.ts");
const DB = read("lib/db/quality-suppliers.ts");
const ACTIONS = read("server/actions/quality-suppliers.ts");
const ADAPTERS = read("lib/export/adapters/quality-suppliers.ts");

const COMPONENTS_DIR = "components/domain/quality/suppliers";
const componentFiles = readdirSync(join(ROOT, COMPONENTS_DIR))
  .filter((f) => f.endsWith(".tsx"));
const COMPONENTS = componentFiles.map((f) => read(join(COMPONENTS_DIR, f))).join("\n");

const ROUTES_DIR = "app/(app)/(shell)/quality/suppliers";
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...walk(join(dir, e.name)));
    else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) out.push(join(dir, e.name));
  }
  return out;
}
const routeFiles = walk(ROUTES_DIR);

let passed = 0, failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${name}: ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

/** El cuerpo de un `create table`, sin el resto del archivo alrededor. */
function tableBody(name: string): string {
  const i = SQL.indexOf(`create table public.${name} (`);
  assert(i >= 0, `no existe la tabla ${name}`);
  const rest = SQL.slice(i);
  return rest.slice(0, rest.indexOf("\n);"));
}

console.log("\nQUALITY-07 · puras y estáticas\n");

// ---------------------------------------------------------------------------
console.log("A · CERO GESTIÓN DUPLICADA (GP-02, GP-33, §5)");

check("A1. la identidad de la empresa externa es TRANSVERSAL, no una tabla de proveedores más", () => {
  assert(/create table public\.quality_external_parties/.test(SQL),
    "no existe la identidad empresarial transversal");
  const cuerpo = tableBody("quality_external_party_roles");
  assert(/party_id/.test(cuerpo) && /role/.test(cuerpo),
    "los papeles de la empresa externa no se declaran aparte de la empresa");
});

check("A2. PCR y Textiles APUNTAN a esa identidad; no se les copia el proveedor", () => {
  assert(/alter table public\.suppliers\s+add column (if not exists )?external_party_id uuid/.test(SQL),
    "PCR no tiene el puente hacia la identidad transversal");
  assert(/alter table public\.textile_suppliers\s+add column (if not exists )?external_party_id uuid/.test(SQL),
    "Textiles no tiene el puente hacia la identidad transversal");
  // La columna es OPCIONAL: los dos módulos siguen funcionando con Quality
  // apagado, que es justo lo que impide que este sprint los rompa.
  assert(!/alter table public\.suppliers\s+alter column external_party_id set not null/.test(SQL),
    "el puente se declaró obligatorio: PCR dejaría de funcionar sin Quality");
});

check("A3. la aplicación ofrece INCORPORAR antes que crear", () => {
  const dir = read(join(COMPONENTS_DIR, "directory.tsx"));
  const incorporar = dir.indexOf("adoptSupplierAction");
  const crear = dir.indexOf("createSupplierAction");
  assert(incorporar >= 0 && crear >= 0, "faltan el alta o la incorporación");
  assert(incorporar < crear,
    "crear un proveedor aparece antes que incorporar el que ya existe");
  assert(SUPPLIER_SOURCE_MODULES.length === 2,
    "la incorporación no cubre los dos módulos que ya tienen proveedores");
});

check("A4. hay sugerencia de duplicados y NO hay fusión automática", () => {
  assert(/export async function suggestDuplicateParties/.test(DB),
    "no se sugieren posibles duplicados");
  const t = stripTs(DB) + stripTs(ACTIONS);
  assert(!/mergeParties|autoMerge|fusionar/i.test(t),
    "hay una fusión de empresas: unir dos identidades es una decisión con "
    + "consecuencias en tres módulos y no puede adivinarse");
});

// ---------------------------------------------------------------------------
console.log("\nB · PROVEEDOR ≠ SEDE ≠ CATEGORÍA ≠ ALCANCE (GP-03, §7, §8)");

check("B1. las cuatro cosas son tablas distintas", () => {
  for (const t of ["quality_supplier_profiles", "quality_external_party_sites",
                   "quality_supplier_categories", "quality_supplier_scopes"]) {
    assert(SQL.includes(`create table public.${t}`), `falta la tabla ${t}`);
  }
});

check("B2. el alcance es la unidad sobre la que se decide", () => {
  const cuerpo = tableBody("quality_supplier_scopes");
  assert(/profile_id/.test(cuerpo), "el alcance no pertenece a un proveedor");
  assert(/site_id/.test(cuerpo) && /category_id/.test(cuerpo),
    "el alcance no combina sede y categoría");
  for (const t of ["quality_supplier_approval_decisions",
                   "quality_supplier_criticality_assessments",
                   "quality_supplier_evaluations"]) {
    assert(new RegExp(`scope_id\\s+uuid not null`).test(tableBody(t)),
      `${t} no se ancla al alcance: se estaría decidiendo sobre «el proveedor» a secas`);
  }
});

check("B3. la aplicación NUNCA dice «aprobado» sin decir para qué", () => {
  assert(/describeScope/.test(DOMAIN), "no existe la forma de nombrar un alcance");
  assert(describeScope({ siteName: null, categoryName: null }).length > 0,
    "un alcance sin sede ni categoría se queda sin nombre");
  const ficha = read(join(COMPONENTS_DIR, "supplier-file.tsx"));
  assert(/describeScope/.test(ficha),
    "la ficha del proveedor no nombra el alcance de cada decisión");
  const idx = ficha.indexOf("Aprobación");
  assert(idx >= 0 && ficha.slice(0, idx).includes("Alcance"),
    "la columna de aprobación aparece sin la del alcance al lado");
});

check("B4. dos empresas distintas pueden tener el mismo NIT sin ser la misma (§50)", () => {
  const cuerpo = tableBody("quality_external_parties");
  assert(/organization_id\s+uuid not null/.test(cuerpo),
    "la empresa externa no pertenece a una empresa cliente");
  assert(!/tax_id\s+text[^,]*unique(?!\s*\()/.test(cuerpo),
    "el NIT es único globalmente: el proveedor A de una empresa colisionaría con el de otra");
});

// ---------------------------------------------------------------------------
console.log("\nC · CRITICIDAD ≠ DESEMPEÑO (GP-05, GP-20, §9…§12)");

check("C1. la criticidad reutiliza el motor de metodologías, no uno nuevo", () => {
  assert(/applies_to in \('risk', 'opportunity', 'supplier_criticality'\)/.test(SQL),
    "no se ensanchó el motor de metodologías de QUALITY-05");
  assert(!/create table public\.quality_supplier_methodolog/.test(SQL),
    "se creó un motor de metodología paralelo (MDR-46)");
  assert((METHODOLOGY_SCOPES as readonly string[]).includes("supplier_criticality"),
    "el dominio de TypeScript no conoce el alcance nuevo, así que la pantalla no lo ofrece");
});

check("C2. la clasificación guarda la VERSIÓN con la que se hizo y es inmutable", () => {
  const cuerpo = tableBody("quality_supplier_criticality_assessments");
  assert(/version_id\s+uuid not null/.test(cuerpo),
    "la clasificación no ata la versión de metodología: publicar otra la recalcularía");
  assert(/t_quality_supplier_criticality_immutable/.test(SQL),
    "la clasificación se puede editar en el sitio en vez de sustituirse");
});

check("C3. la criticidad NO se calcula con la puntuación de las evaluaciones", () => {
  const cuerpo = tableBody("quality_supplier_criticality_assessments");
  assert(!/evaluation_id/.test(cuerpo),
    "la clasificación de criticidad depende de una evaluación: sería desempeño disfrazado");
  const texto = COMPONENTS + ADAPTERS;
  assert(/no es una nota de desempeño|NO es una nota de desempeño/.test(texto),
    "ni la pantalla ni el papel avisan de que criticidad no es desempeño");
});

check("C4bis. los factores se escriben desde los niveles elegidos", () => {
  // El rastro que devuelve la derivación está pensado para LEERSE —código,
  // etiqueta, valor y peso— y no lleva identificadores. Sacar de ahí el
  // `scale_id` dejaba la dimensión en blanco, y una clasificación que no dice
  // en qué dimensión se escogió cada valor es indefendible.
  const f = SQL.slice(SQL.indexOf("function public.quality_assess_supplier_criticality"));
  const cuerpo = f.slice(0, f.indexOf("$$;") + 3);
  assert(/from quality_risk_scale_levels l\s*\n\s*where l\.id = any\(p_level_ids\)/.test(cuerpo),
    "los factores no se escriben desde los niveles elegidos");
  assert(!/v_factor->>'scale_id'/.test(cuerpo),
    "los factores vuelven a leerse del rastro de la derivación, que no lleva identificadores");
});

check("C4. la criticidad puede ACORTAR la cadencia de revisión (GP-20)", () => {
  assert(/review_months/.test(tableBody("quality_supplier_criticality_assessments")),
    "el nivel de criticidad no lleva su cadencia de revisión");
});

// ---------------------------------------------------------------------------
console.log("\nD · PUNTUACIÓN ≠ APROBACIÓN (GP-07, GP-12, §14, §21)");

check("D1. ninguna puntuación aprueba a nadie, y está escrito como función", () => {
  assert(scoreApproves(100) === false, "un 100 aprueba solo");
  assert(scoreApproves(0) === false, "hay un camino por el que la puntuación decide");
  assert(scoreApproves(null) === false, "la ausencia de puntuación decide algo");
});

check("D2. el cierre de una evaluación DICE que no aprueba", () => {
  assert(/NO aprueba al proveedor/.test(ACTIONS),
    "cerrar una evaluación no advierte de que no aprueba");
  assert(/decides_nothing/.test(SQL),
    "la RPC de cierre no declara explícitamente que no decide nada");
});

check("D3. la decisión de aprobación es un acto humano APARTE", () => {
  assert(SQL.includes("create table public.quality_supplier_approval_decisions"),
    "no existe la decisión como registro propio");
  const cuerpo = tableBody("quality_supplier_approval_decisions");
  assert(/rationale\s+text not null/.test(cuerpo),
    "una decisión de aprobación puede quedarse sin fundamento");
  assert(/decided_by/.test(cuerpo), "la decisión no registra quién la tomó");
  // El perfil del proveedor NO lleva una columna de aprobación: si la llevara,
  // habría dos fuentes de verdad y una acabaría mintiendo.
  assert(!/approv/i.test(tableBody("quality_supplier_profiles")),
    "el proveedor guarda su propia aprobación: sería una segunda verdad, y sin alcance");
});

check("D4. la decisión no se edita: se sustituye", () => {
  assert(/quality_supplier_decision_is_immutable/.test(SQL),
    "una decisión formal se puede reescribir (MDR-49)");
  assert(/superseded_by/.test(tableBody("quality_supplier_approval_decisions")),
    "no hay forma de decir que una decisión sustituyó a otra");
});

check("D5. solo la empresa decide: el consultor externo no homologa (GP-07)", () => {
  assert(canManageSuppliers("consultant"), "el consultor no puede ni acompañar el dominio");
  assert(!canDecideSupplierApproval("consultant"),
    "un consultor externo puede homologar proveedores de su cliente");
  assert(canDecideSupplierApproval("admin") && canDecideSupplierApproval("quality"),
    "quien tiene que decidir no puede");
  assert(/quality_decides_supplier_approval/.test(SQL),
    "la base no impone la misma regla que la aplicación");
});

check("D6. una aprobación condicionada tiene que decir las condiciones", () => {
  assert(/conditionally_approved/.test(ACTIONS) && /condiciones/.test(ACTIONS),
    "la acción no exige las condiciones");
  assert((APPROVING_DECISIONS as readonly string[]).length < APPROVAL_DECISIONS.length,
    "todas las decisiones aprueban: entonces «decidir» no significa nada");
  const hoy = "2026-08-26";
  assert(isApprovedForScope({ decision: "approved", validUntil: null }, hoy),
    "una aprobación vigente no cuenta como aprobación");
  assert(!isApprovedForScope({ decision: "suspended", validUntil: null }, hoy),
    "una suspensión cuenta como aprobación");
  assert(!isApprovedForScope({ decision: "approved", validUntil: "2026-01-01" }, hoy),
    "una aprobación caducada sigue aprobando");
  assert(!isApprovedForScope({ decision: null, validUntil: null }, hoy),
    "un alcance sin decidir aparece como aprobado");
});

// ---------------------------------------------------------------------------
console.log("\nE · «NO APLICA» NO ES UN CERO (§22)");

check("E1. los cuatro desenlaces existen y solo uno puntúa", () => {
  assert(RESULT_OUTCOMES.length === 4, "faltan desenlaces posibles de un criterio");
  assert(countsTowardsScore("scored"), "lo puntuado no cuenta");
  for (const o of ["not_applicable", "unavailable", "not_evaluated"] as const) {
    assert(!countsTowardsScore(o), `${o} entra en el cálculo`);
  }
});

check("E2. la base RECHAZA puntos en un criterio que no aplica", () => {
  assert(/outcome <> 'scored' and points is null/.test(SQL),
    "se pueden guardar puntos en un criterio que no se puntuó");
});

check("E3. «no aplica» no hunde el resultado", () => {
  const conNa = weightedScore([
    { outcome: "scored", points: 80, weight: 1, maxPoints: 100 },
    { outcome: "not_applicable", points: null, weight: 1, maxPoints: 100 },
  ]);
  assert(conNa === 80, `un «no aplica» movió el resultado a ${conNa}`);
});

check("E4. se dice CUÁNTO se pudo mirar, no solo el número", () => {
  const r = summarizeOutcomes([
    { outcome: "scored" }, { outcome: "not_applicable" }, { outcome: "unavailable" },
  ]);
  assert(r.scored === 1 && r.not_applicable === 1 && r.unavailable === 1,
    "el resumen de desenlaces no cuadra");
  assert(/de \{results\.length\} criterios puntuados|criterios puntuados/.test(COMPONENTS),
    "la pantalla enseña el resultado sin decir sobre cuántos criterios se calculó");
});

check("E5. sin ningún criterio puntuado NO se inventa un cero", () => {
  const r = weightedScore([{ outcome: "unavailable", points: null, weight: 1, maxPoints: 100 }]);
  assert(r === null, `una evaluación sin datos produjo ${r} en vez de «sin resultado»`);
});

// ---------------------------------------------------------------------------
console.log("\nF · LA PLANTILLA SE VERSIONA (GP-15, §18…§20, §66)");

check("F1. los criterios cuelgan de la VERSIÓN, no de la plantilla", () => {
  assert(/version_id\s+uuid not null/.test(tableBody("quality_supplier_evaluation_criteria")),
    "los criterios cuelgan de la plantilla: cambiar un peso reescribiría el pasado");
});

check("F2. la evaluación ata la versión con la que se hizo", () => {
  assert(/version_id\s+uuid not null/.test(tableBody("quality_supplier_evaluations")),
    "la evaluación no dice con qué versión se hizo");
  assert(/los de la versión con la que se hizo|no los de la plantilla de hoy/.test(DB + ADAPTERS),
    "nada explica que se leen los criterios de entonces");
});

check("F2bis. una evaluación CERRADA es final", () => {
  // Sin esta guarda, un `update` normal cambia la puntuación de una evaluación
  // de hace dos años y la línea de evolución se mueve sin que nadie haya
  // evaluado otra vez.
  assert(/quality_supplier_evaluation_is_closed/.test(SQL),
    "no hay guarda contra reescribir una evaluación cerrada");
  assert(/t_quality_supplier_evaluation_closed_is_final/.test(SQL),
    "la guarda existe pero no está conectada a la tabla");
  assert(/quality_supplier_result_parent_is_open/.test(SQL),
    "los criterios de una evaluación cerrada se pueden cambiar por la puerta de atrás");
  const f = SQL.slice(SQL.indexOf("function public.quality_supplier_evaluation_is_closed"));
  const cuerpo = f.slice(0, f.indexOf("$$;") + 3);
  assert(/old\.status = 'closed'/.test(cuerpo) && !/new\.status = 'closed'/.test(cuerpo),
    "la guarda mira el estado NUEVO: bloquearía el propio cierre");
});

check("F3. publicar una versión no borra la anterior", () => {
  assert(/superseded/.test(SQL), "no existe el estado «sustituida»");
  assert(/effective_to/.test(tableBody("quality_supplier_template_versions")),
    "una versión no tiene fin de vigencia: no se puede saber cuál regía en una fecha");
});

// ---------------------------------------------------------------------------
console.log("\nG · REEVALUACIÓN: VENCER NO ES SUSPENDER (GP-10, GP-25, §28, §29)");

check("G1. la cadencia es configurable y por defecto son doce meses", () => {
  assert(DEFAULT_REEVALUATION_MONTHS === 12, "la cadencia por defecto cambió sin querer");
  assert(/reevaluation_months/.test(tableBody("quality_supplier_profiles")),
    "la cadencia no se puede cambiar proveedor a proveedor");
});

check("G2. la fecha siguiente se calcula, no se escribe a mano", () => {
  assert(nextReviewOn("2026-01-31", 12) === "2027-01-31",
    "el cálculo de la siguiente revisión no es el esperado");
  assert(reevaluationOverdue("2026-01-01", "2026-02-01"), "una revisión pasada no está vencida");
  assert(!reevaluationOverdue(null, "2026-02-01"),
    "un proveedor sin evaluar aparece como vencido: no hay desde cuándo contar");
});

check("G3. una reevaluación es una evaluación NUEVA", () => {
  assert((EVALUATION_KINDS as readonly string[]).includes("reevaluation"),
    "la reevaluación no existe como clase de evaluación");
  // La única escritura sobre una evaluación ya cerrada es la del cierre, y esa
  // es la que la crea. Si apareciera otra ruta que reescribe la puntuación de
  // una evaluación pasada, la comparación entre periodos dejaría de valer.
  const enUnaLinea = SQL.replace(/\n/g, " ");
  const reescrituras = [...enUnaLinea.matchAll(/update\s+quality_supplier_evaluations\b/gi)];
  assert(reescrituras.length <= 1,
    `hay ${reescrituras.length} rutas que reescriben una evaluación`);
  assert(/quality_close_supplier_evaluation/.test(SQL),
    "no existe el acto formal de cerrar una evaluación");
});

check("G4. vencer NO suspende y está dicho en la pantalla y en el papel", () => {
  assert(EXPIRY_IS_NOT_SUSPENSION.length > 20, "falta la frase que separa vencimiento de suspensión");
  assert(/no suspende/i.test(COMPONENTS), "la pantalla no lo dice");
  assert(/NO suspende|no suspende/.test(ADAPTERS), "el papel no lo dice");
  const barrido = SQL.slice(SQL.indexOf("quality_scan_supplier_reviews"));
  assert(!/update .*quality_supplier_approval_decisions/i.test(barrido),
    "el barrido toca decisiones de aprobación: un aviso estaría homologando");
});

check("G5. hay reevaluación extraordinaria, con motivo", () => {
  assert(EXTRAORDINARY_TRIGGERS.length >= 3, "faltan disparadores fuera de ciclo");
  assert(/trigger_reason/.test(tableBody("quality_supplier_evaluations")),
    "una evaluación extraordinaria puede quedarse sin explicar por qué se hizo");
});

// ---------------------------------------------------------------------------
console.log("\nH · INCIDENTE ≠ NO CONFORMIDAD (GP-21, GP-22, §27, §32)");

check("H1. el incidente es un hecho anotado, no una clasificación", () => {
  const cuerpo = tableBody("quality_supplier_incidents");
  assert(!/nonconformity|no_conformidad|is_nc/i.test(cuerpo),
    "el incidente ya viene clasificado como no conformidad");
  assert(INCIDENT_IS_NOT_NC.length > 20, "falta la frase que los separa");
  assert(/INCIDENT_IS_NOT_NC/.test(COMPONENTS), "la pantalla no lo dice");
});

check("H2. abrir un caso desde un incidente lo abre SIN clasificar", () => {
  assert(/quality_open_case_from_supplier_incident/.test(SQL), "no se puede escalar a un caso");
  const f = SQL.slice(SQL.indexOf("function public.quality_open_case_from_supplier_incident"));
  const cuerpo = f.slice(0, f.indexOf("$$;") + 3);
  assert(!/'nonconformity'/.test(cuerpo),
    "el caso nace clasificado como no conformidad: eso lo decide una persona");
});

check("H3. un fallo del dato no es un deterioro del proveedor", () => {
  assert(/is_data_issue/.test(tableBody("quality_supplier_incidents")),
    "no hay forma de decir que el problema fue del dato y no del proveedor");
  assert(/problema del dato/.test(COMPONENTS), "la pantalla no ofrece decirlo");
});

check("H4. las señales avisan y no deciden", () => {
  assert(SUPPLIER_SIGNAL_KINDS.length >= 3, "faltan señales del dominio");
  assert(/Una señal dice «mira esto»|no suspende/.test(COMPONENTS),
    "la pantalla no dice qué es —y qué no es— una señal");
});

// ---------------------------------------------------------------------------
console.log("\nI · MOTORES TRANSVERSALES, NO COPIAS (MDR-46, §34, §35, §45)");

check("I1. no hay tareas, alertas ni acciones propias del dominio", () => {
  for (const t of ["quality_supplier_tasks", "quality_supplier_alerts",
                   "quality_supplier_actions", "quality_supplier_cases"]) {
    assert(!SQL.includes(`create table public.${t}`),
      `se creó ${t} en vez de usar el motor transversal`);
  }
});

check("I2. los catálogos cerrados se ensancharon de forma ADITIVA", () => {
  // Ningún valor anterior desaparece: si desapareciera, QUALITY-01…06.1
  // dejarían de validar sin que nadie los hubiera tocado.
  for (const v of ["document_review", "risk_review_due", "lesson_proposal_decision"]) {
    assert(SQL.includes(`'${v}'`), `el ensanche perdió el tipo de tarea ${v}`);
  }
  for (const v of ["supplier_reevaluation_due", "supplier_evaluation_completion",
                   "supplier_approval_review", "supplier_document_renewal",
                   "supplier_criticality_review"]) {
    assert(SQL.includes(`'${v}'`), `falta el tipo de tarea ${v}`);
    assert((TASK_TYPES as readonly string[]).includes(v),
      `la bandeja no conoce ${v}: la tarea se pintaría sin etiqueta`);
    assert(TASK_TYPE_LABEL[v as keyof typeof TASK_TYPE_LABEL].length > 0,
      `${v} no tiene etiqueta legible`);
  }
});

check("I3. las alertas nuevas están en el dominio de la bandeja, con etiqueta", () => {
  for (const v of ["supplier_reevaluation_overdue", "supplier_approval_expired",
                   "supplier_document_expiring", "supplier_critical_unapproved"]) {
    assert((ALERT_TYPES as readonly string[]).includes(v), `la bandeja no conoce la alerta ${v}`);
    assert(ALERT_TYPE_LABEL[v as keyof typeof ALERT_TYPE_LABEL].length > 0,
      `${v} no tiene etiqueta legible`);
  }
});

check("I4. los asuntos nuevos LLEVAN a alguna parte", () => {
  const vista = read("components/domain/quality/tasks-view.tsx");
  for (const s of ["quality_supplier_profile", "quality_supplier_scope",
                   "quality_supplier_evaluation", "quality_supplier_document"]) {
    assert((SUBJECT_TYPES as readonly string[]).includes(s), `falta el asunto ${s}`);
    assert(vista.includes(`case "${s}"`),
      `${s} no tiene destino: la tarea acabaría enlazando a Documentos`);
  }
});

check("I5. el plan de mejora de un proveedor es una ACCIÓN del motor, no una tabla nueva", () => {
  assert(!/create table public\.quality_supplier_improvement/.test(SQL),
    "se duplicó el motor de acciones");
  assert(/'supplier'/.test(SQL), "el motor de trabajo no admite el dominio de proveedores");
});

// ---------------------------------------------------------------------------
console.log("\nJ · SEGURIDAD (§50…§54)");

check("J1. TODA función SECURITY DEFINER fija un search_path seguro", () => {
  const definers = SQL.split(/create or replace function/).slice(1)
    .filter((f) => /security definer/i.test(f));
  assert(definers.length > 0, "la migración no define ninguna función de acto formal");
  for (const f of definers) {
    const nombre = (f.match(/public\.([a-z0-9_]+)/) ?? [])[1] ?? "?";
    assert(/set search_path\s*=\s*public/i.test(f),
      `${nombre} es SECURITY DEFINER sin search_path fijo`);
  }
});

check("J2. ninguna función definer se fía del p_organization_id que le mandan (§54)", () => {
  // El hallazgo de QUALITY-06: dentro de una función definer el usuario
  // efectivo es el dueño, así que las vistas con security_invoker dejan de
  // filtrar. Comprobar la pertenencia es lo único que cierra el túnel.
  const definers = SQL.split(/create or replace function/).slice(1)
    .filter((f) => /security definer/i.test(f) && /p_organization_id/.test(f));
  assert(definers.length > 0, "no hay ninguna función definer parametrizada por empresa");
  for (const f of definers) {
    const nombre = (f.match(/public\.([a-z0-9_]+)/) ?? [])[1] ?? "?";
    // Los PREDICADOS de permiso quedan fuera: no devuelven datos, devuelven si
    // QUIEN LLAMA tiene un papel en esa empresa, y `has_org_role` ya resuelve
    // eso contra la sesión. Exigirles otra comprobación sería pedirles que
    // comprueben dos veces lo mismo.
    const esPredicado = /returns boolean/i.test(f)
      && /(has_org_role|is_org_member)\s*\(\s*p_organization_id/.test(f);
    if (esPredicado) continue;
    // Y las que NINGÚN cliente puede ejecutar: si el `execute` está revocado a
    // `authenticated`, la función solo corre desde dentro de otra que ya
    // comprobó la pertenencia. No hay túnel que cerrar.
    const esInterna = new RegExp(
      `revoke all on function public\\.${nombre}\\([^)]*\\) from [^;]*authenticated`
    ).test(f);
    if (esInterna) continue;
    assert(/is_org_member\s*\(/.test(f),
      `${nombre} recibe p_organization_id del cliente y no comprueba la pertenencia`);
  }
});

check("J3. todas las tablas nuevas llevan RLS", () => {
  const tablas = [...SQL.matchAll(/create table public\.(quality_(?:supplier|external)[a-z_]*)/g)]
    .map((m) => m[1]);
  assert(tablas.length >= 18, `solo se encontraron ${tablas.length} tablas nuevas`);
  for (const t of tablas) {
    assert(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(SQL),
      `${t} se quedó sin RLS`);
  }
});

check("J4. las vistas del dominio respetan la sesión", () => {
  const vistas = [...SQL.matchAll(/create or replace view public\.(v_quality_supplier[a-z_]*|v_quality_approved[a-z_]*)/g)]
    .map((m) => m[1]);
  assert(vistas.length >= 3, `solo se encontraron ${vistas.length} vistas`);
  for (const v of vistas) {
    const i = SQL.indexOf(`create or replace view public.${v}`);
    const cabecera = SQL.slice(i, i + 200);
    assert(/security_invoker\s*=\s*true/.test(cabecera),
      `${v} no declara security_invoker: se saltaría RLS`);
  }
});

check("J5. cada política se llama como su tabla", () => {
  for (const m of SQL.matchAll(/create policy ([a-z0-9_]+)\s+on public\.([a-z0-9_]+)/g)) {
    const [, politica, tabla] = m;
    assert(politica.startsWith(tabla),
      `la política ${politica} está en ${tabla}: el nombre engaña a quien audite`);
  }
});

check("J6. el rol no se lee del navegador", () => {
  assert(!/formData\.get\("role|roleCode = text\(/.test(ACTIONS),
    "una acción toma el rol del formulario");
  assert(/requireQualityForAction/.test(ACTIONS), "las acciones no pasan por el guard");
});

check("J7. no se usa service_role para la lógica normal", () => {
  assert(!/service_role|SERVICE_ROLE/.test(stripTs(DB) + stripTs(ACTIONS)),
    "la capa normal usa la clave de servicio");
});

// ---------------------------------------------------------------------------
console.log("\nK · NO ES UN ERP DE COMPRAS (§4)");

check("K1. no hay pedidos, precios ni facturas", () => {
  const prohibido = /\b(purchase_order|order_line|unit_price|invoice|payment_terms|discount)\b/i;
  assert(!prohibido.test(SQL), "la migración introduce vocabulario de compras");
  assert(!prohibido.test(stripTs(DOMAIN) + stripTs(DB)),
    "el dominio introduce vocabulario de compras");
});

check("K2. tampoco hay contratos con importes ni condiciones de pago", () => {
  assert(!/\b(amount|currency|total_value|spend)\b/i.test(SQL),
    "aparecen importes: eso es un ERP, no un sistema de gestión");
});

check("K3. los contactos se limitan a lo que la relación comercial necesita (§49)", () => {
  const cuerpo = tableBody("quality_external_party_contacts");
  assert(!/\b(id_number|document_number|birth|address_home|salary|national_id)\b/i.test(cuerpo),
    "el contacto guarda datos personales que la relación comercial no necesita");
});

// ---------------------------------------------------------------------------
console.log("\nL · CICLO DE VIDA Y PAPEL (§37, §38, §63, §78)");

check("L1. retirar conserva; eliminar solo cuando no hay historia", () => {
  assert(/quality_supplier_deletion_verdict/.test(SQL), "no hay dictamen de eliminación");
  assert(/quality_supplier_delete_guard/.test(SQL),
    "no hay guardia: se podría borrar por la puerta de atrás");
  assert((LIFECYCLE_ENTITIES as readonly string[]).includes("supplier"),
    "la aplicación no conoce el proveedor como entidad con ciclo de vida");
});

check("L2. retirar en Quality no borra al proveedor de PCR ni de Textiles", () => {
  const f = SQL.slice(SQL.indexOf("quality_supplier_deletion_verdict"));
  const cuerpo = f.slice(0, f.indexOf("$$;") + 3);
  assert(!/delete from public\.suppliers|delete from public\.textile_suppliers/.test(cuerpo),
    "eliminar en Quality borraría el proveedor de los otros módulos");
});

check("L3. cada entidad nueva con identidad propia tiene su papel", () => {
  const claves = new Set(promisedKeys());
  for (const k of ["quality.supplier.detail", "quality.supplier.list",
                   "quality.supplier-site.detail", "quality.supplier-evaluation.detail",
                   "quality.supplier-criticality.detail", "quality.supplier-approval.detail",
                   "quality.supplier-reevaluation.list", "quality.approved-supplier.list"]) {
    assert(claves.has(k), `el inventario no promete ${k}`);
    assert(ADAPTERS.includes(`key: "${k}"`), `no existe el adaptador de ${k}`);
  }
});

check("L4. los nombres del inventario no chocan con los de PCR ni Textiles", () => {
  const nombres = EXPORT_INVENTORY.map((r) => r.entity);
  const repetidos = nombres.filter((n, i) => nombres.indexOf(n) !== i);
  assert(repetidos.length === 0, `el inventario tiene nombres repetidos: ${repetidos.join(", ")}`);
});

check("L5. ningún papel afirma «aprobado» sin alcance", () => {
  assert(/POR ALCANCE/.test(ADAPTERS), "los papeles no advierten de que la aprobación es por alcance");
  assert(/NO aprueba a un proveedor/.test(ADAPTERS),
    "los papeles no separan la puntuación de la aprobación");
});

// ---------------------------------------------------------------------------
console.log("\nM · UX Y LENGUAJE (§55, §56)");

check("M1. la subnavegación tiene cuatro entradas, no quince", () => {
  const nav = read("lib/modules/registry.ts");
  const i = nav.indexOf("QUALITY_PROVEEDORES_GROUP");
  assert(i >= 0, "el módulo no ofrece proveedores en el menú");
  const grupo = nav.slice(i, nav.indexOf("};", i));
  const entradas = [...grupo.matchAll(/label:/g)].length;
  assert(entradas === 4, `el grupo tiene ${entradas} entradas de menú`);
});

check("M2. las pantallas hablan de «empresa», no de «organización»", () => {
  const visibles = [...COMPONENTS.matchAll(/>([^<>{}]*organizaci[oó]n[^<>{}]*)</gi)]
    .map((m) => m[1].trim()).filter((t) => t.length > 0);
  assert(visibles.length === 0,
    `hay texto visible que dice «organización»: ${visibles.slice(0, 2).join(" · ")}`);
});

check("M3. las rutas están protegidas y son dinámicas", () => {
  assert(routeFiles.length >= 8, `solo hay ${routeFiles.length} rutas de proveedores`);
  for (const f of routeFiles) {
    const src = read(f);
    assert(/requireQualityModule/.test(src), `${f} no exige el módulo`);
    assert(/export const dynamic = "force-dynamic"/.test(src), `${f} no es dinámica`);
  }
});

check("M4. lo que no existe no se enlaza", () => {
  const rutas = new Set(routeFiles.map((f) =>
    f.replace(ROUTES_DIR, "/quality/suppliers").replace(/\/page\.tsx$/, "") || "/quality/suppliers"));
  for (const m of COMPONENTS.matchAll(/href=\{?["`](\/quality\/suppliers[^"`{}]*)["`]/g)) {
    const href = m[1].replace(/\$\{[^}]*\}/g, "[x]");
    const plantilla = href
      .replace(/\/\[x\]\/sites\/\[x\]$/, "/[profileId]/sites/[siteId]")
      .replace(/\/evaluations\/\[x\]$/, "/evaluations/[evaluationId]")
      .replace(/^\/quality\/suppliers\/\[x\]$/, "/quality/suppliers/[profileId]");
    assert(rutas.has(plantilla) || plantilla === "/quality/suppliers",
      `la pantalla enlaza a ${href}, que no existe`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nN · TENDENCIA Y COMPARABILIDAD (GP-24, §30)");

check("N1. la tendencia solo se afirma con dos resultados comparables", () => {
  const sinDatos = describeTrend(null, null);
  assert(!/mejor|peor/i.test(sinDatos.text),
    "se afirma una tendencia sin evaluaciones");
  const unaSola = describeTrend({ score: 80, on: "2026-01-01" }, null);
  assert(!/mejor|peor/i.test(unaSola.text),
    "se afirma una tendencia con una sola evaluación");
  const dos = describeTrend({ score: 90, on: "2026-06-01" }, { score: 70, on: "2025-06-01" });
  assert(/mejor|sub|mejora/i.test(dos.text), "con dos resultados no se dice nada");
});

check("N2. la aprobación caducada NO cuenta como vigente", () => {
  assert(approvalExpired({ validUntil: "2026-01-01" }, "2026-02-01"),
    "una aprobación pasada sigue vigente");
  assert(!approvalExpired({ validUntil: null }, "2026-02-01"),
    "una aprobación sin fecha límite aparece como caducada");
  assert(/valid_until is null or d\.valid_until >= current_date/.test(SQL),
    "la vista da por vigente una aprobación caducada");
});

// ---------------------------------------------------------------------------
console.log("\nO · REQUISITOS (GP-06, GP-17, §16, §17)");

check("O1. los tres grados de exigencia existen", () => {
  assert(REQUIREMENT_ENFORCEMENTS.length === 3, "faltan grados de exigencia");
  assert(/enforcement in \('informational', 'required', 'blocking'\)/.test(SQL),
    "la base no impone los mismos tres grados");
});

check("O2. la asignación lleva fecha y no reescribe el pasado", () => {
  const cuerpo = tableBody("quality_supplier_requirement_assignments");
  assert(/effective_from\s+date not null/.test(cuerpo), "la asignación no tiene entrada en vigor");
  assert(/effective_to/.test(cuerpo), "no se puede retirar un requisito sin borrarlo");
  assert(/quality_supplier_requirements_on/.test(SQL),
    "no se puede leer qué se exigía en una fecha");
});

check("O3. un requisito bloqueante no suspende por su cuenta", () => {
  assert(/no la ejecuta|no suspende a nadie por su cuenta/.test(COMPONENTS + ADAPTERS),
    "nada explica que un requisito bloqueante no actúa solo");
});

// ---------------------------------------------------------------------------
console.log("\nP · MIGRACIÓN (§80)");

check("P1. 0125 es la única migración de este sprint y no edita anteriores", () => {
  const migraciones = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql")).sort();
  const nuevas = migraciones.filter((f) => /^01(2[5-9]|[3-9])/.test(f));
  assert(nuevas.length === 1 && nuevas[0].startsWith("0125"),
    `este sprint dejó ${nuevas.length} migraciones nuevas: ${nuevas.join(", ")}`);
  assert(migraciones.includes("0123_quality_people_competence_knowledge.sql")
    && migraciones.includes("0124_quality_people_tasks_from_sweep.sql"),
    "una migración anterior desapareció");
});

check("P2. la migración no borra nada de lo que ya había", () => {
  assert(!/drop table|drop column|truncate/i.test(SQL),
    "la migración destruye estructura existente");
  // Los `drop constraint` sí aparecen: es la única forma de ensanchar un
  // catálogo cerrado, y cada uno va seguido de su `add constraint`.
  const drops = [...SQL.matchAll(/drop constraint ([a-z0-9_]+)/g)].length;
  const adds = [...SQL.matchAll(/add constraint ([a-z0-9_]+)/g)].length;
  assert(adds >= drops, "se soltó una restricción sin volver a ponerla");
});

// ---------------------------------------------------------------------------
console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
