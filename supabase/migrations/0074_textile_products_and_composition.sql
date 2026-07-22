-- 0074_textile_products_and_composition.sql
-- Trazaloop · Sprint T4 (Textil) · Productos, referencias y composición
-- estructurada.
--
-- ALCANCE ESTRICTO (T4): colecciones/líneas, productos textiles,
-- referencias/SKU, composición porcentual de fibras por referencia y
-- asociación de materiales y avíos/componentes de los catálogos T3 a una
-- referencia. NADA de órdenes, lotes, trazabilidad por lote, evidencias,
-- circularidad, TrazaDocs Textil, pasaporte, QR ni planes (T5–T9 /
-- Plataforma-M1). CERO cambios a objetos CPR; solo se reutilizan helpers
-- transversales sin modificarlos (set_updated_at, force_created_by,
-- prevent_organization_id_change, audit_row_change, is_org_member,
-- has_org_role).
--
-- Jerarquía: Empresa → Colección/línea (opcional) → Producto → Referencia/
-- SKU → composición + materiales + componentes. Todas las relaciones usan
-- FK COMPUESTA (organization_id, <fk>): el cross-tenant es imposible en BD.
--
-- LENGUAJE (N-05 / ISO 14021): is_recycled_declared / is_organic_declared
-- registran DECLARACIONES preliminares; el estado de composición
-- (not_started/incomplete/complete/needs_review) describe COMPLETITUD de
-- información interna — nunca cumplimiento, certificación ni pasaporte
-- oficial. Las evidencias llegan en T5.
--
-- RLS: plantilla de catálogos T3 (select/insert/update miembros; delete de
-- maestros solo admin/quality). En las TRES tablas de asociación el delete
-- se amplía a consultant (mismos roles de escritura de composición que CPR
-- 0025): quitar una fila de composición es parte de la edición normal y no
-- destruye datos maestros. Nunca más débil que T3.

-- ---------------------------------------------------------------------------
-- textile_collections (colecciones, líneas, temporadas o programas)
-- ---------------------------------------------------------------------------
create table public.textile_collections (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  name                text not null,
  code                text,
  description         text,
  season              text,
  year                integer,
  customer_or_program text,
  status              text not null default 'active',
  notes               text,
  is_active           boolean not null default true,
  created_by          uuid references public.profiles (id),
  updated_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint textile_collections_org_name_uniq unique (organization_id, name),
  constraint textile_collections_org_id_uniq unique (organization_id, id),
  constraint textile_collections_status_check
    check (status in ('draft', 'active', 'archived')),
  constraint textile_collections_year_check
    check (year is null or (year >= 2000 and year <= 2100))
);

create unique index textile_collections_org_code_uniq
  on public.textile_collections (organization_id, code)
  where code is not null;

-- ---------------------------------------------------------------------------
-- textile_products (producto textil genérico)
-- ---------------------------------------------------------------------------
create table public.textile_products (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  collection_id   uuid,
  name            text not null,
  product_code    text,
  category        text not null default 'other',
  description     text,
  intended_use    text,
  target_market   text,
  status          text not null default 'draft',
  notes           text,
  is_active       boolean not null default true,
  created_by      uuid references public.profiles (id),
  updated_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint textile_products_org_id_uniq unique (organization_id, id),
  constraint textile_products_category_check
    check (category in (
      'shirt', 'pants', 'jacket', 'dress', 't_shirt', 'uniform', 'workwear',
      'underwear', 'home_textile', 'accessory', 'other'
    )),
  constraint textile_products_status_check
    check (status in ('draft', 'active', 'inactive', 'obsolete')),
  -- FK compuesta: la colección debe ser de la MISMA empresa.
  constraint textile_products_collection_fk
    foreign key (organization_id, collection_id)
    references public.textile_collections (organization_id, id)
);

create unique index textile_products_org_code_uniq
  on public.textile_products (organization_id, product_code)
  where product_code is not null;

create index textile_products_collection_idx on public.textile_products (collection_id);

-- ---------------------------------------------------------------------------
-- textile_references (referencia / SKU / versión comercial trazable)
-- ---------------------------------------------------------------------------
create table public.textile_references (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  product_id         uuid not null,
  sku                text not null,
  name               text,
  version_label      text,
  color              text,
  size_range         text,
  gender_or_fit      text,
  description        text,
  status             text not null default 'draft',
  -- Estado de COMPLETITUD de la composición (informativo, recalculado por
  -- el servidor tras cada cambio; la página de detalle recalcula en vivo
  -- desde las filas — nunca describe cumplimiento ni certificación).
  composition_status text not null default 'not_started',
  notes              text,
  is_active          boolean not null default true,
  created_by         uuid references public.profiles (id),
  updated_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint textile_references_org_sku_uniq unique (organization_id, sku),
  constraint textile_references_org_id_uniq unique (organization_id, id),
  constraint textile_references_status_check
    check (status in ('draft', 'active', 'inactive', 'obsolete')),
  constraint textile_references_composition_status_check
    check (composition_status in ('not_started', 'incomplete', 'complete', 'needs_review')),
  constraint textile_references_product_fk
    foreign key (organization_id, product_id)
    references public.textile_products (organization_id, id)
);

