-- ===========================================================================
-- Trazaloop · 0177 · El lado que falla: cuándo vence, qué gasta un hueco y
--                    qué se hace cuando no se sabe
-- ===========================================================================
--
-- Cuatro defectos, encontrados ejecutando y no leyendo. Los tres primeros solo
-- se notan cuando algo sale mal —que es cuando peor se notan las cosas— y el
-- cuarto le regalaba un mes entero a quien no pagaba.
--
-- 1 · UN MES IMPAGADO VENCÍA AL TERMINAR, NO AL EMPEZAR
--
-- La selección tomaba el vencimiento del FINAL del último periodo. Para el mes
-- que hay que pagar eso es correcto —el siguiente empieza donde acaba este—,
-- pero para un mes YA ABIERTO Y SIN PAGAR es un mes tarde:
--
--     el mes 2 empezó hace 10 días y no está pagado, la gracia son 7
--     → la selección no lo veía siquiera
--     → habría cobrado Free y servido Full veinte días más, y una semana encima
--
-- El vencimiento es el PRINCIPIO de la obligación que toca pagar. Si el último
-- periodo está saldado, la que toca es la siguiente y empieza donde acaba esta.
-- Si está abierto, la que toca es esa y empezó cuando empezó.
--
-- 2 · UN INTENTO QUE NUNCA SALIÓ GASTABA UN HUECO DE COBRO
--
-- Los cuatro huecos son intentos de COBRO, no filas en una tabla. Contar los
-- intentos creados hacía que un proceso caído antes de enviar consumiera uno de
-- los cuatro que tiene el cliente. Ahora solo cuenta lo que cruzó la frontera:
-- `provider_submitted_at`.
--
-- 3 · Y ESE MISMO INTENTO DEJABA EL MES ATASCADO PARA SIEMPRE
--
-- Como bloqueaba por «hay algo en vuelo» y el orquestador solo sabía CREAR, el
-- índice de un solo intento por obligación rechazaba el siguiente y la empresa
-- se quedaba sin cobrar hasta que alguien lo mirara a mano. Un intento que no
-- salió no es un cobro en vuelo: es un intento que se RETOMA.
--
-- 4 · LA DUDA NO CUBRÍA EL DESCUADRE
--
-- `provider_unknown` bloqueaba cobrar otra vez y bloqueaba caducar, que es lo
-- correcto. Un descuadre de importe, moneda o firma dejaba el intento en
-- revisión pero LIBERABA el sitio, así que podía salir otro cobro con una
-- incertidumbre financiera abierta. Las dos dudas son dudas.
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
  if to_regprocedure('public.billing_retire_subscription(uuid, text, text)') is null then
    raise exception '0177 presupone 0176';
  end if;
  raise notice '0177 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · LAS DOS DUDAS · ninguna se resuelve con el reloj
-- ---------------------------------------------------------------------------
create or replace function public.billing_has_unresolved_charge(p_subscription_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.billing_checkout_intents i
     where i.billing_subscription_id = p_subscription_id
       and i.provider_submitted_at is not null
       and (
         -- Salió y no sabemos qué pasó.
         (i.failure_class = 'provider_unknown'
          and i.status in ('created', 'provider_created', 'authorized'))
         -- O hay un cobro del proveedor que NO cuadra con lo que se pidió. Que
         -- no cuadre no significa que no se cobrara: significa que no se sabe.
         or (i.failure_class = 'integrity_mismatch' and i.status = 'manual_review')
       )
  );
$$;

revoke all on function public.billing_has_unresolved_charge(uuid) from public, anon;
grant execute on function public.billing_has_unresolved_charge(uuid)
  to authenticated, service_role;

comment on function public.billing_has_unresolved_charge(uuid) is
  'PE-05B5E · Si hay dinero en duda: un cobro que salio sin desenlace, o uno que llego descuadrado. Mientras la haya no se cobra otra vez —podrian ser dos— ni se deja caer —podria estar pagado—. El reloj no resuelve una duda sobre dinero.';

