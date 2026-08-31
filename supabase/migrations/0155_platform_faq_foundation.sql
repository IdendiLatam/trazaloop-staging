-- ============================================================================
-- Trazaloop · PE-02B1 · LOS CIMIENTOS DE LA FAQ
-- ----------------------------------------------------------------------------
-- QUÉ PROBLEMA CIERRA
--
-- Hoy las preguntas frecuentes de Trazaloop viven en `docs/FAQ_PILOT.md`: diez
-- respuestas que ningún cliente ve y que nadie puede corregir sin desplegar.
-- Una respuesta sobre seguridad que se corrige desplegando es una respuesta que
-- se corrige tarde.
--
-- Esta migración crea el CONTENIDO ADMINISTRABLE. No crea ninguna pantalla: la
-- consola llega en B2 y la FAQ pública en B3. Aquí solo se decide dónde vive el
-- contenido, quién puede escribirlo y qué se puede leer sin sesión.
--
--
-- POR QUÉ SE PARECE TANTO A 0136
--
-- Porque es el mismo problema y ya está resuelto. QUALITY-12.2A construyó para
-- la guía de autoría exactamente esto: identidad estable, revisiones inmutables
-- con vigencia, una sola abierta a la vez, publicación como única puerta de
-- escritura y lectura que aplica su regla DENTRO de la base. Se repite el
-- patrón a propósito y con las mismas palabras, para que quien conozca uno
-- reconozca el otro sin releerlo.
--
-- Lo que NO se hace es meter la FAQ dentro de las tablas de 0136. Son recursos
-- distintos —una se busca y se ordena por categoría, la otra se pega a una
-- sección de un documento— y unificarlas obligaría a media docena de columnas
-- nulas según la fila. PEH-01 lo decidió y aquí solo se cumple.
--
--
-- LAS TRES PIEZAS, Y POR QUÉ SON TRES Y NO UNA
--
--   · `faq_categories`  · filas, no un enum: añadir una categoría no puede ser
--                         una migración.
--   · `faq_entries`     · la IDENTIDAD. No cambia. No contiene ni una palabra
--                         del texto: por eso se puede reescribir la respuesta
--                         sin romper un enlace, una traducción ni una métrica.
--   · `faq_entry_revisions` · el TEXTO, inmutable, con su periodo de vigencia.
--
-- Y una cuarta que no es historia:
--
--   · `faq_entry_drafts` · el BORRADOR. Es lo único mutable de todo esto, y
--                         vive en su propia tabla justamente por eso: mezclar
--                         lo que se está escribiendo con lo que ya se publicó
--                         es la forma habitual de enseñar media frase.
--
--
-- LO QUE ESTA MIGRACIÓN NO TIENE, Y ES DELIBERADO
--
-- No hay `organization_id` en ninguna tabla. La FAQ es catálogo del producto,
-- no dato de una empresa: no hay nada que separar entre empresas, y añadir la
-- columna «por si acaso» crearía la duda de si alguna empresa tiene una FAQ
-- propia. No la tiene.
-- ============================================================================


-- ============================================================================
-- 1 · LAS CATEGORÍAS
-- ----------------------------------------------------------------------------
-- `code` es la identidad y no se toca; `label` es lo que se lee y puede
-- cambiar. Es la misma distinción que el repositorio hace en todos sus
-- catálogos, y la razón es siempre la misma: renombrar «Seguridad y
-- privacidad» no puede huerfanar treinta preguntas.
-- ============================================================================

create table public.faq_categories (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  label       text not null,
  description text,
  sort_order  integer not null default 100,
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint faq_categories_code_uniq unique (code),
  constraint faq_categories_code_check
    check (code = lower(btrim(code)) and code ~ '^[a-z][a-z0-9_]{1,40}$'),
  constraint faq_categories_label_check
    check (length(btrim(label)) between 2 and 80),
  constraint faq_categories_status_check check (status in ('active', 'inactive'))
);

comment on table public.faq_categories is
  'PE-02B1 · Las categorias de la FAQ. Filas y no un enum: anadir una categoria no puede exigir una migracion. El code es identidad; el label se lee y puede cambiar.';

create index faq_categories_order_idx on public.faq_categories (sort_order, code);

