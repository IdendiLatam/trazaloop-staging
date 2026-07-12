-- 0031_audit_support_views.sql
-- Trazaloop · Sprint 5A · Vistas de soporte técnico (dossier, componentes,
-- matriz de evidencias y brechas). Todas security_invoker: la RLS de las
-- tablas base aplica con la identidad de quien consulta.
--
-- REGLA CENTRAL: estas vistas LEEN los snapshots existentes. No recalculan,
-- no modifican cálculos y no persisten documentos ni PDFs.

-- ---------------------------------------------------------------------------
-- 3.1 v_calculation_dossier — una fila por cálculo, con todo su contexto.
-- Los datos opcionales ausentes se devuelven como null de forma segura
-- (p. ej. lote sin producto o sin familia).
-- ---------------------------------------------------------------------------
create or replace view public.v_calculation_dossier
with (security_invoker = true) as
select
  c.organization_id,
  c.id                          as calculation_id,
  c.output_batch_id,
  ob.batch_code                 as output_batch_code,
  ob.produced_date,
  ob.produced_quantity_kg,
  ob.production_order_id,
  po.order_code                 as production_order_code,
  ob.product_id,
  p.code                        as product_code,
  p.name                        as product_name,
  p.family_id,
  pf.name                       as family_name,
  c.methodology_id,
  m.code                        as methodology_code,
  m.version                     as methodology_version,
  m.name                        as methodology_name,
  c.methodology_rules_snapshot,
  c.total_mass_kg,
  c.recycled_mass_kg,
  c.recycled_percent,
  c.declared_percent,
  c.risk_flag,
  c.defensibility_level,
  c.warnings,
  c.components,
  c.calculated_by,
  prof.full_name                as calculated_by_name,
  c.calculated_at,
  comp.traceability_status,
  -- Advertencia de balance según el SNAPSHOT del cálculo (no el estado
  -- actual), para que el dossier describa el cálculo tal como se congeló.
  (c.warnings @> '["mass_balance_out_of_tolerance"]'::jsonb
   or c.warnings @> '["produced_vs_composition_out_of_tolerance"]'::jsonb)
                                as mass_balance_warning,
  comp.consumed_mass_kg,
  comp.composition_mass_kg
from public.recycled_content_calculations c
join public.output_batches ob            on ob.id = c.output_batch_id
left join public.production_orders po    on po.id = ob.production_order_id
left join public.products p              on p.id = ob.product_id
left join public.product_families pf     on pf.id = p.family_id
join public.calculation_methodologies m  on m.id = c.methodology_id
left join public.profiles prof           on prof.id = c.calculated_by
left join public.v_output_batch_completeness comp
  on comp.output_batch_id = c.output_batch_id;

-- ---------------------------------------------------------------------------
-- 3.2 v_calculation_component_rows — expande el JSON `components` del
-- snapshot, una fila por componente con ordinalidad. Casts seguros; si
-- `components` no es un array, no produce filas.
-- ---------------------------------------------------------------------------
create or replace view public.v_calculation_component_rows
with (security_invoker = true) as
select
  c.organization_id,
  c.id                as calculation_id,
  c.output_batch_id,
  comp.ord            as component_index,
  nullif(comp.value ->> 'material_id', '')::uuid       as material_id,
  comp.value ->> 'material_name'                        as material_name,
  case when comp.value ->> 'mass_kg' ~ '^-?[0-9]+(\.[0-9]+)?$'
       then (comp.value ->> 'mass_kg')::numeric
       else null end                                    as mass_kg,
  comp.value ->> 'classification_code'                  as classification_code,
  comp.value ->> 'effective_classification'             as effective_classification,
  coalesce((comp.value ->> 'is_same_process') = 'true', false) as is_same_process,
  nullif(comp.value ->> 'origin_support_evidence_id', '')::uuid
                                                        as origin_support_evidence_id,
  comp.value ->> 'origin_support_status'                as origin_support_status,
  nullif(comp.value ->> 'reclassification_evidence_id', '')::uuid
                                                        as reclassification_evidence_id,
  comp.value ->> 'reclassification_support_status'      as reclassification_support_status,
  coalesce((comp.value ->> 'counted') = 'true', false)  as counted,
  comp.value ->> 'exclusion_reason'                     as exclusion_reason,
  coalesce(comp.value -> 'warning_codes', '[]'::jsonb)  as warning_codes
