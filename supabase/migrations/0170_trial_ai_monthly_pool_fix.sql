-- ===========================================================================
-- Trazaloop · 0170 · La bolsa mensual de Intelligence no la eleva la prueba
-- ===========================================================================
--
-- LO QUE SE CORRIGE
--
-- Una empresa en prueba recibía los 500 créditos mensuales de Full en vez de
-- los 25 de Free. La verdad comercial congelada en PE-04B4 dice otra cosa:
--
--   50 créditos de prueba, bolsa aparte que caduca
--   +
--   la bolsa mensual del plan comercial NO-PRUEBA que le corresponda.
--
-- POR QUÉ PASABA
--
-- `ai_credits_status` resolvía la bolsa mensual desde el PLAN EFECTIVO, y
-- durante la prueba el plan efectivo es Full por diseño. Eso es correcto para
-- todo lo demás —almacenamiento, conteos, funciones, reloj—: la prueba SÍ da
-- las capacidades de Full. Los créditos de Intelligence son el único recurso
-- donde la verdad comercial dice lo contrario, y el resolutor no tenía cómo
-- saberlo porque leía el mismo plan que todos los demás.
--
-- La asimetría es deliberada, y hasta hoy no estaba escrita en el código.
--
-- LA SEGUNDA CONSECUENCIA, QUE ERA PEOR
--
-- Lo gastado de la bolsa mensual se anota en el mes en curso. Durante la
-- prueba se medía contra el tope de Full; al caducar, las MISMAS filas se
-- medían contra el de Free. Una empresa que aceptó todo lo que el producto le
-- ofreció quedaba `OVER_LIMIT` sin haber excedido nada, justo cuando toca
-- decidir si paga.
--
-- LA REGLA, GENERAL
--
-- No se fija «25 durante la prueba»: eso volvería a romperse en cuanto una
-- empresa comprara Full con la prueba todavía viva. La regla es
--
--   bolsa mensual = la del plan de mayor rango entre las concesiones vivas
--                   que NO sean `trial`
--
-- de modo que Free+prueba da 25, Full comprado+prueba da 500 y Extra da 2000,
-- y en los tres casos la bolsa de 50 sigue existiendo aparte mientras dure.
--
-- SIN DATO NO ES CERO
--
-- Si no hay plan no-prueba resoluble, NO se cae a 25: se devuelve
-- `UNAVAILABLE`. Un fallo de resolución no es una cuota agotada, y presentarlo
-- como tal le diría al cliente que gastó algo que no gastó.
--
-- QUÉ NO HACE ESTA MIGRACIÓN
--
-- No toca ni una fila de `ai_credit_ledger`. Esas ejecuciones ocurrieron de
-- verdad: consumieron tokens, tiempo y dinero del proveedor, y su telemetría
-- es historia. Reescribirlas para que los libros cuadren sería falsificar lo
-- que pasó. Lo que sí hace es DECIR quién quedó afectado, para que la decisión
-- la tome una persona.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0 · PREFLIGHT DE SEGURIDAD · heredado de SEC-01 (0165)
-- ---------------------------------------------------------------------------
-- 0170 no crea ni una tabla, y aun así se niega a aplicarse sobre una base
-- expuesta. La lección de SEC-01 no fue «cuida las tablas que crees»: fue que
-- una base expuesta no se promueve, la toque esta migración o no.
do $$
declare
  v_expuestas text;
begin
  select string_agg(n.nspname || '.' || c.relname, ', ' order by c.relname)
    into v_expuestas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_expuestas is not null then
    raise exception 'SEC01_RLS_PREFLIGHT: hay tablas de public sin RLS: %', v_expuestas
      using hint = 'Actívales RLS con una política explícita antes de promover.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 0b · Comprobación previa · esta migración corrige a 0166 y presupone 0169
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.ai_credits_status(uuid)') is null then
    raise exception '0170 presupone 0166: no existe ai_credits_status';
  end if;
  if to_regprocedure('public.plan_effective_for_organization(uuid, timestamptz)') is null then
    raise exception '0170 presupone 0162: no existe plan_effective_for_organization';
  end if;
  raise notice '0170 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · UNA sola consulta de ranking, con dos puertas
