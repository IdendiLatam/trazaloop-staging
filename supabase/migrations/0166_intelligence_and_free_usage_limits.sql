-- ===========================================================================
-- 0166 · PE-04B4 · CRÉDITOS DE INTELLIGENCE Y RELOJ DE USO DE FREE
-- ---------------------------------------------------------------------------
-- Dos ejes comerciales nuevos, independientes entre sí, y el final del puente
-- free→demo.
--
-- 1 · INTELLIGENCE · Hoy conviven cuatro controles distintos sobre lo mismo y
--     ninguno es el que se vende (inventario en PE_04B4_AI_INVENTORY.md):
--     10 000 ejecuciones/mes de `intelligence_usage_guard`, 500/mes y 50/día
--     POR PERSONA de `quality_ai_settings`, más topes por minuto, por hora y
--     de concurrencia. Ninguno cuenta CRÉDITOS PONDERADOS, que es la unidad
--     que el negocio congeló: 25 / 500 / 2 000 al mes por empresa, más 50 de
--     prueba. Se añade UN medidor comercial y los demás se reclasifican como
--     lo que de verdad son: protección de coste y anti-abuso.
--
-- 2 · TIEMPO DE PLATAFORMA · Free incluye 30 minutos al día y 300 al mes POR
--     EMPRESA. No es «minutos activos»: el reloj corre mientras alguien de la
--     empresa tiene abierta una pantalla funcional, se mueva el ratón o no.
--     Y es la UNIÓN del uso de la empresa, no la suma: tres personas a la vez
--     durante diez minutos consumen diez, no treinta.
--
-- 3 · MODO CONSULTA · Al agotar el reloj, la empresa NO pierde nada: entra,
--     navega, lee, descarga y BORRA. Lo que no puede es crear ni modificar su
--     sistema de gestión, ni ejecutar Intelligence, hasta que el cupo reinicie.
--
-- No se toca 0162, 0163 ni 0164. No se reescribe historia de IA.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0 · PREFLIGHT DE SEGURIDAD · heredado del incidente SEC-01 (0165)
-- ---------------------------------------------------------------------------
-- 0165 cerró siete tablas de `public` que se habían creado sin RLS, y el
-- hallazgo no salió de aquí: lo trajo un correo del Security Advisor del
-- proveedor. La prueba `test:sec01-guard` impide que vuelva a pasar en local,
-- pero una prueba solo corre donde alguien la lanza.
--
-- Esta comprobación viaja con la migración, de modo que se ejecuta en TODO
-- entorno al que se promueva —Staging hoy, Producción cuando PE-06 haga el
-- replay— y ANTES de que ese entorno se abra al uso. Si alguna tabla base de
-- `public` llegara sin RLS, la migración se detiene y dice cuál: es el mismo
-- criterio de preflight que 0105 usa para el inventario histórico.
--
-- No modifica nada. Solo se niega a continuar sobre una base expuesta.
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
-- 1 · EL «AHORA» DE NEGOCIO DE LA EMPRESA
-- ---------------------------------------------------------------------------
-- No se inventa una zona horaria nueva: la empresa YA tiene una, en
-- `quality_automation_settings.business_timezone` (0129), que es la que decide
-- qué día es «hoy» para los avisos de Calidad. Tener dos zonas horarias por
-- empresa sería garantizar que un día se contradigan. Se promueve la que hay a
-- helper comercial y punto.
create or replace function public.organization_business_timezone(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select s.business_timezone from public.quality_automation_settings s
      where s.organization_id = p_organization_id),
    'UTC');
$$;

create or replace function public.organization_business_today(p_organization_id uuid)
returns date
language sql
stable
security definer
set search_path to 'public'
as $$
  select (now() at time zone public.organization_business_timezone(p_organization_id))::date;
$$;

/** Primer día del mes comercial de la empresa. El mes de facturación de IA se
 *  resuelve con ESTA fecha, no con el UTC del servidor: un reinicio que ocurre
 *  a las 19:00 del día anterior para el cliente es un reinicio que el cliente
 *  no entiende. */
create or replace function public.organization_business_month(p_organization_id uuid)
returns date
language sql
stable
security definer
set search_path to 'public'
as $$
  select date_trunc('month', public.organization_business_today(p_organization_id))::date;
$$;

revoke all on function public.organization_business_timezone(uuid) from public, anon;
revoke all on function public.organization_business_today(uuid) from public, anon;
revoke all on function public.organization_business_month(uuid) from public, anon;
grant execute on function public.organization_business_timezone(uuid) to authenticated;
grant execute on function public.organization_business_today(uuid) to authenticated;
grant execute on function public.organization_business_month(uuid) to authenticated;

comment on function public.organization_business_today(uuid) is
  'PE-04B4 · El día de negocio de la empresa, en SU zona horaria (la de 0129, la única que existe). Nunca se deduce del navegador en cada petición.';

-- ---------------------------------------------------------------------------
-- 2 · EL REGISTRO DE PESOS · cuánto cuesta cada operación de Intelligence
-- ---------------------------------------------------------------------------
-- Los pesos son ECONOMÍA INTERNA CONFIGURABLE, no una promesa pública. Se
-- pueden cambiar; lo que no cambia es lo ya cobrado, porque el libro guarda el
-- peso con el que se cobró cada operación.
create table if not exists public.ai_operation_weights (
  operation_code text primary key,
  label          text not null,
  cost_class     text not null,
  weight_credits integer not null,
  rationale      text not null,
  updated_by     uuid references public.profiles (id),
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),

  constraint ai_operation_weights_class_check
    check (cost_class in ('light', 'standard', 'heavy', 'intensive')),
  -- Una operación jamás cuesta cero créditos: sería una puerta gratis.
  constraint ai_operation_weights_weight_check
    check (weight_credits > 0 and weight_credits <= 100)
);

