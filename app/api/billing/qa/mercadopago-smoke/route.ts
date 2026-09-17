import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  resolveConfiguredTestBuyer, isTestBuyerEmail, maskBuyerEmail, TEST_BUYER_PATTERN,
  TEST_PAYER_CUSTOMER_PATTERN,
} from "@/lib/billing/qa/test-payer";
import { applicationMatches } from "@/lib/billing/mercadopago/identity";
import {
  decideQaFxFixture, QA_FX_BASE, QA_FX_QUOTE, QA_FX_MICROS, QA_FX_LEGACY_MARKER,
  type QaFxRow,
} from "@/lib/billing/qa/fx-fixture";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPlatformStatus } from "@/lib/db/platform";
import { mercadoPagoFromEnv } from "@/lib/billing/providers/mercadopago";
import { recurrenceFor } from "@/lib/billing/mercadopago/mapping";
import { veredictoDeCambio } from "@/lib/billing/mercadopago/qa-amount-verdict";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Trazaloop · PE-05B2 · Disparador TEMPORAL de la prueba de sandbox.
 *
 * POR QUÉ EXISTE
 *
 * El token de Mercado Pago vive en el entorno de Preview de Vercel, no en
 * ninguna consola local, y así debe seguir: bajárselo para poder probar cómodo
 * sería sacar una credencial de donde está protegida. Así que la prueba se
 * ejecuta DONDE ESTÁ EL TOKEN, del lado del servidor.
 *
 * ES PROVISIONAL. Se retira antes de cerrar PE-05B2. No es una pantalla, no es
 * una función de producto y no la ve ningún cliente. Una prueba comprueba que
 * está declarado como temporal y que no la alcanza ninguna pantalla.
 *
 * LOS CUATRO CANDADOS, EN ORDEN
 *
 *   1. Nunca en Producción. Se comprueba el entorno de Vercel y se rechaza.
 *   2. Solo superadministrador de plataforma, con su sesión real.
 *   3. Solo con credenciales de PRUEBA. Un token de producción la deja muerta
 *      antes de tocar la red.
 *   4. Ningún importe llega del navegador. Nunca. Las acciones son un catálogo
 *      cerrado de nombres, y el dinero sale siempre de B1.
 *
 * Y no devuelve el token, ni parte de él, ni su longitud.
 */

/**
 * Marcador de versión del disparador. Se sube A MANO cuando se añade o cambia
 * una acción, y sirve para lo único que no se podía comprobar y hacía falta:
 * saber si el despliegue que se está llamando es el que se acaba de desplegar.
 *
 * Nació de un `ACTION_UNKNOWN:cancel_min` contra un despliegue anterior. La
 * lista de acciones responde sola —se deriva del catálogo, no se escribe—, así
 * que no puede quedarse desfasada respecto de lo que la ruta admite.
 */
/** El DISEÑO que implementa esta ruta. No cambia mientras el diseño no cambie. */
const QA_DISENO = "MPPLAN01R-2026-09-09-plan-initpoint-discovery-cancel";

/**
 * La revisión concreta que responde. Se sube A MANO en cada despliegue, y por
 * eso es distinta del diseño: dos despliegues del MISMO diseño tienen que poder
 * distinguirse, que es justo lo que falló cuando una llamada fue a un
 * despliegue anterior y devolvió `ACTION_UNKNOWN`.
 */
const QA_MARCADOR = "MPREC01C2-2026-09-17-post-cancel-copy";

// QA_TRIGGER_IS_TEMPORARY · se retira en el cierre de PE-05B2.
// Ver PE_05B2_SANDBOX_TESTS.md. Un fichero de ruta de Next.js solo puede
// exportar sus manejadores y su configuración, así que la marca vive aquí.

const ACCIONES = ["preflight", "prepare", "create_monthly", "create_annual",
                  "get", "search", "site", "create_test_user", "read_test_user", "ensure_test_payer",
                  "retire_qa_fx", "customer_forensics", "update_amount", "cancel",
                  "probe_payer_email", "probe_annual", "probe_daily", "probe_state",
                  "probe_amount_change", "cancel_min", "cancel_raw", "authprobe",
                  // MP-REC-01B.6 · TEMPORAL · cerrar un intento de recurrencia
                  // rechazado por el proveedor. Se retira con el disparador.
                  "close_recurring_attempt", "recurring_state", "reconcile_recurring",
                  "qa_version", "plan_create", "plan_create_annual", "probe_plan_state",
                  "plan_cancel_raw", "plan_get",
                  // PROD-LAUNCH-01B.2 · el disparador del pago único
                  "one_time_prepare", "one_time_state", "one_time_observe",
                  "one_time_login_link"] as const;
type Accion = (typeof ACCIONES)[number];

/** Registro de servidor: tipo de operación y clasificación. Nunca un valor. */
function log_seguro(evento: string, campos: Record<string, unknown>) {
  console.log(`[billing:qa] ${evento}`, JSON.stringify(campos));
}

const no = (motivo: string, code = 403) =>
  NextResponse.json({ ok: false, error: motivo }, { status: code });

