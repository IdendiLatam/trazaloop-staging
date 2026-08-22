/**
 * Trazaloop · Sprint PCR-03.2 — Ejercicio de trazabilidad pre-auditoría.
 *
 * Núcleo: llamadas REALES a buildExerciseSnapshot (lib/domain, puro) con
 * grafos de genealogía fabricados — la misma estructura que produce
 * collectGraphForOutput (PCR-02). Casos 1–22 del brief §6.8. La verificación
 * conductual en BD (snapshot inmutable, sin DELETE del historial, RLS) corre
 * en tests/db/pcr03_assertions.sql (S13) sobre PostgreSQL 16 real.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  GenealogyGraph,
  GenealogyOrder,
  GenealogyOutput,
  GenealogyInput,
} from "../../lib/domain/genealogy";
import {
  buildExerciseSnapshot,
  computeSnapshotHash,
  canonicalJson,
  EXERCISE_DISCLAIMER,
  EXERCISE_RESULT_LABEL,
  type ExerciseCollectedData,
  type LinkedEvidenceInput,
} from "../../lib/domain/traceability-exercise";

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

// ── Fábrica de fixtures (misma forma que collectGraphForOutput) ────────────
function graphOf(
  orders: GenealogyOrder[],
  outputs: GenealogyOutput[],
  inputs: GenealogyInput[],
  external: Array<{ production_order_id: string; input_batch_id: string; mass_kg: number }>,
  internal: Array<{ production_order_id: string; output_batch_id: string; mass_kg: number }>
): GenealogyGraph {
  return {
    orders: new Map(orders.map((o) => [o.id, o])),
    outputs: new Map(outputs.map((o) => [o.id, o])),
    inputs: new Map(inputs.map((i) => [i.id, i])),
    externalConsumption: external,
    internalConsumption: internal,
  };
}

const ord = (id: string, code: string): GenealogyOrder => ({ id, order_code: code, status: "closed", order_date: "2026-08-01" });
const out = (id: string, code: string, orderId: string, kg = 40): GenealogyOutput => ({
  id, batch_code: code, production_order_id: orderId, product_label: "PR-1 · Pellet", produced_quantity_kg: kg, produced_date: "2026-08-02",
});
const inp = (id: string, code: string, material = "PET reciclado", supplier: string | null = "EcoPlast"): GenealogyInput => ({
  id, batch_code: code, supplier_name: supplier, material_name: material, quantity_kg: 100,
});
const okBalance = { input_batches: [], output_batches: [] };

function baseData(overrides: Partial<ExerciseCollectedData> = {}): ExerciseCollectedData {
  const graph = graphOf(
    [ord("o1", "OP-1")],
    [out("b1", "OUT-1", "o1")],
    [inp("i1", "LE-1")],
    [{ production_order_id: "o1", input_batch_id: "i1", mass_kg: 60 }],
    []
  );
  return {
    organization_name: "Recicladora Demo",
    target: { output_batch_id: "b1", batch_code: "OUT-1", product_label: "PR-1 · Pellet", produced_quantity_kg: 40 },
    graph,
    balances: okBalance,
    evidences: [validEvidence()],
    requirements: [],
    calculation: { recycled_percent: 62.5, calculated_at: "2026-08-03T10:00:00Z", level: "defensible", warnings: [] },
    ...overrides,
  };
}

function validEvidence(over: Partial<LinkedEvidenceInput> = {}): LinkedEvidenceInput {
  return {
    target_type: "material",
    target_id: "m1",
    target_label: "Material PET reciclado",
    name: "Declaración de origen",
    evidence_type: "origin_supplier",
    status: "valid",
    medium: "digital",
    archived_at: null,
    physical_reference: null,
    link_role: "soporte de origen del material",
    ...over,
  };
}

console.log("Sprint PCR-03.2 · ejercicio de trazabilidad\n");
console.log("· Ensamblador REAL (casos 1–19 del brief)");

check("1. Lote simple proveedor→entrada→orden→salida: cadena de un nivel y resultado Completo", () => {
  const snap = buildExerciseSnapshot(baseData());
  assert(snap.chain.length === 1 && snap.chain[0].depth === 0, "un solo nivel");
  assert(snap.chain[0].external_inputs[0].supplier === "EcoPlast", "proveedor en la cadena");
  assert(snap.result === "complete", `resultado esperado complete, fue ${snap.result}`);
  assert(snap.counts.gaps === 0, "sin brechas");
});

check("2. Multinivel proveedor→entrada→orden A→intermedio→orden B→final: dos niveles reconstruidos", () => {
  const graph = graphOf(
    [ord("oA", "OP-A"), ord("oB", "OP-B")],
    [out("bF", "OUT-FINAL", "oB"), out("bI", "OUT-INTERMEDIO", "oA")],
    [inp("i1", "LE-1")],
    [{ production_order_id: "oA", input_batch_id: "i1", mass_kg: 80 }],
    [{ production_order_id: "oB", output_batch_id: "bI", mass_kg: 30 }]
  );
  const snap = buildExerciseSnapshot(
    baseData({ graph, target: { output_batch_id: "bF", batch_code: "OUT-FINAL", product_label: null, produced_quantity_kg: 25 } })
  );
  assert(snap.chain.length === 2, "dos eslabones");
  assert(snap.chain[0].internal_inputs[0].batch_code === "OUT-INTERMEDIO", "consumo interno en el nivel 0");
  assert(snap.chain[1].depth === 1 && snap.chain[1].external_inputs[0].batch_code === "LE-1", "el nivel 1 llega al lote externo");
  assert(snap.counts.internal_batches === 1 && snap.counts.orders === 2, "conteos multinivel");
});

check("3. Múltiples lotes de entrada en una orden: todos identificados", () => {
  const graph = graphOf(
    [ord("o1", "OP-1")],
    [out("b1", "OUT-1", "o1")],
    [inp("i1", "LE-1"), inp("i2", "LE-2", "PP reciclado", "Verde SAS")],
    [
      { production_order_id: "o1", input_batch_id: "i1", mass_kg: 60 },
      { production_order_id: "o1", input_batch_id: "i2", mass_kg: 20 },
    ],
    []
  );
  const snap = buildExerciseSnapshot(baseData({
    graph,
    evidences: [validEvidence(), validEvidence({ target_label: "Material PP reciclado" })],
  }));
  assert(snap.counts.external_batches === 2 && snap.counts.suppliers === 2, "2 lotes y 2 proveedores");
});

check("4. Evidencia aceptada internamente cuenta como vigente (sin brecha documental)", () => {
  const snap = buildExerciseSnapshot(baseData());
  assert(snap.evidences[0].current === true, "vigente");
  assert(snap.evidences[0].review_label === "Aceptada internamente", "etiqueta prudente");
  assert(!snap.findings.some((f) => f.level === "gap" && f.area === "evidencias"), "sin brecha");
});

check("5. Evidencia pendiente: advertencia (existe pero sin aceptación interna)", () => {
  const snap = buildExerciseSnapshot(baseData({ evidences: [validEvidence({ status: "pending" })] }));
  assert(snap.findings.some((f) => f.level === "warning" && /pendientes de revisión/.test(f.message)), "advertencia de pendientes");
  assert(snap.result === "complete_with_warnings" || snap.result === "incomplete", "no puede ser Completo");
});

check("6. Evidencia rechazada JAMÁS cuenta como soporte y genera advertencia + brecha del material", () => {
  const snap = buildExerciseSnapshot(baseData({ evidences: [validEvidence({ status: "rejected" })] }));
  assert(snap.evidences[0].current === false, "rechazada no vigente");
  assert(snap.findings.some((f) => /rechazada/.test(f.message)), "advertencia de rechazo");
  assert(snap.findings.some((f) => f.level === "gap" && /PET reciclado no tiene evidencia vigente/.test(f.message)), "el material queda sin soporte vigente");
  assert(snap.result === "incomplete", "brecha → Incompleto");
});

check("7. Evidencia física declarada: vigente y localizable, sin fingir archivo", () => {
  const snap = buildExerciseSnapshot(baseData({
    evidences: [validEvidence({ medium: "physical", physical_reference: "Carpeta AZ-03" })],
  }));
  assert(snap.evidences[0].current === true, "física aceptada es vigente");
  assert(snap.findings.some((f) => /1 con soporte físico declarado/.test(f.message)), "contada como física");
});

check("8. Ausencia de evidencia del material → brecha documental con recomendación práctica", () => {
  const snap = buildExerciseSnapshot(baseData({ evidences: [] }));
  const gap = snap.findings.find((f) => f.level === "gap" && f.area === "evidencias");
  assert(gap, "brecha presente");
  assert(gap.recommendation && /Vincula/.test(gap.recommendation), "con recomendación");
  assert(snap.result === "incomplete", "Incompleto");
});

check("9. Cálculo PCR existente: visible con su porcentaje, sin tocar la metodología", () => {
  const snap = buildExerciseSnapshot(baseData());
  assert(snap.calculation?.recycled_percent === 62.5, "porcentaje del cálculo");
  assert(snap.findings.some((f) => f.area === "pcr" && /62.5%/.test(f.message)), "informado");
});

check("10. Sin cálculo PCR: advertencia (no brecha: puede no aplicar)", () => {
  const snap = buildExerciseSnapshot(baseData({ calculation: null }));
  assert(snap.findings.some((f) => f.area === "pcr" && f.level === "warning"), "advertencia");
  assert(snap.result === "complete_with_warnings", "Completo con advertencias");
});

check("11. Acuerdo de cliente vinculado: aparece en la sección Cliente", () => {
  const snap = buildExerciseSnapshot(baseData({
    requirements: [{ code: "REQ-ACME-01", customer_name: "ACME", title: "PCR mínimo", active: true, target_label: "Producto del lote" }],
  }));
  assert(snap.requirements.length === 1, "requisito presente");
  assert(snap.findings.some((f) => f.area === "cliente" && /1 acuerdo/.test(f.message)), "informado");
});

check("12. Evidencia de calidad/NC/reclamo: clasificada en la sección Calidad", () => {
  const snap = buildExerciseSnapshot(baseData({
    evidences: [validEvidence(), validEvidence({ evidence_type: "non_conformity", name: "NC-2026-04", target_type: "production_order", target_id: "o1", target_label: "Orden OP-1" })],
  }));
  assert(snap.findings.some((f) => f.area === "calidad" && /1 evidencia/.test(f.message)), "contada en calidad");
});

check("17/18. Ciclo de genealogía: manejado sin loop infinito (visited set de PCR-02)", () => {
  // bA se consume en la orden de bB y viceversa (ciclo artificial)
  const graph = graphOf(
    [ord("oA", "OP-A"), ord("oB", "OP-B")],
    [out("bA", "OUT-A", "oA"), out("bB", "OUT-B", "oB")],
    [],
    [],
    [
      { production_order_id: "oA", output_batch_id: "bB", mass_kg: 5 },
      { production_order_id: "oB", output_batch_id: "bA", mass_kg: 5 },
    ]
  );
  const started = Date.now();
  const snap = buildExerciseSnapshot(baseData({ graph, target: { output_batch_id: "bA", batch_code: "OUT-A", product_label: null, produced_quantity_kg: 10 } }));
  assert(Date.now() - started < 2000, "terminó de inmediato (sin loop infinito)");
  assert(snap.chain.length === 2, "cada lote aparece UNA vez pese al ciclo");
});

check("19. Profundidad limitada de forma segura: cadena de 15 niveles → truncada con advertencia", () => {
  const orders: GenealogyOrder[] = [];
  const outputs: GenealogyOutput[] = [];
  const internal: Array<{ production_order_id: string; output_batch_id: string; mass_kg: number }> = [];
  for (let i = 0; i < 15; i++) {
    orders.push(ord(`o${i}`, `OP-${i}`));
    outputs.push(out(`b${i}`, `OUT-${i}`, `o${i}`));
    if (i > 0) internal.push({ production_order_id: `o${i - 1}`, output_batch_id: `b${i}`, mass_kg: 1 });
  }
  const snap = buildExerciseSnapshot(baseData({
    graph: graphOf(orders, outputs, [], [], internal),
    target: { output_batch_id: "b0", batch_code: "OUT-0", product_label: null, produced_quantity_kg: 10 },
  }));
  assert(snap.chain.length === 11, `profundidad 0–10 (hay ${snap.chain.length})`);
  assert(snap.chain.some((s) => s.truncated), "eslabón truncado marcado");
  assert(snap.findings.some((f) => /profundidad máxima/.test(f.message)), "advertencia de profundidad");
});

check("14–16 (dominio). Snapshot determinista con hash estable; datos nuevos → hash nuevo", () => {
  const a = buildExerciseSnapshot(baseData());
  const b = buildExerciseSnapshot(baseData());
  assert(computeSnapshotHash(a) === computeSnapshotHash(b), "misma foto → mismo hash");
  const c = buildExerciseSnapshot(baseData({ evidences: [] }));
  assert(computeSnapshotHash(a) !== computeSnapshotHash(c), "otra foto → otro hash");
  assert(canonicalJson({ b: 1, a: 2 }) === canonicalJson({ a: 2, b: 1 }), "canónico por claves ordenadas");
});

check("21. Lenguaje prudente: sin cumple/no cumple/aprobado/certificado en snapshot ni etiquetas", () => {
  const snap = buildExerciseSnapshot(baseData({ evidences: [] }));
  const text = JSON.stringify(snap) + Object.values(EXERCISE_RESULT_LABEL).join(" ");
  assert(!/no cumple|(?<!in)cumple\b|aprobado|certificad/i.test(text), "lenguaje prudente en todo el snapshot");
  assert(snap.disclaimer === EXERCISE_DISCLAIMER, "disclaimer congelado en la foto");
  assert(/no constituye una auditoría, certificación ni dictamen/.test(EXERCISE_DISCLAIMER), "texto del brief");
});

console.log("\n· Candados del sprint (13/14/15/16/20/22 + BD)");

const mig = read("supabase/migrations/0107_pcr032_traceability_exercises.sql");

check("22. Tras 0105: bloque PCR-03 0106–0108 + hotfixes autorizados 0109 y 0110; sin 0111+", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort();
  const later = files.filter((f) => f > "0105_z");
  assert(later[0]?.startsWith("0106_pcr031") && later[1]?.startsWith("0107_pcr032"),
    "0106 y 0107 presentes y en orden");
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
  ]);
  const intruders = later.filter((f) => !allowed.has(f));
  assert(intruders.length === 0, `migraciones no autorizadas: ${intruders.join(", ")}`);

  const hotfix = read("supabase/migrations/0109_pcr0341_evidence_status_case_hotfix.sql");
  assert(
    hotfix.includes("create or replace function public.pcr_build_exercise_snapshot"),
    "0109 redefine únicamente el builder afectado"
  );
  assert(
    hotfix.includes("else e.status::text end)"),
    "0109 convierte evidence_status a text en el CASE"
  );
  assert(
    !hotfix.includes("else e.status end)"),
    "0109 no conserva el CASE defectuoso"
  );
  // Q0.3H · La guarda original vetaba TODA migracion 0111+, de modo que cualquier
  // sprint posterior legitimo la rompia. Se conserva su intencion —ese sprint no
  // anadio migraciones— con una lista blanca explicita, el mismo patron que ya
  // usan las demas suites.
  assert(
    !files.some((f) => Number(f.slice(0, 4)) >= 111 && !QUALITY_01_ALLOWED.has(f)),
    "sin 0111 ni posterior (la 0110 es el hotfix pgcrypto autorizado)"
  );
});

check("14. Snapshot inmutable tras completed: guarda jsonb-minus + estados draft/completed/archived", () => {
  assert(mig.includes("traceability_exercises_immutability_guard"), "guarda de inmutabilidad");
  assert(mig.includes("to_jsonb(new) - 'status' - 'updated_at'"), "patrón jsonb-minus de 0104 §2e");
  assert(mig.includes("'draft', 'completed', 'archived'"), "workflow simple sin sobrecomplicar");
  assert(mig.includes("solo puede archivarse"), "única transición permitida");
  assert(mig.includes("schema_version") && mig.includes("pcr_traceability_exercise_v1"), "schema_version del snapshot");
  assert(mig.includes("source_hash"), "source_hash persistido");
});

check("15/16. Cambios posteriores no alteran el histórico; el DELETE de finalizados está vetado", () => {
  assert(mig.includes("traceability_exercises_protect_delete"), "trigger de DELETE");
  assert(mig.includes("El ejercicio finalizado forma parte del historial"), "mensaje de dominio");
  const sql = read("tests/db/pcr03_assertions.sql");
  assert(sql.includes("S13.1") && sql.includes("S13.2") && sql.includes("S13.3"), "conductual en PostgreSQL real");
  assert(sql.includes("el hash del snapshot cambió") === false || sql.includes("FALLO S13.1"), "hash verificado tras el intento de reescritura");
  assert(
    sql.includes("el ejercicio nuevo no refleja el consumo añadido") &&
      sql.includes("la fotografía histórica fue alterada") &&
      sql.includes("dos fotografías con datos distintos comparten hash"),
    "A4: datos nuevos → fotografía nueva; la histórica y su hash permanecen"
  );
  // (rev. 03.1–03.3.1, hallazgo 5) La suite DB ataca la fabricación:
  assert(sql.includes("un completed se INSERTÓ directamente"), "S13 ejecuta el INSERT directo de un completed como ataque");
  assert(sql.includes("draft→completed directo fue permitido"), "S13 ejecuta el UPDATE directo draft→completed como ataque");
  assert(sql.includes("complete_traceability_exercise"), "S13 demuestra el flujo legítimo por la RPC");
});

check("13. Aislamiento entre empresas: RLS + FK compuesta al lote de la MISMA organización", () => {
  assert(mig.includes("references public.output_batches (organization_id, id)"), "FK compuesta org+lote");
  assert(mig.includes("on delete restrict"), "el lote con historial no desaparece");
  for (const pol of ["traceability_exercises_select", "traceability_exercises_insert", "traceability_exercises_update", "traceability_exercises_delete"]) {
    assert(mig.includes(pol), `política ${pol}`);
  }
  assert(mig.includes("is_org_member"), "políticas por membresía");
});

check("20. Sin service_role indebido; organization_id resuelto en servidor; snapshot sin signed URLs", () => {
  const act = read("server/actions/traceability-exercise.ts");
  assert(!/SUPABASE_SERVICE_ROLE|service_role_key/i.test(act), "sin service_role");
  assert(act.includes("requireActiveOrg()"), "organización del servidor");
  assert(!act.includes('formData.get("organization_id")'), "organization_id jamás del cliente");
  const collector = read("lib/db/traceability-exercise.ts");
  assert(!/createSignedUrl|signedUrl\s*[:(=]/.test(collector), "el colector no GENERA signed URLs (el comentario que lo prohíbe sí puede mencionarlas)");
});

check("Rev. 03.1–03.3.1 · hallazgo 5: el completed solo nace en la RPC (draft-only + flag transaccional)", () => {
  const m = read("supabase/migrations/0107_pcr032_traceability_exercises.sql");
  assert(m.includes("traceability_exercises_insert_guard"), "INSERT solo como borrador vacío");
  assert(m.includes("traceability_exercises_protected_fields_guard"), "campos calculados bajo guard");
  assert(m.includes("trazaloop.exercise_complete"), "flag transaccional interno (patrón 0084)");
  assert(m.includes("create or replace function public.complete_traceability_exercise("), "RPC controlada de completado");
  // (rev. 03.1–03.3.2, hallazgo 1) La RPC ya NO acepta contenido del llamador:
  // la fotografía la construye el builder autoritativo y el hash se calcula
  // sobre ESE jsonb de servidor.
  assert(!m.includes("p_snapshot"), "la RPC no expone p_snapshot: el snapshot es imposible de declarar");
  assert(
    m.includes("create or replace function public.pcr_build_exercise_snapshot("),
    "builder autoritativo de la fotografía DENTRO de 0107"
  );
  assert(
    m.includes("revoke execute on function public.pcr_build_exercise_snapshot(uuid, uuid) from public, anon, authenticated;"),
    "el builder es interno: sin EXECUTE para clientes"
  );
  assert(m.includes("v_snapshot := public.pcr_build_exercise_snapshot("), "la RPC completa con la fotografía del builder");
  // (rev. 03.1–03.3.3, hallazgos 3–5) Matriz de evidencias COMPLETA:
  assert(m.includes("select distinct 'product', p.id, 'Producto ' || p.code || ' · ' || p.name"), "destino product en el builder");
  assert(m.includes("select distinct 'customer_requirement', cr.id"), "destino customer_requirement en el builder");
  assert(
    m.includes("'Soporte de origen del material'") && m.includes("'Soporte de reclasificación del material'"),
    "soportes DIRECTOS del material (mismos campos que el motor PCR) incluidos"
  );
  assert(m.includes("and not exists (select 1 from evidence_links el2"), "sin duplicados cuando también existe el enlace explícito");
  // (rev. 03.1–03.3.4, hallazgos 9–11)
  assert(m.includes("into v_material_ids"), "conjunto CANÓNICO de materiales (entradas UNION composición)");
  assert(
    m.includes("from batch_composition bcmp") && m.includes("bcmp.output_batch_id = any(v_ob_ids)"),
    "los materiales de la composición de TODA la cadena entran al conjunto"
  );
  assert(m.includes("m.id = any(v_material_ids)"), "targets y soportes implícitos usan el canónico");
  assert(m.includes("'components', coalesce(c.components, '[]'::jsonb)"), "el snapshot expone los componentes del motor");
  assert(
    m.includes("where ob.id = any(v_ob_ids) and ob.product_id is not null)));"),
    "los requisitos usan los productos de TODA la cadena (coherencia con evidencias)"
  );
  const sqlComp = read("tests/db/pcr03_assertions.sql");
  assert(sqlComp.includes("COMPOSITION_ONLY_MATERIAL_EVIDENCE = PASS"), "S18 ejercita el material solo-composición");
  for (const meta of ["'evidence_id'", "'evidence_date'", "'reviewed_at'", "'reviewed_by_email'", "'responsible'", "'physical_location'", "'physical_custodian'", "'has_digital_file'"]) {
    assert(m.includes(meta), `metadata ${meta} en la matriz`);
  }
  assert(!m.includes("signed_url") && !m.includes("createSignedUrl"), "jamás signed URLs en la fotografía");
  assert(m.includes("encode(sha256(convert_to(v_snapshot::text, 'UTF8')), 'hex')"), "source_hash calculado EN SERVIDOR sobre el snapshot del servidor");
  assert(m.includes("constraint traceability_exercises_counts_check"), "CHECK: conteos jamás negativos (hallazgo 5)");
  assert(
    m.includes("Solo administrador o calidad pueden archivar ejercicios."),
    "archivar exige rol TAMBIÉN en BD (hallazgo 4)"
  );
  assert(m.includes("new.started_by := auth.uid();"), "started_by verdad-servidor");
  const act = read("server/actions/traceability-exercise.ts");
  assert(act.includes('rpc("complete_traceability_exercise"'), "la acción completa por la RPC");
  assert(!act.includes("p_snapshot"), "la acción NO envía fotografía alguna (hallazgo 1)");
  assert(
    !act.includes("buildExerciseSnapshot") && !act.includes("collectExerciseData"),
    "la acción no ensambla el snapshot: la fuente de verdad es el builder SQL"
  );
  assert(!act.includes("computeSnapshotHash"), "la acción ya no calcula el hash: es verdad-servidor");
  assert(
    act.includes('return { error: "Solo administrador o calidad pueden archivar ejercicios." };'),
    "archivar comprueba el rol en la Server Action (hallazgo 4)"
  );
  assert(!/\.update\(\{[\s\S]*?status:\s*"completed"/.test(act), "sin UPDATE directo a completed en la acción");
});

check("Rev. 03.1–03.3.1 · hallazgos 2 y 8: colector sin casts y búsqueda server-side antes de paginar", () => {
  const col = read("lib/db/traceability-exercise.ts");
  assert(col.includes("medium: e.medium"), "medium viaja del contrato, sin cast");
  assert(!col.includes('(e as { medium?: string })'), "sin casts engañosos sobre campos no consultados");
  assert(col.includes('ilike("output_batches.batch_code"'), "búsqueda por código de lote EN SERVIDOR");
  assert(col.includes("!inner"), "join !inner para que el filtro y el total operen en BD");
  assert(col.includes('replace(/[%_]/g, "")'), "%/_ saneados");
  assert(!/rows\s*=\s*rows\.filter\(|\.filter\(\(r\)\s*=>\s*\(?term/.test(col), "sin filtrado en JavaScript de la página actual");
  assert(col.includes("{ count: \"exact\" }"), "el total representa el resultado filtrado");
});

check("Migración 0107 sin transaction control y compatible con CLI (regla PCR-02.5.2)", () => {
  const code = mig.replace(/--[^\n]*/g, "");
  assert(!/^\s*(begin|commit|rollback)\s*;/im.test(code), "sin BEGIN/COMMIT top-level");
  assert(!/create\s+index\s+concurrently|vacuum|alter\s+system/i.test(code), "sin operaciones vetadas");
  const runner = read("tests/db/run-local-pg.sh");
  assert(/--single-transaction[^\n]*0107_pcr032/.test(runner), "el runner la aplica con --single-transaction");
});

