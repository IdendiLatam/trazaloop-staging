-- 0004_tenancy_core.sql
-- Trazaloop · Sprint 1 · Fundaciones
-- Tablas de tenencia, trigger de perfil, helpers de seguridad y semilla mínima.

-- ---------------------------------------------------------------------------
-- profiles (1:1 con auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  email      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_uniq on public.profiles (email);

create trigger t_profiles_updated
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- organizations (tenant raíz)
-- ---------------------------------------------------------------------------
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  tax_id     text,
  country    text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (length(trim(name)) > 0)
);

create index organizations_created_by_idx on public.organizations (created_by);

create trigger t_organizations_updated
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- roles (catálogo sembrable)
-- ---------------------------------------------------------------------------
create table public.roles (
  code          text primary key,
  name          text not null,
  description   text,
  is_assignable boolean not null default true
);

-- ---------------------------------------------------------------------------
-- memberships (usuario ↔ empresa ↔ rol)
-- ---------------------------------------------------------------------------
create table public.memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role_code       text not null references public.roles (code),
  status          membership_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint memberships_org_user_uniq unique (organization_id, user_id),
  -- Habilita FK compuestas (organization_id, id) en sprints futuros.
  constraint memberships_org_id_uniq unique (organization_id, id)
);

create index memberships_user_idx on public.memberships (user_id);
create index memberships_org_idx  on public.memberships (organization_id);

create trigger t_memberships_updated
  before update on public.memberships
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- modules (catálogo sembrable)
-- ---------------------------------------------------------------------------
create table public.modules (
  code         text primary key,
  name         text not null,
  description  text,
  is_available boolean not null default true
);

-- ---------------------------------------------------------------------------
-- organization_modules (módulos activos por empresa)
-- ---------------------------------------------------------------------------
create table public.organization_modules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  module_code     text not null references public.modules (code),
  enabled         boolean not null default true,
  activated_at    timestamptz not null default now(),
  constraint organization_modules_org_module_uniq unique (organization_id, module_code),
  constraint organization_modules_org_id_uniq unique (organization_id, id)
);

create index organization_modules_org_idx on public.organization_modules (organization_id);

-- ---------------------------------------------------------------------------
-- sites (sedes)
-- ---------------------------------------------------------------------------
create table public.sites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null,
  address         text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint sites_org_name_uniq unique (organization_id, name),
  constraint sites_org_id_uniq unique (organization_id, id)
);

create index sites_org_idx on public.sites (organization_id);

create trigger t_sites_updated
  before update on public.sites
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- handle_new_user: crea el perfil al registrarse
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helpers de seguridad (SECURITY DEFINER, search_path fijo).
-- Leen memberships sin quedar atrapados por su RLS: evitan recursión.
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from memberships m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(org uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from memberships m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role_code = any (roles)
  );
$$;

create or replace function public.is_org_admin(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(org, array['admin']);
$$;

-- ¿El usuario actual comparte alguna organización activa con este perfil?
-- SECURITY DEFINER a propósito: la política de profiles no puede apoyarse en
-- un EXISTS directo sobre memberships porque la RLS de memberships le
-- ocultaría las filas de otros usuarios.
create or replace function public.shares_org_with(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from memberships m1
    join memberships m2 on m2.organization_id = m1.organization_id
    where m1.user_id = auth.uid()
      and m1.status = 'active'
      and m2.user_id = profile_id
      and m2.status = 'active'
  );
$$;

-- Estas funciones se pueden invocar desde políticas y desde el cliente.
grant execute on function public.is_org_member(uuid)          to authenticated;
grant execute on function public.has_org_role(uuid, text[])   to authenticated;
grant execute on function public.is_org_admin(uuid)           to authenticated;
grant execute on function public.shares_org_with(uuid)        to authenticated;

-- ---------------------------------------------------------------------------
-- Semilla mínima de fundaciones (los catálogos se crean en esta migración y
-- create_organization (0006) depende de estos códigos).
-- ---------------------------------------------------------------------------
insert into public.roles (code, name, description) values
  ('admin',      'Administrador de empresa', 'Configura la empresa, usuarios, módulos y aprueba operaciones sensibles.'),
  ('quality',    'Responsable de calidad',   'Gestiona trazabilidad, cálculo, evidencias y aprobaciones de calidad.'),
  ('consultant', 'Consultor externo',        'Acompaña la implementación. Puede pertenecer a varias empresas.')
on conflict (code) do nothing;

insert into public.modules (code, name, description) values
  ('core',              'Núcleo Trazaloop',              'Multiempresa, usuarios, roles, bitácora y configuración base.'),
  ('traceability_6632', 'Trazaloop 6632 / UNE-EN 15343', 'Trazabilidad y contenido reciclado para plásticos.'),
  ('docs',              'Trazaloop Docs',                'Construcción y control documental (constructor en subfase 1B).')
on conflict (code) do nothing;
