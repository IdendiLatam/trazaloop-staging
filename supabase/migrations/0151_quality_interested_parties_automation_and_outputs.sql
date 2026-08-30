-- ============================================================================
-- Trazaloop · QUALITY-12.3B3B · PARTES INTERESADAS EN EL MOTOR QUE YA EXISTE
-- ----------------------------------------------------------------------------
-- B2 dejó cinco tipos de evento catalogados y sin contrato, y lo dijo: un
-- contrato exige una FUENTE, y la fuente es la superficie de autoría de reglas.
-- Esta migración pone la fuente y cierra el círculo.
--
--
-- TRES FUENTES, NO UNA. Y NO CINCO.
--
-- Ni una por dominio ni una por evento: el patrón de QUALITY-11 es UNA FUENTE
-- POR SUJETO OBSERVABLE. `risks` tiene tres —riesgo, control, oportunidad—,
-- `people` tiene tres y `customer` tiene dos. Aquí lo observable son tres cosas
-- distintas:
--
--   interested_party              la parte y su análisis vigente
--   interested_party_requirement  lo que obliga, y dónde se atiende
--   interested_party_strategy     lo que la empresa hace, y quién responde
--
-- Meterlas en una sola fuente obligaría a inventar un campo `tipo` dentro de
-- los hechos y a que cada regla empezara filtrando por él. Y `subject_type` de
-- una fuente es una sola columna: con tres sujetos, una fuente solo podría
-- declarar uno de los tres, y los contratos de evento —que traducen
-- `subject_type` a fuente— se quedarían sin destino para los otros dos.
--
--
-- LO QUE ESTA MIGRACIÓN NO HACE
--
-- No crea un segundo motor: extiende `quality_automation_subjects`, que es el
-- único sitio donde se materializan los hechos de una fuente, y se apoya en el
-- único ejecutor. No activa ninguna regla: siembra PLANTILLAS, que es lo que
-- la empresa adopta cuando quiere. Y no manda una sola notificación por
-- omisión: sin regla adoptada no hay señal, y sin señal no hay aviso.
--
-- No toca 0149 ni 0150. Sin DROP ... CASCADE.
-- ============================================================================


-- ============================================================================
-- 1 · EL DOMINIO, EN EL CATÁLOGO DE FUENTES
-- ----------------------------------------------------------------------------
-- El CHECK se suelta y se repone con el conjunto anterior COMPLETO más el
-- nuevo. Estrecharlo rompería filas ya escritas.
-- ============================================================================

alter table public.quality_automation_sources
  drop constraint quality_automation_sources_domain_check;
alter table public.quality_automation_sources
  add constraint quality_automation_sources_domain_check
  check (domain in ('documents', 'indicators', 'objectives', 'cases', 'actions',
                    'risks', 'people', 'suppliers', 'customer', 'audits',
                    'management_review', 'interested_parties'));


-- ============================================================================
-- 2 · LAS TRES FUENTES
-- ----------------------------------------------------------------------------
-- `supported_triggers` incluye `event` porque los cinco hechos de 0150 existen
-- y llevan el sujeto correcto. Una regla puede esperar al hecho en vez de
-- barrer todos los días, que para «cambió la pertinencia» es la diferencia
-- entre enterarse ese día o el siguiente.
-- ============================================================================

insert into public.quality_automation_sources
  (code, domain, label, description, subject_type, deep_link,
   has_owner_position, supported_triggers, position_order)
values
  ('interested_party', 'interested_parties', 'Parte interesada',
   'El análisis vigente de una parte interesada: su pertinencia, su categoría, cuántas estrategias la gestionan y cuántos de sus requisitos pertinentes no se atienden en ningún proceso.',
   'quality_stakeholder_assessment', '/quality/context/interested-parties',
   true, array['schedule', 'event'], 19),
  ('interested_party_requirement', 'interested_parties', 'Requisito de parte interesada',
   'Lo que una parte necesita, espera u obliga, con el tipo de obligación y en cuántos procesos vigentes se atiende.',
   'quality_stakeholder_requirement', '/quality/context/interested-parties',
   true, array['schedule', 'event'], 20),
  ('interested_party_strategy', 'interested_parties', 'Estrategia de relacionamiento',
   'Lo que la empresa hace con una parte interesada: su estado, su método de seguimiento, el cargo que responde y cuándo toca revisarla.',
   'quality_stakeholder_strategy', '/quality/context/interested-parties',
   true, array['schedule', 'event'], 21)
