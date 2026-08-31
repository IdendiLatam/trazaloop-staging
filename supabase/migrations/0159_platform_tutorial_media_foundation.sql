-- ============================================================================
-- Trazaloop · PE-03B1 · LOS CIMIENTOS DEL TUTORIAL AUDIOVISUAL
-- ----------------------------------------------------------------------------
-- Identidad estable, versiones inmutables, historia de publicación, y un cubo
-- privado con la reserva que autoriza subir a él. Sin consola, sin botón, sin
-- reproductor y sin vídeo: eso es B2, B3 y B4.
--
--
-- LO QUE ESTA MIGRACIÓN COPIA, Y DE DÓNDE
--
-- La forma es la de 0136, 0155 y 0158: identidad estable + revisiones
-- inmutables con `effective_from`/`effective_to`, un índice único parcial que
-- garantiza una sola abierta, publicación por función `security definer`, e
-- inmutabilidad por DISPARADOR y no por política — porque una política no
-- detiene a `service_role`.
--
-- La reserva de subida es la de 0101: una fila creada en el servidor que fija
-- la ruta, el tamaño y el tipo esperados antes de que el navegador escriba un
-- byte. No se reutiliza `storage_upload_intents` porque exige
-- `organization_id`, `module_code = 'traceability_6632'` y que la ruta empiece
-- por la empresa. Un tutorial no tiene empresa. Lo reutilizable es el patrón.
--
--
-- LO QUE ES DISTINTO, Y POR QUÉ
--
-- 1 · NO HAY TABLA DE BORRADORES. En la FAQ el borrador vive aparte porque se
--     edita muchas veces y lo publicado tiene que seguir intacto mientras
--     tanto. Un vídeo no se edita: se sube. La versión candidata es una fila de
--     `platform_tutorial_versions` con estado propio, y su inmutabilidad
--     empieza al PUBLICARSE, no al crearse.
--
-- 2 · DOS VOCABULARIOS DE ESTADO, no uno. `file_state` dice dónde están los
--     bytes; la vigencia dice qué se ve. Son independientes de verdad: una
--     versión `verified` que todavía no se ha publicado es un estado normal, y
--     un solo enumerado tendría que inventarse un nombre para representarlo.
--
-- 3 · SIN `organization_id`. Un tutorial es contenido de plataforma. Y como la
--     cuota de una empresa se calcula sumando desde tablas que SÍ lo tienen,
--     no hay que excluir los tutoriales de la cuota: basta con no incluirlos.
--
--
-- LO QUE ESTA MIGRACIÓN NO PUEDE GARANTIZAR, DICHO AQUÍ
--
-- El registro canónico de claves de pantalla vive en el código
-- (`lib/modules/page-keys.ts`). Esta tabla comprueba la FORMA de una
-- `page_key` —igual que hace `help_items` desde 0158— pero no puede saber si
-- esa clave existe en el registro. Eso lo comprueba la capa de servidor y una
-- prueba estática. Se dice para que nadie lea el CHECK como más de lo que es.
-- ============================================================================


-- ============================================================================
-- 1 · LA IDENTIDAD DE UN TUTORIAL
-- ----------------------------------------------------------------------------
-- Lo estable. Ni el título, ni el archivo, ni la ruta de la pantalla entran
-- aquí: los tres cambian sin que cambie de qué tutorial hablamos.
--
-- DOS TIPOS, UN SOLO MOTOR
--
--   page    · el tutorial de una pantalla. Se identifica por su `page_key`.
--   welcome · el vídeo de bienvenida. NO cuelga de ninguna pantalla, y no se
--             le inventa una ruta falsa para alojarlo: el tipo lo distingue.
--
-- Todo lo demás —versiones, verificación, publicación, historia— es idéntico
-- para los dos, y construir dos motores para eso sería duplicar el trabajo y
-- la superficie de fallo.
-- ============================================================================

