-- ===========================================================================
-- Trazaloop · 0178 · Que quien paga pueda decidir: irse, o bajar de plan
-- ===========================================================================
--
-- EL HUECO
--
-- El motor sabe ejecutar las dos cosas desde 0175: cuando llega el final del
-- mes pagado, cancela o aplica el cambio programado. Lo que no existía es la
-- forma de PEDIRLAS. `cancel_at_period_end` y `scheduled_plan_revision_id` no
-- los escribía nadie, así que el cliente no tenía manera de decir «me voy» ni
-- «bájame a Full», y la única salida a mano habría sido un `update` desde la
-- aplicación —justo lo que este dominio evita, porque entonces la regla vive en
-- dos sitios y uno de los dos se olvida—.
--
-- LO QUE SE DECIDE AQUÍ, Y POR QUÉ
--
-- 1 · NADA SE ACORTA. Las dos surten efecto al terminar el periodo que ya está
--     pagado. Quien cancela el día 2 tiene servicio hasta el 30: pagó por él.
--
-- 2 · EL PRECIO NUEVO SE CONGELA AL PEDIRLO. Es la misma regla que al
--     contratar. Si se resolviera el día del cambio, el importe del cliente
--     dependería del tipo de cambio de una fecha que nadie eligió, y de la hora
--     a la que corriera un proceso.
--
-- 3 · Y POR ESO UNA BAJADA NECESITA TIPO DE CAMBIO Y UNA RENOVACIÓN NO. Renovar
--     cobra un importe que ya estaba congelado; cambiar de plan fija uno nuevo,
--     y eso es un precio de catálogo que hay que convertir. Sin tasa vigente no
--     se inventa: se dice que no se puede todavía.
--
-- 4 · Y NADA DE ESTO ES EL RETIRO ADMINISTRATIVO de 0176. Aquello es una
--     decisión de plataforma, excepcional y con otro nombre. Ningún camino de
--     producto lo alcanza, y una prueba lo vigila.
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
  if to_regprocedure('public.billing_apply_scheduled_change(uuid)') is null then
    raise exception '0178 presupone 0177';
  end if;
  raise notice '0178 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · IRSE AL FINAL DEL PERIODO PAGADO
-- ---------------------------------------------------------------------------
create or replace function public.billing_request_cancellation(
  p_subscription_id uuid,
  p_cancel boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
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

  return jsonb_build_object('status', p_cancel and true, 'cancel_at_period_end', p_cancel,
    'subscription_id', v_sub.id, 'effective_at', v_fin);
end;
$$;

revoke all on function public.billing_request_cancellation(uuid, boolean) from public, anon;
grant execute on function public.billing_request_cancellation(uuid, boolean) to authenticated;

comment on function public.billing_request_cancellation(uuid, boolean) is
  'PE-05B5F · Pide cancelar al terminar el periodo PAGADO, o retira esa peticion. No corta nada hoy: quien cancela el dia 2 tiene servicio hasta el 30, porque pago por el. Solo quien administra la empresa.';

-- ---------------------------------------------------------------------------
-- 2 · BAJAR DE PLAN AL FINAL DEL PERIODO PAGADO
-- ---------------------------------------------------------------------------
create or replace function public.billing_schedule_plan_change(
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
  v_sub  public.billing_subscriptions%rowtype;
  v_rev  record;
  v_fx   jsonb;
  v_cat  bigint;
  v_base bigint;
  v_fin  timestamptz;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  -- Free no se «contrata»: es el suelo. Bajar a Free es cancelar, y para eso
  -- está el otro camino.
  if p_target_plan_code not in ('full', 'extra') then
    raise exception 'PLAN_NOT_PURCHASABLE' using detail = coalesce(p_target_plan_code, 'null'),
      hint = 'Volver a Free es cancelar, no cambiar de plan.';
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
  if v_sub.plan_code = p_target_plan_code then
    return jsonb_build_object('status', 'already_on_plan', 'plan_code', v_sub.plan_code);
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

  v_cat := case when v_sub.billing_interval = 'monthly'
                then v_rev.monthly_price_minor else v_rev.annual_price_minor end;
  if v_cat is null or v_cat <= 0 then
    raise exception 'PLAN_PRICE_NOT_CONFIGURED' using detail = v_sub.billing_interval;
  end if;

  -- EL PRECIO NUEVO, CONGELADO HOY. Renovar no mira el cambio porque su importe
  -- ya estaba fijado; cambiar de plan fija uno nuevo, y eso sí es una
  -- conversión. Sin tasa vigente no se inventa.
  v_fx := public.billing_resolve_fx(v_rev.currency, v_sub.charge_currency, now());
  if v_fx->>'status' <> 'found' then
    raise exception 'FX_RATE_UNAVAILABLE'
      using detail = v_rev.currency || '→' || v_sub.charge_currency,
            hint = 'Cambiar de plan fija un precio nuevo y eso exige tipo de cambio vigente. Renovar no, porque su importe ya estaba congelado.';
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
         updated_at = now()
   where id = v_sub.id;

  return jsonb_build_object('status', 'scheduled', 'subscription_id', v_sub.id,
    'target_plan_code', v_rev.plan_code, 'effective_at', v_fin,
    'base_charge_amount', v_base, 'charge_currency', v_sub.charge_currency);
end;
$$;

revoke all on function public.billing_schedule_plan_change(uuid, text) from public, anon;
grant execute on function public.billing_schedule_plan_change(uuid, text) to authenticated;

comment on function public.billing_schedule_plan_change(uuid, text) is
  'PE-05B5F · Programa un cambio de plan para el final del periodo PAGADO, congelando su precio HOY —misma regla que al contratar—. Exige tipo de cambio vigente, porque fija un importe nuevo; renovar no lo exige porque el suyo ya estaba congelado. Solo quien administra la empresa.';

-- ---------------------------------------------------------------------------
-- 3 · Y ARREPENTIRSE, MIENTRAS NO HAYA LLEGADO EL DÍA
-- ---------------------------------------------------------------------------
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
         updated_at = now()
   where id = v_sub.id;

  return jsonb_build_object('status', 'cleared', 'subscription_id', v_sub.id);
end;
$$;

revoke all on function public.billing_cancel_scheduled_change(uuid) from public, anon;
grant execute on function public.billing_cancel_scheduled_change(uuid) to authenticated;

comment on function public.billing_cancel_scheduled_change(uuid) is
  'PE-05B5F · Retira un cambio de plan programado mientras no haya llegado su fecha. El precio congelado se va con el: si se vuelve a programar, se congela otra vez con el cambio de ese dia.';
