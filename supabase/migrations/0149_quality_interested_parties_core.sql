-- ============================================================================
-- Trazaloop Quality · QUALITY-12.3B1 · PARTES INTERESADAS · FUNDACIÓN
-- ----------------------------------------------------------------------------
-- ISO 9001:2015 · 4.2. Arquitectura congelada en QUALITY-12.3A (commit
-- b9b059b), decisiones PI-01 … PI-39. Esta migración implementa la fundación
-- relacional: ocho tablas, sus invariantes, su aislamiento y sus permisos.
-- Sin interfaz, sin automatización, sin Intelligence.
--
--
-- LO QUE NO SE CREA, Y ES LA MITAD DEL DISEÑO
--
-- No hay identidad nueva. Una parte interesada externa ES una
-- `quality_external_parties`, decidido en QUALITY-07 (GP-02/GP-33) y apuntado
-- ya por nueve claves foráneas, incluidas las de PCR y Textiles. Crear otra
-- habría sido el tercer proveedor de la casa.
--
-- Tampoco hay tabla de tareas, ni de encuestas, ni de riesgos, ni de
-- indicadores, ni de ficheros. Todo eso existe y se enlaza.
--
--
-- DOS SUJETOS, NO TRES (PI-02, PI-38)
--
-- El análisis apunta a una entidad externa concreta o a un colectivo. NO a
-- `quality_org_units`: eso es el organigrama, la estructura sobre la que
-- cuelgan cargos y personas. «Trabajadores» atraviesa varias unidades y
-- «Dirección» como parte interesada no es la unidad de la que dependen tres
-- cargos. Atarlo al organigrama habría hecho que cada reorganización interna
-- moviera las partes interesadas del sistema.
--
-- Y NO es un par `subject_type` / `subject_id`: eso perdería la clave foránea
-- y con ella el aislamiento estructural por `(organization_id, id)`, que en
-- esta casa es la primera barrera y la RLS la segunda.
--
--
-- DOS RELACIONES SON CORE (PI-36, PI-37)
--
-- `requisito → proceso` y `estrategia → requisito` son tablas con clave
-- foránea compuesta, vigencia y vocabulario propio. NO van en
-- `work_references`, que es el mecanismo correcto para lo periférico —
-- evidencia, origen, «relacionado con»— y el equivocado para la semántica de
-- dominio: solo admite tres relaciones genéricas, no tiene vigencia, y sus
-- `owner_id`/`ref_id` no son claves foráneas (valida al escribir con un
-- disparador, pero un borrado posterior deja la referencia colgando).
-- ============================================================================


-- ============================================================================
-- 1 · QUIÉN ADMINISTRA EL DOMINIO
-- ----------------------------------------------------------------------------
-- Mismo patrón y mismos roles que el resto de Quality. Leer es de cualquier
-- miembro: una parte interesada no es un dato sensible de persona.
-- ============================================================================