create index textile_references_product_idx on public.textile_references (product_id);

-- ---------------------------------------------------------------------------
-- textile_reference_fiber_composition (composición porcentual por fibras)
-- ---------------------------------------------------------------------------
create table public.textile_reference_fiber_composition (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  reference_id         uuid not null,
  fiber_type_id        uuid not null references public.textile_fiber_types (id),
  percentage           numeric(6, 2) not null,
  source_material_id   uuid,
  component_scope      text not null default 'whole_product',
  is_recycled_declared boolean not null default false,
  is_organic_declared  boolean not null default false,
  notes                text,
  created_by           uuid references public.profiles (id),
  updated_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint textile_ref_fibers_org_id_uniq unique (organization_id, id),
  constraint textile_ref_fibers_percentage_check
    check (percentage > 0 and percentage <= 100),
  constraint textile_ref_fibers_scope_check
    check (component_scope in (
      'whole_product', 'main_fabric', 'secondary_fabric', 'lining',
      'thread', 'trim', 'other'
    )),
  -- Una fibra aparece una sola vez por alcance dentro de la referencia.
  constraint textile_ref_fibers_uniq
    unique (organization_id, reference_id, fiber_type_id, component_scope),
  constraint textile_ref_fibers_reference_fk
    foreign key (organization_id, reference_id)
    references public.textile_references (organization_id, id)
    on delete cascade,
  constraint textile_ref_fibers_material_fk
    foreign key (organization_id, source_material_id)
    references public.textile_materials (organization_id, id)
);

create index textile_ref_fibers_reference_idx
  on public.textile_reference_fiber_composition (reference_id);

-- ---------------------------------------------------------------------------
-- textile_reference_materials (materiales/insumos de la referencia)
-- ---------------------------------------------------------------------------
create table public.textile_reference_materials (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  reference_id         uuid not null,
  material_id          uuid not null,
  role                 text not null default 'other',
  estimated_percentage numeric(6, 2),
  quantity_description text,
  notes                text,
  created_by           uuid references public.profiles (id),
  updated_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint textile_ref_materials_org_id_uniq unique (organization_id, id),
  constraint textile_ref_materials_role_check
    check (role in (
      'main_fabric', 'secondary_fabric', 'lining', 'thread', 'interlining',
      'label', 'packaging', 'other'
    )),
  constraint textile_ref_materials_pct_check
    check (estimated_percentage is null or (estimated_percentage > 0 and estimated_percentage <= 100)),
  constraint textile_ref_materials_uniq
    unique (organization_id, reference_id, material_id, role),
  constraint textile_ref_materials_reference_fk
    foreign key (organization_id, reference_id)
    references public.textile_references (organization_id, id)
    on delete cascade,
  constraint textile_ref_materials_material_fk
    foreign key (organization_id, material_id)
    references public.textile_materials (organization_id, id)
);

create index textile_ref_materials_reference_idx
  on public.textile_reference_materials (reference_id);

-- ---------------------------------------------------------------------------
-- textile_reference_components (avíos/componentes de la referencia)
-- ---------------------------------------------------------------------------
create table public.textile_reference_components (
  id                            uuid primary key default gen_random_uuid(),
  organization_id               uuid not null references public.organizations (id) on delete restrict,
  reference_id                  uuid not null,
  component_id                  uuid not null,
  role                          text not null default 'functional',
  quantity_description          text,
  separability_override         text,
  replacement_possible_override boolean,
  notes                         text,
  created_by                    uuid references public.profiles (id),
  updated_by                    uuid references public.profiles (id),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint textile_ref_components_org_id_uniq unique (organization_id, id),
  constraint textile_ref_components_role_check
    check (role in (
      'functional', 'decorative', 'identification', 'packaging', 'closure',
      'reinforcement', 'other'
    )),
  constraint textile_ref_components_separability_check
    check (separability_override is null
           or separability_override in ('easy', 'moderate', 'difficult', 'not_evaluated')),
  constraint textile_ref_components_uniq
    unique (organization_id, reference_id, component_id, role),
  constraint textile_ref_components_reference_fk
    foreign key (organization_id, reference_id)
    references public.textile_references (organization_id, id)
    on delete cascade,
  constraint textile_ref_components_component_fk
    foreign key (organization_id, component_id)
    references public.textile_components (organization_id, id)
);

create index textile_ref_components_reference_idx
  on public.textile_reference_components (reference_id);

