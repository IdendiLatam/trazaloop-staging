-- 0091_textile_passport_circularity_evidence_hotfix.sql
-- Trazaloop · Sprint T9B.3 (Textil) · Hotfix de orden de construcción del
-- snapshot: la evaluación de circularidad auto-seleccionada debe resolverse
-- ANTES de armar la sección visible de evidencias (redefine la RPC de 0090).
--
-- PROBLEMA (introducido en T9B.2): la sección snapshot_json.sections.evidences
-- se construía antes de auto-seleccionar la evaluación de circularidad
-- 'completed' más reciente. Cuando el pasaporte nacía sin
-- circularity_assessment_id, v_assessment aún era null al armar evidencias, de
-- modo que las evidencias vinculadas a la evaluación luego auto-seleccionada NO
-- entraban en snapshot_json.sections.evidences.items (aunque sí en la sección de
-- circularidad y, parcialmente, en data_sources). Como la UI de T9C mostrará las
-- evidencias desde snapshot_json.sections.evidences.items, debe corregirse.
--
-- CORRECCIÓN (hotfix mínimo): se separa la RESOLUCIÓN del circularity_assessment
-- definitivo (auto-selección de la última 'completed' de la organización y
-- referencia cuando no se fijó una manualmente) y se ejecuta ANTES del bloque de
-- evidencias. La construcción de la sección de circularidad, las brechas
-- (PAS-CIRC-001/002) y el resto del snapshot no cambian. Con el
-- circularity_assessment_id ya definitivo, el CTE de evidencias visibles captura
-- las evidencias de esa evaluación tanto si fue manual como auto-seleccionada, y
-- lo mismo aplica a data_sources_json (evidences y source_records.evidence_links,
-- que ya usaban v_assessment).
--
-- No cambia la estructura del snapshot, ni las secciones, ni schema_version, ni
-- los estados. El source_hash solo cambia por incluir correctamente las
-- evidencias de circularidad (efecto buscado). No acepta datos de cliente.
--
-- ALCANCE: solo redefine generate_textile_technical_passport_full_snapshot
-- (misma firma, mismo grant). Sin tablas, columnas, políticas ni otras
-- funciones. Sin UI, rutas, impresión, QR, PDF, IA, ACV, huella. CERO cambios CPR.

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
  v_assessment_manual boolean;

  v_now timestamptz := now();
  v_scope text;

  v_org_name text;
  v_org_legal text;
  v_org_tax text;

  v_sec_product jsonb;
  v_sec_composition jsonb;
  v_sec_materials jsonb;
  v_sec_components jsonb;
  v_sec_suppliers jsonb;
  v_sec_evidences jsonb;
  v_sec_traceability jsonb;
  v_trace_items jsonb := '[]'::jsonb;
  v_sec_circularity jsonb;
  v_sec_care jsonb;
  v_sec_claims jsonb;
  v_sec_trazadocs jsonb;

  v_comp_fibers integer;
  v_comp_scopes_ok boolean;
  v_comp_scope_totals jsonb;
  v_comp_over boolean;
  v_comp_status text;
  v_product_id uuid;

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

  select name, legal_name, tax_id into v_org_name, v_org_legal, v_org_tax
    from organizations where id = v_org;

  -- =========================================================================
  -- 5.2 Producto + referencia
  -- =========================================================================
  select p.id,
         jsonb_build_object(
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
    into v_product_id, v_sec_product
    from textile_references r
    left join textile_products p on p.id = r.product_id
   where r.id = v_ref;

  if v_sec_product is null then
    raise exception 'La referencia del pasaporte no existe';
  end if;

  if v_product_id is null then
    v_gaps := v_gaps || jsonb_build_object(
      'gap_code', 'PAS-DATA-001', 'severity', 'info', 'section_key', 'product_identification',
      'message', 'La referencia no tiene producto asociado.', 'blocking', false);
  end if;

  -- =========================================================================
  -- 5.3 Composición de fibras — POR ALCANCE (fix #1), regla del dominio/0080
  -- =========================================================================
  -- Agregación por alcance (una sola pasada): nº de filas, si todos los
  -- alcances con datos están en 100 ± 0,5, si alguno excede 100,5, y los
  -- totales por alcance para el snapshot.
  select coalesce(sum(s.fibers), 0),
         coalesce(bool_and(s.total between 99.5 and 100.5), false),
         coalesce(bool_or(s.total > 100.5), false),
         coalesce(jsonb_agg(jsonb_build_object('component_scope', s.component_scope, 'total', s.total) order by s.component_scope), '[]'::jsonb)
    into v_comp_fibers, v_comp_scopes_ok, v_comp_over, v_comp_scope_totals
    from (
      select component_scope, sum(percentage) as total, count(*) as fibers
        from textile_reference_fiber_composition
       where reference_id = v_ref
       group by component_scope
    ) s;

  v_comp_status := case
    when v_comp_fibers = 0 then 'not_started'
    when v_comp_scopes_ok then 'complete'
    when v_comp_over then 'needs_review'
    else 'incomplete'
  end;

  select jsonb_build_object(
           'completeness_status', case v_comp_status
             when 'complete' then 'documented'
             when 'not_started' then 'pending'
             when 'needs_review' then 'needs_review'
             else 'partially_documented' end,
           'composition_status', v_comp_status,
           'scope_totals', v_comp_scope_totals,
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

  if v_comp_status = 'not_started' then
    -- Normalizado en T9B.2: 'sin composición documentada' = PAS-COMP-002.
    v_gaps := v_gaps || jsonb_build_object(
      'gap_code', 'PAS-COMP-002', 'severity', 'info', 'section_key', 'fiber_composition',
      'message', 'Referencia sin composición documentada.', 'blocking', false);
  elsif v_comp_status = 'needs_review' then
    -- El caso 'excede 100%' pasa a PAS-COMP-003 tras la normalización.
    v_gaps := v_gaps || jsonb_build_object(
      'gap_code', 'PAS-COMP-003', 'severity', 'warning', 'section_key', 'fiber_composition',
      'message', 'La composición excede 100% en algún alcance y requiere revisión.', 'blocking', false);
    v_recs := v_recs || jsonb_build_object(
      'recommendation_code', 'PAS-REC-002', 'section_key', 'fiber_composition',
      'message', 'Revise los porcentajes por alcance: algún alcance supera 100%.',
      'priority', 'medium', 'related_gap_code', 'PAS-COMP-003');
  elsif v_comp_status = 'incomplete' then
    v_gaps := v_gaps || jsonb_build_object(
      'gap_code', 'PAS-COMP-001', 'severity', 'critical', 'section_key', 'fiber_composition',
      'message', 'La composición de fibras no suma 100% (±0,5) en todos los alcances con datos.', 'blocking', false);
    v_recs := v_recs || jsonb_build_object(
      'recommendation_code', 'PAS-REC-001', 'section_key', 'fiber_composition',
      'message', 'Complete los porcentajes de composición por alcance hasta sumar 100% en cada uno.',
      'priority', 'high', 'related_gap_code', 'PAS-COMP-001');
  end if;

  -- =========================================================================
  -- 5.4 Materiales
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

  if exists (
    select 1 from textile_reference_components rc
    join textile_components c on c.id = rc.component_id
    where rc.reference_id = v_ref and coalesce(rc.separability_override, c.separability) = 'not_evaluated'
  ) then
    v_gaps := v_gaps || jsonb_build_object(
      'gap_code', 'PAS-SEP-001', 'severity', 'improvement', 'section_key', 'care_repair_eol',
      'message', 'Hay componentes sin separabilidad evaluada.', 'blocking', false);
    v_recs := v_recs || jsonb_build_object(
      'recommendation_code', 'PAS-REC-003', 'section_key', 'care_repair_eol',
      'message', 'Evalúe la separabilidad de los componentes pendientes.',
      'priority', 'low', 'related_gap_code', 'PAS-SEP-001');
  end if;

  -- =========================================================================
  -- 5.6 Proveedores (fix #4: lista distinta materializada antes de agregar)
  -- =========================================================================
  select jsonb_build_object(
           'completeness_status', case when count(*) = 0 then 'pending' else 'documented' end,
           'suppliers', coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'name', d.name, 'supplier_type', d.supplier_type, 'country', d.country
           ) order by d.name), '[]'::jsonb)
         )
    into v_sec_suppliers
    from (
      select distinct s.id, s.name, s.supplier_type, s.country
        from textile_suppliers s
       where s.organization_id = v_org
         and (
           s.id in (select m.supplier_id from textile_reference_materials rm join textile_materials m on m.id = rm.material_id where rm.reference_id = v_ref and m.supplier_id is not null)
           or s.id in (select c.supplier_id from textile_reference_components rc join textile_components c on c.id = rc.component_id where rc.reference_id = v_ref and c.supplier_id is not null)
         )
    ) d;

  -- =========================================================================
  -- Resolución del circularity_assessment definitivo (T9B.3: ANTES de evidencias)
  -- Debe fijarse aquí para que las evidencias vinculadas a la evaluación —manual
  -- o auto-seleccionada— entren en snapshot_json.sections.evidences.items y en
  -- data_sources. Si el pasaporte no fijó una, se toma la 'completed' más
  -- reciente de la misma organización y referencia. La construcción de la
  -- sección de circularidad y sus brechas se hace más abajo (5.9).
  -- =========================================================================
  if v_assessment is null then
    select ca.id into v_assessment
      from textile_circularity_assessments ca
     where ca.organization_id = v_org and ca.reference_id = v_ref and ca.status = 'completed'
     order by ca.completed_at desc nulls last, ca.updated_at desc
     limit 1;
    v_assessment_manual := false;
  else
    v_assessment_manual := true;
  end if;

  -- =========================================================================
  -- 5.7 Evidencias visibles (T9B.2: TODAS las entidades del pasaporte)
  --     entity_type reales verificados contra 0075/0078/0084.
  -- =========================================================================
  with linked as (
    select distinct e.id, e.title, e.evidence_type, e.status, e.document_date,
           e.valid_until, e.file_name, e.created_at, e.updated_at,
           el.entity_type, el.entity_id, el.link_type
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
        or (v_lot is not null and el.entity_type = 'production_order' and el.entity_id = (select order_id from textile_output_lots where id = v_lot))
        or (v_lot is not null and el.entity_type = 'order_process_step' and el.entity_id in (
              select id from textile_order_process_steps where order_id = (select order_id from textile_output_lots where id = v_lot)))
        or (v_assessment is not null and el.entity_type = 'circularity_assessment' and el.entity_id = v_assessment)
        or (el.entity_type = 'technical_passport' and el.entity_id = p_passport_id)
      )
  )
  select jsonb_build_object(
           'completeness_status', case
             when count(*) = 0 then 'pending'
             when count(*) filter (where status = 'accepted') > 0
                  and count(*) filter (where status in ('rejected','expired')) = 0 then 'documented'
             when count(*) filter (where status = 'accepted') > 0 then 'partially_documented'
             else 'partially_documented' end,
           'total_links', count(*),
           'by_status', jsonb_build_object(
             'accepted', count(*) filter (where status = 'accepted'),
             'pending_review', count(*) filter (where status = 'pending_review'),
             'rejected', count(*) filter (where status = 'rejected'),
             'expired', count(*) filter (where status = 'expired'),
             'archived', count(*) filter (where status = 'archived')
           ),
           'items', coalesce(jsonb_agg(jsonb_build_object(
             'evidence_id', id, 'title', title, 'evidence_type', evidence_type, 'status', status,
             'entity_type', entity_type, 'entity_id', entity_id, 'link_type', link_type,
             'document_date', document_date, 'valid_until', valid_until, 'file_name', file_name,
             'created_at', created_at, 'updated_at', updated_at,
             'support_strength', case status
               when 'accepted' then 'strong' when 'pending_review' then 'in_review'
               when 'expired' then 'warning' else 'none' end
           ) order by entity_type, updated_at desc), '[]'::jsonb),
           'interpretation', 'accepted = soporte interno fuerte; pending_review = soporte en revisión; rejected = no cuenta como soporte fuerte; expired = genera advertencia; archived = no cuenta como soporte activo.',
           'disclaimer', 'La aceptación interna de una evidencia no equivale a certificación externa ni validación por una autoridad.'
         )
    into v_sec_evidences
    from linked;

  if (v_sec_evidences->'by_status'->>'expired')::int > 0 then
    v_warnings := v_warnings || jsonb_build_object(
      'gap_code', 'PAS-EVID-002', 'severity', 'warning', 'section_key', 'evidences',
      'message', 'Hay evidencia de soporte en estado vencido.', 'blocking', false);
  end if;
  if (v_sec_evidences->>'total_links')::int = 0 then
    v_gaps := v_gaps || jsonb_build_object(
      'gap_code', 'PAS-EVID-003', 'severity', 'info', 'section_key', 'evidences',
      'message', 'La referencia y sus materiales/componentes no tienen evidencias vinculadas.', 'blocking', false);
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
               when 'complete' then 'documented' when 'needs_review' then 'needs_review'
               when 'not_started' then 'pending' else 'partially_documented' end,
             'output_lot', jsonb_build_object(
               'code', ol.output_lot_code, 'quantity_produced', ol.quantity_produced,
               'unit', ol.unit, 'produced_date', ol.produced_date, 'status', ol.status,
               'traceability_status', ol.traceability_status),
             'order', jsonb_build_object('code', po.order_code, 'produced_quantity', po.produced_quantity, 'unit', po.unit),
             'summary', coalesce((select to_jsonb(s) - 'organization_id' from v_textile_output_lot_traceability_summary s where s.output_lot_id = ol.id), '{}'::jsonb),
             'input_lots', coalesce((
               select jsonb_agg(jsonb_build_object(
                 'lot_code', il.lot_code, 'lot_type', il.lot_type,
                 'quantity_consumed', oc.quantity_consumed, 'unit', oc.unit, 'supplier_id', il.supplier_id))
               from textile_order_consumptions oc join textile_input_lots il on il.id = oc.input_lot_id
               where oc.order_id = po.id), '[]'::jsonb),
             -- fix #3: ruta/pasos de proceso (internos y tercerizados).
             'process_steps', coalesce((
               select jsonb_agg(jsonb_build_object(
                 'step_order', ps.step_order, 'step_type', ps.step_type, 'name', ps.name,
                 'status', ps.status, 'supplier_id', ps.supplier_id,
                 'process', pr.name, 'outsourced_process', op.name,
                 'is_outsourced', ps.outsourced_process_id is not null)
                 order by ps.step_order)
               from textile_order_process_steps ps
               left join textile_processes pr on pr.id = ps.process_id
               left join textile_outsourced_processes op on op.id = ps.outsourced_process_id
               where ps.order_id = po.id), '[]'::jsonb)
           )
      into v_sec_traceability
      from textile_output_lots ol
      join textile_production_orders po on po.id = ol.order_id
     where ol.id = v_lot;

    if (v_sec_traceability#>>'{output_lot,traceability_status}') = 'needs_review' then
      v_trace_items := v_trace_items || jsonb_build_object(
        'gap_code', 'PAS-TRACE-001', 'severity', 'warning', 'section_key', 'traceability',
        'message', 'El lote final tiene trazabilidad en revisión.', 'blocking', false);
    elsif (v_sec_traceability#>>'{output_lot,traceability_status}') = 'incomplete' then
      v_trace_items := v_trace_items || jsonb_build_object(
        'gap_code', 'PAS-TRACE-002', 'severity', 'critical', 'section_key', 'traceability',
        'message', 'El lote final tiene trazabilidad incompleta.', 'blocking', false);
    end if;

    -- fix #3: proceso tercerizado sin soporte de ejecución vinculado.
    if exists (
      select 1 from textile_order_process_steps ps
      where ps.order_id = (select order_id from textile_output_lots where id = v_lot)
        and ps.outsourced_process_id is not null
        and not exists (
          select 1 from textile_evidence_links el join textile_evidences e on e.id = el.evidence_id
          where el.organization_id = v_org and el.entity_type = 'order_process_step'
            and el.entity_id = ps.id and e.status in ('accepted','pending_review'))
    ) then
      v_trace_items := v_trace_items || jsonb_build_object(
        'gap_code', 'PAS-TRACE-004', 'severity', 'info', 'section_key', 'traceability',
        'message', 'Hay procesos tercerizados sin soporte de ejecución vinculado.', 'blocking', false);
    end if;

    -- T9B.2 (fix #4): orden/corrida asociada al lote sin pasos de proceso.
    if not exists (
      select 1 from textile_order_process_steps ps
      where ps.order_id = (select order_id from textile_output_lots where id = v_lot)
    ) then
      v_trace_items := v_trace_items || jsonb_build_object(
        'gap_code', 'PAS-TRACE-005', 'severity', 'warning', 'section_key', 'traceability',
        'message', 'La orden/corrida asociada al lote producido/final no tiene pasos de proceso documentados.', 'blocking', false);
    end if;

    -- Reparto: críticas → gaps; el resto → warnings; y todas a la sección.
    v_gaps := v_gaps || coalesce((select jsonb_agg(x) from jsonb_array_elements(v_trace_items) x where x->>'severity' = 'critical'), '[]'::jsonb);
    v_warnings := v_warnings || coalesce((select jsonb_agg(x) from jsonb_array_elements(v_trace_items) x where x->>'severity' <> 'critical'), '[]'::jsonb);
    v_sec_traceability := v_sec_traceability || jsonb_build_object('warnings', v_trace_items);
  end if;

  -- =========================================================================
  -- 5.9 Circularidad — la evaluación definitiva (manual o auto-seleccionada) ya
  -- se resolvió antes del bloque de evidencias (T9B.3). Aquí solo se construye la
  -- sección y sus brechas con el v_assessment ya fijado.
  -- =========================================================================
  if v_assessment is null then
    if exists (select 1 from textile_circularity_assessments where reference_id = v_ref and status in ('draft','in_review')) then
      v_sec_circularity := jsonb_build_object(
        'completeness_status', 'partially_documented',
        'note', 'Existe una evaluación de circularidad en preparación (borrador o en revisión), pero ninguna completada.',
        'disclaimer', 'La evaluación de circularidad es una herramienta técnica interna. No equivale a certificación, cumplimiento regulatorio ni pasaporte oficial.');
      v_warnings := v_warnings || jsonb_build_object(
        'gap_code', 'PAS-CIRC-002', 'severity', 'warning', 'section_key', 'circularity',
        'message', 'La referencia tiene evaluaciones de circularidad en preparación pero ninguna completada.', 'blocking', false);
    else
      v_sec_circularity := jsonb_build_object(
        'completeness_status', 'pending',
        'disclaimer', 'La evaluación de circularidad es una herramienta técnica interna. No equivale a certificación, cumplimiento regulatorio ni pasaporte oficial.');
      v_gaps := v_gaps || jsonb_build_object(
        'gap_code', 'PAS-CIRC-001', 'severity', 'warning', 'section_key', 'circularity',
        'message', 'No existe una evaluación de circularidad completada para esta referencia.', 'blocking', false);
    end if;
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
  -- 5.10 Cuidado / reparación / separabilidad / fin de vida (fix #5)
  -- =========================================================================
  select jsonb_build_object(
           'completeness_status', case
             when count(*) = 0 then 'pending'
             when count(*) filter (where coalesce(rc.separability_override, c.separability) <> 'not_evaluated') > 0
               or count(*) filter (where coalesce(rc.replacement_possible_override, c.replacement_possible)) > 0
             then 'partially_documented' else 'pending' end,
           'evaluated_components', count(*),
           'separable_components', coalesce(jsonb_agg(c.name) filter (where coalesce(rc.separability_override, c.separability) in ('easy','moderate')), '[]'::jsonb),
           'replaceable_components', coalesce(jsonb_agg(c.name) filter (where coalesce(rc.replacement_possible_override, c.replacement_possible)), '[]'::jsonb),
           'note', 'La información de cuidado y fin de vida no documentada se marca pendiente; no se infiere.'
         )
    into v_sec_care
    from textile_reference_components rc
    join textile_components c on c.id = rc.component_id
   where rc.reference_id = v_ref;

  if v_sec_care is null then
    v_sec_care := jsonb_build_object('completeness_status', 'pending',
      'note', 'Sin componentes registrados: información de cuidado y fin de vida pendiente.');
  end if;

  -- =========================================================================
  -- 5.11 Claims
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

  if exists (select 1 from textile_reference_fiber_composition where reference_id = v_ref and (is_recycled_declared or is_organic_declared))
     and not exists (
       select 1 from textile_evidence_links el join textile_evidences e on e.id = el.evidence_id
       where el.organization_id = v_org and el.entity_type = 'reference' and el.entity_id = v_ref
         and el.link_type in ('recycled_claim_support','organic_claim_support','passport_claim_support')
         and e.status in ('accepted','pending_review')
     ) then
    v_warnings := v_warnings || jsonb_build_object(
      'gap_code', 'PAS-CLAIM-001', 'severity', 'warning', 'section_key', 'claims',
      'message', 'Se declara contenido reciclado/orgánico sin evidencia suficiente.', 'blocking', false);
    v_recs := v_recs || jsonb_build_object(
      'recommendation_code', 'PAS-REC-004', 'section_key', 'claims',
      'message', 'Vincule y acepte internamente el soporte del claim antes de comunicarlo externamente.',
      'priority', 'high', 'related_gap_code', 'PAS-CLAIM-001');
  end if;

  -- =========================================================================
  -- 5.12 TrazaDocs Textil
  -- =========================================================================
  select jsonb_build_object(
           'completeness_status', case
             when count(*) = 0 then 'pending'
             when count(*) filter (where status = 'approved') > 0 then 'documented'
             else 'partially_documented' end,
           'documents', coalesce(jsonb_agg(jsonb_build_object(
             'code', code, 'title', title, 'status', status, 'version', current_version) order by code), '[]'::jsonb),
           'note', 'Un documento aprobado internamente no equivale a aprobación por una entidad externa.'
         )
    into v_sec_trazadocs
    from trazadoc_documents
   where organization_id = v_org and module_key = 'textiles';

  if not exists (select 1 from trazadoc_documents where organization_id = v_org and module_key = 'textiles' and code = 'TXT-PRO-004' and status = 'approved') then
    v_gaps := v_gaps || jsonb_build_object(
      'gap_code', 'PAS-DOC-001', 'severity', 'warning', 'section_key', 'trazadocs',
      'message', 'El procedimiento de evidencias textiles no está aprobado internamente.', 'blocking', false);
  end if;

  -- =========================================================================
  -- Ensamblado del snapshot (fix #6: resumen real por severidad)
  -- =========================================================================
  v_snapshot := jsonb_build_object(
    'schema_version', 'textile_technical_passport_v1',
    'generated_at', v_now, 'scope', v_scope,
    'passport', jsonb_build_object(
      'reference_id', v_ref, 'output_lot_id', v_lot,
      'circularity_assessment_id', v_assessment,  -- puede haberse auto-seleccionado
      'circularity_assessment_auto_selected', (v_assessment is not null and not v_assessment_manual)),
    'organization', jsonb_build_object('id', v_org, 'name', v_org_name, 'legal_name', v_org_legal, 'tax_id', v_org_tax),
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
      'gaps_and_warnings', jsonb_build_object(
        'completeness_status', 'documented',
        'total', jsonb_array_length(v_gaps) + jsonb_array_length(v_warnings),
        'by_severity', jsonb_build_object(
          'critical', (select count(*) from jsonb_array_elements(v_gaps) g where g->>'severity' = 'critical'),
          'warning', (select count(*) from jsonb_array_elements(v_gaps || v_warnings) g where g->>'severity' = 'warning'),
          'improvement', (select count(*) from jsonb_array_elements(v_gaps) g where g->>'severity' = 'improvement'),
          'info', (select count(*) from jsonb_array_elements(v_gaps) g where g->>'severity' = 'info')
        )
      ),
      'executive_summary', jsonb_build_object(
        'completeness_status', 'documented',
        'preparation_level', case
          when (select count(*) from jsonb_array_elements(v_gaps) g where g->>'severity' = 'critical') > 0 then 'needs_review'
          when jsonb_array_length(v_gaps) + jsonb_array_length(v_warnings) = 0 then 'documented'
          else 'partially_documented' end,
        'gap_count', jsonb_array_length(v_gaps),
        'warning_count', jsonb_array_length(v_warnings),
        'recommendation_count', jsonb_array_length(v_recs)
      )
    ),
    -- T9B.2 (fix #4): resumen de advertencias/brechas a nivel raíz, para que la
    -- UI de T9C pueda mostrarlas sin recorrer todas las secciones.
    'warnings_summary', jsonb_build_object(
      'gap_count', jsonb_array_length(v_gaps),
      'warning_count', jsonb_array_length(v_warnings),
      'codes', coalesce((select jsonb_agg(distinct c) from (
        select g->>'gap_code' as c from jsonb_array_elements(v_gaps || v_warnings) g
      ) x where c is not null), '[]'::jsonb)
    ),
    'disclaimer', 'Este pasaporte técnico textil es una herramienta interna de preparación documental y trazabilidad. No equivale a certificación, sello, declaración regulatoria oficial ni pasaporte digital de producto oficial.'
  );

  v_sources := jsonb_build_object(
    'schema_version', 'textile_technical_passport_sources_v1',
    'extracted_at', v_now,
    'reference', (select jsonb_build_object('id', id, 'updated_at', updated_at) from textile_references where id = v_ref),
    'composition', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at)) from textile_reference_fiber_composition where reference_id = v_ref), '[]'::jsonb),
    'materials', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at)) from textile_reference_materials where reference_id = v_ref), '[]'::jsonb),
    'components', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at)) from textile_reference_components where reference_id = v_ref), '[]'::jsonb),
    -- fix #4: evidencias de TODAS las entidades del pasaporte (solo metadata;
    -- nunca signed URLs). Alimenta también el source_hash.
    'evidences', coalesce((
      select jsonb_agg(distinct jsonb_build_object('id', e.id, 'status', e.status, 'updated_at', e.updated_at))
      from textile_evidence_links el join textile_evidences e on e.id = el.evidence_id
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
          or (v_lot is not null and el.entity_type = 'production_order' and el.entity_id = (select order_id from textile_output_lots where id = v_lot))
          or (v_lot is not null and el.entity_type = 'order_process_step' and el.entity_id in (
                select id from textile_order_process_steps where order_id = (select order_id from textile_output_lots where id = v_lot)))
          or (v_assessment is not null and el.entity_type = 'circularity_assessment' and el.entity_id = v_assessment)
          or (el.entity_type = 'technical_passport' and el.entity_id = p_passport_id)
        )), '[]'::jsonb),
    'output_lot', case when v_lot is null then null else
      (select jsonb_build_object('id', id, 'traceability_status', traceability_status, 'updated_at', updated_at) from textile_output_lots where id = v_lot) end,
    'circularity_assessment', case when v_assessment is null then null else
      (select jsonb_build_object('id', id, 'status', status, 'updated_at', updated_at) from textile_circularity_assessments where id = v_assessment) end,
    'trazadocs', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'status', status, 'version', current_version, 'updated_at', updated_at))
                           from trazadoc_documents where organization_id = v_org and module_key = 'textiles'), '[]'::jsonb),
    -- T9B.2: fuentes explícitas para que el hash detecte cambios de vínculo y
    -- de ruta de proceso (no solo de las entidades base).
    'source_records', jsonb_build_object(
      -- fix #2: vínculos de evidencia (mismas entidades que la sección visible).
      -- textile_evidence_links no tiene updated_at ni status: se registran las
      -- columnas reales; el conjunto de IDs captura altas/bajas/relink.
      'evidence_links', coalesce((
        select jsonb_agg(jsonb_build_object(
          'table', 'textile_evidence_links',
          'id', el.id, 'evidence_id', el.evidence_id,
          'entity_type', el.entity_type, 'entity_id', el.entity_id,
          'link_type', el.link_type, 'created_at', el.created_at) order by el.entity_type, el.created_at)
        from textile_evidence_links el
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
            or (v_lot is not null and el.entity_type = 'production_order' and el.entity_id = (select order_id from textile_output_lots where id = v_lot))
            or (v_lot is not null and el.entity_type = 'order_process_step' and el.entity_id in (
                  select id from textile_order_process_steps where order_id = (select order_id from textile_output_lots where id = v_lot)))
            or (v_assessment is not null and el.entity_type = 'circularity_assessment' and el.entity_id = v_assessment)
            or (el.entity_type = 'technical_passport' and el.entity_id = p_passport_id)
          )), '[]'::jsonb),
      -- fix #3: pasos de proceso de la orden del lote (nombres reales:
      -- step_type, planned_date, completed_date).
      'process_steps', case when v_lot is null then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object(
          'table', 'textile_order_process_steps',
          'id', ps.id, 'order_id', ps.order_id,
          'step_type', ps.step_type, 'process_id', ps.process_id,
          'outsourced_process_id', ps.outsourced_process_id, 'status', ps.status,
          'planned_date', ps.planned_date, 'completed_date', ps.completed_date,
          'created_at', ps.created_at, 'updated_at', ps.updated_at) order by ps.step_order)
        from textile_order_process_steps ps
        where ps.order_id = (select order_id from textile_output_lots where id = v_lot)), '[]'::jsonb) end
    )
  );

  -- fix #5: el hash depende de TODO el resultado del pasaporte (snapshot,
  -- fuentes, brechas, advertencias, recomendaciones), no solo de las fuentes.
  -- Así cambia si cambia cualquier parte relevante del pasaporte generado.
  v_hash := encode(digest(
    jsonb_build_object(
      'snapshot', v_snapshot,
      'data_sources', v_sources,
      'gaps', v_gaps,
      'warnings', v_warnings,
      'recommendations', v_recs
    )::text, 'sha256'), 'hex');

  perform set_config('trazaloop.textile_passport_generate', 'on', true);
  update textile_technical_passports
     set snapshot_json = v_snapshot, data_sources_json = v_sources,
         gaps_json = v_gaps, warnings_json = v_warnings, recommendations_json = v_recs,
         source_hash = v_hash, status = 'generated',
         generated_at = v_now, generated_by = auth.uid()
   where id = p_passport_id;
  perform set_config('trazaloop.textile_passport_generate', 'off', true);

  return v_hash;
end;
$$;
revoke execute on function public.generate_textile_technical_passport_full_snapshot(uuid) from public, anon;
grant execute on function public.generate_textile_technical_passport_full_snapshot(uuid) to authenticated;
