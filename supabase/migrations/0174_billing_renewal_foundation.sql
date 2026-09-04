-- ===========================================================================
-- Trazaloop · 0174 · Los cimientos del cobro que se hace solo
-- ===========================================================================
--
-- LO PRIMERO, PORQUE ES LO GRAVE
--
-- El descubrimiento de B5A encontró que el dominio de periodos, tal y como lo
-- dejé en 0172, NO SIRVE para renovar solo. Dos ensayos contra la base lo
-- demostraron:
--
--  AA. Una suscripción AL DÍA, cuatro horas después de vencer su mes pagado,
--      respondía `lapsed / REACTIVATION_REQUIRES_NEW_PURCHASE`. El planificador
--      no habría podido renovar a NADIE, nunca: cada cliente sano habría sido
--      tratado, en el instante exacto de su vencimiento, como uno que cayó.
--
--  AB. Y la caducidad de verdad —un periodo impagado con la gracia expirada
--      hace semanas— devolvía el periodo como si nada. NUNCA decía `lapsed`.
--
-- Una sola causa. La comprobación vivía detrás de un retorno anticipado que ya
-- se llevaba todos los periodos ABIERTOS, así que solo podía alcanzar a los
-- SALDADOS —que es justamente la renovación normal—. Se escribió pensando en
-- «impagado y sin gracia» y ese caso jamás llegaba hasta ella.
--
-- La regla correcta distingue por el ESTADO DEL ÚLTIMO PERIODO, no por el
-- reloj a secas:
--
--     saldado  + vencido o por vencer  → renovación normal: abrir N+1
--     abierto  + dentro de la gracia   → reintento: devolver ESE
--     abierto  + pasada la gracia      → candidato a caducar
--
-- Y `REACTIVATION_REQUIRES_NEW_PURCHASE` pasa a donde le corresponde: a una
-- suscripción que YA caducó, no a una que acaba de vencer estando al día.
--
-- LO QUE SE AÑADE
--
-- El calendario de reintentos, la selección de vencimientos, la caída a Free y
-- la clasificación de fallos. Nada de esto cobra: cobrar es de la capa de
-- aplicación, y activar sigue siendo del webhook firmado.
--
-- LA CAÍDA A FREE NO CREA NADA
--
-- Free no se «concede» al caducar: ya está debajo. Toda empresa nace con una
-- asignación `base` permanente de Free por módulo, y el resolutor se queda con
-- la de mayor rango entre las VIVAS. Así que caducar es CERRAR lo vendido y
-- nada más. Crear una segunda asignación de Free sería duplicar lo que ya
-- existe y romper la lectura de «qué plan tiene esta empresa».
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
  if to_regclass('public.billing_payment_methods') is null
     or to_regprocedure('public.billing_open_next_period(uuid)') is null then
    raise exception '0174 presupone 0173';
  end if;
  raise notice '0174 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · UN ESTADO MÁS PARA LA SUSCRIPCIÓN · caducada NO es cancelada
-- ---------------------------------------------------------------------------
-- Cancelar es una decisión de quien paga. Caducar es lo que pasa cuando el
-- cobro no entra y se agota la gracia. Meterlas en el mismo estado haría
-- imposible responder «¿esta empresa se fue o se le cayó la tarjeta?», que es
-- justo la pregunta que decide si se la llama por teléfono.
alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_status_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_status_check
  check (status in ('pending', 'active', 'past_due', 'cancel_at_period_end',
                    'lapsed', 'ended', 'manual_review'));

-- `lapsed` NO entra en el índice de «una sola viva»: una empresa que caducó
-- tiene que poder contratar de nuevo, y eso crea otra suscripción.
comment on column public.billing_subscriptions.status is
  'PE-05B5B · pending, active, past_due (deuda dentro de la gracia), cancel_at_period_end, lapsed (se agoto la gracia sin cobrar), ended (terminada por decision) y manual_review. Caducar y cancelar NO son lo mismo y por eso no comparten estado.';

-- ---------------------------------------------------------------------------
-- 2 · EL INTENTO CUENTA POR QUÉ FALLÓ, Y SI SALIÓ
-- ---------------------------------------------------------------------------
-- `failure_reason` es texto libre del proveedor, en su idioma y con su
-- ortografía. Decidir con eso si se reintenta sería atar la política de cobro
-- a una cadena que el proveedor puede cambiar sin avisar. La CLASE es nuestra.
alter table public.billing_checkout_intents
  add column if not exists failure_class text;
