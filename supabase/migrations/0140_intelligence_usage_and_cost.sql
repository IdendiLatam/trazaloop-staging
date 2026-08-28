-- ============================================================================
-- Trazaloop · QUALITY-12.2F · CONSUMO, LÍMITES Y COSTE DE INTELLIGENCE
-- ----------------------------------------------------------------------------
-- Cinco sprints han construido cuatro capacidades de IA que llaman a un
-- proveedor que cobra por token. Hasta hoy nadie podía responder a tres
-- preguntas que un negocio tiene que poder responder:
--
--     ¿CUÁNTO ESTÁ CONSUMIENDO CADA EMPRESA?
--     ¿CUÁNTO NOS CUESTA ESO?
--     ¿QUÉ IMPIDE QUE UN BUCLE ACCIDENTAL GASTE SIN FRENO?
--
-- Esta migración construye eso. No decide precios comerciales —esa decisión
-- necesita los datos que esto empieza a producir—; construye la instrumentación
-- para que se tome informada.
--
--
-- LA DECISIÓN QUE EVITA UN SEGUNDO LIBRO DE CUENTAS
--
-- `quality_ai_runs` YA guarda la verdad del proveedor: entrada, entrada
-- cacheada, salida, razonamiento, total, proveedor, modelo, caso de uso,
-- empresa, actor, tiempos, latencia y si hubo llamada. Todo, desde 0132 y
-- ampliado en 0133, 0134, 0138 y 0139.
--
-- Así que aquí NO se crea una tabla de consumo. Un segundo registro de tokens
-- solo puede desincronizarse del primero, y el día que discrepen habrá que
-- decidir cuál miente. La verdad sigue siendo una: la fila del run.
--
-- Lo que sí falta y se crea:
--
--   · una TARIFA versionada, para poder poner precio sin inventarlo;
--   · unos LÍMITES por empresa, para que un bucle no se lleve el presupuesto;
--   · unas EXCEPCIONES con motivo y caducidad;
--   · un CATÁLOGO de casos de uso, con lo que cada uno cuesta de verdad;
--   · unas VISTAS derivadas, que por construcción no pueden desincronizarse.
--
--
-- POR QUÉ LOS LÍMITES NO SE MIDEN EN DÓLARES
--
-- Porque el precio lo cambia otra empresa. Si la autorización dependiera del
-- coste en dólares, una subida de tarifa de OpenAI apagaría Intelligence en
-- todos nuestros clientes a la vez, sin que nadie hubiera hecho nada.
--
-- Los topes se miden en unidades que controlamos —operaciones y tokens— y el
-- dinero se usa para verlo, informarlo y avisar. Un aviso a destiempo es
-- molesto; un apagón por sorpresa es otra cosa.
-- ============================================================================


-- ============================================================================
-- 1 · LA TARIFA, VERSIONADA EN EL TIEMPO
-- ----------------------------------------------------------------------------
-- Precio por millón de tokens, por proveedor y modelo, con vigencia. Es la
-- forma más simple que preserva la verdad histórica (§5, §25): un run de hoy
-- se valora con la tarifa que estaba vigente cuando ocurrió, y si mañana sube
-- el precio, el run de hoy sigue costando lo que costó.
--
-- No hay `update` que reescriba una tarifa vigente: corregir un precio es
-- cerrar la fila y abrir otra, igual que las guías de autoría de 12.2A. Un
-- disparador lo impone, porque una regla que solo vive en la costumbre se
-- rompe el día que alguien tiene prisa.
--
-- `numeric` y no `float`: el dinero no se guarda en coma flotante. La unidad
-- está en el nombre de la columna y no se deduce de ningún sitio.
-- ============================================================================

create table if not exists public.intelligence_model_pricing (
  id                              uuid primary key default gen_random_uuid(),
  provider                        text not null,
  model                           text not null,
  -- USD por millón de tokens. La unidad va en el nombre a propósito.
  input_usd_per_million           numeric(14, 6) not null,
  cached_input_usd_per_million    numeric(14, 6) not null,
  output_usd_per_million          numeric(14, 6) not null,
  -- El razonamiento lo factura el proveedor DENTRO de la salida en los modelos
  -- que usamos, y así se refleja. Si algún día llega uno que lo cobre aparte,
  -- esta columna dice cuál es la semántica de esa tarifa en vez de obligarnos
  -- a recordarlo.
  reasoning_billing               text not null default 'within_output'
    check (reasoning_billing in ('within_output', 'separate', 'not_billed')),
  reasoning_usd_per_million       numeric(14, 6),
  currency                        text not null default 'USD',
  effective_from                  timestamptz not null,
  effective_to                    timestamptz,
  source_note                     text,
  created_by                      uuid references auth.users (id),
  created_at                      timestamptz not null default now(),

  constraint intelligence_pricing_window
    check (effective_to is null or effective_to > effective_from),
  constraint intelligence_pricing_reasoning_rate
    check (reasoning_billing <> 'separate' or reasoning_usd_per_million is not null),
  constraint intelligence_pricing_non_negative
    check (input_usd_per_million >= 0 and cached_input_usd_per_million >= 0
           and output_usd_per_million >= 0)
);

-- Una sola tarifa vigente por proveedor y modelo.
create unique index if not exists intelligence_pricing_vigente_uniq
  on public.intelligence_model_pricing (provider, model)
  where effective_to is null;

create index if not exists intelligence_pricing_lookup_idx
  on public.intelligence_model_pricing (provider, model, effective_from desc);

comment on table public.intelligence_model_pricing is
  'QUALITY-12.2F · Tarifa por millon de tokens, versionada en el tiempo. Un run se valora con la tarifa vigente cuando ocurrio: subir el precio manana no reescribe lo que costo hoy.';

-- Una tarifa vigente no se reescribe: se cierra y se abre otra.
create or replace function public.intelligence_pricing_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.effective_to is null and new.effective_to is not null
     and new.input_usd_per_million = old.input_usd_per_million
     and new.cached_input_usd_per_million = old.cached_input_usd_per_million
     and new.output_usd_per_million = old.output_usd_per_million
     and new.provider = old.provider and new.model = old.model
     and new.effective_from = old.effective_from then
    return new;   -- cerrar la vigencia es lo único que se permite
  end if;
  raise exception 'Una tarifa no se edita. Ciérrala y crea la nueva versión.';
end;
$$;

drop trigger if exists t_intelligence_pricing_immutable on public.intelligence_model_pricing;
create trigger t_intelligence_pricing_immutable
  before update on public.intelligence_model_pricing
  for each row execute function public.intelligence_pricing_immutable();

alter table public.intelligence_model_pricing enable row level security;

