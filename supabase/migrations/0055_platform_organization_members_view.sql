-- 0055_platform_organization_members_view.sql
-- Trazaloop · Sprint 10A · Corrección (Bloqueante 6): la consola de
-- plataforma necesita ver miembros/correos/roles/invitaciones pendientes
-- de cualquier empresa — memberships_select (0006) solo permite
-- user_id = auth.uid() o is_org_admin(organization_id): un
-- superadministrador que NO es miembro de esa empresa queda bloqueado por
-- la RLS normal. Mismo patrón exacto que v_platform_organizations (0041):
-- vistas con la guarda is_platform_staff() embebida en la propia
-- definición, REVOKE de public/anon, GRANT solo a authenticated. Un
-- usuario normal (no platform_staff) obtiene siempre cero filas.

-- v_platform_organizations (0041) no traía correo de contacto ni
-- teléfono — CREATE OR REPLACE VIEW agregando 2 columnas AL FINAL (nunca
-- se quita ni reordena ninguna existente, así que sigue siendo compatible
-- con cualquier `select *` ya usado en la app).
create or replace view public.v_platform_organizations as
select
  o.id                                                     as organization_id,
  o.name                                                    as organization_name,
  o.legal_name,
  o.tax_id,
  o.country,
  o.city,
  o.created_at,
  coalesce(mem.members_count, 0)                            as members_count,
  coalesce(mat.materials_count, 0)                           as materials_count,
  coalesce(evd.evidences_count, 0)                           as evidences_count,
  coalesce(ob.output_batches_count, 0)                       as output_batches_count,
  coalesce(calc.calculations_count, 0)                       as calculations_count,
  coalesce(fb.open_feedback_count, 0)                        as open_feedback_count,
  coalesce(fb.critical_feedback_count, 0)                    as critical_feedback_count,
  o.contact_email,
  o.phone
from public.organizations o
left join (
  select organization_id, count(*) as members_count
  from public.memberships where status = 'active'
  group by organization_id
) mem on mem.organization_id = o.id
left join (
  select organization_id, count(*) as materials_count
  from public.materials group by organization_id
) mat on mat.organization_id = o.id
left join (
  select organization_id, count(*) as evidences_count
  from public.evidences group by organization_id
) evd on evd.organization_id = o.id
left join (
  select organization_id, count(*) as output_batches_count
  from public.output_batches group by organization_id
) ob on ob.organization_id = o.id
left join (
  select organization_id, count(*) as calculations_count
  from public.recycled_content_calculations group by organization_id
) calc on calc.organization_id = o.id
left join (
  select
    organization_id,
    count(*) filter (where status in ('open','in_review')) as open_feedback_count,
    count(*) filter (where severity = 'critical' and status in ('open','in_review')) as critical_feedback_count
  from public.implementation_feedback
  group by organization_id
) fb on fb.organization_id = o.id
where public.is_platform_staff();

revoke all on public.v_platform_organizations from public, anon;
grant select on public.v_platform_organizations to authenticated;

create view public.v_platform_organization_members as
select
  m.organization_id,
  m.user_id,
  p.full_name,
  p.email,
  m.role_code,
  m.status,
  m.created_at as joined_at
from public.memberships m
join public.profiles p on p.id = m.user_id
where public.is_platform_staff();

revoke all on public.v_platform_organization_members from public, anon;
grant select on public.v_platform_organization_members to authenticated;

create view public.v_platform_organization_invitations as
select
  ti.organization_id,
  ti.email,
  ti.role_code,
  ti.status,
  ti.expires_at,
  ti.created_at
from public.team_invitations ti
where ti.status = 'pending' and public.is_platform_staff();

revoke all on public.v_platform_organization_invitations from public, anon;
grant select on public.v_platform_organization_invitations to authenticated;
