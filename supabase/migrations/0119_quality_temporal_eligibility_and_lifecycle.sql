-- ============================================================================
-- 0119 · QUALITY-03.1 · Elegibilidad temporal y ciclo de vida controlado
-- ============================================================================
--
-- Tres correcciones que salieron de la prueba humana de QUALITY-03. Ninguna
-- crea dominio nuevo; las tres cierran huecos del que ya existe.
--
-- ============================================================================
-- §A · POR QUÉ UN INDICADOR DE AGOSTO PEDÍA MEDIR JULIO
-- ============================================================================
--
-- v_quality_indicator_status calculaba el periodo pendiente así:
--
--     quality_previous_period(cfg.frequency, current_date)
--
-- es decir, «el periodo anterior a hoy», sin preguntar NUNCA si ese periodo
-- pertenece a la vida del indicador. Un indicador mensual vigente desde el 1
-- de agosto, consultado en agosto, producía julio.
--
-- Y julio no es medible: quality_measurement_guard exige que exista una
-- configuración que CUBRA el periodo, y quality_config_for_period no devuelve
-- nada para julio porque effective_from es el 1 de agosto. De modo que la
-- aplicación pedía algo que su propio dominio rechazaba. Reproducido:
--
--     vigente desde                 | 2026-08-01
--     la vista pide medir           | 2026-07
--       ...y lo marca pendiente     | true
--     ¿el motor acepta ese periodo? | NO — sin configuración vigente
--
-- La regla ya existía; lo que faltaba era que la vista la consultara. Este es
-- el motivo por el que la corrección va en la BASE y no solo en la pantalla:
-- la vista es la fuente, y de ella beben la portada, el detalle del indicador,
-- el desempeño del objetivo y el barrido. Arreglar la pantalla habría dejado a
-- la fuente fabricando julio para todos los demás.
--
-- LA REGLA, EN UNA FRASE: un periodo solo es exigible cuando el propio motor
-- lo aceptaría. Se expresa una sola vez, en quality_period_is_eligible(), y
-- todo lo demás la consulta.
--
-- SEMÁNTICA DE LA FECHA DE INICIO. Se usa effective_from de la configuración,
-- que es la fecha EMPRESARIAL de vigencia, y nunca created_at, que solo dice
-- cuándo alguien tecleó el registro. Un indicador puede declararse hoy con
-- vigencia desde el mes pasado, y entonces el mes pasado SÍ es exigible.
--
-- PERIODO PARCIAL. Con effective_from = 15 de agosto y periodicidad mensual,
-- agosto SÍ es aplicable: quality_config_for_period ya usa SOLAPAMIENTO
-- (effective_from <= period_end), no contención. No se inventa aquí ninguna
-- regla de «esperar al primer periodo completo» porque el baseline no la
-- exige y la semántica congelada ya responde. Julio, en cambio, nunca.
--
-- ============================================================================
-- §B · POR QUÉ UN ADMINISTRADOR PODÍA BORRAR UN HISTÓRICO ENTERO
-- ============================================================================
--
--     quality_measurements.indicator_id → quality_indicators  ON DELETE CASCADE
--     quality_calculation_runs.indicator_id → …               ON DELETE CASCADE
--     quality_indicator_configs.indicator_id → …              ON DELETE CASCADE
--
-- más una política que permite a admin/quality borrar cualquier indicador. El
-- resultado: borrar un indicador destruía en silencio sus mediciones, sus
-- configuraciones históricas y su linaje de cálculo. Contra 2.5 «Historical
-- truth matters», OI-24, OI-28 y MDR-49.
--
-- La cascada NO se retira: sigue siendo correcta para el caso en que el
-- indicador SÍ es desechable (borrar un indicador recién creado debe llevarse
-- su única configuración, que no es historia de nadie). Lo que se añade es la
-- puerta: un disparador BEFORE DELETE que impide el borrado en cuanto el
-- objeto adquirió valor histórico, y que dice POR QUÉ.
--
-- LA FRONTERA HISTÓRICA DE UN INDICADOR NO ES «TENER CONFIGURACIÓN». Crear un
-- indicador publica su primera configuración en el mismo gesto —un indicador
-- sin meta no mide nada—, así que tomar la configuración como frontera dejaría
-- todo indicador indeleble desde el segundo cero, que es justo la queja que
-- este sprint viene a resolver. La frontera es haber producido un RESULTADO:
-- una medición, un cálculo, un evento, o una segunda versión de configuración
-- (que ya es una serie histórica de metas).
--
-- ============================================================================
-- §C · POR QUÉ UN CÓDIGO DOCUMENTAL PODÍA RECICLARSE
-- ============================================================================
--
-- D-04: «Document codes are not recycled». En la base no había NINGUNA
-- restricción sobre trazadoc_documents.code: ni unicidad, ni reserva. Dos
-- documentos vivos podían compartir PR-QA-007, y borrar un borrador liberaba
-- su código para que otro documento lo ocupara.
--
-- Se resuelve con una LÁPIDA (tombstone): al asignar un código se reserva, y
-- la reserva sobrevive al borrado del borrador. No se conserva un documento
-- fantasma visible —eso contradiría el borrado que sí es legítimo—, solo la
-- identidad del código y por qué está ocupado.
--
-- ============================================================================
-- ALCANCE
-- ============================================================================
-- Append-only. No edita 0001–0118. Sin migration repair. No borra datos: la
-- única escritura es sembrar las reservas de los códigos ya existentes.
--
-- ROLLBACK: ver docs/quality/quality-03-1/QUALITY_03_1_ROLLBACK.md
-- ============================================================================


