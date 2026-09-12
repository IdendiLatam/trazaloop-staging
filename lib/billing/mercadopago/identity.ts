/**
 * Trazaloop · MP-ENV-01 · De qué entorno y de qué aplicación estamos hablando.
 *
 *
 * EL FALLO QUE ESTO CIERRA, CONTADO ENTERO
 *
 * Hasta aquí el entorno del proveedor se deducía de una etiqueta de la cuenta:
 *
 *     tags.includes("test_user") ? "test" : "live"
 *
 * Eso mezcla tres cosas que no son la misma:
 *
 *   1. QUIÉN es el titular de la credencial —una persona, real o de prueba—;
 *   2. QUÉ TIPO de credencial es —de producción o de prueba de una aplicación—;
 *   3. EN QUÉ ENTORNO del proveedor estamos operando.
 *
 * Y falla en los dos sentidos. Las credenciales de PRUEBA de una aplicación
 * autentican como la cuenta productiva titular, que no lleva esa etiqueta: se
 * clasificarían como `live` estando en sandbox. Y un token propio de un
 * `test_user` se clasifica como `test` aunque pertenezca a otra aplicación
 * distinta de la nuestra.
 *
 * Lo segundo no es teórico: pasó. Un ensayo real creó una preaprobación y un
 * cobro bajo la aplicación `2865672781510830` mientras los webhooks estaban
 * configurados en otra. Firma válida, entorno «correcto», cobro real… y ni una
 * notificación, porque los objetos no eran de nuestra aplicación. La identidad
 * de la APLICACIÓN es tan necesaria como la del entorno, y hasta ahora no se
 * comprobaba en ningún sitio.
 *
 * Aquí el entorno se DECLARA y la identidad se ESPERA. Nada se deduce.
 *
 * POR QUÉ NO SE MIRA EL PREFIJO DEL TOKEN
 *
 * `TEST-…` existe, pero `APP_USR-…` aparece tanto en credenciales de producción
 * como de prueba, así que el prefijo no distingue nada y además obligaría a
 * inspeccionar un secreto para averiguar una configuración. Si hay que declarar
 * el entorno, se declara.
 */

// El tipo vive en `mapping.ts` desde PE-05B2: se reexporta para no tener dos
// verdades sobre qué es un entorno.
import type { MpEnvironment } from "./mapping";
export type { MpEnvironment };

export type MpConfiguredIdentity = {
  /** El entorno del PROVEEDOR. No es el del alojamiento. */
  environment: MpEnvironment;
  /** La aplicación cuyos webhooks tenemos configurados. */
  expectedApplicationId: number;
  /**
   * El titular que esperamos, OBSERVADO en `/users/me` con la credencial de
   * ESTE entorno. MP-ENV-01.3 · No es el «User ID del propietario» que muestra
   * el panel de la aplicación: en pruebas son distintos, porque las
   * credenciales de prueba autentican como un usuario de prueba y no como la
   * cuenta productiva que figura como dueña. Confundirlos bloquea una
   * credencial legítima, que es exactamente lo que pasó.
   */
  expectedOwnerId: number;
};

export type MpIdentityFailure =
  | "MP_ENVIRONMENT_NOT_CONFIGURED"
  | "MP_ENVIRONMENT_INVALID"
  | "MP_EXPECTED_APPLICATION_NOT_CONFIGURED"
  | "MP_EXPECTED_APPLICATION_INVALID"
  | "MP_EXPECTED_OWNER_NOT_CONFIGURED"
  | "MP_EXPECTED_OWNER_INVALID";

export type MpIdentityResolution =
  | { ok: true; value: MpConfiguredIdentity }
  | { ok: false; reason: MpIdentityFailure };

/** Un identificador del proveedor: entero positivo, venga como texto o número. */
function idPositivo(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (!/^[0-9]{1,19}$/.test(texto)) return null;
  const n = Number(texto);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * La configuración, o el motivo exacto por el que no se puede operar.
 *
 * FALLA CERRADO en los seis casos: sin entorno declarado, con un entorno que no
 * es `test` ni `live`, y sin aplicación o titular esperados. No hay valor por
 * omisión: un despliegue mal configurado tiene que negarse a hablar con el
 * proveedor, no elegir por su cuenta.
 */
export function resolveMercadoPagoIdentity(env: {
  MERCADOPAGO_ENVIRONMENT?: string | null;
  MERCADOPAGO_EXPECTED_APPLICATION_ID?: string | null;
  MERCADOPAGO_EXPECTED_OWNER_ID?: string | null;
}): MpIdentityResolution {
  const entorno = (env.MERCADOPAGO_ENVIRONMENT ?? "").trim();
  if (entorno === "") return { ok: false, reason: "MP_ENVIRONMENT_NOT_CONFIGURED" };
  if (entorno !== "test" && entorno !== "live") {
    return { ok: false, reason: "MP_ENVIRONMENT_INVALID" };
  }

  const app = (env.MERCADOPAGO_EXPECTED_APPLICATION_ID ?? "").trim();
  if (app === "") return { ok: false, reason: "MP_EXPECTED_APPLICATION_NOT_CONFIGURED" };
  const appId = idPositivo(app);
  if (appId === null) return { ok: false, reason: "MP_EXPECTED_APPLICATION_INVALID" };

  const owner = (env.MERCADOPAGO_EXPECTED_OWNER_ID ?? "").trim();
  if (owner === "") return { ok: false, reason: "MP_EXPECTED_OWNER_NOT_CONFIGURED" };
  const ownerId = idPositivo(owner);
  if (ownerId === null) return { ok: false, reason: "MP_EXPECTED_OWNER_INVALID" };

  return { ok: true, value: { environment: entorno, expectedApplicationId: appId,
                              expectedOwnerId: ownerId } };
}

/**
 * ¿El aviso viene del entorno que declaramos?
 *
 * `live_mode` ausente se rechaza SIEMPRE. Sin dato no es «da igual»: es la
 * única respuesta que no se puede comprobar, y procesarla sería procesar un
 * aviso de origen desconocido.
 */
export function environmentMatchesConfigured(
  liveMode: boolean | null | undefined, configured: MpEnvironment
): boolean {
  if (liveMode === null || liveMode === undefined) return false;
  return liveMode ? configured === "live" : configured === "test";
}

/**
 * ¿El recurso pertenece a NUESTRA aplicación?
 *
 * Sin dato se responde que no. Firma válida y entorno correcto no bastan: un
 * objeto de otra aplicación es un objeto del que no vamos a recibir avisos, y
 * conciliarlo sería atarnos a algo que no controlamos.
 */
export function applicationMatches(
  applicationId: number | string | null | undefined, expected: number
): boolean {
  const id = idPositivo(applicationId ?? null);
  return id !== null && id === expected;
}

/** ¿La credencial es del titular que esperamos? Sin dato, no. */
export function ownerMatches(
  ownerId: number | string | null | undefined, expected: number
): boolean {
  const id = idPositivo(ownerId ?? null);
  return id !== null && id === expected;
}
