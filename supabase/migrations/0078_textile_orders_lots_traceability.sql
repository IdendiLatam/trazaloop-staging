-- 0078_textile_orders_lots_traceability.sql
-- Trazaloop · Sprint T6 (Textil) · Órdenes/corridas de confección, lotes de
-- entrada, consumos, procesos por orden, lotes producidos/finales,
-- vistas de balance/trazabilidad y extensión de vínculos de evidencias.
--
-- ALCANCE ESTRICTO (T6): trazabilidad TÉCNICA operativa. NADA de
-- circularidad, TrazaDocs Textil, pasaporte, QR, IA, ACV, costos, compras,
-- facturación, MRP, bodegas ni planes por módulo (T7–T9 / Plataforma-M1).
-- CERO cambios a objetos CPR: sus tablas de trazabilidad siguen
-- intactas; solo se reutilizan helpers
-- transversales y PATRONES (0025 tablas/roles, 0026 vistas security_invoker,
-- 0020/0075 trigger polimórfico de vínculos).
--
-- LENGUAJE (N-05): la trazabilidad registrada es TÉCNICA e interna — nunca
-- se describe con "certificado", "cumple" ni como pasaporte.
--
-- RLS (patrón CPR 0025 + endurecimiento T5.1): select miembros; insert y
-- update admin/quality/consultant; delete de maestros (órdenes, lotes de
-- entrada, lotes finales) admin/quality; delete de filas de asociación
-- (consumos, procesos) admin/quality/consultant (precedente T4).
--
-- SOBRECONSUMO (decisión D-T6-01): se BLOQUEA por trigger cuando es
-- comparable — el lote tiene quantity_received y la unidad del consumo
-- coincide (case-insensitive) con la del lote; solo suman los consumos de
-- la MISMA unidad. Si las unidades difieren o el lote no declaró cantidad,
-- no hay conversión automática (fuera de alcance): se permite y el estado
-- de trazabilidad lo marca como brecha (needs_review) en el dominio.

-- ---------------------------------------------------------------------------
-- textile_production_orders (orden / corrida de confección)
-- ---------------------------------------------------------------------------
create table public.textile_production_orders (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  order_code         text not null,
  reference_id       uuid not null,
  planned_quantity   numeric(14, 2),
  produced_quantity  numeric(14, 2),
  unit               text not null default 'units',
  planned_start_date date,
  planned_end_date   date,
  actual_start_date  date,
  actual_end_date    date,
  status             text not null default 'draft',
  responsible_area   text,
  notes              text,
  is_active          boolean not null default true,
  created_by         uuid references public.profiles (id),
  updated_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint textile_production_orders_org_code_uniq unique (organization_id, order_code),
  constraint textile_production_orders_org_id_uniq unique (organization_id, id),
  constraint textile_production_orders_status_check
    check (status in ('draft', 'in_progress', 'completed', 'cancelled', 'archived')),
  constraint textile_production_orders_planned_qty_check
    check (planned_quantity is null or planned_quantity > 0),
  constraint textile_production_orders_produced_qty_check
    check (produced_quantity is null or produced_quantity >= 0),
  constraint textile_production_orders_reference_fk
    foreign key (organization_id, reference_id)
    references public.textile_references (organization_id, id)
);

create index textile_production_orders_reference_idx
  on public.textile_production_orders (organization_id, reference_id);

