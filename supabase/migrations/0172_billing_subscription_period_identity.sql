-- ===========================================================================
-- Trazaloop · 0172 · El periodo que hay que pagar, como objeto propio
-- ===========================================================================
--
-- QUÉ SE ROMPIÓ Y CÓMO SE VIO
--
-- Una comprobación pedida a mano encontró dos defectos que ninguna prueba
-- automática habría visto, porque las dos veces «el periodo avanzó»:
--
--  1. LA FECHA DE ANCLAJE ERA LA DEL PAGO. La renovación hacía
--     `current_period_end = now() + 1 mes`. En la prueba real, una suscripción
--     que iba del 4 de septiembre al 4 de octubre se renovó a las 03:42 del
--     mismo 4 de septiembre y quedó… del 4 de septiembre al 4 de OCTUBRE. El
--     derecho avanzó SEIS MINUTOS. Se cobró dos veces y el cliente no recibió
--     el segundo mes.
--
--     Y quien pagara antes de vencer perdía lo que le quedaba: renovar el día 5
--     de un ciclo que acaba el 4 del mes siguiente compraba UN DÍA.
--
--  2. NADA ATABA UNA RENOVACIÓN A UN PERIODO. La identidad del cobro salía de
--     un contador libre en la referencia del proveedor. Dos transacciones
--     distintas para el mismo mes pasaban las dos, y cada una avanzaba el
--     periodo otra vez. La idempotencia por identificador de pago no protege
--     de eso: son dos pagos legítimos y distintos.
--
-- LA PIEZA QUE FALTABA
--
-- Un objeto que represente LO QUE HAY QUE PAGAR, y no lo que se pagó:
-- `billing_subscription_periods`. Es la OBLIGACIÓN COMERCIAL —el mes de
-- servicio—, no un cobro, ni un webhook, ni un reintento, ni nada de ninguna
-- pasarela.
--
-- Con ella, las tres cosas que faltaban salen solas:
--   · el periodo siguiente se calcula ANTES de cobrar, no a partir del cobro;
--   · un periodo se liquida UNA vez, con un candado sobre su fila;
--   · varios intentos de cobro pueden apuntar al MISMO periodo, que es lo que
--     pasa cuando el primero es rechazado y el segundo no.
--
-- EL CALENDARIO
--
-- Cada periodo se calcula desde el ANCLA —el comienzo del periodo 1—, nunca
-- sumando un mes al anterior. Sumar mes a mes deriva y no vuelve:
--
--     incremental   31 ene → 28 feb → 28 mar → 28 abr → 28 may
--     desde el ancla 31 ene → 28 feb → 31 mar → 30 abr → 31 may
--
-- La segunda es la que respeta lo que el cliente contrató. Comprobado
-- ejecutando, y con pruebas que fallan si alguien vuelve a sumar de una en una.
--
-- LO QUE ESTA MIGRACIÓN NO HACE
--
-- No programa nada: sigue sin haber calendario que despierte solo. No toca la
-- historia de QA que dejó el defecto —es la evidencia—. Y no añade ni una
-- columna con nombre de pasarela.
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
  if to_regprocedure('public.billing_record_renewal_payment(text, text, text, text, bigint, text, boolean)') is null then
    raise exception '0172 presupone 0171';
  end if;
  raise notice '0172 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · EL CALENDARIO · siempre desde el ancla
-- ---------------------------------------------------------------------------
-- Devuelve los límites del periodo `p_sequence` de una suscripción cuyo primer
-- periodo empezó en `p_anchor`. La secuencia 1 es el periodo inicial.
--
-- Se calcula con UNA suma desde el ancla —`ancla + (n-1) meses`— y no
-- acumulando. Es la diferencia entre conservar el día 31 y perderlo para
-- siempre en el primer febrero.
create or replace function public.billing_period_bounds(
  p_anchor timestamptz,
  p_interval text,
  p_sequence integer
)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_paso interval;
begin
  if p_sequence is null or p_sequence < 1 then
    raise exception 'PERIOD_SEQUENCE_INVALID' using detail = coalesce(p_sequence::text, 'null');
  end if;
  if p_interval not in ('monthly', 'annual') then
    raise exception 'BILLING_INTERVAL_INVALID' using detail = coalesce(p_interval, 'null');
  end if;

  v_paso := case p_interval when 'monthly' then make_interval(months => 1)
                            else make_interval(years => 1) end;

  return jsonb_build_object(
    'sequence', p_sequence,
    'period_start', p_anchor + (v_paso * (p_sequence - 1)),
    'period_end',   p_anchor + (v_paso * p_sequence));
