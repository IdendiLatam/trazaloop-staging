-- ===========================================================================
-- Trazaloop · 0176 · Retirar una suscripción sin mentir sobre por qué terminó
-- ===========================================================================
--
-- POR QUÉ HACÍA FALTA
--
-- Hasta hoy una suscripción solo podía terminar de dos maneras, y las dos
-- cuentan una historia concreta: `cancelled` dice que el cliente se fue, y
-- `lapsed` dice que no pagó. Las dos son ciertas cuando ocurren, y las dos
-- serían MENTIRA para el caso que falta.
--
-- Ese caso apareció al construir la prueba real de renovación: una suscripción
-- SINTÉTICA, sana y con su mes pagado corriendo, que hay que sacar de en medio.
-- No se fue nadie y nadie dejó de pagar. Las tres transiciones existentes se
-- negaron, y se negaron BIEN:
--
--     cancelar, sin anunciar   → not_scheduled
--     cancelar, ya anunciada   → not_due · PERIOD_STILL_RUNNING
--     caducar                  → not_due · LAST_PERIOD_SETTLED
--
-- La segunda es la que más importa: cancelar hoy cortaría un mes que está
-- pagado, y esa negativa es la regla comercial funcionando.
--
-- Así que en vez de forzar una de ellas —o peor, un `update` a mano que dejara
-- escrito un motivo falso— nace un hecho propio.
--
-- QUÉ ES, Y QUÉ NO ES
--
-- `retired` es una decisión de PLATAFORMA, excepcional y con nombre: esta
-- suscripción deja de tener efecto comercial desde ahora. No es cancelación, no
-- es impago, no es devolución y no es borrado.
--
-- Y sobre todo: no dice que lo pagado no se pagara. Los periodos, los cobros y
-- las transacciones del proveedor se quedan exactamente como están. Lo único
-- que termina es la EFECTIVIDAD de hoy en adelante.
--
-- POR QUÉ NO LA PUEDE LLAMAR UN CLIENTE
--
-- Porque si pudiera, sería una cancelación sin las reglas de la cancelación:
-- una forma de irse a mitad de un mes pagado sin que el sistema lo discuta. El
-- motivo va acotado a dos valores por eso mismo.
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
  if to_regprocedure('public.billing_cancel_at_period_end(uuid)') is null
     or to_regprocedure('public.commercial_end_paid_assignments(uuid, timestamptz, text)') is null then
    raise exception '0176 presupone 0175';
  end if;
  raise notice '0176 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · EL ESTADO, Y POR QUÉ NO ENTRA EN EL ÍNDICE DE «UNA SOLA VIVA»
-- ---------------------------------------------------------------------------
-- Retirar libera a la empresa: puede volver a contratar por el camino normal.
-- Lo que NO puede es que la retirada vuelva sola, y de eso se encarga que sea
-- terminal en todas las transiciones.
alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_status_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_status_check
  check (status in ('pending', 'active', 'past_due', 'cancel_at_period_end',
                    'cancelled', 'lapsed', 'retired', 'ended', 'manual_review'));

comment on column public.billing_subscriptions.status is
  'PE-05B5D.1 · pending, active, past_due, cancel_at_period_end, cancelled (se fue el cliente), lapsed (no se cobro y se agoto la gracia), retired (decision de plataforma, excepcional), ended y manual_review. Cada final cuenta una historia distinta y por eso no comparten estado.';

-- ---------------------------------------------------------------------------
-- 2 · POR QUÉ SE RETIRÓ · dicho, y guardado
-- ---------------------------------------------------------------------------
-- El motivo no es decoración: es lo que impide que esto se convierta en un
-- atajo para cancelar. Va acotado, y sin él la función no hace nada.
alter table public.billing_subscriptions
  add column if not exists retired_at timestamptz;
alter table public.billing_subscriptions
  add column if not exists retirement_reason_code text;
alter table public.billing_subscriptions
  add column if not exists retirement_reason text;

alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_retirement_shape;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_retirement_shape check (
    (status <> 'retired'
     and retired_at is null and retirement_reason_code is null)
    or
    (status = 'retired'
     and retired_at is not null
     and retirement_reason_code in ('qa_fixture_retirement', 'administrative_correction')
     and retirement_reason is not null
     and length(trim(retirement_reason)) >= 10));

comment on column public.billing_subscriptions.retirement_reason_code is
  'PE-05B5D.1 · Por que se retiro, de una lista CERRADA. Abrirla a motivos comerciales convertiria esto en una cancelacion sin las reglas de la cancelacion.';

