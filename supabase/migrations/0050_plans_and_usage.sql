-- 0050_plans_and_usage.sql
-- Trazaloop · Sprint 10A · Planes, cuotas y control de acceso por plan.
--
-- Capa de planes SEPARADA de memberships (Parte 2 del sprint): un plan
-- pertenece a la ORGANIZACIÓN, nunca a un usuario ni a un rol de empresa.
-- No se mezcla con platform_staff (Sprint 8.4) ni con los roles de
-- memberships (admin/quality/consultant): son conceptos ortogonales.
--
-- 4 tablas: plan_definitions, plan_limits (catálogo global, administrado
-- solo por superadmin) y organization_subscriptions,
-- subscription_plan_history (por empresa).

-- ---------------------------------------------------------------------------
-- 1. plan_definitions
-- ---------------------------------------------------------------------------
create table public.plan_definitions (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  name                 text not null,
  description          text,
  status               text not null default 'active',
  storage_limit_bytes  bigint not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint plan_definitions_code_check check (code in ('demo', 'full', 'extra')),
  constraint plan_definitions_status_check check (status in ('active', 'inactive')),
  constraint plan_definitions_storage_positive check (storage_limit_bytes > 0)
);

create trigger t_plan_definitions_updated
  before update on public.plan_definitions
  for each row execute function public.set_updated_at();

create trigger t_audit_plan_definitions
  after insert or update or delete on public.plan_definitions
  for each row execute function public.audit_row_change();

alter table public.plan_definitions enable row level security;

-- Mismo patrón exacto que trazadoc_blueprints (Sprint 9): cualquier
-- miembro activo de alguna empresa ve los planes ACTIVOS; platform_staff
-- ve todos.
create policy plan_definitions_select on public.plan_definitions
  for select to authenticated
  using (
    public.is_platform_staff()
    or (
      status = 'active'
      and exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.status = 'active')
    )
  );

create policy plan_definitions_insert on public.plan_definitions
  for insert to authenticated
  with check (public.is_platform_superadmin());

create policy plan_definitions_update on public.plan_definitions
  for update to authenticated
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

-- Sin DELETE (deny-by-default): "no permitir" (Parte 3).

insert into public.plan_definitions (code, name, description, storage_limit_bytes) values
  ('demo', 'Demo', 'Plan de prueba con límites reducidos, asignado automáticamente a toda empresa nueva creada por un usuario normal.', 52428800),
  ('full', 'Full', 'Plan sin límites de recursos funcionales, con cuota de almacenamiento estándar.', 524288000),
  ('extra', 'Extra', 'Igual que Full, con mayor cuota de almacenamiento.', 5368709120);

-- ---------------------------------------------------------------------------
-- 2. plan_limits
-- ---------------------------------------------------------------------------
create table public.plan_limits (
  id            uuid primary key default gen_random_uuid(),
  plan_code     text not null references public.plan_definitions (code),
  resource_code text not null,
  limit_value   bigint,
  is_unlimited  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint plan_limits_uniq unique (plan_code, resource_code),
  constraint plan_limits_resource_check check (resource_code in (
    'documents_trazadocs', 'suppliers', 'materials', 'products', 'evidences',
    'production_orders', 'input_batches', 'output_batches', 'team_members',
    'roles_enabled', 'diagnostic_recommendations_enabled', 'imports_enabled', 'storage_bytes'
  )),
  -- O trae un límite numérico, o está marcado ilimitado — nunca ambos ni ninguno.
  constraint plan_limits_value_or_unlimited check (
    (is_unlimited and limit_value is null) or (not is_unlimited and limit_value is not null)
  )
);

create trigger t_plan_limits_updated
  before update on public.plan_limits
  for each row execute function public.set_updated_at();

alter table public.plan_limits enable row level security;

create policy plan_limits_select on public.plan_limits
  for select to authenticated
  using (
    public.is_platform_staff()
    or exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.status = 'active')
  );

create policy plan_limits_insert on public.plan_limits
  for insert to authenticated
  with check (public.is_platform_superadmin());

create policy plan_limits_update on public.plan_limits
  for update to authenticated
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