end;
$$;

revoke all on function public.billing_period_bounds(timestamptz, text, integer) from public, anon;
grant execute on function public.billing_period_bounds(timestamptz, text, integer) to authenticated, service_role;

comment on function public.billing_period_bounds(timestamptz, text, integer) is
  'PE-05B2W3.1 · Limites del periodo N de una suscripcion, SIEMPRE calculados desde el ancla. Sumar un mes al periodo anterior deriva —31 ene, 28 feb, 28 mar, 28 abr— y no vuelve nunca al 31. Desde el ancla se conserva el dia y solo cae al ultimo valido del mes corto.';

-- ---------------------------------------------------------------------------
-- 2 · EL PERIODO · lo que hay que pagar
-- ---------------------------------------------------------------------------
create table if not exists public.billing_subscription_periods (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.billing_subscriptions (id) on delete restrict,
  -- Se repite la empresa a propósito: es lo que permite aislar por inquilino
  -- sin una junta en cada política, y no puede desviarse porque la suscripción
  -- no cambia de dueño.
  organization_id uuid not null references public.organizations (id) on delete restrict,
  period_sequence integer not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  -- La BASE contratada, congelada igual que en la suscripción. El impuesto NO
  -- se congela aquí: se resuelve al cobrar con la regla vigente, que es lo que
  -- permite que una exención futura llegue al siguiente cargo sin tocar el
  -- precio contratado.
  base_amount bigint not null,
  charge_currency text not null,
  status text not null default 'open',
  settled_payment_id uuid references public.billing_payments (id),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint bsp_sequence_check check (period_sequence >= 1),
  constraint bsp_order_check check (period_end > period_start),
  constraint bsp_amount_check check (base_amount > 0),
  constraint bsp_status_check check (status in ('open', 'settled')),
  constraint bsp_settled_shape check ((status = 'settled') = (settled_at is not null))
);

-- DOS invariantes, y las dos en la BASE, no en la aplicación: dos procesos
-- despertando a la vez no pueden crear dos obligaciones para el mismo mes.
create unique index if not exists bsp_sequence_uniq
  on public.billing_subscription_periods (subscription_id, period_sequence);
create unique index if not exists bsp_interval_uniq
  on public.billing_subscription_periods (subscription_id, period_start, period_end);
create index if not exists bsp_open_idx
  on public.billing_subscription_periods (subscription_id, status);

alter table public.billing_subscription_periods enable row level security;

drop policy if exists billing_subscription_periods_read on public.billing_subscription_periods;
create policy billing_subscription_periods_read on public.billing_subscription_periods
  for select to authenticated
  using (public.is_org_admin(organization_id) or public.is_platform_staff());

revoke all on public.billing_subscription_periods from anon;
revoke insert, update, delete, truncate on public.billing_subscription_periods from authenticated, anon;
grant select on public.billing_subscription_periods to authenticated;

comment on table public.billing_subscription_periods is
  'PE-05B2W3.1 · LA OBLIGACION COMERCIAL: el mes (o el ano) de servicio que hay que pagar. No es un cobro, ni un webhook, ni un reintento, ni nada de ninguna pasarela. Existe ANTES de cobrar, y por eso el periodo siguiente ya no se deduce de la fecha del pago.';
comment on column public.billing_subscription_periods.base_amount is
  'PE-05B2W3.1 · La base contratada. El impuesto NO se congela aqui: se resuelve al cobrar con la regla vigente.';

