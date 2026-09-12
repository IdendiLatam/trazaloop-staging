-- ===========================================================================
-- Trazaloop · PROD-LAUNCH-01B.4 · La evidencia de identidad de un pago único
-- ===========================================================================
--
-- DE DÓNDE SALE ESTA MIGRACIÓN
--
-- Un pago real de sandbox llegó `approved`, por 190 400 COP, con la referencia
-- exacta del cobro… y `live_mode: true`. El verificador lo rechazó porque el
-- cobro se abrió en `test`.
--
-- La regla estaba mal, no el pago. `live_mode` describe LA NATURALEZA DE LA
-- CREDENCIAL, no el entorno de nuestro despliegue: un usuario de prueba que
-- opera con sus propias credenciales produce operaciones que el proveedor
-- marca como productivas —de una cuenta falsa—. Es el mismo error que MP-ENV-01
-- cerró para las suscripciones: confundir quién es el titular, qué clase de
-- credencial es y en qué entorno estamos.
--
-- La frontera de verdad es la IDENTIDAD, y esa comparación vive en el código
-- (`decideOneTimeSettlement`). Lo que falta aquí abajo es dejar CONSTANCIA:
-- con qué bandera y con qué vendedor llegó cada pago que se asentó.
--
--
-- POR QUÉ SE GUARDA ALGO QUE YA NO DECIDE
--
-- Porque dejar de decidir no es lo mismo que dejar de mirar. El día que haya
-- que auditar un cobro —o que soporte pregunte por qué se activó un plan— la
-- respuesta no puede ser «no lo anotamos». Y si alguna vez hay que revisar
-- esta decisión, la revisión necesita datos, no recuerdos.
--
--
-- QUÉ NO CAMBIA
--
-- · Producción sigue exigiendo `live_mode = true`. Eso vive en el código y su
--   suite lo fija con tres casos; aquí no se toca.
-- · Las cuatro puertas económicas de `billing_settle_one_time_checkout`
--   —aprobado, referencia, importe, moneda— siguen exactamente igual.
-- · La semántica de las suscripciones del proveedor no se toca. Ese frente
--   sigue pausado por su soporte.
--
--
-- POR QUÉ SE BORRA Y SE RECREA LA FUNCIÓN
--
-- Añadir dos parámetros cambia la firma, y `create or replace` no la cambia:
-- crearía una SEGUNDA función con el mismo nombre. Dos sobrecargas de una
-- primitiva financiera es una forma barata de que un día se llame a la que no
-- guarda la evidencia. Se borra la anterior y se recrea una sola.
--
-- 0190 no está en Producción, así que esto no reescribe nada aplicado allí.
--
-- PRODUCCIÓN. Aditiva: dos columnas opcionales. Ni una fila cambia.
-- ===========================================================================

do $$
begin
  if to_regclass('public.billing_one_time_checkouts') is null then
    raise exception '0191 presupone 0190';
  end if;
  if to_regprocedure(
       'public.billing_settle_one_time_checkout(uuid,text,text,text,bigint,text)') is null then
    raise exception '0191 presupone billing_settle_one_time_checkout de 0190';
  end if;
end $$;

alter table public.billing_one_time_checkouts
  add column if not exists observed_live_mode boolean,
  add column if not exists observed_collector_id bigint;

comment on column public.billing_one_time_checkouts.observed_live_mode is
  'Con qué bandera `live_mode` llegó el pago que asentó este cobro. EVIDENCIA, '
  'no autoridad: en pruebas no decide, porque describe la naturaleza de la '
  'credencial y no el entorno del despliegue.';
comment on column public.billing_one_time_checkouts.observed_collector_id is
  'Qué vendedor cobró, según el proveedor. Es la identidad del pago, distinta '
  'de la de la credencial.';

drop function if exists public.billing_settle_one_time_checkout(uuid,text,text,text,bigint,text);

create or replace function public.billing_settle_one_time_checkout(
  p_checkout_id uuid,
  p_provider_payment_id text,
  p_payment_status text,
  p_external_reference text,
  p_amount bigint,
  p_currency text,
  p_live_mode boolean default null,
  p_collector_id bigint default null
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
    'settlement', v_res);
end $$;

revoke all on function public.billing_settle_one_time_checkout(uuid,text,text,text,bigint,text,boolean,bigint)
  from anon, authenticated, service_role;
grant execute on function public.billing_settle_one_time_checkout(uuid,text,text,text,bigint,text,boolean,bigint)
  to service_role;

comment on function public.billing_settle_one_time_checkout(uuid,text,text,text,bigint,text,boolean,bigint) is
  'Asienta un pago único ya verificado. Cuatro puertas económicas —aprobado, '
  'referencia, importe y moneda— y la evidencia de identidad con la que llegó.';
