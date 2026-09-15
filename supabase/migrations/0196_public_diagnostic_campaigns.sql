-- =============================================================================
-- Trazaloop · PUBLIC-DIAGNOSTICS-01C · Campañas públicas de diagnóstico
-- =============================================================================
--
-- QUÉ SE REUTILIZA Y QUÉ NO
--
-- El patrón viene de `quality_survey_*`, que lleva en producción desde
-- QUALITY-12: campaña que FIJA una versión del instrumento, respuestas que
-- repiten esa versión, respuestas 1:N, testigos guardados como hash con
-- prefijo, y cadena de supersesión para las correcciones.
--
-- Lo que NO se reutiliza son sus TABLAS, y no por gusto: todo aquel subsistema
-- es DE EMPRESA —cada fila lleva `organization_id` y su RLS es por membresía—
-- y aquí quien responde no tiene empresa, ni cuenta, ni membresía. Meterlo allí
-- obligaría a inventar una organización ficticia o a agujerear una RLS que hoy
-- protege datos de clientes. Mismas formas, tablas propias, y la frontera
-- entre lo privado de una empresa y lo público de una convocatoria queda
-- donde debe.
--
-- El instrumento tampoco es `quality_surveys`: es `diagnostic_versions` (0195).
--
--
-- ESTA FASE NO ABRE NADA
--
-- No hay rutas, ni formularios, ni RPC públicas, ni una sola concesión a
-- `anon`. El esquema nace cerrado; abrirlo con una superficie acotada es
-- PD-01E. Se crea así a propósito: una tabla que nace abierta «porque ya la
-- cerraremos» se queda abierta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · La campaña
-- -----------------------------------------------------------------------------

create table if not exists public.public_diagnostic_campaigns (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null,
  name                  text not null,
  diagnostic_type       text not null,
  diagnostic_version_id uuid not null references public.diagnostic_versions (id),
  status                text not null default 'draft',

  opens_at              timestamptz,
  closes_at             timestamptz,

  partner_name          text,
  public_title          text,
  public_subtitle       text,
  branding              jsonb not null default '{}'::jsonb,

  -- Qué texto hay que aceptar para participar. Se guarda el documento Y su
  -- huella: `legal_documents` ya versiona con `content_hash`, así que se puede
  -- demostrar QUÉ se aceptó, no solo que se aceptó algo.
  consent_document_id   uuid references public.legal_documents (id),
  consent_version       text,
  consent_content_hash  text,

  allow_resume          boolean not null default true,
  allow_repeat          boolean not null default false,

  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint public_diagnostic_campaigns_slug_uniq unique (slug),
  -- El slug viaja en una dirección pública: se acota a lo que puede ir en una
  -- URL sin escapar nada.
  constraint public_diagnostic_campaigns_slug_shape
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 80),
  constraint public_diagnostic_campaigns_type_check
    check (diagnostic_type in ('pcr')),
  constraint public_diagnostic_campaigns_status_check
    check (status in ('draft', 'open', 'closed', 'archived')),
  constraint public_diagnostic_campaigns_window_check
    check (closes_at is null or opens_at is null or closes_at > opens_at)
);

comment on table public.public_diagnostic_campaigns is
  '0196 · Convocatoria pública de un diagnóstico. Fija UNA versión del '
  'instrumento; ver PUBLIC-DIAGNOSTICS-01C.';

create index if not exists public_diagnostic_campaigns_status_idx
  on public.public_diagnostic_campaigns (status, diagnostic_type);

-- -----------------------------------------------------------------------------
-- 2 · La participación
-- -----------------------------------------------------------------------------

