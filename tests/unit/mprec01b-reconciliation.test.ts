/**
 * Trazaloop · MP-REC-01 · La conciliación de una recurrencia.
 *
 *
 * QUÉ CLASE DE PRUEBA ES ESTA, Y QUÉ NO AFIRMA
 *
 *     DETERMINISTIC_STATE_MACHINE_TEST
 *
 * Aquí NO habla Mercado Pago. Las dependencias están inyectadas y el «segundo
 * ciclo» es una SIMULACIÓN: se fabrica un cobro con otra identidad y otra fecha
 * económica, como lo produciría el proveedor un mes después.
 *
 * Esto NO demuestra que Mercado Pago haya cobrado dos veces de verdad. Eso solo
 * lo demuestra un PROVIDER_REAL_SANDBOX_TEST, que necesita que pase un ciclo
 * real y que el comprador haya autorizado. Lo que sí demuestra —y es lo que
 * costaría semanas comprobar de otro modo— es que la máquina de estados hace lo
 * correcto cuando esos hechos llegan: no pierde días, no duplica, no concede de
 * más y no retira lo pagado.
 *
 * La base falsa de aquí abajo IMITA la invariante real: `billing_provider_cycles`
 * tiene un índice único sobre la identidad del ciclo externo, así que el mismo
 * cobro dos veces devuelve `already_reconciled`. Si esa invariante se cayera en
 * la base de verdad, esta suite seguiría en verde y no serviría de nada: por eso
 * MP-REC-01 la comprueba además contra el esquema, en `mprec01-recurring-lane`.
 *
 * Correr: npm run test:mprec01b
 */
import {
  decideRecurringSettlements, type RecurringExpectation,
} from "../../lib/billing/recurring/verification";
import {
  reconcileRecurringSubscription,
  type RecurringReconcileDeps, type ObservedRecurringPayment,
  type ObservedProviderSubscription, type CycleOutcome,
} from "../../lib/billing/recurring/reconcile";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

// --- El escenario: Full mensual en sandbox ---------------------------------
const REF = "intent-7c3f";
const PREAPPROVAL = "03ec8c2a1b1f44fe9a7a4d490c4e3e78";
const COLLECTOR = 3663569024;          // la cuenta de prueba confirmada por MP
const OTRO_COLLECTOR = 2536124156;
const IMPORTE = 157080;                // COP, en unidades mínimas
const MONEDA = "COP";

const BASE: RecurringExpectation = {
  subscriptionId: "sub-1",
  providerSubscriptionId: PREAPPROVAL,
  externalReference: REF,
  expectedAmountMinor: IMPORTE,
  expectedCurrency: MONEDA,
  configuredEnvironment: "test",
  authorizationEnvironment: "test",
  expectedOwnerId: COLLECTOR,
  credentialOwnerMatches: true,
  alreadySeenProviderPaymentIds: [],
};

const pago = (o: Partial<ObservedRecurringPayment> = {}): ObservedRecurringPayment => ({
  providerPaymentId: "pay-1",
  canonicalStatus: "approved",
  amountMinor: IMPORTE,
  currency: MONEDA,
  externalReference: REF,
  liveMode: false,
  collectorId: COLLECTOR,
  cycleAt: "2026-09-16T10:00:00.000Z",
  ...o,
});

const suscripcion = (o: Partial<ObservedProviderSubscription> = {}):
  ObservedProviderSubscription => ({
    providerStatus: "authorized",
    externalReference: REF,
    collectorId: COLLECTOR,
    applicationId: 685221457097068,
    nextPaymentDate: "2026-10-16T10:00:00.000Z",
    ...o,
  });

/**
 * La base falsa. Imita UNA cosa y solo una: la unicidad del ciclo externo.
 * Cada periodo saldado se apunta con la identidad del cobro, y repetirla
 * devuelve `already_reconciled` como hace `billing_reconcile_provider_cycle`.
 */
function baseFalsa() {
  const ciclos = new Map<string, { secuencia: number; importe: number }>();
  const periodos: Array<{ secuencia: number; cobro: string; cycleAt: string }> = [];
  return {
    ciclos, periodos,
    settleCycle: async (i: Parameters<RecurringReconcileDeps["settleCycle"]>[0]):
      Promise<CycleOutcome> => {
      const clave = `${i.providerSubscriptionId}::${i.providerPaymentId}`;
      if (ciclos.has(clave)) return { outcome: "already_reconciled" };
      const secuencia = periodos.length + 1;
      ciclos.set(clave, { secuencia, importe: i.amountMinor });
      periodos.push({ secuencia, cobro: i.providerPaymentId, cycleAt: i.cycleAt });
      return { outcome: "renewed", period_id: `per-${secuencia}` };
    },
  };
}

