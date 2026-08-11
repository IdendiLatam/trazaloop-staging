# PCR-01 — DIAGNÓSTICO

Trazaloop v1.0.0 (base local `release/v1.0.0-prep`, tag `v1.0.0`, commit base `9471bb8`, entregado como ZIP sin `.git`). Diagnóstico realizado leyendo el repositorio real, sin asumir nombres.

---

## 1. Arquitectura actual del módulo de plásticos

- **Framework**: Next.js 16.2.10 (App Router, Server Components + Server Actions con `useActionState`), React 19, Tailwind 4, Supabase (`@supabase/ssr`). Build de producción con `next build --webpack` (configuración existente que debe conservarse).
- **Identidad del módulo**: el módulo de plásticos se identifica técnicamente con la clave de UI `cpr` y el `module_code` de BD `traceability_6632` (constante `CPR_MODULE_CODE` en `lib/modules/catalog.ts`). El nombre comercial visible `"Trazaloop CPR"` está centralizado en **dos** fuentes:
  - `lib/modules/catalog.ts` → `COMMERCIAL_MODULES[key="cpr"].name` (tarjetas de `/modules`, superadministración, mensajes de acceso).
  - `lib/modules/registry.ts` → `CPR_SHELL_MODULE.name` (sidebar/encabezado del shell). El `headerBadge` es `"NTC 6632 · UNE-EN 15343"` (texto normativo que NO se toca).
- **Frontera estructural**: todas las rutas del módulo viven bajo el route group `app/(app)/(shell)/(cpr)/` con un layout que aplica `requireCprModule()` (acceso comercial + kill switch + membresía). Vistas imprimibles bajo `app/(app)/(print)/(cpr)/`.

## 2. Rutas principales (módulo plásticos)

`/dashboard`, `/guided-flow`, `/diagnostic`, `/catalog` (+ `/suppliers`, `/families`, `/products`, `/materials`, `/import`), `/evidences`, `/traceability` (+ `/input-batches`, `/production-orders`, `/output-batches`, `/genealogy`), `/recycled-content` (+ output-batches, reports), `/audit-support`, `/implementation`, `/imports`, `/trazadocs` (+ subrutas). Todas server-rendered `force-dynamic`, con `searchParams` (`edit`, `order`, filtros) para modo edición/expansión.

## 3. Componentes implicados

- Formularios: `components/domain/traceability/forms.tsx` (InputBatchForm, ProductionOrderForm, OutputBatchForm, ConsumptionForm, CompositionForm), `components/domain/catalog/forms.tsx` (Supplier/Family/Product/MaterialForm), `components/domain/evidences/forms.tsx` (EvidenceForm con carga directa por intent, EvidenceLinkForm).
- Acciones de fila: `components/domain/traceability/action-button.tsx` (`ActionButton`, `LinkEvidenceInline`), `components/domain/evidences/row-actions.tsx`.
- UI compartida: `components/ui/{alert,badge,button,confirm-dialog,empty-state,field,hint-text,section-hint}.tsx`. **No existe sistema de toasts**; el patrón de retroalimentación existente es `ErrorAlert` / `InfoAlert` inline.

## 4–5. Modelo de datos y tablas relacionadas (encontradas en migraciones)

- Catálogo (0020): `product_families`, `products`, `material_classifications` (global), `suppliers`, `materials` (con FKs directas a evidencias: `origin_support_evidence_id`, `reclassification_evidence_id`).
- Trazabilidad (0025): `input_batches` (`quantity_kg numeric(14,4)` **NULLABLE** con check `null or > 0`), `production_orders` (`process_variables jsonb`, estados `draft/in_progress/closed/cancelled`), `batch_consumption` (`mass_kg > 0`), `output_batches`, `batch_composition`.
- Evidencias (0019): `evidences` (bucket privado `evidences`, ruta `evidences/{organization_id}/{evidence_id}/{filename}`), estados `pending/valid/rejected/expired`.
- Todas con FK compuesta `(organization_id, id)`, triggers de auditoría y RLS por `is_org_member`.

## 6. Relaciones de evidencias

