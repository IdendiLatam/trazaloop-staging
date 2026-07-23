/**
 * Trazaloop · Sprint T9F.1 · Cierre operativo del control comercial por
 * módulo. Pruebas PURAS (regla canónica, entitlements Full ≡ Extra salvo
 * almacenamiento, Demo temporal ≡ Demo permanente) + ESTRUCTURALES (frontera
 * (cpr) de rutas) + ESTÁTICAS sobre el código real (matriz de Server Actions
 * CPR/Textiles con guard obligatorio, separación del plan legacy, atribución
 * de almacenamiento por módulo, idempotencia de la RPC en 0101, inmutabilidad
 * de 0100, ausencia de service role en cliente).
 *
 * La numeración sigue el plan T9F.1 §24. Las verificaciones que exigen BD
 * viva (RLS, RPC real) viven en tests/rls/t9f1-module-operational-
 * enforcement.test.ts — PREPARADA, no ejecutada desde este entorno.
 *
 * Correr: npx tsx tests/unit/t9f1-module-operational-enforcement.test.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  resolveModuleAccess,
  buildModuleEntitlements,
  functionalLimitsFingerprint,
  accessModeToPlanCode,
  type FunctionalLimit,
} from "../../lib/modules/access";
import {
  CPR_MODULE_CODE,
  TEXTILES_MODULE_CODE,
  isFunctionalModuleCode,
} from "../../lib/modules/catalog";

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

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const stripSql = (s: string) => s.replace(/--[^\n]*/g, "");

const NOW = new Date("2026-06-01T12:00:00Z");
const FUTURE = "2026-06-02T12:00:00Z";
const PAST = "2026-05-30T12:00:00Z";

const base = { isFunctional: true, killSwitchActive: true, now: NOW };

console.log("Trazaloop · T9F.1 §A — Acceso CPR (regla canónica, hora del servidor)\n");

check("1. CPR Demo vigente permite acceso", () => {
  const d = resolveModuleAccess({ ...base, assignment: { enabled: true, accessMode: "demo", accessExpiresAt: FUTURE } });
  assert(d.allowed && d.derivedState === "demo_active", "demo vigente debía permitir");
});

check("2. CPR Demo permanente permite acceso", () => {
  const d = resolveModuleAccess({ ...base, assignment: { enabled: true, accessMode: "demo", accessExpiresAt: null } });
  assert(d.allowed && d.derivedState === "demo_permanent", "demo permanente debía permitir");
});

check("3. CPR Demo vencido bloquea acceso (por FECHA, sin cron)", () => {
  const d = resolveModuleAccess({ ...base, assignment: { enabled: true, accessMode: "demo", accessExpiresAt: PAST } });
  assert(!d.allowed && d.reason === "demo_expired" && d.isExpired, "demo vencido debía bloquear");
});

check("4. CPR deshabilitado bloquea acceso (aunque el modo fuera full)", () => {
  const d = resolveModuleAccess({ ...base, assignment: { enabled: false, accessMode: "full", accessExpiresAt: null } });
  assert(!d.allowed && d.reason === "disabled", "enabled=false debía bloquear");
});

check("5. CPR no asignado bloquea acceso", () => {
  const d = resolveModuleAccess({ ...base, assignment: null });
  assert(!d.allowed && d.reason === "not_assigned", "sin asignación debía bloquear");
});

check("6. CPR Full permite acceso", () => {
  const d = resolveModuleAccess({ ...base, assignment: { enabled: true, accessMode: "full", accessExpiresAt: null } });
  assert(d.allowed && d.derivedState === "full", "full debía permitir");
});

check("7. CPR Extra permite acceso", () => {
  const d = resolveModuleAccess({ ...base, assignment: { enabled: true, accessMode: "extra", accessExpiresAt: null } });
  assert(d.allowed && d.derivedState === "extra", "extra debía permitir");
});

