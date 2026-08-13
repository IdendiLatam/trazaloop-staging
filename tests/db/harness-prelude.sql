-- ============================================================================
-- tests/db/harness-prelude.sql · PCR-02.1
-- Superficie MÍNIMA equivalente a Supabase para aplicar las migraciones
-- REALES 0025 y 0104 en un PostgreSQL LOCAL DESECHABLE y probar de verdad
-- constraints, triggers, RLS y semántica de vistas.
--
-- NO es una migración del producto: vive solo en tests/db y jamás se aplica
-- a Supabase. Emula: auth.uid(), roles anon/authenticated, funciones de la
-- regla 0024, is_org_member/has_org_role y las tablas base + vistas de
-- implementación de las que dependen 0025/0104.
-- ============================================================================

-- --- Emulación de Supabase auth -------------------------------------------
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;
grant usage on schema public to authenticated, anon;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

-- --- Funciones de la regla 0024 (equivalentes funcionales) -----------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.prevent_organization_id_change() returns trigger
language plpgsql as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id es inmutable';
  end if;
  return new;
end $$;

create or replace function public.force_created_by() returns trigger
language plpgsql as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end $$;

-- Fidelidad 0005 (PCR-02.3): la 0104 consulta audit_log.diff en su backfill
-- y las aserciones S9 verifican que cierre/reapertura quedan auditados, así
-- que el arnés emula el ESQUEMA REAL del audit (organization_id, actor_id,
-- operation, row_id uuid, diff jsonb con old/new completos).
create table public.audit_log (
  id bigserial primary key,
  organization_id uuid,
  actor_id uuid,
  table_name text not null,
  operation text not null,
  row_id uuid,
  diff jsonb,
  created_at timestamptz not null default now()
);
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_row uuid;
begin
  v_org := coalesce(
    (to_jsonb(new) ->> 'organization_id')::uuid,
    (to_jsonb(old) ->> 'organization_id')::uuid,
    case when tg_table_name = 'organizations'
         then coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(old) ->> 'id')::uuid)
         end
  );
  v_row := coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(old) ->> 'id')::uuid);
  insert into public.audit_log (organization_id, actor_id, table_name, operation, row_id, diff)
  values (
    v_org, auth.uid(), tg_table_name, tg_op, v_row,
    case tg_op
      when 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
      else               jsonb_build_object('old', to_jsonb(old))
    end
  );
  return coalesce(new, old);
end $$;

-- --- Tablas base mínimas ----------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text
);
create table public.organization_members (
  organization_id uuid not null references public.organizations (id),
  profile_id uuid not null references public.profiles (id),
  role text not null,
  primary key (organization_id, profile_id)
);

create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer as
$$ select exists (
     select 1 from public.organization_members m
      where m.organization_id = p_org and m.profile_id = auth.uid()) $$;

create or replace function public.has_org_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer as
$$ select exists (
     select 1 from public.organization_members m
      where m.organization_id = p_org and m.profile_id = auth.uid()
        and m.role = any (p_roles)) $$;
grant execute on function public.is_org_member(uuid) to authenticated, anon;
grant execute on function public.has_org_role(uuid, text[]) to authenticated, anon;

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  unique (organization_id, id)
);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  unique (organization_id, id)
);
create table public.material_classifications (
  code text primary key,
  eligible_as_recycled boolean not null default false
);
create table public.evidences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  status text not null default 'valid',
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  classification_code text references public.material_classifications (code),
  reclassified_to_code text,
  origin_support_evidence_id uuid references public.evidences (id),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);
create table public.product_families (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  unique (organization_id, id)
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  code text not null,
  name text not null,
  unique (organization_id, id)
);

create type public.residue_type as enum
  ('preconsumer', 'postconsumer', 'postindustrial', 'virgin', 'other');

-- --- Vistas/insumos de implementación de los que depende la 0104 §4b -------
-- El dashboard con los conteos reales que usan las reglas 1/2/5/6; las
-- vistas de readiness/gaps/defensible se emulan VACÍAS con columnas típicas
-- (las reglas 9–11 no forman parte de los casos PCR-02.1).
create view public.v_implementation_dashboard as
select
  o.id as organization_id,
  (select count(*) from public.suppliers s where s.organization_id = o.id)  as suppliers_count,
  (select count(*) from public.materials m where m.organization_id = o.id)  as materials_count,
  0::bigint as input_batches_count,       -- se redefine tras crear 0025
  0::bigint as production_orders_count
from public.organizations o;

create view public.v_output_batch_readiness as
select null::uuid as organization_id, null::uuid as output_batch_id,
       null::text as output_batch_code, null::text as readiness_level
 where false;
create view public.v_output_batch_support_gaps as
select null::uuid as organization_id, null::uuid as output_batch_id,
       null::text as output_batch_code, null::text as gap_severity
 where false;
create view public.v_latest_batch_recycled as
select null::uuid as organization_id, null::uuid as calculation_id,
       null::text as output_batch_code, null::text as defensibility_level,
       null::timestamptz as calculated_at
 where false;
