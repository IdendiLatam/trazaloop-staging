-- ============================================================================
-- Trazaloop · PE-02B4 · LA AYUDA DEL BOTÓN «i», ADMINISTRABLE
-- ----------------------------------------------------------------------------
-- QUÉ PROBLEMA CIERRA
--
-- El botón «i» existe desde T9G y funciona: es accesible, se cierra con Escape,
-- devuelve el foco y no pinta nada cuando no hay contenido. Lo que no se podía
-- era ESCRIBIR en él sin desplegar. Once ayudas de partes interesadas —las
-- mejores que tiene el producto, con su explicación, su ejemplo y su respaldo
-- normativo— viven en una constante de TypeScript. Corregir una coma exige un
-- despliegue.
--
--
-- POR QUÉ NO SE METE EN LAS TABLAS DE LA FAQ
--
-- PEH-01 lo decidió y aquí solo se cumple: son recursos distintos. Una pregunta
-- frecuente se busca, se ordena por categoría y tiene una dirección propia; una
-- ayuda contextual no se busca —aparece donde vive— y se direcciona por dónde
-- está pegada. Unificarlas obligaría a media docena de columnas nulas según la
-- fila.
--
-- Lo que SÍ se comparte es el patrón: identidad estable, revisiones inmutables
-- con vigencia, borrador aparte, publicación como única puerta. Quien conozca
-- 0155 reconoce esto sin releerlo.
--
--
-- POR QUÉ TAMPOCO SE METE EN `trazadoc_authoring_guidance`
--
-- Esa es la guía de AUTORÍA: dice qué debería contener una sección de un
-- documento que alguien está redactando, y su alcance es una estructura de
-- TrazaDocs. Esta dice qué significa un campo de una pantalla. Las dos son
-- contenido administrado y versionado, y ahí acaba el parecido: una se
-- direcciona por `(module_key, blueprint_code, section_key)` y la otra por
-- pantalla y campo.
--
-- Además la guía tiene una puerta comercial —en Demo no sale— que esta NO
-- tiene, por decisión humana congelada en este encargo: si alguien puede ver la
-- pantalla, puede ver la explicación de lo que está mirando. Forzar una tabla
-- común obligaría a que esa diferencia viviera en una columna, y una regla
-- comercial en una columna es una regla que alguien acabará cambiando por
-- accidente.
--
--
-- LAS TRES PIEZAS
--
--   `help_items`            · la IDENTIDAD: dónde está pegada la ayuda.
--   `help_item_revisions`   · el TEXTO, inmutable, con su vigencia.
--   `help_item_drafts`      · el BORRADOR, lo único mutable.
--
-- Sin `organization_id` en ninguna: la ayuda es catálogo del producto. Que se
-- lea dentro de una empresa no la convierte en dato de esa empresa.
-- ============================================================================


-- ============================================================================
-- 1 · DÓNDE ESTÁ PEGADA UNA AYUDA
-- ----------------------------------------------------------------------------
-- La identidad es `(module_key, page_key, target_kind, target_key)`. Ni el
-- título, ni el texto, ni la ruta entran en ella: los tres cambian sin que
-- cambie de qué campo estamos hablando.
--
-- `page_key` NO es la URL. El registro canónico vive en el código
-- (`lib/modules/page-keys.ts`) y esta tabla solo lo referencia como texto, igual
-- que `section_key` en 0136. Así una clave inexistente se detecta con una
-- prueba estática y no con una fila huérfana.
--
-- LOS CUATRO ALCANCES
--
--   page    · la ayuda de la pantalla entera. `target_key` vale 'page'.
--   section · la de un bloque dentro de ella.
--   field   · la de un campo concreto.
--   concept · la de una idea que aparece en varios sitios de la misma pantalla.
--
-- No hay un quinto para «toda la aplicación»: una ayuda que vale en todas
-- partes no es ayuda contextual, es una pregunta frecuente, y esa ya tiene sitio.
-- ============================================================================

