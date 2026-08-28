-- ============================================================================
-- Trazaloop · PCR/TEXTILES PRE-INTEGRATION · §4
-- VALIDACIÓN POST-MIGRACIÓN · SOLO LECTURA
-- ----------------------------------------------------------------------------
-- Ejecutar contra Staging DESPUÉS de aplicar 0142–0146 y ANTES del Preview.
--
-- NO escribe nada. Ni una fila, ni una tabla temporal. Se puede correr las
-- veces que haga falta y sobre una base con gente trabajando.
--
-- Cada consulta trae su columna `veredicto`: lo que hay que leer es esa. Si
-- alguna dice REVISAR, el detalle está en las columnas de al lado.
--
--   psql "$STAGING_DB_URL" -f docs/pcr-textiles/pre-integration/qa/POST_MIGRATION_CHECKS.sql
-- ============================================================================

\echo '=== 1 · CABECERA DE MIGRACIONES ==='
select max(version) as cabecera,
       count(*) as registradas,
       case when max(version) = '0146' then 'OK' else 'REVISAR' end as veredicto
  from supabase_migrations.schema_migrations;

\echo ''
\echo '=== 2 · EVIDENCE_LINKS · las seis columnas nuevas ==='
select count(*) as columnas_encontradas,
       case when count(*) = 6 then 'OK' else 'REVISAR' end as veredicto
  from information_schema.columns
 where table_name = 'evidence_links'
   and column_name in ('confirmed_at','confirmed_by','reference_date',
                       'evidence_status_at_confirmation',
                       'evidence_valid_until_at_confirmation','applicability_basis');

\echo ''
\echo '=== 3 · EVIDENCE_LINKS · las filas legacy NO fingen confirmación ==='
-- Lo que se espera justo después de aplicar: TODAS legacy, ninguna confirmada.
select count(*) filter (where confirmed_at is null)     as legacy,
       count(*) filter (where confirmed_at is not null) as confirmadas,
       count(*) filter (where confirmed_at is null and reference_date is not null) as inconsistentes,
       case when count(*) filter (where confirmed_at is null and reference_date is not null) = 0
            then 'OK' else 'REVISAR: hay filas con fecha pero sin confirmación' end as veredicto
  from public.evidence_links;

\echo ''
\echo '=== 4 · EVIDENCE_LINKS · la puerta de atrás está cerrada ==='
select count(*) filter (where polcmd = 'a') as politicas_insert,
       count(*) filter (where polcmd = 'r') as politicas_select,
       case when count(*) filter (where polcmd = 'a') = 0
            then 'OK: sin política de insert' else 'REVISAR: se puede insertar a mano' end as veredicto
  from pg_policy where polrelid = 'public.evidence_links'::regclass;

\echo ''
\echo '=== 5 · RLS habilitada en todo lo nuevo ==='
select c.relname,
       c.relrowsecurity as rls,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as politicas,
       case when c.relrowsecurity then 'OK' else 'REVISAR' end as veredicto
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'output_batch_movements';

\echo ''
\echo '=== 6 · NADA SE BORRA · el disparador está puesto ==='
select count(*) as disparadores_no_delete,
       case when count(*) = 1 then 'OK' else 'REVISAR' end as veredicto
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'public.output_batch_movements'::regclass
   and p.proname = 'output_batch_movements_no_delete' and not t.tgisinternal;

\echo ''
\echo '=== 7 · ELEGIBILIDAD DE EVIDENCIA · la función existe y es security definer ==='
select p.proname,
       p.prosecdef as security_definer,
       case when p.prosecdef then 'OK' else 'REVISAR' end as veredicto
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('evidence_link_confirm','evidence_target_reference_date')
 order by 1;

\echo ''
\echo '=== 8 · UNIT_CODE · cuántas filas se normalizaron y cuántas NO ==='
-- Lo que quede sin normalizar es la lista de trabajo, no un fallo.
select 'textile_input_lots' as tabla, count(*) as total,
       count(unit_code) as normalizadas,
       count(*) - count(unit_code) as sin_normalizar
  from public.textile_input_lots
union all select 'textile_order_consumptions', count(*), count(unit_code),
       count(*) - count(unit_code) from public.textile_order_consumptions
