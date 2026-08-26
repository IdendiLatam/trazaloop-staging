-- ============================================================================
-- Trazaloop · QUALITY-07 · Proveedores, criticidad, evaluación y reevaluación
-- ----------------------------------------------------------------------------
-- Migración APPEND-ONLY. No edita 0001–0124.
--
-- LA DECISIÓN QUE ORDENA TODO EL ARCHIVO
--
-- GP-02 y MDR-11: «proveedor» no es una entidad, es un ROL de una identidad
-- externa transversal. Esa distinción no es teórica: hoy una empresa que usa
-- PCR y Textiles ya tiene a ACME dos veces —una en `suppliers` y otra en
-- `textile_suppliers`— y si Quality creara una tercera, administrar a ACME
-- pasaría a costar el triple y sus tres fichas empezarían a discrepar el mismo
-- día.
--
-- Así que aquí NO se crea `quality_suppliers`. Se crea la identidad externa
-- —`quality_external_parties`— y las dos tablas operativas que ya existen
-- ganan un puntero OPCIONAL hacia ella. Nada se migra, nada se borra, y PCR y
-- Textiles siguen funcionando exactamente igual con Quality apagado.
--
-- LO QUE ESTE DOMINIO NO ES
--
-- No es un ERP de compras (GP-01). No hay órdenes, ni precios, ni pagos, ni
-- contratos, ni catálogos de artículos. Lo que hay es lo que un sistema de
-- gestión necesita para responder si puede confiar en quien le suministra.
--
-- LAS SEPARACIONES QUE SOSTIENEN EL DOMINIO
--
--   IDENTIDAD ≠ ROL              ACME es una empresa; «proveedor» es un papel
--   PROVEEDOR ≠ SEDE             Medellín y Bogotá no rinden igual
--   PROVEEDOR ≠ CATEGORÍA        el mismo provee materia prima y transporte
--   CRITICIDAD ≠ DESEMPEÑO       crítico y excelente es una combinación normal
--   ESTADO DE RELACIÓN ≠ APROBACIÓN   activo no es aprobado (GP-04)
--   PUNTUACIÓN ≠ DECISIÓN        72 no aprueba a nadie (GP-07)
--   SEÑAL ≠ EVALUACIÓN ≠ NC      un retraso no es una no conformidad (GP-22)
--   REQUISITO DE HOY ≠ DE ENTONCES    exigir más en 2027 no incumple 2026
-- ============================================================================


-- ============================================================================
-- 1 · IDENTIDAD EXTERNA TRANSVERSAL (GP-02, MDR-11, §5)
-- ----------------------------------------------------------------------------
-- Una sola ficha por empresa externa, con los roles que ejerce. Un laboratorio
-- que además vende insumos es UNA identidad con DOS roles, no dos fichas.
--
-- Vive con prefijo `quality_` porque es este módulo el que la introduce y el
-- que la mantiene (MDR-38: nada de renombrados estéticos), pero su alcance es
-- transversal: PCR y Textiles la referencian sin depender de Quality.
-- ============================================================================

create table public.quality_external_parties (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  legal_name        text not null,
  trade_name        text,
  -- El identificador fiscal es la mejor pista de duplicado que hay, pero NO se
  -- fuerza único: una empresa puede registrarse antes de conocerlo, y bloquear
  -- el alta por un dato que aún no se tiene es como se acaban creando fichas
  -- «ACME (2)».
  tax_id            text,
  country           text,
  city              text,
  website           text,
  notes             text,

  status            text not null default 'active',

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_external_parties_org_id_uniq unique (organization_id, id),
  constraint quality_external_parties_name_not_blank check (length(trim(legal_name)) > 0),
  constraint quality_external_parties_status_check
    check (status in ('active', 'inactive', 'retired'))
);

-- §50 · La misma empresa en dos clientes de Trazaloop son DOS identidades. El
-- índice lleva `organization_id` delante justamente para que nadie confunda
-- «mismo NIT» con «misma ficha».
create unique index quality_external_parties_org_tax_uniq
  on public.quality_external_parties (organization_id, lower(tax_id))
  where tax_id is not null;
create index quality_external_parties_org_status_idx
  on public.quality_external_parties (organization_id, status);

comment on table public.quality_external_parties is
  'QUALITY-07 · GP-02/MDR-11 · Identidad de una empresa externa. Proveedor y cliente son ROLES de esta ficha, no entidades distintas.';

create trigger t_quality_external_parties_updated
  before update on public.quality_external_parties
  for each row execute function public.set_updated_at();
create trigger t_quality_external_parties_org_immutable
  before update on public.quality_external_parties
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_external_parties_force_created_by
  before insert on public.quality_external_parties
  for each row execute function public.force_created_by();


create table public.quality_external_party_roles (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  party_id          uuid not null,
  role_code         text not null,
  status            text not null default 'active',
  since_on          date,
  until_on          date,
  note              text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_external_party_roles_org_id_uniq unique (organization_id, id),
  constraint quality_external_party_roles_code_check
    check (role_code in ('supplier', 'customer', 'laboratory', 'contractor',
                         'consultant', 'certification_body', 'other')),
  constraint quality_external_party_roles_status_check
    check (status in ('active', 'inactive')),
  constraint quality_external_party_roles_period_check
    check (until_on is null or since_on is null or until_on >= since_on),
  constraint quality_external_party_roles_party_fk
    foreign key (organization_id, party_id)
    references public.quality_external_parties (organization_id, id) on delete cascade
);

create unique index quality_external_party_roles_uniq
  on public.quality_external_party_roles (party_id, role_code);

comment on table public.quality_external_party_roles is
  'QUALITY-07 · §22.1 del baseline · Los papeles que ejerce una empresa externa. Un laboratorio que además suministra es UNA identidad con DOS roles.';

create trigger t_quality_external_party_roles_updated
  before update on public.quality_external_party_roles
  for each row execute function public.set_updated_at();
create trigger t_quality_external_party_roles_org_immutable
  before update on public.quality_external_party_roles
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_external_party_roles_force_created_by
  before insert on public.quality_external_party_roles
  for each row execute function public.force_created_by();


-- §6 · PROVEEDOR ≠ SEDE. Suponer «un proveedor = una ubicación» es lo que hace
-- imposible responder por qué Medellín entrega a tiempo y Bogotá no.
create table public.quality_external_party_sites (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  party_id          uuid not null,
  name              text not null,
  code              text,
  country           text,
  city              text,
  address           text,
  is_primary        boolean not null default false,
  status            text not null default 'active',
  notes             text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_external_party_sites_org_id_uniq unique (organization_id, id),
  constraint quality_external_party_sites_name_not_blank check (length(trim(name)) > 0),
  constraint quality_external_party_sites_status_check
    check (status in ('active', 'inactive')),
  constraint quality_external_party_sites_party_fk
    foreign key (organization_id, party_id)
    references public.quality_external_parties (organization_id, id) on delete cascade
);

-- Una sede principal como mucho. Si hicieran falta dos, es que son dos sedes.
create unique index quality_external_party_sites_primary_uniq
  on public.quality_external_party_sites (party_id)
  where is_primary and status = 'active';
create unique index quality_external_party_sites_code_uniq
  on public.quality_external_party_sites (party_id, lower(code))
  where code is not null;
create index quality_external_party_sites_party_idx
  on public.quality_external_party_sites (organization_id, party_id, status);

comment on table public.quality_external_party_sites is
  'QUALITY-07 · §6 · Sedes de la empresa externa. La evaluación, la criticidad y la aprobación pueden depender de la sede.';

create trigger t_quality_external_party_sites_updated
  before update on public.quality_external_party_sites
  for each row execute function public.set_updated_at();
create trigger t_quality_external_party_sites_org_immutable
  before update on public.quality_external_party_sites
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_external_party_sites_force_created_by
  before insert on public.quality_external_party_sites
  for each row execute function public.force_created_by();


-- §49 · Contactos: lo MÍNIMO del vínculo comercial. Nombre, cargo y forma de
-- contacto profesional. Sin documento de identidad, sin fecha de nacimiento,
-- sin dirección particular: son personas de otra empresa y no hay ninguna
-- razón de gestión para guardar más.
create table public.quality_external_party_contacts (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  party_id          uuid not null,
  site_id           uuid,
  full_name         text not null,
  role_title        text,
  email             text,
  phone             text,
  is_primary        boolean not null default false,
  notes             text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_external_party_contacts_org_id_uniq unique (organization_id, id),
  constraint quality_external_party_contacts_name_not_blank check (length(trim(full_name)) > 0),
  constraint quality_external_party_contacts_email_check
    check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint quality_external_party_contacts_party_fk
    foreign key (organization_id, party_id)
    references public.quality_external_parties (organization_id, id) on delete cascade,
  constraint quality_external_party_contacts_site_fk
    foreign key (organization_id, site_id)
    references public.quality_external_party_sites (organization_id, id) on delete set null
);

create index quality_external_party_contacts_party_idx
  on public.quality_external_party_contacts (organization_id, party_id);

comment on table public.quality_external_party_contacts is
  'QUALITY-07 · §49 · Contacto profesional en la empresa externa. Solo lo necesario para el vínculo comercial: sin documentos de identidad ni datos privados.';

create trigger t_quality_external_party_contacts_updated
  before update on public.quality_external_party_contacts
  for each row execute function public.set_updated_at();
create trigger t_quality_external_party_contacts_org_immutable
  before update on public.quality_external_party_contacts
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_external_party_contacts_force_created_by
  before insert on public.quality_external_party_contacts
  for each row execute function public.force_created_by();


-- ============================================================================
-- 2 · EL PUENTE CON PCR Y TEXTILES (GP-33, §5, §39, §40, §58)
-- ----------------------------------------------------------------------------
-- Las dos tablas operativas ganan un puntero OPCIONAL a la identidad externa.
--
-- Es lo mínimo que resuelve la duplicación, y es deliberadamente lo mínimo:
--
--   · la columna es NULLABLE, así que ninguna fila existente deja de ser
--     válida y ningún flujo de PCR o Textiles cambia;
--   · nada se migra ni se borra: `input_batches`, `textile_input_lots`,
--     `textile_materials` y los demás siguen apuntando donde apuntaban;
--   · con Quality apagado, la columna simplemente queda nula y los dos módulos
--     funcionan exactamente igual (§55: entitlement ≠ existencia de identidad).
--
-- El índice único por módulo impide el reverso del problema: que una misma
-- identidad externa acabe enlazada a dos proveedores del MISMO módulo, que es
-- como se duplicaría por la puerta de atrás.
-- ============================================================================

alter table public.suppliers
  add column if not exists external_party_id uuid;

alter table public.suppliers
  add constraint suppliers_external_party_fk
    foreign key (organization_id, external_party_id)
    references public.quality_external_parties (organization_id, id) on delete set null;

create unique index suppliers_external_party_uniq
  on public.suppliers (organization_id, external_party_id)
  where external_party_id is not null;

comment on column public.suppliers.external_party_id is
  'QUALITY-07 · GP-33 · Enlace OPCIONAL con la identidad externa transversal. Nulo = este proveedor de PCR todavía no se ha incorporado a Quality. PCR no lo necesita para funcionar.';

alter table public.textile_suppliers
  add column if not exists external_party_id uuid;

alter table public.textile_suppliers
  add constraint textile_suppliers_external_party_fk
    foreign key (organization_id, external_party_id)
    references public.quality_external_parties (organization_id, id) on delete set null;

create unique index textile_suppliers_external_party_uniq
  on public.textile_suppliers (organization_id, external_party_id)
  where external_party_id is not null;

comment on column public.textile_suppliers.external_party_id is
  'QUALITY-07 · GP-33 · Enlace OPCIONAL con la identidad externa transversal. Nulo = este proveedor textil todavía no se ha incorporado a Quality.';


-- ============================================================================
-- 3 · EL PROVEEDOR EN QUALITY (GP-04, §13, §47, §48)
-- ----------------------------------------------------------------------------
-- El perfil es la RELACIÓN de Quality con una identidad externa que ejerce el
-- rol de proveedor. No repite el nombre, ni el NIT, ni la dirección: eso vive
-- en la identidad y se lee de allí.
--
-- GP-04 · Estado de la RELACIÓN y estado de APROBACIÓN son dos ejes distintos.
-- Un proveedor puede estar activo y no aprobado (todavía no se ha evaluado), o
-- inactivo y con una aprobación vigente sin usar. Colapsarlos en un booleano
-- `approved` es lo que hace imposible responder «¿para qué está aprobado?».
-- Por eso aquí NO hay ninguna columna de aprobación: vive en las decisiones,
-- por alcance (§15).
-- ============================================================================

create table public.quality_supplier_profiles (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,

  party_id              uuid not null,

  -- GP-04 · Estado de la RELACIÓN comercial, no de la aprobación.
  relationship_status   text not null default 'prospect',

  -- MDR-33 · La responsabilidad persistente es de un CARGO. Un cargo no se va
  -- de vacaciones ni cambia de empresa; una persona sí.
  owner_position_id     uuid,

  -- §28 · Cadencia por defecto de la reevaluación. La criticidad puede
  -- acortarla (GP-20): cuando la metodología de criticidad declara meses de
  -- revisión, mandan esos.
  reevaluation_months   integer not null default 12,
  next_review_on        date,
  last_evaluated_on     date,

  notes                 text,

  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint quality_supplier_profiles_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_profiles_status_check
    check (relationship_status in ('prospect', 'active', 'inactive', 'retired')),
  constraint quality_supplier_profiles_cadence_check
    check (reevaluation_months between 1 and 120),
  constraint quality_supplier_profiles_party_fk
    foreign key (organization_id, party_id)
    references public.quality_external_parties (organization_id, id) on delete restrict,
  constraint quality_supplier_profiles_owner_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete restrict
);

-- Una identidad externa tiene UN perfil de proveedor. Si hiciera falta un
-- segundo, es que son dos empresas.
create unique index quality_supplier_profiles_party_uniq
  on public.quality_supplier_profiles (party_id);
create index quality_supplier_profiles_review_idx
  on public.quality_supplier_profiles (organization_id, next_review_on)
  where relationship_status = 'active';

comment on table public.quality_supplier_profiles is
  'QUALITY-07 · GP-04 · La relación de Quality con una identidad externa. Sin columna de aprobación a propósito: la aprobación es por ALCANCE y vive en las decisiones.';

create trigger t_quality_supplier_profiles_updated
  before update on public.quality_supplier_profiles
  for each row execute function public.set_updated_at();
create trigger t_quality_supplier_profiles_org_immutable
  before update on public.quality_supplier_profiles
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_supplier_profiles_force_created_by
  before insert on public.quality_supplier_profiles
  for each row execute function public.force_created_by();
create trigger t_audit_quality_supplier_profiles
  after insert or update or delete on public.quality_supplier_profiles
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 4 · CATEGORÍAS Y ALCANCES (GP-03, §7, §8, §11, §15)
-- ----------------------------------------------------------------------------
-- §8 · La taxonomía la define la empresa. No hay lista universal cableada:
-- «materia prima» significa cosas distintas en una planta de reciclado y en un
-- laboratorio, y una lista impuesta se acaba llenando de «Otros».
-- ============================================================================

create table public.quality_supplier_categories (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  code              text,
  name              text not null,
  description       text,
  is_active         boolean not null default true,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_supplier_categories_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_categories_name_not_blank check (length(trim(name)) > 0)
);

create unique index quality_supplier_categories_org_name_uniq
  on public.quality_supplier_categories (organization_id, lower(name));
create unique index quality_supplier_categories_org_code_uniq
  on public.quality_supplier_categories (organization_id, lower(code))
  where code is not null;

comment on table public.quality_supplier_categories is
  'QUALITY-07 · §8 · Catálogo de categorías de suministro, definido por la empresa. Sin taxonomía universal cableada.';

create trigger t_quality_supplier_categories_updated
  before update on public.quality_supplier_categories
  for each row execute function public.set_updated_at();
create trigger t_quality_supplier_categories_org_immutable
  before update on public.quality_supplier_categories
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_supplier_categories_force_created_by
  before insert on public.quality_supplier_categories
  for each row execute function public.force_created_by();


