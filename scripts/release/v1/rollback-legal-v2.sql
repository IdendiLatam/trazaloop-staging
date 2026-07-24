-- ===========================================================================
-- Trazaloop v1.0.0 · REVERSIÓN DE LOS DOCUMENTOS LEGALES v2
-- scripts/release/v1/rollback-legal-v2.sql
-- ===========================================================================
--
--   ####################################################################
--   #   ESTE SCRIPT NO SE HA EJECUTADO.                                #
--   #                                                                  #
--   #   Deshace scripts/release/v1/publish-legal-v2.sql: archiva v2 y  #
--   #   vuelve a activar v1. NO borra ninguna fila.                    #
--   ####################################################################
--
-- CUÁNDO USARLO
--   Cuando se publicó v2 y hay que volver atrás: un error en el texto, una
--   objeción legal posterior, o una publicación hecha antes de tiempo.
--
-- EFECTO SOBRE LOS USUARIOS
--   Al reactivar v1, quienes ya habían aceptado v1 vuelven a estar al día:
--   sus filas de `user_legal_acceptances` apuntan al documento v1, que pasa
--   de nuevo a 'active'. Quienes solo aceptaron v2 conservan esa aceptación
--   histórica (no se borra), pero volverán a ver el muro de aceptación
--   porque el documento vigente pasa a ser v1.
--
-- COMPATIBILIDAD DE EJECUCIÓN
--   SQL/PLpgSQL PURO: sin metacomandos de psql. Ejecutable tal cual desde
--   el SQL Editor de Supabase o desde psql:
--
--     psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--          -f scripts/release/v1/rollback-legal-v2.sql
--
-- GARANTÍAS
--   · TRANSACCIONAL: un único BEGIN…COMMIT. O todo, o nada.
--   · NO BORRA NADA: sin DELETE, TRUNCATE, DROP ni ALTER. v2 se archiva.
--   · CONCURRENCIA: advisory transaction lock con la MISMA clave que
--     publish-legal-v2.sql, así que ambos se excluyen mutuamente. Se libera
--     solo al hacer COMMIT o ROLLBACK.
--   · CONTEOS EXACTOS con GET DIAGNOSTICS en cada paso.
--   · FALLA CERRADO ante cualquier estado inesperado.
--
-- PRECONDICIONES EXIGIDAS (si no se cumplen, aborta sin tocar nada)
--   · exactamente 1 terms/v2   ACTIVO
--   · exactamente 1 privacy/v2 ACTIVO
--   · exactamente 1 terms/v1   ARCHIVADO
--   · exactamente 1 privacy/v1 ARCHIVADO
--
-- REQUISITOS
--   RLS de `legal_documents` (0066) solo permite UPDATE a
--   `public.is_platform_superadmin()`. Ejecuta con la conexión directa del
--   operador (rol propietario) o desde el SQL Editor de Supabase.
-- ===========================================================================

begin;

do $rollback$
declare
  -- MISMA clave que publish-legal-v2.sql: los dos scripts se serializan
  -- entre sí, de modo que nunca puede publicarse y revertirse a la vez.
  c_lock_key constant bigint := 1000010001;

  v_terms_v2_id       uuid;
  v_privacy_v2_id     uuid;
  v_terms_v1_id       uuid;
  v_privacy_v1_id     uuid;

  v_v2_terms_active   int;
  v_v2_privacy_active int;
  v_v1_terms_arch     int;
  v_v1_privacy_arch   int;
  v_v1_terms_active   int;
  v_v1_privacy_active int;
  v_active_terms      int;
  v_active_privacy    int;
  v_arch_terms_v2     int;
  v_arch_privacy_v2   int;
  v_rows              int;
