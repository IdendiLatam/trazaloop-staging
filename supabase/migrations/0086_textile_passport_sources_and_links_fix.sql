-- 0086_textile_passport_sources_and_links_fix.sql
-- Trazaloop · Sprint T9A.2 (Textil) · Corrección final de fuentes y
-- vínculos del pasaporte técnico textil. Sprint CORTO y de CIERRE: no
-- amplía funcionalidad, no crea UI/rutas/generación completa, no toca CPR.
--
-- Cierra los tres pendientes que dejó T9A/T9A.1:
--   1. data_sources_json no incluía schema_version. Se redefine la RPC de
--      generación base (misma firma, resto idéntico) para que
--      data_sources_json lleve schema_version =
--      'textile_technical_passport_sources_v1'. (El snapshot_json ya lleva
--      su propio schema_version = 'textile_technical_passport_v1' desde
--      0084; ahora ambos documentos versionados quedan trazables.)
--   2. Faltaban los link_type ESPECÍFICOS del pasaporte. 0084/0085 solo
--      añadieron 'passport_support' y reutilizaban los genéricos de sección.
--      Aquí se agrega —de forma ADITIVA— la familia dedicada
--      passport_composition_support / passport_traceability_support /
--      passport_circularity_support / passport_claim_support /
--      passport_care_support / passport_end_of_life_support, y el validador
--      de coherencia (0085) pasa a exigir que un vínculo de un pasaporte use
--      la familia passport_* (o los genéricos general_support/other).
--
-- ALCANCE ESTRICTO: se redefine una función (la RPC de generación base), se
-- amplía aditivamente el check de link_type y se redefine el validador de
-- coherencia del pasaporte (misma firma; el trigger de 0085 sigue apuntando
-- a él). Sin tablas, sin políticas, sin columnas nuevas, sin tocar CPR ni
-- las evidencias de otros módulos. CERO objetos CPR.

-- ---------------------------------------------------------------------------
-- 1. data_sources_json con schema_version (redefinición de la RPC base)
-- ---------------------------------------------------------------------------
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

  -- Snapshot BASE (idéntico a 0084): schema_version del snapshot es OBLIGATORIO.
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

  -- data_sources base: T9A.2 añade schema_version dedicado. T9B añadirá el
  -- updated_at/estado de cada fuente real y recalculará el hash sobre ellos.
  v_sources := jsonb_build_object(
    'schema_version', 'textile_technical_passport_sources_v1',
    'reference_id', v_ref,
    'output_lot_id', v_lot,
    'circularity_assessment_id', v_assessment,
    'extracted_at', now()
  );
  v_hash := encode(digest(v_sources::text, 'sha256'), 'hex');

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
-- 2. link_type específicos del pasaporte (ampliación ADITIVA)
-- ---------------------------------------------------------------------------
-- Familia dedicada passport_* para vínculos de evidencia cuyo entity_type es
-- 'technical_passport', además del ya existente 'passport_support'. Todos los
-- valores previos se conservan.
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
    'passport_support',
    -- T9A.2: familia específica del pasaporte técnico textil.
    'passport_composition_support', 'passport_traceability_support',
    'passport_circularity_support', 'passport_claim_support',
    'passport_care_support', 'passport_end_of_life_support'
  ));

-- ---------------------------------------------------------------------------
-- 3. Coherencia entity_type × link_type del pasaporte (redefinición)
-- ---------------------------------------------------------------------------
-- Se redefine el validador de 0085 (misma firma; el trigger
-- t_textile_passport_evidence_link_type sigue apuntando a él) para exigir
-- que un vínculo de un pasaporte use la familia passport_* específica (o los
-- genéricos general_support/other). Sigue SIN tocar cualquier otro
-- entity_type: para ellos retorna de inmediato.
create or replace function public.validate_textile_passport_evidence_link_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.entity_type <> 'technical_passport' then
    return new;  -- no aplica: otros entity_type siguen como estaban (CPR intacto).
  end if;

  if new.link_type not in (
    'passport_support',                 -- soporte general del pasaporte
    'passport_composition_support',     -- 5.3 composición
    'passport_traceability_support',    -- 5.8 trazabilidad
    'passport_circularity_support',     -- 5.9 circularidad
    'passport_claim_support',           -- 5.11 claims (reciclado/orgánico/otros)
    'passport_care_support',            -- 5.10 cuidado
    'passport_end_of_life_support',     -- 5.10 fin de vida
    'general_support',                  -- soporte genérico admitido
    'other'
  ) then
    raise exception 'El tipo de vínculo % no es válido para un pasaporte técnico textil. Use la familia passport_*.', new.link_type;
  end if;

  return new;
end;
$$;
revoke execute on function public.validate_textile_passport_evidence_link_type() from public, anon, authenticated;