create trigger t_faq_categories_updated
  before update on public.faq_categories
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 2 · LA IDENTIDAD DE UNA PREGUNTA
-- ----------------------------------------------------------------------------
-- `slug` es la identidad estable y legible. No se deriva del texto de la
-- pregunta: una pregunta se reformula —«¿Puede otra empresa ver mis datos?» a
-- «¿Puede otra empresa ver mi información?»— y su identidad no debería
-- moverse con la redacción. Es lo que permitirá, más adelante, enlazar a una
-- respuesta, traducirla y medir cuántas veces se leyó sin que nada de eso se
-- rompa al corregir una coma.
--
--
-- LOS TRES ESTADOS, Y POR QUÉ «RETIRADA» NO ES «BORRADOR»
--
--   draft       · nunca se publicó. No existe para nadie de fuera.
--   published   · hay una revisión vigente.
--   unpublished · se publicó y se retiró.
--
-- Los dos últimos se distinguen a propósito: un cliente que buscaba una
-- respuesta que existía merece que podamos saber cuándo dejó de estar, y con
-- qué texto estuvo. Colapsarlos en «no visible» borraría esa pregunta.
--
--
-- EL ALCANCE POR MÓDULO, SIN AMBIGÜEDAD
--
-- `scope` dice si la entrada es general o de módulos concretos, y la lista va
-- aparte. No se usa «lista vacía significa todos», que es la ambigüedad que
-- convierte un descuido en una entrada global.
--
-- Las claves son las CANÓNICAS de `lib/modules/catalog.ts`. No se inventa un
-- segundo vocabulario de módulos: ya hay tres en el repositorio —el comercial,
-- el de estructuras y el de tickets— y un cuarto sería el que nadie sabría
-- traducir.
-- ============================================================================

create table public.faq_entries (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  category_id  uuid not null references public.faq_categories (id) on delete restrict,

  sort_order   integer not null default 100,
  is_featured  boolean not null default false,

  -- Decisión EDITORIAL, no comercial: ver el comentario de §7.
  visibility   text not null default 'authenticated',

  scope        text not null default 'global',
  module_keys  text[] not null default '{}'::text[],

  status       text not null default 'draft',

  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint faq_entries_slug_uniq unique (slug),
  constraint faq_entries_slug_check
    check (slug = lower(btrim(slug)) and slug ~ '^[a-z][a-z0-9_]{2,60}$'),
  constraint faq_entries_visibility_check
    check (visibility in ('public', 'authenticated')),
  constraint faq_entries_status_check
    check (status in ('draft', 'published', 'unpublished')),
  constraint faq_entries_scope_check check (scope in ('global', 'modules')),
  -- La forma de cada alcance, para que no exista una fila a medias.
  constraint faq_entries_scope_shape_check
    check (
      (scope = 'global'  and cardinality(module_keys) = 0)
      or
      (scope = 'modules' and cardinality(module_keys) between 1 and 4)
    ),
  -- Las claves canónicas del catálogo comercial. Si mañana nace un módulo, esta
  -- lista se amplía en una migración y una prueba estática avisa de que hay que
  -- hacerlo: es preferible a un texto libre donde `Quality` y `quality` conviven.
  constraint faq_entries_module_keys_check
    check (module_keys <@ array['cpr', 'textiles', 'quality', 'construccion']::text[])
);

comment on table public.faq_entries is
  'PE-02B1 · La IDENTIDAD de una pregunta frecuente: su slug estable, su categoria, su orden y quien puede verla. Ni una palabra del texto vive aqui — asi se reformula una pregunta sin romper su enlace ni su historia.';
comment on column public.faq_entries.visibility is
  'PE-02B1 · public = se lee SIN sesion. authenticated = exige sesion. Es una decision EDITORIAL y no tiene nada que ver con que modulos tenga contratados la empresa (PEH-05).';
comment on column public.faq_entries.module_keys is
  'PE-02B1 · A que modulos SE REFIERE la entrada. No concede ni deniega acceso a nada: es materia del contenido, no del derecho comercial.';
comment on column public.faq_entries.status is
  'PE-02B1 · draft = nunca publicada. published = tiene revision vigente. unpublished = se publico y se retiro. Los dos ultimos se distinguen a proposito.';

create index faq_entries_category_idx on public.faq_entries (category_id, sort_order);
create index faq_entries_status_idx on public.faq_entries (status)
  where status = 'published';
create index faq_entries_featured_idx on public.faq_entries (is_featured)
  where is_featured;

create trigger t_faq_entries_updated
  before update on public.faq_entries
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 3 · LAS REVISIONES · INMUTABLES
-- ----------------------------------------------------------------------------
-- Mismo patrón que 0136 y que las revisiones documentales de QUALITY-02:
-- `effective_from` / `effective_to`, con una sola abierta por entrada e idioma.
-- Es lo que permite preguntar «¿qué decía esta respuesta en marzo?» sin guardar
-- una copia por consulta.
--
--
-- EL IDIOMA VIVE AQUÍ, Y NO EN LA IDENTIDAD
--
-- Hoy todo es `es` y no hay traducción ni selector. Pero si el idioma viviera
-- en la identidad, traducir mañana significaría duplicar cada pregunta y perder
-- que son la misma. Poniéndolo en la revisión, «la vigente» pasa a ser «la
-- vigente EN ESTE IDIOMA» y no hace falta nada más. Cuesta una columna hoy;
-- ahorra una migración de datos después (PEH-12).
--
--
-- LA PROCEDENCIA DE LO QUE SE AFIRMA
--
-- `verification_status`, `source_basis`, `verified_at` y `verification_note` no
-- son burocracia. La auditoría de PE-02A dejó claro que la FAQ va a afirmar
-- cosas sobre aislamiento entre empresas, sobre qué ve el personal de Trazaloop
-- y sobre qué hace el proveedor del modelo con lo que recibe. Una afirmación
-- así, publicada sin decir en qué se apoya, envejece hasta volverse falsa sin
-- que nadie se entere.
--
-- Y hay un estado que existe precisamente para no publicar:
-- `external_policy_verification_required`. La función de publicación lo
-- RECHAZA. Así, «no publicar una promesa que depende de un tercero sin
-- verificarla» deja de depender de que alguien se acuerde (PEH-11).
--
-- `external_source_url` y `external_source_checked_on` guardan la comprobación
-- de esa política externa: qué se leyó y cuándo. La política del proveedor NO
-- se codifica en la aplicación —cambiaría sin que el código se entere—; se
-- comprueba, se fecha y se escribe en la respuesta, que es contenido versionado.
-- ============================================================================

