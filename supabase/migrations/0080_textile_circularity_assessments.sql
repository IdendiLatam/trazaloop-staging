-- 0080_textile_circularity_assessments.sql
-- Trazaloop · Sprint T7 (Textil) · Evaluación técnica de circularidad.
--
-- ALCANCE ESTRICTO: evaluación TÉCNICA INTERNA de preparación circular de
-- referencias/SKU (y opcionalmente de un lote producido/final). NADA de
-- TrazaDocs Textil, pasaporte técnico, QR, IA, ACV, huella de carbono,
-- certificación ni planes por módulo. CERO cambios a objetos CPR.
--
-- LENGUAJE (N-05): "evaluación técnica", "preparación circular",
-- "potencial de reciclabilidad/reutilización", "brecha", "recomendación
-- interna". El nivel "preparado" significa mayor preparación técnica según
-- la metodología interna — jamás describe cumplimiento ni equivale a una
-- verificación de terceros.
--
-- PRINCIPIO (encargo §2): el cálculo NO confía ciegamente en
-- textile_output_lots.traceability_status: lo usa como indicador auxiliar
-- y evalúa además datos reales (composición, materiales, componentes,
-- evidencias por estado, consumos y saldos).
--
-- LECCIONES APLICADAS DESDE EL DISEÑO (T2.1/T5.2/T6.1): los campos
-- calculados nacen protegidos por trigger + flag transaccional; solo la
-- función controlada de cálculo/finalización los escribe; una evaluación
-- completada es un snapshot histórico inmutable (para actualizar, se crea
-- una nueva evaluación).
--
-- RLS (patrón T3–T6 + T5.1): select miembros; insert/update
-- admin/quality/consultant; delete admin/quality. FINALIZAR: solo
-- admin/quality (validado en la RPC — el consultant puede preparar el
-- borrador y proponer; documentado).

-- ---------------------------------------------------------------------------
-- textile_circularity_methodologies (GLOBAL, versionada — patrón
-- textile_fiber_types: lectura para authenticated, sin escrituras de app)
-- ---------------------------------------------------------------------------
create table public.textile_circularity_methodologies (
  id          uuid primary key default gen_random_uuid(),
  method_code text not null,
  version     text not null,
  name        text not null,
  description text,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint textile_circularity_methodologies_code_version_uniq unique (method_code, version)
);

create trigger t_textile_circularity_methodologies_updated
  before update on public.textile_circularity_methodologies
  for each row execute function public.set_updated_at();

alter table public.textile_circularity_methodologies enable row level security;
create policy textile_circularity_methodologies_select on public.textile_circularity_methodologies
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- textile_circularity_criteria (GLOBAL: criterios de la metodología)
-- ---------------------------------------------------------------------------
create table public.textile_circularity_criteria (
  id                uuid primary key default gen_random_uuid(),
  methodology_id    uuid not null references public.textile_circularity_methodologies (id),
  code              text not null,
  dimension_key     text not null,
  question          text not null,
  help_text         text,
  weight            numeric(6, 2) not null,
  response_type     text not null default 'scale',
  allows_na         boolean not null default true,
  evidence_expected boolean not null default false,
  display_order     integer,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint textile_circularity_criteria_code_uniq unique (methodology_id, code),
  constraint textile_circularity_criteria_weight_check check (weight > 0),
  constraint textile_circularity_criteria_response_check
    check (response_type in ('yes_no', 'scale', 'derived', 'evidence_based')),
  constraint textile_circularity_criteria_dimension_check
    check (dimension_key in (
      'composition_transparency', 'traceability_evidence', 'material_strategy',
      'durability_care_repair', 'recyclability_separability', 'reuse_end_of_life'
    ))
);

create trigger t_textile_circularity_criteria_updated
  before update on public.textile_circularity_criteria
  for each row execute function public.set_updated_at();

alter table public.textile_circularity_criteria enable row level security;
create policy textile_circularity_criteria_select on public.textile_circularity_criteria
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- textile_circularity_assessments (evaluación por organización)
-- ---------------------------------------------------------------------------
create table public.textile_circularity_assessments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  methodology_id    uuid not null references public.textile_circularity_methodologies (id),
  assessment_code   text not null,
  reference_id      uuid not null,
  output_lot_id     uuid,
  assessment_date   date,
  status            text not null default 'draft',
  -- Campos CALCULADOS (protegidos por trigger + flag; solo la función
  -- controlada los escribe; jamás llegan del cliente):
  circularity_score numeric(5, 1),
  readiness_level   text,
  dimension_scores  jsonb not null default '{}',
  gaps              jsonb not null default '[]',
  recommendations   jsonb not null default '[]',
  calculated_at     timestamptz,
  completed_at      timestamptz,
  completed_by      uuid references public.profiles (id),
  notes             text,
  is_active         boolean not null default true,
  created_by        uuid references public.profiles (id),
  updated_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint textile_circularity_assessments_org_code_uniq unique (organization_id, assessment_code),
  constraint textile_circularity_assessments_org_id_uniq unique (organization_id, id),
  constraint textile_circularity_assessments_status_check
    check (status in ('draft', 'completed', 'archived')),
  constraint textile_circularity_assessments_level_check
    check (readiness_level is null or readiness_level in ('inicial', 'basico', 'intermedio', 'avanzado', 'preparado')),
  constraint textile_circularity_assessments_score_check
    check (circularity_score is null or (circularity_score >= 0 and circularity_score <= 100)),
  constraint textile_circularity_assessments_reference_fk
    foreign key (organization_id, reference_id)
    references public.textile_references (organization_id, id),
  constraint textile_circularity_assessments_output_lot_fk
    foreign key (organization_id, output_lot_id)
    references public.textile_output_lots (organization_id, id)
);

create index textile_circularity_assessments_reference_idx
  on public.textile_circularity_assessments (organization_id, reference_id);
create index textile_circularity_assessments_output_lot_idx
  on public.textile_circularity_assessments (organization_id, output_lot_id);