create table public.platform_tutorials (
  id            uuid primary key default gen_random_uuid(),

  tutorial_type text not null,
  -- Solo para los de pantalla. En bienvenida es nulo, y el índice parcial de
  -- abajo impide que haya dos bienvenidas.
  page_key      text,
  module_key    text,

  title         text not null,
  status        text not null default 'active',

  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint platform_tutorials_type_check
    check (tutorial_type in ('page', 'welcome')),

  -- Un tutorial de pantalla necesita clave; la bienvenida no puede tenerla.
  constraint platform_tutorials_page_key_presence_check
    check (
      (tutorial_type = 'page'    and page_key is not null and module_key is not null)
      or
      (tutorial_type = 'welcome' and page_key is null     and module_key is null)
    ),

  -- La misma forma que comprueba el registro del código y que ya comprueba
  -- `help_items`. Repetirla es a propósito: una fila mal formada no debería
  -- existir aunque la escriba alguien saltándose la consola.
  constraint platform_tutorials_page_key_check
    check (page_key is null or page_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint platform_tutorials_module_check
    check (module_key is null or module_key in
           ('cpr', 'textiles', 'quality', 'construccion', 'platform')),
  constraint platform_tutorials_page_module_check
    check (page_key is null or split_part(page_key, '.', 1) = module_key),

  constraint platform_tutorials_title_check
    check (length(btrim(title)) between 3 and 160),
  constraint platform_tutorials_status_check
    check (status in ('active', 'retired'))
);

-- Un tutorial por pantalla. No varios compitiendo por la misma.
create unique index platform_tutorials_page_uniq
  on public.platform_tutorials (page_key)
  where tutorial_type = 'page';

-- Y una sola bienvenida. Sin esto, «el vídeo de bienvenida» dejaría de ser
-- una cosa concreta y habría que decidir cuál gana.
create unique index platform_tutorials_welcome_uniq
  on public.platform_tutorials ((true))
  where tutorial_type = 'welcome';

create index platform_tutorials_module_idx
  on public.platform_tutorials (module_key, page_key);

comment on table public.platform_tutorials is
  'PE-03B1 · La IDENTIDAD de un tutorial: de que pantalla es, o que es la bienvenida. Contenido de plataforma: sin organization_id a proposito. Ni el titulo ni el archivo forman parte de la identidad.';
comment on column public.platform_tutorials.page_key is
  'PE-03B1 · La MISMA clave estable de PE-02 (lib/modules/page-keys.ts). No hay una segunda familia de claves. Esta tabla comprueba la forma; que la clave EXISTA en el registro lo comprueba el servidor y una prueba estatica.';

create trigger t_platform_tutorials_updated
  before update on public.platform_tutorials
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 2 · LAS VERSIONES
-- ----------------------------------------------------------------------------
-- Una versión es un archivo con su periodo de vigencia. Reemplazar un vídeo es
-- crear otra versión, nunca sobrescribir la anterior: la ruta lleva el
-- `version_id` dentro, así que dos versiones no pueden compartir objeto por
-- accidente.
--
-- LOS DOS ESTADOS
--
--   file_state · dónde están los bytes
--       reserved  · hay reserva, no hay objeto
--       uploaded  · hay objeto, sin verificar
--       verified  · el servidor leyó el objeto REAL y cuadra
--       failed    · la subida no llegó, o no cuadró
--
--   vigencia   · qué se ve, y desde cuándo
--       effective_from null           · candidata: existe y no se ve
--       effective_from y to null      · vigente
--       effective_from y to           · histórica
--
-- Solo se puede publicar una versión `verified`. Es la barrera que impide que
-- unos bytes sin comprobar se conviertan en el tutorial que ve la gente.
-- ============================================================================

create table public.platform_tutorial_versions (
  id                uuid primary key default gen_random_uuid(),
  tutorial_id       uuid not null references public.platform_tutorials (id) on delete cascade,
  version_number    integer not null,

  -- Dónde están los bytes. La ruta se fija al reservar y no cambia jamás.
  bucket_id         text not null default 'tutorial-media',
  object_path       text not null unique,

  -- Lo que declaró quien sube, al reservar.
  original_filename text not null,
  declared_mime     text not null,
  declared_size_bytes bigint not null,

  -- Lo que el servidor leyó del objeto REAL, al finalizar. Nulo mientras no se
  -- haya verificado: un tamaño desconocido nunca se escribe como cero.
  real_mime         text,
  real_size_bytes   bigint,
  content_hash      text,
  -- Nula si no se pudo leer de la cabecera del contenedor. Jamás inventada.
  duration_seconds  integer,

  file_state        text not null default 'reserved',
  upload_expires_at timestamptz not null,
  verified_at       timestamptz,

  -- Lo editorial. Se puede corregir mientras la versión sea candidata.
  title             text,
  description       text,
  change_note       text,
  poster_path       text,

  -- La vigencia. Nula la primera hasta que se publica.
  effective_from    timestamptz,
  effective_to      timestamptz,
  superseded_by_version_id uuid references public.platform_tutorial_versions (id),
  -- Si repone el contenido de una versión anterior, cuál. Así la historia
  -- distingue una reposición de una versión nueva de verdad.
  restored_from_version_id uuid references public.platform_tutorial_versions (id),

  uploaded_by       uuid references public.profiles (id),
  published_by      uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  published_at      timestamptz,

  constraint tutorial_versions_number_check check (version_number >= 1),
  constraint tutorial_versions_uniq unique (tutorial_id, version_number),

  constraint tutorial_versions_bucket_check check (bucket_id = 'tutorial-media'),
  -- La ruta empieza SIEMPRE por el tutorial y sigue por la versión. Ni el
  -- nombre del archivo ni nada que venga del navegador decide dónde escribe.
  constraint tutorial_versions_path_check
    check (object_path = tutorial_id::text || '/' || id::text || '/'
                         || split_part(object_path, '/', 3)
           and split_part(object_path, '/', 3) <> ''
           and position('..' in object_path) = 0),

  constraint tutorial_versions_file_state_check
    check (file_state in ('reserved', 'uploaded', 'verified', 'failed')),

  -- 200 MB · decisión humana congelada en PE-03B1. Es el tope ESTRUCTURAL; el
  -- mismo número lo comprueba el servidor al reservar y otra vez al finalizar
  -- contra el tamaño real.
  constraint tutorial_versions_size_check
    check (declared_size_bytes > 0 and declared_size_bytes <= 200 * 1024 * 1024),
  constraint tutorial_versions_real_size_check
    check (real_size_bytes is null
           or (real_size_bytes > 0 and real_size_bytes <= 200 * 1024 * 1024)),

  -- Los dos únicos formatos que un navegador reproduce sin ayuda. Un .mov en
  -- el cubo es un tutorial que alguien no puede ver, y no se sabría hasta que
  -- alguien lo intentara.
  constraint tutorial_versions_declared_mime_check
    check (declared_mime in ('video/mp4', 'video/webm')),
  constraint tutorial_versions_real_mime_check
    check (real_mime is null or real_mime in ('video/mp4', 'video/webm')),

  constraint tutorial_versions_hash_check
    check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  constraint tutorial_versions_duration_check
    check (duration_seconds is null or duration_seconds > 0),

  -- Verificada quiere decir que TODO lo real está leído. Media verificación no
  -- es un estado.
  constraint tutorial_versions_verified_complete_check
    check (
      file_state <> 'verified'
      or (real_size_bytes is not null and real_mime is not null
          and content_hash is not null and verified_at is not null)
    ),

  -- Y solo lo verificado se puede publicar.
  constraint tutorial_versions_publish_requires_verified_check
    check (effective_from is null or file_state = 'verified'),

  constraint tutorial_versions_period_check
    check (effective_to is null or (effective_from is not null and effective_to >= effective_from)),
  constraint tutorial_versions_published_at_check
    check ((effective_from is null) = (published_at is null)),

  constraint tutorial_versions_title_check
    check (title is null or length(btrim(title)) between 3 and 160),
  constraint tutorial_versions_description_check
    check (description is null or length(btrim(description)) between 3 and 2000),
  constraint tutorial_versions_filename_check
    check (length(btrim(original_filename)) between 1 and 255)
);

-- COMO MUCHO UNA VERSIÓN VIGENTE POR TUTORIAL. Lo garantiza el índice, no la
-- función: una función se puede llamar dos veces a la vez.
create unique index tutorial_versions_vigente
  on public.platform_tutorial_versions (tutorial_id)
  where effective_from is not null and effective_to is null;

create index tutorial_versions_hist_idx
  on public.platform_tutorial_versions (tutorial_id, version_number desc);
create index tutorial_versions_hash_idx
  on public.platform_tutorial_versions (content_hash)
  where content_hash is not null;
-- Para la limpieza: reservas que caducaron sin llegar a nada.
create index tutorial_versions_pendientes_idx
  on public.platform_tutorial_versions (file_state, upload_expires_at)
  where file_state in ('reserved', 'uploaded');

comment on table public.platform_tutorial_versions is
  'PE-03B1 · Una VERSION de tutorial: un archivo y su periodo de vigencia. Reemplazar es crear otra, nunca sobrescribir. Dos vocabularios de estado: file_state dice donde estan los bytes, la vigencia dice que se ve.';
comment on column public.platform_tutorial_versions.object_path is
  'PE-03B1 · {tutorial_id}/{version_id}/{nombre}. El nombre del archivo es COSMETICO: jamas autoriza nada. Que la ruta lleve el version_id dentro es lo que hace imposible sobrescribir una version publicada.';
comment on column public.platform_tutorial_versions.content_hash is
  'PE-03B1 · SHA-256 de los bytes REALES, calculado por el servidor al finalizar. No se usa el ETag de Storage: es un detalle del proveedor y en subidas por partes no es el resumen del contenido.';
comment on column public.platform_tutorial_versions.duration_seconds is
  'PE-03B1 · Nula si no se pudo leer. Una duracion inventada es peor que ninguna: se muestra junto al video y la gente la cree.';
comment on column public.platform_tutorial_versions.restored_from_version_id is
  'PE-03B1 · Si esta version repone el contenido de una anterior, cual. Reponer NO reabre el periodo antiguo: crea uno nuevo, y asi la historia no miente.';


-- ============================================================================
-- 3 · LA INMUTABILIDAD, Y SU FRONTERA
-- ----------------------------------------------------------------------------
-- Aquí está la diferencia con la FAQ. Una respuesta es inmutable desde que
-- existe porque su borrador vive en otra tabla. Una versión de tutorial es
-- CANDIDATA primero —y entonces se le puede corregir el título— y se vuelve
-- inmutable al publicarse.
--
-- Lo que NUNCA se puede tocar, ni siquiera siendo candidata, es lo que
-- identifica sus bytes: la ruta, el resumen, el tamaño y el tipo reales. Si
-- eso se pudiera reescribir, la fila podría acabar describiendo un archivo
-- distinto del que hay, y la historia diría una mentira comprobable.
--
-- Es un disparador y no una política por lo de siempre: una política no frena
-- a `service_role`.
-- ============================================================================

create or replace function public.tutorial_version_is_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- Una candidata que nunca se publicó no es historia de nada, y hay que
    -- poder limpiarla. Lo publicado no se borra jamás.
    if old.effective_from is null then
      return old;
    end if;
    raise exception 'Una versión de tutorial publicada no se borra: se sucede con otra. Así se puede saber qué vídeo se veía en una fecha.';
  end if;

  -- Lo que identifica los bytes es intocable SIEMPRE, publicada o no.
  if new.tutorial_id is distinct from old.tutorial_id
     or new.version_number is distinct from old.version_number
     or new.bucket_id is distinct from old.bucket_id
     or new.object_path is distinct from old.object_path
     or new.created_at is distinct from old.created_at
     or new.uploaded_by is distinct from old.uploaded_by then
    raise exception 'La identidad de una versión de tutorial no se reescribe: el tutorial, el número, la ruta y quién la subió quedan fijos al reservarla.';
  end if;

  -- Y lo que el servidor leyó del objeto real solo se escribe UNA vez.
  if old.content_hash is not null and new.content_hash is distinct from old.content_hash then
    raise exception 'El resumen del archivo se calcula una vez, al verificarlo. Un resumen que cambia describe otro archivo.';
  end if;
  if old.real_size_bytes is not null and new.real_size_bytes is distinct from old.real_size_bytes then
    raise exception 'El tamaño real del archivo no se reescribe.';
  end if;
  if old.real_mime is not null and new.real_mime is distinct from old.real_mime then
    raise exception 'El tipo real del archivo no se reescribe.';
  end if;

  -- Publicada: lo editorial también queda fijo.
  if old.effective_from is not null then
    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.change_note is distinct from old.change_note
       or new.poster_path is distinct from old.poster_path
       or new.effective_from is distinct from old.effective_from
       or new.published_at is distinct from old.published_at
       or new.published_by is distinct from old.published_by
       or new.restored_from_version_id is distinct from old.restored_from_version_id
       or new.file_state is distinct from old.file_state then
      raise exception 'Una versión de tutorial publicada no se modifica. Para cambiar el vídeo o su texto se publica una versión nueva.';
    end if;

    -- Cerrar un periodo se hace una sola vez, y no se puede reabrir. Es lo que
    -- impide falsificar la cronología al reponer una versión antigua.
    if old.effective_to is not null and new.effective_to is distinct from old.effective_to then
      raise exception 'Ese periodo de vigencia ya estaba cerrado. Reponer un vídeo antiguo publica una versión NUEVA; no reabre la anterior.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.tutorial_version_is_immutable() from public, anon, authenticated;

create trigger t_tutorial_versions_immutable
  before update or delete on public.platform_tutorial_versions
  for each row execute function public.tutorial_version_is_immutable();


-- ============================================================================
-- 4 · QUIÉN VE QUÉ
-- ----------------------------------------------------------------------------
-- Superadministrador administra, soporte ve, y una persona normal NO lee estas
-- tablas: lee la vista de §5, que solo devuelve lo vigente.
--
-- La distinción de §40 se conserva: `support` VE, solo `superadmin` ESCRIBE.
-- ============================================================================

alter table public.platform_tutorials enable row level security;
alter table public.platform_tutorial_versions enable row level security;

revoke all on public.platform_tutorials from public, anon;
revoke all on public.platform_tutorial_versions from public, anon;
grant select on public.platform_tutorials to authenticated;
grant select on public.platform_tutorial_versions to authenticated;
grant insert, update, delete on public.platform_tutorials to authenticated;
grant insert, update, delete on public.platform_tutorial_versions to authenticated;

create policy platform_tutorials_staff_select on public.platform_tutorials
  for select using (public.is_platform_staff());
create policy platform_tutorials_superadmin_write on public.platform_tutorials
  for all using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

create policy tutorial_versions_staff_select on public.platform_tutorial_versions
  for select using (public.is_platform_staff());
create policy tutorial_versions_superadmin_write on public.platform_tutorial_versions
  for all using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());


