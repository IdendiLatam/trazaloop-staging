-- ============================================================================
-- Trazaloop · PCR/TEXTILES PRE-INTEGRATION · PT-02A
-- EL PORCENTAJE SALE DE LO QUE SE CONSUMIÓ, Y SE CALLA CUANDO NO LO SABE
-- ----------------------------------------------------------------------------
-- DE DÓNDE VENIMOS
--
-- `calculate_recycled_content` (v1) divide la masa reciclada entre la masa
-- TOTAL DE COMPOSICIÓN, y esa composición —`batch_composition.mass_kg`— se
-- teclea a mano lote de salida por lote de salida. Es decir: el sistema ya
-- sabe qué se consumió, y aun así le vuelve a preguntar a la persona qué
-- había dentro. PT-F10 lo prohíbe.
--
-- Y hay dos cosas más que v1 hace y que este sprint decide no seguir haciendo:
--
--   · Cuenta un material elegible como reciclado AL 100 %. La clasificación
--     es una etiqueta binaria: `postconsumer_valid` significa «es de esa
--     clase», no «es reciclado del todo». PT-H02 lo dice sin rodeos: no
--     inferir 100 % de una etiqueta binaria.
--
--   · Excluye la masa sin soporte y sigue dando un número. Eso no infla —el
--     porcentaje baja— pero afirma con precisión algo que no puede defender.
--
--
-- LAS TRES DECISIONES HUMANAS QUE ESTA MIGRACIÓN OBEDECE
--
--   PT-H01 · El pasado no se reescribe. `forbid_mutation` ya lo garantiza y
--            no se toca: v2 INSERTA una fila nueva, jamás edita una vieja.
--
--   PT-H02 · φ tiene que ser demostrable. Cero solo cuando el modelo lo
--            demuestra; uno solo con dato cuantitativo explícito; y si no se
--            sabe, `CALCULATION_INCOMPLETE`.
--
--   PT-H03 · v1 queda intacta y sigue siendo reproducible. Cada cálculo
--            guarda su `methodology_rules_snapshot`, así que un cálculo de
--            2026 se explica con las reglas de 2026 para siempre.
--
--
-- LA CONSECUENCIA QUE HAY QUE DECIR EN VOZ ALTA
--
-- v2 devolverá `incomplete` MUCHO más a menudo de lo que v1 devuelve un
-- número, y seguirá haciéndolo hasta que las empresas declaren la fracción
-- reciclada de sus lotes. Eso no es un defecto de la implementación: es lo
-- que se pidió. Un porcentaje que no se puede defender no es un porcentaje
-- más flojo, es una afirmación sin respaldo.
-- ============================================================================


-- ============================================================================
-- 1 · PT-H05 · A QUÉ NIVEL SE PUEDE CALCULAR, Y POR QUÉ
-- ----------------------------------------------------------------------------
-- La pregunta era si todos los lotes de salida de una orden son particiones
-- HOMOGÉNEAS de la misma mezcla. Se inspeccionó el esquema, no se supuso:
--
--   · `batch_consumption` apunta a (production_order_id, input_batch_id). NO
--     existe ninguna columna que ate un consumo a un lote de salida concreto.
--     El sistema no registra —ni puede registrar hoy— qué entrada fue a qué
--     salida.
--
--   · `batch_composition` es POR LOTE DE SALIDA y nada obliga a que dos lotes
--     de la misma orden declaren la misma composición. Se puede registrar una
--     orden con dos salidas de composición distinta y la base lo acepta.
--
--   · `v_traceability_backward` ya atribuye TODOS los consumos de la orden a
--     CADA lote de salida. Es decir: el modelo actual ya ASUME homogeneidad,
--     pero no la exige en ningún sitio.
--
-- VEREDICTO: CASO B. La invariancia no está garantizada por dominio ni por
-- esquema. Por tanto NO se prorratea.
--
--   · Orden con UN lote de salida  → la partición es el todo. Se calcula.
--   · Orden con VARIOS             → `incomplete`, motivo
--                                    `multiple_output_batches_without_allocation`.
--
-- El dato que faltaría para resolverlo es concreto y se deja escrito: la
-- atribución de cada consumo a cada lote de salida. Mientras no exista,
-- repartir por cantidad producida sería inventarse la mezcla.
-- ============================================================================


