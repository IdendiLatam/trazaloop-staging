"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { requireSession } from "@/lib/auth/require-session";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import { getOrganizationUsage } from "@/lib/db/plans";
import {
  listSupportTickets,
  getSupportTicketSummary,
  listPlatformSupportTickets,
  getPlatformSupportTicket,
  insertSupportTicket,
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
  computeFirstResponseTargetAt,
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
  const { user } = await requireSession();

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

  const payload = buildSupportTicketInsertPayload(input);
  const targetAt = computeFirstResponseTargetAt(new Date()).toISOString();

  const { id, error } = await insertSupportTicket(org.organizationId, payload, user.id, targetAt);
  if (error || !id) return { error: error ?? "No fue posible crear el ticket." };

  revalidateSupport();
  return { error: null, success: true, ticketId: id };
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
