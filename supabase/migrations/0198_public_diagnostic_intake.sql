-- =============================================================================
-- Trazaloop · PUBLIC-DIAGNOSTICS-01E · La primera superficie pública
-- =============================================================================
--
-- Hasta aquí `anon` no podía absolutamente nada. Esta migración abre la primera
-- puerta, y la abre del tamaño exacto: TRES funciones, ninguna tabla.
--
--
-- LO QUE NO SE PUDO REUTILIZAR, Y POR QUÉ IMPORTA
--
-- El precedente de encuestas protege su superficie pública con un TESTIGO DE
-- INVITACIÓN de un solo uso: consumirlo ES la comprobación. Aquí no hay
-- testigo — el enlace de campaña es abierto y se reparte por correo
-- institucional— así que esa defensa desaparece entera y hay que sustituirla:
-- límite de tasa persistido, señuelo y tiempo mínimo.
--
-- Y no hay dónde apoyarse: el repositorio NO tiene infraestructura de límite de
-- tasa (ni tabla, ni ayudante) ni de correo transaccional distinto de Auth. Se
-- construye lo primero aquí; lo segundo NO se inventa.
--
--
-- LA PIMIENTA VIVE EN LA BASE
--
-- Para contar intentos por IP sin guardar IPs hace falta un secreto: un
-- `sha256(ip)` pelado se rompe recorriendo las cuatro mil millones de IPv4 en
-- minutos. Se genera aquí, una vez, y no sale nunca: ni variable de entorno que
-- alguien tenga que configurar, ni reutilizar el secreto de otra cosa —que se
-- rompería en silencio el día que una de las dos rote—.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · El secreto de pseudonimización
-- -----------------------------------------------------------------------------

create table if not exists public.public_intake_secret (
  id      boolean primary key default true,
  pepper  bytea not null,
  created_at timestamptz not null default now(),
  constraint public_intake_secret_one_row check (id)
);

insert into public.public_intake_secret (id, pepper)
  values (true, extensions.gen_random_bytes(32))
  on conflict (id) do nothing;

alter table public.public_intake_secret enable row level security;
-- Sin políticas: NADIE la lee por RLS. Solo las funciones definer de abajo.
revoke all on table public.public_intake_secret from anon, authenticated;

comment on table public.public_intake_secret is
  '0198 · Pimienta para pseudonimizar IPs. Una fila, sin políticas: solo la '
  'leen las funciones SECURITY DEFINER del ingreso público.';

-- -----------------------------------------------------------------------------
-- 2 · Los intentos, para el límite de tasa
-- -----------------------------------------------------------------------------
-- Ventana deslizante PERSISTIDA. Un contador en memoria no sirve: hay varias
-- instancias y cada una tendría el suyo, así que el límite real sería el
-- declarado multiplicado por el número de instancias.

create table if not exists public.public_intake_attempts (
  id          bigserial primary key,
  campaign_id uuid references public.public_diagnostic_campaigns (id),
  -- 'ip' | 'email' | 'campaign'. Tres cubos porque la IP SOLA no puede ser la
  -- identidad: en una convocatoria de cámara, decenas de empresas responden
  -- desde la misma oficina o la misma red corporativa.
  bucket_kind text not null,
  -- Ya pseudonimizado. Aquí no entra ni una IP ni un correo en claro.
  bucket_key  text not null,
  occurred_at timestamptz not null default now(),
  constraint public_intake_attempts_kind_check
    check (bucket_kind in ('ip', 'email', 'campaign'))
);

create index if not exists public_intake_attempts_window_idx
  on public.public_intake_attempts (bucket_kind, bucket_key, occurred_at desc);

alter table public.public_intake_attempts enable row level security;
revoke all on table public.public_intake_attempts from anon, authenticated;

comment on table public.public_intake_attempts is
  '0198 · Ventana deslizante del límite de tasa del ingreso público. Las claves '
  'están pseudonimizadas con HMAC: no hay IPs ni correos en claro.';

-- -----------------------------------------------------------------------------
-- 3 · Ayudantes internos
-- -----------------------------------------------------------------------------

create or replace function public.public_intake_fingerprint(p_valor text)
returns text language plpgsql stable security definer set search_path to 'public'
as $$
declare v_pepper bytea;
begin
  if p_valor is null or btrim(p_valor) = '' then return null; end if;
  select pepper into v_pepper from public.public_intake_secret where id;
  if v_pepper is null then raise exception 'INTAKE_UNAVAILABLE'; end if;
  -- `hmac` solo existe como (bytea,bytea,text) y (text,text,text): con la
  -- pimienta en bytea hay que convertir el dato, no mezclar tipos.
  return encode(
    extensions.hmac(convert_to(btrim(lower(p_valor)), 'UTF8'), v_pepper, 'sha256'), 'hex');
end $$;

