-- ===========================================================================
-- Trazaloop v1.0.0 · PUBLICACIÓN DE DOCUMENTOS LEGALES v2
-- scripts/release/v1/publish-legal-v2.sql
-- ===========================================================================
--
--   ####################################################################
--   #                                                                  #
--   #   ESTE SCRIPT NO SE HA EJECUTADO Y NO DEBE EJECUTARSE.           #
--   #                                                                  #
--   #   Está BLOQUEADO POR DISEÑO: aborta salvo que un operador        #
--   #   cambie a mano `c_legal_approval_confirmed` a true (paso 0),    #
--   #   lo que constituye una declaración explícita de que el área     #
--   #   jurídica aprobó el texto.                                      #
--   #                                                                  #
--   #   El contenido de las cláusulas es una PROPUESTA TÉCNICA cuyo    #
--   #   único objetivo es retirar el encuadre de «versión preliminar / #
--   #   beta / lanzamiento controlado». NO es asesoría jurídica y NO   #
--   #   se afirma que cumpla ninguna legislación concreta.             #
--   #                                                                  #
--   #   La POLÍTICA DE PRIVACIDAD propuesta está INCOMPLETA y pendiente#
--   #   de redacción y aprobación jurídica: ver §5 y §6 de             #
--   #   docs/releases/V1.0.0_LEGAL_REVIEW.md (requisitos faltantes y   #
--   #   frases marcadas para revisión).                                #
--   #                                                                  #
--   ####################################################################
--
-- COMPATIBILIDAD DE EJECUCIÓN
--   Este archivo es SQL/PLpgSQL PURO: no contiene ningún metacomando de
--   psql (\pset, \echo, \timing…). Por tanto se puede ejecutar TAL CUAL
--   desde el SQL Editor de Supabase (pegar y ejecutar) o desde psql:
--
--     psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--          -f scripts/release/v1/publish-legal-v2.sql
--
--   Los mensajes de progreso se emiten con RAISE NOTICE, que ambos
--   entornos muestran.
--
-- QUÉ HACE
--   Publica `terms/v2` y `privacy/v2` como ACTIVOS y archiva `terms/v1` y
--   `privacy/v1` (status = 'archived').
--
-- QUÉ NO HACE
--   · NO modifica la migración histórica 0066 (ni ninguna otra).
--   · NO es una migración: no crea, altera ni elimina esquema. No existe
--     ni debe existir un 0103 para esto.
--   · NO borra ninguna fila. `v1` se archiva, nunca se elimina.
--   · NO toca `user_legal_acceptances`: las aceptaciones históricas de v1
--     siguen existiendo como prueba de lo que cada usuario aceptó y cuándo.
--
-- RESTRICCIONES REALES DE public.legal_documents (migración 0066)
--   · legal_documents_document_type_check : document_type in ('terms',
--     'privacy', 'data_processing')
--   · legal_documents_status_check        : status in ('draft', 'active',
--     'archived')
--   · legal_documents_type_version_uniq   : unique (document_type, version)
--   · legal_documents_one_active_per_type : índice único parcial —
--     a lo sumo UN documento 'active' por tipo.
--
--   Este script NO se apoya en que esas restricciones lancen el error: hace
--   un censo explícito del estado ANTES de escribir y aborta con un mensaje
--   comprensible. Las restricciones son la segunda línea de defensa.
--
-- GARANTÍAS
--   · TRANSACCIONAL: un único BEGIN…COMMIT. O todo, o nada.
--   · CONCURRENCIA: advisory transaction lock (paso 1). Dos ejecuciones
--     simultáneas se serializan; el lock se libera solo al terminar o
--     revertirse la transacción.
--   · VALIDACIÓN EXACTA de v1: igualdad carácter por carácter de título y
--     contenido contra el texto literal de la migración 0066. Sin LIKE,
--     sin ILIKE, sin prefijos. Un solo carácter distinto aborta.
--   · CENSO DE v2 EN CUALQUIER ESTADO (draft/active/archived): solo se
--     admite «no existe ningún v2» o «exactamente un v2 activo por tipo».
--   · CONTEOS EXACTOS con GET DIAGNOSTICS: exactamente 2 filas archivadas
--     y exactamente 2 insertadas.
--   · FALLA CERRADO ante cualquier estado inesperado.
--
-- REQUISITOS
--   Las políticas RLS de `legal_documents` (0066) solo permiten INSERT y
--   UPDATE a `public.is_platform_superadmin()`. Ejecuta con la conexión
--   directa del operador (rol propietario) o desde el SQL Editor de
--   Supabase, nunca desde la aplicación.
--
-- REVERSIÓN
--   scripts/release/v1/rollback-legal-v2.sql (transaccional, sin borrados).
-- ===========================================================================

