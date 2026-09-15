-- =============================================================================
-- Trazaloop · PUBLIC-DIAGNOSTICS-01H · Contar sin traerse las participaciones
-- =============================================================================
--
-- EL DEFECTO QUE ESTO CIERRA
--
-- El listado de campañas contaba así: traía `(campaign_id, status)` de todas
-- las participaciones y las agrupaba en TypeScript. Con las cifras de entonces
-- —cero— funcionaba. Con una convocatoria de mil empresas no: PostgREST corta
-- en mil filas (`max_rows` en `supabase/config.toml`) y devuelve mil SIN error.
--
-- El resultado no habría sido una pantalla rota, que se nota. Habría sido una
-- pantalla que dice «847 completadas» cuando son 1 203. Es la misma forma de
-- fallar que costó un sprint en QUALITY-12.2F: un dato cortado con aspecto de
-- dato completo.
--
-- Contar es trabajo de la base. Aquí se agrupa donde están las filas y vuelve
-- una fila por campaña, cueste lo que cueste el estudio.
--
--
-- POR QUÉ `SECURITY DEFINER` PARA CONTAR
--
-- Porque cuenta sobre una tabla con datos personales. La alternativa —abrirle
-- la tabla a quien cuenta— daría acceso a las filas para obtener un número.
-- La puerta es la misma que la RLS de 0196: administración de plataforma, y
-- nadie más. Para el resto devuelve cero filas, no un error: quien no
-- administra no ve campañas, así que tampoco tiene conteos que ver.
-- =============================================================================

create or replace function public.public_diagnostic_campaign_counts()
returns table (campaign_id uuid, started bigint, completed bigint, incomplete bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.campaign_id,
         count(*)                                             as started,
         count(*) filter (where s.status = 'completed')        as completed,
         count(*) filter (where s.status <> 'completed')       as incomplete
    from public.public_diagnostic_submissions s
   where public.is_platform_superadmin()
   group by s.campaign_id;
$$;

revoke all on function public.public_diagnostic_campaign_counts()
  from public, anon;
grant execute on function public.public_diagnostic_campaign_counts()
  to authenticated;

comment on function public.public_diagnostic_campaign_counts() is
  '0203 · Conteos por campaña, agrupados EN LA BASE. Evita el corte silencioso '
  'de PostgREST al contar en la aplicación. Solo administración de plataforma.';

-- -----------------------------------------------------------------------------
-- Y la puerta de 0202 sigue donde estaba
-- -----------------------------------------------------------------------------
-- Una función nueva nace alcanzable por `anon` si nadie lo impide. 0202 cerró
-- los privilegios por omisión del rol `postgres`, así que ya no debería pasar
-- — y esta migración lo comprueba en vez de confiar.

do $$
declare v_n int;
begin
  if has_function_privilege('anon',
       'public.public_diagnostic_campaign_counts()', 'EXECUTE') then
    raise exception '0203_CONTEO_ALCANZABLE_POR_ANON';
  end if;

  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_n <> 9 then
    raise exception '0203_SUPERFICIE_PUBLICA_CAMBIO: % funciones', v_n;
  end if;

  raise notice '0203 · conteos en la base, y la superficie pública sigue en nueve';
end $$;
