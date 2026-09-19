import { readFileSync } from "node:fs";
import {
  decideUpgradeStep, recurringTotalFor, classifySettlementOutcome,
  type UpgradeSagaFacts, type ObservedDeltaPayment,
} from "../../lib/billing/upgrade/saga";
import {
  buildAttemptReference, buildUpgradeReference,
  parseAttemptReference, parseUpgradeReference,
} from "../../lib/billing/upgrade-reference";
import { decideRunnerAction } from "../../lib/billing/recurring/runner-policy";

/**
 * Trazaloop · BILLING-EXTRA-01B · La decisión de la subida, caso por caso.
 *
 * Aquí se comprueba lo que NO se puede comprobar contra un proveedor real sin
 * mover dinero: qué pasa cuando el cobro sale y la autorización no, cuando el
 * proveedor cobra una renovación en mitad de la transición, cuando el importe
 * vuelve distinto del que se pidió.
 *
 * Son exactamente los casos que importan, y son deterministas porque la
 * decisión está separada de las llamadas.
 */

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const AHORA = "2026-09-20T00:00:00.000Z";
const FIN = "2026-10-16T22:47:38.000Z";
const EFECTIVA = "2026-09-20T00:00:00.000Z";

/** Extra mensual: 400 000 de base + 76 000 de IVA = 476 000. */
const EXTRA_RECURRENTE = 476_000;
/** La diferencia de media mensualidad: 120 000 + 22 800. */
const DELTA_TOTAL = 142_800;
/** Full mensual: 160 000 de base + 30 400 de IVA. Lo que la autorización tenía. */
const FULL_RECURRENTE = 190_400;

const pago = (o: Partial<ObservedDeltaPayment> = {}): ObservedDeltaPayment => ({
  providerPaymentId: "mp-1", canonicalStatus: "approved",
  amountMinor: DELTA_TOTAL, currency: "COP", liveMode: false,
  collectorId: 3663569024, ...o });

const hechos = (o: Partial<UpgradeSagaFacts> = {}): UpgradeSagaFacts => ({
  changeStatus: "submitted",
  expectedTotalAmount: DELTA_TOTAL, expectedCurrency: "COP",
  effectiveAt: EFECTIVA, periodEnd: FIN, now: AHORA,
  renewalMode: "manual", configuredEnvironment: "test",
  intentEnvironment: "test", expectedOwnerId: 3663569024,
  credentialOwnerMatches: true,
  deltaPayment: null, providerCyclesInsideWindow: 0,
  authorization: null, targetRecurringAmountMinor: EXTRA_RECURRENTE,
  authorizationUpdateAttempted: false,
  providerRecurringAmountBefore: null, providerRestored: false,
  restoreTargetAmount: null, authorizationRestoreAttempted: false,
  operatorIntent: "none", ...o });

const autorizacion = (o: Partial<NonNullable<UpgradeSagaFacts["authorization"]>> = {}) => ({
  providerSubscriptionId: "preapproval-1", status: "authorized",
  observedAmountMinor: 190_400, observedCurrency: "COP", ...o });

