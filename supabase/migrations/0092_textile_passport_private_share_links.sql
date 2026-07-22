-- 0092_textile_passport_private_share_links.sql
-- Trazaloop · Sprint T9D (Textil) · Enlaces privados compartibles del pasaporte
-- técnico textil: tokenizados, revocables y con expiración.
--
-- Añade la tabla textile_technical_passport_share_links y la RPC pública
-- controlada resolve_textile_passport_share (SECURITY DEFINER) que resuelve un
-- token por su HASH y devuelve una vista REDUCIDA y segura del snapshot
-- histórico. La app nunca guarda el token en claro: solo su hash (sha256) y un
-- prefijo para identificarlo en la UI. El token completo se muestra una sola
-- vez, al crearlo.
--
-- SEGURIDAD (ejes):
--   · token_hash único; token en claro nunca se persiste.
--   · organization_id/passport_id/token_hash inmutables tras crear.
--   · RLS deny-by-default: solo miembros ven los enlaces de su organización;
--     admin/quality crean y revocan; consultant solo lee. anon NO tiene SELECT.
--   · La ruta pública tokenizada NO lee la tabla directamente: usa la RPC
--     resolve_textile_passport_share, que valida hash + estado + expiración +
--     límite de accesos y devuelve solo un snapshot reducido (sin token_hash,
--     sin data_sources_json completo, sin signed URLs, sin datos de otras orgs).
--   · Mensaje genérico ante token inválido/expirado/revocado (no revela org).
--
-- ALCANCE: solo lectura de textile_technical_passports (snapshot ya generado) +
-- escritura de la propia tabla de enlaces. Sin portal público indexable, sin
-- búsqueda pública, sin PDF server-side, sin IA/ACV/huella, sin planes por
-- módulo. CERO cambios CPR. El enlace NO convierte el pasaporte en DPP oficial
-- ni certificación: es consulta técnica controlada de un snapshot histórico.

