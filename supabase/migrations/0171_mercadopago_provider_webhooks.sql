-- ===========================================================================
-- Trazaloop · 0171 · La frontera del proveedor de pagos: intentos y eventos
-- ===========================================================================
--
-- QUÉ AÑADE Y POR QUÉ SON DOS TABLAS Y NO UNA
--
-- 1. `billing_checkout_intents` — el registro del PROVEEDOR. Existe antes de
--    que exista ninguna suscripción: hay que crear el objeto recurrente en
--    Mercado Pago y darle una referencia externa, y esa referencia tiene que
--    apuntar a algo del servidor. Apunta aquí.
--
-- 2. `billing_provider_events` — el libro de notificaciones. Un webhook no es
--    una verdad financiera: es un aviso. Se guarda lo que llegó, si venía
--    firmado y qué se hizo con él.
--
-- Van separadas porque responden preguntas distintas: la primera es del
-- cliente («¿en qué quedó mi contratación?»), la segunda es de la plataforma
-- («¿qué nos mandó el proveedor y por qué no activó nada?»). Y tienen
-- visibilidades distintas: el administrador de una empresa puede ver su
-- intento; NADIE fuera de la plataforma ve un evento crudo.
--
-- LA REFERENCIA EXTERNA ES EL `id` DEL INTENTO
--
-- Un UUID y nada más. Ni el nombre de la empresa, ni el plan, ni el importe:
-- viaja por la red del proveedor y aparece en paneles de terceros. Lo que hace
-- falta al volver es poder mirar en el servidor, y para eso un opaco basta.
--
-- LA CONCILIACIÓN NO SE FÍA DEL PROVEEDOR
--
-- El intento congela `expected_total_amount` y `expected_currency` desde el
-- presupuesto. Cuando vuelve un pago se compara contra ESO, exacto. Una firma
-- válida demuestra el origen del mensaje, no que el importe sea el correcto:
-- son dos cosas distintas y confundirlas es cómo se activa un plan por menos
-- dinero del que cuesta.
--
-- ENTORNO
--
-- El intento guarda con qué entorno se creó. Un evento en vivo sobre un
-- intento de pruebas —o al revés— no activa nada. Falla cerrado.
--
-- LO QUE ESTA MIGRACIÓN NO HACE
--
-- No calcula impuestos, ni tipo de cambio, ni descuentos: todo eso es de B1 y
-- se consume. No orquesta renovaciones, ni la gracia, ni la cancelación
-- programada: eso es B5. Aquí solo están las primitivas y el registro.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0 · PREFLIGHT DE SEGURIDAD · heredado de SEC-01 (0165)
-- ---------------------------------------------------------------------------
do $$
declare
  v_expuestas text;
begin
  select string_agg(n.nspname || '.' || c.relname, ', ' order by c.relname)
    into v_expuestas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_expuestas is not null then
    raise exception 'SEC01_RLS_PREFLIGHT: hay tablas de public sin RLS: %', v_expuestas
      using hint = 'Actívales RLS con una política explícita antes de promover.';
  end if;
end;
$$;

do $$
begin
  if to_regprocedure('public.billing_settle_payment(uuid, text, text, text, text, text)') is null then
    raise exception '0171 presupone 0169: no existe billing_settle_payment';
  end if;
  raise notice '0171 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · EL INTENTO DE CONTRATACIÓN · lo que el proveedor conoce
