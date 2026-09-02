-- ===========================================================================
-- 0167 · PE-04B5 · DERECHOS DE SOPORTE Y ADMINISTRACIÓN COMERCIAL
-- ---------------------------------------------------------------------------
-- Extra incluye DOS casos de orientación funcional al mes por empresa. Free y
-- Full no incluyen orientación funcional, pero las tres pueden reportar que
-- Trazaloop falla —eso no es un privilegio comercial, es cómo se entera el
-- producto de que está roto—.
--
-- LO QUE NO SE CONSTRUYE
--
-- No hay un segundo motor de tickets. `support_tickets` sigue siendo el único,
-- con sus estados, sus mensajes, su historial y su RLS. Lo que se añade es un
-- EJE nuevo sobre el mismo dominio.
--
-- POR QUÉ HACE FALTA UN EJE NUEVO Y NO BASTA `category`
--
-- Las diez categorías existentes mezclan DE QUÉ va el ticket (trazabilidad,
-- evidencias, TrazaDocs, importaciones, cálculo) con QUÉ SE PIDE (soporte
-- técnico, error de plataforma, cuenta, plan). Deducir de ahí si una empresa
-- consume uno de sus dos casos sería deducir un derecho comercial de una
-- etiqueta que el cliente eligió para describir un tema. `support_kind` lo
-- pregunta explícitamente y `category` sigue diciendo de qué va.
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
      using hint = 'Actívales RLS con una política explícita antes de promover. Ver docs/security/SEC_01_RLS_INCIDENT.md';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1 · EL EJE COMERCIAL DEL TICKET
-- ---------------------------------------------------------------------------
alter table public.support_tickets
  -- QUÉ SE PIDE. Lo elige quien abre el ticket, y es lo único que decide si
  -- consume derecho comercial.
  add column if not exists support_kind text not null default 'technical',
  -- El mes DE NEGOCIO cuyo cupo consumió. Nulo = no consumió ninguno.
  add column if not exists entitlement_period date,
  -- Cuándo lo consumió. Un ticket consume COMO MUCHO UNA VEZ EN SU VIDA: sin
  -- esto, reclasificar de un lado a otro podría cobrar dos veces.
  add column if not exists entitlement_consumed_at timestamptz,
  -- Prioridad COMERCIAL, distinta de la severidad técnica. Se fija al enviar,
  -- con el plan de ese momento, y no se recalcula después: bajar de plan no
  -- degrada un caso que ya estaba aceptado.
  add column if not exists commercial_priority text not null default 'standard',
  -- Cuando lo pedido se sale de lo incluido y entra en consultoría.
  add column if not exists scope_outcome text;

alter table public.support_tickets
  drop constraint if exists support_tickets_kind_check,
  drop constraint if exists support_tickets_commercial_priority_check,
  drop constraint if exists support_tickets_scope_outcome_check,
  drop constraint if exists support_tickets_entitlement_pair_check;

alter table public.support_tickets
  add constraint support_tickets_kind_check
    check (support_kind in ('technical', 'functional_guidance', 'internal')),
  add constraint support_tickets_commercial_priority_check
    check (commercial_priority in ('standard', 'prioritized')),
  add constraint support_tickets_scope_outcome_check
    check (scope_outcome is null or scope_outcome in ('out_of_scope_consulting')),
  -- Consumo y periodo van juntos o no van: una fila con periodo y sin
  -- instante, o al revés, no se podría explicar.
  add constraint support_tickets_entitlement_pair_check
    check ((entitlement_period is null) = (entitlement_consumed_at is null));

create index if not exists support_tickets_entitlement_idx
  on public.support_tickets (organization_id, entitlement_period)
  where entitlement_period is not null;

comment on column public.support_tickets.support_kind is
  'PE-04B5 · QUÉ se pide, no de qué va (eso es `category`). Solo `functional_guidance` consume derecho comercial. Los tickets anteriores a 0167 quedan como `technical` porque el derecho no existía cuando se crearon: ninguno pudo consumir un cupo inexistente.';
comment on column public.support_tickets.commercial_priority is
  'PE-04B5 · Prioridad COMERCIAL (Extra). NO es la severidad técnica: un incidente crítico de una empresa Free va delante de una consulta funcional de una Extra. Ver `support_queue_rank`.';