check("8. FRONTERA ESTRUCTURAL: el layout (cpr) del shell aplica requireCprModule y cubre todos los segmentos CPR", () => {
  const layout = stripTs(read("app/(app)/(shell)/(cpr)/layout.tsx"));
  assert(/requireCprModule\(\)/.test(layout), "el layout (cpr) debe ejecutar requireCprModule()");
  assert(/export default async function/.test(layout), "debe ser un layout por defecto");

  // Todo segmento del shell FUERA de (cpr) debe estar en la lista explícita
  // de NO-CPR: una ruta CPR nueva creada fuera de la frontera rompe esta
  // prueba hasta declararla conscientemente.
  const NON_CPR_ALLOWED = new Set(["(cpr)", "textiles", "settings", "support", "team", "layout.tsx"]);
  const entries = readdirSync(join(process.cwd(), "app/(app)/(shell)"));
  const intruders = entries.filter((e) => !NON_CPR_ALLOWED.has(e));
  assert(intruders.length === 0, `segmentos del shell fuera de (cpr) y fuera de la lista no-CPR: ${intruders.join(", ")}`);

  const CPR_SEGMENTS = ["audit-support", "catalog", "dashboard", "diagnostic", "evidences", "guided-flow", "implementation", "imports", "onboarding", "recycled-content", "traceability", "trazadocs"];
  const inCpr = readdirSync(join(process.cwd(), "app/(app)/(shell)/(cpr)"));
  for (const seg of CPR_SEGMENTS) {
    assert(inCpr.includes(seg), `el segmento CPR '${seg}' debe vivir bajo (cpr)`);
  }

  // Vistas de impresión: misma frontera.
  const printLayout = stripTs(read("app/(app)/(print)/(cpr)/layout.tsx"));
  assert(/requireCprModule\(\)/.test(printLayout), "el layout (cpr) de impresión debe ejecutar requireCprModule()");
  const printEntries = readdirSync(join(process.cwd(), "app/(app)/(print)"));
  const printIntruders = printEntries.filter((e) => !["(cpr)", "textiles", "layout.tsx"].includes(e));
  assert(printIntruders.length === 0, `segmentos de impresión fuera de (cpr): ${printIntruders.join(", ")}`);
  const printCpr = readdirSync(join(process.cwd(), "app/(app)/(print)/(cpr)"));
  assert(printCpr.includes("audit-support") && printCpr.includes("trazadocs"), "las vistas de impresión CPR deben vivir bajo (cpr)");
});

// ---------------------------------------------------------------------------
// §B — Matriz de Server Actions CPR: TODA mutación/exportación ejecuta el
// guard comercial en servidor. Verificación por CUERPO REAL de cada función
// exportada (no regex global frágil): se separa el archivo por
// `export async function` y se inspecciona cada cuerpo.
// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.1 §B — Server Actions CPR protegidas\n");

const CPR_GUARDS = [
  "checkCprCanMutate",
  "checkCprResourceLimit",
  "checkCprStorageAvailable",
  "checkCprFeatureEnabled",
  "requireCprForAction",
];

type ActionFnMap = Map<string, string>;
function exportedFunctions(file: string): ActionFnMap {
  const src = read(file);
  const map: ActionFnMap = new Map();
  const re = /export async function (\w+)/g;
  const hits: { name: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) hits.push({ name: m[1], start: m.index });
  hits.forEach((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].start : src.length;
    map.set(h.name, src.slice(h.start, end));
  });
  return map;
}
function bodyHasCprGuard(body: string): boolean {
  return CPR_GUARDS.some((g) => body.includes(`${g}(`));
}

/** Mutaciones/exportaciones CPR por archivo. `delegatesTo` = wrapper que
 *  delega en una acción YA protegida (la protección viaja con la llamada). */
const CPR_MUTATION_MATRIX: Record<string, { guarded: string[]; delegating?: Record<string, string> }> = {
  "server/actions/catalog.ts": {
    guarded: [
      "upsertSupplierAction", "deleteSupplierAction", "upsertFamilyAction", "deleteFamilyAction",
      "upsertProductAction", "deleteProductAction", "upsertMaterialAction", "deleteMaterialAction",
      "reclassifyMaterialAction",
    ],
  },
  "server/actions/diagnostic.ts": {
    guarded: ["startDiagnosticAction", "saveDiagnosticAnswersAction", "completeDiagnosticAction"],
    delegating: { startDiagnosticFormAction: "startDiagnosticAction" },
  },
  "server/actions/evidences.ts": {
    guarded: ["createEvidenceAction", "validateEvidenceAction", "deleteEvidenceAction", "linkEvidenceAction"],
  },
  "server/actions/implementation.ts": {
    guarded: [
      "createImplementationFeedbackAction", "updateImplementationFeedbackAction",
      "updateImplementationFeedbackStatusAction", "deleteImplementationFeedbackAction",
    ],
  },
  "server/actions/import.ts": {
    guarded: ["validateImportAction", "commitImportAction"],
  },
  "server/actions/imports.ts": {
    guarded: ["downloadImportTemplateAction", "validateImportCsvAction", "commitImportAction"],
  },
  "server/actions/recycled.ts": {
    guarded: ["calculateRecycledContentAction"],
  },
  "server/actions/traceability.ts": {
    guarded: [
      "createInputBatchAction", "updateInputBatchAction", "deleteInputBatchAction",
      "createProductionOrderAction", "updateProductionOrderAction", "deleteProductionOrderAction",
      "addBatchConsumptionAction", "updateBatchConsumptionAction", "deleteBatchConsumptionAction",
      "createOutputBatchAction", "updateOutputBatchAction", "deleteOutputBatchAction",
      "addBatchCompositionAction", "updateBatchCompositionAction", "deleteBatchCompositionAction",
    ],
    delegating: {
      validateInputBatchCsvAction: "validateImportAction",
      commitInputBatchCsvAction: "commitImportAction",
    },
  },
  "server/actions/trazadocs.ts": {
    guarded: [
      "createDocumentFromBlueprintAction", "createCustomDocumentAction", "updateDocumentMetadataAction",
      "updateDocumentSectionsAction", "addCustomSectionAction", "deleteDocumentSectionAction",
      "deleteDraftTrazadocDocumentAction", "moveSectionAction", "submitDocumentForReviewAction",
      "approveDocumentAction", "markDocumentObsoleteAction", "reactivateDocumentAction",
      "createDraftVersionFromApprovedAction", "createDocumentVersionAction",
    ],
  },
  "server/actions/trazadocs-master.ts": {
    guarded: [
      "exportDocumentMasterCsvAction", "downloadFileDocumentAction", "uploadFileDocumentAction", "updateFileDocumentMetadataAction",
      "replaceFileDocumentFileAction", "deleteDraftFileDocumentAction", "submitFileDocumentForReviewAction",
      "approveFileDocumentAction", "markFileDocumentObsoleteAction", "reactivateFileDocumentAction",
      "createFileDocumentDraftVersionAction", "updateLiveDocumentCategoryAction",
    ],
  },
  "server/actions/audit-support.ts": {
    guarded: ["exportCalculationDossierJsonAction", "exportEvidenceMatrixCsvAction"],
  },
};

