-- ===========================================================================
-- Trazaloop v1.0.0 · PUBLICACIÓN DE DOCUMENTOS LEGALES v2
-- scripts/release/v1/publish-legal-v2.sql
-- ===========================================================================
--
--   ####################################################################
--   #                                                                  #
--   #   ESTE SCRIPT NO SE HA EJECUTADO Y NO DEBE EJECUTARSE HASTA      #
--   #   QUE UN RESPONSABLE LEGAL APRUEBE EL TEXTO DE ABAJO.            #
--   #                                                                  #
--   #   El contenido de las cláusulas es una PROPUESTA TÉCNICA cuyo    #
--   #   único objetivo es retirar el encuadre de «versión preliminar / #
--   #   beta / lanzamiento controlado». No es asesoría jurídica.       #
--   #                                                                  #
--   #   Lee antes: docs/releases/V1.0.0_LEGAL_REVIEW.md                #
--   #                                                                  #
--   ####################################################################
--
-- QUÉ HACE
--   Publica `terms/v2` y `privacy/v2` como documentos ACTIVOS y archiva
--   `terms/v1` y `privacy/v1` (status = 'archived').
--
-- QUÉ NO HACE
--   · NO modifica la migración histórica 0066 (ni ninguna otra).
--   · NO es una migración: no crea, altera ni elimina esquema. No existe
--     ni debe existir un 0103 para esto.
--   · NO borra ninguna fila. `v1` se archiva, nunca se elimina.
--   · NO toca `user_legal_acceptances`: las aceptaciones históricas de v1
--     siguen existiendo como prueba de lo que cada usuario aceptó y cuándo.
--
-- GARANTÍAS
--   · TRANSACCIONAL: un único BEGIN…COMMIT. O todo, o nada.
--   · FALLA SI EL ESTADO NO ES EL ESPERADO: aborta si no encuentra
--     exactamente un terms/v1 activo y un privacy/v1 activo con el texto
--     preliminar conocido.
--   · IDEMPOTENTE: si v2 ya está publicado y activo, no hace nada y avisa.
--
-- REQUISITOS
--   Las políticas RLS de `legal_documents` (0066) solo permiten INSERT y
--   UPDATE a `public.is_platform_superadmin()`. Ejecuta este script con la
--   conexión directa del operador (SUPABASE_DB_URL, rol propietario) o
--   desde el SQL Editor de Supabase, no desde la aplicación.
--
-- EJECUCIÓN (solo tras aprobación legal y con copia de seguridad previa)
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--        -f scripts/release/v1/publish-legal-v2.sql
--
-- REVERSIÓN
--   update public.legal_documents set status='archived'
--     where document_type in ('terms','privacy') and version='v2';
--   update public.legal_documents set status='active'
--     where document_type in ('terms','privacy') and version='v1';
--   (No borres v2: archívalo, igual que v1.)
-- ===========================================================================

\pset pager off

begin;

