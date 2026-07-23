-- 0079_textile_traceability_status_hardening.sql
-- Trazaloop · Sprint T6.1 (Textil) · Hardening del estado de trazabilidad
-- y recálculo operativo en base de datos.
--
-- PROBLEMA: textile_output_lots.traceability_status (0078) era editable
-- por UPDATE directo vía API por cualquier rol con permiso de escritura —
-- se podía fijar 'complete' con brechas reales. Además, el recálculo vivía
-- solo en las server actions: cambios directos por API (o rutas no
-- cubiertas) dejaban el estado persistido desactualizado.
--
-- SOLUCIÓN (este archivo):
--  1. PROTECCIÓN: trigger BEFORE UPDATE que bloquea cambios directos del
--     campo salvo bajo el flag transaccional interno
--     trazaloop.textile_traceability_recalculate = 'on', que SOLO fija la
--     función controlada de refresco.
--  2. CÁLCULO EN BD: calculate_textile_output_lot_traceability_status
--     replica EXACTAMENTE la lógica de dominio de T6
--     (computeTraceabilityStatus + computeReferenceEvidenceGaps):
--     not_started (sin consumos NI procesos en la orden); needs_review
--     (sobreconsumo, lote sin proveedor, unidades no comparables,
--     brechas de evidencia de la referencia, tercerizados sin soporte);
--     complete (≥1 consumo, sin brechas — referencia y lote garantizados
--     por FKs NOT NULL y check quantity_produced > 0); incomplete (resto).
--     Es estado de trazabilidad TÉCNICA: jamás describe cumplimiento.
--  3. RECÁLCULO OPERATIVO: triggers AFTER en consumos, procesos, lotes
--     finales, órdenes, lotes de entrada y vínculos de evidencias que
--     refrescan los lotes finales afectados. Sin recursión: el refresco
--     solo cambia traceability_status, y el trigger AFTER de
--     textile_output_lots ignora esa columna.
--  4. RPC de recálculo manual para el botón de la UI (authenticated),
--     con validación de sesión, membresía y módulo habilitado.
--
-- ALCANCE ESTRICTO: solo funciones y triggers sobre tablas textiles de
-- 0078 (+0075 vínculos). Sin tablas nuevas, sin políticas nuevas, sin
-- tocar vistas, sin circularidad/TrazaDocs Textil/pasaporte/QR/planes.
-- CERO cambios a objetos CPR.

-- ---------------------------------------------------------------------------
-- 1. Protección del campo (flag transaccional interno)
-- ---------------------------------------------------------------------------
create or replace function public.protect_textile_output_lot_traceability_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.traceability_status is distinct from old.traceability_status
     and coalesce(current_setting('trazaloop.textile_traceability_recalculate', true), 'off') <> 'on' then
    raise exception 'El estado de trazabilidad de un lote producido no puede modificarse directamente. Debe recalcularse desde sus datos operativos.';
  end if;
  return new;
end;
$$;
revoke execute on function public.protect_textile_output_lot_traceability_status() from public, anon, authenticated;

create trigger t_textile_output_lots_traceability_protect
  before update on public.textile_output_lots
  for each row execute function public.protect_textile_output_lot_traceability_status();

