-- ============================================================================
-- 0129_quality_automation_observation.sql · Sprint QUALITY-11
-- AUTOMATIZACIÓN DETERMINÍSTICA · REGLAS · SEÑALES · EJECUCIONES · OBSERVACIÓN
-- ============================================================================
-- Append-only. No edita ninguna migración anterior, no repara historial y no
-- siembra datos de negocio: lo único que siembra son catálogos, que son
-- estructura.
--
-- QUÉ ES ESTE DOMINIO
--
-- La capa que convierte una plataforma que REGISTRA en una plataforma que
-- OBSERVA. Todo lo que QUALITY-01…10 dejó escrito —indicadores, objetivos,
-- casos, acciones, riesgos, personas, proveedores, clientes, auditorías y la
-- revisión por la dirección— se mira con reglas explícitas, y cuando una
-- condición se cumple se emite una SEÑAL que dice qué se detectó, dónde,
-- cuándo, con qué regla, con qué versión y con qué datos.
--
-- LAS SIETE SEPARACIONES QUE SOSTIENEN EL MODELO
--
--   EVENTO ≠ OBSERVACIÓN
--     El evento dice «pasó algo el 12/03». La observación dice «hoy la
--     condición se cumple». Un certificado que venció es un evento; que esté
--     vencido es un estado. Hacen falta los dos caminos.
--
--   OBSERVACIÓN ≠ SEÑAL
--     La observación es el resultado de evaluar. La señal es el objeto de
--     negocio que merece atención, con su historia y su explicación. Se
--     evalúan miles de sujetos; solo unos pocos producen señal.
--
--   SEÑAL ≠ ALERTA
--     La señal es el hecho detectado. La alerta es el mecanismo de atención
--     hacia una persona. Descartar la alerta no borra el hecho.
--
--   ALERTA ≠ TAREA
--     «Mira esto» no es «haz esto». Una señal puede producir alerta sin tarea,
--     tarea sin alerta, las dos o ninguna.
--
--   TAREA ≠ ACCIÓN
--     La tarea es trabajo operativo. La acción es el objeto formal de
--     QUALITY-04, con su eficacia. Ninguna automatización crea acciones
--     correctivas.
--
--   CONDICIÓN ≠ DECISIÓN
--     Que la condición se cumpla no decide nada. Ninguna regla declara una no
--     conformidad, aprueba un proveedor, declara competente a una persona,
--     acepta un riesgo residual, da una acción por eficaz, cierra una
--     auditoría ni cierra una revisión por la dirección.
--
--   AUTOMATIZACIÓN DETERMINÍSTICA ≠ IA
--     La misma regla sobre los mismos datos produce siempre el mismo
--     resultado. No hay modelos, ni embeddings, ni prompts. Eso es QUALITY-12.
--
-- LO QUE NO SE CONSTRUYE AQUÍ
--
--   · Un segundo motor de tareas — se reusa `work_tasks`.
--   · Un segundo motor de alertas — se reusa `work_alerts`.
--   · Un segundo motor de acciones — se reusa `work_actions`.
--   · Un segundo registro de auditoría — `audit_log` es técnico y ahí se queda.
--   · Un lenguaje de programación — el constructor de reglas es cerrado:
--     fuentes tipadas, operadores tipados y salidas tipadas.
--   · Webhooks, HTTP arbitrario, SQL arbitrario ni correo masivo.
--   · Inteligencia artificial (AT-01, AT-26).
--
-- POR QUÉ LOS BUCLES SON IMPOSIBLES, Y NO SOLO IMPROBABLES
--
-- El catálogo de fuentes observables NO contiene ninguna salida de la
-- automatización: ni tareas, ni alertas, ni señales. Una regla no puede
-- observar lo que otra regla produjo. El grafo tiene profundidad uno por
-- construcción, así que no hace falta un límite de recursión — hace falta que
-- nadie añada esa fuente, y hay una prueba que lo vigila.
-- ============================================================================


-- ============================================================================
-- 1 · AJUSTES DEL MOTOR POR EMPRESA (§47, §48, §67)
-- ----------------------------------------------------------------------------
-- §48 · «Vence hoy» tiene que significar el día de negocio correcto. El reloj
-- es del servidor —nunca del navegador—, pero el DÍA se resuelve en la zona
-- horaria de la empresa. Sin esto, una automatización avisaría con un día de
-- adelanto o de retraso a media plataforma.
-- ============================================================================

create table public.quality_automation_settings (
  organization_id   uuid primary key references public.organizations (id) on delete restrict,

  is_enabled        boolean not null default true,
  business_timezone text not null default 'UTC',

  last_run_at       timestamptz,
  last_run_status   text,
  last_success_at   timestamptz,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_automation_settings_status_check
    check (last_run_status is null
           or last_run_status in ('success', 'partial', 'failed'))
);

comment on table public.quality_automation_settings is
  'QUALITY-11 · §47/§48 · El reloj es del servidor; el DÍA de negocio se resuelve en la zona horaria de la empresa. Sin esto, «vence hoy» avisaría con un día de desfase.';

create trigger t_quality_automation_settings_updated
  before update on public.quality_automation_settings
  for each row execute function public.set_updated_at();


-- §47 · El «ahora» de negocio. Una sola función lo resuelve, y las pruebas
-- pueden pasarle una fecha explícita sin que exista ningún reloj manipulable
-- en producción: el parámetro es opcional y solo lo usa quien llama al motor.
create or replace function public.quality_automation_business_today(
  p_organization_id uuid
)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce(
    (select business_timezone from quality_automation_settings
      where organization_id = p_organization_id), 'UTC'))::date;
$$;
revoke all on function public.quality_automation_business_today(uuid) from public, anon;
grant execute on function public.quality_automation_business_today(uuid) to authenticated;


-- ============================================================================
-- 2 · EL CATÁLOGO TIPADO DE FUENTES (§27, §28, §29)
-- ----------------------------------------------------------------------------
-- Lo que una regla puede observar está escrito aquí, y solo aquí. El navegador
-- elige un CÓDIGO de esta lista; nunca manda una tabla, una columna, un WHERE
-- ni una expresión. Es la diferencia entre un constructor de reglas y un motor
-- de consultas arbitrarias con formulario.
--
-- Y hay una ausencia deliberada: ninguna fuente observa tareas, alertas ni
-- señales. Ver el encabezado.
-- ============================================================================

create table public.quality_automation_sources (
  code            text primary key,
  domain          text not null,
  label           text not null,
  description     text not null,
  -- Con qué se referencia el sujeto en `work_alerts`/`work_tasks`/señales.
  subject_type    text not null,
  -- A dónde lleva el enlace de profundización.
  deep_link       text,
  -- §32 · De dónde sale el cargo responsable del sujeto, cuando lo tiene.
  has_owner_position boolean not null default false,
  supported_triggers text[] not null default array['schedule'],
  position_order  integer not null,

  constraint quality_automation_sources_domain_check
    check (domain in ('documents', 'indicators', 'objectives', 'cases', 'actions',
                      'risks', 'people', 'suppliers', 'customer', 'audits',
                      'management_review')),
  constraint quality_automation_sources_triggers_check
    check (supported_triggers <@ array['schedule', 'event'])
);

comment on table public.quality_automation_sources is
  'QUALITY-11 · §27/§29 · Lo que una regla PUEDE observar. El navegador elige un código de esta lista: nunca manda tabla, columna ni SQL. Y ninguna fuente observa salidas de la automatización, que es lo que hace imposible un bucle.';

create table public.quality_automation_source_fields (
  source_code       text not null references public.quality_automation_sources (code) on delete cascade,
  field             text not null,
  label             text not null,
  data_type         text not null,
  -- Qué operadores admite ESTE campo. No todos valen para todo.
  allowed_operators text[] not null,
  -- Los valores permitidos, cuando el campo es un enumerado.
  enum_values       text[],
  unit              text,
  position_order    integer not null default 1,

  primary key (source_code, field),
  constraint quality_automation_source_fields_type_check
    check (data_type in ('text', 'number', 'date', 'boolean',
                         'bool_series', 'number_series')),
  constraint quality_automation_source_fields_ops_check
    check (allowed_operators <@ array[
      'equals', 'not_equals', 'greater_than', 'less_than', 'gte', 'lte',
      'in', 'not_in', 'is_empty', 'is_not_empty',
      'days_before', 'days_after', 'consecutive_count', 'strictly_decreasing'])
);

comment on table public.quality_automation_source_fields is
  'QUALITY-11 · §26/§28 · Cada campo declara su tipo y los operadores que admite. «Fecha de reevaluación mayor que Alta» no se puede ni escribir.';

revoke all on table public.quality_automation_sources from anon, authenticated;
revoke all on table public.quality_automation_source_fields from anon, authenticated;
grant select on table public.quality_automation_sources to authenticated;
grant select on table public.quality_automation_source_fields to authenticated;


-- ----------------------------------------------------------------------------
-- 2.1 · Las dieciséis fuentes
-- ----------------------------------------------------------------------------

insert into public.quality_automation_sources
  (code, domain, label, description, subject_type, deep_link,
   has_owner_position, supported_triggers, position_order)
values
  ('document_revision', 'documents', 'Revisión de documento',
   'Revisiones con fecha de entrada en vigor o de revisión prevista.',
   'trazadoc_document', '/quality/documents', false, array['schedule'], 1),
  ('indicator', 'indicators', 'Indicador',
   'Indicadores activos con su última evaluación, su serie reciente y su medición pendiente.',
   'quality_indicator', '/quality/indicators', true, array['schedule', 'event'], 2),
  ('objective', 'objectives', 'Objetivo de calidad',
   'Objetivos vigentes con el estado de sus indicadores.',
   'quality_objective', '/quality/objectives', true, array['schedule'], 3),
  ('case', 'cases', 'Caso',
   'Casos abiertos con su clasificación y su antigüedad.',
   'work_case', '/quality/cases', true, array['schedule', 'event'], 4),
  ('action', 'actions', 'Acción',
   'Acciones con su fecha límite y su estado de eficacia.',
   'work_action', '/quality/cases', true, array['schedule', 'event'], 5),
  ('risk', 'risks', 'Riesgo',
   'Riesgos abiertos con su nivel actual, su revisión prevista y su tratamiento.',
   'quality_risk', '/quality/risks', true, array['schedule'], 6),
  ('control', 'risks', 'Control',
   'Controles con su verificación prevista.',
   'quality_control', '/quality/risks', true, array['schedule'], 7),
  ('opportunity', 'risks', 'Oportunidad',
   'Oportunidades identificadas y su decisión de tratamiento.',
   'quality_opportunity', '/quality/risks', true, array['schedule'], 8),
  ('competency_evidence', 'people', 'Evidencia de competencia',
   'Evidencias con fecha de caducidad. AGREGADO: no evalúa a la persona.',
   'quality_competency_evidence', '/quality/people', false, array['schedule'], 9),
  ('performance_evaluation', 'people', 'Evaluación de desempeño',
   'Evaluaciones de ciclos abiertos pendientes de cerrar.',
   'quality_performance_evaluation', '/quality/people/performance', false, array['schedule'], 10),
  ('knowledge_item', 'people', 'Conocimiento crítico',
   'Conocimientos con su continuidad y su número de poseedores.',
   'quality_knowledge_item', '/quality/people/knowledge', false, array['schedule'], 11),
  ('supplier_scope', 'suppliers', 'Alcance de proveedor',
   'Alcances con su criticidad, su aprobación y su reevaluación prevista.',
   'quality_supplier_scope', '/quality/suppliers', true, array['schedule'], 12),
  ('customer_feedback', 'customer', 'Manifestación de cliente',
   'Quejas, reclamos y sugerencias con su antigüedad y su estado.',
   'quality_customer_feedback', '/quality/customer-voice/feedback', true, array['schedule', 'event'], 13),
  ('customer_metric', 'customer', 'Métrica de satisfacción',
   'Resultados de métricas por campaña, AGREGADOS. Nunca respuestas individuales.',
   'quality_survey_campaign', '/quality/customer-voice/campaigns', false, array['schedule'], 14),
  ('audit', 'audits', 'Auditoría',
   'Auditorías con su fecha vigente, su ejecución y su informe.',
   'quality_audit', '/quality/audits', true, array['schedule'], 15),
  ('audit_finding', 'audits', 'Hallazgo de auditoría',
   'Hallazgos con su clasificación propuesta y su evaluación pendiente.',
   'quality_audit_finding', '/quality/audits/findings', false, array['schedule'], 16),
  ('management_review', 'management_review', 'Revisión por la dirección',
   'Revisiones con su periodo, sus entradas pendientes y su próxima fecha.',
   'quality_management_review', '/quality/management-review', true, array['schedule'], 17),
  ('management_review_input', 'management_review', 'Entrada de la revisión',
   'Entradas con su estado y si la fuente cambió después de prepararlas.',
   'quality_management_review_input', '/quality/management-review', false, array['schedule'], 18)
on conflict (code) do nothing;


insert into public.quality_automation_source_fields
  (source_code, field, label, data_type, allowed_operators, enum_values, unit, position_order)
