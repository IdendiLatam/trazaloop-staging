import { readFileSync } from "node:fs";
import {
  resolveExtraAction, extraActionLabel, extraActionNote,
  extraActionNeedsContact, type ExtraActionFacts,
} from "../../lib/billing/extra-action";

/**
 * Trazaloop · BILLING-EXTRA-01D · Qué ve cada empresa sobre Extra.
 *
 * Doce situaciones, y en cada una una sola respuesta correcta. Elegir mal no es
 * un fallo estético: mandar a comprar a quien tiene Full le cobra el plan
 * entero en vez de la diferencia, y ofrecer un botón sobre un cobro sin
 * resolver invita a pagar dos veces.
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

const hechos = (o: Partial<ExtraActionFacts> = {}): ExtraActionFacts => ({
  billingState: "FREE", effectivePlanCode: "free",
  renewalMode: null, paymentFlow: null,
  upgradeInFlight: false, upgradeNeedsAction: false,
  isAdmin: true, storedSourceUpgradeAvailable: true, ...o });

async function main() {
  console.log("\n1 · LOS DOCE ESTADOS · UNA RESPUESTA CADA UNO");

  check("1A. Free → COMPRA", () => {
    const r = resolveExtraAction(hechos());
    assert(r.kind === "purchase" && r.actionable, `decidió ${r.kind}`);
    assert(extraActionLabel(r) === "Empezar con Extra", `dice «${extraActionLabel(r)}»`);
  });

  check("1B. Prueba de Full → COMPRA, sin crédito por la prueba", () => {
    // La prueba vale cero. Si esto resolviera a `upgrade`, alguien acabaría
    // viendo un «crédito por tu prueba» que no existe.
    const r = resolveExtraAction(hechos({
      billingState: "TRIAL_ACTIVE", effectivePlanCode: "full" }));
    assert(r.kind === "purchase", `decidió ${r.kind}`);
    assert(r.reason === "PURCHASE_FROM_TRIAL_ACTIVE", `motivo ${r.reason}`);
  });

  check("1C. Terminada → COMPRA", () => {
    const r = resolveExtraAction(hechos({
      billingState: "ENDED", effectivePlanCode: "free" }));
    assert(r.kind === "purchase", `decidió ${r.kind}`);
  });

  check("1D. Full manual por redirección → SUBIDA por ese carril", () => {
    const r = resolveExtraAction(hechos({
      billingState: "MANUAL_ACTIVE", effectivePlanCode: "full",
      renewalMode: "manual", paymentFlow: "redirect" }));
    assert(r.kind === "upgrade" && r.lane === "redirect",
      `decidió ${r.kind}/${r.lane}`);
    assert(extraActionLabel(r) === "Pasar a Extra", `dice «${extraActionLabel(r)}»`);
  });

  check("1E. Full recurrente por redirección → SUBIDA por ese carril", () => {
    const r = resolveExtraAction(hechos({
      billingState: "PROVIDER_ACTIVE", effectivePlanCode: "full",
      renewalMode: "provider", paymentFlow: "redirect" }));
    assert(r.kind === "upgrade" && r.lane === "redirect",
      `decidió ${r.kind}/${r.lane}`);
  });

  check("1F. Full con medio guardado → SUBIDA legacy, sin migrar a nadie", () => {
    const r = resolveExtraAction(hechos({
      billingState: "PROVIDER_ACTIVE", effectivePlanCode: "full",
      renewalMode: "platform", paymentFlow: "stored_source" }));
    assert(r.kind === "upgrade" && r.lane === "stored_source",
      `decidió ${r.kind}/${r.lane}`);
    assert(r.reason === "UPGRADE_STORED_SOURCE", `motivo ${r.reason}`);
    // Y si su carril no puede cobrar, no se ofrece: es lo que 01B cerró.
    const sinCobro = resolveExtraAction(hechos({
      billingState: "PROVIDER_ACTIVE", effectivePlanCode: "full",
      paymentFlow: "stored_source", storedSourceUpgradeAvailable: false }));
    assert(sinCobro.kind === "none" && !sinCobro.actionable,
      `sin carril decidió ${sinCobro.kind}`);
    assert(extraActionNeedsContact(sinCobro), "no se ofrece a dónde escribir");
  });

  check("1G. Cancelación programada → NADA, y se explica sin tecnicismos", () => {
    const r = resolveExtraAction(hechos({
      billingState: "CANCEL_AT_PERIOD_END", effectivePlanCode: "full",
      paymentFlow: "redirect" }));
    assert(r.kind === "none" && !r.actionable, `decidió ${r.kind}`);
    const nota = extraActionNote(r) ?? "";
    assert(/sigue activo/.test(nota) && /podrás contratar Extra/.test(nota),
      `dice «${nota}»`);
  });

  check("1H. Cobro a medias → CONTINUAR ése, no abrir otro", () => {
    const r = resolveExtraAction(hechos({ billingState: "PENDING_CHECKOUT" }));
    assert(r.kind === "continue_pending", `decidió ${r.kind}`);
    assert(extraActionLabel(r) === "Continuar el pago", `dice «${extraActionLabel(r)}»`);
  });

  check("1I. Subida en el aire → sólo se informa", () => {
    const r = resolveExtraAction(hechos({
      billingState: "MANUAL_ACTIVE", effectivePlanCode: "full",
      paymentFlow: "redirect", upgradeInFlight: true }));
    assert(r.kind === "in_progress" && !r.actionable, `decidió ${r.kind}`);
  });

  check("1J. Dinero sin resolver → ACCIÓN REQUERIDA, y NINGÚN pago nuevo", () => {
    // Manda sobre todo lo demás: incluso sobre un estado donde se podría subir.
    const r = resolveExtraAction(hechos({
      billingState: "MANUAL_ACTIVE", effectivePlanCode: "full",
      paymentFlow: "redirect", upgradeNeedsAction: true }));
    assert(r.kind === "action_required" && !r.actionable, `decidió ${r.kind}`);
    const nota = extraActionNote(r) ?? "";
    assert(/no te vamos a cobrar de nuevo/.test(nota), `dice «${nota}»`);
  });

  check("1K. Ya tiene Extra → ninguna acción para volver a comprarlo", () => {
    for (const estado of ["PROVIDER_ACTIVE", "MANUAL_ACTIVE", "FREE"]) {
      const r = resolveExtraAction(hechos({
        billingState: estado, effectivePlanCode: "extra" }));
      assert(r.kind === "none" && r.reason === "ALREADY_ON_EXTRA",
        `«${estado}» con Extra decidió ${r.kind}`);
    }
  });

  check("1L. Sin poder leer el estado → NINGUNA acción financiera", () => {
    for (const f of [hechos({ billingState: "UNAVAILABLE" }),
                     hechos({ effectivePlanCode: null })]) {
      const r = resolveExtraAction(f);
      assert(r.kind === "none" && !r.actionable, `decidió ${r.kind}`);
      assert(r.reason === "STATE_UNAVAILABLE", `motivo ${r.reason}`);
    }
  });

  console.log("\n2 · EL ORDEN ES LA POLÍTICA");

  check("2A. El dinero sin resolver gana a TODO lo demás", () => {
    // Incluido a un cobro a medias y a una subida en vuelo: si hay dinero
    // dentro sin resolver, nadie paga nada más.
    for (const estado of ["FREE", "TRIAL_ACTIVE", "ENDED", "PENDING_CHECKOUT",
                          "MANUAL_ACTIVE", "PROVIDER_ACTIVE"]) {
      const r = resolveExtraAction(hechos({
        billingState: estado, effectivePlanCode: "full",
        paymentFlow: "redirect", upgradeNeedsAction: true,
        upgradeInFlight: true }));
      assert(r.kind === "action_required",
        `«${estado}» con dinero sin resolver decidió ${r.kind}`);
    }
  });

  check("2B. Y un pago en duda no abre otra operación encima", () => {
    for (const estado of ["VERIFYING", "PAYMENT_PROBLEM"]) {
      const r = resolveExtraAction(hechos({
        billingState: estado, effectivePlanCode: "full",
        paymentFlow: "redirect" }));
      assert(r.kind === "none", `«${estado}» decidió ${r.kind}`);
    }
  });

  check("2C. Quien no administra sólo mira", () => {
    for (const estado of ["FREE", "MANUAL_ACTIVE", "PENDING_CHECKOUT"]) {
      const r = resolveExtraAction(hechos({
        billingState: estado, effectivePlanCode: "full",
        paymentFlow: "redirect", isAdmin: false }));
      assert(!r.actionable, `«${estado}» le ofrece un botón a quien no contrata`);
      assert(extraActionLabel(r) === null, `le enseña «${extraActionLabel(r)}»`);
    }
  });

  check("2D. Un plan concedido sin contrato NO se sube: no hay qué prorratear", () => {
    const r = resolveExtraAction(hechos({
      billingState: "GRANTED_ACTIVE", effectivePlanCode: "full",
      paymentFlow: "redirect" }));
    assert(r.kind === "none" && r.reason === "GRANTED_WITHOUT_CONTRACT",
      `decidió ${r.kind}`);
    assert(extraActionNeedsContact(r), "no se ofrece a dónde escribir");
  });

  check("2E. Y un estado que nadie ha pensado no abre nada", () => {
    // Por omisión, silencio. Lo contrario —ofrecer por si acaso— es cómo un
    // estado nuevo se convierte en un cobro inesperado.
    const r = resolveExtraAction(hechos({
      billingState: "UN_ESTADO_QUE_NO_EXISTE", effectivePlanCode: "full",
      paymentFlow: "redirect" }));
    assert(r.kind === "none", `decidió ${r.kind}`);
  });

  console.log("\n3 · LO QUE NO SE LE DICE A NADIE");

  check("3A. Ni una nota nombra vocabulario de dentro", () => {
    const PROHIBIDAS = [/preapproval/i, /upgrade/i, /settlement/i,
                        /compensation/i, /provider/i, /reconcil/i,
                        /quote/i, /entitlement/i, /mercado ?pago/i, /wompi/i];
    const estados = ["FREE", "TRIAL_ACTIVE", "ENDED", "MANUAL_ACTIVE",
                     "PROVIDER_ACTIVE", "CANCEL_AT_PERIOD_END", "PENDING_CHECKOUT",
                     "VERIFYING", "PAYMENT_PROBLEM", "DOWNGRADE_SCHEDULED",
                     "GRANTED_ACTIVE", "UNAVAILABLE"];
    for (const estado of estados) {
      for (const extra of [{}, { upgradeInFlight: true },
                           { upgradeNeedsAction: true }]) {
        const r = resolveExtraAction(hechos({
          billingState: estado, effectivePlanCode: "full",
          paymentFlow: "redirect", ...extra }));
        const texto = `${extraActionLabel(r) ?? ""} ${extraActionNote(r) ?? ""}`;
        for (const p of PROHIBIDAS) {
          assert(!p.test(texto), `«${estado}» le enseña ${p}: «${texto.trim()}»`);
        }
      }
    }
  });

  check("3B. Y una nota que pide ayuda dice a dónde escribir", () => {
    const sinCanal = resolveExtraAction(hechos({
      billingState: "CANCEL_AT_PERIOD_END", effectivePlanCode: "full" }));
    assert(!extraActionNeedsContact(sinCanal),
      "se pide escribir para algo que se resuelve solo con el tiempo");
    const conCanal = resolveExtraAction(hechos({
      billingState: "GRANTED_ACTIVE", effectivePlanCode: "full" }));
    assert(extraActionNeedsContact(conCanal), "no se ofrece canal donde hace falta");
    const pagina = leer("app/(app)/(shell)/settings/billing/page.tsx");
    assert(/extraActionNeedsContact/.test(pagina) && /CONTACT_HREF/.test(pagina),
      "la pantalla no pinta el canal de contacto");
  });

  console.log("\n4 · LA DECISIÓN VIVE EN UN SOLO SITIO");

  check("4A. La ficha pregunta, no decide", () => {
    const pagina = leer("app/(app)/(shell)/settings/billing/page.tsx");
    assert(/resolveExtraAction\(/.test(pagina), "la ficha no usa el resolutor");
    const limpio = sinComentarios(pagina);
    // Y no reconstruye la decisión con condiciones propias sobre el plan.
    assert(!/planCode === "full"[\s\S]{0,140}mejora\.transactional/.test(limpio),
      "la ficha volvió a encadenar condiciones para decidir sobre Extra");
  });

  check("4B. Y el resolutor no toca ni la base ni React", () => {
    const src = leer("lib/billing/extra-action.ts");
    for (const prohibido of ["createClient", "supabase", "server-only",
                             "useState", "from \"react\""]) {
      assert(!src.includes(prohibido),
        `el resolutor importa «${prohibido}»: entonces no se puede probar solo`);
    }
  });

  console.log("\n5 · LO QUE EL CLIENTE NUNCA MANDA");

  check("5A. Ni importes, ni identificadores del proveedor", () => {
    const acciones = leer("server/actions/billing.ts");
    // La subida recibe el CAMBIO y nada más; el importe lo congeló el intento.
    assert(/confirmUpgradeAction\(\s*changeId: string\s*\)/.test(acciones),
      "la confirmación recibe algo más que el identificador del cambio");
    assert(/quoteUpgradeAction\(\s*\n?\s*targetPlanCode: string\s*\n?\s*\)/
      .test(acciones) || /quoteUpgradeAction\(\s*targetPlanCode: string/.test(acciones),
      "presupuestar recibe algo más que el plan destino");
    const panel = leer("components/domain/billing/upgrade-panel.tsx");
    for (const prohibido of ["amount", "preapproval", "providerPaymentId",
                             "organizationId"]) {
      assert(!new RegExp(`${prohibido}\\s*[:=]`).test(panel),
        `el panel manda «${prohibido}» desde el navegador`);
    }
  });

  check("5B. Y el carril lo decide el SERVIDOR, leyendo la suscripción", () => {
    const carril = leer("lib/db/upgrade-lane.ts");
    assert(/c\.organization_id !== organizationId/.test(carril),
      "no se comprueba que el cambio sea de esa empresa");
    assert(/from\("billing_subscriptions"\)[\s\S]{0,80}provider/.test(carril),
      "el carril no se lee de la suscripción");
    // La acción no nombra ninguna pasarela: pide «cobra esta subida» al
    // despachador, con la empresa de la SESIÓN, y recibe una forma de pago.
    const acciones = leer("server/actions/billing.ts");
    assert(/organizationId: quien\.organizationId/.test(acciones),
      "la acción no deriva el carril con la empresa de la sesión");
    // Y la RAMA NUEVA no nombra ninguna pasarela. El resto del fichero sí
    // menciona Wompi —es el carril de siempre, que sigue entero— y eso no es de
    // este tramo: lo que aquí se añadió pide una forma de pago, no una marca.
    const desde = acciones.indexOf("startUpgradeCharge");
    const rama = acciones.slice(desde, acciones.indexOf("openUpgradeIntent", desde));
    assert(!/mercadopago/i.test(rama),
      "la rama nueva de cobro nombra una pasarela");
    assert(/flow === "redirect"/.test(rama),
      "la rama nueva no decide por forma de pago");
    const despacho = leer("lib/db/upgrade-reconcile.ts");
    assert(/carrilDeSubida\(input\.changeId, input\.organizationId\)/.test(despacho),
      "el despachador no comprueba de quién es el cambio");
  });

  check("5C. Y la redirección la compone el servidor, no el navegador", () => {
    const panel = leer("components/domain/billing/upgrade-panel.tsx");
    assert(/window\.location\.assign\(r\.initPoint\)/.test(panel),
      "el panel no usa el punto de entrada que dio el servidor");
    assert(!/mercadopago\.com|checkout\/v1/.test(panel),
      "el panel compone una dirección de pasarela");
  });

  console.log("\n6 · Y LAS CIFRAS SALEN DE LA AUTORIDAD");

  check("6A. El panel enseña el presupuesto CONGELADO, sin recalcular", () => {
    const panel = sinComentarios(leer("components/domain/billing/upgrade-panel.tsx"));
    // Las cuatro cifras vienen de `cuenta`, que es lo que devolvió la primitiva.
    for (const campo of ["proratedCurrentBase", "proratedTargetBase",
                         "deltaBase", "taxAmount", "totalAmount"]) {
      assert(new RegExp(`cuenta\\.${campo}`).test(panel),
        `el panel no enseña «${campo}» del presupuesto`);
    }
    // Y no hace aritmética propia con ellas.
    assert(!/cuenta\.\w+\s*[-+*/]\s*cuenta\./.test(panel),
      "el panel calcula cifras en vez de enseñar las que le dieron");
  });

  check("6B. Y ni una cifra de negocio escrita en la interfaz", () => {
    for (const f of ["lib/billing/extra-action.ts",
                     "components/domain/billing/upgrade-panel.tsx"]) {
      const src = sinComentarios(leer(f)).replace(/className="[^"]*"/g, "");
      // `100` NO entra: en este fichero es la conversión de puntos básicos a
      // porcentaje —`basisPoints / 100`—, una unidad y no un precio. Ya me pasó
      // en cux01b y el remedio es el mismo: la lista lleva importes de negocio,
      // no números.
      const cifras = [...src.matchAll(/\b(160000|400000|190400|476000|230151)\b/g)]
        .map((m) => m[0]);
      assert(cifras.length === 0,
        `${f} lleva cifras de negocio escritas: ${cifras.join(", ")}`);
    }
  });

  console.log(`\nBILLING-EXTRA-01D · activación: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