on conflict (code) do nothing;


-- ============================================================================
-- 3 · LOS CAMPOS OBSERVABLES
-- ----------------------------------------------------------------------------
-- Cada campo declara su tipo y los operadores que admite. «Método de
-- seguimiento mayor que 3» no se puede ni escribir.
--
-- Ni un campo con nombres, correos ni teléfonos: lo que se observa de una
-- parte interesada es su estado de gestión, no quién trabaja en ella.
-- ============================================================================

insert into public.quality_automation_source_fields
  (source_code, field, label, data_type, allowed_operators, enum_values, unit, position_order)
values
  ('interested_party', 'relevance_status', 'Pertinencia', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['relevant', 'not_relevant', 'under_review'], null, 1),
  ('interested_party', 'active_strategy_count', 'Estrategias vigentes', 'number',
   array['equals', 'greater_than', 'less_than', 'gte', 'lte'], null, null, 2),
  ('interested_party', 'relevant_requirement_count', 'Requisitos pertinentes', 'number',
   array['equals', 'greater_than', 'less_than', 'gte', 'lte'], null, null, 3),
  ('interested_party', 'requirements_without_process', 'Requisitos sin proceso', 'number',
   array['equals', 'greater_than', 'gte'], null, null, 4),
  ('interested_party', 'assessed_on', 'Analizada el', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 5),
  ('interested_party', 'category', 'Categoría', 'text',
   array['equals', 'not_equals', 'in', 'not_in', 'is_empty'], null, null, 6),

  ('interested_party_requirement', 'entry_kind', 'Tipo de entrada', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['need', 'expectation', 'requirement'], null, 1),
  ('interested_party_requirement', 'requirement_kind', 'Tipo de requisito', 'text',
   array['equals', 'not_equals', 'in', 'not_in', 'is_empty', 'is_not_empty'],
   array['legal', 'regulatory', 'contractual', 'standard', 'internal_commitment', 'other'],
   null, 2),
  ('interested_party_requirement', 'relevance_status', 'Pertinencia', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['relevant', 'not_relevant', 'under_review'], null, 3),
  ('interested_party_requirement', 'linked_process_count', 'Procesos relacionados', 'number',
   array['equals', 'greater_than', 'less_than', 'gte', 'lte'], null, null, 4),
  ('interested_party_requirement', 'effective_from', 'Vigente desde', 'date',
   array['days_before', 'days_after'], null, null, 5),

  ('interested_party_strategy', 'status', 'Estado', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['draft', 'active', 'superseded', 'cancelled'], null, 1),
  ('interested_party_strategy', 'next_review_on', 'Próxima revisión', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 2),
  ('interested_party_strategy', 'last_reviewed_on', 'Última revisión', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 3),
  ('interested_party_strategy', 'monitoring_method', 'Método de seguimiento', 'text',
   array['equals', 'not_equals', 'in', 'not_in', 'is_empty', 'is_not_empty'],
   array['survey', 'indicator', 'periodic_evaluation', 'meeting', 'complaint',
         'sla', 'audit', 'feedback', 'regulatory_compliance', 'document', 'other'],
   null, 4),
  ('interested_party_strategy', 'owner_position', 'Cargo responsable', 'text',
   array['is_empty', 'is_not_empty', 'equals', 'not_equals'], null, null, 5),
  ('interested_party_strategy', 'requirement_count', 'Requisitos que atiende', 'number',
   array['equals', 'greater_than', 'less_than', 'gte', 'lte'], null, null, 6)
on conflict (source_code, field) do nothing;


-- ============================================================================
-- 4 · LOS SUJETOS OBSERVABLES
-- ----------------------------------------------------------------------------
-- Se reescribe `quality_automation_subjects` ENTERA porque `create or replace`
-- no admite parches. Lo único que cambia son las tres ramas del final; el
-- resto es exactamente la versión vigente de 0131.
--
-- Las tres miran SOLO lo vigente en la fecha de negocio. Observar un análisis
-- sucedido abriría señales sobre el pasado, y el pasado ya no se puede
-- atender: solo explicar.
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

  end if;

  return;
