-- 0072_textile_diagnostic_hardening.sql
-- Trazaloop · Sprint T2.1 (Textil) · Hardening del diagnóstico textil.
--
-- PROBLEMA (auditoría de 0071): la política textile_diagnostics_update
-- permitía a CUALQUIER miembro autenticado de la organización actualizar
-- directamente (vía API de Supabase) los campos CALCULADOS de su
-- diagnóstico en progreso: status → 'completed', maturity_percent,
-- maturity_level, dimension_scores, critical_gaps y completed_at — es
-- decir, autofinalizarse con resultados fabricados. Además, la política de
-- INSERT permitía crear un diagnóstico ya "completado" con valores
-- arbitrarios (el trigger lock_completed_diagnostic solo protege filas que
-- YA estaban completadas).
--
-- SOLUCIÓN (patrón del proyecto, como change_organization_plan en 0053):
--   1. SIN update directo de clientes sobre textile_diagnostics: la
--      política de UPDATE se elimina (deny-by-default). El único camino de
--      finalización es la RPC SECURITY DEFINER finalize_textile_diagnostic,
--      que valida TODO en servidor y CALCULA el resultado en SQL espejando
--      la función pura de lib/domain/textiles-diagnostic.ts (misma escala,
--      misma regla de contexto TQ49, mismos topes por críticas, mismos
--      umbrales de nivel). El cliente no aporta ningún valor calculado.
--   2. INSERT endurecido: solo diagnósticos NUEVOS en estado inicial y con
--      started_by = auth.uid(); imposible "nacer finalizado".
--   3. Trigger de protección de campos calculados: incluso roles que
--      bypasean RLS (service_role) no pueden tocar status/resultados salvo
--      dentro de la RPC (bandera transaccional set_config, no accesible
--      por la API de PostgREST).
--   4. Respuestas: trigger de validación (pregunta activa; "No aplica"
--      prohibido donde allows_na = false) + trigger de bloqueo total
--      cuando el diagnóstico está finalizado (defensa en profundidad
--      sobre las políticas de 0071, que ya exigen 'in_progress').
--   5. finalized_by: queda registrado quién finalizó. completed_at ES la
--      fecha de finalización (no se duplica con un finalized_at).
--   6. Sin reapertura: un diagnóstico finalizado es histórico inmutable;
--      para actualizar la evaluación se inicia un diagnóstico nuevo.
--
-- Aditiva e idempotente donde aplica; CERO cambios a objetos CPR, planes,
-- TrazaDocs, catálogos o acceso por módulo; no modifica migraciones
-- anteriores.

-- ---------------------------------------------------------------------------
-- 1. Columna mínima nueva: quién finalizó (trazabilidad del histórico)
-- ---------------------------------------------------------------------------
alter table public.textile_diagnostics
  add column if not exists finalized_by uuid references public.profiles (id);

comment on column public.textile_diagnostics.finalized_by is
  'Usuario que finalizó el diagnóstico (lo escribe SOLO la RPC finalize_textile_diagnostic). completed_at es la fecha de finalización.';

-- ---------------------------------------------------------------------------
-- 2. RLS de textile_diagnostics: sin UPDATE directo; INSERT solo "en cero"
-- ---------------------------------------------------------------------------
-- Se elimina el UPDATE de clientes: ningún campo de esta tabla es editable
-- por la API. La finalización va por RPC; no existe otra mutación legítima.
drop policy if exists textile_diagnostics_update on public.textile_diagnostics;

-- INSERT endurecido: un diagnóstico solo puede nacer en progreso, vacío de
-- resultados y a nombre del usuario autenticado de la propia empresa.
drop policy if exists textile_diagnostics_insert on public.textile_diagnostics;
create policy textile_diagnostics_insert on public.textile_diagnostics
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and started_by = auth.uid()
    and status = 'in_progress'
    and maturity_percent is null
    and maturity_level is null
    and critical_gaps = 0
    and dimension_scores = '{}'::jsonb
    and completed_at is null
    and finalized_by is null
  );

-- (SELECT y DELETE de 0071 se conservan: lectura por miembros; descarte de
--  borradores solo admin/quality y solo 'in_progress'. Un finalizado además
--  está protegido por lock_completed_diagnostic.)

