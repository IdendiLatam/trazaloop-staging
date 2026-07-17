-- 0060_support_tickets.sql
-- Trazaloop · Sprint 10C · Centro de soporte y tickets.
--
-- 3 tablas: support_tickets, support_ticket_messages (append-only en la
-- práctica: sin política de UPDATE/DELETE), support_ticket_status_history
-- (append-only real). Todas las TRANSICIONES de estado (reabrir, asignar,
-- cambiar estado, cambiar prioridad) pasan por RPC SECURITY DEFINER —
-- MISMO patrón que change_trazadoc_document_status/
-- change_trazadoc_file_document_status/change_organization_plan: nunca
-- una actualización directa desde el cliente para estos campos. Los
-- mensajes SÍ se insertan directamente (RLS normal) porque un trigger
-- AFTER INSERT (SECURITY DEFINER) se encarga de actualizar
-- last_message_at/first_response_at de forma atómica — así el cliente
-- nunca puede fijar esos timestamps a mano.

-- ---------------------------------------------------------------------------
-- 1. support_tickets
-- ---------------------------------------------------------------------------
create table public.support_tickets (
  id                         uuid primary key default gen_random_uuid(),
  organization_id            uuid not null references public.organizations (id) on delete restrict,
  created_by                 uuid not null references public.profiles (id),
  subject                    text not null,
  description                text not null,
  category                   text not null default 'other',
  related_module             text not null default 'other',
  priority                   text not null default 'normal',
  status                     text not null default 'open',
  assigned_to                uuid references public.profiles (id),
  first_response_target_at   timestamptz,
  first_response_at          timestamptz,
  resolved_at                timestamptz,
  closed_at                  timestamptz,
  last_message_at            timestamptz,
  -- Sprint 10C (Parte 9.4): enlace opcional hacia el feedback migrado —
  -- nunca puesto por el cliente, solo por la migración 0061.
  source_type                text,
  source_id                  uuid,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint support_tickets_org_id_uniq unique (organization_id, id),
  constraint support_tickets_subject_not_blank check (length(trim(subject)) > 0),
  constraint support_tickets_description_not_blank check (length(trim(description)) > 0),
  constraint support_tickets_status_check check (status in (
    'open', 'assigned', 'waiting_customer', 'in_progress', 'resolved', 'closed'
  )),
  constraint support_tickets_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint support_tickets_category_check check (category in (
    'account', 'plan', 'trazability', 'evidences', 'trazadocs', 'imports',
    'calculation', 'technical_support', 'bug', 'other'
  )),
  constraint support_tickets_related_module_check check (related_module in (
    'platform', 'cpr', 'trazadocs', 'diagnostic', 'catalog', 'evidences',
    'traceability', 'recycled_content', 'imports', 'implementation',
    'settings', 'team', 'other'
  )),
  constraint support_tickets_source_pair_check check ((source_type is null) = (source_id is null))
);

create unique index support_tickets_source_uniq
  on public.support_tickets (source_type, source_id)
  where source_type is not null and source_id is not null;

create index support_tickets_org_status_idx on public.support_tickets (organization_id, status);
create index support_tickets_assigned_idx on public.support_tickets (assigned_to);

create trigger t_support_tickets_updated
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

create trigger t_support_tickets_force_created_by
  before insert on public.support_tickets
  for each row execute function public.force_created_by();

create trigger t_audit_support_tickets
  after insert or update or delete on public.support_tickets
  for each row execute function public.audit_row_change();

alter table public.support_tickets enable row level security;

create policy support_tickets_select on public.support_tickets
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_staff());

