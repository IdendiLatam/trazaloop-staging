-- ===========================================================================
-- Trazaloop · STABILIZATION-04 · Identidad, jerarquía e importación de cargos
-- ===========================================================================
--
-- TRES COSAS, Y LAS TRES SALIERON DE MEDIRLO, NO DE SUPONERLO
--
-- 1 · LA IDENTIDAD DE UN CARGO ESTÁ A MEDIO PROTEGER. Ya existe
--     `unique (organization_id, lower(name))`, así que «CARGO A» choca con
--     «Cargo A». Pero se ejecutó esto contra esta misma base:
--
--       insert «Cargo A»          → creado
--       insert «CARGO A»          → RECHAZADO
--       insert «  Cargo   A  »    → ACEPTADO      ← el mismo cargo, otra vez
--
--     Es el mismo defecto que STABILIZATION-03 cerró para las partes
--     interesadas, y la solución ya está escrita: `quality_normalized_identity`
--     de 0188. No se inventa otra normalización.
--
-- 2 · LA JERARQUÍA ADMITE CICLOS. También ejecutado:
--
--       A → A         → rechazado por `quality_positions_not_self_parent`
--       A → B → A     → ACEPTADO · la base no lo impide
--
--     Un organigrama con un ciclo no es un organigrama: al recorrerlo hacia
--     arriba nunca se llega a la cima. Y la protección NO puede vivir solo en
--     el importador, porque la jerarquía también se toca desde el alta manual y
--     desde `updatePositionStructure`. Va donde alcanza a todos: en un
--     disparador.
--
-- 3 · EL MARCO DE IMPORTACIÓN NO CONOCE LOS CARGOS. `import_jobs.entity` es un
--     vocabulario cerrado de diez valores. Se amplía por el mecanismo canónico
--     —la propia restricción—, sin crear un segundo marco.
--
-- Y UNA PRIMITIVA DE APLICACIÓN TRANSACCIONAL. El aplicador que ya existe
-- escribe fila a fila desde TypeScript, que es razonable para catálogos
-- sueltos. Para una ESTRUCTURA no lo es: media jerarquía importada es peor que
-- ninguna, porque nadie sabe dónde se quedó. Aquí el apply es una sola función,
-- y una sola función es una sola transacción.
--
-- PRODUCCIÓN. Aditiva y FAIL-CLOSED: si encuentra cargos que ya colisionan bajo
-- la normalización, aborta. No fusiona, no borra, no renombra y no elige por
-- nadie cuál sobrevive.

-- ---------------------------------------------------------------------------
-- 0 · PRECONDICIONES
-- ---------------------------------------------------------------------------
do $$
declare v_dup int;
begin
  if to_regclass('public.quality_positions') is null
     or to_regclass('public.import_jobs') is null
     or to_regclass('public.import_job_rows') is null then
    raise exception '0189 presupone 0123 y el marco de importación';
  end if;
  -- 0188 tiene que estar: de ahí sale la normalización que aquí se reutiliza.
  if to_regprocedure('public.quality_normalized_identity(text)') is null then
    raise exception '0189 presupone 0188';
  end if;

  select count(*) into v_dup from (
    select organization_id, public.quality_normalized_identity(name) as n
      from public.quality_positions group by 1, 2 having count(*) > 1) d;
  if v_dup > 0 then
    raise exception 'POSITION_IDENTITY_DUPLICATES_PRESENT'
      using detail = format('%s grupo(s) de cargos con la misma identidad', v_dup),
            hint = 'Ejecuta public.quality_position_duplicates() y resuelve a mano '
                || 'cuál se conserva. Esta migración no elige por nadie.';
  end if;

  raise notice '0189 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · LA IDENTIDAD DEL CARGO
-- ---------------------------------------------------------------------------
alter table public.quality_positions
  add column if not exists normalized_name text;

comment on column public.quality_positions.normalized_name is
  'Derivada de name con quality_normalized_identity. La mantiene un '
  'disparador; nadie la escribe a mano.';

update public.quality_positions
   set normalized_name = public.quality_normalized_identity(name)
 where normalized_name is distinct from public.quality_normalized_identity(name);

create or replace function public.quality_position_normalize()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Se recalcula SIEMPRE y se descarta lo que traiga quien escribe: respetar un
  -- valor de fuera permitiría esquivar la unicidad mandando una normalización
  -- que no colisiona.
  new.normalized_name := public.quality_normalized_identity(new.name);
  return new;
end $$;

drop trigger if exists quality_position_normalize_trg on public.quality_positions;
create trigger quality_position_normalize_trg
  before insert or update on public.quality_positions
  for each row execute function public.quality_position_normalize();

alter table public.quality_positions
  alter column normalized_name set not null;

