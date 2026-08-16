-- PCR-03.4.1 · regresión del CASE evidence_status
--
-- Reproduce el escenario que el lint de Production detectó:
-- una evidencia 'pending' entra al snapshot autoritativo.
--
-- Resultado obligatorio:
--   · pcr_build_exercise_snapshot NO lanza SQLSTATE 22P02
--   · la evidencia aparece en el snapshot
--   · review_label contiene "Pendiente de revisión"

do $$
declare
  org  uuid := 'f3410000-0000-0000-0000-000000000001';
  op   uuid := 'f3410000-0000-0000-0000-000000000002';
  ob   uuid := 'f3410000-0000-0000-0000-000000000003';
  ev   uuid := 'f3410000-0000-0000-0000-000000000004';

  snap jsonb;
begin
  insert into public.organizations (id, name)
  values (org, 'Org PCR-03.4.1 regression');

  insert into public.production_orders (
    id,
    organization_id,
    order_code,
    order_date,
    status
  )
  values (
    op,
    org,
    'OP-PCR0341',
    current_date,
    'in_progress'
  );

  insert into public.output_batches (
    id,
    organization_id,
    production_order_id,
    batch_code,
    produced_quantity_kg
  )
  values (
    ob,
    org,
    op,
    'OUT-PCR0341',
    10
  );

  insert into public.evidences (
    id,
    organization_id,
    name,
    evidence_type,
    status
  )
  values (
    ev,
    org,
    'Evidencia pendiente PCR-03.4.1',
    'quality_control',
    'pending'
  );

  insert into public.evidence_links (
    organization_id,
    evidence_id,
    target_type,
    target_id,
    link_role
  )
  values (
    org,
    ev,
    'output_batch',
    ob,
    'regresión evidence_status pending'
  );

  begin
    snap := public.pcr_build_exercise_snapshot(org, ob);
  exception
    when others then
      if sqlstate = '22P02' then
        raise exception
          'FALLO PCR-03.4.1: reapareció SQLSTATE 22P02 al procesar evidencia pending: %',
          sqlerrm;
      end if;

      raise;
  end;

  if snap is null then
    raise exception
      'FALLO PCR-03.4.1: el builder devolvió snapshot NULL';
  end if;

  if position(ev::text in snap::text) = 0 then
    raise exception
      'FALLO PCR-03.4.1: la evidencia pending no apareció en el snapshot';
  end if;

  if position('Pendiente de revisión' in snap::text) = 0 then
    raise exception
      'FALLO PCR-03.4.1: review_label no contiene "Pendiente de revisión"';
  end if;

  raise notice
    '✔ PCR-03.4.1 evidence_status: pending produce "Pendiente de revisión" sin SQLSTATE 22P02';

  raise notice
    'PCR0341_PENDING_EVIDENCE_LABEL = PASS';
end $$;
