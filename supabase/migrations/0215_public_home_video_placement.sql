-- =============================================================================
-- Trazaloop · COMMERCIAL-UX-01E · Un vídeo para la portada pública
-- =============================================================================
--
-- QUÉ HACE FALTA
--
-- Poder señalar, desde la consola de superadministración, QUÉ vídeo se enseña
-- en la portada a quien todavía no es cliente. Y que un visitante sin sesión
-- pueda descubrirlo y verlo, sin que eso abra nada más.
--
--
-- POR QUÉ NO SE INVENTA UN MODELO NUEVO
--
-- `platform_tutorials.tutorial_type` YA es una gramática de emplazamiento:
--
--   page    → la ayuda contextual de una pantalla concreta (con su `page_key`)
--   welcome → el vídeo de bienvenida de dentro del producto
--
-- «La portada pública» es otro emplazamiento, no otra clase de objeto. Se añade
-- `public_home` a esa misma gramática y se hereda todo lo que ya existe:
-- versionado, publicación, `effective_from`/`effective_to`, sucesión de
-- versiones, hash de contenido, MIME real, estado del fichero, póster y la
-- consola de administración entera.
--
-- Un booleano `es_el_de_la_portada` habría sido más corto de escribir y no
-- escalaría: el segundo emplazamiento público obligaría a un segundo booleano,
-- y dos booleanos ya admiten estados imposibles.
--
--
-- COMO MUCHO UNO, Y LO DICE LA BASE
--
-- Se copia el idioma que 0159 ya usa para `welcome`: un índice único sobre una
-- constante, filtrado por tipo. La diferencia es que este se acota además a
-- `status = 'active'`, para que retirar el vídeo de la portada y poner otro sea
-- posible sin borrar la historia del primero.
--
-- Esconder opciones en una pantalla no es una regla; esto sí.
--
--
-- LO PÚBLICO SALE POR UNA VISTA, COMO EN 0213 Y 0214
--
-- `v_tutorial_current` exige `auth.uid() is not null` y así se queda: es la de
-- dentro. La de fuera es una vista propia con proyección mínima —lo justo para
-- saber QUÉ vídeo es y poder decidir si ya se descartó— y sin la ruta del
-- fichero, que no sale por ninguna lectura pública.
--
-- El medio se sirve aparte, firmado por el servidor, y para eso hay una función
-- SIN PARÁMETROS: no se le puede pedir que firme otra cosa porque no hay dónde
-- decírselo. Es la misma idea que `tutorial_current_object_path`, llevada un
-- paso más allá para un consumidor que no tiene sesión.
-- =============================================================================

do $$
begin
  if to_regclass('public.platform_tutorials') is null then
    raise exception '0215 presupone los tutoriales de 0159';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1 · El emplazamiento nuevo, dentro de la gramática que ya había
-- -----------------------------------------------------------------------------
alter table public.platform_tutorials
  drop constraint platform_tutorials_type_check;
alter table public.platform_tutorials
  add constraint platform_tutorials_type_check
  check (tutorial_type in ('page', 'welcome', 'public_home'));

-- Igual que `welcome`: sin `page_key` y sin `module_key`, porque no cuelga de
-- ninguna pantalla ni de ningún módulo. Cuelga de la portada.
alter table public.platform_tutorials
  drop constraint platform_tutorials_page_key_presence_check;
alter table public.platform_tutorials
  add constraint platform_tutorials_page_key_presence_check
  check (
    (tutorial_type = 'page' and page_key is not null and module_key is not null)
    or (tutorial_type = 'welcome' and page_key is null and module_key is null)
    or (tutorial_type = 'public_home' and page_key is null and module_key is null)
  );

comment on column public.platform_tutorials.tutorial_type is
  'PE-03B1 · DONDE se enseña: page (ayuda de una pantalla, con page_key) | welcome (bienvenida dentro del producto) | public_home (COMMERCIAL-UX-01E · la portada publica, sin sesion). Es un emplazamiento, no una clase de objeto: todo lo demas —versionado, publicacion, hash, MIME, poster— se comparte.';

