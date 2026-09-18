-- ===========================================================================
-- Trazaloop · 0216 · BILLING-EXTRA-01B
-- La subida de plan cuando el cobro y la autorización NO van juntos.
--
--
-- QUÉ PROBLEMA RESUELVE
--
-- Hasta 0181 una subida de plan tenía dos desenlaces: se cobró y se concedió
-- Extra, o no se cobró y no pasó nada. Eso vale cuando cobrar es UNA operación.
--
-- Con Mercado Pago no lo es. Subir a Extra desde una suscripción que el
-- proveedor renueva sola exige dos cosas en dos sistemas distintos:
--
--   1 · cobrar la diferencia del periodo en curso (un pago único), y
--   2 · dejar la autorización recurrente cobrando el importe de Extra.
--
-- Entre las dos hay una frontera de red. La primera puede salir bien y la
-- segunda fallar. En ese momento la empresa ha pagado algo que no va a recibir,
-- y ninguno de los seis estados de 0181 dice eso: `settled` mentiría,
-- `cancelled` escondería un cobro real y `failed` afirmaría que el pago no
-- salió. El dinero estaría dentro y la fila diría que no.
--
-- Esta migración añade lo justo para poder decirlo: dos estados, la identidad
-- del cobro y la del reembolso, y las primitivas que los escriben.
--
--
-- LO QUE NO SE TOCA
--
-- `billing_quote_upgrade`, `billing_open_upgrade_intent`,
-- `billing_settle_upgrade_payment`, `billing_cancel_upgrade` y
-- `billing_mark_upgrade_uncertain` siguen exactamente como estaban.
-- `billing_settle_upgrade_payment` sigue siendo el ÚNICO camino de un pago
-- verificado a Extra, y sigue siendo idempotente por (proveedor, id de pago).
-- Lo de aquí vive al lado, no encima.
--
--
-- POR QUÉ NO HAY TABLA NUEVA DE REEMBOLSOS
--
-- Porque el dominio ya tiene el patrón: `billing_payments` lleva desde 0169
-- `refunded_amount`, `refunded_at` y los estados `refunded` y
-- `partially_refunded`, y el vocabulario canónico de proveedor ya traduce
-- `refunded`. Lo único que faltaba era la IDENTIDAD del reembolso en el
-- proveedor, que es una columna. Una tabla nueva habría creado un segundo libro
-- de dinero al lado del que ya existe.
--
-- La compensación de una subida es siempre el reembolso TOTAL de un pago único
-- —nunca un parcial, nunca dos—, y por eso una identidad por pago basta. Si
-- algún día hiciera falta un parcial, ese día se añade la tabla y esta columna
-- se convierte en el primer reembolso; no al revés.
--
--
-- PRODUCCIÓN. Aditiva. Ni una fila existente cambia de significado: los seis
-- estados de antes siguen queriendo decir lo mismo y ninguna fila se reescribe.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0 · PRECONDICIONES
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.billing_subscription_changes') is null then
    raise exception '0216 presupone billing_subscription_changes de 0181';
  end if;
  if to_regclass('public.billing_payments') is null then
    raise exception '0216 presupone billing_payments de 0169';
  end if;
  if to_regprocedure('public.billing_settle_upgrade_payment('
       || 'uuid,text,text,text,bigint,text,boolean,text)') is null then
    raise exception '0216 presupone billing_settle_upgrade_payment de 0181';
  end if;
  if to_regprocedure('public.log_event(uuid,text,jsonb,uuid)') is null then
    raise exception '0216 presupone log_event de 0005';
  end if;
  if to_regprocedure('public.is_platform_superadmin()') is null then
    raise exception '0216 presupone is_platform_superadmin';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1 · LA IDENTIDAD DEL REEMBOLSO, EN EL LIBRO QUE YA EXISTE
-- ---------------------------------------------------------------------------
alter table public.billing_payments
  add column if not exists provider_refund_id text;

comment on column public.billing_payments.provider_refund_id is
  'BILLING-EXTRA-01B · El identificador del reembolso EN EL PROVEEDOR. Sin él, '
  '«devuelto» es una afirmación nuestra que nadie puede contrastar contra el '
  'extracto. Con él, cualquiera puede.';

-- Un reembolso del proveedor no puede estar en dos filas del libro.
create unique index if not exists billing_payments_provider_refund_uniq
  on public.billing_payments (provider, provider_refund_id)
  where provider_refund_id is not null;