-- Cualquier miembro activo de la empresa puede crear un ticket — sin
-- restringir por rol (Parte 11: "miembros de la organización pueden
-- crear tickets", sin condicionar a admin/quality/consultant).
create policy support_tickets_insert on public.support_tickets
  for insert to authenticated
  with check (public.is_org_member(organization_id) and created_by = auth.uid());

-- Sin política de UPDATE para el cliente: TODA transición (reabrir,
-- asignar, cambiar estado, cambiar prioridad) pasa por una RPC SECURITY
-- DEFINER (abajo) — deny-by-default es la barrera real.
-- Sin DELETE (deny-by-default): "los tickets deben conservarse" (Parte 11).

-- ---------------------------------------------------------------------------
-- 2. support_ticket_messages
-- ---------------------------------------------------------------------------
create table public.support_ticket_messages (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  ticket_id         uuid not null references public.support_tickets (id) on delete cascade,
  author_id         uuid not null references public.profiles (id),
  author_type       text not null,
  body              text not null,
  is_internal_note  boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint support_ticket_messages_org_id_uniq unique (organization_id, id),
  constraint support_ticket_messages_body_not_blank check (length(trim(body)) > 0),
  constraint support_ticket_messages_author_type_check check (author_type in ('customer', 'platform')),
  constraint support_ticket_messages_ticket_fk
    foreign key (organization_id, ticket_id)
    references public.support_tickets (organization_id, id)
    on delete cascade,
  -- Un cliente de empresa NUNCA puede crear una nota interna — se exige
  -- aquí como invariante de datos, no solo como regla de RLS (Parte 9.2).
  constraint support_ticket_messages_customer_never_internal_check check (
    author_type <> 'customer' or is_internal_note = false
  )
);

create index support_ticket_messages_ticket_idx on public.support_ticket_messages (ticket_id, created_at);

create trigger t_support_ticket_messages_updated
  before update on public.support_ticket_messages
  for each row execute function public.set_updated_at();

alter table public.support_ticket_messages enable row level security;

-- Empresa ve solo mensajes NO internos de su empresa; platform_staff ve todo.
create policy support_ticket_messages_select on public.support_ticket_messages
  for select to authenticated
  using (
    (public.is_org_member(organization_id) and is_internal_note = false)
    or public.is_platform_staff()
  );

create policy support_ticket_messages_insert on public.support_ticket_messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      (public.is_org_member(organization_id) and author_type = 'customer' and is_internal_note = false)
      or (public.is_platform_staff() and author_type = 'platform')
    )
  );

-- Sin UPDATE/DELETE (deny-by-default): en la práctica, append-only —
-- "preferir no permitir" (Parte 11).

-- Trigger: actualiza last_message_at siempre, y first_response_at SOLO la
-- primera vez que un mensaje visible (no nota interna) de plataforma
-- llega — nunca desde una nota interna, nunca una segunda vez.
create or replace function public.touch_support_ticket_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_tickets
  set
    last_message_at = new.created_at,
    first_response_at = case
      when first_response_at is null and new.author_type = 'platform' and new.is_internal_note = false
        then new.created_at
      else first_response_at
    end
  where id = new.ticket_id;
  return new;
end;
$$;

create trigger t_support_ticket_messages_touch
  after insert on public.support_ticket_messages
  for each row execute function public.touch_support_ticket_on_message();

-- ---------------------------------------------------------------------------
-- 3. support_ticket_status_history (append-only)
-- ---------------------------------------------------------------------------
create table public.support_ticket_status_history (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  ticket_id      uuid not null references public.support_tickets (id) on delete cascade,
  from_status    text,
  to_status      text not null,
  changed_by     uuid references public.profiles (id),
  change_note    text,
  created_at     timestamptz not null default now(),

  constraint support_ticket_status_history_org_id_uniq unique (organization_id, id),
  constraint support_ticket_status_history_ticket_fk
    foreign key (organization_id, ticket_id)
    references public.support_tickets (organization_id, id)
    on delete cascade
);

create index support_ticket_status_history_ticket_idx on public.support_ticket_status_history (ticket_id, created_at desc);

alter table public.support_ticket_status_history enable row level security;

create policy support_ticket_status_history_select on public.support_ticket_status_history
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_staff());

-- INSERT: defensa adicional, aunque el camino real es la RPC (SECURITY
-- DEFINER, bypassa RLS). Nunca UPDATE/DELETE.
create policy support_ticket_status_history_insert on public.support_ticket_status_history
  for insert to authenticated
  with check (public.is_org_member(organization_id) or public.is_platform_staff());

