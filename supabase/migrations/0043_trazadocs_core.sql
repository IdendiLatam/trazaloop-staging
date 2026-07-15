-- 0043_trazadocs_core.sql
-- Trazaloop · Sprint 9 · TrazaDocs MVP — documentos vivos guiados por
-- secciones. Reutiliza is_org_member, has_org_role, is_platform_staff,
-- is_platform_superadmin, prevent_organization_id_change, set_updated_at,
-- force_created_by, audit_row_change tal cual existen. No cambia el motor
-- de cálculo ni la metodología: TrazaDocs es documentación, no cálculo.
--
-- 6 tablas:
--  - trazadoc_blueprints / trazadoc_blueprint_sections: estructuras
--    sugeridas GLOBALES (no org-scoped), administradas solo por
--    platform_superadmin.
--  - trazadoc_documents / trazadoc_document_sections: documentos vivos de
--    cada empresa (org-scoped).
--  - trazadoc_document_versions / trazadoc_status_history: historial
--    append-only (org-scoped).

-- ---------------------------------------------------------------------------
-- 1. trazadoc_blueprints — estructuras sugeridas globales.
-- ---------------------------------------------------------------------------
create table public.trazadoc_blueprints (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  description  text,
  document_type text not null default 'procedure',
  status       text not null default 'active',
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint trazadoc_blueprints_name_not_blank check (length(trim(name)) > 0),
  constraint trazadoc_blueprints_document_type_check check (
    document_type in ('manual', 'procedure', 'instruction', 'free_structure', 'other')
  ),
  constraint trazadoc_blueprints_status_check check (status in ('active', 'inactive'))
);

create trigger t_trazadoc_blueprints_updated
  before update on public.trazadoc_blueprints
  for each row execute function public.set_updated_at();

create trigger t_trazadoc_blueprints_force_created_by
  before insert on public.trazadoc_blueprints
  for each row execute function public.force_created_by();

create trigger t_audit_trazadoc_blueprints
  after insert or update or delete on public.trazadoc_blueprints
  for each row execute function public.audit_row_change();

alter table public.trazadoc_blueprints enable row level security;

-- SELECT: cualquier miembro activo de alguna empresa ve las ACTIVAS;
-- platform_staff (support incluido) ve todas, activas e inactivas.
create policy trazadoc_blueprints_select on public.trazadoc_blueprints
  for select to authenticated
  using (
    public.is_platform_staff()
    or (
      status = 'active'
      and exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.status = 'active')
    )
  );

create policy trazadoc_blueprints_insert on public.trazadoc_blueprints
  for insert to authenticated
  with check (public.is_platform_superadmin());

create policy trazadoc_blueprints_update on public.trazadoc_blueprints
  for update to authenticated
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

-- Sin DELETE (deny-by-default): se prefiere status = 'inactive'.

-- ---------------------------------------------------------------------------
-- 2. trazadoc_blueprint_sections — secciones sugeridas globales.
-- ---------------------------------------------------------------------------
create table public.trazadoc_blueprint_sections (
  id           uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.trazadoc_blueprints (id) on delete cascade,
  section_key  text not null,
  title        text not null,
  description  text,
  hint         text,
  sort_order   integer not null default 0,
  is_required  boolean not null default true,
  status       text not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint trazadoc_blueprint_sections_uniq unique (blueprint_id, section_key),
  constraint trazadoc_blueprint_sections_title_not_blank check (length(trim(title)) > 0),
  constraint trazadoc_blueprint_sections_status_check check (status in ('active', 'inactive'))
);

create index trazadoc_blueprint_sections_order_idx
  on public.trazadoc_blueprint_sections (blueprint_id, sort_order);

create trigger t_trazadoc_blueprint_sections_updated
  before update on public.trazadoc_blueprint_sections
  for each row execute function public.set_updated_at();

alter table public.trazadoc_blueprint_sections enable row level security;

create policy trazadoc_blueprint_sections_select on public.trazadoc_blueprint_sections
  for select to authenticated
  using (
    public.is_platform_staff()
    or (
      status = 'active'
      and exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.status = 'active')
    )
  );

create policy trazadoc_blueprint_sections_insert on public.trazadoc_blueprint_sections
  for insert to authenticated
  with check (public.is_platform_superadmin());

create policy trazadoc_blueprint_sections_update on public.trazadoc_blueprint_sections
  for update to authenticated
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

