import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";
import { buildCommercialCatalog } from "../../lib/plans/commercial-catalog";
import {
  formatMonthlyPrice, formatStorage, formatAiCredits, formatTimeUsage,
} from "../../lib/plans/commercial-presentation";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · COMMERCIAL-UX-01C · El catálogo comercial, contra la autoridad de
 * verdad.
 *
 *
 * POR QUÉ ESTA BATERÍA ADEMÁS DE LA DETERMINISTA
 *
 * `cux01c-commercial-read-model` comprueba la FORMA: que los valores atraviesen
 * la capa, que el texto no lleve cifras, que la prueba no sea un cuarto plan.
 * Lo hace con filas inventadas, y está bien: así se puede ejercitar también lo
 * que pasa cuando la autoridad viene incompleta.
 *
 * Lo que no puede comprobar es que esas filas se parezcan a las reales. Las
 * vistas públicas podrían cambiar de columnas, un recurso podría dejar de ser
 * público, una revisión podría quedarse en borrador. Aquí se leen las vistas de
 * verdad y se monta el catálogo con ellas.
 *
 * Y se comprueba lo que de esto se va a enseñar: que Free diga 30 y 300, que
 * Full y Extra digan uso ilimitado, y que los tamaños y los créditos coincidan
 * con lo que la base declara — no con lo que alguien recuerde.
 *
 * Correr: npm run test:cux01c-db
 */

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.log("falta SUPABASE_DB_URL en .env.local"); process.exit(1); }

let passed = 0, failed = 0;
async function check(nombre: string, fn: () => Promise<void> | void) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }

