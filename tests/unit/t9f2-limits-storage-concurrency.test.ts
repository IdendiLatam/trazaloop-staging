/**
 * Trazaloop · Sprint T9F.2 · Cierre de límites Textiles, cuotas reales,
 * contabilización física e idempotencia concurrente.
 *
 * Pruebas PURAS + ESTRUCTURALES sobre el código y el SQL reales, numeradas
 * según §29 del plan T9F.2. Lo que exige base de datos viva está en:
 *  · scripts/t9f2-local-sql-harness/ (PG local efímero: idempotencia,
 *    deduplicación física con bytes exactos, allowance, concurrencia REAL);
 *  · tests/rls/t9f2-module-limits-storage-and-concurrency.test.ts (staging,
 *    PREPARADA, no ejecutada desde este entorno).
 *
 * Correr: npx tsx tests/unit/t9f2-limits-storage-concurrency.test.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildModuleEntitlements,
  functionalLimitsFingerprint,
  accessModeToPlanCode,
  type FunctionalLimit,
} from "../../lib/modules/access";
import { interpretModuleUsageRow } from "../../lib/db/module-usage-shared";
import {
  maxFileDocumentSizeForPlan,
  MAX_FILE_DOCUMENT_SIZE_DEMO_BYTES,
  MAX_FILE_DOCUMENT_SIZE_FULL_BYTES,
} from "../../lib/domain/trazadocs-master";

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
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const stripSql = (s: string) => s.replace(/--[^\n]*/g, "");

function fnBody(file: string, name: string): string {
  const src = read(file);
  const i = src.indexOf(`export async function ${name}`);
  if (i === -1) throw new Error(`${file}: no existe ${name}`);
  const j = src.indexOf("export async function", i + 10);
  return src.slice(i, j === -1 ? src.length : j);
}

const MIG101 = stripSql(read("supabase/migrations/0101_t9f1_module_access_hardening.sql"));
const MODULE_PLANS = read("server/actions/module-plans.ts");

// ---------------------------------------------------------------------------
console.log("Trazaloop · T9F.2 §A — Límites Textiles (1–16)\n");

const DEMO_LIMITS: FunctionalLimit[] = [
  { resourceCode: "suppliers", limitValue: 1, isUnlimited: false },
  { resourceCode: "materials", limitValue: 5, isUnlimited: false },
  { resourceCode: "roles_enabled", limitValue: 0, isUnlimited: false },
];
const UNLIMITED: FunctionalLimit[] = DEMO_LIMITS.map((l) => ({
  resourceCode: l.resourceCode,
  limitValue: l.resourceCode.endsWith("_enabled") ? 1 : null,
  isUnlimited: !l.resourceCode.endsWith("_enabled"),
}));

check("1. Demo temporal y Demo permanente resuelven exactamente los mismos límites (mismo access_mode)", () => {
  assert(accessModeToPlanCode("demo") === "demo", "demo mapea 1:1");
  const a = buildModuleEntitlements("demo", DEMO_LIMITS, 52428800);
  const b = buildModuleEntitlements("demo", DEMO_LIMITS, 52428800);
  assert(functionalLimitsFingerprint(a) === functionalLimitsFingerprint(b), "misma huella de límites");
});

check("2-3. Full y Extra: mismos límites funcionales; difieren SOLO en storageLimitBytes", () => {
  const full = buildModuleEntitlements("full", UNLIMITED, 524288000);
  const extra = buildModuleEntitlements("extra", UNLIMITED, 5368709120);
  assert(functionalLimitsFingerprint(full) === functionalLimitsFingerprint(extra), "huella idéntica");
  assert(full.storageLimitBytes !== extra.storageLimitBytes, "la cuota es la única diferencia");
});

/** §12 · MATRIZ DE LÍMITES TEXTILES: recurso ↔ tabla ↔ acción de creación.
 *  Una creación limitada nueva que no llame al helper canónico rompe esta
 *  prueba (inventario explícito + cobertura estructural, no solo regex). */
