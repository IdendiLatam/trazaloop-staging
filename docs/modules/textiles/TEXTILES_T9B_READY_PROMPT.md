# TEXTILES_T9B_READY_PROMPT — Prompt listo para ejecutar el Sprint T9B

> Copiar como encargo del Sprint T9B. Presupone leídos los documentos de
> arquitectura T9.0 y los reportes de T9A / T9A.1 / T9A.2. La base de datos del
> pasaporte (tabla, snapshot base, protección, RPCs, vínculos) ya existe:
> **T9B implementa la GENERACIÓN COMPLETA del snapshot desde las fuentes
> reales**, más el cálculo de brechas y el `source_hash` real. La UI es T9C.

---

Voy a adjuntarte los ZIP de T9A.2, T9A.1, T9A, T9.0 (arquitectura) y el release
candidate de CPR.

Necesito que implementes el **Sprint T9B — Generación del pasaporte técnico
textil desde datos existentes**.

Trazaloop es la plataforma; CPR es un módulo disponible; Textil es un módulo
privado/en preparación. El `module_key` en código es `textiles`; la habilitación
real usa `organization_modules.module_code` (no `module_key`, no `enabled_by`).
El acceso Textil sigue tras `TEXTILES_MODULE_ENABLED` + organización activa +
habilitación del módulo. No activar Textil públicamente. No tocar CPR
funcionalmente.

## Estado actual (T9A / T9A.1 / T9A.2)

- Tabla `textile_technical_passports` con snapshot protegido, versionamiento por
  registros, estados draft/generated/in_review/approved_internal/obsolete.
- `snapshot_json` lleva `schema_version = 'textile_technical_passport_v1'`;
  `data_sources_json` lleva `schema_version =
  'textile_technical_passport_sources_v1'`.
- RPC `generate_textile_technical_passport_base(uuid)` produce el snapshot
  **base** (esqueleto de las 14 secciones en `pending`/`not_applicable`) y un
  `source_hash` base sobre la identidad.
- RPC `change_textile_technical_passport_status(uuid, text)` para transiciones.
- Snapshot/derivados/sellos/estado inmutables por UPDATE directo (fuera del flag)
  en cualquier estado, incluido `draft` (0085).
- Vínculos de evidencia del pasaporte: familia `passport_*`
  (`passport_support`, `passport_composition_support`,
  `passport_traceability_support`, `passport_circularity_support`,
  `passport_claim_support`, `passport_care_support`,
  `passport_end_of_life_support`, `passport_documentary_support`), validada para
  `entity_type='technical_passport'`.
- Helpers base en `lib/domain/textiles-passport.ts` y `lib/db/textiles-passport.ts`.

## Alcance permitido (T9B)

1. **Migración** (si hace falta) tras la última existente (la última es `0086`):
   ampliar/`create or replace` de la función de generación para que el snapshot
   se llene **desde las fuentes reales** (documento
   `TEXTILES_PASSPORT_SOURCE_DATA_MAPPING.md`), bajo el mismo flag
   transaccional interno. Alternativamente, mover el armado del snapshot a la
   capa de servidor (server action + builder) que llame una RPC de escritura
   controlada. Decide y documenta, pero **el snapshot debe generarse en
   servidor** y seguir protegido.
2. **`lib/domain/textiles-passport.ts`**: tipos completos del snapshot por
   sección (14 secciones del documento `TEXTILES_PASSPORT_SECTION_MODEL.md`),
   cálculo de brechas (catálogo `PAS-*` del documento
   `TEXTILES_PASSPORT_GAPS_AND_WARNINGS_MODEL.md`), interpretación de estados de
   evidencia (accepted = soporte fuerte; pending_review = en revisión; rejected
   = no cuenta; expired = advertencia; archived = no activo), y armado del
   resumen ejecutivo. Funciones **puras y testeables**.
