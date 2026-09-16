/**
 * Trazaloop · MP-REC-01 · Quién puede abrir el carril recurrente, y dónde.
 *
 * POR QUÉ ESTO EXISTE COMO UN SOLO SITIO
 *
 * Un carril nuevo que cobra solo es exactamente el tipo de cosa que se cuela en
 * Producción por acumulación de `if`: uno en la pantalla para no enseñar el
 * botón, otro en la acción para no crear la preapproval, un tercero en el
 * barrido. El día que alguien añade el cuarto camino y olvida su `if`, el
 * carril está encendido en Producción y nadie lo decidió.
 *
 * Aquí se decide UNA vez. Los llamantes preguntan; no comprueban el entorno por
 * su cuenta. Y la función es PURA —recibe el mapa de variables— para poder
 * comprobar los seis casos sin tocar `process.env` ni desplegar nada.
 *
 * LAS TRES CONDICIONES, Y POR QUÉ NO BASTA LA BANDERA
 *
 *   1. NO estar en Producción. Es la condición dura, y va primero: ninguna
 *      bandera la levanta. Encender el carril en Producción tendría que ser
 *      una decisión de código, revisada, no el efecto de una variable que
 *      alguien copió de un entorno a otro al clonar la configuración.
 *
 *   2. La bandera encendida A PROPÓSITO. Ausente es «apagado», y cualquier
 *      valor que no sea un sí explícito también: una bandera que se enciende
 *      con `"false"` porque la cadena no está vacía es un clásico, y aquí no
 *      puede pasar.
 *
 *   3. El proveedor en entorno de PRUEBAS. Mientras el carril no esté
 *      aprobado, la recurrencia solo se ejercita contra credenciales de test.
 *      Esta condición mira lo DECLARADO —`MERCADOPAGO_ENVIRONMENT`—, que es la
 *      misma autoridad que usa el resto del dominio; la identidad observada
 *      del titular la sigue comprobando quien habla con la red.
 *
 * ESTO NO DECIDE SI SE PUEDE COBRAR
 *
 * Solo dice si el CARRIL está abierto. El precio, el derecho y la elegibilidad
 * comercial siguen siendo de B1 y PE-04, y el titular y el cobrador los sigue
 * comprobando la conciliación. Una respuesta afirmativa de aquí no autoriza
 * nada por sí sola: autoriza a seguir preguntando.
 */
import { isProductionEnvironment } from "@/lib/env";

export type RecurringLaneEnv = {
  VERCEL_TARGET_ENV?: string | null;
  VERCEL_ENV?: string | null;
  /**
   * El interruptor. Ausente = apagado. Solo un sí explícito lo enciende, y
   * solo fuera de Producción.
   */
  BILLING_RECURRING_ENABLED?: string | null;
  /** El entorno DECLARADO del proveedor. Sin él no se abre el carril. */
  MERCADOPAGO_ENVIRONMENT?: string | null;
};

/**
 * Por qué está cerrado. Se nombra la causa en vez de devolver un `false` mudo:
 * un carril que no abre y no dice por qué se «arregla» encendiendo cosas al
 * azar hasta que una funciona.
 */
export type RecurringLaneClosed =
  | "RECURRING_FORBIDDEN_IN_PRODUCTION"
  | "RECURRING_FLAG_NOT_ENABLED"
  | "RECURRING_PROVIDER_ENVIRONMENT_NOT_TEST";

export type RecurringLane =
  | { open: true }
  | { open: false; reason: RecurringLaneClosed };

/** Un sí explícito, y nada más. `"1"`, `"yes"` y `"si"` NO cuentan a propósito. */
function esSiExplicito(v: string | null | undefined): boolean {
  return (v ?? "").trim().toLowerCase() === "true";
}

/**
 * ¿Está abierto el carril recurrente?
 *
 * El orden de las comprobaciones importa para el diagnóstico: primero la que
 * no se puede levantar, después la que se decide, y al final la del proveedor.
 * Así el motivo que sale es siempre el más de fondo.
 */
export function resolveRecurringLane(
  env: RecurringLaneEnv = process.env as RecurringLaneEnv
): RecurringLane {
  if (isProductionEnvironment(env as Record<string, string | undefined>)) {
    return { open: false, reason: "RECURRING_FORBIDDEN_IN_PRODUCTION" };
  }
  if (!esSiExplicito(env.BILLING_RECURRING_ENABLED)) {
    return { open: false, reason: "RECURRING_FLAG_NOT_ENABLED" };
  }
  if ((env.MERCADOPAGO_ENVIRONMENT ?? "").trim() !== "test") {
    return { open: false, reason: "RECURRING_PROVIDER_ENVIRONMENT_NOT_TEST" };
  }
  return { open: true };
}

/** Atajo para las pantallas: enseñar o no enseñar. Nunca para autorizar. */
export function isRecurringLaneOpen(env: RecurringLaneEnv = process.env as RecurringLaneEnv): boolean {
  return resolveRecurringLane(env).open;
}

/** Lo que se le dice a quien llama cuando el carril está cerrado. */
export const RECURRING_CLOSED_MESSAGE: Record<RecurringLaneClosed, string> = {
  RECURRING_FORBIDDEN_IN_PRODUCTION:
    "Esta opción todavía no está disponible.",
  RECURRING_FLAG_NOT_ENABLED:
    "Esta opción todavía no está disponible.",
  RECURRING_PROVIDER_ENVIRONMENT_NOT_TEST:
    "Esta opción todavía no está disponible.",
};
