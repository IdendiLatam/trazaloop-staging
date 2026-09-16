-- =============================================================================
-- Trazaloop · MP-REC-01B.6 · Una contratación intentada no es un plan pagado
-- =============================================================================
--
-- EL DEFECTO QUE ESTO CIERRA, Y CÓMO SE DESCUBRIÓ
--
-- El primer clic humano real en Staging falló: Mercado Pago rechazó la
-- preapproval y no se creó nada en la pasarela. Pero la empresa pasó de
--
--     «La empresa está en el plan de entrada. No hay ningún cobro programado.»
--
-- a
--
--     «Plan Full · Facturación Mensual · Estado: Todo en orden»
--
-- sin haber pagado un peso y sin que existiera preapproval.
--
-- La causa es que `organization_billing_state` elige CUALQUIER suscripción viva
-- —incluida `pending`— y devuelve su plan. Hasta hoy eso era correcto por
-- accidente: todas las suscripciones nacían `active`, porque en el carril
-- manual la suscripción nace cuando se reconoce un pago. El carril recurrente
-- rompe esa coincidencia: crea la suscripción ANTES de hablar con la pasarela,
-- porque 0186 la necesita para saldar el primer cobro.
--
-- Es la misma forma de fallo de las «dos verdades» que 0163 cerró para el plan
-- y 0194 para los módulos: una pantalla leyendo una tabla que no es la
-- autoridad. Aquí se cierra para el ESTADO DE FACTURACIÓN.
--
-- LA INVARIANTE
--
--     intención de contratación  ≠  derecho pagado efectivo
--
-- Una suscripción `pending` sin periodo pagado NO es un plan. Se informa de que
-- hay una autorización en preparación —eso es verdad y hace falta— pero jamás
-- como plan activo.
--
--
-- Y LOS TRES FINALES DE UN INTENTO
--
-- Crear una preapproval termina de tres maneras, y confundirlas cuesta dinero:
--
--   A · el proveedor la creó      → se espera al comprador
--   B · el proveedor la RECHAZÓ   → no existe recurso; hay que cerrar el intento
--   C · no sabemos qué pasó       → timeout; el recurso PUEDE existir
--
-- B mal resuelto deja a la empresa con una suscripción viva que bloquea el
-- carril manual por algo que la pasarela nunca creó. C mal resuelto —dándolo
-- por fallido— acaba con DOS preapprovals cobrando a la vez.
-- =============================================================================

do $$
begin
  if to_regclass('public.billing_recurring_authorizations') is null then
    raise exception '0206 presupone la autorizacion de 0204';
  end if;
  if to_regprocedure('public.organization_billing_state(uuid)') is null then
    raise exception '0206 presupone organization_billing_state';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1 · El estado INCIERTO, y el diagnóstico de la pasarela
-- -----------------------------------------------------------------------------
--
-- `uncertain` es el estado del caso C. Cuenta como VIVO —entra en el índice
-- parcial— justamente para que no se pueda abrir una segunda autorización
-- mientras no se sepa si la primera creó un recurso en la pasarela. Bloquear es
-- la respuesta correcta a la duda: un segundo intento tras un timeout es cómo
-- se acaba cobrando dos veces.
alter table public.billing_recurring_authorizations
  drop constraint if exists bra_status_check;
alter table public.billing_recurring_authorizations
  add constraint bra_status_check check (status in
    ('awaiting_authorization', 'authorized', 'uncertain', 'cancelled', 'ended'));

drop index if exists bra_one_live_per_subscription;
create unique index if not exists bra_one_live_per_subscription
  on public.billing_recurring_authorizations (subscription_id)
  where status in ('awaiting_authorization', 'authorized', 'uncertain');

drop index if exists bra_sweep_idx;
create index if not exists bra_sweep_idx
  on public.billing_recurring_authorizations (status, last_reconciled_at nulls first)
  where status in ('awaiting_authorization', 'authorized', 'uncertain');

-- El diagnóstico del proveedor, SANEADO. Lo produce `diagnostico()` en el
-- adaptador, que ya recorta a 700 caracteres y descarta cualquier fragmento con
-- arroba. Nunca lleva credenciales: el adaptador no las pone en el error, y
-- aquí no se guarda ninguna cabecera.
--
-- Se guarda porque sin esto un rechazo de la pasarela es un mensaje que se ve
-- una vez en una pantalla y se pierde. Ese fue exactamente el problema del
-- primer intento real.
alter table public.billing_recurring_authorizations
  add column if not exists last_provider_diagnostic text;