-- ---------------------------------------------------------------------------
-- 3 · RETIRAR · una vez, con motivo, y sin tocar lo que ya pasó
-- ---------------------------------------------------------------------------
create or replace function public.billing_retire_subscription(
  p_subscription_id uuid,
  p_reason_code text,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_sub public.billing_subscriptions%rowtype;
  v_cerradas integer;
begin
  if p_reason_code not in ('qa_fixture_retirement', 'administrative_correction') then
    raise exception 'RETIREMENT_REASON_CODE_INVALID'
      using detail = coalesce(p_reason_code, 'null');
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'RETIREMENT_REASON_REQUIRED';
  end if;

  select * into v_sub from public.billing_subscriptions
   where id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;
  if v_sub.status = 'retired' then
    return jsonb_build_object('status', 'already_retired', 'subscription_id', v_sub.id);
  end if;
  -- Solo se retira lo que hoy tiene efecto. Lo ya terminado no se re-termina.
  if v_sub.status not in ('pending', 'active', 'past_due', 'cancel_at_period_end') then
    return jsonb_build_object('status', 'not_live', 'reason', v_sub.status);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('billing:' || v_sub.organization_id::text, 0));

  -- Termina la EFECTIVIDAD, y solo eso. Free ya está debajo y vuelve a regir
  -- sola: conceder otro Free duplicaría lo que existe.
  v_cerradas := public.commercial_end_paid_assignments(
    v_sub.organization_id, now(),
    'Retiro administrativo de la suscripción: ' || trim(p_reason));

  -- NO SE TOCA NADA DE LO QUE YA PASÓ. Ni un periodo, ni un cobro, ni una
  -- transacción del proveedor, ni el medio de pago, ni un módulo. Lo pagado se
  -- pagó, y esta fila no dice lo contrario.
  update public.billing_subscriptions
     set status = 'retired',
         retired_at = now(),
         retirement_reason_code = p_reason_code,
         retirement_reason = trim(p_reason),
         ended_at = now(),
         grace_until = null,
         updated_at = now()
   where id = v_sub.id;

  return jsonb_build_object('status', 'retired', 'subscription_id', v_sub.id,
    'organization_id', v_sub.organization_id,
    'reason_code', p_reason_code, 'closed_assignments', v_cerradas);
end;
$$;

revoke all on function public.billing_retire_subscription(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.billing_retire_subscription(uuid, text, text)
  to service_role;

comment on function public.billing_retire_subscription(uuid, text, text) is
  'PE-05B5D.1 · Retiro ADMINISTRATIVO: la suscripcion deja de tener efecto comercial desde ahora, con motivo acotado y escrito. No es cancelacion —no se fue nadie— ni caducidad —nadie dejo de pagar—. No toca periodos, cobros, transacciones, medio de pago ni modulos: lo pagado se pago. Solo plataforma; ningun rol de producto puede llamarla.';

-- ---------------------------------------------------------------------------
-- 4 · Y NO VUELVE SOLA
-- ---------------------------------------------------------------------------
-- `billing_open_next_period` ya rechaza cualquier estado que no sea vivo, pero
-- una retirada merece decirlo con su nombre: volver es contratar de nuevo, no
-- reanudar.
create or replace function public.billing_open_next_period(p_subscription_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_sub    public.billing_subscriptions%rowtype;
  v_ancla  timestamptz;
  v_ultimo public.billing_subscription_periods%rowtype;
  v_lim    jsonb;
  v_id     uuid;
begin
  select * into v_sub from public.billing_subscriptions where id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;

  if v_sub.status = 'retired' then
    return jsonb_build_object('status', 'retired',
      'reason', 'RETIRED_SUBSCRIPTION_DOES_NOT_RESUME');
  end if;
  if v_sub.status = 'lapsed' then
    return jsonb_build_object('status', 'lapsed',
      'reason', 'REACTIVATION_REQUIRES_NEW_PURCHASE');
  end if;
  if v_sub.status not in ('active', 'past_due', 'cancel_at_period_end') then
    return jsonb_build_object('status', 'subscription_not_live', 'reason', v_sub.status);
  end if;

  select period_start into v_ancla from public.billing_subscription_periods
   where subscription_id = p_subscription_id and period_sequence = 1;
  if v_ancla is null then
    return jsonb_build_object('status', 'anchor_missing');
  end if;

  select * into v_ultimo from public.billing_subscription_periods
   where subscription_id = p_subscription_id
   order by period_sequence desc limit 1;

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

  v_lim := public.billing_period_bounds(v_ancla, v_sub.billing_interval,
                                        v_ultimo.period_sequence + 1);

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

revoke all on function public.billing_open_next_period(uuid) from public, anon, authenticated;
grant execute on function public.billing_open_next_period(uuid) to service_role;
