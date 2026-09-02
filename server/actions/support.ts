"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import {
  getSupportEntitlement,
  submitSupportTicket,
  SUPPORT_SUBMIT_MESSAGE,
  type SupportEntitlement,
  type SupportKind,
} from "@/lib/db/support-entitlements";
import { requireSession } from "@/lib/auth/require-session";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import { getOrganizationUsage } from "@/lib/db/plans";
import {
  listSupportTickets,
  getSupportTicketSummary,
  listPlatformSupportTickets,
  getPlatformSupportTicket,
  listSupportTicketMessages,
  insertSupportTicketMessage,
  listSupportTicketHistory,
  reopenTicket,
  assignTicket,
  updateTicketStatus,
  updateTicketPriority,
  listAssignablePlatformStaff,
  type SupportTicketSummaryRow,
  type PlatformSupportTicketSummaryRow,
  type SupportMessageRow,
  type TicketStatusHistoryRow,
} from "@/lib/db/support";
import {
  validateSupportTicketDraft,
  buildSupportTicketInsertPayload,
  canCreateSupportTicket,
  canReopenTicket,
  isTicketStatus,
  isTicketPriority,
  type SupportTicketDraftInput,
  type TicketStatus,
} from "@/lib/domain/support";

/**
 * Trazaloop · Sprint 10C · Server actions del Centro de soporte.
 *
 * organization_id NUNCA sale del cliente en las acciones de empresa —
 * siempre viene de requireActiveOrg(). Las acciones de plataforma exigen
 * requirePlatformStaff() en cada una. Ninguna acción usa
 * checkOrganizationCanMutate() para bloquear soporte: la excepción de
 * planes suspendidos/cancelados (Parte 12) se maneja con
 * canCreateSupportTicket, específico para este módulo — responder un
 * ticket existente SIEMPRE está permitido, sin importar el estado del
 * plan.
 */

export type SupportActionState = { error: string | null; success?: boolean; ticketId?: string };
const okState: SupportActionState = { error: null, success: true };

function revalidateSupport(ticketId?: string) {
  revalidatePath("/support");
  revalidatePath("/platform/support");
  if (ticketId) {
    revalidatePath(`/support/${ticketId}`);
    revalidatePath(`/platform/support/${ticketId}`);
  }
}

// ---------------------------------------------------------------------------
// Empresa — lecturas.
// ---------------------------------------------------------------------------
export type SupportFilters = { status?: string; category?: string; priority?: string; search?: string };

function applyFilters(rows: SupportTicketSummaryRow[], filters?: SupportFilters): SupportTicketSummaryRow[] {
  if (!filters) return rows;
  let result = rows;
  if (filters.status) result = result.filter((r) => r.status === filters.status);
  if (filters.category) result = result.filter((r) => r.category === filters.category);
  if (filters.priority) result = result.filter((r) => r.priority === filters.priority);
  if (filters.search) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter((r) => r.subject.toLowerCase().includes(q));
  }
  return result;
}

export async function listSupportTicketsAction(filters?: SupportFilters): Promise<SupportTicketSummaryRow[]> {
  const org = await requireActiveOrg();
  const rows = await listSupportTickets(org.organizationId);
  return applyFilters(rows, filters);
}

export async function getSupportTicketAction(ticketId: string): Promise<{
  ticket: SupportTicketSummaryRow | null;
  messages: SupportMessageRow[];
  canReopen: boolean;
}> {
  const org = await requireActiveOrg();
  const ticket = await getSupportTicketSummary(org.organizationId, ticketId);
  if (!ticket) return { ticket: null, messages: [], canReopen: false };
  const messages = await listSupportTicketMessages(ticketId);
  return { ticket, messages, canReopen: canReopenTicket(ticket.status) };
}

