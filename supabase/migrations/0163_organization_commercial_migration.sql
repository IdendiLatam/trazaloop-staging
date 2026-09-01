-- ============================================================================
-- Trazaloop · PE-04B2 · LA MIGRACIÓN COMERCIAL DE LAS EMPRESAS
-- ----------------------------------------------------------------------------
-- Aquí sí cambia la verdad. B1 construyó el modelo al lado; esto lo llena y lo
-- pone a mandar sobre el PLAN COMERCIAL.
--
--
-- LO QUE CAMBIA
--
--   · se publican revisiones SUCESORAS con la base comercial que el propietario
--     del producto cerró después de B1 — sin tocar las de B1, que son historia;
--   · cada empresa recibe su base Free permanente y, si procede, su concesión;
--   · `organization_effective_plan_code` pasa a leer el modelo canónico;
--   · la consola deja de llamar «plan actual» a una fila que nadie mantiene;
--   · una empresa nueva nace con Free + prueba de Full, leyendo la política.
--
--
-- LO QUE **NO** CAMBIA, Y ES DELIBERADO
--
--   · el ACCESO al módulo. `resolve_organization_module_access` sigue diciendo
--     lo mismo: si una prueba venció, el módulo sigue bloqueando escrituras.
--     Que un Free pueda escribir dentro de sus límites es el «modo consulta», y
--     eso es PE-04B4 (§29 del encargo). Desbloquearlo aquí sin el medidor de
--     tiempo dejaría a Free sin ninguna frontera;
--   · los límites de conteo y la cuota de subida siguen leyéndose de
--     `plan_limits`/`plan_definitions` por `access_mode`. La cuota canónica de
--     organización es PE-04B3;
--   · los créditos de IA y los minutos activos se GUARDAN como condición
--     comercial y no se descuentan. Eso es PE-04B4;
--   · el cupo de soporte de Extra se guarda y no se aplica. Eso es PE-04B5.
--
-- Los valores legacy y los canónicos coinciden por construcción para cada
-- empresa migrada —`demo`↔`free`, `full`↔`full`, `extra`↔`extra`—, así que
-- durante B2 no hay ninguna empresa que reciba unos límites y otro plan.
--
--
-- LO QUE NO SE BORRA
--
-- Nada. `plan_definitions`, `plan_limits`, `organization_subscriptions`,
-- `subscription_plan_history` y `organization_modules` se quedan enteros. La
-- primera pasa a ser evidencia histórica para el plan comercial; su `status`
-- sigue bloqueando cuentas suspendidas, que es un eje distinto.
-- ============================================================================


-- ============================================================================
-- 1 · EL VOCABULARIO QUE FALTABA
-- ----------------------------------------------------------------------------
-- B1 sembró dos marcadores provisionales —`ai_runs_per_month` y
-- `daily_metered_operations`— cuando aún no había decisión comercial. Ahora la
-- hay, y trae unidades distintas: créditos PONDERADOS y minutos ACTIVOS.
--
-- Los provisionales NO se borran: la revisión 1 los referencia y la revisión 1
-- es inmutable. Es lo que cuesta la historia, y es el precio correcto: se
-- quedan sin usar en las revisiones nuevas.
-- ============================================================================

-- Primero la restricción, después las filas: las unidades nuevas no existían
-- en el vocabulario cerrado de B1, y sembrarlas antes de ampliarlo falla.
alter table public.plan_resources drop constraint plan_resources_unit_check;
alter table public.plan_resources add constraint plan_resources_unit_check
  check (unit in ('count', 'bytes', 'boolean', 'runs_per_month', 'runs_per_day',
                  'credits_per_month', 'minutes_per_day', 'minutes_per_month'));

insert into public.plan_resources (code, label, unit, scope, is_public) values
  ('ai_weighted_credits_monthly',    'Créditos de Intelligence al mes', 'credits_per_month', 'organization', true),
  ('active_minutes_daily',           'Minutos activos al día',          'minutes_per_day',   'organization', true),
  ('active_minutes_monthly',         'Minutos activos al mes',          'minutes_per_month', 'organization', true),
  ('functional_support_cases_monthly','Casos de acompañamiento al mes', 'count',             'organization', true)
on conflict (code) do nothing;

