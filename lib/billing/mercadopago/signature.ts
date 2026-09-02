/**
 * Trazaloop · PE-05B2 · La verificación de la firma.
 *
 * SE USA EL VERIFICADOR OFICIAL DEL SDK, NO UNA RECETA COPIADA.
 *
 * Mercado Pago publica en `mercadopago@3.6.0` un `WebhookSignatureValidator`
 * que construye el manifiesto documentado —`id:…;request-id:…;ts:…;`—, calcula
 * HMAC-SHA256 en hexadecimal con la clave secreta y compara en tiempo
 * constante. Escribir eso a mano solo añade una copia que envejece: el día que
 * el proveedor pase a `v2`, la suya se actualiza con el paquete y la nuestra
 * no. Además el validador ya contempla versiones futuras.
 *
 * LO ÚNICO QUE SE AÑADE POR ENCIMA
 *
 * 1. La ventana de tiempo. El validador la ofrece y no la impone: una firma
 *    auténtica de hace tres semanas sigue siendo auténtica, y sin ventana se
 *    puede reproducir. Se fija en cinco minutos.
 *
 * 2. La minúscula del `data.id`. La documentación dice que si el
 *    identificador trae letras mayúsculas hay que pasarlo a minúsculas antes
 *    del manifiesto; el validador del SDK no lo hace por su cuenta. Los
 *    identificadores de `preapproval` son hexadecimales, así que esto importa.
 *
 * Sin secreto configurado NO se acepta nada. Un webhook sin firma comprobable
 * es un desconocido diciendo que le pagaron.
 */
import {
  WebhookSignatureValidator, InvalidWebhookSignatureError,
} from "mercadopago";

/** Cinco minutos. Suficiente para un reintento honesto, corto para un repique. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureCheck =
  | { verified: true }
  | { verified: false; reason: string };

export function verifyMercadoPagoSignature(input: {
  xSignature: string | null | undefined;
  xRequestId: string | null | undefined;
  dataId: string | null | undefined;
  secret: string | null | undefined;
  toleranceSeconds?: number;
  now?: () => number;
}): SignatureCheck {
  if (!input.secret || input.secret.trim() === "") {
    // No es «no verificado»: es que no se puede verificar. Se dice distinto
    // para que en los registros no parezca un ataque cuando es una variable
    // sin poner.
    return { verified: false, reason: "SecretNotConfigured" };
  }
  try {
    WebhookSignatureValidator.validate({
      xSignature: input.xSignature,
      xRequestId: input.xRequestId,
      dataId: input.dataId ? input.dataId.toLowerCase() : input.dataId,
      secret: input.secret,
      toleranceSeconds: input.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS,
      now: input.now,
    });
    return { verified: true };
  } catch (e) {
    if (e instanceof InvalidWebhookSignatureError) {
      return { verified: false, reason: e.reason };
    }
    return { verified: false, reason: "ValidationError" };
  }
}
