import {
  resolveMercadoPagoIdentity, type MpIdentityFailure,
} from "@/lib/billing/mercadopago/identity";

/**
 * Trazaloop · PROD-LAUNCH-01D.3A · QUIÉN COBRA la contratación self-service.
 *
 *
 * EL DEFECTO QUE ESTO CIERRA
 *
 * En el primer intento de contratar en Producción, la pantalla decía «PAGO
 * SEGURO CON WOMPI» y debajo «El pago con tarjeta no está disponible ahora
 * mismo». Las dos frases eran ciertas y juntas no tenían sentido: se anunciaba
 * una pasarela que no estaba configurada, mientras la que sí lo estaba
 * —Mercado Pago, con su tasa, su credencial y su frontera ya validadas— no se
 * llegaba a consultar.
 *
 * La causa no era una elección equivocada: era que NO HABÍA ELECCIÓN. La
 * pantalla de contratar llamaba a la base con `p_provider: 'wompi'` escrito a
 * mano. El carril de pago único de Mercado Pago existía desde
 * PROD-LAUNCH-01B y estaba entero —presupuesto, checkout, preferencia,
 * verificación en servidor, conciliación canónica, recuperación de checkout
 * abandonado— pero solo se alcanzaba desde el panel de RENOVACIÓN. Quien
 * contrataba por primera vez nunca pasaba por ahí.
 *
 *
 * POR QUÉ ESTO ES UN MÓDULO Y NO UN `if`
 *
 * Porque la pregunta «¿quién cobra?» tiene que tener UN sitio donde se
 * responde. Repartida en la pantalla, en la acción y en la base, es como se
 * llega a que tres capas crean cosas distintas — que es exactamente lo que
 * pasó.
 *
 *
 * FALLA CERRADO, Y NUNCA DE LADO
 *
 * Si el proveedor elegido no está completo, el pago NO está disponible. No se
 * cae al otro. Un respaldo silencioso entre pasarelas es de las peores cosas
 * que puede hacer un cobro: cambia en quién ingresa el dinero sin que nadie lo
 * haya decidido, y lo descubre la contabilidad tres semanas después.
 *
 * Wompi sigue en el repositorio, entera y con sus pruebas. Lo que deja de
 * existir es que se elija sola.
 *
 * Lógica PURA: recibe el entorno, no lo lee.
 */

export type PurchaseProvider = "mercadopago" | "wompi";

export type PurchaseUnavailable =
  /** El proveedor declarado no es ninguno de los que sabemos cobrar. */
  | "PROVIDER_NOT_RECOGNISED"
  /** Mercado Pago: falta el token, o la identidad no resuelve. */
  | "MERCADOPAGO_NOT_CONFIGURED"
  /** Wompi: falta su configuración pública. */
  | "WOMPI_NOT_CONFIGURED";

/**
 * La FORMA del flujo, que es lo único que la interfaz necesita saber.
 *
 *   redirect        se sale a pagar fuera y se vuelve (Checkout Pro)
 *   embedded_card   la tarjeta se escribe aquí y viaja a la pasarela
 *
 * La pantalla decide por esto y NO por la marca. Así la interfaz no nombra
 * ninguna pasarela —hay un guardián que vigila que la frontera de la pasarela
 * sean ficheros de servidor y ninguno de interfaz— y, de paso, añadir mañana
 * otra pasarela de redirección no toca ni una pantalla.
 */
export type PurchaseFlow = "redirect" | "embedded_card";

export type PurchaseRouting =
  | {
      available: true;
      provider: PurchaseProvider;
      flow: PurchaseFlow;
      /** Cómo se llama la pasarela para quien paga. Dato, no literal en la vista. */
      displayName: string;
    }
  | {
      available: false;
      /** Cuál se había elegido, si se pudo saber. Para diagnóstico, no para caer a otro. */
      provider: PurchaseProvider | null;
      reason: PurchaseUnavailable;
      /** El motivo exacto de la identidad, cuando lo hay. Nunca un secreto. */
      detail: MpIdentityFailure | "ACCESS_TOKEN_MISSING" | null;
    };

export type PurchaseRoutingEnv = {
  /**
   * La decisión EXPLÍCITA. Ausente significa Mercado Pago, que es el proveedor
   * aprobado para el lanzamiento.
   *
   * Wompi solo se elige nombrándola. Que hiciera falta nombrarla es el punto:
   * antes se usaba por omisión sin que nadie lo hubiera decidido.
   */
  BILLING_PURCHASE_PROVIDER?: string | null;
  MERCADOPAGO_ACCESS_TOKEN?: string | null;
  MERCADOPAGO_ENVIRONMENT?: string | null;
  MERCADOPAGO_EXPECTED_APPLICATION_ID?: string | null;
  MERCADOPAGO_EXPECTED_OWNER_ID?: string | null;
  WOMPI_PUBLIC_KEY?: string | null;
  WOMPI_PRIVATE_KEY?: string | null;
};