/** Exportadas de solo lectura o de plataforma que legítimamente NO llevan el
 *  guard comercial aunque su nombre parezca de mutación. */
const CPR_READONLY_OR_PLATFORM_EXCEPTIONS = new Set([
  "validateTrazadocTitleAvailabilityAction", // consulta de disponibilidad (solo lectura)
]);

const MUTATION_NAME_RE =
  /^(create|update|upsert|delete|add|move|submit|approve|mark|reactivate|replace|upload|commit|validate|reclassify|calculate|start|save|complete|reorder|link|export|download)/;

check("9/10-19. Toda Server Action CPR sensible ejecuta el guard comercial en su CUERPO (matriz completa)", () => {
  for (const [file, spec] of Object.entries(CPR_MUTATION_MATRIX)) {
    const fns = exportedFunctions(file);
    for (const name of spec.guarded) {
      const body = fns.get(name);
      assert(body, `${file}: no existe la función esperada ${name}`);
      assert(bodyHasCprGuard(body!), `${file}: ${name} no ejecuta ningún guard CPR (checkCpr*/requireCprForAction)`);
    }
    for (const [wrapper, target] of Object.entries(spec.delegating ?? {})) {
      const body = fns.get(wrapper);
      assert(body, `${file}: no existe el wrapper ${wrapper}`);
      assert(body!.includes(`${target}(`), `${file}: ${wrapper} debía delegar en ${target} (protegida)`);
      const targetBody = fns.get(target) ?? exportedFunctions("server/actions/import.ts").get(target);
      assert(targetBody && bodyHasCprGuard(targetBody), `${file}: el destino ${target} de ${wrapper} debe estar protegido`);
    }
  }
});

check("Deriva futura: ninguna exportada CPR con nombre de mutación queda fuera de la matriz sin guard", () => {
  for (const [file, spec] of Object.entries(CPR_MUTATION_MATRIX)) {
    const fns = exportedFunctions(file);
    const declared = new Set([...spec.guarded, ...Object.keys(spec.delegating ?? {})]);
    for (const [name, body] of fns) {
      if (declared.has(name)) continue;
      if (CPR_READONLY_OR_PLATFORM_EXCEPTIONS.has(name)) continue;
      if (body.includes("requirePlatformStaff(")) continue; // acciones de plataforma (superadmin)
      if (!MUTATION_NAME_RE.test(name)) continue; // lecturas (get*/list*)
      assert(
        bodyHasCprGuard(body),
        `${file}: ${name} parece una mutación/exportación CPR nueva sin guard y sin declarar en la matriz`
      );
    }
  }
});

check("Las acciones CPR ya NO llaman a los helpers legacy org-wide", () => {
  for (const file of Object.keys(CPR_MUTATION_MATRIX)) {
    const src = stripTs(read(file));
    for (const legacy of ["checkOrganizationCanMutate", "checkResourceLimit(", "checkStorageAvailable(", "checkFeatureEnabled("]) {
      assert(!src.includes(legacy), `${file} sigue usando el helper legacy ${legacy}`);
    }
    assert(!src.includes('from "@/server/actions/plans"'), `${file} sigue importando de server/actions/plans`);
  }
});

// ---------------------------------------------------------------------------
// §C — Entitlements por módulo
// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.1 §C — Entitlements por módulo\n");

