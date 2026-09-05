-- ===========================================================================
-- Trazaloop · PE-05B6F · El tipo de cambio se administra, y la historia no miente
-- ===========================================================================
--
-- TRES HUECOS QUE B6E DEJÓ A LA VISTA, Y NINGUNO ES DE ADORNO
--
-- 1 · NO HAY MANERA DE PONER UN TIPO DE CAMBIO SIN SQL
--
-- `commercial_fx_rates` existe desde 0169, con su política: escribir es de la
-- administración de plataforma. Pero el GRANT de tabla solo daba `select`, así
-- que la política nunca llegaba a aplicarse: ni un superadministrador podía
-- insertar una fila desde el producto. Una tasa solo entraba por migración o
-- por la herramienta de QA. El día de Producción eso significa que vender
-- depende de que alguien abra una consola de base de datos.
--
-- Y faltaban tres invariantes: dos tasas activas podían solaparse —y entonces
-- «cuál rige hoy» lo decidía un `order by` en vez de una decisión—, una tasa ya
-- usada se podía reescribir, y el estado se ponía a mano en vez de derivarse de
-- las fechas.
--
-- 2 · LA HISTORIA DE COBROS SE INVENTABA EL PLAN
--
-- El historial del cliente deducía el plan de cada cobro mirando la suscripción
-- HOY. Así que una renovación pagada siendo Full pasaba a decir «Extra» en
-- cuanto la empresa subía de plan. Los importes eran correctos —base, descuento
-- e impuesto se congelan en el pago—, pero el plan y la periodicidad no estaban
-- congelados en ninguna parte para las renovaciones: el presupuesto se guarda
-- solo en la contratación y en la subida, y la obligación no llevaba plan.
--
-- Un hecho financiero tiene que poder contarse con lo que se sabía entonces.
-- Por eso la identidad comercial se congela DONDE ESTÁ EL DINERO: en la
-- obligación.
--
-- 3 · UNA SUSCRIPCIÓN VIVA SIN OBLIGACIÓN NO ES NADA
--
-- Quedaron tres suscripciones de QA anteriores a 0172, vivas y sin un solo
-- periodo. El camino de hoy ya crea la obligación en la misma transacción, pero
-- nada lo obligaba. Ahora sí, y solo para los estados VIVOS: un final no
-- necesita una obligación abierta.
-- ===========================================================================

do $$
begin
  if to_regclass('public.commercial_fx_rates') is null
     or to_regclass('public.billing_subscription_periods') is null
     or to_regprocedure('public.billing_open_next_period(uuid)') is null
     or to_regprocedure('public.billing_settle_payment(uuid,text,text,text,text,text)') is null then
    raise exception '0182 presupone 0169, 0172, 0179 y 0181';
  end if;
  raise notice '0182 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · EL TIPO DE CAMBIO NO SE SOLAPA CONSIGO MISMO
-- ---------------------------------------------------------------------------
-- Sin exclusión por rangos —que pediría una extensión— pero con la misma
-- garantía: se comprueba en la propia base, no en quien llama.
create or replace function public.commercial_fx_no_overlap()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_choque uuid;
begin
  if new.status <> 'active' then
    return new;
  end if;
  select id into v_choque from public.commercial_fx_rates
   where base_currency = new.base_currency
     and quote_currency = new.quote_currency
     and status = 'active'
     and id <> new.id
     -- Dos vigencias se solapan si cada una empieza antes de que acabe la otra.
     and new.effective_from < coalesce(effective_to, 'infinity'::timestamptz)
     and effective_from < coalesce(new.effective_to, 'infinity'::timestamptz)
   limit 1;
  if v_choque is not null then
    raise exception 'FX_RATE_OVERLAPS'
      using detail = new.base_currency || '→' || new.quote_currency
                  || ' choca con ' || v_choque::text,
            hint = 'Cierra la vigencia anterior antes de abrir otra: dos tasas activas a la vez dejarían el precio a merced de un orden de lectura.';
  end if;
  return new;
end;
$$;

drop trigger if exists commercial_fx_no_overlap_trg on public.commercial_fx_rates;
create trigger commercial_fx_no_overlap_trg
  before insert or update on public.commercial_fx_rates
  for each row execute function public.commercial_fx_no_overlap();

