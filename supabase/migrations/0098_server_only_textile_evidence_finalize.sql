-- ============================================================================
-- Trazaloop · Sprint T9E.3 (Textil) · Finalización y cierre de limpieza
-- EXCLUSIVAMENTE server-only
-- ============================================================================
--
-- BYPASSES CERRADOS (encontrados por revisión independiente sobre 0097):
--  B1. finalize_textile_evidence_upload tenía GRANT a authenticated: un
--      usuario podía invocarla DIRECTAMENTE con su JWT, sin objeto en
--      Storage y sin la verificación de firma binaria — PostgreSQL no puede
--      comprobar por sí solo (a) la EXISTENCIA del objeto en Storage,
--      (b) su tamaño/Content-Type reales ni (c) su FIRMA BINARIA; esas
--      verificaciones viven en la Server Action, que el atacante saltaba.
--  B2. record_textile_upload_intent_cleanup tenía GRANT a authenticated:
--      cualquier creador podía afirmar p_removed=true desde el navegador
--      sin que Storage hubiera confirmado el retiro (PostgreSQL tampoco
--      puede verificar el resultado real de storage.remove()).
--
-- SOLUCIÓN:
--  · Se SELLAN las dos funciones de 0097 (revoke all de PUBLIC, anon,
--    authenticated y service_role: quedan como legado inerte — bajo
--    service_role auth.uid() es NULL y serían inutilizables de todos
--    modos; se conservan para no romper referencias históricas y para que
--    una llamada directa devuelva "permission denied", nunca ambigüedad).
--  · Se crean variantes *_server con ACTOR EXPLÍCITO, ejecutables SOLO por
--    service_role (el cliente administrativo de servidor con
--    `import "server-only"`). La Server Action verifica ANTES: objeto
--    existente, tamaño, Content-Type y firma binaria; la RPC RE-VALIDA en
--    PostgreSQL todo lo verificable aquí: actor real, membresía y rol,
--    organización del intento, created_by, estado, expiración, metadata y
--    coherencia tamaño/MIME contra lo declarado. Atomicidad (FOR UPDATE,
--    insert+consumo en una transacción), idempotencia y vínculo único
--    intent→evidence_id se CONSERVAN tal como en 0097.
--  · begin_textile_evidence_upload y mark_textile_evidence_upload_failed
--    permanecen para authenticated a propósito: no dependen de ninguna
--    verificación externa a PostgreSQL (crean / marcan fallidos SOLO
--    intentos propios) — documentado.
--
-- ROLLBACK (documentado; NO ejecutar sin decisión explícita — ver informe
-- T9E.3 §31): drop de las dos funciones *_server y re-grant de las
-- funciones de 0097 a authenticated + service_role tal como quedaron tras
-- 0097. ADVERTENCIA: ese re-grant REABRE los bypasses B1 y B2. Nada de
-- esto toca evidencias ni intentos consumidos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Sellar las funciones de 0097 (jamás ejecutables por clientes)
-- ----------------------------------------------------------------------------
revoke all on function public.finalize_textile_evidence_upload(uuid, bigint, text)
  from public, anon, authenticated, service_role;

revoke all on function public.record_textile_upload_intent_cleanup(uuid, boolean)
  from public, anon, authenticated, service_role;

comment on function public.finalize_textile_evidence_upload(uuid, bigint, text) is
  'SELLADA en 0098 (T9E.3): dependía de verificaciones (objeto en Storage, firma binaria) que PostgreSQL no puede hacer y era invocable por authenticated. Sustituida por finalize_textile_evidence_upload_server (solo service_role).';

comment on function public.record_textile_upload_intent_cleanup(uuid, boolean) is
  'SELLADA en 0098 (T9E.3): aceptaba p_removed afirmado por el navegador sin que PostgreSQL pueda verificar storage.remove(). Sustituida por record_textile_upload_intent_cleanup_server (solo service_role).';