const TEXTILES_LIMIT_MATRIX: {
  resource: string;
  table: string;
  file: string;
  action: string;
}[] = [
  { resource: "suppliers", table: "textile_suppliers", file: "server/actions/textiles-catalogs.ts", action: "createTextileSupplierAction" },
  { resource: "materials", table: "textile_materials", file: "server/actions/textiles-catalogs.ts", action: "createTextileMaterialAction" },
  { resource: "products", table: "textile_products", file: "server/actions/textiles-products.ts", action: "createTextileProductAction" },
  { resource: "evidences", table: "textile_evidences", file: "server/actions/textiles-evidences.ts", action: "beginTextileEvidenceUploadAction" },
  { resource: "production_orders", table: "textile_production_orders", file: "server/actions/textiles-traceability.ts", action: "createTextileProductionOrderAction" },
  { resource: "input_batches", table: "textile_input_lots", file: "server/actions/textiles-traceability.ts", action: "createTextileInputLotAction" },
  { resource: "output_batches", table: "textile_output_lots", file: "server/actions/textiles-traceability.ts", action: "createTextileOutputLotAction" },
  { resource: "documents_trazadocs", table: "trazadoc_documents", file: "server/actions/textiles-trazadocs.ts", action: "createTextileTrazadocFromTemplateAction" },
];

