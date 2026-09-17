-- =============================================================================
-- Trazaloop · COMMERCIAL-UX-01D · La prueba se anuncia sin sesión
-- =============================================================================
--
-- EL DEFECTO QUE ESTO CIERRA
--
-- 0213 abrió el catálogo de planes a quien no ha iniciado sesión, pero la
-- POLÍTICA DE PRUEBA se quedó fuera. Resultado medido en la página ya
-- construida: un visitante anónimo no veía el distintivo «Prueba Full 2 días ·
-- sin tarjeta de crédito», ni la sección de la prueba, ni su mención en la
-- descripción para buscadores — y sin embargo la FAQ le respondía «qué pasa
-- cuando terminan las 48 horas».
--
-- Una página que responde por una prueba que nunca ha ofrecido no es un detalle
-- de maquetación: es incoherente justo delante de quien está decidiendo.
--
--
-- POR QUÉ UNA VISTA Y NO LA TABLA
--
-- `commercial_trial_policy` tiene `updated_by` —el identificador de la persona
-- que tocó la política por última vez— y `updated_at`. Eso es auditoría
-- interna, y conceder la tabla la publicaría en PostgREST: la RLS filtra FILAS,
-- no COLUMNAS. Nadie de fuera tiene por qué saber quién configuró nada.
--
-- Con la vista como frontera sale exactamente lo que la página necesita para
-- decir la frase, y nada más.
--
--
-- LOS TRES CAMPOS, Y POR QUÉ NO CUATRO
--
--   enabled ............... si hay prueba que ofrecer
--   trial_plan_code ....... de qué plan es
--   trial_duration_hours .. cuánto dura
--
-- `trial_ai_credits` NO sale, y es una decisión, no un olvido: la página no
-- enseña esa cifra —dice que la bolsa de la prueba es la suya y no se suma a la
-- del plan contratado— y exponer un campo que nadie usa contradice el criterio
-- con el que se abrió 0213. Si algún día se decide enseñarla, se añade aquí una
-- línea y se declara.
--
-- Tampoco existe ningún campo de «¿pide tarjeta?»: la prueba no la pide porque
-- NINGÚN camino del producto la solicita para empezarla, no porque una columna
-- lo diga. Eso se presenta como lo que es —una propiedad del flujo— y no se
-- inventa una columna para aparentar que la autoridad lo declara.
--
--
-- MISMO PATRÓN QUE 0213, Y LA LISTA BLANCA AL DÍA
--
-- Vista evaluada con los privilegios de su propietario, concedida a `anon` solo
-- para leer, tabla de debajo cerrada. Y la lista blanca de 0202 pasa de cinco a
-- seis relaciones, declarada aquí entera: una lista que no se actualiza deja de
-- ser una lista blanca y pasa a ser un comentario.
-- =============================================================================

do $$
begin
  if to_regclass('public.commercial_trial_policy') is null then
    raise exception '0214 presupone la politica de prueba de 0162';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1 · La proyección comercial de la política
-- -----------------------------------------------------------------------------
create or replace view public.v_public_trial_policy
with (security_invoker = false)
as
select
  t.enabled,
  t.trial_plan_code,
  t.trial_duration_hours
from public.commercial_trial_policy t;

comment on view public.v_public_trial_policy is
  'COMMERCIAL-UX-01D · Lo unico de la politica de prueba que se puede enseñar sin sesion: si hay prueba, de que plan y cuanto dura. Sin auditoria, sin updated_by, sin creditos. La vista ES la frontera; commercial_trial_policy sigue cerrada a anon.';

-- -----------------------------------------------------------------------------
-- 2 · Leer, y nada más
-- -----------------------------------------------------------------------------
-- El `revoke` deja escrito en el catálogo de permisos que la ausencia de
-- escritura es una decisión, y sobrevive a que alguien conceda de más por error.
revoke insert, update, delete, truncate, references, trigger
  on public.v_public_trial_policy from anon, authenticated;
grant select on public.v_public_trial_policy to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3 · Comprobación · la superficie es exactamente la declarada
-- -----------------------------------------------------------------------------
do $$
declare
  v_col text;
  v_tab text;
  v_n   integer;
  v_esperadas constant text[] := array[
    'enabled', 'trial_plan_code', 'trial_duration_hours'];