-- ============================================================================
-- 2 · LA FRACCIÓN VIVE EN EL LOTE, NO EN EL MATERIAL
-- ----------------------------------------------------------------------------
-- Un mismo proveedor entrega en marzo un lote al 60 % y en julio otro al
-- 45 %. La fracción es una propiedad de LO QUE LLEGÓ, y la evidencia que la
-- sostiene es la de ese lote, no la del catálogo.
--
-- Nullable a propósito: un lote sin fracción declarada es el estado normal
-- hoy, y hay que poder representarlo sin fingir un número.
-- ============================================================================

alter table public.input_batches
  add column if not exists recycled_fraction numeric,
  add column if not exists recycled_fraction_basis text;

alter table public.input_batches
  drop constraint if exists input_batches_recycled_fraction_range;
alter table public.input_batches
  add constraint input_batches_recycled_fraction_range check (
    recycled_fraction is null
    or (recycled_fraction >= 0 and recycled_fraction <= 100)
  );

alter table public.input_batches
  drop constraint if exists input_batches_recycled_fraction_basis;
alter table public.input_batches
  add constraint input_batches_recycled_fraction_basis check (
    recycled_fraction is null
    or length(btrim(coalesce(recycled_fraction_basis, ''))) > 0
  );

comment on column public.input_batches.recycled_fraction is
  'PT-02A · Porcentaje reciclado DE ESTE LOTE (0-100). NULL = no declarada, que es el estado normal y NO significa cero: un calculo sobre un lote elegible sin fraccion sale incomplete (PT-H02).';
comment on column public.input_batches.recycled_fraction_basis is
  'PT-02A · En que se apoya la fraccion declarada. Obligatorio si hay fraccion: un numero sin procedencia no es defendible.';


-- ============================================================================
-- 3 · EL RESULTADO PUEDE SER «NO LO SÉ», Y ESO NO ES CERO
-- ----------------------------------------------------------------------------
-- El patrón ya existe en esta casa: `quality_measurements` separa `data_state`
-- de `value` con un CHECK que OBLIGA a `value IS NULL` cuando no hay dato. Es
-- exactamente la garantía que hace imposible confundir «cero» con «no sé», y
-- se copia tal cual.
--
-- Las tres columnas de masa pasan a admitir NULL. Las filas existentes no se
-- tocan: entran con `result_state = 'calculated'`, que es lo que son.
-- ============================================================================

alter table public.recycled_content_calculations
  add column if not exists result_state text not null default 'calculated',
  add column if not exists incomplete_reasons text[] not null default '{}',
  add column if not exists methodology_version integer not null default 1;

alter table public.recycled_content_calculations
  alter column total_mass_kg    drop not null,
  alter column recycled_mass_kg drop not null,
  alter column recycled_percent drop not null;

alter table public.recycled_content_calculations
  drop constraint if exists recycled_calc_result_state_check;
alter table public.recycled_content_calculations
  add constraint recycled_calc_result_state_check check (
    result_state = any (array['calculated', 'incomplete'])
  );

-- LA GARANTÍA. Un `incomplete` no puede llevar número, y un `calculated` no
-- puede no llevarlo. No hay tercera forma de rellenar esta tabla.
alter table public.recycled_content_calculations
  drop constraint if exists recycled_calc_state_consistent;
alter table public.recycled_content_calculations
  add constraint recycled_calc_state_consistent check (
    (result_state = 'calculated'
      and recycled_percent is not null
      and total_mass_kg is not null
      and recycled_mass_kg is not null
      and cardinality(incomplete_reasons) = 0)
    or
    (result_state = 'incomplete'
      and recycled_percent is null
      and cardinality(incomplete_reasons) > 0)
  );

