-- ============================================================================
-- 0120 · QUALITY-03.1a · Eliminar un proceso que todavía es un borrador
-- ============================================================================
--
-- POR QUÉ EXISTE
--
-- QUALITY-03.1 dejó declarada la brecha G-1: un proceso en borrador no se podía
-- eliminar. No por una decisión, sino por una ausencia — `quality_processes`
-- tenía políticas de SELECT, INSERT y UPDATE, y ninguna de DELETE—. Y hasta
-- 0119 el intento ni siquiera fallaba: `authenticated` conservaba el privilegio
-- sin política, así que el borrado afectaba a cero filas y devolvía 204. 0119
-- retiró el privilegio; esta migración da la política que faltaba, con su
-- puerta.
--
-- Se aplica al dominio Process la misma regla ya congelada en QUALITY-03.1:
--
--   un objeto puede eliminarse mientras no haya adquirido valor histórico,
--   probatorio o referencial. Cuando lo adquiere, no se destruye.
--
-- LO QUE HABÍA DEBAJO, Y ES LO PELIGROSO
--
--     quality_process_map_edges.source_process_id  → ON DELETE CASCADE
--     quality_process_map_edges.target_process_id  → ON DELETE CASCADE
--     quality_process_revisions.process_id         → ON DELETE CASCADE
--     quality_process_documents.process_id         → ON DELETE CASCADE
--     quality_objective_processes.process_id       → ON DELETE CASCADE
--     quality_process_map_nodes.process_id         → ON DELETE CASCADE
--     quality_process_interactions.{source,target} → ON DELETE CASCADE
--     quality_process_io.process_id                → ON DELETE CASCADE
--     quality_indicators.scope_process_id          → ON DELETE RESTRICT
--
-- `quality_process_map_edges` es el SNAPSHOT de las relaciones que mostraba una
-- versión PUBLICADA del mapa (0114/0115). Abrir el borrado sin más habría
-- dejado que eliminar un proceso arrancara filas de un mapa ya publicado: no se
-- pierde «un proceso», se corrompe un registro histórico que alguien firmó.
-- Lo mismo con las revisiones publicadas.
--
-- Las cascadas NO se retiran. Son correctas para el caso en que el proceso SÍ
-- es desechable: un borrador se lleva sus revisiones en borrador, y esas se
-- llevan sus entradas y salidas, que nunca salieron del borrador y no son
-- historia de nadie. Lo que se añade es la puerta que decide si ese caso se da.
--
-- QUÉ CUENTA COMO HISTORIA, Y POR QUÉ CADA COSA
--
--   · una revisión publicada o sustituida → el proceso rigió alguna vez;
--   · pertenecer a una versión de mapa publicada o sustituida, o aparecer en el
--     snapshot de aristas → forma parte de un mapa que alguien publicó;
--   · el estado del proceso ya no es 'draft' → activarlo es el acto por el que
--     la empresa lo adopta;
--   · una interacción con otro proceso → la relación es un objeto COMPARTIDO;
--     borrar este proceso mutaría en silencio la ficha del otro, que dejaría de
--     decir de quién recibe o a quién entrega;
--   · un documento asociado → simétrico a lo que ya hace el borrado documental
--     de 0116, que pide quitar la asociación primero;
--   · un objetivo que lo declara entre sus procesos, o un indicador cuyo
--     alcance es este proceso → referencias vivas de otro dominio.
--
-- Las tres últimas son REFERENCIAS, no historia: se resuelven quitando la
-- asociación, y el mensaje lo dice. Las tres primeras son historia y no se
-- resuelven: el proceso se retira.
--
-- ALCANCE
--
-- Append-only. No edita 0112 ni ninguna anterior. No borra datos. No crea
-- tablas ni estados: `quality_processes.status` ya tiene 'retired', que es la
-- alternativa que el modelo ofrecía y que no hubo que inventar.
--
-- ROLLBACK: ver docs/quality/quality-03-1/QUALITY_03_1A_DRAFT_PROCESS_DELETE.md
-- ============================================================================


