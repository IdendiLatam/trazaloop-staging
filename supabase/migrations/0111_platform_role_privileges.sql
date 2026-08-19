-- 0111_platform_role_privileges.sql
-- Trazaloop · Q0.3H · Privilegios de rol REPRODUCIBLES desde migraciones.
--
-- ============================================================================
-- POR QUE EXISTE ESTA MIGRACION
-- ============================================================================
-- Hallazgo de Q0.3 (documentado en Q0_3_LOCAL_ENVIRONMENT_IMPLEMENTATION.md):
-- las migraciones 0001-0110 NUNCA conceden privilegios de tabla a los roles
-- anon / authenticated / service_role. El proyecto de produccion funciona
-- porque su bootstrap de Supabase, permisivo en la epoca en que se creo,
-- concedio esos privilegios fuera de toda migracion (119 sentencias GRANT
-- verificadas en el esquema desplegado, ninguna proveniente del repositorio).
--
-- Un proyecto NUEVO creado con el CLI actual NO recibe esos privilegios: el
-- rol postgres solo concede por defecto Dxtm (truncate, references, trigger,
-- maintain), sin SELECT ni escritura. Consecuencia: aplicar las 102
-- migraciones sobre un proyecto nuevo produce un esquema correcto pero una
-- aplicacion inservible, con 42501 "permission denied for table ..." en
-- practicamente cada consulta.
--
-- Prueba de que las migraciones ASUMEN esos privilegios: la migracion 0028
-- ejecuta "revoke insert, update, delete ... from anon, authenticated". Un
-- revoke solo tiene sentido si el privilegio existia.
--
-- Esta migracion cierra esa brecha para que se cumpla:
--     PROYECTO NUEVO + MIGRACIONES DESDE CERO = PRIVILEGIOS CORRECTOS
-- sin ningun paso manual posterior.
--
-- ============================================================================
-- CRITERIOS DE DISEÑO (DR-22)
-- ============================================================================
--  1. PRIVILEGIOS EXPLICITOS. Se concede unicamente SELECT, INSERT, UPDATE y
--     DELETE. NO se usa "GRANT ALL".
--  2. NO se conceden TRUNCATE, REFERENCES ni TRIGGER. Es un ENDURECIMIENTO
--     deliberado respecto al estado heredado de produccion, donde el GRANT ALL
--     del bootstrap dejo TRUNCATE en manos de anon y authenticated en 108
--     objetos. TRUNCATE BYPASEA RLS: un cliente jamas debe tenerlo. REFERENCES
--     y TRIGGER son privilegios de DDL que la aplicacion nunca ejerce.
--  3. OBJETOS ENUMERADOS UNO A UNO. No se usa "ON ALL TABLES IN SCHEMA public".
--     Asi el conjunto de objetos accesibles es auditable y cerrado.
--  4. SIN "ALTER DEFAULT PRIVILEGES". Es deliberado: toda tabla futura -- en
--     particular las de Trazaloop Quality -- debera declarar sus GRANT de forma
--     explicita en su propia migracion. Ningun objeto nuevo queda accesible por
--     omision.
--  5. SE PRESERVA EL ENDURECIMIENTO EXISTENTE. Las tablas server-only quedan
--     fuera de todo GRANT a anon/authenticated, y el revoke de 0028 se reaplica
--     al final porque esta migracion corre DESPUES y volveria a abrir la
--     escritura.
--  6. RLS NO SE TOCA. Sigue siendo la barrera real: estos privilegios solo
--     permiten alcanzar la tabla; que filas se ven lo decide la politica.
--
-- ADITIVA: no modifica ninguna migracion historica, no crea ni altera tablas,
-- no toca datos, no cambia politicas RLS.
--
-- ROLLBACK (documentado; NO ejecutar sin decision):
--   revoke select, insert, update, delete on all tables in schema public
--     from anon, authenticated, service_role;
--   ADVERTENCIA: en el proyecto de PRODUCCION actual eso retiraria tambien los
--   privilegios que hoy provienen del bootstrap y dejaria la aplicacion
--   inservible. El rollback solo es seguro en un proyecto nuevo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §1 · Uso del esquema
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- §2 · service_role — DML sobre todos los objetos del producto
--      service_role ya bypasea RLS; estos privilegios solo le permiten alcanzar
--      los objetos. Se usa exclusivamente en servidor.
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on table
  public.audit_dossiers,
  public.audit_log,
  public.batch_composition,
  public.batch_consumption,
  public.calculation_methodologies,
  public.customer_requirement_links,
  public.customer_requirements,
  public.diagnostic_answers,
  public.diagnostic_questions,
  public.diagnostic_sections,
  public.diagnostics,
  public.evidence_links,
  public.evidences,
  public.frameworks,
  public.implementation_feedback,
  public.import_job_rows,
  public.import_jobs,
  public.input_batches,
  public.legal_documents,
  public.material_classifications,
  public.materials,
  public.memberships,
  public.modules,
  public.organization_modules,
  public.organization_subscriptions,
  public.organizations,
  public.output_batch_consumption,
  public.output_batches,
  public.plan_definitions,
  public.plan_limits,
  public.platform_staff,
  public.product_families,
  public.production_orders,
  public.products,
  public.profiles,
  public.recycled_content_calculations,
  public.requirements,
  public.roles,
  public.sites,
  public.storage_orphan_candidates,
  public.storage_upload_intents,
  public.subscription_plan_history,
  public.suppliers,
  public.support_ticket_messages,
  public.support_ticket_status_history,
  public.support_tickets,
  public.team_invitations,
  public.textile_circularity_answers,
  public.textile_circularity_assessments,
  public.textile_circularity_criteria,
  public.textile_circularity_methodologies,
  public.textile_collections,
  public.textile_components,
  public.textile_diagnostic_answers,
  public.textile_diagnostic_questions,
  public.textile_diagnostic_sections,
  public.textile_diagnostics,
  public.textile_evidence_links,
  public.textile_evidence_upload_intents,
  public.textile_evidences,
  public.textile_fiber_types,
  public.textile_input_lots,
  public.textile_materials,
  public.textile_order_consumptions,
  public.textile_order_process_steps,
  public.textile_output_lots,
  public.textile_outsourced_processes,
  public.textile_processes,
  public.textile_production_orders,
  public.textile_products,
  public.textile_reference_components,
  public.textile_reference_fiber_composition,
  public.textile_reference_materials,
  public.textile_references,
  public.textile_suppliers,
  public.textile_technical_passport_share_links,
  public.textile_technical_passports,
  public.traceability_exercises,
  public.trazadoc_blueprint_sections,
  public.trazadoc_blueprints,
  public.trazadoc_document_sections,
  public.trazadoc_document_versions,
  public.trazadoc_documents,
  public.trazadoc_file_document_versions,
  public.trazadoc_file_documents,
  public.trazadoc_status_history,
  public.user_legal_acceptances,
  public.v_calculation_component_rows,
  public.v_calculation_dossier,
  public.v_guided_flow_dashboard,
  public.v_implementation_dashboard,
  public.v_implementation_next_actions,
  public.v_input_batch_inventory,
  public.v_latest_batch_recycled,
  public.v_material_inventory,
  public.v_organization_module_usage,
  public.v_organization_onboarding_status,
  public.v_organization_plan_usage,
  public.v_output_batch_completeness,
  public.v_output_batch_evidence_matrix,
  public.v_output_batch_inventory,
  public.v_output_batch_readiness,
  public.v_output_batch_support_gaps,
  public.v_platform_organization_invitations,
  public.v_platform_organization_members,
  public.v_platform_organizations,
  public.v_platform_support_ticket_summary,
  public.v_production_order_mass_balance,
  public.v_recycled_by_family,
  public.v_recycled_by_order,
  public.v_recycled_by_period,
  public.v_recycled_by_product,
  public.v_support_ticket_summary,
  public.v_textile_input_lot_balance,
  public.v_textile_output_lot_traceability_summary,
  public.v_traceability_backward,
  public.v_traceability_forward,
  public.v_trazadoc_blueprint_summary,
  public.v_trazadoc_document_master,
  public.v_trazadoc_document_summary
