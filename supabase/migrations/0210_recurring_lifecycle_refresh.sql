-- =============================================================================
-- Trazaloop · MP-REC-01C.3 · Poner al día una fila, sin que el derecho dependa
-- =============================================================================
--
-- QUÉ ES ESTO, Y QUÉ NO ES
--
-- Limpieza de estado. Una suscripción cancelada cuyo periodo pagado ya venció
-- debería decir `ended`, y una que se pasó de su fecha sin renovación aprobada
-- debería decir `past_due`. Hoy se quedan como estaban hasta que algo las mire.
--
-- Lo que NO es: autoridad de acceso. El derecho sale de la fecha del último
-- periodo pagado a través de la proyección de 0194, y eso ya funciona sin que
-- nadie despierte. Si este refresco no corre en un mes, nadie tiene acceso de
-- más ni de menos: solo habrá filas que tardan en ponerse al día.
--
-- Esa separación es deliberada y es la que permite que no haya un proceso
-- programado del que dependa cobrar o dejar de cobrar acceso. MP-REC-01C.2 lo
-- dejó probado: la misma asignación decide distinto solo porque cambió el
-- reloj.
--
--
-- LAS DOS TRANSICIONES, Y SUS GUARDAS
--
--   cancel_at_period_end → ended
--     solo si NO queda periodo pagado vigente. Con tiempo por delante, la
--     suscripción sigue siendo lo que es: cancelada al borde.
--
--   active → past_due
--     solo si se pasó la fecha pagada y no hay renovación aprobada. No retira
--     nada: el acceso ya se acabó solo, por la fecha.
--
-- Ninguna borra un pago, un periodo ni una autorización. Y ninguna toca el
-- carril manual: `renewal_mode = 'provider'`, siempre.
-- =============================================================================

do $$
begin
  if to_regclass('public.billing_recurring_authorizations') is null then
    raise exception '0210 presupone la autorizacion de 0204';
  end if;
end $$;

create or replace function public.billing_refresh_recurring_lifecycle(
  p_subscription_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_s       public.billing_subscriptions%rowtype;
  v_fin     timestamptz;
  v_vigente boolean;
  v_viva    boolean;
begin
  select * into v_s from public.billing_subscriptions
   where id = p_subscription_id for update;
  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;

  if v_s.renewal_mode is distinct from 'provider' then
    return jsonb_build_object('outcome', 'not_provider_renewal');
  end if;

  select max(period_end) into v_fin
    from public.billing_subscription_periods
   where subscription_id = v_s.id and status = 'settled';
  v_vigente := v_fin is not null and v_fin > now();

  select exists (
    select 1 from public.billing_recurring_authorizations
     where subscription_id = v_s.id
       and status in ('awaiting_authorization', 'authorized', 'uncertain'))
    into v_viva;

  -- --- cancel_at_period_end → ended ---------------------------------------
  if v_s.status = 'cancel_at_period_end' and not v_vigente then
    update public.billing_subscriptions
       set status = 'ended', updated_at = now()
     where id = v_s.id;
    return jsonb_build_object('outcome', 'ended',
      'subscription_id', v_s.id, 'paid_through', v_fin);
  end if;

  -- --- active → past_due ---------------------------------------------------
  --
  -- Solo con la recurrencia todavía VIVA en el proveedor: si ya está cancelada,
  -- no hay renovación que esperar y `past_due` sería describir mal la
  -- situación. Esa rama cae en la de arriba.
  if v_s.status = 'active' and not v_vigente and v_viva then
    update public.billing_subscriptions
       set status = 'past_due', updated_at = now()
     where id = v_s.id;
    return jsonb_build_object('outcome', 'past_due',
      'subscription_id', v_s.id, 'paid_through', v_fin);
  end if;

  return jsonb_build_object('outcome', 'unchanged',
    'subscription_id', v_s.id, 'status', v_s.status, 'paid_through', v_fin);
end;
$$;

revoke all on function public.billing_refresh_recurring_lifecycle(uuid)
  from public, anon, authenticated;
grant execute on function public.billing_refresh_recurring_lifecycle(uuid)
  to service_role;

comment on function public.billing_refresh_recurring_lifecycle(uuid) is
  'MP-REC-01C.3 · Pone al dia el estado canonico de una recurrencia: cancel_at_period_end sin tiempo pagado pasa a ended, y active vencida con recurrencia viva pasa a past_due. NO gobierna el acceso —eso lo hace la fecha del periodo pagado— y no borra nada.';

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
    raise exception '0210_SUPERFICIE_PUBLICA_CAMBIO: % funciones', v_n;
  end if;

  raise notice '0210 · poner al dia una fila no es decidir quien entra';
end $$;