-- ---------------------------------------------------------------------------
-- 2 · RECLASIFICACIÓN · con historia, no reescribiendo la evidencia
-- ---------------------------------------------------------------------------
create table if not exists public.support_ticket_reclassifications (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references public.support_tickets (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  from_kind       text not null,
  to_kind         text not null,
  -- Qué pasó con el cupo al reclasificar: nada, se consumió, o se devolvió
  -- porque resultó ser un defecto nuestro.
  allowance_effect text not null,
  reason          text not null,
  changed_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),

  constraint support_reclass_kind_check
    check (from_kind in ('technical', 'functional_guidance', 'internal')
       and to_kind   in ('technical', 'functional_guidance', 'internal')),
  constraint support_reclass_effect_check
    check (allowance_effect in ('none', 'consumed', 'released', 'not_covered')),
  constraint support_reclass_reason_check check (length(trim(reason)) >= 10)
);

alter table public.support_ticket_reclassifications enable row level security;

-- La empresa puede LEER por qué se reclasificó su propio ticket: es su
-- historia y explica por qué se le contó (o no) un caso.
create policy support_reclass_select on public.support_ticket_reclassifications
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_staff());
-- Sin política de escritura: solo la mueve la función `security definer`.

revoke insert, update, delete, truncate on public.support_ticket_reclassifications
  from authenticated, anon;
revoke all on public.support_ticket_reclassifications from anon;
grant select on public.support_ticket_reclassifications to authenticated;

comment on table public.support_ticket_reclassifications is
  'PE-04B5 · Historia de reclasificaciones de soporte. La categoría y el tipo originales NO se borran: se registra el cambio, quién lo hizo, por qué y qué pasó con el cupo.';

