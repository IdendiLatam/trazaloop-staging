"use server";

import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import { runQuickEdit } from "@/lib/intelligence/document-authoring/quick-edit";
import {
  QUICK_EDIT_ACTIONS, type QuickEditAction,
} from "@/lib/domain/document-authoring";
import type { ContextUsed } from "@/lib/intelligence/document-authoring/context";
import type { QuickEditSuggestion } from "@/lib/intelligence/document-authoring/schema";
import {
  getCurrentAuthoringGuidance, getSectionRoleGuidance,
} from "@/lib/db/authoring-guidance";
import { getOrganizationAuthoringContext } from "@/lib/db/organization-profile";

/**
 * Trazaloop · QUALITY-12.2C · La puerta de la asistencia de redacción.
 *
 * POR QUÉ NO USA `requireQualityForAction`
 *
 * Porque el permiso NO es de Quality. Una empresa con PCR en Full y sin Quality
 * tiene derecho a que alguien mejore la redacción de un procedimiento de PCR, y
 * exigirle Quality sería cobrarle dos veces por lo mismo.
 *
 * El módulo del documento se lee de la BASE, nunca de la petición: el cliente
 * dice qué documento, y el servidor averigua de qué módulo es. Si el cliente
 * pudiera declarar el módulo, bastaría con decir «textiles» sobre un documento
 * de Quality para que se comprobara el plan equivocado.
 *
 * LO QUE ESTA ACCIÓN NO HACE
 *
 * No guarda. No crea revisión. No aprueba. No publica. Devuelve un texto que
 * vive en la pantalla hasta que una persona decida ponerlo en su borrador.
 */

export type QuickEditState = {
  error: string | null;
  suggestion?: QuickEditSuggestion;
  used?: ContextUsed;
  runId?: string;
  model?: string;
  latencyMs?: number;
};

/** El nombre visible de cada módulo, para el cajón de datos del documento. */
const ETIQUETA_MODULO: Record<string, string> = {
  cpr: "Trazaloop PCR",
  textiles: "Trazaloop Textiles",
  quality: "Trazaloop Quality",
};

/** El código COMERCIAL de cada módulo documental. No es el mismo vocabulario. */
const MODULO_COMERCIAL: Record<string, string> = {
  cpr: "traceability_6632",
  textiles: "textiles",
  quality: "quality",
};

function readAction(form: FormData): QuickEditAction | null {
  const v = String(form.get("action") ?? "");
  return (QUICK_EDIT_ACTIONS as readonly string[]).includes(v)
    ? (v as QuickEditAction) : null;
}

export async function quickEditAction(
  _prev: QuickEditState, formData: FormData
): Promise<QuickEditState> {
  const org = await requireActiveOrg();

  const documentId = String(formData.get("document_id") ?? "").trim();
  const sectionId = String(formData.get("section_id") ?? "").trim();
  const userText = String(formData.get("user_text") ?? "");
  const action = readAction(formData);

  if (!documentId || !sectionId) return { error: "Falta el documento o la sección." };
  if (!action) return { error: "Esa mejora no existe." };

  const supabase = await createServerClient();

  // El documento y la sección se leen con la sesión de quien pide: la RLS de
  // siempre decide si los ve. Y el módulo sale de aquí, no de la petición.
  const { data: doc } = await supabase
    .from("trazadoc_documents")
    .select("id, code, title, module_key, blueprint_id, category_code, status")
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
  if (!comercial) return { error: "Este documento no admite asistencia de redacción." };

  // La guía canónica de QUALITY-12.2A. Nunca la columna congelada.
  //
  // Dos formas de direccionarla, un solo motor: por estructura cuando el
  // documento nace de una, y por papel de sección cuando no —los de Quality—.
  // Si no hay guía, se sigue: se trabaja con el texto y el perfil, y queda
  // registrado que no se usó ninguna.
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

  const r = await runQuickEdit({
    organizationId: org.organizationId,
    documentId,
    moduleKey,
    sectionKey: String(sec.section_key),
    action,
    context: {
      userText,
      guidance,
      organization,
      document: {
        moduleLabel: ETIQUETA_MODULO[moduleKey] ?? moduleKey,
        documentTitle: String(doc.title),
        documentCode: (doc.code as string | null) ?? null,
        documentType: (doc.category_code as string | null) ?? null,
        sectionTitle: String(sec.title),
        sectionKey: String(sec.section_key),
      },
    },
  }, supabase);

  if (!r.ok) return { error: r.message };

  // Deliberadamente NO se revalida ninguna ruta: no ha cambiado nada en la
  // base que la pantalla tenga que releer. La propuesta vive en la respuesta.
  return {
    error: null,
    suggestion: r.suggestion,
    used: r.used,
    runId: r.runId,
    model: r.model,
    latencyMs: r.latencyMs,
  };
}
