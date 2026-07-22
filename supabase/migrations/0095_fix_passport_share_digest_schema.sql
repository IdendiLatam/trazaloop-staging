-- ============================================================================
-- Trazaloop · Sprint T9E.1 (Textil) · Corrección de la RPC pública del
-- pasaporte: digest() calificado con su esquema real
-- ============================================================================
--
-- DEFECTO (encontrado por la prueba RLS REAL de T9E.1, jamás por los tests
-- estáticos): resolve_textile_passport_share (0092) fija
-- `set search_path = public` (correcto por seguridad) pero invoca
-- `digest(p_token, 'sha256')` SIN calificar. En este proyecto pgcrypto vive
-- en el esquema `extensions`, así que la RPC fallaba EN EJECUCIÓN con
-- "function digest(text, unknown) does not exist" para TODO enlace —
-- el enlace privado del pasaporte no resolvía desde 0092.
--
-- CORRECCIÓN (única diferencia con 0092): `extensions.digest(...)`.
-- El search_path permanece fijado a `public` (no se añade `extensions` al
-- path: la calificación explícita es más robusta y no amplía resolución de
-- nombres). Mismo cuerpo, misma firma, mismos grants (anon + authenticated,
-- revocado de public). 0092 NO se modifica retroactivamente.
--
-- ROLLBACK: re-ejecutar la definición de la función tal como aparece en
-- 0092 (restaura el defecto) — documentado solo por completitud.
-- ============================================================================

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

  -- pgcrypto vive en `extensions`: calificación explícita (fix T9E.1).
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

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

-- Mismos grants que 0092: solo la RPC es pública, jamás la tabla.
revoke execute on function public.resolve_textile_passport_share(text) from public;
grant execute on function public.resolve_textile_passport_share(text) to anon, authenticated;
