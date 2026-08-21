/**
 * Trazaloop · RH-01 · Release Hardening v1.0.x.
 *
 * Demuestra los seis cierres del sprint y sus invariantes:
 *   A. La consola de superadministrador presenta el PLAN EFECTIVO como dato
 *      comercial principal (y el legacy solo como histórico rotulado).
 *   B. checkStorageAvailable resuelve la cuota por el PLAN EFECTIVO
 *      (Demo 50 MB · Full 500 MB · Extra 5 GB) sin desactivar el control.
 *   C. La nomenclatura visible se normaliza en los puntos de render.
 *   D. Ningún identificador técnico cambió.
 *   E. /catalog/customer-requirements es accesible desde el hub Catálogo.
 *   F. /audit-prep está integrado al registro de navegación del módulo PCR.
 *   G. Los artefactos accidentales desaparecieron.
 *   H-J. Las migraciones no cambiaron: 0110 sigue siendo la última y no
 *      existe ninguna 0111+.
 *
 * Correr: npm run test:rh01
 */
import fs from "node:fs";
import path from "node:path";

import {
  resolveEffectiveStorageLimitBytes,
  hasStorageAvailable,
} from "../../lib/plans/limits";
import { buildEffectiveStorageUsage } from "../../lib/plans/usage";
import { PLAN_CODES, type PlanCode } from "../../lib/plans/types";
import {
  normalizeVisibleText,
  normalizeVisibleTexts,
  containsLegacyNomenclature,
  VISIBLE_NOMENCLATURE_RULES,
} from "../../lib/domain/nomenclature";
import {
  AUDIT_PREP_GROUP,
  CPR_SHELL_MODULE,
  TEXTILES_SHELL_MODULE,
  resolveShellModuleForPath,
  isShellNavLinkActive,
} from "../../lib/modules/registry";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const repoRoot = path.join(__dirname, "../..");
const readRepoFile = (rel: string): string => fs.readFileSync(path.join(repoRoot, rel), "utf8");

/** Recorre recursivamente un directorio devolviendo rutas relativas al repo. */
function walkFiles(relDir: string, matcher: RegExp): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (matcher.test(entry.name)) out.push(path.relative(repoRoot, full));
    }
  };
  walk(path.join(repoRoot, relDir));
  return out;
}

// Cuotas comerciales vigentes (seed de 0050). No se modifican en este sprint:
// se leen de la migración para que el test falle si alguien las tocara.
const MB = 1048576;
const EXPECTED_QUOTAS: Record<PlanCode, number> = {
  demo: 50 * MB, // 52428800
  full: 500 * MB, // 524288000
  extra: 5 * 1024 * MB, // 5368709120
};

console.log("Trazaloop · RH-01 · Release Hardening v1.0.x\n");

// ===========================================================================
// B · checkStorageAvailable con el PLAN EFECTIVO
// ===========================================================================
console.log("RH-01.2 · Almacenamiento del logo resuelto por el plan efectivo");

check("1. Las cuotas del seed 0050 siguen siendo Demo 50 MB / Full 500 MB / Extra 5 GB", () => {
  const seed = readRepoFile("supabase/migrations/0050_plans_and_usage.sql");
  for (const code of PLAN_CODES) {
    const expected = EXPECTED_QUOTAS[code];
    const re = new RegExp(`\\('${code}',[^)]*?,\\s*${expected}\\)`);
    assert(re.test(seed), `la cuota de ${code} debía seguir siendo ${expected} bytes en 0050`);
  }
});

/** Definiciones tal como las devuelve listPlanDefinitions() (plan_definitions). */
const PLAN_DEFINITIONS = PLAN_CODES.map((code) => ({
  code,
  storageLimitBytes: EXPECTED_QUOTAS[code],
}));

check("2. Caso Demo: la cuota efectiva es la de Demo y CONSERVA los 50 MB", () => {
  const limit = resolveEffectiveStorageLimitBytes(PLAN_DEFINITIONS, "demo", EXPECTED_QUOTAS.full);
  assert(limit === EXPECTED_QUOTAS.demo, `Demo efectivo debía dar 50 MB, dio ${limit}`);
  // Aunque la suscripción LEGACY dijera Full, el plan efectivo Demo manda:
  // con 49 MB usados caben 1 MB, pero no 2 MB.
  assert(
    hasStorageAvailable(49 * MB, limit, 1 * MB),
    "Demo con 49 MB usados debía admitir 1 MB más"
  );
  assert(
    !hasStorageAvailable(49 * MB, limit, 2 * MB),
    "Demo con 49 MB usados NO debía admitir 2 MB más: el control se conserva"
  );
});

