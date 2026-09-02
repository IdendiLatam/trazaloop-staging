import "server-only";
import type { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-04B4 · Créditos ponderados de Intelligence.
 *
 * UNA llamada al proveedor NO es UN crédito. Lo que cuesta una operación lo
 * dice el registro de pesos de la base, y una operación que no está en el
 * registro se RECHAZA: cobrarla a ojo o dejarla pasar gratis son las dos
 * maneras de que el medidor deje de significar algo.
 */
type Db = Awaited<ReturnType<typeof createServerClient>>;

/** Las razones por las que una operación de Intelligence no llega a ejecutarse.
 *  Se distinguen porque NO son la misma noticia para quien la recibe. */
export type AiDenialCode =
  | "CREDIT_LIMIT_REACHED"
  | "CONSULTATION_MODE"
  | "ENTITLEMENT_UNAVAILABLE"
  | "OPERATION_UNKNOWN"
  | "SYSTEM_ERROR";

export const AI_DENIAL_MESSAGE: Record<AiDenialCode, string> = {
  CREDIT_LIMIT_REACHED:
    "Tu empresa agotó sus créditos de Intelligence de este mes. Vuelven a estar disponibles al empezar el mes siguiente.",
  CONSULTATION_MODE:
    "Tu empresa agotó su tiempo de uso incluido en el plan Free y está en modo consulta: puedes seguir consultando, descargando y borrando, pero Intelligence no se ejecuta hasta que el cupo se reinicie.",
  ENTITLEMENT_UNAVAILABLE:
    "No se pudo comprobar lo que tu empresa tiene contratado ahora mismo. No se ejecutó nada; vuelve a intentarlo en un momento.",
  OPERATION_UNKNOWN:
    "Esta operación de Intelligence no está dada de alta. Avísanos: no se ejecutó nada.",
  SYSTEM_ERROR:
    "No fue posible preparar la operación de Intelligence. No se ejecutó nada.",
};

export type AiReservation = {
  reservationId: string;
  pool: "trial" | "monthly";
  weightCredits: number;
  reused: boolean;
};

export type AiReserveOutcome =
  | { ok: true; reservation: AiReservation }
  | { ok: false; code: AiDenialCode; detail: string | null };

function clasificar(message: string): AiDenialCode {
  if (message.includes("AI_CREDIT_LIMIT_REACHED")) return "CREDIT_LIMIT_REACHED";
  if (message.includes("CONSULTATION_MODE")) return "CONSULTATION_MODE";
  if (message.includes("ENTITLEMENT_UNAVAILABLE")) return "ENTITLEMENT_UNAVAILABLE";
  if (message.includes("AI_OPERATION_UNKNOWN")) return "OPERATION_UNKNOWN";
  return "SYSTEM_ERROR";
}

/**
 * Reserva ANTES de llamar al proveedor. Nunca después: reservar después es
 * regalar la última operación a quien llegue en el momento justo.
 */
export async function reserveAiCredits(
  db: Db,
  organizationId: string,
  operationCode: string,
  idempotencyKey?: string | null
): Promise<AiReserveOutcome> {
  const { data, error } = await db.rpc("ai_credits_reserve", {
    p_organization_id: organizationId,
    p_operation_code: operationCode,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) {
    return { ok: false, code: clasificar(error.message ?? ""), detail: error.message ?? null };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.allowed !== true || typeof row.reservation_id !== "string") {
    return { ok: false, code: "SYSTEM_ERROR", detail: null };
  }
  return {
    ok: true,
    reservation: {
      reservationId: row.reservation_id,
      pool: row.pool === "trial" ? "trial" : "monthly",
      weightCredits: Number(row.weight_credits ?? 0),
      reused: row.reused === true,
    },
  };
}

/** Se consuma SOLO con un resultado utilizable. */
export async function commitAiCredits(db: Db, reservationId: string, runId?: string | null) {
  await db.rpc("ai_credits_commit", { p_reservation_id: reservationId, p_run_id: runId ?? null });
}

/**
 * Un fallo del proveedor NO se le cobra al cliente, y sobre todo NO se le
 * cuenta como «alcanzaste tu límite». El coste real que el proveedor haya
 * incurrido se sigue registrando aparte en `quality_ai_runs`.
 */
export async function releaseAiCredits(db: Db, reservationId: string) {
  await db.rpc("ai_credits_release", { p_reservation_id: reservationId });
}

/**
 * La clave de idempotencia de una operación de Intelligence.
 *
 * No la manda el navegador —una clave que el cliente elige es una clave que el
 * cliente puede reutilizar para no pagar—. Se deriva de lo que identifica a la
 * operación más el minuto en que se pidió: un reintento del mismo envío cae en
 * la misma clave y NO cobra dos veces; la misma pregunta hecha a conciencia un
 * minuto después es otra operación y sí cuesta.
 */
export function aiIdempotencyKey(parts: {
  actorId: string;
  operationCode: string;
  payload: string;
  at?: Date;
}): string {
  const minuto = Math.floor((parts.at ?? new Date()).getTime() / 60_000);
  let h = 5381;
  const texto = `${parts.operationCode} ${parts.payload}`;
  for (let i = 0; i < texto.length; i += 1) {
    h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  }
  return `${parts.actorId}:${parts.operationCode}:${minuto}:${(h >>> 0).toString(36)}`;
}
