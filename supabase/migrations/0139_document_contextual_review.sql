-- ============================================================================
-- Trazaloop · QUALITY-12.2D · REVISIÓN CONTEXTUAL DE DOCUMENTOS
-- ----------------------------------------------------------------------------
-- QUALITY-12.2C enseñó a mejorar un párrafo mirando SOLO el párrafo, la guía
-- de la sección y el perfil de la empresa. Deliberadamente no miraba nada más:
-- para que un texto se lea mejor no hace falta saber quién es el responsable
-- registrado.
--
-- Esto es lo otro. Aquí la pregunta no es «¿se lee bien?» sino:
--
--     LO QUE ESCRIBISTE, ¿COINCIDE CON LO QUE TRAZALOOP YA TIENE REGISTRADO?
--
-- Y esa pregunta obliga a traer hechos. La tentación evidente es reutilizar el
-- Context Pack de QUALITY-12: diecinueve adaptadores, todo el sistema de
-- gestión, 2 500 tokens y diecisiete segundos. Sería más fácil de escribir y
-- estaría mal, porque para revisar la sección «Responsables» de un
-- procedimiento no hace falta la voz del cliente ni las auditorías del año.
--
-- La guía canónica de QUALITY-12.2A ya lleva escrito, sección por sección, qué
-- tipos de contexto son pertinentes: `related_context_types`. Esa columna
-- existía desde 12.2A sin que nada la leyera y 12.2B la cerró a doce valores.
-- Esto es lo que por fin la usa: gobierna QUÉ se busca, y por tanto qué NO.
--
-- En los datos reales de hoy ninguna guía declara más de CUATRO tipos, y 183
-- de ellas no declaran ninguno. La recuperación es pequeña porque la metadata
-- dice que debe serlo, no porque se haya recortado a ojo.
--
-- LO QUE ESTA MIGRACIÓN NO HACE
--
-- No crea una tabla de hallazgos. Un hallazgo de la IA no es un registro del
-- sistema de gestión: no es una no conformidad, no abre un caso, no genera una
-- acción y no cambia el estado de nada. Vive en la pantalla de quien lo pidió
-- y muere cuando esa persona cierra el panel. Persistirlo lo convertiría, con
-- el tiempo, en algo que alguien creería.
--
-- Se registra la OPERACIÓN —quién, cuándo, con qué guía, qué tipos de contexto
-- se resolvieron, cuánto costó— porque eso es consumo y procedencia. El
-- contenido del hallazgo no.
-- ============================================================================


-- ============================================================================
-- 1 · TRES FUENTES QUE FALTABAN EN EL CATÁLOGO
-- ----------------------------------------------------------------------------
-- `quality_ai_add_reference` se niega a citar una fuente que no esté en
-- `quality_ai_sources`, y eso está bien: es lo que impide que aparezca una
-- procedencia inventada. Pero el catálogo se escribió para el Copilot, y el
-- Copilot nunca citó un cargo.
--
-- `position` es la más importante de las tres. Para hablar de
-- responsabilidades hay que nombrar a alguien, y Trazaloop tiene dos formas de
-- hacerlo: la PERSONA y el CARGO. Se cita el cargo. Un procedimiento dice
-- «el Coordinador de Compras aprueba», no «Marta aprueba»: el cargo sobrevive
-- a quien lo ocupa, y además no es un dato personal que haya que enviar a un
-- tercero.
-- ============================================================================

insert into public.quality_ai_sources
  (code, label, domain, entity_type, privacy_class, historical_mode,
   permission_note, deep_link, position_order)
values
  ('position', 'Cargos', 'people', 'quality_position', 'open', 'as_of',
   'Se cita el CARGO, nunca la persona que lo ocupa. Position != Person != User.',
   '/quality/people/positions', 21),
  ('evidence', 'Evidencias', 'documents', 'evidence', 'open', 'current',
   'Solo identidad y tipo. Ni el responsable, ni la ruta del archivo, ni el custodio.',
   '/quality/evidences', 22),
  ('organization_profile', 'Perfil de la empresa', 'organization', 'organization',
   'open', 'current',
   'A que se dedica la empresa, declarado por ella misma en QUALITY-12.2B.',
   '/settings/organization', 23)
on conflict (code) do nothing;


