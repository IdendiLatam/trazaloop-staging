-- =============================================================================
-- Trazaloop · COMMERCIAL-UX-01D0 · El catálogo comercial se lee sin sesión
-- =============================================================================
--
-- QUÉ HACE FALTA Y POR QUÉ
--
-- Una página de precios la mira quien todavía no es cliente. Hoy
-- `v_public_plan_catalog` y `v_public_plan_limits` están concedidas solo a
-- `authenticated`, así que pedirle a alguien que inicie sesión para ver cuánto
-- cuesta el producto es exactamente lo contrario de lo que una página pública
-- tiene que hacer.
--
--
-- LO QUE SE MIDIÓ ANTES DE TOCAR NADA
--
-- Contra la base, con el rol suplantado, no leyendo el esquema:
--
--   anon  → las dos vistas .......... DENEGADO
--   anon  → las cuatro tablas ....... DENEGADO
--   authenticated → catálogo ........ 3 filas   · límites  57 filas
--   postgres      → catálogo ........ 3 filas   · límites  57 filas
--
-- La última línea es la que decide. `authenticated` y `postgres` ven LO MISMO,
-- así que la RLS de las tablas de debajo no está filtrando nada a través de
-- estas vistas: las vistas ya restringen a revisión publicada, no retirada y
-- recurso público, y las políticas permiten justo eso. Por tanto cambiar cómo
-- se evalúan no puede ampliar lo que alguien ya veía. No es una suposición: son
-- dos cuentas iguales.
--
--
-- POR QUÉ LA VISTA ES LA FRONTERA, Y NO UNA POLÍTICA PARA `anon`
--
-- La alternativa era dejar las vistas como `security_invoker` y abrirle a
-- `anon` las cuatro tablas de debajo con políticas nuevas. Se descartó con
-- motivo, no por comodidad:
--
-- Conceder SELECT sobre `plan_revisions` publica esa TABLA en PostgREST. La
-- RLS filtra FILAS, no COLUMNAS, así que cualquiera podría pedir
-- `internal_notes` de una revisión publicada. Las notas internas son
-- precisamente lo que 0162 prometió que no saldría nunca por el catálogo
-- público. Abrir cuatro tablas para enseñar tres precios es ampliar la
-- superficie, no acotarla.
--
-- Con la vista como frontera se concede UNA relación por cada cosa, la
-- proyección es fija y las tablas siguen cerradas a cal y canto.
--
--
-- ES EL PATRÓN QUE ESTE REPOSITORIO YA ELIGIÓ
--
-- `v_faq_public`, `v_faq_public_categories` y `legal_documents` se leen sin
-- sesión exactamente así desde 0155, y 0202 lo ratificó. No se inventa un
-- mecanismo nuevo para el mismo problema.
--
--
-- Y SE EXTIENDE LA DECLARACIÓN, NO SE ELUDE
--
-- 0202 dejó una lista blanca CERRADA de las relaciones legibles sin sesión, con
-- tres nombres. Añadir dos sin tocarla convertiría en falsa una declaración de
-- seguridad que dice estar cerrada. Aquí se vuelve a comprobar entera, con los
-- cinco nombres, para que la declaración siga siendo verdad el día que alguien
-- la lea.
-- =============================================================================

do $$
begin
  if to_regclass('public.v_public_plan_catalog') is null
     or to_regclass('public.v_public_plan_limits') is null then
    raise exception '0213 presupone las vistas publicas de 0162';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1 · La vista pasa a ser la frontera
-- -----------------------------------------------------------------------------
-- Con `security_invoker = false` la vista se evalúa con los privilegios de su
-- propietario, así que quien la consulta NO necesita permiso sobre las tablas
-- de debajo. Eso es justo lo que se quiere: que la única forma de ver el
-- catálogo sin sesión sea la proyección ya sanitizada, y ninguna otra.
alter view public.v_public_plan_catalog set (security_invoker = false);
alter view public.v_public_plan_limits  set (security_invoker = false);

