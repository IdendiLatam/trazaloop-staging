import "server-only";

import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01E · La cara pública, contra la base.
 *
 * `anon` NO lee ninguna tabla: todo pasa por tres funciones acotadas que
 * devuelven exactamente lo que hace falta pintar. Es el mismo patrón que
 * `/survey/[token]`, que lleva en producción desde QUALITY-12.
 *
 * Aquí no hay cliente de servicio. Si algún día alguien llama a esto desde otro
 * sitio, obtendrá lo mismo que obtiene el público: nada más.
 */

export type PublicCampaign = {
  availability: "available" | "scheduled" | "window_closed" | "closed";
  publicTitle: string;
  publicSubtitle: string | null;
  partnerName: string | null;
  diagnosticType: string;
  consentDocumentTitle: string | null;
  consentDocumentVersion: string | null;
  hasConsentDocument: boolean;
  allowResume: boolean;
  allowRepeat: boolean;
  /** Testigo firmado del formulario. Null si la campaña no admite participar. */
  formNonce: string | null;
};

type Json = Record<string, unknown>;

export async function resolvePublicCampaign(slug: string): Promise<PublicCampaign | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("public_diagnostic_resolve_campaign", {
    p_slug: slug,
  });
  if (error || !data || typeof data !== "object") return null;
  const r = data as Json;
  if (r.status !== "found") return null;
  return {
    availability: r.availability as PublicCampaign["availability"],
    publicTitle: String(r.public_title ?? ""),
    publicSubtitle: (r.public_subtitle as string) ?? null,
    partnerName: (r.partner_name as string) ?? null,
    diagnosticType: String(r.diagnostic_type ?? "pcr"),
    consentDocumentTitle: (r.consent_document_title as string) ?? null,
    consentDocumentVersion: (r.consent_document_version as string) ?? null,
    hasConsentDocument: r.has_consent_document === true,
    allowResume: r.allow_resume === true,
    allowRepeat: r.allow_repeat === true,
    formNonce: (r.form_nonce as string) ?? null,
  };
}

export type BeginOutcome =
  | { status: "created"; submissionId: string; token: string;
      /** Cuánto debe durar la cookie de continuidad. Lo decide la BASE: es la
       *  misma regla que gobierna la ventana de escritura (0199). */
      resumeMaxAge: number }
  | { status: "existing" }
  | { status: "unavailable" }
  | { status: "rate_limited" }
  | { status: "invalid" }
  | { status: "error" };

export async function beginPublicSubmission(input: {
  slug: string; name: string; email: string; phone: string | null;
  company: string; marketing: boolean; ip: string | null; nonce: string | null;
}): Promise<BeginOutcome> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("public_diagnostic_begin_submission", {
    p_slug: input.slug,
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone,
    p_company: input.company,
    p_marketing: input.marketing,
    p_ip: input.ip,
    p_nonce: input.nonce,
  });
  if (error || !data || typeof data !== "object") return { status: "error" };
  const r = data as Json;
  if (r.status === "created") {
    return {
      status: "created",
      submissionId: String(r.submission_id),
      token: String(r.token),
      resumeMaxAge: Number(r.resume_max_age ?? 0),
    };
  }
  const conocidos = ["existing", "unavailable", "rate_limited", "invalid"] as const;
  const s = conocidos.find((x) => x === r.status);
  return s ? { status: s } : { status: "error" };
}

export type ResumeOutcome =
  | { status: "found"; submissionId: string; submissionStatus: string; slug: string }
  | { status: "not_found" };

export async function resumePublicSubmission(token: string): Promise<ResumeOutcome> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("public_diagnostic_resume_submission", {
    p_token: token,
  });
  if (error || !data || typeof data !== "object") return { status: "not_found" };
  const r = data as Json;
  if (r.status !== "found") return { status: "not_found" };
  return {
    status: "found",
    submissionId: String(r.submission_id),
    submissionStatus: String(r.submission_status),
    slug: String(r.slug),
  };
}
