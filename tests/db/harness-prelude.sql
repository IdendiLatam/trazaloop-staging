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

-- --- Emulación del alojamiento de pgcrypto en Supabase ---------------------
-- Supabase instala pgcrypto en el schema `extensions`, NO en `public`. Sin
-- esta línea el arnés no reproduciría la causa raíz del hotfix 0110: dentro
-- de una SECURITY DEFINER con `set search_path = public`, gen_random_bytes()
-- sin calificar no resuelve (42883). Es superficie de arnés, no una
-- migración del producto: jamás se aplica a Supabase ni se añade a la 0001.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

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
    raise exception 'El organization_id de una fila no puede modificarse';  -- mensaje REAL de 0024
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
  eligible_as_recycled boolean not null default false,
  never_counts boolean not null default false
);
-- PCR-03.1: el stub de evidencias modela la SUPERFICIE REAL de 0019 que la
-- migración 0106 amplía (columnas y evidence_links con su enum de destinos);
-- el default 'valid' del stub original se conserva para las suites previas.
create type evidence_target_type as enum (
  'supplier', 'input_batch', 'production_order', 'output_batch', 'material',
  'product', 'product_family', 'document', 'requirement', 'site'
);
create table public.evidences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  evidence_type text,
  status text not null default 'valid',
  evidence_date date,
  responsible text,
  storage_path text,
  observations text,
  valid_until date,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
-- (rev. 03.1–03.3.2/.3) El builder autoritativo lee el último cálculo PCR y
-- la rev. .3 redefine calculate_recycled_content en 0106: el arnés modela la
-- SUPERFICIE COMPLETA de 0028 (0028 misma sigue sin aplicarse y byte-intacta)
-- para poder EJECUTAR el motor real con la semántica de vigencia 03.1.
create table public.calculation_methodologies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text,
  rules jsonb not null,
  is_active boolean not null default true
);
create table public.recycled_content_calculations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  output_batch_id uuid not null,
  methodology_id uuid,
  methodology_rules_snapshot jsonb,
  total_mass_kg numeric(14,4),
  recycled_mass_kg numeric(14,4),
  recycled_percent numeric(7,4) not null,
  declared_percent numeric(7,4),
  risk_flag boolean not null default false,
  defensibility_level text not null default 'defensible',
  warnings jsonb not null default '[]',
  components jsonb,
  calculated_by uuid,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create or replace function public.log_event(
  p_org uuid, p_type text, p_payload jsonb, p_actor uuid
) returns void language sql security definer set search_path = public
as $$ select null::void; $$;
revoke execute on function public.log_event(uuid, text, jsonb, uuid) from public, anon, authenticated;

create table public.evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  evidence_id uuid not null,
  target_type evidence_target_type not null,
  target_id uuid not null,
  link_role text,
  created_at timestamptz not null default now(),
  unique (evidence_id, target_type, target_id, link_role),
  unique (organization_id, id),
  foreign key (organization_id, evidence_id)
    references public.evidences (organization_id, id) on delete cascade
);
-- (03.1–03.3.1, hallazgo 1) En el esquema REAL el trigger polimórfico
-- t_evidence_links_same_org nace en 0020 y su función se redefine en 0025
-- (aplicada de verdad por el runner) y en 0106. El arnés debe EJERCITARLO:
-- placeholder mínimo solo para poder crear el trigger; 0025 lo reemplaza
-- de inmediato por la versión vigente (sin customer_requirement) y 0106
-- por la ampliada.
create or replace function public.validate_evidence_link_org()
returns trigger language plpgsql security definer set search_path = public
as $$ begin return new; end; $$;
revoke execute on function public.validate_evidence_link_org() from public, anon, authenticated;
create trigger t_evidence_links_same_org
  before insert or update on public.evidence_links
  for each row execute function public.validate_evidence_link_org();
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  classification_code text references public.material_classifications (code),
  reclassified_to_code text,
  reclassification_justification text,
  reclassified_by uuid,
  origin_support_evidence_id uuid references public.evidences (id),
  reclassification_evidence_id uuid references public.evidences (id),
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
  declared_recycled_percent numeric(7,4),
  family_id uuid references public.product_families (id),
  unique (organization_id, id)
);