-- ---------------------------------------------------------------------------
create table if not exists public.billing_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  quote_id uuid not null references public.billing_quotes (id),
  provider text not null,
  -- Con qué credenciales se creó. Un evento del otro entorno no activa nada.
  environment text not null,
  -- Lo esperado, congelado desde el presupuesto en el momento de abrirlo. La
  -- conciliación compara contra esta copia y no vuelve a derivar nada: si el
  -- presupuesto caduca o cambia de estado, lo que se prometió no cambia.
  expected_total_amount bigint not null,
  expected_currency text not null,
  billing_interval text not null,
  plan_code text not null,
  -- Lo que el proveedor devolvió. Vocabulario del proveedor, y vive aquí
  -- dentro a propósito: `billing_subscriptions` no debe saber qué es un
  -- «preapproval».
  provider_subscription_id text,
  provider_status text,
  provider_version integer,
  init_point text,
  synced_amount bigint,
  next_payment_date timestamptz,
  -- Estado canónico del intento, en vocabulario de Trazaloop.
  status text not null default 'created',
  billing_subscription_id uuid references public.billing_subscriptions (id),
  failure_reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bci_environment_check check (environment in ('test', 'live')),
  constraint bci_status_check check (status in (
    'created', 'provider_created', 'authorized', 'settled',
    'declined', 'failed', 'cancelled', 'expired', 'manual_review')),
  constraint bci_interval_check check (billing_interval in ('monthly', 'annual')),
  constraint bci_amount_check check (expected_total_amount > 0)
);

create unique index if not exists bci_provider_subscription_uniq
  on public.billing_checkout_intents (provider, provider_subscription_id)
  where provider_subscription_id is not null;
create index if not exists bci_org_idx
  on public.billing_checkout_intents (organization_id, created_at desc);
create index if not exists bci_quote_idx on public.billing_checkout_intents (quote_id);

alter table public.billing_checkout_intents enable row level security;

-- El administrador de la empresa ve SUS intentos: es su contratación y
-- necesita saber en qué quedó. No hay política de escritura para nadie: las
-- filas solo las mueven funciones `security definer`.
drop policy if exists billing_checkout_intents_read on public.billing_checkout_intents;
create policy billing_checkout_intents_read on public.billing_checkout_intents
  for select to authenticated
  using (public.is_org_admin(organization_id) or public.is_platform_staff());

revoke all on public.billing_checkout_intents from anon;
revoke insert, update, delete, truncate on public.billing_checkout_intents from authenticated, anon;
grant select on public.billing_checkout_intents to authenticated;

comment on table public.billing_checkout_intents is
  'PE-05B2 · Un intento de contratacion frente al proveedor. Su `id` ES la referencia externa opaca que viaja a Mercado Pago: ni nombre de empresa ni plan ni importe. Congela lo esperado para que la conciliacion compare contra el servidor y no contra lo que diga el proveedor.';
comment on column public.billing_checkout_intents.environment is
  'PE-05B2 · Con que credenciales se creo. Un evento de produccion sobre un intento de pruebas —o al reves— no activa nada: falla cerrado.';
comment on column public.billing_checkout_intents.expected_total_amount is
  'PE-05B2 · El total del presupuesto, congelado. Una firma valida demuestra el ORIGEN del mensaje, no que el importe sea correcto.';

-- ---------------------------------------------------------------------------
-- 2 · EL LIBRO DE NOTIFICACIONES · lo que llegó y qué se hizo con ello
-- ---------------------------------------------------------------------------
-- Se guarda TAMBIÉN lo que llega mal firmado: saber que alguien está probando
-- suerte es información operativa. Pero sin cuerpo y con clave única por
-- recurso, para que un intento repetido incremente un contador en vez de
-- llenar la tabla. Un registro sin límite es un vector de denegación.
create table if not exists public.billing_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  topic text not null,
  resource_id text not null,
  provider_request_id text,
  live_mode boolean,
  environment text,
  signature_verified boolean not null,
  signature_failure_reason text,
  processing_status text not null default 'received',
  outcome text,
  error_class text,
  attempt_count integer not null default 1,
  first_received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  processed_at timestamptz,
  organization_id uuid references public.organizations (id) on delete restrict,
  -- Solo el sobre: identificadores y tipo. Nunca tarjeta, ni token, ni
  -- cabeceras de autorización, ni datos del pagador que no hagan falta. La
  -- verdad financiera se va a buscar a la API del proveedor de todas formas,
  -- así que guardar el cuerpo entero solo añadiría riesgo sin añadir verdad.
  payload jsonb,
  constraint bpe_status_check check (processing_status in (
    'received', 'processed', 'ignored', 'pending_resource',
    'manual_review', 'error', 'rejected')),
  constraint bpe_attempts_check check (attempt_count >= 1),
  constraint bpe_environment_check check (environment is null or environment in ('test', 'live'))
);

