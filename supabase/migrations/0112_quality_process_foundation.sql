-- 0112_quality_process_foundation.sql
-- Trazaloop Quality · QUALITY-01 · Fundación de Cargos y Gestión por Procesos.
--
-- ============================================================================
-- ALCANCE
-- ============================================================================
-- Primer vertical funcional de Trazaloop Quality: cargos, procesos con
-- revisiones, entradas/salidas, interacciones, mapa de procesos versionado y
-- relacion con documentos existentes de TrazaDocs.
--
-- NO incluye (deliberadamente aplazado): competencias, evaluaciones,
-- formacion, conocimiento, indicadores, riesgos, casos, acciones, auditorias,
-- revision por la direccion, automatizacion ni IA.
--
-- ============================================================================
-- DECISIONES TRANSVERSALES APLICADAS
-- ============================================================================
-- T-01 · VIGENCIA DE NEGOCIO. El patron identidad + revision inmutable se
--   aplica SOLO donde hay semantica real de vigencia: procesos (revisiones) y
--   mapas (versiones), mas las asignaciones de cargo. Las tablas de catalogo y
--   de relacion NO llevan effective_from/effective_to: no lo necesitan y
--   añadirlo seria ruido. created_at/updated_at no sustituyen la vigencia.
--
-- T-02 · CARGO. quality_processes.owner_position_id apunta a un CARGO, jamas a
--   un usuario. Cambiar la persona que ocupa el cargo no toca el proceso.
--   quality_position_assignments resuelve quien lo ocupa y desde/hasta cuando.
--   LIMITACION CONOCIDA Y ACEPTADA EN ESTE CORTE: la asignacion referencia
--   public.profiles (identidad de plataforma) porque el dominio de Personas de
--   Quality (PC-05: Persona != Usuario) no entra en QUALITY-01. Cuando exista
--   quality_people, la asignacion migrara a el de forma aditiva.
--
-- T-03 · EVIDENCIA. Esta migracion NO crea ningun motor de evidencia. El
--   vinculo documental reutiliza trazadoc_documents por REFERENCIA, sin copiar
--   el documento ni duplicar su contenido.
--
-- T-04 · HISTORICO. audit_log sigue siendo el audit trail TECNICO y se adjunta
--   como en el resto del proyecto. El historico EMPRESARIAL de Quality vive en
--   las revisiones y versiones, no en audit_log.
--
-- ============================================================================
-- CONVENCIONES DEL REPOSITORIO RESPETADAS
-- ============================================================================
--  · organization_id explicito en toda tabla tenant-owned.
--  · unique (organization_id, id) para habilitar FK COMPUESTAS.
--  · FK compuesta (organization_id, padre_id) -> padre(organization_id, id):
--    una fila hija NUNCA puede apuntar a un padre de otra empresa. Lo impide
--    el motor, no la aplicacion.
--  · prevent_organization_id_change / force_created_by / set_updated_at /
--    audit_row_change adjuntados como en el resto del proyecto.
--  · RLS deny-by-default: sin politica que conceda, no hay acceso.
--  · PRIVILEGIOS EXPLICITOS (leccion de Q0/0111): cada tabla declara sus GRANT.
--    NO se depende del bootstrap de Supabase y NO se usa ALTER DEFAULT
--    PRIVILEGES. Sin esto, un proyecto nuevo nace inservible.
--
-- ROLES (los tres existentes; no se crean roles nuevos):
--   · admin / quality      -> administran cargos, publican procesos y mapas
--   · consultant           -> crea y edita BORRADORES, nunca publica
--   · cualquier miembro    -> lectura
--
-- ROLLBACK (documentado; NO ejecutar sin decision):
--   drop table if exists public.quality_process_documents,
--     public.quality_process_map_nodes, public.quality_process_map_versions,
--     public.quality_process_maps, public.quality_process_interactions,
--     public.quality_process_io, public.quality_process_revisions,
--     public.quality_processes, public.quality_position_assignments,
--     public.quality_positions, public.quality_process_categories cascade;
--   update public.modules set is_functional = false where code = 'quality';
--   No hay datos de otros modulos implicados: PCR, Textiles y TrazaDocs no se
--   tocan en ningun punto de esta migracion.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- §1 · Categorias de proceso (DA-03: cuatro grupos maestros congelados)
--
-- Catalogo GLOBAL con extension opcional por empresa, siguiendo el patron ya
-- probado en textile_fiber_types (0093): organization_id NULL = catalogo base
-- de Trazaloop; NOT NULL = categoria propia de esa empresa. Asi DA-03 queda
-- garantizado sin cerrar la puerta a la extensibilidad que el baseline permite.
-- ----------------------------------------------------------------------------
create table public.quality_process_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete restrict,
  code            text not null,
  name            text not null,
  description     text,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint quality_process_categories_name_not_blank check (length(trim(name)) > 0),
  constraint quality_process_categories_code_not_blank check (length(trim(code)) > 0)
);

-- El catalogo BASE es unico por codigo; las categorias de empresa son unicas
-- dentro de su empresa. Dos indices parciales, mismo patron que 0093.
create unique index quality_process_categories_global_code_uniq
  on public.quality_process_categories (code) where organization_id is null;
create unique index quality_process_categories_org_code_uniq
  on public.quality_process_categories (organization_id, code) where organization_id is not null;
