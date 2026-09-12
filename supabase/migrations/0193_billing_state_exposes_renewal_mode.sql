-- ===========================================================================
-- Trazaloop · PROD-LAUNCH-01B.9 · La pantalla necesita saber QUIÉN renueva
-- ===========================================================================
--
-- EL DEFECTO
--
-- Tras el primer pago único, la ficha del plan decía «Siguiente cobro: 12 de
-- octubre de 2026» y ofrecía «Cancelar el plan». Las dos cosas son falsas con
-- `renewal_mode = manual`: no hay cobro programado que llegue solo, y no hay
-- recurrencia que cancelar. El plan simplemente vence.
--
-- Prometer un cobro que no va a ocurrir es peor que no decir nada: quien lo
-- lee se despreocupa, y el día del vencimiento se queda sin plan creyendo que
-- había pagado.
--
-- `renewal_mode` existe desde 0190 pero no salía de la base, así que la
-- pantalla no podía distinguir «vence» de «se cobra». Aquí se expone. La
-- función no cambia en nada más: mismo cuerpo, mismas comprobaciones, un campo
-- más en el objeto que devuelve.
--
-- PRODUCCIÓN. Aditiva: un campo nuevo en una respuesta. Ni una fila cambia, y
-- quien no lo lea sigue viendo exactamente lo de antes.
-- ===========================================================================

do $$
begin
  if to_regprocedure('public.organization_billing_state(uuid)') is null then
    raise exception '0193 presupone organization_billing_state';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='billing_subscriptions'
                    and column_name='renewal_mode') then
    raise exception '0193 presupone renewal_mode de 0190';
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.organization_billing_state(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s public.billing_subscriptions%rowtype;
  v_p public.billing_payments%rowtype;
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
    -- Sin suscripción NO se dice «pago fallido» ni «plan cancelado»: es que no
    -- hay ninguna, que es el estado normal de una empresa en Free.
    return jsonb_build_object('has_subscription', false,
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
    -- 0193 · QUIÉN renueva. Sin esto la pantalla no puede distinguir «vence»
    -- de «se cobra», y con pago único acaba prometiendo un cobro que no
    -- existe.
    'renewal_mode', v_s.renewal_mode,
    'cancel_at_period_end', v_s.cancel_at_period_end,
    'grace_until', v_s.grace_until,
    'last_payment_status', v_p.status,
    'last_payment_at', v_p.paid_at);
end;
$function$;

revoke all on function public.organization_billing_state(uuid) from public, anon;
grant execute on function public.organization_billing_state(uuid) to authenticated, service_role;
