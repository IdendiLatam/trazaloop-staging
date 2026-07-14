-- 0038_my_pending_invitations.sql
-- Trazaloop · Corrección de onboarding · "list_my_pending_invitations".
--
-- Bug encontrado: un usuario que YA fue invitado pero todavía no es
-- miembro de ninguna empresa no podía ver sus propias invitaciones
-- pendientes al iniciar sesión — la política de SELECT de
-- team_invitations (0037) exige admin/quality/consultant DE LA EMPRESA,
-- que por definición un usuario sin membership todavía no tiene. El único
-- camino existente (get_invitation_preview, 0037) requiere YA CONOCER el
-- token; no sirve para "¿tengo alguna invitación pendiente?" al entrar sin
-- enlace.
--
-- Esta migración agrega la pieza que faltaba: una función que devuelve,
-- para el usuario AUTENTICADO actual, sus propias invitaciones pendientes
-- y vigentes — nunca las de otro usuario (auth.uid() → profiles.email
-- internamente, sin parámetros que el cliente pueda manipular). No cambia
-- team_invitations, no cambia RLS, no cambia el motor de cálculo.

create or replace function public.list_my_pending_invitations()
returns table (
  invitation_id uuid,
  organization_id uuid,
  organization_name text,
  role_code text,
  token text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select ti.id, ti.organization_id, o.name, ti.role_code, ti.token, ti.expires_at
  from public.team_invitations ti
  join public.organizations o on o.id = ti.organization_id
  join public.profiles p on p.id = auth.uid()
  where ti.status = 'pending'
    and ti.expires_at > now()
    and ti.email = lower(p.email)
  order by ti.created_at asc;
$$;

revoke execute on function public.list_my_pending_invitations() from public, anon;
grant execute on function public.list_my_pending_invitations() to authenticated;
