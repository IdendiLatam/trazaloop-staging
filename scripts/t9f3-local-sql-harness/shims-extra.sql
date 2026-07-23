-- Trazaloop · T9F.3 · Shims ADICIONALES sobre el arnés T9F.2 (PG local).
-- Completa los objetos que la 0101 acumulada referencia en sus secciones
-- T9F.3: auth.users, catálogo de cuotas, intents de carga textil (columnas
-- REALES de 0094+0097), columnas de dominio usadas por queue/finalize y
-- privilegios de tabla para ejercer los triggers con `set role authenticated`
-- (aquí no hay RLS: el arnés valida la BARRERA de límites, no el aislamiento,
-- que ya cubren las suites RLS preparadas). SOLO local; jamás staging.

-- auth.users (finalize verifica la existencia del actor).
create table auth.users (
  id uuid primary key
);

-- has_org_role (0006, firma real) usada por begin/queue.
create or replace function public.has_org_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org and m.user_id = auth.uid()
      and m.status = 'active' and m.role_code = any (p_roles)
  )
$$;

-- Catálogo de cuotas (0050): valores REALES del producto.
create table public.plan_definitions (
  code text primary key,
  storage_limit_bytes bigint not null,
  constraint plan_definitions_storage_positive check (storage_limit_bytes > 0)
);
insert into public.plan_definitions (code, storage_limit_bytes) values
  ('demo', 50 * 1024 * 1024),
  ('full', 500 * 1024 * 1024),
  ('extra', 5120::bigint * 1024 * 1024);

-- Intents de carga textil (0094 + columnas de 0097). 0101 les AÑADE
-- idempotency_key: aquí deben nacer SIN ella, como en staging.
create table public.textile_evidence_upload_intents (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  created_by          uuid not null references auth.users(id),
  bucket_id           text not null default 'evidences',
  object_path         text not null unique,
  original_filename   text not null,
  safe_filename       text not null,
  expected_size_bytes bigint not null,
  expected_mime_type  text not null,
  status              text not null default 'pending',
  expires_at          timestamptz not null,
  consumed_at         timestamptz,
  evidence_id         uuid,
  evidence_metadata   jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint textile_upload_intents_status_check
    check (status in ('pending', 'consumed', 'expired', 'failed')),
  constraint textile_upload_intents_size_check
    check (expected_size_bytes > 0 and expected_size_bytes <= 20 * 1024 * 1024),
  constraint textile_upload_intents_expiry_check
    check (expires_at > created_at),
  constraint textile_upload_intents_consumed_check
    check ((status = 'consumed') = (consumed_at is not null)),
  constraint textile_upload_intents_bucket_check
    check (bucket_id = 'evidences'),
  constraint textile_upload_intents_path_check
    check (position(organization_id::text || '/textiles/' in object_path) = 1)
);

-- Columnas reales que usan queue_and_delete_* y finalize.
alter table public.evidences
  alter column size_bytes drop not null,
  alter column size_bytes drop default,
  add column status text not null default 'pending',
  add column name text;
alter table public.trazadoc_file_documents
  add column status text not null default 'draft',
  add column created_by uuid;
alter table public.textile_evidences
  add column title text, add column evidence_type text, add column description text,
  add column document_date date, add column issuer text, add column reference_code text,
  add column valid_from date, add column valid_until date,
  add column file_name text, add column file_mime_type text,
  add column status text not null default 'pending_review',
  add column created_by uuid;
alter table public.textile_evidences alter column file_path drop not null;

-- El arnés ejerce los triggers con `set role authenticated` (sin RLS local):
-- privilegios de tabla mínimos para esa simulación.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on auth.users to authenticated;
grant usage on schema auth to authenticated;
