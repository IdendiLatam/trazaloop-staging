-- ===========================================================================
-- 0168 · PE-04B6 · UNA TRANSICIÓN COMERCIAL QUE DE VERDAD TRANSICIONA
-- ---------------------------------------------------------------------------
-- EL DEFECTO
--
-- `commercial_assign_plan` (0167) INSERTABA la asignación nueva y no cerraba la
-- anterior. Como el resolutor toma la de mayor rango entre las activas, asignar
-- Full a una empresa que ya tenía Extra la dejaba… en Extra:
--
--     asignar extra → ok → plan efectivo: extra
--     asignar full  → ok → plan efectivo: extra      ← la bajada no bajó nada
--
-- Subir funcionaba por casualidad —el rango mayor gana—; solo estaba roto el
-- sentido que cuesta dinero. Y la consola de PE-04B5 ofrece esa transición como
-- ÚNICA vía, enseñando un aviso de impacto para algo que no ocurría.
--
-- LA REGLA QUE FALTABA, Y LA QUE NO
--
-- El propio disparador de la tabla ya lo decía: «una asignación no se reescribe:
-- se cierra con ends_at y se abre otra». Nadie cerraba la anterior.
--
-- Pero cerrar TODO lo del mismo alcance habría roto el modelo. La arquitectura
-- de PE-04B2 es SUELO + SOBRECAPAS:
--
--   · `base`     · el suelo Free permanente de cada módulo. Es lo que hace que
--                  una prueba caducada caiga a Free en vez de a la nada. Si se
--                  cerrara, retirar mañana una asignación dejaría al módulo SIN
--                  plan, y «sin plan» NIEGA.
--   · `trial`    · una concesión temporal con su propio fin. Caduca sola por el
--                  paso del tiempo; una transición comercial no la cancela.
--                  Quien recibió 48 horas de Full las recibió.
--   · `sold` /
--     `courtesy` · la concesión comercial PERMANENTE. Es la única que compite
--                  consigo misma: no puede haber dos abiertas a la vez en el
--                  mismo alcance, porque entonces «cuál tiene la empresa» deja
--                  de tener una respuesta.
--
-- Así que se cierran EXACTAMENTE las permanentes del mismo alcance. Ni el
-- suelo, ni las pruebas, ni nada de otro módulo.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0 · PREFLIGHT DE SEGURIDAD · heredado de SEC-01 (0165)
-- ---------------------------------------------------------------------------
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
-- 1 · NORMALIZACIÓN · lo que el defecto pudo dejar suelto
-- ---------------------------------------------------------------------------
-- Mientras el defecto estuvo vivo, dos transiciones sobre el mismo alcance
-- dejaban DOS permanentes abiertas. Aquí se resuelve de la única forma
-- determinista y fiel a la intención: la más RECIENTE es la que alguien quiso
-- que valiera, así que se conserva abierta y las anteriores se cierran en el
-- instante en que empezó la que las sustituyó.
--
-- No se borra ni una fila: la historia de lo que la empresa tuvo se conserva
-- entera, solo que ahora con su periodo correctamente delimitado.
--
-- Es idempotente y es un no-op donde no hubo defecto.
do $$
declare
  v_fila record;
  v_arregladas int := 0;
begin
  for v_fila in
    with permanentes as (
      select a.id, a.organization_id, a.scope, a.module_code, a.starts_at,
             row_number() over (
               partition by a.organization_id, a.scope, coalesce(a.module_code, '')
               order by a.starts_at desc, a.created_at desc, a.id desc
             ) as puesto,
             max(a.starts_at) over (
               partition by a.organization_id, a.scope, coalesce(a.module_code, '')
             ) as ultima_apertura
        from public.organization_plan_assignments a
       where a.ends_at is null
         and a.grant_kind in ('sold', 'courtesy')
    )
    select id, starts_at, ultima_apertura from permanentes where puesto > 1
  loop
    -- Si dos abrieron en el MISMO instante, cerrar en ese instante violaría
    -- `ends_at > starts_at`. Se cierra un microsegundo después: un solape
    -- infinitesimal es preferible a dejar la invariante rota.
    update public.organization_plan_assignments
       set ends_at = greatest(v_fila.ultima_apertura,
                              v_fila.starts_at + interval '1 microsecond')
     where id = v_fila.id;
    v_arregladas := v_arregladas + 1;
  end loop;

  if v_arregladas > 0 then
    raise notice '0168 · asignaciones permanentes solapadas normalizadas: %', v_arregladas;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2 · LA INVARIANTE, EN EL ESQUEMA
