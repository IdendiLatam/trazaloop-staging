-- ============================================================================
-- Trazaloop · Sprint T9F · Acceso comercial POR MÓDULO (demo/full/extra),
-- prueba Demo automática de 48 h al registrarse y gestión desde el
-- superadministrador.
-- ============================================================================
--
-- MODELO (definitivo). Los únicos access_mode son 'demo', 'full', 'extra'.
-- `enabled` es un eje SEPARADO (habilitación administrativa). "Demo temporal"
-- y "Demo permanente" comparten access_mode='demo' y solo difieren en
-- access_expires_at (fecha futura vs null). Full y Extra tienen EXACTAMENTE
-- las mismas funcionalidades; su única diferencia es la cuota de
-- almacenamiento — y eso YA está así en el seed de planes (0050): esta
-- migración NO inventa valores, reutiliza plan_definitions/plan_limits
-- (access_mode se mapea 1:1 a plan_code).
--
-- QUÉ HACE:
--  1. Cataloga los módulos "próximamente" (quality, construccion) y marca los
--     FUNCIONALES con modules.is_functional (traceability_6632 = CPR, textiles).
--     Es el espejo en BD de lib/modules/catalog.ts (una prueba lo verifica).
--  2. Añade a organization_modules las columnas de acceso comercial.
--  3. BACKFILL de filas existentes preservando el acceso EFECTIVO actual: el
--     access_mode se toma de la suscripción org-wide vigente (información de
--     plan previa, 0050) y access_expires_at = null (permanente). No cambia
--     enabled, no habilita filas deshabilitadas, no crea filas nuevas y NO
--     pone a las empresas antiguas en una prueba temporal.
--  4. CIERRA la RLS: authenticated ya no puede INSERT/UPDATE organization_
--     modules (una empresa no puede asignarse un plan a sí misma). Solo las
--     RPC SECURITY DEFINER de superadmin/registro escriben.
--  5. Reprograma create_organization / create_platform_organization para que
--     una empresa NUEVA reciba los módulos funcionales en Demo TEMPORAL de
--     exactamente 48 h (auditado), además del módulo de infraestructura.
--  6. RPC set_organization_module_access (solo superadmin) para gestionar el
--     estado comercial por módulo (Deshabilitado / Demo permanente / Full /
--     Extra), idempotente y auditada.
--  7. RPC resolve_organization_module_access para que los guards consulten el
--     acceso EFECTIVO con la hora de la BD (vencimiento por fecha, sin cron).
--
-- Auditoría: se reutiliza log_event()/audit_log (0005). No se crea tabla de
-- auditoría nueva. organization_modules ya tenía trigger de auditoría de fila
-- (0005), que registra el diff; los eventos semánticos lo complementan.
--
-- ROLLBACK (documentado; NO ejecutar sin decisión — ver informe T9F §42):
--   · restaurar las políticas RLS de 0006 (INSERT/UPDATE por is_org_admin);
--   · drop de las funciones nuevas y restaurar create_organization /
--     create_platform_organization a su cuerpo de 0053 (sin columnas de acceso);
--   · las columnas nuevas pueden conservarse (no estorban) o eliminarse con
--     `alter table ... drop column`; NO borrar filas de organization_modules.
--   ADVERTENCIA: las empresas registradas DESPUÉS de 0100 tienen su prueba
--   Demo en estas columnas; si se eliminan, revierten al modelo "enabled" y su
--   vencimiento se pierde (quedarían con acceso permanente). No se pierde
--   ningún dato de negocio. Ver el informe para preservar su acceso.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Catálogo de módulos: "próximamente" + marca de funcional
-- ----------------------------------------------------------------------------
insert into public.modules (code, name, description, is_available) values
  ('quality',      'Trazaloop Quality',      'Gestión de calidad. En desarrollo.',                   false),
  ('construccion', 'Trazaloop Construcción', 'Trazabilidad para el sector construcción. En desarrollo.', false)
