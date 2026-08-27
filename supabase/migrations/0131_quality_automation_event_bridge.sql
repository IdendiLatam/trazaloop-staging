-- ============================================================================
-- 0131_quality_automation_event_bridge.sql · QUALITY-11.1
-- ============================================================================
-- Cierra los DOS huecos que QUALITY-11 dejó declarados, y nada más. No
-- rediseña nada: reutiliza el modelo de reglas, el catálogo tipado, el
-- evaluador, las señales, `work_alerts`, `work_tasks`, las ejecuciones, el
-- dedupe, el tiempo de negocio y la RLS que ya existen.
--
-- Las 0129 y 0130 YA ESTÁN APLICADAS en Staging y son INMUTABLES.
--
-- ----------------------------------------------------------------------------
-- GAP-01 · PARIDAD DEL BARRIDO PROGRAMADO
-- ----------------------------------------------------------------------------
-- `quality_scan_pending_measurements` (0119) y `work_scan_pending_actions`
-- (0121) se escribieron como acciones de pantalla: exigen sesión en su primera
-- línea. Bajo el planificador —que entra sin usuario— la 0130 los anotaba como
-- omitidos. Omitido con motivo es honesto, pero sigue siendo una condición de
-- negocio que nadie observa de noche.
--
-- Lo que se hace, en este orden:
--
--   1. La condición de cada uno se representa como OBSERVABLE de QUALITY-11:
--      dos hechos nuevos en el catálogo tipado —`measurement_period_closed` y
--      `requires_effectiveness`— que faltaban para poder escribir la condición
--      EXACTA que el barrido antiguo detecta, sin cambiar ni una coma de la
--      lógica empresarial de Q03 ni de Q04.
--
--   2. Tres plantillas de plataforma expresan esas condiciones con el mismo
--      evaluador y el mismo ejecutor de salidas que todo lo demás. La empresa
--      las instancia; no se encienden solas.
--
--   3. Los dos barridos antiguos dejan de exigir sesión —con el mismo patrón
--      que llevan usando los otros seis desde 0117: el rol se comprueba cuando
--      hay sesión— y aprenden a CEDER: si la empresa ya observa esa condición
--      con una regla de QUALITY-11 activa, el barrido antiguo no emite nada.
--      Una condición, un aviso. Esa es la única fuente de verdad.
--
-- ----------------------------------------------------------------------------
-- GAP-02 · EL PUENTE DE EVENTOS
-- ----------------------------------------------------------------------------
-- `trigger_kind = 'event'` existía en el modelo desde la 0129 pero no había
-- puente. Aquí se construye, reutilizando lo que ya hay:
--
--   HECHO DE NEGOCIO  →  work_events (que ya es el outbox transaccional: lo
--                        escriben las RPC de dominio DENTRO de su transacción)
--   ENRUTADOR         →  reglas activas con `trigger_kind='event'` cuyo
--                        `event_types` contiene el tipo, con versión vigente
--   SUJETO            →  contrato REGISTRADO tipo de sujeto → fuente del
--                        catálogo. Nunca una tabla ni una columna del evento
--   EVALUADOR         →  el MISMO `quality_automation_evaluate`
--   SALIDAS           →  el MISMO ejecutor, extraído aquí a función propia
--                        para que los dos caminos compartan de verdad el
--                        dedupe, el linaje, la seguridad y el reintento
--
-- Y una consecuencia que importa más que el puente: como la clave de dedupe es
-- `auto:<versión>:<sujeto>`, la MISMA instancia de condición produce UNA señal
-- venga del evento o del barrido nocturno. La colisión de §59 no hay que
-- resolverla: no puede ocurrir.
--
-- NADA de esto introduce IA, ni una cola externa, ni un segundo motor.
-- ============================================================================


-- ============================================================================
-- 1 · PARIDAD · los dos hechos que faltaban en el catálogo tipado
-- ============================================================================

insert into public.quality_automation_source_fields
  (source_code, field, label, data_type, allowed_operators, enum_values, unit, position_order)
values
  -- §5 · El barrido de Q03 no reclama una medición cuyo periodo ya se cerró
  -- formalmente. Sin este hecho, la regla equivalente reclamaría de más.
  ('indicator', 'measurement_period_closed', 'Periodo ya cerrado', 'boolean',
   array['equals'], null, null, 8),
  -- §6 · El barrido de Q04 solo reclama la eficacia de las acciones que la
  -- exigen. Sin este hecho, la regla equivalente reclamaría a todas.
  ('action', 'requires_effectiveness', 'Exige verificar la eficacia', 'boolean',
   array['equals'], null, null, 6)
on conflict (source_code, field) do nothing;

comment on table public.quality_automation_source_fields is
  'QUALITY-11 · §28 · Lo que cada fuente deja observar, con su tipo y sus operadores. QUALITY-11.1 añade los dos hechos que faltaban para expresar con una regla lo que los barridos de Q03 y Q04 detectaban a mano.';
-- ============================================================================
-- 2 · EL PROVEEDOR DE SUJETOS, ACOTABLE A UN SUJETO
-- ----------------------------------------------------------------------------
-- Mismo cuerpo, mismas dieciocho consultas escritas a mano, misma
-- representación tipada. Lo único que cambia es que se puede pedir UN sujeto.
-- Sigue sin haber una sola construcción de SQL en tiempo de ejecución.
-- ============================================================================

drop function if exists public.quality_automation_subjects(uuid, text, date, integer);
create or replace function public.quality_automation_subjects(
  p_organization_id uuid,
  p_source_code     text,
  p_today           date,
  p_limit           integer default 5000,
  -- QUALITY-11.1 · §17/§18 · El camino por EVENTO necesita UN sujeto, no el
  -- censo entero. Es el mismo proveedor y la misma representación tipada: solo
  -- se acota. Un segundo proveedor «para eventos» sería una segunda semántica,
  -- y entonces el evaluador dejaría de comparar lo mismo en los dos caminos.
  p_subject_id      uuid default null
)
returns table (
  subject_id        uuid,
  subject_label     text,
  owner_position_id uuid,
  facts             jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
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
  end if;

  return;
end;
$$;
revoke all on function public.quality_automation_subjects(uuid, text, date, integer, uuid) from public, anon;
grant execute on function public.quality_automation_subjects(uuid, text, date, integer, uuid) to authenticated;


-- ============================================================================
-- 2.5 · EL ESQUEMA QUE EL PUENTE NECESITA
-- ----------------------------------------------------------------------------
-- Cuatro cosas, todas aditivas. Ninguna toca lo que ya existía.
-- ============================================================================

-- §21 · LINAJE. Una señal nacida de un hecho tiene que poder decir de cuál.
alter table public.quality_signals
  add column if not exists source_event_id uuid references public.work_events (id);

comment on column public.quality_signals.source_event_id is
  'QUALITY-11.1 · §21 · El hecho de negocio que la disparó, cuando vino por el puente de eventos. Nulo cuando la detectó el barrido programado: las dos cosas son ciertas y distintas.';

create index if not exists quality_signals_event_idx
  on public.quality_signals (organization_id, source_event_id)
  where source_event_id is not null;

-- §37 · Una ejecución nacida de eventos NO es un barrido programado, y el
-- informe tiene que poder decirlo.
alter table public.quality_automation_runs
  drop constraint if exists quality_automation_runs_kind_check;
alter table public.quality_automation_runs
  add constraint quality_automation_runs_kind_check
  check (run_kind in ('manual', 'scheduled', 'simulation', 'event'));

-- §39/§40 · Una regla puede DECLARAR que sustituye a un barrido heredado. En
-- cuanto lo declara y está activa, el barrido heredado calla: una condición,
-- un aviso. Sin esto, adoptar la regla equivalente duplicaría la bandeja.
alter table public.quality_automation_rules
  add column if not exists supersedes_observer text;

comment on column public.quality_automation_rules.supersedes_observer is
  'QUALITY-11.1 · §8 · El barrido heredado al que esta regla releva. Mientras la regla esté activa, ese barrido no emite nada para esta empresa: la fuente de verdad es una sola.';

create index if not exists quality_automation_rules_supersedes_idx
  on public.quality_automation_rules (organization_id, supersedes_observer)
  where supersedes_observer is not null;

alter table public.quality_automation_rule_templates
  add column if not exists supersedes_observer text;

-- §15 · ENRUTADO. Sin este índice, cada evento miraría todas las reglas de la
-- empresa. Con él, mira las que declaran su tipo.
create index if not exists quality_automation_rule_versions_event_idx
  on public.quality_automation_rule_versions using gin (event_types)
  where trigger_kind = 'event';

-- §17 · LOS CONTRATOS DE SUJETO, REGISTRADOS
-- ----------------------------------------------------------------------------
-- Un evento trae `subject_type` y `subject_id`. Traducir eso a un sujeto
-- observable NO puede hacerse leyendo un nombre de tabla del JSON del evento:
-- sería exactamente el agujero que QUALITY-11 evitó en el catálogo de fuentes.
-- Se hace con una tabla de contratos, cerrada y de plataforma.
create table if not exists public.quality_automation_event_contracts (
  subject_type text primary key,
  source_code  text not null references public.quality_automation_sources (code),
  -- Cómo se llega del sujeto del evento al sujeto observable. `direct` es el
  -- caso normal. Los demás son resolutores CON NOMBRE, escritos a mano: no hay
  -- expresiones, ni tablas, ni columnas que vengan de ningún dato.
  resolver     text not null default 'direct',
  note         text,
  constraint quality_automation_event_contracts_resolver_check
    check (resolver in ('direct', 'supplier_evaluation_to_scope'))
);

comment on table public.quality_automation_event_contracts is
  'QUALITY-11.1 · §17 · De qué tipo de sujeto de un evento se llega a qué fuente observable. Cerrado, de plataforma y sin una sola expresión dinámica.';

revoke all on table public.quality_automation_event_contracts from anon, authenticated;
grant select on table public.quality_automation_event_contracts to authenticated;

insert into public.quality_automation_event_contracts (subject_type, source_code, resolver, note)
values
  ('quality_indicator',               'indicator',               'direct', null),
  ('quality_objective',               'objective',               'direct', null),
  ('work_case',                       'case',                    'direct', null),
  ('work_action',                     'action',                  'direct', null),
  ('quality_risk',                    'risk',                    'direct', null),
  ('quality_control',                 'control',                 'direct', null),
  ('quality_opportunity',             'opportunity',             'direct', null),
  ('quality_performance_evaluation',  'performance_evaluation',  'direct', null),
  ('quality_knowledge_item',          'knowledge_item',          'direct', null),
  ('quality_supplier_scope',          'supplier_scope',          'direct', null),
  ('quality_customer_feedback',       'customer_feedback',       'direct', null),
  ('quality_survey_campaign',         'customer_metric',         'direct', null),
  ('quality_audit',                   'audit',                   'direct', null),
  ('quality_audit_finding',           'audit_finding',           'direct', null),
  ('quality_management_review',       'management_review',       'direct', null),
  ('quality_management_review_input', 'management_review_input', 'direct', null),
  ('trazadoc_document_revision',      'document_revision',       'direct', null),
  -- El único que no es directo: cerrar una evaluación de proveedor es un hecho
  -- sobre la EVALUACIÓN, y lo observable es el ALCANCE que evaluó.
  ('quality_supplier_evaluation',     'supplier_scope', 'supplier_evaluation_to_scope',
   'El hecho es sobre la evaluación; lo que se observa es el alcance evaluado.')
on conflict (subject_type) do nothing;

-- §22/§23 · LA ENTREGA, con su acuse. Una fila por (evento, versión de regla):
-- es lo que hace que procesar dos veces el mismo hecho no produzca dos salidas
-- y que un reintento retome exactamente donde se quedó.
create table if not exists public.quality_automation_event_deliveries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  event_id        uuid not null references public.work_events (id) on delete cascade,
  rule_id         uuid not null,
  rule_version_id uuid not null,
  run_id          uuid,
  status          text not null default 'matched',
  attempts        integer not null default 1,
  signal_id       uuid,
  -- §21 · Si la entrega ABRIÓ la señal o solo la reencontró. Sin esto, el
  -- informe de una ejecución por eventos contaría lo que tocó, no lo que creó.
  signal_created  boolean not null default false,
  error_message   text,
  processed_at    timestamptz not null default now(),

  constraint quality_automation_event_deliveries_uniq
    unique (organization_id, event_id, rule_version_id),
  constraint quality_automation_event_deliveries_status_check
    check (status in ('matched', 'not_matched', 'skipped', 'failed')),
  constraint quality_automation_event_deliveries_rule_fk
    foreign key (organization_id, rule_id)
    references public.quality_automation_rules (organization_id, id) on delete cascade,
  constraint quality_automation_event_deliveries_version_fk
    foreign key (organization_id, rule_version_id)
    references public.quality_automation_rule_versions (organization_id, id) on delete cascade
);