end;
$function$;

revoke all on function public.quality_automation_subjects(uuid, text, date, integer, uuid)
  from public, anon;
grant execute on function public.quality_automation_subjects(uuid, text, date, integer, uuid)
  to authenticated;


-- ============================================================================
-- 5 · LAS SALIDAS PUEDEN HABLAR DE ESTOS SUJETOS
-- ----------------------------------------------------------------------------
-- Una señal, una alerta y una tarea llevan `subject_type`. Sin ampliar estos
-- dos CHECK, la primera regla adoptada fallaría al emitir —y fallaría DENTRO
-- del ejecutor, con la condición ya evaluada—, que es la peor forma de
-- descubrirlo.
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
    'quality_stakeholder_strategy'));

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
    'quality_stakeholder_strategy'));


-- ============================================================================
-- 6 · LOS CONTRATOS DE SUJETO
-- ----------------------------------------------------------------------------
-- Lo que B2 dejó pendiente. Un evento trae `subject_type` y `subject_id`; el
-- contrato dice de qué tipo de sujeto se llega a qué fuente observable. Los
-- tres son `direct`: el hecho es sobre la misma cosa que se observa.
--
-- Con esto, los CINCO eventos de 0150 quedan enrutados:
--
--   interested_party.assessed           → quality_stakeholder_assessment
--   interested_party.relevance_changed  → quality_stakeholder_assessment
--   interested_party.review_completed   → quality_stakeholder_assessment
--   interested_party.requirement_changed→ quality_stakeholder_requirement
--   interested_party.strategy_changed   → quality_stakeholder_strategy
-- ============================================================================

insert into public.quality_automation_event_contracts (subject_type, source_code, resolver, note)
values
  ('quality_stakeholder_assessment',  'interested_party',             'direct', null),
  ('quality_stakeholder_requirement', 'interested_party_requirement', 'direct', null),
  ('quality_stakeholder_strategy',    'interested_party_strategy',    'direct', null)
on conflict (subject_type) do nothing;


-- ============================================================================
-- 7 · CINCO PLANTILLAS, NINGUNA ACTIVA
-- ----------------------------------------------------------------------------
-- Una plantilla no vigila nada: es una propuesta escrita que la empresa adopta
-- —y ajusta— si le sirve. Mientras nadie la adopte no hay regla, sin regla no
-- hay señal y sin señal no hay un solo aviso. Es el mismo criterio con el que
-- QUALITY-11 sembró las suyas, y es lo que evita que activar un módulo llene
-- la bandeja de alguien que no pidió nada.
--
-- Las cuatro primeras solo abren SEÑAL. La de revisión vencida añade aviso al
-- cargo responsable, porque una revisión que ya pasó tiene dueño conocido y
-- una señal que nadie mira no sirve. Ninguna crea tareas: quién y cuándo lo
-- decide la empresa al adoptarla.
-- ============================================================================

-- La categoría de una regla es el MISMO vocabulario cerrado que el dominio de
-- las fuentes, y el CHECK de `quality_automation_rules` lo impone al adoptar
-- una plantilla. Sin ampliarlo, adoptar cualquiera de las cinco fallaría en el
-- momento de instanciarla —no al sembrarla—, que es la peor forma de
-- descubrirlo: la plantilla se ve perfecta hasta que alguien la usa.
alter table public.quality_automation_rules
  drop constraint quality_automation_rules_category_check;
alter table public.quality_automation_rules
  add constraint quality_automation_rules_category_check
  check (category in ('documents', 'indicators', 'objectives', 'cases', 'actions',
                      'risks', 'people', 'suppliers', 'customer', 'audits',
                      'management_review', 'interested_parties', 'cross_domain'));

insert into public.quality_automation_rule_templates
  (code, name, description, category, source_code, autonomy_level, severity,
   signal_title, conditions, outputs, tunable, rationale, position_order)