function deps(o: {
  sub?: ObservedProviderSubscription | null;
  pagos?: ObservedRecurringPayment[] | null;
  db?: ReturnType<typeof baseFalsa>;
}): { deps: RecurringReconcileDeps; db: ReturnType<typeof baseFalsa>;
      observaciones: Array<Record<string, unknown>> } {
  const db = o.db ?? baseFalsa();
  const observaciones: Array<Record<string, unknown>> = [];
  return {
    db, observaciones,
    deps: {
      readSubscription: async () => o.sub === null
        ? { ok: false, failure: "provider_unavailable", message: "caída" }
        : { ok: true, value: o.sub ?? suscripcion() },
      listPayments: async () => o.pagos === null
        ? { ok: false, failure: "provider_unavailable", message: "caída" }
        : { ok: true, value: o.pagos ?? [] },
      settleCycle: db.settleCycle,
      recordObservation: async (i) => { observaciones.push(i); },
      now: () => new Date("2026-09-16T12:00:00.000Z"),
    },
  };
}

async function main() {

console.log("\nC · CREACIÓN: LO QUE SE ESPERA ANTES DE QUE NADIE AUTORICE");

await check("C1. Sin cobros, la recurrencia no concede nada", async () => {
  const { deps: d, db } = deps({ pagos: [] });
  const r = await reconcileRecurringSubscription(BASE, d);
  assert(r.ok, "la conciliación no pudo completarse");
  assert(r.settledNow === 0, `saldó ${r.settledNow} ciclos sin cobros`);
  assert(db.periodos.length === 0, "creó un periodo sin un cobro detrás");
});

await check("C2. Y deja constancia de que se miró", async () => {
  const { deps: d, observaciones } = deps({ pagos: [] });
  await reconcileRecurringSubscription(BASE, d);
  assert(observaciones.length === 1, "no anotó la observación");
  assert(observaciones[0].reconciledAt === "2026-09-16T12:00:00.000Z",
    "la anotación no usa el reloj inyectado");
});

console.log("\nD · AUTORIZADO NO ES PAGADO");

await check("D1. `authorized` sin cobro no crea periodo ni derecho", async () => {
  const { deps: d, db } = deps({ sub: suscripcion({ providerStatus: "authorized" }),
                                 pagos: [] });
  const r = await reconcileRecurringSubscription(BASE, d);
  assert(r.authorized, "no reconoció la autorización del comprador");
  // Y sin embargo: nada.
  assert(r.settledNow === 0 && db.periodos.length === 0,
    "una autorización concedió acceso");
  assert(r.canonicalStatus === "pending",
    `«authorized» se tradujo a «${r.canonicalStatus}» en vez de a pending`);
});

await check("D2. Un cobro pendiente o rechazado no salda nada", async () => {
  for (const estado of ["pending", "declined", "failed", "manual_review"] as const) {
    const { deps: d, db } = deps({ pagos: [pago({ canonicalStatus: estado })] });
    const r = await reconcileRecurringSubscription(BASE, d);
    assert(r.settledNow === 0, `«${estado}» saldó un ciclo`);
    assert(db.periodos.length === 0, `«${estado}» creó un periodo`);
    assert(r.rejected[0]?.reason === "PAYMENT_NOT_APPROVED",
      `«${estado}» no se rechazó por no estar aprobado`);
  }
});

await check("D3. Si el proveedor no responde, no se concluye nada", async () => {
  // «No pude mirar» y «no hay nada» son noticias distintas. Confundirlas es
  // cómo se le retira el plan a quien lo tenía pagado.
  const { deps: d, observaciones } = deps({ sub: null });
  const r = await reconcileRecurringSubscription(BASE, d);
  assert(!r.ok && r.blocked === "PROVIDER_UNREACHABLE",
    "una caída del proveedor no se distinguió de «no hay cobros»");
  assert(observaciones.length === 0, "anotó una observación que no pudo hacer");
});

console.log("\nE · EL PRIMER COBRO APROBADO: EXACTAMENTE UNO DE CADA COSA");

await check("E1. Un cobro aprobado produce un pago, un periodo y nada más", async () => {
  const { deps: d, db } = deps({ pagos: [pago()] });
  const r = await reconcileRecurringSubscription(BASE, d);
  assert(r.ok && r.settledNow === 1, `saldó ${r.settledNow} ciclos, se esperaba 1`);
  assert(db.periodos.length === 1, `creó ${db.periodos.length} periodos`);
  assert(db.periodos[0].secuencia === 1, "el primer periodo no es el número 1");
  assert(r.rejected.length === 0, "rechazó algo que era legítimo");
});

console.log("\nF · CONCILIAR DOS VECES EL MISMO COBRO NO HACE NADA");

await check("F1. La segunda vuelta no crea un segundo periodo", async () => {
  const db = baseFalsa();
  const { deps: d } = deps({ pagos: [pago()], db });
  const primera = await reconcileRecurringSubscription(BASE, d);
  const segunda = await reconcileRecurringSubscription(BASE, d);
  assert(primera.settledNow === 1, "la primera vuelta no saldó");
  assert(segunda.settledNow === 0, `la segunda saldó ${segunda.settledNow}`);
  assert(segunda.alreadyReconciled === 1, "no reconoció que el ciclo ya estaba");
  assert(db.periodos.length === 1, `quedaron ${db.periodos.length} periodos`);
});

await check("F2. Y si ya se sabía visto, ni se le pregunta a la base", async () => {
  // La primera línea de la idempotencia. La segunda, la que de verdad manda,
  // es el índice único; esta solo evita una transacción inútil.
  const db = baseFalsa();
  const { deps: d } = deps({ pagos: [pago()], db });
  const r = await reconcileRecurringSubscription(
    { ...BASE, alreadySeenProviderPaymentIds: ["pay-1"] }, d);
  assert(r.alreadySeen === 1, "no contó el cobro como ya visto");
  assert(r.settledNow === 0 && db.periodos.length === 0,
    "volvió a saldar un cobro que ya estaba reconocido");
});

console.log("\nG · SEGUNDO CICLO SIMULADO · DETERMINISTIC_STATE_MACHINE_TEST");

await check("G1. El segundo cobro produce el periodo siguiente, sin perder días", async () => {
  const db = baseFalsa();
  // Ciclo 1 · septiembre
  const uno = deps({ pagos: [pago()], db });
  await reconcileRecurringSubscription(BASE, uno.deps);
  // Ciclo 2 · octubre. SIMULADO: identidad y fecha económica nuevas, como las
  // produciría el proveedor un mes después. Mercado Pago NO ha cobrado aquí.
  const dos = deps({
    pagos: [pago(), pago({ providerPaymentId: "pay-2",
                           cycleAt: "2026-10-16T10:00:00.000Z" })], db });
  const r = await reconcileRecurringSubscription(BASE, dos.deps);

  assert(r.settledNow === 1, `el segundo ciclo saldó ${r.settledNow}, se esperaba 1`);
  assert(r.alreadyReconciled === 1, "no reconoció que el primero ya estaba");
  assert(db.periodos.length === 2, `quedaron ${db.periodos.length} periodos`);
  assert(db.periodos[1].secuencia === 2, "el segundo periodo no es el número 2");
  // Sin días perdidos: cada periodo conserva la fecha económica de SU cobro, y
  // el segundo no pisa ni reemplaza al primero.
  assert(db.periodos[0].cycleAt === "2026-09-16T10:00:00.000Z"
      && db.periodos[1].cycleAt === "2026-10-16T10:00:00.000Z",
    "un periodo perdió su fecha económica");
  assert(db.periodos[0].cobro !== db.periodos[1].cobro,
    "los dos periodos apuntan al mismo cobro");
});

await check("G2. Y el orden de llegada no cambia el resultado", async () => {
  // Los avisos pueden llegar desordenados. Lo que no puede pasar es que el mes
  // que llega tarde borre al que llegó pronto.
  const db = baseFalsa();
  const { deps: d } = deps({
    pagos: [pago({ providerPaymentId: "pay-2", cycleAt: "2026-10-16T10:00:00.000Z" }),
            pago()], db });
  const r = await reconcileRecurringSubscription(BASE, d);
  assert(r.settledNow === 2, `saldó ${r.settledNow} de 2 ciclos`);
  assert(db.periodos.length === 2, "no quedaron los dos periodos");
});

console.log("\nM · EL COBRADOR QUE NO ES EL NUESTRO");

await check("M1. Una preapproval de otro vendedor se rechaza entera", async () => {
  const { deps: d, db, observaciones } = deps({
    sub: suscripcion({ collectorId: OTRO_COLLECTOR }), pagos: [pago()] });
  const r = await reconcileRecurringSubscription(BASE, d);
  assert(!r.ok && r.blocked === "COLLECTOR_MISMATCH",
    `no se rechazó por cobrador: ${r.blocked}`);
  assert(db.periodos.length === 0, "saldó algo de otro vendedor");
  assert(observaciones.length === 0, "anotó una suscripción que no es nuestra");
});

await check("M2. Y un cobro suelto de otro cobrador tampoco pasa", async () => {
  const { deps: d, db } = deps({ pagos: [pago({ collectorId: OTRO_COLLECTOR })] });
  const r = await reconcileRecurringSubscription(BASE, d);
  assert(r.settledNow === 0 && db.periodos.length === 0, "saldó un cobro ajeno");
  assert(r.rejected[0]?.reason === "PAYMENT_COLLECTOR_MISMATCH",
    "no se rechazó por cobrador");
});

await check("M3. La credencial desplegada tiene que ser la esperada", async () => {
  const r = decideRecurringSettlements([pago()],
    { ...BASE, credentialOwnerMatches: false });
  assert(r.blocked === "CREDENTIAL_OWNER_MISMATCH",
    "una credencial de otro titular no bloqueó la conciliación");
  const sinTitular = decideRecurringSettlements([pago()],
    { ...BASE, expectedOwnerId: null });
  assert(sinTitular.blocked === "CREDENTIAL_OWNER_MISMATCH",
    "sin titular esperado no falló cerrado");
});

console.log("\nN · EL ENTORNO");

await check("N1. Una autorización de otro entorno bloquea todo", async () => {
  const r = decideRecurringSettlements([pago()],
    { ...BASE, authorizationEnvironment: "live" });
  assert(r.blocked === "AUTHORIZATION_ENVIRONMENT_MISMATCH",
    "una autorización productiva se concilió en pruebas");
  assert(r.settle.length === 0, "saldó algo de otro entorno");
});

await check("N2. Un cobro REAL no se reconoce en el carril de pruebas", async () => {
  // Al revés que el caso de producción: un cargo productivo entrando por aquí
  // daría plan sin que el dinero haya pasado por la contabilidad que toca.
  const { deps: d, db } = deps({ pagos: [pago({ liveMode: true })] });
  const r = await reconcileRecurringSubscription(BASE, d);
  assert(r.settledNow === 0 && db.periodos.length === 0, "reconoció un cobro real en pruebas");
  assert(r.rejected[0]?.reason === "AUTHORIZATION_ENVIRONMENT_MISMATCH",
    `motivo inesperado: ${r.rejected[0]?.reason}`);
});

await check("N3. En producción, un cobro de pruebas se rechaza", async () => {
  const r = decideRecurringSettlements([pago({ liveMode: false })],
    { ...BASE, configuredEnvironment: "live", authorizationEnvironment: "live" });
  assert(r.settle.length === 0, "reconoció un cobro de pruebas en producción");
  assert(r.rejected[0]?.reason === "LIVE_MODE_REQUIRED",
    `motivo inesperado: ${r.rejected[0]?.reason}`);
});

await check("N4. Sin entorno declarado no se procesa", async () => {
  const r = decideRecurringSettlements([pago({ liveMode: null })], BASE);
  assert(r.settle.length === 0, "procesó un cobro de origen desconocido");
  assert(r.rejected[0]?.reason === "LIVE_MODE_UNDECLARED",
    `motivo inesperado: ${r.rejected[0]?.reason}`);
});

console.log("\nO · IMPORTE, MONEDA Y CORRELACIÓN");

await check("O1. Un importe distinto del contratado no salda", async () => {
  for (const otro of [IMPORTE - 1, IMPORTE + 1, 0, null]) {
    const { deps: d, db } = deps({ pagos: [pago({ amountMinor: otro })] });
    const r = await reconcileRecurringSubscription(BASE, d);
    assert(r.settledNow === 0 && db.periodos.length === 0,
      `saldó con importe ${otro}`);
    assert(r.rejected[0]?.reason === "AMOUNT_MISMATCH",
      `importe ${otro}: motivo ${r.rejected[0]?.reason}`);
  }
});

await check("O2. Otra moneda tampoco", async () => {
  const { deps: d, db } = deps({ pagos: [pago({ currency: "USD" })] });
  const r = await reconcileRecurringSubscription(BASE, d);
  assert(r.settledNow === 0 && db.periodos.length === 0, "saldó en otra moneda");
  assert(r.rejected[0]?.reason === "CURRENCY_MISMATCH",
    `motivo inesperado: ${r.rejected[0]?.reason}`);
});

await check("O3. La moneda se compara sin distinguir mayúsculas", async () => {
  const { deps: d } = deps({ pagos: [pago({ currency: "cop" })] });
  const r = await reconcileRecurringSubscription(BASE, d);
  assert(r.settledNow === 1, "rechazó la moneda correcta por la caja de las letras");
});

await check("O4. Un cobro de otra contratación no se toca", async () => {
  const { deps: d, db } = deps({ pagos: [pago({ externalReference: "intent-otro" })] });
  const r = await reconcileRecurringSubscription(BASE, d);
  assert(r.settledNow === 0 && db.periodos.length === 0, "saldó un cobro ajeno");
  assert(r.rejected[0]?.reason === "EXTERNAL_REFERENCE_MISMATCH",
    `motivo inesperado: ${r.rejected[0]?.reason}`);
});

await check("O5. La correlación se comprueba ANTES que el estado", async () => {
  // Un cobro de OTRA contratación que además esté rechazado debe reportarse
  // como ajeno, no como «no aprobado»: lo segundo mandaría a revisar el medio
  // de pago de un cliente que no tiene nada que ver con esto.
  const r = decideRecurringSettlements(
    [pago({ externalReference: "intent-otro", canonicalStatus: "declined" })], BASE);
  assert(r.rejected[0]?.reason === "EXTERNAL_REFERENCE_MISMATCH",
    `el orden de las negativas cambió: ${r.rejected[0]?.reason}`);
});

await check("O6. Y la preapproval releída tiene que ser la nuestra", async () => {
  const { deps: d, db } = deps({
    sub: suscripcion({ externalReference: "intent-otro" }), pagos: [pago()] });
  const r = await reconcileRecurringSubscription(BASE, d);
  assert(!r.ok && r.blocked === "SUBSCRIPTION_REFERENCE_MISMATCH",
    `no se rechazó por referencia: ${r.blocked}`);
  assert(db.periodos.length === 0, "saldó sobre una suscripción ajena");
});

console.log("\nR · LA CORRELACIÓN NO SE ADIVINA, SE VERIFICA");

await check("R1. El veredicto se ata a la referencia, no al orden de creación", async () => {
  // El primer cobro real falló por esto: el servicio buscaba «el intento más
  // reciente de la suscripción». Una empresa que presupuesta dos veces tiene
  // dos intentos, y el más nuevo NO es aquel con el que se creó la preapproval.
  // La decisión pura ya lo hacía bien —compara contra la referencia esperada—
  // y esta prueba fija esa propiedad para que nadie la afloje.
  const otro = { ...BASE, externalReference: "intent-mas-nuevo" };
  const r = decideRecurringSettlements([pago()], otro);
  assert(r.settle.length === 0, "saldó un cobro de otra referencia");
  assert(r.rejected[0]?.reason === "EXTERNAL_REFERENCE_MISMATCH",
    `motivo inesperado: ${r.rejected[0]?.reason}`);
});

await check("R2. Y la suscripción releída manda sobre lo que creamos saber", async () => {
  const { deps: d, db } = deps({
    sub: suscripcion({ externalReference: "intent-de-otra-contratacion" }),
    pagos: [pago()] });
  const r = await reconcileRecurringSubscription(BASE, d);
  assert(!r.ok && r.blocked === "SUBSCRIPTION_REFERENCE_MISMATCH",
    `no se bloqueó por referencia: ${r.blocked}`);
  assert(db.periodos.length === 0, "saldó sobre una suscripción ajena");
});

console.log("\nX · LO QUE NO SE PUEDE RECORDAR NO SE RECONOCE");

await check("X1. Un cobro sin identificador se rechaza", async () => {
  // Aceptarlo sería aceptar algo que la próxima vuelta volvería a parecer
  // nuevo, y eso es un periodo duplicado cada vez que se concilia.
  const { deps: d, db } = deps({ pagos: [pago({ providerPaymentId: "" })] });
  const r = await reconcileRecurringSubscription(BASE, d);
  assert(r.settledNow === 0 && db.periodos.length === 0, "saldó un cobro sin identidad");
});

await check("X2. Un cobro sin fecha económica no se salda", async () => {
  const { deps: d, db } = deps({ pagos: [pago({ cycleAt: null })] });
  const r = await reconcileRecurringSubscription(BASE, d);
  assert(r.settledNow === 0 && db.periodos.length === 0,
    "saldó un ciclo que la base no podría situar");
});

console.log(`\nMP-REC-01 · conciliación: ${passed} en verde, ${failed} en rojo`);
if (failed > 0) process.exit(1);

}

void main();
