-- ============================================================================
-- 0123 · QUALITY-06 · Personas, cargos, competencias, desarrollo y conocimiento
-- ----------------------------------------------------------------------------
-- Trazaloop Quality administra de las personas SOLO lo que el sistema de
-- gestion necesita. No es nomina, no es salud ocupacional, no es un sistema
-- disciplinario y no es vigilancia. Esa frontera se sostiene en el esquema:
-- aqui no hay salario, ni cuenta bancaria, ni informacion medica, ni datos
-- sensibles que el SGC no use.
--
-- LAS CUATRO DISTINCIONES QUE ESTA MIGRACION EXISTE PARA PROTEGER
--
--   CARGO != PERSONA != USUARIO
--     El cargo es el rol estructural y responde de forma permanente. La
--     persona es el ser humano que lo ocupa durante un periodo. El usuario es
--     una identidad autenticada de Trazaloop. Un cargo puede existir sin
--     titular; una persona puede trabajar sin login; y un usuario puede
--     existir antes de que alguien lo vincule a una ficha de persona.
--
--   COMPETENCIA != DESEMPENO
--     Ser competente es poder hacer el trabajo. El desempeno es como fue el
--     periodo. Fundirlos convierte la matriz de competencias en una
--     calificacion laboral, que es justo lo que PC-06 prohibe.
--
--   ASISTENCIA != APRENDIZAJE != COMPETENCIA != EFICACIA
--     Asistir a un curso no es aprender; aprobar una prueba no es ser
--     competente; y ser competente no demuestra que la accion sirvio para
--     algo. Son cuatro afirmaciones distintas y cada una tiene su registro.
--
--   PORTADOR != DUENO DEL CONOCIMIENTO
--     El conocimiento pertenece a la organizacion. Una persona lo PORTA. Por
--     eso un conocimiento critico con un solo portador produce una senal de
--     continuidad y no una etiqueta sobre esa persona.
--
-- REUTILIZAR ANTES QUE CREAR
--
-- QUALITY-01 ya construyo los cargos y sus asignaciones; 0116/0121 el motor
-- transversal de tareas, alertas, eventos, decisiones y referencias. Aqui no
-- se crea un segundo catalogo de cargos ni una segunda bandeja: se AMPLIA lo
-- que existe, de forma aditiva.
--
-- APPEND-ONLY: 0112 a 0122 no se editan.
-- ============================================================================

set search_path = public;


-- ============================================================================
-- 1 · UNIDADES ORGANIZACIONALES
-- ----------------------------------------------------------------------------
-- PC-02 · El organigrama se DERIVA de datos estructurados. Hasta ahora la
-- unidad era un texto libre en el cargo (`quality_positions.org_unit`), que
-- sirve para escribir "Calidad" pero no para dibujar una jerarquia ni para
-- preguntar que cargos cuelgan de Operaciones.
--
-- Una empresa pequena puede funcionar con UNA unidad y varios cargos: la
-- jerarquia es opcional, no un requisito burocratico.
-- ============================================================================

create table public.quality_org_units (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,

  code             text,
  name             text not null,
  description      text,

  -- Jerarquia opcional. `null` = unidad raiz.
  parent_id        uuid,

  is_active        boolean not null default true,

  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_org_units_org_id_uniq unique (organization_id, id),
  constraint quality_org_units_name_not_blank check (length(trim(name)) > 0),
  -- MDR-42 · FK COMPUESTA: una unidad no puede colgar de otra empresa.
  constraint quality_org_units_parent_fk
    foreign key (organization_id, parent_id)
    references public.quality_org_units (organization_id, id) on delete restrict,
  constraint quality_org_units_not_self_parent check (parent_id is null or parent_id <> id)
);

create unique index quality_org_units_org_name_uniq
  on public.quality_org_units (organization_id, lower(name));
create unique index quality_org_units_org_code_uniq
  on public.quality_org_units (organization_id, lower(code)) where code is not null;
create index quality_org_units_parent_idx
  on public.quality_org_units (organization_id, parent_id);

comment on table public.quality_org_units is
  'QUALITY-06 · PC-02 · Unidades organizacionales con jerarquia opcional. El organigrama se deriva de aqui + cargos + asignaciones vigentes; nunca de una imagen.';

create trigger t_quality_org_units_updated
  before update on public.quality_org_units
  for each row execute function public.set_updated_at();
create trigger t_quality_org_units_org_immutable
  before update on public.quality_org_units
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_org_units_force_created_by
  before insert on public.quality_org_units
  for each row execute function public.force_created_by();
create trigger t_audit_quality_org_units
  after insert or update or delete on public.quality_org_units
  for each row execute function public.audit_row_change();

-- Un ciclo en la jerarquia (A cuelga de B y B de A) haria que el organigrama
-- no termine nunca de dibujarse. Se impide al escribir, no al leer.
create or replace function public.quality_org_unit_no_cycle()
returns trigger
language plpgsql
as $$
declare
  v_ancestor uuid := new.parent_id;
  v_guard    integer := 0;
begin
  while v_ancestor is not null loop
    if v_ancestor = new.id then
      raise exception 'Una unidad no puede colgar de si misma ni de una de sus dependientes.';
    end if;
    v_guard := v_guard + 1;
    if v_guard > 64 then
      raise exception 'La jerarquia de unidades es demasiado profunda o tiene un ciclo.';
    end if;
    select parent_id into v_ancestor
      from quality_org_units
     where id = v_ancestor and organization_id = new.organization_id;
  end loop;
  return new;
end;
$$;

create trigger t_quality_org_units_no_cycle
  before insert or update on public.quality_org_units
  for each row execute function public.quality_org_unit_no_cycle();


-- ============================================================================
-- 2 · CARGOS · evolucion, no sustitucion
-- ----------------------------------------------------------------------------
-- PC-03 · El cargo ya existe desde 0112 con su ciclo de vida (0113, 0119), su
-- borrado seguro en borrador (0119) y su propiedad sobre procesos, documentos,
-- indicadores y riesgos. Nada de eso se toca: se le anaden la unidad a la que
-- pertenece, el cargo del que depende y si es critico para la continuidad.
-- ============================================================================

alter table public.quality_positions
  add column if not exists org_unit_id        uuid,
  add column if not exists parent_position_id uuid,
  -- PC-10/PC-20 · Un cargo critico sin titular es una senal de continuidad,
  -- igual que un conocimiento critico con un solo portador.
  add column if not exists is_critical        boolean not null default false;

alter table public.quality_positions
  add constraint quality_positions_org_unit_fk
    foreign key (organization_id, org_unit_id)
    references public.quality_org_units (organization_id, id) on delete restrict;

alter table public.quality_positions
  add constraint quality_positions_parent_fk
    foreign key (organization_id, parent_position_id)
    references public.quality_positions (organization_id, id) on delete restrict;

alter table public.quality_positions
  add constraint quality_positions_not_self_parent
    check (parent_position_id is null or parent_position_id <> id);

create index if not exists quality_positions_org_unit_idx
  on public.quality_positions (organization_id, org_unit_id);

comment on column public.quality_positions.org_unit_id is
  'QUALITY-06 · Unidad organizacional. Convive con el texto libre `org_unit` de 0112, que queda como dato historico.';
comment on column public.quality_positions.is_critical is
  'QUALITY-06 · PC-10 · Cargo critico para la continuidad. Sin titular vigente genera senal, no una no conformidad.';


-- ----------------------------------------------------------------------------
-- 2.1 · VERSIONES DE PERFIL DE CARGO
-- ----------------------------------------------------------------------------
-- PC-23 · Cambiar hoy el perfil de un cargo NO puede reescribir el pasado. Si
-- en 2025 el cargo exigia nivel 2 y hoy exige 3, una evaluacion de 2025 seguia
-- cumpliendo entonces: convertirla retroactivamente en incumplida seria
-- fabricar un hallazgo que nunca existio.
--
-- La version es la unidad temporal del perfil. Los requisitos de competencia
-- cuelgan de ELLA, no del cargo, y por eso la verdad historica sale sola.
-- ----------------------------------------------------------------------------

create table public.quality_position_versions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  position_id      uuid not null,

  version_number   integer not null,
  status           text not null default 'draft',

  purpose          text,
  scope            text,
  authority        text,
  education        text,
  experience       text,
  change_note      text,

  effective_from   date,
  effective_to     date,
  published_by     uuid references public.profiles (id),
  published_at     timestamptz,

  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_position_versions_org_id_uniq unique (organization_id, id),
  constraint quality_position_versions_uniq unique (position_id, version_number),
  constraint quality_position_versions_number_check check (version_number >= 1),
  constraint quality_position_versions_status_check
    check (status in ('draft', 'published', 'superseded')),
  constraint quality_position_versions_period_check
    check (effective_to is null or effective_from is null or effective_to >= effective_from),
  -- Una version publicada TIENE fecha de vigencia: sin ella no se puede saber
  -- que perfil regia en marzo.
  constraint quality_position_versions_published_fields_check
    check (status = 'draft' or (published_at is not null and effective_from is not null)),
  constraint quality_position_versions_position_fk
    foreign key (organization_id, position_id)
    references public.quality_positions (organization_id, id) on delete cascade
);

create index quality_position_versions_position_idx
  on public.quality_position_versions (organization_id, position_id, version_number desc);
-- Un cargo tiene como maximo UN borrador abierto: dos borradores compitiendo
-- es la forma de perder trabajo sin darse cuenta.
create unique index quality_position_versions_single_draft
  on public.quality_position_versions (position_id) where status = 'draft';

comment on table public.quality_position_versions is
  'QUALITY-06 · PC-23 · Perfil del cargo, versionado. Los requisitos de competencia cuelgan de la version, de modo que cambiar el perfil no reescribe lo que se exigia antes.';

create trigger t_quality_position_versions_updated
  before update on public.quality_position_versions
  for each row execute function public.set_updated_at();
create trigger t_quality_position_versions_org_immutable
  before update on public.quality_position_versions
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_position_versions_force_created_by
  before insert on public.quality_position_versions
  for each row execute function public.force_created_by();
create trigger t_audit_quality_position_versions
  after insert or update or delete on public.quality_position_versions
  for each row execute function public.audit_row_change();


-- ----------------------------------------------------------------------------
-- 2.2 · FUNCIONES DEL CARGO
-- ----------------------------------------------------------------------------
-- PC-04 · Las funciones son estructuradas y pueden apuntar a un proceso. Un
-- unico campo de texto con todas las responsabilidades no permite preguntar
-- "que cargos participan en Compras", que es exactamente lo que una auditoria
-- pregunta.
-- ----------------------------------------------------------------------------

create table public.quality_position_functions (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  position_version_id uuid not null,

  description         text not null,
  function_kind       text not null default 'responsibility',
  process_id          uuid,
  position_order      integer not null default 1,

  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint quality_position_functions_org_id_uniq unique (organization_id, id),
  constraint quality_position_functions_desc_not_blank check (length(trim(description)) > 0),
  constraint quality_position_functions_kind_check
    check (function_kind in ('responsibility', 'authority', 'activity')),
  constraint quality_position_functions_version_fk
    foreign key (organization_id, position_version_id)
    references public.quality_position_versions (organization_id, id) on delete cascade,
  constraint quality_position_functions_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete restrict
);

create index quality_position_functions_version_idx
  on public.quality_position_functions (organization_id, position_version_id, position_order);
create index quality_position_functions_process_idx
  on public.quality_position_functions (organization_id, process_id);

comment on table public.quality_position_functions is
  'QUALITY-06 · PC-04 · Funciones estructuradas de una VERSION del cargo, con enlace opcional al proceso donde se ejercen.';

create trigger t_quality_position_functions_updated
  before update on public.quality_position_functions
  for each row execute function public.set_updated_at();
create trigger t_quality_position_functions_org_immutable
  before update on public.quality_position_functions
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_position_functions_force_created_by
  before insert on public.quality_position_functions
  for each row execute function public.force_created_by();


-- ============================================================================
-- 3 · PERSONAS
-- ----------------------------------------------------------------------------
-- PC-05 · La persona organizacional y el usuario de Trazaloop son entidades
-- DISTINTAS.
--
-- Hasta 0122 la unica forma de decir "Ana ocupa este cargo" era senalar un
-- `profiles.id`, es decir, una cuenta con login. Eso deja fuera a la mayor
-- parte de una planta: el operario que trabaja todos los dias y no entra
-- nunca a la plataforma no podia ser titular de nada, y su competencia no
-- podia registrarse.
--
-- LO QUE ESTA TABLA NO TIENE, Y ES DELIBERADO
--
-- Sin salario, sin cuenta bancaria, sin informacion medica, sin religion, sin
-- orientacion sexual, sin informacion familiar, sin historial disciplinario.
-- No estan "pendientes": no pertenecen al sistema de gestion. Anadir una
-- columna aqui exige justificar para que la usa el SGC.
-- ============================================================================

create table public.quality_people (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  full_name         text not null,
  -- Codigo interno de empleado SI la organizacion lo usa. Opcional a proposito.
  employee_code     text,
  work_email        text,

  -- PC-05 · Vinculo OPCIONAL con una cuenta de Trazaloop. Una persona puede no
  -- tener login; una cuenta puede existir sin ficha de persona.
  profile_id        uuid references public.profiles (id) on delete set null,

  -- Estado de la relacion con la organizacion, en terminos del SGC.
  relationship      text not null default 'employee',
  status            text not null default 'active',

  -- Fechas relevantes para el sistema de gestion (no para nomina).
  joined_on         date,
  left_on           date,
  notes             text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_people_org_id_uniq unique (organization_id, id),
  constraint quality_people_name_not_blank check (length(trim(full_name)) > 0),
  constraint quality_people_relationship_check
    check (relationship in ('employee', 'contractor', 'temporary', 'intern', 'external')),
  constraint quality_people_status_check
    check (status in ('active', 'inactive', 'former')),
  constraint quality_people_period_check
    check (left_on is null or joined_on is null or left_on >= joined_on),
  -- Una persona que ya no esta TIENE fecha de salida: sin ella no se puede
  -- reconstruir quien estaba en marzo.
  constraint quality_people_former_has_date
    check (status <> 'former' or left_on is not null)
);

create unique index quality_people_org_employee_code_uniq
  on public.quality_people (organization_id, lower(employee_code)) where employee_code is not null;
-- Una cuenta de Trazaloop se vincula a UNA sola persona dentro de la empresa:
-- dos fichas apuntando al mismo usuario es como se duplica un historial.
create unique index quality_people_org_profile_uniq
  on public.quality_people (organization_id, profile_id) where profile_id is not null;
create index quality_people_org_status_idx
  on public.quality_people (organization_id, status);

comment on table public.quality_people is
  'QUALITY-06 · PC-01/PC-05 · Persona organizacional, con lo minimo que el SGC necesita. No es nomina: sin salario, sin datos bancarios, sin informacion medica ni disciplinaria.';
comment on column public.quality_people.profile_id is
  'PC-05 · Vinculo OPCIONAL con una cuenta de Trazaloop. Persona y usuario son entidades distintas: ni la persona necesita login ni el usuario necesita ficha.';

create trigger t_quality_people_updated
  before update on public.quality_people
  for each row execute function public.set_updated_at();
create trigger t_quality_people_org_immutable
  before update on public.quality_people
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_people_force_created_by
  before insert on public.quality_people
  for each row execute function public.force_created_by();
create trigger t_audit_quality_people
  after insert or update or delete on public.quality_people
  for each row execute function public.audit_row_change();


-- ----------------------------------------------------------------------------
-- 3.1 · ASIGNACIONES · el cargo lo ocupa una PERSONA
-- ----------------------------------------------------------------------------
-- La tabla de 0112 se conserva entera —sus filas, sus identificadores y su
-- historia— y aprende a apuntar a una persona.
--
-- `profile_id` deja de ser obligatorio: era la unica forma de nombrar a
-- alguien y por eso excluia a quien no tiene cuenta. Ahora basta con una de
-- las dos referencias, y lo normal sera la persona.
-- ----------------------------------------------------------------------------

alter table public.quality_position_assignments
  add column if not exists person_id uuid;

alter table public.quality_position_assignments
  alter column profile_id drop not null;

alter table public.quality_position_assignments
  add constraint quality_position_assignments_person_fk
    foreign key (organization_id, person_id)
    references public.quality_people (organization_id, id) on delete restrict;

alter table public.quality_position_assignments
  add constraint quality_position_assignments_actor_present
    check (person_id is not null or profile_id is not null);

create index if not exists quality_position_assignments_person_idx
  on public.quality_position_assignments (organization_id, person_id);

-- §17 · Varias personas pueden ocupar el MISMO cargo a la vez: tres
-- operarios, dos auditores. El titular principal sigue siendo unico y se
-- modela EXPLICITAMENTE con el tipo `holder` (indice unico de 0112); los demas
-- son `co_holder`. Nadie tiene que adivinar quien manda mirando el primero de
-- una lista.
alter table public.quality_position_assignments
  drop constraint quality_position_assignments_type_check;
alter table public.quality_position_assignments
  add constraint quality_position_assignments_type_check
    check (assignment_type in ('holder', 'co_holder', 'acting', 'delegate'));

comment on column public.quality_position_assignments.person_id is
  'QUALITY-06 · PC-03/PC-05 · La persona que ocupa el cargo. `profile_id` queda para el historico de 0112 y para cuando la persona tiene cuenta.';
comment on column public.quality_position_assignments.assignment_type is
  'QUALITY-06 · `holder` es el titular principal y es unico vigente (indice de 0112). `co_holder` permite varios ocupantes simultaneos sin ambiguedad sobre quien es el principal.';

-- ----------------------------------------------------------------------------
-- 3.2 · BACKFILL · las asignaciones existentes reciben su persona
-- ----------------------------------------------------------------------------
-- Sin esto, el historial de QUALITY-01 quedaria mudo en el modelo nuevo: las
-- asignaciones seguirian nombrando cuentas y las consultas por persona no
-- encontrarian nada. Se crea UNA persona por cada cuenta que hoy ocupa un
-- cargo, con su nombre real, y se enlaza.
-- ----------------------------------------------------------------------------

