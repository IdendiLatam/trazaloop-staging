-- ============================================================================
-- Trazaloop · Sprint T9E.4 (Textil) · Storage RLS: INSERT textil ligado a un
-- intento EXACTO y prohibición de eliminación/sobrescritura desde clientes
-- ============================================================================
--
-- PENDIENTES CERRADOS (revisión independiente posterior a T9E.3; los tres se
-- REPRODUJERON contra staging antes de escribir esta migración):
--
--  S1. INSERT textil arbitrario. `evidences_insert` (0016) permitía a cualquier
--      miembro con rol admin/quality/consultant subir CUALQUIER objeto bajo el
--      prefijo de su organización, incluidas rutas `{org}/textiles/...` que no
--      correspondían a ningún intento de carga. La ruta no quedaba vinculada al
--      intento: bastaba tener rol. (Reproducido: subida a
--      `{org}/textiles/{uuid-inventado}/hackeado.pdf` → PERMITIDA.)
--
--  S2. DELETE textil directo. `evidences_delete_textiles` (0076) permitía a
--      cualquier miembro con rol admin/quality/consultant BORRAR físicamente
--      cualquier objeto textil de su organización, **incluidos los de
--      evidencias ya finalizadas**. (Reproducido: el creador y otro admin de la
--      misma organización borraron el objeto de una evidencia consumida →
--      pérdida de evidencia.) La limpieza de huérfanos que motivó esa política
--      en 0076 hoy se ejecuta server-only con cliente administrativo, así que
--      la política ya no es necesaria.
--
--  S3. (En TypeScript, no en esta migración) La validación de CSV trataba como
--      texto cualquier byte >= 0x80. Se sustituyó por decodificación UTF-8
--      estricta (`TextDecoder("utf-8", {fatal:true})`). El nombre de la
--      migración conserva el alcance del cierre; no requiere DDL.
--
-- HALLAZGO EXPERIMENTAL QUE JUSTIFICA EL DISEÑO:
--   Una *signed upload URL* autoriza POR SÍ MISMA: se comprobó que
--   `uploadToSignedUrl` funciona incluso desde un cliente ANÓNIMO, sin JWT de
--   usuario y por tanto sin pasar por la política INSERT de `authenticated`.
--   Consecuencia: endurecer la política INSERT de `authenticated` NO rompe el
--   flujo legítimo (que sube por URL firmada emitida tras crear el intento) y
--   sí cierra la subida directa con SDK/JWT. La ruta del token firmado queda
--   fijada al emitirlo, de modo que no puede redirigirse a otra ruta.
--
-- ALCANCE Y NO-ALCANCE:
--   · Solo se tocan políticas del bucket `evidences`. Los buckets
--     `organization-assets` y `trazadocs-documents` tienen sus propias
--     políticas filtradas por su `bucket_id` y NO se ven afectados.
--   · El comportamiento CPR se preserva EXACTAMENTE: rutas CPR
--     (`{organization_id}/{evidence_id}/{archivo}`, cuyo segundo segmento es un
--     UUID y jamás la palabra 'textiles') conservan su INSERT con la misma
--     condición de 0016. CPR jamás ha tenido DELETE ni UPDATE de cliente y sigue sin
--     tenerlos. No se corrigen otros asuntos CPR: fuera de alcance.
--   · No se crea política UPDATE: el bucket `evidences` no tiene ninguna, de
--     modo que UPDATE/upsert de cliente ya está denegado por defecto (RLS
--     deny-by-default). Se comprobó en vivo: `upsert: true` sobre un objeto
--     existente → "new row violates row-level security policy". Añadir una
--     política UPDATE solo podría ABRIR permisos; se omite deliberadamente.
--   · El bucket sigue siendo PRIVADO. No se concede nada a `anon`.
--   · No se modifican ni eliminan datos ni objetos existentes.
--
-- LÍMITE HONESTO DE LO QUE ESTA MIGRACIÓN GARANTIZA:
--   Storage RLS vincula la RUTA a un intento válido; NO inspecciona el
--   contenido. El tamaño real, el MIME real y la firma binaria se verifican en
--   la finalización server-only (T9E.2/T9E.3). Esta política no es, ni debe
--   presentarse como, una inspección del archivo.
--
-- ROLLBACK (documentado; NO ejecutar sin decisión explícita — ver informe
-- T9E.4 §38):
--   drop policy if exists evidences_insert_textiles on storage.objects;
--   drop policy if exists evidences_insert_legacy   on storage.objects;
--   create policy evidences_insert on storage.objects
--     for insert to authenticated
--     with check (
--       bucket_id = 'evidences'
--       and public.has_org_role(
--         public.safe_uuid((storage.foldername(name))[1]),
--         array['admin', 'quality', 'consultant']
--       )
--     );
--   create policy evidences_delete_textiles on storage.objects
--     for delete to authenticated
--     using (
--       bucket_id = 'evidences'
--       and (storage.foldername(name))[2] = 'textiles'
--       and public.has_org_role(
--         public.safe_uuid((storage.foldername(name))[1]),
--         array['admin', 'quality', 'consultant']
--       )
--     );
--   ADVERTENCIA: restaurar `evidences_delete_textiles` REABRE la pérdida de
--   evidencias finalizadas por borrado directo desde el navegador; restaurar
--   `evidences_insert` genérico REABRE la carga textil en rutas arbitrarias.
--   El rollback no borra objetos, evidencias ni intentos, y preserva CPR.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. INSERT: separar el comportamiento legado (CPR y no-textil) del textil
-- ----------------------------------------------------------------------------
-- Se reemplaza la política única de 0016 por dos políticas disjuntas. Como en
-- PostgreSQL las políticas PERMISSIVE se combinan con OR, la disyunción por el
-- segundo segmento garantiza que una ruta textil NO pueda ampararse en la
-- política legada, y viceversa.
drop policy if exists evidences_insert on storage.objects;

