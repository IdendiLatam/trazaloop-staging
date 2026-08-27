-- ============================================================================
-- 0132_quality_ai_copilot.sql · QUALITY-12
-- ============================================================================
-- La primera capa de IA de Trazaloop Quality. Y lo primero que hay que decir es
-- lo que NO cambia: ni una sola decisión formal de este sistema pasa a tomarla
-- un modelo.
--
-- ----------------------------------------------------------------------------
-- LAS SEIS SEPARACIONES
-- ----------------------------------------------------------------------------
--   SALIDA DE IA        ≠  HECHO DE NEGOCIO
--   SUGERENCIA DE IA    ≠  DECISIÓN FORMAL
--   BORRADOR DE IA      ≠  REGISTRO APROBADO
--   INFERENCIA DE IA    ≠  EVIDENCIA
--   RESUMEN DE IA       ≠  FUENTE
--   IA                  ≠  AUTOMATIZACIÓN DETERMINÍSTICA (QUALITY-11)
--
-- ----------------------------------------------------------------------------
-- POR QUÉ ESTE ESQUEMA ES TAN PEQUEÑO
-- ----------------------------------------------------------------------------
-- Porque casi todo lo que el Copilot necesita YA existe: los procesos, los
-- indicadores, los riesgos, las señales, las revisiones. La IA no guarda una
-- copia de nada: guarda QUÉ preguntó alguien, CON QUÉ contexto autorizado se
-- respondió, CON QUÉ modelo y QUÉ propuso. Nada más.
--
-- Y no hay base vectorial. No la hay porque no hace falta: los datos de
-- Trazaloop están estructurados y se leen por adaptadores tipados, igual que en
-- QUALITY-11. Meter embeddings «porque esto es IA» sería infraestructura nueva
-- sin problema que resolver, con su propio problema de aislamiento, borrado y
-- verdad histórica encima.
--
-- ----------------------------------------------------------------------------
-- LO QUE ESTE ESQUEMA IMPIDE, POR CONSTRUCCIÓN
-- ----------------------------------------------------------------------------
-- · Ninguna tabla de aquí puede escribir en una tabla de negocio. No hay
--   disparador, ni función, ni política que lo permita.
-- · Una sugerencia aceptada NO crea nada: solo se marca como aceptada y anota
--   con qué objeto de negocio la relacionó UNA PERSONA después.
-- · El actor de todo objeto de negocio sigue siendo el usuario. Siempre.
-- ============================================================================


-- ============================================================================
-- 1 · LA CONFIGURACIÓN POR EMPRESA (§77, §78)
-- ----------------------------------------------------------------------------
-- Ninguna empresa está obligada a usar IA, y la que la use puede apagar los
-- usos que no quiera. Cuatro interruptores, no cincuenta: la granularidad que
-- de verdad cambia decisiones —las personas y los clientes— y poco más.
-- ============================================================================

create table public.quality_ai_settings (
  organization_id   uuid primary key references public.organizations (id) on delete restrict,

  is_enabled        boolean not null default false,

  -- §78 · Los usos sensibles se apagan por separado.
  allow_people      boolean not null default false,
  allow_customer    boolean not null default true,
  allow_drafts      boolean not null default true,

  -- §76/§89 · Los topes. Existen para que un error no se convierta en factura.
  monthly_run_limit integer not null default 500,
  daily_user_limit  integer not null default 50,

  -- §30/§31 · Qué se conserva. Por omisión se guarda lo mínimo que hace falta
  -- para poder responder «¿por qué me dijiste eso?»: la pregunta, la respuesta
  -- y las referencias. Una empresa puede pedir que ni siquiera eso.
  retain_question   boolean not null default true,
  retain_answer     boolean not null default true,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_ai_settings_limits_check
    check (monthly_run_limit between 0 and 100000 and daily_user_limit between 0 and 10000)
);

comment on table public.quality_ai_settings is
  'QUALITY-12 · §77 · Si la empresa usa IA, qué usos permite y con qué topes. Nace APAGADA: encender la IA sobre los datos de una empresa es una decisión de la empresa.';

create trigger t_quality_ai_settings_updated
  before update on public.quality_ai_settings
  for each row execute function public.set_updated_at();
create trigger t_quality_ai_settings_force_created_by
  before insert on public.quality_ai_settings
  for each row execute function public.force_created_by();


-- ============================================================================
-- 2 · EL CATÁLOGO TIPADO DE FUENTES DE IA (§11)
-- ----------------------------------------------------------------------------
-- La misma filosofía que QUALITY-11, por la misma razón: lo que el Copilot
-- puede mirar está escrito, y solo eso. Aquí, además, cada fuente declara su
-- CLASE DE PRIVACIDAD y su semántica temporal, porque no es lo mismo resumir
-- indicadores que tocar la ficha de una persona o una respuesta anónima.
-- ============================================================================

create table public.quality_ai_sources (
  code            text primary key,
  label           text not null,
  domain          text not null,
  entity_type     text not null,

  -- §31/§32/§34 · De qué se puede hablar, y con cuánto cuidado.
  --   open       · información del sistema de gestión, sin personas dentro
  --   people     · toca a personas identificables · exige `allow_people`
  --   anonymous  · agregados de respuestas anónimas · NUNCA identidad
  --   restricted · exige comprobación adicional de permiso por fila
  privacy_class   text not null,

  -- §22 · Qué sabe hacer con el tiempo.
  --   current    · solo el estado de hoy
  --   period     · admite acotar por periodo
  --   as_of      · sabe reconstruir cómo estaba en una fecha
  historical_mode text not null,

  -- §14 · Qué hace falta para leerla, en el lenguaje de permisos que ya existe.
  permission_note text not null,
  deep_link       text,
  position_order  integer not null default 1,

  constraint quality_ai_sources_privacy_check
    check (privacy_class in ('open', 'people', 'anonymous', 'restricted')),
  constraint quality_ai_sources_historical_check
    check (historical_mode in ('current', 'period', 'as_of'))
);