**Ya existe una relación many-to-many polimórfica**: `evidence_links (evidence_id, target_type, target_id, link_role)` con enum `evidence_target_type` = supplier, input_batch, production_order, output_batch, material, product, product_family, document, requirement, site (0002/0019), FK compuesta a `evidences` y trigger `validate_evidence_link_org` que impide cruces entre empresas (0020/0025). Además `materials` tiene 2 FKs directas de soporte. **Conclusión punto 11: NO se necesita tabla nueva; se reutiliza `evidence_links` + FKs de materiales.**

- **Comportamiento encontrado**: los vínculos se crean (LinkEvidenceInline, EvidenceLinkForm) pero (a) los registros NO muestran qué evidencias tienen vinculadas, (b) no existe NINGUNA acción para abrir/ver el archivo de una evidencia CPR (no hay `createSignedUrl` sobre el bucket `evidences` en todo el repo; sí existe el patrón en `settings` logo y `trazadocs-master`), (c) desde una evidencia no puede verse dónde se usa.
- **Causa probable**: la visualización nunca se implementó; solo la asociación.
- **Solución propuesta**: capa `lib/db/evidences.ts` nueva (server-only) con URL firmada (10 min, sesión real → RLS de Storage aplica), vínculos por lote de destinos y "Utilizada en" resuelta por tipo; componente cliente `👁 Ver evidencia`; listado de evidencias vinculadas bajo cada registro; sección expandible "Utilizada en" en `/evidences`.

## 7–9. Órdenes, lotes de entrada y consumos

- Orden = `production_orders`; consumos = `batch_consumption` (orden ↔ lote de entrada, masa kg) gestionados inline en `/traceability/production-orders?order=<id>` (sección expandible con `ConsumptionForm`).
- **Comportamiento encontrado (punto 14)**: `createProductionOrderAction` inserta y devuelve `{error:null}`; la página re-renderiza con el formulario arriba y la nueva orden en la lista, SIN confirmación, SIN abrir consumos, SIN guía. **Causa**: la acción no conoce/propaga el id creado ni navega. **Solución**: `insert().select("id")` + `redirect` a `?order=<id>&created=1#consumos-<id>`, banner de confirmación + guía y encabezado "Materiales / lotes consumidos".
- **Comportamiento encontrado (punto 10)**: `quantity_kg` opcional en formulario (`Cantidad kg (opcional)`), en la acción (`validateInputBatch` solo valida si viene) y en importación CSV (`lib/imports/templates.ts` required:false; `validators.ts` normalizeOptionalPositiveNumber). BD permite NULL. **Solución**: obligatorio en formulario + acción (mensaje exacto en español) + importador CSV + trigger BD **solo en INSERT** (protege filas nuevas sin invalidar la edición de filas legacy con NULL) + SQL de auditoría de datos históricos (sin inventar ni borrar datos).

## 10. Variables de proceso

- **Encontrado**: `production_orders.process_variables jsonb`; el formulario expone un `Field` de texto "Variables de proceso, JSON (opcional)" donde el usuario escribe JSON crudo; `parseProcessVariables` en la acción hace `JSON.parse` y rechaza con mensaje técnico. No se muestra en ninguna otra vista.
- **Solución**: mantener JSONB; editor humano (Variable / Valor / Unidad, agregar/eliminar) con dominio puro `lib/domain/process-variables.ts` que parsea defensivamente legacy (`{"temperatura_c": 210}` → filas) y estructuras inesperadas (passthrough sin pérdida si el usuario no edita), serializando a formato canónico `[{name, value, unit}]`. Nunca JSON crudo en pantalla; resumen legible en el detalle de la orden.

## 11. Permisos Demo / Full / Extra (modelo)

Dos capas coexistentes tras T9F.1:
- **Legacy org-wide**: `organization_subscriptions.plan_code/status` + `plan_definitions` + `plan_limits` + vista `v_organization_plan_usage` (0050–0054). Desde T9F.1 es "informativa" y su formulario de cambio fue **retirado** de la consola de plataforma.
- **Por módulo (autoridad actual)**: `organization_modules.access_mode` (`demo/full/extra`) + `enabled` + `access_expires_at` (solo Demo vence), gestionado por la RPC `set_organization_module_access` (0100/0101), resuelto por `resolve_organization_module_access`. Full y Extra idénticos salvo `storage_limit_bytes` (invariante con pruebas).

