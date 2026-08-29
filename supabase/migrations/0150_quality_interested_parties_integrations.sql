-- ============================================================================
-- Trazaloop Quality · QUALITY-12.3B2 · PARTES INTERESADAS · INTEGRACIONES
-- ----------------------------------------------------------------------------
-- 0149 dejo la fundacion relacional. Esta migracion la conecta con lo que ya
-- existe, y NO crea ni una tabla nueva: son filas de catalogo, ampliaciones de
-- CHECK y las funciones que escriben historia.
--
-- Cuatro conexiones:
--
--   1 · EVENTOS. `work_events` tiene tres CHECK cerrados —dominio, tipo y
--       sujeto—. Se amplian con el vocabulario del dominio, siguiendo la
--       convencion real: dominio en singular, tipo `<nombre>.<participio>`.
--
--   2 · REFERENCIAS PERIFERICAS. `work_references` enlaza lo que ya tiene
--       motor: indicadores, objetivos, riesgos, oportunidades, acciones,
--       campanas, evaluaciones y documentos. Ampliar sus dos CHECK no basta:
--       `work_reference_must_be_valid` resuelve la empresa de cada tipo con un
--       CASE, y un tipo que no este ahi falla con «el propietario no existe».
--
--   3 · REVISION POR LA DIRECCION. Una fila de catalogo y su constructor. No
--       hay informe paralelo: la entrada se prepara y se refresca con la
--       maquinaria de 0128.
--
--   4 · LAS MUTACIONES QUE CREAN HISTORIA. Suceder un analisis y registrar una
--       revision son RPC, no escrituras sueltas: comprueban rol, cierran la
--       vigencia anterior, escriben la nueva y emiten el evento EN EL MISMO
--       ACTO. Es el patron de 0125 y 0128, y es lo que hace que un reintento
--       no duplique nada.
--
-- Las relaciones CORE —requisito→proceso y estrategia→requisito— NO se tocan:
-- siguen siendo tablas con clave foranea, y `work_references` no las conoce.
-- ============================================================================


-- ============================================================================
-- 1 · EL VOCABULARIO DE EVENTOS
-- ----------------------------------------------------------------------------
-- CINCO eventos, no seis. El sexto candidato de 12.3A —«revision vencida»— es
-- un evento de BARRIDO, como `indicator.measurement_due` o `action.overdue`:
-- lo emite un escaner periodico, no una mutacion. B2 no trae ejecutor, asi que
-- congelarlo ahora seria registrar un tipo que nadie puede emitir. Queda
-- diferido con su regla candidata escrita.
--
-- Los nombres siguen la convencion comprobada en el catalogo: dominio en
-- singular (`risk`, `supplier`, `audit`) y tipo en participio
-- (`risk.reviewed`, `supplier.evaluated`).
-- ============================================================================

alter table public.work_events drop constraint work_events_source_domain_check;
alter table public.work_events add constraint work_events_source_domain_check
  check (source_domain = any (array[
    'action', 'ai', 'audit', 'automation', 'case', 'competence', 'control',
    'customer', 'development', 'document', 'indicator', 'interested_party',
    'knowledge', 'learning', 'lesson', 'management_review', 'objective',
    'opportunity', 'performance', 'person', 'position', 'risk', 'supplier']));

alter table public.work_events drop constraint work_events_subject_type_check;
alter table public.work_events add constraint work_events_subject_type_check
  check (subject_type = any (array[
    'trazadoc_document', 'quality_indicator', 'quality_objective', 'work_case',
    'work_action', 'quality_risk', 'quality_opportunity', 'quality_control',
    'quality_person', 'quality_position', 'quality_person_competency',
    'quality_competency_evidence', 'quality_development_plan_item',
    'quality_learning_activity', 'quality_performance_evaluation',
    'quality_knowledge_item', 'quality_knowledge_transfer_plan',
    'quality_lesson_learned', 'quality_supplier_profile', 'quality_supplier_scope',
    'quality_supplier_evaluation', 'quality_supplier_document',
    'quality_customer_profile', 'quality_survey_campaign', 'quality_customer_feedback',
    'quality_customer_voice_review', 'quality_audit_program', 'quality_audit',
    'quality_audit_finding', 'quality_management_review',
    'quality_management_review_input', 'quality_management_review_decision',
    'quality_automation_rule', 'quality_signal', 'organization',
    'quality_stakeholder_assessment', 'quality_stakeholder_requirement',
    'quality_stakeholder_strategy']));

-- El CHECK del tipo se llama `work_events_type_check`, no
-- `work_events_event_type_check`: se comprobo contra `pg_constraint` antes de
-- escribirlo, porque un `drop constraint` con el nombre supuesto falla y deja
-- la migracion a medias.
alter table public.work_events drop constraint work_events_type_check;
alter table public.work_events add constraint work_events_type_check
  check (event_type = any (array[
    'action.completed', 'action.overdue', 'action.planned', 'action.verified',
    'ai.run_completed', 'ai.suggestion_accepted', 'ai.usage_threshold_reached',
    'ai.usage_hard_limit_reached', 'assignment.ended', 'assignment.started',
    'audit.cancelled', 'audit.checklist_version_published', 'audit.closed',
    'audit.conflict_detected', 'audit.executed', 'audit.finding_escalated_to_case',
    'audit.finding_evaluated', 'audit.finding_raised', 'audit.program_created',
    'audit.program_revised', 'audit.report_issued', 'audit.rescheduled',
    'audit.scheduled', 'audit.started', 'automation.rule_published',
    'automation.rule_retired', 'automation.run_completed', 'automation.signal_raised',
    'automation.signal_resolved', 'campaign.closed', 'campaign.metrics_computed',
    'campaign.opened', 'campaign.reopened', 'case.classified', 'case.closed',
    'case.opened', 'case.reopened', 'competence.assessed',
    'competence.evidence_expired', 'complaint.escalated_to_case', 'complaint.recorded',
    'control.linked', 'control.reviewed', 'development.item_planned',
    'development.need_created', 'feedback.recorded', 'indicator.attention',
    'indicator.measurement_due', 'indicator.recovered', 'indicator.source_failed',
    'indicator.target_missed',
    'interested_party.assessed', 'interested_party.relevance_changed',
    'interested_party.requirement_changed', 'interested_party.strategy_changed',
    'interested_party.review_completed',
    'knowledge.concentration_detected', 'knowledge.holder_added',
    'knowledge.holder_removed', 'knowledge.transfer_verified', 'learning.completed',
    'learning.effectiveness_reviewed', 'lesson.proposal_decided', 'lesson.published',
    'management_review.closed', 'management_review.decision_recorded',
    'management_review.input_refreshed', 'management_review.inputs_prepared',
    'management_review.minutes_issued', 'management_review.reopened',
    'objective.at_risk', 'opportunity.assessed', 'opportunity.closed',
    'opportunity.identified', 'opportunity.treated', 'performance.evaluation_closed',
    'position.version_published', 'risk.accepted', 'risk.assessed', 'risk.closed',
    'risk.identified', 'risk.materialized', 'risk.reopened', 'risk.reviewed',
    'risk.treated', 'supplier.adopted', 'supplier.approved', 'supplier.classified',
    'supplier.document_expired', 'supplier.evaluated', 'supplier.incident_recorded',
    'supplier.registered', 'supplier.reinstated', 'supplier.suspended',
    'supplier.withdrawn', 'survey.version_published', 'voice.review_closed']));

