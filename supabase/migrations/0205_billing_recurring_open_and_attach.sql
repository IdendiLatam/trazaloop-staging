-- =============================================================================
-- Trazaloop · MP-REC-01B · Abrir una recurrencia, atarla, y observarla
-- =============================================================================
--
-- POR QUÉ LA SUSCRIPCIÓN NACE ANTES DEL DINERO, Y SOLO EN ESTE CARRIL
--
-- En el carril manual la suscripción nace cuando se reconoce un pago:
-- `billing_settle_payment` la crea `active` con su primer periodo. Es correcto
-- allí, porque allí no existe nada entre «quiero contratar» y «pagué».
--
-- En una recurrencia sí existe algo en medio, y dura días: la preapproval está
-- creada, el comprador todavía no ha autorizado, y el proveedor cobrará por su
-- cuenta cuando lo haga. Ese estado intermedio TIENE que ser representable, y
-- además `billing_reconcile_provider_cycle` (0186) lo exige: resuelve la
-- suscripción desde el intento, y si no la encuentra devuelve
-- `subscription_unknown` y no salda nada. Sin esto, el primer cobro real de una
-- recurrencia se perdería.
--
-- Así que aquí la suscripción nace `pending`, con `renewal_mode = 'provider'`,
-- y SIN periodo. Nace pendiente y vacía a propósito:
--
--   · `pending` no concede nada. La puerta de los módulos lee la proyección de
--     0194, que sale de periodos PAGADOS. Sin periodo no hay proyección.
--   · Sin `current_period_end` no hay vigencia que nadie pueda confundir con
--     acceso.
--
-- Estar autorizado tampoco basta: el proveedor cobra alrededor de una hora
-- después, y `mapping.ts` traduce su `authorized` a `pending` por eso mismo.
--
--
-- LO QUE ESTA MIGRACIÓN NO HACE
--
-- No concede acceso, no crea periodos, no toca `billing_settle_payment` ni
-- ninguna función del carril manual, y no reescribe el `renewal_mode` de nadie:
-- el valor `'provider'` solo se escribe en las filas que NACEN aquí.
-- =============================================================================

do $$
begin
  if to_regclass('public.billing_recurring_authorizations') is null then
    raise exception '0205 presupone la autorizacion de 0204';
  end if;
  if to_regclass('public.billing_checkout_intents') is null then
    raise exception '0205 presupone el intento de 0171';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1 · Abrir la recurrencia · suscripción pendiente + autorización pendiente
