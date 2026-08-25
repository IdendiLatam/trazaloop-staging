-- ============================================================================
-- 0121 · QUALITY-04 · Motor TRANSVERSAL de casos y acciones (AC-01…AC-35)
-- ============================================================================
--
-- LO QUE ESTE ARCHIVO NO ES
--
-- No es un CRUD de No Conformidades. Las decisiones AC-01…AC-35 están
-- congeladas y describen otra cosa: un CONTENEDOR de gestión común con
-- especializaciones semánticas (AC-02) y UN SOLO motor de acciones (AC-01) que
-- después reutilizarán Auditorías, Voz del Cliente, Proveedores, Riesgos y la
-- Revisión por la Dirección.
--
-- Por eso el prefijo es `work_`, como work_tasks/work_alerts/work_events de
-- 0116, y no `quality_`. Quality-04 construye la primera experiencia sobre el
-- motor; el motor no es de Quality.
--
-- ============================================================================
-- LAS SEPARACIONES QUE SOSTIENEN TODO
-- ============================================================================
--
--   CASO ≠ HALLAZGO ≠ NO CONFORMIDAD ≠ CORRECCIÓN ≠ ACCIÓN CORRECTIVA
--        ≠ ACCIÓN DE MEJORA ≠ TAREA
--
-- · Un CASO es el contenedor: qué pasó, quién responde, en qué anda.
-- · Un HALLAZGO es un hecho observado que pide evaluación (AC-03).
-- · La NO CONFORMIDAD es una DECISIÓN humana, no un estado derivado (AC-04).
-- · CONTENCIÓN, CORRECCIÓN y ACCIÓN CORRECTIVA son tres cosas (AC-05, AC-06):
--   detener el daño, arreglar lo que se rompió, e impedir que se repita.
-- · Una ACCIÓN es un compromiso de gestión con responsable, fecha y resultado
--   esperado. Una TAREA es la unidad operativa que ayuda a ejecutarla. Una
--   acción PRODUCE tareas; no se guarda como una.
--
-- Y la que más se incumple en los sistemas de calidad reales:
--
--   COMPLETADA ≠ CERRADA ≠ EFICAZ   (AC-13)
--
-- Una acción puede estar completada y no haberse verificado; puede estar
-- completada y verificada como NO EFICAZ. «closed = success» es la mentira que
-- hace que los planes de acción no sirvan para nada.
--
-- ============================================================================
-- POR QUÉ UNA SEÑAL NO ES UN CASO (AC-04)
-- ============================================================================
--
-- QUALITY-03 ya emite eventos, alertas y tareas cuando un indicador queda
-- fuera de meta. Nada de eso se convierte en caso solo: alguien con autoridad
-- decide crear el caso desde la señal, y el caso REFERENCIA la señal en vez de
-- copiarla. Un indicador por debajo de la meta puede ser una variación
-- puntual, un cambio de método o un error de captura; llamarlo automáticamente
-- «no conformidad» sustituye el juicio de una persona por una comparación
-- aritmética, y devalúa las no conformidades de verdad.
--
-- ============================================================================
-- REFERENCIAS TIPADAS, NI JSON OPACO NI POLIMORFISMO CIEGO
-- ============================================================================
--
-- Un caso puede apuntar a un indicador, a una medición, a un documento, a una
-- revisión documental, a un proceso o a una entrada/salida — y mañana a una
-- auditoría o a un lote de PCR. Las dos salidas fáciles son malas:
--
--   · un `jsonb` con {tipo, id} no valida nada y no se puede consultar;
--   · quince columnas FK nulas ensucian la tabla y no escalan.
--
-- `work_references` usa un catálogo CERRADO de tipos y un disparador que
-- comprueba, para cada tipo, que la fila EXISTE y que pertenece a la MISMA
-- empresa. Es tan estricto como una FK y sirve para todos los tipos.
--
-- ROLLBACK: docs/quality/quality-04/QUALITY_04_ROLLBACK.md
-- ============================================================================


-- ----------------------------------------------------------------------------
-- §1 · work_cases — EL CONTENEDOR (AC-02)
-- ----------------------------------------------------------------------------
create table public.work_cases (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,

  -- Identidad legible y estable. La numeración es por empresa y por año.
  code                 text not null,
  title                text not null,
  description          text,

  -- ESPECIALIZACIÓN semántica (AC-02). El contenedor es común; lo que el caso
  -- SIGNIFICA no se difumina.
  case_type            text not null default 'issue'
                       check (case_type in ('issue','audit_finding','complaint',
                                            'supplier_incident','nonconforming_output',
                                            'deviation','improvement')),

  detected_on          date not null default current_date,

  -- De dónde viene. Extensible: los orígenes que este sprint no implementa ya
  -- están en el catálogo para que el modelo no tenga que migrar después.
  origin_kind          text not null default 'manual'
                       check (origin_kind in ('manual','indicator','document','process',
                                              'audit','customer','supplier','risk',
                                              'management_review','other')),
  origin_note          text,

  reported_by          uuid references public.profiles(id) on delete set null,

  -- La responsabilidad apunta a un CARGO (MDR-33): cuando alguien cambia de
  -- puesto, el caso conserva su dueño.
  owner_position_id    uuid,
  owner_profile_id     uuid references public.profiles(id) on delete set null,

  -- CLASIFICACIÓN FORMAL. `pending` hasta que alguien evalúe: no hay valor por
  -- defecto que adelante la decisión (AC-04).
  classification       text not null default 'pending'
                       check (classification in ('pending','nonconformity','observation',
                                                 'improvement_opportunity','not_applicable')),

  priority             text not null default 'normal'
                       check (priority in ('low','normal','high','critical')),

  -- ESTADO DE FLUJO. Es administrativo: no dice si hay no conformidad.
  status               text not null default 'draft'
                       check (status in ('draft','open','in_analysis','in_action',
                                         'pending_effectiveness','closed')),

  -- La declaración estructurada de la NC (§15 del encargo): tres campos, no un
  -- textarea gigante. Separar requisito, evidencia e incumplimiento es lo que
  -- distingue una NC redactable de una queja.
  requirement_text     text,
  evidence_text        text,
  nonconformity_text   text,

  -- Cierre y reapertura (AC-19): reabrir NO borra el cierre anterior.
  closed_at            timestamptz,
  closed_by            uuid references public.profiles(id) on delete set null,
  closure_note         text,
  reopened_at          timestamptz,
  reopen_count         integer not null default 0,

  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint work_cases_org_code_uniq unique (organization_id, code),
  constraint work_cases_org_id_uniq unique (organization_id, id),
  constraint work_cases_owner_position_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete restrict,
  constraint work_cases_closed_consistent
    check ((status = 'closed') = (closed_at is not null)),
  -- Una NC formalizada necesita su declaración estructurada. Sin requisito no
  -- hay incumplimiento que declarar.
  constraint work_cases_nc_statement
    check (classification <> 'nonconformity'
           or (nullif(btrim(coalesce(requirement_text,'')),'') is not null
               and nullif(btrim(coalesce(nonconformity_text,'')),'') is not null))
);

comment on table public.work_cases is
  'QUALITY-04 · CONTENEDOR transversal de gestion (AC-02). No es una tabla de No Conformidades: la NC es una CLASIFICACION que alguien DECIDE (AC-04), y la decision vive en work_decisions. Reutilizable por Auditorias, Voz del Cliente, Proveedores y Riesgos.';

create index work_cases_org_status_idx on public.work_cases (organization_id, status);
create index work_cases_org_class_idx  on public.work_cases (organization_id, classification);
create index work_cases_owner_idx      on public.work_cases (organization_id, owner_position_id);


-- §1.2 · Numeracion legible, por empresa y por anio. C-2026-001.
--
-- El codigo se reserva al crear y NO se recicla: un caso eliminado en borrador
-- deja su numero ocupado. Es la misma leccion de D-04 aplicada aqui, y no una
-- generalizacion automatica: un numero de caso aparece en actas y correos, y
-- que designe dos cosas distintas en momentos distintos es exactamente el
-- problema que D-04 describe.
create table public.work_case_codes (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code            text not null,
  case_id         uuid,
  released_at     timestamptz,
  created_at      timestamptz not null default now(),
  primary key (organization_id, code),
  constraint work_case_codes_released_consistent
    check ((case_id is null) = (released_at is not null))
);
comment on table public.work_case_codes is
  'QUALITY-04 · Reserva de numeros de caso. Un numero asignado queda ocupado para siempre dentro de la empresa, aunque el borrador se elimine: aparece en actas y correos y no puede designar dos cosas.';


