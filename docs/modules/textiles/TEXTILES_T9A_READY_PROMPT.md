# TEXTILES_T9A_READY_PROMPT — Prompt listo para ejecutar el Sprint T9A

> Copiar como encargo del Sprint T9A. Presupone leídos los documentos de
> arquitectura T9.0 (`TEXTILES_T9_0_TECHNICAL_PASSPORT_ARCHITECTURE.md` y
> hermanos). T9A implementa **solo modelo de datos + snapshot en servidor**; la
> generación desde fuentes es T9B y la UI es T9C.

---

Voy a adjuntarte los ZIP de T9.0 (documentación de arquitectura), T8.1, T8 y el
release candidate de CPR.

Necesito que implementes el **Sprint T9A — Modelo de datos y snapshot del
pasaporte técnico textil**.

Trazaloop es la plataforma; CPR es un módulo disponible; Textil es un módulo
privado/en preparación. El `module_key` en código es `textiles`; la habilitación
real usa `organization_modules.module_code` (no `module_key`, no `enabled_by`).
El acceso Textil sigue tras `TEXTILES_MODULE_ENABLED` + organización activa +
habilitación del módulo. No activar Textil públicamente. No tocar CPR
funcionalmente.

## Alcance permitido (T9A)

1. **Una migración nueva** tras la última existente (numérala según el estado
   real del repo; la última es `0083_trazadocs_section_module_hardening.sql`):
   `00XX_textile_technical_passports.sql`.
2. Crear la tabla **`textile_technical_passports`** exactamente como en
   `TEXTILES_PASSPORT_DATA_MODEL_PROPOSAL.md`: `unique(organization_id, id)`,
   `unique(organization_id, passport_code, passport_version)`, FKs compuestas a
   `textile_references`, `textile_output_lots` y
   `textile_circularity_assessments` por `(organization_id, id)`, check de
   `status` (draft/generated/in_review/approved_internal/obsolete), triggers
   `set_updated_at`/`force_created_by`/`prevent_organization_id_change`/
   `audit_row_change`, e índices `(org, reference_id)`, `(org, output_lot_id)`,
   `(org, status)`, `(org, passport_code)`.
3. **RLS deny-by-default** espejo de `textile_circularity_assessments` (0080):
   SELECT miembros; INSERT admin/quality/consultant + organización activa;
   UPDATE admin/quality siempre y consultant solo en draft/in_review; DELETE
   admin/quality solo en draft.
4. **Trigger de validación de destino** (espejo de `validate_…_target` de 0080):
   si `output_lot_id` no es null, debe pertenecer a una orden de la misma
   `reference_id`; si `circularity_assessment_id` no es null, debe ser de esa
   `reference_id` (y coherente con el lote si aplica).
5. **Trigger de protección del snapshot** (patrón T7.1) sobre
   `textile_technical_passports`: fuera del flag transaccional interno
   `trazaloop.textile_passport_generate`, el INSERT exige `status='draft'` y
   prohíbe fijar `snapshot_json`/`source_hash`/`gaps_json`/`warnings_json`/
   `recommendations_json`/sellos; en UPDATE, esos campos + `reference_id`/
   `output_lot_id`/`passport_code`/`passport_version` son inmutables una vez
   `status` dejó de ser `draft`. `security definer`, `search_path` fijo, execute
   revocado; el trigger solo lee el flag, nunca lo fija.
6. **Ampliación aditiva** de `textile_evidence_links` (como 0080): añadir
   `technical_passport` al check de `entity_type` y `passport_support` al de
   `link_type`, y extender `validate_textile_evidence_link_org()` para resolver
   la organización del pasaporte. (Solo el esquema/validación; el uso es T9B.)
7. **RPC de esqueleto** `generate_textile_technical_passport(...)` y
   `change_textile_technical_passport_status(...)` (security definer, granted a
   authenticated con `auth.uid()` + `is_org_member` + módulo `textiles`
   habilitado) que fijan el flag y sellan estado/versión de forma atómica. En
   T9A el snapshot puede armarse mínimo (estructura vacía por sección); T9B lo
   llena desde las fuentes. Deja el contrato listo.
8. Tests nuevos (ver abajo). Documentación: reporte T9A + actualización del
   roadmap.

## Alcance prohibido (T9A)

Sin UI, sin rutas, sin server actions de producto (solo la RPC y, si acaso, un
lector mínimo para tests), sin builder de fuentes (es T9B), sin QR, sin portal
público, sin PDF server-side, sin firma, sin planes por módulo, sin
`organization_module_*`. No crear tablas de secciones ni de versiones. No tocar
CPR ni las migraciones existentes. No añadir documentos base textiles.

