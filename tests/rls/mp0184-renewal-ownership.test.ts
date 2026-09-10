import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { limpiarFixtures, describirResiduo } from "../support/fixture-cleanup";
import { readFileSync } from "node:fs";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · 0184 · De quién es la recurrencia.
 *
 * QUÉ SE ESTÁ PROTEGIENDO
 *
 * `billing_due_renewals` seleccionaba por estado y por plan, sin mirar al
 * proveedor. Con solo Wompi eso era correcto. Con Mercado Pago no: su
 * suscripción la cobra el proveedor, y ese proveedor NO guarda medio de pago
 * para nosotros — así que el motor la habría clasificado
 * `payment_method_unavailable` y, pasada la gracia, `lapse_due`. Es decir,
 * habría retirado el derecho a alguien que paga puntualmente.
 *
 * Estas pruebas existen para que esa regresión no pueda volver en silencio.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !SERVICE || !ANON) {
  console.log("faltan credenciales locales en .env.local");
  process.exit(1);
}

const admin: SupabaseClient = createClient(URL, SERVICE, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
const sello = Date.now();
const orgs: string[] = [];
const personas: string[] = [];

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

/**
 * Una empresa con una suscripción viva del proveedor indicado.
 *
 * Se crea por el FLUJO REAL —presupuesto, intento, medio de pago, liquidación—
 * y no insertando filas a mano. Dos razones: desde 0182 una suscripción viva
 * tiene que tener periodo, y ese invariante es diferido, así que dos llamadas
 * separadas lo violan siempre; y una fila puesta a mano probaría el motor contra
 * un estado que el producto nunca produce.
 */
async function suscripcionViva(provider: string, etiqueta: string) {
  const email = `mp0184-${etiqueta}-${sello}@test.trazaloop.dev`;
  const { data: u } = await admin.auth.admin.createUser({
    email, password: "Trazaloop-Test-1234", email_confirm: true });
  const uid = (u.user as { id: string }).id;
  personas.push(uid);
  const cli = createClient(URL!, ANON!, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email, password: "Trazaloop-Test-1234" });
  const { data: orgId } = await cli.rpc("create_organization",
    { p_name: `MP0184 ${etiqueta} ${sello}`, p_tax_id: null, p_country: "CO" });
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", uid);

  const { data: q } = await cli.rpc("billing_create_quote", {
    p_organization_id: org, p_plan_code: "full", p_billing_interval: "monthly" });
  const quoteId = (q as { quote_id: string })?.quote_id;
  assert(Boolean(quoteId), "no se pudo presupuestar (¿falta tasa de cambio vigente?)");

  const { data: i } = await cli.rpc("billing_open_checkout_intent", {
    p_quote_id: quoteId, p_provider: provider, p_environment: "test" });
  const intento = i as unknown as { intent_id: string; expected_total_amount: number };

  const { data: pm } = await admin.rpc("billing_register_payment_method", {
    p_organization_id: org, p_provider: provider,
    p_provider_payment_method_id: `pm-${etiqueta}-${sello}`, p_environment: "test",
    p_created_by: null });
  await admin.rpc("billing_attach_intent_payment_method", {
    p_intent_id: intento.intent_id,
    p_payment_method_id: (pm as Record<string, unknown>).payment_method_id as string });
  const { error: eSet } = await admin.rpc("billing_settle_provider_payment", {
    p_provider: provider, p_external_reference: intento.intent_id,
    p_provider_payment_id: `mp0184-${etiqueta}-${sello}`, p_outcome: "approved",
    p_amount: intento.expected_total_amount, p_currency: "COP",
    p_live_mode: false, p_failure_reason: null });
  assert(!eSet, `liquidar: ${eSet?.message}`);

  const { data: sub, error: eSub } = await admin.from("billing_subscriptions")
    .select("id").eq("organization_id", org).single();
  assert(!eSub && Boolean(sub),
    `no se creó la suscripción para ${etiqueta}: ${eSub?.message ?? "sin fila"}`);
  const subId = (sub as { id: string }).id;

  // Se envejece el ancla para que el periodo esté vencido: en ese estado el
  // motor SÍ la miraría, si el proveedor fuese suyo. Sin esto, no aparecería
  // por no tocarle todavía, y la prueba diría «excluida» por el motivo
  // equivocado.
  const { data: sd } = await admin.from("billing_subscriptions")
    .select("billing_interval").eq("id", subId).single();
  const { data: ps } = await admin.from("billing_subscription_periods")
    .select("id, period_sequence, period_start").eq("subscription_id", subId)
    .order("period_sequence");
  const filas = (ps ?? []) as Array<{ id: string; period_sequence: number; period_start: string }>;
  const ancla = new Date(new Date(filas[0].period_start).getTime()
    - 40 * 86_400_000).toISOString();
  for (const f of filas) {
    const { data: lim } = await admin.rpc("billing_period_bounds", {
      p_anchor: ancla, p_interval: (sd as { billing_interval: string }).billing_interval,
      p_sequence: f.period_sequence });
    const l = lim as { period_start: string; period_end: string };
    await admin.from("billing_subscription_periods")
      .update({ period_start: l.period_start, period_end: l.period_end }).eq("id", f.id);
  }
  const ultimo = filas[filas.length - 1];
  const { data: lim } = await admin.rpc("billing_period_bounds", {
    p_anchor: ancla, p_interval: (sd as { billing_interval: string }).billing_interval,
    p_sequence: ultimo.period_sequence });
  const l = lim as { period_start: string; period_end: string };
  await admin.from("billing_subscriptions").update({
    current_period_start: l.period_start, current_period_end: l.period_end,
    period_anchor_at: ancla }).eq("id", subId);

  return { org, subId, uid, cli };
}