-- §7 · N:M. El mismo proveedor presta materia prima, calibración y transporte;
-- guardar `supplier.category` como única verdad obliga a duplicar la ficha.
-- La sede es OPCIONAL: «ACME provee calibración» y «ACME/Medellín provee
-- calibración» son afirmaciones distintas y las dos son legítimas.
create table public.quality_supplier_category_assignments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  profile_id        uuid not null,
  category_id       uuid not null,
  site_id           uuid,
  since_on          date not null default current_date,
  until_on          date,
  note              text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),

  constraint quality_supplier_category_assignments_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_category_assignments_period_check
    check (until_on is null or until_on >= since_on),
  constraint quality_supplier_category_assignments_profile_fk
    foreign key (organization_id, profile_id)
    references public.quality_supplier_profiles (organization_id, id) on delete cascade,
  constraint quality_supplier_category_assignments_category_fk
    foreign key (organization_id, category_id)
    references public.quality_supplier_categories (organization_id, id) on delete restrict,
  constraint quality_supplier_category_assignments_site_fk
    foreign key (organization_id, site_id)
    references public.quality_external_party_sites (organization_id, id) on delete cascade
);

create index quality_supplier_category_assignments_profile_idx
  on public.quality_supplier_category_assignments (organization_id, profile_id);

comment on table public.quality_supplier_category_assignments is
  'QUALITY-07 · §7 · Qué suministra este proveedor, y desde qué sede cuando corresponde. N:M con vigencia.';

create trigger t_quality_supplier_category_assignments_org_immutable
  before update on public.quality_supplier_category_assignments
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_supplier_category_assignments_force_created_by
  before insert on public.quality_supplier_category_assignments
  for each row execute function public.force_created_by();


-- ----------------------------------------------------------------------------
-- 4.1 · EL ALCANCE · la pieza que hace que todo lo demás sea contextual
-- ----------------------------------------------------------------------------
-- GP-03 · La evaluación, la criticidad y la aprobación se aplican a una
-- combinación de proveedor + sede + categoría. Repetir ese par de columnas en
-- cinco tablas habría multiplicado por cinco las formas de que no cuadren.
--
-- Un alcance con sede y categoría nulas es «el proveedor en su conjunto», que
-- es lo que necesita una empresa pequeña con un solo sitio y sin categorías.
-- La misma estructura sirve a las dos, y esa es la razón de que exista.
create table public.quality_supplier_scopes (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  profile_id        uuid not null,
  site_id           uuid,
  category_id       uuid,
  label             text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),

  constraint quality_supplier_scopes_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_scopes_profile_fk
    foreign key (organization_id, profile_id)
    references public.quality_supplier_profiles (organization_id, id) on delete cascade,
  constraint quality_supplier_scopes_site_fk
    foreign key (organization_id, site_id)
    references public.quality_external_party_sites (organization_id, id) on delete cascade,
  constraint quality_supplier_scopes_category_fk
    foreign key (organization_id, category_id)
    references public.quality_supplier_categories (organization_id, id) on delete restrict
);

-- Un alcance por combinación. Sin esto aparecerían dos «ACME/Medellín/
-- Calibración» con decisiones distintas y ninguna forma de saber cuál manda.
-- Los tres índices cubren las combinaciones con nulos, que un índice único
-- normal trataría como distintas entre sí.
create unique index quality_supplier_scopes_full_uniq
  on public.quality_supplier_scopes (profile_id, site_id, category_id)
  where site_id is not null and category_id is not null;
create unique index quality_supplier_scopes_site_uniq
  on public.quality_supplier_scopes (profile_id, site_id)
  where site_id is not null and category_id is null;
create unique index quality_supplier_scopes_category_uniq
  on public.quality_supplier_scopes (profile_id, category_id)
  where site_id is null and category_id is not null;
create unique index quality_supplier_scopes_global_uniq
  on public.quality_supplier_scopes (profile_id)
  where site_id is null and category_id is null;

comment on table public.quality_supplier_scopes is
  'QUALITY-07 · GP-03 · La combinación proveedor + sede + categoría sobre la que se evalúa, se clasifica y se decide. Con sede y categoría nulas es el proveedor en su conjunto.';

create trigger t_quality_supplier_scopes_org_immutable
  before update on public.quality_supplier_scopes
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_supplier_scopes_force_created_by
  before insert on public.quality_supplier_scopes
  for each row execute function public.force_created_by();


-- ============================================================================
-- 5 · CRITICIDAD (GP-05, GP-20, §9…§12)
-- ----------------------------------------------------------------------------
-- CRITICIDAD ≠ DESEMPEÑO. La criticidad dice cuánto duele depender de este
-- proveedor; el desempeño dice cómo lo ha hecho. «Crítico y excelente» es una
-- combinación perfectamente normal, y un modelo que las mezcla no puede
-- expresarla.
--
-- LA METODOLOGÍA NO SE CABLEA, Y TAMPOCO SE REINVENTA
--
-- QUALITY-05 ya construyó un motor de metodologías versionadas con dimensiones
-- configurables, escalas, bandas de resultado y una derivación determinista que
-- explica su propio cálculo. Escribir aquí una segunda fórmula habría sido
-- exactamente la duplicación que MDR-46 evita, y además habría nacido peor: sin
-- versionado y sin explicación.
--
-- Así que el catálogo de metodologías se ENSANCHA para admitir un tercer
-- alcance. Es aditivo: `risk` y `opportunity` siguen valiendo, y nada de
-- QUALITY-05 deja de validar.
--
-- Y hay un regalo en la reutilización: la banda de resultado de una metodología
-- ya declara `review_months`. Eso es exactamente lo que GP-20 pide —que la
-- criticidad module la frecuencia de revisión— sin añadir una sola columna.
-- ----------------------------------------------------------------------------

alter table public.quality_risk_methodologies drop constraint quality_risk_methodologies_applies_to_check;
alter table public.quality_risk_methodologies add constraint quality_risk_methodologies_applies_to_check
  check (applies_to in ('risk', 'opportunity', 'supplier_criticality'));


create table public.quality_supplier_criticality_assessments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  scope_id          uuid not null,

  -- §12 · La versión con la que se clasificó queda ATADA a la clasificación.
  -- Publicar una metodología nueva no recalcula 2026, porque 2026 sigue
  -- señalando la versión de 2026.
  version_id        uuid not null,
  score             numeric(12,4) not null,
  level_id          uuid not null,
  level_label       text not null,
  color_token       text,
  -- GP-20 · Cada cuántos meses obliga a revisar ESTE nivel de criticidad.
  review_months     integer,
  -- La explicación del cálculo, tal como la produjo la derivación. Se guarda
  -- porque dentro de un año nadie va a poder reconstruirla de memoria.
  derivation        jsonb,

  assessed_on       date not null default current_date,
  rationale         text,
  decided_by        uuid references public.profiles (id),

  created_at        timestamptz not null default now(),

  constraint quality_supplier_criticality_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_criticality_label_not_blank check (length(trim(level_label)) > 0),
  constraint quality_supplier_criticality_scope_fk
    foreign key (organization_id, scope_id)
    references public.quality_supplier_scopes (organization_id, id) on delete cascade,
  constraint quality_supplier_criticality_version_fk
    foreign key (organization_id, version_id)
    references public.quality_risk_methodology_versions (organization_id, id) on delete restrict
);

create index quality_supplier_criticality_scope_idx
  on public.quality_supplier_criticality_assessments (organization_id, scope_id, assessed_on desc);

comment on table public.quality_supplier_criticality_assessments is
  'QUALITY-07 · GP-05/GP-20 · Clasificación de criticidad de un ALCANCE, con la versión de metodología que la produjo. Cambiar hoy la metodología no recalcula el pasado.';

-- §12/GP-30 · Una clasificación es un hecho fechado: no se corrige, se
-- sustituye clasificando otra vez.
create trigger t_quality_supplier_criticality_immutable
  before update on public.quality_supplier_criticality_assessments
  for each row execute function public.quality_ro_record_is_immutable();
create trigger t_audit_quality_supplier_criticality
  after insert or update or delete on public.quality_supplier_criticality_assessments
  for each row execute function public.audit_row_change();


create table public.quality_supplier_criticality_factors (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  assessment_id     uuid not null,
  scale_id          uuid not null,
  level_id          uuid not null,

  created_at        timestamptz not null default now(),

  constraint quality_supplier_criticality_factors_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_criticality_factors_assessment_fk
    foreign key (organization_id, assessment_id)
    references public.quality_supplier_criticality_assessments (organization_id, id) on delete cascade,
  constraint quality_supplier_criticality_factors_scale_fk
    foreign key (organization_id, scale_id)
    references public.quality_risk_scales (organization_id, id) on delete restrict,
  constraint quality_supplier_criticality_factors_level_fk
    foreign key (organization_id, level_id)
    references public.quality_risk_scale_levels (organization_id, id) on delete restrict
);

create unique index quality_supplier_criticality_factors_uniq
  on public.quality_supplier_criticality_factors (assessment_id, scale_id);

comment on table public.quality_supplier_criticality_factors is
  'QUALITY-07 · Qué valor se eligió en cada dimensión. Sin esto, la clasificación sería un número sin defensa.';

create trigger t_quality_supplier_criticality_factors_immutable
  before update on public.quality_supplier_criticality_factors
  for each row execute function public.quality_ro_record_is_immutable();


-- ============================================================================
-- 6 · REQUISITOS (GP-06, GP-17, §16, §17)
-- ----------------------------------------------------------------------------
-- GP-06 · Un requisito puede ser INFORMATIVO, EXIGIDO o BLOQUEANTE. Los tres
-- son necesarios: sin «informativo» todo lo que se quiere saber se convierte en
-- una barrera, y sin «bloqueante» no hay forma de decir «esto no se negocia».
--
-- §16 · El texto del requisito puede vivir en un documento de TrazaDocs. Aquí
-- se REFERENCIA; no se copia. Duplicar el texto es garantizar que un día digan
-- cosas distintas.
-- ============================================================================

create table public.quality_supplier_requirements (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  code              text,
  title             text not null,
  description       text,
  requirement_kind  text not null default 'documentary',
  -- GP-06 · Qué pasa si no se cumple.
  enforcement       text not null default 'required',
  trazadoc_document_id uuid,
  is_active         boolean not null default true,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_supplier_requirements_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_requirements_title_not_blank check (length(trim(title)) > 0),
  constraint quality_supplier_requirements_kind_check
    check (requirement_kind in ('legal', 'contractual', 'technical', 'documentary',
                                'certification', 'process', 'other')),
  constraint quality_supplier_requirements_enforcement_check
    check (enforcement in ('informational', 'required', 'blocking')),
  constraint quality_supplier_requirements_document_fk
    foreign key (organization_id, trazadoc_document_id)
    references public.trazadoc_documents (organization_id, id) on delete set null
);

create unique index quality_supplier_requirements_org_code_uniq
  on public.quality_supplier_requirements (organization_id, lower(code))
  where code is not null;

comment on table public.quality_supplier_requirements is
  'QUALITY-07 · GP-06 · Catálogo de requisitos aplicables a proveedores, con su nivel de exigencia: informativo, exigido o bloqueante.';

create trigger t_quality_supplier_requirements_updated
  before update on public.quality_supplier_requirements
  for each row execute function public.set_updated_at();
create trigger t_quality_supplier_requirements_org_immutable
  before update on public.quality_supplier_requirements
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_supplier_requirements_force_created_by
  before insert on public.quality_supplier_requirements
  for each row execute function public.force_created_by();


-- §17/GP-30 · La asignación lleva VIGENCIA. Exigir algo nuevo en 2027 no
-- vuelve incumplido a nadie en 2026, porque la evaluación de 2026 pregunta qué
-- estaba asignado en 2026 — no qué está asignado hoy.
--
-- La asignación puede colgar de una CATEGORÍA —«todo laboratorio necesita
-- acreditación»— o de un ALCANCE concreto. Las dos formas existen porque las
-- dos ocurren.
create table public.quality_supplier_requirement_assignments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  requirement_id    uuid not null,
  category_id       uuid,
  scope_id          uuid,

  effective_from    date not null default current_date,
  effective_to      date,
  note              text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_supplier_requirement_assignments_org_id_uniq unique (organization_id, id),
  -- O aplica a una categoría entera, o a un alcance concreto. Las dos a la vez
  -- serían dos reglas distintas escritas en una fila.
  constraint quality_supplier_requirement_assignments_target_check
    check ((category_id is not null) <> (scope_id is not null)),
  constraint quality_supplier_requirement_assignments_period_check
    check (effective_to is null or effective_to >= effective_from),
  constraint quality_supplier_requirement_assignments_requirement_fk
    foreign key (organization_id, requirement_id)
    references public.quality_supplier_requirements (organization_id, id) on delete cascade,
  constraint quality_supplier_requirement_assignments_category_fk
    foreign key (organization_id, category_id)
    references public.quality_supplier_categories (organization_id, id) on delete cascade,
  constraint quality_supplier_requirement_assignments_scope_fk
    foreign key (organization_id, scope_id)
    references public.quality_supplier_scopes (organization_id, id) on delete cascade
);

create index quality_supplier_requirement_assignments_category_idx
  on public.quality_supplier_requirement_assignments (organization_id, category_id, effective_from);
create index quality_supplier_requirement_assignments_scope_idx
  on public.quality_supplier_requirement_assignments (organization_id, scope_id, effective_from);

comment on table public.quality_supplier_requirement_assignments is
  'QUALITY-07 · §17/GP-30 · Qué se exige, a quién y DESDE CUÁNDO. La vigencia es lo que impide que una exigencia nueva vuelva incumplido el pasado.';

create trigger t_quality_supplier_requirement_assignments_updated
  before update on public.quality_supplier_requirement_assignments
  for each row execute function public.set_updated_at();
create trigger t_quality_supplier_requirement_assignments_org_immutable
  before update on public.quality_supplier_requirement_assignments
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_supplier_requirement_assignments_force_created_by
  before insert on public.quality_supplier_requirement_assignments
  for each row execute function public.force_created_by();


-- ============================================================================
-- 7 · DOCUMENTOS Y CERTIFICACIONES DEL PROVEEDOR (GP-17, GP-18, §25)
-- ----------------------------------------------------------------------------
-- GP-18 · Un documento vencido NO suspende a nadie automáticamente. Genera una
-- señal y una tarea; decidir qué hacer es de una persona. Es la misma regla que
-- QUALITY-06 aplicó a la evidencia de competencia, y por el mismo motivo: el
-- papel vencido es un hecho sobre el PAPEL.
-- ============================================================================

create table public.quality_supplier_documents (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  profile_id        uuid not null,
  scope_id          uuid,
  requirement_id    uuid,

  document_kind     text not null default 'certification',
  title             text not null,
  issuer            text,
  reference_code    text,
  issued_on         date,
  -- `null` = no vence. Es una respuesta legítima, no un campo olvidado.
  expires_on        date,
  status            text not null default 'valid',
  -- Se REFERENCIA el documento de TrazaDocs; no se copia su contenido.
  trazadoc_document_id uuid,
  note              text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_supplier_documents_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_documents_title_not_blank check (length(trim(title)) > 0),
  constraint quality_supplier_documents_kind_check
    check (document_kind in ('certification', 'license', 'insurance', 'contract',
                             'technical_sheet', 'test_report', 'audit_report', 'other')),
  constraint quality_supplier_documents_status_check
    check (status in ('valid', 'expired', 'revoked', 'pending')),
  constraint quality_supplier_documents_profile_fk
    foreign key (organization_id, profile_id)
    references public.quality_supplier_profiles (organization_id, id) on delete cascade,
  constraint quality_supplier_documents_scope_fk
    foreign key (organization_id, scope_id)
    references public.quality_supplier_scopes (organization_id, id) on delete set null,
  constraint quality_supplier_documents_requirement_fk
    foreign key (organization_id, requirement_id)
    references public.quality_supplier_requirements (organization_id, id) on delete set null,
  constraint quality_supplier_documents_document_fk
    foreign key (organization_id, trazadoc_document_id)
    references public.trazadoc_documents (organization_id, id) on delete set null
);

create index quality_supplier_documents_profile_idx
  on public.quality_supplier_documents (organization_id, profile_id, status);
create index quality_supplier_documents_expiry_idx
  on public.quality_supplier_documents (organization_id, expires_on)
  where expires_on is not null and status = 'valid';

