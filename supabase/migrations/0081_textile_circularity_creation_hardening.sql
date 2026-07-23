-- 0081_textile_circularity_creation_hardening.sql
-- Trazaloop · Sprint T7.1 (Textil) · Hardening de CREACIÓN de evaluaciones
-- de circularidad.
--
-- PROBLEMA: la protección de campos calculados de 0080
-- (protect_textile_circularity_calculated_fields) actúa solo en BEFORE
-- UPDATE. La política RLS de insert permite crear filas a
-- admin/quality/consultant, así que un usuario con acceso directo a la
-- API de Supabase podía INSERTAR una evaluación que NACIERA ya
-- 'completed' con circularity_score, readiness_level, dimension_scores,
-- gaps, recommendations y sellos fabricados desde el cliente —
-- esquivando por completo el flujo controlado de cálculo/finalización.
--
-- SOLUCIÓN (este archivo, y nada más): trigger BEFORE INSERT que exige
-- que toda evaluación nazca como BORRADOR limpio:
--   · status = 'draft' (nacer 'completed' o 'archived' queda bloqueado);
--   · los 8 campos calculados en sus valores vacíos/default;
-- salvo bajo el MISMO flag transaccional interno de 0080
-- (trazaloop.textile_circularity_calculate = 'on'), que solo fijan las
-- funciones controladas. El cálculo y la finalización siguen siendo la
-- única vía para poblarlos (calculate/finalize de 0080, sin cambios).
--
-- ALCANCE ESTRICTO: una función + un trigger sobre
-- textile_circularity_assessments. Sin tablas, sin políticas, sin vistas,
-- sin cambios a 0080, sin circularidad adicional, sin TrazaDocs Textil,
-- sin pasaporte, sin QR, sin planes por módulo. CERO objetos CPR.

create or replace function public.protect_textile_circularity_assessment_creation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Mismo flag local a la transacción que 0080: solo lo activan las
  -- funciones controladas de cálculo/finalización.
  if coalesce(current_setting('trazaloop.textile_circularity_calculate', true), 'off') = 'on' then
    return new;
  end if;

  if new.status is distinct from 'draft' then
    raise exception 'Una evaluación de circularidad debe crearse como borrador. La finalización solo ocurre mediante el flujo controlado.';
  end if;

  if new.circularity_score is not null
     or new.readiness_level is not null
     or coalesce(new.dimension_scores, '{}'::jsonb) <> '{}'::jsonb
     or coalesce(new.gaps, '[]'::jsonb) <> '[]'::jsonb
     or coalesce(new.recommendations, '[]'::jsonb) <> '[]'::jsonb
     or new.calculated_at is not null
     or new.completed_at is not null
     or new.completed_by is not null then
    raise exception 'Los campos calculados de la evaluación de circularidad no pueden fijarse al crearla. Deben calcularse desde sus respuestas y datos.';
  end if;

  return new;
end;
$$;
revoke execute on function public.protect_textile_circularity_assessment_creation() from public, anon, authenticated;

create trigger t_textile_circularity_assessments_protect_insert
  before insert on public.textile_circularity_assessments
  for each row execute function public.protect_textile_circularity_assessment_creation();
