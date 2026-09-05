-- ===========================================================================
-- Trazaloop · PE-05B6E · Subir de plan hoy, bajar sin perder nada
-- ===========================================================================
--
-- LA POLÍTICA DEJA DE SER SIMÉTRICA, Y ESO ES LO QUE HAY QUE MODELAR
--
-- Hasta 0178 todo cambio de plan esperaba al final del periodo pagado. Esa
-- simplificación se rompe en un caso concreto y muy real: una empresa con plan
-- anual, a 499 MiB de su límite de 500, que necesita espacio HOY. Decirle que
-- espere siete meses porque su aniversario cae en enero no es prudencia
-- financiera: es dejarla sin trabajar.
--
-- Así que a partir de aquí:
--
--   SUBIR   (Full → Extra)  puede ser INMEDIATO, pagando la diferencia.
--   BAJAR   (Extra → Full)  sigue esperando al final del periodo pagado.
--   CAMBIAR de periodicidad sigue esperando al final del periodo pagado.
--
-- Lo asimétrico no es un descuido: subir amplía capacidad y el cliente lo pide;
-- bajar reduce algo que ya pagó, y quitárselo antes de tiempo sería quedarse
-- con su dinero.
--
-- POR QUÉ UNA TABLA NUEVA Y NO UN PERIODO MÁS
--
-- La tentación es registrar la subida como «otro cobro del mismo periodo». No
-- se hace, y por tres razones:
--
--   1. `billing_subscription_periods.base_amount` es la base RECURRENTE de una
--      obligación. La diferencia de una subida no es una base recurrente: es un
--      ajuste que ocurre una vez.
--   2. Un periodo tiene un solo pago que lo salda. Meter ahí la subida obligaría
--      a que un periodo tuviera dos, y entonces «¿está saldado?» deja de tener
--      respuesta.
--   3. La historia tiene que poder decir: «compró Full, a mitad de camino subió
--      a Extra pagando X, y desde el aniversario paga Extra entero». Un segundo
--      periodo no cuenta esa historia; la borra.
--
-- EL ANCLA NO SE MUEVE
--
-- Subir de plan NO reinicia el calendario. Quien compró un año en enero sigue
-- renovando en enero, aunque suba en junio. Si la subida abriera un periodo
-- nuevo de doce meses, el cliente pagaría dos veces por los mismos meses.
--
-- Y CAMBIAR DE PERIODICIDAD OBLIGA A RE-ANCLAR
--
-- Los límites de un periodo salen de «ancla + (secuencia − 1) × intervalo», en
-- un solo salto. Si el intervalo cambia a mitad de vida, esa cuenta deja de
-- valer: el periodo 4 de una suscripción que fue mensual tres meses y ahora es
-- anual NO es «ancla + 3 años». Por eso la suscripción pasa a llevar su ancla
-- explícita y la secuencia en la que empezó a valer. Dentro de cada era la
-- invariante sigue intacta —un solo salto desde el ancla, nunca sumas
-- repetidas—, y el cambio de era ocurre exactamente en el borde pagado.
-- ===========================================================================

do $$
begin
  if to_regprocedure('public.billing_schedule_plan_change(uuid,text)') is null
     or to_regprocedure('public.billing_apply_scheduled_change(uuid)') is null
     or to_regprocedure('public.billing_open_next_period(uuid)') is null
     or to_regprocedure('public.billing_period_bounds(timestamptz,text,integer)') is null then
    raise exception '0181 presupone 0172, 0174, 0175 y 0178';
  end if;
  raise notice '0181 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · EL ANCLA, EXPLÍCITA
-- ---------------------------------------------------------------------------
alter table public.billing_subscriptions
  add column if not exists period_anchor_at timestamptz;
alter table public.billing_subscriptions
  add column if not exists period_anchor_sequence integer;

-- Relleno: hasta hoy el ancla era, siempre, el comienzo del periodo 1.
update public.billing_subscriptions s
   set period_anchor_at = p.period_start,
       period_anchor_sequence = 1
  from public.billing_subscription_periods p
 where p.subscription_id = s.id and p.period_sequence = 1
   and s.period_anchor_at is null;

alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_anchor_shape;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_anchor_shape check (
    (period_anchor_at is null and period_anchor_sequence is null)
    or (period_anchor_at is not null and period_anchor_sequence >= 1));

comment on column public.billing_subscriptions.period_anchor_at is
  'PE-05B6E · Desde donde se cuentan los periodos de la periodicidad ACTUAL. Cambiar de mensual a anual abre una era nueva y vuelve a anclar aqui, en el borde ya pagado; dentro de cada era el periodo N sigue siendo ancla + (N-1) x intervalo en un solo salto.';
comment on column public.billing_subscriptions.period_anchor_sequence is
  'PE-05B6E · La secuencia en la que empezo la era actual. El periodo N se calcula con (N - esta secuencia + 1) para que cambiar de periodicidad no reinterprete la historia anterior.';

