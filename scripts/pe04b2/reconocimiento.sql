-- ============================================================================
-- Trazaloop · PE-04B2 · RECONOCIMIENTO PREVIO A LA MIGRACIÓN. SOLO LECTURA.
-- ----------------------------------------------------------------------------
-- Se ejecuta ANTES de aplicar 0163 a un entorno. Migrar sin haber contado es
-- como limpiar sin haber inventariado: la lección de PE-03B5.
--
-- «sin_clasificar» tiene que ser 0. Si no lo es, hay un estado que el diseño de
-- la migración no contempla, y hay que mirarlo antes de escribir nada.
--
--   psql "$PG" -X -f scripts/pe04b2/reconocimiento.sql
-- ============================================================================

\echo '-- EMPRESAS Y MODULOS --'
select count(distinct o.id) as empresas,
       count(*)             as filas_modulo_funcional
  from organizations o
  join organization_modules om on om.organization_id = o.id
  join modules m on m.code = om.module_code and m.is_functional;

\echo '-- CLASIFICACION POR MODULO --'
select case
         when not om.enabled                        then 'deshabilitado'
         when om.access_mode = 'extra'              then 'extra'
         when om.access_mode = 'full'               then 'full'
         when om.access_mode = 'demo'
              and (om.access_expires_at is null
                   or om.access_expires_at > now()) then 'prueba_vigente'
         when om.access_mode = 'demo'               then 'prueba_vencida'
         else 'sin_clasificar'
       end                              as categoria,
       count(*)                         as filas,
       count(distinct om.organization_id) as empresas
  from organization_modules om
  join modules m on m.code = om.module_code and m.is_functional
 group by 1 order by 1;

\echo '-- DESACUERDO ENTRE LAS DOS FUENTES VIEJAS --'
select count(*) filter (where s.plan_code is not null
        and s.plan_code <> case om.access_mode when 'extra' then 'extra'
                                               when 'full' then 'full'
                                               else 'demo' end) as en_desacuerdo,
       count(*)                                                 as total
  from organization_modules om
  join modules m on m.code = om.module_code and m.is_functional
  left join organization_subscriptions s on s.organization_id = om.organization_id;

\echo '-- EMPRESAS CON MEZCLA DE PLANES ENTRE MODULOS --'
select count(*) as empresas_con_mezcla from (
  select om.organization_id
    from organization_modules om
    join modules m on m.code = om.module_code and m.is_functional
   group by om.organization_id
  having count(distinct om.access_mode) > 1
) x;