comment on table public.quality_supplier_documents is
  'QUALITY-07 · GP-17/GP-18 · Documentos y certificaciones del proveedor, con vigencia propia. Vencer produce una señal, nunca una suspensión automática.';

create trigger t_quality_supplier_documents_updated
  before update on public.quality_supplier_documents
  for each row execute function public.set_updated_at();
create trigger t_quality_supplier_documents_org_immutable
  before update on public.quality_supplier_documents
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_supplier_documents_force_created_by
  before insert on public.quality_supplier_documents
  for each row execute function public.force_created_by();


-- ============================================================================
-- 8 · METODOLOGÍA DE EVALUACIÓN (GP-15, GP-30, §18, §19, §20)
-- ----------------------------------------------------------------------------
-- §18 · Una evaluación NO es un cuestionario. Un criterio puede puntuarse por
-- observación, por una medición, por evidencia documental o por cumplimiento de
-- un requisito. Reducirlo todo a veinte preguntas de sí/no es como se consigue
-- que nadie se crea el resultado.
--
-- §19/GP-30 · La plantilla se VERSIONA. La evaluación de 2026 conserva la
-- versión con la que se hizo, con sus criterios y sus pesos; publicar la v2 no
-- recalcula nada.
-- ============================================================================

create table public.quality_supplier_evaluation_templates (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  code              text,
  name              text not null,
  description       text,
  is_active         boolean not null default true,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_supplier_evaluation_templates_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_evaluation_templates_name_not_blank check (length(trim(name)) > 0)
);

create unique index quality_supplier_evaluation_templates_org_name_uniq
  on public.quality_supplier_evaluation_templates (organization_id, lower(name));

comment on table public.quality_supplier_evaluation_templates is
  'QUALITY-07 · §19 · Identidad estable de una metodología de evaluación de proveedores. Lo que cambia son sus versiones.';

create trigger t_quality_supplier_evaluation_templates_updated
  before update on public.quality_supplier_evaluation_templates
  for each row execute function public.set_updated_at();
create trigger t_quality_supplier_evaluation_templates_org_immutable
  before update on public.quality_supplier_evaluation_templates
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_supplier_evaluation_templates_force_created_by
  before insert on public.quality_supplier_evaluation_templates
  for each row execute function public.force_created_by();


create table public.quality_supplier_template_versions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  template_id       uuid not null,
  version_number    integer not null,
  status            text not null default 'draft',

  -- Cómo se combina lo puntuado. `weighted_average` reparte según los pesos de
  -- los criterios; `points` suma puntos obtenidos sobre puntos posibles. Las
  -- dos formas existen porque las dos se usan.
  scoring_rule      text not null default 'weighted_average',
  -- Bandas de resultado, declaradas por la empresa. Sin esto, un 72 no
  -- significa nada.
  bands             jsonb,
  change_note       text,
  effective_from    date,
  effective_to      date,

  published_by      uuid references public.profiles (id),
  published_at      timestamptz,
  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_supplier_template_versions_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_template_versions_uniq unique (template_id, version_number),
  constraint quality_supplier_template_versions_number_check check (version_number >= 1),
  constraint quality_supplier_template_versions_status_check
    check (status in ('draft', 'published', 'superseded')),
  constraint quality_supplier_template_versions_rule_check
    check (scoring_rule in ('weighted_average', 'points')),
  constraint quality_supplier_template_versions_period_check
    check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint quality_supplier_template_versions_published_fields_check
    check (status = 'draft' or (effective_from is not null and published_at is not null)),
  constraint quality_supplier_template_versions_template_fk
    foreign key (organization_id, template_id)
    references public.quality_supplier_evaluation_templates (organization_id, id) on delete cascade
);

-- Un solo borrador por plantilla: dos borradores compiten y nadie sabe cuál se
-- va a publicar.
create unique index quality_supplier_template_versions_single_draft
  on public.quality_supplier_template_versions (template_id) where status = 'draft';
create index quality_supplier_template_versions_template_idx
  on public.quality_supplier_template_versions (organization_id, template_id, version_number desc);

comment on table public.quality_supplier_template_versions is
  'QUALITY-07 · GP-30 · Versión de la metodología, con su regla de puntuación y sus bandas. Una evaluación queda atada a la versión con la que se hizo.';

create trigger t_quality_supplier_template_versions_updated
  before update on public.quality_supplier_template_versions
  for each row execute function public.set_updated_at();
create trigger t_quality_supplier_template_versions_org_immutable
  before update on public.quality_supplier_template_versions
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_supplier_template_versions_force_created_by
  before insert on public.quality_supplier_template_versions
  for each row execute function public.force_created_by();
create trigger t_audit_quality_supplier_template_versions
  after insert or update or delete on public.quality_supplier_template_versions
  for each row execute function public.audit_row_change();


-- §20 · Los criterios cuelgan de la VERSIÓN, no de la plantilla. Es lo que hace
-- que cambiar el peso de «Entrega» de 40 a 30 no reescriba la evaluación del
-- año pasado.
create table public.quality_supplier_evaluation_criteria (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  version_id        uuid not null,
  code              text not null,
  label             text not null,
  guidance          text,
  -- Peso relativo para `weighted_average`; puntos máximos para `points`.
  weight            numeric(8,3) not null default 1,
  max_points        numeric(8,3) not null default 100,
  -- Cómo se espera puntuar este criterio. §18: no todo es un sí/no.
  evaluation_method text not null default 'observation',
  -- Qué evidencia se espera. Es una expectativa declarada, no una obligación
  -- técnica: obligarla convertiría la evaluación en un trámite documental.
  evidence_expectation text,
  -- GP-06 · Un criterio puede estar atado a un requisito del catálogo.
  requirement_id    uuid,
  position_order    integer not null default 1,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_supplier_evaluation_criteria_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_evaluation_criteria_label_not_blank check (length(trim(label)) > 0),
  constraint quality_supplier_evaluation_criteria_weight_check check (weight >= 0),
  constraint quality_supplier_evaluation_criteria_points_check check (max_points > 0),
  constraint quality_supplier_evaluation_criteria_method_check
    check (evaluation_method in ('observation', 'indicator', 'document_review', 'audit',
                                 'requirement_compliance', 'operational_data', 'other')),
  constraint quality_supplier_evaluation_criteria_version_fk
    foreign key (organization_id, version_id)
    references public.quality_supplier_template_versions (organization_id, id) on delete cascade,
  constraint quality_supplier_evaluation_criteria_requirement_fk
    foreign key (organization_id, requirement_id)
    references public.quality_supplier_requirements (organization_id, id) on delete set null
);

create unique index quality_supplier_evaluation_criteria_code_uniq
  on public.quality_supplier_evaluation_criteria (version_id, lower(code));
create index quality_supplier_evaluation_criteria_version_idx
  on public.quality_supplier_evaluation_criteria (organization_id, version_id, position_order);

comment on table public.quality_supplier_evaluation_criteria is
  'QUALITY-07 · §20 · Criterio de una VERSIÓN de la plantilla, con su peso, su método y la evidencia que se espera.';

create trigger t_quality_supplier_evaluation_criteria_updated
  before update on public.quality_supplier_evaluation_criteria
  for each row execute function public.set_updated_at();
create trigger t_quality_supplier_evaluation_criteria_org_immutable
  before update on public.quality_supplier_evaluation_criteria
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_supplier_evaluation_criteria_force_created_by
  before insert on public.quality_supplier_evaluation_criteria
  for each row execute function public.force_created_by();


-- ============================================================================
-- 9 · EVALUACIONES (GP-16, §21, §22, §23, §30)
-- ----------------------------------------------------------------------------
-- GP-16 · Selección, evaluación y reevaluación son EVENTOS DISTINTOS. Aquí se
-- distinguen por `evaluation_kind`, no por tres tablas: son el mismo hecho
-- —juzgar a un proveedor contra una metodología en una fecha— con propósitos
-- distintos, y tres tablas gemelas habrían triplicado el motor de puntuación
-- para no añadir ni un dato.
--
-- §30 · Una evaluación NO se edita para convertirla en la del año siguiente. La
-- de 2027 es una fila nueva. Por eso una evaluación cerrada es inmutable.
-- ============================================================================

create table public.quality_supplier_evaluations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  scope_id          uuid not null,
  version_id        uuid not null,

  -- GP-16 · Qué clase de evento es.
  evaluation_kind   text not null default 'periodic',
  -- GP-25 · Cuando es extraordinaria, POR QUÉ se disparó.
  trigger_reason    text,

  period_label      text,
  period_start      date,
  period_end        date,
  evaluated_on      date,

  status            text not null default 'draft',

  -- §21 · El resultado es información, NO la decisión. Se guarda con su banda
  -- para que se pueda leer sin recalcular, pero no aprueba a nadie.
  score             numeric(8,3),
  result_band       text,
  -- §23 · Cuántos criterios quedaron sin puntuar y por qué. Sin esto, un 90
  -- sobre tres criterios de veinte parecería un 90.
  criteria_total       integer not null default 0,
  criteria_scored      integer not null default 0,
  criteria_not_applicable integer not null default 0,
  criteria_unavailable    integer not null default 0,
  criteria_not_evaluated  integer not null default 0,

  summary           text,
  evaluated_by      uuid references public.profiles (id),
  closed_at         timestamptz,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_supplier_evaluations_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_evaluations_kind_check
    check (evaluation_kind in ('selection', 'periodic', 'reevaluation', 'extraordinary')),
  constraint quality_supplier_evaluations_status_check
    check (status in ('draft', 'in_progress', 'closed', 'cancelled')),
  constraint quality_supplier_evaluations_period_check
    check (period_end is null or period_start is null or period_end >= period_start),
  constraint quality_supplier_evaluations_closed_fields_check
    check (status <> 'closed' or (evaluated_on is not null and closed_at is not null)),
  constraint quality_supplier_evaluations_scope_fk
    foreign key (organization_id, scope_id)
    references public.quality_supplier_scopes (organization_id, id) on delete restrict,
  constraint quality_supplier_evaluations_version_fk
    foreign key (organization_id, version_id)
    references public.quality_supplier_template_versions (organization_id, id) on delete restrict
);

create index quality_supplier_evaluations_scope_idx
  on public.quality_supplier_evaluations (organization_id, scope_id, evaluated_on desc);
create index quality_supplier_evaluations_status_idx
  on public.quality_supplier_evaluations (organization_id, status);

comment on table public.quality_supplier_evaluations is
  'QUALITY-07 · GP-16/§21 · Un acto de evaluación: selección, periódica, reevaluación o extraordinaria. La puntuación informa; NO es la decisión de aprobación.';

create trigger t_quality_supplier_evaluations_updated
  before update on public.quality_supplier_evaluations
  for each row execute function public.set_updated_at();
create trigger t_quality_supplier_evaluations_org_immutable
  before update on public.quality_supplier_evaluations
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_supplier_evaluations_force_created_by
  before insert on public.quality_supplier_evaluations
  for each row execute function public.force_created_by();
create trigger t_audit_quality_supplier_evaluations
  after insert or update or delete on public.quality_supplier_evaluations
  for each row execute function public.audit_row_change();


-- §22/§23 · LAS CUATRO AUSENCIAS, que no son la misma cosa:
--
--   scored          · se puntuó
--   not_applicable  · el criterio no aplica a este alcance
--   unavailable     · aplica, pero no se pudo obtener el dato
--   not_evaluated   · aplica y se pudo, pero nadie lo evaluó
--
-- Convertir cualquiera de las tres últimas en un 0 castiga al proveedor por
-- algo que no hizo. Y colapsarlas en un solo «sin dato» impide distinguir un
-- criterio que no venía al caso de uno que se olvidó.
create table public.quality_supplier_evaluation_results (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  evaluation_id     uuid not null,
  criterion_id      uuid not null,

  outcome           text not null default 'not_evaluated',
  -- Solo tiene sentido cuando `outcome = 'scored'`. La restricción lo exige.
  points            numeric(8,3),
  observation       text,
  -- §24 · La evidencia se REFERENCIA. El documento vive en TrazaDocs o en el
  -- registro documental del proveedor; aquí solo se apunta.
  supplier_document_id uuid,
  trazadoc_document_id uuid,
  indicator_id      uuid,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_supplier_evaluation_results_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_evaluation_results_outcome_check
    check (outcome in ('scored', 'not_applicable', 'unavailable', 'not_evaluated')),
  -- Un criterio puntuado tiene puntos; uno no aplicable NO puede tenerlos.
  -- Sin esta comprobación, un «no aplica» con un 0 escrito al lado acabaría
  -- contando como un cero.
  constraint quality_supplier_evaluation_results_points_check
    check ((outcome = 'scored' and points is not null and points >= 0)
        or (outcome <> 'scored' and points is null)),
  constraint quality_supplier_evaluation_results_evaluation_fk
    foreign key (organization_id, evaluation_id)
    references public.quality_supplier_evaluations (organization_id, id) on delete cascade,
  constraint quality_supplier_evaluation_results_criterion_fk
    foreign key (organization_id, criterion_id)
    references public.quality_supplier_evaluation_criteria (organization_id, id) on delete restrict,
  constraint quality_supplier_evaluation_results_document_fk
    foreign key (organization_id, supplier_document_id)
    references public.quality_supplier_documents (organization_id, id) on delete set null,
  constraint quality_supplier_evaluation_results_trazadoc_fk
    foreign key (organization_id, trazadoc_document_id)
    references public.trazadoc_documents (organization_id, id) on delete set null,
  constraint quality_supplier_evaluation_results_indicator_fk
    foreign key (organization_id, indicator_id)
    references public.quality_indicators (organization_id, id) on delete set null
);

create unique index quality_supplier_evaluation_results_uniq
  on public.quality_supplier_evaluation_results (evaluation_id, criterion_id);

comment on table public.quality_supplier_evaluation_results is
  'QUALITY-07 · §22/§23 · Resultado por criterio. «No aplica», «sin dato» y «sin evaluar» son estados propios: ninguno se convierte en un cero.';

create trigger t_quality_supplier_evaluation_results_updated
  before update on public.quality_supplier_evaluation_results
  for each row execute function public.set_updated_at();
create trigger t_quality_supplier_evaluation_results_org_immutable
  before update on public.quality_supplier_evaluation_results
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_supplier_evaluation_results_force_created_by
  before insert on public.quality_supplier_evaluation_results
  for each row execute function public.force_created_by();


-- §30/GP-16 · UNA EVALUACIÓN CERRADA NO SE REESCRIBE.
--
-- Sin esto, un `update` normal cambia la puntuación de una evaluación de hace
-- dos años y la comparación entre periodos deja de significar nada: la línea
-- de evolución se movería sin que nadie hubiera evaluado otra vez. Reevaluar
-- es abrir una evaluación NUEVA, y por eso este camino tiene que estar
-- cerrado incluso para quien administra el dominio.
--
-- La transición del cierre pasa: en ese momento la fila TODAVÍA no está
-- cerrada, así que la guarda mira `old.status`, no `new.status`.
create or replace function public.quality_supplier_evaluation_is_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'closed' then
      raise exception 'Una evaluación cerrada no se elimina: se conserva y se evalúa otra vez.';
    end if;
    return old;
  end if;
  if old.status = 'closed' then
    raise exception 'Esta evaluación ya está cerrada. Si hay que volver a medir, se abre una evaluación nueva: reescribir la anterior movería la comparación entre periodos.';
  end if;
  return new;
end;
$$;

create trigger t_quality_supplier_evaluation_closed_is_final
  before update or delete on public.quality_supplier_evaluations
  for each row execute function public.quality_supplier_evaluation_is_closed();

-- Y lo mismo con sus resultados: cambiar un criterio de una evaluación cerrada
-- cambiaría su puntuación por la puerta de atrás.
create or replace function public.quality_supplier_result_parent_is_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from quality_supplier_evaluations
   where id = coalesce(new.evaluation_id, old.evaluation_id);
  if v_status = 'closed' then
    raise exception 'La evaluación ya está cerrada: sus criterios no se pueden cambiar.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger t_quality_supplier_result_parent_is_open
  before insert or update or delete on public.quality_supplier_evaluation_results
  for each row execute function public.quality_supplier_result_parent_is_open();