create table public.faq_entry_revisions (
  id               uuid primary key default gen_random_uuid(),
  entry_id         uuid not null references public.faq_entries (id) on delete cascade,
  revision_number  integer not null,
  language         text not null default 'es',

  question         text not null,
  answer_short     text not null,
  answer_long      text,

  -- §17 · La búsqueda se prepara aquí, en la revisión, porque es donde está el
  -- texto. Columna generada: no puede quedar desincronizada del contenido.
  search_document  tsvector generated always as (
    to_tsvector('spanish'::regconfig,
      coalesce(question, '') || ' ' || coalesce(answer_short, '') || ' '
      || coalesce(answer_long, ''))
  ) stored,

  normative_class  text not null default 'safe',

  verification_status text not null default 'not_verified',
  source_basis     text,
  verified_at      timestamptz,
  verification_note text,
  external_source_url text,
  external_source_checked_on date,

  content_hash     text not null,

  effective_from   timestamptz not null default now(),
  effective_to     timestamptz,
  superseded_by_revision_id uuid references public.faq_entry_revisions (id),

  change_note      text,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),

  constraint faq_revisions_number_check check (revision_number >= 1),
  constraint faq_revisions_uniq unique (entry_id, language, revision_number),
  constraint faq_revisions_language_check check (language ~ '^[a-z]{2}$'),
  constraint faq_revisions_period_check
    check (effective_to is null or effective_to >= effective_from),
  constraint faq_revisions_question_check
    check (length(btrim(question)) between 5 and 300),
  constraint faq_revisions_short_check
    check (length(btrim(answer_short)) between 5 and 1200),
  constraint faq_revisions_long_check
    check (answer_long is null or length(btrim(answer_long)) <= 20000),
  -- La misma lista cerrada que 0136. No se inventa una segunda clasificación
  -- normativa: la que hay ya distingue lo que hace falta distinguir.
  constraint faq_revisions_normative_check
    check (normative_class in (
      'safe',                 -- no menciona normas ni esquemas
      'normative_reference',  -- los menciona, y los enmarca como referencia
      'conformity_risk',      -- podría inducir a afirmar cumplimiento
      'certification_risk',   -- podría inducir a afirmar certificación o sello
      'ambiguous'             -- se puede leer de las dos maneras
    )),
  constraint faq_revisions_verification_check
    check (verification_status in (
      'verified',                             -- comprobado, reproducible
      'verified_with_qualifier',              -- cierto con una salvedad que hay que decir
      'external_policy_verification_required',-- depende de un tercero
      'not_verified',                         -- no se pudo comprobar
      'must_not_claim'                        -- publicarlo sería falso
    )),
  -- Una salvedad que no se escribe no es una salvedad.
  constraint faq_revisions_qualifier_note_check
    check (verification_status <> 'verified_with_qualifier'
           or length(btrim(coalesce(verification_note, ''))) >= 10),
  -- Una comprobación externa sin fecha no es una comprobación: la política de
  -- un tercero cambia, y sin fecha no se sabe cuándo dejó de ser cierta.
  constraint faq_revisions_external_dated_check
    check (external_source_url is null or external_source_checked_on is not null)
);

comment on table public.faq_entry_revisions is
  'PE-02B1 · El TEXTO de una respuesta, inmutable. Cambiarlo crea una revision nueva y cierra la anterior: por eso se puede saber que respondia Trazaloop en una fecha, y quien lo escribio.';
comment on column public.faq_entry_revisions.verification_status is
  'PE-02B1 · En que estado esta lo que esta respuesta AFIRMA. external_policy_verification_required, not_verified y must_not_claim NO se pueden publicar: la funcion de publicacion los rechaza.';
comment on column public.faq_entry_revisions.source_basis is
  'PE-02B1 · Donde se comprobo lo que la respuesta afirma: migracion, politica, archivo o medicion. Interno: no sale por la lectura publica.';
comment on column public.faq_entry_revisions.external_source_url is
  'PE-02B1 · La politica de un tercero se COMPRUEBA y se FECHA; no se codifica en la aplicacion, porque cambiaria sin que el codigo se entere.';