-- ---------------------------------------------------------------------------
-- 3 · EL INTENTO DE COBRO APUNTA A SU PERIODO
-- ---------------------------------------------------------------------------
-- Un periodo puede necesitar VARIOS intentos —el primero rechazado, el segundo
-- con tiempo agotado, el tercero aprobado—, y los tres son intentos de saldar
-- LA MISMA obligación. Modelar el reintento creando otro periodo sería cobrar
-- dos meses por uno.
alter table public.billing_checkout_intents
  add column if not exists period_id uuid references public.billing_subscription_periods (id);
create index if not exists bci_period_idx
  on public.billing_checkout_intents (period_id) where period_id is not null;

comment on column public.billing_checkout_intents.period_id is
  'PE-05B2W3.1 · A que obligacion pertenece este intento. NULO = contratacion inicial. Con valor = renovacion de ese periodo. La RELACION es la autoridad: la referencia que viaja al proveedor solo identifica el intento, no decide nada.';

alter table public.billing_payments
  add column if not exists period_id uuid references public.billing_subscription_periods (id);
create index if not exists billing_payments_period_idx
  on public.billing_payments (period_id) where period_id is not null;

-- ---------------------------------------------------------------------------
-- 4 · ABRIR EL PERIODO SIGUIENTE · antes de cobrar, no después
-- ---------------------------------------------------------------------------
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
  if v_sub.status not in ('active', 'past_due', 'cancel_at_period_end') then
    return jsonb_build_object('status', 'subscription_not_live', 'reason', v_sub.status);
  end if;

  -- El ANCLA es el comienzo del periodo 1. No hace falta una columna nueva:
  -- ya está escrito, y reconstruirlo de ahí es lo que impide que dos sitios
  -- calculen calendarios distintos.
  select period_start into v_ancla from public.billing_subscription_periods
   where subscription_id = p_subscription_id and period_sequence = 1;
  if v_ancla is null then
    return jsonb_build_object('status', 'anchor_missing');
  end if;

  select * into v_ultimo from public.billing_subscription_periods
   where subscription_id = p_subscription_id
   order by period_sequence desc limit 1;

  -- SI EL ÚLTIMO SIGUE SIN PAGAR, ES ESE. Abrir otro sería reclamar dos meses
  -- teniendo uno pendiente.
  if v_ultimo.status = 'open' then
    return jsonb_build_object('status', 'open', 'period_id', v_ultimo.id,
      'period_sequence', v_ultimo.period_sequence, 'reused', true,
      'period_start', v_ultimo.period_start, 'period_end', v_ultimo.period_end,
      'base_amount', v_ultimo.base_amount, 'charge_currency', v_ultimo.charge_currency);
  end if;

  -- LOS TRES ESTADOS. Al día o por adelantado, y también DENTRO DE LA GRACIA,
  -- el periodo nuevo empieza donde acababa el anterior: durante la gracia el
  -- derecho siguió disponible, así que el calendario comercial no se mueve.
  --
  -- Pasada la gracia es otra cosa. La empresa cayó a Free y volver no es
  -- «renovar»: es contratar de nuevo, con su propia decisión comercial. Aquí
  -- se falla cerrado en vez de inventar un periodo que empiece hoy.
  if now() > v_ultimo.period_end
     and (v_sub.grace_until is null or now() > v_sub.grace_until) then
    return jsonb_build_object('status', 'lapsed',
      'period_end', v_ultimo.period_end, 'grace_until', v_sub.grace_until,
      'reason', 'REACTIVATION_REQUIRES_NEW_PURCHASE');
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
    -- Dos procesos a la vez: gana uno, y el otro se encuentra el mismo periodo.
    select id into v_id from public.billing_subscription_periods
     where subscription_id = p_subscription_id
       and period_sequence = v_ultimo.period_sequence + 1;
    return jsonb_build_object('status', 'open', 'period_id', v_id,
      'period_sequence', v_ultimo.period_sequence + 1, 'reused', true,
      'period_start', v_lim->>'period_start', 'period_end', v_lim->>'period_end',
      'base_amount', v_sub.base_charge_amount, 'charge_currency', v_sub.charge_currency);
  end if;

  return jsonb_build_object('status', 'open', 'period_id', v_id,
    'period_sequence', v_ultimo.period_sequence + 1, 'reused', false,
    'period_start', v_lim->>'period_start', 'period_end', v_lim->>'period_end',
    'base_amount', v_sub.base_charge_amount, 'charge_currency', v_sub.charge_currency);
