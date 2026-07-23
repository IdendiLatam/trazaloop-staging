-- 0077_textile_evidence_file_metadata_immutability.sql
-- Trazaloop · Sprint T5.2 (Textil) · Inmutabilidad de metadatos de archivo
-- en evidencias textiles.
--
-- PROBLEMA: la política de UPDATE de textile_evidences (0076:
-- admin/quality/consultant) permite, vía API de Supabase, editar
-- directamente file_path / file_name / file_mime_type / file_size_bytes.
-- Eso rompería la consistencia BD↔Storage, las signed URLs, la
-- trazabilidad documental y el cálculo de uso de almacenamiento (0076
-- suma file_size_bytes: editarlo manipularía la cuota). La UI y las
-- server actions nunca tocan esos campos, pero NO deben ser la única
-- barrera: la base de datos los bloquea.
--
-- ALCANCE ESTRICTO: SOLO dos funciones + dos triggers sobre
-- textile_evidences. Sin tablas nuevas, sin cambios de políticas, sin
-- tocar la vista de uso (criterio T5.1 intacto: los bytes cuentan
-- mientras el archivo exista, en cualquier estado documental), sin
-- órdenes/lotes, circularidad, TrazaDocs Textil, pasaporte ni planes.
-- CERO cambios a objetos CPR.
--
-- DECISIÓN (reemplazo de archivo): NO existe en este sprint. El archivo
-- de una evidencia es INMUTABLE en TODOS los estados (incluso
-- pending_review): define el objeto almacenado y su consumo. Un futuro
-- reemplazo deberá ser nueva evidencia, nueva versión o una RPC
-- controlada específica — nunca un update directo.

-- ---------------------------------------------------------------------------
-- 1. Inmutabilidad: los 4 metadatos de archivo no cambian tras la creación.
--    Trigger normal (sin security definer): no evalúa roles — aplica a
--    TODOS, incluido service_role (los triggers no se saltan con la
--    service key; solo la RLS). IS DISTINCT FROM: seguro frente a nulls
--    (file_name/mime/size son opcionales en datos históricos).
-- ---------------------------------------------------------------------------
create or replace function public.protect_textile_evidence_file_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.file_path       is distinct from old.file_path
     or new.file_name       is distinct from old.file_name
     or new.file_mime_type  is distinct from old.file_mime_type
     or new.file_size_bytes is distinct from old.file_size_bytes then
    raise exception 'Los metadatos de archivo de una evidencia textil no pueden modificarse después de su creación';
  end if;
  return new;
end;
$$;
revoke execute on function public.protect_textile_evidence_file_metadata() from public, anon, authenticated;

create trigger t_textile_evidences_file_immutable
  before update on public.textile_evidences
  for each row execute function public.protect_textile_evidence_file_metadata();

-- ---------------------------------------------------------------------------
-- 2. Patrón estricto de file_path en el INSERT. El flujo real (T5) genera
--    el id ANTES de construir la ruta e inserta con id explícito, así que
--    aquí new.id, new.organization_id y new.file_path existen y se valida
--    ESTRICTO (opción fuerte del encargo §6):
--       {organization_id}/textiles/{evidence_id}/{filename}
--    con filename saneado ([A-Za-z0-9._-]+, como buildTextileEvidencePath).
--    Bloquea: rutas de otra organización, rutas CPR ({org}/{uuid}/…) por
--    ausencia del segmento 'textiles', traversal (`..`, `//`, espacios),
--    ids ajenos y nombres vacíos. Los uuid solo contienen [0-9a-f-]:
--    concatenarlos en la regex es seguro.
--    Solo BEFORE INSERT: en UPDATE los campos ya son inmutables por el
--    trigger anterior, de modo que el patrón no puede degradarse después.
-- ---------------------------------------------------------------------------
create or replace function public.validate_textile_evidence_file_path()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.file_path is null
     or new.file_path !~ ('^' || new.organization_id::text || '/textiles/' || new.id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'La ruta del archivo de la evidencia textil no cumple el patrón {organización}/textiles/{evidencia}/{archivo}';
  end if;
  return new;
end;
$$;
revoke execute on function public.validate_textile_evidence_file_path() from public, anon, authenticated;

create trigger t_textile_evidences_file_path_pattern
  before insert on public.textile_evidences
  for each row execute function public.validate_textile_evidence_file_path();
