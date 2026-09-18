-- ===========================================================================
-- Trazaloop · 0218 · BILLING-EXTRA-01C
-- Un cobro aprobado que la liquidación rechaza NO puede quedarse sin salida.
--
--
-- EL DEFECTO
--
-- `billing_settle_upgrade_payment` tiene una rama que 0216 y 0217 no miraron:
-- cuando llega un pago APROBADO cuyo importe o cuya moneda no cuadran con lo
-- que el intento congeló, marca el intento para revisión y pone el CAMBIO en
-- `failed`.
--
-- `failed` es terminal. Y desde 0216, abrir una compensación exige `submitted`.
-- El resultado era un callejón con dinero dentro:
--
--   · el cobro existe y está aprobado en el proveedor,
--   · el cambio está cerrado como fallido,
--   · no hay forma de abrir la compensación que lo devolvería,
--   · y como `failed` no cuenta como «subida en vuelo», el barrido recurrente
--     queda suelto — en el carril del proveedor, sobre una autorización que
--     podría haberse quedado en Extra.
--
-- Es exactamente el estado que 01B.1 declaró inadmisible —dentro y fuera
-- divergiendo, sin nadie bloqueando— sólo que por una puerta distinta.
--
--
-- POR DÓNDE SE LLEGA
--
-- Hoy, por el carril de Wompi: su webhook pasa el importe que el proveedor
-- reporta, y si no cuadra con el congelado, cae aquí. El conciliador de Mercado
-- Pago no llega —comprueba el importe antes de liquidar— pero eso es una
-- protección suya, no una garantía del modelo: cualquier otro carril futuro que
-- llame a la primitiva con un importe distinto reabre el agujero.
--
--
-- QUÉ SE CAMBIA
--
-- Lo mínimo. `failed` deja de ser una salida cuando hay un cobro observado: se
-- puede abrir la compensación desde ahí, y mientras ese dinero no se devuelva,
-- el barrido sigue bloqueado. Ni un estado nuevo: `failed` con dinero dentro no
-- es un estado distinto, es el mismo con una deuda pendiente.
--
-- `declined` NO entra. Ahí el banco dijo que no y no hay nada que devolver.
--
--
-- PRODUCCIÓN. Aditiva. Ninguna fila cambia de significado: lo que era `failed`
-- sigue siendo `failed`, sólo que ahora puede salir de ahí si había dinero.
-- ===========================================================================

do $$
begin
  if to_regprocedure('public.billing_open_upgrade_compensation(uuid,text)') is null then
    raise exception '0218 presupone billing_open_upgrade_compensation de 0216';
  end if;
  if to_regprocedure('public.billing_upgrade_in_flight(uuid)') is null then
    raise exception '0218 presupone billing_upgrade_in_flight de 0216';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1 · ABRIR LA COMPENSACIÓN TAMBIÉN DESDE `failed`
