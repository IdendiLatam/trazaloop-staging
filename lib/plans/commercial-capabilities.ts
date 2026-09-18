/**
 * Trazaloop · COMMERCIAL-UX-01G · Capacidades que diferencian planes y que NO
 * son una fila de `plan_revision_limits`.
 *
 *
 * POR QUÉ HACE FALTA ESTO
 *
 * La comparación de /planes se construye recorriendo los límites publicados, y
 * eso cubre dieciocho diferencias reales sin que nadie escriba una lista. Pero
 * hay capacidades que diferencian planes y cuya autoridad vive en otro sitio a
 * propósito.
 *
 * El caso concreto: los tutoriales guiados. `tutorial-access.ts` decide —«el
 * del Dashboard está en todos los planes; cualquier otro pertenece a Full»— y
 * deja escrito por qué NO es un límite por revisión: obligaría a tocar el
 * catálogo comercial cada vez que nace una pantalla, y una pantalla nueva sin
 * fila se quedaría muda sin que nadie se entere.
 *
 * Esa decisión es buena y no se toca. Lo que faltaba era CONTARLA: quien
 * compara planes no veía una diferencia que existe.
 *
 *
 * LA LÍNEA QUE ESTE MÓDULO NO CRUZA
 *
 * Aquí vive metadata de presentación —cómo se llama, cómo se explica, en qué
 * orden se lee— y NADA MÁS. Si un plan incluye algo o no lo incluye lo
 * responde la autoridad de acceso que ya existe, llamándola.
 *
 * Un `if (plan === "full")` escrito aquí sería una segunda regla de acceso, y
 * el día que la de verdad cambiara, la página seguiría prometiendo lo viejo.
 * Una prueba se pone roja si aparece.
 *
 * Lógica PURA: sin React, sin base de datos, sin sesión.
 */
import { resolveTutorialAccess } from "@/lib/domain/tutorial-access";

/** Si un plan incluye una capacidad, o si no se puede afirmar. */
export type CapabilityInclusion = "included" | "not_included" | "unknown";

export type CommercialCapability = {
  code: string;
  /** Cómo se llama para quien compara. */
  label: string;
  /** Una línea, solo si aclara algo que la etiqueta no dice. */
  description: string | null;
  /** Dónde se lee, entre las filas que salen de los límites. */
  displayOrder: number;
  /**
   * ¿Lo incluye este plan? Lo responde la AUTORIDAD, no este fichero.
   *
   * Recibe el código de plan y devuelve `unknown` cuando no se puede afirmar:
   * un plan desconocido no se responde a favor de quien pregunta.
   */
  resolve: (planCode: string) => CapabilityInclusion;
};

/**
 * Las capacidades con autoridad fuera de `plan_revision_limits`.
 *
 * Hoy hay una. La lista existe para que la segunda no nazca como un `if` en un
 * componente.
 */
export const COMMERCIAL_CAPABILITIES: readonly CommercialCapability[] = [
  {
    code: "guided_tutorials",
    label: "Tutoriales guiados",
    description:
      "El del panel está en todos los planes; los de cada módulo, en los de pago.",
    displayOrder: 50,
    resolve: (planCode) => {
      if (planCode !== "free" && planCode !== "full" && planCode !== "extra") {
        return "unknown";
      }
      // Se PREGUNTA a la autoridad, con una pantalla que no es el panel —que es
      // justamente la que distingue—. No se reimplementa su regla.
      const r = resolveTutorialAccess({ plan: planCode }, "quality.processes");
      return r.allowed ? "included" : "not_included";
    },
  },
];

/**
 * Cómo se escribe una inclusión.
 *
 * `unknown` no se escribe: quien compara no puede hacer nada con «no se sabe»,
 * y ponerlo invita a leerlo como un no.
 */
export function formatInclusion(v: CapabilityInclusion): string | null {
  if (v === "included") return "Incluido";
  if (v === "not_included") return "No incluido";
  return null;
}