-- Por organización, y sin filtrar por estado: un cargo inactivo sigue siendo
-- ese cargo, y su nombre le pertenece.
create unique index if not exists quality_positions_org_normalized_uniq
  on public.quality_positions (organization_id, normalized_name);

-- ---------------------------------------------------------------------------
-- 2 · LA JERARQUÍA NO PUEDE CERRARSE SOBRE SÍ MISMA
-- ---------------------------------------------------------------------------
--
-- El disparador vive en la TABLA, no en el importador, porque la jerarquía se
-- toca desde tres sitios: el alta manual, la edición de estructura y —a partir
-- de ahora— la importación. Protegerla en uno solo dejaría los otros dos
-- abiertos, y el defecto volvería por donde nadie mira.
--
-- Se recorre hacia arriba desde el padre propuesto. Si en ese camino aparece la
-- propia fila, hay ciclo. El tope de profundidad no es decoración: sin él, una
-- estructura ya corrupta colgaría el recorrido en vez de dar un error.
create or replace function public.quality_position_no_cycle()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_actual uuid := new.parent_position_id;
  v_pasos  int := 0;
  v_camino uuid[] := array[new.id];
begin
  if new.parent_position_id is null then
    return new;
  end if;
  if new.parent_position_id = new.id then
    raise exception 'POSITION_HIERARCHY_CYCLE'
      using detail = new.id::text,
            hint = 'Un cargo no puede ser su propio superior.';
  end if;

  while v_actual is not null loop
    if v_actual = any(v_camino) then
      raise exception 'POSITION_HIERARCHY_CYCLE'
        using detail = format('%s → %s', new.id, new.parent_position_id),
              hint = 'Esa relación cierra un ciclo: subiendo por los superiores '
                  || 'se vuelve al mismo cargo y nunca se llega a la cima.';
    end if;
    v_camino := v_camino || v_actual;
    v_pasos := v_pasos + 1;
    if v_pasos > 100 then
      raise exception 'POSITION_HIERARCHY_TOO_DEEP'
        using hint = 'Más de cien niveles de mando: hay algo mal en la estructura.';
    end if;
    select p.parent_position_id into v_actual
      from public.quality_positions p where p.id = v_actual;
  end loop;

  return new;
end $$;

drop trigger if exists quality_position_no_cycle_trg on public.quality_positions;
create trigger quality_position_no_cycle_trg
  before insert or update of parent_position_id on public.quality_positions
  for each row execute function public.quality_position_no_cycle();

