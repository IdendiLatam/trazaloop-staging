/**
 * Trazaloop · PE-04B6 · Lo que se puede afirmar leyendo, al cierre de PE-04.
 *
 * Correr: npm run test:pe04b6-readiness
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");
function archivos(dir: string, salida: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const r = join(dir, e);
    if (statSync(r).isDirectory()) archivos(r, salida);
    else if (/\.tsx?$/.test(e)) salida.push(r);
  }
  return salida;
}
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\*\s.*$/gm, "");
}
const PRODUCTO = ["lib", "server", "app", "components"].flatMap((r) => archivos(r));

console.log("\nPE-04B6 · Preparación de cierre\n");

// ---------------------------------------------------------------------------
console.log("W · Ninguna autoridad comercial legacy en ejecución");
// ---------------------------------------------------------------------------

/** Lecturas del catálogo heredado que SOBREVIVEN, cada una con su motivo. */
const LECTURAS_LEGACY_CLASIFICADAS: Record<string, string> = {
  "lib/db/plans.ts":
    "Capa de acceso a las tablas heredadas. Sus dos lectores vivos son de "
    + "PRESENTACIÓN (tarjetas de uso heredadas) y de diagnóstico; ninguna decisión "
    + "de escritura cuelga de ella.",
  "lib/db/plan-shadow.ts":
    "Herramienta de COMPARACIÓN de PE-04B1: lee el catálogo heredado justo para "
    + "contrastarlo con el canónico. Solo la usa `scripts/pe04b1/sombra.ts`.",
};

check("W1. Nadie lee las tablas comerciales heredadas fuera de lo declarado", () => {
  const pat = /from\("(plan_definitions|plan_limits|organization_subscriptions)"\)/;
  const intrusos = PRODUCTO.filter((f) => {
    if (f in LECTURAS_LEGACY_CLASIFICADAS) return false;
    return pat.test(sinComentarios(leer(f)));
  });
  assert(intrusos.length === 0,
    `leen el catálogo comercial heredado sin declararlo: ${intrusos.join(", ")}`);
});

