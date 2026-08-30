-- ============================================================================
-- Trazaloop · QUALITY-13B1 · EL PROCESO, OBSERVABLE
-- ----------------------------------------------------------------------------
-- QUALITY-13A revisó los trece dominios y encontró exactamente UN hueco que
-- exigiera esquema: el proceso —el eje primario de integración, con veinticinco
-- tablas apuntándole— no se puede observar. Hay fuente de automatización para
-- documentos, indicadores, objetivos, casos, acciones, riesgos, controles,
-- oportunidades, competencias, desempeño, conocimiento, proveedores, clientes,
-- auditorías, hallazgos, revisión por la dirección y partes interesadas. Para
-- procesos, ninguna.
--
-- Esta migración lo arregla, y hace SOLO eso.
--
--
-- UNA FUENTE, SIN CONTRATOS DE EVENTO, Y ESO ES DELIBERADO
--
-- `quality_automation_event_contracts` traduce el sujeto de un HECHO a una
-- fuente observable. Hoy no existe ni un solo `work_event` de tipo `process.*`
-- —96 tipos catalogados y ninguno habla de procesos—, así que no hay nada que
-- traducir.
--
-- Registrar un contrato ahora sería declarar una ruta para hechos que nadie
-- emite: una promesa que no llega, exactamente el hueco que 12.2F.1 encontró
-- tarde con `ai.usage_hard_limit_reached`. Por eso la fuente admite solo
-- `schedule`. Cuando el dominio de procesos emita hechos —si los emite— se
-- añadirán el evento y su contrato juntos, en la misma migración.
--
--
-- NI UNA PLANTILLA
--
-- Las plantillas de regla son trabajo de QUALITY-13B3, que es el tramo que se
-- ocupa de la convergencia de la atención y que las medirá contra los barridos
-- heredados antes de relevarlos. Sembrar aquí «proceso sin cargo propietario»
-- sería adelantar una decisión de ese tramo sin sus comprobaciones.
--
-- Lo que B1 entrega es la SUPERFICIE: que el proceso se pueda observar y que,
-- cuando B3 escriba la primera regla, todo esté en su sitio.
--
-- No toca 0149, 0150 ni 0151. Sin DROP ... CASCADE.
-- ============================================================================


-- ============================================================================
-- 1 · EL DOMINIO, QUE NO ESTABA
-- ----------------------------------------------------------------------------
-- Sorpresa del descubrimiento: `processes` NO figura en el CHECK de dominios de
-- `quality_automation_sources`. Están los doce dominios que sí tienen fuente
-- —documentos, indicadores, objetivos, casos, acciones, riesgos, personas,
-- proveedores, clientes, auditorías, revisión por la dirección y partes
-- interesadas— y el eje primario de integración se quedó fuera desde 0129.
--
-- Se suelta el CHECK y se repone con el conjunto anterior COMPLETO más el
-- nuevo. Estrecharlo rompería filas ya escritas.
-- ============================================================================

alter table public.quality_automation_sources
  drop constraint quality_automation_sources_domain_check;
alter table public.quality_automation_sources
  add constraint quality_automation_sources_domain_check
  check (domain in ('documents', 'indicators', 'objectives', 'cases', 'actions',
                    'risks', 'people', 'suppliers', 'customer', 'audits',
                    'management_review', 'interested_parties', 'processes'));

-- Y la categoría de una regla usa el mismo vocabulario: sin esto, adoptar una
-- plantilla de proceso fallaría al instanciarla. Es exactamente el defecto que
-- 0151 descubrió con `interested_parties`, y esta vez se cierra antes.
alter table public.quality_automation_rules
  drop constraint quality_automation_rules_category_check;
alter table public.quality_automation_rules
  add constraint quality_automation_rules_category_check
  check (category in ('documents', 'indicators', 'objectives', 'cases', 'actions',
                      'risks', 'people', 'suppliers', 'customer', 'audits',
                      'management_review', 'interested_parties', 'processes',
                      'cross_domain'));


