-- 0026_traceability_views.sql
-- Trazaloop · Sprint 3 · Vistas de trazabilidad (security_invoker: la RLS de
-- las tablas base aplica con la identidad de quien consulta).
--
-- El balance de masa es ADVERTENCIA (tolerancia fija 5% en Sprint 3), nunca
-- bloqueo, y NO es cálculo de contenido reciclado (eso llega en Sprint 4).

-- ---------------------------------------------------------------------------
-- 6.1 v_output_batch_completeness — estado de trazabilidad por lote de salida
-- ---------------------------------------------------------------------------
create or replace view public.v_output_batch_completeness
with (security_invoker = true) as
with consumption_agg as (
  select
    bc.production_order_id,
    sum(bc.mass_kg)                                    as consumed_mass_kg,
    count(*)                                           as consumption_rows,
    bool_and(ib.supplier_id is not null)               as all_have_supplier,
    bool_and(ib.material_id is not null)               as all_have_material
  from public.batch_consumption bc
  join public.input_batches ib on ib.id = bc.input_batch_id
  group by bc.production_order_id
),
composition_agg as (
  select
    cp.output_batch_id,
    sum(cp.mass_kg) as composition_mass_kg,
    count(*)        as composition_rows
  from public.batch_composition cp
  group by cp.output_batch_id
)
select
  ob.organization_id,
  ob.id                                   as output_batch_id,
  ob.batch_code                           as output_batch_code,
  ob.production_order_id,
  po.order_code                           as production_order_code,
  ob.product_id,
  p.code                                  as product_code,
  p.name                                  as product_name,
  (po.id is not null)                     as has_order,
  coalesce(ca.consumption_rows, 0) > 0    as has_consumption,
  coalesce(cg.composition_rows, 0) > 0    as has_composition,
  coalesce(ca.all_have_supplier, false)   as has_supplier_info,
  coalesce(ca.all_have_material, false)   as has_material_info,
  ca.consumed_mass_kg,
  cg.composition_mass_kg,
  ob.produced_quantity_kg,
  -- Advertencia de balance (tolerancia 5%): consumido vs composición y, si
  -- existe, cantidad producida vs composición.
  (
    (ca.consumed_mass_kg is not null and cg.composition_mass_kg is not null
     and abs(ca.consumed_mass_kg - cg.composition_mass_kg) > 0.05 * ca.consumed_mass_kg)
    or
    (ob.produced_quantity_kg is not null and cg.composition_mass_kg is not null
     and abs(ob.produced_quantity_kg - cg.composition_mass_kg) > 0.05 * ob.produced_quantity_kg)
  )                                       as mass_balance_warning,
  array_remove(array[
    case when po.id is null                          then 'orden de producción' end,
    case when coalesce(ca.consumption_rows, 0) = 0   then 'consumos de lotes de entrada' end,
    case when coalesce(cg.composition_rows, 0) = 0   then 'composición del lote' end,
    case when not coalesce(ca.all_have_supplier, false) then 'información de proveedor' end,
    case when not coalesce(ca.all_have_material, false) then 'información de material' end
  ], null)                                as missing_items,
  case
    when po.id is null
      or coalesce(ca.consumption_rows, 0) = 0
      or coalesce(cg.composition_rows, 0) = 0
      or not coalesce(ca.all_have_supplier, false)
      or not coalesce(ca.all_have_material, false)
    then 'incomplete'
    when (
      (ca.consumed_mass_kg is not null and cg.composition_mass_kg is not null
       and abs(ca.consumed_mass_kg - cg.composition_mass_kg) > 0.05 * ca.consumed_mass_kg)
      or
      (ob.produced_quantity_kg is not null and cg.composition_mass_kg is not null
       and abs(ob.produced_quantity_kg - cg.composition_mass_kg) > 0.05 * ob.produced_quantity_kg)
    )
    then 'complete_with_warnings'
    else 'complete'
  end                                     as traceability_status
from public.output_batches ob
left join public.production_orders po on po.id = ob.production_order_id
left join public.products p           on p.id = ob.product_id
left join consumption_agg ca          on ca.production_order_id = ob.production_order_id
left join composition_agg cg          on cg.output_batch_id = ob.id;