alter table public.ai_operation_weights enable row level security;

-- El catálogo de pesos lo puede LEER cualquier persona autenticada (la UI
-- necesita saber cuánto va a costar una operación antes de lanzarla) y solo lo
-- escribe la plataforma.
create policy ai_operation_weights_select on public.ai_operation_weights
  for select to authenticated using (true);
create policy ai_operation_weights_write on public.ai_operation_weights
  for all to authenticated using (public.is_platform_staff()) with check (public.is_platform_staff());

create trigger t_ai_operation_weights_updated
  before update on public.ai_operation_weights
  for each row execute function public.set_updated_at();

comment on table public.ai_operation_weights is
  'PE-04B4 · Cuántos créditos ponderados cuesta cada operación de Intelligence. UNA llamada al proveedor NO equivale a UN crédito: una operación pesada cuesta más. Los pesos se configuran; lo ya cobrado no cambia (el libro guarda el peso aplicado).';

-- Las clases salen de la medición que ya existía en `intelligence_use_cases`
-- (QUALITY-12.2C/2D/12.1, con llamadas reales), no de una intuición:
--   light    (~700 tokens de entrada, tope 4 000)  → 1
--   standard (~1 100, tope 6 000–8 000)            → 2
--   heavy    (~2 700, tope 12 000)                 → 5
--   intensive                                      → 10 · declarada y HOY SIN
--                                                     NINGUNA operación: no hay
--                                                     nada tan pesado todavía y
--                                                     no se asigna a ciegas.
insert into public.ai_operation_weights (operation_code, label, cost_class, weight_credits, rationale) values
  ('document.quick_edit', 'Mejora de redacción', 'light', 1,
   'QUALITY-12.2C · 4 llamadas reales, entrada media 727 tokens, tope 4 000. La operación más ligera del producto.'),
  ('document.contextual_review', 'Revisión contextual de documento', 'standard', 2,
   'QUALITY-12.2D · 3 llamadas reales, entrada media 1 073 tokens, tope 6 000.'),
  ('customer_themes', 'Temas de la voz del cliente', 'standard', 2,
   'Catálogo QUALITY-12.1 la clasifica «standard», tope 8 000. Sin muestra propia suficiente: se respeta la clase medida en vez de inventar una más cara.'),
  ('ask', 'Pregunta a Intelligence', 'heavy', 5,
   'QUALITY-12.1 · consultas reales, entrada media 2 700 tokens, tope 12 000. Arrastra el paquete de contexto integrado completo.'),
  ('copilot.ask', 'Pregunta a Intelligence', 'heavy', 5,
   'Alias histórico de `ask` en el catálogo de casos de uso; mismo camino y mismo contexto.'),
  ('root_cause', 'Hipótesis de causa raíz', 'heavy', 5,
   'Catálogo QUALITY-12.1 la clasifica «heavy», tope 12 000.'),
  ('explain_signal', 'Explicar una señal', 'heavy', 5,
   'Mismo camino del Copilot y mismos adaptadores de contexto que `ask` (casi todos aplican a «*»). Sin muestra propia: se le da la clase de la familia a la que pertenece, no una inventada.'),
  ('risk_candidates', 'Riesgos candidatos', 'heavy', 5,
   'Mismo camino del Copilot; añade el adaptador integrado de riesgos. Familia `ask`.'),
  ('review_summary', 'Resumen para la dirección', 'heavy', 5,
   'Mismo camino del Copilot; añade el adaptador integrado de revisión. Familia `ask`.'),
  ('audit_prep', 'Preparar una auditoría', 'heavy', 5,
   'Mismo camino del Copilot con DOS adaptadores extra. Es la más pesada de la familia `ask`; si la medición futura lo justifica, sube de clase.')
on conflict (operation_code) do nothing;

-- El catálogo de casos de uso de QUALITY-12 estaba INCOMPLETO: describía seis
-- operaciones y el producto ejecuta diez. Se completan las cuatro que faltaban
-- para que ningún camino de modelo quede sin describir.
insert into public.intelligence_use_cases
  (use_case, label, cost_class, interactive, can_retry, hard_input_cap, measured_in)
values
  ('explain_signal', 'Explicar una señal', 'heavy', true, true, 12000,
   'PE-04B4 · sin muestra propia; misma familia que `ask`'),
  ('risk_candidates', 'Riesgos candidatos', 'heavy', true, true, 12000,
   'PE-04B4 · sin muestra propia; misma familia que `ask`'),
  ('review_summary', 'Resumen para la dirección', 'heavy', true, true, 12000,
   'PE-04B4 · sin muestra propia; misma familia que `ask`'),
  ('audit_prep', 'Preparar una auditoría', 'heavy', true, true, 12000,
   'PE-04B4 · sin muestra propia; misma familia que `ask`')
on conflict (use_case) do nothing;

