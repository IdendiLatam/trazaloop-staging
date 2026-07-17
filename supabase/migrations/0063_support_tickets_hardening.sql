-- 0063_support_tickets_hardening.sql
-- Trazaloop · Sprint 10C · Corrección de 4 bloqueantes antes de integrar.
--
-- Bloqueante 1: v_support_ticket_summary no traía `description` — el
-- detalle del ticket (empresa y plataforma) no podía mostrar el
-- problema original que el usuario escribió al crearlo.
--
-- Bloqueante 2: support_tickets_insert (0060) exigía is_org_member +
-- created_by = auth.uid(), pero NUNCA restringía status/assigned_to/
-- first_response_at/resolved_at/closed_at/source_type/source_id ni la
-- excepción de planes suspendidos/cancelados — un INSERT directo desde
-- el cliente Supabase (sin pasar por createSupportTicketAction) podía
-- crear un ticket ya "resuelto", ya asignado, o con datos de plan
-- manipulados. Doble defensa: un trigger BEFORE INSERT que normaliza
-- estos campos SIEMPRE (nunca confía en lo que mande el cliente), más
-- una política de INSERT más estricta que los vuelve a exigir — si el
-- trigger alguna vez se cayera, la política seguiría bloqueando.
--
-- Bloqueante 3: support_ticket_status_history_insert (0060) permitía a
-- CUALQUIER miembro de empresa insertar directamente una fila de
-- historial — sin que el estado real del ticket hubiera cambiado. Se
-- elimina esa política: el historial pasa a ser generado EXCLUSIVAMENTE
-- por las RPC SECURITY DEFINER (que bypassan RLS porque corren con
-- privilegios elevados), nunca por un INSERT directo del cliente.
--
-- Bloqueante 4: touch_support_ticket_on_message() actualizaba
-- last_message_at con CUALQUIER mensaje, incluidas notas internas —
-- haciendo que la empresa viera "última actividad" cambiar sin ningún
-- mensaje visible nuevo. Se corrige para que solo mensajes visibles
-- (is_internal_note = false) toquen last_message_at.

-- ---------------------------------------------------------------------------
-- 1. v_support_ticket_summary — agrega `description` (Bloqueante 1).
--    Mismas columnas y mismo orden que 0062 (nunca se quita ninguna),
--    solo se agrega esta al final.
-- ---------------------------------------------------------------------------
create or replace view public.v_support_ticket_summary
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
  coalesce(msg.messages_count, 0)                                              as messages_count,
  -- Bloqueante 1: agregada AL FINAL a propósito — CREATE OR REPLACE VIEW
  -- nunca puede reordenar ni insertar columnas en medio, solo agregar al
  -- final (mismo principio ya aplicado en 0059).
  t.description
from public.support_tickets t
left join public.profiles creator on creator.id = t.created_by
left join public.profiles assignee on assignee.id = t.assigned_to
left join (
  select ticket_id, count(*) as messages_count
  from public.support_ticket_messages
  group by ticket_id
) msg on msg.ticket_id = t.id;

-- v_platform_support_ticket_summary (0062) usa `s.*` — hereda
-- `description` automáticamente, sin necesidad de tocarla.

-- ---------------------------------------------------------------------------
-- 2. can_create_support_ticket_for_org (Bloqueante 2, Parte 2.1) — misma
--    regla exacta que canCreateSupportTicket (lib/domain/support.ts),
--    ahora también exigida en la base de datos.
-- ---------------------------------------------------------------------------
create or replace function public.can_create_support_ticket_for_org(
  p_organization_id uuid,
  p_category text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan_status text;
begin
  if auth.uid() is null then
    return false;
  end if;

  if not (is_org_member(p_organization_id) or is_platform_staff()) then
    return false;
  end if;

  select status into v_plan_status from organization_subscriptions where organization_id = p_organization_id;
  -- Sin fila de suscripción (no debería pasar tras el backfill de 0054):
  -- tratar como activo, mismo respaldo que create_organization/v_organization_plan_usage.
  if v_plan_status is null or v_plan_status = 'active' then
    return true;
  end if;

  return p_category in ('account', 'plan');
end;
$$;

revoke execute on function public.can_create_support_ticket_for_org(uuid, text) from public, anon;
grant execute on function public.can_create_support_ticket_for_org(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. normalize_support_ticket_insert (Bloqueante 2, Parte 2.3) — trigger
--    BEFORE INSERT: fuerza los campos controlados SIEMPRE, nunca confía
--    en lo que mande el cliente. first_response_target_at se recalcula
--    siempre con la misma lógica que computeFirstResponseTargetAt
--    (lib/domain/support.ts): siguiente día hábil, lunes a viernes.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_support_ticket_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target timestamptz;
  v_day    integer;
begin
  new.status := 'open';
  new.assigned_to := null;
  new.first_response_at := null;
  new.resolved_at := null;
  new.closed_at := null;
  new.source_type := null;
  new.source_id := null;

  v_target := new.created_at + interval '1 day';
  v_day := extract(dow from v_target);
  if v_day = 6 then v_target := v_target + interval '2 days'; end if; -- sábado → lunes
  if v_day = 0 then v_target := v_target + interval '1 day'; end if;  -- domingo → lunes
  new.first_response_target_at := v_target;

  return new;
end;
$$;

create trigger t_support_tickets_normalize_insert
  before insert on public.support_tickets
  for each row execute function public.normalize_support_ticket_insert();

-- ---------------------------------------------------------------------------
-- 4. support_tickets_insert — política más estricta (Bloqueante 2, Parte 2.2).
--    Con el trigger de arriba, estas condiciones siempre se cumplen en
--    la práctica — quedan aquí como defensa adicional real: si el
--    trigger alguna vez se cayera o se reemplazara mal, esta política
--    seguiría bloqueando un insert manipulado.
-- ---------------------------------------------------------------------------
drop policy if exists support_tickets_insert on public.support_tickets;

create policy support_tickets_insert on public.support_tickets
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and created_by = auth.uid()
    and public.can_create_support_ticket_for_org(organization_id, category)
    and status = 'open'
    and assigned_to is null
    and first_response_at is null
    and resolved_at is null
    and closed_at is null
    and source_type is null
    and source_id is null
  );

-- ---------------------------------------------------------------------------
-- 5. support_ticket_status_history — nunca INSERT directo de cliente
--    (Bloqueante 3). Las 4 RPC (reopen_/assign_/update_status/priority)
--    siguen escribiendo historial porque son SECURITY DEFINER: corren
--    con privilegios que bypassan esta RLS por completo — no dependen de
--    ninguna política de INSERT.
-- ---------------------------------------------------------------------------
drop policy if exists support_ticket_status_history_insert on public.support_ticket_status_history;

-- Sin política de INSERT (deny-by-default): append-only real, generado
-- solo por las RPC — mismo principio que trazadoc_status_history.

-- ---------------------------------------------------------------------------
-- 6. touch_support_ticket_on_message — corrige last_message_at
--    (Bloqueante 4): solo un mensaje VISIBLE (is_internal_note = false)
--    actualiza la última actividad que ve la empresa. first_response_at
--    sigue exactamente igual que antes (ya exigía is_internal_note = false).
-- ---------------------------------------------------------------------------
create or replace function public.touch_support_ticket_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_tickets
  set
    last_message_at = case when new.is_internal_note = false then new.created_at else last_message_at end,
    first_response_at = case
      when first_response_at is null and new.author_type = 'platform' and new.is_internal_note = false
        then new.created_at
      else first_response_at
    end
  where id = new.ticket_id;
  return new;
end;
$$;