-- ============================================================================
-- §1 · ELEGIBILIDAD TEMPORAL
-- ============================================================================

/** ¿Es este periodo exigible para este indicador?
 *
 *  Responde exactamente lo que respondería quality_measurement_guard, pero sin
 *  levantar excepción: existe una configuración que cubre el periodo y el
 *  indicador no estaba retirado antes de que empezara. Es la única definición
 *  de «periodo elegible» del sistema; la vista y el barrido la consultan en
 *  lugar de reimplementarla, que es como se produjo el defecto de julio. */
create or replace function public.quality_period_is_eligible(
  p_indicator_id uuid, p_period_start date, p_period_end date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_period_start is not null
     and p_period_end is not null
     and quality_config_for_period(p_indicator_id, p_period_start, p_period_end) is not null
     and exists (
           select 1 from quality_indicators i
            where i.id = p_indicator_id
              and (i.retired_at is null or i.retired_at::date >= p_period_start)
         );
$$;
comment on function public.quality_period_is_eligible(uuid, date, date) is
  'QUALITY-03.1 · Un periodo es exigible solo si el motor lo aceptaria: hay configuracion que lo cubre y el indicador no estaba retirado. Definicion UNICA de periodo elegible.';
revoke all on function public.quality_period_is_eligible(uuid, date, date) from public, anon, authenticated;
grant execute on function public.quality_period_is_eligible(uuid, date, date) to authenticated;


-- §1.2 · La vista deja de fabricar periodos
--
-- Mismas columnas, mismo orden, mismos tipos: lo unico que cambia es que los
-- laterales `due` y `nxt` ahora se anulan cuando el periodo no es elegible.
create or replace view public.v_quality_indicator_status
with (security_invoker = true) as
select
  i.organization_id,
  i.id                                        as indicator_id,
  i.code,
  i.name,
  i.description,
  i.scope_type,
  i.scope_process_id,
  proc.name                                   as scope_process_name,
  i.admin_state,
  i.retired_at,
  i.successor_indicator_id,
  i.owner_position_id,
  pos.name                                    as owner_position_name,
  coalesce(nullif(trim(holder.full_name), ''), holder.email) as owner_holder_name,
  coalesce(nullif(trim(op.full_name), ''), op.email)         as owner_profile_name,
  i.created_at,

  cfg.id                                      as config_id,
  cfg.version_number                          as config_version,
  cfg.effective_from                          as config_effective_from,
  cfg.unit_code,
  cfg.unit_label,
  cfg.direction,
  cfg.frequency,
  cfg.target_value,
  cfg.target_min,
  cfg.target_max,
  cfg.warning_value,
  cfg.warning_min,
  cfg.warning_max,
  cfg.source_kind,
  cfg.source_key,
  cfg.formula_text,
  cfg.calc_definition,
  cfg.consolidation_method,
  cfg.comparability_break,

  last_m.period_label                         as last_period_label,
  last_m.period_start                         as last_period_start,
  last_m.period_end                           as last_period_end,
  last_m.value                                as last_value,
  last_m.data_state                           as last_data_state,
  last_m.data_quality                         as last_data_quality,
  last_m.evaluation                           as last_evaluation,
  last_m.evaluation_explanation               as last_evaluation_explanation,
  last_m.result_state                         as last_result_state,
  last_m.measured_at                          as last_measured_at,

  due.period_label                            as due_period_label,
  due.period_start                            as due_period_start,
  due.period_end                              as due_period_end,
  -- MEDICION PENDIENTE: el ultimo periodo cerrado no tiene medicion vigente.
  -- Se DERIVA siempre; no depende de que nadie haya corrido el barrido. Y solo
  -- puede estar pendiente un periodo que EXISTE para este indicador: `due` ya
  -- viene en null cuando el periodo es anterior a su vigencia (QUALITY-03.1).
  (i.admin_state = 'active' and cfg.id is not null and due.period_start is not null
   and not exists (
     select 1 from public.quality_measurements m
      where m.indicator_id = i.id and m.period_start = due.period_start
        and m.period_end = due.period_end and m.is_current
   ))                                          as measurement_pending,

  nxt.period_label                            as current_period_label,
  nxt.period_end                              as next_measurement_due_on,

  coalesce(stats.measurement_count, 0)        as measurement_count
from public.quality_indicators i
left join public.quality_processes proc on proc.id = i.scope_process_id
left join public.quality_positions pos   on pos.id = i.owner_position_id
left join public.profiles op             on op.id = i.owner_profile_id
left join public.v_quality_position_current_holder h on h.position_id = i.owner_position_id
left join public.profiles holder         on holder.id = h.profile_id

left join lateral (
  select c.* from public.quality_indicator_configs c
   where c.indicator_id = i.id and c.effective_to is null
   limit 1
) cfg on true

left join lateral (
  select m.* from public.quality_measurements m
   where m.indicator_id = i.id and m.is_current
   order by m.period_start desc limit 1
) last_m on true

-- El ULTIMO periodo cerrado, pero solo si pertenece a la vida del indicador.
left join lateral (
  select b.period_label, b.period_start, b.period_end
    from public.quality_previous_period(coalesce(cfg.frequency, 'monthly'), current_date) b
   where public.quality_period_is_eligible(i.id, b.period_start, b.period_end)
) due on true

-- El periodo EN CURSO, con la misma condicion: un indicador cuya vigencia
-- empieza el mes que viene no tiene «proxima medicion» este mes.
left join lateral (
  select b.period_label, b.period_start, b.period_end
    from public.quality_period_bounds(coalesce(cfg.frequency, 'monthly'), current_date) b
   where public.quality_period_is_eligible(i.id, b.period_start, b.period_end)
) nxt on true

left join lateral (
  select count(*) as measurement_count from public.quality_measurements m
   where m.indicator_id = i.id and m.is_current
) stats on true;

comment on view public.v_quality_indicator_status is
  'QUALITY-03 · Estado de cada indicador, DERIVADO (MDR-37). QUALITY-03.1: el periodo pendiente y el periodo en curso solo existen cuando son ELEGIBLES para el indicador — la vista ya no puede exigir un periodo anterior a su vigencia.';


-- §1.3 · El barrido usa la configuracion DEL PERIODO, no la de hoy
--
-- El barrido ya tenia una guarda (`c.effective_from <= b.period_end`), pero la
-- evaluaba contra la configuracion VIGENTE HOY. Un indicador que empezo en
-- junio y publico una meta nueva en agosto quedaba con effective_from = agosto,
-- de modo que julio —perfectamente medible con la configuracion anterior—
-- dejaba de generar tarea. Ahora pregunta por la configuracion aplicable a ESE
-- periodo, que es la misma pregunta que hace el motor al registrar.
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
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not is_org_member(p_organization_id) then
    raise exception 'No perteneces a esta empresa';
  end if;
  v_role := current_org_role(p_organization_id);
  if v_role not in ('admin', 'quality') then
    raise exception 'Solo la administración o el área de calidad revisan las mediciones pendientes';
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
revoke all on function public.quality_scan_pending_measurements(uuid) from public, anon;
grant execute on function public.quality_scan_pending_measurements(uuid) to authenticated;


-- ============================================================================
-- §2 · CICLO DE VIDA: QUÉ SE PUEDE ELIMINAR Y QUÉ YA NO
-- ============================================================================
--
-- La regla, en una frase: un objeto puede eliminarse mientras no haya
-- adquirido valor histórico, probatorio o referencial. Cuando lo adquiere, no
-- se destruye: se retira, se desactiva o se corrige, según el dominio.
--
-- Aquí NO hay una tabla universal de ciclo de vida ni un motor abstracto. Hay
-- una función por entidad, cada una con las preguntas de SU dominio, detrás de
-- una interfaz común. La forma compartida es lo que permite que la interfaz
-- sea coherente; la lógica sigue siendo específica, que es lo que permite
-- entenderla.
--
-- El mismo dictamen sirve para dos cosas: contarle al usuario por qué no puede
-- borrar algo (antes), y bloquear el borrado (durante). Al compartir función,
-- el mensaje del modal y el motivo del rechazo NUNCA pueden discrepar.

/** Forma común del dictamen. Se devuelve como jsonb para no crear un tipo
 *  compuesto que luego habría que versionar:
 *
 *    { can_hard_delete, reason_code, reason,
 *      blocking: [{ label, count }], alternative, alternative_label } */

/** Nombres visibles de los estados. Un código interno como «in_review» no se
 *  le enseña a un usuario: la aplicación ya los traduce en pantalla y el
 *  dictamen debe hablar el mismo idioma. */
create or replace function public.trazadoc_state_label(p_status text)
returns text language sql immutable as $$
  select case p_status
    when 'draft' then 'borrador'
    when 'in_review' then 'en revisión'
    when 'changes_requested' then 'con cambios solicitados'
    when 'approved' then 'aprobado'
    when 'effective' then 'vigente'
    when 'superseded' then 'sustituido'
    when 'retired' then 'retirado'
    else p_status end
$$;

create or replace function public.quality_objective_state_label(p_state text)
returns text language sql immutable as $$
  select case p_state
    when 'draft' then 'borrador'
    when 'active' then 'activo'
    when 'closed' then 'cerrado'
    when 'cancelled' then 'cancelado'
    else p_state end
$$;

-- §2.1 · INDICADOR
create or replace function public.quality_indicator_deletion_verdict(p_indicator_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ind      record;
  v_blocking jsonb := '[]'::jsonb;
  v_n        integer;
begin
  select * into v_ind from quality_indicators where id = p_indicator_id;
  if v_ind.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Este indicador no existe.', 'blocking', '[]'::jsonb);
  end if;
  select count(*) into v_n from quality_measurements where indicator_id = p_indicator_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'medición registrada' else 'mediciones registradas' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_calculation_runs where indicator_id = p_indicator_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'cálculo ejecutado' else 'cálculos ejecutados' end,
      'count', v_n);
  end if;

  select count(*) into v_n from work_events
   where subject_type = 'quality_indicator' and subject_id = p_indicator_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'hecho en la bitácora' else 'hechos en la bitácora' end,
      'count', v_n);
  end if;

  -- Una SEGUNDA versión de configuración ya es una serie histórica de metas
  -- (OI-07). La primera no: nace con el indicador, en el mismo gesto.
  select count(*) into v_n from quality_indicator_configs where indicator_id = p_indicator_id;
  if v_n > 1 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 2 then 'meta histórica' else 'metas históricas' end, 'count', v_n - 1);
  end if;

  select count(*) into v_n from quality_indicators where successor_indicator_id = p_indicator_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', 'indicador retirado que lo señala como sucesor', 'count', v_n);
  end if;

  if jsonb_array_length(v_blocking) = 0 then
    return jsonb_build_object(
      'can_hard_delete', true, 'reason_code', 'disposable',
      'reason', 'Este indicador todavía no ha producido resultados: puede eliminarse.',
      'blocking', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'can_hard_delete', false, 'reason_code', 'has_history',
    'reason', 'Este indicador ya produjo resultados y su histórico debe conservarse.',
    'blocking', v_blocking,
    'alternative', 'retire',
    'alternative_label', 'Retirarlo conservando su histórico');
