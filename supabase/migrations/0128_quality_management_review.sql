-- ============================================================================
-- 0128_quality_management_review.sql · Sprint QUALITY-10
-- REVISIÓN POR LA DIRECCIÓN · ENTRADAS · ANÁLISIS · DECISIONES · SALIDAS
-- ============================================================================
-- Append-only. No edita ninguna migración anterior, no repara historial y no
-- siembra datos de negocio.
--
-- QUÉ ES ESTE DOMINIO
--
-- El punto de convergencia del sistema de gestión. Todo lo que QUALITY-01…09
-- construyó —procesos, objetivos, indicadores, documentos, personas, casos,
-- hallazgos, no conformidades, acciones, eficacia, riesgos, oportunidades,
-- proveedores, voz del cliente y auditorías— entra aquí como ENTRADA, se
-- analiza, y sale convertido en DECISIONES de la dirección.
--
-- LAS SIETE SEPARACIONES QUE SOSTIENEN EL MODELO
--
--   REVISIÓN POR LA DIRECCIÓN ≠ TABLERO
--     Un tablero dice «ahora». La revisión registra qué miró la dirección, qué
--     concluyó y qué decidió. Reimprimir la revisión de 2027 en 2029 devuelve
--     2027.
--
--   ENTRADA ≠ DECISIÓN
--     La entrada es lo que se puso delante. La decisión es lo que alguien
--     resolvió. Confundirlas produce actas donde nadie decidió nada.
--
--   DATO ≠ CONCLUSIÓN
--     El dato viene de su dominio y no se toca desde aquí. La conclusión la
--     escribe una persona, al lado, sin sustituirlo.
--
--   DECISIÓN ≠ ACCIÓN
--     «Aumentar la capacidad de inspección» es una decisión. Comprar el equipo,
--     capacitar al inspector y actualizar el procedimiento son tres acciones.
--     Una decisión puede generar 0..N acciones, y sigue siendo UNA decisión.
--
--   ACCIÓN ≠ TAREA
--     La acción vive en el motor transversal con su eficacia. La tarea es el
--     recordatorio de trabajo. No se duplica ninguno de los dos.
--
--   ACTA ≠ BITÁCORA TÉCNICA
--     El acta se DERIVA de la revisión, sus entradas, su análisis, sus
--     decisiones y sus participantes. No es un volcado de `audit_log`.
--
--   ESTADO ACTUAL ≠ RETRATO HISTÓRICO
--     Un indicador que en 2027 estaba en 82 sobre una meta de 95 sigue
--     diciendo 82/95 en la revisión de 2027, aunque en 2028 vaya por 90 sobre
--     una meta de 98.
--
-- LO QUE NO SE CONSTRUYE AQUÍ
--
--   · Un segundo motor de acciones — se reusa `work_actions` (RD-19).
--   · Un segundo motor documental — se reusa TrazaDocs.
--   · Un segundo motor de tareas o avisos — se reusan `work_tasks`/`work_alerts`.
--   · Un módulo financiero — la adecuación de recursos se REGISTRA, no se
--     presupuesta.
--   · Inteligencia artificial — RD-10: la IA no concluye, no decide, no crea
--     acciones y no aprueba actas. Eso es QUALITY-12.
--
-- QUALITY-04 ya había anticipado este dominio en 0121: `work_cases.origin_kind`
-- incluye `'management_review'` desde entonces. Se usa tal cual.
-- ============================================================================


-- ============================================================================
-- 1 · EL CATÁLOGO DE ENTRADAS (§13, §14, RD-02)
-- ----------------------------------------------------------------------------
-- Catorce entradas, una por cada cosa que una revisión por la dirección tiene
-- que mirar. Es un catálogo GLOBAL, no por empresa: si cada organización
-- pudiera inventarse las suyas, «revisamos todo» dejaría de significar nada y
-- dos revisiones no serían comparables.
--
-- §14 · TIPO DE ENTRADA ≠ VALOR DE LA ENTRADA. El catálogo dice QUÉ hay que
-- mirar. La instancia —`quality_management_review_inputs`— dice qué se vio esa
-- vez, en ese periodo, con ese dato. Catorce columnas gigantes en la revisión
-- habrían hecho imposible añadir la decimoquinta.
-- ============================================================================

create table public.quality_management_review_input_catalog (
  code            text primary key,
  label           text not null,
  description     text not null,
  -- El dominio del que sale sola. `null` = la escribe una persona (§16).
  source_domain   text,
  is_required     boolean not null default true,
  position_order  integer not null,

  check (source_domain is null or source_domain in
    ('actions', 'documents', 'system', 'customer', 'objectives', 'processes',
     'product', 'cases', 'indicators', 'audits', 'suppliers', 'people',
     'risks', 'improvement'))
);

comment on table public.quality_management_review_input_catalog is
  'QUALITY-10 · §13 · Las catorce entradas que una revisión por la dirección tiene que mirar. Global a propósito: si cada empresa se inventara las suyas, dos revisiones no serían comparables.';

insert into public.quality_management_review_input_catalog
  (code, label, description, source_domain, is_required, position_order)
values
  ('previous_actions',
   'Estado de las acciones de revisiones anteriores',
   'Qué se decidió la vez pasada y en qué quedó. Se lee del motor de acciones, no se vuelve a teclear.',
   'actions', true, 1),
  ('changes',
   'Cambios relevantes internos y externos',
   'Lo que cambió alrededor del sistema: contexto, regulación, mercado, estructura, tecnología. En buena parte lo aporta la dirección.',
   'documents', true, 2),
  ('system_performance',
   'Desempeño y eficacia del sistema de gestión',
   'La foto de conjunto: qué se midió, qué se auditó, qué se abrió y qué se cerró en el periodo.',
   'system', true, 3),
  ('customer_voice',
   'Satisfacción del cliente y retroalimentación',
   'Lo que dijeron los clientes. Siempre agregado: el anonimato de las campañas anónimas no se rompe aquí.',
   'customer', true, 4),
  ('objectives',
   'Grado de cumplimiento de los objetivos de calidad',
   'Los objetivos vigentes en el periodo y cómo les fue, con sus indicadores.',
   'objectives', true, 5),
  ('process_performance',
   'Desempeño de los procesos',
   'Cada proceso con lo que de verdad se sabe de él: indicadores, objetivos, casos, riesgos y auditorías.',
   'processes', true, 6),
  ('product_conformity',
   'Conformidad de los productos y servicios',
   'Salidas no conformes registradas en el periodo. Si la plataforma no tiene ese dato, se dice, no se inventa.',
   'product', true, 7),
  ('nonconformities_actions',
   'No conformidades y acciones correctivas',
   'Casos, hallazgos, no conformidades, correcciones, acciones y eficacia, separados y sin colapsar en «incidentes».',
   'cases', true, 8),
  ('monitoring_results',
   'Resultados de seguimiento y medición',
   'Las mediciones del periodo, con su estado de dato: medido, no disponible o no aplica.',
   'indicators', true, 9),
  ('audits',
   'Resultados de auditorías',
   'Programa, cobertura, ejecutadas, hallazgos, escaladas y seguimientos. Hallazgo ≠ no conformidad, también aquí.',
   'audits', true, 10),
  ('supplier_performance',
   'Desempeño de los proveedores externos',
   'Criticidad, evaluaciones, aprobaciones, reevaluaciones vencidas e incidentes. No «buenos y malos».',
   'suppliers', true, 11),
  ('resources_adequacy',
   'Adecuación de los recursos',
   'Personas, infraestructura, tecnología, conocimiento y capacidad. Lo cuantitativo se lee; lo suficiente lo juzga la dirección.',
   'people', true, 12),
  ('risk_action_effectiveness',
   'Eficacia de las acciones frente a riesgos y oportunidades',
   'Riesgos por encima del criterio aceptable, materializaciones, controles y oportunidades tratadas.',
   'risks', true, 13),
  ('improvement_opportunities',
   'Oportunidades de mejora',
   'Lo que el periodo dejó sobre la mesa: de auditorías, de clientes, de proveedores, de procesos y de la propia dirección.',
   'improvement', true, 14)
on conflict (code) do nothing;

revoke all on table public.quality_management_review_input_catalog from anon, authenticated;
grant select on table public.quality_management_review_input_catalog to authenticated;


-- ============================================================================
-- 2 · LA REVISIÓN (§6, §7, §10, §12, RD-01, RD-11)
-- ----------------------------------------------------------------------------
-- §7 · REVISIÓN ≠ REUNIÓN. Una revisión se prepara durante semanas y suele
-- terminar en una sesión formal. Modelarla como «una reunión de dos horas»
-- obliga a inventar la fecha de reunión antes de haber preparado nada, y a
-- perder todo el trabajo previo. Por eso la sesión son tres columnas de esta
-- misma fila —`session_held_on`, `session_location`, `session_note`— y no una
-- tabla que compita con la revisión por ser «lo importante».
--
-- RD-01 · La frecuencia es configurable: nada aquí obliga a que sea anual.
-- RD-11 · Completa, extraordinaria y temática son las tres naturalezas.
-- ============================================================================

create table public.quality_management_reviews (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  code              text not null,
  title             text not null,
  review_kind       text not null default 'full',

  -- §10 · Qué periodo analiza. Los adaptadores automáticos lo respetan: no
  -- muestran «el estado de hoy» disfrazado de resultado del periodo.
  period_label      text not null,
  period_start      date not null,
  period_end        date not null,

  status            text not null default 'draft',

  -- §8 · La responsabilidad persistente es del CARGO (MDR-33). Quién ocupaba
  -- ese cargo aquel día se lee en los participantes, que sí guardan la persona.
  owner_position_id uuid,

  -- §7 · La sesión formal, cuando la hay.
  session_held_on   date,
  session_location  text,
  session_note      text,
  agenda_note       text,

  scope_note        text,

  -- §38 · La conclusión general la escribe una persona. Nadie la deduce.
  conclusions       text,
  conclusions_at    timestamptz,

  -- §48 · El cierre.
  closure_note      text,
  closed_at         timestamptz,
  closed_by         uuid references public.profiles (id),

  -- §45 · Lo que quedaba abierto AL CERRAR, dicho por quien cerró. El estado
  -- vivo de esas acciones se lee aparte, del motor de acciones.
  followup_note     text,

  -- §46 · La próxima revisión. La frecuencia la decide la organización.
  next_review_planned_on date,
  next_review_note  text,

  -- §47 · Reabrir es excepcional y deja constancia. Nunca borra el cierre.
  reopened_at       timestamptz,
  reopened_by       uuid references public.profiles (id),
  reopen_reason     text,
  reopen_count      integer not null default 0,

  cancelled_at      timestamptz,
  cancel_reason     text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_management_reviews_org_id_uniq unique (organization_id, id),
  constraint quality_management_reviews_code_uniq unique (organization_id, code),
  constraint quality_management_reviews_kind_check
    check (review_kind in ('full', 'extraordinary', 'thematic')),
  constraint quality_management_reviews_status_check
    check (status in ('draft', 'preparing', 'ready_for_review', 'in_review',
                      'closed', 'cancelled')),
  constraint quality_management_reviews_period_check
    check (period_end >= period_start),
  constraint quality_management_reviews_closed_consistent
    check ((status = 'closed') = (closed_at is not null)),
  constraint quality_management_reviews_closure_note_check
    check (status <> 'closed'
           or nullif(btrim(coalesce(closure_note, '')), '') is not null),
  constraint quality_management_reviews_cancelled_consistent
    check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint quality_management_reviews_cancel_reason_check
    check (status <> 'cancelled'
           or nullif(btrim(coalesce(cancel_reason, '')), '') is not null),
  constraint quality_management_reviews_reopen_consistent
    check (reopened_at is null
           or nullif(btrim(coalesce(reopen_reason, '')), '') is not null),
  constraint quality_management_reviews_owner_position_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete restrict
);

comment on table public.quality_management_reviews is
  'QUALITY-10 · §6/§7 · La revisión por la dirección. NO es una reunión: se prepara durante semanas y termina en una sesión, que son tres columnas de esta fila. Y NO es un tablero: registra qué miró la dirección, qué concluyó y qué decidió.';
comment on column public.quality_management_reviews.period_start is
  '§10 · Qué periodo analiza. Los adaptadores automáticos lo respetan: no muestran el estado de hoy disfrazado de resultado del periodo.';
comment on column public.quality_management_reviews.owner_position_id is
  '§8/MDR-33 · La responsabilidad persistente es del CARGO. La persona que lo ocupaba ese día está en los participantes.';
comment on column public.quality_management_reviews.followup_note is
  '§45 · Lo que quedaba abierto AL CERRAR. El estado vivo de esas acciones se lee del motor de acciones, no de aquí.';

create index quality_management_reviews_org_idx
  on public.quality_management_reviews (organization_id, period_start desc);
create index quality_management_reviews_status_idx
  on public.quality_management_reviews (organization_id, status);

create trigger t_quality_management_reviews_updated
  before update on public.quality_management_reviews
  for each row execute function public.set_updated_at();
create trigger t_quality_management_reviews_org_immutable
  before update on public.quality_management_reviews
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_management_reviews_force_created_by
  before insert on public.quality_management_reviews
  for each row execute function public.force_created_by();
create trigger t_audit_quality_management_reviews
  after insert or update or delete on public.quality_management_reviews
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 3 · PARTICIPANTES (§9, §69, §70)
-- ----------------------------------------------------------------------------
-- §69 · Una persona que participó en la revisión de 2027 sigue apareciendo en
-- ella en 2029, aunque haya dejado la organización. Por eso el participante
-- cuelga de `quality_people` y no de la membresía vigente.
--
-- §70 · Y participó CON UN CARGO. Si en 2027 era Gerente General y en 2028
-- pasa a otra cosa, la revisión de 2027 sigue diciendo Gerente General: el
-- cargo se copia como texto EN EL MOMENTO, no se resuelve al leer.
--
-- §9 · ASISTIR ≠ APROBAR. Esta tabla no tiene ninguna columna de aprobación.
-- Quien cierra la revisión queda en `closed_by`, y es un acto distinto.
-- ============================================================================

create table public.quality_management_review_participants (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  review_id         uuid not null,

  -- Una persona del sistema O alguien de fuera. No las dos.
  person_id         uuid,
  external_name     text,

  participation_role text not null default 'member',

  -- §70 · El cargo de ENTONCES, copiado. No se resuelve al leer.
  position_id       uuid,
  position_name_at_review text,

  attended          boolean not null default true,
  attendance_note   text,
  contribution_note text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),

  constraint quality_mr_participants_org_id_uniq unique (organization_id, id),
  constraint quality_mr_participants_who_check
    check ((person_id is not null)
           <> (nullif(btrim(coalesce(external_name, '')), '') is not null)),
  constraint quality_mr_participants_role_check
    check (participation_role in ('chair', 'secretary', 'member', 'guest',
                                  'invited_expert')),
  constraint quality_mr_participants_review_fk
    foreign key (organization_id, review_id)
    references public.quality_management_reviews (organization_id, id) on delete cascade,
  constraint quality_mr_participants_person_fk
    foreign key (organization_id, person_id)
    references public.quality_people (organization_id, id) on delete restrict,
  constraint quality_mr_participants_position_fk
    foreign key (organization_id, position_id)
    references public.quality_positions (organization_id, id) on delete set null
);

comment on table public.quality_management_review_participants is
  'QUALITY-10 · §9/§69/§70 · Quién participó, con qué papel y CON QUÉ CARGO en ese momento. Asistir no es aprobar: esta tabla no tiene ninguna columna de aprobación.';
comment on column public.quality_management_review_participants.position_name_at_review is
  '§70 · El cargo copiado EN EL MOMENTO. Resolverlo al leer haría que la revisión de 2027 mostrara el cargo de 2029.';

create index quality_mr_participants_review_idx
  on public.quality_management_review_participants (organization_id, review_id);

create trigger t_quality_mr_participants_force_created_by
  before insert on public.quality_management_review_participants
  for each row execute function public.force_created_by();
create trigger t_audit_quality_mr_participants
  after insert or update or delete on public.quality_management_review_participants
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 4 · AGENDA (§33)
-- ----------------------------------------------------------------------------
-- Se prepara a partir de las entradas, y su orden es configurable: no hay un
-- orden universal que sirva a todas las organizaciones. Un punto de agenda
-- puede apuntar a una entrada del catálogo o ser un punto propio.
-- ============================================================================

create table public.quality_management_review_agenda_items (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  review_id         uuid not null,
  position_order    integer not null default 1,

  title             text not null,
  catalog_code      text references public.quality_management_review_input_catalog (code),
  note              text,
  time_label        text,
  presenter_person_id uuid,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_mr_agenda_org_id_uniq unique (organization_id, id),
  constraint quality_mr_agenda_review_fk
    foreign key (organization_id, review_id)
    references public.quality_management_reviews (organization_id, id) on delete cascade,
  constraint quality_mr_agenda_presenter_fk
    foreign key (organization_id, presenter_person_id)
    references public.quality_people (organization_id, id) on delete set null
);

comment on table public.quality_management_review_agenda_items is
  'QUALITY-10 · §33 · La agenda, preparada desde las entradas y con orden configurable. No hay un orden universal que sirva a todas las organizaciones.';

create index quality_mr_agenda_review_idx
  on public.quality_management_review_agenda_items (organization_id, review_id, position_order);

create trigger t_quality_mr_agenda_updated
  before update on public.quality_management_review_agenda_items
  for each row execute function public.set_updated_at();
create trigger t_quality_mr_agenda_force_created_by
  before insert on public.quality_management_review_agenda_items
  for each row execute function public.force_created_by();


-- ============================================================================
-- 5 · LA ENTRADA (§14…§18, §35…§38, §57, RD-04, RD-05)
-- ----------------------------------------------------------------------------
-- Aquí viven las cuatro capas que el dominio existe para no confundir:
--
--   DATO FUENTE      → `snapshot`, `summary`, y el linaje en `work_references`
--   DISCUSIÓN        → `analysis`, que escribe una persona
--   CONCLUSIÓN       → `conclusion`, también humana
--   NECESIDAD DE     → `requires_decision`, que NO es una decisión: es decir
--   DECISIÓN            «esto hay que resolverlo», no haberlo resuelto.
--
-- §37 · El análisis NO modifica el dato fuente. Vive en columnas propias, al
-- lado. Un sistema donde la dirección puede «corregir» el número que le
-- incomoda deja de ser un sistema de gestión.
--
-- §18 · El `snapshot` es el retrato mínimo suficiente. No una copia de la
-- tabla origen: el indicador que en 2027 iba 82 sobre 95 necesita esos dos
-- números y su linaje, no las cuarenta columnas de `quality_indicators`.
--
-- §36 · FALTANTE ≠ CERO. Si no hubo campaña de satisfacción en el periodo, el
-- estado es `missing` y el resumen lo dice. Escribir «satisfacción = 0» sería
-- afirmar un mal resultado donde no hubo medición.
--
-- §35 · NO APLICA ≠ FALTANTE. `not_applicable` exige razón escrita.
-- ============================================================================

