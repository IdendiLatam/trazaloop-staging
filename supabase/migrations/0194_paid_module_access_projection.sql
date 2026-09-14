-- =============================================================================
-- Trazaloop · PROD-LAUNCH-01D.4A · Lo que se paga llega a los módulos
-- =============================================================================
--
-- EL DEFECTO QUE ESTO CIERRA
--
-- El primer pago real de Trazaloop —157 080 COP, aprobado, conciliado— dejó a
-- la empresa así:
--
--     billing_subscriptions        full · active · manual
--     organization_plan_assignments  quality/textiles/6632 → sold
--     organization_modules           demo, vencido el 2026-09-09
--
-- Y la puerta de los módulos lee `organization_modules`. Resultado: pagó, la
-- pantalla dijo «Tu plan está activo», y al entrar a Quality se encontró
-- «Estás consultando» sin poder crear ni editar.
--
-- La causa es que hay DOS VERDADES sobre el acceso a un módulo. La liquidación
-- concede en el modelo canónico —`commercial_apply_assignment` escribe en
-- `organization_plan_assignments` y en ningún sitio más— mientras la puerta
-- sigue preguntando a la tabla vieja. 0163 cerró esa duplicidad para el PLAN;
-- para el ACCESO A MÓDULOS nunca se cerró.
--
--
-- QUÉ HACE ESTA MIGRACIÓN, Y QUÉ NO
--
-- No unifica las dos verdades: eso es ENTITLEMENT-CONVERGENCE-01 y es un
-- rediseño, no un arreglo de lanzamiento. Lo que hace es convertir
-- `organization_modules` en una PROYECCIÓN de lo canónico: deja de ser una
-- segunda decisión comercial y pasa a ser un reflejo, recalculado siempre a
-- partir de lo que se pagó.
--
--
-- POR QUÉ UN DISPARADOR Y NO UNA LLAMADA EN CADA LIQUIDACIÓN
--
-- Porque hay cinco caminos que conceden —compra inicial, renovación, mejora,
-- cambio programado y asignación de administración— y añadir una línea a cada
-- uno es exactamente cómo se llega a que el sexto se olvide. Con el disparador,
-- la proyección ocurre en la MISMA TRANSACCIÓN que el reconocimiento del
-- dinero, por construcción: no puede quedar dinero cobrado con módulos sin
-- entregar, porque si la proyección falla, la liquidación se deshace entera.
--
--
-- POR QUÉ EL VENCIMIENTO ES EL FIN DEL PERIODO PAGADO
--
-- Marcar Full sin fecha habría dado acceso PERPETUO por una mensualidad. La
-- regla canónica de acceso (lib/modules/access.ts) se cambió en el mismo tramo
-- para que Full y Extra miren su vencimiento —antes lo ignoraban— de modo que
-- al terminar el periodo la empresa vuelve sola a solo consulta, por FECHA y
-- sin ningún cron. Sin fecha sigue significando perpetuo, que es lo correcto
-- para `core` y para un Full concedido a mano.
--
-- Cuando se escribió esto no había ni una fila full/extra con vencimiento en
-- Producción ni en Staging, así que el cambio de regla no le quitó el acceso a
-- nadie.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Un origen propio para lo proyectado
-- -----------------------------------------------------------------------------
-- Se distingue de `superadmin` a propósito: una fila puesta por un pago y una
-- puesta a mano por administración no son lo mismo, y cuando haya que auditar
-- por qué una empresa tiene Full, la diferencia es justo lo que se busca.

alter table public.organization_modules
  drop constraint if exists organization_modules_assignment_source_check;

alter table public.organization_modules
  add constraint organization_modules_assignment_source_check
  check (assignment_source = any (array[
    'auto_demo_trial', 'superadmin', 'legacy_backfill', 'infrastructure',
    'paid_checkout'
  ]));

comment on column public.organization_modules.assignment_source is
  '0194: de dónde sale esta fila. «paid_checkout» = PROYECTADA desde el modelo '
  'canónico por un periodo pagado; no editar a mano, se recalcula sola.';

-- -----------------------------------------------------------------------------
-- 2 · La proyección
-- -----------------------------------------------------------------------------

