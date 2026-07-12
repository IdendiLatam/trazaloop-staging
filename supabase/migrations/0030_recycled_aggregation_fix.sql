-- 0030_recycled_aggregation_fix.sql
-- Trazaloop · Sprint 4.1 · Corrección de agregaciones de contenido reciclado.
--
-- PROBLEMA: en 0029, una orden CON lotes de salida pero SIN cálculos quedaba
-- como 'defensible': l.defensibility_level era null, el CASE caía en "else 3"
-- y min(...) = 3 se traducía a 'defensible'. Un agregado sin un solo snapshot
-- no puede parecer listo.
--
-- REGLA NUEVA (las 4 vistas agregadas):
--   * sin cálculos           → defensibility_level = null (y masas/porcentaje null);
--   * cálculos PARCIALES     → 'preliminary' (hay lotes en el alcance sin snapshot);
--   * todos con cálculo      → regla normal: algún preliminary → preliminary;
--                              si no, algún with_warnings → with_warnings;
--                              solo si todos defensible → defensible.
--   * El porcentaje SIEMPRE se pondera por masa sobre los lotes calculados:
--     sum(recycled) / sum(total) * 100. Nunca se promedian porcentajes.
--
-- Compatibilidad con create or replace view: las columnas existentes
-- conservan nombre, tipo y posición; las nuevas van SOLO al final.
-- batches_count (producto/familia/periodo) conserva su semántica de 0029
-- (lotes CALCULADOS) y queda duplicada en calculated_batches_count.

-- ---------------------------------------------------------------------------
-- v_recycled_by_order
-- ---------------------------------------------------------------------------
create or replace view public.v_recycled_by_order
with (security_invoker = true) as
select
  po.organization_id,
  po.id            as production_order_id,
  po.order_code    as production_order_code,
  sum(l.recycled_mass_kg) as recycled_mass_kg,
  sum(l.total_mass_kg)    as total_mass_kg,
  round(sum(l.recycled_mass_kg) / nullif(sum(l.total_mass_kg), 0) * 100, 4)
                   as recycled_percent,
  case
    when count(l.calculation_id) = 0 then null
    when count(l.calculation_id) < count(distinct ob.id) then 'preliminary'
    else case min(case l.defensibility_level
                    when 'preliminary' then 1
                    when 'with_warnings' then 2
                    when 'defensible' then 3
                  end)
           when 1 then 'preliminary'
           when 2 then 'with_warnings'
           when 3 then 'defensible'
         end
  end              as defensibility_level,
  count(distinct ob.id)     as output_batches_count,
  count(l.calculation_id)   as calculated_batches_count,
  count(distinct ob.id) - count(l.calculation_id) as uncalculated_batches_count,
  (count(distinct ob.id) - count(l.calculation_id)) > 0 as has_uncalculated_batches
from public.production_orders po
join public.output_batches ob on ob.production_order_id = po.id
left join public.v_latest_batch_recycled l on l.output_batch_id = ob.id
group by po.organization_id, po.id, po.order_code;

-- ---------------------------------------------------------------------------
-- v_recycled_by_product — el alcance es TODOS los lotes de salida del
-- producto (antes solo se veían los calculados y no existía noción de
-- pendientes).
-- ---------------------------------------------------------------------------
create or replace view public.v_recycled_by_product
with (security_invoker = true) as
select
  ob.organization_id,
  ob.product_id,
  p.code                  as product_code,
  p.name                  as product_name,
  p.family_id,
  sum(l.recycled_mass_kg) as recycled_mass_kg,
  sum(l.total_mass_kg)    as total_mass_kg,
  round(sum(l.recycled_mass_kg) / nullif(sum(l.total_mass_kg), 0) * 100, 4)
                          as recycled_percent,
  case
    when count(l.calculation_id) = 0 then null
    when count(l.calculation_id) < count(distinct ob.id) then 'preliminary'
    else case min(case l.defensibility_level
                    when 'preliminary' then 1
                    when 'with_warnings' then 2
                    when 'defensible' then 3
                  end)
           when 1 then 'preliminary'
           when 2 then 'with_warnings'
           when 3 then 'defensible'
         end
  end                     as defensibility_level,
  count(l.calculation_id) as batches_count,
  count(distinct ob.id)   as total_batches_count,
  count(l.calculation_id) as calculated_batches_count,
  count(distinct ob.id) - count(l.calculation_id) as uncalculated_batches_count,
  (count(distinct ob.id) - count(l.calculation_id)) > 0 as has_uncalculated_batches