// Fixture espejo del seed 0050 (Demo con límites reducidos; Full/Extra
// ilimitados). Los valores reales viven SOLO en plan_limits/plan_definitions.
const DEMO_LIMITS: FunctionalLimit[] = [
  { resourceCode: "documents_trazadocs", limitValue: 2, isUnlimited: false },
  { resourceCode: "suppliers", limitValue: 1, isUnlimited: false },
  { resourceCode: "materials", limitValue: 5, isUnlimited: false },
  { resourceCode: "products", limitValue: 1, isUnlimited: false },
  { resourceCode: "evidences", limitValue: 1, isUnlimited: false },
  { resourceCode: "production_orders", limitValue: 1, isUnlimited: false },
  { resourceCode: "input_batches", limitValue: 1, isUnlimited: false },
  { resourceCode: "output_batches", limitValue: 1, isUnlimited: false },
  { resourceCode: "roles_enabled", limitValue: 0, isUnlimited: false },
  { resourceCode: "diagnostic_recommendations_enabled", limitValue: 0, isUnlimited: false },
];
const UNLIMITED: FunctionalLimit[] = DEMO_LIMITS.map((l) => ({
  resourceCode: l.resourceCode,
  limitValue: l.resourceCode.endsWith("_enabled") ? 1 : null,
  isUnlimited: !l.resourceCode.endsWith("_enabled"),
}));

check("20-23/40. Los helpers por módulo resuelven límites y cuota desde el plan DEL MÓDULO, jamás desde organization_subscriptions", () => {
  const src = stripTs(read("server/actions/module-plans.ts"));
  assert(src.includes("accessModeToPlanCode"), "los límites deben derivar del access_mode del módulo");
  // T9F.2: el uso llega por la capa TIPADA fail-closed y la decisión de
  // límites por la RPC en BD (check_module_resource_allowance) — mismo
  // invariante: la fuente es la vista por módulo de 0101, nunca el legacy.
  assert(
    src.includes("fetchOrganizationModuleUsage") && src.includes("check_module_resource_allowance"),
    "el uso debe leerse de la vista por módulo (0101) con resultado verificado"
  );
  assert(!/legacyUsage\.(planCode|storage)/.test(src), "el plan/almacenamiento legacy no puede usarse en decisiones");
  assert(!src.includes("organization_subscriptions"), "no debe consultarse organization_subscriptions");
  // El único uso permitido de la capa legacy es el ESTADO administrativo:
  assert(src.includes("buildPlanStatusMessage(legacyUsage.planStatus)"), "el estado de cuenta (suspended/cancelled) se conserva como bloqueo administrativo");
});

check("24-25. CPR y Textiles pueden coexistir con planes distintos (la resolución es por moduleCode, sin estado compartido)", () => {
  const cprDemo = buildModuleEntitlements("demo", DEMO_LIMITS, 52428800);
  const texExtra = buildModuleEntitlements("extra", UNLIMITED, 5368709120);
  assert(cprDemo.storageLimitBytes !== texExtra.storageLimitBytes, "cada módulo conserva su cuota");
  assert(cprDemo.isDemo && !texExtra.isDemo, "cada módulo conserva su modo");
  const cprFull = buildModuleEntitlements("full", UNLIMITED, 524288000);
  const texDemo = buildModuleEntitlements("demo", DEMO_LIMITS, 52428800);
  assert(cprFull.storageLimitBytes > texDemo.storageLimitBytes, "CPR Full + Textiles Demo coexisten con cuotas independientes");
});

check("26. Demo temporal y Demo permanente tienen exactamente los mismos límites funcionales", () => {
  // Ambos comparten access_mode='demo' → mismo plan_code → mismos límites.
  assert(accessModeToPlanCode("demo") === "demo", "demo mapea 1:1 a plan demo");
  const temporal = buildModuleEntitlements("demo", DEMO_LIMITS, 52428800);
  const permanente = buildModuleEntitlements("demo", DEMO_LIMITS, 52428800);
  assert(
    functionalLimitsFingerprint(temporal) === functionalLimitsFingerprint(permanente),
    "demo temporal y permanente deben compartir límites"
  );
});

check("27-28. Full y Extra: mismas funciones y mismos límites; difieren SOLO en storageLimitBytes (comparación profunda)", () => {
  const full = buildModuleEntitlements("full", UNLIMITED, 524288000);
  const extra = buildModuleEntitlements("extra", UNLIMITED, 5368709120);
  assert(
    functionalLimitsFingerprint(full) === functionalLimitsFingerprint(extra),
    "Full y Extra deben ser idénticos tras excluir almacenamiento"
  );
  assert(full.storageLimitBytes !== extra.storageLimitBytes, "la única diferencia admitida es la cuota");
  const normalize = (e: typeof full) => {
    const clone: Record<string, unknown> = { ...e, functionalLimits: functionalLimitsFingerprint(e) };
    delete clone.storageLimitBytes; // ÚNICO campo excluido de la comparación profunda
    delete clone.accessMode;
    delete clone.isDemo; // derivados del modo, no funcionalidades
    return JSON.stringify(clone);
  };
  assert(normalize(full) === normalize(extra), "sin el almacenamiento, los entitlements normalizados deben ser iguales");
});

