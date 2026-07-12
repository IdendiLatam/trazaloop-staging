-- 0015_storage.sql
-- Trazaloop · Sprint 1 · Fundaciones
-- Bucket privado `evidences` + políticas base por ruta.
--
-- Convención de rutas: evidences/{organization_id}/{evidence_id}/{filename}
-- El PRIMER segmento de la ruta es el organization_id; sobre él operan las
-- políticas ((storage.foldername(name))[1]).
--
-- NOTA (limitación documentada): la tabla `evidences` llega en Sprint 2, por
-- lo que aquí solo se valida pertenencia a la organización por ruta, no la
-- existencia del evidence_id. La validación evidencia↔registro se añade en
-- Sprint 2. Si el proyecto Supabase restringe crear políticas sobre
-- storage.objects por SQL (propiedad del esquema storage en algunos planes),
-- crear estas mismas políticas desde el Dashboard con idéntico contenido.

-- Bucket privado (idempotente).
insert into storage.buckets (id, name, public)
values ('evidences', 'evidences', false)
on conflict (id) do nothing;

-- Lectura: miembros de la organización del primer segmento de la ruta.
create policy evidences_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidences'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- Subida: miembros con rol admin, quality o consultant.
create policy evidences_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidences'
    and public.has_org_role(
      ((storage.foldername(name))[1])::uuid,
      array['admin', 'quality', 'consultant']
    )
  );

-- Sin UPDATE de cliente (se reemplaza subiendo un objeto nuevo).
-- Sin DELETE en Sprint 1 (se define junto con la tabla evidences en Sprint 2).
-- Sin acceso público: el bucket es privado y no hay políticas para anon.