-- ----------------------------------------------------------------------------
-- §2 · work_references — REFERENCIAS TIPADAS Y VALIDADAS
--
-- Sirve para casos Y para acciones (AC-12: una accion puede tener VARIOS
-- objetos de origen). El disparador de §2.2 comprueba existencia y empresa.
-- ----------------------------------------------------------------------------
create table public.work_references (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,

  owner_kind       text not null check (owner_kind in ('case','action')),
  owner_id         uuid not null,

  ref_kind         text not null
                   check (ref_kind in ('quality_indicator','quality_measurement',
                                       'quality_process','quality_process_revision',
                                       'quality_process_io','trazadoc_document',
                                       'trazadoc_document_revision','work_case','work_action')),
  ref_id           uuid not null,

  -- Para qué se referencia: de aquí NACIÓ el caso, o solo lo respalda.
  relation         text not null default 'related'
                   check (relation in ('origin','evidence','related')),
  note             text,

  -- CONTEXTO CONGELADO, no una segunda fuente de verdad (§58/§59). Guarda lo
  -- que la referencia MOSTRABA cuando se tomó la decisión, para que cambiar la
  -- meta el mes que viene no reescriba el porqué de una NC de agosto. La UI
  -- distingue siempre «referencia» de «contexto de aquel momento».
  snapshot         jsonb,

  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint work_references_uniq unique (owner_kind, owner_id, ref_kind, ref_id, relation)
);

comment on table public.work_references is
  'QUALITY-04 · Referencias TIPADAS de un caso o una accion hacia el resto de la plataforma. Catalogo CERRADO de tipos + disparador que valida existencia y empresa: tan estricto como una FK, y sirve para todos los tipos. El snapshot congela el contexto de la decision (§59), nunca sustituye a la fuente.';

create index work_references_owner_idx on public.work_references (owner_kind, owner_id);
create index work_references_ref_idx   on public.work_references (organization_id, ref_kind, ref_id);


-- ----------------------------------------------------------------------------
-- §3 · work_case_processes — N:N con procesos (§39)
--
-- Una NC de «fallo en la entrega» toca Produccion, Calidad y Despachos. Es UNA
-- no conformidad con tres procesos, no tres no conformidades.
-- ----------------------------------------------------------------------------
create table public.work_case_processes (
  organization_id uuid not null,
  case_id         uuid not null,
  process_id      uuid not null,
  created_at      timestamptz not null default now(),
  primary key (case_id, process_id),
  constraint work_case_processes_case_fk
    foreign key (organization_id, case_id) references public.work_cases (organization_id, id) on delete cascade,
  constraint work_case_processes_process_fk
    foreign key (organization_id, process_id) references public.quality_processes (organization_id, id) on delete restrict
);


-- ----------------------------------------------------------------------------
-- §4 · work_case_requirements — contra QUÉ se incumple (§12, §40)
--
-- Reutiliza la capa normativa que ya existe (frameworks/requirements). NO se
-- construye un segundo catalogo ISO. Tres origenes posibles y exactamente uno
-- por fila: normativo, documental interno, o contractual/otro en texto.
-- ----------------------------------------------------------------------------
create table public.work_case_requirements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id         uuid not null,

  requirement_id  uuid references public.requirements(id) on delete restrict,
  document_id     uuid,
  custom_text     text,
  note            text,

  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint work_case_requirements_case_fk
    foreign key (organization_id, case_id) references public.work_cases (organization_id, id) on delete cascade,
  constraint work_case_requirements_doc_fk
    foreign key (organization_id, document_id)
    references public.trazadoc_documents (organization_id, id) on delete restrict,
  -- Exactamente UNA fuente por fila: mezclarlas haría imposible saber contra
  -- qué se está midiendo el incumplimiento.
  constraint work_case_requirements_one_source check (
    (requirement_id is not null)::int + (document_id is not null)::int
    + (nullif(btrim(coalesce(custom_text,'')),'') is not null)::int = 1
  )
);

create index work_case_requirements_case_idx on public.work_case_requirements (case_id);


-- ----------------------------------------------------------------------------
-- §5 · work_case_findings — EL HALLAZGO (AC-03)
--
-- Lo que se observo. Un caso puede tener varios. Un hallazgo NO es una no
-- conformidad: es un hecho que pide evaluacion, y puede terminar en
-- observacion, en oportunidad de mejora o en nada.
-- ----------------------------------------------------------------------------
create table public.work_case_findings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id         uuid not null,

  statement       text not null,          -- qué se encontró
  location_text   text,                   -- dónde
  observed_on     date not null default current_date,
  observed_by     uuid references public.profiles(id) on delete set null,
  evidence_note   text,

  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint work_case_findings_case_fk
    foreign key (organization_id, case_id) references public.work_cases (organization_id, id) on delete cascade
);

create index work_case_findings_case_idx on public.work_case_findings (case_id);

comment on table public.work_case_findings is
  'QUALITY-04 · HALLAZGO: un hecho observado que pide evaluacion (AC-03). No es una no conformidad; puede terminar en observacion, mejora o nada.';


-- ----------------------------------------------------------------------------
-- §6 · work_case_causes — ANALISIS DE CAUSA (AC-10, AC-11)
--
-- HIPOTESIS ≠ CAUSA VALIDADA. Una hipotesis se escribe, se discute y se
-- descarta; una causa validada se aprueba y a partir de ahi es historia.
-- Metodologia elegible entre las que el baseline contempla; no se construye un
-- disenador universal de metodologias.
-- ----------------------------------------------------------------------------
create table public.work_case_causes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id         uuid not null,

  methodology     text not null default 'structured'
                  check (methodology in ('five_whys','ishikawa','structured')),
  analysis        text not null,          -- el desarrollo, según la metodología
  hypothesis      text,                   -- causa PROPUESTA (AC-10)
  validated_cause text,                   -- causa VALIDADA, cuando se aprueba

  approved_at     timestamptz,
  approved_by     uuid references public.profiles(id) on delete set null,

  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint work_case_causes_case_fk
    foreign key (organization_id, case_id) references public.work_cases (organization_id, id) on delete cascade,
  constraint work_case_causes_approved_consistent
    check ((approved_at is null) = (approved_by is null)),
  -- Aprobar exige que haya una causa validada que aprobar.
  constraint work_case_causes_validated_on_approval
    check (approved_at is null or nullif(btrim(coalesce(validated_cause,'')),'') is not null)
);

create index work_case_causes_case_idx on public.work_case_causes (case_id);


