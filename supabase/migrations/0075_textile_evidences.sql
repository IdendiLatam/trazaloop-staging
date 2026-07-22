-- 0075_textile_evidences.sql
-- Trazaloop · Sprint T5 (Textil) · Evidencias textiles.
--
-- ALCANCE ESTRICTO (T5): SOLO gestión de soportes documentales textiles y
-- sus vínculos con entidades textiles existentes (T3/T4). NADA de órdenes,
-- lotes, trazabilidad por lote, circularidad, TrazaDocs Textil, pasaporte,
-- QR ni planes (T6–T9 / Plataforma-M1). CERO cambios a objetos CPR
-- (evidences/evidence_links siguen intactos): se aplicó la OPCIÓN B del
-- encargo — tablas específicas textiles reutilizando solo los PATRONES de
-- CPR (0019 tabla + guard de estado, 0020 trigger polimórfico mismo-tenant,
-- 0015 bucket privado `evidences` por ruta).
--
-- STORAGE (decisión D-T5-01): se REUTILIZA el bucket privado `evidences`
-- SIN migración de storage. Ruta textil:
--   {organization_id}/textiles/{evidence_id}/{filename}
-- El PRIMER segmento sigue siendo organization_id, así que las políticas de
-- 0015/0016 aplican tal cual (lectura de miembros; subida
-- admin/quality/consultant; sin anon; sin URLs públicas — solo signed URLs).
--
-- LENGUAJE (N-05): "accepted" significa ACEPTACIÓN INTERNA como soporte
-- documental — jamás certificación externa, cumplimiento automático ni
-- pasaporte oficial.

