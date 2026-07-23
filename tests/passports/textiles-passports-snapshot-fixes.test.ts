/**
 * Trazaloop · Sprint T9B.1 (Textil) · Corrección funcional del snapshot
 * completo del pasaporte técnico textil (0089) — inspección SQL/código.
 * Correr: npx tsx tests/passports/textiles-passports-snapshot-fixes.test.ts
 *
 * Valida las SEIS correcciones sobre T9B (0088):
 *   1. composición POR ALCANCE real (no component_scope='main');
 *   2. recommendations_json estructurado (objetos con forma estable);
 *   3. evidencias con completitud honesta y estados reales;
 *   4. suppliers sin jsonb_agg(distinct jsonb_build_object) frágil +
 *      data_sources.evidences de todas las entidades;
 *   5. cuidado/fin de vida refleja separabilidad;
 *   6. gaps_and_warnings con conteo por severidad + resumen ejecutivo
 *      derivado. Además: circularidad auto-selecciona la última completed;
 *      trazabilidad incluye pasos de proceso; source_hash sobre todo el
 *      resultado.
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

const MIG = "supabase/migrations/0089_textile_technical_passport_snapshot_fixes.sql";
const sql = read(MIG);
const sqlLower = sql.toLowerCase();
const sqlCode = sql
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();
const domainSrc = read("lib/domain/textiles-passport.ts");

console.log("\nSprint T9B.1 · Corrección funcional del snapshot completo del pasaporte\n");

check("1. Existe 0089 y su slot sigue intacto", () => {
  // Actualizado en T9B.2 (misma deriva de pins de T2.1–T9B.1): slot propio 89.
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 89);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0089_textile_technical_passport_snapshot_fixes.sql"]),
    `el slot 0089 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. Solo redefine la RPC del snapshot completo: sin tablas, políticas ni otras funciones", () => {
  assert(!/create\s+table|drop\s+table|alter\s+table|create\s+policy|alter\s+policy|drop\s+policy|create\s+(or\s+replace\s+)?view/.test(sqlCode), "0089 solo debía redefinir la RPC");
  const fns = [...sql.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]);
  assert(JSON.stringify(fns) === JSON.stringify(["generate_textile_technical_passport_full_snapshot"]), `funciones inesperadas: ${fns.join(", ")}`);
  assert(sql.includes("grant execute on function public.generate_textile_technical_passport_full_snapshot(uuid) to authenticated"), "faltó el grant a authenticated");
});

check("3. FIX #1: composición POR ALCANCE real, sin component_scope='main'", () => {
  assert(!sqlCode.includes("component_scope = 'main'"), "sigue usando el valor inexistente component_scope='main'");
  // El literal 'main' EXACTO en el CÓDIGO (excluye comentarios y 'main_fabric',
  // que sí es un alcance real).
  assert(!/'main'/.test(sqlCode), "no debe aparecer el literal 'main' como alcance (distinto de 'main_fabric')");
  // Regla del dominio/0080: agrupar por component_scope y validar 100 ± 0,5.
  assert(/group by component_scope/.test(sqlLower), "la composición debe agruparse por component_scope");
  assert(/between 99\.5 and 100\.5/.test(sql), "debe validarse la suma 100 ± 0,5 por alcance");
  assert(/bool_and\(s\.total between 99\.5 and 100\.5\)/.test(sql), "debe usar bool_and por alcance (regla del dominio)");
  // Estados coherentes.
  for (const st of ["not_started", "complete", "needs_review", "incomplete"]) {
    assert(sql.includes(`'${st}'`), `falta el estado de composición ${st}`);
  }
});

check("4. FIX #2: recommendations_json ESTRUCTURADO con forma estable (nunca strings sueltos)", () => {
  // No debe empujarse texto plano con to_jsonb(...text).
  assert(!/v_recs := v_recs \|\| to_jsonb\(/.test(sql), "las recomendaciones no pueden ser strings sueltos (to_jsonb de texto)");
  // Cada recomendación es un objeto con la forma obligatoria.
  assert(sql.includes("'recommendation_code'"), "falta recommendation_code");
  assert(sql.includes("'related_gap_code'"), "falta related_gap_code");
  assert((sql.match(/'priority'/g) ?? []).length >= 4, "cada recomendación debe declarar priority");
  // No queda el formato viejo {code, ...}.
  assert(!/v_recs := v_recs \|\| jsonb_build_object\(\s*'code'/.test(sql), "quedó una recomendación con el formato viejo {code}");
});

check("5. FIX #3: evidencias con completitud honesta y estados reales", () => {
  // 'documented' exige aceptada Y ninguna rechazada/vencida.
  assert(/count\(\*\) filter \(where status = 'accepted'\) > 0\s*\n?\s*and count\(\*\) filter \(where status in \('rejected','expired'\)\) = 0 then 'documented'/.test(sql), "'documented' debe exigir aceptada y ninguna rechazada/vencida");
  // Desglose por estado real.
  for (const st of ["accepted", "pending_review", "rejected", "expired", "archived"]) {
    assert(sql.includes(`'${st}',`) || sql.includes(`'${st}')`), `falta el estado de evidencia ${st} en el desglose`);
  }
  assert(sql.includes("support_strength"), "debe exponerse la fuerza del soporte por evidencia");
  assert(sql.includes("La aceptación interna de una evidencia no equivale a certificación externa"), "falta el disclaimer de evidencias");
});

check("6. FIX #4: suppliers sin jsonb_agg(distinct jsonb_build_object) frágil + data_sources.evidences completo", () => {
  // La lista de proveedores se materializa distinta ANTES de agregar.
  assert(!/jsonb_agg\(distinct jsonb_build_object\([^)]*'supplier_type'/.test(sql), "suppliers no debe usar jsonb_agg(distinct jsonb_build_object)");
  assert(/from \(\s*\n?\s*select distinct s\.id, s\.name, s\.supplier_type/.test(sql), "suppliers debe materializar la lista distinta antes de agregar");
  // data_sources.evidences cubre varias entidades, no solo reference.
  const sourcesEvid = sql.slice(sql.indexOf("'evidences', coalesce(("));
  for (const et of ["output_lot", "production_order", "circularity_assessment", "technical_passport"]) {
    assert(sourcesEvid.includes(`'${et}'`), `data_sources.evidences no incluye la entidad ${et}`);
  }
});

check("7. FIX #5: cuidado/fin de vida refleja separabilidad (valores reales)", () => {
  const care = sql.slice(sql.indexOf("5.10 Cuidado"));
  assert(care.includes("separable_components"), "la sección de cuidado debe reflejar separabilidad");
  assert(care.includes("replaceable_components"), "la sección de cuidado debe reflejar reemplazables");
  // Valores reales de separability (no inventados).
  assert(/in \('easy','moderate'\)/.test(care), "separable_components debe usar los valores reales easy/moderate");
  assert(!care.includes("easily_separable"), "no debe usar valores de separabilidad inexistentes");
});

check("8. FIX #6: gaps_and_warnings con conteo por severidad + resumen ejecutivo derivado", () => {
  assert(sql.includes("'by_severity'"), "gaps_and_warnings debe incluir by_severity");
  for (const sev of ["critical", "warning", "improvement", "info"]) {
    assert(sql.includes(`'${sev}',`) || sql.includes(`'${sev}'`), `by_severity debe contar ${sev}`);
  }
  assert(sql.includes("jsonb_array_elements"), "el conteo por severidad debe recorrer los arrays de brechas");
  // preparation_level derivado (no fijo).
  const exec = sql.slice(sql.indexOf("executive_summary"));
  assert(exec.includes("'preparation_level', case"), "el resumen ejecutivo debe derivar preparation_level");
  assert(exec.includes("'needs_review'") && exec.includes("'documented'") && exec.includes("'partially_documented'"), "preparation_level debe cubrir needs_review/documented/partially_documented");
  assert(exec.includes("gap_count") && exec.includes("warning_count") && exec.includes("recommendation_count"), "el resumen debe exponer los conteos");
});

check("9. Circularidad: auto-selección de la última evaluación completed", () => {
  const circ = sql.slice(sql.indexOf("5.9 Circularidad"));
  assert(circ.includes("select id into v_assessment"), "debe auto-seleccionar una evaluación cuando no se fijó");
  assert(/status = 'completed'\s*\n?\s*order by completed_at desc/.test(circ), "debe elegir la completed más reciente por completed_at");
  // draft/in_review sin completed → warning; ninguna → gap.
  assert(circ.includes("status in ('draft','in_review')"), "debe advertir si solo hay draft/in_review");
  assert(circ.includes("'PAS-CIRC-001'"), "debe generar PAS-CIRC-001 si no hay ninguna");
  assert(circ.includes("'PAS-CIRC-002'"), "debe generar PAS-CIRC-002 si solo hay en preparación");
});

check("10. Trazabilidad: incluye pasos de proceso (internos y tercerizados)", () => {
  assert(sql.includes("'process_steps'"), "la trazabilidad debe incluir process_steps");
  assert(sql.includes("from textile_order_process_steps"), "debe leer textile_order_process_steps");
  assert(sql.includes("left join textile_processes"), "debe unir textile_processes");
  assert(sql.includes("left join textile_outsourced_processes"), "debe unir textile_outsourced_processes");
  assert(sql.includes("'PAS-TRACE-004'"), "debe advertir procesos tercerizados sin soporte (PAS-TRACE-004)");
});

check("11. FIX #5(hash): source_hash depende de snapshot+data_sources+gaps+warnings+recommendations", () => {
  const hashBlock = sql.slice(sql.indexOf("v_hash := encode(digest("));
  for (const part of ["'snapshot', v_snapshot", "'data_sources', v_sources", "'gaps', v_gaps", "'warnings', v_warnings", "'recommendations', v_recs"]) {
    assert(hashBlock.includes(part), `el source_hash no incluye ${part}`);
  }
  assert(sql.includes("digest(") && sql.includes("'sha256'"), "el hash debe usar sha256");
});

check("12. Solo lectura de fuentes + única escritura del pasaporte bajo el flag; no toca CPR", () => {
  // La única escritura es el UPDATE del propio pasaporte, bajo el flag.
  const writes = [...sql.matchAll(/\b(update|insert into|delete from)\s+(\w+)/gi)].map((m) => `${m[1].toLowerCase()} ${m[2]}`);
  assert(writes.length === 1 && writes[0] === "update textile_technical_passports", `escrituras inesperadas: ${writes.join(", ")}`);
  assert(sql.includes("perform set_config('trazaloop.textile_passport_generate', 'on', true)"), "la escritura debe ir bajo el flag");
  assert(!/trazadoc_documents\s+set|update trazadoc/i.test(sql), "0089 no debía escribir en CPR/TrazaDocs");
  // No implementa UI/PDF/QR/IA/ACV/carbono.
  for (const banned of ["qr_code", "public_portal", "\\bpdf\\b", "\\bia_", "carbon", "signed url", "signedurl"]) {
    assert(!new RegExp(banned, "i").test(sqlCode), `0089 contiene alcance prohibido: ${banned}`);
  }
});

check("13. Helper de dominio: recomendaciones estructuradas y prioridades", () => {
  assert(domainSrc.includes("TEXTILE_PASSPORT_RECOMMENDATION_PRIORITIES"), "faltan las prioridades de recomendación en el dominio");
  assert(domainSrc.includes("TextilePassportRecommendation"), "falta el tipo TextilePassportRecommendation");
  for (const field of ["recommendation_code", "related_gap_code", "priority"]) {
    assert(domainSrc.includes(field), `el tipo de recomendación no expone ${field}`);
  }
});

check("14. Lenguaje prudente y disclaimers", () => {
  assert(!/reglamento/i.test(sql), "0089 no debe usar la palabra vetada");
  // Excluir líneas de negación antes de barrer 'pasaporte oficial'.
  const scanning = sql.split("\n").filter((l) => !/no equivale a/i.test(l)).join("\n").toLowerCase();
  for (const term of ["certificación garantizada", "cumple automáticamente", "pasaporte oficial", "sello garantizado"]) {
    assert(!scanning.includes(term), `texto prohibido en 0089: ${term}`);
  }
  assert(sql.includes("No equivale a certificación, sello, declaración regulatoria oficial ni pasaporte digital de producto oficial."), "el snapshot debe conservar la advertencia obligatoria");
  assert(sql.includes("La evaluación de circularidad es una herramienta técnica interna."), "falta el disclaimer de circularidad");
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