-- ----------------------------------------------------------------------------
-- §7 · work_actions — EL MOTOR TRANSVERSAL (AC-01, AC-05, AC-06, AC-13…AC-16)
--
-- UNA tabla para los cuatro tipos. No hay `quality_corrective_actions` ni
-- `audit_actions` ni `supplier_actions`: AC-01 dice que el motor es uno, y
-- crear una tabla por dominio es exactamente lo que impide reutilizarlo.
--
-- Lo que separa los tipos es su SIGNIFICADO, no su almacenamiento:
--
--   containment  · detener el dano ahora        (AC-06)
--   correction   · arreglar lo que se rompio    (AC-05)
--   corrective   · impedir que se repita        (AC-05)
--   improvement  · mejorar sin que hubiera NC   (AC-20)
-- ----------------------------------------------------------------------------
create table public.work_actions (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete restrict,

  code                  text not null,
  action_kind           text not null
                        check (action_kind in ('containment','correction','corrective','improvement')),

  title                 text not null,
  description           text,
  expected_result       text,

  owner_position_id     uuid,
  owner_profile_id      uuid references public.profiles(id) on delete set null,

  due_on                date,
  -- AC-15: prorrogar NO borra la fecha original. Un plan que se mueve tres
  -- veces y solo muestra la ultima fecha parece cumplido a tiempo.
  original_due_on       date,
  extension_count       integer not null default 0,

  priority              text not null default 'normal'
                        check (priority in ('low','normal','high','critical')),

  -- COMPLETADA ≠ CERRADA (AC-13). `closed_at` solo se pone cuando la eficacia
  -- ya no esta pendiente.
  status                text not null default 'planned'
                        check (status in ('planned','in_progress','completed','cancelled')),
  completed_on          date,
  completion_note       text,
  completed_by          uuid references public.profiles(id) on delete set null,

  -- AC-16: el criterio de eficacia se define ANTES, no despues de mirar el
  -- resultado. Definirlo despues es elegir el examen sabiendo la nota.
  requires_effectiveness boolean not null default false,
  effectiveness_criteria text,
  effectiveness_result   text not null default 'not_required'
                         check (effectiveness_result in ('not_required','pending','effective','not_effective')),

  closed_at             timestamptz,
  cancelled_reason      text,

  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint work_actions_org_code_uniq unique (organization_id, code),
  constraint work_actions_org_id_uniq unique (organization_id, id),
  constraint work_actions_owner_position_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete restrict,
  constraint work_actions_completed_consistent
    check ((status = 'completed') = (completed_on is not null)),
  -- Si exige eficacia, el criterio no puede faltar (AC-16).
  constraint work_actions_criteria_when_required
    check (not requires_effectiveness
           or nullif(btrim(coalesce(effectiveness_criteria,'')),'') is not null),
  -- Y el resultado de eficacia solo tiene sentido si se exige.
  constraint work_actions_effectiveness_consistent
    check (requires_effectiveness = (effectiveness_result <> 'not_required')),
  constraint work_actions_cancelled_reason
    check (status <> 'cancelled' or nullif(btrim(coalesce(cancelled_reason,'')),'') is not null)
);

comment on table public.work_actions is
  'QUALITY-04 · MOTOR TRANSVERSAL de acciones (AC-01). Una sola tabla para contencion, correccion, accion correctiva y mejora: lo que las separa es su significado, no su almacenamiento. COMPLETADA no es CERRADA y no es EFICAZ (AC-13).';

create index work_actions_org_status_idx on public.work_actions (organization_id, status);
create index work_actions_owner_idx      on public.work_actions (organization_id, owner_position_id);
create index work_actions_due_idx        on public.work_actions (organization_id, due_on)
  where status in ('planned','in_progress');

create table public.work_action_codes (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code            text not null,
  action_id       uuid,
  released_at     timestamptz,
  created_at      timestamptz not null default now(),
  primary key (organization_id, code),
  constraint work_action_codes_released_consistent
    check ((action_id is null) = (released_at is not null))
);


-- ----------------------------------------------------------------------------
-- §8 · work_action_verifications — LA EFICACIA, APPEND-ONLY (AC-22)
--
-- Una verificacion NO se corrige: si la conclusion cambia, se registra otra.
-- Sobrescribir «no eficaz» por «eficaz» borraria exactamente el aprendizaje
-- que justifica todo el ciclo.
-- ----------------------------------------------------------------------------
create table public.work_action_verifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  action_id       uuid not null,

  criteria        text not null,          -- contra qué se verificó
  result          text not null check (result in ('effective','not_effective')),
  comment         text,

  verified_on     date not null default current_date,
  verified_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint work_action_verifications_action_fk
    foreign key (organization_id, action_id)
    references public.work_actions (organization_id, id) on delete cascade
);

create index work_action_verifications_action_idx on public.work_action_verifications (action_id);


-- ----------------------------------------------------------------------------
-- §9 · work_decisions — LOS HECHOS FORMALES, INMUTABLES (AC-22)
--
-- Aqui vive lo que NO se edita: clasificar un caso, aprobar una causa,
-- verificar una eficacia, cerrar, reabrir, conceder. Cada fila dice QUE se
-- decidio, QUIEN, CUANDO y CON QUE FUNDAMENTO.
--
-- Es historia de NEGOCIO, no audit_log tecnico (§68). audit_log sigue siendo
-- lo que era: quien toco que fila. Esto es otra cosa — es el acta.
-- ----------------------------------------------------------------------------
create table public.work_decisions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,

  subject_kind    text not null check (subject_kind in ('case','action')),
  subject_id      uuid not null,

  decision_kind   text not null
                  check (decision_kind in ('case_opened','classification','correction_needed',
                                           'cause_approved','action_planned','action_completed',
                                           'effectiveness','closure','reopen','concession')),
  outcome         text,                   -- el valor decidido, cuando aplica
  rationale       text,

  decided_by      uuid references public.profiles(id) on delete set null,
  decided_at      timestamptz not null default now(),
  -- Contexto congelado del momento de decidir, cuando la historia lo exige.
  context         jsonb
);

comment on table public.work_decisions is
  'QUALITY-04 · HECHOS FORMALES append-only (AC-22). Es el ACTA del caso: que se decidio, quien y por que. No es audit_log —eso es tecnico—: esto es historia de negocio y alimenta el timeline.';

create index work_decisions_subject_idx on public.work_decisions (subject_kind, subject_id, decided_at);
create index work_decisions_org_idx     on public.work_decisions (organization_id, decided_at desc);


-- ----------------------------------------------------------------------------
-- §10 · LA REFERENCIA TIPADA SE VALIDA DE VERDAD
--
-- Sin esto, `work_references` seria un jsonb con nombre de tabla. El
-- disparador comprueba, para CADA tipo, que la fila exista y que sea de la
-- MISMA empresa — lo segundo importa tanto como lo primero: referenciar el
-- indicador de otra empresa filtraria su existencia.
-- ----------------------------------------------------------------------------
create or replace function public.work_reference_must_be_valid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
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
  end;

  if v_org is null then
    raise exception 'La referencia apunta a algo que no existe.';
  end if;
  if v_org <> new.organization_id then
    raise exception 'La referencia apunta a algo que no es de esta empresa.';
  end if;

  -- Y el propietario tambien debe ser de la misma empresa.
  if new.owner_kind = 'case' then
    if not exists (select 1 from work_cases where id = new.owner_id and organization_id = new.organization_id) then
      raise exception 'El caso no existe en esta empresa.';
    end if;
  else
    if not exists (select 1 from work_actions where id = new.owner_id and organization_id = new.organization_id) then
      raise exception 'La acción no existe en esta empresa.';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.work_reference_must_be_valid() from public, anon, authenticated;

create trigger work_references_validate
  before insert or update on public.work_references
  for each row execute function public.work_reference_must_be_valid();


-- ----------------------------------------------------------------------------
-- §11 · LO QUE NO SE REESCRIBE (AC-22)
--
-- Una decision formal no se edita ni se borra. Si la conclusion cambia, se
-- registra OTRA decision: asi la historia dice que alguien cambio de opinion,
-- que es informacion, en vez de fingir que siempre penso lo mismo.
-- ----------------------------------------------------------------------------
create or replace function public.work_decisions_are_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Una decisión formal no se modifica ni se borra. Si la conclusión cambió, registra una decisión nueva: el historial debe mostrar que cambió.';
end;
$$;
revoke all on function public.work_decisions_are_immutable() from public, anon, authenticated;

create trigger work_decisions_no_update before update on public.work_decisions
  for each row execute function public.work_decisions_are_immutable();
create trigger work_decisions_no_delete before delete on public.work_decisions
  for each row execute function public.work_decisions_are_immutable();

-- Lo mismo para una verificacion de eficacia: «no eficaz» no se convierte en
-- «eficaz» con un UPDATE (§71).
create trigger work_action_verifications_no_update before update on public.work_action_verifications
  for each row execute function public.work_decisions_are_immutable();
create trigger work_action_verifications_no_delete before delete on public.work_action_verifications
  for each row execute function public.work_decisions_are_immutable();

-- Y una causa YA APROBADA es historia: se puede analizar mas, pero no se
-- reescribe en silencio lo que fundamento un plan (§19).
create or replace function public.work_case_cause_immutable_once_approved()
returns trigger
language plpgsql
as $$
begin
  if old.approved_at is not null then
    if new.validated_cause is distinct from old.validated_cause
       or new.analysis is distinct from old.analysis
       or new.methodology is distinct from old.methodology
       or new.approved_at is distinct from old.approved_at
       or new.approved_by is distinct from old.approved_by then
      raise exception 'Esta causa ya fue aprobada y fundamentó un plan de acciones. Registra un análisis nuevo en lugar de reescribirla.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.work_case_cause_immutable_once_approved() from public, anon, authenticated;