-- ---------------------------------------------------------------------------
-- 3. trazadoc_documents — documentos vivos de cada empresa.
-- ---------------------------------------------------------------------------
create table public.trazadoc_documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  blueprint_id     uuid references public.trazadoc_blueprints (id),
  source_type      text not null,
  code             text,
  title            text not null,
  description      text,
  status           text not null default 'draft',
  owner_id         uuid references public.profiles (id),
  current_version  integer not null default 1,
  created_by       uuid references public.profiles (id),
  approved_by      uuid references public.profiles (id),
  approved_at      timestamptz,
  obsolete_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint trazadoc_documents_org_id_uniq unique (organization_id, id),
  constraint trazadoc_documents_title_not_blank check (length(trim(title)) > 0),
  constraint trazadoc_documents_source_type_check check (source_type in ('suggested', 'custom')),
  constraint trazadoc_documents_status_check check (status in ('draft', 'in_review', 'approved', 'obsolete'))
);

create index trazadoc_documents_org_status_idx on public.trazadoc_documents (organization_id, status);

create trigger t_trazadoc_documents_updated
  before update on public.trazadoc_documents
  for each row execute function public.set_updated_at();

create trigger t_trazadoc_documents_org_immutable
  before update on public.trazadoc_documents
  for each row execute function public.prevent_organization_id_change();

create trigger t_trazadoc_documents_force_created_by
  before insert on public.trazadoc_documents
  for each row execute function public.force_created_by();

create trigger t_audit_trazadoc_documents
  after insert or update or delete on public.trazadoc_documents
  for each row execute function public.audit_row_change();

alter table public.trazadoc_documents enable row level security;

create policy trazadoc_documents_select on public.trazadoc_documents
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy trazadoc_documents_insert on public.trazadoc_documents
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
  );

-- UPDATE: admin/quality sin restricción de estado; consultant solo si el
-- documento YA estaba (using) y SIGUE quedando (with check) en
-- draft/in_review — así nunca puede ser quien aprueba ni marca obsoleto,
-- ni tocar un documento ya aprobado/obsoleto.
create policy trazadoc_documents_update on public.trazadoc_documents
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and (
      public.has_org_role(organization_id, array['admin','quality'])
      or (
        public.has_org_role(organization_id, array['consultant'])
        and status in ('draft', 'in_review')
      )
    )
  )
  with check (
    public.is_org_member(organization_id)
    and (
      public.has_org_role(organization_id, array['admin','quality'])
      or (
        public.has_org_role(organization_id, array['consultant'])
        and status in ('draft', 'in_review')
      )
    )
  );

-- Sin DELETE (deny-by-default): "preferir no permitir delete".

-- ---------------------------------------------------------------------------
-- 4. trazadoc_document_sections — contenido vivo por sección.
-- ---------------------------------------------------------------------------
create table public.trazadoc_document_sections (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,
  document_id           uuid not null references public.trazadoc_documents (id) on delete cascade,
  blueprint_section_id  uuid references public.trazadoc_blueprint_sections (id),
  section_key           text not null,
  title                 text not null,
  content               text not null default '',
  sort_order            integer not null default 0,
  is_required           boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint trazadoc_document_sections_org_id_uniq unique (organization_id, id),
  constraint trazadoc_document_sections_uniq unique (document_id, section_key),
  constraint trazadoc_document_sections_title_not_blank check (length(trim(title)) > 0),
  -- FK COMPUESTA (regla obligatoria desde 0024): la sección solo puede
  -- pertenecer a un documento de la MISMA empresa.
  constraint trazadoc_document_sections_document_fk
    foreign key (organization_id, document_id)
    references public.trazadoc_documents (organization_id, id)
    on delete cascade
);

create index trazadoc_document_sections_order_idx
  on public.trazadoc_document_sections (document_id, sort_order);

create trigger t_trazadoc_document_sections_updated
  before update on public.trazadoc_document_sections
  for each row execute function public.set_updated_at();

create trigger t_trazadoc_document_sections_org_immutable
  before update on public.trazadoc_document_sections
  for each row execute function public.prevent_organization_id_change();

alter table public.trazadoc_document_sections enable row level security;

create policy trazadoc_document_sections_select on public.trazadoc_document_sections
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy trazadoc_document_sections_insert on public.trazadoc_document_sections
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
  );

create policy trazadoc_document_sections_update on public.trazadoc_document_sections
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and (
      public.has_org_role(organization_id, array['admin','quality'])
      or (
        public.has_org_role(organization_id, array['consultant'])
        and exists (
          select 1 from public.trazadoc_documents d
          where d.id = document_id and d.status in ('draft', 'in_review')
        )
      )
    )
  )
  with check (
    public.is_org_member(organization_id)
    and (
      public.has_org_role(organization_id, array['admin','quality'])
      or (
        public.has_org_role(organization_id, array['consultant'])
        and exists (
          select 1 from public.trazadoc_documents d
          where d.id = document_id and d.status in ('draft', 'in_review')
        )
      )
    )
  );

