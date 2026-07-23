/**
 * Trazaloop · Sprint T9F.3 · CIERRE DEFINITIVO: límites atómicos en base de
 * datos, reservas de evidencias Textiles y ciclo seguro de archivos.
 *
 * Pruebas PURAS + ESTRUCTURALES numeradas según §31 del plan T9F.3 (los 48
 * ítems, agrupados). Lo que exige base de datos VIVA quedó demostrado en
 * LOCAL con resultados reales:
 *  · scripts/t9f3-local-sql-harness/smoke.sql — 32 comprobaciones (triggers,
 *    importación multi-fila con rollback total, reservas, idempotencia,
 *    vencimiento, desconocidos, ciclo pending_delete, server-only);
 *  · scripts/t9f3-local-sql-harness/concurrency.sh — 3 carreras REALES con
 *    sesiones psql simultáneas (último recurso, begins, finalizes);
 * y contra staging queda PREPARADA (no ejecutada):
 *  · tests/rls/t9f3-atomic-limits-reservations-storage.test.ts.
 *
 * Correr: npx tsx tests/unit/t9f3-atomic-limits-reservations-storage.test.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { interpretModuleUsageRow } from "../../lib/db/module-usage-shared";

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

const MIG101 = stripSql(read("supabase/migrations/0101_t9f1_module_access_hardening.sql"));
const CYCLE = read("lib/db/storage-deletion.ts");

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.3 §A — Atomicidad de recursos en BASE DE DATOS (1–6)\n");

/** Inventario EXPLÍCITO tabla → (módulo, recurso) de los triggers de 0101.
 *  Añadir una tabla limitada sin declararla aquí rompe la suite. */
const TRIGGER_MATRIX: Array<[table: string, module: string, resource: string]> = [
  ["suppliers", "traceability_6632", "suppliers"],
  ["materials", "traceability_6632", "materials"],
  ["products", "traceability_6632", "products"],
  ["evidences", "traceability_6632", "evidences"],
  ["production_orders", "traceability_6632", "production_orders"],
  ["input_batches", "traceability_6632", "input_batches"],
  ["output_batches", "traceability_6632", "output_batches"],
  ["trazadoc_documents", "BY_MODULE_KEY", "documents_trazadocs"],
  // T9F.4: los DESCARGABLES del maestro comparten el MISMO recurso (y por
  // tanto el MISMO advisory lock org/módulo/documents_trazadocs) que los
  // vivos — un INSERT simultáneo en cada tabla tampoco supera el límite.
  ["trazadoc_file_documents", "traceability_6632", "documents_trazadocs"],
  ["textile_suppliers", "textiles", "suppliers"],
  ["textile_materials", "textiles", "materials"],
  ["textile_products", "textiles", "products"],
  ["textile_evidences", "textiles", "evidences"],
  ["textile_production_orders", "textiles", "production_orders"],
  ["textile_input_lots", "textiles", "input_batches"],
  ["textile_output_lots", "textiles", "output_batches"],
];

check("5-6. AUTORIDAD FINAL: cada tabla limitada tiene su trigger BEFORE INSERT en 0101 (16/16 con el maestro descargable, argumentos exactos) — el INSERT directo recibe el MISMO límite", () => {
  for (const [table, module, resource] of TRIGGER_MATRIX) {
    const re = new RegExp(
      `create trigger t_${table}_limit before insert on public\\.${table}\\s*\\n\\s*for each row execute function public\\.enforce_module_resource_limit\\('${module}', '${resource}'\\)`
    );
    assert(re.test(MIG101), `falta o difiere el trigger de ${table} (${module}/${resource})`);
  }
  const count = (MIG101.match(/create trigger t_[a-z_]+_limit before insert/g) ?? []).length;
  assert(count === TRIGGER_MATRIX.length, `hay ${count} triggers de límite; el inventario declara ${TRIGGER_MATRIX.length}`);
});