create trigger work_case_causes_protect before update on public.work_case_causes
  for each row execute function public.work_case_cause_immutable_once_approved();

-- Un caso CERRADO no se edita por la puerta de atras (§65): para tocarlo hay
-- que reabrirlo formalmente, y eso deja rastro.
create or replace function public.work_case_closed_is_read_only()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'closed' and new.status = 'closed' then
    if new.classification is distinct from old.classification
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.requirement_text is distinct from old.requirement_text
       or new.evidence_text is distinct from old.evidence_text
       or new.nonconformity_text is distinct from old.nonconformity_text
       or new.priority is distinct from old.priority
       or new.owner_position_id is distinct from old.owner_position_id then
      raise exception 'Este caso está cerrado. Reábrelo formalmente, con motivo, si de verdad hay que cambiar algo.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.work_case_closed_is_read_only() from public, anon, authenticated;

create trigger work_cases_protect_closed before update on public.work_cases
  for each row execute function public.work_case_closed_is_read_only();

create or replace function public.work_actions_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
create trigger work_actions_touch_updated before update on public.work_actions
  for each row execute function public.work_actions_touch();


-- ----------------------------------------------------------------------------
-- §12 · CODIGOS QUE NO SE RECICLAN
-- ----------------------------------------------------------------------------
create or replace function public.work_case_reserve_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_res record;
begin
  select * into v_res from work_case_codes
   where organization_id = new.organization_id and code = new.code;
  if v_res.code is null then
    insert into work_case_codes (organization_id, code, case_id)
    values (new.organization_id, new.code, new.id);
    return new;
  end if;
  if v_res.case_id is not null and v_res.case_id <> new.id then
    raise exception 'El caso % ya existe en esta empresa.', new.code;
  end if;
  if v_res.case_id is null then
    raise exception 'El número de caso % ya se usó antes y no puede reutilizarse.', new.code;
  end if;
  return new;
end;
$$;
revoke all on function public.work_case_reserve_code() from public, anon, authenticated;

create or replace function public.work_case_release_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update work_case_codes set case_id = null, released_at = now()
   where organization_id = old.organization_id and code = old.code and case_id = old.id;
  return old;
end;
$$;
revoke all on function public.work_case_release_code() from public, anon, authenticated;

create trigger work_cases_reserve_code after insert on public.work_cases
  for each row execute function public.work_case_reserve_code();
create trigger work_cases_release_code after delete on public.work_cases
  for each row execute function public.work_case_release_code();

create or replace function public.work_action_reserve_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_res record;
begin
  select * into v_res from work_action_codes
   where organization_id = new.organization_id and code = new.code;
  if v_res.code is null then
    insert into work_action_codes (organization_id, code, action_id)
    values (new.organization_id, new.code, new.id);
    return new;
  end if;
  if v_res.action_id is not null and v_res.action_id <> new.id then
    raise exception 'La acción % ya existe en esta empresa.', new.code;
  end if;
  if v_res.action_id is null then
    raise exception 'El número de acción % ya se usó antes y no puede reutilizarse.', new.code;
  end if;
  return new;
end;
$$;
revoke all on function public.work_action_reserve_code() from public, anon, authenticated;

create or replace function public.work_action_release_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update work_action_codes set action_id = null, released_at = now()
   where organization_id = old.organization_id and code = old.code and action_id = old.id;
  return old;
end;
$$;
revoke all on function public.work_action_release_code() from public, anon, authenticated;

create trigger work_actions_reserve_code after insert on public.work_actions
  for each row execute function public.work_action_reserve_code();
create trigger work_actions_release_code after delete on public.work_actions
  for each row execute function public.work_action_release_code();


-- ----------------------------------------------------------------------------
-- §13 · RLS · deny-by-default
--
-- La ESCRITURA de casos y acciones es de admin/quality/consultant, igual que el
-- resto de Quality. Pero las DECISIONES FORMALES, las verificaciones y las
-- causas aprobadas NO tienen politica de escritura: solo las RPC de §15, que
-- comprueban rol, estado e invariantes. Una decision no se «inserta».
-- ----------------------------------------------------------------------------
alter table public.work_cases              enable row level security;
alter table public.work_case_codes         enable row level security;
alter table public.work_references         enable row level security;
alter table public.work_case_processes     enable row level security;
alter table public.work_case_requirements  enable row level security;
alter table public.work_case_findings      enable row level security;
alter table public.work_case_causes        enable row level security;
alter table public.work_actions            enable row level security;
alter table public.work_action_verifications enable row level security;
alter table public.work_decisions          enable row level security;

create policy work_cases_select on public.work_cases
  for select to authenticated using (public.is_org_member(organization_id));
create policy work_cases_insert on public.work_cases
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy work_cases_update on public.work_cases
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy work_cases_delete on public.work_cases
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

create policy work_case_codes_select on public.work_case_codes
  for select to authenticated using (public.is_org_member(organization_id));
create policy work_action_codes_select on public.work_action_codes
  for select to authenticated using (public.is_org_member(organization_id));
alter table public.work_action_codes enable row level security;

create policy work_references_select on public.work_references
  for select to authenticated using (public.is_org_member(organization_id));
create policy work_references_insert on public.work_references
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy work_references_delete on public.work_references
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']));

create policy work_case_processes_select on public.work_case_processes
  for select to authenticated using (public.is_org_member(organization_id));
create policy work_case_processes_insert on public.work_case_processes
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy work_case_processes_delete on public.work_case_processes
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']));

create policy work_case_requirements_select on public.work_case_requirements
  for select to authenticated using (public.is_org_member(organization_id));
create policy work_case_requirements_insert on public.work_case_requirements
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy work_case_requirements_delete on public.work_case_requirements
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']));

create policy work_case_findings_select on public.work_case_findings
  for select to authenticated using (public.is_org_member(organization_id));
create policy work_case_findings_insert on public.work_case_findings
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy work_case_findings_update on public.work_case_findings
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy work_case_findings_delete on public.work_case_findings
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']));

create policy work_case_causes_select on public.work_case_causes
  for select to authenticated using (public.is_org_member(organization_id));
create policy work_case_causes_insert on public.work_case_causes
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy work_case_causes_update on public.work_case_causes
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));

create policy work_actions_select on public.work_actions
  for select to authenticated using (public.is_org_member(organization_id));
create policy work_actions_insert on public.work_actions
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy work_actions_update on public.work_actions
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy work_actions_delete on public.work_actions
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

-- SOLO LECTURA para el cliente: las escribe unicamente una RPC.
create policy work_action_verifications_select on public.work_action_verifications
  for select to authenticated using (public.is_org_member(organization_id));
create policy work_decisions_select on public.work_decisions
  for select to authenticated using (public.is_org_member(organization_id));


-- ----------------------------------------------------------------------------
-- §14 · Ensanchar las primitivas de 0116 — NO crear un sistema paralelo
--
-- El encargo lo prohibe explicitamente: nada de `quality_nc_alerts` ni
-- `corrective_action_notifications`. work_tasks/work_alerts/work_events ya son
-- transversales; aqui solo aprenden los tipos nuevos. Ensanchar un CHECK es
-- aditivo: ninguna fila existente deja de ser valida.
-- ----------------------------------------------------------------------------
alter table public.work_tasks  drop constraint work_tasks_source_domain_check;
alter table public.work_tasks  add constraint work_tasks_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action'));
alter table public.work_tasks  drop constraint work_tasks_subject_type_check;
alter table public.work_tasks  add constraint work_tasks_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                          'work_case','work_action'));
alter table public.work_tasks  drop constraint work_tasks_type_check;
alter table public.work_tasks  add constraint work_tasks_type_check
  check (task_type in ('document_review','document_approval','document_changes_requested',
                       'indicator_measurement_due','indicator_off_target',
                       'case_evaluation','case_closure','action_execution','action_effectiveness'));

