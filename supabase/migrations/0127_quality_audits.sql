-- ============================================================================
-- QUALITY-09 · AUDITORÍAS: PROGRAMA, PLAN, EJECUCIÓN, EVIDENCIA Y HALLAZGOS
-- ----------------------------------------------------------------------------
-- AR-01…AR-20 · MDR congelado · append-only sobre 0126.
--
-- LAS SIETE SEPARACIONES QUE SOSTIENEN ESTE DOMINIO
--
--   PROGRAMA ≠ AUDITORÍA
--   CRITERIO ≠ PREGUNTA DE CHECKLIST
--   EVIDENCIA ≠ HALLAZGO
--   HALLAZGO ≠ NO CONFORMIDAD
--   OBSERVACIÓN ≠ NO CONFORMIDAD
--   RESULTADO DE AUDITORÍA ≠ ACCIÓN CORRECTIVA
--   AUDITOR ≠ RESPONSABLE DE LA AUDITORÍA
--
-- LO QUE ESTE DOMINIO NO ES
--
-- No es un segundo motor de casos, no conformidades ni acciones: QUALITY-04 ya
-- previó las auditorías —`work_cases.case_type` admitía `'audit_finding'` y
-- `origin_kind` admitía `'audit'` desde 0119— y aquí se usa tal cual.
--
-- No es un segundo motor documental: los criterios documentales apuntan a
-- TrazaDocs y a la REVISIÓN que regía en el periodo auditado.
--
-- Y no certifica nada. Trazaloop administra auditorías; la certificación la
-- concede un organismo, no un sistema de gestión.
--
-- HALLAZGO ≠ NO CONFORMIDAD (AR-09, §30) — LA REGLA CRÍTICA
--
-- `quality_audit_findings.proposed_classification` es exactamente eso: una
-- PROPUESTA del auditor. Incluso el valor `nonconformity_suspected` dice
-- «sospecho», no «es». Registrar un hallazgo NO mueve el recuento de no
-- conformidades, y abrir el caso tampoco: la clasificación formal ocurre en la
-- ficha del caso, con las reglas de QUALITY-04, y es una decisión de una
-- persona.
-- ============================================================================


-- ============================================================================
-- 1 · PROGRAMA DE AUDITORÍAS (AR-03, §5, §6, §7)
-- ----------------------------------------------------------------------------
-- PROGRAMA ≠ AUDITORÍA.
--
-- El programa planifica y consolida VARIAS auditorías durante un periodo. La
-- auditoría es una sola. Guardarlo todo como «la auditoría de 2027» convierte
-- cuatro trabajos distintos en un registro que no sirve para ninguno.
--
-- §7 · Y un programa anual NO queda congelado el 1 de enero. Se le añaden
-- auditorías, se reprograman, se cancelan y cambian de prioridad — y cada uno
-- de esos movimientos deja rastro.
-- ============================================================================

create table public.quality_audit_programs (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,

  code                text,
  name                text not null,
  period_label        text not null,
  period_start        date not null,
  period_end          date not null,

  purpose             text,
  -- §8 · Con qué criterios se priorizó. Es texto porque cada empresa prioriza
  -- a su manera: imponer una fórmula universal produce el campo «otros» de
  -- siempre.
  prioritization_note text,

  -- MDR-33 · La responsabilidad es del CARGO. Quién la ejerce hoy es otra cosa.
  owner_position_id   uuid,

  status              text not null default 'draft',
  approved_on         date,
  approved_by         uuid references public.profiles (id),

  closed_at           timestamptz,
  closed_by           uuid references public.profiles (id),
  closure_note        text,

  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint quality_audit_programs_org_id_uniq unique (organization_id, id),
  constraint quality_audit_programs_name_not_blank check (length(trim(name)) > 0),
  constraint quality_audit_programs_period_check check (period_end >= period_start),
  constraint quality_audit_programs_status_check
    check (status in ('draft', 'active', 'closed', 'cancelled')),
  constraint quality_audit_programs_closed_consistent
    check ((status = 'closed') = (closed_at is not null)),
  constraint quality_audit_programs_owner_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete set null
);

create unique index quality_audit_programs_period_uniq
  on public.quality_audit_programs (organization_id, lower(period_label));
create index quality_audit_programs_org_idx
  on public.quality_audit_programs (organization_id, status, period_start desc);

comment on table public.quality_audit_programs is
  'QUALITY-09 · AR-03 · El programa planifica VARIAS auditorías de un periodo. No es una auditoría gigante.';

create trigger t_quality_audit_programs_updated
  before update on public.quality_audit_programs
  for each row execute function public.set_updated_at();
create trigger t_quality_audit_programs_org_immutable
  before update on public.quality_audit_programs
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_audit_programs_force_created_by
  before insert on public.quality_audit_programs
  for each row execute function public.force_created_by();
create trigger t_audit_quality_audit_programs
  after insert or update or delete on public.quality_audit_programs
  for each row execute function public.audit_row_change();


-- §66 · QUÉ ESTABA PROGRAMADO EN UNA FECHA.
--
-- No hace falta un documento versionado pesado, pero sí hace falta poder
-- responder la pregunta. Cada movimiento del programa —alta de auditoría,
-- reprogramación, cancelación, cambio de prioridad, aprobación— deja una
-- revisión append-only con el retrato del programa en ese instante.
create table public.quality_audit_program_revisions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  program_id        uuid not null,
  revision_number   integer not null,
  change_kind       text not null,
  change_note       text,
  -- El retrato: qué auditorías había, con qué fechas y en qué estado.
  snapshot          jsonb not null,

  effective_from    timestamptz not null default now(),
  created_by        uuid references public.profiles (id),

  constraint quality_audit_program_revisions_org_id_uniq unique (organization_id, id),
  constraint quality_audit_program_revisions_number_uniq unique (program_id, revision_number),
  constraint quality_audit_program_revisions_number_check check (revision_number >= 1),
  constraint quality_audit_program_revisions_kind_check
    check (change_kind in ('created', 'audit_added', 'audit_rescheduled', 'audit_cancelled',
                           'priority_changed', 'approved', 'closed', 'other')),
  constraint quality_audit_program_revisions_program_fk
    foreign key (organization_id, program_id)
    references public.quality_audit_programs (organization_id, id) on delete cascade
);

create index quality_audit_program_revisions_idx
  on public.quality_audit_program_revisions (organization_id, program_id, effective_from desc);

comment on table public.quality_audit_program_revisions is
  'QUALITY-09 · §66 · El rastro del programa. Reprogramar no sobrescribe el plan original: lo sustituye dejando constancia.';

-- Una revisión es un hecho fechado: no se corrige, se añade otra.
create trigger t_quality_audit_program_revisions_immutable
  before update on public.quality_audit_program_revisions
  for each row execute function public.quality_ro_record_is_immutable();


-- ============================================================================
-- 2 · LA AUDITORÍA (§10, §11, AR-16)
-- ----------------------------------------------------------------------------
-- §43 · LA FECHA ORIGINAL NO SE PIERDE.
--
-- `planned_from` / `planned_to` son las fechas con las que se programó la
-- auditoría por primera vez. `scheduled_from` / `scheduled_to` son las
-- vigentes. Sobrescribir las primeras haría desaparecer el hecho de que hubo
-- una reprogramación, que es justo lo que una auditoría de segunda parte va a
-- preguntar.
-- ============================================================================

create table public.quality_audits (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,

  program_id          uuid,
  code                text not null,
  title               text not null,

  -- §11 · Trazaloop NO certifica: no hay tipo «certificación».
  audit_type          text not null default 'internal',
  -- AR-16 · Planificada o extraordinaria.
  nature              text not null default 'planned',

  objective           text,
  -- §12 · Texto COMPLEMENTARIO. El alcance estructurado vive en su tabla.
  scope_note          text,

  status              text not null default 'draft',

  -- §43 · Lo que se programó la primera vez.
  planned_from        date,
  planned_to          date,
  -- Lo que rige ahora.
  scheduled_from      date,
  scheduled_to        date,
  -- Lo que de verdad ocurrió.
  executed_from       date,
  executed_to         date,

  owner_position_id   uuid,
  priority_note       text,

  -- §38 · La conclusión es HUMANA. La aplicación puede resumir datos; no
  -- puede concluir.
  conclusions         text,
  conclusions_by      uuid references public.profiles (id),
  conclusions_at      timestamptz,

  report_issued_at    timestamptz,
  report_issued_by    uuid references public.profiles (id),

  -- §37 · Cerrar una auditoría NO exige que todas las acciones estén cerradas.
  followup_note       text,
  closed_at           timestamptz,
  closed_by           uuid references public.profiles (id),
  closure_note        text,

  -- §44 · Cancelar no es borrar.
  cancel_reason       text,
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.profiles (id),

  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint quality_audits_org_id_uniq unique (organization_id, id),
  constraint quality_audits_code_uniq unique (organization_id, code),
  constraint quality_audits_title_not_blank check (length(trim(title)) > 0),
  constraint quality_audits_type_check
    check (audit_type in ('internal', 'second_party', 'external_received', 'other')),
  constraint quality_audits_nature_check check (nature in ('planned', 'extraordinary')),
  constraint quality_audits_status_check
    check (status in ('draft', 'planned', 'in_progress', 'executed',
                      'reported', 'closed', 'cancelled')),
  constraint quality_audits_planned_period_check
    check (planned_to is null or planned_from is null or planned_to >= planned_from),
  constraint quality_audits_scheduled_period_check
    check (scheduled_to is null or scheduled_from is null or scheduled_to >= scheduled_from),
  constraint quality_audits_executed_period_check
    check (executed_to is null or executed_from is null or executed_to >= executed_from),
  constraint quality_audits_closed_consistent
    check ((status = 'closed') = (closed_at is not null)),
  constraint quality_audits_cancelled_consistent
    check ((status = 'cancelled') = (cancelled_at is not null)),
  -- §44 · Cancelar exige decir por qué.
  constraint quality_audits_cancel_reason_check
    check (status <> 'cancelled'
        or nullif(btrim(coalesce(cancel_reason, '')), '') is not null),
  constraint quality_audits_program_fk
    foreign key (organization_id, program_id)
    references public.quality_audit_programs (organization_id, id) on delete set null,
  constraint quality_audits_owner_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete set null
);

create index quality_audits_org_idx
  on public.quality_audits (organization_id, status, scheduled_from);
create index quality_audits_program_idx
  on public.quality_audits (organization_id, program_id);

comment on table public.quality_audits is
  'QUALITY-09 · §10 · Una auditoría concreta, con identidad estable. `planned_*` conserva lo programado la primera vez; `scheduled_*` lo vigente.';

comment on column public.quality_audits.planned_from is
  '§43 · La fecha ORIGINAL. Reprogramar cambia `scheduled_from` y deja una fila en quality_audit_reschedules; esta no se toca.';

create trigger t_quality_audits_updated
  before update on public.quality_audits
  for each row execute function public.set_updated_at();
create trigger t_quality_audits_org_immutable
  before update on public.quality_audits
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_audits_force_created_by
  before insert on public.quality_audits
  for each row execute function public.force_created_by();
create trigger t_audit_quality_audits
  after insert or update or delete on public.quality_audits
  for each row execute function public.audit_row_change();


-- §43 · El rastro de cada reprogramación: de cuándo a cuándo, por qué y quién.
create table public.quality_audit_reschedules (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  audit_id          uuid not null,
  from_start        date,
  from_end          date,
  to_start          date,
  to_end            date,
  reason            text not null,

  decided_by        uuid references public.profiles (id),
  decided_at        timestamptz not null default now(),

  constraint quality_audit_reschedules_org_id_uniq unique (organization_id, id),
  constraint quality_audit_reschedules_reason_not_blank check (length(trim(reason)) > 0),
  constraint quality_audit_reschedules_audit_fk
    foreign key (organization_id, audit_id)
    references public.quality_audits (organization_id, id) on delete cascade
);

create index quality_audit_reschedules_audit_idx
  on public.quality_audit_reschedules (organization_id, audit_id, decided_at desc);

comment on table public.quality_audit_reschedules is
  'QUALITY-09 · §43 · Reprogramar deja rastro: original, nueva, motivo y actor. No se sobrescribe en silencio.';

create trigger t_quality_audit_reschedules_immutable
  before update on public.quality_audit_reschedules
  for each row execute function public.quality_ro_record_is_immutable();


-- ============================================================================
-- 3 · ALCANCE ESTRUCTURADO (§12, §53, §56)
-- ----------------------------------------------------------------------------
-- El alcance NO es un textarea. Apunta a entidades REALES del sistema: los
-- procesos que se van a auditar, las sedes, los alcances de proveedor, los
-- documentos. Un texto libre sirve para matizar, no para sostener el alcance.
--
-- §53/§82 · Y cuando el alcance incluye un proceso, se guarda la REVISIÓN que
-- regía. Si el proceso se republica después, el informe de la auditoría sigue
-- diciendo cuál se auditó.
-- ============================================================================

create table public.quality_audit_scope_items (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,

  audit_id            uuid not null,
  item_kind           text not null,

  process_id          uuid,
  -- §53 · La revisión vigente en el periodo auditado, atada a la fila.
  process_revision_id uuid,
  org_unit            text,
  party_id            uuid,
  supplier_scope_id   uuid,
  document_id         uuid,
  requirement_id      uuid,
  note                text,
  position_order      integer not null default 1,

  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),

  constraint quality_audit_scope_items_org_id_uniq unique (organization_id, id),
  constraint quality_audit_scope_items_kind_check
    check (item_kind in ('process', 'org_unit', 'site', 'supplier', 'supplier_scope',
                         'document', 'requirement', 'product_service', 'other')),
  -- Cada clase de alcance tiene que apuntar a algo. «Otro» y «unidad» viven de
  -- su texto; los demás, de su referencia.
  constraint quality_audit_scope_items_target_check
    check ((item_kind = 'process'        and process_id is not null)
        or (item_kind = 'supplier'       and party_id is not null)
        or (item_kind = 'supplier_scope' and supplier_scope_id is not null)
        or (item_kind = 'document'       and document_id is not null)
        or (item_kind = 'requirement'    and requirement_id is not null)
        or (item_kind in ('org_unit', 'site', 'product_service', 'other')
            and nullif(btrim(coalesce(note, '')), '') is not null)),
  constraint quality_audit_scope_items_audit_fk
    foreign key (organization_id, audit_id)
    references public.quality_audits (organization_id, id) on delete cascade,
  constraint quality_audit_scope_items_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete restrict,
  constraint quality_audit_scope_items_revision_fk
    foreign key (organization_id, process_revision_id)
    references public.quality_process_revisions (organization_id, id) on delete set null,
  constraint quality_audit_scope_items_party_fk
    foreign key (organization_id, party_id)
    references public.quality_external_parties (organization_id, id) on delete restrict,
  constraint quality_audit_scope_items_supplier_scope_fk
    foreign key (organization_id, supplier_scope_id)
    references public.quality_supplier_scopes (organization_id, id) on delete restrict,
  constraint quality_audit_scope_items_document_fk
    foreign key (organization_id, document_id)
    references public.trazadoc_documents (organization_id, id) on delete restrict,
  constraint quality_audit_scope_items_requirement_fk
    foreign key (requirement_id) references public.requirements (id) on delete restrict
);

create index quality_audit_scope_items_audit_idx
  on public.quality_audit_scope_items (organization_id, audit_id, position_order);
create index quality_audit_scope_items_process_idx
  on public.quality_audit_scope_items (organization_id, process_id)
  where process_id is not null;

comment on table public.quality_audit_scope_items is
  'QUALITY-09 · §12 · El alcance apunta a entidades reales. Cuando incluye un proceso, guarda la revisión que regía: republicarlo después no reescribe lo que se auditó.';


-- ============================================================================
-- 4 · CRITERIOS DE AUDITORÍA (§13, §14, AR-05)
-- ----------------------------------------------------------------------------
-- §13 · Los criterios se REUTILIZAN: `requirements` de los marcos normativos y
-- los documentos de TrazaDocs. No se copia el texto de ninguna norma dentro de
-- Auditorías — copiarlo garantiza que un día digan cosas distintas.
--
-- AR-05/§82 · Y un criterio documental apunta a la REVISIÓN que regía en el
-- periodo auditado. Si el procedimiento va por la v4 y la auditoría miró la v2,
-- el informe dice v2.
-- ============================================================================