values
  -- Documentos
  ('document_revision', 'effective_from', 'Entra en vigor el', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 1),
  ('document_revision', 'review_due_on', 'Revisión prevista para', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 2),
  ('document_revision', 'workflow_state', 'Estado del flujo', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['draft', 'in_review', 'in_approval', 'effective', 'obsolete'], null, 3),

  -- Indicadores
  ('indicator', 'last_evaluation', 'Última evaluación', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['complies', 'attention', 'not_met', 'no_target', 'no_data'], null, 1),
  ('indicator', 'last_value', 'Último valor', 'number',
   array['greater_than', 'less_than', 'gte', 'lte', 'equals', 'is_empty', 'is_not_empty'], null, null, 2),
  ('indicator', 'target_value', 'Meta', 'number',
   array['greater_than', 'less_than', 'gte', 'lte', 'is_empty', 'is_not_empty'], null, null, 3),
  ('indicator', 'measurement_pending', 'Medición pendiente', 'boolean',
   array['equals'], null, null, 4),
  ('indicator', 'next_measurement_due_on', 'Próxima medición', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 5),
  -- §117 · La serie de evaluaciones, de la más antigua a la más reciente.
  ('indicator', 'evaluation_series_out_of_target', 'Periodos fuera de meta', 'bool_series',
   array['consecutive_count'], null, 'periodos', 6),
  -- §115 · La serie de valores, para tendencia DETERMINÍSTICA. No es IA.
  ('indicator', 'value_series', 'Serie de valores', 'number_series',
   array['strictly_decreasing'], null, null, 7),

  -- Objetivos
  ('objective', 'indicators_without_data', 'Indicadores sin dato', 'number',
   array['greater_than', 'gte', 'equals'], null, null, 1),
  ('objective', 'indicators_not_met', 'Indicadores que no cumplen', 'number',
   array['greater_than', 'gte', 'equals'], null, null, 2),
  ('objective', 'admin_state', 'Estado', 'text',
   array['equals', 'not_equals', 'in'], array['draft', 'active', 'closed'], null, 3),
  ('objective', 'period_end', 'Fin del periodo', 'date',
   array['days_before', 'days_after'], null, null, 4),

  -- Casos
  ('case', 'status', 'Estado', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['draft', 'open', 'in_analysis', 'in_action', 'pending_effectiveness', 'closed'], null, 1),
  ('case', 'classification', 'Clasificación', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['pending', 'nonconformity', 'observation', 'improvement_opportunity', 'not_applicable'], null, 2),
  ('case', 'detected_on', 'Detectado el', 'date',
   array['days_after', 'days_before'], null, null, 3),
  ('case', 'open_action_count', 'Acciones abiertas', 'number',
   array['equals', 'greater_than', 'gte'], null, null, 4),

  -- Acciones
  ('action', 'due_on', 'Fecha límite', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 1),
  ('action', 'status', 'Estado', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['planned', 'in_progress', 'completed', 'cancelled'], null, 2),
  ('action', 'effectiveness_result', 'Eficacia', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['not_required', 'pending', 'effective', 'not_effective'], null, 3),
  ('action', 'completed_on', 'Completada el', 'date',
   array['days_after', 'days_before', 'is_empty', 'is_not_empty'], null, null, 4),
  ('action', 'action_kind', 'Tipo', 'text',
   array['equals', 'in', 'not_in'],
   array['containment', 'correction', 'corrective', 'improvement'], null, 5),

  -- Riesgos
  ('risk', 'next_review_on', 'Próxima revisión', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 1),
  ('risk', 'current_level', 'Nivel actual', 'text',
   array['equals', 'not_equals', 'in', 'not_in'], null, null, 2),
  ('risk', 'current_is_acceptable', 'Dentro del criterio aceptable', 'boolean',
   array['equals'], null, null, 3),
  ('risk', 'treatment_status', 'Estado del tratamiento', 'text',
   array['equals', 'not_equals', 'in', 'not_in', 'is_empty', 'is_not_empty'], null, null, 4),
  ('risk', 'treatment_review_on', 'Revisión del tratamiento', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 5),
  ('risk', 'overdue_action_count', 'Acciones vencidas', 'number',
   array['greater_than', 'gte', 'equals'], null, null, 6),

  -- Controles
  ('control', 'status', 'Estado', 'text',
   array['equals', 'not_equals', 'in'], array['draft', 'active', 'retired'], null, 1),
  ('control', 'last_verified_on', 'Última verificación', 'date',
   array['days_after', 'is_empty', 'is_not_empty'], null, null, 2),

  -- Oportunidades
  ('opportunity', 'status', 'Estado', 'text',
   array['equals', 'not_equals', 'in'], null, null, 1),
  ('opportunity', 'treatment_decision', 'Decisión de tratamiento', 'text',
   array['is_empty', 'is_not_empty', 'equals'], null, null, 2),
  ('opportunity', 'identified_on', 'Identificada el', 'date',
   array['days_after', 'days_before'], null, null, 3),

  -- Personas · SIEMPRE sobre el objeto del SGC, nunca sobre el desempeño
  ('competency_evidence', 'valid_until', 'Válida hasta', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 1),
  ('competency_evidence', 'status', 'Estado', 'text',
   array['equals', 'not_equals', 'in'], null, null, 2),
  ('performance_evaluation', 'status', 'Estado', 'text',
   array['equals', 'not_equals', 'in'], null, null, 1),
  ('performance_evaluation', 'cycle_period_end', 'Fin del ciclo', 'date',
   array['days_before', 'days_after'], null, null, 2),
  ('knowledge_item', 'criticality', 'Criticidad', 'text',
   array['equals', 'in', 'not_in'], null, null, 1),
  ('knowledge_item', 'holder_count', 'Número de poseedores', 'number',
   array['equals', 'less_than', 'lte'], null, null, 2),
  ('knowledge_item', 'continuity_attention', 'Requiere atención de continuidad', 'boolean',
   array['equals'], null, null, 3),

  -- Proveedores
  ('supplier_scope', 'next_review_on', 'Próxima reevaluación', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 1),
  ('supplier_scope', 'criticality_label', 'Criticidad', 'text',
   array['equals', 'not_equals', 'in', 'not_in', 'is_empty'], null, null, 2),
  ('supplier_scope', 'approval_status', 'Estado de aprobación', 'text',
   array['equals', 'not_equals', 'in', 'not_in', 'is_empty'], null, null, 3),
  ('supplier_scope', 'approval_valid_until', 'Aprobación válida hasta', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 4),
  ('supplier_scope', 'open_incident_count', 'Incidentes abiertos', 'number',
   array['greater_than', 'gte', 'equals'], null, null, 5),

  -- Voz del cliente · SIEMPRE agregada
  ('customer_feedback', 'received_on', 'Recibida el', 'date',
   array['days_after', 'days_before'], null, null, 1),
  ('customer_feedback', 'status', 'Estado', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['open', 'under_review', 'answered', 'closed', 'dismissed'], null, 2),
  ('customer_feedback', 'feedback_kind', 'Tipo', 'text',
   array['equals', 'in', 'not_in'],
   array['complaint', 'claim', 'suggestion', 'compliment', 'comment', 'other'], null, 3),
  ('customer_feedback', 'severity', 'Gravedad', 'text',
   array['equals', 'in', 'not_in', 'is_empty'], null, null, 4),
  ('customer_metric', 'value', 'Valor', 'number',
   array['greater_than', 'less_than', 'gte', 'lte', 'is_empty', 'is_not_empty'], null, null, 1),
  ('customer_metric', 'previous_value', 'Valor anterior comparable', 'number',
   array['greater_than', 'less_than', 'gte', 'lte', 'is_empty', 'is_not_empty'], null, null, 2),
  ('customer_metric', 'delta', 'Variación frente al anterior', 'number',
   array['greater_than', 'less_than', 'gte', 'lte', 'is_empty', 'is_not_empty'], null, null, 3),
  ('customer_metric', 'sample_size', 'Respuestas', 'number',
   array['greater_than', 'less_than', 'gte', 'lte'], null, null, 4),
  ('customer_metric', 'breaks_comparability', 'Rompe comparabilidad', 'boolean',
   array['equals'], null, null, 5),

  -- Auditorías
  ('audit', 'scheduled_from', 'Fecha vigente', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 1),
  ('audit', 'scheduled_to', 'Fin previsto', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 2),
  ('audit', 'status', 'Estado', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['draft', 'planned', 'in_progress', 'executed', 'reported', 'closed', 'cancelled'], null, 3),
  ('audit', 'executed_to', 'Ejecutada hasta', 'date',
   array['days_after', 'is_empty', 'is_not_empty'], null, null, 4),
  ('audit', 'report_issued', 'Informe emitido', 'boolean',
   array['equals'], null, null, 5),
  ('audit_finding', 'evaluation_status', 'Evaluación', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['pending', 'evaluated', 'dismissed', 'escalated'], null, 1),
  ('audit_finding', 'raised_on', 'Levantado el', 'date',
   array['days_after', 'days_before'], null, null, 2),
  ('audit_finding', 'proposed_classification', 'Clasificación propuesta', 'text',
   array['equals', 'in', 'not_in'],
   array['conforming', 'observation', 'improvement_opportunity',
         'nonconformity_suspected', 'not_conclusive'], null, 3),

  -- Revisión por la dirección
  ('management_review', 'next_review_planned_on', 'Próxima revisión', 'date',
   array['days_before', 'days_after', 'is_empty', 'is_not_empty'], null, null, 1),
  ('management_review', 'period_end', 'Fin del periodo', 'date',
   array['days_before', 'days_after'], null, null, 2),
  ('management_review', 'status', 'Estado', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['draft', 'preparing', 'ready_for_review', 'in_review', 'closed', 'cancelled'], null, 3),
  ('management_review', 'inputs_pending', 'Entradas sin mirar', 'number',
   array['greater_than', 'gte', 'equals'], null, null, 4),
  ('management_review_input', 'state', 'Estado', 'text',
   array['equals', 'not_equals', 'in', 'not_in'],
   array['pending', 'prepared', 'reviewed', 'not_applicable', 'missing'], null, 1),
  ('management_review_input', 'source_updated', 'La fuente cambió', 'boolean',
   array['equals'], null, null, 2),
  ('management_review_input', 'input_mode', 'Modo', 'text',
   array['equals', 'in'], array['automatic', 'manual'], null, 3)
on conflict (source_code, field) do nothing;


-- ============================================================================
-- 3 · LA REGLA Y SUS VERSIONES (§20…§24, AT-11, AT-34)
-- ----------------------------------------------------------------------------
-- §21 · Una versión PUBLICADA no se reescribe. Si la regla avisaba a 30 días y
-- ahora tiene que avisar a 45, eso es una versión nueva — y la señal que se
-- emitió con la v1 sigue diciendo 30 para siempre. Reescribirla haría
-- imposible explicar por qué saltó aquel día.
--
-- §23 · Y publicada no es lo mismo que activa: una versión puede publicarse
-- con `effective_from` futuro y no evaluarse hasta entonces.
-- ============================================================================

create table public.quality_automation_rules (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  code              text not null,
  name              text not null,
  description       text,
  category          text not null,
  source_code       text not null references public.quality_automation_sources (code),

  -- §31/MDR-33 · La responsabilidad persistente es del CARGO.
  owner_position_id uuid,

  status            text not null default 'draft',
  -- AT-06 · El nivel de autonomía, explícito y acotado.
  autonomy_level    text not null default 'A',

  -- §68 · Las reglas de plataforma no se editan ni se desactivan desde la UI.
  is_platform       boolean not null default false,
  template_code     text,

  retired_at        timestamptz,
  retirement_reason text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_automation_rules_org_id_uniq unique (organization_id, id),
  constraint quality_automation_rules_code_uniq unique (organization_id, code),
  constraint quality_automation_rules_status_check
    check (status in ('draft', 'active', 'inactive', 'retired')),
  -- AT-06 · A observar y avisar · B automático reversible · C preparar para
  -- revisión humana · D decisión humana obligatoria. QUALITY-11 solo emite en
  -- A y B: C y D existen para que una regla pueda DECLARAR que lo suyo lo
  -- decide una persona, no para que el motor lo decida por ella.
  constraint quality_automation_rules_autonomy_check
    check (autonomy_level in ('A', 'B', 'C', 'D')),
  constraint quality_automation_rules_category_check
    check (category in ('documents', 'indicators', 'objectives', 'cases', 'actions',
                        'risks', 'people', 'suppliers', 'customer', 'audits',
                        'management_review', 'cross_domain')),
  constraint quality_automation_rules_retired_check
    check ((status = 'retired') = (retired_at is not null)),
  constraint quality_automation_rules_owner_position_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete restrict
);

comment on table public.quality_automation_rules is
  'QUALITY-11 · §20 · La identidad estable de una regla. Su CONTENIDO vive en versiones: cambiarlo nunca reescribe lo que ya se evaluó.';
comment on column public.quality_automation_rules.autonomy_level is
  'AT-06 · A observar/avisar · B automático reversible · C preparar para revisión · D decisión humana obligatoria. El motor solo emite señales, alertas y tareas: nunca decide.';

create index quality_automation_rules_org_idx
  on public.quality_automation_rules (organization_id, status);
create index quality_automation_rules_source_idx
  on public.quality_automation_rules (organization_id, source_code);

create trigger t_quality_automation_rules_updated
  before update on public.quality_automation_rules
  for each row execute function public.set_updated_at();
create trigger t_quality_automation_rules_org_immutable
  before update on public.quality_automation_rules
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_automation_rules_force_created_by
  before insert on public.quality_automation_rules
  for each row execute function public.force_created_by();
create trigger t_audit_quality_automation_rules
  after insert or update or delete on public.quality_automation_rules
  for each row execute function public.audit_row_change();


create table public.quality_automation_rule_versions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  rule_id           uuid not null,
  version_number    integer not null,
  status            text not null default 'draft',

  -- §11 · Los dos modos. `schedule` observa estado; `event` reacciona a algo
  -- que ocurrió. No se usa un barrido para lo que ya tiene evento, ni un
  -- evento para una condición que necesita reloj.
  trigger_kind      text not null default 'schedule',
  schedule_frequency text not null default 'daily',
  event_types       text[],

  -- §25 · Las condiciones, en forma cerrada. Ni JavaScript, ni SQL, ni `eval`.
  -- [{ "field": "...", "operator": "...", "value": ... }] con AND entre ellas.
  conditions        jsonb not null default '[]'::jsonb,
  -- §110 · Las salidas, del catálogo cerrado.
  outputs           jsonb not null default '[]'::jsonb,

  severity          text not null default 'warning',
  signal_title      text not null,

  effective_from    date,
  effective_to      date,

  change_note       text,
  published_at      timestamptz,
  published_by      uuid references public.profiles (id),

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_automation_rule_versions_org_id_uniq unique (organization_id, id),
  constraint quality_automation_rule_versions_number_uniq
    unique (organization_id, rule_id, version_number),
  constraint quality_automation_rule_versions_status_check
    check (status in ('draft', 'published', 'superseded')),
  constraint quality_automation_rule_versions_trigger_check
    check (trigger_kind in ('schedule', 'event')),
  constraint quality_automation_rule_versions_frequency_check
    check (schedule_frequency in ('hourly', 'daily', 'weekly')),
  constraint quality_automation_rule_versions_severity_check
    check (severity in ('info', 'warning', 'critical')),
  -- §22 · Publicada exige fecha de vigencia y de publicación.
  constraint quality_automation_rule_versions_published_check
    check (status = 'draft'
           or (published_at is not null and effective_from is not null)),
  constraint quality_automation_rule_versions_window_check
    check (effective_to is null or effective_from is null
           or effective_to >= effective_from),
  constraint quality_automation_rule_versions_conditions_check
    check (jsonb_typeof(conditions) = 'array'),
  constraint quality_automation_rule_versions_outputs_check
    check (jsonb_typeof(outputs) = 'array'),
  constraint quality_automation_rule_versions_rule_fk
    foreign key (organization_id, rule_id)
    references public.quality_automation_rules (organization_id, id) on delete cascade
);

comment on table public.quality_automation_rule_versions is
  'QUALITY-11 · §21/§145 · El contenido formal de la regla, congelado al publicar. Una señal emitida con la v1 sigue explicándose con la v1 aunque exista una v3.';
comment on column public.quality_automation_rule_versions.conditions is
  '§25/§26 · Forma cerrada: campo del catálogo, operador del catálogo y valor tipado. No hay expresiones libres, ni SQL, ni `eval`.';

create index quality_automation_rule_versions_rule_idx
  on public.quality_automation_rule_versions (organization_id, rule_id, version_number desc);
create index quality_automation_rule_versions_active_idx
  on public.quality_automation_rule_versions (organization_id, status, effective_from);

create trigger t_quality_automation_rule_versions_updated
  before update on public.quality_automation_rule_versions
  for each row execute function public.set_updated_at();
create trigger t_quality_automation_rule_versions_force_created_by
  before insert on public.quality_automation_rule_versions
  for each row execute function public.force_created_by();