-- ---------------------------------------------------------------------------
--
-- Es la función de 0216 con UNA condición más amplia. Todo lo demás —la llave
-- derivada, la negativa sin cobro observado, la idempotencia— sigue igual.
create or replace function public.billing_open_upgrade_compensation(
  p_change_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_c public.billing_subscription_changes%rowtype;
  v_llave text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'COMPENSATION_REASON_REQUIRED';
  end if;

  select * into v_c from public.billing_subscription_changes
   where id = p_change_id for update;
  if not found then
    return jsonb_build_object('status', 'change_not_found');
  end if;

  if v_c.status = 'compensation_required' then
    return jsonb_build_object('status', 'already_open', 'change_id', v_c.id,
      'provider_payment_id', v_c.delta_provider_payment_id,
      'refund_idempotency_key', v_c.refund_idempotency_key,
      'expected_total_amount', v_c.total_amount,
      'expected_currency', v_c.charge_currency,
      'organization_id', v_c.organization_id);
  end if;
  if v_c.status = 'refunded' then
    return jsonb_build_object('status', 'already_refunded', 'change_id', v_c.id,
      'provider_refund_id', v_c.refund_provider_id);
  end if;
  if v_c.status = 'settled' then
    return jsonb_build_object('status', 'already_settled', 'change_id', v_c.id);
  end if;

  -- 0218 · `failed` TAMBIÉN, cuando hay un cobro observado.
  --
  -- Un pago aprobado que la liquidación rechazó por cuentas deja el cambio
  -- fallido y el dinero dentro. Negarse a compensar ahí no protege nada: sólo
  -- garantiza que ese dinero no vuelva nunca.
  --
  -- `declined` sigue fuera: ahí el banco dijo que no y no hay nada que devolver.
  if v_c.status not in ('submitted', 'failed') then
    return jsonb_build_object('status', 'not_compensable', 'reason', v_c.status);
  end if;
  if v_c.delta_provider_payment_id is null then
    return jsonb_build_object('status', 'no_delta_payment', 'change_id', v_c.id);
  end if;

  v_llave := 'upgrefund:' || v_c.id::text || ':' || v_c.delta_provider_payment_id;

  update public.billing_subscription_changes
     set status = 'compensation_required',
         compensation_reason = p_reason,
         refund_idempotency_key = coalesce(refund_idempotency_key, v_llave),
         refund_requested_at = coalesce(refund_requested_at, now()),
         updated_at = now()
   where id = v_c.id;

  return jsonb_build_object('status', 'opened', 'change_id', v_c.id,
    'organization_id', v_c.organization_id,
    'provider_payment_id', v_c.delta_provider_payment_id,
    'refund_idempotency_key', v_llave,
    'expected_total_amount', v_c.total_amount,
    'expected_currency', v_c.charge_currency);
end;
$$;

revoke all on function public.billing_open_upgrade_compensation(uuid, text)
  from public, anon, authenticated;
grant execute on function public.billing_open_upgrade_compensation(uuid, text) to service_role;

comment on function public.billing_open_upgrade_compensation(uuid, text) is
  'BILLING-EXTRA-01C · Declara que un cobro de subida hay que devolverlo, ANTES '
  'de pedírselo al proveedor. Se puede entrar desde `submitted` y también desde '
  '`failed` cuando hay un cobro observado: un pago aprobado que la liquidación '
  'rechazó por cuentas no puede quedarse sin salida. Nunca concede Extra.';

-- ---------------------------------------------------------------------------
-- 2 · Y EL BARRIDO SIGUE BLOQUEADO MIENTRAS ESE DINERO NO VUELVA
-- ---------------------------------------------------------------------------
--
-- Sin esto queda una ventana: entre que la liquidación marca `failed` y que
-- alguien abre la compensación, el barrido se creería libre para conciliar
-- ciclos sobre una autorización que puede estar en Extra.
--
-- La condición es precisa: `failed` CON un cobro observado y sin reembolso
-- registrado. Un `failed` de los de siempre —sin dinero— no bloquea nada.
create or replace function public.billing_upgrade_in_flight(p_subscription_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.billing_subscription_changes
     where subscription_id = p_subscription_id
       and (status in ('pending', 'submitted', 'compensation_required')
            or (status = 'failed'
                and delta_provider_payment_id is not null
                and refund_provider_id is null)));
$$;

revoke all on function public.billing_upgrade_in_flight(uuid) from public, anon;
grant execute on function public.billing_upgrade_in_flight(uuid) to authenticated, service_role;

comment on function public.billing_upgrade_in_flight(uuid) is
  'BILLING-EXTRA-01C · ¿Hay una subida abierta sobre esta suscripción? Cuentan '
  'las que están en vuelo y también las fallidas CON un cobro observado y sin '
  'devolver: mientras ese dinero siga dentro, conciliar un ciclo mezclaría dos '
  'cuentas.';

-- ---------------------------------------------------------------------------
-- 3 · Y SE PUEDE ANOTAR EL COBRO AUNQUE EL CAMBIO YA ESTÉ FALLIDO
-- ---------------------------------------------------------------------------
--
-- Misma razón y mismo caso. La anotación es lo que permite saber QUÉ hay que
-- devolver, y exigir `submitted` para hacerla dejaba el rescate sin su primer
-- paso: la liquidación ya había puesto el cambio en `failed`.
create or replace function public.billing_observe_upgrade_delta(
  p_change_id uuid,
  p_provider_payment_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_c public.billing_subscription_changes%rowtype;
begin
  if p_provider_payment_id is null or btrim(p_provider_payment_id) = '' then
    raise exception 'PROVIDER_PAYMENT_ID_REQUIRED';
  end if;

  select * into v_c from public.billing_subscription_changes
   where id = p_change_id for update;
  if not found then
    return jsonb_build_object('status', 'change_not_found');
  end if;

  if v_c.delta_provider_payment_id is not null then
    if v_c.delta_provider_payment_id = p_provider_payment_id then
      return jsonb_build_object('status', 'already_observed',
        'change_id', v_c.id, 'provider_payment_id', v_c.delta_provider_payment_id);
    end if;
    return jsonb_build_object('status', 'delta_payment_conflict',
      'observed', v_c.delta_provider_payment_id, 'received', p_provider_payment_id);
  end if;

  -- 0218 · `failed` también. Es el estado en el que la liquidación deja un
  -- cobro aprobado que no cuadró, y sin poder anotarlo no se puede devolver.
  if v_c.status not in ('submitted', 'failed') then
    return jsonb_build_object('status', 'not_observable', 'reason', v_c.status);
  end if;

  update public.billing_subscription_changes
     set delta_provider_payment_id = p_provider_payment_id,
         delta_observed_at = now(),
         updated_at = now()
   where id = v_c.id;

  return jsonb_build_object('status', 'observed', 'change_id', v_c.id,
    'organization_id', v_c.organization_id,
    'subscription_id', v_c.subscription_id,
    'expected_total_amount', v_c.total_amount,
    'expected_currency', v_c.charge_currency);
end;
$$;

revoke all on function public.billing_observe_upgrade_delta(uuid, text)
  from public, anon, authenticated;
grant execute on function public.billing_observe_upgrade_delta(uuid, text) to service_role;

comment on function public.billing_observe_upgrade_delta(uuid, text) is
  'BILLING-EXTRA-01C · Anota qué pago del proveedor respalda una subida, sin '
  'liquidarla. Se puede anotar desde `submitted` y desde `failed`: ahí es '
  'justamente donde la liquidación deja un cobro aprobado que no cuadró. '
  'Idempotente, y para en vez de elegir si aparecen dos pagos distintos.';