create table if not exists public.public_diagnostic_submissions (
  id                        uuid primary key default gen_random_uuid(),
  campaign_id               uuid not null references public.public_diagnostic_campaigns (id),
  -- Se REPITE la versión de la campaña en vez de leerla por la relación: si
  -- mañana la campaña se pudiera reapuntar, esta fila seguiría diciendo con
  -- qué instrumento respondió esta empresa. Un disparador comprueba que
  -- coinciden al insertar.
  diagnostic_version_id     uuid not null references public.diagnostic_versions (id),

  status                    text not null default 'in_progress',

  -- ── PII · vive SOLO en esta tabla ───────────────────────────────────────
  participant_name          text not null,
  participant_email         text not null,
  participant_email_normalized text not null,
  participant_phone         text,
  participant_phone_normalized text,
  company_name              text not null,

  -- ── Consentimiento OBLIGATORIO · evidencia, no un booleano ──────────────
  consent_document_id       uuid references public.legal_documents (id),
  consent_version           text,
  consent_content_hash      text,
  consent_at                timestamptz,

  -- ── Consentimiento COMERCIAL · separado, y sin premarcar ────────────────
  marketing_opt_in          boolean not null default false,
  marketing_opt_in_at       timestamptz,

  started_at                timestamptz not null default now(),
  completed_at              timestamptz,
  abandoned_at              timestamptz,

  -- Consultables, para poder filtrar y agregar sin abrir el JSON.
  maturity_percent          numeric,
  readiness_level           text,
  critical_gaps             integer,
  section_scores            jsonb,
  -- Instantánea de PRESENTACIÓN. No es la fuente de verdad de lo de arriba y
  -- no repite las 52 respuestas: para eso está la tabla de respuestas.
  result_payload            jsonb,

  -- Reanudación: se guarda el HASH, nunca el testigo. El prefijo sirve para
  -- diagnosticar sin poder reconstruirlo. Mismo patrón que las invitaciones
  -- de encuesta.
  resume_token_hash         text,
  resume_token_prefix       text,

  supersedes_id             uuid references public.public_diagnostic_submissions (id),
  superseded_by_id          uuid references public.public_diagnostic_submissions (id),

  source                    text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint public_diagnostic_submissions_status_check
    check (status in ('in_progress', 'completed', 'abandoned')),
  -- Completada implica resultado y consentimiento. Una participación cerrada
  -- sin evidencia de consentimiento no debería poder existir.
  constraint public_diagnostic_submissions_completed_check
    check (status <> 'completed' or (
      completed_at is not null and maturity_percent is not null
      and readiness_level is not null and critical_gaps is not null
      and consent_at is not null)),
  constraint public_diagnostic_submissions_in_progress_check
    check (status <> 'in_progress' or completed_at is null),
  -- El «sí» comercial lleva SIEMPRE su cuándo, y el «no» no puede llevarlo:
  -- una fecha sin consentimiento sería una autorización fantasma.
  constraint public_diagnostic_submissions_marketing_check
    check ((marketing_opt_in and marketing_opt_in_at is not null)
        or (not marketing_opt_in and marketing_opt_in_at is null)),
  constraint public_diagnostic_submissions_maturity_range
    check (maturity_percent is null
        or (maturity_percent >= 0 and maturity_percent <= 100)),
  constraint public_diagnostic_submissions_level_check
    check (readiness_level is null or readiness_level in
      ('low', 'medium', 'high', 'audit_ready_candidate')),
  constraint public_diagnostic_submissions_no_self_supersede
    check (supersedes_id is null or supersedes_id <> id),
  constraint public_diagnostic_submissions_no_self_superseded
    check (superseded_by_id is null or superseded_by_id <> id),
  constraint public_diagnostic_submissions_resume_token_uniq unique (resume_token_hash)
);

comment on table public.public_diagnostic_submissions is
  '0196 · Participación pública en una campaña. AQUÍ vive toda la PII; las '
  'respuestas no llevan ninguna. Nunca se guarda la IP en claro.';
comment on column public.public_diagnostic_submissions.result_payload is
  '0196 · Instantánea de presentación. Las columnas consultables de arriba '
  'siguen siendo la fuente de verdad; esto NO repite las respuestas.';

-- Encontrar rápido «esta persona en esta campaña», que es la consulta de
-- reanudación y de duplicados. NO es único a propósito: varias personas de la
-- misma empresa pueden responder, y repetir de forma explícita crea otra fila.
create index if not exists public_diagnostic_submissions_lookup_idx
  on public.public_diagnostic_submissions
     (campaign_id, participant_email_normalized, status);
create index if not exists public_diagnostic_submissions_campaign_idx
  on public.public_diagnostic_submissions (campaign_id, status);
create index if not exists public_diagnostic_submissions_supersedes_idx
  on public.public_diagnostic_submissions (supersedes_id)
  where supersedes_id is not null;

-- -----------------------------------------------------------------------------
-- 3 · Las respuestas · sin una sola PII
-- -----------------------------------------------------------------------------