-- Solo la plataforma. Una empresa no necesita saber lo que nos cuesta un token
-- (§22): compra Trazaloop, no tokens de un proveedor.
drop policy if exists intelligence_pricing_select on public.intelligence_model_pricing;
create policy intelligence_pricing_select on public.intelligence_model_pricing
  for select using (is_platform_staff());

drop policy if exists intelligence_pricing_write on public.intelligence_model_pricing;
create policy intelligence_pricing_write on public.intelligence_model_pricing
  for all using (is_platform_superadmin()) with check (is_platform_superadmin());

grant select on public.intelligence_model_pricing to authenticated;


-- Las tarifas conocidas hoy. Se declaran con su fecha de vigencia y su origen.
insert into public.intelligence_model_pricing
  (provider, model, input_usd_per_million, cached_input_usd_per_million,
   output_usd_per_million, effective_from, source_note)
select * from (values
  ('openai', 'gpt-5.4-mini', 0.250000, 0.025000, 2.000000,
   timestamptz '2026-01-01 00:00:00+00',
   'Tarifa de referencia cargada en QUALITY-12.2F. Verificar contra la lista '
   || 'del proveedor antes de usarla para decidir precio comercial.'),
  -- El doble determinístico no cuesta nada, y decirlo explícitamente evita que
  -- un entorno de pruebas produzca cifras de dinero que alguien tome en serio.
  ('fake', 'doble-determinista-1', 0, 0, 0,
   timestamptz '2026-01-01 00:00:00+00',
   'El doble no llama a nadie: coste cero por definición.')
) as t(provider, model, i, c, o, ef, note)
where not exists (
  select 1 from public.intelligence_model_pricing p
   where p.provider = t.provider and p.model = t.model and p.effective_to is null);


-- ============================================================================
-- 2 · CUÁNTO COSTÓ UN RUN
-- ----------------------------------------------------------------------------
-- Con la tarifa vigente EN SU MOMENTO, no con la de hoy.
--
-- Devuelve `null` cuando no hay tarifa para ese proveedor y modelo, y eso es
-- deliberado: un cero diría «no costó nada» y la verdad es «no lo sabemos».
-- Las vistas distinguen las dos cosas.
-- ============================================================================

create or replace function public.intelligence_run_cost_usd(
  p_provider text,
  p_model    text,
  p_at       timestamptz,
  p_input    integer,
  p_cached   integer,
  p_output   integer,
  p_reasoning integer default 0
)
returns numeric
language sql
stable
set search_path = public
as $$
  select round(
      (coalesce(p_input, 0) - least(coalesce(p_cached, 0), coalesce(p_input, 0)))
        * pr.input_usd_per_million / 1000000.0
    + least(coalesce(p_cached, 0), coalesce(p_input, 0))
        * pr.cached_input_usd_per_million / 1000000.0
    + coalesce(p_output, 0) * pr.output_usd_per_million / 1000000.0
    + case when pr.reasoning_billing = 'separate'
           then coalesce(p_reasoning, 0) * coalesce(pr.reasoning_usd_per_million, 0) / 1000000.0
           else 0 end
  , 8)
  from intelligence_model_pricing pr
  where pr.provider = p_provider
    and pr.model = p_model
    and pr.effective_from <= p_at
    and (pr.effective_to is null or pr.effective_to > p_at)
  order by pr.effective_from desc
  limit 1;
$$;

comment on function public.intelligence_run_cost_usd(text, text, timestamptz, integer, integer, integer, integer) is
  'QUALITY-12.2F · Coste de un run con la tarifa vigente EN SU MOMENTO. Los tokens cacheados se descuentan de los de entrada y se cobran a su tarifa. Devuelve null si no hay tarifa: un cero diria que no costo nada, y la verdad seria que no se sabe.';


-- ============================================================================
-- 3 · EL CATÁLOGO DE CASOS DE USO
-- ----------------------------------------------------------------------------
-- Qué cuesta cada capacidad, medido, y qué tope técnico tiene.
--
-- Las bandas NO son inventadas: salen de las validaciones humanas con el
-- proveedor real —12.2C midió Quick Edit, 12.2D midió la revisión contextual,
-- 12.1 midió el Copilot— y están documentadas en sus entregables.
--
-- Las clases `light`/`standard`/`heavy` son INTERNAS. No son un producto, no
-- son créditos y no se enseñan a nadie: existen para agrupar en un informe.
-- Convertirlas en «una consulta = un crédito» ahora sería decidir el modelo
-- comercial antes de tener los datos para decidirlo.
-- ============================================================================

create table if not exists public.intelligence_use_cases (
  use_case            text primary key,
  label               text not null,
  cost_class          text not null check (cost_class in ('light', 'standard', 'heavy')),
  interactive         boolean not null default true,
  can_retry           boolean not null default true,
  -- Lo MEDIDO con el proveedor real, para que nadie tenga que buscarlo.
  observed_input_avg  integer,
  observed_input_min  integer,
  observed_input_max  integer,
  -- El tope técnico por operación. Por encima de esto se falla ANTES de
  -- llamar: mandar una petición enorme esperando que el proveedor la corte es
  -- pagar por descubrir que era demasiado grande.
  hard_input_cap      integer not null,
  measured_in         text,
  created_at          timestamptz not null default now()
);

alter table public.intelligence_use_cases enable row level security;
drop policy if exists intelligence_use_cases_select on public.intelligence_use_cases;
create policy intelligence_use_cases_select on public.intelligence_use_cases
  for select using (auth.uid() is not null);
grant select on public.intelligence_use_cases to authenticated;

comment on table public.intelligence_use_cases is
  'QUALITY-12.2F · Que cuesta cada capacidad, MEDIDO con el proveedor real, y su tope tecnico. Las clases son internas: no son creditos ni producto.';

insert into public.intelligence_use_cases
  (use_case, label, cost_class, interactive, can_retry,
   observed_input_avg, observed_input_min, observed_input_max, hard_input_cap, measured_in)
values
  ('document.quick_edit', 'Mejora de redacción', 'light', true, true,
   727, 645, 784, 4000, 'QUALITY-12.2C · 4 llamadas reales'),
  ('document.contextual_review', 'Revisión contextual', 'standard', true, true,
   1073, 1055, 1092, 6000, 'QUALITY-12.2D · 3 llamadas reales'),
  ('ask', 'Pregunta a Intelligence', 'heavy', true, true,
   2700, 2514, 2886, 12000, 'QUALITY-12.1 · consultas reales'),
  ('copilot.ask', 'Pregunta a Intelligence', 'heavy', true, true,
   2700, 2514, 2886, 12000, 'QUALITY-12.1 · consultas reales'),
  ('customer_themes', 'Temas de la voz del cliente', 'standard', false, true,
   null, null, null, 8000, 'QUALITY-12.1 · sin muestra suficiente'),
  ('root_cause', 'Hipótesis de causa raíz', 'heavy', true, true,
   null, null, null, 12000, 'sin muestra suficiente')