do $publish$
declare
  v_terms_v1_id     uuid;
  v_privacy_v1_id   uuid;
  v_terms_v2_count  int;
  v_privacy_v2_count int;
  v_active_count    int;

  -- -----------------------------------------------------------------------
  -- TEXTO PROPUESTO · TÉRMINOS DE USO v2
  -- -----------------------------------------------------------------------
  -- Cambios respecto de v1, y NADA más:
  --   · se elimina el párrafo de preámbulo («versión preliminar … beta /
  --     lanzamiento controlado»);
  --   · la cláusula 1 amplía el alcance a los dos módulos funcionales
  --     (ver riesgo L-2 en el informe: si el área legal prefiere NO
  --     ampliar el alcance ahora, sustituye la cláusula 1 por su texto
  --     literal de v1, que está justo debajo comentado);
  --   · la cláusula 4 conserva íntegro su efecto jurídico (el documento
  --     puede actualizarse y se exigirá nueva aceptación) y solo pierde
  --     la referencia a «versión preliminar» y a un «lanzamiento
  --     definitivo» futuro;
  --   · las cláusulas 2 y 3 son IDÉNTICAS a v1, carácter por carácter.
  --
  -- Cláusula 1 de v1, por si se decide conservarla sin ampliar:
  --   '1. Trazaloop es una plataforma para gestionar trazabilidad,
  --    documentación técnica (TrazaDocs), evidencias y cálculo de
  --    contenido reciclado en procesos asociados a NTC 6632 y UNE-EN
  --    15343.'
  -- -----------------------------------------------------------------------
  c_terms_v2_title text :=
    'Términos de uso de Trazaloop';

  c_terms_v2_content text :=
       E'1. Trazaloop es una plataforma modular para gestionar trazabilidad, documentación técnica (TrazaDocs), evidencias y preparación técnica de productos, procesos y cadenas de valor. Sus módulos disponibles son Trazaloop CPR (trazabilidad, documentación técnica, evidencias y cálculo de contenido reciclado en procesos asociados a NTC 6632 y UNE-EN 15343) y Trazaloop Textiles (trazabilidad de productos de confección, composición de fibras, evidencias, circularidad y pasaporte técnico textil).\n\n'
    || E'2. Trazaloop no garantiza ni promete la obtención de ninguna certificación. La plataforma ofrece soporte técnico y herramientas de revisión técnica para organizar la información de tu producto objetivo; la evaluación y decisión de certificación, si aplica, corresponde siempre a un organismo externo independiente de Trazaloop.\n\n'
    || E'3. El uso de la plataforma está sujeto a los planes y límites vigentes (Demo, Full, Extra) descritos dentro de la plataforma. Trazaloop puede suspender el acceso de una cuenta que incumpla estos términos, sin perder los datos ya cargados.\n\n'
    || E'4. Este documento puede actualizarse. Se te pedirá aceptar cualquier versión nueva antes de continuar usando la plataforma.';

  -- -----------------------------------------------------------------------
  -- TEXTO PROPUESTO · POLÍTICA DE PRIVACIDAD v2
  -- -----------------------------------------------------------------------
  -- Cambios respecto de v1, y NADA más:
  --   · se elimina el párrafo de preámbulo;
  --   · la cláusula 5 pierde solo el encuadre «versión preliminar /
  --     lanzamiento definitivo», conservando su efecto;
  --   · las cláusulas 1 a 4 son IDÉNTICAS a v1, carácter por carácter.
  -- -----------------------------------------------------------------------
  c_privacy_v2_title text :=
    'Política de privacidad de Trazaloop';

  c_privacy_v2_content text :=
       E'1. Trazaloop recopila los datos que registras dentro de la plataforma (datos de empresa, catálogos, evidencias, trazabilidad, documentos y tickets de soporte) con el único fin de operar el servicio para tu organización.\n\n'
    || E'2. Usamos tu información para: operar la plataforma, brindarte soporte técnico a través del Centro de soporte, proteger la seguridad de tu cuenta y de la de otras empresas (aislamiento entre organizaciones), y mejorar el servicio.\n\n'
    || E'3. No compartimos tus datos con terceros salvo cuando sea necesario para operar la plataforma (por ejemplo, el proveedor de infraestructura donde se aloja Trazaloop) o cuando la ley lo exija.\n\n'
    || E'4. Puedes solicitar información sobre tus datos o su eliminación contactando al equipo de Trazaloop desde el Centro de soporte.\n\n'
    || E'5. Este documento puede actualizarse. Se te pedirá aceptar cualquier versión nueva antes de continuar usando la plataforma.';