alter table public.billing_recurring_authorizations
  add column if not exists last_provider_failure text;

comment on column public.billing_recurring_authorizations.last_provider_diagnostic is
  'MP-REC-01B.6 · El rechazo de la pasarela, SANEADO por el adaptador: nombre, http, mensaje y causas, sin credenciales y sin nada que lleve arroba. Existe porque un error que solo se ve en pantalla se pierde.';

-- -----------------------------------------------------------------------------
-- 2 · Cerrar un intento, según cómo terminó
-- -----------------------------------------------------------------------------
create or replace function public.billing_close_recurring_attempt(
  p_authorization_id uuid,
  p_outcome          text,
  p_failure          text default null,
  p_diagnostic       text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_a public.billing_recurring_authorizations%rowtype;
  v_pagados integer;
begin
  if p_outcome not in ('refused', 'uncertain') then
    raise exception 'ATTEMPT_OUTCOME_INVALID' using detail = coalesce(p_outcome, '(nulo)');
  end if;

  select * into v_a from public.billing_recurring_authorizations
   where id = p_authorization_id for update;
  if not found then raise exception 'AUTHORIZATION_NOT_FOUND'; end if;

  -- NUNCA se cierra un intento que ya tiene recurso en la pasarela. Si la
  -- preapproval existe, esto no es un intento fallido: es una suscripción viva
  -- y cerrarla aquí la dejaría cobrando sin que nadie la concilie.
  if v_a.provider_subscription_id not like 'pending:%' then
    return jsonb_build_object('outcome', 'has_provider_resource',
      'authorization_id', v_a.id,
      'provider_subscription_id', v_a.provider_subscription_id);
  end if;

  -- Ni uno que ya produjo dinero. Es imposible por construcción —sin
  -- preapproval no hay cobro— y se comprueba igual: el día que deje de ser
  -- imposible, esto tiene que negarse en vez de borrar historia.
  select count(*) into v_pagados from public.billing_subscription_periods
   where subscription_id = v_a.subscription_id and status = 'settled';
  if v_pagados > 0 then
    return jsonb_build_object('outcome', 'has_settled_period',
      'authorization_id', v_a.id, 'settled_periods', v_pagados);
  end if;

  if p_outcome = 'uncertain' then
    -- CASO C. La fila se queda VIVA a propósito: mientras no se relea a la
    -- pasarela, abrir otra sería arriesgarse a dos preapprovals.
    update public.billing_recurring_authorizations
       set status = 'uncertain',
           last_provider_failure = coalesce(p_failure, last_provider_failure),
           last_provider_diagnostic = coalesce(p_diagnostic, last_provider_diagnostic)
     where id = p_authorization_id;
    return jsonb_build_object('outcome', 'held_uncertain',
      'authorization_id', v_a.id, 'subscription_id', v_a.subscription_id);
  end if;

  -- CASO B · rechazo definitivo. La pasarela dijo que no y no creó nada.
  --
  -- La autorización se CIERRA, no se borra: que se intentó y por qué falló es
  -- auditoría. Y la suscripción deja de estar viva, que es lo que libera el
  -- carril manual: `billing_subscriptions_one_live` no puede quedar ocupado por
  -- una contratación que la pasarela nunca llegó a crear.
  update public.billing_recurring_authorizations
     set status = 'ended',
         last_provider_failure = coalesce(p_failure, last_provider_failure),
         last_provider_diagnostic = coalesce(p_diagnostic, last_provider_diagnostic)
   where id = p_authorization_id;

  update public.billing_subscriptions
     set status = 'ended', updated_at = now()
   where id = v_a.subscription_id
     and status = 'pending'
     and renewal_mode = 'provider';

  return jsonb_build_object('outcome', 'closed_refused',
    'authorization_id', v_a.id, 'subscription_id', v_a.subscription_id);
end;
$$;

revoke all on function public.billing_close_recurring_attempt(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.billing_close_recurring_attempt(uuid, text, text, text)
  to service_role;

comment on function public.billing_close_recurring_attempt(uuid, text, text, text) is
  'MP-REC-01B.6 · Cierra un intento de recurrencia. «refused» cierra autorizacion y suscripcion y libera el carril manual; «uncertain» la deja VIVA para impedir una segunda preapproval hasta reconciliar. Nunca cierra un intento con recurso en la pasarela ni con periodo pagado.';

-- -----------------------------------------------------------------------------
-- 3 · El estado de facturación deja de confundir intención con plan
-- -----------------------------------------------------------------------------
--
-- QUÉ CAMBIA EXACTAMENTE
--
-- Antes: cualquier suscripción viva —incluida `pending`— se devolvía como plan.
-- Ahora: una `pending` SIN periodo pagado se devuelve como «no hay plan, y hay
-- una autorización en preparación».
--
-- El carril manual NO se entera: sus suscripciones nacen `active` en las cinco
-- funciones que las crean (0169, 0172, 0179, 0182, 0192). Ninguna nace
-- `pending`, así que ninguna cambia de respuesta.
CREATE OR REPLACE FUNCTION public.organization_billing_state(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s public.billing_subscriptions%rowtype;
  v_p public.billing_payments%rowtype;
  v_pagados integer := 0;
  v_efectiva boolean;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not (public.is_org_member(p_organization_id) or public.is_platform_staff()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_s from public.billing_subscriptions
   where organization_id = p_organization_id
     and status in ('pending', 'active', 'past_due', 'cancel_at_period_end')
   order by created_at desc limit 1;

  select * into v_p from public.billing_payments
   where organization_id = p_organization_id
   order by created_at desc limit 1;

  if v_s.id is null then
    return jsonb_build_object('has_subscription', false,
                              'last_payment_status', v_p.status);
  end if;

  select count(*) into v_pagados from public.billing_subscription_periods
   where subscription_id = v_s.id and status = 'settled';

  -- LA REGLA. `pending` significa literalmente «todavía no se ha pagado»: es el
  -- estado con el que nace una recurrencia mientras espera la autorización del
  -- comprador y el primer cobro. Sin periodo saldado no hay plan que anunciar.
  v_efectiva := (v_s.status <> 'pending') or (v_pagados > 0);

  if not v_efectiva then
    -- Se dice la verdad entera: no hay plan, y hay algo en preparación. Lo
    -- segundo importa —quien acaba de intentar contratar necesita saber que su
    -- intento existe— pero no se disfraza de plan activo.
    return jsonb_build_object(
      'has_subscription', false,
      'pending_authorization', true,
      'pending_plan_code', v_s.plan_code,
      'pending_billing_interval', v_s.billing_interval,
      'pending_subscription_id', v_s.id,
      'paid_period_count', v_pagados,
      'last_payment_status', v_p.status);
  end if;

  return jsonb_build_object(
    'has_subscription', true,
    'subscription_id', v_s.id,
    'plan_code', v_s.plan_code,
    'billing_interval', v_s.billing_interval,
    'status', v_s.status,
    'base_charge_amount', v_s.base_charge_amount,
    'charge_currency', v_s.charge_currency,
    'current_period_end', v_s.current_period_end,
    'renews_at', v_s.renews_at,
    'renewal_mode', v_s.renewal_mode,
    'cancel_at_period_end', v_s.cancel_at_period_end,
    'grace_until', v_s.grace_until,
    'paid_period_count', v_pagados,
    'pending_authorization', false,
    'last_payment_status', v_p.status,
    'last_payment_at', v_p.paid_at);
end;
$function$;

revoke all on function public.organization_billing_state(uuid) from public, anon;
grant execute on function public.organization_billing_state(uuid) to authenticated, service_role;

comment on function public.organization_billing_state(uuid) is
  'MP-REC-01B.6 · El estado comercial. Una suscripcion «pending» sin periodo pagado NO es un plan: se informa como autorizacion en preparacion. Intencion de contratacion no es derecho pagado.';

-- -----------------------------------------------------------------------------
-- 4 · Y la puerta de 0202 sigue donde estaba
-- -----------------------------------------------------------------------------
do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_n <> 9 then
    raise exception '0206_SUPERFICIE_PUBLICA_CAMBIO: % funciones', v_n;
  end if;

  raise notice '0206 · una contratacion intentada deja de parecer un plan pagado';
end $$;