-- ---------------------------------------------------------------------------
-- 3 · EL RESOLUTOR DE DERECHOS DE SOPORTE
-- ---------------------------------------------------------------------------
create or replace function public.organization_support_entitlement(
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
  v_plan   jsonb;
  v_lim    jsonb;
  v_mes    date;
  v_limite integer;
  v_usados integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not (public.is_org_member(p_organization_id) or public.is_platform_staff()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- El mes de negocio es el MISMO que usa el reloj de PE-04B4. No se inventa
  -- uno propio de soporte: dos calendarios por empresa acaban contradiciéndose.
  v_mes  := public.organization_business_month(p_organization_id);
  v_plan := public.plan_effective_for_organization(p_organization_id, p_as_of);

  if v_plan->>'status' <> 'found' then
    -- No poder resolver el plan NO es «no tienes derecho»: es que no se sabe.
    -- Y aun así, reportar una avería sigue disponible: enterarse de que el
    -- producto está roto no puede depender de haber podido leer un plan.
    return jsonb_build_object(
      'state', 'UNAVAILABLE',
      'reason', case v_plan->>'status' when 'absent' then 'plan_absent' else 'plan_unreadable' end,
      'technical_reporting_allowed', true,
      'functional_guidance_allowed', false,
      'period', v_mes);
  end if;

  v_lim := public.plan_limit_for_revision(
    (v_plan->>'plan_revision_id')::uuid, 'functional_support_cases_monthly');

  v_limite := case
    when v_lim->>'status' = 'finite' then (v_lim->>'value')::integer
    when v_lim->>'status' = 'unlimited' then null
    else 0   -- sin configurar: no incluye orientación funcional
  end;

  -- Los casos usados se DERIVAN de los tickets, que son la verdad. No hay un
  -- «casos_restantes = 1» suelto que nadie pueda explicar seis meses después.
  select count(*)::integer into v_usados
    from public.support_tickets t
   where t.organization_id = p_organization_id
     and t.entitlement_period = v_mes;

  return jsonb_build_object(
    'state', 'FOUND',
    'reason', null,
    'effective_plan', v_plan->'plan_code',
    'plan_revision_id', v_plan->'plan_revision_id',
    'grant_kind', v_plan->'grant_kind',
    -- Reportar una avería está en los tres planes. Nunca se limita con el
    -- contador comercial: capar el reporte de fallos es capar la información
    -- que hace falta para arreglarlos.
    'technical_reporting_allowed', true,
    'functional_guidance_allowed',
      (v_lim->>'status' = 'unlimited') or coalesce(v_limite, 0) > 0,
    'functional_cases_limit', v_limite,
    'functional_cases_used', v_usados,
    'functional_cases_remaining',
      case when v_limite is null then null else greatest(v_limite - v_usados, 0) end,
    'period', v_mes,
    'commercial_priority',
      case when coalesce(v_limite, 0) > 0 or v_lim->>'status' = 'unlimited'
           then 'prioritized' else 'standard' end,
    -- OBJETIVO de primera respuesta, no promesa de resolución. El cálculo de
    -- día hábil ya existía en el producto desde 0053 (salta fin de semana; no
    -- hay calendario de festivos, y no se finge que lo haya).
    'response_target', case when coalesce(v_limite, 0) > 0 then '1_business_day' else null end
  );
end;
$$;

revoke all on function public.organization_support_entitlement(uuid, timestamptz) from public, anon;
grant execute on function public.organization_support_entitlement(uuid, timestamptz) to authenticated;

comment on function public.organization_support_entitlement(uuid, timestamptz) is
  'PE-04B5 · Derecho de soporte de la empresa. `technical_reporting_allowed` es SIEMPRE cierto, incluso cuando el plan no se puede resolver: reportar que el producto falla no es un privilegio comercial. Los casos usados se derivan de los tickets.';

-- ---------------------------------------------------------------------------
-- 4 · ENVIAR UN TICKET · una sola puerta, y atómica
-- ---------------------------------------------------------------------------
-- El caso se consume cuando el ticket se ENVÍA con éxito. Ni al abrir el
-- formulario, ni cuando soporte responde, ni al cerrar: solo así el control de
-- concurrencia es determinista y solo así el cliente sabe en qué momento gastó.
create or replace function public.support_submit_ticket(
  p_organization_id text,
  p_subject text,
  p_description text,
  p_category text,
  p_related_module text,
  p_priority text,
  p_support_kind text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org  uuid := p_organization_id::uuid;
  v_ent  jsonb;
  v_mes  date;
  v_id   uuid;
  v_prio text := 'standard';
  v_periodo date := null;
  v_consumido timestamptz := null;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not public.is_org_member(v_org) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_support_kind not in ('technical', 'functional_guidance') then
    raise exception 'SUPPORT_KIND_INVALID' using detail = coalesce(p_support_kind, 'null');
  end if;

  -- El control ADMINISTRATIVO de 0053 se conserva tal cual: una empresa
  -- suspendida sigue pudiendo escribir sobre cuenta y plan.
  if not public.can_create_support_ticket_for_org(v_org, p_category) then
    raise exception 'SUPPORT_NOT_ALLOWED_FOR_ACCOUNT_STATE';
  end if;

  if p_support_kind = 'functional_guidance' then
    -- Serializa los envíos de ESTA empresa: con un caso libre, dos envíos
    -- simultáneos no pueden pasar los dos.
    perform pg_advisory_xact_lock(
      hashtextextended('support_functional:' || v_org::text, 0));

    v_ent := public.organization_support_entitlement(v_org, now());

    if v_ent->>'state' <> 'FOUND' then
      raise exception 'SUPPORT_ENTITLEMENT_UNAVAILABLE'
        using detail = coalesce(v_ent->>'reason', 'unknown');
    end if;
    if coalesce((v_ent->>'functional_guidance_allowed')::boolean, false) is distinct from true then
      raise exception 'FUNCTIONAL_SUPPORT_NOT_INCLUDED'
        using detail = coalesce(v_ent->>'effective_plan', '?');
    end if;
    if coalesce((v_ent->>'functional_cases_remaining')::integer, 0) <= 0 then
      raise exception 'FUNCTIONAL_SUPPORT_LIMIT_REACHED'
        using detail = (v_ent->>'functional_cases_used') || '/' || (v_ent->>'functional_cases_limit');
    end if;

    v_mes := (v_ent->>'period')::date;
    v_periodo := v_mes;
    v_consumido := now();
    v_prio := coalesce(v_ent->>'commercial_priority', 'standard');
  end if;

  insert into public.support_tickets (
    organization_id, created_by, subject, description, category,
    related_module, priority, support_kind,
    entitlement_period, entitlement_consumed_at, commercial_priority
  ) values (
    v_org, auth.uid(), p_subject, p_description, p_category,
    p_related_module, p_priority, p_support_kind,
    v_periodo, v_consumido, v_prio
  )
  returning id into v_id;

  return jsonb_build_object(
    'ticket_id', v_id,
    'support_kind', p_support_kind,
    'consumed_case', v_periodo is not null,
    'period', v_periodo,
    'commercial_priority', v_prio);
end;
$$;

revoke all on function public.support_submit_ticket(text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.support_submit_ticket(text, text, text, text, text, text, text)
  to authenticated;

comment on function public.support_submit_ticket(text, text, text, text, text, text, text) is
  'PE-04B5 · La ÚNICA puerta de envío de tickets. Un caso funcional se consume al ENVIAR con éxito, bajo candado por empresa. Un reporte técnico no consume nada y está disponible en los tres planes, incluso con la cuenta suspendida y aunque el plan no se pueda resolver.';

-- ---------------------------------------------------------------------------
-- 5 · RECLASIFICAR · sin borrar la evidencia y sin cobrar dos veces
-- ---------------------------------------------------------------------------
create or replace function public.support_reclassify_ticket(
  p_ticket_id uuid,
  p_to_kind text,
  p_reason text,
  p_release_allowance boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_t     public.support_tickets%rowtype;
  v_ent   jsonb;
  v_efecto text := 'none';
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  -- Reclasificar es un juicio de soporte, no del cliente: si lo pudiera hacer
  -- quien abre el ticket, bastaría con marcarlo «técnico» para no gastar cupo.
  if not public.is_platform_staff() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_to_kind not in ('technical', 'functional_guidance', 'internal') then
    raise exception 'SUPPORT_KIND_INVALID';
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'SUPPORT_REASON_REQUIRED'
      using hint = 'Reclasificar cambia lo que el cliente pagó: hay que decir por qué.';
  end if;

  select * into v_t from public.support_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'TICKET_NOT_FOUND';
  end if;
  if v_t.support_kind = p_to_kind then
    return jsonb_build_object('changed', false, 'allowance_effect', 'none');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('support_functional:' || v_t.organization_id::text, 0));

  if p_to_kind = 'functional_guidance' and v_t.entitlement_period is null then
    -- Pasar a funcional SÍ comprueba el derecho: si no, bastaría con abrir todo
    -- como «técnico» y que soporte lo reclasificara para saltarse el cupo.
    v_ent := public.organization_support_entitlement(v_t.organization_id, now());
    if v_ent->>'state' = 'FOUND'
       and coalesce((v_ent->>'functional_guidance_allowed')::boolean, false)
       and coalesce((v_ent->>'functional_cases_remaining')::integer, 0) > 0 then
      update public.support_tickets
         set support_kind = p_to_kind,
             entitlement_period = (v_ent->>'period')::date,
             entitlement_consumed_at = now(),
             commercial_priority = coalesce(v_ent->>'commercial_priority', 'standard')
       where id = p_ticket_id;
      v_efecto := 'consumed';
    else
      -- Sin cupo, el ticket NO desaparece: sigue recibido para triaje. Lo que
      -- no hace es convertirse en orientación funcional incluida sin decirlo.
      update public.support_tickets set support_kind = p_to_kind where id = p_ticket_id;
      v_efecto := 'not_covered';
    end if;

  elsif p_to_kind <> 'functional_guidance'
        and v_t.entitlement_period is not null
        and coalesce(p_release_allowance, false) then
    -- Devolución EXPLÍCITA: soporte concluyó que era un defecto nuestro, no una
    -- consulta. Cobrarle el caso al cliente por haber encontrado un fallo sería
    -- exactamente al revés de lo justo. Nunca es automática.
    update public.support_tickets
       set support_kind = p_to_kind,
           entitlement_period = null,
           entitlement_consumed_at = null,
           commercial_priority = 'standard'
     where id = p_ticket_id;
    v_efecto := 'released';

  else
    -- El resto de casos NO tocan el cupo. En particular, un ticket que ya
    -- consumió y vuelve a funcional no consume otra vez: un ticket consume
    -- como mucho UNA vez en su vida.
    update public.support_tickets set support_kind = p_to_kind where id = p_ticket_id;
    v_efecto := 'none';
  end if;

  insert into public.support_ticket_reclassifications
    (ticket_id, organization_id, from_kind, to_kind, allowance_effect, reason, changed_by)
  values (p_ticket_id, v_t.organization_id, v_t.support_kind, p_to_kind, v_efecto,
          trim(p_reason), auth.uid());

  return jsonb_build_object('changed', true, 'allowance_effect', v_efecto);
end;
$$;

revoke all on function public.support_reclassify_ticket(uuid, text, text, boolean) from public, anon;
grant execute on function public.support_reclassify_ticket(uuid, text, text, boolean) to authenticated;

/** Marcar que lo pedido se sale de lo incluido. NO convierte el caso en
 *  consultoría ilimitada ni crea ninguna venta: deja dicho el alcance. */
create or replace function public.support_mark_out_of_scope(p_ticket_id uuid, p_note text)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or not public.is_platform_staff() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_note is null or length(trim(p_note)) < 10 then
    raise exception 'SUPPORT_REASON_REQUIRED';
  end if;
  update public.support_tickets set scope_outcome = 'out_of_scope_consulting'
   where id = p_ticket_id;
  insert into public.support_ticket_messages
    (organization_id, ticket_id, author_id, author_type, body, is_internal_note)
  select t.organization_id, t.id, auth.uid(), 'platform', trim(p_note), false
    from public.support_tickets t where t.id = p_ticket_id;
  return found;
end;
$$;

revoke all on function public.support_mark_out_of_scope(uuid, text) from public, anon;
grant execute on function public.support_mark_out_of_scope(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6 · EL ORDEN DE LA COLA · la severidad manda sobre lo comercial
-- ---------------------------------------------------------------------------
-- «Extra prioritario» NO significa que quien paga se cuele delante de un
-- incidente crítico. Una caída o un problema de integridad reportado por una
-- empresa Free va antes que una duda de uso de una empresa Extra, y esto no es
-- una opinión de quien atiende: es el orden que devuelve la base.
create or replace function public.support_queue_rank(
  p_support_kind text,
  p_priority text,
  p_commercial_priority text
)
returns integer
language sql
immutable
as $$
  select case
    -- 1 · Incidente técnico crítico o grave: siempre primero, de cualquier plan.
    when p_support_kind = 'technical' and p_priority = 'urgent' then 10
    when p_support_kind = 'technical' and p_priority = 'high'   then 20
    -- 2 · Caso funcional con prioridad comercial (Extra).
    when p_support_kind = 'functional_guidance'
         and p_commercial_priority = 'prioritized'              then 30
    -- 3 · El resto, por su severidad declarada.
    when p_priority = 'urgent'                                  then 40
    when p_priority = 'high'                                    then 50
    when p_priority = 'normal'                                  then 60
    else 70
  end;
$$;
grant execute on function public.support_queue_rank(text, text, text) to authenticated;

comment on function public.support_queue_rank(text, text, text) is
  'PE-04B5 · Orden de la cola de soporte. La severidad TÉCNICA va por delante de la prioridad COMERCIAL: un incidente crítico de una empresa Free adelanta a una consulta funcional de una Extra.';

-- ---------------------------------------------------------------------------
-- 7 · LAS VISTAS · el eje comercial visible, y el plan legacy fuera
-- ---------------------------------------------------------------------------
-- Las dos se RECREAN en vez de reemplazarse: añadir columnas en medio cambia
-- el orden, y `create or replace view` no lo permite. Se retiran en orden de
-- dependencia y se vuelven a conceder los privilegios de forma explícita —esta
-- vez al mínimo, que es lo que SEC-01 dejó como norma: la de cliente arrastraba
-- `insert/update/delete` para `anon` y `authenticated` por el reparto por
-- omisión de Supabase. Eran inertes (la vista es `security_invoker` sobre una
-- tabla con RLS), pero un privilegio inerte que nadie declaró es justo lo que
-- este proyecto ya no deja pasar.
drop view if exists public.v_platform_support_ticket_summary;
drop view if exists public.v_support_ticket_summary;

create view public.v_support_ticket_summary
with (security_invoker = true) as
  select t.organization_id,
    t.id as ticket_id,
    t.subject,
    t.category,
    t.related_module,
    t.priority,
    t.status,
    t.created_by,
    creator.full_name as created_by_name,
    t.assigned_to,
    assignee.full_name as assigned_to_name,
    t.created_at,
    t.updated_at,
    t.last_message_at,
    t.first_response_target_at,
    t.first_response_at,
    t.resolved_at,
    t.closed_at,
    case
      when t.first_response_at is not null then 'responded'::text
      when t.first_response_target_at is null then 'no_target'::text
      when now() > t.first_response_target_at then 'overdue'::text
      when now() > (t.first_response_target_at - '04:00:00'::interval) then 'due_soon'::text
      else 'within_target'::text
    end as sla_status,
    coalesce(msg.messages_count, 0::bigint) as messages_count,
    t.description,
    -- PE-04B5 · El eje comercial, visible también para la empresa: así puede
    -- ver CUÁL de sus tickets consumió uno de sus casos incluidos.
    t.support_kind,
    t.commercial_priority,
    t.entitlement_period,
    t.scope_outcome,
    public.support_queue_rank(t.support_kind, t.priority, t.commercial_priority) as queue_rank
   from public.support_tickets t
     left join public.profiles creator on creator.id = t.created_by
     left join public.profiles assignee on assignee.id = t.assigned_to
     left join (select m.ticket_id, count(*) as messages_count
                  from public.support_ticket_messages m
                 group by m.ticket_id) msg on msg.ticket_id = t.id;

-- La de plataforma dejaba de decir la verdad sobre el plan: enseñaba
-- `coalesce(organization_subscriptions.plan_code, 'demo')`, que es la copia
-- administrativa heredada. Quien atiende soporte necesita saber qué tiene
-- contratada la empresa DE VERDAD, y desde 0163 eso lo dice el catálogo
-- canónico. El estado administrativo se conserva, con nombre que no engaña.
create view public.v_platform_support_ticket_summary as
  select s.organization_id,
    s.ticket_id, s.subject, s.category, s.related_module, s.priority, s.status,
    s.created_by, s.created_by_name, s.assigned_to, s.assigned_to_name,
    s.created_at, s.updated_at, s.last_message_at,
    s.first_response_target_at, s.first_response_at, s.resolved_at, s.closed_at,
    s.sla_status, s.messages_count,
    s.support_kind, s.commercial_priority, s.entitlement_period, s.scope_outcome,
    s.queue_rank,
    o.name as organization_name,
    o.tax_id as organization_tax_id,
    public.organization_effective_plan_code(s.organization_id) as plan_code,
    coalesce(sub.status, 'active'::text) as account_status
   from public.v_support_ticket_summary s
     join public.organizations o on o.id = s.organization_id
     left join public.organization_subscriptions sub on sub.organization_id = s.organization_id
  where public.is_platform_staff();

revoke all on public.v_support_ticket_summary from anon, authenticated;
revoke all on public.v_platform_support_ticket_summary from anon, authenticated;
grant select on public.v_support_ticket_summary to authenticated;
grant select on public.v_platform_support_ticket_summary to authenticated;

comment on view public.v_platform_support_ticket_summary is
  'PE-04B5 · Cola de soporte para plataforma. `plan_code` es el plan COMERCIAL vigente del catálogo canónico, no la copia heredada de `organization_subscriptions` —que enseñaba «demo» a clientes Full—. `account_status` es el eje administrativo, con nombre que ya no se confunde con el plan. `queue_rank` ordena por severidad técnica antes que por prioridad comercial.';

-- ---------------------------------------------------------------------------
-- 8 · HISTORIA DE LAS TRANSICIONES COMERCIALES
-- ---------------------------------------------------------------------------
-- `organization_plan_assignments` ya es append-only y guarda quién, por qué y
-- desde cuándo. Lo que no guarda es QUÉ TENÍA LA EMPRESA ANTES, y sin eso una
-- transición no se puede explicar seis meses después sin reconstruirla a mano.
create table if not exists public.commercial_assignment_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  assignment_id    uuid references public.organization_plan_assignments (id) on delete restrict,
  scope            text not null,
  module_code      text references public.modules (code),
  previous_plan_code text,
  new_plan_code    text not null,
  plan_revision_id uuid not null references public.plan_revisions (id),
  effective_from   timestamptz not null,
  effective_to     timestamptz,
  reason           text not null,
  actor            uuid references public.profiles (id),
  created_at       timestamptz not null default now(),

  constraint commercial_assignment_events_scope_check check (scope in ('organization', 'module')),
  constraint commercial_assignment_events_reason_check check (length(trim(reason)) >= 10)
);

create index if not exists commercial_assignment_events_org_idx
  on public.commercial_assignment_events (organization_id, created_at desc);

alter table public.commercial_assignment_events enable row level security;

-- La empresa puede leer su propia historia comercial: es suya.
create policy commercial_assignment_events_select on public.commercial_assignment_events
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_staff());
-- Sin política de escritura: solo la escribe la función de asignación.

revoke insert, update, delete, truncate on public.commercial_assignment_events
  from authenticated, anon;
revoke all on public.commercial_assignment_events from anon;
grant select on public.commercial_assignment_events to authenticated;

comment on table public.commercial_assignment_events is
  'PE-04B5 · Historia de negocio de las transiciones comerciales: qué tenía la empresa antes, qué pasó a tener, con qué revisión, desde cuándo, quién lo hizo y por qué. No sustituye a `audit_log` (que es técnico): lo que aquí se guarda es lo que hay que poder explicarle a un cliente.';

-- ---------------------------------------------------------------------------
-- 9 · ASIGNAR UN PLAN A MANO · con freno
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
  v_rev  record;
  v_mod  record;
  v_prev jsonb;
  v_id   uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  -- Cambiar lo que una empresa tiene contratado NO es una tarea de soporte.
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

  select r.id, r.plan_code, r.status, r.effective_to into v_rev
    from public.plan_revisions r where r.id = p_plan_revision_id;
  if v_rev.id is null then
    raise exception 'PLAN_REVISION_NOT_FOUND';
  end if;
  -- Un borrador no se asigna: asignar condiciones que nadie ha publicado sería
  -- venderle a un cliente algo que no existe todavía.
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
    -- `core` y los módulos internos NO son entitlements comerciales. Si `core`
    -- pudiera recibir un plan, toda empresa resolvería a ese plan y el nivel
    -- comercial dejaría de significar nada (es el hallazgo de PE-04B1).
    if not coalesce(v_mod.is_functional, false) then
      raise exception 'MODULE_NOT_COMMERCIAL'
        using detail = p_module_code,
              hint = 'Solo los módulos funcionales reciben plan comercial.';
    end if;
  end if;

  -- Qué tenía ANTES, para poder explicar la transición.
  v_prev := public.plan_effective_for_organization(p_organization_id, now());

  insert into public.organization_plan_assignments
    (organization_id, plan_revision_id, scope, module_code, grant_kind, source,
     starts_at, ends_at, assigned_by, reason)
  values (p_organization_id, p_plan_revision_id, p_scope,
          case when p_scope = 'module' then p_module_code end,
          'sold', 'manual',
          coalesce(p_starts_at, now()), p_ends_at, auth.uid(), trim(p_reason))
  returning id into v_id;

  insert into public.commercial_assignment_events
    (organization_id, assignment_id, scope, module_code, previous_plan_code,
     new_plan_code, plan_revision_id, effective_from, effective_to, reason, actor)
  values (p_organization_id, v_id, p_scope,
          case when p_scope = 'module' then p_module_code end,
          case when v_prev->>'status' = 'found' then v_prev->>'plan_code' end,
          v_rev.plan_code, p_plan_revision_id,
          coalesce(p_starts_at, now()), p_ends_at, trim(p_reason), auth.uid());

  return jsonb_build_object(
    'assignment_id', v_id,
    'previous_plan_code', case when v_prev->>'status' = 'found' then v_prev->>'plan_code' end,
    'new_plan_code', v_rev.plan_code);
end;
$$;

revoke all on function public.commercial_assign_plan(uuid, uuid, text, text, timestamptz, timestamptz, text)
  from public, anon;
grant execute on function public.commercial_assign_plan(uuid, uuid, text, text, timestamptz, timestamptz, text)
  to authenticated;

comment on function public.commercial_assign_plan(uuid, uuid, text, text, timestamptz, timestamptz, text) is
  'PE-04B5 · Transición comercial manual. Solo administración de plataforma, solo revisiones PUBLICADAS, solo módulos funcionales, con motivo obligatorio, y dejando escrito qué tenía la empresa antes. No toca la suscripción heredada.';