to service_role;

-- ----------------------------------------------------------------------------
-- §3 · authenticated — DML sobre los objetos de negocio
--      EXCLUIDAS a proposito las tablas server-only (0101 §2):
--        · storage_upload_intents
--        · storage_orphan_candidates
--      Un cliente jamas debe poder leerlas ni escribirlas: solo las RPC
--      SECURITY DEFINER server-only las tocan.
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on table
  public.audit_dossiers,
  public.audit_log,
  public.batch_composition,
  public.batch_consumption,
  public.calculation_methodologies,
  public.customer_requirement_links,
  public.customer_requirements,
  public.diagnostic_answers,
  public.diagnostic_questions,
  public.diagnostic_sections,
  public.diagnostics,
  public.evidence_links,
  public.evidences,
  public.frameworks,
  public.implementation_feedback,
  public.import_job_rows,
  public.import_jobs,
  public.input_batches,
  public.legal_documents,
  public.material_classifications,
  public.materials,
  public.memberships,
  public.modules,
  public.organization_modules,
  public.organization_subscriptions,
  public.organizations,
  public.output_batch_consumption,
  public.output_batches,
  public.plan_definitions,
  public.plan_limits,
  public.platform_staff,
  public.product_families,
  public.production_orders,
  public.products,
  public.profiles,
  public.recycled_content_calculations,
  public.requirements,
  public.roles,
  public.sites,
  public.subscription_plan_history,
  public.suppliers,
  public.support_ticket_messages,
  public.support_ticket_status_history,
  public.support_tickets,
  public.team_invitations,
  public.textile_circularity_answers,
  public.textile_circularity_assessments,
  public.textile_circularity_criteria,
  public.textile_circularity_methodologies,
  public.textile_collections,
  public.textile_components,
  public.textile_diagnostic_answers,
  public.textile_diagnostic_questions,
  public.textile_diagnostic_sections,
  public.textile_diagnostics,
  public.textile_evidence_links,
  public.textile_evidence_upload_intents,
  public.textile_evidences,
  public.textile_fiber_types,
  public.textile_input_lots,
  public.textile_materials,
  public.textile_order_consumptions,
  public.textile_order_process_steps,
  public.textile_output_lots,
  public.textile_outsourced_processes,
  public.textile_processes,
  public.textile_production_orders,
  public.textile_products,
  public.textile_reference_components,
  public.textile_reference_fiber_composition,
  public.textile_reference_materials,
  public.textile_references,
  public.textile_suppliers,
  public.textile_technical_passport_share_links,
  public.textile_technical_passports,
  public.traceability_exercises,
  public.trazadoc_blueprint_sections,
  public.trazadoc_blueprints,
  public.trazadoc_document_sections,
  public.trazadoc_document_versions,
  public.trazadoc_documents,
  public.trazadoc_file_document_versions,
  public.trazadoc_file_documents,
  public.trazadoc_status_history,
  public.user_legal_acceptances,
  public.v_calculation_component_rows,
  public.v_calculation_dossier,
  public.v_guided_flow_dashboard,
  public.v_implementation_dashboard,
  public.v_implementation_next_actions,
  public.v_input_batch_inventory,
  public.v_latest_batch_recycled,
  public.v_material_inventory,
  public.v_organization_module_usage,
  public.v_organization_onboarding_status,
  public.v_organization_plan_usage,
  public.v_output_batch_completeness,
  public.v_output_batch_evidence_matrix,
  public.v_output_batch_inventory,
  public.v_output_batch_readiness,
  public.v_output_batch_support_gaps,
  public.v_platform_organization_invitations,
  public.v_platform_organization_members,
  public.v_platform_organizations,
  public.v_platform_support_ticket_summary,
  public.v_production_order_mass_balance,
  public.v_recycled_by_family,
  public.v_recycled_by_order,
  public.v_recycled_by_period,
  public.v_recycled_by_product,
  public.v_support_ticket_summary,
  public.v_textile_input_lot_balance,
  public.v_textile_output_lot_traceability_summary,
  public.v_traceability_backward,
  public.v_traceability_forward,
  public.v_trazadoc_blueprint_summary,
  public.v_trazadoc_document_master,
  public.v_trazadoc_document_summary
