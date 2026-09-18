-- ===========================================================================
-- Trazaloop · 0217 · BILLING-EXTRA-01B.1
-- Devolver el dinero no basta: hay que devolver también la autorización.
--
--
-- LA FRONTERA QUE 0216 DEJÓ ABIERTA
--
-- 0216 cubrió «el cobro salió y la autorización no». Falta la simétrica, que es
-- peor porque es silenciosa:
--
--   el cobro de la diferencia se aprobó,
--   la autorización recurrente YA se cambió a Extra y se verificó,
--   y la liquidación interna falla.
--
-- En ese punto la empresa tiene plan Full por dentro y una autorización que va
-- a cobrarle Extra todos los meses. Devolverle la diferencia y dar la subida
-- por cerrada dejaría exactamente eso: un cobro recurrente de Extra sobre una
-- suscripción Full. Y el barrido, al ver el cambio terminado, volvería a
-- conciliar ciclos que ya no cuadran con nada.
--
-- Compensar una subida a medias son DOS devoluciones, no una: el dinero y el
-- importe recurrente. Esta migración añade la evidencia que permite saber si la
-- segunda hace falta, si se hizo, y contra qué importe.
--
--
-- DE DÓNDE SALE EL IMPORTE ORIGINAL
--
-- De lo OBSERVADO en el proveedor justo antes de tocarlo, guardado aquí y no
-- vuelto a escribir. No del catálogo de hoy: el catálogo dice cuánto vale Full
-- ahora, no cuánto tenía puesto ESTA autorización, que pudo nacer con otro
-- precio, otro impuesto o un descuento.
--
-- Cuando esa observación no exista —una subida antigua, una recuperación sobre
-- algo que nadie llegó a mirar— queda la reconstrucción desde lo CONGELADO en
-- la propia transición: `current_full_base` más su impuesto. Sigue sin ser el
-- catálogo de hoy. Y si ni eso, no se finaliza nada: se queda en compensación.
--
--
-- POR QUÉ NO HAY UN ESTADO NUEVO
--
-- Porque no hace falta. `compensation_required` ya significa «hay algo que
-- devolver y todavía no se ha devuelto»; que ese algo sean dos cosas no cambia
-- el estado, cambia cuándo se puede salir de él. Lo que sí hace falta es que
-- `refunded` deje de ser alcanzable mientras la autorización siga en Extra, y
-- eso es una restricción, no un estado.
--
--
-- PRODUCCIÓN. Aditiva. Ninguna fila existente cambia de significado.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0 · PRECONDICIONES
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.billing_subscription_changes') is null then
    raise exception '0217 presupone billing_subscription_changes de 0181';
  end if;
  if to_regprocedure('public.billing_record_upgrade_refund(uuid,text,bigint,text)') is null then
    raise exception '0217 presupone billing_record_upgrade_refund de 0216';
  end if;
  if to_regprocedure('public.billing_tax_amount(bigint,integer)') is null then
    raise exception '0217 presupone billing_tax_amount de 0169';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1 · UN NOMBRE QUE CONFUNDE, EXPLICADO DONDE CONFUNDE
-- ---------------------------------------------------------------------------
--
-- `target_full_base` NO es la base de Full. Es la base del periodo COMPLETO del
-- plan DESTINO: en una subida Full → Extra vale la de Extra (400 000 COP
-- mensuales con el catálogo de hoy), frente a los 160 000 de `current_full_base`.
--
-- El nombre se queda: renombrarlo obligaría a reescribir la liquidación de 0181
-- y a migrar una columna viva, y el riesgo de tocar el motor supera con mucho la
-- molestia de un nombre. Lo que sí se arregla es que nadie tenga que deducirlo
-- leyendo 1 400 líneas de otra migración.
comment on column public.billing_subscription_changes.target_full_base is
  'BILLING-EXTRA-01B.1 · La base del periodo COMPLETO del plan DESTINO, no la de '
  'Full. En Full→Extra es la de EXTRA, convertida con la tasa vigente al '
  'presupuestar. El importe recurrente que deja una subida es esta base MÁS su '
  'impuesto. Comparar: `current_full_base` sí es la base congelada del plan de '
  'origen, con su descuento si lo tuvo.';