create table public.quality_audit_criteria (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,

  audit_id              uuid not null,
  criterion_kind        text not null,

  requirement_id        uuid,
  document_id           uuid,
  -- AR-05 · La revisión que regía en el periodo auditado.
  document_revision_id  uuid,
  custom_text           text,
  note                  text,
  position_order        integer not null default 1,

  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),

  constraint quality_audit_criteria_org_id_uniq unique (organization_id, id),
  constraint quality_audit_criteria_kind_check
    check (criterion_kind in ('requirement', 'document', 'internal', 'contractual',
                              'legal', 'other')),
  constraint quality_audit_criteria_target_check
    check ((criterion_kind = 'requirement' and requirement_id is not null)
        or (criterion_kind = 'document'    and document_id is not null)
        or (criterion_kind in ('internal', 'contractual', 'legal', 'other')
            and nullif(btrim(coalesce(custom_text, '')), '') is not null)),
  constraint quality_audit_criteria_audit_fk
    foreign key (organization_id, audit_id)
    references public.quality_audits (organization_id, id) on delete cascade,
  constraint quality_audit_criteria_document_fk
    foreign key (organization_id, document_id)
    references public.trazadoc_documents (organization_id, id) on delete restrict,
  constraint quality_audit_criteria_revision_fk
    foreign key (organization_id, document_revision_id)
    references public.trazadoc_document_revisions (organization_id, id) on delete set null,
  constraint quality_audit_criteria_requirement_fk
    foreign key (requirement_id) references public.requirements (id) on delete restrict
);

create index quality_audit_criteria_audit_idx
  on public.quality_audit_criteria (organization_id, audit_id, position_order);

comment on table public.quality_audit_criteria is
  'QUALITY-09 · §13/AR-05 · El criterio se REFERENCIA: requisito de marco o documento con su revisión histórica. No se copia texto normativo.';


-- ============================================================================
-- 5 · CHECKLISTS (§15, §16, AR-14)
-- ----------------------------------------------------------------------------
-- §14 · CRITERIO ≠ PREGUNTA.
--
-- «ISO 9001 8.4» es el criterio. «¿Cómo se evalúan los proveedores críticos?»
-- es la pregunta que ayuda a auditarlo. La pregunta no sustituye al requisito,
-- y un hallazgo formal conserva el CRITERIO, no la pregunta.
--
-- §15 · Y el checklist es OPCIONAL. Obligar a que toda auditoría sea un
-- cuestionario convierte una conversación con un proceso en un formulario.
-- ============================================================================

create table public.quality_audit_checklists (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  code              text,
  name              text not null,
  description       text,
  is_active         boolean not null default true,
  retired_at        timestamptz,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_audit_checklists_org_id_uniq unique (organization_id, id),
  constraint quality_audit_checklists_name_not_blank check (length(trim(name)) > 0)
);

create unique index quality_audit_checklists_code_uniq
  on public.quality_audit_checklists (organization_id, lower(code)) where code is not null;

comment on table public.quality_audit_checklists is
  'QUALITY-09 · §16 · Plantilla reutilizable. Su estructura vive en las versiones.';

create trigger t_quality_audit_checklists_updated
  before update on public.quality_audit_checklists
  for each row execute function public.set_updated_at();
create trigger t_quality_audit_checklists_org_immutable
  before update on public.quality_audit_checklists
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_audit_checklists_force_created_by
  before insert on public.quality_audit_checklists
  for each row execute function public.force_created_by();


create table public.quality_audit_checklist_versions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  checklist_id      uuid not null,
  version_number    integer not null,
  status            text not null default 'draft',

  effective_from    date,
  effective_to      date,
  published_at      timestamptz,
  published_by      uuid references public.profiles (id),
  change_note       text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_audit_checklist_versions_org_id_uniq unique (organization_id, id),
  constraint quality_audit_checklist_versions_number_uniq unique (checklist_id, version_number),
  constraint quality_audit_checklist_versions_number_check check (version_number >= 1),
  constraint quality_audit_checklist_versions_status_check
    check (status in ('draft', 'published', 'superseded')),
  constraint quality_audit_checklist_versions_period_check
    check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint quality_audit_checklist_versions_published_fields_check
    check (status = 'draft' or (effective_from is not null and published_at is not null)),
  constraint quality_audit_checklist_versions_checklist_fk
    foreign key (organization_id, checklist_id)
    references public.quality_audit_checklists (organization_id, id) on delete cascade
);

create index quality_audit_checklist_versions_idx
  on public.quality_audit_checklist_versions (organization_id, checklist_id, version_number desc);

comment on table public.quality_audit_checklist_versions is
  'QUALITY-09 · AR-14/§16 · Una versión publicada no se reescribe. El checklist de una auditoría cerrada se lee con la versión que se usó.';

create trigger t_quality_audit_checklist_versions_updated
  before update on public.quality_audit_checklist_versions
  for each row execute function public.set_updated_at();
create trigger t_quality_audit_checklist_versions_org_immutable
  before update on public.quality_audit_checklist_versions
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_audit_checklist_versions_force_created_by
  before insert on public.quality_audit_checklist_versions
  for each row execute function public.force_created_by();


create table public.quality_audit_checklist_items (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  version_id        uuid not null,
  stable_key        text not null,
  position_order    integer not null default 1,

  prompt            text not null,
  guidance          text,
  -- §14 · La pregunta puede señalar su criterio; no lo reemplaza.
  requirement_id    uuid,
  document_id       uuid,
  criterion_text    text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_audit_checklist_items_org_id_uniq unique (organization_id, id),
  constraint quality_audit_checklist_items_stable_uniq unique (version_id, stable_key),
  constraint quality_audit_checklist_items_prompt_not_blank check (length(trim(prompt)) > 0),
  constraint quality_audit_checklist_items_key_not_blank check (length(trim(stable_key)) > 0),
  constraint quality_audit_checklist_items_version_fk
    foreign key (organization_id, version_id)
    references public.quality_audit_checklist_versions (organization_id, id) on delete cascade,
  constraint quality_audit_checklist_items_document_fk
    foreign key (organization_id, document_id)
    references public.trazadoc_documents (organization_id, id) on delete set null,
  constraint quality_audit_checklist_items_requirement_fk
    foreign key (requirement_id) references public.requirements (id) on delete set null
);

create index quality_audit_checklist_items_version_idx
  on public.quality_audit_checklist_items (organization_id, version_id, position_order);

comment on table public.quality_audit_checklist_items is
  'QUALITY-09 · §14 · Una PREGUNTA que ayuda a auditar un criterio. No es el criterio.';

create trigger t_quality_audit_checklist_items_updated
  before update on public.quality_audit_checklist_items
  for each row execute function public.set_updated_at();
create trigger t_quality_audit_checklist_items_org_immutable
  before update on public.quality_audit_checklist_items
  for each row execute function public.prevent_organization_id_change();


-- §16 · Una versión publicada no se edita. El checklist con el que se auditó en
-- 2027 tiene que seguir diciendo lo mismo en 2029.
create or replace function public.quality_checklist_version_is_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from quality_audit_checklist_versions
   where id = coalesce(new.version_id, old.version_id);
  if v_status is distinct from 'draft' then
    raise exception 'Esta versión del checklist ya está publicada: sus preguntas no se pueden cambiar. Si hace falta otra cosa, se publica una versión nueva.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger t_quality_audit_checklist_items_only_in_draft
  before insert or update or delete on public.quality_audit_checklist_items
  for each row execute function public.quality_checklist_version_is_published();


-- ============================================================================
-- 6 · EQUIPO AUDITOR (§17, §18, §19, §20, §59, AR-06)
-- ----------------------------------------------------------------------------
-- §59 · Un auditor externo es una PERSONA, no necesariamente una cuenta. Q06
-- ya separó PERSONA de USUARIO justamente para esto: obligar a un auditor
-- externo a crear una cuenta de Trazaloop para figurar en un plan es pedirle
-- que se registre en el sistema de su cliente.
--
-- §17 · Y hay papeles distintos: quien lidera, quien audita, el experto
-- técnico y el observador. Colapsarlos pierde el dato que después hace falta
-- para justificar la competencia del equipo.
-- ============================================================================

create table public.quality_audit_team_members (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  audit_id          uuid not null,
  -- §59 · Persona, no usuario. Puede no tener cuenta.
  person_id         uuid not null,
  team_role         text not null default 'auditor',
  note              text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),

  constraint quality_audit_team_members_org_id_uniq unique (organization_id, id),
  constraint quality_audit_team_members_uniq unique (audit_id, person_id),
  constraint quality_audit_team_members_role_check
    check (team_role in ('lead', 'auditor', 'technical_expert', 'observer', 'in_training')),
  constraint quality_audit_team_members_audit_fk
    foreign key (organization_id, audit_id)
    references public.quality_audits (organization_id, id) on delete cascade,
  constraint quality_audit_team_members_person_fk
    foreign key (organization_id, person_id)
    references public.quality_people (organization_id, id) on delete restrict
);

create index quality_audit_team_members_audit_idx
  on public.quality_audit_team_members (organization_id, audit_id);

comment on table public.quality_audit_team_members is
  'QUALITY-09 · §17/§59 · El equipo son PERSONAS. Un auditor externo figura sin cuenta de Trazaloop.';

-- Un solo líder por auditoría: dos personas que lideran es ninguna.
create unique index quality_audit_team_one_lead
  on public.quality_audit_team_members (audit_id) where team_role = 'lead';


-- §19, §20 · INDEPENDENCIA · AR-06
--
-- Una comprobación EXPLÍCITA, no una afirmación automática. El sistema detecta
-- el conflicto y lo dice; quien decide si se acepta con mitigación —o no— es
-- una persona, y su decisión queda escrita.
--
-- §20 · Y la comprobación es HISTÓRICA: para una auditoría de marzo se
-- pregunta qué cargo ocupaba el auditor EN MARZO, no cuál ocupa hoy. Usar solo
-- el cargo actual dejaría pasar exactamente el conflicto que importa.
create table public.quality_audit_conflict_checks (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  audit_id          uuid not null,
  person_id         uuid not null,

  conflict_kind     text not null,
  detail            text not null,
  -- La fecha con la que se resolvió la pertenencia al cargo.
  evaluated_on      date not null,
  position_id       uuid,
  process_id        uuid,

  status            text not null default 'detected',
  mitigation        text,
  decided_by        uuid references public.profiles (id),
  decided_at        timestamptz,

  detected_at       timestamptz not null default now(),

  constraint quality_audit_conflict_checks_org_id_uniq unique (organization_id, id),
  constraint quality_audit_conflict_checks_kind_check
    check (conflict_kind in ('owns_audited_process', 'owns_audited_document',
                             'is_auditee', 'reports_to_auditee', 'other')),
  constraint quality_audit_conflict_checks_status_check
    check (status in ('detected', 'accepted_with_mitigation', 'dismissed')),
  -- Aceptar un conflicto exige decir cómo se mitiga. Aceptarlo sin más sería
  -- exactamente lo mismo que ignorarlo, pero con un registro que aparenta
  -- rigor.
  constraint quality_audit_conflict_checks_mitigation_check
    check (status <> 'accepted_with_mitigation'
        or nullif(btrim(coalesce(mitigation, '')), '') is not null),
  constraint quality_audit_conflict_checks_decided_consistent
    check ((status = 'detected') = (decided_at is null)),
  constraint quality_audit_conflict_checks_audit_fk
    foreign key (organization_id, audit_id)
    references public.quality_audits (organization_id, id) on delete cascade,
  constraint quality_audit_conflict_checks_person_fk
    foreign key (organization_id, person_id)
    references public.quality_people (organization_id, id) on delete cascade,
  constraint quality_audit_conflict_checks_position_fk
    foreign key (organization_id, position_id)
    references public.quality_positions (organization_id, id) on delete set null,
  constraint quality_audit_conflict_checks_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete set null
);

-- El barrido tiene que poder repetirse sin duplicar el mismo conflicto.
create unique index quality_audit_conflict_checks_dedupe
  on public.quality_audit_conflict_checks (
    audit_id, person_id, conflict_kind,
    coalesce(process_id, '00000000-0000-0000-0000-000000000000'::uuid));

comment on table public.quality_audit_conflict_checks is
  'QUALITY-09 · §19/§20/AR-06 · El conflicto se DETECTA y se dice. Aceptarlo exige mitigación escrita; el sistema nunca afirma independencia por su cuenta.';


-- ============================================================================
-- 7 · PLAN, AGENDA Y REUNIONES (§21, §22, §23, §24)
-- ----------------------------------------------------------------------------
-- §21 · El plan de una auditoría no es un gestor de proyectos. Es objetivo,
-- alcance, criterios, equipo, fechas y una agenda de actividades ordenadas.
-- ============================================================================

create table public.quality_audit_agenda_items (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,

  audit_id              uuid not null,
  position_order        integer not null default 1,

  activity_kind         text not null default 'review',
  title                 text not null,
  scheduled_on          date,
  starts_at_label       text,
  ends_at_label         text,
  location              text,
  process_id            uuid,
  responsible_person_id uuid,
  note                  text,

  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint quality_audit_agenda_items_org_id_uniq unique (organization_id, id),
  constraint quality_audit_agenda_items_title_not_blank check (length(trim(title)) > 0),
  constraint quality_audit_agenda_items_kind_check
    check (activity_kind in ('opening', 'interview', 'review', 'observation',
                             'sampling', 'team_meeting', 'closing', 'other')),
  constraint quality_audit_agenda_items_audit_fk
    foreign key (organization_id, audit_id)
    references public.quality_audits (organization_id, id) on delete cascade,
  constraint quality_audit_agenda_items_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete set null,
  constraint quality_audit_agenda_items_person_fk
    foreign key (organization_id, responsible_person_id)
    references public.quality_people (organization_id, id) on delete set null
);

create index quality_audit_agenda_items_audit_idx
  on public.quality_audit_agenda_items (organization_id, audit_id, scheduled_on, position_order);

comment on table public.quality_audit_agenda_items is
  'QUALITY-09 · §22 · La agenda: actividades ordenadas con su hora, su proceso y su responsable. No es un gestor de proyectos.';

create trigger t_quality_audit_agenda_items_updated
  before update on public.quality_audit_agenda_items
  for each row execute function public.set_updated_at();
create trigger t_quality_audit_agenda_items_org_immutable
  before update on public.quality_audit_agenda_items
  for each row execute function public.prevent_organization_id_change();


-- §24 · Apertura y cierre se registran CUANDO CORRESPONDE. Obligar a una
-- reunión formal en una auditoría de dos horas es burocracia que nadie
-- rellena, y un campo que nadie rellena acaba mintiendo.
create table public.quality_audit_meetings (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  audit_id          uuid not null,
  meeting_kind      text not null,
  held_on           date not null,
  notes             text,
  -- §23 · Los participantes, que pueden no tener ficha de persona.
  participants      jsonb not null default '[]'::jsonb,

  recorded_by       uuid references public.profiles (id),
  created_at        timestamptz not null default now(),

  constraint quality_audit_meetings_org_id_uniq unique (organization_id, id),
  constraint quality_audit_meetings_uniq unique (audit_id, meeting_kind),
  constraint quality_audit_meetings_kind_check
    check (meeting_kind in ('opening', 'closing')),
  constraint quality_audit_meetings_audit_fk
    foreign key (organization_id, audit_id)
    references public.quality_audits (organization_id, id) on delete cascade
);

comment on table public.quality_audit_meetings is
  'QUALITY-09 · §24 · Apertura y cierre, cuando la auditoría lo merece. Opcionales a propósito.';


-- §23 · AUDITADO ≠ RESPONSABLE DEL PROCESO.
--
-- Quien se entrevista puede no ser quien responde del proceso, y confundirlos
-- hace que un informe atribuya a un cargo lo que dijo otra persona.
create table public.quality_audit_auditees (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  audit_id          uuid not null,
  person_id         uuid,
  external_name     text,
  role_note         text,
  process_id        uuid,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),

  constraint quality_audit_auditees_org_id_uniq unique (organization_id, id),
  -- O una persona del sistema, o un nombre. Nunca las dos ni ninguna.
  constraint quality_audit_auditees_identity_check
    check ((person_id is not null) <> (nullif(btrim(coalesce(external_name, '')), '') is not null)),
  constraint quality_audit_auditees_audit_fk
    foreign key (organization_id, audit_id)
    references public.quality_audits (organization_id, id) on delete cascade,
  constraint quality_audit_auditees_person_fk
    foreign key (organization_id, person_id)
    references public.quality_people (organization_id, id) on delete set null,
  constraint quality_audit_auditees_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete set null
);

create index quality_audit_auditees_audit_idx
  on public.quality_audit_auditees (organization_id, audit_id);

comment on table public.quality_audit_auditees is
  'QUALITY-09 · §23 · Quién participó. No es lo mismo que quién responde del proceso.';


-- ============================================================================
-- 8 · EJECUCIÓN: NOTAS, MUESTRAS Y EVIDENCIA (§25, §26, §27, §28, AR-08, AR-15)
-- ----------------------------------------------------------------------------
-- AR-15 · NOTA DE TRABAJO ≠ EVIDENCIA ≠ HALLAZGO.
--
-- Durante una auditoría se apuntan cosas: lo que dijo alguien, lo que se vio,
-- lo que habría que mirar después. Obligar a formalizar un hallazgo en el
-- instante de observar algo produce hallazgos prematuros — y auditores que
-- dejan de apuntar.
--
-- §58 · Y una nota de entrevista puede contener lo que una persona dijo de su
-- propio trabajo. `is_restricted` la reserva a quien conduce la auditoría.
-- ============================================================================

