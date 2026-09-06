-- ===========================================================================
-- Trazaloop · PE-06C2 · Que alguien se entere cuando un cobro queda en duda
-- ===========================================================================
--
-- EL HUECO
--
-- El dominio de facturación ya sabe decir «no sé si se cobró»: cuando la
-- petición cruzó la frontera del proveedor y no hubo respuesta, el intento
-- queda en `provider_unknown`, no se concede nada y NADIE vuelve a cobrar solo.
-- Eso está bien resuelto y probado.
--
-- Lo que falta es que alguien se ENTERE. Hoy todo se consulta y nada avisa. Para
-- desplegar sin cobro automático basta; para encender el cobro automático, no:
-- un cobro en duda que nadie mira durante una semana es exactamente el caso que
-- la arquitectura evita en la base y que la operación tiene que rematar.
--
-- LO QUE ESTO NO ES
--
-- No es una segunda verdad financiera. Esta tabla OBSERVA lo que ya decidieron
-- `billing_checkout_intents` y sus clases de fallo; no decide nada. Si el aviso
-- no se puede entregar, la suscripción, el periodo y el cobro se quedan
-- exactamente donde estaban.
--
-- Y NO ES `work_alerts`
--
-- Quality ya tiene su tabla de avisos, pero es de INQUILINO: exige empresa y
-- persona destinataria, y sirve para avisar al equipo de un cliente de que su
-- objetivo vence. Un cobro en duda no es asunto del cliente: es de quien opera
-- la plataforma. Meterlo ahí habría convertido la automatización de Quality en
-- autoridad de facturación, que es justo lo que no debe pasar.
-- ===========================================================================

do $$
begin
  if to_regclass('public.billing_checkout_intents') is null
     or to_regclass('public.billing_subscription_changes') is null then
    raise exception '0183 presupone 0171 y 0181';
  end if;
  raise notice '0183 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · LA SEÑAL
-- ---------------------------------------------------------------------------
create table if not exists public.billing_operations_alerts (
  id uuid primary key default gen_random_uuid(),

  -- Qué pasó, en vocabulario del dominio.
  alert_type text not null,
  failure_class text,

  -- A qué se refiere. La empresa se guarda para poder mirarla, no para
  -- avisarla: el destinatario es quien opera la plataforma.
  organization_id uuid references public.organizations (id) on delete set null,
  subscription_id uuid references public.billing_subscriptions (id),
  period_id uuid references public.billing_subscription_periods (id),
  intent_id uuid references public.billing_checkout_intents (id),
  subscription_change_id uuid references public.billing_subscription_changes (id),

  -- Lo que se puede enseñar. Ni un dato de tarjeta, ni una llave, ni un sobre
  -- firmado: identificadores, clases y momentos.
  detail jsonb not null default '{}'::jsonb,

  -- Entrega. Separada del hecho: que no se pueda avisar no cambia el hecho.
  status text not null default 'pending',
  delivery_attempts integer not null default 0,
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  last_error text,

  -- UNA sola alerta por hecho. Repetir el barrido no debe llenar el buzón.
  dedupe_key text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint boa_type_check check (alert_type in (
    'renewal_provider_unknown', 'renewal_integrity_mismatch',
    'upgrade_provider_unknown', 'manual_review_required')),
  constraint boa_status_check check (status in ('pending', 'sent', 'failed', 'acknowledged')),
  constraint boa_delivered_shape check ((status = 'sent') = (delivered_at is not null))
);

create unique index if not exists boa_dedupe_uniq
  on public.billing_operations_alerts (dedupe_key);
create index if not exists boa_pending_idx
  on public.billing_operations_alerts (status, created_at)
  where status in ('pending', 'failed');

alter table public.billing_operations_alerts enable row level security;

drop policy if exists billing_operations_alerts_read on public.billing_operations_alerts;
create policy billing_operations_alerts_read on public.billing_operations_alerts
  for select to authenticated
  using (public.is_platform_staff());

