/**
 * Trazaloop · Sprint T6 (Textil) · Verificación de órdenes, lotes y
 * trazabilidad (30 puntos del encargo §16).
 * Ejecutar: npx tsx tests/traceability/textiles-traceability.test.ts
 */

import fs from "node:fs";
import path from "node:path";
import {
  computeTraceabilityStatus,
  computeInputLotBalance,
  parseQuantity,
  type TraceabilityInput,
} from "../../lib/domain/textiles-traceability";
import {
  TEXTILE_EVIDENCE_ENTITY_TYPES,
  TEXTILE_EVIDENCE_LINK_TYPES,
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

const MIGRATION = "supabase/migrations/0078_textile_orders_lots_traceability.sql";
const migrationSql = read(MIGRATION);
const actionsSrc = read("server/actions/textiles-traceability.ts");
const dbSrc = read("lib/db/textiles-traceability.ts");
const domainSrc = read("lib/domain/textiles-traceability.ts");

const TABLES = [
  "textile_production_orders",
  "textile_input_lots",
  "textile_order_consumptions",
  "textile_order_process_steps",
  "textile_output_lots",
];

const baseTrace: TraceabilityInput = {
  hasOrder: true,
  hasReference: true,
  consumptionCount: 1,
  processStepCount: 1,
  hasOutputLot: true,
  overconsumedLotCodes: [],
  lotsWithoutSupplier: [],
  unitMismatchedConsumptions: 0,
  referenceEvidenceGapCount: 0,
  outsourcedStepsWithoutSupport: [],
};

console.log("\nSprint T6 · Órdenes, lotes y trazabilidad textil\n");

// ---------------------------------------------------------------------------
console.log("— Migración 0078: alcance (puntos 1–7) —");

check("1. Existe 0078 y su rango sigue intacto", () => {
  // Actualizado en T6.1 (misma deriva de pins que en T2.1/T4/T5/T5.1/T5.2):
  // se fija solo el rango propio; 0079+ son sprints legítimos posteriores.
  assert(fs.existsSync(path.join(root, MIGRATION)), "falta 0078");
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 78);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0078_textile_orders_lots_traceability.sql"]),
    `el rango 0078 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. Crea EXACTAMENTE las 5 tablas de trazabilidad permitidas", () => {
  const created = [...migrationSql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
  assert(
    JSON.stringify(created.sort()) === JSON.stringify([...TABLES].sort()),
    `tablas creadas: ${created.join(", ")}`
  );
});

check("3-6. No crea circularidad, pasaporte, TrazaDocs Textil ni planes por módulo", () => {
  const lower = migrationSql.toLowerCase();
  for (const term of ["textile_circular", "circularity", "textile_passport", "passport", "textile_trazadoc", "qr_", "blockchain", "module_access", "module_subscription", "carbon"]) {
    assert(!lower.includes(term), `0078 menciona "${term}" (fuera de alcance)`);
  }
  assert(!/\blca\b/.test(lower), "0078 menciona ACV/LCA (fuera de alcance)");
});

check("7. No toca CPR funcionalmente (production_orders/input_batches/output_batches CPR intactos)", () => {
  // Toda referencia a órdenes/lotes en 0078 es textile_*; nunca las tablas CPR.
  const withoutTextile = migrationSql.replace(/textile_[a-z_]+/g, "");
  for (const cpr of ["production_orders", "input_batches", "output_batches", "batch_consumption", "batch_composition"]) {
    assert(!withoutTextile.includes(cpr), `0078 no debía tocar la tabla CPR ${cpr}`);
  }
  for (const f of ["supabase/migrations/0024_traceability_base.sql", "supabase/migrations/0025_traceability_rls.sql", "supabase/migrations/0026_traceability_views.sql"]) {
    if (fs.existsSync(path.join(root, f))) {
      assert(!read(f).includes("textile"), `${f} (CPR) no debía tocarse`);
    }
  }
});

// ---------------------------------------------------------------------------
console.log("\n— Seguridad multiempresa (puntos 8–11) —");

check("8. Las 5 tablas tienen organization_id NOT NULL", () => {
  for (const t of TABLES) {
    const block = migrationSql.split(`create table public.${t}`)[1]?.split(");")[0] ?? "";
    assert(block.includes("organization_id    uuid not null") || block.includes("organization_id uuid not null") || /organization_id\s+uuid not null/.test(block), `${t} sin organization_id not null`);
  }
});

check("9. Las 5 tablas tienen RLS habilitada y política de select para miembros", () => {
  for (const t of TABLES) {
    assert(migrationSql.includes(`alter table public.${t}`) && migrationSql.includes(`${t}   enable row level security`) || new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(migrationSql), `${t} sin RLS`);
    assert(new RegExp(`create policy ${t}_select on public\\.${t}`).test(migrationSql), `${t} sin política select`);
    assert(new RegExp(`${t}_select[\\s\\S]{0,150}is_org_member\\(organization_id\\)`).test(migrationSql), `${t}: select debía ser de miembros`);
  }
  // Escrituras: admin/quality/consultant (patrón CPR 0025 + T5.1).
  const writePolicies = (migrationSql.match(/array\['admin','quality','consultant'\]/g) ?? []).length;
  assert(writePolicies >= 12, `esperaba ≥12 políticas de escritura con admin/quality/consultant (hay ${writePolicies})`);
});

check("10. Las 5 tablas protegen organization_id (inmutable) y tienen auditoría", () => {
  for (const t of TABLES) {
    assert(migrationSql.includes(`t_${t}_org_immutable`), `${t} sin prevent_organization_id_change`);
    assert(migrationSql.includes(`t_audit_${t}`), `${t} sin auditoría`);
    assert(migrationSql.includes(`t_${t}_updated`), `${t} sin set_updated_at`);
  }
});

check("11. FKs COMPUESTAS (organization_id, x) hacia referencias, materiales, componentes, proveedores, procesos y órdenes", () => {
  for (const pair of [
    ["textile_production_orders", "textile_references"],
    ["textile_input_lots", "textile_materials"],
    ["textile_input_lots", "textile_components"],
    ["textile_input_lots", "textile_suppliers"],
    ["textile_order_consumptions", "textile_production_orders"],
    ["textile_order_consumptions", "textile_input_lots"],
    ["textile_order_process_steps", "textile_production_orders"],
    ["textile_order_process_steps", "textile_processes"],
    ["textile_order_process_steps", "textile_outsourced_processes"],
    ["textile_output_lots", "textile_production_orders"],
  ]) {
    const re = new RegExp(`references public\\.${pair[1]} \\(organization_id, id\\)`);
    assert(re.test(migrationSql), `falta FK compuesta ${pair[0]} → ${pair[1]}`);
  }
});

// ---------------------------------------------------------------------------
console.log("\n— Reglas de datos (puntos 12–19) —");

check("12-14. order_code, lot_code y output_lot_code únicos por organización", () => {
  assert(migrationSql.includes("unique (organization_id, order_code)"), "order_code sin unique por org");
  assert(migrationSql.includes("unique (organization_id, lot_code)"), "lot_code sin unique por org");
  assert(migrationSql.includes("unique (organization_id, output_lot_code)"), "output_lot_code sin unique por org");
});

check("15-17. Cantidades: recibida > 0 (si existe), consumida > 0, producida > 0", () => {
  assert(migrationSql.includes("quantity_received is null or quantity_received > 0"), "falta check de quantity_received");
  assert(migrationSql.includes("check (quantity_consumed > 0)"), "falta check de quantity_consumed");
  assert(migrationSql.includes("check (quantity_produced > 0)"), "falta check de quantity_produced");
  const parsed = parseQuantity("0");
  assert(parsed.value === null, "parseQuantity debía rechazar 0");
  assert(parseQuantity("12,5").value === 12.5, "parseQuantity debía aceptar coma decimal");
});

check("18. Sobreconsumo BLOQUEADO por trigger cuando es comparable (D-T6-01)", () => {
  assert(migrationSql.includes("guard_textile_lot_overconsumption"), "falta el guard de sobreconsumo");
  assert(migrationSql.includes("before insert or update on public.textile_order_consumptions"), "el guard debía ser BEFORE INSERT OR UPDATE");
  assert(migrationSql.includes("Sobreconsumo bloqueado"), "falta el mensaje de bloqueo");
  assert(migrationSql.includes("lower(trim(new.unit)) = lower(trim(v_lot.unit))"), "el bloqueo debía aplicar solo con unidades coincidentes (sin conversión)");
  assert(migrationSql.includes("tg_op = 'INSERT' or id <> new.id"), "el UPDATE debía excluir la propia fila del acumulado");
  assert(actionsSrc.includes("Sobreconsumo bloqueado: el lote no tiene saldo suficiente"), "la action debía traducir el error del trigger");
});

check("19. Vista de balance de lote + lógica de dominio equivalente", () => {
  assert(migrationSql.includes("create or replace view public.v_textile_input_lot_balance"), "falta la vista de balance");
  assert(migrationSql.includes("quantity_remaining"), "la vista debía exponer quantity_remaining");
  assert(migrationSql.includes("security_invoker = true"), "las vistas debían ser security_invoker (patrón 0026)");
  const b = computeInputLotBalance({
    quantityReceived: 100,
    unit: "m",
    consumptions: [
      { quantity: 30, unit: "m" },
      { quantity: 10, unit: "M " },
      { quantity: 5, unit: "kg" },
    ],
  });
  assert(b.consumed === 40 && b.remaining === 60, `balance esperado 40/60 (hay ${b.consumed}/${b.remaining})`);
  assert(b.otherUnitCount === 1, "el consumo en kg debía contar aparte (sin conversión)");
  assert(b.derivedStatus === "partially_consumed", "estado derivado esperado partially_consumed");
  const full = computeInputLotBalance({ quantityReceived: 40, unit: "m", consumptions: [{ quantity: 40, unit: "m" }] });
  assert(full.derivedStatus === "consumed", "al agotar el saldo el estado derivado es consumed");
});

// ---------------------------------------------------------------------------
console.log("\n— Estado de trazabilidad (puntos 20–22) —");

check("20-21. complete exige orden + referencia + consumo + lote final, sin brechas", () => {
  assert(computeTraceabilityStatus(baseTrace).status === "complete", "el caso base debía ser complete");
  assert(computeTraceabilityStatus({ ...baseTrace, hasOutputLot: false }).status === "incomplete", "sin lote final debía ser incomplete");
  assert(computeTraceabilityStatus({ ...baseTrace, hasReference: false }).status === "incomplete", "sin referencia debía ser incomplete");
  assert(
    computeTraceabilityStatus({ ...baseTrace, consumptionCount: 0, processStepCount: 0 }).status === "not_started",
    "sin consumos ni procesos debía ser not_started"
  );
  assert(computeTraceabilityStatus({ ...baseTrace, hasOrder: false }).status === "not_started", "sin orden debía ser not_started");
});

check("22. needs_review detecta cada tipo de brecha (con mensajes)", () => {
  const cases: Array<[Partial<TraceabilityInput>, string]> = [
    [{ overconsumedLotCodes: ["LE-1"] }, "overconsumption"],
    [{ lotsWithoutSupplier: ["LE-2"] }, "lot_without_supplier"],
    [{ unitMismatchedConsumptions: 2 }, "unit_mismatch"],
    [{ referenceEvidenceGapCount: 3 }, "reference_evidence_gaps"],
    [{ outsourcedStepsWithoutSupport: ["Estampado externo"] }, "outsourced_without_support"],
  ];
  for (const [patch, code] of cases) {
    const r = computeTraceabilityStatus({ ...baseTrace, ...patch });
    assert(r.status === "needs_review", `${code}: debía marcar needs_review`);
    assert(r.gaps.some((g) => g.code === code && g.message.length > 10), `${code}: falta la brecha con mensaje`);
  }
});

// ---------------------------------------------------------------------------
console.log("\n— Vínculos de evidencias (puntos 23–24) —");

check("23. entity_type y link_type ampliados a las entidades de trazabilidad", () => {
  for (const e of ["production_order", "input_lot", "order_consumption", "order_process_step", "output_lot"]) {
    assert(migrationSql.includes(`'${e}'`), `entity_type ${e} debía estar en el CHECK de 0078`);
    assert((TEXTILE_EVIDENCE_ENTITY_TYPES as readonly string[]).includes(e), `entity_type ${e} debía estar en el dominio`);
  }
  for (const l of ["production_order_support", "input_lot_support", "consumption_support", "process_execution_support", "output_lot_support", "traceability_support"]) {
    assert((TEXTILE_EVIDENCE_LINK_TYPES as readonly string[]).includes(l), `link_type ${l} debía estar en el dominio`);
  }
  assert(migrationSql.includes("drop constraint textile_evidence_links_entity_check"), "el CHECK de entidad debía reemplazarse por superconjunto");
});

check("24. El trigger polimórfico valida las 16 entidades y sigue bloqueando cross-tenant", () => {
  assert(migrationSql.includes("create or replace function public.validate_textile_evidence_link_org"), "el trigger debía ampliarse en 0078");
  const branches = (migrationSql.match(/when '\w+'\s+then select organization_id into v_target_org/g) ?? []).length;
  assert(branches === 16, `el CASE debía resolver 16 entidades (hay ${branches})`);
  assert(migrationSql.includes("v_target_org <> new.organization_id"), "la comparación cross-tenant debía seguir");
  assert(migrationSql.includes("Vínculo de evidencia textil entre empresas bloqueado"), "falta el mensaje cross-tenant");
  assert(migrationSql.includes("guard_textile_lot_overconsumption") && migrationSql.includes("v_lot.organization_id <> new.organization_id"), "el guard de consumo también debía re-verificar la organización del lote");
});

// ---------------------------------------------------------------------------
console.log("\n— Server actions y rutas (puntos 25–28) —");

check("25. Todas las actions pasan por la triple guarda + rol de escritura", () => {
  const exported = (actionsSrc.match(/export async function \w+Action/g) ?? []).length;
  const gates = (actionsSrc.match(/const g = await gate\(\);/g) ?? []).length;
  // archiveTextileProductionOrderAction y archiveTextileOutputLotAction
  // delegan en las actions de estado (que sí llaman gate()).
  assert(exported >= 17, `esperaba ≥17 actions exportadas (hay ${exported})`);
  assert(gates >= exported - 2, `todas las actions (salvo 2 delegadas) debían llamar gate() (${gates}/${exported})`);
  assert(actionsSrc.includes("requireTextilesForAction"), "gate debía usar requireTextilesForAction");
  assert(actionsSrc.includes("checkOrganizationCanMutate"), "gate debía respetar el modo solo lectura");
  assert(actionsSrc.includes("canUploadTextileEvidence(access.org.roleCode)"), "gate debía pre-verificar el rol de escritura");
  assert(actionsSrc.includes("textileOrderBelongsToOrg") && actionsSrc.includes("textileInputLotBelongsToOrg"), "las relaciones debían verificarse dentro de la organización");
});

check("26. Sin service_role en actions/db/dominio de trazabilidad", () => {
  for (const [name, src] of [["actions", actionsSrc], ["db", dbSrc], ["domain", domainSrc]] as const) {
    assert(
      !src.includes("SUPABASE_SERVICE_ROLE") && !src.includes("serviceRole") && !src.includes("createAdminClient"),
      `${name} usa service_role`
    );
  }
});

check("27. Las 6 rutas de trazabilidad existen bajo el guard Textil con force-dynamic", () => {
  const pages = [
    "app/(app)/(shell)/textiles/traceability/page.tsx",
    "app/(app)/(shell)/textiles/traceability/orders/page.tsx",
    "app/(app)/(shell)/textiles/traceability/orders/[id]/page.tsx",
    "app/(app)/(shell)/textiles/traceability/input-lots/page.tsx",
    "app/(app)/(shell)/textiles/traceability/output-lots/page.tsx",
    "app/(app)/(shell)/textiles/traceability/output-lots/[id]/page.tsx",
  ];
  for (const p of pages) {
    assert(fs.existsSync(path.join(root, p)), `falta ${p}`);
    const src = read(p);
    assert(src.includes("requireTextilesModule"), `${p} sin guard del módulo`);
    assert(src.includes('force-dynamic'), `${p} sin force-dynamic`);
  }
});

check("28. /textiles enlaza a Trazabilidad textil y ya no la lista como futura", () => {
  const shell = read("app/(app)/(shell)/textiles/page.tsx");
  assert(shell.includes('href="/textiles/traceability"'), "el shell debía enlazar a trazabilidad");
  assert(shell.includes("Trazabilidad textil"), "falta la tarjeta de trazabilidad");
  const mod = read("lib/modules/textiles.ts");
  assert(!mod.includes('"Órdenes, lotes y trazabilidad"'), "trazabilidad no debía seguir como sección futura");
});

// ---------------------------------------------------------------------------
console.log("\n— Lenguaje (puntos 29–30) —");

check("29. Sin promesas de certificación en migración, actions, dominio ni páginas", () => {
  const pages = [
    "app/(app)/(shell)/textiles/traceability/page.tsx",
    "app/(app)/(shell)/textiles/traceability/orders/[id]/page.tsx",
    "app/(app)/(shell)/textiles/traceability/output-lots/[id]/page.tsx",
  ].map(read).join("\n");
  const lower = (migrationSql + actionsSrc + domainSrc + pages).toLowerCase();
  for (const term of ["producto certificado", "cumple automáticamente", "certificación garantizada", "validación externa garantizada", "pasaporte oficial", "aprobado por norma"]) {
    assert(!lower.includes(term), `texto prohibido: "${term}"`);
  }
  assert(domainSrc.includes("TEXTILE_TRACEABILITY_DISCLAIMER"), "falta el descargo de trazabilidad");
  assert(pages.includes("TEXTILE_TRACEABILITY_DISCLAIMER"), "las páginas debían mostrar el descargo");
});

check("30. La trazabilidad NO se presenta como pasaporte", () => {
  const hub = read("app/(app)/(shell)/textiles/traceability/page.tsx");
  const detail = read("app/(app)/(shell)/textiles/traceability/output-lots/[id]/page.tsx");
  for (const src of [hub, detail]) {
    assert(!src.toLowerCase().includes("pasaporte"), "las páginas de trazabilidad no debían mencionar pasaporte");
    assert(!src.toLowerCase().includes("qr"), "las páginas de trazabilidad no debían mencionar QR");
  }
  assert(detail.includes("Trazabilidad técnica"), "el detalle debía presentarse como trazabilidad técnica");
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron\n`);
if (failed > 0) process.exit(1);