-- ---------------------------------------------------------------------------
-- 2 · LO QUE LA SUBIDA TIENE QUE PODER CONTAR
-- ---------------------------------------------------------------------------
alter table public.billing_subscription_changes
  -- La EVIDENCIA del cobro de la diferencia, observada en el proveedor antes de
  -- decidir nada. No es todavía un pago del libro: es lo que sabemos.
  add column if not exists delta_provider_payment_id text,
  add column if not exists delta_observed_at timestamptz,
  -- Por qué hubo que compensar. Vocabulario de dentro, para quien opera.
  add column if not exists compensation_reason text,
  -- La llave del reembolso. Se deriva del cambio, no se recibe: así reintentar
  -- es seguro y dos procesos a la vez piden EL MISMO reembolso, no dos.
  add column if not exists refund_idempotency_key text,
  add column if not exists refund_provider_id text,
  add column if not exists refund_requested_at timestamptz,
  add column if not exists refund_completed_at timestamptz,
  add column if not exists refund_failure_reason text,
  -- Quién desatascó esto, cuándo y con qué prueba delante.
  add column if not exists resolved_by uuid references public.profiles (id),
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution_evidence text;

comment on column public.billing_subscription_changes.delta_provider_payment_id is
  'BILLING-EXTRA-01B · El pago de la diferencia, tal y como lo llama el '
  'proveedor. Se escribe cuando se OBSERVA aprobado, que es antes de decidir si '
  'la subida se completa o se compensa.';
comment on column public.billing_subscription_changes.refund_idempotency_key is
  'BILLING-EXTRA-01B · Derivada del cambio, nunca recibida. Es lo que hace que '
  'reintentar un reembolso no cree un segundo reembolso.';

-- UN pago del proveedor respalda UNA subida. Sin esto, dos cambios podrían
-- reclamar el mismo cobro y uno de los dos concedería Extra gratis.
create unique index if not exists bsc_delta_payment_uniq
  on public.billing_subscription_changes (delta_provider_payment_id)
  where delta_provider_payment_id is not null;

-- ---------------------------------------------------------------------------
-- 3 · DOS ESTADOS MÁS. NI UNO MÁS QUE ESOS.
-- ---------------------------------------------------------------------------
--
-- `compensation_required` · el dinero entró y Extra NO se concede. Es un estado
--   de trabajo, no un final: dice que hay algo que devolver y que aún no se ha
--   devuelto. Se entra ANTES de llamar al proveedor, nunca después: si el
--   proceso se muere a mitad, la fila ya lo cuenta.
--
-- `refunded` · se devolvió, con identificador del proveedor. Final.
--
-- No hay un tercer estado «reembolsando». Lo intentamos y no aportaba: entre
-- «hay que devolver» y «se devolvió» no ocurre nada que alguien pueda decidir, y
-- un estado que solo existe durante una llamada de red es un estado en el que
-- las cosas se quedan atascadas cuando esa llamada no vuelve.
--
-- TRANSICIONES, todas:
--   pending               → submitted | cancelled
--   submitted             → settled | declined | failed | compensation_required
--   submitted             → cancelled  SOLO por la recuperación gobernada y con
--                                      prueba de que no hay cobro aprobado
--   compensation_required → refunded | compensation_required (reintento)
--   settled · refunded · cancelled · declined · failed → finales
--
-- De `compensation_required` NUNCA se sale hacia `settled`. Un pago que se
-- decidió devolver no puede conceder Extra: si alguien quisiera completar esa
-- subida, se presupuesta otra.
alter table public.billing_subscription_changes
  drop constraint if exists bsc_status_check;
alter table public.billing_subscription_changes
  add constraint bsc_status_check check (status in (
    'pending', 'submitted', 'settled', 'declined', 'failed', 'cancelled',
    'compensation_required', 'refunded'));

-- Una subida en vuelo por suscripción · AHORA INCLUYE LA COMPENSACIÓN PENDIENTE.
--
-- Con dinero sin devolver no se presupuesta otra subida: serían dos problemas de
-- dinero apilados sobre la misma empresa. Y no deja a nadie encerrado, porque
-- `billing_resolve_stuck_upgrade` existe justamente para sacarla de ahí.
drop index if exists public.bsc_inflight_uniq;
create unique index bsc_inflight_uniq
  on public.billing_subscription_changes (subscription_id)
  where status in ('pending', 'submitted', 'compensation_required');

-- Un reembolso completado tiene que traer las tres cosas o ninguna.
alter table public.billing_subscription_changes
  drop constraint if exists bsc_refund_shape;
alter table public.billing_subscription_changes
  add constraint bsc_refund_shape check (
    (status <> 'refunded')
    or (refund_provider_id is not null and refund_completed_at is not null
        and delta_provider_payment_id is not null));

-- Y para compensar hay que saber QUÉ se compensa.
alter table public.billing_subscription_changes
  drop constraint if exists bsc_compensation_shape;
alter table public.billing_subscription_changes
  add constraint bsc_compensation_shape check (
    (status <> 'compensation_required')
    or (delta_provider_payment_id is not null and compensation_reason is not null));

