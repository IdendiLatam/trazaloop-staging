create or replace function public.resolve_organization_module_access(
  p_organization_id uuid,
  p_module_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_functional boolean;
  v_row        public.organization_modules%rowtype;
  v_is_demo    boolean;
  v_expired    boolean;
  v_allowed    boolean;
begin
  -- El acceso solo se resuelve para un miembro de la organización (o el
  -- superadministrador de plataforma). El organization_id llega validado por
  -- la sesión del servidor, jamás del cliente.
  if not (is_org_member(p_organization_id) or is_platform_superadmin()) then
    return jsonb_build_object('allowed', false, 'reason', 'not_member', 'assigned', false);
  end if;

  select coalesce(bool_or(m.is_functional), false) into v_functional
    from modules m where m.code = p_module_code;

  if not v_functional then
    return jsonb_build_object('allowed', false, 'reason', 'coming_soon', 'assigned', false, 'is_functional', false);
  end if;

  select * into v_row
    from organization_modules
   where organization_id = p_organization_id and module_code = p_module_code;

  if v_row.id is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_assigned', 'assigned', false, 'is_functional', true);
  end if;

  if not v_row.enabled then
    return jsonb_build_object(
      'allowed', false, 'reason', 'disabled', 'assigned', true, 'is_functional', true,
      'enabled', false, 'access_mode', v_row.access_mode, 'access_expires_at', v_row.access_expires_at
    );
  end if;

  v_is_demo := v_row.access_mode = 'demo';
  v_expired := v_is_demo and v_row.access_expires_at is not null and v_row.access_expires_at <= now();
  v_allowed := not v_expired;

  return jsonb_build_object(
    'allowed', v_allowed,
    'reason', case when v_expired then 'demo_expired' else 'ok' end,
    'assigned', true,
    'is_functional', true,
    'enabled', true,
    'access_mode', v_row.access_mode,
    'access_expires_at', v_row.access_expires_at,
    'is_demo', v_is_demo,
    'is_expired', v_expired
  );
end;
$$;
