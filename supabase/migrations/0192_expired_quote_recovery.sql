-- ===========================================================================
-- Trazaloop · PROD-LAUNCH-01B.7 · Reconocer un pago aprobado contra un
-- presupuesto caducado
-- ===========================================================================
--
-- LO QUE PASÓ
--
-- Un pago real de Checkout Pro —190 400 COP, aprobado, con la referencia
-- exacta del cobro— no se pudo asentar. El único motivo: el presupuesto vive
-- treinta minutos y la persona volvió dos horas después. Cerró la ventana de
-- la pasarela, se distrajo, y al volver `billing_settle_payment` levantó
-- QUOTE_EXPIRED.
--
-- Eso deja a alguien pagando y sin plan, que es exactamente lo que el carril
-- de recuperación existe para evitar. Y no es un caso raro: volver tarde ES el
-- caso de la recuperación.
--
--
-- LA DISTINCIÓN QUE FALTABA
--
-- Los treinta minutos tienen buena razón: congelan precio, tasa de cambio e
-- impuesto para que nadie COMPRE a un precio de ayer. Esa razón se conserva
-- entera.
--
-- Pero se estaba aplicando a dos cosas distintas:
--
--   · iniciar una compra con ese presupuesto  → caducar DEBE impedirlo;
--   · reconocer un pago que ya se cobró CON él → caducar no pinta nada.
--
-- En el segundo caso el precio no está por decidirse: está cobrado, y por el
-- importe que ese mismo presupuesto congeló. Caducar sirve para no dejar
-- comprar, no para no dejar reconocer lo comprado.
--
--
-- POR QUÉ UN PARÁMETRO Y NO UN CAMBIO DE SEMÁNTICA
--
-- `billing_settle_payment` la comparten tres carriles más —los avisos de
-- Mercado Pago de 0171, la subida de plan de 0181 y el pago manual—. Cambiarle
-- la regla a todos para desatascar uno sería pagar con la garantía de los
-- otros tres.
--
-- Así que la excepción es un parámetro con valor por omisión `false`. Ningún
-- llamador existente cambia de comportamiento: los tres pasan seis argumentos
-- posicionales y siguen recibiendo QUOTE_EXPIRED. Y la excepción es
-- greppable: quien la pida tiene que escribirla.
--
--
-- Y ES MÁS DIFÍCIL DE OBTENER QUE EL CAMINO NORMAL
--
-- `billing_settle_one_time_checkout` solo la pide cuando, además de sus cuatro
-- puertas económicas de siempre —aprobado, referencia, importe, moneda—, el
-- vendedor observado coincide con el esperado. Un presupuesto caducado exige
-- MÁS pruebas que uno vigente, no menos.
--
-- El `expires_at` no se toca: se conserva como historia de cuándo caducó.
--
--
-- PRODUCCIÓN. Aditiva en lo que importa: un parámetro opcional. Ni una fila
-- cambia, y sin pedirlo explícitamente el comportamiento es el de siempre.
-- ===========================================================================

do $$
begin
  if to_regprocedure('public.billing_settle_payment(uuid,text,text,text,text,text)') is null then
    raise exception '0192 presupone billing_settle_payment de 0169';
  end if;
  if to_regprocedure(
       'public.billing_settle_one_time_checkout(uuid,text,text,text,bigint,text,boolean,bigint)') is null then
    raise exception '0192 presupone 0191';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1 · La primitiva compartida, con la excepción explícita
