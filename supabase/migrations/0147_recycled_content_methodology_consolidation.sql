-- ============================================================================
-- Trazaloop · 0147 · UNA SOLA METODOLOGÍA DE CONTENIDO RECICLADO
-- ----------------------------------------------------------------------------
-- LA DECISIÓN
--
-- Hasta aquí convivían dos motores de cálculo de contenido reciclado. La
-- convivencia se diseñó para no romper cálculos ya emitidos por empresas
-- reales. Esa razón resultó no existir: ninguna empresa real usa la
-- funcionalidad, Production sigue en 0111 y nunca recibió 0142–0146, y todo lo
-- calculado bajo la metodología anterior en Local y Staging son fixtures de
-- desarrollo y QA.
--
-- Mantener dos metodologías por compatibilidad con fixtures propios habría
-- sido pagar deuda de compatibilidad con nadie. Se consolida ahora, antes de
-- que exista tráfico, que es la única ventana en la que sale gratis.
--
--
-- QUÉ QUEDA
--
--     NUMERADOR    Σ consumo_real_i × φ_i
--     DENOMINADOR  Σ consumo_real_i
--
-- con las condiciones de evidencia, vigencia histórica, confirmación,
-- unidades, incompletitud y defendibilidad ya congeladas en PT-02A. Sin
-- composición manual.
--
--
-- CÓMO SE ELIGE EL ALGORITMO, QUE ES LA MITAD QUE FALLÓ
--
-- La función anterior resolvía su metodología con `where code = ... and
-- is_active`. Cuando 0144 desactivó la versión 1 y activó la 2, esa línea pasó
-- a devolver la 2: el motor antiguo siguió ejecutando su código pero
-- estampando el identificador y las reglas de una metodología que no era la
-- suya. Se comprobó en Local: 29 filas con `methodology_version = 1` apuntando
-- a la fila de la versión 2.
--
-- Ese fallo no es de una función concreta, es de la forma de elegir. `is_active`,
-- «la última» y `max(version)` son formas de que el algoritmo cambie sin que
-- nadie lo decida. Aquí se sustituye por un puntero explícito: una función que
-- nombra código y versión. Una futura v3 tendrá que cambiar esa función, y eso
-- es una decisión que se ve en una revisión de código.
--
--
-- LO QUE **NO** HACE
--
-- No borra datos. No toca migraciones históricas. No usa `drop … cascade`. La
-- limpieza de los fixtures QA de Staging va en un guion aparte
-- (`scripts/qa-consolidate-recycled.ts`) precisamente para que esta migración
-- sea segura en una base de Production que no los tiene.
-- ============================================================================


-- ============================================================================
-- 1 · LA METODOLOGÍA CANÓNICA, NOMBRADA
-- ----------------------------------------------------------------------------
-- Una función y no una constante en el código de cada motor: el puntero tiene
-- que estar en UN sitio, y tiene que poder comprobarse desde una prueba.
--
-- `stable` y no `immutable`: lee una tabla.
-- ============================================================================

create or replace function public.recycled_content_canonical_methodology()
returns public.calculation_methodologies
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v public.calculation_methodologies%rowtype;
begin
  -- Código y versión explícitos. NO `is_active`, NO `order by version desc`,
  -- NO `max(version)`: ninguna de las tres es una decisión, las tres son
  -- maneras de que el algoritmo cambie solo.
  select * into v
    from public.calculation_methodologies
   where code = 'RC-6632-15343' and version = 2;
  if not found then
    raise exception 'No existe la metodologia canonica de contenido reciclado (RC-6632-15343 v2)';
  end if;
  return v;
end;
$$;

comment on function public.recycled_content_canonical_methodology() is
  '0147 · El unico puntero a la metodologia de contenido reciclado. Resuelve por code+version explicitos: cambiar de algoritmo exige cambiar esta funcion, que es una decision visible en revision de codigo. Nunca por is_active ni por max(version).';

revoke all on function public.recycled_content_canonical_methodology() from public, anon;
grant execute on function public.recycled_content_canonical_methodology() to authenticated;


-- ============================================================================
-- 2 · EL ÚNICO MOTOR, APUNTANDO AL PUNTERO
-- ----------------------------------------------------------------------------
-- Se reescribe entera porque `create or replace function` no admite parches:
-- el cuerpo es el de 0144 con DOS cambios, ambos en la resolución de la
-- metodología. La fórmula, las reglas de φ, la evidencia, los incompletos y la
-- defendibilidad NO se tocan: están validadas en PT-02A y no hay motivo para
-- moverlas.
--
-- El nombre conserva el sufijo `_v2`. Renombrarla obligaría a cambiar el
-- cliente para no ganar nada: el sufijo nombra la versión de la METODOLOGÍA
-- que implementa, y esa sigue siendo la 2. Lo que desaparece es la otra.
-- ============================================================================

create or replace function public.calculate_recycled_content_v2(
  p_output_batch_id uuid,
  p_methodology_id  uuid default null
) returns public.recycled_content_calculations
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid       uuid := auth.uid();
  v_batch     record;
  v_meth      public.calculation_methodologies%rowtype;
  v_rules     jsonb;
  v_eligible  text[];
  v_same_ok   boolean;
  v_tol       numeric;
  v_salidas   integer;
  v_total     numeric := 0;
  v_recycled  numeric := 0;
  v_percent   numeric;
  v_comps     jsonb := '[]'::jsonb;
  v_reasons   text[] := '{}';
  v_warn      text[] := '{}';
  v_risk      boolean := false;
  v_level     text;
  v_row       public.recycled_content_calculations;
  c           record;
  v_efectiva  text;
  v_phi       numeric;
  v_motivo    text;
  v_base      text;
  v_ok_ev     boolean;
