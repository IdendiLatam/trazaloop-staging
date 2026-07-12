-- 0020_catalog.sql
-- Trazaloop · Sprint 2 · Catálogos iniciales: familias, productos,
-- clasificaciones de material (global), proveedores y materiales.
-- Integridad multiempresa DOBLE: RLS + FK compuestas (organization_id, id).

-- ---------------------------------------------------------------------------
-- product_families
-- ---------------------------------------------------------------------------
create table public.product_families (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null,
  description     text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint product_families_org_name_uniq unique (organization_id, name),
  constraint product_families_org_id_uniq unique (organization_id, id)
);

-- ---------------------------------------------------------------------------
-- products (referencias)
-- ---------------------------------------------------------------------------
create table public.products (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete restrict,
  family_id                 uuid,
  code                      text not null,
  name                      text not null,
  declared_recycled_percent numeric(7,4),
  created_by                uuid references public.profiles (id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint products_org_code_uniq unique (organization_id, code),
  constraint products_org_id_uniq unique (organization_id, id),
  constraint products_declared_percent_range
    check (declared_recycled_percent is null
           or (declared_recycled_percent >= 0 and declared_recycled_percent <= 100)),
  -- FK compuesta: la familia debe ser de la MISMA empresa.
  constraint products_family_fk
    foreign key (organization_id, family_id)
    references public.product_families (organization_id, id)
);

create index products_family_idx on public.products (family_id);

-- ---------------------------------------------------------------------------
-- material_classifications (catálogo global — seed en 0022)
-- Banderas normativas del cálculo futuro (Sprint 4): aquí solo se definen.
-- ---------------------------------------------------------------------------
create table public.material_classifications (
  code                 text primary key,
  label                text not null,
  eligible_as_recycled boolean not null,
  requires_support     boolean not null default false,
  never_counts         boolean not null default false,
  can_reclassify_to    text references public.material_classifications (code),
  description          text
);

-- ---------------------------------------------------------------------------
-- suppliers
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null,
  tax_id          text,
  contact         text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint suppliers_org_name_uniq unique (organization_id, name),
  constraint suppliers_org_id_uniq unique (organization_id, id)
);

-- ---------------------------------------------------------------------------
-- materials
-- ---------------------------------------------------------------------------
create table public.materials (
  id                              uuid primary key default gen_random_uuid(),
  organization_id                 uuid not null references public.organizations (id) on delete restrict,
  name                            text not null,
  classification_code             text not null references public.material_classifications (code),
  reclassified_to_code            text references public.material_classifications (code),
  reclassification_justification  text,
  reclassification_evidence_id    uuid,
  origin_support_evidence_id      uuid,
  reclassified_by                 uuid references public.profiles (id),
  reclassified_at                 timestamptz,
  created_by                      uuid references public.profiles (id),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint materials_org_name_uniq unique (organization_id, name),
  constraint materials_org_id_uniq unique (organization_id, id),
  -- Reclasificar exige justificación y evidencia (respaldado también por trigger).
  constraint materials_reclassification_support_check
    check (
      reclassified_to_code is null
      or (reclassification_justification is not null
          and reclassification_evidence_id is not null)
    ),
  -- FK compuestas: el soporte debe ser una evidencia de la MISMA empresa.
  constraint materials_reclass_evidence_fk
    foreign key (organization_id, reclassification_evidence_id)
    references public.evidences (organization_id, id),
  constraint materials_origin_evidence_fk
    foreign key (organization_id, origin_support_evidence_id)
    references public.evidences (organization_id, id)
);

create index materials_classification_idx on public.materials (classification_code);

-- updated_at + created_by forzado + auditoría en los cuatro catálogos por empresa.
create trigger t_product_families_updated before update on public.product_families
  for each row execute function public.set_updated_at();
create trigger t_products_updated before update on public.products
  for each row execute function public.set_updated_at();
create trigger t_suppliers_updated before update on public.suppliers
  for each row execute function public.set_updated_at();
create trigger t_materials_updated before update on public.materials
  for each row execute function public.set_updated_at();

create trigger t_product_families_force_created_by before insert on public.product_families
  for each row execute function public.force_created_by();
create trigger t_products_force_created_by before insert on public.products
  for each row execute function public.force_created_by();
create trigger t_suppliers_force_created_by before insert on public.suppliers
  for each row execute function public.force_created_by();
create trigger t_materials_force_created_by before insert on public.materials
  for each row execute function public.force_created_by();

create trigger t_audit_product_families after insert or update or delete on public.product_families
  for each row execute function public.audit_row_change();
create trigger t_audit_products after insert or update or delete on public.products
  for each row execute function public.audit_row_change();