async function main() {
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  const q = async (sql: string, params: unknown[] = []) => (await pg.query(sql, params)).rows;
  await q("set role postgres");

  // Las vistas son `security_invoker` y están concedidas a `authenticated`. Se
  // leen con el mismo SQL que ellas declaran, para comprobar la forma REAL de
  // las columnas que el lector de la aplicación consume.
  const filasPlan = await q(
    `select plan_code, display_order, plan_revision_id, display_name, description,
            public_conditions, price_state, currency,
            monthly_price_minor, annual_price_minor
       from public.v_public_plan_catalog order by display_order`);
  const filasLimite = await q(
    `select plan_code, resource_code, resource_label, unit, limit_state, limit_value
       from public.v_public_plan_limits`);
  const [politica] = await q(
    `select enabled, trial_plan_code, trial_duration_hours, trial_ai_credits
       from public.commercial_trial_policy`);

  const catalogo = buildCommercialCatalog({
    plans: filasPlan.map((r) => ({
      planCode: String(r.plan_code),
      displayOrder: Number(r.display_order),
      planRevisionId: String(r.plan_revision_id),
      displayName: String(r.display_name),
      description: r.description === null ? null : String(r.description),
      publicConditions: r.public_conditions === null ? null : String(r.public_conditions),
      priceState: r.price_state as "configured" | "not_configured",
      currency: r.currency === null ? null : String(r.currency),
      monthlyPriceMinor: r.monthly_price_minor === null ? null : Number(r.monthly_price_minor),
      annualPriceMinor: r.annual_price_minor === null ? null : Number(r.annual_price_minor),
    })),
    limits: filasLimite.map((r) => ({
      planCode: String(r.plan_code),
      resourceCode: String(r.resource_code),
      resourceLabel: r.resource_label === null ? null : String(r.resource_label),
      unit: r.unit === null ? null : String(r.unit),
      limitState: r.limit_state as "finite" | "unlimited" | "not_configured",
      limitValue: r.limit_value === null ? null : Number(r.limit_value),
    })),
    trialPolicy: politica === undefined ? null : {
      enabled: Boolean(politica.enabled),
      trialPlanCode: String(politica.trial_plan_code),
      trialDurationHours: Number(politica.trial_duration_hours),
    },
  });

  const plan = (code: string) => {
    const p = catalogo.saasPlans.find((x) => x.code === code);
    assert(p !== undefined, `no salió el plan ${code} del catálogo real`);
    return p!;
  };

  /** Lo que la autoridad dice, leído por separado para poder CONTRASTAR. */
  const autoridad = async (code: string, recurso: string) => {
    const [f] = await q(
      `select l.limit_state, l.limit_value
         from public.plan_revision_limits l
         join public.plan_revisions r on r.id = l.plan_revision_id
        where r.plan_code = $1 and r.status = 'published' and r.effective_to is null
          and l.resource_code = $2`, [code, recurso]);
    return f === undefined ? null
      : { state: String(f.limit_state), value: f.limit_value === null ? null : Number(f.limit_value) };
  };

  console.log("\n1 · LO QUE SALE ES LO QUE LA BASE DICE");

  await check("1A. Los tres planes SaaS publicados, en orden", () => {
    assert(catalogo.saasPlans.length === 3,
      `la vista pública devolvió ${catalogo.saasPlans.length} planes`);
    assert(catalogo.saasPlans.map((p) => p.code).join(",") === "free,full,extra",
      `orden: ${catalogo.saasPlans.map((p) => p.code).join(",")}`);
  });

  await check("1B. El precio sale de plan_revisions", async () => {
    for (const p of catalogo.saasPlans) {
      const [r] = await q(
        `select monthly_price_minor, annual_price_minor, currency
           from public.plan_revisions
          where plan_code = $1 and status = 'published' and effective_to is null`, [p.code]);
      assert(Number(r.monthly_price_minor) === p.monthlyPriceMinor,
        `${p.code}: la página diría ${p.monthlyPriceMinor} y la autoridad dice ${r.monthly_price_minor}`);
      assert(Number(r.annual_price_minor) === p.annualPriceMinor,
        `${p.code}: el precio anual no coincide con la autoridad`);
      assert(String(r.currency) === p.currency, `${p.code}: la moneda no coincide`);
    }
  });

  await check("1C. Y los límites, de plan_revision_limits", async () => {
    for (const p of catalogo.saasPlans) {
      const disco = await autoridad(p.code, "storage_bytes");
      const ia = await autoridad(p.code, "ai_weighted_credits_monthly");
      assert((disco?.state === "finite" ? disco.value : null) === p.storageBytes,
        `${p.code}: almacenamiento ${p.storageBytes} frente a ${JSON.stringify(disco)}`);
      assert((ia?.state === "finite" ? ia.value : null) === p.aiCreditsMonthly,
        `${p.code}: créditos ${p.aiCreditsMonthly} frente a ${JSON.stringify(ia)}`);
    }
  });

  console.log("\n2 · LO QUE SE VA A ENSEÑAR");

  await check("2A. Free: 30 min/día · 300 min/mes", () => {
    const t = plan("free").timeUsage;
    assert(t.mode === "metered", `Free salió como ${t.mode}`);
    assert(formatTimeUsage(t) === "30 min/día · 300 min/mes",
      `Free se enseñaría como «${formatTimeUsage(t)}»`);
  });

  await check("2B. Full: uso ilimitado", () => {
    assert(plan("full").timeUsage.mode === "unlimited",
      `Full salió como ${plan("full").timeUsage.mode}`);
    assert(formatTimeUsage(plan("full").timeUsage) === "Uso ilimitado",
      `Full se enseñaría como «${formatTimeUsage(plan("full").timeUsage)}»`);
  });

  await check("2C. Extra: uso ilimitado", () => {
    assert(plan("extra").timeUsage.mode === "unlimited",
      `Extra salió como ${plan("extra").timeUsage.mode}`);
  });

  await check("2D. Y los tamaños y créditos se escriben desde la autoridad", () => {
    // Las cifras que aparecen aquí NO son la fuente: son el resultado de leerla.
    // Si la autoridad cambia, esta comprobación cae y hay que venir a mirarla —
    // que es exactamente lo que se quiere que pase.
    assert(formatStorage(plan("free").storageBytes) === "50 MB",
      `Free: ${formatStorage(plan("free").storageBytes)}`);
    assert(formatStorage(plan("full").storageBytes) === "500 MB",
      `Full: ${formatStorage(plan("full").storageBytes)}`);
    assert(formatStorage(plan("extra").storageBytes) === "5 GB",
      `Extra: ${formatStorage(plan("extra").storageBytes)}`);
    assert(formatAiCredits(plan("full").aiCreditsMonthly) === "500 créditos al mes",
      `Full IA: ${formatAiCredits(plan("full").aiCreditsMonthly)}`);
    assert(formatMonthlyPrice(plan("full").monthlyPriceMinor, plan("full").currency)
      === "USD 40 al mes", `Full precio: ${formatMonthlyPrice(plan("full").monthlyPriceMinor, plan("full").currency)}`);
    assert(formatMonthlyPrice(plan("free").monthlyPriceMinor, plan("free").currency)
      === "USD 0 al mes", "Free no se escribe como gratis");
  });

  console.log("\n3 · LA INVARIANTE DE TIEMPO SIGUE EN PIE");

  await check("3A. Todo plan con precio > 0 se presenta sin reloj", async () => {
    // Misma invariante que 01B.2, ahora desde la capa de presentación: si una
    // revisión futura le pusiera minutos a un plan de pago, esta página lo
    // diría y esto se pondría rojo.
    for (const p of catalogo.saasPlans) {
      if ((p.monthlyPriceMinor ?? 0) <= 0) continue;
      assert(p.timeUsage.mode === "unlimited",
        `${p.code} se paga y se presenta como ${p.timeUsage.mode}`);
    }
  });

  await check("3B. Y Free conserva el suyo", () => {
    const t = plan("free").timeUsage;
    assert(t.mode === "metered" && t.dailyMinutes === 30 && t.monthlyMinutes === 300,
      "Free dejó de presentarse medido: el plan gratuito sería el de pago");
  });

  console.log("\n4 · LA PRUEBA, DESDE SU PROPIA POLÍTICA");

  await check("4A. Full, 48 h, sin tarjeta", () => {
    const t = catalogo.trial;
    assert(t !== null, "la política real no produjo ninguna prueba");
    assert(t!.effectivePlanCode === "full", `concede ${t!.effectivePlanCode}`);
    assert(t!.durationHours === Number(politica.trial_duration_hours),
      "la duración no sale de la política");
    assert(t!.cardRequired === false, "la prueba pide tarjeta");
  });

  await check("4B. Hereda el tiempo del Full vigente", () => {
    assert(catalogo.trial?.timeUsage.mode === plan("full").timeUsage.mode,
      "la prueba y Full no dicen lo mismo sobre el tiempo");
  });

  await check("4C. Y sus créditos NO se mezclan con los del Full contratado", () => {
    // La política de la prueba tiene los suyos. El read model no los expone
    // precisamente para que nadie los sume ni los confunda con los 500.
    const t = catalogo.trial as unknown as Record<string, unknown>;
    assert(!("aiCreditsMonthly" in t) && !("aiCredits" in t),
      "la prueba expone créditos y acabará confundiéndose con los del plan");
    assert(Number(politica.trial_ai_credits) !== plan("full").aiCreditsMonthly,
      "los créditos de la prueba y los de Full coinciden: ya no se distinguen");
  });

  console.log("\n5 · LAS VISTAS SIGUEN SIENDO LAS PÚBLICAS");

  await check("5A. Ni borradores ni revisiones retiradas", async () => {
    const [n] = await q(
      `select count(*)::int n from public.v_public_plan_catalog c
        join public.plan_revisions r on r.id = c.plan_revision_id
       where r.status <> 'published' or r.effective_to is not null`);
    assert(Number(n.n) === 0,
      `la vista pública deja pasar ${n.n} revisiones que no están vigentes`);
  });

  await check("5B. Ni recursos marcados como no públicos", async () => {
    const [n] = await q(
      `select count(*)::int n from public.v_public_plan_limits l
        join public.plan_resources res on res.code = l.resource_code
       where not res.is_public`);
    assert(Number(n.n) === 0, `la vista deja pasar ${n.n} recursos no públicos`);
  });

  await check("5C. Y nadie anónimo las lee todavía", async () => {
    // Dato que el tramo siguiente necesita saber: las vistas están concedidas a
    // `authenticated`, NO a `anon` (0162). Una página de precios abierta al
    // público necesitará una decisión sobre esto —conceder a `anon`, o leer con
    // una identidad de servidor—. Se deja comprobado para que la decisión se
    // tome a la vista, y no se descubra con la página ya construida.
    const filas = await q(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_name in ('v_public_plan_catalog', 'v_public_plan_limits')
          and grantee = 'anon'`);
    assert(filas.length === 0,
      `anon ya puede leer el catálogo: ${JSON.stringify(filas)} — si es deliberado, actualiza esta comprobación`);
  });

  await pg.end();
  console.log(`\nCOMMERCIAL-UX-01C · catálogo contra la base: ${passed} en verde, ${failed} en rojo`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