revoke all on function public.public_intake_fingerprint(text) from public, anon, authenticated;

/**
 * ¿Se pasó de la raya? Cuenta y, si cabe, ANOTA en la misma llamada.
 *
 * Las cifras están pensadas para una convocatoria masiva:
 *   · por correo y campaña — 3 en 24 h. Reintentar es humano; insistir, no.
 *   · por IP y campaña — 30 en 1 h. Una oficina entera respondiendo cabe de
 *     sobra; un script, no.
 *   · por campaña — 500 en 1 h. Techo de ráfaga, no de uso normal.
 */
/**
 * El TESTIGO DEL FORMULARIO: cuándo lo pintó el servidor, firmado.
 *
 * Sustituye a lo que primero fue una cookie puesta durante el render. Aquello
 * tenía dos problemas: `Date.now()` en render es impuro y el compilador lo
 * marca, y escribir una cookie mientras se renderiza un componente de servidor
 * no está soportado en Next — solo se puede desde una acción o un manejador.
 *
 * Firmado con la misma pimienta: un robot puede LEER el testigo, pero no puede
 * fabricar uno con fecha anterior. Y eso es justo lo que se quiere: para
 * saltarse el mínimo tendría que pedir la página y esperar, que es exactamente
 * el coste que se le quiere imponer.
 */
create or replace function public.public_intake_issue_nonce()
returns text language plpgsql stable security definer set search_path to 'public'
as $$
declare v_ts text;
begin
  v_ts := (extract(epoch from now()) * 1000)::bigint::text;
  return v_ts || '.' || public.public_intake_fingerprint(v_ts);
end $$;

revoke all on function public.public_intake_issue_nonce() from public, anon, authenticated;

/** ¿El testigo es nuestro y tiene la edad adecuada? */
create or replace function public.public_intake_nonce_ok(p_nonce text)
returns boolean language plpgsql stable security definer set search_path to 'public'
as $$
declare v_ts text; v_firma text; v_edad numeric;
begin
  if p_nonce is null or length(p_nonce) > 120 or position('.' in p_nonce) = 0 then
    return false;
  end if;
  v_ts := split_part(p_nonce, '.', 1);
  v_firma := split_part(p_nonce, '.', 2);
  if v_ts !~ '^[0-9]{10,16}$' then return false; end if;
  if v_firma <> public.public_intake_fingerprint(v_ts) then return false; end if;

  v_edad := extract(epoch from now()) - (v_ts::bigint / 1000.0);
  -- Ni instantáneo —eso es un robot— ni de hace una hora —eso es un formulario
  -- olvidado en una pestaña, o reutilizado.
  return v_edad >= 3 and v_edad <= 3600;
end $$;

revoke all on function public.public_intake_nonce_ok(text) from public, anon, authenticated;

create or replace function public.public_intake_rate_ok(
  p_campaign uuid, p_ip_fingerprint text, p_email_fingerprint text
) returns boolean
language plpgsql security definer set search_path to 'public'
as $$
declare v_n int;
begin
  if p_email_fingerprint is not null then
    select count(*) into v_n from public.public_intake_attempts
     where bucket_kind = 'email' and bucket_key = p_email_fingerprint
       and campaign_id = p_campaign and occurred_at > now() - interval '24 hours';
    if v_n >= 3 then return false; end if;
  end if;

  if p_ip_fingerprint is not null then
    select count(*) into v_n from public.public_intake_attempts
     where bucket_kind = 'ip' and bucket_key = p_ip_fingerprint
       and campaign_id = p_campaign and occurred_at > now() - interval '1 hour';
    if v_n >= 30 then return false; end if;
  end if;

  select count(*) into v_n from public.public_intake_attempts
   where bucket_kind = 'campaign' and bucket_key = p_campaign::text
     and occurred_at > now() - interval '1 hour';
  if v_n >= 500 then return false; end if;

  insert into public.public_intake_attempts (campaign_id, bucket_kind, bucket_key)
  values (p_campaign, 'campaign', p_campaign::text);
  if p_email_fingerprint is not null then
    insert into public.public_intake_attempts (campaign_id, bucket_kind, bucket_key)
    values (p_campaign, 'email', p_email_fingerprint);
  end if;
  if p_ip_fingerprint is not null then
    insert into public.public_intake_attempts (campaign_id, bucket_kind, bucket_key)
    values (p_campaign, 'ip', p_ip_fingerprint);
  end if;
  return true;
end $$;