begin
  if v_uid is null then
    raise exception 'Se requiere una sesion activa para calcular contenido reciclado'
      using errcode = '42501';
  end if;

  select ob.id, ob.organization_id, ob.production_order_id, ob.product_id,
         ob.produced_quantity_kg, p.declared_recycled_percent
    into v_batch
  from public.output_batches ob
  left join public.products p on p.id = ob.product_id
  where ob.id = p_output_batch_id;
  if not found then
    raise exception 'El lote de salida no existe' using errcode = '23503';
  end if;

  if not public.is_org_member(v_batch.organization_id) then
    raise exception 'No eres miembro activo de la empresa de este lote' using errcode = '42501';
  end if;
  if not public.has_org_role(v_batch.organization_id, array['admin','quality','consultant']) then
    raise exception 'Tu rol no permite calcular contenido reciclado' using errcode = '42501';
  end if;

  -- 0147 · La metodologia NO se resuelve por is_active, ni por la ultima, ni
  -- por max(version). Se pide a la funcion canonica, que apunta a una fila
  -- concreta. Si manana entra una v3, esta funcion seguira ejecutando lo que
  -- dice ejecutar hasta que alguien decida lo contrario por escrito.
  v_meth := public.recycled_content_canonical_methodology();

  -- El argumento se conserva por compatibilidad de firma, pero deja de ser una
  -- via para elegir algoritmo: solo se admite la canonica. Antes aceptaba
  -- cualquier metodologia activa, que era la puerta por la que una v3 nueva
  -- habria cambiado el calculo sin que nadie lo decidiera.
  if p_methodology_id is not null and p_methodology_id <> v_meth.id then
    raise exception 'Solo se puede calcular con la metodologia canonica de contenido reciclado'
      using errcode = '22023';
  end if;

  v_rules := v_meth.rules;
  select coalesce(array_agg(x), '{}') into v_eligible
    from jsonb_array_elements_text(v_rules->'eligible_classifications') x;
  v_same_ok := coalesce((v_rules->>'same_process_counts')::boolean, false);
  v_tol     := coalesce((v_rules->>'mass_balance_tolerance_percent')::numeric, 5);

  -- ---------------------------------------------------------------------
  -- PT-H05 · Sin atribucion de consumos a lotes de salida, una orden con
  -- varias salidas no se puede repartir sin inventarselo.
  -- ---------------------------------------------------------------------
  select count(*) into v_salidas
    from public.output_batches
   where production_order_id = v_batch.production_order_id;

  if v_salidas > 1 then
    v_reasons := array_append(v_reasons, 'multiple_output_batches_without_allocation');
  end if;

  -- ---------------------------------------------------------------------
  -- Los consumos REALES de la orden. Esto es PT-F10: no se vuelve a pedir
  -- una composicion que el sistema ya conoce.
  -- ---------------------------------------------------------------------
  for c in
    select bc.mass_kg,
           ib.id           as input_batch_id,
           ib.batch_code,
           ib.received_date,
           ib.recycled_fraction,
           ib.recycled_fraction_basis,
           m.id            as material_id,
           m.name          as material_name,
           m.classification_code,
           m.reclassified_to_code,
           m.origin_support_evidence_id,
           m.reclassification_evidence_id,
           mc.never_counts
      from public.batch_consumption bc
      join public.input_batches ib on ib.id = bc.input_batch_id
      join public.materials m      on m.id = ib.material_id
      join public.material_classifications mc
        on mc.code = coalesce(m.reclassified_to_code, m.classification_code)
     where bc.production_order_id = v_batch.production_order_id
     order by ib.batch_code
  loop
    v_total    := v_total + c.mass_kg;
    v_efectiva := coalesce(c.reclassified_to_code, c.classification_code);
    v_phi      := null;
    v_motivo   := null;
    v_base     := null;

    if coalesce(c.never_counts, false) and not v_same_ok then
      -- Demostrable por el modelo: la metodologia dice que el mismo proceso
      -- no cuenta. Es un cero de REGLA, no un cero por desconocimiento.
      v_phi := 0; v_motivo := 'same_process_not_counted';

    elsif v_efectiva in ('virgin','additive','pigment','mineral_filler','masterbatch') then
      v_phi := 0; v_motivo := 'demonstrably_non_recycled';

    elsif v_efectiva = 'postindustrial' and c.reclassified_to_code is null then
      v_phi := 0; v_motivo := 'postindustrial_not_reclassified';

    elsif v_efectiva = 'other' then
      -- «other» no demuestra nada: ni que cuenta ni que no. PT-H02 prohibe
      -- resolverlo como cero.
      v_motivo := 'classification_other_not_demonstrable';
      v_reasons := array_append(v_reasons, 'classification_other:' || c.batch_code);

    elsif not (v_efectiva = any(v_eligible)) then
      v_phi := 0; v_motivo := 'not_eligible_classification';

    else
      -- Elegible. Ahora hacen falta DOS cosas: soporte aplicable y fraccion.
      v_ok_ev := false;

      -- (a) Vinculo CONFIRMADO al propio lote, con su instantanea historica.
      --     Es la evidencia fuerte: sabe contra que fecha se juzgo.
      select true into v_ok_ev
        from public.evidence_links el
       where el.organization_id = v_batch.organization_id
         and el.target_type = 'input_batch'
         and el.target_id   = c.input_batch_id
         and el.confirmed_at is not null
       limit 1;

      if coalesce(v_ok_ev, false) then
        v_base := 'input_batch_confirmed_link';
      else
        -- (b) Soporte a nivel de MATERIAL, que es la relacion de v1. Se
        --     acepta para no volver incompletos de golpe todos los calculos
        --     existentes, pero se juzga contra la fecha del lote y se DEJA
        --     ANOTADO que no tiene instantanea propia.
        perform 1
          from public.evidences e
         where e.id = coalesce(c.reclassification_evidence_id, c.origin_support_evidence_id)
           and e.organization_id = v_batch.organization_id
           and e.status = 'valid'
           and e.archived_at is null
           and (e.valid_until is null
                or c.received_date is null
                or e.valid_until >= c.received_date);
        if found then
          v_ok_ev := true;
          v_base  := 'material_support_no_snapshot';
        end if;
      end if;

      if not coalesce(v_ok_ev, false) then
        -- La falta de soporte NO demuestra que sea virgen. Demuestra que no
        -- se puede defender, y eso es incompleto, no cero.
        v_motivo := 'no_applicable_support';
        v_reasons := array_append(v_reasons, 'no_applicable_support:' || c.batch_code);

      elsif c.recycled_fraction is null then
        -- PT-H02 · La etiqueta binaria NO implica 100 %.
        v_motivo := 'recycled_fraction_not_declared';
        v_reasons := array_append(v_reasons, 'fraction_unknown:' || c.batch_code);

      else
        v_phi := c.recycled_fraction / 100.0;
        v_motivo := 'declared_fraction';
      end if;
    end if;

    if v_phi is not null then
      v_recycled := v_recycled + c.mass_kg * v_phi;
    end if;

    v_comps := v_comps || jsonb_build_object(
      'input_batch_id', c.input_batch_id,
      'input_batch_code', c.batch_code,
      'received_date', c.received_date,
      'material_id', c.material_id,
      'material_name', c.material_name,
      'consumed_kg', c.mass_kg,
      'classification_code', c.classification_code,
      'effective_classification', v_efectiva,
      'phi', v_phi,
      'phi_basis', v_motivo,
      'evidence_basis', v_base,
      'declared_fraction', c.recycled_fraction,
      'declared_fraction_basis', c.recycled_fraction_basis
    );
  end loop;

  -- El reproceso interno tambien es masa que entro en la orden. Con
  -- `same_process_counts = false` entra al denominador con phi = 0, que es lo
  -- mismo que hacia v1 a traves de la clasificacion `internal_same_process`.
  declare v_interno numeric;
  begin
    select coalesce(sum(obc.mass_kg), 0) into v_interno
      from public.output_batch_consumption obc
     where obc.production_order_id = v_batch.production_order_id;
    if v_interno > 0 then
      v_total := v_total + v_interno;
      if not v_same_ok then
        v_comps := v_comps || jsonb_build_object(
          'input_batch_id', null, 'input_batch_code', '(reproceso interno)',
          'consumed_kg', v_interno, 'phi', 0,
          'phi_basis', 'same_process_not_counted', 'evidence_basis', null
        );
      else
        v_reasons := array_append(v_reasons, 'internal_reprocess_phi_unknown');
      end if;
    end if;
  end;

  if v_total <= 0 then
    v_reasons := array_append(v_reasons, 'no_consumption_recorded');
  end if;

  -- ---------------------------------------------------------------------
  -- El resultado. Si falta cualquier pieza, NO hay numero.
  -- ---------------------------------------------------------------------
  if cardinality(v_reasons) > 0 then
    insert into public.recycled_content_calculations (
      organization_id, output_batch_id, methodology_id, methodology_rules_snapshot,
      methodology_version, result_state, incomplete_reasons,
      total_mass_kg, recycled_mass_kg, recycled_percent, declared_percent,
      risk_flag, defensibility_level, warnings, components, calculated_by
    ) values (
      v_batch.organization_id, p_output_batch_id, v_meth.id, v_rules,
      v_meth.version, 'incomplete', v_reasons,
      nullif(v_total, 0), null, null, v_batch.declared_recycled_percent,
      false, 'preliminary', '[]'::jsonb, v_comps, v_uid
    ) returning * into v_row;

    perform public.log_event(
      v_batch.organization_id, 'recycled_content_incomplete',
      jsonb_build_object('output_batch_id', p_output_batch_id,
                         'calculation_id', v_row.id, 'reasons', to_jsonb(v_reasons)),
      v_uid);
    return v_row;
  end if;

  v_percent := round(v_recycled / v_total * 100, 4);

  if v_batch.produced_quantity_kg is not null
     and abs(v_batch.produced_quantity_kg - v_total) > (v_tol / 100) * v_batch.produced_quantity_kg then
    -- v2 asume que la proporcion de lo que ENTRO es la de lo que SALIO. Un
    -- descuadre grande es justo la senal de que esa asuncion no se sostiene.
    v_warn := array_append(v_warn, 'produced_vs_consumed_out_of_tolerance');
  end if;
  if v_batch.declared_recycled_percent is not null
     and v_percent < v_batch.declared_recycled_percent then
    v_warn := array_append(v_warn, 'declared_above_calculated');
    v_risk := true;
  end if;

  v_level := case
    when array_length(v_warn, 1) is not null then 'with_warnings'
    when v_recycled = 0 then 'preliminary'
    else 'defensible' end;

  insert into public.recycled_content_calculations (
    organization_id, output_batch_id, methodology_id, methodology_rules_snapshot,
    methodology_version, result_state, incomplete_reasons,
    total_mass_kg, recycled_mass_kg, recycled_percent, declared_percent,
    risk_flag, defensibility_level, warnings, components, calculated_by
  ) values (
    v_batch.organization_id, p_output_batch_id, v_meth.id, v_rules,
    v_meth.version, 'calculated', '{}',
    v_total, v_recycled, v_percent, v_batch.declared_recycled_percent,
    v_risk, v_level, to_jsonb(v_warn), v_comps, v_uid
  ) returning * into v_row;

  perform public.log_event(
    v_batch.organization_id, 'recycled_content_calculated',
    jsonb_build_object('output_batch_id', p_output_batch_id, 'calculation_id', v_row.id,
                       'recycled_percent', v_percent, 'methodology_version', v_meth.version),
    v_uid);

  return v_row;