-- ----------------------------------------------------------------------------
-- §1 · EL DICTAMEN
--
-- Misma forma que los cuatro de 0119 §2, y por la misma razón: el disparador y
-- la pantalla consultan la MISMA función, así que el aviso y el rechazo no
-- pueden discrepar.
-- ----------------------------------------------------------------------------
create or replace function public.quality_process_deletion_verdict(p_process_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_proc       record;
  v_blocking   jsonb := '[]'::jsonb;
  v_left_draft boolean := false;
  v_n          integer;
begin
  select * into v_proc from quality_processes where id = p_process_id;
  if v_proc.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
      'reason', 'Este proceso no existe.', 'blocking', '[]'::jsonb);
  end if;

  -- Activarlo es el acto por el que la empresa lo adopta. Retirado, con más
  -- razón: ya tuvo vida.
  if v_proc.status <> 'draft' then
    v_left_draft := true;
  end if;

  -- HISTORIA — no se resuelve quitando nada.
  select count(*) into v_n from quality_process_revisions
   where process_id = p_process_id and status <> 'draft';
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'revisión publicada' else 'revisiones publicadas' end,
      'count', v_n);
  end if;

  select count(*) into v_n
    from quality_process_map_nodes n
    join quality_process_map_versions v on v.id = n.map_version_id
   where n.process_id = p_process_id and v.status <> 'draft';
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'versión publicada del mapa que lo incluye'
                    else 'versiones publicadas del mapa que lo incluyen' end,
      'count', v_n);
  end if;

  -- El snapshot de aristas: si aparece aquí, un mapa publicado lo dibujó
  -- relacionado con otro. Se cuenta aparte porque puede haber aristas de una
  -- version publicada aunque el nodo se haya movido despues.
  select count(*) into v_n from quality_process_map_edges
   where source_process_id = p_process_id or target_process_id = p_process_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'relación dibujada en un mapa publicado'
                    else 'relaciones dibujadas en un mapa publicado' end,
      'count', v_n);
  end if;

  -- REFERENCIAS VIVAS — estas SÍ se resuelven, y el mensaje lo dirá.
  select count(*) into v_n from quality_process_interactions
   where source_process_id = p_process_id or target_process_id = p_process_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'relación con otro proceso' else 'relaciones con otros procesos' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_process_documents where process_id = p_process_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'documento asociado' else 'documentos asociados' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_objective_processes where process_id = p_process_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'objetivo que lo incluye' else 'objetivos que lo incluyen' end,
      'count', v_n);
  end if;

  select count(*) into v_n from quality_indicators where scope_process_id = p_process_id;
  if v_n > 0 then
    v_blocking := v_blocking || jsonb_build_object(
      'label', case when v_n = 1 then 'indicador que lo mide' else 'indicadores que lo miden' end,
      'count', v_n);
  end if;

  if not v_left_draft and jsonb_array_length(v_blocking) = 0 then
    return jsonb_build_object('can_hard_delete', true, 'reason_code', 'disposable',
      'reason', 'Este proceso sigue en borrador, sin publicar y sin nada que dependa de él: puede eliminarse.',
      'blocking', '[]'::jsonb);
  end if;

  return jsonb_build_object('can_hard_delete', false, 'reason_code',
      case when v_left_draft then 'has_history' else 'in_use' end,
    'reason', case when v_left_draft
      then 'Este proceso ya salió del borrador (' || quality_process_state_label(v_proc.status)
           || ') y su historia debe conservarse.'
      else 'Este proceso no puede eliminarse mientras otras cosas dependan de él.' end,
    'blocking', v_blocking,
    -- Un proceso adoptado se RETIRA: el estado ya existe en el modelo y es lo
    -- que corresponde. Uno que solo tiene referencias vivas no necesita
    -- retirarse: basta con soltarlas, y eso es lo que se le dice.
    'alternative', case when v_left_draft then 'retire' else null end,
    'alternative_label', case when v_left_draft
      then 'Retirarlo conservando su historia'
      else 'Quita esas asociaciones y podrás eliminarlo' end);
end;
$$;
revoke all on function public.quality_process_deletion_verdict(uuid) from public, anon, authenticated;

/** Nombre visible del estado de un proceso. Un código interno no se le enseña
 *  a nadie — misma regla que trazadoc_state_label en 0119. */
create or replace function public.quality_process_state_label(p_status text)
returns text language sql immutable as $$
  select case p_status
    when 'draft' then 'borrador'
    when 'active' then 'activo'
    when 'retired' then 'retirado'
    else p_status end
$$;


-- ----------------------------------------------------------------------------
-- §2 · EL DESPACHADOR PÚBLICO aprende una entidad más
--
-- Se reemplaza entero porque un `case` no se amplía en su sitio. Las cuatro
-- ramas anteriores quedan idénticas a 0119 §2.5.
-- ----------------------------------------------------------------------------
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
    when 'process'   then (select organization_id from quality_processes  where id = p_id)
  end;

  if v_org is null or not is_org_member(v_org) then return v_none; end if;

  return case p_entity
    when 'indicator' then quality_indicator_deletion_verdict(p_id)
    when 'objective' then quality_objective_deletion_verdict(p_id)
    when 'position'  then quality_position_deletion_verdict(p_id)
    when 'document'  then trazadoc_document_deletion_verdict(p_id)
    when 'process'   then quality_process_deletion_verdict(p_id)
  end;
end;
$$;
comment on function public.quality_deletion_eligibility(text, uuid) is
  'QUALITY-03.1 · Puede eliminarse este objeto, y si no, por que y que hacer en su lugar. QUALITY-03.1a: incluye process. Interfaz UNICA para la aplicacion; la logica sigue siendo la de cada dominio. Enmascara por completo lo ajeno.';
revoke all on function public.quality_deletion_eligibility(text, uuid) from public, anon;
grant execute on function public.quality_deletion_eligibility(text, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- §3 · LA PUERTA
--
-- El mismo disparador genérico de 0119 §2.6, que ya sabe leer un dictamen y
-- convertirlo en un mensaje. Se reemplaza para que conozca 'process'.
-- ----------------------------------------------------------------------------
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
    when 'process'   then quality_process_deletion_verdict(old.id)
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

create trigger quality_processes_guard_delete
  before delete on public.quality_processes
  for each row execute function public.quality_guard_hard_delete('process');


-- ----------------------------------------------------------------------------
-- §4 · LA POLÍTICA QUE FALTABA
--
-- Mismo conjunto de roles que ya crean y editan procesos. La política dice
-- QUIÉN puede intentarlo; el disparador dice SI se puede. Son preguntas
-- distintas y por eso hacen falta las dos: sin política nadie borra nada, y
-- sin disparador el borrado se llevaría por delante un mapa publicado.
-- ----------------------------------------------------------------------------
create policy quality_processes_delete on public.quality_processes
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']));

-- 0119 §2.7 retiró este privilegio porque no había política y el borrado
-- fallaba en silencio. Ahora la hay, así que se devuelve — acotado a esta
-- tabla y solo a DELETE.
grant delete on table public.quality_processes to authenticated;

comment on table public.quality_processes is
  'Proceso del SGC. QUALITY-03.1a: un proceso en BORRADOR, sin publicar y sin nada que dependa de el, puede eliminarse; en cuanto se publica, entra en un mapa publicado o algo lo referencia, se RETIRA en su lugar. La regla vive en quality_process_deletion_verdict y la aplica un disparador BEFORE DELETE.';
