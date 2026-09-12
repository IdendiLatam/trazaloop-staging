-- ===========================================================================
-- Trazaloop · PROD-LAUNCH-01B · Pago único, asentamiento manual y modo de
-- renovación
-- ===========================================================================
--
-- DE DÓNDE SALE ESTA MIGRACIÓN
--
-- El lanzamiento comercial no puede esperar a la recurrencia automática. La
-- suscripción de Mercado Pago quedó bloqueada por su soporte —una credencial
-- de prueba de la aplicación 3944173067958336 crea recursos bajo otra
-- aplicación, 685221457097068, y las notificaciones no llegan— y Wompi no
-- tiene credenciales en Producción. Pero el producto sí puede venderse: Full
-- mensual y anual como PAGO ÚNICO RENOVABLE.
--
-- Esta migración añade lo justo para eso. Nada más.
--
--
-- LO QUE NO SE VUELVE A ESCRIBIR
--
-- La verdad financiera ya existe y no se toca:
--
--   · `billing_settle_payment`      crea pago + suscripción + periodo 1
--   · `billing_open_next_period`    abre el periodo N+1 anclado a la ERA de la
--                                   suscripción (`period_anchor_at`), no a
--                                   `now()`
--   · `billing_settle_period_payment` liquida ese periodo validando importe y
--                                   moneda contra lo que el periodo debe
--
-- Que el ancla sea la era y no la fecha de pago es justo lo que hace que
-- renovar antes de vencer NO regale días al proveedor ni se los quite al
-- cliente: quien vence el 12 de octubre y paga el 5 recibe 12/oct → 12/nov.
-- Eso ya estaba resuelto desde 0170; aquí solo se usa.
--
-- Y `provider` es texto libre en pagos, suscripciones e intentos. No hizo
-- falta ningún enum nuevo para que exista un proveedor llamado `manual`: el
-- modelo ya lo admitía.
--
--
-- 1 · POR QUÉ UNA TABLA NUEVA Y NO OTRA COLUMNA EN `billing_checkout_intents`
--
-- El intento de contratación existe para el carril con tarjeta: exige
-- `quote_id` NOT NULL y guarda el estado del objeto del proveedor. Una
-- RENOVACIÓN no tiene presupuesto propio —su importe sale del periodo, que ya
-- lo congeló— y una preferencia de Checkout Pro no es una suscripción del
-- proveedor.
--
-- Meterlo ahí obligaba a hacer `quote_id` opcional, y esa columna es NOT NULL
-- precisamente porque un cobro sin presupuesto es un cobro sin precio
-- acordado. Aflojar esa restricción para todos, para poder guardar dos
-- columnas de otra cosa, es pagar en garantías lo que se ahorra en tablas.
--
-- `billing_one_time_checkouts` correlaciona UNA preferencia de pago único con
-- UN destino: o un presupuesto (primera compra) o un periodo (renovación).
-- Exactamente uno de los dos. Su `id` es la referencia externa que viaja al
-- proveedor, así que la vuelta del pago se resuelve sin adivinar nada.
--
--
-- 2 · LA URL DE RETORNO NO PRUEBA UN PAGO
--
-- Nada de lo que llega por el navegador activa un plan. Ni la vuelta de
-- Mercado Pago, ni un parámetro `status=approved`, ni el aviso del webhook.
-- La activación depende de `billing_settle_one_time_checkout`, que solo se
-- llama con un pago YA LEÍDO del proveedor por el servidor, y que vuelve a
-- comprobar aquí lo que el servidor ya comprobó: aprobado, referencia
-- externa, importe y moneda. Falla cerrado en los cuatro.
--
-- El webhook deja de ser requisito para activar. Sigue sirviendo —llega
-- antes y evita que alguien tenga que pulsar «ya pagué»—, pero si no llega,
-- el plan se activa igual en cuanto alguien pregunte.
--
--
-- 3 · MODO DE RENOVACIÓN: TRES, NO DOS
--
-- El brief pedía `manual` y `provider`. Son dos de los tres que ya existen en
-- este producto, y llamar `manual` a lo de Wompi sería mentir:
--
--   · `manual`   — vuelve a pagar la empresa. Checkout Pro de un solo pago, o
--                  un pago registrado a mano por la plataforma.
--   · `platform` — Trazaloop cobra la tarjeta guardada. Es Wompi hoy.
--   · `provider` — el proveedor cobra por su cuenta. Será Mercado Pago
--                  Subscriptions cuando su soporte responda.
--
-- Los tres terminan en el MISMO asentamiento canónico. Esa es la razón de
-- nombrarlos ahora aunque solo se implemente el primero: cuando llegue la
-- recurrencia, lo que cambia es quién dispara el cobro, no qué pasa después.
--
-- El relleno NO usa `billing_renewal_owner`: esa función lee
-- `billing_provider_capabilities`, que es de 0184 y no existe en Producción.
-- Una migración que se va a aplicar sobre Producción no puede depender de una
-- tabla que allí no está.
--
--
-- PRODUCCIÓN. Aditiva: ni una fila de cliente cambia de significado. Lo único
-- que se escribe sobre datos existentes es `renewal_mode` en las
-- suscripciones que ya hay, y se escribe con el valor que ya describía su
-- comportamiento real.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0 · PRECONDICIONES
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.billing_quotes') is null
     or to_regclass('public.billing_subscriptions') is null
     or to_regclass('public.billing_subscription_periods') is null
     or to_regclass('public.billing_payments') is null then
    raise exception '0190 presupone el marco de facturación de 0162';
  end if;
  if to_regprocedure('public.billing_settle_payment(uuid,text,text,text,text,text)') is null then
    raise exception '0190 presupone billing_settle_payment';
  end if;
  if to_regprocedure(
       'public.billing_settle_period_payment(uuid,text,text,text,bigint,text,boolean)') is null then
    raise exception '0190 presupone billing_settle_period_payment de 0170';
  end if;
  if to_regprocedure('public.billing_open_next_period(uuid)') is null then
    raise exception '0190 presupone billing_open_next_period de 0170';
  end if;
  if to_regprocedure('public.is_platform_superadmin()') is null then
    raise exception '0190 presupone is_platform_superadmin';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1 · QUIÉN RENUEVA CADA SUSCRIPCIÓN