-- (A) Legado / NO textil (CPR y cualquier otra ruta del bucket): condición
--     IDÉNTICA a la de 0016, más la exclusión explícita del prefijo textil.
--     `is distinct from` (y no `<>`) para tratar correctamente el NULL de las
--     rutas de dos segmentos, que hoy también están permitidas.
create policy evidences_insert_legacy on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidences'
    and (storage.foldername(name))[2] is distinct from 'textiles'
    and public.has_org_role(
      public.safe_uuid((storage.foldername(name))[1]),
      array['admin', 'quality', 'consultant']
    )
  );

-- (B) Textil: SOLO contra la ruta EXACTA de un intento propio, vigente y sin
--     consumir. La igualdad es exacta (`object_path = name`), nunca prefijo ni
--     coincidencia parcial: cualquier renombrado, subdirectorio extra,
--     `intent_id` distinto, traversal (`..`) o backslash produce un `name` que
--     no coincide con ningún `object_path` almacenado y queda rechazado.
create policy evidences_insert_textiles on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidences'
    and (storage.foldername(name))[2] = 'textiles'
    and exists (
      select 1
        from public.textile_evidence_upload_intents i
       where i.object_path = storage.objects.name          -- coincidencia EXACTA
         and i.bucket_id = 'evidences'
         and i.created_by = auth.uid()                     -- solo el creador
         and i.organization_id = public.safe_uuid((storage.foldername(name))[1])
         and i.status = 'pending'                          -- ni failed/expired/consumed
         and i.expires_at > now()                          -- no vencido
         and i.evidence_id is null                         -- aún no ligado
         -- El rol se re-verifica AHORA (pudo perderse tras crear el intento).
         and public.has_org_role(
               i.organization_id,
               array['admin', 'quality', 'consultant']
             )
         -- Módulo Textiles habilitado AHORA (pudo deshabilitarse después).
         and exists (
               select 1
                 from public.organization_modules m
                where m.organization_id = i.organization_id
                  and m.module_code = 'textiles'
                  and m.enabled
             )
    )
  );

-- NOTA (limitación demostrada del entorno gestionado): `comment on policy ...
-- on storage.objects` falla con "must be owner of relation objects"
-- (SQLSTATE 42501): el esquema `storage` pertenece a Supabase y el rol de
-- migración no es su dueño, aunque SÍ puede crear y eliminar políticas. Por
-- eso la documentación de cada política vive en estos comentarios SQL y en el
-- informe T9E.4, no en `pg_description`. Se comprobó que la migración revierte
-- limpiamente ante ese error (la transacción dejó intactas las políticas
-- previas), y se retiraron los COMMENT en lugar de dividir en dos migraciones.

-- ----------------------------------------------------------------------------
-- 2. DELETE textil desde cliente: PROHIBIDO (sin política de reemplazo)
-- ----------------------------------------------------------------------------
-- Tras este drop, el bucket `evidences` no tiene NINGUNA política DELETE para
-- `authenticated`: ni CPR (que jamás la ha tenido) ni textil pueden borrar objetos
-- desde el navegador — sin excepción por rol, creador ni organización.
-- Las eliminaciones legítimas (intento vencido/fallido, firma inválida,
-- re-barrido de subidas tardías) las ejecuta exclusivamente el código
-- server-only con el cliente administrativo, que verifica antes que la ruta no
-- pertenezca a una evidencia real ni a un intento consumido.
drop policy if exists evidences_delete_textiles on storage.objects;

-- ----------------------------------------------------------------------------
-- 3. UPDATE: se deja deliberadamente SIN política (deny-by-default)
-- ----------------------------------------------------------------------------
-- No se crea ninguna política UPDATE para el bucket `evidences`. Verificado en
-- vivo antes y después: `upsert: true` sobre un objeto existente es rechazado
-- por RLS. Crear una política aquí solo podría abrir permisos.