end;
$$;
comment on function public.calculate_recycled_content_v2(uuid, uuid) is
  '0147 · El UNICO motor de contenido reciclado. Resuelve la metodologia por recycled_content_canonical_methodology(); p_methodology_id se conserva por compatibilidad de firma pero solo admite la canonica.';

revoke all on function public.calculate_recycled_content_v2(uuid, uuid) from public, anon;
grant execute on function public.calculate_recycled_content_v2(uuid, uuid) to authenticated;


-- ============================================================================
-- 3 · NINGÚN CÁLCULO NUEVO PUEDE NACER DE OTRA METODOLOGÍA
-- ----------------------------------------------------------------------------
-- El motor ya apunta a la canónica, así que este guardián parece redundante. No
-- lo es: la tabla acepta INSERT de cualquiera con rol autorizado, y una fila
-- insertada a mano con la metodología antigua sería un cálculo que dice
-- apoyarse en reglas retiradas. El guardián convierte «solo hay un camino» de
-- promesa del código en propiedad de la base.
--
-- No es un CHECK porque necesita mirar otra tabla, y un CHECK no puede.
-- ============================================================================

create or replace function public.recycled_calc_canonical_methodology_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.methodology_id <> (public.recycled_content_canonical_methodology()).id then
    raise exception 'Solo se pueden registrar calculos con la metodologia canonica de contenido reciclado'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.recycled_calc_canonical_methodology_guard() is
  '0147 · Un calculo nuevo solo puede apuntar a la metodologia canonica. Las filas ya emitidas no se tocan: el guardian es BEFORE INSERT.';

