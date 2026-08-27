-- ============================================================================
-- QUALITY-12.2A · LA GUÍA DE AUTORÍA, CANÓNICA Y CON HISTORIA
-- ----------------------------------------------------------------------------
-- Añade. No toca la 0132, la 0133, la 0134 ni la 0135, ni ninguna anterior.
--
-- QUÉ PROBLEMA RESUELVE
--
-- Los textos del botón «i» —250 de ellos, en 23 estructuras de CPR y Textiles—
-- viven hoy en `trazadoc_blueprint_sections.hint`, una columna que el
-- backoffice SOBRESCRIBE EN SITIO. Consecuencia: no se puede saber con qué guía
-- se redactó una sección hace un año, porque esa guía ya no existe en ninguna
-- parte.
--
-- Es exactamente el estándar que QUALITY-12 fijó para las instrucciones del
-- modelo —cada consulta guarda con qué plantilla y qué versión se respondió— y
-- que la guía de autoría todavía no cumplía.
--
-- LAS TRES PIEZAS
--
--   1 · IDENTIDAD      qué sección de qué estructura de qué módulo. Estable.
--   2 · REVISIONES     el texto, inmutable, con vigencia y sucesión.
--   3 · RESOLUCIÓN     la vigente hoy, o la que estaba vigente en una fecha.
--
-- IDENTIDAD ≠ REVISIÓN. La identidad no cambia nunca; el texto cambia creando
-- una revisión nueva y cerrando la anterior. Una revisión ya usada NO se puede
-- modificar: el trigger lo impide.
--
-- LO QUE ESTA MIGRACIÓN **NO** HACE
--
-- No llama a ningún proveedor de IA. No crea una segunda fuente de verdad: al
-- terminar, `hint` queda CONGELADO —un trigger impide que cambie— y deja de
-- ser autoridad. Se conserva su texto como residuo histórico, no como fuente.
--
-- LA GUÍA NO ES EVIDENCIA
--
-- «Indique el responsable de la actividad» dice QUÉ debe contener la sección.
-- NO dice quién es el responsable de esta empresa. Esa distinción es la razón
-- de que la clasificación normativa y el campo `do_not_invent` existan desde
-- el primer día, antes de que ningún modelo lea esto.
-- ============================================================================


-- ============================================================================
-- 1 · LA IDENTIDAD
-- ----------------------------------------------------------------------------
-- Se direcciona por lo que el descubrimiento demostró que YA es estable:
-- `(module_key, blueprint_code, section_key)`. Ni el título visible, ni el
-- idioma, ni la posición en pantalla entran en la identidad — las tres cosas
-- cambian sin que cambie de qué sección hablamos.
--
-- DOS ALCANCES, UN SOLO MOTOR
--
--   · `blueprint_section` — la guía de una sección de una estructura concreta.
--     Es lo que hay hoy en CPR y Textiles.
--   · `section_role` — la guía de un PAPEL de sección dentro de un módulo:
--     «objetivo», «alcance», «responsables». Sirve a los documentos que NO
--     nacen de una estructura, que es el caso de Quality.
--
-- Esto es lo que evita inventar 250 equivalentes para Quality: cuando una
-- sección no tiene guía propia, se resuelve la de su papel. Y si tampoco la
-- hay, no hay guía — que es una respuesta legítima.
-- ============================================================================

create table public.trazadoc_authoring_guidance (
  id              uuid primary key default gen_random_uuid(),

  scope           text not null,
  module_key      text not null,
  -- Null en el alcance por papel: ese es justamente su sentido.
  blueprint_code  text,
  section_key     text not null,

  -- Comodidad, no identidad: permite resolver desde una sección sin recomponer
  -- la terna. Si la estructura desaparece, la guía se va con ella.
  blueprint_section_id uuid references public.trazadoc_blueprint_sections (id)
    on delete cascade,

  status          text not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint trazadoc_authoring_guidance_scope_check
    check (scope in ('blueprint_section', 'section_role')),
  constraint trazadoc_authoring_guidance_status_check
    check (status in ('active', 'inactive')),
  constraint trazadoc_authoring_guidance_module_check
    check (module_key in ('cpr', 'textiles', 'quality')),
  constraint trazadoc_authoring_guidance_key_check
    check (section_key = lower(btrim(section_key)) and length(section_key) between 2 and 80),
  -- La forma de cada alcance, para que no exista una fila a medias.
  constraint trazadoc_authoring_guidance_shape_check
    check (
      (scope = 'blueprint_section'
        and blueprint_code is not null and blueprint_section_id is not null)
      or
      (scope = 'section_role'
        and blueprint_code is null and blueprint_section_id is null)
    ),
  -- `nulls not distinct`: sin esto, dos guías de papel para el mismo módulo y
  -- la misma clave no chocarían, porque en SQL null nunca es igual a null.
  constraint trazadoc_authoring_guidance_identity_uniq
    unique nulls not distinct (module_key, blueprint_code, section_key)
);

