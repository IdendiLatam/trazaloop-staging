-- 0065_implementation_next_action_support_language.sql
-- Trazaloop · Sprint 10C · Corrección final (Bloqueante 3): la fila de
-- prioridad 12 de v_implementation_next_actions (0034, Sprint 6) seguía
-- devolviendo el texto y el enlace del antiguo flujo de feedback —
-- genuinamente visibles en la tarjeta "Siguiente acción recomendada" de
-- /implementation, encontrados al agregar un patrón de compliance nuevo
-- (tests/compliance) para ese lenguaje ya reemplazado.
--
-- CREATE OR REPLACE VIEW con el cuerpo EXACTO de 0034 — ni una CTE, ni
-- una regla, ni un JOIN cambia — solo el texto y el enlace de la fila 12.

create or replace view public.v_implementation_next_actions
with (security_invoker = true) as
with d as (
  select * from public.v_implementation_dashboard
),
sample_material_without_origin as (
  select distinct on (m.organization_id)
    m.organization_id, m.id, m.name
  from public.materials m
  join public.material_classifications mc
    on mc.code = coalesce(m.reclassified_to_code, m.classification_code)
  left join public.evidences ev on ev.id = m.origin_support_evidence_id
  where mc.eligible_as_recycled
    and (
      m.origin_support_evidence_id is null
      or coalesce(ev.status, 'pending') <> 'valid'
    )
  order by m.organization_id, m.created_at
),
sample_pending_evidence as (
  select distinct on (organization_id)
    organization_id, id, name
  from public.evidences
  where status = 'pending'
  order by organization_id, created_at
),
sample_order_without_consumption as (
  select distinct on (po.organization_id)
    po.organization_id, po.id, po.order_code
  from public.production_orders po
  left join public.batch_consumption bc on bc.production_order_id = po.id
  where bc.id is null
  order by po.organization_id, po.created_at
),
sample_batch_without_composition as (
  select distinct on (ob.organization_id)
    ob.organization_id, ob.id, ob.batch_code
  from public.output_batches ob
  left join public.batch_composition bcp on bcp.output_batch_id = ob.id
  where bcp.id is null
  order by ob.organization_id, ob.created_at
),
sample_ready_to_calculate as (
  select distinct on (organization_id)
    organization_id, output_batch_id, output_batch_code
  from public.v_output_batch_readiness
  where readiness_level = 'ready_to_calculate'
  order by organization_id, output_batch_code
),
sample_gap as (
  select distinct on (organization_id)
    organization_id, output_batch_id, output_batch_code
  from public.v_output_batch_support_gaps
  where gap_severity = 'critical'
  order by organization_id, output_batch_code
),
sample_defensible as (
  select distinct on (organization_id)
    organization_id, calculation_id, output_batch_code
  from public.v_latest_batch_recycled
  where defensibility_level = 'defensible'
  order by organization_id, calculated_at desc
),
-- Un booleano por regla (1-11); la regla 12 solo aplica cuando ninguna de
-- las anteriores lo hace ("si todo está avanzado").
flags as (
  select
    d.organization_id,
    (d.suppliers_count = 0)                                     as f1_no_suppliers,
    (d.suppliers_count > 0 and d.materials_count = 0)            as f2_no_materials,
    (smo.id is not null)                                         as f3_missing_origin,
    (spe.id is not null)                                         as f4_pending_evidence,
    (d.input_batches_count = 0)                                  as f5_no_input_batches,
    (d.production_orders_count = 0)                              as f6_no_orders,
    (sow.id is not null)                                         as f7_order_without_consumption,
    (sbw.id is not null)                                         as f8_batch_without_composition,
    (srtc.output_batch_id is not null)                           as f9_ready_to_calculate,
    (sg.output_batch_id is not null)                             as f10_critical_gap,
    (sdef.calculation_id is not null)                            as f11_defensible
  from d
  left join sample_material_without_origin smo on smo.organization_id = d.organization_id
  left join sample_pending_evidence spe         on spe.organization_id = d.organization_id
  left join sample_order_without_consumption sow on sow.organization_id = d.organization_id
  left join sample_batch_without_composition sbw on sbw.organization_id = d.organization_id
  left join sample_ready_to_calculate srtc      on srtc.organization_id = d.organization_id
  left join sample_gap sg                       on sg.organization_id = d.organization_id
  left join sample_defensible sdef              on sdef.organization_id = d.organization_id
)
select organization_id, priority, action_code, action_label, action_description,
       href, related_entity_type, related_entity_id
