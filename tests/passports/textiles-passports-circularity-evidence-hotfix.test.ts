/**
 * Trazaloop · Sprint T9B.3 (Textil) · Hotfix de orden de construcción del
 * snapshot: circularidad auto-seleccionada antes de evidencias (0091) +
 * corrección de la ruta del prompt T9C — inspección SQL/código.
 * Correr: npx tsx tests/passports/textiles-passports-circularity-evidence-hotfix.test.ts
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

const MIG = "supabase/migrations/0091_textile_passport_circularity_evidence_hotfix.sql";
const sql = read(MIG);
const sqlCode = sql
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();
const t9cPrompt = read("docs/modules/textiles/TEXTILES_T9C_READY_PROMPT.md");

console.log("\nSprint T9B.3 · Hotfix circularidad→evidencias + ruta del prompt T9C\n");

check("1. Existe 0091 y su slot sigue intacto", () => {
  // Actualizado en T9D (misma deriva de pins de T2.1–T9B.3): slot propio 91.
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 91);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0091_textile_passport_circularity_evidence_hotfix.sql"]),
    `el slot 0091 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. Hotfix mínimo: solo redefine la RPC (sin tablas, políticas ni otras funciones)", () => {
  assert(!/create\s+table|drop\s+table|alter\s+table|create\s+policy|alter\s+policy|drop\s+policy|create\s+(or\s+replace\s+)?view/.test(sqlCode), "0091 solo debía redefinir la RPC");
  const fns = [...sql.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]);
  assert(JSON.stringify(fns) === JSON.stringify(["generate_textile_technical_passport_full_snapshot"]), `funciones inesperadas: ${fns.join(", ")}`);
  assert(sql.includes("grant execute on function public.generate_textile_technical_passport_full_snapshot(uuid) to authenticated"), "faltó el grant a authenticated");
});

check("3. La evaluación de circularidad se resuelve ANTES de construir las evidencias", () => {
  const idxResolve = sql.indexOf("select ca.id into v_assessment");
  const idxEvidences = sql.indexOf("into v_sec_evidences");
  assert(idxResolve !== -1, "no se encontró la resolución del assessment");
  assert(idxEvidences !== -1, "no se encontró la construcción de evidencias");
  assert(idxResolve < idxEvidences, "la resolución de circularidad debe ir ANTES de las evidencias (bug de T9B.2)");
  // Debe existir UNA sola resolución del assessment, y estar antes de evidencias
  // (no una segunda, vieja, dentro de la sección de circularidad 5.9).
  assert((sql.match(/select ca\.id into v_assessment/g) ?? []).length === 1, "la resolución del assessment debe existir una sola vez");
  const after59 = sql.slice(sql.indexOf("5.9 Circularidad"));
  assert(!/into v_assessment\s*\n\s*from textile_circularity_assessments/.test(after59), "no debe quedar la auto-selección vieja en la sección de circularidad");
});

check("4. La auto-selección usa organización + referencia + completed más reciente", () => {
  const block = sql.slice(sql.indexOf("select ca.id into v_assessment"), sql.indexOf("into v_sec_evidences"));
  assert(/ca\.organization_id = v_org and ca\.reference_id = v_ref and ca\.status = 'completed'/.test(block), "debe filtrar por organización, referencia y status completed");
  assert(/order by ca\.completed_at desc/.test(block), "debe tomar la completed más reciente");
});

check("5. El CTE de evidencias visibles captura evidencias de circularity_assessment", () => {
  const linked = sql.slice(sql.indexOf("with linked as"), sql.indexOf("into v_sec_evidences"));
  assert(/el\.entity_type = 'circularity_assessment' and el\.entity_id = v_assessment/.test(linked), "las evidencias visibles deben incluir las del assessment (manual o auto) vía v_assessment");
  // Debe seguir cubriendo las demás entidades (regresión T9B.2).
  for (const et of ["production_order", "order_process_step", "technical_passport"]) {
    assert(linked.includes(`'${et}'`), `el CTE perdió la entidad ${et}`);
  }
});

check("6. data_sources también usa v_assessment para evidencias y evidence_links", () => {
  // evidences de data_sources incluye circularity_assessment por v_assessment.
  const sourcesEvid = sql.slice(sql.indexOf("'evidences', coalesce(("));
  assert(sourcesEvid.includes("el.entity_type = 'circularity_assessment' and el.entity_id = v_assessment"), "data_sources.evidences no cubre el assessment vía v_assessment");
  // evidence_links igual.
  const el = sql.slice(sql.indexOf("'evidence_links'"));
  assert(el.includes("el.entity_type = 'circularity_assessment' and el.entity_id = v_assessment"), "source_records.evidence_links no cubre el assessment vía v_assessment");
});

check("7. Distingue circularidad manual de auto-seleccionada (flag correcto)", () => {
  assert(sql.includes("v_assessment_manual"), "debe rastrearse si el assessment fue manual");
  assert(/'circularity_assessment_auto_selected', \(v_assessment is not null and not v_assessment_manual\)/.test(sql), "el flag auto_selected debe basarse en si fue manual, no en assessment_code");
});

check("8. Se conservan las brechas de circularidad (PAS-CIRC-001/002) y no se inventa score", () => {
  assert(sql.includes("'PAS-CIRC-001'"), "debe conservarse PAS-CIRC-001 (ninguna evaluación)");
  assert(sql.includes("'PAS-CIRC-002'"), "debe conservarse PAS-CIRC-002 (solo draft/in_review o vinculada en borrador)");
  // El score sale de la evaluación real, no se fabrica.
  assert(sql.includes("'score', ca.circularity_score"), "el score debe leerse de la evaluación real");
});

check("9. Estructura del snapshot intacta: sections.evidences (no se renombra)", () => {
  assert(/'sections', jsonb_build_object\(/.test(sql), "debe conservarse el objeto sections");
  assert(sql.includes("'evidences', v_sec_evidences"), "las evidencias deben seguir bajo sections.evidences");
  assert(sql.includes("'textile_technical_passport_v1'"), "no debe cambiar el schema_version del snapshot");
  assert(sql.includes("'textile_technical_passport_sources_v1'"), "no debe cambiar el schema_version de data_sources");
});

check("10. source_hash sigue cubriendo snapshot + fuentes + gaps + warnings + recomendaciones", () => {
  const hashBlock = sql.slice(sql.indexOf("v_hash := encode(digest("));
  for (const part of ["'snapshot', v_snapshot", "'data_sources', v_sources", "'gaps', v_gaps", "'warnings', v_warnings", "'recommendations', v_recs"]) {
    assert(hashBlock.includes(part), `el source_hash no incluye ${part}`);
  }
});

check("11. Escritura única bajo el flag; no toca CPR; sin alcance prohibido", () => {
  const writes = [...sql.matchAll(/\b(update|insert into|delete from)\s+(\w+)/gi)].map((m) => `${m[1].toLowerCase()} ${m[2]}`);
  assert(writes.length === 1 && writes[0] === "update textile_technical_passports", `escrituras inesperadas: ${writes.join(", ")}`);
  assert(sql.includes("perform set_config('trazaloop.textile_passport_generate', 'on', true)"), "la escritura debe ir bajo el flag");
  assert(!/trazadoc_documents\s+set|update trazadoc/i.test(sql), "0091 no debía escribir en CPR/TrazaDocs");
  for (const banned of ["qr_code", "public_portal", "\\bpdf\\b", "carbon", "module_subscription"]) {
    assert(!new RegExp(banned, "i").test(sqlCode), `0091 contiene alcance prohibido: ${banned}`);
  }
});

check("12. El prompt T9C usa la ruta real snapshot_json.sections.evidences.items", () => {
  assert(t9cPrompt.includes("snapshot_json.sections.evidences.items"), "el prompt T9C debe usar la ruta real");
  assert(!/snapshot_json\.evidences\.items/.test(t9cPrompt), "el prompt T9C no debe usar la ruta incorrecta snapshot_json.evidences.items");
});

check("13. No queda la ruta incorrecta como instrucción de uso en el prompt T9C", () => {
  // La ruta incorrecta puede aparecer en reportes SOLO en contexto de corrección
  // ("X → Y", "decían X", "antes X"); lo que no debe existir es una instrucción
  // viva de leer esa ruta. Se verifica el prompt T9C, que es el que guía la UI.
  const lines = t9cPrompt.split("\n");
  const badUse = lines.filter(
    (l) => /snapshot_json\.evidences\.items/.test(l) && !/→|decía|antes|incorrect|no debe/i.test(l)
  );
  assert(badUse.length === 0, `el prompt T9C usa la ruta incorrecta como instrucción: ${badUse.join(" | ")}`);
});

check("14. Lenguaje prudente y disclaimers (con negaciones obligatorias)", () => {
  assert(!/reglamento/i.test(sql), "0091 no debe usar la palabra vetada");
  const scanning = sql.split("\n").filter((l) => !/no equivale a/i.test(l)).join("\n").toLowerCase();
  for (const term of ["certificación garantizada", "cumple automáticamente", "pasaporte oficial", "sello garantizado"]) {
    assert(!scanning.includes(term), `texto prohibido en 0091: ${term}`);
  }
  assert(sql.includes("La evaluación de circularidad es una herramienta técnica interna."), "falta el disclaimer de circularidad");
  assert(sql.includes("No equivale a certificación, sello, declaración regulatoria oficial ni pasaporte digital de producto oficial."), "falta la advertencia general");
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
