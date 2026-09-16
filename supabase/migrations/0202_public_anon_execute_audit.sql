-- =============================================================================
-- Trazaloop · PUBLIC-ANON-EXECUTE-AUDIT-01 · La superficie anónima, declarada
-- =============================================================================
--
-- LA CAUSA, MEDIDA
--
-- Supabase reparte por omisión TODO lo que nace en `public`:
--
--     ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES      TO anon
--     ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON FUNCTIONS TO anon
--     ALTER DEFAULT PRIVILEGES … GRANT rwU ON SEQUENCES   TO anon
--
-- —para `postgres` y para `supabase_admin`—. Así que cada migración de este
-- proyecto, desde la primera, ha ido concediendo a un cliente sin sesión todo
-- lo que creaba. No hacía falta escribir un `grant`: bastaba con no escribir
-- un `revoke`.
--
-- Medido antes de esta migración, en el esquema reconstruido desde las
-- migraciones:
--
--     681 funciones, 94 ejecutables por `anon`
--     420 relaciones, 125 con SELECT concedido a `anon`
--
-- Lo que de verdad se podía LEER sin sesión eran tres —los textos legales y
-- las dos vistas de preguntas frecuentes—, porque la RLS estaba puesta en las
-- 420 y sostuvo el resto. Pero eso es una sola capa, y SECURITY-HOTFIX-01
-- demostró lo que pasa cuando algo se le escapa: catorce funciones
-- `SECURITY DEFINER` —a las que la RLS no frena— devolvían auditorías reales a
-- quien no tenía sesión.
--
--
-- QUÉ HACE ESTA MIGRACIÓN
--
--   1 · Declara las NUEVE funciones que el recorrido público necesita, una a
--       una, y retira `anon` y `PUBLIC` de las otras 672 conservando intacto
--       lo que hoy alcanzan `authenticated` y `service_role`.
--   2 · Declara las TRES relaciones que se leen sin sesión y retira de `anon`
--       todo lo demás, tablas, vistas y secuencias.
--   3 · Corta el grifo: cambia los privilegios por omisión para que lo que
--       nazca mañana NO herede nada. Sin esto, la lista estaría desactualizada
--       en la siguiente migración.
--   4 · Comprueba las tres cosas y ABORTA si algo no cuadra.
--
--
-- LO QUE NO SE TOCA
--
-- Nada de `auth`, `storage`, `realtime` ni `extensions`: esta migración vive
-- en `public` y solo ahí. Y no se retira un permiso a `authenticated` que hoy
-- tenga: varias de estas funciones se llaman desde restricciones CHECK
-- —`organizations_products_services_shape` invoca a
-- `organization_products_services_ok`— y quitárselo rompería un INSERT
-- perfectamente legítimo con un «permission denied» incomprensible.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Las nueve funciones públicas, declaradas y justificadas
-- -----------------------------------------------------------------------------
--
--   public_diagnostic_resolve_campaign(text)
--     Resuelve una campaña por su slug para pintar la puerta. Solo lectura.
--     Entra un slug; sale título, disponibilidad y el testigo del formulario.
--     Frontera: no devuelve ni el identificador de la campaña. Abuso: la
--     respuesta de una campaña inexistente, en borrador o archivada es la
--     misma, así que no se pueden adivinar convocatorias sin anunciar.
--
--   public_diagnostic_begin_submission(text×5, boolean, text×3)
--     Crea la participación. ESCRIBE. Abuso: señuelo, testigo de formulario
--     firmado con antigüedad mínima, y ventana deslizante persistida
--     —3 por correo/24 h, 30 por IP/hora, 500 por campaña/hora—.
--
--   public_diagnostic_get_assessment(text)
--     Entrega el instrumento y lo ya respondido. Solo lectura, atada al
--     testigo. No devuelve peso, criticidad ni umbrales. 600 lecturas/hora.
--
--   public_diagnostic_save_progress(text, text, jsonb)
--     Guarda una sección. ESCRIBE. Atada al testigo, con tope de lote y
--     120 guardados/hora por participación.
--
--   public_diagnostic_get_result(text)
--     Devuelve la instantánea congelada. Solo lectura, atada al testigo.
--
--   public_diagnostic_resume_submission(text)
--     Dice a qué campaña pertenece un testigo. Solo lectura, sin datos
--     personales.
--
--   quality_resolve_survey_token(text) · quality_submit_survey_response(text, jsonb)
--     La encuesta pública de QUALITY-12 (`/survey/[token]`). La segunda
--     ESCRIBE. Abuso: el testigo es de un solo uso y consumirlo ES la
--     comprobación.
--
--   resolve_textile_passport_share(text)
--     El pasaporte textil compartido por enlace privado
--     (`/textile-passport-share/[token]`). Solo lectura, atada al testigo.
--
-- Las tres últimas son anteriores a los diagnósticos públicos y se conservan
-- porque tienen consumidor real: se comprobó en el repositorio, no se supuso.