from (
  select d.organization_id, 1 as priority, 'create_supplier' as action_code,
    'Crear proveedor real' as action_label,
    'Aún no hay proveedores registrados. Registra el primer proveedor real de la empresa.' as action_description,
    '/catalog/suppliers' as href,
    null::text as related_entity_type, null::uuid as related_entity_id
  from flags f join d on d.organization_id = f.organization_id
  where f.f1_no_suppliers

  union all
  select d.organization_id, 2, 'create_material',
    'Crear material real',
    'Hay proveedores registrados pero aún no hay materiales con su clasificación.',
    '/catalog/materials', null, null
  from flags f join d on d.organization_id = f.organization_id
  where f.f2_no_materials

  union all
  select d.organization_id, 3, 'add_origin_evidence',
    'Cargar evidencia de origen',
    'El material "' || coalesce(s.name, '') ||
      '" es elegible como reciclado pero no tiene evidencia de origen válida.',
    '/evidences', 'material', s.id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_material_without_origin s on s.organization_id = f.organization_id
  where f.f3_missing_origin

  union all
  select d.organization_id, 4, 'validate_evidence',
    'Validar evidencia pendiente',
    'La evidencia "' || coalesce(e.name, '') || '" está pendiente de validación.',
    '/evidences', 'evidence', e.id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_pending_evidence e on e.organization_id = f.organization_id
  where f.f4_pending_evidence

  union all
  select d.organization_id, 5, 'create_input_batch',
    'Registrar lote de entrada',
    'Aún no hay lotes de entrada registrados para esta empresa.',
    '/traceability/input-batches', null, null
  from flags f join d on d.organization_id = f.organization_id
  where f.f5_no_input_batches

  union all
  select d.organization_id, 6, 'create_production_order',
    'Crear orden / corrida de producción',
    'Aún no hay órdenes / corridas de producción registradas.',
    '/traceability/production-orders', null, null
  from flags f join d on d.organization_id = f.organization_id
  where f.f6_no_orders

  union all
  select d.organization_id, 7, 'add_consumption',
    'Registrar consumo',
    'La orden / corrida "' || coalesce(o2.order_code, '') || '" aún no tiene consumos registrados.',
    '/traceability/production-orders', 'production_order', o2.id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_order_without_consumption o2 on o2.organization_id = f.organization_id
  where f.f7_order_without_consumption

  union all
  select d.organization_id, 8, 'add_composition',
    'Registrar composición',
    'El lote producido / lote final "' || coalesce(b2.batch_code, '') || '" aún no tiene composición.',
    '/traceability/output-batches', 'output_batch', b2.id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_batch_without_composition b2 on b2.organization_id = f.organization_id
  where f.f8_batch_without_composition

  union all
  select d.organization_id, 9, 'calculate_recycled_content',
    'Calcular contenido reciclado',
    'El lote producido / lote final "' || coalesce(r.output_batch_code, '') ||
      '" tiene composición registrada y está listo para calcular.',
    '/recycled-content/output-batches', 'output_batch', r.output_batch_id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_ready_to_calculate r on r.organization_id = f.organization_id
  where f.f9_ready_to_calculate

  union all
  select d.organization_id, 10, 'review_gaps',
    'Revisar brechas',
    'Hay brechas críticas abiertas en el lote "' || coalesce(g.output_batch_code, '') || '".',
    '/audit-support', 'output_batch', g.output_batch_id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_gap g on g.organization_id = f.organization_id
  where f.f10_critical_gap

  union all
  select d.organization_id, 11, 'open_dossier',
    'Ver dossier técnico',
    'Hay cálculos defendibles disponibles. Revisa el dossier del lote "' ||
      coalesce(def.output_batch_code, '') || '".',
    '/audit-support', 'calculation', def.calculation_id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_defensible def on def.organization_id = f.organization_id
  where f.f11_defensible

  -- Sprint 10C (Bloqueante 3): única fila que cambia respecto a 0034 —
  -- ahora invita a crear un ticket de soporte y enlaza a /support/new,
  -- en vez del antiguo flujo de feedback y su ruta ya reemplazada.
  union all
  select f.organization_id, 12, 'record_feedback',
    'Crear ticket de soporte',
    'Los datos, la trazabilidad y el cálculo de la empresa están avanzados. Crea un ticket de soporte con hallazgos, dudas o mejoras encontradas durante la prueba real.',
    '/support/new', null, null
  from flags f
  where not (
    f.f1_no_suppliers or f.f2_no_materials or f.f3_missing_origin
    or f.f4_pending_evidence or f.f5_no_input_batches or f.f6_no_orders
    or f.f7_order_without_consumption or f.f8_batch_without_composition
    or f.f9_ready_to_calculate or f.f10_critical_gap or f.f11_defensible
  )
) actions;
