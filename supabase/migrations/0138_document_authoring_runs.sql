-- ============================================================================
-- QUALITY-12.2C · LA ASISTENCIA DE REDACCIÓN, REGISTRADA Y TRANSVERSAL
-- ----------------------------------------------------------------------------
-- Añade. No toca la 0137 ni ninguna anterior.
--
-- POR QUÉ HACE FALTA UNA PUERTA NUEVA
--
-- `quality_ai_runs` sirve para registrar esto: es el diario de lo que la IA
-- hizo, con su proveedor, su modelo, su versión de instrucciones y su consumo.
-- Reutilizarlo permite además comparar el Copilot global con la asistencia
-- documental, que es justo lo que hará falta para decidir cuotas.
--
-- Lo que NO sirve es su puerta de entrada. `quality_ai_start_run` comprueba
-- `quality_ai_enabled`, que lee `quality_ai_settings` —una tabla de QUALITY—.
-- Una empresa con PCR en Full y sin Quality no tiene esa fila, y no debería
-- necesitarla para que alguien mejore la redacción de un procedimiento de PCR.
--
-- Atar la asistencia documental al interruptor de Quality sería el mismo error
-- que QUALITY-12.2A encontró con los dos vocabularios de módulo: una capa
-- transversal comprobando el permiso equivocado.
--
-- LA REGLA, ENTONCES
--
--   El permiso lo da el MÓDULO DEL DOCUMENTO.
--
-- PCR Full → se puede en PCR. Textiles Full → se puede en Textiles. Quality
-- Full → se puede en Quality. Y en Demo, no: la guía de autoría no se entrega
-- en Demo (QUALITY-12.2A), y la asistencia no puede ser la puerta de atrás
-- para obtenerla.
-- ============================================================================


-- ============================================================================
-- 1 · DE QUÉ DOCUMENTO SE HABLA
-- ----------------------------------------------------------------------------
-- El diario ya sabía QUÉ se preguntó y con qué modelo. Ahora tiene que saber
-- SOBRE QUÉ se preguntó: sin eso no se puede explicar dentro de un año por qué
-- un párrafo quedó como quedó, que es exactamente lo que QUALITY-12 exige del
-- resto de la historia de la IA.
-- ============================================================================

alter table public.quality_ai_runs
  add column if not exists module_key text,
  add column if not exists document_id uuid,
  add column if not exists section_key text,
  add column if not exists guidance_revision_id uuid
    references public.trazadoc_authoring_guidance_revisions (id),
  add column if not exists action text;

comment on column public.quality_ai_runs.module_key is
  'QUALITY-12.2C · El modulo COMERCIAL del documento sobre el que se pidio ayuda. Es el que decide el permiso: la asistencia documental no depende de Quality.';
comment on column public.quality_ai_runs.guidance_revision_id is
  'QUALITY-12.2C · Con QUE revision de la guia de autoria se redacto. Cambiar la guia manana no reescribe lo que se sugirio hoy.';
comment on column public.quality_ai_runs.action is
  'QUALITY-12.2C · Que se pidio: mejorar, aclarar, formalizar, sintetizar, revisar con la guia o proponer otra version. Lista cerrada en el codigo y comprobada aqui.';

alter table public.quality_ai_runs
  add constraint quality_ai_runs_action_check
  check (action is null or action in (
    'improve_writing', 'clarify', 'formalize', 'shorten',
    'review_against_guidance', 'alternative_wording'));

create index if not exists quality_ai_runs_document_idx
  on public.quality_ai_runs (organization_id, document_id, started_at desc);
create index if not exists quality_ai_runs_use_case_idx
  on public.quality_ai_runs (organization_id, use_case, started_at desc);


