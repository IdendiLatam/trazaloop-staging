-- ===========================================================================
-- Trazaloop · MP0186 · Reconciliar lo que ya cobró el proveedor
-- ===========================================================================
--
-- DE QUÉ VA ESTA MIGRACIÓN
--
-- 0184 dejó dicho quién manda en el calendario de cada pasarela: con Wompi
-- cobramos nosotros, con Mercado Pago cobra él. 0185 dejó dicho qué oferta de
-- Trazaloop es cada plan de allí. Falta lo tercero, que es lo que convierte un
-- aviso del proveedor en historia contable nuestra: dado un cobro que YA
-- OCURRIÓ fuera, producir aquí —exactamente una vez— la suscripción, el
-- periodo, el pago y el derecho.
--
-- 0186 NO COBRA. No inicia una renovación, no llama a ningún adaptador de
-- cobro, no crea un medio de pago. Solo reconoce hechos económicos ajenos.
--
-- LAS CUATRO PIEZAS
--
--   1. La suscripción del proveedor identifica UNA suscripción nuestra. Hasta
--      hoy eso solo lo sostenía el código.
--   2. El intento de contratación recuerda con qué proyección salió. Es
--      auditoría, no identidad: la identidad se puede reconstruir releyendo al
--      proveedor.
--   3. El CICLO EXTERNO tiene identidad propia y única. Sin eso, el mismo mes
--      del proveedor puede saldarse dos veces.
--   4. Una primitiva que reconcilia y que, si el mismo hecho vuelve a llegar,
--      no hace nada nuevo.
--
-- LO QUE NO HACE, Y ES DELIBERADO
--
-- No toca `billing_open_next_period`. Ese primitivo calcula el mes siguiente
-- desde NUESTRA ancla porque la obligación es nuestra. Aquí la obligación la
-- fija el proveedor: el periodo no se «abre para cobrarlo», se CREA al
-- reconocer que ya se cobró, y su sitio en la historia sale de la fecha
-- económica del proveedor, no del orden en que lleguen los avisos.
--
-- No inventa semántica de Mercado Pago en SQL. `provider_invoice_id` y
-- `provider_cycle_at` son huecos con nombre neutro; qué campo del proveedor
-- los alimenta se documenta abajo y lo decide el runtime.
--
-- Producción tiene organizaciones y personas reales desde el 7 de septiembre
-- de 2026. Todo aquí es aditivo: ninguna columna con valor por omisión sobre
-- filas existentes, ningún NOT NULL sin relleno, ni un UPDATE a datos vivos.

-- ---------------------------------------------------------------------------
-- 0 · LO QUE ESTA MIGRACIÓN PRESUPONE
-- ---------------------------------------------------------------------------
--
-- Aplicarla fuera de orden dejaría objetos colgando de tablas que no existen.
-- Y hay una precondición que NO es de esquema: si ya hubiera dos suscripciones
-- apuntando al mismo objeto del proveedor, el índice único de abajo fallaría a
-- mitad de la migración. Se comprueba antes y se dice por qué.
do $$
declare
  v_dup integer;
begin
  if to_regclass('public.billing_subscription_periods') is null
     or to_regclass('public.billing_provider_capabilities') is null
     or to_regclass('public.billing_provider_plans') is null
     or to_regclass('public.billing_checkout_intents') is null then
    raise exception '0186 presupone 0172, 0184 y 0185';
  end if;

  select count(*) into v_dup from (
    select 1 from public.billing_subscriptions
     where provider_subscription_id is not null
     group by provider, provider_subscription_id
    having count(*) > 1) d;
  if v_dup > 0 then
    raise exception '0186 · hay % objeto(s) del proveedor con más de una suscripción local', v_dup
      using hint = 'Resolver a mano ANTES de aplicar: la unicidad no puede '
                || 'decidir cuál de las dos es la buena.';
  end if;

  raise notice '0186 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · LA IDENTIDAD DE LA SUSCRIPCIÓN, EN LOS DATOS
-- ---------------------------------------------------------------------------
--
-- `provider_subscription_id` existe desde 0169 y hasta hoy nada impedía esto:
--
--   mismo preapproval de Mercado Pago → organización A → suscripción local 1
--   mismo preapproval de Mercado Pago → organización B → suscripción local 2
--
-- Con la recurrencia en manos del proveedor eso no es un descuido cosmético:
-- cada cobro suyo llega identificado SOLO por el preapproval, así que dos filas
-- locales significan que la reconciliación no sabe a quién dar el derecho —y
-- que puede dárselo a la organización equivocada.
--
-- Parcial, porque el identificador es nulo hasta que el proveedor lo devuelve
-- y hay suscripciones que nunca llegan a tenerlo.
create unique index if not exists billing_subscriptions_provider_uniq
  on public.billing_subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

