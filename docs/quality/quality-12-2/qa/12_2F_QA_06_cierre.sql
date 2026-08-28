-- ============================================================================
-- QUALITY-12.2F · VERIFICACIÓN DE CIERRE · SOLO LECTURA salvo la revocación
-- ----------------------------------------------------------------------------
-- Ejecutar en el SQL Editor de STAGING. Devuelve cinco bloques que responden a
-- §6, §7, §8, §10 y §18 del cierre. Ninguno expone contenido de nadie.
--
-- La ÚNICA sentencia que escribe es el bloque 5, que revoca el acceso de
-- plataforma de la cuenta temporal de QA. Va la última a propósito: si algo de
-- lo anterior sale mal, esa cuenta sigue sirviendo para volver a mirar.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · §7 · ¿Quedó la empresa QA en los límites por defecto?
-- ---------------------------------------------------------------------------
select
  '1 · límites efectivos'                as bloque,
  l.runs_per_minute, l.runs_per_hour, l.runs_per_month, l.max_concurrent,
  l.soft_limit_percent, l.hard_limit_enabled,
  l.override_id                          as excepcion_activa,
  (l.runs_per_minute = 60 and l.runs_per_hour = 600
   and l.runs_per_month = 10000 and l.max_concurrent = 8
   and l.override_id is null)            as todo_en_su_sitio
from organizations o,
     lateral intelligence_effective_limits(o.id) l
where o.name = 'QUALITY-12.1 en vivo 41721770';

-- ---------------------------------------------------------------------------
-- 2 · §7 · El rastro histórico de las excepciones NO se ha borrado
-- ---------------------------------------------------------------------------
select
  '2 · rastro de excepciones'            as bloque,
  reason, runs_per_month,
  effective_from, expires_at, revoked_at,
  (revoked_at is not null or expires_at < now()) as ya_no_aplica
from intelligence_limit_overrides
where organization_id = (select id from organizations
                          where name = 'QUALITY-12.1 en vivo 41721770')
order by created_at;

-- ---------------------------------------------------------------------------
-- 3 · §8 · El plan comercial de la empresa QA, sin mutaciones temporales
-- ---------------------------------------------------------------------------
select
  '3 · módulos'                          as bloque,
  module_code, enabled, access_mode, access_expires_at
from organization_modules
where organization_id = (select id from organizations
                          where name = 'QUALITY-12.1 en vivo 41721770')
  and module_code in ('quality', 'traceability_6632', 'textiles')
order by module_code;

-- ---------------------------------------------------------------------------
-- 4 · §6 · El intento bloqueado por el tope duro
-- ---------------------------------------------------------------------------
-- Si el guardián denegó ANTES de abrir la operación, no hay fila que enseñar,
-- y eso es exactamente lo correcto: no se abre un run para registrar que no se
-- hizo nada. Lo que se comprueba es que NINGUNA operación reciente quedara
-- registrada como llamada al proveedor sin consumo.
select
  '4 · operaciones recientes'            as bloque,
  use_case, status, provider_called,
  coalesce(input_tokens, 0)              as entrada,
  coalesce(output_tokens, 0)             as salida,
  started_at
from quality_ai_runs
where organization_id = (select id from organizations
                          where name = 'QUALITY-12.1 en vivo 41721770')
order by started_at desc
limit 8;

-- ---------------------------------------------------------------------------
-- 5 · §18 · Revocar la cuenta temporal de plataforma
-- ---------------------------------------------------------------------------
-- `revoked`, no DELETE: es la semántica que diseñó la 0040 y conserva el
-- rastro de que esa cuenta tuvo acceso y de cuándo se le quitó.
update public.platform_staff
   set status = 'revoked', updated_at = now()
 where user_id = (select id from public.profiles
                   where lower(email) = lower('qa-platform-intelligence@trazaloop-staging.local'))
   and status <> 'revoked';

select
  '5 · cuenta temporal de QA'            as bloque,
  p.email                                as correo,
  s.role_code                            as rol,
  s.status                               as estado,
  (s.status = 'active')                  as puede_entrar_a_plataforma,
  (s.status = 'active' and s.role_code = 'superadmin') as puede_cambiar_limites
from public.platform_staff s
join public.profiles p on p.id = s.user_id
where lower(p.email) = lower('qa-platform-intelligence@trazaloop-staging.local');