-- ---------------------------------------------------------------------------
-- 3. Protección de campos calculados (defensa en profundidad, todos los roles)
-- ---------------------------------------------------------------------------
-- Solo la RPC de finalización (que fija la bandera transaccional
-- trazaloop.textile_diag_finalize) puede modificar status, resultados,
-- completed_at o finalized_by. set_config/current_setting no están
-- expuestos por la API de Supabase, y la bandera muere con la transacción.
create or replace function public.protect_textile_diagnostic_calculated_fields()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('trazaloop.textile_diag_finalize', true), '') = '1' then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.maturity_percent is distinct from old.maturity_percent
     or new.maturity_level is distinct from old.maturity_level
     or new.critical_gaps is distinct from old.critical_gaps
     or new.dimension_scores is distinct from old.dimension_scores
     or new.completed_at is distinct from old.completed_at
     or new.finalized_by is distinct from old.finalized_by
     or new.started_by is distinct from old.started_by
     or new.started_at is distinct from old.started_at then
    raise exception
      'Los campos calculados y de estado del diagnóstico textil solo se modifican mediante finalize_textile_diagnostic';
  end if;
  return new;
end;
$$;
revoke execute on function public.protect_textile_diagnostic_calculated_fields() from public, anon, authenticated;

drop trigger if exists t_textile_diagnostics_protect_calculated on public.textile_diagnostics;
create trigger t_textile_diagnostics_protect_calculated
  before update on public.textile_diagnostics
  for each row execute function public.protect_textile_diagnostic_calculated_fields();

-- ---------------------------------------------------------------------------
-- 4. Validación de respuestas en base de datos
-- ---------------------------------------------------------------------------
-- Refuerza en BD lo que la server action ya valida: la pregunta debe estar
-- activa y "No aplica" está prohibido donde allows_na = false (críticas
-- TQ01, TQ06, TQ12, TQ18, TQ23 y TQ56). La regla contextual TQ49→TQ50-52
-- NO se impone al escribir (una fila no puede validar consistencia entre
-- filas sin carreras): se resuelve de forma determinista al calcular — la
-- RPC y lib/domain tratan TQ50-52 como No aplica si TQ49 = no, sin importar
-- lo guardado, así que valores inconsistentes no manipulan el resultado.
create or replace function public.validate_textile_diagnostic_answer()
returns trigger
language plpgsql
as $$
declare
  v_allows_na boolean;
  v_is_active boolean;
begin
  select q.allows_na, q.is_active
    into v_allows_na, v_is_active
    from public.textile_diagnostic_questions q
   where q.id = new.question_id;

  if v_is_active is distinct from true then
    raise exception 'La pregunta no está activa en el diagnóstico textil';
  end if;

  if new.answer = 'not_applicable' and not v_allows_na then
    raise exception 'Esta pregunta no admite "No aplica": responde Sí, Parcial o No';
  end if;

  return new;
end;
$$;
revoke execute on function public.validate_textile_diagnostic_answer() from public, anon, authenticated;

drop trigger if exists t_textile_diagnostic_answers_validate on public.textile_diagnostic_answers;
create trigger t_textile_diagnostic_answers_validate
  before insert or update on public.textile_diagnostic_answers
  for each row execute function public.validate_textile_diagnostic_answer();

-- ---------------------------------------------------------------------------
-- 5. Respuestas de un diagnóstico finalizado: inmutables para TODOS los roles
-- ---------------------------------------------------------------------------
-- Las políticas de 0071 ya exigen diagnóstico 'in_progress' para escribir;
-- este trigger extiende la garantía a cualquier rol (incluido service_role,
-- que bypasea RLS pero no triggers). El CASCADE de borrar un borrador sigue
-- funcionando: al borrarse el padre primero, la subconsulta no lo encuentra.
create or replace function public.lock_finalized_textile_diagnostic_answers()
returns trigger
language plpgsql
as $$
declare
  v_diagnostic_id uuid;
begin
  v_diagnostic_id := coalesce(new.diagnostic_id, old.diagnostic_id);
  if exists (
    select 1 from public.textile_diagnostics d
    where d.id = v_diagnostic_id and d.status = 'completed'
  ) then
    raise exception 'Las respuestas de un diagnóstico textil finalizado son históricas y no pueden modificarse';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.lock_finalized_textile_diagnostic_answers() from public, anon, authenticated;