-- ---------------------------------------------------------------------------
-- 2 · LOS LÍMITES DEL PERIODO SIGUIENTE, CON SU ERA
-- ---------------------------------------------------------------------------
create or replace function public.billing_next_period_bounds(p_subscription_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_sub    public.billing_subscriptions%rowtype;
  v_ultimo public.billing_subscription_periods%rowtype;
  v_ancla  timestamptz;
  v_base   integer;
begin
  select * into v_sub from public.billing_subscriptions where id = p_subscription_id;
  if not found then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;
  select * into v_ultimo from public.billing_subscription_periods
   where subscription_id = p_subscription_id
   order by period_sequence desc limit 1;
  if not found then
    return jsonb_build_object('status', 'anchor_missing');
  end if;

  -- Sin era declarada se cae a la de siempre: el periodo 1. Ninguna suscripción
  -- viva deberia estar asi tras el relleno, pero inventarse un ancla seria peor
  -- que decir que no se sabe.
  v_ancla := v_sub.period_anchor_at;
  v_base  := v_sub.period_anchor_sequence;
  if v_ancla is null or v_base is null then
    select period_start into v_ancla from public.billing_subscription_periods
     where subscription_id = p_subscription_id and period_sequence = 1;
    v_base := 1;
    if v_ancla is null then
      return jsonb_build_object('status', 'anchor_missing');
    end if;
  end if;

  return public.billing_period_bounds(v_ancla, v_sub.billing_interval,
                                      v_ultimo.period_sequence + 1 - v_base + 1)
    || jsonb_build_object('status', 'found',
         'period_sequence', v_ultimo.period_sequence + 1);
end;
$$;

revoke all on function public.billing_next_period_bounds(uuid) from public, anon;
grant execute on function public.billing_next_period_bounds(uuid) to service_role;

comment on function public.billing_next_period_bounds(uuid) is
  'PE-05B6E · Los limites del periodo siguiente, contados desde el ancla de la periodicidad ACTUAL. Una sola verdad para renovar y para prever.';

-- ---------------------------------------------------------------------------
-- 3 · ABRIR EL PERIODO SIGUIENTE, YA CON ERAS
-- ---------------------------------------------------------------------------
-- Idéntica a la de 0177 salvo en una línea: los límites salen de la era actual
-- y no del periodo 1. Sin esto, la primera renovación después de un cambio de
-- periodicidad calcularía «ancla + 3 años» para un cuarto periodo que en
-- realidad es el primero de su era.
create or replace function public.billing_open_next_period(p_subscription_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_sub    public.billing_subscriptions%rowtype;
  v_ultimo public.billing_subscription_periods%rowtype;
  v_lim    jsonb;
  v_id     uuid;
begin
  select * into v_sub from public.billing_subscriptions
   where id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;
  -- Una retirada administrativa tampoco resucita. Es de 0176 y sigue viva.
  if v_sub.status = 'retired' then
    return jsonb_build_object('status', 'retired',
      'reason', 'RETIRED_SUBSCRIPTION_DOES_NOT_RESUME');
  end if;
  -- Una suscripción que YA caducó no vuelve sola. Volver de Free es contratar,
  -- y eso es una decisión comercial con su propio camino. Esta rama es de 0174
  -- y sigue viva: se dice aquí, con su motivo, y no bajo el «no está viva»
  -- genérico, porque no es lo mismo estar en revisión que haber caducado.
  if v_sub.status = 'lapsed' then
    return jsonb_build_object('status', 'lapsed',
      'reason', 'REACTIVATION_REQUIRES_NEW_PURCHASE');
  end if;
  if v_sub.status not in ('active', 'past_due', 'cancel_at_period_end') then
    return jsonb_build_object('status', 'subscription_not_live', 'reason', v_sub.status);
  end if;

  select * into v_ultimo from public.billing_subscription_periods
   where subscription_id = p_subscription_id
   order by period_sequence desc limit 1;
  if not found then
    return jsonb_build_object('status', 'anchor_missing');
  end if;

  if v_ultimo.status = 'open' then
    if now() > public.billing_renewal_grace_end(v_ultimo.period_end) then
      return jsonb_build_object('status', 'lapse_due', 'reason', 'GRACE_EXPIRED',
        'period_id', v_ultimo.id, 'period_sequence', v_ultimo.period_sequence,
        'period_end', v_ultimo.period_end,
        'grace_end', public.billing_renewal_grace_end(v_ultimo.period_end));
    end if;
    return jsonb_build_object('status', 'open', 'period_id', v_ultimo.id,
      'period_sequence', v_ultimo.period_sequence, 'reused', true,
      'period_start', v_ultimo.period_start, 'period_end', v_ultimo.period_end,
      'base_amount', v_ultimo.base_amount, 'charge_currency', v_ultimo.charge_currency,
      'grace_end', public.billing_renewal_grace_end(v_ultimo.period_end));
  end if;

  v_lim := public.billing_next_period_bounds(p_subscription_id);
  if v_lim->>'status' <> 'found' then
    return jsonb_build_object('status', coalesce(v_lim->>'status', 'anchor_missing'));
  end if;

  insert into public.billing_subscription_periods (
    subscription_id, organization_id, period_sequence,
    period_start, period_end, base_amount, charge_currency)
  values (
    p_subscription_id, v_sub.organization_id, v_ultimo.period_sequence + 1,
    (v_lim->>'period_start')::timestamptz, (v_lim->>'period_end')::timestamptz,
    v_sub.base_charge_amount, v_sub.charge_currency)
  on conflict (subscription_id, period_sequence) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.billing_subscription_periods
     where subscription_id = p_subscription_id
       and period_sequence = v_ultimo.period_sequence + 1;
    return jsonb_build_object('status', 'open', 'period_id', v_id,
      'period_sequence', v_ultimo.period_sequence + 1, 'reused', true,
      'period_start', v_lim->>'period_start', 'period_end', v_lim->>'period_end',
      'base_amount', v_sub.base_charge_amount, 'charge_currency', v_sub.charge_currency,
      'grace_end', public.billing_renewal_grace_end((v_lim->>'period_start')::timestamptz));
  end if;

  return jsonb_build_object('status', 'open', 'period_id', v_id,
    'period_sequence', v_ultimo.period_sequence + 1, 'reused', false,
    'period_start', v_lim->>'period_start', 'period_end', v_lim->>'period_end',
    'base_amount', v_sub.base_charge_amount, 'charge_currency', v_sub.charge_currency,
    'grace_end', public.billing_renewal_grace_end((v_lim->>'period_start')::timestamptz));
end;
$$;

comment on function public.billing_open_next_period(uuid) is
  'PE-05B6E · Abre la obligacion siguiente con el calendario de la era ACTUAL. Mantiene las reglas de 0174/0177: dentro de la gracia se reutiliza la obligacion abierta, pasada la gracia se dice lapse_due, y un cliente al dia que llega a su borde renueva.';

-- ---------------------------------------------------------------------------
-- 4 · LA PERIODICIDAD TAMBIÉN SE PUEDE PROGRAMAR
-- ---------------------------------------------------------------------------
alter table public.billing_subscriptions
  add column if not exists scheduled_billing_interval text;

alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_scheduled_interval_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_scheduled_interval_check check (
    scheduled_billing_interval is null
    or scheduled_billing_interval in ('monthly', 'annual'));

-- La periodicidad programada solo tiene sentido dentro de una transicion
-- programada completa. Media transicion vuelve a ser una trampa esperando al
-- dia del cambio.
alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_scheduled_interval_shape;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_scheduled_interval_shape check (
    scheduled_billing_interval is null or scheduled_plan_revision_id is not null);

comment on column public.billing_subscriptions.scheduled_billing_interval is
  'PE-05B6E · La periodicidad que empezara a valer en el borde pagado. Nula significa «la misma». Cambiar de periodicidad NUNCA acorta un periodo ya pagado.';

-- ---------------------------------------------------------------------------
-- 5 · PROGRAMAR UNA TRANSICIÓN: PLAN, PERIODICIDAD, O LAS DOS
-- ---------------------------------------------------------------------------
-- Una sola primitiva. `billing_schedule_plan_change` sigue existiendo con su
-- firma de siempre y delega aquí: no hay dos motores, hay uno con dos puertas.
create or replace function public.billing_schedule_transition(
  p_subscription_id uuid,
  p_target_plan_code text default null,
  p_target_billing_interval text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_sub  public.billing_subscriptions%rowtype;
  v_plan text;
  v_int  text;
  v_rev  record;
  v_fx   jsonb;
  v_cat  bigint;
  v_base bigint;
  v_fin  timestamptz;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_sub from public.billing_subscriptions
   where id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;
  if not public.has_org_role(v_sub.organization_id, array['admin']) then
    raise exception 'NOT_AUTHORIZED'
      using hint = 'Solo quien administra la empresa puede cambiar el plan.';
  end if;
  if v_sub.status not in ('active', 'past_due') then
    return jsonb_build_object('status', 'not_changeable', 'reason', v_sub.status);
  end if;

  v_plan := coalesce(p_target_plan_code, v_sub.plan_code);
  v_int  := coalesce(p_target_billing_interval, v_sub.billing_interval);

  if v_plan not in ('full', 'extra') then
    raise exception 'PLAN_NOT_PURCHASABLE' using detail = coalesce(v_plan, 'null'),
      hint = 'Volver a Free es cancelar, no cambiar de plan.';
  end if;
  if v_int not in ('monthly', 'annual') then
    raise exception 'BILLING_INTERVAL_INVALID' using detail = coalesce(v_int, 'null');
  end if;
  if v_plan = v_sub.plan_code and v_int = v_sub.billing_interval then
    return jsonb_build_object('status', 'already_on_plan',
      'plan_code', v_sub.plan_code, 'billing_interval', v_sub.billing_interval);
  end if;

  -- Una sola transicion pendiente. Dos programadas a la vez son dos futuros
  -- contradictorios, y el dia del borde alguien tendria que elegir.
  if v_sub.scheduled_plan_revision_id is not null then
    return jsonb_build_object('status', 'change_already_scheduled',
      'effective_at', v_sub.scheduled_effective_at);
  end if;

  select r.id, r.plan_code, r.currency, r.price_state,
         r.monthly_price_minor, r.annual_price_minor
    into v_rev
    from public.plan_revisions r
   where r.plan_code = v_plan and r.status = 'published' and r.effective_to is null;
  if v_rev.id is null then
    raise exception 'PLAN_REVISION_NOT_PUBLISHED' using detail = v_plan;
  end if;
  if v_rev.price_state <> 'configured' then
    raise exception 'PLAN_PRICE_NOT_CONFIGURED' using detail = v_plan;
  end if;

  -- El precio del intervalo DESTINO. Un anual jamas se reconstruye como doce
  -- mensuales: el catalogo dice cuanto vale un ano, y es otro numero.
  v_cat := case when v_int = 'monthly'
                then v_rev.monthly_price_minor else v_rev.annual_price_minor end;
  if v_cat is null or v_cat <= 0 then
    raise exception 'PLAN_PRICE_NOT_CONFIGURED' using detail = v_int;
  end if;

  v_fx := public.billing_resolve_fx(v_rev.currency, v_sub.charge_currency, now());
  if v_fx->>'status' <> 'found' then
    raise exception 'FX_RATE_UNAVAILABLE'
      using detail = v_rev.currency || '→' || v_sub.charge_currency,
            hint = 'Programar fija un precio nuevo y eso exige tipo de cambio vigente. Renovar no, porque su importe ya estaba congelado.';
  end if;
  v_base := public.billing_usd_minor_to_cop(v_cat, (v_fx->>'rate_micros')::bigint);

  select period_end into v_fin from public.billing_subscription_periods
   where subscription_id = p_subscription_id
   order by period_sequence desc limit 1;
  if v_fin is null then
    return jsonb_build_object('status', 'anchor_missing');
  end if;

  update public.billing_subscriptions
     set scheduled_plan_revision_id = v_rev.id,
         scheduled_effective_at = v_fin,
         scheduled_base_charge_amount = v_base,
         scheduled_charge_currency = v_sub.charge_currency,
         scheduled_fx_rate_id = (v_fx->>'fx_rate_id')::uuid,
         scheduled_fx_rate_micros = (v_fx->>'rate_micros')::bigint,
         scheduled_billing_interval =
           case when v_int = v_sub.billing_interval then null else v_int end,
         updated_at = now()
   where id = v_sub.id;

  return jsonb_build_object('status', 'scheduled', 'subscription_id', v_sub.id,
    'target_plan_code', v_rev.plan_code, 'target_billing_interval', v_int,
    'interval_changes', v_int <> v_sub.billing_interval,
    'effective_at', v_fin,
    'base_charge_amount', v_base, 'charge_currency', v_sub.charge_currency);
end;
$$;

revoke all on function public.billing_schedule_transition(uuid, text, text)
  from public, anon;
grant execute on function public.billing_schedule_transition(uuid, text, text) to authenticated;

comment on function public.billing_schedule_transition(uuid, text, text) is
  'PE-05B6E · Programa un cambio de plan, de periodicidad o de ambos para el final del periodo PAGADO, congelando su precio hoy. Nunca acorta un periodo pagado: un anual pendiente se respeta entero aunque el destino sea mensual. Una sola transicion pendiente por suscripcion. Solo quien administra la empresa.';

-- La puerta de 0178 sigue abierta y hace lo mismo que hacia: cambiar de plan
-- manteniendo la periodicidad.
create or replace function public.billing_schedule_plan_change(
  p_subscription_id uuid,
  p_target_plan_code text
)
returns jsonb
language sql
volatile
security invoker
set search_path to 'public'
as $$
  select public.billing_schedule_transition(p_subscription_id, p_target_plan_code, null);
$$;

comment on function public.billing_schedule_plan_change(uuid, text) is
  'PE-05B6E · Cambio de plan programado, manteniendo la periodicidad. Delega en billing_schedule_transition: un solo motor.';

revoke all on function public.billing_schedule_plan_change(uuid, text) from public, anon;
grant execute on function public.billing_schedule_plan_change(uuid, text) to authenticated;

-- Y arrepentirse limpia TAMBIÉN la periodicidad programada. Dejarla colgando
-- convertiria la proxima transicion en una mezcla de dos decisiones distintas.
create or replace function public.billing_cancel_scheduled_change(p_subscription_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare v_sub public.billing_subscriptions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  select * into v_sub from public.billing_subscriptions
   where id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;
  if not public.has_org_role(v_sub.organization_id, array['admin']) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_sub.scheduled_plan_revision_id is null then
    return jsonb_build_object('status', 'nothing_scheduled');
  end if;

  update public.billing_subscriptions
     set scheduled_plan_revision_id = null, scheduled_effective_at = null,
         scheduled_base_charge_amount = null, scheduled_charge_currency = null,
         scheduled_fx_rate_id = null, scheduled_fx_rate_micros = null,
         scheduled_billing_interval = null,
         updated_at = now()
   where id = v_sub.id;

  return jsonb_build_object('status', 'cleared', 'subscription_id', v_sub.id);
end;
$$;

comment on function public.billing_cancel_scheduled_change(uuid) is
  'PE-05B6E · Retira la transicion programada —plan y periodicidad— mientras no haya llegado su fecha. Solo quien administra la empresa.';

-- ---------------------------------------------------------------------------
-- 6 · APLICARLA EN EL BORDE, RE-ANCLANDO SI CAMBIA LA PERIODICIDAD
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
  v_int    text;
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
  if v_rev.plan_code = 'free' then
    return jsonb_build_object('status', 'blocked', 'reason', 'FREE_IS_A_CANCELLATION');
  end if;

  v_int := coalesce(v_sub.scheduled_billing_interval, v_sub.billing_interval);

  for v_mod in
    select om.module_code from public.organization_modules om
      join public.modules m on m.code = om.module_code
     where om.organization_id = v_sub.organization_id
       and om.enabled and coalesce(m.is_functional, false)
  loop
    perform public.commercial_apply_assignment(
      v_sub.organization_id, v_sub.scheduled_plan_revision_id, 'module', v_mod.module_code,
      'sold', 'checkout', now(), null,
      'Cambio programado a ' || v_rev.plan_code || ' ' || v_int
        || ' al terminar el periodo pagado.', null);
    v_aplicados := v_aplicados + 1;
  end loop;

  update public.billing_subscriptions
     set plan_code = v_rev.plan_code,
         plan_revision_id = v_sub.scheduled_plan_revision_id,
         base_charge_amount = v_sub.scheduled_base_charge_amount,
         charge_currency = v_sub.scheduled_charge_currency,
         fx_rate_id = v_sub.scheduled_fx_rate_id,
         fx_rate_micros = v_sub.scheduled_fx_rate_micros,
         billing_interval = v_int,
         -- LA ERA NUEVA EMPIEZA EN EL BORDE YA PAGADO. Anclar aqui es lo que
         -- impide que el primer periodo anual de quien venia de mensual se
         -- calcule como «ancla original + N anos».
         period_anchor_at = case when v_sub.scheduled_billing_interval is null
                                 then v_sub.period_anchor_at else v_ultimo.period_end end,
         period_anchor_sequence = case when v_sub.scheduled_billing_interval is null
                                       then v_sub.period_anchor_sequence
                                       else v_ultimo.period_sequence + 1 end,
         scheduled_plan_revision_id = null, scheduled_effective_at = null,
         scheduled_base_charge_amount = null, scheduled_charge_currency = null,
         scheduled_fx_rate_id = null, scheduled_fx_rate_micros = null,
         scheduled_billing_interval = null,
         updated_at = now()
   where id = v_sub.id;

  return jsonb_build_object('status', 'applied', 'subscription_id', v_sub.id,
    'organization_id', v_sub.organization_id, 'plan_code', v_rev.plan_code,
    'billing_interval', v_int,
    'interval_changed', v_sub.scheduled_billing_interval is not null,
    'modules_applied', v_aplicados,
    'base_charge_amount', v_sub.scheduled_base_charge_amount);
end;
$$;

comment on function public.billing_apply_scheduled_change(uuid) is
  'PE-05B6E · Aplica en el borde la transicion programada: plan, importe congelado y —si cambia— periodicidad, re-anclando el calendario en el borde ya pagado. Nunca antes de que el periodo pagado termine.';

-- ---------------------------------------------------------------------------
-- 7 · LA SUBIDA INMEDIATA COMO HECHO COMERCIAL PROPIO
-- ---------------------------------------------------------------------------
create table if not exists public.billing_subscription_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  subscription_id uuid not null references public.billing_subscriptions (id) on delete restrict,

  kind text not null,

  from_plan_code text not null,
  from_plan_revision_id uuid not null references public.plan_revisions (id),
  to_plan_code text not null,
  to_plan_revision_id uuid not null references public.plan_revisions (id),
  billing_interval text not null,

  -- CONTRA QUÉ TIEMPO se prorratea. Se copian los tres instantes porque la
  -- cuenta tiene que poder rehacerse dentro de dos anos sin depender de que
  -- nadie haya movido el periodo.
  period_id uuid references public.billing_subscription_periods (id),
  period_start timestamptz not null,
  period_end timestamptz not null,
  effective_at timestamptz not null,
  remaining_seconds bigint not null,
  period_seconds bigint not null,

  -- El valor de periodo COMPLETO de cada lado. El de origen sale de lo que la
  -- empresa tiene congelado —con su descuento si lo tuvo—, jamas del catalogo
  -- de hoy.
  current_full_base bigint not null,
  target_full_base bigint not null,
  charge_currency text not null,

  prorated_current_base bigint not null,
  prorated_target_base bigint not null,
  delta_base bigint not null,

  service_class text not null references public.billing_service_classes (code),
  tax_rule_id uuid not null references public.billing_tax_rules (id),
  tax_rate_basis_points integer not null,
  tax_amount bigint not null,
  total_amount bigint not null,

  fx_rate_id uuid references public.commercial_fx_rates (id),
  fx_rate_micros bigint,

  status text not null default 'pending',
  quote_id uuid references public.billing_quotes (id),
  payment_id uuid references public.billing_payments (id),
  settled_at timestamptz,
  failure_reason text,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bsc_kind_check check (kind in ('immediate_upgrade')),
  constraint bsc_status_check check (status in (
    'pending', 'submitted', 'settled', 'declined', 'failed', 'cancelled')),
  constraint bsc_interval_check check (billing_interval in ('monthly', 'annual')),
  constraint bsc_window_check check (period_end > period_start),
  constraint bsc_remaining_check check (remaining_seconds > 0
                                        and remaining_seconds <= period_seconds),
  -- NUNCA un ajuste negativo. Subir de plan no devuelve dinero, y si la
  -- aritmetica diera cero o menos es que la configuracion comercial esta rara:
  -- eso lo mira una persona, no lo resuelve un abono automatico.
  constraint bsc_delta_check check (delta_base > 0 and total_amount >= delta_base),
  constraint bsc_settled_shape check ((status = 'settled') = (settled_at is not null))
);

-- UNA subida en vuelo por suscripcion. Dos serian dos cobros por lo mismo.
create unique index if not exists bsc_inflight_uniq
  on public.billing_subscription_changes (subscription_id)
  where status in ('pending', 'submitted');
create index if not exists bsc_org_idx
  on public.billing_subscription_changes (organization_id, created_at desc);

alter table public.billing_subscription_changes enable row level security;

drop policy if exists billing_subscription_changes_read on public.billing_subscription_changes;
create policy billing_subscription_changes_read on public.billing_subscription_changes
  for select to authenticated
  using (public.is_org_admin(organization_id) or public.is_platform_staff());

revoke all on public.billing_subscription_changes from anon;
revoke insert, update, delete, truncate on public.billing_subscription_changes
  from authenticated, anon;
grant select on public.billing_subscription_changes to authenticated;

comment on table public.billing_subscription_changes is
  'PE-05B6E · La subida de plan a mitad de periodo, como hecho comercial propio. NO es un periodo mas ni una renovacion: es un ajuste que ocurre una vez, sobre el tiempo que queda de lo ya pagado, y que no mueve el ancla de facturacion.';

alter table public.billing_checkout_intents
  add column if not exists subscription_change_id uuid
  references public.billing_subscription_changes (id);
create index if not exists bci_change_idx
  on public.billing_checkout_intents (subscription_change_id)
  where subscription_change_id is not null;

alter table public.billing_payments
  add column if not exists subscription_change_id uuid
  references public.billing_subscription_changes (id);

comment on column public.billing_checkout_intents.subscription_change_id is
  'PE-05B6E · Cuando el intento cobra una SUBIDA de plan y no una contratacion ni una renovacion. Es lo que impide que la conciliacion lo confunda con una compra nueva.';

-- ---------------------------------------------------------------------------
-- 8 · EL PRORRATEO, EN ENTEROS
-- ---------------------------------------------------------------------------
-- `round()` sobre numeric en PostgreSQL redondea a la mitad HACIA ARRIBA, que
-- es el mismo primitivo que ya usan `billing_tax_amount` y
-- `billing_usd_minor_to_cop`. Una sola forma de redondear en todo el dominio.
create or replace function public.billing_prorate(
  p_base bigint,
  p_remaining_seconds bigint,
  p_period_seconds bigint
)
returns bigint
language sql
immutable
as $$
  select case when p_period_seconds is null or p_period_seconds <= 0 then null
              else round((p_base::numeric * p_remaining_seconds::numeric)
                         / p_period_seconds::numeric)::bigint end;
$$;

comment on function public.billing_prorate(bigint, bigint, bigint) is
  'PE-05B6E · La parte de una base que corresponde al tiempo que queda. Enteros de punta a punta y un solo redondeo, a la mitad hacia arriba, igual que el impuesto.';

-- ---------------------------------------------------------------------------
-- 9 · PRESUPUESTAR LA SUBIDA
-- ---------------------------------------------------------------------------
create or replace function public.billing_quote_upgrade(
  p_subscription_id uuid,
  p_target_plan_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_sub    public.billing_subscriptions%rowtype;
  v_per    public.billing_subscription_periods%rowtype;
  v_rev    record;
  v_fx     jsonb;
  v_imp    jsonb;
  v_cat    bigint;
  v_destino bigint;
  v_total_seg bigint;
  v_resto_seg bigint;
  v_p_actual bigint;
  v_p_destino bigint;
  v_delta  bigint;
  v_iva    bigint;
  v_clase  text := 'self_service_saas';
  v_ahora  timestamptz := now();
  v_cambio uuid;
  v_quote  uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_target_plan_code not in ('full', 'extra') then
    raise exception 'PLAN_NOT_PURCHASABLE' using detail = coalesce(p_target_plan_code, 'null');
  end if;

  select * into v_sub from public.billing_subscriptions
   where id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;
  if not public.has_org_role(v_sub.organization_id, array['admin']) then
    raise exception 'NOT_AUTHORIZED'
      using hint = 'Solo quien administra la empresa puede cambiar el plan.';
  end if;
  if v_sub.status <> 'active' then
    return jsonb_build_object('status', 'not_upgradable', 'reason', v_sub.status);
  end if;
  if v_sub.plan_code = p_target_plan_code then
    return jsonb_build_object('status', 'already_on_plan', 'plan_code', v_sub.plan_code);
  end if;
  -- Una decision a la vez. Si hay una transicion programada, primero se retira.
  if v_sub.scheduled_plan_revision_id is not null then
    return jsonb_build_object('status', 'change_already_scheduled',
      'effective_at', v_sub.scheduled_effective_at);
  end if;
  if v_sub.cancel_at_period_end then
    return jsonb_build_object('status', 'cancellation_scheduled');
  end if;
  if exists (select 1 from public.billing_subscription_changes
              where subscription_id = v_sub.id and status in ('pending', 'submitted')) then
    return jsonb_build_object('status', 'upgrade_already_pending');
  end if;

  -- CONTRA QUÉ TIEMPO. El periodo vigente tiene que estar pagado: subir de plan
  -- mientras se debe el mes en curso seria cobrar dos cosas a la vez.
  select * into v_per from public.billing_subscription_periods
   where subscription_id = p_subscription_id
   order by period_sequence desc limit 1;
  if not found then
    return jsonb_build_object('status', 'anchor_missing');
  end if;
  if v_per.status <> 'settled' then
    return jsonb_build_object('status', 'period_unpaid', 'period_id', v_per.id);
  end if;
  if v_ahora >= v_per.period_end then
    return jsonb_build_object('status', 'period_ended', 'period_end', v_per.period_end);
  end if;
  if v_ahora < v_per.period_start then
    return jsonb_build_object('status', 'period_not_started');
  end if;

  v_total_seg := extract(epoch from (v_per.period_end - v_per.period_start))::bigint;
  v_resto_seg := extract(epoch from (v_per.period_end - v_ahora))::bigint;
  if v_resto_seg <= 0 or v_total_seg <= 0 then
    return jsonb_build_object('status', 'period_ended');
  end if;

  select r.id, r.plan_code, r.currency, r.price_state,
         r.monthly_price_minor, r.annual_price_minor
    into v_rev
    from public.plan_revisions r
   where r.plan_code = p_target_plan_code and r.status = 'published'
     and r.effective_to is null;
  if v_rev.id is null then
    raise exception 'PLAN_REVISION_NOT_PUBLISHED' using detail = p_target_plan_code;
  end if;
  if v_rev.price_state <> 'configured' then
    raise exception 'PLAN_PRICE_NOT_CONFIGURED' using detail = p_target_plan_code;
  end if;

  -- SUBIR MANTIENE LA PERIODICIDAD. Convertir de mensual a anual y ampliar el
  -- plan en la misma operacion financiera mezcla dos decisiones con dos
  -- calendarios; quien quiera las dos hace primero una y programa la otra.
  v_cat := case when v_sub.billing_interval = 'monthly'
                then v_rev.monthly_price_minor else v_rev.annual_price_minor end;
  if v_cat is null or v_cat <= 0 then
    raise exception 'PLAN_PRICE_NOT_CONFIGURED' using detail = v_sub.billing_interval;
  end if;

  -- El precio DESTINO es una decision comercial nueva y por eso exige tasa
  -- vigente. El valor de origen NO se reconstruye: es el que la empresa tiene
  -- congelado, descuento incluido si lo hubo.
  v_fx := public.billing_resolve_fx(v_rev.currency, v_sub.charge_currency, v_ahora);
  if v_fx->>'status' <> 'found' then
    raise exception 'FX_RATE_UNAVAILABLE'
      using detail = v_rev.currency || '→' || v_sub.charge_currency,
            hint = 'Subir de plan fija un precio nuevo y eso exige tipo de cambio vigente.';
  end if;
  v_destino := public.billing_usd_minor_to_cop(v_cat, (v_fx->>'rate_micros')::bigint);

  v_p_actual  := public.billing_prorate(v_sub.base_charge_amount, v_resto_seg, v_total_seg);
  v_p_destino := public.billing_prorate(v_destino, v_resto_seg, v_total_seg);
  v_delta     := v_p_destino - v_p_actual;

  if v_delta <= 0 then
    -- Falla cerrado. Convertir esto en un abono automatico seria inventar
    -- devoluciones que el producto no hace.
    return jsonb_build_object('status', 'no_positive_delta',
      'prorated_current_base', v_p_actual, 'prorated_target_base', v_p_destino,
      'reason', 'El plan destino no cuesta mas que el actual para el tiempo restante.');
  end if;

  v_imp := public.billing_resolve_tax_rule(v_clase, v_ahora, 'CO');
  if v_imp->>'status' <> 'found' then
    raise exception 'TAX_RULE_UNAVAILABLE' using detail = v_clase;
  end if;
  v_iva := public.billing_tax_amount(v_delta, (v_imp->>'rate_basis_points')::integer);

  insert into public.billing_quotes (
    organization_id, plan_code, plan_revision_id, billing_interval,
    catalog_amount_minor, catalog_currency,
    fx_rate_id, fx_rate_micros, charge_currency,
    discount_amount, base_amount,
    service_class, tax_rule_id, tax_rate_basis_points, tax_amount, total_amount,
    expires_at, created_by, subscription_id)
  values (
    v_sub.organization_id, v_rev.plan_code, v_rev.id, v_sub.billing_interval,
    v_cat, v_rev.currency,
    nullif(v_fx->>'fx_rate_id', '')::uuid, (v_fx->>'rate_micros')::bigint,
    v_sub.charge_currency,
    0, v_delta,
    v_clase, (v_imp->>'tax_rule_id')::uuid, (v_imp->>'rate_basis_points')::integer,
    v_iva, v_delta + v_iva,
    v_ahora + interval '30 minutes', auth.uid(), v_sub.id)
  returning id into v_quote;

  insert into public.billing_subscription_changes (
    organization_id, subscription_id, kind,
    from_plan_code, from_plan_revision_id, to_plan_code, to_plan_revision_id,
    billing_interval, period_id, period_start, period_end, effective_at,
    remaining_seconds, period_seconds,
    current_full_base, target_full_base, charge_currency,
    prorated_current_base, prorated_target_base, delta_base,
    service_class, tax_rule_id, tax_rate_basis_points, tax_amount, total_amount,
    fx_rate_id, fx_rate_micros, quote_id, created_by)
  values (
    v_sub.organization_id, v_sub.id, 'immediate_upgrade',
    v_sub.plan_code, v_sub.plan_revision_id, v_rev.plan_code, v_rev.id,
    v_sub.billing_interval, v_per.id, v_per.period_start, v_per.period_end, v_ahora,
    v_resto_seg, v_total_seg,
    v_sub.base_charge_amount, v_destino, v_sub.charge_currency,
    v_p_actual, v_p_destino, v_delta,
    v_clase, (v_imp->>'tax_rule_id')::uuid, (v_imp->>'rate_basis_points')::integer,
    v_iva, v_delta + v_iva,
    nullif(v_fx->>'fx_rate_id', '')::uuid, (v_fx->>'rate_micros')::bigint,
    v_quote, auth.uid())
  returning id into v_cambio;

  return jsonb_build_object(
    'status', 'quoted',
    'change_id', v_cambio, 'quote_id', v_quote,
    'subscription_id', v_sub.id,
    'from_plan_code', v_sub.plan_code, 'to_plan_code', v_rev.plan_code,
    'billing_interval', v_sub.billing_interval,
    'period_start', v_per.period_start, 'period_end', v_per.period_end,
    'renews_at', v_per.period_end,
    'remaining_seconds', v_resto_seg, 'period_seconds', v_total_seg,
    'current_full_base', v_sub.base_charge_amount,
    'target_full_base', v_destino,
    'prorated_current_base', v_p_actual,
    'prorated_target_base', v_p_destino,
    'delta_base', v_delta,
    'tax_rate_basis_points', (v_imp->>'rate_basis_points')::integer,
    'tax_amount', v_iva,
    'total_amount', v_delta + v_iva,
    'charge_currency', v_sub.charge_currency);
end;
$$;

revoke all on function public.billing_quote_upgrade(uuid, text) from public, anon;
grant execute on function public.billing_quote_upgrade(uuid, text) to authenticated;

comment on function public.billing_quote_upgrade(uuid, text) is
  'PE-05B6E · Presupuesta la subida inmediata de plan: cobra solo la DIFERENCIA que corresponde al tiempo que queda del periodo ya pagado. El valor del plan actual sale de su base congelada —con su descuento— y el del destino, del catalogo con tasa vigente. Nunca devuelve dinero: si la diferencia no es positiva, falla cerrado.';

-- Retirar una subida que no llego a pagarse.
create or replace function public.billing_cancel_upgrade(p_change_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare v_c public.billing_subscription_changes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  select * into v_c from public.billing_subscription_changes
   where id = p_change_id for update;
  if not found then
    return jsonb_build_object('status', 'change_not_found');
  end if;
  if not public.has_org_role(v_c.organization_id, array['admin']) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_c.status <> 'pending' then
    return jsonb_build_object('status', 'not_cancellable', 'reason', v_c.status);
  end if;

  update public.billing_subscription_changes
     set status = 'cancelled', updated_at = now() where id = v_c.id;
  -- El presupuesto se anula, que es el estado que ya existe para «no llego a
  -- usarse». No se borra: hubo una oferta y consta.
  update public.billing_quotes set status = 'void' where id = v_c.quote_id;
  return jsonb_build_object('status', 'cancelled', 'change_id', v_c.id);
end;
$$;

revoke all on function public.billing_cancel_upgrade(uuid) from public, anon;
grant execute on function public.billing_cancel_upgrade(uuid) to authenticated;

comment on function public.billing_cancel_upgrade(uuid) is
  'PE-05B6E · Retira una subida presupuestada que todavia no se ha cobrado. Una ya enviada al proveedor no se retira por aqui: se espera su desenlace.';

-- ---------------------------------------------------------------------------
-- 10 · EL INTENTO DE COBRO DE UNA SUBIDA
-- ---------------------------------------------------------------------------
create or replace function public.billing_open_upgrade_intent(
  p_change_id uuid,
  p_provider text,
  p_environment text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_c   public.billing_subscription_changes%rowtype;
  v_id  uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_environment not in ('test', 'live') then
    raise exception 'ENVIRONMENT_INVALID' using detail = coalesce(p_environment, 'null');
  end if;

  select * into v_c from public.billing_subscription_changes
   where id = p_change_id for update;
  if not found then
    return jsonb_build_object('status', 'change_not_found');
  end if;
  if not public.has_org_role(v_c.organization_id, array['admin']) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_c.status <> 'pending' then
    return jsonb_build_object('status', 'not_payable', 'reason', v_c.status);
  end if;

  -- El tiempo restante se calculo al presupuestar. Si el periodo ya termino
  -- mientras el cliente lo pensaba, lo que hay que hacer es volver a
  -- presupuestar, no cobrar una cuenta vieja.
  if now() >= v_c.period_end then
    update public.billing_subscription_changes
       set status = 'cancelled', failure_reason = 'PERIOD_ENDED', updated_at = now()
     where id = v_c.id;
    update public.billing_quotes set status = 'expired' where id = v_c.quote_id;
    return jsonb_build_object('status', 'period_ended');
  end if;

  insert into public.billing_checkout_intents (
    organization_id, quote_id, provider, environment,
    expected_total_amount, expected_currency, billing_interval, plan_code,
    billing_subscription_id, subscription_change_id, created_by)
  values (
    v_c.organization_id, v_c.quote_id, p_provider, p_environment,
    v_c.total_amount, v_c.charge_currency, v_c.billing_interval, v_c.to_plan_code,
    v_c.subscription_id, v_c.id, auth.uid())
  returning id into v_id;

  update public.billing_subscription_changes
     set status = 'submitted', updated_at = now() where id = v_c.id;

  return jsonb_build_object('status', 'opened', 'intent_id', v_id,
    'change_id', v_c.id, 'expected_total_amount', v_c.total_amount,
    'expected_currency', v_c.charge_currency);
end;
$$;

revoke all on function public.billing_open_upgrade_intent(uuid, text, text) from public, anon;
grant execute on function public.billing_open_upgrade_intent(uuid, text, text) to authenticated;

comment on function public.billing_open_upgrade_intent(uuid, text, text) is
  'PE-05B6E · Abre el intento de cobro de una subida ya presupuestada, congelando el importe esperado. Marca la subida como enviada: a partir de aqui no se retira, se espera su desenlace.';

-- ---------------------------------------------------------------------------
-- 11 · Y SOLO EL PAGO CONCILIADO CONCEDE EXTRA
-- ---------------------------------------------------------------------------
-- Ni la respuesta del POST, ni la vuelta del navegador, ni un botón. El derecho
-- lo abre el evento firmado, igual que en la contratación y en la renovación.
create or replace function public.billing_settle_upgrade_payment(
  p_intent_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_outcome text,
  p_amount bigint,
  p_currency text,
  p_live_mode boolean default null,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_intent public.billing_checkout_intents%rowtype;
  v_c      public.billing_subscription_changes%rowtype;
  v_sub    public.billing_subscriptions%rowtype;
  v_ya     public.billing_payments%rowtype;
  v_mod    record;
  v_pago   uuid;
  v_aplicados integer := 0;
begin
  if p_outcome not in ('approved', 'declined', 'failed') then
    raise exception 'PAYMENT_OUTCOME_INVALID' using detail = coalesce(p_outcome, 'null');
  end if;

  -- El mismo pago repetido no vuelve a hacer nada.
  if p_provider_payment_id is not null then
    select * into v_ya from public.billing_payments
     where provider = p_provider and provider_payment_id = p_provider_payment_id;
    if found then
      return jsonb_build_object('outcome', 'already_settled', 'payment_id', v_ya.id,
        'subscription_id', v_ya.subscription_id,
        'organization_id', v_ya.organization_id);
    end if;
  end if;

  select * into v_intent from public.billing_checkout_intents
   where id = p_intent_id for update;
  if not found then
    return jsonb_build_object('outcome', 'reference_unknown');
  end if;
  if v_intent.subscription_change_id is null then
    return jsonb_build_object('outcome', 'not_an_upgrade', 'intent_id', v_intent.id);
  end if;
  if v_intent.provider <> p_provider then
    return jsonb_build_object('outcome', 'provider_mismatch', 'intent_id', v_intent.id);
  end if;

  select * into v_c from public.billing_subscription_changes
   where id = v_intent.subscription_change_id for update;
  if not found then
    return jsonb_build_object('outcome', 'change_not_found');
  end if;
  if v_c.status = 'settled' then
    return jsonb_build_object('outcome', 'already_settled', 'change_id', v_c.id,
      'payment_id', v_c.payment_id, 'organization_id', v_c.organization_id);
  end if;

  -- ENTORNO. Falla cerrado: sin dato no se asume.
  if p_live_mode is null
     or (p_live_mode and v_intent.environment <> 'live')
     or (not p_live_mode and v_intent.environment <> 'test') then
    update public.billing_checkout_intents
       set status = 'manual_review', failure_reason = 'ENVIRONMENT_MISMATCH', updated_at = now()
     where id = v_intent.id;
    return jsonb_build_object('outcome', 'environment_mismatch', 'intent_id', v_intent.id,
      'organization_id', v_intent.organization_id);
  end if;

  if p_outcome = 'approved' then
    -- CONCILIACIÓN EXACTA, igual que en los otros dos caminos.
    if p_currency is null or upper(p_currency) <> upper(v_intent.expected_currency)
       or p_amount is null or p_amount <> v_intent.expected_total_amount then
      update public.billing_checkout_intents
         set status = 'manual_review', failure_reason = 'PAYMENT_RECONCILIATION_MISMATCH',
             updated_at = now()
       where id = v_intent.id;
      update public.billing_subscription_changes
         set status = 'failed', failure_reason = 'PAYMENT_RECONCILIATION_MISMATCH',
             updated_at = now()
       where id = v_c.id;
      return jsonb_build_object('outcome', 'reconciliation_mismatch',
        'expected', v_intent.expected_total_amount, 'received', p_amount,
        'intent_id', v_intent.id, 'organization_id', v_intent.organization_id);
    end if;
  end if;

  select * into v_sub from public.billing_subscriptions
   where id = v_c.subscription_id for update;
  if not found then
    return jsonb_build_object('outcome', 'subscription_not_found');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('billing:' || v_c.organization_id::text, 0));

  -- LO QUE NO SALIÓ BIEN deja a la empresa donde estaba. Sin Extra, sin
  -- espacio nuevo, sin cuota de inteligencia nueva.
  if p_outcome <> 'approved' then
    update public.billing_checkout_intents
       set status = case p_outcome when 'declined' then 'declined' else 'failed' end,
           failure_reason = p_failure_reason, updated_at = now()
     where id = v_intent.id;
    update public.billing_subscription_changes
       set status = case p_outcome when 'declined' then 'declined' else 'failed' end,
           failure_reason = p_failure_reason, updated_at = now()
     where id = v_c.id;
    return jsonb_build_object('outcome', p_outcome, 'change_id', v_c.id,
      'organization_id', v_c.organization_id, 'plan_code', v_sub.plan_code);
  end if;

  insert into public.billing_payments (
    organization_id, subscription_id, quote_id, subscription_change_id,
    provider, provider_payment_id,
    base_amount, discount_amount,
    service_class, tax_rule_id, tax_rate_basis_points, tax_amount,
    total_amount, currency, fx_rate_micros,
    status, paid_at)
  values (
    v_c.organization_id, v_c.subscription_id, v_c.quote_id, v_c.id,
    p_provider, p_provider_payment_id,
    v_c.delta_base, 0,
    v_c.service_class, v_c.tax_rule_id, v_c.tax_rate_basis_points, v_c.tax_amount,
    v_c.total_amount, v_c.charge_currency, v_c.fx_rate_micros,
    'approved', now())
  returning id into v_pago;

  -- El nivel nuevo, por la primitiva de siempre: cierra la asignacion anterior
  -- y abre la del plan destino. Ni una duplicada, ni un paso por Free.
  for v_mod in
    select om.module_code from public.organization_modules om
      join public.modules m on m.code = om.module_code
     where om.organization_id = v_c.organization_id
       and om.enabled and coalesce(m.is_functional, false)
  loop
    perform public.commercial_apply_assignment(
      v_c.organization_id, v_c.to_plan_revision_id, 'module', v_mod.module_code,
      'sold', 'checkout', now(), null,
      'Subida inmediata de ' || v_c.from_plan_code || ' a ' || v_c.to_plan_code
        || ', pagada la diferencia del periodo en curso.', v_c.created_by);
    v_aplicados := v_aplicados + 1;
  end loop;

  -- LA SUSCRIPCIÓN PASA A EXTRA Y A SU IMPORTE COMPLETO, y el CALENDARIO NO SE
  -- TOCA: ni el periodo en curso, ni el ancla, ni la fecha de renovacion. Quien
  -- compro un ano en enero sigue renovando en enero.
  update public.billing_subscriptions
     set plan_code = v_c.to_plan_code,
         plan_revision_id = v_c.to_plan_revision_id,
         base_charge_amount = v_c.target_full_base,
         charge_currency = v_c.charge_currency,
         fx_rate_id = v_c.fx_rate_id,
         fx_rate_micros = v_c.fx_rate_micros,
         updated_at = now()
   where id = v_sub.id;

  update public.billing_subscription_changes
     set status = 'settled', settled_at = now(), payment_id = v_pago, updated_at = now()
   where id = v_c.id;
  update public.billing_quotes
     set status = 'consumed', consumed_at = now(), subscription_id = v_c.subscription_id
   where id = v_c.quote_id;
  update public.billing_checkout_intents
     set status = 'settled', failure_reason = null, updated_at = now()
   where id = v_intent.id;

  return jsonb_build_object('outcome', 'upgraded', 'change_id', v_c.id,
    'organization_id', v_c.organization_id, 'payment_id', v_pago,
    'subscription_id', v_c.subscription_id, 'plan_code', v_c.to_plan_code,
    'base_charge_amount', v_c.target_full_base,
    'modules_applied', v_aplicados);
end;
$$;

revoke all on function public.billing_settle_upgrade_payment(
  uuid, text, text, text, bigint, text, boolean, text) from public, anon, authenticated;
grant execute on function public.billing_settle_upgrade_payment(
  uuid, text, text, text, bigint, text, boolean, text) to service_role;

comment on function public.billing_settle_upgrade_payment(uuid, text, text, text, bigint, text, boolean, text) is
  'PE-05B6E · El UNICO camino de un pago verificado a la subida de plan. Concilia exacto, comprueba entorno, concede el nivel nuevo y deja el calendario intacto. Idempotente por (proveedor, id de pago) y por el estado de la subida.';

-- ---------------------------------------------------------------------------
-- 12 · UNA SUBIDA NO ES UNA CONTRATACIÓN
-- ---------------------------------------------------------------------------
-- Defensa en profundidad. La conciliación de contratación crea una suscripción
-- nueva; si un intento de subida llegara ahí por un error de encaminamiento, la
-- empresa acabaria con DOS suscripciones y dos calendarios. Se niega en la
-- propia primitiva, no solo en quien la llama.
CREATE OR REPLACE FUNCTION public.billing_settle_provider_payment(p_provider text, p_external_reference text, p_provider_payment_id text, p_outcome text, p_amount bigint, p_currency text, p_live_mode boolean DEFAULT NULL::boolean, p_failure_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_intent public.billing_checkout_intents%rowtype;
  v_ya     public.billing_payments%rowtype;
  v_res    jsonb;
begin
  if p_outcome not in ('approved', 'declined', 'failed') then
    raise exception 'PAYMENT_OUTCOME_INVALID' using detail = coalesce(p_outcome, 'null');
  end if;

  -- IDEMPOTENCIA, ANTES QUE NADA. El proveedor reintenta por diseño: si este
  -- pago ya se liquidó, se devuelve lo mismo sin volver a tocar nada.
  if p_provider_payment_id is not null then
    select * into v_ya from public.billing_payments
     where provider = p_provider and provider_payment_id = p_provider_payment_id;
    if found then
      return jsonb_build_object('outcome', 'already_settled', 'payment_id', v_ya.id,
        'subscription_id', v_ya.subscription_id, 'organization_id', v_ya.organization_id);
    end if;
  end if;

  -- La referencia externa tiene que ser un intento NUESTRO. Un recurso válido
  -- del proveedor que apunte a cualquier otra cosa no activa nada.
  if p_external_reference is null then
    return jsonb_build_object('outcome', 'reference_missing');
  end if;
  begin
    select * into v_intent from public.billing_checkout_intents
     where id = p_external_reference::uuid for update;
  exception when invalid_text_representation then
    return jsonb_build_object('outcome', 'reference_unknown');
  end;
  if not found then
    return jsonb_build_object('outcome', 'reference_unknown');
  end if;
  if v_intent.provider <> p_provider then
    return jsonb_build_object('outcome', 'provider_mismatch', 'intent_id', v_intent.id);
  end if;
  -- LA PUERTA NUEVA. Un intento de SUBIDA de plan no se concilia por aquí: si
  -- lo hiciera, `billing_settle_payment` crearía una segunda suscripción y la
  -- empresa acabaría con dos calendarios y dos cobros.
  if v_intent.subscription_change_id is not null then
    return jsonb_build_object('outcome', 'upgrade_not_a_checkout',
      'intent_id', v_intent.id, 'change_id', v_intent.subscription_change_id,
      'organization_id', v_intent.organization_id);
  end if;

  -- ENTORNO. Un evento en vivo sobre un intento de pruebas no activa nada, y
  -- al revés tampoco. Falla cerrado: sin dato de entorno no se asume.
  if p_live_mode is null
     or (p_live_mode and v_intent.environment <> 'live')
     or (not p_live_mode and v_intent.environment <> 'test') then
    update public.billing_checkout_intents
       set status = 'manual_review', failure_reason = 'ENVIRONMENT_MISMATCH', updated_at = now()
     where id = v_intent.id;
    return jsonb_build_object('outcome', 'environment_mismatch', 'intent_id', v_intent.id,
      'organization_id', v_intent.organization_id);
  end if;

  -- CONCILIACIÓN. Exacta. No hay tolerancia: el peso colombiano no tiene
  -- decimales y el importe se calculó en enteros de punta a punta.
  if p_outcome = 'approved' then
    if p_currency is null or upper(p_currency) <> upper(v_intent.expected_currency) then
      update public.billing_checkout_intents
         set status = 'manual_review', failure_reason = 'PAYMENT_RECONCILIATION_MISMATCH',
             updated_at = now()
       where id = v_intent.id;
      return jsonb_build_object('outcome', 'reconciliation_mismatch', 'reason', 'currency',
        'expected', v_intent.expected_currency, 'received', p_currency,
        'intent_id', v_intent.id, 'organization_id', v_intent.organization_id);
    end if;
    if p_amount is null or p_amount <> v_intent.expected_total_amount then
      update public.billing_checkout_intents
         set status = 'manual_review', failure_reason = 'PAYMENT_RECONCILIATION_MISMATCH',
             updated_at = now()
       where id = v_intent.id;
      return jsonb_build_object('outcome', 'reconciliation_mismatch', 'reason', 'amount',
        'expected', v_intent.expected_total_amount, 'received', p_amount,
        'intent_id', v_intent.id, 'organization_id', v_intent.organization_id);
    end if;
  end if;

  -- Y solo ahora se liquida, por la primitiva canónica de B1. B2 no escribe
  -- ni un cobro ni una asignación a mano.
  v_res := public.billing_settle_payment(
    v_intent.quote_id, p_provider, p_provider_payment_id, p_outcome,
    'mp:' || p_provider_payment_id, p_failure_reason);

  update public.billing_checkout_intents
     set status = case p_outcome when 'approved' then 'settled'
                                 when 'declined' then 'declined' else 'failed' end,
         billing_subscription_id = coalesce((v_res->>'subscription_id')::uuid, billing_subscription_id),
         failure_reason = case when p_outcome = 'approved' then null else p_failure_reason end,
         updated_at = now()
   where id = v_intent.id;

  return jsonb_build_object(
    'outcome', case p_outcome when 'approved' then 'activated' else p_outcome end,
    'intent_id', v_intent.id,
    'organization_id', v_intent.organization_id,
    'payment_id', v_res->'payment_id',
    'subscription_id', v_res->'subscription_id',
    'modules_granted', v_res->'modules_granted');
end;
$function$;

comment on function public.billing_settle_provider_payment(text, text, text, text, bigint, text, boolean, text) is
  'PE-05B6E · El UNICO camino de un pago verificado a un plan CONTRATADO. Desde 0181 niega explicitamente los intentos de subida de plan: esos tienen su propia primitiva y confundirlos crearia una segunda suscripcion.';

-- ---------------------------------------------------------------------------
-- 13 · LA CANCELACIÓN DICE QUÉ PASÓ, NO «true»
-- ---------------------------------------------------------------------------
-- B6D encontró que esta primitiva devolvia un booleano bajo la clave `status`,
-- mientras todas sus hermanas devuelven una palabra. No rompia nada porque
-- quien la llamaba leia `effective_at`, pero la proxima persona que programe
-- contra `status` se encontrara con `true` y no sabra que hacer con el.
CREATE OR REPLACE FUNCTION public.billing_request_cancellation(p_subscription_id uuid, p_cancel boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sub public.billing_subscriptions%rowtype;
  v_fin timestamptz;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_sub from public.billing_subscriptions
   where id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;
  -- Comprometer a la empresa —y dejar de hacerlo— es de quien la administra.
  if not public.has_org_role(v_sub.organization_id, array['admin']) then
    raise exception 'NOT_AUTHORIZED'
      using hint = 'Solo quien administra la empresa puede cancelar el plan.';
  end if;
  if v_sub.status not in ('active', 'past_due') then
    return jsonb_build_object('status', 'not_cancellable', 'reason', v_sub.status);
  end if;

  select period_end into v_fin from public.billing_subscription_periods
   where subscription_id = p_subscription_id
   order by period_sequence desc limit 1;

  update public.billing_subscriptions
     set cancel_at_period_end = p_cancel,
         cancelled_at = case when p_cancel then coalesce(cancelled_at, now()) end,
         updated_at = now()
   where id = v_sub.id;

  -- Una palabra, como en todas sus hermanas. Antes devolvia el booleano crudo
  -- bajo la clave `status`, y quien programara contra el se encontraba `true`.
  return jsonb_build_object(
    'status', case when p_cancel then 'cancellation_scheduled'
                   else 'cancellation_withdrawn' end,
    'cancel_at_period_end', p_cancel,
    'subscription_id', v_sub.id, 'effective_at', v_fin);
end;
$function$;

comment on function public.billing_request_cancellation(uuid, boolean) is
  'PE-05B6E · Pide cancelar al terminar el periodo PAGADO, o retira esa peticion. No corta nada hoy: quien cancela el dia 2 tiene servicio hasta el 30 porque pago por el. Devuelve cancellation_scheduled o cancellation_withdrawn, en el mismo vocabulario que sus hermanas.';

-- ---------------------------------------------------------------------------
-- 14 · CUANDO NO SE SABE SI SE COBRÓ
-- ---------------------------------------------------------------------------
-- La peticion cruzó la frontera del proveedor y no hubo respuesta. No se
-- concede Extra, no se declara fallida y —sobre todo— no se vuelve a cobrar con
-- otra referencia. Se queda quieta y la mira una persona.
create or replace function public.billing_mark_upgrade_uncertain(
  p_intent_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_intent public.billing_checkout_intents%rowtype;
begin
  select * into v_intent from public.billing_checkout_intents
   where id = p_intent_id for update;
  if not found then
    return jsonb_build_object('status', 'intent_not_found');
  end if;
  if v_intent.subscription_change_id is null then
    return jsonb_build_object('status', 'not_an_upgrade');
  end if;

  update public.billing_checkout_intents
     set status = 'manual_review', failure_reason = coalesce(p_reason, 'PROVIDER_UNKNOWN'),
         updated_at = now()
   where id = v_intent.id;
  -- La subida NO cambia de estado: sigue «enviada». Ese es justamente el hecho.
  update public.billing_subscription_changes
     set failure_reason = coalesce(p_reason, 'PROVIDER_UNKNOWN'), updated_at = now()
   where id = v_intent.subscription_change_id and status = 'submitted';

  return jsonb_build_object('status', 'pending_review', 'intent_id', v_intent.id,
    'change_id', v_intent.subscription_change_id,
    'organization_id', v_intent.organization_id);
end;
$$;

revoke all on function public.billing_mark_upgrade_uncertain(uuid, text)
  from public, anon, authenticated;
grant execute on function public.billing_mark_upgrade_uncertain(uuid, text) to service_role;

comment on function public.billing_mark_upgrade_uncertain(uuid, text) is
  'PE-05B6E · Deja constancia de que el cobro de una subida salio sin respuesta. Ni concede el plan, ni lo declara fallido, ni permite un segundo cobro: lo resuelve la conciliacion o una persona.';

-- ---------------------------------------------------------------------------
-- 15 · LO QUE VE QUIEN ADMINISTRA LA PLATAFORMA
-- ---------------------------------------------------------------------------
create or replace view public.v_billing_subscription_changes as
  select c.id, c.organization_id, o.name as organization_name,
         c.subscription_id, c.kind, c.status,
         c.from_plan_code, c.to_plan_code, c.billing_interval,
         c.period_start, c.period_end, c.effective_at,
         c.remaining_seconds, c.period_seconds,
         c.current_full_base, c.target_full_base,
         c.prorated_current_base, c.prorated_target_base,
         c.delta_base, c.tax_rate_basis_points, c.tax_amount, c.total_amount,
         c.charge_currency, c.failure_reason, c.settled_at, c.created_at,
         p.provider, p.provider_payment_id, p.status as payment_status
    from public.billing_subscription_changes c
    join public.organizations o on o.id = c.organization_id
    left join public.billing_payments p on p.id = c.payment_id
   where public.is_platform_staff();

revoke all on public.v_billing_subscription_changes from anon;
grant select on public.v_billing_subscription_changes to authenticated;

comment on view public.v_billing_subscription_changes is
  'PE-05B6E · Las subidas de plan, para la administracion de plataforma. Identificadores del proveedor e importes; ni un dato de tarjeta. El filtro de plataforma vive en la propia vista, igual que en v_platform_organizations.';