-- ---------------------------------------------------------------------------
-- textile_input_lots (lote de entrada: material O componente, XOR)
-- ---------------------------------------------------------------------------
create table public.textile_input_lots (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  lot_code           text not null,
  lot_type           text not null,
  material_id        uuid,
  component_id       uuid,
  supplier_id        uuid,
  received_date      date,
  quantity_received  numeric(14, 2),
  unit               text,
  document_reference text,
  status             text not null default 'available',
  notes              text,
  is_active          boolean not null default true,
  created_by         uuid references public.profiles (id),
  updated_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint textile_input_lots_org_code_uniq unique (organization_id, lot_code),
  constraint textile_input_lots_org_id_uniq unique (organization_id, id),
  constraint textile_input_lots_type_check check (lot_type in ('material', 'component')),
  constraint textile_input_lots_status_check
    check (status in ('available', 'partially_consumed', 'consumed', 'blocked', 'archived')),
  constraint textile_input_lots_qty_check
    check (quantity_received is null or quantity_received > 0),
  -- XOR: un lote es de material O de componente, nunca ambos ni ninguno.
  constraint textile_input_lots_target_check
    check (
      (lot_type = 'material'  and material_id is not null and component_id is null)
      or (lot_type = 'component' and component_id is not null and material_id is null)
    ),
  constraint textile_input_lots_material_fk
    foreign key (organization_id, material_id)
    references public.textile_materials (organization_id, id),
  constraint textile_input_lots_component_fk
    foreign key (organization_id, component_id)
    references public.textile_components (organization_id, id),
  constraint textile_input_lots_supplier_fk
    foreign key (organization_id, supplier_id)
    references public.textile_suppliers (organization_id, id)
);

create index textile_input_lots_material_idx on public.textile_input_lots (organization_id, material_id);
create index textile_input_lots_component_idx on public.textile_input_lots (organization_id, component_id);

-- ---------------------------------------------------------------------------
-- textile_order_consumptions (consumo de un lote de entrada en una orden)
-- ---------------------------------------------------------------------------
create table public.textile_order_consumptions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  order_id          uuid not null,
  input_lot_id      uuid not null,
  quantity_consumed numeric(14, 2) not null,
  unit              text not null,
  consumption_role  text not null default 'other',
  consumed_at       date,
  notes             text,
  created_by        uuid references public.profiles (id),
  updated_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint textile_order_consumptions_org_id_uniq unique (organization_id, id),
  constraint textile_order_consumptions_qty_check check (quantity_consumed > 0),
  constraint textile_order_consumptions_role_check
    check (consumption_role in (
      'main_fabric', 'secondary_fabric', 'lining', 'thread', 'interlining',
      'label', 'trim', 'packaging', 'other'
    )),
  constraint textile_order_consumptions_order_fk
    foreign key (organization_id, order_id)
    references public.textile_production_orders (organization_id, id)
    on delete cascade,
  constraint textile_order_consumptions_lot_fk
    foreign key (organization_id, input_lot_id)
    references public.textile_input_lots (organization_id, id)
);

create index textile_order_consumptions_order_idx on public.textile_order_consumptions (order_id);
create index textile_order_consumptions_lot_idx on public.textile_order_consumptions (input_lot_id);

-- ---------------------------------------------------------------------------
-- textile_order_process_steps (procesos internos o tercerizados de la orden)
-- ---------------------------------------------------------------------------
create table public.textile_order_process_steps (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,
  order_id              uuid not null,
  step_order            integer,
  step_type             text not null,
  process_id            uuid,
  outsourced_process_id uuid,
  name                  text not null,
  responsible_name      text,
  supplier_id           uuid,
  planned_date          date,
  completed_date        date,
  status                text not null default 'pending',
  notes                 text,
  created_by            uuid references public.profiles (id),
  updated_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint textile_order_process_steps_org_id_uniq unique (organization_id, id),
  constraint textile_order_process_steps_type_check check (step_type in ('internal', 'outsourced')),
  constraint textile_order_process_steps_status_check
    check (status in ('pending', 'in_progress', 'completed', 'skipped', 'blocked')),
  -- XOR: interno exige proceso del catálogo; tercerizado exige proceso
  -- tercerizado del catálogo.
  constraint textile_order_process_steps_target_check
    check (
      (step_type = 'internal'   and process_id is not null and outsourced_process_id is null)
      or (step_type = 'outsourced' and outsourced_process_id is not null and process_id is null)
    ),
  constraint textile_order_process_steps_order_fk
    foreign key (organization_id, order_id)
    references public.textile_production_orders (organization_id, id)
    on delete cascade,
  constraint textile_order_process_steps_process_fk
    foreign key (organization_id, process_id)
    references public.textile_processes (organization_id, id),
  constraint textile_order_process_steps_outsourced_fk
    foreign key (organization_id, outsourced_process_id)
    references public.textile_outsourced_processes (organization_id, id),
  constraint textile_order_process_steps_supplier_fk
    foreign key (organization_id, supplier_id)
    references public.textile_suppliers (organization_id, id)
);