-- ============================================================================
-- 2 · QUÉ CONTEXTO SE RESOLVIÓ, Y CUÁNTAS PREGUNTAS COSTÓ
-- ----------------------------------------------------------------------------
-- Dos columnas que existen para que el presupuesto sea observable en
-- producción y no solo en una prueba.
--
-- `related_context_types` guarda los tipos que la guía declaró y que de verdad
-- se resolvieron. Sirve para responder, dentro de seis meses, a la pregunta
-- que de verdad importa: ¿esta capacidad se mantuvo pequeña?
--
-- `context_queries` cuenta las consultas a la base. Un día alguien declarará
-- seis tipos en una guía y esto lo dirá sin que haya que deducirlo del tiempo
-- de respuesta.
-- ============================================================================

alter table public.quality_ai_runs
  add column if not exists related_context_types text[],
  add column if not exists context_queries integer;

comment on column public.quality_ai_runs.related_context_types is
  'QUALITY-12.2D · Los tipos de contexto que la guia canonica declaro pertinentes y que se resolvieron de verdad. No es lo que se podria haber traido: es lo que se trajo.';
comment on column public.quality_ai_runs.context_queries is
  'QUALITY-12.2D · Cuantas consultas a la base costo armar el contexto. El Copilot hacia 19; esto deberia hacer entre 1 y 6.';


-- ============================================================================
-- 3 · ABRIR UNA REVISIÓN CONTEXTUAL
-- ----------------------------------------------------------------------------
-- Es hermana de `document_authoring_start_run` y comprueba exactamente lo
-- mismo, en el mismo orden y por las mismas razones:
--
--   1 · pertenencia a la empresa;
--   2 · que el documento es de esa empresa Y de ese módulo — el módulo se LEE
--       del documento, el de la petición solo tiene que coincidir;
--   3 · que el módulo comercial está en Full o Extra;
--   4 · el tope diario de seguridad.
--
-- POR QUÉ ES UNA FUNCIÓN APARTE Y NO UN PARÁMETRO DE LA DE 12.2C
--
-- Porque el tope diario tiene que ser SUYO. Si compartieran contador, cien
-- mejoras de redacción por la mañana dejarían sin revisión contextual toda la
-- tarde, y son dos cosas que ni cuestan lo mismo ni se usan igual. Compartir
-- el contador habría sido más corto de escribir y peor de explicar.
--
-- Y porque `action` no significa lo mismo aquí. En 12.2C dice qué clase de
-- reescritura se pidió; aquí no hay reescritura que pedir. Se deja en nulo en
-- vez de inventarle un valor que ensucie la lista cerrada de 0138.
-- ============================================================================

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

  if v_doc.module_key is distinct from p_module_key then
    return jsonb_build_object('allowed', false, 'reason', 'module_mismatch',
      'message', 'Ese documento no pertenece al módulo indicado.');
  end if;

  -- PCR es `cpr` en los documentos y `traceability_6632` en el catálogo
  -- comercial. Son dos vocabularios distintos y confundirlos ya costó un
  -- defecto en QUALITY-12.2A.
  v_acceso := resolve_organization_module_access(
    p_organization_id,
    case p_module_key when 'cpr' then 'traceability_6632' else p_module_key end);

  if not coalesce((v_acceso ->> 'allowed')::boolean, false) then
    return jsonb_build_object('allowed', false, 'reason', 'module_denied',
      'message', 'Tu empresa no tiene acceso a este módulo.');
  end if;

  -- Demo no. La guía de autoría no se entrega en Demo desde QUALITY-12.2A, y
  -- una revisión contextual que la usa no puede ser la puerta de atrás para
  -- leerla. Tampoco lo es para los hechos: en Demo no se resuelve contexto.
  if (v_acceso ->> 'access_mode') not in ('full', 'extra') then
    return jsonb_build_object('allowed', false, 'reason', 'demo',
      'message', 'La revisión contra Trazaloop está disponible en los planes Full y Extra.');
  end if;

  -- Un tope de seguridad, no una cuota comercial: las cuotas son de
  -- QUALITY-12.2F. Es más bajo que el de redacción porque cada revisión
  -- cuesta más y se usa menos veces por sección.
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

  return jsonb_build_object('allowed', true, 'run_id', v_run);
end;
$$;
revoke all on function public.document_review_start_run(
  uuid, uuid, text, text, text, text, text, integer, uuid, text[], integer, integer)
  from public, anon;