drop trigger if exists t_recycled_calc_canonical_methodology on public.recycled_content_calculations;
create trigger t_recycled_calc_canonical_methodology
  before insert on public.recycled_content_calculations
  for each row execute function public.recycled_calc_canonical_methodology_guard();


-- ============================================================================
-- 4 · EL SEGUNDO MOTOR SE RETIRA
-- ----------------------------------------------------------------------------
-- `calculate_recycled_content` tenía `execute` concedido a `authenticated`:
-- cualquier sesión con rol admin, calidad o consultoría podía llamarla. Un
-- segundo motor ejecutable y escondido es exactamente lo que esta migración
-- viene a impedir, y revocarle el privilegio lo dejaría ahí, esperando a que
-- alguien se lo devolviera «temporalmente».
--
-- Se borra la FUNCIÓN, no los datos. Nada en la base la llamaba: ninguna vista
-- la referencia y ninguna otra función la invoca (se comprobó contra
-- `pg_get_viewdef` y `prosrc` antes de escribir esto). El literal
-- `calculate_recycled_content` que aparece en `v_implementation_next_actions`
-- es un CÓDIGO DE ACCIÓN, una cadena de texto, no una llamada.
--
-- Sin `cascade`: si algo dependiera de ella, este `drop` debe fallar y
-- decírnoslo, no arrastrarlo.
-- ============================================================================

drop function if exists public.calculate_recycled_content(uuid, uuid);


-- ============================================================================
-- 5 · LA COMPOSICIÓN MANUAL, DE SOLO LECTURA EN LA BASE
-- ----------------------------------------------------------------------------
-- PT-02A cerró el formulario, el importador y las tres acciones de servidor.
-- Eso cubre la aplicación; no cubre a un cliente que hable con PostgREST
-- directamente con una sesión válida, que es una ruta vieja perfectamente
-- transitable mientras existan las políticas de escritura.
--
-- La TABLA no se toca y las filas tampoco: `batch_composition` la leen seis
-- vistas —matriz de evidencias, balance de masa, completitud, preparación,
-- y los dos tableros de implantación— y varias sirven a otros dominios. Lo que
-- se retira es la capacidad de escribir.
-- ============================================================================

drop policy if exists batch_composition_insert on public.batch_composition;
drop policy if exists batch_composition_update on public.batch_composition;
drop policy if exists batch_composition_delete on public.batch_composition;

revoke insert, update, delete on public.batch_composition from anon, authenticated;

comment on table public.batch_composition is
  '0147 · SOLO LECTURA. La composicion manual era la entrada de la metodologia retirada; el calculo canonico sale de los consumos trazados de la orden. Se conservan tabla y filas porque seis vistas las leen y porque son el historico de los calculos ya emitidos. Sin politicas de escritura y sin privilegios de escritura: no queda ruta vieja.';


-- ============================================================================
-- 6 · LA FILA DE LA METODOLOGÍA RETIRADA
-- ----------------------------------------------------------------------------
-- Se borra SOLO si no queda ningún cálculo apuntándola. Es deliberado que la
-- condición mire los datos:
--
--   · En una base nueva —y así nacerá Production— no hay cálculos, la fila
--     desaparece y el catálogo queda con UNA metodología. Ese es el estado
--     final que §11 pide demostrar con una reejecución limpia.
--
--   · En una base con cálculos apuntándola, la fila se queda. Borrarla
--     rompería la clave foránea y dejaría cálculos huérfanos, que es peor que
--     una fila inerte: el guardián de §3 ya impide que nazca ninguno nuevo con
--     ella, y el motor que la ejecutaba ya no existe.
--
-- En Staging la limpieza de fixtures QA corre ANTES que esta migración, así
-- que allí también queda una sola.
-- ============================================================================

delete from public.calculation_methodologies m
 where m.code = 'RC-6632-15343'
   and m.version = 1
   and not exists (
     select 1 from public.recycled_content_calculations c
      where c.methodology_id = m.id
   );

comment on table public.calculation_methodologies is
  '0147 · Catalogo de metodologias. La de contenido reciclado tiene UNA sola operativa y se resuelve por recycled_content_canonical_methodology(), nunca por is_active. La fila de la version 1 se retiro; si alguna base conserva calculos que la apuntan, su fila sobrevive por integridad referencial y es inerte.';


