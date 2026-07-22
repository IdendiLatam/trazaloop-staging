-- 0084_textile_technical_passports.sql
-- Trazaloop · Sprint T9A (Textil) · Base técnica del pasaporte técnico
-- textil: tabla, versionamiento por registros, snapshot protegido,
-- validación de destino, RLS multiempresa, RPCs controladas y ampliación
-- aditiva de vínculos de evidencias.
--
-- Fuente de verdad: docs/modules/textiles/TEXTILES_T9_0_* (arquitectura).
-- El pasaporte es un SNAPSHOT (no una vista viva): congela el estado
-- técnico de una referencia/SKU y, opcionalmente, de un lote producido, en
-- el momento de generación. Un registro por versión (passport_code estable
-- + passport_version incremental). Ciclo de estados OFICIAL:
--   draft -> generated -> in_review -> approved_internal -> obsolete
-- 'approved_internal' NUNCA significa aprobación externa.
--
-- NOMBRE CORRECTO: textile_technical_passports (NO textile_material_passports).
--
-- ALCANCE T9A: modelo + snapshot base + seguridad. SIN UI, SIN rutas, SIN
-- builder completo de fuentes (eso es T9B), SIN QR/portal/PDF (T9C/T9D).
-- CERO cambios funcionales a CPR. La única tabla nueva es la del pasaporte;
-- las evidencias reutilizan textile_evidence_links (ampliación aditiva,
-- como hizo 0080). El snapshot y los campos calculados solo los escribe la
-- RPC de generación bajo un flag transaccional interno (patrón T7.1); son
-- inmutables una vez el pasaporte deja de ser 'draft'.
--
-- LENGUAJE (N-05): preparación documental, soporte documental, aprobado
-- internamente, brechas documentales. Sin promesas de certificación,
-- cumplimiento o sello. El ESPR se cita como "ESPR (UE) 2024/1781".