revoke all on public.billing_operations_alerts from anon;
revoke insert, update, delete, truncate on public.billing_operations_alerts
  from authenticated, anon;
grant select on public.billing_operations_alerts to authenticated;

comment on table public.billing_operations_alerts is
  'PE-06C2 · Avisos de OPERACION sobre cobros en duda. Observa la verdad financiera; no la decide. El destinatario es quien opera la plataforma, no el cliente: un cobro que no se sabe si entró no es asunto de la empresa que lo pago.';

-- ---------------------------------------------------------------------------
-- 2 · LEVANTAR UNA, Y UNA SOLA VEZ
-- ---------------------------------------------------------------------------
create or replace function public.billing_raise_operations_alert(
  p_alert_type text,
  p_dedupe_key text,
  p_failure_class text default null,
  p_organization_id uuid default null,
  p_subscription_id uuid default null,
  p_period_id uuid default null,
  p_intent_id uuid default null,
  p_subscription_change_id uuid default null,
  p_detail jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
  insert into public.billing_operations_alerts (
    alert_type, dedupe_key, failure_class, organization_id, subscription_id,
    period_id, intent_id, subscription_change_id, detail)
  values (p_alert_type, p_dedupe_key, p_failure_class, p_organization_id,
          p_subscription_id, p_period_id, p_intent_id, p_subscription_change_id,
          coalesce(p_detail, '{}'::jsonb))
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('status', 'already_raised', 'dedupe_key', p_dedupe_key);
  end if;
  return jsonb_build_object('status', 'raised', 'alert_id', v_id);
end;
$$;

revoke all on function public.billing_raise_operations_alert(
  text, text, text, uuid, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.billing_raise_operations_alert(
  text, text, text, uuid, uuid, uuid, uuid, uuid, jsonb) to service_role;

comment on function public.billing_raise_operations_alert(text, text, text, uuid, uuid, uuid, uuid, uuid, jsonb) is
  'PE-06C2 · Levanta un aviso de operacion. Idempotente por `dedupe_key`: repetir el barrido no llena el buzon, y un hecho nuevo si genera un aviso nuevo.';

-- ---------------------------------------------------------------------------
-- 3 · EL BARRIDO, QUE MIRA LA VERDAD QUE YA EXISTE
-- ---------------------------------------------------------------------------
-- No hay tabla nueva de estado financiero: se leen los intentos, que es donde
-- 0177 y 0181 dejaron escrita la incertidumbre.
--
-- Y cubre las DOS formas. La vista de operaciones une el intento por PERIODO, y
-- una subida de plan no tiene periodo: si el barrido mirara solo esa vista, un
-- cobro de subida en duda no avisaría a nadie.
create or replace function public.billing_scan_uncertain_charges()
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_fila record;
  v_nuevos integer := 0;
  v_vistos integer := 0;
  v_tipo text;
  v_r jsonb;
begin
  for v_fila in
    select i.id as intent_id, i.organization_id, i.billing_subscription_id,
           i.period_id, i.subscription_change_id, i.failure_class, i.status,
           i.provider, i.provider_submitted_at, i.created_at, i.updated_at
      from public.billing_checkout_intents i
     where i.failure_class in ('provider_unknown', 'integrity_mismatch')
        or (i.status = 'manual_review'
            and coalesce(i.failure_reason, '') in ('PROVIDER_UNKNOWN',
                                                   'PROVIDER_NOT_AVAILABLE',
                                                   'PAYMENT_RECONCILIATION_MISMATCH'))
     order by i.created_at
  loop
    v_vistos := v_vistos + 1;

    v_tipo := case
      when v_fila.subscription_change_id is not null then 'upgrade_provider_unknown'
      when v_fila.failure_class = 'integrity_mismatch' then 'renewal_integrity_mismatch'
      when v_fila.failure_class = 'provider_unknown' then 'renewal_provider_unknown'
      else 'manual_review_required' end;

    -- La identidad del hecho: el intento y su clase. Si el mismo intento cambia
    -- de clase, es un hecho distinto y merece su aviso.
    v_r := public.billing_raise_operations_alert(
      v_tipo,
      'intent:' || v_fila.intent_id::text || ':' || coalesce(v_fila.failure_class, v_fila.status),
      v_fila.failure_class,
      v_fila.organization_id, v_fila.billing_subscription_id, v_fila.period_id,
      v_fila.intent_id, v_fila.subscription_change_id,
      jsonb_build_object(
        'provider', v_fila.provider,
        'attempt_status', v_fila.status,
        'provider_submitted_at', v_fila.provider_submitted_at,
        'observed_at', now(),
        'kind', case when v_fila.subscription_change_id is not null then 'upgrade'
                     when v_fila.period_id is not null then 'renewal'
                     else 'checkout' end));

    if v_r->>'status' = 'raised' then v_nuevos := v_nuevos + 1; end if;
  end loop;

  return jsonb_build_object('scanned', v_vistos, 'raised', v_nuevos);
end;
$$;

revoke all on function public.billing_scan_uncertain_charges() from public, anon, authenticated;
grant execute on function public.billing_scan_uncertain_charges() to service_role;

comment on function public.billing_scan_uncertain_charges() is
  'PE-06C2 · Recorre los intentos con incertidumbre y levanta su aviso. Lee la verdad que ya existe —clases de fallo de 0177 y la marca de 0181— y cubre tambien las subidas de plan, que no tienen periodo y por eso no salen en la vista de renovaciones.';

-- ---------------------------------------------------------------------------
-- 4 · LA ENTREGA, QUE NO TOCA NADA FINANCIERO
-- ---------------------------------------------------------------------------
create or replace function public.billing_mark_alert_delivery(
  p_alert_id uuid,
  p_ok boolean,
  p_error text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare v_a public.billing_operations_alerts%rowtype;
begin
  select * into v_a from public.billing_operations_alerts
   where id = p_alert_id for update;
  if not found then
    return jsonb_build_object('status', 'alert_not_found');
  end if;
  if v_a.status = 'sent' then
    return jsonb_build_object('status', 'already_sent');
  end if;

  update public.billing_operations_alerts
     set status = case when p_ok then 'sent' else 'failed' end,
         delivered_at = case when p_ok then now() end,
         delivery_attempts = delivery_attempts + 1,
         last_attempt_at = now(),
         last_error = case when p_ok then null else left(coalesce(p_error, ''), 400) end,
         updated_at = now()
   where id = v_a.id;

  return jsonb_build_object('status', case when p_ok then 'sent' else 'failed' end,
                            'alert_id', v_a.id);
end;
$$;

revoke all on function public.billing_mark_alert_delivery(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.billing_mark_alert_delivery(uuid, boolean, text) to service_role;

comment on function public.billing_mark_alert_delivery(uuid, boolean, text) is
  'PE-06C2 · Anota si el aviso salio o no. NO toca suscripciones, periodos, cobros ni clases de fallo: que no se pueda avisar no cambia lo que paso con el dinero.';

-- ---------------------------------------------------------------------------
-- 5 · Y SE VE DESDE LA CONSOLA
-- ---------------------------------------------------------------------------
create or replace view public.v_billing_operations_alerts as
  select a.id, a.alert_type, a.failure_class, a.status,
         a.organization_id, o.name as organization_name,
         a.subscription_id, a.period_id, a.intent_id, a.subscription_change_id,
         a.detail, a.delivery_attempts, a.last_attempt_at, a.delivered_at,
         a.last_error, a.created_at
    from public.billing_operations_alerts a
    left join public.organizations o on o.id = a.organization_id
   where public.is_platform_staff();

revoke all on public.v_billing_operations_alerts from anon;
grant select on public.v_billing_operations_alerts to authenticated;

comment on view public.v_billing_operations_alerts is
  'PE-06C2 · Los avisos de operacion para la administracion de plataforma. El filtro de plataforma vive en la propia vista, igual que en v_platform_organizations.';