alter table public.work_alerts drop constraint work_alerts_source_domain_check;
alter table public.work_alerts add constraint work_alerts_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action'));
alter table public.work_alerts drop constraint work_alerts_subject_type_check;
alter table public.work_alerts add constraint work_alerts_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                          'work_case','work_action'));
alter table public.work_alerts drop constraint work_alerts_type_check;
alter table public.work_alerts add constraint work_alerts_type_check
  check (alert_type in ('document_review_requested','document_approval_requested',
                        'document_changes_requested','document_approved','document_retired',
                        'indicator_measurement_due','indicator_target_missed','objective_at_risk',
                        'case_assigned','action_assigned','action_overdue','effectiveness_due'));

alter table public.work_events drop constraint work_events_source_domain_check;
alter table public.work_events add constraint work_events_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action'));
alter table public.work_events drop constraint work_events_subject_type_check;
alter table public.work_events add constraint work_events_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                          'work_case','work_action'));
alter table public.work_events drop constraint work_events_type_check;
alter table public.work_events add constraint work_events_type_check
  check (event_type in ('indicator.target_missed','indicator.attention','indicator.recovered',
                        'indicator.measurement_due','indicator.source_failed','objective.at_risk',
                        'case.opened','case.classified','case.closed','case.reopened',
                        'action.planned','action.completed','action.verified','action.overdue'));


-- ----------------------------------------------------------------------------
-- §15 · LAS RPC DEL FLUJO FORMAL
--
-- Todo lo que crea HISTORIA pasa por aqui. No es ceremonia: es que una decision
-- formal necesita comprobar rol, estado e invariantes en el mismo acto en que
-- se registra, y eso no se puede hacer con un INSERT desde el navegador.
-- ----------------------------------------------------------------------------

/** Quien puede gestionar casos. Mismo conjunto que el resto de Quality. */
create or replace function public.work_case_guard(p_case_id uuid, p_roles text[])
returns public.work_cases
language plpgsql stable security definer set search_path = public
as $$
declare v_case work_cases;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into v_case from work_cases where id = p_case_id;
  if v_case.id is null then raise exception 'El caso no existe'; end if;
  if not is_org_member(v_case.organization_id) then
    raise exception 'No perteneces a la empresa de este caso';
  end if;
  if not has_org_role(v_case.organization_id, p_roles) then
    raise exception 'Tu rol no permite esta acción sobre el caso';
  end if;
  return v_case;
end;
$$;
revoke all on function public.work_case_guard(uuid, text[]) from public, anon, authenticated;