-- ---------------------------------------------------------------------------
-- 1. Tabla principal
-- ---------------------------------------------------------------------------
create table public.textile_technical_passports (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete restrict,

  passport_code             text not null,
  passport_version          integer not null default 1,

  reference_id              uuid not null,
  output_lot_id             uuid,
  circularity_assessment_id uuid,

  status                    text not null default 'draft',

  -- Snapshot y derivados: SOLO los escribe la RPC de generación bajo el
  -- flag interno; nacen vacíos y quedan inmutables tras 'generated'.
  snapshot_json             jsonb not null default '{}'::jsonb,
  data_sources_json         jsonb not null default '{}'::jsonb,
  gaps_json                 jsonb not null default '[]'::jsonb,
  warnings_json             jsonb not null default '[]'::jsonb,
  recommendations_json      jsonb not null default '[]'::jsonb,
  source_hash               text,

  -- Sellos de ciclo de vida (usuarios de la organización; los escribe el
  -- servidor con auth.uid(), nunca el cliente).
  generated_at              timestamptz,
  generated_by              uuid references public.profiles (id),
  reviewed_at               timestamptz,
  reviewed_by               uuid references public.profiles (id),
  approved_at               timestamptz,
  approved_by               uuid references public.profiles (id),
  obsolete_at               timestamptz,
  obsolete_by               uuid references public.profiles (id),

  notes                     text,
  created_by                uuid references public.profiles (id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint textile_passports_org_id_uniq unique (organization_id, id),
  constraint textile_passports_code_version_uniq
    unique (organization_id, passport_code, passport_version),
  constraint textile_passports_status_check
    check (status in ('draft', 'generated', 'in_review', 'approved_internal', 'obsolete')),
  constraint textile_passports_version_positive check (passport_version >= 1),

  -- FKs compuestas: referencia/lote/evaluación deben ser de la MISMA
  -- organización (las tres exponen unique(organization_id, id)).
  constraint textile_passports_reference_fk
    foreign key (organization_id, reference_id)
    references public.textile_references (organization_id, id),
  constraint textile_passports_output_lot_fk
    foreign key (organization_id, output_lot_id)
    references public.textile_output_lots (organization_id, id),
  constraint textile_passports_assessment_fk
    foreign key (organization_id, circularity_assessment_id)
    references public.textile_circularity_assessments (organization_id, id)
);

create index textile_passports_reference_idx
  on public.textile_technical_passports (organization_id, reference_id);
create index textile_passports_output_lot_idx
  on public.textile_technical_passports (organization_id, output_lot_id);
create index textile_passports_status_idx
  on public.textile_technical_passports (organization_id, status);
create index textile_passports_code_idx
  on public.textile_technical_passports (organization_id, passport_code);

-- Triggers estándar del módulo (mismos que 0080).
create trigger t_textile_passports_updated
  before update on public.textile_technical_passports
  for each row execute function public.set_updated_at();
create trigger t_textile_passports_force_created_by
  before insert on public.textile_technical_passports
  for each row execute function public.force_created_by();
create trigger t_textile_passports_org_immutable
  before update on public.textile_technical_passports
  for each row execute function public.prevent_organization_id_change();
create trigger t_audit_textile_passports
  after insert or update or delete on public.textile_technical_passports
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- 2. Validación de destino (espejo de validate_..._target de 0080)
-- ---------------------------------------------------------------------------
-- El lote (si está) debe pertenecer a una orden de la MISMA reference_id, y
-- la evaluación de circularidad (si está) debe ser de esa reference_id.
-- Las FKs compuestas solo garantizan misma organización; la coherencia con
-- la referencia no es expresable por FK (el lote referencia una orden).
create or replace function public.validate_textile_technical_passport_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot_reference uuid;
  v_assessment_reference uuid;
begin
  if new.output_lot_id is not null then
    select po.reference_id into v_lot_reference
      from textile_output_lots ol
      join textile_production_orders po on po.id = ol.order_id
     where ol.id = new.output_lot_id;
    if v_lot_reference is null or v_lot_reference <> new.reference_id then
      raise exception 'El lote producido del pasaporte debe pertenecer a una orden de la misma referencia.';
    end if;
  end if;

  if new.circularity_assessment_id is not null then
    select ca.reference_id into v_assessment_reference
      from textile_circularity_assessments ca
     where ca.id = new.circularity_assessment_id;
    if v_assessment_reference is null or v_assessment_reference <> new.reference_id then
      raise exception 'La evaluación de circularidad del pasaporte debe corresponder a la misma referencia.';
    end if;
  end if;

  return new;
end;
$$;
revoke execute on function public.validate_textile_technical_passport_target() from public, anon, authenticated;

create trigger t_textile_passports_target
  before insert or update on public.textile_technical_passports
  for each row execute function public.validate_textile_technical_passport_target();

-- ---------------------------------------------------------------------------
-- 3. Protección del snapshot y campos calculados (patrón T7.1)
-- ---------------------------------------------------------------------------
-- Flag transaccional interno: solo lo activan las RPCs controladas de
-- generación/transición (set_config(..., true)); el trigger solo LO LEE.
-- Sin el flag:
--   · INSERT: el pasaporte debe nacer 'draft' con snapshot/derivados vacíos
--     y sin sellos — no puede nacer 'generated'/'approved_internal' ni con
--     un snapshot/score/brechas fabricados desde el cliente.
--   · UPDATE: una vez el estado dejó de ser 'draft', el snapshot, sus
--     derivados, el hash y la identidad (reference/output_lot/code/version)
--     son INMUTABLES — el snapshot de un pasaporte generado no se edita; los
--     cambios exigen una nueva versión (nuevo registro).
create or replace function public.protect_textile_technical_passport_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('trazaloop.textile_passport_generate', true), 'off') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' then
      raise exception 'Un pasaporte técnico textil debe crearse como borrador. La generación ocurre mediante el flujo controlado.';
    end if;
    if coalesce(new.snapshot_json, '{}'::jsonb) <> '{}'::jsonb
       or coalesce(new.data_sources_json, '{}'::jsonb) <> '{}'::jsonb
       or coalesce(new.gaps_json, '[]'::jsonb) <> '[]'::jsonb
       or coalesce(new.warnings_json, '[]'::jsonb) <> '[]'::jsonb
       or coalesce(new.recommendations_json, '[]'::jsonb) <> '[]'::jsonb
       or new.source_hash is not null
       or new.generated_at is not null or new.generated_by is not null
       or new.reviewed_at is not null or new.reviewed_by is not null
       or new.approved_at is not null or new.approved_by is not null
       or new.obsolete_at is not null or new.obsolete_by is not null then
      raise exception 'El snapshot y los campos calculados del pasaporte no pueden fijarse al crearlo. Se generan desde los datos fuente.';
    end if;
    return new;
  end if;

  -- UPDATE: una vez generado, snapshot e identidad son inmutables.
  if old.status is distinct from 'draft' then
    if new.snapshot_json is distinct from old.snapshot_json
       or new.data_sources_json is distinct from old.data_sources_json
       or new.gaps_json is distinct from old.gaps_json
       or new.warnings_json is distinct from old.warnings_json
       or new.recommendations_json is distinct from old.recommendations_json
       or new.source_hash is distinct from old.source_hash then
      raise exception 'El snapshot de un pasaporte generado no puede modificarse. Cree una nueva versión.';
    end if;
  end if;
  if new.reference_id is distinct from old.reference_id
     or new.output_lot_id is distinct from old.output_lot_id
     or new.passport_code is distinct from old.passport_code
     or new.passport_version is distinct from old.passport_version then
    raise exception 'La identidad del pasaporte (referencia, lote, código y versión) no puede cambiarse.';
  end if;

  return new;
