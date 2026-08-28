-- ============================================================================
-- Trazaloop · PCR/TEXTILES PRE-INTEGRATION · PT-02A
-- SALDO DE MATERIA PRIMA EN TEXTILES
-- ----------------------------------------------------------------------------
-- QUÉ FALTABA
--
-- PCR tiene `v_material_inventory` desde 0105: por material, recibido,
-- consumido, disponible, lotes con saldo y lotes totales. Textiles solo tiene
-- el saldo POR LOTE (`v_textile_input_lot_balance`) y ninguna agregación.
--
-- Esta vista es su gemela, con UNA diferencia obligada.
--
--
-- POR QUÉ SE AGRUPA POR (MATERIAL, UNIDAD) Y NO POR MATERIAL
--
-- En PCR todo es kg: la unidad está en el nombre de la columna y en las reglas
-- de la metodología. En Textiles un mismo material puede haber llegado en
-- metros y en kilos, y sumar 300 kg con 40 m daría 340 de nada.
--
-- Agrupar por unidad no es una precaución: es la única forma de que la suma
-- signifique algo. Y las filas cuya unidad no se pudo normalizar salen con
-- `unit_code` nulo y APARTE, para que se vean y se arreglen, en vez de
-- desaparecer en un total.
--
-- Sin tabla mutable de stock: el saldo se deriva, como en PCR. Una tabla de
-- existencias introduce el problema de mantenerla al día, que es peor que el
-- que resuelve.
-- ============================================================================

-- `security_invoker = true`: sin ella la vista correria con los permisos de su
-- propietario, que tiene `bypassrls`, y agregaria los lotes de TODAS las
-- empresas. La vista de la que se alimenta lo lleva por la misma razon.
create or replace view public.v_textile_material_inventory
with (security_invoker = true) as
with lotes as (
  select
    b.organization_id,
    -- El lote puede ser de material o de componente: el CHECK
    -- `textile_input_lots_target_check` garantiza que hay exactamente uno.
    coalesce(il.material_id, il.component_id)                    as item_id,
    case when il.material_id is not null then 'material' else 'component' end as item_type,
    coalesce(m.name, cp.name)                                    as item_name,
    b.unit_code,
    b.unit,
    b.quantity_received,
    b.quantity_consumed,
    b.quantity_remaining,
    b.other_unit_consumptions_count
  from public.v_textile_input_lot_balance b
  join public.textile_input_lots il on il.id = b.input_lot_id
  left join public.textile_materials  m  on m.id  = il.material_id
  left join public.textile_components cp on cp.id = il.component_id
)
select
  organization_id,
  item_id,
  item_type,
  item_name,
  unit_code,
  -- Cuando no hay codigo canonico se conserva el texto original para que la
  -- fila se pueda identificar y corregir. NO se mezcla con las normalizadas.
  case when unit_code is null then min(unit) else null end        as unit_raw,
  sum(coalesce(quantity_received, 0))                             as received,
  sum(coalesce(quantity_consumed, 0))                             as consumed,
  sum(coalesce(quantity_remaining, 0))                            as available,
  count(*) filter (where coalesce(quantity_remaining, 0) > 0)     as lots_with_balance,
  count(*)                                                        as lots_total,
  -- Consumos que NO se pudieron restar por no ser comparables. Un saldo que
  -- se calla lo que dejo fuera es un saldo que miente.
  sum(coalesce(other_unit_consumptions_count, 0))                 as unmatched_consumptions,
  -- Saldo negativo: NO se recorta a cero. Es una anomalia y hay que verla.
  count(*) filter (where coalesce(quantity_remaining, 0) < 0)     as lots_negative
from lotes
where item_id is not null
group by organization_id, item_id, item_type, item_name, unit_code;

revoke all on public.v_textile_material_inventory from public, anon;
grant select on public.v_textile_material_inventory to authenticated;

comment on view public.v_textile_material_inventory is
  'PT-02A · Saldo trazado por (material/componente, unidad) en Textiles. Gemela de v_material_inventory (0105) con la diferencia obligada de agrupar por unidad: sumar 300 kg con 40 m daria 340 de nada. Las unidades sin normalizar salen aparte, no desaparecen en un total. Sin tabla de stock: se deriva.';


-- ============================================================================
-- REVERSIÓN
--   drop view if exists public.v_textile_material_inventory;
-- Es una vista derivada: no guarda nada y quitarla no pierde ningun dato.
-- ============================================================================
