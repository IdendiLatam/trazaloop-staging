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

  // -------------------------------------------------------------------------
  const residuo = await limpiarFixtures(pg, admin, { orgs, personas });
  const parte = describirResiduo(residuo);
  if (parte) console.log(`\n  ${parte}`);
  await pg.end();

  console.log(`\nPROD-LAUNCH-01B · pago único: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