-- ---------------------------------------------------------------------------
-- textile_circularity_answers (respuestas por criterio)
-- ---------------------------------------------------------------------------
create table public.textile_circularity_answers (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  assessment_id  uuid not null,
  criterion_id   uuid not null references public.textile_circularity_criteria (id),
  answer_value   numeric(3, 2),
  answer_text    text,
  not_applicable boolean not null default false,
  evidence_notes text,
  created_by     uuid references public.profiles (id),
  updated_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint textile_circularity_answers_uniq unique (organization_id, assessment_id, criterion_id),
  constraint textile_circularity_answers_org_id_uniq unique (organization_id, id),
  constraint textile_circularity_answers_value_check
    check (answer_value is null or (answer_value >= 0 and answer_value <= 1)),
  constraint textile_circularity_answers_assessment_fk
    foreign key (organization_id, assessment_id)
    references public.textile_circularity_assessments (organization_id, id)
    on delete cascade
);

create index textile_circularity_answers_assessment_idx
  on public.textile_circularity_answers (assessment_id);

-- ---------------------------------------------------------------------------
-- Guardas de integridad
-- ---------------------------------------------------------------------------

-- El lote final (si se evalúa) debe pertenecer a una orden cuya referencia
-- coincida con la referencia evaluada (además de la FK compuesta por org).
create or replace function public.validate_textile_circularity_assessment_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot_reference uuid;
begin
  if new.output_lot_id is not null then
    select po.reference_id into v_lot_reference
      from textile_output_lots ol
      join textile_production_orders po on po.id = ol.order_id
     where ol.id = new.output_lot_id;
    if v_lot_reference is null or v_lot_reference <> new.reference_id then
      raise exception 'El lote producido evaluado debe pertenecer a una orden de la misma referencia';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.validate_textile_circularity_assessment_target() from public, anon, authenticated;

create trigger t_textile_circularity_assessments_target
  before insert or update on public.textile_circularity_assessments
  for each row execute function public.validate_textile_circularity_assessment_target();

-- Campos calculados protegidos (lección T6.1) + snapshot histórico:
--  · los campos calculados solo cambian bajo el flag transaccional
--    trazaloop.textile_circularity_calculate = 'on' (solo lo fija la
--    función controlada);
--  · una evaluación 'completed' es un snapshot: el ÚNICO cambio permitido
--    sin flag es archivarla (status → 'archived'); para actualizar la
--    circularidad se crea una NUEVA evaluación (sin reapertura);
--  · pasar a 'completed' también exige el flag (función de finalización).
create or replace function public.protect_textile_circularity_calculated_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_flag boolean :=
    coalesce(current_setting('trazaloop.textile_circularity_calculate', true), 'off') = 'on';
begin
  if v_flag then
    return new;
  end if;

  if new.circularity_score is distinct from old.circularity_score
     or new.readiness_level   is distinct from old.readiness_level
     or new.dimension_scores  is distinct from old.dimension_scores
     or new.gaps              is distinct from old.gaps
     or new.recommendations   is distinct from old.recommendations
     or new.calculated_at     is distinct from old.calculated_at
     or new.completed_at      is distinct from old.completed_at
     or new.completed_by      is distinct from old.completed_by then
    raise exception 'Los campos calculados de la evaluación de circularidad no pueden modificarse directamente. Deben recalcularse desde sus respuestas y datos.';
  end if;

  if old.status = 'completed' then
    if new.status = 'archived'
       and new.assessment_code = old.assessment_code
       and new.reference_id = old.reference_id
       and new.output_lot_id is not distinct from old.output_lot_id
       and new.assessment_date is not distinct from old.assessment_date
       and new.notes is not distinct from old.notes
       and new.is_active = old.is_active then
      return new;
    end if;
    raise exception 'Una evaluación completada es un registro histórico: solo puede archivarse. Crea una nueva evaluación para actualizar la circularidad.';
  end if;

  if new.status = 'completed' then
    raise exception 'La evaluación se completa mediante el flujo controlado de finalización.';
  end if;

  return new;
end;
$$;
revoke execute on function public.protect_textile_circularity_calculated_fields() from public, anon, authenticated;

create trigger t_textile_circularity_assessments_protect
  before update on public.textile_circularity_assessments
  for each row execute function public.protect_textile_circularity_calculated_fields();

-- Respuestas: N/A solo si el criterio lo permite; y las respuestas de una
-- evaluación completada quedan congeladas (snapshot).
create or replace function public.guard_textile_circularity_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_status text;
  v_allows boolean;
begin
  v_row := coalesce(new, old);

  select status into v_status
    from textile_circularity_assessments
   where id = v_row.assessment_id;
  if v_status is null then
    raise exception 'La evaluación de la respuesta no existe';
  end if;
  if v_status <> 'draft' then
    raise exception 'Las respuestas de una evaluación completada o archivada no pueden modificarse. Crea una nueva evaluación.';
  end if;

  if tg_op <> 'DELETE' and new.not_applicable then
    select allows_na into v_allows
      from textile_circularity_criteria
     where id = new.criterion_id;
    if not coalesce(v_allows, false) then
      raise exception 'Este criterio no admite la respuesta "no aplica"';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_textile_circularity_answer() from public, anon, authenticated;

create trigger t_textile_circularity_answers_guard
  before insert or update or delete on public.textile_circularity_answers
  for each row execute function public.guard_textile_circularity_answer();

-- ---------------------------------------------------------------------------
-- Triggers comunes (patrón 0020/0024)
-- ---------------------------------------------------------------------------
create trigger t_textile_circularity_assessments_updated before update on public.textile_circularity_assessments
  for each row execute function public.set_updated_at();
create trigger t_textile_circularity_answers_updated before update on public.textile_circularity_answers
  for each row execute function public.set_updated_at();

create trigger t_textile_circularity_assessments_force_created_by before insert on public.textile_circularity_assessments
  for each row execute function public.force_created_by();
create trigger t_textile_circularity_answers_force_created_by before insert on public.textile_circularity_answers
  for each row execute function public.force_created_by();

