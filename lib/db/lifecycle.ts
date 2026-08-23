import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { parseEligibility, type DeletionEligibility, type LifecycleEntity } from "@/lib/domain/lifecycle";

/**
 * Trazaloop · QUALITY-03.1 · Lectura del dictamen de eliminación.
 *
 * Una sola RPC para las cuatro entidades. La lógica sigue siendo la de cada
 * dominio —cada una tiene su función en SQL con sus propias preguntas—, pero
 * la aplicación pregunta siempre igual, y por eso la interfaz puede ser
 * coherente sin que ningún componente sepa de mediciones ni de revisiones.
 *
 * La RPC enmascara lo ajeno: para quien no es miembro de la empresa, la
 * respuesta es la misma que para un identificador inventado. Ni siquiera los
 * contadores se filtran, porque «ese indicador tiene 4 mediciones» ya dice
 * algo de una empresa que no es la tuya.
 */
export async function getDeletionEligibility(
  entity: LifecycleEntity,
  id: string
): Promise<DeletionEligibility> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_deletion_eligibility", {
    p_entity: entity,
    p_id: id,
  });
  if (error) {
    return parseEligibility(null); // el más conservador: no se borra
  }
  return parseEligibility(data);
}