alter table public.billing_checkout_intents
  drop constraint if exists bci_failure_class_check;
alter table public.billing_checkout_intents
  add constraint bci_failure_class_check check (failure_class is null or failure_class in (
    -- El emisor dijo que no, pero puede decir que sí más tarde: fondos.
    'retryable_decline',
    -- El emisor dijo que no y lo va a seguir diciendo: tarjeta bloqueada.
    'hard_decline',
    -- NO SABEMOS si se cobró. Es el peor caso y tiene nombre propio.
    'provider_unknown',
    -- Ni siquiera salió: la pasarela no respondió antes de enviar.
    'provider_unavailable',
    -- Importe, moneda o entorno que no cuadran. Nunca se reintenta.
    'integrity_mismatch',
    -- La tarjeta guardada ya no sirve. Hace falta uná nueva, no otro intento.
    'payment_method_unavailable'));

-- LA FRONTERA DEL ENVÍO. Es lo único que distingue «no salió» de «salió y no
-- sé qué pasó», y sin esa distinción no hay recuperación posible: se cobraría
-- dos veces o no se cobraría nunca.
alter table public.billing_checkout_intents
  add column if not exists provider_submitted_at timestamptz;

comment on column public.billing_checkout_intents.failure_class is
  'PE-05B5B · Por que fallo, en vocabulario de Trazaloop. La politica de reintentos se decide con ESTO y jamas leyendo el texto del proveedor.';
comment on column public.billing_checkout_intents.provider_submitted_at is
  'PE-05B5B · Cuando la peticion cruzo la frontera hacia el proveedor. Distingue «no salio» de «salio y no se que paso»; sin ese dato la recuperacion tras una caida no puede decidir.';

-- ---------------------------------------------------------------------------
-- 3 · EL CALENDARIO DE REINTENTOS · anclado al vencimiento, no al reloj
-- ---------------------------------------------------------------------------
-- Cuatro huecos y solo cuatro, medidos SIEMPRE desde el vencimiento:
--
--     0 h        24 h        72 h       144 h  |  168 h
--     hueco 0    hueco 1     hueco 2    hueco 3   fin de la gracia
--
-- Anclarlos al vencimiento y no al «último intento + espera» es lo que hace
-- que la frecuencia del planificador NO cambie la política: correr cada minuto
-- o cada seis horas produce exactamente los mismos cuatro cargos.
create or replace function public.billing_renewal_slot_at(
  p_due_at timestamptz,
  p_at timestamptz
)
returns integer
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_at < p_due_at then -1
    when p_at >= p_due_at + interval '144 hours' then 3
    when p_at >= p_due_at + interval '72 hours'  then 2
    when p_at >= p_due_at + interval '24 hours'  then 1
    else 0
  end;
$$;