-- ============================================================================
-- 6bis · EL DOSSIER TÉCNICO VOLVÍA COMPONENTES VACÍOS
-- ----------------------------------------------------------------------------
-- HALLAZGO, encontrado al dejar una sola metodología.
--
-- `v_calculation_component_rows` desarma el JSON de componentes del snapshot
-- para el dossier que lee un auditor y para el PDF. Estaba escrita contra la
-- forma que producía el motor retirado —`mass_kg`, `counted`,
-- `exclusion_reason`— y el motor vigente escribe otras claves: `consumed_kg`,
-- `phi`, `phi_basis`, `evidence_basis`.
--
-- Con las dos metodologías conviviendo no se notó, porque el dossier solo se
-- había ejercitado sobre snapshots antiguos. Con una sola, TODOS los dossiers
-- saldrían con la masa vacía, «¿cuenta?» en No y sin razón. Un documento de
-- auditoría en blanco es peor que uno que falta: parece correcto.
--
-- La vista pasa a entender las DOS formas. Las antiguas siguen leyéndose igual
-- —eso es lo que hace consultable el histórico— y las nuevas se leen por fin.
-- Las columnas nuevas van AL FINAL, que es lo único que `replace` admite.
-- ============================================================================

-- La cláusula `with` se REPITE aunque 0031 ya la pusiera: `create or replace
-- view` sin ella no conserva las opciones, las RESTABLECE. Omitirla convertía
-- esta vista en una fuga entre inquilinos, y la comprobación B5 del preflight
-- —que existe precisamente por haberlo sufrido en 0143/0144/0145— lo detectó
-- aquí antes de que llegara a ninguna base remota.
create or replace view public.v_calculation_component_rows
with (security_invoker = true) as
select
  c.organization_id,
  c.id                                                            as calculation_id,
  c.output_batch_id,
  comp.ord                                                        as component_index,
  nullif(comp.value ->> 'material_id', '')::uuid                  as material_id,
  comp.value ->> 'material_name'                                  as material_name,
  -- La masa: `mass_kg` en los snapshots antiguos, `consumed_kg` en los nuevos.
  case
    when coalesce(comp.value ->> 'mass_kg', comp.value ->> 'consumed_kg') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then coalesce(comp.value ->> 'mass_kg', comp.value ->> 'consumed_kg')::numeric
    else null::numeric
  end                                                             as mass_kg,
  comp.value ->> 'classification_code'                            as classification_code,
  comp.value ->> 'effective_classification'                       as effective_classification,
  -- Mismo proceso: una bandera antes, un motivo de phi ahora.
  coalesce((comp.value ->> 'is_same_process') = 'true',
           (comp.value ->> 'phi_basis') = 'same_process_not_counted',
           false)                                                 as is_same_process,
  nullif(comp.value ->> 'origin_support_evidence_id', '')::uuid   as origin_support_evidence_id,
  coalesce(comp.value ->> 'origin_support_status',
           comp.value ->> 'evidence_basis')                       as origin_support_status,
  nullif(comp.value ->> 'reclassification_evidence_id', '')::uuid as reclassification_evidence_id,
  comp.value ->> 'reclassification_support_status'                as reclassification_support_status,
  -- ¿Cuenta? Antes lo decía una bandera; ahora lo dice phi, que es el dato
  -- del que la bandera se deducía. Un phi de 0 NO cuenta, y un phi nulo
  -- tampoco: ese es el componente que dejó el cálculo incompleto.
  case
    when comp.value ? 'counted' then coalesce((comp.value ->> 'counted') = 'true', false)
    else coalesce((comp.value ->> 'phi')::numeric > 0, false)
  end                                                             as counted,
  coalesce(comp.value ->> 'exclusion_reason', comp.value ->> 'phi_basis') as exclusion_reason,
  coalesce(comp.value -> 'warning_codes', '[]'::jsonb)            as warning_codes,
  -- Lo nuevo, al final: la fracción reciclada es AHORA el dato central del
  -- cálculo y un dossier que no la enseñe no explica su propio número.
  case
    when (comp.value ->> 'phi') ~ '^-?[0-9]+(\.[0-9]+)?$' then (comp.value ->> 'phi')::numeric
    else null::numeric
  end                                                             as phi,
  comp.value ->> 'phi_basis'                                      as phi_basis,
  comp.value ->> 'input_batch_code'                               as input_batch_code,
  case
    when (comp.value ->> 'declared_fraction') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (comp.value ->> 'declared_fraction')::numeric
    else null::numeric
  end                                                             as declared_fraction,
  comp.value ->> 'declared_fraction_basis'                        as declared_fraction_basis
from public.recycled_content_calculations c
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(c.components) = 'array' then c.components else '[]'::jsonb end
) with ordinality comp(value, ord);

comment on view public.v_calculation_component_rows is
  '0147 · Desarma los componentes del snapshot para el dossier. Entiende la forma antigua (mass_kg/counted/exclusion_reason) y la vigente (consumed_kg/phi/phi_basis): sin esto, todo dossier nuevo salia con la masa vacia y «no cuenta» en cada fila.';


-- ============================================================================
-- 6ter · LA MATRIZ DE EVIDENCIAS BUSCABA LOS MATERIALES DONDE YA NO ESTÁN
-- ----------------------------------------------------------------------------
-- SEGUNDO HALLAZGO de la misma familia que el anterior.
--
-- `v_output_batch_evidence_matrix` respondía «¿qué evidencias sostienen este
-- lote?» y llegaba a los materiales por `batch_composition`. Es lo que tenía
-- sentido cuando la composición era la entrada del cálculo.
--
-- El cálculo vigente llega a los materiales por otro camino: orden → consumos
-- → lotes de entrada → materiales. Sin composición, los tres ramales de
-- materiales de la matriz no devolvían NADA: un lote perfectamente calculado
-- enseñaba una matriz de soporte vacía, que en una pantalla que se llama
-- «Soporte técnico» se lee como «no hay evidencias», no como «no sé buscarlas».
--
-- La solución no es cambiar la matriz a los consumos y ya: los lotes
-- históricos SÍ tienen su composición y su matriz debe seguir saliendo. Se
-- introduce una vista puente que responde «¿qué materiales tiene este lote?»
-- por los DOS caminos, y la matriz pregunta ahí.
-- ============================================================================