-- ---------------------------------------------------------------------------
-- 4 · ANOTAR EL COBRO OBSERVADO
-- ---------------------------------------------------------------------------
--
-- Esto NO es liquidar. Es dejar por escrito qué pago del proveedor respalda esta
-- subida, antes de tocar la autorización recurrente. Si lo que viene después
-- sale mal, esta anotación es lo único que permite saber qué hay que devolver.
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

  -- Repetir no hace nada nuevo. Es la respuesta correcta a que el conciliador
  -- corra dos veces, que es lo normal: lo dispara la vuelta del navegador, el
  -- aviso del proveedor y el barrido.
  if v_c.delta_provider_payment_id is not null then
    if v_c.delta_provider_payment_id = p_provider_payment_id then
      return jsonb_build_object('status', 'already_observed',
        'change_id', v_c.id, 'provider_payment_id', v_c.delta_provider_payment_id);
    end if;
    -- Dos pagos distintos para la misma subida. No se elige: se para.
    return jsonb_build_object('status', 'delta_payment_conflict',
      'observed', v_c.delta_provider_payment_id, 'received', p_provider_payment_id);
  end if;

  if v_c.status <> 'submitted' then
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
  'BILLING-EXTRA-01B · Anota qué pago del proveedor respalda una subida, sin '
  'liquidarla. Es lo que permite devolver el dinero exacto si el paso siguiente '
  'falla. Idempotente, y para en vez de elegir si aparecen dos pagos distintos.';

-- ---------------------------------------------------------------------------
-- 5 · ABRIR LA COMPENSACIÓN
-- ---------------------------------------------------------------------------
--
-- Se entra AQUÍ antes de pedirle nada al proveedor. El orden importa: si se
-- pidiera primero el reembolso y se anotara después, un proceso que se muere en
-- medio dejaría un reembolso hecho y una fila que dice que la subida sigue
-- viva.
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
  -- Una subida ya liquidada no se compensa: el cliente tiene Extra y lo pagó.
  if v_c.status = 'settled' then
    return jsonb_build_object('status', 'already_settled', 'change_id', v_c.id);
  end if;
  if v_c.status <> 'submitted' then
    return jsonb_build_object('status', 'not_compensable', 'reason', v_c.status);
  end if;
  if v_c.delta_provider_payment_id is null then
    -- Sin cobro observado no hay nada que devolver, y decir que sí lo hay sería
    -- inventar una deuda nuestra.
    return jsonb_build_object('status', 'no_delta_payment', 'change_id', v_c.id);
  end if;

  -- LA LLAVE SE DERIVA. Del cambio y del pago, que son los dos hechos que
  -- identifican esta devolución y no cambian. Dos procesos que lleguen a la vez
  -- calculan la misma y el proveedor devuelve el mismo reembolso.
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
  'BILLING-EXTRA-01B · Declara que un cobro de subida hay que devolverlo, ANTES '
  'de pedírselo al proveedor. Deriva la llave de idempotencia del reembolso. '
  'Nunca concede Extra y nunca sale de aquí hacia liquidada.';