comment on column public.billing_subscription_changes.current_full_base is
  'BILLING-EXTRA-01B.1 · La base congelada del plan de ORIGEN, con su descuento '
  'si lo tuvo. Es la autoridad para reconstruir el importe recurrente anterior '
  'cuando no se llegó a observar el del proveedor.';

-- ---------------------------------------------------------------------------
-- 2 · LA EVIDENCIA DE LA AUTORIZACIÓN
-- ---------------------------------------------------------------------------
alter table public.billing_subscription_changes
  -- Lo que el proveedor tenía puesto ANTES de que lo tocáramos. Se escribe una
  -- vez y no se vuelve a escribir: es la prueba de a dónde hay que volver.
  add column if not exists provider_recurring_amount_before bigint,
  add column if not exists provider_recurring_currency_before text,
  -- Lo último que el proveedor dijo que tiene puesto. Esto SÍ se reescribe: es
  -- una lectura, no una prueba.
  add column if not exists provider_recurring_amount_observed bigint,
  -- Cuándo se COMPROBÓ, con un GET, que la autorización vuelve a estar en el
  -- importe original. Sirva o no haber tenido que cambiarla: lo que marca es
  -- que el mundo de fuera está como estaba.
  add column if not exists provider_recurring_restored_at timestamptz;

comment on column public.billing_subscription_changes.provider_recurring_amount_before is
  'BILLING-EXTRA-01B.1 · El importe recurrente que el proveedor tenía ANTES de '
  'que esta subida lo tocara, observado y congelado. Es la autoridad de '
  'restauración: a esto se vuelve, no a lo que diga el catálogo de hoy.';
comment on column public.billing_subscription_changes.provider_recurring_restored_at is
  'BILLING-EXTRA-01B.1 · Cuándo se VERIFICÓ por GET que la autorización está en '
  'el importe original. Sin esto, una subida no puede terminar en `refunded`: '
  'devolver el dinero y dejar la autorización en Extra no es compensar.';

-- ---------------------------------------------------------------------------
-- 3 · EL INVARIANTE, COMO RESTRICCIÓN
-- ---------------------------------------------------------------------------
--
-- NO_REFUNDED_UPGRADE_WITH_EXTRA_RECURRING_AMOUNT.
--
-- Una subida sólo puede llegar a `refunded` si una de estas dos es cierta:
--
--   · nunca se llegó a tocar la autorización —no hay importe anterior anotado,
--     porque anotarlo es lo primero que se hace antes de tocarla—, o
--   · se verificó por GET que vuelve a estar en el importe original.
--
-- Está aquí, en la tabla, y no sólo en el código que la escribe, porque un
-- invariante que vive en una función es una costumbre: basta que alguien llame
-- a otra para perderlo.
alter table public.billing_subscription_changes
  drop constraint if exists bsc_refunded_requires_provider_restored;
alter table public.billing_subscription_changes
  add constraint bsc_refunded_requires_provider_restored check (
    status <> 'refunded'
    or provider_recurring_amount_before is null
    or provider_recurring_restored_at is not null);

