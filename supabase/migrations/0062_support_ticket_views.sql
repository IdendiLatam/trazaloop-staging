-- 0062_support_ticket_views.sql
-- Trazaloop · Sprint 10C · Vistas de resumen de tickets de soporte.
--
-- v_support_ticket_summary: security_invoker=true — hereda la RLS real
-- de support_tickets/support_ticket_messages. El conteo de mensajes usa
-- una subconsulta correlacionada que, al heredar los privilegios de
-- quien consulta (security_invoker), automáticamente excluye notas
-- internas para un usuario de empresa y las incluye para platform_staff
-- — sin necesidad de duplicar la lógica de visibilidad aquí.
--
-- v_platform_support_ticket_summary: MISMO patrón que
-- v_platform_organizations (0041) / v_organization_plan_usage (0052) —
-- guarda is_platform_staff() embebida en la vista misma (nunca
-- security_invoker), porque debe mostrar tickets de TODAS las empresas a
-- la vez, incluidas las que el superadmin no integra como miembro.

create view public.v_support_ticket_summary
with (security_invoker = true) as
select
  t.organization_id,
  t.id                                                                          as ticket_id,
  t.subject,
  t.category,
  t.related_module,
  t.priority,
  t.status,
  t.created_by,
  creator.full_name                                                            as created_by_name,
  t.assigned_to,
  assignee.full_name                                                           as assigned_to_name,
  t.created_at,
  t.updated_at,
  t.last_message_at,
  t.first_response_target_at,
  t.first_response_at,
  t.resolved_at,
  t.closed_at,
  case
    when t.first_response_at is not null then 'responded'
    when t.first_response_target_at is null then 'no_target'
    when now() > t.first_response_target_at then 'overdue'
    when now() > (t.first_response_target_at - interval '4 hours') then 'due_soon'
    else 'within_target'
  end                                                                           as sla_status,
  coalesce(msg.messages_count, 0)                                              as messages_count
from public.support_tickets t
left join public.profiles creator on creator.id = t.created_by
left join public.profiles assignee on assignee.id = t.assigned_to
left join (
  select ticket_id, count(*) as messages_count
  from public.support_ticket_messages
  group by ticket_id
) msg on msg.ticket_id = t.id;

create view public.v_platform_support_ticket_summary as
select
  s.*,
  o.name          as organization_name,
  o.tax_id        as organization_tax_id,
  coalesce(sub.plan_code, 'demo')     as plan_code,
  coalesce(sub.status, 'active')      as plan_status
from public.v_support_ticket_summary s
join public.organizations o on o.id = s.organization_id
left join public.organization_subscriptions sub on sub.organization_id = s.organization_id
where public.is_platform_staff();

revoke all on public.v_platform_support_ticket_summary from public, anon;
grant select on public.v_platform_support_ticket_summary to authenticated;
