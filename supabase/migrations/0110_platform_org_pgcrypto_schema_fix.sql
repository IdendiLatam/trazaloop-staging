-- Hotfix: qualify pgcrypto gen_random_bytes() in both
-- public.create_platform_organization overloads.
-- Append-only migration; no data changes.
-- SECURITY DEFINER and search_path=public are intentionally preserved.

CREATE OR REPLACE FUNCTION "public"."create_platform_organization"("p_name" "text", "p_legal_name" "text" DEFAULT NULL::"text", "p_tax_id" "text" DEFAULT NULL::"text", "p_country" "text" DEFAULT NULL::"text", "p_city" "text" DEFAULT NULL::"text", "p_contact_email" "text" DEFAULT NULL::"text", "p_admin_name" "text" DEFAULT NULL::"text", "p_admin_email" "text" DEFAULT NULL::"text") RETURNS TABLE("organization_id" "uuid", "admin_linked" boolean, "invitation_token" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
    v_token := encode(extensions.gen_random_bytes(32), 'hex');

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
CREATE OR REPLACE FUNCTION "public"."create_platform_organization"("p_name" "text", "p_legal_name" "text" DEFAULT NULL::"text", "p_tax_id" "text" DEFAULT NULL::"text", "p_country" "text" DEFAULT NULL::"text", "p_city" "text" DEFAULT NULL::"text", "p_contact_email" "text" DEFAULT NULL::"text", "p_admin_name" "text" DEFAULT NULL::"text", "p_admin_email" "text" DEFAULT NULL::"text", "p_plan_code" "text" DEFAULT 'demo'::"text") RETURNS TABLE("organization_id" "uuid", "admin_linked" boolean, "invitation_token" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  -- T9F: misma provisión de módulos que el registro normal (Demo 48 h).
  perform provision_new_organization_modules(v_org, v_user);

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
    v_token := encode(extensions.gen_random_bytes(32), 'hex');

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
