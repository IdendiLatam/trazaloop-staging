-- Trazaloop · Verificación: todas las tablas (Sprint 1 + 2 + 3 + 4) tienen RLS activo.
-- Correr con: psql "$SUPABASE_DB_URL" -f tests/rls/check-rls-enabled.sql
-- Debe devolver 0 filas. Cada fila devuelta es una tabla SIN RLS (fallo).
select c.relname as tabla_sin_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    -- Sprint 1
    'profiles','organizations','roles','memberships',
    'modules','organization_modules','sites','audit_log',
    -- Sprint 2
    'frameworks','requirements',
    'diagnostic_sections','diagnostic_questions','diagnostics','diagnostic_answers',
    'evidences','evidence_links',
    'product_families','products','material_classifications','suppliers','materials',
    'import_jobs',
    -- Sprint 3
    'input_batches','production_orders','batch_consumption',
    'output_batches','batch_composition',
    -- Sprint 4
    'calculation_methodologies','recycled_content_calculations'
  )
  and c.relrowsecurity = false;