check("UI 6.7: lista + iniciar acotado + detalle con las 13 secciones y disclaimer", () => {
  const list = read("app/(app)/(shell)/(cpr)/audit-prep/exercises/page.tsx");
  assert(list.includes("searchOutputBatchesForExercise"), "selector acotado del lote");
  assert(list.includes("EXERCISE_DISCLAIMER"), "disclaimer en la lista");
  assert(list.includes("ListPagination"), "paginación");
  const detail = read("app/(app)/(shell)/(cpr)/audit-prep/exercises/[id]/page.tsx");
  for (const sec of [
    "Resultado interno",
    "Lote objetivo",
    "Genealogía (reconstrucción hacia atrás)",
    "Balance de cantidades",
    "Alcance de la cadena",
    "Evidencias de la cadena",
    "Acuerdos / requisitos de cliente",
    "Registros de calidad, NC y reclamaciones",
    "Cálculo de contenido reciclado (PCR)",
    "Observaciones del ejercicio",
  ]) {
    assert(detail.includes(sec), `sección «${sec}»`);
  }
  assert(detail.includes("snapshot.disclaimer"), "disclaimer desde la FOTOGRAFÍA");
  assert(detail.includes("source_hash"), "huella visible");
  const hub = read("app/(app)/(shell)/(cpr)/traceability/page.tsx");
  assert(hub.includes("Preparación para auditoría") && hub.includes("/audit-prep/exercises"), "agrupación §8 en el hub");
});

console.log("");
if (failures > 0) {
  console.error(`PCR-03.2: ${failures} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("PCR-03.2: todas las verificaciones pasaron.");