create index textile_order_process_steps_order_idx on public.textile_order_process_steps (order_id);

-- ---------------------------------------------------------------------------
-- textile_output_lots (lote producido / lote final)
-- ---------------------------------------------------------------------------
create table public.textile_output_lots (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  output_lot_code      text not null,
  order_id             uuid not null,
  quantity_produced    numeric(14, 2) not null,
  unit                 text not null default 'units',
  produced_date        date,
  status               text not null default 'produced',
  -- Estado de COMPLETITUD de trazabilidad (informativo; recalculado por el
  -- servidor y en vivo en el detalle). Nunca describe cumplimiento.
  traceability_status  text not null default 'incomplete',
  notes                text,
  is_active            boolean not null default true,
  created_by           uuid references public.profiles (id),
  updated_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint textile_output_lots_org_code_uniq unique (organization_id, output_lot_code),
  constraint textile_output_lots_org_id_uniq unique (organization_id, id),
  constraint textile_output_lots_status_check
    check (status in ('draft', 'produced', 'under_review', 'released', 'blocked', 'archived')),
  constraint textile_output_lots_traceability_check
    check (traceability_status in ('not_started', 'incomplete', 'complete', 'needs_review')),
  constraint textile_output_lots_qty_check check (quantity_produced > 0),
  constraint textile_output_lots_order_fk
    foreign key (organization_id, order_id)
    references public.textile_production_orders (organization_id, id)
);

create index textile_output_lots_order_idx on public.textile_output_lots (order_id);

-- ---------------------------------------------------------------------------
-- Sobreconsumo (D-T6-01): bloqueo cuando es comparable. SECURITY DEFINER
-- para sumar los consumos hermanos sin depender de RLS; execute revocado.
-- ---------------------------------------------------------------------------
create or replace function public.guard_textile_lot_overconsumption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot record;
  v_consumed numeric;
begin
  select quantity_received, unit, organization_id
    into v_lot
    from textile_input_lots
   where id = new.input_lot_id;

  if v_lot is null then
    raise exception 'El lote de entrada del consumo no existe';
  end if;
  if v_lot.organization_id <> new.organization_id then
    raise exception 'Consumo de lote entre empresas bloqueado';
  end if;

  -- Solo comparable si el lote declaró cantidad y las unidades coinciden.
  if v_lot.quantity_received is not null
     and v_lot.unit is not null
     and lower(trim(new.unit)) = lower(trim(v_lot.unit)) then
    select coalesce(sum(quantity_consumed), 0)
      into v_consumed
      from textile_order_consumptions
     where input_lot_id = new.input_lot_id
       and lower(trim(unit)) = lower(trim(v_lot.unit))
       and (tg_op = 'INSERT' or id <> new.id);

    if v_consumed + new.quantity_consumed > v_lot.quantity_received then
      raise exception 'Sobreconsumo bloqueado: el lote no tiene saldo suficiente (recibido %, ya consumido %)',
        v_lot.quantity_received, v_consumed;
    end if;
  end if;

  return new;
end;
$$;
revoke execute on function public.guard_textile_lot_overconsumption() from public, anon, authenticated;

create trigger t_textile_order_consumptions_overconsumption
  before insert or update on public.textile_order_consumptions
  for each row execute function public.guard_textile_lot_overconsumption();

