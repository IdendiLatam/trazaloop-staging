-- ============================================================================
-- Trazaloop · QUALITY-13B3 · EL RELEVO SE HACÍA CON EL GRANO EQUIVOCADO
-- ----------------------------------------------------------------------------
-- QUALITY-11.1 dejó construido el mecanismo que convierte cinco verdades de
-- atención en una: una regla adoptada por la empresa DECLARA que releva a un
-- barrido heredado, y ese barrido calla. La idea es correcta y no se toca.
--
--
-- LO QUE ESTÁ MAL, Y SE PUEDE COMPROBAR
--
-- `supersedes_observer` nombra un BARRIDO. Y un barrido no observa una
-- condición: observa varias. `quality_scan_audits` mira cinco cosas distintas;
-- `quality_scan_people_signals`, siete. La comprobación del relevo estaba
-- escrita al principio de la función y hacía `return 0`, así que relevar «una»
-- condición apagaba TODAS las de ese barrido.
--
-- Con los dos barridos relevados hoy eso tiene una consecuencia concreta:
--
--   · `quality_scan_pending_measurements` observa UNA condición. Apagarlo
--     entero no apaga nada de más. El relevo era y sigue siendo correcto.
--
--   · `work_scan_pending_actions` observa DOS: la acción vencida y la eficacia
--     por verificar. La plantilla `action_overdue` releva la primera. La
--     segunda NO la releva nadie —ninguna de las veintiséis plantillas la
--     observa— y sin embargo dejaba de emitirse en cuanto la empresa adoptaba
--     la regla de acciones vencidas.
--
-- Es decir: adoptar una automatización hacía perder, en silencio, un aviso que
-- la empresa venía recibiendo. Es exactamente lo que QI-27 prohíbe.
--
--
-- LO QUE HACE ESTA MIGRACIÓN
--
--   1 · Un resolvedor de relevo que entiende códigos con la granularidad de la
--       CONDICIÓN —`barrido.condición`— y que sigue honrando la forma anterior
--       —`barrido` a secas— para no cambiar por la espalda lo que alguien haya
--       declarado a mano.
--   2 · Los dos barridos relevados, reescritos para preguntar condición a
--       condición en vez de una sola vez al principio.
--   3 · Las dos plantillas que declaran relevo, corregidas a la forma
--       cualificada.
--   4 · Las reglas YA adoptadas desde esas dos plantillas, actualizadas. No es
--       un `update` general: es un `where` por plantilla y por valor exacto, y
--       lo que hace es DEVOLVER un aviso que se había perdido.
--
-- LO QUE NO HACE
--
--   · No crea ninguna tabla. Ni de atención, ni de tablero, ni de observadores:
--     el inventario vive en `lib/domain/quality-observers.ts`, donde una prueba
--     puede compararlo con estas migraciones.
--   · No releva ningún barrido nuevo. Las diez comprobaciones de compatibilidad
--     están en `QUALITY_13B3_OBSERVER_COMPATIBILITY.md` y ninguna sale
--     equivalente hoy.
--   · No borra ningún barrido, ni desactiva ninguno.
--   · No toca `quality_signals`, ni su clave de deduplicación, ni el motor.
-- ============================================================================


-- ============================================================================
-- 1 · EL RESOLVEDOR DE RELEVO
-- ----------------------------------------------------------------------------
-- Dos formas, y las dos se respetan:
--
--   `work_scan_pending_actions.action_overdue`   una condición concreta
--   `work_scan_pending_actions`                  el barrido entero
--
-- La segunda es la de antes de esta migración. Se conserva porque es lo que
-- literalmente dice quien la escribió —«esta regla sustituye a ese barrido»— y
-- cambiarle el significado a un dato ya guardado sería peor que el defecto que
-- se está arreglando.
--
-- `stable` y no `volatile`: solo lee. `security definer` porque los barridos
-- corren también sin sesión, desde el programador.
-- ============================================================================