end;
$$;

revoke all on function public.billing_open_next_period(uuid) from public, anon, authenticated;
grant execute on function public.billing_open_next_period(uuid) to service_role;

comment on function public.billing_open_next_period(uuid) is
  'PE-05B2W3.1 · Abre la obligacion del periodo siguiente ANTES de cobrar. Al dia, por adelantado y dentro de la gracia empieza donde acabo el anterior; pasada la gracia falla cerrado, porque volver de Free no es renovar sino contratar. Idempotente y a prueba de dos procesos simultaneos.';

-- ---------------------------------------------------------------------------
-- 5 · LA CONTRATACIÓN ABRE EL PERIODO 1
-- ---------------------------------------------------------------------------
-- Se redefine la primitiva de B1 para que el periodo inicial exista como
-- objeto desde el principio. Sin esto no habría ancla, y el calendario volvería
-- a depender de cuándo se pagó.
create or replace function public.billing_settle_payment(
  p_quote_id uuid, p_provider text, p_provider_payment_id text, p_outcome text,
  p_idempotency_key text default null, p_failure_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_q     public.billing_quotes%rowtype;
  v_ya    public.billing_payments%rowtype;
  v_pago  uuid;
  v_sub   uuid;
  v_mod   record;
  v_aplicados int := 0;
  v_ini   timestamptz;
  v_fin   timestamptz;
  v_per   uuid;
begin
  if p_outcome not in ('approved', 'declined', 'failed') then
    raise exception 'PAYMENT_OUTCOME_INVALID' using detail = coalesce(p_outcome, 'null');
  end if;

  select * into v_q from public.billing_quotes where id = p_quote_id for update;
  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended('billing:' || v_q.organization_id::text, 0));

  if p_provider_payment_id is not null then
    select * into v_ya from public.billing_payments
     where provider = p_provider and provider_payment_id = p_provider_payment_id;
    if found then
      return jsonb_build_object('payment_id', v_ya.id, 'status', v_ya.status,
                                'subscription_id', v_ya.subscription_id, 'already_settled', true);
    end if;
  end if;

  if v_q.status = 'consumed' then
    return jsonb_build_object('status', 'already_consumed', 'quote_id', v_q.id,
                              'subscription_id', v_q.subscription_id, 'already_settled', true);
  end if;
  if v_q.status <> 'open' then
    raise exception 'QUOTE_NOT_OPEN' using detail = v_q.status;
  end if;
  if v_q.expires_at <= now() then
    update public.billing_quotes set status = 'expired' where id = v_q.id;
    raise exception 'QUOTE_EXPIRED';
  end if;

  insert into public.billing_payments (
    organization_id, quote_id, provider, provider_payment_id,
    base_amount, discount_amount, service_class, tax_rule_id,
    tax_rate_basis_points, tax_amount, total_amount, currency, fx_rate_micros,
    status, paid_at, failed_at, failure_reason, idempotency_key)
  values (
    v_q.organization_id, v_q.id, p_provider, p_provider_payment_id,
    v_q.base_amount, v_q.discount_amount, v_q.service_class, v_q.tax_rule_id,
    v_q.tax_rate_basis_points, v_q.tax_amount, v_q.total_amount,
    v_q.charge_currency, v_q.fx_rate_micros,
    case p_outcome when 'approved' then 'approved' when 'declined' then 'declined' else 'failed' end,
    case when p_outcome = 'approved' then now() end,
    case when p_outcome <> 'approved' then now() end,
    p_failure_reason, p_idempotency_key)
  returning id into v_pago;

  if p_outcome <> 'approved' then
    return jsonb_build_object('payment_id', v_pago, 'status', p_outcome,
                              'subscription_id', null, 'already_settled', false);
  end if;

  -- EL ANCLA nace aquí, y de una sola forma.
  v_ini := now();
  v_fin := (public.billing_period_bounds(v_ini, v_q.billing_interval, 1)->>'period_end')::timestamptz;

  insert into public.billing_subscriptions (
    organization_id, provider, plan_code, plan_revision_id, billing_interval,
    catalog_amount_minor, catalog_currency, base_charge_amount, charge_currency,
    fx_rate_id, fx_rate_micros, status,
    current_period_start, current_period_end, renews_at, created_by)
  values (
    v_q.organization_id, p_provider, v_q.plan_code, v_q.plan_revision_id, v_q.billing_interval,
    v_q.catalog_amount_minor, v_q.catalog_currency,
    v_q.base_amount, v_q.charge_currency, v_q.fx_rate_id, v_q.fx_rate_micros,
    'active', v_ini, v_fin, v_fin, v_q.created_by)
  returning id into v_sub;

  -- Y el periodo 1, ya saldado por este mismo cobro.
  insert into public.billing_subscription_periods (
    subscription_id, organization_id, period_sequence, period_start, period_end,
    base_amount, charge_currency, status, settled_payment_id, settled_at)
  values (v_sub, v_q.organization_id, 1, v_ini, v_fin,
          v_q.base_amount, v_q.charge_currency, 'settled', v_pago, now())
  returning id into v_per;

  update public.billing_payments
     set subscription_id = v_sub, period_id = v_per where id = v_pago;
  update public.billing_quotes
     set status = 'consumed', consumed_at = now(), subscription_id = v_sub
   where id = v_q.id;

  for v_mod in
    select om.module_code from public.organization_modules om
      join public.modules m on m.code = om.module_code
     where om.organization_id = v_q.organization_id
       and om.enabled and coalesce(m.is_functional, false)
  loop
    perform public.commercial_apply_assignment(
      v_q.organization_id, v_q.plan_revision_id, 'module', v_mod.module_code,
      'sold', 'checkout', now(), null,
      'Plan ' || v_q.plan_code || ' contratado por la empresa.', v_q.created_by);
    v_aplicados := v_aplicados + 1;
  end loop;

  return jsonb_build_object('payment_id', v_pago, 'status', 'approved',
    'subscription_id', v_sub, 'period_id', v_per,
    'modules_granted', v_aplicados, 'already_settled', false);