check("3. Caso Full: cuota efectiva Full y NO queda bloqueado por los 50 MB legacy", () => {
  // Escenario real del defecto: agregado legacy por encima de 50 MB, plan
  // legacy Demo (cuota 50 MB) y plan efectivo Full por módulos.
  const legacyLimit = EXPECTED_QUOTAS.demo;
  const usedBytes = 120 * MB;
  assert(
    !hasStorageAvailable(usedBytes, legacyLimit, 1 * MB),
    "precondición: con la cuota legacy el logo quedaba bloqueado"
  );

  const limit = resolveEffectiveStorageLimitBytes(PLAN_DEFINITIONS, "full", legacyLimit);
  assert(limit === EXPECTED_QUOTAS.full, `Full efectivo debía dar 500 MB, dio ${limit}`);
  assert(
    hasStorageAvailable(usedBytes, limit, 2 * MB),
    "una empresa Full con 120 MB usados debía poder subir su logo"
  );
  // El control sigue existiendo: por encima de 500 MB se bloquea igual.
  assert(
    !hasStorageAvailable(499 * MB, limit, 2 * MB),
    "Full por encima de su cuota debía seguir bloqueado"
  );
});

check("4. Caso Extra: cuota efectiva Extra (5 GB), misma funcionalidad que Full", () => {
  const limit = resolveEffectiveStorageLimitBytes(PLAN_DEFINITIONS, "extra", EXPECTED_QUOTAS.demo);
  assert(limit === EXPECTED_QUOTAS.extra, `Extra efectivo debía dar 5 GB, dio ${limit}`);
  assert(
    hasStorageAvailable(600 * MB, limit, 10 * MB),
    "Extra con 600 MB usados debía admitir 10 MB más"
  );
  assert(
    !hasStorageAvailable(5 * 1024 * MB, limit, 1),
    "Extra en su tope debía bloquear: la diferencia comercial es la cuota, no la ausencia de control"
  );
  // Full y Extra solo se diferencian en almacenamiento.
  assert(
    EXPECTED_QUOTAS.extra > EXPECTED_QUOTAS.full,
    "Extra debía tener MÁS almacenamiento que Full"
  );
});

check("5. Fail-safe: si plan_definitions no se pudo leer se conserva la cuota legacy", () => {
  const limit = resolveEffectiveStorageLimitBytes([], "full", EXPECTED_QUOTAS.demo);
  assert(
    limit === EXPECTED_QUOTAS.demo,
    "sin definiciones de plan debía caer a la cuota legacy, nunca a ilimitado"
  );
  const zeroed = resolveEffectiveStorageLimitBytes(
    [{ code: "full", storageLimitBytes: 0 }],
    "full",
    EXPECTED_QUOTAS.demo
  );
  assert(zeroed === EXPECTED_QUOTAS.demo, "una cuota no positiva no debía anular el control");
});

