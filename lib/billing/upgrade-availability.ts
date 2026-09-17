import "server-only";

/**
 * Trazaloop · COMMERCIAL-UX-01B · ¿Se puede subir de plan hoy, de verdad?
 *
 *
 * EL DEFECTO QUE ESTO CIERRA
 *
 * La pantalla ofrecía «Subir a Extra» a cualquier empresa con Full. El cobro de
 * esa mejora lo ejecuta `confirmUpgradeAction` contra **Wompi**, con un medio de
 * pago GUARDADO. La pasarela del lanzamiento es Mercado Pago, que declara
 * `supportsStoredPaymentSource: false` y no guarda ninguno.
 *
 * Resultado: un botón que promete completar una mejora y que, al pulsarlo,
 * contesta «El cobro no está disponible en este momento». Un botón muerto en una
 * pantalla de dinero no es un detalle estético: es una promesa que el producto
 * no puede cumplir, y quien la lee decide con ella.
 *
 *
 * POR QUÉ SE PREGUNTA POR CAPACIDAD Y NO POR MARCA
 *
 * Escribir `if (proveedor === "mercadopago")` habría atado esta decisión a un
 * nombre. La pregunta real no es cuál es la pasarela: es si el carril que cobra
 * la mejora puede cobrarla. El día que Mercado Pago guarde medios de pago —o
 * que la mejora aprenda a cobrarse por otro camino— esto se pone en verde solo,
 * sin que nadie tenga que acordarse de venir aquí.
 *
 *
 * LO QUE ESTO NO HACE
 *
 * No borra el carril de Wompi, que sigue entero y funcionando donde está
 * configurado. No cambia ninguna semántica financiera. Solo impide que una
 * interfaz gobernada por una pasarela sin medios guardados ofrezca una acción
 * que esa pasarela no puede completar.
 */
import { wompiFromEnv } from "@/lib/billing/providers/wompi";

export type UpgradeAvailability =
  | { transactional: true }
  | { transactional: false; reason: UpgradeUnavailable };

export type UpgradeUnavailable =
  /** El carril que cobra la mejora no está configurado en este despliegue. */
  | "UPGRADE_PROVIDER_NOT_CONFIGURED"
  /** Está configurado pero no sabe guardar un medio de pago, que es lo que la mejora necesita. */
  | "UPGRADE_PROVIDER_CANNOT_STORE_PAYMENT_SOURCE";

/**
 * ¿Puede completarse HOY una mejora de plan con cobro?
 *
 * Se mira el proveedor que la mejora usa de verdad —no el de la contratación—
 * porque son caminos distintos y hoy pueden ser pasarelas distintas.
 */
export function resolveUpgradeAvailability(): UpgradeAvailability {
  const proveedor = wompiFromEnv();
  if (proveedor.environment === null) {
    return { transactional: false, reason: "UPGRADE_PROVIDER_NOT_CONFIGURED" };
  }
  if (!proveedor.capabilities.supportsStoredPaymentSource) {
    return { transactional: false,
             reason: "UPGRADE_PROVIDER_CANNOT_STORE_PAYMENT_SOURCE" };
  }
  return { transactional: true };
}
