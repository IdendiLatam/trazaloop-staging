-- ============================================================================
-- Trazaloop · QUALITY-12.2F · LA CONSOLA DE PLATAFORMA NO VEÍA NADA
-- ----------------------------------------------------------------------------
-- La primera validación humana abrió `/platform/intelligence` con una cuenta
-- `support` activa y la consola dijo «todavía no hay consumo registrado».
-- Había 282 operaciones en la base.
--
--
-- LA CAUSA, QUE NO ERA UN FALLO DE PERMISOS SINO SU CONTRARIO
--
-- La ruta autorizaba correctamente: `is_platform_staff()` devolvía `true` y la
-- página abría. Lo que devolvía cero era la BASE.
--
-- Las cuatro vistas de 0140 se crearon con `security_invoker = true`, que es
-- lo correcto para una vista de empresa: hace que cada quien vea lo suyo. Pero
-- eso significa que la RLS de `quality_ai_runs` se evalúa con la identidad de
-- quien pregunta, y esa política dice:
--
--     is_org_member(organization_id) and (actor_id = auth.uid() or ...)
--
-- Una persona de plataforma **no pertenece a ninguna empresa**. Por diseño:
-- `platform_staff` es una capa separada de `memberships` desde 0040. Así que
-- `is_org_member(...)` era falso para TODAS las filas, y la vista devolvía
-- cero. Sin error. Con éxito. Cero.
--
-- Es la peor forma de fallar: una consola de observabilidad convirtiendo una
-- lectura denegada en «no hay consumo». Autorización de ruta correcta,
-- autorización de datos denegada, y ningún sitio donde se notara la
-- diferencia.
--
--
-- EL ARREGLO, QUE YA TENÍA PRECEDENTE EN ESTE REPOSITORIO
--
-- 0055 resolvió exactamente esto para `v_platform_organizations` y
-- `v_platform_organization_members`: son vistas SIN `security_invoker`,
-- propiedad de `postgres` —que tiene `bypassrls`—, y con
-- `where is_platform_staff()` DENTRO. La vista es la frontera, y el filtro
-- está en la vista.
--
-- Aquí se hace lo mismo, con dos cuidados:
--
--   1 · Solo las vistas DE PLATAFORMA cambian. Las de empresa siguen con
--       `security_invoker`, porque ahí sí queremos que cada empresa vea la
--       suya y ninguna más.
--
--   2 · Ninguna de las dos expone `question` ni `answer`. Para ver cuánto
--       consume una empresa no hace falta leer lo que su gente escribió, y
--       ampliar la visibilidad no es motivo para ampliar lo que se ve.
--
-- Y la distinción de §40 se mantiene intacta: `support` VE, solo `superadmin`
-- ESCRIBE. Esta migración no toca una sola política de escritura.
-- ============================================================================


-- ============================================================================
-- 1 · EL CONSUMO POR EMPRESA, VISIBLE PARA LA PLATAFORMA
-- ----------------------------------------------------------------------------
-- Se sustituye la de 0140. Mismas columnas, misma semántica, y ahora sí
-- devuelve filas a quien tiene derecho a verlas.
--
-- `drop` y `create` en vez de `create or replace`: cambiar las opciones de
-- seguridad de una vista existente no se puede hacer con `replace`.
-- ============================================================================

drop view if exists public.v_intelligence_usage_platform;

create view public.v_intelligence_usage_platform as
select
  o.id            as organization_id,
  o.name          as organization_name,
  date_trunc('month', r.started_at at time zone 'UTC')::date as month_utc,
  count(*)                                        as runs,
  count(*) filter (where r.provider_called)       as provider_calls,
  count(*) filter (where r.status in ('failed', 'refused')) as failures,
  count(distinct r.actor_id)                      as actors,
  sum(coalesce(r.input_tokens, 0))                as input_tokens,
  sum(coalesce(r.cached_input_tokens, 0))         as cached_input_tokens,
  sum(coalesce(r.output_tokens, 0))               as output_tokens,
  sum(coalesce(r.reasoning_tokens, 0))            as reasoning_tokens,
  sum(coalesce(r.total_tokens, 0))                as total_tokens,
  round(avg(r.latency_ms) filter (where r.provider_called), 0) as avg_latency_ms,
  sum(case when r.provider_called
           then coalesce(intelligence_run_cost_usd(r.provider, r.model, r.started_at,
                  r.input_tokens, r.cached_input_tokens, r.output_tokens,
                  r.reasoning_tokens), 0)
           else 0 end)                            as estimated_cost_usd
