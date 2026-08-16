/**
 * Trazaloop · Sprint PCR-03.3 — Expediente interno de preparación para
 * auditoría. Núcleo: llamadas REALES a buildDossierSnapshot (dominio puro)
 * con un ejercicio completo de PCR-03.2, más candados de migración, UI,
 * roles y no-regresión. Conductual en BD: tests/db/pcr03_assertions.sql
 * (S14: versionado, inmutabilidad, DELETE vetado, RLS/FK cross-tenant).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildDossierSnapshot,
  buildDossierCode,
  computeDossierHash,
  DOSSIER_DISCLAIMER,
  DOSSIER_SCHEMA_VERSION,
} from "../../lib/domain/audit-dossier";
import {
  buildExerciseSnapshot,
  type ExerciseCollectedData,
} from "../../lib/domain/traceability-exercise";
import type { GenealogyGraph } from "../../lib/domain/genealogy";

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

function fixtureExercise() {
  const graph: GenealogyGraph = {
    orders: new Map([["o1", { id: "o1", order_code: "OP-1", status: "closed", order_date: "2026-08-01" }]]),
    outputs: new Map([["b1", { id: "b1", batch_code: "OUT-1", production_order_id: "o1", product_label: "PR-1 · Pellet", produced_quantity_kg: 40, produced_date: "2026-08-02" }]]),
    inputs: new Map([["i1", { id: "i1", batch_code: "LE-1", supplier_name: "EcoPlast", material_name: "PET reciclado", quantity_kg: 100 }]]),
    externalConsumption: [{ production_order_id: "o1", input_batch_id: "i1", mass_kg: 60 }],
    internalConsumption: [],
  };
  const data: ExerciseCollectedData = {
    organization_name: "Recicladora Demo",
    target: { output_batch_id: "b1", batch_code: "OUT-1", product_label: "PR-1 · Pellet", produced_quantity_kg: 40 },
    graph,
    balances: {
      input_batches: [{ id: "i1", batch_code: "LE-1", received_kg: 100, consumed_kg: 60, available_kg: 40 }],
      output_batches: [{ id: "b1", batch_code: "OUT-1", produced_kg: 40, consumed_internally_kg: 0, available_kg: 40 }],
    },
    evidences: [
      { target_type: "material", target_id: "m1", target_label: "Material PET reciclado", name: "Declaración de origen", evidence_type: "origin_supplier", status: "valid", medium: "digital", archived_at: null, physical_reference: null, link_role: "soporte de origen del material" },
      { target_type: "production_order", target_id: "o1", target_label: "Orden OP-1", name: "Registro de control en planta", evidence_type: "quality_control", status: "valid", medium: "physical", archived_at: null, physical_reference: "Carpeta AZ-03", link_role: null },
      { target_type: "output_batch", target_id: "b1", target_label: "Lote producido OUT-1", name: "Informe rechazado", evidence_type: "other_support", status: "rejected", medium: "digital", archived_at: null, physical_reference: null, link_role: null },
    ],
    requirements: [{ code: "REQ-ACME-01", customer_name: "ACME", title: "PCR mínimo acordado", active: true, target_label: "Producto del lote" }],
    calculation: { recycled_percent: 62.5, calculated_at: "2026-08-03T10:00:00Z", level: "defensible", warnings: [] },
  };
  return buildExerciseSnapshot(data);
}

function fixtureDossier() {
  const exSnap = fixtureExercise();
  return buildDossierSnapshot({
    organizationName: "Recicladora Demo",
    batchCode: "OUT-1",
    productLabel: "PR-1 · Pellet",
    producedQuantityKg: 40,
    dossierCode: buildDossierCode(2026, 7),
    version: 2,
    generatedAt: "2026-08-14T15:00:00Z",
    generatedByEmail: "calidad@demo.co",
    exercise: {
      id: "ex-1",
      started_at: "2026-08-14T14:59:00Z",
      completed_at: "2026-08-14T14:59:40Z",
      result: exSnap.result,
      source_hash: "hash-del-ejercicio",
      snapshot: exSnap,
    },
  });
}

console.log("Sprint PCR-03.3 · expediente de preparación de auditoría\n");
console.log("· Ensamblador REAL (secciones A–K)");

check("A/B. Portada completa y resumen con todos los conteos del brief", () => {
  const d = fixtureDossier();
  assert(d.schema_version === DOSSIER_SCHEMA_VERSION, "schema_version");
  assert(d.cover.dossier_code === "EXP-PCR-2026-0007", "código EXP-PCR-AAAA-NNNN");
  assert(d.cover.version === 2 && d.cover.organization_name === "Recicladora Demo", "portada");
  assert(d.summary.orders === 1 && d.summary.external_batches === 1 && d.summary.suppliers === 1, "conteos de cadena");
  assert(d.summary.evidences === 3 && typeof d.summary.gaps === "number" && typeof d.summary.warnings === "number", "conteos de evidencias/brechas");
});

check("C/D. Genealogía y balances incluidos desde el ejercicio (fuente principal)", () => {
  const d = fixtureDossier();
  assert(d.genealogy.length === 1 && d.genealogy[0].external_inputs[0].supplier === "EcoPlast", "cadena");
  assert(d.balances.input_batches[0].available_kg === 40, "balance del lote de entrada");
});

check("E. Cálculo PCR incluido SIN cambiar la metodología (solo visibilidad)", () => {
  const d = fixtureDossier();
  assert(d.calculation?.recycled_percent === 62.5, "porcentaje");
  const domain = read("lib/domain/audit-dossier.ts");
  assert(!domain.includes("calculate_recycled_content") && !/v_total|numerador|denominador/.test(domain),
    "el dominio del expediente no reimplementa ni altera el cálculo");
});

check("F. Matriz de evidencias con físicas y rechazadas identificadas; SIN signed URLs persistidas", () => {
  const d = fixtureDossier();
  const physical = d.evidences.find((e) => e.medium === "physical");
  assert(physical?.physical_reference === "Carpeta AZ-03", "física localizable");
  const rejected = d.evidences.find((e) => e.status === "rejected");
  assert(rejected?.review_label === "Rechazada" && rejected.current === false, "rechazada identificada y no vigente");
  assert(!/signedUrl|signed_url|token=/.test(JSON.stringify(d)), "el snapshot no contiene signed URLs");
});

check("G/H. Cliente y calidad presentes solo con lo que existe", () => {
  const d = fixtureDossier();
  assert(d.requirements[0].code === "REQ-ACME-01", "acuerdo de cliente");
  assert(d.quality_evidences.length === 1 && d.quality_evidences[0].evidence_type === "quality_control", "calidad filtrada");
});

check("I/J. Ejercicio asociado con duración; brechas con severidad, fuente y recomendación", () => {
  const d = fixtureDossier();
  assert(d.exercise.duration_seconds === 40, "duración calculada de forma confiable");
  assert(d.exercise.source_hash === "hash-del-ejercicio", "huella del ejercicio referenciada");
  const finding = d.findings.find((f) => f.severity !== "info");
  assert(finding && finding.source.length > 0, "fuente presente");
  assert(d.findings.some((f) => f.recommendation), "recomendación práctica presente");
});

check("K. Disclaimer obligatorio, literal del brief y congelado en el snapshot", () => {
  const d = fixtureDossier();
  assert(d.disclaimer === DOSSIER_DISCLAIMER, "en la foto");
  assert(/No constituye una certificación, auditoría externa, declaración de conformidad ni aprobación de un organismo evaluador/.test(DOSSIER_DISCLAIMER), "texto 7.2.K");
});

check("Expediente basado en ejercicio; sin ejercicio queda constancia honesta", () => {
  const sin = buildDossierSnapshot({
    organizationName: "Demo", batchCode: "OUT-9", productLabel: null, producedQuantityKg: 5,
    dossierCode: buildDossierCode(2026, 1), version: 1, generatedAt: "2026-08-14T15:00:00Z",
    generatedByEmail: null, exercise: null,
  });
  assert(sin.exercise.exercise_id === null && sin.genealogy.length === 0, "sin ejercicio → sin cadena inventada");
  assert(sin.summary.orders === 0, "conteos en cero, no fabricados");
});

check("Versionado y hash: mismo insumo → mismo hash; el contenido cambia → hash cambia", () => {
  const a = fixtureDossier();
  const b = fixtureDossier();
  assert(computeDossierHash(a) === computeDossierHash(b), "determinista");
  const c = buildDossierSnapshot({
    organizationName: "Recicladora Demo", batchCode: "OUT-1", productLabel: "PR-1 · Pellet",
    producedQuantityKg: 40, dossierCode: buildDossierCode(2026, 8), version: 3,
    generatedAt: "2026-08-14T15:00:00Z", generatedByEmail: "calidad@demo.co", exercise: null,
  });
  assert(computeDossierHash(a) !== computeDossierHash(c), "otra versión → otro hash");
  assert(buildDossierCode(2026, 1) === "EXP-PCR-2026-0001", "formato del código");
});

check("Lenguaje prudente en snapshot y etiquetas (sin certificado/cumple/aprobado)", () => {
  const text = JSON.stringify(fixtureDossier());
  assert(!/no cumple|(?<!in)cumple\b|aprobad|certificad(?!o[^ ]*organismo)/i.test(text.replace(DOSSIER_DISCLAIMER, "")),
    "sin lenguaje de certificación fuera del disclaimer (que la niega)");
});

console.log("\n· Candados del sprint");

const mig = read("supabase/migrations/0108_pcr033_audit_dossiers.sql");
const migrations = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort();

check("0108 única de PCR-03.3; 0106/0107 previas; sin 0109", () => {
  const later = migrations.filter((f) => f > "0105_z");
  assert(
    later.length === 3 &&
      later[0].startsWith("0106_pcr031") &&
      later[1].startsWith("0107_pcr032") &&
      later[2] === "0108_pcr033_audit_dossiers.sql",
    `bloque exacto 0106/0107/0108 (hay: ${later.join(", ")})`
  );
  assert(!migrations.some((f) => Number(f.slice(0, 4)) >= 109), "sin 0109 ni posterior");
});

check("0108: versionado + inmutabilidad + DELETE vetado + RLS + FK compuestas", () => {
  assert(mig.includes("audit_dossiers_org_batch_version_uniq"), "(org, lote, versión) única");
  assert(mig.includes("audit_dossiers_org_code_uniq"), "código único por organización");
  assert(mig.includes("audit_dossiers_immutability_guard") && mig.includes("to_jsonb(new) - 'status' - 'updated_at'"), "patrón jsonb-minus");
  assert(mig.includes("Un expediente generado solo puede archivarse."), "solo archivar");
  assert(mig.includes("audit_dossiers_protect_delete") && mig.includes("no puede eliminarse"), "sin DELETE destructivo");
  assert(mig.includes("references public.output_batches (organization_id, id)") && mig.includes("references public.traceability_exercises (organization_id, id)"), "FK compuestas al lote y al ejercicio");
  assert(mig.includes("'generated', 'archived'"), "workflow simple 7.4");
  assert(mig.includes("pcr_audit_dossier_v1") && mig.includes("source_hash"), "schema_version + source_hash");
  for (const pol of ["audit_dossiers_select", "audit_dossiers_insert", "audit_dossiers_update"]) {
    assert(mig.includes(pol), `política ${pol}`);
  }
  assert(!mig.includes("audit_dossiers_delete"), "sin política de DELETE: nadie elimina expedientes");
  const code = mig.replace(/--[^\n]*/g, "");
  assert(!/^\s*(begin|commit|rollback)\s*;/im.test(code), "sin transaction control (regla PCR-02.5.2)");
});