create table public.quality_audit_notes (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  audit_id          uuid not null,
  note_kind         text not null default 'working_note',
  body              text not null,

  process_id        uuid,
  agenda_item_id    uuid,
  recorded_on       date not null default current_date,
  recorded_by       uuid references public.profiles (id),
  -- §58 · Las notas de entrevista no las lee cualquiera.
  is_restricted     boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_audit_notes_org_id_uniq unique (organization_id, id),
  constraint quality_audit_notes_body_not_blank check (length(trim(body)) > 0),
  constraint quality_audit_notes_kind_check
    check (note_kind in ('working_note', 'interview', 'observation', 'document_review',
                         'follow_up_point', 'other')),
  constraint quality_audit_notes_audit_fk
    foreign key (organization_id, audit_id)
    references public.quality_audits (organization_id, id) on delete cascade,
  constraint quality_audit_notes_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete set null,
  constraint quality_audit_notes_agenda_fk
    foreign key (organization_id, agenda_item_id)
    references public.quality_audit_agenda_items (organization_id, id) on delete set null
);

create index quality_audit_notes_audit_idx
  on public.quality_audit_notes (organization_id, audit_id, recorded_on desc);

comment on table public.quality_audit_notes is
  'QUALITY-09 · AR-15/§58 · Notas de trabajo. No son evidencia formal ni hallazgo, y las de entrevista pueden restringirse.';

create trigger t_quality_audit_notes_updated
  before update on public.quality_audit_notes
  for each row execute function public.set_updated_at();
create trigger t_quality_audit_notes_org_immutable
  before update on public.quality_audit_notes
  for each row execute function public.prevent_organization_id_change();


-- §28 · LA MUESTRA SE DECLARA.
--
-- Revisar tres órdenes de cien no es revisar cien. Decir qué se miró es lo que
-- permite leer un hallazgo —y la ausencia de hallazgos— con la cabeza fría.
create table public.quality_audit_samples (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  audit_id          uuid not null,
  description       text not null,
  population_note   text,
  population_size   integer,
  sample_size       integer not null,
  selection_method  text,
  process_id        uuid,
  note              text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),

  constraint quality_audit_samples_org_id_uniq unique (organization_id, id),
  constraint quality_audit_samples_description_not_blank check (length(trim(description)) > 0),
  constraint quality_audit_samples_sizes_check
    check (sample_size > 0 and (population_size is null or population_size >= sample_size)),
  constraint quality_audit_samples_audit_fk
    foreign key (organization_id, audit_id)
    references public.quality_audits (organization_id, id) on delete cascade,
  constraint quality_audit_samples_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete set null
);

create index quality_audit_samples_audit_idx
  on public.quality_audit_samples (organization_id, audit_id);

comment on table public.quality_audit_samples is
  'QUALITY-09 · §28 · Qué se revisó y sobre cuánto. Una muestra no afirma cobertura total.';


-- §26/AR-08 · LA EVIDENCIA SE REFERENCIA; NO SE VUELVE A SUBIR.
--
-- Esta tabla NO es un almacén de archivos. Es un puente hacia lo que ya existe:
-- un documento de TrazaDocs con su revisión, un indicador, una evidencia de
-- PCR, una evaluación de proveedor, un caso. Volver a subir el mismo archivo
-- garantiza dos copias que un día dirán cosas distintas.
--
-- Las únicas evidencias sin referencia son las que no la pueden tener: una
-- entrevista y una observación directa. Ésas viven de su descripción.
create table public.quality_audit_evidence (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,

  audit_id              uuid not null,
  evidence_kind         text not null,
  description           text not null,

  -- Referencias a lo que ya existe.
  document_id           uuid,
  document_revision_id  uuid,
  process_id            uuid,
  indicator_id          uuid,
  measurement_id        uuid,
  supplier_evaluation_id uuid,
  risk_id               uuid,
  case_id               uuid,
  external_evidence_id  uuid,
  sample_id             uuid,

  collected_on          date not null default current_date,
  collected_by          uuid references public.profiles (id),
  note                  text,

  created_at            timestamptz not null default now(),

  constraint quality_audit_evidence_org_id_uniq unique (organization_id, id),
  constraint quality_audit_evidence_description_not_blank check (length(trim(description)) > 0),
  constraint quality_audit_evidence_kind_check
    check (evidence_kind in ('document', 'record', 'file', 'indicator', 'measurement',
                             'supplier_evaluation', 'risk', 'case', 'interview',
                             'observation', 'system_entity', 'other')),
  -- Una evidencia documental sin documento no es una evidencia documental.
  constraint quality_audit_evidence_document_check
    check (evidence_kind <> 'document' or document_id is not null),
  constraint quality_audit_evidence_indicator_check
    check (evidence_kind <> 'indicator' or indicator_id is not null),
  constraint quality_audit_evidence_audit_fk
    foreign key (organization_id, audit_id)
    references public.quality_audits (organization_id, id) on delete cascade,
  constraint quality_audit_evidence_document_fk
    foreign key (organization_id, document_id)
    references public.trazadoc_documents (organization_id, id) on delete restrict,
  constraint quality_audit_evidence_revision_fk
    foreign key (organization_id, document_revision_id)
    references public.trazadoc_document_revisions (organization_id, id) on delete restrict,
  constraint quality_audit_evidence_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete set null,
  constraint quality_audit_evidence_indicator_fk
    foreign key (organization_id, indicator_id)
    references public.quality_indicators (organization_id, id) on delete restrict,
  constraint quality_audit_evidence_measurement_fk
    foreign key (organization_id, measurement_id)
    references public.quality_measurements (organization_id, id) on delete restrict,
  constraint quality_audit_evidence_supplier_evaluation_fk
    foreign key (organization_id, supplier_evaluation_id)
    references public.quality_supplier_evaluations (organization_id, id) on delete restrict,
  constraint quality_audit_evidence_risk_fk
    foreign key (organization_id, risk_id)
    references public.quality_risks (organization_id, id) on delete restrict,
  constraint quality_audit_evidence_case_fk
    foreign key (organization_id, case_id)
    references public.work_cases (organization_id, id) on delete restrict,
  constraint quality_audit_evidence_external_fk
    foreign key (organization_id, external_evidence_id)
    references public.evidences (organization_id, id) on delete restrict,
  constraint quality_audit_evidence_sample_fk
    foreign key (organization_id, sample_id)
    references public.quality_audit_samples (organization_id, id) on delete set null
);

create index quality_audit_evidence_audit_idx
  on public.quality_audit_evidence (organization_id, audit_id, collected_on desc);

comment on table public.quality_audit_evidence is
  'QUALITY-09 · §26/AR-08 · La evidencia se REFERENCIA. No hay bucket nuevo ni archivos duplicados: se apunta a lo que ya existe en el sistema.';

comment on column public.quality_audit_evidence.external_evidence_id is
  'Puente con el repositorio de evidencias que ya existía: el archivo se referencia, no se copia.';


-- §15 · RESULTADO DE CHECK ≠ HALLAZGO.
--
-- Marcar «no conforme» en una casilla es una anotación de trabajo. El hallazgo
-- formal es otro acto, con su criterio, su evidencia y su declaración.
create table public.quality_audit_checklist_runs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  audit_id          uuid not null,
  checklist_id      uuid not null,
  -- La VERSIÓN con la que se recorrió, atada a la fila.
  version_id        uuid not null,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),

  constraint quality_audit_checklist_runs_org_id_uniq unique (organization_id, id),
  constraint quality_audit_checklist_runs_uniq unique (audit_id, version_id),
  constraint quality_audit_checklist_runs_audit_fk
    foreign key (organization_id, audit_id)
    references public.quality_audits (organization_id, id) on delete cascade,
  constraint quality_audit_checklist_runs_checklist_fk
    foreign key (organization_id, checklist_id)
    references public.quality_audit_checklists (organization_id, id) on delete restrict,
  constraint quality_audit_checklist_runs_version_fk
    foreign key (organization_id, version_id)
    references public.quality_audit_checklist_versions (organization_id, id) on delete restrict
);

comment on table public.quality_audit_checklist_runs is
  'QUALITY-09 · §16 · Qué versión de checklist recorrió esta auditoría. Publicar otra después no la toca.';


create table public.quality_audit_check_results (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  run_id            uuid not null,
  item_id           uuid not null,
  outcome           text not null default 'not_reviewed',
  note              text,

  recorded_by       uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_audit_check_results_org_id_uniq unique (organization_id, id),
  constraint quality_audit_check_results_uniq unique (run_id, item_id),
  -- «Sospecha» no es «no conformidad», ni siquiera aquí. Es una casilla que
  -- dice «esto hay que mirarlo con calma».
  constraint quality_audit_check_results_outcome_check
    check (outcome in ('conforming', 'suspected_gap', 'not_applicable', 'not_reviewed')),
  constraint quality_audit_check_results_run_fk
    foreign key (organization_id, run_id)
    references public.quality_audit_checklist_runs (organization_id, id) on delete cascade,
  constraint quality_audit_check_results_item_fk
    foreign key (organization_id, item_id)
    references public.quality_audit_checklist_items (organization_id, id) on delete restrict
);

create index quality_audit_check_results_run_idx
  on public.quality_audit_check_results (organization_id, run_id);

comment on table public.quality_audit_check_results is
  'QUALITY-09 · §15 · El resultado de una casilla NO es un hallazgo. Es una anotación de trabajo.';

create trigger t_quality_audit_check_results_updated
  before update on public.quality_audit_check_results
  for each row execute function public.set_updated_at();
create trigger t_quality_audit_check_results_org_immutable
  before update on public.quality_audit_check_results
  for each row execute function public.prevent_organization_id_change();


-- ============================================================================
-- 9 · HALLAZGOS (§29…§34, AR-09, AR-18) — LA FRONTERA CRÍTICA
-- ----------------------------------------------------------------------------
-- §30 · HALLAZGO ≠ NO CONFORMIDAD. OBLIGATORIO.
--
-- Un hallazgo es lo que el auditor OBSERVÓ y cómo lo LEE frente a un criterio.
-- Una no conformidad es una CLASIFICACIÓN formal, con las consecuencias que
-- QUALITY-04 definió: causa, acción, verificación de eficacia.
--
-- Por eso la columna se llama `proposed_classification` y su peor valor es
-- `nonconformity_suspected` — «sospecho», no «es». Registrar un hallazgo no
-- mueve el recuento de no conformidades, y abrir el caso tampoco: el caso nace
-- con `classification = 'pending'`, que es el valor por defecto que QUALITY-04
-- ya tenía.
--
-- §32 · Y observación, oportunidad de mejora, hallazgo y no conformidad NO se
-- colapsan. Convertir una observación en acción correctiva es la forma más
-- rápida de que nadie vuelva a registrar observaciones.
--
-- AR-09 · No hay un segundo motor formal: cuando un hallazgo merece
-- tratamiento, se abre un `work_case` de tipo `audit_finding`, que ya existía.
-- ============================================================================

create table public.quality_audit_findings (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete restrict,

  audit_id                uuid not null,
  code                    text not null,

  -- §14 · El hallazgo conserva el CRITERIO real, no la pregunta del checklist.
  criterion_id            uuid,
  -- De qué casilla salió, cuando salió de una. Es contexto, no el criterio.
  check_result_id         uuid,
  process_id              uuid,

  statement               text not null,
  detail                  text,
  location_text           text,

  -- §29/§30 · Lo que el AUDITOR propone. No es la clasificación formal.
  proposed_classification text not null default 'not_conclusive',
  proposed_severity       text,

  -- §33 · El estado de la EVALUACIÓN, que es otro acto.
  evaluation_status       text not null default 'pending',
  evaluation_note         text,
  evaluated_by            uuid references public.profiles (id),
  evaluated_at            timestamptz,

  -- §34 · El caso, SOLO si alguien decidió abrirlo.
  case_id                 uuid,

  raised_by               uuid references public.profiles (id),
  raised_on               date not null default current_date,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint quality_audit_findings_org_id_uniq unique (organization_id, id),
  constraint quality_audit_findings_code_uniq unique (organization_id, code),
  constraint quality_audit_findings_statement_not_blank check (length(trim(statement)) > 0),
  -- El vocabulario del auditor. Ninguno de estos valores AFIRMA una no
  -- conformidad: el peor dice que la sospecha.
  constraint quality_audit_findings_classification_check
    check (proposed_classification in ('conforming', 'observation', 'improvement_opportunity',
                                       'nonconformity_suspected', 'not_conclusive')),
  constraint quality_audit_findings_severity_check
    check (proposed_severity is null
        or proposed_severity in ('minor', 'major', 'critical')),
  constraint quality_audit_findings_evaluation_check
    check (evaluation_status in ('pending', 'evaluated', 'dismissed', 'escalated')),
  constraint quality_audit_findings_evaluated_consistent
    check ((evaluation_status = 'pending') = (evaluated_at is null)),
  -- Solo un hallazgo escalado tiene caso, y todo hallazgo con caso está
  -- escalado.
  constraint quality_audit_findings_case_consistent
    check ((case_id is null) or (evaluation_status = 'escalated')),
  constraint quality_audit_findings_audit_fk
    foreign key (organization_id, audit_id)
    references public.quality_audits (organization_id, id) on delete cascade,
  constraint quality_audit_findings_criterion_fk
    foreign key (organization_id, criterion_id)
    references public.quality_audit_criteria (organization_id, id) on delete set null,
  constraint quality_audit_findings_check_result_fk
    foreign key (organization_id, check_result_id)
    references public.quality_audit_check_results (organization_id, id) on delete set null,
  constraint quality_audit_findings_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete set null,
  constraint quality_audit_findings_case_fk
    foreign key (organization_id, case_id)
    references public.work_cases (organization_id, id) on delete set null
);

create index quality_audit_findings_audit_idx
  on public.quality_audit_findings (organization_id, audit_id, raised_on);
create index quality_audit_findings_status_idx
  on public.quality_audit_findings (organization_id, evaluation_status);
create index quality_audit_findings_process_idx
  on public.quality_audit_findings (organization_id, process_id)
  where process_id is not null;

comment on table public.quality_audit_findings is
  'QUALITY-09 · §30/AR-09 · El hallazgo del auditor. `proposed_classification` es una PROPUESTA: ninguno de sus valores declara una no conformidad, y registrarlo no mueve ningún recuento.';

comment on column public.quality_audit_findings.proposed_classification is
  '§30 · Lo que PROPONE el auditor. `nonconformity_suspected` dice «sospecho», no «es». La clasificación formal vive en el caso, con QUALITY-04.';

create trigger t_quality_audit_findings_updated
  before update on public.quality_audit_findings
  for each row execute function public.set_updated_at();
create trigger t_quality_audit_findings_org_immutable
  before update on public.quality_audit_findings
  for each row execute function public.prevent_organization_id_change();
-- El autor del hallazgo se llama `raised_by`, no `created_by`: quien LEVANTA un
-- hallazgo es el auditor, y el verbo importa. Por eso este disparador no puede
-- ser el común: necesita su propia función, que escribe la columna que existe.
create or replace function public.quality_force_finding_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.raised_by := auth.uid();
  return new;
end;
$$;

create trigger t_quality_audit_findings_force_author
  before insert on public.quality_audit_findings
  for each row execute function public.quality_force_finding_author();
create trigger t_audit_quality_audit_findings
  after insert or update or delete on public.quality_audit_findings
  for each row execute function public.audit_row_change();


-- §27 · EVIDENCIA ≠ HALLAZGO.
--
-- Una evidencia por sí sola no es conforme, ni no conforme, ni observación. El
-- auditor la evalúa CONTRA un criterio, y de ahí sale el hallazgo. Esta tabla
-- es el puente entre las dos cosas, no la fusión de ambas.
create table public.quality_audit_finding_evidence (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  finding_id        uuid not null,
  evidence_id       uuid not null,
  note              text,

  created_at        timestamptz not null default now(),

  constraint quality_audit_finding_evidence_org_id_uniq unique (organization_id, id),
  constraint quality_audit_finding_evidence_uniq unique (finding_id, evidence_id),
  constraint quality_audit_finding_evidence_finding_fk
    foreign key (organization_id, finding_id)
    references public.quality_audit_findings (organization_id, id) on delete cascade,
  constraint quality_audit_finding_evidence_evidence_fk
    foreign key (organization_id, evidence_id)
    references public.quality_audit_evidence (organization_id, id) on delete cascade
);

comment on table public.quality_audit_finding_evidence is
  'QUALITY-09 · §27 · El puente entre lo observado y lo concluido. Una evidencia sostiene un hallazgo; no lo es.';


-- ============================================================================
-- 10 · INFORME (§40, §41, §72, AR-11, AR-20)
-- ----------------------------------------------------------------------------
-- AR-11 · El informe se GENERA de datos estructurados. Y §41 · un informe
-- emitido tiene que poder reconstruir la auditoría de entonces: el equipo de
-- entonces, el criterio de entonces, la revisión de documento de entonces.
--
-- Por eso el informe guarda un SNAPSHOT. No porque el modelo no sepa
-- reconstruirlo —sabe— sino porque un informe emitido es un acto formal
-- (AR-20) y no puede cambiar de contenido cuando alguien edite un cargo.
-- ============================================================================

