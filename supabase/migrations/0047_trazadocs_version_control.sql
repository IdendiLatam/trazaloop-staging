-- 0047_trazadocs_version_control.sql
-- Trazaloop · Sprint 9.1 · Corrección de control documental TrazaDocs.
--
-- BLOQUEANTE 3 encontrado: trazadoc_documents_update y
-- trazadoc_document_sections_update (0043) dejaban a admin/quality editar
-- el CONTENIDO de un documento aprobado directamente, sin pasar por una
-- versión nueva — eso puede romper el control documental (el contenido
-- "vivo" cambiaría sin dejar huella clara de versión). Se reemplazan
-- ambas políticas: la edición directa de contenido (título, descripción,
-- texto de sección) queda permitida SOLO mientras el documento está
-- draft/in_review, para LOS TRES roles por igual — ya no hay excepción
-- para admin/quality.
--
-- Los cambios de ESTADO (aprobar, marcar obsoleto, reactivar, o la nueva
-- "crear versión en borrador desde aprobado") siguen funcionando igual:
-- pasan por change_trazadoc_document_status (0046), que es SECURITY
-- DEFINER y por lo tanto no depende de estas políticas de UPDATE directo
-- — valida el rol por su cuenta, como ya hacía.

drop policy if exists trazadoc_documents_update on public.trazadoc_documents;

create policy trazadoc_documents_update on public.trazadoc_documents
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
    and status in ('draft', 'in_review')
  )
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
    and status in ('draft', 'in_review')
  );

drop policy if exists trazadoc_document_sections_update on public.trazadoc_document_sections;

create policy trazadoc_document_sections_update on public.trazadoc_document_sections
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
    and exists (
      select 1 from public.trazadoc_documents d
      where d.id = document_id and d.status in ('draft', 'in_review')
    )
  )
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
    and exists (
      select 1 from public.trazadoc_documents d
      where d.id = document_id and d.status in ('draft', 'in_review')
    )
  );

-- ---------------------------------------------------------------------------
-- Gap real encontrado en change_trazadoc_document_status (0046): el
-- guarda de consultant solo miraba el estado DESTINO
-- ("p_to_status not in ('draft','in_review')"), nunca el estado DE
-- ORIGEN — así que un consultant SÍ podía "reabrir" un documento ya
-- aprobado moviéndolo a draft, porque 'draft' es un destino permitido.
-- Se agrega el chequeo que faltaba: consultant nunca puede mover un
-- documento QUE YA ESTABA aprobado, sin importar a qué estado destino
-- intente moverlo.
-- ---------------------------------------------------------------------------
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

  if v_role not in ('admin', 'quality', 'consultant') then
    raise exception 'Tu rol no permite cambiar el estado de este documento';
  end if;

  -- Mismas reglas que la RLS de escritura (0043/0047): consultant nunca
  -- aprueba ni marca obsoleto, Y nunca reabre un documento QUE YA ESTABA
  -- aprobado (sin importar a qué estado destino intente moverlo).
  if v_role = 'consultant' then
    if p_to_status not in ('draft', 'in_review') then
      raise exception 'Tu rol no permite aprobar ni marcar obsoleto este documento';
    end if;
    if v_doc.status = 'approved' then
      raise exception 'Tu rol no permite reabrir un documento aprobado';
    end if;
  end if;

  -- Reactivar un documento obsoleto: solo admin (Parte 9).
  if v_doc.status = 'obsolete' and p_to_status <> 'obsolete' and v_role <> 'admin' then
    raise exception 'Solo un administrador puede reactivar un documento obsoleto';
  end if;

  -- Crear una versión nueva en borrador a partir de un documento aprobado:
  -- solo admin/quality (Sprint 9.1, Bloqueante 3) — consultant ya quedó
  -- bloqueado arriba por ser 'approved', esto es una segunda confirmación
  -- explícita para ese caso concreto.
  if v_doc.status = 'approved' and p_to_status = 'draft' and v_role not in ('admin', 'quality') then
    raise exception 'Solo un administrador o supervisor puede crear una nueva versión en borrador de un documento aprobado';
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
