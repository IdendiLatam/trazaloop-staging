import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · MP-REC-01B · Abrir una recurrencia, contra la base de verdad.
 *
 *
 * POR QUÉ ESTA BATERÍA EXISTE ADEMÁS DE LA DETERMINISTA
 *
 * `mprec01b-reconciliation` comprueba la máquina de estados con la base
 * simulada. Eso vale para el razonamiento y no vale para las invariantes: un
 * índice parcial, un cerrojo por empresa y un `check` de estado solo existen si
 * la base los tiene. Aquí se comprueban donde viven.
 *
 * Lo que se defiende:
 *
 *   · Abrir dos veces no abre dos veces. Ni por doble clic, ni por refresco.
 *   · PENDIENTE no concede NADA. Ni periodo, ni pago, ni módulo.
 *   · El carril manual no se entera de que esto existe.
 *
 * Correr: npm run test:mprec01b-db
 */

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.log("falta SUPABASE_DB_URL en .env.local"); process.exit(1); }

let passed = 0, failed = 0;
async function check(nombre: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }

const sello = Date.now();

async function main() {
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  const q = async (sql: string, params: unknown[] = []) => (await pg.query(sql, params)).rows;
  await q("set role postgres");

  // ── fixture ────────────────────────────────────────────────────────────────
  // Las primitivas exigen `auth.uid()` y administración de la empresa. En una
  // batería de base no hay sesión, así que se suplantan las DOS cosas: la
  // identidad y la pertenencia. Suplantar solo una daría un verde falso.
  const usuario = "11111111-1111-4111-8111-111111111111";
  const correo = `mprec01b-${sello}@test.trazaloop.dev`;
  await q(`insert into auth.users (id, email, aud, role)
           values ($1, $2, 'authenticated', 'authenticated')
           on conflict (id) do nothing`, [usuario, correo]);

  const [org] = await q(
    `insert into organizations (name, country, contact_email, created_by)
     values ($1, 'CO', $2, $3) returning id`,
    [`MPREC01B-${sello}`, correo, usuario]);
  const orgId = org.id as string;

  await q(`insert into memberships (organization_id, user_id, role_code, status)
           values ($1, $2, 'admin', 'active')
           on conflict (organization_id, user_id) do nothing`, [orgId, usuario]);
  await q(`select set_config('request.jwt.claims',
             json_build_object('sub', $1::text, 'role', 'authenticated')::text, false)`,
          [usuario]);

  const modulosAlEmpezar = await (async () => JSON.stringify(await q(
    `select module_code, enabled, access_mode, access_expires_at, assignment_source
       from organization_modules where organization_id = $1 order by module_code`,
    [orgId])))();
  const [ajenas0] = await q(
    `select count(*)::int n from billing_subscriptions
      where renewal_mode = 'provider' and organization_id <> $1`, [orgId]);
  const ajenasAlEmpezar = ajenas0.n as number;

  const [rev] = await q(
    `select pr.id, pr.plan_code from plan_revisions pr
      where pr.plan_code = 'full' order by pr.created_at desc limit 1`);
  assert(Boolean(rev), "no hay revisión del plan full sobre la que presupuestar");

  // La regla fiscal decide la clase de servicio: se toma una vigente y se usa
  // SU clase, en vez de emparejar dos filas elegidas por separado.
  const [regla] = await q(
    `select id, service_class, rate_basis_points from billing_tax_rules
      where status = 'active' order by effective_from desc limit 1`);
  assert(Boolean(regla), "no hay regla fiscal vigente sobre la que presupuestar");

  /** Un presupuesto canónico, como el que congela el precio al contratar. */
  const nuevoPresupuesto = async () => {
    const [qt] = await q(
      `insert into billing_quotes (
         organization_id, plan_code, plan_revision_id, billing_interval,
         catalog_amount_minor, catalog_currency, charge_currency,
         discount_amount, base_amount, service_class, tax_rule_id,
         tax_rate_basis_points, tax_amount, total_amount, status, expires_at)
       values ($1, $2, $3, 'monthly', 4000000, 'USD', 'COP',
               0, 132000, $4, $5, $6, 25080, 157080, 'open', now() + interval '1 day')
       returning id`,
      [orgId, rev.plan_code, rev.id, regla.service_class, regla.id,
       regla.rate_basis_points]);
    return qt.id as string;
  };

  /** Foto de los módulos de la empresa. Comparar la foto entera es más fiel a
   *  «pendiente no promueve nada» que mirar una columna concreta. */
  const fotoModulos = async () => JSON.stringify(await q(
    `select module_code, enabled, access_mode, access_expires_at, assignment_source
       from organization_modules where organization_id = $1 order by module_code`,
    [orgId]));

  /** Abre intento + recurrencia como lo haría el servicio de producto. */
  const abrir = async (quoteId: string) => {
    const [i] = await q(
      `select public.billing_open_checkout_intent($1, 'mercadopago', 'test') as r`,
      [quoteId]);
    const intentId = i.r.intent_id as string;
    const [a] = await q(
      `select public.billing_open_recurring_authorization($1) as r`, [intentId]);
    return { intentId, apertura: a.r as Record<string, unknown> };
  };

console.log("\n1 · ABRIR DEJA LA RECURRENCIA PENDIENTE, Y PENDIENTE NO DA NADA");

await check("1A. Se crea UNA suscripción y UNA autorización", async () => {
  const quoteId = await nuevoPresupuesto();
  const { apertura } = await abrir(quoteId);
  assert(apertura.outcome === "opened", `outcome=${apertura.outcome}`);

  const subs = await q(
    `select id, status, renewal_mode from billing_subscriptions where organization_id = $1`,
    [orgId]);
  assert(subs.length === 1, `hay ${subs.length} suscripciones`);
  assert(subs[0].status === "pending", `la suscripción nace «${subs[0].status}»`);
  assert(subs[0].renewal_mode === "provider",
    `renewal_mode=${subs[0].renewal_mode}`);

  const auts = await q(
    `select id, status, environment from billing_recurring_authorizations
      where organization_id = $1`, [orgId]);
  assert(auts.length === 1, `hay ${auts.length} autorizaciones`);
  assert(auts[0].status === "awaiting_authorization", `status=${auts[0].status}`);
  assert(auts[0].environment === "test", `environment=${auts[0].environment}`);
});

await check("1B. Sin periodo, sin pago y sin módulo promovido", async () => {
  const per = await q(
    `select count(*)::int n from billing_subscription_periods where organization_id = $1`,
    [orgId]);
  const pag = await q(
    `select count(*)::int n from billing_payments where organization_id = $1`, [orgId]);
  assert(per[0].n === 0, `hay ${per[0].n} periodos pagados`);
  assert(pag[0].n === 0, `hay ${pag[0].n} pagos`);

  // La puerta de los módulos lee la proyección de 0194, que sale de periodos
  // PAGADOS. Sin periodo no puede haber promoción, así que la foto no se mueve.
  assert(await fotoModulos() === modulosAlEmpezar,
    "abrir la recurrencia movió el acceso a módulos");
});

console.log("\n2 · ABRIR DOS VECES NO ABRE DOS VECES");

await check("2A. Abrir otra vez reutiliza lo que ya existía", async () => {
  // Dos presupuestos distintos de la MISMA empresa: es lo que produce un
  // refresco que vuelve a presupuestar. No pueden salir dos contrataciones.
  const primera = await abrir(await nuevoPresupuesto());
  const segunda = await abrir(await nuevoPresupuesto());
  assert(segunda.apertura.subscription_id === primera.apertura.subscription_id,
    "salieron dos suscripciones comerciales para la misma empresa");

  assert(segunda.apertura.outcome === "reused",
    `la segunda apertura dijo «${segunda.apertura.outcome}»`);
  assert(segunda.apertura.authorization_id === primera.apertura.authorization_id,
    "la segunda apertura creó otra autorización");
});

await check("2B. Y la base impide dos autorizaciones vivas aunque se fuerce", async () => {
  // Saltándose la primitiva: es lo que haría un camino nuevo que alguien
  // escribiera mañana sin acordarse del cerrojo. El índice parcial de 0204 es
  // la defensa que no depende de que nadie se acuerde.
  const [sub] = await q(
    `select id from billing_subscriptions where organization_id = $1 limit 1`, [orgId]);
  let fallo = "";
  try {
    await q(
      `insert into billing_recurring_authorizations
         (subscription_id, organization_id, provider, provider_subscription_id,
          environment, status)
       values ($1, $2, 'mercadopago', $3, 'test', 'awaiting_authorization')`,
      [sub.id, orgId, `forzada-${sello}`]);
  } catch (e) { fallo = e instanceof Error ? e.message : String(e); }
  assert(/duplicate key|unique/i.test(fallo),
    `una segunda autorización viva entró sin protesta: ${fallo || "(sin error)"}`);
});

console.log("\n3 · ATAR LA PREAPPROVAL");

await check("3A. Atar deja el identificador y el enlace del proveedor", async () => {
  const [a] = await q(
    `select id from billing_recurring_authorizations
      where organization_id = $1 order by created_at desc limit 1`, [orgId]);
  const [r] = await q(
    `select public.billing_attach_recurring_preapproval(
       $1, $2, 'https://www.mercadopago.com.co/subscriptions/checkout?preapproval_id=x',
       'pending', '3663569024') as r`, [a.id, `preapproval-${sello}`]);
  assert(r.r.outcome === "attached", `outcome=${r.r.outcome}`);

  const [fila] = await q(
    `select provider_subscription_id, init_point_url, init_point_issued_at,
            observed_collector_id, status
       from billing_recurring_authorizations where id = $1`, [a.id]);
  assert(fila.provider_subscription_id === `preapproval-${sello}`,
    "no quedó atada la preapproval");
  assert(Boolean(fila.init_point_issued_at), "no se selló cuándo se emitió el enlace");
  assert(fila.observed_collector_id === "3663569024", "no se anotó el cobrador");
  // Y atar NO autoriza: sigue esperando al comprador.
  assert(fila.status === "awaiting_authorization",
    `atar cambió el estado a «${fila.status}»`);
});

await check("3B. Reatar la MISMA es un reintento; atar otra se rechaza", async () => {
  const [a] = await q(
    `select id from billing_recurring_authorizations
      where organization_id = $1 order by created_at desc limit 1`, [orgId]);
  const [igual] = await q(
    `select public.billing_attach_recurring_preapproval($1, $2, null, null, null) as r`,
    [a.id, `preapproval-${sello}`]);
  assert(igual.r.outcome === "attached", `reintentar dio «${igual.r.outcome}»`);

  const [otra] = await q(
    `select public.billing_attach_recurring_preapproval($1, 'otra-distinta', null, null, null) as r`,
    [a.id]);
  assert(otra.r.outcome === "already_attached_to_another",
    `atar otra preapproval dio «${otra.r.outcome}»`);
  // Y la primera sigue donde estaba: no se perdió el rastro.
  const [fila] = await q(
    `select provider_subscription_id from billing_recurring_authorizations where id = $1`,
    [a.id]);
  assert(fila.provider_subscription_id === `preapproval-${sello}`,
    "se perdió el rastro de la primera preapproval");
});

console.log("\n4 · OBSERVAR NO CONCEDE");

await check("4A. Anotar `authorized` no crea periodo ni promueve módulos", async () => {
  const [a] = await q(
    `select id from billing_recurring_authorizations
      where organization_id = $1 order by created_at desc limit 1`, [orgId]);
  await q(`select public.billing_observe_recurring_authorization($1, 'authorized', true, null)`,
          [a.id]);

  const [fila] = await q(
    `select status, authorized_at, last_reconciled_at
       from billing_recurring_authorizations where id = $1`, [a.id]);
  assert(fila.status === "authorized", `status=${fila.status}`);
  assert(Boolean(fila.authorized_at), "no se selló cuándo autorizó");
  assert(Boolean(fila.last_reconciled_at), "no se selló cuándo se miró");

  // Y sin embargo, nada de dinero ni de derecho.
  const per = await q(
    `select count(*)::int n from billing_subscription_periods where organization_id = $1`,
    [orgId]);
  assert(per[0].n === 0, `autorizar creó ${per[0].n} periodos`);
  assert(await fotoModulos() === modulosAlEmpezar,
    "autorizar movió el acceso a módulos");

  // La suscripción comercial sigue pendiente: el derecho lo da un PAGO.
  const [sub] = await q(
    `select status, current_period_end from billing_subscriptions
      where organization_id = $1 order by created_at limit 1`, [orgId]);
  assert(sub.status === "pending", `la suscripción pasó a «${sub.status}» sin pagar`);
  assert(sub.current_period_end === null, "apareció una vigencia sin pagar");
});

await check("4B. La fecha de autorización se sella UNA vez", async () => {
  const [a] = await q(
    `select id, authorized_at from billing_recurring_authorizations
      where organization_id = $1 order by created_at desc limit 1`, [orgId]);
  await q(`select public.billing_observe_recurring_authorization($1, 'authorized', true, null)`,
          [a.id]);
  const [despues] = await q(
    `select authorized_at from billing_recurring_authorizations where id = $1`, [a.id]);
  assert(String(despues.authorized_at) === String(a.authorized_at),
    "volver a mirar movió la fecha en que el comprador autorizó");
});

console.log("\n6 · UN CICLO PAGADO PROMUEVE · MP-REC-01C");

await check("6A. Autorizar NO promueve: sigue pendiente", async () => {
  const [sub] = await q(
    `select id, status from billing_subscriptions
      where organization_id = $1 and renewal_mode = 'provider'
      order by created_at limit 1`, [orgId]);
  assert(sub.status === "pending", `la suscripción ya estaba «${sub.status}»`);
});

await check("6B. Un periodo SALDADO la pone activa, en la misma transacción", async () => {
  const [sub] = await q(
    `select id from billing_subscriptions
      where organization_id = $1 and renewal_mode = 'provider'
      order by created_at limit 1`, [orgId]);
  // Se crea el periodo ya saldado: es lo que hace la liquidación canónica.
  await q(
    `insert into billing_subscription_periods
       (subscription_id, organization_id, period_sequence, period_start,
        period_end, base_amount, charge_currency, status, settled_at)
     values ($1, $2, 1, now(), now() + interval '1 month', 160000, 'COP',
             'settled', now())`, [sub.id, orgId]);
  const [despues] = await q(
    `select status from billing_subscriptions where id = $1`, [sub.id]);
  assert(despues.status === "active", `quedó «${despues.status}»`);
});

/* Una empresa APARTE para los dos casos negativos: la principal ya tiene su
   suscripción viva, y `billing_subscriptions_one_live` —con razón— no admite
   una segunda. Meter el fixture ahí probaría el índice, no el disparador. */
const [orgB] = await q(
  `insert into organizations (name, country, contact_email, created_by)
   values ($1, 'CO', $2, $3) returning id`,
  [`MPREC01C-B-${sello}`, correo, usuario]);
const orgIdB = orgB.id as string;

await check("6C. Un periodo ABIERTO no promueve a nadie", async () => {
  // Solo `settled`. Un periodo abierto es una obligación, no un cobro.
  const [otra] = await q(
    `insert into billing_subscriptions
       (organization_id, provider, plan_code, plan_revision_id, billing_interval,
        catalog_amount_minor, catalog_currency, base_charge_amount, charge_currency,
        status, renewal_mode)
     select $1, 'mercadopago', plan_code, plan_revision_id, billing_interval,
            catalog_amount_minor, catalog_currency, base_amount, charge_currency,
            'ended', 'provider'
       from billing_quotes where organization_id <> $1 order by created_at desc limit 1
     returning id`, [orgIdB]);
  await q(`update billing_subscriptions set status = 'pending' where id = $1`, [otra.id]);
  await q(
    `insert into billing_subscription_periods
       (subscription_id, organization_id, period_sequence, period_start,
        period_end, base_amount, charge_currency, status)
     values ($1, $2, 1, now(), now() + interval '1 month', 160000, 'COP', 'open')`,
    [otra.id, orgIdB]);
  const [d] = await q(`select status from billing_subscriptions where id = $1`, [otra.id]);
  assert(d.status === "pending", `un periodo abierto promovió a «${d.status}»`);
  await q(`delete from billing_subscription_periods where subscription_id = $1`, [otra.id]);
  await q(`delete from billing_subscriptions where id = $1`, [otra.id]);
});

await check("6D. El carril MANUAL no lo toca el disparador", async () => {
  const [man] = await q(
    `insert into billing_subscriptions
       (organization_id, provider, plan_code, plan_revision_id, billing_interval,
        catalog_amount_minor, catalog_currency, base_charge_amount, charge_currency,
        status, renewal_mode)
     select $1, 'mercadopago', plan_code, plan_revision_id, billing_interval,
            catalog_amount_minor, catalog_currency, base_amount, charge_currency,
            'ended', 'manual'
       from billing_quotes where organization_id <> $1 order by created_at desc limit 1
     returning id`, [orgIdB]);
  await q(`update billing_subscriptions set status = 'pending' where id = $1`, [man.id]);
  await q(
    `insert into billing_subscription_periods
       (subscription_id, organization_id, period_sequence, period_start,
        period_end, base_amount, charge_currency, status, settled_at)
     values ($1, $2, 1, now(), now() + interval '1 month', 160000, 'COP',
             'settled', now())`, [man.id, orgIdB]);
  const [d] = await q(`select status from billing_subscriptions where id = $1`, [man.id]);
  assert(d.status === "pending",
    `el disparador promovió una suscripción manual a «${d.status}»`);
  await q(`delete from billing_subscription_periods where subscription_id = $1`, [man.id]);
  await q(`delete from billing_subscriptions where id = $1`, [man.id]);
});

await check("6E. Una cancelada al borde no vuelve a activa por cobrar", async () => {
  // Cancelar es una decisión del cliente; el último ciclo cobrado no la revoca.
  const [sub] = await q(
    `select id from billing_subscriptions
      where organization_id = $1 and renewal_mode = 'provider' and status = 'active'
      limit 1`, [orgId]);
  await q(`update billing_subscriptions set status = 'cancel_at_period_end' where id = $1`,
          [sub.id]);
  await q(
    `insert into billing_subscription_periods
       (subscription_id, organization_id, period_sequence, period_start,
        period_end, base_amount, charge_currency, status, settled_at)
     values ($1, $2, 2, now() + interval '1 month', now() + interval '2 months',
             160000, 'COP', 'settled', now())`, [sub.id, orgId]);
  const [d] = await q(`select status from billing_subscriptions where id = $1`, [sub.id]);
  assert(d.status === "cancel_at_period_end",
    `un cobro revirtió la cancelación: «${d.status}»`);
});

console.log("\n5 · EL CARRIL MANUAL NO SE ENTERA");

await check("5A. Ninguna suscripción manual cambió de modo", async () => {
  // NO se compara contra cero: 0190 ya puso en `provider` las suscripciones de
  // esa pasarela que existían. Lo que no puede pasar es que ESTA batería mueva
  // a nadie más, así que se compara contra la línea base de antes de empezar.
  const otras = await q(
    `select count(*)::int n from billing_subscriptions
      where renewal_mode = 'provider' and organization_id <> $1`, [orgId]);
  assert(otras[0].n === ajenasAlEmpezar,
    `las suscripciones ajenas en renovación por pasarela pasaron de `
    + `${ajenasAlEmpezar} a ${otras[0].n}`);
});

await check("5B. No se abrió ningún cobro único por el camino recurrente", async () => {
  const uno = await q(
    `select count(*)::int n from billing_one_time_checkouts where organization_id = $1`,
    [orgId]);
  assert(uno[0].n === 0, `el carril recurrente abrió ${uno[0].n} cobros únicos`);
});

console.log("\n7 · CANCELAR NO ES PERDER LO PAGADO · MP-REC-01C.1");

/** Una recurrencia recién hecha, con su autorización atada. */
const recurrenciaConPeriodo = async (finPeriodo: string) => {
  const [org2] = await q(
    `insert into organizations (name, country, contact_email, created_by)
     values ($1, 'CO', $2, $3) returning id`,
    [`MPREC01C1-${sello}-${Math.random().toString(36).slice(2, 8)}`, correo, usuario]);
  const [sub] = await q(
    `insert into billing_subscriptions
       (organization_id, provider, plan_code, plan_revision_id, billing_interval,
        catalog_amount_minor, catalog_currency, base_charge_amount, charge_currency,
        status, renewal_mode)
     select $1, 'mercadopago', plan_code, plan_revision_id, billing_interval,
            catalog_amount_minor, catalog_currency, base_amount, charge_currency,
            'pending', 'provider'
       from billing_quotes where organization_id = $2 limit 1
     returning id`, [org2.id, orgId]);
  const [aut] = await q(
    `insert into billing_recurring_authorizations
       (subscription_id, organization_id, provider, provider_subscription_id,
        environment, status, authorized_at)
     -- El estado autorizado EXIGE su fecha: lo impone bra_authorized_shape de
     -- 0204, y es correcto. Un estado que dice que alguien autorizo sin decir
     -- cuando es media verdad. El fixture la pone, como la observacion real.
     values ($1, $2, 'mercadopago', $3, 'test', 'authorized', now()) returning id`,
    [sub.id, org2.id, `pre-${Math.random().toString(36).slice(2, 12)}`]);
  if (finPeriodo !== "ninguno") {
    await q(
      `insert into billing_subscription_periods
         (subscription_id, organization_id, period_sequence, period_start,
          period_end, base_amount, charge_currency, status, settled_at)
       values ($1, $2, 1, now() - interval '1 day', ${finPeriodo}, 160000, 'COP',
               'settled', now())`, [sub.id, org2.id]);
  }
  // Nace `pending` —como en el flujo real— y la promueve su periodo saldado,
  // por el disparador de 0208. Crearla `active` sin periodo lo impide el guard
  // `billing_live_subscription_has_period`, y con razón.
  return { orgId: org2.id as string, subId: sub.id as string, autId: aut.id as string };
};

await check("7A. Con tiempo pagado: cancel_at_period_end y el acceso SIGUE", async () => {
  const f = await recurrenciaConPeriodo("now() + interval '20 days'");
  const [r] = await q(`select public.billing_cancel_recurring($1, 'cancelled', 'cancelled') as r`,
                      [f.autId]);
  assert(r.r.outcome === "cancelled", `outcome=${r.r.outcome}`);
  assert(r.r.canonical_status === "cancel_at_period_end", `estado=${r.r.canonical_status}`);
  assert(r.r.access_preserved === true, "se declaró que el acceso no se conserva");

  const [sub] = await q(`select status, cancel_at_period_end, cancelled_at
                           from billing_subscriptions where id = $1`, [f.subId]);
  assert(sub.status === "cancel_at_period_end", `suscripción en «${sub.status}»`);
  assert(sub.cancel_at_period_end === true, "no quedó marcada al borde del periodo");
  // Y NADA de lo pagado se tocó.
  const per = await q(`select status from billing_subscription_periods
                        where subscription_id = $1`, [f.subId]);
  assert(per.length === 1 && per[0].status === "settled",
    "cancelar tocó el periodo pagado");
  const [aut] = await q(`select status, cancelled_at
                           from billing_recurring_authorizations where id = $1`, [f.autId]);
  assert(aut.status === "cancelled" && aut.cancelled_at !== null,
    "la autorización no quedó cancelada con su fecha");
});

await check("7B. Sin tiempo pagado vigente: ended", async () => {
  const f = await recurrenciaConPeriodo("now() - interval '1 hour'");
  const [r] = await q(`select public.billing_cancel_recurring($1, 'cancelled', 'cancelled') as r`,
                      [f.autId]);
  assert(r.r.canonical_status === "ended", `estado=${r.r.canonical_status}`);
  assert(r.r.access_preserved === false, "declaró acceso conservado sin tiempo pagado");
});

await check("7C. Sin ningún periodo: ended", async () => {
  const f = await recurrenciaConPeriodo("ninguno");
  const [r] = await q(`select public.billing_cancel_recurring($1, 'cancelled', 'cancelled') as r`,
                      [f.autId]);
  assert(r.r.canonical_status === "ended", `estado=${r.r.canonical_status}`);
});

await check("7D. Cancelar dos veces no hace nada nuevo", async () => {
  const f = await recurrenciaConPeriodo("now() + interval '20 days'");
  await q(`select public.billing_cancel_recurring($1, 'cancelled', 'cancelled')`, [f.autId]);
  const [antes] = await q(`select cancelled_at from billing_recurring_authorizations
                             where id = $1`, [f.autId]);
  const [r2] = await q(`select public.billing_cancel_recurring($1, 'cancelled', 'cancelled') as r`,
                       [f.autId]);
  assert(r2.r.outcome === "cancelled", "la segunda no respondió lo mismo");
  const [despues] = await q(`select cancelled_at, status from billing_recurring_authorizations
                               where id = $1`, [f.autId]);
  assert(String(despues.cancelled_at) === String(antes.cancelled_at),
    "la segunda cancelación movió la fecha de la primera");
  const per = await q(`select id from billing_subscription_periods
                        where subscription_id = $1`, [f.subId]);
  assert(per.length === 1, "cancelar dos veces tocó los periodos");
});

await check("7E. Un fallo AMBIGUO no cancela ni quita acceso", async () => {
  const f = await recurrenciaConPeriodo("now() + interval '20 days'");
  const [r] = await q(
    `select public.billing_cancel_recurring($1, 'uncertain', null, 'provider_unavailable',
       'tiempo agotado al pedir la cancelacion') as r`, [f.autId]);
  assert(r.r.outcome === "uncertain", `outcome=${r.r.outcome}`);
  assert(r.r.access_preserved === true, "no declaró el acceso conservado");
  const [sub] = await q(`select status from billing_subscriptions where id = $1`, [f.subId]);
  assert(sub.status === "active", `una duda movió la suscripción a «${sub.status}»`);
  const [aut] = await q(`select status, last_provider_failure, last_provider_diagnostic
                           from billing_recurring_authorizations where id = $1`, [f.autId]);
  assert(aut.status === "authorized", `una duda cerró la autorización: «${aut.status}»`);
  assert(aut.last_provider_failure === "provider_unavailable", "no anotó la causa");
  assert(Boolean(aut.last_provider_diagnostic), "no anotó el diagnóstico");
});

await check("7F. Un rechazo definitivo tampoco quita acceso", async () => {
  const f = await recurrenciaConPeriodo("now() + interval '20 days'");
  const [r] = await q(
    `select public.billing_cancel_recurring($1, 'refused', null, 'invalid_request',
       'la pasarela no acepto la cancelacion') as r`, [f.autId]);
  assert(r.r.outcome === "refused", `outcome=${r.r.outcome}`);
  const [sub] = await q(`select status from billing_subscriptions where id = $1`, [f.subId]);
  assert(sub.status === "active", `un rechazo movió la suscripción a «${sub.status}»`);
  assert(r.r.access_preserved === true, "declaró que el acceso se pierde");
});

await check("7G. Una `ended` no revive al cancelar otra vez", async () => {
  const f = await recurrenciaConPeriodo("ninguno");
  await q(`select public.billing_cancel_recurring($1, 'cancelled', 'cancelled')`, [f.autId]);
  const [sub] = await q(`select status from billing_subscriptions where id = $1`, [f.subId]);
  assert(sub.status === "ended", `quedó «${sub.status}»`);
  await q(`select public.billing_cancel_recurring($1, 'cancelled', 'cancelled')`, [f.autId]);
  const [d] = await q(`select status from billing_subscriptions where id = $1`, [f.subId]);
  assert(d.status === "ended", `la segunda la movió a «${d.status}»`);
});

console.log("\n8 · CICLOS FUTUROS · MP-REC-01C.3");

/*
  DETERMINISTIC_SECOND_CYCLE_TEST.

  Mercado Pago NO cobra aquí. El «segundo ciclo» se fabrica llamando a la MISMA
  primitiva canónica que usa la conciliación —`billing_reconcile_provider_cycle`—
  con la identidad y la fecha económica que el proveedor produciría un mes
  después. Lo que se comprueba es la máquina de estados, no al proveedor.

  Fixture PROPIO: las secciones anteriores ya movieron la suscripción principal,
  y una prueba de contigüidad sobre periodos que otro test insertó a mano no
  comprobaría nada.
*/
const iso = (v: unknown) => new Date(v as string).toISOString();

const cicloDeProveedor = async (o: { preapproval: string; invoice: string;
                                     cycleAt: string; amount: number; outcome: string }) => {
  const [r] = await q(
    `select public.billing_reconcile_provider_cycle(
       'mercadopago', $1, $2, $3::timestamptz, $2, $4, $5, 'COP', false) as r`,
    [o.preapproval, o.invoice, o.cycleAt, o.outcome, o.amount]);
  return r.r as Record<string, unknown>;
};

/** Una recurrencia lista para recibir ciclos del proveedor. */
let nCiclos = 0;
const recurrenciaParaCiclos = async () => {
  const f = await recurrenciaConPeriodo("now() + interval '20 days'");
  // Identidad ÚNICA por fixture: el objeto del proveedor pertenece a una sola
  // suscripción, y la base lo impone con `billing_subscriptions_provider_uniq`.
  const pre = `pre-ciclos-${sello}-${++nCiclos}`;

  // 0186 exige una FUENTE GOBERNADA del entorno —el intento o la proyección del
  // proveedor— y se niega con `environment_unverifiable` si no la hay. Es
  // correcto: sin ella, «test» y «live» los decidiría quien llama. El fixture
  // crea el presupuesto y el intento, como el camino de producto.
  const [qt] = await q(
    `insert into billing_quotes (
       organization_id, plan_code, plan_revision_id, billing_interval,
       catalog_amount_minor, catalog_currency, charge_currency,
       discount_amount, base_amount, service_class, tax_rule_id,
       tax_rate_basis_points, tax_amount, total_amount, status, expires_at)
     values ($1, $2, $3, 'monthly', 4000000, 'USD', 'COP',
             0, 160000, $4, $5, $6, 30400, 190400, 'open', now() + interval '1 day')
     returning id`,
    [f.orgId, rev.plan_code, rev.id, regla.service_class, regla.id,
     regla.rate_basis_points]);
  await q(
    `insert into billing_checkout_intents (
       organization_id, quote_id, provider, environment, expected_total_amount,
       expected_currency, billing_interval, plan_code, created_by,
       billing_subscription_id, provider_subscription_id, status)
     values ($1, $2, 'mercadopago', 'test', 190400, 'COP', 'monthly', $3, $4,
             $5, $6, 'provider_created')`,
    [f.orgId, qt.id, rev.plan_code, usuario, f.subId, pre]);
  // 0186 resuelve la suscripción POR el objeto del proveedor. El fixture se lo
  // ata, igual que hace el camino de producto al crear la preapproval.
  // El periodo 1 tiene que durar un MES canónico. 0186 calcula el ciclo
  // siguiente desde el ancla con la periodicidad contratada —y hace bien—, así
  // que un fixture de 21 días produciría un hueco que no dice nada del
  // producto: diría que mi fixture no era mensual.
  await q(`update billing_subscription_periods
              set period_end = period_start + interval '1 month'
            where subscription_id = $1 and period_sequence = 1`, [f.subId]);

  // La BASE de la suscripción y la del periodo tienen que ser la misma: el
  // importe esperado lo deriva la base de ahí, y una fixture incoherente
  // produce un `reconciliation_mismatch` que no dice nada del producto.
  await q(`update billing_subscriptions set base_charge_amount = 160000,
             charge_currency = 'COP' where id = $1`, [f.subId]);
  await q(`update billing_subscriptions set provider_subscription_id = $2,
             period_anchor_at = (select period_start from billing_subscription_periods
                                  where subscription_id = $1 order by period_sequence limit 1),
             period_anchor_sequence = 1
           where id = $1`, [f.subId, pre]);
  await q(`update billing_recurring_authorizations set provider_subscription_id = $2
           where id = $1`, [f.autId, pre]);
  const [p1] = await q(
    `select period_sequence, period_start, period_end from billing_subscription_periods
      where subscription_id = $1 order by period_sequence limit 1`, [f.subId]);
  return { ...f, preapproval: pre, p1 };
};

await check("8A. El segundo cobro crea el periodo siguiente, contiguo", async () => {
  const f = await recurrenciaParaCiclos();
  const r = await cicloDeProveedor({ preapproval: f.preapproval,
    invoice: `inv-b-${sello}`, cycleAt: iso(f.p1.period_end),
    amount: 190400, outcome: "approved" });
  assert(r.outcome === "renewed", `outcome=${r.outcome} ${JSON.stringify(r)}`);

  const per = await q(
    `select period_sequence, period_start, period_end, status
       from billing_subscription_periods where subscription_id = $1
      order by period_sequence`, [f.subId]);
  assert(per.length === 2, `quedaron ${per.length} periodos`);
  // CONTIGÜIDAD: ni un día perdido, ni un solapamiento.
  assert(iso(per[0].period_end) === iso(per[1].period_start),
    `el 2 no empieza donde acaba el 1: ${iso(per[0].period_end)} vs ${iso(per[1].period_start)}`);
  assert(per[1].status === "settled", `el periodo 2 quedó «${per[1].status}»`);

  // Y el acceso llega hasta el final del NUEVO periodo.
  const mods = await q(
    `select module_code, access_expires_at from organization_modules
      where organization_id = $1 and access_expires_at is not null`, [f.orgId]);
  for (const m of mods) {
    assert(iso(m.access_expires_at) === iso(per[1].period_end),
      `${m.module_code} vence en ${iso(m.access_expires_at)}, el periodo en ${iso(per[1].period_end)}`);
  }
});

await check("8B. El MISMO cobro dos veces no crea nada nuevo", async () => {
  const f = await recurrenciaParaCiclos();
  const inv = `inv-idem-${sello}`;
  await cicloDeProveedor({ preapproval: f.preapproval, invoice: inv,
    cycleAt: iso(f.p1.period_end), amount: 190400, outcome: "approved" });
  const antes = await q(
    `select count(*)::int n from billing_subscription_periods where subscription_id = $1`,
    [f.subId]);
  const r = await cicloDeProveedor({ preapproval: f.preapproval, invoice: inv,
    cycleAt: iso(f.p1.period_end), amount: 190400, outcome: "approved" });
  assert(r.outcome === "already_reconciled", `outcome=${r.outcome}`);
  const despues = await q(
    `select count(*)::int n from billing_subscription_periods where subscription_id = $1`,
    [f.subId]);
  assert(antes[0].n === despues[0].n, "repetir el mismo ciclo creó un periodo");
});

await check("8C. Un cobro RECHAZADO no salda ni extiende", async () => {
  const f = await recurrenciaParaCiclos();
  const [antesMod] = await q(
    `select max(access_expires_at) v from organization_modules
      where organization_id = $1 and access_expires_at is not null`, [f.orgId]);
  const r = await cicloDeProveedor({ preapproval: f.preapproval,
    invoice: `inv-rej-${sello}`, cycleAt: iso(f.p1.period_end),
    amount: 190400, outcome: "declined" });
  assert(r.outcome !== "renewed", `un rechazo devolvió «${r.outcome}»`);

  const saldados = await q(
    `select count(*)::int n from billing_subscription_periods
      where subscription_id = $1 and status = 'settled'`, [f.subId]);
  assert(saldados[0].n === 1, `quedaron ${saldados[0].n} periodos saldados`);
  const [despuesMod] = await q(
    `select max(access_expires_at) v from organization_modules
      where organization_id = $1 and access_expires_at is not null`, [f.orgId]);
  assert(String(despuesMod.v) === String(antesMod.v),
    "un cobro rechazado extendió el acceso");
});

await check("8D. Y el mes ya pagado sigue intacto tras el rechazo", async () => {
  // La regla que más importa: que falle el cobro de octubre no borra septiembre.
  const f = await recurrenciaParaCiclos();
  await cicloDeProveedor({ preapproval: f.preapproval, invoice: `inv-rej2-${sello}`,
    cycleAt: iso(f.p1.period_end), amount: 190400, outcome: "declined" });
  const per = await q(
    `select status, period_end from billing_subscription_periods
      where subscription_id = $1 and period_sequence = 1`, [f.subId]);
  assert(per.length === 1 && per[0].status === "settled",
    "el rechazo tocó el periodo ya pagado");
  assert(iso(per[0].period_end) === iso(f.p1.period_end),
    "el rechazo movió la fecha del periodo pagado");
});

console.log("\n9 · PONER AL DÍA SIN DECIDIR ACCESO · 0210");

await check("9A. Cancelada con tiempo por delante NO se termina", async () => {
  const f = await recurrenciaConPeriodo("now() + interval '20 days'");
  await q(`select public.billing_cancel_recurring($1, 'cancelled', 'cancelled')`, [f.autId]);
  const [r] = await q(
    `select public.billing_refresh_recurring_lifecycle($1) as r`, [f.subId]);
  assert(r.r.outcome === "unchanged", `outcome=${r.r.outcome}`);
  const [s2] = await q(`select status from billing_subscriptions where id = $1`, [f.subId]);
  assert(s2.status === "cancel_at_period_end", `quedó «${s2.status}»`);
});

await check("9B. Cancelada y vencida converge a ended, sin borrar nada", async () => {
  const f = await recurrenciaConPeriodo("now() - interval '1 hour'");
  await q(`update billing_subscriptions set status = 'cancel_at_period_end',
             cancel_at_period_end = true where id = $1`, [f.subId]);
  await q(`update billing_recurring_authorizations set status = 'cancelled',
             cancelled_at = now() where id = $1`, [f.autId]);
  const [r] = await q(
    `select public.billing_refresh_recurring_lifecycle($1) as r`, [f.subId]);
  assert(r.r.outcome === "ended", `outcome=${r.r.outcome}`);
  const [s2] = await q(`select status from billing_subscriptions where id = $1`, [f.subId]);
  assert(s2.status === "ended", `quedó «${s2.status}»`);
  // Y la historia sigue entera.
  const per = await q(`select id from billing_subscription_periods
                        where subscription_id = $1`, [f.subId]);
  assert(per.length === 1, "terminar borró el periodo");
});

await check("9C. Activa vencida con recurrencia viva pasa a past_due", async () => {
  const f = await recurrenciaConPeriodo("now() - interval '2 hours'");
  const [r] = await q(
    `select public.billing_refresh_recurring_lifecycle($1) as r`, [f.subId]);
  assert(r.r.outcome === "past_due", `outcome=${r.r.outcome}`);
  // past_due NO retira nada: el acceso ya se acabó solo, por la fecha.
  const per = await q(`select status from billing_subscription_periods
                        where subscription_id = $1`, [f.subId]);
  assert(per.length === 1 && per[0].status === "settled",
    "past_due tocó el periodo pagado");
});

await check("9D. El carril manual no lo refresca nadie", async () => {
  const [man] = await q(
    `insert into billing_subscriptions
       (organization_id, provider, plan_code, plan_revision_id, billing_interval,
        catalog_amount_minor, catalog_currency, base_charge_amount, charge_currency,
        status, renewal_mode)
     select $1, 'mercadopago', plan_code, plan_revision_id, billing_interval,
            catalog_amount_minor, catalog_currency, base_amount, charge_currency,
            'ended', 'manual'
       from billing_quotes where organization_id = $1 limit 1
     returning id`, [orgId]);
  const [r] = await q(
    `select public.billing_refresh_recurring_lifecycle($1) as r`, [man.id]);
  assert(r.r.outcome === "not_provider_renewal", `outcome=${r.r.outcome}`);
  await q(`delete from billing_subscriptions where id = $1`, [man.id]);
});

console.log("\n10 · CONCURRENCIA REAL · MP-REC-01C.4");

await check("10A. Dos conexiones a la vez sobre el MISMO ciclo: un solo efecto", async () => {
  /*
    NO es una simulación con un mutex en memoria. Son DOS conexiones distintas
    a Postgres llamando a la primitiva canónica a la vez, con la misma identidad
    de ciclo externo. Compiten de verdad contra la base.

    Lo que tiene que sostener la invariante es el índice único de
    `billing_provider_cycles`, no el orden en que lleguen.
  */
  const f = await recurrenciaParaCiclos();
  const inv = `inv-conc-${sello}`;
  const cycleAt = iso(f.p1.period_end);

  const worker = async () => {
    const c = new PgClient({ connectionString: DB_URL });
    await c.connect();
    try {
      await c.query("set role postgres");
      const r = await c.query(
        `select public.billing_reconcile_provider_cycle(
           'mercadopago', $1, $2, $3::timestamptz, $2, 'approved', 190400, 'COP', false) as r`,
        [f.preapproval, inv, cycleAt]);
      return { ok: true, outcome: r.rows[0].r.outcome as string };
    } catch (e) {
      // Un conflicto de unicidad recuperado NO es un error financiero: es la
      // base impidiendo el duplicado. Se anota y se distingue.
      const m = e instanceof Error ? e.message : String(e);
      return { ok: false, outcome: /duplicate key|unique/i.test(m)
        ? "unique_conflict" : `error:${m.slice(0, 60)}` };
    } finally { await c.end(); }
  };

  const [a, b] = await Promise.all([worker(), worker()]);
  const resultados = [a.outcome, b.outcome].sort();

  // Exactamente UNO salda. El otro: ya estaba, o chocó con la unicidad.
  const saldaron = [a, b].filter((x) => x.outcome === "renewed").length;
  assert(saldaron === 1,
    `saldaron ${saldaron} de 2 · resultados: ${resultados.join(" | ")}`);
  for (const x of [a, b]) {
    assert(["renewed", "already_reconciled", "unique_conflict"].includes(x.outcome),
      `un trabajador devolvió un error no gobernado: ${x.outcome}`);
  }

  // Y la base quedó con UNO de cada cosa.
  const ciclos = await q(
    `select count(*)::int n from billing_provider_cycles
      where provider_subscription_id = $1 and provider_invoice_id = $2`,
    [f.preapproval, inv]);
  assert(ciclos[0].n === 1, `quedaron ${ciclos[0].n} ciclos del proveedor`);

  const per = await q(
    `select count(*)::int n from billing_subscription_periods
      where subscription_id = $1`, [f.subId]);
  assert(per[0].n === 2, `quedaron ${per[0].n} periodos (se esperaban 2)`);

  const pagos = await q(
    `select count(*)::int n from billing_payments
      where organization_id = $1 and provider_payment_id = $2`, [f.orgId, inv]);
  assert(pagos[0].n === 1, `quedaron ${pagos[0].n} pagos internos para ese cobro`);

  // El acceso se extendió UNA vez: hasta el fin del periodo 2, ni más allá.
  const [p2] = await q(
    `select period_end from billing_subscription_periods
      where subscription_id = $1 order by period_sequence desc limit 1`, [f.subId]);
  const mods = await q(
    `select module_code, access_expires_at from organization_modules
      where organization_id = $1 and access_expires_at is not null`, [f.orgId]);
  for (const m of mods) {
    assert(iso(m.access_expires_at) === iso(p2.period_end),
      `${m.module_code} se extendió a ${iso(m.access_expires_at)} y el periodo acaba en ${iso(p2.period_end)}`);
  }
});

await check("10B. Y repetirlo después sigue sin efecto", async () => {
  const f = await recurrenciaParaCiclos();
  const inv = `inv-conc2-${sello}`;
  await cicloDeProveedor({ preapproval: f.preapproval, invoice: inv,
    cycleAt: iso(f.p1.period_end), amount: 190400, outcome: "approved" });
  const antes = await q(
    `select count(*)::int n from billing_subscription_periods where subscription_id = $1`,
    [f.subId]);
  const [x, y] = await Promise.all([
    cicloDeProveedor({ preapproval: f.preapproval, invoice: inv,
      cycleAt: iso(f.p1.period_end), amount: 190400, outcome: "approved" }),
    cicloDeProveedor({ preapproval: f.preapproval, invoice: inv,
      cycleAt: iso(f.p1.period_end), amount: 190400, outcome: "approved" }),
  ]);
  for (const r of [x, y]) {
    assert(r.outcome === "already_reconciled", `outcome=${r.outcome}`);
  }
  const despues = await q(
    `select count(*)::int n from billing_subscription_periods where subscription_id = $1`,
    [f.subId]);
  assert(antes[0].n === despues[0].n, "repetir en paralelo creó periodos");
});

  // ── limpieza ───────────────────────────────────────────────────────────────
  // Best-effort y en orden de dependencia. Un fallo limpiando NO puede tumbar
  // la batería: lo que se estaba comprobando ya se comprobó, y un fixture que
  // sobrevive se recoge con el barrido de higiene.
  await q(`select set_config('request.jwt.claims', null, false)`);
  for (const sql of [
    `delete from billing_subscription_periods where organization_id = $1`,
    `delete from billing_recurring_authorizations where organization_id = $1`,
    `delete from billing_checkout_intents where organization_id = $1`,
    `update billing_quotes set subscription_id = null where organization_id = $1`,
    `delete from billing_quotes where organization_id = $1`,
    `delete from billing_subscriptions where organization_id = $1`,
    `delete from memberships where organization_id = $1`,
    `delete from organizations where id = $1`,
  ]) {
    try { await q(sql, [orgId]); }
    catch (e) { console.log(`  · limpieza parcial: ${e instanceof Error ? e.message : e}`); }
  }
  for (const sql of [
    `delete from billing_subscription_periods where organization_id = $1`,
    `delete from billing_subscriptions where organization_id = $1`,
    `delete from organizations where id = $1`,
  ]) { try { await q(sql, [orgIdB]); } catch { /* fixture superviviente */ } }
  try { await q(`delete from auth.users where id = $1`, [usuario]); }
  catch { /* el perfil queda referenciado: inocuo en una base local */ }

  console.log(`\nMP-REC-01B · apertura: ${passed} en verde, ${failed} en rojo`);
  await pg.end();
  if (failed > 0) process.exit(1);
}

void main();
