-- 0032_guided_flow_views.sql
-- Trazaloop · Sprint 5B · Vistas del flujo guiado (security_invoker).
--
-- Estas vistas SOLO LEEN estados existentes: no recalculan contenido
-- reciclado ni tocan la metodología. Sin tablas nuevas: el flujo guiado se
-- apoya en los datos que ya existen.
--
-- Las reglas de "siguiente paso" y "readiness" están especificadas UNA sola
-- vez en lib/domain/guided-flow.ts (función pura testeable sin BD); esta
-- vista las implementa en SQL y el test de integración cruza ambas salidas
-- fila a fila para garantizar que no diverjan.

-- ---------------------------------------------------------------------------
-- 4.1 v_output_batch_readiness — una fila por lote de salida
-- ---------------------------------------------------------------------------
create or replace view public.v_output_batch_readiness
with (security_invoker = true) as
with evidence_flags as (
  -- Materiales "relevantes": componentes NO de mismo proceso cuya
  -- clasificación efectiva es elegible como reciclado. Para ellos el motor
  -- exige soporte: reclasificados → evidencia de reclasificación válida +
  -- justificación; no reclasificados → evidencia de origen válida.
  select
    bc.output_batch_id,
    coalesce(bool_and(
      case
        when m.reclassified_to_code is not null then
          m.reclassification_evidence_id is not null
          and m.reclassification_justification is not null
          and evr.status = 'valid'
        else
          m.origin_support_evidence_id is not null and evo.status = 'valid'
      end
    ) filter (where mc.eligible_as_recycled and not mc.never_counts
                and not bc.is_same_process), true) as all_required_support_valid,
    coalesce(bool_or(
      case
        when m.reclassified_to_code is not null then
          m.reclassification_evidence_id is null
          or m.reclassification_justification is null
          or evr.status in ('rejected', 'expired')
        else
          m.origin_support_evidence_id is null
          or evo.status in ('rejected', 'expired')
      end
    ) filter (where mc.eligible_as_recycled and not mc.never_counts
                and not bc.is_same_process), false) as any_support_missing,
    coalesce(bool_or(
      case
        when m.reclassified_to_code is not null then evr.status = 'pending'
        else evo.status = 'pending'
      end
    ) filter (where mc.eligible_as_recycled and not mc.never_counts
                and not bc.is_same_process), false) as any_support_pending,
    coalesce(bool_and(
      m.origin_support_evidence_id is not null and evo.status = 'valid'
    ) filter (where mc.eligible_as_recycled and not mc.never_counts
                and not bc.is_same_process
                and m.reclassified_to_code is null), true) as origin_all_valid,
    coalesce(bool_and(
      m.reclassification_evidence_id is not null
      and m.reclassification_justification is not null
      and evr.status = 'valid'
    ) filter (where m.reclassified_to_code is not null), true) as reclass_all_valid
  from public.batch_composition bc
  join public.materials m on m.id = bc.material_id
  join public.material_classifications mc
    on mc.code = coalesce(m.reclassified_to_code, m.classification_code)
  left join public.evidences evo on evo.id = m.origin_support_evidence_id
  left join public.evidences evr on evr.id = m.reclassification_evidence_id
  group by bc.output_batch_id
)
select
  ob.organization_id,
  ob.id                       as output_batch_id,
  ob.batch_code               as output_batch_code,
  ob.produced_date,
  ob.product_id,
  p.code                      as product_code,
  p.name                      as product_name,
  p.family_id,
  pf.name                     as family_name,
  ob.production_order_id,
  po.order_code               as production_order_code,
  comp.traceability_status,
  (ob.product_id is not null)          as has_product,
  (ob.production_order_id is not null) as has_production_order,
  coalesce(comp.has_consumption, false) as has_consumption,
  coalesce(comp.has_composition, false) as has_composition,
  coalesce(ef.origin_all_valid, true)   as has_valid_origin_evidence,
  coalesce(ef.reclass_all_valid, true)  as has_required_reclassification_evidence,
  coalesce(ef.any_support_pending, false) as has_pending_required_evidence,
  coalesce(ef.any_support_missing, false) as has_missing_required_evidence,
  -- Gaps de soporte derivados del último snapshot: nivel débil o riesgo.
  (l.calculation_id is not null
   and (l.defensibility_level <> 'defensible' or l.risk_flag)) as has_support_gaps,
  (l.calculation_id is not null)        as has_calculation,
  l.calculation_id                      as latest_calculation_id,
  l.recycled_percent                    as latest_recycled_percent,
  l.defensibility_level                 as latest_defensibility_level,
  l.risk_flag                           as latest_risk_flag,
  l.calculated_at                       as latest_calculated_at,
  (l.calculation_id is not null)        as has_dossier,
  -- Siguiente paso (misma cadena que lib/domain/guided-flow.ts):
  -- orden → consumo → composición → soporte faltante → soporte pendiente →
  -- calcular → (con cálculo) brechas o dossier.
  case
    when ob.production_order_id is null then 'complete_order'
    when not coalesce(comp.has_consumption, false) then 'add_consumption'
    when not coalesce(comp.has_composition, false) then 'add_composition'
    when l.calculation_id is null and coalesce(ef.any_support_missing, false) then 'add_evidence'
    when l.calculation_id is null and coalesce(ef.any_support_pending, false) then 'validate_evidence'
    when l.calculation_id is null then 'calculate'
    when l.defensibility_level <> 'defensible' or l.risk_flag then 'review_gaps'
    else 'open_dossier'
  end as next_step_code,
  case
    when ob.production_order_id is null then 'Completar orden de producción'
    when not coalesce(comp.has_consumption, false) then 'Agregar consumo'
    when not coalesce(comp.has_composition, false) then 'Registrar composición'
    when l.calculation_id is null and coalesce(ef.any_support_missing, false) then 'Cargar evidencia'
    when l.calculation_id is null and coalesce(ef.any_support_pending, false) then 'Validar evidencia'
    when l.calculation_id is null then 'Calcular contenido reciclado'
    when l.defensibility_level <> 'defensible' or l.risk_flag then 'Revisar brechas'
    else 'Ver dossier técnico'
  end as next_step_label,
  case
    when ob.production_order_id is null then '/traceability/production-orders'
    when not coalesce(comp.has_consumption, false) then '/traceability/production-orders'
    when not coalesce(comp.has_composition, false) then '/traceability/output-batches'
    when l.calculation_id is null and coalesce(ef.any_support_missing, false) then '/evidences'
    when l.calculation_id is null and coalesce(ef.any_support_pending, false) then '/evidences'
    when l.calculation_id is null then '/recycled-content/output-batches'
    when l.defensibility_level <> 'defensible' or l.risk_flag
      then '/audit-support/output-batches/' || ob.id || '/evidence-matrix'
    else '/audit-support/calculations/' || l.calculation_id
  end as next_step_href,
  case
    when ob.production_order_id is null then 'not_ready'
    when not coalesce(comp.has_consumption, false)
      or not coalesce(comp.has_composition, false) then 'needs_data'
    when l.calculation_id is null
      and (coalesce(ef.any_support_missing, false)
           or coalesce(ef.any_support_pending, false)) then 'needs_evidence'
    when l.calculation_id is null then 'ready_to_calculate'
    when l.defensibility_level <> 'defensible' or l.risk_flag then 'calculated_with_gaps'
    else 'calculated_ready'
  end as readiness_level
