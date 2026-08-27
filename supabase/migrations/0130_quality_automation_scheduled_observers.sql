-- ============================================================================
-- 0130_quality_automation_scheduled_observers.sql · QUALITY-11 · corrección
-- ============================================================================
-- La 0129 YA ESTÁ APLICADA en Staging y es INMUTABLE: esta corrección vive
-- aquí. Append-only, y toca UNA sola cosa.
--
-- QUÉ SE CORRIGE
--
-- Al verificar el barrido PROGRAMADO contra Staging aparecieron dos fallos
-- repetidos, siempre los mismos:
--
--   quality_scan_pending_measurements → «No autenticado»
--   work_scan_pending_actions         → «No autenticado»
--
-- Los dos son barridos heredados —QUALITY-03 y QUALITY-04— escritos en su día
-- como acciones de pantalla, con `if auth.uid() is null then raise exception`
-- en la primera línea. Cuando la automatización entra sin sesión (el
-- planificador nocturno), esos dos no pueden ejecutarse.
--
-- POR QUÉ NO SE ARREGLAN ELLOS
--
-- Sus contratos públicos los dan por buenos las suites de QUALITY-03 y
-- QUALITY-04, y reescribirlos desde QUALITY-11 sería exactamente lo que §127
-- prohíbe. Tampoco se reimplementa lo que hacen: sería el segundo motor que
-- §126 prohíbe.
--
-- QUÉ CAMBIA, ENTONCES
--
-- Solo cómo se REGISTRA ese caso. Un barrido que no puede ejecutarse por una
-- precondición conocida no es una avería: se anota como `skipped`, con la
-- razón escrita, y no cuenta como fallo. Llamarlo «fallo» convertiría cada
-- noche en una avería falsa y enseñaría a ignorar el contador que sí importa
-- (§173: la avería del motor no es fiebre, pero un termómetro que marca fiebre
-- todas las noches tampoco sirve).
--
-- LO QUE ESTO NO RESUELVE, Y ESTÁ DECLARADO
--
-- Bajo el planificador, esas dos condiciones —mediciones pendientes y acciones
-- vencidas— siguen sin barrerse. Se cubren cuando alguien dispara la
-- automatización a mano, y se pueden cubrir con una regla propia de QUALITY-11
-- (`indicator.measurement_pending` y `action.due_on`), que la empresa activa si
-- decide dejar de usar el barrido heredado. Ver GAP-01 del informe.
-- ============================================================================