3. **`lib/db/textiles-passport.ts`**: lectores de cada fuente bajo RLS
   (productos/referencias/composición, materiales, componentes, proveedores/
   procesos, evidencias + `textile_evidence_links`, órdenes/lotes/consumos +
   `v_textile_input_lot_balance` + `v_textile_output_lot_traceability_summary`,
   circularidad, TrazaDocs textiles).
4. **`server/actions/textiles-passport.ts`**: creación de pasaporte con
   pre-chequeo (selección de referencia + lote opcional + evaluación opcional),
   generación (arma el snapshot completo y lo persiste vía la RPC/flag),
   nueva versión, transiciones. Guardas `requireTextilesForAction`; módulo fijado
   en servidor; no acepta snapshot/score/brechas del cliente.
5. **`source_hash` real**: determinista sobre `data_sources_json` con los
   `updated_at`/estados de cada fuente (referencia, composición, evidencias,
   lote, evaluación, versiones aprobadas de TrazaDocs). Guardar en
   `data_sources_json` los IDs+`updated_at` usados.
6. **Vinculación de evidencias** al pasaporte con la familia `passport_*`
   (navegación viva), además del snapshot de estados.
7. Tests de generación y actualización del roadmap.

## Alcance prohibido (T9B)

Sin UI, rutas, páginas, navegación visible, impresión (todo eso es T9C), sin QR,
portal público, PDF server-side, IA, ACV, huella de carbono, firma, planes por
módulo. No tocar CPR. No cambiar el contrato de estados ni los `schema_version`.

## Tests esperados (T9B)

`tests/passports/textiles-passports-generation.test.ts` (con datos sembrados si
el entorno lo permite, o inspección de las funciones puras):

- el snapshot completo se arma desde datos sembrados (composición, evidencias,
  circularidad, trazabilidad, TrazaDocs) y respeta `schema_version`;
- `completeness_status` por sección coherente con los datos;
- brechas `PAS-*` calculadas según el catálogo (composición ≠100, claim sin
  evidencia aceptada, lote con trazabilidad en revisión, sin evaluación
  completed, procedimiento no aprobado, etc.);
- interpretación de estados de evidencia (rejected/archived no cuentan como
  soporte fuerte; expired genera advertencia);
- `source_hash` cambia si cambia cualquier fuente;
- cross-tenant: no se leen fuentes de otra organización;
- el snapshot generado no es editable (regresión de 0085);
- CPR intacto; regresión de las 15+ suites textiles.

Actualizar el pin de `tests/unit/textiles-module.test.ts` si se añade migración.
Encadenar el nuevo script a `test:all`. Correr typecheck, lint, build,
`test:platform/plans/launch/compliance` y la regresión completa.
`smoke`/`rls` requieren `.env.local` (ambiental).

## Entrega T9B

Reporte `docs/modules/textiles/TEXTILES_T9B_PASSPORT_GENERATION_REPORT.md`
(builder, fuentes leídas, brechas, `source_hash`, vinculación de evidencias,
tests, riesgos, qué queda para T9C) + roadmap actualizado + prompt T9C listo
(`TEXTILES_T9C_READY_PROMPT.md`) + ZIP.

---

## Contexto: T9C (siguiente)

**T9C — UI, impresión y hardening visual**: rutas
`(shell)/textiles/passports`, `…/new`, `…/[id]`, `(print)/…/[id]/print`
(documento `TEXTILES_PASSPORT_UI_FLOW_PROPOSAL.md`) bajo la guarda Textil +
`force-dynamic`; listado, creación con pre-chequeo, detalle por secciones,
alerta de `source_hash` desactualizado, transiciones (enviar a revisión /
aprobar internamente / nueva versión / obsoleto), impresión por navegador con
logo/NIT; card "Pasaporte técnico textil" en `/textiles` y
`TEXTILES_PLANNED_SECTIONS` a vacío; tests de UI/seguridad + hardening. **T9D**
(QR/enlace público) permanece como futuro documentado, no se implementa.