from public.recycled_content_calculations c
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(c.components) = 'array'
       then c.components else '[]'::jsonb end
) with ordinality as comp(value, ord);

-- ---------------------------------------------------------------------------
-- 3.3 v_output_batch_evidence_matrix — consolida evidencias relacionadas con
-- un lote de salida por TODAS las rutas: enlaces directos (lote, orden,
-- lotes de entrada consumidos, materiales de composición, producto, familia,
-- proveedor) y las evidencias de origen/reclasificación de materiales usados
-- en la composición AUNQUE no exista evidence_link explícito.
--
-- Una fila por (evidencia, rol, entidad); distinct elimina duplicados por
-- rutas repetidas. calculation_id es el del ÚLTIMO cálculo del lote (null si
-- no hay). evidence_code y validated_at no existen en el esquema de
-- evidencias: se devuelven null de forma segura y documentada.
--
-- is_required_for_defensibility = true para el soporte de origen y de
-- reclasificación de materiales de la composición (son exactamente las
-- piezas que el motor exige para contar masa como reciclada; incluye las
-- pendientes, que son la brecha crítica).
-- ---------------------------------------------------------------------------
create or replace view public.v_output_batch_evidence_matrix
with (security_invoker = true) as
with base as (
  select
    ob.organization_id,
    ob.id                 as output_batch_id,
    ob.batch_code         as output_batch_code,
    ob.production_order_id,
    po.order_code,
    ob.product_id,
    p.code                as product_code,
    p.name                as product_name,
    p.family_id,
    pf.name               as family_name,
    l.calculation_id
  from public.output_batches ob
  left join public.production_orders po on po.id = ob.production_order_id
  left join public.products p           on p.id = ob.product_id
  left join public.product_families pf  on pf.id = p.family_id
  left join public.v_latest_batch_recycled l on l.output_batch_id = ob.id
),
routes as (
  -- Enlace directo al lote de salida.
  select b.*, el.evidence_id,
         'output_batch_support'::text as support_role,
         'output_batch'::text as linked_entity_type,
         b.output_batch_id as linked_entity_id,
         b.output_batch_code as linked_entity_label,
         false as is_required
  from base b
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'output_batch' and el.target_id = b.output_batch_id

  union all
  -- Enlace a la orden de producción.
  select b.*, el.evidence_id, 'production_order_support', 'production_order',
         b.production_order_id, b.order_code, false
  from base b
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'production_order' and el.target_id = b.production_order_id

  union all
  -- Enlaces a lotes de entrada consumidos por la orden.
  select b.*, el.evidence_id, 'input_batch_support', 'input_batch',
         ib.id, ib.batch_code, false
  from base b
  join public.batch_consumption bc on bc.production_order_id = b.production_order_id
  join public.input_batches ib     on ib.id = bc.input_batch_id
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'input_batch' and el.target_id = ib.id

  union all
  -- Enlaces a proveedores de los lotes de entrada consumidos.
  select b.*, el.evidence_id, 'supplier_support', 'supplier',
         s.id, s.name, false
  from base b
  join public.batch_consumption bc on bc.production_order_id = b.production_order_id
  join public.input_batches ib     on ib.id = bc.input_batch_id
  join public.suppliers s          on s.id = ib.supplier_id
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'supplier' and el.target_id = s.id

  union all
  -- Enlaces directos a materiales de la composición.
  select b.*, el.evidence_id, 'other_linked_support', 'material',
         mt.id, mt.name, false
  from base b
  join public.batch_composition bcmp on bcmp.output_batch_id = b.output_batch_id
  join public.materials mt           on mt.id = bcmp.material_id
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'material' and el.target_id = mt.id

  union all
  -- Enlace al producto.
  select b.*, el.evidence_id, 'product_support', 'product',
         b.product_id, coalesce(b.product_code || ' · ', '') || coalesce(b.product_name, ''), false
  from base b
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'product' and el.target_id = b.product_id

  union all
  -- Enlace a la familia del producto.
  select b.*, el.evidence_id, 'family_support', 'product_family',
         b.family_id, b.family_name, false
  from base b
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'product_family' and el.target_id = b.family_id

  union all
  -- Evidencia de ORIGEN de materiales de la composición (sin necesidad de
  -- evidence_link): requerida para defendibilidad.
  select b.*, mt.origin_support_evidence_id, 'material_origin_support', 'material',
         mt.id, mt.name, true
  from base b
  join public.batch_composition bcmp on bcmp.output_batch_id = b.output_batch_id
  join public.materials mt           on mt.id = bcmp.material_id
  where mt.origin_support_evidence_id is not null

  union all
  -- Evidencia de RECLASIFICACIÓN de materiales de la composición: requerida.
  select b.*, mt.reclassification_evidence_id, 'material_reclassification_support', 'material',
         mt.id, mt.name, true
  from base b
  join public.batch_composition bcmp on bcmp.output_batch_id = b.output_batch_id
  join public.materials mt           on mt.id = bcmp.material_id
  where mt.reclassification_evidence_id is not null
)
select distinct
  r.organization_id,
  r.output_batch_id,
  r.output_batch_code,
  r.calculation_id,
  e.id                 as evidence_id,
  null::text           as evidence_code,      -- no existe en el esquema actual
  e.name               as evidence_title,
  e.evidence_type,
  e.status::text       as evidence_status,
  r.linked_entity_type,
  r.linked_entity_id,
  r.linked_entity_label,
  r.support_role,
  r.is_required        as is_required_for_defensibility,
  (e.status = 'valid') as is_valid_for_defensibility,
  e.created_at,
  null::timestamptz    as validated_at        -- no existe en el esquema actual