create table public.quality_management_review_inputs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  review_id         uuid not null,
  catalog_code      text not null
                    references public.quality_management_review_input_catalog (code),

  -- §16 · Automática (la reúne la plataforma) o manual (la aporta la
  -- dirección). No todo sale de la base, y forzarlo produce entradas falsas.
  input_mode        text not null default 'automatic',

  state             text not null default 'pending',
  not_applicable_reason text,

  -- ------------------------------------------------------------------------
  -- DATO FUENTE
  -- ------------------------------------------------------------------------
  snapshot          jsonb,
  summary           text,

  -- §15 · Ningún dato sin origen.
  source_domain     text,
  source_period_start date,
  source_period_end   date,
  prepared_at       timestamptz,
  prepared_by       uuid references public.profiles (id),
  -- §57 · La huella del dato que se preparó. Comparar la huella de hoy con
  -- esta es lo que permite decir FUENTE ACTUALIZADA sin sustituir nada.
  source_fingerprint text,

  -- ------------------------------------------------------------------------
  -- ANÁLISIS HUMANO — separado, y nunca sobrescrito por un refresco
  -- ------------------------------------------------------------------------
  analysis          text,
  analysis_at       timestamptz,
  analysis_by       uuid references public.profiles (id),
  conclusion        text,
  requires_decision boolean not null default false,

  position_order    integer not null default 1,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_mr_inputs_org_id_uniq unique (organization_id, id),
  -- Una instancia por tipo de entrada y revisión. Lo que varía por dentro es
  -- el contenido, no la cantidad de filas.
  constraint quality_mr_inputs_one_per_type unique (organization_id, review_id, catalog_code),
  constraint quality_mr_inputs_mode_check
    check (input_mode in ('automatic', 'manual')),
  constraint quality_mr_inputs_state_check
    check (state in ('pending', 'prepared', 'reviewed', 'not_applicable', 'missing')),
  -- §35 · No aplica exige razón. Sin ella, «no aplica» es una forma elegante
  -- de no haber mirado.
  constraint quality_mr_inputs_na_reason_check
    check (state <> 'not_applicable'
           or nullif(btrim(coalesce(not_applicable_reason, '')), '') is not null),
  -- §15 · Un dato preparado sabe de dónde vino y de qué periodo.
  constraint quality_mr_inputs_lineage_check
    check (state not in ('prepared', 'reviewed')
           or (prepared_at is not null and source_period_start is not null)),
  constraint quality_mr_inputs_analysis_consistent
    check ((analysis_at is null) = (nullif(btrim(coalesce(analysis, '')), '') is null)),
  constraint quality_mr_inputs_review_fk
    foreign key (organization_id, review_id)
    references public.quality_management_reviews (organization_id, id) on delete cascade
);

comment on table public.quality_management_review_inputs is
  'QUALITY-10 · §14/§37 · La INSTANCIA de una entrada: qué se vio esa vez, de qué periodo y con qué dato. El análisis humano vive en columnas propias, al lado del dato, y jamás lo sobrescribe.';
comment on column public.quality_management_review_inputs.snapshot is
  '§18 · El retrato MÍNIMO suficiente del dato en el momento de prepararlo. No una copia de la tabla origen.';
comment on column public.quality_management_review_inputs.source_fingerprint is
  '§57 · La huella del dato preparado. Comparar la huella de hoy con esta es lo que permite avisar FUENTE ACTUALIZADA sin sustituir nada.';
comment on column public.quality_management_review_inputs.state is
  '§35/§36 · `missing` no es cero y `not_applicable` no es faltante. Escribir 0 donde no hubo medición afirmaría un mal resultado inexistente.';
comment on column public.quality_management_review_inputs.requires_decision is
  '§38 · Decir «esto hay que resolverlo» NO es haberlo resuelto. La decisión es otro objeto.';

create index quality_mr_inputs_review_idx
  on public.quality_management_review_inputs (organization_id, review_id, position_order);
create index quality_mr_inputs_state_idx
  on public.quality_management_review_inputs (organization_id, state);

create trigger t_quality_mr_inputs_updated
  before update on public.quality_management_review_inputs
  for each row execute function public.set_updated_at();
create trigger t_quality_mr_inputs_org_immutable
  before update on public.quality_management_review_inputs
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_mr_inputs_force_created_by
  before insert on public.quality_management_review_inputs
  for each row execute function public.force_created_by();
create trigger t_audit_quality_mr_inputs
  after insert or update or delete on public.quality_management_review_inputs
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 6 · ENTRADAS MANUALES ESTRUCTURADAS (§17, §30, §31)
-- ----------------------------------------------------------------------------
-- No todo sale de la base. Un cambio regulatorio, una decisión corporativa o
-- una necesidad de recursos que nadie registró en otro dominio los aporta la
-- dirección — y tienen que quedar con autor y fecha, no como texto suelto.
--
-- §17 · Y tienen que decir QUE SON ENTRADA MANUAL. Convertir cualquier texto
-- en «evidencia objetiva» es exactamente lo que hace que un acta no valga.
--
-- §30 · La adecuación de recursos se REGISTRA aquí: personas, infraestructura,
-- tecnología, presupuesto, conocimiento, capacidad. No se construye un módulo
-- financiero para eso.
-- ============================================================================

create table public.quality_management_review_manual_entries (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  review_id         uuid not null,
  input_id          uuid not null,

  entry_kind        text not null,
  -- Solo para las de recursos (§30).
  resource_kind     text,

  title             text not null,
  body              text not null,

  -- §17 · Autor y fecha, siempre. Y se marca como aportación humana.
  recorded_by       uuid references public.profiles (id),
  recorded_on       date not null default current_date,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_mr_manual_org_id_uniq unique (organization_id, id),
  constraint quality_mr_manual_kind_check
    check (entry_kind in ('change_internal', 'change_external', 'regulatory',
                          'strategic', 'resource_need', 'improvement_opportunity',
                          'context', 'other')),
  constraint quality_mr_manual_resource_kind_check
    check (resource_kind is null or resource_kind in
      ('people', 'infrastructure', 'technology', 'budget', 'knowledge', 'capacity')),
  constraint quality_mr_manual_review_fk
    foreign key (organization_id, review_id)
    references public.quality_management_reviews (organization_id, id) on delete cascade,
  constraint quality_mr_manual_input_fk
    foreign key (organization_id, input_id)
    references public.quality_management_review_inputs (organization_id, id) on delete cascade
);

comment on table public.quality_management_review_manual_entries is
  'QUALITY-10 · §17/§30/§31 · Lo que aporta la dirección y no sale de ningún dominio. Con autor y fecha, y marcado como entrada MANUAL: convertir cualquier texto en evidencia objetiva es lo que hace que un acta no valga.';

create index quality_mr_manual_input_idx
  on public.quality_management_review_manual_entries (organization_id, input_id);

create trigger t_quality_mr_manual_updated
  before update on public.quality_management_review_manual_entries
  for each row execute function public.set_updated_at();
create trigger t_audit_quality_mr_manual
  after insert or update or delete on public.quality_management_review_manual_entries
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 7 · LA DECISIÓN (§39, §40, §41, RD-05, RD-06)
-- ----------------------------------------------------------------------------
-- §39 · Una decisión de la dirección es un OBJETO HISTÓRICO, no una línea de
-- bitácora. Conserva tema, decisión, fundamento, actor, fecha, referencias y
-- —cuando aplica— el resultado esperado. Sustituirla por `audit_log` sería
-- cambiar historia de negocio por trazas técnicas.
--
-- §41 · DECISIÓN ≠ ACCIÓN. «Aumentar la capacidad de inspección del proveedor
-- crítico» es UNA decisión; comprar el equipo, capacitar al inspector y
-- actualizar el procedimiento son TRES acciones. Esta tabla no tiene ninguna
-- columna de acción: las acciones viven en `work_actions` y se atan por
-- `work_references`.
-- ============================================================================

create table public.quality_management_review_decisions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  review_id         uuid not null,
  code              text not null,

  -- §40 · Las salidas que una revisión tiene que poder producir.
  decision_kind     text not null default 'other',

  topic             text not null,
  decision          text not null,
  rationale         text,
  expected_result   text,

  -- La entrada que la motivó, cuando la hubo.
  input_id          uuid,

  owner_position_id uuid,

  -- §39 · El actor histórico, siempre.
  decided_by        uuid references public.profiles (id),
  decided_on        date not null default current_date,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_mr_decisions_org_id_uniq unique (organization_id, id),
  constraint quality_mr_decisions_code_uniq unique (organization_id, review_id, code),
  constraint quality_mr_decisions_kind_check
    check (decision_kind in ('improvement', 'system_change', 'resource',
                             'strategic', 'objective', 'risk', 'opportunity',
                             'followup', 'other')),
  constraint quality_mr_decisions_review_fk
    foreign key (organization_id, review_id)
    references public.quality_management_reviews (organization_id, id) on delete cascade,
  constraint quality_mr_decisions_input_fk
    foreign key (organization_id, input_id)
    references public.quality_management_review_inputs (organization_id, id) on delete set null,
  constraint quality_mr_decisions_owner_position_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete restrict
);

comment on table public.quality_management_review_decisions is
  'QUALITY-10 · §39/§41 · La decisión como OBJETO HISTÓRICO. No tiene ninguna columna de acción: una decisión puede generar 0..N acciones, y las acciones viven en el motor transversal.';
comment on column public.quality_management_review_decisions.expected_result is
  '§39 · Qué se espera que ocurra. No es la acción que lo consigue.';

create index quality_mr_decisions_review_idx
  on public.quality_management_review_decisions (organization_id, review_id);

create trigger t_quality_mr_decisions_updated
  before update on public.quality_management_review_decisions
  for each row execute function public.set_updated_at();
create trigger t_quality_mr_decisions_org_immutable
  before update on public.quality_management_review_decisions
  for each row execute function public.prevent_organization_id_change();
create trigger t_audit_quality_mr_decisions
  after insert or update or delete on public.quality_management_review_decisions
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 8 · NOTAS DE SESIÓN (§51)
-- ----------------------------------------------------------------------------
-- Pueden existir. Pero el ACTA formal no es un volcado de notas: se deriva del
-- modelo. Estas notas acompañan, no sustituyen.
-- ============================================================================

create table public.quality_management_review_notes (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  review_id         uuid not null,
  body              text not null,
  recorded_on       date not null default current_date,
  recorded_by       uuid references public.profiles (id),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_mr_notes_org_id_uniq unique (organization_id, id),
  constraint quality_mr_notes_review_fk
    foreign key (organization_id, review_id)
    references public.quality_management_reviews (organization_id, id) on delete cascade
);

comment on table public.quality_management_review_notes is
  'QUALITY-10 · §51 · Notas complementarias de la sesión. El acta formal NO sale de aquí: se deriva de la revisión, sus entradas, su análisis y sus decisiones.';

create index quality_mr_notes_review_idx
  on public.quality_management_review_notes (organization_id, review_id);

create trigger t_quality_mr_notes_updated
  before update on public.quality_management_review_notes
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 9 · EL ACTA (§50, §75, RD-07, RD-18)
-- ----------------------------------------------------------------------------
-- §50 · Se DERIVA de la revisión, sus entradas, su análisis, sus decisiones,
-- sus salidas y sus participantes. Y se congela: el acta de 2027 reimpresa en
-- 2029 devuelve 2027.
--
-- RD-18 · Un acta emitida es una revisión de documento controlado. Cuando la
-- organización quiere pasarla por TrazaDocs, `document_revision_id` la ata a
-- la revisión documental correspondiente. No se construye un segundo flujo
-- documental para conseguir eso.
--
-- Sin política de UPDATE ni de DELETE: una corrección es un acta NUEVA que
-- apunta a la anterior, y las dos se conservan.
-- ============================================================================

create table public.quality_management_review_minutes (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  review_id         uuid not null,
  version_number    integer not null default 1,

  issued_on         date not null default current_date,
  issued_by         uuid references public.profiles (id),
  summary           text,

  -- El retrato completo de lo que el acta dice.
  snapshot          jsonb not null,

  supersedes_id     uuid,
  correction_note   text,

  -- RD-18 · La atadura opcional al documento controlado.
  document_id           uuid,
  document_revision_id  uuid,

  created_at        timestamptz not null default now(),

  constraint quality_mr_minutes_org_id_uniq unique (organization_id, id),
  constraint quality_mr_minutes_version_uniq unique (organization_id, review_id, version_number),
  constraint quality_mr_minutes_review_fk
    foreign key (organization_id, review_id)
    references public.quality_management_reviews (organization_id, id) on delete cascade,
  constraint quality_mr_minutes_supersedes_fk
    foreign key (organization_id, supersedes_id)
    references public.quality_management_review_minutes (organization_id, id) on delete set null,
  constraint quality_mr_minutes_document_fk
    foreign key (organization_id, document_id)
    references public.trazadoc_documents (organization_id, id) on delete set null,
  constraint quality_mr_minutes_revision_fk
    foreign key (organization_id, document_revision_id)
    references public.trazadoc_document_revisions (organization_id, id) on delete set null
);

comment on table public.quality_management_review_minutes is
  'QUALITY-10 · §50/RD-07/RD-18 · El acta, DERIVADA del modelo y congelada. Una corrección es un acta nueva que apunta a la anterior: las dos se conservan. `document_revision_id` la ata a TrazaDocs cuando la organización la quiere controlada.';

create index quality_mr_minutes_review_idx
  on public.quality_management_review_minutes (organization_id, review_id, version_number desc);


-- ============================================================================
-- 10 · EL MOTOR TRANSVERSAL SE AMPLÍA; NO SE DUPLICA (§42, §43, §44, RD-19)
-- ----------------------------------------------------------------------------
-- Ninguna tabla nueva de acciones, tareas, avisos, decisiones técnicas ni
-- referencias. Se amplían los catálogos que ya existen, siempre soltando la
-- restricción y volviéndola a poner con el conjunto anterior MÁS lo nuevo.
-- ============================================================================

alter table public.work_tasks  drop constraint work_tasks_source_domain_check;
alter table public.work_tasks  add constraint work_tasks_source_domain_check
  check (source_domain in ('document', 'indicator', 'objective', 'case', 'action',
                           'risk', 'opportunity', 'control',
                           'person', 'position', 'competence', 'development',
                           'learning', 'performance', 'knowledge', 'lesson',
                           'supplier', 'customer', 'audit', 'management_review'));
alter table public.work_tasks  drop constraint work_tasks_subject_type_check;
alter table public.work_tasks  add constraint work_tasks_subject_type_check
  check (subject_type in ('trazadoc_document', 'quality_indicator', 'quality_objective',
                          'work_case', 'work_action',
                          'quality_risk', 'quality_opportunity', 'quality_control',
                          'quality_person', 'quality_position', 'quality_person_competency',
                          'quality_competency_evidence', 'quality_development_plan_item',
                          'quality_learning_activity', 'quality_performance_evaluation',
                          'quality_knowledge_item', 'quality_knowledge_transfer_plan',
                          'quality_lesson_learned',
                          'quality_supplier_profile', 'quality_supplier_scope',
                          'quality_supplier_evaluation', 'quality_supplier_document',
                          'quality_customer_profile', 'quality_survey_campaign',
                          'quality_customer_feedback', 'quality_customer_voice_review',
                          'quality_audit_program', 'quality_audit', 'quality_audit_finding',
                          'quality_management_review', 'quality_management_review_input',
                          'quality_management_review_decision'));
alter table public.work_tasks  drop constraint work_tasks_type_check;
alter table public.work_tasks  add constraint work_tasks_type_check
  check (task_type in ('document_review','document_approval','document_changes_requested',
                       'indicator_measurement_due','indicator_off_target',
                       'case_evaluation','case_closure','action_execution','action_effectiveness',
                       'risk_review_due','risk_assessment_due','risk_treatment_approval',
                       'control_verification','opportunity_review',
                       'competence_evidence_renewal','competence_assessment_due',
                       'performance_evaluation_due','development_item_execution',
                       'learning_effectiveness_review','knowledge_transfer_execution',
                       'knowledge_continuity_review','lesson_proposal_decision',
                       'supplier_reevaluation_due','supplier_evaluation_completion',
                       'supplier_approval_review','supplier_document_renewal',
                       'supplier_criticality_review',
                       'complaint_review','campaign_closing_review',
                       'customer_signal_review','customer_voice_review_due',
                       'audit_preparation','audit_plan_review','audit_execution',
                       'audit_report_issue','audit_finding_evaluation','audit_followup',
                       -- QUALITY-10 · §43 · Preparar y seguir son TAREAS. Una
                       -- decisión NO se convierte en tarea sola: eso llenaría
                       -- la bandeja de recordatorios que nadie pidió.
                       'management_review_preparation','management_review_input',
                       'management_review_analysis','management_review_closure',
                       'management_review_action_followup'));

alter table public.work_alerts drop constraint work_alerts_source_domain_check;
alter table public.work_alerts add constraint work_alerts_source_domain_check
  check (source_domain in ('document', 'indicator', 'objective', 'case', 'action',
                           'risk', 'opportunity', 'control',
                           'person', 'position', 'competence', 'development',
                           'learning', 'performance', 'knowledge', 'lesson',
                           'supplier', 'customer', 'audit', 'management_review'));
alter table public.work_alerts drop constraint work_alerts_subject_type_check;
alter table public.work_alerts add constraint work_alerts_subject_type_check
  check (subject_type in ('trazadoc_document', 'quality_indicator', 'quality_objective',
                          'work_case', 'work_action',
                          'quality_risk', 'quality_opportunity', 'quality_control',
                          'quality_person', 'quality_position', 'quality_person_competency',
                          'quality_competency_evidence', 'quality_development_plan_item',
                          'quality_learning_activity', 'quality_performance_evaluation',
                          'quality_knowledge_item', 'quality_knowledge_transfer_plan',
                          'quality_lesson_learned',
                          'quality_supplier_profile', 'quality_supplier_scope',
                          'quality_supplier_evaluation', 'quality_supplier_document',
                          'quality_customer_profile', 'quality_survey_campaign',
                          'quality_customer_feedback', 'quality_customer_voice_review',
                          'quality_audit_program', 'quality_audit', 'quality_audit_finding',
                          'quality_management_review', 'quality_management_review_input',
                          'quality_management_review_decision'));
alter table public.work_alerts drop constraint work_alerts_type_check;
alter table public.work_alerts add constraint work_alerts_type_check
  check (alert_type in ('document_review_requested','document_approval_requested',
                        'document_changes_requested','document_approved','document_retired',
                        'indicator_measurement_due','indicator_target_missed','objective_at_risk',
                        'case_assigned','action_assigned','action_overdue','effectiveness_due',
                        'risk_review_overdue','risk_above_appetite','risk_materialized',
                        'control_ineffective','opportunity_assigned',
                        'competence_evidence_expiring','competence_evidence_expired',
                        'performance_evaluation_pending','development_plan_overdue',
                        'learning_effectiveness_pending','knowledge_single_holder',
                        'knowledge_transfer_overdue','critical_position_vacant',
                        'supplier_reevaluation_overdue','supplier_approval_expiring',
                        'supplier_approval_expired','supplier_document_expiring',
                        'supplier_document_expired','supplier_critical_unapproved',
                        'supplier_incident_streak',
                        'complaint_unreviewed','campaign_closing_soon',
                        'campaign_low_response','satisfaction_drop',
                        'customer_signal_raised','voice_review_due',
                        'audit_upcoming','audit_overdue','audit_report_pending',
                        'audit_finding_unevaluated','audit_independence_conflict',
                        'audit_program_coverage_gap',
                        -- QUALITY-10 · §44 · Ninguno concluye, decide ni cierra
                        -- nada: dicen que hay algo que mirar.
                        'management_review_due','management_review_overdue',
                        'management_review_input_pending','management_review_source_updated',
                        'management_review_action_overdue','management_review_followup_pending'));

alter table public.work_events drop constraint work_events_source_domain_check;
alter table public.work_events add constraint work_events_source_domain_check
  check (source_domain in ('document', 'indicator', 'objective', 'case', 'action',
                           'risk', 'opportunity', 'control',
                           'person', 'position', 'competence', 'development',
                           'learning', 'performance', 'knowledge', 'lesson',
                           'supplier', 'customer', 'audit', 'management_review'));
alter table public.work_events drop constraint work_events_subject_type_check;
alter table public.work_events add constraint work_events_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                          'work_case','work_action',
                          'quality_risk','quality_opportunity','quality_control',
                          'quality_person','quality_position','quality_person_competency',
                          'quality_competency_evidence','quality_development_plan_item',
                          'quality_learning_activity','quality_performance_evaluation',
                          'quality_knowledge_item','quality_knowledge_transfer_plan',
                          'quality_lesson_learned',
                          'quality_supplier_profile','quality_supplier_scope',
                          'quality_supplier_evaluation','quality_supplier_document',
                          'quality_customer_profile','quality_survey_campaign',
                          'quality_customer_feedback','quality_customer_voice_review',
                          'quality_audit_program','quality_audit','quality_audit_finding',
                          'quality_management_review','quality_management_review_input',
                          'quality_management_review_decision'));
alter table public.work_events drop constraint work_events_type_check;
-- El catálogo COMPLETO: todo lo que declaraba 0127, todo lo que cualquier
-- migración inserta de verdad, y los seis de QUALITY-10. Soltar la
-- restricción y volver a ponerla con menos valores rompería las funciones
-- que ya escriben esos eventos.
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
                        'management_review.minutes_issued','management_review.reopened'));

