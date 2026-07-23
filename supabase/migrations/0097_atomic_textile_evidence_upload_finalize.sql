-- ============================================================================
-- Trazaloop · Sprint T9E.2 (Textil) · Integridad transaccional de la carga
-- directa de evidencias: finalización ATÓMICA, transiciones SOLO por RPC,
-- restricción por creador, ruta exacta y limpieza recuperable.
-- ============================================================================
--
-- CIERRA (sobre 0094, sin modificarla):
--  1. ATOMICIDAD: el INSERT de textile_evidences y el consumo del intento
--     eran dos sentencias separadas desde la aplicación (y el resultado del
--     consumo se ignoraba) → RPC transaccional finalize_textile_evidence_upload
--     con SELECT ... FOR UPDATE: ambas operaciones se confirman o se
--     revierten JUNTAS; doble finalize es idempotente y devuelve el mismo
--     evidence_id.
--  2. TRANSICIONES DIRECTAS: las políticas de 0094 permitían a CUALQUIER
--     admin/quality/consultant de la organización hacer UPDATE/DELETE de
--     intentos AJENOS → se retiran INSERT/UPDATE/DELETE directos para
--     authenticated; SELECT queda limitado al CREADOR; toda transición pasa
--     por RPCs SECURITY DEFINER que re-validan rol Y creador.
--  3. RUTA EXACTA: 0094 solo exigía el prefijo de la organización → nuevo
--     CHECK que ata object_path EXACTAMENTE a
--     {organization_id}/textiles/{id}/{safe_filename} con alfabeto saneado,
--     sin '..', sin backslashes ni segmentos vacíos; además la ruta la
--     construye la propia RPC de inicio (el cliente jamás la envía).
--  4. METADATA FUNCIONAL EN BEGIN: la metadata validada se guarda en el
--     intento (evidence_metadata jsonb canónico) y la finalización usa ESA
--     copia — el cliente no puede presentar una versión distinta después de
--     subir 20 MB.
--  5. LIMPIEZA RECUPERABLE: decisión documentada — NO se añade un estado
--     nuevo; un intento SOLO pasa a 'expired' cuando Storage CONFIRMA el
--     retiro del objeto; si el retiro falla, conserva su estado anterior
--     (pending vencido o failed), con contador y fecha del último intento,
--     y vuelve a ser candidato en la siguiente pasada. Antes de cerrar la
--     limpieza se verifica que la ruta NO pertenezca a una evidencia real.
--
-- Estados (sin cambios de catálogo): pending → consumed | failed | expired
--   · consumed: SOLO vía RPC atómica, con evidence_id obligatorio.
--   · expired : SOLO cuando el objeto provisional quedó retirado.
--   · failed  : finalización rechazada; su objeto es candidato de limpieza.
--
-- ROLLBACK (documentado; no ejecutar en staging sin decisión explícita):
--   ver TEXTILES_T9E_2_EVIDENCE_INTEGRITY_CLOSURE_REPORT.md §32. En síntesis:
--   drop de las 4 RPCs y sus grants; restaurar las políticas de 0094
--   (insert/update/delete/select) tal como aparecen en ese archivo;
--   restaurar guard_textile_evidence_upload_intent de 0094; drop de los
--   constraints/índice/columnas nuevos (evidence_id, evidence_metadata,
--   cleanup_attempts, last_cleanup_attempt_at). ADVERTENCIA: los intentos
--   creados después de 0097 dependen de las RPCs; las evidencias creadas
--   son datos válidos y NO deben borrarse.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columnas nuevas (aditivas)
-- ----------------------------------------------------------------------------
alter table public.textile_evidence_upload_intents
  add column evidence_id uuid references public.textile_evidences(id),
  add column evidence_metadata jsonb,
  add column cleanup_attempts integer not null default 0,
  add column last_cleanup_attempt_at timestamptz;

comment on column public.textile_evidence_upload_intents.evidence_id is
  'Evidencia creada por la finalización ATÓMICA (0097). Un intento consumido queda ligado de forma verificable e inmutable a su evidencia.';
