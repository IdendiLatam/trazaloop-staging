/**
 * Trazaloop · T9F.5B · Remediación mínima de los ataques A01-A08, A13 y A14
 * encontrados por el equipo rojo independiente T9F.5A.
 *
 * NATURALEZA DE ESTA SUITE (léase antes de interpretarla):
 *   · Son pruebas PURAS y ESTRUCTURALES: leen el SQL de 0101 y el TypeScript
 *     del repositorio, y evalúan las reglas de dominio que sí son puras.
 *   · NO ejecutan PostgreSQL, NO ejercen RLS y NO tocan Storage. Por tanto
 *     NO demuestran que un ataque esté PROTEGIDO: demuestran que la
 *     corrección está IMPLEMENTADA en el código.
 *   · La demostración real de A01-A08, A13 y A14 exige ejecutar
 *     tests/rls/t9f5-adversarial-attacks.test.ts contra un proyecto Supabase
 *     QA con Auth, RLS y Storage reales (fase T9F.5C).
 *
 * Correr: npx tsx tests/unit/t9f5b-minimal-security-remediation.test.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  maxCprUploadFileBytes,
  validateCprUploadedObject,
  validateCprBinarySignature,
  CPR_EVIDENCE_MAX_FILE_BYTES,
  TRAZADOC_MAX_FILE_BYTES_DEMO,
  TRAZADOC_MAX_FILE_BYTES_FULL,
} from "../../lib/domain/cpr-file-verification";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const stripSql = (s: string) => s.replace(/--[^\n]*/g, "");

const MIG101_RAW = read("supabase/migrations/0101_t9f1_module_access_hardening.sql");
const MIG101 = stripSql(MIG101_RAW);
const ACTION_EVIDENCES = read("server/actions/evidences.ts");
const ACTION_MASTER = read("server/actions/trazadocs-master.ts");
const DB_INTENTS = read("lib/db/storage-intents.ts");
const DB_MASTER = read("lib/db/trazadocs-master.ts");
const DB_OBJECTS = read("lib/db/cpr-storage-objects.ts");
const ADVERSARIAL = read("tests/rls/t9f5-adversarial-attacks.test.ts");
const VERIFY = read("server/actions/cpr-upload-verification.ts");

function sqlFn(name: string): string {
  const head = `create or replace function public.${name}(`;
  const i = MIG101.indexOf(head);
  if (i === -1) throw new Error(`0101: no existe ${name}`);
  const j = MIG101.indexOf("create or replace function public.", i + head.length);
  return MIG101.slice(i, j === -1 ? MIG101.length : j);
}

// ===========================================================================
console.log("\nTrazaloop · T9F.5B §A — A01/A02: INSERT de Storage ligado a intent\n");