comment on index public.billing_subscriptions_provider_uniq is
  'Un objeto del proveedor pertenece como mucho a una suscripción local.';

-- ---------------------------------------------------------------------------
-- 2 · EL INTENTO RECUERDA CON QUÉ PROYECCIÓN SALIÓ
-- ---------------------------------------------------------------------------
--
-- La lectura del 9 de septiembre de 2026 sobre la suscripción de MP-PLAN-01
-- —nacida del checkout de un `preapproval_plan`— devolvió `preapproval_plan_id`
-- en el propio recurso. Es decir: la identidad SE PUEDE RECONSTRUIR sin esta
-- columna, releyendo al proveedor.
--
--   provider_subscription_id → GET del proveedor → identificador del plan
--   → billing_provider_plans
--
-- Así que esto no es la fuente de identidad. Es la EVIDENCIA de qué proyección
-- resolvió el servidor cuando emitió aquel enlace de pago, y sirve para lo que
-- una segunda fuente sirve: detectar que las dos no dicen lo mismo. Cuando
-- divergen, la reconciliación para en vez de conceder derecho a ciegas.
--
-- Anulable y sin valor por omisión: Wompi no tiene proyección, y ninguna fila
-- existente se reescribe.
alter table public.billing_checkout_intents
  add column if not exists billing_provider_plan_id uuid
    references public.billing_provider_plans (id);

comment on column public.billing_checkout_intents.billing_provider_plan_id is
  'Qué proyección del proveedor se resolvió al emitir este checkout. '
  'AUDITORÍA, no identidad: la identidad se reconstruye releyendo al proveedor.';

create index if not exists bci_provider_plan_idx
  on public.billing_checkout_intents (billing_provider_plan_id)
  where billing_provider_plan_id is not null;

-- ---------------------------------------------------------------------------
-- 3 · EL CICLO EXTERNO
-- ---------------------------------------------------------------------------
--
-- QUÉ IDENTIFICA UN CICLO, Y POR QUÉ NO VALE EL PAGO
--
-- Ya existe `billing_payments_provider_uniq (provider, provider_payment_id)`,
-- de 0169, y sigue siendo la garantía de que un pago del proveedor produce como
-- mucho un pago nuestro. No se duplica aquí.
--
-- Pero un pago no es un ciclo. En una recurrencia del proveedor, el ciclo es la
-- OBLIGACIÓN que él generó —su factura, su autorización de cobro— y el pago es
-- el intento de cobrarla. Un ciclo puede tener un pago rechazado y luego uno
-- aprobado; dos pagos, un solo mes. Sin identidad propia del ciclo, el segundo
-- pago abriría un mes que no existe.
--
-- QUÉ CAMPO DE MERCADO PAGO ENTRA AQUÍ, Y QUÉ NO ESTÁ PROBADO
--
-- El adaptador consulta `/authorized_payments/search?preapproval_id=…`, que
-- devuelve por cada factura: `id`, `preapproval_id`, `status`,
-- `transaction_amount`, `currency_id`, `debit_date`, `date_created`, y el
-- `payment` anidado con su `id`. El mapeo previsto es:
--
--   provider_invoice_id  ←  authorized_payment.id
--   provider_cycle_at    ←  authorized_payment.debit_date
--   provider_payment_id  ←  authorized_payment.payment.id
--
-- Eso es la FORMA del recurso según el contrato del proveedor y el adaptador
-- que ya lo consulta. NO está observado en una ejecución registrada: la única
-- lectura autorizada hasta hoy fue `GET /preapproval/{id}`. Por eso los nombres
-- de aquí son neutros y esta tabla no sabe nada de Mercado Pago: el día que se
-- observe, cambia el runtime y no el esquema. Si el campo definitivo resultara
-- ser otro, se alimenta otro y la tabla sigue valiendo.
--
-- `external_reference` NO aparece por ninguna parte, y es a propósito. La
-- lectura real confirmó que una suscripción nacida del checkout de un plan lo
-- trae a nulo. Cualquier lógica que lo necesite en este camino es incorrecta.
create table if not exists public.billing_provider_cycles (
  id                        uuid primary key default gen_random_uuid(),
  provider                  text not null,
  environment               text not null
    constraint billing_provider_cycles_environment_check
      check (environment in ('test', 'live')),
  -- El objeto recurrente del proveedor, tal cual. Se guarda además de la clave
  -- interna porque es lo único que trae el aviso.
  provider_subscription_id  text not null,
  -- La identidad del CICLO en el proveedor.
  provider_invoice_id       text not null
    constraint billing_provider_cycles_invoice_check
      check (length(btrim(provider_invoice_id)) between 1 and 128),
  -- LA FECHA ECONÓMICA. No es cuándo llegó el aviso ni cuándo se escribió esta
  -- fila: es cuándo dice el proveedor que corresponde el cobro. Es el único
  -- dato que ordena la historia.
  provider_cycle_at         timestamptz not null,
  subscription_id           uuid not null references public.billing_subscriptions (id),
  organization_id           uuid not null references public.organizations (id) on delete restrict,
  period_id                 uuid not null references public.billing_subscription_periods (id),
  period_sequence           integer not null
    constraint billing_provider_cycles_sequence_check check (period_sequence >= 1),
  billing_provider_plan_id  uuid references public.billing_provider_plans (id),
  payment_id                uuid references public.billing_payments (id),
  outcome                   text not null
    constraint billing_provider_cycles_outcome_check
      check (outcome in ('approved', 'declined', 'failed')),
  reconciled_at             timestamptz not null default now()
);

