-- ============================================================================
-- Trazaloop · PE-02B2 · UN DOCUMENTO LEGAL ACTIVO NO SE REESCRIBE
-- ----------------------------------------------------------------------------
-- EL HUECO, TAL COMO LO ENCONTRÓ PE-02B1
--
-- `legal_documents` tenía —y tiene— casi todo lo que hace falta: unicidad por
-- (tipo, versión), un índice único parcial que garantiza UN activo por tipo, y
-- una aceptación que referencia el **id** del documento, de modo que publicar
-- una versión nueva vuelve a pedir la aceptación por sí solo.
--
-- Lo que faltaba era la parte que sostiene todo lo demás: la política
-- `legal_documents_update` permite a un superadministrador **reescribir el
-- contenido de la versión activa en su sitio**. Es decir: cambiar lo que dice
-- la política de privacidad que la gente ya aceptó, sin cambiar su id, sin
-- dejar rastro y sin que nadie tenga que volver a aceptarla.
--
-- Eso convierte una prueba de consentimiento en un texto editable. Es el
-- fallo que el resto del repositorio evita en todo lo que sirve de prueba de
-- algo: las revisiones documentales de QUALITY-02, la guía de 0136 y la FAQ
-- de 0155 son inmutables por la misma razón.
--
--
-- QUÉ HACE ESTA MIGRACIÓN, Y QUÉ NO
--
-- NO convierte `legal_documents` en las tablas de la FAQ. El modelo nativo ya
-- es correcto —una fila por versión, sucesión por filas— y cambiarlo obligaría
-- a migrar las aceptaciones, que son consentimiento real y no se tocan.
--
-- Lo que hace es cerrar el hueco con el patrón que ya usa el repositorio:
--
--   1 · Un DISPARADOR de inmutabilidad. Una vez que una versión ha sido
--       activa, su contenido no se modifica ni se borra. Lo único que se le
--       puede hacer es archivarla y decir quién la sucede.
--   2 · Cuatro funciones que son la única puerta razonable: crear borrador,
--       corregir borrador, publicar y descartar borrador.
--   3 · La procedencia que faltaba: quién lo escribió, quién lo publicó, con
--       qué nota, y la huella del contenido.
--   4 · Que el superadministrador pueda VER lo que no está activo. Hasta hoy
--       la única política de lectura era `status = 'active'`: ni un borrador ni
--       una versión archivada eran visibles para nadie, ni siquiera para quien
--       los escribió.
--
-- Nada de esto cambia lo que ve el público ni cómo se acepta. La política de
-- lectura pública sigue siendo la de 0066, palabra por palabra.
-- ============================================================================


-- ============================================================================
-- 1 · LA PROCEDENCIA QUE FALTABA
-- ----------------------------------------------------------------------------
-- Todas nulas y aditivas: las dos versiones que ya existen —`terms` v1 y
-- `privacy` v1— siguen siendo válidas y no se tocan. Lo único que se les
-- rellena es la huella del contenido, que es un cálculo sobre lo que ya dicen.
-- ============================================================================

alter table public.legal_documents
  add column if not exists created_by    uuid references public.profiles (id),
  add column if not exists published_by  uuid references public.profiles (id),
  add column if not exists change_note   text,
  add column if not exists content_hash  text,
  add column if not exists supersedes_id uuid references public.legal_documents (id),
  add column if not exists superseded_by_id uuid references public.legal_documents (id),
  add column if not exists retired_at    timestamptz;

comment on column public.legal_documents.content_hash is
  'PE-02B2 · Huella del contenido publicado. Permite demostrar que una version archivada no cambio, sin comparar el texto a ojo.';
comment on column public.legal_documents.superseded_by_id is
  'PE-02B2 · Que version la sucedio. Es lo que convierte una lista de filas en una historia.';
comment on column public.legal_documents.retired_at is
  'PE-02B2 · Cuando dejo de estar vigente. Junto a published_at delimita el periodo en que ESE texto era el que se aceptaba.';

