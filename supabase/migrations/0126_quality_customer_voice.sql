-- ============================================================================
-- QUALITY-08 · VOZ DEL CLIENTE, SATISFACCIÓN, RETROALIMENTACIÓN Y QUEJAS
-- ----------------------------------------------------------------------------
-- VC-01…VC-35 · MDR congelado · append-only sobre 0125.
--
-- LAS SEIS SEPARACIONES QUE SOSTIENEN ESTE DOMINIO
--
--   CLIENTE ≠ CONTACTO ≠ QUIEN RESPONDE
--   ENCUESTA ≠ VERSIÓN ≠ CAMPAÑA ≠ RESPUESTA
--   RETROALIMENTACIÓN ≠ QUEJA
--   QUEJA ≠ NO CONFORMIDAD
--   RESULTADO DE SATISFACCIÓN ≠ DECISIÓN FORMAL
--   SEÑAL ≠ CASO ≠ NC
--
-- LO QUE ESTE DOMINIO NO ES
--
-- No es un CRM: no hay oportunidades comerciales, ni embudo, ni pipeline, ni
-- valor de cuenta. No es una plataforma de marketing: no hay listas de envío
-- masivo, ni segmentación publicitaria, ni seguimiento de apertura. Lo que hay
-- es lo que un sistema de gestión necesita para saber qué dicen sus clientes y
-- qué hizo con ello.
--
-- EL ANONIMATO ES ESTRUCTURAL, NO VISUAL (VC-08, VC-29)
--
-- Cuando una campaña promete anonimato, la base se queda SIN NINGUNA COLUMNA
-- que permita reconstruir «respuesta → persona». No es que la pantalla lo
-- oculte: es que el dato no existe. La invitación sabe a quién se invitó y que
-- el enlace se usó; la respuesta no sabe de qué invitación vino. Correlacionar
-- las dos cosas exigiría análisis temporal, no una consulta.
--
-- Por la misma razón las respuestas NO llevan `audit_row_change`: una fila de
-- auditoría guarda quién escribió, y en una respuesta anónima enviada desde una
-- sesión iniciada eso sería exactamente la identidad que se prometió no
-- guardar. En su lugar llevan una guarda de inmutabilidad propia, que es más
-- fuerte que un rastro que podría delatar al autor.
-- ============================================================================


-- ============================================================================
-- 1 · EL CLIENTE COMO PAPEL DE LA IDENTIDAD EXTERNA (VC-03, §5, §6)
-- ----------------------------------------------------------------------------
-- QUALITY-07 ya creó `quality_external_parties` con sus papeles, y el catálogo
-- de papeles YA admite 'customer'. No se crea ninguna tabla de clientes: se
-- crea el PERFIL del cliente, igual que existe el del proveedor.
--
-- La consecuencia práctica es la que pide §5: la empresa ABC puede ser
-- simultáneamente cliente y proveedor con UNA identidad y dos relaciones
-- distintas. Sus sedes y sus contactos se comparten porque son de la empresa,
-- no del papel.
-- ============================================================================

create table public.quality_customer_profiles (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,

  party_id            uuid not null,

  -- El estado de la RELACIÓN comercial, no de la empresa.
  relationship_status text not null default 'active',
  -- Segmento libre de la empresa: «institucional», «retail», «exportación».
  -- No es un catálogo cerrado porque cada empresa segmenta a su manera, y
  -- obligar a una taxonomía ajena produce el campo «otros» de siempre.
  segment             text,
  -- MDR-33 · La responsabilidad es del CARGO. Quién la ejerce hoy es otra cosa.
  owner_position_id   uuid,
  notes               text,

  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint quality_customer_profiles_org_id_uniq unique (organization_id, id),
  -- Una empresa externa tiene UN perfil de cliente. Dos serían dos relaciones
  -- con la misma empresa, que es justo lo que este sprint existe para evitar.
  constraint quality_customer_profiles_party_uniq unique (organization_id, party_id),
  constraint quality_customer_profiles_status_check
    check (relationship_status in ('prospect', 'active', 'inactive', 'retired')),
  constraint quality_customer_profiles_party_fk
    foreign key (organization_id, party_id)
    references public.quality_external_parties (organization_id, id) on delete restrict,
  constraint quality_customer_profiles_owner_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete set null
);

create index quality_customer_profiles_org_idx
  on public.quality_customer_profiles (organization_id, relationship_status);

comment on table public.quality_customer_profiles is
  'QUALITY-08 · VC-03 · El cliente es un PAPEL de la identidad externa transversal, no una tabla nueva. La misma empresa puede ser cliente y proveedor a la vez.';

create trigger t_quality_customer_profiles_updated
  before update on public.quality_customer_profiles
  for each row execute function public.set_updated_at();
create trigger t_quality_customer_profiles_org_immutable
  before update on public.quality_customer_profiles
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_customer_profiles_force_created_by
  before insert on public.quality_customer_profiles
  for each row execute function public.force_created_by();
create trigger t_audit_quality_customer_profiles
  after insert or update or delete on public.quality_customer_profiles
  for each row execute function public.audit_row_change();


-- ----------------------------------------------------------------------------
-- 1.1 · El puente con PCR (§4, §5 · ZERO DUPLICATE MANAGEMENT)
-- ----------------------------------------------------------------------------
-- `customer_requirements` de PCR identifica al cliente con `customer_name TEXT`
-- y nada más. Es exactamente el patrón que §6 prohíbe repetir: la misma empresa
-- escrita a mano tantas veces como acuerdos tenga.
--
-- No se migra ese texto —tocarlo movería la cadena de evidencias y ejercicios
-- de trazabilidad de PCR— pero sí se abre el puente, igual que QUALITY-07 hizo
-- con los proveedores: una columna NUEVA y OPCIONAL. PCR sigue funcionando con
-- Quality apagado; quien quiera enlazar, puede.

alter table public.customer_requirements
  add column if not exists external_party_id uuid;

alter table public.customer_requirements
  drop constraint if exists customer_requirements_external_party_fk;
alter table public.customer_requirements
  add constraint customer_requirements_external_party_fk
  foreign key (organization_id, external_party_id)
  references public.quality_external_parties (organization_id, id) on delete set null;

comment on column public.customer_requirements.external_party_id is
  'QUALITY-08 · Puente OPCIONAL con la identidad externa transversal. Nulo mientras nadie lo enlace: PCR no depende de Quality.';


-- ============================================================================
-- 2 · ENCUESTAS Y VERSIONES (VC-07, VC-26, §9, §10, §16)
-- ----------------------------------------------------------------------------
-- ENCUESTA ≠ VERSIÓN.
--
-- La encuesta es la identidad estable —«Encuesta de satisfacción»— y sobrevive
-- a todos sus cambios. La versión es la estructura CONGELADA con la que se
-- respondió: preguntas, orden, tipo, obligatoriedad, opciones y escalas.
--
-- Si las preguntas colgaran de la encuesta, cambiar una escala en 2028 haría
-- que todas las respuestas anteriores empezaran a significar otra cosa sin que
-- nadie las hubiera tocado. Una respuesta a v1 se interpreta SIEMPRE con v1.
-- ============================================================================

create table public.quality_surveys (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  code              text,
  name              text not null,
  description       text,
  -- Para qué existe. No es decoración: una encuesta sin propósito escrito
  -- acaba preguntando lo que a nadie le sirve.
  purpose           text,
  owner_position_id uuid,
  is_active         boolean not null default true,
  retired_at        timestamptz,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_surveys_org_id_uniq unique (organization_id, id),
  constraint quality_surveys_name_not_blank check (length(trim(name)) > 0),
  constraint quality_surveys_owner_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete set null
);

create unique index quality_surveys_code_uniq
  on public.quality_surveys (organization_id, lower(code)) where code is not null;

comment on table public.quality_surveys is
  'QUALITY-08 · VC-07 · La identidad ESTABLE de una encuesta. Su estructura vive en las versiones.';

create trigger t_quality_surveys_updated
  before update on public.quality_surveys
  for each row execute function public.set_updated_at();
create trigger t_quality_surveys_org_immutable
  before update on public.quality_surveys
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_surveys_force_created_by
  before insert on public.quality_surveys
  for each row execute function public.force_created_by();
create trigger t_audit_quality_surveys
  after insert or update or delete on public.quality_surveys
  for each row execute function public.audit_row_change();


create table public.quality_survey_versions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  survey_id         uuid not null,
  version_number    integer not null,
  status            text not null default 'draft',

  -- §16 · Lo que la versión congela además de sus preguntas: el texto que ve
  -- quien responde y la promesa que se le hace.
  intro_text        text,
  closing_text      text,

  effective_from    date,
  effective_to      date,
  published_at      timestamptz,
  published_by      uuid references public.profiles (id),
  change_note       text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_survey_versions_org_id_uniq unique (organization_id, id),
  constraint quality_survey_versions_number_uniq unique (survey_id, version_number),
  constraint quality_survey_versions_number_check check (version_number >= 1),
  constraint quality_survey_versions_status_check
    check (status in ('draft', 'published', 'superseded')),
  constraint quality_survey_versions_period_check
    check (effective_to is null or effective_from is null or effective_to >= effective_from),
  -- Una versión publicada TIENE que decir desde cuándo rige y cuándo se
  -- publicó. Sin eso no se puede saber cuál regía en una fecha.
  constraint quality_survey_versions_published_fields_check
    check (status = 'draft' or (effective_from is not null and published_at is not null)),
  constraint quality_survey_versions_survey_fk
    foreign key (organization_id, survey_id)
    references public.quality_surveys (organization_id, id) on delete cascade
);

create index quality_survey_versions_survey_idx
  on public.quality_survey_versions (organization_id, survey_id, version_number desc);

comment on table public.quality_survey_versions is
  'QUALITY-08 · VC-07/VC-23 · La estructura CONGELADA. Una respuesta a v1 se interpreta siempre con v1; publicar v2 no la toca.';

create trigger t_quality_survey_versions_updated
  before update on public.quality_survey_versions
  for each row execute function public.set_updated_at();
create trigger t_quality_survey_versions_org_immutable
  before update on public.quality_survey_versions
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_survey_versions_force_created_by
  before insert on public.quality_survey_versions
  for each row execute function public.force_created_by();
create trigger t_audit_quality_survey_versions
  after insert or update or delete on public.quality_survey_versions
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 3 · PREGUNTAS Y ESCALAS (§11, §12, §13, §16)
-- ----------------------------------------------------------------------------
-- Siete tipos, y ni uno más. Trazaloop no es Typeform: lo que hace falta para
-- un sistema de gestión es preguntar de forma estructurada y poder analizarlo,
-- no ofrecer lógica condicional, saltos ni cálculos dentro del formulario.
--
-- §12 · IDENTIDAD DE LA PREGUNTA. `stable_key` sobrevive a las versiones. Sin
-- ella, comparar «la pregunta de entregas» entre 2027 y 2028 dependería de que
-- siguiera siendo la tercera, y bastaría insertar una para romper la serie.
--
-- §13 · La escala es CONFIGURABLE. No hay ningún 1–5 cableado: hay un mínimo,
-- un máximo, un paso y las etiquetas de los extremos.
-- ============================================================================

create table public.quality_survey_questions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  version_id        uuid not null,
  -- §12 · La identidad que atraviesa versiones.
  stable_key        text not null,
  position_order    integer not null default 1,

  label             text not null,
  help_text         text,
  question_type     text not null,
  is_required       boolean not null default false,
  -- §40 · Quien responde puede decir «no aplica», y eso NO es un cero.
  allows_not_applicable boolean not null default false,

  -- Escalas (§13). Nulos cuando el tipo no es `scale`.
  scale_min         integer,
  scale_max         integer,
  scale_step        integer,
  scale_min_label   text,
  scale_max_label   text,

  -- Opciones para las preguntas de elección: [{key, label}]. Congeladas con la
  -- versión, porque cambiar una opción cambia lo que significó la respuesta.
  options           jsonb,

  -- Con qué se relaciona esta pregunta, cuando la empresa quiera segmentar
  -- (§42). Texto libre acotado por el catálogo de temas, no un BI genérico.
  topic_id          uuid,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_survey_questions_org_id_uniq unique (organization_id, id),
  constraint quality_survey_questions_stable_uniq unique (version_id, stable_key),
  constraint quality_survey_questions_label_not_blank check (length(trim(label)) > 0),
  constraint quality_survey_questions_key_not_blank check (length(trim(stable_key)) > 0),
  constraint quality_survey_questions_type_check
    check (question_type in ('single_choice', 'multiple_choice', 'scale',
                             'numeric', 'yes_no', 'text', 'long_text')),
  -- Una escala necesita sus dos extremos, y el máximo por encima del mínimo.
  constraint quality_survey_questions_scale_check
    check ((question_type <> 'scale')
        or (scale_min is not null and scale_max is not null and scale_max > scale_min)),
  -- Una pregunta de elección necesita opciones. Sin ellas no se puede responder.
  constraint quality_survey_questions_options_check
    check ((question_type not in ('single_choice', 'multiple_choice'))
        or (options is not null and jsonb_array_length(options) >= 2)),
  constraint quality_survey_questions_version_fk
    foreign key (organization_id, version_id)
    references public.quality_survey_versions (organization_id, id) on delete cascade
);

create index quality_survey_questions_version_idx
  on public.quality_survey_questions (organization_id, version_id, position_order);

comment on table public.quality_survey_questions is
  'QUALITY-08 · §11…§16 · La pregunta cuelga de la VERSIÓN. `stable_key` la identifica a través de versiones para poder comparar sin depender del número de orden.';

create trigger t_quality_survey_questions_updated
  before update on public.quality_survey_questions
  for each row execute function public.set_updated_at();
create trigger t_quality_survey_questions_org_immutable
  before update on public.quality_survey_questions
  for each row execute function public.prevent_organization_id_change();


-- §10 · UNA VERSIÓN PUBLICADA NO SE REESCRIBE.
--
-- En borrador se edita cuanto haga falta. Publicada, la estructura queda fija:
-- cambiar una pregunta que ya tiene respuestas cambiaría retroactivamente lo
-- que aquella persona contestó, y ese es el daño que ninguna interfaz repara.
create or replace function public.quality_survey_version_is_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from quality_survey_versions
   where id = coalesce(new.version_id, old.version_id);
  if v_status is distinct from 'draft' then
    raise exception 'Esta versión ya está publicada: sus preguntas no se pueden cambiar. Si hace falta otra cosa, se publica una versión nueva.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger t_quality_survey_questions_only_in_draft
  before insert or update or delete on public.quality_survey_questions
  for each row execute function public.quality_survey_version_is_published();


-- ============================================================================
-- 4 · TEMAS (§48)
-- ----------------------------------------------------------------------------
-- Clasificación temática HUMANA y estructurada: entrega, producto, servicio,
-- documentación, atención. No hace falta IA para saber de qué habla un cliente
-- cuando quien lo atendió puede decirlo en un desplegable.
-- ============================================================================

create table public.quality_customer_topics (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  code              text,
  name              text not null,
  description       text,
  is_active         boolean not null default true,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_customer_topics_org_id_uniq unique (organization_id, id),
  constraint quality_customer_topics_name_not_blank check (length(trim(name)) > 0)
);

create unique index quality_customer_topics_name_uniq
  on public.quality_customer_topics (organization_id, lower(name));

comment on table public.quality_customer_topics is
  'QUALITY-08 · §48 · Catálogo temático de la empresa. Clasificación humana; la IA vendrá en AT y tampoco decidirá.';

create trigger t_quality_customer_topics_updated
  before update on public.quality_customer_topics
  for each row execute function public.set_updated_at();
create trigger t_quality_customer_topics_org_immutable
  before update on public.quality_customer_topics
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_customer_topics_force_created_by
  before insert on public.quality_customer_topics
  for each row execute function public.force_created_by();

alter table public.quality_survey_questions
  add constraint quality_survey_questions_topic_fk
  foreign key (organization_id, topic_id)
  references public.quality_customer_topics (organization_id, id) on delete set null;


-- ============================================================================
-- 5 · CAMPAÑAS (VC-04, VC-26, VC-27, §17, §18, §19)
-- ----------------------------------------------------------------------------
-- DEFINICIÓN ≠ APLICACIÓN.
--
-- «Encuesta de satisfacción v2» es la definición. «Clientes agosto 2027» es una
-- campaña. La misma versión puede usarse en tantas campañas como haga falta sin
-- que ninguna toque el resultado de otra (VC-27).
--
-- VC-04/§8 · La FUENTE de la voz vive aquí: relacional, periódica,
-- transaccional o espontánea. No todo pasa por encuesta, y forzarlo produce
-- encuestas de una sola respuesta que nadie diseñó.
--
-- VC-08/§22 · EL ANONIMATO ES DE LA CAMPAÑA, y es estructural. Se decide antes
-- de invitar a nadie y no se puede cambiar después: prometer anonimato y luego
-- revelarlo sería la traición más barata de este dominio.
-- ============================================================================

create table public.quality_survey_campaigns (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  survey_id         uuid not null,
  version_id        uuid not null,

  code              text,
  name              text not null,
  description       text,

  -- VC-04 · De dónde viene esta voz.
  voice_source      text not null default 'periodic',

  -- §18 · El periodo que la campaña MIDE, que no es lo mismo que la ventana en
  -- la que se puede responder.
  period_label      text,
  period_start      date,
  period_end        date,
  opens_on          date,
  closes_on         date,

  status            text not null default 'draft',
  -- VC-08 · Identificada o anónima. Estructural.
  anonymity_mode    text not null default 'identified',

  -- MDR-33 · Responsable estructural: el CARGO.
  owner_position_id uuid,

  -- §38 · El denominador, SOLO si de verdad se conoce. Nulo en una campaña
  -- abierta, y entonces no se calcula ninguna tasa de respuesta.
  population_size   integer,
  audience_note     text,

  -- §19 · Contexto transaccional, únicamente cuando existe relación real en el
  -- repositorio. No se inventa un ERP para tener a qué apuntar.
  context_ref_kind  text,
  context_ref_id    uuid,

  closed_at         timestamptz,
  closed_by         uuid references public.profiles (id),
  closure_note      text,
  -- §18 · Reabrir es una decisión explícita con historia, no un efecto lateral.
  reopened_at       timestamptz,
  reopen_count      integer not null default 0,
  reopen_reason     text,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_survey_campaigns_org_id_uniq unique (organization_id, id),
  constraint quality_survey_campaigns_name_not_blank check (length(trim(name)) > 0),
  constraint quality_survey_campaigns_source_check
    check (voice_source in ('relational', 'periodic', 'transactional', 'spontaneous')),
  constraint quality_survey_campaigns_status_check
    check (status in ('draft', 'open', 'closed', 'cancelled')),
  constraint quality_survey_campaigns_anonymity_check
    check (anonymity_mode in ('identified', 'anonymous')),
  constraint quality_survey_campaigns_period_check
    check (period_end is null or period_start is null or period_end >= period_start),
  constraint quality_survey_campaigns_window_check
    check (closes_on is null or opens_on is null or closes_on >= opens_on),
  -- §38 · Una población declarada tiene que ser un número creíble.
  constraint quality_survey_campaigns_population_check
    check (population_size is null or population_size > 0),
  constraint quality_survey_campaigns_closed_consistent
    check ((status = 'closed') = (closed_at is not null)),
  constraint quality_survey_campaigns_reopen_check check (reopen_count >= 0),
  constraint quality_survey_campaigns_context_check
    check ((context_ref_kind is null) = (context_ref_id is null)),
  constraint quality_survey_campaigns_survey_fk
    foreign key (organization_id, survey_id)
    references public.quality_surveys (organization_id, id) on delete restrict,
  constraint quality_survey_campaigns_version_fk
    foreign key (organization_id, version_id)
    references public.quality_survey_versions (organization_id, id) on delete restrict,
  constraint quality_survey_campaigns_owner_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete set null
);

