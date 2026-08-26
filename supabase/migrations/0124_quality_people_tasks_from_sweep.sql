-- ============================================================================
-- Trazaloop · QUALITY-06 · Las señales de Personas también producen TAREAS
-- ----------------------------------------------------------------------------
-- 0123 dejó el barrido emitiendo solo ALERTAS. Una alerta dice «esto merece tu
-- atención»; una tarea dice «te toca hacer esto», y tiene un cierre. El §68 del
-- encargo pide integrar en «Mis tareas» las de evaluación, desarrollo, eficacia
-- y transferencia: sin tareas, esa integración no tenía nada que integrar.
--
-- Va en una migración APARTE y no editando 0123 porque 0123 ya está aplicada a
-- un entorno compartido. Editar una migración aplicada obligaría a un
-- `migration repair`, y el histórico de migraciones es el registro de lo que
-- pasó, no una versión conveniente de los hechos.
--
-- Se reescribe la función entera —es la única forma de cambiar su cuerpo— y se
-- conserva TODO lo que ya hacía. Lo nuevo son cinco inserciones en
-- `work_tasks`, cada una con su guarda de duplicado por `dedupe_key`, igual que
-- las alertas: el segundo barrido del día no crea nada.
--
-- Ninguna de estas tareas es una ACCIÓN del sistema de gestión (§53). Una tarea
-- es «hay que hacer esto»; si la situación merece una acción formal, alguien
-- autorizado la crea explícitamente.
-- ============================================================================