-- ---------------------------------------------------------------------------
-- Vistas (patrón 0026: security_invoker — la RLS de las tablas base aplica
-- con la identidad de quien consulta).
-- ---------------------------------------------------------------------------

-- Balance de lote de entrada. Sin conversión de unidades: solo suman los
-- consumos con la MISMA unidad del lote; los de otra unidad se cuentan
-- aparte para transparencia.
create or replace view public.v_textile_input_lot_balance
with (security_invoker = true) as
select
  il.organization_id,
  il.id                                            as input_lot_id,
  il.lot_code,
  il.lot_type,
  il.quantity_received,
  coalesce(same_unit.qty, 0)                       as quantity_consumed,
  case
    when il.quantity_received is null then null
    else il.quantity_received - coalesce(same_unit.qty, 0)
  end                                              as quantity_remaining,
  il.unit,
  il.status,
  coalesce(other_unit.rows, 0)                     as other_unit_consumptions_count
from public.textile_input_lots il
left join (
  select c.input_lot_id, sum(c.quantity_consumed) as qty
  from public.textile_order_consumptions c
  join public.textile_input_lots l on l.id = c.input_lot_id
  where l.unit is not null and lower(trim(c.unit)) = lower(trim(l.unit))
  group by c.input_lot_id
) same_unit on same_unit.input_lot_id = il.id
left join (
  select c.input_lot_id, count(*) as rows
  from public.textile_order_consumptions c
  join public.textile_input_lots l on l.id = c.input_lot_id
  where l.unit is null or lower(trim(c.unit)) <> lower(trim(l.unit))
  group by c.input_lot_id
) other_unit on other_unit.input_lot_id = il.id;

-- Resumen de trazabilidad por lote producido/final. Conteo de evidencias:
-- vínculos directos al lote final + a su orden (los de consumos, pasos y
-- lotes de entrada se ven en el detalle).
create or replace view public.v_textile_output_lot_traceability_summary
with (security_invoker = true) as
select
  ol.organization_id,
  ol.id                                   as output_lot_id,
  ol.output_lot_code,
  ol.order_id,
  po.order_code,
  po.reference_id,
  r.sku,
  r.product_id,
  p.name                                  as product_name,
  ol.quantity_produced,
  ol.unit,
  coalesce(cons.input_lots_count, 0)      as input_lots_count,
  coalesce(cons.material_lots_count, 0)   as consumed_material_lots_count,
  coalesce(cons.component_lots_count, 0)  as consumed_component_lots_count,
  coalesce(steps.completed_count, 0)      as completed_process_steps_count,
  coalesce(ev.links_count, 0)             as evidence_links_count,
  ol.traceability_status,
  ol.status,
  ol.created_at
from public.textile_output_lots ol
join public.textile_production_orders po on po.id = ol.order_id
join public.textile_references r on r.id = po.reference_id
join public.textile_products p on p.id = r.product_id
left join (
  select
    c.order_id,
    count(distinct c.input_lot_id)                                            as input_lots_count,
    count(distinct c.input_lot_id) filter (where il.lot_type = 'material')    as material_lots_count,
    count(distinct c.input_lot_id) filter (where il.lot_type = 'component')   as component_lots_count
  from public.textile_order_consumptions c
  join public.textile_input_lots il on il.id = c.input_lot_id
  group by c.order_id
) cons on cons.order_id = ol.order_id
left join (
  select order_id, count(*) filter (where status = 'completed') as completed_count
  from public.textile_order_process_steps
  group by order_id
) steps on steps.order_id = ol.order_id
left join (
  select l.organization_id, l.entity_id, l.entity_type, count(*) as links_count
  from public.textile_evidence_links l
  where l.entity_type in ('output_lot', 'production_order')
  group by l.organization_id, l.entity_id, l.entity_type
) ev on ev.organization_id = ol.organization_id
   and (
     (ev.entity_type = 'output_lot' and ev.entity_id = ol.id)
     or (ev.entity_type = 'production_order' and ev.entity_id = ol.order_id)
   );

