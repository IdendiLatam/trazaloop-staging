-- 0045_trazadocs_views.sql
-- Trazaloop · Sprint 9 · Vistas de resumen de TrazaDocs.
--
-- security_invoker = true (patrón estándar desde el Sprint 6, a diferencia
-- de v_platform_organizations 0041 que es la única excepción a propósito):
-- estas vistas heredan la RLS real de trazadoc_documents/
-- trazadoc_document_sections/trazadoc_blueprints — cada empresa solo ve
-- sus propios documentos, cada usuario ve los blueprints activos que ya
-- podría ver directamente. No recalculan nada del motor de contenido
-- reciclado: solo cuentan y resumen.

create view public.v_trazadoc_document_summary
with (security_invoker = true) as
select
  d.organization_id,
  d.id                                                as document_id,
  d.title,
  d.code,
  d.source_type,
  d.status,
  d.current_version,
  owner.full_name                                     as owner_name,
  creator.full_name                                    as created_by_name,
  approver.full_name                                   as approved_by_name,
  d.approved_at,
  coalesce(sec.sections_count, 0)                      as sections_count,
  coalesce(sec.filled_sections_count, 0)                as filled_sections_count,
  coalesce(sec.required_sections_count, 0)              as required_sections_count,
  coalesce(sec.filled_required_sections_count, 0)       as filled_required_sections_count,
  d.updated_at
from public.trazadoc_documents d
left join public.profiles owner    on owner.id = d.owner_id
left join public.profiles creator  on creator.id = d.created_by
left join public.profiles approver on approver.id = d.approved_by
left join (
  select
    document_id,
    count(*)                                                            as sections_count,
    count(*) filter (where length(trim(content)) > 0)                    as filled_sections_count,
    count(*) filter (where is_required)                                  as required_sections_count,
    count(*) filter (where is_required and length(trim(content)) > 0)    as filled_required_sections_count
  from public.trazadoc_document_sections
  group by document_id
) sec on sec.document_id = d.id;

create view public.v_trazadoc_blueprint_summary
with (security_invoker = true) as
select
  b.id                                    as blueprint_id,
  b.code,
  b.name,
  b.description,
  b.document_type,
  b.status,
  coalesce(sec.sections_count, 0)          as sections_count,
  coalesce(sec.required_sections_count, 0) as required_sections_count,
  b.updated_at
from public.trazadoc_blueprints b
left join (
  select
    blueprint_id,
    count(*)                                as sections_count,
    count(*) filter (where is_required)      as required_sections_count
  from public.trazadoc_blueprint_sections
  where status = 'active'
  group by blueprint_id
) sec on sec.blueprint_id = b.id;
