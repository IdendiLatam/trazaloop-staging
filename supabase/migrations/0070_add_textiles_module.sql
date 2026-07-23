-- 0070_add_textiles_module.sql
-- Trazaloop · Sprint T1 (Textil) · Fila del módulo "textiles" en el catálogo.
--
-- ALCANCE ESTRICTO (T1): SOLO esta fila de catálogo. Este sprint NO crea
-- tablas textile_*, NO crea organization_module_access, NO toca
-- plan_definitions / plan_limits / organization_subscriptions y NO modifica
-- nada de CPR. (Planes por módulo: sprint futuro Plataforma-M1, DL-22.)
--
-- is_available = false A PROPÓSITO (módulo PRIVADO, DL-02/DL-03):
--   * create_organization (0004) siembra a las empresas nuevas SOLO los
--     módulos con is_available = true → ninguna empresa nueva recibe
--     "textiles" automáticamente.
--   * La habilitación es explícita y por empresa: una fila en
--     organization_modules (organization_id, 'textiles') creada por el
--     operador de plataforma (ver docs/modules/textiles/
--     TEXTILES_T1_IMPLEMENTATION_REPORT.md).
--   * Además, la ruta /textiles exige el feature flag de entorno
--     TEXTILES_MODULE_ENABLED del lado servidor (doble control).
--
-- Idempotente: on conflict (code) do nothing — re-ejecutar es seguro y
-- nunca pisa un catálogo existente. No borra ni modifica ningún módulo.

insert into public.modules (code, name, description, is_available)
values (
  'textiles',
  'Trazaloop Textil',
  'Trazabilidad de productos de confección, composición de fibras, evidencias, circularidad y pasaporte técnico textil.',
  false
)
on conflict (code) do nothing;
