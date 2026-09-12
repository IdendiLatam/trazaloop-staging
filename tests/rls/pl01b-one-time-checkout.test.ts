import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { limpiarFixtures, describirResiduo, tasaCanonicaQA } from "../support/fixture-cleanup";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · PROD-LAUNCH-01B · El pago único, contra la base.
 *
 *
 * QUÉ SE PROTEGE, Y POR QUÉ CUESTA DINERO SI SE ROMPE
 *
 * El lanzamiento vende Full como pago único renovable. Todo lo que puede
 * salir mal aquí lo paga alguien:
 *
 *   · que la vuelta del navegador active un plan sin pago detrás — eso es
 *     regalar el producto a quien sepa escribir una URL;
 *   · que un pago de otro importe o de otra moneda active igual — eso es
 *     cobrar cuarenta mil pesos por un plan de ciento noventa mil;
 *   · que el pago de OTRA empresa active esta — eso es peor que no cobrar;
 *   · que pulsar «ya pagué» siete veces cree siete meses;
 *   · que renovar el 5 de octubre un plan que vence el 12 le quite al cliente
 *     los siete días que ya pagó.
 *
 * Nada de esto se comprueba leyendo código. Se ejecuta.
 *
 * Correr: npm run test:pl01b-checkout-db
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;
if (!URL || !SERVICE || !ANON || !DB_URL) {
  console.log("faltan credenciales locales en .env.local");
  process.exit(1);
}

const admin: SupabaseClient = createClient(URL, SERVICE, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
const sello = Date.now();
const personas: string[] = [];
const orgs: string[] = [];

async function check(nombre: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }

const CLAVE = "Trazaloop-Test-1234";

type Empresa = { org: string; uid: string; cli: SupabaseClient };

/** Una empresa con su administradora, por el camino real. */
async function empresa(etiqueta: string): Promise<Empresa> {
  const email = `pl01b-${etiqueta}-${sello}@test.trazaloop.dev`;
  const { data: u, error } = await admin.auth.admin.createUser({
    email, password: CLAVE, email_confirm: true });
  assert(!error && Boolean(u.user), `crear persona: ${error?.message}`);
  const uid = (u.user as { id: string }).id;
  personas.push(uid);
  const cli = createClient(URL!, ANON!, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email, password: CLAVE });
  const { data: orgId, error: eOrg } = await cli.rpc("create_organization",
    { p_name: `PL01B ${etiqueta} ${sello}`, p_tax_id: null, p_country: "CO" });
  assert(!eOrg && Boolean(orgId), `crear empresa: ${eOrg?.message}`);
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", uid);
  return { org, uid, cli };
}

/** Presupuesto abierto para un plan. */
async function presupuesto(e: Empresa, plan: string, intervalo: string) {
  const { data, error } = await e.cli.rpc("billing_create_quote", {
    p_organization_id: e.org, p_plan_code: plan, p_billing_interval: intervalo });
  assert(!error, `presupuestar: ${error?.message} (¿falta la tasa de cambio vigente?)`);
  return data as { quote_id: string; total_amount: number; charge_currency: string };
}

/** Abrir el cobro único. Lo pide quien administra la empresa. */
async function abrir(e: Empresa, purpose: string, target: string) {
  const { data, error } = await e.cli.rpc("billing_open_one_time_checkout", {
    p_purpose: purpose, p_target_id: target, p_provider: "mercadopago", p_environment: "test" });
  assert(!error, `abrir cobro: ${error?.message}`);
  return data as {
    checkout_id: string; status: string; reused: boolean;
    expected_total_amount: number; expected_currency: string;
  };
}

/** Asentar. Lo hace el servidor, con lo que YA leyó del proveedor. */
async function asentar(o: {
  checkoutId: string; paymentId: string; status?: string;
  reference?: string; amount: number; currency?: string;
}) {
  return await admin.rpc("billing_settle_one_time_checkout", {
    p_checkout_id: o.checkoutId,
    p_provider_payment_id: o.paymentId,
    p_payment_status: o.status ?? "approved",
    p_external_reference: o.reference ?? o.checkoutId,
    p_amount: o.amount,
    p_currency: o.currency ?? "COP",
  });
}