end;
$$;
revoke all on function public.quality_indicator_deletion_verdict(uuid) from public, anon, authenticated;


-- §2.2 · OBJETIVO
create or replace function public.quality_objective_deletion_verdict(p_objective_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_obj        record;
  v_blocking   jsonb := '[]'::jsonb;
  v_left_draft boolean := false;
  v_n          integer;
begin
  select * into v_obj from quality_objectives where id = p_objective_id;
  if v_obj.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Este objetivo no existe.', 'blocking', '[]'::jsonb);
  end if;

  -- Declararlo activo es el acto por el que la empresa se compromete: a partir
  -- de ahí es una decisión de gestión y su rastro se conserva.
  if v_obj.admin_state <> 'draft' then
    v_left_draft := true;
  end if;

  select count(*) into v_n
    from quality_objective_indicators oi
    join quality_measurements m on m.indicator_id = oi.indicator_id
   where oi.objective_id = p_objective_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', 'mediciones de sus indicadores', 'count', v_n);
  end if;

  select count(*) into v_n from quality_objectives where parent_objective_id = p_objective_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'objetivo que depende de él' else 'objetivos que dependen de él' end,
      'count', v_n);
  end if;

  if not v_left_draft and jsonb_array_length(v_blocking) = 0 then
    return jsonb_build_object('can_hard_delete', true, 'reason_code', 'disposable',
      'reason', 'Este objetivo sigue en borrador y no tiene resultados: puede eliminarse.',
      'blocking', '[]'::jsonb);
  end if;

  return jsonb_build_object('can_hard_delete', false, 'reason_code', 'has_history',
    'reason', case when v_left_draft
      then 'Este objetivo ya salió del borrador (' || quality_objective_state_label(v_obj.admin_state)
           || ') y forma parte de la historia de gestión de la empresa.'
      else 'Este objetivo forma parte de la historia de gestión de la empresa.' end,
    'blocking', v_blocking,
    'alternative', 'close',
    'alternative_label', 'Cerrarlo conservando su histórico');
