-- =============================================================================
-- Trazaloop · MP-REC-01C.1 · Cancelar una recurrencia no es perder lo pagado
-- =============================================================================
--
-- QUÉ SIGNIFICA CANCELAR
--
-- Que la pasarela deje de cobrar. Nada más.
--
-- No se retira el acceso que ya está pagado, no se borra el pago, no se borra
-- el periodo y no se borra la historia con el proveedor. Alguien que canceló el
-- día 2 habiendo pagado hasta el 16 tiene derecho a esos catorce días: los
-- compró.
--
-- Es la misma regla que PROD-LAUNCH-01C.4 dejó escrita para el carril manual
-- —vencer una prueba no es perder la información— aplicada ahora al dinero.
--
--
-- LOS DOS FINALES, Y POR QUÉ NO SON EL MISMO
--
--   · Queda periodo pagado vigente → `cancel_at_period_end`. La pasarela ya no
--     cobrará, y el acceso sigue hasta que ese periodo termine. El derecho lo
--     gobierna la FECHA PAGADA, no un proceso programado: cuando llegue, la
--     proyección de 0194 deja de alcanzar y se acabó, sin que nadie tenga que
--     despertarse a apagarlo.
--
--   · No queda ninguno → `ended`. No hay nada que conservar.
--
--
-- Y EL TERCER CASO, QUE ES EL PELIGROSO
--
-- Una cancelación AMBIGUA —tiempo agotado, red caída, respuesta que no se pudo
-- leer— NO se da por hecha. Aquí no se toca nada: ni la autorización, ni la
-- suscripción, ni el acceso. Se anota qué pasó y se deja que se reintente.
--
-- La alternativa tentadora era marcar la suscripción como `manual_review`, y
-- sería peor: ese estado no cuenta como vivo, así que `organization_billing_state`
-- devolvería «no hay plan» mientras los módulos siguen abiertos hasta la fecha
-- pagada. Se le diría al cliente que no tiene plan teniéndolo. Ante la duda, no
-- mover nada es más honesto que mover algo en la dirección equivocada.
-- =============================================================================

do $$
begin
  if to_regclass('public.billing_recurring_authorizations') is null then
    raise exception '0209 presupone la autorizacion de 0204';
  end if;
end $$;

create or replace function public.billing_cancel_recurring(
  p_authorization_id uuid,
  p_outcome          text,
  p_provider_status  text default null,
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
  v_a       public.billing_recurring_authorizations%rowtype;
  v_vigente boolean;
  v_fin     timestamptz;
begin
  if p_outcome not in ('cancelled', 'refused', 'uncertain') then
    raise exception 'CANCEL_OUTCOME_INVALID' using detail = coalesce(p_outcome, '(nulo)');
  end if;

  select * into v_a from public.billing_recurring_authorizations
   where id = p_authorization_id for update;
  if not found then raise exception 'AUTHORIZATION_NOT_FOUND'; end if;

  -- ¿Queda tiempo comprado? Es lo único que decide entre los dos finales, y se
  -- pregunta a los PERIODOS, que son quienes lo saben.
  select max(period_end) into v_fin
    from public.billing_subscription_periods
   where subscription_id = v_a.subscription_id and status = 'settled';
  v_vigente := v_fin is not null and v_fin > now();

  -- --- AMBIGUA · no se toca nada ------------------------------------------
  if p_outcome = 'uncertain' then
    update public.billing_recurring_authorizations
       set last_provider_failure = coalesce(p_failure, last_provider_failure),
           last_provider_diagnostic = coalesce(p_diagnostic, last_provider_diagnostic),
           provider_status = coalesce(p_provider_status, provider_status),
           last_reconciled_at = now()
     where id = p_authorization_id;
    return jsonb_build_object('outcome', 'uncertain',
      'authorization_id', v_a.id, 'subscription_id', v_a.subscription_id,
      'paid_through', v_fin, 'access_preserved', true);
  end if;

  -- --- RECHAZO DEFINITIVO · tampoco se toca el acceso ----------------------
  --
  -- La pasarela dijo que no pudo cancelar. Decir que sí sería mentir, y quitar
  -- acceso sería castigar al cliente por un fallo que no es suyo.
  if p_outcome = 'refused' then
    update public.billing_recurring_authorizations
       set last_provider_failure = coalesce(p_failure, last_provider_failure),
           last_provider_diagnostic = coalesce(p_diagnostic, last_provider_diagnostic),
           provider_status = coalesce(p_provider_status, provider_status),
           last_reconciled_at = now()
     where id = p_authorization_id;
    return jsonb_build_object('outcome', 'refused',
      'authorization_id', v_a.id, 'subscription_id', v_a.subscription_id,
      'paid_through', v_fin, 'access_preserved', true);
  end if;

  -- --- CANCELADA ----------------------------------------------------------
  --
  -- Idempotente: si ya estaba cancelada, se responde lo mismo que la primera
  -- vez. Cancelar dos veces no es un error, es un doble clic.
  update public.billing_recurring_authorizations
     set status = 'cancelled',
         cancelled_at = coalesce(cancelled_at, now()),
         provider_status = coalesce(p_provider_status, provider_status),
         last_reconciled_at = now()
   where id = p_authorization_id;

  update public.billing_subscriptions s
     set status = case when v_vigente then 'cancel_at_period_end' else 'ended' end,
         cancel_at_period_end = v_vigente,
         cancelled_at = coalesce(s.cancelled_at, now()),
         updated_at = now()
   where s.id = v_a.subscription_id
     and s.renewal_mode = 'provider'
     -- Solo desde estados vivos. Una `ended` no vuelve atrás.
     and s.status in ('pending', 'active', 'past_due', 'cancel_at_period_end');

  return jsonb_build_object('outcome', 'cancelled',
    'authorization_id', v_a.id, 'subscription_id', v_a.subscription_id,
    'canonical_status', case when v_vigente then 'cancel_at_period_end' else 'ended' end,
    'paid_through', v_fin, 'access_preserved', v_vigente);
end;
$$;

revoke all on function public.billing_cancel_recurring(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.billing_cancel_recurring(uuid, text, text, text, text)
  to service_role;

comment on function public.billing_cancel_recurring(uuid, text, text, text, text) is
  'MP-REC-01C.1 · Cancela una recurrencia. Con tiempo pagado vigente deja «cancel_at_period_end» y NO retira acceso; sin el, «ended». Un resultado ambiguo o rechazado no toca nada: ante la duda no se mueve el acceso. Idempotente.';

-- -----------------------------------------------------------------------------
-- Y la puerta de 0202 sigue donde estaba
-- -----------------------------------------------------------------------------
do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_n <> 9 then
    raise exception '0209_SUPERFICIE_PUBLICA_CAMBIO: % funciones', v_n;
  end if;

  raise notice '0209 · cancelar deja de cobrar, y no quita lo que ya se pago';
end $$;