create or replace function public.quality_manages_interested_parties(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_org_role(p_organization_id, array['admin', 'quality', 'consultant']);
$$;

revoke all on function public.quality_manages_interested_parties(uuid) from public, anon;
grant execute on function public.quality_manages_interested_parties(uuid) to authenticated;

comment on function public.quality_manages_interested_parties(uuid) is
  'QUALITY-12.3B1 · PI-34 · Quien administra partes interesadas: analizar, registrar requisitos, definir estrategias y revisar. Leer es de cualquier miembro.';


-- ============================================================================
-- 2 · CATEGORÍAS (PI-06, PI-07, PI-08)
-- ----------------------------------------------------------------------------
-- Taxonomía 4.2, configurable POR EMPRESA. No es
-- `quality_external_party_roles`: aquel dice qué papel comercial juega una
-- entidad externa —qué me vende, qué me compra—; esta dice por qué una parte
-- importa para el sistema de gestión, e incluye partes internas y colectivas.
-- Fundirlas obligaría a ampliar un CHECK cada vez que aparezca una parte que
-- no comercia con la organización.
--
-- Se siembra por empresa y no como catálogo global, porque la decisión humana
-- exige poder DESACTIVAR las iniciales, y una fila global no se puede
-- desactivar para una sola empresa. El precedente es
-- `quality_seed_competency_levels`.
-- ============================================================================

create table public.quality_stakeholder_categories (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  code              text,
  name              text not null,
  description       text,
  sort_order        integer not null default 100,
  is_active         boolean not null default true,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_stakeholder_categories_org_id_uniq unique (organization_id, id),
  constraint quality_stakeholder_categories_name_not_blank check (length(trim(name)) > 0)
);

create unique index quality_stakeholder_categories_code_uniq
  on public.quality_stakeholder_categories (organization_id, code) where code is not null;
create index quality_stakeholder_categories_org_idx
  on public.quality_stakeholder_categories (organization_id, sort_order) where is_active;

comment on table public.quality_stakeholder_categories is
  'QUALITY-12.3B1 · PI-06 · Taxonomia 4.2 configurable por empresa. Semilla editable de 15, no lista cerrada. Una categoria con historia se DESACTIVA, no se borra.';

create trigger t_quality_stakeholder_categories_updated
  before update on public.quality_stakeholder_categories
  for each row execute function public.set_updated_at();
create trigger t_quality_stakeholder_categories_org_immutable
  before update on public.quality_stakeholder_categories
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_stakeholder_categories_force_created_by
  before insert on public.quality_stakeholder_categories
  for each row execute function public.force_created_by();
create trigger t_audit_quality_stakeholder_categories
  after insert or update or delete on public.quality_stakeholder_categories
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 3 · GRUPOS (PI-03, PI-38)
-- ----------------------------------------------------------------------------
-- Colectivos, internos y externos, sin entidad juridica concreta:
-- trabajadores, direccion, propietarios, la comunidad del entorno, la
-- academia.
--
-- No van en `quality_external_parties` —esa tabla exige `legal_name` y la ven
-- PCR y Textiles— ni en `quality_org_units`, que es el organigrama.
--
-- SIN FK a `quality_org_units`, ni siquiera opcional: la arquitectura la dejó
-- explicitamente diferida, y anadir una columna nulable «por si acaso» es como
-- se llenan las tablas de campos que nadie rellena.
-- ============================================================================

create table public.quality_stakeholder_groups (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  code              text,
  name              text not null,
  description       text,
  is_active         boolean not null default true,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_stakeholder_groups_org_id_uniq unique (organization_id, id),
  constraint quality_stakeholder_groups_name_not_blank check (length(trim(name)) > 0)
);

create unique index quality_stakeholder_groups_code_uniq
  on public.quality_stakeholder_groups (organization_id, code) where code is not null;

comment on table public.quality_stakeholder_groups is
  'QUALITY-12.3B1 · PI-03/PI-38 · Colectivos con intereses: trabajadores, direccion, propietarios, comunidad, academia. NO es el organigrama (quality_org_units) ni una entidad externa.';

create trigger t_quality_stakeholder_groups_updated
  before update on public.quality_stakeholder_groups
  for each row execute function public.set_updated_at();
create trigger t_quality_stakeholder_groups_org_immutable
  before update on public.quality_stakeholder_groups
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_stakeholder_groups_force_created_by
  before insert on public.quality_stakeholder_groups
  for each row execute function public.force_created_by();
create trigger t_audit_quality_stakeholder_groups
  after insert or update or delete on public.quality_stakeholder_groups
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 4 · EL ANÁLISIS (PI-02, PI-09, PI-10, PI-11, PI-26, PI-27, PI-39)
-- ----------------------------------------------------------------------------
-- «Cliente ABC» es una entidad; «en 2026 ABC nos importa por entregas a
-- tiempo, con influencia alta» es un analisis. El analisis evoluciona sin
-- crear una parte nueva.
--
-- Es una EVALUACION FECHADA, no una revision publicada: un proceso se publica
-- y su version anterior queda derogada; un juicio sobre una parte interesada
-- se emite y el siguiente lo SUCEDE sin negarlo. El precedente es
-- `quality_risk_assessments`.
--
-- LA PRIORIDAD ES OPCIONAL SIEMPRE (PI-26). Una organizacion puede trabajar la
-- 4.2 entera sin asignar un solo numero, y eso es el uso normal, no uno
-- degradado.
-- ============================================================================

create table public.quality_stakeholder_assessments (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,

  category_id           uuid not null,

  -- El sujeto. Dos columnas nulables con FK COMPUESTA, no un par generico.
  subject_kind          text not null,
  external_party_id     uuid,
  stakeholder_group_id  uuid,

  assessed_on           date not null default current_date,
  assessed_by           uuid references public.profiles (id),
  owner_position_id     uuid,

  -- Pertinencia: una afirmacion fechada, no un atributo permanente.
  relevance_status      text not null default 'under_review',
  relevance_rationale   text,

  -- Priorizacion OPCIONAL. `priority_label` cualitativo o `priority_score` con
  -- su metodologia; nunca un numero desnudo (PI-39).
  priority_label        text,
  priority_score        numeric,
  priority_method_note  text,
  priority_derivation   jsonb,

  summary               text,

  effective_from        date not null default current_date,
  effective_to          date,
  supersedes_id         uuid,
  status                text not null default 'current',

  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint quality_stakeholder_assessments_org_id_uniq unique (organization_id, id),

  constraint quality_stakeholder_assessments_category_fk
    foreign key (organization_id, category_id)
    references public.quality_stakeholder_categories (organization_id, id) on delete restrict,
  constraint quality_stakeholder_assessments_party_fk
    foreign key (organization_id, external_party_id)
    references public.quality_external_parties (organization_id, id) on delete restrict,
  constraint quality_stakeholder_assessments_group_fk
    foreign key (organization_id, stakeholder_group_id)
    references public.quality_stakeholder_groups (organization_id, id) on delete restrict,
  constraint quality_stakeholder_assessments_owner_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete restrict,
  constraint quality_stakeholder_assessments_supersedes_fk
    foreign key (organization_id, supersedes_id)
    references public.quality_stakeholder_assessments (organization_id, id) on delete restrict,

  constraint quality_stakeholder_assessments_subject_kind_check
    check (subject_kind in ('external_party', 'group')),
  -- EXACTAMENTE UN sujeto, y coherente con lo declarado.
  constraint quality_stakeholder_assessments_one_subject
    check (num_nonnulls(external_party_id, stakeholder_group_id) = 1),
  constraint quality_stakeholder_assessments_subject_coherent
    check (
      (subject_kind = 'external_party' and external_party_id is not null)
      or (subject_kind = 'group' and stakeholder_group_id is not null)),

  constraint quality_stakeholder_assessments_relevance_check
    check (relevance_status in ('relevant', 'not_relevant', 'under_review')),
  -- Descartar una parte sin decir por que es exactamente lo que un auditor
  -- pregunta. Se exige el motivo.
  constraint quality_stakeholder_assessments_relevance_rationale
    check (relevance_status <> 'not_relevant'
           or length(trim(coalesce(relevance_rationale, ''))) > 0),

  constraint quality_stakeholder_assessments_priority_label_check
    check (priority_label is null or priority_label in ('high', 'medium', 'low')),
  constraint quality_stakeholder_assessments_priority_score_check
    check (priority_score is null or priority_score >= 0),
  -- PI-39 · Un numero no se ensena sin su origen: si hay puntuacion, hay
  -- metodologia o justificacion.
  constraint quality_stakeholder_assessments_score_needs_method
    check (priority_score is null
           or length(trim(coalesce(priority_method_note, ''))) > 0
           or priority_derivation is not null),

  constraint quality_stakeholder_assessments_status_check
    check (status in ('current', 'superseded', 'cancelled')),
  constraint quality_stakeholder_assessments_period_check
    check (effective_to is null or effective_to >= effective_from),
  -- Un analisis vigente no puede estar marcado como sucedido, ni al reves.
  constraint quality_stakeholder_assessments_status_consistent
    check ((status = 'current') = (effective_to is null)),
  constraint quality_stakeholder_assessments_no_self_supersede
    check (supersedes_id is null or supersedes_id <> id)
);

-- Como mucho UN analisis vigente por (sujeto, categoria). Dos indices
-- parciales, uno por tipo de sujeto: la unicidad no se puede expresar sobre
-- «el sujeto» porque son dos columnas distintas.
create unique index quality_stakeholder_assessments_current_party_uniq
  on public.quality_stakeholder_assessments (organization_id, external_party_id, category_id)
  where effective_to is null and external_party_id is not null;
create unique index quality_stakeholder_assessments_current_group_uniq
  on public.quality_stakeholder_assessments (organization_id, stakeholder_group_id, category_id)
  where effective_to is null and stakeholder_group_id is not null;

-- Un analisis solo puede suceder a otro UNA vez: dos sucesores del mismo
-- analisis serian dos historias del mismo hecho.
create unique index quality_stakeholder_assessments_supersedes_uniq
  on public.quality_stakeholder_assessments (supersedes_id) where supersedes_id is not null;

create index quality_stakeholder_assessments_lookup_idx
  on public.quality_stakeholder_assessments (organization_id, relevance_status, effective_from);

comment on table public.quality_stakeholder_assessments is
  'QUALITY-12.3B1 · PI-09/PI-10 · El analisis fechado de una parte interesada. Evaluacion, no revision publicada: el siguiente SUCEDE al anterior sin negarlo. La prioridad es opcional siempre.';
comment on column public.quality_stakeholder_assessments.priority_score is
  'PI-26/PI-39 · Opcional. Si existe, exige metodologia o justificacion: un numero desnudo se defiende como si fuera medida.';

create trigger t_quality_stakeholder_assessments_updated
  before update on public.quality_stakeholder_assessments
  for each row execute function public.set_updated_at();
create trigger t_quality_stakeholder_assessments_org_immutable
  before update on public.quality_stakeholder_assessments
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_stakeholder_assessments_force_created_by
  before insert on public.quality_stakeholder_assessments
  for each row execute function public.force_created_by();
create trigger t_audit_quality_stakeholder_assessments
  after insert or update or delete on public.quality_stakeholder_assessments
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 5 · NECESIDAD, EXPECTATIVA Y REQUISITO (PI-12 … PI-16)
-- ----------------------------------------------------------------------------
-- TRES cosas, no tres palabras para lo mismo:
--
--   NECESIDAD     lo que la parte requiere para que la relacion funcione
--   EXPECTATIVA   lo que da por supuesto aunque no lo pida
--   REQUISITO     aquello a lo que la organizacion QUEDA SUJETA
--
-- Una tabla y tres tipos, no tres tablas: el ciclo de vida es el mismo y la
-- conversion tiene que conservar el origen. Tres tablas obligarian a copiar la
-- fila al convertir, que es exactamente perder la trazabilidad.
--
-- Y no se recrea `quality_supplier_requirements`: aquel es lo que la
-- organizacion EXIGE a sus proveedores. Direcciones opuestas.
-- ============================================================================

create table public.quality_stakeholder_requirements (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,

  assessment_id         uuid not null,

  entry_kind            text not null,
  requirement_kind      text,

  code                  text,
  title                 text not null,
  description           text,
  source_note           text,

  -- La conversion: de que necesidad o expectativa salio este requisito.
  derived_from_id       uuid,
  converted_at          timestamptz,
  converted_by          uuid references public.profiles (id),
  conversion_rationale  text,

  relevance_status      text not null default 'under_review',
  relevance_rationale   text,

  effective_from        date not null default current_date,
  effective_to          date,

  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint quality_stakeholder_requirements_org_id_uniq unique (organization_id, id),

  constraint quality_stakeholder_requirements_assessment_fk
    foreign key (organization_id, assessment_id)
    references public.quality_stakeholder_assessments (organization_id, id) on delete restrict,
  constraint quality_stakeholder_requirements_derived_fk
    foreign key (organization_id, derived_from_id)
    references public.quality_stakeholder_requirements (organization_id, id) on delete restrict,

  constraint quality_stakeholder_requirements_entry_kind_check
    check (entry_kind in ('need', 'expectation', 'requirement')),
  -- El subtipo existe si y solo si la fila ES un requisito. Un `need` con
  -- subtipo legal seria un dato esperando a que alguien lo interprete mal.
  --
  -- El `is not null` NO es redundante, y la prueba J lo demostro: sin el, un
  -- requisito con subtipo nulo evaluaba `null in (...)` = NULL, la otra rama
  -- daba false, y `NULL or false` es NULL — que un CHECK acepta. La logica de
  -- tres valores deja pasar lo que uno cree haber prohibido.
  constraint quality_stakeholder_requirements_subtype_check
    check (
      (entry_kind = 'requirement'
        and requirement_kind is not null
        and requirement_kind in ('legal', 'regulatory', 'contractual',
                                 'standard', 'internal_commitment', 'other'))
      or (entry_kind <> 'requirement' and requirement_kind is null)),

  constraint quality_stakeholder_requirements_title_not_blank
    check (length(trim(title)) > 0),

  -- Convertir sin decir por que y cuando no es convertir: es reetiquetar.
  constraint quality_stakeholder_requirements_conversion_check
    check (derived_from_id is null
           or (entry_kind = 'requirement'
               and converted_at is not null
               and length(trim(coalesce(conversion_rationale, ''))) > 0)),
  constraint quality_stakeholder_requirements_no_self_derive
    check (derived_from_id is null or derived_from_id <> id),

  constraint quality_stakeholder_requirements_relevance_check
    check (relevance_status in ('relevant', 'not_relevant', 'under_review')),
  constraint quality_stakeholder_requirements_relevance_rationale
    check (relevance_status <> 'not_relevant'
           or length(trim(coalesce(relevance_rationale, ''))) > 0),

  constraint quality_stakeholder_requirements_period_check
    check (effective_to is null or effective_to >= effective_from)
);

create unique index quality_stakeholder_requirements_code_uniq
  on public.quality_stakeholder_requirements (organization_id, code) where code is not null;
create index quality_stakeholder_requirements_assessment_idx
  on public.quality_stakeholder_requirements (organization_id, assessment_id, entry_kind);
create index quality_stakeholder_requirements_current_idx
  on public.quality_stakeholder_requirements (organization_id, relevance_status)
  where effective_to is null;

comment on table public.quality_stakeholder_requirements is
  'QUALITY-12.3B1 · PI-12/PI-13 · Necesidad, expectativa y requisito. Una tabla y tres tipos: convertir conserva el origen en vez de copiar la fila. NO es quality_supplier_requirements, que va en la direccion contraria.';

create trigger t_quality_stakeholder_requirements_updated
  before update on public.quality_stakeholder_requirements
  for each row execute function public.set_updated_at();
create trigger t_quality_stakeholder_requirements_org_immutable
  before update on public.quality_stakeholder_requirements
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_stakeholder_requirements_force_created_by
  before insert on public.quality_stakeholder_requirements
  for each row execute function public.force_created_by();
create trigger t_audit_quality_stakeholder_requirements
  after insert or update or delete on public.quality_stakeholder_requirements
  for each row execute function public.audit_row_change();


-- ----------------------------------------------------------------------------
-- El origen de una conversion tiene que ser una NECESIDAD o una EXPECTATIVA de
-- la MISMA empresa. La FK compuesta ya garantiza la empresa; el tipo no se
-- puede comprobar con un CHECK porque mira otra fila.
-- ----------------------------------------------------------------------------

create or replace function public.quality_stakeholder_requirement_origin_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_kind text;
begin
  if new.derived_from_id is null then
    return new;
  end if;
  select entry_kind into v_kind
    from public.quality_stakeholder_requirements
   where organization_id = new.organization_id and id = new.derived_from_id;
  if v_kind is null then
    raise exception 'La necesidad o expectativa de origen no existe en esta empresa.'
      using errcode = '23503';
  end if;
  if v_kind not in ('need', 'expectation') then
    raise exception 'Un requisito solo puede derivarse de una necesidad o de una expectativa, no de otro requisito.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.quality_stakeholder_requirement_origin_guard() from public, anon, authenticated;

create trigger t_quality_stakeholder_requirements_origin
  before insert or update on public.quality_stakeholder_requirements
  for each row execute function public.quality_stakeholder_requirement_origin_guard();

comment on function public.quality_stakeholder_requirement_origin_guard() is
  'QUALITY-12.3B1 · PI-13 · La conversion sale de una necesidad o expectativa, nunca de otro requisito. Un CHECK no puede mirar otra fila.';


-- ============================================================================
-- 6 · REQUISITO → PROCESO · RELACIÓN CORE (PI-17, PI-18, PI-19, PI-37)
-- ----------------------------------------------------------------------------
-- Se enlaza el REQUISITO al proceso, no la parte al proceso: un proceso no se
-- ve afectado por «el cliente ABC» en abstracto, sino por algo concreto que
-- ABC necesita. La relacion parte↔proceso se DERIVA recorriendo esto; guardarla
-- ademas crearia dos verdades que se desincronizan.
--
-- NO va en `work_references`: necesita vigencia, la instantanea de la revision
-- del proceso contra la que se juzgo, y un vocabulario propio de relacion.
-- Aquella tabla solo tiene `origin`, `evidence` y `related`.
-- ============================================================================

create table public.quality_stakeholder_requirement_processes (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,

  requirement_id        uuid not null,
  process_id            uuid not null,
  -- Contra que version del proceso se juzgo. Mismo patron de instantanea que
  -- 0142 uso para la aplicabilidad de la evidencia.
  process_revision_id   uuid,

  link_kind             text not null default 'addressed_by',
  note                  text,

  effective_from        date not null default current_date,
  effective_to          date,

  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint quality_stakeholder_requirement_processes_org_id_uniq unique (organization_id, id),

  constraint quality_stakeholder_requirement_processes_requirement_fk
    foreign key (organization_id, requirement_id)
    references public.quality_stakeholder_requirements (organization_id, id) on delete restrict,
  constraint quality_stakeholder_requirement_processes_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete restrict,
  constraint quality_stakeholder_requirement_processes_revision_fk
    foreign key (organization_id, process_revision_id)
    references public.quality_process_revisions (organization_id, id) on delete restrict,

  constraint quality_stakeholder_requirement_processes_kind_check
    check (link_kind in ('addressed_by', 'affects', 'monitored_by')),
  constraint quality_stakeholder_requirement_processes_period_check
    check (effective_to is null or effective_to >= effective_from)
);

-- Un vinculo VIGENTE por pareja. Los cerrados conviven: son la historia.
create unique index quality_stakeholder_requirement_processes_current_uniq
  on public.quality_stakeholder_requirement_processes (organization_id, requirement_id, process_id)
  where effective_to is null;
create index quality_stakeholder_requirement_processes_by_process_idx
  on public.quality_stakeholder_requirement_processes (organization_id, process_id)
  where effective_to is null;

comment on table public.quality_stakeholder_requirement_processes is
  'QUALITY-12.3B1 · PI-17/PI-37 · Relacion CORE requisito→proceso, con vigencia e instantanea de revision. La relacion parte→proceso se DERIVA de aqui: guardarla aparte serian dos verdades.';

create trigger t_quality_stakeholder_requirement_processes_updated
  before update on public.quality_stakeholder_requirement_processes
  for each row execute function public.set_updated_at();
create trigger t_quality_stakeholder_requirement_processes_org_immutable
  before update on public.quality_stakeholder_requirement_processes
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_stakeholder_requirement_processes_force_created_by
  before insert on public.quality_stakeholder_requirement_processes
  for each row execute function public.force_created_by();
create trigger t_audit_quality_stakeholder_requirement_processes
  after insert or update or delete on public.quality_stakeholder_requirement_processes
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 7 · ESTRATEGIAS (PI-20, PI-21, PI-22, PI-23)
-- ----------------------------------------------------------------------------
-- Lo que convierte el registro en gestion. Sin esto, la 4.2 es una lista.
--
-- La duena es un CARGO, nunca una persona (T-02): si el cargo cambia de
-- ocupante, la estrategia sigue teniendo duena.
--
-- Y el ALCANCE no es una columna. Los requisitos atendidos viven en
-- `quality_stakeholder_strategy_requirements`; tenerlo en dos sitios
-- permitiria que se contradijeran. Cero enlaces = estrategia general de la
-- parte; uno = especifica; N = varias.
-- ============================================================================

create table public.quality_stakeholder_strategies (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,

  assessment_id         uuid not null,

  title                 text not null,
  purpose               text,
  approach              text,

  owner_position_id     uuid,

  monitoring_method     text,
  monitoring_note       text,

  review_cadence_months integer,
  next_review_on        date,
  last_reviewed_on      date,

  status                text not null default 'draft',
  effective_from        date not null default current_date,
  effective_to          date,
  supersedes_id         uuid,

  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint quality_stakeholder_strategies_org_id_uniq unique (organization_id, id),

  constraint quality_stakeholder_strategies_assessment_fk
    foreign key (organization_id, assessment_id)
    references public.quality_stakeholder_assessments (organization_id, id) on delete restrict,
  constraint quality_stakeholder_strategies_owner_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete restrict,
  constraint quality_stakeholder_strategies_supersedes_fk
    foreign key (organization_id, supersedes_id)
    references public.quality_stakeholder_strategies (organization_id, id) on delete restrict,

  constraint quality_stakeholder_strategies_title_not_blank
    check (length(trim(title)) > 0),
  constraint quality_stakeholder_strategies_status_check
    check (status in ('draft', 'active', 'superseded', 'cancelled')),
  -- El vocabulario de seguimiento (PI-24). No se presupone encuesta: la mayoria
  -- de las partes interesadas no se miden con una.
  constraint quality_stakeholder_strategies_monitoring_check
    check (monitoring_method is null or monitoring_method in (
      'survey', 'indicator', 'periodic_evaluation', 'meeting', 'complaint',
      'sla', 'audit', 'feedback', 'regulatory_compliance', 'document', 'other')),
  constraint quality_stakeholder_strategies_cadence_check
    check (review_cadence_months is null or review_cadence_months between 1 and 120),
  constraint quality_stakeholder_strategies_period_check
    check (effective_to is null or effective_to >= effective_from),
  constraint quality_stakeholder_strategies_no_self_supersede
    check (supersedes_id is null or supersedes_id <> id)
);

create unique index quality_stakeholder_strategies_supersedes_uniq
  on public.quality_stakeholder_strategies (supersedes_id) where supersedes_id is not null;
create index quality_stakeholder_strategies_assessment_idx
  on public.quality_stakeholder_strategies (organization_id, assessment_id, status);
create index quality_stakeholder_strategies_review_idx
  on public.quality_stakeholder_strategies (organization_id, next_review_on)
  where status = 'active';

comment on table public.quality_stakeholder_strategies is
  'QUALITY-12.3B1 · PI-20/PI-22 · Que hara la organizacion. Duena = CARGO. El alcance vive en quality_stakeholder_strategy_requirements: cero enlaces = general de la parte.';
comment on column public.quality_stakeholder_strategies.monitoring_method is
  'PI-24 · Once mecanismos. Cuando el mecanismo tiene motor —encuesta, evaluacion de proveedor, indicador, auditoria, queja— se referencia ese motor, no se recrea.';

create trigger t_quality_stakeholder_strategies_updated
  before update on public.quality_stakeholder_strategies
  for each row execute function public.set_updated_at();
create trigger t_quality_stakeholder_strategies_org_immutable
  before update on public.quality_stakeholder_strategies
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_stakeholder_strategies_force_created_by
  before insert on public.quality_stakeholder_strategies
  for each row execute function public.force_created_by();
create trigger t_audit_quality_stakeholder_strategies
  after insert or update or delete on public.quality_stakeholder_strategies
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 8 · ESTRATEGIA → REQUISITO · RELACIÓN CORE (PI-36, PI-37)
-- ----------------------------------------------------------------------------
-- Por que NO es `work_references`, comprobado contra el esquema real:
--
--   1 · No hay relacion tipada. Solo `origin`, `evidence`, `related`. «Esta
--       estrategia atiende este requisito» no es ninguna de las tres, y
--       meterla en `related` haria indistinguible «lo atiende» de «tiene algo
--       que ver con el».
--   2 · No hay clave foranea. `ref_id` es un uuid; un disparador valida al
--       escribir que existe y es de la empresa, pero un borrado posterior deja
--       la referencia colgando y no hay `on delete restrict` que lo impida.
--   3 · No hay vigencia. Una estrategia puede dejar de atender un requisito sin
--       que ninguno de los dos desaparezca, y eso hay que poder fecharlo.
-- ============================================================================

create table public.quality_stakeholder_strategy_requirements (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  strategy_id       uuid not null,
  requirement_id    uuid not null,

  -- Que parte del requisito atiende, cuando no lo atiende entero.
  coverage_note     text,

  effective_from    date not null default current_date,
  effective_to      date,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_stakeholder_strategy_requirements_org_id_uniq unique (organization_id, id),

  constraint quality_stakeholder_strategy_requirements_strategy_fk
    foreign key (organization_id, strategy_id)
    references public.quality_stakeholder_strategies (organization_id, id) on delete restrict,
  constraint quality_stakeholder_strategy_requirements_requirement_fk
    foreign key (organization_id, requirement_id)
    references public.quality_stakeholder_requirements (organization_id, id) on delete restrict,

  constraint quality_stakeholder_strategy_requirements_period_check
    check (effective_to is null or effective_to >= effective_from)
);

create unique index quality_stakeholder_strategy_requirements_current_uniq
  on public.quality_stakeholder_strategy_requirements (organization_id, strategy_id, requirement_id)
  where effective_to is null;
create index quality_stakeholder_strategy_requirements_by_requirement_idx
  on public.quality_stakeholder_strategy_requirements (organization_id, requirement_id)
  where effective_to is null;

comment on table public.quality_stakeholder_strategy_requirements is
  'QUALITY-12.3B1 · PI-36 · Relacion CORE estrategia→requisito, con FK compuestas y vigencia. Responde las dos preguntas por clave foranea: que requisitos atiende una estrategia, y que estrategias atienden un requisito.';

create trigger t_quality_stakeholder_strategy_requirements_updated
  before update on public.quality_stakeholder_strategy_requirements
  for each row execute function public.set_updated_at();
create trigger t_quality_stakeholder_strategy_requirements_org_immutable
  before update on public.quality_stakeholder_strategy_requirements
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_stakeholder_strategy_requirements_force_created_by
  before insert on public.quality_stakeholder_strategy_requirements
  for each row execute function public.force_created_by();
create trigger t_audit_quality_stakeholder_strategy_requirements
  after insert or update or delete on public.quality_stakeholder_strategy_requirements
  for each row execute function public.audit_row_change();


-- ----------------------------------------------------------------------------
-- La estrategia y el requisito tienen que colgar del MISMO analisis. La FK
-- compuesta garantiza la empresa; que sean de la misma parte interesada no lo
-- puede comprobar un CHECK, porque mira dos filas de otras dos tablas.
--
-- Sin esto, una estrategia para el cliente ABC podria decir que atiende un
-- requisito del proveedor XYZ, y las dos consultas de PI-36 devolverian
-- respuestas ciertas y absurdas.
-- ----------------------------------------------------------------------------

create or replace function public.quality_stakeholder_strategy_requirement_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_strategy_assessment uuid;
  v_requirement_assessment uuid;
begin
  select assessment_id into v_strategy_assessment
    from public.quality_stakeholder_strategies
   where organization_id = new.organization_id and id = new.strategy_id;
  select assessment_id into v_requirement_assessment
    from public.quality_stakeholder_requirements
   where organization_id = new.organization_id and id = new.requirement_id;

  if v_strategy_assessment is null or v_requirement_assessment is null then
    raise exception 'La estrategia o el requisito no existen en esta empresa.'
      using errcode = '23503';
  end if;
  if v_strategy_assessment <> v_requirement_assessment then
    raise exception 'Una estrategia solo puede atender requisitos del mismo analisis de parte interesada.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.quality_stakeholder_strategy_requirement_guard() from public, anon, authenticated;

create trigger t_quality_stakeholder_strategy_requirements_same_assessment
  before insert or update on public.quality_stakeholder_strategy_requirements
  for each row execute function public.quality_stakeholder_strategy_requirement_guard();

comment on function public.quality_stakeholder_strategy_requirement_guard() is
  'QUALITY-12.3B1 · PI-36 · Estrategia y requisito tienen que colgar del mismo analisis: una estrategia del cliente ABC no puede atender un requisito del proveedor XYZ.';


-- ============================================================================
-- 9 · REVISIONES (PI-29, PI-30)
-- ----------------------------------------------------------------------------
-- Una revision SIN cambios es un hecho registrable, y no es lo mismo que un
-- cambio. Forzar a crear un analisis nuevo para poder decir «lo revisamos y
-- sigue igual» seria fabricar informacion falsa; no poder decirlo seria perder
-- la prueba de que se reviso.
--
-- Append-only: una revision no se edita ni se borra.
-- ============================================================================

create table public.quality_stakeholder_reviews (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,

  assessment_id       uuid,
  strategy_id         uuid,

  reviewed_on         date not null default current_date,
  reviewed_by         uuid references public.profiles (id),
  owner_position_id   uuid,

  verdict             text not null,
  note                text,
  next_review_on      date,

  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),

  constraint quality_stakeholder_reviews_org_id_uniq unique (organization_id, id),

  constraint quality_stakeholder_reviews_assessment_fk
    foreign key (organization_id, assessment_id)
    references public.quality_stakeholder_assessments (organization_id, id) on delete restrict,
  constraint quality_stakeholder_reviews_strategy_fk
    foreign key (organization_id, strategy_id)
    references public.quality_stakeholder_strategies (organization_id, id) on delete restrict,
  constraint quality_stakeholder_reviews_owner_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete restrict,

  -- Una revision revisa algo. Puede ser el analisis, la estrategia o los dos.
  constraint quality_stakeholder_reviews_target_check
    check (num_nonnulls(assessment_id, strategy_id) >= 1),
  constraint quality_stakeholder_reviews_verdict_check
    check (verdict in ('no_changes', 'changes_applied', 'escalated')),
  constraint quality_stakeholder_reviews_note_check
    check (verdict <> 'escalated' or length(trim(coalesce(note, ''))) > 0)
);