/** El proveedor DECLARADO, sin mirar si está configurado. */
export function selectedPurchaseProvider(
  env: PurchaseRoutingEnv
): PurchaseProvider | null {
  const declarado = (env.BILLING_PURCHASE_PROVIDER ?? "").trim().toLowerCase();
  if (declarado === "") return "mercadopago";
  if (declarado === "mercadopago" || declarado === "wompi") return declarado;
  // Un valor que nadie reconoce NO se corrige adivinando. Se para.
  return null;
}

const noHay = (v: string | null | undefined): boolean => (v ?? "").trim() === "";

/** Quién cobra, o por qué no se puede cobrar. */
export function resolvePurchaseRouting(env: PurchaseRoutingEnv): PurchaseRouting {
  const elegido = selectedPurchaseProvider(env);
  if (elegido === null) {
    return { available: false, provider: null,
             reason: "PROVIDER_NOT_RECOGNISED", detail: null };
  }

  if (elegido === "mercadopago") {
    if (noHay(env.MERCADOPAGO_ACCESS_TOKEN)) {
      return { available: false, provider: "mercadopago",
               reason: "MERCADOPAGO_NOT_CONFIGURED", detail: "ACCESS_TOKEN_MISSING" };
    }
    // La MISMA resolución de identidad que usa la pasarela. No una copia: si
    // aquí dijera que sí y allí que no, la pantalla ofrecería un botón que
    // falla al pulsarlo.
    const identidad = resolveMercadoPagoIdentity({
      MERCADOPAGO_ENVIRONMENT: env.MERCADOPAGO_ENVIRONMENT,
      MERCADOPAGO_EXPECTED_APPLICATION_ID: env.MERCADOPAGO_EXPECTED_APPLICATION_ID,
      MERCADOPAGO_EXPECTED_OWNER_ID: env.MERCADOPAGO_EXPECTED_OWNER_ID,
    });
    if (!identidad.ok) {
      return { available: false, provider: "mercadopago",
               reason: "MERCADOPAGO_NOT_CONFIGURED", detail: identidad.reason };
    }
    return { available: true, provider: "mercadopago",
             flow: "redirect", displayName: "Mercado Pago" };
  }

  // Wompi, elegida a propósito.
  if (noHay(env.WOMPI_PUBLIC_KEY) || noHay(env.WOMPI_PRIVATE_KEY)) {
    return { available: false, provider: "wompi",
             reason: "WOMPI_NOT_CONFIGURED", detail: null };
  }
  return { available: true, provider: "wompi",
           flow: "embedded_card", displayName: "Wompi" };
}

/**
 * Lo mismo, leyendo el entorno.
 *
 * Existe para que NINGUNA pantalla tenga que saber de qué variables depende
 * quién cobra. Cuando la pantalla las pasaba a mano, acababa nombrando la
 * pasarela —y hay un guardián, con razón, que exige que la frontera de la
 * pasarela sean ficheros de servidor y ninguno de interfaz.
 *
 * La función pura de arriba sigue siendo la que se prueba; esta solo le acerca
 * el entorno.
 */
export function resolvePurchaseRoutingFromEnv(): PurchaseRouting {
  return resolvePurchaseRouting({
    BILLING_PURCHASE_PROVIDER: process.env.BILLING_PURCHASE_PROVIDER,
    MERCADOPAGO_ACCESS_TOKEN: process.env.MERCADOPAGO_ACCESS_TOKEN,
    MERCADOPAGO_ENVIRONMENT: process.env.MERCADOPAGO_ENVIRONMENT,
    MERCADOPAGO_EXPECTED_APPLICATION_ID: process.env.MERCADOPAGO_EXPECTED_APPLICATION_ID,
    MERCADOPAGO_EXPECTED_OWNER_ID: process.env.MERCADOPAGO_EXPECTED_OWNER_ID,
    WOMPI_PUBLIC_KEY: process.env.WOMPI_PUBLIC_KEY,
    WOMPI_PRIVATE_KEY: process.env.WOMPI_PRIVATE_KEY,
  });
}

/**
 * Lo que se le dice a quien quería contratar y no puede.
 *
 * NO nombra pasarela. Quien lee esto no eligió proveedor y no puede hacer nada
 * con ese dato; nombrarlo solo sirve para anunciar una marca que justo ahora no
 * funciona, que es como empezó este defecto.
 */
export const PURCHASE_UNAVAILABLE_MESSAGE =
  "El pago en línea no está disponible ahora mismo. No se cobró nada; "
  + "vuelve a intentarlo en un momento.";