check("29-30. Códigos canónicos: CPR=traceability_6632, Textiles=textiles, sin strings repetidos en los helpers", () => {
  assert(CPR_MODULE_CODE === "traceability_6632", "código canónico CPR");
  assert(TEXTILES_MODULE_CODE === "textiles", "código canónico Textiles");
  const src = stripTs(read("server/actions/module-plans.ts"));
  assert(src.includes("CPR_MODULE_CODE") && src.includes("TEXTILES_MODULE_CODE"), "los wrappers usan las constantes canónicas");
  assert(!src.includes('"traceability_6632"'), "module-plans no repite el string del código CPR");
  const guardCpr = stripTs(read("lib/auth/require-cpr-module.ts"));
  assert(guardCpr.includes("CPR_MODULE_CODE"), "el guard CPR usa la constante canónica");
});

check("63. moduleCode arbitrario es rechazado por los helpers (isFunctionalModuleCode) y por la RPC (m.is_functional)", () => {
  assert(!isFunctionalModuleCode("quality"), "quality no es operable");
  assert(!isFunctionalModuleCode("construccion"), "construccion no es operable");
  assert(!isFunctionalModuleCode("hacker_module"), "códigos arbitrarios no son operables");
  const src = stripTs(read("server/actions/module-plans.ts"));
  assert(/if \(!isFunctionalModuleCode\(moduleCode\)\)/.test(src), "resolveModuleGate debe rechazar moduleCode no funcional ANTES de tocar BD");
});

// ---------------------------------------------------------------------------
// §D — Almacenamiento por módulo
// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.1 §D — Cuotas de almacenamiento por módulo\n");

const MIG101 = stripSql(read("supabase/migrations/0101_t9f1_module_access_hardening.sql"));

check("31-34/37-38. La vista 0101 separa el uso por módulo con atribución FÍSICA correcta (CPR ≠ Textiles, sin cruce, sin doble conteo)", () => {
  assert(/create or replace view public\.v_organization_module_usage/.test(MIG101), "debe crear la vista por módulo");
  assert(/'traceability_6632'::text\s+as module_code/.test(MIG101), "fila CPR con código canónico");
  assert(/'textiles'::text\s+as module_code/.test(MIG101), "fila Textiles con código canónico");
  // T9F.2: el almacenamiento se calcula sobre OBJETOS FÍSICOS deduplicados
  // por (bucket, ruta), en CTEs separados por módulo.
  const cprObjs = MIG101.slice(MIG101.indexOf("with cpr_objects as"), MIG101.indexOf("textile_objects as"));
  const texObjs = MIG101.slice(MIG101.indexOf("textile_objects as"), MIG101.indexOf("'traceability_6632'::text"));
  assert(/from public\.evidences/.test(cprObjs), "CPR incluye evidences.storage_path");
  assert(/from public\.trazadoc_file_documents/.test(cprObjs), "CPR incluye el archivo actual del maestro");
  assert(/from public\.trazadoc_file_document_versions/.test(cprObjs), "CPR incluye TODAS las versiones históricas (Bloqueador 4)");
  assert(/storage_orphan_candidates/.test(cprObjs), "CPR incluye los candidatos huérfanos contabilizables");
  assert(!/textile_evidences/.test(cprObjs), "la rama CPR no puede sumar bytes textiles");
  assert(/from public\.textile_evidences/.test(texObjs), "Textiles suma textile_evidences.file_path/file_size_bytes");
  assert(!/trazadoc_file_document/.test(texObjs), "la rama Textiles no puede sumar el maestro documental CPR");
  // Deduplicación real: identidad física + máximo + bandera de conflicto.
  assert(/group by organization_id, bucket_id, object_path/.test(MIG101), "dedup por (org, bucket, ruta)");
  assert(/max\(size_bytes\) as size_bytes/.test(MIG101), "ante tamaños contradictorios se toma el máximo (conservador)");
  assert(/count\(distinct size_bytes\) > 1/.test(MIG101), "los conflictos de tamaño quedan expuestos (storage_object_conflicts)");
  assert(/storage_object_conflicts/.test(MIG101), "la vista expone storage_object_conflicts");
  // TrazaDocs por module_key servido en servidor; logo global fuera.
  assert(/module_key = 'cpr'/.test(MIG101) && /module_key = 'textiles'/.test(MIG101), "los documentos TrazaDocs se separan por module_key");
  assert(!/logo_size_bytes/.test(MIG101), "el logo (global) no se atribuye a ningún módulo");
  // Guarda de seguridad embebida (patrón 0052) en AMBAS ramas.
  assert((MIG101.match(/is_org_member\(o\.id\) or public\.is_platform_staff\(\)/g) ?? []).length >= 2, "ambas ramas deben llevar la guarda is_org_member/is_platform_staff");
});