create index quality_stakeholder_reviews_assessment_idx
  on public.quality_stakeholder_reviews (organization_id, assessment_id, reviewed_on desc);
create index quality_stakeholder_reviews_strategy_idx
  on public.quality_stakeholder_reviews (organization_id, strategy_id, reviewed_on desc);

comment on table public.quality_stakeholder_reviews is
  'QUALITY-12.3B1 · PI-29 · «Se reviso y no cambio nada» es un hecho, y se registra sin fabricar una version nueva. Append-only.';

create trigger t_quality_stakeholder_reviews_org_immutable
  before update on public.quality_stakeholder_reviews
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_stakeholder_reviews_force_created_by
  before insert on public.quality_stakeholder_reviews
  for each row execute function public.force_created_by();
create trigger t_audit_quality_stakeholder_reviews
  after insert or update or delete on public.quality_stakeholder_reviews
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 10 · HISTORICAL TRUTH · LO QUE NO SE REESCRIBE (PI-28)
-- ----------------------------------------------------------------------------
-- `audit_log` no es la fuente de verdad empresarial (T-04). Lo que hace que
-- las preguntas historicas tengan respuesta es que las filas anteriores sigan
-- siendo las que fueron.
--
-- Dos guardianes, cada uno para una cosa distinta:
--
--   · una fila ya SUCEDIDA no se toca — se acabo su turno;
--   · una revision es un hecho, y un hecho no se corrige: se registra otro.
-- ============================================================================

