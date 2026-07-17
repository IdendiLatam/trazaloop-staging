-- 0057_trazadocs_document_master.sql
-- Trazaloop · Sprint 10B · Maestro de documentos TrazaDocs.
--
-- Une, en una sola vista, los documentos VIVOS ya existentes
-- (trazadoc_documents, 0043) con documentos DESCARGABLES nuevos
-- (trazadoc_file_documents) — archivos controlados (PDF/Office/imagen)
-- que la empresa sube y versiona, sin ser editables en plataforma. Nunca
-- se mezclan con evidencias técnicas (bucket y tabla separados) ni se
-- usan para el cálculo de contenido reciclado.

-- ---------------------------------------------------------------------------
-- 1. Categoría en documentos vivos existentes (Parte 4/8.1).
-- ---------------------------------------------------------------------------
alter table public.trazadoc_documents
  add column category_code text not null default 'other';

-- Backfill ANTES del check: documentos sugeridos heredan la categoría de
-- su blueprint (manual/procedure/instruction); documentos libres y
-- cualquier otro caso quedan en 'other' — nunca se rompe un dato
-- existente, 'other' es siempre válido.
update public.trazadoc_documents d
set category_code = coalesce(
  (
    select case bp.document_type
      when 'manual' then 'manual'
      when 'procedure' then 'procedure'
      when 'instruction' then 'instruction'
      else 'other'
    end
    from public.trazadoc_blueprints bp
    where bp.id = d.blueprint_id
  ),
  'other'
);

alter table public.trazadoc_documents
  add constraint trazadoc_documents_category_code_check check (category_code in (
    'manual', 'procedure', 'instruction', 'record',
    'technical_support', 'policy', 'format', 'other'
  ));

-- ---------------------------------------------------------------------------
-- 2. trazadoc_file_documents — documentos descargables controlados.
--    MISMO patrón de RLS/triggers que trazadoc_documents (0043, corregido
--    en 0047): edición directa de metadatos solo en draft/in_review para
--    los 3 roles por igual — un documento aprobado nunca se edita
--    directamente, solo vía nueva versión (mismo principio que TrazaDocs
--    vivo).
-- ---------------------------------------------------------------------------
create table public.trazadoc_file_documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  category_code    text not null default 'other',
  code             text,
  title            text not null,
  description      text,
  status           text not null default 'draft',
  version_label    text not null default 'v1',
  current_version  integer not null default 1,
  owner_id         uuid references public.profiles (id),
  storage_path     text not null,
  file_name        text not null,
  mime_type        text not null,
  size_bytes       bigint not null default 0,
  uploaded_by      uuid references public.profiles (id),
  approved_by      uuid references public.profiles (id),
  approved_at      timestamptz,
  obsolete_at      timestamptz,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint trazadoc_file_documents_org_id_uniq unique (organization_id, id),
  constraint trazadoc_file_documents_title_not_blank check (length(trim(title)) > 0),
  constraint trazadoc_file_documents_status_check check (status in ('draft', 'in_review', 'approved', 'obsolete')),
  constraint trazadoc_file_documents_category_code_check check (category_code in (
    'manual', 'procedure', 'instruction', 'record',
    'technical_support', 'policy', 'format', 'other'
  )),
  constraint trazadoc_file_documents_size_bytes_check check (size_bytes >= 0)
);

create index trazadoc_file_documents_org_status_idx on public.trazadoc_file_documents (organization_id, status);

create trigger t_trazadoc_file_documents_updated
  before update on public.trazadoc_file_documents
  for each row execute function public.set_updated_at();

create trigger t_trazadoc_file_documents_force_created_by
  before insert on public.trazadoc_file_documents
  for each row execute function public.force_created_by();

create trigger t_audit_trazadoc_file_documents
  after insert or update or delete on public.trazadoc_file_documents
  for each row execute function public.audit_row_change();

alter table public.trazadoc_file_documents enable row level security;

