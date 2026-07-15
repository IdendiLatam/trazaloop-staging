-- 0046_trazadocs_status_transitions.sql
-- Trazaloop · Sprint 9 · Transición de estado atómica de un documento
-- TrazaDocs.
--
-- Cambiar de estado (enviar a revisión, aprobar, marcar obsoleto,
-- reactivar) implica escribir en 3 tablas a la vez de forma consistente:
-- guardar el snapshot de la versión, dejar huella en el historial de
-- estado, y actualizar el documento. Igual que create_organization,
-- accept_team_invitation y create_platform_organization, esto se hace en
-- una función SECURITY DEFINER — atómica de verdad (todo o nada), nunca
-- varias llamadas sueltas desde el cliente. Corre con la sesión REAL del
-- usuario (auth.uid()), nunca con service_role.

create or replace function public.change_trazadoc_document_status(
  p_document_id uuid,
  p_to_status text,
  p_change_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user       uuid;
  v_doc        record;
  v_role       text;
  v_new_version integer;
  v_snapshot   jsonb;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'No autenticado';
  end if;

  if p_to_status not in ('draft', 'in_review', 'approved', 'obsolete') then
    raise exception 'Estado no válido';
  end if;

  select * into v_doc from trazadoc_documents where id = p_document_id for update;
  if v_doc.id is null then
    raise exception 'El documento no existe';
  end if;

  if not is_org_member(v_doc.organization_id) then
    raise exception 'No perteneces a la empresa de este documento';
  end if;

  select m.role_code into v_role
  from memberships m
  where m.organization_id = v_doc.organization_id and m.user_id = v_user and m.status = 'active';

  -- Mismas reglas que la RLS de escritura (0043): consultant nunca aprueba
  -- ni marca obsoleto ni reactiva; solo puede mover a draft/in_review.
  if v_role = 'consultant' and p_to_status not in ('draft', 'in_review') then
    raise exception 'Tu rol no permite aprobar ni marcar obsoleto este documento';
  end if;
  if v_role not in ('admin', 'quality', 'consultant') then
    raise exception 'Tu rol no permite cambiar el estado de este documento';
  end if;
  -- Reactivar un documento obsoleto: solo admin (Parte 9).
  if v_doc.status = 'obsolete' and p_to_status <> 'obsolete' and v_role <> 'admin' then
    raise exception 'Solo un administrador puede reactivar un documento obsoleto';
  end if;

  v_new_version := v_doc.current_version + 1;

  -- Snapshot de las secciones TAL COMO ESTÁN en este momento — nunca se
  -- sobrescribe una versión anterior (append-only real).
  select jsonb_build_object(
    'document', jsonb_build_object(
      'title', v_doc.title, 'code', v_doc.code, 'description', v_doc.description
    ),
    'sections', coalesce(jsonb_agg(
      jsonb_build_object(
        'section_key', s.section_key, 'title', s.title, 'content', s.content,
        'sort_order', s.sort_order, 'is_required', s.is_required
      ) order by s.sort_order
    ) filter (where s.id is not null), '[]'::jsonb)
  )
  into v_snapshot
  from trazadoc_document_sections s
  where s.document_id = p_document_id;

  insert into trazadoc_document_versions
    (organization_id, document_id, version_number, status, snapshot, change_note, created_by)
  values
    (v_doc.organization_id, p_document_id, v_new_version, p_to_status, v_snapshot, p_change_note, v_user);

  insert into trazadoc_status_history
    (organization_id, document_id, from_status, to_status, changed_by, change_note)
  values
    (v_doc.organization_id, p_document_id, v_doc.status, p_to_status, v_user, p_change_note);

  update trazadoc_documents
  set
    status = p_to_status,
    current_version = v_new_version,
    approved_by = case when p_to_status = 'approved' then v_user else approved_by end,
    approved_at = case when p_to_status = 'approved' then now() else approved_at end,
    obsolete_at = case when p_to_status = 'obsolete' then now() else obsolete_at end
  where id = p_document_id;

  return v_new_version;
end;
$$;

revoke execute on function public.change_trazadoc_document_status(uuid, text, text) from public, anon;
grant execute on function public.change_trazadoc_document_status(uuid, text, text) to authenticated;
