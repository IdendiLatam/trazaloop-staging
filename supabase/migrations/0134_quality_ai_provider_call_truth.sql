-- ============================================================================
-- QUALITY-12.1 · QUE SE VEA CUÁNDO NO SE LLAMÓ AL MODELO
-- ----------------------------------------------------------------------------
-- Añade. No toca la 0133, que ya está aplicada en Staging.
--
-- EL PROBLEMA QUE ARREGLA
--
-- Cuando el contexto autorizado sale vacío, el Copilot NO llama al proveedor:
-- responde «no encontré información suficiente» y se ahorra la llamada. Eso es
-- correcto y es deliberado —una consulta sin datos no se le pregunta a nadie—.
--
-- Pero la consulta quedaba guardada con `provider = 'openai'` y
-- `model = 'gpt-5.4-mini'`, y la pantalla mostraba «openai · gpt-5.4-mini» con
-- cero tokens. Quien lo lee concluye lo contrario de lo que pasó: que se le
-- preguntó a OpenAI y devolvió una respuesta vacía. La verdad es que no se le
-- preguntó.
--
-- Esto salió en la prueba humana de QUALITY-12.1: una consulta en una empresa
-- sin datos de Calidad tardó diecinueve segundos —construyendo contexto contra
-- una base remota— y mostró «openai · gpt-5.4-mini · 0 tokens». Leído así,
-- parecía un fallo de medición del consumo. No lo era: no había consumo porque
-- no hubo llamada. Pero que hiciera falta abrir la base para averiguarlo es,
-- en sí mismo, el defecto.
--
-- LO QUE NO SE HACE
--
-- No se deja de registrar el proveedor y el modelo configurados: son parte de
-- la procedencia y responden a «¿con qué habría respondido?». Lo que se añade
-- es el hecho de si se llegó a preguntar.
-- ============================================================================

alter table public.quality_ai_runs
  add column if not exists provider_called boolean not null default true;

comment on column public.quality_ai_runs.provider_called is
  'QUALITY-12.1 · Si se llegó a llamar al proveedor. Falso cuando el contexto autorizado salió vacío y se respondió sin preguntar a nadie: en ese caso el proveedor y el modelo dicen con qué se HABRIA respondido, y los tokens en cero significan que no se gasto nada.';


-- Las consultas que ya existían: se marca falso donde la firma del atajo es
-- inequívoca —cerrada con éxito, sin una sola referencia y sin un solo token—.
-- Es la única combinación que produce ese camino; cualquier llamada real deja
-- tokens, y cualquier llamada fallida deja `status` distinto de 'succeeded'.
update public.quality_ai_runs
   set provider_called = false
 where status = 'succeeded'
   and coalesce(context_items, 0) = 0
   and coalesce(input_tokens, 0) = 0
   and coalesce(output_tokens, 0) = 0;


-- El cierre pasa a decirlo. La firma anterior se retira, por lo mismo que en la
-- 0133: dos funciones con el mismo nombre y distinto número de argumentos por
-- defecto dejan la llamada ambigua.
drop function if exists public.quality_ai_complete_run(
  uuid, jsonb, text, integer, integer, integer, integer, integer, integer);

create or replace function public.quality_ai_complete_run(
  p_run_id         uuid,
  p_answer         jsonb,
  p_evidence_level text,
  p_input_tokens   integer default null,
  p_output_tokens  integer default null,
  p_tool_calls     integer default 0,
  p_cached_input_tokens integer default null,
  p_reasoning_tokens    integer default null,
  p_total_tokens        integer default null,
  p_provider_called     boolean default true
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
         tool_calls = coalesce(p_tool_calls, 0),
         provider_called = coalesce(p_provider_called, true)
   where id = p_run_id;
end;
$$;
revoke all on function public.quality_ai_complete_run(
  uuid, jsonb, text, integer, integer, integer, integer, integer, integer, boolean)
  from public, anon;
grant execute on function public.quality_ai_complete_run(
  uuid, jsonb, text, integer, integer, integer, integer, integer, integer, boolean)
  to authenticated;


-- La vista lo enseña. Se recrea entera y la columna nueva va al final.
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
  r.cached_input_tokens, r.reasoning_tokens, r.total_tokens,
  -- QUALITY-12.1 · Si se llegó a preguntar, o si se respondió sin preguntar.
  r.provider_called
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
  'QUALITY-12 · §118/§119 · El consumo y el resultado de cada consulta. La pregunta y la respuesta solo se ven si son tuyas: metadatos y contenido son permisos distintos. QUALITY-12.1 anade si se llego a llamar al proveedor.';


-- El informe de consumo distingue las consultas que costaron algo de las que
-- se respondieron sin preguntar. Sin esa separacion, «treinta consultas este
-- mes» no dice nada sobre lo que se va a facturar.
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
    -- QUALITY-12.1 · De las del mes, cuántas llegaron de verdad al proveedor.
    'provider_calls_this_month', coalesce((
      select count(*) from quality_ai_runs
       where organization_id = p_organization_id
         and started_at >= date_trunc('month', now())
         and provider_called), 0),
    'answered_without_calling', coalesce((
      select count(*) from quality_ai_runs
       where organization_id = p_organization_id
         and started_at >= date_trunc('month', now())
         and not provider_called), 0),
    'input_tokens_this_month', coalesce((
      select sum(input_tokens) from quality_ai_runs
       where organization_id = p_organization_id
         and started_at >= date_trunc('month', now())), 0),
    'output_tokens_this_month', coalesce((
      select sum(output_tokens) from quality_ai_runs
       where organization_id = p_organization_id
         and started_at >= date_trunc('month', now())), 0),
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