create or replace function public.quality_scan_people_signals(p_organization_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alerts integer := 0;
begin
  if auth.uid() is not null then
    if p_organization_id is null then
      raise exception 'Indica sobre qué empresa quieres revisar las señales.';
    end if;
    if not is_org_member(p_organization_id) then
      raise exception 'No tienes acceso a esa empresa.';
    end if;
  end if;

  -- 1 · La evidencia vencida pasa a `expired`. Es un hecho sobre el PAPEL, no
  -- sobre la persona: la decisión de competencia sigue donde estaba.
  update quality_competency_evidence e
     set status = 'expired'
   where e.status = 'valid'
     and e.expires_on is not null
     and e.expires_on < current_date
     and (p_organization_id is null or e.organization_id = p_organization_id);

  -- 2 · Certificaciones por vencer y vencidas: alerta y tarea de renovación.
  with proximas as (
    select e.*, pc.person_id, pe.full_name, c.name as competency_name,
           quality_people_notice_recipient(e.organization_id) as recipient
      from quality_competency_evidence e
      join quality_person_competencies pc
        on pc.organization_id = e.organization_id and pc.id = e.person_competency_id
      join quality_people pe
        on pe.organization_id = pc.organization_id and pe.id = pc.person_id
      join quality_competencies c
        on c.organization_id = pc.organization_id and c.id = pc.competency_id
     where e.expires_on is not null
       and e.status in ('valid', 'expired')
       and e.expires_on <= current_date + 30
       and (p_organization_id is null or e.organization_id = p_organization_id)
  ), ins as (
    insert into work_alerts (organization_id, source_domain, alert_type, severity,
                             subject_type, subject_id, recipient_profile_id,
                             title, message, dedupe_key)
    select x.organization_id, 'competence',
           case when x.expires_on < current_date
                then 'competence_evidence_expired' else 'competence_evidence_expiring' end,
           case when x.expires_on < current_date then 'warning' else 'info' end,
           'quality_competency_evidence', x.id, x.recipient,
           case when x.expires_on < current_date
                then 'Evidencia vencida: ' || x.title
                else 'Evidencia por vencer: ' || x.title end,
           'Corresponde a ' || x.full_name || ' (' || x.competency_name || ') y vence el '
             || to_char(x.expires_on, 'DD/MM/YYYY')
             || '. Requiere revisión; no implica por sí solo que la persona haya dejado de ser competente.',
           'competence_evidence:' || x.id::text || ':' || x.expires_on::text
      from proximas x
     where x.recipient is not null
       and not exists (
         select 1 from work_alerts w
          where w.dedupe_key = 'competence_evidence:' || x.id::text || ':' || x.expires_on::text)
    returning 1
  ), t as (
    insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                            title, description, assignee_profile_id, status, due_at, dedupe_key)
    select x.organization_id, 'competence', 'competence_evidence_renewal',
           'quality_competency_evidence', x.id,
           'Revisar la evidencia «' || x.title || '»',
           'Vence el ' || to_char(x.expires_on, 'DD/MM/YYYY') || '. Decide si se renueva, '
             || 'si se sustituye por otra evidencia o si la competencia se vuelve a evaluar.',
           x.recipient, 'open', x.expires_on,
           'competence_evidence_renewal:' || x.id::text || ':' || x.expires_on::text
      from proximas x
     where x.recipient is not null
       and not exists (
         select 1 from work_tasks w
          where w.dedupe_key = 'competence_evidence_renewal:' || x.id::text || ':' || x.expires_on::text)
    returning 1
  )
  select count(*) into v_alerts from ins;

  -- 3 · Concentración de conocimiento.
  insert into quality_knowledge_signals (organization_id, knowledge_item_id, signal_kind, detail)
  select k.organization_id, k.knowledge_item_id,
         case when k.holder_count = 0 then 'no_holder' else 'single_holder' end,
         case when k.holder_count = 0
              then 'Conocimiento crítico sin ninguna persona registrada como holder.'
              else 'Conocimiento crítico concentrado en una sola persona.' end
    from v_quality_knowledge_continuity k
   where k.continuity_attention
     and (p_organization_id is null or k.organization_id = p_organization_id)
  on conflict do nothing;

  update quality_knowledge_signals s
     set last_seen_at = now()
    from v_quality_knowledge_continuity k
   where s.status = 'open'
     and s.knowledge_item_id = k.knowledge_item_id
     and k.continuity_attention
     and (p_organization_id is null or s.organization_id = p_organization_id);

  update quality_knowledge_signals s
     set status = 'resolved', resolved_at = now()
    from v_quality_knowledge_continuity k
   where s.status = 'open'
     and s.signal_kind in ('single_holder', 'no_holder')
     and s.knowledge_item_id = k.knowledge_item_id
     and not k.continuity_attention
     and (p_organization_id is null or s.organization_id = p_organization_id);

  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select k.organization_id, 'knowledge', 'knowledge_single_holder', 'warning',
         'quality_knowledge_item', k.knowledge_item_id,
         quality_people_notice_recipient(k.organization_id),
         'Conocimiento crítico concentrado: ' || k.title,
         'Este conocimiento está clasificado como ' || k.criticality
           || ' y tiene ' || k.holder_count || ' persona(s) registrada(s). '
           || 'Es una señal de continuidad, no un riesgo formal ni un juicio sobre nadie.',
         'knowledge_single_holder:' || k.knowledge_item_id::text
    from v_quality_knowledge_continuity k
   where k.continuity_attention
     and quality_people_notice_recipient(k.organization_id) is not null
     and (p_organization_id is null or k.organization_id = p_organization_id)
     and not exists (
       select 1 from work_alerts w
        where w.dedupe_key = 'knowledge_single_holder:' || k.knowledge_item_id::text);

  -- Y su tarea: revisar la continuidad. La tarea NO dice «crea un riesgo»;
  -- dice que hay que mirarlo, que es lo único que el sistema puede afirmar.
  insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                          title, description, assignee_profile_id, status, dedupe_key)
  select k.organization_id, 'knowledge', 'knowledge_continuity_review',
         'quality_knowledge_item', k.knowledge_item_id,
         'Revisar la continuidad de «' || k.title || '»',
         'Depende de ' || k.holder_count || ' persona(s). Decide si se documenta, si se '
           || 'transfiere a alguien más, o si merece abrirse como riesgo formal.',
         quality_people_notice_recipient(k.organization_id), 'open',
         'knowledge_continuity_review:' || k.knowledge_item_id::text
    from v_quality_knowledge_continuity k
   where k.continuity_attention
     and quality_people_notice_recipient(k.organization_id) is not null
     and (p_organization_id is null or k.organization_id = p_organization_id)
     and not exists (
       select 1 from work_tasks w
        where w.dedupe_key = 'knowledge_continuity_review:' || k.knowledge_item_id::text);

  -- 4 · Cargo crítico sin titular vigente.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select p.organization_id, 'position', 'critical_position_vacant', 'warning',
         'quality_position', p.position_id,
         quality_people_notice_recipient(p.organization_id),
         'Cargo crítico sin titular: ' || p.position_name,
         'El cargo está marcado como crítico y no tiene ninguna asignación vigente.',
         'critical_position_vacant:' || p.position_id::text
    from v_quality_org_chart p
   where p.is_critical
     and p.is_active
     and coalesce(p.holder_count, 0) = 0
     and quality_people_notice_recipient(p.organization_id) is not null
     and (p_organization_id is null or p.organization_id = p_organization_id)
     and not exists (
       select 1 from work_alerts w
        where w.dedupe_key = 'critical_position_vacant:' || p.position_id::text);

  -- 5 · Transferencia de conocimiento vencida, y su tarea de ejecución.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select tp.organization_id, 'knowledge', 'knowledge_transfer_overdue', 'warning',
         'quality_knowledge_transfer_plan', tp.id,
         quality_people_notice_recipient(tp.organization_id),
         'Transferencia vencida: ' || tp.title,
         'La fecha objetivo era el ' || to_char(tp.target_date, 'DD/MM/YYYY') || ' y el plan sigue abierto.',
         'knowledge_transfer_overdue:' || tp.id::text || ':' || tp.target_date::text
    from quality_knowledge_transfer_plans tp
   where tp.status in ('draft', 'active')
     and tp.target_date is not null
     and tp.target_date < current_date
     and quality_people_notice_recipient(tp.organization_id) is not null
     and (p_organization_id is null or tp.organization_id = p_organization_id)
     and not exists (
       select 1 from work_alerts w
        where w.dedupe_key = 'knowledge_transfer_overdue:' || tp.id::text || ':' || tp.target_date::text);

  insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                          title, description, assignee_profile_id, status, due_at, dedupe_key)
  select tp.organization_id, 'knowledge', 'knowledge_transfer_execution',
         'quality_knowledge_transfer_plan', tp.id,
         'Avanzar la transferencia «' || tp.title || '»',
         'Quedan actividades sin cerrar. Ejecutarlas no da la transferencia por hecha: '
           || 'verificarla es un paso aparte.',
         quality_people_notice_recipient(tp.organization_id), 'open', tp.target_date,
         'knowledge_transfer_execution:' || tp.id::text
    from quality_knowledge_transfer_plans tp
   where tp.status = 'active'
     and quality_people_notice_recipient(tp.organization_id) is not null
     and (p_organization_id is null or tp.organization_id = p_organization_id)
     and exists (
       select 1 from quality_knowledge_transfer_items i
        where i.transfer_plan_id = tp.id and i.status in ('pending', 'in_progress'))
     and not exists (
       select 1 from work_tasks w
        where w.dedupe_key = 'knowledge_transfer_execution:' || tp.id::text);

  -- 6 · Eficacia pendiente de una actividad terminada: alerta y tarea.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select la.organization_id, 'learning', 'learning_effectiveness_pending', 'info',
         'quality_learning_activity', la.id,
         quality_people_notice_recipient(la.organization_id),
         'Eficacia pendiente: ' || la.title,
         'La actividad terminó el ' || to_char(coalesce(la.ends_on, current_date), 'DD/MM/YYYY')
           || ' y todavía no se ha evaluado si produjo el resultado esperado.',
         'learning_effectiveness_pending:' || la.id::text
    from quality_learning_activities la
   where la.status = 'completed'
     and quality_people_notice_recipient(la.organization_id) is not null
     and (p_organization_id is null or la.organization_id = p_organization_id)
     and not exists (
       select 1 from quality_learning_effectiveness_reviews r
        where r.activity_id = la.id and r.result <> 'pending')
     and not exists (
       select 1 from work_alerts w
        where w.dedupe_key = 'learning_effectiveness_pending:' || la.id::text);

  insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                          title, description, assignee_profile_id, status, due_at, dedupe_key)
  select la.organization_id, 'learning', 'learning_effectiveness_review',
         'quality_learning_activity', la.id,
         'Evaluar si sirvió: «' || la.title || '»',
         'La actividad está terminada. Terminarla no la vuelve eficaz: hay que juzgarla '
           || 'contra el criterio declarado.',
         quality_people_notice_recipient(la.organization_id), 'open', la.ends_on,
         'learning_effectiveness_review:' || la.id::text
    from quality_learning_activities la
   where la.status = 'completed'
     and quality_people_notice_recipient(la.organization_id) is not null
     and (p_organization_id is null or la.organization_id = p_organization_id)
     and not exists (
       select 1 from quality_learning_effectiveness_reviews r
        where r.activity_id = la.id and r.result <> 'pending')
     and not exists (
       select 1 from work_tasks w
        where w.dedupe_key = 'learning_effectiveness_review:' || la.id::text);

  -- 7 · Item del plan de desarrollo vencido: tarea de EJECUCIÓN, nunca una
  -- acción del SGC (§53).
  insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                          title, description, assignee_profile_id, status, due_at, dedupe_key)
  select i.organization_id, 'development', 'development_item_execution',
         'quality_development_plan_item', i.id,
         'Ejecutar: «' || i.title || '»',
         'Estaba previsto para el ' || to_char(i.target_date, 'DD/MM/YYYY') || '.',
         quality_people_notice_recipient(i.organization_id), 'open', i.target_date,
         'development_item_execution:' || i.id::text || ':' || i.target_date::text
    from quality_development_plan_items i
   where i.status in ('planned', 'in_progress')
     and i.target_date is not null
     and i.target_date < current_date
     and quality_people_notice_recipient(i.organization_id) is not null
     and (p_organization_id is null or i.organization_id = p_organization_id)
     and not exists (
       select 1 from work_tasks w
        where w.dedupe_key = 'development_item_execution:' || i.id::text || ':' || i.target_date::text);

  -- 8 · Evaluación anual pendiente: alerta y tarea.
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key)
  select m.organization_id, 'performance', 'performance_evaluation_pending', 'info',
         'quality_person', m.person_id,
         quality_people_notice_recipient(m.organization_id),
         'Evaluación pendiente: ' || pe.full_name,
         'Forma parte de la población aplicable del ciclo «' || cy.name || '» y aún no tiene evaluación cerrada.',
         'performance_evaluation_pending:' || m.cycle_id::text || ':' || m.person_id::text
    from quality_performance_cycle_members m
    join quality_performance_cycles cy
      on cy.organization_id = m.organization_id and cy.id = m.cycle_id
    join quality_people pe
      on pe.organization_id = m.organization_id and pe.id = m.person_id
   where cy.status = 'open'
     and quality_people_notice_recipient(m.organization_id) is not null
     and (p_organization_id is null or m.organization_id = p_organization_id)
     and not exists (
       select 1 from quality_performance_evaluations ev
        where ev.cycle_id = m.cycle_id and ev.person_id = m.person_id
          and ev.status = 'closed')
     and not exists (
       select 1 from work_alerts w
        where w.dedupe_key = 'performance_evaluation_pending:' || m.cycle_id::text || ':' || m.person_id::text);

  insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                          title, description, assignee_profile_id, status, due_at, dedupe_key)
  select m.organization_id, 'performance', 'performance_evaluation_due',
         'quality_person', m.person_id,
         'Evaluar el desempeño de ' || pe.full_name,
         'Ciclo «' || cy.name || '». La evaluación es una decisión humana: la plataforma '
           || 'no la calcula.',
         quality_people_notice_recipient(m.organization_id), 'open', cy.period_end,
         'performance_evaluation_due:' || m.cycle_id::text || ':' || m.person_id::text
    from quality_performance_cycle_members m
    join quality_performance_cycles cy
      on cy.organization_id = m.organization_id and cy.id = m.cycle_id
    join quality_people pe
      on pe.organization_id = m.organization_id and pe.id = m.person_id
   where cy.status = 'open'
     and quality_people_notice_recipient(m.organization_id) is not null
     and (p_organization_id is null or m.organization_id = p_organization_id)
     and not exists (
       select 1 from quality_performance_evaluations ev
        where ev.cycle_id = m.cycle_id and ev.person_id = m.person_id
          and ev.status = 'closed')
     and not exists (
       select 1 from work_tasks w
        where w.dedupe_key = 'performance_evaluation_due:' || m.cycle_id::text || ':' || m.person_id::text);

  return coalesce(v_alerts, 0);
end;
$$;
revoke all on function public.quality_scan_people_signals(uuid) from public, anon;
grant execute on function public.quality_scan_people_signals(uuid) to authenticated;
