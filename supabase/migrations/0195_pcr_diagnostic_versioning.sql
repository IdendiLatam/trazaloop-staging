-- =============================================================================
-- Trazaloop · PUBLIC-DIAGNOSTICS-01B · El instrumento PCR pasa a tener versiones
-- =============================================================================
--
-- EL DEFECTO QUE ESTO CIERRA
--
-- El catálogo del diagnóstico PCR no estaba versionado: `diagnostic_questions`
-- tenía `is_active` y nada más. Cambiar hoy el texto, el peso o la criticidad
-- de una pregunta REESCRIBÍA RETROACTIVAMENTE el significado de todos los
-- diagnósticos ya completados —incluidos los de empresas que pagan—, porque el
-- resultado guardado seguía apuntando a un catálogo que ya no era el mismo.
--
-- Es un defecto del diagnóstico AUTENTICADO. Se aborda ahora porque además es
-- el requisito previo de las campañas públicas: sin él no se puede afirmar que
-- todas las empresas de una convocatoria respondieron el mismo instrumento.
--
--
-- POR QUÉ SE VERSIONA EL CATÁLOGO Y NO SE COPIA UNA INSTANTÁNEA
--
-- Es la forma que ya usa el subsistema de encuestas de Quality
-- (`quality_survey_versions` + `quality_survey_questions.version_id`), probado
-- en producción: las preguntas PERTENECEN a una versión. Publicar la v2
-- inserta sus propias filas; las de la v1 no se tocan nunca más.
--
-- La alternativa —congelar un JSON gigante por campaña— guarda lo mismo peor:
-- no se puede consultar, no se puede unir con las respuestas y se desincroniza
-- del catálogo vivo sin que nadie se entere.
--
--
-- LO QUE SE CONGELA NO SON SOLO LAS PREGUNTAS
--
-- El resultado depende también de reglas que vivían SOLO en código
-- (`lib/diagnostic/scoring.ts`): los umbrales de nivel, el redondeo y la regla
-- de brecha crítica. Versionar las preguntas y dejar los umbrales sueltos daría
-- una falsa sensación de inmutabilidad: bastaría con mover el 75 al 80 para
-- que una campaña cerrada cambiara de nivel.
--
-- Por eso la versión lleva su `scoring_config`. NO se duplica el algoritmo: el
-- motor sigue siendo uno y pasa a recibir el perfil como dato.
--
--
-- LA CLAVE ESTABLE YA EXISTÍA
--
-- No se añade un `stable_key` nuevo: `code` —«S1Q01», «input_materials»— ya es
-- exactamente eso. Lo que cambia es su alcance: deja de ser único global y pasa
-- a serlo POR VERSIÓN, que es lo que permite que la misma pregunta lógica
-- exista en la v1 y en la v2 con textos distintos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · La versión del instrumento
-- -----------------------------------------------------------------------------

create table if not exists public.diagnostic_versions (
  id              uuid primary key default gen_random_uuid(),
  diagnostic_type text        not null,
  version_number  integer     not null,
  status          text        not null default 'draft',
  -- El perfil de puntuación CONGELADO. Ver la nota de arriba: sin esto, mover
  -- un umbral en código cambiaría el nivel de un diagnóstico ya cerrado.
  scoring_config  jsonb       not null,
  change_note     text,
  published_at    timestamptz,
  published_by    uuid references public.profiles (id),
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint diagnostic_versions_type_check
    check (diagnostic_type in ('pcr')),
  constraint diagnostic_versions_status_check
    check (status in ('draft', 'published', 'retired')),
  constraint diagnostic_versions_number_check check (version_number >= 1),
  constraint diagnostic_versions_type_number_uniq
    unique (diagnostic_type, version_number),
  -- Publicada implica fecha de publicación: un «publicado» sin cuándo no se
  -- puede auditar.
  constraint diagnostic_versions_published_has_date
    check (status <> 'published' or published_at is not null)
);

-- UNA sola versión publicada por tipo, y por eso «la versión vigente» no es
-- ambigua: publicar la v2 retira la v1 en la misma transacción. Retirada no es
-- borrada — sigue ahí, inmutable, y los diagnósticos viejos la siguen citando.
create unique index if not exists diagnostic_versions_one_published
  on public.diagnostic_versions (diagnostic_type)
  where status = 'published';

comment on table public.diagnostic_versions is
  '0195 · Versión inmutable del instrumento de diagnóstico: sus secciones, sus '
  'preguntas y su configuración de puntuación. Ver PUBLIC-DIAGNOSTICS-01B.';
comment on column public.diagnostic_versions.scoring_config is
  '0195 · Umbrales de nivel, redondeo y regla de brecha crítica. El motor '
  '(lib/diagnostic/scoring.ts) los recibe como dato; no hay un algoritmo por versión.';

alter table public.diagnostic_versions enable row level security;

drop policy if exists diagnostic_versions_select on public.diagnostic_versions;
create policy diagnostic_versions_select on public.diagnostic_versions
  for select to authenticated using (true);

