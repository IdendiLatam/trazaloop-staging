-- 0116_document_control_revisions_workflow_and_tasks.sql
-- Trazaloop Quality · QUALITY-02 · Control documental: identidad, revisión,
-- workflow, tareas y alertas.
--
-- ============================================================================
-- ALCANCE
-- ============================================================================
-- Corrige el defecto arquitectónico central encontrado en la prueba humana:
--
--     DOCUMENT IDENTITY  ≠  DOCUMENT REVISION  ≠  WORKFLOW STATE
--
-- Hasta hoy los tres conceptos vivían en dos columnas de trazadoc_documents
-- (status y current_version) y la RPC change_trazadoc_document_status (0046,
-- corregida en 0047) INCREMENTABA current_version en CADA transición. Un
-- documento recién creado que se enviara a revisión, se rechazara, se
-- corrigiera y se aprobara terminaba mostrando «v5» sin que su contenido
-- hubiera cambiado nunca de revisión. Eso no es control documental.
--
-- Esta migración NO modifica ninguna migración histórica, NO reescribe
-- change_trazadoc_document_status y NO cambia el comportamiento de ningún
-- documento existente. Todo lo que introduce es ADITIVO y se activa
-- documento a documento mediante trazadoc_documents.revision_model.
--
-- ============================================================================
-- MODELO DE REVISIÓN — LOS DOS MUNDOS CONVIVEN
-- ============================================================================
--   revision_model = 'legacy'      (DEFAULT · todos los documentos actuales)
--       Comportamiento EXACTO de 0043–0057/0082: current_version es un
--       contador técnico de instantáneas que la RPC histórica incrementa en
--       cada transición. No se reinterpreta, no se rehace, no se inventa
--       histórico: lo que ese número significa en documentos ya creados es
--       genuinamente incierto y así se declara (§1, legacy_revision_uncertain).
--
--   revision_model = 'controlled'  (documentos NUEVOS de control documental)
--       current_version es la REVISIÓN DE NEGOCIO y solo cambia cuando una
--       persona decide explícitamente «crear nueva revisión». Las transiciones
--       de workflow NO lo tocan jamás — lo garantiza un trigger (§9.3), no la
--       buena voluntad de la capa de aplicación.
--
-- MDR-08 (identidad + revisión inmutable), D-02 (toda revisión aprobada es
-- inmutable), D-03 (secuencia interna independiente de la etiqueta visible),
-- D-05 (preparación / decisión / publicación diferenciadas).
--
-- ============================================================================
-- APROBACIÓN ≠ VIGENCIA (D-06 · MDR-07 · Parte 13 del encargo)
-- ============================================================================
-- effective_from / effective_to viven en la REVISIÓN y son vigencia de
-- NEGOCIO. La vigencia NO es un estado almacenado: se DERIVA comparando
-- effective_from con la fecha actual (v_trazadoc_document_control, §8). Así no
-- hace falta ninguna agenda ni proceso programado para que un documento
-- aprobado el 21/08 y vigente desde el 01/09 se lea correctamente los dos
-- días — y no existe el riesgo clásico de un estado almacenado que se queda
-- desactualizado porque el cron no corrió.
--
-- ============================================================================
-- TAREAS Y ALERTAS — PRIMITIVA TRANSVERSAL, NO UN MOTOR DOCUMENTAL
-- ============================================================================
-- work_tasks y work_alerts (§5, §6) NO llevan prefijo documental a propósito:
-- AT-02 (Evento, Alerta, Tarea, Acción y Notificación son cosas distintas),
-- AT-10 (existe UNA bandeja transversal de tareas) y MDR-46 (acciones,
-- evidencias, workflows, eventos y alertas son transversales y no se duplican
-- por dominio). QUALITY-02 las estrena con el dominio documental; acciones
-- correctivas, auditorías, riesgos y revisión por la dirección las reutilizan
-- sin crear tablas hermanas. El acoplamiento al origen es por
-- (source_domain, subject_type, subject_id), nunca por FK a una tabla de
-- dominio concreta — AT-04.
--
-- NO se implementa aquí el motor de reglas (AT-05), ni escalados, ni digests,
-- ni notificación externa por correo. La alerta in-app es obligatoria y es lo
-- que esta migración soporta.
--
-- ============================================================================
-- CONVENCIONES DEL REPOSITORIO RESPETADAS
-- ============================================================================
--  · organization_id explícito en toda tabla tenant-owned (MDR-03).
--  · unique (organization_id, id) para habilitar FK COMPUESTAS.
--  · FK compuesta (organization_id, padre_id) -> padre(organization_id, id):
--    una fila hija NUNCA apunta a un padre de otra empresa (MDR-42).
--  · prevent_organization_id_change / force_created_by / set_updated_at /
--    audit_row_change adjuntados como en el resto del proyecto.
--  · RLS deny-by-default y PRIVILEGIOS EXPLÍCITOS por tabla (lección de Q0 /
--    convención de 0111 · 0112 §12). Sin ALTER DEFAULT PRIVILEGES.
--
-- ROLLBACK (documentado; NO ejecutar sin decisión) — ver
-- docs/quality/quality-02/QUALITY_02_ROLLBACK.md.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- §1 · trazadoc_documents — columnas ADITIVAS de identidad documental
--
-- Todas con DEFAULT, todas nullable o con valor seguro: ninguna fila existente
-- cambia de comportamiento al aplicarse esta migración.
-- ----------------------------------------------------------------------------

alter table public.trazadoc_documents
  add column if not exists revision_model text not null default 'legacy',
  add column if not exists disposition text not null default 'active',
  add column if not exists owner_position_id uuid,
  add column if not exists current_revision_id uuid,
  add column if not exists retired_at timestamptz,
  add column if not exists retired_by uuid references public.profiles (id),
  add column if not exists retirement_reason text;

alter table public.trazadoc_documents
  drop constraint if exists trazadoc_documents_revision_model_check;
alter table public.trazadoc_documents
  add constraint trazadoc_documents_revision_model_check
  check (revision_model in ('legacy', 'controlled'));

alter table public.trazadoc_documents
  drop constraint if exists trazadoc_documents_disposition_check;
alter table public.trazadoc_documents
  add constraint trazadoc_documents_disposition_check
  check (disposition in ('active', 'retired', 'archived', 'superseded'));

-- D-17 / MDR-33 · La responsabilidad PERSISTENTE apunta a un CARGO; los actos
-- históricos (quién aprobó) apuntan a la persona real. owner_id (persona) se
-- conserva intacto para los módulos que no tienen cargos; owner_position_id lo
-- complementa donde Quality sí los tiene. FK COMPUESTA: el cargo es de la
-- MISMA empresa que el documento.
alter table public.trazadoc_documents
  drop constraint if exists trazadoc_documents_owner_position_fk;
alter table public.trazadoc_documents
  add constraint trazadoc_documents_owner_position_fk
  foreign key (organization_id, owner_position_id)
  references public.quality_positions (organization_id, id)
  on delete restrict;

create index if not exists trazadoc_documents_owner_position_idx
  on public.trazadoc_documents (owner_position_id) where owner_position_id is not null;
create index if not exists trazadoc_documents_org_module_disposition_idx
  on public.trazadoc_documents (organization_id, module_key, disposition);

comment on column public.trazadoc_documents.revision_model is
  'QUALITY-02 · legacy = contador tecnico historico de instantaneas (0043-0057); controlled = current_version ES la revision de negocio y solo cambia con «crear nueva revision». Un documento NUNCA cambia de modelo despues de creado (trigger §9.3).';

comment on column public.trazadoc_documents.current_version is
  'Depende de revision_model. legacy: numero de instantanea que change_trazadoc_document_status incrementa en cada transicion — NO es una revision documental y su valor historico es incierto. controlled: REVISION DE NEGOCIO, incrementada solo por trazadoc_create_document_revision.';

comment on column public.trazadoc_documents.disposition is
  'QUALITY-02 · Disposicion final CONTROLADA (D-10 · D-23): active | superseded | retired | archived. Un documento con historico formal jamas se destruye; se retira o se archiva conservando revisiones, decisiones y relaciones.';


-- ----------------------------------------------------------------------------
-- §2 · trazadoc_document_revisions — LA REVISIÓN DOCUMENTAL
--
-- MDR-08: identidad estable (trazadoc_documents) + revisión inmutable (esta
-- tabla). La revisión ABIERTA no tiene snapshot: su contenido vivo son las
-- secciones de trazadoc_document_sections, que es donde el motor ya lo tenía y
-- donde el editor ya lo edita — no se duplica nada (MDR-50, «capture once»).
-- Cuando la revisión se APRUEBA formalmente, su contenido se CONGELA en
-- content_snapshot y a partir de ese momento la fila es inmutable (D-02,
-- garantizado por el trigger §9.1, no por la aplicación).
-- ----------------------------------------------------------------------------
create table public.trazadoc_document_revisions (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,
  document_id           uuid not null,
  revision_number       integer not null,
  revision_label        text not null,
  workflow_state        text not null default 'draft',
  route_mode            text not null default 'sequential',
  round                 integer not null default 1,
  change_note           text,
  content_snapshot      jsonb,
  -- Vigencia de NEGOCIO (T-01 · MDR-07). Fechas, no marcas de tiempo de
  -- sistema: la vigencia documental se decide en días, no en microsegundos.
  effective_from        date,
  effective_to          date,
  review_due_at         date,
  -- Actos formales. Cada uno apunta a la PERSONA real que lo ejecutó (MDR-33).
  submitted_at          timestamptz,
  submitted_by          uuid references public.profiles (id),
  approved_at           timestamptz,
  approved_by           uuid references public.profiles (id),
  superseded_at         timestamptz,
  superseded_by_revision_id uuid,
  retired_at            timestamptz,
  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint trazadoc_document_revisions_org_id_uniq unique (organization_id, id),
  constraint trazadoc_document_revisions_uniq unique (document_id, revision_number),
  constraint trazadoc_document_revisions_number_check check (revision_number >= 1),
  constraint trazadoc_document_revisions_round_check check (round >= 1),
  constraint trazadoc_document_revisions_label_not_blank check (length(trim(revision_label)) > 0),
  constraint trazadoc_document_revisions_state_check check (workflow_state in (
    'draft', 'in_review', 'changes_requested', 'pending_approval',
    'approved', 'superseded', 'retired'
  )),
  constraint trazadoc_document_revisions_route_check check (route_mode in ('sequential', 'parallel')),
  constraint trazadoc_document_revisions_period_check
    check (effective_to is null or effective_from is null or effective_to >= effective_from),
  -- Una revisión APROBADA (o ya sustituida) siempre tiene su contenido
  -- congelado y su acto de aprobación registrado. La base lo exige; no depende
  -- de que la aplicación se acuerde. 'retired' queda fuera a propósito: al
  -- retirar un documento también se cierra la revisión que estuviera abierta,
  -- y una revisión que nunca se aprobó no tiene contenido que congelar.
  constraint trazadoc_document_revisions_approved_complete check (
    workflow_state not in ('approved', 'superseded')
    or (content_snapshot is not null and approved_at is not null)
  ),
  constraint trazadoc_document_revisions_document_fk
    foreign key (organization_id, document_id)
    references public.trazadoc_documents (organization_id, id)
    on delete cascade,
  constraint trazadoc_document_revisions_superseded_fk
    foreign key (organization_id, superseded_by_revision_id)
    references public.trazadoc_document_revisions (organization_id, id)
    on delete restrict
);