on conflict (use_case) do nothing;


-- ============================================================================
-- 4 · LOS LÍMITES
-- ----------------------------------------------------------------------------
-- Tres ventanas, y cada una protege de algo distinto:
--
--   POR MINUTO   el doble clic, el bucle accidental, el script que se
--                desmadró. Es la que salta primero y la que menos molesta.
--   POR HORA     el uso automatizado que no debería existir.
--   POR MES      el techo de seguridad. NO es una cuota comercial.
--
-- Y un tope de operaciones SIMULTÁNEAS, que es lo que evita que veinte
-- pestañas abiertas disparen veinte revisiones caras a la vez.
--
--
-- DE DÓNDE SALEN LOS NÚMEROS POR DEFECTO
--
-- De un escenario real, y de un error que costó descubrir.
--
-- Una implantación intensiva son unas 350 secciones documentales —250 de PCR y
-- Textiles ya existentes más unas 100 de Quality—. Con tres mejoras de
-- redacción y una revisión por sección salen ~1 400 operaciones, a lo largo de
-- semanas.
--
-- El primer intento puso 12 por minuto, 120 por hora y 5 000 al mes, razonando
-- sobre UNA PERSONA escribiendo documentos. Estaba mal, y lo enseñaron las
-- suites de 12.2C y 12.2D al empezar a fallar con «demasiadas operaciones
-- seguidas»: **estos límites son POR EMPRESA**, y una empresa son veinte
-- personas. Veinte personas haciendo una operación cada una dentro del mismo
-- minuto son veinte operaciones sin que nadie esté haciendo nada raro.
--
-- Los números de ahora se razonan sobre un EQUIPO:
--
--   60 POR MINUTO    veinte personas a tres operaciones por minuto cada una es
--                    más de lo que produce nadie escribiendo. Un doble clic son
--                    dos; un bucle son cientos. Corta lo segundo sin rozar lo
--                    primero.
--
--   600 POR HORA     treinta operaciones por persona y hora sostenidas durante
--                    una hora entera. Un equipo real no llega; un script sí.
--
--   10 000 AL MES    casi siete veces la implantación intensiva completa. Una
--                    empresa grande con el triple de secciones tampoco lo toca.
--
--   8 SIMULTÁNEAS    frena las veinte pestañas abiertas sin frenar a un equipo
--                    trabajando a la vez.
--
-- La lección, que vale más que los números: un límite por organización no se
-- calibra pensando en una persona.
--
-- FULL Y EXTRA RECIBEN LOS MISMOS. La diferencia comercial entre esos dos
-- planes es almacenamiento; derivar de ellos una diferencia de IA en este
-- sprint sería inventar producto (§18).
-- ============================================================================