-- ---------------------------------------------------------------------------
alter table public.billing_subscriptions
  add column if not exists renewal_mode text not null default 'manual';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.billing_subscriptions'::regclass
                    and conname = 'billing_subscriptions_renewal_mode_check') then
    alter table public.billing_subscriptions
      add constraint billing_subscriptions_renewal_mode_check
      check (renewal_mode in ('manual', 'platform', 'provider'));
  end if;
end $$;

-- Lo que YA existía se describe como lo que YA hacía. Wompi lo cobra la
-- plataforma con la tarjeta guardada; Mercado Pago lo cobra el proveedor.
update public.billing_subscriptions set renewal_mode = 'platform'
 where provider = 'wompi' and renewal_mode = 'manual';
update public.billing_subscriptions set renewal_mode = 'provider'
 where provider = 'mercadopago' and renewal_mode = 'manual';

comment on column public.billing_subscriptions.renewal_mode is
  'Quién dispara la renovación: manual (paga la empresa otra vez), platform '
  '(Trazaloop cobra la tarjeta guardada) o provider (el proveedor cobra solo). '
  'Los tres terminan en el mismo asentamiento canónico.';

-- ---------------------------------------------------------------------------
-- 2 · AUDITORÍA DEL PAGO REGISTRADO A MANO
-- ---------------------------------------------------------------------------
--
-- Un pago manual sin constancia de quién lo registró y por qué es peor que no
-- tenerlo: parece verdad financiera y no se puede auditar. Estas columnas son
-- opcionales para el resto de proveedores y OBLIGATORIAS para `manual`.
alter table public.billing_payments
  add column if not exists recorded_by uuid references auth.users(id),
  add column if not exists recorded_reason text,
  add column if not exists manual_reference text,
  add column if not exists manual_evidence text,
  add column if not exists manual_paid_at timestamptz;

