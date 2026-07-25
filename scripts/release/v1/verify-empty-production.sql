-- ===========================================================================
-- Trazaloop v1.0.0 · VERIFICACIÓN DE BASE DE PRODUCCIÓN LIMPIA
-- scripts/release/v1/verify-empty-production.sql
-- ===========================================================================
--
-- 100 % SOLO LECTURA. Este script no contiene ni un solo INSERT, UPDATE,
-- DELETE, TRUNCATE, ALTER, CREATE ni DROP. La transacción se abre como
-- READ ONLY, de modo que el propio motor rechazaría cualquier escritura
-- accidental introducida en el futuro.
--
-- COMPATIBILIDAD DE EJECUCIÓN
--   Este archivo es SQL y PL/pgSQL PURO. No contiene ningún metacomando de
--   psql: ninguna línea, activa ni comentada, empieza por barra invertida
--   (no hay pset, timing, echo, set, quit ni connect de cliente). Por tanto
--   se ejecuta sin cambios en:
--     · el SQL Editor de Supabase (pegar el archivo completo en una
--       consulta NUEVA y ejecutar);
--     · psql, como SQL normal.
--   Los títulos y separadores son comentarios SQL (`--`), no salidas del
--   cliente: en el SQL Editor se leen en el propio script, y los cálculos
--   del veredicto se emiten con RAISE NOTICE / RAISE WARNING / RAISE
--   EXCEPTION, que sí viajan al cliente.
--
-- QUÉ COMPRUEBA
--   1. Migraciones aplicadas (0001–0102) y ausencia de 0103.
--   2. Censo de DATOS EMPRESARIALES: debe ser 0 en una producción recién
--      creada. Las tablas NO se codifican a mano: se derivan del esquema
--      real (toda tabla base de `public` con columna `organization_id`,
--      más las raíces de tenencia conocidas).
--   2c. AUDITORÍA: `audit_log` se clasifica por fila, no por tabla (ver
--      abajo). Es el único caso mixto además de `textile_fiber_types`.
--   3. Censo de DATOS GLOBALES esperados (semillas, catálogos, planes,
--      metodologías, preguntas, blueprints, documentos legales, fibras).
--   4. Storage: buckets existentes, que sean PRIVADOS y su número de
--      objetos.
--   5. Tablas SIN CLASIFICAR: cualquier tabla nueva que no sea ni
--      claramente empresarial ni claramente global se reporta para
--      revisión humana. Falla cerrado: ante la duda, avisa.
--   6. RLS activo en toda tabla empresarial.
--   7. VEREDICTO final. Si hay cualquier dato empresarial, el script
--      TERMINA CON ERROR (exit code != 0 con ON_ERROR_STOP=1 en psql; en
--      el SQL Editor de Supabase se muestra como error de la consulta).
--
-- TABLAS MIXTAS (filas globales y filas empresariales en la misma tabla)
--   El conteo TOTAL de una tabla mixta NUNCA es criterio de NO-GO: se
--   clasifica FILA A FILA por su vínculo real con una empresa.
--
--   · `audit_log` (0005_audit.sql: `organization_id uuid references
--     public.organizations (id)`, NULLABLE).
--       - organization_id IS NULL      → auditoría GLOBAL de la plataforma,
--         generada por las propias migraciones y por la carga de datos
--         globales (p. ej. `trazadoc_blueprints`, `plan_definitions`).
--         Es legítima, es informativa y NO produce NO-GO. Tampoco se borra:
--         `audit_log` es append-only por trigger (`forbid_mutation`).
--       - organization_id IS NOT NULL  → auditoría de una EMPRESA. Es dato
--         empresarial: entra en el detalle del NO-GO y bloquea el deploy.
--
--   · `textile_fiber_types` (organization_id añadido en 0093, NULLABLE):
--     NULL es el catálogo base global; NOT NULL es una fibra personalizada
--     de una empresa. Se cuenta solo la parte empresarial.
--
--   · `profiles` y `user_legal_acceptances` cuelgan del USUARIO, no de la
--     empresa. El superadministrador oficial de la plataforma tiene un
--     `profiles` (y puede tener aceptaciones legales) sin ser un dato
--     empresarial, así que se excluyen las filas del personal de
--     plataforma (`public.platform_staff`). Cualquier otro usuario sí es
--     un dato empresarial / inesperado.
--
-- SUPERADMINISTRADOR
--   La estructura real (0040_platform_staff.sql) es una fila en
--   `public.platform_staff` con `role_code = 'superadmin'` y
--   `status = 'active'`. NO existe ninguna columna booleana de superadmin.
--   El script acepta los dos momentos del procedimiento:
--     · ANTES de crearlo   → 0 superadmins activos y 0 cuentas en auth.users.
--     · DESPUÉS de crearlo → 1 superadmin activo y 1 cuenta en auth.users.
--   Cualquier otra combinación (cuentas de Auth que no son el
--   superadministrador oficial, más de un superadministrador activo, o
--   personal de plataforma sin cuenta de Auth) es NO-GO.
--
-- CÓMO EJECUTARLO (contra el proyecto de PRODUCCIÓN recién creado)
--
--   a) Supabase SQL Editor: abre una consulta NUEVA, pega este archivo
--      completo y ejecútalo. No requiere ninguna adaptación.
--
--   b) psql:
--        psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--             -f scripts/release/v1/verify-empty-production.sql
--
--   Usa la cadena de conexión de solo lectura del operador. Retira
--   SUPABASE_DB_URL de .env.local al terminar. Este script NUNCA imprime
--   claves, tokens ni cadenas de conexión.
--
-- INTERPRETACIÓN
--   · «BASE VACÍA CONFIRMADA»  → la base cumple las condiciones técnicas
--                                comprobadas aquí. La decisión de desplegar
--                                es humana y requiere además las revisiones
--                                manuales de las secciones 3 y 4.
--   · «DATOS EMPRESARIALES»    → NO-GO. La base no está limpia: investiga
--                                antes de continuar. NUNCA borres datos
--                                con este script (es de solo lectura) ni
--                                improvises un DELETE manual.
--   · «SIN CLASIFICAR»         → NO-GO hasta revisión humana.
-- ===========================================================================