-- ============================================================================
-- 2 · ABRIR UNA OPERACIÓN DE REDACCIÓN
-- ----------------------------------------------------------------------------
-- Comprueba, EN ESTE ORDEN y antes de que exista una llamada al proveedor:
--
--   1 · que quien pide pertenece a la empresa;
--   2 · que el documento es de esa empresa y de ese módulo — no se acepta un
--       módulo dicho por el cliente sobre un documento de otro;
--   3 · que el módulo está en Full o Extra;
--   4 · que no se ha pasado del tope diario.
--
-- El punto 2 importa más de lo que parece: sin él bastaría con declarar
-- «textiles» sobre un documento de Quality para que se comprobara el plan
-- equivocado. El módulo se LEE del documento; el que llega en la petición solo
-- se usa para comprobar que coinciden.
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
begin
  if not is_org_member(p_organization_id) then
    return jsonb_build_object('allowed', false, 'reason', 'not_member',
      'message', 'No perteneces a esta empresa.');
  end if;

  select d.id, d.module_key, d.status
    into v_doc
    from trazadoc_documents d
   where d.id = p_document_id and d.organization_id = p_organization_id;

  if v_doc.id is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_found',
      'message', 'Ese documento no existe o no pertenece a tu empresa.');
  end if;

  -- El módulo del DOCUMENTO manda. El de la petición solo tiene que coincidir.
  if v_doc.module_key is distinct from p_module_key then
    return jsonb_build_object('allowed', false, 'reason', 'module_mismatch',
      'message', 'Ese documento no pertenece al módulo indicado.');
  end if;

  -- El código comercial no siempre se llama igual que el módulo documental:
  -- PCR es `cpr` en los documentos y `traceability_6632` en el catálogo
  -- comercial. Traducir aquí evita repetir el fallo de QUALITY-12.2A.
  v_acceso := resolve_organization_module_access(
    p_organization_id,
    case p_module_key when 'cpr' then 'traceability_6632' else p_module_key end);

  if not coalesce((v_acceso ->> 'allowed')::boolean, false) then
    return jsonb_build_object('allowed', false, 'reason', 'module_denied',
      'message', 'Tu empresa no tiene acceso a este módulo.');
  end if;

  -- Demo no: la guía de autoría no se entrega en Demo (QUALITY-12.2A), y la
  -- asistencia de redacción no puede ser la puerta de atrás para obtenerla.
  if (v_acceso ->> 'access_mode') not in ('full', 'extra') then
    return jsonb_build_object('allowed', false, 'reason', 'demo',
      'message', 'La asistencia de redacción está disponible en los planes Full y Extra.');
  end if;

  -- Un tope de seguridad, no una cuota comercial: las cuotas son de
  -- QUALITY-12.2F. Esto solo evita que un bucle accidental gaste sin freno.
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

  insert into quality_ai_runs (
    organization_id, actor_id, use_case, provider, model,
    prompt_template, prompt_version, status,
    module_key, document_id, section_key, action, guidance_revision_id)
  values (
    p_organization_id, auth.uid(), 'document.quick_edit', p_provider, p_model,
    p_prompt_template, p_prompt_version, 'running',
    p_module_key, p_document_id, p_section_key, p_action, p_guidance_revision_id)
  returning id into v_run;

  return jsonb_build_object('allowed', true, 'run_id', v_run);
end;
$$;
revoke all on function public.document_authoring_start_run(
  uuid, uuid, text, text, text, text, text, text, integer, uuid, integer) from public, anon;
grant execute on function public.document_authoring_start_run(
  uuid, uuid, text, text, text, text, text, text, integer, uuid, integer) to authenticated;

comment on function public.document_authoring_start_run(
  uuid, uuid, text, text, text, text, text, text, integer, uuid, integer) is
  'QUALITY-12.2C · Abre una operacion de asistencia de redaccion. El permiso lo da el MODULO DEL DOCUMENTO, nunca Quality: una empresa con PCR en Full no necesita Quality para que alguien mejore un parrafo de un procedimiento de PCR.';


-- ============================================================================
-- 3 · LO QUE SE VE DESPUÉS
-- ----------------------------------------------------------------------------
-- Metadatos y consumo, sin el texto. El texto del usuario y la propuesta se
-- guardan en las columnas que ya existían y con la misma regla de siempre:
-- solo los ve quien los pidió (§119 de QUALITY-12).
-- ============================================================================

create or replace view public.v_document_authoring_usage
with (security_invoker = true) as
select
  r.organization_id,
  r.id            as run_id,
  r.actor_id,
  (r.actor_id = auth.uid()) as is_mine,
  r.module_key, r.document_id, r.section_key, r.action,
  r.guidance_revision_id,
  r.provider, r.model, r.prompt_template, r.prompt_version, r.provider_called,
  r.status, r.started_at, r.completed_at, r.latency_ms,
  r.input_tokens, r.cached_input_tokens, r.output_tokens,
  r.reasoning_tokens, r.total_tokens,
  r.error_message
from public.quality_ai_runs r
where r.use_case = 'document.quick_edit';

revoke all on public.v_document_authoring_usage from anon, authenticated;
grant select on public.v_document_authoring_usage to authenticated;

comment on view public.v_document_authoring_usage is
  'QUALITY-12.2C · El consumo de la asistencia de redaccion, separado del Copilot global para poder compararlos. Sin el texto: eso solo lo ve quien lo pidio.';
