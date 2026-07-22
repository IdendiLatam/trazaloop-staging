-- 0076_textile_evidences_hardening_and_storage_usage.sql
-- Trazaloop · Sprint T5.1 (Textil) · Hardening de evidencias textiles y
-- uso de almacenamiento.
--
-- ALCANCE ESTRICTO: SOLO endurecer lo creado en 0075 y cerrar la brecha de
-- medición de almacenamiento. Sin tablas nuevas, sin órdenes/lotes,
-- circularidad, TrazaDocs Textil, pasaporte, QR ni planes por módulo.
--
-- Tres frentes:
--  1. USO DE ALMACENAMIENTO: v_organization_plan_usage (definición vigente
--     de 0059) ahora suma también textile_evidences.file_size_bytes en
--     storage_used_bytes / _mb / _percent. Mismas columnas y mismo orden
--     (nunca se quita ninguna): CPR, planes y plataforma leen la vista
--     igual que antes — solo el total de storage es más veraz.
--  2. STORAGE: el bucket `evidences` NO tenía política de DELETE (0015:
--     "sin DELETE en Sprint 1"; nunca se agregó), así que la limpieza de
--     archivos huérfanos de T5 fallaba en silencio. Se agrega una política
--     de delete ESTRICTAMENTE acotada al prefijo textil
--     ({organization_id}/textiles/…): el segundo segmento debe ser
--     'textiles' y el rol admin/quality/consultant de la organización del
--     primer segmento (safe_uuid, patrón 0016). Las rutas CPR
--     ({organization_id}/{evidence_id}/…) SIGUEN sin delete — cero cambio
--     de comportamiento CPR. El bucket sigue privado, sin anon.
--  3. RLS DE TABLAS: menos permisos que "cualquier miembro". La política
--     de subida de storage (0015/0016) siempre exigió
--     admin/quality/consultant; las tablas de 0075 aceptaban escrituras de
--     cualquier miembro (un operator podía crear filas sin poder subir el
--     archivo, o vincular evidencias). Se alinean: insert/update de
--     textile_evidences e insert de textile_evidence_links quedan para
--     admin/quality/consultant. El guard de revisión
--     (guard_textile_evidence_review) sigue reservando los cambios de
--     estado y la edición post-revisión a admin/quality; el delete de
--     evidencias sigue admin/quality y nunca una aceptada (0075 intacto).
--
-- Aditiva (drop/recreate solo de POLÍTICAS propias de tablas textiles, el
-- patrón de 0016/0036); sin drops de tablas; sin tocar migraciones previas
-- ni objetos CPR.