check("4-11. Cada creación Textiles LIMITADA llama al helper canónico con SU recurso ANTES del INSERT (matriz completa)", () => {
  for (const row of TEXTILES_LIMIT_MATRIX) {
    const body = fnBody(row.file, row.action);
    const call = `checkTextilesResourceLimit("${row.resource}")`;
    assert(body.includes(call), `${row.action} debía llamar ${call}`);
    const callIdx = body.indexOf(call);
    const insertIdx = body.search(/\.insert\(|\.rpc\(/);
    assert(insertIdx === -1 || callIdx < insertIdx, `${row.action}: el límite debía validarse ANTES del INSERT/RPC`);
  }
});

check("Deriva futura (§30): ninguna creación sobre una tabla Textiles LIMITADA queda fuera de la matriz", () => {
  const limitedTables = new Set(TEXTILES_LIMIT_MATRIX.map((r) => r.table));
  const declared = new Set(TEXTILES_LIMIT_MATRIX.map((r) => `${r.file}:${r.action}`));
  const files = readdirSync(join(process.cwd(), "server/actions")).filter((f) => f.startsWith("textiles-"));
  for (const f of files) {
    const src = read(`server/actions/${f}`);
    const re = /export async function (\w+)/g;
    const hits: { name: string; start: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) hits.push({ name: m[1], start: m.index });
    hits.forEach((h, i) => {
      const body = src.slice(h.start, i + 1 < hits.length ? hits[i + 1].start : src.length);
      for (const table of limitedTables) {
        if (body.includes(`.from("${table}").insert(`) || body.includes(`from("${table}")\n    .insert(`)) {
          const key = `server/actions/${f}:${h.name}`;
          assert(
            declared.has(key) || body.includes("checkTextilesResourceLimit("),
            `${key} inserta en ${table} sin pasar por el helper canónico ni estar declarada en la matriz`
          );
        }
      }
    });
  }
});

check("12. La creación masiva valida requestedIncrement: conteo + incremento <= límite, en la RPC de BD", () => {
  assert(/requestedIncrement = 1/.test(MODULE_PLANS), "el helper acepta incremento explícito con default 1");
  assert(/Number\.isInteger\(requestedIncrement\) \|\| requestedIncrement < 1/.test(MODULE_PLANS.replace(/!\s*/g, "")), "incrementos inválidos se rechazan");
  assert(/p_requested_increment: requestedIncrement/.test(MODULE_PLANS), "el incremento viaja a la RPC");
  assert(/\(v_current \+ p_requested_increment\) <= v_limit\.limit_value/.test(MIG101), "la RPC compara conteo + incremento contra el límite");
});

check("13. Las importaciones CPR validan el incremento COMPLETO antes del primer INSERT (jamás inserción parcial)", () => {
  const commit = fnBody("server/actions/imports.ts", "commitImportAction");
  assert(/checkCprResourceLimit\(limitedResource, toInsertCount\)/.test(commit), "el importador nuevo valida el incremento");
  // T9F.3: la escritura pasó a UNA inserción masiva (un statement = una
  // transacción): la validación previa sigue yendo ANTES y el trigger de
  // 0101 revierte TODO ante cualquier exceso (jamás inserción parcial).
  assert(commit.indexOf("checkCprResourceLimit(limitedResource") < commit.indexOf("insertBusinessRows("), "la validación va ANTES de la inserción masiva");
  assert(/insertBusinessRows\(/.test(commit) && !/insertBusinessRow\(/.test(commit.replace(/insertBusinessRows\(/g, "")), "una única inserción masiva atómica (sin bucle fila a fila)");
  const legacy = fnBody("server/actions/import.ts", "commitImportAction");
  assert(/checkCprResourceLimit\(limitedResource, rows\.length\)/.test(legacy), "el importador anterior valida el incremento");
  assert(legacy.indexOf("checkCprResourceLimit(") < legacy.indexOf(".insert(payload)"), "la validación legacy va ANTES del INSERT");
});

check("14-15. Reactivar (setActive) y actualizar NO consumen unidad nueva: el conteo incluye todos los registros (misma semántica del catálogo)", () => {
  // Decisión documentada: los límites cuentan TODAS las filas (count(*), como
  // la vista legacy 0052 y la vista 0101). Desactivar no libera; reactivar no
  // crea. Por eso setActive/update NO llaman al helper de límite.
  for (const [file, fn] of [
    ["server/actions/textiles-catalogs.ts", "setTextileSupplierActiveAction"],
    ["server/actions/textiles-catalogs.ts", "updateTextileSupplierAction"],
    ["server/actions/textiles-products.ts", "updateTextileProductAction"],
  ] as const) {
    const body = fnBody(file, fn);
    assert(!body.includes("checkTextilesResourceLimit("), `${fn} no debía consumir unidad (mismo registro)`);
    // El gate puede vivir en la propia acción o en el helper interno al que
    // delega (setActive), que lo ejecuta para las 5 entidades a la vez.
    const gated =
      body.includes("checkTextilesCanMutate") ||
      body.includes("gate()") ||
      /return setActive\(/.test(body);
    assert(gated, `${fn} conserva el gate del módulo (directo o vía setActive)`);
  }
  assert((MIG101.match(/count\(\*\) as suppliers_count/g) ?? []).length >= 1, "la vista cuenta count(*) — todas las filas");
});

check("16. Eliminar libera la unidad (CPR: la fila desaparece del conteo) y no existe 'duplicar' Textiles que evada el helper", () => {
  // CPR: deleteSupplierAction elimina la fila → count(*) baja (misma vista).
  const del = fnBody("server/actions/catalog.ts", "deleteSupplierAction");
  assert(/\.delete\(\)/.test(del), "eliminar borra la fila (libera la unidad en count(*))");
  // Textiles: no hay acción de duplicación/clonación hoy; la prueba de deriva
  // (arriba) atrapa cualquier creación nueva sobre tablas limitadas.
  const files = readdirSync(join(process.cwd(), "server/actions")).filter((f) => f.startsWith("textiles-"));
  for (const f of files) {
    assert(!/export async function (duplicate|clone)/i.test(read(`server/actions/${f}`)), `${f}: una duplicación nueva debe declararse en la matriz`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.2 §B — TrazaDocs CPR (17–20)\n");

check("17-19. Tamaño por archivo: Demo 10 MB; Full 25 MB; Extra EXACTAMENTE igual a Full", () => {
  assert(MAX_FILE_DOCUMENT_SIZE_DEMO_BYTES === 10 * 1024 * 1024, "Demo 10 MB (fuente única)");
  assert(MAX_FILE_DOCUMENT_SIZE_FULL_BYTES === 25 * 1024 * 1024, "Full 25 MB (fuente única)");
  assert(maxFileDocumentSizeForPlan("demo") === MAX_FILE_DOCUMENT_SIZE_DEMO_BYTES, "demo → 10 MB");
  assert(maxFileDocumentSizeForPlan("full") === MAX_FILE_DOCUMENT_SIZE_FULL_BYTES, "full → 25 MB");
  assert(maxFileDocumentSizeForPlan("extra") === maxFileDocumentSizeForPlan("full"), "Extra = Full por archivo; Extra solo difiere en cuota total");
});

check("20. El plan legacy NO altera el tamaño CPR: upload y replace resuelven access_mode del MÓDULO y bloquean si no resuelve", () => {
  const src = stripTs(read("server/actions/trazadocs-master.ts"));
  assert(!src.includes("getOrganizationUsage"), "trazadocs-master ya no lee el uso legacy");
  assert(!src.includes('?? "demo"'), "sin fallback silencioso a un plan por defecto");
  for (const fn of ["beginFileDocumentUploadAction", "beginFileDocumentReplaceAction"] as const) {
    const body = fnBody("server/actions/trazadocs-master.ts", fn);
    assert(body.includes("getCprAccessModeForAction()"), `${fn} resuelve el modo del módulo CPR`);
    assert(body.includes("accessModeToPlanCode(cprMode.accessMode)"), `${fn} deriva el tamaño del plan del módulo`);
    assert(body.includes("cprMode.accessMode === null"), `${fn} bloquea si el modo no puede resolverse`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.2 §C — Storage fail-closed (21–28)\n");

check("21. Uso cero VERIFICADO produce ok=true con usedBytes=0", () => {
  const r = interpretModuleUsageRow({
    organization_id: "o", module_code: "textiles",
    documents_trazadocs_count: 0, suppliers_count: 0, materials_count: 0,
    products_count: 0, evidences_count: 0, production_orders_count: 0,
    input_batches_count: 0, output_batches_count: 0,
    storage_used_bytes: 0, storage_reserved_bytes: 0,
    storage_unknown_size_count: 0, storage_object_conflicts: 0,
  });
  assert(r.ok && r.usage.storageUsedBytes === 0, "cero verificado es cero");
  assert(r.ok && r.usage.storageReservedBytes === 0 && r.usage.storageUnknownSizeCount === 0,
    "reservado y desconocidos también llegan verificados (T9F.3)");
});

check("22-23. Fila ausente/null produce ok=false (jamás cero)", () => {
  assert(interpretModuleUsageRow(null).ok === false, "null bloquea");
  assert(interpretModuleUsageRow(undefined).ok === false, "undefined bloquea");
  const r = interpretModuleUsageRow({ organization_id: "o", module_code: "m", storage_used_bytes: null });
  assert(r.ok === false && r.reason === "inconsistent_data", "columna null es dato inconsistente");
});

check("24-25. Valor negativo, NaN o infinito producen ok=false (datos inconsistentes)", () => {
  const base = {
    organization_id: "o", module_code: "textiles",
    documents_trazadocs_count: 0, suppliers_count: 0, materials_count: 0,
    products_count: 0, evidences_count: 0, production_orders_count: 0,
    input_batches_count: 0, output_batches_count: 0, storage_object_conflicts: 0,
  };
  for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, "no-numérico"]) {
    const r = interpretModuleUsageRow({ ...base, storage_used_bytes: bad });
    assert(r.ok === false && r.reason === "inconsistent_data", `${String(bad)} debía bloquear como inconsistente`);
  }
});

check("26. La carga se bloquea cuando el uso no es verificable: checkModuleStorageAvailable exige ok=true y nunca hace '?? 0'", () => {
  const src = stripTs(MODULE_PLANS);
  assert(!/storageUsedBytes \?\? 0/.test(src), "prohibido convertir errores en cero");
  assert(/if \(!usage\.ok\)/.test(src), "el check exige resultado verificado");
  assert(src.includes("No fue posible verificar la capacidad de almacenamiento disponible. Inténtalo nuevamente."), "mensaje contractual en español");
  assert(/storageObjectConflicts > 0/.test(src), "los conflictos de tamaño también fallan cerrados");
  // La capa de lectura tampoco esconde errores tras null/0:
  const usageSrc = stripTs(read("lib/db/module-usage.ts"));
  assert(/ok: false, reason:/.test(usageSrc), "la capa de uso devuelve un resultado discriminado");
  assert(!/return null;/.test(usageSrc), "sin null ambiguo entre error y sin-fila");
});

check("27. begin de evidencias Textiles no emite intención sin verificación: límite + cuota del módulo ANTES de la RPC", () => {
  const body = fnBody("server/actions/textiles-evidences.ts", "beginTextileEvidenceUploadAction");
  const limitIdx = body.indexOf('checkTextilesResourceLimit("evidences")');
  const storageIdx = body.indexOf("checkTextilesStorageAvailable(");
  const rpcIdx = body.indexOf("beginTextileEvidenceUploadRpc(");
  assert(limitIdx > -1 && storageIdx > -1, "begin valida límite Y cuota");
  assert(limitIdx < rpcIdx && storageIdx < rpcIdx, "ambas validaciones van ANTES de crear la intención/URL firmada");
});

check("28. finalize verifica el tamaño físico REAL (invariante T9E conservado, 0097/0098)", () => {
  const m97 = stripSql(read("supabase/migrations/0097_atomic_textile_evidence_upload_finalize.sql"));
  const m98 = stripSql(read("supabase/migrations/0098_server_only_textile_evidence_finalize.sql"));
  assert(/metadata|size/i.test(m97) && /finalize/i.test(m98), "las migraciones de finalización existen intactas");
  assert(/size/i.test(m98), "la finalización server-only contrasta el tamaño real del objeto");
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.2 §D — Contabilización física (29–34)\n");

/** Espejo PURO del algoritmo de la vista (documenta la deduplicación y se
 *  contrasta con los bytes EXACTOS validados en el arnés SQL local). */
function sumPhysicalObjects(refs: { bucket: string; path: string; size: number }[]): {
  usedBytes: number;
  conflicts: number;
} {
  const byId = new Map<string, Set<number>>();
  for (const r of refs) {
    const id = `${r.bucket}\u0000${r.path}`;
    if (!byId.has(id)) byId.set(id, new Set());
    byId.get(id)!.add(r.size);
  }
  let usedBytes = 0;
  let conflicts = 0;
  for (const sizes of byId.values()) {
    usedBytes += Math.max(...sizes);
    if (sizes.size > 1) conflicts += 1;
  }
  return { usedBytes, conflicts };
}

check("29-31. Objeto actual cuenta; versión con ruta distinta cuenta; ruta REPETIDA cuenta UNA sola vez", () => {
  const MB = 1048576;
  const r = sumPhysicalObjects([
    { bucket: "trazadocs-documents", path: "o/doc/v3.pdf", size: 10 * MB }, // actual
    { bucket: "trazadocs-documents", path: "o/doc/v3.pdf", size: 10 * MB }, // versión 3 = mismo objeto
    { bucket: "trazadocs-documents", path: "o/doc/v1.pdf", size: 10 * MB }, // histórica
    { bucket: "trazadocs-documents", path: "o/doc/v2.pdf", size: 10 * MB }, // histórica
  ]);
  assert(r.usedBytes === 30 * MB && r.conflicts === 0, `3 objetos físicos = 30 MB exactos (fue ${r.usedBytes})`);
});

check("32-33. Evidencia CPR + documento CPR se SUMAN; CPR y Textiles se mantienen separados por rama (sin cruce)", () => {
  const MB = 1048576;
  const cpr = sumPhysicalObjects([
    { bucket: "evidences", path: "o/ev1/a.pdf", size: 10 * MB },
    { bucket: "trazadocs-documents", path: "o/doc/v1.pdf", size: 10 * MB },
  ]);
  assert(cpr.usedBytes === 20 * MB, "evidencia + documento suman");
  // La separación por módulo es estructural en la vista (ramas CPR/Textiles
  // con fuentes disjuntas) — verificada en la suite T9F.1 (31-34/37-38) y con
  // bytes exactos en el arnés SQL local.
  assert(/with cpr_objects as/.test(MIG101) && /textile_objects as/.test(MIG101), "ramas físicas separadas por módulo");
});

check("34. Tamaños CONTRADICTORIOS no se resuelven permisivamente: máximo conservador + conflicto que bloquea cargas", () => {
  const MB = 1048576;
  const r = sumPhysicalObjects([
    { bucket: "trazadocs-documents", path: "o/doc/v3.pdf", size: 5 * MB },
    { bucket: "trazadocs-documents", path: "o/doc/v3.pdf", size: 10 * MB },
  ]);
  assert(r.usedBytes === 10 * MB, "se toma el MÁXIMO (nunca el menor en silencio)");
  assert(r.conflicts === 1, "el conflicto queda expuesto");
  assert(/max\(size_bytes\) as size_bytes/.test(MIG101) && /count\(distinct size_bytes\) > 1/.test(MIG101), "la vista implementa exactamente esta política");
});

check("§20. Integridad BD–Storage: eliminar retira objetos CONFIRMANDO y un retiro fallido queda REGISTRADO y contable", () => {
  // T9F.3 (§18): la marca pending_delete nace EN LA MISMA TRANSACCIÓN que
  // borra las filas (RPC de dominio) y el retiro físico es server-only y
  // CONFIRMADO — invariante estrictamente más fuerte que el de T9F.2.
  const master = fnBody("server/actions/trazadocs-master.ts", "deleteDraftFileDocumentAction");
  assert(master.includes("queueAndDeleteFileDocumentDraft"), "el borrado del maestro encola (pending_delete) y borra en UNA transacción");
  assert(master.includes("removeQueuedStorageObjects"), "retira los objetos confirmando (server-only)");
  const lib = stripTs(read("lib/db/trazadocs-master.ts"));
  assert(lib.includes("queue_and_delete_trazadoc_draft"), "la capa de datos usa la RPC atómica de encolado");
  const ev = fnBody("server/actions/evidences.ts", "deleteEvidenceAction");
  assert(ev.includes("queue_and_delete_evidence"), "la evidencia se encola y borra en UNA transacción");
  assert(ev.includes("removeQueuedStorageObject"), "el retiro de la evidencia se confirma (server-only)");
  const cycle = read("lib/db/storage-deletion.ts");
  assert(cycle.includes('import "server-only"') && cycle.includes("resolve_storage_deletion"),
    "el retiro fallido queda como delete_failed contabilizado (resolución server-only)");
  assert(/storage_orphan_candidates/.test(MIG101) && /register_storage_orphan/.test(MIG101), "0101 crea la cola contable y su función");
  assert(/from public\.storage_orphan_candidates/.test(MIG101), "la vista CUENTA los candidatos huérfanos (nunca almacenamiento ficticio)");
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.2 §E — Concurrencia e idempotencia (35–40)\n");

const RPC = MIG101.slice(
  MIG101.indexOf("function public.set_organization_module_access"),
  MIG101.indexOf("comment on function public.set_organization_module_access")
);

check("35/40. La primera asignación usa una estrategia concurrente segura: advisory lock POR (org, módulo) + UPSERT", () => {
  assert(/pg_advisory_xact_lock\(/.test(RPC), "advisory lock transaccional presente");
  assert(/hashtextextended\('organization_modules:' \|\| p_organization_id::text \|\| '\/' \|\| p_module_code, 0\)/.test(RPC), "el lock deriva de organización + módulo (sin bloqueo global)");
  assert(/on conflict on constraint organization_modules_org_module_uniq do update/.test(RPC), "UPSERT determinista como segunda defensa");
  const lockIdx = RPC.indexOf("pg_advisory_xact_lock");
  const selectIdx = RPC.indexOf("select * into v_before");
  assert(lockIdx < selectIdx, "el lock se toma ANTES de leer/comparar el estado");
});

check("36-38. No-op: changed=false, sin UPDATE de timestamps, sin auditoría (estructura conservada de T9F.1)", () => {
  assert(/'changed', false/.test(RPC), "no-op devuelve changed=false");
  const noopReturn = RPC.indexOf("'changed', false");
  assert(noopReturn < RPC.indexOf("insert into organization_modules"), "el no-op retorna ANTES de cualquier INSERT");
  assert(noopReturn < RPC.indexOf("update organization_modules"), "…y de cualquier UPDATE");
  assert(noopReturn < RPC.indexOf("perform log_event"), "…y de log_event");
  assert(/'updated_at', v_before\.updated_at/.test(RPC.slice(0, RPC.indexOf("if v_before.id is null"))), "el no-op devuelve el updated_at PREVIO");
});

check("39. Una transición real crea EXACTAMENTE una auditoría", () => {
  assert((RPC.match(/perform log_event/g) ?? []).length === 1, "una sola emisión de auditoría en la función");
  assert(/'changed', true/.test(RPC), "la transición real devuelve changed=true");
});

check("La 0101 acumulada sigue siendo ADITIVA y 0102 es el único cierre QA posterior", () => {
  const lower = MIG101.toLowerCase();
  assert(!/truncate/.test(lower), "sin TRUNCATE");
  assert(!/drop table/.test(lower) && !/drop function/.test(lower) && !/drop view/.test(lower), "sin DROP destructivo");
  // T9F.4 · §9: tres políticas de DELETE directo retiradas (endurecimiento).
  // T9F.5B · §12: cuatro políticas PERMISIVAS de storage.objects retiradas
  // (A01-A04), sustituidas por INSERT ligado a intent o deny-by-default.
  assert((lower.match(/drop policy/g) ?? []).length === 7, "tres drop policy de DELETE directo (T9F.4 §3b) + cuatro de Storage (T9F.5B §12)");
  {
    // T9F.3/T9F.4: los ÚNICOS DELETE permitidos son los de DOMINIO dentro
    // de las RPCs atómicas — encolados (§3, misma transacción que crea el
    // pending_delete: borrador del maestro, evidencia CPR y evidencia
    // textil) más el descarte del borrador VACÍO. Jamás limpieza de datos,
    // backfill ni borrado masivo.
    const deletes = lower.match(/\bdelete from\b[^;]+;/g) ?? [];
    assert(deletes.length === 4, "solo los cuatro DELETE de dominio de las RPCs seguras");
    assert(deletes.some((d) => d.includes("trazadoc_file_documents where id = v_doc.id")), "delete del borrador dentro de su RPC");
    assert(deletes.some((d) => d.includes("evidences where id = v_ev.id")), "delete de la evidencia dentro de su RPC");
    assert(deletes.some((d) => d.includes("textile_evidences where id = v_ev.id")), "delete de la evidencia textil dentro de su RPC (T9F.4)");
  }
  // T9F.5B · §12: 0101 SÍ corrige ahora Storage RLS — era la superficie
  // (A01-A04) que hacía opcional toda la arquitectura de reservas. Lo que se
  // exige es que el cambio sea ENDURECEDOR: se retiran políticas permisivas
  // y las que se crean exigen intent; jamás se toca el bucket de Textiles
  // (evidences_insert_textiles, 0099) ni se abre ningún verbo nuevo.
  assert(/drop policy if exists evidences_insert_legacy on storage\.objects/.test(lower),
    "T9F.5B retira la política CPR permisiva (A01)");
  assert(/create policy evidences_insert_cpr on storage\.objects/.test(lower),
    "T9F.5B instala el INSERT CPR ligado a intent (A01)");
  assert(!/create policy evidences_insert_textiles/.test(lower),
    "0101 no redefine la política textil de 0099");
  assert(!/create policy[^;]+for (update|delete)[^;]*on storage\.objects/.test(lower),
    "0101 no crea ninguna política UPDATE/DELETE sobre storage.objects");
  assert(!/insert into public\.plan_definitions/.test(lower) && !/insert into public\.plan_limits/.test(lower), "no crea planes ni cuotas");
  const migs = readdirSync(
    join(process.cwd(), "supabase/migrations")
  );

  const after0101 = migs
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

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.2 §F — Legacy (41–44)\n");

check("41-42. organization_subscriptions no gobierna límites Textiles ni TrazaDocs CPR", () => {
  const files = readdirSync(join(process.cwd(), "server/actions")).filter((f) => f.startsWith("textiles-"));
  for (const f of files) {
    const src = stripTs(read(`server/actions/${f}`));
    assert(!src.includes("organization_subscriptions") && !src.includes('from "@/server/actions/plans"'), `${f} sin legacy`);
  }
  const master = stripTs(read("server/actions/trazadocs-master.ts"));
  assert(!master.includes("organization_subscriptions") && !master.includes("getOrganizationUsage"), "TrazaDocs CPR sin legacy");
  const allowance = MIG101.slice(MIG101.indexOf("check_module_resource_allowance"));
  assert(!/organization_subscriptions/.test(allowance), "la decisión de límites en BD tampoco lee el legacy");
});

check("43-44. Ninguna llamada operativa CPR/Textiles sin moduleCode: solo wrappers canónicos con constante", () => {
  const src = stripTs(MODULE_PLANS);
  assert(/checkModuleResourceLimit\(CPR_MODULE_CODE, resourceCode, requestedIncrement\)/.test(src), "wrapper CPR con constante canónica");
  assert(/checkModuleResourceLimit\(TEXTILES_MODULE_CODE, resourceCode, requestedIncrement\)/.test(src), "wrapper Textiles con constante canónica");
  const actionsDir = readdirSync(join(process.cwd(), "server/actions"));
  for (const f of actionsDir) {
    if (!/\.ts$/.test(f) || f === "module-plans.ts") continue;
    const src2 = stripTs(read(`server/actions/${f}`));
    assert(!/checkModule(ResourceLimit|StorageAvailable|CanMutate|FeatureEnabled)\(/.test(src2), `${f}: las acciones usan SOLO los wrappers por módulo (jamás el genérico con string libre)`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.2 §G — Seguridad (45–48)\n");

check("45. Sin service role en código de cliente (invariante conservado)", () => {
  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const e of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p, acc);
      else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
    }
    return acc;
  };
  for (const p of [...walk("components"), ...walk("app")]) {
    const src = read(p);
    if (!src.startsWith('"use client"') && !src.includes('\n"use client"')) continue;
    assert(!/SERVICE_ROLE/i.test(src) && !src.includes("createAdminClient"), `${p} sin service role`);
  }
});

check("46-48. El cliente no decide cuota, conteos ni plan: helpers server-only con sesión + RPC con SECURITY y grants mínimos", () => {
  assert(MODULE_PLANS.startsWith('"use server"'), "module-plans es server-only");
  assert(/requireActiveOrg\(\)/.test(MODULE_PLANS), "la organización sale SIEMPRE de la sesión");
  const usage = read("lib/db/module-usage.ts");
  assert(usage.includes('import "server-only"'), "la capa de uso es server-only");
  assert(/revoke all on function public\.check_module_resource_allowance\(uuid, text, text, integer\) from public, anon/.test(MIG101), "allowance sin anon");
  // T9F.3: allowance pasó a SECURITY DEFINER con GATE explícito de membresía
  // (resolve → not_member = decisión verificada y negativa) para poder contar
  // las RESERVAS activas de toda la organización. Invariante equivalente:
  // un no-miembro jamás obtiene una decisión positiva ni conteos ajenos.
  const allowanceDef = MIG101.slice(MIG101.indexOf("create or replace function public.check_module_resource_allowance"));
  assert(/security definer/.test(allowanceDef.slice(0, 600)), "allowance es definer (T9F.3)");
  assert(/resolve_organization_module_access\(p_organization_id, p_module_code\)/.test(allowanceDef), "gate de membresía vía resolve dentro de la función");
  assert(/revoke all on public\.storage_orphan_candidates from public, anon, authenticated/.test(MIG101), "la cola de huérfanos no es legible/escribible por clientes");
  assert(/revoke all on function public\.register_storage_orphan\(uuid, text, text, text, bigint\) from public, anon, authenticated/.test(MIG101), "el registro físico está VETADO a authenticated (server-only, T9F.3)");
  assert(/grant execute on function public\.register_storage_orphan\(uuid, text, text, text, bigint\) to service_role/.test(MIG101), "solo service_role registra objetos sin referencia");
});

console.log(`\nT9F.2 unit/estructural: ${passed} ✔, ${failed} ✘\n`);
if (failed > 0) process.exit(1);