create or replace function public.quality_stakeholder_history_guard()
returns trigger
language plpgsql
as $$
begin
  -- Cerrar la vigencia y marcar la sucesion es la operacion legitima: es como
  -- una fila deja de ser la vigente. Lo que no se admite es cambiar el
  -- CONTENIDO de una fila que ya fue sucedida.
  if old.effective_to is not null and old.status <> 'current' then
    if new.effective_to is distinct from old.effective_to
       or new.effective_from is distinct from old.effective_from
       or new.status is distinct from old.status then
      raise exception 'Un registro ya sucedido no se reescribe: su historia es la respuesta a «que decia entonces».'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.quality_stakeholder_history_guard() from public, anon, authenticated;

create trigger t_quality_stakeholder_assessments_history
  before update on public.quality_stakeholder_assessments
  for each row execute function public.quality_stakeholder_history_guard();
create trigger t_quality_stakeholder_strategies_history
  before update on public.quality_stakeholder_strategies
  for each row execute function public.quality_stakeholder_history_guard();

comment on function public.quality_stakeholder_history_guard() is
  'QUALITY-12.3B1 · PI-28 · Una fila ya sucedida conserva su vigencia y su estado. Cerrar la vigencia es legitimo; reabrirla o moverla, no.';


-- Una revision no se edita ni se borra: es un hecho fechado. Mismo criterio
-- que `recycled_content_calculations` y `output_batch_movements` en PCR.
create trigger t_quality_stakeholder_reviews_immutable
  before update or delete on public.quality_stakeholder_reviews
  for each row execute function public.forbid_mutation();