comment on constraint work_events_type_check on public.work_events is
  'QUALITY-12.3B2 · Vocabulario cerrado de eventos. Los de interested_party son CINCO: el sexto candidato, la revision vencida, es de barrido y necesita un escaner que B2 no trae.';


-- El catalogo que la automatizacion lee para ofrecer disparadores.
insert into public.quality_automation_event_catalog
  (event_type, label, domain, subject_type, description, position_order) values
  ('interested_party.assessed', 'Parte interesada analizada', 'interested_parties',
   'quality_stakeholder_assessment',
   'Se emitio un analisis de una parte interesada: quien es para la organizacion y con que prioridad.', 210),
  ('interested_party.relevance_changed', 'Cambio de pertinencia', 'interested_parties',
   'quality_stakeholder_assessment',
   'Una parte interesada entro o salio de pertinencia. Es el cambio que la direccion tiene que ver.', 211),
  ('interested_party.requirement_changed', 'Requisito de parte interesada', 'interested_parties',
   'quality_stakeholder_requirement',
   'Se registro, convirtio o retiro un requisito pertinente de una parte interesada.', 212),
  ('interested_party.strategy_changed', 'Estrategia de relacionamiento', 'interested_parties',
   'quality_stakeholder_strategy',
   'Se activo, sucedio o cancelo la estrategia con la que se gestiona una parte interesada.', 213),
  ('interested_party.review_completed', 'Revision de partes interesadas', 'interested_parties',
   'quality_stakeholder_assessment',
   'Se reviso el analisis o la estrategia. Incluye la revision que concluye que NO hay cambios.', 214)
on conflict (event_type) do nothing;

-- LOS CONTRATOS DE SUJETO NO SE REGISTRAN AQUI, Y ES DELIBERADO.
--
-- `quality_automation_event_contracts.source_code` es una clave foranea a
-- `quality_automation_sources`: un contrato exige que exista una FUENTE de
-- automatizacion con sus campos, y esa fuente es la superficie sobre la que se
-- ESCRIBEN reglas. B2 no construye reglas ni ejecutor.
--
-- Registrarlo ahora obligaria a inventar la fuente y sus campos sin una sola
-- regla que los use, y el contrato es justo lo que el motor necesita para
-- resolver el sujeto de una regla — no para emitir el evento. La emision no lo
-- necesita: es un insert en `work_events`.
--
-- Queda para la fase que traiga reglas, y es append-only.


-- ============================================================================
-- 2 · REFERENCIAS PERIFERICAS
-- ----------------------------------------------------------------------------
-- Lo que ya tiene motor se ENLAZA: indicadores, objetivos, riesgos,
-- oportunidades, acciones, casos, campanas de voz del cliente, evaluaciones de
-- proveedor y documentos. Ni una tabla de enlace por pareja.
--
-- Ampliar los dos CHECK no basta. `work_reference_must_be_valid` resuelve la
-- empresa de cada tipo con un CASE, y lo que no este ahi cae en `null` y muere
-- con «el propietario de la referencia no existe». Se anaden las dos mitades.
--
-- LAS RELACIONES CORE SIGUEN FUERA: `requirement→process` y
-- `strategy→requirement` son tablas con clave foranea y vigencia. Meterlas
-- aqui perderia las tres cosas por las que se hicieron tablas.
-- ============================================================================

alter table public.work_references drop constraint work_references_owner_kind_check;
alter table public.work_references add constraint work_references_owner_kind_check
  check (owner_kind = any (array[
    'case', 'action', 'risk', 'opportunity', 'control', 'risk_assessment',
    'person_competency', 'competency_evidence', 'knowledge_item',
    'knowledge_transfer_plan', 'lesson', 'development_need', 'learning_activity',
    'performance_evaluation', 'supplier_profile', 'supplier_scope',
    'supplier_evaluation', 'supplier_incident', 'customer_profile',
    'customer_feedback', 'survey_campaign', 'customer_voice_review',
    'audit_program', 'audit', 'audit_finding', 'management_review',
    'management_review_input', 'management_review_decision',
    'stakeholder_assessment', 'stakeholder_requirement', 'stakeholder_strategy',
    'stakeholder_review']));

alter table public.work_references drop constraint work_references_ref_kind_check;
alter table public.work_references add constraint work_references_ref_kind_check
  check (ref_kind = any (array[
    'quality_indicator', 'quality_measurement', 'quality_process',
    'quality_process_revision', 'quality_process_io', 'trazadoc_document',
    'trazadoc_document_revision', 'work_case', 'work_action', 'quality_objective',
    'quality_risk', 'quality_opportunity', 'quality_control',
    'quality_risk_assessment', 'quality_risk_materialization', 'quality_person',
    'quality_position', 'quality_competency', 'quality_person_competency',
    'quality_knowledge_item', 'quality_lesson_learned', 'quality_learning_activity',
    'quality_external_party', 'quality_supplier_profile', 'quality_supplier_scope',
    'quality_supplier_evaluation', 'quality_supplier_document',
    'quality_supplier_incident', 'quality_customer_profile',
    'quality_customer_feedback', 'quality_survey_campaign', 'quality_survey_response',
    'quality_customer_voice_review', 'quality_audit_program', 'quality_audit',
    'quality_audit_finding', 'quality_audit_evidence', 'quality_audit_criterion',
    'quality_management_review', 'quality_management_review_input',
    'quality_management_review_decision',
    'quality_stakeholder_assessment', 'quality_stakeholder_requirement',
    'quality_stakeholder_strategy']));