revoke all on function public.public_intake_rate_ok(uuid, text, text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4 · Resolver la campaña · lo MÍNIMO para pintar la página
-- -----------------------------------------------------------------------------

create or replace function public.public_diagnostic_resolve_campaign(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare c record; d record; v_disponible text;
begin
  if p_slug is null or length(p_slug) > 80 then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into c from public.public_diagnostic_campaigns where slug = p_slug;
  -- Una campaña inexistente y una en borrador responden IGUAL: si el borrador
  -- dijera «todavía no», el slug de una convocatoria sin anunciar se podría
  -- adivinar probando.
  if c.id is null or c.status = 'draft' or c.status = 'archived' then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_disponible := case
    when c.status <> 'open' then 'closed'
    when c.opens_at is not null and c.opens_at > now() then 'scheduled'
    when c.closes_at is not null and c.closes_at <= now() then 'window_closed'
    else 'available' end;

  select title, version into d from public.legal_documents
   where id = c.consent_document_id;

  -- Superficie mínima: NADA de created_by, fechas de auditoría, conteos ni
  -- configuración interna. Ni el identificador de la campaña sale de aquí: el
  -- servidor lo resuelve otra vez por slug al crear la participación, así que
  -- el navegador nunca elige contra qué campaña escribe.
  return jsonb_build_object(
    'status', 'found',
    'availability', v_disponible,
    'public_title', coalesce(c.public_title, c.name),
    'public_subtitle', c.public_subtitle,
    'partner_name', c.partner_name,
    'diagnostic_type', c.diagnostic_type,
    'consent_document_title', d.title,
    'consent_document_version', d.version,
    'has_consent_document', c.consent_document_id is not null,
    -- Solo se emite si de verdad se puede participar: un testigo para una
    -- campaña cerrada no serviría de nada.
    'form_nonce', case when v_disponible = 'available'
                       then public.public_intake_issue_nonce() else null end,
    'allow_resume', c.allow_resume,
    'allow_repeat', c.allow_repeat);
end $$;

-- -----------------------------------------------------------------------------
-- 5 · Empezar una participación
-- -----------------------------------------------------------------------------

create or replace function public.public_diagnostic_begin_submission(
  p_slug text, p_name text, p_email text, p_phone text, p_company text,
  p_marketing boolean, p_ip text, p_nonce text
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  c record; d record; v_email text; v_huella_ip text; v_huella_mail text;
  v_token text; v_id uuid; v_existe record;
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

  -- El testigo en claro se devuelve UNA vez y no se guarda en ningún sitio.
  return jsonb_build_object('status', 'created', 'submission_id', v_id, 'token', v_token);
end $$;

-- -----------------------------------------------------------------------------
-- 6 · Retomar con el testigo
-- -----------------------------------------------------------------------------

create or replace function public.public_diagnostic_resume_submission(p_token text)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare s record;
begin
  -- Longitud primero: así un testigo corto no llega ni a compararse.
  if p_token is null or length(p_token) <> 64 then
    return jsonb_build_object('status', 'not_found');
  end if;

  select sub.id, sub.status, sub.campaign_id, c.slug, c.status as campaign_status
    into s
    from public.public_diagnostic_submissions sub
    join public.public_diagnostic_campaigns c on c.id = sub.campaign_id
   where sub.resume_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if s.id is null then return jsonb_build_object('status', 'not_found'); end if;

  -- Ni aquí sale un dato personal: quien tiene el testigo ya sabe quién es.
  return jsonb_build_object(
    'status', 'found', 'submission_id', s.id,
    'submission_status', s.status, 'slug', s.slug);
end $$;

-- -----------------------------------------------------------------------------
-- 7 · La puerta, del tamaño exacto
-- -----------------------------------------------------------------------------
-- TRES funciones y ninguna tabla. Se revoca primero a todo el mundo y después
-- se concede una a una: así una función nueva nace cerrada.

revoke all on function public.public_diagnostic_resolve_campaign(text)
  from public, anon, authenticated;
drop function if exists public.public_diagnostic_begin_submission(
  text, text, text, text, text, boolean, text);
revoke all on function public.public_diagnostic_begin_submission(
  text, text, text, text, text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.public_diagnostic_resume_submission(text)
  from public, anon, authenticated;

grant execute on function public.public_diagnostic_resolve_campaign(text) to anon, authenticated;
grant execute on function public.public_diagnostic_begin_submission(
  text, text, text, text, text, boolean, text, text) to anon, authenticated;
grant execute on function public.public_diagnostic_resume_submission(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8 · Y se cierra lo que 0196 dejó abierto sin querer
-- -----------------------------------------------------------------------------
-- Supabase concede EXECUTE a `anon` sobre todo lo que se crea en `public`, así
-- que los cuatro disparadores de 0196 nacieron alcanzables. Llamarlos
-- directamente no hace nada útil —fuera de un disparador no tienen `new`— pero
-- la regla es la misma que cerró 0192 en el carril financiero: lo que no hace
-- falta que sea público, no lo es.

revoke all on function public.public_campaign_version_is_coherent() from public, anon;
revoke all on function public.public_submission_is_coherent() from public, anon;
revoke all on function public.public_submission_delete_guard() from public, anon;
revoke all on function public.public_answer_is_coherent() from public, anon;
