# Trazaloop Textil · Sprint T9C — UI, detalle, generación e impresión del pasaporte técnico textil (Reporte)

> **Corrección posterior (T9C.1):** en el formulario de creación, la evaluación
> de circularidad ahora se filtra por la referencia/SKU (antes se podían elegir
> evaluaciones de otra referencia) y la server action valida esa correspondencia;
> además, el aviso de generación fallida se propaga al detalle en vez de perderse.
> Ver `TEXTILES_T9C_1_PASSPORT_UI_HARDENING_REPORT.md`.
>
> **Ampliación posterior (T9D):** se añadió una capa de compartición controlada
> —enlaces privados tokenizados (revocables, con expiración) + QR y una vista
> pública tokenizada de solo lectura con snapshot reducido—. No es portal público
> indexable ni DPP oficial. Ver `TEXTILES_T9D_PASSPORT_SHARE_REPORT.md`.

> Julio 2026. Construye la interfaz completa inicial del pasaporte técnico
> textil **sobre el snapshot ya consolidado** en T9B/T9B.1/T9B.2/T9B.3. No rehace
> el builder del snapshot ni cambia su arquitectura. **Sin QR, portal público,
> PDF server-side, IA, ACV, huella, certificación ni planes por módulo.** CPR sin
> cambios funcionales.

## 1. Objetivo

Dar a consultores y empresas una experiencia para listar, crear, generar, revisar
e imprimir pasaportes técnicos textiles, leyendo el snapshot histórico
(`snapshot_json.sections.*`) sin recalcularlo.

## 2. Rutas creadas

- `app/(app)/(shell)/textiles/passports/page.tsx` — **listado**.
- `app/(app)/(shell)/textiles/passports/new/page.tsx` — **creación** (borrador +
  generación).
- `app/(app)/(shell)/textiles/passports/[id]/page.tsx` — **detalle**.
- `app/(app)/(print)/textiles/passports/[id]/print/page.tsx` — **impresión** por
  navegador (namespace `(print)`, sin shell).

Todas bajo el guard del módulo (`requireTextilesModule`, que verifica el feature
flag y la habilitación por `organization_modules.module_code`) y `force-dynamic`.

## 3. Componentes creados (`components/textiles/passports/`)

- `passport-ui.tsx` — `Badge`, `CompletenessBadge`, `PassportSection`, `Field`,
  `EmptyNote`, `DisclaimerNote` (server components de presentación).
- `passport-sections.tsx` — `PassportSections` (las 14 secciones desde
  `snapshot_json.sections.*`) y `PassportFindings` (brechas/advertencias/
  recomendaciones). Reutilizado por detalle e impresión.
- `passport-actions.tsx` — cliente; botones de generar/regenerar y transiciones,
  que solo disparan server actions seguras.
- `passport-create-form.tsx` — cliente; formulario de creación (selector de
  referencia, lote opcional filtrado por referencia, evaluación opcional, notas).

Card de acceso añadida en la página raíz de `/textiles`.

## 4. Server actions (`server/actions/textiles-passport.ts`)

- `createTextilePassportDraftAction` — crea el borrador con inputs seguros
  (referencia, lote opcional, evaluación opcional, notas), genera un
  `passport_code` legible desde el SKU, **valida que el lote corresponda a la
  referencia**, y opcionalmente genera el snapshot ("crear y generar").
- `generateTextilePassportSnapshotAction` — genera/regenera vía RPC controlada.
- `changeTextilePassportStatusAction` — transición vía RPC controlada, validando
  el estado destino (`isTextilePassportStatus`).

Todas usan el guard Textil, `checkOrganizationCanMutate`, verifican pertenencia y
**no aceptan snapshot/data_sources/hash/estado arbitrario** desde el cliente.

## 5. Helpers DB (`lib/db/textiles-passport.ts`)

`createTechnicalPassportDraft` (INSERT mínimo; la BD garantiza nacimiento como
borrador sin snapshot ni sellos, vía trigger de 0084/0085 + RLS),
`countTechnicalPassportsForReference`, `getReferenceForOutputLot`,
`listOutputLotsForPassport`, y `listTechnicalPassports` ampliado con SKU/producto
(join) y conteos de brechas/advertencias. Sin `service_role`.

## 6. Flujos

**Creación**: `/new` → seleccionar referencia (muestra el producto asociado) →
opcional lote/evaluación → "Crear y generar" o "Crear borrador" → redirige al
detalle. **Generación**: en el detalle, botón "Generar snapshot técnico"
(borrador) o "Regenerar snapshot" (generado) → RPC controlada → `generated`.
**Detalle**: encabezado (código, versión, estado, producto/referencia, fecha,
hash corto) + disclaimer general + resumen ejecutivo + brechas/advertencias/
recomendaciones + las 14 secciones. **Impresión**: `/print` → versión limpia con
identidad de empresa (de `getCompanySettingsAction`), disclaimers y secciones;
botón "Imprimir / guardar como PDF" (navegador); elementos de UI marcados
`no-print` y **sin botones de acción de estado**.