end;
$$;
revoke all on function public.quality_objective_deletion_verdict(uuid) from public, anon, authenticated;


-- §2.3 · CARGO
--
-- QUALITY-01.1 ya dejó el comportamiento correcto: las FK ON DELETE RESTRICT
-- de 0112 impiden borrar un cargo en uso y la aplicación traduce el 23503.
-- Lo que faltaba era poder decirlo ANTES, y con números.
create or replace function public.quality_position_deletion_verdict(p_position_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pos      record;
  v_blocking jsonb := '[]'::jsonb;
  v_n        integer;
begin
  select * into v_pos from quality_positions where id = p_position_id;
  if v_pos.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Este cargo no existe.', 'blocking', '[]'::jsonb);
  end if;

  select count(*) into v_n from quality_processes where owner_position_id = p_position_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'proceso del que es propietario' else 'procesos de los que es propietario' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_position_assignments where position_id = p_position_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'asignación de titular' else 'asignaciones de titular' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_indicators where owner_position_id = p_position_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'indicador a su cargo' else 'indicadores a su cargo' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_objectives where owner_position_id = p_position_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'objetivo a su cargo' else 'objetivos a su cargo' end,
      'count', v_n);
  end if;

  select count(*) into v_n from trazadoc_documents where owner_position_id = p_position_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'documento a su cargo' else 'documentos a su cargo' end,
      'count', v_n);
  end if;

  if jsonb_array_length(v_blocking) = 0 then
    return jsonb_build_object('can_hard_delete', true, 'reason_code', 'disposable',
      'reason', 'Este cargo no tiene nada asociado todavía: puede eliminarse.',
      'blocking', '[]'::jsonb);
  end if;

  return jsonb_build_object('can_hard_delete', false, 'reason_code', 'in_use',
    'reason', 'Este cargo tiene responsabilidades asociadas y su historia debe conservarse.',
    'blocking', v_blocking,
    'alternative', 'deactivate',
    'alternative_label', 'Desactivarlo conservando su historia');
