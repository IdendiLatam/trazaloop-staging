-- ===========================================================================
-- Trazaloop · 0175 · El ciclo completo: quien no puede pagar, quien se va, y
--                    quien no sabemos si pagó
-- ===========================================================================
--
-- 0174 dejó el cobro automático de pie, pero solo sabía tres cosas: renovar,
-- reintentar y dejar caer. La vida de una suscripción tiene más estados, y dos
-- de los que faltaban son justo los que peor terminan si nadie los modela.
--
-- 1 · SIN TARJETA NO SE DESAPARECE
--
-- Antes, una empresa sin medio de pago utilizable salía de la cola entera: no
-- se le cobraba —correcto— pero tampoco se la veía, y al agotarse la gracia no
-- caía nunca. Se quedaba pagando Free y disfrutando Full para siempre, sin que
-- nada lo dijera. No poder cobrar impide COBRAR; no impide que el derecho
-- termine.
--
-- 2 · Y SI NO SABEMOS SI SE COBRÓ, NO SE TOCA NADA
--
-- `provider_unknown` es el estado más delicado del sistema: la petición salió,
-- puede haberse cobrado, y no hay respuesta ni webhook. Ahí no vale ninguna de
-- las dos salidas fáciles. Cobrar otra vez puede cobrar dos veces. Dejar caer
-- puede quitarle el servicio a alguien que YA PAGÓ.
--
-- Así que se para todo y lo mira una persona. El derecho pagado sigue en pie
-- mientras tanto, porque de las dos equivocaciones posibles, esa es la que no
-- le hace daño a nadie. Y bloquea incluso pasada la gracia: el reloj no
-- resuelve una duda sobre dinero.
--
-- 3 · IRSE NO ES CADUCAR
--
-- Cancelar es una decisión de quien paga y llega al final de su mes pagado, sin
-- deuda y sin drama. Caducar es lo que pasa cuando el cobro no entra. Las dos
-- acaban en Free —cerrando lo vendido, nunca concediendo un Free nuevo— pero no
-- son la misma noticia, no se cuentan igual y no se llaman igual.
--
-- 4 · BAJAR DE PLAN CONGELA SU PRECIO AL PROGRAMARSE
--
-- 0169 dejó `scheduled_plan_revision_id` y `scheduled_effective_at` para esto,
-- y son suficientes para saber A QUÉ se baja. Pero no para saber CUÁNTO se
-- cobrará: el precio en pesos de una suscripción se congela al contratar, con
-- su tipo de cambio, y una bajada necesita lo mismo. Sin ese dato, el límite
-- del periodo tendría que consultar el cambio del día, y el importe de un
-- cliente dependería de cuándo corriera un proceso.
--
-- Aquí se añade lo que faltaba, con la MISMA regla de siempre: se congela
-- cuando se decide, no cuando se aplica. Y o están los dos datos o no está
-- ninguno: una bajada sin precio no se aplica sola, va a revisión.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0 · PREFLIGHT DE SEGURIDAD · heredado de SEC-01 (0165)
-- ---------------------------------------------------------------------------
do $$
declare v_expuestas text;
begin
  select string_agg(n.nspname || '.' || c.relname, ', ' order by c.relname)
    into v_expuestas
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_expuestas is not null then
    raise exception 'SEC01_RLS_PREFLIGHT: hay tablas de public sin RLS: %', v_expuestas
      using hint = 'Actívales RLS con una política explícita antes de promover.';
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.billing_due_renewals(timestamptz, integer)') is null
     or to_regprocedure('public.billing_lapse_subscription(uuid)') is null then
    raise exception '0175 presupone 0174';
  end if;
  raise notice '0175 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · IRSE TIENE SU PROPIO ESTADO
-- ---------------------------------------------------------------------------
alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_status_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_status_check
  check (status in ('pending', 'active', 'past_due', 'cancel_at_period_end',
                    'cancelled', 'lapsed', 'ended', 'manual_review'));

