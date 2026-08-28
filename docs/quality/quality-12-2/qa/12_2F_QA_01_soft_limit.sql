-- ============================================================================
-- QUALITY-12.2F · PRUEBA 3 · Dejar la empresa QA en UMBRAL BLANDO
-- ----------------------------------------------------------------------------
-- Ejecutar en el SQL Editor de STAGING. No toca defaults globales: crea una
-- EXCEPCIÓN por organización, que es el mecanismo que 12.2F implementó
-- precisamente para esto.
--
-- El techo se calcula AQUÍ a partir del consumo real del mes, para dejar a la
-- empresa alrededor del 85 %: por encima del umbral blando (80 %) y por debajo
-- del duro (100 %).
--
-- Temporal, con motivo, con caducidad y reversible.
-- ============================================================================
do $$
declare
  v_org   uuid;
  v_mes   integer;
  v_techo integer;
begin
  select id into v_org from organizations
   where name = 'QUALITY-12.1 en vivo 41721770';
  if v_org is null then
    raise exception 'No se encontró la empresa QA por nombre exacto.';
  end if;

  select count(*) into v_mes from quality_ai_runs
   where organization_id = v_org
     and started_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';

  if v_mes = 0 then
    raise exception 'La empresa QA no tiene consumo este mes: no se puede simular un umbral sin operaciones.';
  end if;

  -- Techo tal que el consumo actual quede en ~85 %.
  v_techo := greatest(ceil(v_mes / 0.85)::int, v_mes + 1);

  -- Se retira cualquier excepción previa de esta validación.
  update intelligence_limit_overrides
     set revoked_at = now()
   where organization_id = v_org and revoked_at is null
     and reason like 'QUALITY-12.2F human validation%';

  insert into intelligence_limit_overrides
    (organization_id, runs_per_month, reason, effective_from, expires_at, created_by)
  values (v_org, v_techo,
          'QUALITY-12.2F human validation · umbral blando',
          now(), now() + interval '2 days', null);

  raise notice 'Empresa .............. %', v_org;
  raise notice 'Consumo del mes ...... % operaciones', v_mes;
  raise notice 'Techo temporal ....... %', v_techo;
  raise notice 'Porcentaje esperado .. % %%', (v_mes * 100 / v_techo);
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