end;
$$;
revoke execute on function public.protect_textile_technical_passport_snapshot() from public, anon, authenticated;

create trigger t_textile_passports_protect_snapshot
  before insert or update on public.textile_technical_passports
  for each row execute function public.protect_textile_technical_passport_snapshot();

-- ---------------------------------------------------------------------------
-- 4. RLS por organización (deny-by-default; espejo de 0080)
-- ---------------------------------------------------------------------------
alter table public.textile_technical_passports enable row level security;

create policy textile_passports_select on public.textile_technical_passports
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_passports_insert on public.textile_technical_passports
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy textile_passports_update on public.textile_technical_passports
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['admin','quality'])
    or (
      public.has_org_role(organization_id, array['consultant'])
      and status in ('draft', 'in_review')
    )
  )
  with check (
    public.has_org_role(organization_id, array['admin','quality'])
    or (
      public.has_org_role(organization_id, array['consultant'])
      and status in ('draft', 'in_review')
    )
  );
create policy textile_passports_delete on public.textile_technical_passports
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']) and status = 'draft');

-- ---------------------------------------------------------------------------
-- 5. Vínculos de evidencia: ampliación ADITIVA (como 0080)
-- ---------------------------------------------------------------------------
-- Se añade 'technical_passport' a entity_type y 'passport_support' a
-- link_type, conservando TODOS los valores previos. Uso vivo (navegación)
-- en T9B; el snapshot conserva los estados del momento.
alter table public.textile_evidence_links
  drop constraint textile_evidence_links_entity_check;
alter table public.textile_evidence_links
  add constraint textile_evidence_links_entity_check
  check (entity_type in (
    'supplier', 'material', 'component', 'process', 'outsourced_process',
    'collection', 'product', 'reference', 'fiber_composition',
    'reference_material', 'reference_component',
    'production_order', 'input_lot', 'order_consumption',
    'order_process_step', 'output_lot',
    'circularity_assessment',
    'technical_passport'
  ));

alter table public.textile_evidence_links
  drop constraint textile_evidence_links_type_check;
alter table public.textile_evidence_links
  add constraint textile_evidence_links_type_check
  check (link_type in (
    'general_support', 'composition_support', 'origin_support',
    'recycled_claim_support', 'organic_claim_support', 'care_support',
    'supplier_support', 'process_support', 'outsourced_process_support',
    'traceability_support', 'review_support', 'other',
    'production_order_support', 'input_lot_support', 'consumption_support',
    'process_execution_support', 'output_lot_support',
    'circularity_support', 'recyclability_support', 'repairability_support',
    'separation_support', 'reuse_support', 'end_of_life_support',
    'passport_support'
  ));

