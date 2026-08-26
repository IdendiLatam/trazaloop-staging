/**
 * Trazaloop · Sprint PCR-03.1 — Gobernanza de evidencias.
 *
 * Dos capas (patrón de la casa):
 *   · DOMINIO REAL: se ejecutan las funciones puras de
 *     lib/domain/evidence-governance con los vectores del brief (vigencia,
 *     etiquetas prudentes, medios, tipologías).
 *   · CANDADOS: la 0106, la guarda de revisión, el soporte físico, los
 *     requisitos de cliente, las acciones y la UI conservan las decisiones
 *     del sprint. La verificación CONDUCTUAL equivalente corre contra
 *     PostgreSQL 16 real en tests/db/pcr03_assertions.sql (S12.1–S12.4).
 */
import { readFileSync, readdirSync } from "node:fs";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { join } from "node:path";
import {
  EVIDENCE_MEDIA,
  EVIDENCE_MEDIUM_LABEL,
  EVIDENCE_REVIEW_LABEL,
  EVIDENCE_CATEGORIES,
  EVIDENCE_CATEGORY_LABEL,
  evidenceCategoryLabel,
  isEvidenceCurrent,
  evidenceEffectiveLabel,
  physicalMayHaveFile,
} from "../../lib/domain/evidence-governance";

