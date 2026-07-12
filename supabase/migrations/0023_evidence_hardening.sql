-- 0023_evidence_hardening.sql
-- Trazaloop · Sprint 2.1 · Endurecimiento de evidencias validadas.
--
-- Antes de que las evidencias soporten trazabilidad (Sprint 3) y cálculo
-- (Sprint 4), una evidencia con status = 'valid' debe ser intocable para
-- quien no aprueba (consultant) e imborrable para todos.
--
-- Se REEMPLAZA guard_evidence_validation() por guard_evidence_integrity()
-- (una sola fuente de reglas, sin duplicados contradictorios). Reglas:
--   1. status → 'valid' solo admin/quality.
--   2. salir de 'valid' hacia otro estado: solo admin/quality.
--   3. una evidencia validada NO puede ser modificada por consultant
--      (ningún campo, incluido storage_path — cubre también la regla 5).
--   4. una evidencia validada NO puede eliminarse (nadie; refuerza la RLS).
--   5. cambiar storage_path de una validada: solo admin/quality (implícito
--      en la regla 3; explícito abajo por claridad del mensaje).
--   6. consultant sigue creando evidencias y editando las pendientes.
--
-- Sin service_role; RLS sigue activa; función interna no ejecutable por clientes.

-- Retirar el guard anterior (queda reemplazado, no duplicado).
drop trigger if exists t_evidences_guard_validation on public.evidences;
drop function if exists public.guard_evidence_validation();

create or replace function public.guard_evidence_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approver boolean;
begin
  -- DELETE: una evidencia validada no se elimina (refuerzo del RLS,
  -- que ya limita delete a admin/quality con status <> 'valid').
  if tg_op = 'DELETE' then
    if old.status = 'valid' then
      raise exception 'Una evidencia validada no puede eliminarse';
    end if;
    return old;
  end if;

  -- UPDATE
  v_approver := public.has_org_role(old.organization_id, array['admin','quality']);

  -- Regla 1: marcar como válida es acto de aprobación.
  if new.status = 'valid' and new.status is distinct from old.status then
    if not v_approver then
      raise exception 'Solo administrador o calidad pueden marcar una evidencia como válida';
    end if;
  end if;

  if old.status = 'valid' then
    -- Regla 2: salir de 'valid' solo admin/quality.
    if new.status is distinct from old.status and not v_approver then
      raise exception 'Solo administrador o calidad pueden cambiar el estado de una evidencia validada';
    end if;

    -- Regla 5 (mensaje específico): el archivo de una validada no se
    -- reapunta sin rol de aprobación.
    if new.storage_path is distinct from old.storage_path and not v_approver then
      raise exception 'Solo administrador o calidad pueden cambiar el archivo de una evidencia validada';
    end if;

    -- Regla 3: cualquier otra modificación de una validada exige rol de
    -- aprobación (consultant queda bloqueado por completo).
    if not v_approver then
      raise exception 'Una evidencia validada no puede ser modificada por este rol';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_evidence_integrity() from public, anon, authenticated;

create trigger t_evidences_guard_integrity
  before update or delete on public.evidences
  for each row execute function public.guard_evidence_integrity();
