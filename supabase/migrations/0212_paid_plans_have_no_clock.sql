-- =============================================================================
-- Trazaloop · COMMERCIAL-UX-01B.2 · El tiempo de uso deja de ser el límite
-- económico de los planes pagos
-- =============================================================================
--
-- LA DECISIÓN
--
-- La economía de Trazaloop se gobierna con almacenamiento, créditos de IA y
-- capacidades del plan. NO con el tiempo que alguien tiene el producto abierto.
--
-- Una empresa que paga Full o Extra no consume una bolsa de minutos y no se
-- queda fuera por haber trabajado mucho. Medir el tiempo de quien ya pagó
-- castiga exactamente el comportamiento que se quiere: usar la herramienta.
--
-- Free sí mide —30 al día, 300 al mes— porque ahí el tiempo es lo que separa
-- probar el producto de operar con él gratis. Eso no cambia.
--
--
-- POR QUÉ ESTA MIGRACIÓN EXISTE HABIENDO UNA 0211
--
-- 0211 publicó Full con 600 minutos al mes. Era la decisión comercial de
-- entonces y se aplicó correctamente a Local y a Staging. La decisión cambió
-- después, y el historial no se reescribe: 0211 se queda donde está, con lo que
-- hizo, y esta migración la sucede.
--
-- Quien lea esto dentro de un año verá las dos y entenderá que hubo un cambio
-- de criterio comercial, que es la verdad. Borrar 0211 habría contado otra.
--
--
-- MISMO MECANISMO QUE 0211
--
-- Revisión NUEVA, no `update`: la publicada es el precio y las condiciones con
-- las que alguien contrató, y `t_plan_revision_limits_immutable` lo defiende.
-- Se copia todo —precio, moneda, textos, almacenamiento, créditos, features y
-- los demás límites— y se cambian SOLO los dos límites de minutos.
--
-- Extra ya está en ilimitado y no se toca. Free tampoco se mira.
--
--
-- LA PRUEBA DE FULL, DE PROPINA
--
-- `commercial_trial_policy` concede la revisión VIGENTE de Full, así que la
-- prueba hereda el tiempo ilimitado sin necesitar ninguna excepción. Su límite
-- es el que siempre tuvo: 48 horas. Créditos de IA, almacenamiento y mecánica
-- de caducidad no se tocan aquí.
--
--
-- ASIGNACIONES CONGELADAS
--
-- Una asignación apunta a una revisión concreta y no se reescribe. Se auditó
-- antes de escribir esto: la revisión de 600 estuvo vigente catorce minutos en
-- Staging y no la tomó ni un cliente. En Local solo la tomaron fixtures de la
-- propia batería de pruebas. No hay nadie a quien haya que mover, así que no se
-- fabrica una migración de datos que no arregla nada.
-- =============================================================================

do $$
begin
  if to_regclass('public.plan_revision_limits') is null then
    raise exception '0212 presupone el catalogo comercial de 0162';
  end if;
  if not exists (select 1 from public.plan_revisions
                  where plan_code = 'full' and status = 'published') then
    raise exception '0212 presupone una revision Full publicada';
  end if;
end $$;

do $$
declare
  v_vieja   public.plan_revisions%rowtype;
  v_nueva   uuid;
  v_ahora   timestamptz := now();
  v_num     integer;
  v_con_reloj integer;
begin
  select * into v_vieja from public.plan_revisions
   where plan_code = 'full' and status = 'published'
   order by revision_number desc limit 1;

  -- IDEMPOTENTE. Si la vigente ya tiene los DOS límites de minutos en
  -- ilimitado, no hay nada que suceder: aplicar dos veces esta migración no
  -- puede encadenar revisiones iguales.
  select count(*) into v_con_reloj
    from public.plan_revision_limits l
   where l.plan_revision_id = v_vieja.id
     and l.resource_code in ('active_minutes_daily', 'active_minutes_monthly')
     and l.limit_state <> 'unlimited';
  if v_con_reloj = 0 then
    raise notice '0212 · la revision vigente de Full ya es ilimitada en tiempo; nada que hacer';
    return;
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_num
    from public.plan_revisions where plan_code = 'full';

  -- La revisión nueva COPIA la vigente. Precio, moneda y textos no son objeto
  -- de este cambio y no se tocan.
  insert into public.plan_revisions (
    plan_code, revision_number, status, display_name, description,
    public_conditions, price_state, currency,
    monthly_price_minor, annual_price_minor, internal_notes, created_by)
  values (
    'full', v_num, 'draft', v_vieja.display_name, v_vieja.description,
    v_vieja.public_conditions, v_vieja.price_state, v_vieja.currency,
    v_vieja.monthly_price_minor, v_vieja.annual_price_minor,
    'COMMERCIAL-UX-01B.2 · el tiempo de uso deja de limitar los planes pagos. '
      || 'Minutos diarios y mensuales pasan a ilimitado. El resto se copia de '
      || 'la revision ' || v_vieja.revision_number || '.',
    null)
  returning id into v_nueva;

  -- Los límites también se copian, salvo los dos que se liberan. `unlimited`
  -- exige `limit_value` nulo: la tabla no admite un número con estado
  -- ilimitado, y hace bien.
  insert into public.plan_revision_limits
    (plan_revision_id, resource_code, limit_state, limit_value)
  select v_nueva, l.resource_code,
         case when l.resource_code in ('active_minutes_daily',
                                       'active_minutes_monthly')
              then 'unlimited' else l.limit_state end,
         case when l.resource_code in ('active_minutes_daily',
                                       'active_minutes_monthly')
              then null else l.limit_value end
    from public.plan_revision_limits l
   where l.plan_revision_id = v_vieja.id;

  -- La sucesión, con la MISMA marca de tiempo: ni un instante sin revisión
  -- vigente, ni un instante con dos.
  update public.plan_revisions
     set effective_to = v_ahora, status = 'retired'
   where plan_code = 'full' and status = 'published' and effective_to is null;

  update public.plan_revisions
     set status = 'published', effective_from = v_ahora, published_at = now()
   where id = v_nueva;

  raise notice '0212 · Full r% publicada: tiempo ilimitado, precio y todo lo demas intacto', v_num;