begin read only;

--
-- ==========================================================
--  Trazaloop v1.0.0 · verificación de producción (solo lectura)
-- ==========================================================

-- ---------------------------------------------------------------------------
-- 0. Identidad del servidor (sin secretos)
-- ---------------------------------------------------------------------------
--
-- --- 0. Contexto ---

select
  current_database()                             as base_de_datos,
  current_user                                   as usuario,
  now()                                          as momento_verificacion,
  (select count(*) from pg_extension)            as extensiones_instaladas;

-- ---------------------------------------------------------------------------
-- 1. Migraciones aplicadas
-- ---------------------------------------------------------------------------
--
-- --- 1. Migraciones aplicadas (se esperan 0001-0102) ---

select
  count(*)                     as migraciones_aplicadas,
  min(version)                 as primera,
  max(version)                 as ultima
from supabase_migrations.schema_migrations;

--
--     Comprueba que `ultima` sea 0102 y que `migraciones_0103_o_superior`
--     sea 0. Esta fase del release NO crea migraciones nuevas.

select
  count(*) filter (where version = '0103')  as migracion_0103,
  count(*) filter (where version > '0102')  as migraciones_posteriores_a_0102,
  count(*) filter (where version < '0001')  as migraciones_anteriores_a_0001,
  case
    when count(*) filter (where version > '0102' or version < '0001') = 0
      then 'OK · solo 0001-0102, no existe 0103'
    else '*** HAY MIGRACIONES FUERA DEL RANGO 0001-0102 ***'
  end as estado
from supabase_migrations.schema_migrations;

select version, name
from supabase_migrations.schema_migrations
order by version desc
limit 5;