create table if not exists public.public_diagnostic_answers (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.public_diagnostic_submissions (id)
                on delete cascade,
  question_id   uuid not null references public.diagnostic_questions (id),
  answer        boolean not null,
  observations  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint public_diagnostic_answers_submission_question_uniq
    unique (submission_id, question_id)
);

comment on table public.public_diagnostic_answers is
  '0196 · Respuestas de una participación. Sin PII: se une por submission_id. '
  'Esa separación es la que permitirá entregar agregados sin entregar personas.';

create index if not exists public_diagnostic_answers_submission_idx
  on public.public_diagnostic_answers (submission_id);

-- -----------------------------------------------------------------------------
-- 4 · Invariantes que un CHECK no puede expresar
-- -----------------------------------------------------------------------------
-- Todo lo que cruza tablas vive en disparadores, no en la interfaz: una
-- pantalla se salta con una llamada, y esto tiene que aguantar también a quien
-- opere por SQL.

-- 4.1 · La campaña y su versión
create or replace function public.public_campaign_version_is_coherent()
returns trigger language plpgsql set search_path to 'public' as $$
declare v record; v_iniciadas int;
begin
  select diagnostic_type, status into v
    from public.diagnostic_versions where id = new.diagnostic_version_id;
  if v.diagnostic_type is null then
    raise exception 'CAMPAIGN_VERSION_NOT_FOUND';
  end if;
  if v.diagnostic_type <> new.diagnostic_type then
    raise exception 'CAMPAIGN_VERSION_TYPE_MISMATCH'
      using detail = new.diagnostic_type || ' vs ' || v.diagnostic_type;
  end if;
  -- Una campaña abierta contra un borrador prometería un instrumento que
  -- todavía puede cambiar debajo.
  if new.status = 'open' and v.status = 'draft' then
    raise exception 'CAMPAIGN_VERSION_NOT_PUBLISHED'
      using hint = 'Publica la versión del instrumento antes de abrir la campaña.';
  end if;

  if tg_op = 'UPDATE' then
    select count(*) into v_iniciadas
      from public.public_diagnostic_submissions where campaign_id = old.id;
    -- Con una sola participación iniciada, lo que define el estudio queda
    -- congelado: cambiarlo después dejaría dos instrumentos o dos textos de
    -- consentimiento dentro de la misma campaña.
    if v_iniciadas > 0 and (
         new.diagnostic_version_id is distinct from old.diagnostic_version_id
      or new.diagnostic_type       is distinct from old.diagnostic_type
      or new.consent_document_id   is distinct from old.consent_document_id
      or new.consent_version       is distinct from old.consent_version
      or new.consent_content_hash  is distinct from old.consent_content_hash
      or new.slug                  is distinct from old.slug) then
      raise exception 'CAMPAIGN_FROZEN_BY_SUBMISSIONS'
        using detail = v_iniciadas || ' participación(es) ya iniciadas';
    end if;
    -- Y una vez abierta, la versión no se reapunta ni sin participaciones.
    if old.status in ('open', 'closed', 'archived')
       and new.diagnostic_version_id is distinct from old.diagnostic_version_id then
      raise exception 'CAMPAIGN_VERSION_LOCKED';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists t_public_campaign_version on public.public_diagnostic_campaigns;
create trigger t_public_campaign_version
  before insert or update on public.public_diagnostic_campaigns
  for each row execute function public.public_campaign_version_is_coherent();