-- Demo: límites reducidos: 0 = deshabilitado por completo (roles,
-- recomendaciones de diagnóstico, importaciones).
insert into public.plan_limits (plan_code, resource_code, limit_value, is_unlimited) values
  ('demo', 'documents_trazadocs', 2, false),
  ('demo', 'suppliers', 1, false),
  ('demo', 'materials', 5, false),
  ('demo', 'products', 1, false),
  ('demo', 'evidences', 1, false),
  ('demo', 'production_orders', 1, false),
  ('demo', 'input_batches', 1, false),
  ('demo', 'output_batches', 1, false),
  ('demo', 'team_members', 1, false),
  ('demo', 'roles_enabled', 0, false),
  ('demo', 'diagnostic_recommendations_enabled', 0, false),
  ('demo', 'imports_enabled', 0, false),
  ('demo', 'storage_bytes', 52428800, false);

insert into public.plan_limits (plan_code, resource_code, limit_value, is_unlimited) values
  ('full', 'documents_trazadocs', null, true),
  ('full', 'suppliers', null, true),
  ('full', 'materials', null, true),
  ('full', 'products', null, true),
  ('full', 'evidences', null, true),
  ('full', 'production_orders', null, true),
  ('full', 'input_batches', null, true),
  ('full', 'output_batches', null, true),
  ('full', 'team_members', null, true),
  ('full', 'roles_enabled', 1, false),
  ('full', 'diagnostic_recommendations_enabled', 1, false),
  ('full', 'imports_enabled', 1, false),
  ('full', 'storage_bytes', 524288000, false);

insert into public.plan_limits (plan_code, resource_code, limit_value, is_unlimited) values
  ('extra', 'documents_trazadocs', null, true),
  ('extra', 'suppliers', null, true),
  ('extra', 'materials', null, true),
  ('extra', 'products', null, true),
  ('extra', 'evidences', null, true),
  ('extra', 'production_orders', null, true),
  ('extra', 'input_batches', null, true),
  ('extra', 'output_batches', null, true),
  ('extra', 'team_members', null, true),
  ('extra', 'roles_enabled', 1, false),
  ('extra', 'diagnostic_recommendations_enabled', 1, false),
  ('extra', 'imports_enabled', 1, false),
  ('extra', 'storage_bytes', 5368709120, false);

-- ---------------------------------------------------------------------------
-- 3. organization_subscriptions
-- ---------------------------------------------------------------------------
create table public.organization_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  plan_code        text not null references public.plan_definitions (code),
  status           text not null default 'active',
  assigned_by      uuid references public.profiles (id),
  assigned_at      timestamptz not null default now(),
  valid_until      timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint organization_subscriptions_org_uniq unique (organization_id),
  constraint organization_subscriptions_status_check check (status in ('active', 'suspended', 'cancelled'))
);

create trigger t_organization_subscriptions_updated
  before update on public.organization_subscriptions
  for each row execute function public.set_updated_at();

create trigger t_audit_organization_subscriptions
  after insert or update or delete on public.organization_subscriptions
  for each row execute function public.audit_row_change();

alter table public.organization_subscriptions enable row level security;

create policy organization_subscriptions_select on public.organization_subscriptions
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_staff());

-- Un cliente autenticado normal NUNCA inserta/actualiza esto directamente
-- (ni siquiera un admin de empresa) — solo superadmin, o las funciones
-- SECURITY DEFINER (create_organization, create_platform_organization,
-- change_organization_plan) que corren con privilegios elevados y por lo
-- tanto no dependen de esta política.
create policy organization_subscriptions_insert on public.organization_subscriptions
  for insert to authenticated
  with check (public.is_platform_superadmin());

create policy organization_subscriptions_update on public.organization_subscriptions
  for update to authenticated
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

-- Sin DELETE (deny-by-default): "no permitir" (Parte 3) — para "eliminar"
-- un plan se usa status='cancelled', nunca se borra la fila.

-- ---------------------------------------------------------------------------
-- 4. subscription_plan_history (append-only)
-- ---------------------------------------------------------------------------
create table public.subscription_plan_history (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  from_plan_code   text references public.plan_definitions (code),
  to_plan_code     text not null references public.plan_definitions (code),
  changed_by       uuid references public.profiles (id),
  change_reason    text,
  created_at       timestamptz not null default now()
);

create index subscription_plan_history_org_idx
  on public.subscription_plan_history (organization_id, created_at desc);

alter table public.subscription_plan_history enable row level security;

create policy subscription_plan_history_select on public.subscription_plan_history
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_staff());

create policy subscription_plan_history_insert on public.subscription_plan_history
  for insert to authenticated
  with check (public.is_platform_superadmin());

-- Sin UPDATE/DELETE (deny-by-default): append-only real, igual que
-- trazadoc_status_history (Sprint 9).