create or replace view public.v_output_batch_materials
with (security_invoker = true) as
-- Camino vigente: lo que la orden consumió realmente.
select distinct
  ob.organization_id,
  ob.id           as output_batch_id,
  ib.material_id,
  'consumption'::text as source
from public.output_batches ob
join public.batch_consumption bc on bc.production_order_id = ob.production_order_id
join public.input_batches ib     on ib.id = bc.input_batch_id
union
-- Camino histórico: la composición que se tecleó en su día. Se conserva para
-- que los lotes anteriores no pierdan su matriz de soporte.
select distinct
  bcmp.organization_id,
  bcmp.output_batch_id,
  bcmp.material_id,
  'composition'::text
from public.batch_composition bcmp;

comment on view public.v_output_batch_materials is
  '0147 · Que materiales tiene un lote producido, por los DOS caminos: los consumos de su orden (vigente) y la composicion registrada (historico). Existe para que la matriz de evidencias no se quede vacia en los lotes nuevos ni pierda los antiguos.';

revoke all on public.v_output_batch_materials from public, anon;
grant select on public.v_output_batch_materials to authenticated;


create or replace view public.v_output_batch_evidence_matrix
with (security_invoker = true) as
with base as (
  select
    ob.organization_id,
    ob.id                 as output_batch_id,
    ob.batch_code         as output_batch_code,
    ob.production_order_id,
    po.order_code,
    ob.product_id,
    p.code                as product_code,
    p.name                as product_name,
    p.family_id,
    pf.name               as family_name,
    l.calculation_id
  from public.output_batches ob
  left join public.production_orders po on po.id = ob.production_order_id
  left join public.products p           on p.id = ob.product_id
  left join public.product_families pf  on pf.id = p.family_id
  left join public.v_latest_batch_recycled l on l.output_batch_id = ob.id
),
routes as (
  -- Enlace directo al lote de salida.
  select b.*, el.evidence_id,
         'output_batch_support'::text as support_role,
         'output_batch'::text as linked_entity_type,
         b.output_batch_id as linked_entity_id,
         b.output_batch_code as linked_entity_label,
         false as is_required
  from base b
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'output_batch' and el.target_id = b.output_batch_id

  union all
  -- Enlace a la orden de producción.
  select b.*, el.evidence_id, 'production_order_support', 'production_order',
         b.production_order_id, b.order_code, false
  from base b
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'production_order' and el.target_id = b.production_order_id

  union all
  -- Enlaces a lotes de entrada consumidos por la orden.
  select b.*, el.evidence_id, 'input_batch_support', 'input_batch',
         ib.id, ib.batch_code, false
  from base b
  join public.batch_consumption bc on bc.production_order_id = b.production_order_id
  join public.input_batches ib     on ib.id = bc.input_batch_id
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'input_batch' and el.target_id = ib.id

  union all
  -- Enlaces a proveedores de los lotes de entrada consumidos.
  select b.*, el.evidence_id, 'supplier_support', 'supplier',
         s.id, s.name, false
  from base b
  join public.batch_consumption bc on bc.production_order_id = b.production_order_id
  join public.input_batches ib     on ib.id = bc.input_batch_id
  join public.suppliers s          on s.id = ib.supplier_id
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'supplier' and el.target_id = s.id

  union all
  -- Enlaces directos a materiales de la composición.
  select b.*, el.evidence_id, 'other_linked_support', 'material',
         mt.id, mt.name, false
  from base b
  join public.v_output_batch_materials bcmp on bcmp.output_batch_id = b.output_batch_id
  join public.materials mt           on mt.id = bcmp.material_id
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'material' and el.target_id = mt.id

  union all
  -- Enlace al producto.
  select b.*, el.evidence_id, 'product_support', 'product',
         b.product_id, coalesce(b.product_code || ' · ', '') || coalesce(b.product_name, ''), false
  from base b
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'product' and el.target_id = b.product_id

  union all
  -- Enlace a la familia del producto.
  select b.*, el.evidence_id, 'family_support', 'product_family',
         b.family_id, b.family_name, false
  from base b
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'product_family' and el.target_id = b.family_id

  union all
  -- Evidencia de ORIGEN de materiales de la composición (sin necesidad de
  -- evidence_link): requerida para defendibilidad.
  select b.*, mt.origin_support_evidence_id, 'material_origin_support', 'material',
         mt.id, mt.name, true
  from base b
  join public.v_output_batch_materials bcmp on bcmp.output_batch_id = b.output_batch_id
  join public.materials mt           on mt.id = bcmp.material_id
  where mt.origin_support_evidence_id is not null

  union all
  -- Evidencia de RECLASIFICACIÓN de materiales de la composición: requerida.
  select b.*, mt.reclassification_evidence_id, 'material_reclassification_support', 'material',
         mt.id, mt.name, true
  from base b
  join public.v_output_batch_materials bcmp on bcmp.output_batch_id = b.output_batch_id
  join public.materials mt           on mt.id = bcmp.material_id
  where mt.reclassification_evidence_id is not null
)
select distinct
  r.organization_id,
  r.output_batch_id,
  r.output_batch_code,
  r.calculation_id,
  e.id                 as evidence_id,
  null::text           as evidence_code,      -- no existe en el esquema actual
  e.name               as evidence_title,
  e.evidence_type,
  e.status::text       as evidence_status,
  r.linked_entity_type,
  r.linked_entity_id,
  r.linked_entity_label,
  r.support_role,
  r.is_required        as is_required_for_defensibility,
  (e.status = 'valid' and e.archived_at is null) as is_valid_for_defensibility,
  e.created_at,
  null::timestamptz    as validated_at,       -- no existe en el esquema actual
  -- (rev. 03.1–03.3.4) Columnas AL FINAL, sin romper callers: permiten a la
  -- UI explicar por qué una evidencia aceptada internamente no está vigente.
  e.archived_at,
  e.reviewed_at,
  e.reviewed_by