begin
  -- 3.1 · Ni una columna de más. Con la vista como frontera, una columna nueva
  --       es superficie pública el mismo día en que alguien la añada.
  select string_agg(column_name, ', ' order by column_name) into v_col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'v_public_trial_policy'
     and column_name <> all (v_esperadas);
  if v_col is not null then
    raise exception '0214_LA_PRUEBA_EXPONE_COLUMNAS_SIN_DECLARAR: %', v_col;
  end if;

  -- 3.2 · Y en particular, ni auditoría ni créditos.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'v_public_trial_policy'
                and column_name in ('updated_by', 'updated_at', 'trial_ai_credits', 'id')) then
    raise exception '0214_SE_ESCAPO_INFORMACION_INTERNA_DE_LA_PRUEBA';
  end if;

  -- 3.3 · La tabla sigue cerrada sin sesión.
  if has_table_privilege('anon', 'public.commercial_trial_policy', 'SELECT') then
    raise exception '0214_LA_TABLA_DE_LA_PRUEBA_QUEDO_ABIERTA_A_ANON';
  end if;

  -- 3.4 · La vista se lee y no se escribe.
  if not has_table_privilege('anon', 'public.v_public_trial_policy', 'SELECT') then
    raise exception '0214_LA_CONCESION_NO_SURTIO_EFECTO';
  end if;
  if has_table_privilege('anon', 'public.v_public_trial_policy', 'INSERT')
     or has_table_privilege('anon', 'public.v_public_trial_policy', 'UPDATE')
     or has_table_privilege('anon', 'public.v_public_trial_policy', 'DELETE') then
    raise exception '0214_LA_POLITICA_PUBLICA_ES_ESCRIBIBLE';
  end if;

  -- 3.5 · Y quien ya la leía la sigue leyendo: esto AÑADE lectores.
  if not has_table_privilege('authenticated', 'public.v_public_trial_policy', 'SELECT')
     or not has_table_privilege('authenticated', 'public.commercial_trial_policy', 'SELECT') then
    raise exception '0214_SE_PERDIO_EL_LECTOR_AUTENTICADO';
  end if;

  -- 3.6 · LA LISTA BLANCA DE 0202, ENTERA. Ahora son seis.
  select string_agg(c.relname, ', ' order by c.relname) into v_tab
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and has_table_privilege('anon', c.oid, 'SELECT')
     and c.relname not in ('legal_documents', 'v_faq_public',
                           'v_faq_public_categories',
                           'v_public_plan_catalog', 'v_public_plan_limits',
                           'v_public_trial_policy');
  if v_tab is not null then
    raise exception '0202_TABLAS_LEGIBLES_SIN_DECLARAR: %', v_tab;
  end if;

  select count(*) into v_n
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and has_table_privilege('anon', c.oid, 'SELECT');
  if v_n <> 6 then
    raise exception '0214_SUPERFICIE_PUBLICA_INESPERADA: % relaciones', v_n;
  end if;

  -- 3.7 · Y nadie escribe sin sesión, en ninguna parte del esquema.
  select string_agg(c.relname, ', ' order by c.relname) into v_tab
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and (has_table_privilege('anon', c.oid, 'INSERT')
       or has_table_privilege('anon', c.oid, 'UPDATE')
       or has_table_privilege('anon', c.oid, 'DELETE'));
  if v_tab is not null then
    raise exception '0214_ANON_PUEDE_ESCRIBIR: %', v_tab;
  end if;

  raise notice '0214 · la prueba se anuncia sin sesion · 6 relaciones publicas · sin escritura';
end $$;

-- -----------------------------------------------------------------------------
-- 4 · Comprobación · sin sesión se lee lo mismo que con ella
-- -----------------------------------------------------------------------------
do $$
declare
  v_anon integer; v_todo integer;
  v_horas integer; v_plan text;
begin
  select count(*) into v_todo from public.v_public_trial_policy;

  set local role anon;
  select count(*) into v_anon from public.v_public_trial_policy;
  select trial_duration_hours, trial_plan_code into v_horas, v_plan
    from public.v_public_trial_policy;
  reset role;

  if v_anon <> v_todo then
    raise exception '0214_LA_FRONTERA_NO_ENSEÑA_LO_MISMO: anon % frente a %',
      v_anon, v_todo;
  end if;
  if v_horas is null or v_plan is null then
    raise exception '0214_SIN_SESION_NO_SE_PUEDE_ANUNCIAR_LA_PRUEBA';
  end if;

  raise notice '0214 · sin sesion: prueba de % durante % horas', v_plan, v_horas;
end $$;