-- ============================================================================
-- 5 · LO QUE LEE EL PRODUCTO
-- ----------------------------------------------------------------------------
-- Una sola vista, y solo lo VIGENTE. No es una comprobación añadida que
-- alguien pueda olvidar: es que la consulta no mira las otras versiones.
--
-- SIN `security_invoker`, a propósito, y por la misma razón que 0141: quien
-- consume un tutorial no pertenece a la plataforma, así que las políticas de
-- arriba le devolverían cero filas. El filtro está DENTRO de la vista, y es
-- que exista sesión.
--
-- NO expone la ruta del objeto. Firmar la reproducción es cosa del servidor
-- (§6): si la ruta viajara al navegador, la frontera dejaría de estar donde se
-- autoriza y pasaría a estar donde se adivina.
-- ============================================================================

create view public.v_tutorial_current as
select
  t.id                as tutorial_id,
  t.tutorial_type,
  t.page_key,
  t.module_key,
  t.title             as tutorial_title,
  v.id                as version_id,
  v.version_number,
  coalesce(v.title, t.title) as title,
  v.description,
  v.duration_seconds,
  v.real_mime         as mime_type,
  v.published_at
from public.platform_tutorials t
join public.platform_tutorial_versions v
  on v.tutorial_id = t.id
 and v.effective_from is not null
 and v.effective_to is null