comment on column public.plan_resources.unit is
  'PE-04B2 · En que se mide. `credits_per_month` es la unidad COMERCIAL de Intelligence: un credito PONDERADO, que no es una llamada al proveedor. El coste real —tokens, modelo, dinero— se sigue registrando aparte y NO se le enseña al cliente.';


-- ============================================================================
-- 2 · LA PRUEBA TIENE SU PROPIA BOLSA DE IA
-- ----------------------------------------------------------------------------
-- Esto es lo más fácil de modelar mal.
--
-- La prueba da Full ENTERO durante 48 horas... salvo en Intelligence, donde da
-- **50 créditos en total** y no los 500 al mes de Full. Es la única diferencia,
-- y es deliberada: un mes de Full en dos días saldría carísimo.
--
-- La forma incorrecta sería duplicar Full en un cuarto plan «full_trial» con
-- otros créditos. Tendríamos dos planes que hay que mantener iguales en todo lo
-- demás, y el día que cambie el almacenamiento de Full alguien se olvidará del
-- gemelo.
--
-- La forma correcta: la prueba apunta a la revisión REAL de Full, y la política
-- lleva su propia bolsa. Un único sitio, y se lee al resolver.
-- ============================================================================

alter table public.commercial_trial_policy
  add column trial_ai_credits bigint;

alter table public.commercial_trial_policy
  add constraint ctp_trial_credits_positive
    check (trial_ai_credits is null or trial_ai_credits >= 0);

comment on column public.commercial_trial_policy.trial_ai_credits is
  'PE-04B2 · Creditos de Intelligence de la prueba, EN TOTAL — no al mes. La prueba da Full entero salvo aqui. Se modela como politica y no como un cuarto plan: duplicar Full para cambiarle una cifra crea un gemelo que alguien se olvidara de mantener.';

update public.commercial_trial_policy
   set trial_ai_credits = 50, trial_plan_code = 'full', trial_duration_hours = 48
 where id;


-- ============================================================================
-- 3 · LAS REVISIONES SUCESORAS
-- ----------------------------------------------------------------------------
-- Las de B1 NO se tocan. Se publican sucesoras con la base cerrada, y las de B1
-- quedan retiradas con su periodo cerrado y sus valores intactos: dicen lo que
-- se creyó en su momento, que es para lo que sirve una revisión.
--
-- IDEMPOTENTE por marca: si ya existe una revisión de PE-04B2 publicada para un
-- plan, no se crea otra. Reejecutar no genera una revisión por pasada.
-- ============================================================================

do $$
declare
  v_plan   text;
  v_rev    uuid;
  v_num    integer;
  v_previa uuid;
