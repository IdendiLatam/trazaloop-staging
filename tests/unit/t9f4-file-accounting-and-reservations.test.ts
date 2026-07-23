/**
 * Trazaloop · Sprint T9F.4 · CIERRE FINAL: contabilidad física, operaciones
 * directas y reservas atómicas CPR/TrazaDocs.
 *
 * Pruebas PURAS + ESTRUCTURALES que cubren los 46 ítems de §26 (agrupados)
 * y las anti-derivas de §30. Lo que exige base de datos VIVA quedó
 * demostrado en LOCAL con resultados reales:
 *  · scripts/t9f3-local-sql-harness/smoke-t9f4.sql — 40 comprobaciones
 *    (límite documental combinado F1-F5, campos físicos G1-G7, reservas
 *    generales H1-H18, intents no resueltos I1-I4, aislamiento J1-J3,
 *    combinación K1-K3);
 *  · scripts/t9f3-local-sql-harness/concurrency-t9f4.sh — 2 carreras REALES
 *    (vivo vs descargable por el último hueco; doble begin sobre cuota);
 * y contra staging queda PREPARADA (no ejecutada):
 *  · tests/rls/t9f4-file-limits-direct-mutations-reservations.test.ts.
 *
 * Correr: npx tsx tests/unit/t9f4-file-accounting-and-reservations.test.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
function fnBody(file: string, name: string): string {
  const src = read(file);
  const i = src.indexOf(`export async function ${name}`);
  if (i === -1) throw new Error(`${file}: no existe ${name}`);
  const j = src.indexOf("export async function", i + 10);
  return src.slice(i, j === -1 ? src.length : j);
}
function sqlFn(name: string): string {
  const i = MIG101_RAW.indexOf(`create or replace function public.${name}`);
  if (i === -1) throw new Error(`0101: no existe ${name}`);
  const j = MIG101_RAW.indexOf("create or replace function public.", i + 10);
  return stripSql(MIG101_RAW.slice(i, j === -1 ? MIG101_RAW.length : j));
}

const MIG101_RAW = read("supabase/migrations/0101_t9f1_module_access_hardening.sql");
const MIG101 = stripSql(MIG101_RAW);
const SMOKE4 = read("scripts/t9f3-local-sql-harness/smoke-t9f4.sql");
const RACE4 = read("scripts/t9f3-local-sql-harness/concurrency-t9f4.sh");
const INTENTS = read("lib/db/storage-intents.ts");
const CYCLE = read("lib/db/storage-deletion.ts");

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.4 §A — Límite documental COMBINADO (§26.1-6)\n");

check("1-4. Vivos y descargables consumen el MISMO límite: el conteo suma trazadoc_documents (cpr) + trazadoc_file_documents y el tercero se rechaza sin importar la tabla (demostrado en local F1-F4)", () => {
  const countFn = sqlFn("count_module_resource");
  assert(/when 'documents_trazadocs' then \(/.test(countFn), "documents_trazadocs es un conteo combinado");
  assert(countFn.includes("from trazadoc_documents t where t.organization_id = p_organization_id and t.module_key = 'cpr'"), "suma los vivos CPR");
  assert(countFn.includes("from trazadoc_file_documents f where f.organization_id = p_organization_id"), "suma los descargables del maestro");
  assert(/documents_count[\s\S]{0,300}from public\.trazadoc_file_documents group by organization_id/.test(MIG101), "la vista de uso también combina ambos");
  for (const id of ["F1", "F2", "F3", "F4"]) {
    assert(SMOKE4.includes(`${id} `), `batería local ${id} presente`);
  }
});

check("5. Las versiones históricas NO consumen unidades documentales (solo almacenamiento): el conteo jamás lee trazadoc_file_document_versions (demostrado en local F5)", () => {
  const countFn = sqlFn("count_module_resource");
  assert(!countFn.includes("trazadoc_file_document_versions"), "el conteo de documentos no mira versiones");
  assert(SMOKE4.includes("F5 versión histórica NO suma unidades"), "batería local F5 presente");
  // El almacenamiento SÍ las cuenta (cada versión con SU tamaño).
  assert(/from public\.trazadoc_file_document_versions/.test(MIG101), "las versiones cuentan bytes en la vista");
});

check("6. Dos creaciones simultáneas en tablas DIFERENTES no superan el límite: mismo recurso ⇒ mismo advisory lock (carrera REAL 4 en verde)", () => {
  assert(/create trigger t_trazadoc_file_documents_limit before insert on public\.trazadoc_file_documents\s*\n\s*for each row execute function public\.enforce_module_resource_limit\('traceability_6632', 'documents_trazadocs'\)/.test(MIG101),
    "el maestro descargable tiene su trigger con el recurso compartido documents_trazadocs");
  assert(RACE4.includes("Carrera 4") && RACE4.includes("trazadoc_documents") && RACE4.includes("trazadoc_file_documents"),
    "carrera real vivo-vs-descargable por el último hueco");
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.4 §B — DELETE directo bloqueado (§26.7-11)\n");

check("7-8. El DELETE directo de filas físicas está RETIRADO de la RLS: las tres políticas (maestro, evidencias CPR, evidencias textiles) se eliminan en 0101 §3b", () => {
  for (const drop of [
    "drop policy trazadoc_file_documents_delete on public.trazadoc_file_documents;",
    "drop policy evidences_delete on public.evidences;",
    "drop policy textile_evidences_delete on public.textile_evidences;",
  ]) {
    assert(MIG101.includes(drop), `falta: ${drop}`);
  }
});

check("9-11. La RPC segura es la ÚNICA vía: encola pending_delete y borra en UNA transacción; sin confirmación el objeto SIGUE contando y solo 'deleted' libera (T9F.3 §29-31 + local H17)", () => {
  for (const fn of ["queue_and_delete_trazadoc_draft", "queue_and_delete_evidence", "queue_and_delete_textile_evidence"]) {
    const body = sqlFn(fn);
    assert(body.includes("insert into storage_orphan_candidates") || body.includes("v_objects"), `${fn} encola el objeto`);
    assert(/delete from [a-z_]+ where id = v_/.test(body), `${fn} borra la fila de dominio en la misma transacción`);
  }
  assert(/status <> 'deleted'/.test(MIG101), "la vista sigue contando pending_delete/delete_failed");
  assert(SMOKE4.includes("H17 borrado textil seguro"), "batería local H17 presente");
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.4 §C — Campos físicos inmutables (§26.12-16)\n");

check("12-14. UPDATE directo de storage_path / size_bytes / metadatos físicos bloqueado por trigger INVOKER en las TRES tablas (demostrado en local G1-G2, G4, G6)", () => {
  const guard = sqlFn("forbid_physical_field_mutation");
  assert(guard.includes("if current_user <> 'authenticated' then") && guard.includes("return new"),
    "trigger INVOKER: solo aplica al rol de cliente (las vías controladas son DEFINER)");
  assert(guard.includes("PHYSICAL_FIELD_IMMUTABLE"), "error explícito con la columna en detail");
  assert(/foreach v_col in array tg_argv/.test(guard), "columnas por argumentos del trigger");
  assert(/create trigger t_evidences_physical_guard before update on public\.evidences\s*\n\s*for each row execute function public\.forbid_physical_field_mutation\('storage_path', 'size_bytes'\)/.test(MIG101), "guard de evidences");
  assert(/t_trazadoc_file_documents_physical_guard[\s\S]{0,220}'storage_path', 'size_bytes', 'file_name', 'mime_type'/.test(MIG101), "guard del maestro");
  assert(/t_textile_evidences_physical_guard[\s\S]{0,220}'file_path', 'file_size_bytes', 'file_name', 'file_mime_type'/.test(MIG101), "guard textil");
});

check("15-16. Las actualizaciones FUNCIONALES siguen permitidas (título, nombre, descripción…): el guard solo compara las columnas físicas declaradas (demostrado en local G3, G5, G7)", () => {
  assert(SMOKE4.includes("G3 UPDATE funcional (name) sigue permitido"), "name de evidencia editable");
  assert(SMOKE4.includes("G5 textil: título editable"), "título textil editable");
  assert(SMOKE4.includes("G7 maestro: título editable"), "título del maestro editable");
  const guard = sqlFn("forbid_physical_field_mutation");
  assert(guard.includes("is distinct from"), "solo bloquea cuando la columna FÍSICA cambia");
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.4 §D — Reservas CPR/TrazaDocs (§26.17-25)\n");

check("17. Begin crea la referencia DURABLE antes del upload: intent con organización, módulo, recurso, bucket, ruta EXACTA, tamaño declarado, TTL y usuario", () => {
  assert(MIG101.includes("create table public.storage_upload_intents"), "tabla de intents genéricos");
  for (const col of ["organization_id", "module_code", "resource_type", "resource_id", "bucket_id", "object_path", "expected_size_bytes", "expected_mime_type", "expires_at", "idempotency_key", "created_by", "storage_resolved_at"]) {
    assert(new RegExp(`\\b${col}\\b`).test(MIG101), `columna ${col} presente`);
  }
  const begin = sqlFn("begin_cpr_storage_upload");
  assert(begin.includes("insert into storage_upload_intents"), "begin inserta el intent");
  assert(SMOKE4.includes("H2 begin crea intent durable con ruta derivada"), "demostrado en local H2");
});

check("18-19. Begin reserva bytes bajo el lock de cuota del módulo correcto: CPR/TrazaDocs → cuota CPR (traceability_6632); Textiles ya reservaba con 0094 (sin tercera arquitectura ni cuota TrazaDocs paralela)", () => {
  const begin = sqlFn("begin_cpr_storage_upload");
  assert(begin.includes("'module_storage:' || v_org::text || '/traceability_6632'"), "lock de cuota CPR");
  assert(begin.includes("STORAGE_QUOTA_EXCEEDED"), "cuota autoritativa en begin");
  assert(/storage_upload_intents_module_check\s*\n\s*check \(module_code = 'traceability_6632'\)/.test(MIG101),
    "los intents genéricos son del módulo CPR: TrazaDocs Textiles no tiene descargables (sus uploads son evidencias 0094)");
  const beginTex = sqlFn("begin_textile_evidence_upload_v2");
  assert(beginTex.includes("'module_storage:' || p_organization_id::text || '/textiles'"), "Textiles reserva contra SU cuota");
});

check("20-21. Dos begins simultáneos no superan la cuota: reservas activas dentro del snapshot bajo el MISMO lock (carrera REAL 5 en verde; local H3)", () => {
  assert(/from storage_upload_intents g[\s\S]{0,600}g\.status = 'pending' and g\.expires_at > now\(\)/.test(sqlFn("module_storage_snapshot")),
    "el snapshot suma las reservas genéricas activas");
  assert(RACE4.includes("Carrera 5") && RACE4.includes("STORAGE_QUOTA_EXCEEDED"), "carrera real de doble begin");
  assert(SMOKE4.includes("H3 segunda reserva sobre cuota bloqueada"), "las reservas cuentan (H3)");
});

check("22-23. Cancel: el intent pasa a failed y sus bytes SIGUEN contando hasta resolución server-only confirmada; sin objeto, la resolución verifica la inexistencia y libera (local H10-H12)", () => {
  const cancel = sqlFn("cancel_cpr_storage_upload");
  assert(cancel.includes("set status = 'failed', cancelled_at = now()"), "cancel marca failed (candidato contabilizado)");
  assert(!cancel.includes("storage_resolved_at = now()"), "cancel JAMÁS libera por sí mismo");
  const resolve = sqlFn("resolve_cpr_upload_intent_object");
  assert(resolve.includes("'service_role'") && resolve.includes("SERVER_ONLY"), "la resolución es server-only");
  assert(resolve.includes("if p_removed then") && resolve.includes("storage_resolved_at = now()"),
    "solo el retiro (o inexistencia) CONFIRMADO libera");
  for (const id of ["H10", "H11", "H12"]) assert(SMOKE4.includes(`${id} `), `batería local ${id}`);
});

check("24-25. Finalize verifica el tamaño REAL contra la reserva (contrato estricto) y el doble finalize es idempotente sin duplicar (local H4-H8; carrera T9F.3 de finalizes)", () => {
  // T9F.5B · A05/A06: el contrato ya no compara dos valores del CLIENTE. El
  // finalizer server-only exige metadata FÍSICA verificada por el servidor
  // (OBJECT_NOT_VERIFIED si falta) y usa el tamaño REAL contra la cuota.
  const evServer = sqlFn("finalize_evidence_attachment_server");
  assert(evServer.includes("OBJECT_NOT_VERIFIED"), "CPR: fail-closed sin metadata física");
  assert(evServer.includes("for update"), "CPR: intent bajo FOR UPDATE");
  assert(evServer.includes("if v_intent.status = 'finalized' then"), "CPR: idempotente");
  assert(evServer.includes("MODULE_ACCESS_BLOCKED"), "CPR: revalida el acceso comercial");
  assert(evServer.includes("size_bytes = p_real_size_bytes"), "CPR: registra el tamaño FÍSICO real");
  const pre = sqlFn("assert_trazadoc_finalize_preconditions");
  assert(pre.includes("OBJECT_NOT_VERIFIED"), "TrazaDocs: fail-closed sin metadata física");
  assert(pre.includes("for update"), "TrazaDocs: intent bajo FOR UPDATE");
  assert(pre.includes("INTENT_ALREADY_FINALIZED"), "TrazaDocs: no se finaliza dos veces");
  assert(pre.includes("MODULE_ACCESS_BLOCKED"), "TrazaDocs: revalida el acceso comercial");
  assert(pre.includes("module_storage_snapshot"), "TrazaDocs: revalida la CUOTA vigente (A08)");
  // Las firmas históricas quedan CERRADAS a clientes: su cuerpo ya no
  // finaliza nada, solo lanza SERVER_ONLY_FINALIZER. (Se busca la definición
  // EXACTA por su lista de parámetros, para no confundirla con la variante
  // _server, cuyo nombre la contiene como prefijo.)
  for (const [legacy, firstParam] of [
    ["finalize_evidence_attachment", "p_intent_id uuid,\n  p_file_size_bytes bigint\n)"],
    ["finalize_trazadoc_file_document_initial_version_v2", "p_intent_id uuid,"],
    ["replace_trazadoc_file_document_v2", "p_intent_id uuid,"],
  ] as const) {
    const head = `create or replace function public.${legacy}(\n  ${firstParam}`;
    const at = MIG101_RAW.indexOf(head);
    assert(at !== -1, `${legacy}: no se encontró la firma histórica`);
    const body = MIG101_RAW.slice(at, at + 1200);
    assert(body.includes("SERVER_ONLY_FINALIZER"), `${legacy}: firma histórica cerrada`);
  }
  for (const id of ["H4", "H5", "H6", "H7", "H8"]) assert(SMOKE4.includes(`${id} `), `batería local ${id}`);
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.4 §E — Intents Textiles failed/expired (§26.26-31)\n");

check("26-29. Failed con objeto y pending vencido SIGUEN contando; 'expired' (retiro confirmado, 0097) y el caso sin objeto liberan tras la resolución (demostrado en local I1-I4)", () => {
  assert(/from public\.textile_evidence_upload_intents\s*\n\s*where status = 'failed' or \(status = 'pending' and expires_at <= now\(\)\)/.test(MIG101),
    "la vista cuenta failed y pending-vencidos como objetos no resueltos");
  assert(/i\.status = 'failed' or \(i\.status = 'pending' and i\.expires_at <= now\(\)\)/.test(sqlFn("module_storage_snapshot")),
    "el snapshot replica la rama de no resueltos");
  for (const id of ["I1", "I3", "I4"]) assert(SMOKE4.includes(`${id} `), `batería local ${id}`);
});

check("30-31. El resultado del retiro se INSPECCIONA: fallo ⇒ candidato contabilizado (delete_failed/failed); confirmación ⇒ libera. El cliente jamás confirma retiros (RPC 0097 revocada de authenticated)", () => {
  assert(MIG101.includes("revoke execute on function public.record_textile_upload_intent_cleanup(uuid, boolean) from authenticated"),
    "la RPC histórica de limpieza deja de ser invocable por clientes");
  const acts = read("server/actions/textiles-evidences.ts");
  assert(/const removed = await removeTextileEvidenceObject\(intent\.id\);\s*\n\s*await recordTextileUploadIntentCleanupRpc\([a-zA-Z]+, intent\.id, removed\)/.test(acts),
    "el retiro devuelve su resultado REAL y se registra tal cual");
  assert(acts.includes("listFailedTextileUploadIntents"), "el barrido oportunista también resuelve los failed");
  assert(SMOKE4.includes("I2 cliente NO confirma retiros (revocada)"), "revocación demostrada en local");
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.4 §F — count_module_resource (§26.32-34)\n");

check("32-34. auth.uid() como identidad (jamás current_user en DEFINER): no-miembro ⇒ NULL, miembro ⇒ sus conteos, servidor (sin uid) ⇒ permitido; params nulos rechazados (local J1-J3)", () => {
  const countFn = sqlFn("count_module_resource");
  assert(countFn.includes("if auth.uid() is not null"), "guard por auth.uid()");
  assert(!countFn.includes("current_user"), "sin current_user (en DEFINER es el dueño)");
  assert(countFn.includes("is_org_member(p_organization_id) or is_platform_staff()"), "membresía real");
  assert(countFn.includes("if p_resource_code is null or p_module_code is null or p_organization_id is null"), "params nulos ⇒ NULL");
  for (const id of ["J1", "J2", "J3"]) assert(SMOKE4.includes(`${id} `), `batería local ${id}`);
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.4 §G — Tamaños NULL y combinación (§26.35-38)\n");

check("35-37. combine_object_sizes: NULL+NULL⇒NULL, NULL+conocido⇒conocido, contradictorios⇒máximo conservador + error_code 'size_conflict' en el upsert (local K1-K3)", () => {
  const fn = sqlFn("combine_object_sizes");
  assert(fn.includes("when p_existing is null and p_incoming is null then null"), "ambos NULL ⇒ NULL");
  assert(fn.includes("when p_existing is null then p_incoming"), "uno conocido ⇒ el conocido");
  assert(fn.includes("else greatest(p_existing, p_incoming)"), "contradictorios ⇒ máximo (conservador, documentado)");
  assert((MIG101.match(/combine_object_sizes\(storage_orphan_candidates\.size_bytes, excluded\.size_bytes\)/g) ?? []).length >= 3,
    "los upserts de la cola usan la combinación segura");
  assert((MIG101.match(/'size_conflict'/g) ?? []).length >= 3, "la contradicción queda MARCADA");
  for (const id of ["K1", "K2", "K3"]) assert(SMOKE4.includes(`${id} `), `batería local ${id}`);
});

check("38. unknown_size_count > 0 (o conflictos) BLOQUEA nuevas cargas también en las reservas genéricas (fail-closed, T9F.3 §23-26 conservado)", () => {
  const begin = sqlFn("begin_cpr_storage_upload");
  assert(begin.includes("if v_snap.unknown_size_count > 0 or v_snap.conflict_count > 0 then"), "begin exige unknown=0 y sin conflictos");
  assert(begin.includes("STORAGE_UNVERIFIABLE"), "bloqueo explícito");
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.4 §H — Idempotencia vencida (§26.39-42)\n");

check("39-42. Vigente⇒se reutiliza; vencida⇒expired ATÓMICO (libera el índice parcial) sin unique_violation; finalized⇒resultado idempotente; y la misma ruta se REVIVE sin duplicar reservas (local H13; §6 begin_v2 igual)", () => {
  const begin = sqlFn("begin_cpr_storage_upload");
  assert(/set status = 'expired'\s*\n\s*where organization_id = v_org and created_by = v_uid\s*\n\s*and idempotency_key = p_idempotency_key\s*\n\s*and status = 'pending' and expires_at <= now\(\)/.test(begin),
    "begin expira la clave vencida antes del lookup (jamás bloqueo permanente)");
  assert(begin.includes("'reused', true"), "clave vigente ⇒ mismo intent");
  const beginTex = sqlFn("begin_textile_evidence_upload_v2");
  assert(/update textile_evidence_upload_intents\s*\n\s*set status = 'expired'/.test(beginTex),
    "begin_v2 Textiles aplica la MISMA expiración atómica");
  assert(/idempotency_key is not null and status = 'pending'/.test(MIG101), "índice parcial coherente con la semántica");
  assert(SMOKE4.includes("H13 clave vencida no bloquea"), "demostrado en local H13");
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.4 §I — RPC de borrado y acceso comercial (§26.43-46)\n");

check("43-45. Demo vencido / módulo deshabilitado / sin membresía NO eliminan: gate resolve_organization_module_access en las TRES RPC de borrado tras el predicado espejo (local H16, H18)", () => {
  for (const fn of ["queue_and_delete_trazadoc_draft", "queue_and_delete_evidence", "queue_and_delete_textile_evidence"]) {
    const body = sqlFn(fn);
    assert(body.includes("MODULE_ACCESS_BLOCKED"), `${fn}: sin acceso comercial no hay borrado`);
    assert(body.includes("resolve_organization_module_access"), `${fn}: la resolución 0100 decide`);
    assert(body.includes("DELETE_NOT_ALLOWED"), `${fn}: predicado espejo primero (membresía/rol/estado)`);
  }
  assert(SMOKE4.includes("H16 borrado con Demo VENCIDO bloqueado"), "local H16");
  assert(SMOKE4.includes("H18 borrado sin membresía bloqueado"), "local H18");
});

check("46. El mantenimiento server-only sigue disponible: resolve/registro service-role y remove admin fuera del gate comercial (los datos se conservan; el servidor resuelve)", () => {
  assert(MIG101.includes("grant execute on function public.resolve_cpr_upload_intent_object(uuid, boolean) to service_role"),
    "resolución de intents CPR es service-only");
  assert(CYCLE.includes("resolveCprUploadIntentObject") && CYCLE.includes("createAdminClient"),
    "la resolución TS es server-only (admin)");
  assert(/not.?found/i.test(CYCLE.slice(CYCLE.indexOf("resolveCprUploadIntentObject"))),
    "objeto inexistente ⇒ resuelto (inspección del error, no éxito asumido)");
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.4 §J — Estructurales anti-deriva (§30)\n");

check("§30a. Toda carga CPR/TrazaDocs crea su intent ANTES del upload; el path del objeto sale SIEMPRE del intent (T9F.5B.1: el upload ya no ocurre dentro de la Server Action)", () => {
  // T9F.5B.1 · Con CARGA DIRECTA el orden es entre acciones, no dentro de una:
  // begin crea el intent y DEVUELVE la ruta reservada; el navegador sube a esa
  // ruta exacta; finalize solo recibe el intentId. Ninguna Server Action ve un
  // File, así que el invariante se comprueba sobre el contrato de begin.
  for (const [file, fn] of [
    ["server/actions/evidences.ts", "beginEvidenceUploadAction"],
    ["server/actions/trazadocs-master.ts", "beginFileDocumentUploadAction"],
    ["server/actions/trazadocs-master.ts", "beginFileDocumentReplaceAction"],
  ] as const) {
    const body = fnBody(file, fn);
    assert(body.includes("beginCprStorageUpload"), `${fn}: crea el intent durable`);
    assert(body.includes("objectPath: begin.intent.objectPath"), `${fn}: devuelve la ruta EXACTA del intent`);
    assert(!/\.upload\(/.test(body), `${fn}: el archivo NO se sube dentro de la Server Action`);
  }
  const lib = read("lib/db/trazadocs-master.ts");
  assert(!/const path = `\$\{orgId\}\/document_files/.test(lib), "la lib ya no construye rutas por su cuenta");
});

check("§30b. Sin COALESCE(size, 0) ni GREATEST permisivo sobre tamaños de objetos en 0101; el TTL clamp es el único greatest(coalesce) admitido", () => {
  const offenders = (MIG101.match(/greatest\(coalesce\([^)]*size[^)]*\)/gi) ?? []);
  assert(offenders.length === 0, `greatest(coalesce(size…)) prohibido: ${offenders.join(" | ")}`);
  assert(!/coalesce\((e|v|c|t|g|i)\.(size_bytes|file_size_bytes|expected_size_bytes), 0\)/.test(MIG101),
    "ningún tamaño de objeto se convierte en cero");
});

check("§30c. organization_subscriptions NO recupera autoridad y Storage RLS 0099 sigue intacta", () => {
  assert(!MIG101.includes("organization_subscriptions"), "0101 no consulta el plan legacy");
  // T9F.5B · §12: 0101 corrige Storage RLS (A01-A04) en sentido ENDURECEDOR;
  // la política textil de 0099 no se redefine ni se debilita.
  assert(/drop policy if exists trazadocs_documents_(update|delete) on storage\.objects/.test(MIG101),
    "0101 retira UPDATE/DELETE directos de TrazaDocs (A03/A04)");
  assert(!/create policy[^;]+for (update|delete)[^;]*on storage\.objects/i.test(MIG101),
    "0101 no crea políticas UPDATE/DELETE sobre storage.objects");
  assert(!MIG101.includes("create policy evidences_insert_textiles"), "0099 (textil) intacta");
  assert(!INTENTS.includes("organization_subscriptions"), "las reservas tampoco");
});

check("§30d. Los intents genéricos no son accesibles por clientes: RLS habilitada SIN políticas + revoke, y begin/finalize/cancel con revoke public/anon + grant mínimo", () => {
  assert(/alter table public\.storage_upload_intents enable row level security;\s*\n[\s\S]{0,120}revoke all on public\.storage_upload_intents from public, anon, authenticated;/.test(MIG101),
    "tabla cerrada a clientes");
  for (const sig of [
    "begin_cpr_storage_upload(text, uuid, text, bigint, text, integer, text)",
    "cancel_cpr_storage_upload(uuid)",
  ]) {
    assert(MIG101.includes(`revoke all on function public.${sig} from public, anon;`), `revoke de ${sig}`);
    assert(MIG101.includes(`grant execute on function public.${sig} to authenticated;`), `grant mínimo de ${sig}`);
  }
  // T9F.5B · A05 · §17: los finalizers físicos son SERVER-ONLY — revocados a
  // authenticated y anon, concedidos solo a service_role.
  for (const sig of [
    "finalize_evidence_attachment_server(uuid, uuid, bigint, text)",
    "finalize_trazadoc_file_document_initial_version_server(uuid, uuid, bigint, text, text)",
    "replace_trazadoc_file_document_server(uuid, uuid, bigint, text, text)",
  ]) {
    assert(MIG101.includes(`revoke all on function public.${sig} from public, anon, authenticated;`), `revoke server-only de ${sig}`);
    assert(MIG101.includes(`grant execute on function public.${sig} to service_role;`), `grant service_role de ${sig}`);
  }
  for (const legacy of [
    "finalize_evidence_attachment(uuid, bigint)",
    "finalize_trazadoc_file_document_initial_version_v2(uuid, bigint, text)",
    "replace_trazadoc_file_document_v2(uuid, bigint, text)",
  ]) {
    assert(MIG101.includes(`revoke all on function public.${legacy} from public, anon, authenticated;`), `firma histórica revocada: ${legacy}`);
    assert(!MIG101.includes(`grant execute on function public.${legacy} to authenticated;`), `sin grant a authenticated: ${legacy}`);
  }
  assert(MIG101.includes("revoke all on function public.resolve_cpr_upload_intent_object(uuid, boolean) from public, anon, authenticated;"),
    "la resolución NO se concede a authenticated");
});

check("§30e. La limpieza de las suites RLS usa objetos NOMBRADOS (jamás desestructuración posicional de Promise.all) y verifica cero residuos ampliado", () => {
  for (const file of [
    "tests/rls/t9f3-atomic-limits-reservations-storage.test.ts",
    "tests/rls/t9f4-file-limits-direct-mutations-reservations.test.ts",
  ]) {
    const src = read(file);
    const cleanup = src.slice(src.indexOf("async function cleanup"));
    assert(cleanup.length > 100, `${file}: limpieza presente`);
    assert(!/const \[[^\]]+\] = await Promise\.all/.test(cleanup),
      `${file}: sin desestructuración posicional en la limpieza`);
    assert(/const cleanupData = \{/.test(cleanup), `${file}: recolección con objeto nombrado`);
    for (const marker of ["pending_delete", "storage_upload_intents", "textile_evidence_upload_intents"]) {
      assert(cleanup.includes(marker), `${file}: la verificación cubre ${marker}`);
    }
  }
});

check("§30f. El arnés local T9F.4 está encadenado (run.sh aplica shims T9F.4 + smoke T9F.4) y la suite RLS T9F.4 existe y está en package.json", () => {
  const run = read("scripts/t9f3-local-sql-harness/run.sh");
  assert(run.includes("shims-extra-t9f4.sql") && run.includes("smoke-t9f4.sql"), "run.sh encadena T9F.4");
  const pkg = read("package.json");
  assert(pkg.includes("test:t9f4") && pkg.includes("t9f4-file-accounting-and-reservations"), "script test:t9f4 declarado");
  assert(pkg.includes("test:t9f4-rls") && pkg.includes("t9f4-file-limits-direct-mutations-reservations"), "script RLS T9F.4 declarado");
});

// ---------------------------------------------------------------------------
console.log(`\nT9F.4 unit/estructural: ${passed} ✔, ${failed} ✘\n`);
if (failed > 0) process.exit(1);