-- La huella de lo que ya está publicado. Sin esto, el disparador del §2 no
-- tendría contra qué comparar en las filas que existían antes de hoy.
update public.legal_documents
   set content_hash = encode(sha256(convert_to(
         coalesce(title, '') || E'\n' || coalesce(content, ''), 'UTF8')), 'hex')
 where content_hash is null;


-- ============================================================================
-- 2 · LA INMUTABILIDAD, Y SUS DOS ÚNICAS EXCEPCIONES
-- ----------------------------------------------------------------------------
-- Una versión que ha estado activa no se toca. Lo único que se le puede hacer:
--
--   · archivarla —`active` → `archived`, con su fecha de retiro—;
--   · decir quién la sucede, y solo una vez.
--
-- Un borrador sí se corrige: para eso es un borrador. Deja de poder tocarse en
-- el instante en que se publica.
--
-- Y no se borra nada que haya estado activo, ni nada que alguien haya
-- aceptado. Borrar una versión aceptada dejaría aceptaciones apuntando al
-- vacío: la prueba de consentimiento diría que alguien aceptó algo que ya no
-- se puede leer.
-- ============================================================================

create or replace function public.legal_document_is_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aceptaciones integer;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Una versión legal publicada no se borra: se archiva y se sucede con otra. Así se puede saber qué texto aceptó cada persona.';
    end if;
    select count(*) into v_aceptaciones
      from user_legal_acceptances where legal_document_id = old.id;
    if v_aceptaciones > 0 then
      raise exception 'Esa versión tiene aceptaciones registradas: borrarla dejaría constancia de que alguien aceptó un texto que ya no existe.';
    end if;
    return old;
  end if;

  -- Un borrador se corrige. Es lo que lo distingue de una versión publicada.
  if old.status = 'draft' then
    -- Salvo su identidad: cambiar el tipo o la versión de un borrador sería
    -- crear otro documento fingiendo que es el mismo.
    if new.document_type is distinct from old.document_type then
      raise exception 'El tipo de un documento legal no cambia. Si es otro documento, es otro documento.';
    end if;
    return new;
  end if;

  if new.document_type is distinct from old.document_type
     or new.version is distinct from old.version
     or new.title is distinct from old.title
     or new.content is distinct from old.content
     or new.content_hash is distinct from old.content_hash
     or new.published_at is distinct from old.published_at
     or new.created_at is distinct from old.created_at then
    raise exception 'El contenido de una versión legal publicada no se modifica. Para cambiar lo que dice se publica una versión nueva, y quien la aceptó vuelve a aceptarla.';
  end if;

  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'Una versión legal archivada no vuelve a estar vigente. Para volver a ese texto se publica como versión nueva.';
  end if;

  if old.superseded_by_id is not null
     and new.superseded_by_id is distinct from old.superseded_by_id then
    raise exception 'Esa versión legal ya tiene sucesora.';
  end if;

  return new;
end;
$$;

revoke all on function public.legal_document_is_immutable() from public, anon, authenticated;

create trigger t_legal_documents_immutable
  before update or delete on public.legal_documents
  for each row execute function public.legal_document_is_immutable();

comment on function public.legal_document_is_immutable() is
  'PE-02B2 · Una version legal que ha estado activa no se reescribe ni se borra. Es un DISPARADOR y no una politica: una politica no frena a service_role, y esto tiene que frenarlo.';


-- ============================================================================
-- 3 · QUE EL SUPERADMINISTRADOR PUEDA VER LO QUE NO ESTÁ ACTIVO
-- ----------------------------------------------------------------------------
-- Hasta hoy la única política de lectura era `status = 'active'`, para todo el
-- mundo. Consecuencia: un borrador legal era invisible incluso para quien
-- acababa de escribirlo, y una versión archivada no se podía consultar.
--
-- La lectura PÚBLICA no cambia: sigue siendo exactamente la de 0066.
-- ============================================================================

create policy legal_documents_staff_select on public.legal_documents
  for select using (public.is_platform_staff());

comment on policy legal_documents_staff_select on public.legal_documents is
  'PE-02B2 · La plataforma ve tambien borradores y archivadas. La lectura publica de 0066 no cambia: sigue siendo status = active para todo el mundo.';


