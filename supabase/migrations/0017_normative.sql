-- 0017_normative.sql
-- Trazaloop · Sprint 2 · Catálogo normativo mínimo (tablas globales).
-- Seeds en 0022_seed_sprint2.sql. En el contenido solo se citan normas técnicas.

create table public.frameworks (
  id             uuid primary key default gen_random_uuid(),
  code           text not null,
  name           text not null,
  version_label  text,
  standard_body  text,
  effective_date date,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint frameworks_code_version_uniq unique (code, version_label)
);

create table public.requirements (
  id           uuid primary key default gen_random_uuid(),
  framework_id uuid not null references public.frameworks (id),
  parent_id    uuid references public.requirements (id),
  code         text not null,
  title        text not null,
  description  text,
  order_index  integer not null default 0,
  constraint requirements_framework_code_uniq unique (framework_id, code)
);

create index requirements_framework_idx on public.requirements (framework_id);
create index requirements_parent_idx    on public.requirements (parent_id);

-- RLS: catálogos globales — lectura autenticada, sin escritura de cliente.
alter table public.frameworks   enable row level security;
alter table public.requirements enable row level security;

create policy frameworks_select on public.frameworks
  for select to authenticated using (true);

create policy requirements_select on public.requirements
  for select to authenticated using (true);