-- ============================================================================
-- 11 · RLS · DOS BARRERAS, Y LA PRIMERA YA ESTÁ EN LAS CLAVES FORÁNEAS
-- ----------------------------------------------------------------------------
-- Todas las claves foraneas del dominio son COMPUESTAS por
-- `(organization_id, id)`: un analisis no puede apuntar a una parte de otra
-- empresa aunque alguien conozca su uuid, y eso lo impide la base, no la
-- politica. La RLS es la segunda barrera, no la unica.
--
-- SIN POLITICA DE DELETE en ninguna de las ocho tablas. Las catalogo se
-- desactivan; las historicas se suceden o cierran su vigencia; las revisiones
-- son hechos. Deny-by-default: lo que no tiene politica, no se puede hacer.
-- ============================================================================

alter table public.quality_stakeholder_categories            enable row level security;
alter table public.quality_stakeholder_groups                enable row level security;
alter table public.quality_stakeholder_assessments           enable row level security;
alter table public.quality_stakeholder_requirements          enable row level security;
alter table public.quality_stakeholder_requirement_processes enable row level security;
alter table public.quality_stakeholder_strategies            enable row level security;
alter table public.quality_stakeholder_strategy_requirements enable row level security;
alter table public.quality_stakeholder_reviews               enable row level security;