## 12–13. Invitación y fuente real del plan — **CAUSA RAÍZ DEL BUG DEMO→FULL (punto 16)**

- **Cadena de la invitación (crear)**: `createTeamInvitationAction` (server/actions/team.ts) → `checkFeatureEnabled("roles_enabled")` y `checkResourceLimit("team_members")` (server/actions/plans.ts) → `getOrganizationUsage` → vista `v_organization_plan_usage` → **`organization_subscriptions.plan_code` (LEGACY)**.
- **Cadena de la invitación (aceptar)**: RPC `accept_team_invitation` (0056, SECURITY DEFINER) → lee **directamente `organization_subscriptions.plan_code`** (default `'demo'`) y `plan_limits` de ese plan.
- **Cambio de plan del superadmin**: SOLO puede cambiar `organization_modules.access_mode` (la edición del plan legacy fue retirada en T9F.1). `set_organization_module_access` **no sincroniza** `organization_subscriptions`.
- **Comportamiento encontrado**: empresa creada → `organization_subscriptions='demo'` + módulos en demo. Superadmin cambia módulo(s) a Full → `organization_subscriptions` sigue `'demo'` → invitar sigue bloqueado con "Esta función no está disponible en modo Demo." y aceptar con "Las invitaciones y roles están disponibles en los planes Full y Extra."
- **Causa raíz confirmada**: tras T9F.1 existen **dos fuentes de verdad divergentes**; el subsistema de equipo/invitaciones quedó atado a la copia legacy que ya nadie actualiza. No es caché de navegador ni de sesión (explica que refresh/logout no ayude: el estado obsoleto vive en la BD).
- **Solución**: definir la autoridad derivada del modelo por módulo: función SQL `organization_effective_plan_code(org)` = mejor `access_mode` (`extra > full > demo`) entre módulos **funcionales, habilitados y vigentes** de la empresa, con fallback al plan legacy solo si la empresa no tiene filas de módulos (compatibilidad pre-T9F). Reescribir (CREATE OR REPLACE, aditivo) `accept_team_invitation` para usarla, y hacer que `checkFeatureEnabled`/`checkResourceLimit` resuelvan `plan_limits` con el plan efectivo vía RPC `get_organization_effective_plan`. El estado administrativo `suspended/cancelled` (legacy) se conserva como bloqueo de cuenta. Control 100 % server-side; sin nuevo plan; Full≡Extra intactos.

## 14. Caches / estados de sesión

No hay caché cliente del plan: cada request server-side consulta la BD. `revalidatePath` se usa tras mutaciones. El "estado obsoleto" del bug es persistente en BD (ver §12–13), no de sesión.

## 15. Políticas RLS implicadas

`evidences`/`evidence_links` (0019, org member; validación admin/quality por trigger), catálogo y trazabilidad (0020/0025, org member por tabla + FK compuesta), `organization_modules` (0006: select miembro, insert/update admin), Storage `evidences` (0101 §12: `evidences_select` por miembro + INSERT ligado a intent; sin UPDATE/DELETE). Las URLs firmadas emitidas con la sesión real respetan `evidences_select` → una empresa no puede firmar objetos de otra.

## 16. APIs / RPCs implicadas

`accept_team_invitation` (0037→0056), `get_invitation_preview` (0037), `set_organization_module_access` + `resolve_organization_module_access` (0100/0101), `check_module_resource_allowance` (0101), RPCs de intents/finalización de evidencias (0094/0097/0098/0101). Ninguna RPC existente se elimina ni cambia de firma.

## 17. URLs firmadas de evidencias

Mecanismo del proyecto: `supabase.storage.from(bucket).createSignedUrl(path, ttl)` con la **sesión real** (patrones en `lib/db/settings.ts` TTL corto y `lib/db/trazadocs-master.ts` 600 s). Se replica idéntico para el bucket `evidences` (TTL 600 s), generación bajo demanda, nunca URLs persistidas en HTML.

## 18. Componentes reutilizables de tablas/paginación