insert into public.quality_people (organization_id, full_name, work_email, profile_id, relationship, status)
select distinct on (a.organization_id, a.profile_id)
       a.organization_id,
       coalesce(nullif(trim(p.full_name), ''), p.email, 'Persona sin nombre'),
       p.email,
       a.profile_id,
       'employee',
       'active'
  from public.quality_position_assignments a
  join public.profiles p on p.id = a.profile_id
 where a.profile_id is not null
 order by a.organization_id, a.profile_id, a.created_at
on conflict do nothing;

update public.quality_position_assignments a
   set person_id = pe.id
  from public.quality_people pe
 where a.person_id is null
   and a.profile_id is not null
   and pe.organization_id = a.organization_id
   and pe.profile_id = a.profile_id;


-- ============================================================================
-- 4 · COMPETENCIAS
-- ----------------------------------------------------------------------------
-- PC-06 · COMPETENCIA no es DESEMPENO. Ser competente es poder hacer el
-- trabajo; el desempeno es como fue el periodo. Por eso viven en tablas
-- distintas y ninguna calcula a la otra.
--
-- La competencia es REUTILIZABLE: "Auditoria interna" es una sola, la exijan
-- tres cargos o quince. No existe "la competencia de Juan".
-- ============================================================================

create table public.quality_competencies (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,

  code             text,
  name             text not null,
  description      text,
  category         text,

  is_active        boolean not null default true,

  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_competencies_org_id_uniq unique (organization_id, id),
  constraint quality_competencies_name_not_blank check (length(trim(name)) > 0)
);

create unique index quality_competencies_org_name_uniq
  on public.quality_competencies (organization_id, lower(name));
create unique index quality_competencies_org_code_uniq
  on public.quality_competencies (organization_id, lower(code)) where code is not null;

comment on table public.quality_competencies is
  'QUALITY-06 · Catalogo REUTILIZABLE de competencias. Una competencia es de la organizacion, no de una persona.';

create trigger t_quality_competencies_updated
  before update on public.quality_competencies
  for each row execute function public.set_updated_at();
create trigger t_quality_competencies_org_immutable
  before update on public.quality_competencies
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_competencies_force_created_by
  before insert on public.quality_competencies
  for each row execute function public.force_created_by();
create trigger t_audit_quality_competencies
  after insert or update or delete on public.quality_competencies
  for each row execute function public.audit_row_change();


-- ----------------------------------------------------------------------------
-- 4.1 · NIVELES · la escala la define la empresa
-- ----------------------------------------------------------------------------
-- No se cablea "1 conoce / 2 con supervision / 3 autonomo / 4 forma a otros".
-- Es una escala razonable y es la que se sembrara por defecto, pero una
-- organizacion puede tener tres niveles o cinco, y una escala impuesta obliga
-- a mentir al registrar.
-- ----------------------------------------------------------------------------

create table public.quality_competency_levels (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,

  level_value      integer not null,
  label            text not null,
  description      text,

  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_competency_levels_org_id_uniq unique (organization_id, id),
  constraint quality_competency_levels_value_check check (level_value >= 0),
  constraint quality_competency_levels_label_not_blank check (length(trim(label)) > 0)
);

create unique index quality_competency_levels_org_value_uniq
  on public.quality_competency_levels (organization_id, level_value);

comment on table public.quality_competency_levels is
  'QUALITY-06 · Escala de competencia CONFIGURABLE por empresa. `level_value` ordena; la etiqueta la pone quien la usa.';

create trigger t_quality_competency_levels_updated
  before update on public.quality_competency_levels
  for each row execute function public.set_updated_at();
create trigger t_quality_competency_levels_org_immutable
  before update on public.quality_competency_levels
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_competency_levels_force_created_by
  before insert on public.quality_competency_levels
  for each row execute function public.force_created_by();


-- ----------------------------------------------------------------------------
-- 4.2 · COMPETENCIA REQUERIDA
-- ----------------------------------------------------------------------------
-- PC-16 · Se exige desde una VERSION de cargo o desde un proceso. Y cuelga de
-- la version, no del cargo: por eso subir hoy el nivel exigido de 2 a 3 no
-- convierte en incumplida una evaluacion de 2025. La verdad historica no se
-- calcula: se lee de donde ya estaba (PC-23).
-- ----------------------------------------------------------------------------

create table public.quality_competency_requirements (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,

  competency_id       uuid not null,
  -- Se exige desde UNA de las dos: la version del cargo o el proceso.
  position_version_id uuid,
  process_id          uuid,

  required_level      integer not null,
  is_mandatory        boolean not null default true,
  note                text,

  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint quality_competency_requirements_org_id_uniq unique (organization_id, id),
  constraint quality_competency_requirements_target_check
    check ((position_version_id is not null)::int + (process_id is not null)::int = 1),
  constraint quality_competency_requirements_level_check check (required_level >= 0),
  constraint quality_competency_requirements_competency_fk
    foreign key (organization_id, competency_id)
    references public.quality_competencies (organization_id, id) on delete restrict,
  constraint quality_competency_requirements_version_fk
    foreign key (organization_id, position_version_id)
    references public.quality_position_versions (organization_id, id) on delete cascade,
  constraint quality_competency_requirements_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete restrict
);

create unique index quality_competency_requirements_version_uniq
  on public.quality_competency_requirements (position_version_id, competency_id)
  where position_version_id is not null;
create unique index quality_competency_requirements_process_uniq
  on public.quality_competency_requirements (process_id, competency_id)
  where process_id is not null;

comment on table public.quality_competency_requirements is
  'QUALITY-06 · PC-16/PC-23 · Competencia EXIGIDA por una version de cargo o por un proceso. Cuelga de la version para que el requisito historico se conserve solo.';

create trigger t_quality_competency_requirements_updated
  before update on public.quality_competency_requirements
  for each row execute function public.set_updated_at();
create trigger t_quality_competency_requirements_org_immutable
  before update on public.quality_competency_requirements
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_competency_requirements_force_created_by
  before insert on public.quality_competency_requirements
  for each row execute function public.force_created_by();


-- ----------------------------------------------------------------------------
-- 4.3 · COMPETENCIA DEMOSTRADA
-- ----------------------------------------------------------------------------
-- PC-06 · Una persona no es competente porque alguien lo escriba: lo es porque
-- hay una DECISION formal, fechada, tomada por una persona, apoyada en
-- evidencia. Cada evaluacion es un hecho con fecha; no se sobrescribe.
-- ----------------------------------------------------------------------------

create table public.quality_person_competencies (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,

  person_id          uuid not null,
  competency_id      uuid not null,

  demonstrated_level integer not null,
  assessed_on        date not null default current_date,
  -- Como se demostro. No es lo mismo "lo dijo" que "se observo trabajando".
  method             text not null default 'observation',
  rationale          text,

  -- La decision formal es HUMANA (PC-07). El sistema puede sugerir; no decide.
  decided_by         uuid references public.profiles (id),
  status             text not null default 'valid',

  -- Cuando la evaluacion deja de considerarse vigente. Distinto del
  -- vencimiento de una evidencia concreta (PC-24).
  valid_until        date,
  superseded_by      uuid,

  created_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint quality_person_competencies_org_id_uniq unique (organization_id, id),
  constraint quality_person_competencies_level_check check (demonstrated_level >= 0),
  constraint quality_person_competencies_method_check
    check (method in ('education', 'experience', 'certification', 'observation',
                      'practical_assessment', 'training', 'performance_evidence', 'other')),
  constraint quality_person_competencies_status_check
    check (status in ('valid', 'superseded', 'revoked')),
  constraint quality_person_competencies_person_fk
    foreign key (organization_id, person_id)
    references public.quality_people (organization_id, id) on delete restrict,
  constraint quality_person_competencies_competency_fk
    foreign key (organization_id, competency_id)
    references public.quality_competencies (organization_id, id) on delete restrict,
  constraint quality_person_competencies_superseded_fk
    foreign key (organization_id, superseded_by)
    references public.quality_person_competencies (organization_id, id) on delete set null
);

create index quality_person_competencies_person_idx
  on public.quality_person_competencies (organization_id, person_id, assessed_on desc);
create index quality_person_competencies_competency_idx
  on public.quality_person_competencies (organization_id, competency_id);

comment on table public.quality_person_competencies is
  'QUALITY-06 · PC-06 · Competencia DEMOSTRADA: un hecho fechado con su metodo, su evidencia y una decision humana. Nunca se sobrescribe; se supersede.';

create trigger t_quality_person_competencies_updated
  before update on public.quality_person_competencies
  for each row execute function public.set_updated_at();
create trigger t_quality_person_competencies_org_immutable
  before update on public.quality_person_competencies
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_person_competencies_force_created_by
  before insert on public.quality_person_competencies
  for each row execute function public.force_created_by();
create trigger t_audit_quality_person_competencies
  after insert or update or delete on public.quality_person_competencies
  for each row execute function public.audit_row_change();


-- ----------------------------------------------------------------------------
-- 4.4 · EVIDENCIA DE COMPETENCIA
-- ----------------------------------------------------------------------------
-- PC-24 · Una certificacion puede vencer. Que venza obliga a REVISAR; no
-- convierte automaticamente a nadie en incompetente. Son dos afirmaciones
-- distintas: EVIDENCIA VENCIDA y DECISION FORMAL DE COMPETENCIA.
--
-- El archivo en si vive donde ya viven los archivos de la plataforma; aqui se
-- registra la evidencia y su vigencia, mas la referencia transversal cuando la
-- haya. No se crea un segundo almacenamiento de personas.
-- ----------------------------------------------------------------------------

create table public.quality_competency_evidence (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,

  person_competency_id  uuid not null,

  evidence_kind         text not null,
  title                 text not null,
  issuer                text,
  issued_on             date,
  -- `null` = no vence. Es un estado normal, no un dato faltante.
  expires_on            date,
  reference_note        text,

  -- Enlace al motor transversal cuando la evidencia ya existe como documento.
  trazadoc_document_id  uuid,

  status                text not null default 'valid',

  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint quality_competency_evidence_org_id_uniq unique (organization_id, id),
  constraint quality_competency_evidence_title_not_blank check (length(trim(title)) > 0),
  constraint quality_competency_evidence_kind_check
    check (evidence_kind in ('education', 'experience', 'certification', 'observation',
                             'practical_assessment', 'training', 'performance_evidence', 'other')),
  constraint quality_competency_evidence_status_check
    check (status in ('valid', 'expired', 'revoked')),
  constraint quality_competency_evidence_period_check
    check (expires_on is null or issued_on is null or expires_on >= issued_on),
  constraint quality_competency_evidence_person_competency_fk
    foreign key (organization_id, person_competency_id)
    references public.quality_person_competencies (organization_id, id) on delete cascade,
  constraint quality_competency_evidence_document_fk
    foreign key (organization_id, trazadoc_document_id)
    references public.trazadoc_documents (organization_id, id) on delete set null
);

create index quality_competency_evidence_expiry_idx
  on public.quality_competency_evidence (organization_id, expires_on)
  where expires_on is not null and status = 'valid';

comment on table public.quality_competency_evidence is
  'QUALITY-06 · PC-24 · Evidencia con vigencia. Que una evidencia venza obliga a revisar; NO declara incompetente a nadie por si solo.';

create trigger t_quality_competency_evidence_updated
  before update on public.quality_competency_evidence
  for each row execute function public.set_updated_at();
create trigger t_quality_competency_evidence_org_immutable
  before update on public.quality_competency_evidence
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_competency_evidence_force_created_by
  before insert on public.quality_competency_evidence
  for each row execute function public.force_created_by();


-- ============================================================================
-- 5 · DESARROLLO
-- ----------------------------------------------------------------------------
-- PC-08 · El dominio se llama DESARROLLO, no capacitacion. La formacion es UN
-- tipo de desarrollo; tambien lo son la practica supervisada, la mentoria, la
-- rotacion, el coaching y el autoestudio.
--
-- PC-17 · Y no todo hueco de competencia se cierra con un curso. Llamar
-- "capacitacion" a todo el dominio empuja a inscribir gente en cursos que no
-- resuelven nada.
-- ============================================================================

create table public.quality_development_needs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,

  title            text not null,
  description      text,

  -- De donde nace. Se conserva la referencia para poder responder "por que
  -- estabamos formando a esta persona en marzo".
  origin_kind      text not null default 'manual',
  person_id        uuid,
  position_id      uuid,
  competency_id    uuid,
  origin_note      text,

  priority         text not null default 'normal',
  status           text not null default 'open',

  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_development_needs_org_id_uniq unique (organization_id, id),
  constraint quality_development_needs_title_not_blank check (length(trim(title)) > 0),
  constraint quality_development_needs_origin_check
    check (origin_kind in ('competency_gap', 'new_position', 'process_change', 'document_change',
                           'audit', 'risk', 'evaluation', 'technology_change', 'lesson_learned',
                           'manual')),
  constraint quality_development_needs_priority_check
    check (priority in ('low', 'normal', 'high', 'critical')),
  constraint quality_development_needs_status_check
    check (status in ('open', 'planned', 'in_progress', 'closed', 'discarded')),
  constraint quality_development_needs_person_fk
    foreign key (organization_id, person_id)
    references public.quality_people (organization_id, id) on delete restrict,
  constraint quality_development_needs_position_fk
    foreign key (organization_id, position_id)
    references public.quality_positions (organization_id, id) on delete restrict,
  constraint quality_development_needs_competency_fk
    foreign key (organization_id, competency_id)
    references public.quality_competencies (organization_id, id) on delete restrict
);

create index quality_development_needs_person_idx
  on public.quality_development_needs (organization_id, person_id, status);

comment on table public.quality_development_needs is
  'QUALITY-06 · PC-17 · Necesidad de desarrollo con su ORIGEN. Un hueco de competencia puede resolverse con practica, mentoria o rotacion; no obliga a un curso.';

create trigger t_quality_development_needs_updated
  before update on public.quality_development_needs
  for each row execute function public.set_updated_at();
create trigger t_quality_development_needs_org_immutable
  before update on public.quality_development_needs
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_development_needs_force_created_by
  before insert on public.quality_development_needs
  for each row execute function public.force_created_by();


-- PC-14 · Plan ANUAL formal, con actualizacion continua: congelar enero y
-- bloquear el resto del ano convierte el plan en un tramite.
create table public.quality_development_plans (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,

  year             integer not null,
  title            text not null,
  objective        text,
  status           text not null default 'draft',

  approved_by      uuid references public.profiles (id),
  approved_at      timestamptz,

  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_development_plans_org_id_uniq unique (organization_id, id),
  constraint quality_development_plans_year_check check (year between 2000 and 2200),
  constraint quality_development_plans_title_not_blank check (length(trim(title)) > 0),
  constraint quality_development_plans_status_check
    check (status in ('draft', 'active', 'closed'))
);

create unique index quality_development_plans_org_year_uniq
  on public.quality_development_plans (organization_id, year);

comment on table public.quality_development_plans is
  'QUALITY-06 · PC-14 · Plan anual de desarrollo. Se aprueba y sigue admitiendo items durante el ano, cada uno con su fecha y su origen.';

create trigger t_quality_development_plans_updated
  before update on public.quality_development_plans
  for each row execute function public.set_updated_at();
create trigger t_quality_development_plans_org_immutable
  before update on public.quality_development_plans
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_development_plans_force_created_by
  before insert on public.quality_development_plans
  for each row execute function public.force_created_by();


-- El PLAN dice que se pretende desarrollar; la ACTIVIDAD es lo que ocurrio.
-- Mezclarlos hace imposible responder "se planeo y no se hizo".
create table public.quality_development_plan_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,

  plan_id          uuid not null,
  need_id          uuid,

  title            text not null,
  development_kind text not null default 'training',
  person_id        uuid,
  position_id      uuid,
  competency_id    uuid,

  target_date      date,
  status           text not null default 'planned',
  -- Se conserva cuando se anadio al plan: es lo que permite distinguir lo
  -- planeado en enero de lo incorporado en septiembre (PC-14).
  added_on         date not null default current_date,
  added_reason     text,

  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_development_plan_items_org_id_uniq unique (organization_id, id),
  constraint quality_development_plan_items_title_not_blank check (length(trim(title)) > 0),
  constraint quality_development_plan_items_kind_check
    check (development_kind in ('training', 'mentoring', 'supervised_practice', 'coaching',
                                'rotation', 'self_study', 'experience', 'induction', 'other')),
  constraint quality_development_plan_items_status_check
    check (status in ('planned', 'in_progress', 'done', 'cancelled')),
  constraint quality_development_plan_items_plan_fk
    foreign key (organization_id, plan_id)
    references public.quality_development_plans (organization_id, id) on delete cascade,
  constraint quality_development_plan_items_need_fk
    foreign key (organization_id, need_id)
    references public.quality_development_needs (organization_id, id) on delete set null,
  constraint quality_development_plan_items_person_fk
    foreign key (organization_id, person_id)
    references public.quality_people (organization_id, id) on delete restrict,
  constraint quality_development_plan_items_position_fk
    foreign key (organization_id, position_id)
    references public.quality_positions (organization_id, id) on delete restrict,
  constraint quality_development_plan_items_competency_fk
    foreign key (organization_id, competency_id)
    references public.quality_competencies (organization_id, id) on delete restrict
);

create index quality_development_plan_items_plan_idx
  on public.quality_development_plan_items (organization_id, plan_id);

comment on table public.quality_development_plan_items is
  'QUALITY-06 · PC-08/PC-14 · Item del plan. `development_kind` deja constancia de que la formacion es UNA opcion entre varias.';

create trigger t_quality_development_plan_items_updated
  before update on public.quality_development_plan_items
  for each row execute function public.set_updated_at();
create trigger t_quality_development_plan_items_org_immutable
  before update on public.quality_development_plan_items
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_development_plan_items_force_created_by
  before insert on public.quality_development_plan_items
  for each row execute function public.force_created_by();


-- ----------------------------------------------------------------------------
-- 5.1 · ACTIVIDADES Y PARTICIPACION
-- ----------------------------------------------------------------------------