create temp table _permitidas_fn (nombre text primary key) on commit drop;
insert into _permitidas_fn values
  ('public_diagnostic_resolve_campaign'),
  ('public_diagnostic_begin_submission'),
  ('public_diagnostic_get_assessment'),
  ('public_diagnostic_save_progress'),
  ('public_diagnostic_get_result'),
  ('public_diagnostic_resume_submission'),
  ('quality_resolve_survey_token'),
  ('quality_submit_survey_response'),
  ('resolve_textile_passport_share');

-- -----------------------------------------------------------------------------
-- 2 · Todo lo demás deja de ser alcanzable sin sesión
-- -----------------------------------------------------------------------------
-- Se fotografía ANTES lo que alcanzan `authenticated` y `service_role`, porque
-- retirar `PUBLIC` se lo quitaría de paso: se revoca y se les devuelve
-- exactamente lo que tenían. Ni un permiso menos, ni uno más.

create temp table _foto_fn on commit drop as
  select p.oid,
         p.oid::regprocedure::text as firma,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
         has_function_privilege('service_role',  p.oid, 'EXECUTE') as srv
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname not in (select nombre from _permitidas_fn);

do $$
declare f record;
begin
  for f in select * from _foto_fn loop
    execute format('revoke all on function %s from public, anon', f.firma);
    if f.auth then
      execute format('grant execute on function %s to authenticated', f.firma);
    end if;
    if f.srv then
      execute format('grant execute on function %s to service_role', f.firma);
    end if;
  end loop;
  raise notice '0202 · % funciones retiradas del alcance anónimo',
    (select count(*) from _foto_fn);
end $$;

-- Y las nueve, explícitas: se revoca también su concesión heredada a `PUBLIC`
-- y se concede a quien debe, por su nombre.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text as firma,
                  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f'
              and p.proname in (select nombre from _permitidas_fn)
  loop
    execute format('revoke all on function %s from public', f.firma);
    execute format('grant execute on function %s to anon', f.firma);
    if f.auth then
      execute format('grant execute on function %s to authenticated', f.firma);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3 · Las tres relaciones que se leen sin sesión
-- -----------------------------------------------------------------------------
--   legal_documents          — los textos de `/terms` y `/privacy`. Leerlos sin
--                              cuenta no es una filtración: es el punto.
--   v_faq_public             — las preguntas frecuentes de `/faq`.
--   v_faq_public_categories  — sus categorías.
--
-- Las tres son PÚBLICAS POR DISEÑO y ya lo eran: `legal_documents` tiene
-- además su política `legal_documents_select_public`. Lo que cambia es que
-- ahora son las únicas, y que solo se concede SELECT.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select on public.legal_documents          to anon;
grant select on public.v_faq_public             to anon;
grant select on public.v_faq_public_categories  to anon;

-- 3.1 · Y una política que estaba apuntando a todo el mundo
--
-- LO QUE ESTO ARREGLA, Y CÓMO SE DESCUBRIÓ
--
-- Al retirar `is_platform_staff()` del alcance anónimo, `/terms` y `/privacy`
-- dejaron de cargar: «permission denied for function is_platform_staff». No
-- era un permiso de tabla — anon tiene su SELECT— sino RLS.
--
-- `legal_documents` tiene DOS políticas permisivas de lectura: la pública
-- —`status = 'active'`— y la del personal de plataforma. PostgreSQL las une
-- con OR y las evalúa TODAS, y la expresión la ejecuta QUIEN CONSULTA. Así
-- que una lectura anónima acababa llamando a una función de personal.
--
-- La solución no es devolverle la función a `anon`: es que una política de
-- PERSONAL no se dirija a `public`. Se reapunta a `authenticated`, que es
-- quien puede ser personal. El acceso del personal no cambia; lo que cambia
-- es que una lectura sin sesión ya no evalúa nada suyo.

drop policy if exists legal_documents_staff_select on public.legal_documents;
create policy legal_documents_staff_select on public.legal_documents
  for select to authenticated using (public.is_platform_staff());