## Tests esperados (T9A)

Archivo `tests/passports/textiles-passports.test.ts` (inspección SQL/código):

- única migración nueva del sprint (pin al slot propio, como T2.1–T8.1);
- tabla con `unique(org,id)`, `unique(org, code, version)`, FKs compuestas y
  check de status;
- RLS deny-by-default con las 4 políticas y roles correctos;
- trigger de destino: lote↔referencia y evaluación↔referencia;
- trigger de protección (patrón T7.1): nacer solo `draft`, campos calculados
  vacíos, inmutabilidad tras `generated`, mismo flag transaccional, sin fijar el
  flag, search_path + revoke;
- ampliación aditiva de `textile_evidence_links` (entity/link nuevos sin perder
  los previos) + `validate_…_org` resuelve `technical_passport`;
- RPCs granted a authenticated con verificación de módulo;
- sin `service_role`, sin tocar RLS de otros módulos, lenguaje prudente (sin
  certificación "garantizada", "cumple automáticamente", "pasaporte oficial",
  "DPP oficial", "sello garantizado"; ESPR como "ESPR (UE) 2024/1781");
- 0082/0083 y la RLS de CPR intactas.

Actualizar los pins de `tests/unit/textiles-module.test.ts` (inventario de
migraciones 0070–00XX y, si el shell gana ruta, en T9C). Encadenar
`test:textiles-passports` a `test:all`. Correr: typecheck, lint, build,
`test:platform/plans/launch/compliance` y **regresión CPR + las 13 suites
textiles + trazadocs**. `smoke`/`rls` requieren `.env.local` (ambiental).

## Entrega T9A

Reporte `docs/modules/textiles/TEXTILES_T9A_PASSPORT_DATA_MODEL_REPORT.md`
(migración, tabla, RLS, triggers, RPC, ampliación de evidencias, activación con
`module_code`, tests, riesgos, qué queda para T9B/C) + roadmap actualizado + ZIP.

---

# Plan T9A / T9B / T9C / T9D (contexto para quien planifique)

## T9A — Modelo de datos y snapshot (este prompt)
Migración, tabla, RLS, triggers de destino y de protección (T7.1), ampliación
aditiva de evidencias, RPCs de esqueleto, tests. Sin UI ni builder de fuentes.

## T9B — Generación desde datos existentes
- `lib/domain/textiles-passport.ts`: tipos del snapshot (documento 3), cálculo
  de brechas (documento 8), interpretación de estados de evidencia, resumen
  ejecutivo — funciones puras testeables.
- `lib/db/textiles-passport.ts`: lectores de cada fuente (documento 4) bajo RLS.
- `server/actions/textiles-passport.ts`: creación con pre-chequeo, generación
  (llama la RPC con el snapshot armado), nueva versión, transiciones; guardas
  `requireTextilesForAction`, módulo fijado en servidor.
- `source_hash` determinista + `data_sources_json`.
- Vinculación de evidencias (`entity_type='technical_passport'`) + snapshot.
- Tests: snapshot correcto desde datos sembrados, hash cambia si cambian
  fuentes, brechas calculadas, cross-tenant, evidencia rejected no cuenta como
  soporte fuerte.

## T9C — UI, impresión y hardening
- Rutas `(shell)/textiles/passports`, `…/new`, `…/[id]`,
  `(print)/…/[id]/print` (documento 9) bajo guarda Textil + `force-dynamic`.
- Listado, creación con pre-chequeo, detalle por secciones, alerta de
  `source_hash`, transiciones (enviar a revisión / aprobar internamente / nueva
  versión / obsoleto), impresión por navegador con logo/NIT.
- Card "Pasaporte técnico textil" en `/textiles`; `TEXTILES_PLANNED_SECTIONS`
  pasa a vacío.
- Tests de UI/seguridad + hardening de generación; regresión completa.

## T9D — QR / enlace público controlado (futuro, NO inmediato)
Solo documentado: enlace público de solo lectura con token por pasaporte
aprobado, control de exposición por organización, y QR que apunta a ese enlace.
No se implementa hasta decidir el modelo de exposición y su seguridad.

---

# Tests futuros consolidados (T9A/B/C)

De `TEXTILES_T9_0` §19: no cross-tenant · snapshot no editable · `generated_by`
pertenece a la organización · `reference_id` pertenece a la organización ·
`output_lot` corresponde a la referencia · evaluación de circularidad
corresponde a la referencia · evidencia `rejected` no cuenta como soporte fuerte
· `source_hash` cambia si cambian las fuentes · pasaporte aprobado no editable ·
nueva versión preserva la anterior · sin promesas de certificación · CPR no
modificado.