-- ---------------------------------------------------------------------------
-- 1. Tabla de enlaces compartibles
-- ---------------------------------------------------------------------------
create table public.textile_technical_passport_share_links (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete restrict,
  passport_id               uuid not null,

  -- Token: solo se guarda el hash (sha256 hex) y un prefijo corto para la UI.
  token_hash                text not null,
  token_prefix              text,
  label                     text,

  status                    text not null default 'active',
  expires_at                timestamptz,
  revoked_at                timestamptz,
  revoked_by                uuid references public.profiles (id),

  last_accessed_at          timestamptz,
  access_count              integer not null default 0,
  max_access_count          integer,

  -- Alcance de la vista compartida (qué secciones se exponen).
  allowed_snapshot_version  integer,
  include_evidences         boolean not null default true,
  include_warnings          boolean not null default true,
  include_recommendations   boolean not null default true,
  include_traceability      boolean not null default true,
  include_circularity       boolean not null default true,
  include_trazadocs         boolean not null default true,

  created_by                uuid references public.profiles (id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint textile_passport_share_links_org_id_uniq unique (organization_id, id),
  constraint textile_passport_share_links_token_hash_uniq unique (token_hash),
  constraint textile_passport_share_links_status_check
    check (status in ('active', 'revoked', 'expired', 'disabled')),
  constraint textile_passport_share_links_access_check
    check (access_count >= 0 and (max_access_count is null or max_access_count > 0)),
  -- El enlace pertenece a un pasaporte de la MISMA organización (FK compuesta).
  constraint textile_passport_share_links_passport_fk
    foreign key (organization_id, passport_id)
    references public.textile_technical_passports (organization_id, id) on delete cascade
);

create index idx_textile_passport_share_links_passport
  on public.textile_technical_passport_share_links (organization_id, passport_id);
create index idx_textile_passport_share_links_status
  on public.textile_technical_passport_share_links (organization_id, status);

-- ---------------------------------------------------------------------------
-- 2. Triggers estándar (espejo del resto del módulo)
-- ---------------------------------------------------------------------------
create trigger t_textile_passport_share_links_updated_at
  before update on public.textile_technical_passport_share_links
  for each row execute function public.set_updated_at();
create trigger t_textile_passport_share_links_force_created_by
  before insert on public.textile_technical_passport_share_links
  for each row execute function public.force_created_by();
create trigger t_textile_passport_share_links_org_immutable
  before update on public.textile_technical_passport_share_links
  for each row execute function public.prevent_organization_id_change();
create trigger t_audit_textile_passport_share_links
  after insert or update or delete on public.textile_technical_passport_share_links
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- 3. Inmutabilidad de identidad y token (no se pueden reescribir tras crear)
-- ---------------------------------------------------------------------------
create or replace function public.protect_textile_passport_share_link()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.passport_id is distinct from old.passport_id
       or new.token_hash is distinct from old.token_hash
       or new.token_prefix is distinct from old.token_prefix
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'La identidad y el token de un enlace compartible no pueden modificarse. Cree un enlace nuevo.';
    end if;
    -- Un enlace revocado no puede reactivarse (revocar es irreversible).
    if old.status = 'revoked' and new.status is distinct from 'revoked' then
      raise exception 'Un enlace revocado no puede reactivarse. Cree un enlace nuevo.';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.protect_textile_passport_share_link() from public, anon, authenticated;

create trigger t_textile_passport_share_links_protect
  before update on public.textile_technical_passport_share_links
  for each row execute function public.protect_textile_passport_share_link();

-- ---------------------------------------------------------------------------
-- 4. RLS por organización (deny-by-default; anon SIN acceso)
-- ---------------------------------------------------------------------------
alter table public.textile_technical_passport_share_links enable row level security;

-- SELECT: solo miembros de la organización (incluye consultant para lectura).
create policy textile_passport_share_links_select
  on public.textile_technical_passport_share_links
  for select to authenticated using (public.is_org_member(organization_id));

-- INSERT: admin/quality (consultant no crea enlaces).
create policy textile_passport_share_links_insert
  on public.textile_technical_passport_share_links
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality']));

-- UPDATE: admin/quality (revocar, deshabilitar, cambiar expiración).
create policy textile_passport_share_links_update
  on public.textile_technical_passport_share_links
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']))
  with check (public.has_org_role(organization_id, array['admin','quality']));

-- DELETE: admin/quality (rara vez; revocar es la vía normal).
create policy textile_passport_share_links_delete
  on public.textile_technical_passport_share_links
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

-- ---------------------------------------------------------------------------
-- 5. RPC pública controlada: resolver token → snapshot REDUCIDO
--    La ruta tokenizada (sin login) llama SOLO a esta función. anon nunca lee
--    la tabla. Valida hash + estado + expiración + límite de accesos, registra
--    el acceso y devuelve un snapshot reducido según los flags include_*.
--    NUNCA devuelve token_hash, data_sources_json completo ni signed URLs.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_textile_passport_share(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_link record;
  v_passport record;
  v_snapshot jsonb;
  v_sections jsonb;
  v_now timestamptz := now();
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select * into v_link
    from textile_technical_passport_share_links
   where token_hash = v_hash;

  -- Mensaje genérico: no revela si el token existe ni a qué organización.
  if v_link.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;
  if v_link.status <> 'active'
     or v_link.revoked_at is not null
     or (v_link.expires_at is not null and v_link.expires_at <= v_now)
     or (v_link.max_access_count is not null and v_link.access_count >= v_link.max_access_count) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;

  select * into v_passport
    from textile_technical_passports
   where id = v_link.passport_id and organization_id = v_link.organization_id;
  if v_passport.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;

  -- Registro de acceso controlado (no bloquea la lectura).
  update textile_technical_passport_share_links
     set access_count = access_count + 1,
         last_accessed_at = v_now
   where id = v_link.id;

  -- Snapshot REDUCIDO: se parte del snapshot histórico y se recortan las
  -- secciones según los flags include_*. Nunca se exponen data_sources_json,
  -- token_hash ni rutas de archivo.
  v_snapshot := coalesce(v_passport.snapshot_json, '{}'::jsonb);
  v_sections := coalesce(v_snapshot->'sections', '{}'::jsonb);

  if not v_link.include_evidences then v_sections := v_sections - 'evidences'; end if;
  if not v_link.include_traceability then v_sections := v_sections - 'traceability'; end if;
  if not v_link.include_circularity then v_sections := v_sections - 'circularity'; end if;
  if not v_link.include_trazadocs then v_sections := v_sections - 'trazadocs'; end if;

  return jsonb_build_object(
    'ok', true,
    'passport', jsonb_build_object(
      'passport_code', v_passport.passport_code,
      'passport_version', v_passport.passport_version,
      'status', v_passport.status,
      'generated_at', v_passport.generated_at,
      'source_hash_short', left(coalesce(v_passport.source_hash, ''), 12),
      'organization_name', (select name from organizations where id = v_passport.organization_id),
      'snapshot', jsonb_build_object(
        'schema_version', v_snapshot->'schema_version',
        'scope', v_snapshot->'scope',
        'organization', v_snapshot->'organization',
        'sections', v_sections,
        'disclaimer', v_snapshot->'disclaimer'
      ),
      'gaps', case when v_link.include_warnings then coalesce(v_passport.gaps_json, '[]'::jsonb) else '[]'::jsonb end,
      'warnings', case when v_link.include_warnings then coalesce(v_passport.warnings_json, '[]'::jsonb) else '[]'::jsonb end,
      'recommendations', case when v_link.include_recommendations then coalesce(v_passport.recommendations_json, '[]'::jsonb) else '[]'::jsonb end
    ),
    'share', jsonb_build_object(
      'label', v_link.label,
      'expires_at', v_link.expires_at
    )
  );
end;
$$;
-- La RPC es invocable por anon Y authenticated (la ruta tokenizada no requiere
-- login). NO se concede SELECT sobre la tabla a anon: solo esta función.
revoke execute on function public.resolve_textile_passport_share(text) from public;
grant execute on function public.resolve_textile_passport_share(text) to anon, authenticated;
