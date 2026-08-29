-- ============================================================================
-- Trazaloop · QUALITY-12.3B3A · DATOS DE PRUEBA PARA LA VALIDACIÓN HUMANA
-- ----------------------------------------------------------------------------
-- Un conjunto PEQUEÑO y comprensible: tres partes interesadas, no trescientas.
-- La validación humana es mirar una pantalla y decidir si se entiende; con
-- cien filas no se mira nada, se hace scroll.
--
-- TODO va prefijado «QA Q123» para que se distinga de un dato real de un
-- vistazo y se pueda borrar sin dudar. No hay nombres de empresas reales, ni
-- personas, ni correos.
--
--
-- CÓMO SE APLICA
--
--   1 · Abre el editor SQL del proyecto de Staging.
--   2 · Cambia la ÚNICA línea marcada abajo por el nombre de la empresa donde
--       quieres los datos.
--   3 · Ejecuta el archivo entero. Es idempotente: ejecutarlo dos veces no
--       duplica nada.
--
-- NO se aplica desde este repositorio y NO es una migración: son datos, no
-- esquema. Production no se toca.
--
--
-- QUÉ DEJA MONTADO
--
--   · Un colectivo interno (Trabajadores) y dos entidades externas: una que
--     además es cliente y otra que además es proveedor, para poder ver los
--     enlaces a Voz del cliente y a Proveedores sin copiar sus datos.
--   · Cuatro sujetos y tres pertinencias: pertinente, en evaluación, y no pertinente
--     CON justificación —que es la que la pantalla obliga a escribir—.
--   · Una necesidad, una expectativa y dos requisitos, uno de ellos derivado
--     de la necesidad para poder ver la conversión con su motivo.
--   · Dos procesos relacionados con requisitos, uno con vigencia abierta.
--   · Una estrategia GENERAL y otra ESPECÍFICA, para ver la diferencia de
--     alcance sin tener que crearlas.
--   · Una revisión «sin cambios», que es la que demuestra que revisar y no
--     cambiar nada también se registra.
--   · Una SUCESIÓN de análisis: una parte que era pertinente y dejó de serlo,
--     con las dos lecturas conservadas. Sin esto no se puede probar «ver
--     estado en fecha».
-- ============================================================================

do $$
declare
  -- ↓↓↓ LO ÚNICO QUE HAY QUE CAMBIAR ↓↓↓
  v_empresa text := 'NOMBRE DE LA EMPRESA EN STAGING';
  -- ↑↑↑ ------------------------------ ↑↑↑

  v_org        uuid;
  v_cat_cli    uuid;
  v_cat_prov   uuid;
  v_cat_trab   uuid;
  v_cat_com    uuid;
  v_grupo      uuid;
  v_parte_cli  uuid;
  v_parte_prov uuid;
  v_parte_ong  uuid;
  v_proc_desp  uuid;
  v_proc_comp  uuid;
  v_a_cli      uuid;
  v_a_prov     uuid;
  v_a_trab     uuid;
  v_a_ong      uuid;
  v_a_viejo    uuid;
  v_nec        uuid;
  v_exp        uuid;
  v_req_sla    uuid;
  v_req_orig   uuid;
  v_est_gen    uuid;
  v_est_esp    uuid;
  v_hoy        date := current_date;