create table public.quality_learning_activities (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,

  plan_item_id     uuid,
  title            text not null,
  activity_kind    text not null default 'course',
  provider         text,
  description      text,

  starts_on        date,
  ends_on          date,
  duration_hours   numeric(6,2),
  status           text not null default 'planned',

  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_learning_activities_org_id_uniq unique (organization_id, id),
  constraint quality_learning_activities_title_not_blank check (length(trim(title)) > 0),
  constraint quality_learning_activities_kind_check
    check (activity_kind in ('course', 'workshop', 'mentoring', 'supervised_practice', 'coaching',
                             'self_study', 'rotation', 'induction', 'other')),
  constraint quality_learning_activities_status_check
    check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  constraint quality_learning_activities_period_check
    check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint quality_learning_activities_plan_item_fk
    foreign key (organization_id, plan_item_id)
    references public.quality_development_plan_items (organization_id, id) on delete set null
);

create index quality_learning_activities_plan_item_idx
  on public.quality_learning_activities (organization_id, plan_item_id);

comment on table public.quality_learning_activities is
  'QUALITY-06 · PC-08 · La actividad EJECUTADA. El plan dice que se pretende; esto es lo que ocurrio.';

create trigger t_quality_learning_activities_updated
  before update on public.quality_learning_activities
  for each row execute function public.set_updated_at();
create trigger t_quality_learning_activities_org_immutable
  before update on public.quality_learning_activities
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_learning_activities_force_created_by
  before insert on public.quality_learning_activities
  for each row execute function public.force_created_by();


-- PC-15 · ASISTENCIA != APRENDIZAJE. Las dos columnas estan separadas a
-- proposito: una persona puede asistir al 100% y no demostrar nada, y esa
-- combinacion tiene que poder registrarse sin forzar la mano.
create table public.quality_learning_participants (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,

  activity_id         uuid not null,
  person_id           uuid not null,

  attendance_status   text not null default 'registered',
  attendance_note     text,

  -- Evaluacion del APRENDIZAJE, cuando corresponda. `not_evaluated` es un
  -- estado legitimo: no toda actividad se evalua.
  learning_result     text not null default 'not_evaluated',
  learning_method     text,
  learning_note       text,
  evaluated_on        date,

  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint quality_learning_participants_org_id_uniq unique (organization_id, id),
  constraint quality_learning_participants_attendance_check
    check (attendance_status in ('registered', 'attended', 'partial', 'absent', 'cancelled')),
  constraint quality_learning_participants_learning_check
    check (learning_result in ('not_evaluated', 'pending', 'passed', 'not_passed')),
  constraint quality_learning_participants_activity_fk
    foreign key (organization_id, activity_id)
    references public.quality_learning_activities (organization_id, id) on delete cascade,
  constraint quality_learning_participants_person_fk
    foreign key (organization_id, person_id)
    references public.quality_people (organization_id, id) on delete restrict
);

create unique index quality_learning_participants_uniq
  on public.quality_learning_participants (activity_id, person_id);

comment on table public.quality_learning_participants is
  'QUALITY-06 · PC-15 · Asistencia y aprendizaje en columnas DISTINTAS. Asistir no es aprender, y aprobar una prueba no es ser competente.';

create trigger t_quality_learning_participants_updated
  before update on public.quality_learning_participants
  for each row execute function public.set_updated_at();
create trigger t_quality_learning_participants_org_immutable
  before update on public.quality_learning_participants
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_learning_participants_force_created_by
  before insert on public.quality_learning_participants
  for each row execute function public.force_created_by();


-- PC-09/PC-15 · EFICACIA: la cuarta capa. No pregunta si asistio ni si
-- aprendio, sino si la accion SIRVIO para lo que se hizo. Un resultado
-- "no eficaz" se conserva: si despues se hace otra accion, es OTRA accion.
create table public.quality_learning_effectiveness_reviews (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,

  activity_id         uuid,
  plan_item_id        uuid,
  person_id           uuid,

  -- El criterio se declara ANTES de juzgar; si no, se acaba justificando el
  -- resultado que salio.
  criterion           text not null,
  method              text not null default 'observation',
  -- Cuando el criterio es un indicador, se REFERENCIA; no se copian valores.
  indicator_id        uuid,

  result              text not null default 'pending',
  observation         text,
  reviewed_on         date,
  reviewed_by         uuid references public.profiles (id),

  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint quality_learning_effectiveness_org_id_uniq unique (organization_id, id),
  constraint quality_learning_effectiveness_criterion_not_blank
    check (length(trim(criterion)) > 0),
  constraint quality_learning_effectiveness_target_check
    check (activity_id is not null or plan_item_id is not null),
  constraint quality_learning_effectiveness_method_check
    check (method in ('observation', 'practical_assessment', 'indicator', 'audit',
                      'process_performance', 'evidence', 'other')),
  constraint quality_learning_effectiveness_result_check
    check (result in ('pending', 'effective', 'partially_effective', 'not_effective')),
  constraint quality_learning_effectiveness_decided_fields
    check (result = 'pending' or (reviewed_on is not null)),
  constraint quality_learning_effectiveness_activity_fk
    foreign key (organization_id, activity_id)
    references public.quality_learning_activities (organization_id, id) on delete cascade,
  constraint quality_learning_effectiveness_plan_item_fk
    foreign key (organization_id, plan_item_id)
    references public.quality_development_plan_items (organization_id, id) on delete cascade,
  constraint quality_learning_effectiveness_person_fk
    foreign key (organization_id, person_id)
    references public.quality_people (organization_id, id) on delete restrict,
  constraint quality_learning_effectiveness_indicator_fk
    foreign key (organization_id, indicator_id)
    references public.quality_indicators (organization_id, id) on delete set null
);

create index quality_learning_effectiveness_activity_idx
  on public.quality_learning_effectiveness_reviews (organization_id, activity_id);

comment on table public.quality_learning_effectiveness_reviews is
  'QUALITY-06 · PC-09/PC-15 · Eficacia: si la accion produjo el resultado esperado. Es la cuarta capa, distinta de asistencia, aprendizaje y competencia.';

create trigger t_quality_learning_effectiveness_updated
  before update on public.quality_learning_effectiveness_reviews
  for each row execute function public.set_updated_at();
create trigger t_quality_learning_effectiveness_org_immutable
  before update on public.quality_learning_effectiveness_reviews
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_learning_effectiveness_force_created_by
  before insert on public.quality_learning_effectiveness_reviews
  for each row execute function public.force_created_by();
create trigger t_audit_quality_learning_effectiveness
  after insert or update or delete on public.quality_learning_effectiveness_reviews
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 6 · DESEMPENO
-- ----------------------------------------------------------------------------
-- PC-06 · COMPETENCIA != DESEMPENO. Una persona puede ser competente y estar
-- rindiendo mal (por el proceso, por la carga, por las herramientas), y puede
-- rendir bien sin serlo todavia. Por eso el desempeno vive en tablas propias
-- y NUNCA escribe en `quality_person_competencies`.
--
-- PC-28 · Aqui no hay rankings automaticos, ni listas de "peores", ni un
-- numero unico que ordene personas. La evaluacion se guarda con su criterio y
-- su contexto; el sistema no promedia gente.
-- ============================================================================

create table public.quality_performance_cycles (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,

  name             text not null,
  period_start     date not null,
  period_end       date not null,
  purpose          text,
  status           text not null default 'draft',

  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_performance_cycles_org_id_uniq unique (organization_id, id),
  constraint quality_performance_cycles_name_not_blank check (length(trim(name)) > 0),
  constraint quality_performance_cycles_period_check check (period_end >= period_start),
  constraint quality_performance_cycles_status_check
    check (status in ('draft', 'open', 'closed'))
);

comment on table public.quality_performance_cycles is
  'QUALITY-06 · PC-13 · Ciclo de evaluacion de desempeno. Separado de competencia: evaluar el rendimiento no cambia la competencia declarada.';

create trigger t_quality_performance_cycles_updated
  before update on public.quality_performance_cycles
  for each row execute function public.set_updated_at();
create trigger t_quality_performance_cycles_org_immutable
  before update on public.quality_performance_cycles
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_performance_cycles_force_created_by
  before insert on public.quality_performance_cycles
  for each row execute function public.force_created_by();


create table public.quality_performance_evaluations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,

  cycle_id         uuid not null,
  person_id        uuid not null,
  -- El cargo que ocupaba CUANDO se evaluo. Si manana cambia de cargo, la
  -- evaluacion sigue diciendo contra que se evaluo (MDR-33).
  position_id      uuid,
  evaluator_person_id uuid,

  evaluated_on     date,
  summary          text,
  -- El contexto es parte del registro, no un adorno: un desempeno bajo con
  -- una herramienta averiada no es el mismo hecho que un desempeno bajo sin
  -- impedimentos.
  context_note     text,
  status           text not null default 'draft',

  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_performance_evaluations_org_id_uniq unique (organization_id, id),
  constraint quality_performance_evaluations_status_check
    check (status in ('draft', 'submitted', 'acknowledged', 'closed')),
  constraint quality_performance_evaluations_closed_fields
    check (status in ('draft', 'submitted') or evaluated_on is not null),
  constraint quality_performance_evaluations_cycle_fk
    foreign key (organization_id, cycle_id)
    references public.quality_performance_cycles (organization_id, id) on delete cascade,
  constraint quality_performance_evaluations_person_fk
    foreign key (organization_id, person_id)
    references public.quality_people (organization_id, id) on delete restrict,
  constraint quality_performance_evaluations_position_fk
    foreign key (organization_id, position_id)
    references public.quality_positions (organization_id, id) on delete restrict,
  constraint quality_performance_evaluations_evaluator_fk
    foreign key (organization_id, evaluator_person_id)
    references public.quality_people (organization_id, id) on delete restrict
);

create unique index quality_performance_evaluations_cycle_person_uniq
  on public.quality_performance_evaluations (cycle_id, person_id);
create index quality_performance_evaluations_person_idx
  on public.quality_performance_evaluations (organization_id, person_id);

comment on table public.quality_performance_evaluations is
  'QUALITY-06 · PC-06/PC-28 · Evaluacion de desempeno con contexto. No produce ranking ni escribe competencia.';

create trigger t_quality_performance_evaluations_updated
  before update on public.quality_performance_evaluations
  for each row execute function public.set_updated_at();
create trigger t_quality_performance_evaluations_org_immutable
  before update on public.quality_performance_evaluations
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_performance_evaluations_force_created_by
  before insert on public.quality_performance_evaluations
  for each row execute function public.force_created_by();
create trigger t_audit_quality_performance_evaluations
  after insert or update or delete on public.quality_performance_evaluations
  for each row execute function public.audit_row_change();


create table public.quality_performance_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,

  evaluation_id    uuid not null,
  -- Contra que se evalua: una funcion del cargo, una competencia o un
  -- criterio escrito a mano. La competencia se REFERENCIA para poder leer la
  -- evaluacion, nunca para reescribirla.
  subject_kind     text not null default 'criterion',
  criterion        text not null,
  competency_id    uuid,
  position_function_id uuid,

  result           text not null default 'meets',
  observation      text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_performance_items_org_id_uniq unique (organization_id, id),
  constraint quality_performance_items_criterion_not_blank check (length(trim(criterion)) > 0),
  constraint quality_performance_items_subject_check
    check (subject_kind in ('criterion', 'competency', 'position_function')),
  constraint quality_performance_items_result_check
    check (result in ('exceeds', 'meets', 'partially_meets', 'does_not_meet', 'not_applicable')),
  constraint quality_performance_items_evaluation_fk
    foreign key (organization_id, evaluation_id)
    references public.quality_performance_evaluations (organization_id, id) on delete cascade,
  constraint quality_performance_items_competency_fk
    foreign key (organization_id, competency_id)
    references public.quality_competencies (organization_id, id) on delete restrict,
  constraint quality_performance_items_function_fk
    foreign key (organization_id, position_function_id)
    references public.quality_position_functions (organization_id, id) on delete set null
);

create index quality_performance_items_evaluation_idx
  on public.quality_performance_items (organization_id, evaluation_id);

comment on table public.quality_performance_items is
  'QUALITY-06 · PC-06 · Linea de evaluacion. Puede referenciar una competencia, pero evaluar aqui NO modifica la competencia declarada de la persona.';

create trigger t_quality_performance_items_updated
  before update on public.quality_performance_items
  for each row execute function public.set_updated_at();
create trigger t_quality_performance_items_org_immutable
  before update on public.quality_performance_items
  for each row execute function public.prevent_organization_id_change();


-- ----------------------------------------------------------------------------
-- 6.1 · POBLACION APLICABLE
-- ----------------------------------------------------------------------------
-- PC-13 · El ciclo anual aplica al "personal aplicable", no necesariamente a
-- todos. La poblacion se declara: quien esta dentro del ciclo se decide antes
-- de evaluar, y queda escrito. Sin esta tabla, "aplicable" acabaria siendo
-- "los que alguien alcanzo a evaluar".
create table public.quality_performance_cycle_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,

  cycle_id         uuid not null,
  person_id        uuid not null,
  inclusion_reason text,

  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),

  constraint quality_performance_cycle_members_org_id_uniq unique (organization_id, id),
  constraint quality_performance_cycle_members_cycle_fk
    foreign key (organization_id, cycle_id)
    references public.quality_performance_cycles (organization_id, id) on delete cascade,
  constraint quality_performance_cycle_members_person_fk
    foreign key (organization_id, person_id)
    references public.quality_people (organization_id, id) on delete restrict
);

create unique index quality_performance_cycle_members_uniq
  on public.quality_performance_cycle_members (cycle_id, person_id);

comment on table public.quality_performance_cycle_members is
  'QUALITY-06 · PC-13 · Poblacion aplicable del ciclo. Declarada explicitamente; no se infiere de quien acabo teniendo evaluacion.';

create trigger t_quality_performance_cycle_members_org_immutable
  before update on public.quality_performance_cycle_members
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_performance_cycle_members_force_created_by
  before insert on public.quality_performance_cycle_members
  for each row execute function public.force_created_by();


-- ============================================================================
-- 7 · CONOCIMIENTO
-- ----------------------------------------------------------------------------
-- PC-18 · El conocimiento es un objeto estructurado, no un `archivo.pdf`. Un
-- procedimiento especial de calibracion, la configuracion historica de una
-- maquina o el trato con un proveedor critico existen aunque nadie los haya
-- escrito nunca.
--
-- PC-19 · Y la persona que lo tiene es HOLDER, no OWNER. El conocimiento
-- pertenece a la organizacion; por eso la columna se llama `holder` y por eso
-- perder a la persona no borra el elemento.
-- ============================================================================

create table public.quality_knowledge_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,

  title            text not null,
  description      text,
  knowledge_kind   text not null default 'explicit',
  criticality      text not null default 'medium',
  criticality_note text,

  -- Donde vive, cuando vive escrito. Un elemento puede estar documentado, a
  -- medias o solo en la cabeza de alguien; las tres situaciones son legitimas
  -- y se distinguen.
  documentation_status text not null default 'undocumented',

  process_id       uuid,
  status           text not null default 'active',

  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_knowledge_items_org_id_uniq unique (organization_id, id),
  constraint quality_knowledge_items_title_not_blank check (length(trim(title)) > 0),
  constraint quality_knowledge_items_kind_check
    check (knowledge_kind in ('explicit', 'tacit', 'mixed')),
  constraint quality_knowledge_items_criticality_check
    check (criticality in ('low', 'medium', 'high', 'critical')),
  constraint quality_knowledge_items_documentation_check
    check (documentation_status in ('undocumented', 'partially_documented', 'documented')),
  constraint quality_knowledge_items_status_check
    check (status in ('active', 'retired')),
  constraint quality_knowledge_items_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete set null
);

create index quality_knowledge_items_org_criticality_idx
  on public.quality_knowledge_items (organization_id, criticality, status);

comment on table public.quality_knowledge_items is
  'QUALITY-06 · PC-18 · Elemento de conocimiento: explicito, tacito o mixto. Existe aunque no haya documento.';

create trigger t_quality_knowledge_items_updated
  before update on public.quality_knowledge_items
  for each row execute function public.set_updated_at();
create trigger t_quality_knowledge_items_org_immutable
  before update on public.quality_knowledge_items
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_knowledge_items_force_created_by
  before insert on public.quality_knowledge_items
  for each row execute function public.force_created_by();


-- PC-19 · La relacion se llama HOLDER a proposito. `primary_holder` existe
-- para poder decir quien responde primero SIN que eso signifique propiedad, y
-- sin que la interfaz tenga que adivinarlo con un First() (§17).
create table public.quality_knowledge_holders (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,

  knowledge_item_id  uuid not null,
  person_id          uuid not null,

  holder_level       text not null default 'holder',
  is_primary_holder  boolean not null default false,
  since_on           date,
  until_on           date,
  note               text,

  created_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint quality_knowledge_holders_org_id_uniq unique (organization_id, id),
  constraint quality_knowledge_holders_level_check
    check (holder_level in ('holder', 'reference', 'learning')),
  constraint quality_knowledge_holders_period_check
    check (until_on is null or since_on is null or until_on >= since_on),
  constraint quality_knowledge_holders_item_fk
    foreign key (organization_id, knowledge_item_id)
    references public.quality_knowledge_items (organization_id, id) on delete cascade,
  constraint quality_knowledge_holders_person_fk
    foreign key (organization_id, person_id)
    references public.quality_people (organization_id, id) on delete restrict
);

-- Un mismo elemento puede tener varios holders vigentes; lo que no puede
-- tener es dos "primero responde" a la vez.
create unique index quality_knowledge_holders_primary_uniq
  on public.quality_knowledge_holders (knowledge_item_id)
  where is_primary_holder and until_on is null;
create index quality_knowledge_holders_item_idx
  on public.quality_knowledge_holders (organization_id, knowledge_item_id);
create index quality_knowledge_holders_person_idx
  on public.quality_knowledge_holders (organization_id, person_id);

comment on table public.quality_knowledge_holders is
  'QUALITY-06 · PC-19 · La persona SOSTIENE el conocimiento; no lo posee. `is_primary_holder` es explicito para no inferir el titular por orden de fila.';

create trigger t_quality_knowledge_holders_updated
  before update on public.quality_knowledge_holders
  for each row execute function public.set_updated_at();