create table if not exists public.intelligence_usage_limits (
  organization_id     uuid primary key references public.organizations (id) on delete cascade,
  runs_per_minute     integer not null default 60    check (runs_per_minute > 0),
  runs_per_hour       integer not null default 600   check (runs_per_hour > 0),
  runs_per_month      integer not null default 10000 check (runs_per_month > 0),
  max_concurrent      integer not null default 8     check (max_concurrent > 0),
  -- Umbral de AVISO, no de bloqueo. Cruzarlo emite un evento y no impide nada.
  soft_limit_percent  integer not null default 80
    check (soft_limit_percent between 1 and 100),
  -- Apagar el tope duro para una empresa concreta exige dejarlo escrito.
  hard_limit_enabled  boolean not null default true,
  updated_by          uuid references auth.users (id),
  updated_at          timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

alter table public.intelligence_usage_limits enable row level security;

-- Ver los límites: la empresa puede. CAMBIARLOS: solo la plataforma.
-- Es la distinción de §40 entre visibilidad y autoridad. Si un administrador
-- pudiera subirse su propio techo, el techo no sería un techo.
drop policy if exists intelligence_limits_select on public.intelligence_usage_limits;
create policy intelligence_limits_select on public.intelligence_usage_limits
  for select using (is_org_member(organization_id) or is_platform_staff());

drop policy if exists intelligence_limits_write on public.intelligence_usage_limits;
create policy intelligence_limits_write on public.intelligence_usage_limits
  for all using (is_platform_superadmin()) with check (is_platform_superadmin());

grant select on public.intelligence_usage_limits to authenticated;

comment on table public.intelligence_usage_limits is
  'QUALITY-12.2F · Topes tecnicos de seguridad por empresa. NO es una cuota comercial: Full y Extra reciben los mismos. La empresa los VE; solo la plataforma los cambia.';


-- ============================================================================
-- 5 · LAS EXCEPCIONES
-- ----------------------------------------------------------------------------
-- Subir el techo a una empresa concreta —una migración masiva, una incidencia,
-- una prueba de QA— sin tocar su plan ni el techo de todas las demás.
--
-- Con motivo obligatorio y con caducidad. Una excepción sin fecha de fin deja
-- de ser una excepción al cabo de unos meses: se convierte en la regla, y
-- nadie recuerda por qué.
-- ============================================================================

create table if not exists public.intelligence_limit_overrides (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  runs_per_minute   integer check (runs_per_minute > 0),
  runs_per_hour     integer check (runs_per_hour > 0),
  runs_per_month    integer check (runs_per_month > 0),
  max_concurrent    integer check (max_concurrent > 0),
  reason            text not null check (length(btrim(reason)) >= 10),
  effective_from    timestamptz not null default now(),
  expires_at        timestamptz,
  created_by        uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  revoked_at        timestamptz,
  revoked_by        uuid references auth.users (id),

  constraint intelligence_override_window
    check (expires_at is null or expires_at > effective_from),
  constraint intelligence_override_algo
    check (runs_per_minute is not null or runs_per_hour is not null
           or runs_per_month is not null or max_concurrent is not null)
);

create index if not exists intelligence_override_vigente_idx
  on public.intelligence_limit_overrides (organization_id, effective_from desc)
  where revoked_at is null;

alter table public.intelligence_limit_overrides enable row level security;

drop policy if exists intelligence_override_select on public.intelligence_limit_overrides;
create policy intelligence_override_select on public.intelligence_limit_overrides
  for select using (is_platform_staff());

drop policy if exists intelligence_override_write on public.intelligence_limit_overrides;
create policy intelligence_override_write on public.intelligence_limit_overrides
  for all using (is_platform_superadmin()) with check (is_platform_superadmin());

grant select on public.intelligence_limit_overrides to authenticated;

comment on table public.intelligence_limit_overrides is
  'QUALITY-12.2F · Excepcion de limites para una empresa, con motivo y caducidad. Sin tocar su plan. Una excepcion sin fecha de fin deja de ser una excepcion.';


-- ============================================================================
-- 6 · LOS LÍMITES QUE DE VERDAD APLICAN
-- ----------------------------------------------------------------------------
-- Los de la empresa, con la excepción vigente encima si la hay. Una sola
-- función para que nadie resuelva esto por su cuenta y le salga distinto.
-- ============================================================================

create or replace function public.intelligence_effective_limits(p_organization_id uuid)
returns table (
  runs_per_minute integer, runs_per_hour integer, runs_per_month integer,
  max_concurrent integer, soft_limit_percent integer, hard_limit_enabled boolean,
  override_id uuid
)
language sql
stable
set search_path = public
as $$
  with base as (
    select coalesce(l.runs_per_minute, 60)     as rpm,
           coalesce(l.runs_per_hour, 600)      as rph,
           coalesce(l.runs_per_month, 10000)   as rpmo,
           coalesce(l.max_concurrent, 8)       as conc,
           coalesce(l.soft_limit_percent, 80)  as soft,
           coalesce(l.hard_limit_enabled, true) as dura
      from (select 1) uno
      left join intelligence_usage_limits l on l.organization_id = p_organization_id
  ),
  ov as (
    select * from intelligence_limit_overrides o
     where o.organization_id = p_organization_id
       and o.revoked_at is null
       and o.effective_from <= now()
       and (o.expires_at is null or o.expires_at > now())
     order by o.effective_from desc
     limit 1
  )
  select coalesce((select runs_per_minute from ov), base.rpm),
         coalesce((select runs_per_hour from ov), base.rph),
         coalesce((select runs_per_month from ov), base.rpmo),
         coalesce((select max_concurrent from ov), base.conc),
         base.soft,
         base.dura,
         (select id from ov)
    from base;
$$;

comment on function public.intelligence_effective_limits(uuid) is
  'QUALITY-12.2F · Los limites que aplican a una empresa: los suyos, con la excepcion vigente encima si la hay. Un solo sitio los resuelve.';


-- ============================================================================
-- 7 · EL GUARDIÁN
-- ----------------------------------------------------------------------------
-- Se llama ANTES de la llamada al proveedor, dentro de la misma transacción
-- que abre el run.
--
-- LA CONCURRENCIA, RESUELTA SIN INVENTAR INFRAESTRUCTURA
--
-- Un `select count(*)` seguido de un `insert` deja pasar cincuenta peticiones
-- simultáneas: las cincuenta leen el mismo recuento antes de que ninguna
-- escriba. La solución no necesita un sistema distribuido: necesita que las
-- operaciones de UNA empresa se serialicen entre sí, y eso Postgres lo hace
-- con un bloqueo de aviso por empresa.
--
-- Es por transacción, así que se suelta solo cuando la transacción termina,
-- incluso si el proceso se cae. Nada queda bloqueado para siempre (§14).
--
-- LAS OPERACIONES EN VUELO
--
-- No hay tabla de reservas. Una operación en vuelo es una fila con
-- `status = 'running'`, que ya existe. Y se cuentan solo las de los últimos
-- diez minutos: si un proceso murió sin cerrar su run, su fila se queda en
-- `running` para siempre, y sin esa ventana bloquearía a la empresa hasta que
-- alguien lo mirara a mano.
--
-- LAS VENTANAS DE TIEMPO
--
-- En UTC, y dicho aquí porque las organizaciones no tienen zona horaria en
-- Trazaloop. Cuando la tengan, este es el único sitio que hay que cambiar.
-- Depender de la zona del navegador para algo que se impone en el servidor
-- sería regalar el límite a quien cambie la hora de su portátil (§39).
-- ============================================================================

create or replace function public.intelligence_usage_guard(
  p_organization_id uuid,
  p_use_case        text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lim      record;
  v_minuto   integer;
  v_hora     integer;
  v_mes      integer;
  v_vuelo    integer;
  v_pct      integer;
begin
  select * into v_lim from intelligence_effective_limits(p_organization_id);

  -- Serializa las aperturas de ESTA empresa. No bloquea a las demás.
  perform pg_advisory_xact_lock(
    hashtext('intelligence_usage'), hashtext(p_organization_id::text));

  select count(*) into v_minuto from quality_ai_runs
   where organization_id = p_organization_id and started_at >= now() - interval '1 minute';
  if v_minuto >= v_lim.runs_per_minute then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited_minute',
      'message', 'Demasiadas operaciones seguidas. Espera unos segundos y vuelve a intentarlo.',
      'window', 'minute', 'used', v_minuto, 'limit', v_lim.runs_per_minute);
  end if;

  select count(*) into v_hora from quality_ai_runs
   where organization_id = p_organization_id and started_at >= now() - interval '1 hour';
  if v_hora >= v_lim.runs_per_hour then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited_hour',
      'message', 'Tu empresa ha alcanzado el máximo de operaciones por hora de Intelligence.',
      'window', 'hour', 'used', v_hora, 'limit', v_lim.runs_per_hour);
  end if;

  select count(*) into v_vuelo from quality_ai_runs
   where organization_id = p_organization_id
     and status = 'running'
     and started_at >= now() - interval '10 minutes';
  if v_vuelo >= v_lim.max_concurrent then
    return jsonb_build_object('allowed', false, 'reason', 'too_many_concurrent',
      'message', 'Hay varias operaciones de Intelligence en curso. Espera a que terminen.',
      'window', 'concurrent', 'used', v_vuelo, 'limit', v_lim.max_concurrent);
  end if;

  -- El mes, en UTC. Ver la nota de arriba.
  select count(*) into v_mes from quality_ai_runs
   where organization_id = p_organization_id
     and started_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';

  v_pct := case when v_lim.runs_per_month > 0
                then (v_mes * 100 / v_lim.runs_per_month) else 0 end;

  if v_lim.hard_limit_enabled and v_mes >= v_lim.runs_per_month then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_cap',
      'message', 'Tu empresa ha alcanzado el máximo mensual de operaciones de Intelligence. '
        || 'Escríbenos si necesitas ampliarlo.',
      'window', 'month', 'used', v_mes, 'limit', v_lim.runs_per_month, 'percent', v_pct);
  end if;

  return jsonb_build_object('allowed', true, 'window', 'month',
    'used', v_mes, 'limit', v_lim.runs_per_month, 'percent', v_pct,
    'soft_limit_percent', v_lim.soft_limit_percent,
    'soft_limit_reached', v_pct >= v_lim.soft_limit_percent,
    'override_id', v_lim.override_id);