-- ---------------------------------------------------------------------------
-- 2. Cálculo del estado desde datos reales (espejo del dominio T6)
-- ---------------------------------------------------------------------------
create or replace function public.calculate_textile_output_lot_traceability_status(p_output_lot_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot record;
  v_consumptions int;
  v_steps int;
  v_gaps int := 0;
begin
  select ol.id, ol.organization_id, ol.order_id, po.reference_id
    into v_lot
    from textile_output_lots ol
    join textile_production_orders po
      on po.id = ol.order_id and po.organization_id = ol.organization_id
   where ol.id = p_output_lot_id;

  if v_lot is null then
    return null;
  end if;

  select count(*) into v_consumptions
    from textile_order_consumptions
   where order_id = v_lot.order_id and organization_id = v_lot.organization_id;

  select count(*) into v_steps
    from textile_order_process_steps
   where order_id = v_lot.order_id and organization_id = v_lot.organization_id;

  -- not_started: la orden no tiene consumos NI procesos registrados.
  if v_consumptions = 0 and v_steps = 0 then
    return 'not_started';
  end if;

  -- Brecha 1: sobreconsumo detectable (misma unidad del lote, sin conversión).
  select count(*) into v_gaps
    from textile_input_lots il
   where il.organization_id = v_lot.organization_id
     and il.quantity_received is not null
     and il.unit is not null
     and exists (
       select 1 from textile_order_consumptions c
        where c.input_lot_id = il.id and c.order_id = v_lot.order_id
     )
     and (
       select coalesce(sum(c2.quantity_consumed), 0)
         from textile_order_consumptions c2
        where c2.input_lot_id = il.id
          and lower(trim(c2.unit)) = lower(trim(il.unit))
     ) > il.quantity_received;

  -- Brecha 2: lotes consumidos sin proveedor registrado.
  v_gaps := v_gaps + (
    select count(distinct il.id)
      from textile_order_consumptions c
      join textile_input_lots il on il.id = c.input_lot_id
     where c.order_id = v_lot.order_id
       and c.organization_id = v_lot.organization_id
       and il.supplier_id is null
  );

  -- Brecha 3: consumos con unidad no comparable con la del lote.
  v_gaps := v_gaps + (
    select count(*)
      from textile_order_consumptions c
      join textile_input_lots il on il.id = c.input_lot_id
     where c.order_id = v_lot.order_id
       and c.organization_id = v_lot.organization_id
       and il.unit is not null
       and lower(trim(c.unit)) <> lower(trim(il.unit))
  );

  -- Brecha 4: evidencia de la referencia (espejo de
  -- computeReferenceEvidenceGaps de T5): fibras recicladas/orgánicas
  -- declaradas sin soporte de declaración (vinculado a la fibra o a la
  -- referencia) y composición registrada sin soporte de composición
  -- (vinculado a la referencia o a sus fibras).
  v_gaps := v_gaps + (
    select count(*)
      from textile_reference_fiber_composition f
     where f.reference_id = v_lot.reference_id
       and f.organization_id = v_lot.organization_id
       and f.is_recycled_declared
       and not exists (
         select 1 from textile_evidence_links l
          where l.organization_id = v_lot.organization_id
            and l.link_type = 'recycled_claim_support'
            and (
              (l.entity_type = 'reference' and l.entity_id = v_lot.reference_id)
              or (l.entity_type = 'fiber_composition' and l.entity_id = f.id)
            )
       )
  );
  v_gaps := v_gaps + (
    select count(*)
      from textile_reference_fiber_composition f
     where f.reference_id = v_lot.reference_id
       and f.organization_id = v_lot.organization_id
       and f.is_organic_declared
       and not exists (
         select 1 from textile_evidence_links l
          where l.organization_id = v_lot.organization_id
            and l.link_type = 'organic_claim_support'
            and (
              (l.entity_type = 'reference' and l.entity_id = v_lot.reference_id)
              or (l.entity_type = 'fiber_composition' and l.entity_id = f.id)
            )
       )
  );
  if exists (
       select 1 from textile_reference_fiber_composition f
        where f.reference_id = v_lot.reference_id
          and f.organization_id = v_lot.organization_id
     )
     and not exists (
       select 1 from textile_evidence_links l
        where l.organization_id = v_lot.organization_id
          and l.link_type = 'composition_support'
          and (
            (l.entity_type = 'reference' and l.entity_id = v_lot.reference_id)
            or (l.entity_type = 'fiber_composition' and l.entity_id in (
              select f2.id from textile_reference_fiber_composition f2
               where f2.reference_id = v_lot.reference_id
                 and f2.organization_id = v_lot.organization_id
            ))
          )
     ) then
    v_gaps := v_gaps + 1;
  end if;

  -- Brecha 5: procesos tercerizados sin soporte documental vinculado.
  v_gaps := v_gaps + (
    select count(*)
      from textile_order_process_steps s
     where s.order_id = v_lot.order_id
       and s.organization_id = v_lot.organization_id
       and s.step_type = 'outsourced'
       and not exists (
         select 1 from textile_evidence_links l
          where l.organization_id = v_lot.organization_id
            and l.entity_type = 'order_process_step'
            and l.entity_id = s.id
       )
  );

  if v_gaps > 0 then
    return 'needs_review';
  end if;
  if v_consumptions > 0 then
    return 'complete';
  end if;
  return 'incomplete';
end;
$$;
revoke execute on function public.calculate_textile_output_lot_traceability_status(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Refresco controlado (única vía de escritura del campo)
-- ---------------------------------------------------------------------------
create or replace function public.refresh_textile_output_lot_traceability_status(p_output_lot_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  v_status := public.calculate_textile_output_lot_traceability_status(p_output_lot_id);
  if v_status is null then
    return null;
  end if;
  -- Flag LOCAL a la transacción: habilita el update del campo protegido y
  -- desaparece al terminar (set_config(..., true)).
  perform set_config('trazaloop.textile_traceability_recalculate', 'on', true);
  update textile_output_lots
     set traceability_status = v_status
   where id = p_output_lot_id
     and traceability_status is distinct from v_status;
  perform set_config('trazaloop.textile_traceability_recalculate', 'off', true);
  return v_status;
end;
$$;
revoke execute on function public.refresh_textile_output_lot_traceability_status(uuid) from public, anon, authenticated;

create or replace function public.refresh_textile_order_output_lots_traceability(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot uuid;
begin
  for v_lot in select id from textile_output_lots where order_id = p_order_id loop
    perform public.refresh_textile_output_lot_traceability_status(v_lot);
  end loop;
end;
$$;
revoke execute on function public.refresh_textile_order_output_lots_traceability(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC de recálculo manual (botón de la UI). Valida sesión, membresía y
--    módulo habilitado; jamás acepta el estado desde el cliente.
-- ---------------------------------------------------------------------------
create or replace function public.recalculate_textile_output_lot_traceability(p_output_lot_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;

  select organization_id into v_org
    from textile_output_lots
   where id = p_output_lot_id;

  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'El lote producido no existe o no pertenece a tu organización';
  end if;

  if not exists (
    select 1 from organization_modules
     where organization_id = v_org and module_code = 'textiles' and enabled
  ) then
    raise exception 'El módulo Textil no está habilitado para la organización';
  end if;

  return public.refresh_textile_output_lot_traceability_status(p_output_lot_id);
end;
$$;
revoke execute on function public.recalculate_textile_output_lot_traceability(uuid) from public, anon;
grant execute on function public.recalculate_textile_output_lot_traceability(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Triggers de recálculo operativo (AFTER, sin recursión)
-- ---------------------------------------------------------------------------

-- Consumos: alta/edición/borrado recalculan la orden (y la anterior si el
-- consumo cambió de orden).
create or replace function public.trg_textile_consumption_recalc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_textile_order_output_lots_traceability(old.order_id);
    return old;
  end if;
  perform public.refresh_textile_order_output_lots_traceability(new.order_id);
  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform public.refresh_textile_order_output_lots_traceability(old.order_id);
  end if;
  return new;
end;
$$;
revoke execute on function public.trg_textile_consumption_recalc() from public, anon, authenticated;

create trigger t_textile_order_consumptions_recalc
  after insert or update or delete on public.textile_order_consumptions
  for each row execute function public.trg_textile_consumption_recalc();

-- Procesos: misma regla que consumos.
create trigger t_textile_order_process_steps_recalc
  after insert or update or delete on public.textile_order_process_steps
  for each row execute function public.trg_textile_consumption_recalc();

-- Lotes finales: estado inicial al crear (pisa cualquier valor enviado en
-- el INSERT: el cliente nunca decide el estado) y refresco cuando cambian
-- campos operativos. IGNORA los updates cuyo único cambio relevante es
-- traceability_status (así el refresco no se re-dispara: sin recursión).
create or replace function public.trg_textile_output_lot_recalc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_textile_output_lot_traceability_status(new.id);
    return new;
  end if;
  if old.order_id is distinct from new.order_id
     or old.quantity_produced is distinct from new.quantity_produced
     or old.status is distinct from new.status
     or old.is_active is distinct from new.is_active then
    perform public.refresh_textile_output_lot_traceability_status(new.id);
    if old.order_id is distinct from new.order_id then
      perform public.refresh_textile_order_output_lots_traceability(old.order_id);
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.trg_textile_output_lot_recalc() from public, anon, authenticated;

create trigger t_textile_output_lots_recalc
  after insert or update on public.textile_output_lots
  for each row execute function public.trg_textile_output_lot_recalc();

-- Órdenes: cambios de referencia/estado/cantidad/actividad recalculan sus
-- lotes finales.
create or replace function public.trg_textile_order_recalc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.reference_id is distinct from new.reference_id
     or old.status is distinct from new.status
     or old.produced_quantity is distinct from new.produced_quantity
     or old.is_active is distinct from new.is_active then
    perform public.refresh_textile_order_output_lots_traceability(new.id);
  end if;
  return new;
end;
$$;
revoke execute on function public.trg_textile_order_recalc() from public, anon, authenticated;

create trigger t_textile_production_orders_recalc
  after update on public.textile_production_orders
  for each row execute function public.trg_textile_order_recalc();

-- Lotes de entrada: cambios operativos (cantidad recibida, unidad,
-- proveedor, material/componente, tipo, estado, actividad) recalculan las
-- órdenes que consumen el lote — cubre el sobreconsumo POSTERIOR (bajar
-- quantity_received después de consumir).
create or replace function public.trg_textile_input_lot_recalc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order uuid;
begin
  if old.quantity_received is distinct from new.quantity_received
     or old.unit is distinct from new.unit
     or old.supplier_id is distinct from new.supplier_id
     or old.material_id is distinct from new.material_id
     or old.component_id is distinct from new.component_id
     or old.lot_type is distinct from new.lot_type
     or old.status is distinct from new.status
     or old.is_active is distinct from new.is_active then
    for v_order in
      select distinct order_id from textile_order_consumptions where input_lot_id = new.id
    loop
      perform public.refresh_textile_order_output_lots_traceability(v_order);
    end loop;
  end if;
  return new;
end;
$$;
revoke execute on function public.trg_textile_input_lot_recalc() from public, anon, authenticated;

create trigger t_textile_input_lots_recalc
  after update on public.textile_input_lots
  for each row execute function public.trg_textile_input_lot_recalc();

-- Vínculos de evidencias: alta/borrado recalculan los lotes finales
-- afectados según la entidad. CASOS AUTOMÁTICOS: output_lot directo,
-- production_order, order_consumption, order_process_step, input_lot
-- (órdenes que lo consumen), reference y fiber_composition (órdenes de la
-- referencia). Los vínculos a material/component/reference_material/
-- reference_component y a entidades de catálogo NO afectan las brechas
-- calculadas y no recalculan (documentado; el botón manual cubre casos
-- indirectos futuros).
create or replace function public.trg_textile_evidence_link_recalc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_order uuid;
  v_reference uuid;
begin
  v_row := coalesce(new, old);

  if v_row.entity_type = 'output_lot' then
    perform public.refresh_textile_output_lot_traceability_status(v_row.entity_id);
  elsif v_row.entity_type = 'production_order' then
    perform public.refresh_textile_order_output_lots_traceability(v_row.entity_id);
  elsif v_row.entity_type = 'order_consumption' then
    select order_id into v_order from textile_order_consumptions where id = v_row.entity_id;
    if v_order is not null then
      perform public.refresh_textile_order_output_lots_traceability(v_order);
    end if;
  elsif v_row.entity_type = 'order_process_step' then
    select order_id into v_order from textile_order_process_steps where id = v_row.entity_id;
    if v_order is not null then
      perform public.refresh_textile_order_output_lots_traceability(v_order);
    end if;
  elsif v_row.entity_type = 'input_lot' then
    for v_order in
      select distinct order_id from textile_order_consumptions where input_lot_id = v_row.entity_id
    loop
      perform public.refresh_textile_order_output_lots_traceability(v_order);
    end loop;
  elsif v_row.entity_type in ('reference', 'fiber_composition') then
    if v_row.entity_type = 'reference' then
      v_reference := v_row.entity_id;
    else
      select reference_id into v_reference
        from textile_reference_fiber_composition where id = v_row.entity_id;
    end if;
    if v_reference is not null then
      for v_order in
        select id from textile_production_orders where reference_id = v_reference
      loop
        perform public.refresh_textile_order_output_lots_traceability(v_order);
      end loop;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke execute on function public.trg_textile_evidence_link_recalc() from public, anon, authenticated;

create trigger t_textile_evidence_links_recalc
  after insert or delete on public.textile_evidence_links
  for each row execute function public.trg_textile_evidence_link_recalc();