check("1-2. El trigger serializa por (org, módulo, recurso) con advisory lock TRANSACCIONAL y cuenta BAJO el lock (demostrado con carreras reales en el arnés)", () => {
  const fn = MIG101.slice(
    MIG101.indexOf("create or replace function public.enforce_module_resource_limit"),
    MIG101.indexOf("create trigger t_suppliers_limit")
  );
  assert(/pg_advisory_xact_lock\(/.test(fn), "advisory lock transaccional en el trigger");
  assert(
    fn.includes("'module_resource:' || new.organization_id::text || '/' || v_module || '/' || v_resource"),
    "el lock es POR PAR-RECURSO: cero contención entre organizaciones o recursos distintos"
  );
  assert(fn.indexOf("pg_advisory_xact_lock") < fn.indexOf("count_module_resource("), "el conteo ocurre DESPUÉS de tomar el lock");
  assert(/RESOURCE_LIMIT_EXCEEDED/.test(fn) && /v_count \+ 1 > v_limit\.limit_value/.test(fn), "rechazo exacto al exceder");
  // Evidencia REAL: el arnés ejecuta la carrera del último recurso permitido.
  const race = read("scripts/t9f3-local-sql-harness/concurrency.sh");
  assert(race.includes("RESOURCE_LIMIT_EXCEEDED") && race.includes("CARRERA 1"), "carrera real del último recurso en el arnés");
});

check("1b. El trigger es SECURITY INVOKER: current_user es el rol REAL que inserta (en una función definer el gate de roles quedaría siempre en bypass)", () => {
  const fn = MIG101.slice(
    MIG101.indexOf("create or replace function public.enforce_module_resource_limit"),
    MIG101.indexOf("create trigger t_suppliers_limit")
  );
  assert(/security invoker/.test(fn), "trigger invoker");
  assert(fn.includes("if current_user <> 'authenticated' then"), "roles de servidor confiables fuera de su ámbito, documentado");
});

check("3. Creación manual e importación concurrentes: la importación es UN statement multi-fila (una transacción) bajo el MISMO lock del trigger — el exceso revierte TODO", () => {
  const lib = read("lib/db/imports.ts");
  assert(/insert\(payloads\)\.select\("id"\)/.test(lib), "inserción masiva en UN solo statement");
  assert(/limitExceeded/.test(lib) && /RESOURCE_LIMIT_EXCEEDED/.test(lib), "el error del trigger se detecta y tipifica");
  const commit = fnBody("server/actions/imports.ts", "commitImportAction");
  assert(/insertBusinessRows\(/.test(commit), "el commit usa la vía masiva atómica");
  assert(/la importación completa fue rechazada sin insertar ninguna fila/.test(commit), "mensaje contractual de rechazo ÍNTEGRO");
  // Evidencia REAL en el arnés: multi-fila con rollback total (A3).
  assert(read("scripts/t9f3-local-sql-harness/smoke.sql").includes("A3 importación atómica"), "rollback total demostrado en local");
});

check("4. Reactivación/edición NO consumen unidad (semántica count(*) de TODAS las filas, única en helper, BD y vista — documentada)", () => {
  const countFn = MIG101.slice(
    MIG101.indexOf("create or replace function public.count_module_resource"),
    MIG101.indexOf("create or replace function public.enforce_module_resource_limit")
  );
  assert(!/is_active|status =/.test(countFn.replace(/status = 'pending'/g, "")), "el conteo no filtra por activos/estado (todas las filas)");
  assert((MIG101.match(/before insert/g) ?? []).length >= 15 && !/before update or insert|before insert or update/.test(MIG101),
    "los triggers son SOLO de INSERT: UPDATE (reactivar/editar) jamás consume");
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.3 §B — Bypass directo (7–10)\n");

check("7-8. Un miembro con INSERT directo por la API recibe el límite (invoker + authenticated); la RLS sigue siendo la dueña del AISLAMIENTO (not_member → la política niega)", () => {
  const fn = MIG101.slice(MIG101.indexOf("enforce_module_resource_limit"), MIG101.indexOf("create trigger t_suppliers_limit"));
  assert(fn.includes("if v_reason = 'not_member' then") && /return new;[\s\S]{0,220}MODULE_ACCESS_BLOCKED/.test(fn),
    "no-miembro pasa al veredicto de la RLS; acceso bloqueado (vencido/deshabilitado/sin asignar) se rechaza en BD");
  assert(read("scripts/t9f3-local-sql-harness/smoke.sql").includes("A8 no-miembro pasa el trigger"), "semántica demostrada en local");
});

check("9. Una organización no afecta conteos de otra: todo conteo filtra por organization_id y el lock incluye la organización", () => {
  const countFn = MIG101.slice(
    MIG101.indexOf("create or replace function public.count_module_resource"),
    MIG101.indexOf("create or replace function public.enforce_module_resource_limit")
  );
  const selects = countFn.match(/select count\(\*\) from [a-z_]+ [a-z]+ where [a-z]+\.organization_id = p_organization_id/g) ?? [];
  assert(selects.length >= 15, `cada conteo filtra por organización (${selects.length}/15+)`);
  // T9F.4 · Bloqueador 6: dentro de una función SECURITY DEFINER
  // current_user es el DUEÑO (jamás la identidad del invocador) — el guard
  // usa auth.uid(): con sesión, solo organizaciones propias; sin sesión
  // (contexto de servidor) se permite. Demostrado en el smoke (J1-J3).
  assert(countFn.includes("if auth.uid() is not null") && countFn.includes("return null"),
    "guard: un cliente jamás sondea conteos de organizaciones ajenas (auth.uid, no current_user)");
  assert(!countFn.includes("current_user"),
    "count_module_resource no debe usar current_user como identidad (en DEFINER es el dueño)");
});

check("10. module_code arbitrario: sin límite inventado y sin decisión — la allowance lo declara module_not_functional y el trigger ignora claves module_key desconocidas", () => {
  assert(MIG101.includes("'module_not_functional'"), "allowance rechaza módulos no funcionales");
  assert(/when 'cpr' then 'traceability_6632'[\s\S]{0,120}else null/.test(MIG101), "BY_MODULE_KEY solo mapea claves conocidas");
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.3 §C — Reservas de evidencias Textiles (11–22, 45)\n");

const BEGIN_V2 = MIG101.slice(
  MIG101.indexOf("create or replace function public.begin_textile_evidence_upload_v2"),
  MIG101.indexOf("-- La firma HISTÓRICA de 0097")
);
const FINALIZE = MIG101.slice(
  MIG101.indexOf("create or replace function public.finalize_textile_evidence_upload_server")
);

check("11-12. begin RESERVA unidad y bytes ANTES de autorizar la subida, bajo los MISMOS locks del trigger (recurso + cuota)", () => {
  assert(BEGIN_V2.includes("'module_resource:' || p_organization_id::text || '/textiles/evidences'"), "lock del recurso idéntico al del trigger");
  assert(BEGIN_V2.includes("'module_storage:' || p_organization_id::text || '/textiles'"), "lock de cuota del módulo");
  assert(BEGIN_V2.indexOf("pg_advisory_xact_lock") < BEGIN_V2.indexOf("insert into public.textile_evidence_upload_intents"), "la reserva nace bajo el lock");
  assert(/EVIDENCE_LIMIT_EXCEEDED/.test(BEGIN_V2) && /STORAGE_QUOTA_EXCEEDED/.test(BEGIN_V2), "rechazos de unidad y de bytes");
  assert(BEGIN_V2.includes("v_snap.committed_bytes + v_snap.reserved_bytes + p_file_size_bytes > v_quota"),
    "aritmética exacta: confirmado + reservado + entrante <= cuota");
});

check("13-14. Dos begins no comprometen de más (carrera REAL en el arnés) y el segundo begin sobre la cuota se rechaza contando las reservas activas", () => {
  const smoke = read("scripts/t9f3-local-sql-harness/smoke.sql");
  assert(smoke.includes("B2 segundo begin excede unidad") && smoke.includes("B5b reservas activas comprometen cuota"), "demostrado en local");
  const race = read("scripts/t9f3-local-sql-harness/concurrency.sh");
  assert(race.includes("EVIDENCE_LIMIT_EXCEEDED") && race.includes("CARRERA 2"), "carrera real de begins simultáneos");
});

check("15-16. Cancelar libera y el intent VENCIDO deja de reservar SIN cron: TODA la contabilidad exige status='pending' AND expires_at > now()", () => {
  const activePattern = /status = 'pending' and (i\.)?expires_at > now\(\)|i\.status = 'pending'\s*\n?\s*and i\.expires_at > now\(\)/;
  assert(activePattern.test(MIG101.replace(/\s+/g, " ")) || MIG101.includes("status = 'pending' and expires_at > now()") || MIG101.includes("i.status = 'pending' and i.expires_at > now()"),
    "definición única de reserva ACTIVA");
  const reservedSpots = (MIG101.match(/status = 'pending' and (i\.)?expires_at > now\(\)/g) ?? []).length
    + (MIG101.match(/i\.status = 'pending' and i\.expires_at > now\(\)/g) ?? []).length
    + (MIG101.match(/status = 'pending' and expires_at > now\(\)/g) ?? []).length;
  assert(reservedSpots >= 4, `la condición de reserva activa gobierna conteo, vista, snapshot e idempotencia (${reservedSpots} usos)`);
  const smoke = read("scripts/t9f3-local-sql-harness/smoke.sql");
  assert(smoke.includes("B6 intent vencido deja de reservar") && smoke.includes("B7 cancelación libera reserva"), "vencimiento y cancelación demostrados en local");
});

check("17-22. finalize AUTORITATIVO: mismos locks ANTES del FOR UPDATE, revalida acceso/límite/cuota con las OTRAS reservas, contrato estricto de tamaño, idempotente, UNA evidencia", () => {
  assert(FINALIZE.indexOf("pg_advisory_xact_lock") < FINALIZE.indexOf("for update"), "locks antes del FOR UPDATE del intent");
  assert(FINALIZE.includes("MODULE_ACCESS_BLOCKED"), "revalida acceso (demo vencido/deshabilitado no finaliza)");
  assert(FINALIZE.includes("v_confirmed + v_other_reserved_units + 1 > v_limit.limit_value"), "revalida el límite contando las OTRAS reservas activas");
  assert(FINALIZE.includes("v_snap.committed_bytes + v_other_reserved_bytes + p_file_size_bytes > v_quota"), "revalida la cuota con el tamaño REAL y las OTRAS reservas");
  assert(FINALIZE.includes("p_file_size_bytes <> v_intent.expected_size_bytes") && FINALIZE.includes("OBJECT_SIZE_MISMATCH"),
    "contrato ESTRICTO: el tamaño real debe coincidir con el reservado (jamás se amplía en silencio)");
  assert(FINALIZE.includes("'already_finalized', true"), "doble finalize idempotente (mismo evidence_id)");
  const smoke = read("scripts/t9f3-local-sql-harness/smoke.sql");
  assert(smoke.includes("C1 finalize crea UNA evidencia") && smoke.includes("C2 finalize revalida límite") && smoke.includes("C5 finalize revalida acceso"), "demostrado en local");
  assert(read("scripts/t9f3-local-sql-harness/concurrency.sh").includes("CARRERA 3"), "finalizes simultáneos: carrera real");
});

check("45. Idempotencia de begin: columna idempotency_key + índice único parcial + reutilización BAJO el lock (misma clave ⇒ mismo intent y una sola reserva)", () => {
  assert(MIG101.includes("add column idempotency_key text"), "columna nueva en intents (0101, aditiva)");
  assert(/create unique index textile_upload_intents_idem_uniq[\s\S]{0,220}where idempotency_key is not null and status = 'pending'/.test(MIG101), "unicidad solo sobre pendientes con clave");
  assert(BEGIN_V2.indexOf("pg_advisory_xact_lock") < BEGIN_V2.indexOf("idempotency_key = p_idempotency_key"), "la reutilización ocurre bajo el lock");
  assert(read("scripts/t9f3-local-sql-harness/smoke.sql").includes("B3 idempotencia de begin"), "demostrado en local");
  const rpcWrapper = read("lib/db/textiles-evidences.ts");
  assert(rpcWrapper.includes('rpc("begin_textile_evidence_upload_v2"'), "la acción usa la RPC v2");
  assert(MIG101.includes("return public.begin_textile_evidence_upload_v2("), "la firma histórica 0097 delega (sin DROP)");
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.3 §D — Storage: desconocidos, versiones, ciclo (23–31)\n");

const usageRowBase = {
  organization_id: "o", module_code: "textiles",
  documents_trazadocs_count: 0, suppliers_count: 0, materials_count: 0,
  products_count: 0, evidences_count: 0, production_orders_count: 0,
  input_batches_count: 0, output_batches_count: 0,
  storage_used_bytes: 0, storage_reserved_bytes: 0,
  storage_unknown_size_count: 0, storage_object_conflicts: 0,
};

check("23. Uso CERO verificado permite continuar (ok=true con todos los campos, incluidos reservado y desconocidos)", () => {
  const r = interpretModuleUsageRow(usageRowBase);
  assert(r.ok && r.usage.storageUsedBytes === 0 && r.usage.storageReservedBytes === 0 && r.usage.storageUnknownSizeCount === 0, "cero verificado es cero");
});

check("24-26. Tamaño desconocido/negativo o consulta fallida BLOQUEAN: el intérprete rechaza null/negativo y getModuleStorageUsage exige unknown=0 (reason 'unknown_sizes')", () => {
  assert(!interpretModuleUsageRow({ ...usageRowBase, storage_unknown_size_count: null }).ok, "columna de desconocidos ausente/null ⇒ inconsistente");
  assert(!interpretModuleUsageRow({ ...usageRowBase, storage_used_bytes: -1 }).ok, "negativo ⇒ inconsistente");
  assert(!interpretModuleUsageRow(null).ok, "fila ausente ⇒ no disponible (jamás cero)");
  const mp = read("server/actions/module-plans.ts");
  assert(mp.includes('storageUnknownSizeCount > 0') && mp.includes('"unknown_sizes"'), "desconocidos > 0 bloquea cargas (fail-closed)");
  assert(mp.includes("storageLimitBytes - usedBytes - reservedBytes"), "el disponible RESTA las reservas activas");
  assert(mp.includes("usage.usedBytes + usage.reservedBytes"), "la decisión de carga cuenta usado + reservado");
  assert(BEGIN_V2.includes("STORAGE_UNVERIFIABLE"), "la BD también bloquea el begin ante desconocidos/conflictos");
});

check("27-28. Ruta duplicada cuenta UNA vez y cada versión conserva SU tamaño: sin COALESCE(size, 0) en los objetos y dedup por (org, bucket, ruta) con máximo CONOCIDO", () => {
  const viewDef = MIG101.slice(MIG101.indexOf("create or replace view public.v_organization_module_usage"), MIG101.indexOf("§8"));
  assert(!/coalesce\((file_)?size_bytes, 0\)/.test(viewDef), "PROHIBIDO convertir NULL en cero en los objetos físicos");
  assert(viewDef.includes("group by organization_id, bucket_id, object_path"), "identidad física deduplicada");
  assert(viewDef.includes("max(size_bytes) as size_bytes") && viewDef.includes("(count(size_bytes) = 0)::int as size_unknown"),
    "máximo CONOCIDO; desconocido solo si NINGUNA referencia conoce el tamaño");
  assert(viewDef.includes("from public.trazadoc_file_document_versions"), "las versiones cuentan con SUS propios tamaños");
  const lister = read("lib/db/trazadocs-master.ts");
  assert(lister.includes("listFileDocumentStorageObjects") && lister.includes("sourceType") && lister.includes("sizeBytes"),
    "el lister devuelve OBJETOS completos por versión (§21)");
  assert(!/Promise<\{ paths: string\[\]/.test(lister), "jamás un simple string[] de rutas");
});

check("29-31. pending_delete y delete_failed SIGUEN contando; deleted deja de contar (filtro por status en vista y snapshot; demostrado en local)", () => {
  assert((MIG101.match(/status <> 'deleted'/g) ?? []).length >= 3, "el filtro status <> 'deleted' gobierna vista y snapshot");
  assert(MIG101.includes("'pending_delete', 'delete_failed', 'deleted'"), "los tres estados del ciclo, con CHECK");
  assert(MIG101.includes("(status = 'deleted') = (deleted_at is not null)"), "deleted exige marca temporal");
  const smoke = read("scripts/t9f3-local-sql-harness/smoke.sql");
  assert(smoke.includes("D2 deleted libera y delete_failed sigue contando"), "demostrado en local con bytes exactos");
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.3 §E — Registro de objetos pendientes (32–37)\n");

check("32-35. authenticated NO registra datos físicos arbitrarios: register es server-only y valida organización, módulo-bucket, prefijo y tamaño INCLUSO para el servidor", () => {
  assert(MIG101.includes("revoke all on function public.register_storage_orphan(uuid, text, text, text, bigint) from public, anon, authenticated"), "revocado a clientes");
  assert(MIG101.includes("grant execute on function public.register_storage_orphan(uuid, text, text, text, bigint) to service_role"), "solo service_role");
  const reg = MIG101.slice(MIG101.indexOf("create or replace function public.register_storage_orphan"), MIG101.indexOf("resolve_storage_deletion"));
  assert(reg.includes("'SERVER_ONLY'") && reg.includes("request.jwt.claims"), "gate server-only explícito");
  for (const token of ["ORGANIZATION_INVALID", "MODULE_INVALID", "BUCKET_INVALID", "OBJECT_PATH_INVALID", "SIZE_INVALID"]) {
    assert(reg.includes(token), `validación ${token}`);
  }
  assert(MIG101.includes("storage_orphan_candidates_module_bucket_check"), "combinación módulo-bucket canónica por CHECK");
  assert(MIG101.includes("position(organization_id::text || '/' in object_path) = 1"), "prefijo de organización por CHECK");
});

check("36. Las vías de CLIENTE derivan TODO de filas de dominio: queue_and_delete_* copian bucket/ruta/tamaño/fuente de la fila real y espejan la política RLS de DELETE", () => {
  const qDoc = MIG101.slice(MIG101.indexOf("queue_and_delete_trazadoc_draft"), MIG101.indexOf("queue_and_delete_evidence"));
  assert(qDoc.includes("v_doc.status = 'draft'") && qDoc.includes("array['admin', 'quality']") && qDoc.includes("v_doc.created_by = v_uid"),
    "espejo exacto de la política del maestro (0057)");
  assert(qDoc.includes("v.storage_path, v.size_bytes, 'trazadoc_version', v.id"), "cada versión con SU tamaño y su fuente");
  const qEv = MIG101.slice(MIG101.indexOf("queue_and_delete_evidence"), MIG101.indexOf("§4"));
  assert(qEv.includes("v_ev.status <> 'valid'"), "espejo de la política de evidencias (0019/0023)");
  assert(qEv.includes("v_ev.storage_path") && qEv.includes("v_ev.size_bytes"), "derivado de la fila, jamás del navegador");
  assert(MIG101.includes("grant execute on function public.queue_and_delete_trazadoc_draft(uuid) to authenticated"), "vía de cliente autorizada");
});

check("37. TODA respuesta de Supabase se INSPECCIONA en el ciclo server-only (removeError/resolveError/registerError; nunca try vacío)", () => {
  for (const token of ["removeError", "resolveError", "registerError", "data !== true"]) {
    assert(CYCLE.includes(token), `inspección explícita: ${token}`);
  }
  assert(!/catch\s*\{\s*\}/.test(CYCLE), "sin catch vacíos en el ciclo");
  assert(CYCLE.includes('import "server-only"'), "módulo server-only real");
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.3 §F — Fallos parciales TrazaDocs/CPR (38–40)\n");

check("38. TrazaDocs: si la finalización falla tras subir, el objeto queda REGISTRADO (contabilizable) o retirado con confirmación — jamás invisible", () => {
  // T9F.4 · §12: la referencia durable existe DESDE ANTES del upload (el
  // intent) — el fallo de la finalización ya no depende de una compensación
  // registrar-y-retirar: la resolución server-only inspecciona el retiro y,
  // sin confirmación, los bytes SIGUEN contando por el propio intent.
  const upload = fnBody("server/actions/trazadocs-master.ts", "uploadFileDocumentAction");
  assert(upload.indexOf("beginCprStorageUpload") !== -1 && upload.indexOf("beginCprStorageUpload") < upload.indexOf("uploadFileDocumentFile"),
    "el intent durable se crea ANTES del upload");
  assert(upload.includes("resolveCprUploadIntentObject"), "resolución server-only del intent");
  assert(upload.indexOf("finalizeError") < upload.lastIndexOf("resolveCprUploadIntentObject"), "la resolución cuelga del error REAL inspeccionado");
  assert(upload.includes("seguirá contando"), "aviso honesto cuando el retiro no se confirma");
});

check("39-40. Evidencias CPR: la escritura de storage_path/size es la RPC de finalización (definer) y su resultado se INSPECCIONA; ante fallo no hay éxito silencioso y el objeto permanece contabilizado si no se elimina", () => {
  // T9F.4 · §10/§15: el UPDATE directo de campos físicos está BLOQUEADO por
  // trigger — la única escritura es finalize_evidence_attachment (misma
  // transacción que consume la reserva) y su error se inspecciona; el
  // objeto conserva su referencia durable (intent) mientras no se resuelva.
  const create = fnBody("server/actions/evidences.ts", "createEvidenceAction");
  assert(!/from\("evidences"\)[\s\S]{0,120}\.update\(\{ storage_path/.test(create),
    "sin UPDATE directo de campos físicos en la acción (los fija la RPC definer)");
  assert(create.includes("finalizeEvidenceAttachment"), "finalización autoritativa por RPC");
  assert(create.includes("!finalized.ok"), "el resultado de la finalización se inspecciona");
  assert(create.includes("resolveCprUploadIntentObject"), "resolución server-only ante fallo");
  assert(create.includes("seguirá contando"), "si el retiro falla, el usuario sabe que sigue contando");
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.3 §G — Planes (41–44) e idempotencia global (46–48)\n");

check("41-43. Demo/Full/Extra: mismas funciones, solo difiere la cuota — el catálogo real es la única fuente (50/500/5120 MB) y 0101 no toca planes ni cuotas", () => {
  const seed = read("supabase/migrations/0050_plans_and_usage.sql");
  assert(/'demo'[\s\S]{0,200}52428800|52428800[\s\S]{0,200}'demo'|50 \* 1024 \* 1024/.test(seed), "cuota Demo 50 MB en el catálogo");
  assert(!/insert into (public\.)?plan_definitions|update (public\.)?plan_definitions|insert into (public\.)?plan_limits|update (public\.)?plan_limits/.test(MIG101),
    "0101 no crea ni modifica planes/cuotas");
  assert(!/'trial'|'premium'|'enterprise'|demo_temporary/.test(MIG101), "sin estados comerciales inventados");
});

check("44. organization_subscriptions NO gobierna ninguna decisión T9F.3: ni 0101 ni module-plans la consultan para límites/cuotas", () => {
  assert(!MIG101.includes("organization_subscriptions"), "0101 no toca el plan legacy");
  const plansCode = read("server/actions/module-plans.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert(!plansCode.includes("organization_subscriptions"), "las decisiones salen del MÓDULO (el plan legacy solo aparece en comentarios explicativos)");
});

check("46-48. No-op sin auditoría; transición real = UNA auditoría; primera asignación concurrente sin fallo (RPC T9F.2 intacta + carreras del arnés T9F.2 en verde)", () => {
  const setRpc = MIG101.slice(MIG101.indexOf("set_organization_module_access"), MIG101.indexOf("§5"));
  assert(setRpc.includes("'changed', false") && setRpc.includes("pg_advisory_xact_lock") && setRpc.includes("on conflict on constraint organization_modules_org_module_uniq"),
    "no-op temprano + lock + UPSERT conservados");
  assert(existsSync(join(process.cwd(), "scripts/t9f2-local-sql-harness/concurrency.sh")), "carrera real de asignación en el arnés T9F.2");
});

check("Estructural anti-deriva: el arnés T9F.3 y la suite RLS preparada existen y están encadenados", () => {
  for (const f of [
    "scripts/t9f3-local-sql-harness/run.sh",
    "scripts/t9f3-local-sql-harness/smoke.sql",
    "scripts/t9f3-local-sql-harness/concurrency.sh",
    "scripts/t9f3-size-reconciliation/reconcile.ts",
    "tests/rls/t9f3-atomic-limits-reservations-storage.test.ts",
  ]) {
    assert(existsSync(join(process.cwd(), f)), `falta ${f}`);
  }
  const pkg = read("package.json");
  assert(pkg.includes("test:t9f3") && pkg.includes("test:t9f3-rls"), "scripts npm declarados");
  assert(/test:t9f2 && npm run test:t9f3/.test(pkg), "encadenado a test:all");
});

if (failed > 0) {
  console.error(`\nT9F.3 unit/estructural: ${passed} ✔, ${failed} ✘`);
  process.exit(1);
}
console.log(`\nT9F.3 unit/estructural: ${passed} ✔, ${failed} ✘\n`);