-- Por si la tabla ya existiera de un intento anterior: la columna es nueva.
alter table public.quality_automation_event_deliveries
  add column if not exists signal_created boolean not null default false;

comment on table public.quality_automation_event_deliveries is
  'QUALITY-11.1 · §22 · El acuse de qué regla ya vio qué hecho. Su restricción única es lo que hace idempotente la entrega: procesar dos veces el mismo evento no puede emitir dos veces.';

create index if not exists quality_automation_event_deliveries_event_idx
  on public.quality_automation_event_deliveries (organization_id, event_id);

drop trigger if exists t_audit_quality_automation_event_deliveries
  on public.quality_automation_event_deliveries;
create trigger t_audit_quality_automation_event_deliveries
  after insert or update or delete on public.quality_automation_event_deliveries
  for each row execute function public.audit_row_change();

-- §24 · La marca de agua: hasta qué hecho se ha mirado. Los acuses dan la
-- idempotencia; esto evita releer la bitácora entera cada noche.
alter table public.quality_automation_settings
  add column if not exists events_processed_through timestamptz;

comment on column public.quality_automation_settings.events_processed_through is
  'QUALITY-11.1 · §24 · Hasta qué instante se han enrutado los hechos. No es la garantía de no duplicar —esa es el acuse—: es lo que evita releer la bitácora entera.';


-- ============================================================================
-- 3 · EL EJECUTOR DE SALIDAS, EXTRAÍDO
-- ----------------------------------------------------------------------------
-- §20 · Hasta ahora las salidas se emitían EN LÍNEA dentro del barrido. Con un
-- solo camino eso bastaba. Con dos, no: si el camino por evento insertara sus
-- propias señales, el dedupe, el linaje, la seguridad y el reintento serían
-- «parecidos» en vez de ser los mismos, y la primera divergencia aparecería el
-- día que alguien tocara uno de los dos.
--
-- Así que el bloque sale a su propia función y los DOS caminos la llaman. No
-- cambia ni una regla de negocio: es exactamente el mismo código que la 0130
-- ejecutaba en línea, con un argumento nuevo —el evento de origen, cuando lo
-- hay— y devolviendo lo que creó.
-- ============================================================================

create or replace function public.quality_automation_dedupe_key(
  p_version_id uuid, p_subject_id uuid
)
returns text
language sql
immutable
as $$
  -- §35 · La identidad de la CONDICIÓN: versión + sujeto. Ni la fecha —abriría
  -- una señal cada mañana— ni el camino por el que se detectó —y por eso el
  -- evento y el barrido nocturno no pueden duplicar la misma condición—.
  select 'auto:' || p_version_id::text || ':' || p_subject_id::text;
$$;
revoke all on function public.quality_automation_dedupe_key(uuid, uuid) from public, anon;
grant execute on function public.quality_automation_dedupe_key(uuid, uuid) to authenticated;