-- ---------------------------------------------------------------------------
-- Se extrae el cuerpo del resolutor a una función interna en vez de copiarlo.
-- Copiarlo dejaría dos consultas que envejecen por separado, y la próxima
-- decisión comercial —un `grant_kind` nuevo, otra regla de rango— solo se
-- aplicaría a una de las dos. Es el mismo motivo por el que 0169 extrajo el
-- núcleo de transición de 0168 en vez de duplicarlo.
--
-- No lleva comprobación de identidad ni `security definer`: la ponen sus dos
-- puertas públicas. Y se le retira el permiso a todo el mundo para que nadie
-- pueda entrar por aquí saltándose esas comprobaciones.
create or replace function public.plan_effective_scan(
  p_organization_id uuid,
  p_as_of timestamptz,
  p_exclude_trial boolean
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_best record;
begin
  -- SOLO módulos FUNCIONALES: `core` nace en full para siempre en toda
  -- empresa porque es infraestructura. Si contara, toda empresa resolvería a
  -- Full y el plan no significaría nada.
  select r.plan_code, r.id as revision_id, a.grant_kind, a.ends_at
    into v_best
    from organization_plan_assignments a
    join plan_revisions r on r.id = a.plan_revision_id
    left join modules m on m.code = a.module_code
   where a.organization_id = p_organization_id
     and a.starts_at <= p_as_of
     and (a.ends_at is null or a.ends_at > p_as_of)
     and (a.scope = 'organization' or coalesce(m.is_functional, false))
     and (not p_exclude_trial or a.grant_kind <> 'trial')
   order by plan_rank(r.plan_code) desc, a.starts_at desc
   limit 1;

  if v_best.revision_id is null then
    return jsonb_build_object('status', 'absent');
  end if;

  return jsonb_build_object(
    'status', 'found',
    'plan_code', v_best.plan_code,
    'plan_revision_id', v_best.revision_id,
    'grant_kind', v_best.grant_kind,
    'ends_at', v_best.ends_at
  );
end;
$$;

revoke all on function public.plan_effective_scan(uuid, timestamptz, boolean)
  from public, anon, authenticated;

comment on function public.plan_effective_scan(uuid, timestamptz, boolean) is
  'PE-04 · 0170 · INTERNA. El ranking de concesiones vivas, una sola vez. `p_exclude_trial` deja fuera las concesiones de prueba, que es lo que necesita la bolsa mensual de Intelligence y NADA más. Sin permisos: se entra por plan_effective_for_organization o por plan_effective_for_organization_non_trial, que son las que comprueban identidad.';

-- ---------------------------------------------------------------------------
-- 2 · El resolutor de siempre · ahora delega, y no cambia de comportamiento
-- ---------------------------------------------------------------------------
create or replace function public.plan_effective_for_organization(
  p_organization_id uuid,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not (is_org_member(p_organization_id) or is_platform_staff()) then
    raise exception 'No autorizado para consultar el plan de esta empresa';
  end if;
  return plan_effective_scan(p_organization_id, p_as_of, false);
end;
$$;

comment on function public.plan_effective_for_organization(uuid, timestamptz) is
  'PE-04B1 · Nivel de empresa, para los recursos que son de la empresa. Excluye los modulos NO funcionales: `core` nace en full para siempre y contarlo haria que toda empresa resolviera a Full. Es el plan del PRODUCTO: durante una prueba de Full devuelve `full`, y eso es correcto.';

-- ---------------------------------------------------------------------------
-- 3 · La puerta nueva · el plan comercial que NO viene de una prueba
-- ---------------------------------------------------------------------------
create or replace function public.plan_effective_for_organization_non_trial(
  p_organization_id uuid,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not (is_org_member(p_organization_id) or is_platform_staff()) then
    raise exception 'No autorizado para consultar el plan de esta empresa';
  end if;
  return plan_effective_scan(p_organization_id, p_as_of, true);
end;
$$;

revoke all on function public.plan_effective_for_organization_non_trial(uuid, timestamptz)
  from public, anon;
grant execute on function public.plan_effective_for_organization_non_trial(uuid, timestamptz)
  to authenticated;

comment on function public.plan_effective_for_organization_non_trial(uuid, timestamptz) is
  'PE-04 · 0170 · El plan comercial de la empresa SIN contar las concesiones de prueba: `base`, `sold` y `courtesy`. Existe por un solo recurso —la bolsa mensual de Intelligence—, donde la verdad comercial dice que la prueba NO eleva. Para todo lo demas se usa plan_effective_for_organization: la prueba SI da las capacidades de Full.';

-- ---------------------------------------------------------------------------
-- 4 · La bolsa mensual de Intelligence · resolutor canónico y único
-- ---------------------------------------------------------------------------
-- Todo camino que necesite saber cuántos créditos mensuales tiene una empresa
-- —el estado, la reserva, la consola, la tarjeta del cliente— pasa por aquí.
-- Que haya UNO es lo que impide que el defecto vuelva por otra puerta.
create or replace function public.ai_monthly_allowance(
  p_organization_id uuid,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_plan jsonb;
  v_lim  jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not (public.is_org_member(p_organization_id) or public.is_platform_staff()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  v_plan := public.plan_effective_scan(p_organization_id, p_as_of, true);

  -- SIN DATO NO ES CERO, y tampoco son 25. Que no haya plan no-prueba
  -- resoluble no significa que la empresa esté en Free: significa que no se
  -- sabe, y no se sabe DENIEGA. Caer a 25 sería inventar una cuota; caer a 500
  -- sería regalar la de otro plan.
  if v_plan->>'status' <> 'found' then
    return jsonb_build_object('status', 'unavailable', 'reason', 'non_trial_plan_absent');
  end if;

  v_lim := public.plan_limit_for_revision(
    (v_plan->>'plan_revision_id')::uuid, 'ai_weighted_credits_monthly');

  if v_lim->>'status' = 'not_configured' then
    return jsonb_build_object('status', 'unavailable', 'reason', 'limit_not_configured',
      'plan_code', v_plan->'plan_code');
  end if;

  return jsonb_build_object(
    'status', 'resolved',
    'plan_code', v_plan->'plan_code',
    'plan_revision_id', v_plan->'plan_revision_id',
    'grant_kind', v_plan->'grant_kind',
    'limit_state', v_lim->>'status',
    'limit_value', case when v_lim->>'status' = 'finite'
                        then (v_lim->>'value')::integer else null end
  );
end;
$$;

revoke all on function public.ai_monthly_allowance(uuid, timestamptz) from public, anon;
grant execute on function public.ai_monthly_allowance(uuid, timestamptz) to authenticated;

comment on function public.ai_monthly_allowance(uuid, timestamptz) is
  'PE-04 · 0170 · La bolsa MENSUAL de Intelligence, y el unico sitio donde se decide. Sale del plan comercial NO-PRUEBA: Free+prueba da 25, Full comprado+prueba da 500, Extra da 2000. Si no se puede resolver devuelve `unavailable`: no cae a 25 ni a 500.';

-- ---------------------------------------------------------------------------
-- 5 · El estado de créditos · las dos bolsas, y de dónde sale cada una
-- ---------------------------------------------------------------------------
-- `plan_code` sigue siendo el plan del PRODUCTO —Full durante la prueba—,
-- porque es lo que el cliente contrató y lo que dicen los otros cuatro ejes.
-- Se añade `monthly_plan_code`, que es de dónde sale la bolsa mensual. Son dos
-- conceptos distintos y confundirlos es exactamente lo que produjo el defecto:
-- ahora los dos están en la respuesta, con nombres distintos.
create or replace function public.ai_credits_status(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_plan     jsonb;
  v_mens     jsonb;
  v_month    date;
  v_monthly_limit integer;
  v_monthly_used  integer;
  v_trial    record;
  v_trial_total integer;
  v_trial_used  integer;
  v_state    text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not (public.is_org_member(p_organization_id) or public.is_platform_staff()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  v_month := public.organization_business_month(p_organization_id);
  v_plan  := public.plan_effective_for_organization(p_organization_id, now());

  if v_plan->>'status' <> 'found' then
    return jsonb_build_object(
      'state', 'UNAVAILABLE',
      'reason', case v_plan->>'status' when 'absent' then 'plan_absent' else 'plan_unreadable' end,
      'period_month', v_month);
  end if;

  -- LA BOLSA MENSUAL NO SALE DEL PLAN EFECTIVO. Sale del plan no-prueba.
  v_mens := public.ai_monthly_allowance(p_organization_id, now());
  if v_mens->>'status' <> 'resolved' then
    return jsonb_build_object('state', 'UNAVAILABLE',
      'reason', v_mens->>'reason',
      'plan_code', v_plan->'plan_code', 'period_month', v_month);
  end if;

  v_monthly_limit := case when v_mens->>'limit_state' = 'finite'
                          then (v_mens->>'limit_value')::integer else null end;

  select coalesce(sum(weight_credits), 0)::integer into v_monthly_used
    from public.ai_credit_ledger
   where organization_id = p_organization_id and pool = 'monthly'
     and period_month = v_month and state <> 'released';

  -- La bolsa de la prueba: existe solo mientras la concesión esté viva.
  select a.id, a.ends_at into v_trial
    from public.organization_plan_assignments a
   where a.organization_id = p_organization_id
     and a.grant_kind = 'trial'
     and a.starts_at <= now()
     and (a.ends_at is null or a.ends_at > now())
   order by a.starts_at desc
   limit 1;

  if v_trial.id is not null then
    select coalesce(t.trial_ai_credits, 0) into v_trial_total from public.commercial_trial_policy t;
    select coalesce(sum(weight_credits), 0)::integer into v_trial_used
      from public.ai_credit_ledger
     where trial_assignment_id = v_trial.id and state <> 'released';
  else
    v_trial_total := 0;
    v_trial_used := 0;
  end if;

  v_state := case
    when v_monthly_limit is null then 'AVAILABLE'                                  -- ilimitado
    when (v_trial.id is not null and v_trial_total - v_trial_used > 0) then 'AVAILABLE'
    when v_monthly_used < v_monthly_limit then 'AVAILABLE'
    when v_monthly_used = v_monthly_limit then 'AT_LIMIT'
    else 'OVER_LIMIT'
  end;

  return jsonb_build_object(
    'state', v_state,
    'reason', null,
    'plan_code', v_plan->'plan_code',
    'monthly_plan_code', v_mens->'plan_code',
    'period_month', v_month,
    'limit_state', v_mens->>'limit_state',
    'monthly_limit', v_monthly_limit,
    'monthly_used', v_monthly_used,
    'monthly_remaining', case when v_monthly_limit is null then null
                              else greatest(v_monthly_limit - v_monthly_used, 0) end,
    'trial_active', v_trial.id is not null,
    'trial_ends_at', v_trial.ends_at,
    'trial_total', case when v_trial.id is null then null else v_trial_total end,
    'trial_used', case when v_trial.id is null then null else v_trial_used end,
    'trial_remaining', case when v_trial.id is null then null
                            else greatest(v_trial_total - v_trial_used, 0) end
  );
end;
$$;

revoke all on function public.ai_credits_status(uuid) from public, anon;
grant execute on function public.ai_credits_status(uuid) to authenticated;

comment on function public.ai_credits_status(uuid) is
  'PE-04B4 · 0170 · Estado comercial de Intelligence: AVAILABLE | AT_LIMIT | OVER_LIMIT | UNAVAILABLE. Las dos bolsas se informan por separado, y desde 0170 tambien SU ORIGEN: `plan_code` es el plan del producto —Full durante la prueba— y `monthly_plan_code` es el plan NO-PRUEBA del que sale la bolsa mensual —Free durante esa misma prueba—. La bolsa de la prueba NO es un adelanto de los 500 de Full.';

-- ---------------------------------------------------------------------------
-- 6 · El diagnóstico · quién quedó afectado, sin tocarle una fila
-- ---------------------------------------------------------------------------
-- Mientras el defecto estuvo vivo, una empresa en prueba pudo gastar bolsa
-- mensual por encima de lo que su plan no-prueba le daba. Esas ejecuciones
-- ocurrieron: no se borran ni se reescriben. Lo que hace falta es SABER
-- quiénes son, para que una persona decida.
--
-- El diagnóstico no puede reconstruir el pasado con exactitud —el plan de una
-- empresa pudo cambiar dentro del mes—, así que no pretende hacerlo: compara
-- lo consumido con lo que da su plan no-prueba ACTUAL y señala candidatos.
-- Señalar de más es aceptable; señalar de menos, no.
create or replace function public.ai_trial_monthly_overrun()
returns table (
  organization_id uuid,
  organization_name text,
  period_month date,
  monthly_used integer,
  non_trial_plan text,
  non_trial_allowance integer,
  excess integer,
  had_trial_in_month boolean,
  looks_synthetic boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with plan_actual as (
    select o.id as org, o.name,
           (select r.plan_code
              from organization_plan_assignments a
              join plan_revisions r on r.id = a.plan_revision_id
              left join modules m on m.code = a.module_code
             where a.organization_id = o.id
               and a.starts_at <= now()
               and (a.ends_at is null or a.ends_at > now())
               and (a.scope = 'organization' or coalesce(m.is_functional, false))
               and a.grant_kind <> 'trial'
             order by plan_rank(r.plan_code) desc, a.starts_at desc
             limit 1) as plan_code
      from organizations o
  ),
  tope as (
    select p.org, p.name, p.plan_code,
           (select l.limit_value
              from plan_revisions r
              join plan_revision_limits l on l.plan_revision_id = r.id
             where r.plan_code = p.plan_code
               and r.status = 'published' and r.effective_to is null
               and l.resource_code = 'ai_weighted_credits_monthly') as tope
      from plan_actual p
  ),
  gasto as (
    select c.organization_id as org, c.period_month,
           coalesce(sum(c.weight_credits), 0)::integer as usado
      from ai_credit_ledger c
     where c.pool = 'monthly' and c.state <> 'released'
     group by c.organization_id, c.period_month
  )
  select g.org, t.name, g.period_month, g.usado,
         t.plan_code, t.tope::integer, (g.usado - t.tope)::integer,
         exists (
           select 1 from organization_plan_assignments a
            where a.organization_id = g.org and a.grant_kind = 'trial'
              and a.starts_at < (g.period_month + interval '1 month')
              and (a.ends_at is null or a.ends_at >= g.period_month)
         ),
         t.name ~ '^(B[0-9]|SEC01|DBG|QA )'
    from gasto g
    join tope t on t.org = g.org
   where t.tope is not null and g.usado > t.tope
   order by (g.usado - t.tope) desc;
$$;

revoke all on function public.ai_trial_monthly_overrun() from public, anon, authenticated;
grant execute on function public.ai_trial_monthly_overrun() to service_role;

comment on function public.ai_trial_monthly_overrun() is
  'PE-04 · 0170 · Empresas cuyo consumo mensual de Intelligence supera lo que da su plan NO-PRUEBA actual. Es el rastro que dejo el defecto corregido en 0170. NO corrige nada: senala candidatos para que una persona decida. `looks_synthetic` marca los nombres de QA por convencion del repositorio; no es autoridad, es una pista.';

-- ---------------------------------------------------------------------------
-- 7 · Y se dice en voz alta al aplicar
-- ---------------------------------------------------------------------------
-- La migración no remedia datos. Pero aplicarla es el momento en que alguien
-- está mirando, así que es el momento de decir qué encontró.
do $$
declare
  v_total int; v_qa int; v_real int; r record;
begin
  select count(*), count(*) filter (where looks_synthetic),
         count(*) filter (where not looks_synthetic)
    into v_total, v_qa, v_real
    from public.ai_trial_monthly_overrun();

  raise notice '0170 · empresas con consumo mensual por encima de su plan no-prueba: % (QA: %, no-QA: %)',
    v_total, v_qa, v_real;

  for r in select * from public.ai_trial_monthly_overrun() loop
    raise notice '0170 ·   % · % · %/% en % · exceso % · prueba en el mes: % · QA: %',
      r.organization_id, r.organization_name, r.monthly_used, r.non_trial_allowance,
      r.period_month, r.excess, r.had_trial_in_month, r.looks_synthetic;
  end loop;

  if v_real > 0 then
    raise notice '0170 · HAY % empresa(s) que NO parecen de QA. Ninguna fila se ha tocado: la decision es de una persona.', v_real;
  end if;
end $$;