union all select 'textile_output_lots', count(*), count(unit_code),
       count(*) - count(unit_code) from public.textile_output_lots
union all select 'textile_production_orders', count(*), count(unit_code),
       count(*) - count(unit_code) from public.textile_production_orders
 order by 1;

\echo ''
\echo '=== 9 · UNIT_CODE · qué textos quedaron SIN normalizar (lista de trabajo) ==='
select unit as texto_original, count(*) as filas
  from public.textile_input_lots
 where unit_code is null and unit is not null
 group by 1 order by 2 desc limit 20;

\echo ''
\echo '=== 10 · UNIT_CODE · el texto original NUNCA se perdió ==='
select count(*) filter (where unit is null and unit_code is not null) as texto_perdido,
       case when count(*) filter (where unit is null and unit_code is not null) = 0
            then 'OK' else 'REVISAR: el backfill borró el texto de alguien' end as veredicto
  from public.textile_input_lots;

\echo ''
\echo '=== 11 · CONCURRENCIA TEXTIL · la guarda bloquea la fila ==='
select case when pg_get_functiondef(p.oid) ~* 'for update'
            then 'OK: candado presente' else 'REVISAR: falta FOR UPDATE' end as veredicto,
       case when pg_get_functiondef(p.oid) ~ 'no convierte unidades'
            then 'OK: rechaza unidades distintas' else 'REVISAR' end as unidades
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'guard_textile_lot_overconsumption';

\echo ''
\echo '=== 12 · METODOLOGÍA · v1 conservada, v2 activa ==='
select code, version, is_active,
       case when version = 1 and not is_active then 'OK: v1 conservada e inactiva'
            when version = 2 and is_active then 'OK: v2 activa'
            else 'REVISAR' end as veredicto
  from public.calculation_methodologies
 where code = 'RC-6632-15343' order by version;

\echo ''
\echo '=== 13 · PT-H03 · NINGÚN cálculo v1 se reinterpretó ==='
-- Lo que importa NO es que no existan filas v2 —en cuanto alguien calcule con
-- v2 las habrá— sino que ninguna fila v1 haya cambiado de estado. Todas las
-- v1 tienen que seguir siendo 'calculated' con su número.
select methodology_version, result_state, count(*) as calculos,
       case when methodology_version = 1 and result_state <> 'calculated'
            then 'REVISAR: una fila v1 dejó de ser calculated'
            when methodology_version = 1 then 'OK: v1 intacta'
            else 'informativo: filas v2' end as veredicto
  from public.recycled_content_calculations
 group by 1, 2 order by 1, 2;

\echo ''
\echo '=== 14 · CALCULATION_INCOMPLETE · el CHECK impide un incompleto con número ==='
-- Se comprueba que el CHECK EXISTE y menciona las dos mitades. La forma exacta
-- del texto la normaliza PostgreSQL y no es estable entre versiones.
select conname,
       case when pg_get_constraintdef(oid) ~* 'incomplete'
             and pg_get_constraintdef(oid) ~* 'recycled_percent'
            then 'OK' else 'REVISAR' end as veredicto,
       pg_get_constraintdef(oid) as definicion
  from pg_constraint
 where conrelid = 'public.recycled_content_calculations'::regclass
   and conname = 'recycled_calc_state_consistent';

\echo ''
\echo '=== 15 · Y no existe ninguna fila que lo viole ==='
select count(*) as violaciones,
       case when count(*) = 0 then 'OK' else 'REVISAR' end as veredicto
  from public.recycled_content_calculations
 where (result_state = 'incomplete' and recycled_percent is not null)
    or (result_state = 'calculated' and recycled_percent is null);

\echo ''
\echo '=== 16 · INVENTARIO MP · las vistas responden ==='
select 'v_material_inventory' as vista, count(*) as filas from public.v_material_inventory
union all select 'v_textile_material_inventory', count(*) from public.v_textile_material_inventory
union all select 'v_output_batch_stock', count(*) from public.v_output_batch_stock
 order by 1;