on conflict (code) do nothing;

alter table public.modules
  add column if not exists is_functional boolean not null default false;

comment on column public.modules.is_functional is
  'T9F: módulo COMERCIAL funcional y publicado (recibe Demo 48 h al registrarse y es gestionable por el superadministrador). Espejo en BD de lib/modules/catalog.ts. core/docs/quality/construccion = false; traceability_6632 (CPR) y textiles = true.';

update public.modules set is_functional = true  where code in ('traceability_6632', 'textiles');
update public.modules set is_functional = false where code not in ('traceability_6632', 'textiles');

-- ----------------------------------------------------------------------------
-- 2. organization_modules: columnas de acceso comercial
-- ----------------------------------------------------------------------------
alter table public.organization_modules
  add column if not exists access_mode        text        not null default 'demo',
  add column if not exists access_started_at  timestamptz not null default now(),
  add column if not exists access_expires_at  timestamptz,
  add column if not exists updated_at         timestamptz not null default now(),
  add column if not exists updated_by         uuid        references public.profiles (id),
  add column if not exists assignment_source  text        not null default 'legacy_backfill';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organization_modules_access_mode_check'
  ) then
    alter table public.organization_modules
      add constraint organization_modules_access_mode_check
      check (access_mode in ('demo', 'full', 'extra'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'organization_modules_assignment_source_check'
  ) then
    alter table public.organization_modules
      add constraint organization_modules_assignment_source_check
      check (assignment_source in ('auto_demo_trial', 'superadmin', 'legacy_backfill', 'infrastructure'));
  end if;
end $$;

comment on column public.organization_modules.access_mode is
  'T9F: estado comercial (demo/full/extra). Mapea 1:1 a plan_code (plan_limits/plan_definitions). Demo temporal y permanente comparten ''demo'' y difieren solo en access_expires_at.';
comment on column public.organization_modules.access_expires_at is
  'T9F: vencimiento de la prueba Demo TEMPORAL. null = Demo permanente / Full / Extra. El vencimiento se deriva por FECHA (sin cron): un guard rechaza demo con expires_at <= now().';

-- ----------------------------------------------------------------------------
-- 3. Backfill: preservar el acceso EFECTIVO actual de las filas existentes
--    (sin poner a nadie en prueba temporal ni cambiar enabled)
-- ----------------------------------------------------------------------------
-- (a) Módulos comerciales existentes → access_mode desde la suscripción
--     org-wide vigente (información de plan previa; preserva acceso, no es una
--     decisión comercial). access_expires_at = null → permanente.
update public.organization_modules om
   set access_mode       = coalesce(os.plan_code, 'demo'),
       access_started_at = om.activated_at,
       access_expires_at = null,
       updated_at        = now(),
       assignment_source = 'legacy_backfill'
  from public.organization_subscriptions os
 where os.organization_id = om.organization_id
   and om.module_code <> 'core';

-- (b) Filas comerciales de organizaciones SIN suscripción → demo permanente
--     (preserva el acceso actual: hoy no hay vencimiento). Sin tocar enabled.
update public.organization_modules om
   set access_mode       = 'demo',
       access_started_at = om.activated_at,
       access_expires_at = null,
       updated_at        = now(),
       assignment_source = 'legacy_backfill'
 where om.module_code <> 'core'
   and not exists (select 1 from public.organization_subscriptions os where os.organization_id = om.organization_id);

-- (c) core (infraestructura): siempre disponible, sin vencimiento.
update public.organization_modules
   set access_mode       = 'full',
       access_expires_at = null,
       updated_at        = now(),
       assignment_source = 'infrastructure'
 where module_code = 'core';

-- ----------------------------------------------------------------------------
-- 4. RLS: cerrar escritura de authenticated (la empresa no se asigna planes)
-- ----------------------------------------------------------------------------
-- Antes (0006): INSERT/UPDATE los permitía is_org_admin (el admin de la propia
-- empresa). Con T9F el estado comercial SOLO lo cambian las RPC de registro y
-- de superadministrador (SECURITY DEFINER). Se elimina la escritura directa.
drop policy if exists organization_modules_insert on public.organization_modules;
drop policy if exists organization_modules_update on public.organization_modules;
-- SELECT (lectura por miembros) se conserva. No hay política DELETE (denegado
-- por defecto): un módulo se deshabilita con enabled=false, jamás se borra.

-- ----------------------------------------------------------------------------
-- 5. Provisión de una empresa NUEVA (Demo temporal 48 h)
-- ----------------------------------------------------------------------------
create or replace function public.provision_new_organization_modules(
  p_org uuid,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
begin
  -- Infraestructura: core siempre disponible, sin vencimiento.
  insert into public.organization_modules (
    organization_id, module_code, enabled,
    access_mode, access_started_at, access_expires_at, updated_at, updated_by, assignment_source
  )
  values (p_org, 'core', true, 'full', now(), null, now(), p_actor, 'infrastructure')
  on conflict (organization_id, module_code) do nothing;

  -- Módulos comerciales FUNCIONALES → Demo TEMPORAL de exactamente 48 horas
  -- desde AHORA (hora del servidor). Idempotente (on conflict do nothing): un
  -- reintento del registro jamás duplica ni reinicia el vencimiento.
  for v_rec in
    insert into public.organization_modules (
      organization_id, module_code, enabled,
      access_mode, access_started_at, access_expires_at, updated_at, updated_by, assignment_source
    )
    select p_org, m.code, true,
           'demo', now(), now() + interval '48 hours', now(), p_actor, 'auto_demo_trial'
      from public.modules m
     where m.is_functional
    on conflict (organization_id, module_code) do nothing
    returning module_code, access_expires_at
  loop
    perform log_event(
      p_org,
      'organization_module_demo_started',
      jsonb_build_object(
        'module_code', v_rec.module_code,
        'access_mode', 'demo',
        'access_expires_at', v_rec.access_expires_at,
        'trial_hours', 48
      ),
      p_actor
    );
  end loop;
end;
$$;

revoke all on function public.provision_new_organization_modules(uuid, uuid) from public, anon, authenticated;

comment on function public.provision_new_organization_modules(uuid, uuid) is
  'T9F · INTERNA (solo invocable por las RPC de registro SECURITY DEFINER). Siembra core (infra) + los módulos funcionales en Demo de 48 h, idempotente y auditado. No la puede llamar authenticated: una empresa no puede auto-provisionarse.';

-- ----------------------------------------------------------------------------
-- 5b. create_organization: mismo cuerpo de 0053 + provisión T9F de módulos
-- ----------------------------------------------------------------------------
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

  -- T9F: módulos funcionales en Demo de 48 h + core (infra). Reemplaza el
  -- seed de 0053 ('core','traceability_6632' sin access_mode).
  perform provision_new_organization_modules(v_org, v_user);

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

-- ----------------------------------------------------------------------------
-- 5c. create_platform_organization: mismo cuerpo de 0053 + provisión T9F
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 6. Gestión del estado comercial por el SUPERADMINISTRADOR
-- ----------------------------------------------------------------------------
create or replace function public.set_organization_module_access(
  p_organization_id uuid,
  p_module_code text,
  p_target_state text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid;
  v_before    public.organization_modules%rowtype;
  v_enabled   boolean;
  v_mode      text;
  v_expires   timestamptz;
  v_after     public.organization_modules%rowtype;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'No autenticado';
  end if;
  if not is_platform_superadmin() then
    raise exception 'Solo un superadministrador de plataforma puede cambiar el estado de un módulo';
  end if;

  if p_organization_id is null or not exists (select 1 from organizations where id = p_organization_id) then
    raise exception 'La empresa indicada no existe';
  end if;

  -- Solo módulos FUNCIONALES: jamás se puede habilitar un módulo "próximamente".
  if not exists (select 1 from modules m where m.code = p_module_code and m.is_functional) then
    raise exception 'Este módulo no está disponible para asignación';
  end if;

  if p_target_state not in ('disabled', 'demo_permanent', 'full', 'extra') then
    raise exception 'Estado objetivo no válido';
  end if;

  select * into v_before
    from organization_modules
   where organization_id = p_organization_id and module_code = p_module_code
   for update;

  -- Mapeo estado de UI → (enabled, access_mode, expires). "Deshabilitado"
  -- conserva el access_mode previo (historial) pero bloquea con enabled=false.
  if p_target_state = 'disabled' then
    v_enabled := false;
    v_mode    := coalesce(v_before.access_mode, 'demo');
    v_expires := v_before.access_expires_at;
  elsif p_target_state = 'demo_permanent' then
    v_enabled := true;  v_mode := 'demo';  v_expires := null;
  elsif p_target_state = 'full' then
    v_enabled := true;  v_mode := 'full';  v_expires := null;
  else -- extra
    v_enabled := true;  v_mode := 'extra'; v_expires := null;
  end if;

  if v_before.id is null then
    -- La empresa no tenía la asignación: se crea (Sin asignar → estado).
    insert into organization_modules (
      organization_id, module_code, enabled,
      access_mode, access_started_at, access_expires_at, updated_at, updated_by, assignment_source
    )
    values (
      p_organization_id, p_module_code, v_enabled,
      v_mode, now(), v_expires, now(), v_user, 'superadmin'
    )
    returning * into v_after;
  else
    update organization_modules
       set enabled           = v_enabled,
           access_mode       = v_mode,
           access_expires_at = v_expires,
           updated_at        = now(),
           updated_by        = v_user,
           assignment_source = 'superadmin'
     where organization_id = p_organization_id and module_code = p_module_code
    returning * into v_after;
  end if;

  perform log_event(
    p_organization_id,
    'organization_module_access_changed',
    jsonb_build_object(
      'module_code', p_module_code,
      'target_state', p_target_state,
      'before', jsonb_build_object(
        'assigned', v_before.id is not null,
        'enabled', v_before.enabled,
        'access_mode', v_before.access_mode,
        'access_expires_at', v_before.access_expires_at
      ),
      'after', jsonb_build_object(
        'enabled', v_after.enabled,
        'access_mode', v_after.access_mode,
        'access_expires_at', v_after.access_expires_at
      )
    ),
    v_user
  );

  return jsonb_build_object(
    'module_code', p_module_code,
    'enabled', v_after.enabled,
    'access_mode', v_after.access_mode,
    'access_expires_at', v_after.access_expires_at,
    'updated_at', v_after.updated_at
  );
end;
$$;

revoke all on function public.set_organization_module_access(uuid, text, text) from public, anon;
grant execute on function public.set_organization_module_access(uuid, text, text) to authenticated;

comment on function public.set_organization_module_access(uuid, text, text) is
  'T9F · SOLO superadministrador (re-verificado en SQL con is_platform_superadmin()). Cambia el estado comercial de un módulo funcional de una empresa (disabled/demo_permanent/full/extra), idempotente, auditado. Rechaza módulos no funcionales. No borra datos ni filas.';

-- ----------------------------------------------------------------------------
-- 7. Resolución del acceso EFECTIVO para los guards (vencimiento por fecha)
-- ----------------------------------------------------------------------------
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

revoke all on function public.resolve_organization_module_access(uuid, text) from public, anon;
grant execute on function public.resolve_organization_module_access(uuid, text) to authenticated;

comment on function public.resolve_organization_module_access(uuid, text) is
  'T9F · Acceso EFECTIVO de una empresa a un módulo, con la hora de la BD (vencimiento Demo por fecha, sin cron). Solo para miembros de la organización o superadmin. El kill switch global (env) lo aplica la capa de aplicación por encima de este resultado.';