begin;

do $publish$
declare
  -- =======================================================================
  -- PASO 0 · BLOQUEO DE APROBACIÓN LEGAL (fail-closed)
  -- =======================================================================
  -- Mientras esta constante sea false el script NO hace nada. Cambiarla a
  -- true es un acto deliberado que declara que el área jurídica revisó y
  -- aprobó el texto completo, incluida la decisión L-2 (ampliar el alcance
  -- de CPR a CPR + Textiles) y los requisitos pendientes de la política de
  -- privacidad listados en docs/releases/V1.0.0_LEGAL_REVIEW.md.
  c_legal_approval_confirmed constant boolean := false;

  -- Clave del advisory lock. Constante arbitraria pero ESTABLE: debe ser la
  -- misma en publish-legal-v2.sql y rollback-legal-v2.sql para que ambos se
  -- excluyan mutuamente.
  c_lock_key constant bigint := 1000010001;

  -- -----------------------------------------------------------------------
  -- TEXTO EXACTO DE v1, copiado LITERALMENTE de la migración 0066.
  -- No se modifica 0066: se replican aquí sus literales E'' idénticos para
  -- poder comparar por IGUALDAD EXACTA. Si alguien editó el documento a
  -- mano en la base, la comparación falla y el script se detiene.
  -- -----------------------------------------------------------------------
  c_terms_v1_title constant text :=
    'Términos de uso de Trazaloop (versión preliminar)';

  c_terms_v1_content constant text :=
       E'Esta es una versión preliminar de los términos de uso de Trazaloop, publicada para la beta / lanzamiento controlado de Trazaloop CPR.\n\n'
    || E'1. Trazaloop es una plataforma para gestionar trazabilidad, documentación técnica (TrazaDocs), evidencias y cálculo de contenido reciclado en procesos asociados a NTC 6632 y UNE-EN 15343.\n\n'
    || E'2. Trazaloop no garantiza ni promete la obtención de ninguna certificación. La plataforma ofrece soporte técnico y herramientas de revisión técnica para organizar la información de tu producto objetivo; la evaluación y decisión de certificación, si aplica, corresponde siempre a un organismo externo independiente de Trazaloop.\n\n'
    || E'3. El uso de la plataforma está sujeto a los planes y límites vigentes (Demo, Full, Extra) descritos dentro de la plataforma. Trazaloop puede suspender el acceso de una cuenta que incumpla estos términos, sin perder los datos ya cargados.\n\n'
    || E'4. Este documento es una versión preliminar y puede actualizarse antes del lanzamiento definitivo. Se te pedirá aceptar cualquier versión nueva antes de continuar usando la plataforma.';

  c_privacy_v1_title constant text :=
    'Política de privacidad de Trazaloop (versión preliminar)';

  c_privacy_v1_content constant text :=
       E'Esta es una versión preliminar de la política de privacidad de Trazaloop, publicada para la beta / lanzamiento controlado de Trazaloop CPR.\n\n'
    || E'1. Trazaloop recopila los datos que registras dentro de la plataforma (datos de empresa, catálogos, evidencias, trazabilidad, documentos y tickets de soporte) con el único fin de operar el servicio para tu organización.\n\n'
    || E'2. Usamos tu información para: operar la plataforma, brindarte soporte técnico a través del Centro de soporte, proteger la seguridad de tu cuenta y de la de otras empresas (aislamiento entre organizaciones), y mejorar el servicio.\n\n'
    || E'3. No compartimos tus datos con terceros salvo cuando sea necesario para operar la plataforma (por ejemplo, el proveedor de infraestructura donde se aloja Trazaloop) o cuando la ley lo exija.\n\n'
    || E'4. Puedes solicitar información sobre tus datos o su eliminación contactando al equipo de Trazaloop desde el Centro de soporte.\n\n'
    || E'5. Este documento es una versión preliminar y puede actualizarse antes del lanzamiento definitivo. Se te pedirá aceptar cualquier versión nueva antes de continuar usando la plataforma.';

  -- Huella md5 del texto v1 esperado, calculada fuera de la base a partir de
  -- la migración 0066. Es un DIAGNÓSTICO reproducible que se imprime cuando
  -- la comparación exacta falla; la validación que manda es la igualdad de
  -- texto de arriba, no el hash.
  c_terms_v1_md5   constant text := '7e30e6abb716d7d472b1b2d27e660a37';
  c_privacy_v1_md5 constant text := '9f3719ca5e83a6566ad8743d101e7d3f';

  -- -----------------------------------------------------------------------
  -- TEXTO PROPUESTO · TÉRMINOS DE USO v2
  -- -----------------------------------------------------------------------
  -- Cambios respecto de v1, y NADA más:
  --   · se elimina el párrafo de preámbulo («versión preliminar … beta /
  --     lanzamiento controlado»);
  --   · la cláusula 1 amplía el alcance a los dos módulos funcionales
  --     → DECISIÓN L-2, CAMBIO SUSTANTIVO. Si el área legal prefiere NO
  --     ampliar el alcance ahora, sustituye la cláusula 1 por el texto
  --     literal de v1 (está en c_terms_v1_content, cláusula 1);
  --   · la cláusula 4 conserva íntegro su efecto jurídico y solo pierde la
  --     referencia a «versión preliminar» y a un «lanzamiento definitivo»;
  --   · las cláusulas 2 y 3 son IDÉNTICAS a v1, carácter por carácter.
  --
  -- FRASES MARCADAS PARA REVISIÓN LEGAL (NO se han cambiado en silencio;
  -- se heredan de v1 y siguen presentes en esta propuesta):
  --   · L-3a «sin perder los datos ya cargados» (cláusula 3): promesa
  --     absoluta, sin excepciones ni plazo. Ver informe §6.
  --   · L-3c «preparación técnica de productos, procesos y cadenas de
  --     valor» (cláusula 1): posible amplitud o ambigüedad de alcance.
  --   · L-3e: el documento NO identifica al operador jurídico de Trazaloop
  --     (razón social, NIT, domicilio). Ver informe §5.
  -- -----------------------------------------------------------------------
  c_terms_v2_title constant text :=
    'Términos de uso de Trazaloop';

  c_terms_v2_content constant text :=
       E'1. Trazaloop es una plataforma modular para gestionar trazabilidad, documentación técnica (TrazaDocs), evidencias y preparación técnica de productos, procesos y cadenas de valor. Sus módulos disponibles son Trazaloop CPR (trazabilidad, documentación técnica, evidencias y cálculo de contenido reciclado en procesos asociados a NTC 6632 y UNE-EN 15343) y Trazaloop Textiles (trazabilidad de productos de confección, composición de fibras, evidencias, circularidad y pasaporte técnico textil).\n\n'
    || E'2. Trazaloop no garantiza ni promete la obtención de ninguna certificación. La plataforma ofrece soporte técnico y herramientas de revisión técnica para organizar la información de tu producto objetivo; la evaluación y decisión de certificación, si aplica, corresponde siempre a un organismo externo independiente de Trazaloop.\n\n'
    || E'3. El uso de la plataforma está sujeto a los planes y límites vigentes (Demo, Full, Extra) descritos dentro de la plataforma. Trazaloop puede suspender el acceso de una cuenta que incumpla estos términos, sin perder los datos ya cargados.\n\n'
    || E'4. Este documento puede actualizarse. Se te pedirá aceptar cualquier versión nueva antes de continuar usando la plataforma.';

  -- -----------------------------------------------------------------------
  -- TEXTO PROPUESTO · POLÍTICA DE PRIVACIDAD v2
  -- -----------------------------------------------------------------------
  --   ###################################################################
  --   #  INCOMPLETA. Este texto NO es una política de privacidad final. #
  --   #  Solo retira el encuadre de «versión preliminar». Le faltan al  #
  --   #  menos los 13 requisitos listados en §5 del informe legal       #
  --   #  (responsable y domicilio, finalidades, derechos del titular,   #
  --   #  área de PQR, canales y procedimiento, vigencia y conservación, #
  --   #  autorización previa, roles responsable/encargado, proveedores  #
  --   #  y subencargados, transferencias internacionales, seguridad,    #
  --   #  eliminación y exportación, y datos de terceros cargados por    #
  --   #  las empresas).                                                 #
  --   #  REQUIERE REDACCIÓN Y APROBACIÓN JURÍDICA COMPLETA.             #
  --   ###################################################################
  --
  -- Cambios respecto de v1, y NADA más:
  --   · se elimina el párrafo de preámbulo;
  --   · la cláusula 5 pierde solo el encuadre «versión preliminar /
  --     lanzamiento definitivo», conservando su efecto;
  --   · las cláusulas 1 a 4 son IDÉNTICAS a v1, carácter por carácter.
  --
  -- FRASES MARCADAS PARA REVISIÓN LEGAL (heredadas de v1, sin cambiar):
  --   · L-3b «Puedes solicitar información sobre tus datos o su
  --     eliminación» (cláusula 4): no indica CUÁNDO procede la eliminación
  --     ni sus límites (obligaciones legales de conservación, etc.).
  --   · L-3d: no hay política de CONSERVACIÓN de datos (cuánto tiempo se
  --     guardan, qué pasa al terminar el servicio).
  -- -----------------------------------------------------------------------
  c_privacy_v2_title constant text :=
    'Política de privacidad de Trazaloop';

  c_privacy_v2_content constant text :=
       E'1. Trazaloop recopila los datos que registras dentro de la plataforma (datos de empresa, catálogos, evidencias, trazabilidad, documentos y tickets de soporte) con el único fin de operar el servicio para tu organización.\n\n'
    || E'2. Usamos tu información para: operar la plataforma, brindarte soporte técnico a través del Centro de soporte, proteger la seguridad de tu cuenta y de la de otras empresas (aislamiento entre organizaciones), y mejorar el servicio.\n\n'
    || E'3. No compartimos tus datos con terceros salvo cuando sea necesario para operar la plataforma (por ejemplo, el proveedor de infraestructura donde se aloja Trazaloop) o cuando la ley lo exija.\n\n'
    || E'4. Puedes solicitar información sobre tus datos o su eliminación contactando al equipo de Trazaloop desde el Centro de soporte.\n\n'
    || E'5. Este documento puede actualizarse. Se te pedirá aceptar cualquier versión nueva antes de continuar usando la plataforma.';

  -- Variables de trabajo -------------------------------------------------
  v_terms_v1_id      uuid;
  v_privacy_v1_id    uuid;
  v_v2_total         int;
  v_v2_terms_total   int;
  v_v2_privacy_total int;
  v_v2_terms_active  int;
  v_v2_privacy_active int;
  v_active_terms     int;
  v_active_privacy   int;
  v_archived_terms   int;
  v_archived_privacy int;
  v_rows             int;
  v_actual_title     text;
  v_actual_md5       text;