-- 4.2 · La participación hereda la versión de su campaña, y no se reescribe
create or replace function public.public_submission_is_coherent()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_campana_version uuid;
begin
  select diagnostic_version_id into v_campana_version
    from public.public_diagnostic_campaigns where id = new.campaign_id;
  if v_campana_version is null then
    raise exception 'SUBMISSION_CAMPAIGN_NOT_FOUND';
  end if;
  if new.diagnostic_version_id <> v_campana_version then
    raise exception 'SUBMISSION_VERSION_MISMATCH'
      using hint = 'La participación se responde con la versión que fijó la campaña.';
  end if;

  if tg_op = 'UPDATE' then
    -- COMPLETADA ES HISTORIA. Lo único que puede moverse después es la cadena
    -- de supersesión, que es cómo se registra que alguien repitió — sin
    -- reabrir ni reescribir lo que ya respondió.
    if old.status = 'completed' then
      if (to_jsonb(new) - 'superseded_by_id' - 'updated_at')
         is distinct from (to_jsonb(old) - 'superseded_by_id' - 'updated_at') then
        raise exception 'SUBMISSION_COMPLETED_IS_HISTORY'
          using hint = 'Repetir el diagnóstico crea una participación nueva; '
                       'no se reabre la anterior.';
      end if;
    end if;
  end if;

  -- Cadena lineal: no se supersede algo que ya fue superseded.
  if new.supersedes_id is not null and (tg_op = 'INSERT'
     or new.supersedes_id is distinct from old.supersedes_id) then
    if exists (select 1 from public.public_diagnostic_submissions
                where id = new.supersedes_id and superseded_by_id is not null) then
      raise exception 'SUBMISSION_ALREADY_SUPERSEDED';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists t_public_submission_coherent on public.public_diagnostic_submissions;
create trigger t_public_submission_coherent
  before insert or update on public.public_diagnostic_submissions
  for each row execute function public.public_submission_is_coherent();

-- Una participación completada no se borra: es historia del estudio.
create or replace function public.public_submission_delete_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if old.status = 'completed' then
    raise exception 'SUBMISSION_COMPLETED_IS_HISTORY'
      using hint = 'Si algún día hay derecho de supresión, será una operación '
                   'gobernada y auditable, no un DELETE.';
  end if;
  return old;
end $$;

drop trigger if exists t_public_submission_delete on public.public_diagnostic_submissions;
create trigger t_public_submission_delete
  before delete on public.public_diagnostic_submissions
  for each row execute function public.public_submission_delete_guard();

-- 4.3 · Una respuesta pertenece a la versión de SU participación
create or replace function public.public_answer_is_coherent()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_sub record; v_pregunta_version uuid;
begin
  select status, diagnostic_version_id into v_sub
    from public.public_diagnostic_submissions where id = new.submission_id;
  if v_sub.status is null then
    raise exception 'ANSWER_SUBMISSION_NOT_FOUND';
  end if;
  -- Congelada al completar: editar una respuesta después cambiaría un
  -- resultado que ya se enseñó.
  if v_sub.status <> 'in_progress' then
    raise exception 'ANSWER_SUBMISSION_NOT_EDITABLE'
      using detail = v_sub.status;
  end if;

  select version_id into v_pregunta_version
    from public.diagnostic_questions where id = new.question_id;
  if v_pregunta_version is null then
    raise exception 'ANSWER_QUESTION_NOT_FOUND';
  end if;
  -- Sin esto, una pregunta de la v2 podría entrar en una participación de la
  -- v1: no fallaría, calcularía mal.
  if v_pregunta_version <> v_sub.diagnostic_version_id then
    raise exception 'ANSWER_QUESTION_VERSION_MISMATCH'
      using hint = 'La pregunta no pertenece a la versión con la que se está respondiendo.';
  end if;
  return new;
end $$;

drop trigger if exists t_public_answer_coherent on public.public_diagnostic_answers;
create trigger t_public_answer_coherent
  before insert or update on public.public_diagnostic_answers
  for each row execute function public.public_answer_is_coherent();

-- -----------------------------------------------------------------------------
-- 5 · Cerrado por defecto
-- -----------------------------------------------------------------------------
-- RLS activa, administración de plataforma y nadie más. `anon` no aparece en
-- ninguna política Y además se le retiran las concesiones por omisión de
-- Supabase: confiar solo en «no hay política» deja la puerta lista para el día
-- que alguien añada una.

alter table public.public_diagnostic_campaigns   enable row level security;
alter table public.public_diagnostic_submissions enable row level security;
alter table public.public_diagnostic_answers     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['public_diagnostic_campaigns',
                           'public_diagnostic_submissions',
                           'public_diagnostic_answers'] loop
    execute format('drop policy if exists %I_admin on public.%I', t, t);
    execute format(
      'create policy %I_admin on public.%I for all to authenticated '
      'using (public.is_platform_superadmin()) '
      'with check (public.is_platform_superadmin())', t, t);
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;

-- Nada ejecutable por el público en este tramo: la superficie acotada llega en
-- PD-01E, y llegará declarada una por una.