-- ============================================================================
-- 2 · LA FUENTE
-- ----------------------------------------------------------------------------
-- `has_owner_position` es cierto —un proceso tiene cargo propietario— y es lo
-- que permite que una regla avise a quien de verdad responde.
-- ============================================================================

insert into public.quality_automation_sources
  (code, domain, label, description, subject_type, deep_link,
   has_owner_position, supported_triggers, position_order)
values
  ('process', 'processes', 'Proceso',
   'Un proceso del sistema de gestión: su estado, su cargo propietario, cuándo se publicó su última revisión y cuánto trabajo abierto acumula —hallazgos, casos, riesgos e indicadores—.',
   'quality_process', '/quality/processes',
   true, array['schedule'], 22)
on conflict (code) do nothing;


-- ============================================================================
-- 3 · LOS CAMPOS OBSERVABLES
-- ----------------------------------------------------------------------------
-- Ni un campo con nombres de personas: el cargo se observa por su NOMBRE y
-- solo para poder preguntar si lo hay. Es la misma regla que 0151.
-- ============================================================================

insert into public.quality_automation_source_fields
  (source_code, field, label, data_type, allowed_operators, enum_values, unit, position_order)
values
  ('process', 'status', 'Estado', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['draft', 'active', 'retired'], null, 1),
  ('process', 'owner_position', 'Cargo propietario', 'text',
   array['is_empty', 'is_not_empty', 'equals', 'not_equals'], null, null, 2),
  ('process', 'last_revision_on', 'Última revisión publicada', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 3),
  ('process', 'current_revision', 'Número de revisión', 'number',
   array['equals', 'greater_than', 'less_than', 'gte', 'lte'], null, null, 4),
  ('process', 'pending_finding_count', 'Hallazgos sin evaluar', 'number',
   array['equals', 'greater_than', 'gte'], null, null, 5),
  ('process', 'open_case_count', 'Casos abiertos', 'number',
   array['equals', 'greater_than', 'gte'], null, null, 6),
  ('process', 'risk_count', 'Riesgos relacionados', 'number',
   array['equals', 'greater_than', 'less_than', 'gte', 'lte'], null, null, 7),
  ('process', 'indicator_count', 'Indicadores vigentes', 'number',
   array['equals', 'greater_than', 'less_than', 'gte', 'lte'], null, null, 8)
on conflict (source_code, field) do nothing;


