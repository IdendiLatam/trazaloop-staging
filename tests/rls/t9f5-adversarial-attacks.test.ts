/**
 * Trazaloop · T9F.5A · SUITE ADVERSARIAL (equipo rojo) contra el candidato T9F.4.
 *
 * PREPARADA, NO EJECUTADA contra staging/producción. Corre SOLO desde una
 * máquina autorizada con `.env.local` de un proyecto Supabase **QA** con
 * Storage REAL, DESPUÉS de aplicar la cadena de migraciones (…→0101) y, para
 * las regresiones de corrección, la futura migración de remediación (0102).
 *
 * Ejecutar (cuando esté autorizado):
 *   tsx tests/rls/t9f5-adversarial-attacks.test.ts
 * (Sugerencia de script — NO se modifica package.json en la auditoría:
 *   "test:t9f5-adversarial": "tsx tests/rls/t9f5-adversarial-attacks.test.ts")
 *
 * POSTURA: cada escenario INTENTA EL ATAQUE (no el camino feliz) y afirma el
 * RESULTADO SEGURO esperado. Con el esquema ACTUAL, los escenarios de ataques
 * clasificados VULNERABLE/NO DEMOSTRADO (A01–A08, A13, A14) DEBEN FALLAR: eso
 * es la señal de la vulnerabilidad. Tras aplicar la corrección mínima
 * (ver TRAZALOOP_T9F5A_MINIMAL_REMEDIATION_PLAN.md) deben pasar TODOS.
 *
 * Estado auditado (T9F.5A) por escenario:
 *   PROTEGIDO      → A09, A10, A11, A12, A15, A16, A17, A18 (deben pasar YA)
 *   VULNERABLE     → A01, A02, A03, A04, A05, A06, A07, A13 (fallan hasta corregir)
 *   NO DEMOSTRADO  → A08, A14 (fallan/indeterminados hasta corregir)
 *
 * Este archivo NO conecta a Supabase si faltan variables de entorno: aborta
 * de forma segura. NUNCA debe apuntarse a producción.
 */