create trigger t_quality_knowledge_holders_org_immutable
  before update on public.quality_knowledge_holders
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_knowledge_holders_force_created_by
  before insert on public.quality_knowledge_holders
  for each row execute function public.force_created_by();


-- PC-20 · SENAL de continuidad, no riesgo formal. La senal dice
-- «conocimiento critico concentrado en una sola persona», nunca «Juan es un
-- riesgo». Convertirla en un riesgo del SGC es una decision humana explicita,
-- y por eso `risk_id` se rellena solo cuando alguien lo decide (§45).
create table public.quality_knowledge_signals (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,

  knowledge_item_id  uuid not null,
  signal_kind        text not null,
  detail             text,
  status             text not null default 'open',

  -- Trazabilidad de la decision humana de escalar.
  risk_id            uuid,
  promoted_by        uuid references public.profiles (id),
  promoted_at        timestamptz,

  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  resolved_at        timestamptz,

  constraint quality_knowledge_signals_org_id_uniq unique (organization_id, id),
  constraint quality_knowledge_signals_kind_check
    check (signal_kind in ('single_holder', 'no_holder', 'holder_leaving',
                           'undocumented_critical', 'transfer_overdue')),
  constraint quality_knowledge_signals_status_check
    check (status in ('open', 'resolved', 'dismissed')),
  constraint quality_knowledge_signals_promoted_fields
    check ((risk_id is null) = (promoted_at is null)),
  constraint quality_knowledge_signals_item_fk
    foreign key (organization_id, knowledge_item_id)
    references public.quality_knowledge_items (organization_id, id) on delete cascade,
  constraint quality_knowledge_signals_risk_fk
    foreign key (organization_id, risk_id)
    references public.quality_risks (organization_id, id) on delete set null
);

-- Idempotencia del barrido (§51): una senal abierta por elemento y tipo. El
-- segundo barrido actualiza `last_seen_at`, no crea una fila nueva.
create unique index quality_knowledge_signals_open_uniq
  on public.quality_knowledge_signals (knowledge_item_id, signal_kind)
  where status = 'open';

comment on table public.quality_knowledge_signals is
  'QUALITY-06 · PC-20/§45 · Senal de continuidad. NO es un riesgo formal: promoverla a riesgo es una decision humana registrada en `risk_id`/`promoted_by`.';

create trigger t_quality_knowledge_signals_org_immutable
  before update on public.quality_knowledge_signals
  for each row execute function public.prevent_organization_id_change();


create table public.quality_knowledge_transfer_plans (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,

  knowledge_item_id  uuid not null,
  title              text not null,
  source_person_id   uuid,
  method             text not null default 'accompaniment',
  objective          text,

  target_date        date,
  status             text not null default 'draft',

  -- La verificacion es un acto aparte de "hicimos las actividades": haberlas
  -- hecho no demuestra que el conocimiento haya pasado.
  verified_on        date,
  verification_note  text,
  verified_by        uuid references public.profiles (id),

  created_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint quality_knowledge_transfer_plans_org_id_uniq unique (organization_id, id),
  constraint quality_knowledge_transfer_plans_title_not_blank check (length(trim(title)) > 0),
  constraint quality_knowledge_transfer_plans_method_check
    check (method in ('accompaniment', 'mentoring', 'documentation', 'training',
                      'supervised_practice', 'rotation', 'other')),
  constraint quality_knowledge_transfer_plans_status_check
    check (status in ('draft', 'active', 'completed', 'cancelled')),
  constraint quality_knowledge_transfer_plans_verified_fields
    check (status <> 'completed' or verified_on is not null),
  constraint quality_knowledge_transfer_plans_item_fk
    foreign key (organization_id, knowledge_item_id)
    references public.quality_knowledge_items (organization_id, id) on delete cascade,
  constraint quality_knowledge_transfer_plans_source_fk
    foreign key (organization_id, source_person_id)
    references public.quality_people (organization_id, id) on delete restrict
);

create index quality_knowledge_transfer_plans_item_idx
  on public.quality_knowledge_transfer_plans (organization_id, knowledge_item_id, status);

comment on table public.quality_knowledge_transfer_plans is
  'QUALITY-06 · §46 · Plan de transferencia de conocimiento critico. Completarlo exige verificacion: ejecutar las actividades no demuestra que el conocimiento paso.';

create trigger t_quality_knowledge_transfer_plans_updated
  before update on public.quality_knowledge_transfer_plans
  for each row execute function public.set_updated_at();
create trigger t_quality_knowledge_transfer_plans_org_immutable
  before update on public.quality_knowledge_transfer_plans
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_knowledge_transfer_plans_force_created_by
  before insert on public.quality_knowledge_transfer_plans
  for each row execute function public.force_created_by();
create trigger t_audit_quality_knowledge_transfer_plans
  after insert or update or delete on public.quality_knowledge_transfer_plans
  for each row execute function public.audit_row_change();


create table public.quality_knowledge_transfer_items (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,

  transfer_plan_id   uuid not null,
  target_person_id   uuid,
  activity           text not null,
  due_on             date,
  status             text not null default 'pending',
  evidence_note      text,
  completed_on       date,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint quality_knowledge_transfer_items_org_id_uniq unique (organization_id, id),
  constraint quality_knowledge_transfer_items_activity_not_blank
    check (length(trim(activity)) > 0),
  constraint quality_knowledge_transfer_items_status_check
    check (status in ('pending', 'in_progress', 'done', 'cancelled')),
  constraint quality_knowledge_transfer_items_done_fields
    check (status <> 'done' or completed_on is not null),
  constraint quality_knowledge_transfer_items_plan_fk
    foreign key (organization_id, transfer_plan_id)
    references public.quality_knowledge_transfer_plans (organization_id, id) on delete cascade,
  constraint quality_knowledge_transfer_items_target_fk
    foreign key (organization_id, target_person_id)
    references public.quality_people (organization_id, id) on delete restrict
);

create index quality_knowledge_transfer_items_plan_idx
  on public.quality_knowledge_transfer_items (organization_id, transfer_plan_id);

comment on table public.quality_knowledge_transfer_items is
  'QUALITY-06 · §46 · Actividad concreta de la transferencia, con su receptor y su evidencia.';

create trigger t_quality_knowledge_transfer_items_updated
  before update on public.quality_knowledge_transfer_items
  for each row execute function public.set_updated_at();
create trigger t_quality_knowledge_transfer_items_org_immutable
  before update on public.quality_knowledge_transfer_items
  for each row execute function public.prevent_organization_id_change();


-- ----------------------------------------------------------------------------
-- 7.1 · LECCIONES APRENDIDAS
-- ----------------------------------------------------------------------------
-- PC-21 · La leccion es un objeto de gestion, no una nota al margen. Registra
-- QUE OCURRIO, QUE SE APRENDIO, DONDE APLICA y QUE SE RECOMIENDA CAMBIAR;
-- esas cuatro cosas van en columnas separadas porque colapsarlas en un
-- `description` es como se pierden las lecciones.
create table public.quality_lessons_learned (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,

  code             text,
  title            text not null,

  what_happened    text not null,
  what_was_learned text not null,
  applicable_context text,
  recommendation   text,

  origin_kind      text not null default 'manual',
  case_id          uuid,
  action_id        uuid,
  risk_id          uuid,
  process_id       uuid,

  occurred_on      date,
  status           text not null default 'draft',

  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_lessons_learned_org_id_uniq unique (organization_id, id),
  constraint quality_lessons_learned_title_not_blank check (length(trim(title)) > 0),
  constraint quality_lessons_learned_what_not_blank
    check (length(trim(what_happened)) > 0 and length(trim(what_was_learned)) > 0),
  constraint quality_lessons_learned_origin_check
    check (origin_kind in ('case', 'action', 'risk_materialized', 'audit', 'project',
                           'process', 'incident', 'improvement', 'manual')),
  constraint quality_lessons_learned_status_check
    check (status in ('draft', 'published', 'archived')),
  constraint quality_lessons_learned_case_fk
    foreign key (organization_id, case_id)
    references public.work_cases (organization_id, id) on delete set null,
  constraint quality_lessons_learned_action_fk
    foreign key (organization_id, action_id)
    references public.work_actions (organization_id, id) on delete set null,
  constraint quality_lessons_learned_risk_fk
    foreign key (organization_id, risk_id)
    references public.quality_risks (organization_id, id) on delete set null,
  constraint quality_lessons_learned_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete set null
);

create unique index quality_lessons_learned_code_uniq
  on public.quality_lessons_learned (organization_id, code)
  where code is not null;
create index quality_lessons_learned_org_status_idx
  on public.quality_lessons_learned (organization_id, status);

comment on table public.quality_lessons_learned is
  'QUALITY-06 · PC-21 · Leccion aprendida como objeto gestionado, con su origen y su contexto de aplicacion.';

create trigger t_quality_lessons_learned_updated
  before update on public.quality_lessons_learned
  for each row execute function public.set_updated_at();
create trigger t_quality_lessons_learned_org_immutable
  before update on public.quality_lessons_learned
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_lessons_learned_force_created_by
  before insert on public.quality_lessons_learned
  for each row execute function public.force_created_by();
create trigger t_audit_quality_lessons_learned
  after insert or update or delete on public.quality_lessons_learned
  for each row execute function public.audit_row_change();


-- §48 · La leccion PROPONE; no cambia nada por su cuenta. Cada propuesta vive
-- aqui con su estado, y aceptarla es un acto humano que deja constancia de
-- QUE se creo a partir de ella. Sin esta tabla, «la leccion actualizo el
-- documento» seria indistinguible de «alguien actualizo el documento».
create table public.quality_lesson_proposals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,

  lesson_id        uuid not null,
  proposal_kind    text not null,
  summary          text not null,

  -- A que apunta la propuesta, cuando ya existe el objeto.
  target_document_id   uuid,
  target_process_id    uuid,
  target_competency_id uuid,
  target_position_id   uuid,

  status           text not null default 'proposed',
  decided_by       uuid references public.profiles (id),
  decided_at       timestamptz,
  decision_note    text,

  -- Que se creo al aceptarla. Se guarda como par (tipo, id) porque el
  -- resultado puede ser una accion, una tarea, una necesidad de desarrollo o
  -- una revision documental.
  outcome_kind     text,
  outcome_id       uuid,

  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_lesson_proposals_org_id_uniq unique (organization_id, id),
  constraint quality_lesson_proposals_summary_not_blank check (length(trim(summary)) > 0),
  constraint quality_lesson_proposals_kind_check
    check (proposal_kind in ('process_change', 'document_change', 'competency_change',
                             'development_action', 'control_change', 'risk_review',
                             'improvement_action')),
  constraint quality_lesson_proposals_status_check
    check (status in ('proposed', 'accepted', 'rejected', 'implemented')),
  constraint quality_lesson_proposals_decided_fields
    check (status = 'proposed' or (decided_by is not null and decided_at is not null)),
  constraint quality_lesson_proposals_outcome_pair
    check ((outcome_kind is null) = (outcome_id is null)),
  constraint quality_lesson_proposals_outcome_kind_check
    check (outcome_kind is null or outcome_kind in ('work_action', 'work_task',
                                                    'quality_development_need',
                                                    'trazadoc_document_revision')),
  constraint quality_lesson_proposals_lesson_fk
    foreign key (organization_id, lesson_id)
    references public.quality_lessons_learned (organization_id, id) on delete cascade,
  constraint quality_lesson_proposals_document_fk
    foreign key (organization_id, target_document_id)
    references public.trazadoc_documents (organization_id, id) on delete set null,
  constraint quality_lesson_proposals_process_fk
    foreign key (organization_id, target_process_id)
    references public.quality_processes (organization_id, id) on delete set null,
  constraint quality_lesson_proposals_competency_fk
    foreign key (organization_id, target_competency_id)
    references public.quality_competencies (organization_id, id) on delete set null,
  constraint quality_lesson_proposals_position_fk
    foreign key (organization_id, target_position_id)
    references public.quality_positions (organization_id, id) on delete set null
);

create index quality_lesson_proposals_lesson_idx
  on public.quality_lesson_proposals (organization_id, lesson_id, status);

comment on table public.quality_lesson_proposals is
  'QUALITY-06 · §48 · Propuesta derivada de una leccion. Aceptarla es humano y deja registrado que se creo; nada cambia automaticamente.';

create trigger t_quality_lesson_proposals_updated
  before update on public.quality_lesson_proposals
  for each row execute function public.set_updated_at();
create trigger t_quality_lesson_proposals_org_immutable
  before update on public.quality_lesson_proposals
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_lesson_proposals_force_created_by
  before insert on public.quality_lesson_proposals
  for each row execute function public.force_created_by();


-- ============================================================================
-- 8 · ENSANCHE DE LOS MOTORES TRANSVERSALES (§51, §52, §53)
-- ----------------------------------------------------------------------------
-- Aqui NO se crean `quality_people_tasks` ni `quality_people_alerts`. Se
-- admiten los nuevos sujetos en los catalogos cerrados que ya existen. El
-- ensanche es ADITIVO: ningun valor anterior desaparece, de modo que nada de
-- QUALITY-01…05 deja de validar.
--
-- §53 · Un item del plan de desarrollo NO se convierte en `work_action`. Puede
-- generar una TAREA de ejecucion; si la situacion merece una Accion formal del
-- SGC, alguien autorizado la crea explicitamente.
-- ============================================================================

alter table public.work_tasks  drop constraint work_tasks_source_domain_check;
alter table public.work_tasks  add constraint work_tasks_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action',
                           'risk','opportunity','control',
                           'person','position','competence','development',
                           'learning','performance','knowledge','lesson'));
alter table public.work_tasks  drop constraint work_tasks_subject_type_check;
alter table public.work_tasks  add constraint work_tasks_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                          'work_case','work_action',
                          'quality_risk','quality_opportunity','quality_control',
                          'quality_person','quality_position','quality_person_competency',
                          'quality_competency_evidence','quality_development_plan_item',
                          'quality_learning_activity','quality_performance_evaluation',
                          'quality_knowledge_item','quality_knowledge_transfer_plan',
                          'quality_lesson_learned'));
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
                       'knowledge_continuity_review','lesson_proposal_decision'));

alter table public.work_alerts drop constraint work_alerts_source_domain_check;
alter table public.work_alerts add constraint work_alerts_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action',
                           'risk','opportunity','control',
                           'person','position','competence','development',
                           'learning','performance','knowledge','lesson'));
alter table public.work_alerts drop constraint work_alerts_subject_type_check;
alter table public.work_alerts add constraint work_alerts_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                          'work_case','work_action',
                          'quality_risk','quality_opportunity','quality_control',
                          'quality_person','quality_position','quality_person_competency',
                          'quality_competency_evidence','quality_development_plan_item',
                          'quality_learning_activity','quality_performance_evaluation',
                          'quality_knowledge_item','quality_knowledge_transfer_plan',
                          'quality_lesson_learned'));
alter table public.work_alerts drop constraint work_alerts_type_check;
alter table public.work_alerts add constraint work_alerts_type_check
  check (alert_type in ('document_review_requested','document_approval_requested',
                        'document_changes_requested','document_approved','document_retired',
                        'indicator_measurement_due','indicator_target_missed','objective_at_risk',
                        'case_assigned','action_assigned','action_overdue','effectiveness_due',
                        'risk_review_overdue','risk_above_appetite','risk_materialized',
                        'control_ineffective','opportunity_assigned',
                        -- §51 · vencimiento de evidencia: NO dice «persona
                        -- incompetente», dice «hay que revisar» (PC-24).
                        'competence_evidence_expiring','competence_evidence_expired',
                        'performance_evaluation_pending','development_plan_overdue',
                        'learning_effectiveness_pending','knowledge_single_holder',
                        'knowledge_transfer_overdue','critical_position_vacant'));

alter table public.work_events drop constraint work_events_source_domain_check;
alter table public.work_events add constraint work_events_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action',
                           'risk','opportunity','control',
                           'person','position','competence','development',
                           'learning','performance','knowledge','lesson'));
alter table public.work_events drop constraint work_events_subject_type_check;
alter table public.work_events add constraint work_events_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                          'work_case','work_action',
                          'quality_risk','quality_opportunity','quality_control',
                          'quality_person','quality_position','quality_person_competency',
                          'quality_competency_evidence','quality_development_plan_item',
                          'quality_learning_activity','quality_performance_evaluation',
                          'quality_knowledge_item','quality_knowledge_transfer_plan',
                          'quality_lesson_learned'));
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
                        'assignment.started','assignment.ended',
                        'position.version_published',
                        'competence.assessed','competence.evidence_expired',
                        'development.need_created','development.item_planned',
                        'learning.completed','learning.effectiveness_reviewed',
                        'performance.evaluation_closed',
                        'knowledge.holder_added','knowledge.holder_removed',
                        'knowledge.concentration_detected','knowledge.transfer_verified',
                        'lesson.published','lesson.proposal_decided'));

-- §38 · Las decisiones formales de competencia, desempeno y lecciones viven en
-- el MISMO libro que las de casos y riesgos (MDR-49): una sola historia, no
-- cuatro cuadernos paralelos.
alter table public.work_decisions drop constraint work_decisions_subject_kind_check;
alter table public.work_decisions add constraint work_decisions_subject_kind_check
  check (subject_kind in ('case','action','risk','opportunity','control',
                          'person_competency','performance_evaluation','lesson',
                          'knowledge_transfer'));
alter table public.work_decisions drop constraint work_decisions_decision_kind_check;
alter table public.work_decisions add constraint work_decisions_decision_kind_check
  check (decision_kind in ('case_opened','classification','correction_needed','cause_approved',
                           'action_planned','action_completed','effectiveness','closure','reopen',
                           'concession',
                           'risk_identified','risk_assessed','risk_treatment','risk_acceptance',
                           'risk_review','risk_materialized','control_effectiveness',
                           'opportunity_assessed','opportunity_treatment',
                           'competence_decision','competence_revocation',
                           'performance_result','lesson_proposal',
                           'knowledge_transfer_verification'));