-- El CASE que resuelve la empresa. Se reescribe entera porque
-- `create or replace function` no admite parches; lo unico que cambia son las
-- siete ramas nuevas.
create or replace function public.work_reference_must_be_valid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org       uuid;
  v_owner_org uuid;
begin
  v_org := case new.ref_kind
    when 'quality_indicator'          then (select organization_id from quality_indicators where id = new.ref_id)
    when 'quality_measurement'        then (select organization_id from quality_measurements where id = new.ref_id)
    when 'quality_process'            then (select organization_id from quality_processes where id = new.ref_id)
    when 'quality_process_revision'   then (select organization_id from quality_process_revisions where id = new.ref_id)
    when 'quality_process_io'         then (select organization_id from quality_process_io where id = new.ref_id)
    when 'trazadoc_document'          then (select organization_id from trazadoc_documents where id = new.ref_id)
    when 'trazadoc_document_revision' then (select organization_id from trazadoc_document_revisions where id = new.ref_id)
    when 'work_case'                  then (select organization_id from work_cases where id = new.ref_id)
    when 'work_action'                then (select organization_id from work_actions where id = new.ref_id)
    when 'quality_objective'          then (select organization_id from quality_objectives where id = new.ref_id)
    when 'quality_risk'               then (select organization_id from quality_risks where id = new.ref_id)
    when 'quality_opportunity'        then (select organization_id from quality_opportunities where id = new.ref_id)
    when 'quality_control'            then (select organization_id from quality_controls where id = new.ref_id)
    when 'quality_risk_assessment'    then (select organization_id from quality_risk_assessments where id = new.ref_id)
    when 'quality_risk_materialization' then (select organization_id from quality_risk_materializations where id = new.ref_id)
    when 'quality_person'             then (select organization_id from quality_people where id = new.ref_id)
    when 'quality_position'           then (select organization_id from quality_positions where id = new.ref_id)
    when 'quality_competency'         then (select organization_id from quality_competencies where id = new.ref_id)
    when 'quality_person_competency'  then (select organization_id from quality_person_competencies where id = new.ref_id)
    when 'quality_knowledge_item'     then (select organization_id from quality_knowledge_items where id = new.ref_id)
    when 'quality_lesson_learned'     then (select organization_id from quality_lessons_learned where id = new.ref_id)
    when 'quality_learning_activity'  then (select organization_id from quality_learning_activities where id = new.ref_id)
    when 'quality_external_party'     then (select organization_id from quality_external_parties where id = new.ref_id)
    when 'quality_supplier_profile'   then (select organization_id from quality_supplier_profiles where id = new.ref_id)
    when 'quality_supplier_scope'     then (select organization_id from quality_supplier_scopes where id = new.ref_id)
    when 'quality_supplier_evaluation' then (select organization_id from quality_supplier_evaluations where id = new.ref_id)
    when 'quality_supplier_document'  then (select organization_id from quality_supplier_documents where id = new.ref_id)
    when 'quality_supplier_incident'  then (select organization_id from quality_supplier_incidents where id = new.ref_id)
    when 'quality_customer_profile'   then (select organization_id from quality_customer_profiles where id = new.ref_id)
    when 'quality_customer_feedback'  then (select organization_id from quality_customer_feedback where id = new.ref_id)
    when 'quality_survey_campaign'    then (select organization_id from quality_survey_campaigns where id = new.ref_id)
    when 'quality_survey_response'    then (select organization_id from quality_survey_responses where id = new.ref_id)
    when 'quality_customer_voice_review' then (select organization_id from quality_customer_voice_reviews where id = new.ref_id)
    when 'quality_audit_program'      then (select organization_id from quality_audit_programs where id = new.ref_id)
    when 'quality_audit'              then (select organization_id from quality_audits where id = new.ref_id)
    when 'quality_audit_finding'      then (select organization_id from quality_audit_findings where id = new.ref_id)
    when 'quality_audit_evidence'     then (select organization_id from quality_audit_evidence where id = new.ref_id)
    when 'quality_audit_criterion'    then (select organization_id from quality_audit_criteria where id = new.ref_id)
    when 'quality_management_review'  then (select organization_id from quality_management_reviews where id = new.ref_id)
    when 'quality_management_review_input' then (select organization_id from quality_management_review_inputs where id = new.ref_id)
    when 'quality_management_review_decision' then (select organization_id from quality_management_review_decisions where id = new.ref_id)
    -- QUALITY-12.3B2 · Las tres del dominio de partes interesadas.
    when 'quality_stakeholder_assessment' then (select organization_id from quality_stakeholder_assessments where id = new.ref_id)
    when 'quality_stakeholder_requirement' then (select organization_id from quality_stakeholder_requirements where id = new.ref_id)
    when 'quality_stakeholder_strategy' then (select organization_id from quality_stakeholder_strategies where id = new.ref_id)
  end;

  if v_org is null then
    raise exception 'La referencia apunta a un registro que no existe.';
  end if;
  if v_org <> new.organization_id then
    raise exception 'La referencia apunta a un registro de otra empresa.';
  end if;

  v_owner_org := case new.owner_kind
    when 'case'                   then (select organization_id from work_cases where id = new.owner_id)
    when 'action'                 then (select organization_id from work_actions where id = new.owner_id)
    when 'risk'                   then (select organization_id from quality_risks where id = new.owner_id)
    when 'opportunity'            then (select organization_id from quality_opportunities where id = new.owner_id)
    when 'control'                then (select organization_id from quality_controls where id = new.owner_id)
    when 'risk_assessment'        then (select organization_id from quality_risk_assessments where id = new.owner_id)
    when 'person_competency'      then (select organization_id from quality_person_competencies where id = new.owner_id)
    when 'competency_evidence'    then (select organization_id from quality_competency_evidence where id = new.owner_id)
    when 'knowledge_item'         then (select organization_id from quality_knowledge_items where id = new.owner_id)
    when 'knowledge_transfer_plan' then (select organization_id from quality_knowledge_transfer_plans where id = new.owner_id)
    when 'lesson'                 then (select organization_id from quality_lessons_learned where id = new.owner_id)
    when 'development_need'       then (select organization_id from quality_development_needs where id = new.owner_id)
    when 'learning_activity'      then (select organization_id from quality_learning_activities where id = new.owner_id)
    when 'performance_evaluation' then (select organization_id from quality_performance_evaluations where id = new.owner_id)
    when 'supplier_profile'       then (select organization_id from quality_supplier_profiles where id = new.owner_id)
    when 'supplier_scope'         then (select organization_id from quality_supplier_scopes where id = new.owner_id)
    when 'supplier_evaluation'    then (select organization_id from quality_supplier_evaluations where id = new.owner_id)
    when 'supplier_incident'      then (select organization_id from quality_supplier_incidents where id = new.owner_id)
    when 'customer_profile'       then (select organization_id from quality_customer_profiles where id = new.owner_id)
    when 'customer_feedback'      then (select organization_id from quality_customer_feedback where id = new.owner_id)
    when 'survey_campaign'        then (select organization_id from quality_survey_campaigns where id = new.owner_id)
    when 'customer_voice_review'  then (select organization_id from quality_customer_voice_reviews where id = new.owner_id)
    when 'audit_program'          then (select organization_id from quality_audit_programs where id = new.owner_id)
    when 'audit'                  then (select organization_id from quality_audits where id = new.owner_id)
    when 'audit_finding'          then (select organization_id from quality_audit_findings where id = new.owner_id)
    when 'management_review'      then (select organization_id from quality_management_reviews where id = new.owner_id)
    when 'management_review_input' then (select organization_id from quality_management_review_inputs where id = new.owner_id)
    when 'management_review_decision' then (select organization_id from quality_management_review_decisions where id = new.owner_id)
    when 'stakeholder_assessment' then (select organization_id from quality_stakeholder_assessments where id = new.owner_id)
    when 'stakeholder_requirement' then (select organization_id from quality_stakeholder_requirements where id = new.owner_id)
    when 'stakeholder_strategy'   then (select organization_id from quality_stakeholder_strategies where id = new.owner_id)
    when 'stakeholder_review'     then (select organization_id from quality_stakeholder_reviews where id = new.owner_id)
  end;

  if v_owner_org is null then
    raise exception 'El propietario de la referencia no existe.';
  end if;
  if v_owner_org <> new.organization_id then
    raise exception 'El propietario de la referencia no es de esta empresa.';
  end if;

  -- LAS DOS RELACIONES CENTRALES NO ENTRAN AQUI.
  --
  -- Ampliar el vocabulario tiene un efecto que no se ve hasta que se busca:
  -- una vez que `stakeholder_strategy` es propietario valido y
  -- `quality_stakeholder_requirement` es destino valido, la pareja de los dos
  -- expresa exactamente la relacion que tiene tabla propia. Y esta tabla no
  -- tiene periodo de validez, asi que registrarla aqui perderia el «desde
  -- cuando», que es justo lo que pregunta una auditoria.
  --
  -- No es una hipotesis: la prueba W de B1 comprobaba que el vocabulario no
  -- existia, y al ampliarlo en esta misma migracion se puso roja. La respuesta
  -- correcta no era relajar la prueba, era cerrar la pareja.
  if (new.owner_kind = 'stakeholder_strategy'
      and new.ref_kind = 'quality_stakeholder_requirement')
     or (new.owner_kind = 'stakeholder_requirement'
      and new.ref_kind in ('quality_process', 'quality_process_revision')) then
    raise exception 'Esa relacion tiene tabla propia porque tiene vigencia: registrala alli, no como referencia generica.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.work_reference_must_be_valid() is
  'QUALITY-12.3B2 · Valida que ambos extremos existan y sean de la empresa. Sin FK: por eso este disparador. Ampliado con los cuatro propietarios y los tres destinos de partes interesadas.';


