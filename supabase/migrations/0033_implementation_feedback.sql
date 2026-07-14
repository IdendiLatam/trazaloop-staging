-- 0033_implementation_feedback.sql
-- Trazaloop · Sprint 6 · Implementación con empresa: registro de feedback.
--
-- Esta migración crea SOLO la tabla de feedback de la implementación real
-- (errores, dudas, hallazgos de prueba y mejoras) que se registra mientras
-- se prueba Trazaloop con una empresa y datos reales. NO crea caso piloto,
-- NO crea datos demo, NO cambia metodología de cálculo ni motor normativo.
--
-- Cumple la regla obligatoria (0024) para toda tabla nueva org-scoped:
-- RLS deny-by-default, unique(organization_id, id), FK compuestas donde
-- aplica, prevent_organization_id_change, set_updated_at, force_created_by
-- y audit_row_change.

-- ---------------------------------------------------------------------------
-- 1. Tabla implementation_feedback
-- ---------------------------------------------------------------------------
create table public.implementation_feedback (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,
  module                text not null,
  category              text not null,
  severity              text not null,
  status                text not null default 'open',
  title                 text not null,
  description           text not null,
  steps_to_reproduce    text,
  expected_result       text,
  actual_result         text,
  related_entity_type   text,
  related_entity_id     uuid,
  created_by            uuid references public.profiles (id),
  assigned_to           uuid references public.profiles (id),
  resolved_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint implementation_feedback_org_id_uniq unique (organization_id, id),

  constraint implementation_feedback_title_not_blank
    check (length(trim(title)) > 0),
  constraint implementation_feedback_description_not_blank
    check (length(trim(description)) > 0),

  constraint implementation_feedback_module_check check (
    module in (
      'auth',
      'organization',
      'catalog',
      'evidences',
      'traceability',
      'recycled_content',
      'audit_support',
      'guided_flow',
      'implementation',
      'other'
    )
  ),

  constraint implementation_feedback_category_check check (
    category in (
      'bug',
      'ux',
      'data_gap',
      'question',
      'improvement',
      'training',
      'other'
    )
  ),

  constraint implementation_feedback_severity_check check (
    severity in ('low', 'medium', 'high', 'critical')
  ),

  constraint implementation_feedback_status_check check (
    status in ('open', 'in_review', 'resolved', 'closed')
  ),

  -- El tipo de entidad relacionada es opcional; cuando viene informado debe
  -- ser uno de los conocidos por la app (Sprint 6). No hay FK compuesta
  -- porque la relación es polimórfica hacia varias tablas y hacia un
  -- concepto derivado (dossier/cálculo); el servidor valida pertenencia a
  -- la empresa activa cuando la tabla destino lo permite (server/actions).
  constraint implementation_feedback_related_entity_type_check check (
    related_entity_type is null or related_entity_type in (
      'supplier',
      'material',
      'evidence',
      'input_batch',
      'production_order',
      'output_batch',
      'calculation',
      'dossier',
      'other'
    )
  ),
  constraint implementation_feedback_related_entity_pair_check check (
    (related_entity_type is null) = (related_entity_id is null)
  )
);

create index implementation_feedback_org_status_idx
  on public.implementation_feedback (organization_id, status);
create index implementation_feedback_org_module_idx
  on public.implementation_feedback (organization_id, module);
create index implementation_feedback_org_severity_idx
  on public.implementation_feedback (organization_id, severity);
create index implementation_feedback_org_created_idx
  on public.implementation_feedback (organization_id, created_at desc);
create index implementation_feedback_related_idx
  on public.implementation_feedback (related_entity_type, related_entity_id);

-- ---------------------------------------------------------------------------
-- 2. Triggers obligatorios (funciones existentes, sin duplicar)
-- ---------------------------------------------------------------------------
create trigger t_implementation_feedback_updated
  before update on public.implementation_feedback
  for each row execute function public.set_updated_at();

create trigger t_implementation_feedback_org_immutable
  before update on public.implementation_feedback
  for each row execute function public.prevent_organization_id_change();

create trigger t_implementation_feedback_force_created_by
  before insert on public.implementation_feedback
  for each row execute function public.force_created_by();

create trigger t_audit_implementation_feedback
  after insert or update or delete on public.implementation_feedback
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- 3. resolved_at automático: se marca al pasar a 'resolved' y se limpia si
--    el feedback vuelve a abrirse. Espeja el patrón de reclassified_at en
--    materials (0020): un campo de auditoría que la app nunca escribe a mano.
-- ---------------------------------------------------------------------------
create or replace function public.set_implementation_feedback_resolved_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.resolved_at := now();
  elsif new.status <> 'resolved' and old.status = 'resolved' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.set_implementation_feedback_resolved_at()
  from public, anon, authenticated;

create trigger t_implementation_feedback_resolved_at
  before update on public.implementation_feedback
  for each row execute function public.set_implementation_feedback_resolved_at();

-- ---------------------------------------------------------------------------
-- 4. RLS
--    select: cualquier miembro activo de la empresa.
--    insert: miembro con rol admin, quality o consultant.
--    update: admin/quality (cualquier feedback) o el creador (el suyo).
--    delete: solo admin/quality.
-- ---------------------------------------------------------------------------
alter table public.implementation_feedback enable row level security;

create policy implementation_feedback_select on public.implementation_feedback
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy implementation_feedback_insert on public.implementation_feedback
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
  );

create policy implementation_feedback_update on public.implementation_feedback
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and (
      public.has_org_role(organization_id, array['admin','quality'])
      or created_by = auth.uid()
    )
  )
  with check (
    public.is_org_member(organization_id)
    and (
      public.has_org_role(organization_id, array['admin','quality'])
      or created_by = auth.uid()
    )
  );

create policy implementation_feedback_delete on public.implementation_feedback
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

-- NOTA: organization_id NUNCA viaja desde el cliente en Server Actions
-- (server/actions/implementation.ts); siempre se toma de la empresa activa
-- validada en servidor (requireActiveOrg). RLS + FK a organizations +
-- prevent_organization_id_change cierran cualquier intento de cruce entre
-- empresas aunque se manipule la petición.