create table public.quality_audit_reports (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  audit_id          uuid not null,
  version_number    integer not null default 1,

  issued_on         date not null default current_date,
  issued_by         uuid references public.profiles (id),
  summary           text,
  -- §41/AR-20 · El retrato de la auditoría el día que se emitió.
  snapshot          jsonb not null,
  -- Una corrección formal es una versión nueva que sustituye a la anterior.
  supersedes_id     uuid,
  correction_note   text,

  created_at        timestamptz not null default now(),

  constraint quality_audit_reports_org_id_uniq unique (organization_id, id),
  constraint quality_audit_reports_version_uniq unique (audit_id, version_number),
  constraint quality_audit_reports_version_check check (version_number >= 1),
  constraint quality_audit_reports_audit_fk
    foreign key (organization_id, audit_id)
    references public.quality_audits (organization_id, id) on delete cascade,
  constraint quality_audit_reports_supersedes_fk
    foreign key (organization_id, supersedes_id)
    references public.quality_audit_reports (organization_id, id) on delete set null
);

create index quality_audit_reports_audit_idx
  on public.quality_audit_reports (organization_id, audit_id, version_number desc);

comment on table public.quality_audit_reports is
  'QUALITY-09 · §41/AR-11/AR-20 · El informe emitido congela la auditoría de entonces. Corregirlo es emitir otra versión, no reescribir ésta.';

-- AR-20 · Un informe emitido es un acto formal.
create trigger t_quality_audit_reports_immutable
  before update on public.quality_audit_reports
  for each row execute function public.quality_ro_record_is_immutable();


-- ============================================================================
-- 11 · ENSANCHE DE LOS MOTORES TRANSVERSALES (MDR-46, §35, §48, §49)
-- ----------------------------------------------------------------------------
-- Aquí NO se crean `quality_audit_actions`, `quality_audit_tasks` ni
-- `quality_audit_cases`. Se admiten los sujetos nuevos en los catálogos
-- cerrados que ya existen, de forma ADITIVA.
--
-- Y dos cosas que NO hubo que tocar, porque QUALITY-04 ya las había previsto:
-- `work_cases.case_type` admitía `'audit_finding'` y `origin_kind` admitía
-- `'audit'` desde 0119. El puente estaba puesto antes de que existiera este
-- sprint.
-- ============================================================================

alter table public.work_tasks  drop constraint work_tasks_source_domain_check;
alter table public.work_tasks  add constraint work_tasks_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action',
                           'risk','opportunity','control',
                           'person','position','competence','development',
                           'learning','performance','knowledge','lesson',
                           'supplier','customer','audit'));
alter table public.work_tasks  drop constraint work_tasks_subject_type_check;
alter table public.work_tasks  add constraint work_tasks_subject_type_check
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
                          'quality_audit_program','quality_audit','quality_audit_finding'));
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
                       'audit_report_issue','audit_finding_evaluation','audit_followup'));

alter table public.work_alerts drop constraint work_alerts_source_domain_check;
alter table public.work_alerts add constraint work_alerts_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action',
                           'risk','opportunity','control',
                           'person','position','competence','development',
                           'learning','performance','knowledge','lesson',
                           'supplier','customer','audit'));
alter table public.work_alerts drop constraint work_alerts_subject_type_check;
alter table public.work_alerts add constraint work_alerts_subject_type_check
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
                          'quality_audit_program','quality_audit','quality_audit_finding'));
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
                        -- §49 · Ninguno clasifica nada ni abre casos: dicen que
                        -- hay algo que mirar.
                        'audit_upcoming','audit_overdue','audit_report_pending',
                        'audit_finding_unevaluated','audit_independence_conflict',
                        'audit_program_coverage_gap'));

alter table public.work_events drop constraint work_events_source_domain_check;
alter table public.work_events add constraint work_events_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action',
                           'risk','opportunity','control',
                           'person','position','competence','development',
                           'learning','performance','knowledge','lesson',
                           'supplier','customer','audit'));
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
                          'quality_audit_program','quality_audit','quality_audit_finding'));
alter table public.work_events drop constraint work_events_type_check;
alter table public.work_events add constraint work_events_type_check
  check (event_type in ('indicator.target_missed','indicator.attention','indicator.recovered',
                        'indicator.measurement_due','indicator.source_failed','objective.at_risk',
                        'case.opened','case.classified','case.closed','case.reopened',
                        'action.planned','action.completed','action.verified','action.overdue',
                        'risk.identified','risk.assessed','risk.treated','risk.accepted',
                        'risk.materialized','risk.reviewed','risk.closed','risk.reopened',
                        'control.linked','control.reviewed',
                        'opportunity.identified','opportunity.assessed','opportunity.treated',
                        'opportunity.closed',
                        'assignment.started','assignment.ended','position.version_published',
                        'competence.assessed','competence.evidence_expired',
                        'development.need_created','development.item_planned',
                        'learning.completed','learning.effectiveness_reviewed',
                        'performance.evaluation_closed',
                        'knowledge.holder_added','knowledge.holder_removed',
                        'knowledge.concentration_detected','knowledge.transfer_verified',
                        'lesson.published','lesson.proposal_decided',
                        'supplier.registered','supplier.adopted','supplier.classified',
                        'supplier.evaluated','supplier.approved','supplier.suspended',
                        'supplier.reinstated','supplier.withdrawn',
                        'supplier.incident_recorded','supplier.document_expired',
                        'survey.version_published','campaign.opened','campaign.closed',
                        'campaign.reopened','campaign.metrics_computed',
                        'feedback.recorded','complaint.escalated_to_case',
                        'voice.review_closed',
                        'audit.program_created','audit.program_revised','audit.scheduled',
                        'audit.rescheduled','audit.cancelled','audit.started',
                        'audit.executed','audit.report_issued','audit.closed',
                        'audit.finding_raised','audit.finding_evaluated',
                        'audit.finding_escalated_to_case','audit.conflict_detected',
                        'audit.checklist_version_published'));

alter table public.work_decisions drop constraint work_decisions_subject_kind_check;
alter table public.work_decisions add constraint work_decisions_subject_kind_check
  check (subject_kind in ('case','action','risk','opportunity','control',
                          'person_competency','performance_evaluation','lesson',
                          'knowledge_transfer','supplier_scope','supplier_evaluation',
                          'survey_campaign','customer_feedback','customer_voice_review',
                          'audit_program','audit','audit_finding'));
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
                           'audit_conclusions','audit_closed'));

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
                        'audit_program','audit','audit_finding'));
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
                      'quality_audit_evidence','quality_audit_criterion'));


-- La validación de referencias tiene que conocer los sujetos nuevos: si no, una
-- referencia legítima se rechazaría por «no existe».
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
-- 12 · PERMISOS DEL DOMINIO (§58, §60)
-- ----------------------------------------------------------------------------
-- §58 · No todo el que entra a Quality tiene por qué leer las notas crudas de
-- una entrevista. Tres capacidades, no una:
--
--   quality_manages_audits   · programar, planificar, ejecutar, registrar
--   quality_reads_audits     · leer el programa, las auditorías y los informes
--   quality_closes_audits    · emitir el informe y cerrar la auditoría
--
-- El consultor externo acompaña la implantación —y a menudo ES el auditor—,
-- pero cerrar una auditoría es un acto de la empresa sobre sí misma.
-- ============================================================================