create index trazadoc_document_revisions_document_idx
  on public.trazadoc_document_revisions (document_id, revision_number desc);
create index trazadoc_document_revisions_org_state_idx
  on public.trazadoc_document_revisions (organization_id, workflow_state);
create index trazadoc_document_revisions_effective_idx
  on public.trazadoc_document_revisions (document_id, effective_from)
  where workflow_state in ('approved', 'superseded');
create index trazadoc_document_revisions_review_due_idx
  on public.trazadoc_document_revisions (organization_id, review_due_at)
  where review_due_at is not null;

-- Un documento tiene como máximo UNA revisión abierta a la vez. Es la regla
-- que impide dos borradores compitiendo por el mismo contenido vivo: las
-- secciones de trazadoc_document_sections son una sola.
create unique index trazadoc_document_revisions_single_open
  on public.trazadoc_document_revisions (document_id)
  where workflow_state in ('draft', 'in_review', 'changes_requested', 'pending_approval');

create trigger t_trazadoc_document_revisions_updated
  before update on public.trazadoc_document_revisions
  for each row execute function public.set_updated_at();
create trigger t_trazadoc_document_revisions_org_immutable
  before update on public.trazadoc_document_revisions
  for each row execute function public.prevent_organization_id_change();
create trigger t_trazadoc_document_revisions_force_created_by
  before insert on public.trazadoc_document_revisions
  for each row execute function public.force_created_by();
create trigger t_audit_trazadoc_document_revisions
  after insert or update or delete on public.trazadoc_document_revisions
  for each row execute function public.audit_row_change();

alter table public.trazadoc_document_revisions enable row level security;

create policy trazadoc_document_revisions_select on public.trazadoc_document_revisions
  for select to authenticated
  using (public.is_org_member(organization_id));

-- INSERT/UPDATE/DELETE DIRECTOS: deliberadamente NO se conceden por politica
-- salvo la edicion de la ficha de vigencia de una revision ABIERTA. Crear una
-- revision, enviarla, decidir sobre ella o retirarla pasa SIEMPRE por las RPC
-- SECURITY DEFINER de §7 — que validan la maquina de estados completa. Una
-- politica de UPDATE amplia permitiria saltarse el workflow con una llamada
-- directa a PostgREST, que es justo lo que el encargo prohibe («no basta
-- ocultar botones»).
create policy trazadoc_document_revisions_update_open on public.trazadoc_document_revisions
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
    and workflow_state in ('draft', 'changes_requested')
  )
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
    and workflow_state in ('draft', 'changes_requested')
  );

comment on table public.trazadoc_document_revisions is
  'QUALITY-02 · REVISION DOCUMENTAL (MDR-08). La revision abierta tiene su contenido vivo en trazadoc_document_sections; al aprobarse se congela en content_snapshot y la fila pasa a ser inmutable (D-02, trigger t_trazadoc_document_revisions_immutable). Aprobacion y vigencia son distintas: effective_from decide la segunda (D-06).';


-- ----------------------------------------------------------------------------
-- §3 · trazadoc_document_workflow_participants — REVISORES Y APROBADORES
--
-- D-18 (multiples revisores/aprobadores) y D-19 (rutas secuenciales y
-- paralelas): por eso es una TABLA y no un par de columnas reviewer_id /
-- approver_id en el documento. Un modelo de dos columnas no podria soportar
-- nunca lo que el baseline ya dio por aprobado.
--
-- MDR-33 · position_id expresa la responsabilidad PERSISTENTE (el cargo);
-- profile_id, la persona concreta que debe actuar y que quedara en el
-- historico. Se resuelve la persona a partir del cargo en el momento del
-- envio, y se conserva: si manana cambia el titular del cargo, la decision ya
-- tomada sigue diciendo quien la tomo.
-- ----------------------------------------------------------------------------
create table public.trazadoc_document_workflow_participants (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  document_id      uuid not null,
  revision_id      uuid not null,
  participant_role text not null,
  step_order       integer not null default 1,
  round            integer not null default 1,
  position_id      uuid,
  profile_id       uuid not null references public.profiles (id) on delete restrict,
  decision         text not null default 'pending',
  decided_at       timestamptz,
  decision_comment text,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint trazadoc_wf_participants_org_id_uniq unique (organization_id, id),
  constraint trazadoc_wf_participants_uniq unique (revision_id, round, participant_role, profile_id),
  constraint trazadoc_wf_participants_role_check
    check (participant_role in ('reviewer', 'approver')),
  constraint trazadoc_wf_participants_decision_check
    check (decision in ('pending', 'approved', 'changes_requested')),
  constraint trazadoc_wf_participants_step_check check (step_order >= 1),
  constraint trazadoc_wf_participants_round_check check (round >= 1),
  -- Una decision tomada siempre dice cuando; una pendiente, nunca.
  constraint trazadoc_wf_participants_decided_consistent check (
    (decision = 'pending' and decided_at is null)
    or (decision <> 'pending' and decided_at is not null)
  ),
  constraint trazadoc_wf_participants_revision_fk
    foreign key (organization_id, revision_id)
    references public.trazadoc_document_revisions (organization_id, id)
    on delete cascade,
  constraint trazadoc_wf_participants_document_fk
    foreign key (organization_id, document_id)
    references public.trazadoc_documents (organization_id, id)
    on delete cascade,
  constraint trazadoc_wf_participants_position_fk
    foreign key (organization_id, position_id)
    references public.quality_positions (organization_id, id)
    on delete restrict
);

create index trazadoc_wf_participants_revision_idx
  on public.trazadoc_document_workflow_participants (revision_id, round, participant_role, step_order);
create index trazadoc_wf_participants_profile_idx
  on public.trazadoc_document_workflow_participants (organization_id, profile_id, decision);

create trigger t_trazadoc_wf_participants_updated
  before update on public.trazadoc_document_workflow_participants
  for each row execute function public.set_updated_at();
create trigger t_trazadoc_wf_participants_org_immutable
  before update on public.trazadoc_document_workflow_participants
  for each row execute function public.prevent_organization_id_change();
create trigger t_trazadoc_wf_participants_force_created_by
  before insert on public.trazadoc_document_workflow_participants
  for each row execute function public.force_created_by();
create trigger t_audit_trazadoc_wf_participants
  after insert or update or delete on public.trazadoc_document_workflow_participants
  for each row execute function public.audit_row_change();

alter table public.trazadoc_document_workflow_participants enable row level security;

create policy trazadoc_wf_participants_select on public.trazadoc_document_workflow_participants
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Sin INSERT/UPDATE/DELETE por politica: los participantes los fija la RPC de
-- envio y las decisiones las escribe la RPC de decision, ambas SECURITY
-- DEFINER. Un revisor no puede «aprobarse» a si mismo con un UPDATE directo.

comment on table public.trazadoc_document_workflow_participants is
  'QUALITY-02 · Revisores y aprobadores de UNA revision y UNA ronda (D-18, D-19). step_order ordena la ruta secuencial; en modo paralelo se ignora. position_id = responsabilidad persistente (cargo); profile_id = persona que decide y queda en el historico (MDR-33).';


-- ----------------------------------------------------------------------------
-- §4 · trazadoc_document_decisions — ACTOS FORMALES, APPEND-ONLY
--
-- D-20 (las decisiones de revision/aprobacion son eventos historicos
-- inmutables) y MDR-49 (las decisiones formales de negocio son append-only o
-- eventos inmutables). Un rechazo no se «deshace» al reenviar: queda.
-- ----------------------------------------------------------------------------
create table public.trazadoc_document_decisions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  document_id      uuid not null,
  revision_id      uuid not null,
  participant_id   uuid,
  round            integer not null default 1,
  decision_type    text not null,
  from_state       text,
  to_state         text,
  reason           text,
  decided_by       uuid references public.profiles (id),
  decided_at       timestamptz not null default now(),

  constraint trazadoc_document_decisions_org_id_uniq unique (organization_id, id),
  constraint trazadoc_document_decisions_type_check check (decision_type in (
    'revision_created', 'submitted', 'review_approved', 'changes_requested',
    'resubmitted', 'approved', 'superseded', 'retired', 'effectivity_set'
  )),
  constraint trazadoc_document_decisions_round_check check (round >= 1),
  -- El motivo es OBLIGATORIO cuando se devuelve un documento: sin razon, el
  -- creador no sabe que corregir y el historico no dice nada. La base lo exige.
  constraint trazadoc_document_decisions_reason_required check (
    decision_type not in ('changes_requested', 'retired')
    or length(trim(coalesce(reason, ''))) > 0
  ),
  constraint trazadoc_document_decisions_revision_fk
    foreign key (organization_id, revision_id)
    references public.trazadoc_document_revisions (organization_id, id)
    on delete cascade,
  constraint trazadoc_document_decisions_document_fk
    foreign key (organization_id, document_id)
    references public.trazadoc_documents (organization_id, id)
    on delete cascade,
  constraint trazadoc_document_decisions_participant_fk
    foreign key (organization_id, participant_id)
    references public.trazadoc_document_workflow_participants (organization_id, id)
    on delete set null
);