-- ============================================================================
-- 10 · DECISIONES DE APROBACIÓN (GP-07, GP-08, GP-12, GP-19, §13…§15, §36)
-- ----------------------------------------------------------------------------
-- §21/GP-07 · Un 72 no aprueba a nadie. La decisión es un acto humano, con
-- alcance, fundamento, vigencia y condiciones, y se conserva entera.
--
-- §15 · La aprobación es POR ALCANCE. Un booleano `supplier.approved` destruye
-- la pregunta que de verdad importa: aprobado ¿para qué? ACME puede estar
-- aprobado para materia prima y no para calibración, y eso no es un caso raro:
-- es lo normal.
--
-- GP-12/§36 · Suspender o retirar NO borra nada. Es otra decisión, con su
-- fecha, y la anterior se conserva.
-- ============================================================================

create table public.quality_supplier_approval_decisions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  scope_id          uuid not null,
  -- La evaluación que INFORMÓ la decisión, cuando la hubo. Opcional a
  -- propósito: una suspensión por un incidente grave no espera a una
  -- evaluación, y exigirla obligaría a inventar una.
  evaluation_id     uuid,

  decision          text not null,
  rationale         text not null,
  -- GP-19 · Condiciones temporales de una aprobación condicionada.
  conditions        text,
  effective_from    date not null default current_date,
  valid_until       date,
  -- Cuándo hay que volver a mirar esta decisión. Puede venir de la criticidad.
  review_on         date,

  decided_by        uuid references public.profiles (id),
  decided_at        timestamptz not null default now(),

  -- GP-12 · Qué decisión deja sin efecto a esta. Se enlaza en vez de borrarla.
  superseded_by     uuid,

  constraint quality_supplier_approval_decisions_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_approval_decisions_decision_check
    check (decision in ('approved', 'conditionally_approved', 'rejected',
                        'suspended', 'reinstated', 'withdrawn')),
  constraint quality_supplier_approval_decisions_rationale_not_blank
    check (length(trim(rationale)) > 0),
  -- GP-19 · Una aprobación condicionada sin condiciones escritas es una
  -- aprobación a secas con una etiqueta puesta encima.
  constraint quality_supplier_approval_decisions_conditions_check
    check (decision <> 'conditionally_approved' or length(trim(coalesce(conditions, ''))) > 0),
  constraint quality_supplier_approval_decisions_validity_check
    check (valid_until is null or valid_until >= effective_from),
  constraint quality_supplier_approval_decisions_scope_fk
    foreign key (organization_id, scope_id)
    references public.quality_supplier_scopes (organization_id, id) on delete cascade,
  constraint quality_supplier_approval_decisions_evaluation_fk
    foreign key (organization_id, evaluation_id)
    references public.quality_supplier_evaluations (organization_id, id) on delete set null,
  constraint quality_supplier_approval_decisions_superseded_fk
    foreign key (organization_id, superseded_by)
    references public.quality_supplier_approval_decisions (organization_id, id) on delete set null
);

create index quality_supplier_approval_decisions_scope_idx
  on public.quality_supplier_approval_decisions (organization_id, scope_id, effective_from desc);

comment on table public.quality_supplier_approval_decisions is
  'QUALITY-07 · GP-07/GP-12 · Decisión humana de aprobación POR ALCANCE, con fundamento, vigencia y condiciones. Append-only: una decisión nueva sustituye, no borra.';

-- MDR-49 · Una decisión formal es un hecho. Solo se admite enlazarla como
-- sustituida; su contenido no se reescribe.
create or replace function public.quality_supplier_decision_is_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.scope_id      is distinct from old.scope_id
  or new.decision      is distinct from old.decision
  or new.rationale     is distinct from old.rationale
  or new.conditions    is distinct from old.conditions
  or new.effective_from is distinct from old.effective_from
  or new.valid_until   is distinct from old.valid_until
  or new.decided_by    is distinct from old.decided_by
  or new.decided_at    is distinct from old.decided_at then
    raise exception 'Una decisión de aprobación no se reescribe. Registra una decisión nueva.';
  end if;
  return new;
end;
$$;
revoke all on function public.quality_supplier_decision_is_immutable() from public, anon, authenticated;

create trigger t_quality_supplier_decision_immutable
  before update on public.quality_supplier_approval_decisions
  for each row execute function public.quality_supplier_decision_is_immutable();
create trigger t_audit_quality_supplier_decisions
  after insert or update or delete on public.quality_supplier_approval_decisions
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 11 · INCIDENTES Y SEÑALES (GP-21, GP-22, GP-26, §27, §31, §32)
-- ----------------------------------------------------------------------------
-- GP-21 · Un incidente con un proveedor es INDEPENDIENTE de la evaluación
-- periódica: ocurre cuando ocurre, no cuando toca evaluar.
--
-- GP-22/§32 · Y NO se convierte en no conformidad por su cuenta. Una entrega
-- tardía es una entrega tardía. Abrir un caso del sistema de gestión es una
-- decisión humana, y por eso `case_id` se rellena solo cuando alguien la toma.
-- ============================================================================

create table public.quality_supplier_incidents (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  profile_id        uuid not null,
  scope_id          uuid,

  incident_kind     text not null default 'delivery',
  severity          text not null default 'minor',
  occurred_on       date not null default current_date,
  title             text not null,
  description       text,

  -- GP-26 · Un fallo de la integración no es un deterioro del proveedor. Si el
  -- dato llegó mal, se dice, y no se le imputa a nadie.
  is_data_issue     boolean not null default false,

  status            text not null default 'open',
  -- §33 · El caso del SGC, cuando alguien decide abrirlo. Nulo mientras nadie
  -- lo decida, que es lo normal.
  case_id           uuid,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_supplier_incidents_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_incidents_title_not_blank check (length(trim(title)) > 0),
  constraint quality_supplier_incidents_kind_check
    check (incident_kind in ('delivery', 'quality', 'documentation', 'service',
                             'safety', 'environment', 'communication', 'other')),
  constraint quality_supplier_incidents_severity_check
    check (severity in ('minor', 'moderate', 'major', 'critical')),
  constraint quality_supplier_incidents_status_check
    check (status in ('open', 'under_review', 'closed', 'dismissed')),
  constraint quality_supplier_incidents_profile_fk
    foreign key (organization_id, profile_id)
    references public.quality_supplier_profiles (organization_id, id) on delete cascade,
  constraint quality_supplier_incidents_scope_fk
    foreign key (organization_id, scope_id)
    references public.quality_supplier_scopes (organization_id, id) on delete set null,
  constraint quality_supplier_incidents_case_fk
    foreign key (organization_id, case_id)
    references public.work_cases (organization_id, id) on delete set null
);

create index quality_supplier_incidents_profile_idx
  on public.quality_supplier_incidents (organization_id, profile_id, occurred_on desc);

comment on table public.quality_supplier_incidents is
  'QUALITY-07 · GP-21/GP-22 · Un hecho con el proveedor. No es una no conformidad: abrir un caso del SGC es una decisión humana que queda registrada en `case_id`.';

create trigger t_quality_supplier_incidents_updated
  before update on public.quality_supplier_incidents
  for each row execute function public.set_updated_at();
create trigger t_quality_supplier_incidents_org_immutable
  before update on public.quality_supplier_incidents
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_supplier_incidents_force_created_by
  before insert on public.quality_supplier_incidents
  for each row execute function public.force_created_by();
create trigger t_audit_quality_supplier_incidents
  after insert or update or delete on public.quality_supplier_incidents
  for each row execute function public.audit_row_change();


-- §27 · Quality by observation. La señal la CALCULA el barrido; el incidente lo
-- REGISTRA una persona. Son cosas distintas y por eso son tablas distintas.
--
-- SEÑAL ≠ EVALUACIÓN ≠ NO CONFORMIDAD ≠ SUSPENSIÓN. Una señal dice «mira
-- esto»; las otras tres las decide alguien.
create table public.quality_supplier_signals (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  profile_id        uuid not null,
  scope_id          uuid,
  signal_kind       text not null,
  detail            text,
  status            text not null default 'open',

  -- Trazabilidad de la decisión humana de escalar, si se toma.
  case_id           uuid,
  promoted_by       uuid references public.profiles (id),
  promoted_at       timestamptz,

  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  resolved_at       timestamptz,

  constraint quality_supplier_signals_org_id_uniq unique (organization_id, id),
  constraint quality_supplier_signals_kind_check
    check (signal_kind in ('reevaluation_overdue', 'approval_expired', 'document_expired',
                           'document_expiring', 'evaluation_declined', 'incident_streak',
                           'critical_without_approval', 'no_evaluation_yet')),
  constraint quality_supplier_signals_status_check
    check (status in ('open', 'resolved', 'dismissed')),
  constraint quality_supplier_signals_promoted_fields
    check ((case_id is null) = (promoted_at is null)),
  constraint quality_supplier_signals_profile_fk
    foreign key (organization_id, profile_id)
    references public.quality_supplier_profiles (organization_id, id) on delete cascade,
  constraint quality_supplier_signals_scope_fk
    foreign key (organization_id, scope_id)
    references public.quality_supplier_scopes (organization_id, id) on delete cascade,
  constraint quality_supplier_signals_case_fk
    foreign key (organization_id, case_id)
    references public.work_cases (organization_id, id) on delete set null
);

-- Idempotencia del barrido: una señal abierta por alcance y tipo. El segundo
-- barrido mueve `last_seen_at`, no crea una fila.
create unique index quality_supplier_signals_open_scope_uniq
  on public.quality_supplier_signals (scope_id, signal_kind)
  where status = 'open' and scope_id is not null;
create unique index quality_supplier_signals_open_profile_uniq
  on public.quality_supplier_signals (profile_id, signal_kind)
  where status = 'open' and scope_id is null;

comment on table public.quality_supplier_signals is
  'QUALITY-07 · §27/§32 · Observación calculada sobre un proveedor. No es una evaluación, ni una no conformidad, ni una suspensión: escalarla es humano.';

create trigger t_quality_supplier_signals_org_immutable
  before update on public.quality_supplier_signals
  for each row execute function public.prevent_organization_id_change();


-- ============================================================================
-- 12 · ENSANCHE DE LOS MOTORES TRANSVERSALES (MDR-46, §34, §45, §46)
-- ----------------------------------------------------------------------------
-- Aquí NO se crean `quality_supplier_actions`, `quality_supplier_tasks` ni
-- `quality_supplier_alerts`. Se admiten los sujetos nuevos en los catálogos
-- cerrados que ya existen. El ensanche es ADITIVO: ningún valor anterior
-- desaparece, así que nada de QUALITY-01…06.1 deja de validar.
--
-- §34/§35 · Una acción formal sobre un proveedor es una `work_action` con la
-- semántica de QUALITY-04. «Acción correctiva» sigue significando lo que
-- significaba: un plan de mejora del proveedor no se disfraza de acción
-- correctiva solo porque haya que hacer algo.
-- ============================================================================

alter table public.work_tasks  drop constraint work_tasks_source_domain_check;
alter table public.work_tasks  add constraint work_tasks_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action',
                           'risk','opportunity','control',
                           'person','position','competence','development',
                           'learning','performance','knowledge','lesson',
                           'supplier'));
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
                          'quality_supplier_evaluation','quality_supplier_document'));
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
                       'supplier_criticality_review'));

alter table public.work_alerts drop constraint work_alerts_source_domain_check;
alter table public.work_alerts add constraint work_alerts_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action',
                           'risk','opportunity','control',
                           'person','position','competence','development',
                           'learning','performance','knowledge','lesson',
                           'supplier'));
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
                          'quality_supplier_evaluation','quality_supplier_document'));
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
                        -- §25/GP-18 · Ninguno de estos suspende a nadie: dicen
                        -- que hay algo que revisar.
                        'supplier_reevaluation_overdue','supplier_approval_expiring',
                        'supplier_approval_expired','supplier_document_expiring',
                        'supplier_document_expired','supplier_critical_unapproved',
                        'supplier_incident_streak'));

alter table public.work_events drop constraint work_events_source_domain_check;
alter table public.work_events add constraint work_events_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action',
                           'risk','opportunity','control',
                           'person','position','competence','development',
                           'learning','performance','knowledge','lesson',
                           'supplier'));
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
                          'quality_supplier_evaluation','quality_supplier_document'));
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
                        'lesson.published','lesson.proposal_decided',
                        'supplier.registered','supplier.adopted','supplier.classified',
                        'supplier.evaluated','supplier.approved','supplier.suspended',
                        'supplier.reinstated','supplier.withdrawn','supplier.incident_recorded',
                        'supplier.document_expired'));

-- MDR-49 · Las decisiones formales sobre proveedores viven en el MISMO libro
-- que las de casos, riesgos y personas.
alter table public.work_decisions drop constraint work_decisions_subject_kind_check;
alter table public.work_decisions add constraint work_decisions_subject_kind_check
  check (subject_kind in ('case','action','risk','opportunity','control',
                          'person_competency','performance_evaluation','lesson',
                          'knowledge_transfer',
                          'supplier_scope','supplier_evaluation'));
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
                           'knowledge_transfer_verification',
                           'supplier_criticality','supplier_evaluation_closed',
                           'supplier_approval'));

-- §24/§33 · La evidencia y el contexto de un proveedor REUTILIZAN el motor de
-- referencias. No hay un segundo almacén de archivos para proveedores.
alter table public.work_references drop constraint work_references_owner_kind_check;
alter table public.work_references add constraint work_references_owner_kind_check
  check (owner_kind in ('case','action','risk','opportunity','control','risk_assessment',
                        'person_competency','competency_evidence','knowledge_item',
                        'knowledge_transfer_plan','lesson','development_need',
                        'learning_activity','performance_evaluation',
                        'supplier_profile','supplier_scope','supplier_evaluation',
                        'supplier_incident'));
alter table public.work_references drop constraint work_references_ref_kind_check;
alter table public.work_references add constraint work_references_ref_kind_check
  check (ref_kind in ('quality_indicator','quality_measurement','quality_process',
                      'quality_process_revision','quality_process_io','trazadoc_document',
                      'trazadoc_document_revision','work_case','work_action',
                      'quality_objective','quality_risk','quality_opportunity',
                      'quality_control','quality_risk_assessment','quality_risk_materialization',
                      'quality_person','quality_position','quality_competency',
                      'quality_person_competency','quality_knowledge_item',
                      'quality_lesson_learned','quality_learning_activity',
                      'quality_external_party','quality_supplier_profile',
                      'quality_supplier_scope','quality_supplier_evaluation',
                      'quality_supplier_document','quality_supplier_incident'));


-- El validador de referencias aprende los tipos nuevos. Se reescribe entero
-- conservando cada rama: cada tipo se resuelve por su nombre, sin un `else` que
-- valide una cosa contra la tabla de otra.
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
-- 13 · PERMISOS DEL DOMINIO
-- ----------------------------------------------------------------------------
-- Los datos de un proveedor son datos EMPRESARIALES, no personales (§49). No
-- hacen falta los tres círculos de QUALITY-06: cualquier miembro puede
-- consultarlos, y quien gestiona el sistema de gestión los administra.
--
-- La decisión de aprobación es el acto más serio del dominio y se reserva a
-- `admin` y `quality`: un consultor externo acompaña la implantación, pero
-- homologar a un proveedor es una responsabilidad de la empresa.
-- ----------------------------------------------------------------------------