comment on column public.billing_subscriptions.status is
  'PE-05B5C · pending, active, past_due (deuda dentro de la gracia o en revision), cancel_at_period_end (avisada), cancelled (se fue al acabar su mes pagado), lapsed (se agoto la gracia sin cobrar), ended y manual_review. Irse y caducar acaban los dos en Free, pero no son la misma noticia y no comparten estado.';

-- ---------------------------------------------------------------------------
-- 2 · EL PRECIO DE LA BAJADA, CONGELADO AL PROGRAMARLA
-- ---------------------------------------------------------------------------
alter table public.billing_subscriptions
  add column if not exists scheduled_base_charge_amount bigint;
alter table public.billing_subscriptions
  add column if not exists scheduled_charge_currency text;
alter table public.billing_subscriptions
  add column if not exists scheduled_fx_rate_id uuid references public.commercial_fx_rates (id);
alter table public.billing_subscriptions
  add column if not exists scheduled_fx_rate_micros bigint;

-- O la transición está COMPLETA o no está. Media transición programada es una
-- trampa esperando al día del cambio.
alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_scheduled_shape;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_scheduled_shape check (
    (scheduled_plan_revision_id is null
     and scheduled_effective_at is null
     and scheduled_base_charge_amount is null
     and scheduled_charge_currency is null)
    or
    (scheduled_plan_revision_id is not null
     and scheduled_effective_at is not null
     and scheduled_base_charge_amount is not null
     and scheduled_base_charge_amount > 0
     and scheduled_charge_currency is not null));

comment on column public.billing_subscriptions.scheduled_base_charge_amount is
  'PE-05B5C · Lo que costara el plan nuevo, en pesos, CONGELADO cuando se programo la bajada. Misma regla que al contratar: el precio se fija cuando se decide, no cuando se aplica, para que no dependa del cambio del dia en que corra un proceso.';

-- ---------------------------------------------------------------------------
-- 3 · ¿HAY UN COBRO DEL QUE NO SABEMOS NADA?
-- ---------------------------------------------------------------------------
-- Un intento que SALIÓ hacia el proveedor, sin respuesta y sin conciliar. No es
-- «falló»: es «no se sabe», y esa diferencia decide si se puede tocar el
-- derecho de alguien.
create or replace function public.billing_has_unresolved_charge(p_subscription_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.billing_checkout_intents i
     where i.billing_subscription_id = p_subscription_id
       and i.failure_class = 'provider_unknown'
       and i.provider_submitted_at is not null
       and i.status in ('created', 'provider_created', 'authorized')
  );
$$;

revoke all on function public.billing_has_unresolved_charge(uuid) from public, anon;
grant execute on function public.billing_has_unresolved_charge(uuid)
  to authenticated, service_role;

comment on function public.billing_has_unresolved_charge(uuid) is
  'PE-05B5C · Si hay un cobro que SALIO y del que no se sabe el desenlace. Mientras lo haya no se cobra otra vez —podria cobrarse dos— ni se deja caer —podria haberse pagado ya—. El reloj no resuelve una duda sobre dinero.';