create or replace function public.quality_manages_audits(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_org_role(p_organization_id, array['admin', 'quality', 'consultant']);
$$;
revoke all on function public.quality_manages_audits(uuid) from public, anon;
grant execute on function public.quality_manages_audits(uuid) to authenticated;

create or replace function public.quality_reads_audits(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_org_member(p_organization_id);
$$;
revoke all on function public.quality_reads_audits(uuid) from public, anon;
grant execute on function public.quality_reads_audits(uuid) to authenticated;

create or replace function public.quality_closes_audits(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_org_role(p_organization_id, array['admin', 'quality']);
$$;
revoke all on function public.quality_closes_audits(uuid) from public, anon;
grant execute on function public.quality_closes_audits(uuid) to authenticated;

comment on function public.quality_closes_audits(uuid) is
  'QUALITY-09 · Emitir el informe y cerrar una auditoría es un acto de la EMPRESA sobre sí misma: no lo firma un consultor externo.';


-- §58 · Quién puede leer una nota RESTRINGIDA de entrevista: quien conduce el
-- dominio o quien está en el equipo auditor de esa auditoría. Un miembro
-- cualquiera de Quality lee el informe, no lo que alguien contó en confianza.
create or replace function public.quality_can_read_audit_note(
  p_organization_id uuid,
  p_audit_id        uuid,
  p_restricted      boolean
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not is_org_member(p_organization_id) then false
    when not p_restricted then true
    when has_org_role(p_organization_id, array['admin', 'quality']) then true
    else exists (
      select 1
        from quality_audit_team_members tm
        join quality_people pe
          on pe.organization_id = tm.organization_id and pe.id = tm.person_id
       where tm.organization_id = p_organization_id
         and tm.audit_id = p_audit_id
         and pe.profile_id = auth.uid())
  end;
$$;
revoke all on function public.quality_can_read_audit_note(uuid, uuid, boolean) from public, anon;
grant execute on function public.quality_can_read_audit_note(uuid, uuid, boolean) to authenticated;


-- ============================================================================
-- 13 · INDEPENDENCIA HISTÓRICA (§19, §20, §74, §75, AR-06, AR-17)
-- ----------------------------------------------------------------------------
-- La pregunta correcta no es «¿qué cargo tiene Ana hoy?» sino «¿qué cargo
-- ocupaba Ana el día de la auditoría?». Q06 guarda las asignaciones con su
-- vigencia; aquí se leen con la fecha de la auditoría.
--
-- Una auditoría de 2026 que Ana condujo mientras respondía de Compras sigue
-- teniendo ese conflicto en 2029, aunque Ana ya no esté en Compras.
-- ============================================================================

create or replace function public.quality_audit_conflicts_on(
  p_organization_id uuid,
  p_audit_id        uuid,
  p_on              date
)
returns table (
  person_id     uuid,
  person_name   text,
  conflict_kind text,
  position_id   uuid,
  position_name text,
  process_id    uuid,
  process_name  text,
  detail        text
)
language sql
stable
security definer
set search_path = public
as $$
  -- §63 · La pertenencia se comprueba PRIMERO. Para quien no es miembro el
  -- resultado es vacío, igual que para un identificador inventado.
  with alcance as (
    select si.process_id
      from quality_audit_scope_items si
     where is_org_member(p_organization_id)
       and si.organization_id = p_organization_id
       and si.audit_id = p_audit_id
       and si.process_id is not null
  ),
  equipo as (
    select tm.person_id, pe.full_name
      from quality_audit_team_members tm
      join quality_people pe
        on pe.organization_id = tm.organization_id and pe.id = tm.person_id
     where is_org_member(p_organization_id)
       and tm.organization_id = p_organization_id
       and tm.audit_id = p_audit_id
  ),
  -- §20 · Los cargos que la persona ocupaba EN ESA FECHA, no hoy.
  cargos_de_entonces as (
    select a.person_id, a.position_id, po.name as position_name
      from quality_position_assignments a
      join quality_positions po
        on po.organization_id = a.organization_id and po.id = a.position_id
     where a.organization_id = p_organization_id
       and a.person_id is not null
       and a.effective_from <= p_on
       and (a.effective_to is null or a.effective_to >= p_on)
  )
  -- Conflicto 1 · auditar un proceso del que se respondía.
  select e.person_id, e.full_name, 'owns_audited_process'::text,
         c.position_id, c.position_name, p.id, p.name,
         e.full_name || ' ocupaba el cargo «' || c.position_name
           || '», responsable del proceso «' || p.name || '», el '
           || to_char(p_on, 'DD/MM/YYYY') || '.'
    from equipo e
    join cargos_de_entonces c on c.person_id = e.person_id
    join quality_processes p
      on p.organization_id = p_organization_id and p.owner_position_id = c.position_id
    join alcance al on al.process_id = p.id

  union all

  -- Conflicto 2 · auditar y ser auditado a la vez.
  select e.person_id, e.full_name, 'is_auditee'::text,
         null::uuid, null::text, au.process_id,
         (select pr.name from quality_processes pr
           where pr.organization_id = p_organization_id and pr.id = au.process_id),
         e.full_name || ' figura a la vez en el equipo auditor y entre los auditados.'
    from equipo e
    join quality_audit_auditees au
      on au.organization_id = p_organization_id
     and au.audit_id = p_audit_id
     and au.person_id = e.person_id;
$$;
revoke all on function public.quality_audit_conflicts_on(uuid, uuid, date) from public, anon;
grant execute on function public.quality_audit_conflicts_on(uuid, uuid, date) to authenticated;

comment on function public.quality_audit_conflicts_on(uuid, uuid, date) is
  'QUALITY-09 · §20/§75 · Los conflictos resueltos con los cargos que la persona ocupaba EN LA FECHA de la auditoría. Usar solo el cargo actual dejaría pasar justo el conflicto que importa.';


-- La comprobación como ACTO: registra lo que encuentra y no decide nada. Quien
-- acepta un conflicto con mitigación —o lo descarta— es una persona.
create or replace function public.quality_check_audit_independence(p_audit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit    record;
  v_on       date;
  v_row      record;
  v_found    integer := 0;
begin
  select * into v_audit from quality_audits where id = p_audit_id;
  if v_audit.id is null then
    raise exception 'Esa auditoría no existe.';
  end if;
  if not quality_manages_audits(v_audit.organization_id) then
    raise exception 'No tienes permiso para revisar la independencia en esta empresa.';
  end if;

  -- §20 · La fecha de referencia es la de la auditoría, no la de hoy.
  v_on := coalesce(v_audit.executed_from, v_audit.scheduled_from,
                   v_audit.planned_from, current_date);

  for v_row in
    select * from quality_audit_conflicts_on(v_audit.organization_id, p_audit_id, v_on)
  loop
    insert into quality_audit_conflict_checks
      (organization_id, audit_id, person_id, conflict_kind, detail,
       evaluated_on, position_id, process_id)
    values
      (v_audit.organization_id, p_audit_id, v_row.person_id, v_row.conflict_kind,
       v_row.detail, v_on, v_row.position_id, v_row.process_id)
    on conflict do nothing;
    v_found := v_found + 1;
  end loop;

  if v_found > 0 then
    insert into work_events (organization_id, source_domain, event_type,
                             subject_type, subject_id, summary, payload)
    values (v_audit.organization_id, 'audit', 'audit.conflict_detected',
            'quality_audit', p_audit_id,
            'Se detectaron ' || v_found || ' posible(s) conflicto(s) de independencia.',
            jsonb_build_object('evaluated_on', v_on, 'conflicts', v_found))
    on conflict do nothing;
  end if;

  -- §19 · Y esto es lo que NO se dice cuando no hay conflictos: «independiente».
  -- El sistema no puede afirmarlo; solo puede decir que no encontró nada con lo
  -- que sabe.
  return jsonb_build_object(
    'evaluated_on', v_on,
    'conflicts_found', v_found,
    'declares_independence', false
  );
end;
$$;
revoke all on function public.quality_check_audit_independence(uuid) from public, anon;
grant execute on function public.quality_check_audit_independence(uuid) to authenticated;

comment on function public.quality_check_audit_independence(uuid) is
  'QUALITY-09 · §19 · Detecta y registra conflictos. `declares_independence` es SIEMPRE false: no encontrar nada no es lo mismo que ser independiente.';


-- ============================================================================
-- 14 · VISTAS DERIVADAS (§45, §51, §98)
-- ----------------------------------------------------------------------------
-- §45 · LA COBERTURA DEL PROGRAMA responde cuatro preguntas: qué estaba
-- previsto, qué se auditó, qué se aplazó y qué sigue pendiente. Y NO afirma
-- 100 % si no se ejecutó: un programa con tres auditorías canceladas tiene una
-- cobertura del 0 %, no del 100 % «porque se decidió no hacerlas».
-- ============================================================================

create or replace view public.v_quality_audit_program_coverage
with (security_invoker = true) as
select
  p.organization_id,
  p.id                        as program_id,
  p.name,
  p.code,
  p.period_label,
  p.period_start,
  p.period_end,
  p.status,
  p.owner_position_id,
  coalesce(a.total, 0)        as planned_audits,
  coalesce(a.executed, 0)     as executed_audits,
  coalesce(a.closed, 0)       as closed_audits,
  coalesce(a.cancelled, 0)    as cancelled_audits,
  coalesce(a.rescheduled, 0)  as rescheduled_audits,
  coalesce(a.pending, 0)      as pending_audits,
  -- Solo cuenta lo EJECUTADO. Cancelar no es cubrir.
  case when coalesce(a.total, 0) = 0 then null
       else round(coalesce(a.executed, 0) * 100.0 / a.total, 2) end as coverage_pct,
  coalesce(pr.processes_in_scope, 0) as processes_in_scope,
  coalesce(pr.processes_audited, 0)  as processes_audited
from public.quality_audit_programs p
left join lateral (
  select count(*)                                                        as total,
         count(*) filter (where x.status in ('executed', 'reported', 'closed')) as executed,
         count(*) filter (where x.status = 'closed')                     as closed,
         count(*) filter (where x.status = 'cancelled')                  as cancelled,
         count(*) filter (where x.status in ('draft', 'planned', 'in_progress')) as pending,
         count(*) filter (where exists (
           select 1 from public.quality_audit_reschedules r
            where r.organization_id = x.organization_id and r.audit_id = x.id)) as rescheduled
    from public.quality_audits x
   where x.organization_id = p.organization_id and x.program_id = p.id
) a on true
left join lateral (
  select count(distinct si.process_id)                                   as processes_in_scope,
         count(distinct si.process_id) filter (
           where x.status in ('executed', 'reported', 'closed'))         as processes_audited
    from public.quality_audit_scope_items si
    join public.quality_audits x
      on x.organization_id = si.organization_id and x.id = si.audit_id
   where si.organization_id = p.organization_id
     and x.program_id = p.id
     and si.process_id is not null
) pr on true;

comment on view public.v_quality_audit_program_coverage is
  'QUALITY-09 · §45 · Qué se previó, qué se ejecutó, qué se aplazó y qué sigue pendiente. Cancelar una auditoría no cuenta como cobertura.';


create or replace view public.v_quality_audit_overview
with (security_invoker = true) as
select
  a.organization_id,
  a.id                        as audit_id,
  a.code,
  a.title,
  a.audit_type,
  a.nature,
  a.status,
  a.program_id,
  pg.name                     as program_name,
  a.planned_from,
  a.planned_to,
  a.scheduled_from,
  a.scheduled_to,
  a.executed_from,
  a.executed_to,
  a.owner_position_id,
  pos.name                    as owner_position_name,
  a.report_issued_at,
  a.closed_at,
  -- §43 · Si las fechas vigentes no son las originales, hubo reprogramación.
  coalesce(rs.reschedules, 0) as reschedule_count,
  coalesce(tm.team_size, 0)   as team_size,
  lead.person_name            as lead_auditor,
  coalesce(sc.scope_items, 0) as scope_items,
  coalesce(cr.criteria, 0)    as criteria_count,
  coalesce(ev.evidence, 0)    as evidence_count,
  coalesce(fd.findings, 0)    as finding_count,
  coalesce(fd.pending, 0)     as findings_pending,
  coalesce(fd.escalated, 0)   as findings_escalated,
  coalesce(fd.suspected, 0)   as findings_nc_suspected,
  coalesce(cf.open_conflicts, 0) as open_conflicts,
  -- §36 · El seguimiento se DERIVA del motor transversal; no se copia el estado
  -- de cada acción dentro de la auditoría.
  coalesce(fu.open_cases, 0)    as open_cases,
  coalesce(fu.open_actions, 0)  as open_actions
from public.quality_audits a
left join public.quality_audit_programs pg
  on pg.organization_id = a.organization_id and pg.id = a.program_id
left join public.quality_positions pos
  on pos.organization_id = a.organization_id and pos.id = a.owner_position_id
left join lateral (
  select count(*) as reschedules from public.quality_audit_reschedules r
   where r.organization_id = a.organization_id and r.audit_id = a.id) rs on true
left join lateral (
  select count(*) as team_size from public.quality_audit_team_members t
   where t.organization_id = a.organization_id and t.audit_id = a.id) tm on true
left join lateral (
  select pe.full_name as person_name
    from public.quality_audit_team_members t
    join public.quality_people pe
      on pe.organization_id = t.organization_id and pe.id = t.person_id
   where t.organization_id = a.organization_id and t.audit_id = a.id and t.team_role = 'lead'
   limit 1) lead on true
left join lateral (
  select count(*) as scope_items from public.quality_audit_scope_items s
   where s.organization_id = a.organization_id and s.audit_id = a.id) sc on true
left join lateral (
  select count(*) as criteria from public.quality_audit_criteria c
   where c.organization_id = a.organization_id and c.audit_id = a.id) cr on true
left join lateral (
  select count(*) as evidence from public.quality_audit_evidence e
   where e.organization_id = a.organization_id and e.audit_id = a.id) ev on true
left join lateral (
  select count(*) as findings,
         count(*) filter (where f.evaluation_status = 'pending')   as pending,
         count(*) filter (where f.evaluation_status = 'escalated') as escalated,
         count(*) filter (where f.proposed_classification = 'nonconformity_suspected') as suspected
    from public.quality_audit_findings f
   where f.organization_id = a.organization_id and f.audit_id = a.id) fd on true
left join lateral (
  select count(*) filter (where c.status <> 'detected' is not true) as open_conflicts
    from public.quality_audit_conflict_checks c
   where c.organization_id = a.organization_id and c.audit_id = a.id
     and c.status = 'detected') cf on true
left join lateral (
  -- §36 · Las acciones NO cuelgan del caso por columna: QUALITY-04 las enlaza
  -- con `work_references`. Se lee así y no se duplica el vínculo.
  select count(distinct k.id) filter (where k.status <> 'closed') as open_cases,
         count(distinct ac.id) filter (where ac.status in ('planned', 'in_progress')) as open_actions
    from public.quality_audit_findings f
    left join public.work_cases k
      on k.organization_id = f.organization_id and k.id = f.case_id
    left join public.work_references wr
      on wr.organization_id = k.organization_id
     and wr.owner_kind = 'action' and wr.ref_kind = 'work_case' and wr.ref_id = k.id
    left join public.work_actions ac
      on ac.organization_id = wr.organization_id and ac.id = wr.owner_id
   where f.organization_id = a.organization_id and f.audit_id = a.id) fu on true;

comment on view public.v_quality_audit_overview is
  'QUALITY-09 · §36 · El estado de la auditoría, con el seguimiento DERIVADO del motor de casos y acciones. No se duplica el estado de nada.';


-- AR-18 · Hallazgos que se repiten entre auditorías. No clasifica ni decide:
-- señala que el mismo proceso vuelve a aparecer.
create or replace view public.v_quality_audit_recurring_findings
with (security_invoker = true) as
select
  f.organization_id,
  f.process_id,
  p.name                       as process_name,
  f.proposed_classification,
  count(*)                     as occurrences,
  count(distinct f.audit_id)   as audits_involved,
  min(f.raised_on)             as first_raised_on,
  max(f.raised_on)             as last_raised_on
from public.quality_audit_findings f
join public.quality_processes p
  on p.organization_id = f.organization_id and p.id = f.process_id
where f.process_id is not null
  and f.proposed_classification in ('nonconformity_suspected', 'observation')
group by f.organization_id, f.process_id, p.name, f.proposed_classification
having count(distinct f.audit_id) > 1;

comment on view public.v_quality_audit_recurring_findings is
  'QUALITY-09 · AR-18 · El mismo proceso reaparece en varias auditorías. Es una observación sobre el patrón; no clasifica nada.';


-- ============================================================================
-- 15 · ACTOS FORMALES (RPC)
-- ----------------------------------------------------------------------------
-- §63 · TODAS fijan `search_path` y comprueban la pertenencia. Ninguna se fía
-- del `p_organization_id` que le manden: o lo deriva de la fila, o comprueba
-- que quien llama sea miembro antes de responder.
-- ============================================================================

-- El retrato del programa, para dejarlo escrito en cada revisión (§66).
create or replace function public.quality_audit_program_snapshot(p_program_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'captured_at', now(),
    'audits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', a.code, 'title', a.title, 'status', a.status,
               'nature', a.nature,
               'planned_from', a.planned_from, 'planned_to', a.planned_to,
               'scheduled_from', a.scheduled_from, 'scheduled_to', a.scheduled_to,
               'cancelled', a.status = 'cancelled')
             order by coalesce(a.scheduled_from, a.planned_from) nulls last, a.code)
        from quality_audits a
       where a.organization_id = p.organization_id and a.program_id = p.id), '[]'::jsonb)
  )
  from quality_audit_programs p where p.id = p_program_id;
$$;
revoke all on function public.quality_audit_program_snapshot(uuid) from public, anon, authenticated;


create or replace function public.quality_record_program_revision(
  p_program_id uuid,
  p_change_kind text,
  p_change_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_next integer;
begin
  select organization_id into v_org from quality_audit_programs where id = p_program_id;
  if v_org is null then
    raise exception 'Ese programa no existe.';
  end if;
  if not quality_manages_audits(v_org) then
    raise exception 'No tienes permiso para modificar el programa de auditorías.';
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_next
    from quality_audit_program_revisions where program_id = p_program_id;

  insert into quality_audit_program_revisions
    (organization_id, program_id, revision_number, change_kind, change_note,
     snapshot, created_by)
  values
    (v_org, p_program_id, v_next, p_change_kind, p_change_note,
     quality_audit_program_snapshot(p_program_id), auth.uid());

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_org, 'audit',
          case when v_next = 1 then 'audit.program_created' else 'audit.program_revised' end,
          'quality_audit_program', p_program_id,
          'Revisión ' || v_next || ' del programa: ' || p_change_kind || '.',
          jsonb_build_object('change_kind', p_change_kind, 'note', p_change_note));
end;
$$;
revoke all on function public.quality_record_program_revision(uuid, text, text) from public, anon;
grant execute on function public.quality_record_program_revision(uuid, text, text) to authenticated;


-- §43 · REPROGRAMAR SIN PERDER LA FECHA ORIGINAL.
--
-- La primera vez que se programa, `planned_*` queda fijada. Después solo se
-- mueve `scheduled_*`, y cada movimiento deja su fila con el motivo.
create or replace function public.quality_reschedule_audit(
  p_audit_id uuid,
  p_from     date,
  p_to       date,
  p_reason   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit record;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Reprogramar una auditoría exige decir por qué.';
  end if;
  select * into v_audit from quality_audits where id = p_audit_id;
  if v_audit.id is null then
    raise exception 'Esa auditoría no existe.';
  end if;
  if not quality_manages_audits(v_audit.organization_id) then
    raise exception 'No tienes permiso para reprogramar auditorías en esta empresa.';
  end if;
  if v_audit.status in ('executed', 'reported', 'closed', 'cancelled') then
    raise exception 'Esta auditoría ya se ejecutó o se cerró: no se reprograma.';
  end if;

  insert into quality_audit_reschedules
    (organization_id, audit_id, from_start, from_end, to_start, to_end, reason, decided_by)
  values
    (v_audit.organization_id, p_audit_id,
     v_audit.scheduled_from, v_audit.scheduled_to, p_from, p_to, p_reason, auth.uid());

  update quality_audits
     set scheduled_from = p_from,
         scheduled_to = p_to,
         -- La fecha original solo se fija la primera vez.
         planned_from = coalesce(planned_from, v_audit.scheduled_from, p_from),
         planned_to   = coalesce(planned_to, v_audit.scheduled_to, p_to)
   where id = p_audit_id;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_audit.organization_id, 'audit', 'audit.rescheduled',
          'quality_audit', p_audit_id,
          'Auditoría ' || v_audit.code || ' reprogramada.',
          jsonb_build_object('from', v_audit.scheduled_from, 'to', p_from,
                             'reason', p_reason));

  if v_audit.program_id is not null then
    perform quality_record_program_revision(
      v_audit.program_id, 'audit_rescheduled',
      'Auditoría ' || v_audit.code || ': ' || p_reason);
  end if;
end;
$$;
revoke all on function public.quality_reschedule_audit(uuid, date, date, text) from public, anon;
grant execute on function public.quality_reschedule_audit(uuid, date, date, text) to authenticated;


-- §44 · CANCELAR NO ES BORRAR. La auditoría sigue en el programa, con su
-- motivo, y la cobertura NO la cuenta como ejecutada.
create or replace function public.quality_cancel_audit(
  p_audit_id uuid,
  p_reason   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit record;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Cancelar una auditoría exige decir por qué.';
  end if;
  select * into v_audit from quality_audits where id = p_audit_id;
  if v_audit.id is null then
    raise exception 'Esa auditoría no existe.';
  end if;
  if not quality_manages_audits(v_audit.organization_id) then
    raise exception 'No tienes permiso para cancelar auditorías en esta empresa.';
  end if;
  if v_audit.status in ('closed', 'cancelled') then
    raise exception 'Esta auditoría ya está cerrada o cancelada.';
  end if;

  update quality_audits
     set status = 'cancelled', cancel_reason = p_reason,
         cancelled_at = now(), cancelled_by = auth.uid()
   where id = p_audit_id;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_audit.organization_id, 'audit', 'audit.cancelled',
          'quality_audit', p_audit_id,
          'Auditoría ' || v_audit.code || ' cancelada.',
          jsonb_build_object('reason', p_reason));

  if v_audit.program_id is not null then
    perform quality_record_program_revision(
      v_audit.program_id, 'audit_cancelled',
      'Auditoría ' || v_audit.code || ': ' || p_reason);
  end if;
end;
$$;
revoke all on function public.quality_cancel_audit(uuid, text) from public, anon;
grant execute on function public.quality_cancel_audit(uuid, text) to authenticated;


-- §16 · Publicar una versión de checklist. Cierra la anterior el día antes y no
-- toca ningún recorrido ya hecho.
create or replace function public.quality_publish_checklist_version(
  p_version_id     uuid,
  p_effective_from date default current_date,
  p_change_note    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version  record;
  v_previous record;
begin
  select * into v_version from quality_audit_checklist_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'Esa versión de checklist no existe.';
  end if;
  if not quality_manages_audits(v_version.organization_id) then
    raise exception 'No tienes permiso para publicar checklists en esta empresa.';
  end if;
  if v_version.status <> 'draft' then
    raise exception 'Esta versión ya fue publicada.';
  end if;
  if not exists (select 1 from quality_audit_checklist_items i where i.version_id = p_version_id) then
    raise exception 'Un checklist sin preguntas no se puede publicar.';
  end if;

  select * into v_previous
    from quality_audit_checklist_versions
   where organization_id = v_version.organization_id
     and checklist_id = v_version.checklist_id
     and status = 'published'
   order by version_number desc limit 1;

  if v_previous.id is not null then
    if p_effective_from <= v_previous.effective_from then
      raise exception 'La versión nueva no puede entrar en vigor antes que la que sustituye.';
    end if;
    update quality_audit_checklist_versions
       set status = 'superseded', effective_to = p_effective_from - 1
     where id = v_previous.id;
  end if;

  update quality_audit_checklist_versions
     set status = 'published', effective_from = p_effective_from, effective_to = null,
         published_at = now(), published_by = auth.uid(),
         change_note = coalesce(p_change_note, change_note)
   where id = p_version_id;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_version.organization_id, 'audit', 'audit.checklist_version_published',
          'quality_audit', v_version.checklist_id,
          'Versión ' || v_version.version_number || ' del checklist publicada.',
          jsonb_build_object('version_id', p_version_id,
                             'effective_from', p_effective_from));
end;
$$;
revoke all on function public.quality_publish_checklist_version(uuid, date, text) from public, anon;
grant execute on function public.quality_publish_checklist_version(uuid, date, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 15.1 · El hallazgo, el caso y la no conformidad (§33, §34, AR-09)
-- ----------------------------------------------------------------------------

-- §33/§34 · ESCALAR UN HALLAZGO A UN CASO ES UNA DECISIÓN EXPLÍCITA.
--
-- §30 · Y el caso nace SIN CLASIFICAR. Que un auditor sospeche una no
-- conformidad no la convierte en una: eso se decide en la ficha del caso, con
-- QUALITY-04, y puede terminar en observación, en oportunidad de mejora o en
-- nada.
create or replace function public.quality_open_case_from_audit_finding(
  p_finding_id  uuid,
  p_title       text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_finding record;
  v_audit   record;
  v_code    text;
  v_case    uuid;
  v_crit    record;
begin
  select * into v_finding from quality_audit_findings where id = p_finding_id;
  if v_finding.id is null then
    raise exception 'Ese hallazgo no existe.';
  end if;
  if not quality_manages_audits(v_finding.organization_id) then
    raise exception 'No tienes permiso para abrir casos en esta empresa.';
  end if;
  if v_finding.case_id is not null then
    raise exception 'Este hallazgo ya tiene un caso abierto.';
  end if;

  select * into v_audit from quality_audits where id = v_finding.audit_id;
  select work_next_case_code(v_finding.organization_id) into v_code;

  -- `case_type = 'audit_finding'` y `origin_kind = 'audit'` existían desde
  -- QUALITY-04: el puente estaba puesto antes de este sprint.
  insert into work_cases
    (organization_id, code, title, description, case_type, origin_kind, origin_note,
     detected_on, status, owner_position_id)
  values
    (v_finding.organization_id, v_code,
     coalesce(p_title, left(v_finding.statement, 200)),
     coalesce(p_description, v_finding.detail, v_finding.statement),
     'audit_finding', 'audit',
     'Abierto desde el hallazgo ' || v_finding.code || ' de la auditoría ' || v_audit.code || '.',
     v_finding.raised_on, 'open', v_audit.owner_position_id)
  returning id into v_case;

  -- El enunciado del hallazgo, en la tabla que QUALITY-04 ya tenía para eso.
  insert into work_case_findings
    (organization_id, case_id, statement, location_text, observed_on, observed_by,
     evidence_note)
  values
    (v_finding.organization_id, v_case, v_finding.statement, v_finding.location_text,
     v_finding.raised_on, v_finding.raised_by,
     'Evidencia registrada en la auditoría ' || v_audit.code || '.');

  -- §14 · El CRITERIO viaja al caso, no la pregunta del checklist.
  select * into v_crit from quality_audit_criteria where id = v_finding.criterion_id;
  if v_crit.id is not null then
    insert into work_case_requirements
      (organization_id, case_id, requirement_id, document_id, custom_text, note)
    values
      (v_finding.organization_id, v_case, v_crit.requirement_id, v_crit.document_id,
       v_crit.custom_text,
       'Criterio de la auditoría ' || v_audit.code || '.');
  end if;

  if v_finding.process_id is not null then
    insert into work_case_processes (organization_id, case_id, process_id)
    values (v_finding.organization_id, v_case, v_finding.process_id)
    on conflict do nothing;
  end if;

  -- Las referencias ENLAZAN; no copian la evidencia (§33).
  insert into work_references (organization_id, owner_kind, owner_id, ref_kind, ref_id, note)
  values (v_finding.organization_id, 'case', v_case, 'quality_audit_finding', p_finding_id,
          'Hallazgo de auditoría que originó el caso.');
  insert into work_references (organization_id, owner_kind, owner_id, ref_kind, ref_id, note)
  values (v_finding.organization_id, 'case', v_case, 'quality_audit', v_finding.audit_id,
          'Auditoría en la que se levantó.');

  update quality_audit_findings
     set case_id = v_case, evaluation_status = 'escalated',
         evaluated_by = coalesce(evaluated_by, auth.uid()),
         evaluated_at = coalesce(evaluated_at, now())
   where id = p_finding_id;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_finding.organization_id, 'audit', 'audit.finding_escalated_to_case',
          'quality_audit_finding', p_finding_id,
          'Caso ' || v_code || ' abierto desde el hallazgo ' || v_finding.code || '.',
          jsonb_build_object('case_id', v_case, 'classification', 'pending',
                             'proposed', v_finding.proposed_classification));

  return v_case;
end;
$$;
revoke all on function public.quality_open_case_from_audit_finding(uuid, text, text) from public, anon;
grant execute on function public.quality_open_case_from_audit_finding(uuid, text, text) to authenticated;

comment on function public.quality_open_case_from_audit_finding(uuid, text, text) is
  'QUALITY-09 · §30/§34 · Abre un caso SIN clasificar. Ni siquiera un hallazgo que propone «no conformidad» la declara: eso se decide en la ficha del caso.';


-- §33 · Evaluar un hallazgo SIN escalarlo. Es la otra salida legítima: mirarlo
-- y decidir que no merece un caso.
create or replace function public.quality_evaluate_audit_finding(
  p_finding_id uuid,
  p_status     text,
  p_note       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_finding record;
begin
  if p_status not in ('evaluated', 'dismissed') then
    raise exception 'Para escalar un hallazgo a un caso usa la acción de abrir caso.';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Evaluar un hallazgo exige dejar dicho en qué se basa la decisión.';
  end if;
  select * into v_finding from quality_audit_findings where id = p_finding_id;
  if v_finding.id is null then
    raise exception 'Ese hallazgo no existe.';
  end if;
  if not quality_manages_audits(v_finding.organization_id) then
    raise exception 'No tienes permiso para evaluar hallazgos en esta empresa.';
  end if;
  if v_finding.evaluation_status = 'escalated' then
    raise exception 'Este hallazgo ya se escaló a un caso.';
  end if;

  update quality_audit_findings
     set evaluation_status = p_status, evaluation_note = p_note,
         evaluated_by = auth.uid(), evaluated_at = now()
   where id = p_finding_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              decided_by, rationale, context)
  values (v_finding.organization_id, 'audit_finding', p_finding_id,
          'audit_finding_evaluated', auth.uid(), p_note,
          jsonb_build_object('status', p_status,
                             'proposed', v_finding.proposed_classification));

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_finding.organization_id, 'audit', 'audit.finding_evaluated',
          'quality_audit_finding', p_finding_id,
          'Hallazgo ' || v_finding.code || ' evaluado: ' || p_status || '.',
          jsonb_build_object('status', p_status));
end;
$$;
revoke all on function public.quality_evaluate_audit_finding(uuid, text, text) from public, anon;
grant execute on function public.quality_evaluate_audit_finding(uuid, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 15.2 · Informe y cierre (§37, §38, §40, §41, §81)
-- ----------------------------------------------------------------------------

-- AR-11 · El informe se GENERA de datos estructurados, y congela el retrato de
-- la auditoría el día que se emite (§41).
create or replace function public.quality_issue_audit_report(
  p_audit_id uuid,
  p_summary  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit    record;
  v_snapshot jsonb;
  v_next     integer;
  v_report   uuid;
begin
  select * into v_audit from quality_audits where id = p_audit_id;
  if v_audit.id is null then
    raise exception 'Esa auditoría no existe.';
  end if;
  if not quality_closes_audits(v_audit.organization_id) then
    raise exception 'Tu rol no permite emitir el informe de una auditoría.';
  end if;
  if v_audit.status not in ('executed', 'reported') then
    raise exception 'El informe se emite cuando la ejecución ha terminado.';
  end if;
  if nullif(btrim(coalesce(v_audit.conclusions, '')), '') is null then
    raise exception 'Un informe sin conclusiones no es un informe. Escríbelas antes de emitirlo.';
  end if;

  -- §41 · El retrato de ENTONCES: el equipo de entonces, el criterio de
  -- entonces, la revisión de documento de entonces.
  select jsonb_build_object(
    'audit', jsonb_build_object(
      'code', v_audit.code, 'title', v_audit.title, 'type', v_audit.audit_type,
      'nature', v_audit.nature, 'objective', v_audit.objective,
      'scope_note', v_audit.scope_note,
      'planned_from', v_audit.planned_from, 'planned_to', v_audit.planned_to,
      'scheduled_from', v_audit.scheduled_from, 'scheduled_to', v_audit.scheduled_to,
      'executed_from', v_audit.executed_from, 'executed_to', v_audit.executed_to,
      'conclusions', v_audit.conclusions),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object(
               'person', pe.full_name, 'role', tm.team_role, 'note', tm.note)
             order by case tm.team_role when 'lead' then 0 else 1 end, pe.full_name)
        from quality_audit_team_members tm
        join quality_people pe
          on pe.organization_id = tm.organization_id and pe.id = tm.person_id
       where tm.organization_id = v_audit.organization_id and tm.audit_id = p_audit_id),
      '[]'::jsonb),
    'scope', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', si.item_kind,
               'process', pr.name,
               'process_revision', rv.revision_number,
               'document', d.title,
               'note', si.note)
             order by si.position_order)
        from quality_audit_scope_items si
        left join quality_processes pr
          on pr.organization_id = si.organization_id and pr.id = si.process_id
        left join quality_process_revisions rv
          on rv.organization_id = si.organization_id and rv.id = si.process_revision_id
        left join trazadoc_documents d
          on d.organization_id = si.organization_id and d.id = si.document_id
       where si.organization_id = v_audit.organization_id and si.audit_id = p_audit_id),
      '[]'::jsonb),
    -- §82 · El criterio documental con la REVISIÓN que se auditó, no la de hoy.
    'criteria', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', c.criterion_kind,
               'requirement_code', rq.code,
               'requirement_title', rq.title,
               'document', d.title,
               'document_revision', rv.revision_label,
               'document_revision_number', rv.revision_number,
               'custom_text', c.custom_text,
               'note', c.note)
             order by c.position_order)
        from quality_audit_criteria c
        left join requirements rq on rq.id = c.requirement_id
        left join trazadoc_documents d
          on d.organization_id = c.organization_id and d.id = c.document_id
        left join trazadoc_document_revisions rv
          on rv.organization_id = c.organization_id and rv.id = c.document_revision_id
       where c.organization_id = v_audit.organization_id and c.audit_id = p_audit_id),
      '[]'::jsonb),
    'findings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', f.code, 'statement', f.statement,
               'proposed_classification', f.proposed_classification,
               'proposed_severity', f.proposed_severity,
               'evaluation_status', f.evaluation_status,
               'process', pr.name,
               'case_code', k.code)
             order by f.code)
        from quality_audit_findings f
        left join quality_processes pr
          on pr.organization_id = f.organization_id and pr.id = f.process_id
        left join work_cases k
          on k.organization_id = f.organization_id and k.id = f.case_id
       where f.organization_id = v_audit.organization_id and f.audit_id = p_audit_id),
      '[]'::jsonb),
    'samples', coalesce((
      select jsonb_agg(jsonb_build_object(
               'description', s.description, 'sample_size', s.sample_size,
               'population_size', s.population_size, 'method', s.selection_method))
        from quality_audit_samples s
       where s.organization_id = v_audit.organization_id and s.audit_id = p_audit_id),
      '[]'::jsonb),
    'followup', (
      select jsonb_build_object(
        'open_cases', coalesce(o.open_cases, 0),
        'open_actions', coalesce(o.open_actions, 0),
        'findings_pending', coalesce(o.findings_pending, 0))
      from v_quality_audit_overview o
      where o.audit_id = p_audit_id)
  ) into v_snapshot;

  select coalesce(max(version_number), 0) + 1 into v_next
    from quality_audit_reports where audit_id = p_audit_id;

  insert into quality_audit_reports
    (organization_id, audit_id, version_number, issued_by, summary, snapshot,
     supersedes_id)
  values
    (v_audit.organization_id, p_audit_id, v_next, auth.uid(),
     coalesce(p_summary, v_audit.conclusions), v_snapshot,
     (select id from quality_audit_reports
       where audit_id = p_audit_id order by version_number desc limit 1))
  returning id into v_report;

  update quality_audits
     set status = 'reported', report_issued_at = now(), report_issued_by = auth.uid()
   where id = p_audit_id;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_audit.organization_id, 'audit', 'audit.report_issued',
          'quality_audit', p_audit_id,
          'Informe de la auditoría ' || v_audit.code || ' emitido (versión ' || v_next || ').',
          jsonb_build_object('report_id', v_report, 'version', v_next));

  return v_report;