-- -----------------------------------------------------------------------------
-- 2 · Y se concede lo mínimo: leer
-- -----------------------------------------------------------------------------
-- El `revoke` no es decorativo. Deja escrito en el catálogo de permisos que la
-- ausencia de escritura es una DECISIÓN y no un descuido, y sobrevive a que
-- alguien conceda de más por error más adelante.
revoke insert, update, delete, truncate, references, trigger
  on public.v_public_plan_catalog, public.v_public_plan_limits from anon;
grant select on public.v_public_plan_catalog to anon;
grant select on public.v_public_plan_limits  to anon;

comment on view public.v_public_plan_catalog is
  'PE-04B1 · Lo unico que se puede enseñar en publico de un plan. Sin internal_notes, sin borradores, sin revisiones retiradas. Los precios son SIN IMPUESTOS. COMMERCIAL-UX-01D0: legible sin sesion; la vista ES la frontera, las tablas de debajo siguen cerradas.';

comment on view public.v_public_plan_limits is
  'PE-04B1 · Los limites que se le pueden enseñar a un cliente; los marcados is_public = false no salen. COMMERCIAL-UX-01D0: legible sin sesion por la misma razon que su hermana.';

-- -----------------------------------------------------------------------------
-- 3 · Comprobación · la superficie pública es EXACTAMENTE la que se declara
-- -----------------------------------------------------------------------------
do $$
declare
  v_col   text;
  v_tab   text;
  v_n     integer;
  v_esperadas_catalogo constant text[] := array[
    'plan_code', 'display_order', 'plan_revision_id', 'display_name',
    'description', 'public_conditions', 'price_state', 'currency',
    'monthly_price_minor', 'annual_price_minor', 'effective_from'];
  v_esperadas_limites  constant text[] := array[
    'plan_code', 'plan_revision_id', 'resource_code', 'resource_label',
    'unit', 'limit_state', 'limit_value'];