begin

  -- =======================================================================
  -- PASO 1 · Advisory transaction lock (protección de concurrencia)
  -- =======================================================================
  perform pg_advisory_xact_lock(c_lock_key);
  raise notice 'Advisory lock % adquirido (se libera al terminar la transacción).', c_lock_key;

  -- Bloqueo explícito de las filas implicadas.
  perform 1
  from public.legal_documents
  where document_type in ('terms', 'privacy')
  for update;

  -- =======================================================================
  -- PASO 2 · EXIGIR LAS PRECONDICIONES EXACTAS
  -- =======================================================================
  select
    count(*) filter (where document_type = 'terms'   and version = 'v2' and status = 'active'),
    count(*) filter (where document_type = 'privacy' and version = 'v2' and status = 'active'),
    count(*) filter (where document_type = 'terms'   and version = 'v1' and status = 'archived'),
    count(*) filter (where document_type = 'privacy' and version = 'v1' and status = 'archived')
  into
    v_v2_terms_active, v_v2_privacy_active, v_v1_terms_arch, v_v1_privacy_arch
  from public.legal_documents
  where document_type in ('terms', 'privacy');

  if v_v2_terms_active   <> 1
  or v_v2_privacy_active <> 1
  or v_v1_terms_arch     <> 1
  or v_v1_privacy_arch   <> 1 then
    raise exception
      E'ESTADO INESPERADO · no se cumplen las precondiciones de la reversión.\n'
      '    terms/v2   activos   = %  (se esperaba 1)\n'
      '    privacy/v2 activos   = %  (se esperaba 1)\n'
      '    terms/v1   archivados= %  (se esperaba 1)\n'
      '    privacy/v1 archivados= %  (se esperaba 1)\n'
      '  Puede que v2 nunca se publicara, que ya se revirtiera, o que alguien\n'
      '  cambiara los estados a mano. REVISIÓN HUMANA.\n'
      '  No se ha modificado nada.',
      v_v2_terms_active, v_v2_privacy_active, v_v1_terms_arch, v_v1_privacy_arch;
  end if;

  select id into v_terms_v2_id   from public.legal_documents
   where document_type = 'terms'   and version = 'v2' and status = 'active';
  select id into v_privacy_v2_id from public.legal_documents
   where document_type = 'privacy' and version = 'v2' and status = 'active';
  select id into v_terms_v1_id   from public.legal_documents
   where document_type = 'terms'   and version = 'v1' and status = 'archived';
  select id into v_privacy_v1_id from public.legal_documents
   where document_type = 'privacy' and version = 'v1' and status = 'archived';

  if v_terms_v2_id   is null or v_privacy_v2_id is null
  or v_terms_v1_id   is null or v_privacy_v1_id is null then
    raise exception
      E'ESTADO INESPERADO · no se pudieron localizar las cuatro filas\n'
      '  implicadas en la reversión. No se ha modificado nada.';
  end if;

  raise notice 'Precondiciones verificadas: v2 activo (2 filas) y v1 archivado (2 filas).';

  -- =======================================================================
  -- PASO 3 · ARCHIVAR v2 — conteo exacto
  -- =======================================================================
  -- Primero se archiva v2, porque el índice único parcial
  -- legal_documents_one_active_per_type impide dos activos del mismo tipo.
  update public.legal_documents
     set status = 'archived'
   where id in (v_terms_v2_id, v_privacy_v2_id);

  get diagnostics v_rows = row_count;
  if v_rows <> 2 then
    raise exception
      E'CONTEO INESPERADO al archivar v2 · se actualizaron % fila(s); se\n'
      '  esperaban EXACTAMENTE 2. Se revierte toda la transacción.', v_rows;
  end if;
  raise notice 'Archivadas exactamente 2 filas v2 (sin borrar nada).';

  -- =======================================================================
  -- PASO 4 · REACTIVAR v1 — conteo exacto
  -- =======================================================================
  update public.legal_documents
     set status = 'active'
   where id in (v_terms_v1_id, v_privacy_v1_id);

  get diagnostics v_rows = row_count;
  if v_rows <> 2 then
    raise exception
      E'CONTEO INESPERADO al reactivar v1 · se actualizaron % fila(s); se\n'
      '  esperaban EXACTAMENTE 2. Se revierte toda la transacción.', v_rows;
  end if;
  raise notice 'Reactivadas exactamente 2 filas v1.';

  -- =======================================================================
  -- PASO 5 · VERIFICACIÓN FINAL DENTRO DE LA MISMA TRANSACCIÓN
  -- =======================================================================
  select
    count(*) filter (where document_type = 'terms'   and version = 'v1' and status = 'active'),
    count(*) filter (where document_type = 'privacy' and version = 'v1' and status = 'active'),
    count(*) filter (where document_type = 'terms'   and version = 'v2' and status = 'archived'),
    count(*) filter (where document_type = 'privacy' and version = 'v2' and status = 'archived'),
    count(*) filter (where document_type = 'terms'   and status = 'active'),
    count(*) filter (where document_type = 'privacy' and status = 'active')
  into
    v_v1_terms_active, v_v1_privacy_active,
    v_arch_terms_v2, v_arch_privacy_v2,
    v_active_terms, v_active_privacy
  from public.legal_documents
  where document_type in ('terms', 'privacy');

  if v_v1_terms_active <> 1 then
    raise exception 'VERIFICACIÓN FALLIDA · terms/v1 activos = % (se esperaba 1). Se revierte.', v_v1_terms_active;
  end if;
  if v_v1_privacy_active <> 1 then
    raise exception 'VERIFICACIÓN FALLIDA · privacy/v1 activos = % (se esperaba 1). Se revierte.', v_v1_privacy_active;
  end if;
  if v_arch_terms_v2 <> 1 then
    raise exception 'VERIFICACIÓN FALLIDA · terms/v2 archivados = % (se esperaba 1). Se revierte.', v_arch_terms_v2;
  end if;
  if v_arch_privacy_v2 <> 1 then
    raise exception 'VERIFICACIÓN FALLIDA · privacy/v2 archivados = % (se esperaba 1). Se revierte.', v_arch_privacy_v2;
  end if;
  if v_active_terms <> 1 then
    raise exception
      E'VERIFICACIÓN FALLIDA · hay % documentos «terms» activos (se esperaba\n'
      '  exactamente 1: el v1 reactivado). Se revierte.', v_active_terms;
  end if;
  if v_active_privacy <> 1 then
    raise exception
      E'VERIFICACIÓN FALLIDA · hay % documentos «privacy» activos (se esperaba\n'
      '  exactamente 1: el v1 reactivado). Se revierte.', v_active_privacy;
  end if;

  -- Nada se ha perdido: siguen existiendo las cuatro filas.
  select count(*) into v_rows
  from public.legal_documents
  where document_type in ('terms', 'privacy')
    and version in ('v1', 'v2');

  if v_rows < 4 then
    raise exception
      E'VERIFICACIÓN FALLIDA · quedan % filas v1/v2 (se esperaban al menos 4).\n'
      '  La reversión NUNCA debe perder historial. Se revierte.', v_rows;
  end if;

  raise notice '';
  raise notice '=========================================================';
  raise notice ' OK · v2 archivado y v1 reactivado. Historial intacto.';
  raise notice ' Los usuarios volverán a ver el muro de aceptación con v1.';
  raise notice '=========================================================';
  raise notice '';
end
$rollback$;

-- Resultado final para inspección humana.
select document_type, version, status, left(title, 60) as titulo, published_at
from public.legal_documents
where document_type in ('terms', 'privacy')
order by document_type, version;

commit;
