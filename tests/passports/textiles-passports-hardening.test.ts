/**
 * Trazaloop · Sprint T9A.1 (Textil) · Hardening de estados, snapshot y
 * vínculos del pasaporte técnico textil (0085) — inspección SQL/código.
 * Correr: npx tsx tests/passports/textiles-passports-hardening.test.ts
 *
 * Riesgo cerrado: el guard de 0084 protegía snapshot/sellos SOLO cuando
 * old.status <> 'draft'. Un UPDATE directo (rol legítimo, API de Supabase)
 * sobre un pasaporte EN 'draft' podía fijar status='approved_internal' +
 * snapshot_json, source_hash y sellos generated/approved fabricados,
 * esquivando las RPCs controladas.
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

const MIG = "supabase/migrations/0085_textile_technical_passport_state_hardening.sql";
const sql = read(MIG);
const sqlCode = sql
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();
const base = read("supabase/migrations/0084_textile_technical_passports.sql");

console.log("\nSprint T9A.1 · Hardening de estados, snapshot y vínculos del pasaporte\n");

check("1. Existe 0085 y su rango sigue intacto", () => {
  // Actualizado en T9A.2 (misma deriva de pins de T2.1–T9A.1): slot propio.
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 85);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0085_textile_technical_passport_state_hardening.sql"]),
    `el rango 0085 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. Solo redefine funciones + un trigger nuevo: sin tablas, sin políticas, sin columnas, sin alcance prohibido", () => {
  assert(!/create\s+table|drop\s+table|alter\s+table|create\s+policy|alter\s+policy|drop\s+policy|create\s+(or\s+replace\s+)?view/.test(sqlCode), "0085 solo debía redefinir funciones y crear el trigger de coherencia");
  const fns = [...sql.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]);
  assert(
    JSON.stringify(fns.sort()) === JSON.stringify([
      "protect_textile_technical_passport_snapshot",
      "validate_textile_passport_evidence_link_type",
    ]),
    `funciones inesperadas: ${fns.join(", ")}`
  );
  for (const banned of ["qr_code", "public_portal", "\\bpdf\\b", "carbon", "module_subscription", "digital_signature"]) {
    assert(!new RegExp(banned, "i").test(sqlCode), `0085 contiene alcance prohibido: ${banned}`);
  }
});

check("3. No toca CPR ni la generación completa: solo el guard del pasaporte y el validador de sus vínculos", () => {
  assert(!/trazadoc_|cpr_/i.test(sqlCode.replace(/organization_modules/g, "")), "0085 no debía tocar objetos CPR/TrazaDocs");
  // No implementa builder de fuentes (eso es T9B): no lee tablas de datos.
  assert(!/from textile_reference_fiber_composition|from textile_input_lots|jsonb_build_object\('sections'/i.test(sql), "0085 no debía construir el snapshot completo (T9B)");
});

check("4. NÚCLEO: fuera del flag, el estado NO cambia por UPDATE directo — en ningún estado, incluido draft", () => {
  const body = sql.slice(sql.indexOf("function public.protect_textile_technical_passport_snapshot"));
  assert(body.includes("if new.status is distinct from old.status then"), "el guard no bloquea el cambio de estado por UPDATE directo");
  assert(body.includes("El estado del pasaporte solo puede cambiarse mediante el flujo controlado"), "falta el mensaje de estado controlado");
  // La comprobación de estado NO está condicionada a old.status <> 'draft'
  // (ese era el hueco). Debe evaluarse incondicionalmente tras el INSERT.
  const updatePart = body.slice(body.indexOf("-- UPDATE"));
  const statusIdx = updatePart.indexOf("new.status is distinct from old.status");
  const guardedDraftIdx = updatePart.indexOf("old.status is distinct from 'draft'");
  assert(statusIdx >= 0 && (guardedDraftIdx < 0 || statusIdx < guardedDraftIdx), "el chequeo de estado no debe quedar detrás de una condición old.status<>'draft'");
});

check("5. Snapshot y derivados inmutables por UPDATE directo en CUALQUIER estado (incluido draft)", () => {
  const body = sql.slice(sql.indexOf("-- UPDATE fuera del flag"));
  for (const col of ["snapshot_json", "data_sources_json", "gaps_json", "warnings_json", "recommendations_json", "source_hash"]) {
    assert(new RegExp(`new\\.${col} is distinct from old\\.${col}`).test(body), `el guard no protege ${col} en UPDATE directo`);
  }
  assert(body.includes("no pueden modificarse directamente"), "falta el mensaje de snapshot no modificable directamente");
  // Clave: la protección del snapshot NO está envuelta en `if old.status <>
  // 'draft'` (el hueco de 0084). En 0084 sí lo estaba.
  assert(base.includes("if old.status is distinct from 'draft' then"), "control: 0084 sí condicionaba el snapshot a old.status<>'draft'");
  const snapIdx = body.indexOf("new.snapshot_json is distinct from old.snapshot_json");
  const before = body.slice(0, snapIdx);
  assert(!before.includes("old.status is distinct from 'draft'"), "0085 no debe condicionar la protección del snapshot a old.status<>'draft'");
});

check("6. Los 8 sellos solo los fija el flujo controlado (bloqueados en UPDATE directo)", () => {
  const body = sql.slice(sql.indexOf("-- UPDATE fuera del flag"));
  for (const seal of ["generated_at", "generated_by", "reviewed_at", "reviewed_by", "approved_at", "approved_by", "obsolete_at", "obsolete_by"]) {
    assert(new RegExp(`new\\.${seal} is distinct from old\\.${seal}`).test(body), `el guard no protege el sello ${seal}`);
  }
  assert(body.includes("Los sellos de generación, revisión y aprobación del pasaporte solo los fija el flujo controlado."), "falta el mensaje de sellos controlados");
});

check("7. La escritura legítima sigue habilitada bajo el flag interno (RPCs)", () => {
  assert(sql.includes("current_setting('trazaloop.textile_passport_generate', true)"), "el guard debe respetar el flag de las RPCs");
  assert(sql.includes("return new;"), "bajo el flag el guard debe permitir la escritura");
  // El guard solo LEE el flag; jamás lo fija.
  const protectBody = sql.slice(
    sql.indexOf("function public.protect_textile_technical_passport_snapshot"),
    sql.indexOf("validate_textile_passport_evidence_link_type")
  );
  assert(!protectBody.includes("set_config"), "el guard no debía fijar el flag");
});

check("8. INSERT conserva EXACTAMENTE las reglas de 0084 (nacer draft y vacío)", () => {
  const ins = sql.slice(sql.indexOf("tg_op = 'INSERT'"), sql.indexOf("-- UPDATE fuera del flag"));
  assert(ins.includes("debe crearse como borrador"), "el INSERT debe seguir exigiendo nacer draft");
  assert(ins.includes("no pueden fijarse al crearlo"), "el INSERT debe seguir bloqueando snapshot/sellos fabricados");
});

check("9. Identidad inmutable siempre; lote/evaluación congelados tras generar", () => {
  const body = sql.slice(sql.indexOf("-- UPDATE fuera del flag"));
  assert(body.includes("La identidad del pasaporte (referencia, código y versión) no puede cambiarse."), "falta la inmutabilidad de identidad");
  assert(
    body.includes("El lote y la evaluación de circularidad del pasaporte no pueden cambiarse después de generarlo."),
    "faltó congelar lote/evaluación tras generar"
  );
  // La selección de lote/evaluación en 'draft' sigue permitida (preparación).
  assert(body.includes("old.status <> 'draft'"), "lote/evaluación deben poder seleccionarse mientras el pasaporte está en draft");
});

check("10. Vínculos del pasaporte: validador de coherencia entity×link, acotado a technical_passport", () => {
  assert(sql.includes("create or replace function public.validate_textile_passport_evidence_link_type()"), "faltó el validador de link_type del pasaporte");
  assert(sql.includes("if new.entity_type <> 'technical_passport' then\n    return new;"), "el validador debe NO tocar otros entity_type (CPR y demás intactos)");
  for (const lt of ["passport_support", "composition_support", "traceability_support", "circularity_support", "recycled_claim_support", "organic_claim_support", "care_support", "end_of_life_support"]) {
    assert(sql.includes(`'${lt}'`), `faltó habilitar el link_type de sección ${lt} para el pasaporte`);
  }
  assert(sql.includes("no es válido para un pasaporte técnico textil"), "falta el mensaje de link_type inválido");
  assert(/create trigger t_textile_passport_evidence_link_type\s+before insert or update on public\.textile_evidence_links/.test(sql), "faltó el trigger del validador");
});

check("11. Seguridad de las funciones: search_path y revoke", () => {
  assert((sql.match(/set search_path = public/g) ?? []).length >= 2, "ambas funciones deben fijar search_path");
  assert(sql.includes("revoke execute on function public.protect_textile_technical_passport_snapshot() from public, anon, authenticated"), "faltó revoke del guard de snapshot");
  assert(sql.includes("revoke execute on function public.validate_textile_passport_evidence_link_type() from public, anon, authenticated"), "faltó revoke del validador de vínculos");
});

check("12. Sin service_role, sin debilitar RLS y lenguaje prudente", () => {
  assert(!sqlCode.includes("service_role"), "0085 no debía usar service_role");
  assert(!/enable row level security|disable row level security/.test(sqlCode), "0085 no debía tocar RLS");
  assert(!/reglamento/i.test(sql), "0085 no debe usar la palabra vetada");
  for (const term of ["certificación garantizada", "cumple automáticamente", "pasaporte oficial", "sello garantizado"]) {
    assert(!sql.toLowerCase().includes(term), `texto prohibido en 0085: ${term}`);
  }
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
