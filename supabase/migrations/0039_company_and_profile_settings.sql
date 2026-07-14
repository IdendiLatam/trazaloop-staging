-- 0039_company_and_profile_settings.sql
-- Trazaloop · Sprint 8.3 · Configuración de empresa y perfil de usuario.
--
-- organizations YA tiene: id, name, tax_id, country, created_by,
-- created_at, updated_at — con set_updated_at, t_audit_organizations
-- (audit_row_change) y RLS ya correctos (organizations_update exige
-- is_org_admin(id), ya desde el Sprint 1). profiles YA tiene: id,
-- full_name, email, created_at, updated_at — con set_updated_at y RLS ya
-- correcto (profiles_update exige id = auth.uid()).
--
-- Esta migración SOLO agrega las columnas que faltaban para los
-- formularios de "Datos de empresa" y "Mi perfil". No se duplica ningún
-- campo existente (name, tax_id, country, full_name, email se REUTILIZAN
-- tal cual). No se crea ninguna política ni trigger nuevo: RLS actúa por
-- fila, no por columna, así que las políticas de UPDATE ya existentes
-- cubren las columnas nuevas automáticamente; audit_row_change() serializa
-- la fila completa con to_jsonb(), así que también recoge las columnas
-- nuevas sin cambios. No se agrega avatar_url (Parte 4: "si no existe
-- soporte, no implementar carga de avatar todavía").

alter table public.organizations
  add column legal_name    text,
  add column contact_email text,
  add column phone         text,
  add column address       text,
  add column city          text,
  add column website        text;

alter table public.profiles
  add column phone    text,
  add column position text;