end;
$$;
revoke all on function public.quality_position_deletion_verdict(uuid) from public, anon, authenticated;


-- §2.4 · DOCUMENTO
--
-- La regla ya vive en trazadoc_delete_document_safely (0116) y es correcta.
-- Esta función la hace CONSULTABLE sin ejecutarla: mismas preguntas, mismo
-- orden, para que el aviso y el rechazo no puedan contradecirse.
create or replace function public.trazadoc_document_deletion_verdict(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_doc        record;
  v_blocking   jsonb := '[]'::jsonb;
  v_left_draft boolean := false;
  v_n          integer;
begin
  select * into v_doc from trazadoc_documents where id = p_document_id;
  if v_doc.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Este documento no existe.', 'blocking', '[]'::jsonb);
  end if;

  if v_doc.disposition <> 'active' then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'retired',
      'reason', 'Este documento ya está retirado: se conserva como histórico.',
      'blocking', '[]'::jsonb);
  end if;

  -- El estado NO es una cosa contable: «1 salió del borrador» no se puede leer.
  -- Va en el motivo, y en español: un código interno como «in_review» no se le
  -- enseña a nadie.
  if v_doc.status <> 'draft' or v_doc.approved_at is not null then
    v_left_draft := true;
  end if;

  select count(*) into v_n from trazadoc_document_decisions d
   where d.document_id = p_document_id and d.decision_type <> 'revision_created';
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'decisión de revisión o aprobación' else 'decisiones de revisión o aprobación' end,
      'count', v_n);
  end if;

  select count(*) into v_n from trazadoc_document_revisions r
   where r.document_id = p_document_id and (r.approved_at is not null or r.revision_number > 1);
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'revisión formal' else 'revisiones formales' end, 'count', v_n);
  end if;

  select count(*) into v_n from quality_process_documents q where q.document_id = p_document_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'proceso que lo referencia' else 'procesos que lo referencian' end,
      'count', v_n);
  end if;

  select count(*) into v_n from trazadoc_document_versions v
   where v.document_id = p_document_id and v.status <> 'draft';
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'versión registrada' else 'versiones registradas' end, 'count', v_n);
  end if;

  if not v_left_draft and jsonb_array_length(v_blocking) = 0 then
    return jsonb_build_object('can_hard_delete', true, 'reason_code', 'disposable',
      'reason', 'Este documento sigue en borrador y nunca entró en revisión: puede eliminarse.',
      'blocking', '[]'::jsonb);
  end if;

  return jsonb_build_object('can_hard_delete', false, 'reason_code', 'has_history',
    'reason', case when v_left_draft
      then 'Este documento ya salió del borrador (' || trazadoc_state_label(v_doc.status)
           || ') y su historial debe conservarse.'
      else 'Este documento ya tiene historial formal y debe conservarse.' end,
    'blocking', v_blocking,
    'alternative', 'retire',
    'alternative_label', 'Retirarlo conservando su trazabilidad');
