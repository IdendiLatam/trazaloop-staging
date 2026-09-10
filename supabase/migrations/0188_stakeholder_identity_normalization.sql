-- ===========================================================================
-- Trazaloop · STABILIZATION-03 · Una identidad externa, un nombre
-- ===========================================================================
--
-- LO QUE SE MIDIÓ ANTES DE ESCRIBIR ESTO
--
-- En una organización se crearon, una detrás de otra y todas aceptadas:
--
--   «Empresa ABC»  «empresa abc»  «  Empresa ABC  »  «Empresa  ABC»  «Émpresa ABC»
--
-- Cinco filas para la misma empresa, y los espacios guardados tal cual. Lo
-- mismo con los colectivos. La causa es simple: NO HABÍA NINGUNA UNICIDAD SOBRE
-- EL NOMBRE. Lo único que existía era `(organization_id, lower(tax_id))`, y una
-- parte interesada legítima —una alcaldía, un ente regulador, una comunidad
-- vecina— no tiene identificador fiscal.
--
-- POR QUÉ NO SE USA `unaccent()`
--
-- Es lo primero que uno escribiría, y no vale. Dos razones comprobadas contra
-- este mismo stack, no supuestas:
--
--   1. La extensión NO ESTÁ INSTALADA (`select count(*) from pg_proc where
--      proname = 'unaccent'` → 0), y este tramo no es el sitio para meter una
--      extensión nueva en el camino crítico de una tabla de producto.
--   2. Aunque lo estuviera, `unaccent(text)` es STABLE, no IMMUTABLE: depende
--      de un diccionario que se puede cambiar. Postgres no la admite en un
--      índice de expresión, y envolverla en un `wrapper` marcado IMMUTABLE a
--      mano sería FIRMAR UNA MENTIRA: el índice quedaría desincronizado el día
--      que alguien tocara el diccionario.
--
-- Lo que sí se usa son cuatro funciones que el catálogo declara IMMUTABLE, y se
-- comprobó una por una (`provolatile = 'i'`): `btrim`, `regexp_replace`,
-- `lower` y `translate`. El mapa de caracteres es explícito y está aquí a la
-- vista, que además es más fácil de auditar que un diccionario externo.
--
-- Y AUN ASÍ EL ÍNDICE NO VA SOBRE LA EXPRESIÓN
--
-- Va sobre una COLUMNA ALMACENADA que mantiene un disparador. Dos motivos:
-- el valor queda a la vista para poder diagnosticar un choque sin recalcular
-- nada, y —lo que importa— quien escribe NO PUEDE ELEGIR SU PROPIA
-- NORMALIZACIÓN. El disparador la recalcula siempre desde el nombre y descarta
-- lo que venga en esa columna, así que no hay forma de colar dos identidades
-- que colisionan diciendo que no colisionan.
--
-- LA UNICIDAD NO SE LIMITA A LO ACTIVO
--
-- El nombre de una entidad retirada sigue siendo suyo. Si «Empresa ABC» está
-- retirada y alguien crea «empresa abc», lo correcto no es una segunda fila:
-- es decirle que existe y ofrecerle reactivarla. Por eso el índice no lleva
-- `where status = 'active'`.
--
-- PRODUCCIÓN. Aditiva y fail-closed: si encuentra dos identidades que ya
-- colisionan, ABORTA. No fusiona, no borra, no renombra y no elige por nadie
-- cuál sobrevive. Esa decisión es de quien conoce a esas dos empresas.

-- ---------------------------------------------------------------------------
-- 0 · PRECONDICIONES
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.quality_external_parties') is null
     or to_regclass('public.quality_stakeholder_groups') is null then
    raise exception '0188 presupone 0149';
  end if;
  raise notice '0188 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · LA NORMALIZACIÓN CANÓNICA