-- ---------------------------------------------------------------------------
-- 4 · CADUCAR, CON UNA PUERTA MÁS
-- ---------------------------------------------------------------------------
create or replace function public.billing_lapse_subscription(p_subscription_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_sub    public.billing_subscriptions%rowtype;
  v_ultimo public.billing_subscription_periods%rowtype;
  v_cerradas integer;
begin
  select * into v_sub from public.billing_subscriptions
   where id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;
  if v_sub.status in ('lapsed', 'cancelled') then
    return jsonb_build_object('status', 'already_' || v_sub.status,
      'subscription_id', v_sub.id);
  end if;
  if v_sub.status not in ('active', 'past_due', 'cancel_at_period_end') then
    return jsonb_build_object('status', 'subscription_not_live', 'reason', v_sub.status);
  end if;

  -- LA PUERTA NUEVA. Quitarle el servicio a quien quizá pagó es peor que
  -- dejárselo un rato de más a quien quizá no.
  if public.billing_has_unresolved_charge(p_subscription_id) then
    return jsonb_build_object('status', 'blocked',
      'reason', 'UNRESOLVED_PROVIDER_CHARGE', 'subscription_id', v_sub.id);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('billing:' || v_sub.organization_id::text, 0));

  select * into v_ultimo from public.billing_subscription_periods
   where subscription_id = p_subscription_id
   order by period_sequence desc limit 1;
  if not found then
    return jsonb_build_object('status', 'anchor_missing');
  end if;
  if v_ultimo.status <> 'open' then
    return jsonb_build_object('status', 'not_due', 'reason', 'LAST_PERIOD_SETTLED',
      'period_id', v_ultimo.id);
  end if;
  if now() <= public.billing_renewal_grace_end(v_ultimo.period_end) then
    return jsonb_build_object('status', 'not_due', 'reason', 'WITHIN_GRACE',
      'grace_end', public.billing_renewal_grace_end(v_ultimo.period_end));
  end if;

  v_cerradas := public.commercial_end_paid_assignments(
    v_sub.organization_id, now(),
    'Caducó la gracia de 7 días sin cobrar el periodo '
      || v_ultimo.period_sequence || '.');

  update public.billing_subscriptions
     set status = 'lapsed', ended_at = now(), grace_until = null, updated_at = now()
   where id = v_sub.id;

  return jsonb_build_object('status', 'lapsed', 'subscription_id', v_sub.id,
    'organization_id', v_sub.organization_id,
    'unpaid_period_id', v_ultimo.id, 'unpaid_period_sequence', v_ultimo.period_sequence,
    'closed_assignments', v_cerradas);
end;
$$;

revoke all on function public.billing_lapse_subscription(uuid) from public, anon, authenticated;
grant execute on function public.billing_lapse_subscription(uuid) to service_role;

comment on function public.billing_lapse_subscription(uuid) is
  'PE-05B5C · Deja caer una suscripcion cuya obligacion abierta agoto los 7 dias de gracia. Se NIEGA si hay un cobro sin desenlace: quitarle el servicio a quien quiza pago es peor que dejarselo de mas a quien quiza no. Cierra lo vendido y no concede Free, que ya esta debajo.';

-- ---------------------------------------------------------------------------
-- 5 · IRSE AL FINAL DEL MES PAGADO
-- ---------------------------------------------------------------------------
create or replace function public.billing_cancel_at_period_end(p_subscription_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_sub    public.billing_subscriptions%rowtype;
  v_ultimo public.billing_subscription_periods%rowtype;
  v_cerradas integer;
begin
  select * into v_sub from public.billing_subscriptions
   where id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;
  if v_sub.status = 'cancelled' then
    return jsonb_build_object('status', 'already_cancelled', 'subscription_id', v_sub.id);
  end if;
  if not v_sub.cancel_at_period_end then
    return jsonb_build_object('status', 'not_scheduled');
  end if;
  if v_sub.status not in ('active', 'past_due', 'cancel_at_period_end') then
    return jsonb_build_object('status', 'subscription_not_live', 'reason', v_sub.status);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('billing:' || v_sub.organization_id::text, 0));

  select * into v_ultimo from public.billing_subscription_periods
   where subscription_id = p_subscription_id
   order by period_sequence desc limit 1;
  if not found then
    return jsonb_build_object('status', 'anchor_missing');
  end if;

  -- NO SE ACORTA LO PAGADO. Quien canceló el día 2 tiene derecho hasta el 30:
  -- la cancelación se ejecuta cuando su mes termina, ni un minuto antes.
  if v_ultimo.status <> 'settled' then
    return jsonb_build_object('status', 'not_due', 'reason', 'LAST_PERIOD_UNPAID',
      'period_id', v_ultimo.id);
  end if;
  if now() < v_ultimo.period_end then
    return jsonb_build_object('status', 'not_due', 'reason', 'PERIOD_STILL_RUNNING',
      'period_end', v_ultimo.period_end);
  end if;

  v_cerradas := public.commercial_end_paid_assignments(
    v_sub.organization_id, now(),
    'La empresa canceló y su periodo pagado terminó el '
      || to_char(v_ultimo.period_end, 'YYYY-MM-DD') || '.');

  update public.billing_subscriptions
     set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()),
         ended_at = now(), grace_until = null, updated_at = now()
   where id = v_sub.id;

  return jsonb_build_object('status', 'cancelled', 'subscription_id', v_sub.id,
    'organization_id', v_sub.organization_id,
    'last_paid_period_id', v_ultimo.id, 'closed_assignments', v_cerradas);