create index quality_process_categories_org_idx
  on public.quality_process_categories (organization_id) where organization_id is not null;

create trigger t_quality_process_categories_updated
  before update on public.quality_process_categories
  for each row execute function public.set_updated_at();

alter table public.quality_process_categories enable row level security;

create policy quality_process_categories_select on public.quality_process_categories
  for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id));

create policy quality_process_categories_insert on public.quality_process_categories
  for insert to authenticated
  with check (
    organization_id is not null
    and public.has_org_role(organization_id, array['admin','quality'])
  );

create policy quality_process_categories_update on public.quality_process_categories
  for update to authenticated
  using (organization_id is not null and public.has_org_role(organization_id, array['admin','quality']))
  with check (organization_id is not null and public.has_org_role(organization_id, array['admin','quality']));

-- Sin DELETE (deny-by-default): una categoria se desactiva, no se borra.

-- Las filas GLOBALES son intocables desde cliente, aunque una politica futura
-- se relajara por error: defensa en profundidad, mismo patron que 0093.
create or replace function public.protect_global_quality_process_categories()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'UPDATE' and old.organization_id is null)
     or (tg_op = 'DELETE' and old.organization_id is null) then
    raise exception 'Las categorias de proceso del catalogo base de Trazaloop no se modifican ni se eliminan';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger t_quality_process_categories_protect_global
  before update or delete on public.quality_process_categories
  for each row execute function public.protect_global_quality_process_categories();

-- DA-03: los cuatro grupos maestros del mapa de procesos.
insert into public.quality_process_categories (organization_id, code, name, description, sort_order) values
  (null, 'strategic', 'Estrategicos', 'Procesos que definen la direccion, las politicas y los objetivos de la organizacion.', 10),
  (null, 'core',      'Misionales',   'Procesos que generan el producto o servicio y aportan valor directo al cliente.',      20),
  (null, 'support',   'Apoyo',        'Procesos que proveen los recursos necesarios para que los misionales operen.',         30),
  (null, 'system',    'Sistema',      'Procesos de gestion, medicion, mejora y control del propio sistema de gestion.',       40);


-- ----------------------------------------------------------------------------
-- §2 · Cargos (T-02). Sujeto ESTABLE de la responsabilidad en el SGC.
-- ----------------------------------------------------------------------------
create table public.quality_positions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  code            text,
  name            text not null,
  description     text,
  org_unit        text,
  is_active       boolean not null default true,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint quality_positions_org_id_uniq unique (organization_id, id),
  constraint quality_positions_name_not_blank check (length(trim(name)) > 0)
);

create unique index quality_positions_org_name_uniq
  on public.quality_positions (organization_id, lower(name));
create unique index quality_positions_org_code_uniq
  on public.quality_positions (organization_id, lower(code)) where code is not null;
create index quality_positions_org_active_idx
  on public.quality_positions (organization_id, is_active);

create trigger t_quality_positions_updated
  before update on public.quality_positions
  for each row execute function public.set_updated_at();
create trigger t_quality_positions_org_immutable
  before update on public.quality_positions
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_positions_force_created_by
  before insert on public.quality_positions
  for each row execute function public.force_created_by();
create trigger t_audit_quality_positions
  after insert or update or delete on public.quality_positions
  for each row execute function public.audit_row_change();

alter table public.quality_positions enable row level security;

create policy quality_positions_select on public.quality_positions
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy quality_positions_insert on public.quality_positions
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality']));

create policy quality_positions_update on public.quality_positions
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']))
  with check (public.has_org_role(organization_id, array['admin','quality']));

-- Sin DELETE: un cargo se desactiva. Ademas su borrado rompería el historico de
-- propiedad de los procesos, que es justamente lo que T-02 quiere preservar.


-- ----------------------------------------------------------------------------
-- §3 · Asignacion Persona <-> Cargo, CON VIGENCIA (T-01 + T-02)
--
-- effective_from / effective_to expresan vigencia EMPRESARIAL: permiten
-- responder "quien ocupaba este cargo el 14 de marzo". created_at es tiempo de
-- sistema y no responde esa pregunta.
-- ----------------------------------------------------------------------------
create table public.quality_position_assignments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  position_id     uuid not null,
  profile_id      uuid not null references public.profiles (id) on delete restrict,
  assignment_type text not null default 'holder',
  effective_from  date not null default current_date,
  effective_to    date,
  notes           text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint quality_position_assignments_org_id_uniq unique (organization_id, id),
  constraint quality_position_assignments_type_check
    check (assignment_type in ('holder', 'acting', 'delegate')),
  constraint quality_position_assignments_period_check
    check (effective_to is null or effective_to >= effective_from),
  -- FK COMPUESTA: la asignacion solo puede apuntar a un cargo de SU empresa.
  constraint quality_position_assignments_position_fk
    foreign key (organization_id, position_id)
    references public.quality_positions (organization_id, id)
    on delete restrict
);

create index quality_position_assignments_position_idx
  on public.quality_position_assignments (position_id, effective_from desc);
create index quality_position_assignments_profile_idx
  on public.quality_position_assignments (profile_id);
-- Un cargo tiene como maximo UN titular vigente a la vez. Suplencias y
-- delegaciones (acting/delegate) pueden coexistir.
create unique index quality_position_assignments_single_current_holder
  on public.quality_position_assignments (position_id)
  where effective_to is null and assignment_type = 'holder';

