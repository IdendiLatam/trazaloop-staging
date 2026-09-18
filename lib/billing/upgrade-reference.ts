/**
 * Trazaloop · BILLING-EXTRA-01B · Cómo se llama el cobro de una subida de plan.
 *
 *
 * POR QUÉ SALE DEL MAPEO DE WOMPI
 *
 * La referencia nació en `lib/billing/wompi/mapping.ts` porque la única pasarela
 * que cobraba subidas era Wompi. No tiene nada de Wompi: es una convención del
 * DOMINIO sobre cómo nombrar un intento cuando sale al mundo. Mercado Pago
 * necesita exactamente la misma, y dejarla donde estaba obligaba a que el carril
 * nuevo importara el mapeo de la pasarela vieja para escribir su propia
 * referencia. Eso son dos cosas atadas que no tienen por qué estarlo.
 *
 *
 * LO QUE NO CAMBIA
 *
 * Ni el formato, ni el prefijo, ni la lectura. `lib/billing/wompi/mapping.ts`
 * sigue exportando los mismos nombres —reexportados desde aquí— para que las
 * referencias YA PERSISTIDAS se sigan leyendo igual. Cambiar el texto de una
 * referencia viva sería perder la identidad de cobros que ya existen.
 *
 *
 * QUÉ IDENTIFICA Y QUÉ NO
 *
 * Identifica UN intento. No dice de quién es, ni de qué plan, ni a qué periodo
 * pertenece: eso lo dice la base mirando ese intento. El prefijo solo sirve para
 * que en el panel de la pasarela se distinga de un vistazo una subida de una
 * renovación.
 *
 * Lógica PURA: sin red, sin base de datos, sin proveedor.
 */

/** El cobro de una CONTRATACIÓN o una renovación. */
export function buildAttemptReference(attemptId: string): string {
  return `pay_${attemptId.toLowerCase()}`;
}

/** El cobro de una SUBIDA de plan. */
export function buildUpgradeReference(attemptId: string): string {
  return `upg_${attemptId.toLowerCase()}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RE_INTENTO = new RegExp(`^(?:pay|upg)_(${UUID})$`, "i");
const RE_SUBIDA = new RegExp(`^upg_(${UUID})$`, "i");

/** Solo el formato exacto. Lo que no se reconozca va a revisión. */
export function parseAttemptReference(referencia: string | null | undefined): string | null {
  if (typeof referencia !== "string") return null;
  const m = RE_INTENTO.exec(referencia.trim());
  return m ? m[1].toLowerCase() : null;
}

/**
 * Como la anterior, pero SOLO acepta una subida.
 *
 * El conciliador de subidas de Mercado Pago descubre pagos por referencia. Si
 * aceptara también `pay_`, una renovación podría entrar por la puerta de una
 * subida y saldarla. Son dos hechos financieros distintos y la diferencia está
 * escrita en el prefijo: aquí se exige.
 */
export function parseUpgradeReference(referencia: string | null | undefined): string | null {
  if (typeof referencia !== "string") return null;
  const m = RE_SUBIDA.exec(referencia.trim());
  return m ? m[1].toLowerCase() : null;
}