-- ============================================================================
-- 3 · LAS MUTACIONES QUE CREAN HISTORIA
-- ----------------------------------------------------------------------------
-- Suceder un analisis y registrar una revision no son escrituras: son actos.
-- Cierran una vigencia, abren otra y dejan constancia, y las tres cosas tienen
-- que pasar juntas o no pasar. Si se hicieran por separado y fallara la
-- segunda, quedarian dos analisis vigentes —que el indice unico rechaza— o uno
-- cerrado sin sucesor, que es peor: la parte interesada desapareceria del
-- inventario vigente sin que nadie lo decidiera.
--
-- Y el evento se emite AQUI, en el mismo acto, con `dedupe_key`: un reintento
-- por doble clic o por red no duplica nada. Es el patron de 0125 y 0128.
-- ============================================================================

create or replace function public.quality_supersede_stakeholder_assessment(
  p_assessment_id      uuid,
  p_relevance_status   text,
  p_relevance_rationale text default null,
  p_summary            text default null,
  p_priority_label     text default null,
  p_priority_score     numeric default null,
  p_priority_method_note text default null,
  p_owner_position_id  uuid default null,
  p_effective_from     date default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old   public.quality_stakeholder_assessments;
  v_new_id uuid;
  v_desde date := coalesce(p_effective_from, current_date);
  v_cambio_pertinencia boolean;
begin
  select * into v_old from public.quality_stakeholder_assessments
   where id = p_assessment_id for update;
  if not found then
    raise exception 'Ese analisis no existe.' using errcode = '23503';
  end if;
  if not quality_manages_interested_parties(v_old.organization_id) then
    raise exception 'Tu rol no permite analizar partes interesadas.' using errcode = '42501';
  end if;
  if v_old.effective_to is not null then
    raise exception 'Ese analisis ya fue sucedido. Sucede al vigente.' using errcode = '23514';
  end if;
  if v_desde < v_old.effective_from then
    raise exception 'El analisis nuevo no puede empezar antes que el que sustituye.'
      using errcode = '23514';
  end if;

  -- Primero se cierra el anterior: asi el indice unico ve el hueco y el
  -- sucesor no choca contra su propio original.
  update public.quality_stakeholder_assessments
     set effective_to = v_desde, status = 'superseded'
   where id = v_old.id;

  insert into public.quality_stakeholder_assessments (
    organization_id, category_id, subject_kind, external_party_id, stakeholder_group_id,
    assessed_on, assessed_by, owner_position_id,
    relevance_status, relevance_rationale,
    priority_label, priority_score, priority_method_note,
    summary, effective_from, supersedes_id, status
  ) values (
    v_old.organization_id, v_old.category_id, v_old.subject_kind,
    v_old.external_party_id, v_old.stakeholder_group_id,
    v_desde, auth.uid(), coalesce(p_owner_position_id, v_old.owner_position_id),
    p_relevance_status, p_relevance_rationale,
    p_priority_label, p_priority_score, p_priority_method_note,
    p_summary, v_desde, v_old.id, 'current'
  ) returning id into v_new_id;

  v_cambio_pertinencia := p_relevance_status is distinct from v_old.relevance_status;

  insert into work_events (organization_id, source_domain, event_type, subject_type,
                           subject_id, severity, summary, payload, dedupe_key, created_by)
  values (v_old.organization_id, 'interested_party', 'interested_party.assessed',
          'quality_stakeholder_assessment', v_new_id, 'info',
          'Analisis de parte interesada emitido',
          jsonb_build_object('supersedes', v_old.id, 'relevance', p_relevance_status),
          'interested_party.assessed:' || v_new_id::text, auth.uid())
  on conflict do nothing;

  if v_cambio_pertinencia then
    insert into work_events (organization_id, source_domain, event_type, subject_type,
                             subject_id, severity, summary, payload, dedupe_key, created_by)
    values (v_old.organization_id, 'interested_party', 'interested_party.relevance_changed',
            'quality_stakeholder_assessment', v_new_id,
            case when p_relevance_status = 'not_relevant' then 'warning' else 'info' end,
            'Cambio de pertinencia de una parte interesada',
            jsonb_build_object('from', v_old.relevance_status, 'to', p_relevance_status),
            'interested_party.relevance_changed:' || v_new_id::text, auth.uid())
    on conflict do nothing;
  end if;

  return v_new_id;
end;
$$;

revoke all on function public.quality_supersede_stakeholder_assessment(uuid, text, text, text, text, numeric, text, uuid, date) from public, anon;
grant execute on function public.quality_supersede_stakeholder_assessment(uuid, text, text, text, text, numeric, text, uuid, date) to authenticated;

comment on function public.quality_supersede_stakeholder_assessment is
  'QUALITY-12.3B2 · Sucede un analisis: cierra la vigencia anterior, abre la nueva y emite el evento en el mismo acto. El anterior se conserva entero.';


create or replace function public.quality_record_stakeholder_review(
  p_assessment_id   uuid default null,
  p_strategy_id     uuid default null,
  p_verdict         text default 'no_changes',
  p_note            text default null,
  p_next_review_on  date default null,
  p_owner_position_id uuid default null,
  p_reviewed_on     date default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_id      uuid;
  v_cuando  date := coalesce(p_reviewed_on, current_date);
begin
  if p_assessment_id is null and p_strategy_id is null then
    raise exception 'Una revision tiene que revisar algo: un analisis, una estrategia o los dos.'
      using errcode = '23514';
  end if;

  if p_assessment_id is not null then
    select organization_id into v_org from public.quality_stakeholder_assessments
     where id = p_assessment_id;
  else
    select organization_id into v_org from public.quality_stakeholder_strategies
     where id = p_strategy_id;
  end if;
  if v_org is null then
    raise exception 'El objeto de la revision no existe.' using errcode = '23503';
  end if;
  if not quality_manages_interested_parties(v_org) then
    raise exception 'Tu rol no permite revisar partes interesadas.' using errcode = '42501';
  end if;

  insert into public.quality_stakeholder_reviews (
    organization_id, assessment_id, strategy_id, reviewed_on, reviewed_by,
    owner_position_id, verdict, note, next_review_on
  ) values (
    v_org, p_assessment_id, p_strategy_id, v_cuando, auth.uid(),
    p_owner_position_id, p_verdict, p_note, p_next_review_on
  ) returning id into v_id;

  -- La revision actualiza el calendario de la estrategia, que es lo unico que
  -- una revision «sin cambios» puede mover. El analisis NO se toca: si no
  -- cambio nada, no hay version nueva que crear.
  if p_strategy_id is not null then
    update public.quality_stakeholder_strategies
       set last_reviewed_on = v_cuando,
           next_review_on = coalesce(
             p_next_review_on,
             case when review_cadence_months is null then next_review_on
                  else (v_cuando + (review_cadence_months || ' months')::interval)::date end)
     where id = p_strategy_id;
  end if;

  insert into work_events (organization_id, source_domain, event_type, subject_type,
                           subject_id, severity, summary, payload, dedupe_key, created_by)
  values (v_org, 'interested_party', 'interested_party.review_completed',
          'quality_stakeholder_assessment', coalesce(p_assessment_id, p_strategy_id), 'info',
          case p_verdict
            when 'no_changes' then 'Revision de partes interesadas: sin cambios'
            when 'escalated'  then 'Revision de partes interesadas: escalada'
            else 'Revision de partes interesadas con cambios' end,
          jsonb_build_object('verdict', p_verdict, 'review_id', v_id,
                             'assessment_id', p_assessment_id, 'strategy_id', p_strategy_id),
          'interested_party.review_completed:' || v_id::text, auth.uid())
  on conflict do nothing;

  return v_id;
end;
$$;

revoke all on function public.quality_record_stakeholder_review(uuid, uuid, text, text, date, uuid, date) from public, anon;
grant execute on function public.quality_record_stakeholder_review(uuid, uuid, text, text, date, uuid, date) to authenticated;

comment on function public.quality_record_stakeholder_review is
  'QUALITY-12.3B2 · PI-29 · Registra la revision, incluida la que concluye que NO hay cambios: deja constancia sin fabricar una version nueva del analisis.';


-- ============================================================================
-- 3.BIS · LOS DOS HECHOS QUE FALTABAN POR EMITIR
-- ----------------------------------------------------------------------------
-- Arriba se ampliaron cinco tipos de evento y se registraron los cinco en el
-- catalogo. Tres los emiten las dos funciones anteriores. Los otros dos
-- —`requirement_changed` y `strategy_changed`— se producen en escrituras
-- normales bajo RLS: crear un requisito, convertirlo, retirarlo, activar una
-- estrategia. Esas escrituras las hace la capa de aplicacion.
--
-- Y la capa de aplicacion NO PUEDE insertar en `work_events`: la tabla tiene
-- politica de lectura y ninguna de escritura, a proposito desde 0117. El bus
-- solo lo escribe la base.
--
-- Asi que hace falta esta funcion. Sin ella, dos tipos de evento quedarian
-- declarados en el CHECK y en el catalogo de automatizacion, visibles para
-- quien fuera a escribir una regla, y sin que nadie los produjera nunca: una
-- promesa de aviso que no llega. Es el mismo hueco que 12.2F.1 encontro con
-- `ai.usage_hard_limit_reached`, y se cierra antes de que exista, no despues.
--
-- LO QUE NO HACE
--
-- No decide. Se llama DESPUES de que la escritura haya pasado por la RLS, y
-- vuelve a comprobar que quien llama gestiona partes interesadas y que la fila
-- existe en SU empresa: `security definer` sin esas dos comprobaciones seria
-- un agujero por el que emitir eventos en empresas ajenas.
--
-- La clave de deduplicacion incluye el dia. Dos pulsaciones del mismo boton
-- producen un hecho; el mismo cambio repetido dentro del mismo dia tambien.
-- Un cambio distinto, o el mismo manana, produce el suyo, que es lo correcto:
-- son hechos distintos.
-- ============================================================================

create or replace function public.quality_emit_stakeholder_change_event(
  p_owner_kind text,
  p_owner_id   uuid,
  p_change     text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_tipo    text;
  v_sujeto  text;
  v_resumen text;
  v_id      uuid;
begin
  if p_owner_kind = 'requirement' then
    select organization_id into v_org
      from public.quality_stakeholder_requirements where id = p_owner_id;
    v_tipo   := 'interested_party.requirement_changed';
    v_sujeto := 'quality_stakeholder_requirement';
    v_resumen := 'Cambio en un requisito de parte interesada';
  elsif p_owner_kind = 'strategy' then
    select organization_id into v_org
      from public.quality_stakeholder_strategies where id = p_owner_id;
    v_tipo   := 'interested_party.strategy_changed';
    v_sujeto := 'quality_stakeholder_strategy';
    v_resumen := 'Cambio en una estrategia de relacionamiento';
  else
    raise exception 'Tipo de sujeto desconocido: %', p_owner_kind using errcode = '22023';
  end if;

  if v_org is null then
    raise exception 'Ese registro no existe.' using errcode = '23503';
  end if;
  -- La empresa sale de la FILA, no de quien llama, y luego se comprueba que
  -- quien llama tiene ese rol EN ESA empresa. Al reves seria confiable solo
  -- mientras nadie se equivocara de identificador.
  if not quality_manages_interested_parties(v_org) then
    raise exception 'Tu rol no permite gestionar partes interesadas.' using errcode = '42501';
  end if;

  insert into work_events (organization_id, source_domain, event_type, subject_type,
                           subject_id, severity, summary, payload, dedupe_key, created_by)
  values (v_org, 'interested_party', v_tipo, v_sujeto, p_owner_id, 'info', v_resumen,
          jsonb_build_object('change', p_change),
          v_tipo || ':' || p_owner_id::text || ':' || coalesce(p_change, '-')
            || ':' || current_date::text,
          auth.uid())
  on conflict do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.quality_emit_stakeholder_change_event(text, uuid, text) from public, anon;
grant execute on function public.quality_emit_stakeholder_change_event(text, uuid, text) to authenticated;

comment on function public.quality_emit_stakeholder_change_event is
  'QUALITY-12.3B2 · Emite requirement_changed y strategy_changed. Existe porque work_events no tiene politica de escritura desde 0117 y la capa de aplicacion no puede insertar ahi. Vuelve a comprobar empresa y rol: security definer sin eso emitiria en empresas ajenas.';


-- ============================================================================
-- 4 · ENTRADA DE REVISION POR LA DIRECCION
-- ----------------------------------------------------------------------------
-- Una fila de catalogo y su constructor. Sin informe paralelo: la entrada se
-- prepara y se refresca con la maquinaria de 0128, igual que las catorce que
-- ya existen.
--
-- La fila se anade AL FINAL del catalogo, no intercalada. Reordenar las
-- catorce existentes reescribiria el orden con el que se prepararon revisiones
-- ya cerradas, y esa es su acta: el sitio en el orden del dia es parte de lo
-- que se firmo.
--
-- Las revisiones YA CERRADAS no se tocan: `quality_mr_prepare_inputs` solo
-- instancia el catalogo al preparar una revision, y una cerrada no se vuelve a
-- preparar. Reescribir su retrato seria falsificarlo.
-- ============================================================================

-- El dominio tiene su propio CHECK cerrado. Se amplia, no se rodea metiendo
-- la entrada bajo un dominio ajeno: `source_domain` es lo que
-- `quality_mr_source_payload` usa para saber a quien preguntar.
alter table public.quality_management_review_input_catalog
  drop constraint quality_management_review_input_catalog_source_domain_check;
alter table public.quality_management_review_input_catalog
  add constraint quality_management_review_input_catalog_source_domain_check
  check (source_domain is null or source_domain = any (array[
    'actions', 'documents', 'system', 'customer', 'objectives', 'processes',
    'product', 'cases', 'indicators', 'audits', 'suppliers', 'people', 'risks',
    'improvement', 'interested_parties']));

insert into public.quality_management_review_input_catalog
  (code, label, description, source_domain, is_required, position_order) values
  ('interested_parties', 'Partes interesadas pertinentes y sus requisitos',
   'Quien importa para el sistema, que necesita, que de eso obliga y como se esta gestionando. Cambios de pertinencia, requisitos nuevos y retirados, y estrategias sin seguimiento.',
   'interested_parties', true, 15)
on conflict (code) do nothing;


create or replace function public.quality_mr_src_interested_parties(
  p_organization_id uuid, p_from date, p_to date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pertinentes    integer;
  v_entraron       jsonb;
  v_salieron       jsonb;
  v_req_nuevos     jsonb;
  v_req_retirados  jsonb;
  v_sin_estrategia jsonb;
  v_sin_seguimiento jsonb;
  v_revisiones     integer;
begin
  if not is_org_member(p_organization_id) then
    return null;
  end if;

  select count(*) into v_pertinentes
    from quality_stakeholder_assessments
   where organization_id = p_organization_id
     and relevance_status = 'relevant'
     and effective_from <= p_to
     and (effective_to is null or effective_to > p_to);

  -- Entraron: analisis pertinentes que empezaron DENTRO del periodo.
  select coalesce(jsonb_agg(jsonb_build_object(
           'assessment_id', a.id, 'label', quality_stakeholder_label(a.id),
           'since', a.effective_from)), '[]'::jsonb)
    into v_entraron
    from quality_stakeholder_assessments a
   where a.organization_id = p_organization_id
     and a.relevance_status = 'relevant'
     and a.effective_from between p_from and p_to;

  -- Salieron: los que pasaron a NO pertinentes en el periodo, con su motivo.
  select coalesce(jsonb_agg(jsonb_build_object(
           'assessment_id', a.id, 'label', quality_stakeholder_label(a.id),
           'since', a.effective_from, 'rationale', a.relevance_rationale)), '[]'::jsonb)
    into v_salieron
    from quality_stakeholder_assessments a
   where a.organization_id = p_organization_id
     and a.relevance_status = 'not_relevant'
     and a.effective_from between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object(
           'requirement_id', r.id, 'title', r.title, 'kind', r.requirement_kind)), '[]'::jsonb)
    into v_req_nuevos
    from quality_stakeholder_requirements r
   where r.organization_id = p_organization_id
     and r.entry_kind = 'requirement'
     and r.effective_from between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object(
           'requirement_id', r.id, 'title', r.title,
           'rationale', r.relevance_rationale)), '[]'::jsonb)
    into v_req_retirados
    from quality_stakeholder_requirements r
   where r.organization_id = p_organization_id
     and r.entry_kind = 'requirement'
     and r.effective_to between p_from and p_to;

  -- Partes pertinentes SIN estrategia vigente. No es un incumplimiento: es lo
  -- que la direccion tiene que mirar.
  select coalesce(jsonb_agg(jsonb_build_object(
           'assessment_id', a.id, 'label', quality_stakeholder_label(a.id))), '[]'::jsonb)
    into v_sin_estrategia
    from quality_stakeholder_assessments a
   where a.organization_id = p_organization_id
     and a.relevance_status = 'relevant'
     and a.effective_to is null
     and not exists (
       select 1 from quality_stakeholder_strategies s
        where s.assessment_id = a.id and s.status = 'active');

  select coalesce(jsonb_agg(jsonb_build_object(
           'strategy_id', s.id, 'title', s.title,
           'has_owner', s.owner_position_id is not null,
           'has_monitoring', s.monitoring_method is not null)), '[]'::jsonb)
    into v_sin_seguimiento
    from quality_stakeholder_strategies s
   where s.organization_id = p_organization_id
     and s.status = 'active'
     and (s.owner_position_id is null or s.monitoring_method is null);

  select count(*) into v_revisiones
    from quality_stakeholder_reviews
   where organization_id = p_organization_id
     and reviewed_on between p_from and p_to;

  return jsonb_build_object(
    -- §36 · Sin dato NO es cero. Si no hay ni una parte analizada, se dice.
    'available', v_pertinentes > 0 or jsonb_array_length(v_entraron) > 0,
    'relevant_count', v_pertinentes,
    'became_relevant', v_entraron,
    'became_not_relevant', v_salieron,
    'new_requirements', v_req_nuevos,
    'withdrawn_requirements', v_req_retirados,
    'relevant_without_strategy', v_sin_estrategia,
    'strategies_without_owner_or_monitoring', v_sin_seguimiento,
    'reviews_in_period', v_revisiones);