end;
$$;
revoke all on function public.trazadoc_document_deletion_verdict(uuid) from public, anon, authenticated;


-- §2.5 · EL DESPACHADOR PÚBLICO — una sola puerta de consulta, con máscara
--
-- Los cuatro dictámenes anteriores cuentan historia y no preguntan quién mira:
-- el disparador los necesita así, porque en el instante del borrado la RLS ya
-- decidió si esa fila era tocable.
--
-- La consulta desde la aplicación es otra cosa. Ahí sí importa quién pregunta,
-- porque un contador es información: saber que un indicador ajeno tiene cuatro
-- mediciones ya dice algo de esa empresa. Para quien no es miembro, la
-- respuesta es la misma que para un identificador inventado.
create or replace function public.quality_deletion_eligibility(p_entity text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_none jsonb := jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
                                     'reason', 'Este registro no existe.', 'blocking', '[]'::jsonb);
begin
  if auth.uid() is null then return v_none; end if;

  v_org := case p_entity
    when 'indicator' then (select organization_id from quality_indicators where id = p_id)
    when 'objective' then (select organization_id from quality_objectives where id = p_id)
    when 'position'  then (select organization_id from quality_positions  where id = p_id)
    when 'document'  then (select organization_id from trazadoc_documents where id = p_id)
  end;

  if v_org is null or not is_org_member(v_org) then return v_none; end if;

  return case p_entity
    when 'indicator' then quality_indicator_deletion_verdict(p_id)
    when 'objective' then quality_objective_deletion_verdict(p_id)
    when 'position'  then quality_position_deletion_verdict(p_id)
    when 'document'  then trazadoc_document_deletion_verdict(p_id)
  end;
end;
$$;
comment on function public.quality_deletion_eligibility(text, uuid) is
  'QUALITY-03.1 · Puede eliminarse este objeto, y si no, por que y que hacer en su lugar. Interfaz UNICA para la aplicacion; la logica sigue siendo la de cada dominio. Enmascara por completo lo ajeno.';
revoke all on function public.quality_deletion_eligibility(text, uuid) from public, anon;
grant execute on function public.quality_deletion_eligibility(text, uuid) to authenticated;