-- COMO MUCHO UNO ACTIVO. La ambigüedad no se resuelve en una pantalla.
create unique index if not exists platform_tutorials_public_home_uniq
  on public.platform_tutorials ((true))
  where tutorial_type = 'public_home' and status = 'active';

-- -----------------------------------------------------------------------------
-- 2 · Lo que un visitante sin sesión puede descubrir
-- -----------------------------------------------------------------------------
-- La proyección mínima para decidir si hay vídeo y si ya se descartó ESTE. Sin
-- `object_path`, sin `content_hash`, sin quién lo subió, sin borradores, sin
-- versiones retiradas y sin ficheros que no hayan pasado la verificación.
create or replace view public.v_public_home_video
with (security_invoker = false)
as
select
  t.id                       as tutorial_id,
  v.id                       as version_id,
  v.version_number,
  coalesce(v.title, t.title) as title,
  v.description,
  v.duration_seconds,
  v.real_mime                as mime_type,
  (v.poster_path is not null) as has_poster
from public.platform_tutorials t
join public.platform_tutorial_versions v
  on v.tutorial_id = t.id
 and v.effective_from is not null
 and v.effective_to is null
 and v.file_state = 'verified'
where t.tutorial_type = 'public_home'
  and t.status = 'active';

comment on view public.v_public_home_video is
  'COMMERCIAL-UX-01E · Lo unico que se puede saber sin sesion del video de la portada: que video es, que version, como se titula y cuanto dura. Sin object_path, sin hash, sin autoria, sin borradores, sin versiones retiradas. La vista ES la frontera.';

revoke insert, update, delete, truncate, references, trigger
  on public.v_public_home_video from anon, authenticated;
grant select on public.v_public_home_video to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3 · La ruta del fichero · SIN PARÁMETROS, a propósito
-- -----------------------------------------------------------------------------
-- `tutorial_current_object_path(version_id)` acepta qué versión firmar y se
-- protege comprobando que sea la vigente. Aquí ni siquiera hay dónde pedir otra
-- cosa: la función resuelve ella misma cuál es el vídeo de la portada.
--
-- Es la defensa más fuerte contra «fírmame este otro»: no existe el argumento.
--
-- No se concede a `anon`. La usa el servidor al emitir la URL temporal, y el
-- navegador nunca ve una ruta.
create or replace function public.public_home_video_object_path()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select v.object_path
    from public.platform_tutorial_versions v
    join public.platform_tutorials t on t.id = v.tutorial_id
   where t.tutorial_type = 'public_home'
     and t.status = 'active'
     and v.effective_from is not null
     and v.effective_to is null
     and v.file_state = 'verified'
   limit 1;
$$;

revoke all on function public.public_home_video_object_path() from public, anon, authenticated;
grant execute on function public.public_home_video_object_path() to service_role;

comment on function public.public_home_video_object_path() is
  'COMMERCIAL-UX-01E · La ruta del video de la portada publica. SIN PARAMETROS: no se le puede pedir que resuelva otro video porque no hay donde decirselo. Solo el servidor la ejecuta, para emitir una URL temporal; el navegador nunca ve una ruta.';

-- -----------------------------------------------------------------------------
-- 4 · Comprobación · la superficie es exactamente la declarada
-- -----------------------------------------------------------------------------
do $$
declare
  v_col text;
  v_tab text;
  v_n   integer;
  v_esperadas constant text[] := array[
    'tutorial_id', 'version_id', 'version_number', 'title', 'description',
    'duration_seconds', 'mime_type', 'has_poster'];