create trigger t_textile_circularity_assessments_org_immutable before update on public.textile_circularity_assessments
  for each row execute function public.prevent_organization_id_change();
create trigger t_textile_circularity_answers_org_immutable before update on public.textile_circularity_answers
  for each row execute function public.prevent_organization_id_change();

create trigger t_audit_textile_circularity_assessments after insert or update or delete on public.textile_circularity_assessments
  for each row execute function public.audit_row_change();
create trigger t_audit_textile_circularity_answers after insert or update or delete on public.textile_circularity_answers
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- RLS de las tablas por organización
-- ---------------------------------------------------------------------------
alter table public.textile_circularity_assessments enable row level security;
alter table public.textile_circularity_answers enable row level security;

create policy textile_circularity_assessments_select on public.textile_circularity_assessments
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_circularity_assessments_insert on public.textile_circularity_assessments
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy textile_circularity_assessments_update on public.textile_circularity_assessments
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy textile_circularity_assessments_delete on public.textile_circularity_assessments
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

create policy textile_circularity_answers_select on public.textile_circularity_answers
  for select to authenticated using (public.is_org_member(organization_id));
create policy textile_circularity_answers_insert on public.textile_circularity_answers
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy textile_circularity_answers_update on public.textile_circularity_answers
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy textile_circularity_answers_delete on public.textile_circularity_answers
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']));

-- ---------------------------------------------------------------------------
-- Extensión de vínculos de evidencias (encargo §12): 1 entidad y 7 tipos
-- nuevos (superconjuntos; ningún vínculo anterior pierde validez).
-- care_support ya existía desde T5.
-- ---------------------------------------------------------------------------
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
    'circularity_assessment'
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
    'separation_support', 'reuse_support', 'end_of_life_support'
  ));

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
    when 'supplier'               then select organization_id into v_target_org from textile_suppliers                   where id = new.entity_id;
    when 'material'               then select organization_id into v_target_org from textile_materials                   where id = new.entity_id;
    when 'component'              then select organization_id into v_target_org from textile_components                  where id = new.entity_id;
    when 'process'                then select organization_id into v_target_org from textile_processes                   where id = new.entity_id;
    when 'outsourced_process'     then select organization_id into v_target_org from textile_outsourced_processes        where id = new.entity_id;
    when 'collection'             then select organization_id into v_target_org from textile_collections                 where id = new.entity_id;
    when 'product'                then select organization_id into v_target_org from textile_products                    where id = new.entity_id;
    when 'reference'              then select organization_id into v_target_org from textile_references                  where id = new.entity_id;
    when 'fiber_composition'      then select organization_id into v_target_org from textile_reference_fiber_composition where id = new.entity_id;
    when 'reference_material'     then select organization_id into v_target_org from textile_reference_materials         where id = new.entity_id;
    when 'reference_component'    then select organization_id into v_target_org from textile_reference_components        where id = new.entity_id;
    when 'production_order'       then select organization_id into v_target_org from textile_production_orders           where id = new.entity_id;
    when 'input_lot'              then select organization_id into v_target_org from textile_input_lots                  where id = new.entity_id;
    when 'order_consumption'      then select organization_id into v_target_org from textile_order_consumptions          where id = new.entity_id;
    when 'order_process_step'     then select organization_id into v_target_org from textile_order_process_steps         where id = new.entity_id;
    when 'output_lot'             then select organization_id into v_target_org from textile_output_lots                 where id = new.entity_id;
    when 'circularity_assessment' then select organization_id into v_target_org from textile_circularity_assessments     where id = new.entity_id;
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

-- ---------------------------------------------------------------------------
-- SEED · Metodología v1 y sus 30 criterios (pesos por dimensión: 20/20/15/
-- 15/20/10 — la suma total de pesos activos es 100).
-- ---------------------------------------------------------------------------
insert into public.textile_circularity_methodologies (id, method_code, version, name, description, is_active)
values (
  'c0000000-0000-4000-8000-000000000001',
  'TEXTILE_CIRCULARITY_PREP', 'v1',
  'Metodología de preparación circular textil v1',
  'Evaluación técnica interna de preparación circular por dimensiones: transparencia de composición, trazabilidad y evidencia, estrategia de materiales, durabilidad/cuidado/reparación, reciclabilidad/separabilidad y reutilización/fin de vida. No equivale a certificación ni a verificación externa.',
  true
);

insert into public.textile_circularity_criteria
  (methodology_id, code, dimension_key, question, help_text, weight, response_type, allows_na, evidence_expected, display_order)