check("Impresión browser-side: PrintButton + no-print; sin PDF server-side ni librerías pesadas", () => {
  const detail = read("app/(app)/(shell)/(cpr)/audit-prep/dossiers/[id]/page.tsx");
  assert(detail.includes("PrintButton"), "patrón de impresión existente reutilizado");
  assert(detail.includes("no-print"), "controles ocultos al imprimir");
  const btn = read("components/domain/audit-support/print-button.tsx");
  assert(btn.includes("window.print()"), "window.print()");
  const pkg = read("package.json");
  assert(!/puppeteer|pdfkit|jspdf|react-pdf|playwright/.test(pkg), "sin librerías de PDF server-side");
});

check("UI 7.6: lista con las columnas del brief, generar nueva versión, archivar por rol y aviso de cambios", () => {
  const list = read("app/(app)/(shell)/(cpr)/audit-prep/dossiers/page.tsx");
  for (const t of ["Generar expediente", "ejercicio de trazabilidad", "GenerateDossierButton", "ArchiveDossierButton", "ListPagination"]) {
    assert(list.includes(t), `elemento «${t}»`);
  }
  assert(list.includes('org.roleCode === "admin" || org.roleCode === "quality"'), "archivar según rol existente");
  const detail = read("app/(app)/(shell)/(cpr)/audit-prep/dossiers/[id]/page.tsx");
  assert(detail.includes("Existen cambios posteriores a esta versión"), "heurística de cambios visible, sin reescribir históricos");
  for (const sec of ["B · Resumen", "C · Genealogía", "D · Balance de cantidades", "E · Cálculo de contenido reciclado", "F · Matriz de evidencias", "G · Acuerdos / requisitos de cliente", "H · Calidad", "I · Ejercicio de trazabilidad", "J · Brechas", "snapshot.disclaimer"]) {
    assert(detail.includes(sec), `sección «${sec}»`);
  }
});