from routes r
join public.evidences e on e.id = r.evidence_id;

comment on view public.v_output_batch_evidence_matrix is
  '0147 · Misma matriz de 0106, con UN cambio: los materiales del lote se piden a v_output_batch_materials en vez de a batch_composition. Sin eso, todo lote calculado con la metodologia vigente enseñaba una matriz de soporte vacia.';


-- ============================================================================
-- 6quater · LAS BRECHAS DE SOPORTE HABLABAN UN IDIOMA QUE YA NADIE HABLA
-- ----------------------------------------------------------------------------
-- TERCER HALLAZGO de la misma familia. `v_output_batch_support_gaps` traduce
-- las razones de exclusión de cada componente en brechas accionables, y su
-- lista de razones era la del motor retirado. Con el vigente, un cálculo
-- INCOMPLETO no producía ninguna brecha: la pantalla de soporte técnico decía
-- que no faltaba nada sobre un lote que no había podido calcularse.
--
-- Y arrastraba la regla que P4 quitó de la interfaz: `traceability_status`
-- viene de 0104 y cuenta la composición manual como requisito, así que la
-- brecha «trazabilidad incompleta» habría saltado en TODOS los lotes nuevos.
-- La vista de 0104 no se toca —es histórica y hay que poder reproducir lo que
-- decía— pero aquí se le descuenta ese elemento, igual que hace la aplicación.
--
-- Las razones antiguas se conservan íntegras: los lotes con cálculos de la
-- metodología retirada siguen enseñando sus brechas con su vocabulario.
-- ============================================================================

create or replace view public.v_output_batch_support_gaps
with (security_invoker = true) as
with base as (
  select
    ob.organization_id,
    ob.id           as output_batch_id,
    ob.batch_code   as output_batch_code,
    l.calculation_id,
    l.defensibility_level,
    l.risk_flag,
    comp.traceability_status,
    comp.missing_items,
    comp.mass_balance_warning
  from public.output_batches ob
  left join public.v_latest_batch_recycled l on l.output_batch_id = ob.id
  left join public.v_output_batch_completeness comp on comp.output_batch_id = ob.id
)
-- 1 y 2: nivel de defendibilidad del último cálculo.
select b.organization_id, b.output_batch_id, b.output_batch_code, b.calculation_id,
  'calculation_preliminary'::text as gap_code, 'critical'::text as gap_severity,
  'Cálculo preliminar'::text as gap_label,
  'El último cálculo quedó en nivel preliminar: falta trazabilidad, consumo o toda la masa elegible quedó sin soporte.'::text as gap_description,
  'output_batch'::text as related_entity_type, b.output_batch_id as related_entity_id,
  b.output_batch_code as related_entity_label,
  'Completar asociación entre lote de salida, orden y consumos; cargar y validar soportes; recalcular después de corregir soportes.'::text as suggested_action
from base b where b.defensibility_level = 'preliminary'

union all
select b.organization_id, b.output_batch_id, b.output_batch_code, b.calculation_id,
  'calculation_with_warnings', 'warning', 'Cálculo con advertencias',
  'El último cálculo es válido pero tiene advertencias que debilitan su defendibilidad.',
  'output_batch', b.output_batch_id, b.output_batch_code,
  'Revisar las advertencias del cálculo y recalcular después de corregir soportes.'
from base b where b.defensibility_level = 'with_warnings'

-- 3: riesgo por declarado > calculado.
union all
select b.organization_id, b.output_batch_id, b.output_batch_code, b.calculation_id,
  'declared_above_calculated', 'critical', 'Declarado por encima del calculado',
  'El porcentaje declarado del producto supera al calculado: la declaración no está soportada por el cálculo.',
  'output_batch', b.output_batch_id, b.output_batch_code,
  'Revisar el porcentaje declarado del producto o corregir soportes y recalcular.'
from base b where b.risk_flag = true