check("18/35-36. Las cargas validan cuota DEL MÓDULO en servidor: begin de evidencias Textiles usa checkTextilesStorageAvailable tras el guard de módulo", () => {
  const src = stripTs(read("server/actions/textiles-evidences.ts"));
  assert(src.includes("checkTextilesStorageAvailable("), "la carga textil valida la cuota Textiles");
  assert(!src.includes("checkStorageAvailable("), "no debe quedar la validación org-wide legacy");
  assert(src.includes("requireTextilesForAction"), "el gate de módulo (Demo vencido/deshabilitado/no asignado bloquean) se conserva");
  assert(src.includes("checkTextilesCanMutate"), "el estado de cuenta + acceso del módulo se validan antes de iniciar la carga");
});

check("Las cargas CPR (evidencias y maestro documental) validan cuota CPR", () => {
  const ev = stripTs(read("server/actions/evidences.ts"));
  assert(ev.includes("checkCprStorageAvailable("), "createEvidenceAction valida cuota CPR");
  const master = stripTs(read("server/actions/trazadocs-master.ts"));
  assert(master.includes("checkCprStorageAvailable("), "el maestro documental valida cuota CPR");
});

check("39. El cliente no decide cuota/plan/uso/módulo: los helpers son server actions que resuelven todo con la sesión", () => {
  const src = read("server/actions/module-plans.ts");
  assert(src.startsWith('"use server"'), "module-plans es server-only");
  assert(src.includes("requireActiveOrg()"), "la organización sale SIEMPRE de la sesión validada");
  assert(!/organizationId\s*:\s*string.*param/i.test(src.split("resolveModuleGate")[0]), "los helpers no aceptan organization_id del cliente");
  const usage = read("lib/db/module-usage.ts");
  assert(usage.includes('import "server-only"'), "la capa de uso por módulo es server-only");
});

// ---------------------------------------------------------------------------
// §E — Idempotencia REAL de la RPC (0101)
// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.1 §E — Idempotencia de set_organization_module_access (0101)\n");

const RPC = MIG101.slice(
  MIG101.indexOf("function public.set_organization_module_access"),
  MIG101.indexOf("comment on function public.set_organization_module_access")
);

check("41-44. Estado idéntico (Full→Full, Extra→Extra, Demo perm.→Demo perm., Deshabilitado→Deshabilitado) devuelve changed=false", () => {
  assert(/v_before\.id is not null/.test(RPC), "el no-op exige fila existente");
  assert(/v_before\.enabled = v_enabled/.test(RPC), "compara enabled");
  assert(/v_before\.access_mode = v_mode/.test(RPC), "compara access_mode");
  assert(/v_before\.access_expires_at is not distinct from v_expires/.test(RPC), "compara access_expires_at con null-safety");
  assert(/'changed', false/.test(RPC), "el no-op devuelve changed=false con el estado actual");
});

check("45-47. Un no-op NO ejecuta UPDATE (updated_at/updated_by intactos) y NO crea auditoría", () => {
  const noopReturn = RPC.indexOf("'changed', false");
  const firstUpdate = RPC.indexOf("update organization_modules");
  const audit = RPC.indexOf("perform log_event");
  assert(noopReturn > -1 && firstUpdate > -1 && audit > -1, "estructura esperada de la función");
  assert(noopReturn < firstUpdate, "el retorno del no-op debe ocurrir ANTES de cualquier UPDATE");
  assert(noopReturn < audit, "el retorno del no-op debe ocurrir ANTES de log_event");
  // El bloque del no-op devuelve updated_at del estado PREVIO, sin now().
  const noopBlock = RPC.slice(RPC.indexOf("if v_before.id is not null\n"), noopReturn + 400);
  assert(/'updated_at', v_before\.updated_at/.test(noopBlock), "el no-op devuelve el updated_at previo, sin modificarlo");
});

check("48-50. Una transición real devuelve changed=true y crea EXACTAMENTE un evento de auditoría", () => {
  assert(/'changed', true/.test(RPC), "la transición real devuelve changed=true");
  assert((RPC.match(/perform log_event/g) ?? []).length === 1, "debe existir exactamente UNA emisión de auditoría en la función");
  assert(/'organization_module_access_changed'/.test(RPC), "el evento semántico se conserva");
});

