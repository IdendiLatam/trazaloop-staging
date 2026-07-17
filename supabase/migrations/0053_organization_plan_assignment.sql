-- 0053_organization_plan_assignment.sql
-- Trazaloop · Sprint 10A · Parte 4/5: asignación automática del plan Demo
-- al crear una empresa, y cambio de plan controlado por superadmin.
--
-- create_organization y create_platform_organization se reemplazan de
-- nuevo (última vez: 0042) — se preserva el cuerpo EXACTO ya probado de
-- ambas, solo se agregan los INSERT de organization_subscriptions /
-- subscription_plan_history al final, dentro de la MISMA transacción
-- SECURITY DEFINER. plan_code NUNCA sale del cliente en el flujo normal
-- (create_organization no gana ningún parámetro de plan);
-- create_platform_organization sí gana uno opcional (solo superadmin
-- puede invocarla, ya exigido desde 0042), con 'demo' por defecto si no
-- se especifica.

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

  insert into organization_modules (organization_id, module_code)
  select v_org, m.code
  from modules m
  where m.code in ('core', 'traceability_6632')
    and m.is_available;

  -- Sprint 10A (Parte 4): toda empresa nueva del flujo normal queda en
  -- Demo automáticamente, sin excepción y sin que el cliente pueda
  -- influir en el plan asignado.
  insert into organization_subscriptions (organization_id, plan_code, status, assigned_by, notes)
  values (v_org, 'demo', 'active', v_user, 'Asignado automáticamente al crear la empresa.');

  insert into subscription_plan_history (organization_id, from_plan_code, to_plan_code, changed_by, change_reason)
  values (v_org, null, 'demo', v_user, 'Asignación automática al crear la empresa.');

  perform log_event(
    v_org,
    'organization_created',
    jsonb_build_object('name', trim(p_name)),
    v_user
  );

  return v_org;
end;
$$;

create or replace function public.create_platform_organization(
  p_name text,
  p_legal_name text default null,
  p_tax_id text default null,
  p_country text default null,
  p_city text default null,
  p_contact_email text default null,
  p_admin_name text default null,
  p_admin_email text default null,
  p_plan_code text default 'demo'
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

  if coalesce(p_plan_code, 'demo') not in ('demo', 'full', 'extra') then
    raise exception 'Plan no válido';
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

  -- Sprint 10A (Parte 4/5): igual que create_organization, siempre queda
  -- una suscripción real — 'demo' por defecto si el superadmin no eligió
  -- otra explícitamente.
  insert into organization_subscriptions (organization_id, plan_code, status, assigned_by, notes)
  values (v_org, coalesce(p_plan_code, 'demo'), 'active', v_user, 'Asignado al crear la empresa desde la consola de plataforma.');

  insert into subscription_plan_history (organization_id, from_plan_code, to_plan_code, changed_by, change_reason)
  values (v_org, null, coalesce(p_plan_code, 'demo'), v_user, 'Asignación inicial desde la consola de plataforma.');

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
      jsonb_build_object('admin_email', v_admin_email, 'admin_linked', true, 'admin_name', p_admin_name, 'plan_code', coalesce(p_plan_code, 'demo')),
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
      jsonb_build_object('admin_email', v_admin_email, 'admin_linked', false, 'admin_name', p_admin_name, 'plan_code', coalesce(p_plan_code, 'demo')),
      v_user
    );

    return query select v_org, false, v_token;
  end if;
end;
$$;

revoke execute on function public.create_platform_organization(
  text, text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.create_platform_organization(
  text, text, text, text, text, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- change_organization_plan (Parte 5): único camino para cambiar el plan o
-- el estado de una suscripción — atómico, deja huella en el historial.
-- Cubre las 5 acciones pedidas (Demo/Full/Extra/Suspender/Reactivar) como
-- combinaciones de (plan_code, status): "Suspender" = mismo plan_code,
-- status='suspended'; "Reactivar" = mismo plan_code, status='active'.
-- ---------------------------------------------------------------------------
create or replace function public.change_organization_plan(
  p_organization_id uuid,
  p_to_plan_code text,
  p_to_status text default 'active',
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_from_plan text;
begin
  v_user := auth.uid();
  if v_user is null or not is_platform_superadmin() then
    raise exception 'Solo un superadministrador de plataforma puede cambiar el plan de una empresa';
  end if;
  if p_to_plan_code not in ('demo', 'full', 'extra') then
    raise exception 'Plan no válido';
  end if;
  if p_to_status not in ('active', 'suspended', 'cancelled') then
    raise exception 'Estado de suscripción no válido';
  end if;
  if not exists (select 1 from organizations where id = p_organization_id) then
    raise exception 'La empresa no existe';
  end if;

  select plan_code into v_from_plan from organization_subscriptions where organization_id = p_organization_id;

  insert into organization_subscriptions (organization_id, plan_code, status, assigned_by, notes)
  values (p_organization_id, p_to_plan_code, p_to_status, v_user, p_reason)
  on conflict (organization_id) do update set
    plan_code = excluded.plan_code,
    status = excluded.status,
    assigned_by = excluded.assigned_by,
    assigned_at = now(),
    notes = excluded.notes;

  insert into subscription_plan_history (organization_id, from_plan_code, to_plan_code, changed_by, change_reason)
  values (
    p_organization_id,
    v_from_plan,
    p_to_plan_code,
    v_user,
    case
      when v_from_plan is not null and v_from_plan = p_to_plan_code and p_to_status = 'suspended'
        then coalesce('Suspendido. ' || p_reason, 'Suspendido.')
      when v_from_plan is not null and v_from_plan = p_to_plan_code and p_to_status = 'active'
        then coalesce('Reactivado. ' || p_reason, 'Reactivado.')
      else p_reason
    end
  );

  perform log_event(
    p_organization_id,
    'organization_plan_changed',
    jsonb_build_object('from_plan_code', v_from_plan, 'to_plan_code', p_to_plan_code, 'to_status', p_to_status),
    v_user
  );
end;
$$;

revoke execute on function public.change_organization_plan(uuid, text, text, text) from public, anon;
grant execute on function public.change_organization_plan(uuid, text, text, text) to authenticated;
