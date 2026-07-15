-- 0041_platform_views.sql
-- Trazaloop · Sprint 8.4 · Vista de plataforma para platform_staff.
--
-- A diferencia de las vistas de negocio (v_implementation_dashboard, etc.,
-- Sprint 6), que usan `security_invoker = true` para heredar la RLS de
-- cada empresa, ESTA vista necesita ver TODAS las organizaciones a la vez
-- — ese es su propósito (acompañar empresas desde la plataforma). Por eso
-- se deja SIN `security_invoker` (una vista sin esa opción corre con los
-- privilegios de quien la creó, no del usuario que consulta, y así puede
-- leer más allá de lo que la RLS de `organizations`/`memberships`
-- permitiría a un usuario cualquiera). La seguridad no depende de eso:
-- la vista misma exige `is_platform_staff()` en su WHERE — un usuario que
-- no sea platform_staff activo obtiene CERO filas, nunca una fuga parcial.
--
-- No recalcula contenido reciclado: solo cuenta y resume, mismo criterio
-- que las vistas de implementación del Sprint 6.

create view public.v_platform_organizations as
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
  coalesce(fb.critical_feedback_count, 0)                    as critical_feedback_count
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