comment on column public.textile_evidence_upload_intents.evidence_metadata is
  'Metadata funcional CANÓNICA validada en begin (0097). La finalización usa esta copia; el cliente no puede presentar otra versión tras subir el archivo.';
comment on column public.textile_evidence_upload_intents.cleanup_attempts is
  'Limpieza recuperable (0097): número de retiros de objeto fallidos. El intento solo pasa a expired cuando Storage confirma el retiro.';

-- Un intento consumido ↔ exactamente una evidencia (verificable).
create unique index textile_upload_intents_evidence_uniq
  on public.textile_evidence_upload_intents (evidence_id)
  where evidence_id is not null;

-- NOT VALID: los intentos consumidos ANTERIORES a 0097 (T9E.1) no tienen
-- evidence_id (y algunos ya no tienen evidencia: datos QA limpiados). La
-- regla aplica a todo insert/update posterior — el flujo nuevo la cumple
-- siempre; el guard y la RPC la hacen efectiva.
alter table public.textile_evidence_upload_intents
  add constraint textile_upload_intents_consumed_link_check
  check (status <> 'consumed' or evidence_id is not null) not valid;

alter table public.textile_evidence_upload_intents
  add constraint textile_upload_intents_metadata_shape_check
  check (evidence_metadata is null or jsonb_typeof(evidence_metadata) = 'object') not valid;