create index quality_survey_campaigns_org_idx
  on public.quality_survey_campaigns (organization_id, status, closes_on);
create index quality_survey_campaigns_version_idx
  on public.quality_survey_campaigns (organization_id, version_id);

comment on table public.quality_survey_campaigns is
  'QUALITY-08 · VC-26/VC-27 · La APLICACIÓN de una versión de encuesta a un periodo y una población. El anonimato se decide aquí y es estructural.';

create trigger t_quality_survey_campaigns_updated
  before update on public.quality_survey_campaigns
  for each row execute function public.set_updated_at();
create trigger t_quality_survey_campaigns_org_immutable
  before update on public.quality_survey_campaigns
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_survey_campaigns_force_created_by
  before insert on public.quality_survey_campaigns
  for each row execute function public.force_created_by();
create trigger t_audit_quality_survey_campaigns
  after insert or update or delete on public.quality_survey_campaigns
  for each row execute function public.audit_row_change();


-- §22 · EL ANONIMATO NO SE CAMBIA DE OPINIÓN.
--
-- Pasar una campaña de anónima a identificada después de haber invitado a
-- alguien convertiría una promesa en una trampa. Y al revés tampoco: las
-- respuestas ya recogidas llevan identidad, y llamarlas anónimas sería mentir
-- en la dirección contraria.
create or replace function public.quality_campaign_anonymity_is_final()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.anonymity_mode is distinct from old.anonymity_mode then
    if old.status <> 'draft'
       or exists (select 1 from quality_survey_responses r where r.campaign_id = old.id)
       or exists (select 1 from quality_survey_invitations i where i.campaign_id = old.id) then
      raise exception 'El anonimato de una campaña solo se puede cambiar mientras siga en borrador y nadie haya sido invitado ni haya respondido.';
    end if;
  end if;
  -- La versión tampoco se cambia bajo los pies de quien ya respondió.
  if new.version_id is distinct from old.version_id
     and exists (select 1 from quality_survey_responses r where r.campaign_id = old.id) then
    raise exception 'Esta campaña ya tiene respuestas: no se puede cambiar la versión de encuesta con la que se recogieron.';
  end if;
  return new;
end;
$$;


-- ============================================================================
-- 6 · INVITACIONES Y ENLACES (§23, §25, §26, §66, §67, §68)
-- ----------------------------------------------------------------------------
-- EL DISEÑO QUE HACE POSIBLE EL ANONIMATO REAL
--
-- Amenaza: quien administra quiere saber quién dijo qué. Con un enlace único
-- por destinatario, la tentación es guardar `response_id` en la invitación —o
-- `invitation_id` en la respuesta— y el anonimato se evapora con un `join`.
--
-- Solución: la invitación sabe A QUIÉN se invitó y QUE el enlace se usó. La
-- respuesta anónima no sabe de qué invitación vino, y una restricción de la
-- base lo impide. No hay ninguna columna que las una. Reconstruir la relación
-- exigiría comparar marcas de tiempo, que es una inferencia, no una consulta.
--
-- El token NUNCA se guarda en claro (§66): solo su sha256 y un prefijo corto
-- para que la interfaz pueda decir de cuál habla sin poder reconstruirlo.
-- ============================================================================

create table public.quality_survey_invitations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  campaign_id       uuid not null,

  -- §66 · Hash, nunca el secreto. El prefijo es para la interfaz.
  token_hash        text not null,
  token_prefix      text,

  -- A quién se invitó. Esto SÍ se guarda incluso en campañas anónimas: es lo
  -- que permite saber a cuántos se preguntó (§38). Lo que no existe es el
  -- puente hacia la respuesta.
  customer_id       uuid,
  contact_id        uuid,
  sent_to_email     text,
  sent_at           timestamptz,

  status            text not null default 'pending',
  expires_at        timestamptz,
  used_at           timestamptz,
  revoked_at        timestamptz,
  revoked_by        uuid references public.profiles (id),

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_survey_invitations_org_id_uniq unique (organization_id, id),
  constraint quality_survey_invitations_token_uniq unique (token_hash),
  constraint quality_survey_invitations_status_check
    check (status in ('pending', 'used', 'revoked', 'expired')),
  constraint quality_survey_invitations_used_consistent
    check ((status = 'used') = (used_at is not null)),
  constraint quality_survey_invitations_campaign_fk
    foreign key (organization_id, campaign_id)
    references public.quality_survey_campaigns (organization_id, id) on delete cascade,
  constraint quality_survey_invitations_customer_fk
    foreign key (organization_id, customer_id)
    references public.quality_customer_profiles (organization_id, id) on delete set null,
  constraint quality_survey_invitations_contact_fk
    foreign key (organization_id, contact_id)
    references public.quality_external_party_contacts (organization_id, id) on delete set null
);

create index quality_survey_invitations_campaign_idx
  on public.quality_survey_invitations (organization_id, campaign_id, status);

comment on table public.quality_survey_invitations is
  'QUALITY-08 · §23 · A quién se invitó y si el enlace se usó. NO guarda a qué respuesta dio lugar: ese puente es el que rompería el anonimato.';

comment on column public.quality_survey_invitations.token_hash is
  'sha256 del token. El secreto solo existe en el enlace que se entrega; la base nunca lo puede reconstruir.';

create trigger t_quality_survey_invitations_updated
  before update on public.quality_survey_invitations
  for each row execute function public.set_updated_at();
create trigger t_quality_survey_invitations_org_immutable
  before update on public.quality_survey_invitations
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_survey_invitations_force_created_by
  before insert on public.quality_survey_invitations
  for each row execute function public.force_created_by();


-- ============================================================================
-- 7 · RESPUESTAS Y ANSWERS (VC-11, §20, §21, §22, §24, §40)
-- ----------------------------------------------------------------------------
-- Una respuesta enviada es un HECHO histórico. Un «5» no se convierte en «10»
-- con un `update`: si hiciera falta corregirla, se registra una respuesta nueva
-- que sustituye a la anterior, y las dos se conservan (§61).
--
-- §22 · En una campaña ANÓNIMA, la respuesta no guarda cliente, ni contacto, ni
-- nombre, ni correo, ni invitación, ni autor. Una restricción de la base lo
-- impone: no depende de que la aplicación se acuerde.
-- ============================================================================

create table public.quality_survey_responses (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  campaign_id       uuid not null,
  -- §16 · La versión con la que se respondió, atada a la fila. Aunque la
  -- campaña cambiara de versión —que no puede— esta respuesta ya sabe cuál.
  version_id        uuid not null,

  status            text not null default 'draft',
  submitted_at      timestamptz,

  -- §7 · Quién responde NO es necesariamente un contacto registrado.
  respondent_kind   text not null default 'anonymous',
  customer_id       uuid,
  contact_id        uuid,
  respondent_name   text,
  respondent_email  text,
  invitation_id     uuid,

  -- De dónde llegó: enlace público, captura interna o importación externa
  -- (VC-25).
  source            text not null default 'public_link',
  source_note       text,

  -- §61 · Corrección administrativa: nunca sobrescritura.
  supersedes_id     uuid,
  superseded_by     uuid,
  correction_note   text,

  created_at        timestamptz not null default now(),

  constraint quality_survey_responses_org_id_uniq unique (organization_id, id),
  constraint quality_survey_responses_status_check
    check (status in ('draft', 'submitted', 'void')),
  constraint quality_survey_responses_submitted_consistent
    check ((status = 'submitted') = (submitted_at is not null)),
  constraint quality_survey_responses_kind_check
    check (respondent_kind in ('anonymous', 'contact', 'customer', 'named', 'user')),
  constraint quality_survey_responses_source_check
    check (source in ('public_link', 'internal', 'imported')),
  -- Coherencia interna: quien dice ser anónimo no lleva identidad encima.
  constraint quality_survey_responses_anonymous_shape_check
    check (respondent_kind <> 'anonymous'
        or (customer_id is null and contact_id is null and respondent_name is null
            and respondent_email is null and invitation_id is null)),
  constraint quality_survey_responses_campaign_fk
    foreign key (organization_id, campaign_id)
    references public.quality_survey_campaigns (organization_id, id) on delete restrict,
  constraint quality_survey_responses_version_fk
    foreign key (organization_id, version_id)
    references public.quality_survey_versions (organization_id, id) on delete restrict,
  constraint quality_survey_responses_customer_fk
    foreign key (organization_id, customer_id)
    references public.quality_customer_profiles (organization_id, id) on delete set null,
  constraint quality_survey_responses_contact_fk
    foreign key (organization_id, contact_id)
    references public.quality_external_party_contacts (organization_id, id) on delete set null,
  constraint quality_survey_responses_invitation_fk
    foreign key (organization_id, invitation_id)
    references public.quality_survey_invitations (organization_id, id) on delete set null,
  constraint quality_survey_responses_supersedes_fk
    foreign key (organization_id, supersedes_id)
    references public.quality_survey_responses (organization_id, id) on delete set null
);

create index quality_survey_responses_campaign_idx
  on public.quality_survey_responses (organization_id, campaign_id, status);
create index quality_survey_responses_customer_idx
  on public.quality_survey_responses (organization_id, customer_id)
  where customer_id is not null;

comment on table public.quality_survey_responses is
  'QUALITY-08 · VC-11 · Una respuesta enviada es un hecho histórico. En campaña anónima la fila NO puede llevar identidad, y lo impone la base.';

comment on column public.quality_survey_responses.invitation_id is
  'Solo en campañas IDENTIFICADAS. En una anónima queda nulo por restricción: es el puente que rompería la promesa.';


create table public.quality_survey_answers (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  response_id       uuid not null,
  question_id       uuid not null,

  -- §40 · «No aplica» y «sin responder» son estados propios. Ninguno es cero.
  outcome           text not null default 'answered',

  value_numeric     numeric(12,4),
  value_text        text,
  value_choices     text[],

  created_at        timestamptz not null default now(),

  constraint quality_survey_answers_org_id_uniq unique (organization_id, id),
  constraint quality_survey_answers_uniq unique (response_id, question_id),
  constraint quality_survey_answers_outcome_check
    check (outcome in ('answered', 'not_applicable', 'skipped')),
  -- Lo que no se respondió no lleva valor. Sin esto, un «no aplica» con un 0
  -- pegado acabaría contando como la peor calificación posible.
  constraint quality_survey_answers_empty_check
    check (outcome = 'answered'
        or (value_numeric is null and value_text is null and value_choices is null)),
  constraint quality_survey_answers_response_fk
    foreign key (organization_id, response_id)
    references public.quality_survey_responses (organization_id, id) on delete cascade,
  constraint quality_survey_answers_question_fk
    foreign key (organization_id, question_id)
    references public.quality_survey_questions (organization_id, id) on delete restrict
);

create index quality_survey_answers_question_idx
  on public.quality_survey_answers (organization_id, question_id, outcome);

comment on table public.quality_survey_answers is
  'QUALITY-08 · §40 · «No aplica» no es un cero: sale del cálculo y se cuenta aparte.';


-- ----------------------------------------------------------------------------
-- 7.1 · Las guardas que sostienen la promesa
-- ----------------------------------------------------------------------------

-- §22 · Una respuesta de campaña anónima no puede llevar identidad, venga por
-- donde venga. La comprobación NO puede vivir en un `check` de tabla porque el
-- anonimato es de la campaña; vive aquí, en la única puerta que existe.
create or replace function public.quality_response_matches_campaign_anonymity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign record;
begin
  select * into v_campaign from quality_survey_campaigns where id = new.campaign_id;
  if v_campaign.id is null then
    raise exception 'Esa campaña no existe.';
  end if;
  if v_campaign.organization_id <> new.organization_id then
    raise exception 'Esa campaña no es de esta empresa.';
  end if;

  -- La versión de la respuesta es la de su campaña, siempre.
  if new.version_id is distinct from v_campaign.version_id then
    raise exception 'Una respuesta se recoge con la versión de encuesta de su campaña.';
  end if;

  if v_campaign.anonymity_mode = 'anonymous' then
    if new.customer_id is not null or new.contact_id is not null
       or new.respondent_name is not null or new.respondent_email is not null
       or new.invitation_id is not null then
      raise exception 'Esta campaña es anónima: su respuesta no puede llevar cliente, contacto, nombre, correo ni invitación.';
    end if;
    if new.respondent_kind <> 'anonymous' then
      raise exception 'Esta campaña es anónima: la respuesta solo puede registrarse como anónima.';
    end if;
  end if;

  return new;
end;
$$;

create trigger t_quality_responses_anonymity
  before insert or update on public.quality_survey_responses
  for each row execute function public.quality_response_matches_campaign_anonymity();


-- VC-11/§20 · UNA RESPUESTA ENVIADA ES FINAL.
--
-- En borrador se edita —la interfaz necesita guardar a medias—. Enviada, no se
-- toca: ni el estado, ni sus respuestas, ni por la puerta de atrás. Lo único
-- que se permite después es marcarla como sustituida por una corrección, y esa
-- corrección es otra fila.
create or replace function public.quality_response_is_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'submitted' then
      raise exception 'Una respuesta enviada no se elimina: se conserva, y si hace falta se corrige con una respuesta nueva.';
    end if;
    return old;
  end if;

  if old.status = 'submitted' then
    -- Se admite EXACTAMENTE una transición: dejarla marcada como sustituida.
    if new.status is distinct from old.status
       or new.campaign_id is distinct from old.campaign_id
       or new.version_id is distinct from old.version_id
       or new.submitted_at is distinct from old.submitted_at
       or new.respondent_kind is distinct from old.respondent_kind
       or new.customer_id is distinct from old.customer_id
       or new.contact_id is distinct from old.contact_id
       or new.respondent_name is distinct from old.respondent_name
       or new.respondent_email is distinct from old.respondent_email
       or new.invitation_id is distinct from old.invitation_id
       or new.source is distinct from old.source then
      raise exception 'Esta respuesta ya fue enviada. Para corregirla se registra una respuesta nueva que la sustituye; la original se conserva.';
    end if;
  end if;
  return new;
end;
$$;

create trigger t_quality_responses_submitted_is_final
  before update or delete on public.quality_survey_responses
  for each row execute function public.quality_response_is_submitted();


-- Y sus answers: cambiar un valor de una respuesta enviada cambiaría su
-- resultado por la puerta de atrás.
create or replace function public.quality_answer_parent_is_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from quality_survey_responses
   where id = coalesce(new.response_id, old.response_id);
  if v_status = 'submitted' then
    raise exception 'La respuesta ya fue enviada: sus valores no se pueden cambiar.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger t_quality_answers_parent_is_open
  before insert or update or delete on public.quality_survey_answers
  for each row execute function public.quality_answer_parent_is_open();


-- La respuesta y su pregunta tienen que ser de la MISMA versión. Sin esta
-- comprobación se podría contestar la pregunta de otra encuesta y el análisis
-- mezclaría cosas que nunca se preguntaron juntas.
create or replace function public.quality_answer_question_belongs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_response_version uuid;
  v_question_version uuid;
begin
  select version_id into v_response_version from quality_survey_responses where id = new.response_id;
  select version_id into v_question_version from quality_survey_questions where id = new.question_id;
  if v_response_version is null or v_question_version is null
     or v_response_version <> v_question_version then
    raise exception 'Esa pregunta no pertenece a la versión con la que se está respondiendo.';
  end if;
  return new;
end;
$$;

create trigger t_quality_answers_question_belongs
  before insert or update on public.quality_survey_answers
  for each row execute function public.quality_answer_question_belongs();


-- ============================================================================
-- 8 · MÉTRICAS DE SATISFACCIÓN (VC-12, VC-13, VC-28, §14, §15, §36, §37)
-- ----------------------------------------------------------------------------
-- VC-13 · Trazaloop NO impone NPS, ni CSAT, ni ninguna metodología universal.
-- La empresa define sus métricas; el sistema las calcula y guarda CÓMO las
-- calculó (VC-12: la metodología es histórica).
--
-- §14 · Y si algo se llama NPS, tiene que serlo: escala 0–10, promotores 9–10,
-- pasivos 7–8, detractores 0–6, resultado = %promotores − %detractores. Llamar
-- NPS a un promedio cualquiera es la clase de error que sobrevive años porque
-- nadie vuelve a mirar la fórmula.
--
-- §37 · COMPARABILIDAD. Cambiar la pregunta, la escala o la fórmula rompe la
-- serie. `comparability_key` lo hace visible: dos resultados con claves
-- distintas no son la misma línea, y la gráfica tiene que cortarse.
-- ============================================================================