-- validate_textile_evidence_link_org() (0080) resuelve la organización del
-- target por entity_type. Se extiende para 'technical_passport' de forma
-- que un pasaporte solo pueda enlazar evidencias de su propia organización.
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
    when 'supplier' then select organization_id into v_target_org from textile_suppliers where id = new.entity_id;
    when 'material' then select organization_id into v_target_org from textile_materials where id = new.entity_id;
    when 'component' then select organization_id into v_target_org from textile_components where id = new.entity_id;
    when 'process' then select organization_id into v_target_org from textile_processes where id = new.entity_id;
    when 'outsourced_process' then select organization_id into v_target_org from textile_outsourced_processes where id = new.entity_id;
    when 'collection' then select organization_id into v_target_org from textile_collections where id = new.entity_id;
    when 'product' then select organization_id into v_target_org from textile_products where id = new.entity_id;
    when 'reference' then select organization_id into v_target_org from textile_references where id = new.entity_id;
    when 'fiber_composition' then select organization_id into v_target_org from textile_reference_fiber_composition where id = new.entity_id;
    when 'reference_material' then select organization_id into v_target_org from textile_reference_materials where id = new.entity_id;
    when 'reference_component' then select organization_id into v_target_org from textile_reference_components where id = new.entity_id;
    when 'production_order' then select organization_id into v_target_org from textile_production_orders where id = new.entity_id;
    when 'input_lot' then select organization_id into v_target_org from textile_input_lots where id = new.entity_id;
    when 'order_consumption' then select organization_id into v_target_org from textile_order_consumptions where id = new.entity_id;
    when 'order_process_step' then select organization_id into v_target_org from textile_order_process_steps where id = new.entity_id;
    when 'output_lot' then select organization_id into v_target_org from textile_output_lots where id = new.entity_id;
    when 'circularity_assessment' then select organization_id into v_target_org from textile_circularity_assessments where id = new.entity_id;
    when 'technical_passport' then select organization_id into v_target_org from textile_technical_passports where id = new.entity_id;
    else
      raise exception 'Tipo de entidad % no disponible para vínculos de evidencia textil', new.entity_type;
  end case;

  if v_target_org is null then
    raise exception 'La entidad vinculada no existe';
  end if;
  if v_target_org <> new.organization_id then
    raise exception 'La evidencia y la entidad vinculada deben pertenecer a la misma organización';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC: generar / refrescar el snapshot BASE
