import "server-only";

import type { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · QUALITY-12.2F.1 · El aviso de que una empresa tocó techo.
 *
 * EL HUECO QUE CIERRA
 *
 * 12.2F dejó `ai.usage_hard_limit_reached` definido y sin nadie que lo
 * emitiera. El tipo estaba en el vocabulario del bus, el emisor lo aceptaba, y
 * las dos puertas llamaban al emisor **solo** en el caso blando: cuando el tope
 * duro deniega, la función de la base retorna antes de llegar a esa línea.
 *
 * Y esa salida temprana es correcta y no se toca. Es la misma que evita crear
 * una fila de operación para registrar un rechazo: `quality_ai_runs` es el
 * libro de lo que llegó a ejecutarse, no de lo que se intentó.
 *
 *
 * POR QUÉ SE EMITE DESDE AQUÍ Y NO DESDE LA BASE
 *
 * Porque emitirlo dentro de las funciones de la base obligaría a reescribirlas,
 * y reescribir una función es una migración. Para una emisión que falta de un
 * tipo de evento que ya existe, en un bus que ya existe, con un emisor que ya
 * existe y ya está autorizado, eso sería mover el esquema por comodidad.
 *
 * Queda una asimetría —el aviso blando se emite en SQL y el duro aquí— y
 * conviene decirla en voz alta en vez de disimularla. Se paga a cambio de no
 * tocar el esquema, y el día que haya otra razón real para reescribir esas
 * funciones, este emisor se mueve allí y esta nota se borra.
 *
 *
 * LO QUE NO HACE
 *
 * No decide nada. Se llama DESPUÉS de que el guardián haya denegado, así que no
 * puede conceder acceso ni cambiar el resultado. Y si falla, no rompe nada: un
 * aviso que no sale es un aviso perdido, no una operación rota.
 */

type Db = Awaited<ReturnType<typeof createServerClient>>;

/** La forma de la denegación que devuelve `intelligence_usage_guard`. */
export type UsageDenial = {
  reason?: string;
  used?: number;
  limit?: number;
  percent?: number;
};

/**
 * Emite el hecho si —y solo si— la denegación fue por el tope mensual.
 *
 * Las otras negativas no lo son: un tope por minuto es un doble clic y un tope
 * por hora es un script. Ninguna de las dos merece un hecho en el bus, y
 * emitirlas convertiría el bus en ruido.
 *
 * LA DEDUPLICACIÓN NO SE INVENTA AQUÍ. La resuelve `dedupe_key` en el propio
 * emisor —`tipo:empresa:AAAA-MM` con `on conflict do nothing`, respaldado por
 * un índice único—, que es el mecanismo que `work_events` ya usaba antes de
 * este sprint. Veinte pulsaciones del botón bloqueado producen **un** hecho.
 */
export async function emitHardLimitEvent(
  db: Db, organizationId: string, denial: UsageDenial
): Promise<void> {
  if (denial.reason !== "monthly_cap") return;
  try {
    await db.rpc("intelligence_emit_usage_event", {
      p_organization_id: organizationId,
      p_percent: Number(denial.percent ?? 100),
      p_used: Number(denial.used ?? 0),
      p_limit: Number(denial.limit ?? 0),
      p_hard: true,
    });
  } catch {
    // Un aviso que falla no puede tumbar la respuesta que ya tiene la persona
    // delante. El emisor de la base ya se traga sus propios errores; esto
    // cubre el viaje hasta él.
  }
}
