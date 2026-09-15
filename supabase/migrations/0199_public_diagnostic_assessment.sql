-- =============================================================================
-- Trazaloop · PUBLIC-DIAGNOSTICS-01F · Responder el instrumento sin cuenta
-- =============================================================================
--
-- 0198 abrió la puerta: alguien puede identificarse y empezar. Aquí se le
-- entrega el instrumento, se le guarda el avance y se cierra su participación.
--
--
-- EL INSTRUMENTO SALE DE LA PARTICIPACIÓN, NO DE «LA VERSIÓN VIGENTE»
--
-- Todo lo que sigue lee `submission.diagnostic_version_id`. Ni una sola
-- consulta pregunta cuál es la versión publicada hoy. Si se publicara una PCR
-- v2 mientras alguien va por la pregunta 30, seguiría viendo —y se puntuaría
-- con— la v1 con la que empezó. Mezclar dos instrumentos en un resultado no
-- falla: calcula mal, y nadie se entera.
--
--
-- QUIÉN PUEDE ESCRIBIR EL RESULTADO
--
-- Esta es la decisión de diseño del tramo. El resultado lo calcula
-- `computeDiagnosticResult` en TypeScript —el MISMO motor que usa el
-- diagnóstico autenticado, sin clon en SQL— y por tanto llega a la base como
-- un dato ya calculado. Si la función que lo escribe fuera ejecutable por
-- `anon`, cualquiera podría declararse «candidato a auditoría» con una
-- llamada: el motor estaría en el servidor pero la AUTORIDAD estaría en el
-- navegador.
--
-- Por eso `public_diagnostic_finalize_submission` NO se concede a `anon` ni a
-- `authenticated`: solo a `service_role`, el rol que únicamente existe detrás
-- del servidor (`lib/supabase/admin.ts`, que importa "server-only"). Es el
-- mismo patrón con el que 0101 protegió `register_storage_orphan` y 0190 la
-- liquidación manual de pagos.
--
-- Y aun así la función no se fía de lo que le llega: comprueba que la
-- participación esté completa CONTANDO las preguntas de su versión, valida
-- rangos y niveles, y rechaza una instantánea que contenga el correo o el
-- teléfono de quien respondió.
--
--
-- LA VENTANA DE ESCRITURA
--
-- Empezar después del cierre no se puede (0198). Terminar, sí: bloquear en la
-- pregunta 51 a alguien que empezó dentro de la ventana es una mala regla, y
-- una convocatoria de cámara se responde en varios ratos. La regla, fija y
-- documentada:
--
--     puede escribir  ⟺  la participación sigue en curso
--                     y  la campaña no está archivada
--                     y  now() <= closes_at + 72 h   (si hay cierre)
--                     y  now() <= started_at + 30 días
--
-- Los dos topes son necesarios y distintos: el primero cierra el ESTUDIO, el
-- segundo caduca el TESTIGO. Sin el segundo, una campaña sin fecha de cierre
-- dejaría un testigo de participación válido para siempre.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Más cubos para el límite de tasa
-- -----------------------------------------------------------------------------
-- Guardar seis secciones NO puede consumir el mismo cupo que empezar: son 3
-- intentos en 24 h, y un diligenciamiento normal los agotaría antes de la
-- segunda sección. Cada verbo tiene su cubo y su ventana.

alter table public.public_intake_attempts
  drop constraint if exists public_intake_attempts_kind_check;
alter table public.public_intake_attempts
  add constraint public_intake_attempts_kind_check
  check (bucket_kind in ('ip', 'email', 'campaign', 'read', 'save', 'complete'));

comment on column public.public_intake_attempts.bucket_kind is
  '0199 · Verbo al que se aplica la ventana. begin usa ip/email/campaign; '
  'read/save/complete se cuentan POR PARTICIPACIÓN, que ya es un identificador '
  'opaco.';

-- -----------------------------------------------------------------------------
-- 2 · Ayudantes internos
-- -----------------------------------------------------------------------------

