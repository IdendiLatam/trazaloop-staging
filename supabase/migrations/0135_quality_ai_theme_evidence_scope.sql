-- ============================================================================
-- QUALITY-12.1 · UN TEMA DE CLIENTES SE APOYA EN CLIENTES
-- ----------------------------------------------------------------------------
-- Añade. No toca la 0132, la 0133 ni la 0134.
--
-- QUÉ SE VIO EN LA VALIDACIÓN
--
-- Una consulta real agrupó los comentarios en tres temas, y el primero —«Retraso
-- de entrega»— se apoyaba en cuatro fuentes: tres comentarios anónimos y UN CASO
-- interno. El caso habla del mismo asunto y es legítimo que el modelo lo lea
-- para entender, pero no es voz del cliente: si cuenta como respaldo, un tema
-- puede decir «lo sostienen cuatro comentarios» cuando los clientes dijeron
-- tres.
--
-- Y el recuento es justo lo que QUALITY-12.1 prometió que calcularía el
-- servidor y no el modelo (§32). Calcularlo bien incluye contar lo que
-- corresponde.
--
-- QUÉ CAMBIA
--
-- La evidencia de un tema se limita a las fuentes de VOZ DEL CLIENTE:
-- comentarios de campañas y quejas o retroalimentación registradas. Las demás
-- referencias de la consulta se descartan al escribir el tema —sin ruido— y la
-- consecuencia visible es que el respaldo baja hasta lo que de verdad dijeron
-- los clientes.
--
-- LO QUE NO CAMBIA
--
-- El modelo sigue pudiendo leer todo el contexto: esto no recorta lo que ve,
-- recorta lo que puede contar como respaldo de un tema.
-- ============================================================================

create or replace function public.quality_ai_record_customer_theme(
  p_run_id        uuid,
  p_theme_key     text,
  p_label         text,
  p_summary       text,
  p_sentiment     text,
  p_period_start  date,
  p_period_end    date,
  p_reference_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run   record;
  v_key   text;
  v_id    uuid;
  v_valid uuid[];
begin
  select * into v_run from quality_ai_runs where id = p_run_id;
  if v_run.id is null then raise exception 'Esa consulta no existe.'; end if;
  if v_run.actor_id <> auth.uid() and auth.uid() is not null then
    raise exception 'No puedes escribir temas en la consulta de otra persona.';
  end if;
  if not quality_ai_feature_allowed(v_run.organization_id, 'customer') then
    raise exception 'La voz del cliente no está habilitada para el Copilot en esta empresa.';
  end if;

  v_key := lower(btrim(coalesce(p_theme_key, '')));
  if length(v_key) < 2 then
    raise exception 'Un tema necesita un identificador de al menos dos caracteres.';
  end if;
  v_key := left(v_key, 80);

  -- Solo cuentan las referencias de ESTA consulta y que sean VOZ DEL CLIENTE.
  -- Las demás se descartan sin ruido: la consecuencia visible es que el
  -- recuento baja, que es exactamente lo que debe pasar cuando la evidencia no
  -- es la que el tema dice tener.
  select coalesce(array_agg(r.id), '{}'::uuid[]) into v_valid
    from quality_ai_run_references r
   where r.organization_id = v_run.organization_id
     and r.run_id = p_run_id
     and r.source_code in ('customer_comment', 'customer_feedback')
     and r.id = any(coalesce(p_reference_ids, '{}'::uuid[]));

  insert into quality_ai_customer_themes (
    organization_id, run_id, provider, model, prompt_template, prompt_version,
    period_start, period_end,
    theme_key, label, summary, sentiment, evidence_count)
  values (
    v_run.organization_id, p_run_id,
    v_run.provider, v_run.model, v_run.prompt_template, v_run.prompt_version,
    coalesce(p_period_start, v_run.period_start, current_date),
    coalesce(p_period_end, v_run.period_end, current_date),
    v_key, left(coalesce(nullif(btrim(p_label), ''), v_key), 200),
    left(coalesce(p_summary, ''), 2000),
    case when p_sentiment in ('negative', 'mixed', 'neutral', 'positive')
         then p_sentiment else 'unknown' end,
    coalesce(array_length(v_valid, 1), 0))
  on conflict (organization_id, run_id, theme_key, period_start, period_end)
  do update set label = excluded.label,
                summary = excluded.summary,
                sentiment = excluded.sentiment,
                evidence_count = excluded.evidence_count
  returning id into v_id;

  insert into quality_ai_customer_theme_evidence (organization_id, theme_id, reference_id)
  select v_run.organization_id, v_id, x
    from unnest(v_valid) as x
  on conflict do nothing;

  return v_id;
end;
$$;
revoke all on function public.quality_ai_record_customer_theme(uuid, text, text, text, text, date, date, uuid[])
  from public, anon;
grant execute on function public.quality_ai_record_customer_theme(uuid, text, text, text, text, date, date, uuid[])
  to authenticated;

comment on column public.quality_ai_customer_themes.evidence_count is
  'QUALITY-12.1 · Cuantos comentarios o quejas DE CLIENTES sostienen el tema. Lo cuenta el SERVIDOR sobre las referencias de voz del cliente de esa misma consulta: un caso interno que hable del mismo asunto NO cuenta como respaldo.';
