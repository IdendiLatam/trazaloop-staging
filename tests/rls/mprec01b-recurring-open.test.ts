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
