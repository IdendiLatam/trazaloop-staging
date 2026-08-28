-- ============================================================================
-- QUALITY-12.2F · PRUEBA 5 · Full y Extra reciben lo mismo
-- ----------------------------------------------------------------------------
-- Determinístico y sin gastar una llamada: se leen los límites efectivos con
-- el módulo en Full, se cambia a Extra, se vuelven a leer y se comparan.
-- Al final se deja el plan como estaba.
--
-- Conviene ejecutarlo DESPUÉS de restaurar (script 03): si queda una excepción
-- activa, la comparación sigue siendo válida —los dos lados la llevan— pero
-- los números que imprime son los de la excepción y despistan.
-- ============================================================================
do $$
declare
  v_org  uuid;
  v_prev text;
  v_full text;
  v_extra text;
begin
  select id into v_org from organizations
   where name = 'QUALITY-12.1 en vivo 41721770';

  select access_mode into v_prev from organization_modules
   where organization_id = v_org and module_code = 'quality';

  update organization_modules set access_mode = 'full', access_expires_at = null
   where organization_id = v_org and module_code = 'quality';
  select row(runs_per_minute, runs_per_hour, runs_per_month, max_concurrent)::text
    into v_full from intelligence_effective_limits(v_org);

  update organization_modules set access_mode = 'extra', access_expires_at = null
   where organization_id = v_org and module_code = 'quality';
  select row(runs_per_minute, runs_per_hour, runs_per_month, max_concurrent)::text
    into v_extra from intelligence_effective_limits(v_org);

  -- Se deja como estaba.
  update organization_modules set access_mode = v_prev
   where organization_id = v_org and module_code = 'quality';

  raise notice 'Con Full  ... %', v_full;
  raise notice 'Con Extra ... %', v_extra;
  if v_full is distinct from v_extra then
    raise exception 'Full y Extra reciben límites DISTINTOS: %  vs  %', v_full, v_extra;
  end if;
  raise notice 'IDÉNTICOS · el plan no cambia la capacidad de Intelligence';
end;
$$;