comment on table public.trazadoc_authoring_guidance is
  'QUALITY-12.2A · La IDENTIDAD de una guía de autoría: qué seccion, de que estructura, de que modulo. No cambia nunca. El texto vive en sus revisiones.';
comment on column public.trazadoc_authoring_guidance.scope is
  'blueprint_section = guia de una seccion de una estructura concreta. section_role = guia del PAPEL de la seccion dentro del modulo, para documentos que no nacen de una estructura (Quality).';

create index trazadoc_authoring_guidance_section_idx
  on public.trazadoc_authoring_guidance (blueprint_section_id);
create index trazadoc_authoring_guidance_role_idx
  on public.trazadoc_authoring_guidance (module_key, section_key)
  where scope = 'section_role';

create trigger t_trazadoc_authoring_guidance_updated
  before update on public.trazadoc_authoring_guidance
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 2 · LAS REVISIONES · INMUTABLES
-- ----------------------------------------------------------------------------
-- Mismo patrón de vigencia que las revisiones documentales de QUALITY-02:
-- `effective_from` y `effective_to`, con una sola abierta a la vez. Es lo que
-- permite preguntar «¿qué decía esta guía el 3 de marzo?» sin guardar una copia
-- por consulta.
--
-- LOS CAMPOS NUEVOS, Y POR QUÉ CADA UNO
--
--   · `guidance`   — lo que hoy es `hint`. La instrucción de redacción.
--   · `purpose`    — para qué existe la sección. `description` llevaba dos años
--                    vacío en las 250 filas; aquí tiene su sitio.
--   · `example`    — un ejemplo, marcado COMO ejemplo. Un ejemplo que no se
--                    distingue de un hecho es una invitación a copiarlo.
--   · `do_not_invent` — qué NO puede rellenar quien redacte, ni persona ni
--                    modelo. Es la barrera escrita junto al texto que la
--                    necesita, no en una politica lejana.
--   · `related_context_types` — qué fuentes autorizadas pediría una revisión
--                    contextual. Vacío hoy: se llenará cuando exista quien lo
--                    consuma, no antes.
--   · `normative_class` — cómo de cerca está este texto de inducir una
--                    afirmación de conformidad. Ver §17 del encargo.
--   · `content_hash` — huella del contenido. Permite demostrar paridad tras un
--                    traslado sin comparar 250 textos a ojo.
-- ============================================================================

create table public.trazadoc_authoring_guidance_revisions (
  id              uuid primary key default gen_random_uuid(),
  guidance_id     uuid not null references public.trazadoc_authoring_guidance (id)
    on delete cascade,
  revision_number integer not null,

  guidance        text not null,
  purpose         text,
  example         text,
  do_not_invent   text,
  related_context_types text[] not null default '{}'::text[],

  normative_class text not null default 'safe',
  content_hash    text not null,

  effective_from  timestamptz not null default now(),
  effective_to    timestamptz,
  superseded_by_revision_id uuid references public.trazadoc_authoring_guidance_revisions (id),

  change_note     text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),

  constraint trazadoc_guidance_revisions_number_check check (revision_number >= 1),
  constraint trazadoc_guidance_revisions_uniq unique (guidance_id, revision_number),
  constraint trazadoc_guidance_revisions_period_check
    check (effective_to is null or effective_to >= effective_from),
  constraint trazadoc_guidance_revisions_guidance_check
    check (length(btrim(guidance)) between 5 and 4000),
  -- §7 del encargo · la clasificación es una lista cerrada, no un campo libre.
  constraint trazadoc_guidance_revisions_normative_check
    check (normative_class in (
      'safe',                 -- no menciona normas ni esquemas
      'normative_reference',  -- los menciona, y los enmarca como referencia
      'conformity_risk',      -- podría inducir a afirmar cumplimiento
      'certification_risk',   -- podría inducir a afirmar certificación o sello
      'ambiguous'             -- se puede leer de las dos maneras
    ))
);