begin
  foreach v_plan in array array['free', 'full', 'extra'] loop
    -- ¿Ya está hecha? La marca vive en las notas internas.
    if exists (select 1 from plan_revisions
                where plan_code = v_plan and internal_notes like 'PE-04B2%') then
      continue;
    end if;

    select coalesce(max(revision_number), 0) + 1 into v_num
      from plan_revisions where plan_code = v_plan;

    insert into plan_revisions (
      plan_code, revision_number, status, display_name, description,
      public_conditions, price_state, currency,
      monthly_price_minor, annual_price_minor, internal_notes)
    values (
      v_plan, v_num, 'draft',
      case v_plan when 'free' then 'Free' when 'full' then 'Full' else 'Extra' end,
      case v_plan
        when 'free'  then 'Plan permanente sin coste. Incluye la ayuda, las preguntas frecuentes y los vídeos tutoriales, como todos los planes.'
        when 'full'  then 'Producto completo según los módulos contratados, sin límite de tiempo de uso.'
        else 'Como Full, con más almacenamiento, más Intelligence y acompañamiento funcional priorizado.'
      end,
      case v_plan
        when 'free'  then '50 MiB de almacenamiento · 25 créditos de Intelligence al mes · 30 minutos activos al día y 300 al mes'
        when 'full'  then '500 MiB de almacenamiento · 500 créditos de Intelligence al mes · sin límite de tiempo de uso'
        else '5 GiB de almacenamiento · 2000 créditos de Intelligence al mes · 2 casos de acompañamiento priorizado al mes'
      end,
      'configured', 'USD',
      case v_plan when 'free' then 0 when 'full' then 4000 else 10000 end,
      case v_plan when 'free' then 0 when 'full' then 40000 else 100000 end,
      'PE-04B2 · Base comercial cerrada por el propietario del producto tras B1. '
        || 'Los precios son ANTES de impuestos. El anual de Full equivale a diez meses.'
    )
    returning id into v_rev;

    -- --- Los límites -------------------------------------------------------
    -- Se COPIAN de la revisión anterior los que no cambian —los conteos
    -- funcionales, que nadie ha revisado— y se declaran los que sí.
    select id into v_previa from plan_revisions
     where plan_code = v_plan and status <> 'draft'
     order by revision_number desc limit 1;

    if v_previa is not null then
      insert into plan_revision_limits (plan_revision_id, resource_code, limit_state, limit_value)
      select v_rev, l.resource_code, l.limit_state, l.limit_value
        from plan_revision_limits l
       where l.plan_revision_id = v_previa
         -- Los provisionales de B1 no viajan: los sustituye el vocabulario
         -- comercial cerrado.
         and l.resource_code not in ('ai_runs_per_month', 'daily_metered_operations');
    end if;

    -- Almacenamiento · los mismos bytes que ya se aplicaban.
    insert into plan_revision_limits (plan_revision_id, resource_code, limit_state, limit_value)
    values (v_rev, 'storage_bytes', 'finite',
            case v_plan when 'free' then 52428800
                        when 'full' then 524288000
                        else 5368709120 end)
    on conflict (plan_revision_id, resource_code)
      do update set limit_state = excluded.limit_state, limit_value = excluded.limit_value;

    -- Intelligence · créditos PONDERADOS al mes. No se acumulan.
    insert into plan_revision_limits (plan_revision_id, resource_code, limit_state, limit_value)
    values (v_rev, 'ai_weighted_credits_monthly', 'finite',
            case v_plan when 'free' then 25 when 'full' then 500 else 2000 end);

    -- Tiempo activo · Free tiene tope; los de pago, no. `unlimited` y no un
    -- número enorme: son cosas distintas y el modelo las distingue.
    insert into plan_revision_limits (plan_revision_id, resource_code, limit_state, limit_value)
    values
      (v_rev, 'active_minutes_daily',
       case when v_plan = 'free' then 'finite' else 'unlimited' end,
       case when v_plan = 'free' then 30 else null end),
      (v_rev, 'active_minutes_monthly',
       case when v_plan = 'free' then 'finite' else 'unlimited' end,
       case when v_plan = 'free' then 300 else null end);

    -- Soporte · reportar un fallo del producto lo puede todo el mundo; el
    -- acompañamiento funcional es de Extra, y con cupo.
    insert into plan_revision_limits (plan_revision_id, resource_code, limit_state, limit_value)
    values (v_rev, 'functional_support_cases_monthly', 'finite',
            case when v_plan = 'extra' then 2 else 0 end)
    on conflict (plan_revision_id, resource_code)
      do update set limit_state = excluded.limit_state, limit_value = excluded.limit_value;

    -- --- Publicar ----------------------------------------------------------
    -- Se cierra la vigente y se abre esta. No se usa `plan_publish_revision`
    -- porque exige `is_platform_superadmin()` y una migración no tiene sesión;
    -- el efecto es el mismo y `published_by` queda nulo, que es más honesto que
    -- atribuírselo a alguien.
    update plan_revisions
       set effective_to = now(), status = 'retired'
     where plan_code = v_plan and status = 'published' and effective_to is null;

    update plan_revisions
       set status = 'published', effective_from = now(), published_at = now()
     where id = v_rev;
  end loop;
end;
$$;


-- ============================================================================
-- 4 · RECONOCER ANTES DE ESCRIBIR
-- ----------------------------------------------------------------------------
-- Migrar sin haber contado es como limpiar sin haber inventariado. Esta vista
-- clasifica cada (empresa, módulo funcional) por lo que la AUTORIDAD REAL dice
-- hoy: `organization_modules.access_mode` y la vigencia de su prueba.
--
-- `organization_subscriptions.plan_code` NO participa. Es la fila que nadie
-- mantiene, y la que hace que la consola diga «Plan Demo» a un cliente Full.
-- Se conserva en la vista solo para poder MEDIR el desacuerdo.
-- ============================================================================

