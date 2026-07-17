-- 0052_organization_usage_views.sql
-- Trazaloop · Sprint 10A · Vista de uso y cuota por organización.
--
-- v_organization_plan_usage: MISMO PATRÓN que v_platform_organizations
-- (0041) — deliberadamente SIN security_invoker (a diferencia de casi
-- todas las demás vistas del proyecto desde el Sprint 6), porque tiene
-- que servir a DOS audiencias con la MISMA consulta:
--   1. un miembro de la empresa viendo el uso de SU PROPIA empresa
--      (Parte 9, indicador de plan en la UI empresarial);
--   2. el superadministrador viendo el uso de TODAS las empresas a la vez
--      (Parte 13, consola de plataforma ampliada).
-- La seguridad está en la guarda embebida en la vista misma
-- (is_org_member(organization_id) or is_platform_staff()), igual que en
-- v_platform_organizations — nunca una fuga cruzada entre empresas.
--
-- storage_used_bytes (Parte 6): suma de size_bytes de evidencias (0051) +
-- logo_size_bytes de la empresa. Los archivos subidos ANTES de este
-- sprint no tienen tamaño guardado (quedan en null → se suman como 0):
-- el conteo es parcial/estimado sobre datos históricos, completo sobre
-- todo lo nuevo. Nunca rompe la vista ni bloquea nada retroactivamente.

create view public.v_organization_plan_usage
with (security_barrier = true) as
select
  o.id                                                                as organization_id,
  coalesce(sub.plan_code, 'demo')                                     as plan_code,
  coalesce(sub.status, 'active')                                      as plan_status,
  pd.storage_limit_bytes,
  coalesce(ev.storage_used_bytes, 0) + coalesce(o.logo_size_bytes, 0)  as storage_used_bytes,
  round((coalesce(ev.storage_used_bytes, 0) + coalesce(o.logo_size_bytes, 0)) / 1048576.0, 2) as storage_used_mb,
  round(pd.storage_limit_bytes / 1048576.0, 2)                        as storage_limit_mb,
  case
    when pd.storage_limit_bytes > 0 then
      round(100.0 * (coalesce(ev.storage_used_bytes, 0) + coalesce(o.logo_size_bytes, 0)) / pd.storage_limit_bytes, 1)
    else 0
  end                                                                  as storage_percent_used,
  coalesce(td.documents_trazadocs_count, 0)                           as documents_trazadocs_count,
  coalesce(sup.suppliers_count, 0)                                    as suppliers_count,
  coalesce(mat.materials_count, 0)                                    as materials_count,
  coalesce(prod.products_count, 0)                                    as products_count,
  coalesce(ev.evidences_count, 0)                                     as evidences_count,
  coalesce(po.production_orders_count, 0)                             as production_orders_count,
  coalesce(ib.input_batches_count, 0)                                 as input_batches_count,
  coalesce(ob.output_batches_count, 0)                                as output_batches_count,
  coalesce(tm.team_members_count, 0)                                  as team_members_count,
  coalesce(diag.diagnostic_taken, false)                              as diagnostic_taken,
  coalesce(imp.imports_count, 0)                                      as imports_count,
  coalesce(fb.tickets_count, 0)                                       as tickets_count,
  greatest(o.updated_at, coalesce(sub.updated_at, o.updated_at))      as updated_at
from public.organizations o
left join public.organization_subscriptions sub on sub.organization_id = o.id
left join public.plan_definitions pd on pd.code = coalesce(sub.plan_code, 'demo')
left join (
  select organization_id, count(*) as documents_trazadocs_count
  from public.trazadoc_documents group by organization_id
) td on td.organization_id = o.id
left join (
  select organization_id, count(*) as suppliers_count from public.suppliers group by organization_id
) sup on sup.organization_id = o.id
left join (
  select organization_id, count(*) as materials_count from public.materials group by organization_id
) mat on mat.organization_id = o.id
left join (
  select organization_id, count(*) as products_count from public.products group by organization_id
) prod on prod.organization_id = o.id
left join (
  select organization_id, count(*) as evidences_count, sum(coalesce(size_bytes, 0)) as storage_used_bytes
  from public.evidences group by organization_id
) ev on ev.organization_id = o.id
left join (
  select organization_id, count(*) as production_orders_count from public.production_orders group by organization_id
) po on po.organization_id = o.id
left join (
  select organization_id, count(*) as input_batches_count from public.input_batches group by organization_id
) ib on ib.organization_id = o.id
left join (
  select organization_id, count(*) as output_batches_count from public.output_batches group by organization_id
) ob on ob.organization_id = o.id
left join (
  select organization_id, count(*) as team_members_count from public.memberships where status = 'active' group by organization_id
) tm on tm.organization_id = o.id
left join (
  select distinct organization_id, true as diagnostic_taken from public.diagnostics
) diag on diag.organization_id = o.id
left join (
  select organization_id, count(*) as imports_count from public.import_jobs group by organization_id
) imp on imp.organization_id = o.id
left join (
  select organization_id, count(*) as tickets_count from public.implementation_feedback
  where status not in ('resolved', 'closed') group by organization_id
) fb on fb.organization_id = o.id
where public.is_org_member(o.id) or public.is_platform_staff();

revoke all on public.v_organization_plan_usage from public, anon;
grant select on public.v_organization_plan_usage to authenticated;