-- §23 · La evidencia de competencia REUTILIZA el motor de referencias. No se
-- crea un segundo almacen de archivos para Personas.
alter table public.work_references drop constraint work_references_owner_kind_check;
alter table public.work_references add constraint work_references_owner_kind_check
  check (owner_kind in ('case','action','risk','opportunity','control','risk_assessment',
                        'person_competency','competency_evidence','knowledge_item',
                        'knowledge_transfer_plan','lesson','development_need',
                        'learning_activity','performance_evaluation'));
alter table public.work_references drop constraint work_references_ref_kind_check;
alter table public.work_references add constraint work_references_ref_kind_check
  check (ref_kind in ('quality_indicator','quality_measurement','quality_process',
                      'quality_process_revision','quality_process_io','trazadoc_document',
                      'trazadoc_document_revision','work_case','work_action',
                      'quality_objective','quality_risk','quality_opportunity',
                      'quality_control','quality_risk_assessment','quality_risk_materialization',
                      'quality_person','quality_position','quality_competency',
                      'quality_person_competency','quality_knowledge_item',
                      'quality_lesson_learned','quality_learning_activity'));


-- La validacion se amplia con los nuevos tipos. Se mantiene el patron de
-- QUALITY-05: cada tipo se resuelve por su nombre, sin `else` que valide una
-- cosa contra la tabla de otra.
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
revoke all on function public.work_reference_must_be_valid() from public, anon, authenticated;


-- ============================================================================
-- 9 · PERMISOS DE PERSONAS (PC-25, §56, §57, §59)
-- ----------------------------------------------------------------------------
-- La arquitectura tiene TRES roles reales: `admin`, `quality` y `consultant`.
-- No se inventa un rol «HR» que no existe: se implementa el minimo coherente
-- con lo que hay, y se falla cerrado.
--
-- Tres circulos, de mas abierto a mas cerrado:
--
--   ESTRUCTURA      unidades, cargos, perfiles, funciones, catalogo de
--                   competencias, elementos de conocimiento, lecciones.
--                   → cualquier miembro de la empresa.
--
--   FICHA DE PERSONA  personas, asignaciones, competencia demostrada,
--                   evidencia, desarrollo individual, participacion.
--                   → `admin` / `quality`, o la propia persona.
--
--   DESEMPENO       ciclos, poblacion, evaluaciones y sus lineas.
--                   → `admin` / `quality`, o la persona evaluada.
--                   El `consultant` tiene acceso general a Quality y aun asi
--                   NO ve una evaluacion individual: eso es exactamente lo
--                   que pide §59.
-- ----------------------------------------------------------------------------