-- 4 a 7: brechas por componente del último cálculo.
union all
select b.organization_id, b.output_batch_id, b.output_batch_code, b.calculation_id,
  cr.exclusion_reason,
  case cr.exclusion_reason
    when 'missing_origin_support' then 'critical'
    when 'invalid_reclassification_support' then 'critical'
    when 'no_applicable_support' then 'critical'
    else 'warning'
  end,
  case cr.exclusion_reason
    when 'missing_origin_support' then 'Material elegible sin evidencia de origen'
    when 'origin_support_not_valid' then 'Evidencia de origen sin validar'
    when 'postindustrial_not_reclassified' then 'Postindustrial sin reclasificar'
    when 'invalid_reclassification_support' then 'Reclasificación sin soporte completo'
    when 'no_applicable_support' then 'Material elegible sin soporte aplicable'
    when 'recycled_fraction_not_declared' then 'Lote de entrada sin fracción reciclada declarada'
    when 'classification_other_not_demonstrable' then 'Clasificación «otro»: no demuestra nada'
  end,
  case cr.exclusion_reason
    when 'missing_origin_support' then 'El material es elegible pero no tiene evidencia de soporte de origen asociada; su masa quedó fuera del numerador.'
    when 'origin_support_not_valid' then 'La evidencia de origen existe pero no está en estado válido; la masa quedó fuera del numerador.'
    when 'postindustrial_not_reclassified' then 'El material postindustrial no cuenta como reciclado sin una reclasificación soportada.'
    when 'invalid_reclassification_support' then 'La reclasificación no tiene justificación, evidencia válida o autor autorizado.'
    when 'no_applicable_support' then 'El material es elegible pero no hay soporte aplicable en la fecha del lote: su masa no se pudo defender y el cálculo quedó incompleto.'
    when 'recycled_fraction_not_declared' then 'El lote de entrada no declara qué fracción suya es reciclada. Una clasificación elegible no implica el 100 %.'
    when 'classification_other_not_demonstrable' then 'La clasificación «otro» no demuestra ni que el material cuenta ni que no cuenta.'
  end,
  'material', cr.material_id, cr.material_name,
  case cr.exclusion_reason
    when 'missing_origin_support' then 'Cargar evidencia de origen y validarla; recalcular después de corregir soportes.'
    when 'origin_support_not_valid' then 'Validar la evidencia de origen (admin o calidad) y recalcular.'
    when 'postindustrial_not_reclassified' then 'Revisar clasificación del material y, si procede, reclasificar con justificación y evidencia.'
    when 'invalid_reclassification_support' then 'Completar justificación y evidencia válida de la reclasificación y recalcular.'
    when 'no_applicable_support' then 'Confirmar una evidencia aplicable al lote de entrada, o asociar y validar el soporte de origen del material, y recalcular.'
    when 'recycled_fraction_not_declared' then 'Declarar la fracción reciclada del lote de entrada y en qué se apoya, y recalcular.'
    when 'classification_other_not_demonstrable' then 'Clasificar el material con una categoría que se pueda sostener y recalcular.'
  end
from base b
join public.v_calculation_component_rows cr on cr.calculation_id = b.calculation_id
where cr.exclusion_reason in (
  'missing_origin_support', 'origin_support_not_valid',
  'postindustrial_not_reclassified', 'invalid_reclassification_support',
  -- 0147 · El vocabulario del motor vigente. Sin estos tres, un calculo
  -- incompleto no producia NINGUNA brecha: la pantalla de soporte tecnico
  -- decia que no faltaba nada sobre un lote que no habia podido calcularse.
  'no_applicable_support', 'recycled_fraction_not_declared',
  'classification_other_not_demonstrable'
)

-- 8: balance de masa fuera de tolerancia (estado actual de la cadena).
union all
select b.organization_id, b.output_batch_id, b.output_batch_code, b.calculation_id,
  'mass_balance_out_of_tolerance', 'warning', 'Balance de masa fuera de tolerancia',
  'La masa consumida y la cantidad producida difieren más de la tolerancia.',
  'output_batch', b.output_batch_id, b.output_batch_code,
  'Revisar balance entre masa consumida, composición y cantidad producida.'
from base b where b.mass_balance_warning = true

-- 9: trazabilidad incompleta.
union all
select b.organization_id, b.output_batch_id, b.output_batch_code, b.calculation_id,
  'traceability_incomplete', 'warning', 'Trazabilidad incompleta',
  'Falta orden, consumo o informacion de proveedor/material en la cadena del lote.',
  'output_batch', b.output_batch_id, b.output_batch_code,
  'Completar asociación entre lote de salida, orden y consumos.'
-- 0147 · `traceability_status` viene de 0104 y cuenta la composicion manual
-- como un requisito. Ya no lo es, y sin descontarla esta brecha saltaria en
-- TODOS los lotes nuevos: la pantalla de soporte tecnico volveria a decir
-- «trazabilidad incompleta» sobre lotes que calculan perfectamente. La vista
-- de 0104 no se toca; se le descuenta el elemento aqui.
from base b
where b.traceability_status = 'incomplete'
  and cardinality(
        array_remove(coalesce(b.missing_items, '{}'), 'composición del lote')
      ) > 0

-- 10: lote sin cálculo.
union all
select b.organization_id, b.output_batch_id, b.output_batch_code, null::uuid,
  'no_calculation', 'info', 'Lote sin cálculo',
  'El lote de salida aún no tiene un cálculo de contenido reciclado.',
  'output_batch', b.output_batch_id, b.output_batch_code,
  'Registrar los consumos de la orden si faltan y calcular el contenido reciclado del lote.'
from base b where b.calculation_id is null;


comment on view public.v_output_batch_support_gaps is
  '0147 · Brechas de soporte de 0031, con el vocabulario del motor vigente añadido (no_applicable_support, recycled_fraction_not_declared, classification_other_not_demonstrable) y sin contar la composicion manual como trazabilidad incompleta. El vocabulario antiguo se conserva para los calculos historicos.';


-- ============================================================================
-- 7 · REVERSIÓN
-- ----------------------------------------------------------------------------
--   drop trigger if exists t_recycled_calc_canonical_methodology on public.recycled_content_calculations;
--   drop function if exists public.recycled_calc_canonical_methodology_guard();
--   create policy batch_composition_insert on public.batch_composition
--     for insert to authenticated with check (public.is_org_member(organization_id));
--   create policy batch_composition_update on public.batch_composition
--     for update to authenticated using (public.is_org_member(organization_id));
--   create policy batch_composition_delete on public.batch_composition
--     for delete to authenticated using (public.has_org_role(organization_id, array['admin','quality']));
--   grant insert, update, delete on public.batch_composition to authenticated;
--   -- y volver a crear public.calculate_recycled_content(uuid, uuid) desde 0106,
--   -- que es donde esta su ultima definicion completa.
--   drop function if exists public.recycled_content_canonical_methodology();
--
-- La fila de la metodologia version 1 NO se puede reponer con su identificador
-- original: se genera nuevo. Es la parte irreversible, y por eso solo se borra
-- cuando nadie la apunta.
-- ============================================================================