comment on table public.billing_provider_cycles is
  'Un ciclo cobrado por el proveedor, reconocido aquí una sola vez. No es una '
  'obligación nuestra: es la constancia de que una suya ya ocurrió.';

-- LA GARANTÍA QUE IMPIDE SALDAR DOS VECES EL MISMO CICLO. Por entorno, porque
-- un identificador de sandbox y uno de producción no comparten espacio.
create unique index if not exists bpc_external_uniq
  on public.billing_provider_cycles (provider, environment, provider_invoice_id);

-- Y la recíproca: un periodo local no se salda desde dos ciclos externos. Los
-- intentos NO aprobados no cuentan, porque un mes puede reintentarse.
create unique index if not exists bpc_period_settled_uniq
  on public.billing_provider_cycles (period_id)
  where outcome = 'approved';

create index if not exists bpc_subscription_idx
  on public.billing_provider_cycles (subscription_id, provider_cycle_at desc);

-- --- Append-only, incluso frente a quien tenga privilegios ------------------
--
-- La lección de 0184: RLS no protege de `service_role`; los privilegios sí, y
-- un disparador protege de todos. Un ciclo reconocido no se corrige: si algo
-- salió mal, se mira y se decide, no se reescribe la constancia.
create or replace function public.billing_provider_cycle_is_append_only()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'PROVIDER_CYCLE_IS_APPEND_ONLY'
      using detail = old.id::text,
            hint = 'Un ciclo del proveedor no se borra: es constancia de un '
                || 'hecho económico que ya ocurrió fuera.';
  end if;
  raise exception 'PROVIDER_CYCLE_IS_APPEND_ONLY'
    using detail = old.id::text,
          hint = 'Un ciclo del proveedor no se modifica. Lo que cambie del '
              || 'cobro se reconcilia como un hecho nuevo.';
end $$;

drop trigger if exists billing_provider_cycle_is_append_only_trg
  on public.billing_provider_cycles;
create trigger billing_provider_cycle_is_append_only_trg
  before update or delete on public.billing_provider_cycles
  for each row execute function public.billing_provider_cycle_is_append_only();

