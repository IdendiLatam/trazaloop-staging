-- ============================================================================
-- 0103_pcr01_effective_plan_and_input_batch_quantity.sql
-- Trazaloop · Sprint PCR-01 · Hardening funcional del módulo PCR (plásticos)
--
-- ADITIVA sobre 0102 (aplicada e INTACTA). No borra datos, no trunca, no
-- desactiva RLS, no crea planes ni estados comerciales nuevos, no toca
-- migraciones históricas. Reemplazos de funciones existentes SOLO mediante
-- CREATE OR REPLACE conservando firmas. Idempotente donde tiene sentido.
--
-- ÍNDICE:
--   §1  organization_effective_plan_code — plan efectivo de la ORGANIZACIÓN
--       derivado de organization_modules (autoridad T9F), con fallback legacy
--   §2  get_organization_effective_plan — RPC de lectura para el servidor
--   §3  accept_team_invitation — CORRECCIÓN DEL BUG Demo→Full (punto 16):
--       el plan que gobierna invitaciones deja de leer la copia obsoleta de
--       organization_subscriptions y usa el plan efectivo por módulos
--   §4  input_batches — cantidad OBLIGATORIA en INSERT y protegida contra
--       degradación en UPDATE (punto 10 + PCR-01.1), sin invalidar ni
--       modificar filas históricas
--   §5  Auditoría de datos legacy (queries de diagnóstico, solo lectura)
--   §6  Verificaciones posteriores (documentación)
--
-- CAUSA RAÍZ DEL BUG Demo→Full (diagnóstico PCR-01):
--   T9F.1 movió la autoridad comercial al MÓDULO (organization_modules.
--   access_mode, gestionado por set_organization_module_access) y retiró de
--   la consola el formulario del plan legacy (organization_subscriptions).
--   Pero el subsistema de equipo siguió leyendo organization_subscriptions:
--   · accept_team_invitation (0056) leía plan_code directo de esa tabla;
--   · checkFeatureEnabled/checkResourceLimit (server) leían
--     v_organization_plan_usage (misma tabla).
--   Resultado: superadmin sube módulos a Full/Extra → la copia legacy sigue
--   'demo' → invitar/aceptar quedaba bloqueado con mensajes de Demo, sin que
--   refresh, nueva sesión o limpieza de caché pudieran arreglarlo (el estado
--   obsoleto vive en la BD, no en el navegador).
--
-- ROLLBACK (ver PCR-01-ROLLBACK.md; NO ejecutar sin decisión):
--   · accept_team_invitation: restaurar la definición de 0056 (el archivo del
--     repositorio es la fuente) — vuelve el bug, no pierde datos.
--   · drop function get_organization_effective_plan(uuid);
--     drop function organization_effective_plan_code(uuid);
--   · drop trigger t_input_batches_require_quantity on input_batches;
--     drop function input_batches_require_quantity();
--   Nada de esta migración escribe, borra ni transforma datos de negocio.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §1 · Plan efectivo de la organización derivado de los MÓDULOS (T9F)
-- ----------------------------------------------------------------------------
-- Regla (documentada en el informe PCR-01):
--   · Se consideran los módulos COMERCIALES FUNCIONALES (modules.is_functional)
--     asignados a la empresa con enabled = true.
--   · Un módulo en 'full' o 'extra' nunca vence; un módulo en 'demo' con
--     access_expires_at vencido NO aporta (misma semántica que
--     resolve_organization_module_access, 0100).
--   · El plan efectivo es el MEJOR modo vigente: extra > full > demo.
--   · Si la empresa no tiene NINGUNA fila de módulo funcional (estado
--     anterior a la provisión T9F), se conserva el comportamiento previo:
--     organization_subscriptions.plan_code, con 'demo' como piso.
--   · El resultado es SIEMPRE uno de: 'demo' | 'full' | 'extra' (no se crean
--     estados comerciales nuevos; Full y Extra siguen difiriendo solo en
--     almacenamiento, que aquí no se toca).
create or replace function public.organization_effective_plan_code(
  p_organization_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_module_rows boolean;
  v_best            text;
  v_legacy          text;
begin
  select exists (
    select 1
      from organization_modules om
      join modules m on m.code = om.module_code
     where om.organization_id = p_organization_id
       and m.is_functional
  ) into v_has_module_rows;

  if v_has_module_rows then
    select mode into v_best
      from (
        select om.access_mode as mode,
               case om.access_mode when 'extra' then 3 when 'full' then 2 else 1 end as rank
          from organization_modules om
          join modules m on m.code = om.module_code
         where om.organization_id = p_organization_id
           and m.is_functional
           and om.enabled
           and om.access_mode in ('demo', 'full', 'extra')
           and (om.access_mode <> 'demo'
                or om.access_expires_at is null
                or om.access_expires_at > now())
      ) vigentes
     order by rank desc
     limit 1;

    -- Sin módulos vigentes (todos deshabilitados o Demo vencido): piso Demo.
    return coalesce(v_best, 'demo');
  end if;

  -- Fallback legacy (empresas sin provisión T9F): comportamiento previo.
  select plan_code into v_legacy
    from organization_subscriptions
   where organization_id = p_organization_id;

  if v_legacy in ('demo', 'full', 'extra') then
    return v_legacy;
  end if;
  return 'demo';
end;
$$;

comment on function public.organization_effective_plan_code(uuid) is
  'PCR-01 · Plan efectivo ORG-WIDE derivado de organization_modules (autoridad T9F): mejor access_mode vigente (extra>full>demo) entre módulos funcionales habilitados; Demo vencido no aporta; sin filas de módulo → fallback al plan legacy con piso demo. Gobierna recursos transversales (equipo/invitaciones). Server-only: sin EXECUTE para clientes.';

revoke execute on function public.organization_effective_plan_code(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- §2 · RPC de lectura para el servidor (sesión real, con autorización)
-- ----------------------------------------------------------------------------
create or replace function public.get_organization_effective_plan(
  p_organization_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not (is_org_member(p_organization_id) or is_platform_staff()) then
    raise exception 'No autorizado para consultar el plan de esta empresa';
  end if;
  return organization_effective_plan_code(p_organization_id);
end;
$$;

comment on function public.get_organization_effective_plan(uuid) is
  'PCR-01 · Lectura autorizada del plan efectivo por módulos: solo miembros de la empresa o staff de plataforma. Es la fuente que usan los helpers server de recursos transversales (roles_enabled/team_members) en lugar de la copia legacy.';

grant execute on function public.get_organization_effective_plan(uuid) to authenticated;
revoke execute on function public.get_organization_effective_plan(uuid) from public, anon;

-- ----------------------------------------------------------------------------
-- §3 · accept_team_invitation — corrección del bug Demo→Full (punto 16)
-- ----------------------------------------------------------------------------
-- Mismo cuerpo y misma firma que 0056; cambia ÚNICAMENTE la fuente del plan
-- comercial: organization_effective_plan_code(...) en lugar de la copia
-- obsoleta de organization_subscriptions.plan_code. El estado ADMINISTRATIVO
-- de la cuenta (suspended/cancelled) se conserva desde
-- organization_subscriptions: es un eje distinto del plan comercial y sigue
-- bloqueando con sus mensajes exactos. Mensajes de 0056 INTACTOS.
create or replace function public.accept_team_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user          uuid;
  v_user_email    text;
  v_inv           record;
  v_plan_code     text;
  v_plan_status   text;
  v_roles_limit   record;
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
    -- Ya es miembro: no duplicar membership, solo cerrar la invitación.
    update team_invitations
      set status = 'accepted', accepted_by = v_user, accepted_at = now()
      where id = v_inv.id;
    return v_inv.organization_id;
  end if;

  -- Estado ADMINISTRATIVO de la cuenta (eje independiente del plan): igual
  -- que 0056 — una cuenta suspendida/cancelada bloquea antes que todo.
  select coalesce(status, 'active') into v_plan_status
  from organization_subscriptions
  where organization_id = v_inv.organization_id;

  if v_plan_status is null then
    v_plan_status := 'active';
  end if;

  if v_plan_status = 'suspended' then
    raise exception 'La cuenta de esta empresa está suspendida. Contacta al equipo de Trazaloop.';
  end if;
  if v_plan_status = 'cancelled' then
    raise exception 'La cuenta de esta empresa no está activa. Contacta al equipo de Trazaloop.';
  end if;

  -- PCR-01 (punto 16): plan comercial EFECTIVO por módulos — la única fuente
  -- de autoridad tras T9F.1. Demo→Full/Extra habilita invitaciones de
  -- inmediato; Full→Demo vuelve a aplicar las restricciones Demo. Es la
  -- empresa de LA INVITACIÓN, no la del usuario que acepta.
  v_plan_code := organization_effective_plan_code(v_inv.organization_id);

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

comment on function public.accept_team_invitation(text) is
  'PCR-01 · Igual que 0056 salvo la fuente del plan comercial: organization_effective_plan_code (autoridad por módulos T9F) en lugar de la copia obsoleta de organization_subscriptions. El estado administrativo suspended/cancelled se conserva desde la suscripción legacy. Corrige el bug Demo→Full de invitaciones sin desactivar ningún control.';

-- ----------------------------------------------------------------------------
-- §4 · input_batches — cantidad obligatoria en INSERT y protegida en UPDATE
--      (punto 10; semántica corregida en PCR-01.1)
-- ----------------------------------------------------------------------------
-- Estrategia segura con datos reales en producción:
--   · NO se agrega NOT NULL ni CHECK global: existirían (o podrían existir)
--     lotes históricos con quantity_kg NULL y un CHECK rompería la EDICIÓN de
--     esas filas (p. ej. corregir notas) sin aportar seguridad.
--   · INSERT: todo lote NUEVO exige quantity_kg NOT NULL y > 0.
--   · UPDATE (PCR-01.1, blocker 2): si quantity_kg CAMBIA
--     (NEW IS DISTINCT FROM OLD), el nuevo valor debe ser NOT NULL y > 0.
--     Así un lote válido no puede degradarse a NULL/0/negativo después de
--     creado. Si quantity_kg NO cambia, el UPDATE pasa: un lote histórico con
--     NULL puede seguir editándose (notas, ubicación…) sin inventar una
--     cantidad, y puede corregirse NULL→valor válido cuando exista el dato
--     real. Casos: 100→NULL RECHAZA · 100→0 RECHAZA · 100→-5 RECHAZA ·
--     100→80 PERMITE · NULL→80 PERMITE · NULL→NULL (editando otro campo)
--     PERMITE.
--   · La validación de formulario/server action/importador (mensaje en
--     español) ocurre ANTES; este trigger es la barrera final (INSERT o
--     UPDATE directo por API también quedan cubiertos).
create or replace function public.input_batches_require_quantity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.quantity_kg is null or new.quantity_kg <= 0 then
      raise exception 'La cantidad del lote es obligatoria y debe ser mayor que 0 kg.'
        using errcode = '23514';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.quantity_kg is distinct from old.quantity_kg
       and (new.quantity_kg is null or new.quantity_kg <= 0) then
      raise exception 'La cantidad del lote es obligatoria y debe ser mayor que 0 kg.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.input_batches_require_quantity() is
  'PCR-01/PCR-01.1 (punto 10) · INSERT: todo lote nuevo exige quantity_kg > 0. UPDATE: si quantity_kg cambia (IS DISTINCT FROM), el nuevo valor debe ser > 0 — un lote no puede degradarse a NULL/0/negativo. Un lote histórico con NULL sigue siendo editable en sus demás campos y corregible a un valor válido; nunca se inventan ni destruyen cantidades legacy.';

revoke execute on function public.input_batches_require_quantity() from public, anon, authenticated;

drop trigger if exists t_input_batches_require_quantity on public.input_batches;
create trigger t_input_batches_require_quantity
  before insert or update on public.input_batches
  for each row execute function public.input_batches_require_quantity();

-- ----------------------------------------------------------------------------
-- §5 · Auditoría de datos legacy (SOLO LECTURA — ejecutar antes del release)
-- ----------------------------------------------------------------------------
-- Estas consultas NO se ejecutan automáticamente: son el diagnóstico que la
-- guía de despliegue (PCR-01-PRODUCTION-DEPLOY.md) pide correr en producción
-- ANTES de aplicar la migración, para documentar el volumen de lotes
-- históricos sin cantidad. El CHECK original de 0025 ya impide 0 y negativos,
-- por lo que el único caso legacy esperable es NULL.
--
--   -- Lotes de entrada por estado de cantidad (por empresa):
--   select organization_id,
--          count(*)                                  as total,
--          count(*) filter (where quantity_kg is null)     as sin_cantidad,
--          count(*) filter (where quantity_kg is not null) as con_cantidad
--     from public.input_batches
--    group by organization_id
--    order by sin_cantidad desc;
--
--   -- Detalle de lotes sin cantidad (para corrección manual posterior):
--   select organization_id, id, batch_code, received_date, created_at
--     from public.input_batches
--    where quantity_kg is null
--    order by organization_id, received_date;
--
--   -- Verificación de que no existen valores inválidos (debe dar 0 filas;
--   -- el CHECK input_batches_quantity_positive de 0025 lo garantiza):
--   select id, batch_code, quantity_kg
--     from public.input_batches
--    where quantity_kg is not null and quantity_kg <= 0;

-- ----------------------------------------------------------------------------
-- §6 · Verificaciones posteriores (documentación; ver guía de despliegue)
-- ----------------------------------------------------------------------------
--   select public.organization_effective_plan_code('<org-en-full>');  -- 'full'
--   select has_function_privilege('authenticated',
--     'public.get_organization_effective_plan(uuid)', 'execute');      -- true
--   select has_function_privilege('authenticated',
--     'public.organization_effective_plan_code(uuid)', 'execute');     -- false
--   select tgname from pg_trigger
--    where tgrelid = 'public.input_batches'::regclass
--      and tgname = 't_input_batches_require_quantity';                -- 1 fila
--   insert into public.input_batches (...) sin quantity_kg → debe fallar con
--   'La cantidad del lote es obligatoria y debe ser mayor que 0 kg.'
--   update public.input_batches set quantity_kg = null where id = '<lote-con-
--   cantidad>' → debe fallar con el mismo mensaje (PCR-01.1: la cantidad no
--   puede degradarse tras crear el lote).
--   update public.input_batches set notes = 'x' where id = '<lote-legacy-
--   null>' → debe PASAR (quantity_kg no cambia).