-- ============================================================================
-- 4 · LOS SUJETOS
-- ----------------------------------------------------------------------------
-- Se reescribe `quality_automation_subjects` entera porque `create or replace`
-- no admite parches. Lo único que cambia es la rama del final; el resto es
-- exactamente la versión vigente tras 0151.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.quality_automation_subjects(p_organization_id uuid, p_source_code text, p_today date, p_limit integer DEFAULT 5000, p_subject_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(subject_id uuid, subject_label text, owner_position_id uuid, facts jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- §88 · La pertenencia se comprueba contra la SESIÓN. Para quien no es
  -- miembro no hay sujetos, igual que para una fuente inventada.
  --
  -- Y cuando NO hay sesión —el barrido programado, que entra sin usuario— la
  -- comprobación no aplica: no hay pertenencia que mirar. Quien llega hasta
  -- aquí sin sesión es el motor, que ya validó lo suyo; es el mismo patrón
  -- que usan los barridos de QUALITY-03…10 desde que existen.
  if auth.uid() is not null and not is_org_member(p_organization_id) then
    return;
  end if;

  if p_source_code = 'document_revision' then
    return query
      select rv.id, coalesce(d.code || ' · ', '') || d.title, null::uuid,
             jsonb_build_object(
               'effective_from', rv.effective_from,
               'review_due_on', rv.review_due_at::date,
               'workflow_state', rv.workflow_state)
        from trazadoc_document_revisions rv
        join trazadoc_documents d
          on d.organization_id = rv.organization_id and d.id = rv.document_id
       where rv.organization_id = p_organization_id
         and rv.workflow_state <> 'obsolete'
         and (p_subject_id is null or rv.id = p_subject_id)
       order by rv.updated_at desc
       limit p_limit;

  elsif p_source_code = 'indicator' then
    return query
      select i.indicator_id,
             coalesce(i.code || ' · ', '') || i.name,
             i.owner_position_id,
             jsonb_build_object(
               'last_evaluation', i.last_evaluation,
               'last_value', i.last_value,
               'target_value', i.target_value,
               'measurement_pending', i.measurement_pending,
               -- QUALITY-11.1 · §5 · Paridad EXACTA con el barrido de Q03: una
               -- medición pendiente cuyo periodo ya está cerrado no se reclama.
               'measurement_period_closed', quality_period_is_closed(
                 i.organization_id, i.due_period_start, i.due_period_end),
               'next_measurement_due_on', i.next_measurement_due_on,
               -- Las series, de la MÁS ANTIGUA a la más reciente. El orden
               -- importa: `consecutive_count` mira la cola y
               -- `strictly_decreasing` recorre hacia adelante.
               'evaluation_series_out_of_target', coalesce((
                 select jsonb_agg(x.fuera order by x.period_start)
                   from (select m.period_start,
                                (m.evaluation in ('not_met', 'attention')) as fuera
                           from quality_measurements m
                          where m.organization_id = i.organization_id
                            and m.indicator_id = i.indicator_id
                            and m.is_current and m.data_state = 'reported'
                          order by m.period_start desc limit 12) x), '[]'::jsonb),
               'value_series', coalesce((
                 select jsonb_agg(x.value order by x.period_start)
                   from (select m.period_start, m.value
                           from quality_measurements m
                          where m.organization_id = i.organization_id
                            and m.indicator_id = i.indicator_id
                            and m.is_current and m.data_state = 'reported'
                            and m.value is not null
                          order by m.period_start desc limit 12) x), '[]'::jsonb))
        from v_quality_indicator_status i
       where i.organization_id = p_organization_id
         and i.admin_state = 'active'
         and (p_subject_id is null or i.indicator_id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'objective' then
    return query
      select o.objective_id,
             coalesce(o.code || ' · ', '') || o.name,
             o.owner_position_id,
             jsonb_build_object(
               'indicators_without_data', o.indicators_without_data,
               'indicators_not_met', o.indicators_not_met,
               'admin_state', o.admin_state,
               'period_end', o.period_end)
        from v_quality_objective_performance o
       where o.organization_id = p_organization_id
         and (p_subject_id is null or o.objective_id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'case' then
    return query
      select c.case_id, c.code || ' · ' || c.title, c.owner_position_id,
             jsonb_build_object(
               'status', c.status,
               'classification', c.classification,
               'detected_on', c.detected_on,
               'open_action_count', c.open_action_count)
        from v_work_case_overview c
       where c.organization_id = p_organization_id
         and (p_subject_id is null or c.case_id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'action' then
    return query
      select a.id, a.code || ' · ' || a.title, a.owner_position_id,
             jsonb_build_object(
               'due_on', a.due_on,
               'status', a.status,
               'effectiveness_result', a.effectiveness_result,
               'completed_on', a.completed_on,
               'action_kind', a.action_kind,
               -- QUALITY-11.1 · §6 · Paridad EXACTA con el barrido de Q04: la
               -- eficacia solo se reclama si la acción la exige.
               'requires_effectiveness', a.requires_effectiveness)
        from work_actions a
       where a.organization_id = p_organization_id
         and (p_subject_id is null or a.id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'risk' then
    return query
      select r.id, r.code || ' · ' || r.title, r.owner_position_id,
             jsonb_build_object(
               'next_review_on', r.next_review_on,
               'current_level', r.current_level,
               'current_is_acceptable', r.current_is_acceptable,
               'treatment_status', r.treatment_status,
               'treatment_review_on', (
                 select tp.review_on from quality_risk_treatment_plans tp
                  where tp.organization_id = r.organization_id and tp.id = r.treatment_plan_id),
               'overdue_action_count', r.overdue_action_count)
        from v_quality_risk_overview r
       where r.organization_id = p_organization_id
         and r.status <> 'closed'
         and (p_subject_id is null or r.id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'control' then
    return query
      select c.id, c.code || ' · ' || c.title, c.owner_position_id,
             jsonb_build_object(
               'status', c.status,
               'last_verified_on', (
                 select max(v.reviewed_on) from quality_control_effectiveness_reviews v
                  where v.organization_id = c.organization_id and v.control_id = c.id))
        from quality_controls c
       where c.organization_id = p_organization_id
         and c.status <> 'retired'
         and (p_subject_id is null or c.id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'opportunity' then
    return query
      select o.id, o.code || ' · ' || o.title, o.owner_position_id,
             jsonb_build_object(
               'status', o.status,
               'treatment_decision', o.treatment_decision,
               'identified_on', o.identified_on)
        from quality_opportunities o
       where o.organization_id = p_organization_id
         and o.status not in ('closed')
         and (p_subject_id is null or o.id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'competency_evidence' then
    -- §93 · La evidencia es un objeto del SGC. La etiqueta nombra la
    -- COMPETENCIA, no a la persona: aquí no se puntúa a nadie.
    return query
      select e.id,
             cp.name || ' · ' || e.title,
             null::uuid,
             jsonb_build_object(
               'valid_until', e.expires_on,
               'status', e.status)
        from quality_competency_evidence e
        join quality_person_competencies pc
          on pc.organization_id = e.organization_id and pc.id = e.person_competency_id
        join quality_competencies cp
          on cp.organization_id = pc.organization_id and cp.id = pc.competency_id
       where e.organization_id = p_organization_id
         and e.expires_on is not null
         and (p_subject_id is null or e.id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'performance_evaluation' then
    return query
      select ev.id, cy.name, null::uuid,
             jsonb_build_object(
               'status', ev.status,
               'cycle_period_end', cy.period_end)
        from quality_performance_evaluations ev
        join quality_performance_cycles cy
          on cy.organization_id = ev.organization_id and cy.id = ev.cycle_id
       where ev.organization_id = p_organization_id
         and (p_subject_id is null or ev.id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'knowledge_item' then
    return query
      select k.knowledge_item_id, k.title, null::uuid,
             jsonb_build_object(
               'criticality', k.criticality,
               'holder_count', k.holder_count,
               'continuity_attention', k.continuity_attention)
        from v_quality_knowledge_continuity k
       where k.organization_id = p_organization_id
         and (p_subject_id is null or k.knowledge_item_id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'supplier_scope' then
    return query
      select s.scope_id,
             p.legal_name || ' · ' || coalesce(s.category_name, s.site_name, 'alcance'),
             p.owner_position_id,
             jsonb_build_object(
               'next_review_on', (
                 case when s.criticality_review_months is null
                        or s.last_evaluated_on is null then null
                      else (s.last_evaluated_on
                            + (s.criticality_review_months || ' months')::interval)::date
                 end),
               'criticality_label', s.criticality_label,
               'approval_status', s.decision,
               'approval_valid_until', s.decision_valid_until,
               'open_incident_count', (
                 select count(*) from quality_supplier_incidents inc
                  where inc.organization_id = s.organization_id
                    and inc.scope_id = s.scope_id and inc.status <> 'closed'))
        from v_quality_supplier_scope_status s
        join v_quality_supplier_overview p
          on p.organization_id = s.organization_id and p.profile_id = s.profile_id
       where s.organization_id = p_organization_id
         and (p_subject_id is null or s.scope_id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'customer_feedback' then
    return query
      select f.id, f.title, f.owner_position_id,
             jsonb_build_object(
               'received_on', f.received_on,
               'status', f.status,
               'feedback_kind', f.feedback_kind,
               'severity', f.severity)
        from quality_customer_feedback f
       where f.organization_id = p_organization_id
         and (p_subject_id is null or f.id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'customer_metric' then
    -- §92 · AGREGADOS. Ni una respuesta, ni un contacto, ni una invitación.
    -- El sujeto es la CAMPAÑA, y lo que se observa es su métrica.
    return query
      select s.campaign_id,
             s.definition_name || ' · ' || s.campaign_name,
             null::uuid,
             jsonb_build_object(
               'value', s.value,
               'previous_value', prev.value,
               'delta', case when prev.value is null or s.value is null then null
                             else s.value - prev.value end,
               'sample_size', s.sample_size,
               'breaks_comparability', s.breaks_comparability)
        from v_quality_metric_series s
        left join lateral (
          select p2.value from v_quality_metric_series p2
           where p2.organization_id = s.organization_id
             and p2.definition_id = s.definition_id
             and p2.comparability_key = s.comparability_key
             and p2.period_start < s.period_start
           order by p2.period_start desc limit 1) prev on true
       where s.organization_id = p_organization_id
         and (p_subject_id is null or s.campaign_id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'audit' then
    return query
      select a.audit_id, a.code || ' · ' || a.title, a.owner_position_id,
             jsonb_build_object(
               'scheduled_from', a.scheduled_from,
               'scheduled_to', a.scheduled_to,
               'status', a.status,
               'executed_to', a.executed_to,
               'report_issued', a.report_issued_at is not null)
        from v_quality_audit_overview a
       where a.organization_id = p_organization_id
         and (p_subject_id is null or a.audit_id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'audit_finding' then
    return query
      select f.id, f.code || ' · ' || left(f.statement, 80), null::uuid,
             jsonb_build_object(
               'evaluation_status', f.evaluation_status,
               'raised_on', f.raised_on,
               'proposed_classification', f.proposed_classification)
        from quality_audit_findings f
       where f.organization_id = p_organization_id
         and (p_subject_id is null or f.id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'management_review' then
    return query
      select r.review_id, r.code || ' · ' || r.title, r.owner_position_id,
             jsonb_build_object(
               'next_review_planned_on', r.next_review_planned_on,
               'period_end', r.period_end,
               'status', r.status,
               'inputs_pending', r.inputs_pending)
        from v_quality_management_review_overview r
       where r.organization_id = p_organization_id
         and (p_subject_id is null or r.review_id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'management_review_input' then
    return query
      select i.input_id,
             i.review_code || ' · ' || i.catalog_label,
             null::uuid,
             jsonb_build_object(
               'state', i.state,
               'input_mode', i.input_mode,
               -- §124 · La fuente cambió: se compara la huella guardada con la
               -- de ahora, sin sustituir nada.
               'source_updated', (
                 i.source_fingerprint is not null
                 and i.input_mode = 'automatic'
                 and i.source_fingerprint is distinct from md5(
                   coalesce(quality_mr_source_payload(
                     i.organization_id, i.catalog_code,
                     i.period_start, i.period_end, i.review_id)::text, ''))))
        from v_quality_management_review_input_status i
       where i.organization_id = p_organization_id
         and i.review_status not in ('closed', 'cancelled')
         and (p_subject_id is null or i.input_id = p_subject_id)
       limit p_limit;

  -- ==========================================================================
  -- QUALITY-12.3B3B · PARTES INTERESADAS · TRES SUJETOS OBSERVABLES
  -- --------------------------------------------------------------------------
  -- Tres y no uno, porque el patrón de esta funcion es UNA FUENTE POR SUJETO
  -- OBSERVABLE, no una por dominio: `risks` ya tiene riesgo, control y
  -- oportunidad; `people` tiene tres; `customer` tiene dos. Lo que se observa
  -- aqui son cosas distintas —la parte, su requisito y su estrategia—, con
  -- campos distintos y titulares distintos, y meterlas en una sola fuente
  -- obligaria a inventar un `tipo` dentro de los hechos y a que cada regla
  -- empezara filtrando por el.
  -- ==========================================================================
  elsif p_source_code = 'interested_party' then
    return query
      select a.id,
             coalesce(nullif(trim(ep.trade_name), ''), ep.legal_name, g.name,
                      'Parte interesada'),
             a.owner_position_id,
             jsonb_build_object(
               'relevance_status', a.relevance_status,
               'category', c.name,
               'assessed_on', a.assessed_on,
               -- Estrategias VIGENTES. Una cerrada no gestiona nada.
               'active_strategy_count', (
                 select count(*) from quality_stakeholder_strategies s
                  where s.organization_id = a.organization_id
                    and s.assessment_id = a.id and s.status = 'active'
                    and s.effective_from <= p_today
                    and (s.effective_to is null or s.effective_to > p_today)),
               'relevant_requirement_count', (
                 select count(*) from quality_stakeholder_requirements r
                  where r.organization_id = a.organization_id
                    and r.assessment_id = a.id and r.entry_kind = 'requirement'
                    and r.relevance_status = 'relevant'
                    and r.effective_from <= p_today
                    and (r.effective_to is null or r.effective_to > p_today)),
               -- Requisitos pertinentes que no se atienden en ningun proceso.
               'requirements_without_process', (
                 select count(*) from quality_stakeholder_requirements r
                  where r.organization_id = a.organization_id
                    and r.assessment_id = a.id and r.entry_kind = 'requirement'
                    and r.relevance_status = 'relevant'
                    and r.effective_from <= p_today
                    and (r.effective_to is null or r.effective_to > p_today)
                    and not exists (
                      select 1 from quality_stakeholder_requirement_processes rp
                       where rp.organization_id = r.organization_id
                         and rp.requirement_id = r.id
                         and rp.effective_from <= p_today
                         and (rp.effective_to is null or rp.effective_to > p_today))))
        from quality_stakeholder_assessments a
        join quality_stakeholder_categories c
          on c.organization_id = a.organization_id and c.id = a.category_id
        left join quality_external_parties ep
          on ep.organization_id = a.organization_id and ep.id = a.external_party_id
        left join quality_stakeholder_groups g
          on g.organization_id = a.organization_id and g.id = a.stakeholder_group_id
       where a.organization_id = p_organization_id
         -- Solo lo VIGENTE. Un analisis sucedido ya no describe nada que
         -- haya que atender hoy, y observarlo abriria senales sobre el pasado.
         and a.effective_from <= p_today
         and (a.effective_to is null or a.effective_to > p_today)
         and (p_subject_id is null or a.id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'interested_party_requirement' then
    return query
      select r.id,
             coalesce(nullif(trim(ep.trade_name), ''), ep.legal_name, g.name, 'Parte')
               || ' · ' || r.title,
             a.owner_position_id,
             jsonb_build_object(
               'entry_kind', r.entry_kind,
               'requirement_kind', r.requirement_kind,
               'relevance_status', r.relevance_status,
               'effective_from', r.effective_from,
               'linked_process_count', (
                 select count(*) from quality_stakeholder_requirement_processes rp
                  where rp.organization_id = r.organization_id
                    and rp.requirement_id = r.id
                    and rp.effective_from <= p_today
                    and (rp.effective_to is null or rp.effective_to > p_today)))
        from quality_stakeholder_requirements r
        join quality_stakeholder_assessments a
          on a.organization_id = r.organization_id and a.id = r.assessment_id
        left join quality_external_parties ep
          on ep.organization_id = a.organization_id and ep.id = a.external_party_id
        left join quality_stakeholder_groups g
          on g.organization_id = a.organization_id and g.id = a.stakeholder_group_id
       where r.organization_id = p_organization_id
         and r.effective_from <= p_today
         and (r.effective_to is null or r.effective_to > p_today)
         and a.effective_from <= p_today
         and (a.effective_to is null or a.effective_to > p_today)
         and (p_subject_id is null or r.id = p_subject_id)
       limit p_limit;

  elsif p_source_code = 'interested_party_strategy' then
    return query
      select s.id,
             coalesce(nullif(trim(ep.trade_name), ''), ep.legal_name, g.name, 'Parte')
               || ' · ' || s.title,
             s.owner_position_id,
             jsonb_build_object(
               'status', s.status,
               'next_review_on', s.next_review_on,
               'last_reviewed_on', s.last_reviewed_on,
               'monitoring_method', s.monitoring_method,
               -- El CARGO, por su nombre. `is_empty` sobre esto es «nadie
               -- responde de esto», que es lo que se quiere poder observar.
               'owner_position', pos.name,
               'requirement_count', (
                 select count(*) from quality_stakeholder_strategy_requirements sr
                  where sr.organization_id = s.organization_id
                    and sr.strategy_id = s.id
                    and sr.effective_from <= p_today
                    and (sr.effective_to is null or sr.effective_to > p_today)))
        from quality_stakeholder_strategies s
        join quality_stakeholder_assessments a
          on a.organization_id = s.organization_id and a.id = s.assessment_id
        left join quality_positions pos
          on pos.organization_id = s.organization_id and pos.id = s.owner_position_id
        left join quality_external_parties ep
          on ep.organization_id = a.organization_id and ep.id = a.external_party_id
        left join quality_stakeholder_groups g
          on g.organization_id = a.organization_id and g.id = a.stakeholder_group_id
       where s.organization_id = p_organization_id
         and s.effective_from <= p_today
         and (s.effective_to is null or s.effective_to > p_today)
         and (p_subject_id is null or s.id = p_subject_id)
       limit p_limit;


  -- ==========================================================================
  -- QUALITY-13B1 · EL PROCESO, OBSERVABLE
  -- --------------------------------------------------------------------------
  -- El unico hueco de nivel de esquema que QUALITY-13A dio por seguro. Sin esta
  -- rama no se puede escribir «proceso sin cargo propietario» ni «proceso con
  -- hallazgos abiertos», aunque el dato exista desde el primer sprint.
  --
  -- Solo procesos VIVOS: uno retirado no hay que atenderlo, y observarlo
  -- abriria senales sobre algo que la empresa ya decidio dejar atras.
  -- ==========================================================================
  elsif p_source_code = 'process' then
    return query
      select p.id,
             coalesce(nullif(p.code, '') || ' · ', '') || p.name,
             p.owner_position_id,
             jsonb_build_object(
               'status', p.status,
               'owner_position', pos.name,
               'current_revision', p.current_revision,
               -- La fecha de la ultima revision PUBLICADA. Sin revision
               -- publicada es null, y `is_empty` lo dice: no se inventa una.
               'last_revision_on', (
                 select max(r.effective_from) from quality_process_revisions r
                  where r.organization_id = p.organization_id
                    and r.process_id = p.id and r.status = 'published'),
               -- Un hallazgo «abierto» es uno SIN evaluar: la columna es
               -- `evaluation_status`, y sus estados son pendiente, evaluado,
               -- descartado y escalado. No hay «closed» y no se inventa.
               'pending_finding_count', (
                 select count(*) from quality_audit_findings f
                  where f.organization_id = p.organization_id
                    and f.process_id = p.id and f.evaluation_status = 'pending'),
               'open_case_count', (
                 select count(*) from work_case_processes cp
                  join work_cases c on c.organization_id = cp.organization_id
                                   and c.id = cp.case_id
                  where cp.organization_id = p.organization_id
                    and cp.process_id = p.id and c.status <> 'closed'),
               'risk_count', (
                 select count(*) from quality_risk_processes rp
                  where rp.organization_id = p.organization_id
                    and rp.process_id = p.id),
               'indicator_count', (
                 select count(*) from quality_indicators i
                  where i.organization_id = p.organization_id
                    and i.scope_process_id = p.id
                    and i.admin_state = 'active'))
        from quality_processes p
        left join quality_positions pos
          on pos.organization_id = p.organization_id and pos.id = p.owner_position_id
       where p.organization_id = p_organization_id
         and p.status <> 'retired'
         and (p_subject_id is null or p.id = p_subject_id)
       limit p_limit;

  end if;

  return;
end;
$function$;

revoke all on function public.quality_automation_subjects(uuid, text, date, integer, uuid)
  from public, anon;
grant execute on function public.quality_automation_subjects(uuid, text, date, integer, uuid)
  to authenticated;


-- ============================================================================
-- 5 · LAS SALIDAS PUEDEN HABLAR DE UN PROCESO
-- ----------------------------------------------------------------------------
-- La lección de 0151, aplicada antes de que duela: sin ampliar estos dos CHECK,
-- la primera regla que alguien adopte sobre procesos fallaría DENTRO del
-- ejecutor, con la condición ya evaluada y la señal ya escrita. Se amplía ahora
-- aunque la primera regla llegue en B3.
--
-- `quality_signals` no tiene CHECK de sujeto: no hace falta tocarla.
-- ============================================================================

alter table public.work_alerts drop constraint work_alerts_subject_type_check;
alter table public.work_alerts add constraint work_alerts_subject_type_check
  check (subject_type in ('trazadoc_document', 'quality_indicator', 'quality_objective',
    'work_case', 'work_action', 'quality_risk', 'quality_opportunity', 'quality_control',
    'quality_person', 'quality_position', 'quality_person_competency',
    'quality_competency_evidence', 'quality_development_plan_item',
    'quality_learning_activity', 'quality_performance_evaluation', 'quality_knowledge_item',
    'quality_knowledge_transfer_plan', 'quality_lesson_learned', 'quality_supplier_profile',
    'quality_supplier_scope', 'quality_supplier_evaluation', 'quality_supplier_document',
    'quality_customer_profile', 'quality_survey_campaign', 'quality_customer_feedback',
    'quality_customer_voice_review', 'quality_audit_program', 'quality_audit',
    'quality_audit_finding', 'quality_management_review', 'quality_management_review_input',
    'quality_management_review_decision', 'quality_automation_rule', 'quality_signal',
    'quality_stakeholder_assessment', 'quality_stakeholder_requirement',
    'quality_stakeholder_strategy', 'quality_process'));

alter table public.work_tasks drop constraint work_tasks_subject_type_check;
alter table public.work_tasks add constraint work_tasks_subject_type_check
  check (subject_type in ('trazadoc_document', 'quality_indicator', 'quality_objective',
    'work_case', 'work_action', 'quality_risk', 'quality_opportunity', 'quality_control',
    'quality_person', 'quality_position', 'quality_person_competency',
    'quality_competency_evidence', 'quality_development_plan_item',
    'quality_learning_activity', 'quality_performance_evaluation', 'quality_knowledge_item',
    'quality_knowledge_transfer_plan', 'quality_lesson_learned', 'quality_supplier_profile',
    'quality_supplier_scope', 'quality_supplier_evaluation', 'quality_supplier_document',
    'quality_customer_profile', 'quality_survey_campaign', 'quality_customer_feedback',
    'quality_customer_voice_review', 'quality_audit_program', 'quality_audit',
    'quality_audit_finding', 'quality_management_review', 'quality_management_review_input',
    'quality_management_review_decision', 'quality_automation_rule', 'quality_signal',
    'quality_stakeholder_assessment', 'quality_stakeholder_requirement',
    'quality_stakeholder_strategy', 'quality_process'));


-- ============================================================================
-- 6 · REVERSIÓN
-- ----------------------------------------------------------------------------
--   delete from quality_automation_source_fields where source_code = 'process';
--   delete from quality_automation_sources where code = 'process';
--   -- y los dos CHECK de dominio y categoría sin 'processes'.
--   -- y restaurar desde 0151: quality_automation_subjects
--   -- y los dos CHECK de work_alerts/work_tasks sin 'quality_process'.
-- ============================================================================