async function main() {
  console.log("\n1 · EL CARRIL MANUAL · LO SENCILLO SIGUE SIENDO SENCILLO");

  check("1A. Sin cobro todavía no se decide nada", () => {
    const r = decideUpgradeStep(hechos());
    assert(r.kind === "wait", `decidió ${r.kind}`);
  });

  check("1B. Con el cobro aprobado y conciliado, se concede", () => {
    const r = decideUpgradeStep(hechos({ deltaPayment: pago() }));
    assert(r.kind === "settle", `decidió ${r.kind}`);
  });

  check("1C. Un cobro rechazado cierra la subida SIN devolver nada", () => {
    // Porque no hay nada que devolver. Abrir una compensación aquí sería
    // inventarse una deuda nuestra.
    for (const estado of ["declined", "failed"]) {
      const r = decideUpgradeStep(hechos({ deltaPayment: pago({ canonicalStatus: estado }) }));
      assert(r.kind === "abandon", `«${estado}» decidió ${r.kind}`);
    }
  });

  check("1D. Un cobro a medias NO concede y NO devuelve: se vuelve a mirar", () => {
    for (const estado of ["pending", "manual_review", null]) {
      const r = decideUpgradeStep(hechos({
        deltaPayment: pago({ canonicalStatus: estado }) }));
      assert(r.kind === "wait", `«${estado}» decidió ${r.kind}`);
    }
  });

  check("1E. El carril de la plataforma tampoco necesita nada fuera", () => {
    // Su importe se deriva de `base_charge_amount`, que la liquidación deja en
    // el de Extra: el cobro siguiente se corrige solo.
    const r = decideUpgradeStep(hechos({ renewalMode: "platform", deltaPayment: pago() }));
    assert(r.kind === "settle", `decidió ${r.kind}`);
  });

  console.log("\n2 · CON DINERO DENTRO, CUALQUIER «NO» SE DEVUELVE");

  check("2A. Importe distinto del congelado", () => {
    const r = decideUpgradeStep(hechos({
      deltaPayment: pago({ amountMinor: DELTA_TOTAL - 1 }) }));
    assert(r.kind === "compensate" && r.reason === "PAYMENT_RECONCILIATION_MISMATCH",
      `decidió ${r.kind}`);
  });

  check("2A.2. Importe que NO se pudo normalizar · tampoco concede", () => {
    // `null` no es cero: es «no se puede afirmar cuánto entró». Con dinero
    // dentro, eso se devuelve.
    const r = decideUpgradeStep(hechos({ deltaPayment: pago({ amountMinor: null }) }));
    assert(r.kind === "compensate", `decidió ${r.kind}`);
  });

  check("2B. Moneda distinta", () => {
    const r = decideUpgradeStep(hechos({ deltaPayment: pago({ currency: "USD" }) }));
    assert(r.kind === "compensate", `decidió ${r.kind}`);
  });

  check("2C. En PRUEBAS, `live_mode` se observa pero NO decide", () => {
    // PROD-LAUNCH-01B.4, reaprendido a la mala en 01C.1: un cobro REAL de
    // Sandbox llega con `live_mode: true` porque la bandera describe la
    // naturaleza de la CREDENCIAL, no nuestro entorno. Un usuario de prueba
    // opera con credenciales que el proveedor marca como productivas.
    for (const bandera of [true, false, null]) {
      const r = decideUpgradeStep(hechos({ deltaPayment: pago({ liveMode: bandera }) }));
      assert(r.kind === "settle", `con live_mode=${bandera} decidió ${r.kind}`);
    }
  });

  check("2C.2. Y en PRODUCCIÓN sí manda, sin excepción y sin `null`", () => {
    for (const bandera of [false, null]) {
      const r = decideUpgradeStep(hechos({
        configuredEnvironment: "live", intentEnvironment: "live",
        deltaPayment: pago({ liveMode: bandera }) }));
      assert(r.kind === "compensate" && r.reason === "LIVE_MODE_REQUIRED",
        `con live_mode=${bandera} decidió ${r.kind}`);
    }
    const bueno = decideUpgradeStep(hechos({
      configuredEnvironment: "live", intentEnvironment: "live",
      deltaPayment: pago({ liveMode: true }) }));
    assert(bueno.kind === "settle", `decidió ${bueno.kind}`);
  });

  check("2C.3. Lo que separa «nuestro» de «ajeno» es la IDENTIDAD", () => {
    // Cruzar entornos.
    const cruzado = decideUpgradeStep(hechos({
      intentEnvironment: "live", deltaPayment: pago() }));
    assert(cruzado.kind === "compensate"
      && cruzado.reason === "INTENT_ENVIRONMENT_MISMATCH", `decidió ${cruzado.kind}`);
    // Una credencial que no resuelve al titular esperado. Falla cerrado.
    const credencial = decideUpgradeStep(hechos({
      credentialOwnerMatches: false, deltaPayment: pago() }));
    assert(credencial.kind === "compensate"
      && credencial.reason === "CREDENTIAL_OWNER_MISMATCH", `decidió ${credencial.kind}`);
    // Y un cobro que recibió OTRO vendedor.
    const otroVendedor = decideUpgradeStep(hechos({
      deltaPayment: pago({ collectorId: 999 }) }));
    assert(otroVendedor.kind === "compensate"
      && otroVendedor.reason === "COLLECTOR_MISMATCH", `decidió ${otroVendedor.kind}`);
    // Si el proveedor no dice quién cobró, no se inventa un desajuste.
    const sinDecir = decideUpgradeStep(hechos({
      deltaPayment: pago({ collectorId: null }) }));
    assert(sinDecir.kind === "settle", `decidió ${sinDecir.kind}`);
  });

  check("2D. El periodo se acabó DESPUÉS de cobrar", () => {
    // La cuenta se hizo sobre un tiempo que ya pasó. Cobrarla sería quedarse
    // con su dinero.
    const r = decideUpgradeStep(hechos({
      now: "2026-11-01T00:00:00.000Z", deltaPayment: pago() }));
    assert(r.kind === "compensate" && r.reason === "PERIOD_ENDED_AFTER_PAYMENT",
      `decidió ${r.kind}`);
  });

  check("2D.2. Y si se acabó sin que nadie pagara, se cierra sin más", () => {
    const r = decideUpgradeStep(hechos({ now: "2026-11-01T00:00:00.000Z" }));
    assert(r.kind === "abandon" && r.reason === "PERIOD_ENDED", `decidió ${r.kind}`);
  });

  console.log("\n3 · EL CARRIL DEL PROVEEDOR · LA AUTORIZACIÓN MANDA");

  check("3A. Primero se cambia el importe, y sólo después se liquida", () => {
    const r = decideUpgradeStep(hechos({
      renewalMode: "provider", deltaPayment: pago(),
      authorization: autorizacion() }));
    assert(r.kind === "update_authorization", `decidió ${r.kind}`);
    assert(r.amountMinor === EXTRA_RECURRENTE, `pide ${r.amountMinor}`);
  });

  check("3B. Si ya está en el importe de Extra, se liquida", () => {
    const r = decideUpgradeStep(hechos({
      renewalMode: "provider", deltaPayment: pago(),
      authorization: autorizacion({ observedAmountMinor: EXTRA_RECURRENTE }) }));
    assert(r.kind === "settle", `decidió ${r.kind}`);
  });

  check("3C. PUT que dice 200 y GET que no lo refleja · NO se liquida", () => {
    // El caso que obliga a volver a preguntar. Se confía en lo que el proveedor
    // dice DESPUÉS, no en el código de respuesta.
    const r = decideUpgradeStep(hechos({
      renewalMode: "provider", deltaPayment: pago(),
      authorization: autorizacion({ observedAmountMinor: 190_400 }),
      authorizationUpdateAttempted: true }));
    assert(r.kind === "compensate" && r.reason === "AUTHORIZATION_AMOUNT_NOT_APPLIED",
      `decidió ${r.kind}`);
  });

  check("3C.2. Y una autorización ilegible tampoco concede", () => {
    const r = decideUpgradeStep(hechos({
      renewalMode: "provider", deltaPayment: pago(),
      authorization: autorizacion({ observedAmountMinor: null }),
      authorizationUpdateAttempted: true }));
    assert(r.kind === "compensate", `decidió ${r.kind}`);
  });

  check("3D. Sin autorización que tocar · no se concede Extra a ciegas", () => {
    // El ciclo siguiente cobraría Full y nadie lo aceptaría.
    const sinObjeto = decideUpgradeStep(hechos({
      renewalMode: "provider", deltaPayment: pago(),
      authorization: autorizacion({ providerSubscriptionId: null }) }));
    assert(sinObjeto.kind === "compensate" && sinObjeto.reason === "AUTHORIZATION_MISSING",
      `decidió ${sinObjeto.kind}`);
    const sinNada = decideUpgradeStep(hechos({
      renewalMode: "provider", deltaPayment: pago(), authorization: null }));
    assert(sinNada.kind === "compensate", `decidió ${sinNada.kind}`);
  });

  check("3E. Una autorización cancelada NO se resucita: se devuelve", () => {
    for (const estado of ["cancelled", "ended", null]) {
      const r = decideUpgradeStep(hechos({
        renewalMode: "provider", deltaPayment: pago(),
        authorization: autorizacion({ status: estado }) }));
      assert(r.kind === "compensate" && r.reason === "AUTHORIZATION_NOT_ACTIVE",
        `«${estado}» decidió ${r.kind}`);
    }
  });

  check("3F. El importe recurrente es la base de Extra MÁS su impuesto", () => {
    // Ponerlo sin IVA dejaría la autorización cobrando de menos justo el
    // impuesto, y el ciclo siguiente no cuadraría con nada.
    assert(recurringTotalFor(400_000, 76_000) === EXTRA_RECURRENTE,
      "el importe recurrente no es base + impuesto");
  });

  console.log("\n4 · LA CARRERA CON LA RENOVACIÓN");

  check("4A. Un ciclo del proveedor DENTRO de la ventana impide completar", () => {
    const r = decideUpgradeStep(hechos({
      renewalMode: "provider", deltaPayment: pago(),
      authorization: autorizacion({ observedAmountMinor: EXTRA_RECURRENTE }),
      providerCyclesInsideWindow: 1 }));
    assert(r.kind === "compensate" && r.reason === "RENEWAL_DURING_UPGRADE",
      `decidió ${r.kind}`);
  });

  check("4B. Y el barrido no concilia mientras haya una subida abierta", () => {
    const base = {
      subscriptionId: "s1", subscriptionStatus: "active", renewalMode: "provider",
      authorizationStatus: "authorized", hasProviderObject: true,
      paidThrough: FIN,
    };
    const conSubida = decideRunnerAction(
      { ...base, upgradeInFlight: true }, new Date(AHORA));
    assert(conSubida.action === "skip_upgrade_in_flight",
      `el barrido hizo ${conSubida.action}`);
    const sinSubida = decideRunnerAction(
      { ...base, upgradeInFlight: false }, new Date(AHORA));
    assert(sinSubida.action === "reconcile", `sin subida hizo ${sinSubida.action}`);
  });

  check("4C. La ventana es la vida del cambio · no un número de horas", () => {
    // Si esto fuera «no subir en las 48 horas previas a la renovación», habría
    // que justificar el 48. La guarda no elige ninguna cantidad: empieza cuando
    // nace el cambio y termina cuando el cambio termina.
    const pol = sinComentarios(leer("lib/billing/recurring/runner-policy.ts"));
    assert(/upgradeInFlight/.test(pol), "el barrido no mira si hay una subida");
    assert(!/\b(24|48|72)\s*\*\s*60|horasAntes|HOURS_BEFORE_RENEWAL/.test(pol),
      "apareció una ventana en horas, que habría que justificar");
  });

  console.log("\n5 · IDEMPOTENCIA Y ESTADOS FINALES");

  check("5A. Un estado final no vuelve a hacer nada", () => {
    for (const estado of ["settled", "refunded", "cancelled", "declined"]) {
      const r = decideUpgradeStep(hechos({ changeStatus: estado, deltaPayment: pago() }));
      assert(r.kind === "done", `«${estado}» decidió ${r.kind}`);
    }
    // Y `failed` SIN dinero también lo es.
    const seca = decideUpgradeStep(hechos({ changeStatus: "failed" }));
    assert(seca.kind === "done", `una fallida sin cobro decidió ${seca.kind}`);
  });

  check("5A.2. Pero una fallida CON un cobro aprobado no está resuelta", () => {
    // BILLING-EXTRA-01C. La liquidación deja el cambio en `failed` cuando llega
    // un pago aprobado cuyo importe no cuadra. Dar eso por terminado es cómo un
    // cobro se queda sin devolver para siempre.
    const r = decideUpgradeStep(hechos({
      changeStatus: "failed", deltaPayment: pago() }));
    assert(r.kind === "compensate" && r.reason === "FAILED_WITH_APPROVED_PAYMENT",
      `decidió ${r.kind}`);
    // Y con un cobro que no entró, sigue siendo el final que era.
    const rechazada = decideUpgradeStep(hechos({
      changeStatus: "failed", deltaPayment: pago({ canonicalStatus: "declined" }) }));
    assert(rechazada.kind === "done", `decidió ${rechazada.kind}`);
  });

  check("5B. De una compensación abierta NUNCA se sale hacia Extra", () => {
    // Ni con todo lo demás en orden. Un cobro que se decidió devolver no
    // concede nada: sólo caben devolver la autorización, devolver el dinero, o
    // quedarse quieto.
    const casos: UpgradeSagaFacts[] = [
      hechos({ changeStatus: "compensation_required", deltaPayment: pago() }),
      hechos({ changeStatus: "compensation_required", renewalMode: "provider",
               deltaPayment: pago(),
               authorization: autorizacion({ observedAmountMinor: EXTRA_RECURRENTE }),
               providerRecurringAmountBefore: FULL_RECURRENTE,
               restoreTargetAmount: FULL_RECURRENTE }),
      hechos({ changeStatus: "compensation_required", renewalMode: "provider",
               deltaPayment: pago(), providerRestored: true,
               providerRecurringAmountBefore: FULL_RECURRENTE,
               authorization: autorizacion({ observedAmountMinor: FULL_RECURRENTE }) }),
    ];
    for (const f of casos) {
      const r = decideUpgradeStep(f);
      assert(["refund", "restore_authorization", "hold"].includes(r.kind),
        `decidió ${r.kind}`);
    }
  });

  check("5C. Y lo que aún no salió al proveedor, espera", () => {
    const r = decideUpgradeStep(hechos({ changeStatus: "pending", deltaPayment: pago() }));
    assert(r.kind === "wait", `decidió ${r.kind}`);
  });

  console.log("\n6 · LA REFERENCIA · UNA SOLA, Y SIN PASARELA DENTRO");

  const UUID = "11111111-2222-3333-4444-555555555555";

  check("6A. El formato no cambió · ni el prefijo ni la lectura", () => {
    assert(buildAttemptReference(UUID) === `pay_${UUID}`, "la referencia de cobro");
    assert(buildUpgradeReference(UUID) === `upg_${UUID}`, "la referencia de subida");
    assert(parseAttemptReference(`pay_${UUID}`) === UUID, "no se lee de vuelta");
    assert(parseAttemptReference(`UPG_${UUID.toUpperCase()}`) === UUID,
      "no se lee en mayúsculas");
  });

  check("6B. La lectura de SUBIDA sólo acepta subidas", () => {
    // Sin esto, una renovación podría entrar por la puerta de una subida y
    // saldarla. Son dos hechos financieros distintos.
    assert(parseUpgradeReference(`upg_${UUID}`) === UUID, "no reconoce la suya");
    assert(parseUpgradeReference(`pay_${UUID}`) === null,
      "una contratación entra por la puerta de una subida");
    for (const malo of ["", "upg_", `upg_${UUID}x`, null, undefined, 42]) {
      assert(parseUpgradeReference(malo as string) === null, `aceptó «${malo}»`);
    }
  });

  check("6C. Y ya no vive dentro del mapeo de Wompi", () => {
    const wompi = leer("lib/billing/wompi/mapping.ts");
    assert(/from "@\/lib\/billing\/upgrade-reference"/.test(wompi),
      "el mapeo de Wompi no reexporta la referencia común");
    assert(!/^export function buildUpgradeReference/m.test(wompi),
      "la referencia sigue definida dentro de la pasarela");
    // Y el carril de Wompi la sigue importando sin enterarse del cambio.
    const cobro = leer("lib/billing/upgrade-charge.ts");
    assert(/upgrade-reference/.test(cobro), "el cobro de Wompi no usa la común");
  });

  console.log("\n7 · CÓMO SE DISPARA · TRES PUERTAS, UNA LÓGICA");

  check("7A. La vuelta del navegador llama al conciliador, no decide", () => {
    const vuelta = leer("app/(app)/(shell)/settings/billing/checkout/return/page.tsx");
    assert(/reconcileUpgrade/.test(vuelta), "la vuelta no concilia la subida");
    // Y NO nombra ninguna pasarela: quién cobró lo dice el intento.
    assert(!/mercadopago|wompi/i.test(vuelta),
      "la pantalla de vuelta nombra una pasarela");
    assert(/eq\("organization_id", orgId\)/.test(vuelta),
      "la vuelta no comprueba que el cambio sea de esta empresa");
    const limpio = sinComentarios(vuelta);
    assert(!/params\.(status|payment_id|collection_status)/.test(limpio),
      "la vuelta se cree lo que trae la URL");
  });

  check("7B. El aviso del proveedor llama al MISMO conciliador", () => {
    const hook = leer("app/api/billing/webhooks/mercadopago/route.ts");
    assert(/parseUpgradeReference/.test(hook), "el aviso no distingue una subida");
    assert(/reconcileMercadoPagoUpgrade/.test(hook),
      "el aviso resuelve la subida por su cuenta en vez de conciliar");
  });

  check("7C. Y ninguna de las dos es requisito", () => {
    // La lógica canónica vive en un módulo que no depende de ninguna de las dos
    // puertas: cualquiera puede llamarla, y un barrido también.
    const rec = leer("lib/db/upgrade-mercadopago.ts");
    assert(/export async function reconcileMercadoPagoUpgrade/.test(rec),
      "no hay una función de conciliación invocable desde fuera");
    assert(!/next\/headers|searchParams|NextRequest/.test(rec),
      "el conciliador depende de una petición del navegador");
  });

  console.log("\n8 · LO QUE NO SE PUEDE RECIBIR DE FUERA");

  check("8A.0. Y abrir el cobro exige una SESIÓN, no el cliente de servicio", () => {
    // BILLING-EXTRA-01C.1 · Lo encontró la primera ejecución real contra
    // Sandbox: `billing_open_upgrade_intent` comprueba `auth.uid()` y el papel
    // de administrador, y llamarlo con el cliente administrativo devolvía
    // `AUTH_REQUIRED` siempre. Abrir el cobro de una subida es un acto de
    // alguien.
    const rec = leer("lib/db/upgrade-mercadopago.ts");
    assert(/supabase: SupabaseLike/.test(rec),
      "el inicio del cobro no recibe la sesión de quien sube de plan");
    assert(/input\.supabase\.rpc\("billing_open_upgrade_intent"/.test(rec),
      "el intento se abre con el cliente administrativo");
  });

  check("8A. El conciliador no recibe NADA financiero de fuera", () => {
    const rec = leer("lib/db/upgrade-mercadopago.ts");
    // Recibe el cambio y, desde 01C.3, lo que una persona con autoridad
    // decidió. Ni un importe, ni un identificador del proveedor, ni un plan.
    assert(/changeId: string,/.test(rec), "el conciliador no recibe el cambio");
    assert(/operatorIntent: "none" \| "complete" \| "refund"/.test(rec),
      "la decisión del operador no está acotada a tres valores");
    for (const prohibido of ["amount", "planCode", "providerPaymentId", "total"]) {
      assert(!new RegExp(`reconcileMercadoPagoUpgrade\\([^)]*${prohibido}`, "s")
        .test(rec), `el conciliador recibe «${prohibido}» de fuera`);
    }
    const limpio = sinComentarios(rec);
    // El importe recurrente se DERIVA: de la fila y del impuesto de la base.
    assert(/billing_tax_amount/.test(limpio),
      "el impuesto del importe recurrente no sale de la autoridad de redondeo");
    assert(/recurringTotalFor\(base, impuesto\)/.test(limpio),
      "el importe recurrente no se deriva de la fila del cambio");
  });

  check("8B. La recuperación tampoco decide qué hacer: recoge la prueba", () => {
    const rec = leer("lib/db/upgrade-recovery.ts");
    assert(/resolveStuckUpgrade\(changeId: string\)/.test(rec),
      "la recuperación recibe algo más que el cambio");
    const limpio = sinComentarios(rec);
    assert(/gatherStuckUpgradeEvidence/.test(limpio),
      "la recuperación no consulta al proveedor antes de resolver");
    assert(/createServerClient/.test(limpio),
      "la recuperación llama a la base con el cliente administrativo: "
      + "entonces la auditoría no guarda a una persona");
    // BILLING-EXTRA-01B.1 · Y cede el turno a la saga canónica en vez de
    // compensar por su cuenta. Dos algoritmos que mueven dinero divergen.
    assert(/reconcileUpgrade/.test(limpio),
      "la recuperación compensa por su cuenta en vez de usar la saga");
    assert(!/refundPayment|billing_record_upgrade_refund/.test(limpio),
      "la recuperación tiene su propio camino de reembolso");
  });

  check("8C. Y el reembolso usa una llave derivada, no una inventada", () => {
    const sql = leer("supabase/migrations/0216_billing_upgrade_compensation.sql");
    assert(/v_llave := 'upgrefund:' \|\| v_c\.id::text \|\| ':' \|\| v_c\.delta_provider_payment_id/
      .test(sql), "la llave del reembolso no se deriva del cambio y del cobro");
    const rec = sinComentarios(leer("lib/db/upgrade-mercadopago.ts"));
    assert(/refund_idempotency_key/.test(rec),
      "el reembolso no lee la llave derivada");
    assert(/listRefunds/.test(rec),
      "no se pregunta si el reembolso ya existe antes de pedir otro");
  });

  check("8D. La llave de idempotencia del reembolso viaja como UUID", () => {
    // BILLING-EXTRA-01C.1 · Mercado Pago pide un UUID en `X-Idempotency-Key` y
    // devolvió `invalid_request` con la llave del dominio tal cual. Se DERIVA
    // por resumen: mismos hechos, mismo UUID, y reintentar sigue pidiendo el
    // mismo reembolso.
    const mp = leer("lib/billing/providers/mercadopago.ts");
    assert(/function uuidDesde\(/.test(mp), "no se deriva un UUID de la llave");
    assert(/idempotencyKey: uuidIdempotente/.test(mp),
      "el reembolso manda la llave del dominio en crudo");
    const limpio = sinComentarios(mp);
    assert(!/randomUUID\(\)/.test(limpio.split("refundPayment")[1] ?? ""),
      "la llave del reembolso se genera al azar: entonces no es idempotente");
  });

  check("2C.4. Y `live_mode` NO decide en NINGÚN sitio fuera de producción", () => {
    // Este error ha vuelto tres veces: lo cerró PROD-LAUNCH-01B.4 en el carril
    // de pago único, volvió en la saga de subidas (01C.1) y volvió otra vez en
    // la guarda de la costura QA (01C.4), donde rechazaba justo los cobros
    // reales de Sandbox que tenía que aceptar.
    //
    // La regla, dicha una vez: `live_mode` describe la CREDENCIAL. Sólo manda
    // en producción. Fuera de ahí, lo que separa «nuestro» de «ajeno» es la
    // identidad — el titular y el cobrador.
    const sospechosos = [
      "lib/billing/upgrade/saga.ts",
      "app/api/billing/qa/mercadopago-smoke/route.ts",
      "lib/db/upgrade-mercadopago.ts",
    ];
    for (const f of sospechosos) {
      const src = sinComentarios(leer(f));
      // Se permite exigirlo cuando el entorno configurado es `live`; cualquier
      // otra comparación contra la bandera es la regla vieja volviendo.
      const usos = [...src.matchAll(/liveMode\s*!==?\s*(true|false|null)/g)]
        .map((m) => m[0]);
      for (const u of usos) {
        assert(/liveMode !== true/.test(u),
          `${f} vuelve a decidir por live_mode: «${u}»`);
      }
      assert(!/liveMode\s*\?\s*"live"\s*:\s*"test"/.test(src),
        `${f} deriva el entorno de live_mode`);
    }
  });

  console.log("\n13 · COMPLETAR UNA SUBIDA PAGADA · LA OPERACIÓN GOBERNADA");

  check("13A. La decide una persona, pero NO la ejecuta a mano", () => {
    const rec = sinComentarios(leer("lib/db/upgrade-recovery.ts"));
    assert(/reconcileUpgrade\(changeId, "complete"\)/.test(rec),
      "completar no pasa por la saga canónica");
    // Ni toca el plan, ni el periodo, ni las asignaciones por su cuenta.
    for (const prohibido of ["plan_code", "billing_subscriptions",
                             "organization_plan_assignments"]) {
      assert(!new RegExp(`update[\\s\\S]{0,80}${prohibido}`).test(rec),
        `la recuperación escribe «${prohibido}» a mano`);
    }
  });

  check("13B. Y exige un cobro APROBADO antes de nada", () => {
    const rec = sinComentarios(leer("lib/db/upgrade-recovery.ts"));
    assert(/prueba\.evidence !== "payment_approved"/.test(rec),
      "se puede completar una subida sin cobro aprobado");
  });

  check("13C. Sólo superadministrador, y sin recibir cifras", () => {
    const acc = sinComentarios(leer("server/actions/billing.ts"));
    const i = acc.indexOf("completePaidUpgradeAction");
    assert(i !== -1, "no existe la acción");
    const bloque = acc.slice(i, i + 700);
    assert(/isSuperadmin/.test(bloque), "no exige superadministrador");
    assert(/completePaidUpgradeAction\(\s*changeId: string\s*\)/.test(acc),
      "la acción recibe algo más que el identificador del cambio");
  });

  check("13D. La consola no deja teclear ninguna cifra", () => {
    const ui = leer("components/domain/platform/paid-upgrade-recovery.tsx");
    assert(!/<input|<textarea|contentEditable/.test(ui),
      "la consola tiene un campo editable en una pantalla de dinero");
    assert(/completePaidUpgradeAction\(changeId\)/.test(ui),
      "la consola no manda el identificador del cambio y nada más");
    assert(/completar\(r\.changeId\)/.test(ui),
      "la fila no pasa SU cambio: se podría completar otro");
    assert(/confirmando === r\.changeId/.test(ui),
      "se puede completar una subida sin confirmar");
  });

  console.log("\n14 · CALIDAD DE LA INTEGRACIÓN CON MERCADO PAGO");

  check("14A. Las preferencias llevan las tres URLs de vuelta", () => {
    const mp = sinComentarios(leer("lib/billing/providers/mercadopago.ts"));
    for (const u of ["success: input.successUrl", "failure: input.failureUrl",
                     "pending: input.pendingUrl"]) {
      assert(mp.includes(u), `falta ${u}`);
    }
  });

  check("14B. El aviso sale de configuración, nunca del host que atiende", () => {
    // Mercado Pago documenta que la `notification_url` de la preferencia
    // PREVALECE sobre la del panel. Derivarla del host mandaría la dirección de
    // un Preview en un cobro productivo y callaría los avisos de verdad.
    const mp = sinComentarios(leer("lib/billing/providers/mercadopago.ts"));
    assert(/MERCADOPAGO_NOTIFICATION_URL/.test(mp),
      "el aviso no sale de una variable declarada");
    // Sobre el fichero CRUDO: `sinComentarios` se come el «//» de dentro de la
    // cadena y dejaría esta comprobación mirando a otra cosa.
    assert(/startsWith\("https:\/\/"\)/.test(leer("lib/billing/providers/mercadopago.ts")),
      "se admite una URL de avisos sin cifrar");
    assert(!/notification_url: `\$\{/.test(mp),
      "la URL de avisos se compone con interpolación: entonces sale del host");
  });

  check("14C. Y los artículos dicen qué se está comprando", () => {
    const mp = sinComentarios(leer("lib/billing/providers/mercadopago.ts"));
    assert(/input\.description \? \{ description: input\.description \}/.test(mp),
      "la preferencia no manda descripción");
    const uno = leer("lib/db/one-time-checkout.ts");
    const sub = leer("lib/db/upgrade-mercadopago.ts");
    assert(/description: `Suscripción Trazaloop/.test(uno),
      "la contratación no describe lo que se compra");
    assert(/description: descripcion/.test(sub),
      "la subida no describe lo que se compra");
    // Y ninguna mete precios ni identificadores nuestros en esa frase.
    assert(!/description:[^\n]*\$\{[^}]*(amount|total|id)\b/i.test(uno + sub),
      "la descripción lleva un importe o un identificador dentro");
  });

  check("14D. Y NO se inventa un apellido que nadie ha capturado", () => {
    // `profiles` sólo guarda `full_name`. Partirlo por el primer espacio sería
    // inventarse el apellido de alguien y mandárselo a un tercero.
    const mp = sinComentarios(leer("lib/billing/providers/mercadopago.ts"));
    assert(!/last_name/.test(mp),
      "se manda un apellido que no existe como dato estructurado");
    for (const f of ["lib/db/one-time-checkout.ts", "lib/db/upgrade-mercadopago.ts"]) {
      const src = sinComentarios(leer(f));
      assert(!/\.split\(" "\)/.test(src),
        `${f} parte un nombre por el espacio para fabricar un apellido`);
    }
  });

  console.log("\n9 · LO QUE SE ENCENDIÓ, Y LO QUE SIGUE CERRADO");

  check("9A. Extra ya se ofrece, y por la autoridad de decisión", () => {
    // BILLING-EXTRA-01D sustituyó la política de este tramo. Entonces el motor
    // estaba construido pero sin probar contra el proveedor, y encenderlo habría
    // sido prometer una transacción que nadie había visto completarse. Ya se vio:
    // compra, subida manual y subida recurrente, con dinero real de Sandbox.
    //
    // Lo que queda comprobado aquí es que la activación pasa por UNA autoridad y
    // no por condiciones sueltas en cada pantalla.
    const cta = leer("lib/plans/pricing-cta.ts");
    assert(/Empezar con Extra/.test(cta), "la página pública no ofrece Extra");
    assert(/CONTACT_HREF/.test(cta),
      "desapareció la salida de contacto para cuando no hay nada que ofrecer");
    const resolutor = leer("lib/billing/extra-action.ts");
    assert(/export function resolveExtraAction/.test(resolutor),
      "no existe una autoridad de decisión sobre Extra");
  });

  check("9B. Y sigue cerrado lo que no se demostró", () => {
    // La subida por medio guardado sigue preguntando por su capacidad: si ese
    // carril no puede cobrar, no se ofrece. Es la regla de 01B, intacta.
    const disp = leer("lib/billing/upgrade-availability.ts");
    assert(/wompiFromEnv/.test(disp),
      "la disponibilidad del carril de medio guardado cambió en este tramo");
    const resolutor = leer("lib/billing/extra-action.ts");
    assert(/STORED_SOURCE_UPGRADE_UNAVAILABLE/.test(resolutor),
      "el resolutor ya no contempla que ese carril no pueda cobrar");
  });

  check("9C. La liquidación sigue siendo la MISMA primitiva de 0181", () => {
    // Nada de esto duplica el motor: el camino de un pago verificado a Extra
    // sigue siendo uno solo, y recibe el proveedor como parámetro.
    const rec = sinComentarios(leer("lib/db/upgrade-mercadopago.ts"));
    assert(/billing_settle_upgrade_payment/.test(rec),
      "el carril nuevo no usa la liquidación canónica");
    assert(!/insert into billing_payments|from\("billing_payments"\)\s*\.insert/.test(rec),
      "el carril nuevo escribe pagos por su cuenta");
    const sql = leer("supabase/migrations/0216_billing_upgrade_compensation.sql");
    for (const f of ["billing_open_upgrade_intent", "billing_cancel_upgrade",
                     "billing_mark_upgrade_uncertain"]) {
      assert(!new RegExp(`create or replace function public\\.${f}\\b`).test(sql),
        `0216 reescribe ${f}, que tenía que quedarse como estaba`);
    }
  });

  console.log("\n10 · LA SEGUNDA DEVOLUCIÓN · LA AUTORIZACIÓN");

  /** Una compensación abierta sobre el carril del proveedor. */
  const compensando = (o: Partial<UpgradeSagaFacts> = {}) => hechos({
    changeStatus: "compensation_required", renewalMode: "provider",
    // Desde 01C.3 devolver el dinero es una DECISIÓN, no el camino automático.
    operatorIntent: "refund",
    deltaPayment: pago(), providerRecurringAmountBefore: FULL_RECURRENTE,
    restoreTargetAmount: FULL_RECURRENTE, ...o });

  check("10A. Con la autorización en Extra se devuelve ELLA primero", () => {
    // Y al importe ORIGINAL, no al del catálogo de hoy.
    const r = decideUpgradeStep(compensando({
      authorization: autorizacion({ observedAmountMinor: EXTRA_RECURRENTE }) }));
    assert(r.kind === "restore_authorization", `decidió ${r.kind}`);
    assert(r.amountMinor === FULL_RECURRENTE, `pide volver a ${r.amountMinor}`);
  });

  check("10B. Reversión pedida y el proveedor sigue en Extra · NO se cierra", () => {
    // El caso que da nombre a este tramo: devolver el dinero aquí dejaría una
    // autorización cobrando Extra sobre una suscripción Full.
    const r = decideUpgradeStep(compensando({
      authorization: autorizacion({ observedAmountMinor: EXTRA_RECURRENTE }),
      authorizationRestoreAttempted: true }));
    assert(r.kind === "hold" && r.reason === "RESTORE_NOT_APPLIED",
      `decidió ${r.kind}`);
  });

  check("10C. Y si no se puede leer al proveedor, tampoco se cierra", () => {
    // «No se sabe» no es «está como estaba».
    const primera = decideUpgradeStep(compensando({
      authorization: autorizacion({ observedAmountMinor: null }) }));
    assert(primera.kind === "restore_authorization",
      `la primera vez decidió ${primera.kind}`);
    const despues = decideUpgradeStep(compensando({
      authorization: autorizacion({ observedAmountMinor: null }),
      authorizationRestoreAttempted: true }));
    assert(despues.kind === "hold" && despues.reason === "PROVIDER_AMOUNT_UNKNOWN",
      `decidió ${despues.kind}`);
  });

  check("10D. Ya verificada en su importe · ahora sí se devuelve el dinero", () => {
    const porSello = decideUpgradeStep(compensando({
      providerRestored: true,
      authorization: autorizacion({ observedAmountMinor: FULL_RECURRENTE }) }));
    assert(porSello.kind === "refund", `decidió ${porSello.kind}`);
    // Y también cuando el proveedor dice el original aunque nunca llegáramos a
    // cambiarlo: lo que importa es cómo está el mundo.
    const porLectura = decideUpgradeStep(compensando({
      authorization: autorizacion({ observedAmountMinor: FULL_RECURRENTE }) }));
    assert(porLectura.kind === "refund" && porLectura.reason === "PROVIDER_ALREADY_AT_ORIGINAL",
      `decidió ${porLectura.kind}`);
  });

  check("10E. Si nunca se tocó nada fuera, no hay nada que restaurar", () => {
    const r = decideUpgradeStep(compensando({
      providerRecurringAmountBefore: null, restoreTargetAmount: null,
      authorization: autorizacion({ observedAmountMinor: FULL_RECURRENTE }) }));
    assert(r.kind === "refund" && r.reason === "NO_PROVIDER_CHANGE",
      `decidió ${r.kind}`);
  });

  check("10F. Sin saber a qué importe volver, NO se inventa uno", () => {
    const r = decideUpgradeStep(compensando({
      restoreTargetAmount: null,
      authorization: autorizacion({ observedAmountMinor: EXTRA_RECURRENTE }) }));
    assert(r.kind === "hold" && r.reason === "RESTORE_TARGET_UNKNOWN",
      `decidió ${r.kind}`);
  });

  check("10G. Un importe que no es ni el uno ni el otro se queda quieto", () => {
    const r = decideUpgradeStep(compensando({
      authorization: autorizacion({ observedAmountMinor: 333_333 }),
      authorizationRestoreAttempted: true }));
    assert(r.kind === "hold" && r.reason === "PROVIDER_AMOUNT_UNEXPECTED",
      `decidió ${r.kind}`);
  });

  check("10H. El carril manual no tiene autorización: devuelve y ya", () => {
    const r = decideUpgradeStep(hechos({
      changeStatus: "compensation_required", renewalMode: "manual",
      operatorIntent: "refund", deltaPayment: pago() }));
    assert(r.kind === "refund", `decidió ${r.kind}`);
  });

  console.log("\n10bis · EL CAMINO AUTOMÁTICO YA NO DEVUELVE DINERO SOLO");

  check("10I. Sin nadie que lo decida, una compensación abierta ESPERA", () => {
    // BILLING-EXTRA-01C.3 · Cambio de política. Devolver dinero es una decisión
    // comercial, no el desenlace por defecto de un fallo técnico. El automático
    // para, bloquea el barrido y avisa.
    const r = decideUpgradeStep(hechos({
      changeStatus: "compensation_required", renewalMode: "provider",
      deltaPayment: pago(), providerRecurringAmountBefore: FULL_RECURRENTE,
      restoreTargetAmount: FULL_RECURRENTE,
      authorization: autorizacion({ observedAmountMinor: EXTRA_RECURRENTE }) }));
    assert(r.kind === "hold" && r.reason === "ACTION_REQUIRED",
      `decidió ${r.kind}`);
  });

  check("10J. Y con alguien que decide completarlo, se completa", () => {
    // Sin saltarse NADA: pasa por las mismas comprobaciones económicas.
    const coherente = decideUpgradeStep(hechos({
      changeStatus: "compensation_required", renewalMode: "provider",
      operatorIntent: "complete", deltaPayment: pago(),
      providerRecurringAmountBefore: FULL_RECURRENTE,
      authorization: autorizacion({ observedAmountMinor: EXTRA_RECURRENTE }) }));
    assert(coherente.kind === "settle", `decidió ${coherente.kind}`);

    // Y si el mundo de fuera no está coherente, NO completa aunque se pida.
    const incoherente = decideUpgradeStep(hechos({
      changeStatus: "compensation_required", renewalMode: "provider",
      operatorIntent: "complete", deltaPayment: pago(),
      providerRecurringAmountBefore: FULL_RECURRENTE,
      authorization: autorizacion({ observedAmountMinor: FULL_RECURRENTE }) }));
    assert(incoherente.kind === "update_authorization",
      `decidió ${incoherente.kind}`);

    // Ni con un importe que no cuadra: la decisión de una persona no es un
    // salvoconducto.
    const importeMalo = decideUpgradeStep(hechos({
      changeStatus: "compensation_required", renewalMode: "manual",
      operatorIntent: "complete",
      deltaPayment: pago({ amountMinor: DELTA_TOTAL - 1 }) }));
    assert(importeMalo.kind === "compensate",
      `un importe que no cuadra decidió ${importeMalo.kind}`);
  });

  check("10K. Una fallida con dinero también se puede completar", () => {
    const sinNadie = decideUpgradeStep(hechos({
      changeStatus: "failed", deltaPayment: pago() }));
    assert(sinNadie.kind === "compensate", `decidió ${sinNadie.kind}`);
    const conNadie = decideUpgradeStep(hechos({
      changeStatus: "failed", operatorIntent: "complete", deltaPayment: pago() }));
    assert(conNadie.kind === "settle", `decidió ${conNadie.kind}`);
  });

  console.log("\n11 · UN TIEMPO DE ESPERA NO ES UN FALLO");

  check("11A. Lo que dice que se aplicó, converge", () => {
    for (const o of ["upgraded", "already_settled"]) {
      assert(classifySettlementOutcome(o) === "settled", `«${o}»`);
    }
  });

  check("11B. Lo que no puede casar nunca, compensa", () => {
    for (const o of ["reconciliation_mismatch", "environment_mismatch",
                     "provider_mismatch", "not_an_upgrade", "declined", "failed"]) {
      assert(classifySettlementOutcome(o) === "permanent", `«${o}»`);
    }
  });

  check("11C. Y todo lo demás se REINTENTA, no se compensa", () => {
    // Incluida la respuesta que no llegó. Devolver el dinero de una subida que
    // sí se aplicó sería quitarle a alguien un plan que pagó.
    for (const o of [null, "unknown", "rpc_error", "subscription_not_found"]) {
      assert(classifySettlementOutcome(o) === "retry", `«${o}»`);
    }
  });

  check("11D. Y el conciliador RELEE la fila antes de decidir que falló", () => {
    const rec = sinComentarios(leer("lib/db/upgrade-mercadopago.ts"));
    assert(/classifySettlementOutcome/.test(rec),
      "el conciliador no clasifica el desenlace de la liquidación");
    assert(/SETTLED_CONFIRMED_BY_STATE/.test(rec),
      "no se relee la autoridad interna antes de compensar");
    assert(/SETTLE_RETRYABLE/.test(rec),
      "un desenlace reintentable acaba compensando igual");
  });

  console.log("\n12 · EL IMPORTE OBJETIVO ES EL DE EXTRA");

  check("12A. `target_full_base` es la base del plan DESTINO, no la de Full", () => {
    // Con el catálogo de hoy: Full 160 000 y Extra 400 000 de base en COP.
    // El importe recurrente que deja la subida es 476 000, no 190 400.
    // Las cifras entran como datos para que el compilador no resuelva la
    // comparación por su cuenta: lo que se comprueba es la aritmética, y una
    // comparación que TypeScript declara imposible no comprueba nada.
    const baseExtra: number = 400_000, ivaExtra: number = 76_000;
    const baseFull: number = 160_000, ivaFull: number = 30_400;
    const objetivo = recurringTotalFor(baseExtra, ivaExtra);
    const deFull = recurringTotalFor(baseFull, ivaFull);
    assert(objetivo === EXTRA_RECURRENTE, `salió ${objetivo}`);
    assert(deFull === FULL_RECURRENTE, `el de Full salió ${deFull}`);
    // Aquí NO se comprueba que los dos números sean distintos: después de las
    // dos líneas de arriba eso es cierto por construcción, y una aserción que
    // el compilador puede resolver no comprueba nada. Que la columna que se usa
    // sea la de Extra y no la de Full se comprueba contra la BASE, en la suite
    // `bx01b-db`, que es donde están las columnas.
    // Y la saga pide exactamente ése al proveedor.
    const r = decideUpgradeStep(hechos({
      renewalMode: "provider", deltaPayment: pago(),
      authorization: autorizacion({ observedAmountMinor: FULL_RECURRENTE }) }));
    assert(r.kind === "update_authorization" && r.amountMinor === EXTRA_RECURRENTE,
      `pide ${r.kind === "update_authorization" ? r.amountMinor : r.kind}`);
  });

  check("12B. Y el nombre confuso queda explicado donde confunde", () => {
    const sql = leer("supabase/migrations/0217_billing_upgrade_provider_restoration.sql");
    assert(/comment on column public\.billing_subscription_changes\.target_full_base/
      .test(sql), "nadie explica qué es `target_full_base`");
    assert(/NO es la base de Full/.test(sql),
      "la explicación no dice lo único que hay que saber");
  });

  console.log(`\nBILLING-EXTRA-01B · saga: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