begin
  select id into v_org from public.organizations where name = v_empresa;
  if v_org is null then
    raise exception 'No existe ninguna empresa llamada «%». Cambia v_empresa arriba.', v_empresa;
  end if;

  -- LAS CATEGORÍAS NO SE SIEMBRAN DESDE AQUÍ, Y NO ES UN OLVIDO.
  --
  -- `quality_seed_stakeholder_categories` comprueba el rol de quien llama, y
  -- en el editor SQL no hay sesión: `auth.uid()` es nulo y la función deniega.
  -- Se podría insertar las quince filas a mano y esquivar la función, pero eso
  -- sería fabricar por detrás lo que la pantalla existe para hacer por
  -- delante, y de paso dejaría sin probar el botón «Sembrar las categorías
  -- iniciales», que es el primer paso de la validación humana.
  --
  -- Así que este archivo EXIGE que ya estén, y dice cómo conseguirlo.
  select id into v_cat_cli  from public.quality_stakeholder_categories
    where organization_id = v_org and code = 'customers';
  select id into v_cat_prov from public.quality_stakeholder_categories
    where organization_id = v_org and code = 'suppliers';
  select id into v_cat_trab from public.quality_stakeholder_categories
    where organization_id = v_org and code = 'workers';
  select id into v_cat_com  from public.quality_stakeholder_categories
    where organization_id = v_org and code = 'community';
  if v_cat_cli is null or v_cat_prov is null or v_cat_trab is null or v_cat_com is null then
    raise exception 'Faltan las categorias iniciales en «%». Abre Quality → Contexto → Partes interesadas → Categorias y pulsa «Sembrar las categorias iniciales»; despues vuelve a ejecutar este archivo.', v_empresa;
  end if;

  -- ------------------------------------------------------------------ sujetos
  select id into v_grupo from public.quality_stakeholder_groups
    where organization_id = v_org and name = 'QA Q123 · Trabajadores';
  if v_grupo is null then
    insert into public.quality_stakeholder_groups (organization_id, code, name, description)
    values (v_org, 'qa-q123-trabajadores', 'QA Q123 · Trabajadores',
            'Personal propio de la empresa. Colectivo de prueba.')
    returning id into v_grupo;
  end if;

  select id into v_parte_cli from public.quality_external_parties
    where organization_id = v_org and legal_name = 'QA Q123 Distribuidora Andina SAS';
  if v_parte_cli is null then
    insert into public.quality_external_parties (organization_id, legal_name, trade_name)
    values (v_org, 'QA Q123 Distribuidora Andina SAS', 'QA Q123 Andina')
    returning id into v_parte_cli;
  end if;

  select id into v_parte_prov from public.quality_external_parties
    where organization_id = v_org and legal_name = 'QA Q123 Empaques del Valle SAS';
  if v_parte_prov is null then
    insert into public.quality_external_parties (organization_id, legal_name, trade_name)
    values (v_org, 'QA Q123 Empaques del Valle SAS', 'QA Q123 Empaques')
    returning id into v_parte_prov;
  end if;

  select id into v_parte_ong from public.quality_external_parties
    where organization_id = v_org and legal_name = 'QA Q123 Fundacion Ribera Local';
  if v_parte_ong is null then
    insert into public.quality_external_parties (organization_id, legal_name, trade_name)
    values (v_org, 'QA Q123 Fundacion Ribera Local', 'QA Q123 Fundacion')
    returning id into v_parte_ong;
  end if;

  -- Dos procesos, para poder relacionar requisitos con procesos.
  select id into v_proc_desp from public.quality_processes
    where organization_id = v_org and name = 'QA Q123 · Despacho';
  if v_proc_desp is null then
    insert into public.quality_processes (organization_id, name, category_code, status)
    values (v_org, 'QA Q123 · Despacho', 'core', 'active') returning id into v_proc_desp;
  end if;
  select id into v_proc_comp from public.quality_processes
    where organization_id = v_org and name = 'QA Q123 · Compras';
  if v_proc_comp is null then
    insert into public.quality_processes (organization_id, name, category_code, status)
    values (v_org, 'QA Q123 · Compras', 'core', 'active') returning id into v_proc_comp;
  end if;

  -- ---------------------------------------------------------------- análisis
  -- 1 · El cliente: pertinente, con prioridad y su metodología.
  select id into v_a_cli from public.quality_stakeholder_assessments
    where organization_id = v_org and external_party_id = v_parte_cli and effective_to is null;
  if v_a_cli is null then
    insert into public.quality_stakeholder_assessments (
      organization_id, category_id, subject_kind, external_party_id, assessed_on,
      relevance_status, relevance_rationale, priority_label, priority_score,
      priority_method_note, summary, effective_from, status)
    values (v_org, v_cat_cli, 'external_party', v_parte_cli, v_hoy - 120,
            'relevant',
            'Concentra buena parte de las ventas del canal institucional y sus exigencias '
              || 'de plazo condicionan la planificación.',
            'high', 9, 'Influencia 3 × impacto 3',
            'Cliente principal del canal institucional.', v_hoy - 120, 'current')
    returning id into v_a_cli;
  end if;

  -- 2 · El proveedor: en evaluación. Todavía no se ha decidido.
  select id into v_a_prov from public.quality_stakeholder_assessments
    where organization_id = v_org and external_party_id = v_parte_prov and effective_to is null;
  if v_a_prov is null then
    insert into public.quality_stakeholder_assessments (
      organization_id, category_id, subject_kind, external_party_id, assessed_on,
      relevance_status, relevance_rationale, summary, effective_from, status)
    values (v_org, v_cat_prov, 'external_party', v_parte_prov, v_hoy - 30,
            'under_review',
            'Se está valorando cuánto depende de él la continuidad del suministro.',
            'Proveedor de empaque primario.', v_hoy - 30, 'current')
    returning id into v_a_prov;
  end if;

  -- 3 · El colectivo: HISTORIA. Era pertinente y dejó de serlo, con las dos
  --     lecturas conservadas. Es lo que permite probar «ver estado en fecha».
  select id into v_a_trab from public.quality_stakeholder_assessments
    where organization_id = v_org and stakeholder_group_id = v_grupo and effective_to is null;
  if v_a_trab is null then
    insert into public.quality_stakeholder_assessments (
      organization_id, category_id, subject_kind, stakeholder_group_id, assessed_on,
      relevance_status, relevance_rationale, summary,
      effective_from, effective_to, status)
    values (v_org, v_cat_trab, 'group', v_grupo, v_hoy - 200,
            'relevant',
            'Sus condiciones de trabajo afectan directamente a la calidad del producto.',
            'Primera lectura: colectivo clave para la operación.',
            v_hoy - 200, v_hoy - 60, 'superseded')
    returning id into v_a_viejo;

    insert into public.quality_stakeholder_assessments (
      organization_id, category_id, subject_kind, stakeholder_group_id, assessed_on,
      relevance_status, relevance_rationale, summary,
      effective_from, supersedes_id, status)
    values (v_org, v_cat_trab, 'group', v_grupo, v_hoy - 60,
            'relevant',
            'Se confirma la pertinencia y se ajusta el alcance a las dos plantas.',
            'Segunda lectura: se amplía a la planta nueva.',
            v_hoy - 60, v_a_viejo, 'current')
    returning id into v_a_trab;
  end if;

  -- 4 · La fundación: NO pertinente, con su justificación escrita. Es el caso
  --     que la pantalla obliga a razonar: descartar sin decir por qué no se
  --     puede, y aquí se ve descartado y explicado.
  select id into v_a_ong from public.quality_stakeholder_assessments
    where organization_id = v_org and external_party_id = v_parte_ong and effective_to is null;
  if v_a_ong is null then
    insert into public.quality_stakeholder_assessments (
      organization_id, category_id, subject_kind, external_party_id, assessed_on,
      relevance_status, relevance_rationale, summary, effective_from, status)
    values (v_org, v_cat_com, 'external_party', v_parte_ong, v_hoy - 40,
            'not_relevant',
            'Su actividad no toca ningun proceso del sistema de gestion ni impone requisitos: '
              || 'la relacion es de patrocinio puntual. Se revisara si eso cambia.',
            'Fundacion del entorno, sin requisitos hacia la empresa.', v_hoy - 40, 'current')
    returning id into v_a_ong;
  end if;

  -- ------------------------------------------------ necesidades y requisitos
  select id into v_nec from public.quality_stakeholder_requirements
    where organization_id = v_org and assessment_id = v_a_cli and entry_kind = 'need';
  if v_nec is null then
    insert into public.quality_stakeholder_requirements (
      organization_id, assessment_id, entry_kind, title, description,
      source_note, effective_from)
    values (v_org, v_a_cli, 'need', 'QA Q123 · Recibir el pedido en menos de 48 horas',
            'Sin ese plazo no puede sostener su propia promesa de entrega.',
            'Reunión trimestral de servicio', v_hoy - 110)
    returning id into v_nec;
  end if;

  select id into v_exp from public.quality_stakeholder_requirements
    where organization_id = v_org and assessment_id = v_a_cli and entry_kind = 'expectation';
  if v_exp is null then
    insert into public.quality_stakeholder_requirements (
      organization_id, assessment_id, entry_kind, title, description, effective_from)
    values (v_org, v_a_cli, 'expectation',
            'QA Q123 · Que se le avise antes de cualquier cambio de formato',
            'Nadie se lo ha prometido por escrito, pero lo espera.', v_hoy - 105)
    returning id into v_exp;
  end if;

  -- El requisito DERIVADO de la necesidad: enseña la conversión con su motivo.
  select id into v_req_sla from public.quality_stakeholder_requirements
    where organization_id = v_org and assessment_id = v_a_cli and derived_from_id = v_nec;
  if v_req_sla is null then
    insert into public.quality_stakeholder_requirements (
      organization_id, assessment_id, entry_kind, requirement_kind, title,
      source_note, derived_from_id, converted_at, conversion_rationale, effective_from)
    values (v_org, v_a_cli, 'requirement', 'contractual',
            'QA Q123 · SLA de entrega de 48 horas',
            'Contrato marco, cláusula 4', v_nec, now(),
            'Quedó firmado en el contrato marco: dejó de ser una petición y pasó a obligar.',
            v_hoy - 100)
    returning id into v_req_sla;
  end if;

  -- Un requisito legal del proveedor, para tener obligación de otro tipo.
  select id into v_req_orig from public.quality_stakeholder_requirements
    where organization_id = v_org and assessment_id = v_a_prov and entry_kind = 'requirement';
  if v_req_orig is null then
    insert into public.quality_stakeholder_requirements (
      organization_id, assessment_id, entry_kind, requirement_kind, title,
      source_note, effective_from)
    values (v_org, v_a_prov, 'requirement', 'legal',
            'QA Q123 · Certificado de origen en cada despacho',
            'Resolución aduanera vigente', v_hoy - 25)
    returning id into v_req_orig;
  end if;

  -- --------------------------------------------------- requisito → proceso
  if not exists (select 1 from public.quality_stakeholder_requirement_processes
                 where organization_id = v_org and requirement_id = v_req_sla) then
    insert into public.quality_stakeholder_requirement_processes (
      organization_id, requirement_id, process_id, link_kind, note, effective_from)
    values (v_org, v_req_sla, v_proc_desp, 'addressed_by',
            'El plazo se cumple —o no— en el despacho.', v_hoy - 95);
  end if;
  if not exists (select 1 from public.quality_stakeholder_requirement_processes
                 where organization_id = v_org and requirement_id = v_req_orig) then
    insert into public.quality_stakeholder_requirement_processes (
      organization_id, requirement_id, process_id, link_kind, note, effective_from)
    values (v_org, v_req_orig, v_proc_comp, 'monitored_by',
            'Compras verifica el certificado antes de aceptar el lote.', v_hoy - 20);
  end if;

  -- -------------------------------------------------------------- estrategias
  -- GENERAL: sin requisitos vinculados.
  select id into v_est_gen from public.quality_stakeholder_strategies
    where organization_id = v_org and assessment_id = v_a_trab
      and title = 'QA Q123 · Canal permanente de escucha al personal';
  if v_est_gen is null then
    insert into public.quality_stakeholder_strategies (
      organization_id, assessment_id, title, purpose, approach, monitoring_method,
      review_cadence_months, next_review_on, status, effective_from)
    values (v_org, v_a_trab, 'QA Q123 · Canal permanente de escucha al personal',
            'Detectar a tiempo lo que afecta a la calidad desde dentro.',
            'Reunión mensual por planta y buzón abierto todo el año.',
            'meeting', 6, v_hoy + 120, 'active', v_hoy - 55)
    returning id into v_est_gen;
  end if;

  -- ESPECÍFICA: atiende el SLA.
  select id into v_est_esp from public.quality_stakeholder_strategies
    where organization_id = v_org and assessment_id = v_a_cli
      and title = 'QA Q123 · Plan de servicio al canal institucional';
  if v_est_esp is null then
    insert into public.quality_stakeholder_strategies (
      organization_id, assessment_id, title, purpose, approach, monitoring_method,
      review_cadence_months, next_review_on, last_reviewed_on, status, effective_from)
    values (v_org, v_a_cli, 'QA Q123 · Plan de servicio al canal institucional',
            'Sostener el plazo comprometido sin depender de heroicidades.',
            'Indicador de cumplimiento de plazo revisado en el comité de operaciones.',
            'indicator', 6, v_hoy + 90, v_hoy - 5, 'active', v_hoy - 90)
    returning id into v_est_esp;

    insert into public.quality_stakeholder_strategy_requirements (
      organization_id, strategy_id, requirement_id, coverage_note, effective_from)
    values (v_org, v_est_esp, v_req_sla, 'Cubre el plazo, no el resto del contrato.', v_hoy - 90);
  end if;

  -- --------------------------------------------------------------- revisión
  -- «Sin cambios»: la que demuestra que revisar y no cambiar nada se registra.
  if not exists (select 1 from public.quality_stakeholder_reviews
                 where organization_id = v_org and strategy_id = v_est_esp) then
    insert into public.quality_stakeholder_reviews (
      organization_id, assessment_id, strategy_id, reviewed_on, verdict, note, next_review_on)
    values (v_org, v_a_cli, v_est_esp, v_hoy - 5, 'no_changes',
            'Revisada en el comité de operaciones: el plazo se sostiene y no hay que cambiar '
              || 'la estrategia.',
            v_hoy + 90);
  end if;

  raise notice 'QA Q123 listo en la empresa %: 3 partes, 4 entradas, 2 estrategias, 1 revision, 1 sucesion.', v_empresa;