comment on column public.recycled_content_calculations.result_state is
  'PT-F11 · calculated o incomplete. Un incomplete NO escribe porcentaje: ni cero, ni el del calculo anterior, ni una estimacion. Mismo patron que quality_measurements.data_state.';
comment on column public.recycled_content_calculations.incomplete_reasons is
  'PT-F11 · Por que no se pudo calcular, en codigos estables. Vacio cuando el resultado es un numero.';
comment on column public.recycled_content_calculations.methodology_version is
  'PT-H03 · La version de la metodologia con la que se calculo. Las filas anteriores a 0144 son v1 y siguen siendo reproducibles con su methodology_rules_snapshot.';


-- ============================================================================
-- 4 · LA METODOLOGÍA v2
-- ----------------------------------------------------------------------------
-- Fila NUEVA. `RC-6632-15343` v1 pasa a inactiva y SIGUE EXISTIENDO: sus
-- cálculos se reproducen con su propio snapshot, que es justo para lo que se
-- guardó (PT-H03).
--
-- Las reglas cambian en tres puntos y todo lo demás se conserva:
--   · `denominator: consumption`   (antes: composition)
--   · `phi_requires_declared_fraction: true`  (antes: la etiqueta bastaba)
--   · `output_batch_allocation: none`         (PT-H05: no se prorratea)
-- ============================================================================

update public.calculation_methodologies
   set is_active = false
 where code = 'RC-6632-15343' and version = 1;

insert into public.calculation_methodologies (code, version, name, description, is_active, rules)
select 'RC-6632-15343', 2,
       'Contenido reciclado NTC 6632 / UNE-EN 15343 — v2 (desde consumos reales)',
       'El porcentaje sale de los consumos realmente registrados en la orden, no de una composicion tecleada aparte. La fraccion reciclada se toma del lote de entrada y tiene que estar declarada: una clasificacion elegible NO implica 100 %. Sin atribucion de consumos a lotes de salida, una orden con varias salidas no se prorratea: se declara incompleta.',
       true,
       jsonb_build_object(
         'formula', 'sum(consumed_i * phi_i) / sum(consumed_i) * 100',
         'denominator', 'consumption',
         'mass_unit', 'kg',
         'eligible_classifications', jsonb_build_array('preconsumer_valid', 'postconsumer_valid'),
         'same_process_counts', false,
         'postindustrial_counts_by_default', false,
         'postindustrial_requires_reclassification', true,
         'additives_pigments_fillers_count', false,
         'recycled_requires_origin_support', true,
         'phi_requires_declared_fraction', true,
         'output_batch_allocation', 'none',
         'mass_balance_tolerance_percent', 5
       )
where not exists (
  select 1 from public.calculation_methodologies where code = 'RC-6632-15343' and version = 2
);


-- ============================================================================
-- 5 · EL CÁLCULO v2
-- ----------------------------------------------------------------------------
-- `calculate_recycled_content` (v1) NO SE TOCA. Convive. Se puede seguir
-- llamando y sigue dando exactamente lo mismo que ayer, que es lo que PT-H03
-- exige y lo que permite comparar las dos sobre los mismos datos antes de
-- cambiar el defecto en la interfaz.
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

  if p_methodology_id is not null then
    select * into v_meth from public.calculation_methodologies
     where id = p_methodology_id and is_active;
    if not found then
      raise exception 'La metodologia indicada no existe o no esta activa';
    end if;
  else
    select * into v_meth from public.calculation_methodologies
     where code = 'RC-6632-15343' and version = 2 and is_active;
    if not found then
      raise exception 'No hay una metodologia activa RC-6632-15343 v2';
    end if;
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

revoke all on function public.calculate_recycled_content_v2(uuid, uuid) from public, anon;
grant execute on function public.calculate_recycled_content_v2(uuid, uuid) to authenticated;