end $$;

-- -----------------------------------------------------------------------------
-- Comprobación · la autoridad dice lo que la decisión comercial dice
-- -----------------------------------------------------------------------------
do $$
declare
  v_dia  text;
  v_mes  text;
  v_prec record;
  v_free record;
  v_extra integer;
begin
  select l.limit_state into v_dia
    from public.plan_revision_limits l
    join public.plan_revisions r on r.id = l.plan_revision_id
   where r.plan_code = 'full' and r.status = 'published'
     and l.resource_code = 'active_minutes_daily';
  select l.limit_state into v_mes
    from public.plan_revision_limits l
    join public.plan_revisions r on r.id = l.plan_revision_id
   where r.plan_code = 'full' and r.status = 'published'
     and l.resource_code = 'active_minutes_monthly';

  if v_dia <> 'unlimited' or v_mes <> 'unlimited' then
    raise exception '0212_FULL_SIGUE_CON_RELOJ: dia=% mes=%', v_dia, v_mes;
  end if;

  -- El precio no se ha movido.
  select monthly_price_minor, annual_price_minor into v_prec
    from public.plan_revisions where plan_code = 'full' and status = 'published';
  if v_prec.monthly_price_minor <> 4000 or v_prec.annual_price_minor <> 40000 then
    raise exception '0212_EL_PRECIO_DE_FULL_CAMBIO: % %',
      v_prec.monthly_price_minor, v_prec.annual_price_minor;
  end if;

  -- Ni el almacenamiento ni los créditos, que SÍ son la economía del plan.
  if (select l.limit_value from public.plan_revision_limits l
        join public.plan_revisions r on r.id = l.plan_revision_id
       where r.plan_code = 'full' and r.status = 'published'
         and l.resource_code = 'storage_bytes') <> 524288000 then
    raise exception '0212_EL_ALMACENAMIENTO_DE_FULL_CAMBIO';
  end if;
  if (select l.limit_value from public.plan_revision_limits l
        join public.plan_revisions r on r.id = l.plan_revision_id
       where r.plan_code = 'full' and r.status = 'published'
         and l.resource_code = 'ai_weighted_credits_monthly') <> 500 then
    raise exception '0212_LOS_CREDITOS_DE_FULL_CAMBIARON';
  end if;

  -- Free sigue midiendo, que es lo que separa probar de operar gratis.
  select
    max(case when l.resource_code = 'active_minutes_daily'   then l.limit_value end) as dia,
    max(case when l.resource_code = 'active_minutes_monthly' then l.limit_value end) as mes
    into v_free
    from public.plan_revision_limits l
    join public.plan_revisions r on r.id = l.plan_revision_id
   where r.plan_code = 'free' and r.status = 'published';
  if v_free.dia <> 30 or v_free.mes <> 300 then
    raise exception '0212_FREE_SE_MOVIO: %/%', v_free.dia, v_free.mes;
  end if;

  -- Y Extra sigue como estaba: no se toca lo que ya cumple la política.
  select count(*) into v_extra
    from public.plan_revision_limits l
    join public.plan_revisions r on r.id = l.plan_revision_id
   where r.plan_code = 'extra' and r.status = 'published'
     and l.resource_code in ('active_minutes_daily', 'active_minutes_monthly')
     and l.limit_state <> 'unlimited';
  if v_extra <> 0 then
    raise exception '0212_EXTRA_TIENE_RELOJ';
  end if;

  -- Una sola vigente.
  if (select count(*) from public.plan_revisions
       where plan_code = 'full' and status = 'published') <> 1 then
    raise exception '0212_MAS_DE_UNA_REVISION_FULL_VIGENTE';
  end if;

  raise notice '0212 · Full sin reloj, Free 30/300, Extra intacto, precio y cuotas iguales';
end $$;