-- ---------------------------------------------------------------------------
-- 6 · EL REEMBOLSO, CUANDO VUELVE CON IDENTIFICADOR
-- ---------------------------------------------------------------------------
--
-- Y solo entonces entra en el libro. Una fila de `billing_payments` con estado
-- `refunded` es la verdad completa de lo que pasó: entró dinero y salió.
--
-- La fila se escribe con el id del PAGO, así que el índice único de 0169 por
-- (proveedor, id de pago) garantiza sola una cosa importante: ese mismo cobro no
-- podrá nunca después liquidarse como subida. Un pago devuelto no concede nada.
create or replace function public.billing_record_upgrade_refund(
  p_change_id uuid,
  p_provider_refund_id text,
  p_amount bigint,
  p_currency text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_c    public.billing_subscription_changes%rowtype;
  v_pago uuid;
begin
  if p_provider_refund_id is null or btrim(p_provider_refund_id) = '' then
    raise exception 'PROVIDER_REFUND_ID_REQUIRED';
  end if;

  select * into v_c from public.billing_subscription_changes
   where id = p_change_id for update;
  if not found then
    return jsonb_build_object('status', 'change_not_found');
  end if;

  if v_c.status = 'refunded' then
    return jsonb_build_object('status', 'already_refunded', 'change_id', v_c.id,
      'provider_refund_id', v_c.refund_provider_id, 'payment_id', v_c.payment_id);
  end if;
  if v_c.status <> 'compensation_required' then
    return jsonb_build_object('status', 'not_compensating', 'reason', v_c.status);
  end if;

  -- CONCILIACIÓN EXACTA, igual que en los otros tres caminos. Un reembolso por
  -- un importe distinto del cobrado no es este reembolso.
  if p_amount is null or p_amount <> v_c.total_amount
     or p_currency is null or upper(p_currency) <> upper(v_c.charge_currency) then
    update public.billing_subscription_changes
       set refund_failure_reason = 'REFUND_RECONCILIATION_MISMATCH', updated_at = now()
     where id = v_c.id;
    return jsonb_build_object('status', 'reconciliation_mismatch',
      'expected', v_c.total_amount, 'received', p_amount,
      'change_id', v_c.id, 'organization_id', v_c.organization_id);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('billing:' || v_c.organization_id::text, 0));

  insert into public.billing_payments (
    organization_id, subscription_id, quote_id, subscription_change_id,
    provider, provider_payment_id,
    base_amount, discount_amount,
    service_class, tax_rule_id, tax_rate_basis_points, tax_amount,
    total_amount, currency, fx_rate_micros,
    status, paid_at, refunded_amount, refunded_at, provider_refund_id)
  values (
    v_c.organization_id, v_c.subscription_id, v_c.quote_id, v_c.id,
    -- El proveedor del intento que lo cobró. Se lee del intento para no
    -- recibirlo: quien llama no decide de qué pasarela era un cobro.
    (select i.provider from public.billing_checkout_intents i
      where i.subscription_change_id = v_c.id
      order by i.created_at desc limit 1),
    v_c.delta_provider_payment_id,
    v_c.delta_base, 0,
    v_c.service_class, v_c.tax_rule_id, v_c.tax_rate_basis_points, v_c.tax_amount,
    v_c.total_amount, v_c.charge_currency, v_c.fx_rate_micros,
    'refunded', v_c.delta_observed_at, v_c.total_amount, now(), p_provider_refund_id)
  -- EL PREDICADO HACE FALTA. El índice de 0169 es PARCIAL —sólo cuando hay
  -- identificador de pago—, y PostgreSQL no lo acepta como árbitro si la
  -- sentencia no repite su condición. Sin esto la función no falla al
  -- crearse: falla al ejecutarse, que es el peor momento posible.
  on conflict (provider, provider_payment_id)
    where provider_payment_id is not null do nothing
  returning id into v_pago;

  if v_pago is null then
    -- Ya había una fila para ese cobro. Se usa esa: el libro no se duplica.
    select id into v_pago from public.billing_payments
     where provider_payment_id = v_c.delta_provider_payment_id
     order by created_at desc limit 1;
  end if;

  update public.billing_subscription_changes
     set status = 'refunded',
         refund_provider_id = p_provider_refund_id,
         refund_completed_at = now(),
         refund_failure_reason = null,
         payment_id = v_pago,
         updated_at = now()
   where id = v_c.id;

  -- Y la cotización deja de poder consumirse.
  update public.billing_quotes set status = 'void'
   where id = v_c.quote_id and status not in ('consumed', 'void');

  return jsonb_build_object('status', 'refunded', 'change_id', v_c.id,
    'organization_id', v_c.organization_id, 'payment_id', v_pago,
    'provider_refund_id', p_provider_refund_id, 'amount', v_c.total_amount);
end;
$$;