end;
$$;

revoke all on function public.quality_mr_src_interested_parties(uuid, date, date) from public, anon;
grant execute on function public.quality_mr_src_interested_parties(uuid, date, date) to authenticated;


-- La etiqueta legible de un sujeto, en un solo sitio: la usan el constructor
-- de la revision por la direccion y los cargadores de contexto.
create or replace function public.quality_stakeholder_label(p_assessment_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           nullif(trim(coalesce(ep.trade_name, ep.legal_name)), ''),
           nullif(trim(g.name), ''),
           'Parte interesada')
    from quality_stakeholder_assessments a
    left join quality_external_parties ep
      on ep.organization_id = a.organization_id and ep.id = a.external_party_id
    left join quality_stakeholder_groups g
      on g.organization_id = a.organization_id and g.id = a.stakeholder_group_id
   where a.id = p_assessment_id;
$$;

revoke all on function public.quality_stakeholder_label(uuid) from public, anon;
grant execute on function public.quality_stakeholder_label(uuid) to authenticated;

comment on function public.quality_stakeholder_label(uuid) is
  'QUALITY-12.3B2 · Como se llama en pantalla el sujeto de un analisis. Nombre comercial si lo hay, si no el legal, si no el del grupo. Sin datos de contacto.';


-- El despachador de 0128 resuelve el constructor por codigo. Sin esta rama, la
-- entrada nueva se prepararia con `null` y la pantalla diria «sin datos» sobre
-- un dominio que si los tiene. Se reescribe entera —`create or replace` no
-- admite parches— y lo unico que cambia es la linea de `interested_parties`.
create or replace function public.quality_mr_source_payload(
  p_organization_id uuid, p_code text, p_from date, p_to date,
  -- El valor por defecto se CONSERVA: `create or replace` no puede quitarlo, y
  -- quitarlo romperia a quien la llama con cuatro argumentos.
  p_review_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- §66 · La pertenencia se comprueba contra la SESION, no contra el
  -- argumento. Para quien no es miembro, no hay dato.
  if not is_org_member(p_organization_id) then
    return null;
  end if;

  return case p_code
    when 'previous_actions'          then quality_mr_src_previous_actions(p_organization_id, p_from, p_to, p_review_id)
    when 'changes'                   then quality_mr_src_changes(p_organization_id, p_from, p_to)
    when 'system_performance'        then quality_mr_src_system_performance(p_organization_id, p_from, p_to)
    when 'customer_voice'            then quality_mr_src_customer_voice(p_organization_id, p_from, p_to)
    when 'objectives'                then quality_mr_src_objectives(p_organization_id, p_from, p_to)
    when 'process_performance'       then quality_mr_src_process_performance(p_organization_id, p_from, p_to)
    when 'product_conformity'        then quality_mr_src_product_conformity(p_organization_id, p_from, p_to)
    when 'nonconformities_actions'   then quality_mr_src_cases(p_organization_id, p_from, p_to)
    when 'monitoring_results'        then quality_mr_src_monitoring(p_organization_id, p_from, p_to)
    when 'audits'                    then quality_mr_src_audits(p_organization_id, p_from, p_to)
    when 'supplier_performance'      then quality_mr_src_suppliers(p_organization_id, p_from, p_to)
    when 'resources_adequacy'        then quality_mr_src_resources(p_organization_id, p_from, p_to)
    when 'risk_action_effectiveness' then quality_mr_src_risks(p_organization_id, p_from, p_to)
    when 'improvement_opportunities' then quality_mr_src_improvement(p_organization_id, p_from, p_to)
    when 'interested_parties'        then quality_mr_src_interested_parties(p_organization_id, p_from, p_to)
    else null
  end;
end;
$$;


-- ============================================================================
-- 5 · FUENTES DE INTELLIGENCE
-- ----------------------------------------------------------------------------
-- Solo el CATALOGO. Sin proveedor, sin llamadas, sin generacion de texto: los
-- cargadores viven en la capa de aplicacion y devuelven datos estructurados.
--
-- `as_of` y no `current`: la pregunta natural de este dominio es «que era
-- pertinente en tal fecha», y responderla con el estado de hoy seria contestar
-- otra cosa.
--
-- `privacy_class = open`: una parte interesada no es un dato sensible de
-- persona. Los contactos NO entran en el contexto — ese es el punto de la nota
-- de permiso.
-- ============================================================================

insert into public.quality_ai_sources
  (code, label, domain, entity_type, privacy_class, historical_mode, permission_note, deep_link, position_order) values
  ('interested_party', 'Partes interesadas', 'interested_parties',
   'quality_stakeholder_assessment', 'open', 'as_of',
   'Miembro de la empresa. Se cita la parte y su analisis, nunca sus contactos.',
   '/quality/interested-parties', 22),
  ('interested_party_strategy', 'Estrategias de relacionamiento', 'interested_parties',
   'quality_stakeholder_strategy', 'open', 'as_of',
   'Miembro de la empresa. Se cita el CARGO responsable, nunca la persona.',
   '/quality/interested-parties', 23)
on conflict (code) do nothing;


-- ============================================================================
-- 7 · CORRECCION · EL GUARDIAN DE HISTORIA MIRABA LAS COLUMNAS EQUIVOCADAS
-- ----------------------------------------------------------------------------
-- 0149 escribio `quality_stakeholder_history_guard` con esta intencion, dicha
-- en su propio comentario:
--
--     «Lo que no se admite es cambiar el CONTENIDO de una fila que ya fue
--      sucedida.»
--
-- Y despues comprobo `effective_from`, `effective_to` y `status`, que son
-- justamente las tres columnas que NO son contenido. El resultado: una fila ya
-- sucedida conservaba sus fechas y admitia que le reescribieran el resumen, la
-- pertinencia y la prioridad. Es decir, permitia exactamente lo unico que el
-- disparador existia para impedir.
--
-- Lo encontro la prueba AW de la suite de historia de B2, no una lectura del
-- codigo: el comentario describia el comportamiento correcto y la condicion
-- hacia otro, y leyendolo por encima los dos parecen lo mismo.
--
-- LA CORRECCION
--
-- Una fila ya sucedida no admite NINGUNA modificacion. No hay una lista de
-- columnas protegidas y otra libre, porque esa lista habria que ampliarla cada
-- vez que se anada una columna, y el dia que se olvide nadie se entera.
--
-- Cerrar la vigencia sigue siendo legitimo: en ese momento la fila TODAVIA
-- esta vigente —`effective_to` es null y `status` es 'current'—, asi que la
-- condicion no se cumple y el cierre pasa. Lo que queda prohibido es tocarla
-- DESPUES.
--
-- No se toca 0149: se sustituye la funcion, que es lo que `create or replace`
-- permite hacer sin reescribir una migracion ya aplicada. Los dos disparadores
-- que la usan siguen siendo los mismos y no se recrean.
-- ============================================================================

create or replace function public.quality_stakeholder_history_guard()
returns trigger
language plpgsql
as $$
begin
  if old.effective_to is not null and old.status <> 'current' then
    raise exception 'Un registro ya sucedido no se reescribe: su contenido es la respuesta a «que decia entonces».'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.quality_stakeholder_history_guard() from public, anon, authenticated;

comment on function public.quality_stakeholder_history_guard() is
  'QUALITY-12.3B2 · PI-28 · Una fila ya sucedida no admite NINGUNA modificacion. Corrige 0149, que protegia las columnas de vigencia y dejaba reescribir el contenido, que es lo contrario de lo que decia su propio comentario.';


-- ============================================================================
-- 6 · REVERSION
-- ----------------------------------------------------------------------------
--   delete from public.quality_ai_sources where domain = 'interested_parties';
--   delete from public.quality_management_review_input_catalog where code = 'interested_parties';
--   delete from public.quality_automation_event_catalog where domain = 'interested_parties';
--   drop function if exists public.quality_mr_src_interested_parties(uuid, date, date);
--   drop function if exists public.quality_stakeholder_label(uuid);
--   drop function if exists public.quality_record_stakeholder_review(uuid, uuid, text, text, date, uuid, date);
--   drop function if exists public.quality_supersede_stakeholder_assessment(uuid, text, text, text, text, numeric, text, uuid, date);
--   drop function if exists public.quality_emit_stakeholder_change_event(text, uuid, text);
--   -- y restaurar desde 0128 y 0121 respectivamente:
--   --   quality_mr_source_payload, work_reference_must_be_valid
--   --   y los tres CHECK de work_events sin el vocabulario nuevo.
--
-- Borrar la fila del catalogo de Revision por la Direccion NO borra las
-- entradas ya preparadas de revisiones anteriores: esas son su acta.
-- ============================================================================