comment on table public.quality_ai_sources is
  'QUALITY-12 · §11 · Lo que el Copilot puede mirar, con su clase de privacidad y su semántica temporal. De plataforma: ninguna empresa lo edita, y el modelo no lo elige.';

revoke all on table public.quality_ai_sources from anon, authenticated;
grant select on table public.quality_ai_sources to authenticated;

insert into public.quality_ai_sources
  (code, label, domain, entity_type, privacy_class, historical_mode, permission_note, deep_link, position_order)
values
  ('process',            'Procesos',                     'processes',         'quality_process',            'open',      'as_of',   'Miembro de la empresa.', '/quality/processes', 1),
  ('document_revision',  'Documentos y revisiones',      'documents',         'trazadoc_document',          'open',      'as_of',   'Miembro de la empresa.', '/quality/documents', 2),
  ('objective',          'Objetivos',                    'objectives',        'quality_objective',          'open',      'period',  'Miembro de la empresa.', '/quality/objectives', 3),
  ('indicator',          'Indicadores y mediciones',     'indicators',        'quality_indicator',          'open',      'as_of',   'Miembro de la empresa.', '/quality/indicators', 4),
  ('case',               'Casos y no conformidades',     'cases',             'work_case',                  'open',      'period',  'Miembro de la empresa.', '/quality/cases', 5),
  ('action',             'Acciones',                     'actions',           'work_action',                'open',      'period',  'Miembro de la empresa.', '/quality/cases', 6),
  ('risk',               'Riesgos y oportunidades',      'risks',             'quality_risk',               'open',      'as_of',   'Miembro de la empresa.', '/quality/risks', 7),
  ('control',            'Controles',                    'risks',             'quality_control',            'open',      'current', 'Miembro de la empresa.', '/quality/risks', 8),
  ('person_competence',  'Competencias de personas',     'people',            'quality_person',             'people',    'current', 'Rol que administra personas · y `allow_people` encendido.', '/quality/people', 9),
  ('knowledge_item',     'Conocimiento crítico',         'people',            'quality_knowledge_item',     'open',      'current', 'Miembro de la empresa.', '/quality/people/knowledge', 10),
  ('supplier',           'Proveedores y evaluaciones',   'suppliers',         'quality_supplier_scope',     'open',      'period',  'Miembro de la empresa.', '/quality/suppliers', 11),
  ('customer_metric',    'Métricas de voz del cliente',  'customer',          'quality_survey_campaign',    'anonymous', 'period',  'Rol que lee la voz del cliente.', '/quality/customer-voice', 12),
  ('customer_comment',   'Comentarios de clientes',      'customer',          'quality_survey_answer',      'anonymous', 'period',  'Rol que lee la voz del cliente · sin identidad, nunca.', '/quality/customer-voice', 13),
  ('customer_feedback',  'Quejas y retroalimentación',   'customer',          'quality_customer_feedback',  'restricted','period',  'Rol que lee la voz del cliente.', '/quality/customer-voice/feedback', 14),
  ('audit',              'Auditorías y hallazgos',       'audits',            'quality_audit',              'restricted','period',  'Rol que lee auditorías · las notas restringidas quedan fuera.', '/quality/audits', 15),
  ('management_review',  'Revisión por la dirección',    'management_review', 'quality_management_review',  'restricted','as_of',   'Rol que lee la revisión por la dirección.', '/quality/management-review', 16),
  ('signal',             'Señales de automatización',    'automation',        'quality_signal',             'open',      'current', 'Miembro de la empresa.', '/quality/automation/signals', 17),
  ('automation_rule',    'Reglas de automatización',     'automation',        'quality_automation_rule',    'open',      'current', 'Miembro de la empresa.', '/quality/automation/rules', 18),
  ('task',               'Tareas y avisos pendientes',   'work',              'work_task',                  'open',      'current', 'Miembro de la empresa · solo lo suyo y lo de su cargo.', '/quality/tasks', 19)
on conflict (code) do nothing;


-- ============================================================================
-- 3 · LA CONVERSACIÓN, LA EJECUCIÓN Y SUS REFERENCIAS (§27, §81)
-- ============================================================================

create table public.quality_ai_sessions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  actor_id        uuid not null references public.profiles (id),

  title           text,
  -- §49 · De dónde se abrió. Si fue desde el proveedor ACME, el contexto
  -- empieza en ACME y el usuario lo ve escrito.
  pinned_type     text,
  pinned_id       uuid,
  pinned_label    text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  closed_at       timestamptz,

  constraint quality_ai_sessions_org_id_uniq unique (organization_id, id),
  constraint quality_ai_sessions_pinned_check
    check ((pinned_type is null) = (pinned_id is null))
);

comment on table public.quality_ai_sessions is
  'QUALITY-12 · §81/§82 · Una conversación corta, para que la siguiente pregunta entienda la anterior. NO es memoria empresarial: lo que alguien quiera conservar lo registra en su dominio, a mano.';

create index quality_ai_sessions_org_idx
  on public.quality_ai_sessions (organization_id, actor_id, created_at desc);

create trigger t_quality_ai_sessions_updated
  before update on public.quality_ai_sessions
  for each row execute function public.set_updated_at();


create table public.quality_ai_runs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  session_id        uuid,
  actor_id          uuid not null references public.profiles (id),

  -- §27 · Para qué se pidió. No es decorativo: es lo que permite apagar un uso
  -- y lo que da sentido al informe de consumo.
  use_case          text not null,

  -- §7/§121/§122 · Con qué se produjo. Cambiar el modelo mañana NO reescribe
  -- esto: una respuesta histórica sabe con qué modelo se produjo.
  provider          text not null,
  model             text not null,
  prompt_template   text not null,
  prompt_version    integer not null,

  -- §21/§69 · Sobre qué momento se preguntó.
  temporal_mode     text not null default 'current',
  as_of             date,
  period_start      date,
  period_end        date,

  status            text not null default 'running',
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  latency_ms        integer,

  -- §76 · Lo que costó.
  input_tokens      integer,
  output_tokens     integer,
  context_items     integer not null default 0,
  tool_calls        integer not null default 0,

  -- §30 · Lo que se conserva, según lo que la empresa pidió conservar.
  question          text,
  answer            jsonb,
  -- §66/§67 · Cuánta evidencia había. NO es una confianza inventada: sale de
  -- contar lo que el constructor de contexto encontró.
  evidence_level    text,
  error_message     text,

  created_at        timestamptz not null default now(),

  constraint quality_ai_runs_org_id_uniq unique (organization_id, id),
  constraint quality_ai_runs_status_check
    check (status in ('running', 'succeeded', 'failed', 'refused', 'rate_limited')),
  constraint quality_ai_runs_temporal_check
    check (temporal_mode in ('current', 'period', 'as_of')),
  constraint quality_ai_runs_evidence_check
    check (evidence_level is null or evidence_level in ('sufficient', 'limited', 'missing')),
  constraint quality_ai_runs_session_fk
    foreign key (organization_id, session_id)
    references public.quality_ai_sessions (organization_id, id) on delete set null
);

