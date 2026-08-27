-- ============================================================================
-- QUALITY-12.1 · CIERRE DEL COPILOT · §65
-- ----------------------------------------------------------------------------
-- Esta migración AÑADE. No toca la 0133 anterior ni reescribe la 0132, que ya
-- está aplicada en Staging: lo que allí quedó escrito sigue escrito y sigue
-- significando lo mismo.
--
-- Trae dos cosas, y solo dos:
--
--   1 · EL DETALLE DE LO QUE CUESTA CADA CONSULTA (§12). La 0132 guardaba
--       tokens de entrada y de salida. Un proveedor que razona y que reutiliza
--       contexto en caché informa de dos números más, y sin ellos la factura no
--       cuadra con lo que la aplicación cree haber gastado. Se guardan los que
--       el proveedor informe; los que no informe se quedan en null, porque un
--       número inventado en una tabla de consumo es peor que un hueco.
--
--   2 · LOS TEMAS DE CLIENTES, PERSISTIDOS (GAP-03 de QUALITY-12). Hasta ahora
--       el Copilot los proponía y se perdían al cerrar la pantalla. Un tema que
--       no se guarda no se puede seguir: la pregunta que de verdad importa —«¿el
--       problema del plazo de entrega va a mejor o a peor?»— necesita el mismo
--       tema medido en dos periodos. Por eso el tema es una fila con periodo, y
--       la serie sale de comparar periodos del mismo tema.
--
-- LO QUE SIGUE SIN PODER PASAR
--
-- Un tema NO identifica a nadie. Nace de comentarios anónimos, y su evidencia
-- apunta a las REFERENCIAS de la consulta —«comentario anónimo #3 de la campaña
-- X»—, nunca a una respuesta, una invitación ni un contacto. Guardar el tema no
-- puede convertirse en la puerta trasera por la que la anonimidad de QUALITY-08
-- se pierde, y no lo es: no hay ninguna columna por la que volver a la persona.
-- ============================================================================


-- ============================================================================
-- 1 · EL CONSUMO, CON EL DETALLE QUE EL PROVEEDOR INFORME (§12)
-- ============================================================================

alter table public.quality_ai_runs
  add column if not exists cached_input_tokens integer,
  add column if not exists reasoning_tokens    integer,
  add column if not exists total_tokens        integer;

comment on column public.quality_ai_runs.cached_input_tokens is
  'QUALITY-12.1 · §12 · Parte de la entrada que el proveedor sirvió desde su caché y factura distinto. Null si no lo informa: no se deduce.';
comment on column public.quality_ai_runs.reasoning_tokens is
  'QUALITY-12.1 · §12 · Lo que el modelo gastó en pensar antes de responder. Se cobra como salida aunque no aparezca en la respuesta, y por eso se guarda aparte.';
comment on column public.quality_ai_runs.total_tokens is
  'QUALITY-12.1 · §12 · El total según el proveedor. No es la suma de los demás campos: es lo que él dice, que es lo que se factura.';


-- El cierre de una consulta pasa a admitir esos tres números. La firma antigua
-- se retira en lugar de convivir: dos funciones con el mismo nombre y distinto
-- número de argumentos por defecto dejan la llamada ambigua, y una llamada
-- ambigua en la ruta de cierre significa consultas que se quedan «running».
drop function if exists public.quality_ai_complete_run(uuid, jsonb, text, integer, integer, integer);