## 7. Estados y acciones

Etiquetas: Borrador / Generado / En revisión / **Aprobado internamente** /
Obsoleto (nunca "aprobado" a secas). Transiciones ofrecidas según estado
(`allowedTextilePassportTransitions`): generated→in_review/obsolete;
in_review→approved_internal/obsolete; approved_internal→obsolete;
draft→obsolete. **consultant no aprueba internamente** (los botones se filtran por
`roleCode`, y la RPC es la autoridad final). No hay UPDATE directo. Regenerar solo
en draft/generated (`canGenerateTextilePassport`). Nueva versión: no hay RPC de
versión aún → no se ofrece; queda documentado para futuro.

## 8. Cómo se leen las evidencias

Desde **`snapshot_json.sections.evidences.items`** (ruta real confirmada en
T9B.3), con su desglose por estado (accepted/pending_review/rejected/expired/
archived) y `support_strength`. La UI muestra solo metadata (título, tipo, estado,
entidad, tipo de vínculo, fechas, **nombre de archivo**) — **nunca signed URLs ni
`file_path`**, y no intenta descargar. Incluye el disclaimer de evidencias.

## 9. Brechas, advertencias y recomendaciones

Desde `gaps_json`/`warnings_json`/`recommendations_json`, con badges por severidad
(crítica/advertencia/mejora/informativa) y prioridad (alta/media/baja). Nunca
"cumple/no cumple". Trazabilidad muestra `PAS-TRACE-005` si la orden no tiene
pasos; composición muestra `PAS-COMP-001`/`PAS-COMP-002` cuando existan.

## 10. Seguridad

RLS intacta (la UI lee/escribe con la sesión real); `organization_id` siempre en
las consultas → sin cross-tenant. Snapshot/estado/hash/sellos siguen protegidos
por los triggers de 0084/0085; la generación y las transiciones pasan por RPC
controlada. El formulario no expone inputs para datos calculados. Textil sigue
privado tras el guard + feature flag.

## 11. Source hash / datos fuente cambiaron

El detalle muestra el `source_hash` corto y la fecha de generación, con el
principio de snapshot histórico. No se implementó detección automática de cambios
(no se afirma). Regenerar o crear una nueva versión queda como flujo interno.

## 12. Verificación

- `npx tsc --noEmit` ✅ · `npm run lint` ✅ (solo el warning preexistente de
  T5.2) · `npm run build` ✅ (las 4 rutas compilan como dinámicas `ƒ`).
- Nueva suite `tests/passports/textiles-passports-ui.test.ts` (54 checks).
- Regresión: familia pasaporte (data-model/hardening/sources-links/documentary/
  generation/snapshot-fixes/snapshot-closure/circularity-evidence-hotfix) +
  módulo Textil + diagnóstico + catálogos + productos + evidencias +
  trazabilidad + circularidad + TrazaDocs + **CPR** + platform/plans/launch/
  compliance. `test:all` en verde. `test:smoke`/`test:rls` requieren `.env.local`.
- Pin de inventario del módulo actualizado (el shell gana `passports`;
  `TEXTILES_PLANNED_SECTIONS` pasa a vacío).

## 13. Validación manual (resumen)

1. **Listado**: `/textiles/passports` muestra empty state o la tabla; solo
   pasaportes de la organización activa.
2. **Por referencia**: crear sin lote → detalle con `traceability.scope =
   reference_only`.
3. **Por lote**: crear con lote compatible → detalle con orden, consumos y pasos
   de proceso.
4. **Circularidad**: crear sin evaluación → toma la completada más reciente si
   existe; se ven circularidad y sus evidencias.
5. **Evidencias**: la UI lee `sections.evidences.items`, sin signed URLs, con
   estados correctos.
6. **Estados**: generated→in_review→approved_internal por acciones; consultant no
   aprueba internamente; se muestra "Aprobado internamente".
7. **Impresión**: `/print` limpio, sin botones de acción; imprimir del navegador.
8. **Seguridad**: pasaporte de otra organización no aparece / 404; no hay input
   para manipular el snapshot.

## 14. Qué NO se hizo (fuera de alcance)

Sin QR, portal/enlace público, PDF server-side, IA, ACV, huella, certificación,
sellos, planes por módulo, `organization_module_access`/`_subscriptions`. No se
tocó CPR funcionalmente. No se creó RPC de nueva versión (botón no ofrecido;
documentado para futuro).

## 15. Qué queda para T9D/futuro

QR interno/controlado o enlace compartible privado del pasaporte aprobado
internamente (con token y control de exposición por organización), y una RPC de
nueva versión. Ver `TEXTILES_T9D_READY_PROMPT.md`. **T9D no promete portal público
oficial ni DPP oficial.**

## 16. Confirmaciones

No se creó QR. No se creó portal público. No se creó PDF server-side. No se
implementó ACV/huella. No se implementaron planes por módulo. **CPR no fue
modificado funcionalmente.** Textil sigue privado.