/** Siguiente numero de caso del anio, por empresa. C-2026-001. */
create or replace function public.work_next_case_code(p_organization_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_year text := to_char(current_date, 'YYYY');
  v_n    integer;
begin
  select coalesce(max(substring(code from '\d+$')::int), 0) + 1 into v_n
    from work_case_codes
   where organization_id = p_organization_id and code like 'C-' || v_year || '-%';
  return 'C-' || v_year || '-' || lpad(v_n::text, 3, '0');
end;
$$;
revoke all on function public.work_next_case_code(uuid) from public, anon, authenticated;
grant execute on function public.work_next_case_code(uuid) to authenticated;

create or replace function public.work_next_action_code(p_organization_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_year text := to_char(current_date, 'YYYY');
  v_n    integer;
begin
  select coalesce(max(substring(code from '\d+$')::int), 0) + 1 into v_n
    from work_action_codes
   where organization_id = p_organization_id and code like 'A-' || v_year || '-%';
  return 'A-' || v_year || '-' || lpad(v_n::text, 3, '0');
end;
$$;
revoke all on function public.work_next_action_code(uuid) from public, anon, authenticated;
grant execute on function public.work_next_action_code(uuid) to authenticated;


/**
 * CLASIFICAR UN CASO — la decisión que AC-04 exige que sea humana.
 *
 * Aquí se decide si algo ES o NO ES una no conformidad. No se deriva de una
 * severidad ni del estado de un indicador: alguien con autoridad lo dice, con
 * fundamento, y queda registrado quién y cuándo.
 */
create or replace function public.work_classify_case(
  p_case_id uuid,
  p_classification text,
  p_rationale text,
  p_requirement_text text default null,
  p_evidence_text text default null,
  p_nonconformity_text text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_case work_cases;
begin
  v_case := work_case_guard(p_case_id, array['admin','quality']);

  if v_case.status = 'closed' then
    raise exception 'Este caso está cerrado. Reábrelo formalmente si hay que reclasificarlo.';
  end if;
  if p_classification not in ('nonconformity','observation','improvement_opportunity','not_applicable') then
    raise exception 'Clasificación no válida.';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'Escribe el fundamento de la clasificación: es lo que hace defendible la decisión.';
  end if;
  if not exists (select 1 from work_case_findings where case_id = p_case_id) then
    raise exception 'Registra al menos un hallazgo antes de clasificar: sin hecho observado no hay nada que evaluar.';
  end if;
  if p_classification = 'nonconformity' then
    if nullif(btrim(coalesce(p_requirement_text,'')),'') is null
       or nullif(btrim(coalesce(p_nonconformity_text,'')),'') is null then
      raise exception 'Una no conformidad necesita el requisito incumplido y la declaración del incumplimiento.';
    end if;
  end if;

  update work_cases
     set classification = p_classification,
         requirement_text = coalesce(p_requirement_text, requirement_text),
         evidence_text = coalesce(p_evidence_text, evidence_text),
         nonconformity_text = coalesce(p_nonconformity_text, nonconformity_text),
         status = case when status = 'draft' then 'open' else status end
   where id = p_case_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by)
  values (v_case.organization_id, 'case', p_case_id, 'classification',
          p_classification, p_rationale, auth.uid());

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                           severity, summary, dedupe_key, created_by)
  values (v_case.organization_id, 'case', 'case.classified', 'work_case', p_case_id,
          case when p_classification = 'nonconformity' then 'warning' else 'info' end,
          'Caso ' || v_case.code || ' clasificado como ' || p_classification,
          'ev:case:class:' || p_case_id::text || ':' || extract(epoch from now())::bigint::text,
          auth.uid());
end;
$$;
revoke all on function public.work_classify_case(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.work_classify_case(uuid, text, text, text, text, text) to authenticated;


/** APROBAR UNA CAUSA — de hipótesis a causa validada (AC-10). */
create or replace function public.work_approve_cause(p_cause_id uuid, p_validated_cause text, p_rationale text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_cause work_case_causes; v_case work_cases;
begin
  select * into v_cause from work_case_causes where id = p_cause_id;
  if v_cause.id is null then raise exception 'El análisis no existe'; end if;
  v_case := work_case_guard(v_cause.case_id, array['admin','quality']);
  if v_cause.approved_at is not null then
    raise exception 'Esta causa ya fue aprobada. Registra un análisis nuevo si la conclusión cambió.';
  end if;
  if nullif(btrim(coalesce(p_validated_cause,'')),'') is null then
    raise exception 'Escribe la causa validada.';
  end if;

  update work_case_causes
     set validated_cause = p_validated_cause, approved_at = now(), approved_by = auth.uid()
   where id = p_cause_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by)
  values (v_case.organization_id, 'case', v_cause.case_id, 'cause_approved',
          p_validated_cause, p_rationale, auth.uid());
end;
$$;
revoke all on function public.work_approve_cause(uuid, text, text) from public, anon;
grant execute on function public.work_approve_cause(uuid, text, text) to authenticated;


/**
 * COMPLETAR UNA ACCIÓN — completada NO es eficaz (AC-13).
 *
 * Si la acción exige verificación de eficacia, completarla la deja PENDIENTE,
 * no cerrada. Es la diferencia entre «hice lo que dije» y «sirvió».
 */
create or replace function public.work_complete_action(
  p_action_id uuid, p_completed_on date, p_note text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_action work_actions;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into v_action from work_actions where id = p_action_id;
  if v_action.id is null then raise exception 'La acción no existe'; end if;
  if not is_org_member(v_action.organization_id) then
    raise exception 'No perteneces a la empresa de esta acción';
  end if;
  if not has_org_role(v_action.organization_id, array['admin','quality','consultant']) then
    raise exception 'Tu rol no permite completar acciones';
  end if;
  if v_action.status = 'completed' then raise exception 'Esta acción ya está completada.'; end if;
  if v_action.status = 'cancelled' then raise exception 'Una acción cancelada no se completa.'; end if;
  if nullif(btrim(coalesce(p_note,'')),'') is null then
    raise exception 'Describe qué se hizo: una acción completada sin resultado no se puede verificar después.';
  end if;

  update work_actions
     set status = 'completed',
         completed_on = coalesce(p_completed_on, current_date),
         completion_note = p_note,
         completed_by = auth.uid(),
         -- Si exige eficacia, queda PENDIENTE. Si no, se cierra aquí mismo.
         effectiveness_result = case when requires_effectiveness then 'pending' else 'not_required' end,
         closed_at = case when requires_effectiveness then null else now() end
   where id = p_action_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by)
  values (v_action.organization_id, 'action', p_action_id, 'action_completed', 'completed', p_note, auth.uid());

  -- La tarea de ejecución se cierra sola: nadie debería tener que acordarse.
  update work_tasks set status = 'done', resolution = 'Acción completada', updated_at = now()
   where organization_id = v_action.organization_id
     and subject_type = 'work_action' and subject_id = p_action_id
     and task_type = 'action_execution' and status in ('open','in_progress');
end;
$$;
revoke all on function public.work_complete_action(uuid, date, text) from public, anon;
grant execute on function public.work_complete_action(uuid, date, text) to authenticated;


/**
 * VERIFICAR LA EFICACIA — y si no fue eficaz, decirlo y conservarlo.
 *
 * Una verificación negativa NO se corrige después: se registra otra. AC-17
 * permite que una eficacia negativa reabra el caso para volver a analizar, y
 * eso es lo que pasa aquí.
 */
create or replace function public.work_verify_effectiveness(
  p_action_id uuid, p_result text, p_criteria text, p_comment text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_action work_actions; v_case_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into v_action from work_actions where id = p_action_id;
  if v_action.id is null then raise exception 'La acción no existe'; end if;
  if not is_org_member(v_action.organization_id) then
    raise exception 'No perteneces a la empresa de esta acción';
  end if;
  -- Verificar la eficacia es un acto de gobierno, no de ejecución.
  if not has_org_role(v_action.organization_id, array['admin','quality']) then
    raise exception 'Solo la administración o el área de calidad verifican la eficacia';
  end if;
  if not v_action.requires_effectiveness then
    raise exception 'Esta acción no exige verificación de eficacia.';
  end if;
  if v_action.status <> 'completed' then
    raise exception 'Primero hay que completar la acción: no se puede verificar lo que no se hizo.';
  end if;
  if p_result not in ('effective','not_effective') then
    raise exception 'Resultado de eficacia no válido.';
  end if;

  insert into work_action_verifications
    (organization_id, action_id, criteria, result, comment, verified_by)
  values (v_action.organization_id, p_action_id,
          coalesce(nullif(btrim(p_criteria),''), v_action.effectiveness_criteria),
          p_result, p_comment, auth.uid());

  update work_actions
     set effectiveness_result = p_result,
         closed_at = case when p_result = 'effective' then now() else null end
   where id = p_action_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by)
  values (v_action.organization_id, 'action', p_action_id, 'effectiveness', p_result, p_comment, auth.uid());

  update work_tasks set status = 'done', resolution = 'Eficacia verificada', updated_at = now()
   where organization_id = v_action.organization_id
     and subject_type = 'work_action' and subject_id = p_action_id
     and task_type = 'action_effectiveness' and status in ('open','in_progress');

  -- AC-17: si NO fue eficaz, el caso vuelve a análisis. No se borra nada; se
  -- añade un capítulo.
  if p_result = 'not_effective' then
    select r.owner_id into v_case_id from work_references r
     where r.owner_kind = 'action' and r.owner_id = p_action_id limit 1;
    select ref_id into v_case_id from work_references
     where owner_kind = 'action' and owner_id = p_action_id and ref_kind = 'work_case' limit 1;
    if v_case_id is not null then
      update work_cases set status = 'in_analysis'
       where id = v_case_id and status <> 'closed';
      insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                               severity, summary, dedupe_key, created_by)
      values (v_action.organization_id, 'action', 'action.verified', 'work_case', v_case_id,
              'warning', 'La acción ' || v_action.code || ' no fue eficaz: el caso vuelve a análisis',
              'ev:act:noteff:' || p_action_id::text, auth.uid())
      on conflict do nothing;
    end if;
  end if;
end;
$$;
revoke all on function public.work_verify_effectiveness(uuid, text, text, text) from public, anon;
grant execute on function public.work_verify_effectiveness(uuid, text, text, text) to authenticated;


/**
 * ¿SE PUEDE CERRAR ESTE CASO? (AC-18)
 *
 * Un caso NO se cierra porque las tareas estén marcadas. Se cierra cuando el
 * ciclo está completo, y esta función dice exactamente qué falta. La devuelve
 * como jsonb para que la pantalla muestre la lista de pendientes en vez de un
 * botón deshabilitado sin explicación.
 */
create or replace function public.work_case_closure_eligibility(p_case_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_case    work_cases;
  v_missing jsonb := '[]'::jsonb;
  v_n       integer;
begin
  select * into v_case from work_cases where id = p_case_id;
  if v_case.id is null or not is_org_member(v_case.organization_id) then
    return jsonb_build_object('can_close', false, 'missing', '[]'::jsonb,
      'reason', 'Este caso no existe.');
  end if;
  if v_case.status = 'closed' then
    return jsonb_build_object('can_close', false, 'missing', '[]'::jsonb,
      'reason', 'Este caso ya está cerrado.');
  end if;

  -- 1 · Sin evaluación no hay nada que cerrar.
  if v_case.classification = 'pending' then
    v_missing := v_missing || to_jsonb('Evaluar el caso y clasificarlo'::text);
  end if;

  -- 2 · Una NC exige causa aprobada y al menos una acción correctiva. Las demás
  --     clasificaciones no: AC-07 y AC-08 dicen que la profundidad del
  --     tratamiento es proporcional, no uniforme.
  if v_case.classification = 'nonconformity' then
    select count(*) into v_n from work_case_causes
     where case_id = p_case_id and approved_at is not null;
    if v_n = 0 then
      v_missing := v_missing || to_jsonb('Aprobar el análisis de causa'::text);
    end if;

    select count(*) into v_n from work_actions a
      join work_references r on r.owner_kind = 'action' and r.owner_id = a.id
                            and r.ref_kind = 'work_case' and r.ref_id = p_case_id
     where a.action_kind = 'corrective';
    if v_n = 0 then
      v_missing := v_missing || to_jsonb('Registrar al menos una acción correctiva'::text);
    end if;
  end if;

  -- 3 · Ninguna acción del caso puede quedar en el aire.
  select count(*) into v_n from work_actions a
    join work_references r on r.owner_kind = 'action' and r.owner_id = a.id
                          and r.ref_kind = 'work_case' and r.ref_id = p_case_id
   where a.status in ('planned','in_progress');
  if v_n > 0 then
    v_missing := v_missing || to_jsonb(
      v_n::text || ' ' || case when v_n = 1 then 'acción sin completar' else 'acciones sin completar' end);
  end if;

  -- 4 · Y ninguna eficacia obligatoria puede quedar pendiente.
  select count(*) into v_n from work_actions a
    join work_references r on r.owner_kind = 'action' and r.owner_id = a.id
                          and r.ref_kind = 'work_case' and r.ref_id = p_case_id
   where a.requires_effectiveness and a.effectiveness_result = 'pending';
  if v_n > 0 then
    v_missing := v_missing || to_jsonb(
      v_n::text || ' ' || case when v_n = 1 then 'eficacia pendiente de verificar'
                               else 'eficacias pendientes de verificar' end);
  end if;

  if jsonb_array_length(v_missing) = 0 then
    return jsonb_build_object('can_close', true, 'missing', '[]'::jsonb,
      'reason', 'El ciclo está completo: el caso puede cerrarse.');
  end if;
  return jsonb_build_object('can_close', false, 'missing', v_missing,
    'reason', 'Todavía falta cerrar el ciclo.');
end;
$$;
revoke all on function public.work_case_closure_eligibility(uuid) from public, anon;
grant execute on function public.work_case_closure_eligibility(uuid) to authenticated;


/** CERRAR — con las condiciones comprobadas EN EL ACTO, no antes. */
create or replace function public.work_close_case(p_case_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_case work_cases; v_elig jsonb; v_missing text := '';
begin
  v_case := work_case_guard(p_case_id, array['admin','quality']);
  if nullif(btrim(coalesce(p_note,'')),'') is null then
    raise exception 'Escribe el fundamento del cierre.';
  end if;

  v_elig := work_case_closure_eligibility(p_case_id);
  if not coalesce((v_elig->>'can_close')::boolean, false) then
    select string_agg(value #>> '{}', '; ') into v_missing
      from jsonb_array_elements(v_elig->'missing');
    raise exception 'Todavía no se puede cerrar: %', coalesce(v_missing, v_elig->>'reason');
  end if;

  update work_cases
     set status = 'closed', closed_at = now(), closed_by = auth.uid(), closure_note = p_note
   where id = p_case_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by)
  values (v_case.organization_id, 'case', p_case_id, 'closure', 'closed', p_note, auth.uid());

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                           severity, summary, dedupe_key, created_by)
  values (v_case.organization_id, 'case', 'case.closed', 'work_case', p_case_id,
          'info', 'Caso ' || v_case.code || ' cerrado',
          'ev:case:closed:' || p_case_id::text || ':' || v_case.reopen_count::text, auth.uid())
  on conflict do nothing;

  update work_tasks set status = 'done', resolution = 'Caso cerrado', updated_at = now()
   where organization_id = v_case.organization_id
     and subject_type = 'work_case' and subject_id = p_case_id
     and status in ('open','in_progress');
end;
$$;
revoke all on function public.work_close_case(uuid, text) from public, anon;
grant execute on function public.work_close_case(uuid, text) to authenticated;


/** REABRIR — conservando el cierre anterior (AC-19). Exige motivo. */
create or replace function public.work_reopen_case(p_case_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_case work_cases;
begin
  v_case := work_case_guard(p_case_id, array['admin']);
  if v_case.status <> 'closed' then raise exception 'Este caso no está cerrado.'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Reabrir un caso exige un motivo: sin él, el historial no explica por qué se reabrió.';
  end if;

  -- El cierre anterior NO se borra: queda en work_decisions. Aquí solo se
  -- levanta el estado y se cuenta la reapertura.
  update work_cases
     set status = 'in_analysis', closed_at = null, reopened_at = now(),
         reopen_count = reopen_count + 1
   where id = p_case_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by)
  values (v_case.organization_id, 'case', p_case_id, 'reopen', 'reopened', p_reason, auth.uid());

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                           severity, summary, dedupe_key, created_by)
  values (v_case.organization_id, 'case', 'case.reopened', 'work_case', p_case_id,
          'warning', 'Caso ' || v_case.code || ' reabierto',
          'ev:case:reopen:' || p_case_id::text || ':' || (v_case.reopen_count + 1)::text, auth.uid())
  on conflict do nothing;
end;
$$;
revoke all on function public.work_reopen_case(uuid, text) from public, anon;
grant execute on function public.work_reopen_case(uuid, text) to authenticated;


/**
 * BARRIDO DE PENDIENTES — reutiliza el motor de 0116, no crea uno nuevo.
 *
 * Idempotente por `dedupe_key` (AC-23): repetirlo no duplica nada. Sin eso, un
 * barrido diario llenaría la bandeja de la misma tarea treinta veces y la
 * gente dejaría de mirarla.
 */
create or replace function public.work_scan_pending_actions(p_organization_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_row record; v_owner uuid; v_n integer := 0;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not is_org_member(p_organization_id) then raise exception 'No perteneces a esta empresa'; end if;
  if not has_org_role(p_organization_id, array['admin','quality']) then
    raise exception 'Solo la administración o el área de calidad revisan los pendientes';
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
revoke all on function public.work_scan_pending_actions(uuid) from public, anon;
grant execute on function public.work_scan_pending_actions(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- §16 · VISTA DERIVADA — el estado del caso NO se almacena
-- ----------------------------------------------------------------------------
create view public.v_work_case_overview
with (security_invoker = true) as
select
  c.organization_id,
  c.id                         as case_id,
  c.code, c.title, c.description, c.case_type, c.origin_kind, c.origin_note,
  c.detected_on, c.classification, c.priority, c.status,
  c.requirement_text, c.evidence_text, c.nonconformity_text,
  c.owner_position_id,
  pos.name                     as owner_position_name,
  coalesce(nullif(trim(holder.full_name), ''), holder.email) as owner_holder_name,
  coalesce(nullif(trim(rep.full_name), ''), rep.email)       as reported_by_name,
  c.closed_at, c.closure_note, c.reopened_at, c.reopen_count, c.created_at,
  coalesce(f.finding_count, 0)     as finding_count,
  coalesce(pr.process_names, '')   as process_names,
  coalesce(rq.requirement_count,0) as requirement_count,
  coalesce(a.total, 0)             as action_count,
  coalesce(a.open_count, 0)        as open_action_count,
  coalesce(a.overdue_count, 0)     as overdue_action_count,
  coalesce(a.pending_eff, 0)       as pending_effectiveness_count,
  (select approved_at is not null from work_case_causes
    where case_id = c.id order by approved_at desc nulls last limit 1) as cause_approved
from public.work_cases c
left join public.quality_positions pos on pos.id = c.owner_position_id
left join public.v_quality_position_current_holder h on h.position_id = c.owner_position_id
left join public.profiles holder on holder.id = h.profile_id
left join public.profiles rep on rep.id = c.reported_by
left join lateral (
  select count(*) as finding_count from public.work_case_findings where case_id = c.id
) f on true
left join lateral (
  select string_agg(p.name, ', ' order by p.name) as process_names
    from public.work_case_processes cp
    join public.quality_processes p on p.id = cp.process_id
   where cp.case_id = c.id
) pr on true
left join lateral (
  select count(*) as requirement_count from public.work_case_requirements where case_id = c.id
) rq on true
left join lateral (
  select count(*) as total,
         count(*) filter (where act.status in ('planned','in_progress')) as open_count,
         count(*) filter (where act.status in ('planned','in_progress')
                           and act.due_on is not null and act.due_on < current_date) as overdue_count,
         count(*) filter (where act.requires_effectiveness and act.effectiveness_result = 'pending') as pending_eff
    from public.work_references r
    join public.work_actions act on act.id = r.owner_id
   where r.owner_kind = 'action' and r.ref_kind = 'work_case' and r.ref_id = c.id
) a on true;

comment on view public.v_work_case_overview is
  'QUALITY-04 · Estado del caso, DERIVADO (MDR-37). Los contadores de acciones, vencimientos y eficacias pendientes se calculan; no hay un campo que pueda quedarse desactualizado.';


-- ----------------------------------------------------------------------------
-- §17 · PRIVILEGIOS EXPLICITOS (leccion de 0111, 0115 y 0118)
--
-- Conceder SELECT no retira lo que el entorno concede de mas. Las tablas de
-- HISTORIA reciben SELECT y se les revoca el resto: sus escrituras son
-- exclusivamente de las RPC.
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on table
  public.work_cases, public.work_references, public.work_case_processes,
  public.work_case_requirements, public.work_case_findings, public.work_case_causes,
  public.work_actions
to authenticated;

grant select on table
  public.work_decisions, public.work_action_verifications,
  public.work_case_codes, public.work_action_codes,
  public.v_work_case_overview
to authenticated;

grant select, insert, update, delete on table
  public.work_cases, public.work_references, public.work_case_processes,
  public.work_case_requirements, public.work_case_findings, public.work_case_causes,
  public.work_actions, public.work_decisions, public.work_action_verifications,
  public.work_case_codes, public.work_action_codes
to service_role;
grant select on table public.v_work_case_overview to service_role;

-- Historia: SOLO lectura para el cliente. Sin esto, en un proyecto remoto
-- `authenticated` conservaria INSERT/UPDATE/DELETE y un DELETE sin politica
-- devolveria 204 en vez de fallar.
revoke insert, update, delete, truncate, references, trigger on table
  public.work_decisions, public.work_action_verifications,
  public.work_case_codes, public.work_action_codes
from authenticated;

revoke truncate, references, trigger on table
  public.work_cases, public.work_references, public.work_case_processes,
  public.work_case_requirements, public.work_case_findings, public.work_case_causes,
  public.work_actions
from authenticated;

-- anon no recibe NADA: ninguna superficie de casos es publica.
revoke all on table
  public.work_cases, public.work_references, public.work_case_processes,
  public.work_case_requirements, public.work_case_findings, public.work_case_causes,
  public.work_actions, public.work_decisions, public.work_action_verifications,
  public.work_case_codes, public.work_action_codes, public.v_work_case_overview
from anon;


-- ----------------------------------------------------------------------------
-- §18 · CICLO DE VIDA — la puerta, con el mismo patrón de QUALITY-03.1
--
-- Un caso en BORRADOR sin nada dentro se puede tirar: alguien lo abrió por
-- error y no hay historia que conservar. En cuanto se evalúa, se le registra un
-- hallazgo o se le planifica una acción, deja de ser desechable — y una NO
-- CONFORMIDAD formalizada no se destruye nunca, tampoco por un administrador.
--
-- Sin esto, `work_decisions` no tiene FK al caso (su `subject_id` es genérico
-- para poder apuntar también a acciones), así que nada impediría borrar el caso
-- y dejar su acta huérfana. Es exactamente el agujero que 0119 cerró para
-- indicadores y objetivos.
-- ----------------------------------------------------------------------------
create or replace function public.work_case_deletion_verdict(p_case_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_case     work_cases;
  v_blocking jsonb := '[]'::jsonb;
  v_n        integer;
begin
  select * into v_case from work_cases where id = p_case_id;
  if v_case.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Este caso no existe.', 'blocking', '[]'::jsonb);
  end if;

  if v_case.classification <> 'pending' then
    v_blocking := v_blocking || jsonb_build_object(
      'label', 'evaluación registrada', 'count', 1);
  end if;
  if v_case.status <> 'draft' then
    v_blocking := v_blocking || jsonb_build_object(
      'label', 'ya salió del borrador', 'count', 1);
  end if;

  select count(*) into v_n from work_decisions
   where subject_kind = 'case' and subject_id = p_case_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'decisión registrada' else 'decisiones registradas' end,
      'count', v_n);
  end if;

  select count(*) into v_n from work_case_findings where case_id = p_case_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'hallazgo' else 'hallazgos' end, 'count', v_n);
  end if;

  select count(*) into v_n from work_case_causes where case_id = p_case_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'análisis de causa' else 'análisis de causa' end, 'count', v_n);
  end if;

  select count(*) into v_n from work_references
   where owner_kind = 'action' and ref_kind = 'work_case' and ref_id = p_case_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'acción planificada' else 'acciones planificadas' end, 'count', v_n);
  end if;

  if jsonb_array_length(v_blocking) = 0 then
    return jsonb_build_object('can_hard_delete', true, 'reason_code', 'disposable',
      'reason', 'Este caso sigue en borrador y no ha dejado historia: puede eliminarse.',
      'blocking', '[]'::jsonb);
  end if;

  return jsonb_build_object('can_hard_delete', false, 'reason_code', 'has_history',
    'reason', 'Este caso ya tiene historia y debe conservarse.',
    'blocking', v_blocking,
    'alternative', 'close',
    'alternative_label', 'Ciérralo cuando el ciclo termine: quedará consultable');
