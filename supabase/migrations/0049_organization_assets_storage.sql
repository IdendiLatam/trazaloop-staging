-- 0049_organization_assets_storage.sql
-- Trazaloop · Sprint 9.2 · Logo de empresa.
--
-- Bucket privado NUEVO `organization-assets` (separado de `evidences`,
-- 0015 — un logo no es una evidencia técnica, no se mezclan). Mismo
-- patrón exacto: convención de ruta {organization_id}/... como PRIMER
-- segmento, políticas sobre storage.objects usando
-- (storage.foldername(name))[1].

insert into storage.buckets (id, name, public)
values ('organization-assets', 'organization-assets', false)
on conflict (id) do nothing;

-- Lectura: cualquier miembro de la organización (quality/consultant
-- "pueden ver, no editar"), y platform_staff (soporte).
create policy organization_assets_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'organization-assets'
    and (
      public.is_org_member(((storage.foldername(name))[1])::uuid)
      or public.is_platform_staff()
    )
  );

-- Subir/reemplazar/eliminar: solo admin de la empresa (nunca
-- quality/consultant, nunca cross-tenant).
create policy organization_assets_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'organization-assets'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

create policy organization_assets_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'organization-assets'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'organization-assets'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

create policy organization_assets_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'organization-assets'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

-- Referencia al logo actual en la propia empresa. Solo se guarda la RUTA
-- de storage (bucket privado): la URL firmada se genera bajo demanda en
-- servidor cuando hace falta mostrarla (configuración, impresión) — nunca
-- se persiste una URL pública.
alter table public.organizations
  add column logo_storage_path text,
  add column logo_updated_at timestamptz;