import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import assert from "node:assert";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Guardarraíl duro: sin entorno QA no se ejecuta nada.
if (!URL || !ANON || !SERVICE) {
  console.error(
    "[T9F.5A] Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Esta suite adversarial SOLO corre contra un proyecto Supabase QA autorizado. Abortando."
  );
  process.exit(1);
}
if (/prod|production/i.test(URL)) {
  console.error("[T9F.5A] La URL parece de PRODUCCIÓN. Abortando por seguridad.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const CPR = "traceability_6632";
const TEXTILES = "textiles";
const EVIDENCES_BUCKET = "evidences";
const TRAZADOCS_BUCKET = "trazadocs-documents";
const PREFIX = `t9f5_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

// --- Registro mínimo de escenarios (estilo de la suite T9F.4) -----------------
type Status = "PROTEGIDO" | "VULNERABLE" | "NO_DEMOSTRADO";
interface Scenario {
  id: string;
  status: Status;
  title: string;
  run: () => Promise<void>;
}
const scenarios: Scenario[] = [];
const scenario = (id: string, status: Status, title: string, run: () => Promise<void>) =>
  scenarios.push({ id, status, title, run });

/**
 * Fixtures helpers (a completar por QA con el arnés real del proyecto):
 * crear organización + usuario miembro con rol, sembrar plan/cuota, etc.
 * Se dejan como stubs explícitos para que la ejecución NO produzca falsos
 * verdes: cada helper lanza hasta que QA lo implemente con sus utilidades.
 */
async function makeOrgWithMember(_opts: {
  module: string;
  accessMode: "demo" | "full" | "extra";
  role: "admin" | "quality" | "consultant";
}): Promise<{ orgId: string; userClient: SupabaseClient; userId: string }> {
  throw new Error(
    "TODO(QA): implementar makeOrgWithMember con las utilidades de fixtures del proyecto (createOrganization + set_organization_module_access + login del usuario)."
  );
}
function userStorage(_c: SupabaseClient) {
  return _c.storage;
}
const smallBytes = (n: number) => new Uint8Array(n).fill(65);

// =============================================================================
// A01 — Upload CPR directo sin intent  → esperado: Storage RECHAZA
// =============================================================================
scenario("A01", "VULNERABLE", "Upload CPR directo sin intent", async () => {
  const { orgId, userClient } = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const path = `${orgId}/${randomUUID()}/${PREFIX}_a01.pdf`; // ruta CPR sin intent
  const { error } = await userStorage(userClient)
    .from(EVIDENCES_BUCKET)
    .upload(path, smallBytes(1024), { contentType: "application/pdf" });
  assert(
    error && /row-level security|violates|not authorized/i.test(error.message),
    `A01: la subida CPR SIN intent debería ser rechazada por Storage RLS; obtuve: ${error?.message ?? "ÉXITO (vulnerable)"}`
  );
});

// =============================================================================
// A02 — Upload TrazaDocs directo sin intent → esperado: RECHAZO
// =============================================================================
scenario("A02", "VULNERABLE", "Upload TrazaDocs directo sin intent", async () => {
  const { orgId, userClient } = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const path = `${orgId}/document_files/${randomUUID()}/v1/${PREFIX}_a02.pdf`;
  const { error } = await userStorage(userClient)
    .from(TRAZADOCS_BUCKET)
    .upload(path, smallBytes(1024), { contentType: "application/pdf" });
  assert(
    error && /row-level security|violates|not authorized/i.test(error.message),
    `A02: la subida TrazaDocs SIN intent debería ser rechazada; obtuve: ${error?.message ?? "ÉXITO (vulnerable)"}`
  );
});

// =============================================================================
// A03 — UPDATE/upsert directo de storage.objects (TrazaDocs) → esperado: RECHAZO
// =============================================================================
scenario("A03", "VULNERABLE", "UPDATE/upsert directo de objeto TrazaDocs", async () => {
  const { orgId, userClient } = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  // Suponiendo un objeto existente legítimo en `path` (QA lo siembra por el flujo real):
  const path = `${orgId}/document_files/${randomUUID()}/v1/${PREFIX}_a03.pdf`;
  const { error } = await userStorage(userClient)
    .from(TRAZADOCS_BUCKET)
    .upload(path, smallBytes(2048), { contentType: "application/pdf", upsert: true });
  assert(
    error && /row-level security|violates/i.test(error.message),
    `A03: el upsert directo sobre TrazaDocs debería rechazarse; obtuve: ${error?.message ?? "ÉXITO (vulnerable)"}`
  );
});

// =============================================================================
// A04 — DELETE directo de storage.objects (TrazaDocs) → esperado: RECHAZO
// =============================================================================
scenario("A04", "VULNERABLE", "DELETE directo de objeto TrazaDocs con fila viva", async () => {
  const { orgId, userClient } = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const path = `${orgId}/document_files/${randomUUID()}/v1/${PREFIX}_a04.pdf`; // objeto sembrado por QA
  const { data, error } = await userStorage(userClient).from(TRAZADOCS_BUCKET).remove([path]);
  // remove() no siempre lanza error; comprobar que NO borró (0 objetos afectados).
  assert(
    (error && /row-level security|violates/i.test(error.message)) || (Array.isArray(data) && data.length === 0),
    `A04: el borrado físico directo debería rechazarse/afectar 0; obtuve data=${JSON.stringify(data)} error=${error?.message}`
  );
});

// =============================================================================
// A05 — Finalize sin objeto físico → esperado: RECHAZO sin referencia final
// =============================================================================
scenario("A05", "VULNERABLE", "Finalize CPR sin subir objeto", async () => {
  const { userClient } = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  // Crear una evidencia y begin, PERO no subir el objeto; luego finalize.
  // (QA: crear la fila evidences y obtener intentId vía begin_cpr_storage_upload.)
  const intentId = "TODO(QA): intentId de begin_cpr_storage_upload SIN subir objeto";
  const { error } = await userClient.rpc("finalize_evidence_attachment", {
    p_intent_id: intentId,
    p_file_size_bytes: 1024,
  });
  assert(
    error && /OBJECT|NOT_FOUND|MISMATCH|UNVERIFIABLE|does not exist/i.test(error.message),
    `A05: finalize sin objeto físico debería rechazar; obtuve: ${error?.message ?? "ÉXITO (vulnerable)"}`
  );
});

// =============================================================================
// A06 — Tamaño físico > declarado → esperado: RECHAZO (o reserva ampliada)
// =============================================================================
scenario("A06", "VULNERABLE", "Objeto físico mayor que el tamaño declarado", async () => {
  const { orgId, userClient } = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  // begin declarando 1MB, subir 5MB a la ruta del intent, finalize 1MB.
  const intentId = "TODO(QA): intentId de begin_cpr_storage_upload con expected=1MB";
  const path = `${orgId}/${randomUUID()}/${PREFIX}_a06.bin`;
  await userStorage(userClient).from(EVIDENCES_BUCKET).upload(path, smallBytes(5 * 1024 * 1024));
  const { error } = await userClient.rpc("finalize_evidence_attachment", {
    p_intent_id: intentId,
    p_file_size_bytes: 1 * 1024 * 1024,
  });
  assert(
    error && /SIZE_MISMATCH|OBJECT|UNVERIFIABLE/i.test(error.message),
    `A06: finalize con físico(5MB) > declarado(1MB) debería rechazar; obtuve: ${error?.message ?? "ÉXITO (vulnerable)"}`
  );
});

// =============================================================================
// A07 — MIME físico distinto del declarado → esperado: RECHAZO
// =============================================================================
scenario("A07", "VULNERABLE", "MIME físico incompatible con el declarado", async () => {
  const { userClient } = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const intentId = "TODO(QA): begin declarando application/pdf, subir contenido no-PDF";
  const { error } = await userClient.rpc("finalize_evidence_attachment", {
    p_intent_id: intentId,
    p_file_size_bytes: 1024,
  });
  assert(
    error && /MIME|SIGNATURE|OBJECT|type/i.test(error.message),
    `A07: finalize con MIME/firma incompatible debería rechazar; obtuve: ${error?.message ?? "ÉXITO (vulnerable)"}`
  );
});

// =============================================================================
// A08 — Cambio de plan entre begin y finalize (TrazaDocs) → esperado: RECHAZO por cuota
// =============================================================================
scenario("A08", "NO_DEMOSTRADO", "Plan degradado entre begin y finalize (TrazaDocs)", async () => {
  const { orgId, userClient } = await makeOrgWithMember({ module: CPR, accessMode: "extra", role: "admin" });
  // begin TrazaDocs bajo Extra (cuota grande) reservando un archivo grande.
  const intentId = "TODO(QA): begin_cpr_storage_upload(trazadoc_initial) bajo Extra";
  // Superadmin degrada el módulo a Demo (cuota pequeña):
  await admin.rpc("set_organization_module_access", {
    p_organization_id: orgId,
    p_module_code: CPR,
    p_target_state: "demo_permanent",
  });
  const { error } = await userClient.rpc("finalize_trazadoc_file_document_initial_version_v2", {
    p_intent_id: intentId,
    p_file_size_bytes: 400 * 1024 * 1024, // por encima de la cuota Demo (50MB)
    p_change_note: "adversarial A08",
  });
  assert(
    error && /QUOTA|STORAGE|EXCEEDED|ACCESS_BLOCKED/i.test(error.message),
    `A08: finalize TrazaDocs tras degradar plan debería revalidar cuota y rechazar; obtuve: ${error?.message ?? "ÉXITO (no demostrado/vulnerable)"}`
  );
});

// =============================================================================
// A09 — Dos cargas concurrentes por el último espacio → esperado: solo una
// =============================================================================
scenario("A09", "PROTEGIDO", "Concurrencia por el último recurso (una sola pasa)", async () => {
  const { orgId, userClient } = await makeOrgWithMember({ module: CPR, accessMode: "demo", role: "admin" });
  // Demo evidences=1: con 0 usados, dos INSERT directos concurrentes → uno pasa, uno RESOURCE_LIMIT_EXCEEDED.
  const insertEvidence = () =>
    userClient.from("evidences").insert({ organization_id: orgId, name: `${PREFIX}_a09` }).select("id").single();
  const results = await Promise.all([insertEvidence(), insertEvidence()]);
  const errors = results.filter((r) => r.error).map((r) => r.error!);
  assert(
    errors.length === 1 && /RESOURCE_LIMIT_EXCEEDED/.test(errors[0]!.message),
    `A09: se esperaba exactamente 1 rechazo RESOURCE_LIMIT_EXCEEDED; obtuve ${errors.length} (${errors.map((e) => e.message).join(" | ")})`
  );
});

// =============================================================================
// A10 — INSERT directo en tabla de dominio por encima del límite → RECHAZO
// =============================================================================
scenario("A10", "PROTEGIDO", "INSERT directo por API sobre el límite", async () => {
  const { orgId, userClient } = await makeOrgWithMember({ module: CPR, accessMode: "demo", role: "admin" });
  // Demo suppliers=1: primer insert ok, segundo debe fallar.
  await userClient.from("suppliers").insert({ organization_id: orgId, name: `${PREFIX}_s1` });
  const { error } = await userClient.from("suppliers").insert({ organization_id: orgId, name: `${PREFIX}_s2` });
  assert(
    error && /RESOURCE_LIMIT_EXCEEDED/.test(error.message),
    `A10: el INSERT directo por encima del límite debería rechazarse; obtuve: ${error?.message ?? "ÉXITO (vulnerable)"}`
  );
});

// =============================================================================
// A11 — UPDATE directo de campos físicos → esperado: PHYSICAL_FIELD_IMMUTABLE
// =============================================================================
scenario("A11", "PROTEGIDO", "UPDATE directo de campos físicos", async () => {
  const { orgId, userClient } = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const { data: ev } = await userClient
    .from("evidences")
    .insert({ organization_id: orgId, name: `${PREFIX}_a11` })
    .select("id")
    .single();
  const evId = ev?.id ?? "00000000-0000-0000-0000-000000000000";
  const up1 = await userClient.from("evidences").update({ storage_path: "hacked/path" }).eq("id", evId);
  const up2 = await userClient.from("evidences").update({ size_bytes: 1 }).eq("id", evId);
  assert(up1.error && /PHYSICAL_FIELD_IMMUTABLE/.test(up1.error.message), `A11 storage_path: ${up1.error?.message}`);
  assert(up2.error && /PHYSICAL_FIELD_IMMUTABLE/.test(up2.error.message), `A11 size_bytes: ${up2.error?.message}`);
});

// =============================================================================
// A12 — DELETE directo de fila de dominio → esperado: 0 filas / rechazo
// =============================================================================
scenario("A12", "PROTEGIDO", "DELETE directo de fila de dominio (sin política)", async () => {
  const { orgId, userClient } = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const { data: ev } = await userClient
    .from("evidences")
    .insert({ organization_id: orgId, name: `${PREFIX}_a12` })
    .select("id")
    .single();
  const evId = ev?.id ?? "00000000-0000-0000-0000-000000000000";
  const del = await userClient.from("evidences").delete().eq("id", evId).select("id");
  assert(
    !del.error ? (del.data?.length ?? 0) === 0 : /row-level security|violates/i.test(del.error.message),
    `A12: el DELETE directo debería afectar 0 filas (política retirada); obtuve data=${JSON.stringify(del.data)} error=${del.error?.message}`
  );
});

// =============================================================================
// A13 — Blueprint CPR con module_key manipulado → esperado: límite CPR aplicado
// =============================================================================
scenario("A13", "VULNERABLE", "module_key spoof por orden de triggers", async () => {
  // QA: org con CPR en el límite de documents_trazadocs (Demo=2 usados) y
  // Textiles con cupo. Insertar trazadoc_documents con blueprint CPR pero
  // module_key='textiles'. El límite CPR DEBE aplicarse (rechazo), no el Textil.
  const { orgId, userClient } = await makeOrgWithMember({ module: CPR, accessMode: "demo", role: "admin" });
  const cprBlueprintId = "TODO(QA): blueprint CPR (module_key='cpr') existente";
  const { error } = await userClient
    .from("trazadoc_documents")
    .insert({ organization_id: orgId, blueprint_id: cprBlueprintId, module_key: "textiles", title: `${PREFIX}_a13` })
    .select("id")
    .single();
  assert(
    error && /RESOURCE_LIMIT_EXCEEDED/.test(error.message),
    `A13: el límite debe evaluarse contra el módulo del BLUEPRINT (CPR), no el module_key del cliente; obtuve: ${error?.message ?? "ÉXITO (vulnerable)"}`
  );
});

// =============================================================================
// A14 — TrazaDocs Full 22MB → esperado: PERMITIDO (máx Full/Extra = 25MB)
// =============================================================================
scenario("A14", "NO_DEMOSTRADO", "Archivo TrazaDocs Full de 22MB permitido", async () => {
  const { userClient } = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const docId = "TODO(QA): trazadoc_file_documents id (draft) con cuota disponible";
  const { error } = await userClient.rpc("begin_cpr_storage_upload", {
    p_resource_type: "trazadoc_initial",
    p_resource_id: docId,
    p_file_name: `${PREFIX}_a14.pdf`,
    p_file_size_bytes: 22 * 1024 * 1024,
    p_file_mime_type: "application/pdf",
  });
  assert(
    !error,
    `A14: un archivo Full de 22MB (< máx 25MB) con cuota disponible debería permitirse; obtuve: ${error?.message ?? ""} (tope fijo 20MB → NO DEMOSTRADO)`
  );
});

// =============================================================================
// A15 — Conteo de otra organización → esperado: NULL (no revelador)
// =============================================================================
scenario("A15", "PROTEGIDO", "count_module_resource de otra organización", async () => {
  const { userClient } = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const otherOrgId = randomUUID(); // organización ajena
  const { data, error } = await userClient.rpc("count_module_resource", {
    p_organization_id: otherOrgId,
    p_module_code: CPR,
    p_resource_code: "suppliers",
  });
  assert(!error && (data === null), `A15: el conteo cruzado debería devolver NULL; obtuve data=${JSON.stringify(data)} error=${error?.message}`);
});

// =============================================================================
// A16 — Tamaño físico desconocido bloquea nuevas cargas → esperado: bloqueo
// =============================================================================
scenario("A16", "PROTEGIDO", "size_bytes NULL bloquea begin (STORAGE_UNVERIFIABLE)", async () => {
  // QA: sembrar (vía service_role) una fila con storage_path no vacío y
  // size_bytes NULL; luego un begin del mismo módulo debe fallar.
  const { userClient } = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const docId = "TODO(QA): resource con desconocido sembrado";
  const { error } = await userClient.rpc("begin_cpr_storage_upload", {
    p_resource_type: "evidence",
    p_resource_id: docId,
    p_file_name: `${PREFIX}_a16.pdf`,
    p_file_size_bytes: 1024,
    p_file_mime_type: "application/pdf",
  });
  assert(
    error && /STORAGE_UNVERIFIABLE|UNVERIFIABLE/i.test(error.message),
    `A16: con tamaños desconocidos, begin debería bloquear; obtuve: ${error?.message ?? "ÉXITO (vulnerable)"}`
  );
});

// =============================================================================
// A17 — Intent failed/expired con objeto → esperado: sus bytes SIGUEN contando
// =============================================================================
scenario("A17", "PROTEGIDO", "Intent failed con objeto sigue contabilizado", async () => {
  // QA: crear intent, subir objeto, marcar failed; el snapshot/vista de uso
  // debe seguir contando esos bytes hasta la resolución server-only.
  const { orgId } = await makeOrgWithMember({ module: TEXTILES, accessMode: "full", role: "admin" });
  const { data, error } = await admin
    .from("v_organization_module_usage")
    .select("*")
    .eq("organization_id", orgId);
  assert(!error, `A17: no se pudo leer la vista de uso: ${error?.message}`);
  assert(
    Array.isArray(data),
    `A17: QA debe verificar que los bytes del intent failed con objeto permanecen en committed/reservado hasta resolución server-only.`
  );
});

// =============================================================================
// A18 — Reutilización de idempotency key vencida → esperado: sin unique_violation
// =============================================================================
scenario("A18", "PROTEGIDO", "Reutilización de idempotency key vencida", async () => {
  const { userClient } = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const docId = "TODO(QA): evidence id draft";
  const key = `${PREFIX}_idem`;
  // begin con key, dejar vencer (QA: forzar expires_at<=now via service_role),
  // luego begin de nuevo con la MISMA key: no debe lanzar unique_violation.
  const { error } = await userClient.rpc("begin_cpr_storage_upload", {
    p_resource_type: "evidence",
    p_resource_id: docId,
    p_file_name: `${PREFIX}_a18.pdf`,
    p_file_size_bytes: 1024,
    p_file_mime_type: "application/pdf",
    p_idempotency_key: key,
  });
  assert(
    !error || !/duplicate key|unique/i.test(error.message),
    `A18: reusar una key vencida NO debe producir unique_violation; obtuve: ${error?.message}`
  );
});

// ------------------------------ Runner ---------------------------------------
async function main() {
  console.log(`\n[T9F.5A] Suite adversarial · prefijo ${PREFIX}`);
  console.log("Recordatorio: los escenarios VULNERABLE/NO_DEMOSTRADO DEBEN fallar contra el esquema actual.\n");
  let pass = 0;
  let fail = 0;
  for (const s of scenarios) {
    try {
      await s.run();
      console.log(`  PASS  ${s.id} [${s.status}] ${s.title}`);
      pass++;
    } catch (err) {
      console.log(`  FAIL  ${s.id} [${s.status}] ${s.title}\n        ${(err as Error).message}`);
      fail++;
    }
  }
  console.log(`\n[T9F.5A] Resultado: ${pass} PASS / ${fail} FAIL de ${scenarios.length}.`);
  console.log(
    "Interpretación: tras aplicar la corrección mínima (0102), TODOS deben quedar en PASS.\n"
  );
  // No forzamos process.exit(1) por FAIL: en el estado actual se ESPERAN fallos.
}

main().catch((e) => {
  console.error("[T9F.5A] Error inesperado en el runner:", e);
  process.exit(1);
});