-- ES UN INVARIANTE DIFERIDO, Y TIENE QUE SERLO.
--
-- Un CHECK se evalúa en el INSERT, y el pago lo inserta
-- `billing_settle_payment`, que no sabe nada de referencias manuales ni tiene
-- por qué saberlo: su trabajo es la verdad financiera, no la procedencia del
-- dinero. La auditoría se completa un instante después, en la misma
-- transacción. Con un CHECK eso es imposible; con un disparador de restricción
-- diferido, la comprobación ocurre al confirmar —cuando ya está todo— y sigue
-- siendo imposible dejar un pago manual sin firmar.
--
-- Se probó primero con CHECK y falló exactamente así. Queda escrito para que
-- nadie lo «simplifique» de vuelta.
create or replace function public.billing_payment_manual_is_signed()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_p public.billing_payments%rowtype;
begin
  -- SE RELEE LA FILA. No se mira `new`.
  --
  -- Un AFTER diferido conserva el `new` del momento en que se disparó, no el
  -- estado al confirmar. Mirando `new` este invariante rechazaba el caso
  -- normal —insertar el pago y firmarlo un instante después, en la misma
  -- transacción— que es justo para lo que se diseñó. Releer la fila es lo que
  -- lo convierte en un invariante de fin de transacción de verdad.
  select * into v_p from public.billing_payments where id = new.id;
  if not found then return null; end if;            -- borrado antes de confirmar
  if v_p.provider <> 'manual' then return null; end if;
  if v_p.recorded_by is null
     or v_p.manual_reference is null or length(trim(v_p.manual_reference)) < 3
     or v_p.recorded_reason is null or length(trim(v_p.recorded_reason)) < 10 then
    raise exception 'MANUAL_PAYMENT_NOT_SIGNED'
      using detail = 'pago ' || v_p.id::text,
            hint = 'Un pago manual necesita quién lo registró, su referencia y su motivo.';
  end if;
  return null;
end $$;

drop trigger if exists t_billing_payment_manual_signed on public.billing_payments;
create constraint trigger t_billing_payment_manual_signed
  after insert or update on public.billing_payments
  deferrable initially deferred
  for each row execute function public.billing_payment_manual_is_signed();

comment on column public.billing_payments.manual_paid_at is
  'Cuándo se pagó DE VERDAD fuera de Trazaloop. `paid_at` sigue siendo cuándo '
  'lo asentó el sistema: son dos hechos distintos y confundirlos falsea la '
  'antigüedad de un cobro.';

-- ---------------------------------------------------------------------------
-- 3 · LA CORRELACIÓN DE UN PAGO ÚNICO
-- ---------------------------------------------------------------------------
create table if not exists public.billing_one_time_checkouts (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  provider              text not null,
  environment           text not null,
  purpose               text not null,
  quote_id              uuid references public.billing_quotes(id),
  period_id             uuid references public.billing_subscription_periods(id),
  expected_total_amount bigint not null,
  expected_currency     text not null,
  provider_preference_id text,
  init_point            text,
  status                text not null default 'created',
  verified_payment_id   text,
  settled_payment_id    uuid references public.billing_payments(id),
  failure_reason        text,
  created_by            uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint botc_environment_check check (environment in ('test', 'live')),
  constraint botc_purpose_check     check (purpose in ('initial', 'renewal')),
  constraint botc_amount_check      check (expected_total_amount > 0),
  constraint botc_status_check      check (status in (
    'created', 'provider_created', 'settled', 'failed', 'cancelled', 'expired')),
  -- EXACTAMENTE UN DESTINO. Un cobro que apunta a dos sitios, o a ninguno, no
  -- se puede asentar sin adivinar cuál era.
  constraint botc_target_shape check (
    (purpose = 'initial'  and quote_id is not null and period_id is null) or
    (purpose = 'renewal'  and period_id is not null and quote_id is null)
  )
);

comment on table public.billing_one_time_checkouts is
  'Una preferencia de pago único correlacionada con su destino: un presupuesto '
  '(primera compra) o un periodo (renovación). Su id es la referencia externa '
  'que viaja al proveedor.';

