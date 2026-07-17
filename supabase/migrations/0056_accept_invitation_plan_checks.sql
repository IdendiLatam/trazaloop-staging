-- 0056_accept_invitation_plan_checks.sql
-- Trazaloop · Sprint 10A · Corrección (Bloqueante 1): aceptar una
-- invitación antigua no revisaba el plan de la empresa.
--
-- Caso real: una empresa en Full crea invitaciones pendientes; el
-- superadmin la baja a Demo; alguien acepta el link antiguo semanas
-- después. accept_team_invitation (0037) creaba la membership sin
-- revisar roles_enabled ni el límite de team_members ni si la
-- suscripción sigue activa.
--
-- Por qué el chequeo va AQUÍ (SQL, SECURITY DEFINER) y no en TypeScript
-- antes de llamar la RPC: quien acepta una invitación normalmente NO es
-- todavía miembro de esa empresa — v_organization_plan_usage (0052)
-- exige is_org_member(organization_id) o is_platform_staff() para poder
-- leerla, así que un chequeo previo desde el cliente con la sesión normal
-- del invitado siempre vería CERO filas (RLS) y nunca podría bloquear
-- nada de verdad. La RPC, en cambio, ya lee memberships/
-- organization_subscriptions/plan_limits directamente con privilegios
-- elevados — es el único lugar donde el chequeo es real.
--
-- Se preserva el cuerpo EXACTO ya probado de 0037: la única adición son
-- los 3 chequeos de plan, insertados DESPUÉS de confirmar que el usuario
-- todavía no es miembro (evita bloquear el caso idempotente de "ya soy
-- miembro, solo cerrar la invitación") y ANTES del INSERT en memberships.

create or replace function public.accept_team_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user         uuid;
  v_user_email   text;
  v_inv          record;
  v_plan_code    text;
  v_plan_status  text;
  v_roles_limit  record;
  v_members_limit record;
  v_members_count integer;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'No autenticado';
  end if;

  select email into v_user_email from profiles where id = v_user;
  if v_user_email is null then
    raise exception 'El usuario no tiene perfil asociado';
  end if;

  select * into v_inv
  from team_invitations
  where token = p_token
  for update;

  if v_inv.id is null then
    raise exception 'La invitación no existe';
  end if;

  if v_inv.status = 'accepted' then
    raise exception 'Esta invitación ya fue aceptada';
  end if;

  if v_inv.status = 'revoked' then
    raise exception 'Esta invitación fue revocada';
  end if;

  if v_inv.status = 'expired' or v_inv.expires_at < now() then
    if v_inv.status <> 'expired' then
      update team_invitations set status = 'expired' where id = v_inv.id;
    end if;
    raise exception 'La invitación expiró';
  end if;

  if lower(v_user_email) <> v_inv.email then
    raise exception 'Esta invitación fue enviada a otro correo electrónico';
  end if;

  if exists (
    select 1 from memberships
    where organization_id = v_inv.organization_id and user_id = v_user
  ) then
    -- Ya es miembro (por ejemplo, invitación duplicada aceptada dos veces
    -- en pestañas distintas): no duplicar membership, solo cerrar la
    -- invitación como aceptada. Sin chequeos de plan aquí — no se crea
    -- ningún registro nuevo.
    update team_invitations
      set status = 'accepted', accepted_by = v_user, accepted_at = now()
      where id = v_inv.id;
    return v_inv.organization_id;
  end if;

  -- Sprint 10A (Bloqueante 1): plan de la empresa de la invitación —
  -- 'demo'/'active' por defecto si por algún motivo no hubiera fila
  -- (no debería pasar tras el backfill de 0054, pero es la empresa de LA
  -- INVITACIÓN, no la del usuario que acepta, así que se lee directo).
  select coalesce(plan_code, 'demo'), coalesce(status, 'active')
    into v_plan_code, v_plan_status
  from organization_subscriptions
  where organization_id = v_inv.organization_id;

  if v_plan_status is null then
    v_plan_code := 'demo';
    v_plan_status := 'active';
  end if;

  if v_plan_status = 'suspended' then
    raise exception 'La cuenta de esta empresa está suspendida. Contacta al equipo de Trazaloop.';
  end if;
  if v_plan_status = 'cancelled' then
    raise exception 'La cuenta de esta empresa no está activa. Contacta al equipo de Trazaloop.';
  end if;

  select limit_value, is_unlimited into v_roles_limit
  from plan_limits
  where plan_code = v_plan_code and resource_code = 'roles_enabled';

  if v_roles_limit is not null and not v_roles_limit.is_unlimited and coalesce(v_roles_limit.limit_value, 0) <= 0 then
    raise exception 'Las invitaciones y roles están disponibles en los planes Full y Extra.';
  end if;

  select limit_value, is_unlimited into v_members_limit
  from plan_limits
  where plan_code = v_plan_code and resource_code = 'team_members';

  if v_members_limit is not null and not v_members_limit.is_unlimited then
    select count(*) into v_members_count
    from memberships
    where organization_id = v_inv.organization_id and status = 'active';

    if v_members_count >= coalesce(v_members_limit.limit_value, 0) then
      raise exception 'Tu plan Demo alcanzó el límite para este recurso. Actualiza a Full o Extra para continuar creando registros.';
    end if;
  end if;

  insert into memberships (organization_id, user_id, role_code, status)
  values (v_inv.organization_id, v_user, v_inv.role_code, 'active');

  update team_invitations
    set status = 'accepted', accepted_by = v_user, accepted_at = now()
    where id = v_inv.id;

  perform log_event(
    v_inv.organization_id,
    'team_invitation_accepted',
    jsonb_build_object('role_code', v_inv.role_code),
    v_user
  );

  return v_inv.organization_id;
end;
$$;