check("La RPC de 0101 conserva la seguridad de 0100: superadmin en SQL, search_path, módulo funcional, estados válidos, grants mínimos, sin SQL dinámico", () => {
  assert(/is_platform_superadmin\(\)/.test(RPC), "re-verifica superadmin en SQL");
  assert(/security definer/.test(RPC) && /set search_path = public/.test(RPC), "definer + search_path seguro");
  assert(/m\.code = p_module_code and m\.is_functional/.test(RPC), "rechaza módulos no funcionales");
  assert(/p_target_state not in \('disabled', 'demo_permanent', 'full', 'extra'\)/.test(RPC), "valida el estado objetivo");
  assert(!/execute\s+format/i.test(RPC) && !/execute\s+'/i.test(RPC), "sin SQL dinámico");
  assert(/revoke all on function public\.set_organization_module_access\(uuid, text, text\) from public, anon/.test(MIG101), "revoca public/anon");
  assert(/grant execute on function public\.set_organization_module_access\(uuid, text, text\) to authenticated/.test(MIG101), "grant mínimo a authenticated (superadmin verificado dentro)");
});

check("0101 es ADITIVA: sin TRUNCATE, sin DROP destructivo, sin DELETE, sin backfill masivo, sin tocar Storage RLS/planes", () => {
  const lower = MIG101.toLowerCase();
  assert(!/truncate/.test(lower), "sin TRUNCATE");
  assert(!/drop table/.test(lower) && !/drop function/.test(lower), "sin DROP destructivo");
  {
    // T9F.4 · §9: retirar una política PERMISIVA de DELETE ENDURECE la RLS
    // (no borra datos ni capacidades del servidor) — los ÚNICOS drop policy
    // admitidos son EXACTAMENTE las tres políticas de DELETE directo
    // sustituidas por las RPCs seguras de §3.
    const drops = lower.match(/drop policy[^;]+;/g) ?? [];
    assert(drops.length === 3, "solo los tres drop policy de DELETE directo de §3b");
    for (const expected of [
      "drop policy trazadoc_file_documents_delete on public.trazadoc_file_documents;",
      "drop policy evidences_delete on public.evidences;",
      "drop policy textile_evidences_delete on public.textile_evidences;",
    ]) {
      assert(drops.includes(expected), `drop policy inesperado o ausente: ${expected}`);
    }
  }
  {
    // T9F.3/T9F.4: los ÚNICOS DELETE son los de DOMINIO dentro de las RPCs
    // atómicas — encolado (trazadoc draft, evidencia CPR, evidencia textil,
    // misma transacción que crea el pending_delete) y el DESCARTE del
    // borrador VACÍO del maestro (sin objeto ni versiones). Sin limpieza de
    // datos, sin backfill, sin borrado masivo.
    const deletes = lower.match(/\bdelete from\b[^;]+;/g) ?? [];
    assert(deletes.length === 4, "solo los cuatro DELETE de dominio de las RPCs seguras");
    assert(deletes.every((d) => d.includes("where id = v_")), "cada DELETE apunta a UNA fila de dominio autorizada");
  }
  assert(!/update public\.organization_modules/.test(lower.replace(/update organization_modules\s+set enabled/g, "")), "sin backfill masivo de organization_modules");
  assert(!/storage\.objects/.test(lower), "no toca Storage RLS (0099)");
  assert(!/insert into public\.plan_definitions/.test(lower) && !/insert into public\.plan_limits/.test(lower), "no crea planes ni modifica cuotas comerciales");
});

// ---------------------------------------------------------------------------
// §F — Legacy: organization_subscriptions no gobierna CPR/Textiles
// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.1 §F — Separación del plan legacy\n");

const MIG100_SHA256 = "0bfe816794287b2b5fcbcebc0cbca7fa3db677cdd20e289cb81bc5f8008eea41";

check("11(§4). La migración 0100 permanece INTACTA (hash fijado) y 0101 existe como migración aditiva separada", () => {
  const raw = readFileSync(join(process.cwd(), "supabase/migrations/0100_organization_module_access_modes_and_demo_trial.sql"));
  const sha = createHash("sha256").update(raw).digest("hex");
  assert(sha === MIG100_SHA256, `0100 fue modificada (sha256 ${sha})`);
  const migs = readdirSync(join(process.cwd(), "supabase/migrations"));
  assert(migs.includes("0101_t9f1_module_access_hardening.sql"), "0101 debe existir como archivo nuevo");
  assert(migs.filter((f) => f.startsWith("0100")).length === 1, "no debe existir ninguna variante de 0100");
});

check("51-52. Los helpers Textiles/CPR no leen el plan legacy; las acciones Textiles usan SOLO helpers por módulo", () => {
  const textiles = readdirSync(join(process.cwd(), "server/actions")).filter((f) => f.startsWith("textiles-"));
  assert(textiles.length >= 10, "deben existir las acciones Textiles");
  for (const f of textiles) {
    const src = stripTs(read(`server/actions/${f}`));
    assert(!src.includes('from "@/server/actions/plans"'), `${f} no debe importar los helpers legacy`);
    assert(!src.includes("checkOrganizationCanMutate"), `${f} no debe usar checkOrganizationCanMutate`);
  }
});

check("53-54(§20). Toda empresa nueva sigue iniciando con CPR y Textiles en Demo de 48 horas (provisión 0100 intacta)", () => {
  const mig = stripSql(read("supabase/migrations/0100_organization_module_access_modes_and_demo_trial.sql"));
  const fn = mig.slice(mig.indexOf("function public.provision_new_organization_modules"));
  const body = fn.slice(0, fn.indexOf("revoke all on function public.provision"));
  assert(/now\(\) \+ interval '48 hours'/.test(body), "Demo de exactamente 48 h");
  assert(/where m\.is_functional/.test(body), "solo módulos funcionales (CPR y Textiles)");
  assert((mig.match(/perform provision_new_organization_modules\(v_org, v_user\)/g) ?? []).length >= 2, "autorregistro Y creación desde plataforma provisionan igual");
});

check("55(§20). create_platform_organization ya no recibe un plan elegible: el action fuerza 'demo' y el formulario no tiene selector", () => {
  const action = stripTs(read("server/actions/platform.ts"));
  assert(/planCode: "demo" as const/.test(action), "el action debe forzar plan legacy demo");
  assert(!/formData\.get\("plan_code"\)/.test(action), "el action no debe leer plan_code del cliente");
  const form = read("components/domain/platform/create-organization-form.tsx");
  assert(!/name="plan_code"/.test(form), "el formulario no debe tener selector de plan general");
  assert(!/PLAN_OPTIONS/.test(form), "sin opciones de plan en la creación");
});

check("56(§21). La interfaz no muestra dos controles comerciales contradictorios: sin PlanChangeForm y plan legacy etiquetado como heredado", () => {
  const detail = read("app/(app)/platform/organizations/[id]/page.tsx");
  assert(!/import \{ PlanChangeForm \}/.test(detail), "el detalle no debe importar PlanChangeForm");
  assert(/Plan heredado/.test(detail), "el plan legacy debe etiquetarse como heredado");
  assert(/OrganizationModulesSection/.test(detail), "la sección operativa sigue siendo Módulos y planes");
  const table = read("components/domain/platform/organizations-table.tsx");
  assert(/Plan heredado/.test(table), "la tabla debe etiquetar el plan como heredado");
});

check("El dashboard y el onboarding CPR muestran el plan DEL MÓDULO, no el legacy", () => {
  const dash = stripTs(read("app/(app)/(shell)/(cpr)/dashboard/page.tsx"));
  assert(dash.includes("getModulePlanUsageSummary") && dash.includes("CPR_MODULE_CODE"), "el dashboard usa el resumen por módulo CPR");
  assert(!dash.includes("getOrganizationUsage("), "el dashboard no lee el uso legacy directamente");
  const onb = stripTs(read("app/(app)/(shell)/(cpr)/onboarding/page.tsx"));
  assert(onb.includes("getModulePlanUsageSummary") && onb.includes("CPR_MODULE_CODE"), "el onboarding usa el resumen por módulo CPR");
});

// ---------------------------------------------------------------------------
// §G — Seguridad
// ---------------------------------------------------------------------------
console.log("\nTrazaloop · T9F.1 §G — Seguridad\n");

check("57-62(estático). Solo el superadministrador cambia planes: RPC re-verifica en SQL y el action re-verifica en servidor", () => {
  assert(/is_platform_superadmin\(\)/.test(RPC), "la RPC exige superadmin (bloquea admin/supervisor/consultor/usuario/otra empresa)");
  const action = stripTs(read("server/actions/platform-modules.ts"));
  assert(/isSuperadmin/.test(action) && /requirePlatformStaff/.test(action), "el action exige superadmin antes de la RPC");
  assert(/revoke all on function public\.set_organization_module_access\(uuid, text, text\) from public, anon/.test(MIG101), "anon no puede ejecutar la RPC");
});

check("64. access_mode arbitrario es imposible: CHECK de 0100 + estados objetivo cerrados en RPC y action", () => {
  const mig100 = stripSql(read("supabase/migrations/0100_organization_module_access_modes_and_demo_trial.sql")).toLowerCase();
  assert(/access_mode in \('demo', 'full', 'extra'\)/.test(mig100), "CHECK de access_mode intacto");
  assert(/p_target_state not in \('disabled', 'demo_permanent', 'full', 'extra'\)/.test(RPC), "la RPC cierra los estados objetivo");
  const action = stripTs(read("server/actions/platform-modules.ts"));
  assert(/\["disabled", "demo_permanent", "full", "extra"\]/.test(action), "el action valida el estado objetivo en servidor");
});

check("65. No existe service role en código de cliente", () => {
  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const e of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p, acc);
      else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
    }
    return acc;
  };
  const clientFiles = [...walk("components"), ...walk("app")].filter((p) => {
    const src = read(p);
    return src.startsWith('"use client"') || src.includes('\n"use client"');
  });
  for (const p of clientFiles) {
    const src = read(p);
    assert(!/SERVICE_ROLE/i.test(src), `${p} no puede referenciar service role`);
    assert(!src.includes("createAdminClient"), `${p} no puede usar el cliente administrativo`);
  }
  const usage = read("lib/db/module-usage.ts");
  assert(!usage.includes("createAdminClient"), "la capa de uso por módulo corre con la sesión real, sin service role");
});

console.log(`\nT9F.1 unit/estático: ${passed} ✔, ${failed} ✘\n`);
if (failed > 0) process.exit(1);