-- ----------------------------------------------------------------------------
-- 2. Finalización ATÓMICA server-only (actor EXPLÍCITO; jamás auth.uid(),
--    que es NULL bajo service_role)
-- ----------------------------------------------------------------------------
create or replace function public.finalize_textile_evidence_upload_server(
  p_actor_id uuid,
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
  v_intent public.textile_evidence_upload_intents%rowtype;
  v_meta jsonb;
begin
  -- Revalidación COMPLETA en PostgreSQL aunque la invocación venga del
  -- servidor: el service role jamás sustituye membresía ni rol.
  if p_actor_id is null then
    raise exception 'ACTOR_REQUIRED';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_actor_id) then
    raise exception 'ACTOR_NOT_FOUND';
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
  if not exists (
    select 1 from public.memberships m
     where m.organization_id = v_intent.organization_id
       and m.user_id = p_actor_id
       and m.status = 'active'
       and m.role_code in ('admin', 'quality', 'consultant')
  ) then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
  if v_intent.created_by <> p_actor_id then
    raise exception 'INTENT_NOT_OWNED';
  end if;

  -- Idempotencia (idéntica a 0097): doble finalize → mismo evidence_id.
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

  -- Tamaño y MIME: el SERVIDOR los deriva del objeto REAL (storage.info +
  -- firma binaria, verificados ANTES de llamar); aquí se re-verifican
  -- contra lo declarado en el intento y contra los límites del dominio.
  if p_file_size_bytes is null or p_file_size_bytes <> v_intent.expected_size_bytes
     or p_file_size_bytes <= 0 or p_file_size_bytes > 20 * 1024 * 1024 then
    raise exception 'OBJECT_SIZE_MISMATCH';
  end if;
  if p_file_mime_type is null or p_file_mime_type <> v_intent.expected_mime_type then
    raise exception 'OBJECT_MIME_MISMATCH';
  end if;

  v_meta := v_intent.evidence_metadata;

  -- (a) La evidencia nace de la METADATA CANÓNICA del intento. Bajo
  -- service_role auth.uid() es NULL, así que force_created_by respeta el
  -- created_by provisto: queda el ACTOR REAL, nunca un valor del cliente.
  insert into public.textile_evidences (
    id, organization_id, title, evidence_type, description, document_date,
    issuer, reference_code, valid_from, valid_until,
    file_name, file_path, file_mime_type, file_size_bytes, status, created_by
  ) values (
    v_intent.id, v_intent.organization_id,
    v_meta->>'title', v_meta->>'evidence_type',
    v_meta->>'description', (nullif(v_meta->>'document_date', ''))::date,
    v_meta->>'issuer', v_meta->>'reference_code',
    (nullif(v_meta->>'valid_from', ''))::date, (nullif(v_meta->>'valid_until', ''))::date,
    v_intent.original_filename, v_intent.object_path,
    p_file_mime_type, p_file_size_bytes, 'pending_review', p_actor_id
  );

  -- (b) Consumo + vínculo en la MISMA transacción (guard 0097 re-verifica).
  update public.textile_evidence_upload_intents
     set status = 'consumed',
         consumed_at = now(),
         evidence_id = v_intent.id
   where id = v_intent.id;

  return jsonb_build_object('evidence_id', v_intent.id, 'already_finalized', false);
end;
$$;

revoke all on function public.finalize_textile_evidence_upload_server(uuid, uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.finalize_textile_evidence_upload_server(uuid, uuid, bigint, text)
  to service_role;

comment on function public.finalize_textile_evidence_upload_server(uuid, uuid, bigint, text) is
  'T9E.3 · SOLO service_role (Server Action tras verificar objeto+firma en Storage). PostgreSQL no puede verificar Storage por sí solo: por eso esta función jamás se concede a authenticated. Revalida actor/membresía/rol/creador/estado y conserva la atomicidad e idempotencia de 0097.';

-- ----------------------------------------------------------------------------
-- 3. Cierre de limpieza server-only (mismo principio: el resultado REAL de
--    storage.remove() solo lo conoce el servidor)
-- ----------------------------------------------------------------------------
create or replace function public.record_textile_upload_intent_cleanup_server(
  p_actor_id uuid,
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
  if p_actor_id is null then
    raise exception 'ACTOR_REQUIRED';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_actor_id) then
    raise exception 'ACTOR_NOT_FOUND';
  end if;

  select * into v_intent
    from public.textile_evidence_upload_intents
   where id = p_intent_id
   for update;
  if not found then
    return 'not_found';
  end if;
  if not exists (
    select 1 from public.memberships m
     where m.organization_id = v_intent.organization_id
       and m.user_id = p_actor_id
       and m.status = 'active'
       and m.role_code in ('admin', 'quality', 'consultant')
  ) or v_intent.created_by <> p_actor_id then
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

  -- Jamás cerrar la limpieza si la ruta pertenece a una evidencia REAL o
  -- si el intento quedó ligado a una evidencia.
  if v_intent.evidence_id is not null or exists (
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

revoke all on function public.record_textile_upload_intent_cleanup_server(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.record_textile_upload_intent_cleanup_server(uuid, uuid, boolean)
  to service_role;

comment on function public.record_textile_upload_intent_cleanup_server(uuid, uuid, boolean) is
  'T9E.3 · SOLO service_role: p_removed refleja el resultado REAL de storage.remove() inspeccionado por el servidor — jamás una afirmación del navegador. Solo cierra (expired) con retiro confirmado; con fallo conserva el estado y cuenta el reintento.';