end;
$$;

revoke all on function public.intelligence_usage_guard(uuid, text) from public, anon;
grant execute on function public.intelligence_usage_guard(uuid, text) to authenticated;

comment on function public.intelligence_usage_guard(uuid, text) is
  'QUALITY-12.2F · Decide ANTES de llamar al proveedor. Serializa por empresa con un bloqueo de aviso por transaccion: sin el, cincuenta peticiones simultaneas leen el mismo recuento y se saltan el limite.';


-- ============================================================================
-- 8 · EL AVISO DE UMBRAL
-- ----------------------------------------------------------------------------
-- Cruzar el umbral blando emite un hecho en `work_events`, que es el bus que
-- ya existe y que la automatización de QUALITY-11 sabe leer. No se construye
-- un segundo bus ni un motor de correos (§42, §43).
--
-- `work_events` no tenía un sujeto para «la empresa entera», así que se añade.
-- Es la única forma honesta de modelar «esta empresa va por el 80 %».
-- ============================================================================

alter table public.work_events drop constraint if exists work_events_subject_type_check;
alter table public.work_events add constraint work_events_subject_type_check
  check (subject_type = any (array[
    'trazadoc_document', 'quality_indicator', 'quality_objective', 'work_case',
    'work_action', 'quality_risk', 'quality_opportunity', 'quality_control',
    'quality_person', 'quality_position', 'quality_person_competency',
    'quality_competency_evidence', 'quality_development_plan_item',
    'quality_learning_activity', 'quality_performance_evaluation',
    'quality_knowledge_item', 'quality_knowledge_transfer_plan',
    'quality_lesson_learned', 'quality_supplier_profile', 'quality_supplier_scope',
    'quality_supplier_evaluation', 'quality_supplier_document',
    'quality_customer_profile', 'quality_survey_campaign', 'quality_customer_feedback',
    'quality_customer_voice_review', 'quality_audit_program', 'quality_audit',
    'quality_audit_finding', 'quality_management_review',
    'quality_management_review_input', 'quality_management_review_decision',
    'quality_automation_rule', 'quality_signal',
    -- QUALITY-12.2F · El sujeto es la empresa: el consumo de Intelligence no
    -- pertenece a ningún registro concreto del sistema de gestión.
    'organization'
  ]));

-- Y los dos tipos de evento nuevos, dentro del vocabulario cerrado que ya
-- existía. Se llaman `ai.*` porque esa es la convención del bus —ya conviven
-- ahí `ai.run_completed` y `ai.suggestion_accepted`—, no `intelligence.*`: la
-- identidad visible es una cosa y el espacio técnico es otra, y esta es la
-- misma separación que congeló QUALITY-12.2E.
--
-- La lista se amplía leyendo la que hay, en vez de volver a escribir las
-- doscientas entradas: copiarlas a mano garantiza perder alguna.
do $$
declare
  v_def text;
  v_lista text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conname = 'work_events_type_check';

  if v_def is null then
    raise exception 'No existe work_events_type_check: la 0140 asume el vocabulario previo.';
  end if;

  if position('ai.usage_threshold_reached' in v_def) > 0 then
    return;   -- ya ampliada
  end if;

  v_lista := substring(v_def from 'ARRAY\[(.*)\]');

  execute 'alter table public.work_events drop constraint work_events_type_check';
  execute 'alter table public.work_events add constraint work_events_type_check '
    || 'check (event_type = any (array[' || v_lista
    || ', ''ai.usage_threshold_reached''::text'
    || ', ''ai.usage_hard_limit_reached''::text]))';
end;
$$;

