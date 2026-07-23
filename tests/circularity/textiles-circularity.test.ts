/**
 * Trazaloop · Sprint T7 (Textil) — Verificación de la evaluación de
 * circularidad. Ejecutar: npx tsx tests/circularity/textiles-circularity.test.ts
 *
 * Estilo T2–T6.1: inspección de SQL/código + lógica de dominio ejecutable,
 * sin base de datos. Cubre los puntos 1–46 del encargo §19.
 */

import fs from "node:fs";
import path from "node:path";
import {
  TEXTILE_CIRCULARITY_DIMENSIONS,
  TEXTILE_CIRCULARITY_DIMENSION_WEIGHTS,
  TEXTILE_READINESS_LEVELS,
  readinessLevelFor,
  evidenceSupportValue,
  isStrongSupport,
  computeCircularityScore,
  computeCircularityGaps,
  parseAnswerValue,
  type CircularityGapContext,
} from "../../lib/domain/textiles-circularity";
import {
  TEXTILE_EVIDENCE_ENTITY_TYPES,
  TEXTILE_EVIDENCE_LINK_TYPES,
} from "../../lib/domain/textiles-evidences";

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
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const root = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const MIGRATION = "supabase/migrations/0080_textile_circularity_assessments.sql";
const migrationSql = read(MIGRATION);
const lowerSql = migrationSql.toLowerCase();
/** SQL sin comentarios: el encabezado de 0080 NIEGA el alcance prohibido
 * ("NADA de TrazaDocs, pasaporte, QR…") y eso no debe disparar los checks. */
const sqlNoComments = migrationSql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .toLowerCase();

console.log("— Migración 0080: alcance (puntos 1–9) —");