-- ============================================================================
-- §2.6 · LA PUERTA: el dictamen se aplica EN LA BASE
-- ============================================================================
--
-- Sin esto, el dictamen sería un consejo. Un disparador BEFORE DELETE vuelve a
-- preguntar en el instante del borrado, de modo que la ventana entre «el
-- usuario abrió el modal» y «el usuario confirmó» no puede aprovecharse: si
-- entretanto alguien registró una medición, el borrado falla.
--
-- Y es la barrera que un administrador tampoco puede saltarse. Administrar no
-- es poder destruir la historia (§24 del encargo): el rol decide quién opera,
-- no qué se puede destruir.

create or replace function public.quality_guard_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verdict jsonb;
  v_reason  text;
  v_alt     text;
  v_parts   text := '';
  v_item    jsonb;
begin
  v_verdict := case tg_argv[0]
    when 'indicator' then quality_indicator_deletion_verdict(old.id)
    when 'objective' then quality_objective_deletion_verdict(old.id)
    when 'position'  then quality_position_deletion_verdict(old.id)
    when 'document'  then trazadoc_document_deletion_verdict(old.id)
  end;

  if coalesce((v_verdict->>'can_hard_delete')::boolean, false) then
    return old;
  end if;

  v_reason := coalesce(v_verdict->>'reason', 'Este registro no puede eliminarse.');
  for v_item in select * from jsonb_array_elements(coalesce(v_verdict->'blocking', '[]'::jsonb)) loop
    v_parts := v_parts || case when v_parts = '' then '' else ', ' end
            || (v_item->>'count') || ' ' || (v_item->>'label');
  end loop;
  if v_parts <> '' then
    v_reason := v_reason || ' Tiene ' || v_parts || '.';
  end if;
  v_alt := v_verdict->>'alternative_label';
  if v_alt is not null then
    v_reason := v_reason || ' ' || v_alt || '.';
  end if;

  raise exception '%', v_reason;
end;
$$;
revoke all on function public.quality_guard_hard_delete() from public, anon, authenticated;

create trigger quality_indicators_guard_delete
  before delete on public.quality_indicators
  for each row execute function public.quality_guard_hard_delete('indicator');

create trigger quality_objectives_guard_delete
  before delete on public.quality_objectives
  for each row execute function public.quality_guard_hard_delete('objective');

create trigger quality_positions_guard_delete
  before delete on public.quality_positions
  for each row execute function public.quality_guard_hard_delete('position');

create trigger trazadoc_documents_guard_delete
  before delete on public.trazadoc_documents
  for each row execute function public.quality_guard_hard_delete('document');

-- NOTA sobre por que NO hay disparador en revisiones, decisiones, mediciones,
-- configuraciones, cierres ni eventos: esas tablas no tienen politica de
-- DELETE, asi que la RLS ya las niega, y ademas se borran EN CASCADA cuando se
-- elimina un objeto que si era desechable. Un disparador alli romperia el
-- borrado legitimo de un borrador.


-- §2.7 · Y el privilegio que el entorno concede de mas (leccion de 0115/0118)
--
-- Estas tablas no tienen politica de DELETE: la RLS ya lo niega. Pero en un
-- proyecto remoto de Supabase `authenticated` conserva el privilegio, y un
-- DELETE sin politica no da error: afecta a cero filas y devuelve 204. Con el
-- privilegio retirado, el intento falla con 42501, que es la verdad.
revoke delete on table
  public.quality_process_revisions,
  public.quality_process_map_versions,
  public.quality_process_maps,
  public.quality_process_categories,
  public.quality_position_assignments,
  public.trazadoc_document_versions,
  public.trazadoc_file_document_versions,
  public.trazadoc_file_documents,
  public.trazadoc_status_history,
  public.trazadoc_blueprints,
  public.trazadoc_blueprint_sections
from authenticated;

-- Las de 0116 que guardan la historia formal del workflow: D-20 dice que una
-- decision de revision o aprobacion es un hecho historico inmutable.
revoke update, delete on table
  public.trazadoc_document_decisions
from authenticated;
revoke delete on table
  public.trazadoc_document_revisions,
  public.trazadoc_document_workflow_participants
from authenticated;


-- ============================================================================
-- §3 · D-04 · LOS CÓDIGOS DOCUMENTALES NO SE RECICLAN
-- ============================================================================
--
-- Una reserva de código sobrevive al documento. Es una lápida: conserva la
-- identidad ocupada sin conservar un documento fantasma que ensucie las listas.