end;
$$;
revoke all on function public.quality_issue_audit_report(uuid, text) from public, anon;
grant execute on function public.quality_issue_audit_report(uuid, text) to authenticated;

comment on function public.quality_issue_audit_report(uuid, text) is
  'QUALITY-09 · AR-11/§41 · Genera el informe de datos estructurados y CONGELA el retrato: equipo, criterios y revisiones de entonces.';


-- §37/§81 · CERRAR UNA AUDITORÍA NO ES CERRAR SUS ACCIONES.
--
-- AR-12 · Una auditoría se cierra cuando el trabajo de auditar terminó: se
-- ejecutó, se evaluaron los hallazgos, hay conclusiones y hay informe. Las
-- acciones correctivas que salieron de ella viven su propio ciclo, y exigir
-- que estén todas cerradas para poder cerrar la auditoría produce auditorías
-- abiertas durante años por una acción de nadie.
--
-- Lo que sí exige el cierre es DECIR qué queda pendiente.
create or replace function public.quality_close_audit(
  p_audit_id     uuid,
  p_closure_note text,
  p_followup_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit    record;
  v_overview record;
  v_pending  integer;
begin
  select * into v_audit from quality_audits where id = p_audit_id;
  if v_audit.id is null then
    raise exception 'Esa auditoría no existe.';
  end if;
  if not quality_closes_audits(v_audit.organization_id) then
    raise exception 'Tu rol no permite cerrar una auditoría.';
  end if;
  if v_audit.status = 'closed' then
    raise exception 'Esta auditoría ya está cerrada.';
  end if;
  if v_audit.status <> 'reported' then
    raise exception 'Antes de cerrar hay que emitir el informe de la auditoría.';
  end if;

  -- §37 · Los hallazgos SÍ tienen que estar evaluados: cerrar con hallazgos sin
  -- mirar es cerrar el trabajo a medias.
  select count(*) into v_pending
    from quality_audit_findings f
   where f.audit_id = p_audit_id and f.evaluation_status = 'pending';
  if v_pending > 0 then
    raise exception 'Quedan % hallazgo(s) sin evaluar. Míralos antes de cerrar: evaluarlos no obliga a abrir ningún caso.', v_pending;
  end if;

  select * into v_overview from v_quality_audit_overview where audit_id = p_audit_id;

  update quality_audits
     set status = 'closed', closed_at = now(), closed_by = auth.uid(),
         closure_note = p_closure_note,
         followup_note = coalesce(p_followup_note, followup_note)
   where id = p_audit_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              decided_by, rationale, context)
  values (v_audit.organization_id, 'audit', p_audit_id, 'audit_closed',
          auth.uid(), p_closure_note,
          jsonb_build_object('open_cases', coalesce(v_overview.open_cases, 0),
                             'open_actions', coalesce(v_overview.open_actions, 0)));

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_audit.organization_id, 'audit', 'audit.closed',
          'quality_audit', p_audit_id,
          'Auditoría ' || v_audit.code || ' cerrada.',
          jsonb_build_object('open_cases', coalesce(v_overview.open_cases, 0),
                             'open_actions', coalesce(v_overview.open_actions, 0)));

  -- §81 · Se dice EXACTAMENTE qué queda pendiente. Cerrar la auditoría no
  -- autoriza a decir «todo cerrado».
  return jsonb_build_object(
    'closed', true,
    'open_cases', coalesce(v_overview.open_cases, 0),
    'open_actions', coalesce(v_overview.open_actions, 0),
    'findings', coalesce(v_overview.finding_count, 0),
    'findings_escalated', coalesce(v_overview.findings_escalated, 0),
    'closes_derived_work', false
  );
end;
$$;
revoke all on function public.quality_close_audit(uuid, text, text) from public, anon;
grant execute on function public.quality_close_audit(uuid, text, text) to authenticated;

comment on function public.quality_close_audit(uuid, text, text) is
  'QUALITY-09 · AR-12/§37 · Cerrar la auditoría NO cierra sus casos ni sus acciones. `closes_derived_work` es siempre false, y el resultado dice cuántos quedan abiertos.';


-- ============================================================================
-- 16 · PREPARACIÓN Y PRIORIZACIÓN (AR-04, AR-07, §8, §9, §46, §77)
-- ----------------------------------------------------------------------------
-- AR-07 · El expediente de preparación se arma SOLO. Nada de lo que hay aquí
-- es nuevo: son datos que ya existen en otros dominios, reunidos para que quien
-- va a auditar no tenga que buscarlos en seis pantallas.
--
-- AR-04/§8 · Y la priorización SUGIERE, con su explicación al lado. La decisión
-- de programar sigue siendo humana: un riesgo alto no programa una auditoría.
-- ============================================================================