-- ---------------------------------------------------------------------------
-- Extensión de vínculos de evidencias (encargo §10): 5 entidades y 5 tipos
-- nuevos. Los CHECK se REEMPLAZAN por superconjuntos (ningún vínculo
-- anterior deja de ser válido) y el trigger polimórfico de 0075 se amplía
-- con las tablas nuevas — la validación cross-tenant sigue intacta.
-- ---------------------------------------------------------------------------
alter table public.textile_evidence_links
  drop constraint textile_evidence_links_entity_check;
alter table public.textile_evidence_links
  add constraint textile_evidence_links_entity_check
  check (entity_type in (
    'supplier', 'material', 'component', 'process', 'outsourced_process',
    'collection', 'product', 'reference', 'fiber_composition',
    'reference_material', 'reference_component',
    'production_order', 'input_lot', 'order_consumption',
    'order_process_step', 'output_lot'
  ));

alter table public.textile_evidence_links
  drop constraint textile_evidence_links_type_check;
alter table public.textile_evidence_links
  add constraint textile_evidence_links_type_check
  check (link_type in (
    'general_support', 'composition_support', 'origin_support',
    'recycled_claim_support', 'organic_claim_support', 'care_support',
    'supplier_support', 'process_support', 'outsourced_process_support',
    'traceability_support', 'review_support', 'other',
    'production_order_support', 'input_lot_support', 'consumption_support',
    'process_execution_support', 'output_lot_support'
  ));

create or replace function public.validate_textile_evidence_link_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_org uuid;
begin
  case new.entity_type
    when 'supplier'            then select organization_id into v_target_org from textile_suppliers                     where id = new.entity_id;
    when 'material'            then select organization_id into v_target_org from textile_materials                     where id = new.entity_id;
    when 'component'           then select organization_id into v_target_org from textile_components                    where id = new.entity_id;
    when 'process'             then select organization_id into v_target_org from textile_processes                     where id = new.entity_id;
    when 'outsourced_process'  then select organization_id into v_target_org from textile_outsourced_processes          where id = new.entity_id;
    when 'collection'          then select organization_id into v_target_org from textile_collections                   where id = new.entity_id;
    when 'product'             then select organization_id into v_target_org from textile_products                      where id = new.entity_id;
    when 'reference'           then select organization_id into v_target_org from textile_references                    where id = new.entity_id;
    when 'fiber_composition'   then select organization_id into v_target_org from textile_reference_fiber_composition   where id = new.entity_id;
    when 'reference_material'  then select organization_id into v_target_org from textile_reference_materials           where id = new.entity_id;
    when 'reference_component' then select organization_id into v_target_org from textile_reference_components          where id = new.entity_id;
    when 'production_order'    then select organization_id into v_target_org from textile_production_orders             where id = new.entity_id;
    when 'input_lot'           then select organization_id into v_target_org from textile_input_lots                    where id = new.entity_id;
    when 'order_consumption'   then select organization_id into v_target_org from textile_order_consumptions            where id = new.entity_id;
    when 'order_process_step'  then select organization_id into v_target_org from textile_order_process_steps           where id = new.entity_id;
    when 'output_lot'          then select organization_id into v_target_org from textile_output_lots                   where id = new.entity_id;
    else
      raise exception 'Tipo de entidad % no disponible para vínculos de evidencia textil', new.entity_type;
  end case;

  if v_target_org is null then
    raise exception 'La entidad destino % del vínculo de evidencia textil no existe', new.entity_id;
  end if;

  if v_target_org <> new.organization_id then
    raise exception 'Vínculo de evidencia textil entre empresas bloqueado';
  end if;

  return new;
end;
$$;
revoke execute on function public.validate_textile_evidence_link_org() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers comunes (patrón 0020/0024) en las cinco tablas
-- ---------------------------------------------------------------------------
create trigger t_textile_production_orders_updated before update on public.textile_production_orders
  for each row execute function public.set_updated_at();
