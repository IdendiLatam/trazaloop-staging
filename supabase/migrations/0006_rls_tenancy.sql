-- 0006_rls_tenancy.sql
-- Trazaloop · Sprint 1 · Fundaciones
-- RLS deny-by-default + políticas de tenencia + RPC de onboarding.
--
-- Principio: sin política que conceda, no hay acceso. Ninguna tabla queda
-- sin RLS. service_role bypasea RLS pero JAMÁS se usa desde el navegador.

alter table public.profiles             enable row level security;
alter table public.organizations        enable row level security;
alter table public.roles                enable row level security;
alter table public.memberships          enable row level security;
alter table public.modules              enable row level security;
alter table public.organization_modules enable row level security;
alter table public.sites                enable row level security;
alter table public.audit_log            enable row level security;

-- ---------------------------------------------------------------------------
-- Catálogos globales: lectura para autenticados; sin escritura de cliente.
-- ---------------------------------------------------------------------------
create policy roles_select on public.roles
  for select to authenticated using (true);

create policy modules_select on public.modules
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Leer: el propio perfil, o perfiles con los que se comparte organización
-- (para mostrar miembros). shares_org_with es SECURITY DEFINER: sin recursión.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- El INSERT lo hace el trigger handle_new_user (definer). Sin DELETE de cliente.

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

-- Sin INSERT directo de cliente (usar create_organization). Sin DELETE en Alpha.

-- ---------------------------------------------------------------------------
-- memberships — políticas DIRECTAS para evitar recursión:
-- nunca llamar aquí a is_org_member (que lee memberships); is_org_admin es
-- seguro porque es SECURITY DEFINER y no vuelve a evaluar esta política.
-- ---------------------------------------------------------------------------
create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_org_admin(organization_id));

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy memberships_update on public.memberships
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy memberships_delete on public.memberships
  for delete to authenticated
  using (public.is_org_admin(organization_id));

-- La PRIMERA membership de una organización la crea create_organization (definer).

-- ---------------------------------------------------------------------------
-- organization_modules
-- ---------------------------------------------------------------------------
create policy organization_modules_select on public.organization_modules
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy organization_modules_insert on public.organization_modules
  for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy organization_modules_update on public.organization_modules
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- Sin DELETE: un módulo se desactiva con enabled = false.

-- ---------------------------------------------------------------------------
-- sites
-- ---------------------------------------------------------------------------
create policy sites_select on public.sites
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy sites_insert on public.sites
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin', 'quality']));

create policy sites_update on public.sites
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin', 'quality']))
  with check (public.has_org_role(organization_id, array['admin', 'quality']));

-- DELETE permitido a admin/quality; las FK futuras usan ON DELETE RESTRICT,
-- así que una sede referenciada por lotes no podrá borrarse.
create policy sites_delete on public.sites
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin', 'quality']));

-- ---------------------------------------------------------------------------
-- audit_log: lectura solo admin/quality de la organización; sin escritura de
-- cliente (escriben las funciones SECURITY DEFINER); inmutable por trigger.
-- ---------------------------------------------------------------------------
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    organization_id is not null
    and public.has_org_role(organization_id, array['admin', 'quality'])
  );

-- ---------------------------------------------------------------------------
-- RPC de onboarding: create_organization
-- Crea organización + primera membership admin + módulos base, atómico.
-- SECURITY DEFINER: es la única vía de INSERT en organizations para clientes.
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_tax_id text default null,
  p_country text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_org  uuid;
begin
  v_user := auth.uid();

  if v_user is null then
    raise exception 'No autenticado';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'El nombre de la empresa no puede estar vacío';
  end if;

  if not exists (select 1 from profiles where id = v_user) then
    raise exception 'El usuario no tiene perfil asociado';
  end if;

  insert into organizations (name, tax_id, country, created_by)
  values (trim(p_name), p_tax_id, p_country, v_user)
  returning id into v_org;

  insert into memberships (organization_id, user_id, role_code, status)
  values (v_org, v_user, 'admin', 'active');

  insert into organization_modules (organization_id, module_code)
  select v_org, m.code
  from modules m
  where m.code in ('core', 'traceability_6632', 'docs')
    and m.is_available;

  perform log_event(
    v_org,
    'organization_created',
    jsonb_build_object('name', trim(p_name)),
    v_user
  );

  return v_org;
end;
$$;

grant execute on function public.create_organization(text, text, text) to authenticated;