-- Este tramo NO abre nada al público. Las concesiones por omisión de Supabase
-- se retiran explícitamente: confiar en «no hay política» deja la puerta lista
-- para el día que alguien añada una.
revoke all on table public.diagnostic_versions from anon;

-- -----------------------------------------------------------------------------
-- 2 · Secciones y preguntas pertenecen a una versión
-- -----------------------------------------------------------------------------

alter table public.diagnostic_sections
  add column if not exists version_id uuid references public.diagnostic_versions (id);
alter table public.diagnostic_questions
  add column if not exists version_id uuid references public.diagnostic_versions (id);

-- -----------------------------------------------------------------------------
-- 3 · PCR v1 = exactamente lo que hay hoy
-- -----------------------------------------------------------------------------
--
-- EVIDENCIA de que lo que hay hoy es lo que siempre hubo: el catálogo lo siembra
-- 0022 y NINGUNA migración posterior lo modifica; la RLS de ambas tablas solo
-- concede SELECT, así que la aplicación no tiene forma de escribirlo; y la
-- huella md5 del catálogo coincide byte a byte en local —reconstruido desde las
-- migraciones—, Staging y Producción. Por eso los diagnósticos históricos se
-- pueden etiquetar como v1 sin inventar nada.

do $$
declare v_version uuid;
begin
  if exists (select 1 from public.diagnostic_versions where diagnostic_type = 'pcr') then
    raise notice '0195 · ya existe una versión de PCR; no se vuelve a crear';
    return;
  end if;

  insert into public.diagnostic_versions
    (diagnostic_type, version_number, status, published_at, change_note, scoring_config)
  values ('pcr', 1, 'published', now(),
    'Instrumento PCR tal como existía antes de 0195: 6 secciones y 52 preguntas '
    'sembradas en 0022, sin modificaciones posteriores.',
    -- Copia EXACTA de lo que hoy hace lib/diagnostic/scoring.ts. Si algún día
    -- difieren, la prueba de paridad lo detecta.
    jsonb_build_object(
      'answer_type', 'yes_no',
      'rounding_decimals', 4,
      'critical_gap_rule', 'critical_question_answered_no',
      'missing_answer_counts_as', 'unanswered',
      'section_aggregation', 'weighted_percent_within_section',
      'levels', jsonb_build_array(
        jsonb_build_object('code', 'audit_ready_candidate', 'min_percent', 90, 'max_critical_gaps', 0),
        jsonb_build_object('code', 'high',                  'min_percent', 75, 'max_critical_gaps', 4),
        jsonb_build_object('code', 'medium',                'min_percent', 50, 'max_critical_gaps', 8),
        jsonb_build_object('code', 'low',                   'min_percent', 0,  'max_critical_gaps', null)
      )
    ))
  returning id into v_version;

  update public.diagnostic_sections  set version_id = v_version where version_id is null;
  update public.diagnostic_questions set version_id = v_version where version_id is null;

  -- El recuento se comprueba DENTRO de la transacción: si el instrumento no es
  -- el que creemos, la migración no entra.
  if (select count(*) from public.diagnostic_sections where version_id = v_version) <> 6 then
    raise exception '0195_SECCIONES_INESPERADAS: %',
      (select count(*) from public.diagnostic_sections where version_id = v_version);
  end if;
  if (select count(*) from public.diagnostic_questions
       where version_id = v_version and is_active) <> 52 then
    raise exception '0195_PREGUNTAS_INESPERADAS: %',
      (select count(*) from public.diagnostic_questions
        where version_id = v_version and is_active);
  end if;

  raise notice '0195 · PCR v1 publicada: 6 secciones y 52 preguntas';
end $$;

alter table public.diagnostic_sections  alter column version_id set not null;
alter table public.diagnostic_questions alter column version_id set not null;

-- `code` deja de ser único GLOBAL y pasa a serlo por versión: es justo lo que
-- permite que «S1Q01» exista en la v1 y en la v2 con textos distintos, y lo que
-- lo convierte en la clave estable entre versiones.
alter table public.diagnostic_sections  drop constraint if exists diagnostic_sections_code_key;
alter table public.diagnostic_questions drop constraint if exists diagnostic_questions_code_key;

create unique index if not exists diagnostic_sections_version_code_uniq
  on public.diagnostic_sections (version_id, code);
create unique index if not exists diagnostic_questions_version_code_uniq
  on public.diagnostic_questions (version_id, code);

comment on column public.diagnostic_sections.code is
  '0195 · CLAVE ESTABLE de la sección entre versiones. Única por versión, no global.';
comment on column public.diagnostic_questions.code is
  '0195 · CLAVE ESTABLE de la pregunta entre versiones. Única por versión, no global.';

-- -----------------------------------------------------------------------------
-- 4 · Cada diagnóstico dice con qué versión se hizo
-- -----------------------------------------------------------------------------

alter table public.diagnostics
  add column if not exists diagnostic_version_id uuid references public.diagnostic_versions (id);