begin
  -- 4.1 · Ni una columna de más.
  select string_agg(column_name, ', ' order by column_name) into v_col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'v_public_home_video'
     and column_name <> all (v_esperadas);
  if v_col is not null then
    raise exception '0215_EL_VIDEO_PUBLICO_EXPONE_COLUMNAS_SIN_DECLARAR: %', v_col;
  end if;

  -- 4.2 · Y en particular, NUNCA la ruta del fichero ni la huella ni la autoría.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'v_public_home_video'
                and column_name in ('object_path', 'poster_path', 'content_hash',
                                    'bucket_id', 'uploaded_by', 'published_by',
                                    'change_note', 'original_filename')) then
    raise exception '0215_SE_ESCAPO_INFORMACION_INTERNA_DEL_MEDIO';
  end if;

  -- 4.3 · Las tablas de tutoriales siguen cerradas sin sesión.
  select string_agg(c.relname, ', ' order by c.relname) into v_tab
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and c.relname in ('platform_tutorials', 'platform_tutorial_versions')
     and has_table_privilege('anon', c.oid, 'SELECT');
  if v_tab is not null then
    raise exception '0215_TABLAS_DE_TUTORIALES_ABIERTAS_A_ANON: %', v_tab;
  end if;

  -- 4.4 · Y nadie sin sesión puede pedir una ruta de fichero.
  if has_function_privilege('anon', 'public.public_home_video_object_path()', 'EXECUTE')
     or has_function_privilege('anon', 'public.tutorial_current_object_path(uuid)', 'EXECUTE') then
    raise exception '0215_ANON_PUEDE_RESOLVER_RUTAS_DE_MEDIO';
  end if;

  -- 4.5 · Leer, y nada más.
  if not has_table_privilege('anon', 'public.v_public_home_video', 'SELECT') then
    raise exception '0215_LA_CONCESION_NO_SURTIO_EFECTO';
  end if;
  if has_table_privilege('anon', 'public.v_public_home_video', 'INSERT')
     or has_table_privilege('anon', 'public.v_public_home_video', 'UPDATE')
     or has_table_privilege('anon', 'public.v_public_home_video', 'DELETE') then
    raise exception '0215_EL_VIDEO_PUBLICO_ES_ESCRIBIBLE';
  end if;

  -- 4.6 · LA LISTA BLANCA DE 0202, ENTERA. Ahora son siete.
  select string_agg(c.relname, ', ' order by c.relname) into v_tab
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and has_table_privilege('anon', c.oid, 'SELECT')
     and c.relname not in ('legal_documents', 'v_faq_public',
                           'v_faq_public_categories',
                           'v_public_plan_catalog', 'v_public_plan_limits',
                           'v_public_trial_policy', 'v_public_home_video');
  if v_tab is not null then
    raise exception '0202_TABLAS_LEGIBLES_SIN_DECLARAR: %', v_tab;
  end if;

  select count(*) into v_n
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and has_table_privilege('anon', c.oid, 'SELECT');
  if v_n <> 7 then
    raise exception '0215_SUPERFICIE_PUBLICA_INESPERADA: % relaciones', v_n;
  end if;

  -- 4.7 · Y nadie escribe sin sesión, en ninguna parte del esquema.
  select string_agg(c.relname, ', ' order by c.relname) into v_tab
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and (has_table_privilege('anon', c.oid, 'INSERT')
       or has_table_privilege('anon', c.oid, 'UPDATE')
       or has_table_privilege('anon', c.oid, 'DELETE'));
  if v_tab is not null then
    raise exception '0215_ANON_PUEDE_ESCRIBIR: %', v_tab;
  end if;

  raise notice '0215 · emplazamiento public_home · 7 relaciones publicas · sin escritura';
end $$;

-- -----------------------------------------------------------------------------
-- 5 · Comprobación · como mucho uno, y la regla la tiene la base
-- -----------------------------------------------------------------------------
do $$
declare v_ok boolean := false;
begin
  if (select count(*) from public.platform_tutorials
       where tutorial_type = 'public_home' and status = 'active') > 1 then
    raise exception '0215_HAY_MAS_DE_UN_VIDEO_DE_PORTADA_ACTIVO';
  end if;

  -- Se comprueba que el índice MUERDE de verdad, no que exista. Dos filas
  -- activas del mismo emplazamiento tienen que ser imposibles.
  begin
    insert into public.platform_tutorials (tutorial_type, title, status)
    values ('public_home', '0215 comprobacion uno', 'active'),
           ('public_home', '0215 comprobacion dos', 'active');
    v_ok := false;
  exception when unique_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '0215_SE_PUEDEN_TENER_DOS_VIDEOS_DE_PORTADA';
  end if;

  raise notice '0215 · la base impide dos videos de portada activos a la vez';
end $$;