-- ---------------------------------------------------------------------------
-- 6.2 v_traceability_backward — producto/lote de salida hacia atrás
-- output_batch → production_order → batch_consumption → input_batch → supplier/material
-- ---------------------------------------------------------------------------
create or replace view public.v_traceability_backward
with (security_invoker = true) as
select
  ob.organization_id,
  ob.id            as output_batch_id,
  ob.batch_code    as output_batch_code,
  ob.product_id,
  p.code           as product_code,
  p.name           as product_name,
  po.id            as production_order_id,
  po.order_code    as production_order_code,
  ib.id            as input_batch_id,
  ib.batch_code    as input_batch_code,
  s.id             as supplier_id,
  s.name           as supplier_name,
  m.id             as material_id,
  m.name           as material_name,
  m.classification_code,
  bc.mass_kg       as consumed_mass_kg
from public.output_batches ob
left join public.products p            on p.id = ob.product_id
left join public.production_orders po  on po.id = ob.production_order_id
left join public.batch_consumption bc  on bc.production_order_id = po.id
left join public.input_batches ib      on ib.id = bc.input_batch_id
left join public.suppliers s           on s.id = ib.supplier_id
left join public.materials m           on m.id = ib.material_id;

-- ---------------------------------------------------------------------------
-- 6.3 v_traceability_forward — lote de entrada hacia adelante
-- input_batch → batch_consumption → production_order → output_batch → product
-- ---------------------------------------------------------------------------
create or replace view public.v_traceability_forward
with (security_invoker = true) as
select
  ib.organization_id,
  ib.id            as input_batch_id,
  ib.batch_code    as input_batch_code,
  s.id             as supplier_id,
  s.name           as supplier_name,
  m.id             as material_id,
  m.name           as material_name,
  po.id            as production_order_id,
  po.order_code    as production_order_code,
  ob.id            as output_batch_id,
  ob.batch_code    as output_batch_code,
  ob.product_id,
  p.code           as product_code,
  p.name           as product_name,
  bc.mass_kg       as consumed_mass_kg
from public.input_batches ib
left join public.suppliers s           on s.id = ib.supplier_id
left join public.materials m           on m.id = ib.material_id
left join public.batch_consumption bc  on bc.input_batch_id = ib.id
left join public.production_orders po  on po.id = bc.production_order_id
left join public.output_batches ob     on ob.production_order_id = po.id
left join public.products p            on p.id = ob.product_id;

-- ---------------------------------------------------------------------------
-- 6.4 v_production_order_mass_balance — balance por orden (advertencia)
-- ---------------------------------------------------------------------------
create or replace view public.v_production_order_mass_balance
with (security_invoker = true) as
with consumption_agg as (
  select
    bc.production_order_id,
    sum(bc.mass_kg) as consumed_mass_kg,
    count(distinct bc.input_batch_id) as input_batches_count
  from public.batch_consumption bc
  group by bc.production_order_id
),
output_agg as (
  select
    ob.production_order_id,
    count(*)                        as output_batches_count,
    sum(ob.produced_quantity_kg)    as produced_quantity_kg,
    sum(cg.composition_mass_kg)     as composition_mass_kg
  from public.output_batches ob
  left join (
    select output_batch_id, sum(mass_kg) as composition_mass_kg
    from public.batch_composition
    group by output_batch_id
  ) cg on cg.output_batch_id = ob.id
  group by ob.production_order_id
)
select
  po.organization_id,
  po.id            as production_order_id,
  po.order_code    as production_order_code,
  ca.consumed_mass_kg,
  oa.composition_mass_kg,
  oa.produced_quantity_kg,
  (
    (ca.consumed_mass_kg is not null and oa.composition_mass_kg is not null
     and abs(ca.consumed_mass_kg - oa.composition_mass_kg) > 0.05 * ca.consumed_mass_kg)
    or
    (oa.produced_quantity_kg is not null and oa.composition_mass_kg is not null
     and abs(oa.produced_quantity_kg - oa.composition_mass_kg) > 0.05 * oa.produced_quantity_kg)
  )                as mass_balance_warning,
  coalesce(oa.output_batches_count, 0) as output_batches_count,
  coalesce(ca.input_batches_count, 0)  as input_batches_count
from public.production_orders po
left join consumption_agg ca on ca.production_order_id = po.id
left join output_agg oa      on oa.production_order_id = po.id;