-- ---------------------------------------------------------------------------
-- 3 · EL LIBRO DE CRÉDITOS · reservas y consumos, no un contador mutable
-- ---------------------------------------------------------------------------
-- Un entero `creditos_restantes` que solo baja no se puede auditar, no se puede
-- explicar y no se puede reconstruir. Aquí cada movimiento deja su fila con el
-- peso que se le aplicó, y los totales del periodo se DERIVAN.
create table if not exists public.ai_credit_ledger (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,

  -- De qué bolsa sale. Son dos y no se mezclan.
  pool            text not null,
  -- Bolsa mensual: el mes DE NEGOCIO de la empresa al que pertenece.
  period_month    date,
  -- Bolsa de prueba: la concesión concreta a la que pertenece. Cuando esa
  -- concesión termina, la bolsa deja de ser alcanzable. No se convierte en
  -- mensual ni reaparece si el módulo se reactiva.
  trial_assignment_id uuid references public.organization_plan_assignments (id) on delete restrict,

  operation_code  text not null references public.ai_operation_weights (operation_code),
  weight_credits  integer not null check (weight_credits > 0),

  state           text not null default 'reserved',
  run_id          uuid references public.quality_ai_runs (id) on delete set null,
  idempotency_key text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  settled_at      timestamptz,

  constraint ai_credit_ledger_pool_check check (pool in ('trial', 'monthly')),
  constraint ai_credit_ledger_state_check check (state in ('reserved', 'consumed', 'released')),
  constraint ai_credit_ledger_settled_check
    check ((state = 'reserved') = (settled_at is null)),
  -- Cada bolsa exige SU identidad de periodo y prohíbe la de la otra: sin esto
  -- una fila podría no pertenecer a ningún periodo y desaparecer de todos los
  -- totales.
  constraint ai_credit_ledger_period_check check (
    (pool = 'monthly' and period_month is not null and trial_assignment_id is null)
    or
    (pool = 'trial' and trial_assignment_id is not null and period_month is null)
  )
);

create index if not exists ai_credit_ledger_month_idx
  on public.ai_credit_ledger (organization_id, pool, period_month) where state <> 'released';
create index if not exists ai_credit_ledger_trial_idx
  on public.ai_credit_ledger (trial_assignment_id) where state <> 'released';
-- Idempotencia: la MISMA petición de aplicación no cobra dos veces. Se ignoran
-- las liberadas: si la primera se soltó por un fallo del proveedor, reintentar
-- debe poder reservar de nuevo.
create unique index if not exists ai_credit_ledger_idempotency_uniq
  on public.ai_credit_ledger (organization_id, idempotency_key)
  where idempotency_key is not null and state <> 'released';

alter table public.ai_credit_ledger enable row level security;

create policy ai_credit_ledger_select on public.ai_credit_ledger
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_staff());
-- Nadie escribe el libro a mano: solo las funciones de reserva/consumo, que son
-- `security definer`. Sin política de escritura, ni el dueño de la empresa
-- puede regalarse créditos.

comment on table public.ai_credit_ledger is
  'PE-04B4 · Libro de créditos ponderados de Intelligence. Reserva → consumo o liberación. Guarda el peso APLICADO, de modo que cambiar el registro de pesos no reescribe lo ya cobrado. Dos bolsas que no se mezclan: la de la prueba (expira con ella) y la mensual (no acumula).';

-- El historial de IA (`quality_ai_runs`) NO se reescribe ni se reinterpreta.
-- La contabilidad comercial de créditos EMPIEZA aquí: las ejecuciones
-- anteriores a 0166 no tienen peso asignado y adivinarlo sería inventar
-- consumo que nadie hizo. Queda dicho en el propio esquema.
comment on column public.ai_credit_ledger.created_at is
  'PE-04B4 · La contabilidad comercial de créditos empieza en el corte de 0166. Las ejecuciones históricas de quality_ai_runs conservan su verdad de tokens y coste, y NO se convierten retroactivamente en créditos.';

