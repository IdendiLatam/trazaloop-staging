-- ============================================================================
-- Trazaloop · Sprints T9F.1 + T9F.2 + T9F.3 (migración ACUMULADA) ·
-- CIERRE DEFINITIVO del control comercial por módulo:
--   · la BASE DE DATOS es la autoridad final (triggers atómicos por recurso);
--   · reservas de evidencias Textiles (unidad + bytes) en begin/finalize;
--   · ciclo seguro de eliminación física (pending_delete → deleted/failed);
--   · registro de objetos pendientes ENDURECIDO (sin datos físicos del cliente);
--   · tamaños por versión y tamaños DESCONOCIDOS ≠ cero;
--   · RPC de asignación idempotente y segura ante concurrencia (T9F.2);
--   · uso REAL por módulo con deduplicación física, reservas y desconocidos.
-- ============================================================================
--
-- ADITIVA sobre 0100 (aplicada e INTACTA). Esta migración NUNCA fue aplicada:
-- T9F.3 la consolida EN EL MISMO ARCHIVO (no existe 0102) porque debe llegar a
-- staging como UNA unidad. Reemplazos de funciones existentes solo mediante
-- CREATE OR REPLACE conservando firmas (0097/0098 se extienden en runtime sin
-- tocar sus archivos). No borra datos de negocio, no trunca, no desactiva RLS,
-- no toca Storage RLS (0093–0099) ni crea planes/cuotas.
--
-- PRINCIPIO DE AUTORIDAD (T9F.3): las Server Actions siguen validando para la
-- experiencia, pero el LÍMITE COMERCIAL se aplica en PostgreSQL:
--   Server Action válida  → la BD revalida → operación atómica.
--   INSERT directo por API → el trigger aplica el mismo límite o rechaza.
--   Concurrencia          → advisory lock por (org, módulo, recurso).
--
-- ÍNDICE:
--   §1  Cola contable de objetos físicos (pending_delete → deleted/failed)
--   §2  register_storage_orphan ENDURECIDO (server-only) + resolución
--   §3  RPCs de dominio: encolar-y-borrar (maestro y evidencias CPR)
--   §4  RPC set_organization_module_access (T9F.2: lock + UPSERT + no-op)
--   §5  Conteo interno por recurso (incluye reservas) + TRIGGERS de límite
--   §6  Reservas Textiles: begin v2 (idempotente, reserva unidad+bytes) y
--       finalize (revalida límite y cuota con reservas) — firmas conservadas
--   §7  Vista v_organization_module_usage (física, reservas, desconocidos)
--   §8  check_module_resource_allowance (definer, reservas incluidas)
--   §9  audit_log: FK a organizations RETIRADA (filas intactas; ver nota)
--   §10 Índices de apoyo
--   §11 Verificaciones posteriores (documentación)
--
-- ROLLBACK (informe T9F.3 §56 / guía; NO ejecutar sin decisión): restaurar
-- las funciones reemplazadas con sus definiciones de 0097/0098/0100 (los
-- archivos del repositorio son la fuente); retirar triggers/funciones/vista
-- nuevos SOLO tras revertir el código; la cola y los intents con reservas o
-- pendientes NO se eliminan mientras contengan filas sin resolver. Nada borra
-- datos CPR/Textiles, objetos de Storage ni auditoría, ni desactiva RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §1 · Cola contable de objetos físicos — ciclo pending_delete
-- ----------------------------------------------------------------------------
-- Modelo (T9F.3 §18): referencia activa → pending_delete (ANTES de perder la
-- referencia de dominio) → intento de eliminación física → deleted (libera
-- cuota) o delete_failed (SIGUE contando). Mientras un objeto no esté
-- confirmado como eliminado, permanece contabilizable: jamás almacenamiento
-- ficticio. size_bytes admite NULL = tamaño DESCONOCIDO (cuenta como
-- inconsistencia que bloquea cargas, nunca como cero).
create table public.storage_orphan_candidates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  module_code     text not null references public.modules (code),
  bucket_id       text not null,
  object_path     text not null,
  size_bytes      bigint,
  source_type     text not null default 'unreferenced',
  source_id       uuid,
  status          text not null default 'pending_delete',
  registered_by   uuid,
  registered_at   timestamptz not null default now(),
  last_attempt_at timestamptz,
  error_code      text,
  deleted_at      timestamptz,
  constraint storage_orphan_candidates_size_check check (size_bytes is null or size_bytes >= 0),
  constraint storage_orphan_candidates_path_check check (length(object_path) > 0),
  constraint storage_orphan_candidates_status_check
    check (status in ('pending_delete', 'delete_failed', 'deleted')),
  constraint storage_orphan_candidates_source_check
    check (source_type in ('trazadoc_current', 'trazadoc_version', 'evidence', 'textile_intent', 'unreferenced')),
  constraint storage_orphan_candidates_deleted_check
    check ((status = 'deleted') = (deleted_at is not null)),
  -- Bucket y prefijo canónicos: una organización jamás registra rutas ajenas
  -- y una ruta Textiles jamás se atribuye a CPR (ni al revés).
  constraint storage_orphan_candidates_bucket_check
    check (bucket_id in ('evidences', 'trazadocs-documents')),
  constraint storage_orphan_candidates_prefix_check
    check (position(organization_id::text || '/' in object_path) = 1),
  constraint storage_orphan_candidates_module_bucket_check
    check (
      (module_code = 'textiles' and bucket_id = 'evidences'
        and position(organization_id::text || '/textiles/' in object_path) = 1)
      or
      (module_code = 'traceability_6632' and (
        (bucket_id = 'trazadocs-documents')
        or (bucket_id = 'evidences'
            and position(organization_id::text || '/textiles/' in object_path) = 0)
      ))
    ),
  constraint storage_orphan_candidates_uniq unique (bucket_id, object_path)
);

create index storage_orphan_candidates_org_module_idx
  on public.storage_orphan_candidates (organization_id, module_code, status);

alter table public.storage_orphan_candidates enable row level security;
-- Sin políticas: los clientes NI leen NI escriben. Todo entra por funciones
-- de dominio (§2/§3) y se resuelve con service_role.
revoke all on public.storage_orphan_candidates from public, anon, authenticated;

-- T9F.4 · §20 · Combinación SEGURA de tamaños al deduplicar referencias del
-- MISMO objeto físico: NULL significa DESCONOCIDO y jamás se convierte en
-- cero. Ambos NULL → NULL; uno conocido → el conocido; iguales → ese valor;
-- CONTRADICTORIOS → estrategia conservadora documentada: el MÁXIMO (nunca
-- subestima la cuota) y el llamador marca la inconsistencia (error_code).
create or replace function public.combine_object_sizes(
  p_existing bigint,
  p_incoming bigint
)
returns bigint
language sql
immutable
as $$
  select case
    when p_existing is null and p_incoming is null then null
    when p_existing is null then p_incoming
    when p_incoming is null then p_existing
    when p_existing = p_incoming then p_existing
    else greatest(p_existing, p_incoming)
  end
$$;

comment on function public.combine_object_sizes(bigint, bigint) is
  'T9F.4 · Combina tamaños de referencias del MISMO objeto sin convertir jamás NULL (desconocido) en cero: ambos NULL → NULL; uno conocido → el conocido; contradictorios → máximo (conservador) y el llamador marca la inconsistencia.';

comment on table public.storage_orphan_candidates is
  'T9F.3 · Ciclo seguro de eliminación física: pending_delete (creado ANTES de perder la referencia de dominio) → deleted (libera cuota) o delete_failed (sigue contando). size_bytes NULL = tamaño desconocido (bloquea cargas, jamás cero). Bucket, ruta y módulo validados por CHECK canónicos. Registro solo vía funciones de dominio o service_role; resolución solo service_role.';

