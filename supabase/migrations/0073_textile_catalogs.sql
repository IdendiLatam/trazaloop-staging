-- 0073_textile_catalogs.sql
-- Trazaloop · Sprint T3 (Textil) · Catálogos textiles base.
--
-- ALCANCE ESTRICTO (T3): SOLO catálogos base — proveedores, tipos de fibra
-- (global), materiales e insumos, avíos/componentes, procesos internos y
-- procesos tercerizados. NADA de productos, referencias, colecciones,
-- composición porcentual estructurada, órdenes, lotes, evidencias,
-- circularidad, TrazaDocs Textil, pasaporte ni planes por módulo (sprints
-- T4–T9 / Plataforma-M1). CERO cambios a objetos CPR; se REUTILIZAN solo
-- helpers transversales (set_updated_at, force_created_by,
-- prevent_organization_id_change, audit_row_change, is_org_member,
-- has_org_role) sin modificarlos.
--
-- Patrón: espejo del catálogo CPR 0020 + inmutabilidad 0024 — unique
-- (organization_id, name), unique (organization_id, id) para FKs
-- compuestas, RLS select/insert/update de miembros y delete admin/quality,
-- created_by forzado, auditoría. Los enlaces a proveedor usan FK COMPUESTA
-- (organization_id, supplier_id): imposible referenciar un proveedor de
-- otra empresa.
--
-- LENGUAJE (N-05 / ISO 14021): los campos recycled_claim / organic_claim y
-- el catálogo de fibras describen DECLARACIONES preliminares de catálogo;
-- registrar un valor no afirma que el material sea reciclado, orgánico ni
-- que cuente con soporte de esquemas externos — las evidencias llegan en
-- T5 y el soporte documental se referencia allí.

-- ---------------------------------------------------------------------------
-- textile_fiber_types (catálogo GLOBAL de tipos de fibra — lectura para
-- autenticados, sin escritura de clientes; nombres genéricos según ISO 2076
-- para fibras manufacturadas; N-08)
-- ---------------------------------------------------------------------------
create table public.textile_fiber_types (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  name               text not null,
  fiber_family       text not null,
  origin_type        text,
  is_natural         boolean not null default false,
  is_synthetic       boolean not null default false,
  is_regenerated     boolean not null default false,
  is_recycled_option boolean not null default false,
  notes              text,
  is_active          boolean not null default true,
  display_order      integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint textile_fiber_types_family_check
    check (fiber_family in (
      'natural_cellulosic', 'natural_protein', 'synthetic',
      'regenerated_cellulosic', 'inorganic', 'other'
    ))
);