end $$;


-- ============================================================================
-- CÓMO SE BORRA DESPUÉS
-- ----------------------------------------------------------------------------
-- En este orden, y solo lo prefijado. Nada de esto toca datos reales.
--
--   delete from quality_stakeholder_reviews r using quality_stakeholder_strategies s
--    where r.strategy_id = s.id and s.title like 'QA Q123 %';
--   delete from quality_stakeholder_strategy_requirements v using quality_stakeholder_strategies s
--    where v.strategy_id = s.id and s.title like 'QA Q123 %';
--   delete from quality_stakeholder_strategies where title like 'QA Q123 %';
--   delete from quality_stakeholder_requirement_processes p
--    using quality_stakeholder_requirements q
--    where p.requirement_id = q.id and q.title like 'QA Q123 %';
--   delete from quality_stakeholder_requirements where title like 'QA Q123 %';
--   delete from quality_stakeholder_assessments a
--    where a.stakeholder_group_id in (select id from quality_stakeholder_groups
--                                     where name like 'QA Q123 %')
--       or a.external_party_id in (select id from quality_external_parties
--                                  where legal_name like 'QA Q123 %');
--   delete from quality_stakeholder_groups where name like 'QA Q123 %';
--   delete from quality_processes where name like 'QA Q123 %';
--   delete from quality_external_parties where legal_name like 'QA Q123 %';
-- ============================================================================