alter table public.work_decisions drop constraint work_decisions_subject_kind_check;
alter table public.work_decisions add constraint work_decisions_subject_kind_check
  check (subject_kind in ('case','action','risk','opportunity','control',
                          'person_competency','performance_evaluation','lesson',
                          'knowledge_transfer','supplier_scope','supplier_evaluation',
                          'survey_campaign','customer_feedback','customer_voice_review',
                          'audit_program','audit','audit_finding',
                          'management_review','management_review_decision'));
alter table public.work_decisions drop constraint work_decisions_decision_kind_check;
alter table public.work_decisions add constraint work_decisions_decision_kind_check
  check (decision_kind in ('case_opened','classification','correction_needed',
                           'cause_approved','action_planned','action_completed',
                           'effectiveness','closure','reopen','concession',
                           'risk_identified','risk_assessed','risk_treatment',
                           'risk_acceptance','risk_review','risk_materialized',
                           'control_effectiveness','opportunity_assessed',
                           'opportunity_treatment','competence_decision',
                           'competence_revocation','performance_result','lesson_proposal',
                           'knowledge_transfer_verification','supplier_criticality',
                           'supplier_evaluation_closed','supplier_approval',
                           'customer_voice_period_closed',
                           'audit_program_approved','audit_finding_evaluated',
                           'audit_conclusions','audit_closed',
                           'management_review_decision','management_review_closed',
                           'management_review_reopened'));

alter table public.work_references drop constraint work_references_owner_kind_check;
alter table public.work_references add constraint work_references_owner_kind_check
  check (owner_kind in ('case','action','risk','opportunity','control','risk_assessment',
                        'person_competency','competency_evidence','knowledge_item',
                        'knowledge_transfer_plan','lesson','development_need',
                        'learning_activity','performance_evaluation',
                        'supplier_profile','supplier_scope','supplier_evaluation',
                        'supplier_incident',
                        'customer_profile','customer_feedback','survey_campaign',
                        'customer_voice_review',
                        'audit_program','audit','audit_finding',
                        'management_review','management_review_input',
                        'management_review_decision'));
alter table public.work_references drop constraint work_references_ref_kind_check;
alter table public.work_references add constraint work_references_ref_kind_check
  check (ref_kind in ('quality_indicator','quality_measurement','quality_process',
                      'quality_process_revision','quality_process_io',
                      'trazadoc_document','trazadoc_document_revision',
                      'work_case','work_action','quality_objective',
                      'quality_risk','quality_opportunity','quality_control',
                      'quality_risk_assessment','quality_risk_materialization',
                      'quality_person','quality_position','quality_competency',
                      'quality_person_competency','quality_knowledge_item',
                      'quality_lesson_learned','quality_learning_activity',
                      'quality_external_party','quality_supplier_profile',
                      'quality_supplier_scope','quality_supplier_evaluation',
                      'quality_supplier_document','quality_supplier_incident',
                      'quality_customer_profile','quality_customer_feedback',
                      'quality_survey_campaign','quality_survey_response',
                      'quality_customer_voice_review',
                      'quality_audit_program','quality_audit','quality_audit_finding',
                      'quality_audit_evidence','quality_audit_criterion',
                      'quality_management_review','quality_management_review_input',
                      'quality_management_review_decision'));

-- §58 · El validador de referencias, reescrito para conocer los tres tipos
-- nuevos. Sin esto, `work_references` volvería a ser un jsonb con nombre de
-- tabla — y el linaje de un número dejaría de poder comprobarse.
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
  end;

  if v_org is null then
    raise exception 'La referencia apunta a algo que no existe.';
  end if;
  if v_org <> new.organization_id then
    raise exception 'La referencia apunta a algo que no es de esta empresa.';
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
  end;

  if v_owner_org is null then
    raise exception 'El propietario de la referencia no existe.';
  end if;
  if v_owner_org <> new.organization_id then
    raise exception 'El propietario de la referencia no es de esta empresa.';
  end if;

  return new;
end;
$$;


-- ============================================================================
-- 11 · QUIÉN PUEDE QUÉ (§66)
-- ----------------------------------------------------------------------------
-- Preparar y analizar es trabajo del sistema de gestión, y lo puede conducir
-- un consultor externo. CERRAR la revisión y EMITIR el acta es un acto de la
-- EMPRESA sobre sí misma: la dirección no delega su propia revisión.
-- ============================================================================

create or replace function public.quality_reads_management_review(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_org_member(p_organization_id);
$$;
revoke all on function public.quality_reads_management_review(uuid) from public, anon;
grant execute on function public.quality_reads_management_review(uuid) to authenticated;

create or replace function public.quality_manages_management_review(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_org_role(p_organization_id, array['admin', 'quality', 'consultant']);
$$;
revoke all on function public.quality_manages_management_review(uuid) from public, anon;
grant execute on function public.quality_manages_management_review(uuid) to authenticated;

create or replace function public.quality_closes_management_review(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_org_role(p_organization_id, array['admin', 'quality']);
$$;
revoke all on function public.quality_closes_management_review(uuid) from public, anon;
grant execute on function public.quality_closes_management_review(uuid) to authenticated;

comment on function public.quality_closes_management_review(uuid) is
  'QUALITY-10 · Cerrar la revisión y emitir el acta es un acto de la EMPRESA sobre sí misma: la dirección no delega su propia revisión en un consultor externo.';


-- ============================================================================
-- 12 · LOS ADAPTADORES DE FUENTE (§5, §15, §55, §58, §59, RD-02, RD-09)
-- ----------------------------------------------------------------------------
-- Catorce funciones, una por entrada. Todas comparten cuatro propiedades que
-- no son negociables:
--
--   1 · SOLO LEEN. Ninguna escribe en su dominio de origen. La revisión por la
--       dirección no corrige el número que le incomoda.
--   2 · RESPETAN EL PERIODO. No devuelven «el estado de hoy»: devuelven lo que
--       pasó entre `p_from` y `p_to`.
--   3 · REVALIDAN LA PERTENENCIA con `is_org_member`, contra la sesión. El
--       `p_organization_id` que reciben no es una credencial.
--   4 · DEVUELVEN LINAJE. Cada número trae de dónde salió (§58): dominio,
--       consulta y periodo. No hay números mágicos.
--
-- §36 · Y todas distinguen CERO de SIN DATO. `available: false` significa «no
-- hubo medición», no «midió cero».
-- ============================================================================

-- §19/§87 · Las acciones que dejó la revisión ANTERIOR. Se leen del motor de
-- acciones; no se copian, no se duplican y no se crea
-- `quality_management_review_actions`.
create or replace function public.quality_mr_src_previous_actions(
  p_organization_id uuid, p_from date, p_to date, p_review_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with anteriores as (
    select r.id, r.code, r.title, r.period_label, r.period_end
      from quality_management_reviews r
     where is_org_member(p_organization_id)
       and r.organization_id = p_organization_id
       and r.status = 'closed'
       and (p_review_id is null or r.id <> p_review_id)
       and r.period_end < p_from
  ),
  decisiones as (
    select d.id, d.code, d.topic, a.code as review_code, a.period_label
      from quality_management_review_decisions d
      join anteriores a on a.id = d.review_id
     where d.organization_id = p_organization_id
  ),
  acciones as (
    select distinct on (act.id)
           act.id, act.code, act.title, act.status, act.due_on,
           act.completed_on, act.requires_effectiveness, act.effectiveness_result,
           dd.code as decision_code, dd.review_code, dd.period_label
      from work_references wr
      join decisiones dd on dd.id = wr.owner_id
      join work_actions act
        on act.organization_id = wr.organization_id and act.id = wr.ref_id
     where wr.organization_id = p_organization_id
       and wr.owner_kind = 'management_review_decision'
       and wr.ref_kind = 'work_action'
  )
  select jsonb_build_object(
    'available', exists (select 1 from anteriores),
    'previous_reviews', coalesce((
      select jsonb_agg(jsonb_build_object('code', code, 'title', title,
                                          'period', period_label) order by period_end desc)
        from anteriores), '[]'::jsonb),
    'totals', jsonb_build_object(
      'decisions', (select count(*) from decisiones),
      'actions',   (select count(*) from acciones),
      'open',      (select count(*) from acciones where status in ('planned', 'in_progress')),
      'completed', (select count(*) from acciones where status = 'completed'),
      'cancelled', (select count(*) from acciones where status = 'cancelled'),
      'overdue',   (select count(*) from acciones
                     where status in ('planned', 'in_progress')
                       and due_on is not null and due_on < current_date),
      'effective',     (select count(*) from acciones where effectiveness_result = 'effective'),
      'not_effective', (select count(*) from acciones where effectiveness_result = 'not_effective'),
      'effectiveness_pending', (select count(*) from acciones where effectiveness_result = 'pending')),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'action_id', id, 'code', code, 'title', title, 'status', status,
               'due_on', due_on, 'completed_on', completed_on,
               'effectiveness', effectiveness_result,
               'from_decision', decision_code, 'from_review', review_code)
             order by code)
        from acciones), '[]'::jsonb),
    'lineage', jsonb_build_array(jsonb_build_object(
      'domain', 'QUALITY-04 · acciones', 'entity', 'work_actions',
      'via', 'work_references(owner_kind=management_review_decision, ref_kind=work_action)',
      'scope', 'revisiones cerradas con periodo anterior a ' || p_from::text)));
$$;

comment on function public.quality_mr_src_previous_actions(uuid, date, date, uuid) is
  'QUALITY-10 · §19/RD-12 · Las acciones que dejó la revisión anterior, leídas del motor transversal. No se copian ni se duplican.';


-- §29/§31 · Los cambios del periodo que el sistema SÍ conoce: documentos que
-- entraron en vigor y procesos que publicaron revisión. Lo demás lo aporta la
-- dirección como entrada manual — y no se finge que salió de la base.
create or replace function public.quality_mr_src_changes(
  p_organization_id uuid, p_from date, p_to date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with docs as (
    select d.id, d.code, d.title, rv.revision_number, rv.revision_label,
           rv.effective_from, rv.change_note
      from trazadoc_document_revisions rv
      join trazadoc_documents d
        on d.organization_id = rv.organization_id and d.id = rv.document_id
     where is_org_member(p_organization_id)
       and rv.organization_id = p_organization_id
       and rv.effective_from is not null
       and rv.effective_from between p_from and p_to
  ),
  procesos as (
    select p.id, p.code, p.name, rv.revision_number, rv.effective_from, rv.change_note
      from quality_process_revisions rv
      join quality_processes p
        on p.organization_id = rv.organization_id and p.id = rv.process_id
     where rv.organization_id = p_organization_id
       and rv.status = 'published'
       and rv.effective_from between p_from and p_to
  )
  select jsonb_build_object(
    -- §29 · No se listan quinientos documentos porque existan: solo los que
    -- CAMBIARON en el periodo.
    'available', (select count(*) from docs) + (select count(*) from procesos) > 0,
    'totals', jsonb_build_object(
      'document_revisions', (select count(*) from docs),
      'process_revisions',  (select count(*) from procesos)),
    'document_changes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'document_id', id, 'code', code, 'title', title,
               'revision', revision_number, 'label', revision_label,
               'effective_from', effective_from, 'change_note', change_note)
             order by effective_from desc)
        from docs), '[]'::jsonb),
    'process_changes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'process_id', id, 'code', code, 'name', name,
               'revision', revision_number, 'effective_from', effective_from,
               'change_note', change_note)
             order by effective_from desc)
        from procesos), '[]'::jsonb),
    'note', 'Los cambios de contexto, mercado, regulación y estrategia no salen '
            || 'de ningún dominio: los aporta la dirección como entrada manual.',
    'lineage', jsonb_build_array(
      jsonb_build_object('domain', 'QUALITY-02 · TrazaDocs',
                         'entity', 'trazadoc_document_revisions',
                         'filter', 'effective_from entre ' || p_from::text || ' y ' || p_to::text),
      jsonb_build_object('domain', 'QUALITY-01 · procesos',
                         'entity', 'quality_process_revisions',
                         'filter', 'publicadas entre ' || p_from::text || ' y ' || p_to::text)));
$$;


-- §20 · Los objetivos vigentes EN EL PERIODO, con su desempeño real. No se
-- inventa un porcentaje global de cumplimiento: si la metodología no lo
-- define, no existe.
create or replace function public.quality_mr_src_objectives(
  p_organization_id uuid, p_from date, p_to date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with obj as (
    select *
      from v_quality_objective_performance o
     where is_org_member(p_organization_id)
       and o.organization_id = p_organization_id
       -- Vigente en el periodo: se solapa con él.
       and o.period_start <= p_to
       and (o.period_end is null or o.period_end >= p_from)
  )
  select jsonb_build_object(
    'available', exists (select 1 from obj),
    'totals', jsonb_build_object(
      'objectives', (select count(*) from obj),
      'active',     (select count(*) from obj where admin_state = 'active'),
      'closed',     (select count(*) from obj where admin_state = 'closed'),
      'indicators', (select coalesce(sum(indicator_count), 0) from obj),
      'indicators_complying',    (select coalesce(sum(indicators_complying), 0) from obj),
      'indicators_attention',    (select coalesce(sum(indicators_attention), 0) from obj),
      'indicators_not_met',      (select coalesce(sum(indicators_not_met), 0) from obj),
      'indicators_without_data', (select coalesce(sum(indicators_without_data), 0) from obj)),
    'objectives', coalesce((
      select jsonb_agg(jsonb_build_object(
               'objective_id', objective_id, 'code', code, 'name', name,
               'period_start', period_start, 'period_end', period_end,
               'state', admin_state, 'owner', owner_position_name,
               'indicator_count', indicator_count,
               'complying', indicators_complying, 'attention', indicators_attention,
               'not_met', indicators_not_met, 'without_data', indicators_without_data,
               'performance', performance,
               'performance_explanation', performance_explanation)
             order by code nulls last, name)
        from obj), '[]'::jsonb),
    -- §21 · Sin dato no es cero. Un objetivo cuyos indicadores no se midieron
    -- no «incumplió»: no se sabe.
    'note', 'Los indicadores sin dato se cuentan aparte. No se suman como '
            || 'incumplidos ni se convierten en cero.',
    'lineage', jsonb_build_array(jsonb_build_object(
      'domain', 'QUALITY-03 · objetivos', 'entity', 'v_quality_objective_performance',
      'filter', 'periodo solapado con ' || p_from::text || '…' || p_to::text)));
$$;


-- §21 · Los indicadores con su META HISTÓRICA y su resultado del periodo.
-- Un indicador medido en 2027 contra una meta de 95 sigue diciendo 95, aunque
-- en 2028 la meta suba a 98: la medición guarda su propia configuración.
create or replace function public.quality_mr_src_monitoring(
  p_organization_id uuid, p_from date, p_to date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with med as (
    select m.id, m.indicator_id, m.period_label, m.period_start, m.period_end,
           m.value, m.data_state, m.data_quality, m.evaluation, m.result_state,
           m.evaluation_explanation, m.measured_at,
           i.code, i.name,
           -- La dirección y la meta se leen de la CONFIGURACIÓN con la que se
           -- midió, no del indicador de hoy. Es lo que hace que 82/95 siga
           -- siendo 82/95 cuando la meta sube a 98.
           c.direction, c.target_value, c.target_min, c.target_max, c.unit_code
      from quality_measurements m
      join quality_indicators i
        on i.organization_id = m.organization_id and i.id = m.indicator_id
      left join quality_indicator_configs c
        on c.organization_id = m.organization_id and c.id = m.config_id
     where is_org_member(p_organization_id)
       and m.organization_id = p_organization_id
       and m.is_current
       and m.period_start >= p_from
       and m.period_end <= p_to
  )
  select jsonb_build_object(
    'available', exists (select 1 from med),
    'totals', jsonb_build_object(
      'measurements',   (select count(*) from med),
      'indicators',     (select count(distinct indicator_id) from med),
      'reported',       (select count(*) from med where data_state = 'reported'),
      'no_data',        (select count(*) from med where data_state = 'no_data'),
      'not_applicable', (select count(*) from med where data_state = 'not_applicable'),
      'complies',       (select count(*) from med where evaluation = 'complies'),
      'attention',      (select count(*) from med where evaluation = 'attention'),
      'not_met',        (select count(*) from med where evaluation = 'not_met'),
      'no_target',      (select count(*) from med where evaluation = 'no_target'),
      'no_data_eval',   (select count(*) from med where evaluation = 'no_data')),
    'measurements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'measurement_id', id, 'indicator_id', indicator_id,
               'code', code, 'name', name, 'period', period_label,
               'value', value, 'unit', unit_code,
               -- La meta que regía CUANDO se midió, no la de hoy.
               'target', target_value, 'target_min', target_min, 'target_max', target_max,
               'direction', direction,
               'data_state', data_state, 'data_quality', data_quality,
               'evaluation', evaluation, 'explanation', evaluation_explanation)
             order by code nulls last, period_start)
        from med), '[]'::jsonb),
    -- §21/§36 · No disponible NO es cero.
    'note', 'Las mediciones «sin dato» y «no aplica» se cuentan aparte. '
            || 'Convertirlas en cero afirmaría un mal resultado que nadie midió.',
    'lineage', jsonb_build_array(jsonb_build_object(
      'domain', 'QUALITY-03 · indicadores', 'entity', 'quality_measurements',
      'filter', 'mediciones vigentes con periodo dentro de '
                || p_from::text || '…' || p_to::text,
      'note', 'La meta se lee de la CONFIGURACIÓN de la medición, no del indicador de hoy.')));
$$;

comment on function public.quality_mr_src_monitoring(uuid, date, date) is
  'QUALITY-10 · §21/§79 · La meta se lee de la configuración con la que se midió. Un 82 sobre 95 en 2027 sigue siendo 82/95 aunque la meta suba en 2028.';


-- §22 · Desempeño de procesos, hecho con datos REALES: indicadores, objetivos,
-- casos, riesgos y auditorías de cada proceso. Sin `process_score`: inventar un
-- número global donde no hay metodología es exactamente lo que convierte una
-- revisión en un tablero.
create or replace function public.quality_mr_src_process_performance(
  p_organization_id uuid, p_from date, p_to date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with proc as (
    select p.id, p.code, p.name, p.status, po.name as owner_position
      from quality_processes p
      left join quality_positions po
        on po.organization_id = p.organization_id and po.id = p.owner_position_id
     where is_org_member(p_organization_id)
       and p.organization_id = p_organization_id
       and p.status <> 'retired'
  )
  select jsonb_build_object(
    'available', exists (select 1 from proc),
    'totals', jsonb_build_object('processes', (select count(*) from proc)),
    'processes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'process_id', pr.id, 'code', pr.code, 'name', pr.name,
        'owner_position', pr.owner_position,
        'indicators', (
          select jsonb_build_object(
            'total', count(*),
            'complies', count(*) filter (where m.evaluation = 'complies'),
            'attention', count(*) filter (where m.evaluation = 'attention'),
            'not_met', count(*) filter (where m.evaluation = 'not_met'),
            'no_data', count(*) filter (where m.evaluation = 'no_data'))
            from quality_indicators i
            left join quality_measurements m
              on m.organization_id = i.organization_id and m.indicator_id = i.id
             and m.is_current and m.period_start >= p_from and m.period_end <= p_to
           where i.organization_id = p_organization_id and i.scope_process_id = pr.id),
        'cases', (
          select jsonb_build_object(
            'opened', count(*),
            'nonconformities', count(*) filter (where c.classification = 'nonconformity'),
            'closed', count(*) filter (where c.status = 'closed'))
            from work_cases c
            join work_case_processes cp
              on cp.organization_id = c.organization_id and cp.case_id = c.id
           where c.organization_id = p_organization_id and cp.process_id = pr.id
             and c.detected_on between p_from and p_to),
        'risks', (
          select jsonb_build_object(
            'total', count(distinct r.id),
            'above_appetite', count(distinct r.id) filter (where r.current_is_acceptable is false))
            from v_quality_risk_overview r
            join work_references wr
              on wr.organization_id = r.organization_id and wr.owner_kind = 'risk'
             and wr.owner_id = r.id and wr.ref_kind = 'quality_process'
           where r.organization_id = p_organization_id and wr.ref_id = pr.id),
        'audits', (
          select jsonb_build_object(
            'executed', count(distinct a.audit_id),
            'findings', coalesce(sum(a.finding_count), 0))
            from v_quality_audit_overview a
            join quality_audit_scope_items si
              on si.organization_id = a.organization_id and si.audit_id = a.audit_id
           where a.organization_id = p_organization_id and si.process_id = pr.id
             and a.executed_from is not null
             and a.executed_from between p_from and p_to))
        order by pr.code nulls last, pr.name)
        from proc pr), '[]'::jsonb),
    'note', 'No hay una puntuación global por proceso: la plataforma no define '
            || 'esa metodología, y fabricar el número sería fabricar la conclusión.',
    'lineage', jsonb_build_array(
      jsonb_build_object('domain', 'QUALITY-01 · procesos', 'entity', 'quality_processes'),
      jsonb_build_object('domain', 'QUALITY-03 · indicadores', 'entity', 'quality_measurements'),
      jsonb_build_object('domain', 'QUALITY-04 · casos', 'entity', 'work_cases'),
      jsonb_build_object('domain', 'QUALITY-05 · riesgos', 'entity', 'v_quality_risk_overview'),
      jsonb_build_object('domain', 'QUALITY-09 · auditorías', 'entity', 'v_quality_audit_overview')));
