-- 0048_trazadocs_ux_hardening.sql
-- Trazaloop · Sprint 9.2 · Evitar documentos TrazaDocs duplicados.
--
-- Seguro de aplicar: en este momento no existe ningún dato de empresa real
-- ni de demostración en trazadoc_documents (solo blueprints/hints de
-- plataforma, sembrados en 0044, que son globales y no tocan esta tabla).
-- No hace falta limpiar duplicados antes de crear los índices.
--
-- Los borradores se ELIMINAN con hard delete (Parte 4 del Sprint 9.2, ver
-- deleteDraftTrazadocDocumentAction) — no existe un estado "eliminado":
-- toda fila que sigue en la tabla, por definición, "no está eliminada".
-- Por eso el índice de título no necesita una condición de estado: ya
-- cubre exactamente la regla pedida ("bloquear duplicado si existe
-- cualquier documento no eliminado").

-- 1. Un mismo título (normalizado: trim + minúsculas) no puede repetirse
--    dentro de la misma empresa, sin importar el estado del documento.
create unique index trazadoc_documents_org_title_uniq
  on public.trazadoc_documents (organization_id, lower(trim(title)));

-- 2. Una misma estructura sugerida no puede generar más de un documento
--    dentro de la misma empresa (documentos libres, blueprint_id null, no
--    quedan afectados por este índice).
create unique index trazadoc_documents_org_blueprint_uniq
  on public.trazadoc_documents (organization_id, blueprint_id)
  where blueprint_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Eliminar borradores (Parte 4). trazadoc_documents (0043) no tenía
--    ninguna política de DELETE ("preferir no permitir delete" era la
--    regla hasta este sprint) — se agrega, acotada SOLO a status='draft'.
--    Las FK compuestas a trazadoc_document_sections/versions/status_history
--    ya tienen "on delete cascade" desde 0043: borrar el documento borra
--    sus secciones, versiones e historial automáticamente, sin necesidad
--    de tocar esas tablas aquí.
--
--    admin/quality: cualquier borrador de su empresa.
--    consultant: SOLO el borrador que él mismo creó (created_by, forzado
--    por force_created_by desde el INSERT — nunca un valor del cliente).
-- ---------------------------------------------------------------------------
create policy trazadoc_documents_delete on public.trazadoc_documents
  for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and status = 'draft'
    and (
      public.has_org_role(organization_id, array['admin','quality'])
      or (
        public.has_org_role(organization_id, array['consultant'])
        and created_by = auth.uid()
      )
    )
  );