async function suscripcionDe(org: string) {
  const { data } = await admin.from("billing_subscriptions")
    .select("id, status, plan_code, billing_interval, provider, renewal_mode, current_period_start, current_period_end")
    .eq("organization_id", org).maybeSingle();
  return data as null | {
    id: string; status: string; plan_code: string; billing_interval: string;
    provider: string; renewal_mode: string;
    current_period_start: string; current_period_end: string;
  };
}

async function periodos(subId: string) {
  const { data } = await admin.from("billing_subscription_periods")
    .select("id, period_sequence, period_start, period_end, status")
    .eq("subscription_id", subId).order("period_sequence");
  return (data ?? []) as Array<{
    id: string; period_sequence: number; period_start: string;
    period_end: string; status: string;
  }>;
}

async function pagosDe(org: string) {
  const { data } = await admin.from("billing_payments")
    .select("id, provider, provider_payment_id, status, total_amount, currency")
    .eq("organization_id", org);
  return (data ?? []) as Array<Record<string, unknown>>;
}

/** Meses enteros entre dos instantes, redondeando al mes natural. */
function mesesEntre(desde: string, hasta: string): number {
  const a = new Date(desde), b = new Date(hasta);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12
       + (b.getUTCMonth() - a.getUTCMonth());
}

async function main() {
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  await tasaCanonicaQA(admin);

  console.log("\nA · La primera compra");
  // =========================================================================

  const mensual = await empresa("mensual");
  let subMensual = "";
  let periodo1: { period_start: string; period_end: string } | null = null;

  await check("A. Un pago mensual aprobado deja Full por un mes", async () => {
    const q = await presupuesto(mensual, "full", "monthly");
    const c = await abrir(mensual, "initial", q.quote_id);
    assert(c.expected_total_amount === q.total_amount,
      `el cobro esperaba ${c.expected_total_amount} y el presupuesto ${q.total_amount}`);
    const { data, error } = await asentar({
      checkoutId: c.checkout_id, paymentId: `pay-m-${sello}`, amount: c.expected_total_amount });
    assert(!error, `asentar: ${error?.message}`);
    assert((data as Record<string, unknown>).outcome === "settled",
      `no se asentó: ${JSON.stringify(data)}`);

    const s = await suscripcionDe(mensual.org);
    assert(s !== null, "no nació la suscripción");
    assert(s!.status === "active", `la suscripción quedó en ${s!.status}`);
    assert(s!.plan_code === "full", `el plan quedó en ${s!.plan_code}`);
    subMensual = s!.id;

    const ps = await periodos(s!.id);
    assert(ps.length === 1, `se crearon ${ps.length} periodos en una primera compra`);
    assert(ps[0].status === "settled", `el periodo quedó ${ps[0].status}`);
    assert(mesesEntre(ps[0].period_start, ps[0].period_end) === 1,
      `el periodo mensual duró ${mesesEntre(ps[0].period_start, ps[0].period_end)} meses`);
    periodo1 = ps[0];
  });

  await check("Y queda marcada como de renovación MANUAL", async () => {
    const s = await suscripcionDe(mensual.org);
    assert(s!.renewal_mode === "manual",
      `un pago único quedó con renewal_mode=${s!.renewal_mode}`);
  });

  await check("El derecho comercial de Full quedó concedido", async () => {
    const { rows } = await pg.query(
      `select r.plan_code, a.grant_kind from public.organization_plan_assignments a
         join public.plan_revisions r on r.id = a.plan_revision_id
        where a.organization_id = $1 and r.plan_code = 'full'
          and a.grant_kind = 'sold'
          and (a.ends_at is null or a.ends_at > now())`, [mensual.org]);
    assert(rows.length > 0, "se cobró Full y no se concedió Full");
  });

  await check("B. Un pago anual aprobado deja Full por doce meses", async () => {
    const e = await empresa("anual");
    const q = await presupuesto(e, "full", "annual");
    const c = await abrir(e, "initial", q.quote_id);
    const { data, error } = await asentar({
      checkoutId: c.checkout_id, paymentId: `pay-a-${sello}`, amount: c.expected_total_amount });
    assert(!error, `asentar: ${error?.message}`);
    assert((data as Record<string, unknown>).outcome === "settled", "no se asentó el anual");
    const s = await suscripcionDe(e.org);
    const ps = await periodos(s!.id);
    assert(mesesEntre(ps[0].period_start, ps[0].period_end) === 12,
      `el periodo anual duró ${mesesEntre(ps[0].period_start, ps[0].period_end)} meses`);
  });

  console.log("\nB · Lo que NO activa un plan");
  // =========================================================================

  await check("C. Un importe distinto NO asienta nada", async () => {
    const e = await empresa("importe");
    const q = await presupuesto(e, "full", "monthly");
    const c = await abrir(e, "initial", q.quote_id);
    const { error } = await asentar({
      checkoutId: c.checkout_id, paymentId: `pay-imp-${sello}`,
      amount: c.expected_total_amount - 1 });
    assert(Boolean(error) && /AMOUNT_MISMATCH/.test(error!.message),
      `un importe menor pasó: ${error?.message ?? "sin error"}`);
    assert((await suscripcionDe(e.org)) === null, "nació una suscripción sin pago correcto");
    assert((await pagosDe(e.org)).length === 0, "se registró un pago con importe erróneo");
  });

  await check("D. Una moneda distinta NO asienta nada", async () => {
    const e = await empresa("moneda");
    const q = await presupuesto(e, "full", "monthly");
    const c = await abrir(e, "initial", q.quote_id);
    const { error } = await asentar({
      checkoutId: c.checkout_id, paymentId: `pay-mon-${sello}`,
      amount: c.expected_total_amount, currency: "USD" });
    assert(Boolean(error) && /CURRENCY_MISMATCH/.test(error!.message),
      `otra moneda pasó: ${error?.message ?? "sin error"}`);
    assert((await suscripcionDe(e.org)) === null, "nació una suscripción pagada en otra moneda");
  });

  await check("E. Una referencia externa de OTRO cobro NO asienta nada", async () => {
    const e = await empresa("referencia");
    const q = await presupuesto(e, "full", "monthly");
    const c = await abrir(e, "initial", q.quote_id);
    const { error } = await asentar({
      checkoutId: c.checkout_id, paymentId: `pay-ref-${sello}`,
      reference: "00000000-0000-0000-0000-000000000000",
      amount: c.expected_total_amount });
    assert(Boolean(error) && /EXTERNAL_REFERENCE_MISMATCH/.test(error!.message),
      `el pago de otro cobro pasó: ${error?.message ?? "sin error"}`);
    assert((await suscripcionDe(e.org)) === null, "el pago de otro activó esta empresa");
  });

  await check("N. Una vuelta «con éxito» sin pago aprobado NO activa nada", async () => {
    const e = await empresa("falsa");
    const q = await presupuesto(e, "full", "monthly");
    const c = await abrir(e, "initial", q.quote_id);
    for (const estado of ["pending", "in_process", "rejected", "cancelled"]) {
      const { data, error } = await asentar({
        checkoutId: c.checkout_id, paymentId: `pay-falso-${estado}-${sello}`,
        status: estado, amount: c.expected_total_amount });
      assert(!error, `estado ${estado}: ${error?.message}`);
      assert((data as Record<string, unknown>).outcome === "not_approved",
        `el estado «${estado}» activó el plan`);
    }
    assert((await suscripcionDe(e.org)) === null, "un pago no aprobado activó el plan");
    assert((await pagosDe(e.org)).length === 0, "se registró un pago no aprobado");
  });

  console.log("\nC · Pulsar dos veces no cobra dos veces");
  // =========================================================================

  await check("F. Repetir el MISMO pago no duplica nada", async () => {
    const antesPagos = (await pagosDe(mensual.org)).length;
    const antesPeriodos = (await periodos(subMensual)).length;
    const { data: c } = await admin.from("billing_one_time_checkouts")
      .select("id").eq("organization_id", mensual.org).eq("status", "settled").single();
    for (let i = 0; i < 3; i += 1) {
      const { data, error } = await asentar({
        checkoutId: (c as { id: string }).id, paymentId: `pay-m-${sello}`,
        amount: 999 }); // hasta con un importe absurdo: ya está asentado
      assert(!error, `reintento ${i}: ${error?.message}`);
      assert((data as Record<string, unknown>).outcome === "already_settled",
        `el reintento ${i} devolvió ${JSON.stringify(data)}`);
    }
    assert((await pagosDe(mensual.org)).length === antesPagos, "se duplicaron los pagos");
    assert((await periodos(subMensual)).length === antesPeriodos, "se duplicaron los periodos");
  });

  await check("Y volver a pedir el cobro del mismo destino reutiliza el que ya hay", async () => {
    const e = await empresa("reutiliza");
    const q = await presupuesto(e, "full", "monthly");
    const a = await abrir(e, "initial", q.quote_id);
    const b = await abrir(e, "initial", q.quote_id);
    assert(b.reused === true && b.checkout_id === a.checkout_id,
      "se abrió un segundo cobro para el mismo presupuesto");
  });

  console.log("\nD · Renovar antes de vencer no quita días");
  // =========================================================================

  await check("G. El periodo nuevo empieza cuando TERMINA el vigente", async () => {
    const apertura = await admin.rpc("billing_open_next_period", { p_subscription_id: subMensual });
    const r = apertura.data as Record<string, unknown>;
    assert(!apertura.error, `abrir periodo: ${apertura.error?.message}`);
    const periodId = String(r.period_id ?? "");
    assert(periodId !== "", `no se abrió periodo: ${JSON.stringify(r)}`);

    const c = await abrir(mensual, "renewal", periodId);
    const { data, error } = await asentar({
      checkoutId: c.checkout_id, paymentId: `pay-ren-${sello}`,
      amount: c.expected_total_amount });
    assert(!error, `asentar renovación: ${error?.message}`);
    assert((data as Record<string, unknown>).outcome === "settled",
      `la renovación no se asentó: ${JSON.stringify(data)}`);

    const ps = await periodos(subMensual);
    assert(ps.length === 2, `hay ${ps.length} periodos tras renovar`);
    assert(ps[1].period_start === periodo1!.period_end,
      `el periodo 2 empieza en ${ps[1].period_start} y el 1 terminaba en ${periodo1!.period_end}: `
      + "renovar antes de vencer perdió días");
    assert(mesesEntre(ps[1].period_start, ps[1].period_end) === 1,
      "el periodo renovado no dura un mes");
    assert(ps[1].status === "settled", `el periodo renovado quedó ${ps[1].status}`);
  });

  await check("Y el pago de la renovación tiene su propio identificador", async () => {
    const pagos = await pagosDe(mensual.org);
    const ids = new Set(pagos.map((p) => String(p.provider_payment_id)));
    assert(ids.size === pagos.length, "dos pagos comparten identificador del proveedor");
    assert(pagos.length === 2, `hay ${pagos.length} pagos tras una compra y una renovación`);
  });

  console.log("\nE · El carril manual llega al mismo sitio");
  // =========================================================================

  await check("M. Un pago registrado a mano deja el MISMO estado canónico", async () => {
    const staff = await empresa("staff");
    await admin.from("platform_staff").insert({
      user_id: staff.uid, role_code: "superadmin", status: "active" });

    const cliente = await empresa("manual");
    const { data, error } = await staff.cli.rpc("billing_record_manual_payment", {
      p_organization_id: cliente.org, p_plan_code: "full", p_billing_interval: "monthly",
      p_reference: `TRF-${sello}`, p_paid_at: new Date(Date.now() - 3600_000).toISOString(),
      p_evidence: "Comprobante de transferencia 4471",
      p_reason: "Pago por transferencia confirmado en extracto bancario.",
    });
    assert(!error, `registrar pago manual: ${error?.message}`);
    assert((data as Record<string, unknown>).outcome === "settled",
      `no se asentó: ${JSON.stringify(data)}`);

    const s = await suscripcionDe(cliente.org);
    assert(s !== null && s.status === "active" && s.plan_code === "full",
      "el pago manual no dejó una suscripción Full activa");
    assert(s!.provider === "manual", `el proveedor quedó como ${s!.provider}`);
    assert(s!.renewal_mode === "manual", `renewal_mode quedó ${s!.renewal_mode}`);

    const ps = await periodos(s!.id);
    assert(ps.length === 1 && ps[0].status === "settled", "no hay un periodo liquidado");
    assert(mesesEntre(ps[0].period_start, ps[0].period_end) === 1, "el periodo no dura un mes");

    const { rows } = await pg.query(
      `select recorded_by, recorded_reason, manual_reference, manual_evidence, manual_paid_at
         from public.billing_payments where organization_id = $1`, [cliente.org]);
    assert(rows.length === 1, `hay ${rows.length} pagos`);
    assert(rows[0].recorded_by === staff.uid, "no consta quién lo registró");
    assert(String(rows[0].manual_reference) === `TRF-${sello}`, "no consta la referencia");
    assert(String(rows[0].recorded_reason).length >= 10, "no consta el motivo");
    assert(rows[0].manual_paid_at !== null, "no consta cuándo se pagó de verdad");
  });

  await check("Y registrar la MISMA referencia dos veces no cobra dos meses", async () => {
    const { rows: staffRows } = await pg.query(
      `select user_id from public.platform_staff where status='active' and role_code='superadmin'
        and user_id = any($1::uuid[]) limit 1`, [personas]);
    assert(staffRows.length === 1, "no se encontró la persona de plataforma de la prueba");
    const { data: orgRow } = await admin.from("billing_payments")
      .select("organization_id").eq("provider", "manual")
      .eq("manual_reference", `TRF-${sello}`).single();
    const org = (orgRow as { organization_id: string }).organization_id;

    const email = `pl01b-staff-${sello}@test.trazaloop.dev`;
    const cli = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await cli.auth.signInWithPassword({ email, password: CLAVE });
    const { data, error } = await cli.rpc("billing_record_manual_payment", {
      p_organization_id: org, p_plan_code: "full", p_billing_interval: "monthly",
      p_reference: `TRF-${sello}`, p_paid_at: new Date(Date.now() - 3600_000).toISOString(),
      p_evidence: null, p_reason: "Reintento del registro del mismo comprobante.",
    });
    assert(!error, `reintento manual: ${error?.message}`);
    assert((data as Record<string, unknown>).outcome === "already_recorded",
      `el reintento devolvió ${JSON.stringify(data)}`);
    const { count } = await admin.from("billing_payments")
      .select("id", { count: "exact", head: true }).eq("organization_id", org);
    assert(count === 1, `hay ${count} pagos tras registrar dos veces la misma transferencia`);
  });

  await check("Quien no es plataforma NO puede registrar un pago manual", async () => {
    const { error } = await mensual.cli.rpc("billing_record_manual_payment", {
      p_organization_id: mensual.org, p_plan_code: "full", p_billing_interval: "monthly",
      p_reference: `TRF-INTRUSO-${sello}`, p_paid_at: new Date().toISOString(),
      p_evidence: null, p_reason: "Intento de una administradora de empresa.",
    });
    assert(Boolean(error) && /NOT_AUTHORIZED/.test(error!.message),
      `una administradora de empresa registró un pago: ${error?.message ?? "sin error"}`);
  });

  await check("Un motivo o una referencia pobres se rechazan", async () => {
    const email = `pl01b-staff-${sello}@test.trazaloop.dev`;
    const cli = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await cli.auth.signInWithPassword({ email, password: CLAVE });
    const e = await empresa("pobre");
    const corto = await cli.rpc("billing_record_manual_payment", {
      p_organization_id: e.org, p_plan_code: "full", p_billing_interval: "monthly",
      p_reference: `R-${sello}`, p_paid_at: new Date().toISOString(),
      p_evidence: null, p_reason: "porque sí",
    });
    assert(Boolean(corto.error) && /MANUAL_REASON_REQUIRED/.test(corto.error!.message),
      `un motivo de dos palabras pasó: ${corto.error?.message ?? "sin error"}`);
    const futuro = await cli.rpc("billing_record_manual_payment", {
      p_organization_id: e.org, p_plan_code: "full", p_billing_interval: "monthly",
      p_reference: `R2-${sello}`, p_paid_at: new Date(Date.now() + 86400_000).toISOString(),
      p_evidence: null, p_reason: "Pago que todavía no ha ocurrido.",
    });
    assert(Boolean(futuro.error) && /MANUAL_PAID_AT_IN_FUTURE/.test(futuro.error!.message),
      `un pago del futuro pasó: ${futuro.error?.message ?? "sin error"}`);
  });

  console.log("\nG · Un presupuesto caducado no impide reconocer lo cobrado");
  // =========================================================================
  //
  // Un pago real de 190 400 COP se quedó sin asentar porque la persona volvió
  // dos horas después y el presupuesto vive treinta minutos. Caducar sirve
  // para no dejar COMPRAR; no para no dejar reconocer lo comprado.
  //
  // La excepción es más estricta que el camino normal: además de las cuatro
  // puertas económicas, exige que el vendedor observado sea el esperado.

  const VENDEDOR = 3663569024;

  /** Un cobro abierto cuyo presupuesto ya venció. */
  async function cobroCaducado(etiqueta: string) {
    const e = await empresa(etiqueta);
    const q = await presupuesto(e, "full", "monthly");
    const c = await abrir(e, "initial", q.quote_id);
    await pg.query(
      `update public.billing_quotes set expires_at = now() - interval '2 hours'
        where id = $1`, [q.quote_id]);
    return { e, quoteId: q.quote_id, c };
  }

  /** Asentar declarando vendedor observado y esperado. */
  async function asentarConVendedor(o: {
    checkoutId: string; paymentId: string; amount: number;
    status?: string; reference?: string; currency?: string;
    collector?: number | null; expected?: number | null;
  }) {
    return await admin.rpc("billing_settle_one_time_checkout", {
      p_checkout_id: o.checkoutId,
      p_provider_payment_id: o.paymentId,
      p_payment_status: o.status ?? "approved",
      p_external_reference: o.reference ?? o.checkoutId,
      p_amount: o.amount,
      p_currency: o.currency ?? "COP",
      p_live_mode: true,
      p_collector_id: o.collector === undefined ? VENDEDOR : o.collector,
      p_expected_collector_id: o.expected === undefined ? VENDEDOR : o.expected,
    });
  }

  await check("B. Caducado + aprobado + economía exacta + vendedor correcto → se asienta", async () => {
    const { e, c } = await cobroCaducado("cadok");
    const { data, error } = await asentarConVendedor({
      checkoutId: c.checkout_id, paymentId: `pay-cad-${sello}`,
      amount: c.expected_total_amount });
    assert(!error, `un pago aprobado se quedó sin reconocer: ${error?.message}`);
    assert((data as Record<string, unknown>).outcome === "settled", JSON.stringify(data));
    assert((data as Record<string, unknown>).quote_expired === true,
      "no consta que el presupuesto estaba caducado");
    const s = await suscripcionDe(e.org);
    assert(s !== null && s.status === "active" && s.plan_code === "full",
      "no quedó Full activo");
    const ps = await periodos(s!.id);
    assert(ps.length === 1 && ps[0].status === "settled", "no hay periodo liquidado");
  });

  await check("G. Caducado + vendedor DISTINTO del esperado → no se asienta", async () => {
    const { e, c } = await cobroCaducado("cadvend");
    const { error } = await asentarConVendedor({
      checkoutId: c.checkout_id, paymentId: `pay-cadv-${sello}`,
      amount: c.expected_total_amount, collector: 999999999 });
    assert(Boolean(error) && /EXPIRED_QUOTE_RECOVERY_REFUSED/.test(error!.message),
      `un pago de otro vendedor se reconoció: ${error?.message ?? "sin error"}`);
    assert((await suscripcionDe(e.org)) === null, "nació una suscripción");
  });

  await check("Y sin saber quién cobró tampoco: la excepción pide MÁS pruebas", async () => {
    const { e, c } = await cobroCaducado("cadsin");
    const { error } = await asentarConVendedor({
      checkoutId: c.checkout_id, paymentId: `pay-cads-${sello}`,
      amount: c.expected_total_amount, collector: null });
    assert(Boolean(error) && /EXPIRED_QUOTE_RECOVERY_REFUSED/.test(error!.message),
      `sin vendedor declarado se reconoció igual: ${error?.message ?? "sin error"}`);
    assert((await suscripcionDe(e.org)) === null, "nació una suscripción");
  });

  await check("C. Caducado + pago no aprobado → no se asienta", async () => {
    const { e, c } = await cobroCaducado("cadpend");
    const { data, error } = await asentarConVendedor({
      checkoutId: c.checkout_id, paymentId: `pay-cadp-${sello}`,
      amount: c.expected_total_amount, status: "pending" });
    assert(!error, `${error?.message}`);
    assert((data as Record<string, unknown>).outcome === "not_approved", JSON.stringify(data));
    assert((await suscripcionDe(e.org)) === null, "un pago pendiente activó el plan");
  });

  await check("D/E/F. Caducado + importe, moneda o referencia distintos → no se asienta", async () => {
    for (const [etiqueta, extra, patron] of [
      ["cadimp", { amountDelta: -1 }, /AMOUNT_MISMATCH/],
      ["cadmon", { currency: "USD" }, /CURRENCY_MISMATCH/],
      ["cadref", { reference: "00000000-0000-0000-0000-000000000000" }, /EXTERNAL_REFERENCE_MISMATCH/],
    ] as Array<[string, Record<string, unknown>, RegExp]>) {
      const { e, c } = await cobroCaducado(etiqueta);
      const { error } = await asentarConVendedor({
        checkoutId: c.checkout_id, paymentId: `pay-${etiqueta}-${sello}`,
        amount: c.expected_total_amount + Number(extra.amountDelta ?? 0),
        currency: extra.currency as string | undefined,
        reference: extra.reference as string | undefined });
      assert(Boolean(error) && patron.test(error!.message),
        `${etiqueta}: ${error?.message ?? "sin error"}`);
      assert((await suscripcionDe(e.org)) === null, `${etiqueta}: nació una suscripción`);
    }
  });

  await check("I. Caducado + ya asentado → idempotente, sin duplicar nada", async () => {
    const { e, c } = await cobroCaducado("cadidem");
    const uno = await asentarConVendedor({
      checkoutId: c.checkout_id, paymentId: `pay-cadi-${sello}`,
      amount: c.expected_total_amount });
    assert(!uno.error && (uno.data as Record<string, unknown>).outcome === "settled",
      `primer asentamiento: ${uno.error?.message}`);
    const s = await suscripcionDe(e.org);
    const antesPagos = (await pagosDe(e.org)).length;
    const antesPeriodos = (await periodos(s!.id)).length;
    for (let i = 0; i < 3; i += 1) {
      const otra = await asentarConVendedor({
        checkoutId: c.checkout_id, paymentId: `pay-cadi-${sello}`, amount: 999 });
      assert(!otra.error, `reintento ${i}: ${otra.error?.message}`);
      assert((otra.data as Record<string, unknown>).outcome === "already_settled",
        `reintento ${i}: ${JSON.stringify(otra.data)}`);
    }
    assert((await pagosDe(e.org)).length === antesPagos, "se duplicaron los pagos");
    assert((await periodos(s!.id)).length === antesPeriodos, "se duplicaron los periodos");
  });

  await check("J. Un presupuesto caducado NO puede abrir una compra nueva", async () => {
    // La excepción es SOLO para reconocer lo ya cobrado. Iniciar una compra con
    // un presupuesto vencido sigue prohibido: ahí el precio sí está por decidir.
    const e = await empresa("cadnuevo");
    const q = await presupuesto(e, "full", "monthly");
    await pg.query(
      `update public.billing_quotes set expires_at = now() - interval '2 hours'
        where id = $1`, [q.quote_id]);
    const { error } = await e.cli.rpc("billing_open_one_time_checkout", {
      p_purpose: "initial", p_target_id: q.quote_id,
      p_provider: "mercadopago", p_environment: "test" });
    assert(Boolean(error) && /QUOTE_EXPIRED/.test(error!.message),
      `se abrió una compra con un presupuesto caducado: ${error?.message ?? "sin error"}`);
  });

  await check("Y los demás carriles siguen recibiendo QUOTE_EXPIRED", async () => {
    // `billing_settle_payment` la comparten los avisos del proveedor, la subida
    // de plan y el pago manual. Sin pedir la excepción, caducar sigue cortando.
    const e = await empresa("cadotros");
    const q = await presupuesto(e, "full", "monthly");
    await pg.query(
      `update public.billing_quotes set expires_at = now() - interval '2 hours'
        where id = $1`, [q.quote_id]);
    const { error } = await admin.rpc("billing_settle_payment", {
      p_quote_id: q.quote_id, p_provider: "wompi",
      p_provider_payment_id: `pay-otros-${sello}`, p_outcome: "approved",
      p_idempotency_key: null, p_failure_reason: null });
    assert(Boolean(error) && /QUOTE_EXPIRED/.test(error!.message),
      `otro carril dejó de comprobar la caducidad: ${error?.message ?? "sin error"}`);
  });

  console.log("\nF · Lo que NO se debilitó");
  // =========================================================================

  await check("El cobro único no lo puede leer una empresa ajena", async () => {
    const ajena = await empresa("ajena");
    const { data } = await ajena.cli.from("billing_one_time_checkouts")
      .select("id").eq("organization_id", mensual.org);
    assert((data ?? []).length === 0, "una empresa ajena vio los cobros de otra");
  });

  await check("Nadie escribe la tabla de cobros por RLS", async () => {
    const { error } = await mensual.cli.from("billing_one_time_checkouts")
      .insert({ organization_id: mensual.org, provider: "mercadopago", environment: "test",
                purpose: "initial", expected_total_amount: 1, expected_currency: "COP" });
    assert(Boolean(error), "una administradora insertó un cobro a mano");
  });

  console.log("\nH · Ninguna primitiva de dinero cuelga de PUBLIC");
  // =========================================================================
  //
  // Esto existe por un fallo propio. Al recrear `billing_settle_payment` se
  // revocó de `anon, authenticated, service_role`… y NO de `public`. En
  // PostgreSQL una función nace con EXECUTE para PUBLIC y `authenticated` lo
  // hereda por ahí, así que durante un rato cualquier persona con sesión pudo
  // llamar a la primitiva que convierte dinero en derecho.
  //
  // El mismo descuido estaba en las cuatro funciones del pago único, escritas
  // con la misma fórmula incompleta. Un agujero que se repite no se tapa de
  // uno en uno: se pone una prueba que lo vea la próxima vez.

  await check("Las primitivas de servicio NO tienen EXECUTE para PUBLIC", async () => {
    const soloServicio = [
      "billing_settle_payment",
      "billing_settle_one_time_checkout",
      "billing_attach_one_time_preference",
      "billing_settle_period_payment",
    ];
    const { rows } = await pg.query(
      `select p.proname, coalesce(array_to_string(p.proacl,','),'(sin acl)') as acl
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any($1::text[])`, [soloServicio]);
    assert(rows.length >= soloServicio.length,
      `faltan primitivas por auditar: se encontraron ${rows.length}`);
    for (const r of rows) {
      // `=X/` sin rol delante es PUBLIC. `(sin acl)` es el valor por omisión,
      // que TAMBIÉN es PUBLIC: una función sin ACL la puede ejecutar cualquiera.
      assert(r.acl !== "(sin acl)",
        `«${r.proname}» no declara permisos: por omisión la ejecuta PUBLIC`);
      assert(!/(^|,)=X\//.test(String(r.acl)),
        `«${r.proname}» tiene EXECUTE para PUBLIC: cualquiera con sesión podría llamarla`);
      assert(!/(^|,)(anon)=/.test(String(r.acl)),
        `«${r.proname}» se concedió a anon`);
      assert(!/(^|,)(authenticated)=/.test(String(r.acl)),
        `«${r.proname}» se concedió a authenticated: esto lo llama el servidor`);
    }
  });

  await check("Y las que sí llama quien tiene sesión no admiten anónimos", async () => {
    const conSesion = ["billing_open_one_time_checkout", "billing_record_manual_payment"];
    const { rows } = await pg.query(
      `select p.proname, coalesce(array_to_string(p.proacl,','),'(sin acl)') as acl
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any($1::text[])`, [conSesion]);
    for (const r of rows) {
      assert(!/(^|,)=X\//.test(String(r.acl)),
        `«${r.proname}» tiene EXECUTE para PUBLIC: eso incluye a los anónimos`);
      assert(/authenticated=X/.test(String(r.acl)),
        `«${r.proname}» dejó de estar disponible para quien tiene sesión`);
    }
  });

  // -------------------------------------------------------------------------
  const residuo = await limpiarFixtures(pg, admin, { orgs, personas });
  const parte = describirResiduo(residuo);
  if (parte) console.log(`\n  ${parte}`);
  await pg.end();

  console.log(`\nPROD-LAUNCH-01B · pago único: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