create trigger t_quality_position_assignments_updated
  before update on public.quality_position_assignments
  for each row execute function public.set_updated_at();
create trigger t_quality_position_assignments_org_immutable
  before update on public.quality_position_assignments
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_position_assignments_force_created_by
  before insert on public.quality_position_assignments
  for each row execute function public.force_created_by();
create trigger t_audit_quality_position_assignments
  after insert or update or delete on public.quality_position_assignments
  for each row execute function public.audit_row_change();

alter table public.quality_position_assignments enable row level security;

create policy quality_position_assignments_select on public.quality_position_assignments
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy quality_position_assignments_insert on public.quality_position_assignments
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality']));

create policy quality_position_assignments_update on public.quality_position_assignments
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']))
  with check (public.has_org_role(organization_id, array['admin','quality']));

-- La persona asignada debe ser MIEMBRO ACTIVO de la misma empresa. Un FK a
-- profiles no basta: profiles es global. Sin esto se podria asignar a alguien
-- de otra empresa, que es exactamente la fuga que MDR-42 prohibe.
create or replace function public.quality_assignment_profile_must_belong()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from memberships m
     where m.organization_id = new.organization_id
       and m.user_id = new.profile_id
       and m.status = 'active'
  ) then
    raise exception 'La persona asignada debe ser miembro activo de esta empresa';
  end if;
  return new;
end;
$$;

revoke all on function public.quality_assignment_profile_must_belong() from public, anon, authenticated;

create trigger t_quality_position_assignments_profile_belongs
  before insert or update on public.quality_position_assignments
  for each row execute function public.quality_assignment_profile_must_belong();


-- ----------------------------------------------------------------------------
-- §4 · Procesos — IDENTIDAD estable (T-01)
--
-- La identidad conserva lo que NO cambia con cada revision: codigo, categoria,
-- propietario y estado administrativo. El contenido versionable (proposito,
-- alcance, entradas, salidas) vive en las revisiones.
-- ----------------------------------------------------------------------------
create table public.quality_processes (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  code               text,
  name               text not null,
  category_code      text not null,
  owner_position_id  uuid,
  status             text not null default 'draft',
  current_revision   integer not null default 0,
  created_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint quality_processes_org_id_uniq unique (organization_id, id),
  constraint quality_processes_name_not_blank check (length(trim(name)) > 0),
  constraint quality_processes_status_check check (status in ('draft', 'active', 'retired')),
  -- T-02: el propietario es un CARGO de la MISMA empresa, jamas un usuario.
  constraint quality_processes_owner_position_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id)
    on delete restrict
);

create unique index quality_processes_org_name_uniq
  on public.quality_processes (organization_id, lower(name));
create unique index quality_processes_org_code_uniq
  on public.quality_processes (organization_id, lower(code)) where code is not null;
create index quality_processes_org_status_idx on public.quality_processes (organization_id, status);
create index quality_processes_org_category_idx on public.quality_processes (organization_id, category_code);

create trigger t_quality_processes_updated
  before update on public.quality_processes
  for each row execute function public.set_updated_at();
create trigger t_quality_processes_org_immutable
  before update on public.quality_processes
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_processes_force_created_by
  before insert on public.quality_processes
  for each row execute function public.force_created_by();
create trigger t_audit_quality_processes
  after insert or update or delete on public.quality_processes
  for each row execute function public.audit_row_change();

alter table public.quality_processes enable row level security;

create policy quality_processes_select on public.quality_processes
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy quality_processes_insert on public.quality_processes
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));

create policy quality_processes_update on public.quality_processes
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));

-- Sin DELETE: un proceso se retira (status='retired') y conserva su historico.

-- La categoria debe existir en el catalogo base o pertenecer a la empresa.
create or replace function public.quality_process_category_must_exist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from quality_process_categories c
     where c.code = new.category_code
       and c.is_active
       and (c.organization_id is null or c.organization_id = new.organization_id)
  ) then
    raise exception 'La categoria de proceso "%" no existe o no esta activa para esta empresa', new.category_code;
  end if;
  return new;
end;
$$;

revoke all on function public.quality_process_category_must_exist() from public, anon, authenticated;

create trigger t_quality_processes_category_valid
  before insert or update on public.quality_processes
  for each row execute function public.quality_process_category_must_exist();


-- ----------------------------------------------------------------------------
-- §5 · Revisiones de proceso — INMUTABLES al publicarse (T-01)
--
-- Vigencia EMPRESARIAL en effective_from / effective_to: permite responder
-- "que revision regia el 14 de marzo". Publicar cierra la revision anterior.
-- ----------------------------------------------------------------------------
create table public.quality_process_revisions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  process_id       uuid not null,
  revision_number  integer not null,
  status           text not null default 'draft',
  purpose          text,
  scope            text,
  change_note      text,
  effective_from   date,
  effective_to     date,
  published_by     uuid references public.profiles (id),
  published_at     timestamptz,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_process_revisions_org_id_uniq unique (organization_id, id),
  constraint quality_process_revisions_uniq unique (process_id, revision_number),
  constraint quality_process_revisions_status_check
    check (status in ('draft', 'published', 'superseded')),
  constraint quality_process_revisions_number_check check (revision_number >= 1),
  constraint quality_process_revisions_period_check
    check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint quality_process_revisions_published_fields_check
    check (status = 'draft' or (published_at is not null and effective_from is not null)),
  constraint quality_process_revisions_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id)
    on delete cascade
);