revoke all on function public.billing_record_upgrade_refund(uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.billing_record_upgrade_refund(uuid, text, bigint, text)
  to service_role;

comment on function public.billing_record_upgrade_refund(uuid, text, bigint, text) is
  'BILLING-EXTRA-01B · Cierra una compensación con el identificador del '
  'reembolso en el proveedor y escribe la fila del libro. Concilia exacto. El '
  'índice único de 0169 impide que ese cobro pueda liquidarse después.';

-- ---------------------------------------------------------------------------
-- 7 · CUANDO EL REEMBOLSO NO SALE
-- ---------------------------------------------------------------------------
--
-- No se cambia de estado. Sigue en `compensation_required`, que es exactamente
-- lo que pasa: hay dinero que devolver y todavía no se ha devuelto. Lo único
-- que se añade es por qué, para que quien lo mire sepa si reintentar sirve.
create or replace function public.billing_record_upgrade_refund_failure(
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
begin
  select * into v_c from public.billing_subscription_changes
   where id = p_change_id for update;
  if not found then
    return jsonb_build_object('status', 'change_not_found');
  end if;
  if v_c.status <> 'compensation_required' then
    return jsonb_build_object('status', 'not_compensating', 'reason', v_c.status);
  end if;

  update public.billing_subscription_changes
     set refund_failure_reason = coalesce(p_reason, 'REFUND_UNKNOWN'),
         updated_at = now()
   where id = v_c.id;

  return jsonb_build_object('status', 'compensation_required',
    'change_id', v_c.id, 'organization_id', v_c.organization_id,
    'reason', coalesce(p_reason, 'REFUND_UNKNOWN'));
end;
$$;

revoke all on function public.billing_record_upgrade_refund_failure(uuid, text)
  from public, anon, authenticated;
grant execute on function public.billing_record_upgrade_refund_failure(uuid, text)
  to service_role;

comment on function public.billing_record_upgrade_refund_failure(uuid, text) is
  'BILLING-EXTRA-01B · Anota por qué no se pudo devolver. NO cambia de estado: '
  'sigue habiendo dinero que devolver, y disfrazarlo de cancelado sería '
  'esconderlo.';

-- ---------------------------------------------------------------------------
-- 8 · SACAR A UNA EMPRESA DE UN `submitted` HUÉRFANO
-- ---------------------------------------------------------------------------
--
-- EL AGUJERO QUE CIERRA
--
-- `billing_open_upgrade_intent` pone el cambio en `submitted` y desde ahí
-- `billing_cancel_upgrade` contesta `not_cancellable` y `billing_quote_upgrade`
-- contesta `upgrade_already_pending` para siempre. Si el proveedor enmudece, la
-- empresa se queda sin poder volver a subir de plan NUNCA, y la única salida era
-- una escritura directa con `service_role`. Eso no es un mecanismo: es no tener
-- ninguno.
--
--
-- LO QUE ESTA FUNCIÓN NO HACE
--
-- No pregunta al proveedor. No puede: vive en la base. La prueba se recoge fuera
-- —consultando los pagos de esa referencia— y entra aquí como un valor cerrado.
-- Lo que sí hace es NEGARSE a liberar cuando esa prueba dice que hay un cobro
-- aprobado. Un desatasco que borra un cobro real no es un desatasco.
create or replace function public.billing_resolve_stuck_upgrade(
  p_change_id uuid,
  p_evidence text,
  p_provider_payment_id text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_c public.billing_subscription_changes%rowtype;
  v_r jsonb;
begin
  -- Quién puede. Esto toca dinero de otra empresa: no basta con ser de
  -- plataforma, hace falta ser quien responde por ella.
  if not public.is_platform_superadmin() then
    raise exception 'NOT_AUTHORIZED'
      using hint = 'Solo un superadministrador de plataforma desatasca una subida.';
  end if;
  if p_evidence not in ('no_payment', 'payment_failed', 'payment_approved',
                        'provider_unknown') then
    raise exception 'EVIDENCE_INVALID' using detail = coalesce(p_evidence, 'null');
  end if;

  select * into v_c from public.billing_subscription_changes
   where id = p_change_id for update;
  if not found then
    return jsonb_build_object('status', 'change_not_found');
  end if;

  -- Ya resuelto. Repetir no vuelve a hacer nada: converge.
  if v_c.status in ('settled', 'refunded', 'cancelled', 'declined', 'failed') then
    return jsonb_build_object('status', 'already_resolved',
      'change_id', v_c.id, 'change_status', v_c.status);
  end if;
  if v_c.status <> 'submitted' then
    return jsonb_build_object('status', 'not_stuck', 'reason', v_c.status);
  end if;

  if p_evidence = 'provider_unknown' then
    -- No se sabe. Que no se sepa NO es una razón para soltar: se deja escrito y
    -- se vuelve cuando se sepa.
    update public.billing_subscription_changes
       set failure_reason = coalesce(p_reason, 'PROVIDER_UNKNOWN'),
           resolved_by = auth.uid(), resolved_at = now(),
           resolution_evidence = p_evidence, updated_at = now()
     where id = v_c.id;
    perform public.log_event(v_c.organization_id, 'billing.upgrade.recovery_deferred',
      jsonb_build_object('change_id', v_c.id, 'evidence', p_evidence,
                         'reason', coalesce(p_reason, 'PROVIDER_UNKNOWN')));
    return jsonb_build_object('status', 'still_uncertain', 'change_id', v_c.id);
  end if;

  if p_evidence = 'payment_approved' then
    -- Hay dinero dentro. No se libera: se compensa, que es el único camino
    -- honesto desde aquí.
    if p_provider_payment_id is null or btrim(p_provider_payment_id) = '' then
      raise exception 'PROVIDER_PAYMENT_ID_REQUIRED'
        using hint = 'Para declarar un cobro aprobado hay que decir cuál.';
    end if;
    v_r := public.billing_observe_upgrade_delta(v_c.id, p_provider_payment_id);
    if v_r->>'status' not in ('observed', 'already_observed') then
      return v_r || jsonb_build_object('change_id', v_c.id);
    end if;
    v_r := public.billing_open_upgrade_compensation(
             v_c.id, coalesce(p_reason, 'RECOVERY_PAYMENT_APPROVED_NOT_SETTLED'));
    update public.billing_subscription_changes
       set resolved_by = auth.uid(), resolved_at = now(),
           resolution_evidence = p_evidence, updated_at = now()
     where id = v_c.id;
    perform public.log_event(v_c.organization_id, 'billing.upgrade.recovery_to_compensation',
      jsonb_build_object('change_id', v_c.id, 'evidence', p_evidence,
                         'provider_payment_id', p_provider_payment_id));
    return v_r || jsonb_build_object('status', 'compensation_required',
                                     'change_id', v_c.id);
  end if;

  -- `no_payment` y `payment_failed`: nadie pagó nada. Soltar es seguro, y es lo
  -- que devuelve a la empresa la posibilidad de volver a intentarlo.
  update public.billing_subscription_changes
     set status = 'cancelled',
         failure_reason = coalesce(p_reason, upper(p_evidence)),
         resolved_by = auth.uid(), resolved_at = now(),
         resolution_evidence = p_evidence, updated_at = now()
   where id = v_c.id;
  update public.billing_quotes set status = 'void'
   where id = v_c.quote_id and status not in ('consumed', 'void');
  update public.billing_checkout_intents
     set status = 'cancelled', failure_reason = coalesce(p_reason, upper(p_evidence)),
         updated_at = now()
   where subscription_change_id = v_c.id
     and status not in ('settled', 'declined', 'failed', 'cancelled');

  perform public.log_event(v_c.organization_id, 'billing.upgrade.recovery_released',
    jsonb_build_object('change_id', v_c.id, 'evidence', p_evidence,
                       'reason', coalesce(p_reason, upper(p_evidence))));

  return jsonb_build_object('status', 'released', 'change_id', v_c.id,
    'organization_id', v_c.organization_id, 'evidence', p_evidence);
end;
$$;

revoke all on function public.billing_resolve_stuck_upgrade(uuid, text, text, text)
  from public, anon;
grant execute on function public.billing_resolve_stuck_upgrade(uuid, text, text, text)
  to authenticated;

comment on function public.billing_resolve_stuck_upgrade(uuid, text, text, text) is
  'BILLING-EXTRA-01B · La salida gobernada de un `submitted` huérfano. Exige '
  'superadministrador, exige PRUEBA del proveedor y se niega a liberar cuando '
  'esa prueba dice que hay un cobro aprobado: eso se compensa. Idempotente y '
  'auditada con actor.';

-- ---------------------------------------------------------------------------
-- 9 · LO QUE UNA SUBIDA EN VUELO LE DICE AL BARRIDO
-- ---------------------------------------------------------------------------
--
-- No cambia nada: solo lo cuenta. El barrido recurrente pregunta por aquí si una
-- suscripción tiene una transición abierta, porque conciliar un ciclo del
-- proveedor en mitad de una subida mezcla dos cuentas que se hicieron sobre
-- periodos distintos.
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
       and status in ('pending', 'submitted', 'compensation_required'));
$$;

revoke all on function public.billing_upgrade_in_flight(uuid) from public, anon;
grant execute on function public.billing_upgrade_in_flight(uuid) to authenticated, service_role;

comment on function public.billing_upgrade_in_flight(uuid) is
  'BILLING-EXTRA-01B · ¿Hay una subida abierta sobre esta suscripción? La usa el '
  'barrido recurrente para no conciliar un ciclo dentro de una transición.';

-- ---------------------------------------------------------------------------
-- 10 · LA GUARDA DE «YA HAY UNA SUBIDA» APRENDE EL ESTADO NUEVO
-- ---------------------------------------------------------------------------
--
-- Es la MISMA funcion de 0181, reemitida con UN solo cambio: la lista de
-- estados que cuentan como «ya hay una subida en el aire» incluye ahora
-- `compensation_required`.
--
-- Hacia falta porque `bsc_inflight_uniq` si lo cuenta. Sin tocar aqui, una
-- empresa con un cobro sin devolver pasaba la guarda, llegaba al INSERT y
-- recibia una violacion de indice unico: un error crudo de base de datos en
-- una pantalla de dinero, en vez de «ya hay una subida pendiente».
--
-- Nada mas cambia. Ni el prorrateo, ni las bases, ni el impuesto, ni el orden
-- de las comprobaciones, ni los permisos.
create or replace function public.billing_quote_upgrade(
  p_subscription_id uuid,
  p_target_plan_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_sub    public.billing_subscriptions%rowtype;
  v_per    public.billing_subscription_periods%rowtype;
  v_rev    record;
  v_fx     jsonb;
  v_imp    jsonb;
  v_cat    bigint;
  v_destino bigint;
  v_total_seg bigint;
  v_resto_seg bigint;
  v_p_actual bigint;
  v_p_destino bigint;
  v_delta  bigint;
  v_iva    bigint;
  v_clase  text := 'self_service_saas';
  v_ahora  timestamptz := now();
  v_cambio uuid;
  v_quote  uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_target_plan_code not in ('full', 'extra') then
    raise exception 'PLAN_NOT_PURCHASABLE' using detail = coalesce(p_target_plan_code, 'null');
  end if;

  select * into v_sub from public.billing_subscriptions
   where id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('status', 'subscription_not_found');
  end if;
  if not public.has_org_role(v_sub.organization_id, array['admin']) then
    raise exception 'NOT_AUTHORIZED'
      using hint = 'Solo quien administra la empresa puede cambiar el plan.';
  end if;
  if v_sub.status <> 'active' then
    return jsonb_build_object('status', 'not_upgradable', 'reason', v_sub.status);
  end if;
  if v_sub.plan_code = p_target_plan_code then
    return jsonb_build_object('status', 'already_on_plan', 'plan_code', v_sub.plan_code);
  end if;
  -- Una decision a la vez. Si hay una transicion programada, primero se retira.
  if v_sub.scheduled_plan_revision_id is not null then
    return jsonb_build_object('status', 'change_already_scheduled',
      'effective_at', v_sub.scheduled_effective_at);
  end if;
  if v_sub.cancel_at_period_end then
    return jsonb_build_object('status', 'cancellation_scheduled');
  end if;
  if exists (select 1 from public.billing_subscription_changes
              where subscription_id = v_sub.id
                and status in ('pending', 'submitted', 'compensation_required')) then
    -- 0216 · `compensation_required` entra en esta lista. Sin ella, la empresa
    -- con dinero sin devolver pasaba de largo y el INSERT de mas abajo chocaba
    -- contra `bsc_inflight_uniq`: la pantalla recibia una violacion de indice
    -- en vez de una respuesta. Una guarda que solo existe en el indice no es
    -- una guarda, es un error con otra forma.
    return jsonb_build_object('status', 'upgrade_already_pending');
  end if;

  -- CONTRA QUÉ TIEMPO. El periodo vigente tiene que estar pagado: subir de plan
  -- mientras se debe el mes en curso seria cobrar dos cosas a la vez.
  select * into v_per from public.billing_subscription_periods
   where subscription_id = p_subscription_id
   order by period_sequence desc limit 1;
  if not found then
    return jsonb_build_object('status', 'anchor_missing');
  end if;
  if v_per.status <> 'settled' then
    return jsonb_build_object('status', 'period_unpaid', 'period_id', v_per.id);
  end if;
  if v_ahora >= v_per.period_end then
    return jsonb_build_object('status', 'period_ended', 'period_end', v_per.period_end);
  end if;
  if v_ahora < v_per.period_start then
    return jsonb_build_object('status', 'period_not_started');
  end if;

  v_total_seg := extract(epoch from (v_per.period_end - v_per.period_start))::bigint;
  v_resto_seg := extract(epoch from (v_per.period_end - v_ahora))::bigint;
  if v_resto_seg <= 0 or v_total_seg <= 0 then
    return jsonb_build_object('status', 'period_ended');
  end if;

  select r.id, r.plan_code, r.currency, r.price_state,
         r.monthly_price_minor, r.annual_price_minor
    into v_rev
    from public.plan_revisions r
   where r.plan_code = p_target_plan_code and r.status = 'published'
     and r.effective_to is null;
  if v_rev.id is null then
    raise exception 'PLAN_REVISION_NOT_PUBLISHED' using detail = p_target_plan_code;
  end if;
  if v_rev.price_state <> 'configured' then
    raise exception 'PLAN_PRICE_NOT_CONFIGURED' using detail = p_target_plan_code;
  end if;

  -- SUBIR MANTIENE LA PERIODICIDAD. Convertir de mensual a anual y ampliar el
  -- plan en la misma operacion financiera mezcla dos decisiones con dos
  -- calendarios; quien quiera las dos hace primero una y programa la otra.
  v_cat := case when v_sub.billing_interval = 'monthly'
                then v_rev.monthly_price_minor else v_rev.annual_price_minor end;
  if v_cat is null or v_cat <= 0 then
    raise exception 'PLAN_PRICE_NOT_CONFIGURED' using detail = v_sub.billing_interval;
  end if;

  -- El precio DESTINO es una decision comercial nueva y por eso exige tasa
  -- vigente. El valor de origen NO se reconstruye: es el que la empresa tiene
  -- congelado, descuento incluido si lo hubo.
  v_fx := public.billing_resolve_fx(v_rev.currency, v_sub.charge_currency, v_ahora);
  if v_fx->>'status' <> 'found' then
    raise exception 'FX_RATE_UNAVAILABLE'
      using detail = v_rev.currency || '→' || v_sub.charge_currency,
            hint = 'Subir de plan fija un precio nuevo y eso exige tipo de cambio vigente.';
  end if;
  v_destino := public.billing_usd_minor_to_cop(v_cat, (v_fx->>'rate_micros')::bigint);

  v_p_actual  := public.billing_prorate(v_sub.base_charge_amount, v_resto_seg, v_total_seg);
  v_p_destino := public.billing_prorate(v_destino, v_resto_seg, v_total_seg);
  v_delta     := v_p_destino - v_p_actual;

  if v_delta <= 0 then
    -- Falla cerrado. Convertir esto en un abono automatico seria inventar
    -- devoluciones que el producto no hace.
    return jsonb_build_object('status', 'no_positive_delta',
      'prorated_current_base', v_p_actual, 'prorated_target_base', v_p_destino,
      'reason', 'El plan destino no cuesta mas que el actual para el tiempo restante.');
  end if;

  v_imp := public.billing_resolve_tax_rule(v_clase, v_ahora, 'CO');
  if v_imp->>'status' <> 'found' then
    raise exception 'TAX_RULE_UNAVAILABLE' using detail = v_clase;
  end if;
  v_iva := public.billing_tax_amount(v_delta, (v_imp->>'rate_basis_points')::integer);

  insert into public.billing_quotes (
    organization_id, plan_code, plan_revision_id, billing_interval,
    catalog_amount_minor, catalog_currency,
    fx_rate_id, fx_rate_micros, charge_currency,
    discount_amount, base_amount,
    service_class, tax_rule_id, tax_rate_basis_points, tax_amount, total_amount,
    expires_at, created_by, subscription_id)
  values (
    v_sub.organization_id, v_rev.plan_code, v_rev.id, v_sub.billing_interval,
    v_cat, v_rev.currency,
    nullif(v_fx->>'fx_rate_id', '')::uuid, (v_fx->>'rate_micros')::bigint,
    v_sub.charge_currency,
    0, v_delta,
    v_clase, (v_imp->>'tax_rule_id')::uuid, (v_imp->>'rate_basis_points')::integer,
    v_iva, v_delta + v_iva,
    v_ahora + interval '30 minutes', auth.uid(), v_sub.id)
  returning id into v_quote;

  insert into public.billing_subscription_changes (
    organization_id, subscription_id, kind,
    from_plan_code, from_plan_revision_id, to_plan_code, to_plan_revision_id,
    billing_interval, period_id, period_start, period_end, effective_at,
    remaining_seconds, period_seconds,
    current_full_base, target_full_base, charge_currency,
    prorated_current_base, prorated_target_base, delta_base,
    service_class, tax_rule_id, tax_rate_basis_points, tax_amount, total_amount,
    fx_rate_id, fx_rate_micros, quote_id, created_by)
  values (
    v_sub.organization_id, v_sub.id, 'immediate_upgrade',
    v_sub.plan_code, v_sub.plan_revision_id, v_rev.plan_code, v_rev.id,
    v_sub.billing_interval, v_per.id, v_per.period_start, v_per.period_end, v_ahora,
    v_resto_seg, v_total_seg,
    v_sub.base_charge_amount, v_destino, v_sub.charge_currency,
    v_p_actual, v_p_destino, v_delta,
    v_clase, (v_imp->>'tax_rule_id')::uuid, (v_imp->>'rate_basis_points')::integer,
    v_iva, v_delta + v_iva,
    nullif(v_fx->>'fx_rate_id', '')::uuid, (v_fx->>'rate_micros')::bigint,
    v_quote, auth.uid())
  returning id into v_cambio;

  return jsonb_build_object(
    'status', 'quoted',
    'change_id', v_cambio, 'quote_id', v_quote,
    'subscription_id', v_sub.id,
    'from_plan_code', v_sub.plan_code, 'to_plan_code', v_rev.plan_code,
    'billing_interval', v_sub.billing_interval,
    'period_start', v_per.period_start, 'period_end', v_per.period_end,
    'renews_at', v_per.period_end,
    'remaining_seconds', v_resto_seg, 'period_seconds', v_total_seg,
    'current_full_base', v_sub.base_charge_amount,
    'target_full_base', v_destino,
    'prorated_current_base', v_p_actual,
    'prorated_target_base', v_p_destino,
    'delta_base', v_delta,
    'tax_rate_basis_points', (v_imp->>'rate_basis_points')::integer,
    'tax_amount', v_iva,
    'total_amount', v_delta + v_iva,
    'charge_currency', v_sub.charge_currency);
end;
$$;


revoke all on function public.billing_quote_upgrade(uuid, text) from public, anon;
grant execute on function public.billing_quote_upgrade(uuid, text) to authenticated;

comment on function public.billing_quote_upgrade(uuid, text) is
  'PE-05B6E · Presupuesta la subida inmediata de plan: cobra solo la DIFERENCIA que corresponde al tiempo que queda del periodo ya pagado. El valor del plan actual sale de su base congelada —con su descuento— y el del destino, del catalogo con tasa vigente. Nunca devuelve dinero: si la diferencia no es positiva, falla cerrado. BILLING-EXTRA-01B: una compensacion abierta tambien cuenta como subida en el aire.';
