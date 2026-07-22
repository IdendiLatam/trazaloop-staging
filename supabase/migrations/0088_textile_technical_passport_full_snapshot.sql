-- 0088_textile_technical_passport_full_snapshot.sql
-- Trazaloop · Sprint T9B (Textil) · Generación COMPLETA del snapshot del
-- pasaporte técnico textil desde los datos reales ya existentes.
--
-- T9A dejó un snapshot BASE (esqueleto de 14 secciones en 'pending'). T9B
-- añade la RPC generate_textile_technical_passport_full_snapshot(uuid) que
-- LEE las fuentes reales (organización, producto, referencia, composición,
-- materiales, componentes, proveedores, evidencias, orden/lotes/consumos,
-- circularidad, TrazaDocs Textil) y construye snapshot_json completo +
-- data_sources_json + gaps_json + warnings_json + recommendations_json +
-- source_hash, todo bajo el flag transaccional interno (patrón T7.1) que
-- respeta el trigger de protección de 0085. Pasa el pasaporte a 'generated'.
--
-- El snapshot es un SNAPSHOT HISTÓRICO: congela el estado al momento de
-- generación. Si luego cambian las fuentes, source_hash lo delata (T9C).
--
-- SEGURIDAD: security definer; verifica sesión, organización, módulo Textil
-- habilitado, rol (admin/quality/consultant) y estado (draft/generated).
-- NO acepta snapshot/gaps/hash desde cliente: todo se calcula aquí. Toda
-- lectura queda acotada a la organización del pasaporte.
--
-- ALCANCE: solo lectura de los módulos existentes + escritura controlada de
-- la fila del pasaporte. Sin UI, sin rutas, sin generación de PDF/QR, sin
-- tocar CPR ni otras tablas. La RPC base de 0084/0086 se conserva (T9C/T9
-- pueden seguir usándola para un esqueleto); esta es la generación completa.
--
-- LENGUAJE (N-05): el snapshot incluye los disclaimers obligatorios; sin
-- promesas de certificación. El ESPR se cita como "ESPR (UE) 2024/1781".