create index quality_process_revisions_process_idx
  on public.quality_process_revisions (process_id, revision_number desc);
-- Como maximo UNA revision publicada vigente por proceso.
create unique index quality_process_revisions_single_current
  on public.quality_process_revisions (process_id)
  where status = 'published' and effective_to is null;
-- Como maximo UN borrador abierto por proceso: evita borradores paralelos.
create unique index quality_process_revisions_single_draft
  on public.quality_process_revisions (process_id) where status = 'draft';

create trigger t_quality_process_revisions_updated
  before update on public.quality_process_revisions
  for each row execute function public.set_updated_at();
create trigger t_quality_process_revisions_org_immutable
  before update on public.quality_process_revisions
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_process_revisions_force_created_by
  before insert on public.quality_process_revisions
  for each row execute function public.force_created_by();
create trigger t_audit_quality_process_revisions
  after insert or update or delete on public.quality_process_revisions
  for each row execute function public.audit_row_change();

alter table public.quality_process_revisions enable row level security;

create policy quality_process_revisions_select on public.quality_process_revisions
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy quality_process_revisions_insert on public.quality_process_revisions
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['admin','quality','consultant'])
    and status = 'draft'
  );

-- Solo se editan BORRADORES por escritura directa. Publicar y superseder pasan
-- por la RPC SECURITY DEFINER de §10, que valida rol y transicion.
create policy quality_process_revisions_update on public.quality_process_revisions
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['admin','quality','consultant'])
    and status = 'draft'
  )
  with check (
    public.has_org_role(organization_id, array['admin','quality','consultant'])
    and status = 'draft'
  );

-- INMUTABILIDAD REAL de lo publicado: ni siquiera una via privilegiada futura
-- puede alterar el contenido de una revision publicada. Solo se permite el
-- cierre de vigencia (effective_to / status -> superseded), que es lo que hace
-- la publicacion de la revision siguiente.
create or replace function public.quality_protect_published_revision()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('published', 'superseded') then
    if new.purpose is distinct from old.purpose
       or new.scope is distinct from old.scope
       or new.revision_number is distinct from old.revision_number
       or new.process_id is distinct from old.process_id
       or new.effective_from is distinct from old.effective_from
       or new.published_at is distinct from old.published_at
       or new.published_by is distinct from old.published_by then
      raise exception 'Una revision publicada es inmutable: crea una revision nueva en lugar de editarla';
    end if;
    if old.status = 'superseded' and new.status <> 'superseded' then
      raise exception 'Una revision superada no vuelve a estados anteriores';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.quality_protect_published_revision() from public, anon, authenticated;

create trigger t_quality_process_revisions_immutable
  before update on public.quality_process_revisions
  for each row execute function public.quality_protect_published_revision();


-- ----------------------------------------------------------------------------
-- §6 · Entradas y salidas — relacion ESTRUCTURADA, nunca JSON opaco
--
-- Pertenecen a la REVISION, no al proceso: asi una revision publicada conserva
-- exactamente las entradas y salidas con las que se publico.
-- ----------------------------------------------------------------------------
create table public.quality_process_io (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  revision_id     uuid not null,
  process_id      uuid not null,
  direction       text not null,
  name            text not null,
  description     text,
  io_kind         text not null default 'information',
  sort_order      integer not null default 0,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint quality_process_io_org_id_uniq unique (organization_id, id),
  constraint quality_process_io_direction_check check (direction in ('input', 'output')),
  constraint quality_process_io_kind_check
    check (io_kind in ('information', 'material', 'document', 'record', 'resource', 'other')),
  constraint quality_process_io_name_not_blank check (length(trim(name)) > 0),
  constraint quality_process_io_revision_fk
    foreign key (organization_id, revision_id)
    references public.quality_process_revisions (organization_id, id)
    on delete cascade,
  constraint quality_process_io_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id)
    on delete cascade
);

create index quality_process_io_revision_idx
  on public.quality_process_io (revision_id, direction, sort_order);

create trigger t_quality_process_io_updated
  before update on public.quality_process_io
  for each row execute function public.set_updated_at();
create trigger t_quality_process_io_org_immutable
  before update on public.quality_process_io
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_process_io_force_created_by
  before insert on public.quality_process_io
  for each row execute function public.force_created_by();

alter table public.quality_process_io enable row level security;

create policy quality_process_io_select on public.quality_process_io
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Solo se tocan entradas/salidas de una revision en BORRADOR. Es la otra mitad
-- de la inmutabilidad: sin esto, se podria alterar el contenido de una revision
-- publicada por la puerta de atras.
create policy quality_process_io_insert on public.quality_process_io
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['admin','quality','consultant'])
    and exists (select 1 from public.quality_process_revisions r
                 where r.id = revision_id and r.status = 'draft')
  );

create policy quality_process_io_update on public.quality_process_io
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['admin','quality','consultant'])
    and exists (select 1 from public.quality_process_revisions r
                 where r.id = revision_id and r.status = 'draft')
  )
  with check (
    public.has_org_role(organization_id, array['admin','quality','consultant'])
    and exists (select 1 from public.quality_process_revisions r
                 where r.id = revision_id and r.status = 'draft')
  );