-- ============================================================================
-- 4 · CREAR UN BORRADOR DE VERSIÓN NUEVA
-- ----------------------------------------------------------------------------
-- Crear no publica. Un borrador no lo ve el público, no se puede aceptar y no
-- desplaza a la versión vigente.
-- ============================================================================

create or replace function public.legal_create_draft(
  p_document_type text,
  p_version       text,
  p_title         text,
  p_content       text,
  p_change_note   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma redacta documentos legales.';
  end if;

  if length(btrim(coalesce(p_version, ''))) = 0 then
    raise exception 'Una versión necesita un número o un nombre que la identifique.';
  end if;
  if length(btrim(coalesce(p_title, ''))) < 3 then
    raise exception 'Un documento legal necesita un título.';
  end if;
  if length(btrim(coalesce(p_content, ''))) < 50 then
    raise exception 'Un documento legal necesita un texto. Este parece incompleto.';
  end if;

  -- El índice único (tipo, versión) también lo impediría, pero con un mensaje
  -- del motor. Vale la pena decirlo con palabras.
  if exists (select 1 from legal_documents
              where document_type = p_document_type and version = btrim(p_version)) then
    raise exception 'Ya existe una versión «%» de ese documento. Usa otro número de versión.', btrim(p_version);
  end if;

  insert into legal_documents (
    document_type, version, title, content, status, change_note, created_by, content_hash)
  values (
    p_document_type, btrim(p_version), btrim(p_title), p_content, 'draft',
    p_change_note, auth.uid(),
    encode(sha256(convert_to(btrim(coalesce(p_title, '')) || E'\n' || coalesce(p_content, ''), 'UTF8')), 'hex'))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.legal_create_draft(text, text, text, text, text) from public, anon;
grant execute on function public.legal_create_draft(text, text, text, text, text) to authenticated;

comment on function public.legal_create_draft(text, text, text, text, text) is
  'PE-02B2 · Crea un BORRADOR de version legal. Crear no publica: un borrador no lo ve el publico, no se acepta y no desplaza a la vigente.';


-- ============================================================================
-- 5 · CORREGIR UN BORRADOR
-- ----------------------------------------------------------------------------
-- Mientras es borrador se corrige cuantas veces haga falta. En el instante en
-- que se publica, deja de poder tocarse — y esa frontera la vigila el
-- disparador del §2, no esta función.
-- ============================================================================

create or replace function public.legal_update_draft(
  p_id          uuid,
  p_title       text,
  p_content     text,
  p_change_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc record;
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma redacta documentos legales.';
  end if;

  select * into v_doc from legal_documents where id = p_id;
  if v_doc.id is null then raise exception 'Ese documento no existe.'; end if;
  if v_doc.status <> 'draft' then
    raise exception 'Esa versión ya se publicó y no se corrige. Para cambiar lo que dice se publica una versión nueva.';
  end if;
  if length(btrim(coalesce(p_content, ''))) < 50 then
    raise exception 'Un documento legal necesita un texto. Este parece incompleto.';
  end if;

  update legal_documents
     set title = btrim(p_title),
         content = p_content,
         change_note = coalesce(p_change_note, change_note),
         content_hash = encode(sha256(convert_to(
           btrim(coalesce(p_title, '')) || E'\n' || coalesce(p_content, ''), 'UTF8')), 'hex')
   where id = p_id;
end;
$$;

revoke all on function public.legal_update_draft(uuid, text, text, text) from public, anon;
grant execute on function public.legal_update_draft(uuid, text, text, text) to authenticated;


-- ============================================================================
-- 6 · PUBLICAR · la sucesión
-- ----------------------------------------------------------------------------
-- Archiva la vigente, activa la nueva y las enlaza. En este orden y no en otro:
-- el índice único parcial `one_active_per_type` no se puede diferir, así que
-- activar antes de archivar dejaría dos activas durante un instante y la
-- operación fallaría.
--
-- LO QUE PASA DESPUÉS, Y ES EL PUNTO DE TODO ESTO
--
-- La aceptación referencia el **id** del documento. Al activarse una versión
-- nueva —id nuevo—, `accept_active_legal_documents` deja de encontrar la
-- aceptación de esa persona y la puerta de `/legal/accept` vuelve a pedirla.
-- No hay que programar nada para eso: es consecuencia de suceder en vez de
-- reescribir. Reescribir en su sitio era exactamente lo que lo rompía.
-- ============================================================================

create or replace function public.legal_publish_document(
  p_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc     record;
  v_vigente record;
  v_ahora   timestamptz := now();
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma publica documentos legales.';
  end if;

  select * into v_doc from legal_documents where id = p_id;
  if v_doc.id is null then raise exception 'Ese documento no existe.'; end if;
  if v_doc.status = 'active' then
    raise exception 'Esa versión ya está vigente.';
  end if;
  if v_doc.status <> 'draft' then
    raise exception 'Solo se publica un borrador. Una versión archivada no vuelve: se publica de nuevo como versión nueva.';
  end if;

  select * into v_vigente
    from legal_documents
   where document_type = v_doc.document_type and status = 'active';

  -- Primero se archiva la vigente. Ver el comentario de la cabecera.
  if v_vigente.id is not null then
    update legal_documents
       set status = 'archived', retired_at = v_ahora
     where id = v_vigente.id;
  end if;

  update legal_documents
     set status = 'active',
         published_at = v_ahora,
         published_by = auth.uid(),
         supersedes_id = v_vigente.id
   where id = p_id;

  -- Y ahora se enlaza hacia adelante. El disparador lo permite porque el
  -- contenido no cambia y la sucesora todavía no estaba puesta.
  if v_vigente.id is not null then
    update legal_documents set superseded_by_id = p_id where id = v_vigente.id;
  end if;

  return p_id;
end;
$$;

revoke all on function public.legal_publish_document(uuid) from public, anon;
grant execute on function public.legal_publish_document(uuid) to authenticated;

comment on function public.legal_publish_document(uuid) is
  'PE-02B2 · Publica un borrador legal: archiva la vigente, activa la nueva y las enlaza. Como la aceptacion referencia el id del documento, la version nueva vuelve a pedir aceptacion por si sola.';


-- ============================================================================
-- 7 · DESCARTAR UN BORRADOR
-- ----------------------------------------------------------------------------
-- Lo único que se puede borrar de esta tabla. Y aun así el disparador vuelve a
-- comprobarlo: si un borrador tuviera aceptaciones —no debería, pero la
-- comprobación es barata— no se va.
-- ============================================================================

create or replace function public.legal_discard_draft(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc record;
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma descarta borradores legales.';
  end if;

  select * into v_doc from legal_documents where id = p_id;
  if v_doc.id is null then raise exception 'Ese documento no existe.'; end if;
  if v_doc.status <> 'draft' then
    raise exception 'Solo se descarta un borrador. Lo que se publicó se archiva, no se descarta.';
  end if;

  delete from legal_documents where id = p_id;
end;
$$;

revoke all on function public.legal_discard_draft(uuid) from public, anon;
grant execute on function public.legal_discard_draft(uuid) to authenticated;


-- ============================================================================
-- 8 · LO QUE NO CAMBIA, Y CONVIENE DECIRLO EN VOZ ALTA
-- ----------------------------------------------------------------------------
--   · `legal_documents_select_public` sigue igual: `status = 'active'`, para
--     `anon` y `authenticated`. La portada, /terms y /privacy no notan nada.
--   · `accept_active_legal_documents` (0068) no se toca. Sigue decidiendo ella
--     sola cuáles son los documentos activos requeridos, y sigue registrando
--     id, tipo y versión de lo que se aceptó.
--   · `user_legal_acceptances` no se toca. Una aceptación es consentimiento
--     real: ni se migra, ni se reinterpreta, ni se hereda.
--   · Las dos versiones vigentes —`terms` v1 y `privacy` v1— siguen vigentes,
--     con su mismo id. Nadie tiene que volver a aceptar nada por esta
--     migración.
-- ============================================================================
