-- 0114_quality_relations_io_documents_and_map_edges.sql
-- Trazaloop Quality · QUALITY-01.2 · Relaciones entre procesos, documentos en
-- entradas/salidas y aristas del mapa.
--
-- ============================================================================
-- ALCANCE
-- ============================================================================
-- Tres carencias del modelo de QUALITY-01 que la segunda prueba humana dejo
-- en evidencia:
--
--  1. Un documento de TrazaDocs solo podia relacionarse con el PROCESO entero.
--     No habia forma de decir "esta ESPECIFICACION es la que define esta
--     ENTRADA" ni "este REGISTRO es la evidencia de esta SALIDA".
--
--  2. Una version PUBLICADA del mapa congelaba sus bloques (nodos) pero NO sus
--     conexiones: las relaciones se leian siempre de quality_process_interactions,
--     que es dato VIVO. Bastaba con que alguien borrara manana una interaccion
--     para que la version publicada de ayer dijera otra cosa. Un mapa publicado
--     que cambia retrospectivamente no sirve como evidencia de nada.
--
--  3. Al publicar una revision nueva de un proceso, sus entradas y salidas se
--     copian con identificadores NUEVOS, pero las interacciones seguian
--     apuntando a las filas de la revision anterior.
--
-- ============================================================================
-- DECISIONES
-- ============================================================================
-- D-1 · REUTILIZAR ANTES QUE CREAR. No se crean quality_input_documents ni
--   quality_output_documents. quality_process_documents (0112) YA es la
--   relacion transversal "algo de un proceso <-> documento de TrazaDocs"; se
--   EVOLUCIONA con una columna io_id opcional:
--       io_id NULL     -> el documento aplica al proceso entero (0112, intacto)
--       io_id NOT NULL -> el documento aplica a esa entrada o salida concreta
--   Una sola tabla sigue respondiendo "que documentos toca este proceso", que
--   es justo lo que necesita quien mantiene TrazaDocs antes de marcar un
--   documento obsoleto. No hay JSON opaco: la relacion es una fila con FK.
--
-- D-2 · LA RELACION SIGUE SIENDO UNA SOLA. quality_process_interactions (0112)
--   ya guarda source_process/source_output/target_process/target_input en UNA
--   fila leible desde ambos extremos. Esta migracion NO duplica nada: solo
--   corrige su unicidad, que antes impedia registrar dos flujos distintos
--   entre el mismo par de procesos si compartian el texto del item.
--
-- D-3 · AUTORRELACION (self-loop): se mantiene PROHIBIDA. La restriccion
--   quality_process_interactions_not_self de 0112 se conserva a proposito. Un
--   proceso que se entrega a si mismo no aporta informacion al mapa —el flujo
--   interno se describe en el Desarrollo de su revision— y en cambio produce
--   aristas que ninguna disposicion de mapa sabe dibujar. Es una decision del
--   modelo, no una limitacion de la interfaz.
--
-- D-4 · PROCESOS RETIRADOS: no se pueden crear relaciones NUEVAS que impliquen
--   un proceso retirado, pero las que ya existian se CONSERVAN. Retirar un
--   proceso no debe reescribir la historia de los mapas ya publicados.
--
-- D-5 · LAS ARISTAS PUBLICADAS SON UN SNAPSHOT, y lo escribe unicamente la RPC
--   de publicacion. quality_process_map_edges no tiene politica de INSERT,
--   UPDATE ni DELETE: ninguna sesion de cliente puede escribirla ni alterarla,
--   pase lo que pase con la capa de aplicacion. Un BORRADOR no usa esta tabla:
--   muestra las interacciones vivas, que es lo que se espera de un borrador.
--
-- ============================================================================
-- MIGRACIONES HISTORICAS
-- ============================================================================
-- Append-only. NO se modifica ningun archivo de 0001 a 0113. Lo que aqui se
-- altera son OBJETOS (una columna nueva, dos indices de unicidad y tres
-- funciones con CREATE OR REPLACE), nunca migraciones ya aplicadas.
--
-- ROLLBACK (documentado; NO ejecutar sin decision):
--   drop table if exists public.quality_process_map_edges cascade;
--   alter table public.quality_process_documents drop column if exists io_id;
--   -- y restaurar desde 0112 el cuerpo de quality_open_process_revision,
--   -- quality_publish_process_revision y quality_publish_map_version.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- §1 · Documentos de TrazaDocs en ENTRADAS y SALIDAS (D-1)
--
-- Se REFERENCIA un documento que ya existe; no se copia ni se duplica nada.
-- La FK compuesta contra quality_process_io lleva organization_id, asi que una
-- entrada de otra empresa es imposible de referenciar: lo impide el motor.
-- ----------------------------------------------------------------------------
alter table public.quality_process_documents
  add column if not exists io_id uuid;

