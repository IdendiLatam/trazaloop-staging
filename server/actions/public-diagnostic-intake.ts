"use server";

import { cookies, headers } from "next/headers";
import { beginPublicSubmission } from "@/lib/db/public-diagnostic-intake";
import { INTAKE_COOKIE } from "@/lib/domain/public-intake-cookies";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01E · La única escritura pública.
 *
 *
 * QUÉ DECIDE EL SERVIDOR Y QUÉ NO PUEDE ELEGIR EL NAVEGADOR
 *
 * Del formulario solo llegan cuatro datos de la persona, el consentimiento y
 * el slug. TODO lo demás lo pone la base dentro de la función: la campaña
 * —resuelta otra vez por slug, nunca por un identificador enviado—, la versión
 * del instrumento, la huella del documento de consentimiento, el estado, la
 * fecha y el testigo.
 *
 * Aceptar un `campaign_id` del cliente habría permitido escribir contra
 * cualquier campaña conociendo su identificador; aceptar una huella de
 * consentimiento habría permitido inventarse qué se aceptó.
 *
 *
 * SEÑUELO Y TIEMPO MÍNIMO, RESUELTOS EN SERVIDOR
 *
 * El campo trampa va oculto por CSS y las personas no lo rellenan. El tiempo
 * mínimo se mide contra una marca que puso el SERVIDOR al pintar la página, en
 * una cookie que el navegador no puede leer ni fabricar desde JavaScript.
 * Medirlo en el cliente no protegería de nada: un robot no ejecuta el guion.
 *
 * Y cuando se detecta, la respuesta es la MISMA que la de un envío correcto:
 * decirle a un robot que se le vio es enseñarle qué cambiar.
 */

export type IntakeState = {
  status: "idle" | "created" | "existing" | "unavailable" | "rate_limited"
        | "invalid" | "error";
  message: string | null;
};



const MENSAJE: Record<IntakeState["status"], string | null> = {
  idle: null,
  created: null,
  // MISMO texto para «ya empezaste» y «ya lo completaste»: distinguirlos
  // convertiría este formulario en un detector de quién participó, y para
  // preguntar basta con conocer un correo.
  existing: "Ya hay un diagnóstico asociado a ese correo en esta campaña. "
    + "Si fuiste tú, continúalo desde el mismo navegador donde lo empezaste.",
  unavailable: "Este diagnóstico no está disponible en este momento.",
  rate_limited: "Has hecho varios intentos seguidos. Espera un momento y vuelve a probar.",
  invalid: "Revisa los datos: falta algo o hay un campo demasiado largo.",
  error: "No fue posible continuar. Vuelve a intentarlo en un momento.",
};

/** La IP que ve el borde. Se pasa a la base para PSEUDONIMIZARLA allí; no se
 *  guarda en claro en ningún sitio y no se registra en ningún log. */
async function ipDelBorde(): Promise<string | null> {
  const h = await headers();
  const reenviada = h.get("x-forwarded-for");
  const primera = reenviada?.split(",")[0]?.trim();
  return primera || h.get("x-real-ip") || null;
}

export async function beginPublicDiagnosticAction(
  _prev: IntakeState, formData: FormData
): Promise<IntakeState> {
  const slug = String(formData.get("slug") ?? "").trim().slice(0, 80);
  if (!slug) return { status: "invalid", message: MENSAJE.invalid };

  // 1 · Señuelo. Silencioso a propósito.
  if (String(formData.get("website") ?? "").trim() !== "") {
    return { status: "created", message: null };
  }

  // 2 · El consentimiento obligatorio no se puede omitir.
  if (formData.get("consent") !== "on") {
    return {
      status: "invalid",
      message: "Para participar necesitamos tu autorización para tratar los datos.",
    };
  }

  const r = await beginPublicSubmission({
    slug,
    name: String(formData.get("name") ?? "").trim().slice(0, 160),
    email: String(formData.get("email") ?? "").trim().slice(0, 254),
    phone: String(formData.get("phone") ?? "").trim().slice(0, 40) || null,
    company: String(formData.get("company") ?? "").trim().slice(0, 200),
    marketing: formData.get("marketing") === "on",
    ip: await ipDelBorde(),
    // 3 · Tiempo mínimo: el testigo lo firmó la base al pintar la página y
    // allí se valida. Aquí solo viaja.
    nonce: String(formData.get("nonce") ?? "").slice(0, 120) || null,
  });

  if (r.status === "created") {
    // Sin testigo de sesión no hay nada que continuar: es la respuesta que se
    // le da a un envío instantáneo o al señuelo, y de eso no nace ninguna
    // participación.
    if (!("token" in r)) return { status: "created", message: null };
    const galletas = await cookies();
    // Continuidad en ESTE navegador. HttpOnly para que ningún guion la lea,
    // y de sesión: no se deja un testigo de participación viviendo en el
    // equipo indefinidamente.
    galletas.set(INTAKE_COOKIE, r.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/diagnostic",
      maxAge: 60 * 60 * 8,
    });
    return { status: "created", message: null };
  }
  return { status: r.status, message: MENSAJE[r.status] };
}
