-- 0067_onboarding_status_views.sql
-- Trazaloop · Sprint 10D · Estado de onboarding — calculado 100% desde
-- datos existentes (Parte 11: "preferir no crear tabla si el estado
-- puede calcularse"). Ningún flag se guarda aparte; todo se deriva de
-- las tablas de negocio ya existentes cada vez que se consulta.
--
-- MISMO patrón que v_organization_plan_usage (0052/0059): NO
-- security_invoker, guarda is_org_member(...) or is_platform_staff()
-- embebida en la vista misma — sirve a la vez a un miembro de empresa
-- viendo su propio progreso y a un superadmin viendo el de cualquiera.
--
-- total_steps/completed_steps/progress_percent cubren los 7 pasos
-- CALCULABLES del onboarding (Parte 7, pasos 1-7). El paso 8 ("Revisar
-- límites del plan Demo") es puramente de navegación — no hay ningún
-- dato de negocio que indique si alguien "revisó" una pantalla, así que
-- se muestra en la UI como paso adicional, nunca contado aquí (evita
-- inventar un mecanismo de seguimiento para algo que no es inferible).

create view public.v_organization_onboarding_status as
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
    (case when coalesce(td.has_trazadoc, false) then 1 else 0 end)
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
      (case when coalesce(td.has_trazadoc, false) then 1 else 0 end)
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