-- ---------------------------------------------------------------------------
-- 3 · EL PREFLIGHT DE DUPLICADOS
-- ---------------------------------------------------------------------------
create or replace function public.quality_position_duplicates()
returns table (
  organization_id uuid,
  normalized_name text,
  cuantas         bigint,
  ids             uuid[]
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.organization_id, public.quality_normalized_identity(p.name),
         count(*), array_agg(p.id order by p.created_at)
    from public.quality_positions p
   where public.is_platform_staff()
   group by 1, 2 having count(*) > 1
   order by 1, 2;
$$;

comment on function public.quality_position_duplicates() is
  'Lectura de preflight: qué cargos colisionarían bajo la identidad canónica. '
  'Identificadores técnicos y nombre normalizado; ningún dato de persona.';

revoke all on function public.quality_position_duplicates() from public, anon, authenticated;
grant execute on function public.quality_position_duplicates() to service_role;

-- ---------------------------------------------------------------------------
-- 4 · EL MARCO DE IMPORTACIÓN APRENDE UNA ENTIDAD MÁS
-- ---------------------------------------------------------------------------
--
-- Ampliar una restricción de lista cerrada es seguro: todo lo que era válido
-- lo sigue siendo. No se crea un segundo marco ni una tabla paralela.
alter table public.import_jobs drop constraint if exists import_jobs_entity_check;
alter table public.import_jobs add constraint import_jobs_entity_check
  check (entity in ('suppliers', 'product_families', 'products', 'materials',
                    'input_batches', 'evidences', 'production_orders',
                    'batch_consumption', 'output_batches', 'batch_composition',
                    'positions'));

alter table public.import_job_rows drop constraint if exists import_job_rows_entity_type_check;
alter table public.import_job_rows add constraint import_job_rows_entity_type_check
  check (entity_type in ('supplier', 'material', 'evidence', 'product_family',
                         'product', 'input_batch', 'production_order',
                         'batch_consumption', 'output_batch', 'batch_composition',
                         'position'));

-- ---------------------------------------------------------------------------
-- 5 · APLICAR UNA IMPORTACIÓN DE CARGOS · TODO O NADA
-- ---------------------------------------------------------------------------
--
-- POR QUÉ ESTO ES UNA FUNCIÓN Y NO UN BUCLE EN TYPESCRIPT
--
-- El aplicador que ya existe escribe fila a fila desde el servidor de la
-- aplicación. Para un catálogo suelto es razonable: si la fila 40 falla, las 39
-- anteriores son buenas. Para una ESTRUCTURA no lo es. Media jerarquía
-- importada deja a la empresa con un organigrama que no es ni el viejo ni el
-- nuevo, y sin forma de saber dónde se cortó.
--
-- Una función es una transacción: o entran los cargos y sus relaciones, o no
-- entra ninguno. Y las restricciones de la tabla siguen siendo la autoridad
-- final: si entre la vista previa y la aplicación otra persona creó un cargo
-- equivalente, el índice único lo para y aquí se deshace todo.
--
-- DOS PASADAS, y no por gusto: los superiores se resuelven por un código que
-- puede aparecer en una fila POSTERIOR del archivo. Primero nacen todos los
-- cargos, después se atan. El orden del CSV deja de importar.
create or replace function public.quality_import_positions_apply(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_job    public.import_jobs%rowtype;
  v_fila   record;
  v_datos  jsonb;
  v_id     uuid;
  v_padre  uuid;
  v_creados int := 0;
  v_mapa   jsonb := '{}'::jsonb;
  v_codigo text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_job from public.import_jobs where id = p_job_id;
  if not found then
    return jsonb_build_object('outcome', 'job_not_found');
  end if;
  -- La organización sale del TRABAJO, y el trabajo se comprueba contra la
  -- sesión. Nunca del archivo.
  if not public.is_org_member(v_job.organization_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_job.entity <> 'positions' then
    return jsonb_build_object('outcome', 'entity_mismatch', 'entity', v_job.entity);
  end if;
  if v_job.status <> 'validated' then
    return jsonb_build_object('outcome', 'job_not_applicable', 'status', v_job.status);
  end if;

  -- PASADA 1 · nacen los cargos, sin superior todavía.
  for v_fila in
    select r.id, r.row_number, r.normalized_data
      from public.import_job_rows r
     where r.import_job_id = p_job_id
       and r.organization_id = v_job.organization_id
       and r.status in ('valid', 'warning')
     order by r.row_number
  loop
    v_datos := v_fila.normalized_data;
    insert into public.quality_positions (
      organization_id, name, code, description, org_unit, is_active)
    values (
      v_job.organization_id,
      v_datos->>'nombre_cargo',
      -- `codigo` es el código REAL del cargo, no un identificador de usar y
      -- tirar: la tabla ya tenía `code` con su propia unicidad por empresa, así
      -- que la plantilla lo usa para las dos cosas —persistirlo y resolver los
      -- superiores entre filas— en vez de inventar una segunda columna.
      nullif(btrim(coalesce(v_datos->>'codigo', '')), ''),
      nullif(btrim(coalesce(v_datos->>'descripcion', '')), ''),
      nullif(btrim(coalesce(v_datos->>'unidad', '')), ''),
      true)
    returning id into v_id;

    v_codigo := lower(btrim(coalesce(v_datos->>'codigo', '')));
    if v_codigo <> '' then
      v_mapa := v_mapa || jsonb_build_object(v_codigo, v_id::text);
    end if;

    update public.import_job_rows
       set status = 'imported', created_entity_id = v_id, updated_at = now()
     where id = v_fila.id;
    v_creados := v_creados + 1;
  end loop;

  -- PASADA 2 · se atan los superiores. El disparador de ciclos vigila cada
  -- enlace: si el archivo trae uno, esto aborta y no queda nada.
  for v_fila in
    select r.id, r.row_number, r.normalized_data, r.created_entity_id
      from public.import_job_rows r
     where r.import_job_id = p_job_id
       and r.organization_id = v_job.organization_id
       and r.status = 'imported'
       and coalesce(btrim(r.normalized_data->>'cargo_superior'), '') <> ''
     order by r.row_number
  loop
    v_codigo := lower(btrim(v_fila.normalized_data->>'cargo_superior'));
    v_padre := nullif(v_mapa->>v_codigo, '')::uuid;
    if v_padre is null then
      raise exception 'POSITION_PARENT_UNRESOLVED'
        using detail = format('fila %s · superior «%s»', v_fila.row_number, v_codigo),
              hint = 'El código del cargo superior no está en el archivo.';
    end if;
    update public.quality_positions
       set parent_position_id = v_padre
     where id = v_fila.created_entity_id
       and organization_id = v_job.organization_id;
  end loop;

  update public.import_jobs
     set status = 'committed', inserted_rows = v_creados
   where id = p_job_id;

  return jsonb_build_object('outcome', 'committed', 'created', v_creados);
end $$;

revoke all on function public.quality_import_positions_apply(uuid) from public, anon;
grant execute on function public.quality_import_positions_apply(uuid)
  to authenticated, service_role;