where t.status = 'active'
  and auth.uid() is not null;

revoke all on public.v_tutorial_current from public, anon;
grant select on public.v_tutorial_current to authenticated;

comment on view public.v_tutorial_current is
  'PE-03B1 · Lo UNICO que el producto lee de un tutorial: la version vigente. Sin security_invoker (mismo patron que 0141): quien consume no pertenece a la plataforma. NO expone object_path: firmar la reproduccion es del servidor.';


-- ============================================================================
-- 6 · RESERVAR UNA SUBIDA
-- ----------------------------------------------------------------------------
-- Aquí está la frontera de seguridad de todo el tramo, y conviene decirla sin
-- adornos.
--
-- PE-03A comprobó —y 0099 lo tenía escrito desde antes— que una URL de subida
-- firmada AUTORIZA POR SÍ MISMA: funciona incluso desde un cliente anónimo, y
-- por tanto NO pasa por la política INSERT de `authenticated`.
--
-- Consecuencia que hay que aceptar en vez de disimular: **la política de
-- Storage no es lo que impide que alguien suba un tutorial**. Lo que lo impide
-- es que solo esta función emita la ruta que se va a firmar, y que esta
-- función exija ser superadministrador.
--
-- Por eso la reserva:
--   · exige `is_platform_superadmin()`;
--   · elige ELLA la ruta, con el id de la versión dentro, de modo que quien
--     llama no puede proponer dónde escribir;
--   · fija tamaño y tipo esperados, y caduca.
--
-- La política INSERT del cubo se escribe igual de restrictiva (§8), porque
-- cerrarla no rompe el flujo legítimo. Pero no se presenta como la barrera.
-- ============================================================================