-- ---------------------------------------------------------------------------
-- Una sola concesión comercial permanente ABIERTA por alcance. Las cerradas no
-- estorban —son historia— y el suelo `base` y las pruebas quedan fuera del
-- índice a propósito: son sobrecapas legítimas que conviven con la venta.
--
-- Esto convierte el defecto en imposible, no solo en «corregido»: aunque
-- alguien llamara a la función equivocada o insertara a mano, la base se niega.
create unique index if not exists opa_una_permanente_abierta
  on public.organization_plan_assignments (organization_id, scope, coalesce(module_code, ''))
  where ends_at is null and grant_kind in ('sold', 'courtesy');

comment on index public.opa_una_permanente_abierta is
  'PE-04B6 · No puede haber dos concesiones comerciales permanentes abiertas en el mismo alcance: entonces «qué plan tiene esta empresa» dejaría de tener una respuesta. El suelo `base` y las pruebas quedan fuera: son sobrecapas legítimas.';

-- ---------------------------------------------------------------------------
-- 3 · LA TRANSICIÓN, CERRANDO LO QUE SUSTITUYE
-- ---------------------------------------------------------------------------
create or replace function public.commercial_assign_plan(
  p_organization_id uuid,
  p_plan_revision_id uuid,
  p_scope text,
  p_module_code text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_rev    record;
  v_mod    record;
  v_prev   jsonb;
  v_id     uuid;
  v_desde  timestamptz := coalesce(p_starts_at, now());
  v_ya     record;
  v_cerradas int := 0;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not public.is_platform_superadmin() then
    raise exception 'NOT_AUTHORIZED'
      using hint = 'Solo la administración de plataforma cambia asignaciones comerciales.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'ASSIGNMENT_REASON_REQUIRED'
      using hint = 'Una transición comercial hay que poder explicarla después.';
  end if;
  if p_scope not in ('organization', 'module') then
    raise exception 'ASSIGNMENT_SCOPE_INVALID';
  end if;
  if p_ends_at is not null and p_ends_at <= v_desde then
    raise exception 'ASSIGNMENT_PERIOD_INVALID'
      using hint = 'El fin de la asignación tiene que ser posterior a su inicio.';
  end if;

  select r.id, r.plan_code, r.status, r.effective_to into v_rev
    from public.plan_revisions r where r.id = p_plan_revision_id;
  if v_rev.id is null then
    raise exception 'PLAN_REVISION_NOT_FOUND';
  end if;
  if v_rev.status <> 'published' or v_rev.effective_to is not null then
    raise exception 'PLAN_REVISION_NOT_PUBLISHED' using detail = v_rev.status;
  end if;

  if p_scope = 'module' then
    if p_module_code is null then
      raise exception 'ASSIGNMENT_MODULE_REQUIRED';
    end if;
    select m.code, m.is_functional into v_mod from public.modules m where m.code = p_module_code;
    if v_mod.code is null then
      raise exception 'MODULE_NOT_FOUND';
    end if;
    if not coalesce(v_mod.is_functional, false) then
      raise exception 'MODULE_NOT_COMMERCIAL'
        using detail = p_module_code,
              hint = 'Solo los módulos funcionales reciben plan comercial.';
    end if;
  end if;

  -- Serializa las transiciones de ESTA empresa: dos simultáneas no pueden dejar
  -- dos permanentes abiertas compitiendo.
  perform pg_advisory_xact_lock(
    hashtextextended('commercial_assignment:' || p_organization_id::text, 0));

  -- IDEMPOTENCIA. Reintentar la MISMA transición no abre otro periodo: si ya
  -- hay una permanente abierta con esa misma revisión y ese mismo inicio, es
  -- que ya se aplicó.
  select a.id, a.starts_at into v_ya
    from public.organization_plan_assignments a
   where a.organization_id = p_organization_id
     and a.scope = p_scope
     and coalesce(a.module_code, '') = coalesce(case when p_scope = 'module' then p_module_code end, '')
     and a.grant_kind in ('sold', 'courtesy')
     and a.ends_at is null
     and a.plan_revision_id = p_plan_revision_id
     and a.starts_at = v_desde
   limit 1;
  if v_ya.id is not null then
    return jsonb_build_object(
      'assignment_id', v_ya.id,
      'new_plan_code', v_rev.plan_code,
      'closed_assignments', 0,
      'already_applied', true);
  end if;

  -- Qué tenía ANTES, para poder explicar la transición.
  v_prev := public.plan_effective_for_organization(p_organization_id, now());

  -- Una permanente que empieza EN O DESPUÉS del inicio de la nueva no se puede
  -- cerrar sin inventar un periodo negativo. Eso es una transición futura ya
  -- programada, y resolverla a ciegas sería decidir por quien la programó.
  if exists (
    select 1 from public.organization_plan_assignments a
     where a.organization_id = p_organization_id
       and a.scope = p_scope
       and coalesce(a.module_code, '') = coalesce(case when p_scope = 'module' then p_module_code end, '')
       and a.grant_kind in ('sold', 'courtesy')
       and (a.ends_at is null or a.ends_at > v_desde)
       and a.starts_at >= v_desde
  ) then
    raise exception 'ASSIGNMENT_CONFLICTS_WITH_FUTURE'
      using hint = 'Ya hay una transición comercial programada en ese alcance a partir de esa fecha o después. Ciérrala antes.';
  end if;

  -- SE CIERRA LO QUE SE SUSTITUYE, en el instante EFECTIVO de la nueva: sin
  -- solape y sin hueco. Para una transición futura, la anterior sigue vigente
  -- hasta esa fecha, que es justo lo que se quiso programar.
  --
  -- El suelo `base` y las pruebas NO se tocan: el primero es lo que hace que
  -- retirar mañana esta asignación devuelva la empresa a Free en vez de a la
  -- nada, y las segundas caducan solas.
  -- Lo que compite es lo ACTIVO, no solo lo abierto: una concesión con fin en
  -- el futuro sigue mandando hoy, y dejarla fuera del cierre haría que una
  -- transición nueva conviviera con ella.
  update public.organization_plan_assignments a
     set ends_at = v_desde
   where a.organization_id = p_organization_id
     and a.scope = p_scope
     and coalesce(a.module_code, '') = coalesce(case when p_scope = 'module' then p_module_code end, '')
     and a.grant_kind in ('sold', 'courtesy')
     and (a.ends_at is null or a.ends_at > v_desde)
     and a.starts_at < v_desde;
  get diagnostics v_cerradas = row_count;

  insert into public.organization_plan_assignments
    (organization_id, plan_revision_id, scope, module_code, grant_kind, source,
     starts_at, ends_at, assigned_by, reason)
  values (p_organization_id, p_plan_revision_id, p_scope,
          case when p_scope = 'module' then p_module_code end,
          'sold', 'manual',
          v_desde, p_ends_at, auth.uid(), trim(p_reason))
  returning id into v_id;

  insert into public.commercial_assignment_events
    (organization_id, assignment_id, scope, module_code, previous_plan_code,
     new_plan_code, plan_revision_id, effective_from, effective_to, reason, actor)
  values (p_organization_id, v_id, p_scope,
          case when p_scope = 'module' then p_module_code end,
          case when v_prev->>'status' = 'found' then v_prev->>'plan_code' end,
          v_rev.plan_code, p_plan_revision_id,
          v_desde, p_ends_at, trim(p_reason), auth.uid());

  return jsonb_build_object(
    'assignment_id', v_id,
    'previous_plan_code', case when v_prev->>'status' = 'found' then v_prev->>'plan_code' end,
    'new_plan_code', v_rev.plan_code,
    'closed_assignments', v_cerradas,
    'already_applied', false);
end;
$$;

revoke all on function public.commercial_assign_plan(uuid, uuid, text, text, timestamptz, timestamptz, text)
  from public, anon;
grant execute on function public.commercial_assign_plan(uuid, uuid, text, text, timestamptz, timestamptz, text)
  to authenticated;

comment on function public.commercial_assign_plan(uuid, uuid, text, text, timestamptz, timestamptz, text) is
  'PE-04B6 · Transición comercial. CIERRA las concesiones permanentes (`sold`/`courtesy`) del MISMO alcance en el instante efectivo de la nueva —sin solape y sin hueco— y después inserta. No toca el suelo `base` —que es lo que hace que retirar una asignación devuelva la empresa a Free y no a la nada— ni las pruebas, que caducan solas. Todo en una transacción, bajo candado por empresa, e idempotente frente al reintento de la misma transición.';
