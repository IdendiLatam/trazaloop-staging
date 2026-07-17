/**
 * Trazaloop · Sprint 10C · Lógica PURA del Centro de soporte (sin BD).
 * Espejo de support_tickets/support_ticket_messages/
 * support_ticket_status_history (0060) y de las RPC
 * reopen_support_ticket/assign_support_ticket/
 * update_support_ticket_status/update_support_ticket_priority.
 *
 * Sin imports de Supabase, de servidor ni de Next.
 */
import type { PlanStatus } from "../plans/types";

// ---------------------------------------------------------------------------
// Catálogos.
// ---------------------------------------------------------------------------
export const TICKET_STATUSES = [
  "open",
  "assigned",
  "waiting_customer",
  "in_progress",
  "resolved",
  "closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Abierto",
  assigned: "Asignado",
  waiting_customer: "En espera de la empresa",
  in_progress: "En proceso",
  resolved: "Resuelto",
  closed: "Cerrado",
};

export function isTicketStatus(v: string | null | undefined): v is TicketStatus {
  return !!v && (TICKET_STATUSES as readonly string[]).includes(v);
}

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export function isTicketPriority(v: string | null | undefined): v is TicketPriority {
  return !!v && (TICKET_PRIORITIES as readonly string[]).includes(v);
}