-- -----------------------------------------------------------------------------
--
-- IDEMPOTENCIA, Y POR QUÉ NO BASTA CON MIRAR ANTES DE INSERTAR
--
-- Los cuatro enemigos son el doble clic, el refresco, el reintento y dos
-- pestañas a la vez. Los cuatro producen llamadas CONCURRENTES, así que
-- «comprobar y luego insertar» en la aplicación no sirve: entre la comprobación
-- y la inserción cabe la otra llamada.
--
-- Aquí se resuelve con lo mismo que usa `billing_open_checkout_intent`: un
-- cerrojo consultivo por EMPRESA que dura la transacción. Dos llamadas a la vez
-- se ponen en fila; la segunda encuentra lo que creó la primera y lo devuelve.
-- Y por si el cerrojo no bastara, debajo sigue el índice parcial de 0204: una
-- sola autorización viva por suscripción, decidido por la base.
create or replace function public.billing_open_recurring_authorization(
  p_intent_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_i    public.billing_checkout_intents%rowtype;
  v_q    public.billing_quotes%rowtype;
  v_sub  uuid;
  v_live public.billing_subscriptions%rowtype;
  v_auth public.billing_recurring_authorizations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_i from public.billing_checkout_intents
   where id = p_intent_id for update;
  if not found then raise exception 'INTENT_NOT_FOUND'; end if;

  -- QUIÉN PUEDE. La misma puerta que el intento: administración de la empresa.
  -- Se comprueba aquí otra vez y no se confía en que el intento ya lo hiciera:
  -- esta función se puede llamar con un intento que abrió otra persona.
  if not public.is_org_admin(v_i.organization_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- EL CARRIL ES DE PRUEBAS MIENTRAS NO SE APRUEBE. La bandera y el entorno de
  -- despliegue los comprueba el servidor antes de llegar aquí; esto es el
  -- último cerrojo, el que no depende de que nadie se acuerde.
  if v_i.environment <> 'test' then
    raise exception 'RECURRING_REQUIRES_TEST_ENVIRONMENT' using detail = v_i.environment;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('billing:recurring:' || v_i.organization_id::text, 0));

  -- --- UNA SOLA CONTRATACIÓN VIVA POR EMPRESA ------------------------------
  --
  -- La base ya lo decide con `billing_subscriptions_one_live`, un índice
  -- parcial sobre `pending|active|past_due|cancel_at_period_end`. Esta función
  -- lo RESPETA en vez de estrellarse contra él, porque las dos situaciones que
  -- se encuentra significan cosas muy distintas:
  --
  --   · Ya hay una recurrencia viva → es el doble clic, el refresco o el
  --     reintento. Se devuelve la que hay.
  --
  --   · Hay una contratación MANUAL viva → la empresa ya está contratada por
  --     el otro carril. Abrir aquí una recurrencia la pondría a pagar dos
  --     veces por el mismo derecho. Se dice que no, con su motivo, y no se
  --     toca nada de lo suyo.
  select * into v_live from public.billing_subscriptions
   where organization_id = v_i.organization_id
     and status in ('pending', 'active', 'past_due', 'cancel_at_period_end')
   for update;

  if found and v_live.renewal_mode is distinct from 'provider' then
    return jsonb_build_object(
      'outcome', 'manual_subscription_active',
      'subscription_id', v_live.id,
      'renewal_mode', v_live.renewal_mode);
  end if;

  if found then
    v_sub := v_live.id;
    -- El intento se ata a la suscripción que ya existe: `billing_reconcile_
    -- provider_cycle` la resuelve por ahí, y sin esto el primer cobro real
    -- quedaría sin suscripción que saldar.
    if v_i.billing_subscription_id is distinct from v_sub then
      update public.billing_checkout_intents
         set billing_subscription_id = v_sub, updated_at = now()
       where id = v_i.id;
    end if;

    select * into v_auth from public.billing_recurring_authorizations
     where subscription_id = v_sub
       and status in ('awaiting_authorization', 'authorized')
     order by created_at desc limit 1;
    if found then
      return jsonb_build_object(
        'outcome', 'reused',
        'subscription_id', v_sub,
        'authorization_id', v_auth.id,
        'provider_subscription_id',
          case when v_auth.provider_subscription_id like 'pending:%'
               then null else v_auth.provider_subscription_id end,
        'init_point', v_auth.init_point_url,
        'expected_total_amount', v_i.expected_total_amount,
        'expected_currency', v_i.expected_currency);
    end if;
  end if;

  select * into v_q from public.billing_quotes where id = v_i.quote_id;
  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;

  -- --- La suscripción comercial, PENDIENTE y sin periodo -------------------
  if v_sub is null then
    insert into public.billing_subscriptions (
      organization_id, provider, plan_code, plan_revision_id, billing_interval,
      catalog_amount_minor, catalog_currency,
      base_charge_amount, charge_currency, fx_rate_id, fx_rate_micros,
      status, renewal_mode, created_by)
    values (
      v_q.organization_id, v_i.provider, v_q.plan_code, v_q.plan_revision_id,
      v_q.billing_interval,
      v_q.catalog_amount_minor, v_q.catalog_currency,
      -- La BASE, igual que en el carril manual. El impuesto no se congela: se
      -- resuelve al cobrar con la regla vigente, y así una exención futura
      -- llega al siguiente cargo sin tocar el precio contratado.
      v_q.base_amount, v_q.charge_currency, v_q.fx_rate_id, v_q.fx_rate_micros,
      -- NI `active`, NI periodo, NI `current_period_end`. Nada que se pueda
      -- confundir con acceso antes de que exista un cobro aprobado.
      'pending', 'provider', auth.uid())
    returning id into v_sub;

    update public.billing_checkout_intents
       set billing_subscription_id = v_sub, updated_at = now()
     where id = v_i.id;
  end if;

  -- --- La autorización, a la espera del comprador --------------------------
  insert into public.billing_recurring_authorizations (
    subscription_id, organization_id, provider, provider_subscription_id,
    environment, status)
  values (
    v_sub, v_q.organization_id, v_i.provider,
    -- Todavía no hay preapproval: se ata en cuanto el proveedor la devuelva.
    -- El hueco se marca con la identidad de la autorización para no violar el
    -- NOT NULL ni inventarse un identificador del proveedor.
    'pending:' || gen_random_uuid()::text,
    v_i.environment, 'awaiting_authorization')
  returning * into v_auth;

  return jsonb_build_object(
    'outcome', 'opened',
    'subscription_id', v_sub,
    'authorization_id', v_auth.id,
    'provider_subscription_id', null,
    'init_point', null,
    'expected_total_amount', v_i.expected_total_amount,
    'expected_currency', v_i.expected_currency);
end;
$$;

revoke all on function public.billing_open_recurring_authorization(uuid)
  from public, anon;
-- La abre quien contrata, con su sesión: por eso `authenticated` y no solo el
-- servicio. La función comprueba por dentro que sea administración de ESA
-- empresa, igual que hace `billing_open_checkout_intent`.
grant execute on function public.billing_open_recurring_authorization(uuid)
  to authenticated, service_role;

comment on function public.billing_open_recurring_authorization(uuid) is
  'MP-REC-01B · Abre la suscripcion comercial PENDIENTE y su autorizacion a la espera. No concede acceso, no crea periodo y no toca el carril manual. Idempotente por cerrojo de empresa y por el indice parcial de 0204.';

-- -----------------------------------------------------------------------------
-- 2 · Atar la preapproval que devolvió el proveedor
-- -----------------------------------------------------------------------------
--
-- Va aparte de abrir, y es de SERVICIO, por el mismo motivo que en el carril
-- manual: atar lo que devolvió la pasarela no es una decisión de quien compra.
--
-- Y no deja huérfanos en silencio. Si el proveedor creó la preapproval y esta
-- llamada falla, la autorización se queda `awaiting_authorization` con su hueco
-- `pending:…`, que es exactamente la señal de «hay un recurso del proveedor sin
-- atar»: se puede encontrar buscando ese prefijo, y el índice parcial impide
-- que mientras tanto se abra otra.
create or replace function public.billing_attach_recurring_preapproval(
  p_authorization_id        uuid,
  p_provider_subscription_id text,
  p_init_point              text,
  p_provider_status         text,
  p_observed_collector_id   text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_a public.billing_recurring_authorizations%rowtype;
begin
  if coalesce(trim(p_provider_subscription_id), '') = '' then
    raise exception 'PROVIDER_SUBSCRIPTION_ID_REQUIRED';
  end if;

  select * into v_a from public.billing_recurring_authorizations
   where id = p_authorization_id for update;
  if not found then raise exception 'AUTHORIZATION_NOT_FOUND'; end if;

  -- Reatar la MISMA preapproval es un reintento y se responde igual que la
  -- primera vez. Atar una DISTINTA sobre una autorización que ya tiene la suya
  -- sería perder el rastro de la primera, que puede estar viva en el proveedor.
  if v_a.provider_subscription_id not like 'pending:%'
     and v_a.provider_subscription_id is distinct from p_provider_subscription_id then
    return jsonb_build_object('outcome', 'already_attached_to_another',
      'authorization_id', v_a.id,
      'provider_subscription_id', v_a.provider_subscription_id);
  end if;

  update public.billing_recurring_authorizations
     set provider_subscription_id = p_provider_subscription_id,
         init_point_url       = coalesce(p_init_point, init_point_url),
         init_point_issued_at = coalesce(init_point_issued_at, now()),
         provider_status      = coalesce(p_provider_status, provider_status),
         observed_collector_id = coalesce(p_observed_collector_id, observed_collector_id)
   where id = p_authorization_id;

  return jsonb_build_object('outcome', 'attached',
    'authorization_id', p_authorization_id,
    'provider_subscription_id', p_provider_subscription_id);
end;
$$;

revoke all on function public.billing_attach_recurring_preapproval(
  uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.billing_attach_recurring_preapproval(
  uuid, text, text, text, text) to service_role;

comment on function public.billing_attach_recurring_preapproval(uuid, text, text, text, text) is
  'MP-REC-01B · Ata la preapproval devuelta por el proveedor. Reatar la misma es un reintento; atar otra distinta se rechaza para no perder el rastro de la primera.';

-- -----------------------------------------------------------------------------
-- 3 · Anotar lo observado · NUNCA concede nada
-- -----------------------------------------------------------------------------
--
-- La conciliación llama aquí después de releer al proveedor. Escribe estado
-- observado y fechas, y NADA MÁS: ni periodo, ni pago, ni derecho. Que esta
-- función no pueda conceder es lo que permite llamarla sin miedo desde el
-- retorno del navegador, desde un aviso y desde el barrido.
create or replace function public.billing_observe_recurring_authorization(
  p_authorization_id uuid,
  p_provider_status  text,
  p_authorized       boolean,
  p_observed_collector_id text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_a public.billing_recurring_authorizations%rowtype;
begin
  select * into v_a from public.billing_recurring_authorizations
   where id = p_authorization_id for update;
  if not found then raise exception 'AUTHORIZATION_NOT_FOUND'; end if;

  update public.billing_recurring_authorizations
     set provider_status = coalesce(p_provider_status, provider_status),
         -- La fecha de autorización se pone UNA vez: es cuando el comprador
         -- dio su permiso, no cada vez que se le pregunta al proveedor.
         authorized_at = case when coalesce(p_authorized, false)
                              then coalesce(authorized_at, now())
                              else authorized_at end,
         status = case when coalesce(p_authorized, false) and status = 'awaiting_authorization'
                       then 'authorized' else status end,
         observed_collector_id = coalesce(p_observed_collector_id, observed_collector_id),
         last_reconciled_at = now()
   where id = p_authorization_id;

  return jsonb_build_object('outcome', 'observed', 'authorization_id', p_authorization_id);
end;
$$;

revoke all on function public.billing_observe_recurring_authorization(
  uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.billing_observe_recurring_authorization(
  uuid, text, boolean, text) to service_role;

comment on function public.billing_observe_recurring_authorization(uuid, text, boolean, text) is
  'MP-REC-01B · Anota el estado observado del proveedor. No crea periodo, no crea pago y no concede acceso: por eso se puede llamar desde el retorno, desde un aviso y desde el barrido.';

-- -----------------------------------------------------------------------------
-- 4 · Y la puerta de 0202 sigue donde estaba
-- -----------------------------------------------------------------------------
-- Tres funciones nuevas, y NINGUNA alcanzable por `anon`. La superficie pública
-- tiene que seguir exactamente en nueve.
do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_n <> 9 then
    raise exception '0205_SUPERFICIE_PUBLICA_CAMBIO: % funciones', v_n;
  end if;

  raise notice '0205 · la recurrencia se abre pendiente, y pendiente no concede nada';
end $$;