-- ---------------------------------------------------------------------------
-- 2 · LO QUE YA EMPEZÓ A REGIR NO SE REESCRIBE
-- ---------------------------------------------------------------------------
create or replace function public.commercial_fx_is_append_only()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_usada boolean;
begin
  if tg_op = 'DELETE' then
    -- Historia financiera: no se borra nunca. Ni la que no llegó a usarse, que
    -- también cuenta que alguien la programó.
    raise exception 'FX_RATE_IS_HISTORY'
      using hint = 'Un tipo de cambio se cierra por vigencia o se retira; no se borra.';
  end if;

  v_usada := old.effective_from <= now()
    or exists (select 1 from public.billing_quotes where fx_rate_id = old.id)
    or exists (select 1 from public.billing_subscriptions
                where fx_rate_id = old.id or scheduled_fx_rate_id = old.id)
    or exists (select 1 from public.billing_subscription_changes where fx_rate_id = old.id);

  if v_usada then
    if new.base_currency is distinct from old.base_currency
       or new.quote_currency is distinct from old.quote_currency
       or new.rate_micros is distinct from old.rate_micros
       or new.effective_from is distinct from old.effective_from then
      raise exception 'FX_RATE_IS_IMMUTABLE'
        using hint = 'Ya rigió o ya se usó para poner un precio. Se le pone fin y se abre otra; reescribirla cambiaría un importe que alguien ya vio.';
    end if;
    -- El FIN sí se puede mover mientras no haya llegado: programar una tasa y
    -- luego retirarla devuelve la vigencia a la anterior, y eso es una decisión
    -- legítima. Lo que no se toca es una vigencia que YA terminó: eso es pasado.
    if old.effective_to is not null and old.effective_to <= now()
       and new.effective_to is distinct from old.effective_to then
      raise exception 'FX_RATE_ALREADY_ENDED'
        using detail = old.effective_to::text,
              hint = 'Esa vigencia ya terminó. Lo que se cobró mientras regía no se puede reabrir.';
    end if;
    if new.effective_to is not null and new.effective_to <= old.effective_from then
      raise exception 'FX_RATE_CLOSE_BEFORE_START';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists commercial_fx_is_append_only_trg on public.commercial_fx_rates;
create trigger commercial_fx_is_append_only_trg
  before update or delete on public.commercial_fx_rates
  for each row execute function public.commercial_fx_is_append_only();

comment on function public.commercial_fx_is_append_only() is
  'PE-05B6F · Una tasa que ya rigio —o que ya puso un precio— es historia: se le pone fin, no se reescribe. Y ninguna se borra. Los disparadores lo sostienen porque las politicas no detienen a la llave de servicio.';