alter table public.quality_process_documents
  add constraint quality_process_documents_io_fk
  foreign key (organization_id, io_id)
  references public.quality_process_io (organization_id, id)
  on delete cascade;

create index quality_process_documents_io_idx
  on public.quality_process_documents (io_id)
  where io_id is not null;

-- La unicidad de 0112 (process_id, document_id, relation_type) impediria
-- asociar el mismo documento a dos entradas distintas del mismo proceso, que
-- es un caso perfectamente normal (una ficha tecnica que define dos entradas).
-- Se sustituye por una que incluye el ambito. NULLS NOT DISTINCT hace que dos
-- filas "a nivel de proceso" (io_id nulo) sigan chocando entre si, que es lo
-- que 0112 queria.
create unique index quality_process_documents_scope_uniq
  on public.quality_process_documents (process_id, document_id, relation_type, io_id)
  nulls not distinct;

alter table public.quality_process_documents
  drop constraint quality_process_documents_uniq;

-- La entrada/salida referenciada tiene que ser de ESTE proceso. Sin esto se
-- podria colgar un documento de la entrada de un tercer proceso y la ficha
-- mentiria. Es el mismo criterio que quality_interaction_io_must_match.
create or replace function public.quality_process_document_io_must_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_pid uuid;
begin
  if new.io_id is not null then
    select process_id into v_pid from quality_process_io where id = new.io_id;
    if v_pid is distinct from new.process_id then
      raise exception 'La entrada o salida referenciada debe pertenecer a este proceso';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.quality_process_document_io_must_match() from public, anon, authenticated;

create trigger t_quality_process_documents_io_match
  before insert or update on public.quality_process_documents
  for each row execute function public.quality_process_document_io_must_match();

comment on column public.quality_process_documents.io_id is
  'QUALITY-01.2 · Ambito de la relacion documental: NULL = el proceso entero; con valor = esa entrada o salida concreta. No se crea ninguna tabla nueva de documentos.';


-- ----------------------------------------------------------------------------
-- §2 · Unicidad e invariantes de las relaciones entre procesos (D-2, D-4)
-- ----------------------------------------------------------------------------

-- 0112 declaraba unicos (origen, destino, item). Con la nueva experiencia el
-- usuario elige SALIDA y ENTRADA concretas, de modo que dos flujos reales
-- distintos entre el mismo par de procesos —"Materia prima aprobada -> Materia
-- prima" y "Devoluciones -> Producto no conforme"— son relaciones legitimas y
-- diferentes. La unicidad pasa a describir la relacion COMPLETA: sigue
-- impidiendo el duplicado EXACTO, que es lo que el encargo pide.
drop index if exists public.quality_process_interactions_pair_item_uniq;

create unique index quality_process_interactions_flow_uniq
  on public.quality_process_interactions
     (source_process_id, target_process_id, source_output_id, target_input_id,
      coalesce(lower(information_item), ''))
  nulls not distinct;

-- Un proceso retirado no recibe relaciones NUEVAS; las que ya tenia se
-- conservan intactas, porque son la respuesta a como fluia la organizacion
-- antes de retirarlo.
create or replace function public.quality_interaction_processes_must_be_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_source text; v_target text;
begin
  select status into v_source from quality_processes where id = new.source_process_id;
  select status into v_target from quality_processes where id = new.target_process_id;
  if v_source = 'retired' or v_target = 'retired' then
    raise exception 'No se registran relaciones nuevas con un proceso retirado';
  end if;
  return new;
end;
$$;

revoke all on function public.quality_interaction_processes_must_be_active() from public, anon, authenticated;

create trigger t_quality_process_interactions_not_retired
  before insert on public.quality_process_interactions
  for each row execute function public.quality_interaction_processes_must_be_active();