end;
$$;

revoke all on function public.billing_cancel_at_period_end(uuid) from public, anon, authenticated;
grant execute on function public.billing_cancel_at_period_end(uuid) to service_role;

comment on function public.billing_cancel_at_period_end(uuid) is
  'PE-05B5C · Ejecuta una cancelacion CUANDO el mes pagado termina, no cuando se pidio. Cierra lo vendido y no concede Free. No borra datos, ni historial, ni el medio de pago, ni apaga modulos. Estado `cancelled`, distinto de `lapsed`.';

-- ---------------------------------------------------------------------------
-- 6 · BAJAR DE PLAN AL FINAL DEL MES PAGADO
-- ---------------------------------------------------------------------------
create or replace function public.billing_apply_scheduled_change(p_subscription_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_sub    public.billing_subscriptions%rowtype;
  v_ultimo public.billing_subscription_periods%rowtype;
  v_rev    record;
  v_mod    record;
  v_aplicados integer := 0;
begin
  select * into v_sub from public.billing_subscriptions
   where id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;
  if v_sub.scheduled_plan_revision_id is null then
    return jsonb_build_object('status', 'not_scheduled');
  end if;
  if v_sub.status not in ('active', 'past_due') then
    return jsonb_build_object('status', 'subscription_not_live', 'reason', v_sub.status);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('billing:' || v_sub.organization_id::text, 0));

  select * into v_ultimo from public.billing_subscription_periods
   where subscription_id = p_subscription_id
   order by period_sequence desc limit 1;
  if not found then
    return jsonb_build_object('status', 'anchor_missing');
  end if;
  -- Lo pagado se respeta entero, igual que en la cancelación.
  if v_ultimo.status <> 'settled' then
    return jsonb_build_object('status', 'not_due', 'reason', 'LAST_PERIOD_UNPAID');
  end if;
  if now() < greatest(v_ultimo.period_end, v_sub.scheduled_effective_at) then
    return jsonb_build_object('status', 'not_due', 'reason', 'NOT_YET_EFFECTIVE',
      'effective_at', greatest(v_ultimo.period_end, v_sub.scheduled_effective_at));
  end if;

  select r.id, r.plan_code, r.status into v_rev
    from public.plan_revisions r where r.id = v_sub.scheduled_plan_revision_id;
  if v_rev.id is null or v_rev.status <> 'published' then
    return jsonb_build_object('status', 'blocked', 'reason', 'TARGET_REVISION_NOT_PUBLISHED');
  end if;
  -- Free no se «contrata»: es el suelo permanente. Programar una bajada a Free
  -- es cancelar, y se hace por el camino de cancelar.
  if v_rev.plan_code = 'free' then
    return jsonb_build_object('status', 'blocked', 'reason', 'FREE_IS_A_CANCELLATION');
  end if;

  -- El nivel nuevo se aplica por la primitiva de siempre, que CIERRA la
  -- anterior y abre la nueva. Ni una asignación duplicada, ni un paso
  -- intermedio por Free.
  for v_mod in
    select om.module_code from public.organization_modules om
      join public.modules m on m.code = om.module_code
     where om.organization_id = v_sub.organization_id
       and om.enabled and coalesce(m.is_functional, false)
  loop
    perform public.commercial_apply_assignment(
      v_sub.organization_id, v_sub.scheduled_plan_revision_id, 'module', v_mod.module_code,
      'sold', 'checkout', now(), null,
      'Cambio de plan programado a ' || v_rev.plan_code
        || ' al terminar el periodo pagado.', null);
    v_aplicados := v_aplicados + 1;
  end loop;

  -- Y la suscripción pasa a cobrar lo que se congeló al programarla. El tipo de
  -- cambio no se consulta aquí: si se consultara, el importe del cliente
  -- dependería del día en que corriera este proceso.
  update public.billing_subscriptions
     set plan_code = v_rev.plan_code,
         plan_revision_id = v_sub.scheduled_plan_revision_id,
         base_charge_amount = v_sub.scheduled_base_charge_amount,
         charge_currency = v_sub.scheduled_charge_currency,
         fx_rate_id = v_sub.scheduled_fx_rate_id,
         fx_rate_micros = v_sub.scheduled_fx_rate_micros,
         scheduled_plan_revision_id = null, scheduled_effective_at = null,
         scheduled_base_charge_amount = null, scheduled_charge_currency = null,
         scheduled_fx_rate_id = null, scheduled_fx_rate_micros = null,
         updated_at = now()
   where id = v_sub.id;

  return jsonb_build_object('status', 'applied', 'subscription_id', v_sub.id,
    'organization_id', v_sub.organization_id, 'plan_code', v_rev.plan_code,
    'modules_applied', v_aplicados,
    'base_charge_amount', v_sub.scheduled_base_charge_amount);
