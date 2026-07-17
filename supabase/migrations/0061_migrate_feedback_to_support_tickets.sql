-- 0061_migrate_feedback_to_support_tickets.sql
-- Trazaloop · Sprint 10C · Preserva implementation_feedback (Sprint 6)
-- creando un ticket de soporte equivalente por cada fila — Opción A del
-- brief: la tabla original NUNCA se toca (ni se borra ni se modifica),
-- solo se enlaza vía source_type/source_id.
--
-- Idempotente: el índice único parcial support_tickets_source_uniq
-- (0060) es la garantía real — ON CONFLICT DO NOTHING evita duplicar si
-- esta migración llegara a correr más de una vez.
--
-- Filas SIN created_by (columna nullable en 0033) se OMITEN a propósito:
-- support_tickets.created_by es NOT NULL, y esta migración nunca inventa
-- un autor — es preferible dejar esas pocas filas antiguas sin ticket
-- equivalente (siguen intactas y consultables en implementation_feedback)
-- a atribuírselas a alguien que no las escribió.

insert into public.support_tickets (
  organization_id, created_by, subject, description, category, related_module,
  priority, status, assigned_to, resolved_at, source_type, source_id, created_at, updated_at
)
select
  f.organization_id,
  f.created_by,
  f.title,
  f.description,
  'technical_support',
  case f.module
    when 'organization' then 'settings'
    when 'catalog' then 'catalog'
    when 'evidences' then 'evidences'
    when 'traceability' then 'traceability'
    when 'recycled_content' then 'recycled_content'
    when 'audit_support' then 'diagnostic'
    when 'implementation' then 'implementation'
    else 'other'
  end,
  case f.severity
    when 'low' then 'low'
    when 'medium' then 'normal'
    when 'high' then 'high'
    when 'critical' then 'urgent'
    else 'normal'
  end,
  case f.status
    when 'open' then 'open'
    when 'in_review' then 'in_progress'
    when 'resolved' then 'resolved'
    when 'closed' then 'closed'
    else 'open'
  end,
  f.assigned_to,
  f.resolved_at,
  'implementation_feedback',
  f.id,
  f.created_at,
  f.updated_at
from public.implementation_feedback f
where f.created_by is not null
on conflict (source_type, source_id) where source_type is not null and source_id is not null
do nothing;

-- Una entrada de historial por ticket migrado, documentando el origen —
-- solo para los que se acaban de insertar en ESTA corrida (join por
-- source_id evita duplicar historial si se vuelve a correr la migración).
insert into public.support_ticket_status_history (organization_id, ticket_id, from_status, to_status, changed_by, change_note)
select st.organization_id, st.id, null, st.status, null, 'Migrado desde el feedback anterior (Sprint 10C).'
from public.support_tickets st
where st.source_type = 'implementation_feedback'
and not exists (
  select 1 from public.support_ticket_status_history h
  where h.ticket_id = st.id
);
