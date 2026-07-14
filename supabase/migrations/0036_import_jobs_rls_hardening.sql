-- 0036_import_jobs_rls_hardening.sql
-- Trazaloop · Sprint 7.1 · Endurecimiento de RLS en import_jobs.
--
-- La política de INSERT original (0021_import_jobs.sql) permitía a
-- CUALQUIER miembro activo de la empresa registrar un evento de
-- importación, sin importar su rol:
--
--   create policy import_jobs_insert on public.import_jobs
--     for insert to authenticated with check (public.is_org_member(organization_id));
--
-- server/actions/imports.ts (Sprint 7) ya exige admin/quality/consultant en
-- aplicación antes de validar o confirmar una importación; esta migración
-- cierra la misma puerta a nivel de base de datos, igual que
-- import_job_rows (0035) y el resto de tablas de negocio desde el
-- Sprint 3 (input_batches, production_orders, etc.). No rompe ninguna
-- importación existente: los tres roles que ya podían operar el
-- importador desde la UI (admin, quality, consultant) siguen pudiendo
-- hacerlo exactamente igual.
--
-- No cambia la estructura de import_jobs ni de import_job_rows. No toca la
-- política de SELECT (ya correcta: cualquier miembro activo puede leer el
-- historial de su empresa). Sigue sin haber política de UPDATE ni DELETE:
-- import_jobs permanece append-only (deny-by-default: sin política, no hay
-- acceso — igual que desde el Sprint 2).

drop policy if exists import_jobs_insert on public.import_jobs;

create policy import_jobs_insert on public.import_jobs
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
  );

-- Documentado, no ejecutado (nada que hacer): sin create policy de UPDATE
-- ni DELETE en import_jobs. RLS deny-by-default ya bloquea ambas
-- operaciones para cualquier rol, incluido admin.