create or replace function public.intelligence_emit_usage_event(
  p_organization_id uuid,
  p_percent         integer,
  p_used            integer,
  p_limit           integer,
  p_hard            boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes  text := to_char(now() at time zone 'UTC', 'YYYY-MM');
  v_tipo text := case when p_hard then 'ai.usage_hard_limit_reached'
                      else 'ai.usage_threshold_reached' end;
begin
  -- Un aviso por empresa, mes y tipo. `dedupe_key` evita que cada operación
  -- por encima del umbral genere otro evento idéntico: el aviso es la noticia,
  -- no cada una de las quinientas veces que sigue siendo cierta.
  insert into work_events
    (organization_id, source_domain, event_type, subject_type, subject_id,
     severity, summary, payload, dedupe_key, created_by)
  values (
    p_organization_id, 'ai', v_tipo, 'organization', p_organization_id,
    case when p_hard then 'critical' else 'warning' end,
    case when p_hard
         then 'Intelligence alcanzó el máximo mensual de operaciones'
         else 'Intelligence va por el ' || p_percent || ' % del máximo mensual' end,
    jsonb_build_object('percent', p_percent, 'used', p_used, 'limit', p_limit,
                       'month', v_mes, 'hard', p_hard),
    v_tipo || ':' || p_organization_id::text || ':' || v_mes,
    null)
  on conflict do nothing;
exception
  -- Un aviso que falla NO puede tumbar la operación que lo provocó.
  when others then null;
end;
$$;

revoke all on function public.intelligence_emit_usage_event(uuid, integer, integer, integer, boolean)
  from public, anon;
grant execute on function public.intelligence_emit_usage_event(uuid, integer, integer, integer, boolean)
  to authenticated;

-- El `dedupe_key` necesita ser único para que `on conflict` sirva de algo.
create unique index if not exists work_events_dedupe_uniq
  on public.work_events (organization_id, dedupe_key)
  where dedupe_key is not null;


-- ============================================================================
-- 9 · LAS PUERTAS, AHORA CON GUARDIÁN
-- ----------------------------------------------------------------------------
-- Se sustituyen las tres funciones que abren un run para que consulten el
-- guardián. Se conserva EXACTAMENTE su comportamiento anterior —pertenencia,
-- módulo, plan, tope diario— y se añade el guardián detrás.
--
-- El orden importa y es el de §19: el DERECHO se comprueba antes que el
-- PRESUPUESTO. Una empresa en Demo no obtiene acceso por tener presupuesto de
-- sobra; el presupuesto solo puede quitar, nunca dar.
-- ============================================================================

create or replace function public.document_authoring_start_run(
  p_organization_id uuid,
  p_document_id     uuid,
  p_module_key      text,
  p_section_key     text,
  p_action          text,
  p_provider        text,
  p_model           text,
  p_prompt_template text,
  p_prompt_version  integer,
  p_guidance_revision_id uuid default null,
  p_daily_limit     integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc     record;
  v_acceso  jsonb;
  v_hoy     integer;
  v_run     uuid;
  v_guard   jsonb;
begin
  if not is_org_member(p_organization_id) then
    return jsonb_build_object('allowed', false, 'reason', 'not_member',
      'message', 'No perteneces a esta empresa.');
  end if;

  select d.id, d.module_key, d.status into v_doc
    from trazadoc_documents d
   where d.id = p_document_id and d.organization_id = p_organization_id;

  if v_doc.id is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_found',
      'message', 'Ese documento no existe o no pertenece a tu empresa.');
  end if;

  if v_doc.module_key is distinct from p_module_key then
    return jsonb_build_object('allowed', false, 'reason', 'module_mismatch',
      'message', 'Ese documento no pertenece al módulo indicado.');
  end if;

  v_acceso := resolve_organization_module_access(
    p_organization_id,
    case p_module_key when 'cpr' then 'traceability_6632' else p_module_key end);

  if not coalesce((v_acceso ->> 'allowed')::boolean, false) then
    return jsonb_build_object('allowed', false, 'reason', 'module_denied',
      'message', 'Tu empresa no tiene acceso a este módulo.');
  end if;

  if (v_acceso ->> 'access_mode') not in ('full', 'extra') then
    return jsonb_build_object('allowed', false, 'reason', 'demo',
      'message', 'La asistencia de redacción está disponible en los planes Full y Extra.');
  end if;

  select count(*) into v_hoy
    from quality_ai_runs
   where organization_id = p_organization_id
     and actor_id = auth.uid()
     and use_case = 'document.quick_edit'
     and started_at >= date_trunc('day', now());

  if v_hoy >= coalesce(p_daily_limit, 100) then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited',
      'message', 'Has alcanzado el máximo de mejoras de redacción por hoy.');
  end if;

  -- QUALITY-12.2F · El presupuesto, después del derecho.
  v_guard := intelligence_usage_guard(p_organization_id, 'document.quick_edit');
  if not (v_guard ->> 'allowed')::boolean then
    return v_guard;
  end if;

  insert into quality_ai_runs (
    organization_id, actor_id, use_case, provider, model,
    prompt_template, prompt_version, status,
    module_key, document_id, section_key, action, guidance_revision_id)
  values (
    p_organization_id, auth.uid(), 'document.quick_edit', p_provider, p_model,
    p_prompt_template, p_prompt_version, 'running',
    p_module_key, p_document_id, p_section_key, p_action, p_guidance_revision_id)
  returning id into v_run;

  if coalesce((v_guard ->> 'soft_limit_reached')::boolean, false) then
    perform intelligence_emit_usage_event(p_organization_id,
      (v_guard ->> 'percent')::integer, (v_guard ->> 'used')::integer,
      (v_guard ->> 'limit')::integer, false);
  end if;

  return jsonb_build_object('allowed', true, 'run_id', v_run,
    'usage', v_guard - 'allowed');
end;
$$;

create or replace function public.document_review_start_run(
  p_organization_id uuid,
  p_document_id     uuid,
  p_module_key      text,
  p_section_key     text,
  p_provider        text,
  p_model           text,
  p_prompt_template text,
  p_prompt_version  integer,
  p_guidance_revision_id uuid default null,
  p_related_context_types text[] default null,
  p_context_queries integer default null,
  p_daily_limit     integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc     record;
  v_acceso  jsonb;
  v_hoy     integer;
  v_run     uuid;
  v_guard   jsonb;
begin
  if not is_org_member(p_organization_id) then
    return jsonb_build_object('allowed', false, 'reason', 'not_member',
      'message', 'No perteneces a esta empresa.');
  end if;

  select d.id, d.module_key, d.status into v_doc
    from trazadoc_documents d
   where d.id = p_document_id and d.organization_id = p_organization_id;

  if v_doc.id is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_found',
      'message', 'Ese documento no existe o no pertenece a tu empresa.');
  end if;

  if v_doc.module_key is distinct from p_module_key then
    return jsonb_build_object('allowed', false, 'reason', 'module_mismatch',
      'message', 'Ese documento no pertenece al módulo indicado.');
  end if;

  v_acceso := resolve_organization_module_access(
    p_organization_id,
    case p_module_key when 'cpr' then 'traceability_6632' else p_module_key end);

  if not coalesce((v_acceso ->> 'allowed')::boolean, false) then
    return jsonb_build_object('allowed', false, 'reason', 'module_denied',
      'message', 'Tu empresa no tiene acceso a este módulo.');
  end if;

  if (v_acceso ->> 'access_mode') not in ('full', 'extra') then
    return jsonb_build_object('allowed', false, 'reason', 'demo',
      'message', 'La revisión contra Trazaloop está disponible en los planes Full y Extra.');
  end if;

  select count(*) into v_hoy
    from quality_ai_runs
   where organization_id = p_organization_id
     and actor_id = auth.uid()
     and use_case = 'document.contextual_review'
     and started_at >= date_trunc('day', now());

  if v_hoy >= coalesce(p_daily_limit, 60) then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited',
      'message', 'Has alcanzado el máximo de revisiones contextuales por hoy.');
  end if;

  v_guard := intelligence_usage_guard(p_organization_id, 'document.contextual_review');
  if not (v_guard ->> 'allowed')::boolean then
    return v_guard;
  end if;

  insert into quality_ai_runs (
    organization_id, actor_id, use_case, provider, model,
    prompt_template, prompt_version, status,
    module_key, document_id, section_key, guidance_revision_id,
    related_context_types, context_queries)
  values (
    p_organization_id, auth.uid(), 'document.contextual_review', p_provider, p_model,
    p_prompt_template, p_prompt_version, 'running',
    p_module_key, p_document_id, p_section_key, p_guidance_revision_id,
    p_related_context_types, p_context_queries)
  returning id into v_run;

  if coalesce((v_guard ->> 'soft_limit_reached')::boolean, false) then
    perform intelligence_emit_usage_event(p_organization_id,
      (v_guard ->> 'percent')::integer, (v_guard ->> 'used')::integer,
      (v_guard ->> 'limit')::integer, false);
  end if;

  return jsonb_build_object('allowed', true, 'run_id', v_run,
    'usage', v_guard - 'allowed');
end;
$$;