create policy quality_process_io_delete on public.quality_process_io
  for delete to authenticated
  using (
    public.has_org_role(organization_id, array['admin','quality','consultant'])
    and exists (select 1 from public.quality_process_revisions r
                 where r.id = revision_id and r.status = 'draft')
  );

-- Defensa en profundidad a nivel de BD: ni una via privilegiada puede insertar
-- o mover entradas/salidas dentro de una revision ya publicada.
create or replace function public.quality_io_revision_must_be_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from quality_process_revisions where id = new.revision_id;
  if v_status is distinct from 'draft' then
    raise exception 'Las entradas y salidas solo se modifican en una revision en borrador';
  end if;
  if tg_op = 'UPDATE' and new.revision_id is distinct from old.revision_id then
    raise exception 'Una entrada/salida no cambia de revision';
  end if;
  return new;
end;
$$;

revoke all on function public.quality_io_revision_must_be_draft() from public, anon, authenticated;

create trigger t_quality_process_io_draft_only
  before insert or update on public.quality_process_io
  for each row execute function public.quality_io_revision_must_be_draft();


-- ----------------------------------------------------------------------------
-- §7 · Interacciones entre procesos (DA-06: relacion estructurada, no una linea
--      decorativa). Se guarda UNA vez y se lee desde ambos procesos.
-- ----------------------------------------------------------------------------
create table public.quality_process_interactions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  source_process_id  uuid not null,
  target_process_id  uuid not null,
  source_output_id   uuid,
  target_input_id    uuid,
  description        text,
  information_item   text,
  sort_order         integer not null default 0,
  created_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint quality_process_interactions_org_id_uniq unique (organization_id, id),
  constraint quality_process_interactions_not_self check (source_process_id <> target_process_id),
  constraint quality_process_interactions_source_fk
    foreign key (organization_id, source_process_id)
    references public.quality_processes (organization_id, id) on delete cascade,
  constraint quality_process_interactions_target_fk
    foreign key (organization_id, target_process_id)
    references public.quality_processes (organization_id, id) on delete cascade,
  constraint quality_process_interactions_output_fk
    foreign key (organization_id, source_output_id)
    references public.quality_process_io (organization_id, id) on delete set null,
  constraint quality_process_interactions_input_fk
    foreign key (organization_id, target_input_id)
    references public.quality_process_io (organization_id, id) on delete set null
);

create index quality_process_interactions_source_idx
  on public.quality_process_interactions (source_process_id, sort_order);
create index quality_process_interactions_target_idx
  on public.quality_process_interactions (target_process_id, sort_order);
create unique index quality_process_interactions_pair_item_uniq
  on public.quality_process_interactions
     (source_process_id, target_process_id, coalesce(lower(information_item), ''));

create trigger t_quality_process_interactions_updated
  before update on public.quality_process_interactions
  for each row execute function public.set_updated_at();
create trigger t_quality_process_interactions_org_immutable
  before update on public.quality_process_interactions
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_process_interactions_force_created_by
  before insert on public.quality_process_interactions
  for each row execute function public.force_created_by();
create trigger t_audit_quality_process_interactions
  after insert or update or delete on public.quality_process_interactions
  for each row execute function public.audit_row_change();

alter table public.quality_process_interactions enable row level security;

create policy quality_process_interactions_select on public.quality_process_interactions
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy quality_process_interactions_insert on public.quality_process_interactions
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));

create policy quality_process_interactions_update on public.quality_process_interactions
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));

create policy quality_process_interactions_delete on public.quality_process_interactions
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

-- La salida referenciada debe pertenecer al proceso origen y la entrada al
-- destino. Sin esto, una interaccion podria apuntar a la entrada de un tercer
-- proceso y el mapa mentiria.
create or replace function public.quality_interaction_io_must_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_pid uuid; v_dir text;
begin
  if new.source_output_id is not null then
    select process_id, direction into v_pid, v_dir from quality_process_io where id = new.source_output_id;
    if v_pid is distinct from new.source_process_id or v_dir <> 'output' then
      raise exception 'La salida referenciada debe ser una SALIDA del proceso origen';
    end if;
  end if;
  if new.target_input_id is not null then
    select process_id, direction into v_pid, v_dir from quality_process_io where id = new.target_input_id;
    if v_pid is distinct from new.target_process_id or v_dir <> 'input' then
      raise exception 'La entrada referenciada debe ser una ENTRADA del proceso destino';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.quality_interaction_io_must_match() from public, anon, authenticated;

create trigger t_quality_process_interactions_io_match
  before insert or update on public.quality_process_interactions
  for each row execute function public.quality_interaction_io_must_match();


-- ----------------------------------------------------------------------------
-- §8 · Mapa de procesos — identidad + versiones (DA-05, DA-07)
-- ----------------------------------------------------------------------------
create table public.quality_process_maps (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null,
  description     text,
  is_default      boolean not null default false,
  current_version integer not null default 0,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint quality_process_maps_org_id_uniq unique (organization_id, id),
  constraint quality_process_maps_name_not_blank check (length(trim(name)) > 0)
);

create unique index quality_process_maps_org_name_uniq
  on public.quality_process_maps (organization_id, lower(name));
create unique index quality_process_maps_single_default
  on public.quality_process_maps (organization_id) where is_default;

create trigger t_quality_process_maps_updated
  before update on public.quality_process_maps
  for each row execute function public.set_updated_at();
create trigger t_quality_process_maps_org_immutable
  before update on public.quality_process_maps
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_process_maps_force_created_by
  before insert on public.quality_process_maps
  for each row execute function public.force_created_by();