create table public.quality_customer_metric_definitions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  code              text,
  name              text not null,
  description       text,

  -- Cómo se calcula. `custom` existe para que una empresa pueda declarar una
  -- métrica propia sin que el producto finja conocerla.
  method            text not null,
  -- §12 · Sobre qué pregunta, identificada por su clave estable.
  question_stable_key text,
  -- La escala que la métrica ESPERA. Si la versión no la cumple, no se calcula.
  expects_scale_min integer,
  expects_scale_max integer,
  -- Para `top_box`: a partir de qué valor cuenta como respuesta favorable.
  top_box_min       integer,

  unit              text not null default 'score',
  direction         text not null default 'higher_is_better',
  formula_note      text,
  is_active         boolean not null default true,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_customer_metric_definitions_org_id_uniq unique (organization_id, id),
  constraint quality_customer_metric_definitions_name_not_blank check (length(trim(name)) > 0),
  constraint quality_customer_metric_definitions_method_check
    check (method in ('nps', 'csat', 'average', 'top_box', 'response_count', 'custom')),
  constraint quality_customer_metric_definitions_unit_check
    check (unit in ('score', 'percent', 'count')),
  constraint quality_customer_metric_definitions_direction_check
    check (direction in ('higher_is_better', 'lower_is_better')),
  -- §14 · Solo se puede llamar NPS a lo que se mide de 0 a 10.
  constraint quality_customer_metric_definitions_nps_check
    check (method <> 'nps'
        or (expects_scale_min = 0 and expects_scale_max = 10
            and question_stable_key is not null)),
  -- Las métricas sobre una pregunta necesitan saber cuál.
  constraint quality_customer_metric_definitions_question_check
    check (method in ('response_count', 'custom') or question_stable_key is not null),
  constraint quality_customer_metric_definitions_topbox_check
    check (method <> 'top_box' or top_box_min is not null)
);

create unique index quality_customer_metric_definitions_code_uniq
  on public.quality_customer_metric_definitions (organization_id, lower(code)) where code is not null;

comment on table public.quality_customer_metric_definitions is
  'QUALITY-08 · VC-13 · La empresa define sus métricas. NPS solo se llama NPS con escala 0–10, y la base lo impone.';

create trigger t_quality_customer_metric_definitions_updated
  before update on public.quality_customer_metric_definitions
  for each row execute function public.set_updated_at();
create trigger t_quality_customer_metric_definitions_org_immutable
  before update on public.quality_customer_metric_definitions
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_customer_metric_definitions_force_created_by
  before insert on public.quality_customer_metric_definitions
  for each row execute function public.force_created_by();


create table public.quality_customer_metric_results (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  campaign_id       uuid not null,
  definition_id     uuid not null,

  -- §39 · Nulo cuando no hay con qué calcular. Cero significa otra cosa.
  value             numeric(12,4),
  -- §38 · Cuántas respuestas entraron en el cálculo, y cuántas se quedaron
  -- fuera por «no aplica» o por no haberla contestado.
  sample_size       integer not null default 0,
  not_applicable    integer not null default 0,
  skipped           integer not null default 0,
  -- La distribución, para poder enseñar el reparto sin recalcularlo.
  distribution      jsonb,

  -- VC-12/VC-28 · Cómo se calculó, congelado con el resultado.
  method_snapshot   jsonb not null,
  -- §37 · Dos resultados con claves distintas NO son la misma serie.
  comparability_key text not null,

  computed_at       timestamptz not null default now(),
  computed_by       uuid references public.profiles (id),
  notes             text,

  constraint quality_customer_metric_results_org_id_uniq unique (organization_id, id),
  constraint quality_customer_metric_results_uniq unique (campaign_id, definition_id),
  constraint quality_customer_metric_results_counts_check
    check (sample_size >= 0 and not_applicable >= 0 and skipped >= 0),
  constraint quality_customer_metric_results_campaign_fk
    foreign key (organization_id, campaign_id)
    references public.quality_survey_campaigns (organization_id, id) on delete cascade,
  constraint quality_customer_metric_results_definition_fk
    foreign key (organization_id, definition_id)
    references public.quality_customer_metric_definitions (organization_id, id) on delete restrict
);

create index quality_customer_metric_results_definition_idx
  on public.quality_customer_metric_results (organization_id, definition_id, computed_at desc);

comment on table public.quality_customer_metric_results is
  'QUALITY-08 · VC-28 · El resultado con su linaje: cuántas respuestas entraron, cuántas quedaron fuera, con qué método y con qué clave de comparabilidad.';

-- Un resultado calculado es un hecho fechado: recalcular es calcular otra vez.
create trigger t_quality_customer_metric_results_immutable
  before update on public.quality_customer_metric_results
  for each row execute function public.quality_ro_record_is_immutable();


-- ============================================================================
-- 9 · RETROALIMENTACIÓN Y QUEJAS (VC-16, VC-22, VC-30, VC-31, §28…§32)
-- ----------------------------------------------------------------------------
-- §28 · La voz del cliente NO tiene que pasar por una encuesta. «Llamó para
-- felicitar», «sugirió que el embalaje…», «presentó una queja»: eso se registra
-- tal cual, con su fuente y su fecha.
--
-- §29 · Y no se reduce a positivo/negativo. Una felicitación es información
-- gestionable (VC-31) y una sugerencia no es una queja.
--
-- §30 · OBLIGATORIO · UNA QUEJA NO ES UNA NO CONFORMIDAD.
--
-- Registrar una queja no crea ninguna NC, y tampoco crea un caso (§31). El
-- camino es: queja → evaluación humana → caso → hallazgo → NC, y cada flecha
-- es una decisión de alguien. Esta tabla no tiene ninguna columna de
-- clasificación de NC: la clasificación vive en el caso, donde QUALITY-04 la
-- puso.
-- ============================================================================

create table public.quality_customer_feedback (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  -- El cliente, cuando se sabe. Una queja puede llegar de alguien que todavía
  -- no está registrado, y obligar a crearlo antes hace que no se registre nada.
  customer_id       uuid,
  contact_id        uuid,
  -- Cuando no hay ficha: el nombre que dio quien llamó.
  reporter_name     text,

  feedback_kind     text not null,
  voice_source      text not null default 'spontaneous',
  channel           text,
  topic_id          uuid,

  received_on       date not null default current_date,
  title             text not null,
  description       text,
  severity          text not null default 'normal',

  -- MDR-33 · Responsable estructural.
  owner_position_id uuid,
  status            text not null default 'open',

  -- §32 · Cuando nació de una encuesta, se conserva de cuál. En campaña
  -- anónima esto queda NULO: un comentario anónimo que apuntara a su respuesta
  -- y a un cliente reidentificaría a quien lo escribió.
  response_id       uuid,
  -- §31/§32 · El caso, SOLO si alguien decidió abrirlo.
  case_id           uuid,

  resolution_note   text,
  answered_at       timestamptz,
  closed_at         timestamptz,
  closed_by         uuid references public.profiles (id),

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_customer_feedback_org_id_uniq unique (organization_id, id),
  constraint quality_customer_feedback_title_not_blank check (length(trim(title)) > 0),
  constraint quality_customer_feedback_kind_check
    check (feedback_kind in ('complaint', 'claim', 'suggestion', 'compliment', 'comment', 'other')),
  constraint quality_customer_feedback_source_check
    check (voice_source in ('relational', 'periodic', 'transactional', 'spontaneous')),
  constraint quality_customer_feedback_severity_check
    check (severity in ('low', 'normal', 'high', 'critical')),
  constraint quality_customer_feedback_status_check
    check (status in ('open', 'under_review', 'answered', 'closed', 'dismissed')),
  constraint quality_customer_feedback_closed_consistent
    check ((status in ('closed', 'dismissed')) = (closed_at is not null)),
  constraint quality_customer_feedback_customer_fk
    foreign key (organization_id, customer_id)
    references public.quality_customer_profiles (organization_id, id) on delete set null,
  constraint quality_customer_feedback_contact_fk
    foreign key (organization_id, contact_id)
    references public.quality_external_party_contacts (organization_id, id) on delete set null,
  constraint quality_customer_feedback_topic_fk
    foreign key (organization_id, topic_id)
    references public.quality_customer_topics (organization_id, id) on delete set null,
  constraint quality_customer_feedback_owner_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete set null,
  constraint quality_customer_feedback_response_fk
    foreign key (organization_id, response_id)
    references public.quality_survey_responses (organization_id, id) on delete set null,
  constraint quality_customer_feedback_case_fk
    foreign key (organization_id, case_id)
    references public.work_cases (organization_id, id) on delete set null
);

create index quality_customer_feedback_org_idx
  on public.quality_customer_feedback (organization_id, feedback_kind, status, received_on desc);
create index quality_customer_feedback_customer_idx
  on public.quality_customer_feedback (organization_id, customer_id)
  where customer_id is not null;

comment on table public.quality_customer_feedback is
  'QUALITY-08 · VC-16/VC-30 · Retroalimentación y quejas. NO lleva clasificación de no conformidad: eso se decide en el caso, con QUALITY-04.';

create trigger t_quality_customer_feedback_updated
  before update on public.quality_customer_feedback
  for each row execute function public.set_updated_at();
create trigger t_quality_customer_feedback_org_immutable
  before update on public.quality_customer_feedback
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_customer_feedback_force_created_by
  before insert on public.quality_customer_feedback
  for each row execute function public.force_created_by();
create trigger t_audit_quality_customer_feedback
  after insert or update or delete on public.quality_customer_feedback
  for each row execute function public.audit_row_change();


-- §32/§44 · UN COMENTARIO DE CAMPAÑA ANÓNIMA NO SE ATA A UN CLIENTE.
--
-- Es el atajo más fácil de cometer: alguien escala un comentario anónimo a una
-- queja, le pone el cliente «porque se nota de quién es», y la respuesta queda
-- atribuida para siempre. La base lo impide.
create or replace function public.quality_feedback_respects_anonymity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
begin
  if new.response_id is null then return new; end if;

  select c.anonymity_mode into v_mode
    from quality_survey_responses r
    join quality_survey_campaigns c on c.id = r.campaign_id
   where r.id = new.response_id;

  if v_mode = 'anonymous'
     and (new.customer_id is not null or new.contact_id is not null
          or new.reporter_name is not null) then
    raise exception 'Ese comentario viene de una campaña anónima: no se le puede poner cliente, contacto ni nombre sin romper el anonimato que se prometió.';
  end if;
  return new;
end;
$$;

create trigger t_quality_feedback_respects_anonymity
  before insert or update on public.quality_customer_feedback
  for each row execute function public.quality_feedback_respects_anonymity();


-- ============================================================================
-- 10 · SEÑALES (VC-17, VC-18, §34, §35)
-- ----------------------------------------------------------------------------
-- Una satisfacción que cae es una SEÑAL. No es una no conformidad, no es un
-- riesgo y no es una acción correctiva. Dice «mira esto», y quien mira decide.
-- ============================================================================

create table public.quality_customer_signals (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  signal_kind       text not null,
  detail            text,

  customer_id       uuid,
  campaign_id       uuid,
  definition_id     uuid,
  feedback_id       uuid,

  status            text not null default 'open',
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  resolved_at       timestamptz,
  -- Si alguien decidió que merecía un caso, queda dicho aquí. La señal no lo
  -- abre sola.
  case_id           uuid,

  constraint quality_customer_signals_org_id_uniq unique (organization_id, id),
  constraint quality_customer_signals_kind_check
    check (signal_kind in ('satisfaction_drop', 'complaints_increase', 'high_detractors',
                           'low_campaign_result', 'campaign_closing_low_responses',
                           'complaint_unreviewed', 'comparability_break')),
  constraint quality_customer_signals_status_check
    check (status in ('open', 'resolved', 'dismissed')),
  constraint quality_customer_signals_customer_fk
    foreign key (organization_id, customer_id)
    references public.quality_customer_profiles (organization_id, id) on delete cascade,
  constraint quality_customer_signals_campaign_fk
    foreign key (organization_id, campaign_id)
    references public.quality_survey_campaigns (organization_id, id) on delete cascade,
  constraint quality_customer_signals_definition_fk
    foreign key (organization_id, definition_id)
    references public.quality_customer_metric_definitions (organization_id, id) on delete cascade,
  constraint quality_customer_signals_feedback_fk
    foreign key (organization_id, feedback_id)
    references public.quality_customer_feedback (organization_id, id) on delete cascade,
  constraint quality_customer_signals_case_fk
    foreign key (organization_id, case_id)
    references public.work_cases (organization_id, id) on delete set null
);

-- El barrido tiene que poder correr dos veces sin duplicar nada.
create unique index quality_customer_signals_dedupe
  on public.quality_customer_signals (
    organization_id, signal_kind,
    coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(definition_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(feedback_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'open';

comment on table public.quality_customer_signals is
  'QUALITY-08 · VC-17 · Una señal invita a mirar. No abre casos, no clasifica no conformidades y no crea riesgos.';


-- ============================================================================
-- 11 · CIERRE ANUAL DE SATISFACCIÓN (VC-05, VC-06)
-- ----------------------------------------------------------------------------
-- La captura de voz es continua; la política aprobada exige además una revisión
-- consolidada FORMAL para los segmentos aplicables, y esa revisión incluye
-- revisar la metodología (VC-06): si el instrumento dejó de servir, decirlo es
-- parte del acto.
--
-- No es la Revisión por la Dirección (§53): es el cierre del dominio, y está
-- pensado para que RD pueda consumirlo sin duplicar nada.
-- ============================================================================

create table public.quality_customer_voice_reviews (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  period_label      text not null,
  period_start      date not null,
  period_end        date not null,
  scope_note        text,

  status            text not null default 'draft',

  -- VC-06 · La metodología se revisa como parte del cierre.
  methodology_note  text,
  methodology_verdict text,
  conclusions       text,

  -- El retrato de lo que se consolidó, congelado con el cierre.
  summary_snapshot  jsonb,

  owner_position_id uuid,
  closed_at         timestamptz,
  closed_by         uuid references public.profiles (id),

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint quality_customer_voice_reviews_org_id_uniq unique (organization_id, id),
  constraint quality_customer_voice_reviews_period_check check (period_end >= period_start),
  constraint quality_customer_voice_reviews_label_not_blank check (length(trim(period_label)) > 0),
  constraint quality_customer_voice_reviews_status_check check (status in ('draft', 'closed')),
  constraint quality_customer_voice_reviews_closed_consistent
    check ((status = 'closed') = (closed_at is not null)),
  -- VC-06 · Un cierre sin veredicto sobre la metodología es media revisión.
  constraint quality_customer_voice_reviews_verdict_check
    check (methodology_verdict is null
        or methodology_verdict in ('adequate', 'needs_change', 'changed')),
  constraint quality_customer_voice_reviews_closed_fields
    check (status <> 'closed'
        or (methodology_verdict is not null
            and nullif(btrim(coalesce(conclusions, '')), '') is not null)),
  constraint quality_customer_voice_reviews_owner_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete set null
);

create unique index quality_customer_voice_reviews_period_uniq
  on public.quality_customer_voice_reviews (organization_id, lower(period_label));

comment on table public.quality_customer_voice_reviews is
  'QUALITY-08 · VC-05/VC-06 · El cierre formal y consolidado del periodo, con revisión de la metodología. Inmutable una vez cerrado.';

create trigger t_quality_customer_voice_reviews_updated
  before update on public.quality_customer_voice_reviews
  for each row execute function public.set_updated_at();
create trigger t_quality_customer_voice_reviews_org_immutable
  before update on public.quality_customer_voice_reviews
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_customer_voice_reviews_force_created_by
  before insert on public.quality_customer_voice_reviews
  for each row execute function public.force_created_by();
create trigger t_audit_quality_customer_voice_reviews
  after insert or update or delete on public.quality_customer_voice_reviews
  for each row execute function public.audit_row_change();

create or replace function public.quality_voice_review_is_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'closed' then
      raise exception 'Un cierre anual de satisfacción no se elimina.';
    end if;
    return old;
  end if;
  if old.status = 'closed' then
    raise exception 'Este periodo ya está cerrado. Sus conclusiones son un acto formal y no se reescriben.';
  end if;
  return new;
end;
$$;

create trigger t_quality_voice_reviews_closed_is_final
  before update or delete on public.quality_customer_voice_reviews
  for each row execute function public.quality_voice_review_is_closed();


-- ============================================================================
-- 12 · ENSANCHE DE LOS MOTORES TRANSVERSALES (MDR-46, §33, §57, §58)
-- ----------------------------------------------------------------------------
-- Aquí NO se crean `quality_customer_actions`, `quality_customer_tasks` ni
-- `quality_customer_cases`. Se admiten los sujetos nuevos en los catálogos
-- cerrados que ya existen, de forma ADITIVA: ningún valor anterior desaparece,
-- así que nada de QUALITY-01…07 deja de validar.
--
-- Y dos cosas que NO hubo que tocar, porque QUALITY-04 ya las había previsto:
-- `work_cases.case_type` ya admite 'complaint' y `origin_kind` ya admite
-- 'customer'. Un caso abierto desde una queja nace con classification
-- 'pending', que es exactamente lo que §30 exige.
-- ============================================================================

alter table public.work_tasks  drop constraint work_tasks_source_domain_check;
alter table public.work_tasks  add constraint work_tasks_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action',
                           'risk','opportunity','control',
                           'person','position','competence','development',
                           'learning','performance','knowledge','lesson',
                           'supplier','customer'));
alter table public.work_tasks  drop constraint work_tasks_subject_type_check;
alter table public.work_tasks  add constraint work_tasks_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                          'work_case','work_action',
                          'quality_risk','quality_opportunity','quality_control',
                          'quality_person','quality_position','quality_person_competency',
                          'quality_competency_evidence','quality_development_plan_item',
                          'quality_learning_activity','quality_performance_evaluation',
                          'quality_knowledge_item','quality_knowledge_transfer_plan',
                          'quality_lesson_learned',
                          'quality_supplier_profile','quality_supplier_scope',
                          'quality_supplier_evaluation','quality_supplier_document',
                          'quality_customer_profile','quality_survey_campaign',
                          'quality_customer_feedback','quality_customer_voice_review'));
alter table public.work_tasks  drop constraint work_tasks_type_check;
alter table public.work_tasks  add constraint work_tasks_type_check
  check (task_type in ('document_review','document_approval','document_changes_requested',
                       'indicator_measurement_due','indicator_off_target',
                       'case_evaluation','case_closure','action_execution','action_effectiveness',
                       'risk_review_due','risk_assessment_due','risk_treatment_approval',
                       'control_verification','opportunity_review',
                       'competence_evidence_renewal','competence_assessment_due',
                       'performance_evaluation_due','development_item_execution',
                       'learning_effectiveness_review','knowledge_transfer_execution',
                       'knowledge_continuity_review','lesson_proposal_decision',
                       'supplier_reevaluation_due','supplier_evaluation_completion',
                       'supplier_approval_review','supplier_document_renewal',
                       'supplier_criticality_review',
                       'complaint_review','campaign_closing_review',
                       'customer_signal_review','customer_voice_review_due'));