-- --- Quién ve y quién escribe ----------------------------------------------
--
-- Nadie escribe. Ni el inquilino, ni la aplicación autenticada, ni el rol de
-- servicio: se escribe SOLO desde la primitiva, que es `security definer` y por
-- eso corre como el propietario. Postgres concede a `service_role` todo sobre
-- cada tabla nueva por omisión, así que hay que quitarlo a mano.
alter table public.billing_provider_cycles enable row level security;
revoke all on public.billing_provider_cycles from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4 · EN QUÉ SITIO DE LA HISTORIA CAE UN CICLO
-- ---------------------------------------------------------------------------
--
-- EL PROBLEMA REAL: los avisos llegan desordenados. El ciclo 2 puede llegar
-- antes que el 1 —un reintento del proveedor, una caída nuestra, una cola—. Si
-- el número de periodo se asignara con `max(sequence) + 1`, el orden de llegada
-- quedaría escrito como si fuera el orden económico, y la historia diría que el
-- mes de octubre es anterior al de septiembre.
--
-- LA SOLUCIÓN: no se asigna, se CALCULA. Desde el ancla de la suscripción y su
-- intervalo, la fecha económica determina el sitio y solo el sitio. Cada ciclo
-- llega a la misma respuesta llegue cuando llegue, así que el orden de llegada
-- deja de importar y no hay que renumerar nada —que además está prohibido: la
-- identidad de un periodo está congelada desde 0181.
--
-- LA TOLERANCIA, Y POR QUÉ EXISTE: un proveedor no cobra al segundo exacto del
-- aniversario. Con medio paso de holgura, un cobro que caiga hasta quince días
-- antes (o después) de su aniversario sigue cayendo en su ciclo, en vez de
-- colisionar con el anterior.
create or replace function public.billing_provider_cycle_sequence(
  p_anchor    timestamptz,
  p_interval  text,
  p_cycle_at  timestamptz
)
returns integer
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_paso interval;
  v_tol  interval;
  v_n    integer := 1;
begin
  if p_interval not in ('monthly', 'annual') then
    raise exception 'BILLING_INTERVAL_INVALID' using detail = coalesce(p_interval, '(nulo)');
  end if;
  if p_anchor is null or p_cycle_at is null then
    raise exception 'PROVIDER_CYCLE_ANCHOR_MISSING';
  end if;

  v_paso := case p_interval when 'monthly' then make_interval(months => 1)
                            else make_interval(years => 1) end;
  v_tol  := v_paso / 2;

  -- Un cobro anterior al ancla pertenece al primer ciclo: el bucle no entra.
  while p_cycle_at >= p_anchor + (v_paso * v_n) - v_tol loop
    v_n := v_n + 1;
    -- Cincuenta años de mensualidades. Más allá, algo se está inventando una
    -- fecha, y parar es mejor que escribir un número absurdo.
    if v_n > 600 then
      raise exception 'PROVIDER_CYCLE_OUT_OF_RANGE'
        using detail = format('ancla %s · ciclo %s', p_anchor, p_cycle_at);
    end if;
  end loop;

  return v_n;
end $$;

revoke all on function public.billing_provider_cycle_sequence(timestamptz, text, timestamptz)
  from public, anon;