/** Comparación en tiempo constante. Nunca revela longitudes ni contenido. */
function automationSecretMatches(
  presentado: string | null, esperado: string | undefined
): boolean {
  if (!presentado || !esperado) return false;
  const a = Buffer.from(presentado);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * El envoltorio existe por una lección de MERCADOPAGO-SBX-01: una excepción no
 * capturada aquí sale como «Internal Server Error» en texto plano, y quien
 * llama no puede distinguir «falló el bypass», «falló Mercado Pago» o «falló
 * una variable de entorno». Un disparador de diagnóstico que no sabe decir qué
 * le pasó sirve de poco. La causa se devuelve como JSON, con su nombre y su
 * mensaje —nunca la pila, que puede llevar rutas y valores—.
 */
export async function POST(request: Request) {
  try {
    return await manejar(request);
  } catch (e) {
    return NextResponse.json({
      ok: false, error: "QA_TRIGGER_UNHANDLED_EXCEPTION",
      exception: e instanceof Error ? e.name : "UnknownError",
      message: e instanceof Error ? e.message : String(e),
    }, { status: 500 });
  }
}

async function manejar(request: Request) {
  // --- Candado 1 · jamás en Producción ------------------------------------
  const entornoVercel = process.env.VERCEL_ENV ?? "local";
  if (entornoVercel === "production") {
    return no("QA_TRIGGER_FORBIDDEN_IN_PRODUCTION");
  }

  // --- Candado 2 · quién puede disparar esto -------------------------------
  //
  // Dos identidades valen, y las dos son al menos tan fuertes como la otra:
  //
  //   · un SUPERADMINISTRADOR de plataforma con su sesión real, que es el
  //     camino cuando lo dispara una persona desde el navegador;
  //
  //   · quien presenta el SECRETO DE AUTOMATIZACIÓN del proyecto en Vercel,
  //     que es el camino cuando lo dispara una máquina. No es un permiso más
  //     débil: quien tiene ese secreto tiene acceso al proyecto, y con él
  //     puede leer cualquier variable de entorno y volver a desplegar. Es
  //     estrictamente más que ser superadministrador de Trazaloop.
  //
  // La comparación es en tiempo constante, y si el secreto no está expuesto al
  // despliegue esta vía sencillamente no existe.
  // --- Diagnóstico de la propia autorización -------------------------------
  //
  // Va ANTES del candado 2 a propósito, y es la única cosa de esta ruta que lo
  // hace. Cuando el camino de automatización no encaja, la respuesta
  // «NOT_PLATFORM_SUPERADMIN» no distingue entre tres causas muy distintas: que
  // la cabecera no llegue —Vercel podría consumirla en el borde—, que el
  // proyecto no inyecte el secreto al despliegue, o que los dos existan y no
  // coincidan. Sin poder distinguirlas, arreglarlo es adivinar.
  //
  // Devuelve BOOLEANOS. Ni el secreto, ni su longitud, ni un prefijo. Y solo
  // existe fuera de Producción: el candado 1 ya cortó ahí arriba.
  {
    let cuerpoDiag: Record<string, unknown> = {};
    try { cuerpoDiag = (await request.clone().json()) as Record<string, unknown>; }
    catch { cuerpoDiag = {}; }
    if (String(cuerpoDiag.action ?? "") === "authprobe") {
      const url = new URL(request.url);
      const cab = request.headers.get("x-vercel-protection-bypass");
      const qs = url.searchParams.get("x-vercel-protection-bypass");
      const esperado = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      return NextResponse.json({
        ok: true, action: "authprobe",
        vercel_environment: entornoVercel,
        // ¿Llega la cabecera hasta la función, o la consume el borde?
        bypass_header_present: Boolean(cab),
        bypass_query_present: Boolean(qs),
        // ¿Está el secreto inyectado en el despliegue?
        automation_secret_env_present: Boolean(esperado),
        // ¿Coinciden? Comparación seleccionada en tiempo constante.
        matches_header: automationSecretMatches(cab, esperado),
        matches_query: automationSecretMatches(qs, esperado),
        // Qué otras variables de sistema SÍ llegan, para saber si el proyecto
        // expone las de sistema en general. Solo nombres, nunca valores.
        system_env_visible: ["VERCEL_ENV", "VERCEL_URL", "VERCEL_TARGET_ENV"]
          .filter((k) => Boolean(process.env[k])),
      });
    }
  }

  // El secreto se comprueba PRIMERO: quien lo presenta ya está identificado, y
  // preguntarle a la base quién es sería una consulta que no decide nada y una
  // forma más de fallar. Lo aprendió MERCADOPAGO-SBX-01, donde el diagnóstico
  // dependía de una base que la automatización no necesita para nada.
  const porAutomatizacion = automationSecretMatches(
    request.headers.get("x-vercel-protection-bypass"),
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  let isStaff = false;
  let isSuperadmin = false;
  if (!porAutomatizacion) {
    ({ isStaff, isSuperadmin } = await checkPlatformStatus());
    if (!isStaff || !isSuperadmin) return no("NOT_PLATFORM_SUPERADMIN");
  }
  const identidad = porAutomatizacion ? "automation" : "superadmin";

  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = (await request.json()) as Record<string, unknown>; } catch { cuerpo = {}; }
  const accion = String(cuerpo.action ?? "") as Accion;
  if (!(ACCIONES as readonly string[]).includes(accion)) {
    return no(`ACTION_UNKNOWN:${accion}`, 400);
  }

  // --- Retirar la tasa sintética de QA ------------------------------------
  // Va ANTES del candado del proveedor a propósito: no toca su red, y hacerla
  // depender de que Mercado Pago responda sería atarla a algo que no le
  // importa. Se retira por VIGENCIA, como se retira una regla fiscal: la fila
  // se queda, se cierra su periodo y deja de ser efectiva. Ni un DELETE.
  if (accion === "retire_qa_fx") {
    const admin0 = createAdminClient();
    const { data: tasas, error: eLeer } = await admin0.from("commercial_fx_rates")
      .select("id, note, status, effective_from, effective_to, rate_micros");
    if (eLeer) return no(`FX_READ_FAILED:${eLeer.message}`, 500);
    // A propósito solo la marca HEREDADA, no `isQaSyntheticFxNote`: esta acción
    // cierra la vigencia además de retirar, y 0182 no deja reabrir una vigencia
    // que ya terminó. Aplicársela a la tasa canónica la mataría para siempre y
    // dejaría a las suites sin la suya. La canónica tiene su propio ciclo de
    // vida en `tasaCanonicaQA`, que retira y reactiva por estado.
    const sinteticas = ((tasas ?? []) as Record<string, unknown>[])
      .filter((t) => String(t.note ?? "").includes(QA_FX_LEGACY_MARKER));
    const ahora = new Date().toISOString();
    const retiradas: unknown[] = [];
    for (const t of sinteticas) {
      if (t.status === "retired" && t.effective_to) { retiradas.push({ id: t.id, ya: true }); continue; }
      const { error } = await admin0.from("commercial_fx_rates")
        .update({ status: "retired", effective_to: ahora }).eq("id", t.id as string);
      if (error) return no(`FX_RETIRE_FAILED:${error.message}`, 500);
      retiradas.push({ id: t.id, effective_from: t.effective_from, effective_to: ahora });
    }
    // Y se comprueba que a partir de ahora se falla cerrado.
    const { data: fx } = await admin0.rpc("billing_resolve_fx",
      { p_base: "USD", p_quote: "COP", p_at: new Date().toISOString() });
    const { count: cuantosQuotes } = await admin0.from("billing_quotes")
      .select("id", { count: "exact", head: true });
    const { data: instantaneas } = await admin0.from("billing_quotes")
      .select("id, fx_rate_micros, total_amount").limit(10);
    return NextResponse.json({ ok: true, retired: retiradas,
      fx_after: fx, historical_quotes: cuantosQuotes,
      quote_snapshots: instantaneas });
  }

  // --- Candado 3 · solo credenciales de PRUEBA, POR IDENTIDAD -------------
  //
  // No por la forma del token. Cuando la aplicación se crea iniciando sesión
  // como vendedor de prueba, Mercado Pago emite sus credenciales bajo el
  // epígrafe «producción» y con prefijo `APP_USR-`: mirar el prefijo declararía
  // producción a un vendedor sintético. Quien decide es la ficha del dueño.
  //
  // Y falla cerrado: sin evidencia POSITIVA de usuario de prueba —o sin poder
  // preguntar— la respuesta es «producción», que es la que impide cobrar.
  const tokenPuesto = Boolean(
    process.env.MERCADOPAGO_ACCESS_TOKEN
    && process.env.MERCADOPAGO_ACCESS_TOKEN.trim() !== "");
  const compradorConfigurado = Boolean(
    process.env.MERCADOPAGO_TEST_BUYER_EMAIL
    && process.env.MERCADOPAGO_TEST_BUYER_EMAIL.trim() !== ""
  );
  const proveedor = mercadoPagoFromEnv();
  const duenno = tokenPuesto
    ? await proveedor.resolveEnvironment()
    : { environment: null, siteId: null, countryId: null, ownerId: null,
        isTestUser: false, reachable: false, ownerMatchesExpected: false };

  // Qué versión del disparador responde aquí. No llama a Mercado Pago, no toca
  // la base y no devuelve ningún secreto: solo el marcador, la identidad del
  // despliegue que Vercel ya publica, y qué acciones admite.
  // -------------------------------------------------------------------------
  // PROD-LAUNCH-01B.2 · Preparar UN Checkout Pro de pago único
  // -------------------------------------------------------------------------
  //
  // POR QUÉ HACE FALTA UN DISPARADOR
  //
  // El flujo de pago único lo inicia una persona pulsando «Contratar» o
  // «Renovar». Para un ensayo gobernado hace falta llegar al `init_point` sin
  // esa persona, y sin reimplementar el flujo: reimplementarlo probaría otro
  // camino que el que usan los clientes, que es exactamente lo que no sirve.
  //
  // Así que esto DELEGA. `createBillingQuote` y `openOneTimeCheckout` son las
  // mismas funciones que llama la acción de servidor de la interfaz. Aquí solo
  // se eligen la empresa y el plan, y se devuelve lo que salga.
  //
  // No cobra, no asienta y no concede nada: deja una preferencia abierta y su
  // enlace. Quien paga sigue siendo una persona.
  // UN ACCESO DE UN SOLO USO PARA QUE LA PERSONA PULSE EL BOTÓN.
  //
  // El ensayo de recuperación exige que sea una PERSONA quien pulse «Ya
  // realicé el pago — Verificar». Para eso tiene que poder entrar, y el
  // administrador de una empresa de QA suele tener un correo de un dominio
  // que no existe: la recuperación por correo no puede funcionar.
  //
  // Se emite un enlace de un solo uso. NO se cambia ninguna contraseña:
  // cambiarla para poder probar deja a esa persona fuera de su cuenta.
  //
  // Lleva a `/settings/billing`, NUNCA a la pantalla de retorno: esa comprueba
  // el pago al cargarse, y entonces el plan se activaría por abrir una URL en
  // vez de por una decisión de alguien.
  if (accion === "one_time_login_link") {
    const orgLink = String(cuerpo.organization_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(orgLink)) return no("ORGANIZATION_ID_REQUIRED", 400);
    const adminLink = createAdminClient();
    const { data: memLink } = await adminLink.from("memberships")
      .select("user_id").eq("organization_id", orgLink).eq("role_code", "admin").limit(1);
    const uidLink = (memLink ?? [])[0]?.user_id as string | undefined;
    if (!uidLink) return no("ORGANIZATION_HAS_NO_ADMIN", 409);
    const { data: personaLink } = await adminLink.auth.admin.getUserById(uidLink);
    const correoLink = personaLink.user?.email ?? "";
    if (!correoLink) return no("ORGANIZATION_ADMIN_HAS_NO_EMAIL", 409);

    const urlLink = new URL(request.url);
    const destino = `${urlLink.protocol}//${urlLink.host}/settings/billing`;
    const { data: enlaceLink, error: eLink } = await adminLink.auth.admin.generateLink({
      type: "magiclink", email: correoLink,
      options: { redirectTo: destino } });
    if (eLink || !enlaceLink?.properties?.action_link) {
      return no(`QA_LOGIN_LINK_UNAVAILABLE:${eLink?.message.slice(0, 60) ?? ""}`, 424);
    }
    return NextResponse.json({ ok: true,
      organization_id: orgLink,
      // El correo, enmascarado: identifica la cuenta sin publicarla.
      account: correoLink.replace(/^(.).*(@.*)$/, "$1…$2"),
      redirect_to: destino,
      login_link: enlaceLink.properties.action_link,
      note: "Un solo uso. Lleva a /settings/billing; el botón lo pulsa una persona.",
    });
  }

  // OBSERVAR SIN DECIDIR.
  //
  // Pregunta al proveedor por los pagos de un cobro y dice qué respondería el
  // verificador, SIN asentar. Existe porque «comprobar antes de actuar» y
  // «actuar» tienen que poder separarse: si la única forma de saber si hay un
  // pago fuera activar el plan, no habría manera de mirar.
  //
  // Es de solo lectura de punta a punta. No escribe ni una fila.
  if (accion === "one_time_observe") {
    const cobroId = String(cuerpo.checkout_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(cobroId)) return no("CHECKOUT_ID_REQUIRED", 400);

    const adminObs = createAdminClient();
    const { data: fila } = await adminObs.from("billing_one_time_checkouts")
      .select("id, organization_id, provider, environment, purpose, status, "
        + "expected_total_amount, expected_currency, provider_preference_id, "
        + "verified_payment_id, settled_payment_id")
      .eq("id", cobroId).maybeSingle();
    if (!fila) return no("CHECKOUT_NOT_FOUND", 404);
    const c = fila as unknown as Record<string, unknown>;

    const { oneTimeGatewayFor } = await import("@/lib/billing/providers/one-time-registry");
    const pasarela = oneTimeGatewayFor(String(c.provider));
    if (!pasarela) return no("PROVIDER_NOT_CONFIGURED", 424);

    const pagos = await pasarela.paymentsFor(cobroId);
    if (!pagos.ok) {
      return NextResponse.json({ ok: false, error: "PROVIDER_UNAVAILABLE",
        failure: pagos.failure }, { status: 424 });
    }

    const { decideOneTimeSettlement } =
      await import("@/lib/billing/one-time/verification");
    // 01B.4 · La identidad de la credencial, que es lo que sustituye a
    // `live_mode` como frontera en pruebas.
    const titularObs = await pasarela.ownerIdentity();

    const veredicto = decideOneTimeSettlement({
      checkoutId: String(c.id),
      expectedTotalMinor: Number(c.expected_total_amount),
      expectedCurrency: String(c.expected_currency),
      configuredEnvironment: (pasarela.environment ?? c.environment) as "test" | "live",
      checkoutEnvironment: c.environment as "test" | "live",
      expectedOwnerId: titularObs.expectedOwnerId,
      credentialOwnerMatches: titularObs.matches,
    }, pagos.value);

    return NextResponse.json({ ok: true,
      checkout: c,
      // Los pagos, sin nada de la persona que pagó.
      payments: pagos.value.map((x) => ({
        provider_payment_id: x.providerPaymentId,
        canonical_status: x.canonicalStatus,
        amount_minor: x.amountMinor,
        currency: x.currency,
        external_reference: x.externalReference,
        live_mode: x.liveMode,
      })),
      // La identidad con la que se juzga, para que el veredicto se pueda leer.
      identity: {
        configured_environment: pasarela.environment,
        checkout_environment: c.environment,
        expected_owner_id: titularObs.expectedOwnerId,
        observed_owner_id: titularObs.observedOwnerId,
        owner_matches: titularObs.matches,
        provider_reachable: titularObs.reachable,
      },
      // Y si el presupuesto caducó, si eso bloquearía o no el reconocimiento.
      quote: await (async () => {
        if (!c.quote_id) return null;
        const { data: q } = await adminObs.from("billing_quotes")
          .select("id, status, expires_at").eq("id", c.quote_id as string).maybeSingle();
        if (!q) return null;
        const fila = q as Record<string, unknown>;
        const caducado = new Date(String(fila.expires_at)).getTime() <= Date.now();
        return {
          id: fila.id, status: fila.status, expires_at: fila.expires_at,
          quote_expired: caducado,
          // El reconocimiento de un pago contra un presupuesto caducado exige
          // que el vendedor observado sea el esperado.
          expired_quote_recovery_allowed: !caducado
            || (veredicto.settle
                && veredicto.collectorId !== null
                && veredicto.collectorId === titularObs.expectedOwnerId),
        };
      })(),
      // Lo que el verificador HARÍA. No lo hace.
      verdict: veredicto,
      note: "Solo observación: no se asentó nada.",
    });
  }

  if (accion === "one_time_prepare" || accion === "one_time_state") {
    const orgId = String(cuerpo.organization_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(orgId)) return no("ORGANIZATION_ID_REQUIRED", 400);

    const { openOneTimeCheckout, OPEN_ERROR_MESSAGE } =
      await import("@/lib/db/one-time-checkout");
    const adminOt = createAdminClient();

    // El estado, para poder mirar sin volver a crear nada.
    const estadoDe = async () => {
      const { data } = await adminOt.from("billing_one_time_checkouts")
        .select("id, provider, environment, purpose, status, expected_total_amount, "
          + "expected_currency, provider_preference_id, init_point, verified_payment_id, "
          + "settled_payment_id, created_at")
        .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(5);
      const { data: subs } = await adminOt.from("billing_subscriptions")
        .select("id, status, plan_code, renewal_mode").eq("organization_id", orgId);
      const { count: pagos } = await adminOt.from("billing_payments")
        .select("id", { count: "exact", head: true }).eq("organization_id", orgId);
      return { checkouts: data ?? [], subscriptions: subs ?? [], payments: pagos ?? 0 };
    };

    if (accion === "one_time_state") {
      return NextResponse.json({ ok: true, organization_id: orgId, ...(await estadoDe()) });
    }

    const plan = cuerpo.plan === "extra" ? "extra" : "full";
    const intervalo = cuerpo.interval === "annual" ? "annual" : "monthly";

    // UNA SESIÓN DE VERDAD, PORQUE LA BASE LA EXIGE.
    //
    // `billing_create_quote` y `billing_open_one_time_checkout` comprueban
    // `auth.uid()`: contratar es un acto de alguien, no de un proceso. Esta
    // ruta se autentica por bypass y no trae sesión, así que hay que abrir una.
    //
    // Se abre con un enlace de UN SOLO USO del administrador de la empresa, no
    // cambiándole la contraseña: cambiar la contraseña de una persona para
    // poder probar deja a esa persona fuera de su cuenta.
    const { data: mem } = await adminOt.from("memberships")
      .select("user_id").eq("organization_id", orgId).eq("role_code", "admin").limit(1);
    const uid = (mem ?? [])[0]?.user_id as string | undefined;
    if (!uid) return no("ORGANIZATION_HAS_NO_ADMIN", 409);
    const { data: persona } = await adminOt.auth.admin.getUserById(uid);
    const correo = persona.user?.email ?? "";
    if (!correo) return no("ORGANIZATION_ADMIN_HAS_NO_EMAIL", 409);

    const { data: enlace, error: eEnlace } = await adminOt.auth.admin.generateLink({
      type: "magiclink", email: correo });
    const otp = enlace?.properties?.hashed_token;
    if (eEnlace || !otp) return no("QA_SESSION_UNAVAILABLE", 424);

    const sesion = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string,
      { auth: { persistSession: false } });
    const { error: eOtp } = await sesion.auth.verifyOtp(
      { token_hash: otp, type: "magiclink" });
    if (eOtp) return no(`QA_SESSION_REFUSED:${eOtp.message.slice(0, 60)}`, 424);

    const url = new URL(request.url);
    // El presupuesto, con esa MISMA sesión. `createBillingQuote` abre la suya
    // por dentro y aquí no vale: se llama a la primitiva directamente, que es
    // lo que aquella envuelve.
    const { data: q, error: eQuote } = await sesion.rpc("billing_create_quote", {
      p_organization_id: orgId, p_plan_code: plan,
      p_billing_interval: intervalo, p_coupon_code: null });
    if (eQuote || !q) {
      return NextResponse.json({ ok: false, error: "QUOTE_REFUSED",
        detail: eQuote?.message ?? null }, { status: 409 });
    }
    const presupuesto = q as Record<string, unknown>;
    const quoteId = String(presupuesto.quote_id ?? "");

    const abierto = await openOneTimeCheckout({
      purpose: "initial",
      targetId: quoteId,
      supabase: sesion,
      origin: `${url.protocol}//${url.host}`,
      planLabel: `Trazaloop ${plan === "extra" ? "Extra" : "Full"} · `
        + `${intervalo === "annual" ? "anual" : "mensual"}`,
      payerEmail: process.env.MERCADOPAGO_TEST_BUYER_EMAIL ?? null,
    });
    if (!abierto.ok) {
      return NextResponse.json({ ok: false, error: abierto.code,
        message: OPEN_ERROR_MESSAGE[abierto.code], detail: abierto.detail ?? null },
        { status: 409 });
    }

    return NextResponse.json({ ok: true,
      organization_id: orgId,
      quote_id: quoteId,
      quote: presupuesto,
      checkout_id: abierto.checkoutId,
      init_point: abierto.initPoint,
      reused: abierto.reused,
      ...(await estadoDe()) });
  }

  if (accion === "qa_version") {
    return NextResponse.json({
      ok: true,
      commit_or_marker: QA_MARCADOR,
      // El diseño que se implementa, y la revisión que responde. Son cosas
      // distintas: el primero identifica QUÉ experimento es, el segundo QUÉ
      // despliegue está contestando.
      build_marker: QA_DISENO,
      // LA AUTORIDAD ES EL MARCADOR, NO EL SHA.
      //
      // Un despliegue hecho con el CLI desde un directorio de trabajo captura
      // el `HEAD` del momento, que NO es necesariamente el commit que contiene
      // el código subido: si se despliega antes de confirmar, el SHA nombra un
      // commit anterior mientras viaja código que aún no está en ninguno. Pasó,
      // y la única razón por la que se detectó es que alguien comparó las dos
      // procedencias en vez de confiar en una.
      //
      // Por eso el campo se llama por lo que ES —el HEAD que Vercel vio al
      // desplegar— y no por lo que se querría que fuera. El dato con el que hay
      // que comprobar que se está llamando al despliegue correcto es
      // `commit_or_marker`, que se sube a mano con cada cambio.
      source_revision_marker: QA_MARCADOR,
      // Se declara NO DISPONIBLE a propósito. El valor existe —Vercel lo
      // inyecta— pero un despliegue por CLI desde un directorio de trabajo no
      // puede DEMOSTRAR que ese commit contenga el código subido: si se
      // despliega antes de confirmar, nombra un commit anterior con toda
      // fidelidad y toda falsedad. Mientras eso no se pueda garantizar por
      // construcción, este campo no promete lo que no puede cumplir.
      git_commit_sha: "unavailable",
      // El dato crudo sigue estando, nombrado por lo que ES y no por lo que se
      // querría que fuera. Sirve como pista, nunca como prueba.
      vercel_git_head_at_deploy: process.env.VERCEL_GIT_COMMIT_SHA ?? "unavailable",
      vercel_git_ref_at_deploy: process.env.VERCEL_GIT_COMMIT_REF ?? "unavailable",
      provenance_note: "git_commit_sha se declara unavailable porque un despliegue "
        + "por CLI no garantiza que el HEAD capturado sea el del código subido. "
        + "La autoridad para identificar el despliegue es source_revision_marker; "
        + "build_marker identifica el DISEÑO del experimento.",
      deployment_url: process.env.VERCEL_URL ?? null,
      vercel_environment: entornoVercel,
      // Derivado del catálogo: no puede mentir sobre lo que la ruta admite.
      acciones_disponibles: [...ACCIONES].sort(),
      cancel_min_available: (ACCIONES as readonly string[]).includes("cancel_min"),
      cancel_raw_available: (ACCIONES as readonly string[]).includes("cancel_raw"),
      // MP-PLAN-01 · el experimento del plan asociado, en bloque.
      mp_plan_01_available: ["plan_create", "probe_plan_state", "plan_cancel_raw"]
        .every((a) => (ACCIONES as readonly string[]).includes(a)),
      // Y se dice en voz alta lo que NO está: el camino por API sin testigo de
      // tarjeta se retiró a propósito, no se olvidó.
      plan_subscribe_api_available:
        (ACCIONES as readonly string[]).includes("plan_subscribe"),
      probe_annual_available: (ACCIONES as readonly string[]).includes("probe_annual"),
      probe_amount_change_available:
        (ACCIONES as readonly string[]).includes("probe_amount_change"),
    });
  }

  if (accion === "preflight") {
    return NextResponse.json({
      ok: true,
      vercel_environment: entornoVercel,
      access_token_present: tokenPuesto,
      // Huella NO reversible: diez hexadecimales de un SHA-256. No revela el
      // token ni su longitud, y sirve para lo único que hacía falta y no se
      // podía: comprobar que un despliegue trae la credencial NUEVA y no la
      // anterior. Sin ella, «se cambió el token» era una afirmación sin prueba.
      access_token_fingerprint: tokenPuesto
        ? createHash("sha256")
            .update(process.env.MERCADOPAGO_ACCESS_TOKEN as string)
            .digest("hex").slice(0, 10)
        : null,
      // Clasificación por identidad. Nunca se dice nada del valor del token.
      // MP-ENV-01 · La CONFIGURACIÓN y lo OBSERVADO, separados. Antes había un
      // solo campo y mezclaba las dos cosas.
      configured_environment: proveedor.identity.ok
        ? proveedor.identity.value.environment : null,
      configuration_error: proveedor.identity.ok ? null : proveedor.identity.reason,
      expected_application_configured: proveedor.identity.ok,
      // MP-ENV-01.3 · El titular OBSERVADO de la credencial. No es un secreto
      // —es el identificador de una cuenta— y hace falta para poder configurar
      // `MERCADOPAGO_EXPECTED_OWNER_ID` sin adivinar.
      //
      // Y ojo con qué significa esa variable: es el titular OBSERVADO de la
      // credencial de ESE entorno, no el «User ID del propietario» que muestra
      // el panel de la aplicación. En pruebas son distintos: las credenciales
      // de prueba de una aplicación autentican como un usuario de prueba, no
      // como la cuenta productiva que figura como dueña.
      observed_owner_id: duenno.ownerId,
      owner_id_matches_expected: duenno.ownerMatchesExpected,
      // Diagnóstico, NO autoridad: puede ser `false` con una credencial de
      // prueba de aplicación perfectamente válida.
      owner_is_test_user: duenno.isTestUser,
      owner_site_id: duenno.siteId,
      owner_country_id: duenno.countryId,
      provider_reachable: duenno.reachable,
      test_buyer_email_configured: compradorConfigurado,
      webhook_secret_present: Boolean(process.env.MERCADOPAGO_WEBHOOK_SECRET),
      identity: identidad,
      is_superadmin: isSuperadmin,
    });
  }

  if (!tokenPuesto) return no("MERCADOPAGO_ACCESS_TOKEN_NOT_AVAILABLE", 424);
  if (!duenno.reachable) return no("MERCADOPAGO_IDENTITY_UNVERIFIABLE", 424);
  // MP-ENV-01 · Ya NO se exige la etiqueta `test_user`. Una credencial de
  // prueba de aplicación pertenece a una cuenta productiva y no la lleva; y un
  // token de usuario de prueba la lleva aunque sea de OTRA aplicación, que es
  // exactamente el fallo que dejó un cobro real sin webhook. Lo que se exige es
  // la configuración declarada y el titular esperado.
  const identidadQa = proveedor.identity;
  if (!identidadQa.ok) return no(identidadQa.reason, 424);
  if (identidadQa.value.environment !== "test") {
    return no("MERCADOPAGO_ENVIRONMENT_IS_NOT_TEST", 424);
  }
  if (!duenno.ownerMatchesExpected) {
    return no("MERCADOPAGO_OWNER_IS_NOT_EXPECTED", 424);
  }
  // EL PAGADOR DEL FLUJO PENDIENTE.
  //
  // MP-QA-HARDENING-02 · Aquí había un correo escrito a mano —el del ejemplo de
  // la documentación— y un comentario que defendía no ponerlo en una variable
  // «porque invitaría a confundirlo con un dato comercial». Los hechos lo
  // desmintieron: Mercado Pago lo rechaza con `400 · Payer is associated with a
  // different site`, y WCS-49142 ya lo tenía catalogado para la variante
  // `test@testuser.com`.
  //
  // Un comprador de sandbox NO se puede inventar: es una identidad que crea el
  // proveedor y que pertenece a un sitio concreto. Por fuerza es configuración
  // del entorno. Se resuelve y se valida en `lib/billing/qa/test-payer.ts`, que
  // comparten las tres acciones para que no vuelvan a divergir.
  // -------------------------------------------------------------------------
  // probe_payer_email · MERCADOPAGO-SBX-01 · ticket WCS-49142
  // -------------------------------------------------------------------------
  //
  // LA PREGUNTA, Y POR QUÉ HACE FALTA UNA LLAMADA PARA RESPONDERLA
  //
  // PE-05B2 se quedó parado en el pagador: Mercado Pago valida `payer_email`
  // ANTES que la recurrencia, así que mientras no haya un correo aceptado no se
  // puede ni preguntar si el anual existe. Se probaron tres formas y las tres
  // fallaron: el ejemplo de la documentación por sitio, el apodo en minúsculas
  // y `test_user_<User ID>` por «User bad request».
  //
  // Soporte indica ahora una cuarta: `test_user_<número>@testuser.com` donde el
  // número es el del APODO —`TESTUSER<número>`— y NO el User ID. Son distintos,
  // y esa forma no se ha intentado nunca.
  //
  // No hay manera de preguntarlo sin llamar: la API de Clientes quedó fuera del
  // camino crítico y no existe un validador de correos. La llamada mínima que
  // decide es crear un preapproval PENDIENTE, que no cobra nada y que el
  // comprador tendría que autorizar después abriendo su enlace.
  //
  // LO QUE ESTA ACCIÓN NO HACE
  //
  // No toca ninguna tabla. No crea empresa, ni presupuesto, ni intento, ni tasa.
  // Es una pregunta al proveedor y su respuesta: atarla a la fontanería de
  // Trazaloop mezclaría dos experimentos y añadiría formas de fallar que no
  // tienen nada que ver con lo que se quiere saber.
  //
  // Y el importe NO llega de quien llama. Es una constante del experimento, del
  // mismo modo que en el resto de esta ruta el dinero sale siempre del dominio.
  if (accion === "probe_payer_email") {
    const correo = String(cuerpo.email ?? "");
    // Una lista cerrada de FORMAS, no un campo libre: esto contesta una
    // pregunta concreta, no es un probador de correos ajenos.
    // Los patrones salen del módulo compartido: tres acciones comprobaban la
    // misma forma con tres copias de la expresión, y bastaba tocar una para que
    // dejaran de coincidir.
    const formas: Array<{ nombre: string; patron: RegExp }> = [
      { nombre: "test_user_<numero>@testuser.com", patron: TEST_BUYER_PATTERN },
      { nombre: "test_payer_<numero>@testuser.com", patron: TEST_PAYER_CUSTOMER_PATTERN },
    ];
    const forma = formas.find((f) => f.patron.test(correo));
    if (!forma) return no("PAYER_EMAIL_FORM_NOT_ALLOWED", 400);

    const IMPORTE_SONDA = 5000;      // COP. Constante del experimento.
    const MONEDA_SONDA = "COP";
    const referencia = `WCS-49142-probe-${randomUUID()}`;
    // La URL de vuelta se calcula AQUÍ: esta acción no depende de nada que se
    // prepare más abajo, y así se puede mover sin romperla.
    const sitioSonda = new URL(request.url).origin;
    const volverSonda = `${sitioSonda.replace(/\/$/, "")}/billing/return`;
    const cuerpoMp = {
      reason: "Trazaloop · sonda de pagador (WCS-49142)",
      external_reference: referencia,
      payer_email: correo,
      back_url: volverSonda,
      status: "pending",
      auto_recurring: {
        frequency: 1, frequency_type: "months",
        transaction_amount: IMPORTE_SONDA, currency_id: MONEDA_SONDA,
      },
    };
    try {
      const r = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: { "Content-Type": "application/json",
                   Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
        body: JSON.stringify(cuerpoMp),
      });
      const j = (await r.json()) as Record<string, unknown>;
      log_seguro("sonda_pagador", { http: r.status, forma: forma.nombre,
                                    aceptado: r.ok, referencia });
      return NextResponse.json({
        ok: r.ok, http: r.status, form: forma.nombre,
        // Lo que se pidió, para que la evidencia se lea sin adivinar.
        request: { ...cuerpoMp, payer_email: correo },
        // Y lo que contestó. En el fallo, el mensaje es TODA la información.
        response: r.ok
          ? { id: j.id ?? null, status: j.status ?? null,
              init_point: j.init_point ?? null,
              auto_recurring: j.auto_recurring ?? null,
              next_payment_date: j.next_payment_date ?? null,
              external_reference: j.external_reference ?? null,
              date_created: j.date_created ?? null,
              last_modified: j.last_modified ?? null,
              version: j.version ?? null,
              payer_id: j.payer_id ?? null }
          : { message: j.message ?? null, error: j.error ?? null,
              status: j.status ?? null, cause: j.cause ?? null },
      });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  // -------------------------------------------------------------------------
  // probe_annual · MP-SBX-01B · ¿existe el ciclo de 12 meses?
  // -------------------------------------------------------------------------
  //
  // La pregunta lleva abierta desde PE-05B2 y no se podía ni formular: Mercado
  // Pago valida el pagador ANTES que la recurrencia, así que mientras el correo
  // fue rechazado el anual quedó sin respuesta. Con el pagador ya aceptado
  // (MP-SBX-01A), esta es la primera vez que la pregunta llega a su destino.
  //
  // LO QUE SE MIRA EN LA RESPUESTA, Y POR QUÉ
  //
  // No basta con que la API devuelva 201. Hay que leer el `auto_recurring` QUE
  // VUELVE: un proveedor puede aceptar la petición y normalizar el ciclo por
  // dentro —a 1 mes— sin decir nada. Si eso pasara y Trazaloop diera por bueno
  // el 201, vendería un plan anual y cobraría doce veces. Por eso la evidencia
  // es lo devuelto, no lo enviado.
  //
  // La recurrencia es una CONSTANTE de este experimento, no un parámetro: esto
  // contesta una pregunta concreta, no es un creador de suscripciones a medida.
  if (accion === "probe_annual") {
    const correo = String(cuerpo.email ?? "");
    if (!isTestBuyerEmail(correo)) {
      return no("PAYER_EMAIL_FORM_NOT_ALLOWED", 400);
    }
    const IMPORTE_SONDA = 5000;      // COP. Constante del experimento.
    const MONEDA_SONDA = "COP";
    const referencia = `WCS-49142-annual-12m-${randomUUID()}`;
    const sitioSonda = new URL(request.url).origin;
    const volverSonda = `${sitioSonda.replace(/\/$/, "")}/billing/return`;
    // `start_date` NO se manda: se quiere ver qué fecha elige el proveedor por
    // su cuenta. Fijarla sería responder nosotros la pregunta que hacemos.
    const cuerpoMp = {
      reason: "Trazaloop · sonda anual 12 meses (WCS-49142)",
      external_reference: referencia,
      payer_email: correo,
      back_url: volverSonda,
      status: "pending",
      auto_recurring: {
        frequency: 12, frequency_type: "months",
        transaction_amount: IMPORTE_SONDA, currency_id: MONEDA_SONDA,
      },
    };
    try {
      const r = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: { "Content-Type": "application/json",
                   Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
        body: JSON.stringify(cuerpoMp),
      });
      const j = (await r.json()) as Record<string, unknown>;
      const ar = (j.auto_recurring ?? {}) as Record<string, unknown>;
      log_seguro("sonda_anual", { http: r.status, aceptado: r.ok,
                                  devuelto: `${ar.frequency}/${ar.frequency_type}`, referencia });
      // El veredicto se calcula aquí y se dice: leerlo a ojo desde un JSON
      // grande es justo donde se cuela un «pasó» que no pasó.
      const preserva = ar.frequency === 12 && ar.frequency_type === "months";
      return NextResponse.json({
        ok: r.ok, http: r.status,
        request: { payer_email: correo, frequency: 12, frequency_type: "months",
                   transaction_amount: IMPORTE_SONDA, currency_id: MONEDA_SONDA,
                   external_reference: referencia, status: "pending" },
        response: r.ok
          ? { id: j.id ?? null, status: j.status ?? null,
              auto_recurring: ar,
              start_date: (ar.start_date ?? j.date_created) ?? null,
              next_payment_date: j.next_payment_date ?? null,
              external_reference: j.external_reference ?? null,
              payer_id: j.payer_id ?? null,
              init_point: j.init_point ?? null,
              date_created: j.date_created ?? null,
              version: j.version ?? null }
          : { message: j.message ?? null, error: j.error ?? null,
              status: j.status ?? null, cause: j.cause ?? null },
        verdict: r.ok
          ? (preserva
            ? "ACEPTA_Y_PRESERVA_12_MESES"
            : `NORMALIZO_SILENCIOSAMENTE_A_${ar.frequency}_${ar.frequency_type}`)
          : "RECHAZADO",
      });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  // -------------------------------------------------------------------------
  // MP-SBX-01C · qué significa cambiar el importe de una suscripción viva
  // -------------------------------------------------------------------------
  //
  // LA PREGUNTA
  //
  // `PUT /preapproval/{id}` con otro `transaction_amount`, ¿solo cambia el
  // próximo cobro, cobra en el acto, prorratea, o hace otra cosa? Trazaloop
  // necesita la respuesta antes de prometerle nada a nadie: si cobrara en el
  // acto, un cambio de plan generaría un cargo que el cliente no pidió.
  //
  // DOS SUSCRIPCIONES, NO UNA
  //
  // Subir y bajar se prueban por separado y aisladas. Reutilizar una sola
  // mezclaría los dos efectos en el mismo historial de pagos y haría imposible
  // atribuir un cargo a uno u otro cambio.
  //
  // EL DINERO NO LLEGA DE QUIEN LLAMA
  //
  // Los importes son constantes de cada caso. Quien llama elige el CASO —«up» o
  // «down»—, no la cifra. Es la misma regla que rige el resto de esta ruta.
  const CASOS_01C = {
    up:   { inicial: 5000, destino: 9000 },
    down: { inicial: 9000, destino: 5000 },
  } as const;
  type Caso01C = keyof typeof CASOS_01C;
  const MONEDA_01C = "COP";

  const leerCaso = (v: unknown): Caso01C | null =>
    v === "up" || v === "down" ? v : null;

  /** El estado que importa de un preapproval, sin nada superfluo. */
  const estadoDe = (j: Record<string, unknown>) => {
    const ar = (j.auto_recurring ?? {}) as Record<string, unknown>;
    return {
      id: j.id ?? null, status: j.status ?? null,
      // `reason` es obligatorio al ACTUALIZAR una suscripción sin plan
      // asociado, así que hay que leerlo para poder devolverlo tal cual.
      reason: j.reason ?? null,
      // Y se mira si de verdad hay plan: la suscripción se creó sin él, y esa
      // es justamente la rama del validador que se activa al omitir `reason`.
      preapproval_plan_id: Object.prototype.hasOwnProperty.call(j, "preapproval_plan_id")
        ? (j.preapproval_plan_id ?? null) : "(ausente en la respuesta)",
      transaction_amount: ar.transaction_amount ?? null,
      currency_id: ar.currency_id ?? null,
      frequency: ar.frequency ?? null, frequency_type: ar.frequency_type ?? null,
      start_date: ar.start_date ?? null, end_date: ar.end_date ?? null,
      next_payment_date: j.next_payment_date ?? null,
      external_reference: j.external_reference ?? null,
      // MP-REC-01B.11 · La vuelta se escribía y nunca se releía, así que
      // cuando el navegador aterrizó en un 404 no había forma de saber a dónde
      // había mandado el proveedor. Un campo que se manda y no se puede
      // comprobar es un campo que nadie vigila.
      back_url: j.back_url ?? null,
      payer_id: j.payer_id ?? null,
      date_created: j.date_created ?? null,
      last_modified: j.last_modified ?? null,
      version: j.version ?? null,
      // `summarized` es donde Mercado Pago cuenta lo COBRADO. Es la prueba
      // directa de si un cambio de importe disparó un cargo.
      summarized: j.summarized ?? null,
    };
  };

  /** Los pagos de esa suscripción, por su referencia externa. */
  const pagosDe = async (referencia: string) => {
    // Sin referencia externa no se pregunta: el filtro vacío devuelve 400 y ese
    // 400 se leía como «no hay pagos». Una suscripción creada por el checkout
    // de un plan NO lleva referencia nuestra, así que este camino sencillamente
    // no aplica ahí, y decirlo vale más que un error mudo.
    if (!referencia) {
      return { http: 0, total: 0, payments: [] as Array<Record<string, unknown>>,
        no_aplica: "sin external_reference no se puede buscar por ese filtro; "
          + "use authorized_payments con el preapproval_id" };
    }
    const r = await fetch(
      "https://api.mercadopago.com/v1/payments/search"
      + `?external_reference=${encodeURIComponent(referencia)}&sort=date_created&criteria=desc`,
      { headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` } });
    const j = (await r.json()) as Record<string, unknown>;
    const filas = Array.isArray(j.results) ? (j.results as Record<string, unknown>[]) : [];
    return {
      http: r.status,
      total: (j.paging as Record<string, unknown> | undefined)?.total ?? filas.length,
      payments: filas.map((p) => ({
        id: p.id ?? null, status: p.status ?? null,
        status_detail: p.status_detail ?? null,
        transaction_amount: p.transaction_amount ?? null,
        currency_id: p.currency_id ?? null,
        date_created: p.date_created ?? null,
        date_approved: p.date_approved ?? null,
        description: p.description ?? null,
      })),
    };
  };

  // --- Crear una suscripción diaria aislada --------------------------------
  if (accion === "probe_daily") {
    const correo = String(cuerpo.email ?? "");
    if (!isTestBuyerEmail(correo)) {
      return no("PAYER_EMAIL_FORM_NOT_ALLOWED", 400);
    }
    const caso = leerCaso(cuerpo.case);
    if (!caso) return no("CASE_MUST_BE_UP_OR_DOWN", 400);

    const referencia = `WCS-49142-01C-${caso.toUpperCase()}-${randomUUID()}`;
    const sitioSonda = new URL(request.url).origin;
    const cuerpoMp = {
      reason: `Trazaloop · sonda 01C-${caso.toUpperCase()} (WCS-49142)`,
      external_reference: referencia,
      payer_email: correo,
      back_url: `${sitioSonda.replace(/\/$/, "")}/billing/return`,
      status: "pending",
      auto_recurring: {
        frequency: 1, frequency_type: "days",
        transaction_amount: CASOS_01C[caso].inicial, currency_id: MONEDA_01C,
      },
    };
    try {
      const r = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: { "Content-Type": "application/json",
                   Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
        body: JSON.stringify(cuerpoMp),
      });
      const j = (await r.json()) as Record<string, unknown>;
      log_seguro("sonda_diaria", { http: r.status, caso, aceptado: r.ok, referencia });
      return NextResponse.json({
        ok: r.ok, http: r.status, case: caso,
        plan_del_experimento: CASOS_01C[caso],
        request: { payer_email: correo, frequency: 1, frequency_type: "days",
                   transaction_amount: CASOS_01C[caso].inicial,
                   currency_id: MONEDA_01C, external_reference: referencia,
                   status: "pending" },
        response: r.ok
          ? { ...estadoDe(j), init_point: j.init_point ?? null }
          : { message: j.message ?? null, error: j.error ?? null, cause: j.cause ?? null },
      });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  // --- Leer el estado y los pagos, sin cambiar nada ------------------------
  if (accion === "probe_state") {
    const id = String(cuerpo.preapproval_id ?? "");
    if (!/^[a-f0-9]{16,64}$/i.test(id)) return no("PREAPPROVAL_ID_INVALID", 400);
    try {
      const r = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` } });
      const j = (await r.json()) as Record<string, unknown>;
      if (!r.ok) {
        return NextResponse.json({ ok: false, http: r.status,
          message: j.message ?? null, error: j.error ?? null });
      }
      const estado = estadoDe(j);
      const pagos = await pagosDe(String(estado.external_reference ?? ""));
      return NextResponse.json({ ok: true, http: r.status,
        leido_en: new Date().toISOString(), state: estado, payments: pagos });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  // --- Cambiar el importe, con foto antes y después ------------------------
  //
  // Las dos fotos las toma ESTA acción, no quien llama: si el «antes» se
  // capturase en una llamada aparte, entre las dos podría caer un cobro del
  // ciclo diario y se le atribuiría al cambio de importe. Aquí la distancia
  // entre la foto previa y el PUT es de milisegundos.
  if (accion === "probe_amount_change") {
    const id = String(cuerpo.preapproval_id ?? "");
    if (!/^[a-f0-9]{16,64}$/i.test(id)) return no("PREAPPROVAL_ID_INVALID", 400);
    const caso = leerCaso(cuerpo.case);
    if (!caso) return no("CASE_MUST_BE_UP_OR_DOWN", 400);
    // Modo `noop`: el MISMO importe. Sirve para demostrar que el PUT mínimo es
    // aceptado sin mezclarlo con la pregunta financiera, que es otra.
    const modo = cuerpo.mode === "noop" ? "noop" : "change";

    const cab = { "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` };
    try {
      // 1 · ANTES
      const r0 = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`,
        { headers: cab });
      const j0 = (await r0.json()) as Record<string, unknown>;
      if (!r0.ok) {
        return NextResponse.json({ ok: false, fase: "antes", http: r0.status,
          message: j0.message ?? null });
      }
      const antes = estadoDe(j0);
      const referencia = String(antes.external_reference ?? "");
      const pagosAntes = await pagosDe(referencia);

      // La suscripción tiene que estar VIVA para que la pregunta signifique
      // algo: cambiarle el importe a una pendiente no dice nada de renovaciones.
      if (antes.status !== "authorized") {
        return NextResponse.json({ ok: false, error: "PREAPPROVAL_NOT_AUTHORIZED",
          explicacion: "Cambiar el importe de una suscripción que nadie ha autorizado "
            + "no responde la pregunta: no hay ciclo vivo que pueda cobrar.",
          state: antes, payments: pagosAntes });
      }

      const tAntes = new Date().toISOString();

      // 2 · EL CAMBIO
      //
      // POR QUÉ VA `reason`, Y POR QUÉ NO VA `preapproval_plan_id`
      //
      // El primer intento mandó solo `auto_recurring` y Mercado Pago contestó
      // 400 «Invalid value for preapproval_plan_id» — un mensaje que despista,
      // porque ese campo NO se enviaba: ni con valor, ni nulo, ni vacío. La
      // lectura que encaja con la documentación es que, sin `reason`, el
      // validador toma la rama de las suscripciones CON plan asociado y se
      // queja del identificador de plan que allí sería obligatorio.
      //
      // `reason` no se inventa: se devuelve EL DE LA SUSCRIPCIÓN, tal y como
      // acaba de leerse. Mandar otro sería renombrarla por el camino.
      //
      // Y no se manda nada más. Ni `status`, ni `card_token_id`, ni
      // `external_reference`, ni `back_url`: cada campo de más es una forma
      // nueva de que la respuesta signifique algo distinto de lo que se
      // pregunta.
      const importePedido = modo === "noop"
        ? Number(antes.transaction_amount)
        : CASOS_01C[caso].destino;
      const cuerpoPut: Record<string, unknown> = {
        reason: antes.reason,
        auto_recurring: { transaction_amount: importePedido, currency_id: MONEDA_01C },
      };
      const r1 = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`, {
        method: "PUT", headers: cab,
        body: JSON.stringify(cuerpoPut),
      });
      const j1 = (await r1.json()) as Record<string, unknown>;
      const tDespues = new Date().toISOString();

      // 3 · DESPUÉS, leído de nuevo y no del eco del PUT
      const r2 = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`,
        { headers: cab });
      const j2 = (await r2.json()) as Record<string, unknown>;
      const despues = estadoDe(j2);
      const pagosDespues = await pagosDe(referencia);

      const idsAntes = new Set(pagosAntes.payments.map((p) => String(p.id)));
      const nuevos = pagosDespues.payments.filter((p) => !idsAntes.has(String(p.id)));

      log_seguro("cambio_importe", { caso, modo, http_put: r1.status,
        antes: antes.transaction_amount, despues: despues.transaction_amount,
        pagos_nuevos: nuevos.length });

      return NextResponse.json({
        ok: r1.ok, case: caso, mode: modo,
        http: { antes: r0.status, put: r1.status, despues: r2.status },
        // El body EXACTO que salió. Sin esto, discutir un 400 es discutir de oídas.
        request_body_enviado: cuerpoPut,
        claves_enviadas: Object.keys(cuerpoPut).sort(),
        preapproval_plan_id_enviado: Object.prototype.hasOwnProperty.call(
          cuerpoPut, "preapproval_plan_id"),
        cambio_pedido: { de: antes.transaction_amount, a: importePedido,
                         currency_id: MONEDA_01C },
        antes: { state: antes, payments: pagosAntes },
        put_response: r1.ok
          ? estadoDe(j1)
          : { message: j1.message ?? null, error: j1.error ?? null, cause: j1.cause ?? null },
        despues: { state: despues, payments: pagosDespues },
        instantes: { antes: tAntes, despues: tDespues },
        // El veredicto inmediato, calculado por una función pura y ejercitada
        // con los casos reales —incluido el 400 que llegó a decir «aplicado»
        // porque en un NO-OP el número coincidía—. Lo que pase en el PRÓXIMO
        // ciclo no se afirma aquí: todavía no ha ocurrido.
        veredicto_inmediato: {
          ...veredictoDeCambio({
            putHttp: r1.status,
            antes: antes.transaction_amount === null ? null : Number(antes.transaction_amount),
            despues: despues.transaction_amount === null ? null : Number(despues.transaction_amount),
            objetivo: importePedido,
            pagosNuevos: nuevos.length,
          }),
          pagos_nuevos: nuevos.length,
          detalle_pagos_nuevos: nuevos,
          next_payment_date_antes: antes.next_payment_date,
          next_payment_date_despues: despues.next_payment_date,
          next_payment_date_cambio: antes.next_payment_date !== despues.next_payment_date,
        },
      });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  // -------------------------------------------------------------------------
  // MP-REC-01B.6 · TEMPORAL · leer y cerrar un intento de recurrencia
  // -------------------------------------------------------------------------
  //
  // POR QUÉ EXISTEN ESTAS DOS ACCIONES
  //
  // El primer clic humano real dejó en Staging una suscripción `pending` y su
  // autorización, porque el rechazo de la pasarela llegó DESPUÉS de abrirlas.
  // El producto ya sabe cerrar eso —`billing_close_recurring_attempt`, que el
  // servicio invoca en cada rechazo definitivo— pero ese camino solo se
  // recorre durante un intento nuevo, y un intento nuevo es justamente lo que
  // no se quiere hacer.
  //
  // Así que aquí hay un disparador para el MISMO mecanismo gobernado. No es
  // una vía alternativa: llama a la misma función, con las mismas defensas
  // —no cierra nada que tenga recurso en la pasarela ni periodo pagado—.
  //
  // `recurring_state` solo LEE. Existe para poder comprobar antes y después
  // sin tener que fiarse de lo que diga una pantalla.
  //
  // Las dos se retiran con el resto del disparador.
  if (accion === "recurring_state") {
    const org = String(cuerpo.organization_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(org)) return no("ORGANIZATION_ID_REQUIRED", 400);
    const a = createAdminClient();
    const subs = await a.from("billing_subscriptions")
      .select("id, status, renewal_mode, plan_code, billing_interval, created_at")
      .eq("organization_id", org).order("created_at", { ascending: false });
    const auts = await a.from("billing_recurring_authorizations")
      .select("id, status, environment, provider_subscription_id, "
            + "last_provider_failure, last_provider_diagnostic, created_at")
      .eq("organization_id", org).order("created_at", { ascending: false });
    const pagos = await a.from("billing_payments")
      .select("id, provider, provider_payment_id, status, total_amount, currency, paid_at")
      .eq("organization_id", org).order("created_at", { ascending: false });
    const periodos = await a.from("billing_subscription_periods")
      .select("id, subscription_id, period_sequence, period_start, period_end, "
            + "status, base_amount, charge_currency, settled_at, settled_payment_id")
      .eq("organization_id", org).order("period_sequence", { ascending: true });
    // La PROYECCIÓN de 0194: lo que de verdad abre la puerta de los módulos.
    const modulos = await a.from("organization_modules")
      .select("module_code, enabled, access_mode, access_expires_at, assignment_source")
      .eq("organization_id", org).order("module_code");
    const ciclos = await a.from("billing_provider_cycles")
      .select("provider_invoice_id, provider_cycle_at, period_sequence, outcome")
      .eq("organization_id", org).order("provider_cycle_at", { ascending: true });
    return NextResponse.json({ ok: true,
      subscriptions: subs.data ?? [], authorizations: auts.data ?? [],
      payments: pagos.data ?? [], periods: periodos.data ?? [],
      modules: modulos.data ?? [], provider_cycles: ciclos.data ?? [],
      payment_count: (pagos.data ?? []).length,
      period_count: (periodos.data ?? []).length });
  }

  // -------------------------------------------------------------------------
  // MP-REC-01B.12 · TEMPORAL · conciliar SIN navegador
  // -------------------------------------------------------------------------
  //
  // POR QUÉ HACE FALTA UN DISPARADOR
  //
  // El primer cobro recurrente real se aprobó y el comprador aterrizó en un
  // 404, así que la vuelta del navegador nunca llegó. Recuperar ese cobro por
  // esa misma vuelta sería demostrar lo contrario de lo que hay que demostrar:
  // que el dinero se reconoce SIN que nadie esté mirando.
  //
  // Esto no es una vía alternativa de liquidación. Llama a la MISMA función
  // canónica que usarán el retorno, el aviso del proveedor y el barrido
  // programado, con sus mismas comprobaciones de entorno, cobrador, correlación,
  // importe y moneda. Se retira con el resto del disparador.
  if (accion === "reconcile_recurring") {
    const id = String(cuerpo.authorization_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return no("AUTHORIZATION_ID_REQUIRED", 400);
    const { reconcileRecurringAuthorization } =
      await import("@/lib/db/recurring-checkout");
    const r = await reconcileRecurringAuthorization(id);
    log_seguro("conciliacion_recurrente", { blocked: r.blocked,
      saldados: r.settledNow, ya_estaban: r.alreadyReconciled,
      rechazados: r.rejected.length });
    return NextResponse.json({ ok: r.ok, result: r });
  }

  if (accion === "close_recurring_attempt") {
    const id = String(cuerpo.authorization_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return no("AUTHORIZATION_ID_REQUIRED", 400);
    const modo = cuerpo.outcome === "uncertain" ? "uncertain" : "refused";
    const a = createAdminClient();
    const { data, error } = await a.rpc("billing_close_recurring_attempt", {
      p_authorization_id: id, p_outcome: modo,
      p_failure: String(cuerpo.failure ?? "invalid_request"),
      p_diagnostic: String(cuerpo.diagnostic ?? "").slice(0, 700) || null });
    if (error) return no(`CLOSE_FAILED:${error.message}`, 500);
    log_seguro("cierre_recurrente", { modo, resultado: (data as { outcome?: string })?.outcome });
    return NextResponse.json({ ok: true, result: data });
  }

  // -------------------------------------------------------------------------
  // cancel_min · la cancelación mínima documentada
  // -------------------------------------------------------------------------
  //
  // POR QUÉ HACE FALTA OTRA ACCIÓN SI YA EXISTE `cancel`
  //
  // La `cancel` de esta ruta delega en el adaptador, que manda
  // `{ "status": "cancelled" }` y NADA más. Contra 01C-UP eso devolvió el mismo
  // 400 que el cambio de importe: «Invalid value for preapproval_plan_id», un
  // campo que tampoco ahí se envía. Igual que en el `PUT` del importe, la
  // sospecha es que sin `reason` el validador toma la rama de las suscripciones
  // CON plan asociado.
  //
  // UNA SOLA VARIABLE POR INTENTO
  //
  // PE-05B2 dejó escrito que la documentación usa las DOS grafías, `cancelled` y
  // `canceled`. El intento que falló usó la primera. Si ahora se cambiara a la
  // vez el `reason` y la grafía y volviera a fallar, no sabríamos cuál de las
  // dos cosas importaba. Por eso la grafía es un parámetro de lista cerrada:
  // se prueba una, y si hace falta la otra, sin volver a desplegar.
  //
  // El body lleva EXACTAMENTE dos claves. Ni `preapproval_plan_id`, ni
  // `auto_recurring`, ni `external_reference`, ni `card_token_id`, ni `back_url`.
  if (accion === "cancel_min") {
    const id = String(cuerpo.preapproval_id ?? "");
    if (!/^[a-f0-9]{16,64}$/i.test(id)) return no("PREAPPROVAL_ID_INVALID", 400);
    const grafia = cuerpo.status_spelling === "cancelled" ? "cancelled" : "canceled";
    const cab = { "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` };
    try {
      // 1 · Leer, para tomar el `reason` REAL. No se inventa ni se teclea.
      const r0 = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`,
        { headers: cab });
      const j0 = (await r0.json()) as Record<string, unknown>;
      if (!r0.ok) {
        return NextResponse.json({ ok: false, fase: "antes", http: r0.status,
          message: j0.message ?? null });
      }
      const antes = estadoDe(j0);
      const pagosAntes = await pagosDe(String(antes.external_reference ?? ""));

      // 2 · El body mínimo documentado. Dos claves, contadas.
      const cuerpoPut: Record<string, unknown> = {
        reason: antes.reason,
        status: grafia,
      };
      const r1 = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`, {
        method: "PUT", headers: cab, body: JSON.stringify(cuerpoPut) });
      const j1 = (await r1.json()) as Record<string, unknown>;

      // 3 · Releer del proveedor, no del eco del PUT.
      const r2 = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`,
        { headers: cab });
      const j2 = (await r2.json()) as Record<string, unknown>;
      const despues = estadoDe(j2);
      const pagosDespues = await pagosDe(String(antes.external_reference ?? ""));

      const idsAntes = new Set(pagosAntes.payments.map((x) => String(x.id)));
      const nuevos = pagosDespues.payments.filter((x) => !idsAntes.has(String(x.id)));
      const aceptado = r1.status >= 200 && r1.status < 300;

      log_seguro("cancelacion_minima", { http_put: r1.status, grafia,
        estado_despues: despues.status, pagos_nuevos: nuevos.length });

      return NextResponse.json({
        ok: aceptado,
        http: { antes: r0.status, put: r1.status, despues: r2.status },
        request_body_enviado: cuerpoPut,
        claves_enviadas: Object.keys(cuerpoPut).sort(),
        grafia_usada: grafia,
        antes: { state: antes, payments: pagosAntes },
        put_response: aceptado
          ? { status: j1.status ?? null }
          : { message: j1.message ?? null, error: j1.error ?? null, cause: j1.cause ?? null },
        despues: { state: despues, payments: pagosDespues },
        veredicto: {
          put_aceptado: aceptado,
          // Igual que con el importe: sin 2xx no se da nada por hecho.
          cancelada: aceptado
            && (despues.status === "cancelled" || despues.status === "canceled"),
          estado_despues: despues.status,
          pagos_nuevos: nuevos.length,
          detalle_pagos_nuevos: nuevos,
          // Los pagos históricos no pueden cambiar por cancelar.
          pagos_historicos_intactos:
            JSON.stringify(pagosAntes.payments) === JSON.stringify(
              pagosDespues.payments.filter((x) => idsAntes.has(String(x.id)))),
        },
      });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  // -------------------------------------------------------------------------
  // cancel_raw · quitar el SDK de la ecuación
  // -------------------------------------------------------------------------
  //
  // QUÉ VARIABLE ELIMINA
  //
  // `PreApproval.update` del SDK oficial devolvió 400 «Invalid value for
  // preapproval_plan_id» sobre una suscripción que no tiene plan. Antes de
  // rediseñar Trazaloop alrededor de `preapproval_plan` conviene descartar que
  // el intermediario esté metiendo algo por su cuenta.
  //
  // El forense del SDK 3.6.0 dice que NO —`update` pasa el body ya serializado
  // y el transporte solo añade cabeceras— pero leer un fichero y comprobarlo
  // contra la API son cosas distintas. Esta acción lo comprueba: `fetch`
  // nativo, cero clases del SDK, y el body construido aquí mismo.
  //
  // Y captura la trazabilidad del proveedor: si esto acaba en un ticket, el
  // identificador de petición vale más que cualquier descripción nuestra.
  if (accion === "cancel_raw") {
    const id = String(cuerpo.preapproval_id ?? "");
    if (!/^[a-f0-9]{16,64}$/i.test(id)) return no("PREAPPROVAL_ID_INVALID", 400);
    const grafia = cuerpo.status_spelling === "cancelled" ? "cancelled" : "canceled";
    const url = `https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`;
    // La cabecera se arma aquí y no sale de aquí. Nunca se devuelve ni se
    // registra: lo que viaja en `Authorization` no aparece en ninguna respuesta.
    const cab = { "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` };
    /** Las cabeceras del proveedor que sirven para un ticket, y solo esas. */
    const trazas = (h: Headers) => {
      const out: Record<string, string> = {};
      for (const k of ["x-request-id", "x-caller-id", "x-correlation-id",
                       "x-amzn-trace-id", "date", "content-type"]) {
        const v = h.get(k);
        if (v) out[k] = v;
      }
      return out;
    };
    try {
      // 1 · GET crudo
      const r0 = await fetch(url, { headers: cab });
      const j0 = (await r0.json()) as Record<string, unknown>;
      if (!r0.ok) {
        return NextResponse.json({ ok: false, fase: "antes", provider_http: r0.status,
          provider_response: { message: j0.message ?? null, error: j0.error ?? null },
          provider_request_id: trazas(r0.headers) });
      }
      const antes = estadoDe(j0);
      const referencia = String(antes.external_reference ?? "");
      // 2 · pagos actuales
      const pagosAntes = await pagosDe(referencia);

      // 3 y 4 · el body EXACTO, con el `reason` real leído en el paso 1
      const cuerpoPut: Record<string, unknown> = { reason: antes.reason, status: grafia };

      const r1 = await fetch(url, {
        method: "PUT", headers: cab, body: JSON.stringify(cuerpoPut) });
      const j1 = (await r1.json().catch(() => ({}))) as Record<string, unknown>;
      const aceptado = r1.status >= 200 && r1.status < 300;

      // 6 y 7 · releer, y los pagos de después
      const r2 = await fetch(url, { headers: cab });
      const j2 = (await r2.json()) as Record<string, unknown>;
      const despues = estadoDe(j2);
      const pagosDespues = await pagosDe(referencia);

      const idsAntes = new Set(pagosAntes.payments.map((x) => String(x.id)));
      const nuevos = pagosDespues.payments.filter((x) => !idsAntes.has(String(x.id)));

      log_seguro("cancelacion_cruda", { provider_http: r1.status, grafia,
        estado_despues: despues.status, pagos_nuevos: nuevos.length });

      return NextResponse.json({
        ok: aceptado,
        request_transport: "native_fetch",
        sdk_used_for_put: false,
        request_url: url,
        request_body_enviado: cuerpoPut,
        claves_enviadas: Object.keys(cuerpoPut).sort(),
        provider_http: r1.status,
        provider_response: aceptado
          ? { status: j1.status ?? null, id: j1.id ?? null }
          : { message: j1.message ?? null, error: j1.error ?? null,
              cause: j1.cause ?? null, status: j1.status ?? null },
        provider_request_id: trazas(r1.headers),
        state_before: antes,
        state_after: despues,
        payments_before: pagosAntes,
        payments_after: pagosDespues,
        veredicto: {
          put_aceptado: aceptado,
          cancelada: aceptado
            && (despues.status === "cancelled" || despues.status === "canceled"),
          pagos_nuevos: nuevos.length,
          pagos_historicos_intactos:
            JSON.stringify(pagosAntes.payments) === JSON.stringify(
              pagosDespues.payments.filter((x) => idsAntes.has(String(x.id)))),
        },
      });
    } catch (e) {
      return NextResponse.json({ ok: false, request_transport: "native_fetch",
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  // -------------------------------------------------------------------------
  // MP-PLAN-01 · ¿se puede CREAR → COBRAR → CANCELAR con plan asociado?
  // -------------------------------------------------------------------------
  //
  // POR QUÉ ESTE EXPERIMENTO EXISTE
  //
  // Sin plan asociado, el proveedor rechaza CUALQUIER `PUT /preapproval/{id}`
  // —cambiar el importe y cancelar fallan igual— con «Invalid value for
  // preapproval_plan_id», un campo que no se envía y que la suscripción no
  // tiene. Con el SDK descartado como causa, la pregunta pasa a ser otra: si el
  // camino soportado de verdad es el de las suscripciones CON plan.
  //
  // UNA SOLA PREGUNTA
  //
  // Crear, cobrar y cancelar. Nada más. Ni importe, ni prorrateo, ni bajada, ni
  // cupones, ni anual, ni webhooks: mezclarlos aquí volvería a dar un resultado
  // que no se sabe a qué atribuir.
  //
  // LAS CIFRAS SON CONSTANTES
  //
  // Como en todo lo demás de esta ruta, el dinero no llega de quien llama.
  const PLAN01 = {
    reason: "Trazaloop Full Monthly QA · MP-PLAN-01",
    amount: 5000,
    currency: "COP",
    frequency: 1,
    frequency_type: "months",
  } as const;

  const cabMp = () => ({ "Content-Type": "application/json",
                         Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` });
  /** Las cabeceras que sirven para un ticket de soporte, y solo esas. */
  const trazasDe = (h: Headers) => {
    const out: Record<string, string> = {};
    for (const k of ["x-request-id", "x-caller-id", "x-correlation-id", "date"]) {
      const v = h.get(k);
      if (v) out[k] = v;
    }
    return out;
  };

  // --- 1 · el plan ---------------------------------------------------------
  if (accion === "plan_create") {
    const sitio = new URL(request.url).origin;
    const cuerpoMp = {
      reason: PLAN01.reason,
      auto_recurring: {
        frequency: PLAN01.frequency, frequency_type: PLAN01.frequency_type,
        transaction_amount: PLAN01.amount, currency_id: PLAN01.currency,
      },
      back_url: `${sitio.replace(/\/$/, "")}/billing/return`,
    };
    try {
      const r = await fetch("https://api.mercadopago.com/preapproval_plan", {
        method: "POST", headers: cabMp(), body: JSON.stringify(cuerpoMp) });
      const j = (await r.json()) as Record<string, unknown>;
      const ar = (j.auto_recurring ?? {}) as Record<string, unknown>;
      log_seguro("plan_creado", { http: r.status, aceptado: r.ok });
      return NextResponse.json({
        ok: r.ok, http: r.status, request_transport: "native_fetch",
        request_body_enviado: cuerpoMp,
        provider_request_id: trazasDe(r.headers),
        plan: r.ok ? {
          preapproval_plan_id: j.id ?? null, status: j.status ?? null,
          reason: j.reason ?? null,
          transaction_amount: ar.transaction_amount ?? null,
          currency_id: ar.currency_id ?? null,
          frequency: ar.frequency ?? null, frequency_type: ar.frequency_type ?? null,
          date_created: j.date_created ?? null,
          init_point: j.init_point ?? null,
        } : { message: j.message ?? null, error: j.error ?? null, cause: j.cause ?? null },
      });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  /**
   * Las FACTURAS de una suscripción. Es el endpoint que corresponde a una
   * suscripción recurrente, y se filtra por su identificador —que siempre
   * existe—, no por una referencia externa que puede no existir.
   */
  const facturasDe = async (preapprovalId: string) => {
    const r = await fetch(
      "https://api.mercadopago.com/authorized_payments/search"
      + `?preapproval_id=${encodeURIComponent(preapprovalId)}`,
      { headers: cabMp() });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      // El cuerpo del error se DEVUELVE. Descartarlo fue justo lo que convirtió
      // un «preguntaste mal» en un «no hubo cobro».
      return { http: r.status, total: 0, results: [],
        error: { message: j.message ?? null, error: j.error ?? null,
                 cause: j.cause ?? null } };
    }
    const filas = Array.isArray(j.results) ? (j.results as Record<string, unknown>[]) : [];
    return {
      http: r.status,
      total: (j.paging as Record<string, unknown> | undefined)?.total ?? filas.length,
      results: filas.map((f) => {
        const pago = (f.payment ?? {}) as Record<string, unknown>;
        return {
          id: f.id ?? null, preapproval_id: f.preapproval_id ?? null,
          status: f.status ?? null,
          transaction_amount: f.transaction_amount ?? null,
          currency_id: f.currency_id ?? null,
          debit_date: f.debit_date ?? null,
          date_created: f.date_created ?? null,
          payment: { id: pago.id ?? null, status: pago.status ?? null,
                     status_detail: pago.status_detail ?? null },
        };
      }),
    };
  };

  /** El pago, leído en su propio recurso. La prueba financiera final. */
  const pagoDe = async (pagoId: string) => {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(pagoId)}`,
      { headers: cabMp() });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      return { http: r.status, error: { message: j.message ?? null, error: j.error ?? null } };
    }
    return { http: r.status, payment: {
      id: j.id ?? null, status: j.status ?? null, status_detail: j.status_detail ?? null,
      transaction_amount: j.transaction_amount ?? null,
      currency_id: j.currency_id ?? null,
      date_created: j.date_created ?? null, date_approved: j.date_approved ?? null } };
  };

  // --- 1 bis · MP-PLAN-02 · ¿existe el plan ANUAL? -------------------------
  //
  // Ya se demostró que un `preapproval` suelto acepta y preserva 12 meses. Un
  // `preapproval_plan` es OTRO objeto, con su propio validador, y el camino de
  // Producción va a ser por plan. Dar por hecho que se comporta igual sería
  // repetir el error de fiarse del código de estado.
  //
  // No hace falta checkout ni cobro: basta crear y volver a leer.
  if (accion === "plan_create_annual") {
    const sitio = new URL(request.url).origin;
    const cuerpoMp = {
      reason: "Trazaloop Full Annual QA · MP-PLAN-02",
      auto_recurring: {
        frequency: 12, frequency_type: "months",
        transaction_amount: PLAN01.amount, currency_id: PLAN01.currency,
      },
      back_url: `${sitio.replace(/\/$/, "")}/billing/return`,
    };
    try {
      const r = await fetch("https://api.mercadopago.com/preapproval_plan", {
        method: "POST", headers: cabMp(), body: JSON.stringify(cuerpoMp) });
      const j = (await r.json()) as Record<string, unknown>;
      const ar = (j.auto_recurring ?? {}) as Record<string, unknown>;
      log_seguro("plan_anual_creado", { http: r.status, aceptado: r.ok,
        devuelto: `${ar.frequency}/${ar.frequency_type}` });
      return NextResponse.json({
        ok: r.ok, http: r.status, request_transport: "native_fetch",
        request_body_enviado: cuerpoMp,
        provider_request_id: trazasDe(r.headers),
        plan: r.ok ? {
          preapproval_plan_id: j.id ?? null, status: j.status ?? null,
          reason: j.reason ?? null, auto_recurring: ar,
          date_created: j.date_created ?? null, init_point: j.init_point ?? null,
        } : { message: j.message ?? null, error: j.error ?? null, cause: j.cause ?? null },
        // El veredicto se lee de lo DEVUELTO, nunca del 201.
        veredicto: r.ok
          ? (ar.frequency === 12 && ar.frequency_type === "months"
            ? "ACEPTA_Y_PRESERVA_12_MESES"
            : `NORMALIZO_A_${ar.frequency}_${ar.frequency_type}`)
          : "RECHAZADO",
      });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  // --- 1 ter · releer un plan, sin tocarlo ---------------------------------
  if (accion === "plan_get") {
    const planId = String(cuerpo.preapproval_plan_id ?? "");
    if (!/^[a-f0-9]{16,64}$/i.test(planId)) return no("PREAPPROVAL_PLAN_ID_INVALID", 400);
    try {
      const r = await fetch(
        `https://api.mercadopago.com/preapproval_plan/${encodeURIComponent(planId)}`,
        { headers: cabMp() });
      const j = (await r.json()) as Record<string, unknown>;
      const ar = (j.auto_recurring ?? {}) as Record<string, unknown>;
      return NextResponse.json({ ok: r.ok, http: r.status,
        plan: r.ok ? { preapproval_plan_id: j.id ?? null, status: j.status ?? null,
          reason: j.reason ?? null, auto_recurring: ar,
          date_created: j.date_created ?? null }
          : { message: j.message ?? null, error: j.error ?? null },
        preserva_12_meses: ar.frequency === 12 && ar.frequency_type === "months" });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  // --- 2 · encontrar la suscripción que creó el checkout -------------------
  //
  // El identificador NO lo elegimos nosotros: lo crea Mercado Pago cuando el
  // pagador autoriza por el enlace del plan. Así que se busca, y se busca por
  // el plan, que es exclusivo de este experimento. Suponer el identificador
  // sería inventarse la mitad de la evidencia.
  if (accion === "probe_plan_state") {
    const id = String(cuerpo.preapproval_id ?? "");
    const planId = String(cuerpo.preapproval_plan_id ?? "");
    try {
      let j: Record<string, unknown> | null = null;
      let http = 0;
      let candidatas = 1;
      let porBusqueda = false;

      if (/^[a-f0-9]{16,64}$/i.test(id)) {
        const r = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`,
          { headers: cabMp() });
        http = r.status;
        j = (await r.json()) as Record<string, unknown>;
        if (!r.ok) return NextResponse.json({ ok: false, http, message: j.message ?? null });
      } else if (/^[a-f0-9]{16,64}$/i.test(planId)) {
        porBusqueda = true;
        const r = await fetch(
          "https://api.mercadopago.com/preapproval/search"
          + `?preapproval_plan_id=${encodeURIComponent(planId)}`, { headers: cabMp() });
        http = r.status;
        const b = (await r.json()) as Record<string, unknown>;
        const filas = Array.isArray(b.results) ? (b.results as Record<string, unknown>[]) : [];
        candidatas = filas.length;
        if (candidatas === 0) {
          return NextResponse.json({ ok: false, http,
            error: "SIN_SUSCRIPCIONES_PARA_ESE_PLAN",
            explicacion: "El plan existe pero todavía no hay ninguna suscripción: "
              + "nadie ha completado el checkout, o aún no se ha propagado.",
            candidatas: 0 });
        }
        // El plan es exclusivo del experimento: más de una candidata significa
        // que la autorización se hizo dos veces, y elegir una al azar sería
        // decidir por sorteo cuál es la evidencia.
        if (candidatas > 1) {
          return NextResponse.json({ ok: false, http,
            error: "MAS_DE_UNA_SUSCRIPCION_PARA_UN_PLAN_EXCLUSIVO",
            candidatas,
            resumen: filas.map((f) => ({ id: f.id ?? null, status: f.status ?? null,
              date_created: f.date_created ?? null })) });
        }
        j = filas[0];
      } else {
        return no("SE_NECESITA_PREAPPROVAL_ID_O_PLAN_ID", 400);
      }

      const estado = estadoDe(j);
      const pagos = await pagosDe(String(estado.external_reference ?? ""));
      // La observación que SÍ corresponde a una suscripción: sus facturas.
      const facturas = await facturasDe(String(estado.id ?? ""));
      const conPago = facturas.results.find(
        (f) => (f.payment as Record<string, unknown>)?.id) ?? null;
      const detallePago = conPago
        ? await pagoDe(String((conPago.payment as Record<string, unknown>).id))
        : null;
      const resumen = (estado.summarized ?? {}) as Record<string, unknown>;
      const pagoFinal = (detallePago && "payment" in detallePago
        ? (detallePago.payment as Record<string, unknown>) : null);
      return NextResponse.json({ ok: true, http, leido_en: new Date().toISOString(),
        authorized_payments: facturas,
        payment_detail: detallePago,
        encontrada_por: porBusqueda ? "busqueda_por_plan" : "id_directo",
        candidatas,
        // Lo que el encargo pide, con sus nombres.
        subscription_id: estado.id,
        preapproval_plan_id: estado.preapproval_plan_id,
        payer_id: estado.payer_id,
        state: estado, payments: pagos,
        verificaciones: {
          // El criterio obligatorio: la suscripción tiene que ser DE ese plan.
          plan_coincide: planId
            ? String(estado.preapproval_plan_id ?? "") === planId
            : "no se pidió comprobar (se buscó por id directo)",
          esta_autorizada: estado.status === "authorized",
          importe_es_5000: Number(estado.transaction_amount) === PLAN01.amount,
          moneda_es_cop: estado.currency_id === PLAN01.currency,
          ciclo_es_1_mes: estado.frequency === 1 && estado.frequency_type === "months",
          // Cuatro afirmaciones SEPARADAS. Mezclarlas fue lo que permitió leer
          // un 400 de una consulta mal formada como «no hubo cobro».
          subscription_reports_charge:
            Number(resumen.charged_quantity ?? 0) >= 1
            && Number(resumen.charged_amount ?? 0) === PLAN01.amount,
          authorized_payment_found: Number(facturas.total) >= 1,
          first_payment_approved: pagoFinal?.status === "approved",
          first_payment_is_5000_cop: Boolean(pagoFinal)
            && Number(pagoFinal!.transaction_amount) === PLAN01.amount
            && pagoFinal!.currency_id === PLAN01.currency,
          // El camino viejo se conserva, pero etiquetado como lo que es.
          busqueda_por_referencia_externa_aplica: Boolean(estado.external_reference),
        } });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  // --- 4 · cancelar la que SÍ tiene plan -----------------------------------
  //
  // DÓNDE ESTAMOS
  //
  // Con `{"status":"canceled"}` el proveedor contestó «Invalid preapproval
  // status param: canceled». Es un error DISTINTO y mucho mejor que el
  // anterior: ya no habla de un plan que falta —la suscripción lo tiene— sino
  // del valor del estado. Queda una sola variable, y PE-05B2 ya había
  // documentado que Mercado Pago usa las dos grafías según qué página se mire.
  //
  // Por eso la grafía es un parámetro de lista cerrada y quien llama la declara:
  // en una prueba que existe para decidir entre dos valores, esconder cuál se
  // manda sería esconder el experimento.
  //
  // El body sigue teniendo UNA sola clave. Nada más cambia.
  if (accion === "plan_cancel_raw") {
    const id = String(cuerpo.preapproval_id ?? "");
    if (!/^[a-f0-9]{16,64}$/i.test(id)) return no("PREAPPROVAL_ID_INVALID", 400);
    const grafia = cuerpo.status_spelling === "canceled" ? "canceled" : "cancelled";
    const url = `https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`;
    try {
      // --- ANTES ---------------------------------------------------------
      const r0 = await fetch(url, { headers: cabMp() });
      const j0 = (await r0.json()) as Record<string, unknown>;
      if (!r0.ok) return NextResponse.json({ ok: false, fase: "antes", http: r0.status,
        message: j0.message ?? null });
      const antes = estadoDe(j0);
      // Por SUSCRIPCIÓN, nunca por referencia externa: esa consulta no aplica a
      // una suscripción creada por el checkout de un plan.
      const facturasAntes = await facturasDe(id);
      const conPagoAntes = facturasAntes.results.find(
        (f) => (f.payment as Record<string, unknown>)?.id) ?? null;
      const pagoAntes = conPagoAntes
        ? await pagoDe(String((conPagoAntes.payment as Record<string, unknown>).id))
        : null;

      // --- EL CAMBIO -----------------------------------------------------
      const cuerpoPut: Record<string, unknown> = { status: grafia };
      const r1 = await fetch(url, { method: "PUT", headers: cabMp(),
        body: JSON.stringify(cuerpoPut) });
      const j1 = (await r1.json().catch(() => ({}))) as Record<string, unknown>;
      const aceptado = r1.status >= 200 && r1.status < 300;

      // --- DESPUÉS -------------------------------------------------------
      const r2 = await fetch(url, { headers: cabMp() });
      const j2 = (await r2.json()) as Record<string, unknown>;
      const despues = estadoDe(j2);
      const facturasDespues = await facturasDe(id);
      const conPagoDespues = facturasDespues.results.find(
        (f) => (f.payment as Record<string, unknown>)?.id) ?? null;
      const pagoDespues = conPagoDespues
        ? await pagoDe(String((conPagoDespues.payment as Record<string, unknown>).id))
        : null;

      const idsAntes = new Set(facturasAntes.results.map((f) => String(f.id)));
      const nuevas = facturasDespues.results.filter((f) => !idsAntes.has(String(f.id)));

      log_seguro("cancelacion_con_plan", { http: r1.status, grafia,
        estado_despues: despues.status, facturas_nuevas: nuevas.length });

      return NextResponse.json({
        ok: aceptado, request_transport: "native_fetch", sdk_used_for_put: false,
        request_url: url,
        request_body_enviado: cuerpoPut,
        claves_enviadas: Object.keys(cuerpoPut).sort(),
        grafia_enviada: grafia,
        provider_http: r1.status,
        provider_response: aceptado
          ? { status: j1.status ?? null, id: j1.id ?? null }
          : { message: j1.message ?? null, error: j1.error ?? null,
              cause: j1.cause ?? null },
        provider_request_id: trazasDe(r1.headers),
        state_before: antes,
        state_after: despues,
        authorized_payments_before: facturasAntes,
        authorized_payments_after: facturasDespues,
        payment_detail_before: pagoAntes,
        payment_detail_after: pagoDespues,
        veredicto: {
          put_aceptado: aceptado,
          // Se registra la grafía TAL CUAL la devuelve el proveedor, que es el
          // dato que zanja la duda de la documentación.
          estado_devuelto_por_el_proveedor: despues.status,
          cancelada: aceptado
            && (despues.status === "cancelled" || despues.status === "canceled"),
          facturas_nuevas: nuevas.length,
          // Cancelar no puede reescribir lo ya cobrado.
          facturas_historicas_intactas:
            JSON.stringify(facturasAntes.results) === JSON.stringify(
              facturasDespues.results.filter((f) => idsAntes.has(String(f.id)))),
        },
      });
    } catch (e) {
      return NextResponse.json({ ok: false, request_transport: "native_fetch",
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  const admin = createAdminClient();
  const sitio = new URL(request.url).origin;
  const volver = `${sitio.replace(/\/$/, "")}/billing/return`;

  // -------------------------------------------------------------------------
  // prepare · la empresa sintética, su tasa de QA y el presupuesto
  // -------------------------------------------------------------------------
  if (accion === "prepare") {
    void compradorConfigurado;
    const plan = cuerpo.plan === "extra" ? "extra" : "full";
    const intervalo = cuerpo.interval === "annual" ? "annual" : "monthly";

    // --- La tasa sintética -------------------------------------------------
    // Se marca de forma que no se pueda confundir con verdad comercial, y se
    // deja escrito que 4 000 no es una tasa real ni actual.
    //
    // MP-SBX-02B · Antes esto solo reconocía su PROPIA marca, así que al
    // encontrarse la tasa canónica de TEST-HYGIENE-03 —que es igual de
    // sintética y con la misma economía— intentaba abrir una segunda y 0182 lo
    // paraba con FX_RATE_OVERLAPS, como debe. La identidad de fixture vive
    // ahora en un solo sitio y la comparten las dos partes.
    const { data: tasas, error: eLeer } = await admin.from("commercial_fx_rates")
      .select("id, note, status, effective_to, rate_micros")
      .eq("base_currency", QA_FX_BASE).eq("quote_currency", QA_FX_QUOTE);
    if (eLeer) return no(`FX_READ_FAILED:${eLeer.message}`, 500);
    const decision = decideQaFxFixture((tasas ?? []) as QaFxRow[]);
    // Ante la duda no se adopta nada y no se crea nada: adivinar aquí sería
    // tratar un precio real como si fuera un fixture.
    if (decision.kind === "abort") return no(decision.reason, 409);
    if (decision.kind === "seed") {
      const { error } = await admin.from("commercial_fx_rates").insert({
        base_currency: QA_FX_BASE, quote_currency: QA_FX_QUOTE, rate_micros: QA_FX_MICROS,
        effective_from: new Date(Date.now() - 3_600_000).toISOString(),
        note: `${QA_FX_LEGACY_MARKER} · PE-05B2 · 4000 COP/USD no es una `
            + "tasa real ni actual: existe solo para poder presupuestar en el sandbox.",
      });
      if (error) return no(`FX_SEED_FAILED:${error.message}`, 500);
    }

    // --- La empresa sintética y su administrador de QA ----------------------
    // Primero la EMPRESA: si ya existe, ella misma dice quién es su persona de
    // QA en `created_by`. Buscar por correo en la API administrativa no filtra
    // —solo pagina— y en un entorno con cientos de personas es poco fiable.
    const { data: existentes } = await admin.from("organizations")
      .select("id, created_by").ilike("name", "QA-PE05B2-MERCADOPAGO%");
    const fila = (existentes ?? [])[0] as { id: string; created_by: string | null } | undefined;
    let org = fila?.id ?? null;
    let uid = fila?.created_by ?? null;

    const correoAdmin = "qa-pe05b2-admin@test.trazaloop.dev";
    // Contraseña de un solo uso, viva solo dentro de esta petición. No se
    // guarda, no se registra y no sale en la respuesta.
    const clave = `QA-${randomUUID()}`;

    if (!uid) {
      const { data: nuevo, error } = await admin.auth.admin.createUser({
        email: correoAdmin, password: clave, email_confirm: true,
        user_metadata: { full_name: "QA PE-05B2" } });
      if (error || !nuevo.user) return no(`QA_USER_FAILED:${error?.message}`, 500);
      uid = nuevo.user.id;
    } else {
      const { error } = await admin.auth.admin.updateUserById(uid, { password: clave });
      if (error) return no(`QA_USER_PASSWORD_FAILED:${error.message}`, 500);
    }

    // El contacto de facturación de la empresa sintética. Es un dato NUESTRO,
    // no del proveedor: nunca sale hacia Mercado Pago. Lleva el dominio de
    // pruebas para que nadie lo confunda con el correo de un cliente.
    const contactoDeFacturacion = "qa-pe05b2-facturacion@test.trazaloop.dev";
    if (!org) {
      const { data: creada, error } = await admin.from("organizations").insert({
        name: "QA-PE05B2-MERCADOPAGO", country: "CO", created_by: uid,
        contact_email: contactoDeFacturacion }).select("id").single();
      if (error || !creada) return no(`QA_ORG_FAILED:${error?.message}`, 500);
      org = (creada as { id: string }).id;
    }
    await admin.from("organizations").update({ contact_email: contactoDeFacturacion }).eq("id", org);
    await admin.from("memberships").upsert(
      { organization_id: org, user_id: uid, role_code: "admin", status: "active" },
      { onConflict: "organization_id,user_id" });
    // Un módulo funcional de verdad, por el camino canónico de provisión.
    await admin.rpc("commercial_provision_new_module",
      { p_organization_id: org, p_module_code: "quality" });

    // --- El presupuesto, con la SESIÓN del administrador de QA --------------
    // No con `service_role`: así las funciones canónicas de B1 se ejercitan
    // exactamente como las ejercitaría una persona, con RLS puesta.
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!anon) return no("ANON_KEY_UNAVAILABLE", 500);
    const comoAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, anon,
      { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: eLogin } = await comoAdmin.auth.signInWithPassword(
      { email: correoAdmin, password: clave });
    if (eLogin) return no(`QA_SIGNIN_FAILED:${eLogin.message}`, 500);
    await comoAdmin.rpc("accept_active_legal_documents",
      { p_ip_address: null, p_user_agent: "pe05b2-smoke" });

    const { data: q, error: eq } = await comoAdmin.rpc("billing_create_quote", {
      p_organization_id: org, p_plan_code: plan, p_billing_interval: intervalo });
    if (eq) return no(`QUOTE_FAILED:${eq.message}`, 500);
    const quote = q as Record<string, unknown>;

    const { data: i, error: ei } = await comoAdmin.rpc("billing_open_checkout_intent", {
      p_quote_id: quote.quote_id, p_provider: "mercadopago", p_environment: "test" });
    if (ei) return no(`INTENT_FAILED:${ei.message}`, 500);

    return NextResponse.json({ ok: true, organization_id: org, quote, intent: i });
  }

  // -------------------------------------------------------------------------
  // create_monthly / create_annual · la llamada real
  // -------------------------------------------------------------------------
  if (accion === "create_monthly" || accion === "create_annual") {
    const intentId = String(cuerpo.intent_id ?? "");
    if (!intentId) return no("INTENT_ID_REQUIRED", 400);
    const { data: fila, error } = await admin.from("billing_checkout_intents")
      .select("id, organization_id, expected_total_amount, expected_currency, billing_interval, plan_code, environment")
      .eq("id", intentId).single();
    if (error || !fila) return no("INTENT_NOT_FOUND", 404);
    const intento = fila as Record<string, unknown>;
    if (intento.environment !== "test") return no("INTENT_IS_NOT_TEST", 424);

    // EL PAGADOR sale de la configuración y se valida ANTES de la red: un
    // correo mal formado tiene que costar un 400 nuestro, no una llamada que
    // vuelve con un mensaje ajeno y confuso. Sin respaldo a nada escrito a
    // mano: si la variable falta, la acción no existe.
    const pagador = resolveConfiguredTestBuyer(process.env.MERCADOPAGO_TEST_BUYER_EMAIL);
    if (!pagador.ok) return no(pagador.reason, 424);

    // EL IMPORTE SALE DEL INTENTO, que lo congeló del presupuesto de B1.
    // No hay ninguna vía por la que el navegador pueda influir en él.
    const intervalo = accion === "create_annual" ? "annual" : "monthly";
    const r = await proveedor.createSubscription({
      externalReference: String(intento.id),
      payerEmail: pagador.email,
      reason: `Trazaloop ${String(intento.plan_code).toUpperCase()} ${intervalo} (QA sandbox)`,
      amountMinor: Number(intento.expected_total_amount),
      currency: String(intento.expected_currency),
      interval: intervalo,
      returnUrl: volver,
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, failure: r.failure, message: r.message,
        detail: (r as { detail?: string | null }).detail ?? null,
        requested: { ...recurrenceFor(intervalo),
                     transaction_amount: Number(intento.expected_total_amount),
                     currency_id: String(intento.expected_currency) } }, { status: 200 });
    }
    // MP-ENV-01 · IDENTIDAD DE LA APLICACIÓN, antes del sello.
    //
    // El proveedor ya creó el objeto cuando llegamos aquí, así que si no es de
    // nuestra aplicación hay que DESHACERLO: dejarlo vivo sería exactamente lo
    // que pasó la vez anterior —una preaprobación autorizada y cobrando bajo
    // otra aplicación, de la que jamás recibiríamos un aviso—. Se cancela por
    // la primitiva del adaptador y se informa de si la compensación funcionó.
    if (!applicationMatches(r.value.applicationId,
                            identidadQa.value.expectedApplicationId)) {
      const deshecho = await proveedor.cancelSubscription(r.value.providerSubscriptionId, false);
      log_seguro("aplicacion_no_coincide", {
        compensado: deshecho.ok, intent: intentId });
      return NextResponse.json({
        ok: false, error: "MP_APPLICATION_MISMATCH",
        expected_application_id: identidadQa.value.expectedApplicationId,
        received_application_id: r.value.applicationId,
        external_object_cancelled: deshecho.ok,
        // Si la compensación falla hay un objeto externo vivo que NO se selló:
        // se dice, no se esconde.
        orphan_external_subscription: deshecho.ok
          ? null : r.value.providerSubscriptionId,
      }, { status: 409 });
    }

    await admin.rpc("billing_attach_provider_subscription", {
      p_intent_id: intentId,
      p_provider_subscription_id: r.value.providerSubscriptionId,
      p_init_point: r.value.initPoint, p_provider_status: r.value.providerStatus,
      p_status: "provider_created", p_synced_amount: r.value.amount,
      p_provider_version: r.value.version, p_next_payment_date: r.value.nextPaymentDate });
    return NextResponse.json({ ok: true, intent_id: intentId,
      payer_fixture: maskBuyerEmail(pagador.email), subscription: r.value });
  }

  // Crear UNA identidad de prueba del sitio MCO. El contrato oficial admite
  // exactamente dos campos —`site_id` y `description`—; no hay `profile`
  // documentado, así que no se manda: inventar un parámetro que la referencia
  // no declara es cómo se acaba con una cuenta que no sirve y sin saber por qué.
  //
  // La respuesta trae contraseña. Viaja por TLS a quien llamó y NO se registra,
  // ni se guarda en la base, ni se escribe en el repositorio.
  if (accion === "create_test_user") {
    try {
      const r = await fetch("https://api.mercadopago.com/users/test", {
        method: "POST",
        headers: { "Content-Type": "application/json",
                   Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
        body: JSON.stringify({ site_id: "MCO",
                               description: "Trazaloop PE-05B2 Test Buyer" }),
      });
      const j = (await r.json()) as Record<string, unknown>;
      log_seguro("usuario_de_prueba", { http: r.status, site_id: j.site_id,
                                        site_status: j.site_status });
      return NextResponse.json({ ok: r.ok, http: r.status, user: j });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  // Leer la identidad de prueba ya creada. La creación no devolvió correo, y
  // el correo NO se construye a ojo a partir del identificador: se pide.
  if (accion === "read_test_user") {
    const id = String(cuerpo.test_user_id ?? "");
    if (!id) return no("TEST_USER_ID_REQUIRED", 400);
    try {
      const r = await fetch(`https://api.mercadopago.com/users/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` } });
      const j = (await r.json()) as Record<string, unknown>;
      log_seguro("lectura_usuario_prueba", { http: r.status, site_id: j.site_id });
      // Solo lo que hace falta para poder pagar y entrar. Nada más de la ficha.
      return NextResponse.json({ ok: r.ok, http: r.status, user: {
        id: j.id ?? null, nickname: j.nickname ?? null, email: j.email ?? null,
        site_id: j.site_id ?? null, status: j.status ?? null,
        user_type: j.user_type ?? null, tags: Array.isArray(j.tags) ? j.tags : null,
      },
      // Solo los NOMBRES de los campos que trae la ficha. Sirve para saber si
      // el correo viene con otro nombre, y no revela ningún valor.
      available_fields: Object.keys(j).sort() });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  // El PAGADOR de pruebas, que NO es la cuenta de prueba.
  //
  // La cuenta Comprador MCO sirve para que una persona inicie sesión y
  // autorice; no tiene correo y no es lo que la API quiere en `payer_email`.
  // Lo que la API quiere es un CLIENTE, y para pruebas su correo tiene un
  // formato documentado: `test_payer_[0-9]{1,10}@testuser.com`.
  //
  // Se BUSCA antes de crear: un reintento, una caída o una respuesta perdida no
  // pueden dejar dos clientes con el mismo correo.
  if (accion === "ensure_test_payer") {
    const correo = String(cuerpo.email ?? "");
    if (!/^test_payer_[0-9]{1,10}@testuser\.com$/.test(correo)) {
      return no("TEST_PAYER_EMAIL_FORMAT_INVALID", 400);
    }
    const cab = { "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` };
    try {
      const b = await fetch(
        `https://api.mercadopago.com/v1/customers/search?email=${encodeURIComponent(correo)}`,
        { headers: cab });
      const bj = (await b.json()) as Record<string, unknown>;
      // Si la BÚSQUEDA falla no se puede concluir «no existe»: se dice que no
      // se pudo mirar. Crear tras una búsqueda que no respondió es como crear
      // sin mirar, y así se acaba con dos clientes iguales.
      if (!b.ok) {
        return NextResponse.json({ ok: false, stage: "search", http: b.status,
          error: bj.message ?? bj.error ?? null });
      }
      const encontrados = Array.isArray(bj.results) ? (bj.results as Record<string, unknown>[]) : [];
      if (encontrados.length > 0) {
        const c = encontrados[0];
        log_seguro("cliente_de_prueba", { reutilizado: true, live_mode: c.live_mode });
        return NextResponse.json({ ok: true, reused: true,
          customer: { id: c.id ?? null, live_mode: c.live_mode ?? null } });
      }
      // Solo el correo. Ningún dato personal: no hay persona detrás de esto.
      const r = await fetch("https://api.mercadopago.com/v1/customers", {
        method: "POST", headers: cab, body: JSON.stringify({ email: correo }) });
      const j = (await r.json()) as Record<string, unknown>;
      log_seguro("cliente_de_prueba", { reutilizado: false, http: r.status,
                                        live_mode: j.live_mode });
      return NextResponse.json({ ok: r.ok, stage: "create", http: r.status, reused: false,
        customer: { id: j.id ?? null, live_mode: j.live_mode ?? null },
        error: r.ok ? null : (j.message ?? j.error ?? null) });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  // Forense del 401 de Clientes. GET y POST, uno detrás de otro, en la MISMA
  // petición, con el MISMO objeto de cabeceras y el MISMO origen de credencial:
  // así «usan el mismo token» no es una afirmación, es una consecuencia de que
  // no hay dos sitios donde construirlo.
  //
  // Se captura el cuerpo de error ENTERO, no un resumen, porque un «access
  // denied» sin `cause` no dice si falta un permiso, una capacidad o un
  // producto. Antes de devolverlo se tapan las direcciones de correo por si el
  // proveedor devuelve alguna que no sea la nuestra.
  if (accion === "customer_forensics") {
    const correo = String(cuerpo.email ?? "");
    if (!/^test_payer_[0-9]{1,10}@testuser\.com$/.test(correo)) {
      return no("TEST_PAYER_EMAIL_FORMAT_INVALID", 400);
    }
    const cab = { "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` };
    const nombresDeCabecera = Object.keys(cab).sort();
    const CABECERAS_SEGURAS = ["x-request-id", "x-caller-id", "x-caller-scopes",
                               "www-authenticate", "content-type", "date"];
    const seguras = (h: Headers) => {
      const salida: Record<string, string> = {};
      for (const k of CABECERAS_SEGURAS) { const v = h.get(k); if (v) salida[k] = v; }
      return salida;
    };
    const taparCorreos = (x: unknown): unknown =>
      JSON.parse(JSON.stringify(x ?? null)
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, "<correo-tapado>"));

    try {
      const url = `https://api.mercadopago.com/v1/customers/search?email=${encodeURIComponent(correo)}`;
      const g = await fetch(url, { method: "GET", headers: cab });
      const gj = (await g.json()) as Record<string, unknown>;
      const gResultados = Array.isArray(gj.results) ? (gj.results as unknown[]).length : null;

      // Si ya existe, NO se crea otro. Se dice y se para.
      if (g.ok && (gResultados ?? 0) > 0) {
        return NextResponse.json({ ok: true, already_exists: true,
          get: { status: g.status, results: gResultados } });
      }

      const p = await fetch("https://api.mercadopago.com/v1/customers", {
        method: "POST", headers: cab, body: JSON.stringify({ email: correo }) });
      const pj = (await p.json()) as Record<string, unknown>;

      return NextResponse.json({
        ok: true,
        same_runtime: true,
        same_credential_source: true,
        same_header_object: true,
        authorization_present: { get: true, post: true },
        authorization_scheme: "Bearer",
        request_header_names: nombresDeCabecera,
        transport: "fetch (ambos)",
        get: { method: "GET", url_path: "/v1/customers/search", status: g.status,
               results: gResultados, headers: seguras(g.headers),
               body: taparCorreos(gj) },
        post: { method: "POST", url_path: "/v1/customers", status: p.status,
                content_type: "application/json", body_fields: ["email"],
                headers: seguras(p.headers), body: taparCorreos(pj) },
      });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  // El SITIO de la cuenta vendedora. «Payer is associated with a different
  // site» puede significar dos cosas muy distintas —comprador de otro país, o
  // vendedor que no es de Colombia— y la persona tiene que hacer cosas
  // distintas en cada caso. Se leen solo metadatos del sitio: ni correo, ni
  // nombre, ni nada de una persona.
  if (accion === "site") {
    try {
      const r = await fetch("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
      });
      const j = (await r.json()) as Record<string, unknown>;
      return NextResponse.json({
        ok: r.ok, http: r.status,
        site_id: j.site_id ?? null,
        country_id: j.country_id ?? null,
        user_type: j.user_type ?? null,
        // `tags` dice si la cuenta es de prueba, que es lo que hace falta.
        // NADA más: `/users/me` devuelve además teléfono y correo del titular,
        // y eso no tiene por qué salir de ahí para responder «¿de qué país es
        // esta cuenta?». La primera versión los arrastró; esta no.
        tags: Array.isArray(j.tags) ? j.tags : null,
      });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  // Reconciliar antes que duplicar: pregunta al proveedor qué existe ya.
  if (accion === "search") {
    const ref = cuerpo.external_reference ? String(cuerpo.external_reference) : undefined;
    const r = await proveedor.searchSubscriptions(ref);
    return NextResponse.json(r.ok ? { ok: true, ...r.value }
      : { ok: false, failure: r.failure, message: r.message,
          detail: (r as { detail?: string | null }).detail ?? null });
  }

  if (accion === "get") {
    const id = String(cuerpo.provider_subscription_id ?? "");
    if (!id) return no("PROVIDER_SUBSCRIPTION_ID_REQUIRED", 400);
    const r = await proveedor.getSubscriptionDetail(id);
    return NextResponse.json(r.ok ? { ok: true, subscription: r.value }
      : { ok: false, failure: r.failure, message: r.message,
          detail: (r as { detail?: string | null }).detail ?? null });
  }

  // -------------------------------------------------------------------------
  // update_amount · el importe nuevo se DERIVA, no llega
  // -------------------------------------------------------------------------
  if (accion === "update_amount") {
    const id = String(cuerpo.provider_subscription_id ?? "");
    const intentId = String(cuerpo.intent_id ?? "");
    if (!id || !intentId) return no("IDS_REQUIRED", 400);
    const { data: fila } = await admin.from("billing_checkout_intents")
      .select("quote_id, expected_currency").eq("id", intentId).single();
    if (!fila) return no("INTENT_NOT_FOUND", 404);
    const { data: q } = await admin.from("billing_quotes")
      .select("base_amount, total_amount").eq("id", (fila as Record<string, string>).quote_id).single();
    if (!q) return no("QUOTE_NOT_FOUND", 404);
    // El importe de prueba es la BASE SIN IMPUESTO del mismo presupuesto: es
    // exactamente la forma que tendría una exención futura, así que la prueba
    // de capacidad responde a la pregunta que de verdad importa. Y sale del
    // servidor: el navegador no manda ninguna cifra.
    const nuevo = Number((q as Record<string, number>).base_amount);
    const r = await proveedor.updateRecurringAmount(
      id, nuevo, String((fila as Record<string, string>).expected_currency));
    return NextResponse.json(r.ok
      ? { ok: true, before: Number((q as Record<string, number>).total_amount),
          requested: nuevo, after: r.value }
      : { ok: false, failure: r.failure, message: r.message,
          detail: (r as { detail?: string | null }).detail ?? null, requested: nuevo });
  }

  if (accion === "cancel") {
    const id = String(cuerpo.provider_subscription_id ?? "");
    if (!id) return no("PROVIDER_SUBSCRIPTION_ID_REQUIRED", 400);
    const r = await proveedor.cancelSubscription(id, false);
    return NextResponse.json(r.ok ? { ok: true, status: r.value.status }
      : { ok: false, failure: r.failure, message: r.message,
          detail: (r as { detail?: string | null }).detail ?? null });
  }

  return no("ACTION_UNHANDLED", 400);
}