create policy quality_stakeholder_categories_select on public.quality_stakeholder_categories
  for select using (is_org_member(organization_id));
create policy quality_stakeholder_groups_select on public.quality_stakeholder_groups
  for select using (is_org_member(organization_id));
create policy quality_stakeholder_assessments_select on public.quality_stakeholder_assessments
  for select using (is_org_member(organization_id));
create policy quality_stakeholder_requirements_select on public.quality_stakeholder_requirements
  for select using (is_org_member(organization_id));
create policy quality_stakeholder_requirement_processes_select on public.quality_stakeholder_requirement_processes
  for select using (is_org_member(organization_id));
create policy quality_stakeholder_strategies_select on public.quality_stakeholder_strategies
  for select using (is_org_member(organization_id));
create policy quality_stakeholder_strategy_requirements_select on public.quality_stakeholder_strategy_requirements
  for select using (is_org_member(organization_id));
create policy quality_stakeholder_reviews_select on public.quality_stakeholder_reviews
  for select using (is_org_member(organization_id));

create policy quality_stakeholder_categories_insert on public.quality_stakeholder_categories
  for insert with check (quality_manages_interested_parties(organization_id));
create policy quality_stakeholder_categories_update on public.quality_stakeholder_categories
  for update using (quality_manages_interested_parties(organization_id))
  with check (quality_manages_interested_parties(organization_id));