from routes r
join public.evidences e on e.id = r.evidence_id;

-- ---------------------------------------------------------------------------
-- 3.4 v_output_batch_support_gaps — una fila por brecha identificada.
-- Brechas de cálculo salen del ÚLTIMO snapshot del lote; brechas de
-- componentes, de sus filas expandidas; brechas de trazabilidad, de
-- v_output_batch_completeness; y el lote sin cálculo es una brecha en sí.
-- ---------------------------------------------------------------------------
create or replace view public.v_output_batch_support_gaps
with (security_invoker = true) as
with base as (
  select
    ob.organization_id,
    ob.id           as output_batch_id,
    ob.batch_code   as output_batch_code,
    l.calculation_id,
    l.defensibility_level,
    l.risk_flag,
    comp.traceability_status,
    comp.mass_balance_warning
  from public.output_batches ob
  left join public.v_latest_batch_recycled l on l.output_batch_id = ob.id
  left join public.v_output_batch_completeness comp on comp.output_batch_id = ob.id
)
-- 1 y 2: nivel de defendibilidad del último cálculo.
select b.organization_id, b.output_batch_id, b.output_batch_code, b.calculation_id,
  'calculation_preliminary'::text as gap_code, 'critical'::text as gap_severity,
  'Cálculo preliminar'::text as gap_label,
  'El último cálculo quedó en nivel preliminar: falta trazabilidad, consumo o toda la masa elegible quedó sin soporte.'::text as gap_description,
  'output_batch'::text as related_entity_type, b.output_batch_id as related_entity_id,
  b.output_batch_code as related_entity_label,
  'Completar asociación entre lote de salida, orden y consumos; cargar y validar soportes; recalcular después de corregir soportes.'::text as suggested_action
from base b where b.defensibility_level = 'preliminary'

union all
select b.organization_id, b.output_batch_id, b.output_batch_code, b.calculation_id,
  'calculation_with_warnings', 'warning', 'Cálculo con advertencias',
  'El último cálculo es válido pero tiene advertencias que debilitan su defendibilidad.',
  'output_batch', b.output_batch_id, b.output_batch_code,
  'Revisar las advertencias del cálculo y recalcular después de corregir soportes.'
from base b where b.defensibility_level = 'with_warnings'