create or replace function public.quality_automation_emit(
  p_organization_id           uuid,
  p_run_id                    uuid,
  p_rule_id                   uuid,
  p_rule_name                 text,
  p_rule_owner_position_id    uuid,
  p_version_id                uuid,
  p_version_number            integer,
  p_conditions                jsonb,
  p_outputs                   jsonb,
  p_severity                  text,
  p_signal_title              text,
  p_source_code               text,
  p_domain                    text,
  p_subject_type              text,
  p_subject_id                uuid,
  p_subject_label             text,
  p_subject_owner_position_id uuid,
  p_facts                     jsonb,
  p_explanation               text,
  p_today                     date,
  p_event_id                  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dedupe   text;
  v_signal   uuid;
  v_nuevo    boolean;
  v_out      jsonb;
  v_pos      uuid;
  v_rec      record;
  v_hubo_rec boolean;
  v_sig_n    integer := 0;
  v_alert_n  integer := 0;
  v_task_n   integer := 0;
begin
  v_dedupe := quality_automation_dedupe_key(p_version_id, p_subject_id);

  -- --------------------------------------------------------------------------
  -- SALIDA 1 · la señal
  -- --------------------------------------------------------------------------
  insert into quality_signals
    (organization_id, rule_id, rule_version_id, run_id, source_code, domain,
     subject_type, subject_id, subject_label, severity, title, explanation,
     source_snapshot, dedupe_key, source_event_id)
  values
    (p_organization_id, p_rule_id, p_version_id, p_run_id, p_source_code,
     p_domain, p_subject_type, p_subject_id, p_subject_label, p_severity,
     p_signal_title,
     -- §41 · Por qué saltó, con la regla, la versión y los valores.
     'Regla: ' || p_rule_name || E'\nVersión: ' || p_version_number
       || E'\nSujeto: ' || coalesce(p_subject_label, '—')
       || E'\nCondición:\n· ' || p_explanation
       || case when p_event_id is not null
               then E'\nDetectado al ocurrir el hecho registrado el '
                    || to_char(p_today, 'DD/MM/YYYY') || '.'
               else E'\nDetectado el ' || to_char(p_today, 'DD/MM/YYYY') || '.' end,
     -- §42/§91 · El retrato MÍNIMO: solo los campos que la regla miró.
     (select coalesce(jsonb_object_agg(c ->> 'field', p_facts -> (c ->> 'field')),
                      '{}'::jsonb)
        from jsonb_array_elements(p_conditions) c),
     v_dedupe, p_event_id)
  on conflict (organization_id, dedupe_key) where resolved_at is null
  do update set last_detected_at = now(),
                detection_count = quality_signals.detection_count + 1
  returning id, (xmax = 0) into v_signal, v_nuevo;

  if v_nuevo then
    v_sig_n := 1;
    insert into work_events (organization_id, source_domain, event_type,
                             subject_type, subject_id, severity, summary, payload,
                             dedupe_key)
    values (p_organization_id, 'automation', 'automation.signal_raised',
            'quality_signal', v_signal, p_severity,
            p_signal_title || ' · ' || coalesce(p_subject_label, ''),
            jsonb_build_object('rule_id', p_rule_id, 'version', p_version_number,
                               'run_id', p_run_id, 'subject_id', p_subject_id,
                               'source_event_id', p_event_id),
            'auto_event:' || v_signal::text);
  end if;

  -- --------------------------------------------------------------------------
  -- SALIDAS 2 y 3 · alerta y tarea, si la regla las pide
  -- --------------------------------------------------------------------------
  for v_out in select * from jsonb_array_elements(p_outputs) loop
    if (v_out ->> 'kind') = 'CREATE_SIGNAL' then
      continue;
    end if;

    v_pos := case v_out ->> 'recipient_kind'
      when 'rule_owner_position' then p_rule_owner_position_id
      when 'subject_owner_position' then p_subject_owner_position_id
      when 'specific_position' then (v_out ->> 'position_id')::uuid
    end;

    v_hubo_rec := false;
    for v_rec in
      select * from quality_automation_recipients(p_organization_id, v_pos, p_today)
    loop
      v_hubo_rec := true;
      if (v_out ->> 'kind') = 'CREATE_ALERT' then
        insert into work_alerts
          (organization_id, source_domain, alert_type, severity,
           subject_type, subject_id, recipient_profile_id, title, message, dedupe_key)
        select p_organization_id, 'automation', 'automation_signal', p_severity,
               p_subject_type, p_subject_id, v_rec.profile_id,
               p_signal_title,
               coalesce(p_subject_label, '') || ' · ' || p_explanation,
               'auto_alert:' || v_signal::text || ':' || v_rec.profile_id::text
         where not exists (
           select 1 from work_alerts w
            where w.dedupe_key = 'auto_alert:' || v_signal::text || ':' || v_rec.profile_id::text);
        if found then v_alert_n := v_alert_n + 1; end if;
      elsif (v_out ->> 'kind') = 'CREATE_TASK' then
        insert into work_tasks
          (organization_id, source_domain, task_type, subject_type, subject_id,
           title, description, assignee_profile_id, assignee_position_id,
           status, due_at, dedupe_key)
        select p_organization_id, 'automation', 'automation_follow_up',
               p_subject_type, p_subject_id,
               coalesce(v_out ->> 'task_title', p_signal_title),
               coalesce(p_subject_label, '') || E'\n' || p_explanation,
               v_rec.profile_id, v_pos, 'open',
               case when (v_out ->> 'due_in_days') ~ '^[0-9]+$'
                    then p_today + (v_out ->> 'due_in_days')::integer else null end,
               'auto_task:' || v_signal::text || ':' || v_rec.profile_id::text
         where not exists (
           select 1 from work_tasks w
            where w.dedupe_key = 'auto_task:' || v_signal::text || ':' || v_rec.profile_id::text);
        if found then v_task_n := v_task_n + 1; end if;
      end if;
    end loop;

    -- §33 · Sin titular con cuenta la señal EXISTE y lo dice.
    if not v_hubo_rec then
      update quality_signals set recipient_unresolved = true
       where id = v_signal and not recipient_unresolved;
    end if;
  end loop;

  return jsonb_build_object(
    'signal_id', v_signal, 'is_new', v_nuevo, 'dedupe_key', v_dedupe,
    'signals_created', v_sig_n, 'alerts_created', v_alert_n, 'tasks_created', v_task_n);
end;
$$;
revoke all on function public.quality_automation_emit(
  uuid, uuid, uuid, text, uuid, uuid, integer, jsonb, jsonb, text, text, text, text,
  text, uuid, text, uuid, jsonb, text, date, uuid) from public, anon;

comment on function public.quality_automation_emit(
  uuid, uuid, uuid, text, uuid, uuid, integer, jsonb, jsonb, text, text, text, text,
  text, uuid, text, uuid, jsonb, text, date, uuid) is
  'QUALITY-11.1 · §20 · El ÚNICO ejecutor de salidas. Lo llaman el barrido programado, la ejecución manual y el puente de eventos: por eso los tres comparten dedupe, linaje, seguridad y reintento en vez de parecerse.';


-- ============================================================================
-- 4 · EL BARRIDO PROGRAMADO, AHORA SOBRE EL EJECUTOR COMPARTIDO
-- ----------------------------------------------------------------------------
-- Mismo comportamiento que la 0130. Dos cambios y ninguno es de negocio:
--
--   · las salidas las emite `quality_automation_emit`, que es el mismo que usa
--     el puente de eventos;
--   · una regla POR EVENTO no se barre: se anota como omitida, con su motivo.
-- ============================================================================

create or replace function public.quality_automation_run(
  p_organization_id uuid,
  p_mode            text default 'live',
  p_rule_id         uuid default null,
  p_today           date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today     date;
  v_run       uuid;
  v_rule      record;
  v_ver       record;
  v_subject   record;
  v_eval      jsonb;
  v_out       jsonb;
  v_labels    jsonb;
  v_src       record;
  v_dedupe    text;
  v_signal    uuid;
  v_nuevo     boolean;
  v_pos       uuid;
  v_rec       record;
  v_hubo_rec  boolean;
  v_sub_n     integer;
  v_match_n   integer;
  v_sig_n     integer;
  v_alert_n   integer;
  v_task_n    integer;
  v_t0        timestamptz;
  v_tot_sub   integer := 0;
  v_tot_match integer := 0;
  v_tot_sig   integer := 0;
  v_tot_alert integer := 0;
  v_tot_task  integer := 0;
  v_fallos    integer := 0;
  v_reglas    integer := 0;
  v_vistos    uuid[];
  v_claves    text[];
  v_legacy    integer;
  v_obs       text;
  v_antes     integer;
  v_emit      jsonb;
  v_despues   integer;
begin
  -- §87/§105 · Con SESIÓN se comprueba el rol. Sin sesión —el trabajador
  -- programado— se ejecuta como barrido del sistema, exactamente igual que los
  -- barridos de QUALITY-03…10, que llevan haciéndolo desde 0117. Y ni con
  -- sesión ni sin ella puede hacer nada fuera del catálogo cerrado de salidas:
  -- una automatización no eleva permisos, hace tres cosas.
  if auth.uid() is not null then
    if not quality_manages_automation(p_organization_id) then
      raise exception 'Tu rol no permite ejecutar la automatización.';
    end if;
  end if;
  if p_mode not in ('live', 'simulation') then
    raise exception 'Modo de ejecución no reconocido.';
  end if;
  -- §72 · Simular sin sesión no tiene sentido y no se permite: la simulación
  -- es una herramienta de quien diseña la regla.
  if p_mode = 'simulation' and auth.uid() is null then
    raise exception 'La simulación exige una sesión.';
  end if;

  insert into quality_automation_settings (organization_id)
  values (p_organization_id) on conflict (organization_id) do nothing;

  -- §47 · El día de negocio. El parámetro existe para las pruebas; en la
  -- aplicación nadie lo pasa, así que no hay reloj manipulable en producción.
  v_today := coalesce(p_today, quality_automation_business_today(p_organization_id));

  insert into quality_automation_runs
    (organization_id, run_kind, business_date, triggered_by, status, started_at)
  values (p_organization_id,
          case when p_mode = 'simulation' then 'simulation'
               when auth.uid() is null then 'scheduled' else 'manual' end,
          v_today, auth.uid(), 'running', clock_timestamp())
  returning id into v_run;

  -- ------------------------------------------------------------------------
  -- 13.1 · Las reglas de la organización
  -- ------------------------------------------------------------------------
  for v_rule in
    select r.* from quality_automation_rules r
     where r.organization_id = p_organization_id
       and r.status = 'active'
       and (p_rule_id is null or r.id = p_rule_id)
       -- §80 · Una regla silenciada no se evalúa mientras dure el silencio.
       and not exists (
         select 1 from quality_signal_suppressions s
          where s.organization_id = r.organization_id
            and s.scope = 'rule' and s.rule_id = r.id
            and s.released_at is null
            and (s.suppressed_until is null or s.suppressed_until >= v_today))
     order by r.code
  loop
    v_t0 := clock_timestamp();
    v_sub_n := 0; v_match_n := 0; v_sig_n := 0; v_alert_n := 0; v_task_n := 0;
    v_vistos := array[]::uuid[]; v_claves := array[]::text[];

    begin
      -- §23 · La versión que gobierna HOY es la que tiene HOY dentro de su
      -- ventana de vigencia. Ni antes, ni después.
      --
      -- Y se admite `superseded`, no por descuido: cuando se publica una v2
      -- con vigencia a partir de mañana, la v1 queda marcada como sustituida
      -- en ese mismo instante pero su ventana sigue cubriendo hoy. Mirar solo
      -- el estado dejaría a la regla sin versión durante el tramo que va
      -- desde que se publica el relevo hasta que el relevo entra en vigor —y
      -- ese tramo existe de verdad en cuanto el día de negocio de la empresa
      -- no coincide con el del servidor—. La autoridad de una versión es su
      -- ventana; la etiqueta solo dice si es la última.
      select * into v_ver from quality_automation_rule_versions
       where organization_id = p_organization_id and rule_id = v_rule.id
         and status in ('published', 'superseded')
         and effective_from is not null
         and effective_from <= v_today
         and (effective_to is null or effective_to >= v_today)
       order by effective_from desc, version_number desc limit 1;

      if v_ver.id is null then
        insert into quality_automation_run_rules
          (organization_id, run_id, rule_id, status, error_message)
        values (p_organization_id, v_run, v_rule.id, 'skipped',
                'Sin versión publicada vigente hoy.');
        continue;
      end if;

      -- QUALITY-11.1 · §10 · Una regla POR EVENTO no se barre: se evalúa
      -- cuando ocurre el hecho. Barrerla además sería mirar dos veces lo
      -- mismo, y —peor— el barrido cerraría sola una señal que nació de un
      -- hecho, que es algo que ese hecho no ha dejado de ser cierto.
      if v_ver.trigger_kind = 'event' then
        insert into quality_automation_run_rules
          (organization_id, run_id, rule_id, rule_version_id, status, error_message)
        values (p_organization_id, v_run, v_rule.id, v_ver.id, 'skipped',
                'Regla por evento: se evalúa cuando ocurre el hecho, no en el barrido.');
        continue;
      end if;

      select * into v_src from quality_automation_sources where code = v_rule.source_code;
      select coalesce(jsonb_object_agg(field, label), '{}'::jsonb) into v_labels
        from quality_automation_source_fields where source_code = v_rule.source_code;

      for v_subject in
        select * from quality_automation_subjects(p_organization_id, v_rule.source_code, v_today)
      loop
        v_sub_n := v_sub_n + 1;
        v_vistos := v_vistos || v_subject.subject_id;

        v_eval := quality_automation_evaluate(
          v_subject.facts, v_ver.conditions, v_today, v_labels);
        if not coalesce((v_eval ->> 'matched')::boolean, false) then
          continue;
        end if;
        v_match_n := v_match_n + 1;

        -- §35 · La clave determinística de la CONDICIÓN. Incluye la versión:
        -- cambiar la regla abre una condición nueva, y eso es correcto.
        v_dedupe := quality_automation_dedupe_key(v_ver.id, v_subject.subject_id);
        v_claves := v_claves || v_dedupe;

        -- §72 · La simulación cuenta y se detiene aquí. No crea nada.
        if p_mode = 'simulation' then
          continue;
        end if;

        -- QUALITY-11.1 · §20 · Las salidas las emite el ÚNICO ejecutor, el
        -- mismo que usa el puente de eventos. Antes este bloque estaba en
        -- línea aquí; sacarlo es lo que impide que los dos caminos se separen.
        v_emit := quality_automation_emit(
          p_organization_id, v_run, v_rule.id, v_rule.name, v_rule.owner_position_id,
          v_ver.id, v_ver.version_number, v_ver.conditions, v_ver.outputs,
          v_ver.severity, v_ver.signal_title, v_rule.source_code, v_src.domain,
          v_src.subject_type, v_subject.subject_id, v_subject.subject_label,
          v_subject.owner_position_id, v_subject.facts, v_eval ->> 'explanation',
          v_today, null);

        v_sig_n   := v_sig_n   + (v_emit ->> 'signals_created')::integer;
        v_alert_n := v_alert_n + (v_emit ->> 'alerts_created')::integer;
        v_task_n  := v_task_n  + (v_emit ->> 'tasks_created')::integer;
      end loop;

      -- §38 · Resolución determinística: las señales abiertas de esta regla
      -- cuyo sujeto se evaluó y YA NO cumple la condición se resuelven solas.
      -- Resolver la señal NO cierra la tarea, y desde luego no cierra ninguna
      -- acción: son objetos de otro dueño.
      if p_mode = 'live' then
        update quality_signals s
           set status = 'resolved', resolved_at = now(), resolution_kind = 'auto',
               resolution_note = 'La condición dejó de cumplirse el '
                                 || to_char(v_today, 'DD/MM/YYYY') || '.'
         where s.organization_id = p_organization_id
           and s.rule_id = v_rule.id
           and s.resolved_at is null
           and s.subject_id = any (v_vistos)
           and not (s.dedupe_key = any (v_claves));
      end if;

      insert into quality_automation_run_rules
        (organization_id, run_id, rule_id, rule_version_id, subjects_evaluated,
         matches, signals_created, alerts_created, tasks_created, status, duration_ms)
      values (p_organization_id, v_run, v_rule.id, v_ver.id, v_sub_n, v_match_n,
              v_sig_n, v_alert_n, v_task_n, 'success',
              extract(milliseconds from clock_timestamp() - v_t0)::integer);

      v_reglas := v_reglas + 1;
      v_tot_sub := v_tot_sub + v_sub_n;
      v_tot_match := v_tot_match + v_match_n;
      v_tot_sig := v_tot_sig + v_sig_n;
      v_tot_alert := v_tot_alert + v_alert_n;
      v_tot_task := v_tot_task + v_task_n;

    exception when others then
      -- §45 · Una regla defectuosa falla ELLA SOLA. El barrido sigue, y el
      -- fallo queda escrito con su mensaje.
      v_fallos := v_fallos + 1;
      insert into quality_automation_run_rules
        (organization_id, run_id, rule_id, status, error_message, duration_ms)
      values (p_organization_id, v_run, v_rule.id, 'failed', sqlerrm,
              extract(milliseconds from clock_timestamp() - v_t0)::integer);
    end;
  end loop;

  -- ------------------------------------------------------------------------
  -- 13.2 · Los OBSERVADORES DE PLATAFORMA (§126, §127, §128)
  -- ------------------------------------------------------------------------
  -- Los barridos que QUALITY-03…10 ya traían. No se reescriben ni se duplican:
  -- se integran aquí, bajo la misma ejecución, para que exista UNA sola puerta
  -- y para que su resultado aparezca en el mismo informe. Sus contratos
  -- públicos siguen intactos, así que Q09 y Q10 no se enteran.
  if p_mode = 'live' and p_rule_id is null then
    foreach v_obs in array array[
      'quality_scan_pending_measurements', 'work_scan_pending_actions',
      'quality_scan_risk_reviews', 'quality_scan_people_signals',
      'quality_scan_supplier_reviews', 'quality_scan_customer_voice',
      'quality_scan_audits', 'quality_scan_management_reviews']
    loop
      v_t0 := clock_timestamp();
      begin
        -- §44 · La ejecución cuenta lo que SE CREÓ, no lo que el barrido dice
        -- que miró. Algunos barridos heredados devuelven el total de la
        -- condición, no las filas nuevas; contar el delta real de avisos es
        -- fiel sin tocar el contrato público de ninguno de ellos.
        select count(*) into v_antes from work_alerts
         where organization_id = p_organization_id;
        execute format('select %I($1)', v_obs) into v_legacy using p_organization_id;
        select count(*) into v_despues from work_alerts
         where organization_id = p_organization_id;
        insert into quality_automation_run_rules
          (organization_id, run_id, platform_observer, alerts_created, status, duration_ms)
        values (p_organization_id, v_run, v_obs, greatest(v_despues - v_antes, 0), 'success',
                extract(milliseconds from clock_timestamp() - v_t0)::integer);
        v_tot_alert := v_tot_alert + greatest(v_despues - v_antes, 0);
        v_reglas := v_reglas + 1;
      exception when others then
        -- Dos de los ocho barridos heredados —`quality_scan_pending_measurements`
        -- y `work_scan_pending_actions`— se escribieron como acciones de
        -- pantalla y EXIGEN sesión. Cuando el barrido entra sin usuario (el
        -- planificador), no fallan: no se pueden ejecutar, que es otra cosa.
        -- Llamarlo «fallo» convertiría cada noche en una avería falsa y
        -- enseñaría a ignorar el contador que sí importa.
        --
        -- Sus contratos NO se tocan: son de QUALITY-03 y QUALITY-04 y otras
        -- pruebas los dan por buenos. Lo que cambia es cómo se registra aquí.
        if sqlerrm = 'No autenticado' and auth.uid() is null then
          insert into quality_automation_run_rules
            (organization_id, run_id, platform_observer, status, error_message, duration_ms)
          values (p_organization_id, v_run, v_obs, 'skipped',
                  'Este barrido heredado exige una sesión: se ejecuta cuando alguien '
                  || 'dispara la automatización a mano.',
                  extract(milliseconds from clock_timestamp() - v_t0)::integer);
        else
          v_fallos := v_fallos + 1;
          insert into quality_automation_run_rules
            (organization_id, run_id, platform_observer, status, error_message, duration_ms)
          values (p_organization_id, v_run, v_obs, 'failed', sqlerrm,
                  extract(milliseconds from clock_timestamp() - v_t0)::integer);
        end if;
      end;
    end loop;
  end if;

  -- `now()` es la hora de la TRANSACCIÓN: usarla aquí daría siempre duración
  -- cero, porque el barrido entero cabe en una sola. La duración real se mide
  -- con el reloj de pared.
  update quality_automation_runs
     set finished_at = clock_timestamp(),
         status = case when v_fallos = 0 then 'success'
                       when v_fallos > 0 and v_reglas > 0 then 'partial'
                       else 'failed' end,
         rules_evaluated = v_reglas,
         subjects_evaluated = v_tot_sub,
         matches = v_tot_match,
         signals_created = v_tot_sig,
         alerts_created = v_tot_alert,
         tasks_created = v_tot_task,
         failures = v_fallos
   where id = v_run;

  if p_mode = 'live' then
    update quality_automation_settings
       set last_run_at = now(),
           last_run_status = case when v_fallos = 0 then 'success'
                                  when v_reglas > 0 then 'partial' else 'failed' end,
           last_success_at = case when v_fallos = 0 then now() else last_success_at end
     where organization_id = p_organization_id;

    insert into work_events (organization_id, source_domain, event_type,
                             subject_type, subject_id, summary, payload, dedupe_key)
    values (p_organization_id, 'automation', 'automation.run_completed',
            'quality_signal', v_run,
            'Barrido de automatización: ' || v_tot_match || ' coincidencia(s), '
              || v_tot_sig || ' señal(es) nueva(s).',
            jsonb_build_object('run_id', v_run, 'rules', v_reglas,
                               'subjects', v_tot_sub, 'failures', v_fallos),
            'auto_run:' || v_run::text);
  end if;

  return v_run;
end;
$$;
comment on function public.quality_automation_run(uuid, text, uuid, date) is
  'QUALITY-11.1 · El único motor programado. Emite por el ejecutor compartido y deja las reglas por evento al puente, que usa ese mismo ejecutor.';


-- ============================================================================
-- 5 · EL PUENTE DE EVENTOS
-- ----------------------------------------------------------------------------
-- §10 · HECHO → ENRUTADOR → SUJETO TIPADO → MISMO EVALUADOR → MISMO EJECUTOR.
--
-- Lo que NO hay aquí, a propósito:
--
--   · ninguna cola externa (§27): `work_events` ya es el outbox, y lo escriben
--     las RPC de dominio DENTRO de su transacción;
--   · ningún evaluador alternativo (§19): es `quality_automation_evaluate`;
--   · ninguna inserción directa de señales (§20): es `quality_automation_emit`;
--   · ninguna lectura de tabla o columna que venga del evento (§17): el sujeto
--     se traduce por CONTRATO REGISTRADO;
--   · ningún evento de la propia automatización (§25): los hechos que produce
--     QUALITY-11 no se enrutan, y por eso el ciclo no puede cerrarse.
-- ============================================================================

create or replace function public.quality_automation_process_events(
  p_organization_id uuid,
  p_limit           integer default 500,
  p_today           date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today      date;
  v_run        uuid;
  v_desde      timestamptz;
  v_hasta      timestamptz;
  v_ev         record;
  v_rule       record;
  v_con        record;
  v_src        record;
  v_subject    record;
  v_sub_id     uuid;
  v_eval       jsonb;
  v_labels     jsonb;
  v_emit       jsonb;
  v_deliv      uuid;
  v_ev_n       integer := 0;
  v_match_n    integer := 0;
  v_sig_n      integer := 0;
  v_alert_n    integer := 0;
  v_task_n     integer := 0;
  v_fallos     integer := 0;
  v_reglas     integer := 0;
begin
  -- §16/§49 · Con sesión se comprueba el rol. Sin sesión —el trabajador— se
  -- ejecuta como proceso del sistema. En ningún caso se acepta una empresa que
  -- venga del navegador como autoridad: la empresa del hecho la pone el hecho.
  if auth.uid() is not null then
    if not quality_manages_automation(p_organization_id) then
      raise exception 'Tu rol no permite procesar la automatización.';
    end if;
  end if;

  v_today := coalesce(p_today, quality_automation_business_today(p_organization_id));
  v_hasta := clock_timestamp();

  select coalesce(events_processed_through, v_hasta - interval '30 days')
    into v_desde
    from quality_automation_settings where organization_id = p_organization_id;
  v_desde := coalesce(v_desde, v_hasta - interval '30 days');

  insert into quality_automation_runs
    (organization_id, run_kind, business_date, triggered_by, status, started_at)
  values (p_organization_id, 'event', v_today, auth.uid(), 'running', clock_timestamp())
  returning id into v_run;

  for v_ev in
    select e.id, e.event_type, e.subject_type, e.subject_id, e.occurred_at
      from work_events e
     where e.organization_id = p_organization_id
       and e.occurred_at <= v_hasta
       -- Lo nuevo desde la última pasada… y lo que quedó en fallo, venga de
       -- donde venga: si la marca de agua lo dejara fuera, un reintento sería
       -- imposible y §23 no se cumpliría nunca.
       and (e.occurred_at > v_desde
            or exists (
              select 1 from quality_automation_event_deliveries d
               where d.organization_id = e.organization_id
                 and d.event_id = e.id and d.status = 'failed'))
       -- §25 · Los hechos que produce la automatización NO se enrutan. Es la
       -- guarda de profundidad: sin ella, una tarea creada podría disparar una
       -- regla que crea otra tarea, y así hasta que alguien lo notara.
       and e.source_domain <> 'automation'
       and e.subject_type is not null
       and e.subject_id is not null
     order by e.occurred_at, e.id
     limit p_limit
  loop
    v_ev_n := v_ev_n + 1;

    -- §17 · El contrato: de qué tipo de sujeto se llega a qué fuente.
    select * into v_con from quality_automation_event_contracts
     where subject_type = v_ev.subject_type;
    if v_con.subject_type is null then
      continue;
    end if;

    -- §15 · Enrutado: solo las reglas que declaran ESTE tipo de hecho, activas,
    -- con versión por evento vigente hoy y no silenciadas. Una por regla.
    for v_rule in
      select distinct on (r.id)
             r.id as rule_id, r.name as rule_name, r.source_code,
             r.owner_position_id as rule_owner_position_id,
             v.id as version_id, v.version_number, v.conditions, v.outputs,
             v.severity, v.signal_title
        from quality_automation_rules r
        join quality_automation_rule_versions v
          on v.organization_id = r.organization_id and v.rule_id = r.id
       where r.organization_id = p_organization_id
         and r.status = 'active'
         and v.trigger_kind = 'event'
         and v.status in ('published', 'superseded')
         and v.effective_from is not null
         and v.effective_from <= v_today
         and (v.effective_to is null or v.effective_to >= v_today)
         and v.event_types @> array[v_ev.event_type]
         and not exists (
           select 1 from quality_signal_suppressions sp
            where sp.organization_id = r.organization_id
              and sp.scope = 'rule' and sp.rule_id = r.id
              and sp.released_at is null
              and (sp.suppressed_until is null or sp.suppressed_until >= v_today))
       order by r.id, v.effective_from desc, v.version_number desc
    loop
      begin
        -- §22 · El acuse. Si ya se entregó, no se vuelve a evaluar. Si la
        -- entrega anterior FALLÓ, se reintenta y se cuenta el intento.
        insert into quality_automation_event_deliveries
          (organization_id, event_id, rule_id, rule_version_id, run_id, status)
        values (p_organization_id, v_ev.id, v_rule.rule_id, v_rule.version_id,
                v_run, 'skipped')
        on conflict (organization_id, event_id, rule_version_id) do update
          set attempts = quality_automation_event_deliveries.attempts + 1,
              run_id = v_run, processed_at = now(), error_message = null
          where quality_automation_event_deliveries.status = 'failed'
        returning id into v_deliv;

        if v_deliv is null then
          continue;  -- ya entregado con éxito: procesar dos veces no emite dos veces
        end if;

        -- §17 · La fuente de la regla tiene que ser la del contrato. Si no lo
        -- es, la regla no habla de este sujeto por mucho que escuche el hecho.
        if v_rule.source_code <> v_con.source_code then
          update quality_automation_event_deliveries
             set status = 'skipped',
                 error_message = 'La regla observa ' || v_rule.source_code
                   || ' y el hecho es sobre ' || v_con.source_code || '.'
           where id = v_deliv;
          continue;
        end if;

        -- El sujeto observable, por el resolutor CON NOMBRE del contrato.
        v_sub_id := case v_con.resolver
          when 'direct' then v_ev.subject_id
          when 'supplier_evaluation_to_scope' then (
            select ev.scope_id from quality_supplier_evaluations ev
             where ev.organization_id = p_organization_id and ev.id = v_ev.subject_id)
        end;
        if v_sub_id is null then
          update quality_automation_event_deliveries
             set status = 'skipped', error_message = 'El hecho no resuelve a ningún sujeto observable.'
           where id = v_deliv;
          continue;
        end if;

        select * into v_src from quality_automation_sources where code = v_rule.source_code;
        select coalesce(jsonb_object_agg(field, label), '{}'::jsonb) into v_labels
          from quality_automation_source_fields where source_code = v_rule.source_code;

        -- §18 · La MISMA representación tipada que usa el barrido. No hay una
        -- segunda semántica: es literalmente el mismo proveedor, acotado.
        select * into v_subject
          from quality_automation_subjects(
                 p_organization_id, v_rule.source_code, v_today, 1, v_sub_id);

        if v_subject.subject_id is null then
          update quality_automation_event_deliveries
             set status = 'skipped', error_message = 'El sujeto ya no existe o no es observable.'
           where id = v_deliv;
          continue;
        end if;

        -- §19 · EL MISMO EVALUADOR.
        v_eval := quality_automation_evaluate(
          v_subject.facts, v_rule.conditions, v_today, v_labels);

        if not coalesce((v_eval ->> 'matched')::boolean, false) then
          update quality_automation_event_deliveries
             set status = 'not_matched' where id = v_deliv;
          continue;
        end if;

        v_match_n := v_match_n + 1;

        -- §20 · EL MISMO EJECUTOR DE SALIDAS.
        v_emit := quality_automation_emit(
          p_organization_id, v_run, v_rule.rule_id, v_rule.rule_name,
          v_rule.rule_owner_position_id, v_rule.version_id, v_rule.version_number,
          v_rule.conditions, v_rule.outputs, v_rule.severity, v_rule.signal_title,
          v_rule.source_code, v_src.domain, v_src.subject_type,
          v_subject.subject_id, v_subject.subject_label, v_subject.owner_position_id,
          v_subject.facts, v_eval ->> 'explanation', v_today, v_ev.id);

        v_sig_n   := v_sig_n   + (v_emit ->> 'signals_created')::integer;
        v_alert_n := v_alert_n + (v_emit ->> 'alerts_created')::integer;
        v_task_n  := v_task_n  + (v_emit ->> 'tasks_created')::integer;

        update quality_automation_event_deliveries
           set status = 'matched',
               signal_id = (v_emit ->> 'signal_id')::uuid,
               signal_created = (v_emit ->> 'is_new')::boolean
         where id = v_deliv;

      exception when others then
        -- §26/§58 · Una regla rota no arrastra al resto ni deshace el hecho de
        -- negocio: el hecho ya está escrito y esto ocurre después.
        v_fallos := v_fallos + 1;
        insert into quality_automation_event_deliveries
          (organization_id, event_id, rule_id, rule_version_id, run_id, status, error_message)
        values (p_organization_id, v_ev.id, v_rule.rule_id, v_rule.version_id,
                v_run, 'failed', sqlerrm)
        on conflict (organization_id, event_id, rule_version_id) do update
          set status = 'failed', error_message = sqlerrm,
              attempts = quality_automation_event_deliveries.attempts + 1,
              run_id = v_run, processed_at = now();
      end;
    end loop;
  end loop;

  -- Un renglón del informe por regla, agregando sus entregas de ESTA ejecución.
  insert into quality_automation_run_rules
    (organization_id, run_id, rule_id, rule_version_id, subjects_evaluated,
     matches, signals_created, status, error_message)
  select p_organization_id, v_run, d.rule_id, d.rule_version_id, count(*),
         count(*) filter (where d.status = 'matched'),
         count(*) filter (where d.signal_created),
         case when count(*) filter (where d.status = 'failed') > 0 then 'failed' else 'success' end,
         max(d.error_message)
    from quality_automation_event_deliveries d
   where d.run_id = v_run
   group by d.rule_id, d.rule_version_id;
  get diagnostics v_reglas = row_count;

  -- §24 · La marca de agua avanza hasta donde se miró, no hasta «ahora».
  update quality_automation_settings
     set events_processed_through = v_hasta
   where organization_id = p_organization_id;

  update quality_automation_runs
     set finished_at = clock_timestamp(),
         status = case when v_fallos = 0 then 'success'
                       when v_reglas > 0 then 'partial' else 'failed' end,
         rules_evaluated = v_reglas,
         subjects_evaluated = v_ev_n,
         matches = v_match_n,
         signals_created = v_sig_n,
         alerts_created = v_alert_n,
         tasks_created = v_task_n,
         failures = v_fallos,
         note = 'Hechos enrutados: ' || v_ev_n || '.'
   where id = v_run;

  return v_run;
end;
$$;
revoke all on function public.quality_automation_process_events(uuid, integer, date) from public, anon;
grant execute on function public.quality_automation_process_events(uuid, integer, date) to authenticated;

comment on function public.quality_automation_process_events(uuid, integer, date) is
  'QUALITY-11.1 · §10 · El puente: hechos de negocio → reglas por evento → el mismo evaluador y el mismo ejecutor de salidas que el barrido programado. Idempotente por acuse de entrega.';


-- ============================================================================
-- 6 · EL HECHO QUE FALTABA · «se registró una queja»
-- ----------------------------------------------------------------------------
-- §11/§12 · La regla era usar hechos que YA ocurren. Se auditaron los 57 tipos
-- de evento que las migraciones escriben de verdad y hay cobertura real en
-- indicadores, casos, riesgos, personas, proveedores, auditorías, voz del
-- cliente y revisión por la dirección.
--
-- Falta exactamente uno, y no es un alias inventado para pasar una prueba:
-- registrar una queja de un cliente es un hecho de negocio que el propio
-- sistema ya trata como importante —puede escalar a caso, entra en la revisión
-- por la dirección— y sin embargo no dejaba rastro en la bitácora. Se emite
-- donde debe emitirse: DENTRO de la transacción que lo registra (§28).
-- ============================================================================

create or replace function public.quality_customer_feedback_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into work_events
    (organization_id, source_domain, event_type, subject_type, subject_id,
     severity, summary, payload, dedupe_key)
  values
    (new.organization_id, 'customer',
     case when new.feedback_kind in ('complaint', 'claim')
          then 'complaint.recorded' else 'feedback.recorded' end,
     'quality_customer_feedback', new.id,
     case when new.feedback_kind in ('complaint', 'claim') then 'warning' else 'info' end,
     case when new.feedback_kind in ('complaint', 'claim')
          then 'Se registró una queja: ' else 'Se registró retroalimentación: ' end
       || new.title,
     jsonb_build_object('feedback_kind', new.feedback_kind, 'status', new.status),
     'ev:feedback:' || new.id::text)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists t_quality_customer_feedback_event on public.quality_customer_feedback;
create trigger t_quality_customer_feedback_event
  after insert on public.quality_customer_feedback
  for each row execute function public.quality_customer_feedback_event();

comment on function public.quality_customer_feedback_event() is
  'QUALITY-11.1 · §11 · Registrar una queja es un hecho de negocio y ahora deja rastro en la bitácora transversal, dentro de la misma transacción que lo registra.';


-- ============================================================================
-- 7 · EL CATÁLOGO DE EVENTOS, AMPLIADO SIN ESTRECHAR NADA
-- ============================================================================

-- Se reconstruye como la UNIÓN de lo que ya admitía más los dos hechos
-- nuevos. Estrechar un catálogo transversal es la regresión que QUALITY-10
-- estuvo a punto de introducir; aquí se impide por construcción.
do $$
declare v_tipos text[];
begin
  select array_agg(distinct t order by t) into v_tipos
    from (
      select unnest(array['complaint.recorded', 'feedback.recorded']) as t
      union
      select (regexp_matches(
                (select pg_get_constraintdef(oid) from pg_constraint
                  where conname = 'work_events_type_check'),
                '''([a-z_]+\.[a-z_]+)''', 'g'))[1] as t
    ) x;

  if array_length(v_tipos, 1) < 80 then
    raise exception 'El catálogo de eventos se estaría estrechando: % tipos.',
      array_length(v_tipos, 1);
  end if;

  execute 'alter table public.work_events drop constraint if exists work_events_type_check';
  execute 'alter table public.work_events add constraint work_events_type_check check (event_type in ('
    || (select string_agg(quote_literal(t), ', ' order by t) from unnest(v_tipos) t) || '))';
end
$$;


-- ============================================================================
-- 8 · GAP-01 · LOS DOS BARRIDOS HEREDADOS, CON PARIDAD PROGRAMADA
-- ----------------------------------------------------------------------------
-- Su lógica de negocio NO se toca: los mismos indicadores pendientes, las
-- mismas acciones vencidas, las mismas eficacias por verificar, las mismas
-- claves de dedupe y las mismas salidas. Q03 y Q04 siguen siendo los dueños.
--
-- Cambian dos cosas, y ninguna es de negocio:
--
--   1. Con sesión, los mismos permisos de siempre. Sin sesión, se ejecutan
--      como proceso del sistema —igual que los otros seis barridos desde
--      0117—. Una condición programable no puede depender de que alguien tenga
--      la pantalla abierta.
--
--   2. Aprenden a CEDER. Si la empresa adoptó la regla equivalente de
--      QUALITY-11, el barrido heredado devuelve 0 sin emitir nada. Es lo que
--      impide que la misma condición produzca dos avisos cuando conviven los
--      dos mecanismos (§8).
-- ============================================================================

create or replace function public.quality_scan_pending_measurements(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text;
  v_row   record;
  v_owner uuid;
  v_count integer := 0;
  v_key   text;
begin
  -- QUALITY-11.1 · GAP-01 · Con SESIÓN, exactamente los mismos permisos que
  -- antes. SIN sesión —el barrido programado— se ejecuta como proceso del
  -- sistema, que es lo que llevan haciendo los otros seis barridos desde 0117.
  -- Una condición de negocio programable no puede depender de que alguien
  -- tenga la pantalla abierta.
  if auth.uid() is not null then
    if not is_org_member(p_organization_id) then
      raise exception 'No perteneces a esta empresa';
    end if;
    v_role := current_org_role(p_organization_id);
    if v_role not in ('admin', 'quality') then
      raise exception 'Solo la administración o el área de calidad revisan las mediciones pendientes';
    end if;
  end if;

  -- QUALITY-11.1 · §8 · La empresa puede haber adoptado la regla equivalente
  -- de QUALITY-11. Si lo hizo, ESTE barrido calla: una condición, un aviso. La
  -- fuente de verdad es la que la empresa eligió, no las dos a la vez.
  if exists (
    select 1 from quality_automation_rules r
     where r.organization_id = p_organization_id
       and r.status = 'active'
       and r.supersedes_observer = 'quality_scan_pending_measurements')
  then
    return 0;
  end if;


  for v_row in
    select i.id as indicator_id, i.name, b.period_start, b.period_end, b.period_label
      from quality_indicators i
      join quality_indicator_configs c
        on c.indicator_id = i.id and c.effective_to is null
      cross join lateral quality_previous_period(c.frequency, current_date) b
     where i.organization_id = p_organization_id
       and i.admin_state = 'active'
       and quality_period_is_eligible(i.id, b.period_start, b.period_end)
       and not exists (
         select 1 from quality_measurements m
          where m.indicator_id = i.id
            and m.period_start = b.period_start
            and m.period_end = b.period_end
            and m.is_current)
       and not quality_period_is_closed(p_organization_id, b.period_start, b.period_end)
  loop
    v_key := v_row.indicator_id::text || ':' || v_row.period_label;
    v_owner := quality_indicator_owner_profile(v_row.indicator_id);

    insert into work_events
      (organization_id, source_domain, event_type, subject_type, subject_id, subject_period,
       severity, summary, dedupe_key, created_by)
    values
      (p_organization_id, 'indicator', 'indicator.measurement_due', 'quality_indicator',
       v_row.indicator_id, v_row.period_label, 'info',
       'Falta la medición de «' || v_row.name || '» para ' || v_row.period_label,
       'ev:due:' || v_key, auth.uid())
    on conflict do nothing;

    if v_owner is not null then
      insert into work_tasks
        (organization_id, source_domain, task_type, subject_type, subject_id,
         title, description, assignee_profile_id, status, due_at, dedupe_key, created_by)
      values
        (p_organization_id, 'indicator', 'indicator_measurement_due', 'quality_indicator',
         v_row.indicator_id,
         'Medir «' || v_row.name || '» · ' || v_row.period_label,
         'El periodo terminó el ' || to_char(v_row.period_end, 'DD/MM/YYYY') || ' y todavía no tiene medición.',
         v_owner, 'open', v_row.period_end, 'tk:due:' || v_key, auth.uid())
      on conflict do nothing;

      insert into work_alerts
        (organization_id, source_domain, alert_type, severity, subject_type, subject_id,
         title, message, recipient_profile_id, status, dedupe_key, created_by)
      values
        (p_organization_id, 'indicator', 'indicator_measurement_due', 'info',
         'quality_indicator', v_row.indicator_id,
         'Medición pendiente: ' || v_row.name,
         'Falta el resultado de ' || v_row.period_label || '.',
         v_owner, 'new', 'al:due:' || v_key, auth.uid())
      on conflict do nothing;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.work_scan_pending_actions(p_organization_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_row record; v_owner uuid; v_n integer := 0;
begin
  -- QUALITY-11.1 · GAP-01 · Ver la nota de `quality_scan_pending_measurements`.
  if auth.uid() is not null then
    if not is_org_member(p_organization_id) then
      raise exception 'No perteneces a esta empresa';
    end if;
    if not has_org_role(p_organization_id, array['admin','quality']) then
      raise exception 'Solo la administración o el área de calidad revisan los pendientes';
    end if;
  end if;

  -- QUALITY-11.1 · §8 · La empresa puede haber adoptado la regla equivalente
  -- de QUALITY-11. Si lo hizo, ESTE barrido calla: una condición, un aviso. La
  -- fuente de verdad es la que la empresa eligió, no las dos a la vez.
  if exists (
    select 1 from quality_automation_rules r
     where r.organization_id = p_organization_id
       and r.status = 'active'
       and r.supersedes_observer = 'work_scan_pending_actions')
  then
    return 0;
  end if;


  -- Acciones vencidas.
  for v_row in
    select a.* from work_actions a
     where a.organization_id = p_organization_id
       and a.status in ('planned','in_progress')
       and a.due_on is not null and a.due_on < current_date
  loop
    v_owner := case when v_row.owner_position_id is not null
                    then (select profile_id from quality_position_assignments
                           where organization_id = p_organization_id
                             and position_id = v_row.owner_position_id
                             and assignment_type = 'holder' limit 1)
                    else v_row.owner_profile_id end;
    insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                             severity, summary, dedupe_key, created_by)
    values (p_organization_id, 'action', 'action.overdue', 'work_action', v_row.id,
            'warning', 'La acción «' || v_row.title || '» venció el ' || to_char(v_row.due_on, 'DD/MM/YYYY'),
            'ev:act:overdue:' || v_row.id::text, auth.uid())
    on conflict do nothing;

    if v_owner is not null then
      insert into work_alerts (organization_id, source_domain, alert_type, subject_type, subject_id,
                               title, message, recipient_profile_id, severity, status, dedupe_key, created_by)
      values (p_organization_id, 'action', 'action_overdue', 'work_action', v_row.id,
              'Acción vencida: ' || v_row.title,
              'Venció el ' || to_char(v_row.due_on, 'DD/MM/YYYY') || ' y sigue sin completarse.',
              v_owner, 'warning', 'new', 'al:act:overdue:' || v_row.id::text, auth.uid())
      on conflict do nothing;
    end if;
    v_n := v_n + 1;
  end loop;

  -- Eficacias pendientes de verificar.
  for v_row in
    select a.* from work_actions a
     where a.organization_id = p_organization_id
       and a.requires_effectiveness and a.effectiveness_result = 'pending'
  loop
    insert into work_alerts (organization_id, source_domain, alert_type, subject_type, subject_id,
                             title, message, recipient_profile_id, severity, status, dedupe_key, created_by)
    select p_organization_id, 'action', 'effectiveness_due', 'work_action', v_row.id,
           'Falta verificar la eficacia de: ' || v_row.title,
           'La acción está completada. Queda comprobar si sirvió.',
           m.user_id, 'info', 'new', 'al:act:eff:' || v_row.id::text || ':' || m.user_id::text, auth.uid()
      from memberships m
     where m.organization_id = p_organization_id and m.status = 'active'
       and m.role_code in ('admin','quality')
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;
comment on function public.quality_scan_pending_measurements(uuid) is
  'QUALITY-03 · Mediciones pendientes. QUALITY-11.1: se ejecuta también sin sesión (barrido programado) y CEDE ante la regla de QUALITY-11 que la empresa haya adoptado para esta condición.';
comment on function public.work_scan_pending_actions(uuid) is
  'QUALITY-04 · Acciones vencidas y eficacias por verificar. QUALITY-11.1: se ejecuta también sin sesión y CEDE ante la regla de QUALITY-11 equivalente.';


-- ============================================================================
-- 9 · LAS PLANTILLAS · paridad y eventos
-- ============================================================================

alter table public.quality_automation_rule_templates
  add column if not exists trigger_kind text not null default 'schedule';
alter table public.quality_automation_rule_templates
  drop constraint if exists quality_automation_rule_templates_trigger_check;
alter table public.quality_automation_rule_templates
  add constraint quality_automation_rule_templates_trigger_check
  check (trigger_kind in ('schedule', 'event'));
alter table public.quality_automation_rule_templates
  add column if not exists event_types text[];

-- --------------------------------------------------------------------------
-- 9.1 · Las tres de PARIDAD (GAP-01)
-- --------------------------------------------------------------------------
-- Expresan, con el catálogo tipado, exactamente lo que los barridos heredados
-- detectan a mano. Adoptarlas es lo que hace que el barrido heredado ceda.
insert into public.quality_automation_rule_templates
  (code, name, description, category, source_code, autonomy_level, severity,
   signal_title, conditions, outputs, tunable, rationale, position_order,
   supersedes_observer, trigger_kind, event_types)
values
  ('indicator_measurement_due',
   'Medición pendiente del periodo cerrado',
   'El periodo terminó y el indicador sigue sin su medición. Es la condición que QUALITY-03 vigilaba con su propio barrido.',
   'indicators', 'indicator', 'A', 'info',
   'Falta la medición del periodo',
   '[{"field":"measurement_pending","operator":"equals","value":true},
     {"field":"measurement_period_closed","operator":"equals","value":false}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"subject_owner_position"},
     {"kind":"CREATE_TASK","recipient_kind":"subject_owner_position",
      "task_title":"Registrar la medición del periodo","due_in_days":7}]'::jsonb,
   '[]'::jsonb,
   'Un periodo ya cerrado formalmente no se reclama: por eso la condición mira las dos cosas. Adoptar esta regla silencia el barrido heredado, para que no avise dos veces.',
   15, 'quality_scan_pending_measurements', 'schedule', null),

  ('action_overdue',
   'Acción vencida',
   'La acción sigue planificada o en curso y su fecha de compromiso ya pasó. Es la condición que QUALITY-04 vigilaba con su propio barrido.',
   'actions', 'action', 'A', 'warning',
   'Acción vencida',
   '[{"field":"status","operator":"in","value":["planned","in_progress"]},
     {"field":"due_on","operator":"days_after","value":1}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"subject_owner_position"}]'::jsonb,
   '[{"field":"due_on","label":"Días de retraso"}]'::jsonb,
   'Vencida es vencida desde el día siguiente, que es exactamente lo que comprobaba el barrido de QUALITY-04. Adoptarla lo silencia.',
   16, 'work_scan_pending_actions', 'schedule', null),

  ('action_effectiveness_pending',
   'Eficacia sin verificar',
   'La acción exige verificar su eficacia y todavía no se ha verificado.',
   'actions', 'action', 'A', 'info',
   'Falta verificar la eficacia de la acción',
   '[{"field":"requires_effectiveness","operator":"equals","value":true},
     {"field":"effectiveness_result","operator":"equals","value":"pending"}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"rule_owner_position"}]'::jsonb,
   '[]'::jsonb,
   'La automatización recuerda que falta verificar. NO declara que la acción fue eficaz: eso lo decide una persona.',
   17, null, 'schedule', null),

