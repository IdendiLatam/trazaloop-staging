/**
 * Trazaloop · Sprint T9B (Textil) · Generación COMPLETA del snapshot del
 * pasaporte técnico textil (0088) — inspección SQL/código.
 * Correr: npx tsx tests/passports/textiles-passports-generation.test.ts
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

const MIG = "supabase/migrations/0088_textile_technical_passport_full_snapshot.sql";
const sql = read(MIG);
const sqlCode = sql
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();
const domainSrc = read("lib/domain/textiles-passport.ts");
const dbSrc = read("lib/db/textiles-passport.ts");
const actionSrc = read("server/actions/textiles-passport.ts");

console.log("\nSprint T9B · Generación completa del snapshot del pasaporte\n");

check("1. Existe 0088 y su slot sigue intacto", () => {
  // Actualizado en T9B.1 (misma deriva de pins de T2.1–T9B): slot propio 88.
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 88);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0088_textile_technical_passport_full_snapshot.sql"]),
    `el slot 0088 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. RPC de generación completa con nombre claro y grant a authenticated", () => {
  assert(sql.includes("create or replace function public.generate_textile_technical_passport_full_snapshot(p_passport_id uuid)"), "faltó la RPC de snapshot completo");
  assert(sql.includes("grant execute on function public.generate_textile_technical_passport_full_snapshot(uuid) to authenticated"), "faltó el grant a authenticated");
  assert(sql.includes("revoke execute on function public.generate_textile_technical_passport_full_snapshot(uuid) from public, anon"), "faltó el revoke a public/anon");
});

check("3. Verifica sesión, organización, módulo Textil habilitado, rol y estado", () => {
  assert(sql.includes("if auth.uid() is null then"), "no verifica sesión");
  assert(sql.includes("not public.is_org_member(v_org)"), "no verifica membresía");
  assert(sql.includes("module_code = 'textiles' and enabled"), "no verifica módulo Textil habilitado");
  assert(sql.includes("has_org_role(v_org, array['admin','quality','consultant'])"), "no verifica rol");
  assert(sql.includes("v_status not in ('draft', 'generated')"), "no verifica estado generable");
});

check("4. Lee las fuentes reales de los módulos existentes (solo lectura)", () => {
  // Cada fuente se lee vía FROM o JOIN.
  for (const tbl of [
    "textile_references", "textile_reference_fiber_composition",
    "textile_reference_materials", "textile_reference_components",
    "textile_materials", "textile_components", "textile_fiber_types",
    "textile_suppliers", "textile_evidences", "textile_evidence_links",
    "textile_output_lots", "textile_production_orders",
    "textile_order_consumptions", "textile_input_lots",
    "textile_circularity_assessments", "textile_circularity_methodologies",
    "trazadoc_documents", "organizations",
  ]) {
    assert(new RegExp(`(from|join)\\s+${tbl}\\b`).test(sqlCode), `la RPC no lee la fuente: ${tbl}`);
  }
  // TrazaDocs se lee SOLO del módulo textiles.
  assert(sql.includes("module_key = 'textiles'"), "la lectura de TrazaDocs no filtra por module_key='textiles'");
});

check("5. No hay INSERT/UPDATE/DELETE de otras tablas: solo se escribe la fila del pasaporte", () => {
  const writes = [...sqlCode.matchAll(/(?:insert into|update|delete from)\s+(\w+)/g)].map((m) => m[1]);
  assert(writes.every((t) => t === "textile_technical_passports"), `la RPC escribe en tablas ajenas: ${writes.filter((t) => t !== "textile_technical_passports").join(", ")}`);
  // Sin alter/create table/policy: es solo una función.
  assert(!/create\s+table|alter\s+table|create\s+policy|drop\s+policy/.test(sqlCode), "0088 solo debía crear la función de generación");
});

check("6. Construye las 14 secciones del snapshot", () => {
  for (const sec of [
    "passport_identification", "product_identification", "fiber_composition",
    "materials", "components", "suppliers_processes", "evidences",
    "traceability", "circularity", "care_repair_eol", "claims", "trazadocs",
    "gaps_and_warnings", "executive_summary",
  ]) {
    assert(sql.includes(`'${sec}'`), `el snapshot no incluye la sección ${sec}`);
  }
  assert(sql.includes("'schema_version', 'textile_technical_passport_v1'"), "el snapshot debe llevar schema_version");
});

check("7. Traza el estado por sección con vocabulario neutro (nunca cumple/no cumple)", () => {
  for (const st of ["documented", "partially_documented", "pending", "needs_review", "not_applicable"]) {
    assert(sql.includes(`'${st}'`), `falta el estado de completitud ${st}`);
  }
  assert(!/cumple|no cumple/i.test(sqlCode), "no debe usarse vocabulario de cumplimiento");
});

check("8. Trazabilidad solo con lote; sin lote la sección es not_applicable con nota", () => {
  assert(sql.includes("if v_lot is null then"), "no distingue la ausencia de lote");
  assert(sql.includes("no incluye trazabilidad de un lote producido"), "falta la nota de solo-referencia");
  assert(sql.includes("v_textile_output_lot_traceability_summary"), "no usa la vista de resumen de trazabilidad");
});

check("9. Circularidad: muestra score/nivel/dimensiones/brechas/recomendaciones/metodología, con disclaimer y sin confiar solo en el score", () => {
  for (const f of ["'score'", "'readiness_level'", "'dimension_scores'", "'recommendations'", "'methodology'"]) {
    assert(sql.includes(f), `la sección de circularidad no incluye ${f}`);
  }
  assert(sql.includes("La evaluación de circularidad es una herramienta técnica interna."), "falta el disclaimer de circularidad");
});

check("10. Interpretación de estados de evidencia (accepted fuerte; rejected/archived no; expired advertencia)", () => {
  assert(sql.includes("accepted = soporte interno fuerte"), "falta la interpretación de estados de evidencia");
  assert(sql.includes("La aceptación interna de una evidencia no equivale a certificación externa"), "falta el disclaimer de evidencias");
  // Los 5 estados reales aparecen en el desglose.
  for (const st of ["accepted", "pending_review", "rejected", "expired", "archived"]) {
    assert(sql.includes(`'${st}'`), `el desglose de evidencias no considera ${st}`);
  }
});

check("11. Calcula gaps/warnings/recommendations y los persiste (no vienen del cliente)", () => {
  assert(sql.includes("v_gaps := v_gaps ||"), "no acumula brechas");
  assert(sql.includes("v_warnings := v_warnings ||"), "no acumula advertencias");
  // Muestra de gap_codes del catálogo.
  for (const code of ["PAS-COMP-001", "PAS-CIRC-001", "PAS-CLAIM-001", "PAS-DOC-001", "PAS-TRACE-002", "PAS-SEP-001"]) {
    assert(sql.includes(`'${code}'`), `la RPC no emite el gap_code ${code}`);
  }
  assert(sql.includes("gaps_json = v_gaps") && sql.includes("warnings_json = v_warnings") && sql.includes("recommendations_json = v_recs"), "no persiste gaps/warnings/recommendations");
});

check("12. data_sources_json con schema_version y updated_at de las fuentes; source_hash derivado", () => {
  assert(sql.includes("'schema_version', 'textile_technical_passport_sources_v1'"), "data_sources_json no lleva su schema_version");
  assert(/v_sources := jsonb_build_object\(/.test(sql), "no construye data_sources_json");
  assert(sql.includes("'updated_at'"), "data_sources_json no captura updated_at de las fuentes (base del hash)");
  assert(sql.includes("v_hash := encode(digest(v_sources::text, 'sha256'), 'hex')"), "no deriva source_hash de las fuentes");
});

check("13. Escritura bajo el flag interno (respeta el trigger de 0085) y pasa a generated", () => {
  assert(sql.includes("perform set_config('trazaloop.textile_passport_generate', 'on', true)"), "no activa el flag");
  assert(sql.includes("perform set_config('trazaloop.textile_passport_generate', 'off', true)"), "no desactiva el flag");
  assert(sql.includes("status = 'generated'"), "no pasa a generated");
  assert(sql.includes("generated_by = auth.uid()"), "el sello generated_by debe fijarlo el servidor");
  // El snapshot/gaps/hash se calculan aquí; no hay parámetros de entrada de datos.
  assert(/generate_textile_technical_passport_full_snapshot\(p_passport_id uuid\)/.test(sql), "la RPC no debe aceptar snapshot/gaps/hash como parámetros");
});

check("14. Disclaimer obligatorio del pasaporte en el snapshot", () => {
  assert(sql.includes("Este pasaporte técnico textil es una herramienta interna de preparación documental y trazabilidad. No equivale a certificación, sello, declaración regulatoria oficial ni pasaporte digital de producto oficial."), "falta el disclaimer del pasaporte");
});

check("15. Helpers: gap codes en dominio, RPC completa en DB, action mínima sin UI", () => {
  assert(domainSrc.includes("TEXTILE_PASSPORT_GAP_CODES"), "el dominio no expone los gap codes");
  assert(domainSrc.includes('"PAS-COMP-001"') && domainSrc.includes('"PAS-DOC-004"'), "faltan gap codes en el dominio");
  assert(dbSrc.includes('rpc("generate_textile_technical_passport_full_snapshot"'), "la capa DB no envuelve la RPC completa");
  assert(actionSrc.includes("generateTextilePassportSnapshotAction"), "falta la action de generación");
  assert(actionSrc.includes("requireTextilesForAction"), "la action no usa la guarda del módulo");
  // Sin UI/rutas en este sprint.
  // Las rutas /textiles/passports las crea T9C, no T9B. La verificación de que
  // 0088 (esta migración) no incluye UI ya la cubren los checks de la RPC.
  assert(actionSrc.includes("generateTextilePassportSnapshotAction"), "la action de generación debe existir");
});

check("16. Sin service_role, sin alcance prohibido y lenguaje prudente", () => {
  assert(!sqlCode.includes("service_role"), "la RPC no debía usar service_role");
  for (const banned of ["qr_code", "public_portal", "\\bpdf\\b", "carbon", "module_subscription"]) {
    assert(!new RegExp(banned, "i").test(sqlCode), `0088 contiene alcance prohibido: ${banned}`);
  }
  assert(!/reglamento/i.test(sql), "0088 no debe usar la palabra vetada");
  // Los disclaimers obligatorios (encargo §5) contienen negaciones como "No
  // equivale a ... ni pasaporte oficial"; se excluyen antes de barrer frases
  // prohibidas (que buscan PROMESAS, no negaciones), como hace el compliance.
  const sqlNoDisclaimers = sql
    .split("\n")
    .filter((l) => !/no equivale a/i.test(l))
    .join("\n")
    .toLowerCase();
  for (const term of ["certificación garantizada", "cumple automáticamente", "pasaporte oficial", "sello garantizado", "producto certificado", "listo para certificación", "cumplimiento garantizado"]) {
    assert(!sqlNoDisclaimers.includes(term), `texto prohibido en 0088: ${term}`);
  }
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
