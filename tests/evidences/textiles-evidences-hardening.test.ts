/**
 * Trazaloop · Sprint T5.1 (Textil) · Verificación del hardening de
 * evidencias textiles y uso de almacenamiento.
 * Ejecutar: npx tsx tests/evidences/textiles-evidences-hardening.test.ts
 */

import fs from "node:fs";
import path from "node:path";
import {
  canUploadTextileEvidence,
  canSetTextileEvidenceStatus,
  isTextileEvidencePathForOrg,
} from "../../lib/domain/textiles-evidences";

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

const MIGRATION = "supabase/migrations/0076_textile_evidences_hardening_and_storage_usage.sql";
const migrationSql = read(MIGRATION);
const actionsSrc = read("server/actions/textiles-evidences.ts");
const domainSrc = read("lib/domain/textiles-evidences.ts");

console.log("\nSprint T5.1 · Hardening de evidencias textiles\n");

// ---------------------------------------------------------------------------
console.log("— Migración 0076: alcance —");

check("1. Existe 0076 y su rango sigue intacto", () => {
  // Actualizado en T5.2 (misma deriva de pins que en T2.1/T4/T5): se fija
  // solo el rango propio; 0077+ son sprints legítimos posteriores.
  assert(fs.existsSync(path.join(root, MIGRATION)), "falta 0076");
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 76);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0076_textile_evidences_hardening_and_storage_usage.sql"]),
    `el rango 0076 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. No crea tablas nuevas ni objetos fuera de alcance", () => {
  assert(!/create table/i.test(migrationSql), "0076 no debía crear tablas");
  assert(!/drop table|drop view|drop function/i.test(migrationSql), "0076 no debía borrar objetos");
  const lower = migrationSql.toLowerCase();
  // Nota: la vista preservada de 0059 menciona legítimamente tablas CPR
  // (production_orders, input_batches…); lo prohibido son OBJETOS TEXTILES
  // nuevos fuera de alcance y planes por módulo.
  for (const term of ["textile_order", "textile_batch", "textile_lot", "textile_passport", "textile_trazadoc", "textile_circular", "qr_", "module_access", "module_subscription", "textile_claims"]) {
    assert(!lower.includes(term), `0076 menciona "${term}" (fuera de alcance)`);
  }
});

check("3. Solo se recrean políticas de tablas TEXTILES (los drops no tocan CPR)", () => {
  const drops = [...migrationSql.matchAll(/drop policy if exists (\w+) on ([\w.]+);/g)].map((m) => `${m[1]}@${m[2]}`);
  const allowed = [
    "evidences_delete_textiles@storage.objects",
    "textile_evidences_insert@public.textile_evidences",
    "textile_evidences_update@public.textile_evidences",
    "textile_evidence_links_insert@public.textile_evidence_links",
  ];
  assert(
    JSON.stringify(drops.sort()) === JSON.stringify(allowed.sort()),
    `drops inesperados: ${drops.join(", ")}`
  );
  assert(!migrationSql.includes("evidences_select") && !migrationSql.includes("evidences_insert on storage"), "las políticas CPR del bucket no debían tocarse");
});

// ---------------------------------------------------------------------------
console.log("\n— Uso de almacenamiento —");

check("4. La vista de uso suma textile_evidences.file_size_bytes en bytes/MB/porcentaje", () => {
  assert(migrationSql.includes("create or replace view public.v_organization_plan_usage"), "falta la vista");
  assert(/sum\(coalesce\(file_size_bytes, 0\)\)[^)]*\n?\s*from public\.textile_evidences group by organization_id/.test(migrationSql), "falta el join de textile_evidences");
  const occurrences = (migrationSql.match(/coalesce\(tev\.storage_used_bytes, 0\)/g) ?? []).length;
  assert(occurrences === 3, `los bytes textiles debían sumar en storage_used_bytes, _mb y _percent (hay ${occurrences}/3)`);
});

check("5. La vista conserva TODAS las columnas y protecciones de 0059", () => {
  assert(migrationSql.includes("pd.storage_limit_bytes,"), "la vista perdió storage_limit_bytes");
  for (const col of ["plan_code", "plan_status", "storage_used_bytes", "storage_used_mb", "storage_limit_mb", "storage_percent_used", "documents_trazadocs_count", "suppliers_count", "materials_count", "products_count", "evidences_count", "production_orders_count", "input_batches_count", "output_batches_count", "team_members_count", "diagnostic_taken", "imports_count", "tickets_count", "updated_at"]) {
    assert(migrationSql.includes(`as ${col}`), `la vista perdió la columna ${col}`);
  }
  assert(migrationSql.includes("security_barrier = true"), "la vista debía conservar security_barrier");
  assert(migrationSql.includes("is_org_member(o.id) or public.is_platform_staff()"), "la vista debía conservar su RLS embebida");
  assert(migrationSql.includes("revoke all on public.v_organization_plan_usage from public, anon"), "la vista debía conservar el revoke");
  assert(!/as textile_evidences_count/.test(migrationSql), "NO debía agregarse conteo por módulo (planes por módulo prohibidos): solo bytes");
});

// ---------------------------------------------------------------------------
console.log("\n— Storage y huérfanos —");

check("6. Delete de storage SOLO en el prefijo textil, con roles y safe_uuid", () => {
  assert(migrationSql.includes("create policy evidences_delete_textiles on storage.objects"), "falta la política de delete");
  assert(migrationSql.includes("(storage.foldername(name))[2] = 'textiles'"), "el delete debía acotarse al segundo segmento 'textiles' (las rutas CPR siguen sin delete)");
  assert(/safe_uuid\(\(storage\.foldername\(name\)\)\[1\]\)/.test(migrationSql), "el delete debía validar la organización del primer segmento con safe_uuid");
  assert(/evidences_delete_textiles[\s\S]{0,400}array\['admin', 'quality', 'consultant'\]/.test(migrationSql), "el delete debía exigir admin/quality/consultant");
  assert(!/bucket_id = 'evidences'[\s\S]{0,120}public = true|make.*public/i.test(migrationSql), "el bucket debía seguir privado");
});

check("7. La limpieza de huérfanos existe, es tolerante a fallos y no enmascara el error", () => {
  // T9E.1 (carga directa): si el insert de la evidencia falla tras la
  // subida, la finalización retira el objeto (removeTextileEvidenceObject,
  // best-effort sin lanzar) y deja el intento en 'failed' como registro
  // recuperable; la limpieza oportunista corre acotada y en try/catch.
  // T9E.2: firma/objeto inválidos → retiro + intento failed vía RPC; el
  // fallo del insert es imposible de dejar a medias (RPC atómica 0097).
  assert(
    /removeTextileEvidenceObject\(intent\.id\);[\s\S]{0,240}markTextileEvidenceUploadFailedRpc\(intent\.id\)/.test(actionsSrc),
    "falta la limpieza del objeto subido cuando el registro no procede"
  );
  assert(
    /async function cleanupExpiredUploadIntents[\s\S]{0,700}try \{[\s\S]{0,3000}\} catch/.test(actionsSrc),
    "la limpieza oportunista debía ser tolerante a fallos (try/catch)"
  );
  const dbSrc = read("lib/db/textiles-evidences.ts");
  assert(
    /removeTextileEvidenceObject[\s\S]{0,2000}return !error;/.test(dbSrc),
    "el retiro del objeto debía ser best-effort (jamás lanza)"
  );
  assert(actionsSrc.includes('No fue posible registrar la evidencia.'), "el error del registro debía prevalecer");
});

// ---------------------------------------------------------------------------
console.log("\n— RLS y roles endurecidos —");

check("8. Insert/update de evidencias y insert de vínculos exigen admin/quality/consultant", () => {
  assert(/textile_evidences_insert[\s\S]{0,300}has_org_role\(organization_id, array\['admin', 'quality', 'consultant'\]\)[\s\S]{0,120}status = 'pending_review'/.test(migrationSql), "el insert debía exigir rol Y nacer en pending_review");
  assert(/textile_evidences_update[\s\S]{0,300}has_org_role\(organization_id, array\['admin', 'quality', 'consultant'\]\)/.test(migrationSql), "el update debía exigir rol");
  assert(/textile_evidence_links_insert[\s\S]{0,300}has_org_role\(organization_id, array\['admin', 'quality', 'consultant'\]\)/.test(migrationSql), "el insert de vínculos debía exigir rol");
  assert(!/textile_evidence[\s\S]{0,200}for (insert|update)[\s\S]{0,120}is_org_member\(organization_id\)\s*\)/.test(migrationSql), "0076 no debía dejar escrituras de miembro genérico");
});

check("9. Nada se debilitó: guard de revisión, delete de evidencias y select de miembros intactos (0075)", () => {
  const m0075 = read("supabase/migrations/0075_textile_evidences.sql");
  assert(m0075.includes("guard_textile_evidence_review"), "0075 debía seguir intacto (guard)");
  assert(m0075.includes("status <> 'accepted'"), "0075 debía seguir intacto (delete de aceptadas)");
  assert(!migrationSql.includes("drop policy if exists textile_evidences_select") && !migrationSql.includes("drop policy if exists textile_evidences_delete") && !migrationSql.includes("drop policy if exists textile_evidence_links_delete") && !migrationSql.includes("drop policy if exists textile_evidence_links_select"), "select/delete no debían recrearse");
  assert(!migrationSql.includes("guard_textile_evidence_review") || !/create or replace function public\.guard_textile_evidence_review/.test(migrationSql), "el guard de revisión no debía redefinirse");
});

check("10. Dominio y actions: roles de carga y de estado espejados", () => {
  assert(canUploadTextileEvidence("admin") && canUploadTextileEvidence("quality") && canUploadTextileEvidence("consultant"), "admin/quality/consultant debían poder cargar");
  assert(!canUploadTextileEvidence("operator") && !canUploadTextileEvidence(""), "operator no debía poder cargar");
  assert(!canSetTextileEvidenceStatus("consultant"), "consultant sigue sin poder revisar");
  assert(actionsSrc.includes("canUploadTextileEvidence(g.ok.roleCode)"), "las actions debían pre-verificar el rol de carga");
  const uploadChecks = (actionsSrc.match(/canUploadTextileEvidence\(g\.ok\.roleCode\)/g) ?? []).length;
  assert(uploadChecks >= 2, "crear evidencia Y vincular debían pre-verificar el rol");
});

check("11. Signed URLs: jamás se firma una ruta fuera de {org}/textiles/", () => {
  assert(isTextileEvidencePathForOrg("org-1/textiles/ev/f.pdf", "org-1"), "la ruta propia debía ser válida");
  assert(!isTextileEvidencePathForOrg("org-2/textiles/ev/f.pdf", "org-1"), "la ruta de otra organización debía rechazarse");
  assert(!isTextileEvidencePathForOrg("org-1/ev/f.pdf", "org-1"), "una ruta CPR debía rechazarse");
  assert(actionsSrc.includes("isTextileEvidencePathForOrg(evidence.filePath, g.ok.organizationId)"), "la action de signed URL debía verificar el prefijo");
});

// ---------------------------------------------------------------------------
console.log("\n— Documentación y CPR —");

check("12. Los docs enseñan la habilitación con module_code y sin enabled_by", () => {
  const t4 = read("docs/modules/textiles/TEXTILES_T4_PRODUCTS_COMPOSITION_IMPLEMENTATION_REPORT.md");
  const t5 = read("docs/modules/textiles/TEXTILES_T5_EVIDENCES_IMPLEMENTATION_REPORT.md");
  for (const [name, doc] of [["T4", t4], ["T5", t5]] as const) {
    assert(!/insert into organization_modules[^;]*module_key/.test(doc), `${name}: el insert debía usar module_code`);
    assert(!/insert into organization_modules[^;]*enabled_by/.test(doc), `${name}: enabled_by no existe en la tabla`);
    assert(doc.includes("module_code"), `${name}: debía documentar module_code`);
  }
  assert(t4.includes("on conflict (organization_id, module_code)") || t5.includes("on conflict (organization_id,"), "el insert documentado debía ser idempotente");
});

check("13. CPR intacto: bucket, evidencias y actions CPR sin cambios", () => {
  const s0015 = read("supabase/migrations/0015_storage.sql");
  const s0016 = read("supabase/migrations/0016_security_hardening.sql");
  const s0019 = read("supabase/migrations/0019_evidences_base.sql");
  for (const [name, src] of [["0015", s0015], ["0016", s0016], ["0019", s0019]] as const) {
    assert(!src.includes("textiles"), `${name} (CPR) no debía tocarse`);
  }
  assert(!read("server/actions/evidences.ts").includes("textile"), "las actions de evidencias CPR no debían tocarse");
  assert(!read("server/actions/plans.ts").includes("textile"), "plans.ts no debía tocarse (la vista se ajustó por migración)");
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron\n`);
if (failed > 0) process.exit(1);
