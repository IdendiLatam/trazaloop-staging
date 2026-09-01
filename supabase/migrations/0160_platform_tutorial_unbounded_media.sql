-- ============================================================================
-- Trazaloop · PE-03B3 · TRAZALOOP DEJA DE PONERLE UN TOPE AL VÍDEO
-- ----------------------------------------------------------------------------
-- La dirección del producto revocó el límite de 200 MB por archivo y el de
-- duración. No se sustituyen por otro número: se retiran.
--
-- 0159 no se toca. Es inmutable y está aplicada.
--
--
-- LO QUE ERA EL TOPE, Y LO QUE QUEDA
--
-- El de 200 MB era una decisión DE PRODUCTO, tomada cuando se suponía que un
-- tutorial dura tres minutos. Se retira de los cuatro sitios donde vivía: los
-- dos CHECK de esta tabla, la función de reserva y el propio cubo.
--
-- Lo que queda es el techo del PROVEEDOR, que es otra cosa y conviene no
-- confundirla:
--
--   · subida estándar → el `file_size_limit` GLOBAL del proyecto, que se
--     configura en el panel de Supabase y no se ve desde la base. En el stack
--     local son 50 MiB (`supabase/config.toml`).
--   · subida reanudable (TUS) → `tus-max-size`, que el propio servicio anuncia:
--     **50 GB** en el stack local.
--
-- Ninguno de los dos es un límite de Trazaloop, y ninguno se documenta como si
-- lo fuera.
--
--
-- LA CADUCIDAD DE LA RESERVA DEJA DE SER UN PLAZO DE SUBIDA
--
-- Es el cambio menos visible y el que más importa. Quitar el tope de tamaño sin
-- tocar esto habría dejado un máximo escondido: un vídeo de dos horas por una
-- red lenta tarda más de quince minutos, y la política de Storage exigía
-- `upload_expires_at > now()` para dejar escribir. El archivo habría dejado de
-- poder subirse a mitad, por reloj.
--
-- Ahora `upload_expires_at` es un HORIZONTE DE LIMPIEZA —a partir de cuándo una
-- reserva abandonada se puede recoger— y no una condición de autorización. Lo
-- que autoriza sigue siendo lo de siempre: ser superadministrador y que la ruta
-- corresponda a una reserva que aún no se ha verificado.
-- ============================================================================


-- ============================================================================
-- 1 · LOS DOS CHECK DE TAMAÑO
-- ----------------------------------------------------------------------------
-- Se conserva `> 0`: un archivo vacío sigue sin ser un vídeo. Lo que se retira
-- es el techo.
-- ============================================================================

alter table public.platform_tutorial_versions
  drop constraint tutorial_versions_size_check;

alter table public.platform_tutorial_versions
  add constraint tutorial_versions_size_check
    check (declared_size_bytes > 0);

alter table public.platform_tutorial_versions
  drop constraint tutorial_versions_real_size_check;

alter table public.platform_tutorial_versions
  add constraint tutorial_versions_real_size_check
    check (real_size_bytes is null or real_size_bytes > 0);

comment on column public.platform_tutorial_versions.declared_size_bytes is
  'PE-03B3 · El tamaño que declara quien sube. Trazaloop NO le pone techo: el unico limite es el del proveedor de almacenamiento, que es otra cosa y no se presenta como una regla del producto.';


-- ============================================================================
-- 2 · LA RESERVA
-- ----------------------------------------------------------------------------
-- Sin tope de tamaño, y con un plazo que ya no es un plazo de subida.
--
-- El plazo por omisión sube a 24 horas porque ahora significa otra cosa: hasta
-- cuándo se considera viva una reserva antes de darla por abandonada. No es
-- «cuánto tiempo tienes para subir»: la política de §3 ya no lo mira.
-- ============================================================================