create view public.v_commercial_migration_recognition
with (security_invoker = true)
as
select
  o.id                       as organization_id,
  o.name                     as organization_name,
  om.module_code,
  om.access_mode             as legacy_access_mode,
  om.enabled,
  om.access_expires_at,
  om.assignment_source,
  s.plan_code                as legacy_subscription_plan,
  case
    when not om.enabled                                   then 'disabled'
    when om.access_mode = 'extra'                         then 'extra'
    when om.access_mode = 'full'                          then 'full'
    when om.access_mode = 'demo'
         and (om.access_expires_at is null
              or om.access_expires_at > now())            then 'demo_active'
    when om.access_mode = 'demo'                          then 'demo_expired'
    else 'unclassified'
  end                        as category,
  -- A qué plan canónico corresponde. `demo` —vigente o vencido— es Free: la
  -- ventana de prueba deja de ser un plan y el suelo pasa a ser Free.
  case om.access_mode when 'extra' then 'extra' when 'full' then 'full'
                      else 'free' end as canonical_plan_code,
  (s.plan_code is not null
   and s.plan_code <> case om.access_mode when 'extra' then 'extra'
                                          when 'full'  then 'full' else 'demo' end)
                             as legacy_mismatch
from public.organizations o
join public.organization_modules om on om.organization_id = o.id
join public.modules m on m.code = om.module_code and m.is_functional
left join public.organization_subscriptions s on s.organization_id = o.id;

comment on view public.v_commercial_migration_recognition is
  'PE-04B2 · Clasifica cada (empresa, modulo funcional) por la AUTORIDAD REAL: organization_modules.access_mode y la vigencia de su prueba. La suscripcion legacy no participa en la clasificacion; se muestra solo para medir el desacuerdo.';

revoke all on public.v_commercial_migration_recognition from public, anon;
grant select on public.v_commercial_migration_recognition to authenticated;


-- ============================================================================
-- 5 · LA MIGRACIÓN
-- ----------------------------------------------------------------------------
-- Tres reglas, y las tres importan.
--
-- 1 · NADIE PIERDE. Un módulo Full o Extra conserva su nivel. Una prueba
--     vigente conserva **la fecha que ya tenía**: no se reinician 48 horas
--     desde la migración, porque eso regalaría tiempo que nadie compró.
--
-- 2 · NADIE GANA POR ACCIDENTE. Una suscripción legacy en `full` NO eleva un
--     módulo cuya prueba venció, y una en `demo` NO degrada un módulo Full. La
--     clasificación sale del módulo, no de la suscripción.
--
-- 3 · `core` NO PARTICIPA. Nace en `full` para siempre en toda empresa porque
--     es infraestructura; darle asignación comercial haría que cualquier
--     empresa resolviera a Full y el plan dejaría de significar nada. La vista
--     de reconocimiento ya lo excluye por `is_functional`.
--
-- IDEMPOTENTE: cada inserción lleva su `where not exists`. Reejecutar no crea
-- una segunda base, ni una segunda prueba, ni duplica nada.
-- ============================================================================

create or replace function public.commercial_migrate_organizations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bases    integer := 0;
  v_pruebas  integer := 0;
  v_pagos    integer := 0;
  v_rec      record;
  v_rev_free uuid;
  v_rev      uuid;