check("6. checkStorageAvailable deriva la cuota del plan efectivo (no de usage.storageLimitBytes)", () => {
  const src = readRepoFile("server/actions/plans.ts");
  const body = src.slice(
    src.indexOf("export async function checkStorageAvailable"),
    src.indexOf("function resourceCurrentCount")
  );
  assert(body.length > 0, "no se pudo aislar el cuerpo de checkStorageAvailable");
  assert(
    body.includes("getOrganizationEffectivePlanCode(org.organizationId)"),
    "debía resolver el plan EFECTIVO igual que checkResourceLimit/checkFeatureEnabled"
  );
  assert(body.includes("listPlanDefinitions()"), "debía leer las cuotas de plan_definitions");
  assert(
    body.includes("resolveEffectiveStorageLimitBytes("),
    "debía usar el helper puro de resolución de cuota"
  );
  assert(
    /hasStorageAvailable\(\s*usage\.storageUsedBytes,\s*limitBytes,/.test(body),
    "la comparación debía usar la cuota efectiva (limitBytes), no usage.storageLimitBytes"
  );
  assert(body.includes("STORAGE_LIMIT_MESSAGE"), "el control de almacenamiento NO debía quitarse");
  // El uso sigue siendo el agregado org-wide y el estado administrativo sigue bloqueando.
  assert(body.includes("checkPlanStatusBlocking(usage)"), "suspended/cancelled debía seguir bloqueando");
});

check("7. MAX_LOGO_SIZE_BYTES y la subida del logo quedan intactos", () => {
  assert(
    readRepoFile("lib/domain/settings.ts").includes("export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;"),
    "MAX_LOGO_SIZE_BYTES no debía cambiar"
  );
  assert(
    readRepoFile("server/actions/settings.ts").includes("checkStorageAvailable(file.size)"),
    "la subida del logo debía seguir pasando por checkStorageAvailable"
  );
});

// ===========================================================================
// A · Plan efectivo como dato comercial principal en Superadmin
// ===========================================================================
console.log("\nRH-01.1 · Plan efectivo en la consola del superadministrador");

check("8. La consola resuelve el plan efectivo por la RPC autorizada (0103), no por el legacy", () => {
  const db = readRepoFile("lib/db/plans.ts");
  assert(
    db.includes("export async function listOrganizationEffectivePlanCodes("),
    "faltaba el lector masivo de plan efectivo para la consola"
  );
  const helper = db.slice(db.indexOf("export async function listOrganizationEffectivePlanCodes("));
  assert(
    helper.includes("getOrganizationEffectivePlanCode(id)"),
    "debía reutilizar la lectura autorizada por RPC, no consultar tablas legacy"
  );
  const rpcSrc = readRepoFile("supabase/migrations/0103_pcr01_effective_plan_and_input_batch_quantity.sql");
  assert(
    rpcSrc.includes("is_org_member(p_organization_id) or is_platform_staff()"),
    "la RPC 0103 debía seguir autorizando a platform_staff (sin service_role en la consola)"
  );
});

check("9. /platform muestra el PLAN EFECTIVO y degrada el legacy a histórico", () => {
  const page = readRepoFile("app/(app)/platform/page.tsx");
  assert(
    page.includes("listOrganizationEffectivePlanCodes("),
    "la página debía obtener el plan efectivo de cada empresa"
  );
  assert(
    page.includes("effectivePlanCode: effectivePlanByOrgId[o.organizationId]"),
    "el plan efectivo debía viajar a la tabla como dato principal"
  );
  assert(
    page.includes("legacyPlanCode: u?.planCode"),
    "el planCode legacy debía viajar rotulado como legacy, no como el plan vigente"
  );

  const table = readRepoFile("components/domain/platform/organizations-table.tsx");
  assert(
    table.includes("PLAN_LABEL[plan.effectivePlanCode]"),
    "la celda principal debía renderizar el plan EFECTIVO"
  );
  assert(
    !/PLAN_LABEL\[plan\.planCode\]/.test(table),
    "la tabla no debía seguir presentando el planCode legacy como plan vigente"
  );
  assert(table.includes("Plan efectivo"), "el encabezado de la columna debía decir Plan efectivo");
  assert(
    /Plan heredado \(hist[óo]rico \/ administrativo\)/i.test(table),
    "el dato legacy debía quedar rotulado como plan heredado histórico/administrativo (invariante T9F.1 §21)"
  );
});

check("10. El detalle de empresa encabeza con el plan efectivo y usa SUS límites", () => {
  const detail = readRepoFile("app/(app)/platform/organizations/[id]/page.tsx");
  assert(
    detail.includes("PLAN_LABEL[planDetail.effectivePlanCode]"),
    "el detalle debía mostrar el plan efectivo de forma destacada"
  );
  assert(
    detail.includes("getPlanLimits(planDetail.effectivePlanCode)"),
    "los límites mostrados debían ser los del plan EFECTIVO"
  );
  assert(
    !detail.includes("getPlanLimits(planDetail.usage.planCode)"),
    "ya no debían mostrarse los límites del plan legacy"
  );
  assert(
    detail.includes("effectiveStorageLimitBytes={planDetail.effectiveStorageLimitBytes}"),
    "la tarjeta debía recibir la cuota real que aplica el servidor"
  );

  const action = readRepoFile("server/actions/plans.ts");
  const detailAction = action.slice(
    action.indexOf("export async function getOrganizationPlanDetailAction"),
    action.indexOf("export async function changeOrganizationPlanAction")
  );
  assert(
    detailAction.includes("getOrganizationEffectivePlanCode(organizationId)"),
    "la action debía resolver el plan efectivo"
  );
  assert(
    detailAction.includes("resolveEffectiveStorageLimitBytes("),
    "la cuota devuelta debía derivarse del plan efectivo, igual que la que aplica el servidor"
  );
});

check("11. La tarjeta de plan/uso presenta el efectivo y recalcula la cuota mostrada", () => {
  const card = readRepoFile("components/domain/plans/plan-usage-card.tsx");
  assert(
    card.includes("PLAN_LABEL[effectivePlanCode ?? usage.planCode]"),
    "el título debía preferir el plan efectivo cuando se conoce"
  );
  assert(
    card.includes("buildEffectiveStorageUsage(usage.storageUsedBytes, effectiveStorageLimitBytes)"),
    "el denominador de almacenamiento debía recalcularse con la cuota efectiva"
  );
  assert(
    /Plan heredado \(hist[óo]rico \/ administrativo\)/.test(card),
    "el plan legacy debía quedar rotulado como histórico/administrativo"
  );
});

check("12. El «0 MB / 50 MB» de una empresa Full desaparece con la cuota efectiva", () => {
  // Cifras del defecto: la vista legacy calcula el % contra 50 MB.
  const usedBytes = 12 * MB;
  const legacy = buildEffectiveStorageUsage(usedBytes, EXPECTED_QUOTAS.demo);
  assert(legacy.limitMb === 50, `precondición: la cuota legacy mostraba 50 MB, mostró ${legacy.limitMb}`);
  assert(legacy.percentUsed === 24, `precondición: 12/50 = 24%, dio ${legacy.percentUsed}`);

  const effective = buildEffectiveStorageUsage(usedBytes, EXPECTED_QUOTAS.full);
  assert(effective.usedMb === 12, `el uso real debía conservarse, dio ${effective.usedMb}`);
  assert(effective.limitMb === 500, `una empresa Full debía ver 500 MB, vio ${effective.limitMb}`);
  assert(effective.percentUsed === 2.4, `12/500 = 2.4%, dio ${effective.percentUsed}`);

  const extra = buildEffectiveStorageUsage(usedBytes, EXPECTED_QUOTAS.extra);
  assert(extra.limitMb === 5120, `Extra debía ver 5120 MB, vio ${extra.limitMb}`);
  // Sin cuota (0) nunca se divide por cero ni se inventa un 100%.
  assert(buildEffectiveStorageUsage(usedBytes, 0).percentUsed === 0, "cuota 0 no debía romper el cálculo");
});

// ===========================================================================
// C · Nomenclatura visible
// ===========================================================================
console.log("\nRH-01.3 · Nomenclatura visible normalizada en presentación");

/** Textos LITERALES que hoy generan las vistas/RPC ya aplicadas en producción. */
const DB_GENERATED_TEXTS: { text: string; migration: string }[] = [
  {
    text:
      "Completar asociación entre lote de salida, orden y consumos; cargar y validar soportes; recalcular después de corregir soportes.",
    migration: "0031_audit_support_views.sql",
  },
  {
    text: "Completar asociación entre lote de salida, orden y consumos.",
    migration: "0031_audit_support_views.sql",
  },
  {
    text: "El lote de salida aún no tiene un cálculo de contenido reciclado.",
    migration: "0031_audit_support_views.sql",
  },
  { text: "Completar orden de producción", migration: "0106_pcr031_evidence_governance.sql" },
  { text: "orden de producción", migration: "0104_pcr02_internal_consumption_and_completeness.sql" },
  { text: "El lote de salida no existe", migration: "0106_pcr031_evidence_governance.sql" },
];

check("13. Los textos usados por la prueba EXISTEN de verdad en las migraciones vigentes", () => {
  for (const { text, migration } of DB_GENERATED_TEXTS) {
    const sql = readRepoFile(path.join("supabase/migrations", migration));
    assert(sql.includes(text), `«${text}» debía existir literalmente en ${migration}`);
  }
});

check("14. La normalización elimina la denominación histórica de esos textos reales", () => {
  for (const { text } of DB_GENERATED_TEXTS) {
    assert(containsLegacyNomenclature(text), `precondición: «${text}» debía traer denominación histórica`);
    const normalized = normalizeVisibleText(text);
    assert(
      !containsLegacyNomenclature(normalized),
      `tras normalizar seguía apareciendo la denominación histórica: «${normalized}»`
    );
    assert(!/lote de salida/i.test(normalized), `quedó «lote de salida» en «${normalized}»`);
    assert(!/orden de producci[óo]n/i.test(normalized), `quedó «orden de producción» en «${normalized}»`);
  }
});

check("15. Las denominaciones oficiales son exactamente las del sprint", () => {
  assert(
    normalizeVisibleText("orden de producción") === "orden / corrida de producción",
    "«orden de producción» → «orden / corrida de producción»"
  );
  assert(
    normalizeVisibleText("lote de salida") === "lote producido / lote final",
    "«lote de salida» → «lote producido / lote final»"
  );
  assert(
    normalizeVisibleText("Orden de producción") === "Orden / corrida de producción",
    "debía conservar la mayúscula inicial"
  );
  assert(
    normalizeVisibleText("Lote de salida") === "Lote producido / lote final",
    "debía conservar la mayúscula inicial"
  );
  assert(
    normalizeVisibleText("órdenes de producción") === "órdenes / corridas de producción",
    "la forma plural también se normaliza"
  );
  assert(
    normalizeVisibleText("Lotes de salida") === "Lotes producidos / lotes finales",
    "la forma plural también se normaliza"
  );
  assert(
    normalizeVisibleTexts(["orden de producción", "composición del lote"]).join(", ") ===
      "orden / corrida de producción, composición del lote",
    "missing_items se normaliza elemento a elemento sin tocar los demás"
  );
});

check("16. La normalización es IDEMPOTENTE y no altera textos ya correctos", () => {
  for (const { text } of DB_GENERATED_TEXTS) {
    const once = normalizeVisibleText(text);
    assert(normalizeVisibleText(once) === once, `no era idempotente para «${text}»`);
  }
  for (const rule of VISIBLE_NOMENCLATURE_RULES) {
    assert(
      normalizeVisibleText(rule.preferred) === rule.preferred,
      `la denominación oficial «${rule.preferred}» no debía volver a transformarse`
    );
  }
  const neutral = "Agregar consumo · Registrar composición · Calcular contenido reciclado";
  assert(normalizeVisibleText(neutral) === neutral, "un texto sin denominación histórica no debía cambiar");
});

check("17. TODOS los renders de campos generados por la BD pasan por el helper central", () => {
  // Campos de texto libre que produce SQL con la denominación histórica.
  const DB_TEXT_FIELDS = [
    "suggested_action",
    "gap_description",
    "gap_label",
    "missing_items",
    "next_step_label",
  ];
  // Usos que NO son render de texto (conteos, iteración, declaración de tipo).
  const NON_RENDER = /^(\.length|\.map\(|\.some\(|\.filter\(|\.join\(|\.forEach\(|\??:)/;

  const offenders: string[] = [];
  const files = [
    ...walkFiles("app", /\.tsx$/),
    ...walkFiles("components", /\.tsx$/),
  ];
  let renderSites = 0;
  for (const rel of files) {
    const lines = readRepoFile(rel).split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      for (const field of DB_TEXT_FIELDS) {
        let from = 0;
        for (;;) {
          const at = line.indexOf(`.${field}`, from);
          if (at === -1) break;
          from = at + field.length;
          const after = line.slice(at + field.length + 1);
          if (NON_RENDER.test(after)) continue;
          renderSites++;
          if (!line.includes("normalizeVisible")) offenders.push(`${rel}:${i + 1} → ${trimmed}`);
        }
      }
    });
  }
  assert(renderSites >= 8, `se esperaban al menos 8 puntos de render, se encontraron ${renderSites}`);
  assert(offenders.length === 0, `renders sin normalizar:\n    ${offenders.join("\n    ")}`);
});

check("18. Los archivos identificados en el sprint aplican el helper (no replaces sueltos)", () => {
  const targets = [
    "app/(app)/(shell)/(cpr)/audit-support/page.tsx",
    "app/(app)/(shell)/(cpr)/audit-support/output-batches/[id]/evidence-matrix/page.tsx",
    "app/(app)/(shell)/(cpr)/guided-flow/output-batches/[id]/page.tsx",
    "app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx",
    "components/domain/audit-support/dossier-body.tsx",
  ];
  for (const rel of targets) {
    const src = readRepoFile(rel);
    assert(
      src.includes('from "@/lib/domain/nomenclature"'),
      `${rel} debía importar el helper central de nomenclatura`
    );
  }
  // Ningún componente puede volver a hacer su propio replace de estos términos.
  const dup: string[] = [];
  for (const rel of [...walkFiles("app", /\.tsx?$/), ...walkFiles("components", /\.tsx?$/), ...walkFiles("server", /\.ts$/)]) {
    const src = readRepoFile(rel);
    if (/\.replace\(\s*["'](lote de salida|orden de producci[óo]n)/.test(src)) dup.push(rel);
  }
  assert(dup.length === 0, `replaces duplicados fuera del helper: ${dup.join(", ")}`);
});

check("19. Ninguna cadena VISIBLE conserva la denominación histórica en las fuentes", () => {
  // Excepción justificada: el reconocedor de mensajes que lanza la RPC
  // (texto TÉCNICO de la BD, no visible) — se normaliza al mostrarlo.
  const offenders: string[] = [];
  const roots = ["app", "components", "lib", "server"];
  for (const root of roots) {
    for (const rel of walkFiles(root, /\.tsx?$/)) {
      if (rel === path.join("lib", "domain", "nomenclature.ts")) continue;
      readRepoFile(rel)
        .split("\n")
        .forEach((line, i) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
          if (!/lote de salida|orden de producci[óo]n/i.test(line)) return;
          // Constante de reconocimiento de errores de la RPC (recycled.ts).
          if (trimmed === '"El lote de salida no existe",') return;
          offenders.push(`${rel}:${i + 1}`);
        });
    }
  }
  assert(offenders.length === 0, `quedaron cadenas visibles históricas: ${offenders.join(", ")}`);
});

// ===========================================================================
// D · Identificadores técnicos intactos
// ===========================================================================
console.log("\nRH-01 · Identificadores técnicos intactos");

check("20. Tablas, RPC, códigos y rutas técnicas sin cambio", () => {
  const traceabilityDb = readRepoFile("lib/db/traceability.ts");
  assert(traceabilityDb.includes('from("output_batches")'), "la tabla output_batches no debía renombrarse");
  assert(
    traceabilityDb.includes('from("production_orders")'),
    "la tabla production_orders no debía renombrarse"
  );
  assert(
    traceabilityDb.includes("missing_items"),
    "la columna missing_items de la vista no debía renombrarse"
  );
  assert(
    readRepoFile("lib/db/audit-support.ts").includes("suggested_action"),
    "la columna suggested_action no debía renombrarse"
  );
  assert(
    readRepoFile("server/actions/recycled.ts").includes('supabase.rpc("calculate_recycled_content"'),
    "la RPC calculate_recycled_content no debía renombrarse"
  );
  assert(
    readRepoFile("lib/db/plans.ts").includes('supabase.rpc("get_organization_effective_plan"'),
    "la RPC get_organization_effective_plan no debía renombrarse"
  );
  // Códigos técnicos de flujo guiado: se traducen por mapa, jamás se normalizan.
  const guided = readRepoFile("lib/domain/guided-flow.ts");
  for (const code of ["complete_order", "add_consumption", "open_dossier"]) {
    assert(guided.includes(code), `el código técnico ${code} no debía cambiar`);
  }
  for (const dir of [
    "app/(app)/(shell)/(cpr)",
    "app/(app)/(shell)/(cpr)/traceability/output-batches",
    "app/(app)/(shell)/(cpr)/traceability/production-orders",
  ]) {
    assert(fs.existsSync(path.join(repoRoot, dir)), `la ruta técnica ${dir} no debía renombrarse`);
  }
});

check("21. La normalización NUNCA se aplica a códigos ni a rutas", () => {
  for (const code of ["complete_order", "production_orders", "output_batches", "/traceability/output-batches"]) {
    assert(normalizeVisibleText(code) === code, `el helper alteró un identificador técnico: ${code}`);
  }
});

// ===========================================================================
// E · Requisitos del cliente en el hub Catálogo
// ===========================================================================
console.log("\nRH-01.4 · Acuerdos y requisitos del cliente en el hub Catálogo");

check("22. El hub Catálogo enlaza /catalog/customer-requirements con su conteo real", () => {
  const hub = readRepoFile("app/(app)/(shell)/(cpr)/catalog/page.tsx");
  const cards = hub.slice(hub.indexOf("const cards = ["), hub.indexOf("return ("));
  assert(
    cards.includes('href: "/catalog/customer-requirements"'),
    "la tarjeta debía apuntar a la ruta funcional existente"
  );
  assert(
    /title: "Acuerdos y requisitos del cliente"/.test(cards),
    "la entrada debía llamarse «Acuerdos y requisitos del cliente»"
  );
  assert(
    cards.includes("count: customerRequirements.total"),
    "el conteo debía salir de listCustomerRequirements, no de un número inventado"
  );
  assert(
    hub.includes('listCustomerRequirements } from "@/lib/db/customer-requirements"'),
    "el hub debía leer los requisitos con la capa de datos existente"
  );
});

check("23. La ruta existe y no se amplió funcionalidad (sin CRM, sin tablas nuevas)", () => {
  assert(
    fs.existsSync(path.join(repoRoot, "app/(app)/(shell)/(cpr)/catalog/customer-requirements/page.tsx")),
    "la ruta /catalog/customer-requirements debía seguir existiendo"
  );
  const migrations = fs.readdirSync(path.join(repoRoot, "supabase/migrations"));
  assert(
    !migrations.some((m) => /customer_requirement/i.test(m)),
    "RH-01.4 no debía crear migraciones de requisitos de cliente"
  );
});

// ===========================================================================
// F · Preparación de auditoría en el registro de navegación
// ===========================================================================
console.log("\nRH-01.5 · Preparación de auditoría integrada al registro PCR");

check("24. /audit-prep pertenece al módulo PCR por prefijo de ruta", () => {
  assert(
    CPR_SHELL_MODULE.pathPrefixes.includes("/audit-prep"),
    "el prefijo /audit-prep debía estar en el módulo PCR"
  );
  for (const route of ["/audit-prep", "/audit-prep/exercises", "/audit-prep/dossiers"]) {
    assert(
      resolveShellModuleForPath(route).key === "cpr",
      `${route} debía resolverse dentro del módulo PCR`
    );
  }
  assert(
    !TEXTILES_SHELL_MODULE.pathPrefixes.includes("/audit-prep"),
    "audit-prep no pertenece a Textiles"
  );
  // Coincidencia estricta por prefijo: /audit-prepare no es /audit-prep.
  assert(
    !CPR_SHELL_MODULE.pathPrefixes.some((p) => "/audit-prepared".startsWith(`${p}/`)),
    "el prefijo debía seguir siendo estricto"
  );
});

check("25. El grupo visible «Preparación de auditoría» está en la navegación PCR", () => {
  assert(
    AUDIT_PREP_GROUP.title === "Preparación de auditoría",
    `el grupo debía titularse «Preparación de auditoría», es «${AUDIT_PREP_GROUP.title}»`
  );
  assert(
    CPR_SHELL_MODULE.groups.includes(AUDIT_PREP_GROUP),
    "el grupo debía estar en los grupos del módulo PCR (los renderiza components/layout/nav.tsx)"
  );
  const hrefs = AUDIT_PREP_GROUP.items.map((i) => i.href);
  assert(hrefs.includes("/audit-prep/exercises"), "faltaba el enlace a ejercicios de trazabilidad");
  assert(hrefs.includes("/audit-prep/dossiers"), "faltaba el enlace a expedientes");
  // Los enlaces existen como rutas reales.
  for (const href of hrefs) {
    assert(
      fs.existsSync(path.join(repoRoot, `app/(app)/(shell)/(cpr)${href}/page.tsx`)),
      `el enlace ${href} debía apuntar a una página existente`
    );
  }
  // La marca de opción activa funciona en el detalle de cada expediente.
  assert(
    isShellNavLinkActive(AUDIT_PREP_GROUP.items[1], "/audit-prep/dossiers/abc"),
    "el detalle de un expediente debía marcar activa su opción de menú"
  );
  assert(
    !isShellNavLinkActive(AUDIT_PREP_GROUP.items[0], "/audit-prep/dossiers"),
    "una opción no debía marcarse activa por otra ruta del grupo"
  );
});

check("26. El nav del shell renderiza los grupos del módulo (el grupo nuevo es visible)", () => {
  const nav = readRepoFile("components/layout/nav.tsx");
  assert(
    nav.includes("activeModule.groups.map("),
    "el sidebar debía seguir renderizando los grupos del registro central"
  );
  // Sin permisos ni capacidades nuevas: el grupo no introduce guards propios.
  const registry = readRepoFile("lib/modules/registry.ts");
  assert(
    !/AUDIT_PREP_GROUP[\s\S]{0,400}?(requiere|permission|capability|canManage)/i.test(registry),
    "el grupo no debía introducir permisos ni capacidades nuevas"
  );
  assert(
    readRepoFile("app/(app)/(shell)/(cpr)/traceability/page.tsx").includes("/audit-prep/exercises"),
    "el acceso histórico desde /traceability debía conservarse"
  );
});

// ===========================================================================
// G · Artefactos accidentales
// ===========================================================================
console.log("\nRH-01.6 · Artefactos accidentales eliminados");

check("27. Los artefactos «run» y «test:textiles-rls-t9e2» ya no están en la raíz", () => {
  for (const artifact of ["run", "test:textiles-rls-t9e2"]) {
    assert(
      !fs.existsSync(path.join(repoRoot, artifact)),
      `el artefacto ${artifact} debía haberse eliminado de la raíz`
    );
  }
});

check("28. El script npm homónimo sigue existiendo (se borró la salida, no el test)", () => {
  const pkg = JSON.parse(readRepoFile("package.json")) as { scripts: Record<string, string> };
  assert(
    pkg.scripts["test:textiles-rls-t9e2"] === "tsx tests/rls/textiles-t9e2-integrity.test.ts",
    "el script npm no debía tocarse: el artefacto era su salida redirigida por error"
  );
  assert(
    fs.existsSync(path.join(repoRoot, "tests/rls/textiles-t9e2-integrity.test.ts")),
    "la prueba real debía seguir existiendo"
  );
});

check("29. .gitignore evita reincidencias sin bloquear archivos legítimos", () => {
  const ignore = readRepoFile(".gitignore");
  assert(ignore.includes("/test:*"), "faltaba el patrón para salidas de scripts con ':' en la raíz");
  assert(ignore.includes("/run"), "faltaba el patrón para el artefacto 'run' de la raíz");
  // Los patrones están anclados a la raíz: no pueden ocultar código real.
  const legit = ["tests/rls/textiles-t9e2-integrity.test.ts", "scripts/seed-demo.ts", "lib/env.ts"];
  for (const rel of legit) {
    assert(fs.existsSync(path.join(repoRoot, rel)), `${rel} debía seguir presente y rastreable`);
  }
  assert(
    !ignore.split("\n").some((l) => l.trim() === "run" || l.trim() === "test:*"),
    "los patrones no debían quedar sin anclar (habrían ocultado archivos en subdirectorios)"
  );
});

// ===========================================================================
// H-J · Invariantes de migración
// ===========================================================================
console.log("\nRH-01 · Invariantes de base de datos (ninguna migración cambió)");

const migrationFiles = fs
  .readdirSync(path.join(repoRoot, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

check("30. RH-01 no creó migraciones: 0110 cierra su rango", () => {
  // Q0.3H · La aserción original exigía que 0110 fuera la ÚLTIMA migración del
  // repositorio para siempre, de modo que cualquier sprint posterior legítimo la
  // rompía. Lo que RH-01 quiso garantizar es que ESE sprint no añadió ninguna
  // migración, y eso se comprueba mejor acotando su propio rango: dentro de
  // 0001–0110 la última sigue siendo la 0110. Las migraciones posteriores
  // pertenecen a otros sprints y las validan sus propias suites.
  const withinRhScope = migrationFiles.filter((f) => Number(f.slice(0, 4)) <= 110);
  const last = withinRhScope[withinRhScope.length - 1];
  assert(
    last === "0110_platform_org_pgcrypto_schema_fix.sql",
    `la última migración del rango RH-01 debía ser 0110_platform_org_pgcrypto_schema_fix.sql, es ${last}`
  );
});

check("31. Tras la 0110 solo migraciones de sprints autorizados", () => {
  // Q0.3H · Igual que en el caso 30: la aserción absoluta "no existe 0111 o
  // posterior" convertía en fallo cualquier sprint futuro. Se conserva la
  // intención —RH-01 no introdujo migraciones— mediante una lista blanca
  // explícita de las posteriores autorizadas, el mismo patrón que ya usan las
  // suites de PCR-02 y T9F.
  const authorizedBeyond = new Set([
    // Q0.3H: privilegios de rol reproducibles desde migraciones (DR-22).
    "0111_platform_role_privileges.sql",
    // QUALITY-01: fundación de Procesos de Trazaloop Quality.
    "0112_quality_process_foundation.sql",
    // QUALITY-01.1: correcciones de aceptación (documentos y ciclo del cargo).
    "0113_quality_documents_and_position_lifecycle.sql",
    // QUALITY-01.2: relaciones entre procesos, documentos en entradas y
    // salidas, y snapshot de las aristas del mapa publicado.
    "0114_quality_relations_io_documents_and_map_edges.sql",
    // QUALITY-01.2: el snapshot del mapa, de solo lectura tambien donde el
    // entorno remoto concede DML por defecto sobre cada tabla nueva.
    "0115_quality_map_edges_privilege_hardening.sql",
  ]);
  const beyond = migrationFiles.filter((f) => {
    const n = Number(f.slice(0, 4));
    return Number.isFinite(n) && n >= 111 && !authorizedBeyond.has(f);
  });
  assert(beyond.length === 0, `migración posterior no autorizada: ${beyond.join(", ")}`);
});

check("32. RH-01 no alteró el conteo de su rango: 102 migraciones hasta la 0110", () => {
  // Q0.3H · El conteo absoluto convertía en fallo cualquier migración futura.
  // Lo que RH-01 garantizaba es que no añadió ninguna, así que se cuenta
  // dentro de SU rango (0001–0110) y las posteriores quedan fuera del candado.
  const withinRhScope = migrationFiles.filter((f) => Number(f.slice(0, 4)) <= 110);
  assert(
    withinRhScope.length === 102,
    `se esperaban 102 migraciones hasta la 0110, hay ${withinRhScope.length}`
  );
});

check("33. RH-01 no tocó SQL para arreglar textos ni cuotas", () => {
  // Las denominaciones históricas SIGUEN en las migraciones: se corrigen en
  // presentación, no reescribiendo migraciones ya aplicadas.
  const view0031 = readRepoFile("supabase/migrations/0031_audit_support_views.sql");
  assert(
    view0031.includes("lote de salida"),
    "las migraciones históricas debían quedar intactas (la corrección es de presentación)"
  );
  const seed = readRepoFile("supabase/migrations/0050_plans_and_usage.sql");
  assert(seed.includes("52428800") && seed.includes("524288000") && seed.includes("5368709120"),
    "las cuotas del seed no debían cambiar");
});

if (failures > 0) {
  console.error(`\n${failures} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nRH-01: todas las verificaciones pasaron.");