create or replace function public.generate_textile_technical_passport_full_snapshot(p_passport_id uuid)
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

  v_now timestamptz := now();
  v_scope text;

  v_org_name text;
  v_org_legal text;
  v_org_tax text;

  -- Secciones (jsonb)
  v_sec_product jsonb;
  v_sec_composition jsonb;
  v_sec_materials jsonb;
  v_sec_components jsonb;
  v_sec_suppliers jsonb;
  v_sec_evidences jsonb;
  v_sec_traceability jsonb;
  v_sec_circularity jsonb;
  v_sec_care jsonb;
  v_sec_claims jsonb;
  v_sec_trazadocs jsonb;

  -- Agregados auxiliares
  v_comp_total numeric;
  v_comp_status text;
  v_gaps jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_recs jsonb := '[]'::jsonb;

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
    raise exception 'Solo un pasaporte en borrador o recién generado puede (re)generar su snapshot. Para cambios sustanciales, cree una nueva versión.';
  end if;

  v_scope := case when v_lot is null then 'reference_only' else 'reference_and_lot' end;

  select name, legal_name, tax_id
    into v_org_name, v_org_legal, v_org_tax
    from organizations where id = v_org;

  -- =========================================================================
  -- 5.2 Producto + referencia
  -- =========================================================================
  select jsonb_build_object(
           'completeness_status', case when p.id is not null then 'documented' else 'pending' end,
           'product', case when p.id is null then null else jsonb_build_object(
             'id', p.id, 'name', p.name, 'category', p.category,
             'description', p.description, 'intended_use', p.intended_use,
             'target_market', p.target_market, 'collection_id', p.collection_id
           ) end,
           'reference', jsonb_build_object(
             'id', r.id, 'sku', r.sku, 'name', r.name, 'color', r.color,
             'size_range', r.size_range, 'gender_or_fit', r.gender_or_fit,
             'version_label', r.version_label, 'composition_status', r.composition_status
           )
         )
    into v_sec_product
    from textile_references r
    left join textile_products p on p.id = r.product_id
   where r.id = v_ref;

  if v_sec_product is null then
    raise exception 'La referencia del pasaporte no existe';
  end if;

  -- =========================================================================
  -- 5.3 Composición de fibras (suma por scope principal 'main')
  -- =========================================================================
  select coalesce(sum(percentage) filter (where component_scope = 'main'), 0)
    into v_comp_total
    from textile_reference_fiber_composition
   where reference_id = v_ref;

  select case
           when count(*) = 0 then 'not_started'
           when abs(coalesce(sum(percentage) filter (where component_scope = 'main'), 0) - 100) <= 0.5 then 'complete'
           else 'incomplete'
         end
    into v_comp_status
    from textile_reference_fiber_composition
   where reference_id = v_ref;

  select jsonb_build_object(
           'completeness_status', case v_comp_status
             when 'complete' then 'documented'
             when 'not_started' then 'pending'
             else 'partially_documented' end,
           'composition_status', v_comp_status,
           'total_percentage_main', v_comp_total,
           'fibers', coalesce((
             select jsonb_agg(jsonb_build_object(
               'fiber_type', ft.name, 'fiber_code', ft.code,
               'percentage', fc.percentage, 'component_scope', fc.component_scope,
               'is_recycled_declared', fc.is_recycled_declared,
               'is_organic_declared', fc.is_organic_declared,
               'source_material_id', fc.source_material_id
             ) order by fc.component_scope, fc.percentage desc)
             from textile_reference_fiber_composition fc
             join textile_fiber_types ft on ft.id = fc.fiber_type_id
             where fc.reference_id = v_ref
           ), '[]'::jsonb)
         )
    into v_sec_composition;

  -- Brecha de composición.
  if v_comp_status = 'not_started' then
    v_gaps := v_gaps || jsonb_build_object(
      'gap_code', 'PAS-COMP-003', 'severity', 'info', 'section_key', 'fiber_composition',
      'message', 'Composición no iniciada para la referencia.', 'blocking', false);
  elsif v_comp_status = 'incomplete' then
    v_gaps := v_gaps || jsonb_build_object(
      'gap_code', 'PAS-COMP-001', 'severity', 'critical', 'section_key', 'fiber_composition',
      'message', 'La composición de fibras no suma 100% (±0,5) en el alcance principal.', 'blocking', false);
    v_recs := v_recs || to_jsonb('Revise los porcentajes de composición por alcance en la referencia.'::text);
  end if;

  -- =========================================================================
  -- 5.4 Materiales asociados a la referencia
  -- =========================================================================
  select jsonb_build_object(
           'completeness_status', case when count(*) = 0 then 'pending' else 'documented' end,
           'items', coalesce(jsonb_agg(jsonb_build_object(
             'material', m.name, 'role', rm.role, 'estimated_percentage', rm.estimated_percentage,
             'supplier_id', m.supplier_id, 'declared_composition', m.declared_composition,
             'country_of_origin', m.country_of_origin,
             'has_supplier_datasheet', m.has_supplier_datasheet,
             'has_composition_support', m.has_composition_support,
             'recycled_claim', m.recycled_claim, 'organic_claim', m.organic_claim
           ) order by rm.role), '[]'::jsonb)
         )
    into v_sec_materials
    from textile_reference_materials rm
    join textile_materials m on m.id = rm.material_id
   where rm.reference_id = v_ref;

  -- =========================================================================
  -- 5.5 Componentes / avíos
  -- =========================================================================
  select jsonb_build_object(
           'completeness_status', case
             when count(*) = 0 then 'pending'
             when count(*) filter (where coalesce(rc.separability_override, c.separability) = 'not_evaluated') > 0 then 'partially_documented'
             else 'documented' end,
           'items', coalesce(jsonb_agg(jsonb_build_object(
             'component', c.name, 'role', rc.role,
             'material_description', c.material_description, 'supplier_id', c.supplier_id,
             'separability', coalesce(rc.separability_override, c.separability),
             'replacement_possible', coalesce(rc.replacement_possible_override, c.replacement_possible)
           ) order by rc.role), '[]'::jsonb)
         )
    into v_sec_components
    from textile_reference_components rc
    join textile_components c on c.id = rc.component_id
   where rc.reference_id = v_ref;

  -- Brecha de separabilidad.
  if exists (
    select 1 from textile_reference_components rc
    join textile_components c on c.id = rc.component_id
    where rc.reference_id = v_ref
      and coalesce(rc.separability_override, c.separability) = 'not_evaluated'
  ) then
    v_gaps := v_gaps || jsonb_build_object(
      'gap_code', 'PAS-SEP-001', 'severity', 'improvement', 'section_key', 'care_repair_eol',
      'message', 'Hay componentes sin separabilidad evaluada.', 'blocking', false);
  end if;

  -- =========================================================================
  -- 5.6 Proveedores y procesos (proveedores de materiales/componentes de la ref)
  -- =========================================================================
  select jsonb_build_object(
           'completeness_status', case when count(*) = 0 then 'pending' else 'documented' end,
           'suppliers', coalesce(jsonb_agg(distinct jsonb_build_object(
             'id', s.id, 'name', s.name, 'supplier_type', s.supplier_type,
             'country', s.country
           )), '[]'::jsonb)
         )
    into v_sec_suppliers
    from textile_suppliers s
   where s.organization_id = v_org
     and (
       s.id in (select m.supplier_id from textile_reference_materials rm join textile_materials m on m.id = rm.material_id where rm.reference_id = v_ref)
       or s.id in (select c.supplier_id from textile_reference_components rc join textile_components c on c.id = rc.component_id where rc.reference_id = v_ref)
     );

  -- =========================================================================
  -- 5.7 Evidencias (vinculadas a la referencia, sus materiales y componentes)
  --     Estados reales: accepted / pending_review / rejected / expired / archived
  -- =========================================================================
  with linked as (
    select distinct e.id, e.title, e.evidence_type, e.status, e.valid_until, el.link_type, el.entity_type
    from textile_evidence_links el
    join textile_evidences e on e.id = el.evidence_id
    where el.organization_id = v_org
      and (
        (el.entity_type = 'reference' and el.entity_id = v_ref)
        or (el.entity_type = 'fiber_composition' and el.entity_id in (select id from textile_reference_fiber_composition where reference_id = v_ref))
        or (el.entity_type in ('material','reference_material') and el.entity_id in (
              select material_id from textile_reference_materials where reference_id = v_ref
              union select id from textile_reference_materials where reference_id = v_ref))
        or (el.entity_type in ('component','reference_component') and el.entity_id in (
              select component_id from textile_reference_components where reference_id = v_ref
              union select id from textile_reference_components where reference_id = v_ref))
        or (v_lot is not null and el.entity_type = 'output_lot' and el.entity_id = v_lot)
      )
  )
  select jsonb_build_object(
           'completeness_status', case
             when count(*) = 0 then 'pending'
             when count(*) filter (where status = 'accepted') > 0 then 'documented'
             else 'partially_documented' end,
           'by_status', jsonb_build_object(
             'accepted', count(*) filter (where status = 'accepted'),
             'pending_review', count(*) filter (where status = 'pending_review'),
             'rejected', count(*) filter (where status = 'rejected'),
             'expired', count(*) filter (where status = 'expired'),
             'archived', count(*) filter (where status = 'archived')
           ),
           'items', coalesce(jsonb_agg(jsonb_build_object(
             'title', title, 'evidence_type', evidence_type, 'status', status,
             'link_type', link_type, 'valid_until', valid_until,
             'support_strength', case status
               when 'accepted' then 'strong'
               when 'pending_review' then 'in_review'
               when 'expired' then 'warning'
               else 'none' end
           )), '[]'::jsonb),
           'interpretation', 'accepted = soporte interno fuerte; pending_review = soporte en revisión; rejected = no cuenta como soporte fuerte; expired = genera advertencia; archived = no cuenta como soporte activo.',
           'disclaimer', 'La aceptación interna de una evidencia no equivale a certificación externa ni validación por una autoridad.'
         )
    into v_sec_evidences
    from linked;

  -- Advertencia por evidencias vencidas.
  if exists (
    select 1 from textile_evidence_links el
    join textile_evidences e on e.id = el.evidence_id
    where el.organization_id = v_org and e.status = 'expired'
      and el.entity_type = 'reference' and el.entity_id = v_ref
  ) then
    v_warnings := v_warnings || jsonb_build_object(
      'gap_code', 'PAS-EVID-002', 'severity', 'warning', 'section_key', 'evidences',
      'message', 'Hay evidencia de soporte en estado vencido.', 'blocking', false);
  end if;

  -- =========================================================================
  -- 5.8 Trazabilidad operativa (solo con lote)
  -- =========================================================================
  if v_lot is null then
    v_sec_traceability := jsonb_build_object(
      'completeness_status', 'not_applicable',
      'note', 'Este pasaporte se basa únicamente en la referencia/SKU; no incluye trazabilidad de un lote producido.');
  else
    select jsonb_build_object(
             'completeness_status', case ol.traceability_status
               when 'complete' then 'documented'
               when 'needs_review' then 'needs_review'
               when 'not_started' then 'pending'
               else 'partially_documented' end,
             'output_lot', jsonb_build_object(
               'code', ol.output_lot_code, 'quantity_produced', ol.quantity_produced,
               'unit', ol.unit, 'produced_date', ol.produced_date, 'status', ol.status,
               'traceability_status', ol.traceability_status),
             'order', jsonb_build_object('code', po.order_code, 'produced_quantity', po.produced_quantity, 'unit', po.unit),
             'summary', coalesce((
               select to_jsonb(s) - 'organization_id'
               from v_textile_output_lot_traceability_summary s where s.output_lot_id = ol.id
             ), '{}'::jsonb),
             'input_lots', coalesce((
               select jsonb_agg(jsonb_build_object(
                 'lot_code', il.lot_code, 'lot_type', il.lot_type,
                 'quantity_consumed', oc.quantity_consumed, 'unit', oc.unit,
                 'supplier_id', il.supplier_id))
               from textile_order_consumptions oc
               join textile_input_lots il on il.id = oc.input_lot_id
               where oc.order_id = po.id
             ), '[]'::jsonb)
           )
      into v_sec_traceability
      from textile_output_lots ol
      join textile_production_orders po on po.id = ol.order_id
     where ol.id = v_lot;

    -- Brechas de trazabilidad según el estado calculado (0079).
    if (v_sec_traceability->>'completeness_status') = 'needs_review' then
      v_warnings := v_warnings || jsonb_build_object(
        'gap_code', 'PAS-TRACE-001', 'severity', 'warning', 'section_key', 'traceability',
        'message', 'El lote final tiene trazabilidad en revisión.', 'blocking', false);
    elsif (v_sec_traceability#>>'{output_lot,traceability_status}') = 'incomplete' then
      v_gaps := v_gaps || jsonb_build_object(
        'gap_code', 'PAS-TRACE-002', 'severity', 'critical', 'section_key', 'traceability',
        'message', 'El lote final tiene trazabilidad incompleta.', 'blocking', false);
    end if;
  end if;

  -- =========================================================================
  -- 5.9 Circularidad (evaluación vinculada, si existe)
  -- =========================================================================
  if v_assessment is null then
    v_sec_circularity := jsonb_build_object(
      'completeness_status', 'pending',
      'disclaimer', 'La evaluación de circularidad es una herramienta técnica interna. No equivale a certificación, cumplimiento regulatorio ni pasaporte oficial.');
    v_gaps := v_gaps || jsonb_build_object(
      'gap_code', 'PAS-CIRC-001', 'severity', 'warning', 'section_key', 'circularity',
      'message', 'No existe una evaluación de circularidad completada para esta referencia.', 'blocking', false);
  else
    select jsonb_build_object(
             'completeness_status', case ca.status when 'completed' then 'documented' when 'draft' then 'needs_review' else 'partially_documented' end,
             'assessment_code', ca.assessment_code, 'status', ca.status,
             'methodology', me.name, 'methodology_version', me.version,
             'score', ca.circularity_score, 'readiness_level', ca.readiness_level,
             'dimension_scores', ca.dimension_scores, 'gaps', ca.gaps,
             'recommendations', ca.recommendations, 'completed_at', ca.completed_at,
             'disclaimer', 'La evaluación de circularidad es una herramienta técnica interna. No equivale a certificación, cumplimiento regulatorio ni pasaporte oficial.'
           )
      into v_sec_circularity
      from textile_circularity_assessments ca
      join textile_circularity_methodologies me on me.id = ca.methodology_id
     where ca.id = v_assessment;

    if (v_sec_circularity->>'status') = 'draft' then
      v_warnings := v_warnings || jsonb_build_object(
        'gap_code', 'PAS-CIRC-002', 'severity', 'warning', 'section_key', 'circularity',
        'message', 'La evaluación de circularidad vinculada está en borrador (se usa con advertencia).', 'blocking', false);
    end if;
  end if;

  -- =========================================================================
  -- 5.10 Cuidado / reparación / separabilidad / fin de vida
  -- =========================================================================
  v_sec_care := jsonb_build_object(
    'completeness_status', case
      when exists (select 1 from textile_reference_components rc join textile_components c on c.id = rc.component_id
                   where rc.reference_id = v_ref and coalesce(rc.replacement_possible_override, c.replacement_possible) is true)
      then 'partially_documented' else 'pending' end,
    'replaceable_components', coalesce((
      select jsonb_agg(c.name) from textile_reference_components rc
      join textile_components c on c.id = rc.component_id
      where rc.reference_id = v_ref and coalesce(rc.replacement_possible_override, c.replacement_possible) is true
    ), '[]'::jsonb),
    'note', 'La información de cuidado y fin de vida no documentada se marca pendiente; no se infiere.');

  -- =========================================================================
  -- 5.11 Declaraciones ambientales y claims
  -- =========================================================================
  select jsonb_build_object(
           'completeness_status', case when count(*) = 0 then 'not_applicable' else 'partially_documented' end,
           'recycled_declared', count(*) filter (where is_recycled_declared),
           'organic_declared', count(*) filter (where is_organic_declared),
           'note', 'Toda declaración ambiental debe estar soportada por evidencia suficiente y revisada internamente antes de usarse en comunicaciones externas (ISO 14021 como referencia).'
         )
    into v_sec_claims
    from textile_reference_fiber_composition
   where reference_id = v_ref and (is_recycled_declared or is_organic_declared);

  -- Claim declarado sin evidencia aceptada/pendiente → advertencia.
  if exists (
    select 1 from textile_reference_fiber_composition
    where reference_id = v_ref and (is_recycled_declared or is_organic_declared)
  ) and not exists (
    select 1 from textile_evidence_links el join textile_evidences e on e.id = el.evidence_id
    where el.organization_id = v_org and el.entity_type = 'reference' and el.entity_id = v_ref
      and el.link_type in ('recycled_claim_support','organic_claim_support','passport_claim_support')
      and e.status in ('accepted','pending_review')
  ) then
    v_warnings := v_warnings || jsonb_build_object(
      'gap_code', 'PAS-CLAIM-001', 'severity', 'warning', 'section_key', 'claims',
      'message', 'Se declara contenido reciclado/orgánico sin evidencia suficiente.', 'blocking', false);
  end if;

  -- =========================================================================
  -- 5.12 Documentos TrazaDocs Textil relacionados
  -- =========================================================================
  select jsonb_build_object(
           'completeness_status', case
             when count(*) = 0 then 'pending'
             when count(*) filter (where status = 'approved') > 0 then 'documented'
             else 'partially_documented' end,
           'documents', coalesce(jsonb_agg(jsonb_build_object(
             'code', code, 'title', title, 'status', status, 'version', current_version
           ) order by code), '[]'::jsonb),
           'note', 'Un documento aprobado internamente no equivale a aprobación por una entidad externa.'
         )
    into v_sec_trazadocs
    from trazadoc_documents
   where organization_id = v_org and module_key = 'textiles';

  -- Brecha si el procedimiento de evidencias no está aprobado internamente.
  if not exists (
    select 1 from trazadoc_documents
    where organization_id = v_org and module_key = 'textiles'
      and code = 'TXT-PRO-004' and status = 'approved'
  ) then
    v_gaps := v_gaps || jsonb_build_object(
      'gap_code', 'PAS-DOC-001', 'severity', 'warning', 'section_key', 'trazadocs',
      'message', 'El procedimiento de evidencias textiles no está aprobado internamente.', 'blocking', false);
  end if;

  -- =========================================================================
  -- Ensamblado del snapshot completo
  -- =========================================================================
  v_snapshot := jsonb_build_object(
    'schema_version', 'textile_technical_passport_v1',
    'generated_at', v_now,
    'scope', v_scope,
    'passport', jsonb_build_object(
      'reference_id', v_ref, 'output_lot_id', v_lot, 'circularity_assessment_id', v_assessment),
    'organization', jsonb_build_object(
      'id', v_org, 'name', v_org_name, 'legal_name', v_org_legal, 'tax_id', v_org_tax),
    'sections', jsonb_build_object(
      'passport_identification', jsonb_build_object('completeness_status', 'documented'),
      'product_identification', v_sec_product,
      'fiber_composition', v_sec_composition,
      'materials', v_sec_materials,
      'components', v_sec_components,
      'suppliers_processes', v_sec_suppliers,
      'evidences', v_sec_evidences,
      'traceability', v_sec_traceability,
      'circularity', v_sec_circularity,
      'care_repair_eol', v_sec_care,
      'claims', v_sec_claims,
      'trazadocs', v_sec_trazadocs,
      'gaps_and_warnings', jsonb_build_object('completeness_status', 'documented'),
      'executive_summary', jsonb_build_object(
        'completeness_status', 'documented',
        'preparation_level', case
          when jsonb_array_length(v_gaps) = 0 then 'documented' else 'partially_documented' end,
        'gap_count', jsonb_array_length(v_gaps),
        'warning_count', jsonb_array_length(v_warnings))
    ),
    'disclaimer', 'Este pasaporte técnico textil es una herramienta interna de preparación documental y trazabilidad. No equivale a certificación, sello, declaración regulatoria oficial ni pasaporte digital de producto oficial.'
  );

  -- =========================================================================
  -- data_sources_json: IDs + updated_at de las fuentes (base del hash)
  -- =========================================================================
  v_sources := jsonb_build_object(
    'schema_version', 'textile_technical_passport_sources_v1',
    'extracted_at', v_now,
    'reference', (select jsonb_build_object('id', id, 'updated_at', updated_at) from textile_references where id = v_ref),
    'composition', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at)) from textile_reference_fiber_composition where reference_id = v_ref), '[]'::jsonb),
    'materials', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at)) from textile_reference_materials where reference_id = v_ref), '[]'::jsonb),
    'components', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at)) from textile_reference_components where reference_id = v_ref), '[]'::jsonb),
    'evidences', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'status', e.status, 'updated_at', e.updated_at))
                           from textile_evidence_links el join textile_evidences e on e.id = el.evidence_id
                           where el.organization_id = v_org and el.entity_type = 'reference' and el.entity_id = v_ref), '[]'::jsonb),
    'output_lot', case when v_lot is null then null else
      (select jsonb_build_object('id', id, 'traceability_status', traceability_status, 'updated_at', updated_at) from textile_output_lots where id = v_lot) end,
    'circularity_assessment', case when v_assessment is null then null else
      (select jsonb_build_object('id', id, 'status', status, 'updated_at', updated_at) from textile_circularity_assessments where id = v_assessment) end,
    'trazadocs', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'status', status, 'version', current_version, 'updated_at', updated_at))
                           from trazadoc_documents where organization_id = v_org and module_key = 'textiles'), '[]'::jsonb)
  );

  v_hash := encode(digest(v_sources::text, 'sha256'), 'hex');

  -- =========================================================================
  -- Escritura controlada (flag interno; el trigger de 0085 lo respeta)
  -- =========================================================================
  perform set_config('trazaloop.textile_passport_generate', 'on', true);
  update textile_technical_passports
     set snapshot_json = v_snapshot,
         data_sources_json = v_sources,
         gaps_json = v_gaps,
         warnings_json = v_warnings,
         recommendations_json = v_recs,
         source_hash = v_hash,
         status = 'generated',
         generated_at = v_now,
         generated_by = auth.uid()
   where id = p_passport_id;
  perform set_config('trazaloop.textile_passport_generate', 'off', true);

  return v_hash;
end;
$$;
revoke execute on function public.generate_textile_technical_passport_full_snapshot(uuid) from public, anon;
grant execute on function public.generate_textile_technical_passport_full_snapshot(uuid) to authenticated;