begin

  -- =======================================================================
  -- PASO 0 · Bloqueo de aprobación legal
  -- =======================================================================
  if not c_legal_approval_confirmed then
    raise exception
      E'BLOQUEADO · el script no se ejecuta sin aprobación jurídica explícita.\n'
      '  Este archivo publica documentos legales que todos los usuarios\n'
      '  deberán aceptar. Antes de ejecutarlo:\n'
      '    1. El área jurídica debe revisar el texto completo de este script.\n'
      '    2. Debe decidirse expresamente la cuestión L-2 (ampliar el alcance\n'
      '       de CPR a CPR + Textiles en la cláusula 1 de los términos).\n'
      '    3. Debe completarse la política de privacidad: le faltan los\n'
      '       requisitos listados en §5 de docs/releases/V1.0.0_LEGAL_REVIEW.md.\n'
      '    4. Debe existir copia de seguridad de legal_documents y\n'
      '       user_legal_acceptances.\n'
      '  Solo entonces: cambia c_legal_approval_confirmed a true (paso 0).\n'
      '  No se ha modificado nada.';
  end if;

  -- =======================================================================
  -- PASO 1 · Advisory transaction lock (protección de concurrencia)
  -- =======================================================================
  -- pg_advisory_xact_lock bloquea hasta obtener el lock y lo LIBERA
  -- AUTOMÁTICAMENTE al hacer COMMIT o ROLLBACK — no hay forma de dejarlo
  -- colgado. Serializa este script consigo mismo y con
  -- rollback-legal-v2.sql, que usa la misma clave.
  perform pg_advisory_xact_lock(c_lock_key);
  raise notice 'Advisory lock % adquirido (se libera al terminar la transacción).', c_lock_key;

  -- Además se bloquean las filas relevantes: cualquier otra sesión que
  -- intente tocarlas espera a que esta transacción termine.
  perform 1
  from public.legal_documents
  where document_type in ('terms', 'privacy')
  for update;

  -- =======================================================================
  -- PASO 2 · CENSO DE v2 EN CUALQUIER ESTADO (draft / active / archived)
  -- =======================================================================
  -- Solo se admiten dos situaciones:
  --   A. no existe NINGUNA fila v2  → continuar y publicar;
  --   B. exactamente un terms/v2 ACTIVO y un privacy/v2 ACTIVO, y ningún
  --      otro v2                    → ya publicado, terminar sin cambios.
  -- Cualquier otra combinación (v2 archivado, v2 draft, más de una fila por
  -- tipo, un tipo sí y el otro no, dos activos, estado mixto) aborta.
  -- =======================================================================
  select
    count(*),
    count(*) filter (where document_type = 'terms'),
    count(*) filter (where document_type = 'privacy'),
    count(*) filter (where document_type = 'terms'   and status = 'active'),
    count(*) filter (where document_type = 'privacy' and status = 'active')
  into
    v_v2_total, v_v2_terms_total, v_v2_privacy_total,
    v_v2_terms_active, v_v2_privacy_active
  from public.legal_documents
  where version = 'v2'
    and document_type in ('terms', 'privacy');

  if v_v2_total = 0 then
    raise notice 'Estado v2: no existe ninguna fila v2. Se procede a publicar.';

  elsif v_v2_terms_total = 1
    and v_v2_privacy_total = 1
    and v_v2_terms_active = 1
    and v_v2_privacy_active = 1
    and v_v2_total = 2 then
    raise notice '';
    raise notice 'SIN CAMBIOS · terms/v2 y privacy/v2 ya están publicados y activos.';
    raise notice 'El script es idempotente: no se ha modificado nada.';
    raise notice '';
    return;

  else
    raise exception
      E'ESTADO v2 INESPERADO · no se puede publicar ni confirmar idempotencia.\n'
      '  Filas v2 encontradas (cualquier estado): %\n'
      '    · terms/v2   total=%  activos=%\n'
      '    · privacy/v2 total=%  activos=%\n'
      '  Situaciones admitidas SOLAMENTE:\n'
      '    A. 0 filas v2 (publicación pendiente), o\n'
      '    B. exactamente 1 terms/v2 ACTIVO + 1 privacy/v2 ACTIVO y nada más.\n'
      '  Todo lo demás (v2 archivado, v2 en draft, un tipo sí y el otro no,\n'
      '  estado mixto) exige REVISIÓN HUMANA. No se ha modificado nada.',
      v_v2_total,
      v_v2_terms_total, v_v2_terms_active,
      v_v2_privacy_total, v_v2_privacy_active;
  end if;

  -- =======================================================================
  -- PASO 3 · EXIGIR EL ESTADO DE PARTIDA v1 EXACTO
  -- =======================================================================
  -- Debe existir exactamente UN documento activo por tipo, y debe ser v1
  -- con el título y el contenido IDÉNTICOS a los de la migración 0066.
  -- Comparación por igualdad exacta (=), nunca LIKE ni ILIKE.
  -- =======================================================================
  select count(*) into v_active_terms
  from public.legal_documents
  where document_type = 'terms' and status = 'active';

  if v_active_terms <> 1 then
    raise exception
      E'ESTADO INESPERADO · hay % documento(s) «terms» activo(s); se esperaba 1.\n'
      '  No se ha modificado nada.', v_active_terms;
  end if;

  select count(*) into v_active_privacy
  from public.legal_documents
  where document_type = 'privacy' and status = 'active';

  if v_active_privacy <> 1 then
    raise exception
      E'ESTADO INESPERADO · hay % documento(s) «privacy» activo(s); se esperaba 1.\n'
      '  No se ha modificado nada.', v_active_privacy;
  end if;

  -- --- terms/v1: igualdad EXACTA de título y contenido -------------------
  select id, title, md5(content)
  into v_terms_v1_id, v_actual_title, v_actual_md5
  from public.legal_documents
  where document_type = 'terms'
    and version       = 'v1'
    and status        = 'active'
    and title         = c_terms_v1_title
    and content       = c_terms_v1_content;

  if v_terms_v1_id is null then
    -- Diagnóstico comprensible: se recupera la fila real para explicar EN QUÉ
    -- difiere, sin volcar el documento completo al log.
    select title, md5(content) into v_actual_title, v_actual_md5
    from public.legal_documents
    where document_type = 'terms' and status = 'active';

    raise exception
      E'ESTADO INESPERADO · terms/v1 activo NO coincide EXACTAMENTE con el texto\n'
      '  sembrado por la migración 0066.\n'
      '    Título esperado : %\n'
      '    Título real     : %\n'
      '    md5 esperado    : %\n'
      '    md5 real        : %\n'
      '  El documento fue editado a mano, o la versión activa no es v1. El\n'
      '  script se niega a actuar sobre un estado que no reconoce, porque no\n'
      '  puede saber qué aceptaron realmente los usuarios. REVISIÓN HUMANA.\n'
      '  No se ha modificado nada.',
      c_terms_v1_title, coalesce(v_actual_title, '(sin fila activa)'),
      c_terms_v1_md5,   coalesce(v_actual_md5, '(sin fila activa)');
  end if;

  -- --- privacy/v1: igualdad EXACTA de título y contenido -----------------
  select id, title, md5(content)
  into v_privacy_v1_id, v_actual_title, v_actual_md5
  from public.legal_documents
  where document_type = 'privacy'
    and version       = 'v1'
    and status        = 'active'
    and title         = c_privacy_v1_title
    and content       = c_privacy_v1_content;

  if v_privacy_v1_id is null then
    select title, md5(content) into v_actual_title, v_actual_md5
    from public.legal_documents
    where document_type = 'privacy' and status = 'active';

    raise exception
      E'ESTADO INESPERADO · privacy/v1 activo NO coincide EXACTAMENTE con el\n'
      '  texto sembrado por la migración 0066.\n'
      '    Título esperado : %\n'
      '    Título real     : %\n'
      '    md5 esperado    : %\n'
      '    md5 real        : %\n'
      '  REVISIÓN HUMANA. No se ha modificado nada.',
      c_privacy_v1_title, coalesce(v_actual_title, '(sin fila activa)'),
      c_privacy_v1_md5,   coalesce(v_actual_md5, '(sin fila activa)');
  end if;

  raise notice 'Estado de partida verificado: terms/v1 y privacy/v1 activos, texto EXACTO de 0066.';

  -- --- Salvaguarda: el texto v2 no reintroduce el lenguaje retirado ------
  if c_terms_v2_title     ilike '%preliminar%'
  or c_privacy_v2_title   ilike '%preliminar%'
  or c_terms_v2_content   ilike '%versión preliminar%'
  or c_terms_v2_content   ilike '%beta%'
  or c_terms_v2_content   ilike '%lanzamiento controlado%'
  or c_privacy_v2_content ilike '%versión preliminar%'
  or c_privacy_v2_content ilike '%beta%'
  or c_privacy_v2_content ilike '%lanzamiento controlado%' then
    raise exception
      E'TEXTO PROPUESTO INVÁLIDO · el contenido v2 todavía contiene lenguaje de\n'
      '  versión preliminar / beta / lanzamiento controlado. Corrige el script.';
  end if;

  -- =======================================================================
  -- PASO 4 · ARCHIVAR v1 (nunca borrar) — conteo exacto
  -- =======================================================================
  -- Se archiva ANTES de insertar v2 porque el índice único parcial
  -- legal_documents_one_active_per_type impide dos activos del mismo tipo.
  update public.legal_documents
     set status = 'archived'
   where id in (v_terms_v1_id, v_privacy_v1_id);

  get diagnostics v_rows = row_count;
  if v_rows <> 2 then
    raise exception
      E'CONTEO INESPERADO al archivar v1 · se actualizaron % fila(s); se\n'
      '  esperaban EXACTAMENTE 2 (terms/v1 y privacy/v1).\n'
      '  Se revierte toda la transacción.', v_rows;
  end if;
  raise notice 'Archivadas exactamente 2 filas v1 (historial intacto, sin borrados).';

  -- =======================================================================
  -- PASO 5 · PUBLICAR v2 — conteo exacto
  -- =======================================================================
  insert into public.legal_documents
    (document_type, version, title, content, status, published_at)
  values
    ('terms',   'v2', c_terms_v2_title,   c_terms_v2_content,   'active', now()),
    ('privacy', 'v2', c_privacy_v2_title, c_privacy_v2_content, 'active', now());

  get diagnostics v_rows = row_count;
  if v_rows <> 2 then
    raise exception
      E'CONTEO INESPERADO al insertar v2 · se insertaron % fila(s); se\n'
      '  esperaban EXACTAMENTE 2. Se revierte toda la transacción.', v_rows;
  end if;
  raise notice 'Insertadas exactamente 2 filas v2 (terms y privacy), activas.';

  -- =======================================================================
  -- PASO 6 · VERIFICACIÓN FINAL DENTRO DE LA MISMA TRANSACCIÓN
  -- =======================================================================
  select
    count(*) filter (where document_type = 'terms'   and version = 'v2' and status = 'active'),
    count(*) filter (where document_type = 'privacy' and version = 'v2' and status = 'active'),
    count(*) filter (where document_type = 'terms'   and version = 'v1' and status = 'archived'),
    count(*) filter (where document_type = 'privacy' and version = 'v1' and status = 'archived'),
    count(*) filter (where document_type = 'terms'   and status = 'active'),
    count(*) filter (where document_type = 'privacy' and status = 'active')
  into
    v_v2_terms_active, v_v2_privacy_active,
    v_archived_terms, v_archived_privacy,
    v_active_terms, v_active_privacy
  from public.legal_documents
  where document_type in ('terms', 'privacy');

  if v_v2_terms_active <> 1 then
    raise exception 'VERIFICACIÓN FALLIDA · terms/v2 activos = % (se esperaba 1). Se revierte.', v_v2_terms_active;
  end if;
  if v_v2_privacy_active <> 1 then
    raise exception 'VERIFICACIÓN FALLIDA · privacy/v2 activos = % (se esperaba 1). Se revierte.', v_v2_privacy_active;
  end if;
  if v_archived_terms <> 1 then
    raise exception 'VERIFICACIÓN FALLIDA · terms/v1 archivados = % (se esperaba 1). Se revierte.', v_archived_terms;
  end if;
  if v_archived_privacy <> 1 then
    raise exception 'VERIFICACIÓN FALLIDA · privacy/v1 archivados = % (se esperaba 1). Se revierte.', v_archived_privacy;
  end if;
  -- No debe quedar NINGÚN otro documento activo de esos tipos.
  if v_active_terms <> 1 then
    raise exception
      E'VERIFICACIÓN FALLIDA · hay % documentos «terms» activos (se esperaba\n'
      '  exactamente 1: el v2 recién publicado). Se revierte.', v_active_terms;
  end if;
  if v_active_privacy <> 1 then
    raise exception
      E'VERIFICACIÓN FALLIDA · hay % documentos «privacy» activos (se esperaba\n'
      '  exactamente 1: el v2 recién publicado). Se revierte.', v_active_privacy;
  end if;

  -- Ningún documento ACTIVO puede conservar el lenguaje retirado.
  select count(*) into v_rows
  from public.legal_documents
  where status = 'active'
    and document_type in ('terms', 'privacy')
    and (content ilike '%versión preliminar%'
      or content ilike '%beta%'
      or content ilike '%lanzamiento controlado%'
      or title   ilike '%preliminar%');

  if v_rows > 0 then
    raise exception
      E'VERIFICACIÓN FALLIDA · % documento(s) ACTIVO(S) siguen conteniendo\n'
      '  lenguaje de versión preliminar. Se revierte toda la transacción.', v_rows;
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
where document_type in ('terms', 'privacy')
order by document_type, version;

commit;