create policy quality_stakeholder_groups_insert on public.quality_stakeholder_groups
  for insert with check (quality_manages_interested_parties(organization_id));
create policy quality_stakeholder_groups_update on public.quality_stakeholder_groups
  for update using (quality_manages_interested_parties(organization_id))
  with check (quality_manages_interested_parties(organization_id));

create policy quality_stakeholder_assessments_insert on public.quality_stakeholder_assessments
  for insert with check (quality_manages_interested_parties(organization_id));
create policy quality_stakeholder_assessments_update on public.quality_stakeholder_assessments
  for update using (quality_manages_interested_parties(organization_id))
  with check (quality_manages_interested_parties(organization_id));

create policy quality_stakeholder_requirements_insert on public.quality_stakeholder_requirements
  for insert with check (quality_manages_interested_parties(organization_id));
create policy quality_stakeholder_requirements_update on public.quality_stakeholder_requirements
  for update using (quality_manages_interested_parties(organization_id))
  with check (quality_manages_interested_parties(organization_id));

create policy quality_stakeholder_requirement_processes_insert on public.quality_stakeholder_requirement_processes
  for insert with check (quality_manages_interested_parties(organization_id));
create policy quality_stakeholder_requirement_processes_update on public.quality_stakeholder_requirement_processes
  for update using (quality_manages_interested_parties(organization_id))
  with check (quality_manages_interested_parties(organization_id));

create policy quality_stakeholder_strategies_insert on public.quality_stakeholder_strategies
  for insert with check (quality_manages_interested_parties(organization_id));
create policy quality_stakeholder_strategies_update on public.quality_stakeholder_strategies
  for update using (quality_manages_interested_parties(organization_id))
  with check (quality_manages_interested_parties(organization_id));

create policy quality_stakeholder_strategy_requirements_insert on public.quality_stakeholder_strategy_requirements
  for insert with check (quality_manages_interested_parties(organization_id));
create policy quality_stakeholder_strategy_requirements_update on public.quality_stakeholder_strategy_requirements
  for update using (quality_manages_interested_parties(organization_id))
  with check (quality_manages_interested_parties(organization_id));

create policy quality_stakeholder_reviews_insert on public.quality_stakeholder_reviews
  for insert with check (quality_manages_interested_parties(organization_id));
-- Sin politica de UPDATE: una revision es un hecho. El disparador lo bloquea
-- ademas, porque una politica se relaja de un `alter` y un disparador obliga a
-- pensarlo.


-- Privilegios de tabla. Sin DELETE: no hay politica que lo permita y tampoco
-- privilegio que lo intente. Dos capas para lo mismo, a proposito.
--
-- SE REVOCA TAMBIEN A `authenticated`, y no es redundante: Supabase tiene un
-- `alter default privileges` que concede TODO —incluido `delete`— a los cuatro
-- roles sobre cada tabla nueva. Un `revoke ... from public, anon` deja intacto
-- ese privilegio, asi que sin esta linea la unica barrera contra el borrado
-- seria la ausencia de politica. Se comprobo mirando `pg_default_acl`.
revoke all on table public.quality_stakeholder_categories            from public, anon, authenticated;
revoke all on table public.quality_stakeholder_groups                from public, anon, authenticated;
revoke all on table public.quality_stakeholder_assessments           from public, anon, authenticated;
revoke all on table public.quality_stakeholder_requirements          from public, anon, authenticated;
revoke all on table public.quality_stakeholder_requirement_processes from public, anon, authenticated;
revoke all on table public.quality_stakeholder_strategies            from public, anon, authenticated;
revoke all on table public.quality_stakeholder_strategy_requirements from public, anon, authenticated;
revoke all on table public.quality_stakeholder_reviews               from public, anon, authenticated;

