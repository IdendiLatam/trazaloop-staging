-- Trazaloop · T9F.4 · Shims ADICIONALES sobre los de T9F.2/T9F.3 (PG local).
-- Completa lo que las superficies T9F.4 de 0101 referencian: columnas reales
-- del maestro descargable y versiones (0057) y las DOS RPCs internas de
-- 0057/0059 en versión SIMPLIFICADA — aquí solo importa el CONTRATO que las
-- v2 de T9F.4 ejercen (fijar campos físicos + crear la fila de versión con
-- SU tamaño); la lógica completa de roles/estados vive en staging (0057/0059)
-- y la validan las suites RLS preparadas. SOLO local; jamás staging.

-- Políticas de DELETE reales (0019/0057/0075) para que los DROP de §3b de
-- 0101 apliquen igual que en staging.
create policy evidences_delete on public.evidences for delete using (true);
create policy trazadoc_file_documents_delete on public.trazadoc_file_documents for delete using (true);
create policy textile_evidences_delete on public.textile_evidences for delete using (true);

alter table public.textile_evidence_upload_intents
  add column cleanup_attempts integer not null default 0,
  add column last_cleanup_attempt_at timestamptz;
alter table public.trazadoc_file_documents
  add column title text,
  add column current_version integer not null default 1,
  add column file_name text,
  add column mime_type text;
alter table public.trazadoc_file_document_versions
  add column created_by uuid;

-- RPC interna 0059 (simplificada): fija campos físicos + versión v1.
create or replace function public.finalize_trazadoc_file_document_initial_version(
  p_file_document_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_change_note text default 'Borrador inicial'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from trazadoc_file_documents where id = p_file_document_id for update;
  if v_org is null then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;
  update trazadoc_file_documents
     set storage_path = p_storage_path, file_name = p_file_name,
         mime_type = p_mime_type, size_bytes = p_size_bytes, current_version = 1
   where id = p_file_document_id;
  insert into trazadoc_file_document_versions
    (organization_id, file_document_id, version_number, storage_path, size_bytes)
  values (v_org, p_file_document_id, 1, p_storage_path, p_size_bytes);
  return 1;
end;
$$;

-- RPC interna 0057 (simplificada): la versión ANTERIOR conserva SU ruta y SU
-- tamaño (sigue contando) y el documento pasa al objeto nuevo.
create or replace function public.replace_trazadoc_file_document(
  p_file_document_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_change_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.trazadoc_file_documents%rowtype;
begin
  select * into v_doc from trazadoc_file_documents where id = p_file_document_id for update;
  if v_doc.id is null then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;
  insert into trazadoc_file_document_versions
    (organization_id, file_document_id, version_number, storage_path, size_bytes)
  values (v_doc.organization_id, v_doc.id, v_doc.current_version, v_doc.storage_path, v_doc.size_bytes);
  update trazadoc_file_documents
     set storage_path = p_storage_path, file_name = p_file_name,
         mime_type = p_mime_type, size_bytes = p_size_bytes,
         current_version = v_doc.current_version + 1
   where id = v_doc.id;
  return v_doc.current_version + 1;
end;
$$;

-- RPC de limpieza textil (0097, simplificada al contrato T9E.3): 'expired'
-- ÚNICAMENTE tras retiro confirmado; barrera de evidencia vinculada; el
-- fallo solo acumula intentos. 0101 la revoca de authenticated (T9F.4).
create or replace function public.record_textile_upload_intent_cleanup(
  p_intent_id uuid,
  p_removed boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.textile_evidence_upload_intents%rowtype;
begin
  select * into v_intent from textile_evidence_upload_intents where id = p_intent_id for update;
  if not found then return 'not_found'; end if;
  if v_intent.status = 'consumed' then return 'consumed'; end if;
  if v_intent.status not in ('pending', 'failed') then return v_intent.status; end if;
  if v_intent.status = 'pending' and v_intent.expires_at > now() then return 'still_active'; end if;
  if exists (select 1 from public.textile_evidences e where e.file_path = v_intent.object_path) then
    return 'linked_evidence';
  end if;
  if p_removed then
    update textile_evidence_upload_intents
       set status = 'expired', last_cleanup_attempt_at = now()
     where id = p_intent_id;
    return 'expired';
  end if;
  update textile_evidence_upload_intents
     set cleanup_attempts = cleanup_attempts + 1, last_cleanup_attempt_at = now()
   where id = p_intent_id;
  return v_intent.status;
end;
$$;
-- Mismos grants que 0097 (revoke de public: el default de PostgreSQL
-- concede EXECUTE a public y en staging 0097 lo retiró).
revoke execute on function public.record_textile_upload_intent_cleanup(uuid, boolean) from public, anon;
grant execute on function public.record_textile_upload_intent_cleanup(uuid, boolean) to authenticated;