values
  -- composition_transparency (20)
  ('c0000000-0000-4000-8000-000000000001', 'CT01', 'composition_transparency', 'La referencia tiene composición estructurada de fibras.', 'Derivado de la composición registrada (T4).', 4, 'derived', false, false, 10),
  ('c0000000-0000-4000-8000-000000000001', 'CT02', 'composition_transparency', 'La composición suma aproximadamente 100% en cada alcance.', 'Derivado: cada alcance con filas debe sumar 100 ± 0,5.', 4, 'derived', false, false, 20),
  ('c0000000-0000-4000-8000-000000000001', 'CT03', 'composition_transparency', 'Las fibras están identificadas con tipos de fibra normalizados.', 'Derivado: el modelo exige tipo de fibra del catálogo normalizado.', 4, 'derived', false, false, 30),
  ('c0000000-0000-4000-8000-000000000001', 'CT04', 'composition_transparency', 'La composición diferencia alcance o componente cuando aplica.', 'Manual: prenda con forro/partes distintas debería declararlas por alcance.', 4, 'scale', true, false, 40),
  ('c0000000-0000-4000-8000-000000000001', 'CT05', 'composition_transparency', 'Existen materiales asociados a la referencia.', 'Derivado de las asociaciones de materiales (T4).', 4, 'derived', false, false, 50),
  -- traceability_evidence (20)
  ('c0000000-0000-4000-8000-000000000001', 'TE01', 'traceability_evidence', 'La referencia tiene soportes documentales de composición.', 'Derivado: evidencia de composición vinculada a la referencia o sus fibras (aceptada = fuerte, pendiente = parcial).', 4, 'evidence_based', false, true, 110),
  ('c0000000-0000-4000-8000-000000000001', 'TE02', 'traceability_evidence', 'Los materiales asociados tienen proveedor registrado.', 'Derivado: fracción de materiales asociados con proveedor.', 3, 'derived', true, false, 120),
  ('c0000000-0000-4000-8000-000000000001', 'TE03', 'traceability_evidence', 'Los materiales asociados tienen evidencia de ficha técnica o declaración.', 'Derivado: fracción de materiales con evidencia vinculada.', 3, 'evidence_based', true, true, 130),
  ('c0000000-0000-4000-8000-000000000001', 'TE04', 'traceability_evidence', 'El lote producido evaluado cuenta con orden/corrida asociada.', 'Derivado. N/A si la evaluación no incluye lote.', 3, 'derived', true, false, 140),
  ('c0000000-0000-4000-8000-000000000001', 'TE05', 'traceability_evidence', 'El lote producido cuenta con consumos de lotes de entrada.', 'Derivado. N/A si la evaluación no incluye lote.', 3, 'derived', true, false, 150),
  ('c0000000-0000-4000-8000-000000000001', 'TE06', 'traceability_evidence', 'El lote producido cuenta con evidencias vinculadas.', 'Derivado (aceptada = fuerte, pendiente = parcial). N/A sin lote.', 2, 'evidence_based', true, true, 160),
  ('c0000000-0000-4000-8000-000000000001', 'TE07', 'traceability_evidence', 'No se usan evidencias rechazadas como soporte.', 'Derivado: una evidencia rechazada vinculada al contexto genera brecha.', 2, 'derived', false, false, 170),
  -- material_strategy (15)
  ('c0000000-0000-4000-8000-000000000001', 'MS01', 'material_strategy', 'Se evita complejidad excesiva de mezclas de fibras.', 'Derivado: ≤2 fibras por alcance principal = completo; 3 = parcial; más = 0. N/A sin composición.', 3, 'derived', true, false, 210),
  ('c0000000-0000-4000-8000-000000000001', 'MS02', 'material_strategy', 'El contenido reciclado declarado tiene soporte documental.', 'Derivado por estado de evidencia. N/A si no hay declaración reciclada.', 3, 'evidence_based', true, true, 220),
  ('c0000000-0000-4000-8000-000000000001', 'MS03', 'material_strategy', 'El material orgánico declarado tiene soporte documental.', 'Derivado por estado de evidencia. N/A si no hay declaración orgánica.', 3, 'evidence_based', true, true, 230),
  ('c0000000-0000-4000-8000-000000000001', 'MS04', 'material_strategy', 'Se identifican materiales principales y secundarios.', 'Manual: roles de materiales claros en la referencia.', 3, 'scale', true, false, 240),
  ('c0000000-0000-4000-8000-000000000001', 'MS05', 'material_strategy', 'Los materiales críticos tienen información de origen o proveedor.', 'Manual, apoyado en catálogos y evidencias de origen.', 3, 'scale', true, false, 250),
  -- durability_care_repair (15)
  ('c0000000-0000-4000-8000-000000000001', 'DR01', 'durability_care_repair', 'Existen recomendaciones de cuidado o soporte asociado.', 'Manual; la evidencia de cuidado vinculada la respalda.', 4, 'scale', true, true, 310),
  ('c0000000-0000-4000-8000-000000000001', 'DR02', 'durability_care_repair', 'Los componentes funcionales pueden reemplazarse o repararse.', 'Manual: cierres, botones y avíos reemplazables.', 4, 'scale', true, false, 320),
  ('c0000000-0000-4000-8000-000000000001', 'DR03', 'durability_care_repair', 'La referencia tiene información técnica suficiente para mantenimiento.', 'Manual.', 4, 'scale', true, false, 330),
  ('c0000000-0000-4000-8000-000000000001', 'DR04', 'durability_care_repair', 'Los procesos registrados no contradicen el uso previsto del producto.', 'Manual, apoyado en los procesos de la orden si existen.', 3, 'scale', true, false, 340),
  -- recyclability_separability (20)
  ('c0000000-0000-4000-8000-000000000001', 'RS01', 'recyclability_separability', 'La referencia usa una estructura de fibras simple o justificable.', 'Manual: si la mezcla es compleja, debe existir justificación técnica.', 4, 'scale', true, false, 410),
  ('c0000000-0000-4000-8000-000000000001', 'RS02', 'recyclability_separability', 'Los avíos/componentes tienen separabilidad evaluada.', 'Derivado: fracción de componentes asociados con separabilidad distinta de "sin evaluar". N/A sin componentes.', 4, 'derived', true, false, 420),
  ('c0000000-0000-4000-8000-000000000001', 'RS03', 'recyclability_separability', 'Los componentes difíciles de separar están identificados.', 'Manual, apoyado en la separabilidad del catálogo.', 4, 'scale', true, false, 430),
  ('c0000000-0000-4000-8000-000000000001', 'RS04', 'recyclability_separability', 'Los materiales/componentes no textiles están identificados.', 'Manual.', 4, 'scale', true, false, 440),
  ('c0000000-0000-4000-8000-000000000001', 'RS05', 'recyclability_separability', 'Existe información para separar materiales al final de la vida útil.', 'Manual; la evidencia de separación la respalda.', 4, 'scale', true, true, 450),
  -- reuse_end_of_life (10)
  ('c0000000-0000-4000-8000-000000000001', 'RE01', 'reuse_end_of_life', 'Existe potencial documentado de reutilización.', 'Manual; la evidencia de reutilización la respalda.', 3, 'scale', true, true, 510),
  ('c0000000-0000-4000-8000-000000000001', 'RE02', 'reuse_end_of_life', 'Existe instrucción preliminar de separación o fin de vida.', 'Manual; la evidencia de fin de vida la respalda.', 3, 'scale', true, true, 520),
  ('c0000000-0000-4000-8000-000000000001', 'RE03', 'reuse_end_of_life', 'La referencia tiene brechas de circularidad identificadas y gestionadas.', 'Manual: reconocer y priorizar brechas también es preparación.', 2, 'scale', true, false, 530),
  ('c0000000-0000-4000-8000-000000000001', 'RE04', 'reuse_end_of_life', 'La información disponible sirve como base para futura documentación técnica.', 'Manual. La evaluación NO es esa documentación ni un pasaporte: solo mide preparación.', 2, 'scale', true, false, 540);