create or replace function public.quality_automation_run(
  p_organization_id uuid,
  p_mode            text default 'live',
  p_rule_id         uuid default null,
  p_today           date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today     date;
  v_run       uuid;
  v_rule      record;
  v_ver       record;
  v_subject   record;
  v_eval      jsonb;
  v_out       jsonb;
  v_labels    jsonb;
  v_src       record;
  v_dedupe    text;
  v_signal    uuid;
  v_nuevo     boolean;
  v_pos       uuid;
  v_rec       record;
  v_hubo_rec  boolean;
  v_sub_n     integer;
  v_match_n   integer;
  v_sig_n     integer;
  v_alert_n   integer;
  v_task_n    integer;
  v_t0        timestamptz;
  v_tot_sub   integer := 0;
  v_tot_match integer := 0;
  v_tot_sig   integer := 0;
  v_tot_alert integer := 0;
  v_tot_task  integer := 0;
  v_fallos    integer := 0;
  v_reglas    integer := 0;
  v_vistos    uuid[];
  v_claves    text[];
  v_legacy    integer;
  v_obs       text;
  v_antes     integer;
  v_despues   integer;
begin
  -- §87/§105 · Con SESIÓN se comprueba el rol. Sin sesión —el trabajador
  -- programado— se ejecuta como barrido del sistema, exactamente igual que los
  -- barridos de QUALITY-03…10, que llevan haciéndolo desde 0117. Y ni con
  -- sesión ni sin ella puede hacer nada fuera del catálogo cerrado de salidas:
  -- una automatización no eleva permisos, hace tres cosas.
  if auth.uid() is not null then
    if not quality_manages_automation(p_organization_id) then
      raise exception 'Tu rol no permite ejecutar la automatización.';
    end if;
  end if;
  if p_mode not in ('live', 'simulation') then
    raise exception 'Modo de ejecución no reconocido.';
  end if;
  -- §72 · Simular sin sesión no tiene sentido y no se permite: la simulación
  -- es una herramienta de quien diseña la regla.
  if p_mode = 'simulation' and auth.uid() is null then
    raise exception 'La simulación exige una sesión.';
  end if;

  insert into quality_automation_settings (organization_id)
  values (p_organization_id) on conflict (organization_id) do nothing;

  -- §47 · El día de negocio. El parámetro existe para las pruebas; en la
  -- aplicación nadie lo pasa, así que no hay reloj manipulable en producción.
  v_today := coalesce(p_today, quality_automation_business_today(p_organization_id));

  insert into quality_automation_runs
    (organization_id, run_kind, business_date, triggered_by, status, started_at)
  values (p_organization_id,
          case when p_mode = 'simulation' then 'simulation'
               when auth.uid() is null then 'scheduled' else 'manual' end,
          v_today, auth.uid(), 'running', clock_timestamp())
  returning id into v_run;

  -- ------------------------------------------------------------------------
  -- 13.1 · Las reglas de la organización
  -- ------------------------------------------------------------------------
  for v_rule in
    select r.* from quality_automation_rules r
     where r.organization_id = p_organization_id
       and r.status = 'active'
       and (p_rule_id is null or r.id = p_rule_id)
       -- §80 · Una regla silenciada no se evalúa mientras dure el silencio.
       and not exists (
         select 1 from quality_signal_suppressions s
          where s.organization_id = r.organization_id
            and s.scope = 'rule' and s.rule_id = r.id
            and s.released_at is null
            and (s.suppressed_until is null or s.suppressed_until >= v_today))
     order by r.code
  loop
    v_t0 := clock_timestamp();
    v_sub_n := 0; v_match_n := 0; v_sig_n := 0; v_alert_n := 0; v_task_n := 0;
    v_vistos := array[]::uuid[]; v_claves := array[]::text[];

    begin
      -- §23 · La versión que gobierna HOY es la que tiene HOY dentro de su
      -- ventana de vigencia. Ni antes, ni después.
      --
      -- Y se admite `superseded`, no por descuido: cuando se publica una v2
      -- con vigencia a partir de mañana, la v1 queda marcada como sustituida
      -- en ese mismo instante pero su ventana sigue cubriendo hoy. Mirar solo
      -- el estado dejaría a la regla sin versión durante el tramo que va
      -- desde que se publica el relevo hasta que el relevo entra en vigor —y
      -- ese tramo existe de verdad en cuanto el día de negocio de la empresa
      -- no coincide con el del servidor—. La autoridad de una versión es su
      -- ventana; la etiqueta solo dice si es la última.
      select * into v_ver from quality_automation_rule_versions
       where organization_id = p_organization_id and rule_id = v_rule.id
         and status in ('published', 'superseded')
         and effective_from is not null
         and effective_from <= v_today
         and (effective_to is null or effective_to >= v_today)
       order by effective_from desc, version_number desc limit 1;

      if v_ver.id is null then
        insert into quality_automation_run_rules
          (organization_id, run_id, rule_id, status, error_message)
        values (p_organization_id, v_run, v_rule.id, 'skipped',
                'Sin versión publicada vigente hoy.');
        continue;
      end if;

      select * into v_src from quality_automation_sources where code = v_rule.source_code;
      select coalesce(jsonb_object_agg(field, label), '{}'::jsonb) into v_labels
        from quality_automation_source_fields where source_code = v_rule.source_code;

      for v_subject in
        select * from quality_automation_subjects(p_organization_id, v_rule.source_code, v_today)
      loop
        v_sub_n := v_sub_n + 1;
        v_vistos := v_vistos || v_subject.subject_id;

        v_eval := quality_automation_evaluate(
          v_subject.facts, v_ver.conditions, v_today, v_labels);
        if not coalesce((v_eval ->> 'matched')::boolean, false) then
          continue;
        end if;
        v_match_n := v_match_n + 1;

        -- §35 · La clave determinística de la CONDICIÓN. Incluye la versión:
        -- cambiar la regla abre una condición nueva, y eso es correcto.
        v_dedupe := 'auto:' || v_ver.id::text || ':' || v_subject.subject_id::text;
        v_claves := v_claves || v_dedupe;

        -- §72 · La simulación cuenta y se detiene aquí. No crea nada.
        if p_mode = 'simulation' then
          continue;
        end if;

        -- ------------------------------------------------------------------
        -- SALIDA 1 · la señal
        -- ------------------------------------------------------------------
        insert into quality_signals
          (organization_id, rule_id, rule_version_id, run_id, source_code, domain,
           subject_type, subject_id, subject_label, severity, title, explanation,
           source_snapshot, dedupe_key)
        values
          (p_organization_id, v_rule.id, v_ver.id, v_run, v_rule.source_code,
           v_src.domain, v_src.subject_type, v_subject.subject_id,
           v_subject.subject_label, v_ver.severity,
           v_ver.signal_title,
           -- §41 · Por qué saltó, con la regla, la versión y los valores.
           'Regla: ' || v_rule.name || E'\nVersión: ' || v_ver.version_number
             || E'\nSujeto: ' || coalesce(v_subject.subject_label, '—')
             || E'\nCondición:\n· ' || (v_eval ->> 'explanation')
             || E'\nDetectado el ' || to_char(v_today, 'DD/MM/YYYY') || '.',
           -- §42/§91 · El retrato MÍNIMO: solo los campos que la regla miró.
           (select coalesce(jsonb_object_agg(c ->> 'field', v_subject.facts -> (c ->> 'field')),
                            '{}'::jsonb)
              from jsonb_array_elements(v_ver.conditions) c),
           v_dedupe)
        on conflict (organization_id, dedupe_key) where resolved_at is null
        do update set last_detected_at = now(),
                      detection_count = quality_signals.detection_count + 1
        returning id, (xmax = 0) into v_signal, v_nuevo;

        if v_nuevo then
          v_sig_n := v_sig_n + 1;
          insert into work_events (organization_id, source_domain, event_type,
                                   subject_type, subject_id, severity, summary, payload,
                                   dedupe_key)
          values (p_organization_id, 'automation', 'automation.signal_raised',
                  'quality_signal', v_signal, v_ver.severity,
                  v_ver.signal_title || ' · ' || coalesce(v_subject.subject_label, ''),
                  jsonb_build_object('rule_id', v_rule.id, 'version', v_ver.version_number,
                                     'run_id', v_run, 'subject_id', v_subject.subject_id),
                  'auto_event:' || v_signal::text);
        end if;

        -- ------------------------------------------------------------------
        -- SALIDAS 2 y 3 · alerta y tarea, si la regla las pide
        -- ------------------------------------------------------------------
        for v_out in select * from jsonb_array_elements(v_ver.outputs) loop
          if (v_out ->> 'kind') = 'CREATE_SIGNAL' then
            continue;
          end if;

          v_pos := case v_out ->> 'recipient_kind'
            when 'rule_owner_position' then v_rule.owner_position_id
            when 'subject_owner_position' then v_subject.owner_position_id
            when 'specific_position' then (v_out ->> 'position_id')::uuid
          end;

          v_hubo_rec := false;
          for v_rec in
            select * from quality_automation_recipients(p_organization_id, v_pos, v_today)
          loop
            v_hubo_rec := true;
            if (v_out ->> 'kind') = 'CREATE_ALERT' then
              insert into work_alerts
                (organization_id, source_domain, alert_type, severity,
                 subject_type, subject_id, recipient_profile_id, title, message, dedupe_key)
              select p_organization_id, 'automation', 'automation_signal', v_ver.severity,
                     v_src.subject_type, v_subject.subject_id, v_rec.profile_id,
                     v_ver.signal_title,
                     coalesce(v_subject.subject_label, '') || ' · ' || (v_eval ->> 'explanation'),
                     'auto_alert:' || v_signal::text || ':' || v_rec.profile_id::text
               where not exists (
                 select 1 from work_alerts w
                  where w.dedupe_key = 'auto_alert:' || v_signal::text || ':' || v_rec.profile_id::text);
              if found then v_alert_n := v_alert_n + 1; end if;
            elsif (v_out ->> 'kind') = 'CREATE_TASK' then
              insert into work_tasks
                (organization_id, source_domain, task_type, subject_type, subject_id,
                 title, description, assignee_profile_id, assignee_position_id,
                 status, due_at, dedupe_key)
              select p_organization_id, 'automation', 'automation_follow_up',
                     v_src.subject_type, v_subject.subject_id,
                     coalesce(v_out ->> 'task_title', v_ver.signal_title),
                     coalesce(v_subject.subject_label, '') || E'\n' || (v_eval ->> 'explanation'),
                     v_rec.profile_id, v_pos, 'open',
                     case when (v_out ->> 'due_in_days') ~ '^[0-9]+$'
                          then v_today + (v_out ->> 'due_in_days')::integer else null end,
                     'auto_task:' || v_signal::text || ':' || v_rec.profile_id::text
               where not exists (
                 select 1 from work_tasks w
                  where w.dedupe_key = 'auto_task:' || v_signal::text || ':' || v_rec.profile_id::text);
              if found then v_task_n := v_task_n + 1; end if;
            end if;
          end loop;

          -- §33 · Sin titular con cuenta la señal EXISTE y lo dice.
          if not v_hubo_rec then
            update quality_signals set recipient_unresolved = true
             where id = v_signal and not recipient_unresolved;
          end if;
        end loop;
      end loop;

      -- §38 · Resolución determinística: las señales abiertas de esta regla
      -- cuyo sujeto se evaluó y YA NO cumple la condición se resuelven solas.
      -- Resolver la señal NO cierra la tarea, y desde luego no cierra ninguna
      -- acción: son objetos de otro dueño.
      if p_mode = 'live' then
        update quality_signals s
           set status = 'resolved', resolved_at = now(), resolution_kind = 'auto',
               resolution_note = 'La condición dejó de cumplirse el '
                                 || to_char(v_today, 'DD/MM/YYYY') || '.'
         where s.organization_id = p_organization_id
           and s.rule_id = v_rule.id
           and s.resolved_at is null
           and s.subject_id = any (v_vistos)
           and not (s.dedupe_key = any (v_claves));
      end if;

      insert into quality_automation_run_rules
        (organization_id, run_id, rule_id, rule_version_id, subjects_evaluated,
         matches, signals_created, alerts_created, tasks_created, status, duration_ms)
      values (p_organization_id, v_run, v_rule.id, v_ver.id, v_sub_n, v_match_n,
              v_sig_n, v_alert_n, v_task_n, 'success',
              extract(milliseconds from clock_timestamp() - v_t0)::integer);

      v_reglas := v_reglas + 1;
      v_tot_sub := v_tot_sub + v_sub_n;
      v_tot_match := v_tot_match + v_match_n;
      v_tot_sig := v_tot_sig + v_sig_n;
      v_tot_alert := v_tot_alert + v_alert_n;
      v_tot_task := v_tot_task + v_task_n;

    exception when others then
      -- §45 · Una regla defectuosa falla ELLA SOLA. El barrido sigue, y el
      -- fallo queda escrito con su mensaje.
      v_fallos := v_fallos + 1;
      insert into quality_automation_run_rules
        (organization_id, run_id, rule_id, status, error_message, duration_ms)
      values (p_organization_id, v_run, v_rule.id, 'failed', sqlerrm,
              extract(milliseconds from clock_timestamp() - v_t0)::integer);
    end;
  end loop;

  -- ------------------------------------------------------------------------
  -- 13.2 · Los OBSERVADORES DE PLATAFORMA (§126, §127, §128)
  -- ------------------------------------------------------------------------
  -- Los barridos que QUALITY-03…10 ya traían. No se reescriben ni se duplican:
  -- se integran aquí, bajo la misma ejecución, para que exista UNA sola puerta
  -- y para que su resultado aparezca en el mismo informe. Sus contratos
  -- públicos siguen intactos, así que Q09 y Q10 no se enteran.
  if p_mode = 'live' and p_rule_id is null then
    foreach v_obs in array array[
      'quality_scan_pending_measurements', 'work_scan_pending_actions',
      'quality_scan_risk_reviews', 'quality_scan_people_signals',
      'quality_scan_supplier_reviews', 'quality_scan_customer_voice',
      'quality_scan_audits', 'quality_scan_management_reviews']
    loop
      v_t0 := clock_timestamp();
      begin
        -- §44 · La ejecución cuenta lo que SE CREÓ, no lo que el barrido dice
        -- que miró. Algunos barridos heredados devuelven el total de la
        -- condición, no las filas nuevas; contar el delta real de avisos es
        -- fiel sin tocar el contrato público de ninguno de ellos.
        select count(*) into v_antes from work_alerts
         where organization_id = p_organization_id;
        execute format('select %I($1)', v_obs) into v_legacy using p_organization_id;
        select count(*) into v_despues from work_alerts
         where organization_id = p_organization_id;
        insert into quality_automation_run_rules
          (organization_id, run_id, platform_observer, alerts_created, status, duration_ms)
        values (p_organization_id, v_run, v_obs, greatest(v_despues - v_antes, 0), 'success',
                extract(milliseconds from clock_timestamp() - v_t0)::integer);
        v_tot_alert := v_tot_alert + greatest(v_despues - v_antes, 0);
        v_reglas := v_reglas + 1;
      exception when others then
        -- Dos de los ocho barridos heredados —`quality_scan_pending_measurements`
        -- y `work_scan_pending_actions`— se escribieron como acciones de
        -- pantalla y EXIGEN sesión. Cuando el barrido entra sin usuario (el
        -- planificador), no fallan: no se pueden ejecutar, que es otra cosa.
        -- Llamarlo «fallo» convertiría cada noche en una avería falsa y
        -- enseñaría a ignorar el contador que sí importa.
        --
        -- Sus contratos NO se tocan: son de QUALITY-03 y QUALITY-04 y otras
        -- pruebas los dan por buenos. Lo que cambia es cómo se registra aquí.
        if sqlerrm = 'No autenticado' and auth.uid() is null then
          insert into quality_automation_run_rules
            (organization_id, run_id, platform_observer, status, error_message, duration_ms)
          values (p_organization_id, v_run, v_obs, 'skipped',
                  'Este barrido heredado exige una sesión: se ejecuta cuando alguien '
                  || 'dispara la automatización a mano.',
                  extract(milliseconds from clock_timestamp() - v_t0)::integer);
        else
          v_fallos := v_fallos + 1;
          insert into quality_automation_run_rules
            (organization_id, run_id, platform_observer, status, error_message, duration_ms)
          values (p_organization_id, v_run, v_obs, 'failed', sqlerrm,
                  extract(milliseconds from clock_timestamp() - v_t0)::integer);
        end if;
      end;
    end loop;
  end if;

  -- `now()` es la hora de la TRANSACCIÓN: usarla aquí daría siempre duración
  -- cero, porque el barrido entero cabe en una sola. La duración real se mide
  -- con el reloj de pared.
  update quality_automation_runs
     set finished_at = clock_timestamp(),
         status = case when v_fallos = 0 then 'success'
                       when v_fallos > 0 and v_reglas > 0 then 'partial'
                       else 'failed' end,
         rules_evaluated = v_reglas,
         subjects_evaluated = v_tot_sub,
         matches = v_tot_match,
         signals_created = v_tot_sig,
         alerts_created = v_tot_alert,
         tasks_created = v_tot_task,
         failures = v_fallos
   where id = v_run;

  if p_mode = 'live' then
    update quality_automation_settings
       set last_run_at = now(),
           last_run_status = case when v_fallos = 0 then 'success'
                                  when v_reglas > 0 then 'partial' else 'failed' end,
           last_success_at = case when v_fallos = 0 then now() else last_success_at end
     where organization_id = p_organization_id;

    insert into work_events (organization_id, source_domain, event_type,
                             subject_type, subject_id, summary, payload, dedupe_key)
    values (p_organization_id, 'automation', 'automation.run_completed',
            'quality_signal', v_run,
            'Barrido de automatización: ' || v_tot_match || ' coincidencia(s), '
              || v_tot_sig || ' señal(es) nueva(s).',
            jsonb_build_object('run_id', v_run, 'rules', v_reglas,
                               'subjects', v_tot_sub, 'failures', v_fallos),
            'auto_run:' || v_run::text);
  end if;

  return v_run;
end;
$$;

comment on function public.quality_automation_run(uuid, text, uuid, date) is
  'QUALITY-11 · 0130 · El único motor. Un barrido heredado que exige sesión se anota como omitido, no como fallo: una precondición conocida no es una avería.';