create table public.help_items (
  id           uuid primary key default gen_random_uuid(),

  module_key   text not null,
  page_key     text not null,
  target_kind  text not null,
  target_key   text not null,

  status       text not null default 'draft',

  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint help_items_identity_uniq unique (page_key, target_kind, target_key),
  constraint help_items_module_check
    check (module_key in ('cpr', 'textiles', 'quality', 'construccion', 'platform')),
  -- La misma forma que comprueba el registro del código: minúsculas, puntos, y
  -- el primer segmento es un módulo. Repetirla aquí es a propósito: una fila mal
  -- formada no debería existir aunque la escriba alguien saltándose la consola.
  constraint help_items_page_key_check
    check (page_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint help_items_page_module_check
    check (split_part(page_key, '.', 1) = module_key),
  constraint help_items_target_kind_check
    check (target_kind in ('page', 'section', 'field', 'concept')),
  constraint help_items_target_key_check
    check (target_key ~ '^[a-z][a-z0-9_]*$' and length(target_key) between 2 and 60),
  -- La ayuda de una pantalla entera se llama siempre igual: si cada quien
  -- inventara su nombre, habría tres «la ayuda de esta pantalla».
  constraint help_items_page_target_check
    check (target_kind <> 'page' or target_key = 'page'),
  constraint help_items_status_check
    check (status in ('draft', 'published', 'unpublished'))
);

comment on table public.help_items is
  'PE-02B4 · DONDE esta pegada una ayuda contextual: modulo, pantalla, y que elemento de esa pantalla. Ni el titulo ni el texto viven aqui, y la URL no forma parte de la identidad: una pantalla que cambia de direccion no pierde su ayuda.';
comment on column public.help_items.page_key is
  'PE-02B4 · Clave estable de pantalla. El registro canonico esta en lib/modules/page-keys.ts y PE-03 usara EL MISMO para los tutoriales: no habra una segunda familia de claves.';

create index help_items_page_idx on public.help_items (page_key)
  where status = 'published';
create index help_items_module_idx on public.help_items (module_key, page_key);

create trigger t_help_items_updated
  before update on public.help_items
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 2 · EL TEXTO · INMUTABLE
-- ----------------------------------------------------------------------------
-- Mismo patrón que 0155 y 0136: vigencia, una sola abierta por ayuda e idioma,
-- huella del contenido, autor y nota de cambio.
--
-- LAS TRES PARTES, Y POR QUÉ SON COLUMNAS Y NO UN TEXTO CON TÍTULOS
--
-- Hoy las once ayudas de partes interesadas guardan «QUÉ ES\n…\n\nEJEMPLO\n…»
-- en una sola cadena. Funciona porque siempre las escribió la misma persona.
-- En cuanto lo administre alguien más, esa convención se rompe: faltará un
-- salto de línea, o el título irá en minúsculas, y la pantalla pintará un
-- bloque raro sin que nadie sepa por qué.
--
-- Separadas, la pantalla decide cómo se ven y quien escribe no tiene que
-- acordarse de un formato. Y solo `explanation` es obligatoria: un ejemplo
-- inventado para rellenar un campo es peor que no tener ejemplo.
--
-- `do_not_invent` viene de 0136 y se conserva por la misma razón: es la barrera
-- escrita junto al texto que la necesita, no en una política lejana.
-- ============================================================================

create table public.help_item_revisions (
  id              uuid primary key default gen_random_uuid(),
  help_item_id    uuid not null references public.help_items (id) on delete cascade,
  revision_number integer not null,
  language        text not null default 'es',

  title           text not null,
  explanation     text not null,
  example         text,
  technical_reference text,
  do_not_invent   text,

  normative_class text not null default 'safe',
  content_hash    text not null,

  effective_from  timestamptz not null default now(),
  effective_to    timestamptz,
  superseded_by_revision_id uuid references public.help_item_revisions (id),

  change_note     text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),

  constraint help_revisions_number_check check (revision_number >= 1),
  constraint help_revisions_uniq unique (help_item_id, language, revision_number),
  constraint help_revisions_language_check check (language ~ '^[a-z]{2}$'),
  constraint help_revisions_period_check
    check (effective_to is null or effective_to >= effective_from),
  constraint help_revisions_title_check
    check (length(btrim(title)) between 2 and 120),
  constraint help_revisions_explanation_check
    check (length(btrim(explanation)) between 10 and 4000),
  constraint help_revisions_example_check
    check (example is null or length(btrim(example)) between 5 and 4000),
  constraint help_revisions_reference_check
    check (technical_reference is null or length(btrim(technical_reference)) between 5 and 4000),
  -- La misma lista cerrada de 0136 y 0155. Tres tablas, una sola forma de
  -- clasificar cuánto se acerca un texto a afirmar conformidad.
  constraint help_revisions_normative_check
    check (normative_class in (
      'safe',                 -- no menciona normas ni esquemas
      'normative_reference',  -- los menciona, y los enmarca como referencia
      'conformity_risk',      -- podría inducir a afirmar cumplimiento
      'certification_risk',   -- podría inducir a afirmar certificación o sello
      'ambiguous'             -- se puede leer de las dos maneras
    ))
);