create index trazadoc_document_decisions_revision_idx
  on public.trazadoc_document_decisions (revision_id, decided_at desc);
create index trazadoc_document_decisions_document_idx
  on public.trazadoc_document_decisions (document_id, decided_at desc);

alter table public.trazadoc_document_decisions enable row level security;

create policy trazadoc_document_decisions_select on public.trazadoc_document_decisions
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Sin INSERT/UPDATE/DELETE por politica: append-only real escrito por las RPC.

comment on table public.trazadoc_document_decisions is
  'QUALITY-02 · Actos formales del control documental: enviado, revision aceptada, cambios solicitados, aprobado, retirado (D-20, MDR-49). Append-only: sin politicas de UPDATE ni DELETE. El motivo es obligatorio cuando se devuelve o se retira, y lo exige una CHECK, no la aplicacion.';


-- ----------------------------------------------------------------------------
-- §5 · work_tasks — LA BANDEJA TRANSVERSAL DE TAREAS (AT-09 · AT-10 · MDR-27)
--
-- Sin prefijo de dominio a proposito: es la primitiva que reutilizaran
-- acciones correctivas, auditorias, riesgos y revision por la direccion. El
-- vinculo con el objeto de origen es POR CONTRATO —(source_domain,
-- subject_type, subject_id)— y no por FK a una tabla concreta (AT-04): asi un
-- dominio nuevo no obliga a alterar esta tabla ni a crear una hermana.
--
-- Tarea (operativa) NO es Accion de calidad (intervencion formal del sistema
-- de gestion): AT-09. QUALITY-02 solo estrena la Tarea.
--
-- dedupe_key + indice unico parcial implementan AT-07 (idempotencia): reenviar
-- un documento no crea una segunda tarea abierta para el mismo revisor.
-- ----------------------------------------------------------------------------
create table public.work_tasks (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,
  source_domain         text not null,
  task_type             text not null,
  subject_type          text not null,
  subject_id            uuid not null,
  subject_revision_id   uuid,
  title                 text not null,
  description           text,
  assignee_profile_id   uuid not null references public.profiles (id) on delete restrict,
  assignee_position_id  uuid,
  status                text not null default 'open',
  due_at                date,
  dedupe_key            text,
  resolution            text,
  completed_at          timestamptz,
  completed_by          uuid references public.profiles (id),
  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint work_tasks_org_id_uniq unique (organization_id, id),
  constraint work_tasks_title_not_blank check (length(trim(title)) > 0),
  constraint work_tasks_status_check check (status in ('open', 'in_progress', 'done', 'cancelled')),
  constraint work_tasks_source_domain_check check (source_domain in ('document')),
  constraint work_tasks_subject_type_check check (subject_type in ('trazadoc_document')),
  constraint work_tasks_type_check check (task_type in (
    'document_review', 'document_approval', 'document_changes_requested'
  )),
  constraint work_tasks_completed_consistent check (
    (status in ('done', 'cancelled') and completed_at is not null)
    or (status in ('open', 'in_progress') and completed_at is null)
  ),
  constraint work_tasks_position_fk
    foreign key (organization_id, assignee_position_id)
    references public.quality_positions (organization_id, id)
    on delete restrict
);

create index work_tasks_inbox_idx
  on public.work_tasks (organization_id, assignee_profile_id, status, created_at desc);
create index work_tasks_subject_idx
  on public.work_tasks (organization_id, subject_type, subject_id);
create unique index work_tasks_open_dedupe_uniq
  on public.work_tasks (organization_id, dedupe_key)
  where dedupe_key is not null and status in ('open', 'in_progress');

create trigger t_work_tasks_updated
  before update on public.work_tasks
  for each row execute function public.set_updated_at();
create trigger t_work_tasks_org_immutable
  before update on public.work_tasks
  for each row execute function public.prevent_organization_id_change();
create trigger t_work_tasks_force_created_by
  before insert on public.work_tasks
  for each row execute function public.force_created_by();
create trigger t_audit_work_tasks
  after insert or update or delete on public.work_tasks
  for each row execute function public.audit_row_change();

alter table public.work_tasks enable row level security;

-- SELECT: cualquier miembro de la empresa ve las tareas de SU empresa. No se
-- restringe a la persona asignada: un responsable de calidad necesita ver la
-- carga del area, y la tarea no contiene informacion que el miembro no pueda
-- ver por otra via (el documento ya es visible para toda la empresa).
create policy work_tasks_select on public.work_tasks
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Sin INSERT/UPDATE/DELETE por politica: las tareas nacen y se cierran dentro
-- de las RPC del workflow. Nadie se autoasigna una aprobacion.

comment on table public.work_tasks is
  'QUALITY-02 · Bandeja TRANSVERSAL de tareas (AT-10, MDR-27, MDR-46). El vinculo con el objeto de origen es por contrato (source_domain, subject_type, subject_id), no por FK de dominio (AT-04): acciones, auditorias y riesgos la reutilizaran sin tablas hermanas. Tarea operativa != Accion formal de calidad (AT-09).';


-- ----------------------------------------------------------------------------
-- §6 · work_alerts — OBJETO PERSISTENTE DE ATENCION (AT-12 · AT-14)
--
-- Alerta NO es Notificacion (AT-14) y NO es Tarea (AT-02). La tarea dice «te
-- toca hacer esto»; la alerta dice «esto merece tu atencion». Un documento
-- devuelto genera AMBAS para el creador: una tarea (corregir y reenviar) y una
-- alerta (te lo devolvieron, y este es el motivo).
--
-- El ciclo de vida sigue el del baseline (17.7) recortado a lo que este sprint
-- necesita de verdad: new -> seen -> acknowledged -> resolved | dismissed. Sin
-- escalados, sin digests, sin correlacion: eso es QUALITY Automation, no esto.
-- ----------------------------------------------------------------------------
create table public.work_alerts (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,
  source_domain         text not null,
  alert_type            text not null,
  severity              text not null default 'info',
  subject_type          text not null,
  subject_id            uuid not null,
  subject_revision_id   uuid,
  title                 text not null,
  message               text,
  recipient_profile_id  uuid not null references public.profiles (id) on delete restrict,
  status                text not null default 'new',
  dedupe_key            text,
  read_at               timestamptz,
  resolved_at           timestamptz,
  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint work_alerts_org_id_uniq unique (organization_id, id),
  constraint work_alerts_title_not_blank check (length(trim(title)) > 0),
  constraint work_alerts_status_check
    check (status in ('new', 'seen', 'acknowledged', 'resolved', 'dismissed')),
  constraint work_alerts_severity_check check (severity in ('info', 'warning', 'critical')),
  constraint work_alerts_source_domain_check check (source_domain in ('document')),
  constraint work_alerts_subject_type_check check (subject_type in ('trazadoc_document')),
  constraint work_alerts_type_check check (alert_type in (
    'document_review_requested', 'document_approval_requested',
    'document_changes_requested', 'document_approved', 'document_retired'
  ))
);

create index work_alerts_inbox_idx
  on public.work_alerts (organization_id, recipient_profile_id, status, created_at desc);
create index work_alerts_subject_idx
  on public.work_alerts (organization_id, subject_type, subject_id);
create unique index work_alerts_open_dedupe_uniq
  on public.work_alerts (organization_id, dedupe_key)
  where dedupe_key is not null and status in ('new', 'seen', 'acknowledged');

create trigger t_work_alerts_updated
  before update on public.work_alerts
  for each row execute function public.set_updated_at();
create trigger t_work_alerts_org_immutable
  before update on public.work_alerts
  for each row execute function public.prevent_organization_id_change();
create trigger t_work_alerts_force_created_by
  before insert on public.work_alerts
  for each row execute function public.force_created_by();
create trigger t_audit_work_alerts
  after insert or update or delete on public.work_alerts
  for each row execute function public.audit_row_change();

alter table public.work_alerts enable row level security;

create policy work_alerts_select on public.work_alerts
  for select to authenticated
  using (public.is_org_member(organization_id));

-- UPDATE acotado: la unica escritura directa que tiene sentido es que el
-- DESTINATARIO marque su propia alerta como vista/atendida/descartada. Ni
-- cambia de dueno, ni de asunto, ni de tipo — lo garantiza el trigger §9.5.
create policy work_alerts_update_own on public.work_alerts
  for update to authenticated
  using (public.is_org_member(organization_id) and recipient_profile_id = auth.uid())
  with check (public.is_org_member(organization_id) and recipient_profile_id = auth.uid());

comment on table public.work_alerts is
  'QUALITY-02 · Objeto PERSISTENTE de atencion (AT-12). Alerta != Notificacion (AT-14) y != Tarea (AT-02). Solo el destinatario puede marcarla, y solo puede cambiar su estado (trigger t_work_alerts_recipient_scope).';


-- ----------------------------------------------------------------------------
-- §7 · RPCs DEL CONTROL DOCUMENTAL
--
-- Todas SECURITY DEFINER, todas con la sesion REAL (auth.uid()), ninguna con
-- service_role. Son la UNICA via de escritura del workflow: las tablas de §2,
-- §3, §4, §5 y §6 no conceden INSERT ni UPDATE de estado por politica, de modo
-- que una llamada directa a PostgREST no puede saltarse la maquina de estados
-- («no basta ocultar botones», Parte 18 del encargo).
-- ----------------------------------------------------------------------------

