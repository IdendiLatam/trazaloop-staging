-- 0042_restrict_organization_creation.sql
-- Trazaloop · Sprint 8.4 · Un usuario normal solo puede crear una empresa.
--
-- Reemplaza create_organization (0006) para agregar los 3 guardas de la
-- Parte 2/9 — SOLO para usuarios normales; un platform_superadmin nunca
-- pasa por aquí (crea empresas desde create_platform_organization, más
-- abajo, que además vincula o invita al administrador inicial). No cambia
-- la firma de la función: mismo create_organization(p_name, p_tax_id,
-- p_country) que ya usa /select-org, así que no hace falta tocar ningún
-- server action existente de organizations.

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
  v_email text;
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

  -- Un platform_superadmin SÍ puede crear varias empresas (Parte 2, Caso
  -- D) — pero típicamente desde la consola de plataforma
  -- (create_platform_organization). Se deja también sin bloquear aquí por
  -- si alguna vez usa el flujo normal, sin duplicar lógica de permisos.
  if not is_platform_superadmin() then
    if exists (
      select 1 from memberships where user_id = v_user and status = 'active'
    ) then
      raise exception
        'Tu cuenta ya está asociada a una empresa. Si necesitas administrar otra organización, contacta al equipo de Trazaloop.';
    end if;

    if exists (select 1 from organizations where created_by = v_user) then
      raise exception
        'Tu cuenta ya está asociada a una empresa. Si necesitas administrar otra organización, contacta al equipo de Trazaloop.';
    end if;

    select email into v_email from profiles where id = v_user;
    if v_email is not null and exists (
      select 1 from team_invitations
      where email = lower(v_email) and status = 'pending' and expires_at > now()
    ) then
      raise exception
        'Tienes una invitación pendiente. Acéptala en vez de crear una empresa nueva.';
    end if;
  end if;

  insert into organizations (name, tax_id, country, created_by)
  values (trim(p_name), p_tax_id, p_country, v_user)
  returning id into v_org;

  insert into memberships (organization_id, user_id, role_code, status)
  values (v_org, v_user, 'admin', 'active');

  -- OBSERVACIÓN (corrección post Sprint 8.4): 'docs' se retira de los
  -- módulos base. El catálogo `modules` (0004) sigue teniendo esa fila
  -- (no se renombra ni se borra), pero YA NO se activa automáticamente:
  -- el dashboard sí muestra un ModuleBadge por cada module_code activo
  -- (ver app/(app)/(shell)/dashboard/page.tsx), así que activarlo creaba
  -- la expectativa visible de un "Trazaloop Docs" funcional que no existe
  -- (constructor documental, PDF, etc. — explícitamente fuera de alcance).
  insert into organization_modules (organization_id, module_code)
  select v_org, m.code
  from modules m
  where m.code in ('core', 'traceability_6632')
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

-- ---------------------------------------------------------------------------
-- create_platform_organization — Parte 8: solo superadmin, crea la
-- organización y vincula (o invita) al administrador inicial. Nunca acepta
-- organization_id del cliente (se genera aquí). Nunca usa service_role: es
-- SECURITY DEFINER, corre con la sesión real del superadmin que la llama.
-- ---------------------------------------------------------------------------
create or replace function public.create_platform_organization(
  p_name text,
  p_legal_name text default null,
  p_tax_id text default null,
  p_country text default null,
  p_city text default null,
  p_contact_email text default null,
  p_admin_name text default null,
  p_admin_email text default null
)
returns table (
  organization_id uuid,
  admin_linked boolean,
  invitation_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user          uuid;
  v_org           uuid;
  v_admin_profile uuid;
  v_admin_email   text;
  v_token         text;
begin
  v_user := auth.uid();

  if v_user is null then
    raise exception 'No autenticado';
  end if;

  if not is_platform_superadmin() then
    raise exception 'Solo un superadministrador de plataforma puede crear empresas desde esta consola';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'El nombre de la empresa no puede estar vacío';
  end if;

  v_admin_email := lower(trim(coalesce(p_admin_email, '')));
  if v_admin_email = '' then
    raise exception 'El correo del administrador inicial es obligatorio';
  end if;

  insert into organizations (name, legal_name, tax_id, contact_email, city, country, created_by)
  values (
    trim(p_name),
    nullif(trim(coalesce(p_legal_name, '')), ''),
    nullif(trim(coalesce(p_tax_id, '')), ''),
    nullif(trim(coalesce(p_contact_email, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_country, '')), ''),
    v_user
  )
  returning id into v_org;

  insert into organization_modules (organization_id, module_code)
  select v_org, m.code
  from modules m
  where m.code in ('core', 'traceability_6632')
    and m.is_available;

  select id into v_admin_profile from profiles where lower(email) = v_admin_email;

  if v_admin_profile is not null then
    if not exists (
      select 1 from memberships
      where memberships.organization_id = v_org and memberships.user_id = v_admin_profile
    ) then
      insert into memberships (organization_id, user_id, role_code, status)
      values (v_org, v_admin_profile, 'admin', 'active');
    end if;

    perform log_event(
      v_org,
      'platform_organization_created',
      jsonb_build_object('admin_email', v_admin_email, 'admin_linked', true, 'admin_name', p_admin_name),
      v_user
    );

    return query select v_org, true, null::text;
  else
    v_token := encode(gen_random_bytes(32), 'hex');

    insert into team_invitations (organization_id, email, role_code, token, expires_at, invited_by)
    values (v_org, v_admin_email, 'admin', v_token, now() + interval '7 days', v_user);

    perform log_event(
      v_org,
      'platform_organization_created',
      jsonb_build_object('admin_email', v_admin_email, 'admin_linked', false, 'admin_name', p_admin_name),
      v_user
    );

    return query select v_org, false, v_token;
  end if;
end;
$$;

revoke execute on function public.create_platform_organization(
  text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.create_platform_organization(
  text, text, text, text, text, text, text, text
) to authenticated;
