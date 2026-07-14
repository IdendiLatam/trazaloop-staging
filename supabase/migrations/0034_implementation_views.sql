-- 0034_implementation_views.sql
-- Trazaloop · Sprint 6 · Vistas de implementación (security_invoker: la RLS
-- de las tablas base aplica con la identidad de quien consulta).
--
-- REGLA CENTRAL (igual que 0031/0032): estas vistas SOLO CUENTAN Y RESUMEN
-- lo que ya existe. No recalculan contenido reciclado, no crean datos, no
-- simulan un caso piloto. Reutilizan v_guided_flow_dashboard,
-- v_output_batch_readiness, v_output_batch_support_gaps y
-- v_latest_batch_recycled en vez de repetir su lógica.

-- ---------------------------------------------------------------------------
-- 5.1 v_implementation_dashboard — una fila por organización con el avance
-- de datos reales, evidencias, trazabilidad, cálculo y feedback.
-- ---------------------------------------------------------------------------
create or replace view public.v_implementation_dashboard
with (security_invoker = true) as
with suppliers_agg as (
  select organization_id, count(*) as suppliers_count
  from public.suppliers
  group by organization_id
),
materials_agg as (
  select
    m.organization_id,
    count(*) as materials_count,
    count(*) filter (where mc.eligible_as_recycled) as recycled_materials_count,
    count(*) filter (
      where mc.eligible_as_recycled
        and (
          m.origin_support_evidence_id is null
          or coalesce(ev.status, 'pending') <> 'valid'
        )
    ) as materials_without_origin_support_count
  from public.materials m
  join public.material_classifications mc
    on mc.code = coalesce(m.reclassified_to_code, m.classification_code)
  left join public.evidences ev on ev.id = m.origin_support_evidence_id
  group by m.organization_id
),
evidences_agg as (
  select
    organization_id,
    count(*) as evidences_count,
    count(*) filter (where status = 'valid')   as valid_evidences_count,
    count(*) filter (where status = 'pending') as pending_evidences_count
  from public.evidences
  group by organization_id
),
input_batches_agg as (
  select organization_id, count(*) as input_batches_count
  from public.input_batches
  group by organization_id
),
production_orders_agg as (
  select organization_id, count(*) as production_orders_count
  from public.production_orders
  group by organization_id
),
output_batches_agg as (
  select organization_id, count(*) as output_batches_count
  from public.output_batches
  group by organization_id
),
composition_agg as (
  select organization_id, count(distinct output_batch_id) as output_batches_with_composition_count
  from public.batch_composition
  group by organization_id
),
feedback_agg as (
  select
    organization_id,
    count(*) filter (where status in ('open', 'in_review')) as open_feedback_count,
    count(*) filter (
      where severity = 'critical' and status in ('open', 'in_review')
    ) as critical_feedback_count
  from public.implementation_feedback
  group by organization_id
)
select
  o.id as organization_id,
  coalesce(sup.suppliers_count, 0)                                    as suppliers_count,
  coalesce(mat.materials_count, 0)                                    as materials_count,
  coalesce(mat.recycled_materials_count, 0)                           as recycled_materials_count,
  coalesce(mat.materials_without_origin_support_count, 0)             as materials_without_origin_support_count,
  coalesce(evd.evidences_count, 0)                                    as evidences_count,
  coalesce(evd.valid_evidences_count, 0)                              as valid_evidences_count,
  coalesce(evd.pending_evidences_count, 0)                            as pending_evidences_count,
  coalesce(ib.input_batches_count, 0)                                 as input_batches_count,
  coalesce(po.production_orders_count, 0)                             as production_orders_count,
  coalesce(ob.output_batches_count, 0)                                as output_batches_count,
  coalesce(cmp.output_batches_with_composition_count, 0)              as output_batches_with_composition_count,
  coalesce(gf.calculated_batches_count, 0)                            as calculated_output_batches_count,
  coalesce(gf.defensible_calculations_count, 0)                       as defensible_calculations_count,
  coalesce(gf.warning_calculations_count, 0)                          as warning_calculations_count,
  coalesce(gf.preliminary_calculations_count, 0)                      as preliminary_calculations_count,
  coalesce(gf.critical_gaps_count, 0)                                 as critical_gaps_count,
  coalesce(fb.open_feedback_count, 0)                                 as open_feedback_count,
  coalesce(fb.critical_feedback_count, 0)                             as critical_feedback_count
from public.organizations o
left join suppliers_agg sup         on sup.organization_id = o.id
left join materials_agg mat         on mat.organization_id = o.id
left join evidences_agg evd         on evd.organization_id = o.id
left join input_batches_agg ib      on ib.organization_id = o.id
left join production_orders_agg po  on po.organization_id = o.id
left join output_batches_agg ob     on ob.organization_id = o.id
left join composition_agg cmp       on cmp.organization_id = o.id
left join public.v_guided_flow_dashboard gf on gf.organization_id = o.id
left join feedback_agg fb           on fb.organization_id = o.id;

-- ---------------------------------------------------------------------------
-- 5.2 v_implementation_next_actions — recomendaciones priorizadas por
-- organización. Puede devolver varias filas por empresa (una por categoría
-- de brecha vigente); la de mayor prioridad (menor número) es la
-- "siguiente acción recomendada" de la pantalla de Implementación.
-- Solo recomienda: nunca crea filas en otras tablas.
-- ---------------------------------------------------------------------------
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

  union all
  select f.organization_id, 12, 'record_feedback',
    'Registrar feedback de la prueba',
    'Los datos, la trazabilidad y el cálculo de la empresa están avanzados. Registra hallazgos, dudas o mejoras encontradas durante la prueba real.',
    '/implementation/feedback', null, null
  from flags f
  where not (
    f.f1_no_suppliers or f.f2_no_materials or f.f3_missing_origin
    or f.f4_pending_evidence or f.f5_no_input_batches or f.f6_no_orders
    or f.f7_order_without_consumption or f.f8_batch_without_composition
    or f.f9_ready_to_calculate or f.f10_critical_gap or f.f11_defensible
  )
) actions;