/** Una sesión REAL de administración de plataforma. La vista es para personas. */
let staffCreados = 0;
async function sesionDePlataforma() {
  // Único por llamada: dos pruebas la piden, y repetir el correo hacía que la
  // segunda creación fallara en silencio y reventara diez líneas más abajo.
  staffCreados += 1;
  const email = `mp0184-staff-${sello}-${staffCreados}@test.trazaloop.dev`;
  const { data: u, error: eU } = await admin.auth.admin.createUser({
    email, password: "Trazaloop-Test-1234", email_confirm: true });
  assert(!eU && Boolean(u.user), `no se pudo crear la persona de plataforma: ${eU?.message}`);
  const uid = (u.user as { id: string }).id;
  personas.push(uid);
  await admin.from("platform_staff").insert({
    user_id: uid, role_code: "superadmin", status: "active" });
  const cli = createClient(URL!, ANON!, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email, password: "Trazaloop-Test-1234" });
  return { uid, cli };
}

async function enElMotor(subId: string): Promise<boolean> {
  const { data } = await admin.rpc("billing_due_renewals",
    { p_now: new Date().toISOString(), p_limit: 500 });
  const filas = (data ?? []) as Array<{ subscription_id: string }>;
  return filas.some((f) => f.subscription_id === subId);
}