-- ---------------------------------------------------------------------------
-- 3 · Y SE ADMINISTRA DESDE EL PRODUCTO
-- ---------------------------------------------------------------------------
-- Lo que faltaba de verdad: el GRANT. La política de 0169 ya decía que escribir
-- es del superadministrador, pero sin `insert`/`update` en la tabla no llegaba
-- a preguntarse. Aun así el producto NO escribe la tabla a mano: usa las tres
-- operaciones de abajo, que son las que comprueban lo que hay que comprobar.
create or replace function public.commercial_fx_create(
  p_base_currency text,
  p_quote_currency text,
  p_rate_micros bigint,
  p_effective_from timestamptz,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_vigente record;
begin
  if not public.is_platform_superadmin() then
    raise exception 'NOT_AUTHORIZED'
      using hint = 'Fijar el tipo de cambio comercial es de la administración de plataforma.';
  end if;
  -- El motor comercial de salida solo convierte USD→COP. Abrir pares que nadie
  -- usa sería ofrecer una palanca que no mueve nada.
  if p_base_currency <> 'USD' or p_quote_currency <> 'COP' then
    raise exception 'FX_PAIR_NOT_SUPPORTED'
      using detail = coalesce(p_base_currency, 'null') || '→' || coalesce(p_quote_currency, 'null'),
            hint = 'Hoy el cobro se hace en COP sobre catálogo en USD.';
  end if;
  if p_rate_micros is null or p_rate_micros <= 0 then
    raise exception 'FX_RATE_INVALID';
  end if;
  if p_effective_from is null then
    raise exception 'FX_EFFECTIVE_FROM_REQUIRED';
  end if;

  -- La que rige ahora, si la hay, se cierra JUSTO cuando empieza la nueva. Ni
  -- un instante de solape, ni un instante sin tasa.
  select id, effective_from, effective_to into v_vigente
    from public.commercial_fx_rates
   where base_currency = p_base_currency and quote_currency = p_quote_currency
     and status = 'active' and effective_to is null
   order by effective_from desc limit 1;

  if v_vigente.id is not null then
    if p_effective_from <= v_vigente.effective_from then
      return jsonb_build_object('status', 'not_after_current',
        'current_effective_from', v_vigente.effective_from);
    end if;
    update public.commercial_fx_rates
       set effective_to = p_effective_from where id = v_vigente.id;
  end if;

  insert into public.commercial_fx_rates (
    base_currency, quote_currency, rate_micros, effective_from, note, created_by)
  values (p_base_currency, p_quote_currency, p_rate_micros, p_effective_from,
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  return jsonb_build_object('status', 'created', 'fx_rate_id', v_id,
    'effective_from', p_effective_from, 'rate_micros', p_rate_micros,
    'closed_previous', v_vigente.id);
end;
$$;

revoke all on function public.commercial_fx_create(text, text, bigint, timestamptz, text)
  from public, anon;
grant execute on function public.commercial_fx_create(text, text, bigint, timestamptz, text)
  to authenticated;

comment on function public.commercial_fx_create(text, text, bigint, timestamptz, text) is
  'PE-05B6F · Abre un tipo de cambio comercial con vigencia, cerrando el anterior justo donde empieza el nuevo: sin solape y sin hueco. Solo administracion de plataforma. Es una tasa ADMINISTRATIVA, no la del mercado.';

-- Retirar una tasa PROGRAMADA que todavía no ha empezado a regir. La que ya
-- rige no se retira: se le pone fin abriendo la siguiente.
create or replace function public.commercial_fx_cancel_scheduled(p_fx_rate_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_r public.commercial_fx_rates%rowtype;
  v_anterior uuid;
begin
  if not public.is_platform_superadmin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select * into v_r from public.commercial_fx_rates where id = p_fx_rate_id for update;
  if not found then
    return jsonb_build_object('status', 'fx_rate_not_found');
  end if;
  if v_r.effective_from <= now() then
    return jsonb_build_object('status', 'already_effective',
      'effective_from', v_r.effective_from);
  end if;
  if v_r.status <> 'active' then
    return jsonb_build_object('status', 'already_retired');
  end if;

  update public.commercial_fx_rates set status = 'retired' where id = v_r.id;

  -- Y la anterior recupera su vigencia abierta: si no, la empresa se quedaría
  -- sin tasa el día en que la programada iba a entrar.
  select id into v_anterior from public.commercial_fx_rates
   where base_currency = v_r.base_currency and quote_currency = v_r.quote_currency
     and status = 'active' and effective_to = v_r.effective_from
   order by effective_from desc limit 1;
  if v_anterior is not null then
    update public.commercial_fx_rates set effective_to = null where id = v_anterior;
  end if;

  return jsonb_build_object('status', 'cancelled', 'fx_rate_id', v_r.id,
    'reopened_previous', v_anterior);
end;
$$;

revoke all on function public.commercial_fx_cancel_scheduled(uuid) from public, anon;
grant execute on function public.commercial_fx_cancel_scheduled(uuid) to authenticated;

comment on function public.commercial_fx_cancel_scheduled(uuid) is
  'PE-05B6F · Retira una tasa PROGRAMADA que aun no rige y devuelve la vigencia abierta a la anterior. La que ya rige no se retira por aqui: se le pone fin abriendo la siguiente.';

-- Cerrar la vigente por vigencia, a sabiendas de que a partir de ese instante
-- NO se podrán fijar precios nuevos. Es una decisión, no un accidente.
create or replace function public.commercial_fx_close_current(
  p_base_currency text,
  p_quote_currency text,
  p_effective_to timestamptz default now()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare v_r public.commercial_fx_rates%rowtype;
begin
  if not public.is_platform_superadmin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select * into v_r from public.commercial_fx_rates
   where base_currency = p_base_currency and quote_currency = p_quote_currency
     and status = 'active' and effective_to is null
     and effective_from <= now()
   order by effective_from desc limit 1;
  if not found then
    return jsonb_build_object('status', 'no_current_rate');
  end if;
  if p_effective_to <= v_r.effective_from then
    return jsonb_build_object('status', 'close_before_start',
      'effective_from', v_r.effective_from);
  end if;

  update public.commercial_fx_rates set effective_to = p_effective_to where id = v_r.id;
  return jsonb_build_object('status', 'closed', 'fx_rate_id', v_r.id,
    'effective_to', p_effective_to);
end;
$$;

revoke all on function public.commercial_fx_close_current(text, text, timestamptz)
  from public, anon;
grant execute on function public.commercial_fx_close_current(text, text, timestamptz)
  to authenticated;

comment on function public.commercial_fx_close_current(text, text, timestamptz) is
  'PE-05B6F · Cierra por vigencia la tasa que rige. A partir de ese instante no se pueden fijar precios nuevos —contratar, cambiar de plan o subir—; renovar sigue funcionando, porque su importe ya estaba congelado.';

-- ---------------------------------------------------------------------------
-- 4 · Y SE VE, CON SU ESTADO DERIVADO DE LAS FECHAS
-- ---------------------------------------------------------------------------
create or replace view public.v_commercial_fx_rates as
  select r.id, r.base_currency, r.quote_currency, r.rate_micros,
         r.effective_from, r.effective_to, r.status, r.note, r.created_at,
         case
           when r.status <> 'active' then 'retirada'
           when r.effective_from > now() then 'programada'
           when r.effective_to is null or r.effective_to > now() then 'vigente'
           else 'historica'
         end as situacion,
         exists (select 1 from public.billing_quotes q where q.fx_rate_id = r.id)
         or exists (select 1 from public.billing_subscriptions s
                     where s.fx_rate_id = r.id or s.scheduled_fx_rate_id = r.id)
         or exists (select 1 from public.billing_subscription_changes c
                     where c.fx_rate_id = r.id) as ya_puso_precios
    from public.commercial_fx_rates r
   where public.is_platform_staff();

revoke all on public.v_commercial_fx_rates from anon;
grant select on public.v_commercial_fx_rates to authenticated;

comment on view public.v_commercial_fx_rates is
  'PE-05B6F · Los tipos de cambio comerciales para la administracion de plataforma, con su situacion DERIVADA de las fechas —vigente, programada, historica, retirada— y si ya pusieron algun precio. El filtro de plataforma vive en la propia vista.';

-- ---------------------------------------------------------------------------
-- 5 · LA OBLIGACIÓN DICE QUÉ SE ESTABA COBRANDO
-- ---------------------------------------------------------------------------
-- La identidad comercial se congela DONDE ESTÁ EL DINERO. Un periodo ya
-- guardaba su base y su moneda; ahora guarda también de qué plan, de qué
-- revisión y de qué periodicidad era esa base. Sin esto, el historial tenía que
-- deducir el plan mirando la suscripción de HOY, y una renovación pagada siendo
-- Full pasaba a decir «Extra» en cuanto la empresa subía.
alter table public.billing_subscription_periods
  add column if not exists plan_code text references public.plans (code);
alter table public.billing_subscription_periods
  add column if not exists plan_revision_id uuid references public.plan_revisions (id);
alter table public.billing_subscription_periods
  add column if not exists billing_interval text;

alter table public.billing_subscription_periods
  drop constraint if exists bsp_interval_value_check;
alter table public.billing_subscription_periods
  add constraint bsp_interval_value_check check (
    billing_interval is null or billing_interval in ('monthly', 'annual'));

comment on column public.billing_subscription_periods.plan_code is
  'PE-05B6F · El plan que se estaba cobrando en ESTA obligacion, congelado al abrirla. Un cambio de plan posterior no lo toca: lo que se pago se pago por lo que habia entonces.';
comment on column public.billing_subscription_periods.billing_interval is
  'PE-05B6F · La periodicidad de ESTA obligacion. Quien pago un anual y luego pasa a mensual sigue teniendo un anual en su historial.';

-- RELLENO HONESTO, Y ESO SIGNIFICA CONSERVADOR
--
-- Solo se rellena lo que se sabe SIN AMBIGÜEDAD. Lo demás se queda vacío y el
-- historial dirá que no consta, que es la verdad. Una columna inmutable con un
-- dato inventado es peor que una vacía: la primera vez que se escribió esto se
-- dedujo el plan del rastro de asignaciones, y en dos obligaciones de QA cuya
-- historia se había movido a mano salió una etiqueta que no correspondía.
--
-- 1 · Lo exacto: la obligación que saldó un pago con presupuesto propio. Ahí la
--     identidad estaba congelada desde 0169 y no hay nada que deducir.
update public.billing_subscription_periods p
   set plan_revision_id = q.plan_revision_id,
       plan_code = q.plan_code,
       billing_interval = q.billing_interval
  from public.billing_payments y
  join public.billing_quotes q on q.id = y.quote_id
 where y.period_id = p.id and p.plan_revision_id is null;

-- 2 · Lo seguro: una suscripción que NUNCA cambió de nivel. Si todo lo que se
--     le vendió apunta a la misma revisión, esa fue su revisión siempre, y la
--     periodicidad de hoy es la de entonces porque cambiarla habría abierto una
--     era nueva —y una era nueva empieza por una obligación nueva—.
update public.billing_subscription_periods p
   set plan_revision_id = s.plan_revision_id,
       plan_code = s.plan_code,
       billing_interval = s.billing_interval
  from public.billing_subscriptions s
 where s.id = p.subscription_id
   and p.plan_revision_id is null
   and s.period_anchor_sequence is not distinct from 1
   and (select count(distinct oa.plan_revision_id)
          from public.organization_plan_assignments oa
         where oa.organization_id = p.organization_id
           and oa.grant_kind = 'sold') <= 1;

-- ---------------------------------------------------------------------------
-- 6 · Y LAS DOS PUERTAS QUE ABREN OBLIGACIONES LA CONGELAN
-- ---------------------------------------------------------------------------
-- Las dos se reconstruyen ENTERAS desde su predecesora —0181 y 0179— y se
-- comparan con ella antes de aplicarlas: en B6E, reescribir una funcion de
-- memoria costo perder dos ramas heredadas que solo cazaron sus pruebas.
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
    period_start, period_end, base_amount, charge_currency,
    -- La identidad comercial de ESTA obligacion, congelada al abrirla. Lo que
    -- pase despues con el plan de la suscripcion ya no la alcanza.
    plan_code, plan_revision_id, billing_interval)
  values (
    p_subscription_id, v_sub.organization_id, v_ultimo.period_sequence + 1,
    (v_lim->>'period_start')::timestamptz, (v_lim->>'period_end')::timestamptz,
    v_sub.base_charge_amount, v_sub.charge_currency,
    v_sub.plan_code, v_sub.plan_revision_id, v_sub.billing_interval)
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
  'PE-05B6F · Abre la obligacion siguiente con el calendario de su era y congela en ella el plan, la revision y la periodicidad que se estan cobrando. Mantiene las ramas de caducidad y de retiro.';

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
    -- La base YA viene descontada. Ahí es donde vive la duración del cupón.
    v_q.base_amount, v_q.charge_currency, v_q.fx_rate_id, v_q.fx_rate_micros,
    'active', v_ini, v_fin, v_fin, v_q.created_by)
  returning id into v_sub;

  insert into public.billing_subscription_periods (
    subscription_id, organization_id, period_sequence, period_start, period_end,
    base_amount, charge_currency, status, settled_payment_id, settled_at,
    -- Y la identidad comercial, que aqui viene del presupuesto: es exactamente
    -- lo que la empresa aceptó pagar.
    plan_code, plan_revision_id, billing_interval)
  values (v_sub, v_q.organization_id, 1, v_ini, v_fin,
          v_q.base_amount, v_q.charge_currency, 'settled', v_pago, now(),
          v_q.plan_code, v_q.plan_revision_id, v_q.billing_interval)
  returning id into v_per;

  update public.billing_payments
     set subscription_id = v_sub, period_id = v_per where id = v_pago;
  update public.billing_quotes
     set status = 'consumed', consumed_at = now(), subscription_id = v_sub
   where id = v_q.id;
  -- El canje queda atado a ESTA suscripción, que es lo que dura.
  if v_q.redemption_id is not null then
    update public.billing_promotion_redemptions
       set subscription_id = v_sub where id = v_q.redemption_id;
  end if;

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

comment on function public.billing_settle_payment(uuid, text, text, text, text, text) is
  'PE-05B6F · Convierte un pago aprobado en suscripcion, obligacion y derecho. La obligacion nace con la identidad comercial del presupuesto congelada dentro.';

-- ---------------------------------------------------------------------------
-- 7 · Y UNA VEZ CONGELADA, NO SE REESCRIBE
-- ---------------------------------------------------------------------------
create or replace function public.billing_period_identity_is_frozen()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.plan_revision_id is not null
     and (new.plan_revision_id is distinct from old.plan_revision_id
          or new.plan_code is distinct from old.plan_code
          or new.billing_interval is distinct from old.billing_interval) then
    raise exception 'PERIOD_IDENTITY_IS_FROZEN'
      using detail = old.id::text,
            hint = 'Lo que se cobró en esa obligación se cobró por el plan que había entonces. Un cambio posterior abre otra obligación; no reescribe esta.';
  end if;
  return new;
end;
$$;

drop trigger if exists billing_period_identity_is_frozen_trg
  on public.billing_subscription_periods;
create trigger billing_period_identity_is_frozen_trg
  before update on public.billing_subscription_periods
  for each row execute function public.billing_period_identity_is_frozen();

comment on function public.billing_period_identity_is_frozen() is
  'PE-05B6F · La identidad comercial de una obligacion se escribe una vez, al abrirla. Un disparador, no una politica: las politicas no detienen a la llave de servicio, y es justamente la llave de servicio la que liquida.';

-- ---------------------------------------------------------------------------
-- 8 · UNA SUSCRIPCIÓN VIVA TIENE SU OBLIGACIÓN
-- ---------------------------------------------------------------------------
-- Quedaron tres suscripciones de QA anteriores a 0172 vivas y sin un solo
-- periodo. El camino de hoy ya las crea juntas, pero nada lo obligaba.
--
-- Se comprueba AL CERRAR LA TRANSACCIÓN, no en la línea del insert: la
-- suscripción y su primera obligación nacen en dos sentencias seguidas, y una
-- comprobación inmediata haría imposible el camino correcto.
--
-- Y solo para los estados VIVOS. Una suscripción caducada, cancelada o retirada
-- no necesita una obligación abierta: su final es parte de la historia.
create or replace function public.billing_live_subscription_has_period()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status not in ('active', 'past_due', 'cancel_at_period_end') then
    return new;
  end if;
  if not exists (select 1 from public.billing_subscription_periods
                  where subscription_id = new.id) then
    raise exception 'SUBSCRIPTION_WITHOUT_PERIOD'
      using detail = new.id::text,
            hint = 'Una suscripción viva sin obligación no puede cobrarse ni renovarse: no hay nada que deber.';
  end if;
  return new;
end;
$$;

drop trigger if exists billing_live_subscription_has_period_trg
  on public.billing_subscriptions;
create constraint trigger billing_live_subscription_has_period_trg
  after insert or update on public.billing_subscriptions
  deferrable initially deferred
  for each row execute function public.billing_live_subscription_has_period();

comment on function public.billing_live_subscription_has_period() is
  'PE-05B6F · Al cerrar la transaccion, una suscripcion VIVA tiene al menos una obligacion. Diferido a proposito: la suscripcion y su primer periodo nacen en dos sentencias seguidas. Los estados terminales quedan fuera: un final no necesita una obligacion abierta.';