-- ----------------------------------------------------------------------------
-- §3 · Aristas del mapa: el SNAPSHOT de una version publicada (D-5)
--
-- Responde a "que relaciones mostraba la version publicada del mapa en la
-- fecha X" sin depender de que las interacciones vivas no hayan cambiado.
-- Guarda los NOMBRES de la salida y la entrada como texto: si manana se abre
-- una revision del proceso y se renombra su salida, la version publicada
-- sigue diciendo exactamente lo que decia el dia que se publico.
-- ----------------------------------------------------------------------------
create table public.quality_process_map_edges (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  map_version_id     uuid not null,
  /** La interaccion de la que salio, cuando aun existe. Solo trazabilidad: el
   *  snapshot NO depende de ella para poder dibujarse. */
  interaction_id     uuid,
  source_process_id  uuid not null,
  target_process_id  uuid not null,
  source_output_name text,
  target_input_name  text,
  information_item   text,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),

  constraint quality_process_map_edges_org_id_uniq unique (organization_id, id),
  constraint quality_process_map_edges_not_self check (source_process_id <> target_process_id),
  constraint quality_process_map_edges_version_fk
    foreign key (organization_id, map_version_id)
    references public.quality_process_map_versions (organization_id, id) on delete cascade,
  constraint quality_process_map_edges_source_fk
    foreign key (organization_id, source_process_id)
    references public.quality_processes (organization_id, id) on delete cascade,
  constraint quality_process_map_edges_target_fk
    foreign key (organization_id, target_process_id)
    references public.quality_processes (organization_id, id) on delete cascade,
  -- ON DELETE SET NULL sobre la COLUMNA, no sobre la clave entera: una FK
  -- compuesta anularia tambien organization_id, que es NOT NULL, y borrar una
  -- relacion fallaria con un error incomprensible. La empresa de la arista es
  -- la de la version del mapa y no cambia porque desaparezca la relacion.
  constraint quality_process_map_edges_interaction_fk
    foreign key (organization_id, interaction_id)
    references public.quality_process_interactions (organization_id, id)
    on delete set null (interaction_id)
);

create index quality_process_map_edges_version_idx
  on public.quality_process_map_edges (map_version_id, sort_order);
create index quality_process_map_edges_source_idx
  on public.quality_process_map_edges (source_process_id);
create index quality_process_map_edges_target_idx
  on public.quality_process_map_edges (target_process_id);

alter table public.quality_process_map_edges enable row level security;

-- SOLO LECTURA para cualquier cliente. No hay politica de INSERT, UPDATE ni
-- DELETE a proposito: el unico que escribe aqui es quality_publish_map_version,
-- que es SECURITY DEFINER. Asi la inmutabilidad del snapshot no depende de que
-- la aplicacion se porte bien.
create policy quality_process_map_edges_select on public.quality_process_map_edges
  for select to authenticated
  using (public.is_org_member(organization_id));

comment on table public.quality_process_map_edges is
  'QUALITY-01.2 · Snapshot de las relaciones que mostraba una version PUBLICADA del mapa. Lo escribe unicamente quality_publish_map_version; ninguna sesion de cliente puede insertarlo, modificarlo ni borrarlo.';