-- ---------------------------------------------------------------------------
-- 1. v_organization_plan_usage — incluir bytes de evidencias textiles.
--    Cuerpo de 0059 + join tev; los archivos históricos sin tamaño
--    guardado suman 0 (mismo criterio de 0052).
-- ---------------------------------------------------------------------------
create or replace view public.v_organization_plan_usage
with (security_barrier = true) as
select
  o.id                                                                                                            as organization_id,
  coalesce(sub.plan_code, 'demo')                                                                                 as plan_code,
  coalesce(sub.status, 'active')                                                                                  as plan_status,
  pd.storage_limit_bytes,
  coalesce(ev.storage_used_bytes, 0) + coalesce(o.logo_size_bytes, 0) + coalesce(fd.storage_used_bytes, 0) + coalesce(tev.storage_used_bytes, 0) as storage_used_bytes,
  round((coalesce(ev.storage_used_bytes, 0) + coalesce(o.logo_size_bytes, 0) + coalesce(fd.storage_used_bytes, 0) + coalesce(tev.storage_used_bytes, 0)) / 1048576.0, 2) as storage_used_mb,
  round(pd.storage_limit_bytes / 1048576.0, 2)                                                                     as storage_limit_mb,
  case
    when pd.storage_limit_bytes > 0 then
      round(100.0 * (coalesce(ev.storage_used_bytes, 0) + coalesce(o.logo_size_bytes, 0) + coalesce(fd.storage_used_bytes, 0) + coalesce(tev.storage_used_bytes, 0)) / pd.storage_limit_bytes, 1)
    else 0
  end                                                                                                              as storage_percent_used,
  coalesce(td.documents_trazadocs_count, 0) + coalesce(fd.documents_count, 0)                                      as documents_trazadocs_count,
  coalesce(sup.suppliers_count, 0)                                                                                 as suppliers_count,
  coalesce(mat.materials_count, 0)                                                                                 as materials_count,
  coalesce(prod.products_count, 0)                                                                                 as products_count,
  coalesce(ev.evidences_count, 0)                                                                                  as evidences_count,
  coalesce(po.production_orders_count, 0)                                                                          as production_orders_count,
  coalesce(ib.input_batches_count, 0)                                                                              as input_batches_count,
  coalesce(ob.output_batches_count, 0)                                                                             as output_batches_count,
  coalesce(tm.team_members_count, 0)                                                                               as team_members_count,
  coalesce(diag.diagnostic_taken, false)                                                                           as diagnostic_taken,
  coalesce(imp.imports_count, 0)                                                                                   as imports_count,
  coalesce(fb.tickets_count, 0)                                                                                    as tickets_count,
  greatest(o.updated_at, coalesce(sub.updated_at, o.updated_at))                                                   as updated_at
from public.organizations o
left join public.organization_subscriptions sub on sub.organization_id = o.id
left join public.plan_definitions pd on pd.code = coalesce(sub.plan_code, 'demo')
left join (
  select organization_id, count(*) as documents_trazadocs_count
  from public.trazadoc_documents group by organization_id
) td on td.organization_id = o.id
left join (
  select organization_id, count(*) as documents_count, sum(coalesce(size_bytes, 0)) as storage_used_bytes
  from public.trazadoc_file_documents group by organization_id
) fd on fd.organization_id = o.id
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
  -- T5.1: los soportes textiles consumen almacenamiento real del bucket
  -- privado `evidences` ({org}/textiles/…) y ahora cuentan en la cuota.
  -- NO se agrega columna de conteo: los planes por módulo están fuera de
  -- alcance; solo el TOTAL de storage refleja los bytes textiles.
  select organization_id, sum(coalesce(file_size_bytes, 0)) as storage_used_bytes
  from public.textile_evidences group by organization_id
) tev on tev.organization_id = o.id
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

-- ---------------------------------------------------------------------------
-- 2. Storage: DELETE solo del prefijo textil del bucket `evidences`.
--    Necesario para que la limpieza de huérfanos (subida OK + insert
--    fallido) funcione de verdad. Las rutas CPR siguen sin delete.
-- ---------------------------------------------------------------------------
drop policy if exists evidences_delete_textiles on storage.objects;
create policy evidences_delete_textiles on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'evidences'
    and (storage.foldername(name))[2] = 'textiles'
    and public.has_org_role(
      public.safe_uuid((storage.foldername(name))[1]),
      array['admin', 'quality', 'consultant']
    )
  );

-- ---------------------------------------------------------------------------
-- 3. RLS de tablas: escrituras alineadas con los roles de storage.
-- ---------------------------------------------------------------------------
drop policy if exists textile_evidences_insert on public.textile_evidences;
create policy textile_evidences_insert on public.textile_evidences
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['admin', 'quality', 'consultant'])
    and status = 'pending_review'
  );

drop policy if exists textile_evidences_update on public.textile_evidences;
create policy textile_evidences_update on public.textile_evidences
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin', 'quality', 'consultant']))
  with check (public.has_org_role(organization_id, array['admin', 'quality', 'consultant']));

drop policy if exists textile_evidence_links_insert on public.textile_evidence_links;
create policy textile_evidence_links_insert on public.textile_evidence_links
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin', 'quality', 'consultant']));