create unique index if not exists bpe_resource_uniq
  on public.billing_provider_events (provider, topic, resource_id);
create index if not exists bpe_pending_idx
  on public.billing_provider_events (processing_status, last_received_at desc)
  where processing_status in ('pending_resource', 'manual_review', 'error');

alter table public.billing_provider_events enable row level security;

-- Dato financiero INTERNO de la plataforma. Ni el dueño de la empresa lo ve:
-- no le aporta nada que no esté en su intento, y expone la mecánica del
-- proveedor. Solo personal de plataforma.
drop policy if exists billing_provider_events_staff on public.billing_provider_events;
create policy billing_provider_events_staff on public.billing_provider_events
  for select to authenticated using (public.is_platform_staff());

revoke all on public.billing_provider_events from anon, authenticated;
grant select on public.billing_provider_events to authenticated;

comment on table public.billing_provider_events is
  'PE-05B2 · Notificaciones del proveedor. Un webhook no es una verdad financiera: es un aviso. Se guarda el sobre —tipo, recurso, entorno, si venia firmado— y que se hizo con el, nunca el cuerpo entero. Clave unica por (proveedor, tema, recurso): una reentrega incrementa `attempt_count` en vez de crear otra fila.';
comment on column public.billing_provider_events.payload is
  'PE-05B2 · SOBRE SANEADO. Nunca tarjeta, token, cabecera de autorizacion ni PII del pagador que no haga falta. La verdad se relee de la API del proveedor.';