comment on table public.help_item_revisions is
  'PE-02B4 · El TEXTO de una ayuda contextual, inmutable. Tres partes separadas —que es, ejemplo, respaldo— para que la pantalla decida como se ven y quien escribe no tenga que acordarse de un formato.';
comment on column public.help_item_revisions.technical_reference is
  'PE-02B4 · El respaldo, como REFERENCIA. «Relacionado con ISO 9001:2015, 6.1» es una referencia; «esto garantiza el cumplimiento» seria una afirmacion de conformidad, y no se escribe.';
comment on column public.help_item_revisions.do_not_invent is
  'PE-02B4 · Heredado de 0136: que NO se puede rellenar sin dato que lo respalde. Es interno; no sale por la lectura del producto.';

create unique index help_revisions_vigente
  on public.help_item_revisions (help_item_id, language)
  where effective_to is null;

create index help_revisions_hist_idx
  on public.help_item_revisions (help_item_id, language, effective_from desc);


-- ----------------------------------------------------------------------------
-- La inmutabilidad, y su única excepción
-- ----------------------------------------------------------------------------
-- Igual que en 0136 y 0155: una revisión publicada solo se puede CERRAR, y una
-- sola vez. Es un disparador y no una política porque una política no frena a
-- `service_role`.
-- ----------------------------------------------------------------------------
create or replace function public.help_revision_is_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una revisión de ayuda no se borra: se sucede con otra. Así se puede saber qué explicaba una pantalla en una fecha.';
  end if;

  if new.title is distinct from old.title
     or new.explanation is distinct from old.explanation
     or new.example is distinct from old.example
     or new.technical_reference is distinct from old.technical_reference
     or new.do_not_invent is distinct from old.do_not_invent
     or new.normative_class is distinct from old.normative_class
     or new.content_hash is distinct from old.content_hash
     or new.language is distinct from old.language
     or new.revision_number is distinct from old.revision_number
     or new.help_item_id is distinct from old.help_item_id
     or new.effective_from is distinct from old.effective_from
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Una revisión de ayuda publicada no se modifica. Para cambiar el texto se publica una revisión nueva.';
  end if;

  if old.effective_to is not null and new.effective_to is distinct from old.effective_to then
    raise exception 'Esa revisión de ayuda ya estaba cerrada.';
  end if;

  return new;
end;
$$;

revoke all on function public.help_revision_is_immutable() from public, anon, authenticated;

create trigger t_help_revisions_immutable
  before update or delete on public.help_item_revisions
  for each row execute function public.help_revision_is_immutable();


-- ============================================================================
-- 3 · EL BORRADOR
-- ----------------------------------------------------------------------------
-- En su propia tabla, por lo mismo que en 0155: mientras se corrige una ayuda
-- publicada, lo publicado tiene que seguir intacto, y la lectura del producto no
-- puede tener que ACORDARSE de excluir el borrador.
-- ============================================================================

