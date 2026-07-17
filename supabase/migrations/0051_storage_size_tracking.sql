-- 0051_storage_size_tracking.sql
-- Trazaloop · Sprint 10A · Parte 6: columnas de tamaño para medir
-- almacenamiento por empresa.
--
-- Las evidencias (0019, Sprint 2) y el logo de empresa (0049, Sprint 9.2)
-- no guardaban el tamaño del archivo subido. Se agrega aquí, nullable —
-- los registros existentes quedan en null (se tratan como 0 en la vista
-- de uso, 0052) sin romper nada. Los nuevos uploads sí lo guardan desde
-- este sprint (server/actions/evidences.ts, server/actions/settings.ts).

alter table public.evidences
  add column size_bytes bigint;

alter table public.evidences
  add constraint evidences_size_bytes_check check (size_bytes is null or size_bytes >= 0);

alter table public.organizations
  add column logo_size_bytes bigint;

alter table public.organizations
  add constraint organizations_logo_size_bytes_check check (logo_size_bytes is null or logo_size_bytes >= 0);