grant select, insert, update on table public.quality_stakeholder_categories            to authenticated;
grant select, insert, update on table public.quality_stakeholder_groups                to authenticated;
grant select, insert, update on table public.quality_stakeholder_assessments           to authenticated;
grant select, insert, update on table public.quality_stakeholder_requirements          to authenticated;
grant select, insert, update on table public.quality_stakeholder_requirement_processes to authenticated;
grant select, insert, update on table public.quality_stakeholder_strategies            to authenticated;
grant select, insert, update on table public.quality_stakeholder_strategy_requirements to authenticated;
grant select, insert           on table public.quality_stakeholder_reviews             to authenticated;


-- ============================================================================
-- 12 · LA SEMILLA DE CATEGORÍAS (PI-06)
-- ----------------------------------------------------------------------------
-- Quince, no sectoriales, TODAS editables y desactivables. Ninguna
-- obligatoria: una consultora de tres personas no tiene «comunidad del
-- entorno» y no debe verse obligada a justificar por que no la tiene.
--
-- Clientes y Usuarios van separados —quien paga no siempre es quien usa— y
-- Autoridades y Entes reguladores tambien: una alcaldia y una superintendencia
-- no piden lo mismo.
--
-- IDEMPOTENTE: si la empresa ya tiene categorias, devuelve 0 y no toca nada.
-- Mismo patron que `quality_seed_competency_levels`.
-- ============================================================================

create or replace function public.quality_seed_stakeholder_categories(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not quality_manages_interested_parties(p_organization_id) then
    raise exception 'No tienes permiso para configurar las categorias de partes interesadas.'
      using errcode = '42501';
  end if;

  select count(*) into v_n from quality_stakeholder_categories
   where organization_id = p_organization_id;
  if v_n > 0 then
    return 0;
  end if;

  insert into quality_stakeholder_categories
    (organization_id, code, name, description, sort_order) values
    (p_organization_id, 'customers', 'Clientes',
     'Quien compra o contrata el producto o el servicio.', 10),
    (p_organization_id, 'users', 'Usuarios',
     'Quien lo usa, que no siempre es quien lo paga.', 20),
    (p_organization_id, 'workers', 'Trabajadores',
     'Las personas que hacen el trabajo, como colectivo.', 30),
    (p_organization_id, 'owners', 'Propietarios y accionistas',
     'Quien aporta el capital y espera resultados de el.', 40),
    (p_organization_id, 'suppliers', 'Proveedores',
     'Quien suministra bienes o servicios que entran en el proceso.', 50),
    (p_organization_id, 'contractors', 'Contratistas',
     'Quien ejecuta trabajo en nombre de la organizacion.', 60),
    (p_organization_id, 'authorities', 'Autoridades',
     'Administraciones con potestad sobre la actividad: municipio, ambiental, laboral.', 70),
    (p_organization_id, 'regulators', 'Entes reguladores',
     'Organismos que dictan y vigilan reglas del sector. No es lo mismo que una autoridad territorial.', 80),
    (p_organization_id, 'community', 'Comunidad',
     'El entorno donde opera la organizacion: vecindario, territorio.', 90),
    (p_organization_id, 'partners', 'Aliados',
     'Socios, distribuidores y colaboradores con intereses compartidos.', 100),
    (p_organization_id, 'academia', 'Academia',
     'Universidades, centros de formacion e investigacion.', 110),
    (p_organization_id, 'certification_bodies', 'Organismos de certificacion y acreditacion',
     'Quien certifica, acredita o audita de forma independiente.', 120),
    (p_organization_id, 'insurers', 'Aseguradoras',
     'Quien cubre riesgos de la organizacion y pone condiciones para hacerlo.', 130),
    (p_organization_id, 'financial', 'Entidades financieras',
     'Bancos y financiadores con requisitos sobre la operacion.', 140),
    (p_organization_id, 'other', 'Otros',
     'Cualquier parte interesada que no encaje en las anteriores. Si se llena, faltan categorias.', 900);

  return 15;
end;
$$;

revoke all on function public.quality_seed_stakeholder_categories(uuid) from public, anon;
grant execute on function public.quality_seed_stakeholder_categories(uuid) to authenticated;

comment on function public.quality_seed_stakeholder_categories(uuid) is
  'QUALITY-12.3B1 · PI-06 · Siembra las 15 categorias iniciales de una empresa. Idempotente: si ya hay alguna, devuelve 0. Todas editables y desactivables.';


-- ============================================================================
-- 13 · REVERSIÓN
-- ----------------------------------------------------------------------------
--   drop function if exists public.quality_seed_stakeholder_categories(uuid);
--   drop table if exists public.quality_stakeholder_reviews;
--   drop table if exists public.quality_stakeholder_strategy_requirements;
--   drop table if exists public.quality_stakeholder_strategies;
--   drop table if exists public.quality_stakeholder_requirement_processes;
--   drop table if exists public.quality_stakeholder_requirements;
--   drop table if exists public.quality_stakeholder_assessments;
--   drop table if exists public.quality_stakeholder_groups;
--   drop table if exists public.quality_stakeholder_categories;
--   drop function if exists public.quality_stakeholder_strategy_requirement_guard();
--   drop function if exists public.quality_stakeholder_requirement_origin_guard();
--   drop function if exists public.quality_stakeholder_history_guard();
--   drop function if exists public.quality_manages_interested_parties(uuid);
--
-- En orden de dependencia y sin `cascade`: si algo depende de una de estas
-- tablas, el borrado debe fallar y decirlo, no arrastrarlo.
--
-- Las ocho nacen vacias: revertir antes de que nadie registre nada no pierde
-- nada. Despues, si.
-- ============================================================================