-- ---------------------------------------------------------------------------
-- 2. Censo de DATOS EMPRESARIALES (debe ser 0 en toda la columna)
-- ---------------------------------------------------------------------------
--
-- Fuente de la lista: el ESQUEMA REAL, no una lista escrita a mano.
--   (a) toda tabla base de `public` que tenga columna `organization_id`,
--       salvo las dos MIXTAS, que se filtran fila a fila;
--   (b) las raíces de tenencia que no tienen esa columna por definición
--       (`organizations` es la empresa misma; `profiles` y
--       `user_legal_acceptances` cuelgan del usuario);
--   (c) `textile_fiber_types`: solo organization_id IS NOT NULL;
--   (d) `audit_log`: solo organization_id IS NOT NULL. Las filas con
--       organization_id NULL son auditoría GLOBAL de plataforma generada
--       por las migraciones y la carga de datos globales: son legítimas y
--       NO cuentan como dato empresarial (detalle en la sección 2c);
--   (e) `profiles` y `user_legal_acceptances`: se excluyen las filas del
--       personal de plataforma (`platform_staff`), porque el
--       superadministrador oficial no es un dato empresarial.
--
-- Esto cubre automáticamente: organizaciones, membresías, invitaciones,
-- tickets, mensajes e historial de tickets, feedback histórico,
-- proveedores, materiales, productos, órdenes, lotes, consumos,
-- composiciones, evidencias CPR y Textiles, intentos de carga, documentos
-- TrazaDocs, documentos descargables, versiones documentales,
-- evaluaciones de circularidad, pasaportes y enlaces privados — y
-- cualquier tabla empresarial futura, sin editar el script.
-- ---------------------------------------------------------------------------
--
-- --- 2. Datos EMPRESARIALES (todo debe ser 0) ---

with tenant_tables as (
  select c.table_name, 'organization_id'::text as criterio, ''::text as filtro
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema
   and t.table_name   = c.table_name
   and t.table_type   = 'BASE TABLE'
  where c.table_schema = 'public'
    and c.column_name  = 'organization_id'
    and c.table_name not in ('textile_fiber_types', 'audit_log')   -- mixtas

  union all
  select 'organizations',          'raíz de tenencia',            ''
  union all
  select 'profiles',               'usuario ajeno a la plataforma',
         ' where id not in (select user_id from public.platform_staff)'
  union all
  select 'user_legal_acceptances', 'aceptación de usuario ajeno a la plataforma',
         ' where user_id not in (select user_id from public.platform_staff)'
  union all
  select 'textile_fiber_types',    'fibra personalizada de empresa',
         ' where organization_id is not null'
  union all
  select 'audit_log',              'auditoría con organization_id NOT NULL',
         ' a where nullif(to_jsonb(a)->>''organization_id'', '''') is not null'
),
counted as (
  select
    tt.table_name,
    tt.criterio,
    (xpath(
      '/row/c/text()',
      query_to_xml(
        format('select count(*) as c from public.%I%s', tt.table_name, tt.filtro),
        false, true, ''
      )
    ))[1]::text::bigint as filas
  from tenant_tables tt
  where to_regclass('public.' || quote_ident(tt.table_name)) is not null
)
select
  table_name    as tabla,
  criterio,
  filas,
  case when filas = 0 then 'OK · vacía' else '*** DATOS EMPRESARIALES ***' end as estado
from counted
order by filas desc, table_name;

--
-- --- 2b. Resumen empresarial ---

with tenant_tables as (
  select c.table_name, ''::text as filtro
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema
   and t.table_name   = c.table_name
   and t.table_type   = 'BASE TABLE'
  where c.table_schema = 'public'
    and c.column_name  = 'organization_id'
    and c.table_name not in ('textile_fiber_types', 'audit_log')
  union all select 'organizations', ''
  union all select 'profiles',
    ' where id not in (select user_id from public.platform_staff)'
  union all select 'user_legal_acceptances',
    ' where user_id not in (select user_id from public.platform_staff)'
  union all select 'textile_fiber_types', ' where organization_id is not null'
  union all select 'audit_log',
    ' a where nullif(to_jsonb(a)->>''organization_id'', '''') is not null'
),
counted as (
  select tt.table_name,
    (xpath('/row/c/text()', query_to_xml(
      format('select count(*) as c from public.%I%s', tt.table_name, tt.filtro),
      false, true, '')))[1]::text::bigint as filas
  from tenant_tables tt
  where to_regclass('public.' || quote_ident(tt.table_name)) is not null
)
select
  count(*)                                  as tablas_empresariales_revisadas,
  count(*) filter (where filas > 0)         as tablas_con_datos,
  coalesce(sum(filas), 0)                   as filas_empresariales_totales
from counted;