-- La misma preferencia no puede corresponder a dos cobros.
create unique index if not exists botc_preference_uniq
  on public.billing_one_time_checkouts (provider, provider_preference_id)
  where provider_preference_id is not null;

-- Y el mismo pago del proveedor no puede asentar dos cobros. Esta es la
-- idempotencia de verdad: la de «ya pagué, verifica» pulsado siete veces.
create unique index if not exists botc_payment_uniq
  on public.billing_one_time_checkouts (provider, verified_payment_id)
  where verified_payment_id is not null;

create index if not exists botc_org_idx
  on public.billing_one_time_checkouts (organization_id, created_at desc);

alter table public.billing_one_time_checkouts enable row level security;

-- Quien administra la empresa ve sus propios cobros. La plataforma ve todos.
-- NADIE escribe por RLS: se escribe por las primitivas de abajo, que son
-- SECURITY DEFINER y comprueban lo que hay que comprobar.
drop policy if exists botc_select_own on public.billing_one_time_checkouts;
create policy botc_select_own on public.billing_one_time_checkouts
  for select to authenticated
  using (public.has_org_role(organization_id, array['admin'])
         or public.is_platform_staff());

revoke all on public.billing_one_time_checkouts from anon, authenticated, service_role;
grant select on public.billing_one_time_checkouts to authenticated, service_role;

create trigger t_botc_updated before update on public.billing_one_time_checkouts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4 · EL PRESUPUESTO TAMBIÉN LO PUEDE ABRIR LA PLATAFORMA
-- ---------------------------------------------------------------------------
--
-- `billing_create_quote` exigía ser administrador DE LA EMPRESA. Para
-- registrar un pago hecho por transferencia hace falta abrir el presupuesto
-- en nombre de esa empresa, y quien lo hace es el superadministrador.
--
-- La alternativa era que el asentamiento manual calculara el precio por su
-- cuenta: catálogo, descuento, tasa de cambio, IVA. Eso es duplicar la lógica
-- financiera en un segundo sitio que envejecerá distinto del primero. Se
-- prefiere ensanchar QUIÉN puede pedir el presupuesto antes que tener dos
-- respuestas posibles a cuánto cuesta un plan.
--
-- Solo cambia la línea de autorización. El precio, los impuestos, la tasa y
-- el cupón se calculan exactamente igual que antes.
do $$
declare v_def text;
begin
  select pg_get_functiondef(
           'public.billing_create_quote(uuid,text,text,text)'::regprocedure)
    into v_def;

  if position('is_platform_superadmin()' in v_def) > 0 then
    return; -- ya ensanchada; la migración es reejecutable
  end if;

  v_def := replace(
    v_def,
    'if not public.has_org_role(p_organization_id, array[''admin'']) then',
    'if not (public.has_org_role(p_organization_id, array[''admin''])'
    || ' or public.is_platform_superadmin()) then');

  if position('is_platform_superadmin()' in v_def) = 0 then
    raise exception
      '0190 no pudo ensanchar billing_create_quote: la comprobación de rol cambió de forma';
  end if;

  execute v_def;
end $$;

