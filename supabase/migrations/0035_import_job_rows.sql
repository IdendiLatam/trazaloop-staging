-- 0035_import_job_rows.sql
-- Trazaloop · Sprint 7 · Carga masiva real de datos por CSV: detalle por fila.
--
-- import_jobs (0021) ya existe y sigue siendo el registro histórico
-- INMUTABLE de cada evento de importación (uno por validación, otro por
-- commit — igual que el importador de catálogos de Sprint 2/3: nunca se
-- actualiza, solo se inserta). Lo que faltaba era detalle POR FILA (qué
-- pasó con cada fila, con qué datos, con qué errores/advertencias y qué
-- registro de negocio creó) para poder mostrar una vista previa real y
-- reutilizar las filas ya parseadas/validadas entre el paso de validación y
-- el de confirmación sin volver a confiar en nada que envíe el cliente.
--
-- Esta migración SOLO amplía el importador existente: no toca el motor de
-- cálculo, no cambia metodología, no crea datos.

-- ---------------------------------------------------------------------------
-- 1. Ampliar import_jobs.entity con las entidades nuevas del Sprint 7.
--    (Mismo patrón que 0027_import_input_batches.sql.)
-- ---------------------------------------------------------------------------
alter table public.import_jobs
  drop constraint import_jobs_entity_check;

alter table public.import_jobs
  add constraint import_jobs_entity_check
  check (entity in (
    'suppliers',
    'product_families',
    'products',
    'materials',
    'input_batches',
    'evidences',
    'production_orders',
    'batch_consumption',
    'output_batches',
    'batch_composition'
  ));

-- ---------------------------------------------------------------------------
-- 2. import_job_rows — una fila por fila del CSV.
-- ---------------------------------------------------------------------------
create table public.import_job_rows (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  import_job_id     uuid not null,
  row_number        integer not null,
  status            text not null default 'pending',
  entity_type       text not null,
  raw_data          jsonb not null default '{}'::jsonb,
  normalized_data   jsonb not null default '{}'::jsonb,
  errors            jsonb not null default '[]'::jsonb,
  warnings          jsonb not null default '[]'::jsonb,
  created_entity_id uuid null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint import_job_rows_org_id_uniq unique (organization_id, id),
  constraint import_job_rows_row_number_positive check (row_number > 0),

  constraint import_job_rows_status_check check (
    status in ('pending', 'valid', 'warning', 'error', 'imported', 'skipped')
  ),

  constraint import_job_rows_entity_type_check check (
    entity_type in (
      'supplier',
      'material',
      'evidence',
      'product_family',
      'product',
      'input_batch',
      'production_order',
      'batch_consumption',
      'output_batch',
      'batch_composition'
    )
  ),

  -- FK COMPUESTA (regla obligatoria desde 0024): la fila solo puede
  -- pertenecer a un import_job de la MISMA empresa. import_jobs es
  -- append-only (sin política de update/delete): esta tabla es la única
  -- pieza mutable del importador, y solo mientras dura el ciclo
  -- validar→confirmar.
  constraint import_job_rows_job_fk
    foreign key (organization_id, import_job_id)
    references public.import_jobs (organization_id, id)
    on delete cascade
);

create index import_job_rows_job_idx on public.import_job_rows (import_job_id, row_number);
create index import_job_rows_org_status_idx on public.import_job_rows (organization_id, status);

-- ---------------------------------------------------------------------------
-- 3. Triggers.
--    Sin force_created_by: la tabla no tiene columna created_by (no hace
--    falta: la autoría está en el import_job padre, que sí la fuerza).
--    Sin audit_row_change: import_job_rows YA ES detalle de auditoría de la
--    importación (raw_data/normalized_data/errors/warnings quedan
--    guardados en la propia fila); auditarla en audit_log duplicaría el
--    mismo dato sin aportar nada, igual que import_jobs (0021) tampoco se
--    audita.
-- ---------------------------------------------------------------------------
create trigger t_import_job_rows_updated
  before update on public.import_job_rows
  for each row execute function public.set_updated_at();

create trigger t_import_job_rows_org_immutable
  before update on public.import_job_rows
  for each row execute function public.prevent_organization_id_change();

-- ---------------------------------------------------------------------------
-- 4. RLS
--    select: cualquier miembro · insert/update: admin, quality, consultant ·
--    delete: solo admin/quality (limpieza excepcional; el flujo normal
--    nunca borra filas de importación).
-- ---------------------------------------------------------------------------
alter table public.import_job_rows enable row level security;

create policy import_job_rows_select on public.import_job_rows
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy import_job_rows_insert on public.import_job_rows
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
  );

create policy import_job_rows_update on public.import_job_rows
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));

create policy import_job_rows_delete on public.import_job_rows
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

-- NOTA: organization_id NUNCA viaja desde el cliente (server/actions/imports.ts
-- lo toma siempre de la empresa activa validada en servidor). El CSV que
-- trae una columna "organization_id" se rechaza ANTES de llegar aquí (capa
-- pura, lib/imports/parse.ts), y aunque no se rechazara, esta fila jamás
-- lee esa columna del archivo: organization_id es un parámetro de servidor,
-- no un campo mapeado desde raw_data.
