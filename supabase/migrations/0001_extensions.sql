-- 0001_extensions.sql
-- Trazaloop · Sprint 1 · Fundaciones
-- Extensiones estrictamente necesarias.

-- gen_random_uuid()
create extension if not exists "pgcrypto";