comment on column public.faq_entry_revisions.search_document is
  'PE-02B1 · §17 · Texto buscable en espanol, generado del contenido. Sin servicios externos, sin vectores y sin IA.';

-- Una sola revisión abierta por entrada e idioma. Es lo que hace que «la
-- vigente» sea una pregunta con una sola respuesta.
create unique index faq_revisions_vigente
  on public.faq_entry_revisions (entry_id, language)
  where effective_to is null;

create index faq_revisions_hist_idx
  on public.faq_entry_revisions (entry_id, language, effective_from desc);

create index faq_revisions_search_idx
  on public.faq_entry_revisions using gin (search_document)
  where effective_to is null;


-- ----------------------------------------------------------------------------
-- La inmutabilidad, y su única excepción
-- ----------------------------------------------------------------------------
-- Una revisión publicada no se toca. Lo único que se le puede hacer es
-- CERRARLA —poner su fin de vigencia y quién la sucede— y solo una vez.
-- Sin esa excepción no habría forma de suceder una revisión; con más margen,
-- «inmutable» sería un adorno.
--
-- Se prohíbe también el borrado, y por la misma razón que en 0136: si una
-- respuesta sobre seguridad se pudiera borrar, la historia de lo que Trazaloop
-- afirmó dejaría de ser historia.
-- ----------------------------------------------------------------------------
create or replace function public.faq_revision_is_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una revisión de la FAQ no se borra: se sucede con otra. Así se puede saber qué respondía Trazaloop en una fecha.';
  end if;

  if new.question is distinct from old.question
     or new.answer_short is distinct from old.answer_short
     or new.answer_long is distinct from old.answer_long
     or new.language is distinct from old.language
     or new.normative_class is distinct from old.normative_class
     or new.verification_status is distinct from old.verification_status
     or new.source_basis is distinct from old.source_basis
     or new.verified_at is distinct from old.verified_at
     or new.verification_note is distinct from old.verification_note
     or new.external_source_url is distinct from old.external_source_url
     or new.external_source_checked_on is distinct from old.external_source_checked_on
     or new.content_hash is distinct from old.content_hash
     or new.revision_number is distinct from old.revision_number
     or new.entry_id is distinct from old.entry_id
     or new.effective_from is distinct from old.effective_from
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Una revisión publicada de la FAQ no se modifica. Para cambiar el texto se publica una revisión nueva.';
  end if;

  if old.effective_to is not null and new.effective_to is distinct from old.effective_to then
    raise exception 'Esa revisión de la FAQ ya estaba cerrada.';
  end if;

  return new;
end;
$$;

-- Una función de disparador no se llama a mano, y el permiso por defecto de
-- Postgres deja que cualquiera lo intente. Se retira: el disparador sigue
-- disparando —para eso no hace falta permiso de ejecución— y la superficie
-- pública queda con lo que tiene que tener y nada más.
revoke all on function public.faq_revision_is_immutable() from public, anon, authenticated;

create trigger t_faq_revisions_immutable
  before update or delete on public.faq_entry_revisions
  for each row execute function public.faq_revision_is_immutable();


-- ============================================================================
-- 4 · EL BORRADOR · lo único mutable, y en su propia mesa
-- ----------------------------------------------------------------------------
-- Aquí escribe quien edita. Se sobrescribe cuantas veces haga falta y no deja
-- historia, porque un borrador a medias no es historia de nada.
--
-- Está separado de las revisiones por una razón concreta: mientras se corrige
-- una respuesta publicada, lo publicado tiene que seguir intacto y visible. Si
-- el borrador viviera en la misma tabla, la lectura pública tendría que
-- acordarse de excluirlo — y «acordarse» es exactamente lo que falla.
--
-- Y sirve además de vista previa: es lo que la consola enseñará en B2 antes de
-- publicar, sin que exista ninguna forma de que salga por la lectura pública.
-- ============================================================================

create table public.faq_entry_drafts (
  entry_id     uuid not null references public.faq_entries (id) on delete cascade,
  language     text not null default 'es',

  question     text not null,
  answer_short text not null,
  answer_long  text,

  normative_class text not null default 'safe',
  verification_status text not null default 'not_verified',
  source_basis text,
  verification_note text,
  external_source_url text,
  external_source_checked_on date,

  change_note  text,
  updated_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint faq_drafts_pk primary key (entry_id, language),
  constraint faq_drafts_language_check check (language ~ '^[a-z]{2}$'),
  constraint faq_drafts_question_check
    check (length(btrim(question)) between 5 and 300),
  constraint faq_drafts_short_check
    check (length(btrim(answer_short)) between 5 and 1200),
  constraint faq_drafts_long_check
    check (answer_long is null or length(btrim(answer_long)) <= 20000),
  constraint faq_drafts_normative_check
    check (normative_class in ('safe', 'normative_reference', 'conformity_risk',
                               'certification_risk', 'ambiguous')),
  constraint faq_drafts_verification_check
    check (verification_status in ('verified', 'verified_with_qualifier',
      'external_policy_verification_required', 'not_verified', 'must_not_claim'))
);

