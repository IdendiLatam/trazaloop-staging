-- Trazaloop · T9F.2 · ARNÉS LOCAL de validación SQL (PostgreSQL efímero).
-- Crea los objetos MÍNIMOS que la migración 0101 referencia, con los nombres
-- de columnas EXACTOS del esquema real (0004/0050/0051/0057/0075/0082/0100).
-- SOLO para validar 0101 en una base local sin datos remotos (§33 del plan
-- T9F.2). NO es una migración; jamás se aplica a staging/producción.

-- Roles de Supabase (NOLOGIN) para que los GRANT/REVOKE de 0101 sean válidos.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

-- auth.uid() controlable por GUC (app.uid) para simular sesiones.
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid
$$;

-- ── Núcleo de tenancy (0004/0100) ────────────────────────────────────────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'org',
  logo_size_bytes bigint not null default 0
);

create table public.modules (
  code text primary key,
  is_functional boolean not null default false
);

create table public.organization_modules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  module_code     text not null references public.modules (code),
  enabled         boolean not null default true,
  activated_at    timestamptz not null default now(),
  access_mode     text not null default 'demo',
  access_started_at timestamptz,
  access_expires_at timestamptz,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  assignment_source text,
  constraint organization_modules_org_module_uniq unique (organization_id, module_code),
  constraint organization_modules_org_id_uniq unique (organization_id, id),
  constraint organization_modules_access_mode_check check (access_mode in ('demo', 'full', 'extra'))
);

create table public.memberships (
  organization_id uuid not null references public.organizations (id),
  user_id uuid not null,
  role_code text not null default 'admin',
  status text not null default 'active'
);

create table public.platform_staff (
  user_id uuid primary key,
  role_code text not null,
  status text not null default 'active'
);

create table public.plan_limits (
  plan_code text not null,
  resource_code text not null,
  limit_value bigint,
  is_unlimited boolean not null default false,
  primary key (plan_code, resource_code)
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id),
  actor_id uuid,
  event_type text,
  operation text not null default 'EVENT',
  payload jsonb,
  changed_at timestamptz not null default now()
);

create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active'
  )
$$;

create or replace function public.is_platform_staff() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from public.platform_staff s
    where s.user_id = auth.uid() and s.status = 'active'
  )
$$;

create or replace function public.is_platform_superadmin() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from public.platform_staff s
    where s.user_id = auth.uid() and s.status = 'active' and s.role_code = 'superadmin'
  )
$$;

create or replace function public.log_event(p_org uuid, p_event text, p_payload jsonb, p_actor uuid)
returns void language sql as $$
  insert into public.audit_log (organization_id, actor_id, event_type, operation, payload)
  values (p_org, p_actor, p_event, 'EVENT', p_payload)
$$;

-- ── Dominio CPR referenciado por la vista (columnas reales) ─────────────────
create table public.trazadoc_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  module_key text not null default 'cpr'
);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text
);
create table public.materials (like public.suppliers including all);
create table public.products (like public.suppliers including all);
create table public.production_orders (like public.suppliers including all);
create table public.input_batches (like public.suppliers including all);
create table public.output_batches (like public.suppliers including all);
create table public.evidences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  storage_path text,
  size_bytes bigint not null default 0,
  constraint evidences_size_bytes_check check (size_bytes >= 0)
);
create table public.trazadoc_file_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  storage_path text not null default '',
  size_bytes bigint not null default 0
);
create table public.trazadoc_file_document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  file_document_id uuid not null references public.trazadoc_file_documents (id) on delete cascade,
  version_number integer not null default 1,
  storage_path text not null default '',
  size_bytes bigint not null default 0
);

-- ── Dominio Textiles referenciado por la vista ──────────────────────────────
create table public.textile_suppliers (like public.suppliers including all);
create table public.textile_materials (like public.suppliers including all);
create table public.textile_products (like public.suppliers including all);
create table public.textile_production_orders (like public.suppliers including all);
create table public.textile_input_lots (like public.suppliers including all);
create table public.textile_output_lots (like public.suppliers including all);
create table public.textile_evidences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  file_path text not null,
  file_size_bytes bigint
);

grant usage on schema public to anon, authenticated, service_role;
