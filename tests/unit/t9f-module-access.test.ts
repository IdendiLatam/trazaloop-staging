/**
 * Trazaloop · Sprint T9F · Pruebas PURAS del modelo de acceso comercial:
 * regla canónica, estados derivados, entitlements (Full ≡ Extra salvo
 * almacenamiento) y coherencia del catálogo canónico con la migración 0100.
 *
 * Correr: npx tsx tests/unit/t9f-module-access.test.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveModuleAccess,
  buildModuleEntitlements,
  functionalLimitsFingerprint,
  formatRemainingTrial,
  remainingTrialMs,
  type ModuleAssignment,
  type FunctionalLimit,
} from "../../lib/modules/access";
import {
  COMMERCIAL_MODULES,
  FUNCTIONAL_MODULE_CODES,
  isFunctionalModuleCode,
  CPR_MODULE_CODE,
  TEXTILES_MODULE_CODE,
} from "../../lib/modules/catalog";
import { DERIVED_STATE_LABEL, isEnterableState } from "../../lib/modules/messages";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const NOW = new Date("2026-07-22T15:30:00.000Z");
const FUTURE = new Date("2026-07-24T15:30:00.000Z").toISOString(); // +48 h
const PAST = new Date("2026-07-20T15:30:00.000Z").toISOString();

const demo = (expires: string | null): ModuleAssignment => ({ enabled: true, accessMode: "demo", accessExpiresAt: expires });
const base = { isFunctional: true, killSwitchActive: true, now: NOW };

console.log("Trazaloop · T9F: regla canónica de acceso\n");

check("1. Demo temporal ACTIVO (vence en el futuro) → permitido, demo_active", () => {
  const d = resolveModuleAccess({ ...base, assignment: demo(FUTURE) });
  assert(d.allowed && d.derivedState === "demo_active" && d.isDemo && !d.isExpired, "demo activo mal resuelto");
});

check("2. Demo PERMANENTE (expires null) → permitido, demo_permanent", () => {
  const d = resolveModuleAccess({ ...base, assignment: demo(null) });
  assert(d.allowed && d.derivedState === "demo_permanent" && !d.isExpired, "demo permanente mal resuelto");
});

check("3. Demo VENCIDO (expires pasado) → BLOQUEADO, demo_expired", () => {
  const d = resolveModuleAccess({ ...base, assignment: demo(PAST) });
  assert(!d.allowed && d.derivedState === "demo_expired" && d.isExpired && d.reason === "demo_expired", "demo vencido debía bloquear");
});

check("4. Full y Extra → permitidos, estado propio, no demo", () => {
  const f = resolveModuleAccess({ ...base, assignment: { enabled: true, accessMode: "full", accessExpiresAt: null } });
  const e = resolveModuleAccess({ ...base, assignment: { enabled: true, accessMode: "extra", accessExpiresAt: null } });
  assert(f.allowed && f.derivedState === "full" && !f.isDemo, "full mal resuelto");
  assert(e.allowed && e.derivedState === "extra" && !e.isDemo, "extra mal resuelto");
});

check("5. enabled=false (deshabilitación) ≠ demo vencido → disabled, bloqueado", () => {
  const d = resolveModuleAccess({ ...base, assignment: { enabled: false, accessMode: "full", accessExpiresAt: null } });
  assert(!d.allowed && d.derivedState === "disabled" && d.reason === "disabled", "deshabilitado mal resuelto");
});

check("6. Kill switch global apagado prevalece sobre una asignación válida", () => {
  const d = resolveModuleAccess({ ...base, killSwitchActive: false, assignment: { enabled: true, accessMode: "full", accessExpiresAt: null } });
  assert(!d.allowed && d.derivedState === "globally_disabled", "el kill switch debía bloquear un Full");
});

check("7. Módulo no funcional → coming_soon (jamás por demo vencido)", () => {
  const d = resolveModuleAccess({ ...base, isFunctional: false, assignment: null });
  assert(!d.allowed && d.derivedState === "coming_soon", "no funcional debía ser coming_soon");
});

check("8. Sin asignación → not_assigned (no coming_soon, no disabled)", () => {
  const d = resolveModuleAccess({ ...base, assignment: null });
  assert(!d.allowed && d.derivedState === "not_assigned", "sin asignación mal resuelto");
});

check("9. El borde exacto: expires == now → vencido (<=)", () => {
  const d = resolveModuleAccess({ ...base, assignment: demo(NOW.toISOString()) });
  assert(!d.allowed && d.isExpired, "expires == now debía contar como vencido");
});

check("10. La hora del NAVEGADOR no altera la regla — solo cambia el `now` inyectado (servidor)", () => {
  // Con now en el pasado el mismo intento aún NO está vencido; con now futuro, sí.
  const antes = resolveModuleAccess({ ...base, now: new Date("2026-07-23T00:00:00Z"), assignment: demo(FUTURE) });
  const despues = resolveModuleAccess({ ...base, now: new Date("2026-07-25T00:00:00Z"), assignment: demo(FUTURE) });
  assert(antes.allowed && !despues.allowed, "la vigencia debe depender solo del `now` del servidor");
});

console.log("\nTrazaloop · T9F: entitlements (reutilizan plan_limits)\n");

const FULL_LIMITS: FunctionalLimit[] = [
  { resourceCode: "evidences", limitValue: null, isUnlimited: true },
  { resourceCode: "materials", limitValue: null, isUnlimited: true },
  { resourceCode: "roles_enabled", limitValue: 1, isUnlimited: false },
  { resourceCode: "storage_bytes", limitValue: 524288000, isUnlimited: false },
];
const EXTRA_LIMITS: FunctionalLimit[] = [
  { resourceCode: "evidences", limitValue: null, isUnlimited: true },
  { resourceCode: "materials", limitValue: null, isUnlimited: true },
  { resourceCode: "roles_enabled", limitValue: 1, isUnlimited: false },
  { resourceCode: "storage_bytes", limitValue: 5368709120, isUnlimited: false },
];
const DEMO_LIMITS: FunctionalLimit[] = [
  { resourceCode: "evidences", limitValue: 1, isUnlimited: false },
  { resourceCode: "materials", limitValue: 5, isUnlimited: false },
  { resourceCode: "roles_enabled", limitValue: 0, isUnlimited: false },
  { resourceCode: "storage_bytes", limitValue: 52428800, isUnlimited: false },
];

check("11. Full y Extra tienen ENTITLEMENTS FUNCIONALES idénticos (sin storage)", () => {
  const full = buildModuleEntitlements("full", FULL_LIMITS, 524288000);
  const extra = buildModuleEntitlements("extra", EXTRA_LIMITS, 5368709120);
  assert(
    functionalLimitsFingerprint(full) === functionalLimitsFingerprint(extra),
    "Full y Extra deben tener las MISMAS funcionalidades (solo difiere el almacenamiento)"
  );
});

check("12. La ÚNICA diferencia Full vs Extra es storageLimitBytes", () => {
  const full = buildModuleEntitlements("full", FULL_LIMITS, 524288000);
  const extra = buildModuleEntitlements("extra", EXTRA_LIMITS, 5368709120);
  assert(full.storageLimitBytes !== extra.storageLimitBytes, "el almacenamiento debía diferir");
  assert(extra.storageLimitBytes > full.storageLimitBytes, "Extra debe tener MÁS almacenamiento");
  // Ningún límite funcional (no-storage) puede diferir.
  assert(!full.functionalLimits.some((l) => l.resourceCode === "storage_bytes"), "storage no es un límite funcional");
});

check("13. Demo mantiene sus límites funcionales (distintos de Full)", () => {
  const d = buildModuleEntitlements("demo", DEMO_LIMITS, 52428800);
  const full = buildModuleEntitlements("full", FULL_LIMITS, 524288000);
  assert(functionalLimitsFingerprint(d) !== functionalLimitsFingerprint(full), "Demo no debe igualar a Full");
  assert(d.isDemo === true && full.isDemo === false, "isDemo mal marcado");
});

check("14. Demo temporal y Demo permanente reciben los MISMOS límites (mismo access_mode)", () => {
  // Ambos usan access_mode='demo' → los mismos plan_limits['demo'].
  const temporal = buildModuleEntitlements("demo", DEMO_LIMITS, 52428800);
  const permanente = buildModuleEntitlements("demo", DEMO_LIMITS, 52428800);
  assert(functionalLimitsFingerprint(temporal) === functionalLimitsFingerprint(permanente), "demo temporal y permanente deben coincidir");
});

console.log("\nTrazaloop · T9F: catálogo canónico ↔ migración 0100\n");

check("15. Solo CPR (traceability_6632) y Textiles son funcionales en el catálogo", () => {
  assert(FUNCTIONAL_MODULE_CODES.slice().sort().join(",") === [CPR_MODULE_CODE, TEXTILES_MODULE_CODE].sort().join(","), "funcionales inesperados");
  assert(isFunctionalModuleCode(CPR_MODULE_CODE) && isFunctionalModuleCode(TEXTILES_MODULE_CODE), "CPR/Textiles deben ser funcionales");
  assert(!isFunctionalModuleCode("quality") && !isFunctionalModuleCode("construccion"), "quality/construccion NO deben ser funcionales");
});

check("16. Quality y Construcción están en el catálogo como coming_soon", () => {
  const q = COMMERCIAL_MODULES.find((m) => m.key === "quality");
  const c = COMMERCIAL_MODULES.find((m) => m.key === "construccion");
  assert(q?.status === "coming_soon" && c?.status === "coming_soon", "quality/construccion deben ser coming_soon");
});

check("17. El catálogo coincide con modules.is_functional de 0100", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/0100_organization_module_access_modes_and_demo_trial.sql"), "utf8");
  // La migración marca is_functional=true solo para traceability_6632 y textiles.
  assert(
    /update public\.modules set is_functional = true\s+where code in \('traceability_6632', 'textiles'\)/.test(sql),
    "0100 debe marcar is_functional solo para CPR y Textiles"
  );
  // Y siembra quality/construccion como no disponibles.
  assert(/'quality'[\s\S]{0,120}false/.test(sql) && /'construccion'[\s\S]{0,120}false/.test(sql), "0100 debe sembrar quality/construccion no disponibles");
});

check("18. Solo Textiles tiene kill switch (TEXTILES_MODULE_ENABLED)", () => {
  const withSwitch = COMMERCIAL_MODULES.filter((m) => m.killSwitchEnv !== null);
  assert(withSwitch.length === 1 && withSwitch[0].killSwitchEnv === "TEXTILES_MODULE_ENABLED", "solo Textiles debe tener kill switch");
});

console.log("\nTrazaloop · T9F: estados derivados de UI y tiempo restante\n");

check("19. Todos los estados derivados tienen etiqueta; enterables correctos", () => {
  for (const state of ["demo_active", "demo_permanent", "demo_expired", "full", "extra", "disabled", "globally_disabled", "coming_soon", "not_assigned"] as const) {
    assert(typeof DERIVED_STATE_LABEL[state] === "string" && DERIVED_STATE_LABEL[state].length > 0, `sin etiqueta: ${state}`);
  }
  assert(isEnterableState("demo_active") && isEnterableState("demo_permanent") && isEnterableState("full") && isEnterableState("extra"), "estados enterables faltan");
  assert(!isEnterableState("demo_expired") && !isEnterableState("disabled") && !isEnterableState("coming_soon") && !isEnterableState("not_assigned"), "estados NO enterables mal marcados");
  assert(DERIVED_STATE_LABEL.demo_expired === "Prueba finalizada", "el vencido debe decir 'Prueba finalizada', no 'Deshabilitado'");
});

check("20. Tiempo restante informativo (48 h → '2 días'; vencido → null)", () => {
  const start = new Date("2026-07-22T15:30:00Z");
  assert(remainingTrialMs(FUTURE, start) === 48 * 3600 * 1000, "deberían quedar 48 h exactas");
  assert(formatRemainingTrial(FUTURE, start) === "2 días", `formato inesperado: ${formatRemainingTrial(FUTURE, start)}`);
  assert(remainingTrialMs(PAST, start) === null && formatRemainingTrial(PAST, start) === null, "vencido no tiene tiempo restante");
  assert(remainingTrialMs(null, start) === null, "permanente no tiene tiempo restante");
});

if (failed > 0) {
  console.error(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(1);
}
console.log(`\nResultado: ${passed} pasaron, 0 fallaron. Todo verde.`);
