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
  eventEnvironmentContradicts,
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

check("El entorno lo establece la FIRMA, no un campo del cuerpo", () => {
  // El ejemplo oficial de `transaction.updated` ni siquiera trae
  // `environment`. Exigir un valor concreto rechazaría entregas legítimas por
  // su forma, y cada entorno de Wompi ya tiene su URL y su secreto: que la
  // firma cuadre con el de pruebas ES la evidencia.
  assert(!eventEnvironmentContradicts(undefined, "sandbox"), "ausente no contradice");
  assert(!eventEnvironmentContradicts(null, "sandbox"), "nulo no contradice");
  assert(!eventEnvironmentContradicts("", "sandbox"), "vacío no contradice");
  assert(!eventEnvironmentContradicts("test", "sandbox"), "test con sandbox");
  assert(!eventEnvironmentContradicts("sandbox", "sandbox"), "sandbox con sandbox");
  assert(!eventEnvironmentContradicts("prod", "production"), "prod con producción");
  // Y lo que sí contradice, se rechaza.
  assert(eventEnvironmentContradicts("prod", "sandbox"),
    "un evento de producción pasó con llaves de pruebas");
  assert(eventEnvironmentContradicts("production", "sandbox"), "la otra grafía");
  assert(eventEnvironmentContradicts("test", "production"),
    "un evento de pruebas pasó con llaves de producción");
  // Un valor que no se sabe leer NO se da por bueno.
  assert(eventEnvironmentContradicts("staging", "sandbox"), "un valor desconocido pasó");
  // Y la ruta usa las LLAVES para decidir si el pago es de producción.
  const codigo = sinComentarios(RUTA);
  assert(/liveMode: clasificacion\.environment === "production"/.test(codigo),
    "el modo en vivo se toma del cuerpo del evento en vez de las llaves");
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
  // El único sitio del repositorio donde puede aparecer un número es el
  // disparador provisional de QA, y se declara uno a uno.
  const PERMITIDO = new Set(["app/api/billing/qa/wompi-smoke/route.ts"]);
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
    if (PERMITIDO.has(f)) continue;
    const src = sinComentarios(leer(f));
    for (const campo of ["cvc", "card_holder", "exp_month", "exp_year"]) {
      assert(!new RegExp(`["']?${campo}["']?\\s*:`).test(src),
        `${f} manipula el campo de tarjeta «${campo}»`);
    }
  }
  // Y el que sí puede, solo acepta las tarjetas publicadas por Wompi.
  assert(/ONLY_PUBLISHED_SANDBOX_TEST_CARDS_ALLOWED/.test(QA),
    "el disparador aceptaría cualquier número de tarjeta");
  assert(/4242424242424242/.test(QA) && /4111111111111111/.test(QA),
    "no está la lista cerrada de tarjetas de prueba");
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

check("Una sola liquidación · no hay un segundo motor", () => {
  const codigo = sinComentarios(RUTA);
  assert(/settleProviderPayment/.test(codigo), "no usa la liquidación canónica");
  for (const atajo of ["billing_payments", "billing_subscriptions",
                       "organization_plan_assignments", "commercial_apply_assignment"]) {
    assert(!codigo.includes(atajo), `la ruta escribe «${atajo}» directamente`);
  }
  // La referencia de Wompi ES la referencia opaca del intento.
  assert(/externalReference: leida\.value\.reference/.test(codigo),
    "la conciliación no usa la referencia de la transacción");
});

check("Y nada de calendario todavía", () => {
  const todo = sinComentarios(ADAPTADOR) + sinComentarios(RUTA) + sinComentarios(QA);
  for (const prematuro of ["setInterval", "setTimeout(", "cron", "pg_cron",
                           "scheduleRenewal", "renewalLoop"]) {
    assert(!todo.includes(prematuro), `hay planificador antes de tiempo: ${prematuro}`);
  }
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