end;
$$;
revoke all on function public.work_case_deletion_verdict(uuid) from public, anon, authenticated;

/** Una acción con ejecución o decisiones tampoco se destruye. */
create or replace function public.work_action_deletion_verdict(p_action_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_action   work_actions;
  v_blocking jsonb := '[]'::jsonb;
  v_n        integer;
begin
  select * into v_action from work_actions where id = p_action_id;
  if v_action.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Esta acción no existe.', 'blocking', '[]'::jsonb);
  end if;

  if v_action.status <> 'planned' then
    v_blocking := v_blocking || jsonb_build_object(
      'label', 'ya salió de planificada', 'count', 1);
  end if;

  select count(*) into v_n from work_action_verifications where action_id = p_action_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'verificación de eficacia' else 'verificaciones de eficacia' end,
      'count', v_n);
  end if;

  select count(*) into v_n from work_decisions
   where subject_kind = 'action' and subject_id = p_action_id
     and decision_kind <> 'action_planned';
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'decisión registrada' else 'decisiones registradas' end,
      'count', v_n);
  end if;

  if jsonb_array_length(v_blocking) = 0 then
    return jsonb_build_object('can_hard_delete', true, 'reason_code', 'disposable',
      'reason', 'Esta acción sigue planificada y no se ha ejecutado: puede eliminarse.',
      'blocking', '[]'::jsonb);
  end if;

  return jsonb_build_object('can_hard_delete', false, 'reason_code', 'has_history',
    'reason', 'Esta acción ya tiene historia y debe conservarse.',
    'blocking', v_blocking,
    'alternative', 'cancel',
    'alternative_label', 'Cancélala con motivo si ya no procede');
