import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type { TicketStatus, TicketPriority, TicketCategory, TicketModule, SlaStatus, TrustedSupportTicketInsert } from "@/lib/domain/support";

/**
 * Trazaloop · Sprint 10C · Capa de datos del Centro de soporte. Nada aquí
 * usa service_role: todo corre con la sesión real, sujeta a las RLS de
 * 0060. Toda transición de estado pasa por su RPC dedicada (reopen_/
 * assign_/update_support_ticket_status/update_support_ticket_priority) —
 * nunca un UPDATE directo desde esta capa.
 */

export type SupportTicketSummaryRow = {
  organizationId: string;
  ticketId: string;
  subject: string;
  description: string;
  category: TicketCategory;
  relatedModule: TicketModule;
  priority: TicketPriority;
  status: TicketStatus;
  createdBy: string;
  createdByName: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  firstResponseTargetAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  slaStatus: SlaStatus;
  messagesCount: number;
};

function mapSummaryRow(r: Record<string, unknown>): SupportTicketSummaryRow {
  return {
    organizationId: r.organization_id as string,
    ticketId: r.ticket_id as string,
    subject: r.subject as string,
    description: (r.description as string | null) ?? "",
    category: r.category as TicketCategory,
    relatedModule: r.related_module as TicketModule,
    priority: r.priority as TicketPriority,
    status: r.status as TicketStatus,
    createdBy: r.created_by as string,
    createdByName: (r.created_by_name as string | null) ?? null,
    assignedTo: (r.assigned_to as string | null) ?? null,
    assignedToName: (r.assigned_to_name as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    lastMessageAt: (r.last_message_at as string | null) ?? null,
    firstResponseTargetAt: (r.first_response_target_at as string | null) ?? null,
    firstResponseAt: (r.first_response_at as string | null) ?? null,
    resolvedAt: (r.resolved_at as string | null) ?? null,
    closedAt: (r.closed_at as string | null) ?? null,
    slaStatus: r.sla_status as SlaStatus,
    messagesCount: Number(r.messages_count ?? 0),
  };
}

export async function listSupportTickets(orgId: string): Promise<SupportTicketSummaryRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_support_ticket_summary")
    .select("*")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapSummaryRow);
}

export async function getSupportTicketSummary(orgId: string, ticketId: string): Promise<SupportTicketSummaryRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_support_ticket_summary")
    .select("*")
    .eq("organization_id", orgId)
    .eq("ticket_id", ticketId)
    .maybeSingle();
  return data ? mapSummaryRow(data as unknown as Record<string, unknown>) : null;
}

export type PlatformSupportTicketSummaryRow = SupportTicketSummaryRow & {
  organizationName: string;
  organizationTaxId: string | null;
  planCode: string;
  planStatus: string;
};

function mapPlatformSummaryRow(r: Record<string, unknown>): PlatformSupportTicketSummaryRow {
  return {
    ...mapSummaryRow(r),
    organizationName: r.organization_name as string,
    organizationTaxId: (r.organization_tax_id as string | null) ?? null,
    planCode: r.plan_code as string,
    planStatus: r.plan_status as string,
  };
}

export async function listPlatformSupportTickets(): Promise<PlatformSupportTicketSummaryRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase.from("v_platform_support_ticket_summary").select("*").order("updated_at", { ascending: false });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapPlatformSummaryRow);
}

export async function getPlatformSupportTicket(ticketId: string): Promise<PlatformSupportTicketSummaryRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_platform_support_ticket_summary")
    .select("*")
    .eq("ticket_id", ticketId)
    .maybeSingle();
  return data ? mapPlatformSummaryRow(data as unknown as Record<string, unknown>) : null;
}

export async function insertSupportTicket(
  orgId: string,
  payload: TrustedSupportTicketInsert,
  createdBy: string,
  firstResponseTargetAt: string
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      organization_id: orgId,
      created_by: createdBy,
      ...payload,
      first_response_target_at: firstResponseTargetAt,
    })
    .select("id")
    .single();
  if (error || !data) return { id: null, error: "No fue posible crear el ticket." };
  return { id: data.id as string, error: null };
}

export type SupportMessageRow = {
  id: string;
  authorId: string;
  authorType: "customer" | "platform";
  authorName: string | null;
  body: string;
  isInternalNote: boolean;
  createdAt: string;
};

export async function listSupportTicketMessages(ticketId: string): Promise<SupportMessageRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("support_ticket_messages")
    .select("id, author_id, author_type, body, is_internal_note, created_at, author:profiles!support_ticket_messages_author_id_fkey(full_name)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const author = (r.author ?? null) as { full_name: string | null } | null;
    return {
      id: r.id as string,
      authorId: r.author_id as string,
      authorType: r.author_type as "customer" | "platform",
      authorName: author?.full_name ?? null,
      body: r.body as string,
      isInternalNote: Boolean(r.is_internal_note),
      createdAt: r.created_at as string,
    };
  });
}

export async function insertSupportTicketMessage(
  orgId: string,
  ticketId: string,
  authorId: string,
  authorType: "customer" | "platform",
  body: string,
  isInternalNote: boolean
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.from("support_ticket_messages").insert({
    organization_id: orgId,
    ticket_id: ticketId,
    author_id: authorId,
    author_type: authorType,
    body,
    is_internal_note: isInternalNote,
  });
  if (error) return { error: "No fue posible enviar el mensaje." };
  return { error: null };
}

export type TicketStatusHistoryRow = {
  id: string;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  changedByName: string | null;
  changeNote: string | null;
  createdAt: string;
};

export async function listSupportTicketHistory(ticketId: string): Promise<TicketStatusHistoryRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("support_ticket_status_history")
    .select("id, from_status, to_status, change_note, created_at, author:profiles!support_ticket_status_history_changed_by_fkey(full_name)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const author = (r.author ?? null) as { full_name: string | null } | null;
    return {
      id: r.id as string,
      fromStatus: (r.from_status as TicketStatus | null) ?? null,
      toStatus: r.to_status as TicketStatus,
      changedByName: author?.full_name ?? null,
      changeNote: (r.change_note as string | null) ?? null,
      createdAt: r.created_at as string,
    };
  });
}

export async function reopenTicket(ticketId: string, note: string | null): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("reopen_support_ticket", { p_ticket_id: ticketId, p_note: note });
  return { error: error?.message ?? null };
}

export async function assignTicket(ticketId: string, assigneeId: string | null): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("assign_support_ticket", { p_ticket_id: ticketId, p_assignee_id: assigneeId });
  return { error: error?.message ?? null };
}

export async function updateTicketStatus(
  ticketId: string,
  toStatus: TicketStatus,
  note: string | null
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("update_support_ticket_status", {
    p_ticket_id: ticketId,
    p_to_status: toStatus,
    p_note: note,
  });
  return { error: error?.message ?? null };
}

export async function updateTicketPriority(ticketId: string, priority: TicketPriority): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("update_support_ticket_priority", { p_ticket_id: ticketId, p_priority: priority });
  return { error: error?.message ?? null };
}

/** Personal de plataforma activo, para el selector de "asignar a"
 *  (Parte 15). Nunca expone datos de otra tabla más allá de lo
 *  necesario. */
export async function listAssignablePlatformStaff(): Promise<{ userId: string; name: string | null; email: string }[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("platform_staff")
    .select("user_id, status, profile:profiles!platform_staff_user_id_fkey(full_name, email)")
    .eq("status", "active");
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const profile = (r.profile ?? null) as { full_name: string | null; email: string } | null;
    return { userId: r.user_id as string, name: profile?.full_name ?? null, email: profile?.email ?? "" };
  });
}