check("A01. 0101 ELIMINA la política CPR permisiva y la sustituye por una ligada a intent EXACTO", () => {
  assert(
    /drop policy if exists evidences_insert_legacy on storage\.objects;/.test(MIG101),
    "debe eliminarse evidences_insert_legacy (política por rol + prefijo)"
  );
  assert(
    /create policy evidences_insert_cpr on storage\.objects/.test(MIG101),
    "debe crearse la política CPR ligada a intent"
  );
  const pol = MIG101.slice(
    MIG101.indexOf("create policy evidences_insert_cpr"),
    MIG101.indexOf("drop policy if exists trazadocs_documents_insert")
  );
  assert(pol.includes("storage_object_matches_upload_intent("), "el predicado exige un intent");
  assert(pol.includes("array['evidence']"), "solo el propósito de carga 'evidence'");
  assert(
    !/has_org_role\(\s*public\.safe_uuid/.test(pol),
    "la autorización ya no puede descansar en rol + primer segmento de la ruta"
  );
});

check("A01/A02. El predicado del intent compara ruta, bucket, usuario, organización, módulo, propósito, estado, vigencia y tamaño", () => {
  const fn = sqlFn("storage_object_matches_upload_intent");
  const required: Array<[string, string]> = [
    ["i.object_path = p_object_name", "coincidencia EXACTA de ruta (no prefijo)"],
    ["i.bucket_id = p_bucket_id", "bucket exacto"],
    ["i.created_by = auth.uid()", "el usuario correcto"],
    ["i.organization_id = public.safe_uuid", "la organización sale del intent y debe coincidir con la ruta"],
    ["i.module_code = 'traceability_6632'", "módulo correcto"],
    ["i.resource_type = any (p_resource_types)", "propósito de carga válido"],
    ["i.status = 'pending'", "estado válido (ni finalizado ni cancelado)"],
    ["i.expires_at > now()", "vigencia"],
    ["i.expected_size_bytes > 0", "tamaño declarado válido"],
    ["has_org_role(", "rol vigente AHORA"],
    ["resolve_organization_module_access(", "acceso comercial vigente AHORA"],
  ];
  for (const [needle, why] of required) {
    assert(fn.includes(needle), `falta en el predicado: ${why} (${needle})`);
  }
});

check("A02. 0101 ELIMINA trazadocs_documents_insert (por rol) y exige intent inicial o de reemplazo", () => {
  assert(
    /drop policy if exists trazadocs_documents_insert on storage\.objects;/.test(MIG101),
    "debe eliminarse la política INSERT heredada de 0058"
  );
  assert(
    /create policy trazadocs_documents_insert_intent on storage\.objects/.test(MIG101),
    "debe crearse la política TrazaDocs ligada a intent"
  );
  const pol = MIG101.slice(MIG101.indexOf("create policy trazadocs_documents_insert_intent"));
  assert(
    pol.includes("array['trazadoc_initial', 'trazadoc_replace']"),
    "propósitos válidos: trazadoc_initial y trazadoc_replace"
  );
});

check("A01/A02. El flujo Textiles válido se CONSERVA: 0101 no redefine ni elimina evidences_insert_textiles (0099)", () => {
  assert(!MIG101.includes("create policy evidences_insert_textiles"), "0101 no redefine la política textil");
  assert(
    !/drop policy[^;]*evidences_insert_textiles/.test(MIG101),
    "0101 no elimina la política textil ligada a su propio intent"
  );
  assert(
    /\(storage\.foldername\(name\)\)\[2\] is distinct from 'textiles'/.test(MIG101),
    "la política CPR sigue excluyendo el prefijo textil (disyunción de 0099)"
  );
});

// ===========================================================================
console.log("\nTrazaloop · T9F.5B §B — A03/A04: UPDATE y DELETE directos cerrados\n");

check("A03. No sobrevive ninguna política UPDATE de storage.objects para authenticated", () => {
  assert(
    /drop policy if exists trazadocs_documents_update on storage\.objects;/.test(MIG101),
    "debe eliminarse trazadocs_documents_update (upsert por rol)"
  );
  assert(
    !/create policy[^;]+for update[^;]*on storage\.objects/i.test(MIG101),
    "0101 no debe crear ninguna política UPDATE sobre storage.objects"
  );
});

check("A04. No sobrevive ninguna política DELETE de storage.objects para authenticated", () => {
  assert(
    /drop policy if exists trazadocs_documents_delete on storage\.objects;/.test(MIG101),
    "debe eliminarse trazadocs_documents_delete (borrado físico por rol)"
  );
  assert(
    !/create policy[^;]+for delete[^;]*on storage\.objects/i.test(MIG101),
    "0101 no debe crear ninguna política DELETE sobre storage.objects"
  );
});

check("A03/A04. La LECTURA autorizada no se debilita: ninguna política SELECT se elimina", () => {
  assert(
    !/drop policy[^;]*_select on storage\.objects/.test(MIG101),
    "las políticas SELECT (descarga y URLs firmadas) permanecen intactas"
  );
});

check("A04. El borrado físico legítimo sigue siendo server-only (pending_delete → retiro confirmado)", () => {
  assert(
    MIG101.includes("revoke all on function public.resolve_storage_deletion(text, text, text, text) from public, anon, authenticated;"),
    "resolve_storage_deletion sigue server-only"
  );
  assert(
    MIG101.includes("revoke all on function public.resolve_cpr_upload_intent_object(uuid, boolean) from public, anon, authenticated;"),
    "la resolución de intents CPR sigue server-only"
  );
});

// ===========================================================================
console.log("\nTrazaloop · T9F.5B §C — A05/A06/A07: verificación física y server-only\n");

check("A05. Los finalizers físicos son SERVER-ONLY: revocados a authenticated/anon y concedidos solo a service_role", () => {
  for (const sig of [
    "finalize_evidence_attachment_server(uuid, uuid, bigint, text)",
    "finalize_trazadoc_file_document_initial_version_server(uuid, uuid, bigint, text, text)",
    "replace_trazadoc_file_document_server(uuid, uuid, bigint, text, text)",
    "assert_trazadoc_finalize_preconditions(uuid, uuid, bigint, text, text)",
  ]) {
    assert(
      MIG101.includes(`revoke all on function public.${sig} from public, anon, authenticated;`),
      `${sig}: debe revocarse a authenticated`
    );
    assert(
      MIG101.includes(`grant execute on function public.${sig} to service_role;`),
      `${sig}: solo service_role`
    );
  }
});

check("A05. Las firmas históricas quedan cerradas: ya no finalizan y no conservan grant a authenticated", () => {
  for (const legacy of [
    "finalize_evidence_attachment(uuid, bigint)",
    "finalize_trazadoc_file_document_initial_version_v2(uuid, bigint, text)",
    "replace_trazadoc_file_document_v2(uuid, bigint, text)",
  ]) {
    assert(
      MIG101.includes(`revoke all on function public.${legacy} from public, anon, authenticated;`),
      `${legacy}: revocada a authenticated`
    );
    assert(
      !MIG101.includes(`grant execute on function public.${legacy} to authenticated;`),
      `${legacy}: no debe conservar grant a authenticated`
    );
  }
  assert(
    (MIG101.match(/SERVER_ONLY_FINALIZER/g) ?? []).length >= 3,
    "las tres firmas históricas deben fallar cerrado"
  );
});

check("A05. El finalizer falla cerrado cuando el servidor no pudo verificar el objeto físico", () => {
  for (const fn of ["finalize_evidence_attachment_server", "assert_trazadoc_finalize_preconditions"]) {
    const body = sqlFn(fn);
    assert(body.includes("OBJECT_NOT_VERIFIED"), `${fn}: sin tamaño físico no se finaliza`);
    assert(body.includes("OBJECT_MIME_UNVERIFIED"), `${fn}: sin MIME físico no se finaliza`);
    assert(body.includes("SERVER_ONLY"), `${fn}: rechaza invocaciones que no sean de servidor`);
    assert(body.includes("ACTOR_REQUIRED") && body.includes("ACTOR_NOT_FOUND"), `${fn}: exige un actor real`);
    assert(body.includes("INTENT_NOT_OWNED"), `${fn}: el intent debe pertenecer al actor`);
    assert(body.includes("ROLE_NOT_ALLOWED"), `${fn}: revalida el rol del actor`);
  }
});

check("A05. La Server Action consulta la metadata física ANTES de finalizar (CPR y TrazaDocs)", () => {
  // T9F.5B.1: la verificación vive en un módulo server-only compartido que
  // ambas acciones invocan ANTES de finalizar.
  assert(VERIFY.includes("getCprStorageObjectInfo("), "el módulo compartido lee el objeto real");
  assert(ACTION_EVIDENCES.includes("verifyCprUploadedObject("), "CPR: la acción verifica el objeto");
  assert(ACTION_MASTER.includes("verifyCprUploadedObject("), "TrazaDocs: la acción verifica el objeto");
  const upIdx = ACTION_EVIDENCES.indexOf("verifyCprUploadedObject(");
  const finIdx = ACTION_EVIDENCES.indexOf("finalizeEvidenceAttachmentServer(");
  assert(upIdx !== -1 && finIdx !== -1 && upIdx < finIdx, "CPR: la verificación ocurre ANTES del finalize");
  assert(DB_OBJECTS.includes('import "server-only";'), "el módulo de lectura tiene guard server-only");
  assert(VERIFY.includes('import "server-only";'), "el módulo de verificación tiene guard server-only");
});

check("A06. El tamaño registrado procede del SERVIDOR, no del cliente", () => {
  const ev = sqlFn("finalize_evidence_attachment_server");
  assert(ev.includes("size_bytes = p_real_size_bytes"), "la evidencia guarda el tamaño FÍSICO real");
  assert(
    ev.includes("+ p_real_size_bytes > v_quota"),
    "la cuota se evalúa contra el tamaño real, no contra el declarado"
  );
  const pre = sqlFn("assert_trazadoc_finalize_preconditions");
  assert(pre.includes("+ p_real_size_bytes > v_quota"), "TrazaDocs: cuota contra el tamaño real");
  // La capa TS pasa el valor leído de Storage, nunca file.size.
  assert(
    /realSizeBytes: verification\.sizeBytes/.test(ACTION_EVIDENCES + ACTION_MASTER),
    "las acciones pasan el tamaño verificado en servidor"
  );
  assert(
    !/p_file_size_bytes: file\.size/.test(DB_INTENTS + DB_MASTER),
    "ninguna capa de datos envía ya el tamaño del navegador al finalizer"
  );
});

check("A06. Un objeto físico mayor que la reserva no se finaliza informando el tamaño pequeño", () => {
  // Regla pura: reserva 1 MB, objeto real 5 MB ⇒ rechazo.
  const err = validateCprUploadedObject({
    expectedSizeBytes: 1024 * 1024,
    expectedMimeType: "application/pdf",
    realSizeBytes: 5 * 1024 * 1024,
    realMimeType: "application/pdf",
  });
  assert(err !== null, "un objeto mayor que la reserva debe rechazarse");
  // Y la ausencia de metadata también (A05).
  assert(
    validateCprUploadedObject({
      expectedSizeBytes: 1024,
      expectedMimeType: "application/pdf",
      realSizeBytes: null,
      realMimeType: null,
    }) !== null,
    "sin metadata física se falla cerrado"
  );
  // El caso legítimo (real == reservado) sí pasa.
  assert(
    validateCprUploadedObject({
      expectedSizeBytes: 2048,
      expectedMimeType: "application/pdf",
      realSizeBytes: 2048,
      realMimeType: "application/pdf",
    }) === null,
    "una carga legítima no debe verse afectada"
  );
});

check("A07. El MIME final procede del servidor y se valida contra extensión, MIME declarado, Content-Type y FIRMA", () => {
  const ev = sqlFn("finalize_evidence_attachment_server");
  assert(ev.includes("OBJECT_MIME_MISMATCH"), "CPR: el MIME físico debe coincidir con el reservado");
  assert(
    sqlFn("assert_trazadoc_finalize_preconditions").includes("OBJECT_MIME_MISMATCH"),
    "TrazaDocs: idem"
  );
  assert(VERIFY.includes("validateCprBinarySignature("), "firma binaria en servidor");
  assert(VERIFY.includes("downloadCprStorageObjectBytes("), "los bytes se leen de Storage, no del formulario");
  // Regla pura: PDF declarado con contenido que no es PDF ⇒ rechazo.
  const notPdf = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  assert(
    validateCprBinarySignature({
      bytes: notPdf,
      fileName: "documento.pdf",
      declaredMimeType: "application/pdf",
      storedContentType: "application/pdf",
    }) !== null,
    "contenido incompatible con el MIME declarado debe rechazarse"
  );
  // Y un PDF real coherente pasa.
  const realPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  assert(
    validateCprBinarySignature({
      bytes: realPdf,
      fileName: "documento.pdf",
      declaredMimeType: "application/pdf",
      storedContentType: "application/pdf",
    }) === null,
    "un PDF coherente no debe verse afectado"
  );
});

check("A07. No se amplía la lista de tipos permitidos: se reutiliza el validador de Textiles (T9E) sin alterarlo", () => {
  const domain = read("lib/domain/cpr-file-verification.ts");
  assert(
    domain.includes("validateTextileEvidenceBinarySignature"),
    "el validador de Textiles se reutiliza tal cual"
  );
  const t9e = read("lib/domain/textiles-evidence-signatures.ts");
  assert(
    t9e.includes("export function validateTextileEvidenceBinarySignature"),
    "T9E conserva su helper exportado"
  );
  assert(
    !t9e.includes("T9F.5B"),
    "T9F.5B no modifica el comportamiento del dominio de firmas de Textiles"
  );
});

// ===========================================================================
console.log("\nTrazaloop · T9F.5B §D — A08: revalidación de plan y cuota en finalize\n");

check("A08. Los finalizers TrazaDocs recalculan acceso, plan y CUOTA VIGENTE (no la de begin)", () => {
  const pre = sqlFn("assert_trazadoc_finalize_preconditions");
  assert(pre.includes("resolve_module_access_for_actor("), "resuelve el access_mode ACTUAL con el actor explícito");
  assert(pre.includes("plan_definitions"), "lee la cuota del plan ACTUAL");
  assert(pre.includes("module_storage_snapshot("), "calcula uso confirmado y reservas activas");
  assert(pre.includes("STORAGE_QUOTA_EXCEEDED"), "rechaza cuando el plan nuevo no tiene capacidad");
  assert(pre.includes("pg_advisory_xact_lock("), "bajo el bloqueo de almacenamiento del módulo");
  assert(pre.includes("v_snap.unknown_size_count > 0"), "fail-closed ante tamaños desconocidos");
});

check("A08. La revalidación se aplica a finalize inicial, replace y evidencia CPR", () => {
  for (const fn of [
    "finalize_trazadoc_file_document_initial_version_server",
    "replace_trazadoc_file_document_server",
  ]) {
    assert(
      sqlFn(fn).includes("assert_trazadoc_finalize_preconditions("),
      `${fn}: debe pasar por las precondiciones con revalidación de cuota`
    );
  }
  const ev = sqlFn("finalize_evidence_attachment_server");
  assert(ev.includes("module_storage_snapshot("), "la evidencia CPR también revalida cuota");
  assert(ev.includes("plan_definitions"), "y el plan vigente");
});

check("A08. La idempotencia se conserva: una finalización ya completada no se duplica", () => {
  const ev = sqlFn("finalize_evidence_attachment_server");
  assert(
    ev.includes("if v_intent.status = 'finalized' then") && ev.includes("'already_finalized', true"),
    "CPR: doble finalize devuelve el mismo resultado sin duplicar"
  );
  assert(
    sqlFn("assert_trazadoc_finalize_preconditions").includes("INTENT_ALREADY_FINALIZED"),
    "TrazaDocs: un intent ya finalizado no vuelve a consumirse"
  );
});

// ===========================================================================
console.log("\nTrazaloop · T9F.5B §E — A13: módulo derivado del blueprint\n");

check("A13. El límite deriva el módulo del BLUEPRINT antes de evaluarlo, no de new.module_key", () => {
  const fn = sqlFn("enforce_module_resource_limit");
  assert(
    fn.includes("from trazadoc_blueprints b where b.id = new.blueprint_id"),
    "el módulo real se lee del blueprint"
  );
  assert(fn.includes("BLUEPRINT_NOT_FOUND"), "un blueprint inexistente falla cerrado");
  const derivIdx = fn.indexOf("trazadoc_blueprints");
  const limitIdx = fn.indexOf("RESOURCE_LIMIT_EXCEEDED");
  assert(derivIdx !== -1 && limitIdx !== -1 && derivIdx < limitIdx, "la derivación ocurre ANTES del límite");
  assert(
    !/v_module := case new\.module_key/.test(fn),
    "el límite ya no confía en el module_key enviado por el cliente"
  );
});

check("A13. La corrección no depende del orden de triggers (no se renombra nada)", () => {
  assert(
    MIG101.includes("create trigger t_trazadoc_documents_limit before insert on public.trazadoc_documents"),
    "el trigger de límite conserva su nombre"
  );
  assert(
    !/drop trigger[^;]*t_trazadoc_documents_module_key/.test(MIG101),
    "no se toca el trigger de normalización de 0082: la derivación directa es más robusta"
  );
});

// ===========================================================================
console.log("\nTrazaloop · T9F.5B §F — A14: tope por archivo por tipo y plan\n");

check("A14. La base ya no aplica un 20 MB común: el tope depende de (resource_type, access_mode)", () => {
  const fn = sqlFn("cpr_upload_max_file_bytes");
  assert(fn.includes("p_resource_type = 'evidence' then 20 * 1024 * 1024"), "evidencia CPR conserva su 20 MB propio");
  assert(fn.includes("when 'demo'  then 10 * 1024 * 1024"), "TrazaDocs Demo 10 MB");
  assert(fn.includes("when 'full'  then 25 * 1024 * 1024"), "TrazaDocs Full 25 MB");
  assert(fn.includes("when 'extra' then 25 * 1024 * 1024"), "TrazaDocs Extra 25 MB (mismo tope por archivo que Full)");
  assert(sqlFn("begin_cpr_storage_upload").includes("cpr_upload_max_file_bytes("), "begin aplica el tope por plan");
  assert(
    sqlFn("begin_cpr_storage_upload").includes("FILE_SIZE_LIMIT_UNVERIFIABLE"),
    "un modo no resoluble falla cerrado"
  );
});

check("A14. El CHECK estructural de los intents admite el máximo técnico superior (25 MB)", () => {
  assert(
    /expected_size_bytes > 0 and expected_size_bytes <= 25 \* 1024 \* 1024/.test(MIG101),
    "la restricción estructural iguala el máximo técnico superior permitido"
  );
});

check("A14. 22 MB Full permitido y 22 MB Demo rechazado (regla pura, espejo de la SQL)", () => {
  const size22 = 22 * 1024 * 1024;
  assert(maxCprUploadFileBytes("trazadoc_initial", "full") === TRAZADOC_MAX_FILE_BYTES_FULL, "Full = 25 MB");
  assert(size22 <= maxCprUploadFileBytes("trazadoc_initial", "full")!, "22 MB Full PERMITIDO");
  assert(size22 <= maxCprUploadFileBytes("trazadoc_replace", "extra")!, "22 MB Extra PERMITIDO");
  assert(maxCprUploadFileBytes("trazadoc_initial", "demo") === TRAZADOC_MAX_FILE_BYTES_DEMO, "Demo = 10 MB");
  assert(size22 > maxCprUploadFileBytes("trazadoc_initial", "demo")!, "22 MB Demo RECHAZADO");
  assert(26 * 1024 * 1024 > maxCprUploadFileBytes("trazadoc_initial", "full")!, "26 MB Full RECHAZADO");
  assert(
    maxCprUploadFileBytes("evidence", "full") === CPR_EVIDENCE_MAX_FILE_BYTES,
    "la evidencia CPR respeta su máximo propio (20 MB), no el de TrazaDocs"
  );
  assert(maxCprUploadFileBytes("trazadoc_initial", null) === null, "modo desconocido ⇒ fail-closed");
});

check("A14. La capa TypeScript y la SQL coinciden en los tres topes (sin deriva)", () => {
  const master = read("lib/domain/trazadocs-master.ts");
  assert(master.includes("MAX_FILE_DOCUMENT_SIZE_DEMO_BYTES = 10 * 1024 * 1024"), "TS Demo 10 MB");
  assert(master.includes("MAX_FILE_DOCUMENT_SIZE_FULL_BYTES = 25 * 1024 * 1024"), "TS Full/Extra 25 MB");
  assert(CPR_EVIDENCE_MAX_FILE_BYTES === 20 * 1024 * 1024, "TS evidencia CPR 20 MB");
});

// ===========================================================================
console.log("\nTrazaloop · T9F.5B §G — Regresiones A09-A12, A15-A18 conservadas\n");

check("A09/A10. Los triggers atómicos de límite y sus advisory locks siguen intactos", () => {
  const fn = sqlFn("enforce_module_resource_limit");
  assert(fn.includes("pg_advisory_xact_lock("), "serialización por (org, módulo, recurso)");
  assert(fn.includes("RESOURCE_LIMIT_EXCEEDED"), "el exceso se rechaza");
  assert((MIG101.match(/create trigger t_\w+_limit before insert/g) ?? []).length === 16, "16 triggers de límite");
});

check("A11/A12. Los guards de campos físicos y la ausencia de DELETE de dominio se conservan", () => {
  assert(MIG101.includes("PHYSICAL_FIELD_IMMUTABLE"), "campos físicos inmutables para clientes");
  assert((MIG101.match(/create trigger t_\w+_physical_guard before update/g) ?? []).length === 3, "3 guards físicos");
  for (const d of [
    "drop policy trazadoc_file_documents_delete on public.trazadoc_file_documents;",
    "drop policy evidences_delete on public.evidences;",
    "drop policy textile_evidences_delete on public.textile_evidences;",
  ]) {
    assert(MIG101.includes(d), `se conserva el cierre de DELETE de dominio: ${d}`);
  }
});

check("A15/A16/A17/A18. Aislamiento, desconocidos, intents no resueltos e idempotencia intactos", () => {
  assert(sqlFn("count_module_resource").includes("is_org_member"), "A15: guard de aislamiento");
  assert(MIG101.includes("STORAGE_UNVERIFIABLE"), "A16: tamaños desconocidos bloquean cargas");
  assert(
    sqlFn("module_storage_snapshot").includes("g.status <> 'finalized' and g.storage_resolved_at is null"),
    "A17: los intents no resueltos siguen contando"
  );
  assert(
    MIG101.includes("where idempotency_key is not null and status = 'pending'"),
    "A18: índice único parcial de idempotencia"
  );
});

// ===========================================================================
console.log("\nTrazaloop · T9F.5B §H — Alcance y honestidad de la fase\n");

check("0101 conserva la remediación y 0102 es el único cierre QA posterior autorizado", () => {
  const files = readdirSync(
    join(process.cwd(), "supabase/migrations")
  );

  assert(
    files.some(
      (file) =>
        file ===
        "0101_t9f1_module_access_hardening.sql"
    ),
    "0101 sigue existiendo como migración de endurecimiento"
  );

  const after0101 = files
    .filter((file) => {
      const match = /^(\d{4})_/.exec(file);
      return match !== null && Number(match[1]) > 101;
    })
    .sort();

  const expectedAfter0101 = [
    "0102_t9g_qa_finalizer_closure.sql",
  ];

  assert(
    JSON.stringify(after0101) ===
      JSON.stringify(expectedAfter0101),
    `después de 0101 solo debe existir el cierre QA 0102 ` +
      `(hay: ${after0101.join(", ") || "ninguna"})`
  );
});

check("0101 sigue sin operaciones destructivas ni cambios comerciales", () => {
  const lower = MIG101.toLowerCase();
  assert(!lower.includes("truncate"), "sin TRUNCATE");
  assert(!/drop table|drop function|drop view/.test(lower), "sin DROP destructivo");
  assert(!/disable row level security/.test(lower), "no desactiva RLS");
  assert(
    !/insert into (public\.)?plan_definitions|insert into (public\.)?plan_limits/.test(lower),
    "no crea ni modifica planes ni cuotas comerciales"
  );
  assert(!/update (public\.)?plan_definitions set/.test(lower), "no altera las cuotas del catálogo");
});

check("La suite adversarial QA está preparada para A01-A18 con operaciones reales", () => {
  for (
    const id of [
      "A01",
      "A02",
      "A03",
      "A04",
      "A05",
      "A06",
      "A07",
      "A08",
      "A13",
      "A14",
    ]
  ) {
    const scenarioPattern = new RegExp(
      `scenario\\s*\\(\\s*["']${id}["']`
    );

    assert(
      scenarioPattern.test(ADVERSARIAL),
      `la suite QA debe incluir ${id}`
    );
  }

  assert(
    ADVERSARIAL.includes(".upload("),
    "A01/A02: operaciones REALES de Storage"
  );
  assert(
    ADVERSARIAL.includes(".remove("),
    "A04: borrado real"
  );
  assert(
    ADVERSARIAL.includes("upsert: true"),
    "A03: upsert real"
  );
  assert(
    ADVERSARIAL.includes("22 * 1024 * 1024"),
    "A14: archivo determinista de 22 MB"
  );
  assert(
    /cleanup|limpieza/i.test(ADVERSARIAL),
    "la suite limpia sus fixtures"
  );
  assert(
    !ADVERSARIAL.includes("audit_log\").delete"),
    "jamás se elimina audit_log"
  );
});

check("Esta suite NO afirma que ningún ataque esté PROTEGIDO", () => {
  const self = read("tests/unit/t9f5b-minimal-security-remediation.test.ts");
  assert(self.includes("NO demuestran que un ataque esté PROTEGIDO"), "la limitación debe estar declarada");
});

// ---------------------------------------------------------------------------
console.log(`\nT9F.5B unit/estructural: ${passed} ✔, ${failed} ✘\n`);
if (failed > 0) {
  console.error("Resultado: en rojo. La corrección mínima NO está completa.");
  process.exit(1);
}
console.log(
  "Corrección implementada en código. La clasificación como PROTEGIDO exige\n" +
    "la ejecución adversarial T9F.5C contra un proyecto Supabase QA real.\n"
);