-- ---------------------------------------------------------------------------
-- textile_evidences (soporte documental cargado por la empresa)
-- ---------------------------------------------------------------------------
create table public.textile_evidences (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  title           text not null,
  evidence_type   text not null default 'other',
  description     text,
  document_date   date,
  issuer          text,
  reference_code  text,
  file_name       text,
  file_path       text not null,
  file_mime_type  text,
  file_size_bytes bigint,
  status          text not null default 'pending_review',
  review_notes    text,
  valid_from      date,
  valid_until     date,
  is_active       boolean not null default true,
  created_by      uuid references public.profiles (id),
  updated_by      uuid references public.profiles (id),
  reviewed_by     uuid references public.profiles (id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint textile_evidences_org_id_uniq unique (organization_id, id),
  constraint textile_evidences_type_check
    check (evidence_type in (
      'supplier_datasheet', 'composition_certificate', 'supplier_declaration',
      'purchase_document', 'recycled_content_support', 'organic_material_support',
      'care_instruction_support', 'process_record', 'outsourced_process_support',
      'quality_record', 'traceability_support', 'photo_record', 'other'
    )),
  constraint textile_evidences_status_check
    check (status in ('pending_review', 'accepted', 'rejected', 'expired', 'archived')),
  constraint textile_evidences_validity_check
    check (valid_from is null or valid_until is null or valid_from <= valid_until)
);

create index textile_evidences_org_status_idx
  on public.textile_evidences (organization_id, status);
create index textile_evidences_org_type_idx
  on public.textile_evidences (organization_id, evidence_type);
create index textile_evidences_org_validity_idx
  on public.textile_evidences (organization_id, valid_until);

-- ---------------------------------------------------------------------------
-- textile_evidence_links (vínculo polimórfico evidencia ↔ entidad textil)
-- ---------------------------------------------------------------------------
create table public.textile_evidence_links (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  evidence_id     uuid not null,
  entity_type     text not null,
  entity_id       uuid not null,
  link_type       text not null default 'general_support',
  notes           text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  constraint textile_evidence_links_org_id_uniq unique (organization_id, id),
  constraint textile_evidence_links_uniq
    unique (organization_id, evidence_id, entity_type, entity_id, link_type),
  constraint textile_evidence_links_entity_check
    check (entity_type in (
      'supplier', 'material', 'component', 'process', 'outsourced_process',
      'collection', 'product', 'reference', 'fiber_composition',
      'reference_material', 'reference_component'
    )),
  constraint textile_evidence_links_type_check
    check (link_type in (
      'general_support', 'composition_support', 'origin_support',
      'recycled_claim_support', 'organic_claim_support', 'care_support',
      'supplier_support', 'process_support', 'outsourced_process_support',
      'traceability_support', 'review_support', 'other'
    )),
  -- FK compuesta: el vínculo solo puede apuntar a una evidencia de SU empresa.
  constraint textile_evidence_links_evidence_fk
    foreign key (organization_id, evidence_id)
    references public.textile_evidences (organization_id, id)
    on delete cascade
);

create index textile_evidence_links_evidence_idx
  on public.textile_evidence_links (evidence_id);
create index textile_evidence_links_entity_idx
  on public.textile_evidence_links (organization_id, entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Guard de estado (patrón guard_evidence_validation de 0019, ampliado):
--  · cambiar status: solo admin/quality (la revisión interna es acto de
--    aceptación/rechazo);
--  · reviewed_by / reviewed_at: solo cambian junto con una revisión de
--    admin/quality;
--  · una evidencia que ya salió de pending_review solo la edita
--    admin/quality (consultant carga y edita PENDIENTES).
-- SECURITY DEFINER para evaluar el rol con los helpers.
-- ---------------------------------------------------------------------------
create or replace function public.guard_textile_evidence_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at then
    if not public.has_org_role(new.organization_id, array['admin','quality']) then
      raise exception 'Solo administrador o calidad pueden cambiar el estado de revisión de una evidencia textil';
    end if;
  end if;

  if old.status <> 'pending_review'
     and not public.has_org_role(new.organization_id, array['admin','quality']) then
    raise exception 'Una evidencia textil ya revisada solo puede modificarla administrador o calidad';
  end if;

  return new;
end;
$$;
revoke execute on function public.guard_textile_evidence_review() from public, anon, authenticated;

create trigger t_textile_evidences_guard_review
  before update on public.textile_evidences
  for each row execute function public.guard_textile_evidence_review();

-- ---------------------------------------------------------------------------
-- Trigger polimórfico mismo-tenant (patrón validate_evidence_link_org de
-- 0020, para las 11 entidades textiles). Bloquea cross-tenant y tipos sin
-- tabla. SECURITY DEFINER para leer las tablas destino sin depender de RLS.
-- ---------------------------------------------------------------------------
create or replace function public.validate_textile_evidence_link_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_org uuid;
begin
  case new.entity_type
    when 'supplier'            then select organization_id into v_target_org from textile_suppliers                     where id = new.entity_id;
    when 'material'            then select organization_id into v_target_org from textile_materials                     where id = new.entity_id;
    when 'component'           then select organization_id into v_target_org from textile_components                    where id = new.entity_id;
    when 'process'             then select organization_id into v_target_org from textile_processes                     where id = new.entity_id;
    when 'outsourced_process'  then select organization_id into v_target_org from textile_outsourced_processes          where id = new.entity_id;
    when 'collection'          then select organization_id into v_target_org from textile_collections                   where id = new.entity_id;
    when 'product'             then select organization_id into v_target_org from textile_products                      where id = new.entity_id;
    when 'reference'           then select organization_id into v_target_org from textile_references                    where id = new.entity_id;
    when 'fiber_composition'   then select organization_id into v_target_org from textile_reference_fiber_composition   where id = new.entity_id;
    when 'reference_material'  then select organization_id into v_target_org from textile_reference_materials           where id = new.entity_id;
    when 'reference_component' then select organization_id into v_target_org from textile_reference_components          where id = new.entity_id;
    else
      raise exception 'Tipo de entidad % no disponible para vínculos de evidencia textil', new.entity_type;
  end case;

  if v_target_org is null then
    raise exception 'La entidad destino % del vínculo de evidencia textil no existe', new.entity_id;
  end if;

  if v_target_org <> new.organization_id then
    raise exception 'Vínculo de evidencia textil entre empresas bloqueado';
  end if;

  return new;
end;
$$;
revoke execute on function public.validate_textile_evidence_link_org() from public, anon, authenticated;

create trigger t_textile_evidence_links_same_org
  before insert or update on public.textile_evidence_links
  for each row execute function public.validate_textile_evidence_link_org();

-- ---------------------------------------------------------------------------
-- Triggers comunes (patrón 0020/0024)
-- ---------------------------------------------------------------------------
create trigger t_textile_evidences_updated before update on public.textile_evidences
  for each row execute function public.set_updated_at();
create trigger t_textile_evidences_force_created_by before insert on public.textile_evidences
  for each row execute function public.force_created_by();
create trigger t_textile_evidences_org_immutable before update on public.textile_evidences
  for each row execute function public.prevent_organization_id_change();
create trigger t_audit_textile_evidences after insert or update or delete on public.textile_evidences
  for each row execute function public.audit_row_change();

create trigger t_textile_evidence_links_force_created_by before insert on public.textile_evidence_links
  for each row execute function public.force_created_by();
create trigger t_textile_evidence_links_org_immutable before update on public.textile_evidence_links
  for each row execute function public.prevent_organization_id_change();
create trigger t_audit_textile_evidence_links after insert or update or delete on public.textile_evidence_links
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- RLS (plantilla evidences 0019: select/insert/update miembros con guardas
-- de estado por trigger; delete de evidencias solo admin/quality y nunca
-- una aceptada; vínculos: quitar es edición normal → delete también para
-- consultant, patrón de asociaciones T4/0025)
-- ---------------------------------------------------------------------------
alter table public.textile_evidences      enable row level security;
alter table public.textile_evidence_links enable row level security;

create policy textile_evidences_select on public.textile_evidences
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_evidences_insert on public.textile_evidences
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and status = 'pending_review'
  );
create policy textile_evidences_update on public.textile_evidences
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy textile_evidences_delete on public.textile_evidences
  for delete to authenticated
  using (
    public.has_org_role(organization_id, array['admin','quality'])
    and status <> 'accepted'
  );

create policy textile_evidence_links_select on public.textile_evidence_links
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_evidence_links_insert on public.textile_evidence_links
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy textile_evidence_links_delete on public.textile_evidence_links
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']));