-- --------------------------------------------------------------------------
-- 9.2 · Las cuatro POR EVENTO (GAP-02)
-- --------------------------------------------------------------------------
-- Pocas y seguras (§34). Ninguna se activa sola, ninguna decide nada, y las
-- cuatro escuchan hechos que el sistema YA emite.
  ('event_complaint_recorded',
   'Al registrarse una queja',
   'En cuanto se registra una queja de un cliente, se emite una señal para que alguien la mire. No abre ningún caso ni declara ninguna no conformidad.',
   'customer', 'customer_feedback', 'A', 'warning',
   'Se registró una queja de cliente',
   '[{"field":"feedback_kind","operator":"in","value":["complaint","claim"]}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"subject_owner_position"}]'::jsonb,
   '[{"field":"feedback_kind","label":"Tipos que cuentan como queja"}]'::jsonb,
   'Clasificar la queja como no conformidad es una decisión formal de una persona. Esta regla solo hace que nadie se entere tarde.',
   18, null, 'event', array['complaint.recorded']),

  ('event_supplier_evaluation_closed',
   'Al cerrar la evaluación de un proveedor',
   'Cuando se cierra una evaluación, se mira el estado del alcance evaluado y se emite una señal si cumple la condición configurada.',
   'suppliers', 'supplier_scope', 'A', 'info',
   'Evaluación de proveedor cerrada: revisar el alcance',
   '[{"field":"approval_status","operator":"is_empty"}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"subject_owner_position"}]'::jsonb,
   '[{"field":"approval_status","label":"Situación de la aprobación"}]'::jsonb,
   'Cerrar una evaluación NO aprueba ni suspende a nadie: la decisión de aprobación siguió siendo de una persona antes de QUALITY-11 y lo sigue siendo después.',
   19, null, 'event', array['supplier.evaluated']),

  ('event_measurement_out_of_target',
   'Al registrarse una medición fuera de meta',
   'En cuanto se carga una medición que queda fuera de meta, se emite la señal sin esperar al barrido de la noche.',
   'indicators', 'indicator', 'A', 'warning',
   'Medición registrada fuera de meta',
   '[{"field":"last_evaluation","operator":"in","value":["not_met","attention"]}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"subject_owner_position"}]'::jsonb,
   '[{"field":"last_evaluation","label":"Evaluaciones que cuentan"}]'::jsonb,
   'La evaluación del indicador la calcula QUALITY-03 al registrar la medición. Esta regla no la recalcula ni la discute: reacciona a ella.',
   20, null, 'event', array['indicator.target_missed', 'indicator.attention']),

  ('event_audit_finding_evaluated',
   'Al evaluarse un hallazgo de auditoría',
   'Cuando el hallazgo queda evaluado, se emite una señal si su clasificación propuesta es la que la empresa quiere vigilar.',
   'audits', 'audit_finding', 'A', 'warning',
   'Hallazgo de auditoría evaluado',
   '[{"field":"evaluation_status","operator":"equals","value":"evaluated"}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"rule_owner_position"}]'::jsonb,
   '[{"field":"proposed_classification","label":"Clasificaciones a vigilar"}]'::jsonb,
   'Formalizar la no conformidad sigue siendo de quien conduce el sistema. La señal solo dice que hay un hallazgo evaluado esperando decisión.',
   21, null, 'event', array['audit.finding_evaluated'])