grant execute on function public.document_review_start_run(
  uuid, uuid, text, text, text, text, text, integer, uuid, text[], integer, integer)
  to authenticated;

comment on function public.document_review_start_run(
  uuid, uuid, text, text, text, text, text, integer, uuid, text[], integer, integer) is
  'QUALITY-12.2D · Abre una revision contextual de una seccion. El permiso lo da el MODULO DEL DOCUMENTO, nunca Quality. Tope diario propio: no comparte contador con la asistencia de redaccion.';


-- ============================================================================
-- 3.bis · APUNTAR QUÉ CONTEXTO SE RESOLVIÓ
-- ----------------------------------------------------------------------------
-- Hace falta una función y no vale un `update` desde el servidor, aunque lo
-- parezca. `quality_ai_runs` tiene UNA política y es de lectura: un `update`
-- con la sesión de quien pregunta no da error, simplemente no toca ninguna
-- fila. Eso es lo peligroso —un fallo que no se queja—, y así estuvo hasta que
-- una prueba fue a leer la columna y la encontró vacía.
--
-- Los tipos y las consultas no se saben al abrir la operación: se conocen
-- después de enrutar, y enrutar exige haber comprobado antes el permiso. De
-- ahí que sean dos pasos y no uno.
--
-- Solo puede escribir quien abrió la operación, y solo mientras siga abierta.
-- ============================================================================

create or replace function public.document_review_record_context(
  p_run_id  uuid,
  p_types   text[],
  p_queries integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_run record;
begin
  select * into v_run from quality_ai_runs where id = p_run_id;
  if v_run.id is null then
    raise exception 'Esa revisión no existe.';
  end if;
  if v_run.actor_id <> auth.uid() and auth.uid() is not null then
    raise exception 'No puedes escribir en la revisión de otra persona.';
  end if;
  if v_run.use_case <> 'document.contextual_review' then
    raise exception 'Esa operación no es una revisión contextual.';
  end if;
  if v_run.status <> 'running' then
    raise exception 'Esa revisión ya está cerrada.';
  end if;

  update quality_ai_runs
     set related_context_types = p_types,
         context_queries = p_queries
   where id = p_run_id;
end;
$$;
revoke all on function public.document_review_record_context(uuid, text[], integer)
  from public, anon;
grant execute on function public.document_review_record_context(uuid, text[], integer)
  to authenticated;

comment on function public.document_review_record_context(uuid, text[], integer) is
  'QUALITY-12.2D · Apunta que tipos de contexto se resolvieron y cuantas consultas costo. Solo quien abrio la revision, y solo mientras siga abierta.';


-- ============================================================================
-- 4 · LO QUE SE VE DESPUÉS
-- ----------------------------------------------------------------------------
-- Metadatos y consumo. Sin el texto de la persona y sin los hallazgos: la
-- regla de siempre —§119 de QUALITY-12— es que eso solo lo ve quien lo pidió.
--
-- `security_invoker` no es un adorno. Una vista sin él lee con los permisos de
-- quien la creó, y en QUALITY-12.1 esa omisión estuvo a punto de enseñar los
-- temas de una empresa a otra. La atrapó una prueba; aquí va desde el primer
-- día.
-- ============================================================================

create or replace view public.v_document_review_usage
with (security_invoker = true) as
select
  r.organization_id,
  r.id            as run_id,
  r.actor_id,
  (r.actor_id = auth.uid()) as is_mine,
  r.module_key, r.document_id, r.section_key,
  r.guidance_revision_id, r.related_context_types, r.context_queries,
  r.context_items,
  r.provider, r.model, r.prompt_template, r.prompt_version, r.provider_called,
  r.status, r.started_at, r.completed_at, r.latency_ms,
  r.input_tokens, r.cached_input_tokens, r.output_tokens,
  r.reasoning_tokens, r.total_tokens,
  r.error_message
from public.quality_ai_runs r
where r.use_case = 'document.contextual_review';

revoke all on public.v_document_review_usage from anon, authenticated;
grant select on public.v_document_review_usage to authenticated;

comment on view public.v_document_review_usage is
  'QUALITY-12.2D · Consumo y procedencia de las revisiones contextuales, separado del Copilot y de la asistencia de redaccion. Sin el texto ni los hallazgos.';