create table public.help_item_drafts (
  help_item_id  uuid not null references public.help_items (id) on delete cascade,
  language      text not null default 'es',

  title         text not null,
  explanation   text not null,
  example       text,
  technical_reference text,
  do_not_invent text,
  normative_class text not null default 'safe',

  change_note   text,
  updated_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint help_drafts_pk primary key (help_item_id, language),
  constraint help_drafts_language_check check (language ~ '^[a-z]{2}$'),
  constraint help_drafts_title_check check (length(btrim(title)) between 2 and 120),
  constraint help_drafts_explanation_check
    check (length(btrim(explanation)) between 10 and 4000),
  constraint help_drafts_normative_check
    check (normative_class in ('safe', 'normative_reference', 'conformity_risk',
                               'certification_risk', 'ambiguous'))
);

comment on table public.help_item_drafts is
  'PE-02B4 · El BORRADOR de una ayuda: lo unico mutable. Aparte de las revisiones para que corregir una ayuda publicada no pueda ensenar media frase.';

create trigger t_help_drafts_updated
  before update on public.help_item_drafts
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 4 · QUIÉN LEE Y QUIÉN ESCRIBE
-- ----------------------------------------------------------------------------
-- LA DIFERENCIA CON LA FAQ, Y ES DELIBERADA
--
-- La FAQ tiene una cara pública: se lee sin sesión. La ayuda contextual NO: vive
-- dentro del producto, pegada a una pantalla que ya exige sesión. Enseñarla al
-- anónimo no aportaría nada y expondría el mapa de campos de la aplicación a
-- quien no ha entrado.
--
-- Así que: `anon` no tiene ni permiso de tabla, y la vista de lectura se concede
-- solo a `authenticated`.
--
-- Y dentro, la regla congelada de §8: si alguien puede ver la pantalla, puede
-- ver la explicación. La ayuda NO se filtra por plan. El derecho al módulo lo
-- sigue defendiendo el guardián de la pantalla, que es donde tiene que estar.
-- ============================================================================

alter table public.help_items          enable row level security;
alter table public.help_item_revisions enable row level security;
alter table public.help_item_drafts    enable row level security;

revoke all on table public.help_items          from public, anon, authenticated;
revoke all on table public.help_item_revisions from public, anon, authenticated;
revoke all on table public.help_item_drafts    from public, anon, authenticated;

grant select on table public.help_items          to authenticated;
grant select on table public.help_item_revisions to authenticated;
grant select on table public.help_item_drafts    to authenticated;

grant insert, update, delete on table public.help_items       to authenticated;
grant insert, update, delete on table public.help_item_drafts to authenticated;
-- Las revisiones no reciben escritura: nacen por la función de publicación.

create policy help_items_staff_select on public.help_items
  for select using (public.is_platform_staff());
create policy help_items_superadmin_write on public.help_items
  for all using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

create policy help_revisions_staff_select on public.help_item_revisions
  for select using (public.is_platform_staff());

create policy help_drafts_staff_select on public.help_item_drafts
  for select using (public.is_platform_staff());
create policy help_drafts_superadmin_write on public.help_item_drafts
  for all using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());


-- ============================================================================
-- 5 · LO QUE LEE EL PRODUCTO
-- ----------------------------------------------------------------------------
-- Una vista, con el filtro dentro. Mismo patrón que 0055, 0141 y 0155: la vista
-- es la frontera.
--
-- Devuelve EXACTAMENTE lo que la pantalla pinta. Nada de `do_not_invent`, que es
-- una barrera para quien escribe; nada de autores, notas de cambio, números de
-- revisión ni clase normativa. Y solo la vigente.
--
-- `auth.uid() is not null` va dentro además de no conceder la vista a `anon`:
-- una concesión mal hecha en el futuro no debería bastar para abrir la puerta.
-- ============================================================================

create view public.v_help_effective as
select
  i.module_key,
  i.page_key,
  i.target_kind,
  i.target_key,
  r.language,
  r.title,
  r.explanation,
  r.example,
  r.technical_reference,
  r.effective_from as published_at