$$;


-- §23/§63/§81 · VOZ DEL CLIENTE, SIEMPRE AGREGADA.
--
-- Esta función es la que podría romper el anonimato de QUALITY-08, y por eso
-- es la más estrecha de las catorce: no lee `quality_survey_responses`, no lee
-- `quality_survey_invitations`, no lee contactos y no devuelve ningún
-- identificador de quien respondió. Lo que devuelve son métricas de campaña,
-- que ya nacieron agregadas.
create or replace function public.quality_mr_src_customer_voice(
  p_organization_id uuid, p_from date, p_to date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with camp as (
    select *
      from v_quality_campaign_summary c
     where is_org_member(p_organization_id)
       and c.organization_id = p_organization_id
       and c.period_start <= p_to and c.period_end >= p_from
  ),
  metricas as (
    select s.definition_id, s.definition_name, s.method, s.campaign_name,
           s.period_label, s.value, s.sample_size, s.not_applicable, s.skipped,
           s.breaks_comparability
      from v_quality_metric_series s
     where s.organization_id = p_organization_id
       and s.period_start <= p_to and s.period_end >= p_from
  ),
  fb as (
    select f.feedback_kind, f.severity, f.status
      from quality_customer_feedback f
     where f.organization_id = p_organization_id
       and f.received_on between p_from and p_to
  ),
  signals as (
    select s.signal_kind, s.status
      from quality_customer_signals s
     where s.organization_id = p_organization_id
       and s.first_seen_at::date between p_from and p_to
  )
  select jsonb_build_object(
    -- §36/§78 · Si no hubo campaña ni manifestación, `available` es falso y el
    -- resumen lo dice. Nunca «satisfacción = 0».
    'available', (select count(*) from camp) + (select count(*) from fb) > 0,
    'campaigns', jsonb_build_object(
      'total', (select count(*) from camp),
      'closed', (select count(*) from camp where status = 'closed'),
      'detail', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'campaign_id', campaign_id, 'name', name, 'period', period_label,
                 'anonymity', anonymity_mode, 'status', status,
                 'invited', invited_count, 'responses', responses_count,
                 'response_rate', response_rate, 'basis', response_rate_basis)
               order by period_start)
          from camp), '[]'::jsonb)),
    'metrics', coalesce((
      select jsonb_agg(jsonb_build_object(
               'definition', definition_name, 'method', method,
               'campaign', campaign_name, 'period', period_label,
               'value', value, 'sample_size', sample_size,
               'not_applicable', not_applicable, 'skipped', skipped,
               'breaks_comparability', breaks_comparability)
             order by definition_name, period_label)
        from metricas), '[]'::jsonb),
    'feedback', jsonb_build_object(
      'total',       (select count(*) from fb),
      'complaints',  (select count(*) from fb where feedback_kind in ('complaint', 'claim')),
      'suggestions', (select count(*) from fb where feedback_kind = 'suggestion'),
      'compliments', (select count(*) from fb where feedback_kind = 'compliment'),
      'open',        (select count(*) from fb where status not in ('closed', 'dismissed'))),
    'signals', jsonb_build_object(
      'total', (select count(*) from signals),
      'open',  (select count(*) from signals where status = 'open')),
    -- §63 · La frase que explica por qué esta entrada no trae nombres.
    'anonymity_note', 'Las respuestas de campañas anónimas se publican SIEMPRE '
      || 'agregadas. Esta entrada no lee respuestas individuales, ni invitaciones, '
      || 'ni contactos: no hay ninguna vía por la que la identidad de quien '
      || 'respondió llegue a una revisión por la dirección.',
    'lineage', jsonb_build_array(
      jsonb_build_object('domain', 'QUALITY-08 · voz del cliente',
                         'entity', 'v_quality_campaign_summary'),
      jsonb_build_object('domain', 'QUALITY-08 · métricas',
                         'entity', 'v_quality_metric_series'),
      jsonb_build_object('domain', 'QUALITY-08 · manifestaciones',
                         'entity', 'quality_customer_feedback',
                         'filter', 'recibidas entre ' || p_from::text || ' y ' || p_to::text)));
$$;

comment on function public.quality_mr_src_customer_voice(uuid, date, date) is
  'QUALITY-10 · §63/§81 · La entrada más estrecha de las catorce: NO lee respuestas, ni invitaciones, ni contactos. El anonimato de QUALITY-08 no se rompe desde aquí.';


-- §24 · Proveedores. Criticidad, evaluaciones del periodo, aprobaciones,
-- reevaluaciones vencidas e incidentes. No «buenos y malos».
create or replace function public.quality_mr_src_suppliers(
  p_organization_id uuid, p_from date, p_to date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with sup as (
    select * from v_quality_supplier_overview s
     where is_org_member(p_organization_id)
       and s.organization_id = p_organization_id
  ),
  evals as (
    select e.id, e.evaluated_on, e.status, e.score, e.result_band, e.evaluation_kind,
           e.criteria_unavailable, e.criteria_not_applicable
      from quality_supplier_evaluations e
     where e.organization_id = p_organization_id
       and e.evaluated_on between p_from and p_to
  ),
  inc as (
    select i.severity, i.status
      from quality_supplier_incidents i
     where i.organization_id = p_organization_id
       and i.occurred_on between p_from and p_to
  )
  select jsonb_build_object(
    'available', (select count(*) from sup) > 0,
    'totals', jsonb_build_object(
      'suppliers', (select count(*) from sup),
      'active',    (select count(*) from sup where relationship_status = 'active'),
      'scopes',    (select coalesce(sum(scope_count), 0) from sup),
      'approved_scopes', (select coalesce(sum(approved_scope_count), 0) from sup),
      'expired_approvals', (select coalesce(sum(expired_approval_count), 0) from sup),
      'reevaluation_overdue', (select count(*) from sup where reevaluation_overdue),
      'evaluations_in_period', (select count(*) from evals),
      'evaluations_closed', (select count(*) from evals where status = 'closed'),
      'incidents_in_period', (select count(*) from inc),
      'incidents_open', (select count(*) from inc where status <> 'closed')),
    'by_result_band', coalesce((
      select jsonb_object_agg(coalesce(result_band, 'sin banda'), n)
        from (select result_band, count(*) as n from evals group by result_band) t),
      '{}'::jsonb),
    'critical_suppliers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'profile_id', profile_id, 'name', legal_name,
               'criticality', top_criticality_label,
               'approved_scopes', approved_scope_count, 'scopes', scope_count,
               'reevaluation_overdue', reevaluation_overdue,
               'open_incidents', open_incident_count)
             order by max_criticality_score desc nulls last, legal_name)
        from sup where max_criticality_score is not null), '[]'::jsonb),
    'note', 'La evaluación de un proveedor se emite por ALCANCE: «proveedor '
            || 'aprobado» a secas afirma más de lo que se decidió. Y los criterios '
            || 'sin dato se cuentan aparte, no como cero.',
    'lineage', jsonb_build_array(
      jsonb_build_object('domain', 'QUALITY-07 · proveedores',
                         'entity', 'v_quality_supplier_overview'),
      jsonb_build_object('domain', 'QUALITY-07 · evaluaciones',
                         'entity', 'quality_supplier_evaluations',
                         'filter', 'evaluadas entre ' || p_from::text || ' y ' || p_to::text)));
$$;


-- §25/§80 · Auditorías. Programa, cobertura, ejecutadas, hallazgos, escaladas
-- y seguimiento. HALLAZGO ≠ NO CONFORMIDAD se mantiene aquí igual que en
-- QUALITY-09: los hallazgos se cuentan como hallazgos.
create or replace function public.quality_mr_src_audits(
  p_organization_id uuid, p_from date, p_to date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with prog as (
    select * from v_quality_audit_program_coverage c
     where is_org_member(p_organization_id)
       and c.organization_id = p_organization_id
       and c.period_start <= p_to and c.period_end >= p_from
  ),
  auds as (
    select * from v_quality_audit_overview a
     where a.organization_id = p_organization_id
       and coalesce(a.executed_from, a.scheduled_from, a.planned_from) between p_from and p_to
  ),
  hall as (
    select f.proposed_classification, f.evaluation_status, f.case_id
      from quality_audit_findings f
      join quality_audits a
        on a.organization_id = f.organization_id and a.id = f.audit_id
     where f.organization_id = p_organization_id
       and f.raised_on between p_from and p_to
  ),
  ncs as (
    select c.id
      from work_cases c
     where c.organization_id = p_organization_id
       and c.origin_kind = 'audit'
       and c.classification = 'nonconformity'
       and c.detected_on between p_from and p_to
  )
  select jsonb_build_object(
    'available', (select count(*) from prog) + (select count(*) from auds) > 0,
    'programs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'program_id', program_id, 'name', name, 'period', period_label,
               'planned', planned_audits, 'executed', executed_audits,
               'cancelled', cancelled_audits, 'pending', pending_audits,
               'coverage_pct', coverage_pct,
               'processes_in_scope', processes_in_scope,
               'processes_audited', processes_audited)
             order by period_start)
        from prog), '[]'::jsonb),
    'audits', jsonb_build_object(
      'total',     (select count(*) from auds),
      'executed',  (select count(*) from auds where executed_to is not null),
      'closed',    (select count(*) from auds where status = 'closed'),
      'cancelled', (select count(*) from auds where status = 'cancelled'),
      'reported',  (select count(*) from auds where report_issued_at is not null),
      'detail', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'audit_id', audit_id, 'code', code, 'title', title,
                 'type', audit_type, 'nature', nature, 'status', status,
                 'executed_from', executed_from, 'executed_to', executed_to,
                 'findings', finding_count, 'findings_pending', findings_pending,
                 'findings_escalated', findings_escalated,
                 'open_cases', open_cases, 'open_actions', open_actions)
               order by code)
          from auds), '[]'::jsonb)),
    -- §25 · Los hallazgos se cuentan como hallazgos. La no conformidad se
    -- cuenta aparte, y se lee del motor de casos, que es donde se decidió.
    'findings', jsonb_build_object(
      'total',        (select count(*) from hall),
      'conforming',   (select count(*) from hall where proposed_classification = 'conforming'),
      'observations', (select count(*) from hall where proposed_classification = 'observation'),
      'improvement',  (select count(*) from hall where proposed_classification = 'improvement_opportunity'),
      'nc_suspected', (select count(*) from hall where proposed_classification = 'nonconformity_suspected'),
      'not_conclusive', (select count(*) from hall where proposed_classification = 'not_conclusive'),
      'pending_evaluation', (select count(*) from hall where evaluation_status = 'pending'),
      'escalated',    (select count(*) from hall where case_id is not null)),
    'nonconformities_formalized', (select count(*) from ncs),
    'note', 'Un hallazgo NO es una no conformidad, tampoco aquí. «Posible no '
            || 'conformidad» es lo que propuso el auditor; la clasificación formal '
            || 'vive en el caso, y esa es la que se cuenta aparte.',
    'lineage', jsonb_build_array(
      jsonb_build_object('domain', 'QUALITY-09 · programa',
                         'entity', 'v_quality_audit_program_coverage'),
      jsonb_build_object('domain', 'QUALITY-09 · auditorías',
                         'entity', 'v_quality_audit_overview'),
      jsonb_build_object('domain', 'QUALITY-09 · hallazgos',
                         'entity', 'quality_audit_findings',
                         'filter', 'levantados entre ' || p_from::text || ' y ' || p_to::text),
      jsonb_build_object('domain', 'QUALITY-04 · casos',
                         'entity', 'work_cases',
                         'filter', 'origen auditoría, clasificados no conformidad')));
$$;

comment on function public.quality_mr_src_audits(uuid, date, date) is
  'QUALITY-10 · §25/§80 · Hallazgo ≠ no conformidad, también en la revisión por la dirección. Los hallazgos se cuentan como hallazgos y las NC se leen del motor de casos.';


-- §26 · CASOS, HALLAZGOS, NO CONFORMIDADES, CORRECCIONES, ACCIONES Y EFICACIA.
-- Seis cosas, seis conteos. Colapsarlas en «incidentes» es perder justamente
-- la distinción por la que existe QUALITY-04.
create or replace function public.quality_mr_src_cases(
  p_organization_id uuid, p_from date, p_to date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with casos as (
    select c.* from v_work_case_overview c
     where is_org_member(p_organization_id)
       and c.organization_id = p_organization_id
       and c.detected_on between p_from and p_to
  ),
  hallazgos as (
    select f.id
      from work_case_findings f
      join work_cases c
        on c.organization_id = f.organization_id and c.id = f.case_id
     where f.organization_id = p_organization_id
       and c.detected_on between p_from and p_to
  ),
  acciones as (
    select a.*
      from work_actions a
     where a.organization_id = p_organization_id
       and (a.created_at::date between p_from and p_to
            or (a.due_on is not null and a.due_on between p_from and p_to))
  )
  select jsonb_build_object(
    'available', (select count(*) from casos) + (select count(*) from acciones) > 0,
    -- Los seis conteos, separados a propósito.
    'cases', jsonb_build_object(
      'opened',    (select count(*) from casos),
      'closed',    (select count(*) from casos where status = 'closed'),
      'reopened',  (select count(*) from casos where reopen_count > 0),
      'by_type',   coalesce((select jsonb_object_agg(case_type, n)
                     from (select case_type, count(*) n from casos group by case_type) t),
                    '{}'::jsonb)),
    'findings', jsonb_build_object('total', (select count(*) from hallazgos)),
    'classification', jsonb_build_object(
      'pending',                 (select count(*) from casos where classification = 'pending'),
      'nonconformity',           (select count(*) from casos where classification = 'nonconformity'),
      'observation',             (select count(*) from casos where classification = 'observation'),
      'improvement_opportunity', (select count(*) from casos where classification = 'improvement_opportunity'),
      'not_applicable',          (select count(*) from casos where classification = 'not_applicable')),
    'actions', jsonb_build_object(
      'total',       (select count(*) from acciones),
      'containment', (select count(*) from acciones where action_kind = 'containment'),
      'correction',  (select count(*) from acciones where action_kind = 'correction'),
      'corrective',  (select count(*) from acciones where action_kind = 'corrective'),
      'improvement', (select count(*) from acciones where action_kind = 'improvement'),
      'open',        (select count(*) from acciones where status in ('planned', 'in_progress')),
      'completed',   (select count(*) from acciones where status = 'completed'),
      'overdue',     (select count(*) from acciones
                       where status in ('planned', 'in_progress')
                         and due_on is not null and due_on < current_date)),
    'effectiveness', jsonb_build_object(
      'required',      (select count(*) from acciones where requires_effectiveness),
      'pending',       (select count(*) from acciones where effectiveness_result = 'pending'),
      'effective',     (select count(*) from acciones where effectiveness_result = 'effective'),
      'not_effective', (select count(*) from acciones where effectiveness_result = 'not_effective')),
    'note', 'Caso, hallazgo, no conformidad, corrección, acción y eficacia son '
            || 'seis cosas distintas y se cuentan por separado. «Incidentes» las '
            || 'colapsaría todas y borraría la distinción que las hace útiles.',
    'lineage', jsonb_build_array(
      jsonb_build_object('domain', 'QUALITY-04 · casos', 'entity', 'v_work_case_overview',
                         'filter', 'detectados entre ' || p_from::text || ' y ' || p_to::text),
      jsonb_build_object('domain', 'QUALITY-04 · acciones', 'entity', 'work_actions')));
$$;


-- §26 · Conformidad de productos y servicios. La plataforma sabe de salidas no
-- conformes registradas como caso; si no hay ninguna y tampoco hay dato de
-- producción, la entrada lo DICE en vez de afirmar conformidad total.
create or replace function public.quality_mr_src_product_conformity(
  p_organization_id uuid, p_from date, p_to date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with salidas as (
    select c.id, c.code, c.title, c.classification, c.status, c.detected_on
      from work_cases c
     where is_org_member(p_organization_id)
       and c.organization_id = p_organization_id
       and c.case_type in ('nonconforming_output', 'complaint')
       and c.detected_on between p_from and p_to
  )
  select jsonb_build_object(
    'available', exists (select 1 from salidas),
    'totals', jsonb_build_object(
      'nonconforming_outputs', (select count(*) from salidas where classification = 'nonconformity'),
      'cases',                 (select count(*) from salidas),
      'open',                  (select count(*) from salidas where status <> 'closed')),
    'cases', coalesce((
      select jsonb_agg(jsonb_build_object(
               'case_id', id, 'code', code, 'title', title,
               'classification', classification, 'status', status,
               'detected_on', detected_on)
             order by detected_on)
        from salidas), '[]'::jsonb),
    -- §36 · Cero casos registrados NO es «todo conforme»: es que no se
    -- registró ninguno. La diferencia es de quien lee, no del sistema.
    'note', case when exists (select 1 from salidas)
      then 'Solo se cuentan las salidas no conformes REGISTRADAS como caso.'
      else 'No se registró ninguna salida no conforme en el periodo. Eso no '
           || 'afirma que todo fuera conforme: afirma que no se registró nada. '
           || 'Si la organización mide conformidad fuera de Trazaloop, la '
           || 'dirección debe aportarlo como entrada manual.' end,
    'lineage', jsonb_build_array(jsonb_build_object(
      'domain', 'QUALITY-04 · casos', 'entity', 'work_cases',
      'filter', 'tipo salida no conforme o queja, entre '
                || p_from::text || ' y ' || p_to::text)));
$$;


-- §27 · Riesgos, controles, materializaciones y oportunidades. Ninguna rama
-- crea un riesgo nuevo por el hecho de haber una revisión.
create or replace function public.quality_mr_src_risks(
  p_organization_id uuid, p_from date, p_to date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with riesgos as (
    select r.* from v_quality_risk_overview r
     where is_org_member(p_organization_id)
       and r.organization_id = p_organization_id
       and r.status not in ('closed')
  ),
  mater as (
    select m.id, m.risk_id, m.occurred_on, m.severity
      from quality_risk_materializations m
     where m.organization_id = p_organization_id
       and m.occurred_on between p_from and p_to
  ),
  opor as (
    select o.* from v_quality_opportunity_overview o
     where o.organization_id = p_organization_id
       and o.identified_on between p_from and p_to
  ),
  ctrl as (
    select c.id, c.status
      from quality_controls c
     where c.organization_id = p_organization_id
  )
  select jsonb_build_object(
    'available', (select count(*) from riesgos) + (select count(*) from opor) > 0,
    'risks', jsonb_build_object(
      'total',            (select count(*) from riesgos),
      'above_appetite',   (select count(*) from riesgos where current_is_acceptable is false),
      'without_assessment', (select count(*) from riesgos where current_score is null),
      'review_overdue',   (select count(*) from riesgos where review_overdue),
      'with_treatment',   (select count(*) from riesgos where treatment_plan_id is not null),
      'open_actions',     (select coalesce(sum(action_count), 0) from riesgos),
      'overdue_actions',  (select coalesce(sum(overdue_action_count), 0) from riesgos),
      'detail', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'risk_id', id, 'code', code, 'title', title,
                 'current_level', current_level, 'current_score', current_score,
                 'acceptable', current_is_acceptable,
                 'treatment', treatment_strategy, 'treatment_status', treatment_status,
                 'controls', control_count, 'materializations', materialization_count)
               order by current_score desc nulls last)
          from riesgos where current_is_acceptable is false), '[]'::jsonb)),
    'materializations', jsonb_build_object(
      'total', (select count(*) from mater),
      'by_severity', coalesce((select jsonb_object_agg(coalesce(severity, 'sin gravedad'), n)
        from (select severity, count(*) n from mater group by severity) t), '{}'::jsonb)),
    'controls', jsonb_build_object(
      'total',   (select count(*) from ctrl),
      'active',  (select count(*) from ctrl where status = 'active'),
      'retired', (select count(*) from ctrl where status = 'retired')),
    'opportunities', jsonb_build_object(
      'identified_in_period', (select count(*) from opor),
      'with_decision', (select count(*) from opor where treatment_decision is not null),
      'with_actions',  (select count(*) from opor where action_count > 0)),
    'note', 'Esta entrada no crea riesgos ni oportunidades. Que la dirección '
            || 'mire un riesgo no lo modifica: si hay que decidir sobre él, la '
            || 'decisión es un objeto aparte.',
    'lineage', jsonb_build_array(
      jsonb_build_object('domain', 'QUALITY-05 · riesgos', 'entity', 'v_quality_risk_overview'),
      jsonb_build_object('domain', 'QUALITY-05 · materializaciones',
                         'entity', 'quality_risk_materializations',
                         'filter', 'ocurridas entre ' || p_from::text || ' y ' || p_to::text),
      jsonb_build_object('domain', 'QUALITY-05 · oportunidades',
                         'entity', 'v_quality_opportunity_overview')));
