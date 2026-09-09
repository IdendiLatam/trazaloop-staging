import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
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
const QA_MARCADOR = "MPSBX01-2026-09-09-cancel_raw";

// QA_TRIGGER_IS_TEMPORARY · se retira en el cierre de PE-05B2.
// Ver PE_05B2_SANDBOX_TESTS.md. Un fichero de ruta de Next.js solo puede
// exportar sus manejadores y su configuración, así que la marca vive aquí.

const ACCIONES = ["preflight", "prepare", "create_monthly", "create_annual",
                  "get", "search", "site", "create_test_user", "read_test_user", "ensure_test_payer",
                  "retire_qa_fx", "customer_forensics", "update_amount", "cancel",
                  "probe_payer_email", "probe_annual", "probe_daily", "probe_state",
                  "probe_amount_change", "cancel_min", "cancel_raw", "authprobe",
                  "qa_version"] as const;
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
    const sinteticas = ((tasas ?? []) as Record<string, unknown>[])
      .filter((t) => String(t.note ?? "").includes("QA-SYNTHETIC-NOT-FOR-PRODUCTION"));
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
    : { environment: "live" as const, siteId: null, countryId: null,
        isTestUser: false, reachable: false };

  // Qué versión del disparador responde aquí. No llama a Mercado Pago, no toca
  // la base y no devuelve ningún secreto: solo el marcador, la identidad del
  // despliegue que Vercel ya publica, y qué acciones admite.
  if (accion === "qa_version") {
    return NextResponse.json({
      ok: true,
      commit_or_marker: QA_MARCADOR,
      // Si el despliegue trae metadatos de Git, se dicen; si no, se dice que no.
      git_commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      git_commit_ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      deployment_url: process.env.VERCEL_URL ?? null,
      vercel_environment: entornoVercel,
      // Derivado del catálogo: no puede mentir sobre lo que la ruta admite.
      acciones_disponibles: [...ACCIONES].sort(),
      cancel_min_available: (ACCIONES as readonly string[]).includes("cancel_min"),
      cancel_raw_available: (ACCIONES as readonly string[]).includes("cancel_raw"),
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
      access_token_environment: duenno.environment,
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
  if (duenno.environment !== "test" || !duenno.isTestUser) {
    return no("MERCADOPAGO_CREDENTIAL_OWNER_IS_NOT_TEST_USER", 424);
  }
  // EL PAGADOR DEL FLUJO PENDIENTE.
  //
  // Es el valor que la documentación oficial usa en el ejemplo de «suscripción
  // sin plan asociado con pago pendiente», y no es la identidad de nadie: ni
  // contacto de facturación, ni cuenta de Mercado Pago, ni el comprador de
  // prueba. La persona real entra después, abriendo el enlace de autorización
  // con sus credenciales.
  //
  // Vive aquí, dentro del disparador de QA, y no en una variable de entorno:
  // una variable invitaría a confundirlo con un dato comercial.
  const PAGADOR_QA_DOCUMENTADO = "test_payer@example.com";
  const comprador = PAGADOR_QA_DOCUMENTADO;
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
    const formas: Array<{ nombre: string; patron: RegExp }> = [
      { nombre: "test_user_<numero>@testuser.com", patron: /^test_user_[0-9]{1,25}@testuser\.com$/ },
      { nombre: "test_payer_<numero>@testuser.com", patron: /^test_payer_[0-9]{1,25}@testuser\.com$/ },
    ];
    const forma = formas.find((f) => f.patron.test(correo));
    if (!forma) return no("PAYER_EMAIL_FORM_NOT_ALLOWED", 400);

    const IMPORTE_SONDA = 5000;      // COP. Constante del experimento.
    const MONEDA_SONDA = "COP";
    const referencia = `WCS-49142-probe-${randomUUID()}`;
    // La URL de vuelta se calcula AQUÍ: esta acción no depende de nada que se
    // prepare más abajo, y así se puede mover sin romperla.
    const sitioSonda = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trazaloop.com";
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
    if (!/^test_user_[0-9]{1,25}@testuser\.com$/.test(correo)) {
      return no("PAYER_EMAIL_FORM_NOT_ALLOWED", 400);
    }
    const IMPORTE_SONDA = 5000;      // COP. Constante del experimento.
    const MONEDA_SONDA = "COP";
    const referencia = `WCS-49142-annual-12m-${randomUUID()}`;
    const sitioSonda = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trazaloop.com";
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
    if (!/^test_user_[0-9]{1,25}@testuser\.com$/.test(correo)) {
      return no("PAYER_EMAIL_FORM_NOT_ALLOWED", 400);
    }
    const caso = leerCaso(cuerpo.case);
    if (!caso) return no("CASE_MUST_BE_UP_OR_DOWN", 400);

    const referencia = `WCS-49142-01C-${caso.toUpperCase()}-${randomUUID()}`;
    const sitioSonda = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trazaloop.com";
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

  const admin = createAdminClient();
  const sitio = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trazaloop.com";
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
    const { data: tasas } = await admin.from("commercial_fx_rates")
      .select("id, note, status, effective_to")
      .eq("base_currency", "USD").eq("quote_currency", "COP");
    // Vigente = activa y sin cerrar. Una retirada NO se reabre reescribiéndola:
    // se abre una vigencia nueva y la anterior se queda como historia.
    const yaHay = ((tasas ?? []) as Record<string, unknown>[])
      .some((t) => String(t.note ?? "").includes("QA-SYNTHETIC-NOT-FOR-PRODUCTION")
        && t.status === "active" && !t.effective_to);
    if (!yaHay) {
      const { error } = await admin.from("commercial_fx_rates").insert({
        base_currency: "USD", quote_currency: "COP", rate_micros: 4_000_000_000,
        effective_from: new Date(Date.now() - 3_600_000).toISOString(),
        note: "QA-SYNTHETIC-NOT-FOR-PRODUCTION · PE-05B2 · 4000 COP/USD no es una "
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

    if (!org) {
      const { data: creada, error } = await admin.from("organizations").insert({
        name: "QA-PE05B2-MERCADOPAGO", country: "CO", created_by: uid,
        contact_email: comprador }).select("id").single();
      if (error || !creada) return no(`QA_ORG_FAILED:${error?.message}`, 500);
      org = (creada as { id: string }).id;
    }
    await admin.from("organizations").update({ contact_email: comprador }).eq("id", org);
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

    // EL IMPORTE SALE DEL INTENTO, que lo congeló del presupuesto de B1.
    // No hay ninguna vía por la que el navegador pueda influir en él.
    const intervalo = accion === "create_annual" ? "annual" : "monthly";
    const r = await proveedor.createSubscription({
      externalReference: String(intento.id),
      payerEmail: comprador,
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
    await admin.rpc("billing_attach_provider_subscription", {
      p_intent_id: intentId,
      p_provider_subscription_id: r.value.providerSubscriptionId,
      p_init_point: r.value.initPoint, p_provider_status: r.value.providerStatus,
      p_status: "provider_created", p_synced_amount: r.value.amount,
      p_provider_version: r.value.version, p_next_payment_date: r.value.nextPaymentDate });
    return NextResponse.json({ ok: true, intent_id: intentId,
      payer_fixture: PAGADOR_QA_DOCUMENTADO, subscription: r.value });
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
