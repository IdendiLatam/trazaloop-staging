/**
 * Trazaloop · MP-QA-HARDENING-02 · Quién paga en las pruebas de sandbox.
 *
 *
 * LO QUE FALLÓ, Y POR QUÉ MERECE UN FICHERO
 *
 * El arnés de Mercado Pago tenía DOS convenciones para el comprador de prueba:
 *
 *   · `probe_daily` lo recibía en el cuerpo y exigía la forma real que emite el
 *     proveedor, `test_user_<dígitos>@testuser.com`. Con ella creó una
 *     preaprobación TEST de verdad: HTTP 201;
 *   · `create_monthly` llevaba uno escrito a mano, `test_payer@example.com`,
 *     con un comentario que defendía no ponerlo en una variable de entorno
 *     porque «invitaría a confundirlo con un dato comercial».
 *
 * Ese razonamiento resultó falso por la vía de los hechos: Mercado Pago rechaza
 * el correo inventado con `400 · Payer is associated with a different site`, y
 * el repositorio ya lo tenía catalogado desde WCS-49142 para la variante
 * `test@testuser.com`. Un comprador de sandbox NO se puede inventar: es una
 * identidad que el proveedor crea y que pertenece a un sitio concreto —MCO en
 * nuestro caso—, así que por fuerza es CONFIGURACIÓN del entorno, no una
 * constante del código.
 *
 * Aquí vive la regla, una sola vez, para que las tres acciones no vuelvan a
 * divergir. No es lógica comercial: es identidad de fixture de QA.
 */

/**
 * La forma que emite Mercado Pago al crear una cuenta de prueba. No se acepta
 * ninguna otra: `test@testuser.com` y `test_payer@example.com` son ejemplos de
 * documentación que el proveedor rechaza, y aceptarlos solo sirve para
 * descubrirlo tarde, con una llamada de red y un error confuso.
 */
export const TEST_BUYER_PATTERN = /^test_user_[0-9]{1,25}@testuser\.com$/;

/** La forma del CLIENTE de prueba, que es otra cosa y tiene su propio uso. */
export const TEST_PAYER_CUSTOMER_PATTERN = /^test_payer_[0-9]{1,25}@testuser\.com$/;

export function isTestBuyerEmail(valor: string | null | undefined): boolean {
  return typeof valor === "string" && TEST_BUYER_PATTERN.test(valor);
}

export type TestBuyerResolution =
  | { ok: true; email: string }
  | { ok: false; reason: "TEST_BUYER_EMAIL_NOT_CONFIGURED" | "PAYER_EMAIL_FORM_NOT_ALLOWED" };

/**
 * El comprador con el que se crea una suscripción de sandbox.
 *
 * Recibe el valor y no lo busca: quien llama pasa la variable de entorno. Así
 * este módulo habla de FORMAS y no de una pasarela concreta, y la frontera de
 * PE-05B2 —los cinco ficheros que pueden nombrarla— sigue siendo la que es.
 *
 * Se valida ANTES de hablar con el proveedor: un correo mal formado tiene que
 * costar un 400 nuestro y no una llamada de red que vuelve con un mensaje
 * ajeno. Sin respaldo a ningún correo escrito a mano: si la variable falta, la
 * acción no existe, que es preferible a crear un objeto externo a nombre de
 * nadie.
 */
export function resolveConfiguredTestBuyer(
  valor: string | null | undefined
): TestBuyerResolution {
  const correo = typeof valor === "string" ? valor.trim() : "";
  if (correo === "") return { ok: false, reason: "TEST_BUYER_EMAIL_NOT_CONFIGURED" };
  if (!TEST_BUYER_PATTERN.test(correo)) {
    return { ok: false, reason: "PAYER_EMAIL_FORM_NOT_ALLOWED" };
  }
  return { ok: true, email: correo };
}

/**
 * Para poder decir en una respuesta CUÁL se usó sin publicarlo entero. El
 * correo de un comprador de prueba no es un secreto, pero tampoco hace falta
 * repartirlo en cada respuesta de diagnóstico.
 */
export function maskBuyerEmail(correo: string): string {
  const [usuario, dominio] = correo.split("@");
  if (!dominio) return "(correo ilegible)";
  const visible = usuario.slice(0, 10);
  return `${visible}…@${dominio}`;
}