-- DELETE: solo admin/quality, y solo mientras el documento siga en
-- borrador (quitar una sección personalizada agregada por error).
create policy trazadoc_document_sections_delete on public.trazadoc_document_sections
  for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality'])
    and exists (select 1 from public.trazadoc_documents d where d.id = document_id and d.status = 'draft')
  );

-- ---------------------------------------------------------------------------
-- 5. trazadoc_document_versions — snapshots, append-only.
-- ---------------------------------------------------------------------------
create table public.trazadoc_document_versions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  document_id     uuid not null references public.trazadoc_documents (id) on delete cascade,
  version_number  integer not null,
  status          text not null,
  snapshot        jsonb not null,
  change_note     text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),

  constraint trazadoc_document_versions_org_id_uniq unique (organization_id, id),
  constraint trazadoc_document_versions_uniq unique (document_id, version_number),
  constraint trazadoc_document_versions_status_check check (status in ('draft', 'in_review', 'approved', 'obsolete')),
  constraint trazadoc_document_versions_document_fk
    foreign key (organization_id, document_id)
    references public.trazadoc_documents (organization_id, id)
    on delete cascade
);

create index trazadoc_document_versions_document_idx
  on public.trazadoc_document_versions (document_id, version_number desc);

create trigger t_trazadoc_document_versions_org_immutable
  before update on public.trazadoc_document_versions
  for each row execute function public.prevent_organization_id_change();

create trigger t_trazadoc_document_versions_force_created_by
  before insert on public.trazadoc_document_versions
  for each row execute function public.force_created_by();

alter table public.trazadoc_document_versions enable row level security;

create policy trazadoc_document_versions_select on public.trazadoc_document_versions
  for select to authenticated
  using (public.is_org_member(organization_id));

-- INSERT: las versiones las genera SIEMPRE un server action (nunca el
-- cliente arma un snapshot arbitrario), pero la RLS igual acota QUIÉN
-- puede generar qué status de versión: consultant nunca puede insertar
-- una versión 'approved' u 'obsolete' directamente.
create policy trazadoc_document_versions_insert on public.trazadoc_document_versions
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and (
      public.has_org_role(organization_id, array['admin','quality'])
      or (
        public.has_org_role(organization_id, array['consultant'])
        and status in ('draft', 'in_review')
      )
    )
  );

-- Sin UPDATE/DELETE (deny-by-default): append-only real.

-- ---------------------------------------------------------------------------
-- 6. trazadoc_status_history — historial de estado, append-only.
-- ---------------------------------------------------------------------------
create table public.trazadoc_status_history (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  document_id     uuid not null references public.trazadoc_documents (id) on delete cascade,
  from_status     text,
  to_status       text not null,
  changed_by      uuid references public.profiles (id),
  change_note     text,
  created_at      timestamptz not null default now(),

  constraint trazadoc_status_history_org_id_uniq unique (organization_id, id),
  constraint trazadoc_status_history_to_status_check check (to_status in ('draft', 'in_review', 'approved', 'obsolete')),
  constraint trazadoc_status_history_from_status_check
    check (from_status is null or from_status in ('draft', 'in_review', 'approved', 'obsolete')),
  constraint trazadoc_status_history_document_fk
    foreign key (organization_id, document_id)
    references public.trazadoc_documents (organization_id, id)
    on delete cascade
);

create index trazadoc_status_history_document_idx
  on public.trazadoc_status_history (document_id, created_at);

alter table public.trazadoc_status_history enable row level security;

create policy trazadoc_status_history_select on public.trazadoc_status_history
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy trazadoc_status_history_insert on public.trazadoc_status_history
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and (
      public.has_org_role(organization_id, array['admin','quality'])
      or (
        public.has_org_role(organization_id, array['consultant'])
        and to_status in ('draft', 'in_review')
      )
    )
  );

-- Sin UPDATE/DELETE (deny-by-default): append-only real.

-- NOTA: organization_id NUNCA viaja desde el cliente en ninguna tabla de
-- TrazaDocs (server/actions/trazadocs.ts lo toma siempre de la empresa
-- activa validada en servidor). changed_by/created_by en versions/history
-- los fija siempre el propio server action con el id de la sesión — nunca
-- un valor del cliente.