/**
 * ¿Puede esta participación seguir escribiendo?
 *
 * Devuelve 'ok' o el MOTIVO. Un solo sitio donde vive la regla de la ventana:
 * guardar y cerrar tienen que decidir exactamente igual, y si cada una lo
 * calculara por su cuenta acabarían divergiendo.
 */
create or replace function public.public_intake_write_window(p_submission uuid)
returns text
language plpgsql stable security definer set search_path to 'public'
as $$
declare s record;
begin
  select sub.status, sub.started_at, c.status as campaign_status, c.closes_at
    into s
    from public.public_diagnostic_submissions sub
    join public.public_diagnostic_campaigns c on c.id = sub.campaign_id
   where sub.id = p_submission;

  if s.status is null then return 'not_found'; end if;
  -- Completada o abandonada: se dice cuál, porque quien pregunta ya tiene el
  -- testigo de ESTA participación. No hay nada que enumerar.
  if s.status <> 'in_progress' then return s.status; end if;
  if s.campaign_status = 'archived' then return 'campaign'; end if;
  if s.closes_at is not null and now() > s.closes_at + interval '72 hours' then
    return 'window';
  end if;
  if now() > s.started_at + interval '30 days' then return 'expired'; end if;
  return 'ok';
end $$;

revoke all on function public.public_intake_write_window(uuid)
  from public, anon, authenticated;

/**
 * Ventana deslizante POR PARTICIPACIÓN.
 *
 * La clave es el identificador de la participación: no hace falta
 * pseudonimizar nada porque un uuid no dice quién es nadie, y quien llega
 * hasta aquí ya demostró tener el testigo.
 *
 * Purga de paso lo viejo de su propio cubo: sin esto la tabla crece para
 * siempre y nadie se acuerda de limpiarla.
 */
create or replace function public.public_intake_token_rate_ok(
  p_kind text, p_campaign uuid, p_submission uuid, p_max integer, p_window interval
) returns boolean
language plpgsql security definer set search_path to 'public'
as $$
declare v_n int; v_key text;
begin
  v_key := p_submission::text;
  delete from public.public_intake_attempts
   where bucket_kind = p_kind and bucket_key = v_key
     and occurred_at < now() - interval '30 days';

  select count(*) into v_n from public.public_intake_attempts
   where bucket_kind = p_kind and bucket_key = v_key
     and occurred_at > now() - p_window;
  if v_n >= p_max then return false; end if;

  insert into public.public_intake_attempts (campaign_id, bucket_kind, bucket_key)
  values (p_campaign, p_kind, v_key);
  return true;
end $$;

revoke all on function public.public_intake_token_rate_ok(text, uuid, uuid, integer, interval)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3 · Leer el instrumento · lo que se puede pintar y nada más
-- -----------------------------------------------------------------------------
--
-- LO QUE ESTA FUNCIÓN NO DEVUELVE, Y POR QUÉ
--
--   · `weight`              — decir cuánto pesa cada pregunta es enseñar a
--                             optimizar el resultado sin cambiar la empresa.
--   · `is_critical`         — lo mismo, y peor: señala exactamente dónde mentir.
--   · `recommended_action`  — es el entregable; llega DESPUÉS, desde el
--                             resultado, y solo para las brechas reales.
--   · `scoring_config`      — los umbrales enteros. Solo sale de ahí el tipo de
--                             respuesta, que hace falta para pintar el control.
--   · identificadores y fechas internas, y por supuesto cualquier otra
--     participación.