from public.quality_ai_runs r
join public.organizations o on o.id = r.organization_id
-- La frontera. Sin esto, la vista enseñaría todas las empresas a cualquiera.
where public.is_platform_staff()
group by o.id, o.name, date_trunc('month', r.started_at at time zone 'UTC');

revoke all on public.v_intelligence_usage_platform from public, anon;
grant select on public.v_intelligence_usage_platform to authenticated;

comment on view public.v_intelligence_usage_platform is
  'QUALITY-12.2F · Consumo por empresa para la plataforma. SIN security_invoker a proposito: platform_staff no pertenece a ninguna empresa, asi que la RLS de quality_ai_runs le devolvia cero filas. El filtro is_platform_staff() esta DENTRO y es la unica frontera. Mismo patron que 0055.';


-- ============================================================================
-- 2 · EL DESGLOSE POR CAPACIDAD, TAMBIÉN
-- ----------------------------------------------------------------------------
-- La consola pide el desglose sin filtrar por empresa, y la vista de empresa
-- —que sigue siendo `security_invoker`, y debe seguirlo— le devolvía cero por
-- la misma razón. Se añade su gemela de plataforma en vez de relajar aquella.
--
-- Dos vistas parecidas es un precio pequeño frente a una vista que sirva a los
-- dos casos: esa tendría que decidir por dentro quién pregunta, y ahí es donde
-- se cuelan los fallos de aislamiento.
-- ============================================================================

create or replace view public.v_intelligence_usage_platform_by_use_case as
select
  r.use_case,
  uc.label as use_case_label,
  uc.cost_class,
  date_trunc('month', r.started_at at time zone 'UTC')::date as month_utc,
  count(*)                                        as runs,
  count(*) filter (where r.provider_called)       as provider_calls,
  count(*) filter (where r.status = 'succeeded')  as succeeded,
  count(*) filter (where r.status in ('failed', 'refused')) as failed,
  count(distinct r.organization_id)               as organizations,
  sum(coalesce(r.input_tokens, 0))                as input_tokens,
  sum(coalesce(r.cached_input_tokens, 0))         as cached_input_tokens,
  sum(coalesce(r.output_tokens, 0))               as output_tokens,
  sum(coalesce(r.reasoning_tokens, 0))            as reasoning_tokens,
  sum(coalesce(r.total_tokens, 0))                as total_tokens,
  round(avg(r.input_tokens) filter (where r.provider_called), 1)  as avg_input,
  round(avg(r.output_tokens) filter (where r.provider_called), 1) as avg_output,
  round(avg(r.latency_ms) filter (where r.provider_called), 0)    as avg_latency_ms,
  sum(case when r.provider_called
           then coalesce(intelligence_run_cost_usd(r.provider, r.model, r.started_at,
                  r.input_tokens, r.cached_input_tokens, r.output_tokens,
                  r.reasoning_tokens), 0)
           else 0 end)                            as estimated_cost_usd
from public.quality_ai_runs r
left join public.intelligence_use_cases uc on uc.use_case = r.use_case
where public.is_platform_staff()
group by r.use_case, uc.label, uc.cost_class,
         date_trunc('month', r.started_at at time zone 'UTC');

revoke all on public.v_intelligence_usage_platform_by_use_case from public, anon;
grant select on public.v_intelligence_usage_platform_by_use_case to authenticated;

comment on view public.v_intelligence_usage_platform_by_use_case is
  'QUALITY-12.2F · Desglose por capacidad, para la plataforma. Gemela de v_intelligence_usage_by_use_case, que sigue siendo de empresa. Ninguna de las dos expone la pregunta ni la respuesta.';


-- ============================================================================
-- 3 · LO QUE NO CAMBIA, Y CONVIENE DECIRLO
-- ----------------------------------------------------------------------------
-- `v_intelligence_usage_runs`, `v_intelligence_usage_by_use_case` y
-- `v_intelligence_usage_by_actor` siguen con `security_invoker = true`. Son
-- vistas de empresa y ahí la RLS que devolvía cero a la plataforma es
-- exactamente la que impide que una empresa vea a otra.
--
-- Y no se toca ninguna política de escritura: `support` sigue sin poder
-- cambiar un límite ni crear una excepción. Lo que se ha arreglado es la
-- VISIBILIDAD, que es la mitad que estaba rota.
-- ============================================================================
