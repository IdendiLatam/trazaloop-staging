-- ============================================================================
-- QUALITY-12.2F · PRUEBA 4 · Dejar la empresa QA en TOPE DURO
-- ----------------------------------------------------------------------------
-- Solo ajusta la EXCEPCIÓN. No toca defaults globales ni el plan.
-- El techo se pone en el consumo actual: la siguiente operación se deniega.
-- ============================================================================
do $$
declare
  v_org uuid;
  v_mes integer;
begin
  select id into v_org from organizations
   where name = 'QUALITY-12.1 en vivo 41721770';
  if v_org is null then raise exception 'No se encontró la empresa QA.'; end if;

  select count(*) into v_mes from quality_ai_runs
   where organization_id = v_org
     and started_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';

  update intelligence_limit_overrides
     set revoked_at = now()
   where organization_id = v_org and revoked_at is null
     and reason like 'QUALITY-12.2F human validation%';

  insert into intelligence_limit_overrides
    (organization_id, runs_per_month, reason, effective_from, expires_at, created_by)
  values (v_org, greatest(v_mes, 1),
          'QUALITY-12.2F human validation · tope duro',
          now(), now() + interval '2 days', null);

  raise notice 'Consumo del mes ... % · techo temporal ... %', v_mes, greatest(v_mes, 1);
end;
$$;

-- Lo que verá la pantalla. Se calcula aquí con una consulta directa: la
-- función `intelligence_usage_status` exige sesión de la empresa —y hace bien—,
-- así que desde el editor de SQL no se puede llamar.
select
  o.name                                             as empresa,
  (select count(*) from quality_ai_runs r
    where r.organization_id = o.id
      and r.started_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')
                                                     as operaciones_del_mes,
  l.runs_per_month                                   as techo_efectivo,
  (select count(*) from quality_ai_runs r
    where r.organization_id = o.id
      and r.started_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')
    * 100 / l.runs_per_month                         as porcentaje,
  case when (select count(*) from quality_ai_runs r
              where r.organization_id = o.id
                and r.started_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')
            * 100 / l.runs_per_month >= 100 then 'at_limit'
       when (select count(*) from quality_ai_runs r
              where r.organization_id = o.id
                and r.started_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')
            * 100 / l.runs_per_month >= l.soft_limit_percent then 'near_limit'
       else 'normal' end                             as estado_esperado,
  l.override_id                                      as excepcion_activa
from organizations o,
     lateral intelligence_effective_limits(o.id) l
where o.name = 'QUALITY-12.1 en vivo 41721770';
