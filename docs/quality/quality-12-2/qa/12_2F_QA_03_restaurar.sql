-- ============================================================================
-- QUALITY-12.2F · RESTAURAR · retirar la excepción de validación
-- ----------------------------------------------------------------------------
-- Deja la empresa QA con los límites por defecto. No borra el rastro: la
-- excepción queda revocada, con quién y cuándo, que es lo que pide la
-- auditabilidad de §40.
-- ============================================================================
update intelligence_limit_overrides
   set revoked_at = now()
 where organization_id = (select id from organizations
                           where name = 'QUALITY-12.1 en vivo 41721770')
   and revoked_at is null
   and reason like 'QUALITY-12.2F human validation%';

-- Comprobación: tienen que salir los defectos globales, sin excepción activa.
select runs_per_minute, runs_per_hour, runs_per_month, max_concurrent,
       soft_limit_percent, hard_limit_enabled, override_id
  from intelligence_effective_limits(
    (select id from organizations where name = 'QUALITY-12.1 en vivo 41721770'));