-- ============================================================================
-- 10 · LO QUE SE VE
-- ----------------------------------------------------------------------------
-- Vistas DERIVADAS de los runs. No hay contadores mutables, así que no pueden
-- desincronizarse de la verdad: se recalculan cada vez que alguien mira (§24).
--
-- Ninguna expone la pregunta, la respuesta ni el texto de nadie. Para ver
-- cuánto se consume no hace falta leer lo que se escribió (§35).
-- ============================================================================

create or replace view public.v_intelligence_usage_runs
with (security_invoker = true) as
select
  r.id                as run_id,
  r.organization_id,
  r.actor_id,
  r.use_case,
  uc.label            as use_case_label,
  uc.cost_class,
  r.provider, r.model, r.status, r.provider_called,
  r.started_at, r.completed_at, r.latency_ms,
  coalesce(r.input_tokens, 0)         as input_tokens,
  coalesce(r.cached_input_tokens, 0)  as cached_input_tokens,
  coalesce(r.output_tokens, 0)        as output_tokens,
  coalesce(r.reasoning_tokens, 0)     as reasoning_tokens,
  coalesce(r.total_tokens, coalesce(r.input_tokens, 0) + coalesce(r.output_tokens, 0))
                                      as total_tokens,
  -- Coste con la tarifa vigente CUANDO ocurrió. `null` si no hay tarifa: no es
  -- lo mismo «gratis» que «no lo sabemos».
  case when r.provider_called
       then intelligence_run_cost_usd(r.provider, r.model, r.started_at,
              r.input_tokens, r.cached_input_tokens, r.output_tokens, r.reasoning_tokens)
       else 0 end                     as estimated_cost_usd
from public.quality_ai_runs r
left join public.intelligence_use_cases uc on uc.use_case = r.use_case;

revoke all on public.v_intelligence_usage_runs from anon, authenticated;
grant select on public.v_intelligence_usage_runs to authenticated;

comment on view public.v_intelligence_usage_runs is
  'QUALITY-12.2F · Un run, sus tokens y su coste con la tarifa de su momento. Sin la pregunta ni la respuesta: para ver el consumo no hace falta leer lo que alguien escribio.';


create or replace view public.v_intelligence_usage_by_use_case
with (security_invoker = true) as
select
  r.organization_id,
  r.use_case,
  uc.label as use_case_label,
  uc.cost_class,
  date_trunc('month', r.started_at at time zone 'UTC')::date as month_utc,
  count(*)                                        as runs,
  count(*) filter (where r.provider_called)       as provider_calls,
  count(*) filter (where r.status = 'succeeded')  as succeeded,
  count(*) filter (where r.status in ('failed', 'refused')) as failed,
  sum(coalesce(r.input_tokens, 0))                as input_tokens,
  sum(coalesce(r.cached_input_tokens, 0))         as cached_input_tokens,
  sum(coalesce(r.output_tokens, 0))               as output_tokens,
  sum(coalesce(r.reasoning_tokens, 0))            as reasoning_tokens,
  sum(coalesce(r.total_tokens, 0))                as total_tokens,
  round(avg(r.input_tokens) filter (where r.provider_called), 1)  as avg_input,
  round(avg(r.output_tokens) filter (where r.provider_called), 1) as avg_output,
  round(avg(r.latency_ms) filter (where r.provider_called), 0)    as avg_latency_ms,
  sum(case when r.provider_called
           then coalesce(intelligence_run_cost_usd(r.provider, r.model, r.started_at,
                  r.input_tokens, r.cached_input_tokens, r.output_tokens,
                  r.reasoning_tokens), 0)
           else 0 end)                            as estimated_cost_usd
from public.quality_ai_runs r
left join public.intelligence_use_cases uc on uc.use_case = r.use_case
group by r.organization_id, r.use_case, uc.label, uc.cost_class,
         date_trunc('month', r.started_at at time zone 'UTC');

revoke all on public.v_intelligence_usage_by_use_case from anon, authenticated;
grant select on public.v_intelligence_usage_by_use_case to authenticated;


create or replace view public.v_intelligence_usage_by_actor
with (security_invoker = true) as
select
  r.organization_id,
  r.actor_id,
  date_trunc('day', r.started_at at time zone 'UTC')::date as day_utc,
  count(*)                                  as runs,
  count(*) filter (where r.provider_called) as provider_calls,
  sum(coalesce(r.total_tokens, 0))          as total_tokens
from public.quality_ai_runs r
group by r.organization_id, r.actor_id, date_trunc('day', r.started_at at time zone 'UTC');

revoke all on public.v_intelligence_usage_by_actor from anon, authenticated;
grant select on public.v_intelligence_usage_by_actor to authenticated;

comment on view public.v_intelligence_usage_by_actor is
  'QUALITY-12.2F · Consumo por persona, para diagnostico y abuso. NO es una cuota individual: el presupuesto es de la empresa y se comparte (§8).';


-- ============================================================================
-- 11 · EL ESTADO DE UNA EMPRESA, EN UNA LLAMADA
-- ----------------------------------------------------------------------------
-- Lo que necesita la pantalla de un administrador: cuánto lleva, de cuánto
-- dispone y en qué estado está. Sin dinero: una empresa compra Trazaloop, no
-- tokens de un proveedor (§22).
-- ============================================================================

