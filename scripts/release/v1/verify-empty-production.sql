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
-- QUÉ COMPRUEBA
--   1. Migraciones aplicadas (0001–0102).
--   2. Censo de DATOS EMPRESARIALES: debe ser 0 en una producción recién
--      creada. Las tablas NO se codifican a mano: se derivan del esquema
--      real (toda tabla base de `public` con columna `organization_id`,
--      más las raíces de tenencia conocidas).
--   3. Censo de DATOS GLOBALES esperados (semillas, catálogos, planes,
--      metodologías, preguntas, blueprints, documentos legales).
--   4. Storage: buckets existentes, que sean PRIVADOS y su número de
--      objetos.
--   5. Tablas SIN CLASIFICAR: cualquier tabla nueva que no sea ni
--      claramente empresarial ni claramente global se reporta para
--      revisión humana. Falla cerrado: ante la duda, avisa.
--   6. VEREDICTO final. Si hay cualquier dato empresarial, el script
--      TERMINA CON ERROR (exit code != 0 con ON_ERROR_STOP=1).
--
-- CÓMO EJECUTARLO (contra el proyecto de PRODUCCIÓN recién creado)
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--        -f scripts/release/v1/verify-empty-production.sql
--
--   Usa la cadena de conexión de solo lectura del operador. Retira
--   SUPABASE_DB_URL de .env.local al terminar. Este script NUNCA imprime
--   claves, tokens ni cadenas de conexión.
--
-- INTERPRETACIÓN
--   · «BASE VACÍA CONFIRMADA»  → producción lista para el primer deploy.
--   · «DATOS EMPRESARIALES»    → NO-GO. La base no está limpia: investiga
--                                antes de continuar. NUNCA borres datos
--                                con este script (es de solo lectura) ni
--                                improvises un DELETE manual.
--   · «SIN CLASIFICAR»         → NO-GO hasta revisión humana.
-- ===========================================================================

\pset pager off
\timing off

begin read only;

\echo ''
\echo '=========================================================='
\echo ' Trazaloop v1.0.0 · verificación de producción (solo lectura)'
\echo '=========================================================='

-- ---------------------------------------------------------------------------
-- 0. Identidad del servidor (sin secretos)
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- 0. Contexto ---'

select
  current_database()                             as base_de_datos,
  current_user                                   as usuario,
  now()                                          as momento_verificacion,
  (select count(*) from pg_extension)            as extensiones_instaladas;

-- ---------------------------------------------------------------------------
-- 1. Migraciones aplicadas
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- 1. Migraciones aplicadas (se esperan 0001-0102) ---'

select
  count(*)                     as migraciones_aplicadas,
  min(version)                 as primera,
  max(version)                 as ultima
from supabase_migrations.schema_migrations;

\echo ''
\echo '    Comprueba que `ultima` sea 0102 y que NO exista 0103.'

select version, name
from supabase_migrations.schema_migrations
order by version desc
limit 5;

-- ---------------------------------------------------------------------------
-- 2. Censo de DATOS EMPRESARIALES (debe ser 0 en toda la columna)
-- ---------------------------------------------------------------------------
--
-- Fuente de la lista: el ESQUEMA REAL, no una lista escrita a mano.
--   (a) toda tabla base de `public` que tenga columna `organization_id`;
--   (b) las raíces de tenencia que no la tienen por definición
--       (`organizations` es la empresa misma; `profiles` y
--       `user_legal_acceptances` cuelgan del usuario);
--   (c) `textile_fiber_types` es MIXTA: organization_id IS NULL es el
--       catálogo base global; NOT NULL es una fibra personalizada de una
--       empresa. Se cuenta solo la parte empresarial.
--
-- Esto cubre automáticamente: organizaciones, membresías, invitaciones,
-- tickets, mensajes e historial de tickets, feedback histórico,
-- proveedores, materiales, productos, órdenes, lotes, consumos,
-- composiciones, evidencias CPR y Textiles, intentos de carga, documentos
-- TrazaDocs, documentos descargables, versiones documentales,
-- evaluaciones de circularidad, pasaportes, enlaces privados y auditoría
-- tenant-scoped — y cualquier tabla empresarial futura, sin editar el
-- script.
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- 2. Datos EMPRESARIALES (todo debe ser 0) ---'