create trigger t_audit_quality_automation_rule_versions
  after insert or update or delete on public.quality_automation_rule_versions
  for each row execute function public.audit_row_change();


-- §22 · Una versión publicada no se edita. La guarda vive en la base, no en la
-- pantalla: un `update` directo por PostgREST pasa por aquí igual.
create or replace function public.quality_automation_version_is_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'draft' then
    return new;
  end if;
  -- De publicada a sustituida sí: es lo que ocurre al publicar la siguiente.
  if old.status = 'published' and new.status = 'superseded'
     and new.conditions is not distinct from old.conditions
     and new.outputs is not distinct from old.outputs then
    return new;
  end if;
  if new.conditions is distinct from old.conditions
     or new.outputs is distinct from old.outputs
     or new.trigger_kind is distinct from old.trigger_kind
     or new.severity is distinct from old.severity
     or new.signal_title is distinct from old.signal_title
     or new.effective_from is distinct from old.effective_from then
    raise exception 'Esta versión de la regla ya está publicada y no se reescribe. Crea una versión nueva: las señales que emitió esta siguen explicándose con ella.';
  end if;
  return new;
end;
$$;

create trigger t_quality_automation_version_published_guard
  before update on public.quality_automation_rule_versions
  for each row execute function public.quality_automation_version_is_published();


-- ============================================================================
-- 4 · EJECUCIONES (§43, §44, §45, §72, §99)
-- ----------------------------------------------------------------------------
-- §44 · Una ejecución tiene que poder decir qué evaluó y qué creó. Y lo que
-- devuelve es lo CREADO en esa pasada, no cuántos objetos existen — QUALITY-09
-- ya tropezó con esa diferencia y la corrigió; aquí se nace con ella.
--
-- §43 · No se persiste una fila por cada evaluación falsa. Se persisten la
-- ejecución, el resultado por regla y las coincidencias que produjeron salida.
-- Millones de «no» no explican nada y cuestan lo mismo que los «sí».
-- ============================================================================

create table public.quality_automation_runs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  run_kind          text not null,
  -- §47 · El día de negocio con el que se evaluó. Queda escrito.
  business_date     date not null,

  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null default 'running',

  rules_evaluated   integer not null default 0,
  subjects_evaluated integer not null default 0,
  matches           integer not null default 0,
  signals_created   integer not null default 0,
  alerts_created    integer not null default 0,
  tasks_created     integer not null default 0,
  failures          integer not null default 0,

  triggered_by      uuid references public.profiles (id),
  note              text,

  created_at        timestamptz not null default now(),

  constraint quality_automation_runs_org_id_uniq unique (organization_id, id),
  constraint quality_automation_runs_kind_check
    check (run_kind in ('manual', 'scheduled', 'simulation')),
  constraint quality_automation_runs_status_check
    check (status in ('running', 'success', 'partial', 'failed')),
  -- §72 · Una simulación NO crea nada. La restricción lo garantiza aunque
  -- alguien se equivoque escribiendo el ejecutor.
  constraint quality_automation_runs_simulation_has_no_outputs
    check (run_kind <> 'simulation'
           or (signals_created = 0 and alerts_created = 0 and tasks_created = 0))
);

comment on table public.quality_automation_runs is
  'QUALITY-11 · §44/§72 · Qué evaluó y qué CREÓ esta pasada. Una simulación no puede haber creado nada: lo impide una restricción, no la buena fe del código.';

create index quality_automation_runs_org_idx
  on public.quality_automation_runs (organization_id, started_at desc);

create table public.quality_automation_run_rules (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  run_id            uuid not null,
  -- Nulo cuando es un OBSERVADOR DE PLATAFORMA (§126): los barridos que
  -- QUALITY-03…10 ya traían y que aquí quedan integrados sin duplicarse.
  rule_id           uuid,
  rule_version_id   uuid,
  platform_observer text,

  subjects_evaluated integer not null default 0,
  matches           integer not null default 0,
  signals_created   integer not null default 0,
  alerts_created    integer not null default 0,
  tasks_created     integer not null default 0,

  status            text not null default 'success',
  error_message     text,
  duration_ms       integer,

  created_at        timestamptz not null default now(),

  constraint quality_automation_run_rules_org_id_uniq unique (organization_id, id),
  constraint quality_automation_run_rules_status_check
    check (status in ('success', 'failed', 'skipped')),
  constraint quality_automation_run_rules_who_check
    check ((rule_id is not null) <> (platform_observer is not null)),
  constraint quality_automation_run_rules_run_fk
    foreign key (organization_id, run_id)
    references public.quality_automation_runs (organization_id, id) on delete cascade,
  constraint quality_automation_run_rules_rule_fk
    foreign key (organization_id, rule_id)
    references public.quality_automation_rules (organization_id, id) on delete set null,
  constraint quality_automation_run_rules_version_fk
    foreign key (organization_id, rule_version_id)
    references public.quality_automation_rule_versions (organization_id, id) on delete set null
);

comment on table public.quality_automation_run_rules is
  'QUALITY-11 · §45 · El resultado POR REGLA. Una regla que falla queda registrada y no arrastra al resto del barrido: falla cerrada, ella sola.';

create index quality_automation_run_rules_run_idx
  on public.quality_automation_run_rules (organization_id, run_id);


-- ============================================================================
-- 5 · LA SEÑAL TRANSVERSAL (§14, §15, §35…§41)
-- ----------------------------------------------------------------------------
-- §14 · Los dominios ya tenían sus señales —riesgos, proveedores, clientes,
-- conocimiento—. No se migran ni se destruyen: siguen siendo suyas. Esta es la
-- señal TRANSVERSAL de la automatización, la que sabe con qué regla y con qué
-- versión se produjo, y la que se puede referenciar desde cualquier dominio.
--
-- §35/§36 · La idempotencia y el rearme viven en un solo sitio: un índice único
-- parcial sobre `(empresa, dedupe_key)` mientras la señal siga abierta. Dos
-- barridos simultáneos no la duplican —lo impide la base, no un `select` previo
-- que se puede colar entre dos transacciones—, y cuando la condición se
-- resuelve y vuelve a aparecer, nace otra señal.
-- ============================================================================

create table public.quality_signals (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  rule_id           uuid,
  rule_version_id   uuid,
  run_id            uuid,

  source_code       text not null references public.quality_automation_sources (code),
  domain            text not null,
  subject_type      text not null,
  subject_id        uuid not null,
  subject_label     text,

  severity          text not null default 'warning',
  title             text not null,
  -- §41 · Por qué saltó, en frases que una persona entiende.
  explanation       text not null,
  -- §42 · El retrato MÍNIMO suficiente para explicar. No la entidad entera.
  source_snapshot   jsonb,

  dedupe_key        text not null,
  status            text not null default 'open',

  first_detected_at timestamptz not null default now(),
  last_detected_at  timestamptz not null default now(),
  detection_count   integer not null default 1,

  acknowledged_by   uuid references public.profiles (id),
  acknowledged_at   timestamptz,
  resolved_at       timestamptz,
  resolution_kind   text,
  resolution_note   text,
  resolved_by       uuid references public.profiles (id),

  -- §33 · Cuando el cargo responsable no tiene titular con cuenta, la señal
  -- EXISTE igual y lo dice. Fallar entera sería peor.
  recipient_unresolved boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_signals_org_id_uniq unique (organization_id, id),
  constraint quality_signals_severity_check
    check (severity in ('info', 'warning', 'critical')),
  constraint quality_signals_status_check
    check (status in ('open', 'acknowledged', 'in_treatment', 'resolved',
                      'dismissed', 'suppressed')),
  constraint quality_signals_resolution_check
    check (resolution_kind is null
           or resolution_kind in ('auto', 'manual', 'dismissed', 'suppressed')),
  -- §39 · «Lo vi» no es «lo resolví»: reconocer no cierra.
  constraint quality_signals_closed_consistent
    check ((status in ('resolved', 'dismissed', 'suppressed')) = (resolved_at is not null)),
  constraint quality_signals_rule_fk
    foreign key (organization_id, rule_id)
    references public.quality_automation_rules (organization_id, id) on delete set null,
  constraint quality_signals_version_fk
    foreign key (organization_id, rule_version_id)
    references public.quality_automation_rule_versions (organization_id, id) on delete set null,
  constraint quality_signals_run_fk
    foreign key (organization_id, run_id)
    references public.quality_automation_runs (organization_id, id) on delete set null
);

comment on table public.quality_signals is
  'QUALITY-11 · §14/§15 · El hecho de negocio detectado, con su regla, su versión y su explicación. Descartar la alerta no borra la señal, y reconocerla no la resuelve.';
comment on column public.quality_signals.dedupe_key is
  '§35 · La identidad de la CONDICIÓN. El índice único parcial de más abajo es lo que impide que dos barridos simultáneos la dupliquen.';
comment on column public.quality_signals.recipient_unresolved is
  '§33 · Un cargo sin titular con cuenta no cancela la señal: la señal existe y lo dice.';

-- §35/§51 · UNA señal abierta por condición. La condición resuelta libera la
-- clave, que es exactamente lo que permite el rearme de §36.
create unique index quality_signals_open_dedupe_uniq
  on public.quality_signals (organization_id, dedupe_key)
  where resolved_at is null;

create index quality_signals_org_status_idx
  on public.quality_signals (organization_id, status, severity);
create index quality_signals_subject_idx
  on public.quality_signals (organization_id, subject_type, subject_id);
create index quality_signals_rule_idx
  on public.quality_signals (organization_id, rule_id);

create trigger t_quality_signals_updated
  before update on public.quality_signals
  for each row execute function public.set_updated_at();
create trigger t_quality_signals_org_immutable
  before update on public.quality_signals
  for each row execute function public.prevent_organization_id_change();
create trigger t_audit_quality_signals
  after insert or update or delete on public.quality_signals
  for each row execute function public.audit_row_change();


-- §79 · Una persona puede reconocer, resolver o silenciar. Lo que NO puede es
-- editar la evidencia de cómo se originó la señal.
create or replace function public.quality_signal_origin_is_frozen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rule_id is distinct from old.rule_id
     or new.rule_version_id is distinct from old.rule_version_id
     or new.run_id is distinct from old.run_id
     or new.source_code is distinct from old.source_code
     or new.subject_id is distinct from old.subject_id
     or new.explanation is distinct from old.explanation
     or new.source_snapshot is distinct from old.source_snapshot
     or new.dedupe_key is distinct from old.dedupe_key
     or new.first_detected_at is distinct from old.first_detected_at then
    raise exception 'La evidencia de cómo se originó esta señal no se edita. Puedes reconocerla, resolverla o silenciarla, pero no reescribir por qué saltó.';
  end if;
  return new;
end;
$$;

create trigger t_quality_signals_origin_frozen
  before update on public.quality_signals
  for each row execute function public.quality_signal_origin_is_frozen();


-- §80 · Silenciar sin borrar. Con actor, motivo y hasta cuándo.
create table public.quality_signal_suppressions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  scope             text not null,
  signal_id         uuid,
  rule_id           uuid,

  reason            text not null,
  suppressed_until  date,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  released_at       timestamptz,
  released_by       uuid references public.profiles (id),

  constraint quality_signal_suppressions_org_id_uniq unique (organization_id, id),
  constraint quality_signal_suppressions_scope_check
    check (scope in ('signal', 'rule')),
  constraint quality_signal_suppressions_target_check
    check ((scope = 'signal' and signal_id is not null and rule_id is null)
           or (scope = 'rule' and rule_id is not null and signal_id is null)),
  constraint quality_signal_suppressions_signal_fk
    foreign key (organization_id, signal_id)
    references public.quality_signals (organization_id, id) on delete cascade,
  constraint quality_signal_suppressions_rule_fk
    foreign key (organization_id, rule_id)
    references public.quality_automation_rules (organization_id, id) on delete cascade
);

comment on table public.quality_signal_suppressions is
  'QUALITY-11 · §80 · Silenciar para no ahogar en ruido, sin borrar. Queda quién, por qué y hasta cuándo — silenciar no es que la condición haya dejado de existir.';

create index quality_signal_suppressions_rule_idx
  on public.quality_signal_suppressions (organization_id, rule_id)
  where released_at is null;

create trigger t_quality_signal_suppressions_force_created_by
  before insert on public.quality_signal_suppressions
  for each row execute function public.force_created_by();


-- ============================================================================
-- 6 · LOS PROVEEDORES DE SUJETOS (§27, §28, §100, §102)
-- ----------------------------------------------------------------------------
-- Una sola función devuelve, para una fuente y una empresa, los sujetos que hay
-- que mirar y los HECHOS de cada uno como `jsonb`.
--
-- Por qué así, y no con SQL dinámico: los nombres de campo del catálogo se
-- materializan aquí, en consultas escritas a mano y revisables. El evaluador
-- después solo lee `facts ->> campo` y compara. No hay ni una línea de SQL
-- construido con texto, así que no hay superficie de inyección que proteger —
-- solo la que nunca existió.
--
-- §102 · Todas están acotadas: la ejecución pagina, y ninguna carga cien mil
-- sujetos en memoria.
-- ============================================================================