-- ---------------------------------------------------------------------------
-- 3 · ABRIR UN INTENTO · el importe NO es un parámetro
-- ---------------------------------------------------------------------------
create or replace function public.billing_open_checkout_intent(
  p_quote_id uuid,
  p_provider text,
  p_environment text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_q  public.billing_quotes%rowtype;
  v_id uuid;
  v_correo text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_environment not in ('test', 'live') then
    raise exception 'ENVIRONMENT_INVALID' using detail = coalesce(p_environment, 'null');
  end if;

  select * into v_q from public.billing_quotes where id = p_quote_id for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND';
  end if;
  -- Contratar es del administrador de ESA empresa. Nadie abre un intento
  -- sobre el presupuesto de otra.
  if not public.is_org_admin(v_q.organization_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_q.status <> 'open' then
    raise exception 'QUOTE_NOT_OPEN' using detail = v_q.status;
  end if;
  if v_q.expires_at <= now() then
    update public.billing_quotes set status = 'expired' where id = v_q.id;
    raise exception 'QUOTE_EXPIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('billing:' || v_q.organization_id::text, 0));

  -- Un presupuesto, un intento vivo. Reabrir devuelve el mismo: si no, cada
  -- pulsación crearía un objeto recurrente nuevo en el proveedor.
  select id into v_id from public.billing_checkout_intents
   where quote_id = v_q.id and provider = p_provider
     and status in ('created', 'provider_created', 'authorized')
   order by created_at desc limit 1;

  if v_id is null then
    insert into public.billing_checkout_intents (
      organization_id, quote_id, provider, environment,
      expected_total_amount, expected_currency, billing_interval, plan_code, created_by)
    values (
      v_q.organization_id, v_q.id, p_provider, p_environment,
      v_q.total_amount, v_q.charge_currency, v_q.billing_interval, v_q.plan_code, auth.uid())
    returning id into v_id;
  end if;

  -- EL CORREO DE FACTURACIÓN. Sale del contacto de la empresa, que es el dato
  -- que la empresa declaró para que la contacten. Si no lo hay, NO se
  -- sustituye por el de un empleado cualquiera: se dice que falta.
  select nullif(trim(o.contact_email), '') into v_correo
    from public.organizations o where o.id = v_q.organization_id;

  return jsonb_build_object(
    'intent_id', v_id,
    'organization_id', v_q.organization_id,
    'external_reference', v_id,
    'expected_total_amount', v_q.total_amount,
    'expected_currency', v_q.charge_currency,
    'billing_interval', v_q.billing_interval,
    'plan_code', v_q.plan_code,
    'billing_email', v_correo,
    'billing_email_missing', v_correo is null);
end;
$$;

revoke all on function public.billing_open_checkout_intent(uuid, text, text) from public, anon;
grant execute on function public.billing_open_checkout_intent(uuid, text, text) to authenticated;

comment on function public.billing_open_checkout_intent(uuid, text, text) is
  'PE-05B2 · Abre un intento de contratacion desde un presupuesto ABIERTO y no caducado. El importe NO es parametro: sale del presupuesto. Un presupuesto tiene un solo intento vivo, para que reintentar no cree otro objeto en el proveedor.';

-- ---------------------------------------------------------------------------
-- 4 · ANOTAR LO QUE DEVOLVIÓ EL PROVEEDOR
-- ---------------------------------------------------------------------------
create or replace function public.billing_attach_provider_subscription(
  p_intent_id uuid,
  p_provider_subscription_id text,
  p_init_point text,
  p_provider_status text,
  p_status text,
  p_synced_amount bigint default null,
  p_provider_version integer default null,
  p_next_payment_date timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_row public.billing_checkout_intents%rowtype;
begin
  select * into v_row from public.billing_checkout_intents where id = p_intent_id for update;
  if not found then
    raise exception 'INTENT_NOT_FOUND';
  end if;

  -- ORDEN DE LLEGADA. El proveedor numera cada modificación; una respuesta
  -- vieja que llega tarde no puede pisar a una nueva.
  if p_provider_version is not null and v_row.provider_version is not null
     and p_provider_version < v_row.provider_version then
    return jsonb_build_object('intent_id', v_row.id, 'applied', false,
      'reason', 'stale_provider_version');
  end if;

  update public.billing_checkout_intents
     set provider_subscription_id = coalesce(p_provider_subscription_id, provider_subscription_id),
         init_point = coalesce(p_init_point, init_point),
         provider_status = coalesce(p_provider_status, provider_status),
         provider_version = coalesce(p_provider_version, provider_version),
         synced_amount = coalesce(p_synced_amount, synced_amount),
         next_payment_date = coalesce(p_next_payment_date, next_payment_date),
         -- Un intento ya liquidado NO retrocede porque llegue una noticia de
         -- suscripción: el pago cobrado es el hecho, y el estado del objeto
         -- recurrente es una consecuencia.
         status = case when v_row.status = 'settled' then v_row.status
                       else coalesce(p_status, v_row.status) end,
         updated_at = now()
   where id = p_intent_id;

  return jsonb_build_object('intent_id', p_intent_id, 'applied', true);
end;
$$;

revoke all on function public.billing_attach_provider_subscription(
  uuid, text, text, text, text, bigint, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.billing_attach_provider_subscription(
  uuid, text, text, text, text, bigint, integer, timestamptz) to service_role;

comment on function public.billing_attach_provider_subscription(uuid, text, text, text, text, bigint, integer, timestamptz) is
  'PE-05B2 · Anota en el intento lo que devolvio el proveedor. Descarta versiones viejas y NUNCA hace retroceder un intento ya liquidado.';

-- ---------------------------------------------------------------------------
-- 5 · ANOTAR UNA NOTIFICACIÓN · una fila por recurso, con contador
-- ---------------------------------------------------------------------------
create or replace function public.billing_record_provider_event(
  p_provider text,
  p_topic text,
  p_resource_id text,
  p_signature_verified boolean,
  p_signature_failure_reason text default null,
  p_live_mode boolean default null,
  p_environment text default null,
  p_provider_request_id text default null,
  p_payload jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_n  integer;
  v_nuevo boolean;
begin
  insert into public.billing_provider_events (
    provider, topic, resource_id, provider_request_id, live_mode, environment,
    signature_verified, signature_failure_reason,
    processing_status,
    -- Lo no firmado no guarda cuerpo: no se ha demostrado que venga de nadie.
    payload)
  values (
    p_provider, p_topic, p_resource_id, p_provider_request_id, p_live_mode, p_environment,
    coalesce(p_signature_verified, false), p_signature_failure_reason,
    case when coalesce(p_signature_verified, false) then 'received' else 'rejected' end,
    case when coalesce(p_signature_verified, false) then p_payload else null end)
  on conflict (provider, topic, resource_id) do update
     set attempt_count = public.billing_provider_events.attempt_count + 1,
         last_received_at = now(),
         provider_request_id = coalesce(excluded.provider_request_id,
                                        public.billing_provider_events.provider_request_id),
         signature_verified = excluded.signature_verified,
         signature_failure_reason = excluded.signature_failure_reason,
         live_mode = coalesce(excluded.live_mode, public.billing_provider_events.live_mode),
         environment = coalesce(excluded.environment, public.billing_provider_events.environment),
         payload = coalesce(excluded.payload, public.billing_provider_events.payload)
  returning id, attempt_count into v_id, v_n;

  v_nuevo := (v_n = 1);
  return jsonb_build_object('event_id', v_id, 'attempt_count', v_n, 'is_first', v_nuevo);
end;
$$;

revoke all on function public.billing_record_provider_event(
  text, text, text, boolean, text, boolean, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.billing_record_provider_event(
  text, text, text, boolean, text, boolean, text, text, jsonb) to service_role;

comment on function public.billing_record_provider_event(text, text, text, boolean, text, boolean, text, text, jsonb) is
  'PE-05B2 · Anota una notificacion. Una fila por (proveedor, tema, recurso): reentregar incrementa `attempt_count`. Lo NO firmado se anota sin cuerpo y en estado `rejected`.';

create or replace function public.billing_close_provider_event(
  p_event_id uuid,
  p_processing_status text,
  p_outcome text default null,
  p_error_class text default null,
  p_organization_id uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  update public.billing_provider_events
     set processing_status = p_processing_status,
         outcome = p_outcome,
         error_class = p_error_class,
         organization_id = coalesce(p_organization_id, organization_id),
         processed_at = case when p_processing_status in ('processed', 'ignored')
                             then now() else processed_at end
   where id = p_event_id;
end;
$$;

revoke all on function public.billing_close_provider_event(uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.billing_close_provider_event(uuid, text, text, text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6 · CONCILIAR Y LIQUIDAR · el único camino a un plan de pago
-- ---------------------------------------------------------------------------
-- Todo lo que decide viene del SERVIDOR: la empresa, el presupuesto, el
-- importe esperado y el entorno salen del intento. Del proveedor solo se
-- aceptan dos cosas: qué pago es y cuánto dice que cobró. Y lo segundo se
-- compara, no se cree.
create or replace function public.billing_settle_provider_payment(
  p_provider text,
  p_external_reference text,
  p_provider_payment_id text,
  p_outcome text,
  p_amount bigint,
  p_currency text,
  p_live_mode boolean default null,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_intent public.billing_checkout_intents%rowtype;
  v_ya     public.billing_payments%rowtype;
  v_res    jsonb;
begin
  if p_outcome not in ('approved', 'declined', 'failed') then
    raise exception 'PAYMENT_OUTCOME_INVALID' using detail = coalesce(p_outcome, 'null');
  end if;

  -- IDEMPOTENCIA, ANTES QUE NADA. El proveedor reintenta por diseño: si este
  -- pago ya se liquidó, se devuelve lo mismo sin volver a tocar nada.
  if p_provider_payment_id is not null then
    select * into v_ya from public.billing_payments
     where provider = p_provider and provider_payment_id = p_provider_payment_id;
    if found then
      return jsonb_build_object('outcome', 'already_settled', 'payment_id', v_ya.id,
        'subscription_id', v_ya.subscription_id, 'organization_id', v_ya.organization_id);
    end if;
  end if;

  -- La referencia externa tiene que ser un intento NUESTRO. Un recurso válido
  -- del proveedor que apunte a cualquier otra cosa no activa nada.
  if p_external_reference is null then
    return jsonb_build_object('outcome', 'reference_missing');
  end if;
  begin
    select * into v_intent from public.billing_checkout_intents
     where id = p_external_reference::uuid for update;
  exception when invalid_text_representation then
    return jsonb_build_object('outcome', 'reference_unknown');
  end;
  if not found then
    return jsonb_build_object('outcome', 'reference_unknown');
  end if;
  if v_intent.provider <> p_provider then
    return jsonb_build_object('outcome', 'provider_mismatch', 'intent_id', v_intent.id);
  end if;

  -- ENTORNO. Un evento en vivo sobre un intento de pruebas no activa nada, y
  -- al revés tampoco. Falla cerrado: sin dato de entorno no se asume.
  if p_live_mode is null
     or (p_live_mode and v_intent.environment <> 'live')
     or (not p_live_mode and v_intent.environment <> 'test') then
    update public.billing_checkout_intents
       set status = 'manual_review', failure_reason = 'ENVIRONMENT_MISMATCH', updated_at = now()
     where id = v_intent.id;
    return jsonb_build_object('outcome', 'environment_mismatch', 'intent_id', v_intent.id,
      'organization_id', v_intent.organization_id);
  end if;

  -- CONCILIACIÓN. Exacta. No hay tolerancia: el peso colombiano no tiene
  -- decimales y el importe se calculó en enteros de punta a punta.
  if p_outcome = 'approved' then
    if p_currency is null or upper(p_currency) <> upper(v_intent.expected_currency) then
      update public.billing_checkout_intents
         set status = 'manual_review', failure_reason = 'PAYMENT_RECONCILIATION_MISMATCH',
             updated_at = now()
       where id = v_intent.id;
      return jsonb_build_object('outcome', 'reconciliation_mismatch', 'reason', 'currency',
        'expected', v_intent.expected_currency, 'received', p_currency,
        'intent_id', v_intent.id, 'organization_id', v_intent.organization_id);
    end if;
    if p_amount is null or p_amount <> v_intent.expected_total_amount then
      update public.billing_checkout_intents
         set status = 'manual_review', failure_reason = 'PAYMENT_RECONCILIATION_MISMATCH',
             updated_at = now()
       where id = v_intent.id;
      return jsonb_build_object('outcome', 'reconciliation_mismatch', 'reason', 'amount',
        'expected', v_intent.expected_total_amount, 'received', p_amount,
        'intent_id', v_intent.id, 'organization_id', v_intent.organization_id);
    end if;
  end if;

  -- Y solo ahora se liquida, por la primitiva canónica de B1. B2 no escribe
  -- ni un cobro ni una asignación a mano.
  v_res := public.billing_settle_payment(
    v_intent.quote_id, p_provider, p_provider_payment_id, p_outcome,
    'mp:' || p_provider_payment_id, p_failure_reason);

  update public.billing_checkout_intents
     set status = case p_outcome when 'approved' then 'settled'
                                 when 'declined' then 'declined' else 'failed' end,
         billing_subscription_id = coalesce((v_res->>'subscription_id')::uuid, billing_subscription_id),
         failure_reason = case when p_outcome = 'approved' then null else p_failure_reason end,
         updated_at = now()
   where id = v_intent.id;

  return jsonb_build_object(
    'outcome', case p_outcome when 'approved' then 'activated' else p_outcome end,
    'intent_id', v_intent.id,
    'organization_id', v_intent.organization_id,
    'payment_id', v_res->'payment_id',
    'subscription_id', v_res->'subscription_id',
    'modules_granted', v_res->'modules_granted');
end;
$$;

revoke all on function public.billing_settle_provider_payment(
  text, text, text, text, bigint, text, boolean, text) from public, anon, authenticated;
grant execute on function public.billing_settle_provider_payment(
  text, text, text, text, bigint, text, boolean, text) to service_role;

comment on function public.billing_settle_provider_payment(text, text, text, text, bigint, text, boolean, text) is
  'PE-05B2 · El UNICO camino de un pago verificado a un plan de pago. Empresa, presupuesto e importe esperado salen del intento, no del proveedor. Concilia exacto, comprueba el entorno y delega en billing_settle_payment. Idempotente por (proveedor, id de pago).';

-- ---------------------------------------------------------------------------
-- 7 · UNA RENOVACIÓN NO ES UNA CONTRATACIÓN
-- ---------------------------------------------------------------------------
-- Un cobro recurrente aprobado añade HISTORIA FINANCIERA y no crea una segunda
-- suscripción ni una segunda asignación vendida. El impuesto se resuelve con
-- la regla VIGENTE en el momento del cobro —por B1, no por aquí—, que es
-- justamente lo que permitirá que una exención futura se aplique al siguiente
-- cargo sin tocar la base contratada.
create or replace function public.billing_record_renewal_payment(
  p_provider text,
  p_provider_subscription_id text,
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
  v_intent public.billing_checkout_intents%rowtype;
  v_sub    public.billing_subscriptions%rowtype;
  v_ya     public.billing_payments%rowtype;
  v_regla  jsonb;
  v_imp    bigint;
  v_total  bigint;
  v_pago   uuid;
begin
  if p_outcome not in ('approved', 'declined', 'failed') then
    raise exception 'PAYMENT_OUTCOME_INVALID' using detail = coalesce(p_outcome, 'null');
  end if;

  if p_provider_payment_id is not null then
    select * into v_ya from public.billing_payments
     where provider = p_provider and provider_payment_id = p_provider_payment_id;
    if found then
      return jsonb_build_object('outcome', 'already_settled', 'payment_id', v_ya.id,
        'subscription_id', v_ya.subscription_id);
    end if;
  end if;

  select * into v_intent from public.billing_checkout_intents
   where provider = p_provider and provider_subscription_id = p_provider_subscription_id;
  if not found then
    return jsonb_build_object('outcome', 'reference_unknown');
  end if;
  if p_live_mode is null
     or (p_live_mode and v_intent.environment <> 'live')
     or (not p_live_mode and v_intent.environment <> 'test') then
    return jsonb_build_object('outcome', 'environment_mismatch', 'intent_id', v_intent.id);
  end if;

  select * into v_sub from public.billing_subscriptions
   where id = v_intent.billing_subscription_id for update;
  if not found then
    -- Llega una renovación de algo que aquí nunca llegó a activarse. No se
    -- inventa una suscripción: se manda a revisión.
    return jsonb_build_object('outcome', 'subscription_absent', 'intent_id', v_intent.id,
      'organization_id', v_intent.organization_id);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('billing:' || v_sub.organization_id::text, 0));

  -- El impuesto del cobro nuevo sale de la regla VIGENTE HOY, resuelta por B1.
  v_regla := public.billing_resolve_tax_rule('self_service_saas', now(), 'CO');
  if v_regla->>'status' <> 'found' then
    return jsonb_build_object('outcome', 'tax_unresolved', 'reason', v_regla->>'reason',
      'organization_id', v_sub.organization_id);
  end if;
  v_imp := public.billing_tax_amount(v_sub.base_charge_amount,
                                     (v_regla->>'rate_basis_points')::integer);
  v_total := v_sub.base_charge_amount + v_imp;

  if p_outcome = 'approved' then
    if p_currency is null or upper(p_currency) <> upper(v_sub.charge_currency)
       or p_amount is null or p_amount <> v_total then
      return jsonb_build_object('outcome', 'reconciliation_mismatch',
        'expected', v_total, 'received', p_amount,
        'organization_id', v_sub.organization_id);
    end if;
  end if;

  insert into public.billing_payments (
    organization_id, subscription_id, quote_id, provider, provider_payment_id,
    base_amount, discount_amount, service_class, tax_rule_id,
    tax_rate_basis_points, tax_amount, total_amount, currency, fx_rate_micros,
    status, paid_at, failed_at, idempotency_key)
  values (
    v_sub.organization_id, v_sub.id, null, p_provider, p_provider_payment_id,
    v_sub.base_charge_amount, 0, 'self_service_saas', (v_regla->>'tax_rule_id')::uuid,
    (v_regla->>'rate_basis_points')::integer, v_imp, v_total,
    v_sub.charge_currency, v_sub.fx_rate_micros,
    case p_outcome when 'approved' then 'approved' when 'declined' then 'declined' else 'failed' end,
    case when p_outcome = 'approved' then now() end,
    case when p_outcome <> 'approved' then now() end,
    'mp-renewal:' || p_provider_payment_id)
  returning id into v_pago;

  if p_outcome = 'approved' then
    -- Se corre el periodo. NI se crea otra suscripción NI se vuelve a
    -- conceder el plan: el derecho ya está puesto y sigue puesto.
    update public.billing_subscriptions
       set current_period_start = now(),
           current_period_end = now() + case billing_interval when 'monthly'
                                        then interval '1 month' else interval '1 year' end,
           renews_at = now() + case billing_interval when 'monthly'
                               then interval '1 month' else interval '1 year' end,
           status = case when status = 'past_due' then 'active' else status end,
           grace_until = null,
           updated_at = now()
     where id = v_sub.id;
  end if;

  return jsonb_build_object('outcome', case p_outcome when 'approved' then 'renewed' else p_outcome end,
    'payment_id', v_pago, 'subscription_id', v_sub.id,
    'organization_id', v_sub.organization_id, 'total_amount', v_total);
end;
$$;

revoke all on function public.billing_record_renewal_payment(
  text, text, text, text, bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.billing_record_renewal_payment(
  text, text, text, text, bigint, text, boolean) to service_role;

comment on function public.billing_record_renewal_payment(text, text, text, text, bigint, text, boolean) is
  'PE-05B2 · Un cobro recurrente aprobado. Anade historia financiera y corre el periodo: NO crea una segunda suscripcion ni una segunda asignacion vendida. El impuesto sale de la regla vigente HOY, por B1.';

-- ---------------------------------------------------------------------------
-- 8 · UN ESTADO DESCONOCIDO NO DEGRADA A NADIE
-- ---------------------------------------------------------------------------
create or replace function public.billing_mark_provider_subscription_state(
  p_provider text,
  p_provider_subscription_id text,
  p_provider_status text,
  p_canonical_status text,
  p_provider_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_intent public.billing_checkout_intents%rowtype;
begin
  select * into v_intent from public.billing_checkout_intents
   where provider = p_provider and provider_subscription_id = p_provider_subscription_id
   for update;
  if not found then
    return jsonb_build_object('outcome', 'reference_unknown');
  end if;

  if p_provider_version is not null and v_intent.provider_version is not null
     and p_provider_version < v_intent.provider_version then
    return jsonb_build_object('outcome', 'stale_provider_version', 'intent_id', v_intent.id);
  end if;

  update public.billing_checkout_intents
     set provider_status = p_provider_status,
         provider_version = coalesce(p_provider_version, provider_version),
         status = case
                    -- Un estado que no sabemos traducir NO toca nada del
                    -- derecho: se marca para que lo mire una persona.
                    when p_canonical_status is null then 'manual_review'
                    when v_intent.status = 'settled' then v_intent.status
                    else p_canonical_status end,
         updated_at = now()
   where id = v_intent.id;

  -- Y la suscripción canónica NUNCA se degrada desde aquí. Cancelar, pasar a
  -- moroso o terminar son decisiones de ciclo de vida, y son de B5.
  return jsonb_build_object('outcome', 'recorded', 'intent_id', v_intent.id,
    'organization_id', v_intent.organization_id,
    'canonical', coalesce(p_canonical_status, 'manual_review'));
end;
$$;

revoke all on function public.billing_mark_provider_subscription_state(
  text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.billing_mark_provider_subscription_state(
  text, text, text, text, integer) to service_role;

comment on function public.billing_mark_provider_subscription_state(text, text, text, text, integer) is
  'PE-05B2 · Anota el estado del objeto recurrente del proveedor. Un estado desconocido va a `manual_review` y NO degrada ningun derecho: cancelar o marcar moroso es ciclo de vida, y eso es B5.';
