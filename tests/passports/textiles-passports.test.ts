/**
 * Trazaloop · Sprint T9A (Textil) · Base técnica del pasaporte técnico
 * textil (0084) — pruebas por inspección de SQL y código.
 * Correr: npx tsx tests/passports/textiles-passports.test.ts
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
  }
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const MIG = "supabase/migrations/0084_textile_technical_passports.sql";
const sql = read(MIG);
const sqlCode = sql
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();
const domainSrc = read("lib/domain/textiles-passport.ts");
const dbSrc = read("lib/db/textiles-passport.ts");

console.log("\nSprint T9A · Modelo de datos y snapshot del pasaporte técnico textil\n");

check("1. Existe 0084 y su rango sigue intacto", () => {
  // Actualizado en T9A.1 (misma deriva de pins de T2.1–T9A): se fija SOLO
  // el slot propio; 0085+ son sprints legítimos posteriores.
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 84);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0084_textile_technical_passports.sql"]),
    `el rango 0084 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. Nombre correcto textile_technical_passports (NO textile_material_passports)", () => {
  assert(sql.includes("create table public.textile_technical_passports ("), "faltó la tabla textile_technical_passports");
  // El nombre antiguo solo puede aparecer en un comentario aclaratorio
  // ("NO usar textile_material_passports"), nunca en el código.
  assert(!/textile_material_passports/i.test(sqlCode), "no debe usarse el nombre antiguo textile_material_passports en el código");
});

check("3. Una sola tabla nueva; sin tocar CPR ni otras tablas del motor", () => {
  const created = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
  assert(JSON.stringify(created) === JSON.stringify(["textile_technical_passports"]), `tablas creadas inesperadas: ${created.join(", ")}`);
  assert(!/trazadoc_|cpr_/i.test(sqlCode.replace(/organization_modules/g, "")), "0084 no debía tocar objetos CPR/TrazaDocs");
});

check("4. Identidad y versionamiento: unique(org,id), unique(org,code,version), check de status y versión positiva", () => {
  assert(sql.includes("constraint textile_passports_org_id_uniq unique (organization_id, id)"), "faltó unique(org,id)");
  assert(sql.includes("unique (organization_id, passport_code, passport_version)"), "faltó unique(org,code,version)");
  assert(sql.includes("check (passport_version >= 1)"), "faltó versión positiva");
  assert(
    sql.includes("check (status in ('draft', 'generated', 'in_review', 'approved_internal', 'obsolete'))"),
    "el ciclo de estados debe ser draft/generated/in_review/approved_internal/obsolete"
  );
  // 'generated' es obligatorio en el ciclo (no debe omitirse).
  assert(/'draft'[^)]*'generated'[^)]*'in_review'[^)]*'approved_internal'[^)]*'obsolete'/.test(sql), "el ciclo debe incluir 'generated'");
});

check("5. FKs compuestas por (organization_id, id) a referencia, lote y evaluación", () => {
  for (const [fk, table] of [
    ["textile_passports_reference_fk", "textile_references"],
    ["textile_passports_output_lot_fk", "textile_output_lots"],
    ["textile_passports_assessment_fk", "textile_circularity_assessments"],
  ] as const) {
    assert(sql.includes(fk), `faltó ${fk}`);
    assert(new RegExp(`references public\\.${table} \\(organization_id, id\\)`).test(sql), `${fk} debía referenciar (organization_id, id) de ${table}`);
  }
});

check("6. Campos de snapshot, fuentes, brechas, advertencias, recomendaciones y hash", () => {
  for (const col of ["snapshot_json", "data_sources_json", "gaps_json", "warnings_json", "recommendations_json", "source_hash"]) {
    assert(new RegExp(`\\b${col}\\b`).test(sql), `faltó la columna ${col}`);
  }
  for (const seal of ["generated_at", "generated_by", "reviewed_at", "reviewed_by", "approved_at", "approved_by", "obsolete_at", "obsolete_by"]) {
    assert(new RegExp(`\\b${seal}\\b`).test(sql), `faltó el sello ${seal}`);
  }
});

check("7. Triggers estándar del módulo (updated/created_by/org inmutable/audit)", () => {
  assert(sql.includes("execute function public.set_updated_at()"), "faltó set_updated_at");
  assert(sql.includes("execute function public.force_created_by()"), "faltó force_created_by");
  assert(sql.includes("execute function public.prevent_organization_id_change()"), "faltó prevent_organization_id_change");
  assert(sql.includes("execute function public.audit_row_change()"), "faltó audit_row_change");
});

check("8. Validación de destino: lote↔referencia y evaluación↔referencia", () => {
  assert(sql.includes("create or replace function public.validate_textile_technical_passport_target()"), "faltó el validador de destino");
  assert(sql.includes("El lote producido del pasaporte debe pertenecer a una orden de la misma referencia."), "faltó la validación lote↔referencia");
  assert(sql.includes("La evaluación de circularidad del pasaporte debe corresponder a la misma referencia."), "faltó la validación evaluación↔referencia");
  assert(/before insert or update on public\.textile_technical_passports\s+for each row execute function public\.validate_textile_technical_passport_target/.test(sql), "faltó el trigger de destino");
});

check("9. Protección del snapshot (patrón T7.1): nace draft vacío, inmutable tras generated, mismo flag sin fijarlo desde el trigger", () => {
  assert(sql.includes("create or replace function public.protect_textile_technical_passport_snapshot()"), "faltó el trigger de protección");
  assert(sql.includes("current_setting('trazaloop.textile_passport_generate', true)"), "el guard no usa el flag interno");
  assert(sql.includes("debe crearse como borrador"), "el INSERT no exige nacer draft");
  assert(sql.includes("no pueden fijarse al crearlo"), "el INSERT no bloquea snapshot/derivados fabricados");
  assert(sql.includes("El snapshot de un pasaporte generado no puede modificarse. Cree una nueva versión."), "el UPDATE no protege el snapshot generado");
  assert(sql.includes("La identidad del pasaporte (referencia, lote, código y versión) no puede cambiarse."), "el UPDATE no protege la identidad");
  // El trigger de protección solo LEE el flag; no debe fijarlo con set_config.
  const protectBody = sql.slice(
    sql.indexOf("function public.protect_textile_technical_passport_snapshot()"),
    sql.indexOf("t_textile_passports_protect_snapshot")
  );
  assert(!protectBody.includes("set_config"), "el trigger de protección no debía fijar el flag");
  assert(sql.includes("revoke execute on function public.protect_textile_technical_passport_snapshot() from public, anon, authenticated"), "faltó el revoke del guard");
});

check("10. RLS deny-by-default con 4 políticas; consultant no actúa fuera de draft/in_review; delete solo admin/quality en draft", () => {
  assert(sql.includes("alter table public.textile_technical_passports enable row level security"), "faltó habilitar RLS");
  for (const pol of ["textile_passports_select", "textile_passports_insert", "textile_passports_update", "textile_passports_delete"]) {
    assert(sql.includes(`create policy ${pol}`), `faltó la política ${pol}`);
  }
  assert(sql.includes("public.is_org_member(organization_id)"), "select debía exigir membresía");
  const del = sql.slice(sql.indexOf("create policy textile_passports_delete"));
  assert(del.includes("has_org_role(organization_id, array['admin','quality'])") && del.includes("status = 'draft'"), "delete debía ser admin/quality solo en draft");
  const upd = sql.slice(sql.indexOf("create policy textile_passports_update"), sql.indexOf("create policy textile_passports_delete"));
  assert(upd.includes("status in ('draft', 'in_review')"), "consultant solo edita en draft/in_review");
});

check("11. Evidencias: ampliación ADITIVA (technical_passport + passport_support) sin perder valores previos", () => {
  // entity_type: 17 previos + technical_passport = 18.
  const entityBlock = sql.slice(sql.indexOf("add constraint textile_evidence_links_entity_check"), sql.indexOf("add constraint textile_evidence_links_type_check"));
  const entities = [...entityBlock.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  for (const prev of ["supplier", "material", "reference", "output_lot", "circularity_assessment"]) {
    assert(entities.includes(prev), `la ampliación perdió el entity_type previo ${prev}`);
  }
  assert(entities.includes("technical_passport"), "faltó añadir entity_type technical_passport");
  assert(sql.includes("'passport_support'"), "faltó añadir link_type passport_support");
  // La familia específica passport_* se completa en 0086 (T9A.2).
  // El validador de organización resuelve el nuevo tipo.
  assert(sql.includes("when 'technical_passport' then select organization_id into v_target_org from textile_technical_passports"), "validate_..._org no resuelve technical_passport");
  assert(sql.includes("La evidencia y la entidad vinculada deben pertenecer a la misma organización"), "el validador perdió el chequeo cross-tenant");
});

check("12. RPC de generación base: schema_version obligatorio, verifica módulo+rol+estado, escribe bajo flag y pasa a generated", () => {
  assert(sql.includes("create or replace function public.generate_textile_technical_passport_base(p_passport_id uuid)"), "faltó la RPC de generación base");
  assert(sql.includes("'schema_version', 'textile_technical_passport_v1'"), "el snapshot base debe incluir schema_version=textile_technical_passport_v1");
  assert(sql.includes("module_code = 'textiles' and enabled"), "la RPC no verifica el módulo Textil habilitado");
  assert(sql.includes("has_org_role(v_org, array['admin','quality','consultant'])"), "la RPC no verifica rol");
  assert(sql.includes("perform set_config('trazaloop.textile_passport_generate', 'on', true)"), "la RPC no activa el flag");
  assert(sql.includes("status = 'generated'"), "la RPC no pasa el pasaporte a generated");
  assert(sql.includes("generated_by = auth.uid()"), "el sello generated_by debe fijarlo el servidor con auth.uid()");
  assert(sql.includes("grant execute on function public.generate_textile_technical_passport_base(uuid) to authenticated"), "faltó el grant a authenticated");
});

check("13. RPC de transición: transiciones válidas, roles y sellos atómicos; aprobación interna nunca externa", () => {
  assert(sql.includes("create or replace function public.change_textile_technical_passport_status("), "faltó la RPC de transición");
  assert(sql.includes("Solo un pasaporte generado puede enviarse a revisión."), "faltó la guarda generated→in_review");
  assert(sql.includes("Solo administración o calidad pueden aprobar internamente el pasaporte."), "aprobar internamente debe ser admin/quality");
  assert(sql.includes("approved_by = case when p_to_status = 'approved_internal' then auth.uid()"), "el sello approved_by debe fijarlo el servidor");
  assert(sql.includes("grant execute on function public.change_textile_technical_passport_status(uuid, text) to authenticated"), "faltó el grant a authenticated");
});

check("14. Sin service_role, sin debilitar RLS de otros módulos, sin alcance prohibido", () => {
  assert(!sqlCode.includes("service_role"), "0084 no debía usar service_role");
  assert(!/\b(create|alter|drop)\s+policy\b(?![^;]*textile_passports)/i.test(sql), "0084 solo debía crear políticas del pasaporte");
  for (const banned of ["qr_code", "public_portal", "\\bpdf\\b", "\\bia_", "carbon", "module_subscription", "digital_signature"]) {
    assert(!new RegExp(banned, "i").test(sqlCode), `0084 contiene alcance prohibido: ${banned}`);
  }
});

check("15. Helpers de dominio/DB base: schema_version, estados, disclaimer y RPCs envueltas", () => {
  assert(domainSrc.includes('export const TEXTILE_PASSPORT_SCHEMA_VERSION = "textile_technical_passport_v1"'), "faltó la constante de schema_version");
  assert(domainSrc.includes('"draft",') && domainSrc.includes('"generated",') && domainSrc.includes('"approved_internal",'), "faltó el ciclo de estados en el dominio");
  assert(domainSrc.includes("No equivale a certificación, sello, declaración regulatoria oficial ni\n  \"pasaporte digital de producto oficial.") || domainSrc.includes("pasaporte digital de producto oficial."), "faltó el disclaimer");
  assert(dbSrc.includes('rpc("generate_textile_technical_passport_base"'), "la capa DB no envuelve la RPC de generación");
  assert(dbSrc.includes('rpc("change_textile_technical_passport_status"'), "la capa DB no envuelve la RPC de transición");
});

check("16. Lenguaje prudente: sin promesas ni la palabra vetada; ESPR como 'ESPR (UE) 2024/1781'", () => {
  assert(!/reglamento/i.test(sql), "0084 no debe usar la palabra vetada (el ESPR se cita como 'ESPR (UE) 2024/1781')");
  for (const term of ["certificación garantizada", "cumple automáticamente", "pasaporte oficial", "dpp oficial", "sello garantizado", "listo para certificar"]) {
    assert(!sql.toLowerCase().includes(term), `texto prohibido en 0084: ${term}`);
  }
  assert(sql.includes("No equivale a certificación, sello, declaración regulatoria oficial ni pasaporte digital de producto oficial."), "el snapshot base debe llevar la advertencia obligatoria");
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