$$;


-- §28/§30/§62 · ADECUACIÓN DE RECURSOS, AGREGADA.
--
-- La revisión por la dirección no es una evaluación de empleados. Esta entrada
-- devuelve CUÁNTOS, no QUIÉNES: tres evaluaciones pendientes, dos brechas
-- críticas, un conocimiento crítico con un solo poseedor. Los nombres viven en
-- QUALITY-06, con sus permisos, y ahí se quedan.
create or replace function public.quality_mr_src_resources(
  p_organization_id uuid, p_from date, p_to date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with personas as (
    select p.id, p.status
      from quality_people p
     where is_org_member(p_organization_id)
       and p.organization_id = p_organization_id
  ),
  matriz as (
    select m.gap, m.is_mandatory, m.evidence_status
      from v_quality_competence_matrix m
     where m.organization_id = p_organization_id
  ),
  evals as (
    select e.status
      from quality_performance_evaluations e
      join quality_performance_cycles c
        on c.organization_id = e.organization_id and c.id = e.cycle_id
     where e.organization_id = p_organization_id
       and c.period_start <= p_to and c.period_end >= p_from
  ),
  conoc as (
    select k.criticality, k.holder_count, k.continuity_attention, k.open_transfer_count
      from v_quality_knowledge_continuity k
     where k.organization_id = p_organization_id
  ),
  cargos as (
    select po.id, po.is_active,
           exists (select 1 from quality_position_assignments a
                    where a.organization_id = po.organization_id
                      and a.position_id = po.id
                      and a.assignment_type = 'holder'
                      and a.effective_from <= p_to
                      and (a.effective_to is null or a.effective_to >= p_to)) as ocupado
      from quality_positions po
     where po.organization_id = p_organization_id and po.is_active
  )
  select jsonb_build_object(
    'available', (select count(*) from personas) > 0,
    -- §62 · Agregados. Ni un solo nombre.
    'people', jsonb_build_object(
      'total',  (select count(*) from personas),
      'active', (select count(*) from personas where status = 'active')),
    'positions', jsonb_build_object(
      'active',  (select count(*) from cargos),
      'vacant',  (select count(*) from cargos where not ocupado)),
    'competence', jsonb_build_object(
      'assessments',      (select count(*) from matriz),
      -- `gap` es la DISTANCIA al nivel requerido, no un sí/no. Positiva
      -- significa que falta competencia.
      'gaps',             (select count(*) from matriz where gap > 0),
      'mandatory_gaps',   (select count(*) from matriz where gap > 0 and is_mandatory),
      'evidence_expired', (select count(*) from matriz where evidence_status = 'expired')),
    'performance', jsonb_build_object(
      'evaluations_in_cycle', (select count(*) from evals),
      'pending',              (select count(*) from evals where status <> 'closed')),
    'knowledge', jsonb_build_object(
      'items',              (select count(*) from conoc),
      'critical',           (select count(*) from conoc where criticality in ('high', 'critical')),
      'single_holder',      (select count(*) from conoc where holder_count = 1),
      'continuity_attention', (select count(*) from conoc where continuity_attention),
      'open_transfers',     (select coalesce(sum(open_transfer_count), 0) from conoc)),
    'note', 'Números, no nombres. La revisión por la dirección no es una '
            || 'evaluación de empleados: si hace falta mirar un caso individual, '
            || 'se mira en Personas, con sus permisos. Y la suficiencia de estos '
            || 'recursos la juzga la dirección: la plataforma solo los cuenta.',
    'lineage', jsonb_build_array(
      jsonb_build_object('domain', 'QUALITY-06 · competencia',
                         'entity', 'v_quality_competence_matrix'),
      jsonb_build_object('domain', 'QUALITY-06 · desempeño',
                         'entity', 'quality_performance_evaluations',
                         'filter', 'ciclos solapados con el periodo'),
      jsonb_build_object('domain', 'QUALITY-06 · conocimiento',
                         'entity', 'v_quality_knowledge_continuity'),
      jsonb_build_object('domain', 'QUALITY-01 · cargos', 'entity', 'quality_positions')));
$$;

comment on function public.quality_mr_src_resources(uuid, date, date) is
  'QUALITY-10 · §28/§62 · Agregados, nunca nombres. La revisión por la dirección no es una evaluación de empleados.';


-- §32 · Oportunidades de mejora, vengan de donde vengan. Ninguna se convierte
-- en acción sola: la dirección decide.
create or replace function public.quality_mr_src_improvement(
  p_organization_id uuid, p_from date, p_to date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with de_riesgos as (
    select o.id, o.code, o.title, o.opportunity_kind, o.status
      from v_quality_opportunity_overview o
     where is_org_member(p_organization_id)
       and o.organization_id = p_organization_id
       and o.identified_on between p_from and p_to
  ),
  de_auditorias as (
    select f.id, f.code, f.statement
      from quality_audit_findings f
     where f.organization_id = p_organization_id
       and f.proposed_classification = 'improvement_opportunity'
       and f.raised_on between p_from and p_to
  ),
  de_clientes as (
    select f.id, f.title
      from quality_customer_feedback f
     where f.organization_id = p_organization_id
       and f.feedback_kind = 'suggestion'
       and f.received_on between p_from and p_to
  ),
  de_casos as (
    select c.id, c.code, c.title
      from work_cases c
     where c.organization_id = p_organization_id
       and c.classification = 'improvement_opportunity'
       and c.detected_on between p_from and p_to
  )
  select jsonb_build_object(
    'available', (select count(*) from de_riesgos) + (select count(*) from de_auditorias)
                 + (select count(*) from de_clientes) + (select count(*) from de_casos) > 0,
    'totals', jsonb_build_object(
      'from_opportunities', (select count(*) from de_riesgos),
      'from_audits',        (select count(*) from de_auditorias),
      'from_customers',     (select count(*) from de_clientes),
      'from_cases',         (select count(*) from de_casos)),
    'from_opportunities', coalesce((
      select jsonb_agg(jsonb_build_object('opportunity_id', id, 'code', code,
                                          'title', title, 'kind', opportunity_kind,
                                          'status', status) order by code)
        from de_riesgos), '[]'::jsonb),
    'from_audits', coalesce((
      select jsonb_agg(jsonb_build_object('finding_id', id, 'code', code,
                                          'statement', statement) order by code)
        from de_auditorias), '[]'::jsonb),
    'from_customers', coalesce((
      select jsonb_agg(jsonb_build_object('feedback_id', id, 'title', title))
        from de_clientes), '[]'::jsonb),
    'from_cases', coalesce((
      select jsonb_agg(jsonb_build_object('case_id', id, 'code', code, 'title', title)
             order by code)
        from de_casos), '[]'::jsonb),
    'note', 'Ninguna de estas oportunidades crea una acción por sí sola. La '
            || 'dirección decide cuáles se toman, y esa decisión es un objeto '
            || 'con autor y fecha.',
    'lineage', jsonb_build_array(
      jsonb_build_object('domain', 'QUALITY-05 · oportunidades',
                         'entity', 'v_quality_opportunity_overview'),
      jsonb_build_object('domain', 'QUALITY-09 · hallazgos',
                         'entity', 'quality_audit_findings',
                         'filter', 'clasificación propuesta: oportunidad de mejora'),
      jsonb_build_object('domain', 'QUALITY-08 · voz del cliente',
                         'entity', 'quality_customer_feedback',
                         'filter', 'sugerencias'),
      jsonb_build_object('domain', 'QUALITY-04 · casos',
                         'entity', 'work_cases',
                         'filter', 'clasificados como oportunidad de mejora')));
$$;


-- §13.C · Desempeño y eficacia del sistema: la foto de conjunto, armada con lo
-- que las otras entradas ya saben. No añade ningún dato nuevo; los reúne.
create or replace function public.quality_mr_src_system_performance(
  p_organization_id uuid, p_from date, p_to date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not is_org_member(p_organization_id) then null else jsonb_build_object(
    'available', true,
    'objectives',  (quality_mr_src_objectives(p_organization_id, p_from, p_to) -> 'totals'),
    'monitoring',  (quality_mr_src_monitoring(p_organization_id, p_from, p_to) -> 'totals'),
    'cases',       (quality_mr_src_cases(p_organization_id, p_from, p_to) -> 'cases'),
    'actions',     (quality_mr_src_cases(p_organization_id, p_from, p_to) -> 'actions'),
    'effectiveness', (quality_mr_src_cases(p_organization_id, p_from, p_to) -> 'effectiveness'),
    'audits',      (quality_mr_src_audits(p_organization_id, p_from, p_to) -> 'audits'),
    'risks',       (quality_mr_src_risks(p_organization_id, p_from, p_to) -> 'risks'),
    'customer',    (quality_mr_src_customer_voice(p_organization_id, p_from, p_to) -> 'feedback'),
    'note', 'Esta entrada no añade ningún dato: reúne los que las demás ya '
            || 'trajeron, para que la dirección vea el conjunto antes del detalle.',
    'lineage', jsonb_build_array(jsonb_build_object(
      'domain', 'QUALITY-10 · agregación',
      'entity', 'las demás entradas de esta misma revisión',
      'filter', p_from::text || '…' || p_to::text)))
  end;
$$;


-- ============================================================================
-- 13 · EL DESPACHADOR Y LA HUELLA (§15, §55, §56, §57)
-- ----------------------------------------------------------------------------
-- Un único punto por el que se pide el dato de una entrada. La huella es el
-- `md5` del propio retrato: `jsonb` ordena sus claves, así que el mismo dato
-- produce siempre la misma huella y un dato distinto produce otra. Comparar la
-- huella de hoy con la guardada es todo lo que hace falta para decir FUENTE
-- ACTUALIZADA sin tocar nada.
--
-- No se usa pgcrypto: `md5(text)` es del núcleo, y aquí no hay ningún secreto
-- que proteger — solo un cambio que detectar.
-- ============================================================================

create or replace function public.quality_mr_source_payload(
  p_organization_id uuid, p_code text, p_from date, p_to date,
  p_review_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- §66 · La pertenencia se comprueba contra la SESIÓN, no contra el
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
    else null
  end;
end;
$$;
revoke all on function public.quality_mr_source_payload(uuid, text, date, date, uuid) from public, anon;
grant execute on function public.quality_mr_source_payload(uuid, text, date, date, uuid) to authenticated;


-- El resumen legible de un retrato. Es lo que se lee en la pantalla y en el
-- acta antes de abrir el detalle, y es EXPLICABLE (§59): «5 de 6 ejecutadas»
-- se puede abrir y comprobar.
create or replace function public.quality_mr_summarize(p_code text, p_payload jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_payload is null then
    return 'Sin datos.';
  end if;
  -- §36 · Sin dato NO es cero. La frase lo dice antes que ningún número.
  if coalesce((p_payload ->> 'available')::boolean, false) = false then
    return case p_code
      when 'customer_voice' then
        'No hubo campañas de satisfacción ni manifestaciones de clientes en el periodo. '
        || 'Eso NO significa satisfacción cero: significa que no se midió.'
      when 'audits' then
        'No hubo auditorías con fecha en el periodo. Eso no afirma conformidad: '
        || 'afirma que no se auditó.'
      when 'previous_actions' then
        'No hay ninguna revisión por la dirección cerrada anterior a este periodo.'
      else 'Sin datos registrados en el periodo. No se sustituye por cero.'
    end;
  end if;

  return case p_code
    when 'previous_actions' then (
      select (tot ->> 'actions') || ' acción(es) de revisiones anteriores: '
             || (tot ->> 'open') || ' abiertas, ' || (tot ->> 'completed') || ' completadas, '
             || (tot ->> 'overdue') || ' vencidas, ' || (tot ->> 'effective') || ' eficaces, '
             || (tot ->> 'not_effective') || ' no eficaces.'
        from jsonb_extract_path(p_payload, 'totals') tot)
    when 'changes' then (
      select (tot ->> 'document_revisions') || ' revisión(es) de documento y '
             || (tot ->> 'process_revisions') || ' de proceso entraron en vigor en el periodo.'
        from jsonb_extract_path(p_payload, 'totals') tot)
    when 'objectives' then (
      select (tot ->> 'objectives') || ' objetivo(s) vigentes con ' || (tot ->> 'indicators')
             || ' indicador(es): ' || (tot ->> 'indicators_complying') || ' cumplen, '
             || (tot ->> 'indicators_attention') || ' en atención, '
             || (tot ->> 'indicators_not_met') || ' no cumplen, '
             || (tot ->> 'indicators_without_data') || ' sin dato.'
        from jsonb_extract_path(p_payload, 'totals') tot)
    when 'monitoring_results' then (
      select (tot ->> 'measurements') || ' medición(es) sobre ' || (tot ->> 'indicators')
             || ' indicador(es): ' || (tot ->> 'complies') || ' cumplen, '
             || (tot ->> 'attention') || ' en atención, ' || (tot ->> 'not_met') || ' no cumplen, '
             || (tot ->> 'no_data') || ' sin dato y ' || (tot ->> 'not_applicable') || ' no aplican.'
        from jsonb_extract_path(p_payload, 'totals') tot)
    when 'audits' then (
      select (p_payload #>> '{audits,executed}') || ' auditoría(s) ejecutadas de '
             || coalesce((select sum((x ->> 'planned')::int)::text
                            from jsonb_array_elements(p_payload -> 'programs') x),
                         (p_payload #>> '{audits,total}'))
             || ' programadas · ' || (p_payload #>> '{findings,total}') || ' hallazgo(s), '
             || (p_payload #>> '{findings,escalated}') || ' escalados a caso y '
             || (p_payload ->> 'nonconformities_formalized')
             || ' no conformidad(es) formalizadas.')
    when 'nonconformities_actions' then (
      select (p_payload #>> '{cases,opened}') || ' caso(s) abiertos, '
             || (p_payload #>> '{classification,nonconformity}') || ' clasificados como no '
             || 'conformidad · ' || (p_payload #>> '{actions,total}') || ' acción(es), '
             || (p_payload #>> '{effectiveness,effective}') || ' eficaces y '
             || (p_payload #>> '{effectiveness,not_effective}') || ' no eficaces.')
    when 'customer_voice' then (
      select (p_payload #>> '{campaigns,total}') || ' campaña(s) y '
             || (p_payload #>> '{feedback,total}') || ' manifestación(es): '
             || (p_payload #>> '{feedback,complaints}') || ' quejas, '
             || (p_payload #>> '{feedback,suggestions}') || ' sugerencias y '
             || (p_payload #>> '{feedback,compliments}') || ' felicitaciones.')
    when 'supplier_performance' then (
      select (tot ->> 'suppliers') || ' proveedor(es) · ' || (tot ->> 'evaluations_in_period')
             || ' evaluación(es) en el periodo, ' || (tot ->> 'reevaluation_overdue')
             || ' reevaluación(es) vencidas y ' || (tot ->> 'incidents_in_period')
             || ' incidente(s).'
        from jsonb_extract_path(p_payload, 'totals') tot)
    when 'risk_action_effectiveness' then (
      select (p_payload #>> '{risks,total}') || ' riesgo(s) abiertos, '
             || (p_payload #>> '{risks,above_appetite}') || ' por encima del criterio '
             || 'aceptable · ' || (p_payload #>> '{materializations,total}')
             || ' materialización(es) en el periodo.')
    when 'resources_adequacy' then (
      select (p_payload #>> '{people,active}') || ' persona(s) activas, '
             || (p_payload #>> '{positions,vacant}') || ' cargo(s) vacantes, '
             || (p_payload #>> '{competence,mandatory_gaps}') || ' brecha(s) de competencia '
             || 'obligatoria y ' || (p_payload #>> '{knowledge,single_holder}')
             || ' conocimiento(s) con un solo poseedor.')
    when 'improvement_opportunities' then (
      select (tot ->> 'from_opportunities') || ' de oportunidades, ' || (tot ->> 'from_audits')
             || ' de auditorías, ' || (tot ->> 'from_customers') || ' de clientes y '
             || (tot ->> 'from_cases') || ' de casos.'
        from jsonb_extract_path(p_payload, 'totals') tot)
    when 'process_performance' then (
      select (p_payload #>> '{totals,processes}') || ' proceso(s) con datos del periodo. '
             || 'No hay puntuación global: la plataforma no la define.')
    when 'product_conformity' then (
      select (p_payload #>> '{totals,nonconforming_outputs}') || ' salida(s) no conformes '
             || 'registradas de ' || (p_payload #>> '{totals,cases}') || ' caso(s).')
    when 'system_performance' then
      'Resumen de conjunto del sistema en el periodo. El detalle está en cada entrada.'
    else 'Datos preparados.'
  end;
end;
$$;
revoke all on function public.quality_mr_summarize(text, jsonb) from public, anon;
grant execute on function public.quality_mr_summarize(text, jsonb) to authenticated;


-- ============================================================================
-- 14 · PREPARAR Y REFRESCAR (§55, §56, §85, RD-03, RD-09)
-- ----------------------------------------------------------------------------
-- §55 · La plataforma hace trabajo real: reúne las catorce entradas de forma
-- determinista, sin que nadie vuelva a teclear un número que ya está en el
-- sistema. Eso es RD-09 —«Quality by Observation»— y es la diferencia entre
-- una revisión por la dirección y una plantilla de Word.
--
-- §43/§55 · Y NO BORRA EL ANÁLISIS HUMANO. Preparar dos veces actualiza el
-- dato y deja intactos `analysis`, `conclusion` y `requires_decision`. Un
-- refresco que se llevara por delante lo que alguien escribió enseñaría a no
-- refrescar nunca — y entonces la revisión se cerraría con datos viejos.
-- ============================================================================

create or replace function public.quality_mr_prepare_inputs(p_review_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review  record;
  v_cat     record;
  v_payload jsonb;
  v_count   integer := 0;
begin
  select * into v_review from quality_management_reviews where id = p_review_id;
  if v_review.id is null then
    raise exception 'Esa revisión por la dirección no existe.';
  end if;
  if not quality_manages_management_review(v_review.organization_id) then
    raise exception 'Tu rol no permite preparar las entradas de una revisión por la dirección.';
  end if;
  if v_review.status in ('closed', 'cancelled') then
    raise exception 'Esta revisión ya está cerrada. Preparar entradas ahora reescribiría lo que la dirección revisó.';
  end if;

  for v_cat in
    select * from quality_management_review_input_catalog order by position_order
  loop
    v_payload := case
      when v_cat.source_domain is null then null
      else quality_mr_source_payload(v_review.organization_id, v_cat.code,
                                     v_review.period_start, v_review.period_end, p_review_id)
    end;

    insert into quality_management_review_inputs
      (organization_id, review_id, catalog_code, input_mode, state,
       snapshot, summary, source_domain, source_period_start, source_period_end,
       prepared_at, prepared_by, source_fingerprint, position_order)
    values
      (v_review.organization_id, p_review_id, v_cat.code,
       case when v_cat.source_domain is null then 'manual' else 'automatic' end,
       case
         when v_cat.source_domain is null then 'pending'
         -- §36 · Sin dato es `missing`, no cero.
         when coalesce((v_payload ->> 'available')::boolean, false) then 'prepared'
         else 'missing'
       end,
       v_payload,
       quality_mr_summarize(v_cat.code, v_payload),
       v_cat.source_domain,
       v_review.period_start, v_review.period_end,
       now(), auth.uid(),
       case when v_payload is null then null else md5(v_payload::text) end,
       v_cat.position_order)
    on conflict (organization_id, review_id, catalog_code) do update
      set snapshot            = excluded.snapshot,
          summary             = excluded.summary,
          source_period_start = excluded.source_period_start,
          source_period_end   = excluded.source_period_end,
          prepared_at         = excluded.prepared_at,
          prepared_by         = excluded.prepared_by,
          source_fingerprint  = excluded.source_fingerprint,
          state = case
            -- Lo que una persona ya decidió sobre la entrada MANDA sobre el
            -- resultado del barrido.
            when quality_management_review_inputs.state = 'not_applicable' then 'not_applicable'
            when quality_management_review_inputs.state = 'reviewed' then 'reviewed'
            when excluded.state = 'missing' then 'missing'
            else 'prepared'
          end
      -- §43 · `analysis`, `analysis_at`, `analysis_by`, `conclusion` y
      -- `requires_decision` NO aparecen en este `set`. Es deliberado.
      where quality_management_review_inputs.state <> 'not_applicable';

    v_count := v_count + 1;
  end loop;

  if v_review.status = 'draft' then
    update quality_management_reviews set status = 'preparing' where id = p_review_id;
  end if;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_review.organization_id, 'management_review', 'management_review.inputs_prepared',
          'quality_management_review', p_review_id,
          'Entradas preparadas para la revisión ' || v_review.code || '.',
          jsonb_build_object('inputs', v_count, 'period_start', v_review.period_start,
                             'period_end', v_review.period_end));

  return v_count;
end;
$$;
revoke all on function public.quality_mr_prepare_inputs(uuid) from public, anon;
grant execute on function public.quality_mr_prepare_inputs(uuid) to authenticated;

comment on function public.quality_mr_prepare_inputs(uuid) is
  'QUALITY-10 · §55/RD-03/RD-09 · Reúne las catorce entradas de forma determinista y NO toca el análisis humano. Las columnas de análisis no aparecen en el `set` del conflicto: es deliberado.';


-- §56/§85 · ¿Cambió la fuente desde que se preparó?
--
-- Devuelve el estado sin tocar nada. La sustitución silenciosa de un retrato
-- ya revisado es exactamente lo que esta función existe para evitar: se AVISA,
-- y refrescar es un acto consciente.
create or replace function public.quality_mr_input_freshness(p_input_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_input   record;
  v_review  record;
  v_payload jsonb;
  v_now     text;
begin
  select * into v_input from quality_management_review_inputs where id = p_input_id;
  if v_input.id is null or not is_org_member(v_input.organization_id) then
    return null;
  end if;
  select * into v_review from quality_management_reviews where id = v_input.review_id;

  if v_input.input_mode = 'manual' then
    return jsonb_build_object('mode', 'manual', 'state', v_input.state,
                              'source_updated', false,
                              'note', 'Entrada manual: no tiene fuente automática que comparar.');
  end if;

  v_payload := quality_mr_source_payload(v_input.organization_id, v_input.catalog_code,
                                         v_review.period_start, v_review.period_end,
                                         v_review.id);
  v_now := case when v_payload is null then null else md5(v_payload::text) end;

  return jsonb_build_object(
    'mode', 'automatic',
    'state', v_input.state,
    'prepared_at', v_input.prepared_at,
    'source_period_start', v_input.source_period_start,
    'source_period_end', v_input.source_period_end,
    'stored_fingerprint', v_input.source_fingerprint,
    'current_fingerprint', v_now,
    -- El único bit que importa. Nada se sustituye por saberlo.
    'source_updated', (v_input.source_fingerprint is not null
                       and v_now is not null
                       and v_input.source_fingerprint <> v_now),
    'has_analysis', nullif(btrim(coalesce(v_input.analysis, '')), '') is not null,
    'note', 'Refrescar es un acto consciente. Ni esta consulta ni el refresco '
            || 'borran el análisis que ya se escribió.');
end;
$$;
revoke all on function public.quality_mr_input_freshness(uuid) from public, anon;
grant execute on function public.quality_mr_input_freshness(uuid) to authenticated;


-- §56 · Refrescar UNA entrada, a propósito.
create or replace function public.quality_mr_refresh_input(p_input_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input   record;
  v_review  record;
  v_payload jsonb;
begin
  select * into v_input from quality_management_review_inputs where id = p_input_id;
  if v_input.id is null then
    raise exception 'Esa entrada no existe.';
  end if;
  if not quality_manages_management_review(v_input.organization_id) then
    raise exception 'Tu rol no permite refrescar las entradas de una revisión por la dirección.';
  end if;
  select * into v_review from quality_management_reviews where id = v_input.review_id;
  if v_review.status in ('closed', 'cancelled') then
    raise exception 'Esta revisión ya está cerrada. Su retrato no se refresca.';
  end if;
  if v_input.input_mode = 'manual' then
    raise exception 'Esta entrada es manual: no tiene fuente automática que refrescar.';
  end if;

  v_payload := quality_mr_source_payload(v_input.organization_id, v_input.catalog_code,
                                         v_review.period_start, v_review.period_end,
                                         v_review.id);

  update quality_management_review_inputs
     set snapshot            = v_payload,
         summary             = quality_mr_summarize(v_input.catalog_code, v_payload),
         source_period_start = v_review.period_start,
         source_period_end   = v_review.period_end,
         prepared_at         = now(),
         prepared_by         = auth.uid(),
         source_fingerprint  = case when v_payload is null then null else md5(v_payload::text) end,
         -- Lo que una persona ya decidió sobre la entrada manda sobre el
         -- resultado del refresco: una entrada REVISADA no vuelve a
         -- «preparada» porque el dato se actualice. Degradarla haría que el
         -- estado de listo mintiera después de cada refresco.
         state = case
           when state = 'not_applicable' then 'not_applicable'
           when state = 'reviewed' then 'reviewed'
           when coalesce((v_payload ->> 'available')::boolean, false) then 'prepared'
           else 'missing'
         end
         -- §43 · El análisis sobrevive al refresco. Siempre.
   where id = p_input_id;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_input.organization_id, 'management_review', 'management_review.input_refreshed',
          'quality_management_review_input', p_input_id,
          'Entrada «' || v_input.catalog_code || '» refrescada en la revisión '
            || v_review.code || '.',
          jsonb_build_object('review_id', v_review.id, 'catalog_code', v_input.catalog_code));

  return quality_mr_input_freshness(p_input_id);
end;
$$;
revoke all on function public.quality_mr_refresh_input(uuid) from public, anon;
grant execute on function public.quality_mr_refresh_input(uuid) to authenticated;

comment on function public.quality_mr_refresh_input(uuid) is
  'QUALITY-10 · §56/§85 · Refrescar es CONSCIENTE y no borra el análisis. Un refresco que se llevara lo escrito enseñaría a no refrescar nunca, y la revisión se cerraría con datos viejos.';


-- §34 · ¿Está lista la revisión para la sesión?
--
-- Cuatro estados y ningún «100 %» de cortesía: si faltan entradas obligatorias,
-- lo dice. Un indicador de preparación que siempre dice «listo» solo enseña a
-- ignorarlo.
create or replace function public.quality_mr_readiness(p_review_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_review record;
  v_total  integer;
  v_ready  integer;
  v_missing integer;
  v_na     integer;
  v_manual integer;
  v_pending integer;
  v_no_analysis integer;
begin
  select * into v_review from quality_management_reviews where id = p_review_id;
  if v_review.id is null or not is_org_member(v_review.organization_id) then
    return null;
  end if;

  select count(*) into v_total from quality_management_review_input_catalog where is_required;

  select
    count(*) filter (where i.state in ('prepared', 'reviewed')),
    count(*) filter (where i.state = 'missing'),
    count(*) filter (where i.state = 'not_applicable'),
    count(*) filter (where i.state = 'pending' and i.input_mode = 'manual'),
    count(*) filter (where i.state = 'pending' and i.input_mode = 'automatic'),
    count(*) filter (where i.state in ('prepared', 'missing')
                       and nullif(btrim(coalesce(i.analysis, '')), '') is null)
    into v_ready, v_missing, v_na, v_manual, v_pending, v_no_analysis
    from quality_management_review_inputs i
   where i.organization_id = v_review.organization_id
     and i.review_id = p_review_id;

  return jsonb_build_object(
    'required_inputs', v_total,
    'ready', coalesce(v_ready, 0),
    'missing', coalesce(v_missing, 0),
    'not_applicable', coalesce(v_na, 0),
    'requires_manual_review', coalesce(v_manual, 0),
    'pending', coalesce(v_pending, 0),
    'without_analysis', coalesce(v_no_analysis, 0),
    'not_prepared', v_total - coalesce(v_ready, 0) - coalesce(v_missing, 0)
                    - coalesce(v_na, 0) - coalesce(v_manual, 0) - coalesce(v_pending, 0),
    -- §34 · Nunca «100 % listo» si falta algo obligatorio.
    'is_ready', coalesce(v_ready, 0) + coalesce(v_na, 0) + coalesce(v_missing, 0) >= v_total
                and coalesce(v_manual, 0) = 0 and coalesce(v_pending, 0) = 0,
    'note', 'Una entrada «faltante» está preparada: se comprobó y no había dato. '
            || 'Una entrada «pendiente» no se ha mirado todavía. No son lo mismo.');
end;
$$;
revoke all on function public.quality_mr_readiness(uuid) from public, anon;
grant execute on function public.quality_mr_readiness(uuid) to authenticated;


-- ============================================================================
-- 15 · DECISIONES Y ACCIONES (§41, §42, §82, RD-06, RD-13, RD-19)
-- ----------------------------------------------------------------------------
-- §82 · El escenario que esto tiene que sostener: la dirección decide
-- «aumentar la capacidad de inspección». Eso son UNA decisión y CERO acciones.
-- Después alguien crea dos acciones. Siguen siendo UNA decisión y DOS acciones.
-- ============================================================================

create or replace function public.quality_mr_record_decision(
  p_review_id       uuid,
  p_topic           text,
  p_decision        text,
  p_decision_kind   text default 'other',
  p_rationale       text default null,
  p_expected_result text default null,
  p_input_id        uuid default null,
  p_owner_position_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review record;
  v_next   integer;
  v_id     uuid;
begin
  select * into v_review from quality_management_reviews where id = p_review_id;
  if v_review.id is null then
    raise exception 'Esa revisión por la dirección no existe.';
  end if;
  if not quality_manages_management_review(v_review.organization_id) then
    raise exception 'Tu rol no permite registrar decisiones de la dirección.';
  end if;
  if v_review.status in ('closed', 'cancelled') then
    raise exception 'Esta revisión ya está cerrada. Añadir una decisión ahora reescribiría lo que la dirección resolvió.';
  end if;
  if nullif(btrim(coalesce(p_decision, '')), '') is null then
    raise exception 'Una decisión sin texto no es una decisión. Escribe qué se resolvió.';
  end if;

  select coalesce(max(substring(code from '[0-9]+$')::integer), 0) + 1 into v_next
    from quality_management_review_decisions
   where organization_id = v_review.organization_id and review_id = p_review_id;

  insert into quality_management_review_decisions
    (organization_id, review_id, code, decision_kind, topic, decision, rationale,
     expected_result, input_id, owner_position_id, decided_by, decided_on)
  values
    (v_review.organization_id, p_review_id, 'D-' || lpad(v_next::text, 2, '0'),
     p_decision_kind, p_topic, p_decision, p_rationale, p_expected_result,
     p_input_id, p_owner_position_id, auth.uid(), current_date)
  returning id into v_id;

  -- §39 · Y queda también como HECHO FORMAL en el motor transversal, que es
  -- donde vive la historia de negocio de toda la plataforma.
  insert into work_decisions (organization_id, subject_kind, subject_id,
                              decision_kind, outcome, rationale, decided_by, context)
  values (v_review.organization_id, 'management_review_decision', v_id,
          'management_review_decision', p_decision, p_rationale, auth.uid(),
          jsonb_build_object('review_id', p_review_id, 'review_code', v_review.code,
                             'topic', p_topic, 'kind', p_decision_kind));

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_review.organization_id, 'management_review',
          'management_review.decision_recorded',
          'quality_management_review_decision', v_id,
          'Decisión registrada en la revisión ' || v_review.code || '.',
          jsonb_build_object('review_id', p_review_id, 'topic', p_topic));

  -- §41/§82 · No se crea ninguna acción aquí. Ninguna. Una decisión puede
  -- vivir sin acciones —«se acepta el nivel actual y se mantiene»— y forzar
  -- una acción por decisión llenaría el motor de trabajo que nadie pidió.
  return v_id;
end;
$$;
revoke all on function public.quality_mr_record_decision(uuid, text, text, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.quality_mr_record_decision(uuid, text, text, text, text, text, uuid, uuid) to authenticated;

comment on function public.quality_mr_record_decision(uuid, text, text, text, text, text, uuid, uuid) is
  'QUALITY-10 · §41/§82 · Registrar una decisión NO crea ninguna acción. Una decisión puede vivir sin acciones, y forzar una por decisión llenaría el motor de trabajo que nadie pidió.';


-- §42/§82 · La acción, cuando alguien decide crearla. Se usa `work_actions`
-- —RD-19— y se ata por `work_references`. Una decisión puede generar 0..N.
create or replace function public.quality_mr_create_action_from_decision(
  p_decision_id uuid,
  p_title       text,
  p_action_kind text default 'improvement',
  p_description text default null,
  p_owner_position_id uuid default null,
  p_due_on      date default null,
  p_requires_effectiveness boolean default false,
  p_effectiveness_criteria text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dec    record;
  v_review record;
  v_code   text;
  v_n      integer;
  v_action uuid;
begin
  select * into v_dec from quality_management_review_decisions where id = p_decision_id;
  if v_dec.id is null then
    raise exception 'Esa decisión no existe.';
  end if;
  if not quality_manages_management_review(v_dec.organization_id) then
    raise exception 'Tu rol no permite crear acciones desde una decisión de la dirección.';
  end if;
  select * into v_review from quality_management_reviews where id = v_dec.review_id;
  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception 'Escribe qué hay que hacer.';
  end if;

  select coalesce(max(substring(code from '[0-9]+$')::integer), 0) + 1 into v_n
    from work_actions where organization_id = v_dec.organization_id and code like 'ACC-%';
  v_code := 'ACC-' || lpad(v_n::text, 4, '0');

  insert into work_actions
    (organization_id, code, action_kind, title, description, expected_result,
     owner_position_id, due_on, original_due_on, status,
     requires_effectiveness, effectiveness_criteria,
     effectiveness_result, created_by)
  values
    (v_dec.organization_id, v_code, p_action_kind, p_title, p_description,
     v_dec.expected_result,
     coalesce(p_owner_position_id, v_dec.owner_position_id), p_due_on, p_due_on,
     'planned',
     p_requires_effectiveness, p_effectiveness_criteria,
     case when p_requires_effectiveness then 'pending' else 'not_required' end,
     auth.uid())
  returning id into v_action;

  -- La atadura, por el motor de referencias transversal. Ni tabla puente
  -- propia, ni columna `action_id` en la decisión: una decisión puede tener
  -- muchas, y muchas es exactamente lo que una columna no sabe guardar.
  insert into work_references (organization_id, owner_kind, owner_id,
                               ref_kind, ref_id, relation, note, created_by)
  values (v_dec.organization_id, 'management_review_decision', p_decision_id,
          'work_action', v_action, 'related',
          'Acción decidida en la revisión por la dirección ' || v_review.code || '.',
          auth.uid());

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_dec.organization_id, 'action', 'action.planned',
          'work_action', v_action,
          'Acción ' || v_code || ' planificada desde una decisión de la dirección.',
          jsonb_build_object('decision_id', p_decision_id, 'review_id', v_dec.review_id));

  return v_action;
end;
$$;
revoke all on function public.quality_mr_create_action_from_decision(uuid, text, text, text, uuid, date, boolean, text) from public, anon;
grant execute on function public.quality_mr_create_action_from_decision(uuid, text, text, text, uuid, date, boolean, text) to authenticated;


-- §45/§84 · El SEGUIMIENTO, siempre VIVO.
--
-- Esta es la contrapartida de que el acta sea una foto: el estado de las
-- acciones se lee AHORA, del motor de acciones, no del retrato del cierre. Una
-- acción que pasa a completada y luego a eficaz se ve aquí y no cambia ni una
-- letra del acta.
create or replace function public.quality_mr_followup(p_review_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_review record;
begin
  select * into v_review from quality_management_reviews where id = p_review_id;
  if v_review.id is null or not is_org_member(v_review.organization_id) then
    return null;
  end if;

  return (
    with acciones as (
      select distinct on (a.id)
             a.id, a.code, a.title, a.status, a.due_on, a.completed_on,
             a.requires_effectiveness, a.effectiveness_result,
             d.code as decision_code, d.topic
        from quality_management_review_decisions d
        join work_references wr
          on wr.organization_id = d.organization_id
         and wr.owner_kind = 'management_review_decision'
         and wr.owner_id = d.id and wr.ref_kind = 'work_action'
        join work_actions a
          on a.organization_id = wr.organization_id and a.id = wr.ref_id
       where d.organization_id = v_review.organization_id
         and d.review_id = p_review_id
    )
    select jsonb_build_object(
      'decisions', (select count(*) from quality_management_review_decisions
                     where organization_id = v_review.organization_id
                       and review_id = p_review_id),
      'actions',   (select count(*) from acciones),
      'open',      (select count(*) from acciones where status in ('planned', 'in_progress')),
      'completed', (select count(*) from acciones where status = 'completed'),
      'cancelled', (select count(*) from acciones where status = 'cancelled'),
      'overdue',   (select count(*) from acciones
                     where status in ('planned', 'in_progress')
                       and due_on is not null and due_on < current_date),
      'effective',     (select count(*) from acciones where effectiveness_result = 'effective'),
      'not_effective', (select count(*) from acciones where effectiveness_result = 'not_effective'),
      'effectiveness_pending', (select count(*) from acciones where effectiveness_result = 'pending'),
      'detail', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'action_id', id, 'code', code, 'title', title, 'status', status,
                 'due_on', due_on, 'completed_on', completed_on,
                 'effectiveness', effectiveness_result,
                 'decision', decision_code, 'topic', topic)
               order by code)
          from acciones), '[]'::jsonb),
      'note', 'Este estado se lee AHORA del motor de acciones. El acta de la '
              || 'revisión no cambia porque una acción avance: son dos capas, y '
              || 'las dos se conservan.')
  );
end;
$$;
revoke all on function public.quality_mr_followup(uuid) from public, anon;
grant execute on function public.quality_mr_followup(uuid) to authenticated;

comment on function public.quality_mr_followup(uuid) is
  'QUALITY-10 · §45/§84 · El seguimiento es VIVO. El acta es una foto. Que una acción avance no cambia ni una letra del acta.';


-- ============================================================================
-- 16 · EL ACTA, EL CIERRE Y LA REAPERTURA (§47, §48, §49, §50, §75)
-- ============================================================================

-- §50/§74 · El acta se DERIVA. Nada de lo que dice se teclea aparte.
create or replace function public.quality_mr_issue_minutes(
  p_review_id uuid, p_summary text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review   record;
  v_snapshot jsonb;
  v_next     integer;
  v_id       uuid;
begin
  select * into v_review from quality_management_reviews where id = p_review_id;
  if v_review.id is null then
    raise exception 'Esa revisión por la dirección no existe.';
  end if;
  if not quality_closes_management_review(v_review.organization_id) then
    raise exception 'Tu rol no permite emitir el acta de una revisión por la dirección.';
  end if;
  if v_review.status not in ('in_review', 'ready_for_review', 'closed') then
    raise exception 'El acta se emite cuando la revisión ya se ha llevado a cabo.';
  end if;
  if nullif(btrim(coalesce(v_review.conclusions, '')), '') is null then
    raise exception 'Un acta sin conclusiones no es un acta. Escríbelas antes de emitirla.';
  end if;

  select jsonb_build_object(
    'review', jsonb_build_object(
      'code', v_review.code, 'title', v_review.title, 'kind', v_review.review_kind,
      'period_label', v_review.period_label,
      'period_start', v_review.period_start, 'period_end', v_review.period_end,
      'session_held_on', v_review.session_held_on,
      'session_location', v_review.session_location,
      'scope_note', v_review.scope_note,
      'conclusions', v_review.conclusions,
      'next_review_planned_on', v_review.next_review_planned_on,
      'next_review_note', v_review.next_review_note),
    -- §70 · Los participantes CON EL CARGO DE ENTONCES.
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', coalesce(pe.full_name, pa.external_name),
               'is_external', pa.person_id is null,
               'role', pa.participation_role,
               'position', pa.position_name_at_review,
               'attended', pa.attended,
               'contribution', pa.contribution_note)
             order by case pa.participation_role when 'chair' then 0 when 'secretary' then 1
                                                 else 2 end,
                      coalesce(pe.full_name, pa.external_name))
        from quality_management_review_participants pa
        left join quality_people pe
          on pe.organization_id = pa.organization_id and pe.id = pa.person_id
       where pa.organization_id = v_review.organization_id and pa.review_id = p_review_id),
      '[]'::jsonb),
    'agenda', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order', ag.position_order, 'title', ag.title,
               'catalog_code', ag.catalog_code, 'time', ag.time_label, 'note', ag.note)
             order by ag.position_order)
        from quality_management_review_agenda_items ag
       where ag.organization_id = v_review.organization_id and ag.review_id = p_review_id),
      '[]'::jsonb),
    -- §18/§75 · Las entradas TAL COMO SE REVISARON, con su dato y su análisis.
    'inputs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', i.catalog_code, 'label', c.label,
               'mode', i.input_mode, 'state', i.state,
               'not_applicable_reason', i.not_applicable_reason,
               'summary', i.summary,
               'snapshot', i.snapshot,
               'source_period_start', i.source_period_start,
               'source_period_end', i.source_period_end,
               'prepared_at', i.prepared_at,
               'analysis', i.analysis,
               'conclusion', i.conclusion,
               'requires_decision', i.requires_decision,
               'manual_entries', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'kind', me.entry_kind, 'resource_kind', me.resource_kind,
                          'title', me.title, 'body', me.body,
                          'recorded_on', me.recorded_on) order by me.recorded_on)
                   from quality_management_review_manual_entries me
                  where me.organization_id = i.organization_id and me.input_id = i.id),
                 '[]'::jsonb))
             order by i.position_order)
        from quality_management_review_inputs i
        join quality_management_review_input_catalog c on c.code = i.catalog_code
       where i.organization_id = v_review.organization_id and i.review_id = p_review_id),
      '[]'::jsonb),
    'decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', d.code, 'kind', d.decision_kind, 'topic', d.topic,
               'decision', d.decision, 'rationale', d.rationale,
               'expected_result', d.expected_result, 'decided_on', d.decided_on,
               -- Las acciones que existían AL EMITIR. El estado vivo se lee
               -- del seguimiento, no de aquí.
               'actions_at_issue', coalesce((
                 select jsonb_agg(jsonb_build_object('code', a.code, 'title', a.title,
                                                     'status', a.status, 'due_on', a.due_on))
                   from work_references wr
                   join work_actions a
                     on a.organization_id = wr.organization_id and a.id = wr.ref_id
                  where wr.organization_id = d.organization_id
                    and wr.owner_kind = 'management_review_decision'
                    and wr.owner_id = d.id and wr.ref_kind = 'work_action'),
                 '[]'::jsonb))
             order by d.code)
        from quality_management_review_decisions d
       where d.organization_id = v_review.organization_id and d.review_id = p_review_id),
      '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('recorded_on', n.recorded_on, 'body', n.body)
             order by n.recorded_on)
        from quality_management_review_notes n
       where n.organization_id = v_review.organization_id and n.review_id = p_review_id),
      '[]'::jsonb),
    'readiness_at_issue', quality_mr_readiness(p_review_id),
    'followup_at_issue', quality_mr_followup(p_review_id)
  ) into v_snapshot;

  select coalesce(max(version_number), 0) + 1 into v_next
    from quality_management_review_minutes where review_id = p_review_id;

  insert into quality_management_review_minutes
    (organization_id, review_id, version_number, issued_by, summary, snapshot, supersedes_id)
  values
    (v_review.organization_id, p_review_id, v_next, auth.uid(),
     coalesce(p_summary, v_review.conclusions), v_snapshot,
     (select id from quality_management_review_minutes
       where review_id = p_review_id order by version_number desc limit 1))
  returning id into v_id;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_review.organization_id, 'management_review',
          'management_review.minutes_issued',
          'quality_management_review', p_review_id,
          'Acta de la revisión ' || v_review.code || ' emitida (versión ' || v_next || ').',
          jsonb_build_object('minutes_id', v_id, 'version', v_next));

  return v_id;
end;
$$;
revoke all on function public.quality_mr_issue_minutes(uuid, text) from public, anon;
grant execute on function public.quality_mr_issue_minutes(uuid, text) to authenticated;

comment on function public.quality_mr_issue_minutes(uuid, text) is
  'QUALITY-10 · §50/§75/RD-07 · El acta se DERIVA del modelo y se congela. Reimprimir el acta de 2027 en 2029 devuelve 2027, incluidas las entradas tal como se revisaron.';


-- §48/§83 · CERRAR. Exige entradas revisadas, análisis suficiente, decisiones
-- o salidas, y una nota de cierre. NO exige que las acciones estén terminadas:
-- exigirlo produce revisiones abiertas durante años por una acción de nadie.
create or replace function public.quality_mr_close_review(
  p_review_id uuid, p_closure_note text, p_followup_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review    record;
  v_pending   integer;
  v_decisions integer;
  v_analysis  integer;
begin
  select * into v_review from quality_management_reviews where id = p_review_id;
  if v_review.id is null then
    raise exception 'Esa revisión por la dirección no existe.';
  end if;
  if not quality_closes_management_review(v_review.organization_id) then
    raise exception 'Tu rol no permite cerrar una revisión por la dirección.';
  end if;
  if v_review.status = 'closed' then
    raise exception 'Esta revisión ya está cerrada.';
  end if;
  if v_review.status = 'cancelled' then
    raise exception 'Esta revisión está cancelada.';
  end if;
  if nullif(btrim(coalesce(p_closure_note, '')), '') is null then
    raise exception 'Escribe por qué se cierra la revisión.';
  end if;
  if nullif(btrim(coalesce(v_review.conclusions, '')), '') is null then
    raise exception 'Una revisión sin conclusiones no está revisada. Escríbelas antes de cerrarla.';
  end if;

  select count(*) into v_pending
    from quality_management_review_inputs
   where organization_id = v_review.organization_id and review_id = p_review_id
     and state = 'pending';
  if v_pending > 0 then
    raise exception 'Quedan % entrada(s) sin mirar. Una entrada «faltante» está revisada; una «pendiente» no.', v_pending;
  end if;

  select count(*) into v_analysis
    from quality_management_review_inputs
   where organization_id = v_review.organization_id and review_id = p_review_id
     and state in ('prepared', 'missing')
     and nullif(btrim(coalesce(analysis, '')), '') is null;
  if v_analysis > 0 then
    raise exception 'Quedan % entrada(s) sin análisis. El dato no es la conclusión: alguien tiene que decir qué significa.', v_analysis;
  end if;

  select count(*) into v_decisions
    from quality_management_review_decisions
   where organization_id = v_review.organization_id and review_id = p_review_id;
  if v_decisions = 0 then
    raise exception 'Una revisión por la dirección sin ninguna decisión no es una revisión: es una presentación. Registra al menos una salida.';
  end if;

  update quality_management_reviews
     set status = 'closed',
         closed_at = now(),
         closed_by = auth.uid(),
         closure_note = p_closure_note,
         followup_note = p_followup_note
   where id = p_review_id;

  insert into work_decisions (organization_id, subject_kind, subject_id,
                              decision_kind, outcome, rationale, decided_by, context)
  values (v_review.organization_id, 'management_review', p_review_id,
          'management_review_closed', 'closed', p_closure_note, auth.uid(),
          jsonb_build_object('code', v_review.code, 'period', v_review.period_label,
                             'decisions', v_decisions,
                             'followup', quality_mr_followup(p_review_id)));

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_review.organization_id, 'management_review', 'management_review.closed',
          'quality_management_review', p_review_id,
          'Revisión por la dirección ' || v_review.code || ' cerrada.',
          jsonb_build_object('decisions', v_decisions));
end;
$$;
revoke all on function public.quality_mr_close_review(uuid, text, text) from public, anon;
grant execute on function public.quality_mr_close_review(uuid, text, text) to authenticated;

comment on function public.quality_mr_close_review(uuid, text, text) is
  'QUALITY-10 · §48/§83 · Cerrar exige entradas miradas, análisis y al menos una decisión. NO exige acciones terminadas: exigirlo produce revisiones abiertas durante años por una acción de nadie.';


-- §47 · REABRIR es excepcional. Nunca destruye el cierre original: lo cuenta.
-- Y la vía preferente sigue siendo emitir un acta que CORRIJA a la anterior,
-- que no obliga a tocar la revisión.
create or replace function public.quality_mr_reopen_review(
  p_review_id uuid, p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review record;
begin
  select * into v_review from quality_management_reviews where id = p_review_id;
  if v_review.id is null then
    raise exception 'Esa revisión por la dirección no existe.';
  end if;
  if not quality_closes_management_review(v_review.organization_id) then
    raise exception 'Tu rol no permite reabrir una revisión por la dirección.';
  end if;
  if v_review.status <> 'closed' then
    raise exception 'Solo se reabre lo que está cerrado.';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null or length(btrim(p_reason)) < 20 then
    raise exception 'Reabrir una revisión cerrada es excepcional. Escribe con detalle por qué.';
  end if;

  -- Un solo `update`: la restricción exige que el estado y `closed_at` se
  -- muevan a la vez. `closure_note` y `closed_by` NO se tocan — el cierre
  -- original sigue escrito en la fila, y el hecho formal guarda además la
  -- fecha exacta en la que se cerró.
  update quality_management_reviews
     set status = 'in_review',
         closed_at = null,
         reopened_at = now(),
         reopened_by = auth.uid(),
         reopen_reason = p_reason,
         reopen_count = reopen_count + 1
   where id = p_review_id;

  insert into work_decisions (organization_id, subject_kind, subject_id,
                              decision_kind, outcome, rationale, decided_by, context)
  values (v_review.organization_id, 'management_review', p_review_id,
          'management_review_reopened', 'reopened', p_reason, auth.uid(),
          jsonb_build_object('code', v_review.code,
                             'closed_at_before', v_review.closed_at,
                             'closure_note_before', v_review.closure_note,
                             'reopen_count', v_review.reopen_count + 1));

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_review.organization_id, 'management_review', 'management_review.reopened',
          'quality_management_review', p_review_id,
          'Revisión por la dirección ' || v_review.code || ' reabierta.',
          jsonb_build_object('reason', p_reason));
end;
$$;
revoke all on function public.quality_mr_reopen_review(uuid, text) from public, anon;
grant execute on function public.quality_mr_reopen_review(uuid, text) to authenticated;

comment on function public.quality_mr_reopen_review(uuid, text) is
  'QUALITY-10 · §47 · Reabrir es excepcional, exige motivo detallado y NO destruye el cierre original: lo cuenta. La vía preferente es un acta que corrija a la anterior.';


-- ============================================================================
-- 17 · INMUTABILIDAD AL CERRAR (§49)
-- ----------------------------------------------------------------------------
-- Después de cerrar, no se modifica en silencio: ni el periodo, ni el retrato
-- de las entradas, ni el análisis, ni las decisiones, ni los participantes, ni
-- las conclusiones. Las ACCIONES relacionadas siguen evolucionando en su propio
-- motor — esa es toda la diferencia entre el acta y el seguimiento.
-- ============================================================================

create or replace function public.quality_mr_review_is_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
    from quality_management_reviews
   where id = coalesce(
     case tg_table_name
       when 'quality_management_review_inputs' then coalesce(new.review_id, old.review_id)
       when 'quality_management_review_decisions' then coalesce(new.review_id, old.review_id)
       when 'quality_management_review_participants' then coalesce(new.review_id, old.review_id)
       when 'quality_management_review_manual_entries' then coalesce(new.review_id, old.review_id)
       when 'quality_management_review_agenda_items' then coalesce(new.review_id, old.review_id)
     end);

  if v_status in ('closed', 'cancelled') then
    raise exception 'Esta revisión por la dirección está cerrada. Lo que la dirección revisó y decidió no se reescribe: si hay que corregir algo, se emite un acta que corrija a la anterior.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger t_quality_mr_inputs_closed_guard
  before insert or update or delete on public.quality_management_review_inputs
  for each row execute function public.quality_mr_review_is_closed();
create trigger t_quality_mr_decisions_closed_guard
  before insert or update or delete on public.quality_management_review_decisions
  for each row execute function public.quality_mr_review_is_closed();
create trigger t_quality_mr_participants_closed_guard
  before insert or update or delete on public.quality_management_review_participants
  for each row execute function public.quality_mr_review_is_closed();
create trigger t_quality_mr_manual_closed_guard
  before insert or update or delete on public.quality_management_review_manual_entries
  for each row execute function public.quality_mr_review_is_closed();
create trigger t_quality_mr_agenda_closed_guard
  before insert or update or delete on public.quality_management_review_agenda_items
  for each row execute function public.quality_mr_review_is_closed();


-- §49 · Y la propia revisión: cerrada, no cambia de periodo ni de conclusiones
-- por la puerta de atrás. Lo único que puede moverse es el estado —para
-- reabrirla— y las columnas del propio cierre.
create or replace function public.quality_mr_closed_is_final()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'closed' then
    return new;
  end if;
  -- Reabrir pasa por su RPC y cambia el estado. Eso sí está permitido.
  if new.status <> 'closed' then
    return new;
  end if;
  if new.period_start is distinct from old.period_start
     or new.period_end is distinct from old.period_end
     or new.conclusions is distinct from old.conclusions
     or new.closure_note is distinct from old.closure_note
     or new.code is distinct from old.code then
    raise exception 'Esta revisión está cerrada: su periodo, sus conclusiones y su cierre no se reescriben.';
  end if;
  return new;
end;
$$;

create trigger t_quality_mr_closed_is_final
  before update on public.quality_management_reviews
  for each row execute function public.quality_mr_closed_is_final();


-- ============================================================================
-- 18 · EL BARRIDO (§44, §94)
-- ----------------------------------------------------------------------------
-- Idempotente. Todo lo que produce son AVISOS y TAREAS: ninguna rama concluye,
-- decide, cierra una revisión, crea una acción ni cambia un estado.
--
-- §94 · Y deja a QUALITY-11 lo que necesita para detectar después: revisión
-- próxima, entrada pendiente, revisión vencida, acción vencida y fuente
-- actualizada. Los cinco existen ya como tipos de aviso.
-- ============================================================================

create or replace function public.quality_mr_notice_recipient(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id
    from memberships m
   where m.organization_id = p_organization_id
     and m.status = 'active'
     and m.role_code in ('quality', 'admin')
   order by case m.role_code when 'quality' then 0 else 1 end, m.created_at, m.user_id
   limit 1;
$$;
revoke all on function public.quality_mr_notice_recipient(uuid) from public, anon, authenticated;


create or replace function public.quality_scan_management_reviews(
  p_organization_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Lo que devuelve es lo que ha CREADO en esta pasada, no cuántos avisos hay.
  v_count integer := 0;
  v_n     integer := 0;
begin
  if auth.uid() is not null then
    if p_organization_id is null then
      raise exception 'Indica sobre qué empresa quieres revisar las revisiones por la dirección.';
    end if;
    if not is_org_member(p_organization_id) then
      raise exception 'No tienes acceso a esa empresa.';
    end if;
  end if;

  -- 18.1 · Revisión programada que se acerca.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select r.organization_id, 'management_review', 'management_review_due', 'info',
         'quality_management_review', r.id,
         quality_mr_notice_recipient(r.organization_id),
         'Revisión por la dirección próxima: ' || r.title,
         'Prevista para el ' || to_char(r.next_review_planned_on, 'DD/MM/YYYY')
           || '. Conviene empezar a preparar las entradas.',
         'mr_due:' || r.id::text || ':' || r.next_review_planned_on::text
    from quality_management_reviews r
   where r.next_review_planned_on is not null
     and r.next_review_planned_on between current_date and current_date + 30
     and quality_mr_notice_recipient(r.organization_id) is not null
     and (p_organization_id is null or r.organization_id = p_organization_id)
     and not exists (select 1 from work_alerts w
                      where w.dedupe_key = 'mr_due:' || r.id::text || ':' || r.next_review_planned_on::text);
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- 18.2 · Revisión en preparación con entradas todavía sin mirar.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select r.organization_id, 'management_review', 'management_review_input_pending', 'warning',
         'quality_management_review', r.id,
         quality_mr_notice_recipient(r.organization_id),
         'Entradas pendientes: ' || r.title,
         'La revisión sigue con entradas sin mirar. Una entrada «faltante» está '
           || 'revisada; una «pendiente» no.',
         'mr_input_pending:' || r.id::text
    from quality_management_reviews r
   where r.status in ('preparing', 'ready_for_review', 'in_review')
     and exists (select 1 from quality_management_review_inputs i
                  where i.organization_id = r.organization_id
                    and i.review_id = r.id and i.state = 'pending')
     and quality_mr_notice_recipient(r.organization_id) is not null
     and (p_organization_id is null or r.organization_id = p_organization_id)
     and not exists (select 1 from work_alerts w
                      where w.dedupe_key = 'mr_input_pending:' || r.id::text);
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                          title, description, assignee_profile_id, assignee_position_id,
                          status, dedupe_key)
  select r.organization_id, 'management_review', 'management_review_preparation',
         'quality_management_review', r.id,
         'Preparar las entradas de ' || r.code,
         'Periodo ' || r.period_label || '.',
         quality_mr_notice_recipient(r.organization_id), r.owner_position_id,
         'open', 'mr_prepare:' || r.id::text
    from quality_management_reviews r
   where r.status in ('draft', 'preparing')
     and quality_mr_notice_recipient(r.organization_id) is not null
     and (p_organization_id is null or r.organization_id = p_organization_id)
     and not exists (select 1 from work_tasks w
                      where w.dedupe_key = 'mr_prepare:' || r.id::text);
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- 18.3 · Revisión que pasó de su fecha prevista y sigue sin cerrarse.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select r.organization_id, 'management_review', 'management_review_overdue', 'warning',
         'quality_management_review', r.id,
         quality_mr_notice_recipient(r.organization_id),
         'Revisión vencida: ' || r.title,
         'El periodo terminó el ' || to_char(r.period_end, 'DD/MM/YYYY')
           || ' y la revisión sigue sin cerrarse.',
         'mr_overdue:' || r.id::text || ':' || r.period_end::text
    from quality_management_reviews r
   where r.status in ('draft', 'preparing', 'ready_for_review', 'in_review')
     and r.period_end < current_date - 90
     and quality_mr_notice_recipient(r.organization_id) is not null
     and (p_organization_id is null or r.organization_id = p_organization_id)
     and not exists (select 1 from work_alerts w
                      where w.dedupe_key = 'mr_overdue:' || r.id::text || ':' || r.period_end::text);
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- 18.4 · Acción de una decisión de la dirección, vencida.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select distinct on (a.id)
         a.organization_id, 'management_review', 'management_review_action_overdue', 'warning',
         'work_action', a.id,
         quality_mr_notice_recipient(a.organization_id),
         'Acción de la dirección vencida: ' || a.code,
         'Salió de una decisión de la revisión por la dirección y venció el '
           || to_char(a.due_on, 'DD/MM/YYYY') || '.',
         'mr_action_overdue:' || a.id::text || ':' || a.due_on::text
    from work_actions a
    join work_references wr
      on wr.organization_id = a.organization_id and wr.ref_kind = 'work_action'
     and wr.ref_id = a.id and wr.owner_kind = 'management_review_decision'
   where a.status in ('planned', 'in_progress')
     and a.due_on is not null and a.due_on < current_date
     and quality_mr_notice_recipient(a.organization_id) is not null
     and (p_organization_id is null or a.organization_id = p_organization_id)
     and not exists (select 1 from work_alerts w
                      where w.dedupe_key = 'mr_action_overdue:' || a.id::text || ':' || a.due_on::text);
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  return coalesce(v_count, 0);
end;
$$;
revoke all on function public.quality_scan_management_reviews(uuid) from public, anon;
grant execute on function public.quality_scan_management_reviews(uuid) to authenticated;

comment on function public.quality_scan_management_reviews(uuid) is
  'QUALITY-10 · §44/§94 · Solo produce avisos y tareas. Ninguna rama concluye, decide, cierra una revisión, crea una acción ni cambia un estado.';


-- ============================================================================
-- 19 · VISTAS (§89, §92)
-- ----------------------------------------------------------------------------
-- `security_invoker`: deciden las mismas políticas que las tablas. Y ninguna
-- copia contadores: el seguimiento se deriva del motor de acciones, siempre.
-- ============================================================================

create or replace view public.v_quality_management_review_overview
with (security_invoker = true) as
select
  r.organization_id,
  r.id as review_id,
  r.code, r.title, r.review_kind, r.status,
  r.period_label, r.period_start, r.period_end,
  r.session_held_on,
  r.owner_position_id, po.name as owner_position_name,
  r.closed_at, r.next_review_planned_on, r.reopen_count,
  r.created_at,
  coalesce(i.total, 0)          as input_count,
  coalesce(i.prepared, 0)       as inputs_prepared,
  coalesce(i.reviewed, 0)       as inputs_reviewed,
  coalesce(i.missing, 0)        as inputs_missing,
  coalesce(i.not_applicable, 0) as inputs_not_applicable,
  coalesce(i.pending, 0)        as inputs_pending,
  coalesce(i.with_analysis, 0)  as inputs_with_analysis,
  coalesce(i.requires_decision, 0) as inputs_requiring_decision,
  coalesce(p.total, 0)          as participant_count,
  coalesce(p.attended, 0)       as participants_attended,
  coalesce(d.total, 0)          as decision_count,
  coalesce(m.total, 0)          as minutes_count,
  -- §45 · Derivado del motor transversal. Nunca copiado.
  coalesce(a.total, 0)          as action_count,
  coalesce(a.open, 0)           as open_action_count,
  coalesce(a.overdue, 0)        as overdue_action_count,
  coalesce(a.effective, 0)      as effective_action_count
from public.quality_management_reviews r
left join public.quality_positions po
  on po.organization_id = r.organization_id and po.id = r.owner_position_id
left join lateral (
  select count(*) as total,
         count(*) filter (where x.state = 'prepared') as prepared,
         count(*) filter (where x.state = 'reviewed') as reviewed,
         count(*) filter (where x.state = 'missing') as missing,
         count(*) filter (where x.state = 'not_applicable') as not_applicable,
         count(*) filter (where x.state = 'pending') as pending,
         count(*) filter (where nullif(btrim(coalesce(x.analysis, '')), '') is not null) as with_analysis,
         count(*) filter (where x.requires_decision) as requires_decision
    from public.quality_management_review_inputs x
   where x.organization_id = r.organization_id and x.review_id = r.id) i on true
left join lateral (
  select count(*) as total, count(*) filter (where x.attended) as attended
    from public.quality_management_review_participants x
   where x.organization_id = r.organization_id and x.review_id = r.id) p on true
left join lateral (
  select count(*) as total
    from public.quality_management_review_decisions x
   where x.organization_id = r.organization_id and x.review_id = r.id) d on true
left join lateral (
  select count(*) as total
    from public.quality_management_review_minutes x
   where x.organization_id = r.organization_id and x.review_id = r.id) m on true
left join lateral (
  select count(distinct act.id) as total,
         count(distinct act.id) filter (where act.status in ('planned', 'in_progress')) as open,
         count(distinct act.id) filter (where act.status in ('planned', 'in_progress')
                                          and act.due_on is not null
                                          and act.due_on < current_date) as overdue,
         count(distinct act.id) filter (where act.effectiveness_result = 'effective') as effective
    from public.quality_management_review_decisions dd
    join public.work_references wr
      on wr.organization_id = dd.organization_id
     and wr.owner_kind = 'management_review_decision'
     and wr.owner_id = dd.id and wr.ref_kind = 'work_action'
    join public.work_actions act
      on act.organization_id = wr.organization_id and act.id = wr.ref_id
   where dd.organization_id = r.organization_id and dd.review_id = r.id) a on true;

comment on view public.v_quality_management_review_overview is
  'QUALITY-10 · El estado de cada revisión. Las acciones se DERIVAN del motor transversal: copiarlas en una columna las desincronizaría el primer día.';

revoke all on public.v_quality_management_review_overview from anon, authenticated;
grant select on public.v_quality_management_review_overview to authenticated;


-- §20/§107/RD-16 · La comparación entre revisiones. Permite ver la misma
-- entrada en dos periodos y decir si mejoró, empeoró o no se sabe.
create or replace view public.v_quality_management_review_input_status
with (security_invoker = true) as
select
  i.organization_id,
  i.id as input_id,
  i.review_id,
  r.code as review_code,
  r.period_label,
  r.period_start, r.period_end,
  r.status as review_status,
  i.catalog_code,
  c.label as catalog_label,
  c.position_order as catalog_order,
  i.input_mode, i.state,
  i.summary,
  i.source_domain, i.source_period_start, i.source_period_end,
  i.prepared_at, i.source_fingerprint,
  (nullif(btrim(coalesce(i.analysis, '')), '') is not null) as has_analysis,
  (nullif(btrim(coalesce(i.conclusion, '')), '') is not null) as has_conclusion,
  i.requires_decision,
  coalesce(me.total, 0) as manual_entry_count,
  coalesce(dc.total, 0) as decision_count
from public.quality_management_review_inputs i
join public.quality_management_reviews r
  on r.organization_id = i.organization_id and r.id = i.review_id
join public.quality_management_review_input_catalog c on c.code = i.catalog_code
left join lateral (
  select count(*) as total from public.quality_management_review_manual_entries x
   where x.organization_id = i.organization_id and x.input_id = i.id) me on true
left join lateral (
  select count(*) as total from public.quality_management_review_decisions x
   where x.organization_id = i.organization_id and x.input_id = i.id) dc on true;

revoke all on public.v_quality_management_review_input_status from anon, authenticated;
grant select on public.v_quality_management_review_input_status to authenticated;


-- §41/§82 · Las decisiones con sus acciones. La columna que demuestra que
-- «una decisión» y «dos acciones» son números distintos.
create or replace view public.v_quality_management_review_decision_actions
with (security_invoker = true) as
select
  d.organization_id,
  d.id as decision_id,
  d.review_id,
  r.code as review_code,
  d.code, d.decision_kind, d.topic, d.decision, d.rationale,
  d.expected_result, d.decided_on, d.input_id,
  d.owner_position_id, po.name as owner_position_name,
  coalesce(a.total, 0)     as action_count,
  coalesce(a.open, 0)      as open_action_count,
  coalesce(a.completed, 0) as completed_action_count,
  coalesce(a.overdue, 0)   as overdue_action_count,
  coalesce(a.effective, 0) as effective_action_count,
  coalesce(a.not_effective, 0) as not_effective_action_count
from public.quality_management_review_decisions d
join public.quality_management_reviews r
  on r.organization_id = d.organization_id and r.id = d.review_id
left join public.quality_positions po
  on po.organization_id = d.organization_id and po.id = d.owner_position_id
left join lateral (
  select count(distinct act.id) as total,
         count(distinct act.id) filter (where act.status in ('planned', 'in_progress')) as open,
         count(distinct act.id) filter (where act.status = 'completed') as completed,
         count(distinct act.id) filter (where act.status in ('planned', 'in_progress')
                                          and act.due_on is not null
                                          and act.due_on < current_date) as overdue,
         count(distinct act.id) filter (where act.effectiveness_result = 'effective') as effective,
         count(distinct act.id) filter (where act.effectiveness_result = 'not_effective') as not_effective
    from public.work_references wr
    join public.work_actions act
      on act.organization_id = wr.organization_id and act.id = wr.ref_id
   where wr.organization_id = d.organization_id
     and wr.owner_kind = 'management_review_decision'
     and wr.owner_id = d.id and wr.ref_kind = 'work_action') a on true;

comment on view public.v_quality_management_review_decision_actions is
  'QUALITY-10 · §41/§82 · Una decisión y sus 0..N acciones, en columnas distintas. Es la vista que demuestra que no son el mismo número.';

revoke all on public.v_quality_management_review_decision_actions from anon, authenticated;
grant select on public.v_quality_management_review_decision_actions to authenticated;


-- ============================================================================
-- 20 · CICLO DE VIDA Y BORRADO (§68, §88)
-- ----------------------------------------------------------------------------
-- Un borrador vacío se borra. Una revisión con análisis, decisiones o acta NO:
-- lo que la dirección revisó y decidió no desaparece porque alguien pulse un
-- botón. Cerrada, tampoco.
-- ============================================================================

create or replace function public.quality_management_review_deletion_verdict(p_review_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_review    record;
  v_blocking  jsonb := '[]'::jsonb;
  v_inputs    integer;
  v_analysis  integer;
  v_decisions integer;
  v_minutes   integer;
  v_manual    integer;
begin
  select * into v_review from quality_management_reviews where id = p_review_id;
  if v_review.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
                              'reason', 'Esta revisión por la dirección no existe.',
                              'blocking', '[]'::jsonb);
  end if;

  select count(*) into v_inputs from quality_management_review_inputs
   where review_id = p_review_id;
  select count(*) into v_analysis from quality_management_review_inputs
   where review_id = p_review_id
     and nullif(btrim(coalesce(analysis, '')), '') is not null;
  select count(*) into v_decisions from quality_management_review_decisions
   where review_id = p_review_id;
  select count(*) into v_minutes from quality_management_review_minutes
   where review_id = p_review_id;
  select count(*) into v_manual from quality_management_review_manual_entries
   where review_id = p_review_id;

  if v_analysis > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', 'entrada(s) con análisis escrito', 'count', v_analysis);
  end if;
  if v_decisions > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', 'decisión(es) de la dirección', 'count', v_decisions);
  end if;
  if v_minutes > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', 'acta(s) emitidas', 'count', v_minutes);
  end if;
  if v_manual > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', 'entrada(s) manuales de la dirección', 'count', v_manual);
  end if;

  if v_review.status in ('closed', 'cancelled') then
    return jsonb_build_object(
      'can_hard_delete', false, 'reason_code', 'retired',
      'reason', 'Esta revisión ya está cerrada. Lo que la dirección revisó y '
                || 'decidió se conserva: es la prueba de que el sistema se revisó.',
      'blocking', v_blocking,
      'alternative', null, 'alternative_label', null);
  end if;

  if jsonb_array_length(v_blocking) > 0 then
    return jsonb_build_object(
      'can_hard_delete', false, 'reason_code', 'has_history',
      'reason', 'Esta revisión ya tiene historia.',
      'blocking', v_blocking,
      'alternative', 'close',
      'alternative_label', 'Puedes cerrarla o cancelarla dejando dicho por qué');
  end if;

  return jsonb_build_object(
    'can_hard_delete', true, 'reason_code', 'disposable',
    'reason', 'Esta revisión sigue siendo un borrador sin análisis, sin '
              || 'decisiones y sin acta.',
    'blocking', case when v_inputs > 0
      then jsonb_build_array(jsonb_build_object(
             'label', 'entrada(s) preparadas, sin analizar', 'count', v_inputs))
      else '[]'::jsonb end,
    'alternative', null, 'alternative_label', null);
end;
$$;
revoke all on function public.quality_management_review_deletion_verdict(uuid) from public, anon;
grant execute on function public.quality_management_review_deletion_verdict(uuid) to authenticated;


-- La puerta única de siempre, ampliada a veintiuna entidades. Las DOS guardas
-- heredadas —la sesión y la lectura de personas— se conservan verbatim: en
-- QUALITY-08 una reescritura equivalente las perdió, y lo detectó la regresión
-- de QUALITY-06, no una prueba del sprint.
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
  end;
end;
$$;
revoke all on function public.quality_deletion_eligibility(text, uuid) from public, anon;
grant execute on function public.quality_deletion_eligibility(text, uuid) to authenticated;


-- §67 · Y la guarda en la BASE, no solo en la pantalla. Un `delete` directo por
-- PostgREST pasa por aquí igual que un botón.
create or replace function public.quality_management_review_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  v := quality_management_review_deletion_verdict(old.id);
  if coalesce((v ->> 'can_hard_delete')::boolean, false) then
    return old;
  end if;
  raise exception '%', coalesce(v ->> 'reason',
    'Esta revisión por la dirección no se puede eliminar.');
end;
$$;

create trigger t_quality_management_review_delete_guard
  before delete on public.quality_management_reviews
  for each row execute function public.quality_management_review_delete_guard();


-- ============================================================================
-- 21 · RLS Y PRIVILEGIOS (§61, §65, §66, §67)
-- ----------------------------------------------------------------------------
-- Supabase concede por defecto TRUNCATE, REFERENCES y TRIGGER sobre cada tabla
-- nueva. Por eso cada una REVOCA primero y concede después, explícitamente.
--
-- §61 · La revisión agrega información de dominios con permisos más estrechos.
-- Eso NO convierte a sus participantes en lectores de todo: lo que se guarda
-- aquí son AGREGADOS y REFERENCIAS. El detalle crudo sigue detrás de las
-- políticas de su propio dominio, y el enlace de profundización solo funciona
-- para quien ya tenía permiso allí.
--
-- §64 · En particular: aquí no hay ni una nota de entrevista de auditoría, ni
-- una respuesta de encuesta, ni una evaluación individual de desempeño.
-- ============================================================================

alter table public.quality_management_reviews               enable row level security;
alter table public.quality_management_review_participants   enable row level security;
alter table public.quality_management_review_agenda_items   enable row level security;
alter table public.quality_management_review_inputs         enable row level security;
alter table public.quality_management_review_manual_entries enable row level security;
alter table public.quality_management_review_decisions      enable row level security;
alter table public.quality_management_review_notes          enable row level security;
alter table public.quality_management_review_minutes        enable row level security;

-- Lectura: quien pertenece a la empresa. La revisión por la dirección es el
-- documento que la organización se debe a sí misma.
create policy quality_mr_reviews_select on public.quality_management_reviews
  for select to authenticated using (is_org_member(organization_id));
create policy quality_mr_participants_select on public.quality_management_review_participants
  for select to authenticated using (is_org_member(organization_id));
create policy quality_mr_agenda_select on public.quality_management_review_agenda_items
  for select to authenticated using (is_org_member(organization_id));
create policy quality_mr_inputs_select on public.quality_management_review_inputs
  for select to authenticated using (is_org_member(organization_id));
create policy quality_mr_manual_select on public.quality_management_review_manual_entries
  for select to authenticated using (is_org_member(organization_id));
create policy quality_mr_decisions_select on public.quality_management_review_decisions
  for select to authenticated using (is_org_member(organization_id));
create policy quality_mr_notes_select on public.quality_management_review_notes
  for select to authenticated using (is_org_member(organization_id));
create policy quality_mr_minutes_select on public.quality_management_review_minutes
  for select to authenticated using (is_org_member(organization_id));

-- Escritura: quien conduce el dominio.
create policy quality_mr_reviews_write on public.quality_management_reviews
  for all to authenticated
  using (quality_manages_management_review(organization_id))
  with check (quality_manages_management_review(organization_id));
create policy quality_mr_participants_write on public.quality_management_review_participants
  for all to authenticated
  using (quality_manages_management_review(organization_id))
  with check (quality_manages_management_review(organization_id));
create policy quality_mr_agenda_write on public.quality_management_review_agenda_items
  for all to authenticated
  using (quality_manages_management_review(organization_id))
  with check (quality_manages_management_review(organization_id));
create policy quality_mr_inputs_write on public.quality_management_review_inputs
  for all to authenticated
  using (quality_manages_management_review(organization_id))
  with check (quality_manages_management_review(organization_id));
create policy quality_mr_manual_write on public.quality_management_review_manual_entries
  for all to authenticated
  using (quality_manages_management_review(organization_id))
  with check (quality_manages_management_review(organization_id));
create policy quality_mr_notes_write on public.quality_management_review_notes
  for all to authenticated
  using (quality_manages_management_review(organization_id))
  with check (quality_manages_management_review(organization_id));

-- §39 · Las DECISIONES no se editan libremente: se registran por su RPC, que
-- deja también el hecho formal en el motor transversal. Solo se permite
-- corregir la redacción mientras la revisión sigue abierta, y borrarlas
-- mientras nadie haya emitido acta.
create policy quality_mr_decisions_update on public.quality_management_review_decisions
  for update to authenticated
  using (quality_manages_management_review(organization_id))
  with check (quality_manages_management_review(organization_id));
create policy quality_mr_decisions_delete on public.quality_management_review_decisions
  for delete to authenticated
  using (quality_manages_management_review(organization_id));

-- §50 · El ACTA no tiene política de INSERT, UPDATE ni DELETE. La única puerta
-- es `quality_mr_issue_minutes`, que comprueba rol, estado y conclusiones en
-- el mismo acto en que congela el retrato. Un acta editable no es un acta.

revoke all on table public.quality_management_reviews               from anon, authenticated;
revoke all on table public.quality_management_review_participants   from anon, authenticated;
revoke all on table public.quality_management_review_agenda_items   from anon, authenticated;
revoke all on table public.quality_management_review_inputs         from anon, authenticated;
revoke all on table public.quality_management_review_manual_entries from anon, authenticated;
revoke all on table public.quality_management_review_decisions      from anon, authenticated;
revoke all on table public.quality_management_review_notes          from anon, authenticated;
revoke all on table public.quality_management_review_minutes        from anon, authenticated;

grant select, insert, update, delete on table public.quality_management_reviews               to authenticated;
grant select, insert, update, delete on table public.quality_management_review_participants   to authenticated;
grant select, insert, update, delete on table public.quality_management_review_agenda_items   to authenticated;
grant select, insert, update, delete on table public.quality_management_review_inputs         to authenticated;
grant select, insert, update, delete on table public.quality_management_review_manual_entries to authenticated;
grant select, insert, update, delete on table public.quality_management_review_decisions      to authenticated;
grant select, insert, update, delete on table public.quality_management_review_notes          to authenticated;
-- El acta: solo se lee. Se escribe por su RPC.
grant select on table public.quality_management_review_minutes to authenticated;


-- ============================================================================
-- 22 · VERIFICACIÓN MANUAL
-- ----------------------------------------------------------------------------
-- select count(*) from pg_tables
--  where schemaname='public' and tablename like 'quality_management_review%';   -- 9
-- select count(*) from pg_policies
--  where schemaname='public' and tablename like 'quality_management_review%';
-- select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public' and p.prosecdef
--    and p.proname like 'quality_mr%' and coalesce(array_to_string(p.proconfig,','),'')
--        not like '%search_path%';                                              -- 0
-- select count(*) from information_schema.role_table_grants
--  where table_schema='public' and table_name like 'quality_management_review%'
--    and grantee='anon';                                                        -- 0
-- ============================================================================
