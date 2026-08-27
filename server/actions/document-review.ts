"use server";

import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import { runContextualReview } from "@/lib/intelligence/document-review/contextual-review";
import type { DocumentReview } from "@/lib/intelligence/document-review/schema";
import type { ReviewContextUsed } from "@/lib/intelligence/document-review/context";
import type { ReviewRef } from "@/lib/intelligence/document-review/facts";
import {
  getCurrentAuthoringGuidance, getSectionRoleGuidance,
} from "@/lib/db/authoring-guidance";
import { getOrganizationAuthoringContext } from "@/lib/db/organization-profile";

/**
 * Trazaloop · QUALITY-12.2D · La puerta de la revisión contextual.
 *
 * Hereda de 12.2C las dos decisiones que importan y por las mismas razones.
 *
 * La primera: NO usa `requireQualityForAction`. El permiso es del MÓDULO DEL
 * DOCUMENTO. Una empresa con PCR en Full y sin Quality tiene derecho a que
 * alguien revise si su procedimiento de PCR contradice lo que ella misma tiene
 * registrado; exigirle Quality sería cobrarle dos veces por lo mismo.
 *
 * La segunda: el módulo se LEE de la base. El cliente dice qué documento y el
 * servidor averigua de qué módulo es. Si el cliente pudiera declararlo,
 * bastaría con decir «textiles» sobre un documento de Quality para que se
 * comprobara el plan equivocado.
 *
 * LO QUE ESTA ACCIÓN NO HACE, Y CONVIENE LEERLO DOS VECES
 *
 * No guarda. No crea revisión. No aprueba. No abre un caso. No crea una acción.
 * No cambia el estado de nada. Devuelve una lista de cosas que mirar, y esa
 * lista tampoco se guarda: vive en la respuesta.
 */

export type DocumentReviewState = {
  error: string | null;
  review?: DocumentReview;
  used?: ReviewContextUsed;
  sources?: ReviewRef[];
  /** Las fuentes de cada hallazgo, alineadas con `review.findings`. */
  findingSources?: ReviewRef[][];
  providerCalled?: boolean;
  runId?: string | null;
  model?: string;
  latencyMs?: number;
};

const ETIQUETA_MODULO: Record<string, string> = {
  cpr: "Trazaloop PCR",
  textiles: "Trazaloop Textiles",
  quality: "Trazaloop Quality",
};

/** El código COMERCIAL de cada módulo documental. No es el mismo vocabulario,
 *  y confundirlos ya costó un defecto en QUALITY-12.2A. */
const MODULO_COMERCIAL: Record<string, string> = {
  cpr: "traceability_6632",
  textiles: "textiles",
  quality: "quality",
};

export async function contextualReviewAction(
  _prev: DocumentReviewState, formData: FormData
): Promise<DocumentReviewState> {
  const org = await requireActiveOrg();

  const documentId = String(formData.get("document_id") ?? "").trim();
  const sectionId = String(formData.get("section_id") ?? "").trim();
  const userText = String(formData.get("user_text") ?? "");

  if (!documentId || !sectionId) return { error: "Falta el documento o la sección." };

  const supabase = await createServerClient();

  // El documento y la sección se leen con la sesión de quien pide: la RLS de
  // siempre decide si los ve. `owner_position_id` es la relación más directa
  // que hay entre un documento y un cargo, y es de donde arranca el alcance.
  const { data: doc } = await supabase
    .from("trazadoc_documents")
    .select("id, code, title, module_key, blueprint_id, category_code, status, owner_position_id")
    .eq("id", documentId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!doc) return { error: "Ese documento no existe o no pertenece a tu empresa." };

  const { data: sec } = await supabase
    .from("trazadoc_document_sections")
    .select("id, section_key, title")
    .eq("id", sectionId)
    .eq("document_id", documentId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!sec) return { error: "Esa sección no pertenece a este documento." };

  const moduleKey = String(doc.module_key ?? "");
  const comercial = MODULO_COMERCIAL[moduleKey];
  if (!comercial) return { error: "Este documento no admite revisión contextual." };

  // La guía canónica de QUALITY-12.2A, que es la que trae
  // `related_context_types` y por tanto la que decide qué se busca. Nunca la
  // columna congelada de la sección.
  const guidance = doc.blueprint_id
    ? (await getCurrentAuthoringGuidance({
        organizationId: org.organizationId,
        moduleCode: comercial,
        blueprintId: String(doc.blueprint_id),
      })).find((g) => g.blueprintSectionId !== null
        && g.sectionKey === String(sec.section_key)) ?? null
    : (await getSectionRoleGuidance({
        organizationId: org.organizationId,
        moduleCode: comercial,
        guidanceModule: moduleKey,
        sectionKeys: [String(sec.section_key)],
      }))[0] ?? null;

  const organization = await getOrganizationAuthoringContext(org.organizationId);

  const r = await runContextualReview({
    organizationId: org.organizationId,
    documentId,
    moduleKey,
    sectionKey: String(sec.section_key),
    userText,
    guidance,
    organization,
    ownerPositionId: (doc.owner_position_id as string | null) ?? null,
    document: {
      moduleLabel: ETIQUETA_MODULO[moduleKey] ?? moduleKey,
      documentTitle: String(doc.title),
      documentCode: (doc.code as string | null) ?? null,
      documentType: (doc.category_code as string | null) ?? null,
      sectionTitle: String(sec.title),
      sectionKey: String(sec.section_key),
    },
    // La pantalla revisa SIEMPRE el borrador vivo contra el estado de hoy. La
    // biblioteca acepta una fecha —y se comporta bien con ella, apagando los
    // dominios que no saben reconstruir el pasado—, pero hoy no hay ningún
    // sitio en la interfaz desde donde se pueda pedir una revisión histórica,
    // y ofrecer un parámetro que nadie puede rellenar sería inventarse un caso.
    asOf: null,
  }, supabase);

  if (!r.ok) return { error: r.message };

  // No se revalida ninguna ruta: no ha cambiado nada en la base que la
  // pantalla tenga que releer. Los hallazgos viven en esta respuesta.
  return {
    error: null,
    review: r.review,
    used: r.used,
    sources: r.sources,
    findingSources: r.findingSources,
    providerCalled: r.providerCalled,
    runId: r.runId,
    model: r.model,
    latencyMs: r.latencyMs,
  };
}