begin

  -- =======================================================================
  -- PASO 0 · IDEMPOTENCIA: ¿ya está publicado v2?
  -- =======================================================================
  select count(*) into v_terms_v2_count
  from public.legal_documents
  where document_type = 'terms' and version = 'v2' and status = 'active';

  select count(*) into v_privacy_v2_count
  from public.legal_documents
  where document_type = 'privacy' and version = 'v2' and status = 'active';

  if v_terms_v2_count = 1 and v_privacy_v2_count = 1 then
    raise notice '';
    raise notice 'SIN CAMBIOS · terms/v2 y privacy/v2 ya están activos.';
    raise notice 'El script es idempotente: no se ha modificado nada.';
    raise notice '';
    return;
  end if;

  if v_terms_v2_count <> v_privacy_v2_count then
    raise exception
      E'ESTADO INCONSISTENTE · terms/v2 activos = %, privacy/v2 activos = %.\n'
      '  Se esperaba 0 y 0 (publicación pendiente) o 1 y 1 (ya publicado).\n'
      '  Un estado a medias exige revisión humana. No se ha cambiado nada.',
      v_terms_v2_count, v_privacy_v2_count;
  end if;

  -- =======================================================================
  -- PASO 1 · EXIGIR EL ESTADO DE PARTIDA EXACTO
  -- =======================================================================
  -- Debe existir exactamente UN terms/v1 activo y UN privacy/v1 activo, y
  -- su contenido debe ser el preliminar conocido de la migración 0066. Si
  -- alguien ya editó el texto a mano, este script se niega a actuar.
  -- =======================================================================

  select count(*) into v_active_count
  from public.legal_documents
  where document_type = 'terms' and status = 'active';

  if v_active_count <> 1 then
    raise exception
      E'ESTADO INESPERADO · se encontraron % documentos «terms» activos (se esperaba 1).\n'
      '  No se ha cambiado nada. Revisa public.legal_documents a mano.',
      v_active_count;
  end if;

  select count(*) into v_active_count
  from public.legal_documents
  where document_type = 'privacy' and status = 'active';

  if v_active_count <> 1 then
    raise exception
      E'ESTADO INESPERADO · se encontraron % documentos «privacy» activos (se esperaba 1).\n'
      '  No se ha cambiado nada. Revisa public.legal_documents a mano.',
      v_active_count;
  end if;

  select id into v_terms_v1_id
  from public.legal_documents
  where document_type = 'terms'
    and version = 'v1'
    and status  = 'active'
    and title   = 'Términos de uso de Trazaloop (versión preliminar)'
    and content like 'Esta es una versión preliminar de los términos de uso%';

  if v_terms_v1_id is null then
    raise exception
      E'ESTADO INESPERADO · no se encontró terms/v1 ACTIVO con el título y el\n'
      '  contenido preliminar exactos que sembró la migración 0066.\n'
      '  Puede que el texto ya se haya modificado a mano. El script se niega\n'
      '  a actuar sobre un estado que no reconoce. No se ha cambiado nada.';
  end if;

  select id into v_privacy_v1_id
  from public.legal_documents
  where document_type = 'privacy'
    and version = 'v1'
    and status  = 'active'
    and title   = 'Política de privacidad de Trazaloop (versión preliminar)'
    and content like 'Esta es una versión preliminar de la política de privacidad%';

  if v_privacy_v1_id is null then
    raise exception
      E'ESTADO INESPERADO · no se encontró privacy/v1 ACTIVO con el título y el\n'
      '  contenido preliminar exactos que sembró la migración 0066.\n'
      '  No se ha cambiado nada.';
  end if;

  -- Salvaguarda: el texto nuevo no debe reintroducir el lenguaje retirado.
  if c_terms_v2_content   ilike '%versión preliminar%'
  or c_terms_v2_content   ilike '%beta%'
  or c_terms_v2_content   ilike '%lanzamiento controlado%'
  or c_privacy_v2_content ilike '%versión preliminar%'
  or c_privacy_v2_content ilike '%beta%'
  or c_privacy_v2_content ilike '%lanzamiento controlado%' then
    raise exception
      E'TEXTO PROPUESTO INVÁLIDO · el contenido v2 todavía contiene lenguaje de\n'
      '  versión preliminar / beta / lanzamiento controlado. Corrige el script.';
  end if;

  raise notice 'Estado de partida verificado: terms/v1 y privacy/v1 activos y sin editar.';

  -- =======================================================================
  -- PASO 2 · PUBLICAR v2
  -- =======================================================================
  insert into public.legal_documents
    (document_type, version, title, content, status, published_at)
  values
    ('terms',   'v2', c_terms_v2_title,   c_terms_v2_content,   'active', now()),
    ('privacy', 'v2', c_privacy_v2_title, c_privacy_v2_content, 'active', now());

  raise notice 'Publicados terms/v2 y privacy/v2 como ACTIVOS.';

  -- =======================================================================
  -- PASO 3 · ARCHIVAR v1 (nunca borrar)
  -- =======================================================================
  update public.legal_documents
     set status = 'archived'
   where id in (v_terms_v1_id, v_privacy_v1_id);

  if not found then
    raise exception 'No se pudo archivar v1. Se revierte todo.';
  end if;

  raise notice 'Archivados terms/v1 y privacy/v1 (historial intacto, sin borrados).';

  -- =======================================================================
  -- PASO 4 · VERIFICACIÓN POSTERIOR DENTRO DE LA MISMA TRANSACCIÓN
  -- =======================================================================
  select count(*) into v_active_count
  from public.legal_documents
  where status = 'active' and document_type in ('terms', 'privacy');

  if v_active_count <> 2 then
    raise exception
      E'VERIFICACIÓN FALLIDA · quedaron % documentos activos (se esperaban 2).\n'
      '  Se revierte toda la transacción.',
      v_active_count;
  end if;

  select count(*) into v_active_count
  from public.legal_documents
  where status = 'active'
    and (content ilike '%versión preliminar%'
      or content ilike '%beta%'
      or content ilike '%lanzamiento controlado%'
      or title   ilike '%preliminar%');

  if v_active_count > 0 then
    raise exception
      E'VERIFICACIÓN FALLIDA · % documento(s) ACTIVO(S) siguen conteniendo\n'
      '  lenguaje de versión preliminar. Se revierte toda la transacción.',
      v_active_count;
  end if;

  raise notice '';
  raise notice '=========================================================';
  raise notice ' OK · documentos legales v2 publicados y v1 archivados.';
  raise notice ' Todos los usuarios deberán aceptar de nuevo en /legal/accept.';
  raise notice '=========================================================';
  raise notice '';
end
$publish$;

-- Resultado final para inspección humana.
select document_type, version, status, left(title, 60) as titulo, published_at
from public.legal_documents
order by document_type, version;

commit;
