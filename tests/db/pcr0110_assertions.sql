-- ============================================================================
-- tests/db/pcr0110_assertions.sql · hotfix 0110
-- Regresión REAL (PostgreSQL local desechable) de la calificación de pgcrypto
-- en public.create_platform_organization.
--
-- Reproduce el defecto que el lint de Production detectó:
--   public.create_platform_organization
--   function gen_random_bytes(integer) does not exist   (SQLSTATE 42883)
--
-- Causa raíz: pgcrypto vive en el schema `extensions` (no en `public`) y las
-- dos SECURITY DEFINER afectadas fijan `search_path = public`, por lo que la
-- llamada SIN calificar no resuelve dentro de ellas.
--
-- La corrección NO amplía el search_path (patrón 0095/0096): califica la
-- llamada como extensions.gen_random_bytes(32).
--
-- Marcadores obligatorios:
--   PCR0110_PGCRYPTO_SCHEMA        = PASS
--   PCR0110_TWO_OVERLOADS          = PASS
--   PCR0110_SECURITY_DEFINER       = PASS
--   PCR0110_SEARCH_PATH_PUBLIC     = PASS
--   PCR0110_QUALIFIED_DEFINITION   = PASS   (adicional)
--   PCR0110_UNQUALIFIED_ROOT_CAUSE = PASS
--   PCR0110_QUALIFIED_CALL         = PASS
-- ============================================================================

-- ── 1/2 · pgcrypto instalado y alojado EXACTAMENTE en `extensions` ──────────
do $$
declare
  v_schema text;
begin
  select n.nspname
    into v_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pgcrypto';

  if v_schema is null then
    raise exception
      'FALLO PCR-0110: pgcrypto no está instalado (el arnés debe reproducir Supabase)';
  end if;

  if v_schema <> 'extensions' then
    raise exception
      'FALLO PCR-0110: pgcrypto vive en "%", se esperaba "extensions" (alojamiento de Supabase)',
      v_schema;
  end if;

  -- La función concreta que rompía debe existir SOLO bajo `extensions`.
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where p.proname = 'gen_random_bytes'
       and n.nspname = 'extensions'
  ) then
    raise exception
      'FALLO PCR-0110: no existe extensions.gen_random_bytes()';
  end if;

  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where p.proname = 'gen_random_bytes'
       and n.nspname = 'public'
  ) then
    raise exception
      'FALLO PCR-0110: existe public.gen_random_bytes() — el arnés NO reproduce Production';
  end if;

  raise notice '✔ pgcrypto instalado en "extensions" y ausente de "public" (fidelidad Production)';
  raise notice 'PCR0110_PGCRYPTO_SCHEMA = PASS';
end $$;

-- ── 3/4 · exactamente DOS overloads, con 8 y 9 argumentos ──────────────────
do $$
declare
  v_count   int;
  v_nargs   int[];
begin
  select count(*), array_agg(p.pronargs order by p.pronargs)
    into v_count, v_nargs
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'create_platform_organization';

  if v_count <> 2 then
    raise exception
      'FALLO PCR-0110: se esperaban 2 overloads de public.create_platform_organization, hay %',
      v_count;
  end if;

  if v_nargs <> array[8, 9]::int[] then
    raise exception
      'FALLO PCR-0110: aridades inesperadas %, se esperaba {8,9}',
      v_nargs::text;
  end if;

  raise notice '✔ dos overloads exactos de public.create_platform_organization (8 y 9 argumentos)';
  raise notice 'PCR0110_TWO_OVERLOADS = PASS';
end $$;

-- ── 5 · ambos siguen siendo SECURITY DEFINER ───────────────────────────────
do $$
declare
  v_bad int;
begin
  select count(*)
    into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'create_platform_organization'
     and p.prosecdef is not true;

  if v_bad <> 0 then
    raise exception
      'FALLO PCR-0110: % overload(s) perdieron SECURITY DEFINER', v_bad;
  end if;

  raise notice '✔ ambos overloads conservan SECURITY DEFINER';
  raise notice 'PCR0110_SECURITY_DEFINER = PASS';
end $$;

-- ── 6 · ambos siguen fijando search_path=public (NO se amplió a extensions) ─
do $$
declare
  r        record;
  v_seen   int := 0;