create table public.trazadoc_document_codes (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code_key        text not null,                 -- normalizado (minúsculas, sin espacios)
  code            text not null,                 -- tal como se escribió
  document_id     uuid,                          -- null = el documento se eliminó
  released_at     timestamptz,                   -- cuándo dejó de haber documento
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (organization_id, code_key),
  constraint trazadoc_document_codes_released_consistent
    check ((document_id is null) = (released_at is not null))
);

comment on table public.trazadoc_document_codes is
  'QUALITY-03.1 · Reserva de codigos documentales (D-04). Un codigo asignado queda ocupado para siempre dentro de la empresa: si el borrador se elimina, la reserva permanece con document_id nulo. Evita que PR-QA-007 designe dos cosas distintas en momentos distintos.';

alter table public.trazadoc_document_codes enable row level security;

create policy trazadoc_document_codes_select on public.trazadoc_document_codes
  for select to authenticated using (public.is_org_member(organization_id));
-- Sin politicas de escritura: la reserva la gestionan los disparadores.

grant select on table public.trazadoc_document_codes to authenticated;
grant select, insert, update, delete on table public.trazadoc_document_codes to service_role;
revoke all on table public.trazadoc_document_codes from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.trazadoc_document_codes from authenticated;

/** Normaliza un codigo: los codigos documentales no distinguen mayusculas ni
 *  espacios sobrantes. «pr-qa-007» y «PR-QA-007 » son el mismo codigo. */
create or replace function public.trazadoc_code_key(p_code text)
returns text
language sql
immutable
as $$ select nullif(lower(btrim(p_code)), '') $$;

create or replace function public.trazadoc_reserve_document_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key  text := trazadoc_code_key(new.code);
  v_prev text := case when tg_op = 'UPDATE' then trazadoc_code_key(old.code) else null end;
  v_res  record;
begin
  if v_key is not distinct from v_prev then return new; end if;

  -- Liberar el codigo anterior deja la lapida: sigue ocupado, ya sin documento.
  if v_prev is not null then
    update trazadoc_document_codes
       set document_id = null, released_at = now()
     where organization_id = old.organization_id and code_key = v_prev
       and document_id = old.id;
  end if;

  if v_key is null then return new; end if;

  select * into v_res from trazadoc_document_codes
   where organization_id = new.organization_id and code_key = v_key;

  if v_res.code_key is null then
    insert into trazadoc_document_codes (organization_id, code_key, code, document_id, created_by)
    values (new.organization_id, v_key, btrim(new.code), new.id, auth.uid());
    return new;
  end if;

  if v_res.document_id is not null and v_res.document_id <> new.id then
    raise exception 'El código % ya está en uso por otro documento de esta empresa.', btrim(new.code);
  end if;
  if v_res.document_id is null then
    raise exception 'El código % ya se usó antes en esta empresa y no puede reutilizarse. Los códigos documentales no se reciclan.', btrim(new.code);
  end if;
  return new;
end;
$$;
revoke all on function public.trazadoc_reserve_document_code() from public, anon, authenticated;

create trigger trazadoc_documents_reserve_code
  after insert or update of code on public.trazadoc_documents
  for each row execute function public.trazadoc_reserve_document_code();

/** Al eliminar un documento eliminable, su codigo NO vuelve al mercado. */
create or replace function public.trazadoc_release_document_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update trazadoc_document_codes
     set document_id = null, released_at = now()
   where organization_id = old.organization_id
     and code_key = trazadoc_code_key(old.code)
     and document_id = old.id;
  return old;
end;
$$;
revoke all on function public.trazadoc_release_document_code() from public, anon, authenticated;

create trigger trazadoc_documents_release_code
  after delete on public.trazadoc_documents
  for each row execute function public.trazadoc_release_document_code();

-- Sembrar las reservas de los codigos que YA existen. Sin esto, el primer
-- documento existente que se editara chocaria contra su propio codigo.
insert into public.trazadoc_document_codes (organization_id, code_key, code, document_id, created_by)
select distinct on (d.organization_id, public.trazadoc_code_key(d.code))
       d.organization_id, public.trazadoc_code_key(d.code), btrim(d.code), d.id, d.created_by
  from public.trazadoc_documents d
 where public.trazadoc_code_key(d.code) is not null
 order by d.organization_id, public.trazadoc_code_key(d.code), d.created_at
on conflict do nothing;