comment on table public.faq_entry_drafts is
  'PE-02B1 · El BORRADOR de una respuesta: lo unico mutable de la FAQ. Vive aparte de las revisiones para que corregir una respuesta publicada no pueda ensenar media frase, y para que la lectura publica no tenga que acordarse de excluirlo.';

create trigger t_faq_drafts_updated
  before update on public.faq_entry_drafts
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 5 · QUIÉN PUEDE TOCAR QUÉ
-- ----------------------------------------------------------------------------
-- Las cuatro tablas llevan control de acceso por fila aunque no tengan
-- `organization_id`. No hay empresas que separar, pero sí hay dos cosas que
-- separar: lo publicado de lo que se está escribiendo, y el catálogo del
-- producto de quien no lo administra.
--
-- LA REGLA, EN UNA FRASE: las tablas NO son legibles para un miembro
-- cualquiera. Se leen a través de las vistas del §6, que llevan el filtro
-- dentro. Un miembro que pida la tabla directamente —por identificador, desde
-- el navegador— no obtiene nada, ni siquiera de lo publicado.
--
-- Es la lección de 0136 §4: proteger el contenido en la capa de aplicación deja
-- la tabla abierta a quien sepa pedirla.
--
-- Y `anon` no tiene ni el permiso de tabla: para el rol anónimo estas cuatro
-- tablas no existen.
-- ============================================================================

alter table public.faq_categories       enable row level security;
alter table public.faq_entries          enable row level security;
alter table public.faq_entry_revisions  enable row level security;
alter table public.faq_entry_drafts     enable row level security;

revoke all on table public.faq_categories      from public, anon, authenticated;
revoke all on table public.faq_entries         from public, anon, authenticated;
revoke all on table public.faq_entry_revisions from public, anon, authenticated;
revoke all on table public.faq_entry_drafts    from public, anon, authenticated;

-- La plataforma LEE (support incluido); solo el superadministrador ESCRIBE.
-- Es la misma distinción que 0141 §3 fijó para Intelligence, y no hay ninguna
-- razón para que la FAQ invente otra.
grant select on table public.faq_categories      to authenticated;
grant select on table public.faq_entries         to authenticated;
grant select on table public.faq_entry_revisions to authenticated;
grant select on table public.faq_entry_drafts    to authenticated;

-- El permiso de escritura se concede al rol, y la POLÍTICA decide quién de ese
-- rol escribe de verdad. Las dos cosas hacen falta: sin el permiso, ni el
-- superadministrador puede insertar; sin la política, podría cualquiera.
grant insert, update, delete on table public.faq_categories   to authenticated;
grant insert, update, delete on table public.faq_entries      to authenticated;
grant insert, update, delete on table public.faq_entry_drafts to authenticated;

-- `faq_entry_revisions` NO recibe permiso de escritura, y no es un olvido: las
-- revisiones solo nacen por la función de publicación, que las numera, cierra
-- la anterior y rechaza lo que no se puede afirmar. Escribirlas a mano se
-- saltaría las tres cosas.

create policy faq_categories_staff_select on public.faq_categories
  for select using (public.is_platform_staff());
create policy faq_categories_superadmin_write on public.faq_categories
  for all using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

create policy faq_entries_staff_select on public.faq_entries
  for select using (public.is_platform_staff());
create policy faq_entries_superadmin_write on public.faq_entries
  for all using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

create policy faq_revisions_staff_select on public.faq_entry_revisions
  for select using (public.is_platform_staff());
-- Las revisiones NO se escriben a mano ni siquiera siendo superadministrador:
-- se publican con la función del §7, que es la que mantiene la sucesión, la
-- numeración y el rechazo de lo no verificado. Sin política de escritura, la
-- única puerta es esa función.

create policy faq_drafts_staff_select on public.faq_entry_drafts
  for select using (public.is_platform_staff());
create policy faq_drafts_superadmin_write on public.faq_entry_drafts
  for all using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());


-- ============================================================================
-- 6 · LO QUE SE PUEDE LEER SIN SER DE LA PLATAFORMA
-- ----------------------------------------------------------------------------
-- Dos vistas, y el filtro va DENTRO. Es el patrón de 0055 y 0141: la vista es
-- la frontera. No llevan `security_invoker`, así que no se evalúa la RLS de
-- quien pregunta —que le devolvería cero— y en su lugar la propia vista decide
-- qué sale.
--
-- Lo que sale es EXACTAMENTE lo que hace falta para pintar una FAQ:
--
--   · nada de `source_basis`, `verification_note` ni `verified_at`;
--   · nada de `created_by` ni `change_note`;
--   · nada de revisiones cerradas: solo la vigente;
--   · nada de borradores: ni siquiera están en la consulta.
--
-- §32 del encargo, cumplido por construcción: no hay cliente administrativo en
-- este camino. Una vista con su filtro dentro no necesita `service_role` y no
-- lo tendría aunque quisiera.
-- ============================================================================