create or replace function public.tutorial_reserve_upload(
  p_tutorial_id  uuid,
  p_filename     text,
  p_mime         text,
  p_size_bytes   bigint,
  p_ttl_seconds  integer default 86400
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

  -- Vacío sigue sin ser un vídeo. Y no hay techo: PE-03B3 retiró el de 200 MB
  -- por decisión del producto, y no se sustituye por otro número.
  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'El archivo parece vacío.';
  end if;

  -- Entre una hora y una semana. No es cuánto se puede tardar en subir —eso ya
  -- no se comprueba— sino cuándo una reserva abandonada se puede recoger.
  if p_ttl_seconds is null or p_ttl_seconds < 3600 or p_ttl_seconds > 604800 then
    raise exception 'El horizonte de la reserva debe estar entre 1 hora y 7 días.';
  end if;

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
  'PE-03B3 · Reserva la ruta de una version antes de subir. SIN tope de tamano: Trazaloop no le pone ninguno. El plazo NO es cuanto se puede tardar en subir —la politica del cubo ya no lo mira— sino cuando una reserva abandonada se puede recoger.';

comment on column public.platform_tutorial_versions.upload_expires_at is
  'PE-03B3 · HORIZONTE DE LIMPIEZA, no plazo de subida. Antes la politica de Storage exigia que no hubiera vencido, y eso convertia el plazo en un maximo escondido de duracion de subida: un video grande por una red lenta dejaba de poder subirse a mitad, por reloj.';


-- ============================================================================
-- 3 · LA POLÍTICA DE ESCRITURA DEL CUBO
-- ----------------------------------------------------------------------------
-- Deja de mirar el reloj. Lo que autoriza sigue siendo lo mismo: que exista una
-- reserva para esa ruta exacta y que todavía no se haya verificado.
--
-- Una vez verificada, `file_state = 'verified'` y la política deja de casar: la
-- ruta se cierra sola, que es lo que de verdad la protegía.
-- ============================================================================

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
  );
$$;

revoke all on function public.tutorial_media_has_reservation(text) from public, anon;
grant execute on function public.tutorial_media_has_reservation(text) to authenticated;

comment on function public.tutorial_media_has_reservation(text) is
  'PE-03B3 · ¿Esa ruta tiene una reserva sin verificar? Ya NO mira `upload_expires_at`: hacerlo convertia el plazo de la reserva en un maximo escondido de duracion de subida. Lo que cierra la ruta es verificarla, no el reloj.';


-- ============================================================================
-- 4 · EL CUBO
-- ----------------------------------------------------------------------------
-- Trazaloop deja de imponer un tamaño por cubo. `file_size_limit = null` es la
-- forma que tiene Supabase de decir «este cubo no añade un límite propio»: se
-- aplica entonces el global del proyecto, que es del proveedor.
--
-- Los otros tres cubos ya estaban así. El de tutoriales era el único que
-- declaraba uno, y lo declaraba porque el producto tenía una regla. Ya no.
--
-- Los formatos SÍ se conservan: no son un tope, son lo que un navegador puede
-- reproducir.
-- ============================================================================

update storage.buckets
   set file_size_limit = null
 where id = 'tutorial-media';


-- ============================================================================
-- 5 · LA DURACIÓN
-- ----------------------------------------------------------------------------
-- No había ninguna comprobación de duración que retirar, y esta migración no
-- añade ninguna. Se deja escrito para que nadie la añada creyendo que falta.
--
-- `duration_seconds` sigue siendo informativa y sigue pudiendo ser nula. Una
-- duración que no se pudo leer se guarda nula; jamás se inventa, y jamás decide
-- si algo se publica.
-- ============================================================================

comment on column public.platform_tutorial_versions.duration_seconds is
  'PE-03B3 · Informativa y opcional. NUNCA decide si una version se puede publicar: Trazaloop no pone un maximo de duracion. Nula si no se pudo leer — una duracion inventada se muestra junto al video y la gente la cree.';