create or replace function public.quality_manages_people(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_org_role(p_organization_id, array['admin', 'quality']);
$$;
revoke all on function public.quality_manages_people(uuid) from public, anon;
grant execute on function public.quality_manages_people(uuid) to authenticated;

comment on function public.quality_manages_people(uuid) is
  'QUALITY-06 · PC-25 · Quien administra fichas de personas. `consultant` queda fuera a proposito.';


-- «Yo mismo» se resuelve por el vinculo Persona↔Usuario, que es OPCIONAL: una
-- persona sin cuenta simplemente nunca es «self», y eso no rompe nada.
create or replace function public.quality_person_is_self(
  p_organization_id uuid,
  p_person_id       uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from quality_people pe
     where pe.organization_id = p_organization_id
       and pe.id = p_person_id
       and pe.profile_id = auth.uid()
  );
$$;
revoke all on function public.quality_person_is_self(uuid, uuid) from public, anon;
grant execute on function public.quality_person_is_self(uuid, uuid) to authenticated;


create or replace function public.quality_can_read_person(
  p_organization_id uuid,
  p_person_id       uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select quality_manages_people(p_organization_id)
      or quality_person_is_self(p_organization_id, p_person_id);
$$;
revoke all on function public.quality_can_read_person(uuid, uuid) from public, anon;
grant execute on function public.quality_can_read_person(uuid, uuid) to authenticated;

comment on function public.quality_can_read_person(uuid, uuid) is
  'QUALITY-06 · PC-25/§57 · Ver el organigrama no da derecho a ver la ficha. Esta funcion es la que separa los dos circulos, en la base y no en la pantalla.';


-- ============================================================================
-- 10 · VISTAS DERIVADAS
-- ----------------------------------------------------------------------------
-- PC-02 · El organigrama se GENERA. No se guarda una imagen, ni un PowerPoint,
-- ni un canvas como fuente de verdad: sale de unidades + cargos + jerarquia +
-- asignaciones vigentes, y por eso nunca puede quedar desactualizado respecto
-- de los datos.
--
-- Todas las vistas llevan `security_invoker = true`: sin eso una vista se
-- ejecuta con los permisos de su dueno y se convierte en un tunel por debajo
-- de RLS.
-- ----------------------------------------------------------------------------

create or replace view public.v_quality_position_occupants_current
with (security_invoker = true) as
select
  a.organization_id,
  a.position_id,
  a.id                as assignment_id,
  a.assignment_type,
  a.person_id,
  pe.full_name        as person_name,
  pe.employee_code,
  a.profile_id,
  a.effective_from,
  a.effective_to
from public.quality_position_assignments a
left join public.quality_people pe
  on pe.organization_id = a.organization_id
 and pe.id = a.person_id
where a.effective_from <= current_date
  and (a.effective_to is null or a.effective_to >= current_date);

comment on view public.v_quality_position_occupants_current is
  'QUALITY-06 · Ocupantes VIGENTES hoy. Para saber quien ocupaba un cargo en una fecha pasada se usa quality_position_holder_on(); esta vista no sirve para reconstruir el pasado.';


create or replace view public.v_quality_org_chart
with (security_invoker = true) as
select
  p.organization_id,
  p.id                       as position_id,
  p.code                     as position_code,
  p.name                     as position_name,
  p.is_active,
  p.is_critical,
  p.parent_position_id,
  u.id                       as org_unit_id,
  u.name                     as org_unit_name,
  u.parent_id                as org_unit_parent_id,
  -- `quality_positions.org_unit` es el texto libre que traia QUALITY-01. Se
  -- conserva como respaldo para las empresas que aun no han estructurado
  -- unidades: el organigrama sigue saliendo.
  coalesce(u.name, nullif(trim(p.org_unit), '')) as org_unit_label,
  h.holder_count,
  h.primary_holder_name
from public.quality_positions p
left join public.quality_org_units u
  on u.organization_id = p.organization_id
 and u.id = p.org_unit_id
left join lateral (
  select
    count(*) filter (where c.assignment_type in ('holder', 'co_holder')) as holder_count,
    max(c.person_name) filter (where c.assignment_type = 'holder')       as primary_holder_name
  from public.v_quality_position_occupants_current c
  where c.organization_id = p.organization_id
    and c.position_id = p.id
) h on true;

comment on view public.v_quality_org_chart is
  'QUALITY-06 · PC-02 · Organigrama DERIVADO de unidades, cargos, jerarquia y asignaciones vigentes. La representacion visual es una proyeccion de esto, nunca la fuente.';


-- PC-16/§25 · La matriz cruza PERSONAS × COMPETENCIAS mostrando requerido,
-- demostrado y brecha. Lo que NO hace es puntuar personas: no hay total, no
-- hay promedio y no hay orden por «peor». Una brecha es una diferencia entre
-- dos niveles declarados, no una nota.
create or replace view public.v_quality_competence_matrix
with (security_invoker = true) as
with current_assignments as (
  select distinct a.organization_id, a.person_id, a.position_id
    from public.quality_position_assignments a
   where a.person_id is not null
     and a.assignment_type in ('holder', 'co_holder', 'acting')
     and a.effective_from <= current_date
     and (a.effective_to is null or a.effective_to >= current_date)
),
published_version as (
  select distinct on (v.organization_id, v.position_id)
         v.organization_id, v.position_id, v.id as version_id, v.version_number
    from public.quality_position_versions v
   where v.status = 'published'
   order by v.organization_id, v.position_id, v.version_number desc
)
select
  ca.organization_id,
  ca.person_id,
  pe.full_name                as person_name,
  ca.position_id,
  pos.name                    as position_name,
  pv.version_id               as position_version_id,
  pv.version_number,
  r.competency_id,
  c.name                      as competency_name,
  r.required_level,
  r.is_mandatory,
  pc.id                       as person_competency_id,
  pc.demonstrated_level,
  pc.assessed_on,
  -- La brecha se calcula, se explica y no se guarda: si se guardara, un
  -- cambio de requisito dejaria brechas viejas mintiendo por ahi.
  greatest(r.required_level - coalesce(pc.demonstrated_level, 0), 0) as gap,
  ev.evidence_status
from current_assignments ca
join public.quality_people pe
  on pe.organization_id = ca.organization_id and pe.id = ca.person_id
join public.quality_positions pos
  on pos.organization_id = ca.organization_id and pos.id = ca.position_id
join published_version pv
  on pv.organization_id = ca.organization_id and pv.position_id = ca.position_id
join public.quality_competency_requirements r
  on r.organization_id = ca.organization_id and r.position_version_id = pv.version_id
join public.quality_competencies c
  on c.organization_id = r.organization_id and c.id = r.competency_id
left join lateral (
  select x.id, x.demonstrated_level, x.assessed_on
    from public.quality_person_competencies x
   where x.organization_id = ca.organization_id
     and x.person_id = ca.person_id
     and x.competency_id = r.competency_id
     and x.status = 'valid'
   order by x.assessed_on desc, x.created_at desc
   limit 1
) pc on true
left join lateral (
  -- PC-24 · El estado de la evidencia se informa APARTE del nivel. Una
  -- certificacion vencida no baja el nivel demostrado por su cuenta: lo que
  -- hace es pedir revision.
  select case
           when pc.id is null then 'none'
           when count(e.*) = 0 then 'none'
           when count(e.*) filter (
                  where e.status = 'valid'
                    and (e.expires_on is null or e.expires_on >= current_date)) > 0 then 'valid'
           else 'expired'
         end as evidence_status
    from public.quality_competency_evidence e
   where pc.id is not null
     and e.organization_id = ca.organization_id
     and e.person_competency_id = pc.id
) ev on true;

comment on view public.v_quality_competence_matrix is
  'QUALITY-06 · PC-16/§25/§65 · Requerido, demostrado y brecha. Sin totales, sin promedios y sin orden por persona: no es un ranking.';


-- PC-20 · Senal de continuidad, calculada. La vista cuenta holders vigentes;
-- decir «critico con un solo holder» es una observacion sobre el
-- CONOCIMIENTO, no sobre la persona.
create or replace view public.v_quality_knowledge_continuity
with (security_invoker = true) as
select
  k.organization_id,
  k.id                    as knowledge_item_id,
  k.title,
  k.knowledge_kind,
  k.criticality,
  k.documentation_status,
  k.status,
  coalesce(h.holder_count, 0) as holder_count,
  h.primary_holder_name,
  (k.status = 'active'
     and k.criticality in ('high', 'critical')
     and coalesce(h.holder_count, 0) <= 1)      as continuity_attention,
  t.open_transfer_count
from public.quality_knowledge_items k
left join lateral (
  select
    count(*)                                                        as holder_count,
    max(pe.full_name) filter (where kh.is_primary_holder)           as primary_holder_name
  from public.quality_knowledge_holders kh
  join public.quality_people pe
    on pe.organization_id = kh.organization_id and pe.id = kh.person_id
  where kh.organization_id = k.organization_id
    and kh.knowledge_item_id = k.id
    and (kh.until_on is null or kh.until_on >= current_date)
) h on true
left join lateral (
  select count(*) as open_transfer_count
    from public.quality_knowledge_transfer_plans tp
   where tp.organization_id = k.organization_id
     and tp.knowledge_item_id = k.id
     and tp.status in ('draft', 'active')
) t on true;

comment on view public.v_quality_knowledge_continuity is
  'QUALITY-06 · PC-20/§44 · Concentracion de conocimiento. La frase es «conocimiento critico concentrado», nunca «esta persona es un riesgo».';


-- ============================================================================
-- 11 · VERDAD HISTORICA (PC-11, PC-23, §54)
-- ----------------------------------------------------------------------------
-- TODAS estas funciones son `security definer`, y eso tiene una consecuencia
-- facil de pasar por alto: dentro de ellas el usuario efectivo es el DUENO de
-- la funcion, asi que las vistas `security_invoker` que consultan dejan de
-- filtrar por RLS. Una funcion que recibe `p_organization_id` desde el cliente
-- y no comprueba nada seria un tunel por debajo de todas las politicas de este
-- archivo: bastaria con pasar el identificador de otra empresa.
--
-- Por eso cada una lleva su comprobacion DELANTE, y pide lo que corresponde a
-- lo que devuelve: `is_org_member` para la estructura —quien ocupaba el cargo,
-- que perfil regia, que se exigia— y `quality_can_read_person` para lo que es
-- dato de una persona. Y ninguna dice «no puedes»: devuelven vacio, porque
-- confirmar que un identificador existe en otra empresa ya es informacion.
-- ----------------------------------------------------------------------------
-- «¿Quien ocupaba este cargo el 15/03?» no se responde mirando quien lo ocupa
-- hoy. Estas funciones son la unica forma correcta de preguntarle al pasado, y
-- existen para que ninguna pantalla se vea tentada de reconstruirlo con los
-- valores actuales.
-- ----------------------------------------------------------------------------

create or replace function public.quality_position_holders_on(
  p_organization_id uuid,
  p_position_id     uuid,
  p_on              date
)
returns table (
  assignment_id   uuid,
  assignment_type text,
  person_id       uuid,
  person_name     text,
  profile_id      uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.assignment_type, a.person_id, pe.full_name, a.profile_id
    from quality_position_assignments a
    left join quality_people pe
      on pe.organization_id = a.organization_id and pe.id = a.person_id
   where is_org_member(p_organization_id)
     and a.organization_id = p_organization_id
     and a.position_id = p_position_id
     and a.effective_from <= p_on
     and (a.effective_to is null or a.effective_to >= p_on)
   order by case a.assignment_type
              when 'holder' then 0 when 'co_holder' then 1
              when 'acting' then 2 else 3 end,
            a.effective_from;
$$;
revoke all on function public.quality_position_holders_on(uuid, uuid, date) from public, anon;
grant execute on function public.quality_position_holders_on(uuid, uuid, date) to authenticated;

comment on function public.quality_position_holders_on(uuid, uuid, date) is
  'QUALITY-06 · MDR-33/§54 · Quien ocupaba el cargo EN esa fecha. Devuelve conjunto porque un cargo puede tener varios ocupantes simultaneos.';


-- §12 · Cambiar el perfil de un cargo no reescribe el pasado: cada version
-- tiene su periodo de vigencia y la pregunta «que perfil regia» se responde
-- con el, no con la ultima publicada.
create or replace function public.quality_position_version_on(
  p_organization_id uuid,
  p_position_id     uuid,
  p_on              date
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select v.id
    from quality_position_versions v
   where is_org_member(p_organization_id)
     and v.organization_id = p_organization_id
     and v.position_id = p_position_id
     and v.status in ('published', 'superseded')
     and v.effective_from is not null
     and v.effective_from <= p_on
     and (v.effective_to is null or v.effective_to >= p_on)
   order by v.effective_from desc, v.version_number desc
   limit 1;
$$;
revoke all on function public.quality_position_version_on(uuid, uuid, date) from public, anon;
grant execute on function public.quality_position_version_on(uuid, uuid, date) to authenticated;


-- PC-23 · EL punto delicado del dominio. Subir hoy el requisito de 2 a 3 no
-- puede convertir retroactivamente en incumplida una evaluacion de 2025. El
-- requisito se lee SIEMPRE contra la version que regia en la fecha.
create or replace function public.quality_required_level_on(
  p_organization_id uuid,
  p_position_id     uuid,
  p_competency_id   uuid,
  p_on              date
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select r.required_level
    from quality_competency_requirements r
   where is_org_member(p_organization_id)
     and r.organization_id = p_organization_id
     and r.competency_id = p_competency_id
     and r.position_version_id = quality_position_version_on(p_organization_id, p_position_id, p_on)
   limit 1;
$$;
revoke all on function public.quality_required_level_on(uuid, uuid, uuid, date) from public, anon;
grant execute on function public.quality_required_level_on(uuid, uuid, uuid, date) to authenticated;

comment on function public.quality_required_level_on(uuid, uuid, uuid, date) is
  'QUALITY-06 · PC-23 · El nivel exigido EN esa fecha. Cambiar el requisito hoy no reescribe el cumplimiento de ayer.';


create or replace function public.quality_demonstrated_level_on(
  p_organization_id uuid,
  p_person_id       uuid,
  p_competency_id   uuid,
  p_on              date
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select x.demonstrated_level
    from quality_person_competencies x
   where quality_can_read_person(p_organization_id, p_person_id)
     and x.organization_id = p_organization_id
     and x.person_id = p_person_id
     and x.competency_id = p_competency_id
     and x.assessed_on <= p_on
   order by x.assessed_on desc, x.created_at desc
   limit 1;
$$;
revoke all on function public.quality_demonstrated_level_on(uuid, uuid, uuid, date) from public, anon;
grant execute on function public.quality_demonstrated_level_on(uuid, uuid, uuid, date) to authenticated;


-- ============================================================================
-- 12 · BARRIDOS (§51)
-- ----------------------------------------------------------------------------
-- Idempotentes por `dedupe_key`: el segundo barrido del mismo dia no duplica
-- nada. Y ninguno de estos avisos declara a nadie incompetente: dicen que hay
-- algo que revisar (PC-24).
-- ----------------------------------------------------------------------------

-- Un aviso sin destinatario no lo lee nadie. Los avisos del dominio Personas
-- van a quien administra personas; se elige de forma DETERMINISTA para que dos
-- barridos no se los manden a personas distintas.
create or replace function public.quality_people_notice_recipient(p_organization_id uuid)
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
revoke all on function public.quality_people_notice_recipient(uuid) from public, anon, authenticated;


create or replace function public.quality_scan_people_signals(p_organization_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alerts integer := 0;
begin
  if auth.uid() is not null then
    if p_organization_id is null then
      raise exception 'Indica sobre qué empresa quieres revisar las señales.';
    end if;
    if not is_org_member(p_organization_id) then
      raise exception 'No tienes acceso a esa empresa.';
    end if;
  end if;

  update quality_competency_evidence e
     set status = 'expired'
   where e.status = 'valid'
     and e.expires_on is not null
     and e.expires_on < current_date
     and (p_organization_id is null or e.organization_id = p_organization_id);

  with proximas as (
    select e.*, pc.person_id, pe.full_name, c.name as competency_name,
           quality_people_notice_recipient(e.organization_id) as recipient
      from quality_competency_evidence e
      join quality_person_competencies pc
        on pc.organization_id = e.organization_id and pc.id = e.person_competency_id
      join quality_people pe
        on pe.organization_id = pc.organization_id and pe.id = pc.person_id
      join quality_competencies c
        on c.organization_id = pc.organization_id and c.id = pc.competency_id
     where e.expires_on is not null
       and e.status in ('valid', 'expired')
       and e.expires_on <= current_date + 30
       and (p_organization_id is null or e.organization_id = p_organization_id)
  ), ins as (
    insert into work_alerts (organization_id, source_domain, alert_type, severity,
                             subject_type, subject_id, recipient_profile_id,
                             title, message, dedupe_key)
    select x.organization_id, 'competence',
           case when x.expires_on < current_date
                then 'competence_evidence_expired' else 'competence_evidence_expiring' end,
           case when x.expires_on < current_date then 'warning' else 'info' end,
           'quality_competency_evidence', x.id, x.recipient,
           case when x.expires_on < current_date
                then 'Evidencia vencida: ' || x.title
                else 'Evidencia por vencer: ' || x.title end,
           'Corresponde a ' || x.full_name || ' (' || x.competency_name || ') y vence el '
             || to_char(x.expires_on, 'DD/MM/YYYY')
             || '. Requiere revisión; no implica por sí solo que la persona haya dejado de ser competente.',
           'competence_evidence:' || x.id::text || ':' || x.expires_on::text
      from proximas x
     where x.recipient is not null
       and not exists (
         select 1 from work_alerts w
          where w.dedupe_key = 'competence_evidence:' || x.id::text || ':' || x.expires_on::text)
    returning 1
  )
  select count(*) into v_alerts from ins;

  insert into quality_knowledge_signals (organization_id, knowledge_item_id, signal_kind, detail)
  select k.organization_id, k.knowledge_item_id,
         case when k.holder_count = 0 then 'no_holder' else 'single_holder' end,
         case when k.holder_count = 0
              then 'Conocimiento crítico sin ninguna persona registrada como holder.'
              else 'Conocimiento crítico concentrado en una sola persona.' end
    from v_quality_knowledge_continuity k
   where k.continuity_attention
     and (p_organization_id is null or k.organization_id = p_organization_id)
  on conflict do nothing;

  update quality_knowledge_signals s
     set last_seen_at = now()
    from v_quality_knowledge_continuity k
   where s.status = 'open'
     and s.knowledge_item_id = k.knowledge_item_id
     and k.continuity_attention
     and (p_organization_id is null or s.organization_id = p_organization_id);

  update quality_knowledge_signals s
     set status = 'resolved', resolved_at = now()
    from v_quality_knowledge_continuity k
   where s.status = 'open'
     and s.signal_kind in ('single_holder', 'no_holder')
     and s.knowledge_item_id = k.knowledge_item_id
     and not k.continuity_attention
     and (p_organization_id is null or s.organization_id = p_organization_id);

  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select k.organization_id, 'knowledge', 'knowledge_single_holder', 'warning',
         'quality_knowledge_item', k.knowledge_item_id,
         quality_people_notice_recipient(k.organization_id),
         'Conocimiento crítico concentrado: ' || k.title,
         'Este conocimiento está clasificado como ' || k.criticality
           || ' y tiene ' || k.holder_count || ' persona(s) registrada(s). '
           || 'Es una señal de continuidad, no un riesgo formal ni un juicio sobre nadie.',
         'knowledge_single_holder:' || k.knowledge_item_id::text
    from v_quality_knowledge_continuity k
   where k.continuity_attention
     and quality_people_notice_recipient(k.organization_id) is not null
     and (p_organization_id is null or k.organization_id = p_organization_id)
     and not exists (
       select 1 from work_alerts w
        where w.dedupe_key = 'knowledge_single_holder:' || k.knowledge_item_id::text);

  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select p.organization_id, 'position', 'critical_position_vacant', 'warning',
         'quality_position', p.position_id,
         quality_people_notice_recipient(p.organization_id),
         'Cargo crítico sin titular: ' || p.position_name,
         'El cargo está marcado como crítico y no tiene ninguna asignación vigente.',
         'critical_position_vacant:' || p.position_id::text
    from v_quality_org_chart p
   where p.is_critical
     and p.is_active
     and coalesce(p.holder_count, 0) = 0
     and quality_people_notice_recipient(p.organization_id) is not null
     and (p_organization_id is null or p.organization_id = p_organization_id)
     and not exists (
       select 1 from work_alerts w
        where w.dedupe_key = 'critical_position_vacant:' || p.position_id::text);

  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select tp.organization_id, 'knowledge', 'knowledge_transfer_overdue', 'warning',
         'quality_knowledge_transfer_plan', tp.id,
         quality_people_notice_recipient(tp.organization_id),
         'Transferencia vencida: ' || tp.title,
         'La fecha objetivo era el ' || to_char(tp.target_date, 'DD/MM/YYYY') || ' y el plan sigue abierto.',
         'knowledge_transfer_overdue:' || tp.id::text || ':' || tp.target_date::text
    from quality_knowledge_transfer_plans tp
   where tp.status in ('draft', 'active')
     and tp.target_date is not null
     and tp.target_date < current_date
     and quality_people_notice_recipient(tp.organization_id) is not null
     and (p_organization_id is null or tp.organization_id = p_organization_id)
     and not exists (
       select 1 from work_alerts w
        where w.dedupe_key = 'knowledge_transfer_overdue:' || tp.id::text || ':' || tp.target_date::text);

  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select la.organization_id, 'learning', 'learning_effectiveness_pending', 'info',
         'quality_learning_activity', la.id,
         quality_people_notice_recipient(la.organization_id),
         'Eficacia pendiente: ' || la.title,
         'La actividad terminó el ' || to_char(coalesce(la.ends_on, current_date), 'DD/MM/YYYY')
           || ' y todavía no se ha evaluado si produjo el resultado esperado.',
         'learning_effectiveness_pending:' || la.id::text
    from quality_learning_activities la
   where la.status = 'completed'
     and quality_people_notice_recipient(la.organization_id) is not null
     and (p_organization_id is null or la.organization_id = p_organization_id)
     and not exists (
       select 1 from quality_learning_effectiveness_reviews r
        where r.activity_id = la.id and r.result <> 'pending')
     and not exists (
       select 1 from work_alerts w
        where w.dedupe_key = 'learning_effectiveness_pending:' || la.id::text);

  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select m.organization_id, 'performance', 'performance_evaluation_pending', 'info',
         'quality_person', m.person_id,
         quality_people_notice_recipient(m.organization_id),
         'Evaluación pendiente: ' || pe.full_name,
         'Forma parte de la población aplicable del ciclo «' || cy.name || '» y aún no tiene evaluación cerrada.',
         'performance_evaluation_pending:' || m.cycle_id::text || ':' || m.person_id::text
    from quality_performance_cycle_members m
    join quality_performance_cycles cy
      on cy.organization_id = m.organization_id and cy.id = m.cycle_id
    join quality_people pe
      on pe.organization_id = m.organization_id and pe.id = m.person_id
   where cy.status = 'open'
     and quality_people_notice_recipient(m.organization_id) is not null
     and (p_organization_id is null or m.organization_id = p_organization_id)
     and not exists (
       select 1 from quality_performance_evaluations ev
        where ev.cycle_id = m.cycle_id and ev.person_id = m.person_id
          and ev.status = 'closed')
     and not exists (
       select 1 from work_alerts w
        where w.dedupe_key = 'performance_evaluation_pending:' || m.cycle_id::text || ':' || m.person_id::text);

  return coalesce(v_alerts, 0);
end;
$$;
revoke all on function public.quality_scan_people_signals(uuid) from public, anon;
grant execute on function public.quality_scan_people_signals(uuid) to authenticated;

comment on function public.quality_scan_people_signals(uuid) is
  'QUALITY-06 · §51 · Barrido idempotente del dominio Personas. Ningun aviso declara a nadie incompetente ni crea un riesgo formal por su cuenta.';


-- §50/§77 · OFFBOARDING. Cerrar una asignacion no borra a nadie ni reescribe
-- lo que hizo: lo que hace es DETECTAR lo que queda descubierto. Devuelve el
-- informe; no toma ninguna decision.
create or replace function public.quality_offboarding_report(
  p_organization_id uuid,
  p_person_id       uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not quality_can_read_person(p_organization_id, p_person_id)
    then jsonb_build_object(
      'positions_left_without_holder', '[]'::jsonb,
      'knowledge_left_concentrated', '[]'::jsonb,
      'pending_transfers', '[]'::jsonb,
      'open_tasks', '[]'::jsonb)
    else jsonb_build_object(
    'positions_left_without_holder', coalesce((
      select jsonb_agg(jsonb_build_object('position_id', pos.id, 'name', pos.name,
                                          'is_critical', pos.is_critical))
        from quality_position_assignments a
        join quality_positions pos
          on pos.organization_id = a.organization_id and pos.id = a.position_id
       where a.organization_id = p_organization_id
         and a.person_id = p_person_id
         and a.assignment_type = 'holder'
         and not exists (
           select 1 from quality_position_assignments o
            where o.organization_id = a.organization_id
              and o.position_id = a.position_id
              and o.person_id is distinct from p_person_id
              and o.assignment_type in ('holder', 'co_holder', 'acting')
              and (o.effective_to is null or o.effective_to >= current_date))
    ), '[]'::jsonb),
    'knowledge_left_concentrated', coalesce((
      select jsonb_agg(jsonb_build_object('knowledge_item_id', k.knowledge_item_id,
                                          'title', k.title, 'criticality', k.criticality,
                                          'holder_count', k.holder_count))
        from v_quality_knowledge_continuity k
        join quality_knowledge_holders kh
          on kh.organization_id = k.organization_id
         and kh.knowledge_item_id = k.knowledge_item_id
         and kh.person_id = p_person_id
         and (kh.until_on is null or kh.until_on >= current_date)
       where k.organization_id = p_organization_id
         and k.criticality in ('high', 'critical')
         and k.holder_count <= 1
    ), '[]'::jsonb),
    'pending_transfers', coalesce((
      select jsonb_agg(jsonb_build_object('transfer_plan_id', tp.id, 'title', tp.title,
                                          'status', tp.status, 'target_date', tp.target_date))
        from quality_knowledge_transfer_plans tp
       where tp.organization_id = p_organization_id
         and tp.source_person_id = p_person_id
         and tp.status in ('draft', 'active')
    ), '[]'::jsonb),
    'open_tasks', coalesce((
      select jsonb_agg(jsonb_build_object('task_id', w.id, 'title', w.title, 'due_at', w.due_at))
        from work_tasks w
        join quality_people pe
          on pe.organization_id = w.organization_id and pe.profile_id = w.assignee_profile_id
       where w.organization_id = p_organization_id
         and pe.id = p_person_id
         and w.status in ('open', 'in_progress')
    ), '[]'::jsonb))
  end;
$$;
revoke all on function public.quality_offboarding_report(uuid, uuid) from public, anon;
grant execute on function public.quality_offboarding_report(uuid, uuid) to authenticated;

comment on function public.quality_offboarding_report(uuid, uuid) is
  'QUALITY-06 · §50/§77 · Que queda descubierto cuando alguien sale. Solo informa: no borra la persona, no cierra tareas y no reescribe sus actos historicos.';


-- ============================================================================
-- 13 · RLS (PC-25, §56, §57, §58, §59, §80)
-- ----------------------------------------------------------------------------
-- Deny-by-default. Cada tabla enciende RLS, declara sus politicas y ademas
-- REVOCA y vuelve a conceder los privilegios de tabla: es la leccion de 0115 y
-- 0118: una politica correcta con un GRANT heredado de mas sigue siendo un
-- agujero, porque RLS filtra filas pero no concede permisos que no existian.
--
-- La separacion de §57 se implementa AQUI, no en la interfaz: quien ve el
-- organigrama no ve la ficha, y quien ve la ficha no ve necesariamente la
-- evaluacion.
-- ----------------------------------------------------------------------------

alter table public.quality_org_units                       enable row level security;
alter table public.quality_position_versions               enable row level security;
alter table public.quality_position_functions              enable row level security;
alter table public.quality_people                          enable row level security;
alter table public.quality_competencies                    enable row level security;
alter table public.quality_competency_levels               enable row level security;
alter table public.quality_competency_requirements         enable row level security;
alter table public.quality_person_competencies             enable row level security;
alter table public.quality_competency_evidence             enable row level security;
alter table public.quality_development_needs               enable row level security;
alter table public.quality_development_plans               enable row level security;
alter table public.quality_development_plan_items          enable row level security;
alter table public.quality_learning_activities             enable row level security;
alter table public.quality_learning_participants           enable row level security;
alter table public.quality_learning_effectiveness_reviews  enable row level security;
alter table public.quality_performance_cycles              enable row level security;
alter table public.quality_performance_cycle_members       enable row level security;
alter table public.quality_performance_evaluations         enable row level security;
alter table public.quality_performance_items               enable row level security;
alter table public.quality_knowledge_items                 enable row level security;
alter table public.quality_knowledge_holders               enable row level security;
alter table public.quality_knowledge_signals               enable row level security;
alter table public.quality_knowledge_transfer_plans        enable row level security;
alter table public.quality_knowledge_transfer_items        enable row level security;
alter table public.quality_lessons_learned                 enable row level security;
alter table public.quality_lesson_proposals                enable row level security;

-- ----------------------------------------------------------------------------
-- 13.1 · CIRCULO ESTRUCTURA · lectura para cualquier miembro
-- ----------------------------------------------------------------------------
create policy quality_org_units_select on public.quality_org_units
  for select using (is_org_member(organization_id));
create policy quality_position_versions_select on public.quality_position_versions
  for select using (is_org_member(organization_id));
create policy quality_position_functions_select on public.quality_position_functions
  for select using (is_org_member(organization_id));
create policy quality_competencies_select on public.quality_competencies
  for select using (is_org_member(organization_id));
create policy quality_competency_levels_select on public.quality_competency_levels
  for select using (is_org_member(organization_id));
create policy quality_competency_requirements_select on public.quality_competency_requirements
  for select using (is_org_member(organization_id));
create policy quality_development_plans_select on public.quality_development_plans
  for select using (is_org_member(organization_id));
create policy quality_learning_activities_select on public.quality_learning_activities
  for select using (is_org_member(organization_id));
create policy quality_knowledge_items_select on public.quality_knowledge_items
  for select using (is_org_member(organization_id));
create policy quality_knowledge_holders_select on public.quality_knowledge_holders
  for select using (is_org_member(organization_id));
create policy quality_knowledge_signals_select on public.quality_knowledge_signals
  for select using (is_org_member(organization_id));
create policy quality_knowledge_transfer_plans_select on public.quality_knowledge_transfer_plans
  for select using (is_org_member(organization_id));
create policy quality_knowledge_transfer_items_select on public.quality_knowledge_transfer_items
  for select using (is_org_member(organization_id));
create policy quality_lessons_learned_select on public.quality_lessons_learned
  for select using (is_org_member(organization_id));
create policy quality_lesson_proposals_select on public.quality_lesson_proposals
  for select using (is_org_member(organization_id));
create policy quality_performance_cycles_select on public.quality_performance_cycles
  for select using (is_org_member(organization_id));

-- Escritura de estructura: el consultor externo acompana la implementacion, y
-- construir unidades, perfiles de cargo, catalogo de competencias, elementos
-- de conocimiento y lecciones es parte de eso.
create policy quality_org_units_write on public.quality_org_units
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_position_versions_write on public.quality_position_versions
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_position_functions_write on public.quality_position_functions
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_competencies_write on public.quality_competencies
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_competency_levels_write on public.quality_competency_levels
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_competency_requirements_write on public.quality_competency_requirements
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_development_plans_write on public.quality_development_plans
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_learning_activities_write on public.quality_learning_activities
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_knowledge_items_write on public.quality_knowledge_items
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_knowledge_holders_write on public.quality_knowledge_holders
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_knowledge_transfer_plans_write on public.quality_knowledge_transfer_plans
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_knowledge_transfer_items_write on public.quality_knowledge_transfer_items
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_lessons_learned_write on public.quality_lessons_learned
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_lesson_proposals_write on public.quality_lesson_proposals
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));

-- La senal de continuidad la escribe el barrido (security definer). Desde la
-- sesion solo se puede DESCARTARLA o marcar que se promovio a riesgo.
create policy quality_knowledge_signals_update on public.quality_knowledge_signals
  for update using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));

-- ----------------------------------------------------------------------------
-- 13.2 · CIRCULO FICHA DE PERSONA · `admin`/`quality`, o uno mismo
-- ----------------------------------------------------------------------------
-- PC-25 · Aqui se cae el `consultant`. Ver el organigrama no da derecho a
-- abrir la ficha, y por eso la condicion se evalua fila a fila contra la
-- persona a la que pertenece el dato, no contra la empresa.
-- ----------------------------------------------------------------------------
create policy quality_people_select on public.quality_people
  for select using (quality_can_read_person(organization_id, id));
create policy quality_people_write on public.quality_people
  for all using (quality_manages_people(organization_id))
  with check (quality_manages_people(organization_id));

create policy quality_person_competencies_select on public.quality_person_competencies
  for select using (quality_can_read_person(organization_id, person_id));
create policy quality_person_competencies_write on public.quality_person_competencies
  for all using (quality_manages_people(organization_id))
  with check (quality_manages_people(organization_id));

create policy quality_competency_evidence_select on public.quality_competency_evidence
  for select using (exists (
    select 1 from public.quality_person_competencies pc
     where pc.organization_id = quality_competency_evidence.organization_id
       and pc.id = quality_competency_evidence.person_competency_id
       and quality_can_read_person(pc.organization_id, pc.person_id)));
create policy quality_competency_evidence_write on public.quality_competency_evidence
  for all using (quality_manages_people(organization_id))
  with check (quality_manages_people(organization_id));

-- Una necesidad de desarrollo sin persona es una necesidad del CARGO o de la
-- organizacion: esa si la ve cualquier miembro. En cuanto nombra a alguien,
-- pasa al circulo de la ficha.
create policy quality_development_needs_select on public.quality_development_needs
  for select using (
    case when person_id is null then is_org_member(organization_id)
         else quality_can_read_person(organization_id, person_id) end);
create policy quality_development_needs_write on public.quality_development_needs
  for all using (quality_manages_people(organization_id))
  with check (quality_manages_people(organization_id));

create policy quality_development_plan_items_select on public.quality_development_plan_items
  for select using (
    case when person_id is null then is_org_member(organization_id)
         else quality_can_read_person(organization_id, person_id) end);
create policy quality_development_plan_items_write on public.quality_development_plan_items
  for all using (quality_manages_people(organization_id))
  with check (quality_manages_people(organization_id));

create policy quality_learning_participants_select on public.quality_learning_participants
  for select using (quality_can_read_person(organization_id, person_id));
create policy quality_learning_participants_write on public.quality_learning_participants
  for all using (quality_manages_people(organization_id))
  with check (quality_manages_people(organization_id));

create policy quality_learning_effectiveness_reviews_select on public.quality_learning_effectiveness_reviews
  for select using (
    case when person_id is null then quality_manages_people(organization_id)
         else quality_can_read_person(organization_id, person_id) end);
create policy quality_learning_effectiveness_reviews_write on public.quality_learning_effectiveness_reviews
  for all using (quality_manages_people(organization_id))
  with check (quality_manages_people(organization_id));

-- ----------------------------------------------------------------------------
-- 13.3 · CIRCULO DESEMPENO · el mas cerrado (§59)
-- ----------------------------------------------------------------------------
create policy quality_performance_cycles_write on public.quality_performance_cycles
  for all using (quality_manages_people(organization_id))
  with check (quality_manages_people(organization_id));

create policy quality_performance_cycle_members_select on public.quality_performance_cycle_members
  for select using (quality_can_read_person(organization_id, person_id));
create policy quality_performance_cycle_members_write on public.quality_performance_cycle_members
  for all using (quality_manages_people(organization_id))
  with check (quality_manages_people(organization_id));

create policy quality_performance_evaluations_select on public.quality_performance_evaluations
  for select using (quality_can_read_person(organization_id, person_id));
create policy quality_performance_evaluations_write on public.quality_performance_evaluations
  for all using (quality_manages_people(organization_id))
  with check (quality_manages_people(organization_id));

create policy quality_performance_items_select on public.quality_performance_items
  for select using (exists (
    select 1 from public.quality_performance_evaluations ev
     where ev.organization_id = quality_performance_items.organization_id
       and ev.id = quality_performance_items.evaluation_id
       and quality_can_read_person(ev.organization_id, ev.person_id)));
create policy quality_performance_items_write on public.quality_performance_items
  for all using (quality_manages_people(organization_id))
  with check (quality_manages_people(organization_id));

-- ----------------------------------------------------------------------------
-- 13.4 · PRIVILEGIOS DE TABLA
-- ----------------------------------------------------------------------------
revoke all on table public.quality_org_units                      from anon, authenticated;
revoke all on table public.quality_position_versions              from anon, authenticated;
revoke all on table public.quality_position_functions             from anon, authenticated;
revoke all on table public.quality_people                         from anon, authenticated;
revoke all on table public.quality_competencies                   from anon, authenticated;
revoke all on table public.quality_competency_levels              from anon, authenticated;
revoke all on table public.quality_competency_requirements        from anon, authenticated;
revoke all on table public.quality_person_competencies            from anon, authenticated;
revoke all on table public.quality_competency_evidence            from anon, authenticated;
revoke all on table public.quality_development_needs              from anon, authenticated;
revoke all on table public.quality_development_plans              from anon, authenticated;
revoke all on table public.quality_development_plan_items         from anon, authenticated;
revoke all on table public.quality_learning_activities            from anon, authenticated;
revoke all on table public.quality_learning_participants          from anon, authenticated;
revoke all on table public.quality_learning_effectiveness_reviews from anon, authenticated;
revoke all on table public.quality_performance_cycles             from anon, authenticated;
revoke all on table public.quality_performance_cycle_members      from anon, authenticated;
revoke all on table public.quality_performance_evaluations        from anon, authenticated;
revoke all on table public.quality_performance_items              from anon, authenticated;
revoke all on table public.quality_knowledge_items                from anon, authenticated;
revoke all on table public.quality_knowledge_holders              from anon, authenticated;
revoke all on table public.quality_knowledge_signals              from anon, authenticated;
revoke all on table public.quality_knowledge_transfer_plans       from anon, authenticated;
revoke all on table public.quality_knowledge_transfer_items       from anon, authenticated;
revoke all on table public.quality_lessons_learned                from anon, authenticated;
revoke all on table public.quality_lesson_proposals               from anon, authenticated;

grant select, insert, update, delete on table public.quality_org_units                      to authenticated;
grant select, insert, update, delete on table public.quality_position_versions              to authenticated;
grant select, insert, update, delete on table public.quality_position_functions             to authenticated;
grant select, insert, update, delete on table public.quality_people                         to authenticated;
grant select, insert, update, delete on table public.quality_competencies                   to authenticated;
grant select, insert, update, delete on table public.quality_competency_levels              to authenticated;
grant select, insert, update, delete on table public.quality_competency_requirements        to authenticated;
grant select, insert, update, delete on table public.quality_person_competencies            to authenticated;
grant select, insert, update, delete on table public.quality_competency_evidence            to authenticated;
grant select, insert, update, delete on table public.quality_development_needs              to authenticated;
grant select, insert, update, delete on table public.quality_development_plans              to authenticated;
grant select, insert, update, delete on table public.quality_development_plan_items         to authenticated;
grant select, insert, update, delete on table public.quality_learning_activities            to authenticated;
grant select, insert, update, delete on table public.quality_learning_participants          to authenticated;
grant select, insert, update, delete on table public.quality_learning_effectiveness_reviews to authenticated;
grant select, insert, update, delete on table public.quality_performance_cycles             to authenticated;
grant select, insert, update, delete on table public.quality_performance_cycle_members      to authenticated;
grant select, insert, update, delete on table public.quality_performance_evaluations        to authenticated;
grant select, insert, update, delete on table public.quality_performance_items              to authenticated;
grant select, insert, update, delete on table public.quality_knowledge_items                to authenticated;
grant select, insert, update, delete on table public.quality_knowledge_holders              to authenticated;
grant select, insert, update, delete on table public.quality_knowledge_transfer_plans       to authenticated;
grant select, insert, update, delete on table public.quality_knowledge_transfer_items       to authenticated;
grant select, insert, update, delete on table public.quality_lessons_learned                to authenticated;
grant select, insert, update, delete on table public.quality_lesson_proposals               to authenticated;

-- La senal se lee y se descarta; no se inventa a mano.
grant select, update on table public.quality_knowledge_signals to authenticated;

grant select on public.v_quality_position_occupants_current to authenticated;
grant select on public.v_quality_org_chart                to authenticated;
grant select on public.v_quality_competence_matrix        to authenticated;
grant select on public.v_quality_knowledge_continuity     to authenticated;


-- ============================================================================
-- 14 · CICLO DE VIDA (§55)
-- ----------------------------------------------------------------------------
-- La regla general de Trazaloop: borrar de verdad solo ANTES de que exista
-- valor historico. Despues se desactiva, se retira, se cierra o se sustituye.
--
-- Una persona con asignaciones, competencia evaluada, evaluaciones o
-- conocimiento a su nombre NO se borra: se marca `former`. Borrarla dejaria
-- huerfanos actos que ella ejecuto, y el sistema perderia la capacidad de
-- responder quien hizo que.
-- ----------------------------------------------------------------------------

create or replace function public.quality_person_deletion_verdict(p_person_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_person   record;
  v_blocking jsonb := '[]'::jsonb;
  v_n        integer;
begin
  select * into v_person from quality_people where id = p_person_id;
  if v_person.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Esta persona no existe.', 'blocking', '[]'::jsonb);
  end if;

  select count(*) into v_n from quality_position_assignments where person_id = p_person_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'asignación a un cargo' else 'asignaciones a cargos' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_person_competencies where person_id = p_person_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'competencia evaluada' else 'competencias evaluadas' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_performance_evaluations where person_id = p_person_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'evaluación de desempeño' else 'evaluaciones de desempeño' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_knowledge_holders where person_id = p_person_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'conocimiento que sostiene' else 'conocimientos que sostiene' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_learning_participants where person_id = p_person_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'participación en formación' else 'participaciones en formación' end,
      'count', v_n);
  end if;

  if jsonb_array_length(v_blocking) = 0 then
    return jsonb_build_object('can_hard_delete', true, 'reason_code', 'disposable',
      'reason', 'Esta persona no tiene todavía historia en el sistema de gestión: puede eliminarse.',
      'blocking', '[]'::jsonb);
  end if;

  return jsonb_build_object('can_hard_delete', false, 'reason_code', 'in_use',
    'reason', 'Esta persona tiene historia en el sistema de gestión y debe conservarse.',
    'blocking', v_blocking,
    'alternative', 'retire',
    'alternative_label', 'Marcarla como desvinculada conservando su historia');
end;
$$;
revoke all on function public.quality_person_deletion_verdict(uuid) from public, anon, authenticated;


create or replace function public.quality_competency_deletion_verdict(p_competency_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row      record;
  v_blocking jsonb := '[]'::jsonb;
  v_n        integer;
begin
  select * into v_row from quality_competencies where id = p_competency_id;
  if v_row.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Esta competencia no existe.', 'blocking', '[]'::jsonb);
  end if;

  select count(*) into v_n from quality_competency_requirements where competency_id = p_competency_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'cargo o proceso que la exige' else 'cargos o procesos que la exigen' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_person_competencies where competency_id = p_competency_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'evaluación de persona' else 'evaluaciones de personas' end,
      'count', v_n);
  end if;

  if jsonb_array_length(v_blocking) = 0 then
    return jsonb_build_object('can_hard_delete', true, 'reason_code', 'disposable',
      'reason', 'Esta competencia no se ha usado todavía: puede eliminarse.',
      'blocking', '[]'::jsonb);
  end if;

  return jsonb_build_object('can_hard_delete', false, 'reason_code', 'in_use',
    'reason', 'Esta competencia ya se exige o se ha evaluado, y su historia debe conservarse.',
    'blocking', v_blocking,
    'alternative', 'deactivate',
    'alternative_label', 'Desactivarla conservando su historia');
end;
$$;
revoke all on function public.quality_competency_deletion_verdict(uuid) from public, anon, authenticated;


create or replace function public.quality_knowledge_item_deletion_verdict(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row      record;
  v_blocking jsonb := '[]'::jsonb;
  v_n        integer;
begin
  select * into v_row from quality_knowledge_items where id = p_item_id;
  if v_row.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Este conocimiento no existe.', 'blocking', '[]'::jsonb);
  end if;

  select count(*) into v_n from quality_knowledge_transfer_plans where knowledge_item_id = p_item_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'plan de transferencia' else 'planes de transferencia' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_knowledge_signals
   where knowledge_item_id = p_item_id and risk_id is not null;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'señal promovida a riesgo' else 'señales promovidas a riesgo' end,
      'count', v_n);
  end if;

  if jsonb_array_length(v_blocking) = 0 then
    return jsonb_build_object('can_hard_delete', true, 'reason_code', 'disposable',
      'reason', 'Este conocimiento no tiene historia asociada: puede eliminarse.',
      'blocking', '[]'::jsonb);
  end if;

  return jsonb_build_object('can_hard_delete', false, 'reason_code', 'in_use',
    'reason', 'Este conocimiento ya generó decisiones y su historia debe conservarse.',
    'blocking', v_blocking,
    'alternative', 'retire',
    'alternative_label', 'Retirarlo conservando su historia');
end;
$$;
revoke all on function public.quality_knowledge_item_deletion_verdict(uuid) from public, anon, authenticated;


create or replace function public.quality_lesson_deletion_verdict(p_lesson_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row      record;
  v_blocking jsonb := '[]'::jsonb;
  v_n        integer;
begin
  select * into v_row from quality_lessons_learned where id = p_lesson_id;
  if v_row.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Esta lección no existe.', 'blocking', '[]'::jsonb);
  end if;

  if v_row.status <> 'draft' then
    v_blocking := v_blocking || jsonb_build_object('label', 'lección ya publicada', 'count', 1);
  end if;

  select count(*) into v_n from quality_lesson_proposals
   where lesson_id = p_lesson_id and status <> 'proposed';
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'propuesta ya decidida' else 'propuestas ya decididas' end,
      'count', v_n);
  end if;

  if jsonb_array_length(v_blocking) = 0 then
    return jsonb_build_object('can_hard_delete', true, 'reason_code', 'disposable',
      'reason', 'Esta lección sigue en borrador y no ha producido decisiones: puede eliminarse.',
      'blocking', '[]'::jsonb);
  end if;

  return jsonb_build_object('can_hard_delete', false, 'reason_code', 'in_use',
    'reason', 'Esta lección ya circuló o produjo decisiones, y debe conservarse.',
    'blocking', v_blocking,
    'alternative', 'archive',
    'alternative_label', 'Archivarla conservando su historia');
end;
$$;
revoke all on function public.quality_lesson_deletion_verdict(uuid) from public, anon, authenticated;


-- El despachador transversal aprende las entidades nuevas. Se reescribe
-- entero conservando cada rama anterior: es la misma funcion que ya usa la
-- interfaz para preguntar «¿esto se puede borrar?».
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
    when 'indicator' then (select organization_id from quality_indicators where id = p_id)
    when 'objective' then (select organization_id from quality_objectives where id = p_id)
    when 'position'  then (select organization_id from quality_positions  where id = p_id)
    when 'document'  then (select organization_id from trazadoc_documents where id = p_id)
    when 'process'   then (select organization_id from quality_processes  where id = p_id)
    when 'case'      then (select organization_id from work_cases         where id = p_id)
    when 'action'    then (select organization_id from work_actions       where id = p_id)
    when 'risk'        then (select organization_id from quality_risks        where id = p_id)
    when 'opportunity' then (select organization_id from quality_opportunities where id = p_id)
    when 'control'     then (select organization_id from quality_controls     where id = p_id)
    when 'methodology_version' then
      (select organization_id from quality_risk_methodology_versions where id = p_id)
    when 'person'         then (select organization_id from quality_people          where id = p_id)
    when 'competency'     then (select organization_id from quality_competencies    where id = p_id)
    when 'knowledge_item' then (select organization_id from quality_knowledge_items where id = p_id)
    when 'lesson'         then (select organization_id from quality_lessons_learned where id = p_id)
  end;

  if v_org is null or not is_org_member(v_org) then return v_none; end if;

  -- PC-25 · Ni siquiera el veredicto de borrado de una persona se responde a
  -- quien no puede ver su ficha: el conteo de «3 evaluaciones» ya es
  -- informacion sobre ella.
  if p_entity = 'person' and not quality_can_read_person(v_org, p_id) then
    return v_none;
  end if;

  return case p_entity
    when 'indicator' then quality_indicator_deletion_verdict(p_id)
    when 'objective' then quality_objective_deletion_verdict(p_id)
    when 'position'  then quality_position_deletion_verdict(p_id)
    when 'document'  then trazadoc_document_deletion_verdict(p_id)
    when 'process'   then quality_process_deletion_verdict(p_id)
    when 'case'      then work_case_deletion_verdict(p_id)
    when 'action'    then work_action_deletion_verdict(p_id)
    when 'risk'        then quality_risk_deletion_verdict(p_id)
    when 'opportunity' then quality_opportunity_deletion_verdict(p_id)
    when 'control'     then quality_control_deletion_verdict(p_id)
    when 'methodology_version' then quality_methodology_version_deletion_verdict(p_id)
    when 'person'         then quality_person_deletion_verdict(p_id)
    when 'competency'     then quality_competency_deletion_verdict(p_id)
    when 'knowledge_item' then quality_knowledge_item_deletion_verdict(p_id)
    when 'lesson'         then quality_lesson_deletion_verdict(p_id)
  end;
end;
$$;
revoke all on function public.quality_deletion_eligibility(text, uuid) from public, anon;
grant execute on function public.quality_deletion_eligibility(text, uuid) to authenticated;


-- ============================================================================
-- 15 · ESCALA DE COMPETENCIA POR DEFECTO (§19)
-- ----------------------------------------------------------------------------
-- La escala NO se impone: la empresa define la suya. Lo que se ofrece es un
-- punto de partida razonable, y solo cuando alguien lo pide explicitamente
-- desde la aplicacion. Por eso esto es una funcion y no un INSERT masivo
-- sobre todas las organizaciones existentes.
-- ----------------------------------------------------------------------------
create or replace function public.quality_seed_competency_levels(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not has_org_role(p_organization_id, array['admin', 'quality', 'consultant']) then
    raise exception 'No tienes permiso para configurar la escala de competencia.';
  end if;

  select count(*) into v_n from quality_competency_levels
   where organization_id = p_organization_id;
  if v_n > 0 then
    return 0;
  end if;

  insert into quality_competency_levels (organization_id, level_value, label, description) values
    (p_organization_id, 1, 'Conoce',
     'Conoce el concepto y sabe cuándo aplica, pero todavía no lo ejecuta.'),
    (p_organization_id, 2, 'Ejecuta con supervisión',
     'Ejecuta la actividad correctamente si alguien con más nivel la acompaña o la revisa.'),
    (p_organization_id, 3, 'Ejecuta autónomamente',
     'Ejecuta la actividad por su cuenta y responde por el resultado.'),
    (p_organization_id, 4, 'Puede formar a otros',
     'Además de ejecutarla, es capaz de enseñarla y de evaluar a quien la aprende.');

  return 4;
end;
$$;
revoke all on function public.quality_seed_competency_levels(uuid) from public, anon;
grant execute on function public.quality_seed_competency_levels(uuid) to authenticated;


-- ============================================================================
-- 16 · LA VISTA DE TITULAR DE 0112 APRENDE A LEER PERSONAS
-- ----------------------------------------------------------------------------
-- `v_quality_position_current_holder` resolvia el nombre del titular contra
-- `profiles`. Ahora que una asignacion puede nombrar a una PERSONA sin cuenta,
-- esa vista devolveria `holder_name = null` justo para los casos que este
-- sprint viene a habilitar, y con ella se apagarian en silencio el propietario
-- del proceso, el del indicador, el del objetivo y el del caso.
--
-- Se conservan todas sus columnas en el mismo orden —hay migraciones
-- anteriores que hacen `left join` contra ella— y se anaden las dos nuevas al
-- final. `holder_name` pasa a preferir el nombre de la persona; si no la hay,
-- sigue cayendo en el del perfil, que es lo que veia QUALITY-01.
-- ----------------------------------------------------------------------------
create or replace view public.v_quality_position_current_holder
with (security_invoker = true) as
select
  p.organization_id,
  p.id                        as position_id,
  p.name                      as position_name,
  p.code                      as position_code,
  p.is_active,
  a.id                        as assignment_id,
  a.profile_id,
  coalesce(pe.full_name, pr.full_name)   as holder_name,
  coalesce(pe.work_email, pr.email)      as holder_email,
  a.effective_from,
  a.assignment_type,
  a.person_id,
  pe.full_name                as person_name
from public.quality_positions p
left join public.quality_position_assignments a
       on a.position_id = p.id
      and a.assignment_type = 'holder'
      and a.effective_to is null
left join public.profiles pr on pr.id = a.profile_id
left join public.quality_people pe
       on pe.organization_id = a.organization_id and pe.id = a.person_id;

comment on view public.v_quality_position_current_holder is
  'QUALITY-01 + QUALITY-06 · Titular vigente del cargo. Desde 0123 el nombre sale de la PERSONA cuando la hay, y del perfil solo como respaldo: un titular sin cuenta de Trazaloop tambien tiene nombre.';


-- ============================================================================
-- 17 · ACTOS FORMALES (RPC)
-- ----------------------------------------------------------------------------
-- La frontera es la misma que en QUALITY-04 y 05: lo que crea HISTORIA pasa
-- por una funcion. Publicar un perfil de cargo, decidir que alguien es
-- competente, cerrar una evaluacion o dar por verificada una transferencia son
-- actos que tienen que comprobar rol, estado e invariantes EN EL MISMO ACTO en
-- que se registran. Eso no se puede hacer con dos INSERT desde el navegador:
-- entre el primero y el segundo cabe una desconexion, y queda un cargo con dos
-- perfiles vigentes.
--
-- Lo demas —crear un borrador, anadir una funcion, inscribir a alguien en una
-- actividad— es escritura normal bajo RLS.
-- ----------------------------------------------------------------------------

-- §12 · Publicar un perfil de cargo. Cierra el anterior el dia previo y numera
-- la nueva version. Nunca deja dos vigentes.
create or replace function public.quality_publish_position_version(
  p_version_id     uuid,
  p_effective_from date default current_date,
  p_change_note    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version record;
  v_prev    record;
  v_number  integer;
begin
  select * into v_version from quality_position_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'Este perfil de cargo no existe.';
  end if;
  if not has_org_role(v_version.organization_id, array['admin', 'quality', 'consultant']) then
    raise exception 'No tienes permiso para publicar perfiles de cargo.';
  end if;
  if v_version.status <> 'draft' then
    raise exception 'Este perfil ya fue publicado.';
  end if;

  select * into v_prev
    from quality_position_versions
   where position_id = v_version.position_id
     and status = 'published'
   limit 1;

  if v_prev.id is not null then
    if p_effective_from <= v_prev.effective_from then
      raise exception 'La nueva vigencia debe empezar después de la del perfil anterior.';
    end if;
    update quality_position_versions
       set status = 'superseded',
           effective_to = p_effective_from - 1
     where id = v_prev.id;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_number
    from quality_position_versions
   where position_id = v_version.position_id
     and id <> p_version_id;

  update quality_position_versions
     set status = 'published',
         version_number = v_number,
         effective_from = p_effective_from,
         effective_to = null,
         change_note = coalesce(p_change_note, change_note),
         published_by = auth.uid(),
         published_at = now()
   where id = p_version_id;

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id, summary, payload)
  values (v_version.organization_id, 'position', 'position.version_published',
          'quality_position', v_version.position_id,
          'Perfil de cargo publicado.',
          jsonb_build_object('version_id', p_version_id, 'version_number', v_number,
                             'effective_from', p_effective_from));

  return p_version_id;
end;
$$;
revoke all on function public.quality_publish_position_version(uuid, date, text) from public, anon;
grant execute on function public.quality_publish_position_version(uuid, date, text) to authenticated;


-- §22 · Declarar competencia demostrada. Sustituye la decision anterior en vez
-- de pisarla: la de 2025 sigue existiendo y sigue diciendo lo que decia.
create or replace function public.quality_record_person_competence(
  p_person_id       uuid,
  p_competency_id   uuid,
  p_level           integer,
  p_method          text,
  p_rationale       text default null,
  p_assessed_on     date default current_date,
  p_valid_until     date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid;
  v_prev  uuid;
  v_new   uuid;
begin
  select organization_id into v_org from quality_people where id = p_person_id;
  if v_org is null then
    raise exception 'Esta persona no existe.';
  end if;
  if not quality_manages_people(v_org) then
    raise exception 'No tienes permiso para registrar competencia de personas.';
  end if;
  if not exists (select 1 from quality_competencies
                  where id = p_competency_id and organization_id = v_org) then
    raise exception 'Esa competencia no es de esta empresa.';
  end if;
  if p_level < 0 then
    raise exception 'El nivel demostrado no puede ser negativo.';
  end if;

  select id into v_prev
    from quality_person_competencies
   where organization_id = v_org
     and person_id = p_person_id
     and competency_id = p_competency_id
     and status = 'valid'
   order by assessed_on desc, created_at desc
   limit 1;

  insert into quality_person_competencies
    (organization_id, person_id, competency_id, demonstrated_level, assessed_on,
     method, rationale, decided_by, status, valid_until)
  values
    (v_org, p_person_id, p_competency_id, p_level, p_assessed_on,
     p_method, p_rationale, auth.uid(), 'valid', p_valid_until)
  returning id into v_new;

  if v_prev is not null then
    update quality_person_competencies
       set status = 'superseded', superseded_by = v_new
     where id = v_prev;
  end if;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              decided_by, rationale)
  values (v_org, 'person_competency', v_new, 'competence_decision', auth.uid(),
          coalesce(p_rationale, 'Competencia demostrada registrada.'));

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id, summary, payload)
  values (v_org, 'competence', 'competence.assessed', 'quality_person_competency', v_new,
          'Competencia demostrada registrada.',
          jsonb_build_object('person_id', p_person_id, 'competency_id', p_competency_id,
                             'level', p_level, 'assessed_on', p_assessed_on));

  return v_new;
end;
$$;
revoke all on function public.quality_record_person_competence(uuid, uuid, integer, text, text, date, date) from public, anon;
grant execute on function public.quality_record_person_competence(uuid, uuid, integer, text, text, date, date) to authenticated;


-- §34/§73 · Evaluar la eficacia. Un resultado «no eficaz» se conserva: si
-- despues se hace otra accion, es OTRA accion, con su propia eficacia.
create or replace function public.quality_review_learning_effectiveness(
  p_review_id   uuid,
  p_result      text,
  p_observation text,
  p_reviewed_on date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_row record;
begin
  select * into v_row from quality_learning_effectiveness_reviews where id = p_review_id;
  if v_row.id is null then
    raise exception 'Esta evaluación de eficacia no existe.';
  end if;
  if not quality_manages_people(v_row.organization_id) then
    raise exception 'No tienes permiso para evaluar la eficacia.';
  end if;
  if v_row.result <> 'pending' then
    raise exception 'Esta eficacia ya fue evaluada. Registra una nueva acción si hace falta otra.';
  end if;
  if p_result not in ('effective', 'partially_effective', 'not_effective') then
    raise exception 'Resultado de eficacia no válido.';
  end if;

  update quality_learning_effectiveness_reviews
     set result = p_result,
         observation = p_observation,
         reviewed_on = p_reviewed_on,
         reviewed_by = auth.uid()
   where id = p_review_id;

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id, summary, payload)
  values (v_row.organization_id, 'learning', 'learning.effectiveness_reviewed',
          -- El sujeto es lo que de verdad se evaluo. Poner siempre
          -- «actividad» cuando la eficacia cuelga de un item del plan seria
          -- apuntar el evento a algo que no existe.
          case when v_row.activity_id is not null
               then 'quality_learning_activity' else 'quality_development_plan_item' end,
          coalesce(v_row.activity_id, v_row.plan_item_id),
          'Eficacia de la acción de desarrollo evaluada.',
          jsonb_build_object('review_id', p_review_id, 'result', p_result));

  return p_review_id;
end;
$$;
revoke all on function public.quality_review_learning_effectiveness(uuid, text, text, date) from public, anon;
grant execute on function public.quality_review_learning_effectiveness(uuid, text, text, date) to authenticated;


-- §38 · Cerrar una evaluacion de desempeno. La decision es humana: la funcion
-- comprueba que haya al menos una linea evaluada y quien la firma, y despues
-- la congela.
create or replace function public.quality_close_performance_evaluation(
  p_evaluation_id uuid,
  p_summary       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   record;
  v_items integer;
begin
  select * into v_row from quality_performance_evaluations where id = p_evaluation_id;
  if v_row.id is null then
    raise exception 'Esta evaluación no existe.';
  end if;
  if not quality_manages_people(v_row.organization_id) then
    raise exception 'No tienes permiso para cerrar evaluaciones de desempeño.';
  end if;
  if v_row.status = 'closed' then
    raise exception 'Esta evaluación ya está cerrada.';
  end if;

  select count(*) into v_items from quality_performance_items where evaluation_id = p_evaluation_id;
  if v_items = 0 then
    raise exception 'Una evaluación cerrada tiene que decir contra qué se evaluó.';
  end if;
  if v_row.evaluator_person_id is null then
    raise exception 'Una evaluación formal tiene que registrar quién evaluó.';
  end if;

  update quality_performance_evaluations
     set status = 'closed',
         summary = coalesce(p_summary, summary),
         evaluated_on = coalesce(evaluated_on, current_date)
   where id = p_evaluation_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              decided_by, rationale)
  values (v_row.organization_id, 'performance_evaluation', p_evaluation_id, 'performance_result',
          auth.uid(), coalesce(p_summary, 'Evaluación de desempeño cerrada.'));

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id, summary, payload)
  values (v_row.organization_id, 'performance', 'performance.evaluation_closed',
          'quality_performance_evaluation', p_evaluation_id,
          'Evaluación de desempeño cerrada.',
          jsonb_build_object('person_id', v_row.person_id, 'cycle_id', v_row.cycle_id));

  return p_evaluation_id;
end;
$$;
revoke all on function public.quality_close_performance_evaluation(uuid, text) from public, anon;
grant execute on function public.quality_close_performance_evaluation(uuid, text) to authenticated;


-- §45 · Promover una senal de continuidad a riesgo formal. Es la unica via, y
-- exige que alguien la pida: el barrido nunca crea riesgos.
create or replace function public.quality_promote_knowledge_signal(
  p_signal_id uuid,
  p_risk_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_row record;
begin
  select * into v_row from quality_knowledge_signals where id = p_signal_id;
  if v_row.id is null then
    raise exception 'Esta señal no existe.';
  end if;
  if not has_org_role(v_row.organization_id, array['admin', 'quality', 'consultant']) then
    raise exception 'No tienes permiso para promover señales a riesgo.';
  end if;
  if v_row.risk_id is not null then
    raise exception 'Esta señal ya se promovió a un riesgo.';
  end if;
  if not exists (select 1 from quality_risks
                  where id = p_risk_id and organization_id = v_row.organization_id) then
    raise exception 'Ese riesgo no es de esta empresa.';
  end if;

  update quality_knowledge_signals
     set risk_id = p_risk_id, promoted_by = auth.uid(), promoted_at = now()
   where id = p_signal_id;

  return p_signal_id;
end;
$$;
revoke all on function public.quality_promote_knowledge_signal(uuid, uuid) from public, anon;
grant execute on function public.quality_promote_knowledge_signal(uuid, uuid) to authenticated;


-- §48/§78 · Decidir sobre una propuesta de una leccion. Aceptarla NO aplica
-- nada: solo deja escrito que se aceptó. Lo que se cree despues se anota en
-- `outcome_kind`/`outcome_id`.
create or replace function public.quality_decide_lesson_proposal(
  p_proposal_id uuid,
  p_decision    text,
  p_note        text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_row record;
begin
  select * into v_row from quality_lesson_proposals where id = p_proposal_id;
  if v_row.id is null then
    raise exception 'Esta propuesta no existe.';
  end if;
  if not has_org_role(v_row.organization_id, array['admin', 'quality', 'consultant']) then
    raise exception 'No tienes permiso para decidir sobre propuestas de lecciones.';
  end if;
  if v_row.status <> 'proposed' then
    raise exception 'Esta propuesta ya fue decidida.';
  end if;
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'Decisión no válida.';
  end if;

  update quality_lesson_proposals
     set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_note = p_note
   where id = p_proposal_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              decided_by, rationale)
  values (v_row.organization_id, 'lesson', v_row.lesson_id, 'lesson_proposal', auth.uid(),
          coalesce(p_note, 'Propuesta ' || p_decision || '.'));

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id, summary, payload)
  values (v_row.organization_id, 'lesson', 'lesson.proposal_decided',
          'quality_lesson_learned', v_row.lesson_id,
          'Propuesta de la lección decidida.',
          jsonb_build_object('proposal_id', p_proposal_id, 'decision', p_decision));

  return p_proposal_id;
end;
$$;
revoke all on function public.quality_decide_lesson_proposal(uuid, text, text) from public, anon;
grant execute on function public.quality_decide_lesson_proposal(uuid, text, text) to authenticated;


-- §46 · Verificar una transferencia. Ejecutar las actividades no demuestra que
-- el conocimiento paso: verificar es un acto aparte, y por eso completa el
-- plan solo cuando alguien lo firma.
create or replace function public.quality_verify_knowledge_transfer(
  p_plan_id uuid,
  p_note    text,
  p_on      date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     record;
  v_pending integer;
begin
  select * into v_row from quality_knowledge_transfer_plans where id = p_plan_id;
  if v_row.id is null then
    raise exception 'Este plan de transferencia no existe.';
  end if;
  if not has_org_role(v_row.organization_id, array['admin', 'quality', 'consultant']) then
    raise exception 'No tienes permiso para verificar transferencias.';
  end if;
  if v_row.status = 'completed' then
    raise exception 'Esta transferencia ya está verificada.';
  end if;
  if length(coalesce(trim(p_note), '')) = 0 then
    raise exception 'La verificación tiene que decir en qué se comprobó que el conocimiento pasó.';
  end if;

  select count(*) into v_pending
    from quality_knowledge_transfer_items
   where transfer_plan_id = p_plan_id and status in ('pending', 'in_progress');
  if v_pending > 0 then
    raise exception 'Todavía hay actividades de transferencia sin cerrar.';
  end if;

  update quality_knowledge_transfer_plans
     set status = 'completed', verified_on = p_on,
         verification_note = p_note, verified_by = auth.uid()
   where id = p_plan_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              decided_by, rationale)
  values (v_row.organization_id, 'knowledge_transfer', p_plan_id,
          'knowledge_transfer_verification', auth.uid(), p_note);

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id, summary, payload)
  values (v_row.organization_id, 'knowledge', 'knowledge.transfer_verified',
          'quality_knowledge_transfer_plan', p_plan_id,
          'Transferencia de conocimiento verificada.',
          jsonb_build_object('knowledge_item_id', v_row.knowledge_item_id));

  return p_plan_id;
end;
$$;
revoke all on function public.quality_verify_knowledge_transfer(uuid, text, date) from public, anon;
grant execute on function public.quality_verify_knowledge_transfer(uuid, text, date) to authenticated;


-- ============================================================================
-- 18 · EL GUARDIÁN DE LA ASIGNACIÓN APRENDE QUE EXISTEN PERSONAS
-- ----------------------------------------------------------------------------
-- `quality_assignment_profile_must_belong()` viene de 0112 y exige que quien
-- ocupa un cargo sea MIEMBRO ACTIVO de la empresa. Esa comprobación era
-- correcta cuando la única forma de nombrar a alguien era su cuenta.
--
-- Con personas sin cuenta pasa a rechazar exactamente el caso que este sprint
-- viene a habilitar: `profile_id` es null, no hay membresía que encontrar, y
-- el operario que trabaja todos los días no puede ser titular de nada. La
-- comprobación no se debilita —una cuenta ajena sigue sin poder ocupar un
-- cargo— sino que se aplica a lo que de verdad protege.
--
-- Y se añade la simétrica: una PERSONA solo puede ocupar cargos de SU empresa.
-- La FK compuesta ya lo garantiza, pero dejarlo escrito aquí mantiene el
-- mensaje de error en el idioma del usuario en vez de un fallo de restricción.
-- ----------------------------------------------------------------------------
create or replace function public.quality_assignment_profile_must_belong()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is not null and not exists (
    select 1 from memberships m
     where m.organization_id = new.organization_id
       and m.user_id = new.profile_id
       and m.status = 'active'
  ) then
    raise exception 'La persona asignada debe ser miembro activo de esta empresa';
  end if;

  if new.person_id is not null and not exists (
    select 1 from quality_people p
     where p.organization_id = new.organization_id
       and p.id = new.person_id
  ) then
    raise exception 'Esa persona no pertenece a esta empresa.';
  end if;

  if new.person_id is null and new.profile_id is null then
    raise exception 'La asignación tiene que decir quién ocupa el cargo.';
  end if;

  return new;
end;
$$;
revoke all on function public.quality_assignment_profile_must_belong() from public, anon, authenticated;