create view public.v_faq_public as
select
  e.slug,
  c.code                as category_code,
  c.label               as category_label,
  c.sort_order          as category_order,
  e.sort_order          as entry_order,
  e.is_featured,
  e.scope,
  e.module_keys,
  r.language,
  r.question,
  r.answer_short,
  r.answer_long,
  r.normative_class,
  r.search_document,
  r.effective_from      as published_at
from public.faq_entries e
join public.faq_categories c on c.id = e.category_id
join public.faq_entry_revisions r on r.entry_id = e.id
where e.status = 'published'
  and e.visibility = 'public'
  and c.status = 'active'
  -- La vigente, y solo la vigente. Sin esto, la historia entera sería pública.
  and r.effective_to is null;

-- El `revoke` nombra los tres roles a propósito: Supabase concede por defecto
-- todos los privilegios sobre lo que nace en `public`, y revocar solo del rol
-- `public` deja intactas las concesiones directas a `anon` y `authenticated`.
-- Sin esto, el rol anónimo se queda con INSERT y DELETE sobre la vista.
revoke all on public.v_faq_public from public, anon, authenticated;
grant select on public.v_faq_public to anon, authenticated;

comment on view public.v_faq_public is
  'PE-02B1 · La FAQ que se lee SIN sesion: publicada, publica y vigente. Sin procedencia interna, sin autores, sin notas de cambio y sin revisiones cerradas. La vista es la frontera y el filtro esta dentro — mismo patron que 0055 y 0141.';


create view public.v_faq_authenticated as
select
  e.slug,
  c.code                as category_code,
  c.label               as category_label,
  c.sort_order          as category_order,
  e.sort_order          as entry_order,
  e.is_featured,
  e.visibility,
  e.scope,
  e.module_keys,
  r.language,
  r.question,
  r.answer_short,
  r.answer_long,
  r.normative_class,
  r.search_document,
  r.effective_from      as published_at
from public.faq_entries e
join public.faq_categories c on c.id = e.category_id
join public.faq_entry_revisions r on r.entry_id = e.id
where e.status = 'published'
  and e.visibility in ('public', 'authenticated')
  and c.status = 'active'
  and r.effective_to is null
  -- El rol `anon` no tiene permiso sobre esta vista, así que esta línea es la
  -- segunda cerradura. Se pone porque una concesión mal hecha en el futuro no
  -- debería bastar para abrir la puerta.
  and auth.uid() is not null;

revoke all on public.v_faq_authenticated from public, anon, authenticated;
grant select on public.v_faq_authenticated to authenticated;

comment on view public.v_faq_authenticated is
  'PE-02B1 · La FAQ con sesion: publica + autenticada, publicada y vigente. La visibilidad es EDITORIAL: que una empresa no tenga contratado un modulo no le oculta la documentacion sobre ese modulo (PEH-05).';


-- Las categorías que tienen algo que enseñar. Una categoría vacía en un menú
-- es una promesa que la pantalla no cumple.
create view public.v_faq_public_categories as
select c.code, c.label, c.description, c.sort_order,
       count(*) filter (where e.visibility = 'public') as entries
from public.faq_categories c
join public.faq_entries e on e.category_id = c.id and e.status = 'published'
join public.faq_entry_revisions r on r.entry_id = e.id and r.effective_to is null
where c.status = 'active' and e.visibility = 'public'
group by c.code, c.label, c.description, c.sort_order;

revoke all on public.v_faq_public_categories from public, anon, authenticated;
grant select on public.v_faq_public_categories to anon, authenticated;

comment on view public.v_faq_public_categories is
  'PE-02B1 · Las categorias con al menos una respuesta publica vigente. Una categoria vacia no se ofrece.';


-- ============================================================================
-- 7 · PUBLICAR · la única puerta de escritura de una revisión
-- ----------------------------------------------------------------------------
-- Toma lo que hay en el borrador, cierra la revisión vigente, abre la
-- siguiente y las enlaza. Solo el superadministrador: la FAQ es catálogo del
-- producto, no dato de una empresa.
--
-- Y RECHAZA lo que no se puede afirmar. Esa es la parte que no existía en 0136
-- y que la auditoría de PE-02A hizo necesaria: una respuesta cuyo estado sea
-- «depende de un tercero y no se ha verificado», «no se pudo comprobar» o «no
-- se puede afirmar» no sale de aquí. No es un aviso: es un rechazo.
-- ============================================================================