with tenant_tables as (
  select c.table_name, 'organization_id'::text as criterio, ''::text as filtro
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema
   and t.table_name   = c.table_name
   and t.table_type   = 'BASE TABLE'
  where c.table_schema = 'public'
    and c.column_name  = 'organization_id'
    and c.table_name  <> 'textile_fiber_types'   -- mixta, se trata aparte

  union all
  select 'organizations',         'raíz de tenencia',      ''
  union all
  select 'profiles',              'cuenta de usuario',     ''
  union all
  select 'user_legal_acceptances','aceptación de usuario', ''
  union all
  select 'textile_fiber_types',   'fibra personalizada',   ' where organization_id is not null'
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

\echo ''
\echo '--- 2b. Resumen empresarial ---'

with tenant_tables as (
  select c.table_name, ''::text as filtro
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema
   and t.table_name   = c.table_name
   and t.table_type   = 'BASE TABLE'
  where c.table_schema = 'public'
    and c.column_name  = 'organization_id'
    and c.table_name  <> 'textile_fiber_types'
  union all select 'organizations', ''
  union all select 'profiles', ''
  union all select 'user_legal_acceptances', ''
  union all select 'textile_fiber_types', ' where organization_id is not null'
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

-- ---------------------------------------------------------------------------
-- 3. Datos GLOBALES esperados (deben EXISTIR)
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- 3. Datos GLOBALES esperados (deben existir) ---'

with global_tables(table_name, concepto, minimo) as (
  values
    ('modules',                         'módulos de la plataforma',        1::bigint),
    ('plan_definitions',                'planes comerciales',              3::bigint),
    ('plan_limits',                     'límites por plan',                1::bigint),
    ('calculation_methodologies',       'metodologías de cálculo CPR',     1::bigint),
    ('frameworks',                      'marcos normativos',              1::bigint),
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

\echo ''
\echo '--- 3b. Catálogo base de fibras (global, organization_id IS NULL) ---'

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

\echo ''
\echo '--- 3c. Módulos: funcionales vs. próximamente ---'

select code, name, is_functional
from public.modules
order by is_functional desc, code;

\echo ''
\echo '--- 3d. Documentos legales activos (revisar versión y título) ---'

select document_type, version, status, left(title, 70) as titulo
from public.legal_documents
order by document_type, version;

\echo ''
\echo '--- 3e. Superadministradores de plataforma ---'
\echo '    Se espera EXACTAMENTE 1 en una producción recién creada.'

select
  ps.user_id,
  u.email                              as correo_superadmin,
  ps.is_superadmin
from public.platform_staff ps
join auth.users u on u.id = ps.user_id
where ps.is_superadmin is true
order by u.email;

\echo ''
\echo '--- 3f. Cuentas de Auth (auth.users) ---'
\echo '    Se espera SOLO el superadministrador oficial (1 cuenta).'
\echo '    Cualquier cuenta adicional es un dato inesperado a revisar.'

select
  count(*)                                                              as cuentas_auth,
  count(*) filter (
    where u.id in (select user_id from public.platform_staff where is_superadmin is true)
  )                                                                     as son_superadmin,
  count(*) filter (
    where u.id not in (select user_id from public.platform_staff where is_superadmin is true)
  )                                                                     as no_superadmin
from auth.users u;

-- ---------------------------------------------------------------------------
-- 4. Storage
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- 4. Storage: buckets (deben ser PRIVADOS) y objetos (deben ser 0) ---'

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
\echo ''
\echo '--- 5. Tablas sin clasificar (deben ser 0 filas de resultado) ---'

with all_tables as (
  select table_name
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
),
tenant as (
  select distinct table_name
  from information_schema.columns
  where table_schema = 'public' and column_name = 'organization_id'
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
\echo ''
\echo '--- 6. Tablas empresariales SIN row level security (deben ser 0) ---'

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
\echo ''
\echo '--- 7. VEREDICTO ---'

do $verdict$
declare
  v_business_rows   bigint := 0;
  v_business_tables int    := 0;
  v_unclassified    int    := 0;
  v_public_buckets  int    := 0;
  v_storage_objects bigint := 0;
  v_no_rls          int    := 0;
  v_auth_non_super  int    := 0;
  v_superadmins     int    := 0;
  v_detail          text   := '';
  r                 record;
begin
  -- Censo empresarial (mismo criterio derivado del esquema que la sección 2).
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
        and c.table_name  <> 'textile_fiber_types'
      union all select 'organizations', ''
      union all select 'profiles', ''
      union all select 'user_legal_acceptances', ''
      union all select 'textile_fiber_types', ' where organization_id is not null'
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

  -- Tablas sin clasificar.
  select count(*) into v_unclassified
  from information_schema.tables t
  where t.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
    and t.table_name not in (
      select table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'organization_id'
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

  -- Cuentas de Auth: en una producción recién creada solo debe existir el
  -- superadministrador oficial. Cualquier cuenta que NO sea superadmin es un
  -- dato de usuario inesperado.
  select count(*) into v_superadmins
  from public.platform_staff where is_superadmin is true;

  select count(*) into v_auth_non_super
  from auth.users u
  where u.id not in (
    select user_id from public.platform_staff where is_superadmin is true
  );

  raise notice '';
  raise notice 'Filas empresariales .......... %', v_business_rows;
  raise notice 'Tablas con datos ............. %', v_business_tables;
  raise notice 'Tablas sin clasificar ........ %', v_unclassified;
  raise notice 'Buckets públicos ............. %', v_public_buckets;
  raise notice 'Objetos en Storage ........... %', v_storage_objects;
  raise notice 'Tablas empresariales sin RLS . %', v_no_rls;
  raise notice 'Superadministradores ......... %  (esperado: 1 tras crearlo)', v_superadmins;
  raise notice 'Cuentas Auth no-superadmin ... %  (esperado: 0)', v_auth_non_super;
  raise notice '';

  if v_business_rows > 0 then
    raise exception
      E'NO-GO · SE ENCONTRARON DATOS EMPRESARIALES EN PRODUCCIÓN.\n'
      '  Tablas afectadas: %\n'
      '  Detalle: %\n'
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
      '  oficial (platform_staff.is_superadmin). Cualquier otra cuenta es un\n'
      '  usuario inesperado: investiga su origen antes de dar GO.',
      v_auth_non_super;
  end if;

  -- El superadministrador se crea en un paso posterior del procedimiento
  -- (readiness §8). Por eso 0 superadmins es válido si aún no se ha creado,
  -- y >1 es sospechoso: se avisa sin abortar.
  if v_superadmins > 1 then
    raise warning
      E'ATENCIÓN · hay % superadministradores. Se espera EXACTAMENTE 1 en\n'
      '  producción. Revisa public.platform_staff (sección 3e).',
      v_superadmins;
  end if;

  if v_unclassified > 0 then
    raise exception
      E'NO-GO · HAY % TABLA(S) SIN CLASIFICAR (ver sección 5).\n'
      '  El script falla CERRADO: una tabla cuya relación con la empresa no\n'
      '  es evidente debe revisarse a mano antes de dar GO. Si es global,\n'
      '  añádela a la lista `known_global`; si es empresarial, dale una\n'
      '  columna organization_id o documenta por qué no la necesita.',
      v_unclassified;
  end if;

  raise notice '=========================================================';
  raise notice ' BASE VACÍA CONFIRMADA · producción lista para v1.0.0';
  raise notice '=========================================================';
end
$verdict$;

commit;

\echo ''
\echo 'Verificación terminada. Si llegaste hasta aquí sin ERROR, la base de'
\echo 'producción está limpia. Revisa además a mano las secciones 3 y 4.'
\echo ''