create trigger t_audit_suppliers after insert or update or delete on public.suppliers
  for each row execute function public.audit_row_change();
create trigger t_audit_materials after insert or update or delete on public.materials
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Reclasificación de material: solo admin/quality, destino permitido por el
-- catálogo, con justificación + evidencia; registra evento semántico usando
-- la función interna log_event (no expuesta a clientes: este trigger es
-- SECURITY DEFINER y ejecuta con los privilegios de su dueño).
-- ---------------------------------------------------------------------------
create or replace function public.validate_material_reclassification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text;
begin
  if new.reclassified_to_code is not null
     and new.reclassified_to_code is distinct from old.reclassified_to_code then

    if not public.has_org_role(new.organization_id, array['admin','quality']) then
      raise exception 'Solo administrador o calidad pueden reclasificar materiales';
    end if;

    select can_reclassify_to into v_allowed
    from material_classifications
    where code = new.classification_code;

    if v_allowed is null or v_allowed <> new.reclassified_to_code then
      raise exception 'Reclasificación % -> % no permitida por el catálogo',
        new.classification_code, new.reclassified_to_code;
    end if;

    if new.reclassification_evidence_id is null
       or new.reclassification_justification is null then
      raise exception 'La reclasificación exige justificación y evidencia de soporte';
    end if;

    new.reclassified_by := auth.uid();
    new.reclassified_at := now();

    perform public.log_event(
      new.organization_id,
      'material_reclassified',
      jsonb_build_object(
        'material_id', new.id,
        'from', new.classification_code,
        'to', new.reclassified_to_code
      )
    );
  end if;

  return new;
end;
$$;
revoke execute on function public.validate_material_reclassification() from public, anon, authenticated;

create trigger t_materials_reclassification
  before update on public.materials
  for each row execute function public.validate_material_reclassification();

-- ---------------------------------------------------------------------------
-- Trigger polimórfico de evidence_links (aquí porque ya existen los targets).
-- Valida SOLO los targets existentes en Sprint 2: site, supplier, material,
-- product, product_family. Los futuros (input_batch, production_order,
-- output_batch, document, requirement) quedan preparados en el enum pero se
-- rechazan hasta que exista su tabla — sin romper por tablas inexistentes.
-- ---------------------------------------------------------------------------
create or replace function public.validate_evidence_link_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_org uuid;
begin
  case new.target_type
    when 'site'           then select organization_id into v_target_org from sites            where id = new.target_id;
    when 'supplier'       then select organization_id into v_target_org from suppliers        where id = new.target_id;
    when 'material'       then select organization_id into v_target_org from materials        where id = new.target_id;
    when 'product'        then select organization_id into v_target_org from products         where id = new.target_id;
    when 'product_family' then select organization_id into v_target_org from product_families where id = new.target_id;
    else
      raise exception 'El tipo de destino % aún no está disponible para enlaces de evidencia', new.target_type;
  end case;

  if v_target_org is null then
    raise exception 'El destino % del enlace de evidencia no existe', new.target_id;
  end if;

  if v_target_org <> new.organization_id then
    raise exception 'Enlace de evidencia entre empresas bloqueado (evidencia % vs destino %)',
      new.organization_id, v_target_org;
  end if;

  return new;
end;
$$;
revoke execute on function public.validate_evidence_link_org() from public, anon, authenticated;

create trigger t_evidence_links_same_org
  before insert or update on public.evidence_links
  for each row execute function public.validate_evidence_link_org();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.product_families         enable row level security;
alter table public.products                 enable row level security;
alter table public.material_classifications enable row level security;
alter table public.suppliers                enable row level security;
alter table public.materials                enable row level security;

create policy material_classifications_select on public.material_classifications
  for select to authenticated using (true);

-- Plantilla estándar para los cuatro catálogos por empresa:
-- select/insert/update miembros activos; delete admin/quality.
create policy product_families_select on public.product_families
  for select to authenticated using (public.is_org_member(organization_id));
create policy product_families_insert on public.product_families
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy product_families_update on public.product_families
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy product_families_delete on public.product_families
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

create policy products_select on public.products
  for select to authenticated using (public.is_org_member(organization_id));
create policy products_insert on public.products
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy products_update on public.products
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy products_delete on public.products
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

create policy suppliers_select on public.suppliers
  for select to authenticated using (public.is_org_member(organization_id));
create policy suppliers_insert on public.suppliers
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy suppliers_update on public.suppliers
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy suppliers_delete on public.suppliers
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

create policy materials_select on public.materials
  for select to authenticated using (public.is_org_member(organization_id));
create policy materials_insert on public.materials
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy materials_update on public.materials
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy materials_delete on public.materials
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));
