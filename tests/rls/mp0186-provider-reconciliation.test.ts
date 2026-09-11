import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { tasaCanonicaQA } from "../support/fixture-cleanup";
import { Client as PgClient } from "pg";
import { limpiarFixtures, describirResiduo } from "../support/fixture-cleanup";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · 0186 · Reconciliar lo que ya cobró el proveedor.
 *
 * QUÉ SE PROTEGE
 *
 * Con Mercado Pago el calendario no es nuestro: él cobra y luego avisa. Todo lo
 * que puede salir mal aquí cuesta dinero de alguien:
 *
 *   · que el mismo mes del proveedor se salde dos veces y el derecho se
 *     extienda de más;
 *   · que dos suscripciones locales digan ser el mismo objeto del proveedor y
 *     el cobro acabe en la organización equivocada;
 *   · que los avisos lleguen desordenados y la historia quede escrita al revés,
 *     quitándole a alguien un mes que ya pagó;
 *   · que el checkout saliera con un plan y el proveedor esté cobrando otro.
 *
 * Nada de esto se comprueba leyendo código: se ejecuta contra la base.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// La conexión directa es OBLIGATORIA aquí: media suite comprueba invariantes que
// solo se pueden atacar desde el PROPIETARIO de la base, y un rol de aplicación
// no llega. Sin ella, las pruebas de seguridad dirían «verde» por no haberlo
// intentado, que es la peor forma de estar en verde.
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
  try {
    await fn();
    passed += 1;
    console.log(`  ✔ ${nombre}`);
  } catch (e) {
    failed += 1;
    console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`);
  }
}

function assert(cond: boolean, mensaje: string) {
  if (!cond) throw new Error(mensaje);
}

type Sus = {
  org: string; subId: string; intentId: string; preapproval: string;
  uid: string; cli: SupabaseClient; ancla: string; interval: string;
  revision: string; total: number;
};

/**
 * Una suscripción VIVA, por el camino real.
 *
 * Presupuesto → intento → identificador del proveedor en el intento → medio de
 * pago → liquidación. No se insertan filas a mano: desde 0182 una suscripción
 * viva tiene que tener periodo y ese invariante es diferido, así que dos
 * escrituras sueltas lo violan siempre.
 */
async function suscripcion(provider: string, etiqueta: string): Promise<Sus> {
  const email = `mp0186-${etiqueta}-${sello}@test.trazaloop.dev`;
  const { data: u } = await admin.auth.admin.createUser({
    email, password: "Trazaloop-Test-1234", email_confirm: true });
  const uid = (u.user as { id: string }).id;
  personas.push(uid);
  const cli = createClient(URL!, ANON!, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email, password: "Trazaloop-Test-1234" });
  const { data: orgId } = await cli.rpc("create_organization",
    { p_name: `MP0186 ${etiqueta} ${sello}`, p_tax_id: null, p_country: "CO" });
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", uid);

  const { data: q } = await cli.rpc("billing_create_quote", {
    p_organization_id: org, p_plan_code: "full", p_billing_interval: "monthly" });
  const quote = q as { quote_id: string };
  assert(Boolean(quote?.quote_id), "no se pudo presupuestar (¿falta tasa de cambio vigente?)");

  const { data: rev } = await admin.from("billing_quotes")
    .select("plan_revision_id").eq("id", quote.quote_id).single();

  const { data: i } = await cli.rpc("billing_open_checkout_intent", {
    p_quote_id: quote.quote_id, p_provider: provider, p_environment: "test" });
  const intento = i as { intent_id: string; expected_total_amount: number };

  const preapproval = `pre-${etiqueta}-${sello}`;
  await admin.rpc("billing_attach_provider_subscription", {
    p_intent_id: intento.intent_id, p_provider_subscription_id: preapproval,
    p_init_point: "https://example.invalid/checkout", p_provider_status: "authorized",
    p_status: "authorized", p_synced_amount: intento.expected_total_amount,
    p_provider_version: 1, p_next_payment_date: null });

  const { data: pm } = await admin.rpc("billing_register_payment_method", {
    p_organization_id: org, p_provider: provider,
    p_provider_payment_method_id: `pm-${etiqueta}-${sello}`, p_environment: "test",
    p_created_by: null });
  await admin.rpc("billing_attach_intent_payment_method", {
    p_intent_id: intento.intent_id,
    p_payment_method_id: (pm as Record<string, unknown>).payment_method_id as string });
  const { error: eSet } = await admin.rpc("billing_settle_provider_payment", {
    p_provider: provider, p_external_reference: intento.intent_id,
    p_provider_payment_id: `pay0-${etiqueta}-${sello}`, p_outcome: "approved",
    p_amount: intento.expected_total_amount, p_currency: "COP",
    p_live_mode: false, p_failure_reason: null });
  assert(!eSet, `liquidar: ${eSet?.message}`);

  const { data: sub } = await admin.from("billing_subscriptions")
    .select("id, billing_interval").eq("organization_id", org).single();
  const subId = (sub as { id: string }).id;

  const { data: p1 } = await admin.from("billing_subscription_periods")
    .select("period_start").eq("subscription_id", subId).eq("period_sequence", 1).single();

  return { org, subId, intentId: intento.intent_id, preapproval, uid, cli,
           ancla: (p1 as { period_start: string }).period_start,
           interval: (sub as { billing_interval: string }).billing_interval,
           revision: (rev as { plan_revision_id: string }).plan_revision_id,
           total: intento.expected_total_amount };
}

/** El aniversario n del ancla, que es la fecha económica del ciclo n. */
function cicloEn(ancla: string, n: number): string {
  const d = new Date(ancla);
  d.setUTCMonth(d.getUTCMonth() + (n - 1));
  return d.toISOString();
}

/** Lo que hay que pagar por un periodo, con su impuesto. */
async function totalDe(periodId: string): Promise<number> {
  const { data } = await admin.rpc("billing_period_charge_total", { p_period_id: periodId });
  const r = data as Record<string, unknown>;
  assert(r?.status === "found", `no se pudo calcular el cargo: ${JSON.stringify(r)}`);
  return Number(r.total_amount);
}

/** El periodo n de una suscripción, si existe. */
async function periodo(subId: string, n: number) {
  const { data } = await admin.from("billing_subscription_periods")
    .select("id, period_sequence, period_start, period_end, status")
    .eq("subscription_id", subId).eq("period_sequence", n).maybeSingle();
  return data as { id: string; period_start: string; period_end: string;
                   status: string } | null;
}

/** Reconciliar un ciclo. Devuelve el objeto tal cual lo da la base. */
async function reconciliar(o: {
  provider?: string; preapproval: string; invoice: string; cycleAt: string;
  paymentId: string | null; outcome?: string; amount: number | null;
  currency?: string | null; liveMode?: boolean | null; providerPlanId?: string | null;
}) {
  const { data, error } = await admin.rpc("billing_reconcile_provider_cycle", {
    p_provider: o.provider ?? "mercadopago",
    p_provider_subscription_id: o.preapproval,
    p_provider_invoice_id: o.invoice,
    p_provider_cycle_at: o.cycleAt,
    p_provider_payment_id: o.paymentId,
    p_outcome: o.outcome ?? "approved",
    p_amount: o.amount,
    p_currency: o.currency === undefined ? "COP" : o.currency,
    p_live_mode: o.liveMode === undefined ? false : o.liveMode,
    p_provider_plan_id: o.providerPlanId ?? null,
  });
  if (error) return { outcome: `RPC_ERROR:${error.message}` } as Record<string, unknown>;
  return (data ?? {}) as Record<string, unknown>;
}

/** El siguiente ciclo de una suscripción, reconciliado de verdad. */
async function reconciliarCiclo(s: Sus, n: number, etiqueta: string,
                                extra: Record<string, unknown> = {}) {
  const cycleAt = cicloEn(s.ancla, n);
  // El importe tiene que ser el del periodo que se va a crear. Se calcula
  // creándolo primero no: se deduce del periodo 1, que tiene el mismo importe
  // base y la misma regla fiscal.
  const p1 = await periodo(s.subId, 1);
  const total = await totalDe(p1!.id);
  return reconciliar({ preapproval: s.preapproval, invoice: `inv-${etiqueta}-${sello}`,
    cycleAt, paymentId: `pay-${etiqueta}-${sello}`, amount: total, ...extra });
}

const pg = new PgClient({ connectionString: DB_URL });

async function main() {
  console.log("\n0186 · reconciliar lo que ya cobró el proveedor\n");
  await pg.connect();

  // Una tasa sintética para poder presupuestar. Se RETIRA al final —nunca se
  // borra: 0182 no deja borrar historia financiera, ni siendo de QA— y antes se
  // retira cualquier resto de una ejecución interrumpida, que si no bloquearía
  // esta por solapamiento.
  await admin.from("commercial_fx_rates").update({ status: "retired" })
    .eq("status", "active").like("note", "QA 0186 %");
  // TEST-HYGIENE-03 · Se reutiliza el tipo de cambio canónico de Local en vez de
  // abrir uno nuevo por vuelta: 0182 no deja borrarlos y solo puede regir uno
  // por par, así que cada tasa propia era una fila muerta más y un choque en
  // potencia para la siguiente suite.
  await tasaCanonicaQA(admin);

  // =========================================================================
  console.log("A · La identidad de la suscripción");
  // =========================================================================

  const mp = await suscripcion("mercadopago", "mp");

  await check("1. El primer ciclo reconoce la suscripción y la SELLA", async () => {
    // La columna venía a nulo: `billing_settle_payment` crea la suscripción y
    // nunca le copió el identificador del proveedor. Se sella al reconciliar.
    const antes = await admin.from("billing_subscriptions")
      .select("provider_subscription_id").eq("id", mp.subId).single();
    assert((antes.data as { provider_subscription_id: string | null })
      .provider_subscription_id === null,
      "la suscripción ya venía sellada: la prueba no demuestra nada");
    const r = await reconciliarCiclo(mp, 2, "c2");
    assert(r.outcome === "renewed", `esperaba renewed y vino ${JSON.stringify(r)}`);
    const despues = await admin.from("billing_subscriptions")
      .select("provider_subscription_id").eq("id", mp.subId).single();
    assert((despues.data as { provider_subscription_id: string })
      .provider_subscription_id === mp.preapproval, "no se selló el identificador");
  });

  await check("2. El mismo preapproval no puede pertenecer a dos suscripciones", async () => {
    const otra = await suscripcion("mercadopago", "gemela");
    const { error } = await admin.from("billing_subscriptions")
      .update({ provider_subscription_id: mp.preapproval }).eq("id", otra.subId);
    assert(Boolean(error), "la base aceptó dos suscripciones con el mismo preapproval");
    assert(String(error?.code) === "23505",
      `esperaba una violación de unicidad y vino ${error?.code}: ${error?.message}`);
  });

  await check("3. Y un preapproval ya sellado no se repinta con otro", async () => {
    const r = await reconciliar({ preapproval: `otro-${sello}`, invoice: `inv-x-${sello}`,
      cycleAt: cicloEn(mp.ancla, 3), paymentId: `pay-x-${sello}`, amount: 1 });
    assert(r.outcome === "subscription_unknown",
      `un objeto del proveedor desconocido no puede resolver nada: ${JSON.stringify(r)}`);
  });

  // =========================================================================
  console.log("\nB · El intento recuerda con qué proyección salió");
  // =========================================================================

  let proyeccion = "";
  let proyeccionExterna = "";
  /** TEST-HYGIENE-05A · Las proyecciones que registra ESTA vuelta, para poder
   *  retirarlas al terminar por la primitiva gobernada. */
  const planesProveedor: string[] = [];

  await check("4. `billing_checkout_intents` puede guardar la proyección", async () => {
    proyeccionExterna = `plan-0186-${sello}`;
    const { data, error } = await admin.rpc("billing_register_provider_plan", {
      p_provider: "mercadopago", p_environment: "test",
      p_plan_revision_id: mp.revision, p_billing_interval: "monthly",
      p_provider_plan_id: proyeccionExterna, p_charge_currency: "COP",
      p_charge_amount: mp.total, p_created_by: null });
    assert(!error && typeof data === "string", `registrar proyección: ${error?.message}`);
    proyeccion = data as string;
    planesProveedor.push(proyeccion);
    const { error: eUpd } = await admin.from("billing_checkout_intents")
      .update({ billing_provider_plan_id: proyeccion }).eq("id", mp.intentId);
    assert(!eUpd, `no se pudo guardar la proyección en el intento: ${eUpd?.message}`);
    const { data: leido } = await admin.from("billing_checkout_intents")
      .select("billing_provider_plan_id").eq("id", mp.intentId).single();
    assert((leido as { billing_provider_plan_id: string }).billing_provider_plan_id
      === proyeccion, "no quedó guardada");
  });

  await check("5. La columna es ANULABLE y sin valor por omisión", async () => {
    // Producción tiene inquilinos reales desde el 7 de septiembre: una columna
    // con valor por omisión habría reescrito filas vivas al aplicarse. Se
    // pregunta al catálogo, que es donde está la verdad.
    const { rows } = await pg.query(
      `select is_nullable, column_default
         from information_schema.columns
        where table_schema = 'public' and table_name = 'billing_checkout_intents'
          and column_name = 'billing_provider_plan_id'`);
    assert(rows.length === 1, "la columna no existe");
    assert(rows[0].is_nullable === "YES", "la columna es obligatoria");
    assert(rows[0].column_default === null,
      `tiene valor por omisión: ${rows[0].column_default}`);
    // Y ningún intento AJENO a esta ejecución la tiene: la migración no rellenó
    // nada. Se excluyen las organizaciones que crea la propia prueba, que sí la
    // reciben a propósito.
    const { rows: puestos } = await pg.query(
      `select count(*)::int as n from public.billing_checkout_intents
        where billing_provider_plan_id is not null
          and organization_id <> all($1::uuid[])`, [orgs]);
    assert(puestos[0].n === 0,
      `${puestos[0].n} intento(s) ajenos recibieron proyección sin que nadie se la pusiera`);
  });

  await check("6. Una proyección RETIRADA sigue reconciliando lo histórico", async () => {
    // `retired` significa «no más ventas nuevas». No significa «esta
    // suscripción deja de valer».
    const { error } = await admin.rpc("billing_retire_provider_plan", { p_id: proyeccion });
    assert(!error, `retirar: ${error?.message}`);
    const r = await reconciliarCiclo(mp, 3, "c3-retirado",
      { providerPlanId: proyeccionExterna });
    assert(r.outcome === "renewed",
      `una proyección retirada tiene que seguir sirviendo: ${JSON.stringify(r)}`);
  });

  await check("7. Si el intento dice A y el proveedor dice B, se PARA", async () => {
    const otraExterna = `plan-otro-${sello}`;
    const { data: idB } = await admin.rpc("billing_register_provider_plan", {
      p_provider: "mercadopago", p_environment: "test",
      p_plan_revision_id: mp.revision, p_billing_interval: "monthly",
      p_provider_plan_id: otraExterna, p_charge_currency: "COP",
      p_charge_amount: mp.total, p_created_by: null });
    assert(typeof idB === "string", "no se registró la segunda proyección");
    planesProveedor.push(idB as string);
    const r = await reconciliarCiclo(mp, 4, "c4-mismatch",
      { providerPlanId: otraExterna });
    assert(r.outcome === "provider_plan_mismatch",
      `esperaba provider_plan_mismatch y vino ${JSON.stringify(r)}`);
    const p4 = await periodo(mp.subId, 4);
    assert(p4 === null, "una divergencia no puede dejar un mes creado detrás");
  });

  await check("8. Una proyección que el proveedor nombra y aquí no existe: falla cerrado", async () => {
    const r = await reconciliarCiclo(mp, 5, "c5-desconocida",
      { providerPlanId: `no-existe-${sello}` });
    assert(r.outcome === "provider_plan_unknown",
      `esperaba provider_plan_unknown y vino ${JSON.stringify(r)}`);
  });

  // =========================================================================
  console.log("\nC · El ciclo externo, una sola vez");
  // =========================================================================

  await check("9. El mismo ciclo repetido no vuelve a hacer nada", async () => {
    const primera = await reconciliarCiclo(mp, 6, "c6");
    assert(primera.outcome === "renewed", `primera: ${JSON.stringify(primera)}`);
    const segunda = await reconciliarCiclo(mp, 6, "c6");
    assert(segunda.outcome === "already_reconciled",
      `esperaba already_reconciled y vino ${JSON.stringify(segunda)}`);
    assert(segunda.period_id === primera.period_id, "cambió de periodo al repetirse");
  });

  await check("10. Y no extiende el derecho dos veces", async () => {
    const { data: antes } = await admin.from("billing_subscriptions")
      .select("current_period_end").eq("id", mp.subId).single();
    await reconciliarCiclo(mp, 6, "c6");
    const { data: despues } = await admin.from("billing_subscriptions")
      .select("current_period_end").eq("id", mp.subId).single();
    assert((antes as { current_period_end: string }).current_period_end
      === (despues as { current_period_end: string }).current_period_end,
      "un aviso repetido movió la vigencia");
  });

  await check("11. Un pago del proveedor repetido no crea un segundo cobro", async () => {
    // La garantía es de 0169 y sigue viva: (provider, provider_payment_id).
    const { count: antes } = await admin.from("billing_payments")
      .select("id", { count: "exact", head: true })
      .eq("provider_payment_id", `pay-c6-${sello}`);
    const r = await reconciliar({ preapproval: mp.preapproval,
      invoice: `inv-otro-${sello}`, cycleAt: cicloEn(mp.ancla, 7),
      paymentId: `pay-c6-${sello}`, amount: await totalDe((await periodo(mp.subId, 1))!.id) });
    assert(r.outcome === "already_settled",
      `el mismo pago tiene que reconocerse como ya liquidado: ${JSON.stringify(r)}`);
    const { count: despues } = await admin.from("billing_payments")
      .select("id", { count: "exact", head: true })
      .eq("provider_payment_id", `pay-c6-${sello}`);
    assert(antes === despues && antes === 1, `pagos: antes ${antes}, después ${despues}`);
  });

  await check("12. Dos ciclos distintos no saldan el mismo periodo", async () => {
    // La recíproca de la unicidad del ciclo. El periodo 6 ya está saldado; una
    // factura DISTINTA del proveedor para el mismo mes no puede volver a
    // saldarlo ni extender el derecho otra vez.
    const p = await periodo(mp.subId, 6);
    assert(p!.status === "settled", "el periodo 6 tenía que estar saldado");
    const { data: antes } = await admin.from("billing_subscriptions")
      .select("current_period_end").eq("id", mp.subId).single();

    const r = await reconciliar({ preapproval: mp.preapproval,
      invoice: `inv-gemela-${sello}`, cycleAt: cicloEn(mp.ancla, 6),
      paymentId: `pay-gemela-${sello}`, amount: await totalDe(p!.id) });
    assert(r.outcome === "period_already_settled",
      `esperaba period_already_settled y vino ${JSON.stringify(r)}`);

    const { data: despues } = await admin.from("billing_subscriptions")
      .select("current_period_end").eq("id", mp.subId).single();
    assert((antes as { current_period_end: string }).current_period_end
      === (despues as { current_period_end: string }).current_period_end,
      "una segunda factura del mismo mes movió la vigencia");
    // Y el cobro queda anotado para que lo mire una persona, no descartado.
    const { data: pago } = await admin.from("billing_payments")
      .select("status").eq("provider_payment_id", `pay-gemela-${sello}`).single();
    assert((pago as { status: string }).status === "manual_review",
      `el segundo cobro tenía que quedar en revisión y quedó en ${(pago as { status: string })?.status}`);
    // El índice también lo impide a nivel de datos: solo un ciclo APROBADO por
    // periodo.
    const { rows } = await pg.query(
      `select count(*)::int as n from public.billing_provider_cycles
        where period_id = $1 and outcome = 'approved'`, [p!.id]);
    assert(rows[0].n === 1, `hay ${rows[0].n} ciclos aprobados sobre el mismo mes`);
  });

  // =========================================================================
  console.log("\nD · Los avisos llegan desordenados");
  // =========================================================================

  const orden = await suscripcion("mercadopago", "orden");

  await check("13. El ciclo 3 antes que el 2 produce una historia determinista", async () => {
    const p1 = await periodo(orden.subId, 1);
    const total = await totalDe(p1!.id);
    const tercero = await reconciliar({ preapproval: orden.preapproval,
      invoice: `inv-o3-${sello}`, cycleAt: cicloEn(orden.ancla, 3),
      paymentId: `pay-o3-${sello}`, amount: total });
    assert(tercero.outcome === "renewed", `tercero: ${JSON.stringify(tercero)}`);
    assert(Number(tercero.period_sequence) === 3,
      `el tercer ciclo tiene que ser el periodo 3 y fue ${tercero.period_sequence}`);

    const segundo = await reconciliar({ preapproval: orden.preapproval,
      invoice: `inv-o2-${sello}`, cycleAt: cicloEn(orden.ancla, 2),
      paymentId: `pay-o2-${sello}`, amount: total });
    assert(segundo.outcome === "renewed", `segundo: ${JSON.stringify(segundo)}`);
    assert(Number(segundo.period_sequence) === 2,
      `el segundo ciclo tiene que ser el periodo 2 y fue ${segundo.period_sequence}`);

    const p2 = await periodo(orden.subId, 2);
    const p3 = await periodo(orden.subId, 3);
    assert(new Date(p2!.period_start) < new Date(p3!.period_start),
      "la historia quedó escrita al revés");
  });

  await check("14. Y el derecho NO retrocede al llegar un mes viejo", async () => {
    const p3 = await periodo(orden.subId, 3);
    const { data: s } = await admin.from("billing_subscriptions")
      .select("current_period_end, renews_at").eq("id", orden.subId).single();
    const fin = (s as { current_period_end: string }).current_period_end;
    assert(new Date(fin).getTime() === new Date(p3!.period_end).getTime(),
      `la vigencia quedó en ${fin} y el mes más largo pagado acaba en ${p3!.period_end}`);
  });

  await check("15. El número de periodo sale de la FECHA, no del orden de llegada", async () => {
    // La función pura, con su tolerancia de medio paso: un cobro que caiga unos
    // días antes de su aniversario sigue siendo su ciclo.
    const casos: Array<[string, number]> = [
      [cicloEn(orden.ancla, 1), 1],
      [cicloEn(orden.ancla, 2), 2],
      [cicloEn(orden.ancla, 7), 7],
    ];
    for (const [fecha, esperado] of casos) {
      const { data } = await admin.rpc("billing_provider_cycle_sequence", {
        p_anchor: orden.ancla, p_interval: "monthly", p_cycle_at: fecha });
      assert(Number(data) === esperado,
        `${fecha} debería ser el ciclo ${esperado} y dio ${data}`);
    }
    const tresDiasAntes = new Date(new Date(cicloEn(orden.ancla, 2)).getTime()
      - 3 * 86_400_000).toISOString();
    const { data: pronto } = await admin.rpc("billing_provider_cycle_sequence", {
      p_anchor: orden.ancla, p_interval: "monthly", p_cycle_at: tresDiasAntes });
    assert(Number(pronto) === 2,
      `un cobro tres días antes del aniversario sigue siendo el ciclo 2, y dio ${pronto}`);
  });

  // =========================================================================
  console.log("\nE · Quién NO entra por aquí");
  // =========================================================================

  await check("16. Wompi no se reconcilia por este camino", async () => {
    const w = await suscripcion("wompi", "wompi");
    const r = await reconciliar({ provider: "wompi", preapproval: w.preapproval,
      invoice: `inv-w-${sello}`, cycleAt: cicloEn(w.ancla, 2),
      paymentId: `pay-w-${sello}`, amount: 1 });
    assert(r.outcome === "renewal_not_provider_owned",
      `Wompi tiene que quedar fuera: ${JSON.stringify(r)}`);
    assert(r.renewal_owner === "merchant", `dueño declarado: ${r.renewal_owner}`);
    const p2 = await periodo(w.subId, 2);
    assert(p2 === null, "quedó un mes creado para un proveedor que no va por aquí");
  });

  await check("17. Y Mercado Pago sigue fuera del motor de renovación propio", async () => {
    // Es la puerta de 0184, y se vuelve a mirar desde aquí porque 0186 depende
    // de ella: si algún día se abriera, se cobraría dos veces.
    const { data } = await admin.rpc("billing_due_renewals", {
      p_now: new Date(Date.now() + 400 * 86_400_000).toISOString(), p_limit: 500 });
    const filas = (data ?? []) as Array<{ subscription_id: string }>;
    assert(!filas.some((f) => f.subscription_id === mp.subId),
      "una suscripción de Mercado Pago apareció en la cola de cobro propio");
  });

  await check("18. Un proveedor que no ha declarado dueño falla cerrado", async () => {
    const r = await reconciliar({ provider: `inventado-${sello}`,
      preapproval: mp.preapproval, invoice: `inv-i-${sello}`,
      cycleAt: cicloEn(mp.ancla, 9), paymentId: `pay-i-${sello}`, amount: 1 });
    assert(r.outcome === "subscription_unknown" || r.outcome === "renewal_not_provider_owned",
      `un proveedor desconocido no puede reconciliar nada: ${JSON.stringify(r)}`);
  });

  // =========================================================================
  console.log("\nF · Lo que tiene que fallar cerrado");
  // =========================================================================

  const cerrado = await suscripcion("mercadopago", "cerrado");

  await check("19. Entorno que no coincide", async () => {
    const p1 = await periodo(cerrado.subId, 1);
    const r = await reconciliar({ preapproval: cerrado.preapproval,
      invoice: `inv-env-${sello}`, cycleAt: cicloEn(cerrado.ancla, 2),
      paymentId: `pay-env-${sello}`, amount: await totalDe(p1!.id), liveMode: true });
    assert(r.outcome === "environment_mismatch",
      `un cobro de producción sobre un intento de pruebas no se procesa: ${JSON.stringify(r)}`);
    assert((await periodo(cerrado.subId, 2)) === null, "dejó un mes detrás");
  });

  await check("20. Entorno sin declarar", async () => {
    const r = await reconciliar({ preapproval: cerrado.preapproval,
      invoice: `inv-env2-${sello}`, cycleAt: cicloEn(cerrado.ancla, 2),
      paymentId: `pay-env2-${sello}`, amount: 1, liveMode: null });
    assert(r.outcome === "environment_mismatch",
      `sin entorno no se procesa: ${JSON.stringify(r)}`);
  });

  await check("21. Importe que no cuadra · y no deja un mes inventado", async () => {
    const r = await reconciliar({ preapproval: cerrado.preapproval,
      invoice: `inv-imp-${sello}`, cycleAt: cicloEn(cerrado.ancla, 2),
      paymentId: `pay-imp-${sello}`, amount: 1 });
    assert(r.outcome === "reconciliation_mismatch",
      `esperaba reconciliation_mismatch y vino ${JSON.stringify(r)}`);
    assert((await periodo(cerrado.subId, 2)) === null,
      "un aviso que no cuadra creó un mes que nadie debe");
  });

  await check("22. Moneda que no cuadra", async () => {
    const p1 = await periodo(cerrado.subId, 1);
    const r = await reconciliar({ preapproval: cerrado.preapproval,
      invoice: `inv-mon-${sello}`, cycleAt: cicloEn(cerrado.ancla, 2),
      paymentId: `pay-mon-${sello}`, amount: await totalDe(p1!.id), currency: "USD" });
    assert(r.outcome === "reconciliation_mismatch",
      `esperaba reconciliation_mismatch y vino ${JSON.stringify(r)}`);
  });

  await check("23. Ciclo sin identidad y ciclo sin fecha", async () => {
    const sinId = await reconciliar({ preapproval: cerrado.preapproval, invoice: "  ",
      cycleAt: cicloEn(cerrado.ancla, 2), paymentId: null, amount: 1 });
    assert(sinId.outcome === "cycle_identity_missing", JSON.stringify(sinId));
    const { data } = await admin.rpc("billing_reconcile_provider_cycle", {
      p_provider: "mercadopago", p_provider_subscription_id: cerrado.preapproval,
      p_provider_invoice_id: `inv-sinfecha-${sello}`, p_provider_cycle_at: null,
      p_provider_payment_id: null, p_outcome: "approved", p_amount: 1,
      p_currency: "COP", p_live_mode: false, p_provider_plan_id: null });
    assert((data as Record<string, unknown>).outcome === "cycle_date_missing",
      JSON.stringify(data));
  });

  await check("24. Un resultado que no es de pago se rechaza en el umbral", async () => {
    const { error } = await admin.rpc("billing_reconcile_provider_cycle", {
      p_provider: "mercadopago", p_provider_subscription_id: cerrado.preapproval,
      p_provider_invoice_id: `inv-out-${sello}`,
      p_provider_cycle_at: cicloEn(cerrado.ancla, 2), p_provider_payment_id: null,
      p_outcome: "inventado", p_amount: 1, p_currency: "COP", p_live_mode: false,
      p_provider_plan_id: null });
    assert(Boolean(error) && String(error?.message).includes("PAYMENT_OUTCOME_INVALID"),
      `esperaba PAYMENT_OUTCOME_INVALID y vino ${error?.message}`);
  });

  // =========================================================================
  console.log("\nG · Seguridad");
  // =========================================================================

  await check("25. Un inquilino no puede reconciliar ni ver los ciclos", async () => {
    const { error } = await mp.cli.rpc("billing_reconcile_provider_cycle", {
      p_provider: "mercadopago", p_provider_subscription_id: mp.preapproval,
      p_provider_invoice_id: `inv-pirata-${sello}`,
      p_provider_cycle_at: cicloEn(mp.ancla, 12), p_provider_payment_id: null,
      p_outcome: "approved", p_amount: 1, p_currency: "COP", p_live_mode: false,
      p_provider_plan_id: null });
    assert(Boolean(error), "un inquilino pudo reconciliar un ciclo");
    const { data: tabla } = await mp.cli.from("billing_provider_cycles").select("id");
    assert((tabla ?? []).length === 0, "un inquilino leyó la tabla de ciclos");
    const { data: vista } = await mp.cli.from("v_billing_provider_cycles").select("id");
    assert((vista ?? []).length === 0, "un inquilino leyó la vista de ciclos");
  });

  await check("26. `service_role` no tiene DML sobre los ciclos", async () => {
    // Lo que lo detiene son los PRIVILEGIOS, no la RLS: a este rol no se le
    // aplica. Se comprueba ejecutándolo, que es la lección de 0184.
    const { error: eSel } = await admin.from("billing_provider_cycles").select("id").limit(1);
    assert(Boolean(eSel), "service_role pudo LEER la tabla de ciclos");
    const { error: eIns } = await admin.from("billing_provider_cycles").insert({
      provider: "mercadopago", environment: "test",
      provider_subscription_id: mp.preapproval, provider_invoice_id: `falsa-${sello}`,
      provider_cycle_at: new Date().toISOString(), subscription_id: mp.subId,
      organization_id: mp.org, period_id: (await periodo(mp.subId, 1))!.id,
      period_sequence: 1, outcome: "approved" });
    assert(Boolean(eIns), "service_role pudo INSERTAR un ciclo a mano");
    const { error: eDel } = await admin.from("billing_provider_cycles").delete()
      .eq("provider_invoice_id", `inv-c6-${sello}`);
    assert(Boolean(eDel), "service_role pudo BORRAR un ciclo");
  });

  await check("27. Un ciclo reconocido es append-only · atacado como PROPIETARIO", async () => {
    // Los privilegios paran a `service_role`; al propietario de la base no lo
    // para nadie salvo un disparador. Se ejecuta de verdad, no se lee.
    const { rows } = await pg.query(
      `select id from public.billing_provider_cycles
        where provider_invoice_id = $1`, [`inv-c6-${sello}`]);
    assert(rows.length === 1, "no se encontró el ciclo que había que atacar");
    const id = rows[0].id;
    let paroUpdate = false;
    try {
      await pg.query(
        `update public.billing_provider_cycles set outcome = 'declined' where id = $1`, [id]);
    } catch (e) {
      paroUpdate = String((e as Error).message).includes("PROVIDER_CYCLE_IS_APPEND_ONLY");
    }
    assert(paroUpdate, "el propietario pudo MODIFICAR un ciclo ya reconocido");
    let paroDelete = false;
    try {
      await pg.query(`delete from public.billing_provider_cycles where id = $1`, [id]);
    } catch (e) {
      paroDelete = String((e as Error).message).includes("PROVIDER_CYCLE_IS_APPEND_ONLY");
    }
    assert(paroDelete, "el propietario pudo BORRAR un ciclo ya reconocido");
    const { rows: sigue } = await pg.query(
      `select outcome from public.billing_provider_cycles where id = $1`, [id]);
    assert(sigue.length === 1 && sigue[0].outcome === "approved",
      "el ciclo no sobrevivió intacto al ataque");
  });

  await check("28. Las funciones nuevas son SECURITY DEFINER con search_path fijo", async () => {
    const { rows } = await pg.query(
      `select p.proname, p.prosecdef, p.proconfig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('billing_reconcile_provider_cycle',
                            'billing_provider_cycle_is_append_only')`);
    assert(rows.length === 2, `esperaba 2 funciones y hay ${rows.length}`);
    for (const f of rows) {
      assert(f.prosecdef === true, `${f.proname} no es security definer`);
      assert(Array.isArray(f.proconfig)
        && f.proconfig.some((c: string) => c.startsWith("search_path=")),
        `${f.proname} no fija search_path`);
    }
  });

  await check("29. La primitiva no cobra · no hay ni un verbo de cobro dentro", async () => {
    // Se lee el cuerpo REAL que hay en la base, no el fichero: lo que importa
    // es lo que está aplicado.
    const { rows } = await pg.query(
      `select pg_get_functiondef(p.oid) as def
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'billing_reconcile_provider_cycle'`);
    const cuerpo = String(rows[0].def);
    for (const prohibido of ["billing_open_next_period", "billing_claim_renewal_attempt",
                             "billing_register_payment_method", "billing_open_checkout_intent",
                             "billing_open_upgrade_intent"]) {
      assert(!cuerpo.includes(prohibido),
        `la reconciliación llama a ${prohibido}: eso es cobrar o programar un cobro`);
    }
  });

  await check("30. Las garantías nuevas existen como índices, no como buenas intenciones", async () => {
    const { rows } = await pg.query(
      `select indexname from pg_indexes
        where schemaname = 'public'
          and indexname in ('billing_subscriptions_provider_uniq',
                            'bpc_external_uniq', 'bpc_period_settled_uniq')`);
    const nombres = rows.map((r: { indexname: string }) => r.indexname);
    for (const i of ["billing_subscriptions_provider_uniq", "bpc_external_uniq",
                     "bpc_period_settled_uniq"]) {
      assert(nombres.includes(i), `falta el índice ${i}`);
    }
  });

  // =========================================================================
  console.log("\nH · Nada de lo que ya existía se movió");
  // =========================================================================

  await check("31. Un rechazo no toca ni una fila ajena", async () => {
    const { count: pagosAntes } = await admin.from("billing_payments")
      .select("id", { count: "exact", head: true });
    const { count: periodosAntes } = await admin.from("billing_subscription_periods")
      .select("id", { count: "exact", head: true });
    await reconciliar({ preapproval: `no-existe-${sello}`, invoice: `inv-nada-${sello}`,
      cycleAt: new Date().toISOString(), paymentId: `pay-nada-${sello}`, amount: 1 });
    const { count: pagosDespues } = await admin.from("billing_payments")
      .select("id", { count: "exact", head: true });
    const { count: periodosDespues } = await admin.from("billing_subscription_periods")
      .select("id", { count: "exact", head: true });
    assert(pagosAntes === pagosDespues && periodosAntes === periodosDespues,
      `pagos ${pagosAntes}→${pagosDespues}, periodos ${periodosAntes}→${periodosDespues}`);
  });

  await check("32. La vista es de solo lectura y solo para plataforma", async () => {
    const { error } = await admin.from("v_billing_provider_cycles")
      .insert({ provider: "mercadopago" } as never);
    assert(Boolean(error), "la vista aceptó una escritura");
  });

  // =========================================================================
  console.log("\nI · La resolución de identidad, atacada");
  // =========================================================================

  await check("33. La primitiva NO recibe organización · se deriva", async () => {
    // Si quien llama pudiera nombrar la empresa, un fallo en el webhook le
    // regalaría un mes a otra. Se comprueba contra el catálogo, no leyendo.
    const { rows } = await pg.query(
      `select pg_get_function_arguments(p.oid) as args
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'billing_reconcile_provider_cycle'`);
    const args = String(rows[0].args);
    for (const prohibido of ["organization", "p_org", "subscription_id uuid",
                             "period_id", "billing_provider_plan_id"]) {
      assert(!args.includes(prohibido),
        `la primitiva recibe «${prohibido}»: la identidad tiene que derivarse`);
    }
  });

  const orgA = await suscripcion("mercadopago", "cruzada-a");
  const orgB = await suscripcion("mercadopago", "cruzada-b");

  await check("34. El preapproval de A no puede sellar la suscripción de B", async () => {
    const { data: antesB } = await admin.from("billing_subscriptions")
      .select("provider_subscription_id, current_period_end").eq("id", orgB.subId).single();
    assert((antesB as { provider_subscription_id: string | null })
      .provider_subscription_id === null, "B ya venía sellada");

    const p1 = await periodo(orgA.subId, 1);
    const r = await reconciliar({ preapproval: orgA.preapproval,
      invoice: `inv-cruz-${sello}`, cycleAt: cicloEn(orgA.ancla, 2),
      paymentId: `pay-cruz-${sello}`, amount: await totalDe(p1!.id) });
    assert(r.outcome === "renewed", `debía reconciliar contra A: ${JSON.stringify(r)}`);
    assert(r.organization_id === orgA.org,
      `el derecho fue a ${r.organization_id} y la empresa es ${orgA.org}`);

    const { data: despuesB } = await admin.from("billing_subscriptions")
      .select("provider_subscription_id, current_period_end").eq("id", orgB.subId).single();
    assert(JSON.stringify(antesB) === JSON.stringify(despuesB),
      "la suscripción de la otra empresa se movió");
  });

  await check("35. Un intento que apunta a la suscripción de OTRA empresa falla cerrado", async () => {
    // Se fabrica el enredo a mano —`service_role` sí tiene DML sobre los
    // intentos— para comprobar que el respaldo no lo sigue.
    const suelta = await suscripcion("mercadopago", "suelta");
    const { error: eUpd } = await admin.from("billing_checkout_intents")
      .update({ billing_subscription_id: orgB.subId }).eq("id", suelta.intentId);
    assert(!eUpd, `montar el enredo: ${eUpd?.message}`);
    const r = await reconciliar({ preapproval: suelta.preapproval,
      invoice: `inv-owner-${sello}`, cycleAt: cicloEn(suelta.ancla, 2),
      paymentId: `pay-owner-${sello}`, amount: 1 });
    assert(r.outcome === "subscription_ownership_conflict",
      `esperaba subscription_ownership_conflict y vino ${JSON.stringify(r)}`);
    const { data: b } = await admin.from("billing_subscriptions")
      .select("provider_subscription_id").eq("id", orgB.subId).single();
    assert((b as { provider_subscription_id: string | null })
      .provider_subscription_id !== suelta.preapproval,
      "selló el identificador en la suscripción de otra empresa");
  });

  await check("36. Dos fuentes que no coinciden: no se elige, se para", async () => {
    // La suscripción ya está sellada con su preapproval y el intento apunta a
    // otra suscripción. Es el cruce que dejaría el cobro en el sitio erróneo.
    const { error } = await admin.from("billing_checkout_intents")
      .update({ billing_subscription_id: orgB.subId }).eq("id", orgA.intentId);
    assert(!error, `montar el cruce: ${error?.message}`);
    const p1 = await periodo(orgA.subId, 1);
    const r = await reconciliar({ preapproval: orgA.preapproval,
      invoice: `inv-cruce2-${sello}`, cycleAt: cicloEn(orgA.ancla, 3),
      paymentId: `pay-cruce2-${sello}`, amount: await totalDe(p1!.id) });
    assert(r.outcome === "subscription_identity_conflict",
      `esperaba subscription_identity_conflict y vino ${JSON.stringify(r)}`);
    assert(r.reason === "INTENT_POINTS_ELSEWHERE", `motivo: ${r.reason}`);
    // Se deshace el enredo para no contaminar lo que venga después.
    await admin.from("billing_checkout_intents")
      .update({ billing_subscription_id: orgA.subId }).eq("id", orgA.intentId);
  });

  await check("37. El entorno se comprueba ANTES de sellar", async () => {
    // Éste era un fallo real: el sello estaba antes de mirar el entorno, así
    // que un aviso de producción alcanzaba a escribir el identificador en una
    // suscripción de pruebas antes de que nadie lo rechazara.
    const v = await suscripcion("mercadopago", "sello-entorno");
    const { data: antes } = await admin.from("billing_subscriptions")
      .select("provider_subscription_id").eq("id", v.subId).single();
    assert((antes as { provider_subscription_id: string | null })
      .provider_subscription_id === null, "ya venía sellada");
    const r = await reconciliar({ preapproval: v.preapproval,
      invoice: `inv-selloenv-${sello}`, cycleAt: cicloEn(v.ancla, 2),
      paymentId: `pay-selloenv-${sello}`, amount: 1, liveMode: true });
    assert(r.outcome === "environment_mismatch", JSON.stringify(r));
    const { data: despues } = await admin.from("billing_subscriptions")
      .select("provider_subscription_id").eq("id", v.subId).single();
    assert((despues as { provider_subscription_id: string | null })
      .provider_subscription_id === null,
      "un aviso del entorno equivocado alcanzó a sellar la suscripción");
  });

  await check("38. Sin fuente gobernada del entorno, no se reconcilia", async () => {
    // Ni intento ni proyección: nadie puede decir si esto es pruebas o
    // producción salvo quien llama, y eso no vale.
    const h = await suscripcion("mercadopago", "huerfana");
    await admin.from("billing_subscriptions")
      .update({ provider_subscription_id: h.preapproval }).eq("id", h.subId);
    await admin.from("billing_checkout_intents")
      .update({ provider_subscription_id: null }).eq("id", h.intentId);
    const r = await reconciliar({ preapproval: h.preapproval,
      invoice: `inv-huerf-${sello}`, cycleAt: cicloEn(h.ancla, 2),
      paymentId: `pay-huerf-${sello}`, amount: 1 });
    assert(r.outcome === "environment_unverifiable",
      `esperaba environment_unverifiable y vino ${JSON.stringify(r)}`);
  });

  await check("39. Un proveedor que no es el de la suscripción falla cerrado", async () => {
    const w = await suscripcion("wompi", "prov-mismatch");
    // El intento es de Wompi; se le cambia el proveedor al de recurrencia
    // propia para que la resolución llegue a una suscripción que NO lo es.
    await admin.from("billing_checkout_intents")
      .update({ provider: "mercadopago" }).eq("id", w.intentId);
    const r = await reconciliar({ preapproval: w.preapproval,
      invoice: `inv-provm-${sello}`, cycleAt: cicloEn(w.ancla, 2),
      paymentId: `pay-provm-${sello}`, amount: 1 });
    assert(r.outcome === "provider_mismatch",
      `esperaba provider_mismatch y vino ${JSON.stringify(r)}`);
  });

  await check("40. Dos intentos con el mismo preapproval: la base no los deja nacer", async () => {
    // La rama `checkout_intent_ambiguous` es defensa en profundidad. Lo que hoy
    // lo impide es el índice de 0171, y se comprueba ejecutándolo.
    const { rows } = await pg.query(
      `select indexdef from pg_indexes
        where schemaname = 'public' and tablename = 'billing_checkout_intents'
          and indexname = 'bci_provider_subscription_uniq'`);
    assert(rows.length === 1, "no existe bci_provider_subscription_uniq");
    assert(String(rows[0].indexdef).includes("provider_subscription_id IS NOT NULL"),
      "el índice no es parcial: los nulos colisionarían");
    const { error } = await admin.from("billing_checkout_intents")
      .update({ provider_subscription_id: orgA.preapproval }).eq("id", orgB.intentId);
    assert(Boolean(error) && String(error?.code) === "23505",
      `la base aceptó dos intentos con el mismo preapproval: ${error?.code}`);
  });

  // ---- Limpieza ----------------------------------------------------------
  //
  // TEST-HYGIENE-05 · Aquí había una copia a mano del barrido por claves
  // ajenas: bajaba el disparador de solo-añadir SIN punto de retorno, se tragaba
  // los errores de cada borrado con `catch {}` y no comprobaba absolutamente
  // nada al terminar. Tres copias del mismo algoritmo divergen en cuanto una se
  // toca, y la que calla no se puede diagnosticar: eso fue exactamente lo que
  // dejó fixtures en Staging y hubo que barrer a mano.
  //
  // El ayudante común aparta el disparador SOLO si este fixture tiene ciclos,
  // lo hace dentro de un punto de retorno, lo vuelve a poner y COMPRUEBA que
  // quedó activo. Y devuelve lo que no pudo hacer.
  // La segunda proyección —`plan-otro-…`— no la retira ninguna comprobación:
  // se registra para demostrar que una divergencia PARA la reconciliación, y
  // ahí termina su papel. Quedaba VIGENTE en cada ejecución. Ahora las dos se
  // retiran por la primitiva, que es idempotente: la que la prueba 6 ya retiró
  // no se rompe por intentarlo otra vez.
  const residuo = await limpiarFixtures(pg, admin, { orgs, personas, planesProveedor });

  await check("28. La suite no deja un solo fixture detrás", async () => {
    assert(residuo.problemas.length === 0,
      `la limpieza informó de: ${residuo.problemas.join(" · ")}`);
    assert(residuo.organizaciones === 0 && residuo.personas === 0
      && Object.keys(residuo.porTabla).length === 0,
      `quedaron fixtures: ${describirResiduo(residuo)}`);
    const { rows: ciclos } = await pg.query(
      `select count(*)::int n from public.billing_provider_cycles
        where organization_id = any($1::uuid[])`, [orgs]);
    assert(ciclos[0].n === 0, `quedaron ${ciclos[0].n} ciclos de proveedor`);
    const { rows: trg } = await pg.query(
      `select tgenabled from pg_trigger
        where tgname = 'billing_provider_cycle_is_append_only_trg'`);
    assert(trg[0]?.tgenabled !== 'D',
      "el disparador de solo-añadir de los ciclos quedó deshabilitado");
    // Por IDENTIFICADOR propio. No se exige cero FILAS —0185 no deja borrarlas
    // y una versión nueva es historia legítima—: se exige cero VIGENTES.
    assert(residuo.planesActivos === 0,
      `quedaron ${residuo.planesActivos} proyecciones de esta vuelta VIGENTES`);
    const { rows: mias } = await pg.query(
      `select count(*)::int n from public.billing_provider_plans
        where id = any($1::uuid[])`, [planesProveedor]);
    assert(mias[0].n === planesProveedor.length,
      "desapareció alguna proyección: son historia y no se borran");
  });

  await pg.end();

  console.log(`\n0186 · reconciliación: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