create or replace function public.faq_publish_entry(
  p_entry_id    uuid,
  p_language    text default 'es',
  p_change_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry   record;
  v_draft   record;
  v_actual  record;
  v_nuevo   uuid;
  v_numero  integer;
  v_hash    text;
  v_ahora   timestamptz := now();
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma publica preguntas frecuentes.';
  end if;

  select * into v_entry from faq_entries where id = p_entry_id;
  if v_entry.id is null then raise exception 'Esa pregunta no existe.'; end if;

  select * into v_draft
    from faq_entry_drafts
   where entry_id = p_entry_id and language = p_language;
  if v_draft.entry_id is null then
    raise exception 'No hay borrador que publicar para esa pregunta en ese idioma.';
  end if;

  -- La barrera de §11 / PEH-11. Está aquí y no en la pantalla porque una
  -- barrera que vive en la pantalla se salta escribiendo en la base.
  if v_draft.verification_status in
       ('external_policy_verification_required', 'not_verified', 'must_not_claim') then
    raise exception 'Esta respuesta no se puede publicar: su estado de verificación es «%». Compruébala antes, o cámbiale el estado con la comprobación hecha.',
      v_draft.verification_status;
  end if;

  if v_draft.verification_status = 'verified_with_qualifier'
     and length(btrim(coalesce(v_draft.verification_note, ''))) < 10 then
    raise exception 'Una respuesta verificada CON SALVEDAD tiene que decir cuál es la salvedad.';
  end if;

  if v_draft.external_source_url is not null
     and v_draft.external_source_checked_on is null then
    raise exception 'Una comprobación de política externa sin fecha no es una comprobación.';
  end if;

  v_hash := encode(sha256(convert_to(
    coalesce(v_draft.question, '') || E'\n' || coalesce(v_draft.answer_short, '') || E'\n'
    || coalesce(v_draft.answer_long, ''), 'UTF8')), 'hex');

  select * into v_actual
    from faq_entry_revisions
   where entry_id = p_entry_id and language = p_language and effective_to is null;

  -- Publicar lo mismo otra vez no crea una revisión: una historia llena de
  -- revisiones idénticas no explica nada.
  if v_actual.id is not null and v_actual.content_hash = v_hash
     and v_actual.normative_class = v_draft.normative_class
     and v_actual.verification_status = v_draft.verification_status then
    -- Aun así, la entrada vuelve a quedar publicada: republicar algo retirado
    -- con el mismo texto es una operación legítima.
    update faq_entries set status = 'published' where id = p_entry_id;
    return v_actual.id;
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_numero
    from faq_entry_revisions where entry_id = p_entry_id and language = p_language;

  -- Cerrar la vigente ANTES de abrir la siguiente: el índice único parcial que
  -- garantiza «una sola abierta» no se puede diferir, así que el orden no es
  -- una preferencia de estilo.
  if v_actual.id is not null then
    update faq_entry_revisions set effective_to = v_ahora where id = v_actual.id;
  end if;

  insert into faq_entry_revisions (
    entry_id, revision_number, language, question, answer_short, answer_long,
    normative_class, verification_status, source_basis, verified_at,
    verification_note, external_source_url, external_source_checked_on,
    content_hash, effective_from, change_note, created_by)
  values (
    p_entry_id, v_numero, p_language, btrim(v_draft.question),
    btrim(v_draft.answer_short), v_draft.answer_long,
    v_draft.normative_class, v_draft.verification_status, v_draft.source_basis,
    v_ahora, v_draft.verification_note, v_draft.external_source_url,
    v_draft.external_source_checked_on,
    v_hash, v_ahora, coalesce(p_change_note, v_draft.change_note), auth.uid())
  returning id into v_nuevo;

  -- Y ahora se enlaza. El freno de inmutabilidad lo permite porque el fin de
  -- vigencia no cambia: ya estaba puesto.
  if v_actual.id is not null then
    update faq_entry_revisions
       set superseded_by_revision_id = v_nuevo
     where id = v_actual.id;
  end if;

  update faq_entries set status = 'published' where id = p_entry_id;

  return v_nuevo;
end;
$$;

revoke all on function public.faq_publish_entry(uuid, text, text) from public, anon;
grant execute on function public.faq_publish_entry(uuid, text, text) to authenticated;

comment on function public.faq_publish_entry(uuid, text, text) is
  'PE-02B1 · Publica el borrador: cierra la revision vigente, abre la siguiente y las enlaza. RECHAZA lo que no se puede afirmar (verificacion externa pendiente, sin comprobar, o no afirmable). Solo superadministrador.';


-- ============================================================================
-- 8 · RETIRAR · y por qué no es lo mismo que borrar
-- ----------------------------------------------------------------------------
-- Retirar cierra la revisión vigente y marca la entrada como retirada. El texto
-- se queda: se puede saber qué decía y hasta cuándo lo dijo.
--
-- Volver a publicarla es publicar de nuevo el borrador. No hay «reactivar», que
-- reabriría una revisión cerrada y convertiría la inmutabilidad en un adorno.
-- ============================================================================

create or replace function public.faq_unpublish_entry(
  p_entry_id    uuid,
  p_language    text default 'es',
  p_change_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual record;
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma retira preguntas frecuentes.';
  end if;

  select * into v_actual
    from faq_entry_revisions
   where entry_id = p_entry_id and language = p_language and effective_to is null;

  if v_actual.id is not null then
    update faq_entry_revisions set effective_to = now() where id = v_actual.id;
  end if;

  update faq_entries
     set status = case when status = 'draft' then 'draft' else 'unpublished' end
   where id = p_entry_id;
end;
$$;

revoke all on function public.faq_unpublish_entry(uuid, text, text) from public, anon;
grant execute on function public.faq_unpublish_entry(uuid, text, text) to authenticated;

comment on function public.faq_unpublish_entry(uuid, text, text) is
  'PE-02B1 · Retira una respuesta: cierra su revision vigente y marca la entrada como retirada. El texto se conserva; retirar no es borrar.';


-- ============================================================================
-- 9 · RESTAURAR · una revisión antigua vuelve como BORRADOR, nunca como pasado
-- ----------------------------------------------------------------------------
-- §18 del encargo. Restaurar NO reabre la revisión antigua: copia su contenido
-- al borrador, y desde ahí se publica como una revisión nueva.
--
-- La diferencia importa. Reabrir haría que la historia dijera que ese texto
-- estuvo vigente en dos periodos distintos sin decir que hubo otro en medio.
-- Copiar deja las tres cosas escritas: lo que decía, lo que dijo después, y que
-- se volvió a lo primero.
-- ============================================================================

create or replace function public.faq_restore_revision_to_draft(
  p_revision_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rev record;
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma restaura respuestas.';
  end if;

  select * into v_rev from faq_entry_revisions where id = p_revision_id;
  if v_rev.id is null then raise exception 'Esa revisión no existe.'; end if;

  insert into faq_entry_drafts (
    entry_id, language, question, answer_short, answer_long, normative_class,
    verification_status, source_basis, verification_note, external_source_url,
    external_source_checked_on, change_note, updated_by)
  values (
    v_rev.entry_id, v_rev.language, v_rev.question, v_rev.answer_short,
    v_rev.answer_long, v_rev.normative_class, v_rev.verification_status,
    v_rev.source_basis, v_rev.verification_note, v_rev.external_source_url,
    v_rev.external_source_checked_on,
    'Restaurado desde la revisión ' || v_rev.revision_number::text, auth.uid())
  on conflict (entry_id, language) do update set
    question = excluded.question,
    answer_short = excluded.answer_short,
    answer_long = excluded.answer_long,
    normative_class = excluded.normative_class,
    verification_status = excluded.verification_status,
    source_basis = excluded.source_basis,
    verification_note = excluded.verification_note,
    external_source_url = excluded.external_source_url,
    external_source_checked_on = excluded.external_source_checked_on,
    change_note = excluded.change_note,
    updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.faq_restore_revision_to_draft(uuid) from public, anon;
grant execute on function public.faq_restore_revision_to_draft(uuid) to authenticated;

comment on function public.faq_restore_revision_to_draft(uuid) is
  'PE-02B1 · §18 · Restaurar copia una revision antigua al BORRADOR. Nunca reabre una revision cerrada: eso haria que la historia mintiera por omision.';


-- ============================================================================
-- 10 · LAS CATEGORÍAS INICIALES
-- ----------------------------------------------------------------------------
-- Las diez de PE-02A, en su orden. Seguridad y privacidad va tercera a
-- propósito: es la prioridad de producto.
--
-- Construcción NO tiene categoría. El módulo no existe todavía y una categoría
-- vacía es una promesa.
--
-- No se siembra NINGUNA pregunta. Las respuestas —y sobre todo las de
-- seguridad— se publican en B5, después de que la política de privacidad
-- refleje lo verificado. Sembrar aquí un ejemplo significaría que el día que B3
-- publique la pantalla, ese ejemplo estaría en producción.
-- ============================================================================

insert into public.faq_categories (code, label, description, sort_order) values
  ('primeros_pasos',    'Primeros pasos',
   'Qué es Trazaloop y por dónde empezar.', 10),
  ('cuenta_empresa',    'Cuenta y empresa',
   'Tu cuenta, tu empresa, las personas y sus papeles.', 20),
  ('seguridad',         'Seguridad y privacidad',
   'Cómo se separan y se protegen los datos de cada empresa.', 30),
  ('quality',           'Trazaloop Quality',
   'Procesos, riesgos, objetivos, auditorías y mejora continua.', 40),
  ('pcr',               'Trazaloop PCR',
   'Trazabilidad y contenido reciclado.', 50),
  ('textiles',          'Trazaloop Textiles',
   'Referencias, composición, circularidad y pasaporte textil.', 60),
  ('documentos',        'Documentos y evidencias',
   'TrazaDocs, versiones, evidencias y almacenamiento.', 70),
  ('intelligence',      'Trazaloop Intelligence',
   'Qué hace, con qué información trabaja y qué no decide.', 80),
  ('planes',            'Planes y facturación',
   'Módulos, accesos y límites.', 90),
  ('soporte',           'Soporte',
   'Cómo pedir ayuda y qué esperar.', 100);
