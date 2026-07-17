-- 0058_trazadocs_documents_storage.sql
-- Trazaloop · Sprint 10B · Bucket privado para documentos descargables de
-- TrazaDocs — separado de `evidences` (0015) y de `organization-assets`
-- (0049, logo): un documento controlado descargable no es una evidencia
-- técnica ni un activo de marca. Mismo patrón exacto de políticas por
-- (storage.foldername(name))[1] como organization_id que los otros 2
-- buckets del proyecto.

insert into storage.buckets (id, name, public)
values ('trazadocs-documents', 'trazadocs-documents', false)
on conflict (id) do nothing;

-- Lectura: cualquier miembro de la organización (Parte 7: "miembros de la
-- organización pueden descargar si tienen acceso a TrazaDocs" — TrazaDocs
-- no tiene un permiso de acceso distinto del de ser miembro).
create policy trazadocs_documents_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'trazadocs-documents'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- Subir: admin/quality/consultant (mismo criterio de creación que
-- trazadoc_file_documents).
create policy trazadocs_documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'trazadocs-documents'
    and public.has_org_role(((storage.foldername(name))[1])::uuid, array['admin','quality','consultant'])
  );

-- Reemplazar (nueva versión = nuevo objeto, no upsert): mismo criterio de
-- lectura ya cubre el caso de "reemplazar" porque cada versión sube un
-- storage_path nuevo — pero se agrega UPDATE por si algún flujo necesita
-- ajustar metadatos del objeto sin cambiar su contenido.
create policy trazadocs_documents_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'trazadocs-documents'
    and public.has_org_role(((storage.foldername(name))[1])::uuid, array['admin','quality'])
  )
  with check (
    bucket_id = 'trazadocs-documents'
    and public.has_org_role(((storage.foldername(name))[1])::uuid, array['admin','quality'])
  );

-- Eliminar: solo admin/quality (mismo criterio que eliminar el documento
-- descargable en borrador).
create policy trazadocs_documents_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'trazadocs-documents'
    and public.has_org_role(((storage.foldername(name))[1])::uuid, array['admin','quality'])
  );