begin
  -- 3.1 · Ni una columna de más. Si alguien amplía la proyección, esto se cae:
  --       con la vista como frontera, una columna nueva es superficie pública
  --       inmediata.
  select string_agg(column_name, ', ' order by column_name) into v_col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'v_public_plan_catalog'
     and column_name <> all (v_esperadas_catalogo);
  if v_col is not null then
    raise exception '0213_CATALOGO_EXPONE_COLUMNAS_SIN_DECLARAR: %', v_col;
  end if;

  select string_agg(column_name, ', ' order by column_name) into v_col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'v_public_plan_limits'
     and column_name <> all (v_esperadas_limites);
  if v_col is not null then
    raise exception '0213_LIMITES_EXPONEN_COLUMNAS_SIN_DECLARAR: %', v_col;
  end if;

  -- 3.2 · Y las notas internas NO están, que es la promesa concreta de 0162.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public'
                and table_name in ('v_public_plan_catalog', 'v_public_plan_limits')
                and column_name in ('internal_notes', 'created_by', 'published_by')) then
    raise exception '0213_SE_ESCAPO_INFORMACION_INTERNA';
  end if;

  -- 3.3 · Las tablas de debajo siguen cerradas sin sesión.
  select string_agg(c.relname, ', ' order by c.relname) into v_tab
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and c.relname in ('plans', 'plan_revisions', 'plan_revision_limits',
                       'plan_resources')
     and has_table_privilege('anon', c.oid, 'SELECT');
  if v_tab is not null then
    raise exception '0213_TABLAS_INTERNAS_ABIERTAS_A_ANON: %', v_tab;
  end if;

  -- 3.4 · Leer, y nada más.
  if has_table_privilege('anon', 'public.v_public_plan_catalog', 'INSERT')
     or has_table_privilege('anon', 'public.v_public_plan_catalog', 'UPDATE')
     or has_table_privilege('anon', 'public.v_public_plan_catalog', 'DELETE')
     or has_table_privilege('anon', 'public.v_public_plan_limits', 'INSERT')
     or has_table_privilege('anon', 'public.v_public_plan_limits', 'UPDATE')
     or has_table_privilege('anon', 'public.v_public_plan_limits', 'DELETE') then
    raise exception '0213_EL_CATALOGO_PUBLICO_ES_ESCRIBIBLE';
  end if;

  if not has_table_privilege('anon', 'public.v_public_plan_catalog', 'SELECT')
     or not has_table_privilege('anon', 'public.v_public_plan_limits', 'SELECT') then
    raise exception '0213_LA_CONCESION_NO_SURTIO_EFECTO';
  end if;

  -- 3.5 · `authenticated` conserva lo suyo: esto AÑADE lectores, no los cambia.
  if not has_table_privilege('authenticated', 'public.v_public_plan_catalog', 'SELECT')
     or not has_table_privilege('authenticated', 'public.v_public_plan_limits', 'SELECT') then
    raise exception '0213_SE_PERDIO_EL_LECTOR_AUTENTICADO';
  end if;

  -- 3.6 · LA LISTA BLANCA DE 0202, ENTERA Y AL DÍA.
  --
  --       0202 la dejó cerrada con tres nombres. Ahora son cinco y se declaran
  --       aquí: una lista blanca que no se actualiza deja de ser una lista
  --       blanca y pasa a ser un comentario.
  select string_agg(c.relname, ', ' order by c.relname) into v_tab
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and has_table_privilege('anon', c.oid, 'SELECT')
     and c.relname not in ('legal_documents', 'v_faq_public',
                           'v_faq_public_categories',
                           'v_public_plan_catalog', 'v_public_plan_limits');
  if v_tab is not null then
    raise exception '0202_TABLAS_LEGIBLES_SIN_DECLARAR: %', v_tab;
  end if;

  select count(*) into v_n
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and has_table_privilege('anon', c.oid, 'SELECT');
  if v_n <> 5 then
    raise exception '0213_SUPERFICIE_PUBLICA_INESPERADA: % relaciones', v_n;
  end if;

  -- 3.7 · Y nadie escribe sin sesión, en ninguna parte del esquema.
  select string_agg(c.relname, ', ' order by c.relname) into v_tab
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and (has_table_privilege('anon', c.oid, 'INSERT')
       or has_table_privilege('anon', c.oid, 'UPDATE')
       or has_table_privilege('anon', c.oid, 'DELETE'));
  if v_tab is not null then
    raise exception '0213_ANON_PUEDE_ESCRIBIR: %', v_tab;
  end if;

  raise notice '0213 · catalogo comercial legible sin sesion · 5 relaciones publicas · sin escritura';
end $$;

-- -----------------------------------------------------------------------------
-- 4 · Comprobación · lo que se lee sin sesión es lo mismo que con ella
-- -----------------------------------------------------------------------------
-- Si los dos números no coincidieran, la frontera estaría enseñando de más o de
-- menos, y las dos cosas son defectos distintos e igual de graves.
do $$
declare
  v_anon_cat integer; v_anon_lim integer;
  v_todo_cat integer; v_todo_lim integer;
begin
  select count(*) into v_todo_cat from public.v_public_plan_catalog;
  select count(*) into v_todo_lim from public.v_public_plan_limits;

  set local role anon;
  select count(*) into v_anon_cat from public.v_public_plan_catalog;
  select count(*) into v_anon_lim from public.v_public_plan_limits;
  reset role;

  if v_anon_cat <> v_todo_cat or v_anon_lim <> v_todo_lim then
    raise exception '0213_LA_FRONTERA_NO_ENSEÑA_LO_MISMO: anon %/% frente a %/%',
      v_anon_cat, v_anon_lim, v_todo_cat, v_todo_lim;
  end if;
  if v_anon_cat = 0 then
    raise exception '0213_SIN_SESION_NO_SE_VE_NINGUN_PLAN';
  end if;

  raise notice '0213 · sin sesion se leen % planes y % limites, igual que con ella',
    v_anon_cat, v_anon_lim;
end $$;