begin
  select id into v_rev_free from plan_revisions
   where plan_code = 'free' and status = 'published' and effective_to is null;
  if v_rev_free is null then
    raise exception 'No hay revisión vigente de Free: el catálogo no está listo.';
  end if;

  for v_rec in
    select o.id as organization_id, om.module_code, om.access_mode,
           om.enabled, om.access_expires_at
      from organizations o
      join organization_modules om on om.organization_id = o.id
      join modules m on m.code = om.module_code and m.is_functional
     order by o.id, om.module_code
  loop
    -- --- La base Free, por módulo y sin caducidad -------------------------
    if not exists (
      select 1 from organization_plan_assignments a
       where a.organization_id = v_rec.organization_id
         and a.scope = 'module' and a.module_code = v_rec.module_code
         and a.grant_kind = 'base'
    ) then
      insert into organization_plan_assignments (
        organization_id, plan_revision_id, scope, module_code,
        grant_kind, source, reason)
      values (v_rec.organization_id, v_rev_free, 'module', v_rec.module_code,
              'base', 'migration',
              'PE-04B2 · Base Free permanente. El suelo no caduca.');
      v_bases := v_bases + 1;
    end if;

    -- --- Y lo que tenga por encima ----------------------------------------
    if v_rec.access_mode in ('full', 'extra') then
      select id into v_rev from plan_revisions
       where plan_code = v_rec.access_mode and status = 'published'
         and effective_to is null;

      if v_rev is not null and not exists (
        select 1 from organization_plan_assignments a
         where a.organization_id = v_rec.organization_id
           and a.scope = 'module' and a.module_code = v_rec.module_code
           and a.grant_kind = 'sold'
      ) then
        insert into organization_plan_assignments (
          organization_id, plan_revision_id, scope, module_code,
          grant_kind, source, reason)
        values (v_rec.organization_id, v_rev, 'module', v_rec.module_code,
                'sold', 'migration',
                'PE-04B2 · Derivado del access_mode del módulo, que es la autoridad real.');
        v_pagos := v_pagos + 1;
      end if;

    elsif v_rec.access_mode = 'demo'
          and (v_rec.access_expires_at is null or v_rec.access_expires_at > now()) then
      -- Prueba VIGENTE: se conserva la fecha que ya tenía. Reiniciar 48 horas
      -- desde la migración regalaría tiempo que nadie compró.
      select id into v_rev from plan_revisions
       where plan_code = (select trial_plan_code from commercial_trial_policy where id)
         and status = 'published' and effective_to is null;

      if v_rev is not null and not exists (
        select 1 from organization_plan_assignments a
         where a.organization_id = v_rec.organization_id
           and a.scope = 'module' and a.module_code = v_rec.module_code
           and a.grant_kind = 'trial'
      ) then
        insert into organization_plan_assignments (
          organization_id, plan_revision_id, scope, module_code,
          grant_kind, source, starts_at, ends_at, reason)
        values (v_rec.organization_id, v_rev, 'module', v_rec.module_code,
                'trial', 'migration',
                least(now(), coalesce(v_rec.access_expires_at, now())) - interval '1 second',
                coalesce(v_rec.access_expires_at, now() + interval '48 hours'),
                'PE-04B2 · Prueba heredada. Conserva la caducidad que ya tenía.');
        v_pruebas := v_pruebas + 1;
      end if;
    end if;
    -- Una prueba VENCIDA no produce concesión: se queda con su base Free, que
    -- es exactamente la mejora — hoy queda comercialmente muerta.
  end loop;

  return jsonb_build_object('free_bases', v_bases, 'trials', v_pruebas, 'paid', v_pagos);
end;
$$;

comment on function public.commercial_migrate_organizations() is
  'PE-04B2 · Idempotente. Deriva las asignaciones canonicas del access_mode del modulo, que es la autoridad real desde T9F.1. La suscripcion legacy NO participa: es la fila que nadie mantiene.';

revoke all on function public.commercial_migrate_organizations() from public, anon, authenticated;

-- Se ejecuta ahora, dentro de la propia migración.
select public.commercial_migrate_organizations();


-- ============================================================================
-- 6 · EL CAMBIO DE AUTORIDAD
-- ----------------------------------------------------------------------------
-- `organization_effective_plan_code` pasa a leer el modelo canónico. Es el
-- punto por el que todo el producto pregunta «¿qué plan tiene esta empresa?»,
-- así que cambiarlo aquí cambia la respuesta en todas partes a la vez —que es
-- justo lo que se quiere: una sola verdad.
--
-- Y devuelve `free` donde antes devolvía `demo`. El suelo dejó de ser una
-- prueba caducada y pasó a ser un plan.
--
-- LA RESERVA LEGACY DESAPARECE. Antes, si no había filas de módulo, caía a
-- `organization_subscriptions.plan_code`. Esa fila es la que causa el «Plan
-- Demo · 50 MB» de una empresa Full, y seguir leyéndola dejaría el defecto
-- vivo en el único sitio donde nadie lo miraría.
-- ============================================================================