-- ---------------------------------------------------------------------------
-- 4. RPC: reopen_support_ticket — empresa O platform_staff, solo si el
--    ticket está resolved/closed (Parte 4: "permitir reebrir un ticket
--    cerrado o resuelto, si el usuario de la empresa responde").
-- ---------------------------------------------------------------------------
create or replace function public.reopen_support_ticket(
  p_ticket_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_ticket record;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'No autenticado';
  end if;

  select * into v_ticket from support_tickets where id = p_ticket_id for update;
  if v_ticket.id is null then
    raise exception 'El ticket no existe';
  end if;

  if not (is_org_member(v_ticket.organization_id) or is_platform_staff()) then
    raise exception 'No tienes acceso a este ticket';
  end if;

  if v_ticket.status not in ('resolved', 'closed') then
    raise exception 'Solo se puede reabrir un ticket resuelto o cerrado';
  end if;

  update support_tickets set status = 'open' where id = p_ticket_id;

  insert into support_ticket_status_history (organization_id, ticket_id, from_status, to_status, changed_by, change_note)
  values (v_ticket.organization_id, p_ticket_id, v_ticket.status, 'open', v_user, p_note);
end;
$$;

revoke execute on function public.reopen_support_ticket(uuid, text) from public, anon;
grant execute on function public.reopen_support_ticket(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC: assign_support_ticket — SOLO platform_staff.
-- ---------------------------------------------------------------------------
create or replace function public.assign_support_ticket(
  p_ticket_id uuid,
  p_assignee_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_ticket record;
  v_new_status text;
begin
  v_user := auth.uid();
  if v_user is null or not is_platform_staff() then
    raise exception 'Solo el equipo de soporte de plataforma puede asignar tickets';
  end if;

  select * into v_ticket from support_tickets where id = p_ticket_id for update;
  if v_ticket.id is null then
    raise exception 'El ticket no existe';
  end if;

  if p_assignee_id is not null and not exists (
    select 1 from platform_staff ps where ps.user_id = p_assignee_id and ps.status = 'active'
  ) then
    raise exception 'Solo se puede asignar a personal de plataforma activo';
  end if;

  v_new_status := case when v_ticket.status = 'open' then 'assigned' else v_ticket.status end;

  update support_tickets set assigned_to = p_assignee_id, status = v_new_status where id = p_ticket_id;

  if v_new_status <> v_ticket.status then
    insert into support_ticket_status_history (organization_id, ticket_id, from_status, to_status, changed_by, change_note)
    values (v_ticket.organization_id, p_ticket_id, v_ticket.status, v_new_status, v_user, 'Asignado');
  end if;
end;
$$;

revoke execute on function public.assign_support_ticket(uuid, uuid) from public, anon;
grant execute on function public.assign_support_ticket(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC: update_support_ticket_status — SOLO platform_staff (Parte 11:
--    "usuarios de empresa... no pueden cerrar unilateralmente si no se
--    define" — no se define, así que solo plataforma cambia estado en
--    general; la empresa solo reabre, vía la RPC de arriba).
-- ---------------------------------------------------------------------------
create or replace function public.update_support_ticket_status(
  p_ticket_id uuid,
  p_to_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_ticket record;
begin
  v_user := auth.uid();
  if v_user is null or not is_platform_staff() then
    raise exception 'Solo el equipo de soporte de plataforma puede cambiar el estado de un ticket';
  end if;

  if p_to_status not in ('open', 'assigned', 'waiting_customer', 'in_progress', 'resolved', 'closed') then
    raise exception 'Estado no válido';
  end if;

  select * into v_ticket from support_tickets where id = p_ticket_id for update;
  if v_ticket.id is null then
    raise exception 'El ticket no existe';
  end if;

  update support_tickets
  set
    status = p_to_status,
    resolved_at = case when p_to_status = 'resolved' then now() else resolved_at end,
    closed_at = case when p_to_status = 'closed' then now() else closed_at end
  where id = p_ticket_id;

  insert into support_ticket_status_history (organization_id, ticket_id, from_status, to_status, changed_by, change_note)
  values (v_ticket.organization_id, p_ticket_id, v_ticket.status, p_to_status, v_user, p_note);
end;
$$;

revoke execute on function public.update_support_ticket_status(uuid, text, text) from public, anon;
grant execute on function public.update_support_ticket_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPC: update_support_ticket_priority — SOLO platform_staff.
-- ---------------------------------------------------------------------------
create or replace function public.update_support_ticket_priority(
  p_ticket_id uuid,
  p_priority text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  v_user := auth.uid();
  if v_user is null or not is_platform_staff() then
    raise exception 'Solo el equipo de soporte de plataforma puede cambiar la prioridad de un ticket';
  end if;

  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Prioridad no válida';
  end if;

  if not exists (select 1 from support_tickets where id = p_ticket_id) then
    raise exception 'El ticket no existe';
  end if;

  update support_tickets set priority = p_priority where id = p_ticket_id;
end;
$$;

revoke execute on function public.update_support_ticket_priority(uuid, text) from public, anon;
grant execute on function public.update_support_ticket_priority(uuid, text) to authenticated;