from public.output_batches ob
join public.products p on p.id = ob.product_id
left join public.v_latest_batch_recycled l on l.output_batch_id = ob.id
group by ob.organization_id, ob.product_id, p.code, p.name, p.family_id;

-- ---------------------------------------------------------------------------
-- v_recycled_by_family — alcance: TODOS los lotes de salida de productos de
-- la familia. products_count ahora cuenta los productos con lotes en el
-- alcance (no solo los calculados).
-- ---------------------------------------------------------------------------
create or replace view public.v_recycled_by_family
with (security_invoker = true) as
select
  ob.organization_id,
  p.family_id,
  pf.name                 as family_name,
  sum(l.recycled_mass_kg) as recycled_mass_kg,
  sum(l.total_mass_kg)    as total_mass_kg,
  round(sum(l.recycled_mass_kg) / nullif(sum(l.total_mass_kg), 0) * 100, 4)
                          as recycled_percent,
  case
    when count(l.calculation_id) = 0 then null
    when count(l.calculation_id) < count(distinct ob.id) then 'preliminary'
    else case min(case l.defensibility_level
                    when 'preliminary' then 1
                    when 'with_warnings' then 2
                    when 'defensible' then 3
                  end)
           when 1 then 'preliminary'
           when 2 then 'with_warnings'
           when 3 then 'defensible'
         end
  end                     as defensibility_level,
  count(distinct ob.product_id) as products_count,
  count(l.calculation_id)       as batches_count,
  count(distinct ob.id)         as total_batches_count,
  count(l.calculation_id)       as calculated_batches_count,
  count(distinct ob.id) - count(l.calculation_id) as uncalculated_batches_count,
  (count(distinct ob.id) - count(l.calculation_id)) > 0 as has_uncalculated_batches
from public.output_batches ob
join public.products p          on p.id = ob.product_id
join public.product_families pf on pf.id = p.family_id
left join public.v_latest_batch_recycled l on l.output_batch_id = ob.id
group by ob.organization_id, p.family_id, pf.name;

-- ---------------------------------------------------------------------------
-- v_recycled_by_period — alcance: TODOS los lotes de salida con
-- produced_date dentro del mes.
-- ---------------------------------------------------------------------------
create or replace view public.v_recycled_by_period
with (security_invoker = true) as
select
  ob.organization_id,
  date_trunc('month', ob.produced_date)::date as period_month,
  sum(l.recycled_mass_kg) as recycled_mass_kg,
  sum(l.total_mass_kg)    as total_mass_kg,
  round(sum(l.recycled_mass_kg) / nullif(sum(l.total_mass_kg), 0) * 100, 4)
                          as recycled_percent,
  case
    when count(l.calculation_id) = 0 then null
    when count(l.calculation_id) < count(distinct ob.id) then 'preliminary'
    else case min(case l.defensibility_level
                    when 'preliminary' then 1
                    when 'with_warnings' then 2
                    when 'defensible' then 3
                  end)
           when 1 then 'preliminary'
           when 2 then 'with_warnings'
           when 3 then 'defensible'
         end
  end                     as defensibility_level,
  count(l.calculation_id) as batches_count,
  count(distinct ob.id)   as total_batches_count,
  count(l.calculation_id) as calculated_batches_count,
  count(distinct ob.id) - count(l.calculation_id) as uncalculated_batches_count,
  (count(distinct ob.id) - count(l.calculation_id)) > 0 as has_uncalculated_batches
from public.output_batches ob
left join public.v_latest_batch_recycled l on l.output_batch_id = ob.id
where ob.produced_date is not null
group by ob.organization_id, date_trunc('month', ob.produced_date);
