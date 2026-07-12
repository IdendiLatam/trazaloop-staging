-- 0025_traceability.sql
-- Trazaloop · Sprint 3 · Capa de trazabilidad operativa.
-- Lotes de entrada → órdenes de producción → consumos → lotes de salida →
-- composición. SIN cálculo de contenido reciclado (Sprint 4).
--
-- Toda tabla cumple la regla obligatoria (0024): RLS deny-by-default,
-- unique(organization_id, id), FK compuestas, prevent_organization_id_change,
-- set_updated_at, force_created_by y audit_row_change.

-- ---------------------------------------------------------------------------
-- 2.1 input_batches — lotes de material que ingresan
-- ---------------------------------------------------------------------------
create table public.input_batches (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  site_id          uuid,
  supplier_id      uuid not null,
  material_id      uuid not null,
  batch_code       text not null,
  residue_type     residue_type,
  provenance       text,
  received_date    date not null,
  quantity_kg      numeric(14,4),
  storage_location text,
  notes            text,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint input_batches_org_code_uniq unique (organization_id, batch_code),
  constraint input_batches_org_id_uniq unique (organization_id, id),
  constraint input_batches_quantity_positive
    check (quantity_kg is null or quantity_kg > 0),
  constraint input_batches_site_fk
    foreign key (organization_id, site_id)
    references public.sites (organization_id, id),
  constraint input_batches_supplier_fk
    foreign key (organization_id, supplier_id)
    references public.suppliers (organization_id, id),
  constraint input_batches_material_fk
    foreign key (organization_id, material_id)
    references public.materials (organization_id, id)
);

create index input_batches_org_idx      on public.input_batches (organization_id, received_date desc);
create index input_batches_supplier_idx on public.input_batches (supplier_id);
create index input_batches_material_idx on public.input_batches (material_id);

-- ---------------------------------------------------------------------------
-- 2.2 production_orders — órdenes donde se consumen materiales
-- ---------------------------------------------------------------------------
create table public.production_orders (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  site_id           uuid,
  order_code        text not null,
  order_date        date not null,
  status            text not null default 'draft',
  pretreatment      text,
  process_variables jsonb,
  notes             text,
  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint production_orders_org_code_uniq unique (organization_id, order_code),
  constraint production_orders_org_id_uniq unique (organization_id, id),
  constraint production_orders_status_check
    check (status in ('draft', 'in_progress', 'closed', 'cancelled')),
  constraint production_orders_site_fk
    foreign key (organization_id, site_id)
    references public.sites (organization_id, id)
);

create index production_orders_org_idx on public.production_orders (organization_id, order_date desc);

-- ---------------------------------------------------------------------------
-- 2.3 batch_consumption — lotes de entrada consumidos por orden
-- ---------------------------------------------------------------------------
create table public.batch_consumption (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  production_order_id uuid not null,
  input_batch_id      uuid not null,
  mass_kg             numeric(14,4) not null,
  notes               text,
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint batch_consumption_order_batch_uniq unique (production_order_id, input_batch_id),
  constraint batch_consumption_org_id_uniq unique (organization_id, id),
  constraint batch_consumption_mass_positive check (mass_kg > 0),
  constraint batch_consumption_order_fk
    foreign key (organization_id, production_order_id)
    references public.production_orders (organization_id, id)
    on delete cascade,
  constraint batch_consumption_input_fk
    foreign key (organization_id, input_batch_id)
    references public.input_batches (organization_id, id)
    on delete restrict
);
-- NOTA: consumir más que la cantidad recibida del lote NO se bloquea aquí;
-- se muestra como advertencia en UI (Sprint 3).

create index batch_consumption_order_idx on public.batch_consumption (production_order_id);
create index batch_consumption_input_idx on public.batch_consumption (input_batch_id);

-- ---------------------------------------------------------------------------
-- 2.4 output_batches — lotes de producto terminado / salida trazable
-- ---------------------------------------------------------------------------
create table public.output_batches (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,
  production_order_id   uuid not null,
  product_id            uuid,
  batch_code            text not null,
  produced_date         date,
  produced_quantity_kg  numeric(14,4),
  characteristics       text,
  intended_application  text,
  storage_location      text,
  notes                 text,
  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint output_batches_org_code_uniq unique (organization_id, batch_code),
  constraint output_batches_org_id_uniq unique (organization_id, id),
  constraint output_batches_quantity_positive
    check (produced_quantity_kg is null or produced_quantity_kg > 0),
  constraint output_batches_order_fk
    foreign key (organization_id, production_order_id)
    references public.production_orders (organization_id, id)
    on delete restrict,
  constraint output_batches_product_fk
    foreign key (organization_id, product_id)
    references public.products (organization_id, id)
);
-- product_id es nullable: puede haber lotes de salida aún sin referencia comercial.

create index output_batches_org_idx   on public.output_batches (organization_id, produced_date desc);
create index output_batches_order_idx on public.output_batches (production_order_id);

-- ---------------------------------------------------------------------------
-- 2.5 batch_composition — composición del lote de salida
-- Base del cálculo del Sprint 4; en Sprint 3 NO se calcula contenido reciclado.
-- is_same_process y counts_override quedan preparados, sin uso en cálculo aún.
-- ---------------------------------------------------------------------------
create table public.batch_composition (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  output_batch_id  uuid not null,
  material_id      uuid not null,
  mass_kg          numeric(14,4) not null,
  is_same_process  boolean not null default false,
  counts_override  boolean,
  notes            text,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint batch_composition_batch_material_uniq unique (output_batch_id, material_id),
  constraint batch_composition_org_id_uniq unique (organization_id, id),
  constraint batch_composition_mass_positive check (mass_kg > 0),
  constraint batch_composition_output_fk
    foreign key (organization_id, output_batch_id)
    references public.output_batches (organization_id, id)
    on delete cascade,
  constraint batch_composition_material_fk
    foreign key (organization_id, material_id)
    references public.materials (organization_id, id)
    on delete restrict
);

