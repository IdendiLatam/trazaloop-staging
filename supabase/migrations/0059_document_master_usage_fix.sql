-- 0059_document_master_usage_fix.sql
-- Trazaloop · Sprint 10B · Corrección (Bloqueantes 1 y 2).
--
-- Bloqueante 1: uploadFileDocumentAction dejaba storage_path='' en la
-- fila principal (nunca se confirmaba con la ruta real tras subir el
-- archivo) y usaba change_trazadoc_file_document_status para "cerrar" la
-- creación — esa función SIEMPRE incrementa current_version, así que un
-- documento recién creado quedaba en v2, no v1. Esta migración agrega
-- finalize_trazadoc_file_document_initial_version, la única vía correcta
-- para cerrar la creación inicial: dueña de fijar storage_path/file_name/
-- mime_type/size_bytes reales Y de dejar exactamente una versión v1 —
-- nunca se vuelve a usar cuando el documento ya tiene versión.
--
-- Bloqueante 2: v_organization_plan_usage (0052) seguía contando SOLO
-- trazadoc_documents en documents_trazadocs_count, y su
-- storage_used_bytes no incluía trazadoc_file_documents.size_bytes.

-- ---------------------------------------------------------------------------
-- 1. finalize_trazadoc_file_document_initial_version.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_trazadoc_file_document_initial_version(
  p_file_document_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_change_note text default 'Borrador inicial'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_doc  record;
  v_role text;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'No autenticado';
  end if;

  select * into v_doc from trazadoc_file_documents where id = p_file_document_id for update;
  if v_doc.id is null then
    raise exception 'El documento no existe';
  end if;

  if not is_org_member(v_doc.organization_id) then
    raise exception 'No perteneces a la empresa de este documento';
  end if;

  select m.role_code into v_role
  from memberships m
  where m.organization_id = v_doc.organization_id and m.user_id = v_user and m.status = 'active';

  if v_role not in ('admin', 'quality', 'consultant') then
    raise exception 'Tu rol no permite finalizar la creación de este documento';
  end if;

  if v_doc.status <> 'draft' then
    raise exception 'Este documento ya no está en borrador inicial';
  end if;

  -- Idempotencia (Bloqueante 1, regla 9): si ya existe una v1 para este
  -- documento (por ejemplo, un reintento tras un fallo de red en el
  -- cliente después de que el servidor ya la creó), no duplicar — solo
  -- confirmar que la fila principal quede con los datos correctos.
  if not exists (
    select 1 from trazadoc_file_document_versions
    where file_document_id = p_file_document_id and version_number = 1
  ) then
    insert into trazadoc_file_document_versions
      (organization_id, file_document_id, version_number, version_label, status, snapshot, storage_path, file_name, mime_type, size_bytes, change_note, created_by)
    values
      (
        v_doc.organization_id, p_file_document_id, 1, 'v1', 'draft',
        jsonb_build_object(
          'title', v_doc.title, 'code', v_doc.code, 'description', v_doc.description,
          'file_name', p_file_name, 'mime_type', p_mime_type, 'size_bytes', p_size_bytes
        ),
        p_storage_path, p_file_name, p_mime_type, p_size_bytes, p_change_note, v_user
      );
  end if;

  update trazadoc_file_documents
  set
    storage_path = p_storage_path,
    file_name = p_file_name,
    mime_type = p_mime_type,
    size_bytes = p_size_bytes,
    current_version = 1,
    version_label = 'v1'
  where id = p_file_document_id;

  return 1;
end;
$$;

revoke execute on function public.finalize_trazadoc_file_document_initial_version(uuid, text, text, text, bigint, text) from public, anon;
grant execute on function public.finalize_trazadoc_file_document_initial_version(uuid, text, text, text, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. v_organization_plan_usage — corrección de conteo y almacenamiento.
--    Mismas columnas y mismo orden que 0052 (nunca se quita ninguna),
--    solo se corrigen documents_trazadocs_count y storage_used_bytes.
-- ---------------------------------------------------------------------------
create or replace view public.v_organization_plan_usage
with (security_barrier = true) as
select
  o.id                                                                                                            as organization_id,
  coalesce(sub.plan_code, 'demo')                                                                                 as plan_code,
  coalesce(sub.status, 'active')                                                                                  as plan_status,
  pd.storage_limit_bytes,
  coalesce(ev.storage_used_bytes, 0) + coalesce(o.logo_size_bytes, 0) + coalesce(fd.storage_used_bytes, 0)         as storage_used_bytes,
  round((coalesce(ev.storage_used_bytes, 0) + coalesce(o.logo_size_bytes, 0) + coalesce(fd.storage_used_bytes, 0)) / 1048576.0, 2) as storage_used_mb,
  round(pd.storage_limit_bytes / 1048576.0, 2)                                                                     as storage_limit_mb,
  case
    when pd.storage_limit_bytes > 0 then
      round(100.0 * (coalesce(ev.storage_used_bytes, 0) + coalesce(o.logo_size_bytes, 0) + coalesce(fd.storage_used_bytes, 0)) / pd.storage_limit_bytes, 1)
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
  -- Sprint 10B (Bloqueante 2): documentos descargables cuentan dentro
  -- del MISMO recurso documents_trazadocs, y su tamaño suma al
  -- almacenamiento total — un solo origen de verdad para ambos.
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