comment on function public.calculate_recycled_content_v2(uuid, uuid) is
  'PT-02A · Contenido reciclado desde CONSUMOS reales (PT-F10). phi debe ser demostrable (PT-H02) y sin atribucion de consumos a lotes de salida no se prorratea (PT-H05). v1 sigue existiendo y sin tocar (PT-H03).';


-- ============================================================================
-- 6 · LA VISTA DEL ÚLTIMO CÁLCULO DEJA DE MEZCLAR PERAS Y «NO SÉ»
-- ----------------------------------------------------------------------------
-- `v_latest_batch_recycled` toma el mas reciente por lote. Con `incomplete`
-- en la tabla, un lote cuyo ultimo calculo salio incompleto aparecia con
-- `recycled_percent` nulo y sin explicar por que. Ahora lleva su estado y sus
-- motivos, y quien la lea puede distinguir «cero» de «no lo sabemos».
-- ============================================================================

-- `create or replace` y NO `drop … cascade`. La primera versión de esta
-- migración usó `drop view … cascade` y se llevó por delante SEIS vistas que
-- dependían de esta —la matriz de evidencias, las brechas de soporte, la
-- preparación del lote, el flujo guiado y los dos tableros de implementación—
-- sin que nada lo pidiera. Se recuperaron con una reejecución limpia, y la
-- lección queda escrita aquí: `cascade` en una vista con dependientes no es
-- una opción de conveniencia, es un borrado.
--
-- `replace` obliga a conservar las columnas anteriores en su orden exacto y
-- solo permite AÑADIR al final. Es justo la restricción que hace falta.
create or replace view public.v_latest_batch_recycled as
select distinct on (c.output_batch_id)
  c.organization_id,
  c.id                     as calculation_id,
  c.output_batch_id,
  ob.batch_code            as output_batch_code,
  ob.production_order_id,
  po.order_code            as production_order_code,
  ob.product_id,
  p.code                   as product_code,
  p.name                   as product_name,
  p.family_id,
  ob.produced_date,
  c.recycled_mass_kg,
  c.total_mass_kg,
  c.recycled_percent,
  c.declared_percent,
  c.risk_flag,
  c.defensibility_level,
  c.calculated_at,
  c.calculated_by,
  -- Lo nuevo va AL FINAL, que es lo unico que `replace` admite.
  c.result_state,
  c.incomplete_reasons,
  c.methodology_version
from public.recycled_content_calculations c
join public.output_batches ob on ob.id = c.output_batch_id
left join public.production_orders po on po.id = ob.production_order_id
left join public.products p on p.id = ob.product_id
order by c.output_batch_id, c.calculated_at desc, c.id desc;

comment on view public.v_latest_batch_recycled is
  'PT-02A · El ultimo calculo por lote, con su result_state. Un lote incompleto se ve incompleto: recycled_percent nulo y los motivos al lado.';


-- ============================================================================
-- 7 · REVERSIÓN
-- ----------------------------------------------------------------------------
--   drop function if exists public.calculate_recycled_content_v2(uuid, uuid);
--   update calculation_methodologies set is_active = true  where code='RC-6632-15343' and version=1;
--   delete from calculation_methodologies where code='RC-6632-15343' and version=2;   -- solo si no hay calculos v2
--   alter table recycled_content_calculations
--     drop constraint recycled_calc_state_consistent,
--     drop constraint recycled_calc_result_state_check,
--     drop column result_state, drop column incomplete_reasons, drop column methodology_version;
--   alter table recycled_content_calculations
--     alter column total_mass_kg set not null, ... (solo si no quedan filas incomplete)
--   alter table input_batches drop column recycled_fraction, drop column recycled_fraction_basis;
--   y restaurar v_latest_batch_recycled sin result_state.
--
-- NINGUNA fila existente se modifica. v1 conserva su funcion, su fila de
-- metodologia y todos sus calculos, que siguen siendo reproducibles.
-- ============================================================================