--
-- --- 2c. Auditoría (public.audit_log) · clasificación FILA A FILA ---
--
--     `audit_log.organization_id` es NULLABLE (0005_audit.sql). La tabla es
--     MIXTA y su total NO es criterio de NO-GO:
--       · global      (organization_id IS NULL)     → PERMITIDO. Es la
--         auditoría que dejan las migraciones y la carga de datos globales.
--         Informativo: NO produce NO-GO y NO suma tablas empresariales.
--       · empresarial (organization_id IS NOT NULL) → NO-GO. Es actividad
--         de una empresa real en una base que debería estar limpia.
--
--     Estado confirmado el 2026-07-24 en trazaloop-production
--     (ref mvmpadeixomwkpxbnhky): total = 26, global = 26, empresarial = 0
--     (23 de trazadoc_blueprints + 3 de plan_definitions). Ese estado es
--     ACEPTABLE y este verificador debe darlo por bueno.

select
  count(*)                                                                as audit_log_total,
  count(*) filter (
    where nullif(to_jsonb(a)->>'organization_id', '') is null
  )                                                                       as audit_log_global,
  count(*) filter (
    where nullif(to_jsonb(a)->>'organization_id', '') is not null
  )                                                                       as audit_log_empresarial,
  case
    when count(*) filter (
      where nullif(to_jsonb(a)->>'organization_id', '') is not null
    ) = 0 then 'OK · solo auditoría global de plataforma'
    else '*** AUDITORÍA EMPRESARIAL PRESENTE ***'
  end                                                                     as estado
from public.audit_log a;

--
-- --- 2d. Origen de la auditoría global (informativo, para justificarla) ---

select
  coalesce(a.table_name, '(sin table_name)') as origen,
  a.operation,
  count(*)                                   as cantidad
from public.audit_log a
where nullif(to_jsonb(a)->>'organization_id', '') is null
group by 1, 2
order by cantidad desc, origen;

-- ---------------------------------------------------------------------------
-- 3. Datos GLOBALES esperados (deben EXISTIR)
-- ---------------------------------------------------------------------------
--
-- --- 3. Datos GLOBALES esperados (deben existir) ---

with global_tables(table_name, concepto, minimo) as (
  values
    ('modules',                         'módulos de la plataforma',        1::bigint),
    ('plan_definitions',                'planes comerciales',              3::bigint),
    ('plan_limits',                     'límites por plan',                1::bigint),
    ('calculation_methodologies',       'metodologías de cálculo CPR',     1::bigint),
    ('frameworks',                      'marcos normativos',               1::bigint),
    ('requirements',                    'requisitos normativos',           1::bigint),
    ('diagnostic_sections',             'secciones de diagnóstico CPR',    1::bigint),
    ('diagnostic_questions',            'preguntas de diagnóstico CPR',    1::bigint),
    ('material_classifications',        'clasificaciones de material',     1::bigint),
    ('textile_diagnostic_sections',     'secciones de diagnóstico textil', 1::bigint),
    ('textile_diagnostic_questions',    'preguntas de diagnóstico textil', 1::bigint),
    ('textile_circularity_methodologies','metodologías de circularidad',   1::bigint),
    ('textile_circularity_criteria',    'criterios de circularidad',       1::bigint),
    ('trazadoc_blueprints',             'blueprints TrazaDocs',            1::bigint),
    ('trazadoc_blueprint_sections',     'secciones de blueprint (hints)',  1::bigint),
    ('roles',                           'roles del sistema',               1::bigint),
    ('legal_documents',                 'documentos legales',              2::bigint)
),
counted as (
  select gt.table_name, gt.concepto, gt.minimo,
    (xpath('/row/c/text()', query_to_xml(
      format('select count(*) as c from public.%I', gt.table_name),
      false, true, '')))[1]::text::bigint as filas
  from global_tables gt
  where to_regclass('public.' || quote_ident(gt.table_name)) is not null
)
select
  table_name as tabla,
  concepto,
  filas,
  minimo as minimo_esperado,
  case when filas >= minimo then 'OK' else '*** SEMILLA FALTANTE ***' end as estado
from counted
order by (filas >= minimo), table_name;

--
-- --- 3b. Catálogo base de fibras (global, organization_id IS NULL) ---

select
  count(*) filter (where organization_id is null)     as fibras_catalogo_base,
  count(*) filter (where organization_id is not null) as fibras_personalizadas_de_empresas,
  case
    when count(*) filter (where organization_id is null) > 0
     and count(*) filter (where organization_id is not null) = 0
    then 'OK'
    else '*** REVISAR ***'
  end as estado
from public.textile_fiber_types;

--
-- --- 3c. Módulos: funcionales vs. próximamente ---

select code, name, is_functional
from public.modules
order by is_functional desc, code;