-- ---------------------------------------------------------------------------
-- T9A entrega el snapshot BASE (identidad + esqueleto de secciones +
-- schema_version). T9B lo llenará desde las fuentes reales. La RPC:
--   · verifica sesión, organización, módulo Textil habilitado y rol;
--   · exige que el pasaporte esté en 'draft' (o ya 'generated' para
--     refrescar el base);
--   · activa el flag interno y escribe snapshot/hash/estado bajo control;
--   · pasa el pasaporte a 'generated'.
-- El snapshot base incluye SIEMPRE schema_version = 'textile_technical_passport_v1'.
create or replace function public.generate_textile_technical_passport_base(p_passport_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_status text;
  v_ref uuid;
  v_lot uuid;
  v_assessment uuid;
  v_snapshot jsonb;
  v_sources jsonb;
  v_hash text;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;

  select organization_id, status, reference_id, output_lot_id, circularity_assessment_id
    into v_org, v_status, v_ref, v_lot, v_assessment
    from textile_technical_passports where id = p_passport_id;

  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'El pasaporte no existe o no pertenece a tu organización';
  end if;
  if not exists (
    select 1 from organization_modules
     where organization_id = v_org and module_code = 'textiles' and enabled
  ) then
    raise exception 'El módulo Textil no está habilitado para la organización';
  end if;
  if not public.has_org_role(v_org, array['admin','quality','consultant']) then
    raise exception 'Tu rol no permite generar el pasaporte';
  end if;
  if v_status not in ('draft', 'generated') then
    raise exception 'Solo un pasaporte en borrador o recién generado puede (re)generar su snapshot base. Para cambios sustanciales, cree una nueva versión.';
  end if;

  -- Snapshot BASE: identidad + esqueleto de secciones (T9B llena el detalle).
  -- schema_version es OBLIGATORIO.
  v_snapshot := jsonb_build_object(
    'schema_version', 'textile_technical_passport_v1',
    'generated_at', now(),
    'scope', case when v_lot is null then 'reference_only' else 'reference_and_lot' end,
    'passport', jsonb_build_object(
      'reference_id', v_ref,
      'output_lot_id', v_lot,
      'circularity_assessment_id', v_assessment
    ),
    'sections', jsonb_build_object(
      'passport_identification', jsonb_build_object('completeness_status', 'pending'),
      'product_identification', jsonb_build_object('completeness_status', 'pending'),
      'fiber_composition', jsonb_build_object('completeness_status', 'pending'),
      'materials', jsonb_build_object('completeness_status', 'pending'),
      'components', jsonb_build_object('completeness_status', 'pending'),
      'suppliers_processes', jsonb_build_object('completeness_status', 'pending'),
      'evidences', jsonb_build_object('completeness_status', 'pending'),
      'traceability', jsonb_build_object('completeness_status',
        case when v_lot is null then 'not_applicable' else 'pending' end),
      'circularity', jsonb_build_object('completeness_status', 'pending'),
      'care_repair_eol', jsonb_build_object('completeness_status', 'pending'),
      'claims', jsonb_build_object('completeness_status', 'pending'),
      'trazadocs', jsonb_build_object('completeness_status', 'pending'),
      'gaps_and_warnings', jsonb_build_object('completeness_status', 'pending'),
      'executive_summary', jsonb_build_object('completeness_status', 'pending')
    ),
    'disclaimer', 'Este pasaporte técnico textil es una herramienta interna de preparación documental y trazabilidad. No equivale a certificación, sello, declaración regulatoria oficial ni pasaporte digital de producto oficial.'
  );

  -- data_sources base: identidad + marca de generación (T9B añade updated_at
  -- de cada fuente). source_hash base cubre la identidad; T9B lo recalcula
  -- sobre las fuentes reales.
  v_sources := jsonb_build_object(
    'reference_id', v_ref,
    'output_lot_id', v_lot,
    'circularity_assessment_id', v_assessment,
    'extracted_at', now()
  );
  v_hash := encode(digest(v_sources::text, 'sha256'), 'hex');

  -- Escritura controlada bajo el flag (el trigger de protección lo respeta).
  perform set_config('trazaloop.textile_passport_generate', 'on', true);
  update textile_technical_passports
     set snapshot_json = v_snapshot,
         data_sources_json = v_sources,
         source_hash = v_hash,
         status = 'generated',
         generated_at = now(),
         generated_by = auth.uid()
   where id = p_passport_id;
  perform set_config('trazaloop.textile_passport_generate', 'off', true);

  return v_hash;
end;
$$;
revoke execute on function public.generate_textile_technical_passport_base(uuid) from public, anon;
grant execute on function public.generate_textile_technical_passport_base(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPC: transición de estado (atómica, sellos controlados)
-- ---------------------------------------------------------------------------
-- draft -> generated (solo vía generate_..._base), generated -> in_review,
-- in_review -> approved_internal, y {generated,in_review,approved_internal}
-- -> obsolete. 'approved_internal' NUNCA es aprobación externa.
create or replace function public.change_textile_technical_passport_status(
  p_passport_id uuid,
  p_to_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_from text;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;
  select organization_id, status into v_org, v_from
    from textile_technical_passports where id = p_passport_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'El pasaporte no existe o no pertenece a tu organización';
  end if;
  if not exists (
    select 1 from organization_modules
     where organization_id = v_org and module_code = 'textiles' and enabled
  ) then
    raise exception 'El módulo Textil no está habilitado para la organización';
  end if;

  -- Transiciones válidas y rol requerido.
  if p_to_status = 'in_review' then
    if v_from <> 'generated' then
      raise exception 'Solo un pasaporte generado puede enviarse a revisión.';
    end if;
    if not public.has_org_role(v_org, array['admin','quality','consultant']) then
      raise exception 'Tu rol no permite enviar el pasaporte a revisión.';
    end if;
  elsif p_to_status = 'approved_internal' then
    if v_from not in ('generated', 'in_review') then
      raise exception 'Solo un pasaporte generado o en revisión puede aprobarse internamente.';
    end if;
    if not public.has_org_role(v_org, array['admin','quality']) then
      raise exception 'Solo administración o calidad pueden aprobar internamente el pasaporte.';
    end if;
  elsif p_to_status = 'obsolete' then
    if v_from not in ('generated', 'in_review', 'approved_internal') then
      raise exception 'Solo un pasaporte generado, en revisión o aprobado puede marcarse obsoleto.';
    end if;
    if not public.has_org_role(v_org, array['admin','quality']) then
      raise exception 'Solo administración o calidad pueden marcar el pasaporte obsoleto.';
    end if;
  else
    raise exception 'Transición de estado no válida para el pasaporte: %', p_to_status;
  end if;

  perform set_config('trazaloop.textile_passport_generate', 'on', true);
  update textile_technical_passports
     set status = p_to_status,
         reviewed_at = case when p_to_status = 'in_review' then now() else reviewed_at end,
         reviewed_by = case when p_to_status = 'in_review' then auth.uid() else reviewed_by end,
         approved_at = case when p_to_status = 'approved_internal' then now() else approved_at end,
         approved_by = case when p_to_status = 'approved_internal' then auth.uid() else approved_by end,
         obsolete_at = case when p_to_status = 'obsolete' then now() else obsolete_at end,
         obsolete_by = case when p_to_status = 'obsolete' then auth.uid() else obsolete_by end
   where id = p_passport_id;
  perform set_config('trazaloop.textile_passport_generate', 'off', true);
end;
$$;
revoke execute on function public.change_textile_technical_passport_status(uuid, text) from public, anon;
grant execute on function public.change_textile_technical_passport_status(uuid, text) to authenticated;
