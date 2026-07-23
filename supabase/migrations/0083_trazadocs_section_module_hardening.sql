-- 0083_trazadocs_section_module_hardening.sql
-- Trazaloop · Sprint T8.1 · Hardening de edición de secciones TrazaDocs.
--
-- PROBLEMA: los helpers de sección actualizaban/borraban por
-- organization_id + section_id SIN amarrar document_id ni module_key. Un
-- usuario legítimo que manipulara el formulario (o llamara la action con
-- un sectionId ajeno) podía editar desde la ruta Textil una sección de
-- OTRO documento de su organización — incluso un documento CPR en
-- borrador/revisión — y viceversa, porque la RLS (0047) solo exige misma
-- organización, rol y padre editable. Además quedaban dos huecos hermanos
-- a nivel BD: (a) INSERTAR secciones en un documento APROBADO u OBSOLETO
-- vía API directa (la política de insert de 0043 nunca miró el estado del
-- padre) y (b) "mudar" una sección de documento actualizando document_id
-- (el with check de 0047 solo re-verifica que el NUEVO padre sea
-- editable). El amarre por módulo se cierra en la capa de código (T8.1);
-- este archivo cierra lo que solo la BD puede garantizar.
--
-- SOLUCIÓN (este archivo, y nada más): un trigger BEFORE INSERT OR UPDATE
-- sobre trazadoc_document_sections que exige:
--   · INSERT: el documento padre existe y está en borrador/revisión;
--   · UPDATE: document_id y section_key INMUTABLES (una sección jamás se
--     muda de documento ni cambia su clave), y el padre sigue editable
--     (defensa en profundidad sobre la RLS de 0047, cubre también
--     cualquier vía privilegiada futura).
-- Sin guard en DELETE: la RLS (solo padre en borrador, admin/quality) ya
-- lo cubre, y un guard de fila rompería el borrado en cascada legítimo de
-- un documento en borrador (0043/0048).
--
-- ALCANCE ESTRICTO: una función + un trigger. Sin tablas, sin políticas,
-- sin vistas, sin cambios de filas, sin tocar CPR ni los documentos/
-- estructuras de T8, sin pasaporte/QR/IA/ACV/planes. Comportamiento
-- funcional de la app INTACTO: ninguna ruta legítima inserta secciones
-- fuera de borrador/revisión ni actualiza document_id/section_key (las
-- RPCs de 0046/0047 solo LEEN secciones para el snapshot de versión).

create or replace function public.protect_trazadoc_document_section_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE' then
    if new.document_id is distinct from old.document_id then
      raise exception 'Una sección no puede moverse a otro documento.';
    end if;
    if new.section_key is distinct from old.section_key then
      raise exception 'La clave de una sección no puede cambiarse.';
    end if;
  end if;

  select d.status into v_status
    from trazadoc_documents d
    where d.id = new.document_id;

  if v_status is null then
    raise exception 'La sección debe pertenecer a un documento existente.';
  end if;
  if v_status not in ('draft', 'in_review') then
    raise exception 'Las secciones solo pueden agregarse o editarse mientras el documento está en borrador o en revisión.';
  end if;

  return new;
end;
$$;
revoke execute on function public.protect_trazadoc_document_section_integrity() from public, anon, authenticated;

create trigger t_trazadoc_document_sections_integrity
  before insert or update on public.trazadoc_document_sections
  for each row execute function public.protect_trazadoc_document_section_integrity();