end;
$$;

revoke all on function public.billing_settle_payment(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.billing_settle_payment(uuid, text, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6 · SALDAR UN PERIODO · una vez, y el dinero de más no se pierde
-- ---------------------------------------------------------------------------
create or replace function public.billing_settle_period_payment(
  p_period_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_outcome text,
  p_amount bigint,
  p_currency text,
  p_live_mode boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_per   public.billing_subscription_periods%rowtype;
  v_sub   public.billing_subscriptions%rowtype;
  v_ya    public.billing_payments%rowtype;
  v_regla jsonb;
  v_imp   bigint;
  v_total bigint;
  v_pago  uuid;
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
        'subscription_id', v_ya.subscription_id, 'period_id', v_ya.period_id,
        'organization_id', v_ya.organization_id);
    end if;
  end if;

  -- CANDADO SOBRE LA OBLIGACIÓN. Es lo que hace que se salde una sola vez
  -- aunque lleguen dos pagos distintos a la vez.
  select * into v_per from public.billing_subscription_periods
   where id = p_period_id for update;
  if not found then
    return jsonb_build_object('outcome', 'period_not_found');
  end if;

  select * into v_sub from public.billing_subscriptions
   where id = v_per.subscription_id for update;
  if not found then
    return jsonb_build_object('outcome', 'subscription_not_found');
  end if;

  if p_live_mode is null then
    return jsonb_build_object('outcome', 'environment_mismatch',
      'organization_id', v_per.organization_id);
  end if;

  -- El impuesto, con la regla VIGENTE. La base viene congelada del periodo.
  v_regla := public.billing_resolve_tax_rule('self_service_saas', now(), 'CO');
  if v_regla->>'status' <> 'found' then
    return jsonb_build_object('outcome', 'tax_unresolved', 'reason', v_regla->>'reason',
      'organization_id', v_per.organization_id);
  end if;
  v_imp := public.billing_tax_amount(v_per.base_amount,
                                     (v_regla->>'rate_basis_points')::integer);
  v_total := v_per.base_amount + v_imp;

  if p_outcome = 'approved' then
    if p_currency is null or upper(p_currency) <> upper(v_per.charge_currency)
       or p_amount is null or p_amount <> v_total then
      return jsonb_build_object('outcome', 'reconciliation_mismatch',
        'expected', v_total, 'received', p_amount,
        'organization_id', v_per.organization_id);
    end if;
  end if;

  -- El cobro se anota SIEMPRE: también el rechazado, y también el que llega de
  -- más. Un periodo ya saldado no vuelve a avanzar el derecho, pero el dinero
  -- que se movió no puede desaparecer del libro.
  insert into public.billing_payments (
    organization_id, subscription_id, period_id, quote_id, provider, provider_payment_id,
    base_amount, discount_amount, service_class, tax_rule_id,
    tax_rate_basis_points, tax_amount, total_amount, currency, fx_rate_micros,
    status, paid_at, failed_at, idempotency_key)
  values (
    v_per.organization_id, v_sub.id, v_per.id, null, p_provider, p_provider_payment_id,
    v_per.base_amount, 0, 'self_service_saas', (v_regla->>'tax_rule_id')::uuid,
    (v_regla->>'rate_basis_points')::integer, v_imp, v_total,
    v_per.charge_currency, v_sub.fx_rate_micros,
    case p_outcome when 'approved' then 'approved' when 'declined' then 'declined' else 'failed' end,
    case when p_outcome = 'approved' then now() end,
    case when p_outcome <> 'approved' then now() end,
    'period:' || v_per.id::text || ':' || coalesce(p_provider_payment_id, gen_random_uuid()::text))
  returning id into v_pago;

  if p_outcome <> 'approved' then
    return jsonb_build_object('outcome', p_outcome, 'payment_id', v_pago,
      'period_id', v_per.id, 'subscription_id', v_sub.id,
      'organization_id', v_per.organization_id);
  end if;

  -- YA SALDADO. El pago queda registrado y marcado para que lo mire una
  -- persona; el derecho NO avanza otra vez.
  if v_per.status = 'settled' then
    update public.billing_payments set status = 'manual_review' where id = v_pago;
    return jsonb_build_object('outcome', 'period_already_settled',
      'payment_id', v_pago, 'period_id', v_per.id, 'subscription_id', v_sub.id,
      'organization_id', v_per.organization_id);
  end if;

  update public.billing_subscription_periods
     set status = 'settled', settled_payment_id = v_pago, settled_at = now()
   where id = v_per.id;

  -- El derecho se extiende AL PERIODO QUE YA ESTABA DEFINIDO. El pago no
  -- inventa un rango de fechas.
  update public.billing_subscriptions
     set current_period_start = v_per.period_start,
         current_period_end = v_per.period_end,
         renews_at = v_per.period_end,
         status = case when status = 'past_due' then 'active' else status end,
         grace_until = null,
         updated_at = now()
   where id = v_sub.id;

  return jsonb_build_object('outcome', 'renewed', 'payment_id', v_pago,
    'period_id', v_per.id, 'period_sequence', v_per.period_sequence,
    'subscription_id', v_sub.id, 'organization_id', v_per.organization_id,
    'period_start', v_per.period_start, 'period_end', v_per.period_end,
    'total_amount', v_total);
end;
$$;

revoke all on function public.billing_settle_period_payment(
  uuid, text, text, text, bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.billing_settle_period_payment(
  uuid, text, text, text, bigint, text, boolean) to service_role;

comment on function public.billing_settle_period_payment(uuid, text, text, text, bigint, text, boolean) is
  'PE-05B2W3.1 · Salda UNA obligacion de periodo, con candado sobre su fila. El derecho se extiende al periodo YA DEFINIDO: el pago no inventa fechas. Un segundo pago aprobado para un periodo ya saldado se ANOTA y va a revision, pero no vuelve a avanzar nada.';