create trigger t_audit_quality_process_maps
  after insert or update or delete on public.quality_process_maps
  for each row execute function public.audit_row_change();

alter table public.quality_process_maps enable row level security;

create policy quality_process_maps_select on public.quality_process_maps
  for select to authenticated using (public.is_org_member(organization_id));
create policy quality_process_maps_insert on public.quality_process_maps
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_process_maps_update on public.quality_process_maps
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));


create table public.quality_process_map_versions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  map_id          uuid not null,
  version_number  integer not null,
  status          text not null default 'draft',
  change_note     text,
  effective_from  date,
  effective_to    date,
  published_by    uuid references public.profiles (id),
  published_at    timestamptz,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint quality_process_map_versions_org_id_uniq unique (organization_id, id),
  constraint quality_process_map_versions_uniq unique (map_id, version_number),
  constraint quality_process_map_versions_status_check
    check (status in ('draft', 'published', 'superseded')),
  constraint quality_process_map_versions_number_check check (version_number >= 1),
  constraint quality_process_map_versions_published_fields_check
    check (status = 'draft' or (published_at is not null and effective_from is not null)),
  constraint quality_process_map_versions_map_fk
    foreign key (organization_id, map_id)
    references public.quality_process_maps (organization_id, id) on delete cascade
);

create index quality_process_map_versions_map_idx
  on public.quality_process_map_versions (map_id, version_number desc);
create unique index quality_process_map_versions_single_current
  on public.quality_process_map_versions (map_id)
  where status = 'published' and effective_to is null;
create unique index quality_process_map_versions_single_draft
  on public.quality_process_map_versions (map_id) where status = 'draft';

create trigger t_quality_process_map_versions_updated
  before update on public.quality_process_map_versions
  for each row execute function public.set_updated_at();
create trigger t_quality_process_map_versions_org_immutable
  before update on public.quality_process_map_versions
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_process_map_versions_force_created_by
  before insert on public.quality_process_map_versions
  for each row execute function public.force_created_by();
create trigger t_audit_quality_process_map_versions
  after insert or update or delete on public.quality_process_map_versions
  for each row execute function public.audit_row_change();

alter table public.quality_process_map_versions enable row level security;

create policy quality_process_map_versions_select on public.quality_process_map_versions
  for select to authenticated using (public.is_org_member(organization_id));

create policy quality_process_map_versions_insert on public.quality_process_map_versions
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['admin','quality','consultant'])
    and status = 'draft'
  );

create policy quality_process_map_versions_update on public.quality_process_map_versions
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']) and status = 'draft')
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']) and status = 'draft');

-- DA-07: una version publicada del mapa es INMUTABLE.
create or replace function public.quality_protect_published_map_version()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('published', 'superseded') then
    if new.version_number is distinct from old.version_number
       or new.map_id is distinct from old.map_id
       or new.effective_from is distinct from old.effective_from
       or new.published_at is distinct from old.published_at
       or new.published_by is distinct from old.published_by
       or new.change_note is distinct from old.change_note then
      raise exception 'Una version publicada del mapa es inmutable: publica una version nueva';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.quality_protect_published_map_version() from public, anon, authenticated;

create trigger t_quality_process_map_versions_immutable
  before update on public.quality_process_map_versions
  for each row execute function public.quality_protect_published_map_version();


-- Nodos: que proceso aparece en que version del mapa, en que grupo y orden.
-- DA-04: cada bloque visual corresponde a un Proceso REAL.
create table public.quality_process_map_nodes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  map_version_id  uuid not null,
  process_id      uuid not null,
  category_code   text not null,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),

  constraint quality_process_map_nodes_org_id_uniq unique (organization_id, id),
  constraint quality_process_map_nodes_uniq unique (map_version_id, process_id),
  constraint quality_process_map_nodes_version_fk
    foreign key (organization_id, map_version_id)
    references public.quality_process_map_versions (organization_id, id) on delete cascade,
  constraint quality_process_map_nodes_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete cascade
);

create index quality_process_map_nodes_version_idx
  on public.quality_process_map_nodes (map_version_id, category_code, sort_order);

create trigger t_quality_process_map_nodes_org_immutable
  before update on public.quality_process_map_nodes
  for each row execute function public.prevent_organization_id_change();

alter table public.quality_process_map_nodes enable row level security;

create policy quality_process_map_nodes_select on public.quality_process_map_nodes
  for select to authenticated using (public.is_org_member(organization_id));

create policy quality_process_map_nodes_insert on public.quality_process_map_nodes
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['admin','quality','consultant'])
    and exists (select 1 from public.quality_process_map_versions v
                 where v.id = map_version_id and v.status = 'draft')
  );

create policy quality_process_map_nodes_update on public.quality_process_map_nodes
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['admin','quality','consultant'])
    and exists (select 1 from public.quality_process_map_versions v
                 where v.id = map_version_id and v.status = 'draft')
  )
  with check (
    public.has_org_role(organization_id, array['admin','quality','consultant'])
    and exists (select 1 from public.quality_process_map_versions v
                 where v.id = map_version_id and v.status = 'draft')
  );

create policy quality_process_map_nodes_delete on public.quality_process_map_nodes
  for delete to authenticated
  using (
    public.has_org_role(organization_id, array['admin','quality','consultant'])
    and exists (select 1 from public.quality_process_map_versions v
                 where v.id = map_version_id and v.status = 'draft')
  );