-- ----------------------------------------------------------------------------
-- §2 · Registro ENDURECIDO de objetos sin referencia + resolución
-- ----------------------------------------------------------------------------
-- T9F.3 · Bloqueador D: authenticated YA NO puede registrar datos físicos
-- arbitrarios. Esta función queda como RPC SERVER-ONLY (service_role) para el
-- único caso donde no existe fila de dominio de la cual derivar: un objeto
-- subido cuya finalización/actualización falló (compensación §25 del plan).
-- Incluso para el servidor, bucket/módulo/prefijo se validan por los CHECK
-- canónicos de la tabla y por las validaciones explícitas de la función.
create or replace function public.register_storage_orphan(
  p_organization_id uuid,
  p_module_code text,
  p_bucket_id text,
  p_object_path text,
  p_size_bytes bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SOLO service_role (el servidor tras una carga parcialmente fallida): la
  -- vía de clientes autenticados son las funciones de dominio de §3, que
  -- derivan TODO de filas reales.
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'SERVER_ONLY';
  end if;

  if p_organization_id is null
     or not exists (select 1 from organizations o where o.id = p_organization_id) then
    raise exception 'ORGANIZATION_INVALID';
  end if;
  if not exists (select 1 from modules m where m.code = p_module_code and m.is_functional) then
    raise exception 'MODULE_INVALID';
  end if;
  if p_bucket_id is null or p_bucket_id not in ('evidences', 'trazadocs-documents') then
    raise exception 'BUCKET_INVALID';
  end if;
  if p_object_path is null or length(trim(p_object_path)) = 0
     or position(p_organization_id::text || '/' in p_object_path) <> 1 then
    raise exception 'OBJECT_PATH_INVALID';
  end if;
  if p_size_bytes is not null and p_size_bytes < 0 then
    raise exception 'SIZE_INVALID';
  end if;

  insert into storage_orphan_candidates
    (organization_id, module_code, bucket_id, object_path, size_bytes, source_type, status, registered_by)
  values
    (p_organization_id, p_module_code, p_bucket_id, p_object_path, p_size_bytes, 'unreferenced', 'pending_delete', auth.uid())
  on conflict on constraint storage_orphan_candidates_uniq do update
    set size_bytes = combine_object_sizes(storage_orphan_candidates.size_bytes, excluded.size_bytes),
        -- T9F.4 · §20: tamaños CONOCIDOS y contradictorios quedan MARCADOS
        -- como inconsistencia (además del máximo conservador del combine).
        error_code = case
          when storage_orphan_candidates.size_bytes is not null
           and excluded.size_bytes is not null
           and storage_orphan_candidates.size_bytes <> excluded.size_bytes
          then 'size_conflict'
          else storage_orphan_candidates.error_code
        end,
        status = case when storage_orphan_candidates.status = 'deleted' then 'pending_delete' else storage_orphan_candidates.status end,
        deleted_at = case when storage_orphan_candidates.status = 'deleted' then null else storage_orphan_candidates.deleted_at end;
end;
$$;

revoke all on function public.register_storage_orphan(uuid, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.register_storage_orphan(uuid, text, text, text, bigint) to service_role;

comment on function public.register_storage_orphan(uuid, text, text, text, bigint) is
  'T9F.3 · SERVER-ONLY (service_role): registra un objeto SIN fila de dominio (compensación tras carga parcialmente fallida). authenticated NO puede ejecutarla: los clientes registran únicamente vía las funciones de dominio (§3) que derivan organización, módulo, bucket, ruta y tamaño de filas reales. Bucket/prefijo/módulo validados aquí y por CHECK.';

-- Resolución del ciclo: SOLO service_role (el servidor confirma el retiro
-- físico real; un cliente jamás puede "declarar eliminado" para liberar cuota).
create or replace function public.resolve_storage_deletion(
  p_bucket_id text,
  p_object_path text,
  p_outcome text,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean;
begin
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'SERVER_ONLY';
  end if;
  if p_outcome not in ('deleted', 'delete_failed') then
    raise exception 'OUTCOME_INVALID';
  end if;

  update storage_orphan_candidates
     set status = p_outcome,
         last_attempt_at = now(),
         error_code = case when p_outcome = 'delete_failed' then left(coalesce(p_error_code, 'unknown'), 120) else null end,
         deleted_at = case when p_outcome = 'deleted' then now() else null end
   where bucket_id = p_bucket_id and object_path = p_object_path
     and status in ('pending_delete', 'delete_failed');
  get diagnostics v_found = row_count;
  return v_found;
end;
$$;

revoke all on function public.resolve_storage_deletion(text, text, text, text) from public, anon, authenticated;
grant execute on function public.resolve_storage_deletion(text, text, text, text) to service_role;

comment on function public.resolve_storage_deletion(text, text, text, text) is
  'T9F.3 · SERVER-ONLY: marca el resultado REAL del intento de eliminación física (deleted libera cuota; delete_failed sigue contando y conserva un error_code seguro). Nunca ejecutable por clientes.';

-- ----------------------------------------------------------------------------
-- §3 · RPCs de dominio: encolar-y-borrar (la marca pending_delete nace ANTES
--      de perder la referencia, en la MISMA transacción del borrado)
-- ----------------------------------------------------------------------------
-- Maestro documental CPR: borrar un BORRADOR encola el archivo actual y TODAS
-- sus versiones (CADA UNA con SU PROPIO tamaño — Bloqueador E), deduplicadas
-- por ruta, y elimina las filas en la misma transacción. La autorización
-- refleja EXACTAMENTE la política RLS trazadoc_file_documents_delete (0057):
-- miembro + status='draft' + (admin/quality, o consultant creador).
create or replace function public.queue_and_delete_trazadoc_draft(
  p_file_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_doc public.trazadoc_file_documents%rowtype;
  v_objects jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_doc
    from trazadoc_file_documents
   where id = p_file_document_id
   for update;
  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  -- Mismo predicado que la política RLS de DELETE (fuente: 0057).
  if not (
    is_org_member(v_doc.organization_id)
    and v_doc.status = 'draft'
    and (
      has_org_role(v_doc.organization_id, array['admin', 'quality'])
      or (has_org_role(v_doc.organization_id, array['consultant']) and v_doc.created_by = v_uid)
    )
  ) then
    raise exception 'DELETE_NOT_ALLOWED';
  end if;

  -- T9F.4 · §22: la eliminación TAMBIÉN es una mutación del módulo — un Demo
  -- vencido, deshabilitado o sin asignar no borra datos funcionales (los
  -- datos se CONSERVAN; el mantenimiento es server-only/superadmin).
  if coalesce((resolve_organization_module_access(v_doc.organization_id, 'traceability_6632')->>'allowed')::boolean, false)
     is distinct from true then
    raise exception 'MODULE_ACCESS_BLOCKED'
      using detail = coalesce(resolve_organization_module_access(v_doc.organization_id, 'traceability_6632')->>'reason', 'not_allowed');
  end if;

  -- pending_delete ANTES de perder la referencia: rutas del archivo actual +
  -- versiones, cada objeto con SU tamaño (max ante referencias repetidas).
  with refs as (
    select 'trazadocs-documents'::text as bucket_id, v_doc.storage_path as object_path,
           v_doc.size_bytes, 'trazadoc_current'::text as source_type, v_doc.id as source_id
     where v_doc.storage_path is not null and v_doc.storage_path <> ''
    union all
    select 'trazadocs-documents', v.storage_path, v.size_bytes, 'trazadoc_version', v.id
      from trazadoc_file_document_versions v
     where v.organization_id = v_doc.organization_id
       and v.file_document_id = v_doc.id
       and v.storage_path is not null and v.storage_path <> ''
  ),
  dedup as (
    select bucket_id, object_path, max(size_bytes) as size_bytes,
           min(source_type) as source_type, min(source_id::text)::uuid as source_id
      from refs
     group by bucket_id, object_path
  ),
  queued as (
    insert into storage_orphan_candidates
      (organization_id, module_code, bucket_id, object_path, size_bytes, source_type, source_id, status, registered_by)
    select v_doc.organization_id, 'traceability_6632', d.bucket_id, d.object_path,
           d.size_bytes, d.source_type, d.source_id, 'pending_delete', v_uid
      from dedup d
    on conflict on constraint storage_orphan_candidates_uniq do update
      set size_bytes = combine_object_sizes(storage_orphan_candidates.size_bytes, excluded.size_bytes),
          error_code = case
            when storage_orphan_candidates.size_bytes is not null
             and excluded.size_bytes is not null
             and storage_orphan_candidates.size_bytes <> excluded.size_bytes
            then 'size_conflict' else storage_orphan_candidates.error_code end,
          status = 'pending_delete',
          deleted_at = null
    returning bucket_id, object_path, size_bytes
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'bucket_id', bucket_id, 'object_path', object_path, 'size_bytes', size_bytes)), '[]'::jsonb)
    into v_objects
    from queued;

  -- Filas fuera en la MISMA transacción (las versiones caen en cascada). La
  -- cola conserva la contabilidad hasta que el servidor confirme el retiro.
  delete from trazadoc_file_documents where id = v_doc.id;

  return jsonb_build_object('deleted', true, 'objects', v_objects);
end;
$$;

revoke all on function public.queue_and_delete_trazadoc_draft(uuid) from public, anon;
grant execute on function public.queue_and_delete_trazadoc_draft(uuid) to authenticated;

comment on function public.queue_and_delete_trazadoc_draft(uuid) is
  'T9F.3 · Borra un BORRADOR del maestro encolando ANTES sus objetos físicos (actual + versiones, cada uno con SU tamaño, deduplicados por ruta) como pending_delete — misma transacción. Autorización idéntica a la política RLS de DELETE (0057). El retiro físico y su confirmación son server-only (resolve_storage_deletion).';

-- Evidencias CPR: mismo ciclo. Autorización idéntica a la política RLS
-- evidences_delete (0019/0023): admin/quality y status <> 'valid'; el guard
-- de fila (0023) sigue disparándose en el DELETE como refuerzo.
create or replace function public.queue_and_delete_evidence(
  p_evidence_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ev public.evidences%rowtype;
  v_object jsonb := null;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_ev from evidences where id = p_evidence_id for update;
  if not found then
    raise exception 'EVIDENCE_NOT_FOUND';
  end if;

  -- Mismo predicado que la política RLS de DELETE (fuente: 0019/0023).
  if not (has_org_role(v_ev.organization_id, array['admin', 'quality']) and v_ev.status <> 'valid') then
    raise exception 'DELETE_NOT_ALLOWED';
  end if;

  -- T9F.4 · §22: sin acceso comercial vigente del módulo no hay borrado.
  if coalesce((resolve_organization_module_access(v_ev.organization_id, 'traceability_6632')->>'allowed')::boolean, false)
     is distinct from true then
    raise exception 'MODULE_ACCESS_BLOCKED'
      using detail = coalesce(resolve_organization_module_access(v_ev.organization_id, 'traceability_6632')->>'reason', 'not_allowed');
  end if;

  if v_ev.storage_path is not null and v_ev.storage_path <> '' then
    insert into storage_orphan_candidates
      (organization_id, module_code, bucket_id, object_path, size_bytes, source_type, source_id, status, registered_by)
    values
      (v_ev.organization_id, 'traceability_6632', 'evidences', v_ev.storage_path,
       v_ev.size_bytes, 'evidence', v_ev.id, 'pending_delete', v_uid)
    on conflict on constraint storage_orphan_candidates_uniq do update
      set size_bytes = combine_object_sizes(storage_orphan_candidates.size_bytes, excluded.size_bytes),
          error_code = case
            when storage_orphan_candidates.size_bytes is not null
             and excluded.size_bytes is not null
             and storage_orphan_candidates.size_bytes <> excluded.size_bytes
            then 'size_conflict' else storage_orphan_candidates.error_code end,
          status = 'pending_delete',
          deleted_at = null;
    v_object := jsonb_build_object(
      'bucket_id', 'evidences', 'object_path', v_ev.storage_path, 'size_bytes', v_ev.size_bytes);
  end if;

  delete from evidences where id = v_ev.id;

  return jsonb_build_object('deleted', true, 'object', v_object);
end;
$$;

revoke all on function public.queue_and_delete_evidence(uuid) from public, anon;
grant execute on function public.queue_and_delete_evidence(uuid) to authenticated;

-- T9F.4 · Evidencias TEXTILES: mismo ciclo (no existía flujo de borrado en
-- producto, pero la política de DELETE directo se RETIRA en §3b y esta RPC
-- queda como la ÚNICA vía — autorización espejo de la política 0075:
-- admin/quality y status <> 'accepted', más el acceso comercial del módulo).
create or replace function public.queue_and_delete_textile_evidence(
  p_evidence_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ev public.textile_evidences%rowtype;
  v_object jsonb := null;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_ev from textile_evidences where id = p_evidence_id for update;
  if not found then
    raise exception 'EVIDENCE_NOT_FOUND';
  end if;

  -- Mismo predicado que la política RLS de DELETE retirada (fuente: 0075).
  if not (has_org_role(v_ev.organization_id, array['admin', 'quality']) and v_ev.status <> 'accepted') then
    raise exception 'DELETE_NOT_ALLOWED';
  end if;
  if coalesce((resolve_organization_module_access(v_ev.organization_id, 'textiles')->>'allowed')::boolean, false)
     is distinct from true then
    raise exception 'MODULE_ACCESS_BLOCKED'
      using detail = coalesce(resolve_organization_module_access(v_ev.organization_id, 'textiles')->>'reason', 'not_allowed');
  end if;

  if v_ev.file_path is not null and v_ev.file_path <> '' then
    insert into storage_orphan_candidates
      (organization_id, module_code, bucket_id, object_path, size_bytes, source_type, source_id, status, registered_by)
    values
      (v_ev.organization_id, 'textiles', 'evidences', v_ev.file_path,
       v_ev.file_size_bytes, 'evidence', v_ev.id, 'pending_delete', v_uid)
    on conflict on constraint storage_orphan_candidates_uniq do update
      set size_bytes = combine_object_sizes(storage_orphan_candidates.size_bytes, excluded.size_bytes),
          error_code = case
            when storage_orphan_candidates.size_bytes is not null
             and excluded.size_bytes is not null
             and storage_orphan_candidates.size_bytes <> excluded.size_bytes
            then 'size_conflict' else storage_orphan_candidates.error_code end,
          status = 'pending_delete',
          deleted_at = null;
    v_object := jsonb_build_object(
      'bucket_id', 'evidences', 'object_path', v_ev.file_path, 'size_bytes', v_ev.file_size_bytes);
  end if;

  delete from textile_evidences where id = v_ev.id;

  return jsonb_build_object('deleted', true, 'object', v_object);
end;
$$;

revoke all on function public.queue_and_delete_textile_evidence(uuid) from public, anon;
grant execute on function public.queue_and_delete_textile_evidence(uuid) to authenticated;

comment on function public.queue_and_delete_textile_evidence(uuid) is
  'T9F.4 · ÚNICA vía de borrado de una evidencia Textil (la política de DELETE directo fue retirada): encola el objeto como pending_delete y elimina la fila en UNA transacción; autorización espejo de la política 0075 + acceso comercial vigente del módulo.';

-- T9F.4 · Descartar una fila del maestro SIN objeto (compensaciones de la
-- creación inicial): con el DELETE directo retirado, esta RPC es la vía
-- controlada — SOLO borradores vacíos (storage_path = '') sin versiones.
create or replace function public.discard_empty_trazadoc_file_document(
  p_file_document_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_doc public.trazadoc_file_documents%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  select * into v_doc from trazadoc_file_documents where id = p_file_document_id for update;
  if not found then
    return false;
  end if;
  if not (
    is_org_member(v_doc.organization_id)
    and v_doc.status = 'draft'
    and coalesce(v_doc.storage_path, '') = ''
    and not exists (select 1 from trazadoc_file_document_versions v where v.file_document_id = v_doc.id)
    and (
      has_org_role(v_doc.organization_id, array['admin', 'quality'])
      or v_doc.created_by = v_uid
    )
  ) then
    raise exception 'DISCARD_NOT_ALLOWED';
  end if;
  delete from trazadoc_file_documents where id = v_doc.id;
  return true;
end;
$$;

revoke all on function public.discard_empty_trazadoc_file_document(uuid) from public, anon;
grant execute on function public.discard_empty_trazadoc_file_document(uuid) to authenticated;

comment on function public.discard_empty_trazadoc_file_document(uuid) is
  'T9F.4 · Descarta un borrador del maestro SIN objeto físico (storage_path vacío y sin versiones) — la vía controlada para las compensaciones de creación tras retirar el DELETE directo.';

-- ----------------------------------------------------------------------------
-- §3b · T9F.4 · SIN mutación directa de filas físicas
-- ----------------------------------------------------------------------------
-- (a) DELETE directo RETIRADO: eliminar la última referencia de un objeto
--     físico sin encolar pending_delete dejaba almacenamiento fantasma
--     (Bloqueador 2). Retirar una política PERMISIVA endurece la RLS (no la
--     debilita): las RPCs definer de §3 son ahora la ÚNICA vía y espejan
--     EXACTAMENTE los predicados retirados + acceso comercial.
drop policy trazadoc_file_documents_delete on public.trazadoc_file_documents;
drop policy evidences_delete on public.evidences;
drop policy textile_evidences_delete on public.textile_evidences;

-- (b) UPDATE directo de CAMPOS FÍSICOS bloqueado (Bloqueador 3): ruta,
--     tamaño y metadatos físicos solo cambian por las vías controladas
--     (finalize/replace/reconciliación — funciones DEFINER, fuera del
--     ámbito del trigger). Los campos FUNCIONALES (título, descripción,
--     categoría, estado permitido, observaciones…) siguen editables.
create or replace function public.forbid_physical_field_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_col text;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  foreach v_col in array tg_argv loop
    if (to_jsonb(old) ->> v_col) is distinct from (to_jsonb(new) ->> v_col) then
      raise exception 'PHYSICAL_FIELD_IMMUTABLE'
        using detail = v_col,
              hint = 'Los campos físicos del archivo solo cambian por las operaciones controladas (finalización, reemplazo, reconciliación o eliminación segura).';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.forbid_physical_field_mutation() from public, anon, authenticated;

comment on function public.forbid_physical_field_mutation() is
  'T9F.4 · BEFORE UPDATE (INVOKER): bloquea a los clientes la mutación directa de campos físicos (ruta, tamaño, nombre físico, MIME); las vías controladas son funciones DEFINER y quedan fuera de su ámbito. Los campos funcionales siguen editables.';

create trigger t_evidences_physical_guard before update on public.evidences
  for each row execute function public.forbid_physical_field_mutation('storage_path', 'size_bytes');
create trigger t_trazadoc_file_documents_physical_guard before update on public.trazadoc_file_documents
  for each row execute function public.forbid_physical_field_mutation('storage_path', 'size_bytes', 'file_name', 'mime_type');
create trigger t_textile_evidences_physical_guard before update on public.textile_evidences
  for each row execute function public.forbid_physical_field_mutation('file_path', 'file_size_bytes', 'file_name', 'file_mime_type');

-- (c) La RPC HISTÓRICA de limpieza de intents (0097) estaba concedida a
--     authenticated: un cliente podía "confirmar" un retiro inexistente
--     (p_removed=true) y liberar contabilidad. Server-only desde T9F.4 (el
--     servidor usa la variante _server de 0098).
revoke execute on function public.record_textile_upload_intent_cleanup(uuid, boolean) from authenticated;

comment on function public.queue_and_delete_evidence(uuid) is
  'T9F.3 · Borra una evidencia CPR encolando ANTES su objeto físico (con su tamaño REAL, o NULL=desconocido) como pending_delete — misma transacción. Autorización idéntica a la política RLS de DELETE; el guard de 0023 sigue vigente. Retiro físico y confirmación server-only.';

-- ----------------------------------------------------------------------------
-- §4 · RPC idempotente y segura ante concurrencia (T9F.2, sin cambios)
-- ----------------------------------------------------------------------------
create or replace function public.set_organization_module_access(
  p_organization_id uuid,
  p_module_code text,
  p_target_state text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid;
  v_before    public.organization_modules%rowtype;
  v_enabled   boolean;
  v_mode      text;
  v_expires   timestamptz;
  v_after     public.organization_modules%rowtype;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'No autenticado';
  end if;
  if not is_platform_superadmin() then
    raise exception 'Solo un superadministrador de plataforma puede cambiar el estado de un módulo';
  end if;

  if p_organization_id is null or not exists (select 1 from organizations where id = p_organization_id) then
    raise exception 'La empresa indicada no existe';
  end if;

  -- Solo módulos FUNCIONALES: jamás se puede habilitar un módulo "próximamente".
  if not exists (select 1 from modules m where m.code = p_module_code and m.is_functional) then
    raise exception 'Este módulo no está disponible para asignación';
  end if;

  if p_target_state not in ('disabled', 'demo_permanent', 'full', 'extra') then
    raise exception 'Estado objetivo no válido';
  end if;

  -- T9F.2 · Bloqueador 5: SERIALIZACIÓN por (organización, módulo) con un
  -- advisory lock TRANSACCIONAL (se libera solo al terminar la transacción).
  -- Dos primeras asignaciones simultáneas sobre una fila inexistente quedan
  -- serializadas: la segunda espera, ve la fila creada por la primera y
  -- resuelve como no-op o como transición real — sin unique_violation, sin
  -- dos filas, sin doble auditoría, sin error 500. El lock es POR PAR
  -- (org, módulo): cero contención entre organizaciones o módulos distintos.
  perform pg_advisory_xact_lock(
    hashtextextended('organization_modules:' || p_organization_id::text || '/' || p_module_code, 0)
  );

  select * into v_before
    from organization_modules
   where organization_id = p_organization_id and module_code = p_module_code
   for update;

  -- Mapeo estado de UI → (enabled, access_mode, expires). "Deshabilitado"
  -- conserva el access_mode previo (historial) pero bloquea con enabled=false.
  if p_target_state = 'disabled' then
    v_enabled := false;
    v_mode    := coalesce(v_before.access_mode, 'demo');
    v_expires := v_before.access_expires_at;
  elsif p_target_state = 'demo_permanent' then
    v_enabled := true;  v_mode := 'demo';  v_expires := null;
  elsif p_target_state = 'full' then
    v_enabled := true;  v_mode := 'full';  v_expires := null;
  else -- extra
    v_enabled := true;  v_mode := 'extra'; v_expires := null;
  end if;

  -- IDEMPOTENCIA REAL (T9F.1): si el estado solicitado ya es EXACTAMENTE el
  -- actual (enabled, access_mode y access_expires_at — comparación null-safe),
  -- la operación es un NO-OP total: changed=false, SIN UPDATE (updated_at/
  -- updated_by/access_started_at intactos), SIN evento de auditoría (ni
  -- semántico ni del trigger de fila, que solo dispara con UPDATE) y SIN fila
  -- nueva. Devuelve el estado actual.
  if v_before.id is not null
     and v_before.enabled = v_enabled
     and v_before.access_mode = v_mode
     and v_before.access_expires_at is not distinct from v_expires then
    return jsonb_build_object(
      'changed', false,
      'module_code', p_module_code,
      'enabled', v_before.enabled,
      'access_mode', v_before.access_mode,
      'access_expires_at', v_before.access_expires_at,
      'updated_at', v_before.updated_at
    );
  end if;

  if v_before.id is null then
    -- Primera asignación (Sin asignar → estado). Bajo el advisory lock el
    -- conflicto es teóricamente imposible; el ON CONFLICT es una SEGUNDA
    -- defensa determinista (UPSERT seguro) que garantiza una única fila
    -- final incluso ante un camino de escritura imprevisto.
    insert into organization_modules (
      organization_id, module_code, enabled,
      access_mode, access_started_at, access_expires_at, updated_at, updated_by, assignment_source
    )
    values (
      p_organization_id, p_module_code, v_enabled,
      v_mode, now(), v_expires, now(), v_user, 'superadmin'
    )
    on conflict on constraint organization_modules_org_module_uniq do update
      set enabled           = excluded.enabled,
          access_mode       = excluded.access_mode,
          access_expires_at = excluded.access_expires_at,
          updated_at        = now(),
          updated_by        = excluded.updated_by,
          assignment_source = excluded.assignment_source
    returning * into v_after;
  else
    update organization_modules
       set enabled           = v_enabled,
           access_mode       = v_mode,
           access_expires_at = v_expires,
           updated_at        = now(),
           updated_by        = v_user,
           assignment_source = 'superadmin'
     where organization_id = p_organization_id and module_code = p_module_code
    returning * into v_after;
  end if;

  -- Transición REAL → exactamente UN evento semántico de auditoría.
  perform log_event(
    p_organization_id,
    'organization_module_access_changed',
    jsonb_build_object(
      'module_code', p_module_code,
      'target_state', p_target_state,
      'before', jsonb_build_object(
        'assigned', v_before.id is not null,
        'enabled', v_before.enabled,
        'access_mode', v_before.access_mode,
        'access_expires_at', v_before.access_expires_at
      ),
      'after', jsonb_build_object(
        'enabled', v_after.enabled,
        'access_mode', v_after.access_mode,
        'access_expires_at', v_after.access_expires_at
      )
    ),
    v_user
  );

  return jsonb_build_object(
    'changed', true,
    'module_code', p_module_code,
    'enabled', v_after.enabled,
    'access_mode', v_after.access_mode,
    'access_expires_at', v_after.access_expires_at,
    'updated_at', v_after.updated_at
  );
end;
$$;

-- Grants: mismos de 0100, reafirmados para que 0101 sea autocontenida.
revoke all on function public.set_organization_module_access(uuid, text, text) from public, anon;
grant execute on function public.set_organization_module_access(uuid, text, text) to authenticated;

comment on function public.set_organization_module_access(uuid, text, text) is
  'T9F.1/T9F.2 · SOLO superadministrador (re-verificado en SQL). Cambia el estado comercial de un módulo funcional (disabled/demo_permanent/full/extra). SERIALIZADA por (org, módulo) con advisory lock transaccional + UPSERT: la primera asignación concurrente nunca produce unique_violation ni doble fila/auditoría. IDEMPOTENTE REAL: un estado idéntico devuelve changed=false sin UPDATE, sin tocar updated_at/updated_by y sin auditoría; una transición real crea exactamente un evento. Rechaza módulos no funcionales. No borra datos ni filas.';
-- ----------------------------------------------------------------------------
-- §5 · AUTORIDAD ATÓMICA DE LÍMITES: conteo interno + triggers BEFORE INSERT
-- ----------------------------------------------------------------------------
-- T9F.3 · Bloqueadores A y B. Estrategia canónica ÚNICA (opción A del plan):
-- un trigger BEFORE INSERT por tabla limitada que, bajo un advisory lock
-- transaccional por (organización, módulo, recurso), resuelve el plan del
-- módulo, cuenta el uso REAL (incluyendo reservas activas donde aplica) y
-- rechaza el INSERT que exceda el límite. Cubre por igual: Server Actions,
-- INSERT directo por la API de Supabase, importaciones (un solo statement
-- multi-fila = una transacción: cualquier exceso revierte TODO — jamás
-- inserción parcial) y solicitudes concurrentes (el lock las serializa).
--
-- Ámbito de roles: se aplica al rol `authenticated` (la superficie
-- alcanzable por clientes). service_role y las funciones SECURITY DEFINER
-- (begin/finalize, aprovisionamiento, fixtures de QA) son código de servidor
-- confiable que aplica sus propias validaciones — documentado en el informe.
--
-- Semántica de conteo (documentada por recurso, informe §12): count(*) de
-- TODAS las filas de la tabla (activas, inactivas y archivadas — igual que
-- la vista 0052 y la de §7): desactivar no libera, reactivar/editar no
-- consumen (UPDATE no dispara), eliminar sí libera. Para evidencias
-- Textiles se suman además las RESERVAS activas (intents pending no
-- vencidos): confirmadas + reservadas + 1 <= límite.

create or replace function public.count_module_resource(
  p_organization_id uuid,
  p_module_code text,
  p_resource_code text
)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v bigint;
begin
  -- Guard de AISLAMIENTO (T9F.4 · Bloqueador 6): dentro de una función
  -- SECURITY DEFINER current_user es el DUEÑO, así que jamás sirve como
  -- identidad del invocador — la identidad REAL es auth.uid(). Con sesión
  -- (auth.uid() no nulo) solo se cuentan organizaciones propias; sin sesión
  -- (contextos de servidor: service_role, finalize) se permite. Un cliente
  -- que sondee otra organización recibe NULL (nada que revelar).
  if auth.uid() is not null
     and not (is_org_member(p_organization_id) or is_platform_staff()) then
    return null;
  end if;
  if p_resource_code is null or p_module_code is null or p_organization_id is null then
    return null;
  end if;
  if p_module_code = 'traceability_6632' then
    select case p_resource_code
      when 'suppliers' then (select count(*) from suppliers s where s.organization_id = p_organization_id)
      when 'materials' then (select count(*) from materials t where t.organization_id = p_organization_id)
      when 'products' then (select count(*) from products t where t.organization_id = p_organization_id)
      when 'evidences' then (select count(*) from evidences t where t.organization_id = p_organization_id)
      when 'production_orders' then (select count(*) from production_orders t where t.organization_id = p_organization_id)
      when 'input_batches' then (select count(*) from input_batches t where t.organization_id = p_organization_id)
      when 'output_batches' then (select count(*) from output_batches t where t.organization_id = p_organization_id)
      when 'documents_trazadocs' then (
        -- T9F.4 · Bloqueador 1: límite COMPARTIDO de documentos LÓGICOS
        -- (semántica de 0059): vivos (module_key cpr) + DESCARGABLES del
        -- maestro. Las versiones históricas NO consumen unidades (cuentan
        -- solo para almacenamiento).
        (select count(*) from trazadoc_documents t where t.organization_id = p_organization_id and t.module_key = 'cpr')
        + (select count(*) from trazadoc_file_documents f where f.organization_id = p_organization_id)
      )
      else null end
    into v;
  elsif p_module_code = 'textiles' then
    select case p_resource_code
      when 'suppliers' then (select count(*) from textile_suppliers t where t.organization_id = p_organization_id)
      when 'materials' then (select count(*) from textile_materials t where t.organization_id = p_organization_id)
      when 'products' then (select count(*) from textile_products t where t.organization_id = p_organization_id)
      when 'production_orders' then (select count(*) from textile_production_orders t where t.organization_id = p_organization_id)
      when 'input_batches' then (select count(*) from textile_input_lots t where t.organization_id = p_organization_id)
      when 'output_batches' then (select count(*) from textile_output_lots t where t.organization_id = p_organization_id)
      when 'documents_trazadocs' then (select count(*) from trazadoc_documents t where t.organization_id = p_organization_id and t.module_key = 'textiles')
      when 'evidences' then (
        -- Confirmadas + RESERVAS ACTIVAS (T9F.3 §13): un intent pending no
        -- vencido reserva una unidad aunque el archivo aún no exista.
        (select count(*) from textile_evidences t where t.organization_id = p_organization_id)
        + (select count(*) from textile_evidence_upload_intents i
            where i.organization_id = p_organization_id
              and i.status = 'pending' and i.expires_at > now())
      )
      else null end
    into v;
  else
    v := null;
  end if;
  return v;
end;
$$;

-- La ejecutan el trigger (INVOKER: necesita EXECUTE como authenticated) y
-- las funciones definer de §6/§8. El guard interno impide sondear conteos
-- de organizaciones ajenas.
revoke all on function public.count_module_resource(uuid, text, text) from public, anon;
grant execute on function public.count_module_resource(uuid, text, text) to authenticated;

comment on function public.count_module_resource(uuid, text, text) is
  'T9F.3 · Conteo AUTORITATIVO por (org, módulo, recurso), incluyendo reservas activas (intents textiles pending no vencidos) para evidencias Textiles. Interna: revocada a clientes; la usan el trigger de límites y las funciones definer.';

create or replace function public.enforce_module_resource_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_module text := tg_argv[0];
  v_resource text := tg_argv[1];
  v_access jsonb;
  v_reason text;
  v_limit record;
  v_count bigint;
begin
  -- Autoridad sobre la superficie de CLIENTES. El trigger es SECURITY
  -- INVOKER: current_user es el rol REAL que inserta. service_role y las
  -- funciones SECURITY DEFINER (begin/finalize, aprovisionamiento, fixtures
  -- de QA — donde current_user es el dueño) son código de servidor confiable
  -- que aplica sus propias validaciones.
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- trazadoc_documents sirve a DOS módulos: el módulo real sale de la fila
  -- (module_key lo fija un trigger de 0082 en servidor, jamás el cliente).
  if v_module = 'BY_MODULE_KEY' then
    v_module := case new.module_key when 'cpr' then 'traceability_6632'
                                    when 'textiles' then 'textiles'
                                    else null end;
    if v_module is null then
      return new; -- claves futuras sin límite comercial definido
    end if;
  end if;

  v_access := resolve_organization_module_access(new.organization_id, v_module);
  v_reason := coalesce(v_access->>'reason', 'not_allowed');

  -- No-miembro: el trigger NO decide aislamiento — la RLS lo negará con su
  -- error estándar inmediatamente después (comportamiento previo intacto).
  if v_reason = 'not_member' then
    return new;
  end if;
  if coalesce((v_access->>'allowed')::boolean, false) is distinct from true then
    -- Demo vencido / deshabilitado / no asignado: la BD es la barrera final.
    raise exception 'MODULE_ACCESS_BLOCKED'
      using detail = v_reason,
            hint = 'El módulo no está disponible para crear registros (plan vencido, deshabilitado o sin asignar).';
  end if;

  select pl.limit_value, pl.is_unlimited into v_limit
    from plan_limits pl
   where pl.plan_code = (v_access->>'access_mode') and pl.resource_code = v_resource;
  if v_limit is null or v_limit.is_unlimited or v_limit.limit_value is null then
    return new; -- sin límite en el catálogo o ilimitado (Full/Extra)
  end if;

  -- SERIALIZACIÓN por (org, módulo, recurso): dos creaciones concurrentes
  -- del último recurso permitido quedan en fila; la segunda ve el conteo ya
  -- incrementado y se rechaza. Cero contención entre organizaciones o
  -- recursos distintos. En un INSERT multi-fila (importación) el conteo ve
  -- las filas previas de la MISMA transacción: el exceso aborta TODO.
  perform pg_advisory_xact_lock(
    hashtextextended('module_resource:' || new.organization_id::text || '/' || v_module || '/' || v_resource, 0)
  );

  v_count := count_module_resource(new.organization_id, v_module, v_resource);
  if v_count is null then
    raise exception 'RESOURCE_USAGE_UNVERIFIABLE'
      using hint = 'No fue posible verificar el uso actual de este recurso. Inténtalo nuevamente.';
  end if;
  if v_count + 1 > v_limit.limit_value then
    raise exception 'RESOURCE_LIMIT_EXCEEDED'
      using detail = v_resource || ':' || v_count || '/' || v_limit.limit_value,
            hint = 'Tu plan alcanzó el límite de este recurso. Mejora el plan del módulo para continuar.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_module_resource_limit() from public, anon, authenticated;

comment on function public.enforce_module_resource_limit() is
  'T9F.3 · BARRERA FINAL de límites comerciales: BEFORE INSERT, bajo advisory lock por (org, módulo, recurso), cuenta uso real (+reservas donde aplica) y rechaza el exceso — también ante INSERT directo por la API. No decide aislamiento (eso es RLS): un no-miembro cae en la política. Roles de servidor confiables quedan fuera de su ámbito.';

-- Triggers por tabla limitada (los nombres siguen el patrón t_<tabla>_limit).
create trigger t_suppliers_limit before insert on public.suppliers
  for each row execute function public.enforce_module_resource_limit('traceability_6632', 'suppliers');
create trigger t_materials_limit before insert on public.materials
  for each row execute function public.enforce_module_resource_limit('traceability_6632', 'materials');
create trigger t_products_limit before insert on public.products
  for each row execute function public.enforce_module_resource_limit('traceability_6632', 'products');
create trigger t_evidences_limit before insert on public.evidences
  for each row execute function public.enforce_module_resource_limit('traceability_6632', 'evidences');
create trigger t_production_orders_limit before insert on public.production_orders
  for each row execute function public.enforce_module_resource_limit('traceability_6632', 'production_orders');
create trigger t_input_batches_limit before insert on public.input_batches
  for each row execute function public.enforce_module_resource_limit('traceability_6632', 'input_batches');
create trigger t_output_batches_limit before insert on public.output_batches
  for each row execute function public.enforce_module_resource_limit('traceability_6632', 'output_batches');
create trigger t_trazadoc_documents_limit before insert on public.trazadoc_documents
  for each row execute function public.enforce_module_resource_limit('BY_MODULE_KEY', 'documents_trazadocs');
-- T9F.4: los DESCARGABLES comparten el MISMO recurso y por tanto el MISMO
-- advisory lock (org/traceability_6632/documents_trazadocs) que los vivos:
-- dos INSERT simultáneos, uno en cada tabla, se serializan entre sí.
create trigger t_trazadoc_file_documents_limit before insert on public.trazadoc_file_documents
  for each row execute function public.enforce_module_resource_limit('traceability_6632', 'documents_trazadocs');
create trigger t_textile_suppliers_limit before insert on public.textile_suppliers
  for each row execute function public.enforce_module_resource_limit('textiles', 'suppliers');
create trigger t_textile_materials_limit before insert on public.textile_materials
  for each row execute function public.enforce_module_resource_limit('textiles', 'materials');
create trigger t_textile_products_limit before insert on public.textile_products
  for each row execute function public.enforce_module_resource_limit('textiles', 'products');
create trigger t_textile_evidences_limit before insert on public.textile_evidences
  for each row execute function public.enforce_module_resource_limit('textiles', 'evidences');
create trigger t_textile_production_orders_limit before insert on public.textile_production_orders
  for each row execute function public.enforce_module_resource_limit('textiles', 'production_orders');
create trigger t_textile_input_lots_limit before insert on public.textile_input_lots
  for each row execute function public.enforce_module_resource_limit('textiles', 'input_batches');
create trigger t_textile_output_lots_limit before insert on public.textile_output_lots
  for each row execute function public.enforce_module_resource_limit('textiles', 'output_batches');

-- T9F.4 · La tabla de intents CPR/TrazaDocs se crea ANTES de §6 porque el
-- snapshot físico (más abajo) la referencia; su API vive en §6b.
create table public.storage_upload_intents (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  module_code         text not null references public.modules (code),
  resource_type       text not null,
  resource_id         uuid not null,
  bucket_id           text not null,
  object_path         text not null unique,
  original_filename   text not null,
  safe_filename       text not null,
  expected_size_bytes bigint not null,
  expected_mime_type  text not null,
  status              text not null default 'pending',
  expires_at          timestamptz not null,
  idempotency_key     text,
  created_by          uuid not null references auth.users (id),
  created_at          timestamptz not null default now(),
  finalized_at        timestamptz,
  cancelled_at        timestamptz,
  -- Resolución FÍSICA confirmada por el servidor (objeto retirado o
  -- verificado inexistente): solo entonces sus bytes dejan de contar.
  storage_resolved_at timestamptz,
  cleanup_attempts    integer not null default 0,
  last_cleanup_attempt_at timestamptz,
  constraint storage_upload_intents_status_check
    check (status in ('pending', 'finalized', 'failed', 'expired')),
  constraint storage_upload_intents_type_check
    check (resource_type in ('evidence', 'trazadoc_initial', 'trazadoc_replace')),
  constraint storage_upload_intents_module_check
    check (module_code = 'traceability_6632'),
  constraint storage_upload_intents_bucket_check
    check (
      (resource_type = 'evidence' and bucket_id = 'evidences')
      or (resource_type in ('trazadoc_initial', 'trazadoc_replace') and bucket_id = 'trazadocs-documents')
    ),
  constraint storage_upload_intents_size_check
    check (expected_size_bytes > 0 and expected_size_bytes <= 20 * 1024 * 1024),
  constraint storage_upload_intents_prefix_check
    check (position(organization_id::text || '/' in object_path) = 1),
  constraint storage_upload_intents_expiry_check check (expires_at > created_at),
  constraint storage_upload_intents_finalized_check
    check ((status = 'finalized') = (finalized_at is not null))
);

create unique index storage_upload_intents_idem_uniq
  on public.storage_upload_intents (organization_id, created_by, idempotency_key)
  where idempotency_key is not null and status = 'pending';
create index storage_upload_intents_active_idx
  on public.storage_upload_intents (organization_id, module_code, status, expires_at);

alter table public.storage_upload_intents enable row level security;
-- Sin políticas: todo pasa por las RPCs de esta sección.
revoke all on public.storage_upload_intents from public, anon, authenticated;

comment on table public.storage_upload_intents is
  'T9F.4 · Intents DURABLES de carga CPR/TrazaDocs (misma arquitectura que los intents Textiles de 0094): el intent nace ANTES del upload con bucket, ruta EXACTA de servidor, tamaño declarado y TTL; pending no vencido = bytes RESERVADOS; failed o pending vencido sin resolver = el objeto (si existe) SIGUE contando hasta resolución server-only confirmada; finalized = la fila de dominio asume la contabilidad (deduplicada por ruta). Clientes sin acceso directo.';

-- ----------------------------------------------------------------------------
-- §6 · RESERVAS de evidencias Textiles: begin v2 + finalize revalidado
-- ----------------------------------------------------------------------------
-- T9F.3 · Bloqueador C. El intent pending no vencido ES la reserva: una
-- unidad del recurso "evidences" + expected_size_bytes de almacenamiento.
-- Cancelación (status failed) y vencimiento (expires_at <= now()) liberan
-- POR DEFINICIÓN: la contabilidad solo suma pending && expires_at > now(),
-- sin depender de ningún cron. Los estados existentes de 0094/0097 se
-- reutilizan tal cual (pending/consumed/expired/failed).

-- Idempotencia de begin (§28): misma clave ⇒ mismo intent y misma reserva.
alter table public.textile_evidence_upload_intents
  add column idempotency_key text;

create unique index textile_upload_intents_idem_uniq
  on public.textile_evidence_upload_intents (organization_id, created_by, idempotency_key)
  where idempotency_key is not null and status = 'pending';

-- Instantánea AUTORITATIVA de almacenamiento del módulo (misma semántica que
-- la vista de §7; usada por begin/finalize bajo lock). Interna.
create or replace function public.module_storage_snapshot(
  p_organization_id uuid,
  p_module_code text
)
returns table (committed_bytes bigint, reserved_bytes bigint, unknown_size_count bigint, conflict_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with objs as (
    select 'evidences'::text as bucket_id, e.storage_path as object_path, e.size_bytes
      from evidences e
     where p_module_code = 'traceability_6632'
       and e.organization_id = p_organization_id
       and e.storage_path is not null and e.storage_path <> ''
    union all
    select 'trazadocs-documents', d.storage_path, d.size_bytes
      from trazadoc_file_documents d
     where p_module_code = 'traceability_6632'
       and d.organization_id = p_organization_id
       and d.storage_path is not null and d.storage_path <> ''
    union all
    select 'trazadocs-documents', v.storage_path, v.size_bytes
      from trazadoc_file_document_versions v
     where p_module_code = 'traceability_6632'
       and v.organization_id = p_organization_id
       and v.storage_path is not null and v.storage_path <> ''
    union all
    select 'evidences', t.file_path, t.file_size_bytes
      from textile_evidences t
     where p_module_code = 'textiles'
       and t.organization_id = p_organization_id
       and t.file_path is not null and t.file_path <> ''
    union all
    select c.bucket_id, c.object_path, c.size_bytes
      from storage_orphan_candidates c
     where c.organization_id = p_organization_id
       and c.module_code = p_module_code
       and c.status <> 'deleted'
    union all
    -- T9F.4 · Bloqueador 5: intents Textiles failed o pending-vencidos SIN
    -- resolución confirmada — su objeto (si existe) SIGUE contando con el
    -- tamaño declarado ('expired' solo se marca tras retiro confirmado,
    -- 0097; 'consumed' lo contabiliza la evidencia — dedup por ruta).
    select i.bucket_id, i.object_path, i.expected_size_bytes
      from textile_evidence_upload_intents i
     where p_module_code = 'textiles'
       and i.organization_id = p_organization_id
       and (i.status = 'failed' or (i.status = 'pending' and i.expires_at <= now()))
    union all
    -- T9F.4: intents CPR/TrazaDocs no finalizados ni resueltos: idem.
    select g.bucket_id, g.object_path, g.expected_size_bytes
      from storage_upload_intents g
     where p_module_code = 'traceability_6632'
       and g.organization_id = p_organization_id
       and g.status <> 'finalized' and g.storage_resolved_at is null
       and (g.status in ('failed', 'expired') or g.expires_at <= now())
  ),
  dedup as (
    select bucket_id, object_path,
           max(size_bytes) as size_bytes,
           (count(size_bytes) = 0) as size_unknown,
           (count(distinct size_bytes) > 1) as size_conflict
      from objs
     group by bucket_id, object_path
  )
  select
    coalesce(sum(size_bytes) filter (where not size_unknown), 0)::bigint,
    coalesce((select sum(i.expected_size_bytes)
                from textile_evidence_upload_intents i
               where p_module_code = 'textiles'
                 and i.organization_id = p_organization_id
                 and i.status = 'pending' and i.expires_at > now()), 0)::bigint
    + coalesce((select sum(g.expected_size_bytes)
                from storage_upload_intents g
               where p_module_code = 'traceability_6632'
                 and g.organization_id = p_organization_id
                 and g.status = 'pending' and g.expires_at > now()), 0)::bigint,
    count(*) filter (where size_unknown)::bigint,
    count(*) filter (where size_conflict)::bigint
  from dedup;
$$;

revoke all on function public.module_storage_snapshot(uuid, text) from public, anon, authenticated;

comment on function public.module_storage_snapshot(uuid, text) is
  'T9F.3 · Instantánea autoritativa: bytes CONFIRMADOS (objetos físicos deduplicados por bucket+ruta; tamaño máximo ante referencias repetidas), bytes RESERVADOS (intents textiles pending no vencidos), objetos con tamaño DESCONOCIDO (path sin size — jamás cero) y conflictos. Interna; misma semántica que v_organization_module_usage.';

-- begin v2: TODA la validación de 0097 (rol, archivo, MIME, extensión,
-- metadata canónica, ruta en servidor, tope 20 MB por archivo) MÁS: acceso
-- del módulo, idempotencia, y RESERVA atómica de unidad + bytes bajo los
-- mismos advisory locks que el trigger y finalize.
create or replace function public.begin_textile_evidence_upload_v2(
  p_organization_id uuid,
  p_file_name text,
  p_file_size_bytes bigint,
  p_file_mime_type text,
  p_metadata jsonb,
  p_ttl_minutes integer default 30,
  p_idempotency_key text default null
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
  v_existing public.textile_evidence_upload_intents%rowtype;
  v_access jsonb;
  v_mode text;
  v_limit record;
  v_units bigint;
  v_quota bigint;
  v_snap record;
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

  -- Metadata funcional CANÓNICA (idéntica a 0097).
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

  -- T9F.3: ACCESO del módulo Textiles en la propia BD (Demo vencido,
  -- deshabilitado o sin asignar NO reserva — Bloqueador C).
  v_access := resolve_organization_module_access(p_organization_id, 'textiles');
  if coalesce((v_access->>'allowed')::boolean, false) is distinct from true then
    raise exception 'MODULE_ACCESS_BLOCKED'
      using detail = coalesce(v_access->>'reason', 'not_allowed');
  end if;
  v_mode := v_access->>'access_mode';

  -- SERIALIZACIÓN idéntica a la del trigger y finalize: dos begins
  -- simultáneos no pueden comprometer más unidades ni bytes que el permitido.
  perform pg_advisory_xact_lock(
    hashtextextended('module_resource:' || p_organization_id::text || '/textiles/evidences', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('module_storage:' || p_organization_id::text || '/textiles', 0)
  );

  -- Idempotencia (bajo el lock): misma clave ⇒ MISMO intent y misma reserva.
  -- T9F.4 · §21: un intent pending VENCIDO jamás bloquea la clave — se marca
  -- expired de forma atómica (libera el índice parcial); su objeto, si
  -- existe, SIGUE contabilizado por la rama de no-resueltos de la vista
  -- hasta que la limpieza server-only confirme el retiro.
  if p_idempotency_key is not null then
    update textile_evidence_upload_intents
       set status = 'expired'
     where organization_id = p_organization_id and created_by = v_uid
       and idempotency_key = p_idempotency_key
       and status = 'pending' and expires_at <= now();
    select * into v_existing
      from textile_evidence_upload_intents
     where organization_id = p_organization_id
       and created_by = v_uid
       and idempotency_key = p_idempotency_key
       and status = 'pending' and expires_at > now()
     limit 1;
    if found then
      return jsonb_build_object(
        'intent_id', v_existing.id, 'object_path', v_existing.object_path, 'reused', true);
    end if;
  end if;

  -- RESERVA de UNIDAD: confirmadas + reservas activas + 1 <= límite.
  select pl.limit_value, pl.is_unlimited into v_limit
    from plan_limits pl
   where pl.plan_code = v_mode and pl.resource_code = 'evidences';
  if v_limit is not null and not v_limit.is_unlimited and v_limit.limit_value is not null then
    v_units := count_module_resource(p_organization_id, 'textiles', 'evidences');
    if v_units is null then
      raise exception 'RESOURCE_USAGE_UNVERIFIABLE';
    end if;
    if v_units + 1 > v_limit.limit_value then
      raise exception 'EVIDENCE_LIMIT_EXCEEDED'
        using detail = v_units || '/' || v_limit.limit_value,
              hint = 'Tu plan alcanzó el límite de evidencias del módulo Textiles.';
    end if;
  end if;

  -- RESERVA de BYTES: confirmado + reservado + declarado <= cuota, con
  -- FAIL-CLOSED total: tamaños desconocidos o contradictorios bloquean.
  select storage_limit_bytes into v_quota
    from plan_definitions where code = v_mode;
  if v_quota is null then
    raise exception 'STORAGE_QUOTA_UNVERIFIABLE';
  end if;
  select * into v_snap from module_storage_snapshot(p_organization_id, 'textiles');
  if v_snap is null then
    raise exception 'STORAGE_USAGE_UNVERIFIABLE';
  end if;
  if v_snap.unknown_size_count > 0 or v_snap.conflict_count > 0 then
    raise exception 'STORAGE_UNVERIFIABLE'
      using detail = 'unknown=' || v_snap.unknown_size_count || ' conflicts=' || v_snap.conflict_count,
            hint = 'Existen objetos con tamaño desconocido o contradictorio: se requiere reconciliación antes de nuevas cargas.';
  end if;
  if v_snap.committed_bytes + v_snap.reserved_bytes + p_file_size_bytes > v_quota then
    raise exception 'STORAGE_QUOTA_EXCEEDED'
      using detail = (v_snap.committed_bytes + v_snap.reserved_bytes) || '+' || p_file_size_bytes || '>' || v_quota,
            hint = 'No hay capacidad de almacenamiento disponible para este archivo en el plan del módulo.';
  end if;

  -- Copia canónica de metadata (idéntica a 0097).
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

  -- Ruta EXACTA construida en servidor (idéntica a 0097).
  v_safe := regexp_replace(p_file_name, '[^a-zA-Z0-9._-]', '_', 'g');
  v_path := p_organization_id::text || '/textiles/' || v_id::text || '/' || v_safe;

  insert into public.textile_evidence_upload_intents (
    id, organization_id, created_by, bucket_id, object_path,
    original_filename, safe_filename, expected_size_bytes,
    expected_mime_type, evidence_metadata, expires_at, idempotency_key
  ) values (
    v_id, p_organization_id, v_uid, 'evidences', v_path,
    p_file_name, v_safe, p_file_size_bytes,
    p_file_mime_type, v_meta,
    now() + make_interval(mins => least(greatest(coalesce(p_ttl_minutes, 30), 5), 60)),
    p_idempotency_key
  );

  return jsonb_build_object('intent_id', v_id, 'object_path', v_path, 'reused', false);
end;
$$;

revoke all on function public.begin_textile_evidence_upload_v2(uuid, text, bigint, text, jsonb, integer, text) from public, anon;
grant execute on function public.begin_textile_evidence_upload_v2(uuid, text, bigint, text, jsonb, integer, text) to authenticated;

comment on function public.begin_textile_evidence_upload_v2(uuid, text, bigint, text, jsonb, integer, text) is
  'T9F.3 · begin con RESERVA ATÓMICA: bajo los mismos advisory locks que el trigger y finalize, exige (confirmadas + reservas activas + 1 <= límite) y (confirmado + reservado + declarado <= cuota), con fail-closed ante tamaños desconocidos o contradictorios; valida acceso del módulo (Demo vencido/deshabilitado/sin asignar no reservan); idempotente por (org, usuario, clave). Conserva TODAS las validaciones de 0097 (rol, archivo, MIME, extensión, metadata canónica, ruta en servidor, tope 20 MB).';

-- La firma HISTÓRICA de 0097 se conserva (CREATE OR REPLACE, sin DROP):
-- delega en v2 sin clave de idempotencia. Suites y clientes previos siguen
-- funcionando y reciben las MISMAS protecciones nuevas.
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
begin
  return public.begin_textile_evidence_upload_v2(
    p_organization_id, p_file_name, p_file_size_bytes,
    p_file_mime_type, p_metadata, p_ttl_minutes, null
  );
end;
$$;

-- finalize (0098) — MISMA FIRMA, revalidación T9F.3: bajo los mismos locks,
-- vuelve a exigir acceso del módulo, límite (contando las DEMÁS reservas
-- activas) y cuota (contando las DEMÁS reservas) con el tamaño REAL antes de
-- crear la evidencia y consumir el intent. Dos finalizes del mismo intent →
-- una evidencia (idempotencia de 0098 intacta); dos intents distintos no
-- pueden superar límite ni cuota. Política de tamaño CONSERVADA de 0098: el
-- tamaño real debe COINCIDIR con el declarado/reservado (contrato estricto;
-- un real mayor NUNCA amplía la reserva en silencio: se rechaza y el flujo
-- existente de fallo limpia el objeto) — decisión documentada en el informe.
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
  v_access jsonb;
  v_mode text;
  v_limit record;
  v_confirmed bigint;
  v_other_reserved_units bigint;
  v_quota bigint;
  v_snap record;
  v_other_reserved_bytes bigint;
begin
  -- Revalidación COMPLETA en PostgreSQL aunque la invocación venga del
  -- servidor: el service role jamás sustituye membresía ni rol (0098).
  if p_actor_id is null then
    raise exception 'ACTOR_REQUIRED';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_actor_id) then
    raise exception 'ACTOR_NOT_FOUND';
  end if;
  if p_intent_id is null then
    raise exception 'INTENT_REQUIRED';
  end if;

  -- Locks ANTES del FOR UPDATE del intent: mismo orden que begin/trigger —
  -- serialización total de reservas, finalizaciones y creaciones directas.
  select organization_id into v_intent.organization_id
    from public.textile_evidence_upload_intents where id = p_intent_id;
  if v_intent.organization_id is null then
    raise exception 'INTENT_NOT_FOUND';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('module_resource:' || v_intent.organization_id::text || '/textiles/evidences', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('module_storage:' || v_intent.organization_id::text || '/textiles', 0)
  );

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

  -- Idempotencia (idéntica a 0098): doble finalize → mismo evidence_id.
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

  -- Tamaño y MIME reales (derivados por el servidor del objeto físico ANTES
  -- de llamar) contra lo declarado/reservado — contrato estricto de 0098.
  if p_file_size_bytes is null or p_file_size_bytes <> v_intent.expected_size_bytes
     or p_file_size_bytes <= 0 or p_file_size_bytes > 20 * 1024 * 1024 then
    raise exception 'OBJECT_SIZE_MISMATCH';
  end if;
  if p_file_mime_type is null or p_file_mime_type <> v_intent.expected_mime_type then
    raise exception 'OBJECT_MIME_MISMATCH';
  end if;

  -- T9F.3: REVALIDACIÓN de acceso, límite y cuota — no se confía en begin.
  -- Bajo service_role auth.uid() es NULL: el acceso se evalúa DIRECTAMENTE
  -- sobre organization_modules (la membresía y el rol del actor REAL ya se
  -- validaron arriba contra p_actor_id, como en 0098).
  select to_jsonb(m.*) into v_access
    from organization_modules m
   where m.organization_id = v_intent.organization_id and m.module_code = 'textiles';
  if v_access is null then
    raise exception 'MODULE_ACCESS_BLOCKED' using detail = 'not_assigned';
  end if;
  if coalesce((v_access->>'enabled')::boolean, false) is distinct from true then
    raise exception 'MODULE_ACCESS_BLOCKED' using detail = 'disabled';
  end if;
  if (v_access->>'access_mode') = 'demo'
     and v_access->>'access_expires_at' is not null
     and (v_access->>'access_expires_at')::timestamptz <= now() then
    raise exception 'MODULE_ACCESS_BLOCKED' using detail = 'demo_expired';
  end if;
  v_mode := v_access->>'access_mode';

  select pl.limit_value, pl.is_unlimited into v_limit
    from plan_limits pl
   where pl.plan_code = v_mode and pl.resource_code = 'evidences';
  if v_limit is not null and not v_limit.is_unlimited and v_limit.limit_value is not null then
    select count(*) into v_confirmed
      from textile_evidences t where t.organization_id = v_intent.organization_id;
    select count(*) into v_other_reserved_units
      from textile_evidence_upload_intents i
     where i.organization_id = v_intent.organization_id
       and i.status = 'pending' and i.expires_at > now()
       and i.id <> v_intent.id;
    -- ESTA reserva se convierte en consumo: confirmadas + otras reservas + 1.
    if v_confirmed + v_other_reserved_units + 1 > v_limit.limit_value then
      raise exception 'EVIDENCE_LIMIT_EXCEEDED'
        using detail = v_confirmed || '+' || v_other_reserved_units || '/' || v_limit.limit_value;
    end if;
  end if;

  select storage_limit_bytes into v_quota from plan_definitions where code = v_mode;
  if v_quota is null then
    raise exception 'STORAGE_QUOTA_UNVERIFIABLE';
  end if;
  select * into v_snap from module_storage_snapshot(v_intent.organization_id, 'textiles');
  if v_snap is null then
    raise exception 'STORAGE_USAGE_UNVERIFIABLE';
  end if;
  if v_snap.unknown_size_count > 0 or v_snap.conflict_count > 0 then
    raise exception 'STORAGE_UNVERIFIABLE'
      using detail = 'unknown=' || v_snap.unknown_size_count || ' conflicts=' || v_snap.conflict_count;
  end if;
  -- reserved_bytes incluye ESTE intent: al convertirse en consumo, el total
  -- comprometido no cambia — se exige (confirmado + reservado) <= cuota.
  v_other_reserved_bytes := v_snap.reserved_bytes - v_intent.expected_size_bytes;
  if v_snap.committed_bytes + v_other_reserved_bytes + p_file_size_bytes > v_quota then
    raise exception 'STORAGE_QUOTA_EXCEEDED'
      using detail = v_snap.committed_bytes || '+' || v_other_reserved_bytes || '+' || p_file_size_bytes || '>' || v_quota;
  end if;

  v_meta := v_intent.evidence_metadata;

  -- (a) La evidencia nace de la METADATA CANÓNICA del intento (0098).
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

  -- (b) Consumo + vínculo en la MISMA transacción (guard 0097 re-verifica):
  -- la reserva se convierte en consumo confirmado exactamente una vez.
  update public.textile_evidence_upload_intents
     set status = 'consumed',
         consumed_at = now(),
         evidence_id = v_intent.id
   where id = v_intent.id;

  return jsonb_build_object('evidence_id', v_intent.id, 'already_finalized', false);
end;
$$;

-- Grants de 0098 CONSERVADOS: server-only.
revoke all on function public.finalize_textile_evidence_upload_server(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.finalize_textile_evidence_upload_server(uuid, uuid, bigint, text) to service_role;

comment on function public.finalize_textile_evidence_upload_server(uuid, uuid, bigint, text) is
  'T9F.3 · finalize AUTORITATIVO: bajo los mismos advisory locks que begin y el trigger, revalida acceso del módulo, límite (confirmadas + OTRAS reservas + 1) y cuota (confirmado + OTRAS reservas + tamaño real) con fail-closed ante tamaños desconocidos/contradictorios; conserva la idempotencia y el contrato estricto declarado=real de 0098. Server-only (service_role).';

-- ----------------------------------------------------------------------------
-- §6b · T9F.4 · RESERVA GENERAL de almacenamiento CPR/TrazaDocs
-- ----------------------------------------------------------------------------
-- Bloqueadores 4 y 9: TODO upload CPR (evidencias y maestro descargable —
-- inicial y reemplazo) nace de un INTENT DURABLE creado ANTES de subir un
-- solo byte, con la MISMA arquitectura de reservas de Textiles (0094/0101
-- §6): el intent pending no vencido reserva sus bytes bajo el advisory lock
-- de cuota del módulo; si algo falla tras el upload, el objeto conserva una
-- referencia durable (el intent) y sus bytes SIGUEN contando hasta una
-- resolución server-only confirmada. TrazaDocs Textiles no tiene documentos
-- descargables (los vivos no suben archivos): sus uploads son las evidencias
-- Textiles, ya reservadas por 0094 — sin tercera arquitectura.

-- begin: crea la referencia durable Y la reserva, bajo el lock de cuota.
create or replace function public.begin_cpr_storage_upload(
  p_resource_type text,
  p_resource_id uuid,
  p_file_name text,
  p_file_size_bytes bigint,
  p_file_mime_type text,
  p_ttl_minutes integer default 30,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_bucket text;
  v_path text;
  v_safe text;
  v_version integer;
  v_access jsonb;
  v_mode text;
  v_quota bigint;
  v_snap record;
  v_existing public.storage_upload_intents%rowtype;
  v_id uuid := gen_random_uuid();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_resource_type not in ('evidence', 'trazadoc_initial', 'trazadoc_replace') then
    raise exception 'RESOURCE_TYPE_INVALID';
  end if;
  if p_file_name is null or length(trim(p_file_name)) = 0 then
    raise exception 'FILE_REQUIRED';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes <= 0
     or p_file_size_bytes > 20 * 1024 * 1024 then
    raise exception 'FILE_SIZE_INVALID';
  end if;
  if p_file_mime_type is null or length(trim(p_file_mime_type)) = 0 then
    raise exception 'FILE_MIME_INVALID';
  end if;
  v_safe := regexp_replace(p_file_name, '[^a-zA-Z0-9._-]', '_', 'g');

  -- La organización, el bucket y la RUTA se derivan SIEMPRE de la fila de
  -- dominio (jamás del navegador) — Bloqueador 9/§24.
  if p_resource_type = 'evidence' then
    select e.organization_id into v_org from evidences e where e.id = p_resource_id;
    if v_org is null then
      raise exception 'EVIDENCE_NOT_FOUND';
    end if;
    if exists (select 1 from evidences e where e.id = p_resource_id
                and e.storage_path is not null and e.storage_path <> '') then
      raise exception 'ALREADY_HAS_FILE';
    end if;
    v_bucket := 'evidences';
    v_path := v_org::text || '/' || p_resource_id::text || '/' || v_safe;
  else
    select d.organization_id,
           case when p_resource_type = 'trazadoc_initial' then 1 else d.current_version + 1 end
      into v_org, v_version
      from trazadoc_file_documents d where d.id = p_resource_id;
    if v_org is null then
      raise exception 'DOCUMENT_NOT_FOUND';
    end if;
    if p_resource_type = 'trazadoc_initial'
       and exists (select 1 from trazadoc_file_documents d where d.id = p_resource_id
                    and coalesce(d.storage_path, '') <> '') then
      raise exception 'ALREADY_HAS_FILE';
    end if;
    v_bucket := 'trazadocs-documents';
    v_path := v_org::text || '/document_files/' || p_resource_id::text || '/v' || v_version::text || '/' || v_safe;
  end if;

  if not is_org_member(v_org) then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
  v_access := resolve_organization_module_access(v_org, 'traceability_6632');
  if coalesce((v_access->>'allowed')::boolean, false) is distinct from true then
    raise exception 'MODULE_ACCESS_BLOCKED'
      using detail = coalesce(v_access->>'reason', 'not_allowed');
  end if;
  v_mode := v_access->>'access_mode';

  perform pg_advisory_xact_lock(
    hashtextextended('module_storage:' || v_org::text || '/traceability_6632', 0)
  );

  -- Idempotencia (§21): la clave vencida JAMÁS bloquea — se marca expired
  -- de forma atómica (libera el índice parcial) y se permite la nueva
  -- operación; su objeto, si existe, sigue contabilizado hasta resolverse.
  if p_idempotency_key is not null then
    update storage_upload_intents
       set status = 'expired'
     where organization_id = v_org and created_by = v_uid
       and idempotency_key = p_idempotency_key
       and status = 'pending' and expires_at <= now();
    select * into v_existing from storage_upload_intents
     where organization_id = v_org and created_by = v_uid
       and idempotency_key = p_idempotency_key
       and status = 'pending' and expires_at > now()
     limit 1;
    if found then
      return jsonb_build_object(
        'intent_id', v_existing.id, 'bucket_id', v_existing.bucket_id,
        'object_path', v_existing.object_path, 'reused', true);
    end if;
  end if;

  -- Ruta ya reservada (reintento del MISMO archivo): un intent no
  -- finalizado sobre la misma ruta se REVIVE (misma reserva, TTL nuevo) —
  -- jamás dos reservas del mismo objeto ni un bloqueo permanente.
  select * into v_existing from storage_upload_intents
   where bucket_id = v_bucket and object_path = v_path
   for update;
  if found then
    if v_existing.status = 'finalized' then
      raise exception 'PATH_ALREADY_FINALIZED';
    end if;
    update storage_upload_intents
       set status = 'pending',
           expected_size_bytes = p_file_size_bytes,
           expected_mime_type = p_file_mime_type,
           created_at = now(),
           expires_at = now() + make_interval(mins => least(greatest(coalesce(p_ttl_minutes, 30), 5), 60)),
           idempotency_key = p_idempotency_key,
           created_by = v_uid,
           cancelled_at = null,
           storage_resolved_at = null
     where id = v_existing.id;
    v_id := v_existing.id;
  end if;

  -- Cuota (mismo fail-closed que Textiles): confirmado + reservado +
  -- entrante <= cuota; desconocidos o conflictos bloquean.
  select storage_limit_bytes into v_quota from plan_definitions where code = v_mode;
  if v_quota is null then
    raise exception 'STORAGE_QUOTA_UNVERIFIABLE';
  end if;
  select * into v_snap from module_storage_snapshot(v_org, 'traceability_6632');
  if v_snap is null then
    raise exception 'STORAGE_USAGE_UNVERIFIABLE';
  end if;
  if v_snap.unknown_size_count > 0 or v_snap.conflict_count > 0 then
    raise exception 'STORAGE_UNVERIFIABLE'
      using detail = 'unknown=' || v_snap.unknown_size_count || ' conflicts=' || v_snap.conflict_count;
  end if;
  if v_snap.committed_bytes
     + (v_snap.reserved_bytes - case when v_existing.id is not null then p_file_size_bytes else 0 end)
     + p_file_size_bytes > v_quota then
    -- (si se revivió un intent, sus bytes ya están dentro de reserved)
    raise exception 'STORAGE_QUOTA_EXCEEDED'
      using detail = v_snap.committed_bytes || '+' || v_snap.reserved_bytes || '+' || p_file_size_bytes || '>' || v_quota;
  end if;

  if v_existing.id is null then
    insert into storage_upload_intents (
      id, organization_id, module_code, resource_type, resource_id,
      bucket_id, object_path, original_filename, safe_filename,
      expected_size_bytes, expected_mime_type, expires_at, idempotency_key, created_by
    ) values (
      v_id, v_org, 'traceability_6632', p_resource_type, p_resource_id,
      v_bucket, v_path, p_file_name, v_safe,
      p_file_size_bytes, p_file_mime_type,
      now() + make_interval(mins => least(greatest(coalesce(p_ttl_minutes, 30), 5), 60)),
      p_idempotency_key, v_uid
    );
  end if;

  return jsonb_build_object('intent_id', v_id, 'bucket_id', v_bucket, 'object_path', v_path, 'reused', false);
end;
$$;

revoke all on function public.begin_cpr_storage_upload(text, uuid, text, bigint, text, integer, text) from public, anon;
grant execute on function public.begin_cpr_storage_upload(text, uuid, text, bigint, text, integer, text) to authenticated;

comment on function public.begin_cpr_storage_upload(text, uuid, text, bigint, text, integer, text) is
  'T9F.4 · Referencia DURABLE + RESERVA atómica ANTES de todo upload CPR/TrazaDocs: deriva organización, bucket y ruta de la fila de dominio, valida acceso comercial y exige (confirmado + reservado + entrante <= cuota) bajo el advisory lock del módulo, fail-closed ante desconocidos; idempotente y con expiración atómica de claves vencidas (jamás bloqueo permanente).';
-- finalize del ADJUNTO de evidencia CPR: convierte la reserva en consumo y
-- fija los campos físicos (vía DEFINER: el guard de §3b no aplica al dueño).
create or replace function public.finalize_evidence_attachment(
  p_intent_id uuid,
  p_file_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_intent public.storage_upload_intents%rowtype;
  v_access jsonb;
  v_mode text;
  v_quota bigint;
  v_snap record;
  v_updated integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  select organization_id into v_intent.organization_id from storage_upload_intents where id = p_intent_id;
  if v_intent.organization_id is null then
    raise exception 'INTENT_NOT_FOUND';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('module_storage:' || v_intent.organization_id::text || '/traceability_6632', 0)
  );
  select * into v_intent from storage_upload_intents where id = p_intent_id for update;
  if not found then
    raise exception 'INTENT_NOT_FOUND';
  end if;
  if v_intent.resource_type <> 'evidence' then
    raise exception 'RESOURCE_TYPE_INVALID';
  end if;
  if v_intent.created_by <> v_uid then
    raise exception 'INTENT_NOT_OWNED';
  end if;
  if v_intent.status = 'finalized' then
    return jsonb_build_object('evidence_id', v_intent.resource_id, 'already_finalized', true);
  end if;
  if v_intent.status <> 'pending' then
    raise exception 'INTENT_NOT_PENDING';
  end if;
  if v_intent.expires_at <= now() then
    raise exception 'INTENT_EXPIRED';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes <> v_intent.expected_size_bytes then
    raise exception 'OBJECT_SIZE_MISMATCH';
  end if;
  v_access := resolve_organization_module_access(v_intent.organization_id, 'traceability_6632');
  if coalesce((v_access->>'allowed')::boolean, false) is distinct from true then
    raise exception 'MODULE_ACCESS_BLOCKED'
      using detail = coalesce(v_access->>'reason', 'not_allowed');
  end if;
  v_mode := v_access->>'access_mode';
  select storage_limit_bytes into v_quota from plan_definitions where code = v_mode;
  if v_quota is null then
    raise exception 'STORAGE_QUOTA_UNVERIFIABLE';
  end if;
  select * into v_snap from module_storage_snapshot(v_intent.organization_id, 'traceability_6632');
  if v_snap is null then
    raise exception 'STORAGE_USAGE_UNVERIFIABLE';
  end if;
  if v_snap.unknown_size_count > 0 or v_snap.conflict_count > 0 then
    raise exception 'STORAGE_UNVERIFIABLE';
  end if;
  if v_snap.committed_bytes + (v_snap.reserved_bytes - v_intent.expected_size_bytes) + p_file_size_bytes > v_quota then
    raise exception 'STORAGE_QUOTA_EXCEEDED';
  end if;

  update evidences
     set storage_path = v_intent.object_path,
         size_bytes = p_file_size_bytes
   where id = v_intent.resource_id
     and organization_id = v_intent.organization_id;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'EVIDENCE_NOT_FOUND';
  end if;

  update storage_upload_intents
     set status = 'finalized', finalized_at = now()
   where id = v_intent.id;

  return jsonb_build_object('evidence_id', v_intent.resource_id, 'already_finalized', false);
end;
$$;

revoke all on function public.finalize_evidence_attachment(uuid, bigint) from public, anon;
grant execute on function public.finalize_evidence_attachment(uuid, bigint) to authenticated;

comment on function public.finalize_evidence_attachment(uuid, bigint) is
  'T9F.4 · Finalización AUTORITATIVA del adjunto de evidencia CPR: bajo el lock de cuota revalida acceso, tamaño real=declarado y cuota con las OTRAS reservas, fija ruta/tamaño (vía DEFINER) y convierte la reserva exactamente una vez (idempotente).';

-- v2 de la finalización inicial y del reemplazo del maestro: los VALORES
-- FÍSICOS salen del INTENT (jamás del navegador) y la reserva se consume en
-- la MISMA transacción en la que la RPC de 0057/0059 fija los campos.
create or replace function public.finalize_trazadoc_file_document_initial_version_v2(
  p_intent_id uuid,
  p_file_size_bytes bigint,
  p_change_note text default 'Borrador inicial'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.storage_upload_intents%rowtype;
  v_result integer;
begin
  select organization_id into v_intent.organization_id from storage_upload_intents where id = p_intent_id;
  if v_intent.organization_id is null then
    raise exception 'INTENT_NOT_FOUND';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('module_storage:' || v_intent.organization_id::text || '/traceability_6632', 0)
  );
  select * into v_intent from storage_upload_intents where id = p_intent_id for update;
  if v_intent.resource_type <> 'trazadoc_initial' then
    raise exception 'RESOURCE_TYPE_INVALID';
  end if;
  if v_intent.created_by is distinct from auth.uid() then
    raise exception 'INTENT_NOT_OWNED';
  end if;
  if v_intent.status = 'finalized' then
    return 1;
  end if;
  if v_intent.status <> 'pending' or v_intent.expires_at <= now() then
    raise exception 'INTENT_NOT_PENDING';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes <> v_intent.expected_size_bytes then
    raise exception 'OBJECT_SIZE_MISMATCH';
  end if;
  if coalesce((resolve_organization_module_access(v_intent.organization_id, 'traceability_6632')->>'allowed')::boolean, false)
     is distinct from true then
    raise exception 'MODULE_ACCESS_BLOCKED';
  end if;

  -- La RPC de 0059 (definer) valida rol/estado del documento y fija los
  -- campos físicos con la RUTA y el NOMBRE del intent — misma transacción.
  v_result := finalize_trazadoc_file_document_initial_version(
    v_intent.resource_id, v_intent.object_path, v_intent.original_filename,
    v_intent.expected_mime_type, p_file_size_bytes, p_change_note
  );

  update storage_upload_intents
     set status = 'finalized', finalized_at = now()
   where id = v_intent.id;
  return v_result;
end;
$$;

revoke all on function public.finalize_trazadoc_file_document_initial_version_v2(uuid, bigint, text) from public, anon;
grant execute on function public.finalize_trazadoc_file_document_initial_version_v2(uuid, bigint, text) to authenticated;

create or replace function public.replace_trazadoc_file_document_v2(
  p_intent_id uuid,
  p_file_size_bytes bigint,
  p_change_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.storage_upload_intents%rowtype;
  v_result integer;
begin
  select organization_id into v_intent.organization_id from storage_upload_intents where id = p_intent_id;
  if v_intent.organization_id is null then
    raise exception 'INTENT_NOT_FOUND';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('module_storage:' || v_intent.organization_id::text || '/traceability_6632', 0)
  );
  select * into v_intent from storage_upload_intents where id = p_intent_id for update;
  if v_intent.resource_type <> 'trazadoc_replace' then
    raise exception 'RESOURCE_TYPE_INVALID';
  end if;
  if v_intent.created_by is distinct from auth.uid() then
    raise exception 'INTENT_NOT_OWNED';
  end if;
  if v_intent.status = 'finalized' then
    return -1; -- idempotencia: el reemplazo YA se aplicó (versión vigente)
  end if;
  if v_intent.status <> 'pending' or v_intent.expires_at <= now() then
    raise exception 'INTENT_NOT_PENDING';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes <> v_intent.expected_size_bytes then
    raise exception 'OBJECT_SIZE_MISMATCH';
  end if;
  if coalesce((resolve_organization_module_access(v_intent.organization_id, 'traceability_6632')->>'allowed')::boolean, false)
     is distinct from true then
    raise exception 'MODULE_ACCESS_BLOCKED';
  end if;
  -- El reemplazo RESERVÓ el nuevo objeto sin liberar el anterior: el
  -- anterior pasa a versión histórica (sigue referenciado y contando).
  v_result := replace_trazadoc_file_document(
    v_intent.resource_id, v_intent.object_path, v_intent.original_filename,
    v_intent.expected_mime_type, p_file_size_bytes, p_change_note
  );

  update storage_upload_intents
     set status = 'finalized', finalized_at = now()
   where id = v_intent.id;
  return v_result;
end;
$$;

revoke all on function public.replace_trazadoc_file_document_v2(uuid, bigint, text) from public, anon;
grant execute on function public.replace_trazadoc_file_document_v2(uuid, bigint, text) to authenticated;

-- Cancelación: sin objeto → la resolución server-only libera; con objeto →
-- queda como candidato contabilizado (equivalente de pending_delete) hasta
-- la resolución confirmada.
create or replace function public.cancel_cpr_storage_upload(
  p_intent_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_intent public.storage_upload_intents%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  select * into v_intent from storage_upload_intents where id = p_intent_id for update;
  if not found then
    raise exception 'INTENT_NOT_FOUND';
  end if;
  if v_intent.created_by <> v_uid then
    raise exception 'INTENT_NOT_OWNED';
  end if;
  if v_intent.status = 'finalized' then
    raise exception 'INTENT_ALREADY_FINALIZED';
  end if;
  update storage_upload_intents
     set status = 'failed', cancelled_at = now()
   where id = v_intent.id;
  return jsonb_build_object('bucket_id', v_intent.bucket_id, 'object_path', v_intent.object_path);
end;
$$;

revoke all on function public.cancel_cpr_storage_upload(uuid) from public, anon;
grant execute on function public.cancel_cpr_storage_upload(uuid) to authenticated;

-- Resolución FÍSICA server-only (el cliente jamás "confirma" retiros):
-- p_removed=true exige que el servidor haya confirmado el retiro (o la
-- inexistencia) del objeto; solo entonces los bytes dejan de contar.
create or replace function public.resolve_cpr_upload_intent_object(
  p_intent_id uuid,
  p_removed boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.storage_upload_intents%rowtype;
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
begin
  -- SERVER-ONLY: con claims presentes, solo service_role (mismo patrón que
  -- las funciones server-only de 0095/0098).
  if v_claims is not null
     and coalesce(v_claims::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'SERVER_ONLY';
  end if;
  select * into v_intent from storage_upload_intents where id = p_intent_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_intent.status = 'finalized' then
    return 'finalized';
  end if;
  if p_removed then
    update storage_upload_intents
       set storage_resolved_at = now(),
           status = case
             when status = 'pending' and expires_at <= now() then 'expired'
             when status = 'pending' then 'failed'
             else status
           end,
           last_cleanup_attempt_at = now()
     where id = v_intent.id;
    return 'resolved';
  end if;
  update storage_upload_intents
     set cleanup_attempts = cleanup_attempts + 1,
         last_cleanup_attempt_at = now()
   where id = v_intent.id;
  return v_intent.status;
end;
$$;

revoke all on function public.resolve_cpr_upload_intent_object(uuid, boolean) from public, anon, authenticated;
grant execute on function public.resolve_cpr_upload_intent_object(uuid, boolean) to service_role;

comment on function public.resolve_cpr_upload_intent_object(uuid, boolean) is
  'T9F.4 · SERVER-ONLY: registra el resultado REAL del retiro del objeto de un intent CPR/TrazaDocs. Solo un retiro (o inexistencia) CONFIRMADO por el servidor libera los bytes; un fallo deja el intent como candidato contabilizado (equivalente de delete_failed).';

-- ----------------------------------------------------------------------------
-- §7 · Vista de USO REAL por módulo — física, con reservas y desconocidos
-- ----------------------------------------------------------------------------
-- T9F.3: (a) los objetos en ciclo de eliminación cuentan hasta 'deleted';
-- (b) size NULL con ruta = tamaño DESCONOCIDO — JAMÁS cero (sin COALESCE
-- permisivo): se expone storage_unknown_size_count y la aplicación bloquea
-- cargas mientras sea > 0; (c) storage_reserved_bytes expone los bytes
-- comprometidos por reservas activas (intents textiles pending no vencidos).
-- Identidad física = (bucket, ruta); tamaño = MÁXIMO CONOCIDO entre
-- referencias; conflicto = tamaños CONOCIDOS contradictorios (fail-closed).
create or replace view public.v_organization_module_usage
with (security_barrier = true) as
with cpr_objects as (
  -- Todas las referencias CPR a objetos físicos (bucket + ruta + tamaño;
  -- el tamaño se propaga TAL CUAL: NULL significa desconocido).
  select organization_id, 'evidences'::text as bucket_id, storage_path as object_path, size_bytes
    from public.evidences
   where storage_path is not null and storage_path <> ''
  union all
  select organization_id, 'trazadocs-documents'::text, storage_path, size_bytes
    from public.trazadoc_file_documents
   where storage_path is not null and storage_path <> ''
  union all
  -- T9F.2 · Bloqueador 4: TODAS las versiones históricas que conservan
  -- objeto, CADA UNA con SU PROPIO tamaño.
  select organization_id, 'trazadocs-documents'::text, storage_path, size_bytes
    from public.trazadoc_file_document_versions
   where storage_path is not null and storage_path <> ''
  union all
  -- Ciclo de eliminación (T9F.3): pending_delete y delete_failed SIGUEN
  -- contando; solo 'deleted' (retiro físico confirmado) libera espacio.
  select organization_id, bucket_id, object_path, size_bytes
    from public.storage_orphan_candidates
   where module_code = 'traceability_6632' and status <> 'deleted'
  union all
  -- T9F.4: intents CPR/TrazaDocs no finalizados NI resueltos (failed,
  -- expired o pending vencidos): su objeto, si existe, SIGUE contando con
  -- el tamaño declarado hasta la resolución server-only confirmada.
  select organization_id, bucket_id, object_path, expected_size_bytes
    from public.storage_upload_intents
   where status <> 'finalized' and storage_resolved_at is null
     and (status in ('failed', 'expired') or expires_at <= now())
),
cpr_dedup as (
  -- Identidad física = (bucket, ruta): cada objeto se cuenta UNA sola vez.
  -- max ignora NULL: si alguna referencia conoce el tamaño, gobierna el
  -- MÁXIMO CONOCIDO (conservador); si NINGUNA lo conoce, el objeto es
  -- DESCONOCIDO y no se suma como cero: se contabiliza en unknown.
  select organization_id, bucket_id, object_path,
         max(size_bytes) as size_bytes,
         (count(size_bytes) = 0)::int as size_unknown,
         (count(distinct size_bytes) > 1)::int as size_conflict
    from cpr_objects
   group by organization_id, bucket_id, object_path
),
cpr_storage as (
  select organization_id,
         coalesce(sum(size_bytes) filter (where size_unknown = 0), 0) as storage_used_bytes,
         sum(size_unknown)  as storage_unknown_size_count,
         sum(size_conflict) as storage_object_conflicts
    from cpr_dedup
   group by organization_id
),
textile_objects as (
  select organization_id, 'evidences'::text as bucket_id, file_path as object_path, file_size_bytes as size_bytes
    from public.textile_evidences
   where file_path is not null and file_path <> ''
  union all
  select organization_id, bucket_id, object_path, size_bytes
    from public.storage_orphan_candidates
   where module_code = 'textiles' and status <> 'deleted'
  union all
  -- T9F.4 · Bloqueador 5: intents Textiles failed o pending-vencidos sin
  -- resolución confirmada ('expired' SOLO se marca tras retiro confirmado,
  -- 0097; el caso consumido lo cubre la evidencia — dedup por ruta).
  select organization_id, 'evidences'::text, object_path, expected_size_bytes
    from public.textile_evidence_upload_intents
   where status = 'failed' or (status = 'pending' and expires_at <= now())
),
textile_dedup as (
  select organization_id, bucket_id, object_path,
         max(size_bytes) as size_bytes,
         (count(size_bytes) = 0)::int as size_unknown,
         (count(distinct size_bytes) > 1)::int as size_conflict
    from textile_objects
   group by organization_id, bucket_id, object_path
),
textile_storage as (
  select organization_id,
         coalesce(sum(size_bytes) filter (where size_unknown = 0), 0) as storage_used_bytes,
         sum(size_unknown)  as storage_unknown_size_count,
         sum(size_conflict) as storage_object_conflicts
    from textile_dedup
   group by organization_id
),
cpr_reserved as (
  -- T9F.4: reservas ACTIVAS de los intents CPR/TrazaDocs.
  select organization_id, sum(expected_size_bytes) as storage_reserved_bytes
    from public.storage_upload_intents
   where status = 'pending' and expires_at > now()
   group by organization_id
),
textile_reserved as (
  -- Reservas ACTIVAS (T9F.3 §13): pending y no vencidas. Las vencidas,
  -- canceladas o consumidas dejan de comprometer capacidad por definición.
  select organization_id, sum(expected_size_bytes) as storage_reserved_bytes
    from public.textile_evidence_upload_intents
   where status = 'pending' and expires_at > now()
   group by organization_id
)
-- ── Fila CPR (traceability_6632) ─────────────────────────────────────────────
select
  o.id                                          as organization_id,
  'traceability_6632'::text                     as module_code,
  coalesce(td.documents_count, 0)
    + coalesce(fdc.documents_count, 0)          as documents_trazadocs_count,
  coalesce(sup.suppliers_count, 0)              as suppliers_count,
  coalesce(mat.materials_count, 0)              as materials_count,
  coalesce(prod.products_count, 0)              as products_count,
  coalesce(ev.evidences_count, 0)               as evidences_count,
  coalesce(po.production_orders_count, 0)       as production_orders_count,
  coalesce(ib.input_batches_count, 0)           as input_batches_count,
  coalesce(ob.output_batches_count, 0)          as output_batches_count,
  coalesce(cs.storage_used_bytes, 0)            as storage_used_bytes,
  coalesce(cr.storage_reserved_bytes, 0)        as storage_reserved_bytes,
  coalesce(cs.storage_unknown_size_count, 0)    as storage_unknown_size_count,
  coalesce(cs.storage_object_conflicts, 0)      as storage_object_conflicts
from public.organizations o
left join (
  -- TrazaDocs CPR: solo documentos del módulo CPR (module_key servido por
  -- trigger de 0082, jamás por el cliente).
  select organization_id, count(*) as documents_count
  from public.trazadoc_documents where module_key = 'cpr' group by organization_id
) td on td.organization_id = o.id
left join (
  -- T9F.4 · Bloqueador 1: los DESCARGABLES del maestro son documentos
  -- LÓGICOS y consumen el MISMO límite compartido (semántica de 0059);
  -- las versiones históricas NO suman unidades (solo almacenamiento).
  select organization_id, count(*) as documents_count
  from public.trazadoc_file_documents group by organization_id
) fdc on fdc.organization_id = o.id
left join (
  select organization_id, count(*) as suppliers_count
  from public.suppliers group by organization_id
) sup on sup.organization_id = o.id
left join (
  select organization_id, count(*) as materials_count
  from public.materials group by organization_id
) mat on mat.organization_id = o.id
left join (
  select organization_id, count(*) as products_count
  from public.products group by organization_id
) prod on prod.organization_id = o.id
left join (
  select organization_id, count(*) as evidences_count
  from public.evidences group by organization_id
) ev on ev.organization_id = o.id
left join (
  select organization_id, count(*) as production_orders_count
  from public.production_orders group by organization_id
) po on po.organization_id = o.id
left join (
  select organization_id, count(*) as input_batches_count
  from public.input_batches group by organization_id
) ib on ib.organization_id = o.id
left join (
  select organization_id, count(*) as output_batches_count
  from public.output_batches group by organization_id
) ob on ob.organization_id = o.id
left join cpr_storage cs on cs.organization_id = o.id
left join cpr_reserved cr on cr.organization_id = o.id
where public.is_org_member(o.id) or public.is_platform_staff()

union all

-- ── Fila Textiles ────────────────────────────────────────────────────────────
select
  o.id                                          as organization_id,
  'textiles'::text                              as module_code,
  coalesce(ttd.documents_count, 0)              as documents_trazadocs_count,
  coalesce(tsup.suppliers_count, 0)             as suppliers_count,
  coalesce(tmat.materials_count, 0)             as materials_count,
  coalesce(tprod.products_count, 0)             as products_count,
  coalesce(tev.evidences_count, 0)              as evidences_count,
  coalesce(tpo.production_orders_count, 0)      as production_orders_count,
  coalesce(til.input_batches_count, 0)          as input_batches_count,
  coalesce(tol.output_batches_count, 0)         as output_batches_count,
  coalesce(ts.storage_used_bytes, 0)            as storage_used_bytes,
  coalesce(tr.storage_reserved_bytes, 0)        as storage_reserved_bytes,
  coalesce(ts.storage_unknown_size_count, 0)    as storage_unknown_size_count,
  coalesce(ts.storage_object_conflicts, 0)      as storage_object_conflicts
from public.organizations o
left join (
  select organization_id, count(*) as documents_count
  from public.trazadoc_documents where module_key = 'textiles' group by organization_id
) ttd on ttd.organization_id = o.id
left join (
  select organization_id, count(*) as suppliers_count
  from public.textile_suppliers group by organization_id
) tsup on tsup.organization_id = o.id
left join (
  select organization_id, count(*) as materials_count
  from public.textile_materials group by organization_id
) tmat on tmat.organization_id = o.id
left join (
  select organization_id, count(*) as products_count
  from public.textile_products group by organization_id
) tprod on tprod.organization_id = o.id
left join (
  select organization_id, count(*) as evidences_count
  from public.textile_evidences group by organization_id
) tev on tev.organization_id = o.id
left join (
  select organization_id, count(*) as production_orders_count
  from public.textile_production_orders group by organization_id
) tpo on tpo.organization_id = o.id
left join (
  select organization_id, count(*) as input_batches_count
  from public.textile_input_lots group by organization_id
) til on til.organization_id = o.id
left join (
  select organization_id, count(*) as output_batches_count
  from public.textile_output_lots group by organization_id
) tol on tol.organization_id = o.id
left join textile_storage ts on ts.organization_id = o.id
left join textile_reserved tr on tr.organization_id = o.id
where public.is_org_member(o.id) or public.is_platform_staff();

revoke all on public.v_organization_module_usage from public, anon;
grant select on public.v_organization_module_usage to authenticated;

comment on view public.v_organization_module_usage is
  'T9F.3 · Uso REAL por módulo: conteos por recurso y almacenamiento FÍSICO deduplicado por (bucket, ruta) — evidencias, maestro actual, TODAS las versiones (cada una con su tamaño) y objetos del ciclo de eliminación hasta confirmarse deleted. storage_used_bytes = suma de tamaños CONOCIDOS; storage_unknown_size_count = objetos con ruta y tamaño NULL (bloquean cargas: jamás cuentan cero); storage_reserved_bytes = reservas activas (intents pending no vencidos); storage_object_conflicts = tamaños conocidos contradictorios (fail-closed). Solo miembros o personal de plataforma.';

-- ----------------------------------------------------------------------------
-- §8 · Verificación previa de capacidad (fail-closed) — con RESERVAS
-- ----------------------------------------------------------------------------
-- T9F.3: pasa a SECURITY DEFINER con GATE EXPLÍCITO de membresía (resolve →
-- not_member queda como decisión verificada y negativa, igual que antes)
-- porque el conteo de evidencias Textiles debe INCLUIR las reservas activas
-- de TODOS los usuarios de la organización y la RLS de intents es
-- creator-only. El resto de recursos se sigue leyendo de la vista (cuyo
-- guard de membresía permanece efectivo: auth.uid() es el del invocante).
-- NOTA: esta función INFORMA (UX temprana); la AUTORIDAD es el trigger de §5.
create or replace function public.check_module_resource_allowance(
  p_organization_id uuid,
  p_module_code text,
  p_resource_code text,
  p_requested_increment integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_access       jsonb;
  v_mode         text;
  v_limit        record;
  v_current      bigint;
begin
  if p_requested_increment is null or p_requested_increment < 1 then
    return jsonb_build_object('verified', false, 'allowed', false, 'reason', 'invalid_increment');
  end if;

  if not exists (select 1 from modules m where m.code = p_module_code and m.is_functional) then
    return jsonb_build_object('verified', false, 'allowed', false, 'reason', 'module_not_functional');
  end if;

  v_access := resolve_organization_module_access(p_organization_id, p_module_code);
  if coalesce((v_access ->> 'allowed')::boolean, false) is distinct from true then
    -- Acceso del módulo bloqueado (no miembro, no asignado, deshabilitado,
    -- Demo vencido): decisión VERIFICADA y negativa. El gate de membresía
    -- de esta función DEFINER es exactamente este camino (not_member).
    return jsonb_build_object(
      'verified', true, 'allowed', false,
      'reason', coalesce(v_access ->> 'reason', 'not_allowed')
    );
  end if;
  v_mode := v_access ->> 'access_mode';

  select pl.limit_value, pl.is_unlimited into v_limit
    from plan_limits pl
   where pl.plan_code = v_mode and pl.resource_code = p_resource_code;

  if v_limit is null then
    -- El recurso no tiene límite definido en el catálogo: permitido.
    return jsonb_build_object(
      'verified', true, 'allowed', true, 'reason', 'no_limit',
      'access_mode', v_mode, 'resource_code', p_resource_code,
      'requested_increment', p_requested_increment
    );
  end if;
  if v_limit.is_unlimited then
    return jsonb_build_object(
      'verified', true, 'allowed', true, 'reason', 'unlimited',
      'access_mode', v_mode, 'resource_code', p_resource_code,
      'requested_increment', p_requested_increment
    );
  end if;

  if p_module_code = 'textiles' and p_resource_code = 'evidences' then
    -- Confirmadas + RESERVAS ACTIVAS (T9F.3 §13): mismo conteo que el
    -- trigger, begin y finalize — una única semántica autoritativa.
    v_current := count_module_resource(p_organization_id, 'textiles', 'evidences');
  else
    select case p_resource_code
             when 'documents_trazadocs' then u.documents_trazadocs_count
             when 'suppliers'           then u.suppliers_count
             when 'materials'           then u.materials_count
             when 'products'            then u.products_count
             when 'evidences'           then u.evidences_count
             when 'production_orders'   then u.production_orders_count
             when 'input_batches'       then u.input_batches_count
             when 'output_batches'      then u.output_batches_count
             else null
           end
      into v_current
      from v_organization_module_usage u
     where u.organization_id = p_organization_id and u.module_code = p_module_code;
  end if;

  if v_current is null then
    -- Recurso no contabilizado por módulo (p. ej. team_members, org-global)
    -- o fila de uso ausente: NO se puede verificar → la aplicación bloquea.
    return jsonb_build_object('verified', false, 'allowed', false, 'reason', 'usage_unverifiable');
  end if;

  return jsonb_build_object(
    'verified', true,
    'allowed', (v_current + p_requested_increment) <= v_limit.limit_value,
    'reason', case when (v_current + p_requested_increment) <= v_limit.limit_value then 'within_limit' else 'limit_exceeded' end,
    'access_mode', v_mode,
    'resource_code', p_resource_code,
    'current_count', v_current,
    'limit_value', v_limit.limit_value,
    'requested_increment', p_requested_increment
  );
end;
$$;

revoke all on function public.check_module_resource_allowance(uuid, text, text, integer) from public, anon;
grant execute on function public.check_module_resource_allowance(uuid, text, text, integer) to authenticated;

comment on function public.check_module_resource_allowance(uuid, text, text, integer) is
  'T9F.2/T9F.3 · Verificación PREVIA fail-closed de capacidad para un incremento (importaciones incluidas). DEFINER con gate de membresía vía resolve (not_member ⇒ verificado y negativo); para evidencias Textiles usa el MISMO conteo autoritativo del trigger (confirmadas + reservas activas). verified=false ⇒ la aplicación bloquea. La AUTORIDAD final es el trigger BEFORE INSERT de §5.';

-- ----------------------------------------------------------------------------
-- §9 · audit_log: FK a organizations RETIRADA (filas e inmutabilidad INTACTAS)
-- ----------------------------------------------------------------------------
-- La FK impedía FÍSICAMENTE eliminar una organización mientras existiera
-- cualquier evento (todas las creaciones auditan) y el trigger de
-- inmutabilidad — que NO se toca — impide el UPDATE que exigiría ON DELETE
-- SET NULL. Requisito T9F.3 §34: los eventos de auditoría no deben impedir
-- eliminar organizaciones (QA / ciclo de vida). Retirar la restricción NO
-- debilita la auditoría: las filas quedan verbatim (organization_id conserva
-- su valor histórico), siguen siendo inmutables e imborrables, y el índice
-- por organización se mantiene. Solo desaparece el veto referencial.
alter table public.audit_log
  drop constraint audit_log_organization_id_fkey;

comment on column public.audit_log.organization_id is
  'Identificador histórico de la organización (sin FK desde T9F.3: el evento sobrevive verbatim e inmutable a la eliminación de la organización; jamás se reescribe).';

-- ----------------------------------------------------------------------------
-- §10 · Índices de apoyo
-- ----------------------------------------------------------------------------
-- Reservas activas por organización (begin/finalize/vista/allowance).
create index textile_upload_intents_active_reservation_idx
  on public.textile_evidence_upload_intents (organization_id, status, expires_at);
-- Versiones por organización (vista/snapshot; puede existir de 0084).
create index if not exists trazadoc_file_document_versions_org_idx
  on public.trazadoc_file_document_versions (organization_id);

-- ----------------------------------------------------------------------------
-- §11 · Verificaciones posteriores (documentación; NO ejecutar aquí)
-- ----------------------------------------------------------------------------
-- Tras aplicar 0101 en staging (guía TRAZALOOP_T9F3_APPLY_LATER_GUIDE.md):
--   1) select tgname from pg_trigger where tgname like 't\_%\_limit' escape '\';
--      → 15 triggers (8 CPR + 7 Textiles).
--   2) INSERT directo como miembro al límite → error RESOURCE_LIMIT_EXCEEDED.
--   3) begin hasta agotar cuota/límite → EVIDENCE_LIMIT_EXCEEDED /
--      STORAGE_QUOTA_EXCEEDED; con size NULL sembrado → STORAGE_UNVERIFIABLE.
--   4) has_function_privilege('authenticated', 'register_storage_orphan(uuid,text,text,text,bigint)', 'execute') → false.
--   5) La vista expone storage_reserved_bytes y storage_unknown_size_count.
--   6) Dos finalizes concurrentes del mismo intent → una sola evidencia.
-- ============================================================================
-- FIN 0101 (acumulada T9F.1 + T9F.2 + T9F.3)
-- ============================================================================