create type public.residue_type as enum
  ('preconsumer', 'postconsumer', 'postindustrial', 'virgin', 'other');

-- --- Vistas/insumos de implementación de los que depende la 0104 §4b -------
-- El dashboard con los conteos reales que usan las reglas 1/2/5/6; las
-- vistas de readiness/gaps/defensible se emulan VACÍAS con columnas típicas
-- (las reglas 9–11 no forman parte de los casos PCR-02.1).
-- (rev. 03.1–03.3.4) El dashboard emulado tiene la FORMA COMPLETA de 0034:
-- 0106 lo redefine con create or replace (columnas idénticas obligatorias).
create view public.v_implementation_dashboard as
select
  o.id as organization_id,
  (select count(*) from public.suppliers s where s.organization_id = o.id) as suppliers_count,
  (select count(*) from public.materials m where m.organization_id = o.id) as materials_count,
  0::bigint as recycled_materials_count,
  0::bigint as materials_without_origin_support_count,
  0::bigint as evidences_count,
  0::bigint as valid_evidences_count,
  0::bigint as pending_evidences_count,
  0::bigint as input_batches_count,
  0::bigint as production_orders_count,
  0::bigint as output_batches_count,
  0::bigint as output_batches_with_composition_count,
  0::bigint as calculated_output_batches_count,
  0::bigint as defensible_calculations_count,
  0::bigint as warning_calculations_count,
  0::bigint as preliminary_calculations_count,
  0::bigint as critical_gaps_count,
  0::bigint as open_feedback_count,
  0::bigint as critical_feedback_count
from public.organizations o;

-- (rev. 03.1–03.3.4) Readiness con la FORMA REAL de 0032 (0106 la redefine
-- con create or replace): vacía hasta entonces para las suites previas.
create view public.v_output_batch_readiness as
select null::uuid as organization_id, null::uuid as output_batch_id,
       null::text as output_batch_code, null::date as produced_date,
       null::uuid as product_id, null::text as product_code,
       null::text as product_name, null::uuid as family_id,
       null::text as family_name, null::uuid as production_order_id,
       null::text as production_order_code, null::text as traceability_status,
       null::boolean as has_product, null::boolean as has_production_order,
       null::boolean as has_consumption, null::boolean as has_composition,
       null::boolean as has_valid_origin_evidence,
       null::boolean as has_required_reclassification_evidence,
       null::boolean as has_pending_required_evidence,
       null::boolean as has_missing_required_evidence,
       null::boolean as has_support_gaps, null::boolean as has_calculation,
       null::uuid as latest_calculation_id,
       null::numeric as latest_recycled_percent,
       null::text as latest_defensibility_level,
       null::boolean as latest_risk_flag,
       null::timestamptz as latest_calculated_at, null::boolean as has_dossier,
       null::text as next_step_code, null::text as next_step_label,
       null::text as next_step_href, null::text as readiness_level
 where false;
create view public.v_guided_flow_dashboard as
select null::uuid as organization_id,
       0::bigint as calculated_batches_count,
       0::bigint as defensible_calculations_count,
       0::bigint as warning_calculations_count,
       0::bigint as preliminary_calculations_count,
       0::bigint as critical_gaps_count
 where false;
create table public.implementation_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  status text not null default 'open',
  severity text not null default 'minor'
);
create view public.v_output_batch_support_gaps as
select null::uuid as organization_id, null::uuid as output_batch_id,
       null::text as output_batch_code, null::text as gap_severity
 where false;
create view public.v_latest_batch_recycled as
select null::uuid as organization_id, null::uuid as output_batch_id,
       null::uuid as calculation_id, null::text as output_batch_code,
       null::numeric as recycled_percent, null::text as defensibility_level,
       null::boolean as risk_flag, null::timestamptz as calculated_at
 where false;
