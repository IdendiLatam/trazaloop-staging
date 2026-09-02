import "server-only";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-04B5 · El derecho comercial de soporte.
 *
 * Tres cosas distintas que el producto no puede confundir:
 *
 *   · REPORTE TÉCNICO — «Trazaloop parece estar fallando». Está en los tres
 *     planes y no consume nada. Capar el reporte de averías con un contador
 *     comercial sería capar la información que hace falta para arreglarlas.
 *   · ORIENTACIÓN FUNCIONAL — «ayúdame a entender o usar Trazaloop». Incluida
 *     solo en Extra, dos casos al mes por empresa.
 *   · CONSULTORÍA — «revísame el sistema de gestión», «diséñame el proceso».
 *     No está incluida en ningún plan: es Acompañamiento, un servicio aparte.
 */
export const SUPPORT_KINDS = ["technical", "functional_guidance", "internal"] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];

export type SupportEntitlement = {
  state: "FOUND" | "UNAVAILABLE";
  reason: string | null;
  effectivePlan: string | null;
  technicalReportingAllowed: boolean;
  functionalGuidanceAllowed: boolean;
  functionalCasesLimit: number | null;
  functionalCasesUsed: number | null;
  functionalCasesRemaining: number | null;
  period: string | null;
  commercialPriority: "standard" | "prioritized" | null;
  /** OBJETIVO de primera respuesta. Nunca una promesa de resolución. */
  responseTarget: "1_business_day" | null;
};

function n(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : null;
}
const s = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * `null` = no se pudo leer siquiera la respuesta. Distinto de `UNAVAILABLE`,
 * que es «se leyó y no se pudo resolver el plan». En los dos casos el reporte
 * técnico sigue disponible: enterarse de que el producto está roto no puede
 * depender de haber podido resolver un plan.
 */
export async function getSupportEntitlement(orgId: string): Promise<SupportEntitlement | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("organization_support_entitlement", {
    p_organization_id: orgId,
  });
  if (error || !data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  return {
    state: row.state === "FOUND" ? "FOUND" : "UNAVAILABLE",
    reason: s(row.reason),
    effectivePlan: s(row.effective_plan),
    technicalReportingAllowed: row.technical_reporting_allowed !== false,
    functionalGuidanceAllowed: row.functional_guidance_allowed === true,
    functionalCasesLimit: n(row.functional_cases_limit),
    functionalCasesUsed: n(row.functional_cases_used),
    functionalCasesRemaining: n(row.functional_cases_remaining),
    period: s(row.period),
    commercialPriority: (s(row.commercial_priority) as SupportEntitlement["commercialPriority"]) ?? null,
    responseTarget: (s(row.response_target) as SupportEntitlement["responseTarget"]) ?? null,
  };
}

/** Las cinco maneras de que un envío no salga, que NO son la misma noticia. */
export type SupportSubmitCode =
  | "FUNCTIONAL_SUPPORT_NOT_INCLUDED"
  | "FUNCTIONAL_SUPPORT_LIMIT_REACHED"
  | "SUPPORT_ENTITLEMENT_UNAVAILABLE"
  | "SUPPORT_NOT_ALLOWED_FOR_ACCOUNT_STATE"
  | "SUPPORT_SYSTEM_ERROR";

export const SUPPORT_SUBMIT_MESSAGE: Record<SupportSubmitCode, string> = {
  FUNCTIONAL_SUPPORT_NOT_INCLUDED:
    "La orientación funcional con una persona del equipo está incluida en el plan Extra. "
    + "Con tu plan puedes reportar problemas técnicos y usar la ayuda, la FAQ, los tutoriales "
    + "e Intelligence dentro de tu cuota.",
  FUNCTIONAL_SUPPORT_LIMIT_REACHED:
    "Tu empresa ya usó los casos de orientación funcional incluidos este mes. Vuelven a estar "
    + "disponibles al empezar el mes siguiente; mientras tanto puedes reportar problemas técnicos "
    + "y usar la ayuda, la FAQ y los tutoriales.",
  SUPPORT_ENTITLEMENT_UNAVAILABLE:
    "No se pudo comprobar lo que incluye tu plan ahora mismo. No se envió nada; vuelve a "
    + "intentarlo en un momento. Si Trazaloop te está fallando, repórtalo como problema técnico: "
    + "ese canal sigue abierto.",
  SUPPORT_NOT_ALLOWED_FOR_ACCOUNT_STATE:
    "Con la cuenta en este estado solo puedes escribirnos sobre cuenta/acceso o plan/límites.",
  SUPPORT_SYSTEM_ERROR: "No fue posible enviar el ticket. Intenta de nuevo en un momento.",
};