--
-- --- 3d. Documentos legales activos (revisar versión y título) ---

select document_type, version, status, left(title, 70) as titulo
from public.legal_documents
order by document_type, version;

--
-- --- 3e. Personal de plataforma (public.platform_staff) ---
--
--     La estructura real (0040_platform_staff.sql) es role_code + status.
--     NO existe ninguna columna booleana de superadmin.
--     Un superadministrador oficial es exactamente:
--         role_code = 'superadmin' and status = 'active'
--     Se esperan 0 filas ANTES del paso formal de creación (readiness §8)
--     y EXACTAMENTE 1 después. Cualquier otra fila de platform_staff
--     (rol 'support', o estado 'suspended' / 'revoked') es inesperada en
--     una producción recién creada y debe revisarse.

select
  ps.user_id,
  u.email                                as correo,
  ps.role_code,
  ps.status,
  case
    when ps.role_code = 'superadmin' and ps.status = 'active'
      then 'superadministrador oficial'
    else '*** PERSONAL DE PLATAFORMA INESPERADO ***'
  end as clasificacion
from public.platform_staff ps
left join auth.users u on u.id = ps.user_id
order by ps.role_code, ps.status, u.email;

--
-- --- 3f. Cuentas de Auth (auth.users) ---
--     Se esperan 0 cuentas ANTES de crear el superadministrador y
--     EXACTAMENTE 1 después. Cualquier cuenta que no sea el
--     superadministrador oficial es un dato inesperado: NO-GO.

select
  count(*)                                                              as cuentas_auth,
  count(*) filter (
    where exists (
      select 1 from public.platform_staff ps
      where ps.user_id = u.id
        and ps.role_code = 'superadmin'
        and ps.status = 'active'
    )
  )                                                                     as son_superadmin,
  count(*) filter (
    where not exists (
      select 1 from public.platform_staff ps
      where ps.user_id = u.id
        and ps.role_code = 'superadmin'
        and ps.status = 'active'
    )
  )                                                                     as no_superadmin
from auth.users u;

--
-- --- 3g. Coherencia auth.users <-> platform_staff ---
--     `platform_staff.user_id` referencia `public.profiles(id)`, y
--     `profiles.id` referencia `auth.users(id)`: todo miembro del personal
--     de plataforma DEBE tener su cuenta de Auth. Una fila sin cuenta es
--     una incoherencia que puede esconder una cuenta borrada o inesperada.

select
  (select count(*) from auth.users)                                     as cuentas_auth,
  (select count(*) from public.platform_staff
    where role_code = 'superadmin' and status = 'active')               as superadmins_activos,
  (select count(*) from public.platform_staff
    where not (role_code = 'superadmin' and status = 'active'))         as staff_no_superadmin,
  (select count(*) from public.platform_staff ps
    where not exists (select 1 from auth.users u where u.id = ps.user_id))
                                                                        as staff_sin_cuenta_auth;

-- ---------------------------------------------------------------------------
-- 4. Storage
-- ---------------------------------------------------------------------------
--
-- --- 4. Storage: buckets (deben ser PRIVADOS) y objetos (deben ser 0) ---

select
  b.id                                   as bucket,
  b.public                               as es_publico,
  case when b.public then '*** BUCKET PÚBLICO ***' else 'OK · privado' end as estado_visibilidad,
  count(o.id)                            as objetos,
  case when count(o.id) = 0 then 'OK · vacío' else '*** ARCHIVOS PRESENTES ***' end as estado_objetos
from storage.buckets b
left join storage.objects o on o.bucket_id = b.id
group by b.id, b.public
order by b.id;

-- ---------------------------------------------------------------------------
-- 5. Tablas SIN CLASIFICAR (falla cerrado)
-- ---------------------------------------------------------------------------
--
-- --- 5. Tablas sin clasificar (deben ser 0 filas de resultado) ---