comment on table public.trazadoc_authoring_guidance_revisions is
  'QUALITY-12.2A · El TEXTO de una guía, inmutable. Cambiarlo crea una revision nueva y cierra la anterior: por eso se puede saber con que guia se redacto una seccion hace un año.';
comment on column public.trazadoc_authoring_guidance_revisions.do_not_invent is
  'QUALITY-12.2A · Lo que NO se puede rellenar sin dato autorizado. La guia dice QUE deberia contener la seccion; nunca afirma nada sobre esta empresa.';
comment on column public.trazadoc_authoring_guidance_revisions.normative_class is
  'QUALITY-12.2A · §17 · Cuanto se acerca este texto a inducir una afirmacion de conformidad o certificacion. Una reclasificacion es una revision nueva, no una edicion.';

-- Una sola revisión abierta por guía. Es lo que hace que «la vigente» sea una
-- pregunta con una sola respuesta.
create unique index trazadoc_guidance_revisions_vigente
  on public.trazadoc_authoring_guidance_revisions (guidance_id)
  where effective_to is null;

create index trazadoc_guidance_revisions_hist_idx
  on public.trazadoc_authoring_guidance_revisions (guidance_id, effective_from desc);


-- ----------------------------------------------------------------------------
-- La inmutabilidad, y su única excepción
-- ----------------------------------------------------------------------------
-- Una revisión publicada no se toca. Lo único que se le puede hacer es
-- CERRARLA —poner su fin de vigencia y quién la sucede— y solo una vez.
-- Sin esa excepción no habría forma de suceder una revisión; con más margen,
-- «inmutable» sería un adorno.
-- ----------------------------------------------------------------------------
create or replace function public.trazadoc_guidance_revision_is_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una revisión de guía no se borra: se sucede con otra. Así se puede saber con qué guía se redactó un documento antiguo.';
  end if;

  if new.guidance is distinct from old.guidance
     or new.purpose is distinct from old.purpose
     or new.example is distinct from old.example
     or new.do_not_invent is distinct from old.do_not_invent
     or new.related_context_types is distinct from old.related_context_types
     or new.normative_class is distinct from old.normative_class
     or new.content_hash is distinct from old.content_hash
     or new.revision_number is distinct from old.revision_number
     or new.guidance_id is distinct from old.guidance_id
     or new.effective_from is distinct from old.effective_from
     or new.created_at is distinct from old.created_at then
    raise exception 'Una revisión de guía publicada no se modifica. Para cambiar el texto se publica una revisión nueva.';
  end if;

  if old.effective_to is not null and new.effective_to is distinct from old.effective_to then
    raise exception 'Esa revisión de guía ya estaba cerrada.';
  end if;

  return new;
end;
$$;

create trigger t_trazadoc_guidance_revisions_immutable
  before update or delete on public.trazadoc_authoring_guidance_revisions
  for each row execute function public.trazadoc_guidance_revision_is_immutable();


-- ============================================================================
-- 3 · PUBLICAR UNA REVISIÓN
-- ----------------------------------------------------------------------------
-- La única puerta de escritura. Cierra la vigente, abre la siguiente y las
-- enlaza. Solo el superadministrador de plataforma: la guía es catálogo del
-- producto, no dato de una empresa.
-- ============================================================================