create or replace function public.quality_observer_is_superseded(
  p_organization_id uuid,
  p_observer        text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from quality_automation_rules r
     where r.organization_id = p_organization_id
       and r.status = 'active'
       and r.supersedes_observer is not null
       and (
         r.supersedes_observer = p_observer
         or r.supersedes_observer = split_part(p_observer, '.', 1)
       )
  );
$fn$;

comment on function public.quality_observer_is_superseded(uuid, text) is
  'QUALITY-13B3 · Responde si una CONDICION concreta de un barrido esta relevada por una regla activa. Admite el codigo cualificado barrido.condicion y tambien el nombre del barrido a secas, que es la forma que uso QUALITY-11.1.';

revoke all on function public.quality_observer_is_superseded(uuid, text) from public, anon;
grant execute on function public.quality_observer_is_superseded(uuid, text) to authenticated;


-- ============================================================================
-- 2 · LOS DOS BARRIDOS, PREGUNTANDO CONDICIÓN A CONDICIÓN
-- ----------------------------------------------------------------------------
-- Se reemiten enteros porque `create or replace function` no admite parches.
-- Salvo las guardas, no cambia ni una línea de lo que observan ni de lo que
-- emiten: mismas consultas, mismas claves de deduplicación, mismos destinatarios.
-- ============================================================================