from public.output_batches ob
left join public.products p          on p.id = ob.product_id
left join public.product_families pf on pf.id = p.family_id
left join public.production_orders po on po.id = ob.production_order_id
left join public.v_output_batch_completeness comp on comp.output_batch_id = ob.id
left join public.v_latest_batch_recycled l        on l.output_batch_id = ob.id
left join evidence_flags ef          on ef.output_batch_id = ob.id;

-- ---------------------------------------------------------------------------
-- 4.2 v_guided_flow_dashboard — agregado por empresa para las tarjetas
-- ---------------------------------------------------------------------------
create or replace view public.v_guided_flow_dashboard
with (security_invoker = true) as
select
  o.id as organization_id,
  (select count(*) from public.input_batches ib
    where ib.organization_id = o.id)                     as input_batches_count,
  (select count(*) from public.production_orders po
    where po.organization_id = o.id)                     as production_orders_count,
  (select count(*) from public.v_output_batch_readiness r
    where r.organization_id = o.id)                      as output_batches_count,
  (select count(*) from public.v_output_batch_readiness r
    where r.organization_id = o.id
      and r.readiness_level = 'ready_to_calculate')      as output_batches_ready_to_calculate,
  (select count(*) from public.v_output_batch_readiness r
    where r.organization_id = o.id
      and not r.has_composition)                         as output_batches_without_composition,
  (select count(*) from public.v_output_batch_readiness r
    where r.organization_id = o.id
      and not r.has_consumption)                         as output_batches_without_consumption,
  (select count(*) from public.v_output_batch_readiness r
    where r.organization_id = o.id
      and r.has_pending_required_evidence)               as output_batches_with_pending_evidence,
  (select count(*) from public.v_output_batch_readiness r
    where r.organization_id = o.id and r.has_calculation) as calculated_batches_count,
  (select count(*) from public.v_output_batch_readiness r
    where r.organization_id = o.id
      and r.latest_defensibility_level = 'defensible')   as defensible_calculations_count,
  (select count(*) from public.v_output_batch_readiness r
    where r.organization_id = o.id
      and r.latest_defensibility_level = 'with_warnings') as warning_calculations_count,
  (select count(*) from public.v_output_batch_readiness r
    where r.organization_id = o.id
      and r.latest_defensibility_level = 'preliminary')  as preliminary_calculations_count,
  (select count(*) from public.v_output_batch_support_gaps g
    where g.organization_id = o.id
      and g.gap_severity = 'critical')                   as critical_gaps_count
from public.organizations o;
