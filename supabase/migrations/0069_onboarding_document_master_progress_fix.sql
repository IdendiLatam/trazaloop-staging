-- 0069_onboarding_document_master_progress_fix.sql
-- Trazaloop · Sprint 10D · Corrección: v_organization_onboarding_status
-- (0067) ya calculaba correctamente has_document_master_item =
-- has_trazadoc OR has_file_document, pero completed_steps y
-- progress_percent seguían sumando el paso documental usando SOLO
-- coalesce(td.has_trazadoc, false) — un documento descargable subido al
-- Maestro de documentos podía marcar el paso como completo en el
-- checklist visual (que sí usa has_document_master_item, corregido en
-- lib/domain/onboarding.ts en la ronda anterior) pero el CONTADOR
-- numérico y el PORCENTAJE seguían contándolo como pendiente — un
-- desfase real entre lo que el checklist mostraba y lo que decía el
-- resumen de progreso.
--
-- CREATE OR REPLACE VIEW con el cuerpo EXACTO de 0067 — mismas columnas,
-- mismo nombre, mismo orden (obligatorio para CREATE OR REPLACE VIEW) —
-- solo se corrige la EXPRESIÓN del paso documental dentro de
-- completed_steps y progress_percent, en los 2 lugares donde aparecía.

create or replace view public.v_organization_onboarding_status as
select
  o.id                                                                as organization_id,
  (o.legal_name is not null and o.tax_id is not null)                 as company_profile_completed,
  (o.legal_name is not null or o.tax_id is not null)                  as company_profile_started,
  coalesce(diag.diagnostic_started, false)                            as diagnostic_started,
  coalesce(diag.diagnostic_completed, false)                          as diagnostic_completed,
  coalesce(prod.has_product, false)                                   as has_product,
  coalesce(sup.has_supplier, false)                                   as has_supplier,
  coalesce(mat.has_material, false)                                   as has_material,
  coalesce(ev.has_evidence, false)                                    as has_evidence,
  coalesce(td.has_trazadoc, false)                                    as has_trazadoc,
  coalesce(td.has_trazadoc, false) or coalesce(fd.has_file_document, false) as has_document_master_item,
  coalesce(tk.open_tickets_count, 0)                                  as open_tickets_count,
  (
    (case when (o.legal_name is not null and o.tax_id is not null) then 1 else 0 end) +
    (case when coalesce(diag.diagnostic_completed, false) then 1 else 0 end) +
    (case when coalesce(prod.has_product, false) then 1 else 0 end) +
    (case when coalesce(sup.has_supplier, false) then 1 else 0 end) +
    (case when coalesce(mat.has_material, false) then 1 else 0 end) +
    (case when coalesce(ev.has_evidence, false) then 1 else 0 end) +
    -- Corrección: paso documental combinado (vivo O descargable), igual
    -- que has_document_master_item — nunca solo has_trazadoc.
    (case when (coalesce(td.has_trazadoc, false) or coalesce(fd.has_file_document, false)) then 1 else 0 end)
  )                                                                    as completed_steps,
  7                                                                    as total_steps,
  round(
    100.0 * (
      (case when (o.legal_name is not null and o.tax_id is not null) then 1 else 0 end) +
      (case when coalesce(diag.diagnostic_completed, false) then 1 else 0 end) +
      (case when coalesce(prod.has_product, false) then 1 else 0 end) +
      (case when coalesce(sup.has_supplier, false) then 1 else 0 end) +
      (case when coalesce(mat.has_material, false) then 1 else 0 end) +
      (case when coalesce(ev.has_evidence, false) then 1 else 0 end) +
      -- Misma corrección en progress_percent — misma condición
      -- combinada, para que el porcentaje nunca contradiga el checklist.
      (case when (coalesce(td.has_trazadoc, false) or coalesce(fd.has_file_document, false)) then 1 else 0 end)
    ) / 7.0,
    0
  )                                                                    as progress_percent
from public.organizations o
left join (
  select organization_id,
    true as diagnostic_started,
    bool_or(status = 'completed') as diagnostic_completed
  from public.diagnostics
  group by organization_id
) diag on diag.organization_id = o.id
left join (
  select distinct organization_id, true as has_product from public.products
) prod on prod.organization_id = o.id
left join (
  select distinct organization_id, true as has_supplier from public.suppliers
) sup on sup.organization_id = o.id
left join (
  select distinct organization_id, true as has_material from public.materials
) mat on mat.organization_id = o.id
left join (
  select distinct organization_id, true as has_evidence from public.evidences
) ev on ev.organization_id = o.id
left join (
  select distinct organization_id, true as has_trazadoc from public.trazadoc_documents
) td on td.organization_id = o.id
left join (
  select distinct organization_id, true as has_file_document from public.trazadoc_file_documents
) fd on fd.organization_id = o.id
left join (
  select organization_id, count(*) as open_tickets_count
  from public.support_tickets
  where status in ('open', 'assigned', 'waiting_customer', 'in_progress')
  group by organization_id
) tk on tk.organization_id = o.id
where public.is_org_member(o.id) or public.is_platform_staff();

revoke all on public.v_organization_onboarding_status from public, anon;
grant select on public.v_organization_onboarding_status to authenticated;