create or replace function public.quality_manages_suppliers(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_org_role(p_organization_id, array['admin', 'quality', 'consultant']);
$$;
revoke all on function public.quality_manages_suppliers(uuid) from public, anon;
grant execute on function public.quality_manages_suppliers(uuid) to authenticated;

comment on function public.quality_manages_suppliers(uuid) is
  'QUALITY-07 · Quién administra el dominio de proveedores: registrar, clasificar, evaluar y documentar.';

create or replace function public.quality_decides_supplier_approval(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_org_role(p_organization_id, array['admin', 'quality']);
$$;
revoke all on function public.quality_decides_supplier_approval(uuid) from public, anon;
grant execute on function public.quality_decides_supplier_approval(uuid) to authenticated;

comment on function public.quality_decides_supplier_approval(uuid) is
  'QUALITY-07 · GP-07 · Quién puede homologar, condicionar, suspender o retirar. El consultor queda fuera: es una responsabilidad de la empresa.';


-- ============================================================================
-- 14 · VISTAS DERIVADAS (GP-08, §41, §42, §43)
-- ----------------------------------------------------------------------------
-- Todas con `security_invoker = true`: sin eso una vista se ejecuta con los
-- permisos de su dueño y se convierte en un túnel por debajo de RLS.
-- ----------------------------------------------------------------------------

-- La decisión VIGENTE de cada alcance. Es la pieza sobre la que se apoya todo
-- lo demás: sin ella habría que repetir «la última decisión no sustituida y no
-- vencida» en cinco sitios, y bastaría con que uno lo escribiera distinto.
create or replace view public.v_quality_supplier_scope_status
with (security_invoker = true) as
select
  s.organization_id,
  s.id                       as scope_id,
  s.profile_id,
  s.site_id,
  st.name                    as site_name,
  s.category_id,
  c.name                     as category_name,
  d.id                       as decision_id,
  d.decision,
  d.effective_from           as decision_from,
  d.valid_until              as decision_valid_until,
  d.conditions,
  -- Una aprobación con fecha de caducidad pasada NO es una aprobación vigente,
  -- aunque nadie la haya tocado. Decir lo contrario sería dar por bueno algo
  -- que la propia empresa puso fecha de revisar.
  (d.decision in ('approved', 'conditionally_approved', 'reinstated')
     and (d.valid_until is null or d.valid_until >= current_date)) as is_approved_now,
  (d.valid_until is not null and d.valid_until < current_date)     as approval_expired,
  cr.level_label             as criticality_label,
  cr.score                   as criticality_score,
  cr.review_months           as criticality_review_months,
  cr.assessed_on             as criticality_assessed_on,
  ev.id                      as last_evaluation_id,
  ev.evaluated_on            as last_evaluated_on,
  ev.score                   as last_score,
  ev.result_band             as last_result_band
from public.quality_supplier_scopes s
left join public.quality_external_party_sites st
  on st.organization_id = s.organization_id and st.id = s.site_id
left join public.quality_supplier_categories c
  on c.organization_id = s.organization_id and c.id = s.category_id
left join lateral (
  select x.* from public.quality_supplier_approval_decisions x
   where x.organization_id = s.organization_id
     and x.scope_id = s.id
     and x.superseded_by is null
   order by x.effective_from desc, x.decided_at desc
   limit 1
) d on true
left join lateral (
  select y.* from public.quality_supplier_criticality_assessments y
   where y.organization_id = s.organization_id
     and y.scope_id = s.id
   order by y.assessed_on desc, y.created_at desc
   limit 1
) cr on true
left join lateral (
  select z.* from public.quality_supplier_evaluations z
   where z.organization_id = s.organization_id
     and z.scope_id = s.id
     and z.status = 'closed'
   order by z.evaluated_on desc, z.created_at desc
   limit 1
) ev on true;

comment on view public.v_quality_supplier_scope_status is
  'QUALITY-07 · La situación VIGENTE de un alcance: decisión sin sustituir, criticidad y última evaluación cerrada. Una aprobación caducada deja de contar como vigente.';


-- §41 · La ficha 360, resumida para el listado. Une identidad, relación y lo
-- que hace falta para decidir si hay que mirar a este proveedor hoy.
create or replace view public.v_quality_supplier_overview
with (security_invoker = true) as
select
  p.organization_id,
  p.id                        as profile_id,
  p.party_id,
  ep.legal_name,
  ep.trade_name,
  ep.tax_id,
  ep.country,
  ep.city,
  ep.status                   as party_status,
  p.relationship_status,
  p.owner_position_id,
  pos.name                    as owner_position_name,
  p.reevaluation_months,
  p.next_review_on,
  p.last_evaluated_on,
  (p.next_review_on is not null and p.next_review_on < current_date) as reevaluation_overdue,
  agg.scope_count,
  agg.approved_scope_count,
  agg.expired_approval_count,
  agg.max_criticality_score,
  agg.top_criticality_label,
  docs.expiring_document_count,
  inc.open_incident_count,
  -- Los enlaces con los módulos operativos. Que estén aquí es lo que permite
  -- responder «¿este es el mismo ACME que me entrega los lotes?» sin salir de
  -- la ficha.
  src.cpr_supplier_id,
  src.textile_supplier_id
from public.quality_supplier_profiles p
join public.quality_external_parties ep
  on ep.organization_id = p.organization_id and ep.id = p.party_id
left join public.quality_positions pos
  on pos.organization_id = p.organization_id and pos.id = p.owner_position_id
left join lateral (
  select
    count(*)                                                   as scope_count,
    count(*) filter (where ss.is_approved_now)                 as approved_scope_count,
    count(*) filter (where ss.approval_expired)                as expired_approval_count,
    max(ss.criticality_score)                                  as max_criticality_score,
    (array_agg(ss.criticality_label order by ss.criticality_score desc nulls last))[1]
                                                               as top_criticality_label
  from public.v_quality_supplier_scope_status ss
  where ss.organization_id = p.organization_id and ss.profile_id = p.id
) agg on true
left join lateral (
  select count(*) as expiring_document_count
  from public.quality_supplier_documents sd
  where sd.organization_id = p.organization_id
    and sd.profile_id = p.id
    and sd.expires_on is not null
    and sd.expires_on <= current_date + 30
    and sd.status in ('valid', 'expired')
) docs on true
left join lateral (
  select count(*) as open_incident_count
  from public.quality_supplier_incidents si
  where si.organization_id = p.organization_id
    and si.profile_id = p.id
    and si.status in ('open', 'under_review')
) inc on true
left join lateral (
  select
    (select s.id from public.suppliers s
      where s.organization_id = p.organization_id and s.external_party_id = p.party_id
      limit 1) as cpr_supplier_id,
    (select t.id from public.textile_suppliers t
      where t.organization_id = p.organization_id and t.external_party_id = p.party_id
      limit 1) as textile_supplier_id
) src on true;

comment on view public.v_quality_supplier_overview is
  'QUALITY-07 · §41 · La ficha resumida del proveedor, con su identidad, su relación, sus alcances y sus enlaces con PCR y Textiles.';


-- GP-08 · La Lista de Proveedores Aprobados es AUTOMÁTICA: no se mantiene a
-- mano, se deriva de las decisiones vigentes. Una lista que hay que actualizar
-- a mano es una lista que un día deja de ser cierta.
create or replace view public.v_quality_approved_supplier_list
with (security_invoker = true) as
select
  ss.organization_id,
  ss.profile_id,
  ep.legal_name,
  ep.tax_id,
  ss.scope_id,
  ss.site_name,
  ss.category_name,
  ss.decision,
  ss.decision_from,
  ss.decision_valid_until,
  ss.conditions,
  ss.criticality_label,
  ss.last_evaluated_on,
  ss.last_score
from public.v_quality_supplier_scope_status ss
join public.quality_supplier_profiles p
  on p.organization_id = ss.organization_id and p.id = ss.profile_id
join public.quality_external_parties ep
  on ep.organization_id = p.organization_id and ep.id = p.party_id
where ss.is_approved_now;

comment on view public.v_quality_approved_supplier_list is
  'QUALITY-07 · GP-08 · Lista de proveedores aprobados, derivada de las decisiones vigentes. No se mantiene a mano y por eso no puede quedar desactualizada.';


-- ============================================================================
-- 15 · ACTOS FORMALES (RPC)
-- ----------------------------------------------------------------------------
-- La misma frontera de QUALITY-04, 05, 06 y 06.1: lo que crea HISTORIA pasa por
-- una función. Clasificar criticidad, publicar una plantilla, cerrar una
-- evaluación y decidir una aprobación tienen que comprobar rol, estado e
-- invariante EN EL MISMO ACTO en que se registran.
--
-- §54 · Y todas comprueban a quién pertenece lo que tocan. Ninguna confía en un
-- `p_organization_id` que venga del cliente: la empresa se DEDUCE de la fila
-- señalada y después se comprueba la pertenencia de quien pregunta. El hallazgo
-- de QUALITY-06 —funciones `security definer` que eran un túnel por debajo de
-- RLS— no se repite aquí.
-- ----------------------------------------------------------------------------

-- §58/GP-33 · Incorporar a Quality un proveedor que YA existe en PCR o en
-- Textiles. No copia nada: crea la identidad externa si hace falta, la enlaza
-- con la fila operativa y abre el perfil de Quality.
create or replace function public.quality_adopt_supplier(
  p_source_module text,
  p_source_id     uuid,
  p_owner_position_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org       uuid;
  v_name      text;
  v_tax       text;
  v_country   text;
  v_city      text;
  v_party     uuid;
  v_profile   uuid;
begin
  if p_source_module not in ('cpr', 'textiles') then
    raise exception 'Origen no válido.';
  end if;

  -- La empresa sale de la FILA, no del cliente.
  if p_source_module = 'cpr' then
    select organization_id, name, tax_id, null, null, external_party_id
      into v_org, v_name, v_tax, v_country, v_city, v_party
      from suppliers where id = p_source_id;
  else
    select organization_id, name, tax_id, country, city, external_party_id
      into v_org, v_name, v_tax, v_country, v_city, v_party
      from textile_suppliers where id = p_source_id;
  end if;

  if v_org is null then
    raise exception 'Ese proveedor no existe.';
  end if;
  if not quality_manages_suppliers(v_org) then
    raise exception 'No tienes permiso para gestionar proveedores en esta empresa.';
  end if;

  -- Si ya estaba enlazado, no se duplica nada: se devuelve lo que hay. Llamar
  -- dos veces tiene que ser inocuo, porque dos personas pulsarán el botón.
  if v_party is null then
    -- Antes de crear, se busca una identidad que ya represente a esta empresa.
    -- Es lo que impide que adoptar el mismo ACME desde PCR y desde Textiles
    -- produzca dos identidades.
    if v_tax is not null then
      select id into v_party from quality_external_parties
       where organization_id = v_org and lower(tax_id) = lower(v_tax) limit 1;
    end if;
    if v_party is null then
      select id into v_party from quality_external_parties
       where organization_id = v_org and lower(legal_name) = lower(v_name) limit 1;
    end if;
    if v_party is null then
      insert into quality_external_parties (organization_id, legal_name, tax_id, country, city)
      values (v_org, v_name, v_tax, v_country, v_city)
      returning id into v_party;
    end if;

    if p_source_module = 'cpr' then
      update suppliers set external_party_id = v_party where id = p_source_id;
    else
      update textile_suppliers set external_party_id = v_party where id = p_source_id;
    end if;
  end if;

  insert into quality_external_party_roles (organization_id, party_id, role_code)
  values (v_org, v_party, 'supplier')
  on conflict do nothing;

  select id into v_profile from quality_supplier_profiles where party_id = v_party;
  if v_profile is null then
    insert into quality_supplier_profiles
      (organization_id, party_id, relationship_status, owner_position_id)
    values (v_org, v_party, 'active', p_owner_position_id)
    returning id into v_profile;

    -- Todo proveedor nace con su alcance global: es lo que permite clasificarlo
    -- y aprobarlo sin obligar antes a inventar sedes y categorías (§57).
    insert into quality_supplier_scopes (organization_id, profile_id, label)
    values (v_org, v_profile, 'Alcance general');

    insert into work_events (organization_id, source_domain, event_type,
                             subject_type, subject_id, summary, payload)
    values (v_org, 'supplier', 'supplier.adopted', 'quality_supplier_profile', v_profile,
            'Proveedor incorporado a Quality desde ' || p_source_module || '.',
            jsonb_build_object('source_module', p_source_module, 'source_id', p_source_id,
                               'party_id', v_party));
  end if;

  return v_profile;
end;
$$;
revoke all on function public.quality_adopt_supplier(text, uuid, uuid) from public, anon;
grant execute on function public.quality_adopt_supplier(text, uuid, uuid) to authenticated;

comment on function public.quality_adopt_supplier(text, uuid, uuid) is
  'QUALITY-07 · §58/GP-33 · Incorpora a Quality un proveedor que ya existe en PCR o Textiles, sin copiarlo. Idempotente: llamarla dos veces no crea dos fichas.';


-- §69/GP-05 · Clasificar la criticidad de un alcance reutilizando el motor de
-- metodologías de QUALITY-05. La versión queda atada a la clasificación, así
-- que publicar una metodología nueva no recalcula el pasado.
create or replace function public.quality_assess_supplier_criticality(
  p_scope_id    uuid,
  p_version_id  uuid,
  p_level_ids   uuid[],
  p_rationale   text default null,
  p_assessed_on date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org        uuid;
  v_profile    uuid;
  v_version    record;
  v_derivation jsonb;
  v_assessment uuid;
begin
  select organization_id, profile_id into v_org, v_profile
    from quality_supplier_scopes where id = p_scope_id;
  if v_org is null then
    raise exception 'Ese alcance no existe.';
  end if;
  if not quality_manages_suppliers(v_org) then
    raise exception 'No tienes permiso para clasificar proveedores.';
  end if;

  select * into v_version from quality_risk_methodology_versions where id = p_version_id;
  if v_version.id is null or v_version.organization_id <> v_org then
    raise exception 'Esa metodología no es de esta empresa.';
  end if;
  if v_version.status <> 'published' then
    raise exception 'Solo una metodología publicada puede usarse para clasificar.';
  end if;
  if not exists (
    select 1 from quality_risk_methodologies m
     where m.id = v_version.methodology_id and m.applies_to = 'supplier_criticality'
  ) then
    raise exception 'Esa metodología no es de criticidad de proveedores.';
  end if;

  -- La derivación la hace el motor de QUALITY-05: comprueba que los niveles
  -- pertenezcan a ESTA versión, aplica la regla declarada y devuelve el nivel
  -- con su explicación.
  v_derivation := quality_derive_level(p_version_id, p_level_ids);

  insert into quality_supplier_criticality_assessments
    (organization_id, scope_id, version_id, score, level_id, level_label,
     color_token, review_months, derivation, assessed_on, rationale, decided_by)
  values
    (v_org, p_scope_id, p_version_id,
     (v_derivation->>'score')::numeric,
     (v_derivation->>'level_id')::uuid,
     v_derivation->>'level_label',
     v_derivation->>'color_token',
     nullif(v_derivation->>'review_months', '')::integer,
     v_derivation, p_assessed_on, p_rationale, auth.uid())
  returning id into v_assessment;

  -- Los factores se escriben desde los NIVELES elegidos, no desde el rastro
  -- que devuelve la derivación: ese rastro está pensado para leerse —código,
  -- etiqueta, valor y peso— y no lleva identificadores. Sacarlos de ahí dejaba
  -- la dimensión en blanco, y una clasificación sin decir en qué dimensión se
  -- escogió cada valor es indefendible.
  insert into quality_supplier_criticality_factors
    (organization_id, assessment_id, scale_id, level_id)
  select v_org, v_assessment, l.scale_id, l.id
    from quality_risk_scale_levels l
   where l.id = any(p_level_ids);

  -- GP-20 · La criticidad modula la frecuencia de revisión. Si la banda declara
  -- meses, mandan esos: para eso los declaró la empresa.
  if (v_derivation->>'review_months') is not null then
    update quality_supplier_profiles
       set reevaluation_months = (v_derivation->>'review_months')::integer,
           next_review_on = coalesce(last_evaluated_on, p_assessed_on)
             + ((v_derivation->>'review_months')::integer || ' months')::interval
     where id = v_profile;
  end if;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              decided_by, rationale, context)
  values (v_org, 'supplier_scope', p_scope_id, 'supplier_criticality', auth.uid(),
          coalesce(p_rationale, 'Criticidad clasificada.'), v_derivation);

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_org, 'supplier', 'supplier.classified', 'quality_supplier_scope', p_scope_id,
          'Criticidad clasificada como ' || (v_derivation->>'level_label') || '.',
          jsonb_build_object('assessment_id', v_assessment,
                             'level', v_derivation->>'level_label'));

  return v_assessment;
end;
$$;
revoke all on function public.quality_assess_supplier_criticality(uuid, uuid, uuid[], text, date) from public, anon;
grant execute on function public.quality_assess_supplier_criticality(uuid, uuid, uuid[], text, date) to authenticated;


-- §70/GP-30 · Publicar una versión de plantilla. Cierra la anterior el día
-- antes y numera la nueva. Nunca deja dos vigentes, y no toca ninguna
-- evaluación ya hecha.
create or replace function public.quality_publish_supplier_template_version(
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
  v_criteria integer;
begin
  select * into v_version from quality_supplier_template_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'Esa versión de plantilla no existe.';
  end if;
  if not quality_manages_suppliers(v_version.organization_id) then
    raise exception 'No tienes permiso para publicar plantillas de evaluación.';
  end if;
  if v_version.status <> 'draft' then
    raise exception 'Esta versión ya fue publicada.';
  end if;

  select count(*) into v_criteria
    from quality_supplier_evaluation_criteria where version_id = p_version_id;
  if v_criteria = 0 then
    raise exception 'Una plantilla publicada tiene que decir contra qué se evalúa.';
  end if;

  select * into v_prev
    from quality_supplier_template_versions
   where template_id = v_version.template_id and status = 'published'
   limit 1;

  if v_prev.id is not null then
    if p_effective_from <= v_prev.effective_from then
      raise exception 'La nueva vigencia debe empezar después de la de la versión anterior.';
    end if;
    update quality_supplier_template_versions
       set status = 'superseded', effective_to = p_effective_from - 1
     where id = v_prev.id;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_number
    from quality_supplier_template_versions
   where template_id = v_version.template_id and id <> p_version_id;

  update quality_supplier_template_versions
     set status = 'published', version_number = v_number,
         effective_from = p_effective_from, effective_to = null,
         change_note = coalesce(p_change_note, change_note),
         published_by = auth.uid(), published_at = now()
   where id = p_version_id;

  return p_version_id;
end;
$$;
revoke all on function public.quality_publish_supplier_template_version(uuid, date, text) from public, anon;
grant execute on function public.quality_publish_supplier_template_version(uuid, date, text) to authenticated;


-- §21/§22/§23 · Cerrar una evaluación: se calcula el resultado y se congela.
--
-- EL CÁLCULO, Y LO QUE SE NIEGA A HACER
--
-- Solo entran en el promedio los criterios PUNTUADOS. «No aplica», «sin dato» y
-- «sin evaluar» se cuentan aparte y se imprimen aparte; ninguno se convierte en
-- un cero. Un proveedor al que no le aplica la mitad de la plantilla no puede
-- salir con la mitad de la nota.
--
-- Y el resultado NO aprueba a nadie: es un número con su banda. La decisión es
-- otro acto (GP-07).
create or replace function public.quality_close_supplier_evaluation(
  p_evaluation_id uuid,
  p_summary       text default null,
  p_evaluated_on  date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev        record;
  v_rule      text;
  v_bands     jsonb;
  v_total     integer;
  v_scored    integer;
  v_na        integer;
  v_unavail   integer;
  v_pending   integer;
  v_score     numeric;
  v_band      text;
  v_b         jsonb;
begin
  select * into v_ev from quality_supplier_evaluations where id = p_evaluation_id;
  if v_ev.id is null then
    raise exception 'Esa evaluación no existe.';
  end if;
  if not quality_manages_suppliers(v_ev.organization_id) then
    raise exception 'No tienes permiso para cerrar evaluaciones de proveedores.';
  end if;
  if v_ev.status = 'closed' then
    raise exception 'Esta evaluación ya está cerrada. Registra una nueva si hace falta reevaluar.';
  end if;

  select scoring_rule, bands into v_rule, v_bands
    from quality_supplier_template_versions where id = v_ev.version_id;

  select count(*) into v_total
    from quality_supplier_evaluation_criteria where version_id = v_ev.version_id;

  select
    count(*) filter (where r.outcome = 'scored'),
    count(*) filter (where r.outcome = 'not_applicable'),
    count(*) filter (where r.outcome = 'unavailable'),
    count(*) filter (where r.outcome = 'not_evaluated')
    into v_scored, v_na, v_unavail, v_pending
    from quality_supplier_evaluation_results r
   where r.evaluation_id = p_evaluation_id;

  -- Los criterios sin fila son «sin evaluar»: no existir no es haber salido a
  -- cero.
  v_pending := coalesce(v_pending, 0)
    + (v_total - coalesce(v_scored, 0) - coalesce(v_na, 0) - coalesce(v_unavail, 0) - coalesce(v_pending, 0));

  if coalesce(v_scored, 0) = 0 then
    raise exception 'No se puede cerrar una evaluación sin ningún criterio puntuado.';
  end if;

  if v_rule = 'points' then
    select round(100 * sum(r.points) / nullif(sum(c.max_points), 0), 3)
      into v_score
      from quality_supplier_evaluation_results r
      join quality_supplier_evaluation_criteria c on c.id = r.criterion_id
     where r.evaluation_id = p_evaluation_id and r.outcome = 'scored';
  else
    -- Promedio ponderado sobre lo puntuado, normalizado a 100. Los pesos de los
    -- criterios excluidos se reparten solos al no entrar en el divisor: eso es
    -- lo que impide que un «no aplica» baje la nota.
    select round(sum(c.weight * (100 * r.points / nullif(c.max_points, 0)))
                 / nullif(sum(c.weight), 0), 3)
      into v_score
      from quality_supplier_evaluation_results r
      join quality_supplier_evaluation_criteria c on c.id = r.criterion_id
     where r.evaluation_id = p_evaluation_id and r.outcome = 'scored';
  end if;

  -- La banda la declara la empresa en la versión de la plantilla. Sin bandas,
  -- el número se queda sin etiqueta antes que inventarle una.
  if v_bands is not null then
    for v_b in select * from jsonb_array_elements(v_bands)
    loop
      if v_score >= coalesce((v_b->>'min')::numeric, -1e9)
         and v_score <= coalesce((v_b->>'max')::numeric, 1e9) then
        v_band := v_b->>'label';
        exit;
      end if;
    end loop;
  end if;

  update quality_supplier_evaluations
     set status = 'closed',
         score = v_score,
         result_band = v_band,
         criteria_total = v_total,
         criteria_scored = coalesce(v_scored, 0),
         criteria_not_applicable = coalesce(v_na, 0),
         criteria_unavailable = coalesce(v_unavail, 0),
         criteria_not_evaluated = greatest(coalesce(v_pending, 0), 0),
         summary = coalesce(p_summary, summary),
         evaluated_on = coalesce(evaluated_on, p_evaluated_on),
         evaluated_by = coalesce(evaluated_by, auth.uid()),
         closed_at = now()
   where id = p_evaluation_id;

  -- §29 · La próxima revisión se proyecta desde la evaluación que acaba de
  -- cerrarse, con la cadencia vigente del proveedor.
  update quality_supplier_profiles p
     set last_evaluated_on = coalesce(p_evaluated_on, current_date),
         next_review_on = coalesce(p_evaluated_on, current_date)
           + (p.reevaluation_months || ' months')::interval
    from quality_supplier_scopes s
   where s.id = v_ev.scope_id and p.id = s.profile_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              decided_by, rationale, outcome)
  values (v_ev.organization_id, 'supplier_evaluation', p_evaluation_id,
          'supplier_evaluation_closed', auth.uid(),
          coalesce(p_summary, 'Evaluación cerrada.'), v_band);

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_ev.organization_id, 'supplier', 'supplier.evaluated',
          'quality_supplier_evaluation', p_evaluation_id,
          'Evaluación de proveedor cerrada.',
          jsonb_build_object('score', v_score, 'band', v_band,
                             'not_applicable', v_na, 'unavailable', v_unavail));

  -- Se devuelve el resultado para que la pantalla pueda decirlo sin volver a
  -- consultar — y con el recuento de ausencias delante, que es lo que evita
  -- leer un 90 como si fuera un 90 sobre todo.
  return jsonb_build_object(
    'score', v_score, 'band', v_band,
    'criteria_total', v_total, 'scored', v_scored,
    'not_applicable', v_na, 'unavailable', v_unavail,
    'not_evaluated', greatest(coalesce(v_pending, 0), 0),
    'decides_nothing', true);
end;
$$;
revoke all on function public.quality_close_supplier_evaluation(uuid, text, date) from public, anon;
grant execute on function public.quality_close_supplier_evaluation(uuid, text, date) to authenticated;

comment on function public.quality_close_supplier_evaluation(uuid, text, date) is
  'QUALITY-07 · §21/§22/§23 · Calcula el resultado sobre lo PUNTUADO y congela la evaluación. No aprueba a nadie: `decides_nothing` está ahí para que quede escrito.';


-- §72/GP-07 · La decisión de aprobación. Es el acto que el sistema NO toma
-- solo: exige una persona, un fundamento escrito y un alcance.
create or replace function public.quality_decide_supplier_approval(
  p_scope_id      uuid,
  p_decision      text,
  p_rationale     text,
  p_conditions    text default null,
  p_valid_until   date default null,
  p_evaluation_id uuid default null,
  p_effective_from date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org      uuid;
  v_profile  uuid;
  v_prev     uuid;
  v_new      uuid;
  v_evento   text;
begin
  select organization_id, profile_id into v_org, v_profile
    from quality_supplier_scopes where id = p_scope_id;
  if v_org is null then
    raise exception 'Ese alcance no existe.';
  end if;
  -- GP-07 · Homologar no es administrar. El consultor queda fuera.
  if not quality_decides_supplier_approval(v_org) then
    raise exception 'Tu rol no permite decidir la aprobación de un proveedor.';
  end if;
  if p_decision not in ('approved', 'conditionally_approved', 'rejected',
                        'suspended', 'reinstated', 'withdrawn') then
    raise exception 'Decisión no válida.';
  end if;
  if length(trim(coalesce(p_rationale, ''))) = 0 then
    raise exception 'Una decisión de aprobación tiene que decir en qué se basa.';
  end if;
  if p_decision = 'conditionally_approved'
     and length(trim(coalesce(p_conditions, ''))) = 0 then
    raise exception 'Una aprobación condicionada tiene que decir cuáles son las condiciones.';
  end if;
  if p_evaluation_id is not null and not exists (
    select 1 from quality_supplier_evaluations e
     where e.id = p_evaluation_id and e.organization_id = v_org and e.scope_id = p_scope_id
  ) then
    raise exception 'Esa evaluación no corresponde a este alcance.';
  end if;

  select id into v_prev
    from quality_supplier_approval_decisions
   where organization_id = v_org and scope_id = p_scope_id and superseded_by is null
   order by effective_from desc, decided_at desc
   limit 1;

  insert into quality_supplier_approval_decisions
    (organization_id, scope_id, evaluation_id, decision, rationale, conditions,
     effective_from, valid_until, decided_by)
  values
    (v_org, p_scope_id, p_evaluation_id, p_decision, p_rationale, p_conditions,
     p_effective_from, p_valid_until, auth.uid())
  returning id into v_new;

  -- GP-12 · La anterior NO se borra: queda enlazada como sustituida, y su
  -- contenido sigue siendo legible tal como se firmó.
  if v_prev is not null then
    update quality_supplier_approval_decisions
       set superseded_by = v_new where id = v_prev;
  end if;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              decided_by, rationale, outcome)
  values (v_org, 'supplier_scope', p_scope_id, 'supplier_approval', auth.uid(),
          p_rationale, p_decision);

  v_evento := case p_decision
    when 'suspended'  then 'supplier.suspended'
    when 'reinstated' then 'supplier.reinstated'
    when 'withdrawn'  then 'supplier.withdrawn'
    else 'supplier.approved' end;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_org, 'supplier', v_evento, 'quality_supplier_scope', p_scope_id,
          'Decisión de aprobación: ' || p_decision || '.',
          jsonb_build_object('decision_id', v_new, 'decision', p_decision,
                             'valid_until', p_valid_until));

  return v_new;
end;
$$;
revoke all on function public.quality_decide_supplier_approval(uuid, text, text, text, date, uuid, date) from public, anon;
grant execute on function public.quality_decide_supplier_approval(uuid, text, text, text, date, uuid, date) to authenticated;

comment on function public.quality_decide_supplier_approval(uuid, text, text, text, date, uuid, date) is
  'QUALITY-07 · GP-07/GP-12 · La decisión humana de aprobación POR ALCANCE. Exige fundamento; la anterior queda sustituida, nunca borrada.';


-- §75/§33/GP-22 · Convertir un incidente en un caso del sistema de gestión.
-- Es una decisión explícita: el incidente por sí solo no abre nada. El caso se
-- crea con sus referencias al proveedor, sin copiar su información.
create or replace function public.quality_open_case_from_supplier_incident(
  p_incident_id uuid,
  p_title       text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inc   record;
  v_code  text;
  v_case  uuid;
begin
  select * into v_inc from quality_supplier_incidents where id = p_incident_id;
  if v_inc.id is null then
    raise exception 'Ese incidente no existe.';
  end if;
  if not quality_manages_suppliers(v_inc.organization_id) then
    raise exception 'No tienes permiso para abrir casos en esta empresa.';
  end if;
  if v_inc.case_id is not null then
    raise exception 'Este incidente ya tiene un caso abierto.';
  end if;

  select work_next_case_code(v_inc.organization_id) into v_code;

  -- El caso nace SIN clasificar. Que venga de un proveedor no lo convierte en
  -- una no conformidad: clasificarlo es otro acto, el de QUALITY-04 (AC-01).
  insert into work_cases
    (organization_id, code, title, description, case_type, origin_kind, origin_note,
     detected_on, status)
  values
    (v_inc.organization_id, v_code,
     coalesce(p_title, v_inc.title),
     coalesce(p_description, v_inc.description),
     'supplier_incident', 'supplier',
     'Abierto desde un incidente de proveedor.',
     v_inc.occurred_on, 'open')
  returning id into v_case;

  update quality_supplier_incidents
     set case_id = v_case, status = 'under_review'
   where id = p_incident_id;

  -- Las referencias enlazan; no duplican. La ficha del caso puede enseñar el
  -- proveedor y su alcance sin haberlos copiado dentro.
  insert into work_references (organization_id, owner_kind, owner_id, ref_kind, ref_id, note)
  values (v_inc.organization_id, 'case', v_case, 'quality_supplier_profile', v_inc.profile_id,
          'Proveedor del incidente.');
  if v_inc.scope_id is not null then
    insert into work_references (organization_id, owner_kind, owner_id, ref_kind, ref_id, note)
    values (v_inc.organization_id, 'case', v_case, 'quality_supplier_scope', v_inc.scope_id,
            'Alcance afectado.');
  end if;
  insert into work_references (organization_id, owner_kind, owner_id, ref_kind, ref_id, note)
  values (v_inc.organization_id, 'case', v_case, 'quality_supplier_incident', p_incident_id,
          'Incidente que originó el caso.');

  return v_case;
end;
$$;
revoke all on function public.quality_open_case_from_supplier_incident(uuid, text, text) from public, anon;
grant execute on function public.quality_open_case_from_supplier_incident(uuid, text, text) to authenticated;


-- ============================================================================
-- 16 · VERDAD HISTÓRICA (GP-14, GP-15, §60, §77)
-- ----------------------------------------------------------------------------
-- «¿Qué aprobación tenía ACME el 15 de marzo?» no se responde mirando la
-- decisión de hoy. Estas funciones son la única forma correcta de preguntarle
-- al pasado, y comprueban a quién pertenece lo que devuelven.
-- ----------------------------------------------------------------------------

create or replace function public.quality_supplier_approval_on(
  p_organization_id uuid,
  p_scope_id        uuid,
  p_on              date
)
returns table (
  decision_id    uuid,
  decision       text,
  effective_from date,
  valid_until    date,
  conditions     text,
  rationale      text,
  decided_by     uuid,
  was_valid      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.decision, d.effective_from, d.valid_until, d.conditions,
         d.rationale, d.decided_by,
         (d.decision in ('approved', 'conditionally_approved', 'reinstated')
            and (d.valid_until is null or d.valid_until >= p_on))
    from quality_supplier_approval_decisions d
   where is_org_member(p_organization_id)
     and d.organization_id = p_organization_id
     and d.scope_id = p_scope_id
     and d.effective_from <= p_on
   order by d.effective_from desc, d.decided_at desc
   limit 1;
$$;
revoke all on function public.quality_supplier_approval_on(uuid, uuid, date) from public, anon;
grant execute on function public.quality_supplier_approval_on(uuid, uuid, date) to authenticated;

comment on function public.quality_supplier_approval_on(uuid, uuid, date) is
  'QUALITY-07 · GP-14 · Qué aprobación regía EN esa fecha. No se responde con la decisión de hoy.';


create or replace function public.quality_supplier_criticality_on(
  p_organization_id uuid,
  p_scope_id        uuid,
  p_on              date
)
returns table (
  assessment_id uuid,
  level_label   text,
  score         numeric,
  version_id    uuid,
  assessed_on   date
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.level_label, a.score, a.version_id, a.assessed_on
    from quality_supplier_criticality_assessments a
   where is_org_member(p_organization_id)
     and a.organization_id = p_organization_id
     and a.scope_id = p_scope_id
     and a.assessed_on <= p_on
   order by a.assessed_on desc, a.created_at desc
   limit 1;
$$;
revoke all on function public.quality_supplier_criticality_on(uuid, uuid, date) from public, anon;
grant execute on function public.quality_supplier_criticality_on(uuid, uuid, date) to authenticated;


-- §17/GP-30 · Qué requisitos aplicaban a un alcance EN una fecha. Es lo que
-- impide que exigir algo nuevo hoy vuelva incumplido el año pasado.
create or replace function public.quality_supplier_requirements_on(
  p_organization_id uuid,
  p_scope_id        uuid,
  p_on              date
)
returns table (
  requirement_id uuid,
  code           text,
  title          text,
  requirement_kind text,
  enforcement    text,
  source         text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (r.id)
         r.id, r.code, r.title, r.requirement_kind, r.enforcement,
         case when a.scope_id is not null then 'scope' else 'category' end
    from quality_supplier_requirement_assignments a
    join quality_supplier_requirements r
      on r.organization_id = a.organization_id and r.id = a.requirement_id
    left join quality_supplier_scopes s
      on s.organization_id = a.organization_id and s.id = p_scope_id
   where is_org_member(p_organization_id)
     and a.organization_id = p_organization_id
     and a.effective_from <= p_on
     and (a.effective_to is null or a.effective_to >= p_on)
     and (a.scope_id = p_scope_id
          or (a.category_id is not null and a.category_id = s.category_id))
   order by r.id, a.effective_from desc;
$$;
revoke all on function public.quality_supplier_requirements_on(uuid, uuid, date) from public, anon;
grant execute on function public.quality_supplier_requirements_on(uuid, uuid, date) to authenticated;

comment on function public.quality_supplier_requirements_on(uuid, uuid, date) is
  'QUALITY-07 · §17/GP-30 · Qué se exigía EN esa fecha, por alcance o por categoría. Exigir más hoy no incumple el pasado.';


-- §54 · El motor de derivación de QUALITY-05 se endurece de paso: recibía el
-- identificador de una versión desde el cliente y no comprobaba a qué empresa
-- pertenecía, así que confirmaba la existencia de metodologías ajenas. Ahora
-- exige pertenencia antes de responder. Es aditivo: todos los llamantes
-- legítimos son miembros de su empresa, y el cuerpo del cálculo es el mismo de
-- 0122 sin un solo cambio.
create or replace function public.quality_derive_level(
  p_version_id uuid,
  p_level_ids  uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller_org  uuid;
  v_version     record;
  v_dimensions  integer;
  v_matched     integer;
  v_score       numeric;
  v_result      record;
  v_factors     jsonb;
  v_scale_ids   uuid[];
begin
  -- QUALITY-07 §54 · La comprobación que faltaba. Esta función recibía el
  -- identificador de una versión desde el cliente y, por ser `security
  -- definer`, respondía sin mirar de quién era: bastaba con probar
  -- identificadores para confirmar qué metodologías existen en otra empresa.
  -- Se añade la pertenencia delante, y el mensaje es el mismo que cuando no
  -- existe: confirmar que algo existe en otra empresa ya es información.
  select organization_id into v_caller_org
    from quality_risk_methodology_versions where id = p_version_id;
  if v_caller_org is null or not is_org_member(v_caller_org) then
    raise exception 'La metodología indicada no existe.';
  end if;

  select * into v_version from quality_risk_methodology_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'La metodología indicada no existe.';
  end if;

  -- Los niveles tienen que pertenecer a dimensiones DE ESTA version. Es la
  -- comprobacion del §18: no se admite un valor de otra metodologia, ni de
  -- otra version de la misma.
  select count(*), array_agg(distinct s.id)
    into v_matched, v_scale_ids
    from quality_risk_scale_levels l
    join quality_risk_scales s on s.id = l.scale_id
   where l.id = any(p_level_ids)
     and s.version_id = p_version_id
     and s.scale_kind = 'dimension';

  if v_matched <> coalesce(array_length(p_level_ids, 1), 0) then
    raise exception 'Alguno de los valores elegidos no pertenece a esta versión de la metodología.';
  end if;

  select count(*) into v_dimensions
    from quality_risk_scales
   where version_id = p_version_id and scale_kind = 'dimension';

  if v_dimensions = 0 then
    raise exception 'Esta versión de la metodología no tiene dimensiones definidas.';
  end if;
  if coalesce(array_length(v_scale_ids, 1), 0) <> v_dimensions then
    raise exception 'Faltan dimensiones por valorar: la metodología pide %.', v_dimensions;
  end if;

  -- La regla declarada en la version. Deterministica y auditable.
  select case v_version.aggregation
           when 'product'       then exp(sum(ln(nullif(l.value, 0))))
           when 'sum'           then sum(l.value)
           when 'weighted_sum'  then sum(l.value * s.weight)
           when 'max'           then max(l.value)
           when 'min'           then min(l.value)
         end
    into v_score
    from quality_risk_scale_levels l
    join quality_risk_scales s on s.id = l.scale_id
   where l.id = any(p_level_ids);

  if v_score is null then
    raise exception 'No se pudo calcular el resultado con los valores elegidos.';
  end if;
  v_score := round(v_score, 4);

  -- La banda que contiene el puntaje, dentro de la escala de resultado de esta
  -- misma version.
  select l.* into v_result
    from quality_risk_scale_levels l
    join quality_risk_scales s on s.id = l.scale_id
   where s.version_id = p_version_id
     and s.scale_kind = 'result'
     and (l.min_score is null or v_score >= l.min_score)
     and (l.max_score is null or v_score <= l.max_score)
   order by l.position
   limit 1;

  if v_result.id is null then
    raise exception 'El resultado % no cae en ninguna banda de esta metodología.', v_score;
  end if;

  -- El rastro visible (§62): que se escogio en cada dimension y con que regla
  -- se combino. Sin esto el nivel seria una caja negra.
  select jsonb_agg(jsonb_build_object(
           'scale_code', s.code, 'scale_label', s.label,
           'level_label', l.label, 'value', l.value, 'weight', s.weight)
           order by s.position)
    into v_factors
    from quality_risk_scale_levels l
    join quality_risk_scales s on s.id = l.scale_id
   where l.id = any(p_level_ids);

  return jsonb_build_object(
    'score', v_score,
    'level_id', v_result.id,
    'level_label', v_result.label,
    'is_acceptable', v_result.is_acceptable,
    'review_months', v_result.review_months,
    'color_token', v_result.color_token,
    'aggregation', v_version.aggregation,
    'version_id', p_version_id,
    'factors', coalesce(v_factors, '[]'::jsonb)
  );
end;
$$;
comment on function public.quality_derive_level(uuid, uuid[]) is
  'QUALITY-05 · RO-05/§19 · Unica fuente del nivel. La base y la pantalla llaman a ESTA funcion: por eso lo que se explica y lo que se guarda no pueden divergir.';
revoke all on function public.quality_derive_level(uuid, uuid[]) from public, anon;
grant execute on function public.quality_derive_level(uuid, uuid[]) to authenticated;


-- ============================================================================
-- 17 · BARRIDO (§29, §45, §46, §73, §74)
-- ----------------------------------------------------------------------------
-- Idempotente por `dedupe_key`: el segundo barrido del mismo día no duplica
-- nada. Y ninguno de estos avisos suspende, rechaza ni bloquea a nadie: dicen
-- que hay algo que revisar (GP-18).
-- ----------------------------------------------------------------------------

create or replace function public.quality_supplier_notice_recipient(p_organization_id uuid)
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
revoke all on function public.quality_supplier_notice_recipient(uuid) from public, anon, authenticated;


create or replace function public.quality_scan_supplier_reviews(p_organization_id uuid default null)
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
      raise exception 'Indica sobre qué empresa quieres revisar los proveedores.';
    end if;
    if not is_org_member(p_organization_id) then
      raise exception 'No tienes acceso a esa empresa.';
    end if;
  end if;

  -- 17.1 · El documento vencido pasa a `expired`. Es un hecho sobre el PAPEL:
  -- la aprobación del proveedor no se toca (GP-18, §74).
  update quality_supplier_documents d
     set status = 'expired'
   where d.status = 'valid'
     and d.expires_on is not null
     and d.expires_on < current_date
     and (p_organization_id is null or d.organization_id = p_organization_id);

  -- 17.2 · Reevaluación vencida: alerta + tarea.
  with vencidas as (
    select p.*, ep.legal_name,
           quality_supplier_notice_recipient(p.organization_id) as recipient
      from quality_supplier_profiles p
      join quality_external_parties ep
        on ep.organization_id = p.organization_id and ep.id = p.party_id
     where p.relationship_status = 'active'
       and p.next_review_on is not null
       and p.next_review_on <= current_date
       and (p_organization_id is null or p.organization_id = p_organization_id)
  ), a as (
    insert into work_alerts (organization_id, source_domain, alert_type, severity,
                             subject_type, subject_id, recipient_profile_id,
                             title, message, dedupe_key)
    select v.organization_id, 'supplier', 'supplier_reevaluation_overdue', 'warning',
           'quality_supplier_profile', v.id, v.recipient,
           'Reevaluación vencida: ' || v.legal_name,
           'La reevaluación estaba prevista para el ' || to_char(v.next_review_on, 'DD/MM/YYYY')
             || '. Vencer no cambia por sí solo la aprobación del proveedor.',
           'supplier_reevaluation:' || v.id::text || ':' || v.next_review_on::text
      from vencidas v
     where v.recipient is not null
       and not exists (select 1 from work_alerts w
                        where w.dedupe_key = 'supplier_reevaluation:' || v.id::text || ':' || v.next_review_on::text)
    returning 1
  ), t as (
    insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                            title, description, assignee_profile_id, assignee_position_id,
                            status, due_at, dedupe_key)
    select v.organization_id, 'supplier', 'supplier_reevaluation_due',
           'quality_supplier_profile', v.id,
           'Reevaluar a ' || v.legal_name,
           'Estaba prevista para el ' || to_char(v.next_review_on, 'DD/MM/YYYY') || '.',
           v.recipient, v.owner_position_id, 'open', v.next_review_on,
           'supplier_reevaluation_due:' || v.id::text || ':' || v.next_review_on::text
      from vencidas v
     where v.recipient is not null
       and not exists (select 1 from work_tasks w
                        where w.dedupe_key = 'supplier_reevaluation_due:' || v.id::text || ':' || v.next_review_on::text)
    returning 1
  )
  select count(*) into v_alerts from a;

  -- Y la señal, que es lo que la ficha enseña sin salir a buscar avisos.
  insert into quality_supplier_signals (organization_id, profile_id, signal_kind, detail)
  select p.organization_id, p.id, 'reevaluation_overdue',
         'La reevaluación venció el ' || to_char(p.next_review_on, 'DD/MM/YYYY') || '.'
    from quality_supplier_profiles p
   where p.relationship_status = 'active'
     and p.next_review_on is not null
     and p.next_review_on <= current_date
     and (p_organization_id is null or p.organization_id = p_organization_id)
  on conflict do nothing;

  update quality_supplier_signals s
     set last_seen_at = now()
    from quality_supplier_profiles p
   where s.status = 'open' and s.signal_kind = 'reevaluation_overdue'
     and s.profile_id = p.id
     and p.next_review_on is not null and p.next_review_on <= current_date
     and (p_organization_id is null or s.organization_id = p_organization_id);

  -- Deja de estar vencida cuando alguien reevalúa: la señal se cierra sola.
  update quality_supplier_signals s
     set status = 'resolved', resolved_at = now()
    from quality_supplier_profiles p
   where s.status = 'open' and s.signal_kind = 'reevaluation_overdue'
     and s.profile_id = p.id
     and (p.next_review_on is null or p.next_review_on > current_date)
     and (p_organization_id is null or s.organization_id = p_organization_id);

  -- 17.3 · Documento por vencer o vencido (§74/GP-18).
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select d.organization_id, 'supplier',
         case when d.expires_on < current_date
              then 'supplier_document_expired' else 'supplier_document_expiring' end,
         case when d.expires_on < current_date then 'warning' else 'info' end,
         'quality_supplier_document', d.id,
         quality_supplier_notice_recipient(d.organization_id),
         case when d.expires_on < current_date
              then 'Documento vencido: ' || d.title
              else 'Documento por vencer: ' || d.title end,
         'Corresponde a ' || ep.legal_name || ' y vence el '
           || to_char(d.expires_on, 'DD/MM/YYYY')
           || '. Requiere revisión; NO suspende ni rechaza al proveedor por sí solo.',
         'supplier_document:' || d.id::text || ':' || d.expires_on::text
    from quality_supplier_documents d
    join quality_supplier_profiles p
      on p.organization_id = d.organization_id and p.id = d.profile_id
    join quality_external_parties ep
      on ep.organization_id = p.organization_id and ep.id = p.party_id
   where d.expires_on is not null
     and d.status in ('valid', 'expired')
     and d.expires_on <= current_date + 30
     and quality_supplier_notice_recipient(d.organization_id) is not null
     and (p_organization_id is null or d.organization_id = p_organization_id)
     and not exists (select 1 from work_alerts w
                      where w.dedupe_key = 'supplier_document:' || d.id::text || ':' || d.expires_on::text);

  insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                          title, description, assignee_profile_id, status, due_at, dedupe_key)
  select d.organization_id, 'supplier', 'supplier_document_renewal',
         'quality_supplier_document', d.id,
         'Revisar el documento «' || d.title || '»',
         'Vence el ' || to_char(d.expires_on, 'DD/MM/YYYY')
           || '. Decide si se renueva, se sustituye o si cambia algo de la aprobación.',
         quality_supplier_notice_recipient(d.organization_id), 'open', d.expires_on,
         'supplier_document_renewal:' || d.id::text || ':' || d.expires_on::text
    from quality_supplier_documents d
   where d.expires_on is not null
     and d.status in ('valid', 'expired')
     and d.expires_on <= current_date + 30
     and quality_supplier_notice_recipient(d.organization_id) is not null
     and (p_organization_id is null or d.organization_id = p_organization_id)
     and not exists (select 1 from work_tasks w
                      where w.dedupe_key = 'supplier_document_renewal:' || d.id::text || ':' || d.expires_on::text);

  -- 17.4 · Aprobación caducada. Tampoco suspende: pide decidir de nuevo.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select ss.organization_id, 'supplier', 'supplier_approval_expired', 'warning',
         'quality_supplier_scope', ss.scope_id,
         quality_supplier_notice_recipient(ss.organization_id),
         'Aprobación vencida: ' || ep.legal_name
           || coalesce(' · ' || ss.category_name, '') || coalesce(' · ' || ss.site_name, ''),
         'La aprobación de este alcance venció el '
           || to_char(ss.decision_valid_until, 'DD/MM/YYYY')
           || '. Hay que volver a decidir; el sistema no decide solo.',
         'supplier_approval_expired:' || ss.scope_id::text || ':' || ss.decision_valid_until::text
    from v_quality_supplier_scope_status ss
    join quality_supplier_profiles p
      on p.organization_id = ss.organization_id and p.id = ss.profile_id
    join quality_external_parties ep
      on ep.organization_id = p.organization_id and ep.id = p.party_id
   where ss.approval_expired
     and quality_supplier_notice_recipient(ss.organization_id) is not null
     and (p_organization_id is null or ss.organization_id = p_organization_id)
     and not exists (select 1 from work_alerts w
                      where w.dedupe_key = 'supplier_approval_expired:' || ss.scope_id::text || ':' || ss.decision_valid_until::text);

  insert into quality_supplier_signals (organization_id, profile_id, scope_id, signal_kind, detail)
  select ss.organization_id, ss.profile_id, ss.scope_id, 'approval_expired',
         'La aprobación de este alcance venció el '
           || to_char(ss.decision_valid_until, 'DD/MM/YYYY') || '.'
    from v_quality_supplier_scope_status ss
   where ss.approval_expired
     and (p_organization_id is null or ss.organization_id = p_organization_id)
  on conflict do nothing;

  -- 17.5 · Un alcance CRÍTICO sin aprobación vigente. Es la combinación que de
  -- verdad hay que mirar, y por eso tiene su propia señal.
  insert into quality_supplier_signals (organization_id, profile_id, scope_id, signal_kind, detail)
  select ss.organization_id, ss.profile_id, ss.scope_id, 'critical_without_approval',
         'Alcance clasificado como ' || ss.criticality_label || ' sin aprobación vigente.'
    from v_quality_supplier_scope_status ss
   where ss.criticality_label is not null
     and coalesce(ss.criticality_score, 0) > 0
     and not coalesce(ss.is_approved_now, false)
     and (p_organization_id is null or ss.organization_id = p_organization_id)
  on conflict do nothing;

  return coalesce(v_alerts, 0);
end;
$$;
revoke all on function public.quality_scan_supplier_reviews(uuid) from public, anon;
grant execute on function public.quality_scan_supplier_reviews(uuid) to authenticated;

comment on function public.quality_scan_supplier_reviews(uuid) is
  'QUALITY-07 · §29/§73 · Barrido idempotente de proveedores. Ningún aviso suspende, rechaza ni bloquea: dicen que hay algo que revisar.';


-- ============================================================================
-- 18 · CICLO DE VIDA (§37, §38, §78)
-- ----------------------------------------------------------------------------
-- La regla general de Trazaloop: borrar de verdad solo ANTES de que exista
-- valor histórico. Un proveedor recién creado que no tiene nada colgando se
-- puede eliminar; uno con evaluaciones, decisiones o lotes recibidos no.
--
-- El veredicto lo da la BASE, y es el mismo que consulta la pantalla y el que
-- haría cumplir un borrado: entre que alguien abre el aviso y confirma pueden
-- pasar cosas, y si en ese rato entra un lote, el borrado tiene que fallar con
-- el mismo motivo que se habría mostrado.
-- ----------------------------------------------------------------------------

create or replace function public.quality_supplier_deletion_verdict(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile  record;
  v_blocking jsonb := '[]'::jsonb;
  v_n        integer;
begin
  select * into v_profile from quality_supplier_profiles where id = p_profile_id;
  if v_profile.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Este proveedor no existe.', 'blocking', '[]'::jsonb);
  end if;

  select count(*) into v_n from quality_supplier_evaluations e
    join quality_supplier_scopes s on s.id = e.scope_id
   where s.profile_id = p_profile_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'evaluación' else 'evaluaciones' end, 'count', v_n);
  end if;

  select count(*) into v_n from quality_supplier_approval_decisions d
    join quality_supplier_scopes s on s.id = d.scope_id
   where s.profile_id = p_profile_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'decisión de aprobación' else 'decisiones de aprobación' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_supplier_criticality_assessments a
    join quality_supplier_scopes s on s.id = a.scope_id
   where s.profile_id = p_profile_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'clasificación de criticidad' else 'clasificaciones de criticidad' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_supplier_incidents where profile_id = p_profile_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'incidente registrado' else 'incidentes registrados' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_supplier_documents where profile_id = p_profile_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'documento del proveedor' else 'documentos del proveedor' end,
      'count', v_n);
  end if;

  -- Y lo que de verdad ata: la operación de los otros módulos. Un proveedor del
  -- que se han recibido lotes no se borra aunque en Quality esté vacío.
  select count(*) into v_n from input_batches ib
    join suppliers s on s.id = ib.supplier_id
   where s.external_party_id = v_profile.party_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'lote de entrada recibido' else 'lotes de entrada recibidos' end,
      'count', v_n);
  end if;

  select count(*) into v_n from textile_input_lots til
    join textile_suppliers ts on ts.id = til.supplier_id
   where ts.external_party_id = v_profile.party_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'lote textil recibido' else 'lotes textiles recibidos' end,
      'count', v_n);
  end if;

  if jsonb_array_length(v_blocking) = 0 then
    return jsonb_build_object('can_hard_delete', true, 'reason_code', 'disposable',
      'reason', 'Este proveedor no tiene todavía historia en el sistema de gestión: puede eliminarse.',
      'blocking', '[]'::jsonb);
  end if;

  return jsonb_build_object('can_hard_delete', false, 'reason_code', 'in_use',
    'reason', 'Este proveedor tiene historia y debe conservarse.',
    'blocking', v_blocking,
    'alternative', 'retire',
    'alternative_label', 'Retirarlo conservando su historia');
end;
$$;
revoke all on function public.quality_supplier_deletion_verdict(uuid) from public, anon, authenticated;


-- El despachador transversal aprende el proveedor. Se reescribe entero
-- conservando cada rama anterior: es la misma función que la interfaz ya usa
-- para preguntar «¿esto se puede borrar?».
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
    when 'supplier'       then (select organization_id from quality_supplier_profiles where id = p_id)
  end;

  if v_org is null or not is_org_member(v_org) then return v_none; end if;

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
    when 'supplier'       then quality_supplier_deletion_verdict(p_id)
  end;
end;
$$;
revoke all on function public.quality_deletion_eligibility(text, uuid) from public, anon;
grant execute on function public.quality_deletion_eligibility(text, uuid) to authenticated;


-- §38 · Y el borrado se hace cumplir en la BASE, no en la pantalla. Entre el
-- aviso y la confirmación pueden pasar cosas; si en ese rato entra una
-- evaluación, el borrado falla con el mismo motivo que se habría mostrado.
create or replace function public.quality_supplier_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_verdict jsonb;
begin
  v_verdict := quality_supplier_deletion_verdict(old.id);
  if not coalesce((v_verdict->>'can_hard_delete')::boolean, false) then
    raise exception '%', coalesce(v_verdict->>'reason',
      'Este proveedor tiene historia y debe conservarse.');
  end if;
  return old;
end;
$$;
revoke all on function public.quality_supplier_delete_guard() from public, anon, authenticated;

create trigger t_quality_supplier_delete_guard
  before delete on public.quality_supplier_profiles
  for each row execute function public.quality_supplier_delete_guard();


-- ============================================================================
-- 19 · RLS (§50, §51, §52, §53)
-- ----------------------------------------------------------------------------
-- Deny-by-default. Cada tabla enciende RLS, declara sus políticas y además
-- REVOCA y vuelve a conceder los privilegios: es la lección de 0115 y 0118, y
-- la que volvió a aparecer en la validación de QUALITY-06 contra un proyecto
-- real. Una política correcta con un GRANT heredado de más sigue siendo un
-- agujero, porque RLS filtra filas pero no concede permisos que no existían.
--
-- §50 · El aislamiento es por empresa, siempre. Dos organizaciones con el mismo
-- NIT en su catálogo son dos identidades distintas y no comparten una sola
-- fila.
--
-- Las tablas que solo escriben las RPC —clasificaciones, decisiones y
-- señales— reciben lectura pero no escritura de sesión: la vía formal es la
-- única vía.
-- ----------------------------------------------------------------------------

alter table public.quality_external_parties                 enable row level security;
alter table public.quality_external_party_roles             enable row level security;
alter table public.quality_external_party_sites             enable row level security;
alter table public.quality_external_party_contacts          enable row level security;
alter table public.quality_supplier_profiles                enable row level security;
alter table public.quality_supplier_categories              enable row level security;
alter table public.quality_supplier_category_assignments    enable row level security;
alter table public.quality_supplier_scopes                  enable row level security;
alter table public.quality_supplier_criticality_assessments enable row level security;
alter table public.quality_supplier_criticality_factors     enable row level security;
alter table public.quality_supplier_requirements            enable row level security;
alter table public.quality_supplier_requirement_assignments enable row level security;
alter table public.quality_supplier_documents               enable row level security;
alter table public.quality_supplier_evaluation_templates    enable row level security;
alter table public.quality_supplier_template_versions       enable row level security;
alter table public.quality_supplier_evaluation_criteria     enable row level security;
alter table public.quality_supplier_evaluations             enable row level security;
alter table public.quality_supplier_evaluation_results      enable row level security;
alter table public.quality_supplier_approval_decisions      enable row level security;
alter table public.quality_supplier_incidents               enable row level security;
alter table public.quality_supplier_signals                 enable row level security;

-- --- lectura: cualquier miembro de la empresa -------------------------------
create policy quality_external_parties_select on public.quality_external_parties
  for select using (is_org_member(organization_id));
create policy quality_external_party_roles_select on public.quality_external_party_roles
  for select using (is_org_member(organization_id));
create policy quality_external_party_sites_select on public.quality_external_party_sites
  for select using (is_org_member(organization_id));
create policy quality_external_party_contacts_select on public.quality_external_party_contacts
  for select using (is_org_member(organization_id));
create policy quality_supplier_profiles_select on public.quality_supplier_profiles
  for select using (is_org_member(organization_id));
create policy quality_supplier_categories_select on public.quality_supplier_categories
  for select using (is_org_member(organization_id));
create policy quality_supplier_category_assignments_select on public.quality_supplier_category_assignments
  for select using (is_org_member(organization_id));
create policy quality_supplier_scopes_select on public.quality_supplier_scopes
  for select using (is_org_member(organization_id));
create policy quality_supplier_criticality_assessments_select on public.quality_supplier_criticality_assessments
  for select using (is_org_member(organization_id));
create policy quality_supplier_criticality_factors_select on public.quality_supplier_criticality_factors
  for select using (is_org_member(organization_id));
create policy quality_supplier_requirements_select on public.quality_supplier_requirements
  for select using (is_org_member(organization_id));
create policy quality_supplier_requirement_assignments_select on public.quality_supplier_requirement_assignments
  for select using (is_org_member(organization_id));
create policy quality_supplier_documents_select on public.quality_supplier_documents
  for select using (is_org_member(organization_id));
create policy quality_supplier_evaluation_templates_select on public.quality_supplier_evaluation_templates
  for select using (is_org_member(organization_id));
create policy quality_supplier_template_versions_select on public.quality_supplier_template_versions
  for select using (is_org_member(organization_id));
create policy quality_supplier_evaluation_criteria_select on public.quality_supplier_evaluation_criteria
  for select using (is_org_member(organization_id));
create policy quality_supplier_evaluations_select on public.quality_supplier_evaluations
  for select using (is_org_member(organization_id));
create policy quality_supplier_evaluation_results_select on public.quality_supplier_evaluation_results
  for select using (is_org_member(organization_id));
create policy quality_supplier_approval_decisions_select on public.quality_supplier_approval_decisions
  for select using (is_org_member(organization_id));
create policy quality_supplier_incidents_select on public.quality_supplier_incidents
  for select using (is_org_member(organization_id));
create policy quality_supplier_signals_select on public.quality_supplier_signals
  for select using (is_org_member(organization_id));

-- --- escritura del dominio: quien gestiona proveedores ----------------------
create policy quality_external_parties_write on public.quality_external_parties
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_external_party_roles_write on public.quality_external_party_roles
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_external_party_sites_write on public.quality_external_party_sites
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_external_party_contacts_write on public.quality_external_party_contacts
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_supplier_profiles_write on public.quality_supplier_profiles
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_supplier_categories_write on public.quality_supplier_categories
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_supplier_category_assignments_write on public.quality_supplier_category_assignments
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_supplier_scopes_write on public.quality_supplier_scopes
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_supplier_requirements_write on public.quality_supplier_requirements
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_supplier_requirement_assignments_write on public.quality_supplier_requirement_assignments
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_supplier_documents_write on public.quality_supplier_documents
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_supplier_evaluation_templates_write on public.quality_supplier_evaluation_templates
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_supplier_template_versions_write on public.quality_supplier_template_versions
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_supplier_evaluation_criteria_write on public.quality_supplier_evaluation_criteria
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_supplier_evaluations_write on public.quality_supplier_evaluations
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_supplier_evaluation_results_write on public.quality_supplier_evaluation_results
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));
create policy quality_supplier_incidents_write on public.quality_supplier_incidents
  for all using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));