check("Acciones: organización del servidor, rol para archivar, sin service_role; permisos + RLS en dos capas", () => {
  const act = read("server/actions/audit-dossier.ts");
  assert(act.includes("requireActiveOrg()"), "organización del servidor");
  assert(!act.includes('formData.get("organization_id")'), "organization_id jamás del cliente");
  assert(!/SUPABASE_SERVICE_ROLE|service_role_key/i.test(act), "sin service_role");
  assert(act.includes("Solo administrador o calidad pueden archivar expedientes."), "acción reservada 7.7");
  // (rev. 03.1–03.3.1, hallazgos 6 y 9) Generar: rol explícito en la acción
  // y RPC atómica en BD — sin bucles de reintento por 23505 (la versión y el
  // código los asigna el servidor bajo candado advisory).
  assert(
    act.includes('org.roleCode !== "admin" && org.roleCode !== "quality"'),
    "la acción comprueba EXPLÍCITAMENTE el rol antes de generar"
  );
  assert(act.includes('rpc("generate_audit_dossier"'), "la generación pasa por la RPC controlada");
  // (rev. 03.1–03.3.2, hallazgo 2) El CONTENIDO también es verdad-servidor.
  assert(!act.includes("p_snapshot"), "la acción NO envía el contenido del expediente");
  assert(
    !act.includes("buildDossierSnapshot") && !act.includes("loadDossierInputs"),
    "la acción no ensambla el expediente: lo construye la BD desde el ejercicio"
  );
  assert(
    act.includes("Ejecuta primero un ejercicio de trazabilidad para generar el expediente."),
    "sin ejercicio completado, la acción lo dice con claridad"
  );
  assert(!act.includes('"23505"'), "sin reintentos por colisión: la atomicidad vive en la BD");
  assert(!act.includes("computeDossierHash"), "el hash del expediente ya no se calcula en la app: es verdad-servidor");
  const mig08 = read("supabase/migrations/0108_pcr033_audit_dossiers.sql");
  assert(mig08.includes("pg_advisory_xact_lock"), "versión/código bajo candado advisory por lote y por año");
  assert(mig08.includes("audit_dossiers_insert_guard"), "INSERT directo vetado por trigger (flag transaccional)");
  assert(mig08.includes("has_org_role(v_org, array['admin', 'quality'])"), "la RPC re-verifica el rol en BD");
  // (rev. 03.1–03.3.2, hallazgos 2, 3 y 5)
  assert(!mig08.includes("p_snapshot"), "la RPC del expediente no expone snapshot alguno del llamador");
  assert(
    mig08.includes("p_exercise_id     uuid default null"),
    "firma preferida: lote + ejercicio opcional (último completado por defecto)"
  );
  assert(
    mig08.includes("Ejecuta primero un ejercicio de trazabilidad para generar el expediente."),
    "sin ejercicio completado NO hay expediente (integridad primero)"
  );
  assert(mig08.includes("v_ex_snap := v_exercise.snapshot"), "el contenido nace del ejercicio autoritativo e inmutable");
  assert(
    mig08.includes("Solo administrador o calidad pueden archivar expedientes."),
    "archivar exige rol TAMBIÉN en BD ante UPDATE directo (hallazgo 3)"
  );
  assert(mig08.includes("constraint audit_dossiers_counts_check"), "CHECK: conteos jamás negativos (hallazgo 5)");
  // (rev. 03.1–03.3.3, hallazgos 5–7) La matriz F del expediente muestra la
  // metadata completa y quality_evidences hereda los destinos nuevos.
  const dossierUi = read("app/(app)/(shell)/(cpr)/audit-prep/dossiers/[id]/page.tsx");
  for (const cell of ["e.evidence_date", "e.reviewed_by_email", "e.physical_location", "e.physical_custodian", "e.responsible"]) {
    assert(dossierUi.includes(cell), `matriz F muestra ${cell}`);
  }
  const exUi = read("app/(app)/(shell)/(cpr)/audit-prep/exercises/[id]/page.tsx");
  assert(exUi.includes("e.reviewed_at") && exUi.includes("e.physical_location"), "matriz del ejercicio ampliada");
  const sqlF = read("tests/db/pcr03_assertions.sql");
  for (const marker of [
    "PRODUCT_EVIDENCE_IN_EXERCISE = PASS",
    "CUSTOMER_REQUIREMENT_EVIDENCE_IN_EXERCISE = PASS",
    "IMPLICIT_MATERIAL_SUPPORT_IN_EXERCISE = PASS",
    "EVIDENCE_METADATA_IN_DOSSIER = PASS",
  ]) {
    assert(sqlF.includes(marker), `S16 ejecuta ${marker}`);
  }
  assert(mig08.includes("prevent_organization_id_change"), "organization_id inmutable (patrón 0024)");
  const sqlS14 = read("tests/db/pcr03_assertions.sql");
  assert(sqlS14.includes("el admin insertó un expediente sin la RPC"), "S14 ataca el INSERT directo incluso como admin");
  const runner = read("tests/db/run-local-pg.sh");
  assert(runner.includes("pcr03_dossier_concurrency.sh"), "concurrencia REAL de versionado cableada en el runner");
});

