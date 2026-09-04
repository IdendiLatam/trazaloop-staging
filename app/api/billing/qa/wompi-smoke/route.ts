import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPlatformStatus } from "@/lib/db/platform";
import { wompiFromEnv } from "@/lib/billing/providers/wompi";
import { buildAttemptReference, envelopeIsClean } from "@/lib/billing/wompi/mapping";
import { createHash, timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Trazaloop · PE-05B2W · Disparador TEMPORAL de la prueba de Wompi.
 *
 * Se retira antes de cerrar PE-05B2W. Mismos cuatro candados que el de la otra
 * pasarela: nunca en Producción, solo superadministrador o el secreto de
 * automatización del proyecto, solo entorno de PRUEBAS, y ningún importe llega
 * del navegador.
 *
 * SOBRE LA TOKENIZACIÓN, QUE ES LO DELICADO
 *
 * En el producto, el número de tarjeta va del NAVEGADOR a Wompi con la llave
 * pública, y el servidor de Trazaloop no lo ve nunca. Aquí no hay navegador,
 * así que esta prueba automatizada tokeniza desde el servidor con la tarjeta
 * de prueba PÚBLICA de la documentación de Wompi.
 *
 * Eso es una desviación consciente y acotada:
 *   · vive SOLO en este fichero, que es provisional y se retira;
 *   · el número llega en la petición y no se guarda, ni se registra, ni se
 *     devuelve;
 *   · una prueba comprueba que NINGÚN fichero de producto —`lib`, `server`,
 *     `components`— toca campos de tarjeta.
 *
 * El camino de producto sigue siendo navegador → Wompi. Este no lo sustituye.
 */

const ACCIONES = ["preflight", "contracts", "prepare",
                  "create_payment_source", "charge", "get_transaction",
                  "simulate_event", "renew", "state", "link_payment_source",
                  "seed_qa_fx", "fx_state", "recent_checkouts", "privacy_scan"] as const;
type Accion = (typeof ACCIONES)[number];

const no = (motivo: string, code = 403) =>
  NextResponse.json({ ok: false, error: motivo }, { status: code });

function automationSecretMatches(presentado: string | null, esperado: string | undefined) {
  if (!presentado || !esperado) return false;
  const a = Buffer.from(presentado); const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Registra el instrumento reutilizable de esta empresa y ata el intento a él.
 * Los dos pasos devuelven su estado; ninguno se traga un error.
 */
async function registrarYAtar(orgId: string, intentId: string, fuente: number): Promise<
  { ok: true; metodo: string; atado: unknown } | { ok: false; error: string }> {
  const admin0 = createAdminClient();
  const { data: reg, error: er } = await admin0.rpc("billing_register_payment_method", {
    p_organization_id: orgId, p_provider: "wompi",
    p_provider_payment_method_id: String(fuente), p_environment: "test",
    p_created_by: null });
  if (er) return { ok: false, error: `REGISTER_FAILED:${er.message}` };
  const r = reg as Record<string, unknown>;
  if (!r.payment_method_id) return { ok: false, error: `REGISTER_REFUSED:${r.status}` };

  const { data: at, error: ea } = await admin0.rpc("billing_attach_intent_payment_method", {
    p_intent_id: intentId, p_payment_method_id: String(r.payment_method_id) });
  if (ea) return { ok: false, error: `ATTACH_FAILED:${ea.message}` };
  const a = at as Record<string, unknown>;
  if (a.status !== "attached") return { ok: false, error: `ATTACH_REFUSED:${a.status}` };
  return { ok: true, metodo: String(r.payment_method_id), atado: a };
}

export async function POST(request: Request) {
  const entornoVercel = process.env.VERCEL_ENV ?? "local";
  if (entornoVercel === "production") return no("QA_TRIGGER_FORBIDDEN_IN_PRODUCTION");

  const { isStaff, isSuperadmin } = await checkPlatformStatus();
  const porAutomatizacion = automationSecretMatches(
    request.headers.get("x-vercel-protection-bypass"),
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  if (!porAutomatizacion && (!isStaff || !isSuperadmin)) {
    return no("NOT_PLATFORM_SUPERADMIN");
  }

  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = (await request.json()) as Record<string, unknown>; } catch { cuerpo = {}; }
  const accion = String(cuerpo.action ?? "") as Accion;
  if (!(ACCIONES as readonly string[]).includes(accion)) {
    return no(`ACTION_UNKNOWN:${accion}`, 400);
  }

  const proveedor = wompiFromEnv();

  if (accion === "preflight") {
    return NextResponse.json({
      ok: true,
      vercel_environment: entornoVercel,
      // Solo el veredicto y qué falta. Nunca una llave ni un trozo de llave.
      wompi_environment: proveedor.environment,
      configuration_problems: proveedor.configurationProblems,
      capabilities: proveedor.capabilities,
      identity: porAutomatizacion ? "automation" : "superadmin",
    });
  }

  // Candado 3 · SOLO sandbox. Falla cerrado ante mezcla o ante producción.
  if (proveedor.environment === null) {
    return no(`WOMPI_NOT_CONFIGURED:${proveedor.configurationProblems.join(",")}`, 424);
  }
  if (proveedor.environment !== "sandbox") {
    return no("WOMPI_CREDENTIALS_ARE_NOT_SANDBOX", 424);
  }

  const admin = createAdminClient();

  if (accion === "contracts") {
    const r = await proveedor.getAcceptanceContracts();
    if (!r.ok) return NextResponse.json({ ok: false, failure: r.failure,
      message: r.message, detail: (r as { detail?: string | null }).detail ?? null });
    // Los enlaces sí: son los contratos que una persona debe poder leer. Los
    // tokens no salen de aquí.
    return NextResponse.json({ ok: true,
      acceptance_permalink: r.value.acceptancePermalink,
      personal_auth_permalink: r.value.personalAuthPermalink,
      acceptance_token_present: Boolean(r.value.acceptanceToken),
      personal_auth_token_present: Boolean(r.value.personalAuthToken) });
  }

  // -------------------------------------------------------------------------
  // prepare · empresa de QA, tasa sintética y presupuesto de B1
  // -------------------------------------------------------------------------
  if (accion === "prepare") {
    const plan = cuerpo.plan === "extra" ? "extra" : "full";
    const intervalo = cuerpo.interval === "annual" ? "annual" : "monthly";

    const { data: tasas } = await admin.from("commercial_fx_rates")
      .select("id, note, status, effective_to")
      .eq("base_currency", "USD").eq("quote_currency", "COP");
    const vigente = ((tasas ?? []) as Record<string, unknown>[])
      .some((t) => String(t.note ?? "").includes("QA-SYNTHETIC-NOT-FOR-PRODUCTION")
        && t.status === "active" && !t.effective_to);
    if (!vigente) {
      const { error } = await admin.from("commercial_fx_rates").insert({
        base_currency: "USD", quote_currency: "COP", rate_micros: 4_000_000_000,
        effective_from: new Date(Date.now() - 3_600_000).toISOString(),
        note: "QA-SYNTHETIC-NOT-FOR-PRODUCTION · PE-05B2W · 4000 COP/USD no es una "
            + "tasa real ni actual: existe solo para poder presupuestar en el sandbox.",
      });
      if (error) return no(`FX_SEED_FAILED:${error.message}`, 500);
    }

    // Se busca por el prefijo de QA del tramo, no por el nombre de un
    // proveedor: la empresa sintética es de facturación, no de una pasarela, y
    // nombrar aquí a la otra las mezcla sin motivo.
    // LA EMPRESA DE QA, POR EL CAMINO DEL PRODUCTO.
    //
    // La versión anterior insertaba la fila de `organizations` a mano, y por eso
    // `organization_modules` quedaba vacío: quien provisiona los módulos es
    // `create_organization`, que llama a `provision_new_organization_modules`.
    // Sin módulos habilitados, la liquidación no tenía a qué conceder el plan y
    // la mitad del efecto no se podía ver.
    //
    // Ahora se crea como la crearía una persona: con su sesión, por la función
    // canónica. No se toca `organization_modules` a mano, y desde luego no se
    // habilita nada como efecto de haber pagado.
    let fila: { id: string; created_by: string | null } | undefined;
    const anon0 = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!anon0) return no("ANON_KEY_UNAVAILABLE", 500);

    if (cuerpo.fresh === true) {
      const correoQA = `qa-w-${Date.now()}@test.trazaloop.dev`;
      const clavePersona = `QA-${crypto.randomUUID()}`;
      const { data: nueva, error: eu } = await admin.auth.admin.createUser({
        email: correoQA, password: clavePersona, email_confirm: true,
        user_metadata: { full_name: "QA PE-05B2W" } });
      if (eu || !nueva.user) return no(`QA_USER_FAILED:${eu?.message}`, 500);

      const comoPersona = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string, anon0,
        { auth: { autoRefreshToken: false, persistSession: false } });
      const { error: eIn } = await comoPersona.auth.signInWithPassword(
        { email: correoQA, password: clavePersona });
      if (eIn) return no(`QA_SIGNIN_FAILED:${eIn.message}`, 500);
      await comoPersona.rpc("accept_active_legal_documents",
        { p_ip_address: null, p_user_agent: "pe05b2w" });

      const { data: orgId, error: eo } = await comoPersona.rpc("create_organization",
        { p_name: `QA-PE05B2W-${Date.now()}`, p_tax_id: null, p_country: "CO" });
      if (eo || !orgId) return no(`QA_ORG_FAILED:${eo?.message}`, 500);
      fila = { id: String(orgId), created_by: nueva.user.id };
    } else {
      const { data: existentes } = await admin.from("organizations")
        .select("id, created_by").ilike("name", "QA-PE05B2W%")
        .order("created_at", { ascending: false });
      fila = (existentes ?? [])[0] as { id: string; created_by: string | null } | undefined;
    }
    if (!fila?.id || !fila.created_by) {
      return no("QA_ORGANIZATION_MISSING", 424);
    }

    // Se reutiliza la empresa de QA que ya existe: no hace falta otra, y una
    // segunda sería contaminación sin uso.
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!anon) return no("ANON_KEY_UNAVAILABLE", 500);
    const clave = `QA-${crypto.randomUUID()}`;
    const { error: ePass } = await admin.auth.admin.updateUserById(fila.created_by,
      { password: clave });
    if (ePass) return no(`QA_USER_PASSWORD_FAILED:${ePass.message}`, 500);
    const { data: persona } = await admin.auth.admin.getUserById(fila.created_by);
    const correo = persona?.user?.email;
    if (!correo) return no("QA_USER_EMAIL_MISSING", 500);

    const comoAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, anon,
      { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: eLogin } = await comoAdmin.auth.signInWithPassword(
      { email: correo, password: clave });
    if (eLogin) return no(`QA_SIGNIN_FAILED:${eLogin.message}`, 500);

    const { data: q, error: eq } = await comoAdmin.rpc("billing_create_quote", {
      p_organization_id: fila.id, p_plan_code: plan, p_billing_interval: intervalo });
    if (eq) return no(`QUOTE_FAILED:${eq.message}`, 500);
    const quote = q as Record<string, unknown>;
    const { data: i, error: ei } = await comoAdmin.rpc("billing_open_checkout_intent", {
      p_quote_id: quote.quote_id, p_provider: "wompi", p_environment: "test" });
    if (ei) return no(`INTENT_FAILED:${ei.message}`, 500);

    // ANTES de cobrar: qué módulos hay habilitados de verdad. Si no hay
    // ninguno funcional, el cobro liquidaría sin conceder nada y la prueba
    // estaría mintiendo por omisión.
    const { data: mods } = await admin.from("organization_modules")
      .select("module_code, enabled, access_mode").eq("organization_id", fila.id);
    const { data: cat } = await admin.from("modules").select("code, is_functional");
    const funcionales = new Set(((cat ?? []) as Record<string, unknown>[])
      .filter((m) => m.is_functional === true).map((m) => String(m.code)));
    const habilitados = ((mods ?? []) as Record<string, unknown>[])
      .filter((m) => m.enabled === true)
      .map((m) => ({ module: String(m.module_code),
                     functional: funcionales.has(String(m.module_code)),
                     access_mode: m.access_mode }));

    return NextResponse.json({ ok: true, organization_id: fila.id, quote, intent: i,
      enabled_modules: habilitados,
      enabled_functional_count: habilitados.filter((m) => m.functional).length });
  }

  // -------------------------------------------------------------------------
  // La tokenización desde el SERVIDOR ya no existe
  // -------------------------------------------------------------------------
  //
  // B2W1 la necesitó porque no había navegador. B2W4 sí lo tiene: la tarjeta
  // viaja del navegador a Wompi y Trazaloop no la ve. Dejar aquí un camino que
  // acepte un número de tarjeta —aunque fuera solo la pública de prueba—
  // significaría que existe una puerta por la que un PAN puede entrar al
  // servidor. Se retira, y una prueba se pone roja si vuelve.

  if (accion === "create_payment_source") {
    const contratos = await proveedor.getAcceptanceContracts();
    if (!contratos.ok) return NextResponse.json({ ok: false, stage: "contracts",
      failure: contratos.failure, message: contratos.message });
    const r = await proveedor.createPaymentSource({
      cardToken: String(cuerpo.card_token ?? ""),
      customerEmail: String(cuerpo.customer_email ?? "qa-wompi@test.trazaloop.dev"),
      acceptanceToken: contratos.value.acceptanceToken,
      personalAuthToken: contratos.value.personalAuthToken,
    });
    return NextResponse.json(r.ok ? { ok: true, payment_source: r.value }
      : { ok: false, failure: r.failure, message: r.message,
          detail: (r as { detail?: string | null }).detail ?? null });
  }

  // -------------------------------------------------------------------------
  // charge · el importe sale del INTENTO, nunca del navegador
  // -------------------------------------------------------------------------
  if (accion === "charge") {
    const intentId = String(cuerpo.intent_id ?? "");
    const fuente = Number(cuerpo.payment_source_id ?? 0);
    if (!intentId || !fuente) return no("IDS_REQUIRED", 400);
    const { data: intento } = await admin.from("billing_checkout_intents")
      .select("id, organization_id, expected_total_amount, expected_currency, environment")
      .eq("id", intentId).single();
    if (!intento) return no("INTENT_NOT_FOUND", 404);
    const i = intento as Record<string, unknown>;
    if (i.environment !== "test") return no("INTENT_IS_NOT_TEST", 424);

    // La referencia identifica el INTENTO y nada más. Lo que ese intento
    // significa lo dice la base.
    const referencia = buildAttemptReference(intentId);

    // El medio de pago se registra como lo que es —un instrumento reutilizable
    // de esta empresa— y el intento se ata a él. Ya no ocupa la columna de la
    // suscripción del proveedor, que es otra cosa y de otra pasarela.
    const met = await registrarYAtar(String(i.organization_id), intentId, fuente);
    if (!met.ok) return no(met.error, 500);
    const r = await proveedor.chargePaymentSource({
      paymentSourceId: fuente,
      amountCopMinor: Number(i.expected_total_amount),
      currency: String(i.expected_currency),
      reference: referencia,
      customerEmail: String(cuerpo.customer_email ?? "qa-wompi@test.trazaloop.dev"),
      recurrent: cuerpo.recurrent !== false,
    });
    return NextResponse.json(r.ok
      ? { ok: true, reference: referencia, expected_cop: Number(i.expected_total_amount),
          transaction: r.value }
      : { ok: false, reference: referencia, failure: r.failure, message: r.message,
          detail: (r as { detail?: string | null }).detail ?? null });
  }

  // -------------------------------------------------------------------------
  // simulate_event · para comprobar EL GUARDIA, no para inventar cobros
  // -------------------------------------------------------------------------
  //
  // El secreto de eventos vive en el servidor y no sale de aquí, así que un
  // evento con firma VÁLIDA solo se puede construir en el servidor. Sin esto no
  // habría forma de comprobar el caso que más importa: firma buena y entorno
  // equivocado.
  //
  // Y no puede cobrar nada, por construcción: la ruta RELEE la transacción en
  // la API de Wompi antes de liquidar, así que un identificador inventado se
  // queda en «pendiente de recurso» y no toca el dinero. El guardia se
  // comprueba; la caja no se abre.
  if (accion === "simulate_event") {
    const secreto = process.env.WOMPI_EVENTS_SECRET;
    if (!secreto) return no("WOMPI_EVENTS_SECRET_MISSING", 424);
    // Se puede repetir un evento de una transacción REAL, que es la única
    // forma de comprobar de punta a punta que una reentrega no cobra dos veces.
    const idTransaccion = typeof cuerpo.transaction_id === "string"
      && cuerpo.transaction_id !== ""
      ? cuerpo.transaction_id
      : `qa-simulado-${Date.now()}`;
    const sello = Math.floor(Date.now() / 1000);
    const propiedades = ["transaction.id", "transaction.status",
                         "transaction.amount_in_cents"];
    const datos = { transaction: { id: idTransaccion, status: "APPROVED",
                                   amount_in_cents: 19_040_000, currency: "COP",
                                   reference: "qa-simulada" } };
    const cadena = `${idTransaccion}APPROVED19040000${sello}${secreto}`;
    const checksum = cuerpo.break_signature === true
      ? "0".repeat(64)
      : createHash("sha256").update(cadena).digest("hex");

    const evento: Record<string, unknown> = {
      event: "transaction.updated", data: datos,
      timestamp: sello, sent_at: new Date().toISOString(),
      signature: { properties: propiedades, checksum },
    };
    // `environment` se pone tal y como lo pida la prueba: presente, ausente o
    // con otro valor. Es justo lo que hay que poder variar.
    if (cuerpo.environment !== "__omit__") {
      evento.environment = cuerpo.environment ?? "test";
    }

    const url = new URL(request.url);
    const destino = `${url.origin}/api/billing/webhooks/wompi`;
    const r = await fetch(destino, {
      method: "POST",
      headers: { "Content-Type": "application/json",
                 // El mismo bypass con el que llegó esta petición: el evento
                 // simulado entra por la misma puerta que entrará el real.
                 ...(request.headers.get("x-vercel-protection-bypass")
                   ? { "x-vercel-protection-bypass":
                       request.headers.get("x-vercel-protection-bypass") as string }
                   : {}) },
      body: JSON.stringify(evento),
    });
    let respuesta: unknown = null;
    try { respuesta = await r.json(); } catch { respuesta = null; }
    return NextResponse.json({ ok: true, sent: {
      environment: evento.environment ?? null,
      signature_broken: cuerpo.break_signature === true,
      transaction_id: idTransaccion },
      webhook_status: r.status, webhook_body: respuesta });
  }

  // -------------------------------------------------------------------------
  // renew · «llegó la fecha de renovación», a mano y sin planificador
  // -------------------------------------------------------------------------
  //
  // No finge que pasó el tiempo: construye UN intento de cobro canónico propio,
  // colgado de la SUSCRIPCIÓN viva —no del intento que la creó—, con su número
  // de periodo y su referencia única. Es lo que hará el calendario cuando
  // exista, y por eso se prueba antes de escribirlo.
  if (accion === "renew") {
    const subId = String(cuerpo.subscription_id ?? "");
    if (!subId) return no("SUBSCRIPTION_ID_REQUIRED", 400);

    // 1 · LA OBLIGACIÓN. Se abre ANTES de cobrar, y su calendario sale del
    //     ancla de la suscripción, no del reloj. Si ya había una abierta, es
    //     esa: no se reclaman dos meses teniendo uno pendiente.
    const { data: per, error: ep } = await admin.rpc("billing_open_next_period",
      { p_subscription_id: subId });
    if (ep) return no(`PERIOD_FAILED:${ep.message}`, 500);
    const periodo = per as Record<string, unknown>;
    if (periodo.status !== "open") {
      return NextResponse.json({ ok: false, stage: "period", period: periodo });
    }

    // 2 · EL INTENTO DE COBRO, colgado de esa obligación. Un periodo puede
    //     necesitar varios —rechazo, tiempo agotado, aprobado— y todos apuntan
    //     al mismo sitio.
    const { data: sub } = await admin.from("billing_subscriptions")
      .select("organization_id, plan_code, billing_interval, charge_currency")
      .eq("id", subId).single();
    if (!sub) return no("SUBSCRIPTION_NOT_FOUND", 404);
    const sf = sub as Record<string, unknown>;

    const { data: base } = await admin.from("billing_checkout_intents")
      .select("quote_id").eq("billing_subscription_id", subId).limit(1).single();
    if (!base) return no("ORIGIN_INTENT_NOT_FOUND", 424);

    // El total con la regla fiscal VIGENTE, resuelta por B1.
    const { data: regla } = await admin.rpc("billing_resolve_tax_rule", {
      p_service_class: "self_service_saas", p_at: new Date().toISOString(),
      p_jurisdiction: "CO" });
    const rr = regla as Record<string, unknown> | null;
    if (!rr || rr.status !== "found") return no("TAX_RULE_UNAVAILABLE", 424);
    const { data: imp } = await admin.rpc("billing_tax_amount", {
      p_base: Number(periodo.base_amount),
      p_rate_basis_points: Number(rr.rate_basis_points) });
    const total = Number(periodo.base_amount) + Number(imp);

    const { data: intento, error: ei } = await admin.from("billing_checkout_intents")
      .insert({
        organization_id: sf.organization_id, quote_id: (base as { quote_id: string }).quote_id,
        provider: "wompi", environment: "test",
        expected_total_amount: total, expected_currency: String(periodo.charge_currency),
        billing_interval: String(sf.billing_interval), plan_code: String(sf.plan_code),
        period_id: periodo.period_id, billing_subscription_id: subId,
        status: "created",
      }).select("id").single();
    if (ei || !intento) return no(`ATTEMPT_FAILED:${ei?.message}`, 500);
    const intentoId = (intento as { id: string }).id;

    // 3 · El instrumento con el que se cobra a esta suscripción. Es el MISMO
    //     de la contratación: eso es exactamente lo que el modelo anterior
    //     hacía imposible.
    const { data: origen } = await admin.from("billing_checkout_intents")
      .select("payment_method_id").eq("billing_subscription_id", subId)
      .not("payment_method_id", "is", null)
      .order("created_at", { ascending: false }).limit(1).single();
    const metodoId = (origen as { payment_method_id: string } | null)?.payment_method_id;
    if (!metodoId) return no("PAYMENT_METHOD_UNKNOWN", 424);
    const { data: pm } = await admin.from("billing_payment_methods")
      .select("provider_payment_method_id").eq("id", metodoId).single();
    const fuente = Number((pm as { provider_payment_method_id: string }).provider_payment_method_id);
    const { data: at, error: eat } = await admin.rpc("billing_attach_intent_payment_method", {
      p_intent_id: intentoId, p_payment_method_id: metodoId });
    if (eat) return no(`ATTACH_FAILED:${eat.message}`, 500);
    if ((at as Record<string, unknown>).status !== "attached") {
      return NextResponse.json({ ok: false, stage: "attach", attach: at });
    }

    if (cuerpo.charge === false) {
      return NextResponse.json({ ok: true, period: periodo, attempt_id: intentoId,
        total, charged: false });
    }

    const referencia = buildAttemptReference(intentoId);
    const r = await proveedor.chargePaymentSource({
      paymentSourceId: fuente, amountCopMinor: total,
      currency: String(periodo.charge_currency), reference: referencia,
      customerEmail: String(cuerpo.customer_email ?? "qa-wompi@test.trazaloop.dev"),
      recurrent: true,
    });
    return NextResponse.json(r.ok
      ? { ok: true, period: periodo, attempt_id: intentoId, reference: referencia,
          base: Number(periodo.base_amount), tax: Number(imp), total,
          transaction: r.value }
      : { ok: false, period: periodo, attempt_id: intentoId, reference: referencia,
          failure: r.failure, message: r.message,
          detail: (r as { detail?: string | null }).detail ?? null });
  }

  if (accion === "link_payment_source") {
    // Registra el instrumento reutilizable y lo ata al intento, por el camino
    // canónico. Devuelve el error tal cual, sin tragárselo. No mueve dinero.
    const intentId = String(cuerpo.intent_id ?? "");
    const { data: i } = await admin.from("billing_checkout_intents")
      .select("organization_id").eq("id", intentId).single();
    if (!i) return no("INTENT_NOT_FOUND", 404);
    const r = await registrarYAtar(String((i as { organization_id: string }).organization_id),
      intentId, Number(cuerpo.payment_source_id ?? 0));
    return NextResponse.json(r.ok
      ? { ok: true, payment_method_id: r.metodo, attach: r.atado }
      : { ok: false, error: r.error });
  }

  if (accion === "seed_qa_fx") {
    // Abre la tasa sintética que la prueba humana necesita para poder
    // presupuestar. No la pone el producto: el producto FALLA CERRADO sin
    // tasa, que es lo correcto. Esto es el mecanismo explícito de QA, y se
    // cierra por validez —nunca se borra— al terminar.
    const { data: tasas } = await admin.from("commercial_fx_rates")
      .select("id, note, status, effective_to")
      .eq("base_currency", "USD").eq("quote_currency", "COP");
    const vigente = ((tasas ?? []) as Record<string, unknown>[]).find((t) =>
      String(t.note ?? "").includes("QA-SYNTHETIC-NOT-FOR-PRODUCTION")
      && t.status === "active" && !t.effective_to);
    if (vigente) {
      return NextResponse.json({ ok: true, status: "already_active",
        fx_rate_id: vigente.id });
    }
    const { data: nueva, error } = await admin.from("commercial_fx_rates").insert({
      base_currency: "USD", quote_currency: "COP", rate_micros: 4_000_000_000,
      effective_from: new Date(Date.now() - 3_600_000).toISOString(),
      note: "QA-SYNTHETIC-NOT-FOR-PRODUCTION · PE-05B2W4 · 4000 COP/USD no es una "
          + "tasa real ni actual: existe solo para la prueba humana del sandbox.",
    }).select("id").single();
    if (error) return no(`FX_SEED_FAILED:${error.message}`, 500);
    return NextResponse.json({ ok: true, status: "seeded",
      fx_rate_id: (nueva as { id: string }).id });
  }

  if (accion === "recent_checkouts") {
    // Solo LEE. Sirve para localizar la contratación que hizo una persona
    // desde el navegador cuando no se sabe con qué empresa entró.
    const { data, error } = await admin.from("billing_checkout_intents")
      .select("id, organization_id, provider, environment, status, plan_code,"
        + " billing_interval, expected_total_amount, payment_method_id,"
        + " provider_subscription_id, period_id, billing_subscription_id, created_at")
      .order("created_at", { ascending: false }).limit(12);
    if (error) return no(`READ_FAILED:${error.message}`, 500);
    return NextResponse.json({ ok: true, intents: data ?? [] });
  }

  if (accion === "privacy_scan") {
    // ¿Quedó algo de la tarjeta guardado en algún sitio? Devuelve RECUENTOS,
    // nunca valores: una prueba de privacidad que imprima lo que busca sería
    // ella misma la fuga.
    const testigo = "%tok_%";
    const dieciseis = "%[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]%";
    const buscar = async (tabla: string, columna: string, patron: string) => {
      const { count, error } = await admin.from(tabla)
        .select("id", { count: "exact", head: true }).like(columna, patron);
      return { table: tabla, column: columna, matches: error ? null : (count ?? 0) };
    };
    const hallazgos = [
      await buscar("billing_payment_methods", "provider_payment_method_id", testigo),
      await buscar("billing_payment_methods", "provider_payment_method_id", dieciseis),
      await buscar("billing_checkout_intents", "provider_subscription_id", testigo),
      await buscar("billing_checkout_intents", "init_point", testigo),
      await buscar("billing_checkout_intents", "failure_reason", testigo),
      await buscar("billing_payments", "provider_payment_id", testigo),
      await buscar("billing_payments", "failure_reason", testigo),
    ];
    // Los sobres de los eventos se revisan enteros, con el mismo comprobador
    // que usa la ruta: si alguno no está limpio, aquí sale.
    const { data: sobres } = await admin.from("billing_provider_events")
      .select("id, payload").not("payload", "is", null).limit(200);
    const sucios = ((sobres ?? []) as { id: string; payload: unknown }[])
      .filter((e) => !envelopeIsClean((e.payload ?? {}) as Record<string, unknown>))
      .length;
    return NextResponse.json({ ok: true, findings: hallazgos,
      event_payloads_checked: (sobres ?? []).length, unclean_payloads: sucios });
  }

  if (accion === "fx_state") {
    // Solo LEE. Sirve para demostrar que abrir una vigencia nueva no tocó
    // ninguna de las anteriores.
    const { data, error } = await admin.from("commercial_fx_rates")
      .select("id, base_currency, quote_currency, rate_micros, status,"
        + " effective_from, effective_to, note")
      .order("effective_from");
    if (error) return no(`READ_FAILED:${error.message}`, 500);
    const { data: resuelta } = await admin.rpc("billing_resolve_fx", {
      p_base: "USD", p_quote: "COP", p_at: new Date().toISOString() });
    return NextResponse.json({ ok: true, rates: data ?? [], resolved: resuelta });
  }

  if (accion === "state") {
    // Solo LEE. Es la vista del libro que necesita la prueba para demostrar
    // que el derecho avanzó una vez y una sola: qué obligaciones existen, qué
    // cobro saldó cada una, y hasta dónde llega la suscripción.
    const orgId = String(cuerpo.organization_id ?? "");
    if (!orgId) return no("ORGANIZATION_ID_REQUIRED", 400);

    const { data: subs } = await admin.from("billing_subscriptions")
      .select("id, status, plan_code, billing_interval, current_period_start,"
        + " current_period_end, renews_at, grace_until, provider,"
        + " base_charge_amount, charge_currency, fx_rate_micros, created_at")
      .eq("organization_id", orgId).order("created_at");
    const { data: periodos } = await admin.from("billing_subscription_periods")
      .select("id, subscription_id, period_sequence, period_start, period_end, base_amount, status, settled_payment_id, settled_at")
      .eq("organization_id", orgId).order("period_sequence");
    const { data: metodos, error: emet } = await admin.from("billing_payment_methods")
      .select("id, provider, provider_payment_method_id, environment, status")
      .eq("organization_id", orgId).order("created_at");
    if (emet) return no(`READ_FAILED:${emet.message}`, 500);

    const { data: intentos, error: eint } = await admin.from("billing_checkout_intents")
      .select("id, status, provider, provider_subscription_id, payment_method_id, billing_subscription_id, period_id, expected_total_amount, created_at")
      .eq("organization_id", orgId).order("created_at");
    if (eint) return no(`READ_FAILED:${eint.message}`, 500);

    const { data: pagos } = await admin.from("billing_payments")
      .select("id, provider, provider_payment_id, status, total_amount, period_id, created_at")
      .eq("organization_id", orgId).order("created_at");
    const { data: modulos } = await admin.from("organization_modules")
      .select("module_code, enabled, access_mode")
      .eq("organization_id", orgId).order("module_code");

    const { data: eventos } = await admin.from("billing_provider_events")
      .select("provider, topic, resource_id, processing_status, outcome, attempt_count")
      .eq("organization_id", orgId).order("first_received_at");
    // Aquí NO se mira el derecho comercial. El resolutor canónico exige sesión
    // —es su gracia— y esta vista corre con la llave de servicio. Que el plan
    // no se conceda dos veces se demuestra en las pruebas deterministas, que sí
    // tienen sesión, no en un diagnóstico.
    return NextResponse.json({ ok: true, subscriptions: subs ?? [],
      periods: periodos ?? [], payment_methods: metodos ?? [], intents: intentos ?? [],
      payments: pagos ?? [], events: eventos ?? [], modules: modulos ?? [] });
  }

  if (accion === "get_transaction") {
    const r = await proveedor.getTransaction(String(cuerpo.transaction_id ?? ""));
    return NextResponse.json(r.ok ? { ok: true, transaction: r.value }
      : { ok: false, failure: r.failure, message: r.message,
          detail: (r as { detail?: string | null }).detail ?? null });
  }

  return no("ACTION_UNHANDLED", 400);
}
