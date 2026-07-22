-- 0085_textile_technical_passport_state_hardening.sql
-- Trazaloop · Sprint T9A.1 (Textil) · Hardening quirúrgico de estados,
-- snapshot y sellos del pasaporte técnico textil.
--
-- PROBLEMA (T9A): protect_textile_technical_passport_snapshot() de 0084
-- protegía el snapshot/derivados SOLO cuando old.status <> 'draft'. Esto
-- dejaba abierta la manipulación directa (API de Supabase, rol legítimo
-- admin/quality) de un pasaporte EN 'draft': en un solo UPDATE crudo,
-- esquivando la RPC controlada, se podía escribir
--   status='approved_internal', snapshot_json={...}, data_sources_json={...},
--   source_hash='fake', generated_at/by=..., approved_at/by=...
-- fabricando un pasaporte "aprobado internamente" con snapshot y sellos
-- falsos que jamás pasó por generate_..._base ni por
-- change_..._status. La RLS de UPDATE (0084) permite a admin/quality
-- escribir cualquier columna, así que la única defensa real es a nivel de
-- trigger.
--
-- SOLUCIÓN (este archivo): se REDEFINE protect_textile_technical_passport_
-- snapshot() para que, FUERA del flag transaccional interno
-- (trazaloop.textile_passport_generate = 'on', que solo activan las RPCs
-- controladas), NINGÚN UPDATE pueda tocar — en NINGÚN estado, incluido
-- 'draft' — el conjunto controlado:
--   · status (toda transición pasa por la RPC);
--   · snapshot_json, data_sources_json, gaps_json, warnings_json,
--     recommendations_json, source_hash;
--   · los 8 sellos generated_/reviewed_/approved_/obsolete_.
-- Lo único que un UPDATE directo puede cambiar (preparación previa a
-- generar) es notes y, mientras el pasaporte esté en 'draft', la selección
-- de output_lot_id / circularity_assessment_id (la validación de destino de
-- 0084 sigue aplicando). La identidad (reference_id, passport_code,
-- passport_version) permanece inmutable siempre, como en 0084.
-- El INSERT conserva exactamente las reglas de 0084 (nacer 'draft' vacío).
--
-- ALCANCE ESTRICTO: se reemplaza una función (misma firma, mismo trigger de
-- 0084 sigue apuntando a ella) y se completan los vínculos de evidencia
-- del pasaporte añadiendo los link_type de soporte por sección previstos en
-- la arquitectura T9.0 (composición/trazabilidad/circularidad/claims/
-- cuidado/fin de vida ya existían como tipos globales; aquí se documenta y
-- se asegura que 'passport_support' y los de sección son válidos para
-- entity_type='technical_passport'). Sin tablas nuevas, sin políticas
-- nuevas, sin tocar CPR, sin UI, sin generación completa. CERO objetos CPR.

