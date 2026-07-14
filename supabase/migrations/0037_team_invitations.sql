-- 0037_team_invitations.sql
-- Trazaloop · Sprint 8 · Gestión de equipo: invitaciones + guardas de rol.
--
-- Reutiliza TODO lo que ya existe: profiles, organizations, memberships
-- (con su columna status ya existente desde 0004, enum membership_status
-- 'active'/'suspended'/'revoked' desde 0002), roles (admin/quality/
-- consultant, únicos roles reales del sistema), is_org_member,
-- has_org_role, is_org_admin, set_updated_at, prevent_organization_id_change,
-- audit_row_change, log_event. No se duplica ninguna estructura existente:
-- "desactivar/reactivar miembro" usa el status YA EXISTENTE de memberships
-- (active ⇄ suspended), no se agrega una columna nueva.
--
-- Esta migración SOLO agrega: la tabla de invitaciones, un trigger de
-- integridad sobre memberships (último admin) y dos RPC para el flujo de
-- invitar/aceptar. No cambia el motor de cálculo ni la metodología.

-- ---------------------------------------------------------------------------
-- 1. team_invitations
-- ---------------------------------------------------------------------------
create table public.team_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  email           text not null,
  role_code       text not null references public.roles (code),
  status          text not null default 'pending',
  token           text not null unique,
  invited_by      uuid references public.profiles (id),
  accepted_by     uuid references public.profiles (id),
  accepted_at     timestamptz,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint team_invitations_org_id_uniq unique (organization_id, id),
  constraint team_invitations_email_not_blank check (length(trim(email)) > 0),
  -- Email siempre se guarda normalizado en minúsculas (server/actions/team.ts);
  -- el check refuerza que nunca llegue con mayúsculas por otra vía.
  constraint team_invitations_email_lowercase check (email = lower(email)),
  constraint team_invitations_status_check
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  -- Roles invitables: los mismos 3 roles reales del sistema (0004). No se
  -- inventan 'user' ni 'viewer': el sistema no los tiene definidos.
  constraint team_invitations_role_code_check
    check (role_code in ('admin', 'quality', 'consultant')),
  constraint team_invitations_accepted_fields_check
    check (
      (status = 'accepted') = (accepted_by is not null and accepted_at is not null)
    )
);

-- Como mucho UNA invitación pendiente por email por empresa (Parte 4 del
-- Sprint 8). Con status en la clave (tal como se pidió) además de la
-- condición parcial: ambas expresan la misma regla, se deja tal cual se
-- especificó.
create unique index team_invitations_org_email_pending_uniq
  on public.team_invitations (organization_id, email, status)
  where status = 'pending';

create index team_invitations_org_status_idx
  on public.team_invitations (organization_id, status);

-- ---------------------------------------------------------------------------
-- 2. force_invited_by — mismo patrón que force_created_by (0016/0024): la
--    autoría de la invitación nunca la decide el cliente.
-- ---------------------------------------------------------------------------
create or replace function public.force_invited_by()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.invited_by := auth.uid();
  end if;
  return new;
end;
$$;

revoke execute on function public.force_invited_by() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Triggers de team_invitations (regla obligatoria desde 0024, aplicada
--    a esta tabla nueva).
-- ---------------------------------------------------------------------------
create trigger t_team_invitations_updated
  before update on public.team_invitations
  for each row execute function public.set_updated_at();

create trigger t_team_invitations_org_immutable
  before update on public.team_invitations
  for each row execute function public.prevent_organization_id_change();

create trigger t_team_invitations_force_invited_by
  before insert on public.team_invitations
  for each row execute function public.force_invited_by();

create trigger t_audit_team_invitations
  after insert or update or delete on public.team_invitations
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- 4. RLS de team_invitations.
--    select: admin/quality/consultant de la empresa (los 3 roles reales).
--    insert: solo admin.
--    update: solo admin (revocar → status='revoked'; el "aceptar" de un
--            usuario recién invitado pasa SIEMPRE por la RPC
--            accept_team_invitation, security definer, nunca por un UPDATE
--            directo de cliente: quien acepta normalmente NO es miembro
--            todavía y no pasaría esta política).
--    Sin DELETE: se prefiere status = 'revoked' (deny-by-default protege
--    el histórico).
-- ---------------------------------------------------------------------------
alter table public.team_invitations enable row level security;

create policy team_invitations_select on public.team_invitations
  for select to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']));