comment on table public.quality_ai_runs is
  'QUALITY-12 · §27 · Qué se preguntó, con qué modelo, con qué versión de instrucciones y en qué acabó. Es lo que permite responder «¿por qué me dijo eso?» dentro de dos años.';
comment on column public.quality_ai_runs.evidence_level is
  '§66 · Cuánta evidencia autorizada había: suficiente, escasa o ninguna. Sale de contar el contexto, NO de una confianza que el modelo se invente.';

create index quality_ai_runs_org_idx
  on public.quality_ai_runs (organization_id, started_at desc);
create index quality_ai_runs_actor_idx
  on public.quality_ai_runs (organization_id, actor_id, started_at desc);
create index quality_ai_runs_session_idx
  on public.quality_ai_runs (organization_id, session_id, started_at);


-- §17/§18 · LAS REFERENCIAS. Una afirmación factual sin fuente no vale nada, y
-- una fuente que el modelo se invente vale menos todavía: por eso las escribe
-- el SERVIDOR desde el contexto que él mismo construyó, y el modelo solo puede
-- citarlas por su número.
create table public.quality_ai_run_references (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  run_id          uuid not null,

  ordinal         integer not null,
  source_code     text not null references public.quality_ai_sources (code),
  entity_type     text not null,
  entity_id       uuid,
  label           text not null,
  deep_link       text,
  -- §69/§74 · Sobre qué momento habla esta referencia.
  as_of           date,
  revision_label  text,

  created_at      timestamptz not null default now(),

  constraint quality_ai_run_references_uniq unique (organization_id, run_id, ordinal),
  constraint quality_ai_run_references_run_fk
    foreign key (organization_id, run_id)
    references public.quality_ai_runs (organization_id, id) on delete cascade
);

comment on table public.quality_ai_run_references is
  'QUALITY-12 · §18 · Las fuentes que el servidor puso en el contexto. El modelo cita por número: no puede inventarse una fuente porque no puede inventarse una fila de esta tabla.';

create index quality_ai_run_references_run_idx
  on public.quality_ai_run_references (organization_id, run_id, ordinal);


-- ============================================================================
-- 4 · LAS SUGERENCIAS (§43, §44, §102, §103, §104)
-- ============================================================================

create table public.quality_ai_suggestions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  run_id            uuid not null,

  kind              text not null,
  title             text not null,
  -- El contenido propuesto, en la forma que su tipo necesite. Es un BORRADOR.
  payload           jsonb not null default '{}'::jsonb,
  rationale         text,

  status            text not null default 'generated',

  reviewed_by       uuid references public.profiles (id),
  reviewed_at       timestamptz,
  decision_note     text,

  -- §104 · Si alguien la usó, con qué acabó. Lo escribe la persona al aceptar:
  -- esta tabla NO crea el objeto, solo recuerda cuál fue.
  resulting_type    text,
  resulting_id      uuid,

  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_ai_suggestions_org_id_uniq unique (organization_id, id),
  constraint quality_ai_suggestions_kind_check
    check (kind in ('action_draft', 'risk_candidate', 'root_cause_hypothesis',
                    'audit_focus', 'review_summary', 'customer_theme',
                    'document_improvement', 'question_list', 'analysis_note')),
  constraint quality_ai_suggestions_status_check
    check (status in ('generated', 'reviewed', 'accepted', 'rejected', 'expired')),
  -- §43 · Aceptada NO significa que la operación de negocio ocurriera. Pero sí
  -- exige que alguien la haya mirado y firmado.
  constraint quality_ai_suggestions_reviewed_consistent
    check ((status in ('accepted', 'rejected', 'reviewed')) = (reviewed_by is not null)),
  constraint quality_ai_suggestions_result_consistent
    check (resulting_id is null or status = 'accepted'),
  constraint quality_ai_suggestions_run_fk
    foreign key (organization_id, run_id)
    references public.quality_ai_runs (organization_id, id) on delete cascade
);

comment on table public.quality_ai_suggestions is
  'QUALITY-12 · §43 · Un BORRADOR. Aceptarla no crea nada: el objeto de negocio lo crea una persona con el comando de su dominio, y esta fila solo recuerda de dónde salió la idea.';

create index quality_ai_suggestions_org_idx
  on public.quality_ai_suggestions (organization_id, status, created_at desc);
create index quality_ai_suggestions_run_idx
  on public.quality_ai_suggestions (organization_id, run_id);

create trigger t_quality_ai_suggestions_updated
  before update on public.quality_ai_suggestions
  for each row execute function public.set_updated_at();


-- §117 · El feedback, para saber si esto sirve de algo. Sin reentrenamiento.
create table public.quality_ai_feedback (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  run_id          uuid not null,
  actor_id        uuid not null references public.profiles (id),

  useful          boolean not null,
  reason_code     text,
  note            text,
  created_at      timestamptz not null default now(),

  constraint quality_ai_feedback_uniq unique (organization_id, run_id, actor_id),
  constraint quality_ai_feedback_reason_check
    check (reason_code is null or reason_code in
           ('inexacto', 'sin_fuentes', 'incompleto', 'no_aplica', 'otro')),
  constraint quality_ai_feedback_run_fk
    foreign key (organization_id, run_id)
    references public.quality_ai_runs (organization_id, id) on delete cascade
);

