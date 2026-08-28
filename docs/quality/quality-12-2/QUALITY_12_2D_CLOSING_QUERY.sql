-- ============================================================================
-- QUALITY-12.2D · Cierre · CONSULTA DE SOLO LECTURA
-- ----------------------------------------------------------------------------
-- Ejecutar en el SQL Editor de Staging. NO escribe nada: solo SELECT.
-- No devuelve el texto de la persona ni los hallazgos, ni ningún dato personal:
-- solo metadatos de la operación, consumo y recuentos.
-- Devuelve UNA fila con un JSON. Pégalo tal cual.
-- ============================================================================
with runs as (
  select r.*
    from public.quality_ai_runs r
   where r.use_case = 'document.contextual_review'
     and r.started_at >= now() - interval '3 days'
),
detalle as (
  select
    r.id,
    r.started_at,
    r.completed_at,
    o.name                                   as empresa,
    r.module_key                             as modulo,
    d.code                                   as documento_codigo,
    d.title                                  as documento_titulo,
    d.status                                 as documento_estado,
    r.section_key                            as seccion,
    r.use_case, r.provider, r.model, r.provider_called, r.status,
    r.prompt_template, r.prompt_version,
    r.guidance_revision_id,
    gr.revision_number                       as guidance_revision_numero,
    g.scope                                  as guidance_scope,
    g.module_key                             as guidance_modulo,
    r.related_context_types,
    r.context_queries                        as consultas,
    r.context_items                          as fuentes_citadas,
    (select count(*) from public.quality_ai_run_references x where x.run_id = r.id)
                                             as fuentes_guardadas,
    (select array_agg(distinct x.source_code order by x.source_code)
       from public.quality_ai_run_references x where x.run_id = r.id)
                                             as fuentes_dominios,
    jsonb_array_length(coalesce(r.answer -> 'findings', '[]'::jsonb))
                                             as hallazgos,
    (select count(*) from jsonb_array_elements(coalesce(r.answer -> 'findings','[]'::jsonb)) f
      where f ->> 'type' = 'confirmed_conflict')
                                             as hallazgos_confirmados,
    (select array_agg(distinct f ->> 'type')
       from jsonb_array_elements(coalesce(r.answer -> 'findings','[]'::jsonb)) f)
                                             as tipos_de_hallazgo,
    r.input_tokens, r.cached_input_tokens, r.output_tokens,
    r.reasoning_tokens, r.total_tokens,
    r.latency_ms                             as latencia_total_ms,
    r.error_message
  from runs r
  left join public.organizations o on o.id = r.organization_id
  left join public.trazadoc_documents d on d.id = r.document_id
  left join public.trazadoc_authoring_guidance_revisions gr on gr.id = r.guidance_revision_id
  left join public.trazadoc_authoring_guidance g on g.id = gr.guidance_id
),
escrituras as (
  -- Nada del sistema de gestión puede haber cambiado por una revisión.
  select jsonb_build_object(
    'revisiones_de_documento_creadas',
      (select count(*) from public.trazadoc_document_revisions t
        where t.created_at >= now() - interval '3 days'),
    'versiones_de_documento_creadas',
      (select count(*) from public.trazadoc_document_versions t
        where t.created_at >= now() - interval '3 days'),
    'casos_creados',
      (select count(*) from public.work_cases t
        where t.created_at >= now() - interval '3 days'),
    'acciones_creadas',
      (select count(*) from public.work_actions t
        where t.created_at >= now() - interval '3 days'),
    'riesgos_creados',
      (select count(*) from public.quality_risks t
        where t.created_at >= now() - interval '3 days'),
    'controles_creados',
      (select count(*) from public.quality_controls t
        where t.created_at >= now() - interval '3 days'),
    'indicadores_creados',
      (select count(*) from public.quality_indicators t
        where t.created_at >= now() - interval '3 days'),
    'revisiones_de_proceso_creadas',
      (select count(*) from public.quality_process_revisions t
        where t.created_at >= now() - interval '3 days')
  ) as j
),
documentos as (
  -- Los documentos que se revisaron, ¿siguen igual?
  select coalesce(jsonb_agg(jsonb_build_object(
           'documento', d.code,
           'estado', d.status,
           'aprobado_en', d.approved_at,
           'revision_vigente', d.current_revision_id,
           'creado', d.created_at,
           'actualizado', d.updated_at,
           'sin_tocar_desde_su_creacion', d.updated_at = d.created_at
         ) order by d.code), '[]'::jsonb) as j
    from public.trazadoc_documents d
   where d.id in (select distinct document_id from runs where document_id is not null)
),
secciones as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'seccion', s.section_key,
           'creada', s.created_at,
           'actualizada', s.updated_at
         ) order by s.section_key), '[]'::jsonb) as j
    from public.trazadoc_document_sections s
   where s.document_id in (select distinct document_id from runs where document_id is not null)
),
consumo as (
  select coalesce(jsonb_object_agg(use_case, n), '{}'::jsonb) as j
    from (select use_case, count(*) n from public.quality_ai_runs
           where started_at >= now() - interval '3 days' group by 1) t
)
select jsonb_pretty(jsonb_build_object(
  'runs', (select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at), '[]'::jsonb) from detalle x),
  'escrituras_de_negocio_ultimos_3_dias', (select j from escrituras),
  'documentos_revisados', (select j from documentos),
  'secciones_de_esos_documentos', (select j from secciones),
  'operaciones_por_caso_de_uso', (select j from consumo)
)) as resultado;
