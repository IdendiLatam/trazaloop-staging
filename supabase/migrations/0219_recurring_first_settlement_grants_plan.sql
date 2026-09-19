-- ===========================================================================
-- Trazaloop · 0219 · MP-REC-02A
-- Cobrar el primer ciclo tiene que CONCEDER el plan que se cobró.
--
--
-- EL DEFECTO, Y CÓMO APARECIÓ
--
-- Lo encontró BILLING-EXTRA-01C con dos empresas reales en Sandbox: se autorizó
-- una preapproval de Mercado Pago, el proveedor cobró el primer ciclo de
-- verdad, la conciliación lo saldó y la suscripción pasó a `active`…
--
--   …y `organization_plan_assignments` no tenía ni una concesión `sold`.
--
-- Las dos empresas seguían viendo Full únicamente porque todavía les duraba la
-- prueba de 48 horas. Al caducar habrían quedado pagando Full todos los meses
-- con derechos de Free. Nadie lo habría notado hasta la primera queja.
--
--
-- POR QUÉ FALTABA
--
-- Porque el derecho SIEMPRE lo había concedido la contratación inicial:
-- `billing_settle_payment` —y `billing_settle_provider_payment`, que delega en
-- ella— recorre los módulos de la empresa y llama a
-- `commercial_apply_assignment`. En el carril recurrente no hay contratación
-- inicial que liquidar: la suscripción nace `pending` y es el PRIMER COBRO DEL
-- PROVEEDOR el que la convierte en real.
--
-- `billing_promote_recurring_on_settle` ya detectaba exactamente ese instante
-- —de `pending` a `active`— y lo único que hacía era cambiar el estado. El
-- derecho se quedó sin dueño en medio de los dos carriles.
--
--
-- POR QUÉ AQUÍ Y NO MÁS ARRIBA
--
-- Éste es el punto más BAJO donde el hecho ocurre: un disparador sobre los
-- periodos, en la MISMA transacción que los salda. No depende de que el
-- navegador vuelva, ni de que llegue un aviso, ni de que alguien ejecute un
-- barrido. Y ocurre UNA vez, porque una suscripción sale de `pending` una sola
-- vez: eso es lo que hace que reconciliar el mismo ciclo veinte veces no
-- conceda veinte derechos.
--
-- Ponerlo en el conciliador habría sido lógica de derechos en una ruta; ponerlo
-- en `billing_settle_period_payment` habría obligado a inventar ahí un concepto
-- de «primera vez» que aquí ya existe.
--
--
-- NO HAY UNA SEGUNDA IMPLEMENTACIÓN
--
-- Se usa la MISMA primitiva y la misma forma que la contratación inicial:
-- mismos módulos, misma clase `sold`, mismo origen `checkout`, mismo
-- `ends_at` nulo. La revisión es la CONGELADA en la suscripción, no la del
-- catálogo de hoy.
--
-- Lo que NO se toca: el proveedor, la recurrencia, el checkout manual, el
-- carril de Wompi —que concede por `billing_settle_payment` y nunca tuvo este
-- agujero—, la cancelación al final del periodo, ni la caducidad del derecho,
-- que sigue siendo cosa de `commercial_end_paid_assignments`.
--
--
-- PRODUCCIÓN. Aditiva y sin reparar nada hacia atrás: ni una fila existente se
-- reescribe. La recurrencia del proveedor está cerrada en Producción, así que
-- allí este camino todavía no se recorre.
-- ===========================================================================

do $$
begin
  if to_regprocedure('public.billing_promote_recurring_on_settle()') is null then
    raise exception '0219 presupone billing_promote_recurring_on_settle de 0208';
  end if;
  if to_regprocedure('public.commercial_apply_assignment('
       || 'uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,uuid)') is null then
    raise exception '0219 presupone commercial_apply_assignment de 0169';
  end if;
end $$;

create or replace function public.billing_promote_recurring_on_settle()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_promovidas integer := 0;
  v_sub        public.billing_subscriptions%rowtype;
  v_mod        record;
  v_rev        text;
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

  -- ¿HA PASADO DE VERDAD?
  --
  -- Aquí está la diferencia entre conceder una vez y conceder en cada
  -- renovación. Si la fila no cambió, este cobro es un ciclo más de algo que ya
  -- estaba activo: el derecho ya está puesto y no se vuelve a poner.
  get diagnostics v_promovidas = row_count;
  if v_promovidas = 0 then
    return new;
  end if;

  select * into v_sub from public.billing_subscriptions
   where id = new.subscription_id;
  if not found or v_sub.plan_revision_id is null then
    -- Sin revisión congelada no se concede nada: inventarla desde el catálogo
    -- de hoy sería darle a alguien un plan que no compró.
    return new;
  end if;

  select r.plan_code into v_rev from public.plan_revisions r
   where r.id = v_sub.plan_revision_id;

  -- MP-REC-02A · Y el derecho, con la misma forma que la contratación inicial.
  for v_mod in
    select om.module_code from public.organization_modules om
      join public.modules m on m.code = om.module_code
     where om.organization_id = v_sub.organization_id
       and om.enabled and coalesce(m.is_functional, false)
  loop
    perform public.commercial_apply_assignment(
      v_sub.organization_id, v_sub.plan_revision_id, 'module', v_mod.module_code,
      'sold', 'checkout', now(), null,
      'Plan ' || coalesce(v_rev, 'contratado')
        || ' activado por el primer cobro de la suscripción recurrente.', null);
  end loop;

  return new;
end;
$$;

comment on function public.billing_promote_recurring_on_settle() is
  'MP-REC-02A · Un periodo saldado convierte una recurrencia «pending» en '
  '«active» Y CONCEDE EL PLAN PAGADO, en la misma transaccion. Solo '
  'renewal_mode = provider, solo desde pending —asi el derecho se concede una '
  'vez y no en cada renovacion— y con la revision CONGELADA en la suscripcion. '
  'Antes solo cambiaba el estado, y una empresa podia quedarse pagando Full con '
  'derechos de Free en cuanto caducara su prueba.';