async function main() {
  console.log("\n0184 · de quién es la recurrencia\n");

  // Una tasa sintética para poder presupuestar. Se RETIRA al final —nunca se
  // borra: 0182 no deja borrar historia financiera, ni siendo de QA— y antes se
  // retira cualquier resto de una ejecución interrumpida, que si no bloquearía
  // esta por solapamiento.
  await admin.from("commercial_fx_rates").update({ status: "retired" })
    .eq("status", "active").like("note", "QA 0184 %");
  const { data: fx, error: efx } = await admin.from("commercial_fx_rates").insert({
    base_currency: "USD", quote_currency: "COP", rate_micros: 4_000_000_000,
    effective_from: new Date(Date.now() - 86_400_000).toISOString(),
    note: `QA 0184 ${sello} · tasa sintetica, NO comercial` }).select("id").single();
  if (efx) { console.log(`  ✘ no se pudo sembrar la tasa: ${efx.message}`); process.exit(1); }
  const fxId = (fx as { id: string }).id;

  // ---- El catálogo ------------------------------------------------------
  await check("1. El catálogo declara los dos proveedores que existen", async () => {
    const { data } = await admin.from("billing_provider_capabilities")
      .select("provider, renewal_owner");
    const filas = (data ?? []) as Array<{ provider: string; renewal_owner: string }>;
    const m = new Map(filas.map((f) => [f.provider, f.renewal_owner]));
    assert(m.get("wompi") === "merchant", "Wompi debe ser merchant");
    assert(m.get("mercadopago") === "provider", "Mercado Pago debe ser provider");
  });

  await check("2. `unknown` para lo que nadie declaró · falla cerrado", async () => {
    const { data } = await admin.rpc("billing_renewal_owner", { p_provider: "stripe" });
    assert(data === "unknown", `devolvió ${data}`);
    const { data: w } = await admin.rpc("billing_renewal_owner", { p_provider: "wompi" });
    assert(w === "merchant", `wompi devolvió ${w}`);
  });

  await check("3. El dominio es cerrado · un valor inventado se rechaza", async () => {
    const { error } = await admin.from("billing_provider_capabilities")
      .insert({ provider: `inventado-${sello}`, renewal_owner: "ninguno" });
    assert(Boolean(error), "aceptó un renewal_owner fuera del dominio");
  });

  await check("4. Una capacidad NO se borra · dos defensas, no una", async () => {
    // Primera: el privilegio. `service_role` ya no tiene DELETE, así que ni
    // llega a la tabla.
    const { error } = await admin.from("billing_provider_capabilities")
      .delete().eq("provider", "wompi");
    assert(Boolean(error), "service_role pudo borrar una capacidad");
    const { count } = await admin.from("billing_provider_capabilities")
      .select("provider", { count: "exact", head: true }).eq("provider", "wompi");
    assert(count === 1, "la fila de Wompi desapareció");
    // Segunda: el trigger, que ya no protege del runtime sino de una migración
    // futura. Se comprueba en el SQL, porque desde aquí no se puede ser dueño.
    const sql = readFileSync(
      "supabase/migrations/0184_billing_provider_renewal_ownership.sql", "utf8");
    assert(sql.includes("BILLING_PROVIDER_CAPABILITY_IS_NOT_DELETABLE"),
      "debe seguir existiendo la defensa contra un borrado desde una migración");
  });

  // ---- El motor ---------------------------------------------------------
  await check("5. WOMPI · merchant · SIGUE entrando en el motor", async () => {
    const e = await suscripcionViva("wompi", "wompi");
    assert(await enElMotor(e.subId),
      "una suscripción de Wompi vencida tiene que seguir apareciendo");
  });

  await check("6. MERCADO PAGO · provider · NO entra en el motor", async () => {
    const e = await suscripcionViva("mercadopago", "mp");
    assert(!(await enElMotor(e.subId)),
      "Mercado Pago no puede entrar: su recurrencia la lleva el proveedor");
  });

  await check("7. Proveedor DESCONOCIDO · falla cerrado", async () => {
    const e = await suscripcionViva(`fantasma-${sello}`, "fantasma");
    assert(!(await enElMotor(e.subId)),
      "un proveedor sin capacidad declarada no puede entrar por omisión");
  });

  await check("8. Y los excluidos se VEN desde plataforma, con su motivo", async () => {
    const staff = await sesionDePlataforma();
    const { data } = await staff.cli.from("v_billing_renewal_excluded")
      .select("provider, renewal_owner, motivo");
    const filas = (data ?? []) as Array<{ provider: string; renewal_owner: string; motivo: string }>;
    assert(filas.some((f) => f.provider === "mercadopago" && f.renewal_owner === "provider"),
      "Mercado Pago debe verse como excluido");
    assert(filas.some((f) => f.renewal_owner === "unknown"
      && f.motivo.includes("SIN CAPACIDAD")),
      "un proveedor sin declarar debe verse, y decir por qué");
  });

  // ---- Nadie más puede tocarlo -----------------------------------------
  await check("9. Un inquilino no puede leer ni alterar el catálogo", async () => {
    const e = await suscripcionViva("wompi", "inquilino");
    const { data: leido } = await e.cli.from("billing_provider_capabilities")
      .select("provider");
    assert((leido ?? []).length === 0, "un inquilino no debe ver el catálogo");
    const { error: eIns } = await e.cli.from("billing_provider_capabilities")
      .insert({ provider: `pirata-${sello}`, renewal_owner: "merchant" });
    assert(Boolean(eIns), "un inquilino pudo insertar una capacidad");
    const { error: eUpd } = await e.cli.from("billing_provider_capabilities")
      .update({ renewal_owner: "merchant" }).eq("provider", "mercadopago");
    const { data: sigue } = await admin.from("billing_provider_capabilities")
      .select("renewal_owner").eq("provider", "mercadopago").single();
    assert(Boolean(eUpd) || (sigue as { renewal_owner: string }).renewal_owner === "provider",
      "un inquilino cambió la propiedad de la recurrencia");
  });

  // ---- Paridad con los adaptadores -------------------------------------
  await check("9 bis. La vista NO deja ver la suscripción de otra empresa", async () => {
    // Dos empresas distintas, y la de la primera intentando mirar por la vista.
    // Aquí se juntan dos defensas y las dos tienen que sostenerse: `security_invoker`
    // hace que la RLS de `billing_subscriptions` siga aplicando, y el filtro de
    // plataforma deja fuera a quien no es de la casa.
    const ajena = await suscripcionViva("mercadopago", "ajena");
    const curiosa = await suscripcionViva("wompi", "curiosa");

    const { data: visto } = await curiosa.cli.from("v_billing_renewal_excluded")
      .select("subscription_id, organization_id");
    const filas = (visto ?? []) as Array<{ subscription_id: string; organization_id: string }>;
    assert(!filas.some((f) => f.organization_id === ajena.org),
      "un inquilino vio una suscripción de OTRA empresa por la vista");
    assert(filas.length === 0,
      `la vista es operacional: un inquilino no debe ver ni lo suyo · vio ${filas.length}`);

    // Y tampoco es una vía de escritura: una vista simple sobre una sola tabla
    // es auto-actualizable si nadie revoca los privilegios por omisión.
    const { error: eDel } = await curiosa.cli.from("v_billing_renewal_excluded")
      .delete().eq("organization_id", ajena.org);
    assert(Boolean(eDel), "la vista aceptó un DELETE de un inquilino");

    // La administración de plataforma sí la ve — y se comprueba con una sesión
    // de verdad, no con la llave de servicio: `is_platform_staff()` habla de
    // personas, y `service_role` no es ninguna.
    const staff = await sesionDePlataforma();
    const { data: vistoStaff } = await staff.cli.from("v_billing_renewal_excluded")
      .select("subscription_id, organization_id");
    assert(((vistoStaff ?? []) as unknown[]).length >= 1,
      "la plataforma tiene que poder ver los excluidos");
  });

  await check("9 ter. Ningún runtime puede reclasificar un proveedor", async () => {
    // La RLS no protege de `service_role`: a ese rol no se le aplica. Lo que lo
    // detiene son los privilegios, y esto lo comprueba ejecutándolo — antes de
    // revocarlos, este UPDATE funcionaba y ponía a Mercado Pago en el motor.
    const { error: eUpd } = await admin.from("billing_provider_capabilities")
      .update({ renewal_owner: "merchant" }).eq("provider", "mercadopago");
    assert(Boolean(eUpd), "service_role pudo reclasificar Mercado Pago");
    const { error: eIns } = await admin.from("billing_provider_capabilities")
      .insert({ provider: `runtime-${sello}`, renewal_owner: "merchant" });
    assert(Boolean(eIns), "service_role pudo declarar un proveedor nuevo");
    const { data: sigue } = await admin.from("billing_provider_capabilities")
      .select("renewal_owner").eq("provider", "mercadopago").single();
    assert((sigue as { renewal_owner: string }).renewal_owner === "provider",
      "Mercado Pago dejó de ser provider");
  });

  await check("10. El catálogo y los adaptadores NO se contradicen", async () => {
    // La autoridad es la base. Esta prueba existe para que el día que un
    // adaptador cambie su declaración y nadie toque el catálogo, salga en rojo
    // en vez de producir dos verdades.
    const fuentes: Array<{ fichero: string; provider: string }> = [
      { fichero: "lib/billing/providers/wompi.ts", provider: "wompi" },
      { fichero: "lib/billing/providers/mercadopago.ts", provider: "mercadopago" },
    ];
    const { data } = await admin.from("billing_provider_capabilities")
      .select("provider, renewal_owner");
    const catalogo = new Map(((data ?? []) as Array<{ provider: string; renewal_owner: string }>)
      .map((f) => [f.provider, f.renewal_owner]));
    for (const f of fuentes) {
      const src = readFileSync(f.fichero, "utf8");
      const m = src.match(/recurrenceOwner:\s*"(merchant|provider)"/);
      assert(Boolean(m), `no se encuentra recurrenceOwner en ${f.fichero}`);
      assert(catalogo.get(f.provider) === m![1],
        `${f.provider}: el adaptador dice ${m![1]} y el catálogo ${catalogo.get(f.provider)}`);
    }
  });

  await check("11. Ninguna suscripción existente cambió de plan ni de derecho", async () => {
    // 0184 solo filtra una selección. No toca suscripciones, ni periodos, ni
    // asignaciones: si tocara algo, esto lo vería.
    const sql = readFileSync(
      "supabase/migrations/0184_billing_provider_renewal_ownership.sql", "utf8");
    for (const prohibido of [
      "update public.billing_subscriptions",
      "delete from public.billing_subscriptions",
      "update public.organization_plan_assignments",
      "delete from public.organization_plan_assignments",
      "update public.billing_subscription_periods",
      "insert into public.billing_payments",
    ]) {
      assert(!sql.toLowerCase().includes(prohibido),
        `la migración no puede contener «${prohibido}»`);
    }
  });

  // ---- Limpieza ---------------------------------------------------------
  // TEST-HYGIENE-01 · Antes había aquí una lista de borrados escrita a mano, en
  // un orden que no podía funcionar y sin mirar el resultado de ninguno. Medido:
  // esta suite dejaba +6 organizaciones, +6 usuarios de Auth y +6 filas en cada
  // tabla de facturación, en cada ejecución. Y es UNA causa con cuatro
  // síntomas: las filas de facturación no se borran → la organización tampoco →
  // el perfil tampoco → `deleteUser` devuelve 500.
  //
  // Esa basura acabó rompiendo `PE-05B6D · A3` tres tramos después, porque su
  // pasada de renovación contaba los vencimientos que esta suite dejaba
  // envejecidos a propósito. Ahora se limpia por el GRAFO de claves ajenas y
  // —lo que importa— se COMPRUEBA: si sobrevive algo, esta suite se pone roja
  // por su propia basura en vez de dejársela al siguiente.
  const pg = new PgClient({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  const residuo = await limpiarFixtures(pg, admin, { orgs, personas, fxIds: [fxId] });
  await pg.end();

  await check("12. La suite no deja un solo fixture detrás", async () => {
    assert(residuo.organizaciones === 0 && residuo.personas === 0
      && residuo.fxActivas === 0 && Object.keys(residuo.porTabla).length === 0
      && residuo.problemas.length === 0,
      `quedaron: ${describirResiduo(residuo)}`);
  });

  console.log(`\n0184 · ownership: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