on conflict (code) do nothing;


-- Instanciar una plantilla arrastra su disparo, sus hechos y a quién releva.
create or replace function public.quality_automation_instantiate_template(
  p_organization_id uuid,
  p_template_code   text,
  p_owner_position_id uuid default null,
  p_conditions      jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t    record;
  v_rule uuid;
  v_code text;
  v_n    integer;
begin
  if not quality_manages_automation(p_organization_id) then
    raise exception 'Tu rol no permite crear reglas de automatización.';
  end if;
  select * into v_t from quality_automation_rule_templates where code = p_template_code;
  if v_t.code is null then
    raise exception 'Esa plantilla no existe.';
  end if;

  select count(*) + 1 into v_n from quality_automation_rules
   where organization_id = p_organization_id;
  v_code := 'AUT-' || lpad(v_n::text, 3, '0');

  insert into quality_automation_rules
    (organization_id, code, name, description, category, source_code,
     owner_position_id, status, autonomy_level, template_code, supersedes_observer)
  values (p_organization_id, v_code, v_t.name, v_t.description, v_t.category,
          v_t.source_code, p_owner_position_id, 'draft', v_t.autonomy_level,
          v_t.code, v_t.supersedes_observer)
  returning id into v_rule;

  insert into quality_automation_rule_versions
    (organization_id, rule_id, version_number, status, trigger_kind,
     schedule_frequency, event_types, conditions, outputs, severity, signal_title,
     change_note)
  values (p_organization_id, v_rule, 1, 'draft', v_t.trigger_kind, 'daily',
          v_t.event_types,
          coalesce(p_conditions, v_t.conditions), v_t.outputs, v_t.severity,
          v_t.signal_title,
          'Creada desde la plantilla «' || v_t.name || '».');

  return v_rule;
end;
$$;
revoke all on function public.quality_automation_instantiate_template(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.quality_automation_instantiate_template(uuid, text, uuid, jsonb) to authenticated;


-- ============================================================================
-- 10 · EL CATÁLOGO DE HECHOS OBSERVABLES
-- ----------------------------------------------------------------------------
-- §11 · Se auditaron los 57 tipos de evento que las migraciones escriben de
-- verdad. Aquí no están los 57: están los que son HECHOS DE NEGOCIO con un
-- sujeto que el catálogo de fuentes sabe observar.
--
-- Quedan fuera, y no por descuido:
--
--   · los que emite la propia automatización (`automation.*`) — §25;
--   · los que emite un BARRIDO y no una persona (`indicator.measurement_due`,
--     `action.overdue`): no son hechos nuevos, son la misma condición contada
--     otra vez, y reaccionar a ellos sería observar el eco;
--   · los de dominios que QUALITY-11 no observa (pasaportes textiles, etc.).
--
-- Igual que el catálogo de fuentes: de plataforma, cerrado, de solo lectura.
-- ============================================================================

create table if not exists public.quality_automation_event_catalog (
  event_type   text primary key,
  label        text not null,
  domain       text not null,
  subject_type text not null,
  description  text,
  position_order integer not null default 1
);

comment on table public.quality_automation_event_catalog is
  'QUALITY-11.1 · §11 · Los hechos de negocio a los que una regla puede reaccionar. El constructor ofrece esta lista; el navegador nunca manda un tipo de evento inventado.';

revoke all on table public.quality_automation_event_catalog from anon, authenticated;
grant select on table public.quality_automation_event_catalog to authenticated;

insert into public.quality_automation_event_catalog
  (event_type, label, domain, subject_type, description, position_order)
values
  ('indicator.target_missed', 'Se registró una medición fuera de meta', 'indicators',
   'quality_indicator', 'La medición cargada dejó el indicador por debajo (o por encima) de su meta.', 1),
  ('indicator.attention', 'Se registró una medición en zona de atención', 'indicators',
   'quality_indicator', 'La medición cargada dejó el indicador en la banda de atención.', 2),
  ('case.opened', 'Se abrió un caso', 'cases', 'work_case', null, 3),
  ('case.classified', 'Se clasificó un caso', 'cases', 'work_case',
   'Alguien decidió qué es el caso. La clasificación la hace una persona; la señal solo avisa.', 4),
  ('risk.assessed', 'Se valoró un riesgo', 'risks', 'quality_risk', null, 5),
  ('risk.reviewed', 'Se revisó un riesgo', 'risks', 'quality_risk', null, 6),
  ('risk.materialized', 'Un riesgo se materializó', 'risks', 'quality_risk', null, 7),
  ('control.reviewed', 'Se verificó un control', 'risks', 'quality_control', null, 8),
  ('opportunity.assessed', 'Se valoró una oportunidad', 'risks', 'quality_opportunity', null, 9),
  ('performance.evaluation_closed', 'Se cerró una evaluación de desempeño', 'people',
   'quality_performance_evaluation', null, 10),
  ('supplier.classified', 'Se clasificó la criticidad de un proveedor', 'suppliers',
   'quality_supplier_scope', null, 11),
  ('supplier.evaluated', 'Se cerró la evaluación de un proveedor', 'suppliers',
   'quality_supplier_evaluation',
   'El hecho es sobre la evaluación; lo que se observa es el alcance evaluado.', 12),
  ('complaint.recorded', 'Se registró una queja', 'customer', 'quality_customer_feedback', null, 13),
  ('feedback.recorded', 'Se registró retroalimentación de cliente', 'customer',
   'quality_customer_feedback', null, 14),
  ('campaign.metrics_computed', 'Se calcularon las métricas de una campaña', 'customer',
   'quality_survey_campaign', 'Lo que se observa son agregados: la campaña, nunca una respuesta.', 15),
  ('audit.finding_evaluated', 'Se evaluó un hallazgo de auditoría', 'audits',
   'quality_audit_finding', null, 16),
  ('audit.report_issued', 'Se emitió el informe de una auditoría', 'audits',
   'quality_audit', null, 17),
  ('audit.closed', 'Se cerró una auditoría', 'audits', 'quality_audit', null, 18),
  ('management_review.inputs_prepared', 'Se prepararon las entradas de la revisión',
   'management_review', 'quality_management_review', null, 19),
  ('management_review.closed', 'Se cerró la revisión por la dirección',
   'management_review', 'quality_management_review', null, 20)
on conflict (event_type) do nothing;


-- ============================================================================
-- 11 · LA VALIDACIÓN, AHORA TAMBIÉN PARA REGLAS POR EVENTO
-- ----------------------------------------------------------------------------
-- Falla cerrada, como la de QUALITY-11: si la regla escucha un hecho que no
-- existe, o un hecho cuyo sujeto no es el que la regla observa, no se publica.
-- ============================================================================

create or replace function public.quality_automation_validate_event_version(p_version_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_v      record;
  v_rule   record;
  v_t      text;
  v_cat    record;
  v_con    record;
  v_errors text[] := array[]::text[];
begin
  select * into v_v from quality_automation_rule_versions where id = p_version_id;
  if v_v.id is null then return array['Esa versión de regla no existe.']; end if;
  if v_v.trigger_kind <> 'event' then return v_errors; end if;

  select * into v_rule from quality_automation_rules where id = v_v.rule_id;

  if v_v.event_types is null or array_length(v_v.event_types, 1) is null then
    return array['Una regla por evento tiene que decir a qué hecho reacciona.'];
  end if;

  foreach v_t in array v_v.event_types loop
    select * into v_cat from quality_automation_event_catalog where event_type = v_t;
    if v_cat.event_type is null then
      v_errors := v_errors || ('«' || v_t || '» no es un hecho observable del catálogo.');
      continue;
    end if;
    select * into v_con from quality_automation_event_contracts
     where subject_type = v_cat.subject_type;
    if v_con.subject_type is null then
      v_errors := v_errors || ('El hecho «' || v_cat.label
        || '» no tiene contrato de sujeto registrado.');
      continue;
    end if;
    if v_con.source_code <> v_rule.source_code then
      v_errors := v_errors || ('El hecho «' || v_cat.label || '» habla de '
        || v_con.source_code || ', y esta regla observa ' || v_rule.source_code || '.');
    end if;
  end loop;

  return v_errors;
exception when others then
  return array['La configuración del disparo por evento no se pudo leer: ' || sqlerrm];
end;
$$;
revoke all on function public.quality_automation_validate_event_version(uuid) from public, anon;
grant execute on function public.quality_automation_validate_event_version(uuid) to authenticated;


-- La validación general suma la del disparo por evento: una sola puerta.
create or replace function public.quality_automation_validate_version(p_version_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_v      record;
  v_rule   record;
  v_cond   jsonb;
  v_out    jsonb;
  v_field  record;
  v_errors text[] := array[]::text[];
  v_tipo   text;
begin
  select * into v_v from quality_automation_rule_versions where id = p_version_id;
  if v_v.id is null or not is_org_member(v_v.organization_id) then
    return jsonb_build_object('valid', false,
      'errors', array['Esa versión de regla no existe.']);
  end if;
  select * into v_rule from quality_automation_rules where id = v_v.rule_id;

  if not exists (select 1 from quality_automation_sources where code = v_rule.source_code) then
    v_errors := v_errors || 'La fuente observable no existe en el catálogo.';
  end if;

  if jsonb_array_length(v_v.conditions) = 0 then
    v_errors := v_errors || 'La regla no tiene ninguna condición: marcaría a todos los sujetos.';
  end if;

  for v_cond in select * from jsonb_array_elements(v_v.conditions) loop
    select * into v_field from quality_automation_source_fields
     where source_code = v_rule.source_code and field = (v_cond ->> 'field');
    if v_field.field is null then
      v_errors := v_errors || ('El campo «' || coalesce(v_cond ->> 'field', '—')
        || '» no pertenece a la fuente ' || v_rule.source_code || '.');
      continue;
    end if;
    if not ((v_cond ->> 'operator') = any (v_field.allowed_operators)) then
      v_errors := v_errors || ('El operador «' || coalesce(v_cond ->> 'operator', '—')
        || '» no se puede aplicar a ' || v_field.label || '.');
      continue;
    end if;
    -- El valor, según el tipo del campo y el operador.
    if (v_cond ->> 'operator') not in ('is_empty', 'is_not_empty') then
      if (v_cond -> 'value') is null then
        v_errors := v_errors || ('Falta el valor de la condición sobre ' || v_field.label || '.');
      elsif (v_cond ->> 'operator') in ('in', 'not_in') then
        if jsonb_typeof(v_cond -> 'value') <> 'array' then
          v_errors := v_errors || ('La condición sobre ' || v_field.label
            || ' necesita una lista de valores.');
        end if;
      elsif (v_cond ->> 'operator') in ('days_before', 'days_after',
                                        'consecutive_count', 'strictly_decreasing') then
        if (v_cond -> 'value') #>> '{}' !~ '^[0-9]+$' then
          v_errors := v_errors || ('La condición sobre ' || v_field.label
            || ' necesita un número entero de días o periodos.');
        end if;
      elsif v_field.data_type = 'number' then
        if (v_cond -> 'value') #>> '{}' !~ '^-?[0-9]+(\.[0-9]+)?$' then
          v_errors := v_errors || (v_field.label || ' necesita un número.');
        end if;
      elsif v_field.data_type = 'boolean' then
        if (v_cond -> 'value') #>> '{}' not in ('true', 'false') then
          v_errors := v_errors || (v_field.label || ' solo admite sí o no.');
        end if;
      elsif v_field.enum_values is not null then
        if (v_cond ->> 'operator') in ('equals', 'not_equals')
           and not ((v_cond -> 'value') #>> '{}' = any (v_field.enum_values)) then
          v_errors := v_errors || ('«' || ((v_cond -> 'value') #>> '{}')
            || '» no es un valor posible de ' || v_field.label || '.');
        end if;
      end if;
    end if;
  end loop;

  if jsonb_array_length(v_v.outputs) = 0 then
    v_errors := v_errors || 'La regla no produce ninguna salida: no serviría de nada.';
  end if;

  for v_out in select * from jsonb_array_elements(v_v.outputs) loop
    v_tipo := v_out ->> 'kind';
    -- §110/§111/§112 · El catálogo CERRADO de salidas. Nada de SQL, HTTP,
    -- correo arbitrario, no conformidades ni IA.
    if v_tipo is null or v_tipo not in ('CREATE_SIGNAL', 'CREATE_ALERT', 'CREATE_TASK') then
      v_errors := v_errors || ('Salida no permitida: «' || coalesce(v_tipo, '—')
        || '». Solo se pueden emitir señales, alertas y tareas.');
      continue;
    end if;
    if v_tipo in ('CREATE_ALERT', 'CREATE_TASK') then
      if (v_out ->> 'recipient_kind') not in
         ('rule_owner_position', 'subject_owner_position', 'specific_position') then
        v_errors := v_errors || 'El destinatario tiene que ser un cargo del catálogo.';
      end if;
      if (v_out ->> 'recipient_kind') = 'specific_position' then
        if not exists (select 1 from quality_positions
                        where organization_id = v_v.organization_id
                          and id = (v_out ->> 'position_id')::uuid) then
          v_errors := v_errors || 'El cargo destinatario no es de esta empresa.';
        end if;
      end if;
    end if;
  end loop;

  -- La primera salida tiene que ser la señal: alertas y tareas la referencian.
  if jsonb_array_length(v_v.outputs) > 0
     and (v_v.outputs -> 0 ->> 'kind') <> 'CREATE_SIGNAL' then
    v_errors := v_errors || 'La primera salida tiene que ser la señal: la alerta y la tarea la referencian.';
  end if;

  -- QUALITY-11.1 · §11 · Y si la regla reacciona a un hecho, el hecho tiene que
  -- existir y hablar del mismo sujeto que la regla observa.
  v_errors := v_errors || quality_automation_validate_event_version(p_version_id);

  return jsonb_build_object(
    'valid', array_length(v_errors, 1) is null,
    'errors', coalesce(v_errors, array[]::text[]));
exception when others then
  return jsonb_build_object('valid', false,
    'errors', array['La configuración de la regla no se pudo leer: ' || sqlerrm]);
end;
$$;revoke all on function public.quality_automation_validate_version(uuid) from public, anon;
grant execute on function public.quality_automation_validate_version(uuid) to authenticated;


-- ============================================================================
-- 12 · RLS Y PRIVILEGIOS DE LO NUEVO
-- ----------------------------------------------------------------------------
-- Los acuses de entrega son historia, como las ejecuciones: se leen y no se
-- escriben desde una sesión. Los dos catálogos son de plataforma.
-- ============================================================================

alter table public.quality_automation_event_deliveries enable row level security;

drop policy if exists quality_automation_event_deliveries_select
  on public.quality_automation_event_deliveries;
create policy quality_automation_event_deliveries_select
  on public.quality_automation_event_deliveries
  for select to authenticated using (is_org_member(organization_id));

revoke all on table public.quality_automation_event_deliveries from anon, authenticated;
grant select on table public.quality_automation_event_deliveries to authenticated;

-- El disparador que impide borrar la historia de la automatización alcanza
-- también a los acuses: son la prueba de qué hecho vio qué regla.
drop trigger if exists t_quality_automation_event_deliveries_no_delete
  on public.quality_automation_event_deliveries;
create trigger t_quality_automation_event_deliveries_no_delete
  before delete on public.quality_automation_event_deliveries
  for each row execute function public.quality_automation_history_is_immutable();


-- ============================================================================
-- 13 · LAS VISTAS · el origen a la vista (§38)
-- ============================================================================

-- Se recrea porque añade columnas EN MEDIO: `create or replace view` solo
-- deja añadir al final, y poner el origen del hecho junto a la regla es lo
-- que hace que la ficha se lea sola.
drop view if exists public.v_quality_signal_overview;
create view public.v_quality_signal_overview
with (security_invoker = true) as
select
  s.organization_id,
  s.id                as signal_id,
  s.domain, s.source_code,
  src.label           as source_label,
  src.deep_link,
  s.subject_type, s.subject_id, s.subject_label,
  s.severity, s.status, s.title, s.explanation, s.source_snapshot,
  s.first_detected_at, s.last_detected_at, s.detection_count,
  s.acknowledged_at, s.resolved_at, s.resolution_kind, s.resolution_note,
  s.recipient_unresolved,
  r.id                as rule_id,
  r.code              as rule_code,
  r.name              as rule_name,
  v.id                as rule_version_id,
  v.version_number    as rule_version_number,
  s.run_id,
  -- QUALITY-11.1 · §38 · De dónde vino: del hecho que ocurrió, o del barrido.
  s.source_event_id,
  ev.event_type       as source_event_type,
  cat.label           as source_event_label,
  ev.occurred_at      as source_event_at,
  (s.source_event_id is not null) as from_event,
  coalesce(al.total, 0)  as alert_count,
  coalesce(tk.total, 0)  as task_count,
  coalesce(tk.abiertas, 0) as open_task_count
from public.quality_signals s
join public.quality_automation_sources src on src.code = s.source_code
left join public.quality_automation_rules r
  on r.organization_id = s.organization_id and r.id = s.rule_id
left join public.quality_automation_rule_versions v
  on v.organization_id = s.organization_id and v.id = s.rule_version_id
left join public.work_events ev on ev.id = s.source_event_id
left join public.quality_automation_event_catalog cat on cat.event_type = ev.event_type
left join lateral (
  select count(*) as total from public.work_alerts w
   where w.organization_id = s.organization_id
     and w.dedupe_key like 'auto_alert:' || s.id::text || ':%') al on true
left join lateral (
  select count(*) as total,
         count(*) filter (where w.status in ('open', 'in_progress')) as abiertas
    from public.work_tasks w
   where w.organization_id = s.organization_id
     and w.dedupe_key like 'auto_task:' || s.id::text || ':%') tk on true;

revoke all on public.v_quality_signal_overview from anon, authenticated;
grant select on public.v_quality_signal_overview to authenticated;

comment on view public.v_quality_signal_overview is
  'QUALITY-11.1 · La señal con su regla, su versión y —si vino por el puente— el hecho de negocio que la disparó.';