**No existen.** Los listados (`suppliers.map`, `orders.map`, evidencias, etc.) renderizan TODAS las filas; `input-batches` tiene filtros GET por proveedor/material pero sin límite. Se crean componentes reutilizables server-friendly (`components/ui/list-controls.tsx`: búsqueda GET + paginador por enlaces) y funciones de datos paginadas **aditivas** (`search*` con `ilike` + `range` + `count` respetando `organization_id`/RLS), sin tocar las funciones `list*` usadas por selects, genealogía, dossier y flujo guiado.

## 19. Sistema de notificaciones

Solo `ErrorAlert`/`InfoAlert` inline (sin toasts globales). Punto 2/7: se agrega `SuccessAlert` al MISMO archivo/patrón + confirmación contextual sobre el registro creado/actualizado (redirect con `?created|updated=<id>` + ancla + resaltado), sin introducir un segundo design system.

## 20. Pruebas existentes

`package.json` define `typecheck`, `lint`, `build` (webpack), `test:all` (≈70 suites tsx puras/estáticas que leen archivos y ejercen lógica de dominio sin BD), suites RLS (`test:*-rls`, requieren proyecto Supabase QA — fuera de este entorno) y smoke de staging. Pruebas que aseveran literales afectados por PCR-01 y deberán actualizarse junto con el cambio de producto: `launch.test.ts` ("Trazaloop CPR" en catálogo), `textiles-module.test.ts` (landing), `imports.test.ts` (cantidad opcional), y ninguna asevera el hint JSON de variables. `t9g-spanish-ui.test.ts` pasa el nombre como argumento propio (no afecta).

---

## Decisiones de alcance derivadas del diagnóstico

1. **CPR→PCR es cambio de producto/UI**: se modifican los literales visibles y los nombres comerciales centralizados. Permanecen intactos: `key: "cpr"`, `CPR_MODULE_CODE='traceability_6632'`, route group `(cpr)`, `module_key='cpr'` de TrazaDocs, buckets, RLS, tipos `Cpr*`, archivos `cpr-*`, migraciones históricas y `modules.name` en BD (no contiene "CPR" y no se muestra al usuario final).
2. **Textos legales sembrados (0066)** mencionan "Trazaloop CPR": son documentos legales **versionados y aceptados** por usuarios; no se reescriben (ni migración histórica ni contenido legal vigente). Se deja recomendación de emitir una nueva versión legal por el mecanismo propio en un release posterior.
3. El bug Demo→Full se corrige en la **fuente** (BD + helpers server), jamás solo en frontend.


---

# PCR-01.1 — Correcciones de revisión independiente (anexo al diagnóstico)

La revisión de aceptación encontró huecos donde el diagnóstico/pruebas
verificaban la existencia del código esperado pero no el flujo REAL de la
aplicación. Hallazgos confirmados sobre el código:

1. **Doble motor de importación**. `/traceability/input-batches` usa
   `ImportWizard` → `server/actions/import.ts` (motor legacy con
   `validateRows` propio y plantillas de `lib/import-templates.ts`), NO el
   motor `lib/imports/*` que PCR-01 endureció. En el motor real,
   `quantity_kg` solo se validaba cuando venía no vacío; el vacío llegaba al
   commit como `NULL` y habría reventado contra el trigger 0103 con un error
   genérico. El diagnóstico original no distinguió los dos motores.
2. **Trigger solo-INSERT insuficiente**. La 0103 original protegía la
   creación, pero un UPDATE autorizado podía degradar un lote válido a
   `quantity_kg = NULL` (el CHECK histórico admite NULL): la regla podía
   evadirse tras crear el registro.
3. **Fijado de registro ausente**. Con listados ordenados alfabéticamente o
   por fecha, el registro recién creado/actualizado podía caer fuera de la
   página 1 a la que redirigía la confirmación: banner sin registro, sin
   ancla y sin resaltado (contradice puntos 2 y 7). Afectaba proveedores,
   familias, productos, materiales y lotes de entrada; órdenes y lotes
   producidos solo fijaban el registro expandido (`order`/`batch`), no el
   actualizado.
4. **«Ir al registro» genérico**. `targetHref` en `lib/db/evidences.ts`
   enviaba supplier/material/product/product_family/input_batch al listado
   general: con paginación, el registro podía no estar visible pese al texto
   «Ir al registro».

Correcciones aplicadas: ver PCR-01-IMPLEMENTATION-REPORT.md
§«PCR-01.1 — Correcciones de revisión independiente».