-- ---------------------------------------------------------------------------
-- Triggers comunes (patrón 0020/0024) en las seis tablas
-- ---------------------------------------------------------------------------
create trigger t_textile_collections_updated before update on public.textile_collections
  for each row execute function public.set_updated_at();
create trigger t_textile_products_updated before update on public.textile_products
  for each row execute function public.set_updated_at();
create trigger t_textile_references_updated before update on public.textile_references
  for each row execute function public.set_updated_at();
create trigger t_textile_ref_fibers_updated before update on public.textile_reference_fiber_composition
  for each row execute function public.set_updated_at();
create trigger t_textile_ref_materials_updated before update on public.textile_reference_materials
  for each row execute function public.set_updated_at();
create trigger t_textile_ref_components_updated before update on public.textile_reference_components
  for each row execute function public.set_updated_at();

create trigger t_textile_collections_force_created_by before insert on public.textile_collections
  for each row execute function public.force_created_by();
create trigger t_textile_products_force_created_by before insert on public.textile_products
  for each row execute function public.force_created_by();
create trigger t_textile_references_force_created_by before insert on public.textile_references
  for each row execute function public.force_created_by();
create trigger t_textile_ref_fibers_force_created_by before insert on public.textile_reference_fiber_composition
  for each row execute function public.force_created_by();
create trigger t_textile_ref_materials_force_created_by before insert on public.textile_reference_materials
  for each row execute function public.force_created_by();
create trigger t_textile_ref_components_force_created_by before insert on public.textile_reference_components
  for each row execute function public.force_created_by();

create trigger t_textile_collections_org_immutable before update on public.textile_collections
  for each row execute function public.prevent_organization_id_change();
create trigger t_textile_products_org_immutable before update on public.textile_products
  for each row execute function public.prevent_organization_id_change();
create trigger t_textile_references_org_immutable before update on public.textile_references
  for each row execute function public.prevent_organization_id_change();
create trigger t_textile_ref_fibers_org_immutable before update on public.textile_reference_fiber_composition
  for each row execute function public.prevent_organization_id_change();
create trigger t_textile_ref_materials_org_immutable before update on public.textile_reference_materials
  for each row execute function public.prevent_organization_id_change();
create trigger t_textile_ref_components_org_immutable before update on public.textile_reference_components
  for each row execute function public.prevent_organization_id_change();

create trigger t_audit_textile_collections after insert or update or delete on public.textile_collections
  for each row execute function public.audit_row_change();
create trigger t_audit_textile_products after insert or update or delete on public.textile_products
  for each row execute function public.audit_row_change();
create trigger t_audit_textile_references after insert or update or delete on public.textile_references
  for each row execute function public.audit_row_change();
create trigger t_audit_textile_ref_fibers after insert or update or delete on public.textile_reference_fiber_composition
  for each row execute function public.audit_row_change();
create trigger t_audit_textile_ref_materials after insert or update or delete on public.textile_reference_materials
  for each row execute function public.audit_row_change();
create trigger t_audit_textile_ref_components after insert or update or delete on public.textile_reference_components
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.textile_collections                  enable row level security;
alter table public.textile_products                     enable row level security;
alter table public.textile_references                   enable row level security;
alter table public.textile_reference_fiber_composition  enable row level security;
alter table public.textile_reference_materials          enable row level security;
alter table public.textile_reference_components         enable row level security;

-- Maestros: plantilla T3 (delete solo admin/quality).
create policy textile_collections_select on public.textile_collections
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_collections_insert on public.textile_collections
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy textile_collections_update on public.textile_collections
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy textile_collections_delete on public.textile_collections
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

create policy textile_products_select on public.textile_products
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_products_insert on public.textile_products
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy textile_products_update on public.textile_products
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy textile_products_delete on public.textile_products
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

create policy textile_references_select on public.textile_references
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_references_insert on public.textile_references
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy textile_references_update on public.textile_references
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy textile_references_delete on public.textile_references
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

-- Asociaciones: quitar filas hace parte de la edición → delete también para
-- consultant (roles de escritura de composición CPR 0025). Select/insert/
-- update: plantilla T3.
create policy textile_ref_fibers_select on public.textile_reference_fiber_composition
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_ref_fibers_insert on public.textile_reference_fiber_composition
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy textile_ref_fibers_update on public.textile_reference_fiber_composition
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy textile_ref_fibers_delete on public.textile_reference_fiber_composition
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']));

create policy textile_ref_materials_select on public.textile_reference_materials
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_ref_materials_insert on public.textile_reference_materials
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy textile_ref_materials_update on public.textile_reference_materials
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy textile_ref_materials_delete on public.textile_reference_materials
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']));

create policy textile_ref_components_select on public.textile_reference_components
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_ref_components_insert on public.textile_reference_components
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy textile_ref_components_update on public.textile_reference_components
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy textile_ref_components_delete on public.textile_reference_components
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']));
