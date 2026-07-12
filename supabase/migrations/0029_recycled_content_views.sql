-- 0029_recycled_content_views.sql
-- Trazaloop · Sprint 4 · Vistas de contenido reciclado (security_invoker:
-- la RLS de las tablas base aplica con la identidad de quien consulta).
--
-- Agregaciones SIEMPRE ponderadas por masa:
--   recycled_percent = sum(recycled_mass) / sum(total_mass) * 100
-- Nunca se promedian porcentajes.
--
-- Defendibilidad agregada: si algún lote es preliminary → preliminary;
-- si no, si alguno es with_warnings → with_warnings; solo si todos son
-- defensible → defensible. (min sobre el rango 1/2/3.)

-- ---------------------------------------------------------------------------
-- 8.1 v_latest_batch_recycled — ÚLTIMO cálculo por lote de salida
-- ---------------------------------------------------------------------------
create or replace view public.v_latest_batch_recycled
with (security_invoker = true) as
select distinct on (c.output_batch_id)
  c.organization_id,
  c.id                     as calculation_id,
  c.output_batch_id,
  ob.batch_code            as output_batch_code,
  ob.production_order_id,
  po.order_code            as production_order_code,
  ob.product_id,
  p.code                   as product_code,
  p.name                   as product_name,
  p.family_id,
  ob.produced_date,
  c.recycled_mass_kg,
  c.total_mass_kg,
  c.recycled_percent,
  c.declared_percent,
  c.risk_flag,
  c.defensibility_level,
  c.calculated_at,
  c.calculated_by
from public.recycled_content_calculations c
join public.output_batches ob    on ob.id = c.output_batch_id
left join public.production_orders po on po.id = ob.production_order_id
left join public.products p          on p.id = ob.product_id
order by c.output_batch_id, c.calculated_at desc, c.id desc;

-- ---------------------------------------------------------------------------
-- 8.2 v_recycled_by_order
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
  case min(case l.defensibility_level
             when 'preliminary' then 1
             when 'with_warnings' then 2
             else 3 end)
    when 1 then 'preliminary'
    when 2 then 'with_warnings'
    when 3 then 'defensible'
  end              as defensibility_level,
  count(distinct ob.id)     as output_batches_count,
  count(l.calculation_id)   as calculated_batches_count
from public.production_orders po
join public.output_batches ob on ob.production_order_id = po.id
left join public.v_latest_batch_recycled l on l.output_batch_id = ob.id
group by po.organization_id, po.id, po.order_code;

-- ---------------------------------------------------------------------------
-- 8.3 v_recycled_by_product
-- ---------------------------------------------------------------------------
create or replace view public.v_recycled_by_product
with (security_invoker = true) as
select
  l.organization_id,
  l.product_id,
  l.product_code,
  l.product_name,
  l.family_id,
  sum(l.recycled_mass_kg) as recycled_mass_kg,
  sum(l.total_mass_kg)    as total_mass_kg,
  round(sum(l.recycled_mass_kg) / nullif(sum(l.total_mass_kg), 0) * 100, 4)
                          as recycled_percent,
  case min(case l.defensibility_level
             when 'preliminary' then 1
             when 'with_warnings' then 2
             else 3 end)
    when 1 then 'preliminary'
    when 2 then 'with_warnings'
    when 3 then 'defensible'
  end                     as defensibility_level,
  count(*)                as batches_count
from public.v_latest_batch_recycled l
where l.product_id is not null
group by l.organization_id, l.product_id, l.product_code, l.product_name, l.family_id;

-- ---------------------------------------------------------------------------
-- 8.4 v_recycled_by_family
-- ---------------------------------------------------------------------------
create or replace view public.v_recycled_by_family
with (security_invoker = true) as
select
  l.organization_id,
  l.family_id,
  pf.name                 as family_name,
  sum(l.recycled_mass_kg) as recycled_mass_kg,
  sum(l.total_mass_kg)    as total_mass_kg,
  round(sum(l.recycled_mass_kg) / nullif(sum(l.total_mass_kg), 0) * 100, 4)
                          as recycled_percent,
  case min(case l.defensibility_level
             when 'preliminary' then 1
             when 'with_warnings' then 2
             else 3 end)
    when 1 then 'preliminary'
    when 2 then 'with_warnings'
    when 3 then 'defensible'
  end                     as defensibility_level,
  count(distinct l.product_id) as products_count,
  count(*)                as batches_count
from public.v_latest_batch_recycled l
join public.product_families pf on pf.id = l.family_id
where l.family_id is not null
group by l.organization_id, l.family_id, pf.name;

-- ---------------------------------------------------------------------------
-- 8.5 v_recycled_by_period — mes de produced_date
-- ---------------------------------------------------------------------------
create or replace view public.v_recycled_by_period
with (security_invoker = true) as
select
  l.organization_id,
  date_trunc('month', l.produced_date)::date as period_month,
  sum(l.recycled_mass_kg) as recycled_mass_kg,
  sum(l.total_mass_kg)    as total_mass_kg,
  round(sum(l.recycled_mass_kg) / nullif(sum(l.total_mass_kg), 0) * 100, 4)
                          as recycled_percent,
  case min(case l.defensibility_level
             when 'preliminary' then 1
             when 'with_warnings' then 2
             else 3 end)
    when 1 then 'preliminary'
    when 2 then 'with_warnings'
    when 3 then 'defensible'
  end                     as defensibility_level,
  count(*)                as batches_count
from public.v_latest_batch_recycled l
where l.produced_date is not null
group by l.organization_id, date_trunc('month', l.produced_date);