export const TICKET_CATEGORIES = [
  "account",
  "plan",
  "trazability",
  "evidences",
  "trazadocs",
  "imports",
  "calculation",
  "technical_support",
  "bug",
  "other",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_CATEGORY_LABEL: Record<TicketCategory, string> = {
  account: "Cuenta / acceso",
  plan: "Plan / límites",
  trazability: "Trazabilidad",
  evidences: "Evidencias",
  trazadocs: "TrazaDocs",
  imports: "Importaciones",
  calculation: "Cálculo",
  technical_support: "Soporte técnico",
  bug: "Error de plataforma",
  other: "Otro",
};

export function isTicketCategory(v: string | null | undefined): v is TicketCategory {
  return !!v && (TICKET_CATEGORIES as readonly string[]).includes(v);
}

export const TICKET_MODULES = [
  "platform",
  "cpr",
  "trazadocs",
  "diagnostic",
  "catalog",
  "evidences",
  "traceability",
  "recycled_content",
  "imports",
  "implementation",
  "settings",
  "team",
  "other",
] as const;
export type TicketModule = (typeof TICKET_MODULES)[number];

export const TICKET_MODULE_LABEL: Record<TicketModule, string> = {
  platform: "Plataforma",
  cpr: "Trazaloop CPR",
  trazadocs: "TrazaDocs",
  diagnostic: "Diagnóstico",
  catalog: "Catálogos",
  evidences: "Evidencias",
  traceability: "Trazabilidad",
  recycled_content: "Cálculo de contenido reciclado",
  imports: "Importaciones",
  implementation: "Implementación",
  settings: "Configuración",
  team: "Equipo",
  other: "Otro",
};

export function isTicketModule(v: string | null | undefined): v is TicketModule {
  return !!v && (TICKET_MODULES as readonly string[]).includes(v);
}

export const SLA_STATUSES = ["no_target", "within_target", "due_soon", "overdue", "responded"] as const;
export type SlaStatus = (typeof SLA_STATUSES)[number];

export const SLA_STATUS_LABEL: Record<SlaStatus, string> = {
  no_target: "Sin objetivo",
  within_target: "Dentro del tiempo objetivo",
  due_soon: "Próximo a vencer",
  overdue: "Vencido",
  responded: "Respondido",
};

// ---------------------------------------------------------------------------
// Mensaje operativo (Parte 8) — nunca "garantizado".
// ---------------------------------------------------------------------------
export const FIRST_RESPONSE_TARGET_MESSAGE = "Tiempo objetivo de primera respuesta: 1 día hábil.";
export const TICKET_CREATED_MESSAGE = "Ticket creado correctamente.";

// ---------------------------------------------------------------------------
// Objetivo de primera respuesta (Parte 8): siguiente día hábil (lunes a
// viernes), sin festivos por ahora. Recibe/devuelve Date en UTC — quien
// llama decide la zona horaria de presentación.
// ---------------------------------------------------------------------------
export function computeFirstResponseTargetAt(createdAt: Date): Date {
  const target = new Date(createdAt.getTime());
  target.setUTCDate(target.getUTCDate() + 1);
  // 0 = domingo, 6 = sábado. Si el "siguiente día" cae en fin de semana,
  // se corre hasta el lunes.
  const day = target.getUTCDay();
  if (day === 6) target.setUTCDate(target.getUTCDate() + 2); // sábado → lunes
  if (day === 0) target.setUTCDate(target.getUTCDate() + 1); // domingo → lunes
  return target;
}

// ---------------------------------------------------------------------------
// Estado de SLA (Parte 10) — misma lógica exacta que v_support_ticket_summary
// (0062), aquí en TypeScript para poder testear sin BD.
// ---------------------------------------------------------------------------
export function resolveSlaStatus(params: {
  firstResponseAt: Date | null;
  firstResponseTargetAt: Date | null;
  now: Date;
}): SlaStatus {
  if (params.firstResponseAt !== null) return "responded";
  if (params.firstResponseTargetAt === null) return "no_target";
  if (params.now.getTime() > params.firstResponseTargetAt.getTime()) return "overdue";
  const dueSoonThreshold = params.firstResponseTargetAt.getTime() - 4 * 60 * 60 * 1000;
  if (params.now.getTime() > dueSoonThreshold) return "due_soon";
  return "within_target";
}

// ---------------------------------------------------------------------------
// Crear ticket (Parte 14).
// ---------------------------------------------------------------------------
export type SupportTicketDraftInput = {
  subject: string;
  description: string;
  category: string;
  relatedModule: string;
  priority?: string;
};

export type SupportValidation = { error: string | null };

export function validateSupportTicketDraft(input: SupportTicketDraftInput): SupportValidation {
  if (!input.subject || input.subject.trim().length === 0) {
    return { error: "El asunto del ticket no puede estar vacío." };
  }
  if (!input.description || input.description.trim().length === 0) {
    return { error: "La descripción del ticket no puede estar vacía." };
  }
  if (!isTicketCategory(input.category)) {
    return { error: "Selecciona una categoría válida." };
  }
  if (!isTicketModule(input.relatedModule)) {
    return { error: "Selecciona un módulo relacionado válido." };
  }
  if (input.priority && !isTicketPriority(input.priority)) {
    return { error: "Selecciona una prioridad válida." };
  }
  return { error: null };
}

export type TrustedSupportTicketInsert = {
  subject: string;
  description: string;
  category: TicketCategory;
  related_module: TicketModule;
  priority: TicketPriority;
};

/** Nunca declara organization_id ni created_by — mismo patrón que el
 *  resto de los "trusted insert" del proyecto (buildCustomDocumentInsertPayload,
 *  buildInvitationInsertPayload, etc). */
export function buildSupportTicketInsertPayload(input: SupportTicketDraftInput): TrustedSupportTicketInsert {
  return {
    subject: input.subject.trim(),
    description: input.description.trim(),
    category: isTicketCategory(input.category) ? input.category : "other",
    related_module: isTicketModule(input.relatedModule) ? input.relatedModule : "other",
    priority: input.priority && isTicketPriority(input.priority) ? input.priority : "normal",
  };
}

// ---------------------------------------------------------------------------
// Excepción de plan suspendido/cancelado (Parte 12) — la ÚNICA acción del
// producto que sigue funcionando (parcialmente) en modo solo lectura:
// una empresa suspendida puede pedir ayuda para reactivarse. NUNCA usar
// checkOrganizationCanMutate() aquí (bloquearía TODOS los tickets); esta
// función es la excepción explícita y acotada.
// ---------------------------------------------------------------------------
export function canCreateSupportTicket(planStatus: PlanStatus, category: string): SupportValidation {
  if (planStatus === "active") return { error: null };
  if (category === "account" || category === "plan") return { error: null };
  return {
    error:
      "Con la cuenta suspendida o cancelada, solo puedes crear tickets sobre cuenta/acceso o plan/límites. Contacta al equipo de Trazaloop para más detalle.",
  };
}

/** Responder un ticket EXISTENTE siempre está permitido, sin importar el
 *  estado de la suscripción (Parte 12: "suspended/cancelled puede
 *  responder tickets existentes") — a diferencia de crear uno nuevo. */
export function canReplySupportTicket(): true {
  return true;
}

// ---------------------------------------------------------------------------
// Permisos por rol (Parte 11/13) — platform_staff vs. empresa.
// ---------------------------------------------------------------------------
export function canManagePlatformSupport(isPlatformStaff: boolean): boolean {
  return isPlatformStaff;
}

/** Reabrir: empresa (cualquier miembro) o platform_staff, solo si el
 *  ticket está resolved/closed. */
export function canReopenTicket(status: TicketStatus): boolean {
  return status === "resolved" || status === "closed";
}

/** Cerrar directamente desde la empresa: NO está definido en este sprint
 *  (Parte 11: "no pueden cerrar unilateralmente si no se define") —
 *  siempre false; solo plataforma cierra. */
export function canCustomerCloseTicket(): false {
  return false;
}