export type SupportSubmitOutcome =
  | { ok: true; ticketId: string; consumedCase: boolean; commercialPriority: string }
  | { ok: false; code: SupportSubmitCode };

function clasificar(message: string): SupportSubmitCode {
  if (message.includes("FUNCTIONAL_SUPPORT_NOT_INCLUDED")) return "FUNCTIONAL_SUPPORT_NOT_INCLUDED";
  if (message.includes("FUNCTIONAL_SUPPORT_LIMIT_REACHED")) return "FUNCTIONAL_SUPPORT_LIMIT_REACHED";
  if (message.includes("SUPPORT_ENTITLEMENT_UNAVAILABLE")) return "SUPPORT_ENTITLEMENT_UNAVAILABLE";
  if (message.includes("SUPPORT_NOT_ALLOWED_FOR_ACCOUNT_STATE")) return "SUPPORT_NOT_ALLOWED_FOR_ACCOUNT_STATE";
  return "SUPPORT_SYSTEM_ERROR";
}

/** El caso se consume al ENVIAR con éxito, y de forma atómica en la base. */
export async function submitSupportTicket(input: {
  organizationId: string;
  subject: string;
  description: string;
  category: string;
  relatedModule: string;
  priority: string;
  supportKind: SupportKind;
}): Promise<SupportSubmitOutcome> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("support_submit_ticket", {
    p_organization_id: input.organizationId,
    p_subject: input.subject,
    p_description: input.description,
    p_category: input.category,
    p_related_module: input.relatedModule,
    p_priority: input.priority,
    p_support_kind: input.supportKind,
  });
  if (error) return { ok: false, code: clasificar(error.message ?? "") };
  const row = (data ?? {}) as Record<string, unknown>;
  if (typeof row.ticket_id !== "string") return { ok: false, code: "SUPPORT_SYSTEM_ERROR" };
  return {
    ok: true,
    ticketId: row.ticket_id,
    consumedCase: row.consumed_case === true,
    commercialPriority: String(row.commercial_priority ?? "standard"),
  };
}

export async function reclassifySupportTicket(input: {
  ticketId: string;
  toKind: SupportKind;
  reason: string;
  releaseAllowance?: boolean;
}): Promise<{ error: string | null; allowanceEffect: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("support_reclassify_ticket", {
    p_ticket_id: input.ticketId,
    p_to_kind: input.toKind,
    p_reason: input.reason,
    p_release_allowance: input.releaseAllowance ?? false,
  });
  if (error) {
    if ((error.message ?? "").includes("SUPPORT_REASON_REQUIRED")) {
      return { error: "Escribe por qué se reclasifica (al menos diez caracteres).", allowanceEffect: null };
    }
    return { error: "No fue posible reclasificar el ticket.", allowanceEffect: null };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return { error: null, allowanceEffect: s(row.allowance_effect) };
}

export async function markSupportTicketOutOfScope(
  ticketId: string,
  note: string
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("support_mark_out_of_scope", {
    p_ticket_id: ticketId,
    p_note: note,
  });
  if (error) {
    if ((error.message ?? "").includes("SUPPORT_REASON_REQUIRED")) {
      return { error: "Explica el alcance al cliente (al menos diez caracteres)." };
    }
    return { error: "No fue posible marcar el alcance del ticket." };
  }
  return { error: null };
}