alter table public.work_alerts drop constraint work_alerts_source_domain_check;
alter table public.work_alerts add constraint work_alerts_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action',
                           'risk','opportunity','control',
                           'person','position','competence','development',
                           'learning','performance','knowledge','lesson',
                           'supplier','customer'));
alter table public.work_alerts drop constraint work_alerts_subject_type_check;
alter table public.work_alerts add constraint work_alerts_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                          'work_case','work_action',
                          'quality_risk','quality_opportunity','quality_control',
                          'quality_person','quality_position','quality_person_competency',
                          'quality_competency_evidence','quality_development_plan_item',
                          'quality_learning_activity','quality_performance_evaluation',
                          'quality_knowledge_item','quality_knowledge_transfer_plan',
                          'quality_lesson_learned',
                          'quality_supplier_profile','quality_supplier_scope',
                          'quality_supplier_evaluation','quality_supplier_document',
                          'quality_customer_profile','quality_survey_campaign',
                          'quality_customer_feedback','quality_customer_voice_review'));
alter table public.work_alerts drop constraint work_alerts_type_check;
alter table public.work_alerts add constraint work_alerts_type_check
  check (alert_type in ('document_review_requested','document_approval_requested',
                        'document_changes_requested','document_approved','document_retired',
                        'indicator_measurement_due','indicator_target_missed','objective_at_risk',
                        'case_assigned','action_assigned','action_overdue','effectiveness_due',
                        'risk_review_overdue','risk_above_appetite','risk_materialized',
                        'control_ineffective','opportunity_assigned',
                        'competence_evidence_expiring','competence_evidence_expired',
                        'performance_evaluation_pending','development_plan_overdue',
                        'learning_effectiveness_pending','knowledge_single_holder',
                        'knowledge_transfer_overdue','critical_position_vacant',
                        'supplier_reevaluation_overdue','supplier_approval_expiring',
                        'supplier_approval_expired','supplier_document_expiring',
                        'supplier_document_expired','supplier_critical_unapproved',
                        'supplier_incident_streak',
                        -- §34 · Ninguno de estos abre una NC ni un riesgo: dicen
                        -- que hay algo que mirar.
                        'complaint_unreviewed','campaign_closing_soon',
                        'campaign_low_response','satisfaction_drop',
                        'customer_signal_raised','voice_review_due'));

alter table public.work_events drop constraint work_events_source_domain_check;
alter table public.work_events add constraint work_events_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action',
                           'risk','opportunity','control',
                           'person','position','competence','development',
                           'learning','performance','knowledge','lesson',
                           'supplier','customer'));
alter table public.work_events drop constraint work_events_subject_type_check;
alter table public.work_events add constraint work_events_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                          'work_case','work_action',
                          'quality_risk','quality_opportunity','quality_control',
                          'quality_person','quality_position','quality_person_competency',
                          'quality_competency_evidence','quality_development_plan_item',
                          'quality_learning_activity','quality_performance_evaluation',
                          'quality_knowledge_item','quality_knowledge_transfer_plan',
                          'quality_lesson_learned',
                          'quality_supplier_profile','quality_supplier_scope',
                          'quality_supplier_evaluation','quality_supplier_document',
                          'quality_customer_profile','quality_survey_campaign',
                          'quality_customer_feedback','quality_customer_voice_review'));
alter table public.work_events drop constraint work_events_type_check;
alter table public.work_events add constraint work_events_type_check
  check (event_type in ('indicator.target_missed','indicator.attention','indicator.recovered',
                        'indicator.measurement_due','indicator.source_failed','objective.at_risk',
                        'case.opened','case.classified','case.closed','case.reopened',
                        'action.planned','action.completed','action.verified','action.overdue',
                        'risk.identified','risk.assessed','risk.treated','risk.accepted',
                        'risk.materialized','risk.reviewed','risk.closed','risk.reopened',
                        'control.linked','control.reviewed',
                        'opportunity.identified','opportunity.assessed','opportunity.treated',
                        'opportunity.closed',
                        'assignment.started','assignment.ended','position.version_published',
                        'competence.assessed','competence.evidence_expired',
                        'development.need_created','development.item_planned',
                        'learning.completed','learning.effectiveness_reviewed',
                        'performance.evaluation_closed',
                        'knowledge.holder_added','knowledge.holder_removed',
                        'knowledge.concentration_detected','knowledge.transfer_verified',
                        'lesson.published','lesson.proposal_decided',
                        'supplier.registered','supplier.adopted','supplier.classified',
                        'supplier.evaluated','supplier.approved','supplier.suspended',
                        'supplier.reinstated','supplier.withdrawn',
                        'supplier.incident_recorded','supplier.document_expired',
                        'survey.version_published','campaign.opened','campaign.closed',
                        'campaign.reopened','campaign.metrics_computed',
                        'feedback.recorded','complaint.escalated_to_case',
                        'voice.review_closed'));

alter table public.work_decisions drop constraint work_decisions_decision_kind_check;
alter table public.work_decisions add constraint work_decisions_decision_kind_check
  check (decision_kind in ('case_opened','classification','correction_needed',
                           'cause_approved','action_planned','action_completed',
                           'effectiveness','closure','reopen','concession',
                           'risk_identified','risk_assessed','risk_treatment',
                           'risk_acceptance','risk_review','risk_materialized',
                           'control_effectiveness','opportunity_assessed',
                           'opportunity_treatment','competence_decision',
                           'competence_revocation','performance_result','lesson_proposal',
                           'knowledge_transfer_verification','supplier_criticality',
                           'supplier_evaluation_closed','supplier_approval',
                           'customer_voice_period_closed'));

alter table public.work_decisions drop constraint work_decisions_subject_kind_check;
alter table public.work_decisions add constraint work_decisions_subject_kind_check
  check (subject_kind in ('case','action','risk','opportunity','control',
                          'person_competency','performance_evaluation','lesson',
                          'knowledge_transfer','supplier_scope','supplier_evaluation',
                          'survey_campaign','customer_feedback','customer_voice_review'));

alter table public.work_references drop constraint work_references_owner_kind_check;
alter table public.work_references add constraint work_references_owner_kind_check
  check (owner_kind in ('case','action','risk','opportunity','control','risk_assessment',
                        'person_competency','competency_evidence','knowledge_item',
                        'knowledge_transfer_plan','lesson','development_need',
                        'learning_activity','performance_evaluation',
                        'supplier_profile','supplier_scope','supplier_evaluation',
                        'supplier_incident',
                        'customer_profile','customer_feedback','survey_campaign',
                        'customer_voice_review'));
alter table public.work_references drop constraint work_references_ref_kind_check;
alter table public.work_references add constraint work_references_ref_kind_check
  check (ref_kind in ('quality_indicator','quality_measurement','quality_process',
                      'quality_process_revision','quality_process_io',
                      'trazadoc_document','trazadoc_document_revision',
                      'work_case','work_action','quality_objective',
                      'quality_risk','quality_opportunity','quality_control',
                      'quality_risk_assessment','quality_risk_materialization',
                      'quality_person','quality_position','quality_competency',
                      'quality_person_competency','quality_knowledge_item',
                      'quality_lesson_learned','quality_learning_activity',
                      'quality_external_party','quality_supplier_profile',
                      'quality_supplier_scope','quality_supplier_evaluation',
                      'quality_supplier_document','quality_supplier_incident',
                      'quality_customer_profile','quality_customer_feedback',
                      'quality_survey_campaign','quality_survey_response',
                      'quality_customer_voice_review'));


-- La validación de referencias tiene que conocer los sujetos nuevos: si no, una
-- referencia legítima se rechazaría por «no existe».
create or replace function public.work_reference_must_be_valid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org       uuid;
  v_owner_org uuid;
begin
  v_org := case new.ref_kind
    when 'quality_indicator'          then (select organization_id from quality_indicators where id = new.ref_id)
    when 'quality_measurement'        then (select organization_id from quality_measurements where id = new.ref_id)
    when 'quality_process'            then (select organization_id from quality_processes where id = new.ref_id)
    when 'quality_process_revision'   then (select organization_id from quality_process_revisions where id = new.ref_id)
    when 'quality_process_io'         then (select organization_id from quality_process_io where id = new.ref_id)
    when 'trazadoc_document'          then (select organization_id from trazadoc_documents where id = new.ref_id)
    when 'trazadoc_document_revision' then (select organization_id from trazadoc_document_revisions where id = new.ref_id)
    when 'work_case'                  then (select organization_id from work_cases where id = new.ref_id)
    when 'work_action'                then (select organization_id from work_actions where id = new.ref_id)
    when 'quality_objective'          then (select organization_id from quality_objectives where id = new.ref_id)
    when 'quality_risk'               then (select organization_id from quality_risks where id = new.ref_id)
    when 'quality_opportunity'        then (select organization_id from quality_opportunities where id = new.ref_id)
    when 'quality_control'            then (select organization_id from quality_controls where id = new.ref_id)
    when 'quality_risk_assessment'    then (select organization_id from quality_risk_assessments where id = new.ref_id)
    when 'quality_risk_materialization' then (select organization_id from quality_risk_materializations where id = new.ref_id)
    when 'quality_person'             then (select organization_id from quality_people where id = new.ref_id)
    when 'quality_position'           then (select organization_id from quality_positions where id = new.ref_id)
    when 'quality_competency'         then (select organization_id from quality_competencies where id = new.ref_id)
    when 'quality_person_competency'  then (select organization_id from quality_person_competencies where id = new.ref_id)
    when 'quality_knowledge_item'     then (select organization_id from quality_knowledge_items where id = new.ref_id)
    when 'quality_lesson_learned'     then (select organization_id from quality_lessons_learned where id = new.ref_id)
    when 'quality_learning_activity'  then (select organization_id from quality_learning_activities where id = new.ref_id)
    when 'quality_external_party'     then (select organization_id from quality_external_parties where id = new.ref_id)
    when 'quality_supplier_profile'   then (select organization_id from quality_supplier_profiles where id = new.ref_id)
    when 'quality_supplier_scope'     then (select organization_id from quality_supplier_scopes where id = new.ref_id)
    when 'quality_supplier_evaluation' then (select organization_id from quality_supplier_evaluations where id = new.ref_id)
    when 'quality_supplier_document'  then (select organization_id from quality_supplier_documents where id = new.ref_id)
    when 'quality_supplier_incident'  then (select organization_id from quality_supplier_incidents where id = new.ref_id)
    when 'quality_customer_profile'   then (select organization_id from quality_customer_profiles where id = new.ref_id)
    when 'quality_customer_feedback'  then (select organization_id from quality_customer_feedback where id = new.ref_id)
    when 'quality_survey_campaign'    then (select organization_id from quality_survey_campaigns where id = new.ref_id)
    when 'quality_survey_response'    then (select organization_id from quality_survey_responses where id = new.ref_id)
    when 'quality_customer_voice_review' then (select organization_id from quality_customer_voice_reviews where id = new.ref_id)
  end;

  if v_org is null then
    raise exception 'La referencia apunta a algo que no existe.';
  end if;
  if v_org <> new.organization_id then
    raise exception 'La referencia apunta a algo que no es de esta empresa.';
  end if;

  v_owner_org := case new.owner_kind
    when 'case'                   then (select organization_id from work_cases where id = new.owner_id)
    when 'action'                 then (select organization_id from work_actions where id = new.owner_id)
    when 'risk'                   then (select organization_id from quality_risks where id = new.owner_id)
    when 'opportunity'            then (select organization_id from quality_opportunities where id = new.owner_id)
    when 'control'                then (select organization_id from quality_controls where id = new.owner_id)
    when 'risk_assessment'        then (select organization_id from quality_risk_assessments where id = new.owner_id)
    when 'person_competency'      then (select organization_id from quality_person_competencies where id = new.owner_id)
    when 'competency_evidence'    then (select organization_id from quality_competency_evidence where id = new.owner_id)
    when 'knowledge_item'         then (select organization_id from quality_knowledge_items where id = new.owner_id)
    when 'knowledge_transfer_plan' then (select organization_id from quality_knowledge_transfer_plans where id = new.owner_id)
    when 'lesson'                 then (select organization_id from quality_lessons_learned where id = new.owner_id)
    when 'development_need'       then (select organization_id from quality_development_needs where id = new.owner_id)
    when 'learning_activity'      then (select organization_id from quality_learning_activities where id = new.owner_id)
    when 'performance_evaluation' then (select organization_id from quality_performance_evaluations where id = new.owner_id)
    when 'supplier_profile'       then (select organization_id from quality_supplier_profiles where id = new.owner_id)
    when 'supplier_scope'         then (select organization_id from quality_supplier_scopes where id = new.owner_id)
    when 'supplier_evaluation'    then (select organization_id from quality_supplier_evaluations where id = new.owner_id)
    when 'supplier_incident'      then (select organization_id from quality_supplier_incidents where id = new.owner_id)
    when 'customer_profile'       then (select organization_id from quality_customer_profiles where id = new.owner_id)
    when 'customer_feedback'      then (select organization_id from quality_customer_feedback where id = new.owner_id)
    when 'survey_campaign'        then (select organization_id from quality_survey_campaigns where id = new.owner_id)
    when 'customer_voice_review'  then (select organization_id from quality_customer_voice_reviews where id = new.owner_id)
  end;

  if v_owner_org is null then
    raise exception 'El propietario de la referencia no existe.';
  end if;
  if v_owner_org <> new.organization_id then
    raise exception 'El propietario de la referencia no es de esta empresa.';
  end if;

  return new;
end;
$$;


-- ============================================================================
-- 13 · PERMISOS DEL DOMINIO (§62)
-- ----------------------------------------------------------------------------
-- §62 · La voz del cliente contiene información sensible COMERCIALMENTE, y no
-- toda la misma. Diseñar la encuesta y leer un resultado agregado no es lo
-- mismo que leer los comentarios individuales de una campaña.
--
-- Tres capacidades, no una:
--
--   quality_manages_customer_voice  · diseñar, capturar, administrar
--   quality_reads_customer_voice    · leer resultados y quejas
--   quality_closes_customer_voice   · cerrar el periodo formalmente
--
-- El consultor externo acompaña la implantación: diseña y captura, pero no
-- cierra el periodo, que es una afirmación de la empresa sobre sus clientes.
-- ============================================================================