create policy trazadoc_file_documents_select on public.trazadoc_file_documents
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy trazadoc_file_documents_insert on public.trazadoc_file_documents
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
  );

-- UPDATE: mismo criterio que trazadoc_documents (0047) — solo
-- draft/in_review, para los 3 roles por igual; nunca un aprobado
-- editado directamente.
create policy trazadoc_file_documents_update on public.trazadoc_file_documents
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
    and status in ('draft', 'in_review')
  )
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
    and status in ('draft', 'in_review')
  );

-- DELETE: solo borrador, admin/quality o el consultant que lo creó —
-- mismo criterio que deleteDraftTrazadocDocumentAction (Sprint 9.2, 0048).
create policy trazadoc_file_documents_delete on public.trazadoc_file_documents
  for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and status = 'draft'
    and (
      public.has_org_role(organization_id, array['admin','quality'])
      or (
        public.has_org_role(organization_id, array['consultant'])
        and created_by = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. trazadoc_file_document_versions — snapshots, append-only.
-- ---------------------------------------------------------------------------
create table public.trazadoc_file_document_versions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  file_document_id  uuid not null references public.trazadoc_file_documents (id) on delete cascade,
  version_number    integer not null,
  version_label     text not null,
  status            text not null,
  snapshot          jsonb not null,
  storage_path      text not null,
  file_name         text not null,
  mime_type         text not null,
  size_bytes        bigint not null default 0,
  change_note       text,
  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),

  constraint trazadoc_file_document_versions_org_id_uniq unique (organization_id, id),
  constraint trazadoc_file_document_versions_uniq unique (file_document_id, version_number),
  constraint trazadoc_file_document_versions_status_check check (status in ('draft', 'in_review', 'approved', 'obsolete')),
  constraint trazadoc_file_document_versions_document_fk
    foreign key (organization_id, file_document_id)
    references public.trazadoc_file_documents (organization_id, id)
    on delete cascade
);

create index trazadoc_file_document_versions_document_idx
  on public.trazadoc_file_document_versions (file_document_id, version_number desc);

create trigger t_trazadoc_file_document_versions_force_created_by
  before insert on public.trazadoc_file_document_versions
  for each row execute function public.force_created_by();

alter table public.trazadoc_file_document_versions enable row level security;

create policy trazadoc_file_document_versions_select on public.trazadoc_file_document_versions
  for select to authenticated
  using (public.is_org_member(organization_id));

-- INSERT: mismo criterio de estado que trazadoc_document_versions (0043)
-- — consultant nunca inserta una versión 'approved'/'obsolete'.
create policy trazadoc_file_document_versions_insert on public.trazadoc_file_document_versions
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
-- 4. v_trazadoc_document_master — vista unificada (Parte 8.4).
--    security_invoker = true: hereda la RLS real de ambas tablas
--    origen — nunca una fuga cruzada entre empresas, cada quien ve
--    exactamente lo que ya podía ver por separado.
-- ---------------------------------------------------------------------------
create view public.v_trazadoc_document_master
with (security_invoker = true) as
select
  d.organization_id,
  'live_document'::text                          as source_type,
  d.id                                             as document_id,
  d.category_code,
  case d.category_code
    when 'manual' then 'Manuales'
    when 'procedure' then 'Procedimientos'
    when 'instruction' then 'Instructivos'
    when 'record' then 'Registros'
    when 'technical_support' then 'Soportes técnicos'
    when 'policy' then 'Políticas'
    when 'format' then 'Formatos'
    else 'Otros'
  end                                              as category_label,
  d.code,
  d.title,
  d.description,
  d.status,
  'v' || d.current_version                         as version_label,
  d.current_version,
  d.owner_id,
  owner.full_name                                  as owner_name,
  owner.full_name                                  as responsible_name,
  d.updated_at,
  d.approved_at,
  null::text                                       as file_name,
  null::text                                       as mime_type,
  null::bigint                                      as size_bytes,
  'open'::text                                     as action_type,
  '/trazadocs/' || d.id::text                       as action_href