-- Contenido VIVO del documento, con la misma forma que el snapshot historico
-- de 0046/0047 mas la identidad de la revision. Interna: nadie la llama desde
-- fuera.
create or replace function public.trazadoc_build_document_snapshot(p_document_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'document', jsonb_build_object(
      'title', d.title, 'code', d.code, 'description', d.description,
      'category_code', d.category_code, 'module_key', d.module_key
    ),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'section_key', s.section_key, 'title', s.title, 'content', s.content,
        'sort_order', s.sort_order, 'is_required', s.is_required
      ) order by s.sort_order)
      from trazadoc_document_sections s where s.document_id = d.id
    ), '[]'::jsonb)
  )
  from trazadoc_documents d where d.id = p_document_id;
$$;
revoke all on function public.trazadoc_build_document_snapshot(uuid) from public, anon, authenticated;


-- Rol de empresa del usuario actual en una empresa dada, o null.
create or replace function public.trazadoc_current_org_role(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role_code from memberships m
   where m.organization_id = p_organization_id
     and m.user_id = auth.uid()
     and m.status = 'active';
$$;
revoke all on function public.trazadoc_current_org_role(uuid) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- §7.1 · Crear una revision (la primera del documento, o una NUEVA)
--
-- Es la UNICA operacion que mueve el numero de revision. Una transicion de
-- workflow jamas lo hace — lo impide el trigger §9.3, que exige la marca de
-- transaccion que solo esta funcion pone.
--
-- El contenido de la revision nueva se DERIVA de la anterior sin copiarlo: las
-- secciones vivas (trazadoc_document_sections) ya son, exactamente, el
-- contenido congelado de la revision aprobada — la RLS de 0047 y el trigger de
-- 0083 impiden editarlas mientras el documento esta aprobado, asi que no
-- pueden haber derivado. Duplicarlas ademas seria crear una segunda copia que
-- mantener (MDR-50). La revision anterior conserva su propio snapshot y queda
-- historica e inmutable.
-- ----------------------------------------------------------------------------
create or replace function public.trazadoc_create_document_revision(
  p_document_id uuid,
  p_change_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_doc      record;
  v_role     text;
  v_previous record;
  v_number   integer;
  v_id       uuid;
begin
  if v_user is null then raise exception 'No autenticado'; end if;

  select * into v_doc from trazadoc_documents where id = p_document_id for update;
  if v_doc.id is null then raise exception 'El documento no existe'; end if;
  if not is_org_member(v_doc.organization_id) then
    raise exception 'No perteneces a la empresa de este documento';
  end if;

  v_role := trazadoc_current_org_role(v_doc.organization_id);
  if v_role not in ('admin', 'quality', 'consultant') then
    raise exception 'Tu rol no permite crear revisiones de este documento';
  end if;

  if v_doc.revision_model <> 'controlled' then
    raise exception 'Este documento usa el modelo de versionado anterior y no admite revisiones controladas';
  end if;
  if v_doc.disposition <> 'active' then
    raise exception 'Un documento retirado o archivado no admite revisiones nuevas';
  end if;

  if exists (
    select 1 from trazadoc_document_revisions r
     where r.document_id = p_document_id
       and r.workflow_state in ('draft', 'in_review', 'changes_requested', 'pending_approval')
  ) then
    raise exception 'Este documento ya tiene una revisión en curso. Termínala antes de abrir otra.';
  end if;

  select * into v_previous from trazadoc_document_revisions r
   where r.document_id = p_document_id
   order by r.revision_number desc limit 1;

  v_number := coalesce(v_previous.revision_number, 0) + 1;

  -- Crear la SEGUNDA revision (o posterior) solo tiene sentido sobre una
  -- anterior ya aprobada: es lo que distingue «corregir el borrador» de
  -- «emitir una revision nueva del documento vigente».
  if v_previous.id is not null and v_previous.workflow_state not in ('approved', 'superseded') then
    raise exception 'La revisión anterior no está aprobada; no procede abrir una revisión nueva';
  end if;
  if v_number > 1 and v_role not in ('admin', 'quality') then
    raise exception 'Solo la administración o el área de calidad pueden abrir una revisión nueva de un documento aprobado';
  end if;

  insert into trazadoc_document_revisions
    (organization_id, document_id, revision_number, revision_label, workflow_state,
     round, change_note, created_by)
  values
    (v_doc.organization_id, p_document_id, v_number, 'Revisión ' || v_number, 'draft',
     1, nullif(trim(coalesce(p_change_note, '')), ''), v_user)
  returning id into v_id;

  -- La MARCA que autoriza el cambio de current_version. Es local a la
  -- transaccion: fuera de esta funcion nadie la tiene, y por eso ninguna otra
  -- via —incluida la RPC historica change_trazadoc_document_status— puede
  -- mover la revision de un documento controlado.
  perform set_config('trazaloop.revision_bump', 'on', true);

  update trazadoc_documents
     set current_version = v_number,
         current_revision_id = v_id,
         status = 'draft'
   where id = p_document_id;

  perform set_config('trazaloop.revision_bump', 'off', true);

  insert into trazadoc_document_decisions
    (organization_id, document_id, revision_id, round, decision_type, from_state, to_state, reason, decided_by)
  values
    (v_doc.organization_id, p_document_id, v_id, 1, 'revision_created', null, 'draft',
     nullif(trim(coalesce(p_change_note, '')), ''), v_user);

  return v_id;
end;
$$;

revoke all on function public.trazadoc_create_document_revision(uuid, text) from public, anon;
grant execute on function public.trazadoc_create_document_revision(uuid, text) to authenticated;

comment on function public.trazadoc_create_document_revision(uuid, text) is
  'QUALITY-02 · UNICA operacion que incrementa la revision documental. Enviar a revision, rechazar, corregir, reenviar y aprobar NO la mueven (trigger t_trazadoc_documents_revision_guard).';


-- ----------------------------------------------------------------------------
-- §7.2 · Activar una etapa del workflow: abrir tarea y alerta a quien toca
--
-- D-19 · route_mode decide a quien le toca AHORA:
--   · sequential → solo los participantes del MENOR step_order pendiente;
--   · parallel   → todos los pendientes de la ronda a la vez.
--
-- AT-07 (idempotencia): dedupe_key + los indices unicos parciales de §5/§6
-- hacen que activar dos veces la misma etapa no genere tareas duplicadas.
-- ----------------------------------------------------------------------------
create or replace function public.trazadoc_activate_workflow_stage(
  p_revision_id uuid,
  p_role text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rev    record;
  v_doc    record;
  v_step   integer;
  v_part   record;
  v_count  integer := 0;
  v_task_type  text;
  v_alert_type text;
  v_verb   text;
begin
  select * into v_rev from trazadoc_document_revisions where id = p_revision_id;
  if v_rev.id is null then raise exception 'La revisión no existe'; end if;
  select * into v_doc from trazadoc_documents where id = v_rev.document_id;

  if p_role = 'reviewer' then
    v_task_type := 'document_review'; v_alert_type := 'document_review_requested'; v_verb := 'revisar';
  else
    v_task_type := 'document_approval'; v_alert_type := 'document_approval_requested'; v_verb := 'aprobar';
  end if;

  if v_rev.route_mode = 'sequential' then
    select min(p.step_order) into v_step
      from trazadoc_document_workflow_participants p
     where p.revision_id = p_revision_id and p.round = v_rev.round
       and p.participant_role = p_role and p.decision = 'pending';
  else
    v_step := null;  -- paralelo: no se filtra por paso
  end if;

  for v_part in
    select p.* from trazadoc_document_workflow_participants p
     where p.revision_id = p_revision_id and p.round = v_rev.round
       and p.participant_role = p_role and p.decision = 'pending'
       and (v_step is null or p.step_order = v_step)
  loop
    insert into work_tasks
      (organization_id, source_domain, task_type, subject_type, subject_id, subject_revision_id,
       title, description, assignee_profile_id, assignee_position_id, status, dedupe_key, created_by)
    values
      (v_doc.organization_id, 'document', v_task_type, 'trazadoc_document', v_doc.id, p_revision_id,
       'Documento por ' || v_verb || ': ' || v_doc.title,
       coalesce(v_doc.code || ' · ', '') || v_rev.revision_label,
       v_part.profile_id, v_part.position_id, 'open',
       'wf:' || p_revision_id::text || ':' || v_rev.round::text || ':' || v_part.id::text,
       v_rev.submitted_by)
    on conflict do nothing;

    insert into work_alerts
      (organization_id, source_domain, alert_type, severity, subject_type, subject_id,
       subject_revision_id, title, message, recipient_profile_id, status, dedupe_key, created_by)
    values
      (v_doc.organization_id, 'document', v_alert_type, 'info', 'trazadoc_document', v_doc.id,
       p_revision_id,
       'Te pidieron ' || v_verb || ' un documento',
       v_doc.title || ' · ' || v_rev.revision_label,
       v_part.profile_id, 'new',
       'al:' || v_alert_type || ':' || p_revision_id::text || ':' || v_rev.round::text || ':' || v_part.id::text,
       v_rev.submitted_by)
    on conflict do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
revoke all on function public.trazadoc_activate_workflow_stage(uuid, text) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- §7.3 · Enviar la revision a revision/aprobacion
--
-- p_reviewers y p_approvers son arreglos JSON de
--   { "profile_id": uuid | null, "position_id": uuid | null, "step_order": int }
-- La responsabilidad se declara preferentemente por CARGO (D-17); la persona
-- concreta se resuelve en este momento a partir del titular vigente del cargo
-- y queda GUARDADA (MDR-33): si manana cambia el titular, la decision ya
-- tomada sigue diciendo quien la tomo.
--
-- Al menos UN aprobador es obligatorio — un documento sin aprobador no es un
-- documento controlado. Los revisores son opcionales: hay sistemas de gestion
-- pequenos donde revision y aprobacion son el mismo acto, y obligar a inventar
-- un revisor de adorno seria peor que no tenerlo.
-- ----------------------------------------------------------------------------
create or replace function public.trazadoc_submit_document_revision(
  p_revision_id uuid,
  p_reviewers jsonb default '[]'::jsonb,
  p_approvers jsonb default '[]'::jsonb,
  p_route_mode text default 'sequential',
  p_effective_from date default null,
  p_review_due_at date default null,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user       uuid := auth.uid();
  v_rev        record;
  v_doc        record;
  v_role       text;
  v_round      integer;
  v_item       jsonb;
  v_profile    uuid;
  v_position   uuid;
  v_step       integer;
  v_next_state text;
  v_approvers  integer := 0;
  v_reviewers  integer := 0;
begin
  if v_user is null then raise exception 'No autenticado'; end if;
  if p_route_mode not in ('sequential', 'parallel') then
    raise exception 'Modo de ruta no válido';
  end if;

  select * into v_rev from trazadoc_document_revisions where id = p_revision_id for update;
  if v_rev.id is null then raise exception 'La revisión no existe'; end if;
  select * into v_doc from trazadoc_documents where id = v_rev.document_id for update;

  if not is_org_member(v_doc.organization_id) then
    raise exception 'No perteneces a la empresa de este documento';
  end if;
  v_role := trazadoc_current_org_role(v_doc.organization_id);
  if v_role not in ('admin', 'quality', 'consultant') then
    raise exception 'Tu rol no permite enviar documentos a revisión';
  end if;
  if v_rev.workflow_state not in ('draft', 'changes_requested') then
    raise exception 'Esta revisión no está en un estado que permita enviarla';
  end if;
  if v_doc.disposition <> 'active' then
    raise exception 'Un documento retirado o archivado no puede enviarse a revisión';
  end if;

  -- Reenviar tras una devolucion abre una RONDA nueva: las decisiones de la
  -- ronda anterior NO se borran ni se reescriben (D-20).
  v_round := case when v_rev.workflow_state = 'changes_requested' then v_rev.round + 1 else v_rev.round end;

  for v_item in select * from jsonb_array_elements(coalesce(p_reviewers, '[]'::jsonb)) loop
    v_position := nullif(v_item->>'position_id', '')::uuid;
    v_profile  := nullif(v_item->>'profile_id', '')::uuid;
    v_step     := coalesce((v_item->>'step_order')::integer, 1);
    if v_profile is null and v_position is not null then
      select a.profile_id into v_profile from quality_position_assignments a
       where a.organization_id = v_doc.organization_id and a.position_id = v_position
         and a.assignment_type = 'holder' and a.effective_to is null
       limit 1;
    end if;
    if v_profile is null then
      raise exception 'Cada revisor debe ser una persona, o un cargo con titular vigente';
    end if;
    if not exists (
      select 1 from memberships m where m.organization_id = v_doc.organization_id
        and m.user_id = v_profile and m.status = 'active'
    ) then
      raise exception 'El revisor elegido no es miembro activo de esta empresa';
    end if;
    insert into trazadoc_document_workflow_participants
      (organization_id, document_id, revision_id, participant_role, step_order, round,
       position_id, profile_id, decision, created_by)
    values
      (v_doc.organization_id, v_doc.id, p_revision_id, 'reviewer', v_step, v_round,
       v_position, v_profile, 'pending', v_user)
    on conflict do nothing;
    v_reviewers := v_reviewers + 1;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_approvers, '[]'::jsonb)) loop
    v_position := nullif(v_item->>'position_id', '')::uuid;
    v_profile  := nullif(v_item->>'profile_id', '')::uuid;
    v_step     := coalesce((v_item->>'step_order')::integer, 1);
    if v_profile is null and v_position is not null then
      select a.profile_id into v_profile from quality_position_assignments a
       where a.organization_id = v_doc.organization_id and a.position_id = v_position
         and a.assignment_type = 'holder' and a.effective_to is null
       limit 1;
    end if;
    if v_profile is null then
      raise exception 'Cada aprobador debe ser una persona, o un cargo con titular vigente';
    end if;
    if not exists (
      select 1 from memberships m where m.organization_id = v_doc.organization_id
        and m.user_id = v_profile and m.status = 'active'
    ) then
      raise exception 'El aprobador elegido no es miembro activo de esta empresa';
    end if;
    insert into trazadoc_document_workflow_participants
      (organization_id, document_id, revision_id, participant_role, step_order, round,
       position_id, profile_id, decision, created_by)
    values
      (v_doc.organization_id, v_doc.id, p_revision_id, 'approver', v_step, v_round,
       v_position, v_profile, 'pending', v_user)
    on conflict do nothing;
    v_approvers := v_approvers + 1;
  end loop;

  if v_approvers = 0 then
    raise exception 'Indica al menos una persona o cargo que apruebe el documento';
  end if;

  v_next_state := case when v_reviewers > 0 then 'in_review' else 'pending_approval' end;

  update trazadoc_document_revisions
     set workflow_state = v_next_state,
         route_mode = p_route_mode,
         round = v_round,
         submitted_at = now(),
         submitted_by = v_user,
         effective_from = coalesce(p_effective_from, effective_from),
         review_due_at = coalesce(p_review_due_at, review_due_at)
   where id = p_revision_id;

  -- El documento pasa a «en revisión» a ojos del motor: es lo que impide
  -- seguir editando su contenido mientras alguien decide (§9.4).
  update trazadoc_documents set status = 'in_review' where id = v_doc.id;

  -- La tarea de «corregir» del creador, si la habia, queda atendida al
  -- reenviar: no se deja pendiente algo que ya se hizo.
  update work_tasks
     set status = 'done', completed_at = now(), completed_by = v_user,
         resolution = 'Documento corregido y reenviado'
   where organization_id = v_doc.organization_id
     and subject_type = 'trazadoc_document' and subject_id = v_doc.id
     and task_type = 'document_changes_requested' and status in ('open', 'in_progress');

  insert into trazadoc_document_decisions
    (organization_id, document_id, revision_id, round, decision_type, from_state, to_state, reason, decided_by)
  values
    (v_doc.organization_id, v_doc.id, p_revision_id, v_round,
     case when v_rev.workflow_state = 'changes_requested' then 'resubmitted' else 'submitted' end,
     v_rev.workflow_state, v_next_state, nullif(trim(coalesce(p_note, '')), ''), v_user);

  perform trazadoc_activate_workflow_stage(
    p_revision_id, case when v_reviewers > 0 then 'reviewer' else 'approver' end
  );

  return v_next_state;
end;
$$;

revoke all on function public.trazadoc_submit_document_revision(uuid, jsonb, jsonb, text, date, date, text) from public, anon;
grant execute on function public.trazadoc_submit_document_revision(uuid, jsonb, jsonb, text, date, date, text) to authenticated;


-- ----------------------------------------------------------------------------
-- §7.4 · Decidir sobre una revision: aceptar o devolver con motivo
--
-- Solo puede decidir QUIEN tiene la decision asignada, en la ronda en curso y
-- —en ruta secuencial— en el paso que toca. Ni el administrador puede decidir
-- en nombre de otro: eso destruiria el valor de la firma. La comprobacion vive
-- aqui, en la base, no en un boton oculto (Parte 18 del encargo).
--
-- Devolver EXIGE motivo (CHECK de §4 mas este mensaje claro). El rechazo NO
-- borra nada: abre una ronda nueva al reenviar y la decision anterior queda
-- para siempre (D-20).
-- ----------------------------------------------------------------------------
create or replace function public.trazadoc_record_document_decision(
  p_revision_id uuid,
  p_decision text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_rev       record;
  v_doc       record;
  v_stage     text;
  v_part      record;
  v_min_step  integer;
  v_pending   integer;
  v_reason    text := nullif(trim(coalesce(p_reason, '')), '');
  v_snapshot  jsonb;
  v_from      date;
  v_prev      record;
  v_state     text;
begin
  if v_user is null then raise exception 'No autenticado'; end if;
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'Decisión no válida';
  end if;
  if p_decision = 'changes_requested' and v_reason is null then
    raise exception 'Escribe el motivo por el que devuelves el documento';
  end if;

  select * into v_rev from trazadoc_document_revisions where id = p_revision_id for update;
  if v_rev.id is null then raise exception 'La revisión no existe'; end if;
  select * into v_doc from trazadoc_documents where id = v_rev.document_id for update;
  if not is_org_member(v_doc.organization_id) then
    raise exception 'No perteneces a la empresa de este documento';
  end if;

  v_stage := case v_rev.workflow_state
               when 'in_review' then 'reviewer'
               when 'pending_approval' then 'approver'
               else null end;
  if v_stage is null then
    raise exception 'Esta revisión no está esperando ninguna decisión';
  end if;

  if v_rev.route_mode = 'sequential' then
    select min(p.step_order) into v_min_step
      from trazadoc_document_workflow_participants p
     where p.revision_id = p_revision_id and p.round = v_rev.round
       and p.participant_role = v_stage and p.decision = 'pending';
  end if;

  select * into v_part from trazadoc_document_workflow_participants p
   where p.revision_id = p_revision_id and p.round = v_rev.round
     and p.participant_role = v_stage and p.decision = 'pending'
     and p.profile_id = v_user
     and (v_rev.route_mode = 'parallel' or p.step_order = v_min_step)
   limit 1;

  if v_part.id is null then
    raise exception 'No tienes una decisión pendiente sobre este documento en este momento';
  end if;

  update trazadoc_document_workflow_participants
     set decision = p_decision, decided_at = now(), decision_comment = v_reason
   where id = v_part.id;

  update work_tasks
     set status = 'done', completed_at = now(), completed_by = v_user,
         resolution = case when p_decision = 'approved' then 'Aceptado' else 'Devuelto con observaciones' end
   where organization_id = v_doc.organization_id
     and subject_revision_id = p_revision_id
     and assignee_profile_id = v_user
     and status in ('open', 'in_progress');

  insert into trazadoc_document_decisions
    (organization_id, document_id, revision_id, participant_id, round, decision_type,
     from_state, to_state, reason, decided_by)
  values
    (v_doc.organization_id, v_doc.id, p_revision_id, v_part.id, v_rev.round,
     case when p_decision = 'changes_requested' then 'changes_requested'
          when v_stage = 'reviewer' then 'review_approved'
          else 'approved' end,
     v_rev.workflow_state,
     case when p_decision = 'changes_requested' then 'changes_requested' else v_rev.workflow_state end,
     v_reason, v_user);

  -- ---------------------------------------------------------------- devolver
  if p_decision = 'changes_requested' then
    update trazadoc_document_revisions
       set workflow_state = 'changes_requested'
     where id = p_revision_id;
    update trazadoc_documents set status = 'draft' where id = v_doc.id;

    -- Las decisiones que quedaban pendientes en esta ronda dejan de tener
    -- sentido: el documento vuelve a manos del creador.
    update work_tasks
       set status = 'cancelled', completed_at = now(), completed_by = v_user,
           resolution = 'El documento fue devuelto a su autor'
     where organization_id = v_doc.organization_id
       and subject_revision_id = p_revision_id and status in ('open', 'in_progress');

    insert into work_tasks
      (organization_id, source_domain, task_type, subject_type, subject_id, subject_revision_id,
       title, description, assignee_profile_id, status, dedupe_key, created_by)
    values
      (v_doc.organization_id, 'document', 'document_changes_requested', 'trazadoc_document',
       v_doc.id, p_revision_id,
       'Corregir y reenviar: ' || v_doc.title,
       v_reason, coalesce(v_rev.created_by, v_doc.created_by), 'open',
       'wf:cr:' || p_revision_id::text || ':' || v_rev.round::text, v_user)
    on conflict do nothing;

    insert into work_alerts
      (organization_id, source_domain, alert_type, severity, subject_type, subject_id,
       subject_revision_id, title, message, recipient_profile_id, status, dedupe_key, created_by)
    values
      (v_doc.organization_id, 'document', 'document_changes_requested', 'warning',
       'trazadoc_document', v_doc.id, p_revision_id,
       'Te devolvieron un documento: ' || v_doc.title,
       v_reason, coalesce(v_rev.created_by, v_doc.created_by), 'new',
       'al:cr:' || p_revision_id::text || ':' || v_rev.round::text, v_user)
    on conflict do nothing;

    return 'changes_requested';
  end if;

  -- ---------------------------------------------------------------- aceptar
  select count(*) into v_pending
    from trazadoc_document_workflow_participants p
   where p.revision_id = p_revision_id and p.round = v_rev.round
     and p.participant_role = v_stage and p.decision = 'pending';

  if v_pending > 0 then
    -- Quedan decisiones de esta etapa: en ruta secuencial se abre el paso
    -- siguiente; en paralelo los demas ya tenian su tarea abierta.
    perform trazadoc_activate_workflow_stage(p_revision_id, v_stage);
    return v_rev.workflow_state;
  end if;

  if v_stage = 'reviewer' then
    update trazadoc_document_revisions set workflow_state = 'pending_approval' where id = p_revision_id;
    perform trazadoc_activate_workflow_stage(p_revision_id, 'approver');
    return 'pending_approval';
  end if;

  -- Todos los aprobadores aceptaron: la revision queda APROBADA e INMUTABLE.
  v_snapshot := trazadoc_build_document_snapshot(v_doc.id);
  v_from := coalesce(v_rev.effective_from, current_date);

  update trazadoc_document_revisions
     set workflow_state = 'approved',
         approved_at = now(),
         approved_by = v_user,
         content_snapshot = v_snapshot,
         effective_from = v_from
   where id = p_revision_id;

  -- D-06 · La revision anterior queda SUSTITUIDA y su vigencia se cierra el
  -- dia anterior al comienzo de la nueva (nunca antes de su propio inicio).
  for v_prev in
    select * from trazadoc_document_revisions r
     where r.document_id = v_doc.id and r.id <> p_revision_id
       and r.workflow_state = 'approved'
  loop
    update trazadoc_document_revisions
       set workflow_state = 'superseded',
           superseded_at = now(),
           superseded_by_revision_id = p_revision_id,
           effective_to = case
             when effective_to is not null then effective_to
             when effective_from is not null then greatest(v_from - 1, effective_from)
             else v_from - 1 end
     where id = v_prev.id;

    insert into trazadoc_document_decisions
      (organization_id, document_id, revision_id, round, decision_type, from_state, to_state, reason, decided_by)
    values
      (v_doc.organization_id, v_doc.id, v_prev.id, v_prev.round, 'superseded', 'approved', 'superseded',
       'Sustituida por la revisión ' || v_rev.revision_number, v_user);
  end loop;

  update trazadoc_documents
     set status = 'approved', approved_by = v_user, approved_at = now()
   where id = v_doc.id;

  -- Notificar al propietario y al autor (si son la misma persona, el indice
  -- unico de dedupe evita la alerta repetida).
  insert into work_alerts
    (organization_id, source_domain, alert_type, severity, subject_type, subject_id,
     subject_revision_id, title, message, recipient_profile_id, status, dedupe_key, created_by)
  select
    v_doc.organization_id, 'document', 'document_approved', 'info', 'trazadoc_document', v_doc.id,
    p_revision_id,
    'Documento aprobado: ' || v_doc.title,
    v_rev.revision_label || ' · vigente desde ' || to_char(v_from, 'DD/MM/YYYY'),
    r.profile_id, 'new',
    'al:ap:' || p_revision_id::text || ':' || r.profile_id::text, v_user
  from (
    select distinct pid as profile_id
      from unnest(array[v_doc.owner_id, v_rev.created_by, v_doc.created_by]) as pid
     where pid is not null
  ) r
  where exists (
    select 1 from memberships m
     where m.organization_id = v_doc.organization_id and m.user_id = r.profile_id and m.status = 'active'
  )
  on conflict do nothing;

  return 'approved';
end;
$$;

revoke all on function public.trazadoc_record_document_decision(uuid, text, text) from public, anon;
grant execute on function public.trazadoc_record_document_decision(uuid, text, text) to authenticated;

comment on function public.trazadoc_record_document_decision(uuid, text, text) is
  'QUALITY-02 · Registra la decision de UN revisor o aprobador. Solo actua quien la tiene asignada. Devolver exige motivo. Ninguna de estas transiciones toca la revision documental (trigger t_trazadoc_documents_revision_guard).';


-- ----------------------------------------------------------------------------
-- §7.5 · RETIRAR un documento (D-10 · D-23 · Parte 12, caso B)
--
-- Un documento con historico formal NO se destruye: se retira. Conserva
-- identidad, revisiones, aprobaciones, devoluciones, decisiones y relaciones.
-- Sigue consultable y queda marcado como no vigente.
-- ----------------------------------------------------------------------------
create or replace function public.trazadoc_retire_document(
  p_document_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_doc    record;
  v_role   text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_open   record;
begin
  if v_user is null then raise exception 'No autenticado'; end if;
  if v_reason is null then raise exception 'Escribe el motivo del retiro'; end if;

  select * into v_doc from trazadoc_documents where id = p_document_id for update;
  if v_doc.id is null then raise exception 'El documento no existe'; end if;
  if not is_org_member(v_doc.organization_id) then
    raise exception 'No perteneces a la empresa de este documento';
  end if;
  v_role := trazadoc_current_org_role(v_doc.organization_id);
  if v_role not in ('admin', 'quality') then
    raise exception 'Solo la administración o el área de calidad pueden retirar un documento';
  end if;
  if v_doc.disposition <> 'active' then
    raise exception 'Este documento ya está retirado o archivado';
  end if;

  update trazadoc_documents
     set disposition = 'retired',
         status = 'obsolete',
         retired_at = now(),
         retired_by = v_user,
         retirement_reason = v_reason,
         obsolete_at = now()
   where id = p_document_id;

  -- La revision que estuviera en curso se cierra: no queda un borrador
  -- huerfano que alguien pueda reenviar a un documento retirado.
  for v_open in
    select * from trazadoc_document_revisions r
     where r.document_id = p_document_id
       and r.workflow_state in ('draft', 'in_review', 'changes_requested', 'pending_approval')
  loop
    update trazadoc_document_revisions
       set workflow_state = 'retired', retired_at = now()
     where id = v_open.id;
    insert into trazadoc_document_decisions
      (organization_id, document_id, revision_id, round, decision_type, from_state, to_state, reason, decided_by)
    values
      (v_doc.organization_id, p_document_id, v_open.id, v_open.round, 'retired',
       v_open.workflow_state, 'retired', v_reason, v_user);
  end loop;

  -- La revision vigente deja de estarlo hoy, pero NO se borra ni cambia su
  -- contenido: sigue siendo la respuesta correcta a «que regia el mes pasado».
  update trazadoc_document_revisions
     set retired_at = now(),
         effective_to = case
           when effective_to is not null then effective_to
           when effective_from is not null then greatest(current_date, effective_from)
           else current_date end
   where document_id = p_document_id and workflow_state = 'approved';

  insert into trazadoc_document_decisions
    (organization_id, document_id, revision_id, round, decision_type, from_state, to_state, reason, decided_by)
  select v_doc.organization_id, p_document_id, r.id, r.round, 'retired', 'approved', 'approved', v_reason, v_user
    from trazadoc_document_revisions r
   where r.document_id = p_document_id and r.workflow_state = 'approved';

  update work_tasks
     set status = 'cancelled', completed_at = now(), completed_by = v_user,
         resolution = 'El documento fue retirado'
   where organization_id = v_doc.organization_id
     and subject_type = 'trazadoc_document' and subject_id = p_document_id
     and status in ('open', 'in_progress');

  insert into work_alerts
    (organization_id, source_domain, alert_type, severity, subject_type, subject_id,
     title, message, recipient_profile_id, status, dedupe_key, created_by)
  select
    v_doc.organization_id, 'document', 'document_retired', 'warning', 'trazadoc_document', p_document_id,
    'Documento retirado: ' || v_doc.title, v_reason, r.profile_id, 'new',
    'al:rt:' || p_document_id::text || ':' || r.profile_id::text, v_user
  from (
    select distinct pid as profile_id
      from unnest(array[v_doc.owner_id, v_doc.created_by]) as pid
     where pid is not null and pid <> v_user
  ) r
  where exists (
    select 1 from memberships m
     where m.organization_id = v_doc.organization_id and m.user_id = r.profile_id and m.status = 'active'
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.trazadoc_retire_document(uuid, text) from public, anon;
grant execute on function public.trazadoc_retire_document(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- §7.6 · ELIMINAR un borrador sin historico (D-10 · Parte 12, caso A)
--
-- La destruccion fisica solo procede cuando NO hay nada que conservar. La
-- funcion no «intenta y ve que pasa»: comprueba una por una las razones por
-- las que un documento debe sobrevivir, y cuando alguna se cumple devuelve un
-- mensaje que explica POR QUE no puede eliminarse — que es lo que el encargo
-- pide que la interfaz sepa decir.
--
-- Un rechazo YA ES historico formal (D-20): un borrador que fue enviado y
-- devuelto no se destruye, se retira.
-- ----------------------------------------------------------------------------
create or replace function public.trazadoc_delete_document_safely(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_doc  record;
  v_role text;
begin
  if v_user is null then raise exception 'No autenticado'; end if;

  select * into v_doc from trazadoc_documents where id = p_document_id for update;
  if v_doc.id is null then raise exception 'El documento no existe'; end if;
  if not is_org_member(v_doc.organization_id) then
    raise exception 'No perteneces a la empresa de este documento';
  end if;
  v_role := trazadoc_current_org_role(v_doc.organization_id);
  if v_role <> 'admin' then
    raise exception 'Solo un administrador puede eliminar un documento';
  end if;

  if v_doc.disposition <> 'active' then
    raise exception 'Este documento está retirado: se conserva como histórico y no se elimina';
  end if;
  if v_doc.status <> 'draft' then
    raise exception 'Solo se elimina un documento que sigue en borrador; los demás se retiran';
  end if;
  if v_doc.approved_at is not null then
    raise exception 'Este documento fue aprobado alguna vez: se conserva como histórico y no se elimina';
  end if;
  if exists (
    select 1 from trazadoc_document_revisions r
     where r.document_id = p_document_id and (r.approved_at is not null or r.revision_number > 1)
  ) then
    raise exception 'Este documento tiene revisiones aprobadas: se conserva como histórico y no se elimina';
  end if;
  if exists (
    select 1 from trazadoc_document_decisions d
     where d.document_id = p_document_id and d.decision_type <> 'revision_created'
  ) then
    raise exception 'Este documento ya pasó por revisión o aprobación: su historial debe conservarse, así que se retira en lugar de eliminarse';
  end if;
  if exists (select 1 from quality_process_documents q where q.document_id = p_document_id) then
    raise exception 'Este documento está asociado a un proceso. Quita la asociación primero o retíralo.';
  end if;
  if exists (
    select 1 from trazadoc_document_versions v
     where v.document_id = p_document_id and v.status <> 'draft'
  ) then
    raise exception 'Este documento tiene versiones registradas: se conserva como histórico y no se elimina';
  end if;

  -- Tareas y alertas no tienen FK al documento (el acoplamiento es por
  -- contrato, AT-04), asi que se limpian aqui de forma explicita.
  delete from work_tasks
   where organization_id = v_doc.organization_id
     and subject_type = 'trazadoc_document' and subject_id = p_document_id;
  delete from work_alerts
   where organization_id = v_doc.organization_id
     and subject_type = 'trazadoc_document' and subject_id = p_document_id;

  -- Secciones, versiones, historial, revisiones, participantes y decisiones
  -- caen por ON DELETE CASCADE (0043 y §2/§3/§4 de esta migracion).
  delete from trazadoc_documents where id = p_document_id;
end;
$$;

revoke all on function public.trazadoc_delete_document_safely(uuid) from public, anon;
grant execute on function public.trazadoc_delete_document_safely(uuid) to authenticated;

comment on function public.trazadoc_delete_document_safely(uuid) is
  'QUALITY-02 · Elimina fisicamente SOLO un borrador sin ningun historico formal (D-10). Cualquier otra situacion devuelve el motivo exacto por el que el documento debe conservarse y retirarse en su lugar.';


-- ----------------------------------------------------------------------------
-- §8 · v_trazadoc_document_control — LA LISTA MAESTRA, DERIVADA
--
-- D-13 y MDR-16: la lista maestra es una PROYECCION, nunca una tabla paralela
-- que alguien tenga que sincronizar. Todo lo que muestra sale de la fuente
-- real: identidad, revisiones, participantes, decisiones y relaciones con
-- procesos. Si el dato no existe todavia, sale NULL — y la interfaz lo dice
-- con «—» o «Pendiente»; jamas con un cero que parezca una medicion.
--
-- security_invoker = true: la vista hereda la RLS real de cada tabla origen.
-- Nunca puede ver mas que quien la consulta.
--
-- lifecycle_state es lo unico que la vista CALCULA, y calcula precisamente lo
-- que no debe almacenarse: la diferencia entre APROBADO y VIGENTE (D-06). Un
-- documento aprobado el 21/08 con vigencia desde el 01/09 se lee «aprobado,
-- pendiente de vigencia» hasta el 31/08 y «vigente» desde el 01/09, sin que
-- ningun proceso programado tenga que despertarse para cambiarlo.
-- ----------------------------------------------------------------------------
create view public.v_trazadoc_document_control
with (security_invoker = true) as
select
  d.organization_id,
  d.id                                              as document_id,
  d.module_key,
  d.code,
  d.title,
  d.description,
  d.category_code,
  case d.category_code
    when 'manual' then 'Manuales'
    when 'procedure' then 'Procedimientos'
    when 'instruction' then 'Instructivos'
    when 'record' then 'Registros'
    when 'technical_support' then 'Soportes técnicos'
    when 'policy' then 'Políticas'
    when 'format' then 'Formatos'
    else 'Otros'
  end                                               as category_label,
  d.status                                          as engine_status,
  d.revision_model,
  d.disposition,
  d.retired_at,
  d.retirement_reason,
  (d.revision_model = 'legacy' and d.current_version > 1) as legacy_revision_uncertain,

  cur.id                                            as current_revision_id,
  cur.revision_number                               as current_revision_number,
  cur.revision_label                                as current_revision_label,
  cur.workflow_state                                as current_workflow_state,
  cur.round                                         as current_round,
  cur.route_mode                                    as current_route_mode,
  cur.submitted_at,
  cur.effective_from                                as current_effective_from,

  eff.revision_number                               as effective_revision_number,
  eff.revision_label                                as effective_revision_label,
  eff.effective_from                                as effective_from,
  eff.effective_to                                  as effective_to,
  eff.approved_at                                   as effective_approved_at,
  coalesce(eff.review_due_at, cur.review_due_at)    as review_due_at,
  (coalesce(eff.review_due_at, cur.review_due_at) is not null
     and coalesce(eff.review_due_at, cur.review_due_at) < current_date) as review_overdue,

  -- El estado que lee una persona. Ver comentario de cabecera de §8.
  case
    when d.disposition in ('retired', 'archived') then 'retired'
    when cur.id is null then
      case d.status when 'obsolete' then 'retired' else d.status end
    when cur.workflow_state = 'approved' then
      case when coalesce(cur.effective_from, current_date) <= current_date
           then 'effective' else 'approved_pending_effective' end
    else cur.workflow_state
  end                                               as lifecycle_state,

  d.owner_id,
  coalesce(nullif(trim(owner.full_name), ''), owner.email)    as owner_name,
  d.owner_position_id,
  pos.name                                          as owner_position_name,
  d.created_by,
  coalesce(nullif(trim(creator.full_name), ''), creator.email) as created_by_name,
  d.created_at,
  d.approved_at,
  coalesce(nullif(trim(approver.full_name), ''), approver.email) as approved_by_name,
  d.updated_at,

  parts.reviewers,
  parts.approvers,
  last_dec.decision_type                            as last_decision_type,
  last_dec.decided_at                               as last_decision_at,
  last_dec.reason                                   as last_decision_reason,
  coalesce(nullif(trim(decider.full_name), ''), decider.email) as last_decision_by_name,

  coalesce(proc.process_names, '')                  as process_names,
  coalesce(proc.process_count, 0)                   as process_count,
  coalesce(sec.sections_count, 0)                   as sections_count,
  coalesce(sec.filled_sections_count, 0)            as filled_sections_count
from public.trazadoc_documents d
left join public.profiles owner    on owner.id = d.owner_id
left join public.profiles creator  on creator.id = d.created_by
left join public.profiles approver on approver.id = d.approved_by
left join public.quality_positions pos on pos.id = d.owner_position_id

-- Revision EN CURSO (la de numero mas alto: la que se esta trabajando o la
-- ultima emitida).
left join lateral (
  select r.* from public.trazadoc_document_revisions r
   where r.document_id = d.id
   order by r.revision_number desc limit 1
) cur on true

-- Revision VIGENTE HOY. No es necesariamente la misma: una revision 2 recien
-- aprobada con vigencia futura convive con la revision 1 aun vigente.
left join lateral (
  select r.* from public.trazadoc_document_revisions r
   where r.document_id = d.id
     and r.workflow_state in ('approved', 'superseded')
     and r.effective_from is not null
     and r.effective_from <= current_date
     and (r.effective_to is null or r.effective_to >= current_date)
     and r.retired_at is null
   order by r.effective_from desc, r.revision_number desc limit 1
) eff on true

left join lateral (
  select
    nullif(string_agg(distinct coalesce(nullif(trim(pr.full_name), ''), pr.email), ', ')
      filter (where p.participant_role = 'reviewer'), '') as reviewers,
    nullif(string_agg(distinct coalesce(nullif(trim(pr.full_name), ''), pr.email), ', ')
      filter (where p.participant_role = 'approver'), '') as approvers
  from public.trazadoc_document_workflow_participants p
  left join public.profiles pr on pr.id = p.profile_id
  where p.revision_id = cur.id and p.round = cur.round
) parts on true

left join lateral (
  select dd.* from public.trazadoc_document_decisions dd
   where dd.document_id = d.id
   order by dd.decided_at desc limit 1
) last_dec on true
left join public.profiles decider on decider.id = last_dec.decided_by

left join lateral (
  select string_agg(distinct qp.name, ', ') as process_names, count(distinct qp.id) as process_count
    from public.quality_process_documents qd
    join public.quality_processes qp on qp.id = qd.process_id
   where qd.document_id = d.id
) proc on true

left join lateral (
  select count(*) as sections_count,
         count(*) filter (where length(trim(s.content)) > 0) as filled_sections_count
    from public.trazadoc_document_sections s where s.document_id = d.id
) sec on true;

comment on view public.v_trazadoc_document_control is
  'QUALITY-02 · Lista maestra DERIVADA (D-13, MDR-16): ninguna fila se sincroniza a mano. lifecycle_state distingue APROBADO de VIGENTE comparando effective_from con la fecha de hoy (D-06), de modo que la semantica temporal es correcta sin ningun proceso programado.';


-- ----------------------------------------------------------------------------
-- §9 · GUARDAS DE INTEGRIDAD
--
-- Lo que la aplicacion promete, la base lo exige. Cada trigger de esta seccion
-- cubre una via privilegiada o directa por la que alguien podria saltarse el
-- control documental sin pasar por la interfaz.
-- ----------------------------------------------------------------------------

-- §9.1 · Una revision aprobada es INMUTABLE (D-02).
-- Lo unico que puede cambiar despues de aprobar es su relacion con el futuro:
-- que la sustituya una revision posterior, que se cierre su vigencia, o que se
-- retire. Su contenido, su numero y su acto de aprobacion, nunca.
create or replace function public.protect_trazadoc_revision_immutability()
returns trigger
language plpgsql
as $$
begin
  if old.workflow_state in ('approved', 'superseded', 'retired') then
    if new.content_snapshot is distinct from old.content_snapshot then
      raise exception 'El contenido de una revisión aprobada no se modifica. Crea una revisión nueva.';
    end if;
    if new.revision_number is distinct from old.revision_number
       or new.revision_label is distinct from old.revision_label
       or new.document_id is distinct from old.document_id then
      raise exception 'La identidad de una revisión aprobada no se modifica.';
    end if;
    if new.approved_at is distinct from old.approved_at
       or new.approved_by is distinct from old.approved_by then
      raise exception 'El acto de aprobación de una revisión no se modifica.';
    end if;
    if new.effective_from is distinct from old.effective_from then
      raise exception 'La fecha de entrada en vigencia de una revisión aprobada no se modifica.';
    end if;
  end if;
  if new.revision_number is distinct from old.revision_number then
    raise exception 'El número de una revisión no cambia.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_trazadoc_revision_immutability() from public, anon, authenticated;

create trigger t_trazadoc_document_revisions_immutable
  before update on public.trazadoc_document_revisions
  for each row execute function public.protect_trazadoc_revision_immutability();


-- §9.2 · La unica escritura DIRECTA permitida sobre una revision abierta es su
-- ficha de vigencia. La politica de UPDATE de §2 deja pasar la fila; este
-- trigger decide QUE columnas. Sin el, un cliente podria mover el estado del
-- workflow con un PATCH y saltarse revisores y aprobadores por completo.
create or replace function public.protect_trazadoc_revision_direct_update()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;   -- las RPC SECURITY DEFINER corren como el dueno del esquema
  end if;
  if new.workflow_state is distinct from old.workflow_state
     or new.round is distinct from old.round
     or new.route_mode is distinct from old.route_mode
     or new.content_snapshot is distinct from old.content_snapshot
     or new.submitted_at is distinct from old.submitted_at
     or new.submitted_by is distinct from old.submitted_by
     or new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by
     or new.superseded_at is distinct from old.superseded_at
     or new.superseded_by_revision_id is distinct from old.superseded_by_revision_id
     or new.retired_at is distinct from old.retired_at
     or new.created_by is distinct from old.created_by
     or new.document_id is distinct from old.document_id then
    raise exception 'El avance del control documental se registra con sus acciones, no editando la revisión.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_trazadoc_revision_direct_update() from public, anon, authenticated;

create trigger t_trazadoc_document_revisions_direct_update
  before update on public.trazadoc_document_revisions
  for each row execute function public.protect_trazadoc_revision_direct_update();


-- §9.3 · EL CORAZON DEL SPRINT: un cambio de estado NO mueve la revision.
--
-- En un documento controlado, current_version solo puede cambiar dentro de
-- trazadoc_create_document_revision, que es la unica que pone la marca de
-- transaccion 'trazaloop.revision_bump'. Cualquier otra via —incluida la RPC
-- historica change_trazadoc_document_status, que es SECURITY DEFINER y por
-- tanto no la detendria ninguna RLS— falla con un mensaje explicito.
-- Los documentos 'legacy' conservan su comportamiento anterior sin cambio
-- alguno: el guarda no los mira.
create or replace function public.protect_trazadoc_document_revision_number()
returns trigger
language plpgsql
as $$
begin
  if new.revision_model is distinct from old.revision_model then
    raise exception 'El modelo de revisión de un documento no cambia después de crearlo.';
  end if;
  if old.revision_model = 'controlled'
     and new.current_version is distinct from old.current_version
     and coalesce(current_setting('trazaloop.revision_bump', true), 'off') <> 'on' then
    raise exception 'Un cambio de estado no altera la revisión del documento. La revisión solo avanza al crear una revisión nueva.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_trazadoc_document_revision_number() from public, anon, authenticated;

create trigger t_trazadoc_documents_revision_guard
  before update on public.trazadoc_documents
  for each row execute function public.protect_trazadoc_document_revision_number();


-- §9.4 · En un documento controlado, el contenido solo se edita mientras la
-- revision esta ABIERTA en manos de su autor. El trigger de 0083 ya exige que
-- el documento este en borrador o en revision, pero «en revision» es
-- precisamente cuando el contenido debe quedarse quieto: el revisor tiene que
-- decidir sobre un texto que no cambie bajo sus pies.
create or replace function public.protect_trazadoc_controlled_section_editing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc_id uuid := coalesce(new.document_id, old.document_id);
  v_model  text;
  v_state  text;
begin
  select d.revision_model into v_model from trazadoc_documents d where d.id = v_doc_id;
  if v_model is distinct from 'controlled' then
    return coalesce(new, old);
  end if;
  select r.workflow_state into v_state from trazadoc_document_revisions r
   where r.document_id = v_doc_id order by r.revision_number desc limit 1;
  if v_state is null then
    return coalesce(new, old);   -- todavia sin revision: creacion del documento
  end if;
  if v_state not in ('draft', 'changes_requested') then
    raise exception 'El contenido no se edita mientras el documento está en revisión, aprobado o retirado. Crea una revisión nueva.';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.protect_trazadoc_controlled_section_editing() from public, anon, authenticated;

create trigger t_trazadoc_sections_controlled_editing
  before insert or update or delete on public.trazadoc_document_sections
  for each row execute function public.protect_trazadoc_controlled_section_editing();


-- §9.5 · Sobre su propia alerta, el destinatario solo cambia el ESTADO.
-- Ni el asunto, ni el tipo, ni el destinatario, ni el texto.
create or replace function public.protect_work_alert_recipient_scope()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if new.recipient_profile_id is distinct from old.recipient_profile_id
     or new.subject_id is distinct from old.subject_id
     or new.subject_type is distinct from old.subject_type
     or new.subject_revision_id is distinct from old.subject_revision_id
     or new.alert_type is distinct from old.alert_type
     or new.source_domain is distinct from old.source_domain
     or new.severity is distinct from old.severity
     or new.title is distinct from old.title
     or new.message is distinct from old.message
     or new.dedupe_key is distinct from old.dedupe_key then
    raise exception 'De una alerta solo puedes cambiar su estado.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_work_alert_recipient_scope() from public, anon, authenticated;

create trigger t_work_alerts_recipient_scope
  before update on public.work_alerts
  for each row execute function public.protect_work_alert_recipient_scope();


-- ----------------------------------------------------------------------------
-- §10 · PRIVILEGIOS EXPLICITOS (leccion de Q0 · convencion de 0111 · 0112 §12)
--
-- Ninguna tabla nueva depende del bootstrap de Supabase. Se concede solo el
-- DML que la RLS puede llegar a permitir: nunca GRANT ALL, nunca TRUNCATE
-- (bypasea RLS), nunca REFERENCES ni TRIGGER (son DDL).
--
-- Las tablas del workflow reciben SELECT y nada mas para authenticated: sus
-- escrituras son exclusivamente de las RPC SECURITY DEFINER, que corren como
-- el dueno del esquema. Conceder INSERT «por si acaso» abriria justo la puerta
-- que §2/§3/§4 cierran a proposito.
-- ----------------------------------------------------------------------------
grant select on table
  public.trazadoc_document_revisions,
  public.trazadoc_document_workflow_participants,
  public.trazadoc_document_decisions,
  public.work_tasks,
  public.work_alerts,
  public.v_trazadoc_document_control
to authenticated;

grant update on table public.trazadoc_document_revisions to authenticated;  -- solo ficha de vigencia (§9.2)
grant update on table public.work_alerts to authenticated;                   -- solo estado propio (§9.5)

grant select, insert, update, delete on table
  public.trazadoc_document_revisions,
  public.trazadoc_document_workflow_participants,
  public.trazadoc_document_decisions,
  public.work_tasks,
  public.work_alerts
to service_role;
grant select on table public.v_trazadoc_document_control to service_role;

revoke truncate, references, trigger on table
  public.trazadoc_document_revisions,
  public.trazadoc_document_workflow_participants,
  public.trazadoc_document_decisions,
  public.work_tasks,
  public.work_alerts
from anon, authenticated;

revoke all on table
  public.trazadoc_document_revisions,
  public.trazadoc_document_workflow_participants,
  public.trazadoc_document_decisions,
  public.work_tasks,
  public.work_alerts,
  public.v_trazadoc_document_control
from anon;
