-- 0003_helpers.sql
-- Trazaloop · Sprint 1 · Fundaciones
-- Funciones auxiliares genéricas. Los helpers de rol (is_org_member, etc.)
-- se crean en 0004 porque dependen de la tabla memberships.

-- Mantiene updated_at en cada UPDATE. Adjuntar como trigger BEFORE UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Peso numérico de una respuesta de diagnóstico (se usará en Sprint 2,
-- se define aquí porque es pura e inmutable y pertenece a las fundaciones).
create or replace function public.answer_weight(a diagnostic_answer)
returns numeric
language sql
immutable
as $$
  select case a
    when 'none'        then 0.0
    when 'informal'    then 0.25
    when 'documented'  then 0.5
    when 'implemented' then 0.75
    when 'evidenced'   then 1.0
  end;
$$;