-- ---------------------------------------------------------------------------
-- CÁLCULO CONTROLADO. La función deriva los criterios automáticos de los
-- DATOS REALES (composición, materiales, componentes, evidencias por
-- estado, consumos y saldos), toma las respuestas manuales de
-- textile_circularity_answers y JAMÁS acepta valores del cliente.
-- traceability_status se usa solo como indicador auxiliar (una brecha
-- más), nunca como única fuente: consumos, evidencias y sobreconsumo se
-- consultan directamente (encargo §2).
-- Fórmula (encargo §8): por dimensión, earned = Σ peso·valor sobre
-- criterios aplicables; los N/A salen del denominador; la dimensión se
-- normaliza a su peso total; si una dimensión entera queda N/A, el total
-- se renormaliza (documentado). Niveles: <25 inicial, <50 basico,
-- <70 intermedio, <85 avanzado, ≥85 preparado — "preparado" describe
-- mayor preparación técnica interna, nunca una verificación de terceros.
-- Evidencias (encargo §17): accepted = 1 (fuerte); pending_review = 0.5
-- (parcial); expired = 0.5 + advertencia; rejected = 0 + brecha;
-- archived = 0 (no activa).
-- ---------------------------------------------------------------------------
create or replace function public.calculate_textile_circularity_assessment(p_assessment_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  c record;
  v_fiber_rows int;
  v_scopes_ok boolean;
  v_max_fibers_scope int;
  v_materials int;
  v_materials_with_supplier int;
  v_material_support numeric;
  v_components int;
  v_components_evaluated int;
  v_consumptions int;
  v_recycled_declared int;
  v_organic_declared int;
  v_te01 numeric;
  v_te06 numeric;
  v_ms02 numeric;
  v_ms03 numeric;
  v_rejected_in_context boolean;
  v_expired_in_context boolean;
  v_lot_status text;
  v_overconsumption boolean := false;
  v_outsourced_without_support int := 0;
  v_value numeric;
  v_is_na boolean;
  v_earned numeric[] := array[0, 0, 0, 0, 0, 0];
  v_wsum numeric[] := array[0, 0, 0, 0, 0, 0];
  v_wtotal numeric[] := array[0, 0, 0, 0, 0, 0];
  v_idx int;
  v_dim_keys text[] := array[
    'composition_transparency', 'traceability_evidence', 'material_strategy',
    'durability_care_repair', 'recyclability_separability', 'reuse_end_of_life'
  ];
  v_dim_scores jsonb := '{}';
  v_gaps jsonb := '[]';
  v_recs jsonb := '[]';
  v_total numeric := 0;
  v_max numeric := 0;
  v_score numeric;
  v_level text;
begin
  select a.*, ol.order_id as lot_order_id
    into v
    from textile_circularity_assessments a
    left join textile_output_lots ol
      on ol.id = a.output_lot_id and ol.organization_id = a.organization_id
   where a.id = p_assessment_id;
  if v is null then
    return null;
  end if;

  -- ------------------- Datos reales -------------------
  select count(*) into v_fiber_rows
    from textile_reference_fiber_composition
   where reference_id = v.reference_id and organization_id = v.organization_id;

  select coalesce(bool_and(s.total between 99.5 and 100.5), false),
         coalesce(max(s.fibers), 0)
    into v_scopes_ok, v_max_fibers_scope
    from (
      select component_scope, sum(percentage) as total, count(*) as fibers
        from textile_reference_fiber_composition
       where reference_id = v.reference_id and organization_id = v.organization_id
       group by component_scope
    ) s;

  select count(*), count(*) filter (where m.supplier_id is not null)
    into v_materials, v_materials_with_supplier
    from textile_reference_materials rm
    join textile_materials m on m.id = rm.material_id
   where rm.reference_id = v.reference_id and rm.organization_id = v.organization_id;

  -- Mejor soporte por material asociado (promedio; sin vínculo = 0).
  select avg(coalesce(best.support, 0)) into v_material_support
    from textile_reference_materials rm
    left join lateral (
      select max(case ev.status when 'accepted' then 1.0 when 'pending_review' then 0.5 when 'expired' then 0.5 else 0.0 end) as support
        from textile_evidence_links l
        join textile_evidences ev on ev.id = l.evidence_id
       where l.organization_id = v.organization_id
         and l.entity_type = 'material' and l.entity_id = rm.material_id
    ) best on true
   where rm.reference_id = v.reference_id and rm.organization_id = v.organization_id;

  select count(*), count(*) filter (where c2.separability <> 'not_evaluated')
    into v_components, v_components_evaluated
    from textile_reference_components rc
    join textile_components c2 on c2.id = rc.component_id
   where rc.reference_id = v.reference_id and rc.organization_id = v.organization_id;

  select count(*) filter (where f.is_recycled_declared),
         count(*) filter (where f.is_organic_declared)
    into v_recycled_declared, v_organic_declared
    from textile_reference_fiber_composition f
   where f.reference_id = v.reference_id and f.organization_id = v.organization_id;

  -- Soportes de la referencia (aceptada = fuerte, pendiente/vencida = parcial).
  select max(case ev.status when 'accepted' then 1.0 when 'pending_review' then 0.5 when 'expired' then 0.5 else 0.0 end)
    into v_te01
    from textile_evidence_links l
    join textile_evidences ev on ev.id = l.evidence_id
   where l.organization_id = v.organization_id
     and l.link_type = 'composition_support'
     and ((l.entity_type = 'reference' and l.entity_id = v.reference_id)
       or (l.entity_type = 'fiber_composition' and l.entity_id in (
            select id from textile_reference_fiber_composition
             where reference_id = v.reference_id and organization_id = v.organization_id)));

  select max(case ev.status when 'accepted' then 1.0 when 'pending_review' then 0.5 when 'expired' then 0.5 else 0.0 end)
    into v_ms02
    from textile_evidence_links l
    join textile_evidences ev on ev.id = l.evidence_id
   where l.organization_id = v.organization_id
     and l.link_type = 'recycled_claim_support'
     and ((l.entity_type = 'reference' and l.entity_id = v.reference_id)
       or (l.entity_type = 'fiber_composition' and l.entity_id in (
            select id from textile_reference_fiber_composition
             where reference_id = v.reference_id and organization_id = v.organization_id)));

  select max(case ev.status when 'accepted' then 1.0 when 'pending_review' then 0.5 when 'expired' then 0.5 else 0.0 end)
    into v_ms03
    from textile_evidence_links l
    join textile_evidences ev on ev.id = l.evidence_id
   where l.organization_id = v.organization_id
     and l.link_type = 'organic_claim_support'
     and ((l.entity_type = 'reference' and l.entity_id = v.reference_id)
       or (l.entity_type = 'fiber_composition' and l.entity_id in (
            select id from textile_reference_fiber_composition
             where reference_id = v.reference_id and organization_id = v.organization_id)));

  -- Contexto de lote (si la evaluación lo incluye): datos reales, no solo
  -- el indicador persistido.
  if v.output_lot_id is not null then
    select count(*) into v_consumptions
      from textile_order_consumptions
     where order_id = v.lot_order_id and organization_id = v.organization_id;

    select traceability_status into v_lot_status
      from textile_output_lots where id = v.output_lot_id;

    select max(case ev.status when 'accepted' then 1.0 when 'pending_review' then 0.5 when 'expired' then 0.5 else 0.0 end)
      into v_te06
      from textile_evidence_links l
      join textile_evidences ev on ev.id = l.evidence_id
     where l.organization_id = v.organization_id
       and ((l.entity_type = 'output_lot' and l.entity_id = v.output_lot_id)
         or (l.entity_type = 'production_order' and l.entity_id = v.lot_order_id));

    select exists (
      select 1
        from textile_input_lots il
       where il.organization_id = v.organization_id
         and il.quantity_received is not null and il.unit is not null
         and exists (
           select 1 from textile_order_consumptions cc
            where cc.input_lot_id = il.id and cc.order_id = v.lot_order_id
         )
         and (
           select coalesce(sum(c3.quantity_consumed), 0)
             from textile_order_consumptions c3
            where c3.input_lot_id = il.id
              and lower(trim(c3.unit)) = lower(trim(il.unit))
         ) > il.quantity_received
    ) into v_overconsumption;

    select count(*) into v_outsourced_without_support
      from textile_order_process_steps s
     where s.order_id = v.lot_order_id and s.organization_id = v.organization_id
       and s.step_type = 'outsourced'
       and not exists (
         select 1 from textile_evidence_links l
          where l.organization_id = v.organization_id
            and l.entity_type = 'order_process_step' and l.entity_id = s.id
       );
  else
    v_consumptions := 0;
  end if;

  -- Rechazadas o vencidas en el contexto evaluado (referencia, fibras,
  -- materiales asociados, lote y orden).
  select
    coalesce(bool_or(ev.status = 'rejected'), false),
    coalesce(bool_or(ev.status = 'expired'), false)
    into v_rejected_in_context, v_expired_in_context
    from textile_evidence_links l
    join textile_evidences ev on ev.id = l.evidence_id
   where l.organization_id = v.organization_id
     and (
       (l.entity_type = 'reference' and l.entity_id = v.reference_id)
       or (l.entity_type = 'fiber_composition' and l.entity_id in (
            select id from textile_reference_fiber_composition
             where reference_id = v.reference_id and organization_id = v.organization_id))
       or (l.entity_type = 'material' and l.entity_id in (
            select material_id from textile_reference_materials
             where reference_id = v.reference_id and organization_id = v.organization_id))
       or (v.output_lot_id is not null and l.entity_type = 'output_lot' and l.entity_id = v.output_lot_id)
       or (v.output_lot_id is not null and l.entity_type = 'production_order' and l.entity_id = v.lot_order_id)
     );

  -- ------------------- Valor por criterio -------------------
  for c in
    select * from textile_circularity_criteria
     where methodology_id = v.methodology_id and is_active
     order by display_order
  loop
    v_is_na := false;
    case c.code
      when 'CT01' then v_value := case when v_fiber_rows > 0 then 1 else 0 end;
      when 'CT02' then v_value := case when v_fiber_rows > 0 and v_scopes_ok then 1 else 0 end;
      when 'CT03' then v_value := case when v_fiber_rows > 0 then 1 else 0 end;
      when 'CT05' then v_value := case when v_materials > 0 then 1 else 0 end;
      when 'TE01' then v_value := coalesce(v_te01, 0);
      when 'TE02' then
        if v_materials = 0 then v_is_na := true; v_value := null;
        else v_value := round(v_materials_with_supplier::numeric / v_materials, 2); end if;
      when 'TE03' then
        if v_materials = 0 then v_is_na := true; v_value := null;
        else v_value := round(coalesce(v_material_support, 0), 2); end if;
      when 'TE04' then
        if v.output_lot_id is null then v_is_na := true; v_value := null;
        else v_value := 1; end if;
      when 'TE05' then
        if v.output_lot_id is null then v_is_na := true; v_value := null;
        else v_value := case when v_consumptions > 0 then 1 else 0 end; end if;
      when 'TE06' then
        if v.output_lot_id is null then v_is_na := true; v_value := null;
        else v_value := coalesce(v_te06, 0); end if;
      when 'TE07' then v_value := case when v_rejected_in_context then 0 else 1 end;
      when 'MS01' then
        if v_fiber_rows = 0 then v_is_na := true; v_value := null;
        elsif v_max_fibers_scope <= 2 then v_value := 1;
        elsif v_max_fibers_scope = 3 then v_value := 0.5;
        else v_value := 0; end if;
      when 'MS02' then
        if v_recycled_declared = 0 then v_is_na := true; v_value := null;
        else v_value := coalesce(v_ms02, 0); end if;
      when 'MS03' then
        if v_organic_declared = 0 then v_is_na := true; v_value := null;
        else v_value := coalesce(v_ms03, 0); end if;
      when 'RS02' then
        if v_components = 0 then v_is_na := true; v_value := null;
        else v_value := round(v_components_evaluated::numeric / v_components, 2); end if;
      else
        -- Criterios manuales: respuesta guardada; sin respuesta = 0
        -- (sin soporte); N/A solo si el criterio lo admite (guard).
        select case when a.not_applicable then null else coalesce(a.answer_value, 0) end,
               coalesce(a.not_applicable, false)
          into v_value, v_is_na
          from textile_circularity_answers a
         where a.assessment_id = v.id and a.criterion_id = c.id;
        if not found then
          v_value := 0; v_is_na := false;
        end if;
    end case;

    v_idx := array_position(v_dim_keys, c.dimension_key);
    v_wtotal[v_idx] := v_wtotal[v_idx] + c.weight;
    if not v_is_na then
      v_wsum[v_idx] := v_wsum[v_idx] + c.weight;
      v_earned[v_idx] := v_earned[v_idx] + c.weight * coalesce(v_value, 0);
    end if;
  end loop;

  -- ------------------- Agregación y nivel -------------------
  for v_idx in 1..6 loop
    if v_wsum[v_idx] > 0 then
      v_total := v_total + (v_earned[v_idx] / v_wsum[v_idx]) * v_wtotal[v_idx];
      v_max := v_max + v_wtotal[v_idx];
      v_dim_scores := v_dim_scores || jsonb_build_object(
        v_dim_keys[v_idx],
        jsonb_build_object(
          'score', round((v_earned[v_idx] / v_wsum[v_idx]) * v_wtotal[v_idx], 1),
          'weight', v_wtotal[v_idx],
          'applicable_weight', v_wsum[v_idx]
        )
      );
    else
      v_dim_scores := v_dim_scores || jsonb_build_object(
        v_dim_keys[v_idx],
        jsonb_build_object('score', null, 'weight', v_wtotal[v_idx], 'applicable_weight', 0)
      );
    end if;
  end loop;

  if v_max > 0 then
    v_score := round(v_total / v_max * 100, 1);
  else
    v_score := 0;
  end if;
  v_level := case
    when v_score < 25 then 'inicial'
    when v_score < 50 then 'basico'
    when v_score < 70 then 'intermedio'
    when v_score < 85 then 'avanzado'
    else 'preparado'
  end;

  -- ------------------- Brechas y recomendaciones -------------------
  if v_fiber_rows = 0 then
    v_gaps := v_gaps || jsonb_build_object('code', 'no_composition', 'dimension', 'composition_transparency', 'message', 'La referencia no tiene composición estructurada de fibras.');
  elsif not v_scopes_ok then
    v_gaps := v_gaps || jsonb_build_object('code', 'composition_not_100', 'dimension', 'composition_transparency', 'message', 'La composición no suma 100 ± 0,5 en todos los alcances.');
  end if;
  if v_fiber_rows > 0 and coalesce(v_te01, 0) = 0 then
    v_gaps := v_gaps || jsonb_build_object('code', 'composition_without_support', 'dimension', 'traceability_evidence', 'message', 'Hay composición registrada sin soporte documental de composición.');
  end if;
  if v_recycled_declared > 0 and coalesce(v_ms02, 0) = 0 then
    v_gaps := v_gaps || jsonb_build_object('code', 'recycled_without_support', 'dimension', 'material_strategy', 'message', 'Hay declaración reciclada sin evidencia aceptada o pendiente.');
  end if;
  if v_organic_declared > 0 and coalesce(v_ms03, 0) = 0 then
    v_gaps := v_gaps || jsonb_build_object('code', 'organic_without_support', 'dimension', 'material_strategy', 'message', 'Hay declaración orgánica sin evidencia aceptada o pendiente.');
  end if;
  if v_rejected_in_context then
    v_gaps := v_gaps || jsonb_build_object('code', 'rejected_as_support', 'dimension', 'traceability_evidence', 'message', 'Hay evidencia rechazada vinculada como soporte: no cuenta como soporte válido.');
  end if;
  if v_expired_in_context then
    v_gaps := v_gaps || jsonb_build_object('code', 'expired_support', 'dimension', 'traceability_evidence', 'message', 'Advertencia: hay evidencia vencida en el contexto; no cuenta como soporte fuerte.');
  end if;
  if v_materials > 0 and v_materials_with_supplier < v_materials then
    v_gaps := v_gaps || jsonb_build_object('code', 'material_without_supplier', 'dimension', 'traceability_evidence', 'message', 'Hay materiales asociados sin proveedor registrado.');
  end if;
  if v_materials > 0 and coalesce(v_material_support, 0) < 0.5 then
    v_gaps := v_gaps || jsonb_build_object('code', 'material_without_datasheet', 'dimension', 'traceability_evidence', 'message', 'Hay materiales asociados sin ficha técnica o soporte documental.');
  end if;
  if v_components > 0 and v_components_evaluated < v_components then
    v_gaps := v_gaps || jsonb_build_object('code', 'components_without_separability', 'dimension', 'recyclability_separability', 'message', 'Hay avíos/componentes sin separabilidad evaluada.');
  end if;
  if v_fiber_rows > 0 and v_max_fibers_scope > 3 then
    v_gaps := v_gaps || jsonb_build_object('code', 'complex_fiber_mix', 'dimension', 'recyclability_separability', 'message', 'La mezcla de fibras es compleja; documenta la justificación técnica.');
  end if;
  if v.output_lot_id is not null then
    if v_consumptions = 0 then
      v_gaps := v_gaps || jsonb_build_object('code', 'lot_without_consumptions', 'dimension', 'traceability_evidence', 'message', 'El lote producido evaluado no registra consumos de lotes de entrada.');
    end if;
    if v_overconsumption then
      v_gaps := v_gaps || jsonb_build_object('code', 'overconsumption', 'dimension', 'traceability_evidence', 'message', 'Se detecta sobreconsumo en lotes de entrada de la orden evaluada.');
    end if;
    if v_outsourced_without_support > 0 then
      v_gaps := v_gaps || jsonb_build_object('code', 'outsourced_without_support', 'dimension', 'traceability_evidence', 'message', 'Hay procesos tercerizados sin soporte documental vinculado.');
    end if;
    if v_lot_status = 'needs_review' then
      v_gaps := v_gaps || jsonb_build_object('code', 'traceability_needs_review', 'dimension', 'traceability_evidence', 'message', 'La trazabilidad del lote está marcada como "requiere revisión" (indicador auxiliar).');
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code', g->>'code',
    'text', case g->>'code'
      when 'no_composition' then 'Registra la composición estructurada de fibras de la referencia (T4).'
      when 'composition_not_100' then 'Ajusta la composición para que cada alcance sume 100 ± 0,5.'
      when 'composition_without_support' then 'Vincula un soporte de composición (ensayo, declaración o ficha) a la referencia.'
      when 'recycled_without_support' then 'Carga y vincula el soporte de la declaración reciclada antes de comunicarla.'
      when 'organic_without_support' then 'Carga y vincula el soporte de la declaración orgánica antes de comunicarla.'
      when 'rejected_as_support' then 'Reemplaza la evidencia rechazada por un soporte vigente y revisado.'
      when 'expired_support' then 'Renueva la evidencia vencida con una versión vigente.'
      when 'material_without_supplier' then 'Asocia el proveedor de cada material para fortalecer el origen.'
      when 'material_without_datasheet' then 'Vincula ficha técnica o declaración a los materiales asociados.'
      when 'components_without_separability' then 'Evalúa la separabilidad de los avíos/componentes en el catálogo (T3).'
      when 'complex_fiber_mix' then 'Documenta la justificación técnica de la mezcla o simplifícala.'
      when 'lot_without_consumptions' then 'Registra los consumos de lotes de entrada de la orden evaluada.'
      when 'overconsumption' then 'Revisa cantidades recibidas y consumidas del lote con sobreconsumo.'
      when 'outsourced_without_support' then 'Vincula soporte de ejecución a los procesos tercerizados.'
      when 'traceability_needs_review' then 'Atiende las brechas de trazabilidad del lote antes de la revisión interna.'
      else 'Revisa la brecha identificada y documenta el plan interno de mejora.'
    end
  )), '[]'::jsonb)
    into v_recs
    from jsonb_array_elements(v_gaps) g;

  -- ------------------- Persistencia bajo flag -------------------
  perform set_config('trazaloop.textile_circularity_calculate', 'on', true);
  update textile_circularity_assessments
     set circularity_score = v_score,
         readiness_level = v_level,
         dimension_scores = v_dim_scores,
         gaps = v_gaps,
         recommendations = v_recs,
         calculated_at = now()
   where id = p_assessment_id;
  perform set_config('trazaloop.textile_circularity_calculate', 'off', true);

  return v_score;