create or replace function public.organization_effective_plan_code(p_organization_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  v_res := plan_effective_for_organization(p_organization_id, now());

  if v_res->>'status' = 'found' then
    return v_res->>'plan_code';
  end if;

  -- Sin asignación canónica, el suelo es Free. NO se mira la suscripción
  -- legacy: es la fuente que produce el defecto que este tramo cierra.
  return 'free';
end;
$$;

comment on function public.organization_effective_plan_code(uuid) is
  'PE-04B2 · Lee el modelo CANONICO. Devuelve free | full | extra. Ya no consulta organization_subscriptions: esa fila nadie la mantiene y es la que hacia que la consola dijera «Plan Demo» a un cliente Full.';


-- ============================================================================
-- 7 · LA CUOTA QUE SE ENSEÑA
-- ----------------------------------------------------------------------------
-- §14 del encargo: dejar de enseñar una cuota que se sabe falsa.
--
-- `v_organization_plan_usage` lee `organization_subscriptions` y de ahí saca
-- los 50 MB. No se toca la vista —hay consumidores que dependen de su forma—:
-- se añade una función que da la referencia CANÓNICA, y la consola pasa a
-- usarla.
--
-- La APLICACIÓN de la cuota sigue siendo de B3. Esto solo deja de mentir.
-- ============================================================================

create or replace function public.organization_commercial_storage_bytes(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan jsonb;
  v_lim  jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not (is_org_member(p_organization_id) or is_platform_staff()) then
    raise exception 'No autorizado';
  end if;

  v_plan := plan_effective_for_organization(p_organization_id, now());
  if v_plan->>'status' <> 'found' then
    -- Ni se inventa un número ni se enseña el de un plan cualquiera.
    return jsonb_build_object('status', v_plan->>'status');
  end if;

  v_lim := plan_limit_for_revision((v_plan->>'plan_revision_id')::uuid, 'storage_bytes');
  return jsonb_build_object(
    'status', 'found',
    'plan_code', v_plan->>'plan_code',
    'limit_state', v_lim->>'status',
    'limit_bytes', v_lim->'value'
  );
end;
$$;

comment on function public.organization_commercial_storage_bytes(uuid) is
  'PE-04B2 · La referencia CANONICA de almacenamiento, para dejar de enseñar la del plan legacy. La APLICACION de la cuota es PE-04B3: esto solo deja de mentir.';

revoke all on function public.organization_commercial_storage_bytes(uuid) from public, anon;
grant execute on function public.organization_commercial_storage_bytes(uuid) to authenticated;


-- ============================================================================
-- 8 · UNA EMPRESA NUEVA NACE CON FREE Y UNA PRUEBA
-- ----------------------------------------------------------------------------
-- Y las 48 horas salen de la política, no de un literal dentro de la función.
-- Ese era el defecto: cambiar la duración exigía una migración.
--
-- `provision_new_organization_modules` sigue escribiendo `organization_modules`
-- exactamente como antes —el acceso al módulo no cambia en B2— y además crea
-- las asignaciones canónicas.
--
-- LA PRUEBA SE DA UNA VEZ. No hay tabla nueva: se deriva de la historia. Si ya
-- existe una asignación de prueba para ese (empresa, módulo) —aunque haya
-- caducado— no se concede otra. Apagar y encender el módulo no regala otra
-- prueba, y ese era el camino de abuso obvio.
-- ============================================================================

create or replace function public.commercial_provision_new_module(
  p_organization_id uuid,
  p_module_code text,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pol      record;
  v_rev_free uuid;
  v_rev_pru  uuid;
  v_ya       boolean;
  v_prueba   boolean := false;
begin
  select coalesce(bool_or(m.is_functional), false) into v_ya
    from modules m where m.code = p_module_code;
  if not v_ya then
    return jsonb_build_object('skipped', 'not_functional');
  end if;

  select id into v_rev_free from plan_revisions
   where plan_code = 'free' and status = 'published' and effective_to is null;
  if v_rev_free is null then
    raise exception 'No hay revisión vigente de Free.';
  end if;

  -- La base Free, permanente.
  insert into organization_plan_assignments (
    organization_id, plan_revision_id, scope, module_code,
    grant_kind, source, assigned_by, reason)
  select p_organization_id, v_rev_free, 'module', p_module_code,
         'base', 'seed', p_actor, 'Base Free permanente.'
   where not exists (
     select 1 from organization_plan_assignments a
      where a.organization_id = p_organization_id and a.scope = 'module'
        and a.module_code = p_module_code and a.grant_kind = 'base');

  -- La prueba, si la política la ofrece y este módulo no la ha consumido ya.
  select * into v_pol from commercial_trial_policy where id;
  if v_pol.enabled then
    select exists (
      select 1 from organization_plan_assignments a
       where a.organization_id = p_organization_id and a.scope = 'module'
         and a.module_code = p_module_code and a.grant_kind = 'trial'
    ) into v_ya;

    if not v_ya then
      select id into v_rev_pru from plan_revisions
       where plan_code = v_pol.trial_plan_code and status = 'published'
         and effective_to is null;
      if v_rev_pru is not null then
        insert into organization_plan_assignments (
          organization_id, plan_revision_id, scope, module_code,
          grant_kind, source, assigned_by, ends_at, reason)
        values (p_organization_id, v_rev_pru, 'module', p_module_code,
                'trial', 'trial', p_actor,
                now() + make_interval(hours => v_pol.trial_duration_hours),
                'Prueba introductoria de ' || v_pol.trial_duration_hours || ' horas.');
        v_prueba := true;
      end if;
    end if;
  end if;

  return jsonb_build_object('base', true, 'trial', v_prueba);
end;
$$;

comment on function public.commercial_provision_new_module(uuid, text, uuid) is
  'PE-04B2 · Base Free + prueba introductoria, leyendo commercial_trial_policy. La prueba se da UNA VEZ por (empresa, modulo): se deriva de la historia de asignaciones, sin tabla nueva. Apagar y encender el modulo no regala otra.';

revoke all on function public.commercial_provision_new_module(uuid, text, uuid)
  from public, anon, authenticated;


-- --- Y se engancha a la provisión que ya existe ------------------------------
-- La función legacy se conserva ENTERA: sigue escribiendo `organization_modules`
-- igual que antes, porque el acceso al módulo no cambia en este tramo. Lo único
-- que se le añade es la creación de las asignaciones canónicas.
create or replace function public.provision_new_organization_modules(p_org uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_pol record;
begin
  select * into v_pol from commercial_trial_policy where id;

  insert into public.organization_modules (
    organization_id, module_code, enabled,
    access_mode, access_started_at, access_expires_at, updated_at, updated_by, assignment_source
  )
  values (p_org, 'core', true, 'full', now(), null, now(), p_actor, 'infrastructure')
  on conflict (organization_id, module_code) do nothing;

  for v_rec in
    insert into public.organization_modules (
      organization_id, module_code, enabled,
      access_mode, access_started_at, access_expires_at, updated_at, updated_by, assignment_source
    )
    select p_org, m.code, true,
           'demo', now(),
           now() + make_interval(hours => coalesce(v_pol.trial_duration_hours, 48)),
           now(), p_actor, 'auto_demo_trial'
      from public.modules m
     where m.is_functional
    on conflict (organization_id, module_code) do nothing
    returning module_code, access_expires_at
  loop
    -- El mismo `log_event` de 0100, no un insert a mano: `audit_log` no tiene
    -- columna `action` y escribirla directamente rompe la creación de empresas
    -- entera. Se copia del original en vez de parafrasearlo.
    perform log_event(
      p_org,
      'organization_module_demo_started',
      jsonb_build_object(
        'module_code', v_rec.module_code,
        'access_mode', 'demo',
        'access_expires_at', v_rec.access_expires_at,
        'trial_hours', coalesce(v_pol.trial_duration_hours, 48)
      ),
      p_actor
    );

    -- PE-04B2 · Y su verdad comercial canónica: base Free + prueba de Full.
    perform commercial_provision_new_module(p_org, v_rec.module_code, p_actor);
  end loop;
end;
$$;

comment on function public.provision_new_organization_modules(uuid, uuid) is
  'PE-04B2 · Sigue escribiendo organization_modules igual que antes —el acceso al modulo no cambia en este tramo— y ademas crea la verdad comercial canonica. La duracion de la prueba sale de commercial_trial_policy, no de un literal.';