-- La señal la escribe el barrido. Desde la sesión solo se descarta o se marca
-- como promovida a caso.
create policy quality_supplier_signals_update on public.quality_supplier_signals
  for update using (quality_manages_suppliers(organization_id))
  with check (quality_manages_suppliers(organization_id));

-- --- privilegios de tabla ---------------------------------------------------
revoke all on table public.quality_external_parties                 from anon, authenticated;
revoke all on table public.quality_external_party_roles             from anon, authenticated;
revoke all on table public.quality_external_party_sites             from anon, authenticated;
revoke all on table public.quality_external_party_contacts          from anon, authenticated;
revoke all on table public.quality_supplier_profiles                from anon, authenticated;
revoke all on table public.quality_supplier_categories              from anon, authenticated;
revoke all on table public.quality_supplier_category_assignments    from anon, authenticated;
revoke all on table public.quality_supplier_scopes                  from anon, authenticated;
revoke all on table public.quality_supplier_criticality_assessments from anon, authenticated;
revoke all on table public.quality_supplier_criticality_factors     from anon, authenticated;
revoke all on table public.quality_supplier_requirements            from anon, authenticated;
revoke all on table public.quality_supplier_requirement_assignments from anon, authenticated;
revoke all on table public.quality_supplier_documents               from anon, authenticated;
revoke all on table public.quality_supplier_evaluation_templates    from anon, authenticated;
revoke all on table public.quality_supplier_template_versions       from anon, authenticated;
revoke all on table public.quality_supplier_evaluation_criteria     from anon, authenticated;
revoke all on table public.quality_supplier_evaluations             from anon, authenticated;
revoke all on table public.quality_supplier_evaluation_results      from anon, authenticated;
revoke all on table public.quality_supplier_approval_decisions      from anon, authenticated;
revoke all on table public.quality_supplier_incidents               from anon, authenticated;
revoke all on table public.quality_supplier_signals                 from anon, authenticated;