create trigger t_textile_input_lots_updated before update on public.textile_input_lots
  for each row execute function public.set_updated_at();
create trigger t_textile_order_consumptions_updated before update on public.textile_order_consumptions
  for each row execute function public.set_updated_at();
create trigger t_textile_order_process_steps_updated before update on public.textile_order_process_steps
  for each row execute function public.set_updated_at();
create trigger t_textile_output_lots_updated before update on public.textile_output_lots
  for each row execute function public.set_updated_at();

create trigger t_textile_production_orders_force_created_by before insert on public.textile_production_orders
  for each row execute function public.force_created_by();
create trigger t_textile_input_lots_force_created_by before insert on public.textile_input_lots
  for each row execute function public.force_created_by();
create trigger t_textile_order_consumptions_force_created_by before insert on public.textile_order_consumptions
  for each row execute function public.force_created_by();
create trigger t_textile_order_process_steps_force_created_by before insert on public.textile_order_process_steps
  for each row execute function public.force_created_by();
create trigger t_textile_output_lots_force_created_by before insert on public.textile_output_lots
  for each row execute function public.force_created_by();

create trigger t_textile_production_orders_org_immutable before update on public.textile_production_orders
  for each row execute function public.prevent_organization_id_change();
create trigger t_textile_input_lots_org_immutable before update on public.textile_input_lots
  for each row execute function public.prevent_organization_id_change();
create trigger t_textile_order_consumptions_org_immutable before update on public.textile_order_consumptions
  for each row execute function public.prevent_organization_id_change();
create trigger t_textile_order_process_steps_org_immutable before update on public.textile_order_process_steps
  for each row execute function public.prevent_organization_id_change();
create trigger t_textile_output_lots_org_immutable before update on public.textile_output_lots
  for each row execute function public.prevent_organization_id_change();

create trigger t_audit_textile_production_orders after insert or update or delete on public.textile_production_orders
  for each row execute function public.audit_row_change();
create trigger t_audit_textile_input_lots after insert or update or delete on public.textile_input_lots
  for each row execute function public.audit_row_change();
create trigger t_audit_textile_order_consumptions after insert or update or delete on public.textile_order_consumptions
  for each row execute function public.audit_row_change();
create trigger t_audit_textile_order_process_steps after insert or update or delete on public.textile_order_process_steps
  for each row execute function public.audit_row_change();
create trigger t_audit_textile_output_lots after insert or update or delete on public.textile_output_lots
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.textile_production_orders   enable row level security;
alter table public.textile_input_lots          enable row level security;
alter table public.textile_order_consumptions  enable row level security;
alter table public.textile_order_process_steps enable row level security;
alter table public.textile_output_lots         enable row level security;

create policy textile_production_orders_select on public.textile_production_orders
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_production_orders_insert on public.textile_production_orders
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy textile_production_orders_update on public.textile_production_orders
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy textile_production_orders_delete on public.textile_production_orders
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

create policy textile_input_lots_select on public.textile_input_lots
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_input_lots_insert on public.textile_input_lots
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy textile_input_lots_update on public.textile_input_lots
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy textile_input_lots_delete on public.textile_input_lots
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

create policy textile_order_consumptions_select on public.textile_order_consumptions
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_order_consumptions_insert on public.textile_order_consumptions
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy textile_order_consumptions_update on public.textile_order_consumptions
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy textile_order_consumptions_delete on public.textile_order_consumptions
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']));

create policy textile_order_process_steps_select on public.textile_order_process_steps
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_order_process_steps_insert on public.textile_order_process_steps
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy textile_order_process_steps_update on public.textile_order_process_steps
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy textile_order_process_steps_delete on public.textile_order_process_steps
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']));

create policy textile_output_lots_select on public.textile_output_lots
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_output_lots_insert on public.textile_output_lots
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy textile_output_lots_update on public.textile_output_lots
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy textile_output_lots_delete on public.textile_output_lots
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));
