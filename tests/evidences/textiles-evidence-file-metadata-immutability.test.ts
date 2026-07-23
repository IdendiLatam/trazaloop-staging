/**
 * Trazaloop · Sprint T5.2 (Textil) · Verificación de la inmutabilidad de
 * metadatos de archivo en evidencias textiles.
 * Ejecutar: npx tsx tests/evidences/textiles-evidence-file-metadata-immutability.test.ts
 */

import fs from "node:fs";
import path from "node:path";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(error as Error).message}`);
  }
}

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const MIGRATION = "supabase/migrations/0077_textile_evidence_file_metadata_immutability.sql";
const migrationSql = read(MIGRATION);
const actionsSrc = read("server/actions/textiles-evidences.ts");
const dbSrc = read("lib/db/textiles-evidences.ts");

console.log("\nSprint T5.2 · Inmutabilidad de metadatos de archivo\n");

// ---------------------------------------------------------------------------
console.log("— Migración 0077: alcance —");

check("1. Existe 0077 y su rango sigue intacto", () => {
  // Actualizado en T6 (misma deriva de pins que en T2.1/T4/T5/T5.1): se
  // fija solo el rango propio; 0078+ son sprints legítimos posteriores.
  assert(fs.existsSync(path.join(root, MIGRATION)), "falta 0077");
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 77);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0077_textile_evidence_file_metadata_immutability.sql"]),
    `el rango 0077 cambió (hay: ${slot.join(", ")})`
  );
});

check("2-5. No crea órdenes/lotes, pasaporte, TrazaDocs Textil, circularidad ni planes por módulo", () => {
  assert(!/create table|drop table|drop view|drop policy|create policy/i.test(migrationSql), "0077 solo debía crear funciones y triggers");
  const lower = migrationSql.toLowerCase();
  for (const term of ["textile_order", "textile_batch", "textile_lot", "textile_passport", "textile_trazadoc", "textile_circular", "qr_", "module_access", "module_subscription", "textile_claims"]) {
    assert(!lower.includes(term), `0077 menciona "${term}" (fuera de alcance)`);
  }
});

check("6. No toca CPR funcionalmente (solo objetos textile_evidences)", () => {
  // Solo las cláusulas de trigger (el "on public." de los revoke de
  // funciones no es un objetivo de trigger).
  const targets = [...migrationSql.matchAll(/(?:insert|update) on public\.(\w+)/g)].map((m) => m[1]);
  assert(targets.length > 0 && targets.every((t) => t === "textile_evidences"), `los triggers debían actuar solo sobre textile_evidences (hay: ${[...new Set(targets)].join(", ")})`);
  assert(!migrationSql.includes("v_organization_plan_usage"), "0077 no debía tocar la vista de uso (criterio T5.1 intacto)");
  for (const f of ["supabase/migrations/0019_evidences_base.sql", "supabase/migrations/0075_textile_evidences.sql", "supabase/migrations/0076_textile_evidences_hardening_and_storage_usage.sql"]) {
    assert(fs.existsSync(path.join(root, f)), `${f} debía seguir presente`);
  }
  assert(!read("supabase/migrations/0019_evidences_base.sql").includes("textile"), "0019 (CPR) no debía tocarse");
});

// ---------------------------------------------------------------------------
console.log("\n— Inmutabilidad de los 4 metadatos —");

check("7-10. El trigger protege file_path, file_name, file_mime_type y file_size_bytes", () => {
  assert(migrationSql.includes("protect_textile_evidence_file_metadata"), "falta la función de protección");
  assert(migrationSql.includes("before update on public.textile_evidences"), "el trigger debía ser BEFORE UPDATE");
  for (const field of ["file_path", "file_name", "file_mime_type", "file_size_bytes"]) {
    assert(
      new RegExp(`new\\.${field}\\s+is distinct from old\\.${field}`).test(migrationSql),
      `el trigger debía comparar ${field}`
    );
  }
  assert(migrationSql.includes("Los metadatos de archivo de una evidencia textil no pueden modificarse después de su creación"), "falta el mensaje de error del encargo");
});

check("11. La comparación usa IS DISTINCT FROM (segura frente a nulls) y aplica a todos", () => {
  const comparisons = (migrationSql.match(/is distinct from/g) ?? []).length;
  assert(comparisons === 4, `esperaba 4 comparaciones is distinct from (hay ${comparisons})`);
  // Sin security definer en la protección: el trigger no evalúa roles y
  // dispara para TODOS los updates, incluido service_role (los triggers no
  // se saltan con la service key; solo la RLS).
  const protectBlock = migrationSql.split("protect_textile_evidence_file_metadata")[1]?.split("$$;")[0] ?? "";
  assert(!protectBlock.includes("security definer"), "la protección no necesita security definer (aplica también a service_role)");
  assert(!protectBlock.includes("has_org_role"), "la inmutabilidad no debía depender de roles: ningún rol cambia el archivo");
  assert(migrationSql.includes("revoke execute on function public.protect_textile_evidence_file_metadata"), "faltaba el revoke de la función");
});

check("12. Validación ESTRICTA del patrón de file_path en el INSERT", () => {
  assert(migrationSql.includes("validate_textile_evidence_file_path"), "falta la función de validación de ruta");
  assert(migrationSql.includes("before insert on public.textile_evidences"), "la validación debía ser BEFORE INSERT");
  // El flujo real genera el id ANTES del path → validación fuerte posible:
  // {organization_id}/textiles/{evidence_id}/{filename_saneado}
  assert(migrationSql.includes("new.organization_id::text || '/textiles/' || new.id::text"), "el patrón debía anclar organización Y evidence_id");
  assert(migrationSql.includes("[A-Za-z0-9._-]+$"), "el nombre de archivo debía restringirse al alfabeto saneado (sin traversal ni segmentos extra)");
  assert(/new\.file_path is null\s+or new\.file_path !~/.test(migrationSql), "la ruta nula o fuera de patrón debía rechazarse");
  const domain = read("lib/domain/textiles-evidences.ts");
  assert(domain.includes('replace(/[^a-zA-Z0-9._-]/g, "_")'), "buildTextileEvidencePath debía seguir saneando al mismo alfabeto");
});

// ---------------------------------------------------------------------------
console.log("\n— Server actions —");

check("13-15. Ni la edición, ni el cambio de estado, ni el archivado tocan campos de archivo", () => {
  // T9E.2: la ÚNICA escritura de campos de archivo vive en la RPC ATÓMICA
  // de 0097 (SQL): file_name/ruta salen del INTENTO verificado en servidor
  // y MIME/tamaño del objeto REAL. En TypeScript no queda NINGÚN insert de
  // textile_evidences ni escritura de file_*.
  const writes = (actionsSrc.match(/file_path:/g) ?? []).length;
  assert(writes === 0, "ninguna action debía escribir campos de archivo (lo hace la RPC 0097)");
  const mig97 = read("supabase/migrations/0097_atomic_textile_evidence_upload_finalize.sql");
  assert(
    /insert into public\.textile_evidences[\s\S]{0,600}v_intent\.original_filename, v_intent\.object_path/.test(mig97),
    "la RPC debía tomar nombre y ruta del intento"
  );
  const updateBlock = actionsSrc.split("export async function updateTextileEvidenceAction")[1]?.split("export async function")[0] ?? "";
  const statusBlock = actionsSrc.split("export async function updateTextileEvidenceStatusAction")[1]?.split("export async function")[0] ?? "";
  const archiveBlock = actionsSrc.split("export async function archiveTextileEvidenceAction")[1]?.split("export async function")[0] ?? "";
  for (const [name, block] of [["update", updateBlock], ["status", statusBlock], ["archive", archiveBlock]] as const) {
    for (const field of ["file_path", "file_name", "file_mime_type", "file_size_bytes"]) {
      assert(!block.includes(`${field}:`), `${name} no debía escribir ${field}`);
    }
  }
  const parseBlock = actionsSrc.split("function parseMetadata")[1]?.split("// ---")[0] ?? "";
  assert(!parseBlock.includes("file"), "parseMetadata no debía aceptar campos de archivo del cliente");
});

check("16. La signed URL usa el file_path persistido (con verificación de prefijo T5.1)", () => {
  assert(actionsSrc.includes("getTextileEvidence(g.ok.organizationId, evidenceId)"), "la action debía leer la evidencia persistida");
  assert(actionsSrc.includes("getTextileEvidenceSignedUrl(evidence.filePath)"), "la firma debía usar el file_path del registro, nunca uno del cliente");
  assert(actionsSrc.includes("isTextileEvidencePathForOrg(evidence.filePath, g.ok.organizationId)"), "la verificación de prefijo de T5.1 debía seguir");
  assert(dbSrc.includes("createSignedUrl") && !dbSrc.includes("getPublicUrl"), "la apertura debía seguir siendo por signed URL");
});

check("17. Sin service_role en actions; en db solo las operaciones server-only permitidas", () => {
  // T9E.3/T9E.4: la capa de datos usa el cliente admin SOLO para las RPC
  // `*_server` (selladas para authenticated en 0098) y para la retirada
  // física de objetos textiles (0099 quitó la política DELETE de cliente).
  // La Server Action nunca toca service_role: delega en lib/db.
  assert(
    !actionsSrc.includes("SUPABASE_SERVICE_ROLE") &&
      !actionsSrc.includes("serviceRole") &&
      !actionsSrc.includes("createAdminClient"),
    "actions usa service_role"
  );
  assert(
    !dbSrc.includes("SUPABASE_SERVICE_ROLE") && !dbSrc.includes("serviceRole"),
    "db incrusta la service role key en lugar del cliente admin server-only"
  );
  const ADMIN_ALLOWED = [
    "finalizeTextileEvidenceUploadRpc",
    "recordTextileUploadIntentCleanupRpc",
    "removeTextileEvidenceObject",
  ];
  for (const body of dbSrc.split(/export async function /).slice(1)) {
    if (!body.includes("createAdminClient()")) continue;
    const fnName = body.slice(0, body.indexOf("("));
    assert(ADMIN_ALLOWED.includes(fnName), `${fnName} usa el cliente admin fuera de lo permitido`);
  }
});

// ---------------------------------------------------------------------------
console.log("\n— Documentación y lenguaje —");

check("18-19. La documentación de habilitación usa module_code y no enabled_by", () => {
  for (const f of ["TEXTILES_T4_PRODUCTS_COMPOSITION_IMPLEMENTATION_REPORT.md", "TEXTILES_T5_EVIDENCES_IMPLEMENTATION_REPORT.md", "TEXTILES_T5_1_EVIDENCES_HARDENING_REPORT.md", "TEXTILES_T5_2_FILE_METADATA_IMMUTABILITY_REPORT.md"]) {
    const doc = read(`docs/modules/textiles/${f}`);
    assert(!/insert into organization_modules[^;]*module_key/.test(doc), `${f}: el insert debía usar module_code`);
    assert(!/insert into organization_modules[^;]*enabled_by/.test(doc), `${f}: enabled_by no existe`);
  }
});

check("20. Sin promesas de certificación en los textos nuevos", () => {
  const report = read("docs/modules/textiles/TEXTILES_T5_2_FILE_METADATA_IMMUTABILITY_REPORT.md");
  const lower = (migrationSql + actionsSrc + report).toLowerCase();
  for (const term of ["certificado garantizado", "cumplimiento automático", "validado por norma", "producto certificado", "pasaporte oficial"]) {
    assert(!lower.includes(term), `texto prohibido: "${term}"`);
  }
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron\n`);
if (failed > 0) process.exit(1);