// Migraciones autorizadas a partir de 0111. Cada sprint que añade una
// migración la declara aquí: es lo que impide que aparezca una migración
// no revisada sin que ninguna prueba se entere.
const QUALITY_01_ALLOWED = new Set([
  "0111_platform_role_privileges.sql",
  "0112_quality_process_foundation.sql",
  "0113_quality_documents_and_position_lifecycle.sql",
  // QUALITY-01.2: relaciones entre procesos, documentos en entradas y
  // salidas, y snapshot de las aristas del mapa publicado.
  "0114_quality_relations_io_documents_and_map_edges.sql",
  // QUALITY-01.2: el snapshot del mapa, de solo lectura tambien donde el
  // entorno remoto concede DML por defecto sobre cada tabla nueva.
  "0115_quality_map_edges_privilege_hardening.sql",
  // QUALITY-02: control documental — identidad, revisión inmutable, workflow
  // con revisores y aprobadores, decisiones append-only, bandeja transversal
  // de tareas y alertas, y la lista maestra como vista derivada.
  "0116_document_control_revisions_workflow_and_tasks.sql",
  // QUALITY-03: objetivos, indicadores con configuración versionada,
  // mediciones con linaje, eventos de desempeño y cierre de ciclo.
  "0117_quality_objectives_indicators_and_measurements.sql",
  "0118_quality_measurement_engine_privilege_hardening.sql",
  "0119_quality_temporal_eligibility_and_lifecycle.sql",
  "0120_quality_draft_process_deletion.sql",
  "0121_work_cases_and_actions_engine.sql",
  // QUALITY-05: riesgos, oportunidades, controles y tratamiento, con
  // metodología configurable y versionada.
  "0122_quality_risks_and_opportunities.sql",
  // QUALITY-06: personas, cargos versionados, competencia, desarrollo,
  // desempeño, conocimiento y lecciones aprendidas.
  "0123_quality_people_competence_knowledge.sql",
]);

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`  ✖ ${name}`);
    console.error(`    ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

console.log("Sprint PCR-03.1 · gobernanza de evidencias\n");

// ───────────────────────── DOMINIO REAL ─────────────────────────
console.log("· Dominio puro (llamadas reales)");

check("G1 vigencia: solo 'Aceptada internamente' y NO archivada cuenta como soporte vigente", () => {
  assert(isEvidenceCurrent("valid", null) === true, "valid sin archivar debe ser vigente");
  assert(isEvidenceCurrent("valid", "2026-08-14T00:00:00Z") === false, "archivada no es vigente");
  assert(isEvidenceCurrent("rejected", null) === false, "rechazada JAMÁS es vigente");
  assert(isEvidenceCurrent("pending", null) === false, "pendiente aún no es vigente");
  assert(isEvidenceCurrent("expired", null) === false, "vencida no es vigente");
});

check("G2 etiquetas prudentes: 'Aceptada internamente', sin certificar ni aprobar", () => {
  assert(EVIDENCE_REVIEW_LABEL.valid === "Aceptada internamente", "valid → Aceptada internamente");
  assert(EVIDENCE_REVIEW_LABEL.pending === "Pendiente de revisión", "pending");
  assert(EVIDENCE_REVIEW_LABEL.rejected === "Rechazada", "rejected");
  const all = Object.values(EVIDENCE_REVIEW_LABEL).join(" ");
  assert(!/certificad|aprobad|cumple/i.test(all), "sin lenguaje de certificación/cumplimiento");
  assert(
    evidenceEffectiveLabel("valid", "2026-01-01") === "Aceptada internamente · Archivada",
    "estado efectivo combina revisión + archivo"
  );
});

check("G3 medios: digital/physical/hybrid con etiquetas honestas y physical sin archivo", () => {
  assert(EVIDENCE_MEDIA.length === 3, "tres medios");
  assert(EVIDENCE_MEDIUM_LABEL.physical === "Registro físico declarado", "físico declarado, no fingido");
  assert(EVIDENCE_MEDIUM_LABEL.hybrid === "Digital + físico", "híbrido");
  assert(physicalMayHaveFile() === false, "una evidencia física jamás tiene archivo");
});

check("G4 tipologías 5.3 completas y ADITIVAS (calidad, NC, reclamo, acuerdo de cliente…)", () => {
  for (const c of [
    "quality_control",
    "non_conformity",
    "customer_claim",
    "customer_requirement",
    "origin_supplier",
    "traceability",
    "recycled_content_support",
  ] as const) {
    assert(EVIDENCE_CATEGORIES.includes(c), `falta la tipología ${c}`);
    assert(EVIDENCE_CATEGORY_LABEL[c].length > 3, `etiqueta de ${c}`);
  }
  // Aditivo: los valores históricos (texto libre de 0019) se muestran tal cual.
  assert(evidenceCategoryLabel("Certificación ISO histórica") === "Certificación ISO histórica",
    "los tipos históricos no se rompen ni se traducen");
  assert(evidenceCategoryLabel(null) === "Sin tipo", "nulo legible");
});

// ───────────────────────── CANDADOS ─────────────────────────
console.log("\n· Candados del sprint");

const mig = read("supabase/migrations/0106_pcr031_evidence_governance.sql");
const migrations = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort();

check("M1 0106 es la migración de PCR-03.1; posteriores solo el resto del bloque PCR-03", () => {
  const after105 = migrations.filter((f) => f > "0105_" && !f.startsWith("0105"));
  assert(after105[0]?.startsWith("0106_pcr031"), "la 0106 abre el bloque PCR-03");
  // El bloque original continúa con 0107/0108; 0109 es el hotfix append-only PCR-03.4.1.
  const allowed = new Set([
    "0106_pcr031_evidence_governance.sql",
    "0107_pcr032_traceability_exercises.sql",
    "0108_pcr033_audit_dossiers.sql",
    "0109_pcr0341_evidence_status_case_hotfix.sql",
    // Hotfix 0110: calificación de pgcrypto en create_platform_organization.
    "0110_platform_org_pgcrypto_schema_fix.sql",
    // Q0.3H: privilegios de rol reproducibles desde migraciones (DR-22).
    "0111_platform_role_privileges.sql",
    // QUALITY-01: fundación de Procesos de Trazaloop Quality.
    "0112_quality_process_foundation.sql",
    // QUALITY-01.1: correcciones de aceptación (documentos y ciclo del cargo).
    "0113_quality_documents_and_position_lifecycle.sql",
    // QUALITY-01.2: relaciones entre procesos, documentos en entradas y
    // salidas, y snapshot de las aristas del mapa publicado.
    "0114_quality_relations_io_documents_and_map_edges.sql",
    // QUALITY-01.2: el snapshot del mapa, de solo lectura tambien donde el
    // entorno remoto concede DML por defecto sobre cada tabla nueva.
    "0115_quality_map_edges_privilege_hardening.sql",
    // QUALITY-02: control documental — identidad, revisión inmutable, workflow
    // con revisores y aprobadores, decisiones append-only, bandeja transversal
    // de tareas y alertas, y la lista maestra como vista derivada.
    "0116_document_control_revisions_workflow_and_tasks.sql",
    // QUALITY-03: objetivos, indicadores con configuración versionada,
    // mediciones con linaje, eventos de desempeño y cierre de ciclo.
    "0117_quality_objectives_indicators_and_measurements.sql",
    "0118_quality_measurement_engine_privilege_hardening.sql",
    "0119_quality_temporal_eligibility_and_lifecycle.sql",
    "0120_quality_draft_process_deletion.sql",
    "0121_work_cases_and_actions_engine.sql",
    // QUALITY-05: riesgos, oportunidades, controles y tratamiento, con
    // metodología configurable y versionada.
    "0122_quality_risks_and_opportunities.sql",
    // QUALITY-06: personas, cargos versionados, competencia, desarrollo,
    // desempeño, conocimiento y lecciones aprendidas.
    "0123_quality_people_competence_knowledge.sql",
  ]);
  const intruders = after105.filter((f) => !allowed.has(f));
  assert(intruders.length === 0, `migraciones no autorizadas: ${intruders.join(", ")}`);
  assert(
    migrations.includes("0109_pcr0341_evidence_status_case_hotfix.sql"),
    "0109 es el hotfix append-only PCR-03.4.1 autorizado"
  );
  assert(
    !migrations.some((f) => Number(f.slice(0, 4)) >= 111 && !QUALITY_01_ALLOWED.has(f)),
    "sin 0111 ni posterior (la 0110 es el hotfix pgcrypto autorizado)"
  );
  // La numeración histórica 0001–0105 tiene huecos deliberados: son 97
  // ficheros (candado R1 de PCR-02.5) y NINGUNO cambia en PCR-03.
  assert(migrations.filter((f) => f < "0106").length === 97, "las 97 migraciones históricas 0001–0105 intactas");
});

check("M2 0106 sin transaction control propio y compatible con CLI (PCR-02.5.2)", () => {
  const code = mig.replace(/--[^\n]*/g, "");
  assert(!/^\s*(begin|commit|rollback)\s*;/im.test(code), "sin BEGIN/COMMIT/ROLLBACK top-level");
  assert(!/create\s+index\s+concurrently|vacuum|alter\s+system/i.test(code), "sin operaciones vetadas");
});

check("M3 guarda de revisión: rol admin/quality, motivo obligatorio y sellos de servidor", () => {
  assert(mig.includes("guard_evidence_review"), "función de guarda");
  assert(mig.includes("array['admin', 'quality']"), "roles reales, sin roles inventados");
  assert(mig.includes("El motivo de rechazo es obligatorio."), "motivo obligatorio al rechazar");
  assert(/new\.reviewed_at\s*:=\s*now\(\)/.test(mig), "reviewed_at sellado en servidor");
  assert(/new\.reviewed_by\s*:=\s*auth\.uid\(\)/.test(mig), "reviewed_by = auth.uid(), infalsificable");
  assert(mig.includes("security definer") && mig.includes("set search_path = public"),
    "SECURITY DEFINER con search_path fijo");
  assert(mig.includes("revoke execute on function public.guard_evidence_review()"),
    "revokes del patrón de la casa");
});

check("M4 soporte físico honesto: CHECK physical ⇒ storage_path NULL", () => {
  assert(mig.includes("evidences_physical_without_file"), "constraint nombrado");
  assert(mig.includes("medium <> 'physical' or storage_path is null"), "regla exacta");
  assert(mig.includes("'digital', 'physical', 'hybrid'"), "tres medios en el CHECK");
});

check("M5 requisitos de cliente: multiempresa, FK compuesta, RLS y destino validado en BD", () => {
  assert(mig.includes("create table if not exists public.customer_requirements"), "tabla");
  assert(mig.includes("customer_requirements_org_code_uniq"), "código único por organización");
  assert(mig.includes("references public.customer_requirements (organization_id, id)"), "FK compuesta org+id");
  assert(mig.includes("validate_customer_requirement_link_target"), "trigger de destino");
  assert(mig.includes("El destino del vínculo no existe o no pertenece a tu empresa."), "mensaje de dominio");
  for (const pol of ["customer_requirements_select", "customer_requirements_insert", "customer_requirements_update", "customer_requirements_delete", "customer_requirement_links_select"]) {
    assert(mig.includes(pol), `política ${pol}`);
  }
  assert(mig.includes("t_audit_customer_requirements"), "auditoría del patrón existente");
});

check("M6 evidence_links se AMPLÍA (customer_requirement), sin tablas paralelas de vínculos de evidencia", () => {
  assert(mig.includes("alter type evidence_target_type add value if not exists 'customer_requirement'"),
    "enum ampliado aditivamente");
  assert(!/create table[^;]*evidence_link/i.test(mig.replace(/customer_requirement_links/g, "")),
    "sin segunda infraestructura de vínculos de evidencia");
});

check("A1 acciones de gobernanza presentes, con organization_id del SERVIDOR y sin service_role", () => {
  const acts = read("server/actions/evidences.ts");
  for (const fn of ["reviewEvidenceAction", "archiveEvidenceAction", "createPhysicalEvidenceAction", "declarePhysicalSupportAction"]) {
    assert(acts.includes(`export async function ${fn}`), `acción ${fn}`);
  }
  assert(acts.includes("El motivo de rechazo es obligatorio."), "regla del motivo también app-side");
  assert(!/SUPABASE_SERVICE_ROLE|service_role_key|serviceRole\s*[:(=]/i.test(acts),
    "sin uso de service_role en acciones de evidencias");
  assert((acts.match(/requireActiveOrg\(\)/g) ?? []).length >= 8, "organización resuelta en servidor en cada acción");
  const req = read("server/actions/customer-requirements.ts");
  assert(!/SUPABASE_SERVICE_ROLE|service_role_key|serviceRole\s*[:(=]/i.test(req), "sin uso de service_role en requisitos");
  assert(!req.includes('formData.get("organization_id")'), "organization_id JAMÁS del cliente");
});

check("A2 vínculo evidencia→requisito validado por tenant en linkEvidenceAction", () => {
  const acts = read("server/actions/evidences.ts");
  assert(acts.includes('"customer_requirement",'), "destino permitido");
  assert(acts.includes("El acuerdo/requisito no pertenece a tu empresa activa."), "validación explícita del tenant");
});

check("U1 UI de evidencias: filtros 5.6, revisión con confirmación (sin window.confirm) y físico visible", () => {
  const page = read("app/(app)/(shell)/(cpr)/evidences/page.tsx");
  for (const f of ["estado", "tipo", "medio", "archivadas"] as const) assert(page.includes(`params.${f}`), `filtro ${f}`);
  assert(page.includes("PhysicalEvidenceForm"), "alta de evidencia física");
  assert(page.includes("DeclarePhysicalForm"), "declaración de soporte físico");
  assert(page.includes("evidenceEffectiveLabel"), "estado efectivo (revisión + archivada)");
  const gov = read("components/domain/evidences/governance-actions.tsx");
  assert(gov.includes("ConfirmDialog"), "confirmación con el diálogo reutilizable");
  assert(!gov.includes("window.confirm("), "window.confirm proscrito (sin llamadas)");
  assert(gov.includes("Aceptar internamente"), "verbo prudente");
  assert(gov.includes("Confirmar rechazo") && gov.includes("Motivo del rechazo"), "rechazo con motivo obligatorio");
});

check("U2 página de requisitos de cliente paginada, con vínculos por código y evidencias asociadas", () => {
  const page = read("app/(app)/(shell)/(cpr)/catalog/customer-requirements/page.tsx");
  assert(page.includes("listCustomerRequirements"), "lista paginada");
  assert(page.includes("ListPagination"), "paginación real");
  assert(page.includes('listEvidencesForTargets(org.organizationId, "customer_requirement"'),
    "bidireccionalidad: desde el requisito se ven sus evidencias");
  const db = read("lib/db/customer-requirements.ts");
  assert(db.includes("PAGE_SIZE = 20") && db.includes(".range("), "consultas acotadas");
  assert(db.includes('.in("requirement_id", requirementIds)') && db.includes('.in("id", byType.product)'),
    "vínculos y etiquetas resueltos con consultas in() por página, no por fila (sin N+1)");
});

check("U3 searchEvidences: filtros aditivos y archivadas EXCLUIDAS por defecto", () => {
  const db = read("lib/db/evidences.ts");
  assert(db.includes("includeArchived"), "parámetro explícito");
  assert(db.includes('request.is("archived_at", null)'), "por defecto sin archivadas");
  assert(db.includes('"customer_requirement"'), "EvidenceTargetType ampliado");
});

check("N1 (rev. 03.1–03.3.3) el motor PCR gana la vigencia 03.1 SIN tocar la metodología", () => {
  // 0028 permanece BYTE-INTACTA: la redefinición vive en 0106 (PCR-03 aún
  // sin integrar), copiada de la versión vigente.
  const raw = fs.readFileSync(join(ROOT, "supabase/migrations/0028_recycled_content.sql"));
  const sha = crypto.createHash("sha256").update(raw).digest("hex");
  assert(sha === "ca5fd504cf91d924233746d5c5eadba7df6987fdcd58ad4be6ef15f52ebccaf4", "0028_recycled_content.sql BYTE-INTACTA");
  const legacy = read("lib/db/recycled.ts");
  assert(!legacy.includes("pcr031") && !legacy.includes("PCR-03"), "lib/db/recycled.ts intacto");
  assert(mig.includes("create or replace function public.calculate_recycled_content("), "0106 redefine el motor");
  const fn = mig.slice(mig.indexOf("create or replace function public.calculate_recycled_content("));
  // Todas las reglas metodológicas se CONSERVAN (fórmulas idénticas a 0028):
  for (const kept of [
    "v_percent := round(v_recycled / v_total * 100, 4);",
    "abs(v_consumed - v_total) > (v_tolerance / 100) * v_consumed",
    "'same_process_or_never_counts'",
    "'postindustrial_not_reclassified'",
    "'other_not_supported_in_methodology_v1'",
    "'non_recycled_material'",
    "'not_eligible_classification'",
    "'invalid_reclassification_support'",
    "'missing_origin_support'",
    "code = 'RC-6632-15343' and is_active",
    "returning * into v_row;",
  ]) {
    assert(fn.includes(kept), `regla metodológica conservada: ${kept}`);
  }
  // ÚNICO cambio: la vigencia documental 03.1 (valid + no archivada).
  assert(fn.includes("ev_o.archived_at as origin_archived_at"), "transporta origin_archived_at");
  assert(fn.includes("ev_r.archived_at as reclass_archived_at"), "transporta reclass_archived_at");
  assert(
    fn.includes("comp.origin_status <> 'valid' or comp.origin_archived_at is not null"),
    "origen vigente = valid AND no archivada"
  );
  assert(fn.includes("and comp.reclass_archived_at is null"), "reclasificación vigente = valid AND no archivada");
  assert(!fn.includes("v_recycled / v_batch.produced_quantity_kg"), "el denominador NO cambia");
  assert(!mig.toLowerCase().includes("textile"), "0106 no toca Textiles");
  // Conductual REAL en PostgreSQL: valid cuenta → archivada NO → desarchivada sí.
  const sqlDb = read("tests/db/pcr03_assertions.sql");
  assert(sqlDb.includes("ARCHIVED_EVIDENCE_CALCULATION = PASS"), "S15 ejercita el motor con la vigencia");
  assert(
    sqlDb.includes("la evidencia ARCHIVADA siguió habilitando masa") &&
      sqlDb.includes("al desarchivar debió volver a contar") &&
      sqlDb.includes("el cálculo histórico cambió"),
    "S15 cubre archivar → excluir, histórico intacto y desarchivar → contar"
  );
});

check("Rev. 03.1–03.3.4: la vigencia canónica (valid + no archivada) rige TODAS las superficies", () => {
  // Vistas históricas redefinidas en 0106 (0031/0032/0034/0104 intactas):
  for (const view of [
    "create or replace view public.v_output_batch_readiness",
    "create or replace view public.v_output_batch_evidence_matrix",
    "create or replace view public.v_implementation_dashboard",
    "create or replace view public.v_implementation_next_actions",
  ]) {
    assert(mig.includes(view), `0106 redefine ${view.split(".").pop()}`);
  }
  assert(
    mig.includes("(e.status = 'valid' and e.archived_at is null) as is_valid_for_defensibility"),
    "matriz: is_valid_for_defensibility exige NO archivada"
  );
  assert(
    mig.includes("count(*) filter (where status = 'valid' and archived_at is null)   as valid_evidences_count"),
    "dashboard: valid_evidences_count excluye archivadas"
  );
  assert(
    mig.includes("count(*) filter (where status = 'pending' and archived_at is null) as pending_evidences_count"),
    "dashboard: pending no cuenta archivadas"
  );
  assert(
    mig.includes("where status = 'pending' and archived_at is null"),
    "next_actions: sample_pending_evidence sin archivadas"
  );
  assert(mig.includes("or ev.archived_at is not null"), "next_actions/dashboard: archivada = soporte no vigente");
  const readinessBlock = mig.slice(
    mig.indexOf("create or replace view public.v_output_batch_readiness"),
    mig.indexOf("create or replace view public.v_output_batch_evidence_matrix")
  );
  assert((readinessBlock.match(/archived_at/g) ?? []).length >= 8, "readiness: las cuatro banderas + pending tratan la archivada como no vigente");
  // Catálogo y SupportBadge (con texto, no solo color):
  const cat = read("lib/db/catalog.ts");
  assert(cat.includes('"id, name, status, archived_at"'), "el catálogo trae archived_at de las evidencias");
  assert(
    cat.includes("origin_evidence_archived_at") && cat.includes("reclassification_evidence_archived_at"),
    "los tipos de Material transportan la vigencia"
  );
  const badge = read("components/domain/catalog/support-badge.tsx");
  assert(badge.includes("archivedAt"), "SupportBadge recibe archivedAt");
  assert(badge.includes('"Soporte archivado · no vigente"'), "estado archivado con TEXTO propio");
  const matPage = read("app/(app)/(shell)/(cpr)/catalog/materials/page.tsx");
  assert(matPage.includes("archivedAt={"), "la página de materiales pasa la vigencia al badge");
  // UI de matriz y guided-flow: la vigencia SQL manda.
  const table = read("components/domain/audit-support/evidence-matrix-table.tsx");
  assert(table.includes("r.is_valid_for_defensibility === true"), "filtro Válidas = vigentes reales");
  assert(!/===\s*"valid"\)/.test(table), "el filtro ya no usa evidence_status === 'valid'");
  assert(table.includes('"Aceptada internamente · Archivada"'), "estado explicado en la tabla");
  const gf = read("app/(app)/(shell)/(cpr)/guided-flow/output-batches/[id]/page.tsx");
  assert(gf.includes("e.is_valid_for_defensibility === true"), "guided-flow usa la vigencia de la vista");
  // Conductual transversal REAL:
  const sqlDb = read("tests/db/pcr03_assertions.sql");
  assert(sqlDb.includes("ARCHIVED_EVIDENCE_CROSS_SURFACE_CONSISTENCY = PASS"), "S17 cubre las tres fases en todas las superficies");
});

check("Rev. 03.1–03.3.1 · hallazgo 1: el trigger de evidence_links soporta customer_requirement ADITIVAMENTE", () => {
  const m = read("supabase/migrations/0106_pcr031_evidence_governance.sql");
  assert(m.includes("create or replace function public.validate_evidence_link_org()"), "0106 redefine la función del trigger (0020/0025)");
  assert(m.includes("when 'customer_requirement'"), "el CASE añade customer_requirement");
  for (const legacy of ["'site'", "'supplier'", "'material'", "'product'", "'product_family'", "'input_batch'", "'production_order'", "'output_batch'"]) {
    assert(m.includes(`when ${legacy}`), `tipo histórico ${legacy} preservado`);
  }
  assert(m.includes("from customer_requirements where id = new.target_id"), "resuelve la organización del requisito");
  const sql = read("tests/db/pcr03_assertions.sql");
  assert(sql.includes("el enlace evidencia→requisito cruzó de empresa"), "S12.4 ataca el cross-tenant del enlace");
  assert(sql.includes("el enlace aceptó un requisito inexistente"), "S12.4 ataca el destino inexistente");
  assert(sql.includes("el tipo histórico dejó de validar cross-tenant"), "S12.4 verifica que los tipos históricos siguen validando");
  const prelude = read("tests/db/harness-prelude.sql");
  assert(prelude.includes("create trigger t_evidence_links_same_org"), "el arnés cablea el trigger REAL para ejercitar la redefinición");
});

check("Rev. 03.1–03.3.1 · hallazgo 3: sellos de revisión infalsificables también SIN transición; reapertura controlada", () => {
  const m = read("supabase/migrations/0106_pcr031_evidence_governance.sql");
  assert(m.includes("new.reviewed_at    := old.reviewed_at;"), "sin transición: reviewed_at se preserva del histórico");
  assert(m.includes("new.review_comment := old.review_comment;"), "sin transición: el motivo no se reescribe");
  assert(m.includes("Solo administrador o calidad pueden reabrir una evidencia rechazada."), "rejected→otro estado exige admin/calidad");
  assert(m.includes("new.archived_at := old.archived_at;"), "sin (des)archivar: archived_at intocable");
  const sql = read("tests/db/pcr03_assertions.sql");
  assert(sql.includes("un UPDATE sin transición reescribió los sellos"), "S12.1b ejecuta el ataque de sellos sin transición");
  assert(sql.includes("archived_by fue falsificado sin transición"), "S12.3 ejecuta el ataque a archived_by");
  assert(sql.includes("el consultor reabrió una evidencia rechazada"), "S12.1c ejecuta el ataque de reapertura");
});

check("Rev. 03.1–03.3.1 · hallazgo 4: organization_id inmutable en las tablas nuevas (patrón 0024)", () => {
  const m06 = read("supabase/migrations/0106_pcr031_evidence_governance.sql");
  const m07 = read("supabase/migrations/0107_pcr032_traceability_exercises.sql");
  const m08 = read("supabase/migrations/0108_pcr033_audit_dossiers.sql");
  assert(m06.includes("t_customer_requirements_org_immutable"), "customer_requirements protegido");
  assert(m06.includes("t_customer_requirement_links_org_immutable"), "customer_requirement_links protegido");
  assert(m07.includes("t_traceability_exercises_org_immutable"), "traceability_exercises protegido");
  assert(m08.includes("t_audit_dossiers_org_immutable"), "audit_dossiers protegido");
  const sql = read("tests/db/pcr03_assertions.sql");
  assert(sql.includes("miembro de AMBAS"), "el ataque usa un usuario miembro de las DOS organizaciones");
  assert(sql.includes("customer_requirement cambió de organización"), "move de requisito atacado");
  assert(sql.includes("el ejercicio cambió de organización"), "move de ejercicio atacado");
  assert(sql.includes("el expediente cambió de organización"), "move de expediente atacado");
});

check("Rev. 03.1–03.3.1 · hallazgos 2 y 7: contrato LinkedEvidence explícito y bidireccionalidad del requisito", () => {
  const ev = read("lib/db/evidences.ts");
  assert(/medium: string;\s*\n\s*archived_at: string \| null;\s*\n\s*physical_reference: string \| null;/.test(ev), "LinkedEvidence TIPA medium/archived_at/physical_reference");
  assert(ev.includes("status, storage_path, medium, archived_at, physical_reference)"), "el SELECT consulta la gobernanza de verdad");
  assert(ev.includes('customer_requirement: "Acuerdo / requisito de cliente"'), "TARGET_TYPE_LABEL humano");
  assert(ev.includes('case "customer_requirement":'), "targetHref navega al requisito");
  assert(ev.includes("`${r.customer_name} · ${r.code} — ${r.title}`"), "listEvidenceUsage resuelve la etiqueta del requisito");
  const page = read("app/(app)/(shell)/(cpr)/catalog/customer-requirements/page.tsx");
  assert(page.includes("params.focus"), "la página de requisitos resuelve ?focus= (registro concreto)");
});

check("S1 arnés PostgreSQL cablea 0106 (--single-transaction) + S12 conductual", () => {
  const runner = read("tests/db/run-local-pg.sh");
  assert(runner.includes("0106_pcr031_evidence_governance.sql"), "0106 en el runner");
  assert(/--single-transaction[^\n]*0106_pcr031/.test(runner), "misma semántica que el despliegue CLI");
  const sql = read("tests/db/pcr03_assertions.sql");
  for (const sec of ["S12.1", "S12.2", "S12.3", "S12.4"] as const) assert(sql.includes(sec), `sección ${sec}`);
  assert(sql.includes("reviewed_by = cons_u"), "intento real de falsificación de sello, sobreescrito");
  assert(sql.includes("'customer_requirement', req"), "evidencia↔requisito probada en BD");
  assert(!/supabase\s+link|db\s+push|vercel|git\s+push/i.test(runner), "runner sin operaciones remotas");
});

console.log("");
if (failures > 0) {
  console.error(`PCR-03.1: ${failures} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("PCR-03.1: todas las verificaciones pasaron.");
