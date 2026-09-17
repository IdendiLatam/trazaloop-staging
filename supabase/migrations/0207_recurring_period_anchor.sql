-- =============================================================================
-- Trazaloop · MP-REC-01B.13 · El ancla de una recurrencia es su primer cobro
-- =============================================================================
--
-- EL HECHO
--
-- Con el cobro real ya validado y el puente al intento ya atado, la
-- conciliación devolvió `anchor_missing`. `billing_reconcile_provider_cycle`
-- necesita un ANCLA para saber en qué sitio de la historia cae cada ciclo, y la
-- toma de `billing_subscriptions.period_anchor_at` o del comienzo del periodo 1.
--
-- Una suscripción recurrente no tiene ninguna de las dos cosas cuando nace: se
-- crea `pending`, sin periodo, esperando a que el comprador autorice. Es
-- deliberado —pendiente no concede nada— y deja el ancla sin fijar.
--
--
-- POR QUÉ NO SE FIJA AL CREARLA
--
-- Sería lo cómodo y sería falso. Entre crear la preapproval y el primer cobro
-- pueden pasar días: el comprador autoriza cuando quiere. Si el ancla fuera la
-- fecha de creación, un comprador que autoriza cuarenta días después vería su
-- primer pago caer en el ciclo 2, con un ciclo 1 fantasma que nadie pagó nunca.
--
-- El ancla de una recurrencia es el primer cobro que se le reconoce. Por eso se
-- fija AHÍ, y una sola vez.
--
--
-- LO QUE ESTA FUNCIÓN NO HACE
--
-- No crea periodos, no reconoce pagos y no concede acceso. Solo dice desde
-- cuándo se cuenta. Y se niega a hacerlo si ya hay un ancla, si ya hay
-- periodos, o si la suscripción no es de recurrencia por pasarela: mover el
-- ancla de una historia ya empezada desplazaría meses que alguien pagó.
-- =============================================================================

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public'
                    and table_name = 'billing_subscriptions'
                    and column_name = 'period_anchor_at') then
    raise exception '0207 presupone el ancla de periodos';
  end if;
end $$;

create or replace function public.billing_set_recurring_anchor(
  p_subscription_id uuid,
  p_anchor_at       timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_s public.billing_subscriptions%rowtype;
  v_n integer;
begin
  if p_anchor_at is null then
    raise exception 'ANCHOR_REQUIRED';
  end if;

  select * into v_s from public.billing_subscriptions
   where id = p_subscription_id for update;
  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;

  -- Solo el carril recurrente. El manual ancla al liquidar, y no se toca.
  if v_s.renewal_mode is distinct from 'provider' then
    return jsonb_build_object('outcome', 'not_provider_renewal',
      'subscription_id', v_s.id, 'renewal_mode', v_s.renewal_mode);
  end if;

  if v_s.period_anchor_at is not null then
    return jsonb_build_object('outcome', 'already_anchored',
      'subscription_id', v_s.id, 'period_anchor_at', v_s.period_anchor_at);
  end if;

  -- Con historia detrás, el ancla ya está implícita en el periodo 1 y moverla
  -- desplazaría meses pagados.
  select count(*) into v_n from public.billing_subscription_periods
   where subscription_id = v_s.id;
  if v_n > 0 then
    return jsonb_build_object('outcome', 'has_periods',
      'subscription_id', v_s.id, 'periods', v_n);
  end if;

  update public.billing_subscriptions
     set period_anchor_at = p_anchor_at,
         period_anchor_sequence = 1,
         updated_at = now()
   where id = v_s.id;

  return jsonb_build_object('outcome', 'anchored',
    'subscription_id', v_s.id, 'period_anchor_at', p_anchor_at);
end;
$$;

revoke all on function public.billing_set_recurring_anchor(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.billing_set_recurring_anchor(uuid, timestamptz)
  to service_role;

comment on function public.billing_set_recurring_anchor(uuid, timestamptz) is
  'MP-REC-01B.13 · Fija el ancla de periodos de una recurrencia en su PRIMER cobro reconocido. Una sola vez, solo si no hay ancla ni periodos, y solo para renewal_mode = provider. No crea periodos ni concede acceso.';

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
    raise exception '0207_SUPERFICIE_PUBLICA_CAMBIO: % funciones', v_n;
  end if;

  raise notice '0207 · el ancla de una recurrencia es su primer cobro';
end $$;
