/**
 * Trazaloop · Sprint T9B.2 (Textil) · Cierre de fuentes, evidencias y warnings
 * del snapshot del pasaporte técnico textil (0090) — inspección SQL/código.
 * Correr: npx tsx tests/passports/textiles-passports-snapshot-closure.test.ts
 *
 * Valida los CINCO cierres sobre T9B.1 (0089):
 *   1. snapshot_json.sections.evidences.items incluye evidencias de production_order,
 *      order_process_step, circularity_assessment y technical_passport, con
 *      metadata completa (sin signed URLs);
 *   2. data_sources_json.source_records.evidence_links explícito;
 *   3. data_sources_json.source_records.process_steps explícito;
 *   4. warning PAS-TRACE-005 (orden sin pasos) en warnings + sección + resumen;
 *   5. composición no documentada normalizada a PAS-COMP-002.
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

const MIG = "supabase/migrations/0090_textile_technical_passport_snapshot_sources_closure.sql";
const sql = read(MIG);
const sqlCode = sql
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();
const domainSrc = read("lib/domain/textiles-passport.ts");

// Valores REALES verificados contra 0075/0078/0084 (no se inventan).
const REAL_ENTITY_TYPES = [
  "supplier", "material", "component", "process", "outsourced_process",
  "collection", "product", "reference", "fiber_composition",
  "reference_material", "reference_component", "production_order", "input_lot",
  "order_consumption", "order_process_step", "output_lot",
  "circularity_assessment", "technical_passport",
];

console.log("\nSprint T9B.2 · Cierre de fuentes, evidencias y warnings del snapshot\n");

check("1. Existe 0090 y su slot sigue intacto", () => {
  // Actualizado en T9B.3 (misma deriva de pins de T2.1–T9B.2): slot propio 90.
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 90);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0090_textile_technical_passport_snapshot_sources_closure.sql"]),
    `el slot 0090 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. Solo redefine la RPC del snapshot: sin tablas, políticas ni otras funciones", () => {
  assert(!/create\s+table|drop\s+table|alter\s+table|create\s+policy|alter\s+policy|drop\s+policy|create\s+(or\s+replace\s+)?view/.test(sqlCode), "0090 solo debía redefinir la RPC");
  const fns = [...sql.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]);
  assert(JSON.stringify(fns) === JSON.stringify(["generate_textile_technical_passport_full_snapshot"]), `funciones inesperadas: ${fns.join(", ")}`);
  assert(sql.includes("grant execute on function public.generate_textile_technical_passport_full_snapshot(uuid) to authenticated"), "faltó el grant a authenticated");
});

check("3. FIX #1: snapshot.sections.evidences.items cubre TODAS las entidades del pasaporte", () => {
  // El CTE de evidencias visibles debe incluir las cuatro entidades nuevas.
  const linked = sql.slice(sql.indexOf("with linked as"), sql.indexOf("into v_sec_evidences"));
  for (const et of ["production_order", "order_process_step", "circularity_assessment", "technical_passport"]) {
    assert(linked.includes(`'${et}'`), `snapshot.evidences no considera la entidad ${et}`);
  }
  // Y las de T9B.1 siguen presentes.
  for (const et of ["reference", "fiber_composition", "material", "reference_material", "component", "reference_component", "output_lot"]) {
    assert(linked.includes(`'${et}'`), `snapshot.evidences perdió la entidad ${et}`);
  }
});

check("4. FIX #1: cada evidencia visible lleva metadata completa (sin signed URLs ni file_path)", () => {
  const items = sql.slice(sql.indexOf("'items', coalesce(jsonb_agg(jsonb_build_object("));
  for (const field of ["'evidence_id'", "'title'", "'evidence_type'", "'status'", "'entity_type'", "'entity_id'", "'link_type'", "'document_date'", "'valid_until'", "'file_name'", "'created_at'", "'updated_at'"]) {
    assert(items.includes(field), `los ítems de evidencia no incluyen ${field}`);
  }
  assert(!/signed[_ ]?url|file_path/i.test(sqlCode), "el snapshot no debe exponer signed URLs ni file_path");
  assert(sql.includes("La aceptación interna de una evidencia no equivale a certificación externa"), "falta el disclaimer de evidencias");
});

check("5. entity_type usados son reales (no se inventan)", () => {
  const used = [...sql.matchAll(/el\.entity_type\s*(?:=|in)\s*\(?'([a-z_]+)'/g)].map((m) => m[1]);
  const usedSet = new Set(used);
  for (const et of usedSet) {
    assert(REAL_ENTITY_TYPES.includes(et), `entity_type inexistente usado: ${et}`);
  }
  assert(usedSet.size > 0, "no se detectaron entity_type (¿cambió la forma de la consulta?)");
});

check("6. FIX #2: data_sources_json.source_records.evidence_links explícito", () => {
  assert(sql.includes("'source_records'"), "falta la colección source_records");
  const el = sql.slice(sql.indexOf("'evidence_links'"));
  assert(sql.includes("'evidence_links'"), "falta source_records.evidence_links");
  for (const field of ["'table', 'textile_evidence_links'", "'id', el.id", "'evidence_id', el.evidence_id", "'entity_type', el.entity_type", "'entity_id', el.entity_id", "'link_type', el.link_type", "'created_at', el.created_at"]) {
    assert(el.includes(field), `evidence_links no registra ${field}`);
  }
});

check("7. FIX #3: data_sources_json.source_records.process_steps explícito (nombres reales)", () => {
  const ps = sql.slice(sql.indexOf("'process_steps', case"));
  assert(sql.includes("'process_steps'"), "falta source_records.process_steps");
  for (const field of ["'table', 'textile_order_process_steps'", "'id', ps.id", "'order_id', ps.order_id", "'step_type', ps.step_type", "'process_id', ps.process_id", "'outsourced_process_id', ps.outsourced_process_id", "'status', ps.status", "'planned_date', ps.planned_date", "'completed_date', ps.completed_date", "'created_at', ps.created_at", "'updated_at', ps.updated_at"]) {
    assert(ps.includes(field), `process_steps no registra ${field}`);
  }
  // No debe usar nombres inexistentes.
  assert(!/started_at|finished_at|process_type/.test(ps), "process_steps usa nombres inexistentes (started_at/finished_at/process_type)");
});

check("8. FIX #3(hash): source_hash cubre snapshot + fuentes (incl. source_records)", () => {
  const hashBlock = sql.slice(sql.indexOf("v_hash := encode(digest("));
  for (const part of ["'snapshot', v_snapshot", "'data_sources', v_sources", "'gaps', v_gaps", "'warnings', v_warnings", "'recommendations', v_recs"]) {
    assert(hashBlock.includes(part), `el source_hash no incluye ${part}`);
  }
  // source_records vive dentro de v_sources, así que el hash lo cubre.
  assert(sql.indexOf("'source_records'") < sql.indexOf("v_hash := encode(digest("), "source_records debe construirse antes del hash");
});

check("9. FIX #4: warning PAS-TRACE-005 (orden con lote sin pasos de proceso)", () => {
  assert(sql.includes("'PAS-TRACE-005'"), "falta PAS-TRACE-005");
  assert(sql.includes("La orden/corrida asociada al lote producido/final no tiene pasos de proceso documentados."), "falta el mensaje de PAS-TRACE-005");
  // Debe entrar en warnings globales, en la sección y en el resumen.
  assert(/not exists \(\s*\n?\s*select 1 from textile_order_process_steps ps/.test(sql), "PAS-TRACE-005 debe dispararse cuando la orden no tiene pasos");
  assert(sql.includes("jsonb_build_object('warnings', v_trace_items)"), "la sección de trazabilidad debe exponer sus warnings");
  assert(sql.includes("'warnings_summary'"), "el snapshot debe incluir warnings_summary");
});

check("10. FIX #5: composición no documentada normalizada a PAS-COMP-002", () => {
  // not_started ahora emite PAS-COMP-002 (info).
  assert(sql.includes("'PAS-COMP-002', 'severity', 'info'") && sql.includes("Referencia sin composición documentada"),
    "composición no documentada debe emitir PAS-COMP-002 (info)");
  // El caso 'excede 100%' se movió a PAS-COMP-003 (warning).
  assert(sql.includes("'PAS-COMP-003', 'severity', 'warning'"), "el caso needs_review debe ser PAS-COMP-003 (warning)");
  // PAS-COMP-001 (no suma 100) intacto.
  assert(sql.includes("'PAS-COMP-001', 'severity', 'critical'"), "PAS-COMP-001 debe seguir siendo critical");
  // No debe quedar el mapeo viejo (not_started → 003 info).
  assert(!/'PAS-COMP-003', 'severity', 'info'/.test(sql), "quedó el mapeo viejo PAS-COMP-003 info");
});

check("11. Solo lectura + única escritura del pasaporte bajo el flag; no toca CPR", () => {
  const writes = [...sql.matchAll(/\b(update|insert into|delete from)\s+(\w+)/gi)].map((m) => `${m[1].toLowerCase()} ${m[2]}`);
  assert(writes.length === 1 && writes[0] === "update textile_technical_passports", `escrituras inesperadas: ${writes.join(", ")}`);
  assert(sql.includes("perform set_config('trazaloop.textile_passport_generate', 'on', true)"), "la escritura debe ir bajo el flag");
  assert(!/trazadoc_documents\s+set|update trazadoc/i.test(sql), "0090 no debía escribir en CPR/TrazaDocs");
  for (const banned of ["qr_code", "public_portal", "\\bpdf\\b", "carbon", "module_subscription"]) {
    assert(!new RegExp(banned, "i").test(sqlCode), `0090 contiene alcance prohibido: ${banned}`);
  }
});

check("12. Helper de dominio: PAS-TRACE-005 en el catálogo de gap codes", () => {
  assert(domainSrc.includes('"PAS-TRACE-005"'), "el dominio no incluye PAS-TRACE-005");
  assert(domainSrc.includes('"PAS-COMP-002"'), "el dominio no incluye PAS-COMP-002");
});

check("13. Lenguaje prudente y disclaimers (con negaciones obligatorias)", () => {
  assert(!/reglamento/i.test(sql), "0090 no debe usar la palabra vetada");
  const scanning = sql.split("\n").filter((l) => !/no equivale a/i.test(l)).join("\n").toLowerCase();
  for (const term of ["certificación garantizada", "cumple automáticamente", "pasaporte oficial", "sello garantizado", "producto certificado"]) {
    assert(!scanning.includes(term), `texto prohibido en 0090: ${term}`);
  }
  assert(sql.includes("No equivale a certificación, sello, declaración regulatoria oficial ni pasaporte digital de producto oficial."), "el snapshot debe conservar la advertencia obligatoria");
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
