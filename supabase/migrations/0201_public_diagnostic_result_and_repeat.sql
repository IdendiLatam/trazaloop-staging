-- =============================================================================
-- Trazaloop · PUBLIC-DIAGNOSTICS-01G · Entregar el resultado, y poder repetir
-- =============================================================================
--
-- POR QUÉ UNA FUNCIÓN NUEVA Y NO LA DE 01F
--
-- `public_diagnostic_get_assessment` existe para PINTAR EL CUESTIONARIO: carga
-- las seis secciones, las 52 preguntas y las respuestas guardadas. Usarla en la
-- pantalla de resultado tendría dos costes, y ninguno es aceptable:
--
--   · traería el instrumento entero para enseñar un porcentaje, y
--   · el encargo prohíbe expresamente volver a cargar preguntas en el
--     resultado, porque de ahí a recalcular hay un paso.
--
-- Así que se añade UNA función, del tamaño de lo que hace falta: devuelve la
-- INSTANTÁNEA ya persistida y nada más. No lee `diagnostic_questions`, no lee
-- `diagnostic_versions`, no sabe puntuar. El resultado que se ve hoy es, por
-- construcción, el que se congeló al cerrar.
--
--
-- EL RESULTADO NO CADUCA CON LA CAMPAÑA
--
-- Esta lectura NO mira el estado de la campaña. Quien completó dentro de la
-- ventana no puede perder su resultado porque un administrador cierre o
-- archive la convocatoria después: archivar es una acción administrativa sobre
-- el ESTUDIO, no una revocación retroactiva de lo que ya se entregó a una
-- empresa. Lo único que gobierna el acceso es el testigo.
--
--
-- REPETIR SE DEMUESTRA CON EL TESTIGO, NUNCA CON EL CORREO
--
-- `allow_repeat` llevaba desde 0196 sin gobernar nada. Aquí empieza a hacerlo,
-- y con un cuidado concreto: si bastara el correo, cualquiera que conociera el
-- de una empresa podría crear una participación nueva y dejar la suya
-- SUPERSEDIDA. La intención de repetir viaja como el testigo de la
-- participación anterior —que solo tiene quien la hizo, en una cookie que el
-- navegador no puede leer— y el servidor lo saca de ahí, no del formulario.
--
-- Lo anterior no se toca: no se reabre, no se borra y no se reescribe. Se
-- encadena, que es justo lo que 0196 dejó preparado al permitir mover
-- `superseded_by_id` y nada más de una participación cerrada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · La instantánea, y solo la instantánea
-- -----------------------------------------------------------------------------