revoke all on function public.billing_renewal_slot_at(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.billing_renewal_slot_at(timestamptz, timestamptz)
  to authenticated, service_role;

comment on function public.billing_renewal_slot_at(timestamptz, timestamptz) is
  'PE-05B5B · En que hueco de reintento cae un instante, contando desde el vencimiento: 0 h, 24 h, 72 h y 144 h. Devuelve -1 antes del vencimiento. Anclado al vencimiento a proposito: asi la frecuencia del planificador no altera la politica de cobro.';

create or replace function public.billing_renewal_grace_end(p_due_at timestamptz)
returns timestamptz
language sql
immutable
set search_path to 'public'
as $$ select p_due_at + interval '168 hours'; $$;

revoke all on function public.billing_renewal_grace_end(timestamptz) from public, anon;
grant execute on function public.billing_renewal_grace_end(timestamptz)
  to authenticated, service_role;

comment on function public.billing_renewal_grace_end(timestamptz) is
  'PE-05B5B · Los 7 dias de gracia congelados, contados desde el vencimiento. En horas y no en dias naturales para que el limite sea el mismo instante en cualquier huso.';

-- ---------------------------------------------------------------------------
-- 4 · ABRIR EL PERIODO SIGUIENTE · REPARADO
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

  -- Una suscripción que YA caducó no vuelve sola. Volver de Free es contratar,
  -- y eso es una decisión comercial con su propio camino.
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

  -- ---------------------------------------------------------------------
  -- EL ÚLTIMO SIGUE SIN PAGAR
  -- ---------------------------------------------------------------------
  if v_ultimo.status = 'open' then
    -- Pasada la gracia, esa deuda ya no se reintenta: hay que dejar caer la
    -- suscripción. Aquí solo se DICE; quien la deja caer es
    -- `billing_lapse_subscription`, que es donde vive esa decisión.
    if now() > public.billing_renewal_grace_end(v_ultimo.period_end) then
      return jsonb_build_object('status', 'lapse_due', 'reason', 'GRACE_EXPIRED',
        'period_id', v_ultimo.id, 'period_sequence', v_ultimo.period_sequence,
        'period_end', v_ultimo.period_end,
        'grace_end', public.billing_renewal_grace_end(v_ultimo.period_end));
    end if;
    -- Dentro de la gracia es LA MISMA obligación: se reintenta, no se abre otra.
    return jsonb_build_object('status', 'open', 'period_id', v_ultimo.id,
      'period_sequence', v_ultimo.period_sequence, 'reused', true,
      'period_start', v_ultimo.period_start, 'period_end', v_ultimo.period_end,
      'base_amount', v_ultimo.base_amount, 'charge_currency', v_ultimo.charge_currency,
      'grace_end', public.billing_renewal_grace_end(v_ultimo.period_end));
  end if;

  -- ---------------------------------------------------------------------
  -- EL ÚLTIMO ESTÁ PAGADO · esto es una renovación, no una caducidad
  -- ---------------------------------------------------------------------
  -- Da igual que el reloj haya pasado el vencimiento: un cliente al día que
  -- llega al final de su mes es exactamente el caso que hay que renovar. Que
  -- esto devolviera `lapsed` es el defecto AA.
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

comment on function public.billing_open_next_period(uuid) is
  'PE-05B5B · Abre la obligacion siguiente, o devuelve la que sigue sin pagar. La regla mira el ESTADO DEL ULTIMO PERIODO: saldado = renovacion (aunque el reloj ya pasara el vencimiento); abierto y dentro de la gracia = reintento; abierto y pasada la gracia = candidato a caducar. En 0172 la caducidad se comprobaba donde no podia aplicarse y devolvia `lapsed` a clientes AL DIA.';

-- ---------------------------------------------------------------------------
-- 5 · CERRAR LO VENDIDO · sin conceder Free, porque Free ya está debajo
-- ---------------------------------------------------------------------------
-- Toda empresa nace con una asignación `base` PERMANENTE de Free por módulo, y
-- el resolutor se queda con la de mayor rango entre las vivas. Así que dejar de
-- pagar es cerrar lo vendido: Free vuelve a ser la efectiva sola, sin que nadie
-- la conceda. Crear una asignación de Free aquí duplicaría lo que ya existe.
create or replace function public.commercial_end_paid_assignments(
  p_organization_id uuid,
  p_at timestamptz,
  p_reason text
)
returns integer
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_free_rev uuid;
  v_a        record;
  v_cerradas integer := 0;
begin
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'REASON_REQUIRED';
  end if;

  -- La revisión de Free VIGENTE. No para concederla —ya está debajo— sino para
  -- poder escribir en la historia comercial cuál pasa a ser la efectiva.
  select id into v_free_rev from public.plan_revisions
   where plan_code = 'free' and status = 'published' and effective_to is null
   limit 1;
  if v_free_rev is null then
    raise exception 'FREE_REVISION_MISSING';
  end if;

  for v_a in
    select a.id, a.module_code, a.scope, r.plan_code
      from public.organization_plan_assignments a
      join public.plan_revisions r on r.id = a.plan_revision_id
     where a.organization_id = p_organization_id
       and a.grant_kind = 'sold'
       and (a.ends_at is null or a.ends_at > p_at)
       and a.starts_at <= p_at
     for update of a
  loop
    update public.organization_plan_assignments
       set ends_at = p_at where id = v_a.id;

    -- La historia comercial la escribe quien cambia el derecho, con el mismo
    -- vocabulario que usan la contratación y la consola. Lo que pasa a regir
    -- es Free, y aquí queda dicho.
    insert into public.commercial_assignment_events
      (organization_id, assignment_id, scope, module_code, previous_plan_code,
       new_plan_code, plan_revision_id, effective_from, effective_to, reason, actor)
    values (p_organization_id, v_a.id, v_a.scope, v_a.module_code, v_a.plan_code,
            'free', v_free_rev, p_at, null, trim(p_reason), null);

    v_cerradas := v_cerradas + 1;
  end loop;

  return v_cerradas;
end;
$$;

revoke all on function public.commercial_end_paid_assignments(uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.commercial_end_paid_assignments(uuid, timestamptz, text)
  to service_role;

comment on function public.commercial_end_paid_assignments(uuid, timestamptz, text) is
  'PE-05B5B · Cierra las concesiones VENDIDAS de una empresa y no concede nada. El suelo Free es permanente y vuelve a ser el efectivo solo; conceder otro Free aqui seria duplicarlo. Las pruebas y el suelo base no se tocan.';

-- ---------------------------------------------------------------------------
-- 6 · LA CAÍDA · una obligación impagada que se quedó sin gracia
-- ---------------------------------------------------------------------------
create or replace function public.billing_lapse_subscription(p_subscription_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_sub    public.billing_subscriptions%rowtype;
  v_ultimo public.billing_subscription_periods%rowtype;
  v_cerradas integer;
begin
  select * into v_sub from public.billing_subscriptions
   where id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;
  if v_sub.status = 'lapsed' then
    return jsonb_build_object('status', 'already_lapsed', 'subscription_id', v_sub.id);
  end if;
  if v_sub.status not in ('active', 'past_due', 'cancel_at_period_end') then
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

  -- NO SE CAE A NADIE POR ERROR. Solo cae quien tiene una obligación abierta y
  -- se le agotó la gracia. Si el periodo está saldado, esto no es una caída.
  if v_ultimo.status <> 'open' then
    return jsonb_build_object('status', 'not_due', 'reason', 'LAST_PERIOD_SETTLED',
      'period_id', v_ultimo.id);
  end if;
  if now() <= public.billing_renewal_grace_end(v_ultimo.period_end) then
    return jsonb_build_object('status', 'not_due', 'reason', 'WITHIN_GRACE',
      'grace_end', public.billing_renewal_grace_end(v_ultimo.period_end));
  end if;

  -- El derecho pagado se cierra. NO se borra nada: ni datos, ni documentos, ni
  -- el historial, ni el medio de pago, ni la deuda —que es lo que se debe y
  -- sigue siendo verdad—. Los módulos siguen habilitados; lo que baja es el
  -- nivel comercial.
  v_cerradas := public.commercial_end_paid_assignments(
    v_sub.organization_id, now(),
    'Caducó la gracia de 7 días sin cobrar el periodo '
      || v_ultimo.period_sequence || '.');

  update public.billing_subscriptions
     set status = 'lapsed', ended_at = now(), grace_until = null, updated_at = now()
   where id = v_sub.id;

  return jsonb_build_object('status', 'lapsed', 'subscription_id', v_sub.id,
    'organization_id', v_sub.organization_id,
    'unpaid_period_id', v_ultimo.id, 'unpaid_period_sequence', v_ultimo.period_sequence,
    'closed_assignments', v_cerradas);
end;
$$;

revoke all on function public.billing_lapse_subscription(uuid) from public, anon, authenticated;
grant execute on function public.billing_lapse_subscription(uuid) to service_role;

comment on function public.billing_lapse_subscription(uuid) is
  'PE-05B5B · Deja caer una suscripcion cuya obligacion abierta agoto los 7 dias de gracia. Cierra lo vendido y NO concede Free: Free ya esta debajo. No borra datos, ni historial, ni el medio de pago, ni la deuda. Los modulos siguen habilitados; baja el nivel comercial.';

-- ---------------------------------------------------------------------------
-- 7 · ANOTAR UN FALLO DE COBRO · con clase, no con adivinanzas
-- ---------------------------------------------------------------------------
create or replace function public.billing_mark_renewal_failure(
  p_intent_id uuid,
  p_failure_class text,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_int public.billing_checkout_intents%rowtype;
  v_per public.billing_subscription_periods%rowtype;
  v_estado text;
begin
  if p_failure_class not in ('retryable_decline', 'hard_decline', 'provider_unknown',
                             'provider_unavailable', 'integrity_mismatch',
                             'payment_method_unavailable') then
    raise exception 'FAILURE_CLASS_INVALID' using detail = coalesce(p_failure_class, 'null');
  end if;

  select * into v_int from public.billing_checkout_intents
   where id = p_intent_id for update;
  if not found then
    return jsonb_build_object('status', 'intent_not_found');
  end if;
  if v_int.status = 'settled' then
    -- Un cobro ya liquidado no se degrada porque llegue una noticia tarde.
    return jsonb_build_object('status', 'already_settled', 'intent_id', v_int.id);
  end if;

  -- EL CASO QUE MÁS IMPORTA. Si no sabemos si se cobró, el intento se queda EN
  -- VUELO a propósito: mientras lo esté, el índice de 0173 impide abrir otro
  -- para el mismo periodo, y por tanto impide cobrar dos veces. Sale de ahí un
  -- webhook firmado, o una persona.
  v_estado := case p_failure_class
    when 'provider_unknown' then v_int.status
    when 'retryable_decline' then 'declined'
    when 'hard_decline' then 'declined'
    when 'provider_unavailable' then 'failed'
    when 'payment_method_unavailable' then 'failed'
    when 'integrity_mismatch' then 'manual_review'
  end;

  update public.billing_checkout_intents
     set status = v_estado, failure_class = p_failure_class,
         failure_reason = coalesce(p_failure_reason, failure_reason),
         updated_at = now()
   where id = v_int.id;

  -- La suscripción entra en deuda y se le pone la gracia visible, que sale del
  -- vencimiento de la obligación y no del reloj de quien anota el fallo.
  if v_int.period_id is not null then
    select * into v_per from public.billing_subscription_periods where id = v_int.period_id;
    if found and v_per.status = 'open' then
      update public.billing_subscriptions
         set status = case when status = 'active' then 'past_due' else status end,
             grace_until = public.billing_renewal_grace_end(v_per.period_end),
             updated_at = now()
       where id = v_per.subscription_id
         and status in ('active', 'past_due');
    end if;
  end if;

  return jsonb_build_object('status', 'recorded', 'intent_id', v_int.id,
    'intent_status', v_estado, 'failure_class', p_failure_class,
    'organization_id', v_int.organization_id);
end;
$$;

revoke all on function public.billing_mark_renewal_failure(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.billing_mark_renewal_failure(uuid, text, text)
  to service_role;

comment on function public.billing_mark_renewal_failure(uuid, text, text) is
  'PE-05B5B · Anota por que no se cobro, con CLASE y no con el texto del proveedor. `provider_unknown` deja el intento EN VUELO a proposito: mientras lo este, el indice de 0173 impide un segundo cargo para el mismo mes. La suscripcion pasa a deuda con la gracia contada desde el vencimiento.';

-- ---------------------------------------------------------------------------
-- 8 · QUÉ VENCE · la única fuente de la verdad del planificador
-- ---------------------------------------------------------------------------
-- Todo sale del dominio comercial: el periodo, su vencimiento y los huecos de
-- reintento. Nada sale del reloj del proceso, del panel de la pasarela ni de
-- cuántas veces se haya ejecutado nadie.
--
-- Devuelve TRES acciones, porque el planificador tiene tres trabajos y no uno:
--
--   renew   el mes está pagado y se acabó: hay que abrir el siguiente y cobrar
--   retry   hay una deuda dentro de la gracia y toca otro intento
--   lapse   la gracia se agotó: hay que dejarla caer
create or replace function public.billing_due_renewals(
  p_now timestamptz default now(),
  p_limit integer default 100
)
returns table (
  action            text,
  subscription_id   uuid,
  organization_id   uuid,
  period_id         uuid,
  period_sequence   integer,
  due_at            timestamptz,
  grace_end         timestamptz,
  attempt_number    integer,
  slot              integer,
  payment_method_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ultimo as (
    select distinct on (p.subscription_id)
           p.subscription_id, p.id as period_id, p.period_sequence,
           p.period_start, p.period_end, p.status
      from public.billing_subscription_periods p
     order by p.subscription_id, p.period_sequence desc
  ),
  viva as (
    select s.id, s.organization_id, s.status, s.provider, u.period_id,
           u.period_sequence, u.period_end, u.status as period_status,
           -- El vencimiento de la obligación EN JUEGO. Si el último periodo
           -- está pagado, lo que vence es su final; si está abierto, venció al
           -- empezar y lo que corre es su gracia.
           u.period_end as due_at
      from public.billing_subscriptions s
      join ultimo u on u.subscription_id = s.id
     where s.status in ('active', 'past_due')
       -- Cancelada al vencimiento no se renueva: es una decisión de quien paga
       -- y el planificador no la discute. Free y la prueba no tienen cobro, y
       -- por eso no hay suscripción que las represente.
       and not s.cancel_at_period_end
       and s.plan_code in ('full', 'extra')
  ),
  medio as (
    select distinct on (m.organization_id, m.provider)
           m.organization_id, m.provider, m.id as payment_method_id
      from public.billing_payment_methods m
     where m.status = 'active'
     order by m.organization_id, m.provider, m.created_at desc
  ),
  -- Un cobro EN VUELO bloquea: puede estar en la red ahora mismo, o ser un
  -- `provider_unknown` sin resolver. En los dos casos, mandar otro sería
  -- arriesgarse a cobrar dos veces.
  en_vuelo as (
    select i.period_id from public.billing_checkout_intents i
     where i.period_id is not null
       and i.status in ('created', 'provider_created', 'authorized')
  ),
  -- El último hueco CONSUMIDO se deduce de cuándo nacieron los intentos, no de
  -- un contador: así una pasada que llega tarde no encadena los que se perdió.
  gastados as (
    select i.period_id,
           count(*)::int as intentos,
           max(public.billing_renewal_slot_at(u.period_end, i.created_at)) as ultimo_hueco
      from public.billing_checkout_intents i
      join public.billing_subscription_periods p on p.id = i.period_id
      join ultimo u on u.period_id = p.id
     where i.period_id is not null
     group by i.period_id
  )
  select
    case
      when v.period_status = 'open'
       and p_now > public.billing_renewal_grace_end(v.period_end) then 'lapse'
      when v.period_status = 'open' then 'retry'
      else 'renew'
    end                                            as action,
    v.id                                           as subscription_id,
    v.organization_id                              as organization_id,
    case when v.period_status = 'open' then v.period_id end as period_id,
    v.period_sequence                              as period_sequence,
    v.due_at                                       as due_at,
    public.billing_renewal_grace_end(v.due_at)     as grace_end,
    coalesce(g.intentos, 0) + 1                    as attempt_number,
    public.billing_renewal_slot_at(v.due_at, p_now) as slot,
    md.payment_method_id                           as payment_method_id
  from viva v
  left join gastados g on g.period_id = v.period_id
  left join en_vuelo f on f.period_id = v.period_id
  left join medio md on md.organization_id = v.organization_id and md.provider = v.provider
 where
   -- Nada antes de su hora. La renovación empieza EN el vencimiento.
   p_now >= v.due_at
   -- Nada con un cobro en vuelo.
   and f.period_id is null
   and (
     -- Caducar no necesita medio de pago ni huecos: es lo contrario de cobrar.
     (v.period_status = 'open' and p_now > public.billing_renewal_grace_end(v.period_end))
     or (
       -- Para cobrar hacen falta las dos cosas: una tarjeta y un hueco nuevo.
       md.payment_method_id is not null
       and public.billing_renewal_slot_at(v.due_at, p_now) >= 0
       and public.billing_renewal_slot_at(v.due_at, p_now)
           > coalesce(g.ultimo_hueco, -1)
       and coalesce(g.intentos, 0) < 4
     )
   )
 order by v.due_at
 limit greatest(p_limit, 0);
$$;

revoke all on function public.billing_due_renewals(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.billing_due_renewals(timestamptz, integer) to service_role;

comment on function public.billing_due_renewals(timestamptz, integer) is
  'PE-05B5B · Que le toca al planificador: renovar, reintentar o dejar caer. Todo sale del dominio comercial. El hueco de reintento se deduce de CUANDO nacieron los intentos anteriores, no de un contador, asi que una pasada que llega con horas de retraso consume UN hueco y nunca encadena los que se perdio.';

-- ---------------------------------------------------------------------------
-- 9 · QUÉ HIZO CADA PASADA · observación, no autoridad
-- ---------------------------------------------------------------------------
-- La verdad financiera vive en los cobros y en los periodos. Esto es para
-- poder mirar qué pasó anoche sin abrir la base a mano, y nada más. Si esta
-- tabla se perdiera entera, no se perdería ni un peso de historia.
create table if not exists public.billing_renewal_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  due_found integer not null default 0,
  charged integer not null default 0,
  retried integer not null default 0,
  lapsed integer not null default 0,
  skipped integer not null default 0,
  failures integer not null default 0,
  -- Decisiones, con lo justo para entenderlas. Nunca datos de tarjeta.
  decisions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint brr_status_check check (status in ('running', 'success', 'partial', 'failed'))
);

create index if not exists brr_started_idx
  on public.billing_renewal_runs (started_at desc);

alter table public.billing_renewal_runs enable row level security;

-- Solo la plataforma. Una empresa no necesita ver el barrido de todas las
-- demás, y lo suyo ya lo ve en sus periodos y en sus cobros.
drop policy if exists billing_renewal_runs_read on public.billing_renewal_runs;
create policy billing_renewal_runs_read on public.billing_renewal_runs
  for select to authenticated
  using (public.is_platform_staff());

revoke all on public.billing_renewal_runs from anon;
revoke insert, update, delete, truncate on public.billing_renewal_runs from authenticated, anon;
grant select on public.billing_renewal_runs to authenticated;

comment on table public.billing_renewal_runs is
  'PE-05B5B · Que hizo cada pasada del cobro automatico. OBSERVACION, no autoridad: la verdad financiera esta en billing_payments y en los periodos. Nunca guarda datos de tarjeta, testigos ni secretos.';
comment on column public.billing_renewal_runs.decisions is
  'PE-05B5B · Una entrada por decision, con identificadores y clasificacion. Nada que no se pueda enseniar.';

-- ---------------------------------------------------------------------------
-- 10 · CUÁNTO SE COBRA POR UNA OBLIGACIÓN · una sola aritmética
-- ---------------------------------------------------------------------------
-- Hasta ahora el total se calculaba en DOS sitios: al cobrar y al liquidar. Que
-- coincidieran dependía de que nadie tocara uno de los dos. Aquí pasa a haber
-- una sola función, y los dos caminos la llaman.
--
-- Y el impuesto se resuelve a la fecha de la OBLIGACIÓN, no a la del cobro. Un
-- pago que entra el quinto día de gracia sigue siendo el mes de octubre: si el
-- IVA cambiara el día 3, cambiarle el impuesto por haber pagado tarde sería
-- cobrarle a alguien por la fecha de su retraso.
--
-- El tipo de cambio NO se vuelve a mirar: la base en pesos está congelada desde
-- que se contrató.
create or replace function public.billing_period_charge_total(p_period_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_per   public.billing_subscription_periods%rowtype;
  v_regla jsonb;
  v_imp   bigint;
begin
  select * into v_per from public.billing_subscription_periods where id = p_period_id;
  if not found then
    return jsonb_build_object('status', 'period_not_found');
  end if;

  -- LA FECHA DE LA OBLIGACIÓN. Para el periodo N+1 su comienzo ES su
  -- vencimiento, así que las dos lecturas del encargo coinciden y no hay que
  -- elegir entre ellas.
  v_regla := public.billing_resolve_tax_rule('self_service_saas', v_per.period_start, 'CO');
  if v_regla->>'status' <> 'found' then
    return jsonb_build_object('status', 'tax_unresolved', 'reason', v_regla->>'reason');
  end if;
  v_imp := public.billing_tax_amount(v_per.base_amount,
                                     (v_regla->>'rate_basis_points')::integer);

  return jsonb_build_object(
    'status', 'found',
    'period_id', v_per.id,
    'base_amount', v_per.base_amount,
    'charge_currency', v_per.charge_currency,
    'tax_rule_id', v_regla->>'tax_rule_id',
    'tax_rate_basis_points', (v_regla->>'rate_basis_points')::integer,
    'tax_amount', v_imp,
    'total_amount', v_per.base_amount + v_imp,
    'tax_resolved_at', v_per.period_start);
end;
$$;

revoke all on function public.billing_period_charge_total(uuid) from public, anon, authenticated;
grant execute on function public.billing_period_charge_total(uuid) to service_role;

comment on function public.billing_period_charge_total(uuid) is
  'PE-05B5B · Lo que cuesta una obligacion: base congelada + impuesto vigente A LA FECHA DE LA OBLIGACION, no a la del cobro. Un pago que entra el quinto dia de gracia sigue siendo el mes que era. El tipo de cambio no se vuelve a mirar. Una sola aritmetica para cobrar y para liquidar.';

-- ---------------------------------------------------------------------------
-- 11 · LIQUIDAR · con esa misma aritmética
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
  v_cargo jsonb;
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

  -- La MISMA cuenta que usó quien cobró.
  v_cargo := public.billing_period_charge_total(v_per.id);
  if v_cargo->>'status' <> 'found' then
    return jsonb_build_object('outcome', 'tax_unresolved', 'reason', v_cargo->>'reason',
      'organization_id', v_per.organization_id);
  end if;
  v_imp := (v_cargo->>'tax_amount')::bigint;
  v_total := (v_cargo->>'total_amount')::bigint;

  if p_outcome = 'approved' then
    if p_currency is null or upper(p_currency) <> upper(v_per.charge_currency)
       or p_amount is null or p_amount <> v_total then
      return jsonb_build_object('outcome', 'reconciliation_mismatch',
        'expected', v_total, 'received', p_amount,
        'organization_id', v_per.organization_id);
    end if;
  end if;

  -- El cobro se anota SIEMPRE, con la instantánea fiscal que se le aplicó: así
  -- una regla que cambie mañana no reescribe lo que se cobró ayer.
  insert into public.billing_payments (
    organization_id, subscription_id, period_id, quote_id, provider, provider_payment_id,
    base_amount, discount_amount, service_class, tax_rule_id,
    tax_rate_basis_points, tax_amount, total_amount, currency, fx_rate_micros,
    status, paid_at, failed_at, idempotency_key)
  values (
    v_per.organization_id, v_sub.id, v_per.id, null, p_provider, p_provider_payment_id,
    v_per.base_amount, 0, 'self_service_saas', (v_cargo->>'tax_rule_id')::uuid,
    (v_cargo->>'tax_rate_basis_points')::integer, v_imp, v_total,
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

  -- El derecho se extiende AL PERIODO QUE YA ESTABA DEFINIDO.
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
    'total_amount', v_total);
end;
$$;

revoke all on function public.billing_settle_period_payment(uuid, text, text, text, bigint, text, boolean)
  from public, anon, authenticated;
grant execute on function public.billing_settle_period_payment(uuid, text, text, text, bigint, text, boolean)
  to service_role;

comment on function public.billing_settle_period_payment(uuid, text, text, text, bigint, text, boolean) is
  'PE-05B5B · Salda una obligacion UNA vez, con la aritmetica de `billing_period_charge_total`: impuesto a la fecha de la obligacion, no a la del cobro. Un segundo pago aprobado se anota y va a revision sin avanzar el derecho.';

-- ---------------------------------------------------------------------------
-- 12 · A QUÉ CORREO SE LE COBRA
-- ---------------------------------------------------------------------------
-- La pasarela pide un correo de quien paga y en la renovación no hay sesión de
-- nadie. Se usa el de quien contrató, y si esa persona ya no está, el de la
-- administración de la empresa. NO se guarda una copia en facturación: se
-- pregunta al padrón cuando hace falta, que es una cosa menos que mantener
-- sincronizada y una copia menos de un dato personal.
create or replace function public.billing_renewal_customer_email(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select pr.email
       from public.billing_subscriptions s
       join public.profiles pr on pr.id = s.created_by
      where s.organization_id = p_organization_id
        and s.status in ('active', 'past_due', 'cancel_at_period_end')
      order by s.created_at desc limit 1),
    (select pr.email
       from public.memberships m
       join public.profiles pr on pr.id = m.user_id
      where m.organization_id = p_organization_id
        and m.role_code = 'admin' and m.status = 'active'
      order by m.created_at limit 1));
$$;

revoke all on function public.billing_renewal_customer_email(uuid)
  from public, anon, authenticated;
grant execute on function public.billing_renewal_customer_email(uuid) to service_role;

comment on function public.billing_renewal_customer_email(uuid) is
  'PE-05B5B · El correo de quien paga, para la pasarela. Se pregunta al padron en vez de guardar otra copia de un dato personal en facturacion.';