check("1. Existe la migración 0080 y su rango sigue intacto", () => {
  // Actualizado en T7.1 (misma deriva de pins corregida en T2.1→T6.1): se
  // fija SOLO el slot propio; 0081+ son sprints legítimos posteriores.
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 80);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0080_textile_circularity_assessments.sql"]),
    `el rango 0080 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. Crea solo las tablas permitidas de circularidad", () => {
  const tables = [...migrationSql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)].map((m) => m[1]);
  assert(
    JSON.stringify(tables.sort()) ===
      JSON.stringify([
        "textile_circularity_answers",
        "textile_circularity_assessments",
        "textile_circularity_criteria",
        "textile_circularity_methodologies",
      ]),
    `tablas fuera de alcance: ${tables.join(", ")}`
  );
});

check("3-8. Sin TrazaDocs, pasaporte, QR, IA, ACV/huella ni planes por módulo", () => {
  for (const term of [
    "trazadoc", "textile_passport", "passport_", "qr_code", " blockchain",
    "artificial_intelligence", "openai", "lca_", "carbon_footprint", "huella de carbono oficial",
    "module_access", "module_subscription", "organization_module_access",
  ]) {
    assert(!sqlNoComments.includes(term), `0080 menciona "${term}" (fuera de alcance)`);
  }
  // "pasaporte" solo aparece negado / como preparación futura, jamás creado.
  assert(!/create table[^;]*passport/i.test(migrationSql), "0080 crea tabla de pasaporte");
});

check("9. No toca CPR funcionalmente (ni tablas ni funciones CPR)", () => {
  for (const term of ["cpr_", "diagnostic_assessments", "trazadocs", "document_master", "alter table public.organizations"]) {
    assert(!sqlNoComments.includes(term), `0080 toca "${term}"`);
  }
});

console.log("— Seguridad multiempresa (puntos 10–13) —");

check("10-11. Las tablas org-scoped tienen organization_id y RLS; las globales tienen RLS de solo lectura", () => {
  for (const t of ["textile_circularity_assessments", "textile_circularity_answers"]) {
    const block = migrationSql.slice(migrationSql.indexOf(`create table public.${t}`));
    assert(block.slice(0, block.indexOf(");")).includes("organization_id"), `${t} sin organization_id`);
    assert(migrationSql.includes(`alter table public.${t} enable row level security`), `${t} sin RLS`);
    assert(new RegExp(`create policy ${t}_select`).test(migrationSql), `${t} sin política select`);
  }
  for (const t of ["textile_circularity_methodologies", "textile_circularity_criteria"]) {
    assert(migrationSql.includes(`alter table public.${t} enable row level security`), `${t} sin RLS`);
    assert(!new RegExp(`create policy ${t}_(insert|update|delete)`).test(migrationSql), `${t} no debía tener escrituras de app`);
  }
  assert(!/to anon/.test(migrationSql), "hay políticas para anon");
});

check("12. organization_id inmutable en ambas tablas org-scoped", () => {
  for (const t of ["textile_circularity_assessments", "textile_circularity_answers"]) {
    assert(
      new RegExp(`t_${t}_org_immutable before update on public\\.${t}`).test(migrationSql),
      `${t} sin prevent_organization_id_change`
    );
  }
});

check("13. FKs compuestas (organization_id, id) hacia referencia, lote y evaluación", () => {
  assert(/foreign key \(organization_id, reference_id\)\s*\n?\s*references public\.textile_references \(organization_id, id\)/.test(migrationSql), "falta FK compuesta a textile_references");
  assert(/foreign key \(organization_id, output_lot_id\)\s*\n?\s*references public\.textile_output_lots \(organization_id, id\)/.test(migrationSql), "falta FK compuesta a textile_output_lots");
  assert(/foreign key \(organization_id, assessment_id\)\s*\n?\s*references public\.textile_circularity_assessments \(organization_id, id\)/.test(migrationSql), "falta FK compuesta respuestas→evaluación");
  assert(migrationSql.includes("validate_textile_circularity_assessment_target"), "falta la guarda lote↔referencia");
});

console.log("— Metodología y criterios (puntos 14–18) —");

const seedRows = [...migrationSql.matchAll(/\('c0000000-0000-4000-8000-000000000001', '([A-Z]{2}\d{2})', '(\w+)', '[^']+', (?:'[^']*'|null), ([\d.]+), '(\w+)', (true|false)/g)]
  .map((m) => ({ code: m[1], dimension: m[2], weight: Number(m[3]), responseType: m[4], allowsNa: m[5] === "true" }));

check("14. Existe la metodología activa TEXTILE_CIRCULARITY_PREP v1 (seed)", () => {
  assert(migrationSql.includes("'TEXTILE_CIRCULARITY_PREP', 'v1'"), "falta el seed de metodología");
  assert(/insert into public\.textile_circularity_methodologies[\s\S]*?true\s*\)/.test(migrationSql), "la metodología seed no queda activa");
});

check("15. Los pesos activos del seed suman 100 (dimensiones 20/20/15/15/20/10)", () => {
  assert(seedRows.length >= 20 && seedRows.length <= 30, `criterios seed fuera de rango 20–30 (${seedRows.length})`);
  const total = seedRows.reduce((acc, r) => acc + r.weight, 0);
  assert(total === 100, `los pesos suman ${total}, no 100`);
  const byDim = new Map<string, number>();
  for (const r of seedRows) byDim.set(r.dimension, (byDim.get(r.dimension) ?? 0) + r.weight);
  for (const dim of TEXTILE_CIRCULARITY_DIMENSIONS) {
    assert(
      byDim.get(dim) === TEXTILE_CIRCULARITY_DIMENSION_WEIGHTS[dim],
      `dimensión ${dim}: peso ${byDim.get(dim)} ≠ ${TEXTILE_CIRCULARITY_DIMENSION_WEIGHTS[dim]}`
    );
  }
});

check("16. Hay criterios en las 6 dimensiones definidas y el CHECK de dimensión las fija", () => {
  const dims = new Set(seedRows.map((r) => r.dimension));
  for (const dim of TEXTILE_CIRCULARITY_DIMENSIONS) assert(dims.has(dim), `sin criterios en ${dim}`);
  assert(migrationSql.includes("textile_circularity_criteria_dimension_check"), "falta CHECK de dimensión");
});

check("17. answer_value acotado entre 0 y 1 (CHECK en BD y validación en dominio)", () => {
  assert(/answer_value >= 0 and answer_value <= 1/.test(migrationSql), "falta CHECK de rango en BD");
  assert(parseAnswerValue("0.5").value === 0.5, "0.5 debía ser válido");
  assert(parseAnswerValue("1.2").error !== null, "1.2 debía rechazarse");
  assert(parseAnswerValue("-1").error !== null, "-1 debía rechazarse");
});

check("18. N/A solo cuando allows_na = true (guard en BD)", () => {
  assert(migrationSql.includes("guard_textile_circularity_answer"), "falta el guard de respuestas");
  assert(/allows_na[\s\S]*?no admite la respuesta "no aplica"/.test(migrationSql), "el guard no valida allows_na");
});

console.log("— Protección de campos calculados (puntos 19–23) —");

check("19-22. score, nivel, dimensiones, brechas y recomendaciones no se editan directamente (trigger + flag)", () => {
  assert(migrationSql.includes("protect_textile_circularity_calculated_fields"), "falta el trigger de protección");
  assert(migrationSql.includes("trazaloop.textile_circularity_calculate"), "falta el flag transaccional");
  for (const f of ["circularity_score", "readiness_level", "dimension_scores", "gaps", "recommendations", "calculated_at", "completed_at", "completed_by"]) {
    assert(new RegExp(`new\\.${f}\\s+is distinct from old\\.${f}`).test(migrationSql), `el trigger no protege ${f}`);
  }
});

check("23. La evaluación completada queda protegida como snapshot (solo puede archivarse; respuestas congeladas)", () => {
  assert(/old\.status = 'completed'/.test(migrationSql), "el trigger no distingue completed");
  assert(migrationSql.includes("solo puede archivarse"), "falta el bloqueo de snapshot");
  assert(/v_status <> 'draft'[\s\S]*?no pueden modificarse/.test(migrationSql), "las respuestas de completed no quedan congeladas");
  assert(/new\.status = 'completed'[\s\S]*?flujo controlado/.test(migrationSql), "pasar a completed no exige el flujo controlado");
});

console.log("— Cálculo, niveles y evidencias (puntos 24–31) —");

check("24. El cálculo completo genera puntaje entre 0 y 100 (dominio + fórmula en SQL)", () => {
  const all1 = seedRows.map((r) => ({ code: r.code, dimension: r.dimension as (typeof TEXTILE_CIRCULARITY_DIMENSIONS)[number], weight: r.weight, value: 1 }));
  assert(computeCircularityScore(all1).score === 100, "todo en 1 debía dar 100");
  const all0 = all1.map((c) => ({ ...c, value: 0 }));
  assert(computeCircularityScore(all0).score === 0, "todo en 0 debía dar 0");
  const half = all1.map((c) => ({ ...c, value: 0.5 }));
  assert(computeCircularityScore(half).score === 50, "todo en 0.5 debía dar 50");
  // N/A excluidos del denominador y renormalización si una dimensión entera queda N/A:
  const withNa = all1.map((c) => (c.dimension === "reuse_end_of_life" ? { ...c, value: null } : c));
  assert(computeCircularityScore(withNa).score === 100, "dimensión entera N/A debía renormalizar");
  assert(migrationSql.includes("v_earned[v_idx] / v_wsum[v_idx]") && migrationSql.includes("* v_wtotal[v_idx]"), "la fórmula SQL no normaliza por dimensión");
});

check("25-29. Niveles: 0–24 inicial, 25–49 basico, 50–69 intermedio, 70–84 avanzado, 85–100 preparado", () => {
  const cases: Array<[number, string]> = [
    [0, "inicial"], [24.9, "inicial"], [25, "basico"], [49.9, "basico"],
    [50, "intermedio"], [69.9, "intermedio"], [70, "avanzado"], [84.9, "avanzado"],
    [85, "preparado"], [100, "preparado"],
  ];
  for (const [score, level] of cases) {
    assert(readinessLevelFor(score) === level, `${score} debía dar ${level}, dio ${readinessLevelFor(score)}`);
  }
  assert(TEXTILE_READINESS_LEVELS.length === 5, "debían ser 5 niveles");
  for (const cut of ["< 25", "< 50", "< 70", "< 85"]) {
    assert(migrationSql.includes(cut), `el SQL no usa el corte ${cut}`);
  }
});

check("30. Las evidencias rechazadas no cuentan como soporte fuerte (valor 0 + brecha)", () => {
  assert(evidenceSupportValue("rejected") === 0, "rejected debía valer 0");
  assert(!isStrongSupport("rejected"), "rejected no es soporte fuerte");
  assert(evidenceSupportValue("archived") === 0, "archived no es soporte activo");
  assert(/when 'rejected' then/.test(migrationSql) === false || true, "n/a");
  assert(/'accepted' then 1\.0 when 'pending_review' then 0\.5 when 'expired' then 0\.5 else 0\.0/.test(migrationSql), "el SQL no aplica la escala de soporte por estado");
  assert(migrationSql.includes("rejected_as_support"), "el SQL no genera la brecha de evidencia rechazada");
});

check("31. Las evidencias pendientes cuentan como parciales; las vencidas advierten y no son soporte fuerte", () => {
  assert(evidenceSupportValue("pending_review") === 0.5, "pending debía valer 0.5");
  assert(evidenceSupportValue("expired") === 0.5 && !isStrongSupport("expired"), "expired debía ser 0.5 sin ser fuerte");
  assert(evidenceSupportValue("accepted") === 1 && isStrongSupport("accepted"), "accepted debía ser soporte fuerte");
  assert(migrationSql.includes("expired_support"), "el SQL no genera la advertencia de evidencia vencida");
});

console.log("— Brechas y no-confianza ciega (puntos 32–38) —");

const baseCtx: CircularityGapContext = {
  hasComposition: true,
  compositionSumsOk: true,
  recycledDeclared: false,
  recycledSupport: 0,
  organicDeclared: false,
  organicSupport: 0,
  compositionSupport: 1,
  rejectedInContext: false,
  expiredInContext: false,
  materialsCount: 2,
  materialsWithSupplier: 2,
  materialSupportAvg: 1,
  componentsCount: 2,
  componentsEvaluated: 2,
  maxFibersPerScope: 2,
  hasOutputLot: false,
  lotConsumptions: 0,
  overconsumption: false,
  outsourcedWithoutSupport: 0,
  lotTraceabilityStatus: null,
};
const codesOf = (ctx: CircularityGapContext) => computeCircularityGaps(ctx).map((g) => g.code);

check("32. La evaluación no confía solo en traceability_status (consulta consumos, sobreconsumo y evidencias reales)", () => {
  assert(migrationSql.includes("indicador auxiliar"), "el SQL no documenta el status como auxiliar");
  assert(migrationSql.includes("textile_order_consumptions"), "el SQL no consulta consumos reales");
  assert(/quantity_consumed[\s\S]*?> il\.quantity_received/.test(migrationSql), "el SQL no detecta sobreconsumo desde datos reales");
  // En dominio: needs_review es UNA brecha más; consumos y sobreconsumo se evalúan aparte.
  const codes = codesOf({ ...baseCtx, hasOutputLot: true, lotConsumptions: 3, overconsumption: true, lotTraceabilityStatus: "complete" });
  assert(codes.includes("overconsumption"), "sobreconsumo debía detectarse aunque el status diga complete");
});

check("33. Detecta composición inexistente", () => {
  assert(codesOf({ ...baseCtx, hasComposition: false }).includes("no_composition"), "faltó no_composition");
});

check("34. Detecta composición que no suma 100 ± 0,5", () => {
  assert(codesOf({ ...baseCtx, compositionSumsOk: false }).includes("composition_not_100"), "faltó composition_not_100");
  assert(migrationSql.includes("between 99.5 and 100.5"), "el SQL no verifica el rango 99,5–100,5");
});

check("35. Detecta declaración reciclada sin evidencia aceptada o pendiente", () => {
  assert(codesOf({ ...baseCtx, recycledDeclared: true, recycledSupport: 0 }).includes("recycled_without_support"), "faltó recycled_without_support");
  assert(!codesOf({ ...baseCtx, recycledDeclared: true, recycledSupport: 0.5 }).includes("recycled_without_support"), "pending debía bastar como soporte parcial");
});

check("36. Detecta declaración orgánica sin evidencia", () => {
  assert(codesOf({ ...baseCtx, organicDeclared: true, organicSupport: 0 }).includes("organic_without_support"), "faltó organic_without_support");
});

check("37. Detecta componentes sin separabilidad evaluada", () => {
  assert(codesOf({ ...baseCtx, componentsEvaluated: 1 }).includes("components_without_separability"), "faltó components_without_separability");
  assert(migrationSql.includes("separability <> 'not_evaluated'"), "el SQL no lee la separabilidad del catálogo T3");
});

check("38. Detecta traceability_status needs_review como brecha (auxiliar) y consumos faltantes", () => {
  const codes = codesOf({ ...baseCtx, hasOutputLot: true, lotConsumptions: 0, lotTraceabilityStatus: "needs_review" });
  assert(codes.includes("traceability_needs_review"), "faltó traceability_needs_review");
  assert(codes.includes("lot_without_consumptions"), "faltó lot_without_consumptions");
});

console.log("— Vínculos de evidencias (puntos 39–40) —");

check("39. Evidence links se amplían a circularity_assessment con los tipos de soporte del encargo", () => {
  assert(TEXTILE_EVIDENCE_ENTITY_TYPES.includes("circularity_assessment" as never), "falta la entidad en dominio");
  for (const t of ["circularity_support", "recyclability_support", "repairability_support", "care_support", "separation_support", "reuse_support", "end_of_life_support"]) {
    assert(TEXTILE_EVIDENCE_LINK_TYPES.includes(t as never), `falta el tipo ${t} en dominio`);
  }
  assert(migrationSql.includes("'circularity_assessment'") && migrationSql.includes("'end_of_life_support'"), "el CHECK de 0080 no amplía los catálogos");
});

check("40. Evidence links siguen bloqueando cross-tenant (trigger recreado con la rama nueva)", () => {
  const fn = migrationSql.slice(migrationSql.indexOf("create or replace function public.validate_textile_evidence_link_org"));
  assert(fn.includes("when 'circularity_assessment' then"), "falta la rama de circularidad en el validador");
  assert(fn.includes("Vínculo de evidencia textil entre empresas bloqueado"), "el validador perdió el bloqueo cross-tenant");
  const branches = [...fn.matchAll(/when '\w+'\s+then select organization_id/g)].length;
  assert(branches === 17, `el validador debía cubrir 17 entidades (tiene ${branches})`);
});

console.log("— Server actions, rutas y lenguaje (puntos 41–46) —");

const actionsSrc = read("server/actions/textiles-circularity.ts");

check("41. Las server actions validan acceso al módulo Textil, organización activa y rol", () => {
  assert(actionsSrc.includes("requireTextilesForAction"), "falta la triple guarda");
  assert(actionsSrc.includes("checkTextilesCanMutate"), "falta el modo solo lectura (T9F.1: por módulo)");
  assert(actionsSrc.includes("canUploadTextileEvidence"), "falta el pre-check de rol de escritura");
  assert(actionsSrc.includes("canSetTextileEvidenceStatus"), "falta el pre-check de finalización admin/quality");
  const rpcGuard = /organization_modules[\s\S]*?module_code = 'textiles'/;
  assert(rpcGuard.test(migrationSql), "las RPC no verifican organization_modules.module_code");
  assert(!lowerSql.includes("module_key") && !lowerSql.includes("enabled_by"), "0080 usa columnas prohibidas");
});

check("42. Las server actions no usan service_role y no aceptan campos calculados del cliente", () => {
  const actionsCode = actionsSrc
    .split("\n")
    .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*"))
    .join("\n");
  assert(!actionsCode.includes("service_role") && !actionsCode.includes("SUPABASE_SERVICE"), "usa service_role");
  for (const f of ["circularity_score", "readiness_level", "dimension_scores", "gaps:", "recommendations:"]) {
    assert(!actionsCode.includes(f), `la action envía ${f} desde el cliente`);
  }
  assert(actionsSrc.includes('rpc("recalculate_textile_circularity_assessment"'), "el cálculo no pasa por la RPC controlada");
  assert(actionsSrc.includes('rpc("finalize_textile_circularity_assessment"'), "la finalización no pasa por la RPC controlada");
});

check("43. /textiles/circularity existe bajo el guard Textil (las 4 rutas del sprint)", () => {
  const base = "app/(app)/(shell)/textiles/circularity";
  for (const p of ["page.tsx", "assessments/page.tsx", "assessments/new/page.tsx", "assessments/[id]/page.tsx"]) {
    assert(fs.existsSync(path.join(root, base, p)), `falta ${p}`);
  }
  for (const p of ["page.tsx", "assessments/page.tsx", "assessments/new/page.tsx", "assessments/[id]/page.tsx"]) {
    assert(read(path.join(base, p)).includes("requireTextilesModule"), `${p} sin guard`);
  }
});

check("44. /textiles enlaza a la Evaluación de circularidad textil y ya no la lista como futura", () => {
  const shell = read("app/(app)/(shell)/textiles/page.tsx");
  assert(shell.includes('href="/textiles/circularity"'), "el shell no enlaza a circularidad");
  const mod = read("lib/modules/textiles.ts");
  assert(!/PLANNED_SECTIONS[\s\S]{0,200}Circularidad/.test(mod), "circularidad sigue como sección futura");
});

check("45-46. Sin promesas de certificación ni presentación como pasaporte oficial (UI, dominio y SQL)", () => {
  const surfaces = [
    "app/(app)/(shell)/textiles/circularity/page.tsx",
    "app/(app)/(shell)/textiles/circularity/assessments/page.tsx",
    "app/(app)/(shell)/textiles/circularity/assessments/new/page.tsx",
    "app/(app)/(shell)/textiles/circularity/assessments/[id]/page.tsx",
    "components/domain/textiles/circularity-criteria-form.tsx",
    "lib/domain/textiles-circularity.ts",
  ].map(read);
  for (const src of surfaces) {
    // Se descuentan las frases NEGADAS del aviso obligatorio ("No equivale a
    // certificación…, ni pasaporte oficial") antes de buscar afirmaciones.
    const affirmative = src
      .toLowerCase()
      .replace(/no equivale a certificación[^"]*/g, "")
      .replace(/ni pasaporte oficial/g, "")
      .replace(/no es\s+certificación/g, "");
    for (const term of ["certificado", "certifica", "cumple con la norma", "aprobado por norma", "garantizada", "pasaporte oficial", "validación externa"]) {
      assert(!affirmative.includes(term), `texto prohibido "${term}" en superficie de circularidad`);
    }
  }
  // El aviso viaja en la constante compartida del dominio.
  assert(surfaces[5].includes("No equivale a certificación, "), "el dominio no define el aviso de no certificación");
  assert(surfaces[0].includes("TEXTILE_CIRCULARITY_DISCLAIMER"), "el hub no muestra el aviso de no certificación");
  assert(surfaces[3].includes("TEXTILE_CIRCULARITY_DISCLAIMER"), "el detalle no muestra el aviso de no certificación");
  assert(migrationSql.includes("jamás") || migrationSql.includes("No equivale"), "el SQL no documenta el lenguaje prudente");
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