end;
$$;

revoke all on function public.billing_apply_scheduled_change(uuid) from public, anon, authenticated;
grant execute on function public.billing_apply_scheduled_change(uuid) to service_role;

comment on function public.billing_apply_scheduled_change(uuid) is
  'PE-05B5C · Aplica el cambio de plan programado CUANDO termina el mes pagado. Usa la primitiva comercial de siempre, que cierra el nivel anterior y abre el nuevo: sin duplicados y sin pasar por Free. El importe es el que se congelo al programar el cambio; aqui no se consulta el tipo de cambio.';

-- ---------------------------------------------------------------------------
-- 7 · QUÉ LE TOCA A CADA UNA · con la precedencia ESCRITA
-- ---------------------------------------------------------------------------
-- El orden no puede depender de cómo caigan las ramas de un `case`. Aquí está
-- numerado, y una prueba lo comprueba caso por caso:
--
--   1. nada que hacer                     (no sale en la lista)
--   2. se va, o baja de plan              cancel_due · downgrade_due
--   3. hay un cobro sin desenlace         manual_review_required
--   4. se agotó la gracia                 lapse_due
--   5. no hay tarjeta utilizable          payment_method_unavailable
--   6. hay un cobro en vuelo              (no sale: se espera)
--   7. toca reintentar                    retry
--   8. toca renovar                       renew
--
-- Los dos cruces que importan: la caducidad manda sobre «no hay tarjeta»
-- —quedarse sin medio de pago no es un salvoconducto perpetuo—, y el cobro sin
-- desenlace manda sobre la caducidad —el reloj no resuelve una duda sobre
-- dinero—.
create or replace function public.billing_due_renewals(
  p_now timestamptz default now(),
  p_limit integer default 100
)
returns table (
  action            text,
  subscription_id   uuid,
  organization_id   uuid,
  period_id         uuid,
  period_sequence   integer,
  due_at            timestamptz,
  grace_end         timestamptz,
  attempt_number    integer,
  slot              integer,
  payment_method_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ultimo as (
    select distinct on (p.subscription_id)
           p.subscription_id, p.id as period_id, p.period_sequence,
           p.period_start, p.period_end, p.status
      from public.billing_subscription_periods p
     order by p.subscription_id, p.period_sequence desc
  ),
  viva as (
    select s.id, s.organization_id, s.status, s.provider, s.cancel_at_period_end,
           s.scheduled_plan_revision_id, s.scheduled_effective_at,
           u.period_id, u.period_sequence, u.period_end,
           u.status as period_status, u.period_end as due_at,
           public.billing_has_unresolved_charge(s.id) as en_duda
      from public.billing_subscriptions s
      join ultimo u on u.subscription_id = s.id
     where s.status in ('active', 'past_due')
       and s.plan_code in ('full', 'extra')
  ),
  medio as (
    select distinct on (m.organization_id, m.provider)
           m.organization_id, m.provider, m.id as payment_method_id
      from public.billing_payment_methods m
     where m.status = 'active'
     order by m.organization_id, m.provider, m.created_at desc
  ),
  en_vuelo as (
    select i.period_id from public.billing_checkout_intents i
     where i.period_id is not null
       and i.status in ('created', 'provider_created', 'authorized')
  ),
  gastados as (
    select i.period_id,
           count(*)::int as intentos,
           max(public.billing_renewal_slot_at(u.period_end, i.created_at)) as ultimo_hueco
      from public.billing_checkout_intents i
      join public.billing_subscription_periods p on p.id = i.period_id
      join ultimo u on u.period_id = p.id
     where i.period_id is not null
     group by i.period_id
  ),
  decidido as (
    select v.*, md.payment_method_id, g.intentos, g.ultimo_hueco,
           (f.period_id is not null) as hay_en_vuelo,
           case
             -- 2 · Se va o cambia de plan, al terminar lo pagado.
             when v.period_status = 'settled' and p_now >= v.period_end
                  and v.cancel_at_period_end then 'cancel_due'
             when v.period_status = 'settled' and p_now >= v.period_end
                  and v.scheduled_plan_revision_id is not null
                  and p_now >= v.scheduled_effective_at then 'downgrade_due'
             -- 3 · No se sabe si se cobró: se para todo.
             when v.en_duda then 'manual_review_required'
             -- 4 · Se agotó la gracia. Sin tarjeta también se cae.
             when v.period_status = 'open'
                  and p_now > public.billing_renewal_grace_end(v.period_end) then 'lapse_due'
             -- 5 · No hay con qué cobrar, pero sigue a la vista.
             when md.payment_method_id is null then 'payment_method_unavailable'
             -- 6 · Hay un cobro en el aire: se espera.
             when f.period_id is not null then 'in_flight'
             -- 7 y 8 · Reintentar o renovar, si hay hueco.
             when public.billing_renewal_slot_at(v.due_at, p_now) >= 0
                  and public.billing_renewal_slot_at(v.due_at, p_now)
                      > coalesce(g.ultimo_hueco, -1)
                  and coalesce(g.intentos, 0) < 4
               then case when v.period_status = 'open' then 'retry' else 'renew' end
             else 'nothing'
           end as accion
      from viva v
      left join gastados g on g.period_id = v.period_id
      left join en_vuelo f on f.period_id = v.period_id
      left join medio md on md.organization_id = v.organization_id
                        and md.provider = v.provider
     where p_now >= v.due_at
  )
  select d.accion,
         d.id, d.organization_id,
         case when d.period_status = 'open' then d.period_id end,
         d.period_sequence, d.due_at,
         public.billing_renewal_grace_end(d.due_at),
         coalesce(d.intentos, 0) + 1,
         public.billing_renewal_slot_at(d.due_at, p_now),
         d.payment_method_id
    from decidido d
   -- «en vuelo» y «nada» no son trabajo: se calculan para que la precedencia
   -- sea explícita, y se dejan fuera de la cola.
   where d.accion not in ('in_flight', 'nothing')
   order by d.due_at
   limit greatest(p_limit, 0);
$$;

revoke all on function public.billing_due_renewals(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.billing_due_renewals(timestamptz, integer) to service_role;

comment on function public.billing_due_renewals(timestamptz, integer) is
  'PE-05B5C · Que le toca a cada suscripcion, con la precedencia escrita y no heredada del orden de las ramas: irse o cambiar de plan, cobro sin desenlace, caducidad, falta de tarjeta, espera, reintento y renovacion. Quedarse sin medio de pago NO impide caducar; un cobro sin desenlace SI lo impide.';