create or replace function public.quality_automation_subjects(
  p_organization_id uuid,
  p_source_code     text,
  p_today           date,
  p_limit           integer default 5000
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
       limit p_limit;

  elsif p_source_code = 'action' then
    return query
      select a.id, a.code || ' · ' || a.title, a.owner_position_id,
             jsonb_build_object(
               'due_on', a.due_on,
               'status', a.status,
               'effectiveness_result', a.effectiveness_result,
               'completed_on', a.completed_on,
               'action_kind', a.action_kind)
        from work_actions a
       where a.organization_id = p_organization_id
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
       limit p_limit;
  end if;

  return;
end;
$$;
revoke all on function public.quality_automation_subjects(uuid, text, date, integer) from public, anon;
grant execute on function public.quality_automation_subjects(uuid, text, date, integer) to authenticated;

comment on function public.quality_automation_subjects(uuid, text, date, integer) is
  'QUALITY-11 · §27/§29 · Los sujetos observables de una fuente, con sus hechos como jsonb. Ni una línea de SQL construido con texto: los nombres de campo se materializan aquí, en consultas escritas a mano.';


-- ============================================================================
-- 7 · EL EVALUADOR (§6, §26, §41, §108)
-- ----------------------------------------------------------------------------
-- Determinístico: los mismos hechos, la misma versión de la regla y el mismo
-- día de negocio producen siempre el mismo resultado y la misma explicación.
--
-- Trece operadores, todos con semántica escrita. Ninguno acepta una expresión.
-- ============================================================================

-- Evalúa UNA condición contra los hechos de UN sujeto. Devuelve si se cumple y
-- la frase que lo explica (§41): «Próxima reevaluación (25/08/2026) vence
-- dentro de 30 días o menos».
create or replace function public.quality_automation_check(
  p_facts     jsonb,
  p_field     text,
  p_operator  text,
  p_value     jsonb,
  p_today     date,
  p_label     text default null
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_raw    jsonb;
  v_text   text;
  v_num    numeric;
  v_date   date;
  v_ok     boolean := false;
  v_shown  text;
  v_etiqueta text := coalesce(p_label, p_field);
  v_frase  text;
  v_arr    jsonb;
  v_n      integer;
  v_i      integer;
  v_run    integer := 0;
begin
  v_raw := p_facts -> p_field;
  if v_raw is null or jsonb_typeof(v_raw) = 'null' then
    v_text := null; v_shown := 'sin dato';
  else
    v_text := case when jsonb_typeof(v_raw) = 'string' then v_raw #>> '{}'
                   else v_raw::text end;
    v_shown := v_text;
  end if;

  case p_operator
    when 'is_empty' then
      v_ok := v_text is null;
      v_frase := v_etiqueta || ' está sin dato';
    when 'is_not_empty' then
      v_ok := v_text is not null;
      v_frase := v_etiqueta || ' tiene dato (' || coalesce(v_shown, '—') || ')';
    when 'equals' then
      v_ok := v_text is not distinct from (p_value #>> '{}');
      v_frase := v_etiqueta || ' es ' || coalesce(p_value #>> '{}', '—')
                 || ' (valor: ' || coalesce(v_shown, 'sin dato') || ')';
    when 'not_equals' then
      v_ok := v_text is distinct from (p_value #>> '{}');
      v_frase := v_etiqueta || ' no es ' || coalesce(p_value #>> '{}', '—')
                 || ' (valor: ' || coalesce(v_shown, 'sin dato') || ')';
    when 'in' then
      v_ok := v_text is not null and exists (
        select 1 from jsonb_array_elements_text(p_value) x where x = v_text);
      v_frase := v_etiqueta || ' está entre los valores buscados (valor: '
                 || coalesce(v_shown, 'sin dato') || ')';
    when 'not_in' then
      v_ok := v_text is null or not exists (
        select 1 from jsonb_array_elements_text(p_value) x where x = v_text);
      v_frase := v_etiqueta || ' no está entre los valores excluidos (valor: '
                 || coalesce(v_shown, 'sin dato') || ')';
    when 'greater_than' then
      v_num := nullif(v_text, '')::numeric;
      v_ok := v_num is not null and v_num > (p_value #>> '{}')::numeric;
      v_frase := v_etiqueta || ' (' || coalesce(v_shown, 'sin dato') || ') es mayor que '
                 || (p_value #>> '{}');
    when 'less_than' then
      v_num := nullif(v_text, '')::numeric;
      v_ok := v_num is not null and v_num < (p_value #>> '{}')::numeric;
      v_frase := v_etiqueta || ' (' || coalesce(v_shown, 'sin dato') || ') es menor que '
                 || (p_value #>> '{}');
    when 'gte' then
      v_num := nullif(v_text, '')::numeric;
      v_ok := v_num is not null and v_num >= (p_value #>> '{}')::numeric;
      v_frase := v_etiqueta || ' (' || coalesce(v_shown, 'sin dato') || ') es al menos '
                 || (p_value #>> '{}');
    when 'lte' then
      v_num := nullif(v_text, '')::numeric;
      v_ok := v_num is not null and v_num <= (p_value #>> '{}')::numeric;
      v_frase := v_etiqueta || ' (' || coalesce(v_shown, 'sin dato') || ') no pasa de '
                 || (p_value #>> '{}');
    when 'days_before' then
      -- «Vence dentro de N días»: la fecha está por llegar y falta N o menos.
      v_date := nullif(v_text, '')::date;
      v_ok := v_date is not null
              and v_date >= p_today
              and (v_date - p_today) <= (p_value #>> '{}')::integer;
      v_frase := v_etiqueta || ' (' || coalesce(to_char(v_date, 'DD/MM/YYYY'), 'sin fecha')
                 || ') vence dentro de ' || (p_value #>> '{}') || ' días o menos';
    when 'days_after' then
      -- «Pasó hace N días o más»: incluye el vencido de hoy con N = 0.
      v_date := nullif(v_text, '')::date;
      v_ok := v_date is not null and (p_today - v_date) >= (p_value #>> '{}')::integer;
      v_frase := v_etiqueta || ' (' || coalesce(to_char(v_date, 'DD/MM/YYYY'), 'sin fecha')
                 || ') pasó hace ' || (p_value #>> '{}') || ' días o más';
    when 'consecutive_count' then
      -- La cola de la serie: los N últimos, todos ciertos.
      v_arr := coalesce(v_raw, '[]'::jsonb);
      v_n := (p_value #>> '{}')::integer;
      if jsonb_typeof(v_arr) = 'array' and jsonb_array_length(v_arr) >= v_n and v_n > 0 then
        v_run := 0;
        for v_i in reverse (jsonb_array_length(v_arr) - 1) .. 0 loop
          exit when (v_arr -> v_i)::text <> 'true';
          v_run := v_run + 1;
        end loop;
        v_ok := v_run >= v_n;
      end if;
      v_shown := v_run::text;
      v_frase := v_etiqueta || ': ' || v_run || ' periodo(s) consecutivos, y la regla pide '
                 || coalesce((p_value #>> '{}'), '—');
    when 'strictly_decreasing' then
      -- §115 · Tendencia DETERMINÍSTICA, no interpretación. Los N últimos
      -- valores, cada uno estrictamente menor que el anterior.
      v_arr := coalesce(v_raw, '[]'::jsonb);
      v_n := (p_value #>> '{}')::integer;
      if jsonb_typeof(v_arr) = 'array' and jsonb_array_length(v_arr) >= v_n and v_n >= 2 then
        v_ok := true;
        for v_i in (jsonb_array_length(v_arr) - v_n + 1) .. (jsonb_array_length(v_arr) - 1) loop
          if not ((v_arr -> v_i)::numeric < (v_arr -> (v_i - 1))::numeric) then
            v_ok := false;
            exit;
          end if;
        end loop;
      end if;
      v_shown := v_arr::text;
      v_frase := v_etiqueta || ': los últimos ' || coalesce((p_value #>> '{}'), '—')
                 || ' valores bajan uno tras otro';
    else
      v_ok := false;
      v_frase := 'Operador no reconocido: ' || coalesce(p_operator, '—');
  end case;

  return jsonb_build_object(
    'matched', coalesce(v_ok, false),
    'field', p_field,
    'operator', p_operator,
    'value', p_value,
    'observed', v_shown,
    'explanation', v_frase);
exception when others then
  -- §30/§45 · Falla cerrada: un dato con forma inesperada NO produce señal.
  return jsonb_build_object(
    'matched', false, 'field', p_field, 'operator', p_operator,
    'value', p_value, 'observed', null,
    'explanation', 'No se pudo evaluar «' || v_etiqueta || '»: el dato no tiene la forma esperada.');
end;
$$;
revoke all on function public.quality_automation_check(jsonb, text, text, jsonb, date, text) from public, anon;
grant execute on function public.quality_automation_check(jsonb, text, text, jsonb, date, text) to authenticated;


-- Todas las condiciones de una versión contra un sujeto. Y entre ellas, AND:
-- el constructor no ofrece O, y no lo ofrece a propósito — «A o B» son dos
-- reglas, y dos reglas se pueden explicar por separado.
create or replace function public.quality_automation_evaluate(
  p_facts      jsonb,
  p_conditions jsonb,
  p_today      date,
  p_labels     jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_cond    jsonb;
  v_res     jsonb;
  v_all     boolean := true;
  v_detail  jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_conditions) <> 'array' or jsonb_array_length(p_conditions) = 0 then
    -- §30 · Falla cerrada: una regla sin condiciones no marca a todo el mundo.
    return jsonb_build_object('matched', false, 'checks', '[]'::jsonb,
      'explanation', 'La regla no declara ninguna condición.');
  end if;

  for v_cond in select * from jsonb_array_elements(p_conditions) loop
    v_res := quality_automation_check(
      p_facts,
      v_cond ->> 'field',
      v_cond ->> 'operator',
      v_cond -> 'value',
      p_today,
      p_labels ->> (v_cond ->> 'field'));
    v_detail := v_detail || v_res;
    if not coalesce((v_res ->> 'matched')::boolean, false) then
      v_all := false;
    end if;
  end loop;

  return jsonb_build_object(
    'matched', v_all,
    'checks', v_detail,
    'explanation', (
      select string_agg(c ->> 'explanation', E'\n· ')
        from jsonb_array_elements(v_detail) c));
end;
$$;
revoke all on function public.quality_automation_evaluate(jsonb, jsonb, date, jsonb) from public, anon;
grant execute on function public.quality_automation_evaluate(jsonb, jsonb, date, jsonb) to authenticated;

comment on function public.quality_automation_evaluate(jsonb, jsonb, date, jsonb) is
  'QUALITY-11 · §6/§108 · El núcleo determinístico: hechos + versión de regla + día de negocio → resultado y explicación. Sin base de datos, sin reloj propio y sin estado.';


-- ============================================================================
-- 8 · VALIDACIÓN Y PUBLICACIÓN (§30, §110, §111, §112)
-- ----------------------------------------------------------------------------
-- Antes de publicar: la fuente existe, el campo existe, el operador está
-- permitido PARA ESE CAMPO, el valor tiene la forma que el tipo exige, la
-- salida está en el catálogo cerrado y el destinatario es de esta empresa.
--
-- Falla cerrada: si algo no se puede comprobar, no se publica.
-- ============================================================================

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

  return jsonb_build_object(
    'valid', array_length(v_errors, 1) is null,
    'errors', coalesce(v_errors, array[]::text[]));
exception when others then
  return jsonb_build_object('valid', false,
    'errors', array['La configuración de la regla no se pudo leer: ' || sqlerrm]);
end;
$$;
revoke all on function public.quality_automation_validate_version(uuid) from public, anon;
grant execute on function public.quality_automation_validate_version(uuid) to authenticated;


-- §169 · El resumen legible, generado DETERMINÍSTICAMENTE desde la regla. No
-- hay modelo detrás: es la misma frase para la misma regla, siempre.
create or replace function public.quality_automation_describe_version(p_version_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_v     record;
  v_rule  record;
  v_src   record;
  v_cond  jsonb;
  v_out   jsonb;
  v_f     record;
  v_partes text[] := array[]::text[];
  v_sal   text[] := array[]::text[];
begin
  select * into v_v from quality_automation_rule_versions where id = p_version_id;
  if v_v.id is null or not is_org_member(v_v.organization_id) then return null; end if;
  select * into v_rule from quality_automation_rules where id = v_v.rule_id;
  select * into v_src from quality_automation_sources where code = v_rule.source_code;

  for v_cond in select * from jsonb_array_elements(v_v.conditions) loop
    select * into v_f from quality_automation_source_fields
     where source_code = v_rule.source_code and field = (v_cond ->> 'field');
    v_partes := v_partes || (
      coalesce(v_f.label, v_cond ->> 'field') || ' ' ||
      case v_cond ->> 'operator'
        when 'equals' then 'es ' || coalesce(v_cond -> 'value' #>> '{}', '—')
        when 'not_equals' then 'no es ' || coalesce(v_cond -> 'value' #>> '{}', '—')
        when 'in' then 'está entre (' || coalesce((
          select string_agg(x, ', ') from jsonb_array_elements_text(v_cond -> 'value') x), '') || ')'
        when 'not_in' then 'no está entre (' || coalesce((
          select string_agg(x, ', ') from jsonb_array_elements_text(v_cond -> 'value') x), '') || ')'
        when 'greater_than' then 'es mayor que ' || (v_cond -> 'value' #>> '{}')
        when 'less_than' then 'es menor que ' || (v_cond -> 'value' #>> '{}')
        when 'gte' then 'es al menos ' || (v_cond -> 'value' #>> '{}')
        when 'lte' then 'no pasa de ' || (v_cond -> 'value' #>> '{}')
        when 'is_empty' then 'está sin dato'
        when 'is_not_empty' then 'tiene dato'
        when 'days_before' then 'vence dentro de ' || (v_cond -> 'value' #>> '{}') || ' días'
        when 'days_after' then 'pasó hace ' || (v_cond -> 'value' #>> '{}') || ' días o más'
        when 'consecutive_count' then 'se repite ' || (v_cond -> 'value' #>> '{}')
                                      || ' periodo(s) seguidos'
        when 'strictly_decreasing' then 'baja ' || (v_cond -> 'value' #>> '{}')
                                        || ' periodo(s) seguidos'
        else v_cond ->> 'operator'
      end);
  end loop;

  for v_out in select * from jsonb_array_elements(v_v.outputs) loop
    v_sal := v_sal || case v_out ->> 'kind'
      when 'CREATE_SIGNAL' then 'emitirá una señal'
      when 'CREATE_ALERT' then 'avisará al cargo responsable'
      when 'CREATE_TASK' then 'creará una tarea'
      else v_out ->> 'kind' end;
  end loop;

  return 'Esta regla revisará ' || lower(coalesce(v_src.label, v_rule.source_code))
    || ' y, cuando ' || coalesce(array_to_string(v_partes, ' y '), 'se cumpla la condición')
    || ', ' || coalesce(array_to_string(v_sal, ', '), 'no hará nada') || '.';
end;
$$;
revoke all on function public.quality_automation_describe_version(uuid) from public, anon;
grant execute on function public.quality_automation_describe_version(uuid) to authenticated;

comment on function public.quality_automation_describe_version(uuid) is
  'QUALITY-11 · §169 · El resumen en castellano, generado desde el árbol de la regla. Determinístico: la misma regla produce siempre la misma frase. No hay ningún modelo detrás.';


-- ============================================================================
-- 9 · EL MOTOR TRANSVERSAL SE AMPLÍA; NO SE DUPLICA (§5, §6, §7, §129)
-- ----------------------------------------------------------------------------
-- Ni una tabla nueva de tareas, de alertas, de acciones ni de bitácora. Se
-- añade el dominio `automation` y los tipos que la automatización necesita, y
-- las salidas viven donde ya vivían: la bandeja transversal es una sola.
--
-- Y como siempre: cada catálogo se suelta y se vuelve a poner con el conjunto
-- anterior COMPLETO más lo nuevo. Estrecharlo rompería filas ya escritas.
-- ============================================================================

alter table public.work_tasks drop constraint work_tasks_source_domain_check;
alter table public.work_tasks add constraint work_tasks_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action','risk',
                        'opportunity','control','person','position','competence','development',
                        'learning','performance','knowledge','lesson','supplier','customer',
                        'audit','management_review','automation'));
alter table public.work_tasks drop constraint work_tasks_subject_type_check;
alter table public.work_tasks add constraint work_tasks_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                        'work_case','work_action','quality_risk','quality_opportunity',
                        'quality_control','quality_person','quality_position',
                        'quality_person_competency','quality_competency_evidence',
                        'quality_development_plan_item','quality_learning_activity',
                        'quality_performance_evaluation','quality_knowledge_item',
                        'quality_knowledge_transfer_plan','quality_lesson_learned',
                        'quality_supplier_profile','quality_supplier_scope',
                        'quality_supplier_evaluation','quality_supplier_document',
                        'quality_customer_profile','quality_survey_campaign',
                        'quality_customer_feedback','quality_customer_voice_review',
                        'quality_audit_program','quality_audit','quality_audit_finding',
                        'quality_management_review','quality_management_review_input',
                        'quality_management_review_decision','quality_automation_rule',
                        'quality_signal'));
alter table public.work_tasks drop constraint work_tasks_type_check;
alter table public.work_tasks add constraint work_tasks_type_check
  check (task_type in ('document_review','document_approval','document_changes_requested',
                        'indicator_measurement_due','indicator_off_target','case_evaluation',
                        'case_closure','action_execution','action_effectiveness',
                        'risk_review_due','risk_assessment_due','risk_treatment_approval',
                        'control_verification','opportunity_review',
                        'competence_evidence_renewal','competence_assessment_due',
                        'performance_evaluation_due','development_item_execution',
                        'learning_effectiveness_review','knowledge_transfer_execution',
                        'knowledge_continuity_review','lesson_proposal_decision',
                        'supplier_reevaluation_due','supplier_evaluation_completion',
                        'supplier_approval_review','supplier_document_renewal',
                        'supplier_criticality_review','complaint_review',
                        'campaign_closing_review','customer_signal_review',
                        'customer_voice_review_due','audit_preparation','audit_plan_review',
                        'audit_execution','audit_report_issue','audit_finding_evaluation',
                        'audit_followup','management_review_preparation',
                        'management_review_input','management_review_analysis',
                        'management_review_closure','management_review_action_followup',
                        'automation_follow_up'));
alter table public.work_alerts drop constraint work_alerts_source_domain_check;
alter table public.work_alerts add constraint work_alerts_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action','risk',
                        'opportunity','control','person','position','competence','development',
                        'learning','performance','knowledge','lesson','supplier','customer',
                        'audit','management_review','automation'));
alter table public.work_alerts drop constraint work_alerts_subject_type_check;
alter table public.work_alerts add constraint work_alerts_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                        'work_case','work_action','quality_risk','quality_opportunity',
                        'quality_control','quality_person','quality_position',
                        'quality_person_competency','quality_competency_evidence',
                        'quality_development_plan_item','quality_learning_activity',
                        'quality_performance_evaluation','quality_knowledge_item',
                        'quality_knowledge_transfer_plan','quality_lesson_learned',
                        'quality_supplier_profile','quality_supplier_scope',
                        'quality_supplier_evaluation','quality_supplier_document',
                        'quality_customer_profile','quality_survey_campaign',
                        'quality_customer_feedback','quality_customer_voice_review',
                        'quality_audit_program','quality_audit','quality_audit_finding',
                        'quality_management_review','quality_management_review_input',
                        'quality_management_review_decision','quality_automation_rule',
                        'quality_signal'));
alter table public.work_alerts drop constraint work_alerts_type_check;
alter table public.work_alerts add constraint work_alerts_type_check
  check (alert_type in ('document_review_requested','document_approval_requested',
                        'document_changes_requested','document_approved','document_retired',
                        'indicator_measurement_due','indicator_target_missed',
                        'objective_at_risk','case_assigned','action_assigned','action_overdue',
                        'effectiveness_due','risk_review_overdue','risk_above_appetite',
                        'risk_materialized','control_ineffective','opportunity_assigned',
                        'competence_evidence_expiring','competence_evidence_expired',
                        'performance_evaluation_pending','development_plan_overdue',
                        'learning_effectiveness_pending','knowledge_single_holder',
                        'knowledge_transfer_overdue','critical_position_vacant',
                        'supplier_reevaluation_overdue','supplier_approval_expiring',
                        'supplier_approval_expired','supplier_document_expiring',
                        'supplier_document_expired','supplier_critical_unapproved',
                        'supplier_incident_streak','complaint_unreviewed',
                        'campaign_closing_soon','campaign_low_response','satisfaction_drop',
                        'customer_signal_raised','voice_review_due','audit_upcoming',
                        'audit_overdue','audit_report_pending','audit_finding_unevaluated',
                        'audit_independence_conflict','audit_program_coverage_gap',
                        'management_review_due','management_review_overdue',
                        'management_review_input_pending','management_review_source_updated',
                        'management_review_action_overdue','management_review_followup_pending',
                        'automation_signal','automation_engine_failure'));
alter table public.work_events drop constraint work_events_source_domain_check;
alter table public.work_events add constraint work_events_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action','risk',
                        'opportunity','control','person','position','competence','development',
                        'learning','performance','knowledge','lesson','supplier','customer',
                        'audit','management_review','automation'));
alter table public.work_events drop constraint work_events_subject_type_check;
alter table public.work_events add constraint work_events_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                        'work_case','work_action','quality_risk','quality_opportunity',
                        'quality_control','quality_person','quality_position',
                        'quality_person_competency','quality_competency_evidence',
                        'quality_development_plan_item','quality_learning_activity',
                        'quality_performance_evaluation','quality_knowledge_item',
                        'quality_knowledge_transfer_plan','quality_lesson_learned',
                        'quality_supplier_profile','quality_supplier_scope',
                        'quality_supplier_evaluation','quality_supplier_document',
                        'quality_customer_profile','quality_survey_campaign',
                        'quality_customer_feedback','quality_customer_voice_review',
                        'quality_audit_program','quality_audit','quality_audit_finding',
                        'quality_management_review','quality_management_review_input',
                        'quality_management_review_decision','quality_automation_rule',
                        'quality_signal'));
alter table public.work_events drop constraint work_events_type_check;
alter table public.work_events add constraint work_events_type_check
  check (event_type in ('indicator.target_missed','indicator.attention','indicator.recovered',
                        'indicator.measurement_due','indicator.source_failed',
                        'objective.at_risk','case.opened','case.classified','case.closed',
                        'case.reopened','action.planned','action.completed','action.verified',
                        'action.overdue','risk.identified','risk.assessed','risk.treated',
                        'risk.accepted','risk.materialized','risk.reviewed','risk.closed',
                        'risk.reopened','control.linked','control.reviewed',
                        'opportunity.identified','opportunity.assessed','opportunity.treated',
                        'opportunity.closed','assignment.started','assignment.ended',
                        'position.version_published','competence.assessed',
                        'competence.evidence_expired','development.need_created',
                        'development.item_planned','learning.completed',
                        'learning.effectiveness_reviewed','performance.evaluation_closed',
                        'knowledge.holder_added','knowledge.holder_removed',
                        'knowledge.concentration_detected','knowledge.transfer_verified',
                        'lesson.published','lesson.proposal_decided','supplier.registered',
                        'supplier.adopted','supplier.classified','supplier.evaluated',
                        'supplier.approved','supplier.suspended','supplier.reinstated',
                        'supplier.withdrawn','supplier.incident_recorded',
                        'supplier.document_expired','survey.version_published',
                        'campaign.opened','campaign.closed','campaign.reopened',
                        'campaign.metrics_computed','feedback.recorded',
                        'complaint.escalated_to_case','voice.review_closed',
                        'audit.program_created','audit.program_revised','audit.scheduled',
                        'audit.rescheduled','audit.cancelled','audit.started','audit.executed',
                        'audit.report_issued','audit.closed','audit.finding_raised',
                        'audit.finding_evaluated','audit.finding_escalated_to_case',
                        'audit.conflict_detected','audit.checklist_version_published',
                        'management_review.closed','management_review.decision_recorded',
                        'management_review.input_refreshed','management_review.inputs_prepared',
                        'management_review.minutes_issued','management_review.reopened',
                        'automation.rule_published','automation.rule_retired',
                        'automation.run_completed','automation.signal_raised',
                        'automation.signal_resolved'));


-- ============================================================================
-- 10 · QUIÉN PUEDE QUÉ (§87, §88)
-- ----------------------------------------------------------------------------
-- Una automatización NO eleva permisos. Actúa con lo que el catálogo de fuentes
-- le permite mirar y con las tres salidas del catálogo cerrado, y nada más.
-- ============================================================================

create or replace function public.quality_reads_automation(p_organization_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select is_org_member(p_organization_id); $$;
revoke all on function public.quality_reads_automation(uuid) from public, anon;
grant execute on function public.quality_reads_automation(uuid) to authenticated;

create or replace function public.quality_manages_automation(p_organization_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select has_org_role(p_organization_id, array['admin', 'quality', 'consultant']); $$;
revoke all on function public.quality_manages_automation(uuid) from public, anon;
grant execute on function public.quality_manages_automation(uuid) to authenticated;

create or replace function public.quality_publishes_automation(p_organization_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select has_org_role(p_organization_id, array['admin', 'quality']); $$;
revoke all on function public.quality_publishes_automation(uuid) from public, anon;
grant execute on function public.quality_publishes_automation(uuid) to authenticated;

comment on function public.quality_publishes_automation(uuid) is
  'QUALITY-11 · Activar una regla es decidir qué observará la plataforma en nombre de la empresa. Un consultor externo la puede diseñar; encenderla es de la empresa.';


-- ============================================================================
-- 11 · PUBLICAR Y ACTIVAR (§22, §23, §24, §145)
-- ============================================================================

create or replace function public.quality_automation_publish_version(
  p_version_id     uuid,
  p_effective_from date default null,
  p_change_note    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_v     record;
  v_rule  record;
  v_valid jsonb;
  v_desde date;
begin
  select * into v_v from quality_automation_rule_versions where id = p_version_id;
  if v_v.id is null then
    raise exception 'Esa versión de regla no existe.';
  end if;
  if not quality_publishes_automation(v_v.organization_id) then
    raise exception 'Tu rol no permite publicar reglas de automatización.';
  end if;
  if v_v.status <> 'draft' then
    raise exception 'Esta versión ya está publicada. Crea una versión nueva: las señales que emitió esta siguen explicándose con ella.';
  end if;
  select * into v_rule from quality_automation_rules where id = v_v.rule_id;
  if v_rule.is_platform then
    raise exception 'Las reglas de plataforma no se publican desde aquí.';
  end if;

  -- §30 · Falla cerrada: si la validación no pasa, no se publica.
  v_valid := quality_automation_validate_version(p_version_id);
  if not coalesce((v_valid ->> 'valid')::boolean, false) then
    raise exception 'La regla no se puede publicar: %',
      array_to_string(array(select jsonb_array_elements_text(v_valid -> 'errors')), ' · ');
  end if;

  -- §23 · Publicada no es activa: puede entrar en vigor mañana.
  v_desde := coalesce(p_effective_from,
                      quality_automation_business_today(v_v.organization_id));

  update quality_automation_rule_versions
     set status = 'superseded',
         effective_to = least(coalesce(effective_to, v_desde - 1), v_desde - 1)
   where organization_id = v_v.organization_id
     and rule_id = v_v.rule_id
     and status = 'published';

  update quality_automation_rule_versions
     set status = 'published',
         effective_from = v_desde,
         published_at = now(),
         published_by = auth.uid(),
         change_note = coalesce(p_change_note, change_note)
   where id = p_version_id;

  update quality_automation_rules
     set status = case when status = 'draft' then 'active' else status end
   where id = v_v.rule_id;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_v.organization_id, 'automation', 'automation.rule_published',
          'quality_automation_rule', v_v.rule_id,
          'Regla «' || v_rule.name || '» publicada en su versión '
            || v_v.version_number || '.',
          jsonb_build_object('version_id', p_version_id,
                             'version_number', v_v.version_number,
                             'effective_from', v_desde));

  return jsonb_build_object('published', true, 'effective_from', v_desde,
    'summary', quality_automation_describe_version(p_version_id));
end;
$$;
revoke all on function public.quality_automation_publish_version(uuid, date, text) from public, anon;
grant execute on function public.quality_automation_publish_version(uuid, date, text) to authenticated;


-- ============================================================================
-- 12 · RESOLUCIÓN DE DESTINATARIO (§32, §33, §34)
-- ----------------------------------------------------------------------------
-- §34 · Si el cargo tiene varios ocupantes, se avisa a TODOS los que tengan
-- cuenta. Coger el primero sería elegir por la organización.
-- §33 · Si no hay ninguno, la señal existe igual y lo dice.
-- ============================================================================

create or replace function public.quality_automation_recipients(
  p_organization_id uuid,
  p_position_id     uuid,
  p_today           date
)
returns table (profile_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct pe.profile_id
    from quality_position_assignments a
    join quality_people pe
      on pe.organization_id = a.organization_id and pe.id = a.person_id
   where p_position_id is not null
     and a.organization_id = p_organization_id
     and a.position_id = p_position_id
     and a.effective_from <= p_today
     and (a.effective_to is null or a.effective_to >= p_today)
     and pe.profile_id is not null
  union
  select distinct a.profile_id
    from quality_position_assignments a
   where p_position_id is not null
     and a.organization_id = p_organization_id
     and a.position_id = p_position_id
     and a.effective_from <= p_today
     and (a.effective_to is null or a.effective_to >= p_today)
     and a.profile_id is not null;
$$;
revoke all on function public.quality_automation_recipients(uuid, uuid, date) from public, anon;
grant execute on function public.quality_automation_recipients(uuid, uuid, date) to authenticated;


-- ============================================================================
-- 13 · LA EJECUCIÓN (§35, §36, §38, §43…§46, §51, §72, §105…§109)
-- ----------------------------------------------------------------------------
-- Una sola función evalúa. El modo cambia lo que hace con el resultado:
--
--   live       → emite señales, alertas y tareas
--   simulation → cuenta coincidencias y NO crea absolutamente nada
--
-- §107 · No hay dos evaluadores. La simulación es esta misma función con otro
-- modo, porque una simulación que no comparte código con la ejecución real
-- deja de ser una simulación y pasa a ser una promesa.
--
-- §51 · La idempotencia NO se basa en «mirar antes de insertar»: dos barridos
-- simultáneos pasarían los dos por ese `select`. Se basa en el índice único
-- parcial de `quality_signals` y en el `on conflict`, que es lo único que la
-- base puede garantizar bajo concurrencia.
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
        v_dedupe := 'auto:' || v_ver.id::text || ':' || v_subject.subject_id::text;
        v_claves := v_claves || v_dedupe;

        -- §72 · La simulación cuenta y se detiene aquí. No crea nada.
        if p_mode = 'simulation' then
          continue;
        end if;

        -- ------------------------------------------------------------------
        -- SALIDA 1 · la señal
        -- ------------------------------------------------------------------
        insert into quality_signals
          (organization_id, rule_id, rule_version_id, run_id, source_code, domain,
           subject_type, subject_id, subject_label, severity, title, explanation,
           source_snapshot, dedupe_key)
        values
          (p_organization_id, v_rule.id, v_ver.id, v_run, v_rule.source_code,
           v_src.domain, v_src.subject_type, v_subject.subject_id,
           v_subject.subject_label, v_ver.severity,
           v_ver.signal_title,
           -- §41 · Por qué saltó, con la regla, la versión y los valores.
           'Regla: ' || v_rule.name || E'\nVersión: ' || v_ver.version_number
             || E'\nSujeto: ' || coalesce(v_subject.subject_label, '—')
             || E'\nCondición:\n· ' || (v_eval ->> 'explanation')
             || E'\nDetectado el ' || to_char(v_today, 'DD/MM/YYYY') || '.',
           -- §42/§91 · El retrato MÍNIMO: solo los campos que la regla miró.
           (select coalesce(jsonb_object_agg(c ->> 'field', v_subject.facts -> (c ->> 'field')),
                            '{}'::jsonb)
              from jsonb_array_elements(v_ver.conditions) c),
           v_dedupe)
        on conflict (organization_id, dedupe_key) where resolved_at is null
        do update set last_detected_at = now(),
                      detection_count = quality_signals.detection_count + 1
        returning id, (xmax = 0) into v_signal, v_nuevo;

        if v_nuevo then
          v_sig_n := v_sig_n + 1;
          insert into work_events (organization_id, source_domain, event_type,
                                   subject_type, subject_id, severity, summary, payload,
                                   dedupe_key)
          values (p_organization_id, 'automation', 'automation.signal_raised',
                  'quality_signal', v_signal, v_ver.severity,
                  v_ver.signal_title || ' · ' || coalesce(v_subject.subject_label, ''),
                  jsonb_build_object('rule_id', v_rule.id, 'version', v_ver.version_number,
                                     'run_id', v_run, 'subject_id', v_subject.subject_id),
                  'auto_event:' || v_signal::text);
        end if;

        -- ------------------------------------------------------------------
        -- SALIDAS 2 y 3 · alerta y tarea, si la regla las pide
        -- ------------------------------------------------------------------
        for v_out in select * from jsonb_array_elements(v_ver.outputs) loop
          if (v_out ->> 'kind') = 'CREATE_SIGNAL' then
            continue;
          end if;

          v_pos := case v_out ->> 'recipient_kind'
            when 'rule_owner_position' then v_rule.owner_position_id
            when 'subject_owner_position' then v_subject.owner_position_id
            when 'specific_position' then (v_out ->> 'position_id')::uuid
          end;

          v_hubo_rec := false;
          for v_rec in
            select * from quality_automation_recipients(p_organization_id, v_pos, v_today)
          loop
            v_hubo_rec := true;
            if (v_out ->> 'kind') = 'CREATE_ALERT' then
              insert into work_alerts
                (organization_id, source_domain, alert_type, severity,
                 subject_type, subject_id, recipient_profile_id, title, message, dedupe_key)
              select p_organization_id, 'automation', 'automation_signal', v_ver.severity,
                     v_src.subject_type, v_subject.subject_id, v_rec.profile_id,
                     v_ver.signal_title,
                     coalesce(v_subject.subject_label, '') || ' · ' || (v_eval ->> 'explanation'),
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
                     v_src.subject_type, v_subject.subject_id,
                     coalesce(v_out ->> 'task_title', v_ver.signal_title),
                     coalesce(v_subject.subject_label, '') || E'\n' || (v_eval ->> 'explanation'),
                     v_rec.profile_id, v_pos, 'open',
                     case when (v_out ->> 'due_in_days') ~ '^[0-9]+$'
                          then v_today + (v_out ->> 'due_in_days')::integer else null end,
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
        v_fallos := v_fallos + 1;
        insert into quality_automation_run_rules
          (organization_id, run_id, platform_observer, status, error_message, duration_ms)
        values (p_organization_id, v_run, v_obs, 'failed', sqlerrm,
                extract(milliseconds from clock_timestamp() - v_t0)::integer);
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
revoke all on function public.quality_automation_run(uuid, text, uuid, date) from public, anon;
grant execute on function public.quality_automation_run(uuid, text, uuid, date) to authenticated;

comment on function public.quality_automation_run(uuid, text, uuid, date) is
  'QUALITY-11 · §106/§107 · UNA sola implementación. El barrido programado, la ejecución manual y la simulación son esta función con otro modo. La idempotencia la garantiza el índice único parcial, no un `select` previo.';


-- ============================================================================
-- 14 · SIMULACIÓN (§70, §71, §72, §144)
-- ----------------------------------------------------------------------------
-- Cuenta coincidencias sobre los datos reales y NO crea nada. Reutiliza el
-- mismo evaluador, la misma resolución de sujetos y las mismas guardas de
-- empresa: una simulación con otro código no simularía nada.
-- ============================================================================

create or replace function public.quality_automation_simulate(
  p_version_id uuid,
  p_today      date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ver     record;
  v_rule    record;
  v_labels  jsonb;
  v_subject record;
  v_eval    jsonb;
  v_today   date;
  v_sub     integer := 0;
  v_match   integer := 0;
  v_ej      jsonb := '[]'::jsonb;
begin
  select * into v_ver from quality_automation_rule_versions where id = p_version_id;
  if v_ver.id is null or not quality_manages_automation(v_ver.organization_id) then
    return null;
  end if;
  select * into v_rule from quality_automation_rules where id = v_ver.rule_id;
  v_today := coalesce(p_today, quality_automation_business_today(v_ver.organization_id));

  select coalesce(jsonb_object_agg(field, label), '{}'::jsonb) into v_labels
    from quality_automation_source_fields where source_code = v_rule.source_code;

  for v_subject in
    select * from quality_automation_subjects(v_ver.organization_id, v_rule.source_code, v_today)
  loop
    v_sub := v_sub + 1;
    v_eval := quality_automation_evaluate(v_subject.facts, v_ver.conditions, v_today, v_labels);
    if coalesce((v_eval ->> 'matched')::boolean, false) then
      v_match := v_match + 1;
      if jsonb_array_length(v_ej) < 10 then
        v_ej := v_ej || jsonb_build_object(
          'subject_id', v_subject.subject_id,
          'label', v_subject.subject_label,
          'explanation', v_eval ->> 'explanation');
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'business_date', v_today,
    'subjects_evaluated', v_sub,
    'matches', v_match,
    -- §144 · Las tres cifras que hacen la promesa comprobable.
    'signals_created', 0,
    'alerts_created', 0,
    'tasks_created', 0,
    'examples', v_ej,
    'summary', quality_automation_describe_version(p_version_id),
    'note', 'Una simulación no crea señales, ni alertas, ni tareas. Solo cuenta '
            || 'a cuántos sujetos alcanzaría la regla hoy.');
end;
$$;
revoke all on function public.quality_automation_simulate(uuid, date) from public, anon;
grant execute on function public.quality_automation_simulate(uuid, date) to authenticated;


-- ============================================================================
-- 15 · SEÑALES: RECONOCER, RESOLVER, SILENCIAR (§15, §39, §79, §80)
-- ============================================================================

create or replace function public.quality_signal_acknowledge(p_signal_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_s record;
begin
  select * into v_s from quality_signals where id = p_signal_id;
  if v_s.id is null then raise exception 'Esa señal no existe.'; end if;
  if not quality_manages_automation(v_s.organization_id) then
    raise exception 'Tu rol no permite gestionar señales.';
  end if;
  -- §39 · «Lo vi» no es «lo resolví»: reconocer no toca `resolved_at`.
  update quality_signals
     set status = case when status = 'open' then 'acknowledged' else status end,
         acknowledged_by = coalesce(acknowledged_by, auth.uid()),
         acknowledged_at = coalesce(acknowledged_at, now())
   where id = p_signal_id;
end;
$$;
revoke all on function public.quality_signal_acknowledge(uuid) from public, anon;
grant execute on function public.quality_signal_acknowledge(uuid) to authenticated;


create or replace function public.quality_signal_resolve(
  p_signal_id uuid, p_kind text, p_note text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_s record;
begin
  select * into v_s from quality_signals where id = p_signal_id;
  if v_s.id is null then raise exception 'Esa señal no existe.'; end if;
  if not quality_manages_automation(v_s.organization_id) then
    raise exception 'Tu rol no permite gestionar señales.';
  end if;
  if p_kind not in ('manual', 'dismissed') then
    raise exception 'Una señal se cierra resolviéndola o descartándola.';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Escribe por qué se cierra esta señal. Sin razón, cerrar es esconder.';
  end if;

  update quality_signals
     set status = case when p_kind = 'manual' then 'resolved' else 'dismissed' end,
         resolved_at = now(), resolution_kind = p_kind,
         resolution_note = p_note, resolved_by = auth.uid()
   where id = p_signal_id and resolved_at is null;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload, dedupe_key)
  values (v_s.organization_id, 'automation', 'automation.signal_resolved',
          'quality_signal', p_signal_id,
          'Señal cerrada: ' || v_s.title, jsonb_build_object('kind', p_kind),
          'auto_signal_closed:' || p_signal_id::text);
  -- Las TAREAS y las ACCIONES relacionadas no se tocan: son de otro dueño y
  -- tienen su propio cierre.
end;
$$;
revoke all on function public.quality_signal_resolve(uuid, text, text) from public, anon;
grant execute on function public.quality_signal_resolve(uuid, text, text) to authenticated;


create or replace function public.quality_signal_suppress(
  p_scope text, p_target_id uuid, p_reason text, p_until date default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid;
  v_id  uuid;
begin
  if p_scope not in ('signal', 'rule') then
    raise exception 'Solo se puede silenciar una señal o una regla.';
  end if;
  v_org := case p_scope
    when 'signal' then (select organization_id from quality_signals where id = p_target_id)
    when 'rule' then (select organization_id from quality_automation_rules where id = p_target_id)
  end;
  if v_org is null then raise exception 'Eso no existe.'; end if;
  if not quality_manages_automation(v_org) then
    raise exception 'Tu rol no permite silenciar señales ni reglas.';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Silenciar exige decir por qué, y hasta cuándo si procede.';
  end if;

  insert into quality_signal_suppressions
    (organization_id, scope, signal_id, rule_id, reason, suppressed_until)
  values (v_org, p_scope,
          case when p_scope = 'signal' then p_target_id end,
          case when p_scope = 'rule' then p_target_id end,
          p_reason, p_until)
  returning id into v_id;

  if p_scope = 'signal' then
    update quality_signals
       set status = 'suppressed', resolved_at = now(),
           resolution_kind = 'suppressed', resolution_note = p_reason,
           resolved_by = auth.uid()
     where id = p_target_id and resolved_at is null;
  end if;

  return v_id;
end;
$$;
revoke all on function public.quality_signal_suppress(text, uuid, text, date) from public, anon;
grant execute on function public.quality_signal_suppress(text, uuid, text, date) to authenticated;


-- ============================================================================
-- 16 · SALUD DEL MOTOR (§82, §83, §104, §172, §173)
-- ----------------------------------------------------------------------------
-- §173 · Un fallo del motor es un problema OPERATIVO, no una señal de calidad.
-- No se mezclan: la avería del termómetro no es fiebre.
-- ============================================================================

create or replace function public.quality_automation_health(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_cfg record;
begin
  if not is_org_member(p_organization_id) then return null; end if;
  select * into v_cfg from quality_automation_settings where organization_id = p_organization_id;

  return jsonb_build_object(
    'enabled', coalesce(v_cfg.is_enabled, true),
    'business_timezone', coalesce(v_cfg.business_timezone, 'UTC'),
    'business_today', quality_automation_business_today(p_organization_id),
    'last_run_at', v_cfg.last_run_at,
    'last_run_status', v_cfg.last_run_status,
    'last_success_at', v_cfg.last_success_at,
    'rules_total', (select count(*) from quality_automation_rules
                     where organization_id = p_organization_id),
    'rules_active', (select count(*) from quality_automation_rules
                      where organization_id = p_organization_id and status = 'active'),
    'rules_draft', (select count(*) from quality_automation_rules
                     where organization_id = p_organization_id and status = 'draft'),
    -- §82 · Reglas activas SIN versión vigente: activas de nombre y de nada más.
    'rules_without_effective_version', (
      select count(*) from quality_automation_rules r
       where r.organization_id = p_organization_id and r.status = 'active'
         and not exists (
           select 1 from quality_automation_rule_versions v
            where v.rule_id = r.id and v.status = 'published'
              and v.effective_from <= quality_automation_business_today(p_organization_id)
              and (v.effective_to is null
                   or v.effective_to >= quality_automation_business_today(p_organization_id)))),
    'rules_never_run', (
      select count(*) from quality_automation_rules r
       where r.organization_id = p_organization_id and r.status = 'active'
         and not exists (select 1 from quality_automation_run_rules rr
                          where rr.rule_id = r.id)),
    'rules_failing', (
      select count(distinct rr.rule_id) from quality_automation_run_rules rr
       join quality_automation_runs run on run.id = rr.run_id
       where rr.organization_id = p_organization_id and rr.status = 'failed'
         and run.started_at > now() - interval '7 days'),
    'rules_suppressed', (
      select count(*) from quality_signal_suppressions
       where organization_id = p_organization_id and scope = 'rule' and released_at is null),
    'signals_open', (select count(*) from quality_signals
                      where organization_id = p_organization_id and resolved_at is null),
    'signals_critical', (select count(*) from quality_signals
                          where organization_id = p_organization_id and resolved_at is null
                            and severity = 'critical'),
    'signals_unresolved_recipient', (
      select count(*) from quality_signals
       where organization_id = p_organization_id and resolved_at is null
         and recipient_unresolved),
    'runs_last_7d', (select count(*) from quality_automation_runs
                      where organization_id = p_organization_id
                        and started_at > now() - interval '7 days'),
    'runs_failed_last_7d', (select count(*) from quality_automation_runs
                             where organization_id = p_organization_id
                               and started_at > now() - interval '7 days'
                               and status in ('failed', 'partial')),
    'note', 'Un fallo del motor es un problema operativo, no una condición de '
            || 'calidad. Se cuentan aparte a propósito.');
end;
$$;
revoke all on function public.quality_automation_health(uuid) from public, anon;
grant execute on function public.quality_automation_health(uuid) to authenticated;


-- ============================================================================
-- 17 · LA BIBLIOTECA DE PLANTILLAS (§66, §67, §125, §170)
-- ----------------------------------------------------------------------------
-- §125 · NINGUNA se activa sola. Encender cincuenta reglas el primer día llena
-- la bandeja de ruido y enseña a ignorarla; a partir de ahí el motor está
-- encendido y apagado a la vez.
--
-- Lo que la empresa hace es INSTANCIAR la que quiere, ajustar sus números
-- —treinta días o sesenta, según le convenga (§67)— y publicarla. La plantilla
-- es global y no se edita desde ninguna empresa: instancia ≠ plantilla (§170).
--
-- Y las plantillas cubren lo que los barridos de QUALITY-03…10 NO cubrían. Lo
-- que ya observaban sigue siendo suyo, integrado como observador de plataforma:
-- dos mecanismos mirando lo mismo producirían dos avisos por condición.
-- ============================================================================

create table public.quality_automation_rule_templates (
  code            text primary key,
  name            text not null,
  description     text not null,
  category        text not null,
  source_code     text not null references public.quality_automation_sources (code),
  autonomy_level  text not null default 'A',
  severity        text not null default 'warning',
  signal_title    text not null,
  conditions      jsonb not null,
  outputs         jsonb not null,
  -- Qué números puede tocar la empresa sin salirse de la plantilla.
  tunable         jsonb not null default '[]'::jsonb,
  rationale       text not null,
  position_order  integer not null,

  constraint quality_automation_rule_templates_autonomy_check
    check (autonomy_level in ('A', 'B', 'C', 'D')),
  constraint quality_automation_rule_templates_severity_check
    check (severity in ('info', 'warning', 'critical'))
);

comment on table public.quality_automation_rule_templates is
  'QUALITY-11 · §66/§125 · Plantillas recomendadas, TODAS apagadas. La empresa instancia la que quiere y ajusta sus números. Ninguna se enciende sola.';

revoke all on table public.quality_automation_rule_templates from anon, authenticated;
grant select on table public.quality_automation_rule_templates to authenticated;

insert into public.quality_automation_rule_templates
  (code, name, description, category, source_code, autonomy_level, severity,
   signal_title, conditions, outputs, tunable, rationale, position_order)
values
  ('indicator_out_of_target',
   'Indicador fuera de meta',
   'Emite una señal cuando la última evaluación de un indicador activo no cumple la meta.',
   'indicators', 'indicator', 'A', 'warning',
   'Indicador fuera de meta',
   '[{"field":"last_evaluation","operator":"equals","value":"not_met"}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"subject_owner_position"}]'::jsonb,
   '[]'::jsonb,
   'Que un indicador no cumpla su meta es un HECHO, no una no conformidad. La señal avisa; clasificar es de una persona, en Casos.',
   1),

  ('indicator_consecutive_out_of_target',
   'Indicador fuera de meta varios periodos seguidos',
   'Emite una señal cuando un indicador lleva N periodos consecutivos sin cumplir.',
   'indicators', 'indicator', 'A', 'critical',
   'Indicador fuera de meta varios periodos seguidos',
   '[{"field":"evaluation_series_out_of_target","operator":"consecutive_count","value":3}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"subject_owner_position"},
     {"kind":"CREATE_TASK","recipient_kind":"subject_owner_position",
      "task_title":"Analizar el indicador que lleva varios periodos fuera de meta",
      "due_in_days":15}]'::jsonb,
   '[{"field":"evaluation_series_out_of_target","label":"Periodos consecutivos","default":3}]'::jsonb,
   'Un mal periodo puede ser ruido; tres seguidos son una tendencia. La cifra la decide la empresa, no la plataforma.',
   2),

  ('indicator_strictly_decreasing',
   'Indicador que baja tres periodos seguidos',
   'Emite una señal cuando los últimos N valores de un indicador bajan uno tras otro.',
   'indicators', 'indicator', 'A', 'warning',
   'El indicador baja periodo tras periodo',
   '[{"field":"value_series","operator":"strictly_decreasing","value":3}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"subject_owner_position"}]'::jsonb,
   '[{"field":"value_series","label":"Periodos que deben bajar","default":3}]'::jsonb,
   'Esto es aritmética, no interpretación: 90 → 80 → 70 baja, y decirlo no es predecir nada. La lectura de qué significa sigue siendo humana.',
   3),

  ('objective_indicators_without_data',
   'Objetivo con indicadores sin medir',
   'Emite una señal cuando un objetivo activo tiene indicadores sin dato.',
   'objectives', 'objective', 'A', 'warning',
   'Objetivo con indicadores sin medir',
   '[{"field":"admin_state","operator":"equals","value":"active"},
     {"field":"indicators_without_data","operator":"greater_than","value":0}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"subject_owner_position"}]'::jsonb,
   '[]'::jsonb,
   'Sin dato no es incumplimiento: es que no se sabe. Y no saberlo, en un objetivo vigente, es exactamente lo que hay que avisar.',
   4),

  ('action_due_soon',
   'Acción a punto de vencer',
   'Avisa N días antes de la fecha límite de una acción abierta.',
   'actions', 'action', 'A', 'info',
   'Acción a punto de vencer',
   '[{"field":"status","operator":"in","value":["planned","in_progress"]},
     {"field":"due_on","operator":"days_before","value":7}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"subject_owner_position"}]'::jsonb,
   '[{"field":"due_on","label":"Días de aviso","default":7}]'::jsonb,
   'La plataforma ya avisaba de lo vencido. Avisar ANTES es lo que evita que venza.',
   5),

  ('action_effectiveness_due',
   'Eficacia pendiente de verificar',
   'Emite una señal cuando una acción completada sigue con la eficacia sin verificar.',
   'actions', 'action', 'A', 'warning',
   'Falta verificar si la acción sirvió',
   '[{"field":"status","operator":"equals","value":"completed"},
     {"field":"effectiveness_result","operator":"equals","value":"pending"},
     {"field":"completed_on","operator":"days_after","value":30}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_TASK","recipient_kind":"subject_owner_position",
      "task_title":"Verificar si la acción sirvió","due_in_days":15}]'::jsonb,
   '[{"field":"completed_on","label":"Días tras completarla","default":30}]'::jsonb,
   'Una acción completada y nunca verificada es una mejora que nadie comprobó. La regla avisa; NO marca la eficacia.',
   6),

  ('risk_treatment_overdue',
   'Tratamiento de riesgo vencido',
   'Emite una señal cuando la revisión del plan de tratamiento pasó de fecha.',
   'risks', 'risk', 'A', 'warning',
   'Tratamiento de riesgo vencido',
   '[{"field":"treatment_review_on","operator":"days_after","value":0}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"subject_owner_position"}]'::jsonb,
   '[]'::jsonb,
   'La plataforma ya avisaba de la revisión del riesgo. El TRATAMIENTO es otra fecha, y se le pasaba.',
   7),

  ('supplier_critical_reevaluation_overdue',
   'Proveedor crítico con reevaluación vencida',
   'Cruza criticidad y fecha: alcance de criticidad alta cuya reevaluación ya pasó.',
   'cross_domain', 'supplier_scope', 'A', 'critical',
   'Proveedor crítico con reevaluación vencida',
   -- La etiqueta de criticidad la pone la METODOLOGÍA de cada empresa, así que
   -- ninguna lista fija puede acertar siempre. Se traen las formas habituales
   -- y el campo se declara ajustable: al instanciar la plantilla, la empresa
   -- escoge exactamente cuáles de SUS niveles cuentan como críticos (§67).
   '[{"field":"criticality_label","operator":"in",
      "value":["Alta","Alto","Crítica","Crítico","Muy alta","Muy alto","High","Critical"]},
     {"field":"next_review_on","operator":"days_after","value":0}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"subject_owner_position"},
     {"kind":"CREATE_TASK","recipient_kind":"subject_owner_position",
      "task_title":"Reevaluar al proveedor crítico","due_in_days":30}]'::jsonb,
   '[{"field":"criticality_label","label":"Criticidades incluidas"}]'::jsonb,
   'Cruzar dos dominios es lo que convierte dos datos ciertos en una prioridad. Y la señal NO cambia ninguna aprobación: eso lo decide una persona.',
   8),

  ('document_revision_effective_soon',
   'Revisión de documento a punto de entrar en vigor',
   'Avisa N días antes de que una revisión aprobada entre en vigencia.',
   'documents', 'document_revision', 'A', 'info',
   'Una revisión entra en vigor pronto',
   '[{"field":"effective_from","operator":"days_before","value":15}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"rule_owner_position"}]'::jsonb,
   '[{"field":"effective_from","label":"Días de aviso","default":15}]'::jsonb,
   'Quien tiene que formar a la gente en un procedimiento nuevo lo agradece antes, no el día que ya rige.',
   9),

  ('competency_evidence_expiring_window',
   'Evidencia de competencia por caducar',
   'Avisa N días antes de que caduque una evidencia. La ventana la fija la empresa.',
   'people', 'competency_evidence', 'A', 'warning',
   'Evidencia de competencia por caducar',
   '[{"field":"valid_until","operator":"days_before","value":60}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"rule_owner_position"}]'::jsonb,
   '[{"field":"valid_until","label":"Días de aviso","default":60}]'::jsonb,
   'La plataforma avisa con una ventana fija; un certificado que tarda tres meses en renovarse necesita más. Y esto NO declara incompetente a nadie.',
   10),

  ('customer_metric_deterioration',
   'La satisfacción baja frente al periodo comparable',
   'Emite una señal cuando una métrica cae más de N puntos frente al periodo anterior comparable.',
   'customer', 'customer_metric', 'A', 'warning',
   'La satisfacción bajó frente al periodo anterior',
   '[{"field":"breaks_comparability","operator":"equals","value":false},
     {"field":"delta","operator":"less_than","value":-5}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"rule_owner_position"}]'::jsonb,
   '[{"field":"delta","label":"Caída mínima","default":-5}]'::jsonb,
   'Solo compara lo comparable: si la metodología cambió, la regla no dispara. Y observa la MÉTRICA, nunca quién respondió.',
   11),

  ('audit_finding_awaiting_assessment_window',
   'Hallazgo de auditoría sin evaluar',
   'Emite una señal cuando un hallazgo lleva N días sin evaluar. La ventana la fija la empresa.',
   'audits', 'audit_finding', 'A', 'warning',
   'Hallazgo de auditoría sin evaluar',
   '[{"field":"evaluation_status","operator":"equals","value":"pending"},
     {"field":"raised_on","operator":"days_after","value":30}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"rule_owner_position"}]'::jsonb,
   '[{"field":"raised_on","label":"Días sin evaluar","default":30}]'::jsonb,
   'Evaluar un hallazgo NO lo convierte en no conformidad, y esta regla tampoco. Solo dice que sigue sin mirarse.',
   12),

  ('management_review_source_updated',
   'Una fuente cambió después de preparar la entrada',
   'Emite una señal cuando el dato de una entrada de la revisión ya no coincide con su fuente.',
   'management_review', 'management_review_input', 'A', 'info',
   'La fuente de una entrada cambió',
   '[{"field":"source_updated","operator":"equals","value":true},
     {"field":"input_mode","operator":"equals","value":"automatic"}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"rule_owner_position"}]'::jsonb,
   '[]'::jsonb,
   'QUALITY-10 dejó el aviso preparado y nadie lo emitía. Esta regla lo emite — y no sustituye el retrato: refrescar sigue siendo un acto consciente.',
   13),

  ('knowledge_single_holder_critical',
   'Conocimiento crítico en una sola persona',
   'Emite una señal cuando un conocimiento crítico depende de un único poseedor.',
   'people', 'knowledge_item', 'A', 'warning',
   'Conocimiento crítico con un solo poseedor',
   '[{"field":"holder_count","operator":"lte","value":1},
     {"field":"criticality","operator":"in","value":["high","critical"]}]'::jsonb,
   '[{"kind":"CREATE_SIGNAL"},
     {"kind":"CREATE_ALERT","recipient_kind":"rule_owner_position"}]'::jsonb,
   '[{"field":"holder_count","label":"Poseedores mínimos","default":1}]'::jsonb,
   'Habla de la CONTINUIDAD del sistema, no de la persona. El nombre no entra en la señal.',
   14)
on conflict (code) do nothing;


-- Instanciar una plantilla en una empresa: nace en BORRADOR (§125).
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
     owner_position_id, status, autonomy_level, template_code)
  values (p_organization_id, v_code, v_t.name, v_t.description, v_t.category,
          v_t.source_code, p_owner_position_id, 'draft', v_t.autonomy_level,
          v_t.code)
  returning id into v_rule;

  insert into quality_automation_rule_versions
    (organization_id, rule_id, version_number, status, trigger_kind,
     schedule_frequency, conditions, outputs, severity, signal_title, change_note)
  values (p_organization_id, v_rule, 1, 'draft', 'schedule', 'daily',
          coalesce(p_conditions, v_t.conditions), v_t.outputs, v_t.severity,
          v_t.signal_title,
          'Creada desde la plantilla «' || v_t.name || '».');

  return v_rule;
end;
$$;
revoke all on function public.quality_automation_instantiate_template(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.quality_automation_instantiate_template(uuid, text, uuid, jsonb) to authenticated;


-- ============================================================================
-- 18 · VISTAS (§74, §75, §76)
-- ============================================================================

create or replace view public.v_quality_automation_rule_overview
with (security_invoker = true) as
select
  r.organization_id,
  r.id as rule_id,
  r.code, r.name, r.description, r.category, r.source_code,
  s.label as source_label, s.domain as source_domain, s.deep_link,
  r.status, r.autonomy_level, r.is_platform, r.template_code,
  r.owner_position_id, po.name as owner_position_name,
  r.created_at,
  cur.id             as current_version_id,
  cur.version_number as current_version_number,
  cur.severity       as current_severity,
  cur.signal_title   as current_signal_title,
  cur.conditions     as current_conditions,
  cur.outputs        as current_outputs,
  cur.effective_from as current_effective_from,
  cur.trigger_kind, cur.schedule_frequency,
  drafts.total       as draft_version_count,
  coalesce(sig.open_count, 0)     as open_signal_count,
  coalesce(sig.critical_count, 0) as critical_signal_count,
  last_run.started_at             as last_evaluated_at,
  last_run.status                 as last_evaluation_status,
  (exists (select 1 from public.quality_signal_suppressions sp
            where sp.organization_id = r.organization_id and sp.scope = 'rule'
              and sp.rule_id = r.id and sp.released_at is null)) as is_suppressed
from public.quality_automation_rules r
join public.quality_automation_sources s on s.code = r.source_code
left join public.quality_positions po
  on po.organization_id = r.organization_id and po.id = r.owner_position_id
left join lateral (
  select v.* from public.quality_automation_rule_versions v
   where v.organization_id = r.organization_id and v.rule_id = r.id
     and v.status = 'published'
   order by v.version_number desc limit 1) cur on true
left join lateral (
  select count(*) as total from public.quality_automation_rule_versions v
   where v.organization_id = r.organization_id and v.rule_id = r.id
     and v.status = 'draft') drafts on true
left join lateral (
  select count(*) filter (where x.resolved_at is null) as open_count,
         count(*) filter (where x.resolved_at is null and x.severity = 'critical') as critical_count
    from public.quality_signals x
   where x.organization_id = r.organization_id and x.rule_id = r.id) sig on true
left join lateral (
  select run.started_at, rr.status
    from public.quality_automation_run_rules rr
    join public.quality_automation_runs run
      on run.organization_id = rr.organization_id and run.id = rr.run_id
   where rr.organization_id = r.organization_id and rr.rule_id = r.id
   order by run.started_at desc limit 1) last_run on true;

comment on view public.v_quality_automation_rule_overview is
  'QUALITY-11 · §74 · Qué observa cada regla, con qué versión vigente y qué ha encontrado. La versión que se muestra es la publicada, no el borrador.';

revoke all on public.v_quality_automation_rule_overview from anon, authenticated;
grant select on public.v_quality_automation_rule_overview to authenticated;


create or replace view public.v_quality_signal_overview
with (security_invoker = true) as
select
  sg.organization_id,
  sg.id as signal_id,
  sg.domain, sg.source_code, src.label as source_label, src.deep_link,
  sg.subject_type, sg.subject_id, sg.subject_label,
  sg.severity, sg.status, sg.title, sg.explanation, sg.source_snapshot,
  sg.first_detected_at, sg.last_detected_at, sg.detection_count,
  sg.acknowledged_at, sg.resolved_at, sg.resolution_kind, sg.resolution_note,
  sg.recipient_unresolved,
  sg.rule_id, r.code as rule_code, r.name as rule_name,
  sg.rule_version_id, v.version_number as rule_version_number,
  sg.run_id,
  coalesce(al.total, 0) as alert_count,
  coalesce(tk.total, 0) as task_count,
  coalesce(tk.open_total, 0) as open_task_count
from public.quality_signals sg
join public.quality_automation_sources src on src.code = sg.source_code
left join public.quality_automation_rules r
  on r.organization_id = sg.organization_id and r.id = sg.rule_id
left join public.quality_automation_rule_versions v
  on v.organization_id = sg.organization_id and v.id = sg.rule_version_id
left join lateral (
  select count(*) as total from public.work_alerts w
   where w.organization_id = sg.organization_id
     and w.dedupe_key like 'auto_alert:' || sg.id::text || ':%') al on true
left join lateral (
  select count(*) as total,
         count(*) filter (where w.status in ('open', 'in_progress')) as open_total
    from public.work_tasks w
   where w.organization_id = sg.organization_id
     and w.dedupe_key like 'auto_task:' || sg.id::text || ':%') tk on true;

comment on view public.v_quality_signal_overview is
  'QUALITY-11 · §75/§76 · La bandeja transversal de señales, con su regla, su versión y cuántas alertas y tareas produjo. Las alertas y las tareas se cuentan; no se copian.';

revoke all on public.v_quality_signal_overview from anon, authenticated;
grant select on public.v_quality_signal_overview to authenticated;


create or replace view public.v_quality_automation_run_overview
with (security_invoker = true) as
select
  run.organization_id,
  run.id as run_id,
  run.run_kind, run.business_date, run.started_at, run.finished_at, run.status,
  run.rules_evaluated, run.subjects_evaluated, run.matches,
  run.signals_created, run.alerts_created, run.tasks_created, run.failures,
  run.triggered_by,
  extract(milliseconds from run.finished_at - run.started_at)::integer as duration_ms,
  coalesce(det.observers, 0) as platform_observers,
  coalesce(det.rules, 0)     as organization_rules
from public.quality_automation_runs run
left join lateral (
  select count(*) filter (where rr.platform_observer is not null) as observers,
         count(*) filter (where rr.rule_id is not null) as rules
    from public.quality_automation_run_rules rr
   where rr.organization_id = run.organization_id and rr.run_id = run.id) det on true;

revoke all on public.v_quality_automation_run_overview from anon, authenticated;
grant select on public.v_quality_automation_run_overview to authenticated;


-- ============================================================================
-- 19 · CICLO DE VIDA Y BORRADO (§97, §98, §99, §151)
-- ============================================================================

create or replace function public.quality_automation_rule_deletion_verdict(p_rule_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_r        record;
  v_bloq     jsonb := '[]'::jsonb;
  v_pub      integer;
  v_sig      integer;
  v_run      integer;
begin
  select * into v_r from quality_automation_rules where id = p_rule_id;
  if v_r.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Esa regla no existe.', 'blocking', '[]'::jsonb);
  end if;

  select count(*) into v_pub from quality_automation_rule_versions
   where rule_id = p_rule_id and status <> 'draft';
  select count(*) into v_sig from quality_signals where rule_id = p_rule_id;
  select count(*) into v_run from quality_automation_run_rules where rule_id = p_rule_id;

  if v_pub > 0 then
    v_bloq := v_bloq || jsonb_build_object('label', 'versión(es) publicadas', 'count', v_pub);
  end if;
  if v_sig > 0 then
    v_bloq := v_bloq || jsonb_build_object('label', 'señal(es) emitidas', 'count', v_sig);
  end if;
  if v_run > 0 then
    v_bloq := v_bloq || jsonb_build_object('label', 'ejecución(es) registradas', 'count', v_run);
  end if;
  if v_r.is_platform then
    v_bloq := v_bloq || jsonb_build_object('label', 'regla de plataforma', 'count', 1);
  end if;

  if jsonb_array_length(v_bloq) > 0 then
    return jsonb_build_object(
      'can_hard_delete', false, 'reason_code', 'has_history',
      'reason', 'Esta regla ya observó algo. Borrarla dejaría señales sin poder '
                || 'explicar por qué saltaron.',
      'blocking', v_bloq,
      'alternative', 'retire',
      'alternative_label', 'Puedes desactivarla o retirarla: deja de evaluar y conserva su historia');
  end if;

  return jsonb_build_object(
    'can_hard_delete', true, 'reason_code', 'disposable',
    'reason', 'Esta regla sigue siendo un borrador que nunca se publicó ni se ejecutó.',
    'blocking', '[]'::jsonb, 'alternative', null, 'alternative_label', null);
end;
$$;
revoke all on function public.quality_automation_rule_deletion_verdict(uuid) from public, anon;
grant execute on function public.quality_automation_rule_deletion_verdict(uuid) to authenticated;


create or replace function public.quality_deletion_eligibility(p_entity text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_none jsonb := jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
                                     'reason', 'Este registro no existe.', 'blocking', '[]'::jsonb);
begin
  if auth.uid() is null then return v_none; end if;

  v_org := case p_entity
    when 'indicator'      then (select organization_id from quality_indicators      where id = p_id)
    when 'objective'      then (select organization_id from quality_objectives      where id = p_id)
    when 'position'       then (select organization_id from quality_positions       where id = p_id)
    when 'document'       then (select organization_id from trazadoc_documents      where id = p_id)
    when 'process'        then (select organization_id from quality_processes       where id = p_id)
    when 'case'           then (select organization_id from work_cases              where id = p_id)
    when 'action'         then (select organization_id from work_actions            where id = p_id)
    when 'risk'           then (select organization_id from quality_risks           where id = p_id)
    when 'opportunity'    then (select organization_id from quality_opportunities   where id = p_id)
    when 'control'        then (select organization_id from quality_controls        where id = p_id)
    when 'methodology_version' then (select organization_id from quality_risk_methodology_versions where id = p_id)
    when 'person'         then (select organization_id from quality_people          where id = p_id)
    when 'competency'     then (select organization_id from quality_competencies    where id = p_id)
    when 'knowledge_item' then (select organization_id from quality_knowledge_items where id = p_id)
    when 'lesson'         then (select organization_id from quality_lessons_learned where id = p_id)
    when 'supplier'       then (select organization_id from quality_supplier_profiles where id = p_id)
    when 'customer'       then (select organization_id from quality_customer_profiles where id = p_id)
    when 'survey'         then (select organization_id from quality_surveys         where id = p_id)
    when 'audit'          then (select organization_id from quality_audits          where id = p_id)
    when 'audit_program'  then (select organization_id from quality_audit_programs  where id = p_id)
    when 'management_review' then (select organization_id from quality_management_reviews where id = p_id)
    when 'automation_rule' then (select organization_id from quality_automation_rules where id = p_id)
  end;

  if v_org is null or not is_org_member(v_org) then return v_none; end if;

  -- QUALITY-06 · Ser miembro no basta para las PERSONAS: quien no puede ver una
  -- ficha tampoco puede enterarse de cuánta historia tiene.
  if p_entity = 'person' and not quality_can_read_person(v_org, p_id) then
    return v_none;
  end if;

  return case p_entity
    when 'indicator'      then quality_indicator_deletion_verdict(p_id)
    when 'objective'      then quality_objective_deletion_verdict(p_id)
    when 'position'       then quality_position_deletion_verdict(p_id)
    when 'document'       then trazadoc_document_deletion_verdict(p_id)
    when 'process'        then quality_process_deletion_verdict(p_id)
    when 'case'           then work_case_deletion_verdict(p_id)
    when 'action'         then work_action_deletion_verdict(p_id)
    when 'risk'           then quality_risk_deletion_verdict(p_id)
    when 'opportunity'    then quality_opportunity_deletion_verdict(p_id)
    when 'control'        then quality_control_deletion_verdict(p_id)
    when 'methodology_version' then quality_methodology_version_deletion_verdict(p_id)
    when 'person'         then quality_person_deletion_verdict(p_id)
    when 'competency'     then quality_competency_deletion_verdict(p_id)
    when 'knowledge_item' then quality_knowledge_item_deletion_verdict(p_id)
    when 'lesson'         then quality_lesson_deletion_verdict(p_id)
    when 'supplier'       then quality_supplier_deletion_verdict(p_id)
    when 'customer'       then quality_customer_deletion_verdict(p_id)
    when 'survey'         then quality_survey_deletion_verdict(p_id)
    when 'audit'          then quality_audit_deletion_verdict(p_id)
    when 'audit_program'  then quality_audit_program_deletion_verdict(p_id)
    when 'management_review' then quality_management_review_deletion_verdict(p_id)
    when 'automation_rule' then quality_automation_rule_deletion_verdict(p_id)
  end;
end;
$$;
revoke all on function public.quality_deletion_eligibility(text, uuid) from public, anon;
grant execute on function public.quality_deletion_eligibility(text, uuid) to authenticated;


create or replace function public.quality_automation_rule_delete_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v jsonb;
begin
  v := quality_automation_rule_deletion_verdict(old.id);
  if coalesce((v ->> 'can_hard_delete')::boolean, false) then return old; end if;
  raise exception '%', coalesce(v ->> 'reason', 'Esta regla no se puede eliminar.');
end;
$$;

create trigger t_quality_automation_rule_delete_guard
  before delete on public.quality_automation_rules
  for each row execute function public.quality_automation_rule_delete_guard();


-- §98/§99 · Las señales y las ejecuciones no se borran: son la explicación de
-- por qué la plataforma dijo lo que dijo.
create or replace function public.quality_automation_history_is_immutable()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  raise exception 'Las señales y las ejecuciones no se borran: son la prueba de qué observó la plataforma y por qué. Una señal se resuelve, se descarta o se silencia.';
end;
$$;

create trigger t_quality_signals_no_delete
  before delete on public.quality_signals
  for each row execute function public.quality_automation_history_is_immutable();
create trigger t_quality_automation_runs_no_delete
  before delete on public.quality_automation_runs
  for each row execute function public.quality_automation_history_is_immutable();


-- ============================================================================
-- 20 · RLS Y PRIVILEGIOS (§87, §88, §89, §90)
-- ----------------------------------------------------------------------------
-- §90 · Las políticas de `work_alerts` y `work_tasks` NO se tocan. El motor
-- escribe en ellas desde una función `security definer` que ya comprobó rol y
-- empresa; un usuario normal sigue exactamente igual de limitado que antes.
--
-- Supabase concede por defecto TRUNCATE, REFERENCES y TRIGGER sobre cada tabla
-- nueva. Por eso cada una REVOCA primero.
-- ============================================================================

alter table public.quality_automation_settings      enable row level security;
alter table public.quality_automation_rules         enable row level security;
alter table public.quality_automation_rule_versions enable row level security;
alter table public.quality_automation_runs          enable row level security;
alter table public.quality_automation_run_rules     enable row level security;
alter table public.quality_signals                  enable row level security;
alter table public.quality_signal_suppressions      enable row level security;

-- Lectura: quien pertenece a la empresa.
create policy quality_automation_settings_select on public.quality_automation_settings
  for select to authenticated using (is_org_member(organization_id));
create policy quality_automation_rules_select on public.quality_automation_rules
  for select to authenticated using (is_org_member(organization_id));
create policy quality_automation_rule_versions_select on public.quality_automation_rule_versions
  for select to authenticated using (is_org_member(organization_id));
create policy quality_automation_runs_select on public.quality_automation_runs
  for select to authenticated using (is_org_member(organization_id));
create policy quality_automation_run_rules_select on public.quality_automation_run_rules
  for select to authenticated using (is_org_member(organization_id));
create policy quality_signals_select on public.quality_signals
  for select to authenticated using (is_org_member(organization_id));
create policy quality_signal_suppressions_select on public.quality_signal_suppressions
  for select to authenticated using (is_org_member(organization_id));

-- Escritura de configuración y borradores: quien conduce el dominio.
create policy quality_automation_settings_write on public.quality_automation_settings
  for all to authenticated
  using (quality_manages_automation(organization_id))
  with check (quality_manages_automation(organization_id));
create policy quality_automation_rules_write on public.quality_automation_rules
  for all to authenticated
  using (quality_manages_automation(organization_id) and not is_platform)
  with check (quality_manages_automation(organization_id) and not is_platform);
create policy quality_automation_rule_versions_write on public.quality_automation_rule_versions
  for all to authenticated
  using (quality_manages_automation(organization_id))
  with check (quality_manages_automation(organization_id));
create policy quality_signal_suppressions_write on public.quality_signal_suppressions
  for all to authenticated
  using (quality_manages_automation(organization_id))
  with check (quality_manages_automation(organization_id));

-- §99/§114 · Las EJECUCIONES no tienen política de escritura: las escribe el
-- motor, y una ejecución que se pudiera editar dejaría de probar nada.
-- §79/§98 · Las SEÑALES solo admiten `update` —reconocer, resolver, silenciar—
-- y un disparador congela la evidencia de cómo se originaron.
create policy quality_signals_update on public.quality_signals
  for update to authenticated
  using (quality_manages_automation(organization_id))
  with check (quality_manages_automation(organization_id));

revoke all on table public.quality_automation_settings      from anon, authenticated;
revoke all on table public.quality_automation_rules         from anon, authenticated;
revoke all on table public.quality_automation_rule_versions from anon, authenticated;
revoke all on table public.quality_automation_runs          from anon, authenticated;
revoke all on table public.quality_automation_run_rules     from anon, authenticated;
revoke all on table public.quality_signals                  from anon, authenticated;
revoke all on table public.quality_signal_suppressions      from anon, authenticated;

grant select, insert, update, delete on table public.quality_automation_settings      to authenticated;
grant select, insert, update, delete on table public.quality_automation_rules         to authenticated;
grant select, insert, update, delete on table public.quality_automation_rule_versions to authenticated;
grant select, insert, update, delete on table public.quality_signal_suppressions      to authenticated;
-- Señales: se leen y se actualizan. No se insertan a mano ni se borran.
grant select, update on table public.quality_signals to authenticated;
-- Ejecuciones: solo se leen.
grant select on table public.quality_automation_runs      to authenticated;
grant select on table public.quality_automation_run_rules to authenticated;


-- ============================================================================
-- 21 · VERIFICACIÓN MANUAL
-- ----------------------------------------------------------------------------
-- select count(*) from pg_tables where schemaname='public'
--   and (tablename like 'quality_automation%' or tablename like 'quality_signal%');
-- select count(*) from public.quality_automation_sources;              -- 18
-- select count(*) from public.quality_automation_source_fields;
-- select count(*) from public.quality_automation_rule_templates;       -- 14
-- select count(*) from public.quality_automation_sources
--   where subject_type in ('work_task','work_alert','quality_signal');  -- 0 · §84
-- select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public' and p.prosecdef and p.proname like 'quality_automation%'
--    and coalesce(array_to_string(p.proconfig,','),'') not like '%search_path%';  -- 0
-- ============================================================================
