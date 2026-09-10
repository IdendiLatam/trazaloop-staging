-- ===========================================================================
-- Trazaloop · STABILIZATION-01 · Los límites del plan vuelven a poder leerse
-- ===========================================================================
--
-- EL FALLO, Y POR QUÉ NADIE LO VIO
--
-- `plan_revision_limits.limit_value` es `bigint` desde 0162 —tuvo que serlo: el
-- almacenamiento de Extra son 5 368 709 120 bytes y eso no cabe en un `int4`—.
-- Pero `organization_plan_limits`, escrita en 0166, declara su tercera columna
-- de salida como `integer`. Postgres compara la forma declarada con la real al
-- devolver el conjunto, y aborta:
--
--   ERROR:  structure of query does not match function result type
--   DETALLE: Returned type bigint does not match expected type integer in column 3
--
-- No falla solo con Extra: falla con TODAS las empresas, porque la comprobación
-- es de tipo, no de valor. Y lleva callado desde entonces porque quien la llama
-- —`listOrganizationPlanLimits`— traduce cualquier error a lista vacía, y una
-- lista vacía se dibuja igual que «este plan no tiene límites configurados».
-- Así que el Panel y la ficha de empresa de la consola llevan enseñando CERO
-- límites, sin un solo mensaje de error.
--
-- QUÉ CAMBIA AQUÍ, Y QUÉ NO
--
-- Solo el tipo de esa columna de salida. Ni una línea de lógica: mismo cuerpo,
-- mismas comprobaciones de sesión, misma fuente. Hay que borrar y recrear
-- porque `create or replace function` no admite cambiar el tipo de retorno, y
-- por eso se vuelven a poner los privilegios tal y como estaban en 0166.
--
-- PRODUCCIÓN. Aditiva en el único sentido que importa: no toca ni una fila.
-- Ni organizaciones, ni asignaciones, ni módulos, ni derechos, ni auth. La
-- única escritura de esta migración es la definición de una función que hoy no
-- funciona.

do $$
begin
  if to_regclass('public.plan_revision_limits') is null
     or to_regclass('public.organization_plan_assignments') is null then
    raise exception '0187 presupone 0162 y 0166';
  end if;

  -- La razón de ser de esta migración, comprobada y no supuesta: si algún día
  -- la columna volviera a ser `integer`, este arreglo sobraría y habría que
  -- mirar por qué.
  if (select data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'plan_revision_limits'
         and column_name = 'limit_value') is distinct from 'bigint' then
    raise exception '0187 presupone que plan_revision_limits.limit_value es bigint';
  end if;

  raise notice '0187 · comprobación previa correcta';
end $$;

drop function if exists public.organization_plan_limits(uuid);

/** Todos los límites del plan vigente, para las pantallas que los enseñan. La
 *  consola de plataforma tiene que mostrar LOS MISMOS que el servidor aplica:
 *  mientras los leyera del catálogo legacy podía enseñar unos y exigir otros.
 *
 *  STABILIZATION-01 · `limit_value` es `bigint`, como en la tabla de la que
 *  sale. Declararlo `integer` hacía que la función abortara para cualquier
 *  empresa. */
create or replace function public.organization_plan_limits(p_organization_id uuid)
returns table (resource_code text, limit_state text, limit_value bigint, plan_code text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_plan jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not (public.is_org_member(p_organization_id) or public.is_platform_staff()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  v_plan := public.plan_effective_for_organization(p_organization_id, now());
  if v_plan->>'status' <> 'found' then
    return;  -- sin plan resuelto no se enseñan los límites de ninguno
  end if;

  return query
  select l.resource_code, l.limit_state, l.limit_value, v_plan->>'plan_code'
    from public.plan_revision_limits l
   where l.plan_revision_id = (v_plan->>'plan_revision_id')::uuid
   order by l.resource_code;
end;
$$;

revoke all on function public.organization_plan_limits(uuid) from public, anon;
grant execute on function public.organization_plan_limits(uuid) to authenticated;