from public.help_items i
join public.help_item_revisions r on r.help_item_id = i.id
where i.status = 'published'
  and r.effective_to is null
  and auth.uid() is not null;

revoke all on public.v_help_effective from public, anon, authenticated;
grant select on public.v_help_effective to authenticated;

comment on view public.v_help_effective is
  'PE-02B4 · La ayuda VIGENTE que lee el producto. Sin borradores, sin historia, sin do_not_invent, sin autores ni notas. No se concede a anon: la ayuda contextual vive dentro del producto.';


-- ============================================================================
-- 6 · PUBLICAR
-- ----------------------------------------------------------------------------
-- La misma estructura que `faq_publish_entry`, partida en dos por la misma razón
-- que en 0157: una migración corre sin sesión y necesita sembrar contenido sin
-- que eso obligue a debilitar el guardián de la aplicación.
--
-- La interna no se concede a nadie. La externa comprueba quién publica.
-- ============================================================================

create or replace function public.help_publish_item_internal(
  p_item_id     uuid,
  p_language    text default 'es',
  p_change_note text default null,
  p_actor       uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item   record;
  v_draft  record;
  v_actual record;
  v_nuevo  uuid;
  v_numero integer;
  v_hash   text;
  v_ahora  timestamptz := now();
begin
  select * into v_item from help_items where id = p_item_id;
  if v_item.id is null then raise exception 'Esa ayuda no existe.'; end if;

  select * into v_draft
    from help_item_drafts where help_item_id = p_item_id and language = p_language;
  if v_draft.help_item_id is null then
    raise exception 'No hay borrador que publicar para esa ayuda en ese idioma.';
  end if;

  v_hash := encode(sha256(convert_to(
    coalesce(v_draft.title, '') || E'\n' || coalesce(v_draft.explanation, '') || E'\n'
    || coalesce(v_draft.example, '') || E'\n' || coalesce(v_draft.technical_reference, ''),
    'UTF8')), 'hex');

  select * into v_actual
    from help_item_revisions
   where help_item_id = p_item_id and language = p_language and effective_to is null;

  -- Publicar lo mismo otra vez no crea una revisión.
  if v_actual.id is not null and v_actual.content_hash = v_hash
     and v_actual.normative_class = v_draft.normative_class then
    update help_items set status = 'published' where id = p_item_id;
    return v_actual.id;
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_numero
    from help_item_revisions where help_item_id = p_item_id and language = p_language;

  -- Cerrar antes de abrir: el índice único parcial no se puede diferir.
  if v_actual.id is not null then
    update help_item_revisions set effective_to = v_ahora where id = v_actual.id;
  end if;

  insert into help_item_revisions (
    help_item_id, revision_number, language, title, explanation, example,
    technical_reference, do_not_invent, normative_class, content_hash,
    effective_from, change_note, created_by)
  values (
    p_item_id, v_numero, p_language, btrim(v_draft.title), btrim(v_draft.explanation),
    v_draft.example, v_draft.technical_reference, v_draft.do_not_invent,
    v_draft.normative_class, v_hash, v_ahora,
    coalesce(p_change_note, v_draft.change_note), p_actor)
  returning id into v_nuevo;

  if v_actual.id is not null then
    update help_item_revisions
       set superseded_by_revision_id = v_nuevo where id = v_actual.id;
  end if;

  update help_items set status = 'published' where id = p_item_id;

  return v_nuevo;
end;
$$;

revoke all on function public.help_publish_item_internal(uuid, text, text, uuid)
  from public, anon, authenticated;


create or replace function public.help_publish_item(
  p_item_id     uuid,
  p_language    text default 'es',
  p_change_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma publica la ayuda del producto.';
  end if;
  return help_publish_item_internal(p_item_id, p_language, p_change_note, auth.uid());
end;
$$;

revoke all on function public.help_publish_item(uuid, text, text) from public, anon;
grant execute on function public.help_publish_item(uuid, text, text) to authenticated;


-- ============================================================================
-- 7 · RETIRAR Y RECUPERAR
-- ----------------------------------------------------------------------------
-- Retirar cierra la vigente y marca la ayuda. El botón «i» deja de aparecer —no
-- pinta un panel vacío, que es lo que ya hacía cuando no había contenido—.
--
-- Recuperar copia una revisión antigua al BORRADOR. Nunca reabre.
-- ============================================================================

create or replace function public.help_unpublish_item(
  p_item_id  uuid,
  p_language text default 'es'
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
    raise exception 'Solo la administración de plataforma retira la ayuda del producto.';
  end if;

  select * into v_actual
    from help_item_revisions
   where help_item_id = p_item_id and language = p_language and effective_to is null;
  if v_actual.id is not null then
    update help_item_revisions set effective_to = now() where id = v_actual.id;
  end if;

  update help_items
     set status = case when status = 'draft' then 'draft' else 'unpublished' end
   where id = p_item_id;
end;
$$;

revoke all on function public.help_unpublish_item(uuid, text) from public, anon;
grant execute on function public.help_unpublish_item(uuid, text) to authenticated;


create or replace function public.help_restore_revision_to_draft(
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
    raise exception 'Solo la administración de plataforma restaura la ayuda del producto.';
  end if;

  select * into v_rev from help_item_revisions where id = p_revision_id;
  if v_rev.id is null then raise exception 'Esa revisión no existe.'; end if;

  insert into help_item_drafts (
    help_item_id, language, title, explanation, example, technical_reference,
    do_not_invent, normative_class, change_note, updated_by)
  values (
    v_rev.help_item_id, v_rev.language, v_rev.title, v_rev.explanation, v_rev.example,
    v_rev.technical_reference, v_rev.do_not_invent, v_rev.normative_class,
    'Restaurado desde la revisión ' || v_rev.revision_number::text, auth.uid())
  on conflict (help_item_id, language) do update set
    title = excluded.title,
    explanation = excluded.explanation,
    example = excluded.example,
    technical_reference = excluded.technical_reference,
    do_not_invent = excluded.do_not_invent,
    normative_class = excluded.normative_class,
    change_note = excluded.change_note,
    updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.help_restore_revision_to_draft(uuid) from public, anon;
grant execute on function public.help_restore_revision_to_draft(uuid) to authenticated;


-- ============================================================================
-- 8 · LA PRIMERA OLA · las once de partes interesadas
-- ----------------------------------------------------------------------------
-- PE-02A las señaló como la primera ola porque ya tienen la forma correcta:
-- explicación, ejemplo y respaldo normativo, escritos con cuidado y sin afirmar
-- conformidad. Aquí se trasladan TAL CUAL, partidas en sus tres campos.
--
-- No se inventa nada. Donde el texto original no tenía ejemplo o respaldo, la
-- columna queda nula: un ejemplo fabricado para rellenar un campo es peor que
-- no tener ejemplo.
--
-- Las once quedan clasificadas `normative_reference`: todas citan ISO 9001:2015
-- y ninguna afirma cumplimiento.
-- ============================================================================

create or replace function public.help_seed_item(
  p_module    text,
  p_page      text,
  p_kind      text,
  p_target    text,
  p_title     text,
  p_explanation text,
  p_example   text,
  p_reference text,
  p_normative text default 'safe'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from help_items
   where page_key = p_page and target_kind = p_kind and target_key = p_target;

  if v_id is null then
    insert into help_items (module_key, page_key, target_kind, target_key)
    values (p_module, p_page, p_kind, p_target)
    returning id into v_id;
  end if;

  insert into help_item_drafts (
    help_item_id, language, title, explanation, example, technical_reference,
    normative_class)
  values (v_id, 'es', p_title, p_explanation, p_example, p_reference, p_normative)
  on conflict (help_item_id, language) do update set
    title = excluded.title,
    explanation = excluded.explanation,
    example = excluded.example,
    technical_reference = excluded.technical_reference,
    normative_class = excluded.normative_class;

  perform help_publish_item_internal(v_id, 'es',
    'Traslado de la ayuda escrita en código · PE-02B4', null);

  return v_id;
end;
$$;

select public.help_seed_item(
  'quality', 'quality.context.interested_parties', 'section', 'overview',
  'Qué es una parte interesada',
  'Una parte interesada es quien puede afectar al sistema de gestión o verse afectado por él: clientes, personal, entes reguladores, proveedores, la comunidad del entorno. No todas importan igual, y decidir cuáles importan es justamente el trabajo.',
  'Un cliente institucional del que dependen la mitad de los pedidos es pertinente. El proveedor de café de la oficina, casi con seguridad, no.',
  'ISO 9001:2015, 4.2. Pide determinar las partes interesadas pertinentes para el sistema de gestión y sus requisitos pertinentes, y hacer seguimiento de esa información. No pide una matriz concreta ni una fórmula de puntuación: eso lo decide cada empresa.',
  'normative_reference');

select public.help_seed_item(
  'quality', 'quality.context.interested_parties', 'field', 'relevance',
  'Pertinencia',
  'Pertinente significa que lo que esa parte necesita, espera u obliga PUEDE afectar a la capacidad de entregar lo que se promete. No es lo mismo que importante para el negocio, y no es lo mismo que prioritaria.',
  'Una fundación con la que se colabora puntualmente puede ser muy valiosa para la empresa y NO ser pertinente para el sistema de gestión, si no impone requisitos ni toca ningún proceso. Se registra así, con esa razón escrita.',
  'ISO 9001:2015, 4.2. Declarar a alguien no pertinente es una decisión legítima; lo que no se sostiene es no haberla tomado, ni poder explicarla.',
  'normative_reference');

select public.help_seed_item(
  'quality', 'quality.context.interested_parties', 'concept', 'need',
  'Necesidad',
  'Una necesidad es lo que la parte interesada requiere para que lo que recibe le sirva. Suele estar implícita: nadie la escribe en un contrato porque se da por supuesta.',
  'Un cliente necesita que el producto llegue en condiciones de usarse. No lo pide por escrito; lo da por hecho.',
  'ISO 9001:2015, 4.2. Separar necesidad, expectativa y requisito evita convertir todo en obligación contractual y perder de vista lo que de verdad hay que cumplir.',
  'normative_reference');

select public.help_seed_item(
  'quality', 'quality.context.interested_parties', 'concept', 'expectation',
  'Expectativa',
  'Una expectativa es lo que la parte interesada espera aunque no lo haya pedido. No obliga, pero si se incumple se nota — y a veces se pierde al cliente sin que haya habido ningún incumplimiento formal.',
  'Un cliente espera que se le avise si el pedido se retrasa. No está en el contrato, y si no se hace, se acuerda.',
  'ISO 9001:2015, 4.2. Una expectativa que se decide atender pasa a gestionarse; una que se decide no atender, también se registra con esa decisión.',
  'normative_reference');

select public.help_seed_item(
  'quality', 'quality.context.interested_parties', 'section', 'requirement',
  'Requisito',
  'Un requisito es lo que obliga: un contrato, una norma aplicable, una ley, un compromiso asumido por escrito. Se cumple o no se cumple, y esa diferencia se puede demostrar.',
  'La ficha técnica firmada con el cliente exige un ensayo de resistencia por lote. Eso es un requisito, y su incumplimiento es una no conformidad.',
  'ISO 9001:2015, 4.2, y —cuando el requisito viene de un cliente— también 8.2. Determinar los requisitos es el paso previo a poder decir si se cumplen.',
  'normative_reference');

select public.help_seed_item(
  'quality', 'quality.context.interested_parties', 'field', 'influence',
  'Influencia',
  'La influencia mide cuánto puede esa parte cambiar lo que hace la empresa: imponer condiciones, retirar un permiso, cortar un suministro. No mide simpatía ni cercanía.',
  'Un ente regulador con potestad para suspender la operación tiene influencia alta aunque el trato sea excelente y no haya habido nunca un problema.',
  null,
  'safe');

select public.help_seed_item(
  'quality', 'quality.context.interested_parties', 'field', 'impact',
  'Impacto',
  'El impacto mide cuánto le afecta a esa parte lo que la empresa hace o deja de hacer. Es la otra mitad de la influencia, y no siempre van juntas.',
  'La comunidad del entorno de una planta recibe un impacto alto y tiene, normalmente, una influencia baja. Que no pueda obligar a nada no la hace irrelevante.',
  null,
  'safe');

select public.help_seed_item(
  'quality', 'quality.context.interested_parties', 'section', 'strategy',
  'Estrategia',
  'La estrategia dice qué se va a hacer con esa parte interesada: atender sus requisitos, informarle, negociar, o simplemente vigilar cómo evoluciona. Sin estrategia, el análisis se queda en una lista.',
  'Para un regulador, la estrategia suele ser cumplir y documentar. Para un cliente clave, atender y anticipar. Para una comunidad vecina, informar.',
  'ISO 9001:2015, 4.2 y 6.1. Lo que se decide hacer con una parte interesada alimenta la planificación: los riesgos y las oportunidades salen de ahí.',
  'normative_reference');

select public.help_seed_item(
  'quality', 'quality.context.interested_parties', 'section', 'monitoring',
  'Seguimiento',
  'El seguimiento es cómo se va a saber si lo que se decidió sigue valiendo. Una parte interesada no es una foto: sus requisitos cambian, y la empresa tiene que enterarse antes de que se lo digan.',
  'Revisar las encuestas de un cliente cada trimestre, o mirar si el regulador publicó una resolución nueva. Se anota qué se mira y cada cuánto.',
  'ISO 9001:2015, 4.2. Pide hacer seguimiento y revisión de la información sobre las partes interesadas y sus requisitos.',
  'normative_reference');

select public.help_seed_item(
  'quality', 'quality.context.interested_parties', 'section', 'review',
  'Revisión',
  'Una revisión deja constancia de que alguien miró el análisis en una fecha y decidió si seguía valiendo. Confirmar que nada cambió es un resultado tan legítimo como cambiarlo todo — lo que no se sostiene es no haber mirado.',
  'En la revisión anual se confirma que los requisitos del cliente principal siguen siendo los mismos. Queda registrado con su fecha y su responsable.',
  'ISO 9001:2015, 9.3. La revisión por la dirección considera los cambios en las cuestiones externas e internas pertinentes.',
  'normative_reference');

select public.help_seed_item(
  'quality', 'quality.context.interested_parties', 'section', 'history',
  'Historia del análisis',
  'Un análisis no se edita: se sustituye. El anterior se conserva entero, con su fecha y su justificación, y el nuevo pasa a regir. «Ver estado en fecha» reconstruye qué regía ese día —el análisis, sus requisitos y sus estrategias— en modo de solo lectura.',
  'En una auditoría preguntan por qué en marzo no había estrategia para un cliente que hoy sí la tiene. Se elige esa fecha y se ve exactamente lo que había, sin mezclar nada de hoy.',
  'ISO 9001:2015, 7.5, información documentada: lo que se conserva tiene que poder demostrar lo que se hizo. Un registro que se puede reescribir deja de demostrar nada.',
  'normative_reference');

-- La herramienta de siembra se va: existió para esta ola.
drop function public.help_seed_item(text, text, text, text, text, text, text, text, text);


-- ============================================================================
-- 9 · LO QUE NO SE HIZO
-- ----------------------------------------------------------------------------
--   · No se toca `trazadoc_authoring_guidance`. Sigue siendo la guía de autoría
--     de TrazaDocs, con su alcance y su puerta comercial. Ver §12 del informe.
--   · No hay tabla de vídeos ni de tutoriales: eso es PE-03. Lo único que este
--     tramo le deja preparado es el vocabulario de pantallas, que es de
--     `lib/modules/page-keys.ts` y no de la ayuda.
--   · No hay `organization_id`: la ayuda es catálogo del producto.
--   · La ayuda NO se filtra por plan. Si alguien ve la pantalla, ve la
--     explicación.
-- ============================================================================