grant execute on function public.billing_provider_cycle_sequence(timestamptz, text, timestamptz)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5 · LA RECONCILIACIÓN
-- ---------------------------------------------------------------------------
--
-- Recibe un hecho YA RELEÍDO del proveedor y produce, exactamente una vez, el
-- periodo, el pago y el derecho. Si el mismo hecho vuelve, no hace nada nuevo y
-- lo dice.
--
-- NO COBRA. No hay ni una llamada a un adaptador, ni se crea un medio de pago,
-- ni se programa nada. Todos los verbos son en pasado.
--
-- POR QUÉ REUTILIZA `billing_settle_period_payment`: porque ahí ya viven la
-- instantánea fiscal, la unicidad del pago del proveedor, el rechazo del
-- importe que no cuadra y —lo que más importa— la rama que impide extender el
-- derecho dos veces sobre un periodo ya saldado. Escribir otra versión de eso
-- sería tener dos verdades sobre cuánto se cobró.
create or replace function public.billing_reconcile_provider_cycle(
  p_provider                 text,
  p_provider_subscription_id text,
  p_provider_invoice_id      text,
  p_provider_cycle_at        timestamptz,
  p_provider_payment_id      text,
  p_outcome                  text,
  p_amount                   bigint,
  p_currency                 text,
  p_live_mode                boolean,
  p_provider_plan_id         text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sub      public.billing_subscriptions%rowtype;
  v_ciclo    public.billing_provider_cycles%rowtype;
  v_intent   public.billing_checkout_intents%rowtype;
  v_proy     public.billing_provider_plans%rowtype;
  v_per      public.billing_subscription_periods%rowtype;
  v_entorno  text;
  v_entorno_conocido text;
  v_intents  integer;
  v_ancla    timestamptz;
  v_base     integer;
  v_n        integer;
  v_lim      jsonb;
  v_per_id   uuid;
  v_nueva    boolean := false;
  v_res      jsonb;
  v_pago     uuid;
  v_fin_prev timestamptz;
  v_ini_prev timestamptz;
begin
  -- --- Forma de la petición -----------------------------------------------
  if p_outcome not in ('approved', 'declined', 'failed') then
    raise exception 'PAYMENT_OUTCOME_INVALID' using detail = coalesce(p_outcome, '(nulo)');
  end if;
  if p_provider_invoice_id is null or length(btrim(p_provider_invoice_id)) = 0 then
    return jsonb_build_object('outcome', 'cycle_identity_missing');
  end if;
  if p_provider_cycle_at is null then
    return jsonb_build_object('outcome', 'cycle_date_missing');
  end if;
  -- Sin entorno declarado no se procesa. Es la misma regla que el webhook.
  if p_live_mode is null then
    return jsonb_build_object('outcome', 'environment_mismatch',
      'reason', 'LIVE_MODE_UNDECLARED');
  end if;
  v_entorno := case when p_live_mode then 'live' else 'test' end;

  -- --- 1 · La suscripción, por el objeto del proveedor ---------------------
  --
  -- ESTE ES EL PUNTO CRÍTICO DE TODA LA MIGRACIÓN. Quien llama trae texto que
  -- vino de fuera; de aquí sale a QUIÉN se le concede un derecho. Si esta
  -- resolución se puede empujar, un fallo en el webhook le regala un mes a otra
  -- empresa. Por eso la organización NO se recibe: se deriva.
  --
  -- Primero por la columna de la suscripción, que es donde debe estar. Y si no
  -- está, por el INTENTO, que es quien la guarda hoy: `billing_settle_payment`
  -- crea la suscripción y nunca le copió el identificador del proveedor, así
  -- que en las filas que ya existen esa columna está a nulo.
  --
  -- Por qué no se rellena en la migración: Producción tiene organizaciones
  -- reales desde el 7 de septiembre, y un UPDATE masivo sobre filas vivas no es
  -- una migración aditiva. Se sella AQUÍ, y solo después de comprobarlo todo.
  select * into v_sub from public.billing_subscriptions
   where provider = p_provider
     and provider_subscription_id = p_provider_subscription_id
   for update;

  -- El intento se lee SIEMPRE, encontremos o no la suscripción por la columna:
  -- es la segunda fuente y sirve para las dos cosas, para resolver cuando la
  -- columna está a nulo y para detectar que las dos no dicen lo mismo.
  --
  -- Se CUENTA antes de leer. `select into` se queda con la primera fila y no
  -- avisa; hoy `bci_provider_subscription_uniq` impide que haya dos, pero un
  -- «hoy no puede pasar» no es una comprobación. Si algún día hay dos, esto
  -- para en vez de elegir por orden de llegada.
  select count(*) into v_intents from public.billing_checkout_intents
   where provider = p_provider
     and provider_subscription_id = p_provider_subscription_id;
  if v_intents > 1 then
    return jsonb_build_object('outcome', 'checkout_intent_ambiguous',
      'intents', v_intents);
  end if;
  if v_intents = 1 then
    select * into v_intent from public.billing_checkout_intents
     where provider = p_provider
       and provider_subscription_id = p_provider_subscription_id;
  end if;

  if v_sub.id is null then
    -- El respaldo. Solo sirve si el intento LLEGÓ a crear una suscripción: uno
    -- abierto y nunca liquidado no es prueba de nada, y aquí no se inventa una
    -- suscripción a partir de un aviso.
    if v_intent.id is null or v_intent.billing_subscription_id is null then
      return jsonb_build_object('outcome', 'subscription_unknown');
    end if;
    select * into v_sub from public.billing_subscriptions
     where id = v_intent.billing_subscription_id
     for update;
    if not found then
      return jsonb_build_object('outcome', 'subscription_unknown');
    end if;
    -- Y la suscripción que el intento nombra tiene que ser de SU MISMA
    -- organización. Un intento apuntando a la suscripción de otra empresa es
    -- justo el camino por el que un cobro acabaría en la cuenta equivocada.
    if v_sub.organization_id is distinct from v_intent.organization_id then
      return jsonb_build_object('outcome', 'subscription_ownership_conflict',
        'intent_organization_id', v_intent.organization_id,
        'subscription_organization_id', v_sub.organization_id);
    end if;
  elsif v_intent.id is not null
        and v_intent.billing_subscription_id is not null
        and v_intent.billing_subscription_id is distinct from v_sub.id then
    -- Las dos fuentes existen y NO coinciden. No se elige: se para.
    return jsonb_build_object('outcome', 'subscription_identity_conflict',
      'reason', 'INTENT_POINTS_ELSEWHERE',
      'intent_subscription_id', v_intent.billing_subscription_id,
      'subscription_id', v_sub.id, 'organization_id', v_sub.organization_id);
  end if;

  -- El proveedor de la suscripción tiene que ser el que dice el aviso. En la
  -- rama del respaldo la suscripción se alcanzó por el intento, y el intento
  -- podría llevar un proveedor y la suscripción otro.
  if v_sub.provider is distinct from p_provider then
    return jsonb_build_object('outcome', 'provider_mismatch',
      'expected', v_sub.provider, 'received', p_provider,
      'subscription_id', v_sub.id, 'organization_id', v_sub.organization_id);
  end if;

  -- --- 2 · Y solo si la recurrencia es del proveedor -----------------------
  --
  -- Es la puerta que mantiene a Wompi fuera de este camino: su calendario es
  -- nuestro y sus renovaciones las cobra el motor de 0174. Se pregunta al
  -- catálogo de 0184 en vez de escribir un nombre aquí.
  if public.billing_renewal_owner(p_provider) <> 'provider' then
    return jsonb_build_object('outcome', 'renewal_not_provider_owned',
      'renewal_owner', public.billing_renewal_owner(p_provider),
      'subscription_id', v_sub.id, 'organization_id', v_sub.organization_id);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('billing:' || v_sub.organization_id::text, 0));

  -- --- 3 · ¿Ya estaba reconocido este ciclo? -------------------------------
  --
  -- Antes de escribir nada: un aviso repetido no puede crear un periodo de más
  -- ni siquiera transitoriamente.
  select * into v_ciclo from public.billing_provider_cycles
   where provider = p_provider and environment = v_entorno
     and provider_invoice_id = p_provider_invoice_id;
  if found then
    return jsonb_build_object('outcome', 'already_reconciled',
      'cycle_id', v_ciclo.id, 'period_id', v_ciclo.period_id,
      'period_sequence', v_ciclo.period_sequence, 'payment_id', v_ciclo.payment_id,
      'subscription_id', v_ciclo.subscription_id,
      'organization_id', v_ciclo.organization_id);
  end if;

  -- --- 4 · El entorno, ANTES de tocar la suscripción -----------------------
  --
  -- Estaba después del sello y era un fallo: un aviso de producción sobre una
  -- suscripción de pruebas alcanzaba a escribirle el identificador antes de que
  -- nadie mirase el entorno. Un cobro de producción sobre un intento de pruebas
  -- no se procesa aunque venga firmado, y tampoco deja rastro.
  --
  -- El entorno NO se cree del aviso: se contrasta con lo que el sistema ya
  -- sabía. Y si el sistema no sabe nada —ni intento, ni proyección—, se para:
  -- sin una fuente gobernada, «test» y «live» los decidiría quien llama.
  if v_intent.id is not null then
    v_entorno_conocido := v_intent.environment;
  elsif v_sub.billing_provider_plan_id is not null then
    select pp.environment into v_entorno_conocido
      from public.billing_provider_plans pp
     where pp.id = v_sub.billing_provider_plan_id;
  end if;

  if v_entorno_conocido is null then
    return jsonb_build_object('outcome', 'environment_unverifiable',
      'subscription_id', v_sub.id, 'organization_id', v_sub.organization_id);
  end if;
  if v_entorno_conocido is distinct from v_entorno then
    return jsonb_build_object('outcome', 'environment_mismatch',
      'expected', v_entorno_conocido, 'received', v_entorno,
      'subscription_id', v_sub.id, 'organization_id', v_sub.organization_id);
  end if;

  -- --- 5 · La proyección del proveedor -------------------------------------
  --
  -- Se busca SIN filtrar por estado: una proyección retirada sigue siendo la
  -- que sostiene a quien la contrató. `retired` significa «no más ventas
  -- nuevas», no «esta suscripción deja de valer».
  if p_provider_plan_id is not null then
    select * into v_proy from public.billing_provider_plans
     where provider = p_provider and environment = v_entorno
       and provider_plan_id = p_provider_plan_id;
    if not found then
      return jsonb_build_object('outcome', 'provider_plan_unknown',
        'subscription_id', v_sub.id, 'organization_id', v_sub.organization_id);
    end if;

    -- LA DIVERGENCIA. Si el intento salió con una proyección y el proveedor
    -- dice otra, no se concede derecho a ciegas: se para y se mira. Una de las
    -- dos está equivocada y no se puede saber cuál desde aquí.
    if v_intent.id is not null
       and v_intent.billing_provider_plan_id is not null
       and v_intent.billing_provider_plan_id is distinct from v_proy.id then
      return jsonb_build_object('outcome', 'provider_plan_mismatch',
        'intent_provider_plan_id', v_intent.billing_provider_plan_id,
        'provider_plan_id', v_proy.id,
        'subscription_id', v_sub.id, 'organization_id', v_sub.organization_id);
    end if;
    -- Y lo mismo contra la proyección con la que nació la suscripción.
    if v_sub.billing_provider_plan_id is not null
       and v_sub.billing_provider_plan_id is distinct from v_proy.id then
      return jsonb_build_object('outcome', 'provider_plan_mismatch',
        'subscription_provider_plan_id', v_sub.billing_provider_plan_id,
        'provider_plan_id', v_proy.id,
        'subscription_id', v_sub.id, 'organization_id', v_sub.organization_id);
    end if;
  end if;

  -- --- 5 bis · EL SELLO, y solo ahora --------------------------------------
  --
  -- Todo lo que podía descalificar este hecho ya se comprobó: la suscripción
  -- existe, es de este proveedor, la recurrencia es suya, el entorno cuadra con
  -- una fuente gobernada y la proyección no contradice a nadie. Recién ahora se
  -- escribe de qué objeto del proveedor viene esta suscripción.
  --
  -- Si ya llevaba OTRO, no se pisa: dos objetos del proveedor apuntando a la
  -- misma suscripción local es exactamente el enredo que 0186 existe para no
  -- permitir.
  if v_sub.provider_subscription_id is null then
    update public.billing_subscriptions
       set provider_subscription_id = p_provider_subscription_id, updated_at = now()
     where id = v_sub.id;
    v_sub.provider_subscription_id := p_provider_subscription_id;
  elsif v_sub.provider_subscription_id is distinct from p_provider_subscription_id then
    return jsonb_build_object('outcome', 'subscription_identity_conflict',
      'subscription_id', v_sub.id, 'organization_id', v_sub.organization_id);
  end if;

  -- --- 6 · En qué sitio de la historia cae ---------------------------------
  v_ancla := v_sub.period_anchor_at;
  v_base  := v_sub.period_anchor_sequence;
  if v_ancla is null or v_base is null then
    select period_start into v_ancla from public.billing_subscription_periods
     where subscription_id = v_sub.id and period_sequence = 1;
    v_base := 1;
  end if;
  if v_ancla is null then
    return jsonb_build_object('outcome', 'anchor_missing',
      'subscription_id', v_sub.id, 'organization_id', v_sub.organization_id);
  end if;

  v_n := public.billing_provider_cycle_sequence(
           v_ancla, v_sub.billing_interval, p_provider_cycle_at) + v_base - 1;

  -- --- 7 · Localizar o crear EXACTAMENTE un periodo ------------------------
  select * into v_per from public.billing_subscription_periods
   where subscription_id = v_sub.id and period_sequence = v_n;

  if found then
    v_per_id := v_per.id;
  else
    v_lim := public.billing_period_bounds(v_ancla, v_sub.billing_interval,
                                          v_n - v_base + 1);
    insert into public.billing_subscription_periods (
      subscription_id, organization_id, period_sequence,
      period_start, period_end, base_amount, charge_currency,
      plan_code, plan_revision_id, billing_interval)
    values (
      v_sub.id, v_sub.organization_id, v_n,
      (v_lim->>'period_start')::timestamptz, (v_lim->>'period_end')::timestamptz,
      v_sub.base_charge_amount, v_sub.charge_currency,
      v_sub.plan_code, v_sub.plan_revision_id, v_sub.billing_interval)
    on conflict (subscription_id, period_sequence) do nothing
    returning id into v_per_id;

    if v_per_id is null then
      select id into v_per_id from public.billing_subscription_periods
       where subscription_id = v_sub.id and period_sequence = v_n;
    else
      v_nueva := true;
    end if;
  end if;

  -- --- 8 · Liquidar, con la cuenta y las garantías que ya existen ----------
  v_ini_prev := v_sub.current_period_start;
  v_fin_prev := v_sub.current_period_end;

  v_res := public.billing_settle_period_payment(
             v_per_id, p_provider, p_provider_payment_id, p_outcome,
             p_amount, p_currency, p_live_mode);

  -- Un hecho que no cuadra no deja un mes inventado detrás. Misma regla que la
  -- renovación de 0173: si el periodo se creó aquí mismo y la liquidación lo
  -- rechazó por cuentas, se deshace. Un rechazo del banco sí lo deja en pie,
  -- porque ahí el cobro era legítimo.
  if v_nueva and v_res->>'outcome' in ('reconciliation_mismatch', 'tax_unresolved',
                                       'environment_mismatch', 'period_not_found') then
    delete from public.billing_subscription_periods where id = v_per_id;
    return v_res || jsonb_build_object('subscription_id', v_sub.id,
                                       'organization_id', v_sub.organization_id);
  end if;

  -- EL DERECHO NO RETROCEDE. `billing_settle_period_payment` mueve la vigencia
  -- al periodo que acaba de saldar, que es lo correcto cuando los meses llegan
  -- en orden. Aquí no llegan en orden: si el ciclo 1 aparece después del 2,
  -- mover la vigencia a septiembre le quitaría a alguien el octubre que ya
  -- pagó. Se reconoce el cobro y se conserva la vigencia más larga.
  if v_res->>'outcome' = 'renewed' and v_fin_prev is not null then
    update public.billing_subscriptions s
       set current_period_start = v_ini_prev,
           current_period_end   = v_fin_prev,
           renews_at            = v_fin_prev,
           updated_at           = now()
     where s.id = v_sub.id
       and s.current_period_end < v_fin_prev;
  end if;

  v_pago := nullif(v_res->>'payment_id', '')::uuid;

  -- --- 9 · La constancia del ciclo ----------------------------------------
  --
  -- Se escribe también cuando el cobro salió mal: que el proveedor lo intentara
  -- y fallara es historia, y sin ella el reintento no sabría que es un
  -- reintento. La unicidad de arriba impide que el mismo ciclo entre dos veces.
  insert into public.billing_provider_cycles (
    provider, environment, provider_subscription_id, provider_invoice_id,
    provider_cycle_at, subscription_id, organization_id, period_id,
    period_sequence, billing_provider_plan_id, payment_id, outcome)
  values (
    p_provider, v_entorno, p_provider_subscription_id, p_provider_invoice_id,
    p_provider_cycle_at, v_sub.id, v_sub.organization_id, v_per_id,
    v_n, coalesce(v_proy.id, v_sub.billing_provider_plan_id), v_pago,
    case when v_res->>'outcome' in ('renewed', 'period_already_settled',
                                    'already_settled')
         then 'approved' else p_outcome end)
  on conflict do nothing
  returning * into v_ciclo;

  return v_res || jsonb_build_object(
    'subscription_id', v_sub.id,
    'organization_id', v_sub.organization_id,
    'cycle_id', v_ciclo.id,
    'period_sequence', v_n,
    'provider_cycle_at', p_provider_cycle_at,
    'reconciled', true);
