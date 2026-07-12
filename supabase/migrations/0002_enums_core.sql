-- 0002_enums_core.sql
-- Trazaloop · Sprint 1 · Fundaciones
-- Enums núcleo. NOTA: document_status NO se crea aquí (pertenece a la subfase 1B).

create type membership_status as enum ('active', 'suspended', 'revoked');

create type evidence_status as enum ('pending', 'valid', 'rejected', 'expired');

create type evidence_target_type as enum (
  'supplier',
  'input_batch',
  'production_order',
  'output_batch',
  'material',
  'product',
  'product_family',
  'document',
  'requirement',
  'site'
);

create type residue_type as enum (
  'preconsumer',
  'postconsumer',
  'postindustrial',
  'virgin',
  'other'
);

create type diagnostic_status as enum ('in_progress', 'completed');

create type diagnostic_answer as enum (
  'none',
  'informal',
  'documented',
  'implemented',
  'evidenced'
);
