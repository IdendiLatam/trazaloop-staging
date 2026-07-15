-- 0040_platform_staff.sql
-- Trazaloop · Sprint 8.4 · Superadministrador de plataforma.
--
-- Decisión de arquitectura (Parte 1): el personal interno de Trazaloop NO
-- es un rol dentro de `memberships` (memberships representa el rol de una
-- persona DENTRO DE UNA EMPRESA concreta; mezclar ahí un "superadmin" de
-- plataforma rompería esa semántica y filtraría el concepto de plataforma
-- a cada política de empresa). Se crea una capa separada, sin relación con
-- ninguna organización.

-- ---------------------------------------------------------------------------
-- 1. platform_staff
-- ---------------------------------------------------------------------------
create table public.platform_staff (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role_code  text not null,
  status     text not null default 'active',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint platform_staff_user_id_uniq unique (user_id),
  constraint platform_staff_role_code_check check (role_code in ('superadmin', 'support')),
  constraint platform_staff_status_check check (status in ('active', 'suspended', 'revoked'))
);

create index platform_staff_status_idx on public.platform_staff (status);

-- ---------------------------------------------------------------------------
-- 2. Triggers.
--    set_updated_at y audit_row_change ya existen (0003/0005) y son
--    genéricos: audit_row_change resuelve organization_id a NULL para esta
--    tabla (no tiene esa columna y no se llama 'organizations') — correcto,
--    es un evento de PLATAFORMA, no de una empresa. prevent_user_id_change
--    es nuevo: no existía un trigger genérico para "esta columna de
--    identidad no se puede reasignar" fuera de organization_id, así que se
--    crea uno mínimo, mismo patrón que prevent_organization_id_change
--    (0024).
-- ---------------------------------------------------------------------------
create or replace function public.prevent_platform_staff_user_id_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'El user_id de un registro de platform_staff no puede modificarse';
  end if;
  return new;
end;
$$;

create trigger t_platform_staff_updated
  before update on public.platform_staff
  for each row execute function public.set_updated_at();

create trigger t_platform_staff_user_id_immutable
  before update on public.platform_staff
  for each row execute function public.prevent_platform_staff_user_id_change();

create trigger t_audit_platform_staff
  after insert or update or delete on public.platform_staff
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- 3. Helpers (mismo patrón que is_org_member / is_org_admin, 0004): SQL,
--    STABLE, SECURITY DEFINER, siempre resueltos contra auth.uid() — nunca
--    reciben un user_id como parámetro desde el cliente.
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_staff
    where user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_platform_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_staff
    where user_id = auth.uid() and status = 'active' and role_code = 'superadmin'
  );
$$;

revoke execute on function public.prevent_platform_staff_user_id_change() from public, anon, authenticated;
grant execute on function public.is_platform_staff() to authenticated;
grant execute on function public.is_platform_superadmin() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS.
--    select: el propio registro, o cualquier registro si eres superadmin.
--    insert/update: solo superadmin.
--    Sin DELETE (deny-by-default): se prefiere status = 'revoked'.
--
--    Bootstrap del PRIMER superadmin (Parte 3): a propósito, NINGÚN
--    usuario autenticado puede insertarse a sí mismo aquí — is_platform_superadmin()
--    siempre es false mientras la tabla esté vacía, así que la política de
--    INSERT nunca se cumple para el primer registro. Eso es intencional:
--    el primer superadmin se crea SOLO por SQL directo (conexión con
--    privilegios de servidor, nunca a través de la app/RLS), documentado
--    en docs/PLATFORM_ADMIN_GUIDE.md. Ejemplo (no se ejecuta aquí, no lleva
--    datos reales):
--
--      insert into platform_staff (user_id, role_code, status)
--      values ('PROFILE_ID_DEL_USUARIO_INTERNO', 'superadmin', 'active');
-- ---------------------------------------------------------------------------
alter table public.platform_staff enable row level security;

create policy platform_staff_select on public.platform_staff
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_superadmin());

create policy platform_staff_insert on public.platform_staff
  for insert to authenticated
  with check (public.is_platform_superadmin());

create policy platform_staff_update on public.platform_staff
  for update to authenticated
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

-- ---------------------------------------------------------------------------
-- 5. add_platform_staff — agregar personal de plataforma POR CORREO.
--    SECURITY DEFINER a propósito: el superadmin que agrega a alguien
--    nuevo normalmente NO comparte ninguna empresa con esa persona (es
--    personal interno de Trazaloop, no de un cliente), así que la RLS
--    normal de `profiles` (id = auth.uid() OR shares_org_with(id)) le
--    impediría resolver su email a un id. Esta función SÍ puede, porque
--    ya validó is_platform_superadmin() primero — no es un bypass general,
--    es la única vía, y deja registro en audit_log (organization_id NULL:
--    es un evento de plataforma, no de una empresa).
-- ---------------------------------------------------------------------------
create or replace function public.add_platform_staff(p_email text, p_role_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid;
  v_target uuid;
  v_id     uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'No autenticado';
  end if;

  if not is_platform_superadmin() then
    raise exception 'Solo un superadministrador de plataforma puede agregar personal de plataforma';
  end if;

  if p_role_code not in ('superadmin', 'support') then
    raise exception 'Rol de plataforma no válido';
  end if;

  select id into v_target from profiles where lower(email) = lower(trim(coalesce(p_email, '')));
  if v_target is null then
    raise exception 'No existe ningún usuario registrado con ese correo. Debe crear su cuenta en Trazaloop primero.';
  end if;

  insert into platform_staff (user_id, role_code, status, created_by)
  values (v_target, p_role_code, 'active', v_actor)
  on conflict (user_id) do update set role_code = excluded.role_code, status = 'active'
  returning id into v_id;

  perform log_event(
    null,
    'platform_staff_added',
    jsonb_build_object('email', lower(trim(p_email)), 'role_code', p_role_code),
    v_actor
  );

  return v_id;
end;
$$;

revoke execute on function public.add_platform_staff(text, text) from public, anon;
grant execute on function public.add_platform_staff(text, text) to authenticated;