-- Ruta EXACTA e inequívoca: {organization_id}/textiles/{id}/{safe_filename},
-- alfabeto saneado, sin '..', sin '\', sin segmentos vacíos, y por unicidad
-- de object_path (0094) sin posibilidad de pisar otro intento.
alter table public.textile_evidence_upload_intents
  add constraint textile_upload_intents_exact_path_check
  check (
    object_path = organization_id::text || '/textiles/' || id::text || '/' || safe_filename
    and safe_filename ~ '^[A-Za-z0-9._-]+$'
    and safe_filename !~ '\.\.'
    and position('\' in object_path) = 0
  ) not valid;

-- ----------------------------------------------------------------------------
-- 2. Guard reforzado (reemplaza el de 0094 hacia adelante; sigue SIN
--    security definer: obliga también a service_role)
-- ----------------------------------------------------------------------------
create or replace function public.guard_textile_evidence_upload_intent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'consumed' then
      raise exception 'Un intento de carga consumido no puede eliminarse';
    end if;
    return old;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.created_by is distinct from old.created_by
     or new.bucket_id is distinct from old.bucket_id
     or new.object_path is distinct from old.object_path
     or new.original_filename is distinct from old.original_filename
     or new.safe_filename is distinct from old.safe_filename
     or new.expected_size_bytes is distinct from old.expected_size_bytes
     or new.expected_mime_type is distinct from old.expected_mime_type
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at then
    raise exception
      'Los datos declarados de un intento de carga son inmutables';
  end if;

  -- T9E.2: la metadata funcional validada en begin es inmutable después.
  if old.evidence_metadata is not null
     and new.evidence_metadata is distinct from old.evidence_metadata then
    raise exception
      'La metadata funcional del intento es inmutable tras iniciarse la carga';
  end if;

  -- T9E.2: el vínculo con la evidencia jamás cambia una vez fijado.
  if old.evidence_id is not null
     and new.evidence_id is distinct from old.evidence_id then
    raise exception 'La evidencia asociada a un intento no puede cambiar';
  end if;

  if old.status = 'consumed' then
    raise exception 'Un intento de carga consumido es inmutable';
  end if;

  if new.status = 'consumed' then
    if old.status <> 'pending' then
      raise exception 'Solo un intento pendiente puede consumirse';
    end if;
    if new.evidence_id is null then
      raise exception 'Un intento consumido debe quedar ligado a su evidencia';
    end if;
  end if;

  if new.status not in ('pending', 'consumed', 'expired', 'failed') then
    raise exception 'Estado de intento no válido';
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. RLS endurecida: SIN escritura directa de clientes; lectura solo del
--    creador. Toda transición pasa por las RPCs de abajo.
-- ----------------------------------------------------------------------------
drop policy textile_upload_intents_select on public.textile_evidence_upload_intents;
drop policy textile_upload_intents_insert on public.textile_evidence_upload_intents;
drop policy textile_upload_intents_update on public.textile_evidence_upload_intents;
drop policy textile_upload_intents_delete on public.textile_evidence_upload_intents;

create policy textile_upload_intents_select on public.textile_evidence_upload_intents
  for select to authenticated
  using (
    public.is_org_member(organization_id)
    and created_by = auth.uid()
  );
-- (Sin políticas INSERT/UPDATE/DELETE: deny-by-default para authenticated y
--  anon. service_role queda para operaciones administrativas, siempre bajo
--  el guard, que también lo obliga.)

-- ----------------------------------------------------------------------------
-- 4. RPC de INICIO: valida TODO antes de que exista URL de subida y
--    construye la ruta EXACTA en servidor. El cliente jamás envía rutas.
-- ----------------------------------------------------------------------------
create or replace function public.begin_textile_evidence_upload(
  p_organization_id uuid,
  p_file_name text,
  p_file_size_bytes bigint,
  p_file_mime_type text,
  p_metadata jsonb,
  p_ttl_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_safe text;
  v_path text;
  v_ext text;
  v_title text;
  v_type text;
  v_valid_from date;
  v_valid_until date;
  v_meta jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_organization_id is null
     or not public.has_org_role(p_organization_id, array['admin', 'quality', 'consultant']) then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;

  -- Archivo declarado (la finalización re-verifica contra el objeto real).
  if p_file_name is null or length(trim(p_file_name)) = 0 then
    raise exception 'FILE_REQUIRED';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes <= 0
     or p_file_size_bytes > 20 * 1024 * 1024 then
    raise exception 'FILE_SIZE_INVALID';
  end if;
  if p_file_mime_type is null or p_file_mime_type not in (
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ) then
    raise exception 'FILE_MIME_INVALID';
  end if;
  v_ext := lower(coalesce(nullif(regexp_replace(p_file_name, '^.*\.', ''), p_file_name), ''));
  if v_ext not in ('pdf', 'png', 'jpg', 'jpeg', 'webp', 'docx', 'xlsx', 'csv') then
    raise exception 'FILE_EXTENSION_INVALID';
  end if;

  -- Metadata funcional CANÓNICA (mismo dominio que la evidencia): se valida
  -- AQUÍ, antes de emitir cualquier autorización de subida, y queda
  -- inmutable en el intento (guard).
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'METADATA_REQUIRED';
  end if;
  v_title := nullif(trim(coalesce(p_metadata->>'title', '')), '');
  if v_title is null or length(v_title) > 200 then
    raise exception 'METADATA_TITLE_INVALID';
  end if;
  v_type := coalesce(p_metadata->>'evidence_type', '');
  if v_type not in (
    'supplier_datasheet', 'composition_certificate', 'supplier_declaration',
    'purchase_document', 'recycled_content_support', 'organic_material_support',
    'care_instruction_support', 'process_record', 'outsourced_process_support',
    'quality_record', 'traceability_support', 'photo_record', 'other'
  ) then
    raise exception 'METADATA_TYPE_INVALID';
  end if;
  begin
    v_valid_from := nullif(p_metadata->>'valid_from', '')::date;
    v_valid_until := nullif(p_metadata->>'valid_until', '')::date;
    perform (nullif(p_metadata->>'document_date', ''))::date;
  exception when others then
    raise exception 'METADATA_DATE_INVALID';
  end;
  if v_valid_from is not null and v_valid_until is not null
     and v_valid_from > v_valid_until then
    raise exception 'METADATA_VALIDITY_INVALID';
  end if;

  -- Copia canónica: SOLO las claves del dominio, ya normalizadas.
  v_meta := jsonb_build_object(
    'title', v_title,
    'evidence_type', v_type,
    'description', nullif(trim(coalesce(p_metadata->>'description', '')), ''),
    'document_date', nullif(p_metadata->>'document_date', ''),
    'issuer', nullif(trim(coalesce(p_metadata->>'issuer', '')), ''),
    'reference_code', nullif(trim(coalesce(p_metadata->>'reference_code', '')), ''),
    'valid_from', nullif(p_metadata->>'valid_from', ''),
    'valid_until', nullif(p_metadata->>'valid_until', '')
  );

  -- Ruta EXACTA construida en servidor (nunca por el cliente).
  v_safe := regexp_replace(p_file_name, '[^a-zA-Z0-9._-]', '_', 'g');
  v_path := p_organization_id::text || '/textiles/' || v_id::text || '/' || v_safe;

  insert into public.textile_evidence_upload_intents (
    id, organization_id, created_by, bucket_id, object_path,
    original_filename, safe_filename, expected_size_bytes,
    expected_mime_type, evidence_metadata, expires_at
  ) values (
    v_id, p_organization_id, v_uid, 'evidences', v_path,
    p_file_name, v_safe, p_file_size_bytes,
    p_file_mime_type, v_meta,
    now() + make_interval(mins => least(greatest(coalesce(p_ttl_minutes, 30), 5), 60))
  );

  return jsonb_build_object('intent_id', v_id, 'object_path', v_path);
end;
$$;

revoke execute on function public.begin_textile_evidence_upload(uuid, text, bigint, text, jsonb, integer)
  from public, anon;
grant execute on function public.begin_textile_evidence_upload(uuid, text, bigint, text, jsonb, integer)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 5. RPC de FINALIZACIÓN ATÓMICA: insert de la evidencia + consumo del
--    intento en UNA transacción, con FOR UPDATE e idempotencia.
--    p_file_size_bytes / p_file_mime_type los deriva el SERVIDOR del objeto
--    real (storage.info + firma binaria) — la RPC los re-verifica contra lo
--    declarado en el intento.
-- ----------------------------------------------------------------------------
create or replace function public.finalize_textile_evidence_upload(
  p_intent_id uuid,
  p_file_size_bytes bigint,
  p_file_mime_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_intent public.textile_evidence_upload_intents%rowtype;
  v_meta jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_intent_id is null then
    raise exception 'INTENT_REQUIRED';
  end if;

  select * into v_intent
    from public.textile_evidence_upload_intents
   where id = p_intent_id
   for update;

  if not found then
    raise exception 'INTENT_NOT_FOUND';
  end if;
  if not public.has_org_role(v_intent.organization_id, array['admin', 'quality', 'consultant']) then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
  if v_intent.created_by <> v_uid then
    raise exception 'INTENT_NOT_OWNED';
  end if;

  -- Idempotencia: doble clic / carrera → mismo resultado, sin duplicados.
  if v_intent.status = 'consumed' then
    if v_intent.evidence_id is null
       or not exists (select 1 from public.textile_evidences where id = v_intent.evidence_id) then
      raise exception 'INTENT_CONSUMED_INCONSISTENT';
    end if;
    return jsonb_build_object('evidence_id', v_intent.evidence_id, 'already_finalized', true);
  end if;
  if v_intent.status <> 'pending' then
    raise exception 'INTENT_NOT_PENDING';
  end if;
  if v_intent.expires_at <= now() then
    raise exception 'INTENT_EXPIRED';
  end if;
  if v_intent.evidence_metadata is null then
    raise exception 'INTENT_WITHOUT_METADATA';
  end if;

  -- El tamaño y el MIME verificados del objeto deben coincidir EXACTAMENTE
  -- con lo declarado al iniciar (y respetar los límites del dominio).
  if p_file_size_bytes is null or p_file_size_bytes <> v_intent.expected_size_bytes
     or p_file_size_bytes <= 0 or p_file_size_bytes > 20 * 1024 * 1024 then
    raise exception 'OBJECT_SIZE_MISMATCH';
  end if;
  if p_file_mime_type is null or p_file_mime_type <> v_intent.expected_mime_type then
    raise exception 'OBJECT_MIME_MISMATCH';
  end if;

  v_meta := v_intent.evidence_metadata;

  -- (a) La evidencia nace de la METADATA CANÓNICA del intento.
  insert into public.textile_evidences (
    id, organization_id, title, evidence_type, description, document_date,
    issuer, reference_code, valid_from, valid_until,
    file_name, file_path, file_mime_type, file_size_bytes, status
  ) values (
    v_intent.id, v_intent.organization_id,
    v_meta->>'title', v_meta->>'evidence_type',
    v_meta->>'description', (nullif(v_meta->>'document_date', ''))::date,
    v_meta->>'issuer', v_meta->>'reference_code',
    (nullif(v_meta->>'valid_from', ''))::date, (nullif(v_meta->>'valid_until', ''))::date,
    v_intent.original_filename, v_intent.object_path,
    p_file_mime_type, p_file_size_bytes, 'pending_review'
  );

  -- (b) El intento queda consumido y ligado a SU evidencia. Misma
  -- transacción: si (a) o (b) fallan, TODO se revierte.
  update public.textile_evidence_upload_intents
     set status = 'consumed',
         consumed_at = now(),
         evidence_id = v_intent.id
   where id = v_intent.id;

  return jsonb_build_object('evidence_id', v_intent.id, 'already_finalized', false);
end;
$$;

revoke execute on function public.finalize_textile_evidence_upload(uuid, bigint, text)
  from public, anon;
grant execute on function public.finalize_textile_evidence_upload(uuid, bigint, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 6. RPC de FALLO controlado (verificación de objeto/firma rechazada):
--    solo el creador, solo desde pending.
-- ----------------------------------------------------------------------------
create or replace function public.mark_textile_evidence_upload_failed(p_intent_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_intent public.textile_evidence_upload_intents%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  select * into v_intent
    from public.textile_evidence_upload_intents
   where id = p_intent_id
   for update;
  if not found then
    return false;
  end if;
  if not public.has_org_role(v_intent.organization_id, array['admin', 'quality', 'consultant'])
     or v_intent.created_by <> v_uid then
    raise exception 'INTENT_NOT_OWNED';
  end if;
  if v_intent.status <> 'pending' then
    return false;
  end if;
  update public.textile_evidence_upload_intents
     set status = 'failed'
   where id = p_intent_id;
  return true;
end;
$$;

revoke execute on function public.mark_textile_evidence_upload_failed(uuid)
  from public, anon;
grant execute on function public.mark_textile_evidence_upload_failed(uuid)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 7. RPC de LIMPIEZA recuperable (flujo de aplicación; el script
--    administrativo usa service_role con UPDATE directo bajo el guard):
--    · SOLO cierra ('expired') cuando el llamador confirma que Storage
--      retiró el objeto (p_removed = true);
--    · con p_removed = false, registra el fallo (contador + fecha) y el
--      intento CONSERVA su estado → sigue siendo candidato;
--    · jamás toca consumidos y jamás cierra si la ruta pertenece a una
--      evidencia real (inconsistencia → 'linked_evidence').
-- ----------------------------------------------------------------------------
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
  v_uid uuid := auth.uid();
  v_intent public.textile_evidence_upload_intents%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  select * into v_intent
    from public.textile_evidence_upload_intents
   where id = p_intent_id
   for update;
  if not found then
    return 'not_found';
  end if;
  if not public.has_org_role(v_intent.organization_id, array['admin', 'quality', 'consultant'])
     or v_intent.created_by <> v_uid then
    raise exception 'INTENT_NOT_OWNED';
  end if;
  if v_intent.status = 'consumed' then
    return 'consumed_untouchable';
  end if;
  if v_intent.status not in ('pending', 'failed') then
    return v_intent.status;
  end if;
  if v_intent.status = 'pending' and v_intent.expires_at > now() then
    return 'still_active';
  end if;

  -- Nunca cerrar la limpieza si la ruta pertenece a una evidencia REAL.
  if exists (
    select 1 from public.textile_evidences e
     where e.file_path = v_intent.object_path
  ) then
    return 'linked_evidence';
  end if;

  if p_removed then
    update public.textile_evidence_upload_intents
       set status = 'expired',
           last_cleanup_attempt_at = now()
     where id = p_intent_id;
    return 'expired';
  end if;

  update public.textile_evidence_upload_intents
     set cleanup_attempts = cleanup_attempts + 1,
         last_cleanup_attempt_at = now()
   where id = p_intent_id;
  return v_intent.status;
end;
$$;

revoke execute on function public.record_textile_upload_intent_cleanup(uuid, boolean)
  from public, anon;
grant execute on function public.record_textile_upload_intent_cleanup(uuid, boolean)
  to authenticated;