check("Conductual en PostgreSQL real (S14) cableado, sin operaciones remotas", () => {
  const sql = read("tests/db/pcr03_assertions.sql");
  for (const sec of ["S14.1", "S14.2", "S14.3"]) assert(sql.includes(sec), `sección ${sec}`);
  assert(sql.includes("la FK compuesta aceptó un lote de otra organización") === false || sql.includes("FALLO S14.3"), "cross-tenant probado");
  const runner = read("tests/db/run-local-pg.sh");
  assert(/--single-transaction[^\n]*0108_pcr033/.test(runner), "0108 con --single-transaction");
  assert(!/supabase\s+link|db\s+push|vercel|git\s+push/i.test(runner), "runner sin remoto");
});

check("No-regresión: Textiles, Demo/Full/Extra y nomenclatura interna intactos", () => {
  assert(!mig.toLowerCase().includes("textile"), "0108 no toca Textiles");
  assert(!mig.includes("effective_plan") && !mig.includes("organization_subscriptions"), "0108 no roza planes");
  const domain = read("lib/domain/audit-dossier.ts");
  assert(!/\bcpr\b/i.test(domain.replace(/PCR/g, "")), "sin migración masiva CPR→PCR (identificadores históricos intactos)");
});

console.log("");
if (failures > 0) {
  console.error(`PCR-03.3: ${failures} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("PCR-03.3: todas las verificaciones pasaron.");