-- Defensa en profundidad: los nodos de una version publicada no se tocan.
create or replace function public.quality_map_node_version_must_be_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from quality_process_map_versions
   where id = coalesce(new.map_version_id, old.map_version_id);
  if v_status is distinct from 'draft' then
    raise exception 'Los nodos de una version publicada del mapa no se modifican';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.quality_map_node_version_must_be_draft() from public, anon, authenticated;

create trigger t_quality_process_map_nodes_draft_only
  before insert or update or delete on public.quality_process_map_nodes
  for each row execute function public.quality_map_node_version_must_be_draft();


-- ----------------------------------------------------------------------------
-- §9 · Proceso <-> documento de TrazaDocs (T-03: REFERENCIA, no copia)
--
-- No se crea ningun documento nuevo ni se duplica contenido: solo se relaciona
-- un documento que YA existe en trazadoc_documents, dentro de la misma empresa.
-- ----------------------------------------------------------------------------
create table public.quality_process_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  process_id      uuid not null,
  document_id     uuid not null,
  relation_type   text not null default 'governs',
  notes           text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),

  constraint quality_process_documents_org_id_uniq unique (organization_id, id),
  constraint quality_process_documents_uniq unique (process_id, document_id, relation_type),
  constraint quality_process_documents_relation_check
    check (relation_type in ('governs', 'supports', 'records', 'reference')),
  constraint quality_process_documents_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete cascade,
  -- FK COMPUESTA contra TrazaDocs: el documento es de la MISMA empresa.
  constraint quality_process_documents_document_fk
    foreign key (organization_id, document_id)
    references public.trazadoc_documents (organization_id, id) on delete cascade
);

create index quality_process_documents_process_idx
  on public.quality_process_documents (process_id);
create index quality_process_documents_document_idx
  on public.quality_process_documents (document_id);

create trigger t_quality_process_documents_org_immutable
  before update on public.quality_process_documents
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_process_documents_force_created_by
  before insert on public.quality_process_documents
  for each row execute function public.force_created_by();

alter table public.quality_process_documents enable row level security;

create policy quality_process_documents_select on public.quality_process_documents
  for select to authenticated using (public.is_org_member(organization_id));

create policy quality_process_documents_insert on public.quality_process_documents
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));

create policy quality_process_documents_delete on public.quality_process_documents
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']));


-- ----------------------------------------------------------------------------
-- §10 · RPCs de transicion — atomicas, SECURITY DEFINER, sesion REAL
--
-- Publicar toca varias filas de forma consistente (cerrar la vigente, abrir la
-- nueva, actualizar la identidad). Mismo patron que
-- change_trazadoc_document_status (0046): una sola transaccion, nunca varias
-- llamadas sueltas desde el cliente. Corre con auth.uid(), jamas service_role.
-- ----------------------------------------------------------------------------

-- Abre una revision de proceso en BORRADOR (la primera, o una nueva a partir de
-- la vigente, copiando sus entradas y salidas para poder editarlas).
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

  -- Copiar entradas y salidas de la revision vigente para poder partir de ella.
  if v_current.id is not null then
    insert into quality_process_io
      (organization_id, revision_id, process_id, direction, name, description, io_kind, sort_order, created_by)
    select v_proc.organization_id, v_new_id, p_process_id, direction, name, description, io_kind, sort_order, v_user
      from quality_process_io where revision_id = v_current.id;
  end if;

  return v_new_id;
end;
$$;

revoke all on function public.quality_open_process_revision(uuid, text) from public, anon;
grant execute on function public.quality_open_process_revision(uuid, text) to authenticated;


-- Publica el borrador: cierra la vigencia de la revision anterior y activa la
-- nueva. Solo admin/quality — un consultant nunca publica (mismo criterio que
-- TrazaDocs en 0047).
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
  v_user uuid; v_rev record; v_from date;
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

  return v_rev.revision_number;
end;
$$;

revoke all on function public.quality_publish_process_revision(uuid, date) from public, anon;
grant execute on function public.quality_publish_process_revision(uuid, date) to authenticated;


