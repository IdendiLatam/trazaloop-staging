-- 0027_import_input_batches.sql
-- Trazaloop · Sprint 3 · Importación CSV de lotes de entrada.
-- Solo se amplía import_jobs.entity; las órdenes, consumos, lotes de salida
-- y composición NO se importan por CSV en este sprint.

alter table public.import_jobs
  drop constraint import_jobs_entity_check;

alter table public.import_jobs
  add constraint import_jobs_entity_check
  check (entity in ('suppliers','product_families','products','materials','input_batches'));