create policy team_invitations_insert on public.team_invitations
  for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy team_invitations_update on public.team_invitations
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- 5. guard_last_admin — no se puede quitar el rol admin ni desactivar
--    (status <> 'active') al ÚLTIMO administrador activo de una empresa.
--    SECURITY DEFINER: cuenta admins activos sin depender de que quien
--    ejecuta la operación pueda ver todas las filas (ya puede, por ser
--    admin, pero se aísla igual para evitar cualquier duda de recursión).
-- ---------------------------------------------------------------------------
create or replace function public.guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_active_admins integer;
begin
  if old.role_code = 'admin' and old.status = 'active'
     and (new.role_code is distinct from old.role_code
          or new.status is distinct from old.status)
  then
    select count(*) into v_other_active_admins
    from memberships
    where organization_id = old.organization_id
      and role_code = 'admin'
      and status = 'active'
      and id <> old.id;

    if v_other_active_admins = 0 then
      raise exception
        'No se puede quitar el rol admin ni desactivar al último administrador activo de la empresa';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_last_admin() from public, anon, authenticated;

create trigger t_memberships_guard_last_admin
  before update on public.memberships
  for each row execute function public.guard_last_admin();

-- ---------------------------------------------------------------------------
-- 6. get_invitation_preview — vista previa segura por token, SIN exigir
--    membership (quien abre el enlace normalmente todavía no es miembro).
--    Solo authenticated (nunca anon): evita enumeración/verificación de
--    tokens por usuarios anónimos. Devuelve exclusivamente lo necesario
--    para mostrar "te invitaron a <empresa> como <rol>".
-- ---------------------------------------------------------------------------
create or replace function public.get_invitation_preview(p_token text)
returns table (
  organization_name text,
  email text,
  role_code text,
  status text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.name, ti.email, ti.role_code, ti.status, ti.expires_at
  from public.team_invitations ti
  join public.organizations o on o.id = ti.organization_id
  where ti.token = p_token;
$$;

revoke execute on function public.get_invitation_preview(text) from public, anon;
grant execute on function public.get_invitation_preview(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. accept_team_invitation — única vía para aceptar (SECURITY DEFINER):
--    valida token, estado, expiración y coincidencia de correo; crea la
--    membership (o la respeta si ya existe) y marca la invitación
--    aceptada. Nunca acepta organization_id del cliente: todo sale del
--    token. Nunca usa service_role (corre con la sesión real del usuario
--    que acepta; SECURITY DEFINER solo eleva el acceso DENTRO de esta
--    función, igual que create_organization).
-- ---------------------------------------------------------------------------
create or replace function public.accept_team_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user       uuid;
  v_user_email text;
  v_inv        record;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'No autenticado';
  end if;

  select email into v_user_email from profiles where id = v_user;
  if v_user_email is null then
    raise exception 'El usuario no tiene perfil asociado';
  end if;

  select * into v_inv
  from team_invitations
  where token = p_token
  for update;

  if v_inv.id is null then
    raise exception 'La invitación no existe';
  end if;

  if v_inv.status = 'accepted' then
    raise exception 'Esta invitación ya fue aceptada';
  end if;

  if v_inv.status = 'revoked' then
    raise exception 'Esta invitación fue revocada';
  end if;

  if v_inv.status = 'expired' or v_inv.expires_at < now() then
    if v_inv.status <> 'expired' then
      update team_invitations set status = 'expired' where id = v_inv.id;
    end if;
    raise exception 'La invitación expiró';
  end if;

  if lower(v_user_email) <> v_inv.email then
    raise exception 'Esta invitación fue enviada a otro correo electrónico';
  end if;

  if exists (
    select 1 from memberships
    where organization_id = v_inv.organization_id and user_id = v_user
  ) then
    -- Ya es miembro (por ejemplo, invitación duplicada aceptada dos veces
    -- en pestañas distintas): no duplicar membership, solo cerrar la
    -- invitación como aceptada.
    update team_invitations
      set status = 'accepted', accepted_by = v_user, accepted_at = now()
      where id = v_inv.id;
    return v_inv.organization_id;
  end if;

  insert into memberships (organization_id, user_id, role_code, status)
  values (v_inv.organization_id, v_user, v_inv.role_code, 'active');

  update team_invitations
    set status = 'accepted', accepted_by = v_user, accepted_at = now()
    where id = v_inv.id;

  perform log_event(
    v_inv.organization_id,
    'team_invitation_accepted',
    jsonb_build_object('role_code', v_inv.role_code),
    v_user
  );

  return v_inv.organization_id;
end;
$$;

revoke execute on function public.accept_team_invitation(text) from public, anon;
grant execute on function public.accept_team_invitation(text) to authenticated;