-- ----------------------------------------------------------------------------
-- §4 · Publicar el mapa CONGELA sus aristas
--
-- Mismo cuerpo que 0112 mas el snapshot, que se escribe ANTES de marcar la
-- version como publicada: si algo fallara, la transaccion entera se revierte y
-- no queda una version publicada sin conexiones.
--
-- Solo se congelan las relaciones cuyos DOS extremos estan en el mapa: una
-- flecha hacia un proceso que no aparece dibujado no se puede representar.
-- ----------------------------------------------------------------------------
create or replace function public.quality_publish_map_version(
  p_version_id uuid,
  p_effective_from date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid; v_ver record; v_from date; v_nodes integer;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'No autenticado'; end if;

  select * into v_ver from quality_process_map_versions where id = p_version_id for update;
  if v_ver.id is null then raise exception 'La version del mapa no existe'; end if;
  if not has_org_role(v_ver.organization_id, array['admin','quality']) then
    raise exception 'Solo un administrador o responsable de calidad puede publicar el mapa de procesos';
  end if;
  if v_ver.status <> 'draft' then raise exception 'Solo se publica una version en borrador'; end if;

  select count(*) into v_nodes from quality_process_map_nodes where map_version_id = p_version_id;
  if v_nodes = 0 then
    raise exception 'No se publica un mapa vacio: agrega al menos un proceso';
  end if;

  v_from := coalesce(p_effective_from, current_date);

  -- QUALITY-01.2 · Congelar las relaciones REALES tal como estan ahora.
  delete from quality_process_map_edges where map_version_id = p_version_id;

  insert into quality_process_map_edges
    (organization_id, map_version_id, interaction_id, source_process_id, target_process_id,
     source_output_name, target_input_name, information_item, sort_order)
  select
    v_ver.organization_id, p_version_id, i.id, i.source_process_id, i.target_process_id,
    so.name, ti.name, i.information_item, i.sort_order
  from quality_process_interactions i
  join quality_process_map_nodes ns
    on ns.map_version_id = p_version_id and ns.process_id = i.source_process_id
  join quality_process_map_nodes nt
    on nt.map_version_id = p_version_id and nt.process_id = i.target_process_id
  left join quality_process_io so on so.id = i.source_output_id
  left join quality_process_io ti on ti.id = i.target_input_id
  where i.organization_id = v_ver.organization_id;

  update quality_process_map_versions
     set status = 'superseded', effective_to = v_from
   where map_id = v_ver.map_id and status = 'published' and effective_to is null;

  update quality_process_map_versions
     set status = 'published', effective_from = v_from,
         published_at = now(), published_by = v_user
   where id = p_version_id;

  update quality_process_maps set current_version = v_ver.version_number where id = v_ver.map_id;

  return v_ver.version_number;
end;
$$;

revoke all on function public.quality_publish_map_version(uuid, date) from public, anon;
grant execute on function public.quality_publish_map_version(uuid, date) to authenticated;

comment on function public.quality_publish_map_version(uuid, date) is
  'QUALITY-01.2 · Publica la version del mapa y CONGELA en quality_process_map_edges las relaciones vigentes en ese momento, para que la version publicada no cambie retroactivamente.';


-- ----------------------------------------------------------------------------
-- §5 · Abrir una revision arrastra tambien los documentos de sus entradas y
--      salidas
--
-- 0112 copiaba las entradas y salidas de la revision vigente al borrador nuevo.
-- Ahora que una entrada puede tener documentos asociados, copiar la entrada sin
-- sus documentos equivaldria a perderlos en cada revision. El bucle explicito
-- existe porque hace falta saber a que fila NUEVA corresponde cada fila VIEJA,
-- y un INSERT ... SELECT no lo dice.
-- ----------------------------------------------------------------------------
create or replace function public.quality_open_process_revision(
  p_process_id uuid,
  p_change_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid; v_proc record; v_current record; v_new_id uuid; v_number integer;
  v_io record; v_new_io_id uuid;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'No autenticado'; end if;

  select * into v_proc from quality_processes where id = p_process_id for update;
  if v_proc.id is null then raise exception 'El proceso no existe'; end if;
  if not has_org_role(v_proc.organization_id, array['admin','quality','consultant']) then
    raise exception 'Tu rol no permite editar procesos';
  end if;

  select * into v_current from quality_process_revisions
   where process_id = p_process_id and status = 'draft';
  if v_current.id is not null then
    return v_current.id;  -- ya hay un borrador abierto: idempotente
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_number
    from quality_process_revisions where process_id = p_process_id;

  select * into v_current from quality_process_revisions
   where process_id = p_process_id and status = 'published' and effective_to is null;

  insert into quality_process_revisions
    (organization_id, process_id, revision_number, status, purpose, scope, change_note, created_by)
  values
    (v_proc.organization_id, p_process_id, v_number, 'draft',
     v_current.purpose, v_current.scope, p_change_note, v_user)
  returning id into v_new_id;

  -- Copiar entradas y salidas de la revision vigente, con sus documentos.
  if v_current.id is not null then
    for v_io in
      select * from quality_process_io where revision_id = v_current.id order by direction, sort_order
    loop
      insert into quality_process_io
        (organization_id, revision_id, process_id, direction, name, description, io_kind, sort_order, created_by)
      values
        (v_proc.organization_id, v_new_id, p_process_id, v_io.direction, v_io.name,
         v_io.description, v_io.io_kind, v_io.sort_order, v_user)
      returning id into v_new_io_id;

      insert into quality_process_documents
        (organization_id, process_id, document_id, relation_type, notes, io_id, created_by)
      select organization_id, process_id, document_id, relation_type, notes, v_new_io_id, v_user
        from quality_process_documents
       where io_id = v_io.id;
    end loop;
  end if;

  return v_new_id;
end;
$$;

revoke all on function public.quality_open_process_revision(uuid, text) from public, anon;
grant execute on function public.quality_open_process_revision(uuid, text) to authenticated;

comment on function public.quality_open_process_revision(uuid, text) is
  'QUALITY-01.2 · Abre el borrador copiando las entradas y salidas de la revision vigente Y los documentos asociados a cada una de ellas.';


-- ----------------------------------------------------------------------------
-- §6 · Publicar una revision reengancha sus relaciones a las entradas y
--      salidas VIGENTES
--
-- Las entradas y salidas pertenecen a la revision, de modo que publicar una
-- revision nueva crea filas nuevas. Sin este reenganche, la relacion "Compras
-- entrega Materia prima aprobada a Produccion" seguiria apuntando a la fila de
-- la revision antigua: la pantalla mostraria el nombre correcto por casualidad,
-- pero el modelo estaria describiendo un flujo que ya no es el vigente.
--
-- El emparejamiento es por direccion y nombre. Si la entrada o la salida
-- desaparecio o cambio de nombre en la revision nueva, la relacion se deja
-- COMO ESTA (apuntando a la fila historica) en vez de quedarse sin extremo:
-- perder el dato seria peor que conservar una referencia antigua, y la
-- pantalla lo sigue resolviendo.
-- ----------------------------------------------------------------------------
create or replace function public.quality_publish_process_revision(
  p_revision_id uuid,
  p_effective_from date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid; v_rev record; v_from date; v_prev_id uuid;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'No autenticado'; end if;

  select * into v_rev from quality_process_revisions where id = p_revision_id for update;
  if v_rev.id is null then raise exception 'La revision no existe'; end if;
  if not has_org_role(v_rev.organization_id, array['admin','quality']) then
    raise exception 'Solo un administrador o responsable de calidad puede publicar un proceso';
  end if;
  if v_rev.status <> 'draft' then raise exception 'Solo se publica una revision en borrador'; end if;

  v_from := coalesce(p_effective_from, current_date);

  select id into v_prev_id from quality_process_revisions
   where process_id = v_rev.process_id and status = 'published' and effective_to is null;

  -- Cerrar la vigente. El trigger de inmutabilidad permite exactamente esto.
  update quality_process_revisions
     set status = 'superseded', effective_to = v_from
   where process_id = v_rev.process_id and status = 'published' and effective_to is null;

  update quality_process_revisions
     set status = 'published', effective_from = v_from,
         published_at = now(), published_by = v_user
   where id = p_revision_id;

  update quality_processes
     set status = case when status = 'draft' then 'active' else status end,
         current_revision = v_rev.revision_number
   where id = v_rev.process_id;

  -- QUALITY-01.2 · Reenganchar las relaciones a las filas de la revision nueva.
  if v_prev_id is not null then
    update quality_process_interactions i
       set source_output_id = n.id
      from quality_process_io o
      join quality_process_io n
        on n.revision_id = p_revision_id
       and n.direction = o.direction
       and lower(n.name) = lower(o.name)
     where i.source_output_id = o.id
       and o.revision_id = v_prev_id;

    update quality_process_interactions i
       set target_input_id = n.id
      from quality_process_io o
      join quality_process_io n
        on n.revision_id = p_revision_id
       and n.direction = o.direction
       and lower(n.name) = lower(o.name)
     where i.target_input_id = o.id
       and o.revision_id = v_prev_id;
  end if;

  return v_rev.revision_number;
end;
$$;

revoke all on function public.quality_publish_process_revision(uuid, date) from public, anon;
grant execute on function public.quality_publish_process_revision(uuid, date) to authenticated;

comment on function public.quality_publish_process_revision(uuid, date) is
  'QUALITY-01.2 · Publica la revision y reengancha las relaciones entre procesos a las entradas y salidas de la revision recien publicada.';


-- ----------------------------------------------------------------------------
-- §7 · PRIVILEGIOS EXPLICITOS (convencion de 0111 · 0112 §12)
--
-- La tabla nueva declara los suyos. authenticated recibe SELECT y nada mas:
-- el snapshot lo escribe la RPC, que corre como propietario. Es una excepcion
-- deliberada al patron "select, insert, update, delete" del resto de Quality, y
-- la razon es justamente la que da sentido a la tabla.
-- ----------------------------------------------------------------------------
grant select on table public.quality_process_map_edges to authenticated;
grant select, insert, update, delete on table public.quality_process_map_edges to service_role;

-- El entorno concede Dxtm (truncate, references, trigger, maintain) a anon y
-- authenticated en CADA tabla nueva. TRUNCATE bypasea RLS, asi que se retira.
revoke truncate, references, trigger on table
  public.quality_process_map_edges
from anon, authenticated;

revoke all on table public.quality_process_map_edges from anon;