values
  ('stakeholder_relevant_without_strategy',
   'Parte pertinente sin estrategia',
   'Se declaró pertinente y no hay ninguna estrategia vigente que diga qué se hace con ella.',
   'interested_parties', 'interested_party', 'A', 'warning',
   'Parte interesada pertinente sin estrategia vigente',
   '[{"field":"relevance_status","operator":"equals","value":"relevant"},
     {"field":"active_strategy_count","operator":"equals","value":0}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"}]'::jsonb,
   '[{"field":"relevance_status","label":"Pertinencias incluidas"}]'::jsonb,
   'ISO 9001:2015, 4.2 pide determinar las partes pertinentes y sus requisitos. Determinar quién importa y no decidir nada al respecto deja el 4.2 a medias.',
   19),

  ('stakeholder_requirement_without_process',
   'Requisito pertinente sin proceso',
   'Un requisito que obliga y que no se atiende en ningún proceso vigente.',
   'interested_parties', 'interested_party_requirement', 'A', 'warning',
   'Requisito pertinente sin proceso que lo atienda',
   '[{"field":"entry_kind","operator":"equals","value":"requirement"},
     {"field":"relevance_status","operator":"equals","value":"relevant"},
     {"field":"linked_process_count","operator":"equals","value":0}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"}]'::jsonb,
   '[{"field":"relevance_status","label":"Pertinencias incluidas"}]'::jsonb,
   'Un requisito pertinente que no está en ningún proceso no tiene dónde cumplirse. Se relaciona con 4.4 —los procesos del sistema— y con 8.2, cuando el requisito viene de un cliente.',
   20),

  ('stakeholder_strategy_review_overdue',
   'Revisión de estrategia vencida',
   'La estrategia tenía fecha prevista de revisión y ya pasó.',
   'interested_parties', 'interested_party_strategy', 'A', 'warning',
   'Estrategia de relacionamiento con la revisión vencida',
   '[{"field":"status","operator":"equals","value":"active"},
     {"field":"next_review_on","operator":"days_after","value":0}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"subject_owner_position"}]'::jsonb,
   '[{"field":"next_review_on","label":"Días de margen"}]'::jsonb,
   'Solo mira las que TIENEN fecha prevista: sin fecha no hay nada vencido, y la cadencia la decide la empresa. Se relaciona con 9.3, que revisa los cambios en las partes interesadas.',
   21),

  ('stakeholder_strategy_without_owner',
   'Estrategia sin cargo responsable',
   'Una estrategia vigente que nadie tiene asignada.',
   'interested_parties', 'interested_party_strategy', 'A', 'info',
   'Estrategia de relacionamiento sin cargo responsable',
   '[{"field":"status","operator":"equals","value":"active"},
     {"field":"owner_position","operator":"is_empty","value":null}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"}]'::jsonb,
   '[]'::jsonb,
   'La responsabilidad es del CARGO, no de una persona. Se relaciona con 5.3, que pide asignar responsabilidades y autoridades.',
   22),

  ('stakeholder_strategy_without_monitoring',
   'Estrategia sin método de seguimiento',
   'Una estrategia vigente sin manera declarada de saber si funciona.',
   'interested_parties', 'interested_party_strategy', 'A', 'info',
   'Estrategia de relacionamiento sin método de seguimiento',
   '[{"field":"status","operator":"equals","value":"active"},
     {"field":"monitoring_method","operator":"is_empty","value":null}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"}]'::jsonb,
   '[]'::jsonb,
   'El método puede ser cualquiera de los once del dominio, y ninguno es obligatorio; lo que no se sostiene es gestionar sin saber cómo se comprueba. Se relaciona con 9.1, seguimiento y medición.',
   23)
on conflict (code) do nothing;


-- ============================================================================
-- 8 · REVERSIÓN
-- ----------------------------------------------------------------------------
--   delete from quality_automation_rule_templates where source_code like 'interested_party%';
--   delete from quality_automation_event_contracts where source_code like 'interested_party%';
--   delete from quality_automation_source_fields where source_code like 'interested_party%';
--   delete from quality_automation_sources where code like 'interested_party%';
--   -- y restaurar desde 0131: quality_automation_subjects
--   -- y los dos CHECK de work_alerts/work_tasks sin los tres sujetos nuevos.
--
-- Borrar una plantilla NO borra las reglas que alguien haya adoptado a partir
-- de ella: son suyas desde que las adoptó.
-- ============================================================================