// ---------------------------------------------------------------------------
// Empresa — mutaciones.
// ---------------------------------------------------------------------------
export async function createSupportTicketAction(
  _prev: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  const org = await requireActiveOrg();

  const input: SupportTicketDraftInput = {
    subject: String(formData.get("subject") ?? ""),
    description: String(formData.get("description") ?? ""),
    category: String(formData.get("category") ?? ""),
    relatedModule: String(formData.get("related_module") ?? "other"),
    priority: String(formData.get("priority") ?? "normal"),
  };
  const validation = validateSupportTicketDraft(input);
  if (validation.error) return { error: validation.error };

  // Sprint 10C (Parte 12): excepción controlada — NUNCA
  // checkOrganizationCanMutate() aquí. Una empresa suspendida/cancelada
  // sigue pudiendo pedir ayuda sobre cuenta/acceso o plan/límites.
  const usage = await getOrganizationUsage(org.organizationId);
  const planStatus = usage?.planStatus ?? "active";
  const ticketCheck = canCreateSupportTicket(planStatus, input.category);
  if (ticketCheck.error) return { error: ticketCheck.error };

  // PE-04B5 · QUÉ se pide es una pregunta aparte de DE QUÉ va. La categoría
  // describe el tema; `support_kind` dice si es un reporte de avería —abierto a
  // los tres planes y sin consumir nada— o una orientación funcional, que solo
  // Extra incluye. Deducir el derecho comercial de la etiqueta que el cliente
  // eligió para el tema habría sido deducirlo de una palabra suya.
  const supportKind: SupportKind =
    formData.get("support_kind") === "functional_guidance" ? "functional_guidance" : "technical";

  const payload = buildSupportTicketInsertPayload(input);

  // El envío y el consumo del caso ocurren en la MISMA transacción de base: con
  // un caso libre, dos envíos simultáneos no pueden pasar los dos.
  const enviado = await submitSupportTicket({
    organizationId: org.organizationId,
    subject: payload.subject,
    description: payload.description,
    category: payload.category,
    relatedModule: payload.related_module,
    priority: payload.priority,
    supportKind,
  });
  if (!enviado.ok) return { error: SUPPORT_SUBMIT_MESSAGE[enviado.code] };

  revalidateSupport();
  return { error: null, success: true, ticketId: enviado.ticketId };
}