-- -----------------------------------------------------------------------------
-- 4 · Y se cierra el grifo, que es lo que impide que esto vuelva
-- -----------------------------------------------------------------------------
-- Sin esto, la próxima tabla y la próxima función volverían a nacer abiertas y
-- la lista de arriba quedaría desfasada en la siguiente migración. Lo que
-- nazca a partir de ahora NO concede nada a `anon`; quien necesite abrir algo
-- tendrá que escribirlo, que es exactamente lo que se quiere.

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- LO QUE ESAS TRES LÍNEAS SÍ CIERRAN, Y LO QUE NO
--
-- Para TABLAS y SECUENCIAS funcionan: una tabla creada después de esta
-- migración ya no nace concedida a `anon`. Comprobado creando una.
--
-- Para FUNCIONES no, y conviene precisar por qué, porque es fácil confundir
-- dos cosas distintas:
--
--   · `REVOKE EXECUTE ON FUNCTION f() FROM PUBLIC` sobre una función que YA
--     existe funciona perfectamente. Es lo que hace el bucle de arriba con las
--     673, y se puede comprobar: no queda ni una con `=X/`.
--
--   · `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`,
--     que gobierna las FUTURAS, es un no-op en este servidor. Medido en
--     PostgreSQL 17.6, en un esquema recién creado y sin filas previas: la
--     sentencia se acepta, NO deja fila en `pg_default_acl`, y la siguiente
--     función nace con `proacl = NULL` — que no significa «sin permisos» sino
--     «los de por omisión», y los de por omisión incluyen EXECUTE para PUBLIC.
--     Se probó también con `FOR ROLE`, con `ON ROUTINES` y con un GRANT previo
--     que sí queda registrado, lo que descarta que el mecanismo no funcione.
--
-- Así que para las futuras hace falta otra cosa.

-- -----------------------------------------------------------------------------
-- 5 · Y una puerta que se cierra sola
-- -----------------------------------------------------------------------------
--
-- Un disparador de EVENTO sobre `CREATE FUNCTION`: cada función que nazca en
-- `public` pierde `PUBLIC` y `anon` en el mismo comando que la crea. Esto
-- convierte «lo detectamos en la siguiente batería» en «no llega a existir
-- abierta», que es lo que pedía el principio de negar por omisión.
--
-- LAS NUEVE DECLARADAS SE SALTAN EL DISPARADOR, y no por comodidad: varias
-- migraciones futuras harán `create or replace` sobre ellas —0201 ya lo hizo
-- con `begin_submission`— y si el disparador les quitara la concesión, la
-- página pública dejaría de funcionar en cuanto alguien tocara una coma sin
-- acordarse de volver a concederla. La lista va escrita aquí, a mano: añadir
-- una décima exige editar este disparador, que es justo el punto de revisión
-- que se quiere.
--
-- Y es TOLERANTE: si no se puede revocar sobre una función concreta —otro rol,
-- una extensión— avisa y sigue en vez de tumbar el DDL. Bloquear la creación
-- de funciones de la plataforma por defender una frontera nuestra sería
-- cambiar un riesgo por una avería. Para ese hueco queda la batería de lista
-- cerrada, que sigue siendo obligatoria.

create or replace function public.trazaloop_deny_public_execute()
returns event_trigger
language plpgsql
as $et$
declare
  r record;
  -- Las mismas nueve de la sección 1. Si cambian allí, cambian aquí.
  v_permitidas text[] := array[
    'public_diagnostic_resolve_campaign', 'public_diagnostic_begin_submission',
    'public_diagnostic_get_assessment', 'public_diagnostic_save_progress',
    'public_diagnostic_get_result', 'public_diagnostic_resume_submission',
    'quality_resolve_survey_token', 'quality_submit_survey_response',
    'resolve_textile_passport_share'];
begin
  for r in select * from pg_event_trigger_ddl_commands()
            where command_tag = 'CREATE FUNCTION' and schema_name = 'public'
  loop
    if split_part(split_part(r.object_identity, '(', 1), '.', 2) = any(v_permitidas) then
      continue;
    end if;
    begin
      execute format('revoke execute on function %s from public, anon', r.object_identity);
    exception when others then
      raise warning 'trazaloop: no se pudo cerrar % al público (%)',
        r.object_identity, sqlerrm;
    end;
  end loop;
end $et$;

revoke all on function public.trazaloop_deny_public_execute()
  from public, anon, authenticated;

drop event trigger if exists trazaloop_deny_public_execute_trg;
create event trigger trazaloop_deny_public_execute_trg
  on ddl_command_end
  when tag in ('CREATE FUNCTION')
  execute function public.trazaloop_deny_public_execute();

comment on function public.trazaloop_deny_public_execute() is
  '0202 · Cierra al público toda función nueva de `public`. Existe porque '
  'ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE FROM PUBLIC es un no-op para '
  'objetos futuros en este servidor; ver PUBLIC-ANON-EXECUTE-AUDIT-01.';