-- ---------------------------------------------------------------------------
-- 4 · ANOTAR A DÓNDE HAY QUE VOLVER
-- ---------------------------------------------------------------------------
--
-- Se llama ANTES de pedirle al proveedor que cambie el importe. Si se llamara
-- después, un proceso que muriera en medio dejaría la autorización cambiada y
-- ninguna pista de cuál era el importe anterior.
create or replace function public.billing_note_upgrade_recurring_before(
  p_change_id uuid,
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
  v_c public.billing_subscription_changes%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'RECURRING_AMOUNT_REQUIRED';
  end if;

  select * into v_c from public.billing_subscription_changes
   where id = p_change_id for update;
  if not found then
    return jsonb_build_object('status', 'change_not_found');
  end if;

  -- INMUTABLE. La primera observación es la buena: las siguientes ya podrían
  -- estar viendo el importe que nosotros mismos pusimos.
  if v_c.provider_recurring_amount_before is not null then
    return jsonb_build_object('status', 'already_noted',
      'amount', v_c.provider_recurring_amount_before,
      'currency', v_c.provider_recurring_currency_before);
  end if;

  update public.billing_subscription_changes
     set provider_recurring_amount_before = p_amount,
         provider_recurring_currency_before = upper(p_currency),
         provider_recurring_amount_observed = p_amount,
         updated_at = now()
   where id = v_c.id;

  return jsonb_build_object('status', 'noted', 'amount', p_amount,
                            'currency', upper(p_currency));
end;
$$;

revoke all on function public.billing_note_upgrade_recurring_before(uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.billing_note_upgrade_recurring_before(uuid, bigint, text)
  to service_role;

comment on function public.billing_note_upgrade_recurring_before(uuid, bigint, text) is
  'BILLING-EXTRA-01B.1 · Congela el importe recurrente que el proveedor tenía '
  'antes de tocarlo. Se llama ANTES del cambio y no se vuelve a escribir: la '
  'segunda lectura ya podría estar viendo lo que pusimos nosotros.';

-- ---------------------------------------------------------------------------
-- 5 · ANOTAR LO QUE EL PROVEEDOR DICE AHORA
-- ---------------------------------------------------------------------------
--
-- Y decidir si eso cuenta como restaurado. La comparación se hace AQUÍ y no
-- fuera para que el instante de la restauración no pueda escribirse sin que la
-- cifra cuadre.
create or replace function public.billing_note_upgrade_recurring_observed(
  p_change_id uuid,
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
  v_c public.billing_subscription_changes%rowtype;
  v_restaurada boolean;
begin
  select * into v_c from public.billing_subscription_changes
   where id = p_change_id for update;
  if not found then
    return jsonb_build_object('status', 'change_not_found');
  end if;

  -- Sin importe o sin moneda NO se afirma nada. Un `null` aquí significa que no
  -- se pudo leer al proveedor, y eso no es «está como estaba».
  --
  -- Y BORRA el sello. Un «verificado» de hace un rato sobre un proveedor que
  -- ahora mismo no se puede leer es una afirmación sin respaldo, y es
  -- justamente la que permitiría cerrar una compensación a ciegas. Volver a
  -- sellarlo cuesta una lectura; cerrarla mal cuesta un cobro recurrente
  -- equivocado durante meses.
  if p_amount is null or p_currency is null then
    update public.billing_subscription_changes
       set provider_recurring_amount_observed = null,
           provider_recurring_restored_at = null,
           updated_at = now()
     where id = v_c.id;
    return jsonb_build_object('status', 'unknown', 'restored', false);
  end if;

  v_restaurada := v_c.provider_recurring_amount_before is not null
    and p_amount = v_c.provider_recurring_amount_before
    and upper(p_currency) = coalesce(v_c.provider_recurring_currency_before,
                                     upper(p_currency));

  update public.billing_subscription_changes
     set provider_recurring_amount_observed = p_amount,
         provider_recurring_restored_at = case
           when v_restaurada then coalesce(provider_recurring_restored_at, now())
           -- Si deja de estar en el original, la restauración deja de estar
           -- verificada. No se conserva un sello viejo sobre un mundo nuevo.
           else null end,
         updated_at = now()
   where id = v_c.id;

  return jsonb_build_object('status', 'observed', 'restored', v_restaurada,
    'amount', p_amount, 'expected', v_c.provider_recurring_amount_before);
end;
$$;

revoke all on function public.billing_note_upgrade_recurring_observed(uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.billing_note_upgrade_recurring_observed(uuid, bigint, text)
  to service_role;

comment on function public.billing_note_upgrade_recurring_observed(uuid, bigint, text) is
  'BILLING-EXTRA-01B.1 · Anota lo que el proveedor dice AHORA y decide si cuenta '
  'como restaurado. La comparación vive aquí para que el sello de restauración '
  'no se pueda escribir sin que la cifra cuadre. Sin lectura no se afirma nada.';

-- ---------------------------------------------------------------------------
-- 6 · EL IMPORTE AL QUE HAY QUE VOLVER
-- ---------------------------------------------------------------------------
--
-- Una sola función responde la pregunta, y responde también DE DÓNDE sale la
-- respuesta, porque no es lo mismo saberlo que haberlo deducido.
create or replace function public.billing_upgrade_restore_target(p_change_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_c public.billing_subscription_changes%rowtype;
begin
  select * into v_c from public.billing_subscription_changes where id = p_change_id;
  if not found then
    return jsonb_build_object('status', 'change_not_found');
  end if;

  -- 1 · Lo observado antes de tocar nada. Es lo que de verdad había.
  if v_c.provider_recurring_amount_before is not null then
    return jsonb_build_object('status', 'observed',
      'amount', v_c.provider_recurring_amount_before,
      'currency', coalesce(v_c.provider_recurring_currency_before, v_c.charge_currency));
  end if;

  -- 2 · La reconstrucción desde lo CONGELADO en esta misma transición: la base
  -- del plan de origen, con su descuento, más el impuesto que se le aplicó.
  -- Sigue sin ser el catálogo de hoy.
  if v_c.current_full_base is not null and v_c.current_full_base > 0 then
    return jsonb_build_object('status', 'reconstructed',
      'amount', v_c.current_full_base
                + public.billing_tax_amount(v_c.current_full_base,
                                            v_c.tax_rate_basis_points),
      'currency', v_c.charge_currency);
  end if;

  -- 3 · Ni una cosa ni la otra. No se inventa: quien pregunte sabrá que no
  -- puede restaurar, y eso impide terminar la compensación.
  return jsonb_build_object('status', 'unknown');
end;
$$;

revoke all on function public.billing_upgrade_restore_target(uuid) from public, anon;
grant execute on function public.billing_upgrade_restore_target(uuid)
  to authenticated, service_role;

comment on function public.billing_upgrade_restore_target(uuid) is
  'BILLING-EXTRA-01B.1 · A qué importe recurrente hay que volver, y de dónde '
  'sale ese número: `observed` si se miró antes de tocarlo, `reconstructed` si '
  'se deduce de lo congelado en la transición, `unknown` si no hay ninguna de '
  'las dos. NUNCA del catálogo de hoy.';

-- ---------------------------------------------------------------------------
-- 7 · Y EL REEMBOLSO SE NIEGA SI LA AUTORIZACIÓN SIGUE EN EXTRA
-- ---------------------------------------------------------------------------
--
-- Es la MISMA función de 0216 con UNA comprobación nueva, la que sostiene el
-- invariante: no se puede cerrar una compensación mientras el mundo de fuera
-- siga divergiendo del de dentro.
--
-- Va aquí y no sólo en la saga porque la saga es código que alguien puede
-- saltarse llamando a la primitiva. La restricción de arriba lo impediría
-- igualmente, pero fallaría con una violación de CHECK; esto contesta con una
-- razón que se puede leer.
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

  -- 0217 · LA AUTORIZACIÓN PRIMERO.
  --
  -- Si esta subida llegó a tocar el importe recurrente, no se cierra nada hasta
  -- que se haya comprobado que volvió al suyo. Devolver el dinero y dejar la
  -- autorización cobrando Extra sobre una suscripción Full no es compensar: es
  -- cambiar un problema visible por uno que sólo se ve el mes siguiente.
  if v_c.provider_recurring_amount_before is not null
     and v_c.provider_recurring_restored_at is null then
    return jsonb_build_object('status', 'provider_not_restored',
      'change_id', v_c.id, 'organization_id', v_c.organization_id,
      'expected', v_c.provider_recurring_amount_before,
      'observed', v_c.provider_recurring_amount_observed);
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
    (select i.provider from public.billing_checkout_intents i
      where i.subscription_change_id = v_c.id
      order by i.created_at desc limit 1),
    v_c.delta_provider_payment_id,
    v_c.delta_base, 0,
    v_c.service_class, v_c.tax_rule_id, v_c.tax_rate_basis_points, v_c.tax_amount,
    v_c.total_amount, v_c.charge_currency, v_c.fx_rate_micros,
    'refunded', v_c.delta_observed_at, v_c.total_amount, now(), p_provider_refund_id)
  on conflict (provider, provider_payment_id)
    where provider_payment_id is not null do nothing
  returning id into v_pago;

  if v_pago is null then
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
  'BILLING-EXTRA-01B.1 · Cierra una compensación con el identificador del '
  'reembolso, y SOLO si la autorización recurrente ya volvió a su importe. '
  'Devolver el dinero dejando el cobro recurrente en Extra no es compensar.';