export async function replySupportTicketAction(
  _prev: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  const org = await requireActiveOrg();
  const { user } = await requireSession();

  // Responder un ticket existente SIEMPRE está permitido (Parte 12),
  // incluso con la cuenta suspendida/cancelada — sin ningún chequeo de
  // plan aquí, a propósito.
  const ticketId = String(formData.get("ticket_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Escribe un mensaje antes de enviarlo." };

  const ticket = await getSupportTicketSummary(org.organizationId, ticketId);
  if (!ticket) return { error: "El ticket no existe o no pertenece a tu empresa." };

  const { error } = await insertSupportTicketMessage(org.organizationId, ticketId, user.id, "customer", body, false);
  if (error) return { error };

  revalidateSupport(ticketId);
  return { ...okState, ticketId };
}

export async function reopenSupportTicketAction(
  _prev: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  await requireActiveOrg();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  const { error } = await reopenTicket(ticketId, note);
  if (error) return { error };

  revalidateSupport(ticketId);
  return { ...okState, ticketId };
}

// ---------------------------------------------------------------------------
// Plataforma — lecturas.
// ---------------------------------------------------------------------------
export async function listPlatformSupportTicketsAction(filters?: {
  status?: string;
  priority?: string;
  category?: string;
  organizationId?: string;
  assignedTo?: string;
  overdueOnly?: boolean;
}): Promise<PlatformSupportTicketSummaryRow[]> {
  await requirePlatformStaff();
  let rows = await listPlatformSupportTickets();
  if (filters?.status) rows = rows.filter((r) => r.status === filters.status);
  if (filters?.priority) rows = rows.filter((r) => r.priority === filters.priority);
  if (filters?.category) rows = rows.filter((r) => r.category === filters.category);
  if (filters?.organizationId) rows = rows.filter((r) => r.organizationId === filters.organizationId);
  if (filters?.assignedTo) rows = rows.filter((r) => r.assignedTo === filters.assignedTo);
  if (filters?.overdueOnly) rows = rows.filter((r) => r.slaStatus === "overdue");
  return rows;
}

export async function getPlatformSupportTicketAction(ticketId: string): Promise<{
  ticket: PlatformSupportTicketSummaryRow | null;
  messages: SupportMessageRow[];
  history: TicketStatusHistoryRow[];
  assignableStaff: { userId: string; name: string | null; email: string }[];
}> {
  await requirePlatformStaff();
  const ticket = await getPlatformSupportTicket(ticketId);
  if (!ticket) return { ticket: null, messages: [], history: [], assignableStaff: [] };
  const [messages, history, assignableStaff] = await Promise.all([
    listSupportTicketMessages(ticketId),
    listSupportTicketHistory(ticketId),
    listAssignablePlatformStaff(),
  ]);
  return { ticket, messages, history, assignableStaff };
}

/** Resumen de tickets de una empresa específica, para el bloque en
 *  /platform/organizations/[id] (Parte 17). */
export async function getOrganizationSupportSummaryAction(organizationId: string): Promise<{
  openCount: number;
  overdueCount: number;
  inProgressCount: number;
  latest: PlatformSupportTicketSummaryRow | null;
}> {
  await requirePlatformStaff();
  const all = await listPlatformSupportTickets();
  const rows = all.filter((r) => r.organizationId === organizationId);
  return {
    openCount: rows.filter((r) => r.status === "open" || r.status === "assigned").length,
    overdueCount: rows.filter((r) => r.slaStatus === "overdue").length,
    inProgressCount: rows.filter((r) => r.status === "in_progress" || r.status === "waiting_customer").length,
    latest: rows[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Plataforma — mutaciones.
// ---------------------------------------------------------------------------
export async function assignSupportTicketAction(
  _prev: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  await requirePlatformStaff();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const assigneeId = String(formData.get("assignee_id") ?? "").trim() || null;

  const { error } = await assignTicket(ticketId, assigneeId);
  if (error) return { error };

  revalidateSupport(ticketId);
  return { ...okState, ticketId };
}

/** Atajo "Asignarme" (Parte 15) — cualquier platform_staff activo (ya lo
 *  garantiza requirePlatformStaff, que redirige si no lo es). */
export async function assignSupportTicketToMeAction(
  _prev: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  await requirePlatformStaff();
  const { user } = await requireSession();
  const ticketId = String(formData.get("ticket_id") ?? "");

  const { error } = await assignTicket(ticketId, user.id);
  if (error) return { error };

  revalidateSupport(ticketId);
  return { ...okState, ticketId };
}

export async function updateSupportTicketStatusAction(
  _prev: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  await requirePlatformStaff();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!isTicketStatus(status)) return { error: "Estado no válido." };
  const note = String(formData.get("note") ?? "").trim() || null;

  const { error } = await updateTicketStatus(ticketId, status as TicketStatus, note);
  if (error) return { error };

  revalidateSupport(ticketId);
  return { ...okState, ticketId };
}

export async function updateSupportTicketPriorityAction(
  _prev: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  await requirePlatformStaff();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const priority = String(formData.get("priority") ?? "");
  if (!isTicketPriority(priority)) return { error: "Prioridad no válida." };

  const { error } = await updateTicketPriority(ticketId, priority);
  if (error) return { error };

  revalidateSupport(ticketId);
  return { ...okState, ticketId };
}

export async function replyPlatformSupportTicketAction(
  _prev: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  await requirePlatformStaff();
  const { user } = await requireSession();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Escribe un mensaje antes de enviarlo." };

  const ticket = await getPlatformSupportTicket(ticketId);
  if (!ticket) return { error: "El ticket no existe." };

  const { error } = await insertSupportTicketMessage(ticket.organizationId, ticketId, user.id, "platform", body, false);
  if (error) return { error };

  revalidateSupport(ticketId);
  return { ...okState, ticketId };
}

export async function addInternalSupportNoteAction(
  _prev: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  await requirePlatformStaff();
  const { user } = await requireSession();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Escribe una nota antes de guardarla." };

  const ticket = await getPlatformSupportTicket(ticketId);
  if (!ticket) return { error: "El ticket no existe." };

  const { error } = await insertSupportTicketMessage(ticket.organizationId, ticketId, user.id, "platform", body, true);
  if (error) return { error };

  revalidateSupport(ticketId);
  return { ...okState, ticketId };
}

// ---------------------------------------------------------------------------
// PE-04B5 · Lo que el plan incluye, para que la pantalla no prometa de más.
// ---------------------------------------------------------------------------
export async function getSupportEntitlementAction(): Promise<SupportEntitlement | null> {
  const org = await requireActiveOrg();
  return getSupportEntitlement(org.organizationId);
}

/**
 * PE-04B5 · El derecho de soporte de UNA empresa concreta, para la consola de
 * plataforma. La base vuelve a comprobar quién pregunta: solo un miembro o el
 * personal de plataforma obtienen respuesta.
 */
export async function getSupportEntitlementForOrganizationAction(
  organizationId: string
): Promise<SupportEntitlement | null> {
  await requirePlatformStaff();
  return getSupportEntitlement(organizationId);
}