-- `supabase_admin` tiene su propio juego de privilegios por omisión y puede que
-- no seamos miembros suyos. Se COMPRUEBA antes de intentarlo, no se intenta y
-- se captura el error: un `exception` en plpgsql deshace hasta su punto de
-- retorno interno, y eso incluye el `set role postgres` con el que se aplica la
-- migración. La primera versión de esta migración hacía justo eso y reventaba
-- doscientas líneas después, al registrar el número de versión, con un
-- «permission denied» que no tenía nada que ver.
do $$
begin
  if pg_has_role(current_user, 'supabase_admin', 'MEMBER') then
    execute 'alter default privileges for role supabase_admin in schema public '
         || 'revoke all on tables from anon';
    execute 'alter default privileges for role supabase_admin in schema public '
         || 'revoke all on sequences from anon';
    execute 'alter default privileges for role supabase_admin in schema public '
         || 'revoke execute on functions from anon';
    raise notice '0202 · privilegios por omisión de supabase_admin también cerrados';
  else
    raise notice '0202 · AVISO: no se cierran los privilegios por omisión de '
      'supabase_admin (no somos miembros del rol). Lo que cree ESE rol volvería '
      'a nacer abierto; la prueba de lista blanca lo detectaría.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6 · Se comprueba antes de confirmar
-- -----------------------------------------------------------------------------

do $$
declare v_fn text; v_tab text; v_esc text; v_n int; v_rol text := current_user;
begin
  -- 6.1 · Funciones: ni una de más, ni una de menos.
  select string_agg(p.proname, ', ' order by p.proname) into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.proname not in (select nombre from _permitidas_fn);
  if v_fn is not null then
    raise exception '0202_FUNCIONES_SIN_DECLARAR: %', v_fn;
  end if;

  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_n <> 9 then
    raise exception '0202_SUPERFICIE_INESPERADA: % funciones públicas', v_n;
  end if;

  -- 6.2 · Relaciones: solo las tres, y solo de lectura.
  select string_agg(c.relname, ', ' order by c.relname) into v_tab
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
     and has_table_privilege('anon', c.oid, 'SELECT')
     and c.relname not in ('legal_documents', 'v_faq_public', 'v_faq_public_categories');
  if v_tab is not null then
    raise exception '0202_TABLAS_LEGIBLES_SIN_DECLARAR: %', v_tab;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into v_esc
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','f')
     and (has_table_privilege('anon', c.oid, 'INSERT')
       or has_table_privilege('anon', c.oid, 'UPDATE')
       or has_table_privilege('anon', c.oid, 'DELETE'));
  if v_esc is not null then
    raise exception '0202_TABLAS_ESCRIBIBLES_POR_ANON: %', v_esc;
  end if;

  -- 6.3 · Y la puerta del subsistema sigue como la dejó 0201.
  if has_function_privilege('anon',
       'public.public_diagnostic_finalize_submission(text, numeric, text, integer, jsonb, jsonb)',
       'EXECUTE') then
    raise exception '0202_CIERRE_ALCANZABLE_POR_ANON';
  end if;

  -- 6.4 · Y lo que de verdad importa: que lo público SIGA leyéndose.
  --       La comprobación anterior mira permisos; esta LEE.
  --
  --       Se vuelve al rol ANTERIOR por su nombre, no con `reset role`: eso
  --       último devuelve al rol con el que se abrió la sesión —en Supabase,
  --       un rol efímero sin permisos— y dejaba la migración sin poder
  --       registrarse doscientas líneas más abajo.
  set local role anon;
  perform 1 from public.legal_documents limit 1;
  perform 1 from public.v_faq_public limit 1;
  perform 1 from public.v_faq_public_categories limit 1;
  execute format('set local role %I', v_rol);

  -- 6.5 · El disparador, probado creando una función de verdad y midiendo.
  --       Declararlo no basta: podría no dispararse y nadie se enteraría.
  execute 'create function public._prueba_cierre_automatico() returns int '
       || 'language sql immutable as ''select 1''';
  if has_function_privilege('anon', 'public._prueba_cierre_automatico()', 'EXECUTE') then
    raise exception '0202_DISPARADOR_NO_CIERRA: una función nueva nació alcanzable';
  end if;
  execute 'drop function public._prueba_cierre_automatico()';

  raise notice '0202 · nueve funciones, tres relaciones de lectura, cero escrituras, '
    'y lo que nazca mañana se cierra solo';
end $$;

-- Las dos tablas temporales se van solas al confirmar (`on commit drop`).
-- Borrarlas a mano exigía ser su dueño, y el rol efímero con el que se aplica
-- una migración en Supabase no siempre lo es: la migración entera reventaba en
-- la última línea después de haber hecho bien todo lo anterior.