with all_tables as (
  select table_name
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
),
tenant as (
  select distinct c.table_name
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema
   and t.table_name   = c.table_name
   and t.table_type   = 'BASE TABLE'
  where c.table_schema = 'public' and c.column_name = 'organization_id'
  union all select 'organizations'
  union all select 'profiles'
  union all select 'user_legal_acceptances'
),
known_global(table_name) as (
  values
    ('modules'), ('plan_definitions'), ('plan_limits'),
    ('calculation_methodologies'), ('frameworks'), ('requirements'),
    ('diagnostic_sections'), ('diagnostic_questions'),
    ('material_classifications'), ('textile_diagnostic_sections'),
    ('textile_diagnostic_questions'), ('textile_circularity_methodologies'),
    ('textile_circularity_criteria'), ('trazadoc_blueprints'),
    ('trazadoc_blueprint_sections'), ('roles'), ('legal_documents'),
    ('platform_staff'), ('textile_fiber_types')
)
select
  t.table_name as tabla_sin_clasificar,
  'No tiene organization_id y no está en la lista de tablas globales conocidas. '
  || 'REQUIERE REVISIÓN HUMANA antes de dar GO.' as accion
from all_tables t
where t.table_name not in (select table_name from tenant)
  and t.table_name not in (select table_name from known_global)
order by t.table_name;

-- ---------------------------------------------------------------------------
-- 6. RLS activo en las tablas empresariales
-- ---------------------------------------------------------------------------
--
-- --- 6. Tablas empresariales SIN row level security (deben ser 0) ---

select
  c.relname as tabla_sin_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
  and c.relname in (
    select distinct table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'organization_id'
  )
order by c.relname;

-- ---------------------------------------------------------------------------
-- 7. VEREDICTO — falla con error si hay datos empresariales
-- ---------------------------------------------------------------------------
--
-- --- 7. VEREDICTO ---
--
-- Bloque DO de SOLO CÁLCULO: únicamente SELECT / EXECUTE de SELECT y
-- RAISE. No modifica estructura, permisos ni datos.

do $verdict$
declare
  v_business_rows   bigint := 0;
  v_business_tables int    := 0;
  v_unclassified    int    := 0;
  v_public_buckets  int    := 0;
  v_storage_objects bigint := 0;
  v_no_rls          int    := 0;
  v_auth_users      int    := 0;
  v_auth_non_super  int    := 0;
  v_superadmins     int    := 0;
  v_staff_other     int    := 0;
  v_staff_orphan    int    := 0;
  v_audit_total     bigint := 0;
  v_audit_global    bigint := 0;
  v_audit_business  bigint := 0;
  v_detail          text   := '';
  r                 record;