end $$;

revoke all on function public.billing_reconcile_provider_cycle(
  text, text, text, timestamptz, text, text, bigint, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.billing_reconcile_provider_cycle(
  text, text, text, timestamptz, text, text, bigint, text, boolean, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6 · LA OBSERVACIÓN
-- ---------------------------------------------------------------------------
--
-- La tabla no se lee desde ningún rol de ejecución. Para que la administración
-- de plataforma pueda mirar qué ciclos ha reconocido el sistema, una vista que
-- filtra por dentro — y con los privilegios de escritura quitados a mano,
-- porque una vista simple sobre una tabla es auto-actualizable y heredaría
-- insert/update/delete.
create or replace view public.v_billing_provider_cycles as
  select c.id, c.provider, c.environment,
         c.provider_subscription_id, c.provider_invoice_id, c.provider_cycle_at,
         c.subscription_id, c.organization_id, o.name as organization_name,
         c.period_id, c.period_sequence, c.outcome, c.reconciled_at,
         p.period_start, p.period_end, p.status as period_status,
         pl.provider_plan_id
    from public.billing_provider_cycles c
    join public.organizations o on o.id = c.organization_id
    join public.billing_subscription_periods p on p.id = c.period_id
    left join public.billing_provider_plans pl on pl.id = c.billing_provider_plan_id
   where public.is_platform_staff();

comment on view public.v_billing_provider_cycles is
  'Los ciclos que el proveedor ya cobró y el sistema reconoció, para la '
  'administración de plataforma.';

revoke all on public.v_billing_provider_cycles from anon, authenticated, service_role;
grant select on public.v_billing_provider_cycles to authenticated, service_role;