to authenticated;

-- ----------------------------------------------------------------------------
-- §4 · anon — mismo criterio, con las vistas que las migraciones ya revocaron
--      para anon excluidas (consolas de plataforma, uso por organizacion e
--      inventarios: v_platform_*, v_organization_*, v_*_inventory).
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on table
  public.audit_dossiers,
  public.audit_log,
  public.batch_composition,
  public.batch_consumption,
  public.calculation_methodologies,
  public.customer_requirement_links,
  public.customer_requirements,
  public.diagnostic_answers,
  public.diagnostic_questions,
  public.diagnostic_sections,
  public.diagnostics,
  public.evidence_links,
  public.evidences,
  public.frameworks,
  public.implementation_feedback,
  public.import_job_rows,
  public.import_jobs,
  public.input_batches,
  public.legal_documents,
  public.material_classifications,
  public.materials,
  public.memberships,
  public.modules,
  public.organization_modules,
  public.organization_subscriptions,
  public.organizations,
  public.output_batch_consumption,
  public.output_batches,
  public.plan_definitions,
  public.plan_limits,
  public.platform_staff,
  public.product_families,
  public.production_orders,
  public.products,
  public.profiles,
  public.recycled_content_calculations,
  public.requirements,
  public.roles,
  public.sites,
  public.subscription_plan_history,
  public.suppliers,
  public.support_ticket_messages,
  public.support_ticket_status_history,
  public.support_tickets,
  public.team_invitations,
  public.textile_circularity_answers,
  public.textile_circularity_assessments,
  public.textile_circularity_criteria,
  public.textile_circularity_methodologies,
  public.textile_collections,
  public.textile_components,
  public.textile_diagnostic_answers,
  public.textile_diagnostic_questions,
  public.textile_diagnostic_sections,
  public.textile_diagnostics,
  public.textile_evidence_links,
  public.textile_evidence_upload_intents,
  public.textile_evidences,
  public.textile_fiber_types,
  public.textile_input_lots,
  public.textile_materials,
  public.textile_order_consumptions,
  public.textile_order_process_steps,
  public.textile_output_lots,
  public.textile_outsourced_processes,
  public.textile_processes,
  public.textile_production_orders,
  public.textile_products,
  public.textile_reference_components,
  public.textile_reference_fiber_composition,
  public.textile_reference_materials,
  public.textile_references,
  public.textile_suppliers,
  public.textile_technical_passport_share_links,
  public.textile_technical_passports,
  public.traceability_exercises,
  public.trazadoc_blueprint_sections,
  public.trazadoc_blueprints,
  public.trazadoc_document_sections,
  public.trazadoc_document_versions,
  public.trazadoc_documents,
  public.trazadoc_file_document_versions,
  public.trazadoc_file_documents,
  public.trazadoc_status_history,
  public.user_legal_acceptances,
  public.v_calculation_component_rows,
  public.v_calculation_dossier,
  public.v_guided_flow_dashboard,
  public.v_implementation_dashboard,
  public.v_implementation_next_actions,
  public.v_latest_batch_recycled,
  public.v_output_batch_completeness,
  public.v_output_batch_evidence_matrix,
  public.v_output_batch_readiness,
  public.v_output_batch_support_gaps,
  public.v_production_order_mass_balance,
  public.v_recycled_by_family,
  public.v_recycled_by_order,
  public.v_recycled_by_period,
  public.v_recycled_by_product,
  public.v_support_ticket_summary,
  public.v_textile_input_lot_balance,
  public.v_textile_output_lot_traceability_summary,
  public.v_traceability_backward,
  public.v_traceability_forward,
  public.v_trazadoc_blueprint_summary,
  public.v_trazadoc_document_master,
  public.v_trazadoc_document_summary