comment on table public.quality_ai_feedback is
  'QUALITY-12 · §45/§117 · Si la respuesta sirvió. No entrena nada: los datos de una empresa no se usan para mejorar un modelo.';


-- ============================================================================
-- 5 · PERMISOS DEL DOMINIO (§14, §79, §80)
-- ----------------------------------------------------------------------------
-- §80 · Tener IA contratada NO da permiso a los datos. Hacen falta las tres
-- cosas: que la empresa la tenga encendida, que el usuario pertenezca, y que su
-- rol le deje ver lo que se va a mirar. La IA no eleva permisos jamás.
-- ============================================================================

create or replace function public.quality_ai_enabled(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.is_enabled from quality_ai_settings s
                    where s.organization_id = p_organization_id), false)
     and is_org_member(p_organization_id);
$$;
revoke all on function public.quality_ai_enabled(uuid) from public, anon;
grant execute on function public.quality_ai_enabled(uuid) to authenticated;

create or replace function public.quality_ai_feature_allowed(
  p_organization_id uuid, p_feature text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select quality_ai_enabled(p_organization_id) and case p_feature
    when 'people'   then coalesce((select allow_people   from quality_ai_settings
                                    where organization_id = p_organization_id), false)
    when 'customer' then coalesce((select allow_customer from quality_ai_settings
                                    where organization_id = p_organization_id), false)
    when 'drafts'   then coalesce((select allow_drafts   from quality_ai_settings
                                    where organization_id = p_organization_id), false)
    else true
  end;
$$;
revoke all on function public.quality_ai_feature_allowed(uuid, text) from public, anon;
grant execute on function public.quality_ai_feature_allowed(uuid, text) to authenticated;

-- Quién puede usar el Copilot: cualquier miembro. Quién puede configurarlo:
-- quien administra. Leer lo que OTROS preguntaron es otra cosa (§119).
create or replace function public.quality_ai_administers(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_org_role(p_organization_id, array['admin', 'quality']);
$$;
revoke all on function public.quality_ai_administers(uuid) from public, anon;
grant execute on function public.quality_ai_administers(uuid) to authenticated;


-- ============================================================================
-- 6 · LOS TOPES (§76, §89, §147, §149)
-- ----------------------------------------------------------------------------
-- Se comprueban en la MISMA transacción que abre la ejecución, y bajo un
-- candado por empresa: dos pestañas a la vez no pueden colarse las dos por el
-- hueco entre contar y crear.
-- ============================================================================

create or replace function public.quality_ai_usage(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg  record;
  v_mes  integer;
  v_dia  integer;
begin
  if not is_org_member(p_organization_id) then return null; end if;
  select * into v_cfg from quality_ai_settings where organization_id = p_organization_id;

  select count(*) into v_mes from quality_ai_runs
   where organization_id = p_organization_id
     and started_at >= date_trunc('month', now())
     and status <> 'rate_limited';

  select count(*) into v_dia from quality_ai_runs
   where organization_id = p_organization_id
     and actor_id = auth.uid()
     and started_at >= date_trunc('day', now())
     and status <> 'rate_limited';

  return jsonb_build_object(
    'enabled', coalesce(v_cfg.is_enabled, false),
    'allow_people', coalesce(v_cfg.allow_people, false),
    'allow_customer', coalesce(v_cfg.allow_customer, false),
    'allow_drafts', coalesce(v_cfg.allow_drafts, false),
    'monthly_run_limit', coalesce(v_cfg.monthly_run_limit, 0),
    'daily_user_limit', coalesce(v_cfg.daily_user_limit, 0),
    'runs_this_month', v_mes,
    'runs_today_by_me', v_dia,
    'input_tokens_this_month', coalesce((
      select sum(input_tokens) from quality_ai_runs
       where organization_id = p_organization_id
         and started_at >= date_trunc('month', now())), 0),
    'output_tokens_this_month', coalesce((
      select sum(output_tokens) from quality_ai_runs
       where organization_id = p_organization_id
         and started_at >= date_trunc('month', now())), 0),
    'failures_this_month', (
      select count(*) from quality_ai_runs
       where organization_id = p_organization_id
         and started_at >= date_trunc('month', now())
         and status = 'failed'),
    'note', 'El consumo se cuenta por ejecución, no por pregunta escrita: una '
            || 'ejecución rechazada por el tope no consume proveedor.');
end;
$$;
revoke all on function public.quality_ai_usage(uuid) from public, anon;
grant execute on function public.quality_ai_usage(uuid) to authenticated;


-- ============================================================================
-- 7 · ABRIR UNA EJECUCIÓN (§27, §89)
-- ----------------------------------------------------------------------------
-- Es la única puerta por la que nace una ejecución de IA, y comprueba, EN ESTE
-- ORDEN: sesión, pertenencia, que la empresa tenga la IA encendida, que el uso
-- concreto esté permitido, y los topes. Si algo falla, no se llama al proveedor.
-- ============================================================================

create or replace function public.quality_ai_start_run(
  p_organization_id uuid,
  p_use_case        text,
  p_feature         text,
  p_provider        text,
  p_model           text,
  p_prompt_template text,
  p_prompt_version  integer,
  p_session_id      uuid default null,
  p_question        text default null,
  p_temporal_mode   text default 'current',
  p_as_of           date default null,
  p_period_start    date default null,
  p_period_end      date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg   record;
  v_mes   integer;
  v_dia   integer;
  v_run   uuid;
  v_texto text;
begin
  if auth.uid() is null then
    raise exception 'La IA de Trazaloop exige una sesión.';
  end if;
  if not is_org_member(p_organization_id) then
    raise exception 'No perteneces a esta empresa.';
  end if;
  if p_temporal_mode not in ('current', 'period', 'as_of') then
    raise exception 'Modo temporal no reconocido.';
  end if;

  -- §149 · El candado por empresa: los topes se cuentan y se consumen bajo él.
  perform pg_advisory_xact_lock(hashtext('quality_ai:' || p_organization_id::text));

  select * into v_cfg from quality_ai_settings where organization_id = p_organization_id;
  if not coalesce(v_cfg.is_enabled, false) then
    return jsonb_build_object('allowed', false, 'reason', 'disabled',
      'message', 'Esta empresa no tiene el Copilot encendido.');
  end if;
  if not quality_ai_feature_allowed(p_organization_id, p_feature) then
    return jsonb_build_object('allowed', false, 'reason', 'feature_disabled',
      'message', 'Este uso del Copilot está apagado para esta empresa.');
  end if;

  select count(*) into v_mes from quality_ai_runs
   where organization_id = p_organization_id
     and started_at >= date_trunc('month', now()) and status <> 'rate_limited';
  if v_mes >= v_cfg.monthly_run_limit then
    insert into quality_ai_runs
      (organization_id, session_id, actor_id, use_case, provider, model,
       prompt_template, prompt_version, status, completed_at, error_message)
    values (p_organization_id, p_session_id, auth.uid(), p_use_case, p_provider,
            p_model, p_prompt_template, p_prompt_version, 'rate_limited', now(),
            'Se alcanzó el tope mensual de la empresa.');
    return jsonb_build_object('allowed', false, 'reason', 'monthly_limit',
      'message', 'Esta empresa alcanzó su tope de consultas del mes.');
  end if;

  select count(*) into v_dia from quality_ai_runs
   where organization_id = p_organization_id and actor_id = auth.uid()
     and started_at >= date_trunc('day', now()) and status <> 'rate_limited';
  if v_dia >= v_cfg.daily_user_limit then
    insert into quality_ai_runs
      (organization_id, session_id, actor_id, use_case, provider, model,
       prompt_template, prompt_version, status, completed_at, error_message)
    values (p_organization_id, p_session_id, auth.uid(), p_use_case, p_provider,
            p_model, p_prompt_template, p_prompt_version, 'rate_limited', now(),
            'Se alcanzó el tope diario de esta persona.');
    return jsonb_build_object('allowed', false, 'reason', 'daily_limit',
      'message', 'Has alcanzado tu tope de consultas de hoy.');
  end if;

  -- §30 · La pregunta solo se guarda si la empresa quiere guardarla.
  v_texto := case when coalesce(v_cfg.retain_question, true) then p_question else null end;

  insert into quality_ai_runs
    (organization_id, session_id, actor_id, use_case, provider, model,
     prompt_template, prompt_version, temporal_mode, as_of, period_start, period_end,
     question, status)
  values (p_organization_id, p_session_id, auth.uid(), p_use_case, p_provider,
          p_model, p_prompt_template, p_prompt_version, p_temporal_mode, p_as_of,
          p_period_start, p_period_end, v_texto, 'running')
  returning id into v_run;

  return jsonb_build_object('allowed', true, 'run_id', v_run);
end;
$$;
revoke all on function public.quality_ai_start_run(
  uuid, text, text, text, text, text, integer, uuid, text, text, date, date, date)
  from public, anon;
grant execute on function public.quality_ai_start_run(
  uuid, text, text, text, text, text, integer, uuid, text, text, date, date, date)
  to authenticated;


-- ============================================================================
-- 8 · CERRAR LA EJECUCIÓN, CITAR Y PROPONER
-- ============================================================================

-- §18/§92 · Las referencias las escribe el SERVIDOR desde el contexto que
-- construyó. El modelo no puede llamar a esto: solo cita por número.
create or replace function public.quality_ai_add_reference(
  p_run_id        uuid,
  p_ordinal       integer,
  p_source_code   text,
  p_entity_type   text,
  p_entity_id     uuid,
  p_label         text,
  p_deep_link     text default null,
  p_as_of         date default null,
  p_revision      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_run record; v_id uuid;
begin
  select * into v_run from quality_ai_runs where id = p_run_id;
  if v_run.id is null then raise exception 'Esa consulta no existe.'; end if;
  if v_run.actor_id <> auth.uid() and auth.uid() is not null then
    raise exception 'No puedes escribir en la consulta de otra persona.';
  end if;
  if not exists (select 1 from quality_ai_sources where code = p_source_code) then
    raise exception 'Esa fuente no está en el catálogo del Copilot.';
  end if;

  insert into quality_ai_run_references
    (organization_id, run_id, ordinal, source_code, entity_type, entity_id,
     label, deep_link, as_of, revision_label)
  values (v_run.organization_id, p_run_id, p_ordinal, p_source_code, p_entity_type,
          p_entity_id, p_label, p_deep_link, p_as_of, p_revision)
  on conflict (organization_id, run_id, ordinal) do update
    set label = excluded.label, deep_link = excluded.deep_link
  returning id into v_id;

  update quality_ai_runs
     set context_items = (select count(*) from quality_ai_run_references
                           where run_id = p_run_id)
   where id = p_run_id;
  return v_id;
end;
$$;
revoke all on function public.quality_ai_add_reference(
  uuid, integer, text, text, uuid, text, text, date, text) from public, anon;
grant execute on function public.quality_ai_add_reference(
  uuid, integer, text, text, uuid, text, text, date, text) to authenticated;


create or replace function public.quality_ai_complete_run(
  p_run_id         uuid,
  p_answer         jsonb,
  p_evidence_level text,
  p_input_tokens   integer default null,
  p_output_tokens  integer default null,
  p_tool_calls     integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_run record; v_cfg record;
begin
  select * into v_run from quality_ai_runs where id = p_run_id;
  if v_run.id is null then raise exception 'Esa consulta no existe.'; end if;
  if v_run.actor_id <> auth.uid() and auth.uid() is not null then
    raise exception 'No puedes cerrar la consulta de otra persona.';
  end if;
  if v_run.status <> 'running' then
    raise exception 'Esa consulta ya está cerrada.';
  end if;
  select * into v_cfg from quality_ai_settings where organization_id = v_run.organization_id;

  update quality_ai_runs
     set status = 'succeeded',
         completed_at = clock_timestamp(),
         latency_ms = extract(milliseconds from clock_timestamp() - started_at)::integer,
         -- §30 · La respuesta se guarda solo si la empresa quiere guardarla.
         answer = case when coalesce(v_cfg.retain_answer, true) then p_answer else null end,
         evidence_level = p_evidence_level,
         input_tokens = p_input_tokens,
         output_tokens = p_output_tokens,
         tool_calls = coalesce(p_tool_calls, 0)
   where id = p_run_id;
end;
$$;
revoke all on function public.quality_ai_complete_run(uuid, jsonb, text, integer, integer, integer)
  from public, anon;
grant execute on function public.quality_ai_complete_run(uuid, jsonb, text, integer, integer, integer)
  to authenticated;


create or replace function public.quality_ai_fail_run(
  p_run_id uuid, p_status text, p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_run record;
begin
  select * into v_run from quality_ai_runs where id = p_run_id;
  if v_run.id is null then raise exception 'Esa consulta no existe.'; end if;
  if v_run.actor_id <> auth.uid() and auth.uid() is not null then
    raise exception 'No puedes cerrar la consulta de otra persona.';
  end if;
  if p_status not in ('failed', 'refused') then
    raise exception 'Estado de cierre no reconocido.';
  end if;

  update quality_ai_runs
     set status = p_status,
         completed_at = clock_timestamp(),
         latency_ms = extract(milliseconds from clock_timestamp() - started_at)::integer,
         -- §85 · El mensaje del proveedor puede traer detalles que no hacen
         -- falta guardar. Se guarda lo que le sirve a quien lo lea.
         error_message = left(coalesce(p_error, 'Error del proveedor.'), 500)
   where id = p_run_id and status = 'running';
end;
$$;
revoke all on function public.quality_ai_fail_run(uuid, text, text) from public, anon;
grant execute on function public.quality_ai_fail_run(uuid, text, text) to authenticated;


-- §102 · Guardar un borrador crea UNA sugerencia. Nunca un objeto de negocio.
create or replace function public.quality_ai_create_suggestion(
  p_run_id    uuid,
  p_kind      text,
  p_title     text,
  p_payload   jsonb,
  p_rationale text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_run record; v_id uuid;
begin
  select * into v_run from quality_ai_runs where id = p_run_id;
  if v_run.id is null then raise exception 'Esa consulta no existe.'; end if;
  if not quality_ai_feature_allowed(v_run.organization_id, 'drafts') then
    raise exception 'Esta empresa tiene apagados los borradores del Copilot.';
  end if;
  if v_run.actor_id <> auth.uid() and auth.uid() is not null then
    raise exception 'No puedes añadir borradores a la consulta de otra persona.';
  end if;

  insert into quality_ai_suggestions
    (organization_id, run_id, kind, title, payload, rationale, status,
     expires_at)
  values (v_run.organization_id, p_run_id, p_kind, p_title,
          coalesce(p_payload, '{}'::jsonb), p_rationale, 'generated',
          now() + interval '90 days')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.quality_ai_create_suggestion(uuid, text, text, jsonb, text)
  from public, anon;
grant execute on function public.quality_ai_create_suggestion(uuid, text, text, jsonb, text)
  to authenticated;


-- §44/§104 · Aceptar es un acto de una PERSONA, y no crea nada. Si esa persona
-- después usa el borrador para abrir una acción, es ella quien la abre con el
-- comando de QUALITY-04, y aquí solo queda anotado cuál fue.
create or replace function public.quality_ai_accept_suggestion(
  p_suggestion_id uuid,
  p_note          text default null,
  p_resulting_type text default null,
  p_resulting_id   uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_s record;
begin
  select * into v_s from quality_ai_suggestions where id = p_suggestion_id;
  if v_s.id is null then raise exception 'Ese borrador no existe.'; end if;
  if not is_org_member(v_s.organization_id) then
    raise exception 'No perteneces a esta empresa.';
  end if;
  if v_s.status in ('accepted', 'rejected') then
    raise exception 'Ese borrador ya se resolvió.';
  end if;

  update quality_ai_suggestions
     set status = 'accepted', reviewed_by = auth.uid(), reviewed_at = now(),
         decision_note = p_note,
         resulting_type = p_resulting_type, resulting_id = p_resulting_id
   where id = p_suggestion_id;
end;
$$;
revoke all on function public.quality_ai_accept_suggestion(uuid, text, text, uuid)
  from public, anon;
grant execute on function public.quality_ai_accept_suggestion(uuid, text, text, uuid)
  to authenticated;


create or replace function public.quality_ai_reject_suggestion(
  p_suggestion_id uuid, p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_s record;
begin
  select * into v_s from quality_ai_suggestions where id = p_suggestion_id;
  if v_s.id is null then raise exception 'Ese borrador no existe.'; end if;
  if not is_org_member(v_s.organization_id) then
    raise exception 'No perteneces a esta empresa.';
  end if;

  update quality_ai_suggestions
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
         decision_note = p_reason
   where id = p_suggestion_id;
end;
$$;
revoke all on function public.quality_ai_reject_suggestion(uuid, text) from public, anon;
grant execute on function public.quality_ai_reject_suggestion(uuid, text) to authenticated;


create or replace function public.quality_ai_record_feedback(
  p_run_id uuid, p_useful boolean, p_reason text default null, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_run record;
begin
  select * into v_run from quality_ai_runs where id = p_run_id;
  if v_run.id is null then raise exception 'Esa consulta no existe.'; end if;
  if not is_org_member(v_run.organization_id) then
    raise exception 'No perteneces a esta empresa.';
  end if;

  insert into quality_ai_feedback
    (organization_id, run_id, actor_id, useful, reason_code, note)
  values (v_run.organization_id, p_run_id, auth.uid(), p_useful, p_reason, p_note)
  on conflict (organization_id, run_id, actor_id) do update
    set useful = excluded.useful, reason_code = excluded.reason_code,
        note = excluded.note;
end;
$$;
revoke all on function public.quality_ai_record_feedback(uuid, boolean, text, text)
  from public, anon;
grant execute on function public.quality_ai_record_feedback(uuid, boolean, text, text)
  to authenticated;


-- ============================================================================
-- 9 · LAS VISTAS (§115, §118)
-- ============================================================================

create or replace view public.v_quality_ai_run_overview
with (security_invoker = true) as
select
  r.organization_id,
  r.id                as run_id,
  r.session_id,
  r.actor_id,
  p.full_name         as actor_name,
  r.use_case,
  r.provider, r.model, r.prompt_template, r.prompt_version,
  r.temporal_mode, r.as_of, r.period_start, r.period_end,
  r.status, r.started_at, r.completed_at, r.latency_ms,
  r.input_tokens, r.output_tokens, r.context_items, r.tool_calls,
  r.evidence_level, r.error_message,
  -- §119 · El CONTENIDO solo para quien lo preguntó. Que un administrador vea
  -- el consumo no le da derecho a leer lo que preguntó otra persona: dentro de
  -- una pregunta puede haber tanto dato restringido como en la respuesta.
  case when r.actor_id = auth.uid() then r.question end as question,
  case when r.actor_id = auth.uid() then r.answer   end as answer,
  (r.actor_id = auth.uid())                             as is_mine,
  coalesce(s.total, 0)  as suggestion_count,
  coalesce(s.accepted, 0) as accepted_count,
  f.useful               as feedback_useful
from public.quality_ai_runs r
left join public.profiles p on p.id = r.actor_id
left join lateral (
  select count(*) as total,
         count(*) filter (where x.status = 'accepted') as accepted
    from public.quality_ai_suggestions x
   where x.organization_id = r.organization_id and x.run_id = r.id) s on true
left join public.quality_ai_feedback f
  on f.organization_id = r.organization_id and f.run_id = r.id and f.actor_id = auth.uid();

revoke all on public.v_quality_ai_run_overview from anon, authenticated;
grant select on public.v_quality_ai_run_overview to authenticated;

comment on view public.v_quality_ai_run_overview is
  'QUALITY-12 · §118/§119 · El consumo y el resultado de cada consulta. La pregunta y la respuesta solo se ven si son tuyas: metadatos y contenido son permisos distintos.';


create or replace view public.v_quality_ai_suggestion_overview
with (security_invoker = true) as
select
  s.organization_id,
  s.id                as suggestion_id,
  s.run_id,
  s.kind, s.title, s.payload, s.rationale, s.status,
  s.reviewed_by, rev.full_name as reviewed_by_name, s.reviewed_at, s.decision_note,
  s.resulting_type, s.resulting_id,
  s.expires_at, s.created_at,
  r.actor_id          as requested_by,
  req.full_name       as requested_by_name,
  r.use_case, r.provider, r.model, r.prompt_template, r.prompt_version,
  r.started_at        as run_started_at,
  coalesce(ref.total, 0) as reference_count
from public.quality_ai_suggestions s
join public.quality_ai_runs r
  on r.organization_id = s.organization_id and r.id = s.run_id
left join public.profiles req on req.id = r.actor_id
left join public.profiles rev on rev.id = s.reviewed_by
left join lateral (
  select count(*) as total from public.quality_ai_run_references x
   where x.organization_id = s.organization_id and x.run_id = s.run_id) ref on true;

revoke all on public.v_quality_ai_suggestion_overview from anon, authenticated;
grant select on public.v_quality_ai_suggestion_overview to authenticated;


-- ============================================================================
-- 10 · RLS Y PRIVILEGIOS (§13, §150, §151)
-- ----------------------------------------------------------------------------
-- Nada de lo que hay aquí se escribe a mano desde una sesión: todo pasa por las
-- RPC de arriba, que comprueban empresa, permiso, uso permitido y topes. Lo
-- único que las sesiones hacen directamente es LEER lo suyo.
-- ============================================================================

alter table public.quality_ai_settings       enable row level security;
alter table public.quality_ai_sessions       enable row level security;
alter table public.quality_ai_runs           enable row level security;
alter table public.quality_ai_run_references enable row level security;
alter table public.quality_ai_suggestions    enable row level security;
alter table public.quality_ai_feedback       enable row level security;

-- Configuración: la lee cualquier miembro —para saber si el Copilot está
-- encendido—, la escribe quien administra.
create policy quality_ai_settings_select on public.quality_ai_settings
  for select to authenticated using (is_org_member(organization_id));
create policy quality_ai_settings_write on public.quality_ai_settings
  for all to authenticated
  using (quality_ai_administers(organization_id))
  with check (quality_ai_administers(organization_id));

-- Conversaciones: cada uno las suyas. Ni siquiera quien administra lee las de
-- otro: dentro de una conversación hay datos de negocio, no telemetría.
create policy quality_ai_sessions_select on public.quality_ai_sessions
  for select to authenticated
  using (is_org_member(organization_id) and actor_id = auth.uid());
create policy quality_ai_sessions_write on public.quality_ai_sessions
  for all to authenticated
  using (is_org_member(organization_id) and actor_id = auth.uid())
  with check (is_org_member(organization_id) and actor_id = auth.uid());

-- §118/§119 · Ejecuciones: los METADATOS los ve quien administra —para el
-- consumo— y cada uno los suyos. El contenido lo recorta la vista.
create policy quality_ai_runs_select on public.quality_ai_runs
  for select to authenticated
  using (is_org_member(organization_id)
         and (actor_id = auth.uid() or quality_ai_administers(organization_id)));

create policy quality_ai_run_references_select on public.quality_ai_run_references
  for select to authenticated
  using (exists (select 1 from public.quality_ai_runs r
                  where r.organization_id = quality_ai_run_references.organization_id
                    and r.id = quality_ai_run_references.run_id
                    and (r.actor_id = auth.uid()
                         or quality_ai_administers(r.organization_id))));

-- Borradores: los ve cualquier miembro de la empresa —son trabajo compartido—
-- y los resuelve por RPC, no a mano.
create policy quality_ai_suggestions_select on public.quality_ai_suggestions
  for select to authenticated using (is_org_member(organization_id));

create policy quality_ai_feedback_select on public.quality_ai_feedback
  for select to authenticated
  using (is_org_member(organization_id)
         and (actor_id = auth.uid() or quality_ai_administers(organization_id)));

revoke all on table public.quality_ai_settings       from anon, authenticated;
revoke all on table public.quality_ai_sessions       from anon, authenticated;
revoke all on table public.quality_ai_runs           from anon, authenticated;
revoke all on table public.quality_ai_run_references from anon, authenticated;
revoke all on table public.quality_ai_suggestions    from anon, authenticated;
revoke all on table public.quality_ai_feedback       from anon, authenticated;

grant select, insert, update on table public.quality_ai_settings to authenticated;
grant select, insert, update on table public.quality_ai_sessions to authenticated;
-- Las ejecuciones, sus referencias, los borradores y el feedback: SOLO LECTURA.
-- Los escriben las RPC, que son las que saben qué está permitido.
grant select on table public.quality_ai_runs           to authenticated;
grant select on table public.quality_ai_run_references to authenticated;
grant select on table public.quality_ai_suggestions    to authenticated;
grant select on table public.quality_ai_feedback       to authenticated;

-- §120 · La historia de la IA no se borra ni se reescribe desde una sesión:
-- es lo que permite responder «¿por qué me dijo eso?» dentro de dos años.
create or replace function public.quality_ai_history_is_immutable()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  raise exception 'La historia del Copilot no se borra: es la explicación de qué se preguntó, con qué contexto y con qué modelo se respondió.';
end;
$$;

create trigger t_quality_ai_runs_no_delete
  before delete on public.quality_ai_runs
  for each row execute function public.quality_ai_history_is_immutable();
create trigger t_quality_ai_suggestions_no_delete
  before delete on public.quality_ai_suggestions
  for each row execute function public.quality_ai_history_is_immutable();


-- ============================================================================
-- 11 · EL CATÁLOGO TRANSVERSAL, AMPLIADO SIN ESTRECHAR NADA (§124)
-- ----------------------------------------------------------------------------
-- Dos hechos nuevos. La IA los EMITE cuando ocurre algo digno de recordarse,
-- pero —§125— ninguna regla de QUALITY-11 los escucha: el puente de eventos
-- ignora `source_domain = 'automation'`… y estos van en su propio dominio,
-- `ai`, que tampoco está en el catálogo de hechos observables. La separación
-- entre IA y automatización determinística se mantiene por construcción.
-- ============================================================================

do $$
declare v_tipos text[];
begin
  select array_agg(distinct t order by t) into v_tipos
    from (
      select unnest(array['ai.run_completed', 'ai.suggestion_accepted']) as t
      union
      select (regexp_matches(
                (select pg_get_constraintdef(oid) from pg_constraint
                  where conname = 'work_events_type_check'),
                '''([a-z_]+\.[a-z_]+)''', 'g'))[1] as t
    ) x;

  if array_length(v_tipos, 1) < 88 then
    raise exception 'El catálogo de eventos se estaría estrechando: % tipos.',
      array_length(v_tipos, 1);
  end if;

  execute 'alter table public.work_events drop constraint if exists work_events_type_check';
  execute 'alter table public.work_events add constraint work_events_type_check check (event_type in ('
    || (select string_agg(quote_literal(t), ', ' order by t) from unnest(v_tipos) t) || '))';
end
$$;

do $$
declare v_dom text[];
begin
  select array_agg(distinct d order by d) into v_dom
    from (
      select unnest(array['ai']) as d
      union
      select (regexp_matches(
                (select pg_get_constraintdef(oid) from pg_constraint
                  where conname = 'work_events_source_domain_check'),
                '''([a-z_]+)''', 'g'))[1] as d
    ) x;
  if v_dom is not null then
    if array_length(v_dom, 1) < 21 then
      raise exception 'El catálogo de dominios se estaría estrechando: % dominios.',
        array_length(v_dom, 1);
    end if;
    execute 'alter table public.work_events drop constraint if exists work_events_source_domain_check';
    execute 'alter table public.work_events add constraint work_events_source_domain_check check (source_domain in ('
      || (select string_agg(quote_literal(d), ', ' order by d) from unnest(v_dom) d) || '))';
  end if;
end
$$;


-- ============================================================================
-- 12 · LA PROYECCIÓN ANÓNIMA DE COMENTARIOS (§32, §33, §95)
-- ----------------------------------------------------------------------------
-- El Copilot puede leer lo que los clientes escribieron. Lo que NO puede es
-- llegar desde un comentario a quien lo escribió, y esa garantía no se deja en
-- manos de que un adaptador «se acuerde» de no pedir la columna: se pone aquí,
-- en la forma de la vista.
--
-- Lo que esta vista expone: el texto, la pregunta que lo provocó y la campaña.
-- Lo que NO expone, y por eso no se puede filtrar: el identificador de la
-- respuesta, la invitación, el contacto, el cliente, el nombre, el correo, ni
-- el instante de envío —que en una campaña pequeña es un rastro tan bueno como
-- un nombre—.
-- ============================================================================

create or replace view public.v_quality_campaign_comments
with (security_invoker = true) as
select
  a.organization_id,
  c.id                as campaign_id,
  c.name              as campaign_name,
  c.anonymity_mode,
  q.label             as question_label,
  a.value_text        as comment_text
from public.quality_survey_answers a
join public.quality_survey_responses r
  on r.organization_id = a.organization_id and r.id = a.response_id
join public.quality_survey_campaigns c
  on c.organization_id = r.organization_id and c.id = r.campaign_id
join public.quality_survey_questions q
  on q.organization_id = a.organization_id and q.id = a.question_id
where a.outcome = 'answered'
  and a.value_text is not null
  and length(btrim(a.value_text)) > 0;

revoke all on public.v_quality_campaign_comments from anon, authenticated;
grant select on public.v_quality_campaign_comments to authenticated;

comment on view public.v_quality_campaign_comments is
  'QUALITY-12 · §32 · Los comentarios de clientes SIN una sola columna que permita volver a quien los escribió. La anonimidad no se confía al que consulta: está en la forma de la vista.';