create or replace function public.public_diagnostic_get_assessment(p_token text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  s record; v_secciones jsonb; v_total int; v_respondidas int;
  v_secciones_ok int; v_primera text; v_ventana text;
begin
  if p_token is null or length(p_token) <> 64 then
    return jsonb_build_object('status', 'not_found');
  end if;

  select sub.id, sub.status, sub.campaign_id, sub.diagnostic_version_id,
         c.slug, coalesce(c.public_title, c.name) as titulo, c.partner_name,
         v.scoring_config
    into s
    from public.public_diagnostic_submissions sub
    join public.public_diagnostic_campaigns c on c.id = sub.campaign_id
    join public.diagnostic_versions v on v.id = sub.diagnostic_version_id
   where sub.resume_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if s.id is null then return jsonb_build_object('status', 'not_found'); end if;

  if not public.public_intake_token_rate_ok(
       'read', s.campaign_id, s.id, 600, interval '1 hour') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select coalesce(jsonb_agg(t.sec order by t.ord), '[]'::jsonb) into v_secciones
  from (
    select sec.order_index as ord,
           jsonb_build_object(
             'code', sec.code,
             'title', sec.title,
             'description', sec.description,
             'order', sec.order_index,
             'total', coalesce(qs.total, 0),
             'answered', coalesce(qs.respondidas, 0),
             'questions', coalesce(qs.preguntas, '[]'::jsonb)
           ) as sec
      from public.diagnostic_sections sec
      left join lateral (
        select jsonb_agg(jsonb_build_object(
                 'id', q.id,
                 'code', q.code,
                 'text', q.question_text,
                 'help', q.help_text,
                 'refs', to_jsonb(coalesce(q.standard_refs, array[]::text[])),
                 'order', q.order_index,
                 'answer', a.answer,
                 'observations', a.observations
               ) order by q.order_index) as preguntas,
               count(*) as total,
               count(a.question_id) as respondidas
          from public.diagnostic_questions q
          left join public.public_diagnostic_answers a
                 on a.submission_id = s.id and a.question_id = q.id
         where q.section_id = sec.id and q.is_active
      ) qs on true
     where sec.version_id = s.diagnostic_version_id
  ) t;

  select count(*) into v_total from public.diagnostic_questions
   where version_id = s.diagnostic_version_id and is_active;
  select count(*) into v_respondidas
    from public.public_diagnostic_answers a
    join public.diagnostic_questions q on q.id = a.question_id
   where a.submission_id = s.id
     and q.version_id = s.diagnostic_version_id and q.is_active;

  -- El progreso sale del DATO, no de por dónde dice el navegador que va.
  select count(*) into v_secciones_ok
    from jsonb_array_elements(v_secciones) e
   where (e->>'total')::int > 0 and (e->>'answered')::int >= (e->>'total')::int;
  select e->>'code' into v_primera
    from jsonb_array_elements(v_secciones) e
   where (e->>'answered')::int < (e->>'total')::int
   order by (e->>'order')::int limit 1;

  v_ventana := public.public_intake_write_window(s.id);

  return jsonb_build_object(
    'status', 'found',
    'submission_status', s.status,
    'slug', s.slug,
    'public_title', s.titulo,
    'partner_name', s.partner_name,
    'writable', v_ventana = 'ok',
    'locked_reason', case when v_ventana = 'ok' then null else v_ventana end,
    -- Único dato del perfil de puntuación que sale: qué control pintar.
    'answer_type', coalesce(s.scoring_config->>'answer_type', 'yes_no'),
    'sections', v_secciones,
    'progress', jsonb_build_object(
      'answered', v_respondidas, 'total', v_total,
      'sections_complete', v_secciones_ok,
      'sections_total', jsonb_array_length(v_secciones)),
    'first_incomplete_section', v_primera);
end $$;

-- -----------------------------------------------------------------------------
-- 4 · Guardar una sección · en bloque, no pregunta a pregunta
-- -----------------------------------------------------------------------------
-- 52 escrituras sueltas por diagnóstico serían 26 000 llamadas en una
-- convocatoria de 500 empresas. Se guarda una sección entera al pulsar
-- «Guardar y continuar»: un viaje, una transacción.

create or replace function public.public_diagnostic_save_progress(
  p_token text, p_section_code text, p_answers jsonb
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  s record; v_seccion uuid; v_cupo int; v_ventana text;
  v_total int; v_respondidas int;
begin
  -- El TESTIGO se juzga aparte de la carga: un testigo con mala forma responde
  -- lo mismo que uno que no existe. Distinguirlos no protege de nada y de paso
  -- confundiría a quien depura —«inválido» sonaría a datos mal enviados—.
  if p_token is null or length(p_token) <> 64 then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_section_code is null or length(p_section_code) > 80
     or p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select sub.id, sub.campaign_id, sub.diagnostic_version_id
    into s
    from public.public_diagnostic_submissions sub
   where sub.resume_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if s.id is null then return jsonb_build_object('status', 'not_found'); end if;

  v_ventana := public.public_intake_write_window(s.id);
  if v_ventana <> 'ok' then
    return jsonb_build_object('status', 'locked', 'reason', v_ventana);
  end if;

  -- La sección se resuelve DENTRO de la versión de esta participación.
  select id into v_seccion from public.diagnostic_sections
   where version_id = s.diagnostic_version_id and code = p_section_code;
  if v_seccion is null then return jsonb_build_object('status', 'invalid'); end if;

  select count(*) into v_cupo from public.diagnostic_questions
   where section_id = v_seccion and is_active;
  -- Tope de carga: como mucho, las preguntas que esa sección tiene.
  if jsonb_array_length(p_answers) = 0 or jsonb_array_length(p_answers) > v_cupo then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Forma de cada elemento ANTES de convertir nada: un uuid mal escrito
  -- reventaría la función entera en lugar de responder.
  if exists (
    select 1 from jsonb_array_elements(p_answers) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e->>'question_id', '') !~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        -- Ni null ni ausente: «sin responder» NO es «No». Quien no ha
        -- contestado simplemente no viaja en el lote.
        or coalesce(e->>'answer', '') not in ('true', 'false')
        or length(coalesce(e->>'observations', '')) > 1000
  ) then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Sin repetidos: un ON CONFLICT no puede tocar dos veces la misma fila.
  if (select count(distinct e->>'question_id') from jsonb_array_elements(p_answers) e)
     <> jsonb_array_length(p_answers) then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Cada pregunta es de ESTA versión y de ESTA sección. El disparador de 0196
  -- lo vuelve a comprobar; esto responde en vez de reventar.
  if exists (
    select 1 from jsonb_array_elements(p_answers) e
     where not exists (
       select 1 from public.diagnostic_questions q
        where q.id = (e->>'question_id')::uuid
          and q.version_id = s.diagnostic_version_id
          and q.section_id = v_seccion
          and q.is_active)
  ) then
    return jsonb_build_object('status', 'invalid');
  end if;

  if not public.public_intake_token_rate_ok(
       'save', s.campaign_id, s.id, 120, interval '1 hour') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  insert into public.public_diagnostic_answers
    (submission_id, question_id, answer, observations)
  select s.id, (e->>'question_id')::uuid, (e->>'answer')::boolean,
         -- Texto llano, recortado y opcional. Vacío es NULL, no cadena vacía.
         nullif(btrim(coalesce(e->>'observations', '')), '')
    from jsonb_array_elements(p_answers) e
  on conflict (submission_id, question_id) do update
    set answer = excluded.answer, observations = excluded.observations;

  select count(*) into v_total from public.diagnostic_questions
   where version_id = s.diagnostic_version_id and is_active;
  select count(*) into v_respondidas
    from public.public_diagnostic_answers a
    join public.diagnostic_questions q on q.id = a.question_id
   where a.submission_id = s.id
     and q.version_id = s.diagnostic_version_id and q.is_active;

  return jsonb_build_object('status', 'saved',
    'answered', v_respondidas, 'total', v_total);
end $$;

-- -----------------------------------------------------------------------------
-- 5 · Cerrar la participación · SOLO desde el servidor
-- -----------------------------------------------------------------------------
-- Ver la nota de cabecera. Esta es la única función del subsistema que `anon`
-- NO puede ejecutar, y es justo la que escribe el resultado.

create or replace function public.public_diagnostic_finalize_submission(
  p_token text, p_maturity numeric, p_level text, p_gaps integer,
  p_section_scores jsonb, p_result_payload jsonb
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare s record; v_ventana text; v_total int; v_respondidas int; v_filas int;
begin
  if p_token is null or length(p_token) <> 64 then
    return jsonb_build_object('status', 'not_found');
  end if;

  select sub.id, sub.status, sub.campaign_id, sub.diagnostic_version_id,
         sub.participant_email_normalized as correo,
         sub.participant_phone_normalized as telefono, c.slug
    into s
    from public.public_diagnostic_submissions sub
    join public.public_diagnostic_campaigns c on c.id = sub.campaign_id
   where sub.resume_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if s.id is null then return jsonb_build_object('status', 'not_found'); end if;

  -- IDEMPOTENTE. Dos pulsaciones del mismo botón, o dos pestañas: la segunda
  -- no reescribe nada y recibe una respuesta controlada, no un error.
  if s.status = 'completed' then
    return jsonb_build_object('status', 'already_completed',
      'submission_id', s.id, 'slug', s.slug);
  end if;

  v_ventana := public.public_intake_write_window(s.id);
  if v_ventana <> 'ok' then
    return jsonb_build_object('status', 'locked', 'reason', v_ventana);
  end if;

  -- EL NÚMERO REQUERIDO SALE DE LA VERSIÓN, no de un 52 escrito a mano: una
  -- PCR v2 con otro número de preguntas tiene que seguir cerrando bien.
  select count(*) into v_total from public.diagnostic_questions
   where version_id = s.diagnostic_version_id and is_active;
  select count(*) into v_respondidas
    from public.public_diagnostic_answers a
    join public.diagnostic_questions q on q.id = a.question_id
   where a.submission_id = s.id
     and q.version_id = s.diagnostic_version_id and q.is_active;
  if v_total = 0 or v_respondidas <> v_total then
    return jsonb_build_object('status', 'incomplete',
      'answered', v_respondidas, 'total', v_total);
  end if;

  if p_level is null
     or p_level not in ('low', 'medium', 'high', 'audit_ready_candidate')
     or p_maturity is null or p_maturity < 0 or p_maturity > 100
     or p_gaps is null or p_gaps < 0 or p_gaps > v_total
     or p_section_scores is null or jsonb_typeof(p_section_scores) <> 'object'
     or p_result_payload is null or jsonb_typeof(p_result_payload) <> 'object'
     or length(p_result_payload::text) > 100000 then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- La instantánea es de PRESENTACIÓN: ahí no entra quién respondió. Si algún
  -- día alguien mete el correo o el teléfono en el payload, esto lo para
  -- antes de que se convierta en la tabla que nadie limpia.
  if position(s.correo in lower(p_result_payload::text)) > 0
     or (s.telefono is not null and length(s.telefono) >= 7
         and position(s.telefono in p_result_payload::text) > 0) then
    return jsonb_build_object('status', 'invalid', 'reason', 'pii_in_snapshot');
  end if;

  if not public.public_intake_token_rate_ok(
       'complete', s.campaign_id, s.id, 10, interval '1 hour') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- ATÓMICO. Las seis cosas se congelan en la MISMA sentencia, y el filtro por
  -- `in_progress` es el que decide la carrera: si dos peticiones llegan a la
  -- vez, la segunda encuentra cero filas y lee el resultado de la primera.
  -- No puede quedar «completada sin resultado» ni «resultado sin completar».
  update public.public_diagnostic_submissions
     set status = 'completed',
         completed_at = now(),
         maturity_percent = p_maturity,
         readiness_level = p_level,
         critical_gaps = p_gaps,
         section_scores = p_section_scores,
         result_payload = p_result_payload
   where id = s.id and status = 'in_progress';
  get diagnostics v_filas = row_count;

  if v_filas = 0 then
    select status into v_ventana from public.public_diagnostic_submissions
     where id = s.id;
    if v_ventana = 'completed' then
      return jsonb_build_object('status', 'already_completed',
        'submission_id', s.id, 'slug', s.slug);
    end if;
    return jsonb_build_object('status', 'locked',
      'reason', coalesce(v_ventana, 'unknown'));
  end if;

  return jsonb_build_object('status', 'completed',
    'submission_id', s.id, 'slug', s.slug);
end $$;

-- -----------------------------------------------------------------------------
-- 6 · Una respuesta de participación cerrada tampoco se BORRA
-- -----------------------------------------------------------------------------
-- 0196 impide insertarla y modificarla. Faltaba el borrado: sin esta guarda se
-- podría vaciar el diligenciamiento de un resultado ya entregado y dejar un
-- porcentaje que no se puede reconstruir.

create or replace function public.public_answer_delete_guard()
returns trigger language plpgsql set search_path to 'public'
as $$
declare v_status text;
begin
  select status into v_status from public.public_diagnostic_submissions
   where id = old.submission_id;
  -- Solo 'completed'. Una participación en curso o abandonada sí se puede
  -- retirar, y su borrado en cascada tiene que poder pasar por aquí.
  if v_status = 'completed' then
    raise exception 'ANSWER_SUBMISSION_NOT_EDITABLE'
      using detail = 'completed',
            hint = 'Las respuestas de una participación cerrada son historia.';
  end if;
  return old;
end $$;

drop trigger if exists t_public_answer_delete on public.public_diagnostic_answers;
create trigger t_public_answer_delete
  before delete on public.public_diagnostic_answers
  for each row execute function public.public_answer_delete_guard();

revoke all on function public.public_answer_delete_guard() from public, anon;

-- -----------------------------------------------------------------------------
-- 7 · La vida del testigo la decide la BASE
-- -----------------------------------------------------------------------------
-- `begin_submission` pasa a devolver cuántos segundos debe durar la cookie de
-- continuidad. Se calcula aquí y no en la aplicación porque es la MISMA regla
-- que gobierna la ventana de escritura: si vivieran en dos sitios, un día la
-- cookie caducaría antes de que la persona pudiera terminar.
--
--     vida = min(30 días, tiempo hasta closes_at + 72 h de gracia)
--
-- La cookie dura exactamente lo que dura el permiso para escribir, ni un
-- minuto más. Y esto NO sustituye la reanudación entre dispositivos: para eso
-- haría falta correo transaccional, que este proyecto todavía no tiene.

create or replace function public.public_diagnostic_begin_submission(
  p_slug text, p_name text, p_email text, p_phone text, p_company text,
  p_marketing boolean, p_ip text, p_nonce text
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  c record; d record; v_email text; v_huella_ip text; v_huella_mail text;
  v_token text; v_id uuid; v_existe record; v_vida integer;
begin
  -- Topes de carga ANTES de tocar nada.
  if p_slug is null or length(p_slug) > 80
     or p_name is null or length(p_name) > 160 or btrim(p_name) = ''
     or p_email is null or length(p_email) > 254
     or p_company is null or length(p_company) > 200 or btrim(p_company) = ''
     or (p_phone is not null and length(p_phone) > 40) then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_email := lower(btrim(p_email));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into c from public.public_diagnostic_campaigns where slug = p_slug;
  if c.id is null or c.status <> 'open'
     or (c.opens_at is not null and c.opens_at > now())
     or (c.closes_at is not null and c.closes_at <= now()) then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if c.consent_document_id is null then
    return jsonb_build_object('status', 'unavailable');
  end if;

  -- Tiempo mínimo de interacción. Se responde 'created' —la misma respuesta
  -- que a un envío bueno— para no decirle al robot qué comprobación falló.
  if not public.public_intake_nonce_ok(p_nonce) then
    return jsonb_build_object('status', 'created');
  end if;

  v_huella_ip := public.public_intake_fingerprint(p_ip);
  v_huella_mail := public.public_intake_fingerprint(v_email);
  if not public.public_intake_rate_ok(c.id, v_huella_ip, v_huella_mail) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- YA HAY UNA. Se responde lo mismo esté en curso o completada: distinguirlas
  -- convertiría este formulario en un detector de quién participó, y basta con
  -- conocer un correo para preguntar. Quien de verdad empezó tiene su testigo.
  select id, status into v_existe from public.public_diagnostic_submissions
   where campaign_id = c.id and participant_email_normalized = v_email
     and status in ('in_progress', 'completed')
   order by created_at desc limit 1;
  if v_existe.id is not null then
    return jsonb_build_object('status', 'existing');
  end if;

  -- La evidencia del consentimiento se copia DEL DOCUMENTO, aquí dentro. Nada
  -- de esto puede llegar del navegador.
  select version, content_hash into d from public.legal_documents
   where id = c.consent_document_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.public_diagnostic_submissions (
    campaign_id, diagnostic_version_id, status,
    participant_name, participant_email, participant_email_normalized,
    participant_phone, participant_phone_normalized, company_name,
    consent_document_id, consent_version, consent_content_hash, consent_at,
    marketing_opt_in, marketing_opt_in_at,
    resume_token_hash, resume_token_prefix, source)
  values (
    c.id, c.diagnostic_version_id, 'in_progress',
    btrim(p_name), btrim(p_email), v_email,
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), ''),
    btrim(p_company),
    c.consent_document_id, d.version, d.content_hash, now(),
    coalesce(p_marketing, false),
    case when coalesce(p_marketing, false) then now() else null end,
    encode(extensions.digest(v_token, 'sha256'), 'hex'), left(v_token, 8),
    'public_link')
  returning id into v_id;

  v_vida := 30 * 24 * 3600;
  if c.closes_at is not null then
    v_vida := least(v_vida, greatest(3600,
      ceil(extract(epoch from (c.closes_at + interval '72 hours') - now()))::int));
  end if;

  -- El testigo en claro se devuelve UNA vez y no se guarda en ningún sitio.
  return jsonb_build_object('status', 'created', 'submission_id', v_id,
    'token', v_token, 'resume_max_age', v_vida);
end $$;

-- -----------------------------------------------------------------------------
-- 8 · La puerta, otra vez del tamaño exacto
-- -----------------------------------------------------------------------------
-- Dos funciones más para el público —leer el instrumento y guardar una
-- sección— y una que el público NO puede ejecutar. Se revoca antes de
-- conceder, como en 0198: así una función nueva nace cerrada.

revoke all on function public.public_diagnostic_get_assessment(text)
  from public, anon, authenticated;
revoke all on function public.public_diagnostic_save_progress(text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.public_diagnostic_finalize_submission(
  text, numeric, text, integer, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.public_diagnostic_begin_submission(
  text, text, text, text, text, boolean, text, text) from public, anon, authenticated;

grant execute on function public.public_diagnostic_get_assessment(text)
  to anon, authenticated;
grant execute on function public.public_diagnostic_save_progress(text, text, jsonb)
  to anon, authenticated;
grant execute on function public.public_diagnostic_begin_submission(
  text, text, text, text, text, boolean, text, text) to anon, authenticated;

-- La que escribe el resultado: solo el servidor.
grant execute on function public.public_diagnostic_finalize_submission(
  text, numeric, text, integer, jsonb, jsonb) to service_role;

comment on function public.public_diagnostic_finalize_submission(
  text, numeric, text, integer, jsonb, jsonb) is
  '0199 · SERVER-ONLY (service_role): congela el resultado de una participación '
  'pública. El resultado lo calcula computeDiagnosticResult en el servidor, así '
  'que conceder esto a anon dejaría que el navegador declarara su propio nivel.';

-- Y las tablas siguen sin abrirse: aquí no hay ni un grant de tabla.
