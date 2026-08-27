import "server-only";

import type { createServerClient } from "@/lib/supabase/server";

export type Db = Awaited<ReturnType<typeof createServerClient>>;

/**
 * Trazaloop · QUALITY-12.2D · De qué habla este documento.
 *
 * EL PROBLEMA QUE ESTE ARCHIVO RESUELVE
 *
 * Para revisar un párrafo contra Trazaloop hay que decidir CONTRA QUÉ. Y la
 * respuesta fácil —«contra lo que se parezca a lo que dice»— es la que hay que
 * evitar: si el alcance sale de las palabras del texto, cualquier párrafo que
 * mencione «compras» empieza a hablar de proveedores que nadie citó, y una
 * frase desafortunada puede pasear por la base entera.
 *
 * Así que el alcance NO sale del texto. Sale de la ESTRUCTURA:
 *
 *     DOCUMENTO
 *        ├── su cargo dueño          (columna del propio documento)
 *        └── sus procesos            (quality_process_documents)
 *              ├── cargo dueño de cada proceso
 *              ├── controles         (quality_control_activity_links)
 *              ├── indicadores       (scope_process_id)
 *              ├── riesgos           (quality_risk_processes)
 *              └── otros documentos  (del mismo proceso)
 *
 * Todas esas son relaciones que alguien creó a mano en Trazaloop. Ninguna la
 * dedujo un modelo. Un documento sin procesos atados y sin cargo dueño tiene
 * un alcance vacío, y entonces no hay revisión contextual que hacer: se dice
 * y no se gasta una llamada.
 *
 * El texto de la persona SÍ interviene, pero en un solo sitio y con una regla
 * estricta: puede hacer que un cargo o un proceso YA REGISTRADO entre en el
 * material, si la persona escribió su nombre completo. Está en
 * `observations.ts`, y la razón de que sea seguro es que no añade información
 * —la persona ya la escribió— y no puede inventar entidades: cada acierto es
 * una fila que existe.
 */

export type ReviewScope = {
  organizationId: string;
  documentId: string;
  /** Cargo dueño del documento. Es la relación más directa que hay. */
  ownerPositionId: string | null;
  /** Procesos atados al documento, en el orden en que la base los devuelve. */
  processIds: string[];
  /**
   * Fecha de corte. `null` es «ahora», que es lo único que la pantalla sabe
   * pedir hoy. La biblioteca acepta una fecha porque el modelo documental de
   * Trazaloop tiene verdad histórica y fingir que no la tiene sería peor;
   * cómo se comporta con ella está en `adapters.ts`.
   */
  asOf: string | null;
};

/** Cuántos procesos se siguen. Más de esto ya no es «el alcance del
 *  documento»: es el sistema de gestión, y para eso está el Copilot. */
export const MAX_SCOPE_PROCESSES = 4;

export type ScopeResult = { scope: ReviewScope; queries: number };

export async function resolveScope(
  db: Db,
  params: {
    organizationId: string;
    documentId: string;
    ownerPositionId: string | null;
    asOf?: string | null;
  }
): Promise<ScopeResult> {
  const { data } = await db
    .from("quality_process_documents")
    .select("process_id")
    .eq("organization_id", params.organizationId)
    .eq("document_id", params.documentId)
    .limit(MAX_SCOPE_PROCESSES);

  const processIds = (Array.isArray(data) ? data : [])
    .map((r) => String((r as Record<string, unknown>).process_id))
    .filter((id) => id && id !== "null");

  return {
    scope: {
      organizationId: params.organizationId,
      documentId: params.documentId,
      ownerPositionId: params.ownerPositionId,
      processIds: [...new Set(processIds)].slice(0, MAX_SCOPE_PROCESSES),
      asOf: params.asOf ?? null,
    },
    queries: 1,
  };
}

/** ¿Hay por dónde empezar? Sin esto no hay nada contra lo que contrastar. */
export function scopeIsEmpty(s: ReviewScope): boolean {
  return s.ownerPositionId === null && s.processIds.length === 0;
}
