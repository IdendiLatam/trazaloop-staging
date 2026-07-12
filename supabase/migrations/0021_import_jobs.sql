-- 0021_import_jobs.sql
-- Trazaloop · Sprint 2 · Registro de importaciones CSV (auditoría de cargas).
-- Flujo: la validación registra un job 'validated' (con errores fila a fila);
-- el commit registra otro job 'committed' o 'failed'. Solo CSV en Sprint 2.

create table public.import_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  entity          text not null,
  filename        text,
  total_rows      integer not null default 0,
  inserted_rows   integer not null default 0,
  skipped_rows    integer not null default 0,
  status          text not null,
  errors          jsonb not null default '[]',
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  constraint import_jobs_org_id_uniq unique (organization_id, id),
  constraint import_jobs_entity_check
    check (entity in ('suppliers','product_families','products','materials')),
  constraint import_jobs_status_check
    check (status in ('validated','committed','failed'))
);

create index import_jobs_org_idx on public.import_jobs (organization_id, created_at desc);

create trigger t_import_jobs_force_created_by
  before insert on public.import_jobs
  for each row execute function public.force_created_by();

alter table public.import_jobs enable row level security;

create policy import_jobs_select on public.import_jobs
  for select to authenticated using (public.is_org_member(organization_id));

create policy import_jobs_insert on public.import_jobs
  for insert to authenticated with check (public.is_org_member(organization_id));

-- Sin update/delete: los jobs son registro histórico.
