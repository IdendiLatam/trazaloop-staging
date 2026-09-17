-- =============================================================================
-- Trazaloop · MP-REC-01C · Un ciclo pagado convierte la recurrencia en activa
-- =============================================================================
--
-- EL DEFECTO QUE ESTO CIERRA
--
-- El primer cobro recurrente real de Staging se reconoció entero —un pago, un
-- periodo saldado, el módulo abierto hasta el fin de ese periodo— y la
-- suscripción se quedó en `pending`.
--
-- No es casual. En el carril manual la suscripción NACE `active`, porque allí
-- se crea al reconocer el dinero; `billing_settle_period_payment` nunca tuvo
-- que promover a nadie. El carril recurrente rompe esa coincidencia: crea la
-- suscripción antes de hablar con la pasarela, en `pending`, y nadie la movía
-- después.
--
-- El derecho no se vio afectado —0206 hace que el plan efectivo dependa del
-- periodo pagado y no del estado— pero una suscripción con un mes cobrado y
-- entregado no puede seguir diciendo «pendiente». Es una fila que miente, y las
-- filas que mienten acaban decidiendo algo.
--
--
-- POR QUÉ UN DISPARADOR, Y NO UNA LÍNEA EN LA LIQUIDACIÓN
--
-- Es la misma razón que dejó escrita 0194 para la proyección de módulos: hay
-- varios caminos que saldan un periodo —la conciliación del proveedor, la
-- renovación, una corrección administrativa— y añadir una línea a cada uno es
-- exactamente cómo se llega a que el siguiente se olvide.
--
-- Con el disparador, la promoción ocurre en la MISMA TRANSACCIÓN en la que el
-- periodo pasa a `settled`. No puede quedar un mes cobrado con la suscripción
-- diciendo que espera.
--
--
-- LO QUE NO HACE
--
-- No promueve por AUTORIZAR. Autorizar no es pagar: Mercado Pago cobra alrededor
-- de una hora después, y `mapping.ts` traduce su `authorized` a `pending` por
-- eso mismo. Aquí hace falta un periodo `settled`, que solo existe cuando hay
-- un cobro aprobado detrás.
--
-- No toca el carril manual: solo mira filas con `renewal_mode = 'provider'`.
--
-- No mueve a nadie que ya haya avanzado. Solo `pending` → `active`. Una
-- suscripción `cancel_at_period_end` que cobra su último ciclo NO vuelve a
-- `active`: cancelar es una decisión del cliente y un cobro no la revoca.
-- =============================================================================

do $$
begin
  if to_regclass('public.billing_subscription_periods') is null then
    raise exception '0208 presupone los periodos de 0172';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public'
                    and table_name = 'billing_subscriptions'
                    and column_name = 'renewal_mode') then
    raise exception '0208 presupone renewal_mode de 0190';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1 · La promoción
-- -----------------------------------------------------------------------------
create or replace function public.billing_promote_recurring_on_settle()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status is distinct from 'settled' then
    return new;
  end if;

  update public.billing_subscriptions s
     set status = 'active', updated_at = now()
   where s.id = new.subscription_id
     and s.renewal_mode = 'provider'
     -- SOLO desde `pending`. Cualquier otro estado ya es una decisión tomada
     -- —cancelada, terminada, en revisión— y un cobro no la deshace.
     and s.status = 'pending';

  return new;
end;
$$;

drop trigger if exists t_promote_recurring_on_settle
  on public.billing_subscription_periods;
create trigger t_promote_recurring_on_settle
  after insert or update on public.billing_subscription_periods
  for each row execute function public.billing_promote_recurring_on_settle();

comment on function public.billing_promote_recurring_on_settle() is
  'MP-REC-01C · Un periodo saldado convierte una recurrencia «pending» en «active», en la MISMA transaccion. Solo renewal_mode = provider, solo desde pending, y nunca por autorizar: hace falta un ciclo pagado.';

-- -----------------------------------------------------------------------------
-- 2 · Y se repara lo que ya quedó mal
-- -----------------------------------------------------------------------------
--
-- El disparador solo actúa sobre hechos nuevos. La suscripción de Staging ya
-- tiene su periodo saldado y se quedó atrás, así que se aplica la MISMA regla
-- una vez sobre lo existente.
--
-- Acotado a lo que la regla admite: recurrencia por pasarela, en `pending`, y
-- con al menos un periodo `settled`. En Producción no hay ninguna fila así
-- —la recurrencia está apagada— así que allí es literalmente nada.
do $$
declare v_n integer;
begin
  with promovidas as (
    update public.billing_subscriptions s
       set status = 'active', updated_at = now()
     where s.renewal_mode = 'provider'
       and s.status = 'pending'
       and exists (select 1 from public.billing_subscription_periods p
                    where p.subscription_id = s.id and p.status = 'settled')
    returning 1)
  select count(*) into v_n from promovidas;
  raise notice '0208 · recurrencias promovidas por un ciclo ya pagado: %', v_n;
end $$;

-- -----------------------------------------------------------------------------
-- 3 · Y la puerta de 0202 sigue donde estaba
-- -----------------------------------------------------------------------------
do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_n <> 9 then
    raise exception '0208_SUPERFICIE_PUBLICA_CAMBIO: % funciones', v_n;
  end if;

  raise notice '0208 · un mes cobrado y entregado deja de decir «pendiente»';
end $$;