to anon;

-- ----------------------------------------------------------------------------
-- §5 · Preservar el endurecimiento de 0028
--      Esta migracion corre DESPUES de 0028, de modo que §3 y §4 acaban de
--      reabrir la escritura sobre estas dos tablas. Se vuelve a cerrar aqui
--      para que el estado final sea identico al de produccion: solo lectura.
-- ----------------------------------------------------------------------------
revoke insert, update, delete on public.calculation_methodologies from anon, authenticated;
revoke insert, update, delete on public.recycled_content_calculations from anon, authenticated;

-- ----------------------------------------------------------------------------
-- §5b · Retirar TRUNCATE, REFERENCES y TRIGGER de los roles de cliente
--
--      Estos tres privilegios NO los concede esta migracion: los concede el
--      entorno. Los privilegios por defecto del rol postgres en un stack
--      Supabase actual otorgan Dxtm (truncate, references, trigger, maintain)
--      a anon y authenticated en cada tabla que se crea. En el proyecto de
--      produccion llegaron por la via distinta del GRANT ALL de su bootstrap.
--
--      TRUNCATE es el que importa: **bypasea RLS por completo**. Ninguna
--      politica de fila lo detiene. La superficie de explotacion hoy es baja
--      porque PostgREST no expone TRUNCATE y un cliente no abre conexiones
--      Postgres directas, pero es un privilegio que un rol de cliente no tiene
--      ninguna razon para poseer. REFERENCES y TRIGGER son privilegios de DDL
--      que la aplicacion nunca ejerce.
--
--      Se retiran de forma AMPLIA y deliberada. La asimetria con §2-§4 es
--      intencionada: conceder en bloque es peligroso porque abre lo que no se
--      ha revisado; revocar en bloque es seguro porque solo cierra. Asi el
--      estado final deja de depender de los privilegios por defecto del
--      entorno y es identico en local, staging y produccion.
--
--      service_role CONSERVA estos privilegios: es server-only y las
--      herramientas administrativas del repositorio pueden necesitarlos.
-- ----------------------------------------------------------------------------
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- ----------------------------------------------------------------------------
-- §6 · Verificacion posterior (documentacion; no se ejecuta aqui)
-- ----------------------------------------------------------------------------
--   select grantee, count(distinct table_name)
--     from information_schema.role_table_grants
--    where table_schema='public' and privilege_type='SELECT'
--      and grantee in ('anon','authenticated','service_role')
--    group by grantee;
--   Esperado: anon 108 · authenticated 118 · service_role 120
--
--   Las dos tablas server-only NO deben aparecer para anon ni authenticated:
--   select count(*) from information_schema.role_table_grants
--    where table_schema='public' and grantee in ('anon','authenticated')
--      and table_name in ('storage_upload_intents','storage_orphan_candidates');
--   Esperado: 0