end;
$$;
revoke all on function public.work_action_deletion_verdict(uuid) from public, anon, authenticated;

create or replace function public.work_guard_hard_delete()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_verdict jsonb;
  v_reason  text;
  v_parts   text := '';
  v_item    jsonb;
begin
  v_verdict := case tg_argv[0]
    when 'case'   then work_case_deletion_verdict(old.id)
    when 'action' then work_action_deletion_verdict(old.id)
  end;

  if coalesce((v_verdict->>'can_hard_delete')::boolean, false) then
    return old;
  end if;

  v_reason := coalesce(v_verdict->>'reason', 'Este registro no puede eliminarse.');
  for v_item in select * from jsonb_array_elements(coalesce(v_verdict->'blocking', '[]'::jsonb)) loop
    v_parts := v_parts || case when v_parts = '' then '' else ', ' end
            || (v_item->>'count') || ' ' || (v_item->>'label');
  end loop;
  if v_parts <> '' then v_reason := v_reason || ' Tiene ' || v_parts || '.'; end if;
  if v_verdict->>'alternative_label' is not null then
    v_reason := v_reason || ' ' || (v_verdict->>'alternative_label') || '.';
  end if;

  raise exception '%', v_reason;
end;
$$;
revoke all on function public.work_guard_hard_delete() from public, anon, authenticated;

create trigger work_cases_guard_delete
  before delete on public.work_cases
  for each row execute function public.work_guard_hard_delete('case');

create trigger work_actions_guard_delete
  before delete on public.work_actions
  for each row execute function public.work_guard_hard_delete('action');

-- El despachador de 0119/0120 aprende dos entidades mas, para que la aplicacion
-- siga preguntando por una sola puerta.
create or replace function public.quality_deletion_eligibility(p_entity text, p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_org  uuid;
  v_none jsonb := jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
                                     'reason', 'Este registro no existe.', 'blocking', '[]'::jsonb);
begin
  if auth.uid() is null then return v_none; end if;

  v_org := case p_entity
    when 'indicator' then (select organization_id from quality_indicators where id = p_id)
    when 'objective' then (select organization_id from quality_objectives where id = p_id)
    when 'position'  then (select organization_id from quality_positions  where id = p_id)
    when 'document'  then (select organization_id from trazadoc_documents where id = p_id)
    when 'process'   then (select organization_id from quality_processes  where id = p_id)
    when 'case'      then (select organization_id from work_cases         where id = p_id)
    when 'action'    then (select organization_id from work_actions       where id = p_id)
  end;

  if v_org is null or not is_org_member(v_org) then return v_none; end if;

  return case p_entity
    when 'indicator' then quality_indicator_deletion_verdict(p_id)
    when 'objective' then quality_objective_deletion_verdict(p_id)
    when 'position'  then quality_position_deletion_verdict(p_id)
    when 'document'  then trazadoc_document_deletion_verdict(p_id)
    when 'process'   then quality_process_deletion_verdict(p_id)
    when 'case'      then work_case_deletion_verdict(p_id)
    when 'action'    then work_action_deletion_verdict(p_id)
  end;
end;
$$;
revoke all on function public.quality_deletion_eligibility(text, uuid) from public, anon;
grant execute on function public.quality_deletion_eligibility(text, uuid) to authenticated;