create or replace function public.billing_project_module_access(
  p_organization_id uuid
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hasta timestamptz;
  v_plan  text;
  v_n     integer := 0;
begin
  if p_organization_id is null then return 0; end if;

  -- HASTA CUÁNDO LLEGA LO PAGADO.
  --
  -- El final del periodo liquidado más lejano de la empresa. Se toma el máximo
  -- y no «el periodo actual» por dos motivos: renovar por adelantado crea el
  -- periodo siguiente anclado a la era —así que el máximo se extiende solo, sin
  -- perder días— y cancelar no borra los periodos ya pagados, de modo que el
  -- acceso dura hasta el final de lo que se pagó y ni un día menos.
  --
  -- No se filtra por estado de la suscripción: lo que da derecho es el dinero
  -- reconocido, no el estado de hoy.
  select pe.period_end, pe.plan_code
    into v_hasta, v_plan
    from public.billing_subscription_periods pe
   where pe.organization_id = p_organization_id
     and pe.status = 'settled'
   order by pe.period_end desc, pe.created_at desc
   limit 1;

  if v_hasta is null then return 0; end if;
  -- Free no proyecta nada: no compra acceso a módulos.
  if v_plan not in ('full', 'extra') then return 0; end if;

  -- Se proyecta SOLO sobre módulos con concesión vendida vigente. Un módulo
  -- que la empresa nunca tuvo no se regala por haber pagado un plan.
  update public.organization_modules om
     set enabled           = true,
         access_mode       = v_plan,
         access_expires_at = v_hasta,
         assignment_source = 'paid_checkout',
         updated_at        = now()
   where om.organization_id = p_organization_id
     and exists (
       select 1 from public.organization_plan_assignments a
        where a.organization_id = om.organization_id
          and a.scope = 'module'
          and a.module_code = om.module_code
          and a.grant_kind = 'sold'
          and a.starts_at <= now()
          and (a.ends_at is null or a.ends_at > now()))
     and exists (
       select 1 from public.modules m
        where m.code = om.module_code and coalesce(m.is_functional, false))
     -- IDEMPOTENTE: si ya está proyectado igual, no se escribe. Volver a
     -- ejecutarla no mueve `updated_at` ni cuenta como cambio.
     and (om.enabled           is distinct from true
       or om.access_mode       is distinct from v_plan
       or om.access_expires_at is distinct from v_hasta);

  get diagnostics v_n = row_count;
  return v_n;
end $$;

comment on function public.billing_project_module_access(uuid) is
  '0194: recalcula organization_modules desde el modelo canónico (concesiones '
  'vendidas + periodos liquidados). Idempotente. Ver PROD-LAUNCH-01D.4A.';

-- Nadie la ejecuta desde fuera: la disparan los cambios del modelo canónico.
revoke all on function public.billing_project_module_access(uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3 · Cuándo se recalcula
-- -----------------------------------------------------------------------------
-- En los dos sitios donde cambia lo canónico: cuando se liquida un periodo y
-- cuando se concede o retira un módulo. Dentro de una misma liquidación saltan
-- los dos; el primero ve un estado a medias y el segundo lo corrige, y como
-- todo ocurre en la misma transacción, fuera solo se ve el resultado final.

create or replace function public.billing_project_module_access_tg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.billing_project_module_access(
    coalesce(new.organization_id, old.organization_id));
  return null;
end $$;

drop trigger if exists t_project_module_access_on_period
  on public.billing_subscription_periods;
create trigger t_project_module_access_on_period
  after insert or update on public.billing_subscription_periods
  for each row execute function public.billing_project_module_access_tg();

drop trigger if exists t_project_module_access_on_grant
  on public.organization_plan_assignments;
create trigger t_project_module_access_on_grant
  after insert or update on public.organization_plan_assignments
  for each row execute function public.billing_project_module_access_tg();

-- -----------------------------------------------------------------------------
-- 4 · Reparar lo ya pagado
-- -----------------------------------------------------------------------------
-- Regla general, sin nombrar ninguna empresa: toda la que tenga periodos
-- liquidados. Hoy es una; mañana serán las que sean, y esto seguirá valiendo.

do $$
declare r record; v_total integer := 0; v_filas integer;
begin
  for r in
    select distinct pe.organization_id
      from public.billing_subscription_periods pe
     where pe.status = 'settled'
  loop
    v_filas := public.billing_project_module_access(r.organization_id);
    v_total := v_total + v_filas;
    if v_filas > 0 then
      raise notice '0194 · empresa % → % módulos proyectados', r.organization_id, v_filas;
    end if;
  end loop;
  raise notice '0194 · backfill completado: % filas de módulo proyectadas', v_total;
end $$;
