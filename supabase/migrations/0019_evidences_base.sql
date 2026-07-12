-- 0019_evidences_base.sql
-- Trazaloop · Sprint 2 · Evidencias base y enlaces polimórficos.
-- Storage: sin cambios — el bucket privado `evidences` y sus políticas por
-- ruta (0015 + 0016, con safe_uuid) ya cubren
-- evidences/{organization_id}/{evidence_id}/{filename}.

create table public.evidences (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null,
  evidence_type   text,
  status          evidence_status not null default 'pending',
  evidence_date   date,
  responsible     text,
  storage_path    text,
  observations    text,
  valid_until     date,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint evidences_org_id_uniq unique (organization_id, id)
);

create index evidences_org_status_idx on public.evidences (organization_id, status);
create index evidences_org_vigencia_idx on public.evidences (organization_id, valid_until);

create trigger t_evidences_updated
  before update on public.evidences
  for each row execute function public.set_updated_at();

create trigger t_evidences_force_created_by
  before insert on public.evidences
  for each row execute function public.force_created_by();

create trigger t_audit_evidences
  after insert or update or delete on public.evidences
  for each row execute function public.audit_row_change();

-- Validar una evidencia (status → 'valid') es acto de aprobación: solo
-- admin/quality. SECURITY DEFINER para evaluar el rol con los helpers.
create or replace function public.guard_evidence_validation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'valid' and new.status is distinct from old.status then
    if not public.has_org_role(new.organization_id, array['admin','quality']) then
      raise exception 'Solo administrador o calidad pueden marcar una evidencia como válida';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_evidence_validation() from public, anon, authenticated;

create trigger t_evidences_guard_validation
  before update on public.evidences
  for each row execute function public.guard_evidence_validation();

-- ---------------------------------------------------------------------------
-- evidence_links: relación polimórfica evidencia ↔ entidad destino.
-- El trigger de validación de mismo-tenant del target se crea en 0020,
-- cuando ya existen suppliers/materials/products/product_families.
-- ---------------------------------------------------------------------------
create table public.evidence_links (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  evidence_id     uuid not null,
  target_type     evidence_target_type not null,
  target_id       uuid not null,
  link_role       text,
  created_at      timestamptz not null default now(),
  constraint evidence_links_uniq unique (evidence_id, target_type, target_id, link_role),
  constraint evidence_links_org_id_uniq unique (organization_id, id),
  -- FK compuesta: el enlace solo puede apuntar a una evidencia de SU empresa.
  constraint evidence_links_evidence_fk
    foreign key (organization_id, evidence_id)
    references public.evidences (organization_id, id)
    on delete cascade
);

create index evidence_links_target_idx on public.evidence_links (target_type, target_id);
create index evidence_links_org_idx    on public.evidence_links (organization_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.evidences      enable row level security;
alter table public.evidence_links enable row level security;

create policy evidences_select on public.evidences
  for select to authenticated using (public.is_org_member(organization_id));

create policy evidences_insert on public.evidences
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy evidences_update on public.evidences
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- Borrar: solo admin/quality y solo si NO está validada.
create policy evidences_delete on public.evidences
  for delete to authenticated
  using (
    public.has_org_role(organization_id, array['admin','quality'])
    and status <> 'valid'
  );

create policy evidence_links_select on public.evidence_links
  for select to authenticated using (public.is_org_member(organization_id));

create policy evidence_links_insert on public.evidence_links
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy evidence_links_update on public.evidence_links
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy evidence_links_delete on public.evidence_links
  for delete to authenticated using (public.is_org_member(organization_id));