begin
  -- Censo empresarial. MISMO criterio derivado del esquema que la sección 2:
  -- las tablas mixtas (`textile_fiber_types`, `audit_log`) y las que cuelgan
  -- del usuario (`profiles`, `user_legal_acceptances`) se filtran FILA A
  -- FILA, nunca por su total.
  for r in
    select tt.table_name, tt.filtro
    from (
      select c.table_name, ''::text as filtro
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name   = c.table_name
       and t.table_type   = 'BASE TABLE'
      where c.table_schema = 'public'
        and c.column_name  = 'organization_id'
        and c.table_name not in ('textile_fiber_types', 'audit_log')
      union all select 'organizations', ''
      union all select 'profiles',
        ' where id not in (select user_id from public.platform_staff)'
      union all select 'user_legal_acceptances',
        ' where user_id not in (select user_id from public.platform_staff)'
      union all select 'textile_fiber_types', ' where organization_id is not null'
      union all select 'audit_log',
        ' a where nullif(to_jsonb(a)->>''organization_id'', '''') is not null'
    ) tt
    where to_regclass('public.' || quote_ident(tt.table_name)) is not null
  loop
    declare
      v_n bigint;
    begin
      execute format('select count(*) from public.%I%s', r.table_name, r.filtro)
        into v_n;
      if v_n > 0 then
        v_business_rows   := v_business_rows + v_n;
        v_business_tables := v_business_tables + 1;
        v_detail := v_detail || format('%s=%s ', r.table_name, v_n);
      end if;
    end;
  end loop;

  -- Auditoría: se mide aparte para poder INFORMAR de las tres cifras. Solo
  -- la parte empresarial (ya contada arriba con su filtro) es NO-GO.
  if to_regclass('public.audit_log') is not null then
    select
      count(*),
      count(*) filter (where nullif(to_jsonb(a)->>'organization_id', '') is null),
      count(*) filter (where nullif(to_jsonb(a)->>'organization_id', '') is not null)
    into v_audit_total, v_audit_global, v_audit_business
    from public.audit_log a;
  end if;

  -- Tablas sin clasificar.
  select count(*) into v_unclassified
  from information_schema.tables t
  where t.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
    and t.table_name not in (
      select c.table_name from information_schema.columns c
      join information_schema.tables t2
        on t2.table_schema = c.table_schema
       and t2.table_name   = c.table_name
       and t2.table_type   = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'organization_id'
      union all select 'organizations'
      union all select 'profiles'
      union all select 'user_legal_acceptances'
    )
    and t.table_name not in (
      'modules','plan_definitions','plan_limits','calculation_methodologies',
      'frameworks','requirements','diagnostic_sections','diagnostic_questions',
      'material_classifications','textile_diagnostic_sections',
      'textile_diagnostic_questions','textile_circularity_methodologies',
      'textile_circularity_criteria','trazadoc_blueprints',
      'trazadoc_blueprint_sections','roles','legal_documents',
      'platform_staff','textile_fiber_types'
    );

  select count(*) into v_public_buckets from storage.buckets where public is true;
  select count(*) into v_storage_objects from storage.objects;

  select count(*) into v_no_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
    and c.relname in (
      select distinct table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'organization_id'
    );

  -- Superadministrador y cuentas de Auth. La estructura real es
  -- platform_staff.role_code / platform_staff.status (0040_platform_staff).
  select count(*) into v_superadmins
  from public.platform_staff
  where role_code = 'superadmin' and status = 'active';

  select count(*) into v_staff_other
  from public.platform_staff
  where not (role_code = 'superadmin' and status = 'active');

  select count(*) into v_auth_users from auth.users;

  select count(*) into v_auth_non_super
  from auth.users u
  where not exists (
    select 1 from public.platform_staff ps
    where ps.user_id = u.id
      and ps.role_code = 'superadmin'
      and ps.status = 'active'
  );

  select count(*) into v_staff_orphan
  from public.platform_staff ps
  where not exists (select 1 from auth.users u where u.id = ps.user_id);

  raise notice '';
  raise notice 'Filas empresariales .......... %', v_business_rows;
  raise notice 'Tablas con datos ............. %', v_business_tables;
  raise notice 'audit_log total .............. %', v_audit_total;
  raise notice 'audit_log global ............. %  (organization_id NULL · permitido)', v_audit_global;
  raise notice 'audit_log empresarial ........ %  (organization_id NOT NULL · esperado: 0)', v_audit_business;
  raise notice 'Tablas sin clasificar ........ %', v_unclassified;
  raise notice 'Buckets públicos ............. %', v_public_buckets;
  raise notice 'Objetos en Storage ........... %', v_storage_objects;
  raise notice 'Tablas empresariales sin RLS . %', v_no_rls;
  raise notice 'Cuentas Auth ................. %  (esperado: 0 antes de crear el superadmin, 1 después)', v_auth_users;
  raise notice 'Superadministradores activos . %  (esperado: 0 antes de crearlo, 1 después)', v_superadmins;
  raise notice 'Cuentas Auth no-superadmin ... %  (esperado: 0)', v_auth_non_super;
  raise notice 'Staff de plataforma restante . %  (esperado: 0)', v_staff_other;
  raise notice 'Staff sin cuenta de Auth ..... %  (esperado: 0)', v_staff_orphan;
  raise notice '';
  raise notice 'La auditoría con organization_id NULL es auditoría GLOBAL de';
  raise notice 'plataforma (migraciones y carga de datos globales). Es legítima,';
  raise notice 'no es dato empresarial y no debe borrarse: audit_log es';
  raise notice 'append-only por trigger.';
  raise notice '';

  if v_business_rows > 0 then
    raise exception
      E'NO-GO · SE ENCONTRARON DATOS EMPRESARIALES EN PRODUCCIÓN.\n'
      '  Tablas afectadas: %\n'
      '  Detalle: %\n'
      '  Nota: audit_log solo aparece aquí si tiene filas con organization_id\n'
      '  NOT NULL. La auditoría global (organization_id NULL) NO cuenta.\n'
      '  Esta base NO está limpia. NO despliegues. Investiga el origen antes\n'
      '  de continuar. Este script es de solo lectura: no borra nada, y NO\n'
      '  debes improvisar borrados manuales en producción.',
      v_business_tables, v_detail;
  end if;

  if v_public_buckets > 0 then
    raise exception
      E'NO-GO · HAY % BUCKET(S) PÚBLICO(S). Todos los buckets de Trazaloop\n'
      '  (evidences, organization-assets, trazadocs-documents) deben ser\n'
      '  PRIVADOS: los pasaportes y evidencias nunca se sirven en abierto.',
      v_public_buckets;
  end if;

  if v_storage_objects > 0 then
    raise exception
      E'NO-GO · HAY % OBJETO(S) EN STORAGE. Una producción recién creada no\n'
      '  debe contener archivos de prueba.',
      v_storage_objects;
  end if;

  if v_no_rls > 0 then
    raise exception
      E'NO-GO · HAY % TABLA(S) EMPRESARIAL(ES) SIN ROW LEVEL SECURITY.',
      v_no_rls;
  end if;

  if v_auth_non_super > 0 then
    raise exception
      E'NO-GO · HAY % CUENTA(S) DE AUTH QUE NO SON EL SUPERADMINISTRADOR.\n'
      '  Una producción recién creada solo debe contener el superadministrador\n'
      '  oficial: una fila de public.platform_staff con role_code = superadmin\n'
      '  y status = active (ver sección 3e). Cualquier otra cuenta es un\n'
      '  usuario inesperado: investiga su origen antes de dar GO.',
      v_auth_non_super;
  end if;

  -- Más de un superadministrador activo es NO-GO: solo debe existir la
  -- cuenta oficial creada en el paso formal del procedimiento.
  if v_superadmins > 1 then
    raise exception
      E'NO-GO · HAY % SUPERADMINISTRADORES ACTIVOS. Se espera 0 antes del paso\n'
      '  formal de creación y EXACTAMENTE 1 después. Revisa las filas de\n'
      '  public.platform_staff con role_code = superadmin y status = active\n'
      '  (sección 3e) antes de dar GO.',
      v_superadmins;
  end if;

  if v_staff_orphan > 0 then
    raise exception
      E'NO-GO · HAY % FILA(S) DE platform_staff SIN CUENTA EN auth.users.\n'
      '  Es una incoherencia entre auth.users y platform_staff: puede tratarse\n'
      '  de una cuenta borrada a medias o de un alta inesperada. Investígala\n'
      '  antes de dar GO.',
      v_staff_orphan;
  end if;

  -- Coherencia global de los dos momentos admitidos del procedimiento:
  --   antes de crear el superadministrador → 0 cuentas Auth y 0 superadmins
  --   después                              → 1 cuenta  Auth y 1 superadmin
  if v_auth_users <> v_superadmins then
    raise exception
      E'NO-GO · INCOHERENCIA ENTRE auth.users (%) Y SUPERADMINISTRADORES\n'
      '  ACTIVOS (%). Solo se admiten dos estados: 0 y 0 antes del paso formal\n'
      '  de creación, o 1 y 1 después. Cualquier otra combinación representa\n'
      '  una cuenta inesperada (secciones 3e, 3f y 3g).',
      v_auth_users, v_superadmins;
  end if;

  if v_staff_other > 0 then
    raise warning
      E'ATENCIÓN · hay % fila(s) en public.platform_staff que NO son el\n'
      '  superadministrador oficial (rol distinto de superadmin, o estado\n'
      '  suspended / revoked). Revísalas en la sección 3e antes de dar GO.',
      v_staff_other;
  end if;

  if v_unclassified > 0 then
    raise exception
      E'NO-GO · HAY % TABLA(S) SIN CLASIFICAR (ver sección 5).\n'
      '  El script falla CERRADO: una tabla cuya relación con la empresa no\n'
      '  es evidente debe revisarse a mano antes de dar GO. Si es global,\n'
      '  añádela a la lista known_global; si es empresarial, dale una\n'
      '  columna organization_id o documenta por qué no la necesita.',
      v_unclassified;
  end if;

  raise notice '=========================================================';
  raise notice ' BASE VACÍA CONFIRMADA · sin datos empresariales';
  raise notice '=========================================================';
  raise notice 'Esto NO declara la producción lista para desplegar: es solo';
  raise notice 'el resultado técnico de las comprobaciones automáticas. La';
  raise notice 'decisión es humana y exige además revisar a mano las';
  raise notice 'secciones 3 y 4.';
end
$verdict$;

commit;

--
-- Verificación terminada. Si llegaste hasta aquí sin ERROR, las
-- comprobaciones automáticas pasaron. Revisa además a mano las secciones
-- 3 y 4 antes de tomar cualquier decisión de despliegue.
--