check("W2. Y los puentes de traducción siguen retirados", () => {
  for (const [f, fn] of [
    ["lib/plans/types.ts", "commercialTierToLegacyPlanCode"],
    ["lib/plans/limits.ts", "resolveEffectiveStorageLimitBytes"],
  ] as const) {
    assert(!new RegExp(`export function ${fn}\\b`).test(leer(f)),
      `volvió ${fn}: la traducción free→demo estaba retirada`);
  }
  const vivos = PRODUCTO.filter((f) =>
    /commercialTierToLegacyPlanCode\(|resolveEffectiveStorageLimitBytes\(/.test(sinComentarios(leer(f))));
  assert(vivos.length === 0, `los usan: ${vivos.join(", ")}`);
});

check("W3. Las cinco decisiones comerciales salen del catálogo canónico", () => {
  const esperado: [string, string, string][] = [
    ["server/actions/plans.ts", "getOrganizationPlanLimit(", "límites de conteo y funciones de empresa"],
    ["server/actions/module-plans.ts", "resolveModulePlan(", "funciones del módulo"],
    ["lib/db/organization-storage.ts", "organization_storage_status", "cuota de almacenamiento"],
    ["lib/db/organization-usage.ts", "ai_credits_status", "créditos de Intelligence"],
    ["lib/db/support-entitlements.ts", "organization_support_entitlement", "derecho de soporte"],
  ];
  for (const [f, marca, que] of esperado) {
    assert(leer(f).includes(marca), `${que}: ${f} ya no resuelve con el catálogo canónico`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nX · Lo que ve quien paga");
// ---------------------------------------------------------------------------

check("X1. «Demo» no se usa como nombre de un plan vigente en la UI", () => {
  // Puede aparecer describiendo el estado HEREDADO, y eso es diagnóstico. Lo
  // que no puede es llamarse así al plan gratuito de hoy: se llama Free.
  // La consola de PLATAFORMA sí puede nombrar el modo de acceso `demo` del eje
  // de módulos (0100): ahí es diagnóstico interno, no una oferta comercial.
  const pantallas = PRODUCTO
    .filter((f) => f.startsWith("app/") || f.startsWith("components/"))
    .filter((f) => !f.includes("/platform/"));
  const culpables: string[] = [];
  for (const f of pantallas) {
    const src = sinComentarios(leer(f));
    // Sospechoso: «Plan Demo» / «plan demo» presentado como oferta actual.
    if (/Plan Demo|plan Demo/.test(src) && !/hered|LEGACY|hist[oó]ric/i.test(leer(f))) {
      culpables.push(f);
    }
  }
  assert(culpables.length === 0, `llaman «Demo» a un plan vigente: ${culpables.join(", ")}`);
});

check("X2. El vocabulario comercial del cliente es el congelado", () => {
  const tarjetaUso = leer("components/domain/usage/usage-summary-card.tsx");
  const tarjetaSoporte = leer("components/domain/support/support-entitlement-card.tsx");
  for (const [texto, donde] of [
    ["Créditos de Intelligence", tarjetaUso],
    ["Tiempo de uso", tarjetaUso],
    ["Orientación funcional", tarjetaSoporte],
    ["Modo consulta", leer("components/domain/usage/usage-clock.tsx")],
  ] as const) {
    assert(donde.includes(texto), `falta el término «${texto}» en la interfaz del cliente`);
  }
});

check("X3. No se le enseñan claves internas, tokens ni coste del proveedor", () => {
  for (const f of ["components/domain/usage/usage-summary-card.tsx",
                   "components/domain/support/support-entitlement-card.tsx",
                   "components/domain/support/support-kind-choice.tsx"]) {
    const src = sinComentarios(leer(f));
    for (const prohibido of ["storage_bytes", "ai_weighted_credits_monthly",
                             "functional_support_cases_monthly", "token", "usd", "uuid"]) {
      assert(!new RegExp(prohibido, "i").test(src.replace(/className="[^"]*"/g, "")),
        `${f} enseña «${prohibido}» al cliente`);
    }
  }
});

// ---------------------------------------------------------------------------
console.log("\nAI/AJ/AK · Precios, Acompañamiento y cobro");
// ---------------------------------------------------------------------------

check("AI. Los precios congelados están en la migración que los sembró", () => {
  const m63 = leer("supabase/migrations/0163_organization_commercial_migration.sql");
  const m62 = leer("supabase/migrations/0162_commercial_plan_foundation.sql");
  const sql = m62 + m63;
  // 40 / 400 y 100 / 1000 USD, en unidades menores y antes de impuestos.
  for (const minor of ["4000", "40000", "10000", "100000"]) {
    assert(sql.includes(minor), `no aparece el precio ${minor} en unidades menores`);
  }
  assert(/impuesto|antes de impuestos|pre-?tax/i.test(sql), "no consta que los precios son pre-impuestos");
});

check("AJ. Advisor NO es un plan y no hay motor de horas", () => {
  const sql = ["0162_commercial_plan_foundation.sql", "0163_organization_commercial_migration.sql"]
    .map((m) => leer(`supabase/migrations/${m}`)).join("\n");
  assert(/plans_code_check[\s\S]{0,200}'free'[\s\S]{0,60}'full'[\s\S]{0,60}'extra'/.test(sql)
      || /in \('free', 'full', 'extra'\)/.test(sql),
    "el catálogo de planes ya no está cerrado a free/full/extra");
  for (const prohibido of ["'advisor'", "'asesor'"]) {
    assert(!sql.includes(prohibido), `existe un plan ${prohibido}`);
  }
  const codigo = PRODUCTO.map((f) => sinComentarios(leer(f))).join("\n");
  for (const motor of ["advisorHours", "specialist_hours", "consumeAdvisorHour"]) {
    assert(!codigo.includes(motor), `hay motor de Acompañamiento: ${motor}`);
  }
});

/**
 * PE-05B2 · La frontera de la pasarela: seis ficheros de servidor, ninguno
 * de interfaz. Se declaran uno a uno para que la comprobación de abajo siga
 * teniendo dientes: nombrar la pasarela en un séptimo sitio la pone en rojo.
 */
const FRONTERA_PASARELA = [
  "app/api/billing/webhooks/mercadopago/route.ts",
  // PROVISIONAL · el disparador de la prueba de sandbox. Se retira al cerrar
  // PE-05B2; mientras tanto es de servidor, exige superadministrador y se
  // niega en Producción.
  "app/api/billing/qa/mercadopago-smoke/route.ts",
  "lib/billing/mercadopago/mapping.ts",
  "lib/billing/mercadopago/signature.ts",
  // MP-ENV-01 · La identidad de entorno y aplicación. Es hermana de `mapping`
  // y `signature`, vive en el mismo directorio y por el mismo motivo: saber de
  // qué entorno y de qué aplicación viene un objeto es parte de la frontera de
  // la pasarela, no del modelo comercial de PE-04.
  "lib/billing/mercadopago/identity.ts",
  "lib/billing/providers/mercadopago.ts",
];

check("AK. PE-04 no contiene cobro, cupones ni cálculo de impuestos", () => {
  // Lo que esta comprobación protege es que el modelo COMERCIAL de PE-04 no se
  // mezcle con el cobro. PE-05B2 trajo la pasarela, y vive fuera de PE-04: se
  // excluyen sus cuatro ficheros del término que la nombra, y NADA más. El
  // resto de términos —otra pasarela, cupones, cálculo de IVA— se siguen
  // buscando en todo el producto, incluida la propia frontera.
  const fueraDePe04 = PRODUCTO.filter((f) => !FRONTERA_PASARELA.includes(f));
  const codigoPe04 = fueraDePe04.map((f) => sinComentarios(leer(f))).join("\n");
  const codigoTodo = PRODUCTO.map((f) => sinComentarios(leer(f))).join("\n");

  for (const prohibido of ["mercadopago", "mercado_pago"]) {
    assert(!new RegExp(prohibido, "i").test(codigoPe04),
      `PE-04 implementa «${prohibido}»: eso es PE-05`);
  }
  for (const prohibido of ["stripe", "checkout_session", "redeemCoupon",
                           "calculateVat", "invoice_line"]) {
    assert(!new RegExp(prohibido, "i").test(codigoTodo),
      `el producto implementa «${prohibido}»: eso no es de este tramo`);
  }
  // Y la frontera es exactamente la declarada.
  const nombran = PRODUCTO
    .filter((f) => /mercadopago|mercado_pago/i.test(sinComentarios(leer(f))))
    .sort();
  assert(JSON.stringify(nombran) === JSON.stringify([...FRONTERA_PASARELA].sort()),
    `la frontera de la pasarela cambió: ${nombran.join(", ")}`);
});

// ---------------------------------------------------------------------------
console.log("\nAN · Coste de las comprobaciones");
// ---------------------------------------------------------------------------

check("AN1. El shell no resuelve estado comercial en cada render", () => {
  // El shell lo pinta CADA pantalla. Si resolviera almacenamiento, IA, tiempo y
  // soporte en cada render, cada clic costaría cuatro consultas comerciales.
  const shell = sinComentarios(leer("app/(app)/(shell)/layout.tsx"));
  for (const caro of ["getOrganizationStorageStatus", "getAiCreditStatus",
                      "getOrganizationTimeStatus", "getSupportEntitlement"]) {
    assert(!shell.includes(caro), `el shell resuelve «${caro}» en cada render`);
  }
});

check("AN2. El detalle de consumo vive donde se pregunta por él", () => {
  const puerta = leer("app/(app)/modules/page.tsx");
  assert(puerta.includes("getOrganizationTimeStatus(") && puerta.includes("getAiCreditStatus("),
    "la puerta no enseña el consumo");
  const soporte = leer("app/(app)/(shell)/support/page.tsx");
  assert(soporte.includes("getSupportEntitlementAction("), "soporte no enseña su derecho");
});

check("AN3. El latido solo late donde se mide", () => {
  // OJO: el limpiador de comentarios se come una multiplicación (` * `), así
  // que la cadencia se comprueba sobre la fuente REAL. Un guardia que se
  // tropieza con su propio filtro da rojos que no son.
  const relojCrudo = leer("components/domain/usage/usage-clock.tsx");
  assert(/if \(!medida\) return;/.test(sinComentarios(relojCrudo)),
    "el reloj late también en superficies no medidas");
  assert(/HEARTBEAT_SECONDS \* 1000/.test(relojCrudo), "la cadencia del latido no está acotada");
});

// ---------------------------------------------------------------------------
console.log("\nAP · Cadena de migraciones");
// ---------------------------------------------------------------------------

check("AP1. La cadena comercial está completa y en orden", () => {
  const esperadas = [
    "0162_commercial_plan_foundation.sql",
    "0163_organization_commercial_migration.sql",
    "0164_canonical_organization_storage_quota.sql",
    "0165_quality_catalog_rls_hardening.sql",
    "0166_intelligence_and_free_usage_limits.sql",
    "0167_support_entitlements_and_commercial_admin.sql",
    "0168_commercial_plan_assignment_transition.sql",
    "0169_billing_foundation.sql",
    "0170_trial_ai_monthly_pool_fix.sql",
    "0171_mercadopago_provider_webhooks.sql",
    "0172_billing_subscription_period_identity.sql",
    "0173_billing_payment_method_and_period_renewal.sql",
    "0174_billing_renewal_foundation.sql",
    "0175_billing_renewal_lifecycle.sql",
    "0176_billing_subscription_administrative_retirement.sql",
    "0177_billing_renewal_failure_hardening.sql",
    "0178_billing_customer_plan_transitions.sql",
    "0179_billing_promotions.sql",
    "0180_billing_promotion_immutability.sql",
    "0181_billing_immediate_upgrade_and_interval.sql",
    "0182_commercial_fx_administration_and_history.sql",
    "0183_billing_operations_alerts.sql",
    "0184_billing_provider_renewal_ownership.sql",
    "0185_billing_provider_plans.sql",
    "0186_billing_provider_reconciliation.sql",
    "0187_plan_limits_return_type_fix.sql",
    "0188_stakeholder_identity_normalization.sql",
    "0189_position_identity_hierarchy_and_import.sql",
  ];
  const enDisco = readdirSync("supabase/migrations");
  for (const m of esperadas) assert(enDisco.includes(m), `falta ${m}`);
  const cabecera = enDisco.filter((f) => f.endsWith(".sql")).sort().at(-1);
  assert(cabecera === "0189_position_identity_hierarchy_and_import.sql",
    `la cabecera es ${cabecera}`);
});

check("AP2. Las tres últimas llevan el preflight de seguridad de SEC-01", () => {
  for (const m of ["0166_intelligence_and_free_usage_limits.sql",
                   "0167_support_entitlements_and_commercial_admin.sql",
                   "0168_commercial_plan_assignment_transition.sql",
                   "0169_billing_foundation.sql",
                   "0170_trial_ai_monthly_pool_fix.sql"]) {
    assert(leer(`supabase/migrations/${m}`).includes("SEC01_RLS_PREFLIGHT"),
      `${m} no se niega a promover una base expuesta`);
  }
});

check("AP3. Toda tabla de la cadena comercial nace con RLS y política", () => {
  // La lección de SEC-01 aplicada a las seis migraciones de PE-04: siete tablas
  // se crearon entre 0128 y 0132 con los grants cuidados y sin
  // `enable row level security`, y el hallazgo lo trajo un correo del
  // proveedor. Aquí se comprueba que la cadena comercial entera no repite el
  // descuido, migración a migración.
  //
  // Se busca la marca AISLADA de trabajo pendiente aparte: en castellano
  // «TODO» significa «todo», y perseguirla por subcadena da rojos que no son.
  const cadena = ["0162_commercial_plan_foundation.sql",
    "0163_organization_commercial_migration.sql",
    "0164_canonical_organization_storage_quota.sql",
    "0165_quality_catalog_rls_hardening.sql",
    "0166_intelligence_and_free_usage_limits.sql",
    "0167_support_entitlements_and_commercial_admin.sql",
    "0168_commercial_plan_assignment_transition.sql",
    "0169_billing_foundation.sql",
    "0170_trial_ai_monthly_pool_fix.sql"];
  for (const m of cadena) {
    const src = leer(`supabase/migrations/${m}`);
    const creadas = [...src.matchAll(/create table (?:if not exists )?public\.(\w+)/g)].map((x) => x[1]);
    for (const t of creadas) {
      // El alineado de 0162 pone varios espacios antes de `enable`.
      assert(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(src),
        `${m}: la tabla ${t} nace sin RLS`);
      assert(new RegExp(`create policy \\w+ on public\\.${t}`).test(src),
        `${m}: la tabla ${t} tiene RLS y ninguna política`);
    }
  }
});

console.log(`\nPE-04B6 · preparación: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