create or replace function public.quality_scan_pending_measurements(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text;
  v_row   record;
  v_owner uuid;
  v_count integer := 0;
  v_key   text;
begin
  -- QUALITY-11.1 · GAP-01 · Con SESIÓN, exactamente los mismos permisos que
  -- antes. SIN sesión —el barrido programado— se ejecuta como proceso del
  -- sistema, que es lo que llevan haciendo los otros seis barridos desde 0117.
  -- Una condición de negocio programable no puede depender de que alguien
  -- tenga la pantalla abierta.
  if auth.uid() is not null then
    if not is_org_member(p_organization_id) then
      raise exception 'No perteneces a esta empresa';
    end if;
    v_role := current_org_role(p_organization_id);
    if v_role not in ('admin', 'quality') then
      raise exception 'Solo la administración o el área de calidad revisan las mediciones pendientes';
    end if;
  end if;

  -- QUALITY-11.1 · §8 · La empresa puede haber adoptado la regla equivalente
  -- de QUALITY-11. Si lo hizo, ESTE barrido calla: una condición, un aviso. La
  -- fuente de verdad es la que la empresa eligió, no las dos a la vez.
  if quality_observer_is_superseded(
       p_organization_id, 'quality_scan_pending_measurements.measurement_due') then
    return 0;
  end if;


  for v_row in
    select i.id as indicator_id, i.name, b.period_start, b.period_end, b.period_label
      from quality_indicators i
      join quality_indicator_configs c
        on c.indicator_id = i.id and c.effective_to is null
      cross join lateral quality_previous_period(c.frequency, current_date) b
     where i.organization_id = p_organization_id
       and i.admin_state = 'active'
       and quality_period_is_eligible(i.id, b.period_start, b.period_end)
       and not exists (
         select 1 from quality_measurements m
          where m.indicator_id = i.id
            and m.period_start = b.period_start
            and m.period_end = b.period_end
            and m.is_current)
       and not quality_period_is_closed(p_organization_id, b.period_start, b.period_end)
  loop
    v_key := v_row.indicator_id::text || ':' || v_row.period_label;
    v_owner := quality_indicator_owner_profile(v_row.indicator_id);

    insert into work_events
      (organization_id, source_domain, event_type, subject_type, subject_id, subject_period,
       severity, summary, dedupe_key, created_by)
    values
      (p_organization_id, 'indicator', 'indicator.measurement_due', 'quality_indicator',
       v_row.indicator_id, v_row.period_label, 'info',
       'Falta la medición de «' || v_row.name || '» para ' || v_row.period_label,
       'ev:due:' || v_key, auth.uid())
    on conflict do nothing;

    if v_owner is not null then
      insert into work_tasks
        (organization_id, source_domain, task_type, subject_type, subject_id,
         title, description, assignee_profile_id, status, due_at, dedupe_key, created_by)
      values
        (p_organization_id, 'indicator', 'indicator_measurement_due', 'quality_indicator',
         v_row.indicator_id,
         'Medir «' || v_row.name || '» · ' || v_row.period_label,
         'El periodo terminó el ' || to_char(v_row.period_end, 'DD/MM/YYYY') || ' y todavía no tiene medición.',
         v_owner, 'open', v_row.period_end, 'tk:due:' || v_key, auth.uid())
      on conflict do nothing;

      insert into work_alerts
        (organization_id, source_domain, alert_type, severity, subject_type, subject_id,
         title, message, recipient_profile_id, status, dedupe_key, created_by)
      values
        (p_organization_id, 'indicator', 'indicator_measurement_due', 'info',
         'quality_indicator', v_row.indicator_id,
         'Medición pendiente: ' || v_row.name,
         'Falta el resultado de ' || v_row.period_label || '.',
         v_owner, 'new', 'al:due:' || v_key, auth.uid())
      on conflict do nothing;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.work_scan_pending_actions(p_organization_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_row record; v_owner uuid; v_n integer := 0;
begin
  -- QUALITY-11.1 · GAP-01 · Ver la nota de `quality_scan_pending_measurements`.
  if auth.uid() is not null then
    if not is_org_member(p_organization_id) then
      raise exception 'No perteneces a esta empresa';
    end if;
    if not has_org_role(p_organization_id, array['admin','quality']) then
      raise exception 'Solo la administración o el área de calidad revisan los pendientes';
    end if;
  end if;

  -- QUALITY-13B3 · §8 REESCRITO, y esta es la corrección del tramo.
  --
  -- Antes la comprobación estaba AQUÍ, para la función entera: si la empresa
  -- había adoptado la regla de «acción vencida», el barrido devolvía 0 y no
  -- miraba nada más. Con él se iba el aviso de verificar la eficacia, que
  -- ninguna regla releva y que nadie había contado.
  --
  -- Ahora cada condición pregunta por sí misma.

  -- CONDICIÓN 1 · acción vencida. Es la que SÍ tiene plantilla equivalente
  -- (`action_overdue`), y por eso es la única que se calla cuando la empresa la
  -- adopta.
  if not quality_observer_is_superseded(
       p_organization_id, 'work_scan_pending_actions.action_overdue') then
    for v_row in
      select a.* from work_actions a
       where a.organization_id = p_organization_id
         and a.status in ('planned','in_progress')
         and a.due_on is not null and a.due_on < current_date
    loop
      v_owner := case when v_row.owner_position_id is not null
                      then (select profile_id from quality_position_assignments
                             where organization_id = p_organization_id
                               and position_id = v_row.owner_position_id
                               and assignment_type = 'holder' limit 1)
                      else v_row.owner_profile_id end;
      insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                               severity, summary, dedupe_key, created_by)
      values (p_organization_id, 'action', 'action.overdue', 'work_action', v_row.id,
              'warning', 'La acción «' || v_row.title || '» venció el ' || to_char(v_row.due_on, 'DD/MM/YYYY'),
              'ev:act:overdue:' || v_row.id::text, auth.uid())
      on conflict do nothing;

      if v_owner is not null then
        insert into work_alerts (organization_id, source_domain, alert_type, subject_type, subject_id,
                                 title, message, recipient_profile_id, severity, status, dedupe_key, created_by)
        values (p_organization_id, 'action', 'action_overdue', 'work_action', v_row.id,
                'Acción vencida: ' || v_row.title,
                'Venció el ' || to_char(v_row.due_on, 'DD/MM/YYYY') || ' y sigue sin completarse.',
                v_owner, 'warning', 'new', 'al:act:overdue:' || v_row.id::text, auth.uid())
        on conflict do nothing;
      end if;
      v_n := v_n + 1;
    end loop;
  end if;

  -- CONDICIÓN 2 · eficacia por verificar. NINGUNA plantilla la releva, así que
  -- se observa siempre. Esta es exactamente la que se perdía.
  if not quality_observer_is_superseded(
       p_organization_id, 'work_scan_pending_actions.effectiveness_due') then
    for v_row in
      select a.* from work_actions a
       where a.organization_id = p_organization_id
         and a.requires_effectiveness and a.effectiveness_result = 'pending'
    loop
      insert into work_alerts (organization_id, source_domain, alert_type, subject_type, subject_id,
                               title, message, recipient_profile_id, severity, status, dedupe_key, created_by)
      select p_organization_id, 'action', 'effectiveness_due', 'work_action', v_row.id,
             'Falta verificar la eficacia de: ' || v_row.title,
             'La acción está completada. Queda comprobar si sirvió.',
             m.user_id, 'info', 'new', 'al:act:eff:' || v_row.id::text || ':' || m.user_id::text, auth.uid()
        from memberships m
       where m.organization_id = p_organization_id and m.status = 'active'
         and m.role_code in ('admin','quality')
      on conflict do nothing;
      v_n := v_n + 1;
    end loop;
  end if;

  return v_n;
end;
$$;

comment on function public.quality_scan_pending_measurements(uuid) is
  'QUALITY-03 · Mediciones pendientes. QUALITY-13B3: cede ante la regla equivalente, comprobado por CONDICION. Este barrido observa una sola, asi que su comportamiento no cambia.';
comment on function public.work_scan_pending_actions(uuid) is
  'QUALITY-04 · Acciones vencidas y eficacias por verificar. QUALITY-13B3: cada una pregunta por su cuenta si esta relevada. Antes bastaba con relevar la primera para perder la segunda.';


-- ============================================================================
-- 3 · LAS DOS PLANTILLAS QUE DECLARAN RELEVO
-- ----------------------------------------------------------------------------
-- Pasan a nombrar la condición que de verdad relevan. Ninguna otra de las
-- veintiséis declara relevo, así que no hay más que corregir.
-- ============================================================================

update public.quality_automation_rule_templates
   set supersedes_observer = 'quality_scan_pending_measurements.measurement_due'
 where code = 'indicator_measurement_due'
   and supersedes_observer = 'quality_scan_pending_measurements';

update public.quality_automation_rule_templates
   set supersedes_observer = 'work_scan_pending_actions.action_overdue'
 where code = 'action_overdue'
   and supersedes_observer = 'work_scan_pending_actions';


-- ============================================================================
-- 4 · LAS REGLAS YA ADOPTADAS
-- ----------------------------------------------------------------------------
-- Acotado por plantilla Y por valor exacto. No es «todos los observadores
-- relevados pasan a X»: son las filas que salieron de estas dos plantillas y
-- que todavía llevan el valor que aquellas ponían.
--
-- Para `indicator_measurement_due` el efecto es nulo: el barrido tiene una sola
-- condición y seguirá callando igual. Se actualiza por coherencia del dato, no
-- por comportamiento.
--
-- Para `action_overdue` el efecto es el arreglo: la empresa vuelve a recibir el
-- aviso de verificar la eficacia, que es un aviso que ya recibía antes de
-- adoptar la regla. No se le añade nada que no tuviera.
--
-- Una regla con `supersedes_observer` puesto a mano NO se toca.
-- ============================================================================

update public.quality_automation_rules
   set supersedes_observer = 'quality_scan_pending_measurements.measurement_due'
 where template_code = 'indicator_measurement_due'
   and supersedes_observer = 'quality_scan_pending_measurements';

update public.quality_automation_rules
   set supersedes_observer = 'work_scan_pending_actions.action_overdue'
 where template_code = 'action_overdue'
   and supersedes_observer = 'work_scan_pending_actions';