create trigger t_textile_fiber_types_updated
  before update on public.textile_fiber_types
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- textile_suppliers (proveedores textiles por empresa; N-03)
-- ---------------------------------------------------------------------------
create table public.textile_suppliers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null,
  tax_id          text,
  country         text,
  city            text,
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  supplier_type   text not null default 'other',
  is_critical     boolean not null default false,
  notes           text,
  is_active       boolean not null default true,
  created_by      uuid references public.profiles (id),
  updated_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint textile_suppliers_org_name_uniq unique (organization_id, name),
  constraint textile_suppliers_org_id_uniq unique (organization_id, id),
  constraint textile_suppliers_type_check
    check (supplier_type in (
      'fabric_supplier', 'trims_supplier', 'thread_supplier',
      'packaging_supplier', 'outsourced_process', 'mixed', 'other'
    )),
  constraint textile_suppliers_email_check
    check (contact_email is null or contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

-- ---------------------------------------------------------------------------
-- textile_materials (materiales e insumos por empresa; N-03/N-08.
-- declared_composition es TEXTO preliminar: la composición porcentual
-- estructurada pertenece a T4 y NO se crea aquí.)
-- ---------------------------------------------------------------------------
create table public.textile_materials (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete restrict,
  name                    text not null,
  internal_code           text,
  material_type           text not null,
  primary_fiber_type_id   uuid references public.textile_fiber_types (id),
  supplier_id             uuid,
  declared_composition    text,
  country_of_origin       text,
  recycled_claim          boolean not null default false,
  organic_claim           boolean not null default false,
  has_supplier_datasheet  boolean not null default false,
  has_composition_support boolean not null default false,
  notes                   text,
  is_active               boolean not null default true,
  created_by              uuid references public.profiles (id),
  updated_by              uuid references public.profiles (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint textile_materials_org_name_uniq unique (organization_id, name),
  constraint textile_materials_org_id_uniq unique (organization_id, id),
  constraint textile_materials_type_check
    check (material_type in (
      'main_fabric', 'secondary_fabric', 'lining', 'thread', 'interlining',
      'label', 'packaging', 'trim', 'other'
    )),
  -- FK compuesta: el proveedor debe ser de la MISMA empresa.
  constraint textile_materials_supplier_fk
    foreign key (organization_id, supplier_id)
    references public.textile_suppliers (organization_id, id)
);

create unique index textile_materials_org_internal_code_uniq
  on public.textile_materials (organization_id, internal_code)
  where internal_code is not null;

create index textile_materials_supplier_idx on public.textile_materials (supplier_id);
create index textile_materials_fiber_idx on public.textile_materials (primary_fiber_type_id);

-- ---------------------------------------------------------------------------
-- textile_components (avíos y componentes por empresa; N-03/N-04 —
-- separabilidad preliminar para circularidad futura, T7)
-- ---------------------------------------------------------------------------
create table public.textile_components (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  name                 text not null,
  component_type       text not null,
  material_description text,
  supplier_id          uuid,
  separability         text not null default 'not_evaluated',
  replacement_possible boolean,
  notes                text,
  is_active            boolean not null default true,
  created_by           uuid references public.profiles (id),
  updated_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint textile_components_org_name_uniq unique (organization_id, name),
  constraint textile_components_org_id_uniq unique (organization_id, id),
  constraint textile_components_type_check
    check (component_type in (
      'button', 'zipper', 'snap', 'elastic', 'label', 'patch', 'drawcord',
      'buckle', 'hook_loop', 'metal_part', 'plastic_part',
      'packaging_component', 'other'
    )),
  constraint textile_components_separability_check
    check (separability in ('easy', 'moderate', 'difficult', 'not_evaluated')),
  constraint textile_components_supplier_fk
    foreign key (organization_id, supplier_id)
    references public.textile_suppliers (organization_id, id)
);

create index textile_components_supplier_idx on public.textile_components (supplier_id);

-- ---------------------------------------------------------------------------
-- textile_processes (procesos internos por empresa; N-03)
-- ---------------------------------------------------------------------------
create table public.textile_processes (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  name               text not null,
  process_type       text not null,
  description        text,
  responsible_area   text,
  traceability_risk  text not null default 'not_evaluated',
  records_expected   text,
  is_active          boolean not null default true,
  created_by         uuid references public.profiles (id),
  updated_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint textile_processes_org_name_uniq unique (organization_id, name),
  constraint textile_processes_org_id_uniq unique (organization_id, id),
  constraint textile_processes_type_check
    check (process_type in (
      'design', 'cutting', 'sewing', 'finishing', 'inspection', 'ironing',
      'packing', 'dispatch', 'other'
    )),
  constraint textile_processes_risk_check
    check (traceability_risk in ('low', 'medium', 'high', 'not_evaluated'))
);

-- ---------------------------------------------------------------------------
-- textile_outsourced_processes (procesos tercerizados por empresa; N-03 —
-- el tercero se referencia como proveedor de la MISMA empresa)
-- ---------------------------------------------------------------------------
create table public.textile_outsourced_processes (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  supplier_id        uuid,
  name               text not null,
  process_type       text not null,
  description        text,
  records_expected   text,
  traceability_risk  text not null default 'not_evaluated',
  notes              text,
  is_active          boolean not null default true,
  created_by         uuid references public.profiles (id),
  updated_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint textile_outsourced_org_name_uniq unique (organization_id, name),
  constraint textile_outsourced_org_id_uniq unique (organization_id, id),
  constraint textile_outsourced_type_check
    check (process_type in (
      'washing', 'dyeing', 'printing', 'embroidery', 'finishing', 'coating',
      'pleating', 'external_sewing', 'inspection', 'other'
    )),
  constraint textile_outsourced_risk_check
    check (traceability_risk in ('low', 'medium', 'high', 'not_evaluated')),
  constraint textile_outsourced_supplier_fk
    foreign key (organization_id, supplier_id)
    references public.textile_suppliers (organization_id, id)
);

create index textile_outsourced_supplier_idx on public.textile_outsourced_processes (supplier_id);

-- ---------------------------------------------------------------------------
-- Triggers comunes (patrón 0020/0024): updated_at + created_by forzado +
-- organization_id inmutable + auditoría, en las cinco tablas por empresa.
-- ---------------------------------------------------------------------------
create trigger t_textile_suppliers_updated before update on public.textile_suppliers
  for each row execute function public.set_updated_at();
create trigger t_textile_materials_updated before update on public.textile_materials
  for each row execute function public.set_updated_at();
create trigger t_textile_components_updated before update on public.textile_components
  for each row execute function public.set_updated_at();
create trigger t_textile_processes_updated before update on public.textile_processes
  for each row execute function public.set_updated_at();
create trigger t_textile_outsourced_updated before update on public.textile_outsourced_processes
  for each row execute function public.set_updated_at();

create trigger t_textile_suppliers_force_created_by before insert on public.textile_suppliers
  for each row execute function public.force_created_by();
create trigger t_textile_materials_force_created_by before insert on public.textile_materials
  for each row execute function public.force_created_by();
create trigger t_textile_components_force_created_by before insert on public.textile_components
  for each row execute function public.force_created_by();
create trigger t_textile_processes_force_created_by before insert on public.textile_processes
  for each row execute function public.force_created_by();
create trigger t_textile_outsourced_force_created_by before insert on public.textile_outsourced_processes
  for each row execute function public.force_created_by();

create trigger t_textile_suppliers_org_immutable before update on public.textile_suppliers
  for each row execute function public.prevent_organization_id_change();
create trigger t_textile_materials_org_immutable before update on public.textile_materials
  for each row execute function public.prevent_organization_id_change();
create trigger t_textile_components_org_immutable before update on public.textile_components
  for each row execute function public.prevent_organization_id_change();
create trigger t_textile_processes_org_immutable before update on public.textile_processes
  for each row execute function public.prevent_organization_id_change();
create trigger t_textile_outsourced_org_immutable before update on public.textile_outsourced_processes
  for each row execute function public.prevent_organization_id_change();

create trigger t_audit_textile_suppliers after insert or update or delete on public.textile_suppliers
  for each row execute function public.audit_row_change();
create trigger t_audit_textile_materials after insert or update or delete on public.textile_materials
  for each row execute function public.audit_row_change();
create trigger t_audit_textile_components after insert or update or delete on public.textile_components
  for each row execute function public.audit_row_change();
create trigger t_audit_textile_processes after insert or update or delete on public.textile_processes
  for each row execute function public.audit_row_change();
create trigger t_audit_textile_outsourced after insert or update or delete on public.textile_outsourced_processes
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- RLS (plantilla 0020: select/insert/update miembros; delete admin/quality;
-- catálogo global de fibras: solo lectura autenticada)
-- ---------------------------------------------------------------------------
alter table public.textile_fiber_types           enable row level security;
alter table public.textile_suppliers             enable row level security;
alter table public.textile_materials             enable row level security;
alter table public.textile_components            enable row level security;
alter table public.textile_processes             enable row level security;
alter table public.textile_outsourced_processes  enable row level security;

create policy textile_fiber_types_select on public.textile_fiber_types
  for select to authenticated using (true);

create policy textile_suppliers_select on public.textile_suppliers
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_suppliers_insert on public.textile_suppliers
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy textile_suppliers_update on public.textile_suppliers
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy textile_suppliers_delete on public.textile_suppliers
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

create policy textile_materials_select on public.textile_materials
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_materials_insert on public.textile_materials
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy textile_materials_update on public.textile_materials
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy textile_materials_delete on public.textile_materials
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

create policy textile_components_select on public.textile_components
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_components_insert on public.textile_components
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy textile_components_update on public.textile_components
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy textile_components_delete on public.textile_components
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

create policy textile_processes_select on public.textile_processes
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_processes_insert on public.textile_processes
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy textile_processes_update on public.textile_processes
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy textile_processes_delete on public.textile_processes
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

create policy textile_outsourced_select on public.textile_outsourced_processes
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_outsourced_insert on public.textile_outsourced_processes
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy textile_outsourced_update on public.textile_outsourced_processes
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy textile_outsourced_delete on public.textile_outsourced_processes
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

-- ---------------------------------------------------------------------------
-- Seed · tipos de fibra (idempotente). Los nombres siguen la nomenclatura
-- genérica (ISO 2076 para fibras manufacturadas). Seleccionar una fibra
-- "reciclada" u "orgánica" registra una DECLARACIÓN de catálogo: no afirma
-- soporte documental ni esquemas externos (evidencias: T5).
-- ---------------------------------------------------------------------------
insert into public.textile_fiber_types
  (code, name, fiber_family, origin_type, is_natural, is_synthetic, is_regenerated, is_recycled_option, display_order, notes)
values
  ('cotton',             'Algodón',                    'natural_cellulosic',     'plant',   true,  false, false, false, 1,  null),
  ('organic_cotton',     'Algodón orgánico (declarado)','natural_cellulosic',    'plant',   true,  false, false, false, 2,  'Denominación declarativa: el soporte del cultivo orgánico se gestiona como evidencia (T5).'),
  ('recycled_cotton',    'Algodón reciclado (declarado)','natural_cellulosic',   'plant',   true,  false, false, true,  3,  'Denominación declarativa: el soporte del contenido reciclado se gestiona como evidencia (T5).'),
  ('linen',              'Lino',                       'natural_cellulosic',     'plant',   true,  false, false, false, 4,  null),
  ('hemp',               'Cáñamo',                     'natural_cellulosic',     'plant',   true,  false, false, false, 5,  null),
  ('wool',               'Lana',                       'natural_protein',        'animal',  true,  false, false, false, 6,  null),
  ('recycled_wool',      'Lana reciclada (declarada)', 'natural_protein',        'animal',  true,  false, false, true,  7,  'Denominación declarativa: el soporte del contenido reciclado se gestiona como evidencia (T5).'),
  ('polyester',          'Poliéster',                  'synthetic',              'fossil',  false, true,  false, false, 8,  null),
  ('recycled_polyester', 'Poliéster reciclado (declarado)','synthetic',          'fossil',  false, true,  false, true,  9,  'Denominación declarativa: el soporte del contenido reciclado se gestiona como evidencia (T5).'),
  ('polyamide',          'Poliamida (nailon)',         'synthetic',              'fossil',  false, true,  false, false, 10, null),
  ('recycled_polyamide', 'Poliamida reciclada (declarada)','synthetic',          'fossil',  false, true,  false, true,  11, 'Denominación declarativa: el soporte del contenido reciclado se gestiona como evidencia (T5).'),
  ('elastane',           'Elastano',                   'synthetic',              'fossil',  false, true,  false, false, 12, 'Fibra minoritaria relevante para reciclabilidad (ver diagnóstico TQ11).'),
  ('acrylic',            'Acrílico',                   'synthetic',              'fossil',  false, true,  false, false, 13, null),
  ('polypropylene',      'Polipropileno',              'synthetic',              'fossil',  false, true,  false, false, 14, null),
  ('viscose',            'Viscosa',                    'regenerated_cellulosic', 'plant',   false, false, true,  false, 15, null),
  ('lyocell',            'Lyocell',                    'regenerated_cellulosic', 'plant',   false, false, true,  false, 16, null),
  ('modal',              'Modal',                      'regenerated_cellulosic', 'plant',   false, false, true,  false, 17, null),
  ('acetate',            'Acetato',                    'regenerated_cellulosic', 'plant',   false, false, true,  false, 18, null),
  ('other',              'Otra fibra',                 'other',                  null,      false, false, false, false, 99, 'Usar solo cuando ninguna fibra del catálogo aplique; describir en el material.')
on conflict (code) do nothing;