create or replace function public.quality_audit_priority_context(
  p_organization_id uuid,
  p_process_id      uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  -- §63 · Pertenencia primero. Para quien no es miembro, nada.
  if not is_org_member(p_organization_id) then
    return null;
  end if;
  if not exists (select 1 from quality_processes p
                  where p.organization_id = p_organization_id and p.id = p_process_id) then
    return null;
  end if;

  select jsonb_build_object(
    'process_id', p_process_id,
    -- QUALITY-05 · Los riesgos NO cuelgan del proceso por columna: se enlazan
    -- con `work_references`. Se lee de la vista que ya resuelve el nivel
    -- vigente y su aceptabilidad.
    'risks', jsonb_build_object(
      'total', (select count(*) from v_quality_risk_overview r
                 join work_references wr
                   on wr.organization_id = r.organization_id
                  and wr.owner_kind = 'risk' and wr.owner_id = r.id
                  and wr.ref_kind = 'quality_process' and wr.ref_id = p_process_id
                 where r.organization_id = p_organization_id
                   and r.status not in ('closed', 'superseded')),
      'above_appetite', (select count(*) from v_quality_risk_overview r
                          join work_references wr
                            on wr.organization_id = r.organization_id
                           and wr.owner_kind = 'risk' and wr.owner_id = r.id
                           and wr.ref_kind = 'quality_process' and wr.ref_id = p_process_id
                         where r.organization_id = p_organization_id
                           and r.current_is_acceptable is false),
      'materialized', (select coalesce(sum(r.materialization_count), 0)
                         from v_quality_risk_overview r
                         join work_references wr
                           on wr.organization_id = r.organization_id
                          and wr.owner_kind = 'risk' and wr.owner_id = r.id
                          and wr.ref_kind = 'quality_process' and wr.ref_id = p_process_id
                        where r.organization_id = p_organization_id)),
    -- QUALITY-03 · Desempeño, con la evaluación vigente que la vista resuelve.
    'indicators', jsonb_build_object(
      'total', (select count(*) from v_quality_indicator_status i
                 where i.organization_id = p_organization_id
                   and i.scope_process_id = p_process_id
                   and i.admin_state = 'active'),
      'off_target', (select count(*) from v_quality_indicator_status i
                      where i.organization_id = p_organization_id
                        and i.scope_process_id = p_process_id
                        and i.admin_state = 'active'
                        and i.last_evaluation = 'not_met')),
    -- QUALITY-04 · Casos y no conformidades del proceso.
    'cases', jsonb_build_object(
      'open', (select count(*) from work_cases k
                join work_case_processes kp
                  on kp.organization_id = k.organization_id and kp.case_id = k.id
               where k.organization_id = p_organization_id
                 and kp.process_id = p_process_id and k.status <> 'closed'),
      'nonconformities', (select count(*) from work_cases k
                           join work_case_processes kp
                             on kp.organization_id = k.organization_id and kp.case_id = k.id
                          where k.organization_id = p_organization_id
                            and kp.process_id = p_process_id
                            and k.classification = 'nonconformity')),
    -- QUALITY-09 · Lo que dijeron las auditorías anteriores.
    'prior_audits', jsonb_build_object(
      'count', (select count(distinct si.audit_id) from quality_audit_scope_items si
                 join quality_audits a
                   on a.organization_id = si.organization_id and a.id = si.audit_id
                where si.organization_id = p_organization_id
                  and si.process_id = p_process_id
                  and a.status in ('executed', 'reported', 'closed')),
      'last_executed_on', (select max(a.executed_to) from quality_audit_scope_items si
                            join quality_audits a
                              on a.organization_id = si.organization_id and a.id = si.audit_id
                           where si.organization_id = p_organization_id
                             and si.process_id = p_process_id),
      'prior_findings', (select count(*) from quality_audit_findings f
                          where f.organization_id = p_organization_id
                            and f.process_id = p_process_id)),
    -- Y esto es lo que el contexto NO hace.
    'suggests_only', true,
    'schedules_automatically', false
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.quality_audit_priority_context(uuid, uuid) from public, anon;
grant execute on function public.quality_audit_priority_context(uuid, uuid) to authenticated;

comment on function public.quality_audit_priority_context(uuid, uuid) is
  'QUALITY-09 · AR-04/§9 · Reúne el contexto que ayuda a priorizar —riesgo, desempeño, casos, auditorías previas— y NO programa nada. `schedules_automatically` es siempre false.';


-- AR-07 · El expediente de preparación. Todo lo que hay aquí ya existía; lo
-- único nuevo es tenerlo junto.
create or replace function public.quality_audit_preparation_dossier(p_audit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_audit  record;
  v_on     date;
  v_result jsonb;
begin
  select * into v_audit from quality_audits where id = p_audit_id;
  if v_audit.id is null or not is_org_member(v_audit.organization_id) then
    return null;
  end if;
  v_on := coalesce(v_audit.executed_from, v_audit.scheduled_from,
                   v_audit.planned_from, current_date);

  select jsonb_build_object(
    'audit', jsonb_build_object('code', v_audit.code, 'title', v_audit.title,
                                'reference_date', v_on),
    'processes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'process_id', p.id, 'code', p.code, 'name', p.name,
               'owner_position', po.name,
               -- §53 · La revisión que regía en la fecha de la auditoría.
               'revision_on_date', (
                 select jsonb_build_object('id', r.id, 'number', r.revision_number,
                                           'effective_from', r.effective_from)
                   from quality_process_revisions r
                  where r.organization_id = p.organization_id and r.process_id = p.id
                    and r.status = 'published'
                    and r.effective_from <= v_on
                    and (r.effective_to is null or r.effective_to >= v_on)
                  order by r.revision_number desc limit 1),
               'priority_context', quality_audit_priority_context(p.organization_id, p.id))
             order by p.code nulls last, p.name)
        from quality_audit_scope_items si
        join quality_processes p
          on p.organization_id = si.organization_id and p.id = si.process_id
        left join quality_positions po
          on po.organization_id = p.organization_id and po.id = p.owner_position_id
       where si.organization_id = v_audit.organization_id and si.audit_id = p_audit_id
         and si.process_id is not null), '[]'::jsonb),
    -- §52/AR-05 · Los documentos con la revisión VIGENTE en la fecha auditada.
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'document_id', d.id, 'title', d.title, 'code', d.code,
               'revision_on_date', (
                 select jsonb_build_object('id', r.id, 'number', r.revision_number,
                                           'label', r.revision_label,
                                           'effective_from', r.effective_from)
                   from trazadoc_document_revisions r
                  where r.organization_id = d.organization_id and r.document_id = d.id
                    and r.effective_from is not null
                    and r.effective_from <= v_on
                    and (r.effective_to is null or r.effective_to >= v_on)
                  order by r.revision_number desc limit 1)))
        from quality_audit_criteria c
        join trazadoc_documents d
          on d.organization_id = c.organization_id and d.id = c.document_id
       where c.organization_id = v_audit.organization_id and c.audit_id = p_audit_id
         and c.document_id is not null), '[]'::jsonb),
    'team_competence', coalesce((
      select jsonb_agg(jsonb_build_object(
               'person', pe.full_name, 'role', tm.team_role,
               'has_account', pe.profile_id is not null,
               -- §18 · Se MUESTRA la competencia. No se decide con ella.
               'competencies', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'name', cp.name, 'level', pc.demonstrated_level,
                          'status', pc.status)), '[]'::jsonb)
                   from quality_person_competencies pc
                   join quality_competencies cp
                     on cp.organization_id = pc.organization_id and cp.id = pc.competency_id
                  where pc.organization_id = pe.organization_id and pc.person_id = pe.id)))
        from quality_audit_team_members tm
        join quality_people pe
          on pe.organization_id = tm.organization_id and pe.id = tm.person_id
       where tm.organization_id = v_audit.organization_id and tm.audit_id = p_audit_id),
      '[]'::jsonb),
    'conflicts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'person', c.person_name, 'kind', c.conflict_kind, 'detail', c.detail))
        from quality_audit_conflicts_on(v_audit.organization_id, p_audit_id, v_on) c),
      '[]'::jsonb),
    'decides_nothing', true
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.quality_audit_preparation_dossier(uuid) from public, anon;
grant execute on function public.quality_audit_preparation_dossier(uuid) to authenticated;

comment on function public.quality_audit_preparation_dossier(uuid) is
  'QUALITY-09 · AR-07 · El expediente de preparación, armado con lo que ya existe. Muestra la competencia del equipo y los conflictos; no decide con ninguno de los dos.';


-- ============================================================================
-- 17 · BARRIDO (§49, §51, §98)
-- ----------------------------------------------------------------------------
-- Idempotente. Todo lo que produce son AVISOS: ninguna rama clasifica un
-- hallazgo, abre un caso, crea una acción ni cambia el estado de una auditoría.
-- ============================================================================

create or replace function public.quality_audit_notice_recipient(p_organization_id uuid)
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
revoke all on function public.quality_audit_notice_recipient(uuid) from public, anon, authenticated;


create or replace function public.quality_scan_audits(p_organization_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Lo que devuelve el barrido es lo que ha CREADO en esta pasada, no cuántos
  -- avisos hay en total. La diferencia importa: una segunda pasada seguida
  -- devuelve 0, y eso es exactamente lo que significa «idempotente».
  v_count integer := 0;
  v_n     integer := 0;
begin
  if auth.uid() is not null then
    if p_organization_id is null then
      raise exception 'Indica sobre qué empresa quieres revisar las auditorías.';
    end if;
    if not is_org_member(p_organization_id) then
      raise exception 'No tienes acceso a esa empresa.';
    end if;
  end if;

  -- 17.1 · Auditoría que empieza en los próximos catorce días.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select a.organization_id, 'audit', 'audit_upcoming', 'info',
         'quality_audit', a.id,
         quality_audit_notice_recipient(a.organization_id),
         'Auditoría próxima: ' || a.title,
         'Prevista para el ' || to_char(a.scheduled_from, 'DD/MM/YYYY')
           || '. Prepara el plan y confirma el equipo.',
         'audit_upcoming:' || a.id::text || ':' || a.scheduled_from::text
    from quality_audits a
   where a.status in ('draft', 'planned')
     and a.scheduled_from is not null
     and a.scheduled_from between current_date and current_date + 14
     and quality_audit_notice_recipient(a.organization_id) is not null
     and (p_organization_id is null or a.organization_id = p_organization_id)
     and not exists (select 1 from work_alerts w
                      where w.dedupe_key = 'audit_upcoming:' || a.id::text || ':' || a.scheduled_from::text);
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                          title, description, assignee_profile_id, assignee_position_id,
                          status, due_at, dedupe_key)
  select a.organization_id, 'audit', 'audit_preparation',
         'quality_audit', a.id,
         'Preparar la auditoría ' || a.code,
         'Empieza el ' || to_char(a.scheduled_from, 'DD/MM/YYYY') || '.',
         quality_audit_notice_recipient(a.organization_id), a.owner_position_id,
         'open', a.scheduled_from,
         'audit_preparation:' || a.id::text || ':' || a.scheduled_from::text
    from quality_audits a
   where a.status in ('draft', 'planned')
     and a.scheduled_from is not null
     and a.scheduled_from between current_date and current_date + 14
     and quality_audit_notice_recipient(a.organization_id) is not null
     and (p_organization_id is null or a.organization_id = p_organization_id)
     and not exists (select 1 from work_tasks w
                      where w.dedupe_key = 'audit_preparation:' || a.id::text || ':' || a.scheduled_from::text);
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- 17.2 · Auditoría que pasó su fecha y sigue sin ejecutarse. Vencer no la
  -- cancela ni la reprograma: pide una decisión.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select a.organization_id, 'audit', 'audit_overdue', 'warning',
         'quality_audit', a.id,
         quality_audit_notice_recipient(a.organization_id),
         'Auditoría vencida: ' || a.title,
         'Estaba prevista para el ' || to_char(a.scheduled_to, 'DD/MM/YYYY')
           || ' y no se ha ejecutado. Hay que reprogramarla o cancelarla, y las dos cosas dejan constancia.',
         'audit_overdue:' || a.id::text || ':' || a.scheduled_to::text
    from quality_audits a
   where a.status in ('draft', 'planned', 'in_progress')
     and a.scheduled_to is not null
     and a.scheduled_to < current_date
     and quality_audit_notice_recipient(a.organization_id) is not null
     and (p_organization_id is null or a.organization_id = p_organization_id)
     and not exists (select 1 from work_alerts w
                      where w.dedupe_key = 'audit_overdue:' || a.id::text || ':' || a.scheduled_to::text);
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- 17.3 · Ejecutada y sin informe.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select a.organization_id, 'audit', 'audit_report_pending', 'warning',
         'quality_audit', a.id,
         quality_audit_notice_recipient(a.organization_id),
         'Informe pendiente: ' || a.title,
         'La auditoría terminó el ' || to_char(a.executed_to, 'DD/MM/YYYY')
           || ' y todavía no tiene informe.',
         'audit_report_pending:' || a.id::text
    from quality_audits a
   where a.status = 'executed'
     and a.executed_to is not null
     and a.executed_to <= current_date - 7
     and quality_audit_notice_recipient(a.organization_id) is not null
     and (p_organization_id is null or a.organization_id = p_organization_id)
     and not exists (select 1 from work_alerts w
                      where w.dedupe_key = 'audit_report_pending:' || a.id::text);
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                          title, description, assignee_profile_id, assignee_position_id,
                          status, dedupe_key)
  select a.organization_id, 'audit', 'audit_report_issue',
         'quality_audit', a.id,
         'Emitir el informe de ' || a.code,
         'La ejecución terminó el ' || to_char(a.executed_to, 'DD/MM/YYYY') || '.',
         quality_audit_notice_recipient(a.organization_id), a.owner_position_id,
         'open', 'audit_report_issue:' || a.id::text
    from quality_audits a
   where a.status = 'executed'
     and a.executed_to is not null
     and a.executed_to <= current_date - 7
     and quality_audit_notice_recipient(a.organization_id) is not null
     and (p_organization_id is null or a.organization_id = p_organization_id)
     and not exists (select 1 from work_tasks w
                      where w.dedupe_key = 'audit_report_issue:' || a.id::text);
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- 17.4 · Hallazgo sin evaluar tras catorce días. Avisa; NO lo clasifica.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select f.organization_id, 'audit', 'audit_finding_unevaluated', 'warning',
         'quality_audit_finding', f.id,
         quality_audit_notice_recipient(f.organization_id),
         'Hallazgo sin evaluar: ' || f.code,
         'Se levantó el ' || to_char(f.raised_on, 'DD/MM/YYYY')
           || ' y sigue sin evaluar. Evaluarlo NO obliga a abrir ningún caso ni lo convierte en no conformidad.',
         'audit_finding_unevaluated:' || f.id::text
    from quality_audit_findings f
   where f.evaluation_status = 'pending'
     and f.raised_on <= current_date - 14
     and quality_audit_notice_recipient(f.organization_id) is not null
     and (p_organization_id is null or f.organization_id = p_organization_id)
     and not exists (select 1 from work_alerts w
                      where w.dedupe_key = 'audit_finding_unevaluated:' || f.id::text);
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                          title, description, assignee_profile_id, status, dedupe_key)
  select f.organization_id, 'audit', 'audit_finding_evaluation',
         'quality_audit_finding', f.id,
         'Evaluar el hallazgo ' || f.code,
         'Decide qué hacer con él. Abrir un caso —o no— es tu decisión.',
         quality_audit_notice_recipient(f.organization_id), 'open',
         'audit_finding_evaluation:' || f.id::text
    from quality_audit_findings f
   where f.evaluation_status = 'pending'
     and f.raised_on <= current_date - 14
     and quality_audit_notice_recipient(f.organization_id) is not null
     and (p_organization_id is null or f.organization_id = p_organization_id)
     and not exists (select 1 from work_tasks w
                      where w.dedupe_key = 'audit_finding_evaluation:' || f.id::text);
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- 17.5 · Conflicto de independencia sin decidir.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select c.organization_id, 'audit', 'audit_independence_conflict', 'warning',
         'quality_audit', c.audit_id,
         quality_audit_notice_recipient(c.organization_id),
         'Conflicto de independencia sin resolver',
         c.detail || ' Hay que decidir si se acepta con mitigación o se cambia el equipo.',
         'audit_conflict:' || c.id::text
    from quality_audit_conflict_checks c
   where c.status = 'detected'
     and quality_audit_notice_recipient(c.organization_id) is not null
     and (p_organization_id is null or c.organization_id = p_organization_id)
     and not exists (select 1 from work_alerts w
                      where w.dedupe_key = 'audit_conflict:' || c.id::text);
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  return coalesce(v_count, 0);
end;
$$;
revoke all on function public.quality_scan_audits(uuid) from public, anon;
grant execute on function public.quality_scan_audits(uuid) to authenticated;

comment on function public.quality_scan_audits(uuid) is
  'QUALITY-09 · §49 · Solo produce avisos y tareas. Ninguna rama clasifica hallazgos, abre casos, crea acciones ni mueve el estado de una auditoría.';


-- ============================================================================
-- 18 · INMUTABILIDAD DEL CIERRE (§65, AR-20)
-- ----------------------------------------------------------------------------
-- Después de cerrar, no se cambia en silencio el alcance, los criterios, el
-- equipo, los hallazgos ni las conclusiones. Una corrección formal es una
-- versión nueva del informe, no una edición de lo que ya se emitió.
-- ============================================================================

create or replace function public.quality_audit_is_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_audit  uuid;
begin
  v_audit := coalesce(new.audit_id, old.audit_id);
  select status into v_status from quality_audits where id = v_audit;
  if v_status = 'closed' then
    raise exception 'Esta auditoría está cerrada: lo que la sostiene no se cambia. Si hace falta corregir algo, se emite una versión nueva del informe.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger t_quality_audit_scope_closed
  before insert or update or delete on public.quality_audit_scope_items
  for each row execute function public.quality_audit_is_closed();
create trigger t_quality_audit_criteria_closed
  before insert or update or delete on public.quality_audit_criteria
  for each row execute function public.quality_audit_is_closed();
create trigger t_quality_audit_team_closed
  before insert or update or delete on public.quality_audit_team_members
  for each row execute function public.quality_audit_is_closed();
create trigger t_quality_audit_evidence_closed
  before insert or update or delete on public.quality_audit_evidence
  for each row execute function public.quality_audit_is_closed();
create trigger t_quality_audit_samples_closed
  before insert or update or delete on public.quality_audit_samples
  for each row execute function public.quality_audit_is_closed();
create trigger t_quality_audit_agenda_closed
  before insert or update or delete on public.quality_audit_agenda_items
  for each row execute function public.quality_audit_is_closed();