create or replace function public.public_diagnostic_get_result(p_token text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare s record;
begin
  if p_token is null or length(p_token) <> 64 then
    return jsonb_build_object('status', 'not_found');
  end if;

  select sub.id, sub.status, sub.campaign_id, sub.completed_at,
         sub.company_name, sub.result_payload,
         c.slug, coalesce(c.public_title, c.name) as titulo,
         c.partner_name, c.allow_repeat
    into s
    from public.public_diagnostic_submissions sub
    join public.public_diagnostic_campaigns c on c.id = sub.campaign_id
   where sub.resume_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  -- Ni el estado de la campaña ni sus fechas entran en esta decisión.

  if s.id is null then return jsonb_build_object('status', 'not_found'); end if;

  if not public.public_intake_token_rate_ok(
       'read', s.campaign_id, s.id, 600, interval '1 hour') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- A medias no hay resultado que enseñar, y decirlo no filtra nada: quien
  -- pregunta trae el testigo de esa misma participación.
  if s.status <> 'completed' then
    return jsonb_build_object('status', 'not_completed',
      'slug', s.slug, 'submission_status', s.status);
  end if;

  -- Cerrada sin instantánea no debería existir. Si existiera, se dice, no se
  -- improvisa un resultado.
  if s.result_payload is null then
    return jsonb_build_object('status', 'unavailable', 'slug', s.slug);
  end if;

  -- Superficie mínima. Del participante sale SOLO la empresa, que es suya y la
  -- escribió él: ni correo, ni teléfono, ni huella de consentimiento, ni
  -- identificadores internos, ni el testigo.
  return jsonb_build_object(
    'status', 'found',
    'slug', s.slug,
    'public_title', s.titulo,
    'partner_name', s.partner_name,
    'company_name', s.company_name,
    'completed_at', s.completed_at,
    'allow_repeat', s.allow_repeat,
    -- Tal cual se congeló. Esta función no compone ni deriva nada.
    'result', s.result_payload);
end $$;

-- -----------------------------------------------------------------------------
-- 2 · Repetir: una participación nueva, encadenada a la anterior
-- -----------------------------------------------------------------------------
-- `begin_submission` gana un octavo dato que el NAVEGADOR NO ESCRIBE: el
-- testigo de la participación anterior, que el servidor lee de la cookie. Sin
-- él, un correo que ya participó sigue recibiendo la misma respuesta neutra de
-- siempre.

create or replace function public.public_diagnostic_begin_submission(
  p_slug text, p_name text, p_email text, p_phone text, p_company text,
  p_marketing boolean, p_ip text, p_nonce text, p_repeat_token text default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  c record; d record; v_email text; v_huella_ip text; v_huella_mail text;
  v_token text; v_id uuid; v_existe record; v_vida integer;
  v_anterior record; v_anterior_id uuid := null; v_repite boolean := false;
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

  -- ¿VIENE A REPETIR, y puede demostrarlo?
  --
  -- Tres condiciones, y las tres imprescindibles: la campaña lo permite, el
  -- testigo existe y es de ESTA campaña, y lo que señala está CERRADO. Repetir
  -- sobre algo a medias no es repetir: es abandonar a medias, y para eso ya se
  -- puede continuar.
  if p_repeat_token is not null and length(p_repeat_token) = 64 and c.allow_repeat then
    select sub.id, sub.status, sub.campaign_id, sub.superseded_by_id
      into v_anterior
      from public.public_diagnostic_submissions sub
     where sub.resume_token_hash =
             encode(extensions.digest(p_repeat_token, 'sha256'), 'hex');
    if v_anterior.id is not null
       and v_anterior.campaign_id = c.id
       and v_anterior.status = 'completed'
       and v_anterior.superseded_by_id is null then
      v_repite := true;
      -- En una variable propia, no en el campo de un `record`: un `record` sin
      -- asignar revienta al referenciarlo aunque la rama no se ejecute.
      v_anterior_id := v_anterior.id;
    end if;
  end if;

  -- YA HAY UNA. Se responde lo mismo esté en curso o completada: distinguirlas
  -- convertiría este formulario en un detector de quién participó, y basta con
  -- conocer un correo para preguntar. Quien de verdad empezó tiene su testigo.
  if not v_repite then
    select id, status into v_existe from public.public_diagnostic_submissions
     where campaign_id = c.id and participant_email_normalized = v_email
       and status in ('in_progress', 'completed')
     order by created_at desc limit 1;
    if v_existe.id is not null then
      return jsonb_build_object('status', 'existing');
    end if;
  end if;

  -- La evidencia del consentimiento se copia DEL DOCUMENTO, aquí dentro. Nada
  -- de esto puede llegar del navegador. Y al repetir se vuelve a copiar: quien
  -- repite ha vuelto a aceptar, con la versión vigente del texto.
  select version, content_hash into d from public.legal_documents
   where id = c.consent_document_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.public_diagnostic_submissions (
    campaign_id, diagnostic_version_id, status,
    participant_name, participant_email, participant_email_normalized,
    participant_phone, participant_phone_normalized, company_name,
    consent_document_id, consent_version, consent_content_hash, consent_at,
    marketing_opt_in, marketing_opt_in_at,
    resume_token_hash, resume_token_prefix, source, supersedes_id)
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
    case when v_repite then 'public_link_repeat' else 'public_link' end,
    v_anterior_id)
  returning id into v_id;

  -- Y se cierra la cadena hacia atrás. Es el ÚNICO campo que 0196 deja mover
  -- en una participación cerrada, precisamente para esto: lo anterior queda
  -- intacto y además queda dicho que fue superado.
  if v_repite then
    update public.public_diagnostic_submissions
       set superseded_by_id = v_id
     where id = v_anterior_id;
  end if;

  v_vida := 30 * 24 * 3600;
  if c.closes_at is not null then
    v_vida := least(v_vida, greatest(3600,
      ceil(extract(epoch from (c.closes_at + interval '72 hours') - now()))::int));
  end if;

  -- El testigo en claro se devuelve UNA vez y no se guarda en ningún sitio.
  return jsonb_build_object('status', 'created', 'submission_id', v_id,
    'token', v_token, 'resume_max_age', v_vida,
    'repeated', v_repite);
end $$;

-- -----------------------------------------------------------------------------
-- 3 · La puerta
-- -----------------------------------------------------------------------------
-- Una función pública más —leer el resultado— y la de empezar, que cambia de
-- firma. Se revoca antes de conceder, y la de ocho argumentos se retira para
-- que no queden dos puertas donde debe haber una.

drop function if exists public.public_diagnostic_begin_submission(
  text, text, text, text, text, boolean, text, text);

revoke all on function public.public_diagnostic_get_result(text)
  from public, anon, authenticated;
revoke all on function public.public_diagnostic_begin_submission(
  text, text, text, text, text, boolean, text, text, text)
  from public, anon, authenticated;

grant execute on function public.public_diagnostic_get_result(text)
  to anon, authenticated;
grant execute on function public.public_diagnostic_begin_submission(
  text, text, text, text, text, boolean, text, text, text) to anon, authenticated;

comment on function public.public_diagnostic_get_result(text) is
  '0201 · Devuelve la instantánea YA CONGELADA de una participación cerrada. No '
  'lee el instrumento, no puntúa y no mira el estado de la campaña: lo que se '
  'entregó, se entregó.';

-- -----------------------------------------------------------------------------
-- 4 · Y se comprueba antes de confirmar
-- -----------------------------------------------------------------------------

do $$
declare v_publicas text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_publicas
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'public_diagnostic_%' or p.proname like 'public_intake_%')
     and has_function_privilege('anon', p.oid, 'EXECUTE');

  if v_publicas is distinct from
     'public_diagnostic_begin_submission, public_diagnostic_get_assessment, '
     || 'public_diagnostic_get_result, public_diagnostic_resolve_campaign, '
     || 'public_diagnostic_resume_submission, public_diagnostic_save_progress' then
    raise exception '0201_SUPERFICIE_PUBLICA_INESPERADA: %', v_publicas;
  end if;

  if has_function_privilege('anon',
       'public.public_diagnostic_finalize_submission(text, numeric, text, integer, jsonb, jsonb)',
       'EXECUTE') then
    raise exception '0201_CIERRE_ALCANZABLE_POR_ANON';
  end if;

  raise notice '0201 · seis funciones públicas, y la que escribe el resultado no está entre ellas';
end $$;