begin
  for r in
    select p.pronargs, p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'create_platform_organization'
  loop
    v_seen := v_seen + 1;

    if r.proconfig is null then
      raise exception
        'FALLO PCR-0110: el overload de % argumentos no fija search_path', r.pronargs;
    end if;

    if not (r.proconfig @> array['search_path=public']) then
      raise exception
        'FALLO PCR-0110: el overload de % argumentos no fija search_path=public (proconfig = %)',
        r.pronargs, r.proconfig::text;
    end if;

    -- La solución aprobada NO amplía el search_path: califica la llamada.
    if exists (
      select 1 from unnest(r.proconfig) as c(v)
       where c.v like 'search_path=%' and c.v like '%extensions%'
    ) then
      raise exception
        'FALLO PCR-0110: el overload de % argumentos amplió el search_path a extensions (patrón vetado)',
        r.pronargs;
    end if;
  end loop;

  if v_seen <> 2 then
    raise exception 'FALLO PCR-0110: se inspeccionaron % overloads, se esperaban 2', v_seen;
  end if;

  raise notice '✔ ambos overloads conservan search_path=public sin ampliarlo a extensions';
  raise notice 'PCR0110_SEARCH_PATH_PUBLIC = PASS';
end $$;

-- ── 7/8 · la definición REAL califica pgcrypto y no conserva la llamada rota ─
do $$
declare
  r      record;
  v_def  text;
  v_seen int := 0;
begin
  for r in
    select p.oid, p.pronargs
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'create_platform_organization'
  loop
    v_seen := v_seen + 1;
    v_def := pg_get_functiondef(r.oid);

    if position('extensions.gen_random_bytes(32)' in v_def) = 0 then
      raise exception
        'FALLO PCR-0110: el overload de % argumentos no califica extensions.gen_random_bytes(32)',
        r.pronargs;
    end if;

    -- Llamada defectuosa efectiva: encode() sobre gen_random_bytes SIN calificar.
    if position('encode(gen_random_bytes(32)' in v_def) > 0 then
      raise exception
        'FALLO PCR-0110: el overload de % argumentos conserva encode(gen_random_bytes(32)',
        r.pronargs;
    end if;
  end loop;

  if v_seen <> 2 then
    raise exception 'FALLO PCR-0110: se inspeccionaron % definiciones, se esperaban 2', v_seen;
  end if;

  raise notice '✔ pg_get_functiondef() de ambos overloads califica pgcrypto y no conserva la llamada rota';
  raise notice 'PCR0110_QUALIFIED_DEFINITION = PASS';
end $$;

-- ── 9 · reproducción de la CAUSA RAÍZ con search_path=public ───────────────
do $$
declare
  v_dummy bytea;
begin
  -- Mismo contexto que las SECURITY DEFINER afectadas (local a esta
  -- transacción: no altera el search_path del resto del arnés).
  perform set_config('search_path', 'public', true);

  begin
    -- EXECUTE evita el caché de planes: la resolución ocurre AQUÍ.
    execute 'select gen_random_bytes(32)' into v_dummy;

    raise exception
      'FALLO PCR-0110: gen_random_bytes(32) SIN calificar resolvió con search_path=public; '
      'el arnés no está reproduciendo la causa raíz de Production';
  exception
    when undefined_function then
      raise notice
        '✔ causa raíz reproducida: gen_random_bytes(32) sin calificar → undefined_function (42883)';
  end;

  raise notice 'PCR0110_UNQUALIFIED_ROOT_CAUSE = PASS';
end $$;

-- ── 10/11 · la llamada CALIFICADA funciona y produce 64 hex ────────────────
do $$
declare
  v_bytes bytea;
  v_token text;
begin
  perform set_config('search_path', 'public', true);

  -- 10: resuelve pese a search_path=public, porque está calificada.
  execute 'select extensions.gen_random_bytes(32)' into v_bytes;
  if v_bytes is null or octet_length(v_bytes) <> 32 then
    raise exception
      'FALLO PCR-0110: extensions.gen_random_bytes(32) no devolvió 32 bytes (devolvió %)',
      coalesce(octet_length(v_bytes)::text, 'NULL');
  end if;

  -- 11: exactamente la expresión del token de invitación de la migración.
  execute $q$select encode(extensions.gen_random_bytes(32), 'hex')$q$ into v_token;
  if v_token is null or length(v_token) <> 64 then
    raise exception
      'FALLO PCR-0110: el token no mide 64 caracteres (mide %)',
      coalesce(length(v_token)::text, 'NULL');
  end if;
  if v_token !~ '^[0-9a-f]{64}$' then
    raise exception
      'FALLO PCR-0110: el token no es hexadecimal en minúsculas: %', v_token;
  end if;

  raise notice
    '✔ encode(extensions.gen_random_bytes(32), ''hex'') → 64 caracteres hexadecimales con search_path=public';
  raise notice 'PCR0110_QUALIFIED_CALL = PASS';
end $$;