create index batch_composition_output_idx   on public.batch_composition (output_batch_id);
create index batch_composition_material_idx on public.batch_composition (material_id);

-- ---------------------------------------------------------------------------
-- 4. Triggers obligatorios (funciones existentes, sin duplicar)
-- ---------------------------------------------------------------------------
create trigger t_input_batches_updated before update on public.input_batches
  for each row execute function public.set_updated_at();
create trigger t_production_orders_updated before update on public.production_orders
  for each row execute function public.set_updated_at();
create trigger t_batch_consumption_updated before update on public.batch_consumption
  for each row execute function public.set_updated_at();
create trigger t_output_batches_updated before update on public.output_batches
  for each row execute function public.set_updated_at();
create trigger t_batch_composition_updated before update on public.batch_composition
  for each row execute function public.set_updated_at();

create trigger t_input_batches_org_immutable before update on public.input_batches
  for each row execute function public.prevent_organization_id_change();
create trigger t_production_orders_org_immutable before update on public.production_orders
  for each row execute function public.prevent_organization_id_change();
create trigger t_batch_consumption_org_immutable before update on public.batch_consumption
  for each row execute function public.prevent_organization_id_change();
create trigger t_output_batches_org_immutable before update on public.output_batches
  for each row execute function public.prevent_organization_id_change();
create trigger t_batch_composition_org_immutable before update on public.batch_composition
  for each row execute function public.prevent_organization_id_change();

create trigger t_input_batches_force_created_by before insert on public.input_batches
  for each row execute function public.force_created_by();
create trigger t_production_orders_force_created_by before insert on public.production_orders
  for each row execute function public.force_created_by();
create trigger t_batch_consumption_force_created_by before insert on public.batch_consumption
  for each row execute function public.force_created_by();
create trigger t_output_batches_force_created_by before insert on public.output_batches
  for each row execute function public.force_created_by();
create trigger t_batch_composition_force_created_by before insert on public.batch_composition
  for each row execute function public.force_created_by();

create trigger t_audit_input_batches after insert or update or delete on public.input_batches
  for each row execute function public.audit_row_change();
create trigger t_audit_production_orders after insert or update or delete on public.production_orders
  for each row execute function public.audit_row_change();
create trigger t_audit_batch_consumption after insert or update or delete on public.batch_consumption
  for each row execute function public.audit_row_change();
create trigger t_audit_output_batches after insert or update or delete on public.output_batches
  for each row execute function public.audit_row_change();
create trigger t_audit_batch_composition after insert or update or delete on public.batch_composition
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- 3. RLS
-- select: miembros · insert/update: admin, quality, consultant ·
-- delete: solo admin/quality (y las FK on delete restrict protegen referencias).
-- ---------------------------------------------------------------------------
alter table public.input_batches     enable row level security;
alter table public.production_orders enable row level security;
alter table public.batch_consumption enable row level security;
alter table public.output_batches    enable row level security;
alter table public.batch_composition enable row level security;

-- input_batches
create policy input_batches_select on public.input_batches
  for select to authenticated using (public.is_org_member(organization_id));
create policy input_batches_insert on public.input_batches
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
  );
create policy input_batches_update on public.input_batches
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy input_batches_delete on public.input_batches
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

-- production_orders
create policy production_orders_select on public.production_orders
  for select to authenticated using (public.is_org_member(organization_id));
create policy production_orders_insert on public.production_orders
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
  );
create policy production_orders_update on public.production_orders
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy production_orders_delete on public.production_orders
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

-- batch_consumption
create policy batch_consumption_select on public.batch_consumption
  for select to authenticated using (public.is_org_member(organization_id));
create policy batch_consumption_insert on public.batch_consumption
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
  );
create policy batch_consumption_update on public.batch_consumption
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy batch_consumption_delete on public.batch_consumption
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

-- output_batches
create policy output_batches_select on public.output_batches
  for select to authenticated using (public.is_org_member(organization_id));
create policy output_batches_insert on public.output_batches
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
  );
create policy output_batches_update on public.output_batches
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy output_batches_delete on public.output_batches
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

-- batch_composition
create policy batch_composition_select on public.batch_composition
  for select to authenticated using (public.is_org_member(organization_id));
create policy batch_composition_insert on public.batch_composition
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
  );
create policy batch_composition_update on public.batch_composition
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy batch_composition_delete on public.batch_composition
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

-- ---------------------------------------------------------------------------
-- 5. evidence_links: el trigger polimórfico ahora también valida
--    input_batch, production_order y output_batch (mismo tenant).
--    document y requirement siguen sin habilitarse.
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
    when 'site'             then select organization_id into v_target_org from sites             where id = new.target_id;
    when 'supplier'         then select organization_id into v_target_org from suppliers         where id = new.target_id;
    when 'material'         then select organization_id into v_target_org from materials         where id = new.target_id;
    when 'product'          then select organization_id into v_target_org from products          where id = new.target_id;
    when 'product_family'   then select organization_id into v_target_org from product_families  where id = new.target_id;
    when 'input_batch'      then select organization_id into v_target_org from input_batches     where id = new.target_id;
    when 'production_order' then select organization_id into v_target_org from production_orders where id = new.target_id;
    when 'output_batch'     then select organization_id into v_target_org from output_batches    where id = new.target_id;
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