drop trigger if exists t_textile_diagnostic_answers_lock_finalized on public.textile_diagnostic_answers;
create trigger t_textile_diagnostic_answers_lock_finalized
  before insert or update or delete on public.textile_diagnostic_answers
  for each row execute function public.lock_finalized_textile_diagnostic_answers();

-- ---------------------------------------------------------------------------
-- 6. RPC de finalización controlada
-- ---------------------------------------------------------------------------
-- ÚNICO camino para finalizar. Valida identidad, membresía, habilitación
-- del módulo, propiedad y estado; verifica completitud y "No aplica"
-- inválidos; CALCULA el resultado en SQL (espejo determinista de
-- lib/domain/textiles-diagnostic.ts):
--   * escala: yes = 1.0 · partial = 0.5 · no = 0.0 · not_applicable fuera
--     del denominador;
--   * contexto: si la pregunta is_context de una dimensión respondió
--     'no'/'not_applicable', las demás de esa dimensión cuentan como No
--     aplica; la pregunta de contexto jamás puntúa;
--   * dimensión = Σ(valor×peso)/Σ(peso aplicable)×100 (redondeo a 4
--     decimales); sin aplicables → dimensión No aplica (fuera del global);
--   * crítica en 'no' (efectiva) → dimensión limitada a 49 y nivel global
--     limitado a 'basico';
--   * global = Σ(dimensión×peso_dimensión)/Σ(pesos aplicables);
--   * niveles: >=85 preparado · >=70 avanzado · >=50 intermedio ·
--     >=25 basico · resto inicial.
-- El feature flag TEXTILES_MODULE_ENABLED es de entorno de la aplicación y
-- lo exige la server action (la BD no conoce el entorno); la habilitación
-- por organización SÍ se re-verifica aquí.
create or replace function public.finalize_textile_diagnostic(p_diagnostic_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_org uuid;
  v_status text;
  v_missing integer;
  v_invalid_na integer;
  v_critical_gaps integer := 0;
  v_dimension_scores jsonb := '{}'::jsonb;
  v_global_weight numeric := 0;
  v_global_score numeric := 0;
  v_percent numeric;
  v_level text;
  r record;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Sesión no válida';
  end if;

  select organization_id, status into v_org, v_status
    from textile_diagnostics where id = p_diagnostic_id;

  if v_org is null or not is_org_member(v_org) then
    -- Mismo mensaje si no existe o es de otra empresa: sin filtración cross-tenant.
    raise exception 'El diagnóstico no existe o no pertenece a tu organización';
  end if;

  if not exists (
    select 1 from organization_modules om
    where om.organization_id = v_org and om.module_code = 'textiles' and om.enabled
  ) then
    raise exception 'El módulo Trazaloop Textil no está habilitado para esta organización';
  end if;

  if v_status <> 'in_progress' then
    raise exception 'El diagnóstico no está en borrador: un diagnóstico finalizado es histórico';
  end if;

  -- Completitud: TODAS las preguntas activas respondidas.
  select count(*) into v_missing
    from textile_diagnostic_questions q
   where q.is_active
     and not exists (
       select 1 from textile_diagnostic_answers a
       where a.diagnostic_id = p_diagnostic_id and a.question_id = q.id
     );
  if v_missing > 0 then
    raise exception 'Faltan % pregunta(s) por responder', v_missing;
  end if;

  -- "No aplica" guardado donde no se admite (doble cinturón sobre el trigger).
  select count(*) into v_invalid_na
    from textile_diagnostic_answers a
    join textile_diagnostic_questions q on q.id = a.question_id
   where a.diagnostic_id = p_diagnostic_id
     and a.answer = 'not_applicable'
     and not q.allows_na;
  if v_invalid_na > 0 then
    raise exception 'Hay % respuesta(s) "No aplica" en preguntas que no lo admiten', v_invalid_na;
  end if;

  -- Cálculo por dimensión con respuestas EFECTIVAS (regla de contexto).
  for r in
    with ctx_off as (
      select q.section_id
        from textile_diagnostic_questions q
        join textile_diagnostic_answers a
          on a.question_id = q.id and a.diagnostic_id = p_diagnostic_id
       where q.is_active and q.is_context
         and a.answer in ('no', 'not_applicable')
    ),
    effective as (
      select
        q.section_id,
        q.weight,
        q.is_critical,
        q.is_context,
        case
          when not q.is_context and q.section_id in (select section_id from ctx_off)
            then 'not_applicable'
          else a.answer
        end as answer
      from textile_diagnostic_questions q
      join textile_diagnostic_answers a
        on a.question_id = q.id and a.diagnostic_id = p_diagnostic_id
      where q.is_active
    )
    select
      s.code,
      s.weight as section_weight,
      count(*) filter (where not e.is_context) as total_count,
      count(*) filter (where not e.is_context and e.answer <> 'not_applicable') as applicable_count,
      coalesce(sum(e.weight) filter (where not e.is_context and e.answer <> 'not_applicable'), 0) as applicable_weight,
      coalesce(sum(
        case e.answer when 'yes' then e.weight when 'partial' then e.weight * 0.5 else 0 end
      ) filter (where not e.is_context and e.answer <> 'not_applicable'), 0) as score_weight,
      bool_or(e.is_critical and e.answer = 'no' and not e.is_context) as has_critical_no,
      count(*) filter (where e.is_critical and e.answer = 'no' and not e.is_context) as critical_no_count
    from textile_diagnostic_sections s
    join effective e on e.section_id = s.id
    group by s.id, s.code, s.weight
    order by s.order_index
  loop
    if r.applicable_weight <= 0 then
      v_dimension_scores := v_dimension_scores || jsonb_build_object(
        r.code, jsonb_build_object(
          'percent', null,
          'cappedByCritical', false,
          'applicableCount', r.applicable_count,
          'totalCount', r.total_count
        )
      );
    else
      declare
        v_raw numeric := round((r.score_weight / r.applicable_weight) * 100, 4);
        v_capped boolean := coalesce(r.has_critical_no, false) and round((r.score_weight / r.applicable_weight) * 100, 4) > 49;
        v_dim numeric;
      begin
        v_dim := case when v_capped then 49 else v_raw end;
        v_dimension_scores := v_dimension_scores || jsonb_build_object(
          r.code, jsonb_build_object(
            'percent', v_dim,
            'cappedByCritical', v_capped,
            'applicableCount', r.applicable_count,
            'totalCount', r.total_count
          )
        );
        v_global_weight := v_global_weight + r.section_weight;
        v_global_score := v_global_score + (v_dim * r.section_weight);
      end;
    end if;
    v_critical_gaps := v_critical_gaps + coalesce(r.critical_no_count, 0);
  end loop;

  v_percent := case when v_global_weight > 0 then round(v_global_score / v_global_weight, 4) else 0 end;

  v_level := case
    when v_percent >= 85 then 'preparado'
    when v_percent >= 70 then 'avanzado'
    when v_percent >= 50 then 'intermedio'
    when v_percent >= 25 then 'basico'
    else 'inicial'
  end;
  -- Tope de nivel por brechas críticas: nunca por encima de 'basico'.
  if v_critical_gaps > 0 and v_level in ('intermedio', 'avanzado', 'preparado') then
    v_level := 'basico';
  end if;

  -- Única escritura legítima de los campos protegidos (bandera transaccional).
  perform set_config('trazaloop.textile_diag_finalize', '1', true);

  update textile_diagnostics
     set status = 'completed',
         maturity_percent = v_percent,
         maturity_level = v_level,
         critical_gaps = v_critical_gaps,
         dimension_scores = v_dimension_scores,
         completed_at = now(),
         finalized_by = v_user
   where id = p_diagnostic_id
     and organization_id = v_org
     and status = 'in_progress';

  return jsonb_build_object(
    'maturity_percent', v_percent,
    'maturity_level', v_level,
    'critical_gaps', v_critical_gaps,
    'dimension_scores', v_dimension_scores
  );
end;
$$;

revoke execute on function public.finalize_textile_diagnostic(uuid) from public, anon;
grant execute on function public.finalize_textile_diagnostic(uuid) to authenticated;