grant select, insert, update, delete on table public.quality_external_parties                 to authenticated;
grant select, insert, update, delete on table public.quality_external_party_roles             to authenticated;
grant select, insert, update, delete on table public.quality_external_party_sites             to authenticated;
grant select, insert, update, delete on table public.quality_external_party_contacts          to authenticated;
grant select, insert, update, delete on table public.quality_supplier_profiles                to authenticated;
grant select, insert, update, delete on table public.quality_supplier_categories              to authenticated;
grant select, insert, update, delete on table public.quality_supplier_category_assignments    to authenticated;
grant select, insert, update, delete on table public.quality_supplier_scopes                  to authenticated;
grant select, insert, update, delete on table public.quality_supplier_requirements            to authenticated;
grant select, insert, update, delete on table public.quality_supplier_requirement_assignments to authenticated;
grant select, insert, update, delete on table public.quality_supplier_documents               to authenticated;
grant select, insert, update, delete on table public.quality_supplier_evaluation_templates    to authenticated;
grant select, insert, update, delete on table public.quality_supplier_template_versions       to authenticated;
grant select, insert, update, delete on table public.quality_supplier_evaluation_criteria     to authenticated;
grant select, insert, update, delete on table public.quality_supplier_evaluations             to authenticated;
grant select, insert, update, delete on table public.quality_supplier_evaluation_results      to authenticated;
grant select, insert, update, delete on table public.quality_supplier_incidents               to authenticated;

-- Estas SOLO se leen desde la sesión: escribirlas es cosa de las RPC formales.
grant select on table public.quality_supplier_criticality_assessments to authenticated;
grant select on table public.quality_supplier_criticality_factors     to authenticated;
grant select on table public.quality_supplier_approval_decisions      to authenticated;
grant select, update on table public.quality_supplier_signals         to authenticated;

grant select on public.v_quality_supplier_scope_status   to authenticated;
grant select on public.v_quality_supplier_overview       to authenticated;
grant select on public.v_quality_approved_supplier_list  to authenticated;