-- Un diagnóstico COMPLETADO está bloqueado por `lock_completed_diagnostic`, y
-- con razón: nadie puede reescribir un resultado cerrado. Pero anotar CON QUÉ
-- INSTRUMENTO se hizo no es modificarlo — es registrar un hecho que siempre fue
-- cierto y que hasta esta migración no tenía dónde vivir.
--
-- La excepción es quirúrgica y permanente, no un apagado temporal: solo de NULL
-- a un valor, solo esa columna, y comparando el RESTO de la fila entera en
-- JSON para que nada más pueda colarse. Cualquier otro cambio sobre un
-- diagnóstico completado sigue prohibido, incluido volver a escribir la
-- versión una vez puesta.

create or replace function public.lock_completed_diagnostic()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'completed' then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE'
     and old.diagnostic_version_id is null
     and new.diagnostic_version_id is not null
     and (to_jsonb(new) - 'diagnostic_version_id' - 'updated_at')
       = (to_jsonb(old) - 'diagnostic_version_id' - 'updated_at') then
    return new;
  end if;

  raise exception 'Un diagnóstico completado no puede modificarse ni eliminarse';
end $$;

-- Los históricos se etiquetan con la v1 por la evidencia de arriba. Sus
-- RESULTADOS no se tocan: versionar el instrumento no es reinterpretar lo ya
-- respondido.
update public.diagnostics d
   set diagnostic_version_id = (
     select v.id from public.diagnostic_versions v
      where v.diagnostic_type = 'pcr' and v.version_number = 1)
 where d.diagnostic_version_id is null;

comment on column public.diagnostics.diagnostic_version_id is
  '0195 · Con qué versión del instrumento se hizo. Se fija al EMPEZAR y no '
  'cambia aunque se publique otra mientras el diagnóstico sigue abierto.';

-- -----------------------------------------------------------------------------
-- 5 · Una versión publicada no se toca
-- -----------------------------------------------------------------------------
-- Las guardas viven en la BASE y no en la interfaz: una pantalla se salta con
-- una llamada directa, y esto tiene que aguantar también a quien opere por SQL.

create or replace function public.diagnostic_version_is_frozen()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v_status text; v_version uuid;
begin
  v_version := coalesce(
    case when tg_op = 'DELETE' then old.version_id else new.version_id end,
    case when tg_op = 'DELETE' then old.version_id else new.version_id end);
  if v_version is null then return coalesce(new, old); end if;

  select status into v_status from public.diagnostic_versions where id = v_version;
  if v_status is null or v_status = 'draft' then
    return coalesce(new, old);
  end if;

  raise exception 'DIAGNOSTIC_VERSION_FROZEN'
    using detail = 'versión ' || v_version::text || ' en estado ' || v_status,
          hint = 'Una versión publicada o retirada es historia: crea una versión '
                 'nueva en borrador, edítala y publícala.';
end $$;

drop trigger if exists t_diagnostic_sections_frozen on public.diagnostic_sections;
create trigger t_diagnostic_sections_frozen
  before insert or update or delete on public.diagnostic_sections
  for each row execute function public.diagnostic_version_is_frozen();

drop trigger if exists t_diagnostic_questions_frozen on public.diagnostic_questions;
create trigger t_diagnostic_questions_frozen
  before insert or update or delete on public.diagnostic_questions
  for each row execute function public.diagnostic_version_is_frozen();

-- Y la versión en sí: publicada, solo puede retirarse. Nada de reescribir su
-- número, su tipo ni —sobre todo— su configuración de puntuación.
create or replace function public.diagnostic_version_publication_is_final()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'draft' then return old; end if;
    raise exception 'DIAGNOSTIC_VERSION_IS_HISTORY'
      using hint = 'Una versión publicada no se borra: se retira.';
  end if;

  if old.status = 'draft' then return new; end if;

  if new.diagnostic_type is distinct from old.diagnostic_type
     or new.version_number is distinct from old.version_number
     or new.scoring_config is distinct from old.scoring_config
     or new.published_at   is distinct from old.published_at then
    raise exception 'DIAGNOSTIC_VERSION_FROZEN'
      using hint = 'Lo publicado no se reescribe. Crea una versión nueva.';
  end if;

  -- Lo único que puede moverse es publicada → retirada.
  if new.status <> old.status and not (old.status = 'published' and new.status = 'retired') then
    raise exception 'DIAGNOSTIC_VERSION_STATUS_INVALID'
      using detail = old.status || ' → ' || new.status;
  end if;
  return new;
end $$;

drop trigger if exists t_diagnostic_versions_final on public.diagnostic_versions;
create trigger t_diagnostic_versions_final
  before update or delete on public.diagnostic_versions
  for each row execute function public.diagnostic_version_publication_is_final();

-- -----------------------------------------------------------------------------
-- 6 · Cuál es la versión vigente
-- -----------------------------------------------------------------------------
-- Una sola respuesta y un solo sitio donde se da, para que ni la aplicación ni
-- una campaña futura tengan que adivinarla con `is_active`.

create or replace function public.diagnostic_current_version(p_type text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from public.diagnostic_versions
   where diagnostic_type = p_type and status = 'published'
   limit 1;
$$;

revoke all on function public.diagnostic_current_version(text) from public, anon;
grant execute on function public.diagnostic_current_version(text) to authenticated;