from public.trazadoc_documents d
left join public.profiles owner on owner.id = d.owner_id

union all

select
  f.organization_id,
  'file_document'::text                           as source_type,
  f.id                                              as document_id,
  f.category_code,
  case f.category_code
    when 'manual' then 'Manuales'
    when 'procedure' then 'Procedimientos'
    when 'instruction' then 'Instructivos'
    when 'record' then 'Registros'
    when 'technical_support' then 'Soportes técnicos'
    when 'policy' then 'Políticas'
    when 'format' then 'Formatos'
    else 'Otros'
  end                                               as category_label,
  f.code,
  f.title,
  f.description,
  f.status,
  f.version_label,
  f.current_version,
  f.owner_id,
  owner.full_name                                   as owner_name,
  owner.full_name                                   as responsible_name,
  f.updated_at,
  f.approved_at,
  f.file_name,
  f.mime_type,
  f.size_bytes,
  'download'::text                                  as action_type,
  null::text                                         as action_href
from public.trazadoc_file_documents f
left join public.profiles owner on owner.id = f.owner_id;

-- ---------------------------------------------------------------------------
-- 5. change_trazadoc_file_document_status — transición de estado atómica,
--    MISMO patrón exacto que change_trazadoc_document_status (0046/0047)
--    para documentos vivos: snapshot de versión + actualización del
--    documento en una sola transacción SECURITY DEFINER. Una actualización
--    directa vía UPDATE nunca puede cambiar el estado (RLS de arriba
--    exige status en draft/in_review tanto antes como después) — esta es
--    la única vía real.
-- ---------------------------------------------------------------------------
create or replace function public.change_trazadoc_file_document_status(
  p_file_document_id uuid,
  p_to_status text,
  p_change_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        uuid;
  v_doc         record;
  v_role        text;
  v_new_version integer;
  v_snapshot    jsonb;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'No autenticado';
  end if;

  if p_to_status not in ('draft', 'in_review', 'approved', 'obsolete') then
    raise exception 'Estado no válido';
  end if;

  select * into v_doc from trazadoc_file_documents where id = p_file_document_id for update;
  if v_doc.id is null then
    raise exception 'El documento no existe';
  end if;

  if not is_org_member(v_doc.organization_id) then
    raise exception 'No perteneces a la empresa de este documento';
  end if;

  select m.role_code into v_role
  from memberships m
  where m.organization_id = v_doc.organization_id and m.user_id = v_user and m.status = 'active';

  if v_role not in ('admin', 'quality', 'consultant') then
    raise exception 'Tu rol no permite cambiar el estado de este documento';
  end if;

  -- Mismas reglas que trazadoc_documents (0047): consultant nunca aprueba
  -- ni marca obsoleto, y nunca reabre un documento QUE YA ESTABA aprobado.
  if v_role = 'consultant' then
    if p_to_status not in ('draft', 'in_review') then
      raise exception 'Tu rol no permite aprobar ni marcar obsoleto este documento';
    end if;
    if v_doc.status = 'approved' then
      raise exception 'Tu rol no permite reabrir un documento aprobado';
    end if;
  end if;

  if v_doc.status = 'obsolete' and p_to_status <> 'obsolete' and v_role <> 'admin' then
    raise exception 'Solo un administrador puede reactivar un documento obsoleto';
  end if;

  if v_doc.status = 'approved' and p_to_status = 'draft' and v_role not in ('admin', 'quality') then
    raise exception 'Solo un administrador o supervisor puede crear una nueva versión en borrador de un documento aprobado';
  end if;

  v_new_version := v_doc.current_version + 1;

  v_snapshot := jsonb_build_object(
    'title', v_doc.title,
    'code', v_doc.code,
    'description', v_doc.description,
    'file_name', v_doc.file_name,
    'mime_type', v_doc.mime_type,
    'size_bytes', v_doc.size_bytes
  );

  insert into trazadoc_file_document_versions
    (organization_id, file_document_id, version_number, version_label, status, snapshot, storage_path, file_name, mime_type, size_bytes, change_note, created_by)
  values
    (v_doc.organization_id, p_file_document_id, v_new_version, 'v' || v_new_version, p_to_status, v_snapshot, v_doc.storage_path, v_doc.file_name, v_doc.mime_type, v_doc.size_bytes, p_change_note, v_user);

  update trazadoc_file_documents
  set
    status = p_to_status,
    current_version = v_new_version,
    version_label = 'v' || v_new_version,
    approved_by = case when p_to_status = 'approved' then v_user else approved_by end,
    approved_at = case when p_to_status = 'approved' then now() else approved_at end,
    obsolete_at = case when p_to_status = 'obsolete' then now() else obsolete_at end
  where id = p_file_document_id;

  return v_new_version;
end;
$$;

revoke execute on function public.change_trazadoc_file_document_status(uuid, text, text) from public, anon;
grant execute on function public.change_trazadoc_file_document_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. replace_trazadoc_file_document — subir un archivo nuevo como nueva
--    versión (Parte 14: "reemplazar archivo / nueva versión"). Si el
--    documento estaba aprobado, la nueva versión queda en borrador —
--    nunca se sobrescribe silenciosamente un archivo ya aprobado.
-- ---------------------------------------------------------------------------
create or replace function public.replace_trazadoc_file_document(
  p_file_document_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_change_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        uuid;
  v_doc         record;
  v_role        text;
  v_new_version integer;
  v_next_status text;
  v_snapshot    jsonb;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'No autenticado';
  end if;

  select * into v_doc from trazadoc_file_documents where id = p_file_document_id for update;
  if v_doc.id is null then
    raise exception 'El documento no existe';
  end if;

  if not is_org_member(v_doc.organization_id) then
    raise exception 'No perteneces a la empresa de este documento';
  end if;

  select m.role_code into v_role
  from memberships m
  where m.organization_id = v_doc.organization_id and m.user_id = v_user and m.status = 'active';

  if v_role not in ('admin', 'quality', 'consultant') then
    raise exception 'Tu rol no permite reemplazar el archivo de este documento';
  end if;
  if v_doc.status = 'obsolete' then
    raise exception 'Un documento obsoleto no se puede reemplazar directamente; reactívalo primero';
  end if;
  if v_doc.status = 'approved' and v_role not in ('admin', 'quality') then
    raise exception 'Solo un administrador o supervisor puede reemplazar el archivo de un documento aprobado';
  end if;

  -- Reemplazar el archivo de un aprobado SIEMPRE abre una nueva versión
  -- en borrador — nunca se sobrescribe silenciosamente un aprobado.
  v_next_status := case when v_doc.status = 'approved' then 'draft' else v_doc.status end;
  v_new_version := v_doc.current_version + 1;

  v_snapshot := jsonb_build_object(
    'title', v_doc.title,
    'code', v_doc.code,
    'description', v_doc.description,
    'file_name', p_file_name,
    'mime_type', p_mime_type,
    'size_bytes', p_size_bytes
  );

  insert into trazadoc_file_document_versions
    (organization_id, file_document_id, version_number, version_label, status, snapshot, storage_path, file_name, mime_type, size_bytes, change_note, created_by)
  values
    (v_doc.organization_id, p_file_document_id, v_new_version, 'v' || v_new_version, v_next_status, v_snapshot, p_storage_path, p_file_name, p_mime_type, p_size_bytes, p_change_note, v_user);

  update trazadoc_file_documents
  set
    status = v_next_status,
    current_version = v_new_version,
    version_label = 'v' || v_new_version,
    storage_path = p_storage_path,
    file_name = p_file_name,
    mime_type = p_mime_type,
    size_bytes = p_size_bytes
  where id = p_file_document_id;

  return v_new_version;
end;
$$;

revoke execute on function public.replace_trazadoc_file_document(uuid, text, text, text, bigint, text) from public, anon;
grant execute on function public.replace_trazadoc_file_document(uuid, text, text, text, bigint, text) to authenticated;
