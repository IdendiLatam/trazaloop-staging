-- ============================================================================
-- 0102_t9g_qa_finalizer_closure.sql
-- Trazaloop · Cierre de hallazgos encontrados durante T9F.5C QA.
--
-- 1. Permite al arnés server-only leer la instantánea autoritativa de uso.
-- 2. Corrige los finalizadores TrazaDocs server-only para que utilicen
--    p_actor_id y no deleguen en funciones históricas dependientes de auth.uid().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Instantánea autoritativa disponible exclusivamente para service_role.
-- ---------------------------------------------------------------------------
revoke all on function public.module_storage_snapshot(uuid, text)
  from public, anon, authenticated;

grant execute on function public.module_storage_snapshot(uuid, text)
  to service_role;

comment on function public.module_storage_snapshot(uuid, text) is
  'T9F.5C · Instantánea autoritativa server-only de almacenamiento. Disponible para service_role y usada en QA para verificar el tamaño físico frente al reservado.';

-- ---------------------------------------------------------------------------
-- 2. Finalización inicial TrazaDocs con actor explícito.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_trazadoc_file_document_initial_version_server(
  p_actor_id uuid,
  p_intent_id uuid,
  p_real_size_bytes bigint,
  p_real_mime_type text,
  p_change_note text default 'Borrador inicial'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.storage_upload_intents%rowtype;
  v_doc public.trazadoc_file_documents%rowtype;
begin
  v_intent := public.assert_trazadoc_finalize_preconditions(
    p_actor_id,
    p_intent_id,
    p_real_size_bytes,
    p_real_mime_type,
    'trazadoc_initial'
  );

  select *
    into v_doc
    from public.trazadoc_file_documents
   where id = v_intent.resource_id
   for update;

  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  if v_doc.status <> 'draft' then
    raise exception 'DOCUMENT_NOT_DRAFT';
  end if;

  if not exists (
    select 1
      from public.trazadoc_file_document_versions
     where file_document_id = v_doc.id
       and version_number = 1
  ) then
    insert into public.trazadoc_file_document_versions (
      organization_id,
      file_document_id,
      version_number,
      version_label,
      status,
      snapshot,
      storage_path,
      file_name,
      mime_type,
      size_bytes,
      change_note,
      created_by
    )
    values (
      v_doc.organization_id,
      v_doc.id,
      1,
      'v1',
      'draft',
      jsonb_build_object(
        'title', v_doc.title,
        'code', v_doc.code,
        'description', v_doc.description,
        'file_name', v_intent.original_filename,
        'mime_type', p_real_mime_type,
        'size_bytes', p_real_size_bytes
      ),
      v_intent.object_path,
      v_intent.original_filename,
      p_real_mime_type,
      p_real_size_bytes,
      coalesce(p_change_note, 'Borrador inicial'),
      p_actor_id
    );
  end if;

  update public.trazadoc_file_documents
     set storage_path = v_intent.object_path,
         file_name = v_intent.original_filename,
         mime_type = p_real_mime_type,
         size_bytes = p_real_size_bytes,
         current_version = 1,
         version_label = 'v1',
         uploaded_by = p_actor_id
   where id = v_doc.id;

  update public.storage_upload_intents
     set status = 'finalized',
         finalized_at = now()
   where id = v_intent.id;

  return 1;
end;
$$;

revoke all on function public.finalize_trazadoc_file_document_initial_version_server(
  uuid, uuid, bigint, text, text
) from public, anon, authenticated;

grant execute on function public.finalize_trazadoc_file_document_initial_version_server(
  uuid, uuid, bigint, text, text
) to service_role;

comment on function public.finalize_trazadoc_file_document_initial_version_server(
  uuid, uuid, bigint, text, text
) is
  'T9F.5C · Finalizador inicial TrazaDocs server-only. Usa p_actor_id explícito y no depende de auth.uid() bajo service_role.';

-- ---------------------------------------------------------------------------
-- 3. Reemplazo TrazaDocs con actor explícito.
-- ---------------------------------------------------------------------------
create or replace function public.replace_trazadoc_file_document_server(
  p_actor_id uuid,
  p_intent_id uuid,
  p_real_size_bytes bigint,
  p_real_mime_type text,
  p_change_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.storage_upload_intents%rowtype;
  v_doc public.trazadoc_file_documents%rowtype;
  v_role text;
  v_new_version integer;
  v_next_status text;
  v_snapshot jsonb;
begin
  v_intent := public.assert_trazadoc_finalize_preconditions(
    p_actor_id,
    p_intent_id,
    p_real_size_bytes,
    p_real_mime_type,
    'trazadoc_replace'
  );

  select *
    into v_doc
    from public.trazadoc_file_documents
   where id = v_intent.resource_id
   for update;

  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  select m.role_code
    into v_role
    from public.memberships m
   where m.organization_id = v_doc.organization_id
     and m.user_id = p_actor_id
     and m.status = 'active';

  if v_role not in ('admin', 'quality', 'consultant') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;

  if v_doc.status = 'obsolete' then
    raise exception 'DOCUMENT_OBSOLETE';
  end if;

  if v_doc.status = 'approved'
     and v_role not in ('admin', 'quality') then
    raise exception 'ROLE_NOT_ALLOWED_FOR_APPROVED';
  end if;

  v_next_status :=
    case
      when v_doc.status = 'approved' then 'draft'
      else v_doc.status
    end;

  v_new_version := v_doc.current_version + 1;

  v_snapshot := jsonb_build_object(
    'title', v_doc.title,
    'code', v_doc.code,
    'description', v_doc.description,
    'file_name', v_intent.original_filename,
    'mime_type', p_real_mime_type,
    'size_bytes', p_real_size_bytes
  );

  insert into public.trazadoc_file_document_versions (
    organization_id,
    file_document_id,
    version_number,
    version_label,
    status,
    snapshot,
    storage_path,
    file_name,
    mime_type,
    size_bytes,
    change_note,
    created_by
  )
  values (
    v_doc.organization_id,
    v_doc.id,
    v_new_version,
    'v' || v_new_version,
    v_next_status,
    v_snapshot,
    v_intent.object_path,
    v_intent.original_filename,
    p_real_mime_type,
    p_real_size_bytes,
    p_change_note,
    p_actor_id
  );

  update public.trazadoc_file_documents
     set status = v_next_status,
         current_version = v_new_version,
         version_label = 'v' || v_new_version,
         storage_path = v_intent.object_path,
         file_name = v_intent.original_filename,
         mime_type = p_real_mime_type,
         size_bytes = p_real_size_bytes,
         uploaded_by = p_actor_id
   where id = v_doc.id;

  update public.storage_upload_intents
     set status = 'finalized',
         finalized_at = now()
   where id = v_intent.id;

  return v_new_version;
end;
$$;

revoke all on function public.replace_trazadoc_file_document_server(
  uuid, uuid, bigint, text, text
) from public, anon, authenticated;

grant execute on function public.replace_trazadoc_file_document_server(
  uuid, uuid, bigint, text, text
) to service_role;

comment on function public.replace_trazadoc_file_document_server(
  uuid, uuid, bigint, text, text
) is
  'T9F.5C · Reemplazo TrazaDocs server-only. Usa p_actor_id explícito y conserva la versión anterior sin depender de auth.uid().';
