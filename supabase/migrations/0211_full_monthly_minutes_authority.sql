-- =============================================================================
-- Trazaloop · COMMERCIAL-UX-01B · Full mide 600 minutos al mes
-- =============================================================================
--
-- LA CONTRADICCIÓN QUE ESTO CIERRA
--
-- La decisión comercial dice que Full incluye 600 minutos de uso al mes. La
-- autoridad —`plan_revision_limits` de la revisión publicada— decía
-- `active_minutes_monthly = unlimited`.
--
-- No es un matiz de catálogo: `organization_time_status` deja de MEDIR cuando
-- los dos límites de minutos son ilimitados. Con la autoridad como estaba, Full
-- no se medía en absoluto, así que una página de precios que prometiera 600
-- minutos habría prometido algo que el producto no aplicaba.
--
--
-- POR QUÉ UNA REVISIÓN NUEVA Y NO UN UPDATE
--
-- Porque la revisión publicada es INMUTABLE, y con razón: es el precio y las
-- condiciones con las que alguien contrató. `t_plan_revision_limits_immutable`
-- lo impide, y cambiarlo por debajo reescribiría lo que se le vendió a quien ya
-- está dentro.
--
-- El mecanismo gobernado es publicar una revisión que sucede a la anterior. La
-- de hoy se retira con su `effective_to`, la nueva entra con su
-- `effective_from`, y la historia queda entera: quien quiera saber qué incluía
-- Full en septiembre puede leerlo.
--
--
-- POR QUÉ NO SE LLAMA A `plan_publish_revision`
--
-- Porque exige `is_platform_superadmin()`, y una migración no tiene sesión:
-- `auth.uid()` es nulo. Así que aquí se hace EXACTAMENTE lo que hace esa
-- función —retirar la vigente, publicar la nueva— y nada más. La diferencia es
-- quién firma: `published_by` queda nulo porque no hay persona detrás, y eso es
-- más honesto que atribuírselo a alguien.
--
--
-- QUÉ NO CAMBIA
--
-- El PRECIO no se toca: la revisión nueva copia el de la vigente. El diario
-- sigue ilimitado —no hay decisión de producto que ponga un tope diario a Full
-- y no se inventa—. Free y Extra no se miran siquiera.
-- =============================================================================

do $$
begin
  if to_regclass('public.plan_revision_limits') is null then
    raise exception '0211 presupone el catalogo comercial de 0162';
  end if;
  if not exists (select 1 from public.plan_revisions
                  where plan_code = 'full' and status = 'published') then
    raise exception '0211 presupone una revision Full publicada';
  end if;
end $$;

do $$
declare
  v_vieja  public.plan_revisions%rowtype;
  v_nueva  uuid;
  v_ahora  timestamptz := now();
  v_num    integer;
  v_mensual integer;
begin
  select * into v_vieja from public.plan_revisions
   where plan_code = 'full' and status = 'published'
   order by revision_number desc limit 1;

  -- IDEMPOTENTE. Si la vigente ya declara los 600, no se publica nada: aplicar
  -- dos veces esta migración no puede dejar dos revisiones iguales encadenadas.
  select l.limit_value into v_mensual
    from public.plan_revision_limits l
   where l.plan_revision_id = v_vieja.id
     and l.resource_code = 'active_minutes_monthly'
     and l.limit_state = 'finite';
  if v_mensual = 600 then
    raise notice '0211 · la revision vigente de Full ya declara 600 min/mes; nada que hacer';
    return;
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_num
    from public.plan_revisions where plan_code = 'full';

  -- La revisión nueva COPIA la vigente. El precio, la moneda y el texto no son
  -- objeto de este arreglo y no se tocan.
  insert into public.plan_revisions (
    plan_code, revision_number, status, display_name, description,
    public_conditions, price_state, currency,
    monthly_price_minor, annual_price_minor, internal_notes, created_by)
  values (
    'full', v_num, 'draft', v_vieja.display_name, v_vieja.description,
    v_vieja.public_conditions, v_vieja.price_state, v_vieja.currency,
    v_vieja.monthly_price_minor, v_vieja.annual_price_minor,
    'COMMERCIAL-UX-01B · corrige active_minutes_monthly a 600. '
      || 'El resto se copia de la revision ' || v_vieja.revision_number || '.',
    null)
  returning id into v_nueva;

  -- Los límites también se copian, salvo el que se corrige.
  insert into public.plan_revision_limits
    (plan_revision_id, resource_code, limit_state, limit_value)
  select v_nueva, l.resource_code,
         case when l.resource_code = 'active_minutes_monthly' then 'finite'
              else l.limit_state end,
         case when l.resource_code = 'active_minutes_monthly' then 600
              else l.limit_value end
    from public.plan_revision_limits l
   where l.plan_revision_id = v_vieja.id;

  -- Y la sucesión, igual que `plan_publish_revision`: primero se retira la
  -- vigente con la MISMA marca de tiempo con la que entra la nueva, para que no
  -- quede ni un instante sin revisión vigente ni con dos.
  update public.plan_revisions
     set effective_to = v_ahora, status = 'retired'
   where plan_code = 'full' and status = 'published' and effective_to is null;

  update public.plan_revisions
     set status = 'published', effective_from = v_ahora, published_at = now()
   where id = v_nueva;

  raise notice '0211 · Full r% publicada: 600 min/mes, diario sin tope, precio intacto', v_num;
end $$;

-- -----------------------------------------------------------------------------
-- Comprobación · la autoridad dice lo que la decisión comercial dice
-- -----------------------------------------------------------------------------
do $$
declare
  v_mes  record;
  v_dia  record;
  v_prec record;
begin
  select l.limit_state, l.limit_value into v_mes
    from public.plan_revision_limits l join public.plan_revisions r on r.id = l.plan_revision_id
   where r.plan_code = 'full' and r.status = 'published'
     and l.resource_code = 'active_minutes_monthly';
  select l.limit_state into v_dia
    from public.plan_revision_limits l join public.plan_revisions r on r.id = l.plan_revision_id
   where r.plan_code = 'full' and r.status = 'published'
     and l.resource_code = 'active_minutes_daily';
  select monthly_price_minor, annual_price_minor into v_prec
    from public.plan_revisions where plan_code = 'full' and status = 'published';

  if v_mes.limit_state <> 'finite' or v_mes.limit_value <> 600 then
    raise exception '0211_MINUTOS_MENSUALES_NO_SON_600: % %', v_mes.limit_state, v_mes.limit_value;
  end if;
  if v_dia.limit_state <> 'unlimited' then
    raise exception '0211_APARECIO_UN_TOPE_DIARIO_EN_FULL: %', v_dia.limit_state;
  end if;
  if v_prec.monthly_price_minor <> 4000 or v_prec.annual_price_minor <> 40000 then
    raise exception '0211_EL_PRECIO_DE_FULL_CAMBIO: % %',
      v_prec.monthly_price_minor, v_prec.annual_price_minor;
  end if;

  -- Y solo hay UNA vigente.
  if (select count(*) from public.plan_revisions
       where plan_code = 'full' and status = 'published') <> 1 then
    raise exception '0211_MAS_DE_UNA_REVISION_FULL_VIGENTE';
  end if;

  raise notice '0211 · Full: 600 min/mes, sin tope diario, USD 40/400 intactos';
end $$;