-- ---------------------------------------------------------------------------
-- 2 · TOMAR EL TURNO DE ENVIAR · uno solo, y retomando lo que se quedó a medias
-- ---------------------------------------------------------------------------
-- Devuelve el intento con el que hay que cobrar, y marca la frontera del envío
-- en el MISMO paso. Es una comparación-y-cambio: solo un proceso puede pasar de
-- «sin enviar» a «enviado», así que dos trabajadores a la vez no mandan dos
-- cargos aunque los dos vean el mismo intento.
--
-- Y si hay uno que se quedó sin enviar —el proceso se cayó—, se RETOMA con su
-- misma referencia. Crear otro sería gastarle un hueco al cliente por una caída
-- nuestra.
create or replace function public.billing_claim_renewal_attempt(p_period_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_int public.billing_checkout_intents%rowtype;
  v_id  uuid;
begin
  select * into v_int from public.billing_checkout_intents
   where period_id = p_period_id
     and status in ('created', 'provider_created', 'authorized')
   order by created_at desc limit 1
   for update;

  if not found then
    return jsonb_build_object('status', 'no_attempt');
  end if;

  if v_int.provider_submitted_at is not null then
    -- Ya salió. Lo que pase con él no lo decide otro envío.
    return jsonb_build_object('status', 'already_submitted', 'intent_id', v_int.id);
  end if;

  update public.billing_checkout_intents
     set provider_submitted_at = now(), status = 'provider_created', updated_at = now()
   where id = v_int.id and provider_submitted_at is null
   returning id into v_id;

  if v_id is null then
    return jsonb_build_object('status', 'claimed_elsewhere', 'intent_id', v_int.id);
  end if;
  return jsonb_build_object('status', 'claimed', 'intent_id', v_id,
    'resumed', v_int.status <> 'created');
end;
$$;

revoke all on function public.billing_claim_renewal_attempt(uuid)
  from public, anon, authenticated;
grant execute on function public.billing_claim_renewal_attempt(uuid) to service_role;

comment on function public.billing_claim_renewal_attempt(uuid) is
  'PE-05B5E · Toma el turno de enviar un cobro y marca la frontera en el mismo paso. Comparacion-y-cambio: solo uno puede pasar de «sin enviar» a «enviado». Un intento que se quedo sin enviar se RETOMA con su misma referencia, porque crear otro le gastaria un hueco al cliente por una caida nuestra.';

-- ---------------------------------------------------------------------------
-- 3 · ANOTAR EL FALLO · y no gastar lo que no se gastó
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
    return jsonb_build_object('status', 'already_settled', 'intent_id', v_int.id);
  end if;

  -- QUÉ SE HACE CON EL INTENTO, según lo que sepamos de él:
  --
  --   la petición NO salió    → se deja vivo y SIN ENVIAR: se retoma tal cual,
  --                             y no gasta ninguno de los cuatro huecos;
  --   salió y no hay noticia  → se deja en vuelo: mientras lo esté, nadie
  --                             puede mandar otro cargo por ese mes;
  --   el proveedor respondió  → terminal: el hueco se gastó de verdad;
  --   llegó algo descuadrado  → revisión, y sigue bloqueando.
  v_estado := case p_failure_class
    when 'provider_unavailable' then v_int.status
    when 'provider_unknown' then v_int.status
    when 'retryable_decline' then 'declined'
    when 'hard_decline' then 'declined'
    when 'payment_method_unavailable' then 'failed'
    when 'integrity_mismatch' then 'manual_review'
  end;

  update public.billing_checkout_intents
     set status = v_estado, failure_class = p_failure_class,
         failure_reason = coalesce(p_failure_reason, failure_reason),
         -- Si nunca salió, la frontera se borra: no hubo envío que anotar, y
         -- dejarla puesta convertiría una caída de red en un hueco gastado.
         provider_submitted_at = case when p_failure_class = 'provider_unavailable'
                                      then null else provider_submitted_at end,
         updated_at = now()
   where id = v_int.id;

  if v_int.period_id is not null then
    select * into v_per from public.billing_subscription_periods where id = v_int.period_id;
    if found and v_per.status = 'open' then
      update public.billing_subscriptions
         set status = case when status = 'active' then 'past_due' else status end,
             grace_until = public.billing_renewal_grace_end(v_per.period_start),
             updated_at = now()
       where id = v_per.subscription_id
         and status in ('active', 'past_due');
    end if;
  end if;

  return jsonb_build_object('status', 'recorded', 'intent_id', v_int.id,
    'intent_status', v_estado, 'failure_class', p_failure_class,
    'consumed_slot', p_failure_class in ('retryable_decline', 'hard_decline'),
    'organization_id', v_int.organization_id);
end;
$$;

revoke all on function public.billing_mark_renewal_failure(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.billing_mark_renewal_failure(uuid, text, text)
  to service_role;

comment on function public.billing_mark_renewal_failure(uuid, text, text) is
  'PE-05B5E · Anota por que no se cobro, con CLASE. Lo que NO salio se deja sin enviar y se retoma —una caida de red no le gasta un hueco al cliente—; lo que salio sin noticia se queda en vuelo y bloquea; lo que el proveedor contesto es terminal; lo descuadrado va a revision y sigue bloqueando.';

-- ---------------------------------------------------------------------------
-- 4 · QUÉ LE TOCA A CADA UNA · con el vencimiento donde tiene que estar
-- ---------------------------------------------------------------------------
-- EL VENCIMIENTO ES EL PRINCIPIO DE LO QUE HAY QUE PAGAR:
--
--     último periodo SALDADO  → toca el siguiente, que empieza donde acaba este
--     último periodo ABIERTO  → toca ESE, y empezó cuando empezó
--
-- Y los cuatro huecos son intentos de COBRO: solo cuenta lo que cruzó la
-- frontera del envío, y el hueco se mide desde cuándo se envió.
--
-- Precedencia, escrita y numerada:
--
--   1. nada que hacer                     (no sale en la lista)
--   2. se va, o baja de plan              cancel_due · downgrade_due
--   3. hay dinero en duda                 manual_review_required
--   4. se agotó la gracia                 lapse_due
--   5. no hay tarjeta utilizable          payment_method_unavailable
--   6. hay un cobro EN VUELO              (no sale: se espera)
--   7. toca reintentar                    retry
--   8. toca renovar                       renew
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
    select s.id, s.organization_id, s.status, s.provider, s.cancel_at_period_end,
           s.scheduled_plan_revision_id, s.scheduled_effective_at,
           u.period_id, u.period_sequence, u.period_start, u.period_end,
           u.status as period_status,
           -- AQUÍ ESTABA EL DEFECTO. Un mes impagado vence cuando EMPIEZA.
           case when u.status = 'open' then u.period_start else u.period_end end as due_at,
           public.billing_has_unresolved_charge(s.id) as en_duda
      from public.billing_subscriptions s
      join ultimo u on u.subscription_id = s.id
     where s.status in ('active', 'past_due')
       and s.plan_code in ('full', 'extra')
  ),
  medio as (
    select distinct on (m.organization_id, m.provider)
           m.organization_id, m.provider, m.id as payment_method_id
      from public.billing_payment_methods m
     where m.status = 'active'
     order by m.organization_id, m.provider, m.created_at desc
  ),
  -- EN VUELO es lo que YA SALIÓ y sigue sin desenlace. Un intento creado que
  -- nunca se envió no bloquea: se retoma.
  en_vuelo as (
    select i.period_id from public.billing_checkout_intents i
     where i.period_id is not null
       and i.status in ('created', 'provider_created', 'authorized')
       and i.provider_submitted_at is not null
  ),
  -- Los huecos gastados son ENVÍOS, no filas. Y el hueco se mide por cuándo se
  -- envió, que es cuando el cliente recibió el intento de cobro.
  gastados as (
    select i.period_id,
           count(*)::int as enviados,
           max(public.billing_renewal_slot_at(
             case when u.status = 'open' then u.period_start else u.period_end end,
             i.provider_submitted_at)) as ultimo_hueco,
           bool_or(i.failure_class = 'hard_decline') as rechazo_duro
      from public.billing_checkout_intents i
      join public.billing_subscription_periods p on p.id = i.period_id
      join ultimo u on u.period_id = p.id
     where i.period_id is not null
       and i.provider_submitted_at is not null
     group by i.period_id
  ),
  decidido as (
    select v.*, md.payment_method_id, g.enviados, g.ultimo_hueco,
           coalesce(g.rechazo_duro, false) as rechazo_duro,
           case
             when v.period_status = 'settled' and p_now >= v.period_end
                  and v.cancel_at_period_end then 'cancel_due'
             when v.period_status = 'settled' and p_now >= v.period_end
                  and v.scheduled_plan_revision_id is not null
                  and p_now >= v.scheduled_effective_at then 'downgrade_due'
             when v.en_duda then 'manual_review_required'
             when v.period_status = 'open'
                  and p_now > public.billing_renewal_grace_end(v.period_start)
               then 'lapse_due'
             when md.payment_method_id is null then 'payment_method_unavailable'
             when f.period_id is not null then 'in_flight'
             -- Un rechazo DURO no se reintenta aunque queden huecos: el emisor
             -- ya dijo que no y lo va a seguir diciendo. La gracia sí corre.
             when coalesce(g.rechazo_duro, false) then 'hard_declined'
             when public.billing_renewal_slot_at(v.due_at, p_now) >= 0
                  and public.billing_renewal_slot_at(v.due_at, p_now)
                      > coalesce(g.ultimo_hueco, -1)
                  and coalesce(g.enviados, 0) < 4
               then case when v.period_status = 'open' then 'retry' else 'renew' end
             else 'nothing'
           end as accion
      from viva v
      left join gastados g on g.period_id = v.period_id
      left join en_vuelo f on f.period_id = v.period_id
      left join medio md on md.organization_id = v.organization_id
                        and md.provider = v.provider
     where p_now >= v.due_at
  )
  select d.accion,
         d.id, d.organization_id,
         case when d.period_status = 'open' then d.period_id end,
         d.period_sequence, d.due_at,
         public.billing_renewal_grace_end(d.due_at),
         coalesce(d.enviados, 0) + 1,
         public.billing_renewal_slot_at(d.due_at, p_now),
         d.payment_method_id
    from decidido d
   where d.accion not in ('in_flight', 'hard_declined', 'nothing')
   order by d.due_at
   limit greatest(p_limit, 0);
$$;

revoke all on function public.billing_due_renewals(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.billing_due_renewals(timestamptz, integer) to service_role;

comment on function public.billing_due_renewals(timestamptz, integer) is
  'PE-05B5E · Que le toca a cada suscripcion. El vencimiento es el PRINCIPIO de la obligacion que hay que pagar: si el ultimo periodo esta saldado, la siguiente; si esta abierto, esa. Los cuatro huecos cuentan ENVIOS, no filas. Un rechazo duro no se reintenta, pero la gracia sigue corriendo y al agotarse se cae.';

-- ---------------------------------------------------------------------------
-- 5 · Y LA CADUCIDAD MIDE LA GRACIA DESDE EL PRINCIPIO DEL MES IMPAGADO
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
  if v_sub.status in ('lapsed', 'cancelled', 'retired') then
    return jsonb_build_object('status', 'already_' || v_sub.status,
      'subscription_id', v_sub.id);
  end if;
  if v_sub.status not in ('active', 'past_due', 'cancel_at_period_end') then
    return jsonb_build_object('status', 'subscription_not_live', 'reason', v_sub.status);
  end if;

  if public.billing_has_unresolved_charge(p_subscription_id) then
    return jsonb_build_object('status', 'blocked',
      'reason', 'UNRESOLVED_PROVIDER_CHARGE', 'subscription_id', v_sub.id);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('billing:' || v_sub.organization_id::text, 0));

  select * into v_ultimo from public.billing_subscription_periods
   where subscription_id = p_subscription_id
   order by period_sequence desc limit 1;
  if not found then
    return jsonb_build_object('status', 'anchor_missing');
  end if;
  if v_ultimo.status <> 'open' then
    return jsonb_build_object('status', 'not_due', 'reason', 'LAST_PERIOD_SETTLED',
      'period_id', v_ultimo.id);
  end if;
  -- La gracia corre desde que el mes EMPEZÓ sin pagarse, no desde que acaba.
  if now() <= public.billing_renewal_grace_end(v_ultimo.period_start) then
    return jsonb_build_object('status', 'not_due', 'reason', 'WITHIN_GRACE',
      'grace_end', public.billing_renewal_grace_end(v_ultimo.period_start));
  end if;

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
  'PE-05B5E · Deja caer una suscripcion cuyo mes impagado agoto los 7 dias de gracia, contados desde que ESE mes empezo. Se niega si hay dinero en duda. Cierra lo vendido y no concede Free, que ya esta debajo.';

-- ---------------------------------------------------------------------------
-- 6 · LO QUE UNA PERSONA NECESITA VER · sin un solo dato de tarjeta
-- ---------------------------------------------------------------------------
create or replace view public.v_billing_renewal_operations
with (security_invoker = true) as
  select
    s.organization_id,
    s.id as subscription_id,
    s.status as subscription_status,
    s.plan_code,
    s.billing_interval,
    p.id as period_id,
    p.period_sequence,
    p.period_start,
    p.period_end,
    p.status as period_status,
    case when p.status = 'open' then p.period_start else p.period_end end as due_at,
    public.billing_renewal_grace_end(
      case when p.status = 'open' then p.period_start else p.period_end end) as grace_end,
    i.id as attempt_id,
    i.provider,
    i.provider_subscription_id,
    i.provider_submitted_at,
    i.status as attempt_status,
    i.failure_class,
    public.billing_has_unresolved_charge(s.id) as manual_review_required
  from public.billing_subscriptions s
  -- SIN unir con `organizations`: su política solo deja pasar a los MIEMBROS,
  -- y quien opera la plataforma no lo es de ninguna empresa. Unirla habría
  -- dejado la vista vacía justo para quien tiene que mirarla. El nombre se
  -- resuelve donde ya se resuelve; aquí manda el identificador.
  left join lateral (
    select * from public.billing_subscription_periods pp
     where pp.subscription_id = s.id
     order by pp.period_sequence desc limit 1
  ) p on true
  left join lateral (
    select * from public.billing_checkout_intents ii
     where ii.period_id = p.id
     order by ii.created_at desc limit 1
  ) i on true
 where s.status in ('active', 'past_due', 'cancel_at_period_end');

revoke all on public.v_billing_renewal_operations from anon;
grant select on public.v_billing_renewal_operations to authenticated;

comment on view public.v_billing_renewal_operations is
  'PE-05B5E · Lo que una persona de plataforma necesita ver para entender un cobro que no salio: que vencia, cuando, hasta cuando hay gracia, que intento hubo, si salio y como fallo. Ni un dato de tarjeta, ni un testigo, ni un secreto. `security_invoker`: quien no puede ver esas filas, no las ve.';
