-- ===========================================================================
-- 0164 · PE-04B3 · CUOTA CANÓNICA DE ALMACENAMIENTO POR EMPRESA
-- ---------------------------------------------------------------------------
-- Antes de esta migración convivían DOS contabilidades de almacenamiento que
-- no coincidían (inventario completo en PE_04B3_STORAGE_INVENTORY.md):
--
--   · `v_organization_plan_usage` — alcance empresa, pero SIN versiones de
--     TrazaDocs, SIN reservas vivas y SIN huérfanos, y con el límite salido de
--     `organization_subscriptions` con `coalesce(..., 'demo')`.
--   · `module_storage_snapshot` — completa, pero de alcance MÓDULO y con el
--     límite salido de `plan_definitions` por modo de acceso del módulo.
--
-- Resultado: una empresa Full con PCR y Textiles disponía de 500 MB EN CADA
-- MÓDULO, y el logo —que no aparece en ninguna de las dos rutas que reservan—
-- no descontaba de ninguno. El negocio congeló en PE-04B2 lo contrario: UNA
-- SOLA CUOTA COMPARTIDA POR EMPRESA.
--
-- 0164 deja tres piezas y una sola verdad:
--   1. `organization_storage_usage`  — SOLO uso, alcance empresa, todas las
--      familias, sin ninguna lógica de plan.
--   2. `organization_storage_quota`  — SOLO cuota, leída de
--      `plan_revision_limits.storage_bytes` (recurso ya declarado con
--      `scope = 'organization'` en 0162). Sin respaldo legacy.
--   3. `organization_storage_guard`  — la ÚNICA reserva: bajo un advisory lock
--      POR EMPRESA, exige confirmado + reservado + entrante <= cuota.
--
-- y reescribe `begin_cpr_storage_upload` y `begin_textile_evidence_upload_v2`
-- para que ambas llamen a esa misma reserva. El cuerpo de las dos funciones se
-- copia literal de su definición vigente (creadas en 0101): lo único que
-- cambia es el bloque de cuota. Se cambian por parafraseo funciones ajenas
-- rompe cosas que nadie estaba mirando (lección de 0163).
--
-- NO se toca `module_storage_snapshot`: sigue existiendo para la vista por
-- módulo y para la limpieza server-only. Deja de ser quien decide.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · USO CANÓNICO — alcance empresa, sin plan
-- ---------------------------------------------------------------------------
create or replace function public.organization_storage_usage(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_committed bigint;
  v_reserved  bigint;
  v_unknown   bigint;
  v_conflict  bigint;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not (public.is_org_member(p_organization_id) or public.is_platform_staff()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  with objs as (
    -- Evidencias PCR
    select 'evidences'::text as bucket_id, e.storage_path as object_path, e.size_bytes
      from public.evidences e
     where e.organization_id = p_organization_id
       and e.storage_path is not null and e.storage_path <> ''
    union all
    -- Documentos de archivo TrazaDocs (versión vigente)
    select 'trazadocs-documents', d.storage_path, d.size_bytes
      from public.trazadoc_file_documents d
     where d.organization_id = p_organization_id
       and d.storage_path is not null and d.storage_path <> ''
    union all
    -- Versiones históricas de TrazaDocs. `v_organization_plan_usage` las
    -- ignoraba: ocupaban espacio real que el cliente no veía en su uso.
    select 'trazadocs-documents', v.storage_path, v.size_bytes
      from public.trazadoc_file_document_versions v
     where v.organization_id = p_organization_id
       and v.storage_path is not null and v.storage_path <> ''
    union all
    -- Evidencias Textiles (mismo bucket que PCR, prefijo distinto)
    select 'evidences', t.file_path, t.file_size_bytes
      from public.textile_evidences t
     where t.organization_id = p_organization_id
       and t.file_path is not null and t.file_path <> ''
    union all
    -- LOGO · lo que hay FÍSICAMENTE bajo el prefijo de la empresa en
    -- `organization-assets`. Se mide el bucket y no la columna declarada
    -- porque la ruta del logo incluye la extensión
    -- (`{org}/logo/logo.{ext}`): subir un PNG y después un WEBP dejaba el
    -- anterior en el bucket, sin fila que lo referenciara y sin candidato
    -- huérfano —bytes que nadie medía—. Este bucket no tiene mecanismo de
    -- huérfanos (`storage_orphan_candidates` solo admite los dos buckets de
    -- módulo), así que medirlo es la única contabilidad posible.
    select 'organization-assets', o.name, (o.metadata ->> 'size')::bigint
      from storage.objects o
     where o.bucket_id = 'organization-assets'
       and o.name like p_organization_id::text || '/%'
    union all
    -- …y si la empresa declara un logo cuyo objeto NO existe, cuenta por lo
    -- declarado: sin dato no es cero. Nunca se describe la misma ruta dos
    -- veces, de modo que declarado y físico jamás se contradicen entre sí.
    select 'organization-assets', g.logo_storage_path, g.logo_size_bytes
      from public.organizations g
     where g.id = p_organization_id
       and g.logo_storage_path is not null and g.logo_storage_path <> ''
       and not exists (
         select 1 from storage.objects o2
          where o2.bucket_id = 'organization-assets' and o2.name = g.logo_storage_path)
    union all
    -- Huérfanos pendientes de retirada: siguen ocupando.
    select c.bucket_id, c.object_path, c.size_bytes
      from public.storage_orphan_candidates c
     where c.organization_id = p_organization_id
       and c.status <> 'deleted'
    union all
    -- Intents Textiles sin resolución confirmada (T9F.4 · Bloqueador 5).
    select i.bucket_id, i.object_path, i.expected_size_bytes
      from public.textile_evidence_upload_intents i
     where i.organization_id = p_organization_id
       and (i.status = 'failed' or (i.status = 'pending' and i.expires_at <= now()))
    union all
    -- Intents CPR/TrazaDocs sin resolución confirmada; el tamaño que cuenta es
    -- el MAYOR entre el declarado y el físico (T9F.5B.1 · A06): reservar 1 MB
    -- y subir 5 MB no puede dejar 4 MB de capacidad ficticia.
    select g.bucket_id, g.object_path,
           greatest(g.expected_size_bytes,
                    coalesce((o.metadata ->> 'size')::bigint, 0))
      from public.storage_upload_intents g
      left join storage.objects o
        on o.bucket_id = g.bucket_id and o.name = g.object_path
     where g.organization_id = p_organization_id
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
    count(*) filter (where size_unknown)::bigint,
    count(*) filter (where size_conflict)::bigint
    into v_committed, v_unknown, v_conflict
    from dedup;

  -- RESERVAS VIVAS (intents pending y vigentes de AMBAS familias). Se cuentan
  -- aparte porque su objeto puede no existir todavía.
  select
    coalesce((select sum(i.expected_size_bytes)
                from public.textile_evidence_upload_intents i
               where i.organization_id = p_organization_id
                 and i.status = 'pending' and i.expires_at > now()), 0)::bigint
  + coalesce((select sum(greatest(g.expected_size_bytes,
                                  coalesce((o.metadata ->> 'size')::bigint, 0)))
                from public.storage_upload_intents g
                left join storage.objects o
                  on o.bucket_id = g.bucket_id and o.name = g.object_path
               where g.organization_id = p_organization_id
                 and g.status = 'pending' and g.expires_at > now()), 0)::bigint
    into v_reserved;

  return jsonb_build_object(
    'status', 'ok',
    'committed_bytes', v_committed,
    'reserved_bytes', v_reserved,
    'used_bytes', v_committed + v_reserved,
    'unknown_size_count', v_unknown,
    'conflict_count', v_conflict
  );
end;
$$;

revoke all on function public.organization_storage_usage(uuid) from public, anon;
grant execute on function public.organization_storage_usage(uuid) to authenticated;

comment on function public.organization_storage_usage(uuid) is
  'PE-04B3 · USO de almacenamiento de la empresa, y solo uso: evidencias PCR, documentos y VERSIONES de TrazaDocs, evidencias Textiles, prefijo físico del logo, huérfanos e intents no resueltos, deduplicado por (bucket, ruta). No conoce planes ni cuotas. El contenido de `tutorial-media` es de la plataforma y queda fuera a propósito.';

-- ---------------------------------------------------------------------------
-- 2 · CUOTA CANÓNICA — solo plan, sin uso
-- ---------------------------------------------------------------------------
create or replace function public.organization_storage_quota(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_plan jsonb;
  v_lim  jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not (public.is_org_member(p_organization_id) or public.is_platform_staff()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  v_plan := public.plan_effective_for_organization(p_organization_id, now());
  if v_plan->>'status' <> 'found' then
    -- Ni se inventa un número ni se cae al plan más bajo. Quien lea esto niega.
    return jsonb_build_object('status', v_plan->>'status');
  end if;

  v_lim := public.plan_limit_for_revision((v_plan->>'plan_revision_id')::uuid, 'storage_bytes');

  return jsonb_build_object(
    'status', 'found',
    'plan_code', v_plan->>'plan_code',
    'grant_kind', v_plan->>'grant_kind',
    'ends_at', v_plan->'ends_at',
    'limit_state', v_lim->>'status',
    'limit_bytes', v_lim->'value'
  );
end;
$$;

revoke all on function public.organization_storage_quota(uuid) from public, anon;
grant execute on function public.organization_storage_quota(uuid) to authenticated;

comment on function public.organization_storage_quota(uuid) is
  'PE-04B3 · CUOTA de almacenamiento de la empresa, y solo cuota: plan efectivo (0162/0163) y `plan_revision_limits.storage_bytes`. Tres estados de límite: finite, unlimited y not_configured — el tercero NIEGA. Sin respaldo en `plan_definitions` ni en `organization_subscriptions`.';

-- `organization_commercial_storage_bytes` (0163) pasa a ser un alias delgado:
-- un solo resolutor, no dos que puedan divergir.
create or replace function public.organization_commercial_storage_bytes(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.organization_storage_quota(p_organization_id);
$$;

comment on function public.organization_commercial_storage_bytes(uuid) is
  'PE-04B3 · Alias de `organization_storage_quota`. Se conserva el nombre introducido en 0163 para no romper llamantes; la lógica vive en un solo sitio.';

-- ---------------------------------------------------------------------------
-- 3 · ESTADO — cuota + uso, con los cuatro estados del producto
-- ---------------------------------------------------------------------------
create or replace function public.organization_storage_status(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_q     jsonb;
  v_u     jsonb;
  v_quota bigint;
  v_used  bigint;
  v_state text;
  v_reason text := null;
begin
  v_q := public.organization_storage_quota(p_organization_id);
  v_u := public.organization_storage_usage(p_organization_id);

  -- QUOTA_UNAVAILABLE cubre las cuatro maneras de NO poder afirmar capacidad.
  -- Un uso no verificable también deja el estado indeterminado: enseñar
  -- «dentro del límite» cuando hay objetos de tamaño desconocido sería
  -- afirmar algo que no se sabe.
  if v_q->>'status' <> 'found' then
    v_reason := case v_q->>'status' when 'absent' then 'plan_absent' else 'plan_unreadable' end;
  elsif v_q->>'limit_state' = 'not_configured' then
    v_reason := 'limit_not_configured';
  elsif (v_u->>'unknown_size_count')::bigint > 0 or (v_u->>'conflict_count')::bigint > 0 then
    v_reason := 'usage_unverifiable';
  end if;

  if v_reason is not null then
    return jsonb_build_object(
      'state', 'QUOTA_UNAVAILABLE',
      'reason', v_reason,
      'plan_code', v_q->'plan_code',
      'limit_state', v_q->'limit_state',
      'quota_bytes', v_q->'limit_bytes',
      'committed_bytes', v_u->'committed_bytes',
      'reserved_bytes', v_u->'reserved_bytes',
      'used_bytes', v_u->'used_bytes',
      'remaining_bytes', null,
      'unknown_size_count', v_u->'unknown_size_count',
      'conflict_count', v_u->'conflict_count'
    );
  end if;

  v_used := (v_u->>'used_bytes')::bigint;

  if v_q->>'limit_state' = 'unlimited' then
    return jsonb_build_object(
      'state', 'WITHIN_LIMIT',
      'reason', null,
      'plan_code', v_q->'plan_code',
      'limit_state', 'unlimited',
      'quota_bytes', null,
      'committed_bytes', v_u->'committed_bytes',
      'reserved_bytes', v_u->'reserved_bytes',
      'used_bytes', v_used,
      'remaining_bytes', null,
      'unknown_size_count', v_u->'unknown_size_count',
      'conflict_count', v_u->'conflict_count'
    );
  end if;

  v_quota := (v_q->>'limit_bytes')::bigint;
  v_state := case
               when v_used < v_quota then 'WITHIN_LIMIT'
               when v_used = v_quota then 'AT_LIMIT'
               else 'OVER_LIMIT'
             end;

  return jsonb_build_object(
    'state', v_state,
    'reason', null,
    'plan_code', v_q->'plan_code',
    'limit_state', 'finite',
    'quota_bytes', v_quota,
    'committed_bytes', v_u->'committed_bytes',
    'reserved_bytes', v_u->'reserved_bytes',
    'used_bytes', v_used,
    -- Nunca negativo: por encima del límite lo que queda es cero, no una deuda.
    'remaining_bytes', greatest(v_quota - v_used, 0),
    'unknown_size_count', v_u->'unknown_size_count',
    'conflict_count', v_u->'conflict_count'
  );
end;
$$;

revoke all on function public.organization_storage_status(uuid) from public, anon;
grant execute on function public.organization_storage_status(uuid) to authenticated;

comment on function public.organization_storage_status(uuid) is
  'PE-04B3 · Estado de almacenamiento de la empresa: WITHIN_LIMIT | AT_LIMIT | OVER_LIMIT | QUOTA_UNAVAILABLE. QUOTA_UNAVAILABLE lleva `reason` (plan_absent, plan_unreadable, limit_not_configured, usage_unverifiable) y NIEGA cargas nuevas; jamás borra nada.';

-- ---------------------------------------------------------------------------
-- 4 · LA RESERVA — un solo lock, por EMPRESA
-- ---------------------------------------------------------------------------
-- Orden de locks acordado y respetado por los dos llamantes: primero los del
-- MÓDULO (recurso y almacenamiento), después el de la EMPRESA. Sin un orden
-- fijo, dos módulos de la misma empresa se abrazarían.
create or replace function public.organization_storage_guard(
  p_organization_id uuid,
  p_requested_bytes bigint,
  p_already_counted_bytes bigint default 0
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_st    jsonb;
  v_quota bigint;
  v_used  bigint;
begin
  if p_requested_bytes is null or p_requested_bytes < 0 then
    raise exception 'STORAGE_REQUEST_INVALID';
  end if;

  -- UN lock por empresa: PCR, Textiles y el logo compiten por el MISMO cupo.
  perform pg_advisory_xact_lock(
    hashtextextended('organization_storage:' || p_organization_id::text, 0)
  );

  v_st := public.organization_storage_status(p_organization_id);

  if v_st->>'state' = 'QUOTA_UNAVAILABLE' then
    if v_st->>'reason' = 'usage_unverifiable' then
      raise exception 'STORAGE_UNVERIFIABLE'
        using detail = 'unknown=' || (v_st->>'unknown_size_count')
                    || ' conflicts=' || (v_st->>'conflict_count'),
              hint = 'Existen objetos con tamaño desconocido o contradictorio: se requiere reconciliación antes de nuevas cargas.';
    end if;
    raise exception 'STORAGE_QUOTA_UNVERIFIABLE'
      using detail = coalesce(v_st->>'reason', 'unknown'),
            hint = 'No se pudo comprobar la capacidad contratada de tu empresa. No se subió nada.';
  end if;

  if v_st->>'limit_state' = 'unlimited' then
    return v_st;
  end if;

  v_quota := (v_st->>'quota_bytes')::bigint;
  v_used  := (v_st->>'used_bytes')::bigint - coalesce(p_already_counted_bytes, 0);

  if v_used + p_requested_bytes > v_quota then
    raise exception 'STORAGE_QUOTA_EXCEEDED'
      using detail = v_used || '+' || p_requested_bytes || '>' || v_quota,
            hint = 'No hay capacidad de almacenamiento disponible para este archivo en el plan de tu empresa.';
  end if;

  return v_st;
end;
$$;

revoke all on function public.organization_storage_guard(uuid, bigint, bigint) from public, anon;
grant execute on function public.organization_storage_guard(uuid, bigint, bigint) to authenticated;

comment on function public.organization_storage_guard(uuid, bigint, bigint) is
  'PE-04B3 · ÚNICA reserva de almacenamiento del producto. Bajo `pg_advisory_xact_lock` POR EMPRESA exige confirmado + reservado - ya_contado + entrante <= cuota, con fail-closed ante plan ilegible, límite sin configurar o tamaños no verificables. `p_already_counted_bytes` es para lo que se REEMPLAZA (un intent revivido, el logo anterior): sin él se cobraría dos veces.';

-- ---------------------------------------------------------------------------
-- 5 · LOS DOS CAMINOS QUE YA RESERVABAN, AHORA CONTRA EL MISMO CUPO
-- ---------------------------------------------------------------------------
-- Las dos funciones se reproducen ÍNTEGRAS a partir de su definición vigente
-- (creadas en 0101, nunca redefinidas): rol, validación de archivo, MIME,
-- extensión, metadata canónica, ruta construida en servidor, idempotencia,
-- locks de módulo y límite de unidades quedan EXACTAMENTE igual. Lo único que
-- cambia es el bloque de cuota, sustituido por la llamada a
-- `organization_storage_guard`. Parafrasear el resto es cómo se rompió la
-- creación de empresas en 0163; aquí se copia.
create or replace function public.begin_cpr_storage_upload(p_resource_type text, p_resource_id uuid, p_file_name text, p_file_size_bytes bigint, p_file_mime_type text, p_ttl_minutes integer DEFAULT 30, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_max_file bigint;
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
  -- T9F.5B · A14 · Barrera ESTRUCTURAL únicamente (máximo técnico superior
  -- del catálogo = 25 MB, igual que el CHECK de la tabla de intents). El
  -- tope REAL por (tipo de recurso, plan) se aplica más abajo, en cuanto se
  -- conoce el access_mode vigente: aquí aún no se sabe a qué organización
  -- ni a qué plan pertenece la carga.
  if p_file_size_bytes is null or p_file_size_bytes <= 0
     or p_file_size_bytes > 25 * 1024 * 1024 then
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

  -- T9F.5B · A14 · Tope POR ARCHIVO específico del tipo de recurso y del
  -- plan VIGENTE (no un 20 MB común): evidencia CPR 20 MB; TrazaDocs Demo
  -- 10 MB; TrazaDocs Full/Extra 25 MB. Un modo desconocido falla cerrado.
  v_max_file := cpr_upload_max_file_bytes(p_resource_type, v_mode);
  if v_max_file is null then
    raise exception 'FILE_SIZE_LIMIT_UNVERIFIABLE'
      using detail = coalesce(v_mode, 'null') || '/' || p_resource_type;
  end if;
  if p_file_size_bytes > v_max_file then
    raise exception 'FILE_SIZE_INVALID'
      using detail = p_file_size_bytes || '>' || v_max_file || ' (' || p_resource_type || '/' || v_mode || ')';
  end if;

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

  -- PE-04B3 · La cuota ya NO es del módulo ni sale de `plan_definitions`: es
  -- la ÚNICA de la empresa y la exige `organization_storage_guard`, que toma
  -- el lock POR EMPRESA (después del lock de módulo de más arriba: ese orden
  -- es el que evita el abrazo entre PCR y Textiles). El tercer argumento
  -- descuenta los bytes del intent revivido, que ya están dentro de
  -- `reserved`; sin él se cobrarían dos veces.
  perform organization_storage_guard(
    v_org,
    p_file_size_bytes,
    case when v_existing.id is not null then p_file_size_bytes else 0 end
  );

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
$function$
;

comment on function public.begin_cpr_storage_upload(text, uuid, text, bigint, text, integer, text) is
  'T9F.1 · begin con reserva atómica para CPR/TrazaDocs, con la cuota de PE-04B3: el cupo de bytes es el ÚNICO de la empresa (organization_storage_guard), no el del módulo. El resto —rol, archivo, MIME, ruta en servidor, idempotencia, revivido de intent— es literal de 0101.';
create or replace function public.begin_textile_evidence_upload_v2(p_organization_id uuid, p_file_name text, p_file_size_bytes bigint, p_file_mime_type text, p_metadata jsonb, p_ttl_minutes integer DEFAULT 30, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- PE-04B3 · RESERVA DE BYTES contra la cuota ÚNICA de la empresa. El cupo
  -- ya no es «500 MB en Textiles y otros 500 MB en PCR»: es uno solo, y lo
  -- exige `organization_storage_guard` bajo el lock por empresa —tomado
  -- después de los dos locks de módulo de más arriba, siempre en ese orden—.
  -- Aquí no hay intent revivido: el camino idempotente ya retornó.
  perform organization_storage_guard(p_organization_id, p_file_size_bytes, 0);

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
$function$
;

comment on function public.begin_textile_evidence_upload_v2(uuid, text, bigint, text, jsonb, integer, text) is
  'T9F.3 · begin con reserva atómica para Textiles, con la cuota de PE-04B3: las unidades siguen siendo del módulo, pero los BYTES se exigen contra la cuota ÚNICA de la empresa (organization_storage_guard). El resto es literal de 0101.';

-- ---------------------------------------------------------------------------
-- 6 · EL LOGO DEJA DE SER UNA PUERTA SIN MEDIR
-- ---------------------------------------------------------------------------
-- El logo se sube con `upsert` a una ruta fija y NO tiene intent: no hay dónde
-- anotar una reserva persistente sin inventarle un módulo (la tabla de
-- huérfanos exige `module_code` con FK a `modules`, y el logo no es de ningún
-- módulo). Lo que sí puede hacerse —y es lo que faltaba— es exigirle la MISMA
-- cuota, bajo el MISMO lock, contra la MISMA contabilidad, descontando lo que
-- el logo nuevo reemplaza. El resto de bytes del prefijo se mide físicamente,
-- de modo que nada de lo que quede ahí es invisible.
create or replace function public.organization_storage_guard_logo(
  p_organization_id uuid,
  p_size_bytes bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_replaced bigint;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not public.is_org_member(p_organization_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- Lo que el logo nuevo reemplaza: todo lo que la empresa tiene hoy bajo su
  -- prefijo de `organization-assets` (el logo vigente y cualquier resto de una
  -- extensión anterior, que la aplicación retira al subir el nuevo).
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    into v_replaced
    from storage.objects o
   where o.bucket_id = 'organization-assets'
     and o.name like p_organization_id::text || '/%';

  if v_replaced = 0 then
    select coalesce(g.logo_size_bytes, 0)::bigint into v_replaced
      from public.organizations g where g.id = p_organization_id;
  end if;

  return public.organization_storage_guard(p_organization_id, p_size_bytes, v_replaced);
end;
$$;

revoke all on function public.organization_storage_guard_logo(uuid, bigint) from public, anon;
grant execute on function public.organization_storage_guard_logo(uuid, bigint) to authenticated;

comment on function public.organization_storage_guard_logo(uuid, bigint) is
  'PE-04B3 · Cuota del logo contra el cupo ÚNICO de la empresa. Descuenta lo que el logo nuevo reemplaza. Antes el logo solo pasaba por `checkStorageAvailable`, que medía contra una vista sin versiones, sin reservas y sin huérfanos, y con el límite legacy traducido por el puente free→demo: era una puerta lateral sin medir.';

-- ---------------------------------------------------------------------------
-- 7 · RECONCILIACIÓN — lo que la base cree frente a lo que Storage tiene
-- ---------------------------------------------------------------------------
create or replace function public.organization_storage_drift(p_organization_id uuid)
returns table (
  bucket_id text,
  object_path text,
  declared_bytes bigint,
  physical_bytes bigint,
  drift_class text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not public.is_platform_staff() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  with declarado as (
    select 'evidences'::text as b, e.storage_path as p, e.size_bytes as s
      from public.evidences e
     where e.organization_id = p_organization_id
       and e.storage_path is not null and e.storage_path <> ''
    union all
    select 'trazadocs-documents', d.storage_path, d.size_bytes
      from public.trazadoc_file_documents d
     where d.organization_id = p_organization_id
       and d.storage_path is not null and d.storage_path <> ''
    union all
    select 'trazadocs-documents', v.storage_path, v.size_bytes
      from public.trazadoc_file_document_versions v
     where v.organization_id = p_organization_id
       and v.storage_path is not null and v.storage_path <> ''
    union all
    select 'evidences', t.file_path, t.file_size_bytes
      from public.textile_evidences t
     where t.organization_id = p_organization_id
       and t.file_path is not null and t.file_path <> ''
    union all
    select 'organization-assets', g.logo_storage_path, g.logo_size_bytes
      from public.organizations g
     where g.id = p_organization_id
       and g.logo_storage_path is not null and g.logo_storage_path <> ''
  ),
  declarado_u as (
    select b, p, max(s) as s from declarado group by b, p
  ),
  fisico as (
    select o.bucket_id as b, o.name as p, (o.metadata ->> 'size')::bigint as s
      from storage.objects o
     where o.bucket_id in ('evidences', 'trazadocs-documents', 'organization-assets')
       and o.name like p_organization_id::text || '/%'
  ),
  -- Un objeto amparado por un intent vigente o por un candidato huérfano NO es
  -- deriva: está contabilizado y tiene dueño conocido.
  amparado as (
    select i.bucket_id as b, i.object_path as p
      from public.textile_evidence_upload_intents i
     where i.organization_id = p_organization_id and i.status <> 'expired'
    union all
    select g.bucket_id, g.object_path
      from public.storage_upload_intents g
     where g.organization_id = p_organization_id and g.status <> 'cancelled'
    union all
    select c.bucket_id, c.object_path
      from public.storage_orphan_candidates c
     where c.organization_id = p_organization_id and c.status <> 'deleted'
  )
  select
    coalesce(d.b, f.b)::text,
    coalesce(d.p, f.p)::text,
    d.s,
    f.s,
    case
      when f.b is null then 'MISSING_OBJECT'
      when d.b is null then 'UNTRACKED_OBJECT'
      when f.s is null then 'UNKNOWN_SIZE'
      when d.s is null then 'UNDECLARED_SIZE'
      when d.s <> f.s then 'SIZE_MISMATCH'
      else 'MATCH'
    end::text
  from declarado_u d
  full outer join fisico f on f.b = d.b and f.p = d.p
  where not exists (
    select 1 from amparado a
     where a.b = coalesce(d.b, f.b) and a.p = coalesce(d.p, f.p)
  )
  and (
    f.b is null or d.b is null or f.s is null or d.s is null or d.s <> f.s
  );
end;
$$;

revoke all on function public.organization_storage_drift(uuid) from public, anon;
grant execute on function public.organization_storage_drift(uuid) to authenticated;

comment on function public.organization_storage_drift(uuid) is
  'PE-04B3 · Reconciliación: filas donde lo que la base declara y lo que Storage tiene no coinciden (MISSING_OBJECT, UNTRACKED_OBJECT, UNKNOWN_SIZE, UNDECLARED_SIZE, SIZE_MISMATCH). Solo lectura y solo personal de plataforma; NO borra nada ni corrige nada por su cuenta.';