create or replace function public.quality_manages_customer_voice(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_org_role(p_organization_id, array['admin', 'quality', 'consultant']);
$$;
revoke all on function public.quality_manages_customer_voice(uuid) from public, anon;
grant execute on function public.quality_manages_customer_voice(uuid) to authenticated;

comment on function public.quality_manages_customer_voice(uuid) is
  'QUALITY-08 · Quién diseña encuestas, abre campañas, captura retroalimentación y atiende quejas.';

create or replace function public.quality_reads_customer_voice(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_org_member(p_organization_id);
$$;
revoke all on function public.quality_reads_customer_voice(uuid) from public, anon;
grant execute on function public.quality_reads_customer_voice(uuid) to authenticated;

create or replace function public.quality_closes_customer_voice(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_org_role(p_organization_id, array['admin', 'quality']);
$$;
revoke all on function public.quality_closes_customer_voice(uuid) from public, anon;
grant execute on function public.quality_closes_customer_voice(uuid) to authenticated;

comment on function public.quality_closes_customer_voice(uuid) is
  'QUALITY-08 · VC-05 · Cerrar el periodo de satisfacción es una afirmación de la EMPRESA sobre sus clientes: no la firma un consultor externo.';


-- ============================================================================
-- 14 · VISTAS DERIVADAS (§38, §39, §41, §43)
-- ----------------------------------------------------------------------------
-- §38 · La tasa de respuesta SOLO existe cuando hay denominador de verdad. En
-- una campaña abierta sin población conocida, `response_rate` es NULO y el
-- recuento de respuestas sigue estando: son dos cosas distintas y confundirlas
-- fabrica un porcentaje que nadie puede defender.
--
-- §39 · Y cero respuestas no es cero satisfacción. Por eso `responses_count`
-- puede ser 0 mientras las métricas son nulas.
-- ============================================================================

create or replace view public.v_quality_campaign_summary
with (security_invoker = true) as
select
  c.organization_id,
  c.id                      as campaign_id,
  c.survey_id,
  c.version_id,
  c.name,
  c.code,
  c.voice_source,
  c.status,
  c.anonymity_mode,
  c.period_label,
  c.period_start,
  c.period_end,
  c.opens_on,
  c.closes_on,
  c.owner_position_id,
  s.name                    as survey_name,
  v.version_number,
  c.population_size,
  coalesce(inv.invited, 0)  as invited_count,
  coalesce(res.submitted, 0) as responses_count,
  coalesce(res.drafts, 0)   as draft_responses_count,
  -- §38 · El denominador preferido es la población declarada; si no la hay,
  -- las invitaciones enviadas. Si tampoco, NO HAY TASA.
  case
    when c.population_size is not null and c.population_size > 0
      then round(coalesce(res.submitted, 0) * 100.0 / c.population_size, 2)
    when coalesce(inv.invited, 0) > 0
      then round(coalesce(res.submitted, 0) * 100.0 / inv.invited, 2)
    else null
  end                       as response_rate,
  case
    when c.population_size is not null and c.population_size > 0 then 'population'
    when coalesce(inv.invited, 0) > 0 then 'invitations'
    else null
  end                       as response_rate_basis
from public.quality_survey_campaigns c
join public.quality_surveys s
  on s.organization_id = c.organization_id and s.id = c.survey_id
join public.quality_survey_versions v
  on v.organization_id = c.organization_id and v.id = c.version_id
left join lateral (
  select count(*) as invited
    from public.quality_survey_invitations i
   where i.organization_id = c.organization_id
     and i.campaign_id = c.id
     and i.status <> 'revoked'
) inv on true
left join lateral (
  select count(*) filter (where r.status = 'submitted' and r.superseded_by is null) as submitted,
         count(*) filter (where r.status = 'draft') as drafts
    from public.quality_survey_responses r
   where r.organization_id = c.organization_id
     and r.campaign_id = c.id
) res on true;

comment on view public.v_quality_campaign_summary is
  'QUALITY-08 · §38/§39 · Recuento de respuestas SIEMPRE; tasa de respuesta solo cuando existe un denominador verdadero, y diciendo cuál.';


create or replace view public.v_quality_customer_overview
with (security_invoker = true) as
select
  p.organization_id,
  p.id                      as profile_id,
  p.party_id,
  ep.legal_name,
  ep.trade_name,
  ep.tax_id,
  ep.country,
  ep.city,
  ep.status                 as party_status,
  p.relationship_status,
  p.segment,
  p.owner_position_id,
  pos.name                  as owner_position_name,
  coalesce(fb.total, 0)     as feedback_count,
  coalesce(fb.complaints, 0) as complaint_count,
  coalesce(fb.open_complaints, 0) as open_complaint_count,
  coalesce(fb.compliments, 0) as compliment_count,
  fb.last_feedback_on,
  -- §43/§87 · SOLO respuestas IDENTIFICADAS. Una respuesta anónima jamás se
  -- cuenta contra un cliente, ni siquiera para decir cuántas hay.
  coalesce(rs.identified_responses, 0) as identified_response_count,
  -- ¿Es también proveedor? La misma empresa, otro papel.
  exists (select 1 from public.quality_supplier_profiles sp
           where sp.organization_id = p.organization_id and sp.party_id = p.party_id)
                            as is_also_supplier
from public.quality_customer_profiles p
join public.quality_external_parties ep
  on ep.organization_id = p.organization_id and ep.id = p.party_id
left join public.quality_positions pos
  on pos.organization_id = p.organization_id and pos.id = p.owner_position_id
left join lateral (
  select count(*) as total,
         count(*) filter (where f.feedback_kind in ('complaint', 'claim')) as complaints,
         count(*) filter (where f.feedback_kind in ('complaint', 'claim')
                            and f.status in ('open', 'under_review')) as open_complaints,
         count(*) filter (where f.feedback_kind = 'compliment') as compliments,
         max(f.received_on) as last_feedback_on
    from public.quality_customer_feedback f
   where f.organization_id = p.organization_id and f.customer_id = p.id
) fb on true
left join lateral (
  select count(*) as identified_responses
    from public.quality_survey_responses r
    join public.quality_survey_campaigns c
      on c.organization_id = r.organization_id and c.id = r.campaign_id
   where r.organization_id = p.organization_id
     and r.customer_id = p.id
     and r.status = 'submitted'
     and c.anonymity_mode = 'identified'
) rs on true;

comment on view public.v_quality_customer_overview is
  'QUALITY-08 · §43 · La ficha del cliente cuenta SOLO lo identificado. Atribuirle una respuesta anónima sería el fallo crítico de este dominio.';


-- §36/§37 · La serie de una métrica, con su clave de comparabilidad al lado.
-- Dos filas con claves distintas NO se pueden unir con una línea.
create or replace view public.v_quality_metric_series
with (security_invoker = true) as
select
  r.organization_id,
  r.definition_id,
  d.name                    as definition_name,
  d.method,
  r.campaign_id,
  c.name                    as campaign_name,
  c.period_label,
  c.period_start,
  c.period_end,
  r.value,
  r.sample_size,
  r.not_applicable,
  r.skipped,
  r.comparability_key,
  -- El corte de serie: cuando la clave cambia respecto de la medición
  -- anterior, la gráfica tiene que partirse en vez de mentir.
  r.comparability_key is distinct from lag(r.comparability_key) over (
    partition by r.organization_id, r.definition_id
    order by c.period_start nulls last, r.computed_at
  ) and lag(r.comparability_key) over (
    partition by r.organization_id, r.definition_id
    order by c.period_start nulls last, r.computed_at
  ) is not null            as breaks_comparability,
  r.computed_at
from public.quality_customer_metric_results r
join public.quality_customer_metric_definitions d
  on d.organization_id = r.organization_id and d.id = r.definition_id
join public.quality_survey_campaigns c
  on c.organization_id = r.organization_id and c.id = r.campaign_id;

comment on view public.v_quality_metric_series is
  'QUALITY-08 · §37 · La serie con su clave de comparabilidad y el punto exacto donde se rompe. Sin esto, una gráfica continua afirmaría una tendencia que no existe.';


-- ============================================================================
-- 15 · ACTOS FORMALES (RPC)
-- ----------------------------------------------------------------------------
-- §64 · TODAS fijan `search_path` y comprueban la pertenencia. Ninguna se fía
-- del `p_organization_id` que le manden: o lo deriva de la fila, o comprueba
-- que quien llama sea miembro antes de responder. El hallazgo de QUALITY-06 no
-- se repite.
-- ============================================================================

-- §10 · Publicar una versión. Cierra la anterior el día antes y numera la
-- nueva. Nunca deja dos vigentes, y no toca ninguna respuesta ya recogida.
create or replace function public.quality_publish_survey_version(
  p_version_id     uuid,
  p_effective_from date default current_date,
  p_change_note    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version record;
  v_previous record;
begin
  select * into v_version from quality_survey_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'Esa versión de encuesta no existe.';
  end if;
  if not quality_manages_customer_voice(v_version.organization_id) then
    raise exception 'No tienes permiso para publicar encuestas en esta empresa.';
  end if;
  if v_version.status <> 'draft' then
    raise exception 'Esta versión ya fue publicada.';
  end if;
  if not exists (select 1 from quality_survey_questions q where q.version_id = p_version_id) then
    raise exception 'Una encuesta sin preguntas no se puede publicar.';
  end if;

  select * into v_previous
    from quality_survey_versions
   where organization_id = v_version.organization_id
     and survey_id = v_version.survey_id
     and status = 'published'
   order by version_number desc
   limit 1;

  if v_previous.id is not null then
    if p_effective_from <= v_previous.effective_from then
      raise exception 'La versión nueva no puede entrar en vigor antes que la que sustituye.';
    end if;
    update quality_survey_versions
       set status = 'superseded', effective_to = p_effective_from - 1
     where id = v_previous.id;
  end if;

  update quality_survey_versions
     set status = 'published',
         effective_from = p_effective_from,
         effective_to = null,
         published_at = now(),
         published_by = auth.uid(),
         change_note = coalesce(p_change_note, change_note)
   where id = p_version_id;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_version.organization_id, 'customer', 'survey.version_published',
          'quality_survey_campaign', v_version.survey_id,
          'Versión ' || v_version.version_number || ' de la encuesta publicada.',
          jsonb_build_object('version_id', p_version_id,
                             'version_number', v_version.version_number,
                             'effective_from', p_effective_from));
end;
$$;
revoke all on function public.quality_publish_survey_version(uuid, date, text) from public, anon;
grant execute on function public.quality_publish_survey_version(uuid, date, text) to authenticated;


-- §18 · Abrir, cerrar y reabrir una campaña. Reabrir es una decisión con
-- historia: no se cae en «se reabrió sola» ni en «alguien la reabrió y nadie
-- sabe por qué».
create or replace function public.quality_open_survey_campaign(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign record;
  v_version  record;
begin
  select * into v_campaign from quality_survey_campaigns where id = p_campaign_id;
  if v_campaign.id is null then
    raise exception 'Esa campaña no existe.';
  end if;
  if not quality_manages_customer_voice(v_campaign.organization_id) then
    raise exception 'No tienes permiso para abrir campañas en esta empresa.';
  end if;
  if v_campaign.status <> 'draft' then
    raise exception 'Esta campaña ya fue abierta.';
  end if;

  select * into v_version from quality_survey_versions where id = v_campaign.version_id;
  if v_version.status <> 'published' then
    raise exception 'Solo se puede aplicar una versión de encuesta PUBLICADA. Publica la versión antes de abrir la campaña.';
  end if;

  update quality_survey_campaigns
     set status = 'open',
         opens_on = coalesce(opens_on, current_date)
   where id = p_campaign_id;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_campaign.organization_id, 'customer', 'campaign.opened',
          'quality_survey_campaign', p_campaign_id,
          'Campaña «' || v_campaign.name || '» abierta.',
          jsonb_build_object('anonymity', v_campaign.anonymity_mode,
                             'version_id', v_campaign.version_id));
end;
$$;
revoke all on function public.quality_open_survey_campaign(uuid) from public, anon;
grant execute on function public.quality_open_survey_campaign(uuid) to authenticated;


create or replace function public.quality_close_survey_campaign(
  p_campaign_id uuid,
  p_note        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign record;
  v_summary  record;
begin
  select * into v_campaign from quality_survey_campaigns where id = p_campaign_id;
  if v_campaign.id is null then
    raise exception 'Esa campaña no existe.';
  end if;
  if not quality_manages_customer_voice(v_campaign.organization_id) then
    raise exception 'No tienes permiso para cerrar campañas en esta empresa.';
  end if;
  if v_campaign.status <> 'open' then
    raise exception 'Solo se cierra una campaña abierta.';
  end if;

  update quality_survey_campaigns
     set status = 'closed', closed_at = now(), closed_by = auth.uid(),
         closure_note = p_note,
         closes_on = coalesce(closes_on, current_date)
   where id = p_campaign_id;

  -- Los enlaces que quedaron sin usar dejan de servir. Un token vivo de una
  -- campaña cerrada es una puerta abierta a un cuarto vacío.
  update quality_survey_invitations
     set status = 'expired'
   where campaign_id = p_campaign_id and status = 'pending';

  select * into v_summary from v_quality_campaign_summary where campaign_id = p_campaign_id;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_campaign.organization_id, 'customer', 'campaign.closed',
          'quality_survey_campaign', p_campaign_id,
          'Campaña «' || v_campaign.name || '» cerrada con '
            || coalesce(v_summary.responses_count, 0) || ' respuestas.',
          jsonb_build_object('responses', coalesce(v_summary.responses_count, 0),
                             'response_rate', v_summary.response_rate));

  -- §39 · Se dice cuántas respuestas hubo y se dice que cerrar NO mide nada por
  -- sí solo. Cero respuestas no es cero satisfacción.
  return jsonb_build_object(
    'responses', coalesce(v_summary.responses_count, 0),
    'invited', coalesce(v_summary.invited_count, 0),
    'response_rate', v_summary.response_rate,
    'response_rate_basis', v_summary.response_rate_basis,
    'decides_nothing', true
  );
end;
$$;
revoke all on function public.quality_close_survey_campaign(uuid, text) from public, anon;
grant execute on function public.quality_close_survey_campaign(uuid, text) to authenticated;


create or replace function public.quality_reopen_survey_campaign(
  p_campaign_id uuid,
  p_reason      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign record;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Reabrir una campaña cerrada exige decir por qué.';
  end if;
  select * into v_campaign from quality_survey_campaigns where id = p_campaign_id;
  if v_campaign.id is null then
    raise exception 'Esa campaña no existe.';
  end if;
  if not quality_closes_customer_voice(v_campaign.organization_id) then
    raise exception 'Tu rol no permite reabrir una campaña cerrada.';
  end if;
  if v_campaign.status <> 'closed' then
    raise exception 'Solo se reabre una campaña cerrada.';
  end if;

  update quality_survey_campaigns
     set status = 'open', closed_at = null, closed_by = null,
         reopened_at = now(), reopen_count = reopen_count + 1,
         reopen_reason = p_reason
   where id = p_campaign_id;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_campaign.organization_id, 'customer', 'campaign.reopened',
          'quality_survey_campaign', p_campaign_id,
          'Campaña «' || v_campaign.name || '» reabierta.',
          jsonb_build_object('reason', p_reason,
                             'reopen_count', v_campaign.reopen_count + 1));
end;
$$;
revoke all on function public.quality_reopen_survey_campaign(uuid, text) from public, anon;
grant execute on function public.quality_reopen_survey_campaign(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 15.1 · Invitaciones y la superficie pública (§23, §25, §26, §66…§68)
-- ----------------------------------------------------------------------------

-- §66 · El token se GENERA aquí y se devuelve UNA VEZ. La base guarda su
-- sha256 y un prefijo corto. Si alguien pierde el enlace, se emite otro: no
-- hay forma de recuperar el original, y eso es exactamente lo que se quiere.
create or replace function public.quality_issue_survey_invitation(
  p_campaign_id uuid,
  p_customer_id uuid default null,
  p_contact_id  uuid default null,
  p_email       text default null,
  p_expires_at  timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign record;
  v_token    text;
  v_hash     text;
  v_id       uuid;
begin
  select * into v_campaign from quality_survey_campaigns where id = p_campaign_id;
  if v_campaign.id is null then
    raise exception 'Esa campaña no existe.';
  end if;
  if not quality_manages_customer_voice(v_campaign.organization_id) then
    raise exception 'No tienes permiso para invitar en esta empresa.';
  end if;
  if v_campaign.status not in ('draft', 'open') then
    raise exception 'Esta campaña ya está cerrada: no se pueden emitir enlaces nuevos.';
  end if;

  -- 32 bytes de aleatoriedad del servidor. El navegador no aporta nada.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into quality_survey_invitations
    (organization_id, campaign_id, token_hash, token_prefix,
     customer_id, contact_id, sent_to_email, expires_at, sent_at, created_by)
  values
    (v_campaign.organization_id, p_campaign_id, v_hash, left(v_token, 8),
     p_customer_id, p_contact_id, p_email,
     coalesce(p_expires_at,
              case when v_campaign.closes_on is not null
                   then (v_campaign.closes_on + 1)::timestamptz
                   else now() + interval '90 days' end),
     now(), auth.uid())
  returning id into v_id;

  -- El secreto sale UNA vez, hacia quien lo pidió. No vuelve a existir.
  return jsonb_build_object('invitation_id', v_id, 'token', v_token,
                            'prefix', left(v_token, 8));
end;
$$;
revoke all on function public.quality_issue_survey_invitation(uuid, uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.quality_issue_survey_invitation(uuid, uuid, uuid, text, timestamptz) to authenticated;

comment on function public.quality_issue_survey_invitation(uuid, uuid, uuid, text, timestamptz) is
  'QUALITY-08 · §66 · Emite un enlace y devuelve el token UNA sola vez. La base guarda solo su hash: ni el administrador puede reconstruirlo.';


-- §25/§26 · LA PUERTA PÚBLICA — LECTURA.
--
-- Resuelve el token y devuelve la estructura de la encuesta. Es `anon` porque
-- quien responde no tiene cuenta.
--
-- Lo que NUNCA hace:
--   · aceptar un organization_id del cliente — el token resuelve el contexto;
--   · distinguir «no existe» de «caducado» de «campaña cerrada» — todo es
--     «no disponible», porque un mensaje distinto ya es información;
--   · devolver nada interno de la empresa más allá de su nombre y el texto de
--     la encuesta.
create or replace function public.quality_resolve_survey_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash     text;
  v_inv      record;
  v_campaign record;
  v_version  record;
  v_survey   record;
  v_questions jsonb;
begin
  -- Un token corto no es un token: se rechaza sin tocar la base.
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select * into v_inv from quality_survey_invitations where token_hash = v_hash;
  if v_inv.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;
  if v_inv.status <> 'pending'
     or v_inv.revoked_at is not null
     or (v_inv.expires_at is not null and v_inv.expires_at <= now()) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;

  select * into v_campaign from quality_survey_campaigns where id = v_inv.campaign_id;
  -- §89 · Campaña en borrador o cerrada: denegado, con el mismo mensaje.
  if v_campaign.id is null or v_campaign.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;
  -- §67 · La ventana la decide el SERVIDOR, no el reloj del navegador.
  if (v_campaign.opens_on is not null and current_date < v_campaign.opens_on)
     or (v_campaign.closes_on is not null and current_date > v_campaign.closes_on) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;

  select * into v_version from quality_survey_versions where id = v_campaign.version_id;
  -- §89 · Una versión en borrador no se responde jamás desde fuera.
  if v_version.id is null or v_version.status <> 'published' then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;

  select * into v_survey from quality_surveys where id = v_campaign.survey_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id,
           'stable_key', q.stable_key,
           'label', q.label,
           'help_text', q.help_text,
           'question_type', q.question_type,
           'is_required', q.is_required,
           'allows_not_applicable', q.allows_not_applicable,
           'scale_min', q.scale_min,
           'scale_max', q.scale_max,
           'scale_step', q.scale_step,
           'scale_min_label', q.scale_min_label,
           'scale_max_label', q.scale_max_label,
           'options', q.options
         ) order by q.position_order), '[]'::jsonb)
    into v_questions
    from quality_survey_questions q
   where q.version_id = v_version.id;

  return jsonb_build_object(
    'ok', true,
    -- §93 · La identidad de la empresa que pregunta. El NOMBRE, no su
    -- almacenamiento privado: el logo vive en un bucket que requiere sesión, y
    -- abrirlo a `anon` para adornar un formulario sería un mal negocio.
    'organization_name', (select name from organizations where id = v_campaign.organization_id),
    'survey', jsonb_build_object('name', v_survey.name, 'purpose', v_survey.purpose),
    'campaign', jsonb_build_object(
      'name', v_campaign.name,
      'period_label', v_campaign.period_label,
      -- §24 · Quien responde SABE si su respuesta será anónima ANTES de
      -- enviarla. No se descubre después.
      'anonymity_mode', v_campaign.anonymity_mode
    ),
    'version', jsonb_build_object(
      'version_number', v_version.version_number,
      'intro_text', v_version.intro_text,
      'closing_text', v_version.closing_text
    ),
    'questions', v_questions
  );
end;
$$;
revoke all on function public.quality_resolve_survey_token(text) from public;
grant execute on function public.quality_resolve_survey_token(text) to anon, authenticated;

comment on function public.quality_resolve_survey_token(text) is
  'QUALITY-08 · §25/§26 · La única puerta pública de lectura. El token resuelve el contexto; el cliente nunca aporta la empresa. Todo fallo dice lo mismo: «no disponible».';


-- §25/§68 · LA PUERTA PÚBLICA — ENVÍO.
--
-- Todo ocurre dentro de una transacción y el token se consume con un `update`
-- CONDICIONAL sobre su estado: dos envíos simultáneos con el mismo enlace no
-- pueden ganar los dos, porque el segundo no encuentra ninguna fila `pending`
-- que actualizar. Es la protección contra TOCTOU que pide §68, y no depende de
-- que la aplicación compruebe antes.
--
-- §22 · Y la respuesta de una campaña anónima entra SIN autor: `created_by` no
-- existe en esta tabla, no hay `force_created_by`, y `invitation_id` se queda
-- nulo por la guarda de anonimato. Ni siquiera si quien responde tiene sesión
-- iniciada queda rastro de quién fue.
create or replace function public.quality_submit_survey_response(
  p_token   text,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash      text;
  v_inv       record;
  v_campaign  record;
  v_version   record;
  v_response  uuid;
  v_answer    jsonb;
  v_question  record;
  v_outcome   text;
  v_count     integer := 0;
  v_missing   text;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  -- §27 · Un cuerpo desproporcionado se rechaza antes de tocar nada. No es un
  -- anti-bot de empresa; es no dejar la puerta obviamente abierta.
  if jsonb_array_length(p_answers) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  -- §68 · El consumo del token ES la comprobación. `status = 'pending'` en el
  -- WHERE hace que solo un envío pueda ganar la carrera.
  update quality_survey_invitations
     set status = 'used', used_at = now()
   where token_hash = v_hash
     and status = 'pending'
     and revoked_at is null
     and (expires_at is null or expires_at > now())
  returning * into v_inv;

  if v_inv.id is null then
    -- Token inventado, ya usado, revocado o caducado: la misma respuesta.
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;

  select * into v_campaign from quality_survey_campaigns where id = v_inv.campaign_id;
  if v_campaign.id is null or v_campaign.status <> 'open'
     or (v_campaign.opens_on is not null and current_date < v_campaign.opens_on)
     or (v_campaign.closes_on is not null and current_date > v_campaign.closes_on) then
    raise exception 'not_available';
  end if;

  select * into v_version from quality_survey_versions where id = v_campaign.version_id;
  if v_version.id is null or v_version.status <> 'published' then
    raise exception 'not_available';
  end if;

  insert into quality_survey_responses
    (organization_id, campaign_id, version_id, status, submitted_at,
     respondent_kind, customer_id, contact_id, invitation_id, source)
  values
    (v_campaign.organization_id, v_campaign.id, v_version.id, 'draft', null,
     -- §22 · En anónima NO entra identidad. En identificada se conserva de
     -- quién era la invitación, que es lo que se le dijo a quien responde.
     case when v_campaign.anonymity_mode = 'anonymous' then 'anonymous'
          when v_inv.contact_id is not null then 'contact'
          when v_inv.customer_id is not null then 'customer'
          else 'named' end,
     case when v_campaign.anonymity_mode = 'anonymous' then null else v_inv.customer_id end,
     case when v_campaign.anonymity_mode = 'anonymous' then null else v_inv.contact_id end,
     case when v_campaign.anonymity_mode = 'anonymous' then null else v_inv.id end,
     'public_link')
  returning id into v_response;

  for v_answer in select * from jsonb_array_elements(p_answers)
  loop
    select * into v_question
      from quality_survey_questions
     where id = (v_answer->>'question_id')::uuid
       and version_id = v_version.id;
    -- §26 · Una pregunta de otra encuesta no se cuela por el cuerpo.
    if v_question.id is null then
      raise exception 'not_available';
    end if;

    v_outcome := coalesce(v_answer->>'outcome', 'answered');
    if v_outcome not in ('answered', 'not_applicable', 'skipped') then
      raise exception 'not_available';
    end if;
    if v_outcome = 'not_applicable' and not v_question.allows_not_applicable then
      v_outcome := 'skipped';
    end if;

    insert into quality_survey_answers
      (organization_id, response_id, question_id, outcome,
       value_numeric, value_text, value_choices)
    values
      (v_campaign.organization_id, v_response, v_question.id, v_outcome,
       case when v_outcome = 'answered' then (v_answer->>'value_numeric')::numeric else null end,
       case when v_outcome = 'answered' then left(nullif(btrim(coalesce(v_answer->>'value_text', '')), ''), 4000) else null end,
       case when v_outcome = 'answered' and v_answer ? 'value_choices'
            then array(select jsonb_array_elements_text(v_answer->'value_choices'))
            else null end);
    v_count := v_count + 1;
  end loop;

  -- Las obligatorias tienen que estar. Se comprueba DESPUÉS de escribir el
  -- borrador y antes de enviarlo: la transacción entera se deshace si falta.
  select string_agg(q.label, ', ') into v_missing
    from quality_survey_questions q
   where q.version_id = v_version.id
     and q.is_required
     and not exists (
       select 1 from quality_survey_answers a
        where a.response_id = v_response and a.question_id = q.id
          and a.outcome = 'answered');
  if v_missing is not null then
    raise exception 'Faltan respuestas obligatorias: %', v_missing;
  end if;

  update quality_survey_responses
     set status = 'submitted', submitted_at = now()
   where id = v_response;

  return jsonb_build_object('ok', true, 'answers', v_count,
                            'closing_text', v_version.closing_text);
end;
$$;
revoke all on function public.quality_submit_survey_response(text, jsonb) from public;
grant execute on function public.quality_submit_survey_response(text, jsonb) to anon, authenticated;

comment on function public.quality_submit_survey_response(text, jsonb) is
  'QUALITY-08 · §68 · El token se consume con un update condicional: dos envíos simultáneos no pueden ganar los dos. En campaña anónima la respuesta entra sin autor, sin invitación y sin identidad.';


-- ----------------------------------------------------------------------------
-- 15.2 · Métricas (§14, §15, §37, §39, §50)
-- ----------------------------------------------------------------------------

-- Calcula las métricas de una campaña CERRADA. No modifica ninguna medición ya
-- registrada en QUALITY-03: produce el dato, y allí se decide qué hacer con él.
create or replace function public.quality_compute_campaign_metrics(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign record;
  v_def      record;
  v_question record;
  v_value    numeric;
  v_sample   integer;
  v_na       integer;
  v_skipped  integer;
  v_promoters integer;
  v_passives  integer;
  v_detractors integer;
  v_favorable integer;
  v_dist     jsonb;
  v_key      text;
  v_results  jsonb := '[]'::jsonb;
begin
  select * into v_campaign from quality_survey_campaigns where id = p_campaign_id;
  if v_campaign.id is null then
    raise exception 'Esa campaña no existe.';
  end if;
  if not quality_manages_customer_voice(v_campaign.organization_id) then
    raise exception 'No tienes permiso para calcular métricas en esta empresa.';
  end if;

  for v_def in
    select * from quality_customer_metric_definitions
     where organization_id = v_campaign.organization_id and is_active
  loop
    v_value := null; v_sample := 0; v_na := 0; v_skipped := 0; v_dist := null;

    if v_def.method = 'response_count' then
      select count(*) into v_sample
        from quality_survey_responses r
       where r.campaign_id = p_campaign_id and r.status = 'submitted'
         and r.superseded_by is null;
      v_value := v_sample;
      v_key := 'responses';
    else
      -- §12 · La pregunta se localiza por su clave ESTABLE dentro de la versión
      -- de esta campaña. Si esta versión no la tiene, la métrica no se calcula:
      -- inventar un valor sería peor que no tenerlo.
      select * into v_question
        from quality_survey_questions
       where version_id = v_campaign.version_id and stable_key = v_def.question_stable_key;

      if v_question.id is null then
        continue;
      end if;

      -- §14 · NPS SOLO con la escala correcta. Si la versión cambió la escala,
      -- no se calcula un NPS falso: se salta y el corte de serie queda visible.
      if v_def.method = 'nps'
         and (v_question.scale_min is distinct from 0 or v_question.scale_max is distinct from 10) then
        continue;
      end if;
      if v_def.expects_scale_min is not null
         and (v_question.scale_min is distinct from v_def.expects_scale_min
              or v_question.scale_max is distinct from v_def.expects_scale_max) then
        continue;
      end if;

      -- La cuenta es de ESTA campaña. Sin el filtro, dos campañas que
      -- compartieran versión sumarían sus respuestas en la métrica de ambas.
      select count(*) filter (where a.outcome = 'answered'),
             count(*) filter (where a.outcome = 'not_applicable'),
             count(*) filter (where a.outcome = 'skipped')
        into v_sample, v_na, v_skipped
        from quality_survey_answers a
        join quality_survey_responses r on r.id = a.response_id
       where a.question_id = v_question.id
         and r.campaign_id = p_campaign_id
         and r.status = 'submitted' and r.superseded_by is null;

      -- §39 · Sin respuestas no hay valor. NO es cero.
      if v_sample = 0 then
        v_value := null;
      elsif v_def.method = 'nps' then
        select count(*) filter (where a.value_numeric between 9 and 10),
               count(*) filter (where a.value_numeric between 7 and 8),
               count(*) filter (where a.value_numeric between 0 and 6)
          into v_promoters, v_passives, v_detractors
          from quality_survey_answers a
          join quality_survey_responses r on r.id = a.response_id
         where a.question_id = v_question.id and a.outcome = 'answered'
           and r.campaign_id = p_campaign_id
           and r.status = 'submitted' and r.superseded_by is null;
        -- §14 · %promotores − %detractores. Ni un promedio, ni un porcentaje
        -- de satisfechos: la fórmula que hace que la palabra signifique algo.
        v_value := round((v_promoters::numeric * 100 / v_sample)
                       - (v_detractors::numeric * 100 / v_sample), 2);
        v_dist := jsonb_build_object('promoters', v_promoters, 'passives', v_passives,
                                     'detractors', v_detractors);
      elsif v_def.method = 'top_box' then
        select count(*) into v_favorable
          from quality_survey_answers a
          join quality_survey_responses r on r.id = a.response_id
         where a.question_id = v_question.id and a.outcome = 'answered'
           and a.value_numeric >= v_def.top_box_min
           and r.campaign_id = p_campaign_id
           and r.status = 'submitted' and r.superseded_by is null;
        v_value := round(v_favorable::numeric * 100 / v_sample, 2);
        v_dist := jsonb_build_object('favorable', v_favorable, 'threshold', v_def.top_box_min);
      else
        -- csat, average y custom se calculan como promedio sobre lo respondido.
        select round(avg(a.value_numeric), 2) into v_value
          from quality_survey_answers a
          join quality_survey_responses r on r.id = a.response_id
         where a.question_id = v_question.id and a.outcome = 'answered'
           and r.campaign_id = p_campaign_id
           and r.status = 'submitted' and r.superseded_by is null;
      end if;

      -- §37 · La clave de comparabilidad: pregunta, escala y método. Si algo de
      -- esto cambia, la serie se parte y la gráfica tiene que decirlo.
      v_key := v_def.method || '|' || v_def.question_stable_key || '|'
             || coalesce(v_question.scale_min::text, '-') || '-'
             || coalesce(v_question.scale_max::text, '-');
    end if;

    insert into quality_customer_metric_results
      (organization_id, campaign_id, definition_id, value, sample_size,
       not_applicable, skipped, distribution, method_snapshot, comparability_key,
       computed_by)
    values
      (v_campaign.organization_id, p_campaign_id, v_def.id, v_value, v_sample,
       v_na, v_skipped, v_dist,
       jsonb_build_object('method', v_def.method, 'question_stable_key', v_def.question_stable_key,
                          'scale_min', v_question.scale_min, 'scale_max', v_question.scale_max,
                          'top_box_min', v_def.top_box_min, 'unit', v_def.unit),
       v_key, auth.uid())
    on conflict (campaign_id, definition_id) do nothing;

    v_results := v_results || jsonb_build_object('definition', v_def.name, 'value', v_value,
                                                 'sample_size', v_sample);
  end loop;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_campaign.organization_id, 'customer', 'campaign.metrics_computed',
          'quality_survey_campaign', p_campaign_id,
          'Métricas calculadas para la campaña «' || v_campaign.name || '».',
          jsonb_build_object('results', v_results));

  return jsonb_build_object('results', v_results, 'decides_nothing', true);
end;
$$;
revoke all on function public.quality_compute_campaign_metrics(uuid) from public, anon;
grant execute on function public.quality_compute_campaign_metrics(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 15.3 · Quejas, casos y cierre del periodo (§30, §31, §32, VC-05)
-- ----------------------------------------------------------------------------

-- §31/§32 · Escalar una queja a un CASO. Es una decisión explícita, no un
-- efecto de registrar la queja.
--
-- §30 · El caso nace SIN CLASIFICAR. Que un cliente se queje no lo convierte en
-- una no conformidad: eso se decide en la ficha del caso, con QUALITY-04, y
-- puede terminar en observación, en oportunidad de mejora o en nada.
create or replace function public.quality_open_case_from_customer_feedback(
  p_feedback_id uuid,
  p_title       text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fb    record;
  v_code  text;
  v_case  uuid;
  v_anon  boolean := false;
begin
  select * into v_fb from quality_customer_feedback where id = p_feedback_id;
  if v_fb.id is null then
    raise exception 'Esa retroalimentación no existe.';
  end if;
  if not quality_manages_customer_voice(v_fb.organization_id) then
    raise exception 'No tienes permiso para abrir casos en esta empresa.';
  end if;
  if v_fb.case_id is not null then
    raise exception 'Esta retroalimentación ya tiene un caso abierto.';
  end if;

  if v_fb.response_id is not null then
    select c.anonymity_mode = 'anonymous' into v_anon
      from quality_survey_responses r
      join quality_survey_campaigns c on c.id = r.campaign_id
     where r.id = v_fb.response_id;
  end if;

  select work_next_case_code(v_fb.organization_id) into v_code;

  insert into work_cases
    (organization_id, code, title, description, case_type, origin_kind, origin_note,
     detected_on, status, owner_position_id)
  values
    (v_fb.organization_id, v_code,
     coalesce(p_title, v_fb.title),
     coalesce(p_description, v_fb.description),
     -- Una queja o un reclamo abren un caso de tipo «queja»; una sugerencia o
     -- una felicitación no lo son, y llamarlas así deformaría el recuento.
     case when v_fb.feedback_kind in ('complaint', 'claim') then 'complaint' else 'issue' end,
     'customer',
     'Abierto desde una manifestación del cliente.',
     v_fb.received_on, 'open', v_fb.owner_position_id)
  returning id into v_case;

  update quality_customer_feedback
     set case_id = v_case, status = 'under_review'
   where id = p_feedback_id;

  -- Las referencias ENLAZAN; no copian. Y no se enlaza al cliente cuando la
  -- manifestación vino de una campaña anónima: el caso heredaría la identidad
  -- que la campaña prometió no guardar.
  insert into work_references (organization_id, owner_kind, owner_id, ref_kind, ref_id, note)
  values (v_fb.organization_id, 'case', v_case, 'quality_customer_feedback', p_feedback_id,
          'Manifestación del cliente que originó el caso.');

  if v_fb.customer_id is not null and not v_anon then
    insert into work_references (organization_id, owner_kind, owner_id, ref_kind, ref_id, note)
    values (v_fb.organization_id, 'case', v_case, 'quality_customer_profile', v_fb.customer_id,
            'Cliente que la manifestó.');
  end if;

  if v_fb.response_id is not null and not v_anon then
    insert into work_references (organization_id, owner_kind, owner_id, ref_kind, ref_id, note)
    values (v_fb.organization_id, 'case', v_case, 'quality_survey_response', v_fb.response_id,
            'Respuesta de encuesta de la que salió.');
  end if;

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_fb.organization_id, 'customer', 'complaint.escalated_to_case',
          'quality_customer_feedback', p_feedback_id,
          'Caso ' || v_code || ' abierto desde una manifestación del cliente.',
          jsonb_build_object('case_id', v_case, 'feedback_kind', v_fb.feedback_kind,
                             'classification', 'pending'));

  return v_case;
end;
$$;
revoke all on function public.quality_open_case_from_customer_feedback(uuid, text, text) from public, anon;
grant execute on function public.quality_open_case_from_customer_feedback(uuid, text, text) to authenticated;

comment on function public.quality_open_case_from_customer_feedback(uuid, text, text) is
  'QUALITY-08 · VC-30/§30 · Abre un caso SIN clasificar. Una queja no es una no conformidad hasta que alguien lo decide en la ficha del caso.';


-- VC-05/VC-06 · El cierre formal del periodo. Congela el retrato de lo que se
-- consolidó y exige un veredicto sobre la metodología: si el instrumento dejó
-- de servir, decirlo es parte del acto.
create or replace function public.quality_close_customer_voice_review(
  p_review_id uuid,
  p_verdict   text,
  p_conclusions text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review   record;
  v_snapshot jsonb;
begin
  select * into v_review from quality_customer_voice_reviews where id = p_review_id;
  if v_review.id is null then
    raise exception 'Ese periodo no existe.';
  end if;
  if not quality_closes_customer_voice(v_review.organization_id) then
    raise exception 'Tu rol no permite cerrar el periodo de satisfacción. Es una afirmación de la empresa sobre sus clientes.';
  end if;
  if v_review.status = 'closed' then
    raise exception 'Ese periodo ya está cerrado.';
  end if;
  if p_verdict not in ('adequate', 'needs_change', 'changed') then
    raise exception 'Un cierre anual tiene que decir si la metodología sigue sirviendo.';
  end if;
  if nullif(btrim(coalesce(p_conclusions, '')), '') is null then
    raise exception 'Un cierre sin conclusiones escritas no es una revisión.';
  end if;

  select jsonb_build_object(
    'campaigns', (select count(*) from quality_survey_campaigns c
                   where c.organization_id = v_review.organization_id
                     and c.period_start is not null
                     and c.period_start between v_review.period_start and v_review.period_end),
    'responses', (select count(*) from quality_survey_responses r
                    join quality_survey_campaigns c on c.id = r.campaign_id
                   where r.organization_id = v_review.organization_id
                     and r.status = 'submitted' and r.superseded_by is null
                     and c.period_start between v_review.period_start and v_review.period_end),
    'complaints', (select count(*) from quality_customer_feedback f
                     where f.organization_id = v_review.organization_id
                       and f.feedback_kind in ('complaint', 'claim')
                       and f.received_on between v_review.period_start and v_review.period_end),
    'compliments', (select count(*) from quality_customer_feedback f
                      where f.organization_id = v_review.organization_id
                        and f.feedback_kind = 'compliment'
                        and f.received_on between v_review.period_start and v_review.period_end),
    'open_signals', (select count(*) from quality_customer_signals s
                       where s.organization_id = v_review.organization_id and s.status = 'open'),
    'metrics', (select coalesce(jsonb_agg(jsonb_build_object(
                         'definition', d.name, 'value', mr.value,
                         'sample_size', mr.sample_size,
                         'comparability_key', mr.comparability_key)), '[]'::jsonb)
                  from quality_customer_metric_results mr
                  join quality_customer_metric_definitions d on d.id = mr.definition_id
                  join quality_survey_campaigns c on c.id = mr.campaign_id
                 where mr.organization_id = v_review.organization_id
                   and c.period_start between v_review.period_start and v_review.period_end)
  ) into v_snapshot;

  update quality_customer_voice_reviews
     set status = 'closed', closed_at = now(), closed_by = auth.uid(),
         methodology_verdict = p_verdict, conclusions = p_conclusions,
         summary_snapshot = v_snapshot
   where id = p_review_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              decided_by, rationale, context)
  values (v_review.organization_id, 'customer_voice_review', p_review_id,
          'customer_voice_period_closed', auth.uid(), p_conclusions, v_snapshot);

  insert into work_events (organization_id, source_domain, event_type,
                           subject_type, subject_id, summary, payload)
  values (v_review.organization_id, 'customer', 'voice.review_closed',
          'quality_customer_voice_review', p_review_id,
          'Periodo «' || v_review.period_label || '» cerrado.',
          jsonb_build_object('verdict', p_verdict, 'snapshot', v_snapshot));

  return v_snapshot;
end;
$$;
revoke all on function public.quality_close_customer_voice_review(uuid, text, text) from public, anon;
grant execute on function public.quality_close_customer_voice_review(uuid, text, text) to authenticated;


-- ============================================================================
-- 16 · VERDAD HISTÓRICA (VC-12, VC-23, §16, §36, §73)
-- ----------------------------------------------------------------------------
-- «¿Qué preguntaba la encuesta en marzo?» no se responde mirando la versión de
-- hoy. Estas funciones son la forma correcta de preguntarle al pasado, y
-- comprueban a quién pertenece lo que devuelven.
-- ============================================================================

create or replace function public.quality_survey_version_on(
  p_organization_id uuid,
  p_survey_id       uuid,
  p_on              date
)
returns table (version_id uuid, version_number integer, status text,
               effective_from date, effective_to date)
language sql
stable
security definer
set search_path = public
as $$
  -- §64 · La pertenencia se comprueba PRIMERO. Para quien no es miembro el
  -- resultado es vacío, igual que para un identificador inventado: confirmar
  -- que algo existe en otra empresa ya es información.
  select v.id, v.version_number, v.status, v.effective_from, v.effective_to
    from quality_survey_versions v
   where is_org_member(p_organization_id)
     and v.organization_id = p_organization_id
     and v.survey_id = p_survey_id
     and v.effective_from is not null
     and v.effective_from <= p_on
     and (v.effective_to is null or v.effective_to >= p_on)
   order by v.version_number desc
   limit 1;
$$;
revoke all on function public.quality_survey_version_on(uuid, uuid, date) from public, anon;
grant execute on function public.quality_survey_version_on(uuid, uuid, date) to authenticated;


-- §73 · La estructura EXACTA de una versión, para reconstruirla en papel sin
-- mezclarla con la de hoy.
create or replace function public.quality_survey_version_structure(
  p_organization_id uuid,
  p_version_id      uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_version record;
  v_result  jsonb;
begin
  if not is_org_member(p_organization_id) then
    return null;
  end if;
  select * into v_version
    from quality_survey_versions
   where id = p_version_id and organization_id = p_organization_id;
  if v_version.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'version_number', v_version.version_number,
    'status', v_version.status,
    'effective_from', v_version.effective_from,
    'effective_to', v_version.effective_to,
    'intro_text', v_version.intro_text,
    'closing_text', v_version.closing_text,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'stable_key', q.stable_key, 'label', q.label,
               'question_type', q.question_type, 'is_required', q.is_required,
               'allows_not_applicable', q.allows_not_applicable,
               'scale_min', q.scale_min, 'scale_max', q.scale_max,
               'options', q.options, 'position_order', q.position_order)
             order by q.position_order)
        from quality_survey_questions q where q.version_id = v_version.id), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.quality_survey_version_structure(uuid, uuid) from public, anon;
grant execute on function public.quality_survey_version_structure(uuid, uuid) to authenticated;


-- ============================================================================
-- 17 · FUENTES NATIVAS PARA INDICADORES (§49, §50)
-- ----------------------------------------------------------------------------
-- QUALITY-03 ya tiene el motor de indicadores y su catálogo CERRADO de fuentes
-- automáticas. No se crea `quality_customer_indicators`: se añaden claves al
-- catálogo que ya existe, y un indicador de satisfacción se configura como
-- cualquier otro.
--
-- §50 · Y NO se modifica ninguna medición cerrada. La fuente produce el valor
-- cuando QUALITY-03 lo pide; lo que ya se registró sigue como estaba.
-- ============================================================================

create or replace function public.quality_native_source_keys()
returns setof text
language sql
immutable
as $$
  select unnest(array[
    'quality.documents_effective_ratio',
    'quality.documents_review_overdue_count',
    'quality.document_approval_lead_time_days',
    'quality.processes_published_ratio',
    'quality.open_document_tasks_count',
    -- QUALITY-08
    'quality.customer_complaints_count',
    'quality.customer_complaints_closed_ratio',
    'quality.customer_survey_responses_count',
    'quality.customer_open_complaints_count'
  ]);
$$;

create or replace function public.quality_native_source_value(
  p_organization_id uuid,
  p_source_key      text,
  p_period_start    date,
  p_period_end      date
)
returns table (value numeric, inputs jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total   numeric;
  v_matched numeric;
begin
  case p_source_key

    -- % de documentos de Quality vigentes sobre los activos. Instantánea.
    when 'quality.documents_effective_ratio' then
      select count(*) filter (where d.disposition = 'active'),
             count(*) filter (where d.disposition = 'active' and c.lifecycle_state = 'effective')
        into v_total, v_matched
        from trazadoc_documents d
        join v_trazadoc_document_control c on c.document_id = d.id
       where d.organization_id = p_organization_id and d.module_key = 'quality';
      return query select
        case when v_total = 0 then null else round(v_matched * 100.0 / v_total, 2) end,
        jsonb_build_object('total_active', v_total, 'effective', v_matched,
                           'as_of', now(), 'nature', 'snapshot');

    -- Documentos de Quality con revisión periódica vencida. Instantánea.
    when 'quality.documents_review_overdue_count' then
      select count(*) into v_matched
        from v_trazadoc_document_control c
       where c.organization_id = p_organization_id
         and c.module_key = 'quality'
         and c.review_overdue;
      return query select v_matched,
        jsonb_build_object('overdue', v_matched, 'as_of', now(), 'nature', 'snapshot');

    -- Días promedio entre enviar a revisión y aprobar, para las revisiones
    -- APROBADAS DENTRO del periodo. Esta sí es propia del periodo.
    when 'quality.document_approval_lead_time_days' then
      select count(*),
             avg(extract(epoch from (r.approved_at - r.submitted_at)) / 86400.0)
        into v_total, v_matched
        from trazadoc_document_revisions r
        join trazadoc_documents d
          on d.id = r.document_id and d.module_key = 'quality'
       where r.organization_id = p_organization_id
         and r.approved_at is not null
         and r.submitted_at is not null
         and r.approved_at::date between p_period_start and p_period_end;
      return query select
        case when v_total = 0 then null else round(v_matched, 2) end,
        jsonb_build_object('approved_revisions', v_total, 'period_start', p_period_start,
                           'period_end', p_period_end, 'nature', 'period');

    -- % de procesos con una revisión publicada vigente. Instantánea.
    when 'quality.processes_published_ratio' then
      select count(*),
             count(*) filter (where exists (
               select 1 from quality_process_revisions r
                where r.process_id = p.id and r.status = 'published' and r.effective_to is null))
        into v_total, v_matched
        from quality_processes p
       where p.organization_id = p_organization_id and p.status = 'active';
      return query select
        case when v_total = 0 then null else round(v_matched * 100.0 / v_total, 2) end,
        jsonb_build_object('active_processes', v_total, 'published', v_matched,
                           'as_of', now(), 'nature', 'snapshot');

    -- Tareas documentales todavía abiertas. Instantánea.
    when 'quality.open_document_tasks_count' then
      select count(*) into v_matched
        from work_tasks t
       where t.organization_id = p_organization_id
         and t.source_domain = 'document'
         and t.status in ('open', 'in_progress');
      return query select v_matched,
        jsonb_build_object('open_tasks', v_matched, 'as_of', now(), 'nature', 'snapshot');

    -- QUALITY-08 · Quejas y reclamos RECIBIDOS en el periodo. Contar quejas no
    -- es medir satisfacción: es medir cuántas llegaron.
    when 'quality.customer_complaints_count' then
      select count(*) into v_matched
        from quality_customer_feedback f
       where f.organization_id = p_organization_id
         and f.feedback_kind in ('complaint', 'claim')
         and f.received_on between p_period_start and p_period_end;
      return query select v_matched,
        jsonb_build_object('complaints', v_matched, 'period_start', p_period_start,
                           'period_end', p_period_end, 'nature', 'period');

    -- % de quejas del periodo que ya se cerraron. Sin quejas NO hay ratio: un
    -- 100 % sobre cero quejas afirmaría una gestión que no ocurrió.
    when 'quality.customer_complaints_closed_ratio' then
      select count(*),
             count(*) filter (where f.status in ('closed', 'answered'))
        into v_total, v_matched
        from quality_customer_feedback f
       where f.organization_id = p_organization_id
         and f.feedback_kind in ('complaint', 'claim')
         and f.received_on between p_period_start and p_period_end;
      return query select
        case when v_total = 0 then null else round(v_matched * 100.0 / v_total, 2) end,
        jsonb_build_object('complaints', v_total, 'closed', v_matched,
                           'period_start', p_period_start, 'period_end', p_period_end,
                           'nature', 'period');

    -- Respuestas de encuesta ENVIADAS en el periodo. Es un recuento, no una
    -- satisfacción: §39 en forma de fuente.
    when 'quality.customer_survey_responses_count' then
      select count(*) into v_matched
        from quality_survey_responses r
       where r.organization_id = p_organization_id
         and r.status = 'submitted' and r.superseded_by is null
         and r.submitted_at::date between p_period_start and p_period_end;
      return query select v_matched,
        jsonb_build_object('responses', v_matched, 'period_start', p_period_start,
                           'period_end', p_period_end, 'nature', 'period');

    -- Quejas todavía sin atender, hoy. Instantánea.
    when 'quality.customer_open_complaints_count' then
      select count(*) into v_matched
        from quality_customer_feedback f
       where f.organization_id = p_organization_id
         and f.feedback_kind in ('complaint', 'claim')
         and f.status in ('open', 'under_review');
      return query select v_matched,
        jsonb_build_object('open_complaints', v_matched, 'as_of', now(), 'nature', 'snapshot');

    else
      raise exception 'La fuente automática «%» no existe en el catálogo de Trazaloop.', p_source_key;
  end case;
end;
$$;
revoke all on function public.quality_native_source_value(uuid, text, date, date) from public, anon, authenticated;


-- ============================================================================
-- 18 · BARRIDO (§35, §57, §91)
-- ----------------------------------------------------------------------------
-- Idempotente. Todo lo que produce son AVISOS: ninguna rama toca una campaña,
-- una queja, un caso, un riesgo ni una no conformidad.
-- ============================================================================

create or replace function public.quality_customer_notice_recipient(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id
    from memberships m
   where m.organization_id = p_organization_id
     and m.status = 'active'
     and m.role_code in ('quality', 'admin')
   order by case m.role_code when 'quality' then 0 else 1 end, m.created_at, m.user_id
   limit 1;
$$;
revoke all on function public.quality_customer_notice_recipient(uuid) from public, anon, authenticated;


create or replace function public.quality_scan_customer_voice(p_organization_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alerts integer := 0;
begin
  -- §64 · Una sesión solo puede barrer SU empresa. Sin sesión —cron— se admite
  -- el barrido general, que es la única forma de que corra desatendido.
  if auth.uid() is not null then
    if p_organization_id is null then
      raise exception 'Indica sobre qué empresa quieres revisar la voz del cliente.';
    end if;
    if not is_org_member(p_organization_id) then
      raise exception 'No tienes acceso a esa empresa.';
    end if;
  end if;

  -- 18.1 · Quejas sin revisar tras siete días. Avisa; no las clasifica.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select f.organization_id, 'customer', 'complaint_unreviewed', 'warning',
         'quality_customer_feedback', f.id,
         quality_customer_notice_recipient(f.organization_id),
         'Queja sin revisar: ' || f.title,
         'Se recibió el ' || to_char(f.received_on, 'DD/MM/YYYY')
           || ' y sigue sin revisar. Revisarla NO la convierte en no conformidad: eso se decide después, y en un caso.',
         'complaint_unreviewed:' || f.id::text
    from quality_customer_feedback f
   where f.feedback_kind in ('complaint', 'claim')
     and f.status = 'open'
     and f.received_on <= current_date - 7
     and quality_customer_notice_recipient(f.organization_id) is not null
     and (p_organization_id is null or f.organization_id = p_organization_id)
     and not exists (select 1 from work_alerts w
                      where w.dedupe_key = 'complaint_unreviewed:' || f.id::text);

  insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                          title, description, assignee_profile_id, assignee_position_id,
                          status, dedupe_key)
  select f.organization_id, 'customer', 'complaint_review',
         'quality_customer_feedback', f.id,
         'Revisar la queja «' || f.title || '»',
         'Decide qué hacer con ella. Abrir un caso —o no— es tu decisión.',
         quality_customer_notice_recipient(f.organization_id), f.owner_position_id,
         'open', 'complaint_review:' || f.id::text
    from quality_customer_feedback f
   where f.feedback_kind in ('complaint', 'claim')
     and f.status = 'open'
     and f.received_on <= current_date - 7
     and quality_customer_notice_recipient(f.organization_id) is not null
     and (p_organization_id is null or f.organization_id = p_organization_id)
     and not exists (select 1 from work_tasks w
                      where w.dedupe_key = 'complaint_review:' || f.id::text);

  insert into quality_customer_signals (organization_id, signal_kind, detail, feedback_id)
  select f.organization_id, 'complaint_unreviewed',
         'Recibida el ' || to_char(f.received_on, 'DD/MM/YYYY') || ' y todavía sin revisar.', f.id
    from quality_customer_feedback f
   where f.feedback_kind in ('complaint', 'claim')
     and f.status = 'open'
     and f.received_on <= current_date - 7
     and (p_organization_id is null or f.organization_id = p_organization_id)
  on conflict do nothing;

  -- La señal se cierra sola en cuanto alguien la atiende. Una señal que hay que
  -- apagar a mano después de haber hecho el trabajo enseña a ignorarlas.
  update quality_customer_signals s
     set status = 'resolved', resolved_at = now()
    from quality_customer_feedback f
   where s.status = 'open' and s.signal_kind = 'complaint_unreviewed'
     and s.feedback_id = f.id and f.status <> 'open'
     and (p_organization_id is null or s.organization_id = p_organization_id);

  -- 18.2 · Campañas que cierran pronto. Es el aviso útil: todavía se puede
  -- hacer algo.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select c.organization_id, 'customer', 'campaign_closing_soon', 'info',
         'quality_survey_campaign', c.id,
         quality_customer_notice_recipient(c.organization_id),
         'La campaña «' || c.name || '» cierra pronto',
         'Cierra el ' || to_char(c.closes_on, 'DD/MM/YYYY') || '.',
         'campaign_closing:' || c.id::text || ':' || c.closes_on::text
    from quality_survey_campaigns c
   where c.status = 'open'
     and c.closes_on is not null
     and c.closes_on between current_date and current_date + 7
     and quality_customer_notice_recipient(c.organization_id) is not null
     and (p_organization_id is null or c.organization_id = p_organization_id)
     and not exists (select 1 from work_alerts w
                      where w.dedupe_key = 'campaign_closing:' || c.id::text || ':' || c.closes_on::text);

  -- 18.3 · Campaña por cerrar con pocas respuestas. §38 · SOLO cuando hay un
  -- denominador de verdad: sin él no se puede decir que sean «pocas».
  insert into quality_customer_signals (organization_id, signal_kind, detail, campaign_id)
  select s.organization_id, 'campaign_closing_low_responses',
         s.responses_count || ' de ' || s.population_size
           || ' invitados han respondido (' || s.response_rate || ' %).',
         s.campaign_id
    from v_quality_campaign_summary s
   where s.status = 'open'
     and s.closes_on is not null
     and s.closes_on between current_date and current_date + 7
     and s.response_rate is not null
     and s.response_rate < 30
     and (p_organization_id is null or s.organization_id = p_organization_id)
  on conflict do nothing;

  -- 18.4 · Caída de satisfacción entre dos mediciones COMPARABLES. Si la clave
  -- de comparabilidad cambió, no hay caída que declarar: hay un instrumento
  -- distinto, y eso es otra señal.
  insert into quality_customer_signals (organization_id, signal_kind, detail, definition_id, campaign_id)
  select cur.organization_id, 'satisfaction_drop',
         'Pasó de ' || prev.value || ' a ' || cur.value || ' con el mismo instrumento.',
         cur.definition_id, cur.campaign_id
    from v_quality_metric_series cur
    join lateral (
      select p.value, p.comparability_key
        from v_quality_metric_series p
       where p.organization_id = cur.organization_id
         and p.definition_id = cur.definition_id
         and p.computed_at < cur.computed_at
       order by p.computed_at desc
       limit 1
    ) prev on true
   where cur.value is not null and prev.value is not null
     and cur.comparability_key = prev.comparability_key
     and prev.value > 0
     and cur.value < prev.value * 0.85
     and (p_organization_id is null or cur.organization_id = p_organization_id)
  on conflict do nothing;

  -- 18.5 · Rotura de comparabilidad: no es una caída, es un cambio de regla.
  -- Decirlo evita que alguien lea una bajada donde solo hay otra escala.
  insert into quality_customer_signals (organization_id, signal_kind, detail, definition_id, campaign_id)
  select m.organization_id, 'comparability_break',
         'Esta medición no se puede comparar con la anterior: cambió la pregunta, la escala o el método.',
         m.definition_id, m.campaign_id
    from v_quality_metric_series m
   where m.breaks_comparability
     and (p_organization_id is null or m.organization_id = p_organization_id)
  on conflict do nothing;

  select count(*) into v_alerts
    from quality_customer_signals
   where status = 'open'
     and (p_organization_id is null or organization_id = p_organization_id);

  return coalesce(v_alerts, 0);
end;
$$;
revoke all on function public.quality_scan_customer_voice(uuid) from public, anon;
grant execute on function public.quality_scan_customer_voice(uuid) to authenticated;

comment on function public.quality_scan_customer_voice(uuid) is
  'QUALITY-08 · §35 · Solo produce avisos y señales. Ninguna rama toca campañas, quejas, casos, riesgos ni clasificaciones.';


-- ============================================================================
-- 19 · CICLO DE VIDA (§60, §88)
-- ----------------------------------------------------------------------------
-- Una encuesta en borrador sin uso se elimina. Con respuestas, no: se retira.
-- Y una respuesta enviada no se borra nunca, porque es lo que dijo un cliente.
-- ============================================================================

create or replace function public.quality_survey_deletion_verdict(p_survey_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_survey   record;
  v_blocking jsonb := '[]'::jsonb;
  v_n        integer;
begin
  select * into v_survey from quality_surveys where id = p_survey_id;
  if v_survey.id is null or not is_org_member(v_survey.organization_id) then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Esta encuesta no existe.', 'blocking', '[]'::jsonb);
  end if;

  select count(*) into v_n
    from quality_survey_responses r
    join quality_survey_campaigns c on c.id = r.campaign_id
   where c.survey_id = p_survey_id and r.status = 'submitted';
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'respuesta recibida' else 'respuestas recibidas' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_survey_campaigns where survey_id = p_survey_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'campaña' else 'campañas' end, 'count', v_n);
  end if;

  select count(*) into v_n
    from quality_survey_versions where survey_id = p_survey_id and status <> 'draft';
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'versión publicada' else 'versiones publicadas' end,
      'count', v_n);
  end if;

  if jsonb_array_length(v_blocking) > 0 then
    return jsonb_build_object(
      'can_hard_delete', false, 'reason_code', 'has_history',
      'reason', 'Esta encuesta ya produjo historia y se conserva.',
      'blocking', v_blocking,
      'alternative', 'retire', 'alternative_label', 'Puedes retirarla: deja de usarse y su historia sigue consultable');
  end if;

  return jsonb_build_object(
    'can_hard_delete', true, 'reason_code', 'disposable',
    'reason', 'Esta encuesta sigue siendo un borrador sin uso.',
    'blocking', '[]'::jsonb, 'alternative', null, 'alternative_label', null);
end;
$$;
revoke all on function public.quality_survey_deletion_verdict(uuid) from public, anon, authenticated;


create or replace function public.quality_customer_deletion_verdict(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile  record;
  v_blocking jsonb := '[]'::jsonb;
  v_n        integer;
begin
  select * into v_profile from quality_customer_profiles where id = p_profile_id;
  if v_profile.id is null or not is_org_member(v_profile.organization_id) then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Este cliente no existe.', 'blocking', '[]'::jsonb);
  end if;

  select count(*) into v_n from quality_customer_feedback where customer_id = p_profile_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'manifestación registrada' else 'manifestaciones registradas' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_survey_responses where customer_id = p_profile_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'respuesta identificada' else 'respuestas identificadas' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_survey_invitations where customer_id = p_profile_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'invitación enviada' else 'invitaciones enviadas' end,
      'count', v_n);
  end if;

  if jsonb_array_length(v_blocking) > 0 then
    return jsonb_build_object(
      'can_hard_delete', false, 'reason_code', 'has_history',
      'reason', 'Este cliente ya tiene historia en el sistema de gestión y se conserva.',
      'blocking', v_blocking,
      'alternative', 'retire', 'alternative_label', 'Puedes retirarlo: la empresa sigue existiendo, lo que termina es la relación');
  end if;

  return jsonb_build_object(
    'can_hard_delete', true, 'reason_code', 'disposable',
    'reason', 'Este cliente todavía no tiene nada registrado.',
    'blocking', '[]'::jsonb, 'alternative', null, 'alternative_label', null);
end;
$$;
revoke all on function public.quality_customer_deletion_verdict(uuid) from public, anon, authenticated;


-- La puerta pública sigue siendo UNA: la misma RPC de ciclo de vida para todo.
create or replace function public.quality_deletion_eligibility(p_entity text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_none jsonb := jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
                                     'reason', 'Este registro no existe.', 'blocking', '[]'::jsonb);
begin
  -- Sin sesión no hay dictamen: la respuesta es la misma que para algo que no
  -- existe.
  if auth.uid() is null then return v_none; end if;

  v_org := case p_entity
    when 'indicator'      then (select organization_id from quality_indicators      where id = p_id)
    when 'objective'      then (select organization_id from quality_objectives      where id = p_id)
    when 'position'       then (select organization_id from quality_positions       where id = p_id)
    when 'document'       then (select organization_id from trazadoc_documents      where id = p_id)
    when 'process'        then (select organization_id from quality_processes       where id = p_id)
    when 'case'           then (select organization_id from work_cases              where id = p_id)
    when 'action'         then (select organization_id from work_actions            where id = p_id)
    when 'risk'           then (select organization_id from quality_risks           where id = p_id)
    when 'opportunity'    then (select organization_id from quality_opportunities   where id = p_id)
    when 'control'        then (select organization_id from quality_controls        where id = p_id)
    when 'methodology_version' then (select organization_id from quality_risk_methodology_versions where id = p_id)
    when 'person'         then (select organization_id from quality_people          where id = p_id)
    when 'competency'     then (select organization_id from quality_competencies    where id = p_id)
    when 'knowledge_item' then (select organization_id from quality_knowledge_items where id = p_id)
    when 'lesson'         then (select organization_id from quality_lessons_learned where id = p_id)
    when 'supplier'       then (select organization_id from quality_supplier_profiles where id = p_id)
    when 'customer'       then (select organization_id from quality_customer_profiles where id = p_id)
    when 'survey'         then (select organization_id from quality_surveys         where id = p_id)
  end;

  -- Para quien no es miembro, la respuesta es la misma que para un
  -- identificador inventado. Ni los contadores se filtran.
  if v_org is null or not is_org_member(v_org) then return v_none; end if;

  -- QUALITY-06 · Y ser miembro no basta para las PERSONAS: quien no puede ver
  -- una ficha tampoco puede enterarse de cuánta historia tiene. Esta rama venía
  -- de 0123 y se conserva palabra por palabra.
  if p_entity = 'person' and not quality_can_read_person(v_org, p_id) then
    return v_none;
  end if;

  return case p_entity
    when 'indicator'      then quality_indicator_deletion_verdict(p_id)
    when 'objective'      then quality_objective_deletion_verdict(p_id)
    when 'position'       then quality_position_deletion_verdict(p_id)
    when 'document'       then trazadoc_document_deletion_verdict(p_id)
    when 'process'        then quality_process_deletion_verdict(p_id)
    when 'case'           then work_case_deletion_verdict(p_id)
    when 'action'         then work_action_deletion_verdict(p_id)
    when 'risk'           then quality_risk_deletion_verdict(p_id)
    when 'opportunity'    then quality_opportunity_deletion_verdict(p_id)
    when 'control'        then quality_control_deletion_verdict(p_id)
    when 'methodology_version' then quality_methodology_version_deletion_verdict(p_id)
    when 'person'         then quality_person_deletion_verdict(p_id)
    when 'competency'     then quality_competency_deletion_verdict(p_id)
    when 'knowledge_item' then quality_knowledge_item_deletion_verdict(p_id)
    when 'lesson'         then quality_lesson_deletion_verdict(p_id)
    when 'supplier'       then quality_supplier_deletion_verdict(p_id)
    when 'customer'       then quality_customer_deletion_verdict(p_id)
    when 'survey'         then quality_survey_deletion_verdict(p_id)
  end;
end;
$$;
revoke all on function public.quality_deletion_eligibility(text, uuid) from public, anon;
grant execute on function public.quality_deletion_eligibility(text, uuid) to authenticated;


-- Y las guardias, para que el dictamen no sea solo una opinión.
create or replace function public.quality_survey_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  v := quality_survey_deletion_verdict(old.id);
  if not (v->>'can_hard_delete')::boolean then
    raise exception '%', v->>'reason';
  end if;
  return old;
end;
$$;

create trigger t_quality_survey_delete_guard
  before delete on public.quality_surveys
  for each row execute function public.quality_survey_delete_guard();

create or replace function public.quality_customer_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  v := quality_customer_deletion_verdict(old.id);
  if not (v->>'can_hard_delete')::boolean then
    raise exception '%', v->>'reason';
  end if;
  return old;
end;
$$;

create trigger t_quality_customer_delete_guard
  before delete on public.quality_customer_profiles
  for each row execute function public.quality_customer_delete_guard();

-- Una campaña con respuestas tampoco se borra.
create or replace function public.quality_campaign_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from quality_survey_responses r
              where r.campaign_id = old.id and r.status = 'submitted') then
    raise exception 'Esta campaña tiene respuestas recibidas: no se elimina. Lo que dijeron los clientes se conserva.';
  end if;
  return old;
end;
$$;

create trigger t_quality_campaign_delete_guard
  before delete on public.quality_survey_campaigns
  for each row execute function public.quality_campaign_delete_guard();


-- ============================================================================
-- 20 · RLS (§62, §63, §65, §100)
-- ----------------------------------------------------------------------------
-- Deny-by-default en las doce tablas. Y una asimetría deliberada:
--
--   · las RESPUESTAS y sus ANSWERS solo se LEEN desde la aplicación. No hay
--     política de `insert`, `update` ni `delete` para la sesión: la única
--     forma de crear una respuesta es la RPC pública, que decide qué identidad
--     lleva. Sin esto, cualquiera con rol podría insertar una respuesta
--     «anónima» con el cliente puesto y romper la promesa desde dentro.
--
--   · las INVITACIONES no se leen enteras por la sesión ordinaria: el hash del
--     token no sale nunca de la base.
--
--   · las SEÑALES se leen y se descartan, pero no se fabrican.
-- ============================================================================

alter table public.quality_customer_profiles          enable row level security;
alter table public.quality_surveys                    enable row level security;
alter table public.quality_survey_versions            enable row level security;
alter table public.quality_survey_questions           enable row level security;
alter table public.quality_customer_topics            enable row level security;
alter table public.quality_survey_campaigns           enable row level security;
alter table public.quality_survey_invitations         enable row level security;
alter table public.quality_survey_responses           enable row level security;
alter table public.quality_survey_answers             enable row level security;
alter table public.quality_customer_metric_definitions enable row level security;
alter table public.quality_customer_metric_results    enable row level security;
alter table public.quality_customer_feedback          enable row level security;
alter table public.quality_customer_signals           enable row level security;
alter table public.quality_customer_voice_reviews     enable row level security;

-- Lectura: cualquier miembro de la empresa.
create policy quality_customer_profiles_select on public.quality_customer_profiles
  for select to authenticated using (is_org_member(organization_id));
create policy quality_surveys_select on public.quality_surveys
  for select to authenticated using (is_org_member(organization_id));
create policy quality_survey_versions_select on public.quality_survey_versions
  for select to authenticated using (is_org_member(organization_id));
create policy quality_survey_questions_select on public.quality_survey_questions
  for select to authenticated using (is_org_member(organization_id));
create policy quality_customer_topics_select on public.quality_customer_topics
  for select to authenticated using (is_org_member(organization_id));
create policy quality_survey_campaigns_select on public.quality_survey_campaigns
  for select to authenticated using (is_org_member(organization_id));
create policy quality_survey_responses_select on public.quality_survey_responses
  for select to authenticated using (is_org_member(organization_id));
create policy quality_survey_answers_select on public.quality_survey_answers
  for select to authenticated using (is_org_member(organization_id));
create policy quality_customer_metric_definitions_select on public.quality_customer_metric_definitions
  for select to authenticated using (is_org_member(organization_id));
create policy quality_customer_metric_results_select on public.quality_customer_metric_results
  for select to authenticated using (is_org_member(organization_id));
create policy quality_customer_feedback_select on public.quality_customer_feedback
  for select to authenticated using (is_org_member(organization_id));
create policy quality_customer_signals_select on public.quality_customer_signals
  for select to authenticated using (is_org_member(organization_id));
create policy quality_customer_voice_reviews_select on public.quality_customer_voice_reviews
  for select to authenticated using (is_org_member(organization_id));

-- §66 · Las invitaciones se leen SIN el hash: la política deja ver la fila,
-- pero el `grant` de columna es el que impide que el secreto salga.
create policy quality_survey_invitations_select on public.quality_survey_invitations
  for select to authenticated using (is_org_member(organization_id));

-- Escritura ordinaria: quien administra el dominio.
create policy quality_customer_profiles_write on public.quality_customer_profiles
  for all to authenticated
  using (quality_manages_customer_voice(organization_id))
  with check (quality_manages_customer_voice(organization_id));
create policy quality_surveys_write on public.quality_surveys
  for all to authenticated
  using (quality_manages_customer_voice(organization_id))
  with check (quality_manages_customer_voice(organization_id));
create policy quality_survey_versions_write on public.quality_survey_versions
  for all to authenticated
  using (quality_manages_customer_voice(organization_id))
  with check (quality_manages_customer_voice(organization_id));
create policy quality_survey_questions_write on public.quality_survey_questions
  for all to authenticated
  using (quality_manages_customer_voice(organization_id))
  with check (quality_manages_customer_voice(organization_id));
create policy quality_customer_topics_write on public.quality_customer_topics
  for all to authenticated
  using (quality_manages_customer_voice(organization_id))
  with check (quality_manages_customer_voice(organization_id));
create policy quality_survey_campaigns_write on public.quality_survey_campaigns
  for all to authenticated
  using (quality_manages_customer_voice(organization_id))
  with check (quality_manages_customer_voice(organization_id));
create policy quality_customer_metric_definitions_write on public.quality_customer_metric_definitions
  for all to authenticated
  using (quality_manages_customer_voice(organization_id))
  with check (quality_manages_customer_voice(organization_id));
create policy quality_customer_feedback_write on public.quality_customer_feedback
  for all to authenticated
  using (quality_manages_customer_voice(organization_id))
  with check (quality_manages_customer_voice(organization_id));
create policy quality_customer_voice_reviews_write on public.quality_customer_voice_reviews
  for all to authenticated
  using (quality_manages_customer_voice(organization_id))
  with check (quality_manages_customer_voice(organization_id));

-- Las invitaciones se emiten y se revocan; el hash lo escribe la RPC.
create policy quality_survey_invitations_update on public.quality_survey_invitations
  for update to authenticated
  using (quality_manages_customer_voice(organization_id))
  with check (quality_manages_customer_voice(organization_id));

-- Las señales se atienden, no se fabrican.
create policy quality_customer_signals_update on public.quality_customer_signals
  for update to authenticated
  using (quality_manages_customer_voice(organization_id))
  with check (quality_manages_customer_voice(organization_id));

-- §65 · Y aquí NO hay política de escritura para respuestas, answers ni
-- resultados de métrica. La sesión no puede fabricar una respuesta, ni
-- corregirla en el sitio, ni inventar un resultado: todo pasa por su RPC, que
-- es donde vive la regla del anonimato. Sin esta ausencia, la promesa
-- dependería de que la aplicación se acordara.

-- Privilegios de tabla. Se REVOCA todo primero —incluido a `authenticated`—
-- porque el proyecto concede privilegios por defecto sobre cada tabla nueva, y
-- entre ellos va `truncate`, que se salta la RLS entera. Después se concede
-- exactamente lo que cada tabla necesita. `anon` no toca nada: su única puerta
-- son las dos RPC públicas.
revoke all on table public.quality_customer_profiles           from anon, authenticated;
revoke all on table public.quality_surveys                     from anon, authenticated;
revoke all on table public.quality_survey_versions             from anon, authenticated;
revoke all on table public.quality_survey_questions            from anon, authenticated;
revoke all on table public.quality_customer_topics             from anon, authenticated;
revoke all on table public.quality_survey_campaigns            from anon, authenticated;
revoke all on table public.quality_survey_invitations          from anon, authenticated;
revoke all on table public.quality_survey_responses            from anon, authenticated;
revoke all on table public.quality_survey_answers              from anon, authenticated;
revoke all on table public.quality_customer_metric_definitions from anon, authenticated;
revoke all on table public.quality_customer_metric_results     from anon, authenticated;
revoke all on table public.quality_customer_feedback           from anon, authenticated;
revoke all on table public.quality_customer_signals            from anon, authenticated;
revoke all on table public.quality_customer_voice_reviews      from anon, authenticated;

grant select, insert, update, delete on table public.quality_customer_profiles          to authenticated;
grant select, insert, update, delete on table public.quality_surveys                    to authenticated;
grant select, insert, update, delete on table public.quality_survey_versions            to authenticated;
grant select, insert, update, delete on table public.quality_survey_questions           to authenticated;
grant select, insert, update, delete on table public.quality_customer_topics            to authenticated;
grant select, insert, update, delete on table public.quality_survey_campaigns           to authenticated;
grant select, insert, update, delete on table public.quality_customer_metric_definitions to authenticated;
grant select, insert, update, delete on table public.quality_customer_feedback          to authenticated;
grant select, insert, update, delete on table public.quality_customer_voice_reviews     to authenticated;

-- §66 · El hash del token NO se concede. La interfaz ve el prefijo y el estado;
-- el secreto no sale de la base ni para quien administra.
grant select (id, organization_id, campaign_id, token_prefix, customer_id, contact_id,
              sent_to_email, sent_at, status, expires_at, used_at, revoked_at, revoked_by,
              created_by, created_at, updated_at)
  on table public.quality_survey_invitations to authenticated;
grant update (status, revoked_at, revoked_by) on table public.quality_survey_invitations to authenticated;

-- Solo lectura: las respuestas y los resultados se crean por RPC.
grant select on table public.quality_survey_responses     to authenticated;
grant select on table public.quality_survey_answers       to authenticated;
grant select on table public.quality_customer_metric_results to authenticated;
grant select, update on table public.quality_customer_signals to authenticated;

-- Las vistas se conceden aparte de sus tablas. `security_invoker` decide QUÉ
-- filas devuelve la vista; el privilegio decide si se puede consultarla, y sin
-- él la aplicación recibe «permission denied» aunque la RLS fuera perfecta.
revoke all on table public.v_quality_campaign_summary  from anon, authenticated;
revoke all on table public.v_quality_customer_overview from anon, authenticated;
revoke all on table public.v_quality_metric_series     from anon, authenticated;

grant select on table public.v_quality_campaign_summary  to authenticated;
grant select on table public.v_quality_customer_overview to authenticated;
grant select on table public.v_quality_metric_series     to authenticated;


-- ============================================================================
-- 21 · COMENTARIO FINAL
-- ============================================================================

comment on table public.quality_survey_responses is
  'QUALITY-08 · VC-11/VC-29 · Solo se LEE desde la aplicación: crear una respuesta pasa siempre por la RPC, que es donde vive la regla del anonimato. Y no lleva auditoría de fila porque una fila de auditoría guarda quién escribió, que es justo lo que una respuesta anónima no puede saber.';