-- 3: riesgo por declarado > calculado.
union all
select b.organization_id, b.output_batch_id, b.output_batch_code, b.calculation_id,
  'declared_above_calculated', 'critical', 'Declarado por encima del calculado',
  'El porcentaje declarado del producto supera al calculado: la declaración no está soportada por el cálculo.',
  'output_batch', b.output_batch_id, b.output_batch_code,
  'Revisar el porcentaje declarado del producto o corregir soportes y recalcular.'
from base b where b.risk_flag = true

-- 4 a 7: brechas por componente del último cálculo.
union all
select b.organization_id, b.output_batch_id, b.output_batch_code, b.calculation_id,
  cr.exclusion_reason,
  case cr.exclusion_reason
    when 'missing_origin_support' then 'critical'
    when 'invalid_reclassification_support' then 'critical'
    else 'warning'
  end,
  case cr.exclusion_reason
    when 'missing_origin_support' then 'Material elegible sin evidencia de origen'
    when 'origin_support_not_valid' then 'Evidencia de origen sin validar'
    when 'postindustrial_not_reclassified' then 'Postindustrial sin reclasificar'
    when 'invalid_reclassification_support' then 'Reclasificación sin soporte completo'
  end,
  case cr.exclusion_reason
    when 'missing_origin_support' then 'El material es elegible pero no tiene evidencia de soporte de origen asociada; su masa quedó fuera del numerador.'
    when 'origin_support_not_valid' then 'La evidencia de origen existe pero no está en estado válido; la masa quedó fuera del numerador.'
    when 'postindustrial_not_reclassified' then 'El material postindustrial no cuenta como reciclado sin una reclasificación soportada.'
    when 'invalid_reclassification_support' then 'La reclasificación no tiene justificación, evidencia válida o autor autorizado.'
  end,
  'material', cr.material_id, cr.material_name,
  case cr.exclusion_reason
    when 'missing_origin_support' then 'Cargar evidencia de origen y validarla; recalcular después de corregir soportes.'
    when 'origin_support_not_valid' then 'Validar la evidencia de origen (admin o calidad) y recalcular.'
    when 'postindustrial_not_reclassified' then 'Revisar clasificación del material y, si procede, reclasificar con justificación y evidencia.'
    when 'invalid_reclassification_support' then 'Completar justificación y evidencia válida de la reclasificación y recalcular.'
  end
from base b
join public.v_calculation_component_rows cr on cr.calculation_id = b.calculation_id
where cr.exclusion_reason in (
  'missing_origin_support', 'origin_support_not_valid',
  'postindustrial_not_reclassified', 'invalid_reclassification_support'
)

-- 8: balance de masa fuera de tolerancia (estado actual de la cadena).
union all
select b.organization_id, b.output_batch_id, b.output_batch_code, b.calculation_id,
  'mass_balance_out_of_tolerance', 'warning', 'Balance de masa fuera de tolerancia',
  'La masa consumida, la composición o la cantidad producida difieren más de la tolerancia.',
  'output_batch', b.output_batch_id, b.output_batch_code,
  'Revisar balance entre masa consumida, composición y cantidad producida.'
from base b where b.mass_balance_warning = true

-- 9: trazabilidad incompleta.
union all
select b.organization_id, b.output_batch_id, b.output_batch_code, b.calculation_id,
  'traceability_incomplete', 'warning', 'Trazabilidad incompleta',
  'Falta orden, consumo, composición o información de proveedor/material en la cadena del lote.',
  'output_batch', b.output_batch_id, b.output_batch_code,
  'Completar asociación entre lote de salida, orden y consumos.'
from base b where b.traceability_status = 'incomplete'

-- 10: lote sin cálculo.
union all
select b.organization_id, b.output_batch_id, b.output_batch_code, null::uuid,
  'no_calculation', 'info', 'Lote sin cálculo',
  'El lote de salida aún no tiene un cálculo de contenido reciclado.',
  'output_batch', b.output_batch_id, b.output_batch_code,
  'Registrar composición si falta y calcular el contenido reciclado del lote.'
from base b where b.calculation_id is null;