end;
$$;
revoke execute on function public.calculate_textile_circularity_assessment(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs (patrón 0079): las únicas concedidas a authenticated; validan
-- sesión, membresía, módulo habilitado (module_code) y rol.
-- ---------------------------------------------------------------------------
create or replace function public.recalculate_textile_circularity_assessment(p_assessment_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;
  select organization_id, status into v_org, v_status
    from textile_circularity_assessments where id = p_assessment_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'La evaluación no existe o no pertenece a tu organización';
  end if;
  if not exists (
    select 1 from organization_modules
     where organization_id = v_org and module_code = 'textiles' and enabled
  ) then
    raise exception 'El módulo Textil no está habilitado para la organización';
  end if;
  if not public.has_org_role(v_org, array['admin','quality','consultant']) then
    raise exception 'Tu rol no permite recalcular la evaluación';
  end if;
  if v_status <> 'draft' then
    raise exception 'Solo un borrador puede recalcularse. Una evaluación completada es un registro histórico.';
  end if;
  return public.calculate_textile_circularity_assessment(p_assessment_id);
end;
$$;
revoke execute on function public.recalculate_textile_circularity_assessment(uuid) from public, anon;
grant execute on function public.recalculate_textile_circularity_assessment(uuid) to authenticated;

create or replace function public.finalize_textile_circularity_assessment(p_assessment_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_status text;
  v_score numeric;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;
  select organization_id, status into v_org, v_status
    from textile_circularity_assessments where id = p_assessment_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'La evaluación no existe o no pertenece a tu organización';
  end if;
  if not exists (
    select 1 from organization_modules
     where organization_id = v_org and module_code = 'textiles' and enabled
  ) then
    raise exception 'El módulo Textil no está habilitado para la organización';
  end if;
  -- Finalizan solo admin/quality; el consultant prepara el borrador y
  -- propone (documentado en el reporte T7).
  if not public.has_org_role(v_org, array['admin','quality']) then
    raise exception 'Finalizar la evaluación requiere rol administrador o calidad';
  end if;
  if v_status <> 'draft' then
    raise exception 'Solo un borrador puede finalizarse.';
  end if;

  v_score := public.calculate_textile_circularity_assessment(p_assessment_id);

  perform set_config('trazaloop.textile_circularity_calculate', 'on', true);
  update textile_circularity_assessments
     set status = 'completed',
         completed_at = now(),
         completed_by = auth.uid()
   where id = p_assessment_id;
  perform set_config('trazaloop.textile_circularity_calculate', 'off', true);

  return v_score;
end;
$$;
revoke execute on function public.finalize_textile_circularity_assessment(uuid) from public, anon;
grant execute on function public.finalize_textile_circularity_assessment(uuid) to authenticated;