-- ---------------------------------------------------------------------------
-- 5 · ABRIR UN COBRO ÚNICO
-- ---------------------------------------------------------------------------
create or replace function public.billing_open_one_time_checkout(
  p_purpose text,
  p_target_id uuid,
  p_provider text,
  p_environment text
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_q    public.billing_quotes%rowtype;
  v_per  public.billing_subscription_periods%rowtype;
  v_sub  public.billing_subscriptions%rowtype;
  v_org  uuid;
  v_tot  bigint;
  v_mon  text;
  v_id   uuid;
  v_prev public.billing_one_time_checkouts%rowtype;
  v_cargo jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_purpose not in ('initial', 'renewal') then
    raise exception 'CHECKOUT_PURPOSE_INVALID' using detail = coalesce(p_purpose, 'null');
  end if;
  if p_environment not in ('test', 'live') then
    raise exception 'CHECKOUT_ENVIRONMENT_INVALID' using detail = coalesce(p_environment, 'null');
  end if;
  if coalesce(trim(p_provider), '') = '' then
    raise exception 'CHECKOUT_PROVIDER_REQUIRED';
  end if;

  if p_purpose = 'initial' then
    select * into v_q from public.billing_quotes where id = p_target_id;
    if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
    if v_q.status <> 'open' then
      raise exception 'QUOTE_NOT_OPEN' using detail = v_q.status;
    end if;
    if v_q.expires_at <= now() then raise exception 'QUOTE_EXPIRED'; end if;
    v_org := v_q.organization_id; v_tot := v_q.total_amount; v_mon := v_q.charge_currency;
  else
    select * into v_per from public.billing_subscription_periods where id = p_target_id;
    if not found then raise exception 'PERIOD_NOT_FOUND'; end if;
    if v_per.status <> 'open' then
      raise exception 'PERIOD_NOT_OPEN' using detail = v_per.status;
    end if;
    select * into v_sub from public.billing_subscriptions where id = v_per.subscription_id;
    if not found then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;
    -- El importe de una renovación NO se recalcula: lo dice el periodo, que ya
    -- congeló su identidad comercial. Preguntarlo otra vez al catálogo sería
    -- cobrar el precio de hoy por un periodo pactado ayer.
    v_cargo := public.billing_period_charge_total(v_per.id);
    if v_cargo->>'status' <> 'found' then
      raise exception 'PERIOD_CHARGE_UNAVAILABLE' using detail = coalesce(v_cargo->>'status', 'null');
    end if;
    v_org := v_per.organization_id;
    v_tot := (v_cargo->>'total_amount')::bigint;
    v_mon := v_per.charge_currency;
  end if;

  if not (public.has_org_role(v_org, array['admin']) or public.is_platform_superadmin()) then
    raise exception 'NOT_AUTHORIZED'
      using hint = 'Solo quien administra la empresa puede pagar un plan.';
  end if;

  -- REUTILIZAR ANTES QUE DUPLICAR. Pulsar «pagar» dos veces no puede abrir dos
  -- cobros del mismo destino: el segundo dejaría una preferencia huérfana
  -- viva, y el cliente podría pagar la que no se está mirando.
  select * into v_prev from public.billing_one_time_checkouts
   where provider = p_provider
     and status in ('created', 'provider_created')
     and ((p_purpose = 'initial' and quote_id = p_target_id)
       or (p_purpose = 'renewal' and period_id = p_target_id))
   order by created_at desc limit 1;
  if found then
    return jsonb_build_object('checkout_id', v_prev.id, 'status', v_prev.status,
      'reused', true, 'init_point', v_prev.init_point,
      'expected_total_amount', v_prev.expected_total_amount,
      'expected_currency', v_prev.expected_currency);
  end if;

  insert into public.billing_one_time_checkouts (
    organization_id, provider, environment, purpose,
    quote_id, period_id, expected_total_amount, expected_currency, created_by)
  values (
    v_org, p_provider, p_environment, p_purpose,
    case when p_purpose = 'initial' then p_target_id end,
    case when p_purpose = 'renewal' then p_target_id end,
    v_tot, v_mon, auth.uid())
  returning id into v_id;

  return jsonb_build_object('checkout_id', v_id, 'status', 'created', 'reused', false,
    'init_point', null, 'expected_total_amount', v_tot, 'expected_currency', v_mon);
end $$;

revoke all on function public.billing_open_one_time_checkout(text,uuid,text,text)
  from anon, authenticated, service_role;
grant execute on function public.billing_open_one_time_checkout(text,uuid,text,text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6 · ATAR LA PREFERENCIA QUE DEVOLVIÓ EL PROVEEDOR
-- ---------------------------------------------------------------------------
create or replace function public.billing_attach_one_time_preference(
  p_checkout_id uuid, p_preference_id text, p_init_point text
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_c public.billing_one_time_checkouts%rowtype;
begin
  select * into v_c from public.billing_one_time_checkouts
   where id = p_checkout_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  if coalesce(trim(p_preference_id), '') = '' then
    raise exception 'PREFERENCE_ID_REQUIRED';
  end if;
  if v_c.status not in ('created', 'provider_created') then
    raise exception 'CHECKOUT_NOT_OPEN' using detail = v_c.status;
  end if;
  -- Una preferencia ya atada no se sustituye: sustituirla dejaría viva la
  -- anterior sin que nadie la mire.
  if v_c.provider_preference_id is not null
     and v_c.provider_preference_id <> p_preference_id then
    raise exception 'PREFERENCE_ALREADY_ATTACHED' using detail = v_c.provider_preference_id;
  end if;

  update public.billing_one_time_checkouts
     set provider_preference_id = p_preference_id,
         init_point = p_init_point,
         status = 'provider_created'
   where id = p_checkout_id;

  return jsonb_build_object('checkout_id', p_checkout_id, 'status', 'provider_created');
end $$;

revoke all on function public.billing_attach_one_time_preference(uuid,text,text)
  from anon, authenticated, service_role;
grant execute on function public.billing_attach_one_time_preference(uuid,text,text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 7 · ASENTAR UN COBRO ÚNICO YA VERIFICADO
-- ---------------------------------------------------------------------------
--
-- Quien llama YA leyó el pago del proveedor. Aquí se vuelve a comprobar todo,
-- porque una comprobación que solo vive en la capa de aplicación es una
-- comprobación que se salta quien llame desde otro sitio.
--
-- Cuatro puertas, todas cerradas por defecto:
--   · el pago tiene que estar aprobado;
--   · su referencia externa tiene que ser ESTE cobro;
--   · el importe tiene que ser el esperado;
--   · la moneda tiene que ser la esperada.
create or replace function public.billing_settle_one_time_checkout(
  p_checkout_id uuid,
  p_provider_payment_id text,
  p_payment_status text,
  p_external_reference text,
  p_amount bigint,
  p_currency text
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_c   public.billing_one_time_checkouts%rowtype;
  v_res jsonb;
  v_pid uuid;
begin
  select * into v_c from public.billing_one_time_checkouts
   where id = p_checkout_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;

  -- IDEMPOTENCIA. Volver a preguntar por un cobro ya asentado devuelve lo
  -- mismo que la primera vez. No es un error: es lo que pasa cuando alguien
  -- pulsa «ya pagué» tres veces.
  if v_c.status = 'settled' then
    return jsonb_build_object('outcome', 'already_settled',
      'checkout_id', v_c.id, 'payment_id', v_c.settled_payment_id,
      'provider_payment_id', v_c.verified_payment_id);
  end if;

  if coalesce(trim(p_provider_payment_id), '') = '' then
    raise exception 'PROVIDER_PAYMENT_ID_REQUIRED';
  end if;

  if p_payment_status is distinct from 'approved' then
    return jsonb_build_object('outcome', 'not_approved',
      'checkout_id', v_c.id, 'payment_status', p_payment_status);
  end if;

  if p_external_reference is distinct from v_c.id::text then
    update public.billing_one_time_checkouts
       set failure_reason = 'EXTERNAL_REFERENCE_MISMATCH' where id = v_c.id;
    raise exception 'EXTERNAL_REFERENCE_MISMATCH'
      using detail = coalesce(p_external_reference, 'null');
  end if;

  if p_currency is null or upper(p_currency) <> upper(v_c.expected_currency) then
    update public.billing_one_time_checkouts
       set failure_reason = 'CURRENCY_MISMATCH' where id = v_c.id;
    raise exception 'CURRENCY_MISMATCH'
      using detail = coalesce(p_currency, 'null') || ' <> ' || v_c.expected_currency;
  end if;

  if p_amount is null or p_amount <> v_c.expected_total_amount then
    update public.billing_one_time_checkouts
       set failure_reason = 'AMOUNT_MISMATCH' where id = v_c.id;
    raise exception 'AMOUNT_MISMATCH'
      using detail = coalesce(p_amount, -1)::text || ' <> ' || v_c.expected_total_amount::text;
  end if;

  -- A partir de aquí manda la verdad canónica de siempre.
  --
  -- Y SE COMPRUEBA LO QUE RESPONDE. La primera versión de esto llamaba a
  -- `billing_settle_period_payment` y devolvía «settled» sin mirar: la
  -- liquidación contestaba `environment_mismatch` —porque `p_live_mode` iba
  -- nulo— y esta función informaba de un cobro que no existía. Un éxito
  -- inventado es peor que un error: nadie lo va a buscar.
  if v_c.purpose = 'initial' then
    v_res := public.billing_settle_payment(
      v_c.quote_id, v_c.provider, p_provider_payment_id, 'approved',
      'one_time:' || v_c.id::text, null);
    if coalesce(v_res->>'status', '') <> 'approved' then
      raise exception 'SETTLEMENT_REFUSED'
        using detail = coalesce(v_res::text, 'null');
    end if;
    v_pid := nullif(v_res->>'payment_id', '')::uuid;
    -- La primera compra de un pago único se renueva a mano por definición.
    if (v_res->>'subscription_id') is not null and v_c.provider <> 'wompi' then
      update public.billing_subscriptions set renewal_mode = 'manual'
       where id = (v_res->>'subscription_id')::uuid;
    end if;
  else
    -- El entorno NO se adivina: lo dice el cobro, que lo congeló al abrirse.
    v_res := public.billing_settle_period_payment(
      v_c.period_id, v_c.provider, p_provider_payment_id, 'approved',
      p_amount, p_currency, v_c.environment = 'live');
    -- `renewed` es el desenlace bueno de una renovación. Se escribe el que la
    -- función devuelve DE VERDAD, no el que uno esperaría: la primera versión
    -- de esta lista decía ('approved','settled') y rechazaba todas las
    -- renovaciones legítimas. Los demás desenlaces —period_not_found,
    -- environment_mismatch, tax_unresolved, reconciliation_mismatch,
    -- period_already_settled— significan que NO se cobró ese periodo.
    if coalesce(v_res->>'outcome', '') <> 'renewed' then
      raise exception 'SETTLEMENT_REFUSED'
        using detail = coalesce(v_res::text, 'null');
    end if;
    v_pid := nullif(v_res->>'payment_id', '')::uuid;
  end if;

  if v_pid is null then
    raise exception 'SETTLEMENT_WITHOUT_PAYMENT' using detail = coalesce(v_res::text, 'null');
  end if;

  update public.billing_one_time_checkouts
     set status = 'settled', verified_payment_id = p_provider_payment_id,
         settled_payment_id = v_pid, failure_reason = null
   where id = v_c.id;

  return jsonb_build_object('outcome', 'settled', 'checkout_id', v_c.id,
    'payment_id', v_pid, 'provider_payment_id', p_provider_payment_id,
    'settlement', v_res);
end $$;

revoke all on function public.billing_settle_one_time_checkout(uuid,text,text,text,bigint,text)
  from anon, authenticated, service_role;
grant execute on function public.billing_settle_one_time_checkout(uuid,text,text,text,bigint,text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 8 · REGISTRAR UN PAGO HECHO FUERA DE TRAZALOOP
-- ---------------------------------------------------------------------------
--
-- El carril de la transferencia, el PSE y el efectivo. Produce EXACTAMENTE la
-- misma verdad canónica que Checkout Pro: pago, suscripción, periodo
-- liquidado y derecho. Lo único distinto es el proveedor —`manual`— y que
-- lleva quién lo registró, con qué evidencia y por qué.
--
-- Lo que esto NO es, y no puede llegar a ser: un `update plan = full`. Un
-- derecho sin pago ni periodo es un regalo que nadie podrá reconciliar.
create or replace function public.billing_record_manual_payment(
  p_organization_id uuid,
  p_plan_code text,
  p_billing_interval text,
  p_reference text,
  p_paid_at timestamptz,
  p_evidence text,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ya    public.billing_payments%rowtype;
  v_sub   public.billing_subscriptions%rowtype;
  v_apert jsonb;
  v_co    jsonb;
  v_res   jsonb;
  v_id    uuid;
  v_tot   bigint;
  v_mon   text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_platform_superadmin() then
    raise exception 'NOT_AUTHORIZED'
      using hint = 'Solo la plataforma registra un pago hecho fuera de Trazaloop.';
  end if;
  if coalesce(trim(p_reference), '') = '' or length(trim(p_reference)) < 3 then
    raise exception 'MANUAL_REFERENCE_REQUIRED'
      using hint = 'Escribe el número de transferencia, factura o recibo.';
  end if;
  if coalesce(trim(p_reason), '') = '' or length(trim(p_reason)) < 10 then
    raise exception 'MANUAL_REASON_REQUIRED'
      using hint = 'Escribe por qué se registra este pago (al menos diez caracteres).';
  end if;
  if p_paid_at is null then raise exception 'MANUAL_PAID_AT_REQUIRED'; end if;
  if p_paid_at > now() then
    raise exception 'MANUAL_PAID_AT_IN_FUTURE' using detail = p_paid_at::text;
  end if;

  -- IDEMPOTENCIA POR REFERENCIA. La misma transferencia registrada dos veces
  -- no cobra dos meses.
  select * into v_ya from public.billing_payments
   where provider = 'manual' and provider_payment_id = trim(p_reference);
  if found then
    return jsonb_build_object('outcome', 'already_recorded', 'payment_id', v_ya.id,
      'subscription_id', v_ya.subscription_id, 'period_id', v_ya.period_id);
  end if;

  -- ¿Es una primera compra o una renovación? Lo dice si ya hay una suscripción
  -- viva, no quien llama.
  select * into v_sub from public.billing_subscriptions
   where organization_id = p_organization_id
     and status in ('active', 'past_due', 'cancel_at_period_end')
   order by created_at desc limit 1;

  if found then
    v_apert := public.billing_open_next_period(v_sub.id);
    if v_apert->>'status' not in ('open', 'opened') then
      raise exception 'RENEWAL_PERIOD_UNAVAILABLE' using detail = coalesce(v_apert->>'status', 'null');
    end if;
    v_co := public.billing_open_one_time_checkout(
      'renewal', (v_apert->>'period_id')::uuid, 'manual', 'live');
  else
    v_res := public.billing_create_quote(p_organization_id, p_plan_code, p_billing_interval, null);
    v_co := public.billing_open_one_time_checkout(
      'initial', (v_res->>'quote_id')::uuid, 'manual', 'live');
  end if;

  v_id  := (v_co->>'checkout_id')::uuid;
  v_tot := (v_co->>'expected_total_amount')::bigint;
  v_mon := v_co->>'expected_currency';

  -- Se asienta por la MISMA puerta que Checkout Pro. La referencia manual hace
  -- de identificador de pago del proveedor `manual`, y la comparación de
  -- importe y moneda se hace igual: aquí no hay atajo.
  v_res := public.billing_settle_one_time_checkout(
    v_id, trim(p_reference), 'approved', v_id::text, v_tot, v_mon);

  update public.billing_payments
     set recorded_by = auth.uid(), recorded_reason = trim(p_reason),
         manual_reference = trim(p_reference),
         manual_evidence = nullif(trim(coalesce(p_evidence, '')), ''),
         manual_paid_at = p_paid_at
   where id = (v_res->>'payment_id')::uuid;

  return v_res || jsonb_build_object('provider', 'manual', 'reference', trim(p_reference));
end $$;

revoke all on function public.billing_record_manual_payment(uuid,text,text,text,timestamptz,text,text)
  from anon, authenticated, service_role;
grant execute on function public.billing_record_manual_payment(uuid,text,text,text,timestamptz,text,text)
  to authenticated, service_role;

comment on function public.billing_record_manual_payment(uuid,text,text,text,timestamptz,text,text) is
  'Registra un pago hecho fuera de Trazaloop y produce la misma verdad '
  'canónica que Checkout Pro: pago, suscripción, periodo liquidado y derecho.';
