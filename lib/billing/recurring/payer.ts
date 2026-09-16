/**
 * Trazaloop · MP-REC-01B.6 · Quién figura como pagador de una recurrencia.
 *
 *
 * POR QUÉ ESTO NO PODÍA SEGUIR SIENDO «EL CORREO DE QUIEN CONTRATA»
 *
 * El primer clic humano real en Staging mandó a Mercado Pago el correo del
 * administrador que estaba contratando. La pasarela lo rechazó.
 *
 * Y era previsible: PE-05B2 se pasó semanas contra ese mismo muro y lo dejó
 * escrito en el pack de soporte. En el sandbox de Mercado Pago el pagador NO es
 * una dirección cualquiera —`Payer is associated with a different site`, `User
 * bad request`—: es una IDENTIDAD que crea el proveedor y que pertenece a un
 * sitio concreto. No se inventa, no se deduce de la sesión y no puede venir del
 * navegador. Por fuerza es configuración del entorno.
 *
 * El arnés de MP-SBX-02C ya lo hacía bien; el camino de producto no. Esta
 * primitiva existe para que haya UN solo sitio donde se decida, y para que la
 * próxima vez que alguien escriba un disparador nuevo no vuelva a inventárselo.
 *
 *
 * PRODUCCIÓN NO ESTÁ DECIDIDA, Y FALLA CERRADO
 *
 * En producción el pagador razonable sería el contacto de facturación de la
 * empresa, pero eso todavía no está acordado y el carril recurrente sigue
 * apagado allí. Así que aquí se niega explícitamente en vez de improvisar.
 *
 * Y el comprador de pruebas NO es un respaldo productivo: usarlo en producción
 * pondría una suscripción real a nombre de una identidad sintética. Por eso la
 * rama `live` no lo mira siquiera.
 */
import {
  resolveConfiguredTestBuyer,
} from "@/lib/billing/qa/test-payer";

export type RecurringPayerEnv = {
  MERCADOPAGO_TEST_BUYER_EMAIL?: string | null;
};

export type RecurringPayerRefusal =
  /** El carril recurrente no tiene pagador definido en producción. */
  | "RECURRING_PAYER_NOT_IMPLEMENTED_IN_PRODUCTION"
  /** Falta la identidad de comprador de pruebas, o no tiene la forma exigida. */
  | "RECURRING_TEST_BUYER_NOT_CONFIGURED";

export type RecurringPayer =
  | { ok: true; email: string; source: "configured_test_buyer" }
  | { ok: false; reason: RecurringPayerRefusal };

/**
 * ¿A nombre de quién se crea la preapproval?
 *
 * Función PURA: recibe el entorno declarado y el mapa de variables, para poder
 * comprobar los cuatro casos sin desplegar y sin credenciales.
 *
 * NO recibe —ni debe recibir— el correo de la sesión, el del administrador ni
 * ninguno del navegador. Que no exista ese parámetro es la garantía: no se
 * puede pasar por error algo que la firma no admite.
 */
export function resolveRecurringPayer(
  environment: "test" | "live",
  env: RecurringPayerEnv = process.env as RecurringPayerEnv
): RecurringPayer {
  if (environment === "live") {
    return { ok: false, reason: "RECURRING_PAYER_NOT_IMPLEMENTED_IN_PRODUCTION" };
  }
  // La forma la valida `resolveConfiguredTestBuyer`, que es la misma que usan
  // las sondas del proveedor. Un correo mal formado tiene que costar un
  // rechazo nuestro y no una llamada que vuelve con un mensaje ajeno.
  const comprador = resolveConfiguredTestBuyer(env.MERCADOPAGO_TEST_BUYER_EMAIL);
  if (!comprador.ok) {
    return { ok: false, reason: "RECURRING_TEST_BUYER_NOT_CONFIGURED" };
  }
  return { ok: true, email: comprador.email, source: "configured_test_buyer" };
}

/** Lo que ve quien contrata. Nunca un código, nunca el nombre de la pasarela. */
export const RECURRING_PAYER_MESSAGE: Record<RecurringPayerRefusal, string> = {
  RECURRING_PAYER_NOT_IMPLEMENTED_IN_PRODUCTION:
    "Esta opción todavía no está disponible.",
  RECURRING_TEST_BUYER_NOT_CONFIGURED:
    "Esta opción todavía no está disponible.",
};