-- Abre una version del mapa en BORRADOR, copiando los nodos de la vigente.
create or replace function public.quality_open_map_version(
  p_map_id uuid,
  p_change_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid; v_map record; v_current record; v_new_id uuid; v_number integer; v_draft record;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'No autenticado'; end if;

  select * into v_map from quality_process_maps where id = p_map_id for update;
  if v_map.id is null then raise exception 'El mapa no existe'; end if;
  if not has_org_role(v_map.organization_id, array['admin','quality','consultant']) then
    raise exception 'Tu rol no permite editar el mapa de procesos';
  end if;

  select * into v_draft from quality_process_map_versions where map_id = p_map_id and status = 'draft';
  if v_draft.id is not null then return v_draft.id; end if;

  select coalesce(max(version_number), 0) + 1 into v_number
    from quality_process_map_versions where map_id = p_map_id;

  select * into v_current from quality_process_map_versions
   where map_id = p_map_id and status = 'published' and effective_to is null;

  insert into quality_process_map_versions
    (organization_id, map_id, version_number, status, change_note, created_by)
  values (v_map.organization_id, p_map_id, v_number, 'draft', p_change_note, v_user)
  returning id into v_new_id;

  if v_current.id is not null then
    insert into quality_process_map_nodes
      (organization_id, map_version_id, process_id, category_code, sort_order)
    select v_map.organization_id, v_new_id, process_id, category_code, sort_order
      from quality_process_map_nodes where map_version_id = v_current.id;
  end if;

  return v_new_id;
end;
$$;

revoke all on function public.quality_open_map_version(uuid, text) from public, anon;
grant execute on function public.quality_open_map_version(uuid, text) to authenticated;


-- Publica la version del mapa: la convierte en la arquitectura OFICIAL vigente.
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


-- ----------------------------------------------------------------------------
-- §11 · Vista de lectura: quien ocupa cada cargo HOY (T-01 en la practica)
-- ----------------------------------------------------------------------------
create view public.v_quality_position_current_holder
with (security_invoker = true) as
select
  p.organization_id,
  p.id                        as position_id,
  p.name                      as position_name,
  p.code                      as position_code,
  p.is_active,
  a.id                        as assignment_id,
  a.profile_id,
  pr.full_name                as holder_name,
  pr.email                    as holder_email,
  a.effective_from,
  a.assignment_type
from public.quality_positions p
left join public.quality_position_assignments a
       on a.position_id = p.id
      and a.assignment_type = 'holder'
      and a.effective_to is null
left join public.profiles pr on pr.id = a.profile_id;


-- ----------------------------------------------------------------------------
-- §12 · PRIVILEGIOS EXPLICITOS (leccion de Q0 · convencion de 0111)
--
-- Ninguna tabla de Quality depende del bootstrap de Supabase. Se conceden solo
-- los privilegios de DML necesarios: nunca GRANT ALL, nunca TRUNCATE (bypasea
-- RLS), nunca REFERENCES ni TRIGGER (son DDL). Sin ALTER DEFAULT PRIVILEGES:
-- cada tabla futura de Quality debera declarar los suyos igual que estas.
--
-- anon NO recibe NADA: ninguna superficie de Quality es publica.
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on table
  public.quality_process_categories,
  public.quality_positions,
  public.quality_position_assignments,
  public.quality_processes,
  public.quality_process_revisions,
  public.quality_process_io,
  public.quality_process_interactions,
  public.quality_process_maps,
  public.quality_process_map_versions,
  public.quality_process_map_nodes,
  public.quality_process_documents
to authenticated, service_role;

grant select on table public.v_quality_position_current_holder to authenticated, service_role;

-- Retirar lo que concede el ENTORNO, no esta migracion. Los privilegios por
-- defecto del rol postgres otorgan Dxtm (truncate, references, trigger,
-- maintain) a anon y authenticated en CADA tabla que se crea, de modo que sin
-- este bloque las tablas nuevas de Quality nacerian con TRUNCATE en manos de
-- roles de cliente — y TRUNCATE BYPASEA RLS por completo.
--
-- Es la misma correccion que 0111 aplico al esquema existente. Toda migracion
-- futura de Quality que cree tablas debe repetir este bloque: 0111 no dejo
-- ALTER DEFAULT PRIVILEGES a proposito, asi que el saneamiento es explicito y
-- por tabla, nunca automatico.
revoke truncate, references, trigger on table
  public.quality_process_categories,
  public.quality_positions,
  public.quality_position_assignments,
  public.quality_processes,
  public.quality_process_revisions,
  public.quality_process_io,
  public.quality_process_interactions,
  public.quality_process_maps,
  public.quality_process_map_versions,
  public.quality_process_map_nodes,
  public.quality_process_documents
from anon, authenticated;

-- anon no debe conservar NINGUN privilegio sobre Quality: ninguna de sus
-- superficies es publica.
revoke all on table
  public.quality_process_categories,
  public.quality_positions,
  public.quality_position_assignments,
  public.quality_processes,
  public.quality_process_revisions,
  public.quality_process_io,
  public.quality_process_interactions,
  public.quality_process_maps,
  public.quality_process_map_versions,
  public.quality_process_map_nodes,
  public.quality_process_documents,
  public.v_quality_position_current_holder
from anon;

-- El catalogo BASE de categorias es de solo lectura para el cliente; sus filas
-- globales ya estan protegidas por trigger, pero la escritura de esta tabla
-- solo tiene sentido para categorias propias de la empresa.
-- (El INSERT/UPDATE se mantiene porque la RLS ya exige organization_id no nulo.)


-- ----------------------------------------------------------------------------
-- §13 · Activacion del modulo Quality
--
-- Quality pasa a ser un modulo FUNCIONAL asignable por el superadministrador,
-- igual que CPR y Textiles. La visibilidad real la sigue gobernando:
--   1. el kill switch de entorno QUALITY_MODULE_ENABLED (server-only), y
--   2. la asignacion comercial en organization_modules.
--
-- Production simplemente NO define QUALITY_MODULE_ENABLED, asi que Quality
-- permanece invisible alli aunque esta migracion llegue algun dia. Una empresa
-- NUNCA puede autoasignarse el modulo: la RLS de escritura de
-- organization_modules se cerro en 0100 y solo las RPC de superadministrador
-- lo cambian.
-- ----------------------------------------------------------------------------
update public.modules
   set name = 'Trazaloop Quality',
       description = 'Sistema de gestion de calidad: procesos, cargos, documentacion y mejora.',
       is_available = true,
       is_functional = true
 where code = 'quality';