create or replace function public.tutorial_reserve_upload(
  p_tutorial_id  uuid,
  p_filename     text,
  p_mime         text,
  p_size_bytes   bigint,
  p_ttl_seconds  integer default 900
)
returns table (version_id uuid, object_path text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tutorial record;
  v_id       uuid := gen_random_uuid();
  v_numero   integer;
  v_seguro   text;
  v_ruta     text;
  v_expira   timestamptz;
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma sube tutoriales.';
  end if;

  select * into v_tutorial from platform_tutorials where id = p_tutorial_id;
  if v_tutorial.id is null then raise exception 'Ese tutorial no existe.'; end if;
  if v_tutorial.status <> 'active' then
    raise exception 'Ese tutorial está retirado. Actívalo antes de subirle una versión.';
  end if;

  if p_mime not in ('video/mp4', 'video/webm') then
    raise exception 'Solo se admiten vídeos en formato MP4 o WebM.';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'El archivo parece vacío.';
  end if;
  if p_size_bytes > 200 * 1024 * 1024 then
    raise exception 'El vídeo supera el tamaño máximo permitido (200 MB).';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 3600 then
    raise exception 'El plazo de la reserva debe estar entre 1 y 60 minutos.';
  end if;

  -- El nombre se limpia y se usa solo para que quien mire el cubo entienda qué
  -- hay. Jamás decide dónde se escribe: eso lo deciden los dos primeros
  -- segmentos, que los pone esta función.
  v_seguro := lower(regexp_replace(coalesce(btrim(p_filename), 'video'),
                                   '[^a-zA-Z0-9._-]+', '-', 'g'));
  v_seguro := regexp_replace(v_seguro, '^[-.]+', '', 'g');
  if v_seguro = '' then v_seguro := 'video'; end if;
  v_seguro := left(v_seguro, 80);
  if v_seguro !~ '\.(mp4|webm)$' then
    v_seguro := v_seguro || case when p_mime = 'video/mp4' then '.mp4' else '.webm' end;
  end if;

  v_ruta := p_tutorial_id::text || '/' || v_id::text || '/' || v_seguro;
  v_expira := now() + make_interval(secs => p_ttl_seconds);

  select coalesce(max(vv.version_number), 0) + 1 into v_numero
    from platform_tutorial_versions vv where vv.tutorial_id = p_tutorial_id;

  insert into platform_tutorial_versions (
    id, tutorial_id, version_number, bucket_id, object_path,
    original_filename, declared_mime, declared_size_bytes,
    file_state, upload_expires_at, uploaded_by)
  values (
    v_id, p_tutorial_id, v_numero, 'tutorial-media', v_ruta,
    left(btrim(p_filename), 255), p_mime, p_size_bytes,
    'reserved', v_expira, auth.uid());

  return query select v_id, v_ruta, v_expira;
end;
$$;

revoke all on function public.tutorial_reserve_upload(uuid, text, text, bigint, integer)
  from public, anon;
grant execute on function public.tutorial_reserve_upload(uuid, text, text, bigint, integer)
  to authenticated;

comment on function public.tutorial_reserve_upload(uuid, text, text, bigint, integer) is
  'PE-03B1 · Reserva la ruta de una version ANTES de que el navegador escriba un byte. Es LA frontera de autorizacion del tramo: una URL de subida firmada autoriza por si misma y no pasa por la politica INSERT (0099), asi que lo que impide subir un tutorial es que solo esta funcion emita la ruta y exija superadmin.';


-- ============================================================================
-- 7 · FINALIZAR · lo declarado frente a lo real
-- ----------------------------------------------------------------------------
-- Storage vincula la ruta a una reserva; NO inspecciona el contenido. Es lo
-- que 0099 dejó escrito y sigue siendo verdad. Así que entre subir y publicar
-- hay un paso que lee el objeto REAL y compara.
--
-- Quien declara «10 MB de vídeo» y sube otra cosa no publica nada: la versión
-- se queda en `failed` y no hay forma de publicarla, porque el CHECK exige
-- `verified` para tener vigencia.
--
-- El servidor pasa lo que MIDIÓ, no lo que le dijeron. Que el navegador
-- calcule un resumen no lo convierte en prueba de integridad.
-- ============================================================================

create or replace function public.tutorial_finalize_upload(
  p_version_id   uuid,
  p_real_size    bigint,
  p_real_mime    text,
  p_content_hash text,
  p_duration_seconds integer default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma finaliza una subida.';
  end if;

  select * into v from platform_tutorial_versions where id = p_version_id;
  if v.id is null then raise exception 'Esa versión no existe.'; end if;
  if v.file_state = 'verified' then return 'verified'; end if;
  if v.file_state = 'failed' then return 'failed'; end if;

  -- POR QUÉ ESTO DEVUELVE UN ESTADO EN VEZ DE FALLAR
  --
  -- La primera versión de esta función marcaba la versión como fallida y
  -- LANZABA una excepción. No funcionaba, y el fallo es instructivo: la
  -- excepción deshace la transacción, así que la marca se perdía y la versión
  -- se quedaba en `uploaded` para siempre. Una prueba lo encontró.
  --
  -- Y arreglarlo no era buscar cómo persistir a pesar del error, sino ver que
  -- no es un error. Que un archivo subido no coincida con lo reservado es un
  -- RESULTADO —de un cliente roto, o de uno hostil—, no una excepción del
  -- sistema. Así que se registra y se devuelve.
  --
  -- Lo que sí sigue siendo excepción es no tener permiso o pedir una versión
  -- que no existe: eso son errores de quien llama.
  if p_real_size is null or p_real_mime is null or p_content_hash is null
     or p_real_size <> v.declared_size_bytes
     or p_real_mime <> v.declared_mime then
    update platform_tutorial_versions set file_state = 'failed' where id = p_version_id;
    return 'failed';
  end if;

  update platform_tutorial_versions
     set real_size_bytes  = p_real_size,
         real_mime        = p_real_mime,
         content_hash     = p_content_hash,
         duration_seconds = p_duration_seconds,
         file_state       = 'verified',
         verified_at      = now()
   where id = p_version_id;

  return 'verified';
end;
$$;

revoke all on function public.tutorial_finalize_upload(uuid, bigint, text, text, integer)
  from public, anon;
grant execute on function public.tutorial_finalize_upload(uuid, bigint, text, text, integer)
  to authenticated;

comment on function public.tutorial_finalize_upload(uuid, bigint, text, text, integer) is
  'PE-03B1 · Compara lo declarado al reservar con lo que el servidor MIDIO del objeto real. Devuelve el estado —verified o failed— en vez de lanzar: un archivo que no cuadra es un resultado, no una excepcion, y lanzar deshacia la marca de fallo con la propia transaccion.';


-- ============================================================================
-- 8 · PUBLICAR
-- ----------------------------------------------------------------------------
-- Subir NO publica. Es el punto que separa este diseño de «reemplazar el
-- vídeo», y es lo que permite previsualizar antes de que nadie lo vea.
--
-- Cierra la vigente, abre la nueva, y las enlaza. Como en
-- `legal_publish_document`: las tres cosas en una transacción, porque a mano
-- hay que acertar las tres cada vez.
-- ============================================================================

create or replace function public.tutorial_publish_version(
  p_version_id  uuid,
  p_change_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v        record;
  v_actual record;
  v_ahora  timestamptz := now();
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma publica tutoriales.';
  end if;

  select * into v from platform_tutorial_versions where id = p_version_id;
  if v.id is null then raise exception 'Esa versión no existe.'; end if;
  if v.effective_from is not null and v.effective_to is null then
    raise exception 'Esa versión ya está publicada.';
  end if;
  if v.effective_to is not null then
    raise exception 'Esa versión ya fue histórica. Para volver a usar su vídeo se publica una versión NUEVA que lo repone.';
  end if;
  if v.file_state <> 'verified' then
    raise exception 'Esa versión no se puede publicar: su archivo no está verificado.';
  end if;

  select * into v_actual
    from platform_tutorial_versions
   where tutorial_id = v.tutorial_id
     and effective_from is not null and effective_to is null;

  -- Cerrar antes de abrir: el índice único parcial no se puede diferir.
  if v_actual.id is not null then
    update platform_tutorial_versions
       set effective_to = v_ahora, superseded_by_version_id = p_version_id
     where id = v_actual.id;
  end if;

  update platform_tutorial_versions
     set effective_from = v_ahora,
         published_at   = v_ahora,
         published_by   = auth.uid(),
         change_note    = coalesce(p_change_note, change_note)
   where id = p_version_id;

  update platform_tutorials set status = 'active' where id = v.tutorial_id;

  return p_version_id;
end;
$$;

revoke all on function public.tutorial_publish_version(uuid, text) from public, anon;
grant execute on function public.tutorial_publish_version(uuid, text) to authenticated;


-- ============================================================================
-- 9 · RETIRAR
-- ----------------------------------------------------------------------------
-- Deja de verse. No borra nada: la versión queda con su periodo cerrado, y la
-- pantalla vuelve a decir que el tutorial está en actualización.
-- ============================================================================

create or replace function public.tutorial_unpublish(p_tutorial_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual record;
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma retira tutoriales.';
  end if;

  select * into v_actual
    from platform_tutorial_versions
   where tutorial_id = p_tutorial_id
     and effective_from is not null and effective_to is null;
  if v_actual.id is null then
    raise exception 'Ese tutorial no tiene ninguna versión publicada.';
  end if;

  update platform_tutorial_versions set effective_to = now() where id = v_actual.id;
end;
$$;

revoke all on function public.tutorial_unpublish(uuid) from public, anon;
grant execute on function public.tutorial_unpublish(uuid) to authenticated;


-- ============================================================================
-- 10 · REPONER UNA VERSIÓN ANTERIOR
-- ----------------------------------------------------------------------------
-- El encargo lo pide y prohíbe la vía fácil: no se reabre un periodo histórico.
--
-- Se crea una versión NUEVA que apunta AL MISMO OBJETO —seguro, porque nadie
-- sobrescribe nunca— y que guarda de cuál viene. La historia queda:
--
--     v1  mar–jun  archivo X
--     v2  jun–ago  archivo Y
--     v3  ago–hoy  archivo X, repuesto de la v1
--
-- Y no dice que el vídeo de marzo estuvo vigente hasta hoy con un hueco
-- imposible en medio.
--
-- LA EXCEPCIÓN AL CHECK DE LA RUTA, DICHA EN VOZ ALTA: la versión repuesta
-- comparte `object_path` con la original, así que su ruta NO contiene su
-- propio id. Es la única fila del sistema donde eso pasa, y es deliberado: si
-- copiara los bytes a una ruta nueva, dos objetos idénticos ocuparían el doble
-- sin que nadie gane nada. Por eso `object_path` deja de ser único y la
-- unicidad la garantiza el par (ruta, versión).
-- ============================================================================

alter table public.platform_tutorial_versions
  drop constraint platform_tutorial_versions_object_path_key;

alter table public.platform_tutorial_versions
  drop constraint tutorial_versions_path_check;

alter table public.platform_tutorial_versions
  add constraint tutorial_versions_path_check
    check (position('..' in object_path) = 0
           and split_part(object_path, '/', 1) = tutorial_id::text
           and split_part(object_path, '/', 3) <> '');

create or replace function public.tutorial_restore_version(
  p_version_id  uuid,
  p_change_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v       record;
  v_nueva uuid := gen_random_uuid();
  v_numero integer;
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma repone versiones.';
  end if;

  select * into v from platform_tutorial_versions where id = p_version_id;
  if v.id is null then raise exception 'Esa versión no existe.'; end if;
  if v.file_state <> 'verified' then
    raise exception 'Esa versión nunca llegó a tener un archivo verificado.';
  end if;

  select coalesce(max(vv.version_number), 0) + 1 into v_numero
    from platform_tutorial_versions vv where vv.tutorial_id = v.tutorial_id;

  insert into platform_tutorial_versions (
    id, tutorial_id, version_number, bucket_id, object_path,
    original_filename, declared_mime, declared_size_bytes,
    real_mime, real_size_bytes, content_hash, duration_seconds,
    file_state, upload_expires_at, verified_at,
    title, description, poster_path,
    restored_from_version_id, change_note, uploaded_by)
  values (
    v_nueva, v.tutorial_id, v_numero, v.bucket_id, v.object_path,
    v.original_filename, v.declared_mime, v.declared_size_bytes,
    v.real_mime, v.real_size_bytes, v.content_hash, v.duration_seconds,
    'verified', now(), now(),
    v.title, v.description, v.poster_path,
    p_version_id,
    coalesce(p_change_note, 'Repone el vídeo de la versión ' || v.version_number || '.'),
    auth.uid());

  return v_nueva;
end;
$$;

revoke all on function public.tutorial_restore_version(uuid, text) from public, anon;
grant execute on function public.tutorial_restore_version(uuid, text) to authenticated;


-- ============================================================================
-- 11 · EL CUBO
-- ----------------------------------------------------------------------------
-- Privado, y propio. No se reutiliza ninguno de los tres que hay: los tres
-- empiezan por `{organization_id}` y sus políticas operan sobre el primer
-- segmento de la ruta. Un tutorial no tiene empresa, así que meterlo ahí
-- obligaría a inventar un `organization_id` o a relajar políticas estrechas.
--
-- Mismo razonamiento que 0049 cuando separó el logo de empresa de las
-- evidencias: «un logo no es una evidencia técnica, no se mezclan».
--
-- Idempotente: `on conflict do nothing`. No se borra ni se recrea en un
-- replay, porque podría haber objetos referenciados por versiones publicadas.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tutorial-media', 'tutorial-media', false,
        200 * 1024 * 1024, array['video/mp4', 'video/webm'])
on conflict (id) do nothing;

-- Los otros tres cubos no declaran límites porque su tamaño depende del plan
-- de cada empresa. Aquí el tope es uno solo y es del producto, así que se
-- declara también en el cubo: una barrera más, en el sitio más difícil de
-- rodear.


-- ----------------------------------------------------------------------------
-- Las políticas del cubo
-- ----------------------------------------------------------------------------
-- Con la honestidad que exige §23 del encargo: estas políticas NO son lo que
-- protege la reproducción firmada ni la subida firmada. Una URL firmada
-- autoriza el objeto directamente y no las consulta.
--
-- Lo que sí hacen es cerrar todo lo demás: nadie navega el cubo, nadie escribe
-- sin reserva, nadie sobrescribe y nadie borra desde el cliente.
-- ----------------------------------------------------------------------------

-- Lectura directa: solo personal de plataforma. Todos los demás llegan por una
-- URL firmada que emite el servidor tras comprobar que la versión es vigente.
create policy tutorial_media_staff_select on storage.objects
  for select to authenticated
  using (bucket_id = 'tutorial-media' and public.is_platform_staff());

-- Escritura con sesión: solo si la ruta corresponde EXACTAMENTE a una reserva
-- vigente de una versión que aún no tiene archivo. Se cierra aunque el flujo
-- legítimo use URL firmada y no pase por aquí: cerrarla no rompe nada y
-- elimina la subida directa con SDK.
create or replace function public.tutorial_media_has_reservation(p_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from platform_tutorial_versions v
     where v.object_path = p_name
       and v.bucket_id = 'tutorial-media'
       and v.file_state in ('reserved', 'uploaded')
       and v.upload_expires_at > now()
  );
$$;

revoke all on function public.tutorial_media_has_reservation(text) from public, anon;
grant execute on function public.tutorial_media_has_reservation(text) to authenticated;

create policy tutorial_media_insert_reserved on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tutorial-media'
    and public.is_platform_superadmin()
    and public.tutorial_media_has_reservation(storage.objects.name)
  );

-- Sin política de UPDATE, a propósito: 0099 comprobó en vivo que sin ella un
-- `upsert` sobre un objeto existente es rechazado, y añadir una solo podría
-- ABRIR permisos. Un reemplazo es siempre un objeto nuevo.

-- Sin política de DELETE: la retirada física es server-only, por el mismo
-- camino que ya existe para los otros cubos. Nunca «DELETE directo →
-- referencia de dominio rota».

-- Y nada para `anon`.


-- ============================================================================
-- 12 · LA BIENVENIDA · su identidad, y nada más
-- ----------------------------------------------------------------------------
-- Se crea la identidad para que exista y sea única. Sin vídeo, sin preferencia
-- de persona y sin comportamiento: eso es B4.
--
-- Un tutorial sin versión publicada no se ve en ninguna parte —la vista de §5
-- solo devuelve versiones vigentes—, así que crear esta fila no muestra nada a
-- nadie.
-- ============================================================================

insert into public.platform_tutorials (tutorial_type, page_key, module_key, title)
values ('welcome', null, null, 'Bienvenida a Trazaloop')
on conflict do nothing;


-- ============================================================================
-- 13 · LA RUTA DE LO VIGENTE, Y SOLO DE LO VIGENTE
-- ----------------------------------------------------------------------------
-- Para firmar una reproducción hace falta la ruta del objeto, y una persona
-- normal no puede leer `platform_tutorial_versions`: sus políticas son de
-- plataforma. Esta función es el único sitio por donde sale una ruta hacia el
-- servidor, y solo devuelve la de una versión VIGENTE.
--
-- Devuelve NULL —no una excepción— para una candidata o una histórica: pedir la
-- ruta de una versión que no toca no es un error del sistema, es una petición
-- que no se atiende.
--
-- Y no acepta «dame la ruta de esta versión» sin más: comprueba que sea la
-- vigente de su tutorial. Sin eso, el identificador de una versión histórica
-- se convertiría en una llave.
-- ============================================================================

create or replace function public.tutorial_current_object_path(p_version_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select v.object_path
    from platform_tutorial_versions v
    join platform_tutorials t on t.id = v.tutorial_id
   where v.id = p_version_id
     and v.effective_from is not null
     and v.effective_to is null
     and v.file_state = 'verified'
     and t.status = 'active'
     and auth.uid() is not null;
$$;

revoke all on function public.tutorial_current_object_path(uuid) from public, anon;
grant execute on function public.tutorial_current_object_path(uuid) to authenticated;

comment on function public.tutorial_current_object_path(uuid) is
  'PE-03B1 · La ruta de una version, y solo si es la VIGENTE de su tutorial. Unico sitio por donde una ruta sale hacia el servidor. Devuelve NULL para una candidata o una historica: pedir lo que no toca no es un error, es algo que no se atiende.';


-- ----------------------------------------------------------------------------
-- Y la segunda barrera, en el propio almacenamiento
-- ----------------------------------------------------------------------------
-- Firmar una URL sobre un cubo privado exige permiso de lectura sobre el
-- objeto. Esta política se lo da a cualquiera con sesión, pero SOLO sobre
-- objetos que son la versión vigente de un tutorial activo.
--
-- Así hay dos barreras independientes y de naturaleza distinta: la función de
-- arriba decide qué ruta sale, y esta decide qué objeto se puede firmar. Un
-- error en una no abre la otra.
--
-- Lo que esta política NO hace, y conviene no confundirlo (§23 del encargo):
-- no protege la URL DESPUÉS de firmarla. Una URL firmada autoriza el objeto por
-- sí misma. Lo que la limita entonces es su caducidad, no esta política.
-- ----------------------------------------------------------------------------

-- POR QUÉ ESTO ES UNA FUNCIÓN Y NO UNA SUBCONSULTA DENTRO DE LA POLÍTICA
--
-- La primera versión llevaba el `exists (select … from platform_tutorial_versions …)`
-- escrito dentro del `using`. No funcionaba, y el motivo tardó en verse: esa
-- subconsulta se evalúa CON LA IDENTIDAD DE QUIEN PREGUNTA, así que la RLS de
-- `platform_tutorial_versions` —que solo deja leer a personal de plataforma—
-- le devolvía cero filas. Resultado: una persona normal no podía firmar el
-- vídeo vigente, y el error decía «Object not found».
--
-- Es el mismo mecanismo que 0141 documentó para las vistas de Intelligence:
-- una comprobación que se evalúa con permisos ajenos no comprueba lo que
-- parece. Se resuelve con una función `security definer`, igual que
-- `storage_object_matches_upload_intent` en 0101.

create or replace function public.tutorial_media_is_published(p_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from platform_tutorial_versions v
      join platform_tutorials t on t.id = v.tutorial_id
     where v.object_path = p_name
       and v.bucket_id = 'tutorial-media'
       and v.effective_from is not null
       and v.effective_to is null
       and v.file_state = 'verified'
       and t.status = 'active'
  );
$$;

revoke all on function public.tutorial_media_is_published(text) from public, anon;
grant execute on function public.tutorial_media_is_published(text) to authenticated;

comment on function public.tutorial_media_is_published(text) is
  'PE-03B1 · ¿Ese objeto es la version VIGENTE de un tutorial activo? Es security definer porque una subconsulta dentro de la politica se evaluaria con la identidad de quien pregunta, y la RLS de las versiones le devolveria cero filas.';

create policy tutorial_media_published_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tutorial-media'
    and public.tutorial_media_is_published(storage.objects.name)
  );