-- ---------------------------------------------------------------------------
--
-- Se borra y se recrea porque añadir un parámetro cambia la firma y
-- `create or replace` crearía una SEGUNDA función. Dos versiones de una
-- primitiva financiera es una forma barata de que un día se llame a la que no
-- lleva la regla.
drop function if exists public.billing_settle_payment(uuid,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.billing_settle_payment(p_quote_id uuid, p_provider text, p_provider_payment_id text, p_outcome text, p_idempotency_key text DEFAULT NULL::text, p_failure_reason text DEFAULT NULL::text,
 p_allow_expired_quote boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- 0192 · CADUCAR SIRVE PARA NO DEJAR COMPRAR, NO PARA NO DEJAR RECONOCER
  -- LO COMPRADO.
  --
  -- Los treinta minutos congelan precio, tasa e impuesto para que nadie compre
  -- a un precio de ayer, y eso se conserva intacto: por omisión este parámetro
  -- es `false` y los tres llamadores anteriores —0171, 0181 y el carril
  -- manual— siguen comportándose exactamente igual.
  --
  -- Lo que cambia es el caso del pago que YA se cobró contra este presupuesto.
  -- Ahí el precio no está por decidirse: está cobrado. Bloquearlo dejaba a una
  -- persona con 190 400 pesos pagados y sin plan, que es justo lo que el carril
  -- de recuperación existe para evitar.
  if v_q.expires_at <= now() and not coalesce(p_allow_expired_quote, false) then
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
$function$;

revoke all on function public.billing_settle_payment(uuid,text,text,text,text,text,boolean)
  from anon, authenticated, service_role;
grant execute on function public.billing_settle_payment(uuid,text,text,text,text,text,boolean)
  to service_role;

comment on function public.billing_settle_payment(uuid,text,text,text,text,text,boolean) is
  'Asienta el primer pago de un presupuesto. `p_allow_expired_quote` solo lo '
  'pide el carril de recuperación de un pago YA aprobado: caducar impide '
  'comprar, no reconocer lo comprado.';


-- ---------------------------------------------------------------------------
-- 2 · El carril de recuperación, que es el único que pide la excepción
-- ---------------------------------------------------------------------------
drop function if exists public.billing_settle_one_time_checkout(uuid,text,text,text,bigint,text,boolean,bigint);

create or replace function public.billing_settle_one_time_checkout(
  p_checkout_id uuid,
  p_provider_payment_id text,
  p_payment_status text,
  p_external_reference text,
  p_amount bigint,
  p_currency text,
  p_live_mode boolean default null,
  p_collector_id bigint default null,
  -- 0192 · El vendedor que ESPERAMOS. Solo se usa para autorizar el
  -- reconocimiento de un pago contra un presupuesto caducado.
  p_expected_collector_id bigint default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_c   public.billing_one_time_checkouts%rowtype;
  v_res jsonb;
  v_pid uuid;
  v_caducado boolean := false;
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
    -- 0192 · ¿El presupuesto caducó? Se mira, no se supone.
    select (q.expires_at <= now()) into v_caducado
      from public.billing_quotes q where q.id = v_c.quote_id;
    v_caducado := coalesce(v_caducado, false);

    -- UN PRESUPUESTO CADUCADO EXIGE MÁS PRUEBAS, NO MENOS.
    --
    -- Las cuatro puertas económicas ya se pasaron arriba. Para reconocer un
    -- pago contra un presupuesto que ya venció se pide ADEMÁS que el vendedor
    -- observado sea el esperado. Sin ese dato no se concede: la excepción
    -- existe para el pago que sabemos nuestro, no para cualquiera que cuadre
    -- de números.
    if v_caducado then
      if p_expected_collector_id is null or p_collector_id is null
         or p_collector_id <> p_expected_collector_id then
        update public.billing_one_time_checkouts
           set failure_reason = 'EXPIRED_QUOTE_RECOVERY_REFUSED' where id = v_c.id;
        raise exception 'EXPIRED_QUOTE_RECOVERY_REFUSED'
          using detail = coalesce(p_collector_id, -1)::text || ' <> '
                      || coalesce(p_expected_collector_id, -1)::text;
      end if;
    end if;

    v_res := public.billing_settle_payment(
      v_c.quote_id, v_c.provider, p_provider_payment_id, 'approved',
      'one_time:' || v_c.id::text, null, v_caducado);
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
    -- El entorno del PERIODO no se adivina: lo dice el cobro, que lo congeló
    -- al abrirse. Esto es la contabilidad del ciclo, no la identidad del pago.
    v_res := public.billing_settle_period_payment(
      v_c.period_id, v_c.provider, p_provider_payment_id, 'approved',
      p_amount, p_currency, v_c.environment = 'live');
    -- `renewed` es el desenlace bueno de una renovación. Se escribe el que la
    -- función devuelve DE VERDAD, no el que uno esperaría: la primera versión
    -- de esta lista decía ('approved','settled') y rechazaba todas las
    -- renovaciones legítimas.
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
         settled_payment_id = v_pid, failure_reason = null,
         observed_live_mode = p_live_mode,
         observed_collector_id = p_collector_id
   where id = v_c.id;

  return jsonb_build_object('outcome', 'settled', 'checkout_id', v_c.id,
    'payment_id', v_pid, 'provider_payment_id', p_provider_payment_id,
    'observed_live_mode', p_live_mode,
    'observed_collector_id', p_collector_id,
    'quote_expired', v_caducado,
    'settlement', v_res);
end $$;

revoke all on function public.billing_settle_one_time_checkout(uuid,text,text,text,bigint,text,boolean,bigint,bigint)
  from anon, authenticated, service_role;
grant execute on function public.billing_settle_one_time_checkout(uuid,text,text,text,bigint,text,boolean,bigint,bigint)
  to service_role;

comment on function public.billing_settle_one_time_checkout(uuid,text,text,text,bigint,text,boolean,bigint,bigint) is
  'Asienta un pago único ya verificado. Con el presupuesto caducado exige, '
  'ademas de las cuatro puertas economicas, que el vendedor observado sea el '
  'esperado: reconocer lo cobrado pide mas pruebas, no menos.';

-- ---------------------------------------------------------------------------
-- 3 · LOS PERMISOS, QUE ES DONDE ESTABA EL AGUJERO
-- ---------------------------------------------------------------------------
--
-- Al recrear `billing_settle_payment` se revocó de `anon, authenticated,
-- service_role`… y NO de `public`. En PostgreSQL una función nace con EXECUTE
-- para PUBLIC, y `authenticated` lo hereda por ahí. Resultado: durante el
-- tiempo que vivió esa versión, cualquier persona con sesión podía llamar a la
-- primitiva que convierte dinero en derecho y activarse el plan sola.
--
-- 0169 lo hacía bien —`from public, anon, authenticated`— y su comentario lo
-- decía en voz alta: «NO se concede a authenticated: volver del checkout no
-- llega hasta aquí». Lo cazó la prueba «Y. Volver del checkout NO activa
-- nada», que existe exactamente para esto.
--
-- El mismo descuido está en las cuatro funciones de 0190 y 0191, que se
-- escribieron con la misma fórmula incompleta. Se cierran todas aquí, y no
-- solo la que falló: un agujero que se repite no se tapa de uno en uno.
revoke all on function public.billing_settle_payment(uuid,text,text,text,text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.billing_settle_payment(uuid,text,text,text,text,text,boolean)
  to service_role;

revoke all on function public.billing_settle_one_time_checkout(uuid,text,text,text,bigint,text,boolean,bigint,bigint)
  from public, anon, authenticated;
grant execute on function public.billing_settle_one_time_checkout(uuid,text,text,text,bigint,text,boolean,bigint,bigint)
  to service_role;

revoke all on function public.billing_attach_one_time_preference(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.billing_attach_one_time_preference(uuid,text,text)
  to service_role;

-- Estas dos SÍ las llama quien tiene sesión, y comprueban por dentro quién es.
-- Lo que se les quita es el acceso anónimo heredado de PUBLIC.
revoke all on function public.billing_open_one_time_checkout(text,uuid,text,text)
  from public, anon;
grant execute on function public.billing_open_one_time_checkout(text,uuid,text,text)
  to authenticated, service_role;

revoke all on function public.billing_record_manual_payment(uuid,text,text,text,timestamptz,text,text)
  from public, anon;
grant execute on function public.billing_record_manual_payment(uuid,text,text,text,timestamptz,text,text)
  to authenticated, service_role;
