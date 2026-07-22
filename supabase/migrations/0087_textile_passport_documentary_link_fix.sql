-- 0087_textile_passport_documentary_link_fix.sql
-- Trazaloop · Sprint T9A.3 (Textil) · HOTFIX mínimo: agrega el link_type
-- 'passport_documentary_support' para entity_type='technical_passport'.
--
-- PROBLEMA: T9A.2 (0086) añadió la familia passport_* para vínculos de
-- evidencia del pasaporte, pero omitió el soporte DOCUMENTAL — el tipo con
-- que se vinculan al pasaporte las evidencias de los procedimientos
-- TrazaDocs relacionados (sección 5.12 del pasaporte: manual, procedimiento
-- de composición/evidencias/trazabilidad/claims/circularidad, matriz).
-- Sin ese link_type no se puede representar el soporte documental del
-- pasaporte.
--
-- ALCANCE (hotfix): dos cambios y nada más —
--   1. añadir 'passport_documentary_support' al check de link_type de
--      textile_evidence_links (ADITIVO: 30 -> 31, ningún valor previo se
--      pierde);
--   2. admitirlo en validate_textile_passport_evidence_link_type() (misma
--      firma; el trigger de 0085 sigue apuntando a él).
-- Sin tablas, sin columnas, sin políticas, sin RPC, sin UI, sin generación
-- completa, sin tocar CPR ni otros entity_type. CERO objetos CPR.

-- ---------------------------------------------------------------------------
-- 1. check de link_type: + passport_documentary_support (aditivo)
-- ---------------------------------------------------------------------------
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
    'passport_composition_support', 'passport_traceability_support',
    'passport_circularity_support', 'passport_claim_support',
    'passport_care_support', 'passport_end_of_life_support',
    -- T9A.3: soporte documental del pasaporte (procedimientos TrazaDocs, 5.12).
    'passport_documentary_support'
  ));

-- ---------------------------------------------------------------------------
-- 2. Validador de coherencia del pasaporte: admite el nuevo tipo
-- ---------------------------------------------------------------------------
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
    'passport_documentary_support',     -- 5.12 documentos TrazaDocs relacionados
    'general_support',                  -- soporte genérico admitido
    'other'
  ) then
    raise exception 'El tipo de vínculo % no es válido para un pasaporte técnico textil. Use la familia passport_*.', new.link_type;
  end if;

  return new;
end;
$$;
revoke execute on function public.validate_textile_passport_evidence_link_type() from public, anon, authenticated;
