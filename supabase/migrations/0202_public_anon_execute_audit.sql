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

create temp table _permitidas_fn (nombre text primary key);
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

create temp table _foto_fn as
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

-- LO QUE NO SE PUDO CERRAR, Y CÓMO SE CUBRE
--
-- Las tres líneas de arriba funcionan para TABLAS y SECUENCIAS: una tabla
-- creada después de esta migración ya no nace legible por `anon`. Comprobado.
--
-- Para FUNCIONES no alcanza, y conviene que quede escrito. Además de la
-- concesión de Supabase a `anon` —que sí se retira— PostgreSQL concede por su
-- cuenta EXECUTE a `PUBLIC` sobre toda función nueva, y `anon` lo hereda por
-- ahí. Se intentaron las tres formas documentadas de quitarlo:
--
--     ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM public
--     ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON ROUTINES  FROM public
--     … GRANT a public y después REVOKE, por si hacía falta la entrada previa
--
-- y en esta instancia ninguna surte efecto: la función siguiente sigue
-- naciendo con `=X/postgres`. No se deja una sentencia que no hace nada.
--
-- Así que para funciones el control NO es la prevención sino la DETECCIÓN, y
-- es un control real: `npm run test:pd01h-db` lleva la lista cerrada de las
-- nueve y se pone roja en cuanto aparece una décima sin declarar. Cada
-- migración que cree una función tiene que revocarla explícitamente —como
-- hacen 0198, 0199, 0201 y 0203— y si alguien lo olvida, lo dice la batería
-- antes de que llegue a ninguna parte.

-- `supabase_admin` tiene su propio juego de privilegios por omisión y puede que
-- no seamos miembros suyos. Si no se puede, se dice y se sigue: la guarda de
-- abajo y la prueba de lista blanca cubren el caso.
do $$
begin
  execute 'alter default privileges for role supabase_admin in schema public '
       || 'revoke all on tables from anon';
  execute 'alter default privileges for role supabase_admin in schema public '
       || 'revoke all on sequences from anon';
  execute 'alter default privileges for role supabase_admin in schema public '
       || 'revoke execute on functions from anon';
  raise notice '0202 · privilegios por omisión de supabase_admin también cerrados';
exception when insufficient_privilege then
  raise notice '0202 · AVISO: no se pudieron cerrar los privilegios por omisión '
    'de supabase_admin (hace falta ser miembro del rol). Lo que cree ESE rol '
    'volvería a nacer abierto; la prueba de lista blanca lo detectaría.';
end $$;

-- -----------------------------------------------------------------------------
-- 5 · Se comprueba antes de confirmar
-- -----------------------------------------------------------------------------

do $$
declare v_fn text; v_tab text; v_esc text; v_n int;
begin
  -- 5.1 · Funciones: ni una de más, ni una de menos.
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

  -- 5.2 · Relaciones: solo las tres, y solo de lectura.
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

  -- 5.3 · Y la puerta del subsistema sigue como la dejó 0201.
  if has_function_privilege('anon',
       'public.public_diagnostic_finalize_submission(text, numeric, text, integer, jsonb, jsonb)',
       'EXECUTE') then
    raise exception '0202_CIERRE_ALCANZABLE_POR_ANON';
  end if;

  -- 5.4 · Y lo que de verdad importa: que lo público SIGA leyéndose.
  --       La comprobación anterior mira permisos; esta LEE.
  set local role anon;
  perform 1 from public.legal_documents limit 1;
  perform 1 from public.v_faq_public limit 1;
  perform 1 from public.v_faq_public_categories limit 1;
  reset role;

  raise notice '0202 · nueve funciones, tres relaciones de lectura, cero escrituras';
end $$;

drop table _permitidas_fn;
drop table _foto_fn;
