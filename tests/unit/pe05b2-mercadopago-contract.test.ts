/**
 * Trazaloop · PE-05B2 · El contrato con la pasarela, sin llamar a la pasarela.
 *
 * Casi todo lo que puede salir mal en una integración de pagos se puede
 * comprobar sin credenciales: la traducción de estados, la firma, la
 * conciliación de importes, la privacidad del sobre y las ausencias. Esta
 * suite lo hace, y por eso vale igual el día que el sandbox del proveedor esté
 * caído.
 *
 * Lo que NO puede comprobar es que el servidor de Mercado Pago acepte lo que
 * le mandamos. Eso está declarado como pendiente, no como aprobado.
 *
 * Correr: npm run test:pe05b2-contract
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHmac } from "node:crypto";
import {
  MP_TOPICS, isKnownTopic, environmentFromAccessToken, environmentMatches,
  recurrenceFor, mapSubscriptionStatus, mapPaymentStatus, settlementOutcome,
  classifyProviderError, minorToProviderAmount, providerAmountToMinor,
  amountsReconcile, sanitizeEnvelope, envelopeIsClean, readNotification,
  classifyOwnerEnvironment,
} from "../../lib/billing/mercadopago/mapping";
import {
  verifyMercadoPagoSignature, SIGNATURE_TOLERANCE_SECONDS,
} from "../../lib/billing/mercadopago/signature";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const sinComentarios = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");

const RUTA = leer("app/api/billing/webhooks/mercadopago/route.ts");
const ADAPTADOR = leer("lib/billing/providers/mercadopago.ts");
const CAPA = leer("lib/db/billing-provider.ts");
const QA = leer("app/api/billing/qa/mercadopago-smoke/route.ts");
const M171 = leer("supabase/migrations/0171_mercadopago_provider_webhooks.sql");
const SQL171 = sinComentarios(M171);

console.log("\nPE-05B2 · El contrato con la pasarela\n");

// ===========================================================================
console.log("A/B · La suscripción es de la empresa, no de un plan del proveedor");
// ===========================================================================

check("B. No se crea ni se usa NINGÚN plan del proveedor", () => {
  const codigo = sinComentarios(ADAPTADOR);
  assert(!/PreApprovalPlan/.test(codigo), "el adaptador usa planes del proveedor");
  assert(!/preapproval_plan_id\s*:/.test(codigo),
    "la creación manda `preapproval_plan_id`: la suscripción quedaría atada a un plan del proveedor");
  assert(/new PreApproval\(/.test(codigo), "no se usa el recurso de suscripción");
  // Y no hay ni rastro de un catálogo de planes del proveedor.
  for (const inventado of ["full_monthly", "full_annual", "extra_monthly", "extra_annual"]) {
    assert(!new RegExp(inventado, "i").test(codigo + SQL171),
      `aparece un plan del proveedor inventado: ${inventado}`);
  }
});

check("C. Mensual es un mes de intervalo", () => {
  const r = recurrenceFor("monthly");
  assert(r.frequency === 1 && r.frequency_type === "months", JSON.stringify(r));
  // Ni 30 días: el proveedor representa meses de calendario y suponer treinta
  // días desplazaría la fecha de cobro un poco cada mes.
  assert(!/frequency_type:\s*["']days["']/.test(sinComentarios(ADAPTADOR)),
    "en algún sitio se cobra por días");
});

check("D. Anual son DOCE MESES DE INTERVALO · nunca doce cobros mensuales", () => {
  const r = recurrenceFor("annual");
  assert(r.frequency === 12 && r.frequency_type === "months", JSON.stringify(r));
  const codigo = sinComentarios(ADAPTADOR) + sinComentarios(leer("lib/billing/mercadopago/mapping.ts"));
  // La prohibición explícita: nada que repita, cuente hasta doce o programe
  // cargos sueltos para simular un año.
  for (const simulacion of [/repetitions/i, /for\s*\(.{0,40}12/, /Array\.from\(\{\s*length:\s*12/]) {
    assert(!simulacion.test(codigo), `hay una simulación del año: ${simulacion}`);
  }
});

check("E. El importe en pesos es el MISMO entero, sin coma flotante", () => {
  assert(minorToProviderAmount(140_000, "COP") === 140_000, "el peso se transformó");
  let lanzo = false;
  try { minorToProviderAmount(140_000, "USD"); } catch { lanzo = true; }
  assert(lanzo, "aceptó una moneda cuya unidad mínima NO es la unidad");
  lanzo = false;
  try { minorToProviderAmount(140_000.5, "COP"); } catch { lanzo = true; }
  assert(lanzo, "aceptó un importe con decimales");
  assert(providerAmountToMinor(140_000, "COP") === 140_000, "la vuelta no cuadra");
  assert(providerAmountToMinor(140_000.5, "COP") === null, "aceptó un decimal de vuelta");
  assert(providerAmountToMinor(140_000, "USD") === null, "aceptó otra moneda de vuelta");
});

check("F. La referencia externa es opaca · no lleva nada del cliente", () => {
  // Es el `id` del intento: un UUID y nada más. Se comprueba que la migración
  // no compone la referencia con nombre, plan ni importe.
  const i = SQL171.indexOf("function public.billing_open_checkout_intent");
  const cuerpo = SQL171.slice(i, SQL171.indexOf("$$;", i));
  assert(/'external_reference', v_id/.test(cuerpo),
    "la referencia externa no es el identificador del intento");
  for (const filtrado of ["o.name", "legal_name", "plan_code ||", "total_amount ||"]) {
    assert(!cuerpo.includes(filtrado), `la referencia externa lleva «${filtrado}»`);
  }
});

// ===========================================================================
console.log("\nB · Estados del proveedor · traducidos, nunca guardados crudos");
// ===========================================================================

check("K. `authorized` NO es una suscripción activa", () => {
  // Es el punto donde se regalaría el plan: Mercado Pago autoriza antes de
  // cobrar —el primer cargo llega alrededor de una hora después—, así que
  // traducirlo a «activa» daría el plan de pago a quien no ha pagado.
  assert(mapSubscriptionStatus("authorized") === "pending",
    `«authorized» se tradujo a ${mapSubscriptionStatus("authorized")}`);
  assert(mapSubscriptionStatus("pending") === "pending", "pending");
  assert(mapSubscriptionStatus("paused") === "past_due", "paused");
  assert(mapSubscriptionStatus("cancelled") === "ended", "cancelled");
  assert(mapSubscriptionStatus("canceled") === "ended", "la otra grafía no se acepta");
  // Y lo que no se sabe traducir NO se inventa.
  assert(mapSubscriptionStatus("algo_nuevo") === null, "adivinó un estado desconocido");
  assert(mapSubscriptionStatus(null) === null, "adivinó un estado ausente");
});

check("L. Un pago en revisión no es un rechazo", () => {
  assert(mapPaymentStatus("approved") === "approved", "approved");
  assert(mapPaymentStatus("rejected") === "declined", "rejected");
  // `in_process` acaba aprobado a menudo: tratarlo como rechazo dejaría al
  // cliente sin plan habiendo pagado, y encima culpando a su tarjeta.
  assert(mapPaymentStatus("in_process") === "pending", "in_process");
  assert(mapPaymentStatus("pending") === "pending", "pending");
  assert(mapPaymentStatus("in_mediation") === "manual_review", "in_mediation");
  assert(mapPaymentStatus("charged_back") === "manual_review", "charged_back");
  assert(mapPaymentStatus("refunded") === "refunded", "refunded");
  assert(mapPaymentStatus("lo_que_sea") === null, "adivinó un estado desconocido");
});

check("Y solo tres salidas liquidan · el resto espera", () => {
  assert(settlementOutcome("approved") === "approved", "approved");
  assert(settlementOutcome("declined") === "declined", "declined");
  assert(settlementOutcome("failed") === "failed", "failed");
  assert(settlementOutcome("pending") === null, "un pago pendiente liquidó algo");
  assert(settlementOutcome("manual_review") === null, "una revisión liquidó algo");
  assert(settlementOutcome(null) === null, "un estado ilegible liquidó algo");
});

check("El estado crudo del proveedor NO es el estado canónico", () => {
  // Se guarda aparte, en el registro del proveedor, y nunca en la suscripción.
  assert(/provider_status text/.test(SQL171), "no se guarda el estado del proveedor");
  const i = SQL171.indexOf("create table if not exists public.billing_checkout_intents");
  const tabla = SQL171.slice(i, SQL171.indexOf(");", SQL171.indexOf("constraint bci_amount_check", i)));
  assert(/status text not null default 'created'/.test(tabla),
    "el intento no tiene estado canónico propio");
  // Y `billing_subscriptions` no aprende vocabulario del proveedor.
  assert(!/alter table public\.billing_subscriptions/.test(SQL171),
    "0171 le añade columnas del proveedor a la suscripción canónica");
});

// ===========================================================================
console.log("\nC · La firma · lo que separa un cobro de un desconocido");
// ===========================================================================

const SECRETO = "un-secreto-de-prueba-que-no-es-de-nadie";
const firmar = (dataId: string, requestId: string, ts: string, secreto = SECRETO) => {
  const manifiesto = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return createHmac("sha256", secreto).update(manifiesto).digest("hex");
};
const ahora = () => 1_788_000_000_000;
const ts = String(Math.floor(ahora() / 1000));
const DATA_ID = "abc123def456";
const REQ_ID = "11111111-2222-3333-4444-555555555555";

check("M. Una firma válida se acepta", () => {
  const v = verifyMercadoPagoSignature({
    xSignature: `ts=${ts},v1=${firmar(DATA_ID, REQ_ID, ts)}`,
    xRequestId: REQ_ID, dataId: DATA_ID, secret: SECRETO, now: ahora,
  });
  assert(v.verified, `rechazó una firma buena: ${!v.verified && v.reason}`);
});

check("N. Con OTRO secreto se rechaza", () => {
  const v = verifyMercadoPagoSignature({
    xSignature: `ts=${ts},v1=${firmar(DATA_ID, REQ_ID, ts, "otro-secreto")}`,
    xRequestId: REQ_ID, dataId: DATA_ID, secret: SECRETO, now: ahora,
  });
  assert(!v.verified && v.reason === "SignatureMismatch", `dijo ${JSON.stringify(v)}`);
});

check("O. Cambiar `data.id`, `x-request-id`, el sello o la firma la rompe", () => {
  const buena = firmar(DATA_ID, REQ_ID, ts);
  const casos: Array<[string, Parameters<typeof verifyMercadoPagoSignature>[0]]> = [
    ["data.id alterado", { xSignature: `ts=${ts},v1=${buena}`, xRequestId: REQ_ID,
                           dataId: "abc123def457", secret: SECRETO, now: ahora }],
    ["x-request-id alterado", { xSignature: `ts=${ts},v1=${buena}`, xRequestId: "otro",
                                dataId: DATA_ID, secret: SECRETO, now: ahora }],
    ["sello alterado", { xSignature: `ts=${Number(ts) - 1},v1=${buena}`, xRequestId: REQ_ID,
                         dataId: DATA_ID, secret: SECRETO, now: ahora }],
    ["firma alterada", { xSignature: `ts=${ts},v1=${buena.slice(0, -1)}0`, xRequestId: REQ_ID,
                         dataId: DATA_ID, secret: SECRETO, now: ahora }],
  ];
  for (const [nombre, entrada] of casos) {
    const v = verifyMercadoPagoSignature(entrada);
    assert(!v.verified, `«${nombre}» pasó la verificación`);
  }
});

check("Sin cabecera, malformada o sin secreto: tampoco", () => {
  const sinCabecera = verifyMercadoPagoSignature({
    xSignature: null, xRequestId: REQ_ID, dataId: DATA_ID, secret: SECRETO, now: ahora });
  assert(!sinCabecera.verified && sinCabecera.reason === "MissingSignatureHeader",
    JSON.stringify(sinCabecera));
  const rota = verifyMercadoPagoSignature({
    xSignature: "esto-no-es-una-firma", xRequestId: REQ_ID, dataId: DATA_ID,
    secret: SECRETO, now: ahora });
  assert(!rota.verified, "aceptó una cabecera malformada");
  // Sin secreto NO se acepta nada, y se dice con su propia razón: en el
  // registro no puede parecer un ataque lo que es una variable sin poner.
  const sinSecreto = verifyMercadoPagoSignature({
    xSignature: `ts=${ts},v1=${firmar(DATA_ID, REQ_ID, ts)}`,
    xRequestId: REQ_ID, dataId: DATA_ID, secret: undefined, now: ahora });
  assert(!sinSecreto.verified && sinSecreto.reason === "SecretNotConfigured",
    JSON.stringify(sinSecreto));
});

check("Una firma auténtica pero VIEJA se rechaza · reproducción", () => {
  // Autenticar no es autorizar dos veces: sin ventana de tiempo, quien capture
  // una notificación buena puede reenviarla cuando quiera.
  const viejo = String(Math.floor(ahora() / 1000) - SIGNATURE_TOLERANCE_SECONDS - 60);
  const v = verifyMercadoPagoSignature({
    xSignature: `ts=${viejo},v1=${firmar(DATA_ID, REQ_ID, viejo)}`,
    xRequestId: REQ_ID, dataId: DATA_ID, secret: SECRETO, now: ahora });
  assert(!v.verified && v.reason === "TimestampOutOfTolerance", JSON.stringify(v));
  assert(SIGNATURE_TOLERANCE_SECONDS <= 600, `la ventana es de ${SIGNATURE_TOLERANCE_SECONDS} s`);
});

check("El `data.id` con mayúsculas se normaliza antes del manifiesto", () => {
  // Lo pide la documentación y el validador del SDK no lo hace por su cuenta.
  const v = verifyMercadoPagoSignature({
    xSignature: `ts=${ts},v1=${firmar("abcdef", REQ_ID, ts)}`,
    xRequestId: REQ_ID, dataId: "ABCDEF", secret: SECRETO, now: ahora });
  assert(v.verified, "no se normalizó a minúsculas: una entrega legítima se perdería");
});

check("Firma inválida → 401 y CERO efecto", () => {
  const codigo = sinComentarios(RUTA);
  assert(/status:\s*401/.test(codigo), "una firma inválida no responde 401");
  const i = codigo.indexOf("if (!firma.verified)");
  assert(i > -1, "no hay corte por firma inválida");
  // Desde el cuerpo, no desde el principio: importar una función no es
  // llamarla, y medir desde la línea 1 daba un rojo que no era.
  const cuerpo = codigo.slice(codigo.indexOf("export async function POST"));
  const antes = cuerpo.slice(0, cuerpo.indexOf("if (!firma.verified)"));
  assert(i > 0 && antes.length > 0, "no se pudo aislar el cuerpo del manejador");
  for (const efecto of ["settleProviderPayment", "recordRenewalPayment",
                        "markProviderSubscriptionState", "getPaymentDetail"]) {
    assert(!antes.includes(efecto),
      `«${efecto}» se ejecuta ANTES de comprobar la firma`);
  }
});

// ===========================================================================
console.log("\nD · La notificación · leerla sin creérsela");
// ===========================================================================

check("W. Los temas son los que el proveedor manda de verdad", () => {
  for (const t of ["payment", "subscription_preapproval",
                   "subscription_authorized_payment", "subscription_preapproval_plan"]) {
    assert(isKnownTopic(t), `no se reconoce «${t}»`);
  }
  assert(MP_TOPICS.length === 4, `hay ${MP_TOPICS.length} temas declarados`);
});

check("R. Un tema desconocido no tiene efecto", () => {
  assert(!isKnownTopic("inventado_wh"), "reconoció un tema inventado");
  const aviso = readNotification({ type: "inventado_wh", data: { id: "1" } }, new URLSearchParams());
  assert(aviso === null, "una notificación de tema desconocido se dio por buena");
  const codigo = sinComentarios(RUTA);
  assert(/unknown_topic/.test(codigo), "la ruta no clasifica el tema desconocido");
});

check("Se leen las dos formas de notificación del proveedor", () => {
  const cuerpo = readNotification(
    { type: "payment", live_mode: false, data: { id: "1234567890" } }, new URLSearchParams());
  assert(cuerpo?.topic === "payment" && cuerpo.resourceId === "1234567890",
    JSON.stringify(cuerpo));
  const query = readNotification(null, new URLSearchParams("topic=payment&id=987"));
  assert(query?.topic === "payment" && query.resourceId === "987", JSON.stringify(query));
  // Y el identificador se normaliza a minúsculas, como pide la firma.
  const mayus = readNotification(
    { type: "subscription_preapproval", data: { id: "ABCdef" } }, new URLSearchParams());
  assert(mayus?.resourceId === "abcdef", `salió «${mayus?.resourceId}»`);
});

check("Y. Del cuerpo solo se guarda el SOBRE", () => {
  // Un cuerpo real trae más de lo que hace falta. Se guarda lo que identifica
  // el aviso y nada más: la verdad financiera se relee de la API igual.
  const crudo = {
    id: 12345, live_mode: false, type: "payment", action: "payment.updated",
    date_created: "2026-09-02T10:00:00Z", api_version: "v1", user_id: 44444,
    data: { id: "1316956551" },
    payer: { email: "alguien@example.com", identification: { number: "123456" },
             first_name: "Nombre", last_name: "Apellido" },
    card: { last_four_digits: "9876", security_code: "451" },
    token: "un-token-de-tarjeta",
  };
  const sobre = sanitizeEnvelope(crudo);
  assert(envelopeIsClean(sobre), `el sobre lleva datos prohibidos: ${JSON.stringify(sobre)}`);
  const texto = JSON.stringify(sobre);
  for (const prohibido of ["alguien@example.com", "9876", "451", "123456",
                           "un-token-de-tarjeta", "Nombre", "Apellido"]) {
    assert(!texto.includes(prohibido), `el sobre conserva «${prohibido}»`);
  }
  assert(sobre.data_id === "1316956551" && sobre.type === "payment",
    `el sobre perdió lo que sí sirve: ${texto}`);
});

check("Lo NO firmado se anota SIN cuerpo", () => {
  const i = SQL171.indexOf("function public.billing_record_provider_event");
  const cuerpo = SQL171.slice(i, SQL171.indexOf("$$;", i));
  assert(/case when coalesce\(p_signature_verified, false\) then p_payload else null end/
    .test(cuerpo), "un evento sin firmar guarda su cuerpo");
  assert(/then 'received' else 'rejected' end/.test(cuerpo),
    "un evento sin firmar no queda marcado como rechazado");
});

// ===========================================================================
console.log("\nE · Entorno · un aviso del otro mundo no activa nada");
// ===========================================================================

check("Z. El entorno lo decide la IDENTIDAD del dueño, no la forma del token", () => {
  // La forma del token NO basta, y esto se aprendió pagándolo: cuando la
  // aplicación se crea iniciando sesión como VENDEDOR DE PRUEBA, Mercado Pago
  // emite sus credenciales bajo el epígrafe «producción» y con prefijo
  // `APP_USR-`. Clasificar por prefijo declaraba «producción» a un vendedor
  // sintético y bloqueaba justo el entorno que existe para probar.
  //
  // La pista síncrona solo puede AFIRMAR «pruebas»; nunca afirmar lo contrario.
  assert(environmentFromAccessToken("TEST-123456") === "test",
    "un `TEST-` es de pruebas con certeza");
  assert(environmentFromAccessToken("APP_USR-123456") === null,
    "la forma del token no puede declarar «producción» por sí sola");
  assert(environmentFromAccessToken("") === null, "sin token no hay entorno");
  assert(environmentFromAccessToken(undefined) === null, "sin variable no hay entorno");

  // MP-ENV-01 · Esta clasificación ya NO es la autoridad del entorno: describe
  // al TITULAR del token y se conserva como diagnóstico. El entorno lo declara
  // `MERCADOPAGO_ENVIRONMENT` y lo comprueba `tests/unit/mpenv01-identity`.
  // Aquí se defiende que la función sigue siendo conservadora si alguien la usa.
  assert(classifyOwnerEnvironment({ tags: ["test_user"], site_id: "MCO" }) === "test",
    "un vendedor de prueba no se reconoce");
  assert(classifyOwnerEnvironment({ tags: ["normal"], site_id: "MCO" }) === "live",
    "una cuenta real se tomó por entorno de pruebas");
  assert(classifyOwnerEnvironment({ site_id: "MCO" }) === "live",
    "sin etiquetas se supuso pruebas");
  assert(classifyOwnerEnvironment(null) === "live", "sin ficha se supuso pruebas");

  // Y no hay ningún interruptor para saltárselo.
  //
  // MP-ENV-01 · `MERCADOPAGO_ENVIRONMENT` sí existe, y es lo contrario de una
  // puerta trasera: es la DECLARACIÓN del entorno, obligatoria y validada
  // contra `test|live`, sin valor por omisión. Lo que se sigue prohibiendo es
  // un interruptor que permita saltarse la comprobación. Se compara contra la
  // lista quitando antes la variable declarativa, para que «ENV» dentro de
  // «ENVIRONMENT» no cuente como coincidencia.
  const codigo = (sinComentarios(ADAPTADOR) + sinComentarios(RUTA) + sinComentarios(QA))
    .replace(/MERCADOPAGO_ENVIRONMENT/g, "MERCADOPAGO_DECLARED")
    .replace(/MERCADOPAGO_EXPECTED_[A-Z_]+/g, "MERCADOPAGO_DECLARED");
  for (const puerta of ["MERCADOPAGO_ENV", "MERCADOPAGO_MODE", "MERCADOPAGO_SANDBOX",
                        "ALLOW_LIVE", "SKIP_SAFETY", "FORCE_TEST"]) {
    assert(!codigo.includes(puerta), `hay una puerta trasera de entorno: ${puerta}`);
  }
  // No poder preguntar NO es «es de pruebas».
  assert(/reachable: false/.test(sinComentarios(ADAPTADOR)),
    "un fallo al preguntar no se distingue de una respuesta");
});

check("Y un evento en vivo sobre credenciales de prueba se rechaza", () => {
  assert(environmentMatches(false, "test"), "prueba con prueba");
  assert(environmentMatches(true, "live"), "vivo con vivo");
  assert(!environmentMatches(true, "test"),
    "un evento de PRODUCCIÓN se aceptó con credenciales de prueba");
  assert(!environmentMatches(false, "live"),
    "un evento de prueba se aceptó con credenciales de producción");
  // Sin dato de entorno tampoco: sin dato no es «da igual».
  assert(!environmentMatches(null, "test"), "un evento sin `live_mode` pasó");
  assert(!environmentMatches(undefined, "live"), "un evento sin `live_mode` pasó");
});

check("El guardia de entorno está TAMBIÉN en la base", () => {
  // En la ruta se puede olvidar; en la función de liquidación, no.
  const i = SQL171.indexOf("function public.billing_settle_provider_payment");
  const cuerpo = SQL171.slice(i, SQL171.indexOf("$$;", i));
  assert(/p_live_mode is null/.test(cuerpo), "sin `live_mode` la base no falla cerrado");
  assert(/environment_mismatch/.test(cuerpo), "la base no distingue el entorno");
});

// ===========================================================================
console.log("\nF · Fallos del proveedor · no son rechazos del cliente");
// ===========================================================================

check("X. Caída, tiempo agotado, 500 y 429 NO son un rechazo", () => {
  const casos = [
    { name: "MPConnectionError" }, { name: "MPServerError" },
    { name: "MPRateLimitError" }, { name: "TimeoutError" },
    { status: 500 }, { status: 503 }, { status: 429 },
  ];
  for (const e of casos) {
    assert(classifyProviderError(e) === "provider_unavailable",
      `${JSON.stringify(e)} se clasificó como ${classifyProviderError(e)}`);
  }
  // Y las credenciales mal puestas son un problema NUESTRO, no del cliente:
  // no pueden acabar bajándole el plan a nadie.
  assert(classifyProviderError({ name: "MPAuthenticationError" }) === "provider_unavailable",
    "un fallo de credenciales se presentó como rechazo");
  assert(classifyProviderError({ name: "MPPaymentError" }) === "declined",
    "un rechazo real no se clasificó como tal");
});

check("Y la ruta NO liquida nada cuando el proveedor no responde", () => {
  const codigo = sinComentarios(RUTA);
  assert(/pending_resource/.test(codigo),
    "un recurso ilegible no queda pendiente de reintento");
  // No hay ninguna rama que degrade un derecho.
  for (const degradacion of ["'past_due'", "'ended'", "downgrade", "cancelAssignment"]) {
    assert(!codigo.includes(degradacion),
      `la ruta degrada un derecho con «${degradacion}»: eso es ciclo de vida, y es B5`);
  }
});

// ===========================================================================
console.log("\nG · Conciliación · una firma no hace correcto un importe");
// ===========================================================================

check("T. La conciliación es EXACTA · sin tolerancia", () => {
  assert(amountsReconcile(140_000, "COP", 140_000, "COP"), "un importe idéntico no cuadró");
  assert(!amountsReconcile(140_000, "COP", 139_999, "COP"), "aceptó un peso de menos");
  assert(!amountsReconcile(140_000, "COP", 140_001, "COP"), "aceptó un peso de más");
  assert(!amountsReconcile(140_000, "COP", 140_000, "USD"), "aceptó otra moneda");
  assert(!amountsReconcile(140_000, "COP", null, "COP"), "aceptó un importe ausente");
  // Y en la base, que es donde de verdad se decide.
  const i = SQL171.indexOf("function public.billing_settle_provider_payment");
  const cuerpo = SQL171.slice(i, SQL171.indexOf("$$;", i));
  assert(/p_amount <> v_intent\.expected_total_amount/.test(cuerpo),
    "la base no compara el importe exacto");
  assert(!/abs\(|round\(|tolerance/i.test(cuerpo), "la base admite una tolerancia");
});

check("Lo esperado sale del SERVIDOR, no del proveedor", () => {
  const i = SQL171.indexOf("function public.billing_settle_provider_payment");
  const cuerpo = SQL171.slice(i, SQL171.indexOf("$$;", i));
  assert(/v_intent\.expected_total_amount/.test(cuerpo) &&
         /v_intent\.expected_currency/.test(cuerpo),
    "lo esperado no sale del intento");
  assert(/public\.billing_settle_payment\(\s*\n?\s*v_intent\.quote_id/.test(cuerpo),
    "la liquidación no usa el presupuesto del intento como autoridad");
});

check("AD. El único camino al derecho pasa por la primitiva de B1", () => {
  // Lo prohibido es ESCRIBIR. Leer el estado sí hace falta: el enrutado entre
  // contratación y renovación se decide mirando la suscripción, y hacerlo a
  // ciegas sería peor. La comprobación anterior buscaba el nombre de la tabla
  // y no distinguía una consulta de una escritura.
  const codigo = sinComentarios(RUTA) + sinComentarios(CAPA);
  for (const tabla of ["billing_payments", "billing_subscriptions",
                       "organization_plan_assignments"]) {
    for (const escritura of ["insert", "update", "delete", "upsert"]) {
      const re = new RegExp(`from\\("${tabla}"\\)[\\s\\S]{0,120}?\\.${escritura}\\(`);
      assert(!re.test(codigo), `el código de B2 hace «${escritura}» sobre «${tabla}»`);
      const re2 = new RegExp(`\\.${escritura}\\([\\s\\S]{0,120}?from\\("${tabla}"\\)`);
      assert(!re2.test(codigo), `el código de B2 hace «${escritura}» sobre «${tabla}»`);
    }
  }
  // Y conceder el derecho NO se toca desde aquí, ni leyéndolo.
  assert(!codigo.includes("commercial_apply_assignment"),
    "el código de B2 concede el derecho por su cuenta");
  assert(/public\.billing_settle_payment\(/.test(SQL171),
    "0171 no delega en la primitiva canónica de B1");
});

check("AC/AD. Ninguna activación sale de un parámetro del navegador", () => {
  const codigo = sinComentarios(RUTA);
  for (const veneno of ["searchParams.get(\"status\")", "success", "collection_status",
                        "payment_status"]) {
    assert(!codigo.includes(veneno),
      `la ruta se cree un «${veneno}» de la URL: eso no es verdad financiera`);
  }
  // Y el importe se relee del proveedor, no se toma del cuerpo del aviso.
  assert(/getPaymentDetail\(aviso\.resourceId\)/.test(codigo),
    "no se relee el recurso en la API del proveedor");
  const i = codigo.indexOf("getPaymentDetail(aviso.resourceId)");
  const despues = codigo.slice(i);
  assert(/amount:\s*p\.value\.amount/.test(despues),
    "el importe que se concilia no viene de la lectura del recurso");
});

// ===========================================================================
console.log("\nH · Idempotencia, orden y renovación");
// ===========================================================================

check("P. La misma notificación repetida no crea otra fila", () => {
  assert(/create unique index if not exists bpe_resource_uniq/.test(SQL171),
    "no hay clave única por recurso");
  assert(/attempt_count = public\.billing_provider_events\.attempt_count \+ 1/.test(SQL171),
    "una reentrega no incrementa el contador");
});

check("Y el mismo pago no se liquida dos veces", () => {
  const i = SQL171.indexOf("function public.billing_settle_provider_payment");
  const cuerpo = SQL171.slice(i, SQL171.indexOf("$$;", i));
  const j = cuerpo.indexOf("already_settled");
  const k = cuerpo.indexOf("billing_settle_payment");
  assert(j > -1 && k > -1 && j < k,
    "la comprobación de idempotencia no va ANTES de liquidar");
});

check("Q. Una versión vieja del proveedor no pisa a una nueva", () => {
  for (const fn of ["billing_attach_provider_subscription",
                    "billing_mark_provider_subscription_state"]) {
    const i = SQL171.indexOf(`function public.${fn}`);
    const cuerpo = SQL171.slice(i, SQL171.indexOf("$$;", i));
    assert(/p_provider_version < v_intent\.provider_version|p_provider_version < v_row\.provider_version/
      .test(cuerpo), `${fn} acepta una versión vieja`);
  }
  // Y un intento ya liquidado no retrocede por una noticia de suscripción.
  assert(/when v_intent\.status = 'settled' then v_intent\.status/.test(SQL171),
    "un intento liquidado puede retroceder");
});

check("V. Una renovación NO crea una segunda suscripción", () => {
  const i = SQL171.indexOf("function public.billing_record_renewal_payment");
  const cuerpo = SQL171.slice(i, SQL171.indexOf("$$;", i));
  assert(!/insert into public\.billing_subscriptions/.test(cuerpo),
    "la renovación crea otra suscripción");
  assert(!/commercial_apply_assignment/.test(cuerpo),
    "la renovación vuelve a conceder el plan: duplicaría la asignación vendida");
  assert(/update public\.billing_subscriptions/.test(cuerpo), "no corre el periodo");
  // Y el impuesto lo resuelve B1 con la regla vigente: B2 no calcula IVA.
  assert(/billing_resolve_tax_rule/.test(cuerpo) && /billing_tax_amount/.test(cuerpo),
    "la renovación no consume las funciones fiscales de B1");
  assert(!/1900|0\.19|\* 19/.test(cuerpo), "hay un tipo impositivo escrito a mano");
});

check("U. Un estado desconocido va a revisión y no degrada nada", () => {
  const i = SQL171.indexOf("function public.billing_mark_provider_subscription_state");
  const cuerpo = SQL171.slice(i, SQL171.indexOf("$$;", i));
  assert(/when p_canonical_status is null then 'manual_review'/.test(cuerpo),
    "un estado desconocido no va a revisión");
  assert(!/update public\.billing_subscriptions/.test(cuerpo),
    "anotar el estado del proveedor toca la suscripción canónica");
});

// ===========================================================================
console.log("\nI · Privilegio, secretos y frontera de servidor");
// ===========================================================================

check("AA. Ninguna función privilegiada queda abierta a un cliente", () => {
  const privilegiadas = ["billing_attach_provider_subscription", "billing_record_provider_event",
    "billing_close_provider_event", "billing_settle_provider_payment",
    "billing_record_renewal_payment", "billing_mark_provider_subscription_state"];
  for (const fn of privilegiadas) {
    const revoca = new RegExp(`revoke all on function public\\.${fn}[\\s\\S]{0,200}?from public, anon, authenticated`);
    assert(revoca.test(SQL171), `${fn} no se retira de authenticated`);
    const concede = new RegExp(`grant execute on function public\\.${fn}[\\s\\S]{0,200}?to service_role`);
    assert(concede.test(SQL171), `${fn} no se concede a service_role`);
  }
  // Y la única que sí puede llamar un cliente comprueba que es admin.
  const i = SQL171.indexOf("function public.billing_open_checkout_intent");
  const cuerpo = SQL171.slice(i, SQL171.indexOf("$$;", i));
  assert(/is_org_admin\(v_q\.organization_id\)/.test(cuerpo),
    "abrir un intento no exige ser administrador de esa empresa");
});

check("AB. Ningún secreto llega al navegador ni a los registros", () => {
  const todo = ADAPTADOR + RUTA + CAPA + leer("lib/billing/mercadopago/signature.ts")
    + leer("lib/billing/mercadopago/mapping.ts")
    // MP-ENV-01 · La identidad también entra: maneja configuración del
    // proveedor y el invariante de «nada al navegador» vale igual para ella.
    + leer("lib/billing/mercadopago/identity.ts");
  assert(!/NEXT_PUBLIC_MERCADOPAGO/.test(todo),
    "hay una variable de Mercado Pago expuesta al navegador");
  // Los registros llevan clase de operación e identificadores, nunca valores.
  // El invariante es que NO SE REGISTRA, se use o no. Antes se exigía además
  // que la ruta lo usara, y eso dejó de ser cierto —y para mejor— cuando el
  // entorno pasó a resolverse por identidad dentro del adaptador.
  for (const fichero of [RUTA, ADAPTADOR, CAPA, QA]) {
    const codigo = sinComentarios(fichero);
    for (const secreto of ["MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_WEBHOOK_SECRET"]) {
      const enLog = new RegExp(`(log|log_seguro|console\\.\\w+)\\([^)]*${secreto}`).test(codigo);
      assert(!enLog, `«${secreto}» aparece en un registro`);
    }
  }
  const codigo = sinComentarios(RUTA);
  assert(!/console\.log\([^)]*process\.env/.test(codigo),
    "se registra el entorno completo");
  // Y el mensaje de error del proveedor no se propaga: puede traer al pagador.
  assert(/message: clase/.test(sinComentarios(ADAPTADOR)),
    "el mensaje crudo del proveedor se propaga hacia arriba");
});

check("El adaptador NO es importable desde el navegador", () => {
  assert(/^import "server-only";/m.test(ADAPTADOR), "el adaptador no es de servidor");
  assert(/^import "server-only";/m.test(CAPA), "la capa de datos no es de servidor");
  // Y ninguna pantalla lo importa.
  const pantallas: string[] = [];
  const recorrer = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = `${d}/${e.name}`;
      if (e.isDirectory()) recorrer(r);
      else if (/\.tsx$/.test(e.name)) pantallas.push(r);
    }
  };
  recorrer("app"); recorrer("components");
  for (const f of pantallas) {
    assert(!/billing\/providers\/mercadopago|billing\/mercadopago/.test(leer(f)),
      `${f} importa la frontera de la pasarela`);
  }
});

check("El disparador de QA es PROVISIONAL, y tiene sus cuatro candados", () => {
  const qa = QA;
  const codigo = sinComentarios(qa);
  assert(qa.length > 0, "no existe el disparador de la prueba de sandbox");
  // Está declarado temporal, y consta dónde se dice cuándo se retira.
  assert(/QA_TRIGGER_IS_TEMPORARY/.test(qa), "no se declara provisional");
  assert(/PE_05B2_SANDBOX_TESTS\.md/.test(qa), "no consta dónde se documenta su retirada");
  // 1 · nunca en Producción.
  assert(/VERCEL_ENV[\s\S]{0,120}=== "production"/.test(codigo)
    && /QA_TRIGGER_FORBIDDEN_IN_PRODUCTION/.test(codigo), "no se niega en Producción");
  // 2 · solo superadministrador de plataforma.
  assert(/checkPlatformStatus/.test(codigo) && /NOT_PLATFORM_SUPERADMIN/.test(codigo),
    "no exige superadministrador");
  // 3 · MP-ENV-01 · solo credenciales cuyo entorno DECLARADO es de pruebas y
  // cuyo titular es el ESPERADO, comprobado contra el proveedor. Antes se
  // exigía la etiqueta `test_user`, y esa suposición era incorrecta en los dos
  // sentidos: una credencial de prueba de aplicación no la lleva, y un token de
  // usuario de prueba la lleva aunque sea de otra aplicación. Sin poder
  // comprobar la identidad, tampoco pasa.
  assert(/MERCADOPAGO_ENVIRONMENT_IS_NOT_TEST/.test(codigo),
    "no rechaza un despliegue cuyo entorno declarado no es de pruebas");
  assert(/MERCADOPAGO_OWNER_IS_NOT_EXPECTED/.test(codigo),
    "no rechaza una credencial cuyo titular no es el esperado");
  assert(/MERCADOPAGO_IDENTITY_UNVERIFIABLE/.test(codigo),
    "no rechaza cuando la identidad no se puede comprobar");
  assert(/MERCADOPAGO_IDENTITY_UNVERIFIABLE/.test(codigo),
    "deja pasar cuando no se puede comprobar la identidad del dueño");
  assert(/resolveEnvironment\(\)/.test(codigo),
    "no consulta la identidad del dueño de las credenciales");
  // 4 · ningún importe llega del navegador.
  for (const veneno of ["cuerpo.amount", "cuerpo.total", "body.amount",
                        "cuerpo.transaction_amount", "cuerpo.price"]) {
    assert(!codigo.includes(veneno), `el disparador acepta un importe del navegador: ${veneno}`);
  }
  assert(/intento\.expected_total_amount/.test(codigo),
    "el importe no sale del intento");
  // Y no devuelve el token ni una parte de él.
  assert(!/MERCADOPAGO_ACCESS_TOKEN\s*[,)]/.test(codigo.replace(/environmentFromAccessToken\(process\.env\.MERCADOPAGO_ACCESS_TOKEN\)/g, "")),
    "el disparador expone el token");
  // Ningún TROZO DEL TOKEN puede salir. Una huella sí: un resumen SHA-256 no
  // es reversible y no revela ni el valor ni la longitud. La comprobación
  // anterior prohibía cualquier `slice`, y no distinguía una cosa de la otra;
  // ahora mira si entre el token y el recorte hay un `digest`.
  for (const m of codigo.matchAll(/MERCADOPAGO_ACCESS_TOKEN[\s\S]{0,400}?\.slice\(/g)) {
    const tramo = m[0];
    assert(/\.digest\(/.test(tramo),
      "se recorta el token sin resumirlo antes: eso devuelve un trozo del secreto");
  }
  // Y si hay huella, es de un resumen criptográfico.
  if (/access_token_fingerprint/.test(codigo)) {
    assert(/createHash\("sha256"\)[\s\S]{0,300}?MERCADOPAGO_ACCESS_TOKEN/.test(codigo),
      "la huella del token no sale de un resumen SHA-256");
  }
});

check("El webhook no exige sesión, y su seguridad es la firma", () => {
  const codigo = sinComentarios(RUTA);
  assert(!/createServerClient|getUser\(\)|requireSession/.test(codigo),
    "la ruta exige una sesión de Trazaloop: el proveedor no tiene ninguna");
  assert(/verifyMercadoPagoSignature/.test(codigo), "la ruta no verifica la firma");
});

// ===========================================================================
console.log("\nJ · Las ausencias · lo que es de otro tramo");
// ===========================================================================

check("Nada de cupones, precios públicos ni checkout de cliente", () => {
  const todo = SQL171 + sinComentarios(ADAPTADOR) + sinComentarios(RUTA) + sinComentarios(CAPA);
  for (const otroTramo of ["coupon", "cupon", "discount_code", "public_pricing",
                           "grace_period_job", "renewal_scheduler"]) {
    assert(!new RegExp(otroTramo, "i").test(todo),
      `B2 implementa «${otroTramo}», que es de otro tramo`);
  }
});

check("Y no se modifica nada de B1 · solo se le añade encima", () => {
  // Nombrar a 0169 en el preflight está bien —dice de qué depende—. Lo que no
  // puede es TOCARLA: ni borrar, ni alterar sus tablas, ni redefinir sus
  // funciones. Eso es lo que rompería la facturación que ya está en Staging.
  assert(!/\bdrop table\b|\bdrop column\b|\bdrop function\b/i.test(SQL171),
    "0171 borra algo");
  for (const t of ["billing_subscriptions", "billing_payments", "billing_quotes",
                   "billing_tax_rules", "commercial_fx_rates", "plans"]) {
    assert(!new RegExp(`alter table (public\\.)?${t}\\b`, "i").test(SQL171),
      `0171 altera «${t}», que es de B1`);
  }
  for (const f of ["billing_settle_payment", "billing_create_quote",
                   "billing_resolve_tax_rule", "billing_tax_amount",
                   "commercial_apply_assignment"]) {
    assert(!new RegExp(`create or replace function public\\.${f}\\b`).test(SQL171),
      `0171 redefine «${f}»: B2 consume B1, no lo reescribe`);
  }
  const anteriores = readdirSync("supabase/migrations")
    .filter((f) => /^(0169|0170)/.test(f));
  assert(anteriores.length === 2, "faltan las migraciones anteriores");
});

check("Toda tabla nueva nace con RLS y con política", () => {
  const creadas = [...SQL171.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  assert(creadas.length === 2, `se crearon ${creadas.length} tablas`);
  for (const t of creadas) {
    assert(new RegExp(`alter table public\\.${t} enable row level security`).test(SQL171),
      `${t} nace sin RLS`);
    assert(new RegExp(`create policy \\w+ on public\\.${t}`).test(SQL171),
      `${t} tiene RLS y ninguna política`);
    assert(new RegExp(`revoke insert, update, delete, truncate on public\\.${t}`).test(SQL171)
      || new RegExp(`revoke all on public\\.${t} from anon, authenticated`).test(SQL171),
      `${t} deja escribir a un cliente`);
  }
  assert(/SEC01_RLS_PREFLIGHT/.test(SQL171),
    "0171 se aplicaría sobre una base expuesta");
});

console.log(`\nPE-05B2 · contrato: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