\echo ''
\echo '=== 17 · INVENTARIO MP · saldo = recibido − consumido (PCR) ==='
select count(*) as materiales,
       count(*) filter (where round(received_kg - consumed_kg, 4) <> round(available_kg, 4)) as descuadres,
       case when count(*) filter (where round(received_kg - consumed_kg, 4) <> round(available_kg, 4)) = 0
            then 'OK' else 'REVISAR' end as veredicto
  from public.v_material_inventory;

\echo ''
\echo '=== 18 · INVENTARIO MP · ningún saldo negativo escondido ==='
-- Un negativo NO es un fallo de la vista: es una anomalía de datos que hay que
-- ver. Lo que sería un fallo es que estuviera recortado a cero.
select count(*) filter (where available_kg < 0) as lotes_negativos_pcr
  from public.v_input_batch_inventory;

\echo ''
\echo '=== 19 · MOVIMIENTOS · la tabla nace vacía y el linaje existe ==='
select (select count(*) from public.output_batch_movements) as movimientos,
       (select count(*) from information_schema.columns
         where table_name = 'output_batch_movements'
           and column_name in ('corrects_movement_id','superseded_by_movement_id',
                               'correction_reason','is_current')) as columnas_linaje,
       case when (select count(*) from information_schema.columns
                   where table_name = 'output_batch_movements'
                     and column_name in ('corrects_movement_id','superseded_by_movement_id',
                                         'correction_reason','is_current')) = 4
            then 'OK' else 'REVISAR' end as veredicto;

\echo ''
\echo '=== 20 · MOVIMIENTOS · coherencia del linaje (si ya hay alguno) ==='
select count(*) filter (where superseded_by_movement_id is not null and is_current) as vigentes_pero_superados,
       count(*) filter (where corrects_movement_id is not null
                          and coalesce(btrim(correction_reason), '') = '') as correcciones_sin_motivo,
       case when count(*) filter (where superseded_by_movement_id is not null and is_current) = 0
             and count(*) filter (where corrects_movement_id is not null
                                    and coalesce(btrim(correction_reason), '') = '') = 0
            then 'OK' else 'REVISAR' end as veredicto
  from public.output_batch_movements;

\echo ''
\echo '=== 21 · AISLAMIENTO · ninguna vista nueva se salta la RLS ==='
select c.relname as vista,
       coalesce((select option_value from pg_options_to_table(c.reloptions)
                  where option_name = 'security_invoker'), 'false') as security_invoker
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('v_textile_material_inventory','v_output_batch_stock',
                     'v_textile_input_lot_balance','v_latest_batch_recycled')
 order by 1;

\echo ''
\echo '=== 22 · DERIVA · ninguna tabla mutable de existencias ==='
select count(*) as tablas_de_stock,
       case when count(*) = 0 then 'OK: el saldo se deriva' else 'REVISAR' end as veredicto
  from information_schema.tables
 where table_schema = 'public' and table_type = 'BASE TABLE'
   and (table_name ~ 'stock' or table_name ~ '_inventory$');

\echo ''
\echo '=== 23 · AISLAMIENTO · NINGUNA vista devuelve filas de otra empresa ==='
-- La comprobación 21 mira la OPCIÓN; esta mira la consecuencia. Se ejecuta con
-- una sesión de persona real (no con service_role): si devuelve filas de más
-- de una empresa, hay fuga.
--
-- Correr como usuario autenticado de UNA empresa:
--   select count(distinct organization_id) from public.v_textile_input_lot_balance;
-- Debe ser 0 o 1. Nunca más.
select 'v_textile_input_lot_balance' as vista,
       count(distinct organization_id) as empresas_visibles
  from public.v_textile_input_lot_balance
union all select 'v_textile_material_inventory', count(distinct organization_id)
  from public.v_textile_material_inventory
union all select 'v_latest_batch_recycled', count(distinct organization_id)
  from public.v_latest_batch_recycled
union all select 'v_output_batch_stock', count(distinct organization_id)
  from public.v_output_batch_stock
 order by 1;

\echo '  (con service_role verá todas: esta consulta SOLO significa algo'
\echo '   ejecutada con la sesión de una persona de UNA empresa)'

\echo ''
\echo '=== FIN · lo que hay que leer es la columna veredicto ==='