create trigger t_quality_audit_notes_closed
  before insert or update or delete on public.quality_audit_notes
  for each row execute function public.quality_audit_is_closed();


-- Los hallazgos de una auditoría cerrada: no se reescriben ni se borran. Lo
-- único que sigue vivo es el trabajo derivado, que vive en su propio motor.
create or replace function public.quality_audit_finding_is_frozen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from quality_audits
   where id = coalesce(new.audit_id, old.audit_id);
  if v_status = 'closed' then
    raise exception 'La auditoría está cerrada: sus hallazgos son parte del informe emitido y no se reescriben.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger t_quality_audit_findings_frozen
  before insert or update or delete on public.quality_audit_findings
  for each row execute function public.quality_audit_finding_is_frozen();


-- Y la propia auditoría: cerrada solo admite la nota de seguimiento, que es lo
-- que de verdad cambia mientras el trabajo derivado avanza.
create or replace function public.quality_audit_closed_is_final()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'closed' then
      raise exception 'Una auditoría cerrada no se elimina.';
    end if;
    return old;
  end if;
  if old.status = 'closed' then
    if new.status is distinct from old.status
       or new.code is distinct from old.code
       or new.title is distinct from old.title
       or new.objective is distinct from old.objective
       or new.scope_note is distinct from old.scope_note
       or new.conclusions is distinct from old.conclusions
       or new.executed_from is distinct from old.executed_from
       or new.executed_to is distinct from old.executed_to
       or new.planned_from is distinct from old.planned_from
       or new.scheduled_from is distinct from old.scheduled_from then
      raise exception 'Esta auditoría está cerrada. Lo único que se puede seguir actualizando es la nota de seguimiento; el resto es parte del informe emitido.';
    end if;
  end if;
  return new;
end;
$$;

create trigger t_quality_audits_closed_is_final
  before update or delete on public.quality_audits
  for each row execute function public.quality_audit_closed_is_final();


-- ============================================================================
-- 19 · CICLO DE VIDA (§44, §85)
-- ----------------------------------------------------------------------------
-- Una auditoría que nunca se ejecutó y no dejó nada material puede eliminarse.
-- En cuanto tiene hallazgos, evidencia o informe, se cancela o se cierra: lo
-- que se auditó y lo que se encontró no se borra.
-- ============================================================================

create or replace function public.quality_audit_deletion_verdict(p_audit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_audit    record;
  v_blocking jsonb := '[]'::jsonb;
  v_n        integer;
begin
  select * into v_audit from quality_audits where id = p_audit_id;
  if v_audit.id is null or not is_org_member(v_audit.organization_id) then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Esta auditoría no existe.', 'blocking', '[]'::jsonb);
  end if;

  select count(*) into v_n from quality_audit_findings where audit_id = p_audit_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'hallazgo' else 'hallazgos' end, 'count', v_n);
  end if;

  select count(*) into v_n from quality_audit_evidence where audit_id = p_audit_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'evidencia registrada' else 'evidencias registradas' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_audit_reports where audit_id = p_audit_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'informe emitido' else 'informes emitidos' end,
      'count', v_n);
  end if;

  if v_audit.status in ('executed', 'reported', 'closed') then
    v_blocking := v_blocking || jsonb_build_object('label', 'ejecución registrada', 'count', 1);
  end if;

  if jsonb_array_length(v_blocking) > 0 then
    return jsonb_build_object(
      'can_hard_delete', false, 'reason_code', 'has_history',
      'reason', 'Esta auditoría ya produjo historia y se conserva.',
      'blocking', v_blocking,
      'alternative', 'close',
      'alternative_label', 'Puedes cancelarla con su motivo o cerrarla: en los dos casos sigue en el programa');
  end if;

  return jsonb_build_object(
    'can_hard_delete', true, 'reason_code', 'disposable',
    'reason', 'Esta auditoría sigue siendo un plan sin ejecutar.',
    'blocking', '[]'::jsonb, 'alternative', null, 'alternative_label', null);
end;
$$;
revoke all on function public.quality_audit_deletion_verdict(uuid) from public, anon, authenticated;


create or replace function public.quality_audit_program_deletion_verdict(p_program_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_program  record;
  v_blocking jsonb := '[]'::jsonb;
  v_n        integer;
begin
  select * into v_program from quality_audit_programs where id = p_program_id;
  if v_program.id is null or not is_org_member(v_program.organization_id) then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Este programa no existe.', 'blocking', '[]'::jsonb);
  end if;

  select count(*) into v_n from quality_audits where program_id = p_program_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'auditoría programada' else 'auditorías programadas' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_audit_program_revisions where program_id = p_program_id;
  if v_n > 1 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', 'revisiones del programa', 'count', v_n);
  end if;

  if jsonb_array_length(v_blocking) > 0 then
    return jsonb_build_object(
      'can_hard_delete', false, 'reason_code', 'has_history',
      'reason', 'Este programa ya tiene historia y se conserva.',
      'blocking', v_blocking,
      'alternative', 'close',
      'alternative_label', 'Puedes cerrarlo: deja de recibir auditorías y su cobertura sigue consultable');
  end if;

  return jsonb_build_object(
    'can_hard_delete', true, 'reason_code', 'disposable',
    'reason', 'Este programa todavía no tiene ninguna auditoría.',
    'blocking', '[]'::jsonb, 'alternative', null, 'alternative_label', null);
end;
$$;
revoke all on function public.quality_audit_program_deletion_verdict(uuid) from public, anon, authenticated;


-- La puerta pública del ciclo de vida sigue siendo UNA sola.
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
  end;
end;
$$;
revoke all on function public.quality_deletion_eligibility(text, uuid) from public, anon;
grant execute on function public.quality_deletion_eligibility(text, uuid) to authenticated;


create or replace function public.quality_audit_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  v := quality_audit_deletion_verdict(old.id);
  if not (v->>'can_hard_delete')::boolean then
    raise exception '%', v->>'reason';
  end if;
  return old;
end;
$$;

create trigger t_quality_audit_delete_guard
  before delete on public.quality_audits
  for each row execute function public.quality_audit_delete_guard();

create or replace function public.quality_audit_program_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  v := quality_audit_program_deletion_verdict(old.id);
  if not (v->>'can_hard_delete')::boolean then
    raise exception '%', v->>'reason';
  end if;
  return old;
end;
$$;

create trigger t_quality_audit_program_delete_guard
  before delete on public.quality_audit_programs
  for each row execute function public.quality_audit_program_delete_guard();


-- ============================================================================
-- 20 · RLS (§58, §61, §62, §64)
-- ----------------------------------------------------------------------------
-- Deny-by-default en las dieciséis tablas. Y dos asimetrías deliberadas:
--
--   · las NOTAS restringidas solo las lee quien conduce el dominio o quien
--     está en el equipo auditor de ESA auditoría. Un miembro cualquiera de
--     Quality lee el informe, no lo que alguien contó en una entrevista;
--
--   · los INFORMES y las revisiones del programa solo se LEEN: se emiten por
--     RPC, que es donde se congela el retrato.
-- ============================================================================

alter table public.quality_audit_programs            enable row level security;
alter table public.quality_audit_program_revisions   enable row level security;
alter table public.quality_audits                    enable row level security;
alter table public.quality_audit_reschedules         enable row level security;
alter table public.quality_audit_scope_items         enable row level security;
alter table public.quality_audit_criteria            enable row level security;
alter table public.quality_audit_checklists          enable row level security;
alter table public.quality_audit_checklist_versions  enable row level security;
alter table public.quality_audit_checklist_items     enable row level security;
alter table public.quality_audit_checklist_runs      enable row level security;
alter table public.quality_audit_check_results       enable row level security;
alter table public.quality_audit_team_members        enable row level security;
alter table public.quality_audit_conflict_checks     enable row level security;
alter table public.quality_audit_agenda_items        enable row level security;
alter table public.quality_audit_meetings            enable row level security;
alter table public.quality_audit_auditees            enable row level security;
alter table public.quality_audit_notes               enable row level security;
alter table public.quality_audit_samples             enable row level security;
alter table public.quality_audit_evidence            enable row level security;
alter table public.quality_audit_finding_evidence    enable row level security;
alter table public.quality_audit_findings            enable row level security;
alter table public.quality_audit_reports             enable row level security;

-- Lectura: cualquier miembro de la empresa.
create policy quality_audit_programs_select on public.quality_audit_programs
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_program_revisions_select on public.quality_audit_program_revisions
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audits_select on public.quality_audits
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_reschedules_select on public.quality_audit_reschedules
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_scope_items_select on public.quality_audit_scope_items
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_criteria_select on public.quality_audit_criteria
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_checklists_select on public.quality_audit_checklists
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_checklist_versions_select on public.quality_audit_checklist_versions
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_checklist_items_select on public.quality_audit_checklist_items
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_checklist_runs_select on public.quality_audit_checklist_runs
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_check_results_select on public.quality_audit_check_results
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_team_members_select on public.quality_audit_team_members
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_conflict_checks_select on public.quality_audit_conflict_checks
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_agenda_items_select on public.quality_audit_agenda_items
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_meetings_select on public.quality_audit_meetings
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_auditees_select on public.quality_audit_auditees
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_samples_select on public.quality_audit_samples
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_evidence_select on public.quality_audit_evidence
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_finding_evidence_select on public.quality_audit_finding_evidence
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_findings_select on public.quality_audit_findings
  for select to authenticated using (is_org_member(organization_id));
create policy quality_audit_reports_select on public.quality_audit_reports
  for select to authenticated using (is_org_member(organization_id));

-- §58 · La nota restringida solo la lee quien tiene por qué.
create policy quality_audit_notes_select on public.quality_audit_notes
  for select to authenticated
  using (quality_can_read_audit_note(organization_id, audit_id, is_restricted));

-- Escritura: quien administra el dominio.
create policy quality_audit_programs_write on public.quality_audit_programs
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
create policy quality_audits_write on public.quality_audits
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
create policy quality_audit_scope_items_write on public.quality_audit_scope_items
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
create policy quality_audit_criteria_write on public.quality_audit_criteria
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
create policy quality_audit_checklists_write on public.quality_audit_checklists
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
create policy quality_audit_checklist_versions_write on public.quality_audit_checklist_versions
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
create policy quality_audit_checklist_items_write on public.quality_audit_checklist_items
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
create policy quality_audit_checklist_runs_write on public.quality_audit_checklist_runs
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
create policy quality_audit_check_results_write on public.quality_audit_check_results
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
create policy quality_audit_team_members_write on public.quality_audit_team_members
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
create policy quality_audit_agenda_items_write on public.quality_audit_agenda_items
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
create policy quality_audit_meetings_write on public.quality_audit_meetings
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
create policy quality_audit_auditees_write on public.quality_audit_auditees
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
-- §58 · La nota restringida es el ÚNICO objeto del dominio cuya lectura no
-- coincide con la pertenencia. Por eso su escritura NO puede declararse `for
-- all`: una política `for all` también concede SELECT, y las políticas se
-- suman, así que la puerta ancha de escribir volvería a abrir la de leer que
-- la política de lectura acababa de cerrar.
create policy quality_audit_notes_insert on public.quality_audit_notes
  for insert to authenticated
  with check (quality_manages_audits(organization_id));
create policy quality_audit_notes_update on public.quality_audit_notes
  for update to authenticated
  using (quality_manages_audits(organization_id)
         and quality_can_read_audit_note(organization_id, audit_id, is_restricted))
  with check (quality_manages_audits(organization_id));
create policy quality_audit_notes_delete on public.quality_audit_notes
  for delete to authenticated
  using (quality_manages_audits(organization_id)
         and quality_can_read_audit_note(organization_id, audit_id, is_restricted));
create policy quality_audit_samples_write on public.quality_audit_samples
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
create policy quality_audit_evidence_write on public.quality_audit_evidence
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
create policy quality_audit_finding_evidence_write on public.quality_audit_finding_evidence
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));
create policy quality_audit_findings_write on public.quality_audit_findings
  for all to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));

-- Los conflictos se ATIENDEN —aceptar con mitigación o descartar— pero no se
-- fabrican: los detecta la comprobación.
create policy quality_audit_conflict_checks_update on public.quality_audit_conflict_checks
  for update to authenticated
  using (quality_manages_audits(organization_id))
  with check (quality_manages_audits(organization_id));

-- Y aquí NO hay política de escritura para reprogramaciones, revisiones del
-- programa ni informes: los tres son actos formales que solo produce su RPC.
-- Sin esta ausencia, alguien podría escribir una reprogramación inventada o un
-- informe cuyo retrato no corresponde a ninguna auditoría.

-- Privilegios de tabla. Se revoca TODO primero —incluido a `authenticated`—
-- porque el proyecto concede privilegios por defecto sobre cada tabla nueva, y
-- entre ellos va `truncate`, que se salta la RLS entera.
revoke all on table public.quality_audit_programs           from anon, authenticated;
revoke all on table public.quality_audit_program_revisions  from anon, authenticated;
revoke all on table public.quality_audits                   from anon, authenticated;
revoke all on table public.quality_audit_reschedules        from anon, authenticated;
revoke all on table public.quality_audit_scope_items        from anon, authenticated;
revoke all on table public.quality_audit_criteria           from anon, authenticated;
revoke all on table public.quality_audit_checklists         from anon, authenticated;
revoke all on table public.quality_audit_checklist_versions from anon, authenticated;
revoke all on table public.quality_audit_checklist_items    from anon, authenticated;
revoke all on table public.quality_audit_checklist_runs     from anon, authenticated;
revoke all on table public.quality_audit_check_results      from anon, authenticated;
revoke all on table public.quality_audit_team_members       from anon, authenticated;
revoke all on table public.quality_audit_conflict_checks    from anon, authenticated;
revoke all on table public.quality_audit_agenda_items       from anon, authenticated;
revoke all on table public.quality_audit_meetings           from anon, authenticated;
revoke all on table public.quality_audit_auditees           from anon, authenticated;
revoke all on table public.quality_audit_notes              from anon, authenticated;
revoke all on table public.quality_audit_samples            from anon, authenticated;
revoke all on table public.quality_audit_evidence           from anon, authenticated;
revoke all on table public.quality_audit_finding_evidence   from anon, authenticated;
revoke all on table public.quality_audit_findings           from anon, authenticated;
revoke all on table public.quality_audit_reports            from anon, authenticated;

grant select, insert, update, delete on table public.quality_audit_programs           to authenticated;
grant select, insert, update, delete on table public.quality_audits                   to authenticated;
grant select, insert, update, delete on table public.quality_audit_scope_items        to authenticated;
grant select, insert, update, delete on table public.quality_audit_criteria           to authenticated;
grant select, insert, update, delete on table public.quality_audit_checklists         to authenticated;
grant select, insert, update, delete on table public.quality_audit_checklist_versions to authenticated;
grant select, insert, update, delete on table public.quality_audit_checklist_items    to authenticated;
grant select, insert, update, delete on table public.quality_audit_checklist_runs     to authenticated;
grant select, insert, update, delete on table public.quality_audit_check_results      to authenticated;
grant select, insert, update, delete on table public.quality_audit_team_members       to authenticated;
grant select, insert, update, delete on table public.quality_audit_agenda_items       to authenticated;
grant select, insert, update, delete on table public.quality_audit_meetings           to authenticated;
grant select, insert, update, delete on table public.quality_audit_auditees           to authenticated;
grant select, insert, update, delete on table public.quality_audit_notes              to authenticated;
grant select, insert, update, delete on table public.quality_audit_samples            to authenticated;
grant select, insert, update, delete on table public.quality_audit_evidence           to authenticated;
grant select, insert, update, delete on table public.quality_audit_finding_evidence   to authenticated;
grant select, insert, update, delete on table public.quality_audit_findings           to authenticated;

-- Solo lectura: los actos formales se producen por RPC.
grant select on table public.quality_audit_program_revisions to authenticated;
grant select on table public.quality_audit_reschedules       to authenticated;
grant select on table public.quality_audit_reports           to authenticated;
grant select, update on table public.quality_audit_conflict_checks to authenticated;

-- Las vistas se conceden aparte de sus tablas: `security_invoker` decide QUÉ
-- filas devuelve la vista; el privilegio decide si se puede consultarla.
revoke all on table public.v_quality_audit_program_coverage   from anon, authenticated;
revoke all on table public.v_quality_audit_overview           from anon, authenticated;
revoke all on table public.v_quality_audit_recurring_findings from anon, authenticated;

grant select on table public.v_quality_audit_program_coverage   to authenticated;
grant select on table public.v_quality_audit_overview           to authenticated;
grant select on table public.v_quality_audit_recurring_findings to authenticated;


-- ============================================================================
-- 21 · COMENTARIO FINAL
-- ============================================================================

comment on table public.quality_audits is
  'QUALITY-09 · §10 · Una auditoría concreta. `planned_*` conserva lo programado la primera vez y `scheduled_*` lo vigente, para que reprogramar no borre el hecho de haber reprogramado. Cerrarla NO cierra sus casos ni sus acciones (AR-12).';