-- ---------------------------------------------------------------------------
-- 1. Redefinición del guard de snapshot/estado/sellos (cierra el hueco draft)
-- ---------------------------------------------------------------------------
create or replace function public.protect_textile_technical_passport_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Las RPCs controladas (generate_..._base, change_..._status) activan el
  -- flag local a la transacción; el trigger solo lo lee. Bajo el flag, la
  -- escritura es legítima.
  if coalesce(current_setting('trazaloop.textile_passport_generate', true), 'off') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Reglas de creación idénticas a 0084: nacer 'draft' y vacío.
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

  -- UPDATE fuera del flag: el estado SOLO cambia por la RPC de transición.
  -- (T9A.1: antes esto solo se vigilaba cuando old.status <> 'draft'.)
  if new.status is distinct from old.status then
    raise exception 'El estado del pasaporte solo puede cambiarse mediante el flujo controlado (generación o transición).';
  end if;

  -- El snapshot, sus derivados, el hash y los sellos SOLO los escribe la RPC
  -- —en CUALQUIER estado, incluido 'draft'—. Un UPDATE directo jamás los toca.
  if new.snapshot_json is distinct from old.snapshot_json
     or new.data_sources_json is distinct from old.data_sources_json
     or new.gaps_json is distinct from old.gaps_json
     or new.warnings_json is distinct from old.warnings_json
     or new.recommendations_json is distinct from old.recommendations_json
     or new.source_hash is distinct from old.source_hash then
    raise exception 'El snapshot y los campos calculados del pasaporte no pueden modificarse directamente. Se generan o se regeneran en una nueva versión.';
  end if;
  if new.generated_at is distinct from old.generated_at
     or new.generated_by is distinct from old.generated_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.reviewed_by is distinct from old.reviewed_by
     or new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by
     or new.obsolete_at is distinct from old.obsolete_at
     or new.obsolete_by is distinct from old.obsolete_by then
    raise exception 'Los sellos de generación, revisión y aprobación del pasaporte solo los fija el flujo controlado.';
  end if;

  -- Identidad inmutable siempre (igual que 0084).
  if new.reference_id is distinct from old.reference_id
     or new.passport_code is distinct from old.passport_code
     or new.passport_version is distinct from old.passport_version then
    raise exception 'La identidad del pasaporte (referencia, código y versión) no puede cambiarse.';
  end if;
  -- output_lot_id / circularity_assessment_id: seleccionables solo mientras
  -- el pasaporte está en 'draft' (preparación previa a generar); una vez
  -- generado quedan congelados. La coherencia con la referencia la sigue
  -- garantizando validate_..._target de 0084.
  if old.status <> 'draft'
     and (new.output_lot_id is distinct from old.output_lot_id
          or new.circularity_assessment_id is distinct from old.circularity_assessment_id) then
    raise exception 'El lote y la evaluación de circularidad del pasaporte no pueden cambiarse después de generarlo. Cree una nueva versión.';
  end if;

  return new;
end;
$$;
revoke execute on function public.protect_textile_technical_passport_snapshot() from public, anon, authenticated;

-- El trigger t_textile_passports_protect_snapshot de 0084 (BEFORE INSERT OR
-- UPDATE) sigue apuntando a esta función; no se recrea.

-- ---------------------------------------------------------------------------
-- 2. Vínculos de evidencia del pasaporte: coherencia entity_type × link_type
-- ---------------------------------------------------------------------------
-- El check de link_type de 0084 es GLOBAL (una lista para todos los
-- entity_type), así que 'passport_support' y los de sección ya son
-- técnicamente válidos sobre entity_type='technical_passport'. Lo que
-- faltaba —y este sprint completa— es RESTRINGIR qué link_type tienen
-- sentido para un pasaporte, evitando combinaciones sin sentido (p. ej.
-- 'input_lot_support' colgado de un pasaporte). Un vínculo con
-- entity_type='technical_passport' solo puede usar los tipos de soporte por
-- sección previstos en la arquitectura T9.0.
--
-- IMPORTANTE: este validador SOLO mira los vínculos cuyo entity_type es
-- 'technical_passport'. Para cualquier otro entity_type retorna sin tocar
-- nada — el comportamiento de evidencias de CPR y de los demás módulos
-- textiles queda EXACTAMENTE igual.
create or replace function public.validate_textile_passport_evidence_link_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.entity_type <> 'technical_passport' then
    return new;  -- no aplica: otros tipos siguen como estaban.
  end if;

  if new.link_type not in (
    'passport_support',        -- soporte general del pasaporte
    'composition_support',     -- 5.3 composición
    'traceability_support',    -- 5.8 trazabilidad
    'circularity_support',     -- 5.9 circularidad
    'recycled_claim_support',  -- 5.11 claim reciclado
    'organic_claim_support',   -- 5.11 claim orgánico
    'care_support',            -- 5.10 cuidado
    'end_of_life_support',     -- 5.10 fin de vida
    'general_support',         -- soporte genérico admitido
    'other'
  ) then
    raise exception 'El tipo de vínculo % no es válido para un pasaporte técnico textil.', new.link_type;
  end if;

  return new;
end;
$$;
revoke execute on function public.validate_textile_passport_evidence_link_type() from public, anon, authenticated;

create trigger t_textile_passport_evidence_link_type
  before insert or update on public.textile_evidence_links
  for each row execute function public.validate_textile_passport_evidence_link_type();