create or replace function public.trazadoc_publish_guidance(
  p_guidance_id   uuid,
  p_guidance      text,
  p_purpose       text default null,
  p_example       text default null,
  p_do_not_invent text default null,
  p_related_context_types text[] default '{}'::text[],
  p_normative_class text default 'safe',
  p_change_note   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g       record;
  v_actual  record;
  v_nuevo   uuid;
  v_numero  integer;
  v_hash    text;
  v_ahora   timestamptz := now();
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma publica guías de autoría.';
  end if;

  select * into v_g from trazadoc_authoring_guidance where id = p_guidance_id;
  if v_g.id is null then raise exception 'Esa guía no existe.'; end if;

  if length(btrim(coalesce(p_guidance, ''))) < 5 then
    raise exception 'Una guía necesita un texto.';
  end if;

  v_hash := encode(sha256(convert_to(
    coalesce(p_guidance, '') || E'\n' || coalesce(p_purpose, '') || E'\n'
    || coalesce(p_example, '') || E'\n' || coalesce(p_do_not_invent, ''), 'UTF8')), 'hex');

  select * into v_actual
    from trazadoc_authoring_guidance_revisions
   where guidance_id = p_guidance_id and effective_to is null;

  -- Publicar lo mismo otra vez no crea una revisión: una historia llena de
  -- revisiones idénticas no explica nada y ensucia la resolución histórica.
  if v_actual.id is not null and v_actual.content_hash = v_hash
     and v_actual.normative_class = p_normative_class then
    return v_actual.id;
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_numero
    from trazadoc_authoring_guidance_revisions where guidance_id = p_guidance_id;

  -- Cerrar la vigente ANTES de abrir la siguiente. Solo puede haber una
  -- abierta por guía —lo garantiza un índice único parcial— y ese índice no se
  -- puede diferir, así que el orden no es una preferencia de estilo: al revés,
  -- las dos estarían abiertas a la vez durante un instante y la inserción
  -- fallaría.
  if v_actual.id is not null then
    update trazadoc_authoring_guidance_revisions
       set effective_to = v_ahora
     where id = v_actual.id;
  end if;

  insert into trazadoc_authoring_guidance_revisions (
    guidance_id, revision_number, guidance, purpose, example, do_not_invent,
    related_context_types, normative_class, content_hash,
    effective_from, change_note, created_by)
  values (
    p_guidance_id, v_numero, btrim(p_guidance), p_purpose, p_example, p_do_not_invent,
    coalesce(p_related_context_types, '{}'::text[]), p_normative_class, v_hash,
    v_ahora, p_change_note, auth.uid())
  returning id into v_nuevo;

  -- Y ahora se enlaza. El freno de inmutabilidad lo permite porque el fin de
  -- vigencia no cambia: ya estaba puesto.
  if v_actual.id is not null then
    update trazadoc_authoring_guidance_revisions
       set superseded_by_revision_id = v_nuevo
     where id = v_actual.id;
  end if;

  return v_nuevo;
end;
$$;
revoke all on function public.trazadoc_publish_guidance(uuid, text, text, text, text, text[], text, text)
  from public, anon;
grant execute on function public.trazadoc_publish_guidance(uuid, text, text, text, text, text[], text, text)
  to authenticated;


-- ============================================================================
-- 4 · RESOLVER · la vigente, y la de una fecha
-- ----------------------------------------------------------------------------
-- POR QUÉ ES UNA FUNCIÓN Y NO UNA VISTA ABIERTA
--
-- Hasta hoy, el texto del botón «i» se protegía en la CAPA DE APLICACIÓN: en
-- Demo la página no lo serializaba. Pero la tabla era legible con la sesión de
-- cualquier miembro, así que un usuario en Demo podía leerla directamente
-- —por identificador, desde el navegador— y obtener lo que la pantalla le
-- negaba.
--
-- La regla comercial pasa a vivir DENTRO de la base: el contenido solo sale si
-- `resolve_organization_module_access` dice que ese módulo está en Full o
-- Extra para esa empresa. No hay identificador directo que lo esquive porque
-- las tablas dejan de ser legibles para los miembros.
--
-- Lo que sí devuelve siempre es `has_guidance`: la pantalla necesita saber que
-- HAY guía para poder ofrecer el aviso de Demo, exactamente como hoy. El aviso
-- se compone en la aplicación y no se guarda aquí.
--
-- DOS VOCABULARIOS QUE NO SON EL MISMO
--
-- `p_module_code` es el código COMERCIAL del módulo —el de `modules` y
-- `organization_modules`— y sirve para una sola cosa: comprobar el plan. La
-- guía se acota por la ESTRUCTURA, no por él.
--
-- Hace falta decirlo porque los dos vocabularios no coinciden: el módulo de
-- CPR se llama `traceability_6632` en el catálogo comercial y `cpr` en las
-- estructuras. Filtrar la guía por el código comercial no habría devuelto
-- nunca una fila de CPR, y el fallo se habría leído como «esta sección no
-- tiene guía».
-- ============================================================================

create or replace function public.trazadoc_guidance_as_of(
  p_organization_id uuid,
  p_module_code     text,
  p_blueprint_id    uuid,
  p_as_of           timestamptz default null
)
returns table (
  guidance_id       uuid,
  blueprint_section_id uuid,
  section_key       text,
  scope             text,
  has_guidance      boolean,
  restricted        boolean,
  revision_id       uuid,
  revision_number   integer,
  guidance          text,
  purpose           text,
  example           text,
  do_not_invent     text,
  related_context_types text[],
  normative_class   text,
  effective_from    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_acceso  jsonb;
  v_modo    text;
  v_permite boolean;
  v_corte   timestamptz := coalesce(p_as_of, now());
begin
  -- La plataforma ve el contenido real siempre: consulta, edición y vista
  -- previa del backoffice no dependen del plan de ninguna empresa.
  if is_platform_staff() then
    v_permite := true;
  else
    if not is_org_member(p_organization_id) then
      raise exception 'No perteneces a esta empresa.';
    end if;
    v_acceso := resolve_organization_module_access(p_organization_id, p_module_code);
    v_modo := v_acceso ->> 'access_mode';
    -- Fail-closed: sin acceso resoluble, se trata como Demo.
    v_permite := coalesce((v_acceso ->> 'allowed')::boolean, false)
                 and v_modo in ('full', 'extra');
  end if;

  return query
  select
    g.id,
    g.blueprint_section_id,
    g.section_key,
    g.scope,
    true                                            as has_guidance,
    (not v_permite)                                 as restricted,
    case when v_permite then r.id end               as revision_id,
    case when v_permite then r.revision_number end  as revision_number,
    case when v_permite then r.guidance end         as guidance,
    case when v_permite then r.purpose end          as purpose,
    case when v_permite then r.example end          as example,
    case when v_permite then r.do_not_invent end    as do_not_invent,
    case when v_permite then r.related_context_types end as related_context_types,
    case when v_permite then r.normative_class end  as normative_class,
    case when v_permite then r.effective_from end   as effective_from
  from trazadoc_authoring_guidance g
  join trazadoc_blueprint_sections s on s.id = g.blueprint_section_id
  join trazadoc_authoring_guidance_revisions r on r.guidance_id = g.id
  where g.status = 'active'
    -- La estructura acota la guía. El código comercial de arriba solo decidió
    -- si el texto sale o no.
    and s.blueprint_id = p_blueprint_id
    and r.effective_from <= v_corte
    and (r.effective_to is null or r.effective_to > v_corte);
end;
$$;
revoke all on function public.trazadoc_guidance_as_of(uuid, text, uuid, timestamptz) from public, anon;
grant execute on function public.trazadoc_guidance_as_of(uuid, text, uuid, timestamptz) to authenticated;

comment on function public.trazadoc_guidance_as_of(uuid, text, uuid, timestamptz) is
  'QUALITY-12.2A · La guía de las secciones de una estructura, vigente en una fecha (o ahora). Aplica la regla comercial DENTRO de la base: en Demo devuelve has_guidance sin una sola palabra del texto.';


-- La guía por PAPEL de sección: lo que servirá a los documentos que no nacen
-- de una estructura. Hoy no hay ninguna, y está bien: la infraestructura
-- existe, los textos se escribirán cuando alguien los escriba.
create or replace function public.trazadoc_guidance_for_section_role(
  p_organization_id uuid,
  -- El código COMERCIAL, para el plan.
  p_module_code     text,
  -- El module_key de la GUÍA, que es otro vocabulario (ver arriba).
  p_guidance_module text,
  p_section_keys    text[],
  p_as_of           timestamptz default null
)
returns table (
  guidance_id     uuid,
  section_key     text,
  has_guidance    boolean,
  restricted      boolean,
  revision_id     uuid,
  revision_number integer,
  guidance        text,
  purpose         text,
  example         text,
  do_not_invent   text,
  related_context_types text[],
  normative_class text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_acceso  jsonb;
  v_permite boolean;
  v_corte   timestamptz := coalesce(p_as_of, now());
begin
  if is_platform_staff() then
    v_permite := true;
  else
    if not is_org_member(p_organization_id) then
      raise exception 'No perteneces a esta empresa.';
    end if;
    v_acceso := resolve_organization_module_access(p_organization_id, p_module_code);
    v_permite := coalesce((v_acceso ->> 'allowed')::boolean, false)
                 and (v_acceso ->> 'access_mode') in ('full', 'extra');
  end if;

  return query
  select
    g.id, g.section_key,
    true as has_guidance,
    (not v_permite) as restricted,
    case when v_permite then r.id end,
    case when v_permite then r.revision_number end,
    case when v_permite then r.guidance end,
    case when v_permite then r.purpose end,
    case when v_permite then r.example end,
    case when v_permite then r.do_not_invent end,
    case when v_permite then r.related_context_types end,
    case when v_permite then r.normative_class end
  from trazadoc_authoring_guidance g
  join trazadoc_authoring_guidance_revisions r on r.guidance_id = g.id
  where g.status = 'active'
    and g.scope = 'section_role'
    and g.module_key = p_guidance_module
    and g.section_key = any(coalesce(p_section_keys, '{}'::text[]))
    and r.effective_from <= v_corte
    and (r.effective_to is null or r.effective_to > v_corte);
end;
$$;
revoke all on function public.trazadoc_guidance_for_section_role(uuid, text, text, text[], timestamptz) from public, anon;
grant execute on function public.trazadoc_guidance_for_section_role(uuid, text, text, text[], timestamptz) to authenticated;


-- Para el backoffice: la vigente de cada guía, con su identidad. Solo
-- plataforma la lee (la vista hereda la RLS de las tablas de abajo).
create or replace view public.v_trazadoc_authoring_guidance_current
with (security_invoker = true) as
select
  g.id            as guidance_id,
  g.scope, g.module_key, g.blueprint_code, g.section_key,
  g.blueprint_section_id, g.status,
  r.id            as revision_id,
  r.revision_number, r.guidance, r.purpose, r.example, r.do_not_invent,
  r.related_context_types, r.normative_class, r.content_hash,
  r.effective_from, r.change_note, r.created_at
from public.trazadoc_authoring_guidance g
join public.trazadoc_authoring_guidance_revisions r
  on r.guidance_id = g.id and r.effective_to is null;

comment on view public.v_trazadoc_authoring_guidance_current is
  'QUALITY-12.2A · La revision vigente de cada guia. Solo la administracion de plataforma la lee directamente: los miembros reciben el contenido por trazadoc_guidance_as_of, que aplica la regla comercial.';


-- ============================================================================
-- 5 · PERMISOS · denegar por omisión
-- ----------------------------------------------------------------------------
-- Los miembros NO leen estas tablas. Reciben el contenido por la función, que
-- comprueba el plan. Es la diferencia con `hint`, que cualquier miembro podía
-- leer por identificador aunque su empresa estuviera en Demo.
-- ============================================================================

alter table public.trazadoc_authoring_guidance           enable row level security;
alter table public.trazadoc_authoring_guidance_revisions enable row level security;

create policy trazadoc_authoring_guidance_select on public.trazadoc_authoring_guidance
  for select to authenticated using (is_platform_staff());
create policy trazadoc_authoring_guidance_write on public.trazadoc_authoring_guidance
  for all to authenticated
  using (is_platform_superadmin()) with check (is_platform_superadmin());

create policy trazadoc_guidance_revisions_select on public.trazadoc_authoring_guidance_revisions
  for select to authenticated using (is_platform_staff());

revoke all on table public.trazadoc_authoring_guidance           from anon, authenticated;
revoke all on table public.trazadoc_authoring_guidance_revisions from anon, authenticated;
grant select, insert, update on table public.trazadoc_authoring_guidance to authenticated;
-- Las revisiones son de SOLO LECTURA incluso para plataforma: se escriben por
-- la RPC, que es la que sabe cerrar la anterior y enlazarlas.
grant select on table public.trazadoc_authoring_guidance_revisions to authenticated;

revoke all on public.v_trazadoc_authoring_guidance_current from anon, authenticated;
grant select on public.v_trazadoc_authoring_guidance_current to authenticated;


-- ============================================================================
-- 6 · TRASLADO DE LOS 250
-- ----------------------------------------------------------------------------
-- Una identidad y una revisión 1 por cada sección que tenga hint. Sin perder
-- módulo, estructura, clave, título ni contenido — el texto se copia tal cual;
-- las correcciones normativas van DESPUÉS, como revisión 2, para que se vea
-- qué cambió y por qué.
--
-- `description` estaba vacío en las 250 filas: `purpose` nace vacío también.
-- No se inventa un propósito que nadie escribió.
-- ============================================================================

insert into public.trazadoc_authoring_guidance
  (scope, module_key, blueprint_code, section_key, blueprint_section_id, status)
select 'blueprint_section', b.module_key, b.code, s.section_key, s.id,
       case when s.status = 'active' then 'active' else 'inactive' end
  from public.trazadoc_blueprint_sections s
  join public.trazadoc_blueprints b on b.id = s.blueprint_id
 where coalesce(btrim(s.hint), '') <> ''
on conflict do nothing;

-- La clasificación normativa (§7) se decide AQUÍ, al escribir la revisión, no
-- con un `update` posterior: el trigger de inmutabilidad lo impediría, y hace
-- bien — clasificar después sería modificar una revisión ya publicada.
--
-- Reglas deterministas y revisables:
--   · menciona norma o esquema Y aclara que citar no es cumplir → referencia
--   · menciona norma o esquema y NO lo aclara                   → riesgo de conformidad
--   · no menciona ninguno                                       → seguro
--
-- No se fuerza ningún `certification_risk` ni `ambiguous`: el material actual
-- no los tiene, y una clasificación inflada es tan inútil como una ausente.
--
-- `do_not_invent` tampoco se inventa: se deriva de la clasificación. Donde hay
-- una norma citada, la prohibición es siempre la misma, y es la de §8.
insert into public.trazadoc_authoring_guidance_revisions
  (guidance_id, revision_number, guidance, purpose, normative_class,
   do_not_invent, content_hash, effective_from, change_note)
select
  g.id, 1, btrim(s.hint),
  nullif(btrim(coalesce(s.description, '')), ''),
  clase.valor,
  case when clase.valor <> 'safe' then
    'No afirmar que la empresa, el producto o el sistema cumple, está certificado, '
    || 'acreditado o verificado conforme a ninguna norma o esquema citado. La guía '
    || 'orienta la redacción; el cumplimiento solo puede afirmarse si existe un '
    || 'registro autorizado que lo respalde.'
  end,
  encode(sha256(convert_to(
    btrim(s.hint) || E'\n' || coalesce(nullif(btrim(coalesce(s.description, '')), ''), '')
    || E'\n' || '' || E'\n' || '', 'UTF8')), 'hex'),
  now(),
  'Traslado desde trazadoc_blueprint_sections.hint · QUALITY-12.2A'
from public.trazadoc_authoring_guidance g
join public.trazadoc_blueprint_sections s on s.id = g.blueprint_section_id
cross join lateral (
  select case
    when s.hint !~* '(ISO[[:space:]]+[0-9]|UNE-EN|\mGRS\M|\mRCS\M|\mGOTS\M|OCS/|\mOEKO|ESPR|\mGS1\M|\mNTC\M)'
      then 'safe'
    -- Enmarcar la norma COMO REFERENCIA ya es la aclaración: «como esquemas de
    -- referencia», «requiere soporte vinculado» o «no equivale a» dicen todos
    -- lo mismo —citar no es cumplir— con palabras distintas. Una regla que solo
    -- reconociera la negación explícita marcaría como riesgo textos que exigen
    -- evidencia, que es exactamente lo contrario del riesgo.
    when s.hint ~* '(no implica|no equivale|no promes|sin afirmar|referencias, no|no engañosa|sin evidencia|cumplimiento automático|como (esquema|esquemas|referencia|referencias)|(requiere|exige) soporte|soporte vinculado)'
      then 'normative_reference'
    -- «Vocabulario consistente con ISO 5157» habla de QUÉ PALABRAS usar, no de
    -- cumplir nada. Pero «consistente con» es justo la formulación que se lee
    -- de las dos maneras, así que se marca como ambigua: ni riesgo —el texto
    -- no induce a afirmar cumplimiento— ni referencia limpia.
    when s.hint ~* '(vocabulario|terminología|nomenclatura|nombres) [^.]*consistent'
      then 'ambiguous'
    else 'conformity_risk'
  end as valor
) as clase
where g.scope = 'blueprint_section'
on conflict do nothing;


-- ----------------------------------------------------------------------------
-- Las correcciones normativas · revisión 2 donde hace falta (§7, §8)
-- ----------------------------------------------------------------------------
-- Nueve textos de la familia «referencias técnicas» listan normas y esquemas
-- sin decir que citarlos no es cumplirlos. El décimo de la familia
-- —TXT-PRO-003— ya lo dice, y esa frase es la que se adopta para los otros
-- nueve: no se inventa una redacción nueva, se extiende la que el propio
-- material ya usaba.
--
-- Ningún texto sano se toca. Estas nueve correcciones quedan como revisión 2,
-- con la revisión 1 cerrada y consultable: es el mismo estándar de verdad
-- histórica que se le exige a todo lo demás.
-- ----------------------------------------------------------------------------
do $$
declare
  v_id    uuid;
  v_texto text;
  v_fila  record;
  v_cierre text := ' Los esquemas y normas citados son referencias de preparación documental: mencionarlos no equivale a cumplirlos ni a estar certificado.';
begin
  for v_fila in
    select g.id as guidance_id, r.guidance, r.purpose, r.do_not_invent
      from trazadoc_authoring_guidance g
      join trazadoc_authoring_guidance_revisions r
        on r.guidance_id = g.id and r.effective_to is null
     where g.section_key = 'referencias_tecnicas'
       -- Por FAMILIA, no por clasificación: una sección cuyo contenido es una
       -- lista de normas es el sitio donde una lectura apresurada —de una
       -- persona o de un modelo— convierte «referencia» en «cumplimiento».
       -- Se excluye la que ya lo dice, que es de donde sale la frase.
       and r.guidance !~* '(no promes|no equivale a cumplirlos|ninguna implica)'
  loop
    v_texto := btrim(v_fila.guidance) || v_cierre;

    -- Se escribe por la misma vía que usará el backoffice, saltando solo la
    -- comprobación de rol —aquí no hay sesión—: cerrar la vigente, abrir la
    -- siguiente y enlazarlas.
    update trazadoc_authoring_guidance_revisions
       set effective_to = now()
     where guidance_id = v_fila.guidance_id and effective_to is null;

    insert into trazadoc_authoring_guidance_revisions
      (guidance_id, revision_number, guidance, purpose, normative_class,
       do_not_invent, content_hash, effective_from, change_note)
    values (
      v_fila.guidance_id,
      (select max(revision_number) + 1 from trazadoc_authoring_guidance_revisions
        where guidance_id = v_fila.guidance_id),
      v_texto, v_fila.purpose, 'normative_reference', v_fila.do_not_invent,
      encode(sha256(convert_to(v_texto || E'\n' || coalesce(v_fila.purpose, '')
             || E'\n' || '' || E'\n' || '', 'UTF8')), 'hex'),
      now(),
      'QUALITY-12.2A · §8 · Se añade que citar una norma no equivale a cumplirla ni a estar certificado.')
    returning id into v_id;

    update trazadoc_authoring_guidance_revisions
       set superseded_by_revision_id = v_id
     where guidance_id = v_fila.guidance_id and revision_number = (
       select max(revision_number) - 1 from trazadoc_authoring_guidance_revisions
        where guidance_id = v_fila.guidance_id);
  end loop;
end $$;


-- ============================================================================
-- 7 · `hint` DEJA DE SER AUTORIDAD
-- ----------------------------------------------------------------------------
-- No se borra: su texto queda como residuo histórico y como red de seguridad
-- durante el traslado. Lo que se le quita es la capacidad de cambiar — con el
-- trigger, `hint` no puede volver a divergir de la guía canónica en silencio,
-- que es justo lo que §4 del encargo prohíbe.
--
-- Quien quiera cambiar una guía publica una revisión. No hay segunda puerta.
-- ============================================================================

create or replace function public.trazadoc_hint_is_frozen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.hint is distinct from old.hint then
    raise exception 'La columna hint quedó congelada en QUALITY-12.2A: la guía de autoría se cambia publicando una revisión (trazadoc_publish_guidance), que es lo que conserva la historia.';
  end if;
  return new;
end;
$$;

create trigger t_trazadoc_blueprint_sections_hint_frozen
  before update on public.trazadoc_blueprint_sections
  for each row execute function public.trazadoc_hint_is_frozen();

comment on column public.trazadoc_blueprint_sections.hint is
  'OBSOLETO desde QUALITY-12.2A. Congelado por trigger. La guia de autoria canonica vive en trazadoc_authoring_guidance + sus revisiones, y se lee por trazadoc_guidance_as_of. Esta columna se conserva como residuo historico y NO debe leerse.';
