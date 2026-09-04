/**
 * Trazaloop · PE-05B2W · El contrato con Wompi, sin llamar a Wompi.
 *
 * Lo que más fácil se rompe en este proveedor no es la red: es la unidad de
 * dinero. Su `amount_in_cents` cuenta centésimas de peso, y el peso no tiene
 * decimales. Mandar el número de B1 tal cual cobraría cien veces menos.
 *
 * Correr: npm run test:pe05b2w-contract
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  WOMPI, WOMPI_SANDBOX_URL, WOMPI_PRODUCTION_URL, classifyWompiKeys,
  copToWompiCents, wompiCentsToCop, amountsReconcile, mapTransactionStatus,
  settlementOutcome, paymentSourceIsUsable, classifyProviderError,
  integritySignaturePayload, eventChecksumPayload, sanitizeEventEnvelope,
  envelopeIsClean, readPath, WOMPI_EVENT_TRANSACTION_UPDATED,
  eventEnvironmentMatches, parseAttemptReference, buildAttemptReference,
} from "../../lib/billing/wompi/mapping";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const sinComentarios = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ADAPTADOR = leer("lib/billing/providers/wompi.ts");
const RUTA = leer("app/api/billing/webhooks/wompi/route.ts");
const QA = leer("app/api/billing/qa/wompi-smoke/route.ts");
const CONTRATO = leer("lib/billing/provider.ts");

const LLAVES_PRUEBA = {
  publicKey: "pub_test_aaaaaaaaaaaaaaaa", privateKey: "prv_test_bbbbbbbbbbbbbbbb",
  eventsSecret: "test_events_cccccccccccccccc",
  integritySecret: "test_integrity_dddddddddddddddd",
};

console.log("\nPE-05B2W · El contrato con Wompi\n");

// ===========================================================================
console.log("A · El entorno, que aquí SÍ lo dicen las llaves");
// ===========================================================================

check("Cuatro llaves de prueba coherentes → sandbox", () => {
  const c = classifyWompiKeys(LLAVES_PRUEBA);
  assert(c.environment === "sandbox", `dijo ${c.environment}`);
  assert(c.baseUrl === WOMPI_SANDBOX_URL, `URL ${c.baseUrl}`);
  assert(c.problems.length === 0, c.problems.join(","));
});

check("Cuatro de producción → producción, y su URL", () => {
  const c = classifyWompiKeys({
    publicKey: "pub_prod_x", privateKey: "prv_prod_x",
    eventsSecret: "prod_events_x", integritySecret: "prod_integrity_x" });
  assert(c.environment === "production" && c.baseUrl === WOMPI_PRODUCTION_URL,
    JSON.stringify(c));
});

check("UNA sola llave de producción entre llaves de prueba lo tumba todo", () => {
  // Es el caso peligroso: parece configurado y cobraría de verdad.
  const c = classifyWompiKeys({ ...LLAVES_PRUEBA, privateKey: "prv_prod_x" });
  assert(c.environment === null, `aceptó un entorno mezclado: ${c.environment}`);
  assert(c.problems.includes("mixed_environments"), c.problems.join(","));
  assert(c.baseUrl === null, "dio una URL con las llaves mezcladas");
});

check("Y falta o prefijo desconocido tampoco pasan · falla cerrado", () => {
  const falta = classifyWompiKeys({ ...LLAVES_PRUEBA, eventsSecret: undefined });
  assert(falta.environment === null && falta.problems.includes("eventsSecret:missing"),
    JSON.stringify(falta));
  const raro = classifyWompiKeys({ ...LLAVES_PRUEBA, publicKey: "algo_raro" });
  assert(raro.environment === null
    && raro.problems.includes("publicKey:unknown_prefix"), JSON.stringify(raro));
  const vacio = classifyWompiKeys({});
  assert(vacio.environment === null && vacio.problems.length === 4, JSON.stringify(vacio));
});

check("Y no hay ninguna puerta trasera de entorno", () => {
  const codigo = sinComentarios(ADAPTADOR) + sinComentarios(RUTA) + sinComentarios(QA);
  for (const puerta of ["ALLOW_LIVE", "SKIP_SAFETY", "WOMPI_ENV", "WOMPI_MODE",
                        "FORCE_SANDBOX"]) {
    assert(!codigo.includes(puerta), `hay una puerta trasera: ${puerta}`);
  }
  assert(/WOMPI_CREDENTIALS_ARE_NOT_SANDBOX/.test(codigo),
    "el disparador no rechaza credenciales que no sean de pruebas");
});

// ===========================================================================
console.log("\nB · El dinero · la trampa de este proveedor");
// ===========================================================================

check("Wompi cuenta CENTÉSIMAS de peso · 190 400 COP son 19 040 000", () => {
  // Si esto se equivoca, se cobra cien veces menos y nadie lo nota hasta que
  // llega el extracto.
  assert(copToWompiCents(190_400) === 19_040_000, `${copToWompiCents(190_400)}`);
  assert(copToWompiCents(4_760_000) === 476_000_000, "el anual de Extra");
  assert(wompiCentsToCop(19_040_000) === 190_400, "la vuelta no cuadra");
});

check("Y no acepta decimales, ni cero, ni negativos", () => {
  for (const malo of [190_400.5, 0, -1]) {
    let lanzo = false;
    try { copToWompiCents(malo); } catch { lanzo = true; }
    assert(lanzo, `aceptó ${malo}`);
  }
  // Una cantidad de centavos que no sea múltiplo de cien NO es un número
  // entero de pesos: se rechaza en vez de redondear a ojo.
  assert(wompiCentsToCop(19_040_050) === null, "redondeó centavos sueltos");
  assert(wompiCentsToCop(null) === null && wompiCentsToCop(1.5) === null, "bordes");
});

check("La conciliación es exacta y en la unidad correcta", () => {
  assert(amountsReconcile(190_400, "COP", 19_040_000, "COP"), "no cuadró lo idéntico");
  assert(!amountsReconcile(190_400, "COP", 190_400, "COP"),
    "aceptó el importe SIN convertir: eso es cobrar cien veces menos");
  assert(!amountsReconcile(190_400, "COP", 19_039_900, "COP"), "aceptó un peso menos");
  assert(!amountsReconcile(190_400, "COP", 19_040_000, "USD"), "aceptó otra moneda");
  assert(!amountsReconcile(190_400, "COP", null, "COP"), "aceptó un importe ausente");
});

// ===========================================================================
console.log("\nC · Estados");
// ===========================================================================

check("Los cinco estados de transacción, traducidos", () => {
  assert(mapTransactionStatus("APPROVED") === "approved", "APPROVED");
  assert(mapTransactionStatus("PENDING") === "pending", "PENDING");
  assert(mapTransactionStatus("DECLINED") === "declined", "DECLINED");
  assert(mapTransactionStatus("VOIDED") === "failed", "VOIDED");
  assert(mapTransactionStatus("ERROR") === "failed", "ERROR");
  assert(mapTransactionStatus("lo_que_sea") === null, "adivinó uno desconocido");
  assert(mapTransactionStatus(null) === null, "adivinó uno ausente");
});

check("Y solo tres liquidan · pendiente NO es una noticia financiera", () => {
  assert(settlementOutcome("approved") === "approved", "approved");
  assert(settlementOutcome("declined") === "declined", "declined");
  assert(settlementOutcome("failed") === "failed", "failed");
  assert(settlementOutcome("pending") === null, "un pendiente liquidó algo");
  assert(settlementOutcome(null) === null, "un ilegible liquidó algo");
});

check("Solo `AVAILABLE` sirve para cobrar", () => {
  assert(paymentSourceIsUsable("AVAILABLE"), "AVAILABLE");
  for (const otro of ["PENDING", "DECLINED", "", null, undefined, "available "]) {
    if (otro === "available ") { assert(paymentSourceIsUsable(otro), "espacios"); continue; }
    assert(!paymentSourceIsUsable(otro as string), `aceptó «${otro}»`);
  }
});

check("Caída y credenciales mal puestas NO son rechazos del cliente", () => {
  for (const e of [{ status: 500 }, { status: 503 }, { status: 429 },
                   { name: "TimeoutError" }, { name: "AbortError" },
                   { status: 401 }, { status: 403 }]) {
    assert(classifyProviderError(e) === "provider_unavailable",
      `${JSON.stringify(e)} → ${classifyProviderError(e)}`);
  }
  assert(classifyProviderError({ status: 422 }) === "invalid_request", "422");
});

// ===========================================================================
console.log("\nD · Las dos firmas");
// ===========================================================================

check("La firma de integridad concatena en el orden documentado", () => {
  // Del ejemplo de la documentación de Wompi, comprobado carácter a carácter.
  const cadena = integritySignaturePayload(
    "sk8-438k4-xmxm392-sn2m", 2490000, "COP",
    "prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6");
  assert(cadena === "sk8-438k4-xmxm392-sn2m2490000COPprod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6",
    `salió «${cadena}»`);
  const hash = createHash("sha256").update(cadena).digest("hex");
  assert(hash === "37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5",
    `el resumen no coincide con el del ejemplo oficial: ${hash}`);
});

check("Y con caducidad, la caducidad va en su sitio", () => {
  const c = integritySignaturePayload("r", 100, "COP", "s", "2023-06-09T20:28:50.000Z");
  assert(c === "r100COP2023-06-09T20:28:50.000Zs", `salió «${c}»`);
});

check("Y se calcula en el SERVIDOR · el secreto no viaja", () => {
  assert(/^import "server-only";/m.test(ADAPTADOR), "el adaptador no es de servidor");
  const todo = ADAPTADOR + RUTA + QA;
  assert(!/NEXT_PUBLIC_WOMPI_(PRIVATE|EVENTS|INTEGRITY)/.test(todo),
    "un secreto de Wompi expuesto al navegador");
  assert(/createHash\("sha256"\)[\s\S]{0,200}integritySignaturePayload/.test(ADAPTADOR),
    "la firma no se calcula en el adaptador");
});

const SECRETO_EVENTOS = "test_events_ejemplo";
const evento = (importe: number, estado: string) => ({
  event: WOMPI_EVENT_TRANSACTION_UPDATED,
  data: { transaction: { id: "12345-1", status: estado, amount_in_cents: importe,
                         reference: "ref-1", currency: "COP" } },
  environment: "test",
  timestamp: 1_788_400_000,
  signature: { properties: ["transaction.id", "transaction.status",
                            "transaction.amount_in_cents"], checksum: "" },
});
const firmar = (e: ReturnType<typeof evento>, secreto = SECRETO_EVENTOS) => {
  const c = eventChecksumPayload(e, secreto);
  return createHash("sha256").update(c as string).digest("hex");
};

check("El manifiesto del evento sale de los campos que el propio evento firma", () => {
  const e = evento(19_040_000, "APPROVED");
  const c = eventChecksumPayload(e, SECRETO_EVENTOS);
  assert(c === `12345-1APPROVED19040000${e.timestamp}${SECRETO_EVENTOS}`, `salió «${c}»`);
  assert(readPath(e.data, "transaction.amount_in_cents") === 19_040_000, "la ruta con puntos");
});

check("Alterar el IMPORTE rompe la firma · está entre lo firmado", () => {
  const bueno = evento(19_040_000, "APPROVED");
  const checksum = firmar(bueno);
  const alterado = evento(1_904_000, "APPROVED");   // diez veces menos
  assert(firmar(alterado) !== checksum, "cambiar el importe no rompió la firma");
  const otroEstado = evento(19_040_000, "DECLINED");
  assert(firmar(otroEstado) !== checksum, "cambiar el estado no rompió la firma");
  assert(firmar(bueno, "otro_secreto") !== checksum, "otro secreto dio la misma firma");
});

check("Sin sello, sin propiedades o con un campo ausente, no hay manifiesto", () => {
  const e = evento(1, "APPROVED");
  assert(eventChecksumPayload({ ...e, timestamp: undefined }, SECRETO_EVENTOS) === null,
    "sin sello de tiempo dio manifiesto");
  assert(eventChecksumPayload({ ...e, signature: { properties: [] } }, SECRETO_EVENTOS) === null,
    "sin propiedades dio manifiesto");
  assert(eventChecksumPayload({ ...e, signature:
    { properties: ["transaction.no_existe"] } }, SECRETO_EVENTOS) === null,
    "un campo firmado ausente dio manifiesto");
});

check("El entorno exige LAS DOS evidencias · firma Y campo", () => {
  // El contrato de eventos de Wompi siempre incluye `environment`, y sus dos
  // únicos valores son `test` y `prod`. La firma demuestra de quién viene el
  // mensaje; el campo declara el entorno. Ninguna sustituye a la otra.
  assert(eventEnvironmentMatches("test", "sandbox"), "test con llaves de sandbox");
  assert(eventEnvironmentMatches("prod", "production"), "prod con llaves de producción");

  // Cruzados: no.
  assert(!eventEnvironmentMatches("prod", "sandbox"),
    "un evento de producción pasó con llaves de pruebas");
  assert(!eventEnvironmentMatches("test", "production"),
    "un evento de pruebas pasó con llaves de producción");

  // Ausente: NO. Que falte no es que dé igual.
  assert(!eventEnvironmentMatches(undefined, "sandbox"), "pasó sin campo");
  assert(!eventEnvironmentMatches(null, "sandbox"), "pasó con campo nulo");
  assert(!eventEnvironmentMatches("", "sandbox"), "pasó con campo vacío");

  // Y no hay alias: el contrato dice dos valores y son esos dos.
  for (const alias of ["sandbox", "production", "TEST", "Prod", "staging", "unknown"]) {
    assert(!eventEnvironmentMatches(alias, "sandbox"), `se aceptó el alias «${alias}»`);
  }

  // La ruta lo exige, y decide el modo en vivo por las LLAVES.
  const codigo = sinComentarios(RUTA);
  assert(/!eventEnvironmentMatches\(evento\.environment, clasificacion\.environment\)/
    .test(codigo), "la ruta no exige que el entorno coincida");
  assert(/liveMode: clasificacion\.environment === "production"/.test(codigo),
    "el modo en vivo se toma del cuerpo del evento en vez de las llaves");
});

check("Y ninguna de las dos comprobaciones sustituye a la otra", () => {
  const codigo = sinComentarios(RUTA);
  const cuerpo = codigo.slice(codigo.indexOf("export async function POST"));
  const corteFirma = cuerpo.indexOf("if (!verificado)");
  const corteEntorno = cuerpo.indexOf("eventEnvironmentMatches");
  const liquida = cuerpo.indexOf("settleProviderPayment");
  assert(corteFirma > -1 && corteEntorno > -1 && liquida > -1, "faltan los cortes");
  assert(corteFirma < corteEntorno, "el entorno se comprueba antes que la firma");
  assert(corteEntorno < liquida, "se liquida antes de comprobar el entorno");
});

check("Firma inválida → 401 y CERO efecto", () => {
  const codigo = sinComentarios(RUTA);
  assert(/status: 401/.test(codigo), "no responde 401");
  const cuerpo = codigo.slice(codigo.indexOf("export async function POST"));
  const antes = cuerpo.slice(0, cuerpo.indexOf("if (!verificado)"));
  for (const efecto of ["settleProviderPayment", "getTransaction("]) {
    assert(!antes.includes(efecto), `«${efecto}» ocurre ANTES de comprobar la firma`);
  }
  assert(/timingSafeEqual/.test(codigo), "la comparación no es en tiempo constante");
});

// ===========================================================================
console.log("\nE · El sobre del evento");
// ===========================================================================

check("Del evento solo se guarda el sobre", () => {
  const crudo = {
    ...evento(19_040_000, "APPROVED"),
    data: { transaction: {
      id: "12345-1", status: "APPROVED", amount_in_cents: 19_040_000,
      reference: "ref-1", currency: "COP",
      customer_email: "alguien@example.com",
      customer_data: { phone_number: "3001234567", legal_id: "123456" },
      payment_method: { extra: { number: "424242******4242", card_holder: "NOMBRE" } },
    } },
  };
  const sobre = sanitizeEventEnvelope(crudo);
  assert(envelopeIsClean(sobre), `el sobre lleva prohibidos: ${JSON.stringify(sobre)}`);
  const texto = JSON.stringify(sobre);
  for (const p of ["alguien@example.com", "3001234567", "123456", "424242", "NOMBRE"]) {
    assert(!texto.includes(p), `el sobre conserva «${p}»`);
  }
  assert(sobre.transaction_id === "12345-1" && sobre.amount_in_cents === 19_040_000,
    `el sobre perdió lo que sirve: ${texto}`);
});

// ===========================================================================
console.log("\nF · Capacidad, frontera y ausencias");
// ===========================================================================

check("El proveedor DECLARA quién lleva el calendario", () => {
  assert(/recurrenceOwner/.test(CONTRATO), "el contrato no declara la capacidad");
  assert(/recurrenceOwner: "merchant"/.test(ADAPTADOR),
    "Wompi no se declara como programado por el comercio");
  const mp = leer("lib/billing/providers/mercadopago.ts");
  assert(/recurrenceOwner: "provider"/.test(mp),
    "Mercado Pago dejó de declararse como programado por el proveedor");
  // Y la capacidad NO es verdad comercial.
  assert(/capacidad t[eé]cnica, no una verdad comercial/.test(CONTRATO),
    "no consta que la capacidad no decide el plan ni el precio");
});

check("Wompi no finge tener suscripción propia", () => {
  assert(/supportsProviderSubscription: false/.test(ADAPTADOR), "dice tenerla");
  assert(/WOMPI_HAS_NO_PROVIDER_SUBSCRIPTION/.test(ADAPTADOR),
    "no dice que no la tiene cuando se la piden");
  assert(/WOMPI_CANCELLATION_IS_A_MERCHANT_DECISION/.test(ADAPTADOR),
    "finge poder cancelar algo en el proveedor");
});

check("Ningún fichero de PRODUCTO toca datos de tarjeta", () => {
  // B2W1 permitía UNA excepción: el disparador de QA, que tokenizaba desde el
  // servidor porque no había navegador. B2W4 lo hay, así que la excepción se
  // MUEVE, no se amplía: el único sitio del repositorio donde pueden aparecer
  // campos de tarjeta es el formulario del NAVEGADOR, que es exactamente la
  // frontera con el proveedor. El disparador de QA pasa a estar prohibido como
  // todos los demás.
  const FRONTERA = "components/domain/billing/wompi-card-form.tsx";
  const ficheros: string[] = [];
  const recorrer = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = `${d}/${e.name}`;
      if (e.isDirectory()) recorrer(r);
      else if (/\.tsx?$/.test(e.name)) ficheros.push(r);
    }
  };
  for (const raiz of ["lib", "server", "components", "app"]) recorrer(raiz);
  for (const f of ficheros) {
    if (f === FRONTERA) continue;
    const src = sinComentarios(leer(f));
    for (const campo of ["cvc", "card_holder", "exp_month", "exp_year"]) {
      assert(!new RegExp(`["']?${campo}["']?\\s*:`).test(src),
        `${f} manipula el campo de tarjeta «${campo}»`);
    }
  }
  // Y el que sí puede es un componente de CLIENTE: si dejara de serlo, los
  // campos pasarían a construirse en el servidor.
  assert(/^"use client"/m.test(leer(FRONTERA)),
    "la frontera dejó de ser código de navegador");
  // El disparador de QA ya no tokeniza nada. Aquí se comprueba que no vuelva.
  assert(!/ONLY_PUBLISHED_SANDBOX_TEST_CARDS_ALLOWED/.test(sinComentarios(QA)),
    "el disparador de QA volvió a aceptar números de tarjeta");
  assert(!/tokenize_test_card/.test(sinComentarios(QA)),
    "volvió la tokenización desde el servidor");
});

check("El disparador de QA es PROVISIONAL y tiene sus candados", () => {
  const codigo = sinComentarios(QA);
  assert(/se retira antes de cerrar/i.test(QA), "no se declara provisional");
  assert(/VERCEL_ENV[\s\S]{0,80}=== "production"/.test(codigo)
    && /QA_TRIGGER_FORBIDDEN_IN_PRODUCTION/.test(codigo), "no se niega en Producción");
  assert(/checkPlatformStatus/.test(codigo) && /NOT_PLATFORM_SUPERADMIN/.test(codigo),
    "no exige superadministrador");
  // Ningún importe del navegador: sale del intento.
  for (const veneno of ["cuerpo.amount", "cuerpo.total", "cuerpo.transaction_amount"]) {
    assert(!codigo.includes(veneno), `acepta un importe del navegador: ${veneno}`);
  }
  assert(/i\.expected_total_amount/.test(codigo), "el importe no sale del intento");
});

check("La referencia identifica UN intento, y no decide nada", () => {
  // La versión anterior metía la semántica en el texto —`sub_<uuid>_<n>`— y el
  // número lo ponía quien llamaba. Eso permitía dos cobros para el mismo mes:
  // dos transacciones legítimas y distintas para el proveedor, que la
  // idempotencia por identificador de pago no puede distinguir.
  const intento = "09d9f269-7ac8-4461-a8ac-2b0236abebd5";
  assert(buildAttemptReference(intento) === `pay_${intento}`, "la referencia");
  assert(parseAttemptReference(`pay_${intento}`) === intento, "no se lee de vuelta");
  assert(parseAttemptReference(`PAY_${intento.toUpperCase()}`) === intento,
    "no se normaliza a minúsculas");

  // Nada de números en la cadena, nada de adivinar.
  for (const malo of [intento, `pay_${intento}_2`, `sub_${intento}_2`,
                      `int_${intento}`, `${intento}-1`, "pay_no-es-uuid",
                      "ORDER-123", "", null, undefined, `x_pay_${intento}`]) {
    assert(parseAttemptReference(malo as string) === null,
      `se aceptó una referencia que no lo es: «${malo}»`);
  }

  // Y en el código NO queda rastro del modelo viejo.
  const todo = sinComentarios(ADAPTADOR) + sinComentarios(RUTA) + sinComentarios(QA)
    + sinComentarios(leer("lib/billing/wompi/mapping.ts"));
  for (const viejo of ["buildRenewalReference", "parseCanonicalReference",
                       "subscription_renewal", "cuerpo.sequence"]) {
    assert(!todo.includes(viejo), `sobrevive el modelo viejo de referencia: ${viejo}`);
  }
});

check("Lo que significa el cobro lo dice la BASE, no la cadena", () => {
  const codigo = sinComentarios(RUTA);
  assert(/parseAttemptReference\(leida\.value\.reference\)/.test(codigo),
    "la ruta no lee el intento de la referencia");
  assert(/classifyAttempt\(intentoId\)/.test(codigo),
    "la ruta no pregunta a la base qué es este cobro");
  assert(/unparseable_reference/.test(codigo) && /unknown_attempt/.test(codigo),
    "una referencia ilegible o un intento desconocido no van a revisión");
  // Contratación → liquidación inicial. Renovación → saldar SU periodo.
  assert(/clase\.kind === "initial"[\s\S]{0,400}settleProviderPayment/.test(codigo),
    "la contratación no va por la liquidación inicial");
  assert(/settlePeriodPayment/.test(codigo) && /periodId: clase\.periodId/.test(codigo),
    "la renovación no salda su obligación");
  const renov = codigo.slice(codigo.indexOf("} else {"), codigo.indexOf("const estado ="));
  assert(!renov.includes("settleProviderPayment"),
    "el camino de renovación llama a la creación inicial: haría otra suscripción");
});

check("Una sola liquidación · no hay un segundo motor", () => {
  const codigo = sinComentarios(RUTA);
  assert(/settleProviderPayment/.test(codigo), "no usa la liquidación canónica");
  for (const atajo of ["billing_payments", "billing_subscriptions",
                       "organization_plan_assignments", "commercial_apply_assignment"]) {
    assert(!codigo.includes(atajo), `la ruta escribe «${atajo}» directamente`);
  }
  // La referencia de Wompi ES la referencia opaca del intento.
  assert(/externalReference: clase\.intentId/.test(codigo),
    "la conciliación no usa el intento que la base identificó");
});

check("Y nada de calendario todavía", () => {
  const todo = sinComentarios(ADAPTADOR) + sinComentarios(RUTA) + sinComentarios(QA);
  for (const prematuro of ["setInterval", "setTimeout(", "cron", "pg_cron",
                           "scheduleRenewal", "renewalLoop"]) {
    assert(!todo.includes(prematuro), `hay planificador antes de tiempo: ${prematuro}`);
  }
});

check("Ninguna llave real de Wompi vive en el repositorio", () => {
  // El guardia mira la FORMA de una llave, así que no distingue por sí solo
  // una real de un ejemplo. Se declaran las dos únicas excepciones legítimas y
  // se comprueba que no hay ninguna más: una llave de verdad no encaja en
  // ninguna de ellas.
  const PATRON = /(pub|prv)_(test|prod)_[A-Za-z0-9]{16,}|(test|prod)_(events|integrity)_[A-Za-z0-9]{16,}/g;
  // 1 · el ejemplo publicado por la propia documentación de Wompi, con el que
  //     se verifica que nuestro resumen coincide con el suyo;
  const DEL_MANUAL = "prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6";
  // 2 · fixtures inconfundibles: la cola es un solo carácter repetido.
  const esFixture = (v: string) => {
    const cola = v.split("_").slice(-1)[0];
    return cola.length >= 8 && new Set(cola).size === 1;
  };
  const ficheros: string[] = [];
  const recorrer = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = `${d}/${e.name}`;
      if (e.isDirectory() && e.name !== "node_modules") recorrer(r);
      else if (/\.(tsx?|md|json|sql)$/.test(e.name)) ficheros.push(r);
    }
  };
  for (const raiz of ["lib", "server", "components", "app", "tests", "docs",
                      "scripts", "supabase"]) recorrer(raiz);
  for (const f of ficheros) {
    for (const encontrada of leer(f).match(PATRON) ?? []) {
      if (encontrada === DEL_MANUAL || esFixture(encontrada)) continue;
      assert(false, `${f} contiene algo con forma de llave real de Wompi`);
    }
  }
});

check("La renovación cierra su intento · «en vuelo» tiene que ser verdad", () => {
  // La contratación inicial cierra su intento sola: lo hace la primitiva que
  // la salda. La renovación se dirige al PERIODO, así que si nadie cierra el
  // intento se queda diciendo que hay un cobro en vuelo cuando ya no lo hay, y
  // la regla de «un solo cobro en vuelo por obligación» pasa a mentir.
  const cuerpo = sinComentarios(RUTA);
  const i = cuerpo.indexOf("settlePeriodPayment");
  assert(i > 0, "la ruta ya no salda periodos");
  assert(/closeAttempt\(\s*clase\.intentId/.test(cuerpo.slice(i)),
    "la renovación no cierra su intento");

  // Y el cierre no inventa desenlaces: una reentrega no vuelve a escribirlo.
  const lib = sinComentarios(leer("lib/db/billing-provider.ts"));
  const j = lib.indexOf("export async function closeAttempt");
  assert(j > 0, "no existe el cierre del intento");
  const fn = lib.slice(j, j + 1400);
  for (const [salida, estado] of [["renewed", "settled"], ["declined", "declined"],
                                  ["failed", "failed"],
                                  ["period_already_settled", "manual_review"]]) {
    assert(new RegExp(`${salida}:\\s*"${estado}"`).test(fn),
      `«${salida}» no deja el intento en «${estado}»`);
  }
  assert(!/already_settled:\s*"/.test(fn.replace(/period_already_settled:\s*"[a-z_]+"/, "")),
    "una reentrega reescribe el desenlace del intento");
});

check("Y el otro proveedor no se tocó", () => {
  const mp = leer("lib/billing/providers/mercadopago.ts");
  assert(/new PreApproval\(/.test(mp), "el adaptador de Mercado Pago cambió de forma");
  assert(!/wompi/i.test(mp), "Mercado Pago menciona a Wompi");
  assert(!/mercadopago/i.test(sinComentarios(ADAPTADOR)), "Wompi menciona a Mercado Pago");
  assert(WOMPI === "wompi", "el nombre del proveedor cambió");
});

console.log(`\nPE-05B2W · contrato: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
