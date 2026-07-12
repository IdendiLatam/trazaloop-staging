-- 0005_audit.sql
-- Trazaloop · Sprint 1 · Fundaciones
-- Bitácora append-only + funciones de auditoría.

create table public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id),
  actor_id        uuid,
  table_name      text,
  operation       text not null,
  event_type      text,
  row_id          uuid,
  diff            jsonb,
  payload         jsonb,
  changed_at      timestamptz not null default now(),
  constraint audit_log_operation_check
    check (operation in ('INSERT', 'UPDATE', 'DELETE', 'EVENT'))
);

create index audit_log_org_time_idx on public.audit_log (organization_id, changed_at desc);
create index audit_log_row_idx      on public.audit_log (table_name, row_id);

-- ---------------------------------------------------------------------------
-- forbid_mutation: candado genérico para tablas append-only / inmutables.
-- ---------------------------------------------------------------------------
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La fila es inmutable (append-only): % en %', tg_op, tg_table_name;
end;
$$;

-- audit_log es append-only: ni UPDATE ni DELETE, ni siquiera vía definer.
create trigger t_audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.forbid_mutation();

-- ---------------------------------------------------------------------------
-- audit_row_change: trigger genérico de auditoría de cambios de fila.
-- SECURITY DEFINER para poder escribir en audit_log sin política de INSERT.
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_row uuid;
begin
  v_org := coalesce(
    (to_jsonb(new) ->> 'organization_id')::uuid,
    (to_jsonb(old) ->> 'organization_id')::uuid,
    -- organizations no tiene organization_id: su propio id es la organización.
    case when tg_table_name = 'organizations'
         then coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(old) ->> 'id')::uuid)
         end
  );
  v_row := coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(old) ->> 'id')::uuid);

  insert into public.audit_log (organization_id, actor_id, table_name, operation, row_id, diff)
  values (
    v_org,
    auth.uid(),
    tg_table_name,
    tg_op,
    v_row,
    case tg_op
      when 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
      else               jsonb_build_object('old', to_jsonb(old))
    end
  );

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- log_event: eventos semánticos (organization_created, etc.).
-- p_actor permite registrar actor explícito en contextos sin auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.log_event(
  p_org uuid,
  p_event text,
  p_payload jsonb default '{}'::jsonb,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (organization_id, actor_id, operation, event_type, payload)
  values (p_org, coalesce(p_actor, auth.uid()), 'EVENT', p_event, p_payload);
end;
$$;

grant execute on function public.log_event(uuid, text, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Adjuntar auditoría a las tablas de fundación que tiene sentido auditar.
-- (Los triggers para tablas de sprints futuros se adjuntan en sus migraciones.)
-- ---------------------------------------------------------------------------
create trigger t_audit_organizations
  after insert or update or delete on public.organizations
  for each row execute function public.audit_row_change();

create trigger t_audit_memberships
  after insert or update or delete on public.memberships
  for each row execute function public.audit_row_change();

create trigger t_audit_organization_modules
  after insert or update or delete on public.organization_modules
  for each row execute function public.audit_row_change();

create trigger t_audit_sites
  after insert or update or delete on public.sites
  for each row execute function public.audit_row_change();