-- ---------------------------------------------------------------------------
-- 3b · Estado de créditos · cuota, bolsas y consumo derivado
-- ---------------------------------------------------------------------------
create or replace function public.ai_credits_status(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_plan     jsonb;
  v_lim      jsonb;
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

  v_lim := public.plan_limit_for_revision((v_plan->>'plan_revision_id')::uuid, 'ai_weighted_credits_monthly');
  if v_lim->>'status' = 'not_configured' then
    return jsonb_build_object('state', 'UNAVAILABLE', 'reason', 'limit_not_configured',
      'plan_code', v_plan->'plan_code', 'period_month', v_month);
  end if;

  v_monthly_limit := case when v_lim->>'status' = 'finite' then (v_lim->>'value')::integer else null end;

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
    'period_month', v_month,
    'limit_state', v_lim->>'status',
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
  'PE-04B4 · Estado comercial de Intelligence: AVAILABLE | AT_LIMIT | OVER_LIMIT | UNAVAILABLE. Las dos bolsas se informan por separado a propósito: la de la prueba NO es un adelanto de los 500 de Full ni se suma a la mensual como si fuera un plan mayor.';

-- ---------------------------------------------------------------------------
-- 4 · EL RELOJ DE USO · minutos de empresa, no de persona
-- ---------------------------------------------------------------------------
-- LA DECISIÓN QUE LO EXPLICA TODO: el consumo NO se guarda como una suma de
-- duraciones, se guarda como un CONJUNTO DE MINUTOS ocupados por la empresa.
--
-- Con una suma, tres personas trabajando diez minutos a la vez consumirían
-- treinta, que es exactamente lo que el negocio dijo que NO. Con un conjunto,
-- las tres marcan los mismos diez minutos y el `on conflict do nothing` los
-- deja en diez. La unión sale sola, sin calcular solapes y sin poder
-- equivocarse. Tres pestañas de la misma persona, igual.
--
-- Y resuelve dos cosas más de regalo:
--   · Idempotencia: repetir un latido no cuenta dos veces el mismo minuto.
--   · Concurrencia: dos latidos simultáneos sobre el mismo minuto son una
--     colisión de clave primaria, no una carrera aritmética. No hace falta
--     ningún lock.
create table if not exists public.organization_usage_minutes (
  organization_id uuid not null references public.organizations (id) on delete restrict,
  -- El instante de inicio del minuto, truncado. La clave es (empresa, minuto):
  -- ahí vive la unión.
  minute_start    timestamptz not null,
  -- El día DE NEGOCIO al que pertenece ese minuto, congelado al escribirlo:
  -- si la empresa cambiara de zona horaria, el pasado no se recalcula.
  business_date   date not null,
  business_month  date not null,
  created_at      timestamptz not null default now(),

  primary key (organization_id, minute_start)
);

create index if not exists organization_usage_minutes_day_idx
  on public.organization_usage_minutes (organization_id, business_date);
create index if not exists organization_usage_minutes_month_idx
  on public.organization_usage_minutes (organization_id, business_month);

alter table public.organization_usage_minutes enable row level security;

-- Se lee agregado, nunca por persona: aquí NO hay `user_id`, y no lo hay a
-- propósito. Un panel que dijera cuántos minutos estuvo abierto cada empleado
-- sería una herramienta de vigilancia laboral, y eso no es lo que se está
-- construyendo (bandera de privacidad de PE-04A).
create policy organization_usage_minutes_select on public.organization_usage_minutes
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_staff());

comment on table public.organization_usage_minutes is
  'PE-04B4 · Los minutos que la EMPRESA tuvo abierta una pantalla funcional. Es un conjunto, no una suma: la unión del uso simultáneo sale de la clave primaria. NO guarda quién: el consumo es de la empresa y esto no es un panel de productividad.';

-- Las concesiones vivas. Existen para saber si alguien sigue abierto y para no
-- cobrar entre latidos cuando el navegador ya se fue. Guardan el mínimo:
-- quién sostiene la sesión (integridad de la concesión) y cuándo latió por
-- última vez. Ningún dato de comportamiento.
create table if not exists public.organization_usage_leases (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  user_id          uuid not null references public.profiles (id) on delete restrict,
  -- Una por pestaña. La genera el cliente y solo sirve para que dos pestañas
  -- no se pisen la concesión; no identifica nada más.
  session_key      text not null,
  surface          text not null,
  started_at       timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),

  constraint organization_usage_leases_key_check check (length(session_key) between 8 and 128)
);

create unique index if not exists organization_usage_leases_uniq
  on public.organization_usage_leases (organization_id, user_id, session_key);
create index if not exists organization_usage_leases_live_idx
  on public.organization_usage_leases (organization_id, expires_at);

alter table public.organization_usage_leases enable row level security;
create policy organization_usage_leases_select on public.organization_usage_leases
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_staff());

comment on table public.organization_usage_leases is
  'PE-04B4 · Concesiones de uso vivas: prueban que una pantalla funcional SIGUE ABIERTA. No prueban actividad —no hay ratón, ni teclado, ni foco— y no se guarda nada de comportamiento.';

-- Los tres números que gobiernan el reloj, en un solo sitio.
--   · Cadencia del latido: 30 s.
--   · Vida de la concesión: 90 s (tres latidos).
--   · Salto máximo que un latido puede cobrar de una vez: 90 s.
-- El sobreconteo tras un cierre brusco es MENOR DE UN MINUTO: los minutos se
-- marcan en el latido, así que en cuanto el navegador deja de latir no se cobra
-- ni un minuto más. Lo único que queda cobrado es el minuto que ya estaba
-- marcado cuando latió por última vez.
create or replace function public.usage_lease_settings()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'heartbeat_seconds', 30,
    'lease_seconds', 90,
    'max_catchup_seconds', 90);
$$;
grant execute on function public.usage_lease_settings() to authenticated;