create or replace function public.quality_ai_complete_run(
  p_run_id         uuid,
  p_answer         jsonb,
  p_evidence_level text,
  p_input_tokens   integer default null,
  p_output_tokens  integer default null,
  p_tool_calls     integer default 0,
  p_cached_input_tokens integer default null,
  p_reasoning_tokens    integer default null,
  p_total_tokens        integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_run record; v_cfg record;
begin
  select * into v_run from quality_ai_runs where id = p_run_id;
  if v_run.id is null then raise exception 'Esa consulta no existe.'; end if;
  if v_run.actor_id <> auth.uid() and auth.uid() is not null then
    raise exception 'No puedes cerrar la consulta de otra persona.';
  end if;
  if v_run.status <> 'running' then
    raise exception 'Esa consulta ya está cerrada.';
  end if;
  select * into v_cfg from quality_ai_settings where organization_id = v_run.organization_id;

  update quality_ai_runs
     set status = 'succeeded',
         completed_at = clock_timestamp(),
         latency_ms = extract(milliseconds from clock_timestamp() - started_at)::integer,
         -- §30 · La respuesta se guarda solo si la empresa quiere guardarla.
         answer = case when coalesce(v_cfg.retain_answer, true) then p_answer else null end,
         evidence_level = p_evidence_level,
         input_tokens = p_input_tokens,
         output_tokens = p_output_tokens,
         cached_input_tokens = p_cached_input_tokens,
         reasoning_tokens = p_reasoning_tokens,
         total_tokens = p_total_tokens,
         tool_calls = coalesce(p_tool_calls, 0)
   where id = p_run_id;
end;
$$;
revoke all on function public.quality_ai_complete_run(uuid, jsonb, text, integer, integer, integer, integer, integer, integer)
  from public, anon;
grant execute on function public.quality_ai_complete_run(uuid, jsonb, text, integer, integer, integer, integer, integer, integer)
  to authenticated;


-- El informe de consumo aprende a contar los tres números nuevos. Sigue siendo
-- del mes en curso y sigue sin nombrar a nadie.
create or replace function public.quality_ai_usage(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'runs_this_month', coalesce((
      select count(*) from quality_ai_runs
       where organization_id = p_organization_id
         and started_at >= date_trunc('month', now())), 0),
    'runs_today', coalesce((
      select count(*) from quality_ai_runs
       where organization_id = p_organization_id
         and started_at >= date_trunc('day', now())), 0),
    'failed_this_month', coalesce((
      select count(*) from quality_ai_runs
       where organization_id = p_organization_id
         and started_at >= date_trunc('month', now())
         and status in ('failed', 'refused')), 0),
    'input_tokens_this_month', coalesce((
      select sum(input_tokens) from quality_ai_runs
       where organization_id = p_organization_id
         and started_at >= date_trunc('month', now())), 0),
    'output_tokens_this_month', coalesce((
      select sum(output_tokens) from quality_ai_runs
       where organization_id = p_organization_id
         and started_at >= date_trunc('month', now())), 0),
    -- §12 · Los tres del detalle. Un cero aquí puede querer decir «cero» o
    -- «el proveedor no lo informa»: la pantalla lo distingue mirando si hay
    -- alguna consulta con el campo relleno.
    'cached_input_tokens_this_month', coalesce((
      select sum(cached_input_tokens) from quality_ai_runs
       where organization_id = p_organization_id
         and started_at >= date_trunc('month', now())), 0),
    'reasoning_tokens_this_month', coalesce((
      select sum(reasoning_tokens) from quality_ai_runs
       where organization_id = p_organization_id
         and started_at >= date_trunc('month', now())), 0),
    'total_tokens_this_month', coalesce((
      select sum(total_tokens) from quality_ai_runs
       where organization_id = p_organization_id
         and started_at >= date_trunc('month', now())), 0),
    'monthly_run_limit', (
      select monthly_run_limit from quality_ai_settings
       where organization_id = p_organization_id),
    'daily_user_limit', (
      select daily_user_limit from quality_ai_settings
       where organization_id = p_organization_id)
  );
$$;
revoke all on function public.quality_ai_usage(uuid) from public, anon;
grant execute on function public.quality_ai_usage(uuid) to authenticated;


-- La vista de consultas enseña también el detalle. Se recrea entera —CREATE OR
-- REPLACE no admite meter columnas por en medio— y las nuevas van al final, que
-- es donde no rompen a nadie que ya la leyera por nombre de columna.
drop view if exists public.v_quality_ai_run_overview;
create view public.v_quality_ai_run_overview
with (security_invoker = true) as
select
  r.organization_id,
  r.id                as run_id,
  r.session_id,
  r.actor_id,
  p.full_name         as actor_name,
  r.use_case,
  r.provider, r.model, r.prompt_template, r.prompt_version,
  r.temporal_mode, r.as_of, r.period_start, r.period_end,
  r.status, r.started_at, r.completed_at, r.latency_ms,
  r.input_tokens, r.output_tokens, r.context_items, r.tool_calls,
  r.evidence_level, r.error_message,
  -- §119 · El CONTENIDO solo para quien lo preguntó. Que un administrador vea
  -- el consumo no le da derecho a leer lo que preguntó otra persona: dentro de
  -- una pregunta puede haber tanto dato restringido como en la respuesta.
  case when r.actor_id = auth.uid() then r.question end as question,
  case when r.actor_id = auth.uid() then r.answer   end as answer,
  (r.actor_id = auth.uid())                             as is_mine,
  coalesce(s.total, 0)  as suggestion_count,
  coalesce(s.accepted, 0) as accepted_count,
  f.useful               as feedback_useful,
  -- §12 · Lo que faltaba para que el consumo cuadre con la factura.
  r.cached_input_tokens, r.reasoning_tokens, r.total_tokens
from public.quality_ai_runs r
left join public.profiles p on p.id = r.actor_id
left join lateral (
  select count(*) as total,
         count(*) filter (where x.status = 'accepted') as accepted
    from public.quality_ai_suggestions x
   where x.organization_id = r.organization_id and x.run_id = r.id) s on true
left join public.quality_ai_feedback f
  on f.organization_id = r.organization_id and f.run_id = r.id and f.actor_id = auth.uid();

revoke all on public.v_quality_ai_run_overview from anon, authenticated;
grant select on public.v_quality_ai_run_overview to authenticated;

comment on view public.v_quality_ai_run_overview is
  'QUALITY-12 · §118/§119 · El consumo y el resultado de cada consulta. La pregunta y la respuesta solo se ven si son tuyas: metadatos y contenido son permisos distintos.';


-- ============================================================================
-- 2 · LOS TEMAS DE CLIENTES · GAP-03 de QUALITY-12
-- ----------------------------------------------------------------------------
-- POR QUÉ ES UNA TABLA Y NO UN BORRADOR MÁS
--
-- Un `quality_ai_suggestions` de tipo `customer_theme` sirve para proponer una
-- vez. No sirve para lo que la norma pide de verdad, que es SEGUIMIENTO: el
-- mismo asunto medido en dos periodos, para poder decir si la satisfacción se
-- mueve y hacia dónde. Eso necesita periodo, necesita un identificador estable
-- del tema entre periodos, y necesita saber cuántos comentarios lo sostienen.
--
-- LO QUE PONE EL MODELO Y LO QUE PONE EL SERVIDOR
--
--   · el modelo  → la etiqueta del tema, su resumen y el tono percibido
--   · el servidor→ el periodo, el recuento, la procedencia y la evidencia
--
-- El recuento NO lo pone el modelo (§32/§58): sale de contar las referencias
-- que el propio servidor le pasó. Un tema que dice «doce clientes se quejan» y
-- se apoya en tres comentarios es exactamente el fallo que esta separación
-- impide.
-- ============================================================================

create table public.quality_ai_customer_themes (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  -- §7 · De dónde salió. El identificador de la consulta queda para poder
  -- reconstruirlo entero, pero la procedencia se COPIA aquí en el momento de
  -- escribir el tema, por dos razones:
  --
  --   · una consulta solo la lee quien la hizo (§119), y un tema es trabajo
  --     compartido de la empresa: si la procedencia viviera solo en la consulta,
  --     el resto del equipo vería el tema sin poder ver con qué se produjo
  --   · congelada aquí, cambiar el modelo mañana no reescribe la historia
  run_id            uuid not null,
  provider          text not null,
  model             text not null,
  prompt_template   text not null,
  prompt_version    integer not null,

  -- El periodo al que se refiere. Es lo que convierte una lista de temas en una
  -- serie: el mismo `theme_key` en dos periodos ya es una tendencia.
  period_start      date not null,
  period_end        date not null,

  -- Estable entre periodos, y por eso normalizado: «plazo de entrega» y «Plazo
  -- de Entrega» son el mismo asunto y tienen que caer en la misma serie.
  theme_key         text not null,
  label             text not null,
  summary           text,

  -- §59 · El tono, ETIQUETADO, no puntuado. Un número entre 0 y 1 sugeriría una
  -- precisión que no existe; «negativo / mixto / neutro / positivo» es lo que
  -- un lector puede contrastar leyendo los comentarios citados.
  sentiment         text not null default 'unknown',

  -- Lo cuenta el servidor sobre la evidencia real.
  evidence_count    integer not null default 0,

  -- §43 · Nace como propuesta. Que alguien la confirme es lo que la convierte en
  -- un dato del sistema de gestión; hasta entonces es lectura de un modelo.
  status            text not null default 'proposed',
  reviewed_by       uuid references public.profiles (id),
  reviewed_at       timestamptz,
  decision_note     text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_ai_customer_themes_org_id_uniq unique (organization_id, id),
  constraint quality_ai_customer_themes_period_check
    check (period_end >= period_start),
  constraint quality_ai_customer_themes_sentiment_check
    check (sentiment in ('negative', 'mixed', 'neutral', 'positive', 'unknown')),
  constraint quality_ai_customer_themes_status_check
    check (status in ('proposed', 'confirmed', 'discarded')),
  constraint quality_ai_customer_themes_reviewed_consistent
    check ((status in ('confirmed', 'discarded')) = (reviewed_by is not null)),
  constraint quality_ai_customer_themes_key_check
    check (theme_key = lower(btrim(theme_key)) and length(theme_key) between 2 and 80),
  constraint quality_ai_customer_themes_run_fk
    foreign key (organization_id, run_id)
    references public.quality_ai_runs (organization_id, id) on delete cascade
);

comment on table public.quality_ai_customer_themes is
  'QUALITY-12.1 · GAP-03 de QUALITY-12 · Un tema de la voz del cliente, con su periodo, su evidencia y de qué consulta salió. La serie es el mismo theme_key en periodos distintos. No identifica a nadie: la evidencia apunta a comentarios anonimos citados por su ordinal.';
comment on column public.quality_ai_customer_themes.theme_key is
  'Identificador estable del asunto entre periodos, normalizado. Es lo que permite comparar «plazo de entrega» de marzo con el de junio.';
comment on column public.quality_ai_customer_themes.evidence_count is
  '§32 · Lo cuenta el SERVIDOR sobre las referencias reales, nunca el modelo. Un tema no puede afirmar mas respaldo del que tiene.';

-- Una misma consulta no propone el mismo asunto dos veces para el mismo
-- periodo. Repetir la consulta otro dia SI crea una lectura nueva: son dos
-- lecturas distintas del mismo asunto, y las dos merecen quedar.
create unique index quality_ai_customer_themes_unico
  on public.quality_ai_customer_themes (organization_id, run_id, theme_key, period_start, period_end);

create index quality_ai_customer_themes_serie_idx
  on public.quality_ai_customer_themes (organization_id, theme_key, period_start);
create index quality_ai_customer_themes_org_idx
  on public.quality_ai_customer_themes (organization_id, status, period_end desc);

create trigger t_quality_ai_customer_themes_updated
  before update on public.quality_ai_customer_themes
  for each row execute function public.set_updated_at();


-- La evidencia. Apunta a las REFERENCIAS de la consulta, que son lo que el
-- servidor construyó y lo unico que el modelo pudo citar. Por ahí no se vuelve
-- a ninguna persona: una referencia de comentario anónimo dice «comentario #3
-- de la campaña X» y nada más.
-- La 0132 no dejó la pareja (empresa, id) declarada única en las referencias
-- porque nadie apuntaba a ellas todavía. Ahora sí: sin esa clave no se puede
-- exigir por clave foránea que una evidencia y su referencia vivan en la misma
-- empresa, y esa es justamente la comprobación que aquí no puede faltar.
alter table public.quality_ai_run_references
  add constraint quality_ai_run_references_org_id_uniq unique (organization_id, id);


create table public.quality_ai_customer_theme_evidence (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  theme_id          uuid not null,
  reference_id      uuid not null,
  created_at        timestamptz not null default now(),

  constraint quality_ai_theme_evidence_uniq unique (organization_id, theme_id, reference_id),
  constraint quality_ai_theme_evidence_theme_fk
    foreign key (organization_id, theme_id)
    references public.quality_ai_customer_themes (organization_id, id) on delete cascade,
  constraint quality_ai_theme_evidence_ref_fk
    foreign key (organization_id, reference_id)
    references public.quality_ai_run_references (organization_id, id) on delete cascade
);

comment on table public.quality_ai_customer_theme_evidence is
  'QUALITY-12.1 · En que se apoya un tema. Son referencias de la consulta —comentarios anonimos citados por su ordinal, o quejas que quien pregunta ya podia leer—, nunca respuestas ni contactos.';

create index quality_ai_theme_evidence_theme_idx
  on public.quality_ai_customer_theme_evidence (organization_id, theme_id);


-- ----------------------------------------------------------------------------
-- Escribir un tema. Lo llama el servidor al cerrar una consulta de temas.
-- ----------------------------------------------------------------------------
-- Comprueba tres cosas antes de escribir, y las tres son la razón de que esto
-- sea una función y no un insert:
--
--   · que la consulta sea de quien la está cerrando
--   · que la voz del cliente esté permitida en esta empresa (§, ajustes)
--   · que cada referencia citada pertenezca A ESA consulta — una cita a la
--     referencia de otra consulta sería evidencia fabricada
-- ----------------------------------------------------------------------------
create or replace function public.quality_ai_record_customer_theme(
  p_run_id        uuid,
  p_theme_key     text,
  p_label         text,
  p_summary       text,
  p_sentiment     text,
  p_period_start  date,
  p_period_end    date,
  p_reference_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run   record;
  v_key   text;
  v_id    uuid;
  v_valid uuid[];
begin
  select * into v_run from quality_ai_runs where id = p_run_id;
  if v_run.id is null then raise exception 'Esa consulta no existe.'; end if;
  if v_run.actor_id <> auth.uid() and auth.uid() is not null then
    raise exception 'No puedes escribir temas en la consulta de otra persona.';
  end if;
  if not quality_ai_feature_allowed(v_run.organization_id, 'customer') then
    raise exception 'La voz del cliente no está habilitada para el Copilot en esta empresa.';
  end if;

  v_key := lower(btrim(coalesce(p_theme_key, '')));
  if length(v_key) < 2 then
    raise exception 'Un tema necesita un identificador de al menos dos caracteres.';
  end if;
  v_key := left(v_key, 80);

  -- Solo cuentan las referencias de ESTA consulta. Las demás se descartan sin
  -- ruido: la consecuencia visible es que el recuento baja, que es exactamente
  -- lo que debe pasar cuando la evidencia no está donde se dice.
  select coalesce(array_agg(r.id), '{}'::uuid[]) into v_valid
    from quality_ai_run_references r
   where r.organization_id = v_run.organization_id
     and r.run_id = p_run_id
     and r.id = any(coalesce(p_reference_ids, '{}'::uuid[]));

  insert into quality_ai_customer_themes (
    organization_id, run_id, provider, model, prompt_template, prompt_version,
    period_start, period_end,
    theme_key, label, summary, sentiment, evidence_count)
  values (
    v_run.organization_id, p_run_id,
    v_run.provider, v_run.model, v_run.prompt_template, v_run.prompt_version,
    coalesce(p_period_start, v_run.period_start, current_date),
    coalesce(p_period_end, v_run.period_end, current_date),
    v_key, left(coalesce(nullif(btrim(p_label), ''), v_key), 200),
    left(coalesce(p_summary, ''), 2000),
    case when p_sentiment in ('negative', 'mixed', 'neutral', 'positive')
         then p_sentiment else 'unknown' end,
    coalesce(array_length(v_valid, 1), 0))
  on conflict (organization_id, run_id, theme_key, period_start, period_end)
  do update set label = excluded.label,
                summary = excluded.summary,
                sentiment = excluded.sentiment,
                evidence_count = excluded.evidence_count
  returning id into v_id;

  insert into quality_ai_customer_theme_evidence (organization_id, theme_id, reference_id)
  select v_run.organization_id, v_id, x
    from unnest(v_valid) as x
  on conflict do nothing;

  return v_id;
end;
$$;
revoke all on function public.quality_ai_record_customer_theme(uuid, text, text, text, text, date, date, uuid[])
  from public, anon;
grant execute on function public.quality_ai_record_customer_theme(uuid, text, text, text, text, date, date, uuid[])
  to authenticated;


-- ----------------------------------------------------------------------------
-- Confirmar o descartar un tema. §43 · La persona decide; el modelo no.
-- ----------------------------------------------------------------------------
create or replace function public.quality_ai_resolve_customer_theme(
  p_theme_id uuid,
  p_status   text,
  p_note     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_theme record;
begin
  select * into v_theme from quality_ai_customer_themes where id = p_theme_id;
  if v_theme.id is null then raise exception 'Ese tema no existe.'; end if;
  if not is_org_member(v_theme.organization_id) then
    raise exception 'No perteneces a esta empresa.';
  end if;
  if p_status not in ('confirmed', 'discarded') then
    raise exception 'Un tema se confirma o se descarta.';
  end if;
  if v_theme.status <> 'proposed' then
    raise exception 'Ese tema ya está resuelto.';
  end if;

  update quality_ai_customer_themes
     set status = p_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_theme_id;
end;
$$;
revoke all on function public.quality_ai_resolve_customer_theme(uuid, text, text) from public, anon;
grant execute on function public.quality_ai_resolve_customer_theme(uuid, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- La serie. Cada tema confirmado, periodo a periodo, con lo que cambió respecto
-- del periodo anterior DEL MISMO TEMA. La comparación la hace la base de datos,
-- que sabe restar; el modelo no participa.
-- ----------------------------------------------------------------------------
-- `security_invoker` NO es un detalle: sin él la vista se ejecuta con los
-- permisos de quien la creó y devuelve los temas de CUALQUIER empresa a quien
-- sepa el identificador. Con él, la RLS de las tablas de abajo sigue mandando.
create or replace view public.v_quality_ai_customer_theme_series
with (security_invoker = true) as
select
  t.organization_id,
  t.theme_key,
  t.id                as theme_id,
  t.label,
  t.summary,
  t.sentiment,
  t.status,
  t.period_start,
  t.period_end,
  t.evidence_count,
  t.run_id,
  t.provider,
  t.model,
  t.prompt_template,
  t.prompt_version,
  t.created_at,
  lag(t.sentiment) over w      as previous_sentiment,
  lag(t.evidence_count) over w as previous_evidence_count,
  lag(t.period_end) over w     as previous_period_end
from public.quality_ai_customer_themes t
-- Sin unir con las consultas: esa tabla solo la lee su autor (§119), y unirla
-- aquí escondería los temas al resto del equipo. La procedencia ya está en la
-- propia fila.
where t.status <> 'discarded'
window w as (
  partition by t.organization_id, t.theme_key
  order by t.period_start, t.period_end, t.created_at
);

comment on view public.v_quality_ai_customer_theme_series is
  'QUALITY-12.1 · La serie de un tema de clientes: cada periodo con el tono y el respaldo del periodo anterior del MISMO tema al lado, y con el modelo que lo produjo. Los descartados no cuentan.';


-- ----------------------------------------------------------------------------
-- Permisos · deny by default, y luego lo justo
-- ----------------------------------------------------------------------------
alter table public.quality_ai_customer_themes          enable row level security;
alter table public.quality_ai_customer_theme_evidence  enable row level security;

-- Los temas son trabajo compartido de la empresa —a diferencia de una consulta,
-- que es de quien la hizo—: cualquier miembro los lee. Escribirlos y resolverlos
-- pasa por las RPC.
create policy quality_ai_customer_themes_select on public.quality_ai_customer_themes
  for select to authenticated using (is_org_member(organization_id));

create policy quality_ai_customer_theme_evidence_select on public.quality_ai_customer_theme_evidence
  for select to authenticated using (is_org_member(organization_id));

revoke all on table public.quality_ai_customer_themes         from anon, authenticated;
revoke all on table public.quality_ai_customer_theme_evidence from anon, authenticated;
grant select on table public.quality_ai_customer_themes         to authenticated;
grant select on table public.quality_ai_customer_theme_evidence to authenticated;

revoke all on table public.v_quality_ai_customer_theme_series from anon, authenticated;
grant select on table public.v_quality_ai_customer_theme_series to authenticated;

-- §120 · Un tema tampoco se borra: si resultó equivocado se descarta, y queda
-- constando que se descartó y quién lo hizo.
create trigger t_quality_ai_customer_themes_no_delete
  before delete on public.quality_ai_customer_themes
  for each row execute function public.quality_ai_history_is_immutable();