-- ---------------------------------------------------------------------------
--
-- Un solo sitio donde se decide qué significa «el mismo nombre», para que la
-- unicidad y la búsqueda no puedan discrepar. El orden importa: primero se
-- recortan los extremos y se colapsa el espacio interior, luego se baja a
-- minúsculas, y al final se quitan los acentos.
create or replace function public.quality_normalized_identity(p_texto text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_texto is null then null
    else translate(
           lower(regexp_replace(btrim(p_texto), '\s+', ' ', 'g')),
           'áàäâãåéèëêíìïîóòöôõúùüûñçýÿ',
           'aaaaaaeeeeiiiiooooouuuuncyy')
  end;
$$;

comment on function public.quality_normalized_identity(text) is
  'La identidad de un nombre a efectos de unicidad y de búsqueda: sin espacios '
  'de sobra, sin mayúsculas y sin acentos. IMMUTABLE de verdad: solo usa '
  'btrim, regexp_replace, lower y translate, las cuatro inmutables.';

revoke all on function public.quality_normalized_identity(text) from public, anon;
grant execute on function public.quality_normalized_identity(text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2 · FAIL-CLOSED · ¿hay ya identidades que colisionan?
-- ---------------------------------------------------------------------------
--
-- Se comprueba ANTES de tocar nada. Si las hay, la migración no continúa: no
-- existe una respuesta automática correcta a «cuál de estas dos empresas es la
-- buena», y elegir por sorteo sería peor que no aplicar.
do $$
declare
  v_partes int;
  v_grupos int;
  v_detalle text;
begin
  select count(*) into v_partes from (
    select organization_id, public.quality_normalized_identity(legal_name) as n
      from public.quality_external_parties
     group by 1, 2 having count(*) > 1) d;

  select count(*) into v_grupos from (
    select organization_id, public.quality_normalized_identity(name) as n
      from public.quality_stakeholder_groups
     group by 1, 2 having count(*) > 1) d;

  if v_partes > 0 or v_grupos > 0 then
    v_detalle := format('%s grupo(s) de partes externas y %s de colectivos',
                        v_partes, v_grupos);
    raise exception 'STAKEHOLDER_IDENTITY_DUPLICATES_PRESENT'
      using detail = v_detalle,
            hint = 'Ejecuta primero la lectura de preflight '
                || 'public.quality_identity_duplicates() y resuelve a mano cuál '
                || 'identidad se conserva. Esta migración no elige por nadie.';
  end if;

  raise notice '0188 · sin identidades en colisión';
end $$;

-- ---------------------------------------------------------------------------
-- 3 · LA COLUMNA, EL RELLENO Y EL DISPARADOR
-- ---------------------------------------------------------------------------
alter table public.quality_external_parties
  add column if not exists normalized_name text;
alter table public.quality_stakeholder_groups
  add column if not exists normalized_name text;

comment on column public.quality_external_parties.normalized_name is
  'Derivada de legal_name. La mantiene un disparador; nadie la escribe a mano.';
comment on column public.quality_stakeholder_groups.normalized_name is
  'Derivada de name. La mantiene un disparador; nadie la escribe a mano.';

-- El relleno. Es un backfill TÉCNICO de una columna nueva: no toca el nombre,
-- ni el estado, ni una sola relación.
update public.quality_external_parties
   set normalized_name = public.quality_normalized_identity(legal_name)
 where normalized_name is distinct from public.quality_normalized_identity(legal_name);

update public.quality_stakeholder_groups
   set normalized_name = public.quality_normalized_identity(name)
 where normalized_name is distinct from public.quality_normalized_identity(name);

create or replace function public.quality_external_party_normalize()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Se recalcula SIEMPRE y se descarta lo que traiga quien escribe: si se
  -- respetara un valor de fuera, cualquiera podría esquivar la unicidad
  -- mandando una normalización que no colisiona.
  new.normalized_name := public.quality_normalized_identity(new.legal_name);
  return new;
end $$;

create or replace function public.quality_stakeholder_group_normalize()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.normalized_name := public.quality_normalized_identity(new.name);
  return new;
end $$;

drop trigger if exists quality_external_party_normalize_trg
  on public.quality_external_parties;
create trigger quality_external_party_normalize_trg
  before insert or update on public.quality_external_parties
  for each row execute function public.quality_external_party_normalize();

drop trigger if exists quality_stakeholder_group_normalize_trg
  on public.quality_stakeholder_groups;
create trigger quality_stakeholder_group_normalize_trg
  before insert or update on public.quality_stakeholder_groups
  for each row execute function public.quality_stakeholder_group_normalize();

-- Con el relleno hecho y el disparador puesto, la columna ya no puede quedar
-- vacía nunca más.
alter table public.quality_external_parties
  alter column normalized_name set not null;
alter table public.quality_stakeholder_groups
  alter column normalized_name set not null;

-- ---------------------------------------------------------------------------
-- 4 · LA UNICIDAD
-- ---------------------------------------------------------------------------
--
-- Por organización, y SIN filtrar por estado: el nombre de una identidad
-- retirada sigue perteneciéndole. La del identificador fiscal se queda tal cual
-- estaba: son dos garantías distintas y ninguna sustituye a la otra.
create unique index if not exists quality_external_parties_org_name_uniq
  on public.quality_external_parties (organization_id, normalized_name);

create unique index if not exists quality_stakeholder_groups_org_name_uniq
  on public.quality_stakeholder_groups (organization_id, normalized_name);

-- Y para que la búsqueda por nombre no tenga que recorrer la tabla entera.
create index if not exists quality_external_parties_org_name_idx
  on public.quality_external_parties (organization_id, normalized_name text_pattern_ops);
create index if not exists quality_stakeholder_groups_org_name_idx
  on public.quality_stakeholder_groups (organization_id, normalized_name text_pattern_ops);

-- ---------------------------------------------------------------------------
-- 5 · EL PREFLIGHT, PARA MIRAR ANTES DE APLICAR EN OTRO SITIO
-- ---------------------------------------------------------------------------
--
-- Solo lectura y sin datos de nadie: identificadores técnicos, el nombre ya
-- normalizado y cuántas filas chocan. Ni razones sociales completas, ni
-- contactos, ni identificadores fiscales.
create or replace function public.quality_identity_duplicates()
returns table (
  entidad          text,
  organization_id  uuid,
  normalized_name  text,
  cuantas          bigint,
  ids              uuid[]
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select 'external_party'::text, p.organization_id,
         public.quality_normalized_identity(p.legal_name),
         count(*), array_agg(p.id order by p.created_at)
    from public.quality_external_parties p
   where public.is_platform_staff()
   group by 1, 2, 3 having count(*) > 1
  union all
  select 'stakeholder_group'::text, g.organization_id,
         public.quality_normalized_identity(g.name),
         count(*), array_agg(g.id order by g.created_at)
    from public.quality_stakeholder_groups g
   where public.is_platform_staff()
   group by 1, 2, 3 having count(*) > 1
   order by 1, 2, 3;
$$;

comment on function public.quality_identity_duplicates() is
  'Lectura de preflight: qué identidades colisionarían bajo la normalización '
  'canónica. Sin datos personales ni razones sociales.';

revoke all on function public.quality_identity_duplicates() from public, anon, authenticated;
grant execute on function public.quality_identity_duplicates() to service_role;

-- ---------------------------------------------------------------------------
-- 6 · RETIRAR Y REACTIVAR UNA IDENTIDAD EXTERNA
-- ---------------------------------------------------------------------------
--
-- La columna `status` existe desde 0149 y NADIE la escribía después del alta:
-- el archivado estaba construido y desconectado, y por eso la única salida
-- aparente era borrar. Aquí está la vía gobernada.
--
-- No borra historia. No toca análisis, ni fichas de proveedor o cliente, ni
-- alcances de auditoría: solo el estado de la identidad. Y es idempotente:
-- pedir el estado que ya tiene no escribe ni deja rastro.
create or replace function public.quality_set_external_party_status(
  p_organization_id uuid,
  p_party_id        uuid,
  p_status          text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_antes public.quality_external_parties%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_status not in ('active', 'inactive', 'retired') then
    raise exception 'EXTERNAL_PARTY_STATUS_INVALID' using detail = coalesce(p_status, '(nulo)');
  end if;
  -- La organización se comprueba contra la SESIÓN, no contra el parámetro: si
  -- bastara con mandar otro identificador, cualquiera retiraría las identidades
  -- de otra empresa.
  if not (public.is_org_member(p_organization_id) or public.is_platform_staff()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_antes from public.quality_external_parties
   where id = p_party_id and organization_id = p_organization_id
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_antes.status = p_status then
    return jsonb_build_object('outcome', 'unchanged', 'status', v_antes.status,
      'party_id', v_antes.id);
  end if;

  update public.quality_external_parties
     set status = p_status, updated_at = now()
   where id = p_party_id and organization_id = p_organization_id;

  return jsonb_build_object('outcome', 'changed', 'from', v_antes.status,
    'status', p_status, 'party_id', v_antes.id);
end $$;

revoke all on function public.quality_set_external_party_status(uuid, uuid, text)
  from public, anon;
grant execute on function public.quality_set_external_party_status(uuid, uuid, text)
  to authenticated, service_role;