-- ---------------------------------------------------------------------------
-- 4b · Cuota de tiempo y estado comercial de operación
-- ---------------------------------------------------------------------------
create or replace function public.organization_time_status(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_plan   jsonb;
  v_dia    jsonb;
  v_mes    jsonb;
  v_hoy    date;
  v_month  date;
  v_lim_d  integer;
  v_lim_m  integer;
  v_used_d integer;
  v_used_m integer;
  v_state  text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not (public.is_org_member(p_organization_id) or public.is_platform_staff()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  v_hoy   := public.organization_business_today(p_organization_id);
  v_month := public.organization_business_month(p_organization_id);
  v_plan  := public.plan_effective_for_organization(p_organization_id, now());

  if v_plan->>'status' <> 'found' then
    return jsonb_build_object('state', 'ENTITLEMENT_UNAVAILABLE',
      'reason', case v_plan->>'status' when 'absent' then 'plan_absent' else 'plan_unreadable' end,
      'business_date', v_hoy, 'business_month', v_month);
  end if;

  v_dia := public.plan_limit_for_revision((v_plan->>'plan_revision_id')::uuid, 'active_minutes_daily');
  v_mes := public.plan_limit_for_revision((v_plan->>'plan_revision_id')::uuid, 'active_minutes_monthly');

  if v_dia->>'status' = 'not_configured' or v_mes->>'status' = 'not_configured' then
    return jsonb_build_object('state', 'ENTITLEMENT_UNAVAILABLE', 'reason', 'limit_not_configured',
      'plan_code', v_plan->'plan_code', 'business_date', v_hoy, 'business_month', v_month);
  end if;

  -- Plan sin reloj comercial (Full, Extra y la prueba de Full mientras dure):
  -- NO se mide y NO se escribe nada. Gastar filas para demostrar que algo es
  -- ilimitado es gastar por gastar.
  if v_dia->>'status' = 'unlimited' and v_mes->>'status' = 'unlimited' then
    return jsonb_build_object('state', 'NORMAL', 'reason', null,
      'plan_code', v_plan->'plan_code', 'metered', false,
      'daily_limit', null, 'monthly_limit', null,
      'daily_used', null, 'monthly_used', null,
      'daily_remaining', null, 'monthly_remaining', null,
      'business_date', v_hoy, 'business_month', v_month,
      'grant_kind', v_plan->'grant_kind', 'plan_ends_at', v_plan->'ends_at');
  end if;

  v_lim_d := case when v_dia->>'status' = 'finite' then (v_dia->>'value')::integer end;
  v_lim_m := case when v_mes->>'status' = 'finite' then (v_mes->>'value')::integer end;

  select count(*)::integer into v_used_d from public.organization_usage_minutes
   where organization_id = p_organization_id and business_date = v_hoy;
  select count(*)::integer into v_used_m from public.organization_usage_minutes
   where organization_id = p_organization_id and business_month = v_month;

  -- El día se agota antes que el mes casi siempre; se comprueban los dos y se
  -- dice CUÁL fue, porque «vuelve mañana» y «vuelve el mes que viene» no son
  -- la misma noticia.
  v_state := case
    when v_lim_m is not null and v_used_m >= v_lim_m then 'CONSULTATION_MONTHLY_LIMIT'
    when v_lim_d is not null and v_used_d >= v_lim_d then 'CONSULTATION_DAILY_LIMIT'
    else 'NORMAL'
  end;

  return jsonb_build_object(
    'state', v_state, 'reason', null,
    'plan_code', v_plan->'plan_code', 'metered', true,
    'daily_limit', v_lim_d, 'monthly_limit', v_lim_m,
    'daily_used', v_used_d, 'monthly_used', v_used_m,
    'daily_remaining', case when v_lim_d is null then null else greatest(v_lim_d - v_used_d, 0) end,
    'monthly_remaining', case when v_lim_m is null then null else greatest(v_lim_m - v_used_m, 0) end,
    'business_date', v_hoy, 'business_month', v_month,
    'grant_kind', v_plan->'grant_kind', 'plan_ends_at', v_plan->'ends_at');
end;
$$;

revoke all on function public.organization_time_status(uuid) from public, anon;
grant execute on function public.organization_time_status(uuid) to authenticated;

comment on function public.organization_time_status(uuid) is
  'PE-04B4 · Reloj comercial de la empresa: NORMAL | CONSULTATION_DAILY_LIMIT | CONSULTATION_MONTHLY_LIMIT | ENTITLEMENT_UNAVAILABLE. `metered=false` significa que el plan no tiene reloj y que no se escribe ni un minuto.';

-- ---------------------------------------------------------------------------
-- 4c · EL LATIDO
-- ---------------------------------------------------------------------------
-- El cliente NO envía duraciones. Envía «sigo abierto». Los minutos los pone el
-- servidor con SU reloj. Creer la aritmética del navegador sería regalar el
-- medidor a quien lo paga.
create or replace function public.usage_heartbeat(
  p_organization_id uuid,
  p_session_key text,
  p_surface text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_cfg     jsonb := public.usage_lease_settings();
  v_status  jsonb;
  v_lease   public.organization_usage_leases%rowtype;
  v_desde   timestamptz;
  v_hasta   timestamptz := date_trunc('minute', now());
  v_hoy     date;
  v_month   date;
  v_puestos integer := 0;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not public.is_org_member(p_organization_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_session_key is null or length(p_session_key) < 8 then
    raise exception 'SESSION_KEY_INVALID';
  end if;

  v_status := public.organization_time_status(p_organization_id);

  -- Plan sin reloj: se contesta el estado y NO se escribe nada, ni concesión ni
  -- minutos. Un plan ilimitado no necesita que se demuestre su uso.
  if coalesce((v_status->>'metered')::boolean, false) is distinct from true then
    return v_status;
  end if;

  select * into v_lease from public.organization_usage_leases
   where organization_id = p_organization_id and user_id = auth.uid()
     and session_key = p_session_key
   for update;

  if not found then
    insert into public.organization_usage_leases
      (organization_id, user_id, session_key, surface, expires_at)
    values (p_organization_id, auth.uid(), p_session_key, p_surface,
            now() + make_interval(secs => (v_cfg->>'lease_seconds')::int))
    returning * into v_lease;
    -- Primer latido: se marca el minuto en curso y nada más. No se inventa
    -- tiempo anterior a la apertura.
    v_desde := v_hasta;
  else
    -- Solo se cobra hacia atrás hasta el tope de recuperación. Si el navegador
    -- estuvo dormido dos horas y vuelve, esas dos horas NO se cobran: no había
    -- nadie con el producto abierto de forma comprobable.
    v_desde := greatest(
      date_trunc('minute', v_lease.last_heartbeat_at),
      date_trunc('minute', now() - make_interval(secs => (v_cfg->>'max_catchup_seconds')::int)));
  end if;

  v_hoy   := (v_hasta at time zone public.organization_business_timezone(p_organization_id))::date;
  v_month := date_trunc('month', v_hoy)::date;

  -- Aquí ocurre la UNIÓN: cada minuto del intervalo se marca una vez para la
  -- empresa. Que lo marquen tres personas a la vez no lo convierte en tres.
  insert into public.organization_usage_minutes
    (organization_id, minute_start, business_date, business_month)
  select p_organization_id, m,
         (m at time zone public.organization_business_timezone(p_organization_id))::date,
         date_trunc('month', (m at time zone public.organization_business_timezone(p_organization_id))::date)::date
    from generate_series(v_desde, v_hasta, interval '1 minute') as m
  on conflict (organization_id, minute_start) do nothing;

  get diagnostics v_puestos = row_count;

  update public.organization_usage_leases
     set last_heartbeat_at = now(),
         surface = p_surface,
         expires_at = now() + make_interval(secs => (v_cfg->>'lease_seconds')::int)
   where id = v_lease.id;

  -- Se devuelve el estado RECALCULADO: el latido que agota el cupo tiene que
  -- devolver «modo consulta», no el estado de hace un minuto.
  return public.organization_time_status(p_organization_id)
         || jsonb_build_object('minutes_added', v_puestos);
end;
$$;

revoke all on function public.usage_heartbeat(uuid, text, text) from public, anon;
grant execute on function public.usage_heartbeat(uuid, text, text) to authenticated;

comment on function public.usage_heartbeat(uuid, text, text) is
  'PE-04B4 · El latido: prueba que una pantalla funcional SIGUE ABIERTA. No mide actividad —no hay ratón, teclado ni foco— y no acepta duraciones del cliente: los minutos los pone el reloj del servidor. Deja de cobrar en cuanto deja de latir; el sobreconteo tras un cierre brusco es menor de un minuto.';

-- ---------------------------------------------------------------------------
-- 5 · RESERVAR, CONSUMIR Y LIBERAR CRÉDITOS
-- ---------------------------------------------------------------------------
create or replace function public.ai_credits_reserve(
  p_organization_id uuid,
  p_operation_code text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_peso    integer;
  v_st      jsonb;
  v_tiempo  jsonb;
  v_trial   record;
  v_trial_total integer;
  v_trial_used  integer;
  v_month   date;
  v_lim     integer;
  v_usado   integer;
  v_ya      public.ai_credit_ledger%rowtype;
  v_id      uuid;
  v_pool    text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not public.is_org_member(p_organization_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select weight_credits into v_peso from public.ai_operation_weights
   where operation_code = p_operation_code;
  if v_peso is null then
    -- Una operación que no está en el registro NO se cobra a ojo ni se deja
    -- pasar gratis: se rechaza. Es lo que obliga a clasificar antes de enviar.
    raise exception 'AI_OPERATION_UNKNOWN' using detail = p_operation_code;
  end if;

  -- Serializa las reservas de ESTA empresa: dos operaciones simultáneas cerca
  -- del tope no pueden pasar las dos.
  perform pg_advisory_xact_lock(
    hashtextextended('ai_credits:' || p_organization_id::text, 0));

  -- Idempotencia bajo el candado: la misma petición de aplicación devuelve la
  -- MISMA reserva. Un reintento del proveedor no cobra dos veces.
  if p_idempotency_key is not null then
    select * into v_ya from public.ai_credit_ledger
     where organization_id = p_organization_id
       and idempotency_key = p_idempotency_key
       and state <> 'released'
     limit 1;
    if found then
      return jsonb_build_object('allowed', true, 'reservation_id', v_ya.id,
        'pool', v_ya.pool, 'weight_credits', v_ya.weight_credits, 'reused', true);
    end if;
  end if;

  -- EJE DEL TIEMPO. Una ejecución de Intelligence es una OPERACIÓN DE NEGOCIO:
  -- si Free agotó su reloj, no se ejecuta aunque queden créditos. Los créditos
  -- no se pierden: vuelven a poder usarse cuando el cupo de tiempo reinicia.
  v_tiempo := public.organization_time_status(p_organization_id);
  if v_tiempo->>'state' = 'ENTITLEMENT_UNAVAILABLE' then
    raise exception 'ENTITLEMENT_UNAVAILABLE' using detail = coalesce(v_tiempo->>'reason', 'unknown');
  end if;
  if v_tiempo->>'state' in ('CONSULTATION_DAILY_LIMIT', 'CONSULTATION_MONTHLY_LIMIT') then
    raise exception 'CONSULTATION_MODE' using detail = v_tiempo->>'state';
  end if;

  v_st := public.ai_credits_status(p_organization_id);
  if v_st->>'state' = 'UNAVAILABLE' then
    raise exception 'ENTITLEMENT_UNAVAILABLE' using detail = coalesce(v_st->>'reason', 'unknown');
  end if;

  v_month := (v_st->>'period_month')::date;

  -- ORDEN DE CONSUMO: primero la bolsa que CADUCA. Gastar la mensual mientras
  -- expira la de la prueba sería tirar créditos que el cliente ya tenía.
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
    if v_trial_used + v_peso <= v_trial_total then
      insert into public.ai_credit_ledger
        (organization_id, pool, trial_assignment_id, operation_code, weight_credits,
         idempotency_key, created_by)
      values (p_organization_id, 'trial', v_trial.id, p_operation_code, v_peso,
              p_idempotency_key, auth.uid())
      returning id into v_id;
      return jsonb_build_object('allowed', true, 'reservation_id', v_id,
        'pool', 'trial', 'weight_credits', v_peso, 'reused', false);
    end if;
  end if;

  -- Bolsa mensual.
  if v_st->>'limit_state' = 'unlimited' then
    v_lim := null;
  else
    v_lim := (v_st->>'monthly_limit')::integer;
  end if;
  v_usado := (v_st->>'monthly_used')::integer;

  if v_lim is not null and v_usado + v_peso > v_lim then
    raise exception 'AI_CREDIT_LIMIT_REACHED'
      using detail = v_usado || '+' || v_peso || '>' || v_lim,
            hint = 'Tu empresa agotó sus créditos de Intelligence de este mes.';
  end if;

  insert into public.ai_credit_ledger
    (organization_id, pool, period_month, operation_code, weight_credits,
     idempotency_key, created_by)
  values (p_organization_id, 'monthly', v_month, p_operation_code, v_peso,
          p_idempotency_key, auth.uid())
  returning id into v_id;

  v_pool := 'monthly';
  return jsonb_build_object('allowed', true, 'reservation_id', v_id,
    'pool', v_pool, 'weight_credits', v_peso, 'reused', false);
end;
$$;

/** La reserva se convierte en consumo SOLO con un resultado utilizable. */
create or replace function public.ai_credits_commit(p_reservation_id uuid, p_run_id uuid default null)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_row public.ai_credit_ledger%rowtype;
begin
  select * into v_row from public.ai_credit_ledger where id = p_reservation_id for update;
  if not found then return false; end if;
  if not (public.is_org_member(v_row.organization_id) or public.is_platform_staff()) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  -- Confirmar dos veces no cobra dos veces.
  if v_row.state <> 'reserved' then return v_row.state = 'consumed'; end if;

  update public.ai_credit_ledger
     set state = 'consumed', settled_at = now(), run_id = coalesce(p_run_id, run_id)
   where id = p_reservation_id;
  return true;
end;
$$;

/** Un fallo de infraestructura NO se le cobra al cliente. El coste real del
 *  proveedor, si lo hubo, sigue registrándose aparte en `quality_ai_runs`. */
create or replace function public.ai_credits_release(p_reservation_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_row public.ai_credit_ledger%rowtype;
begin
  select * into v_row from public.ai_credit_ledger where id = p_reservation_id for update;
  if not found then return false; end if;
  if not (public.is_org_member(v_row.organization_id) or public.is_platform_staff()) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_row.state <> 'reserved' then return false; end if;

  update public.ai_credit_ledger
     set state = 'released', settled_at = now()
   where id = p_reservation_id;
  return true;
end;
$$;

revoke all on function public.ai_credits_reserve(uuid, text, text) from public, anon;
revoke all on function public.ai_credits_commit(uuid, uuid) from public, anon;
revoke all on function public.ai_credits_release(uuid) from public, anon;
grant execute on function public.ai_credits_reserve(uuid, text, text) to authenticated;
grant execute on function public.ai_credits_commit(uuid, uuid) to authenticated;
grant execute on function public.ai_credits_release(uuid) to authenticated;

comment on function public.ai_credits_reserve(uuid, text, text) is
  'PE-04B4 · La ÚNICA reserva comercial de Intelligence. Bajo candado por empresa: comprueba el reloj de Free (una ejecución es operación de negocio), resuelve el peso de la operación en el registro, consume PRIMERO la bolsa que caduca y solo después la mensual, y es idempotente por clave de petición. Una operación sin peso registrado se rechaza: no se cobra a ojo ni se deja pasar gratis.';

-- ---------------------------------------------------------------------------
-- 6 · LA PUERTA COMERCIAL DE MUTACIÓN
-- ---------------------------------------------------------------------------
-- El modo consulta NO es «bloquear todo». Bloquear el borrado dejaría al
-- cliente ATRAPADO: sin poder crear, sin poder borrar y —si además estuviera
-- por encima de la cuota de almacenamiento de 0164— sin poder recuperar
-- espacio. Agotar un cupo comercial no puede secuestrar los datos de nadie.
--
-- Por eso la puerta pregunta por la INTENCIÓN, no solo por la empresa.
create or replace function public.organization_operation_state(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.organization_time_status(p_organization_id);
$$;

create or replace function public.organization_commercial_can_mutate(
  p_organization_id uuid,
  p_intent text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_st jsonb;
begin
  if p_intent not in ('business_increase_or_modify', 'delete_or_reduce',
                      'essential_account_operation', 'read', 'ai_execution') then
    raise exception 'INTENT_UNKNOWN' using detail = coalesce(p_intent, 'null');
  end if;

  v_st := public.organization_time_status(p_organization_id);

  -- Leer, borrar/reducir y las operaciones esenciales de cuenta NO dependen del
  -- cupo comercial. Nunca. Ni siquiera cuando no se puede resolver el plan.
  if p_intent in ('read', 'delete_or_reduce', 'essential_account_operation') then
    return jsonb_build_object('allowed', true, 'state', v_st->>'state', 'intent', p_intent);
  end if;

  if v_st->>'state' = 'ENTITLEMENT_UNAVAILABLE' then
    -- Fail-closed para negocio nuevo, y se dice que fue un fallo de resolución:
    -- decir «agotaste tu cupo» sería afirmar algo que no se sabe.
    return jsonb_build_object('allowed', false, 'state', 'ENTITLEMENT_UNAVAILABLE',
      'reason', v_st->>'reason', 'intent', p_intent);
  end if;

  if v_st->>'state' in ('CONSULTATION_DAILY_LIMIT', 'CONSULTATION_MONTHLY_LIMIT') then
    return jsonb_build_object('allowed', false, 'state', v_st->>'state', 'intent', p_intent);
  end if;

  return jsonb_build_object('allowed', true, 'state', 'NORMAL', 'intent', p_intent);
end;
$$;

revoke all on function public.organization_operation_state(uuid) from public, anon;
revoke all on function public.organization_commercial_can_mutate(uuid, text) from public, anon;
grant execute on function public.organization_operation_state(uuid) to authenticated;
grant execute on function public.organization_commercial_can_mutate(uuid, text) to authenticated;

comment on function public.organization_commercial_can_mutate(uuid, text) is
  'PE-04B4 · Permiso COMERCIAL por intención. En modo consulta se niega crear/modificar y ejecutar Intelligence; leer, BORRAR/reducir y las operaciones esenciales de cuenta siguen permitidas siempre. Es un eje distinto del de autorización (roles/RLS), que se aplica igual y aparte.';

-- ---------------------------------------------------------------------------
-- 7 · LÍMITES DE CONTEO Y FUNCIONES · fin del puente free→demo
-- ---------------------------------------------------------------------------
-- Los trece límites funcionales se copiaron a `plan_revision_limits` en
-- 0162/0163 byte a byte desde `plan_limits`. Desde aquí se leen del catálogo
-- canónico y ya no hace falta traducir `free` a `demo` para preguntar.
create or replace function public.organization_plan_limit(
  p_organization_id uuid,
  p_resource_code text
)
returns jsonb
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
    -- Sin plan resuelto no se contesta con el límite del plan más bajo.
    return jsonb_build_object('status', 'unavailable',
      'reason', case v_plan->>'status' when 'absent' then 'plan_absent' else 'plan_unreadable' end);
  end if;

  return public.plan_limit_for_revision((v_plan->>'plan_revision_id')::uuid, p_resource_code)
         || jsonb_build_object('plan_code', v_plan->'plan_code');
end;
$$;

revoke all on function public.organization_plan_limit(uuid, text) from public, anon;
grant execute on function public.organization_plan_limit(uuid, text) to authenticated;

comment on function public.organization_plan_limit(uuid, text) is
  'PE-04B4 · Un límite cualquiera del plan vigente de la empresa, leído del catálogo canónico. Sustituye a la traducción free→demo contra `plan_limits`/`plan_definitions`, que obligaba a preguntar por un plan que ya no existe comercialmente.';

-- Las tablas legacy (`plan_limits`, `plan_definitions`) NO se borran: son
-- historia y respaldo. Lo que se retira es su AUTORIDAD.
comment on table public.plan_limits is
  'LEGACY · Sin autoridad comercial desde PE-04B4 (0166). La fuente de los límites es `plan_revision_limits`. Se conserva por historia y por si hiciera falta reconstruir una decisión pasada; ningún consumidor actual debe leerla para decidir.';
comment on table public.plan_definitions is
  'LEGACY · Sin autoridad comercial desde PE-04B3/PE-04B4. La cuota de almacenamiento sale de `plan_revision_limits.storage_bytes` (0164) y el resto de límites de `plan_revision_limits` (0166).';

-- Los controles de Intelligence que sobreviven cambian de NOMBRE público, no de
-- función: dejan de ser «el plan» y pasan a ser lo que siempre fueron.
comment on table public.intelligence_usage_limits is
  'INTERNO · Protección de coste y anti-abuso del proveedor de IA (por minuto, por hora, concurrencia y techo técnico mensual). NO es la cuota comercial del cliente: esa son los créditos ponderados de `plan_revision_limits.ai_weighted_credits_monthly` (PE-04B4). Sus mensajes nunca deben decir «agotaste tus créditos».';
comment on table public.intelligence_limit_overrides is
  'INTERNO · Excepciones operativas a la protección de coste de IA. No concede ni retira cuota comercial.';
comment on column public.quality_ai_settings.monthly_run_limit is
  'LEGACY · Tope de EJECUCIONES del Copilot anterior a PE-04B4. La cuota comercial son créditos ponderados por empresa; este contador sobrevive como salvaguarda interna y no debe presentarse como el plan.';
comment on column public.quality_ai_settings.daily_user_limit is
  'LEGACY · Tope diario POR PERSONA anterior a PE-04B4. La cuota comercial NO se multiplica por usuario: es de la empresa. Sobrevive como anti-abuso.';

/** Todos los límites del plan vigente, para las pantallas que los enseñan. La
 *  consola de plataforma tiene que mostrar LOS MISMOS que el servidor aplica:
 *  mientras los leyera del catálogo legacy podía enseñar unos y exigir otros. */
create or replace function public.organization_plan_limits(p_organization_id uuid)
returns table (resource_code text, limit_state text, limit_value integer, plan_code text)
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