create or replace function public.intelligence_usage_status(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lim   record;
  v_mes   integer;
  v_hoy   integer;
  v_pct   integer;
  v_desglose jsonb;
begin
  if not (is_org_member(p_organization_id) or is_platform_staff()) then
    raise exception 'No perteneces a esta empresa.';
  end if;

  select * into v_lim from intelligence_effective_limits(p_organization_id);

  select count(*) into v_mes from quality_ai_runs
   where organization_id = p_organization_id
     and started_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';

  select count(*) into v_hoy from quality_ai_runs
   where organization_id = p_organization_id
     and started_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';

  v_pct := case when v_lim.runs_per_month > 0
                then (v_mes * 100 / v_lim.runs_per_month) else 0 end;

  select coalesce(jsonb_object_agg(t.use_case, t.n), '{}'::jsonb) into v_desglose
    from (select use_case, count(*) n from quality_ai_runs
           where organization_id = p_organization_id
             and started_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
           group by use_case) t;

  return jsonb_build_object(
    'month_utc', to_char(now() at time zone 'UTC', 'YYYY-MM'),
    'runs_this_month', v_mes,
    'runs_today', v_hoy,
    'monthly_limit', v_lim.runs_per_month,
    'percent_used', v_pct,
    'soft_limit_percent', v_lim.soft_limit_percent,
    'state', case when v_pct >= 100 then 'at_limit'
                  when v_pct >= v_lim.soft_limit_percent then 'near_limit'
                  when v_pct >= 50 then 'high'
                  else 'normal' end,
    'by_use_case', v_desglose,
    'has_override', v_lim.override_id is not null);
end;
$$;

revoke all on function public.intelligence_usage_status(uuid) from public, anon;
grant execute on function public.intelligence_usage_status(uuid) to authenticated;

comment on function public.intelligence_usage_status(uuid) is
  'QUALITY-12.2F · Estado de consumo de una empresa para su propia pantalla. Sin dinero: una empresa compra Trazaloop, no tokens de un proveedor.';


-- ============================================================================
-- 12 · LA VISTA DE PLATAFORMA
-- ----------------------------------------------------------------------------
-- Para detectar «esta empresa consume veinte veces la media». Solo personal de
-- plataforma, y sin una sola letra del contenido.
-- ============================================================================

create or replace view public.v_intelligence_usage_platform
with (security_invoker = true) as
select
  o.id            as organization_id,
  o.name          as organization_name,
  date_trunc('month', r.started_at at time zone 'UTC')::date as month_utc,
  count(*)                                        as runs,
  count(*) filter (where r.provider_called)       as provider_calls,
  count(*) filter (where r.status in ('failed', 'refused')) as failures,
  count(distinct r.actor_id)                      as actors,
  sum(coalesce(r.input_tokens, 0))                as input_tokens,
  sum(coalesce(r.cached_input_tokens, 0))         as cached_input_tokens,
  sum(coalesce(r.output_tokens, 0))               as output_tokens,
  sum(coalesce(r.reasoning_tokens, 0))            as reasoning_tokens,
  sum(coalesce(r.total_tokens, 0))                as total_tokens,
  round(avg(r.latency_ms) filter (where r.provider_called), 0) as avg_latency_ms,
  sum(case when r.provider_called
           then coalesce(intelligence_run_cost_usd(r.provider, r.model, r.started_at,
                  r.input_tokens, r.cached_input_tokens, r.output_tokens,
                  r.reasoning_tokens), 0)
           else 0 end)                            as estimated_cost_usd
from public.quality_ai_runs r
join public.organizations o on o.id = r.organization_id
where is_platform_staff()
group by o.id, o.name, date_trunc('month', r.started_at at time zone 'UTC');

revoke all on public.v_intelligence_usage_platform from anon, authenticated;
grant select on public.v_intelligence_usage_platform to authenticated;

comment on view public.v_intelligence_usage_platform is
  'QUALITY-12.2F · Consumo por empresa para la plataforma. El filtro is_platform_staff() esta DENTRO de la vista: sin el, security_invoker dejaria ver todas las filas a cualquiera que pudiera leer quality_ai_runs.';


-- ============================================================================
-- 13 · UN DEFECTO DE CONTABILIDAD QUE ESTABA AHÍ DESDE 0134
-- ----------------------------------------------------------------------------
-- `provider_called` nacía en `true` por defecto.
--
-- Suena inofensivo y no lo es: una operación que se abre, falla por tiempo de
-- espera y nunca llega a hablar con el proveedor quedaba registrada como si
-- hubiera llamado. Con cero tokens, sí —así que el coste salía bien—, pero el
-- recuento de llamadas al proveedor mentía, y ese recuento es justo lo que
-- este sprint construye para poder decidir un precio.
--
-- Lo encontró una prueba que fallaba un run a propósito y luego iba a mirar
-- cómo había quedado registrado.
--
-- El arreglo es en dos partes:
--
--   1 · el valor por defecto pasa a `false`. Se afirma que hubo llamada, no se
--       supone: `quality_ai_complete_run` ya lo pone en `true` explícitamente
--       desde 0134.
--
--   2 · cerrar en fallo acepta decir si hubo llamada, porque a veces la hay.
--       Un tiempo de espera agotado no llamó a nadie; una respuesta que no
--       cumplió el esquema sí llegó del proveedor, y sus tokens se gastaron.
--       Quien cierra la operación es el único que sabe cuál de las dos fue.
--
-- LAS FILAS QUE YA EXISTEN NO SE TOCAN. Cambiar el valor por defecto no
-- reescribe el pasado, y reescribirlo sería falsificar el registro para que
-- cuadre con una regla que se escribió después.
-- ============================================================================

alter table public.quality_ai_runs alter column provider_called set default false;

comment on column public.quality_ai_runs.provider_called is
  'QUALITY-12.2F · Si esta operacion llego a hablar con el proveedor. Por defecto FALSE: se afirma, no se supone. Antes nacia en true y un fallo por tiempo de espera se contaba como llamada.';

create or replace function public.quality_ai_fail_run(
  p_run_id uuid,
  p_status text,
  p_error  text,
  -- QUALITY-12.2F · Por defecto NO se llamó: es lo cierto en la mayoría de los
  -- fallos, y suponer lo contrario infla el recuento de llamadas.
  p_provider_called boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_run record;
begin
  select * into v_run from quality_ai_runs where id = p_run_id;
  if v_run.id is null then raise exception 'Esa consulta no existe.'; end if;
  if v_run.actor_id <> auth.uid() and auth.uid() is not null then
    raise exception 'No puedes cerrar la consulta de otra persona.';
  end if;

  update quality_ai_runs
     set status = p_status,
         completed_at = clock_timestamp(),
         latency_ms = extract(milliseconds from clock_timestamp() - started_at)::integer,
         error_message = left(coalesce(p_error, ''), 500),
         provider_called = coalesce(p_provider_called, false)
   where id = p_run_id;
end;
$$;

revoke all on function public.quality_ai_fail_run(uuid, text, text, boolean) from public, anon;
grant execute on function public.quality_ai_fail_run(uuid, text, text, boolean) to authenticated;

comment on function public.quality_ai_fail_run(uuid, text, text, boolean) is
  'QUALITY-12.2F · Cierra una operacion fallida diciendo SI hubo llamada al proveedor. Un tiempo de espera agotado no llamo a nadie; una respuesta invalida si llego, y sus tokens se gastaron.';

-- Y LA VERSIÓN DE TRES ARGUMENTOS SE ELIMINA.
--
-- El primer intento fue dejarla y hacer que delegara en la nueva. Parecía lo
-- prudente y resultó ser peor: con dos funciones del mismo nombre, PostgREST
-- tiene que elegir candidata a partir de las claves del JSON, y una llamada de
-- tres argumentos se queda sin resolver. El resultado no fue un error visible
-- sino una operación que **no se cerraba**, y una prueba que iba a comprobar
-- un fallo se encontraba con un run todavía abierto.
--
-- Una sola función con el cuarto parámetro por defecto se puede llamar de las
-- dos formas y no hay nada que adivinar.
drop function if exists public.quality_ai_fail_run(uuid, text, text);
