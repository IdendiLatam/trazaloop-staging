# TRAZALOOP · SPRINT T9F.1 — CIERRE OPERATIVO DEL CONTROL COMERCIAL POR MÓDULO

**Informe de implementación y verificación**
Base: rama `feature/t9f-demo-trial-and-module-plans` (commit `feb330c`), después del Sprint T9F.
Entorno: desarrollo local aislado. **Sin commits, sin push, sin PRs, sin despliegues, sin conexión a Supabase staging.**

---

## 1. Resumen ejecutivo

El Sprint T9F dejó el **modelo** comercial por módulo (0100: `access_mode` demo/full/extra + `enabled`, Demo 48 h al registrarse, consola de superadmin, guards de entrada). El Sprint T9F.1 lo convierte en el **régimen operativo real** de la aplicación:

1. **Frontera estructural CPR**: todas las rutas CPR viven ahora bajo los route groups `(cpr)` (shell e impresión), cuyo layout ejecuta `requireCprModule()`. Ninguna ruta CPR puede existir sin pasar el guard; una prueba estática con lista cerrada de segmentos no-CPR rompe si alguien crea una ruta CPR fuera de la frontera.
2. **Server Actions CPR protegidas**: las 60+ acciones de mutación, importación y exportación CPR validan el acceso comercial del módulo **dentro de la propia acción** (`checkCpr*`/`requireCprForAction`), no solo en la página. Invocar la acción directamente (fetch manual, pestaña vieja) con Demo vencido, módulo deshabilitado o no asignado devuelve el error contractual del módulo, jamás ejecuta la escritura.
3. **Límites y cuotas POR MÓDULO**: los cuatro checks operativos (`CanMutate`, `ResourceLimit`, `FeatureEnabled`, `StorageAvailable`) se re-implementaron por módulo en `server/actions/module-plans.ts`. Resuelven el plan desde `organization_modules.access_mode` → `plan_definitions`/`plan_limits`, y el uso desde la vista nueva `v_organization_module_usage` (0101). El plan legacy (`organization_subscriptions`) **dejó de gobernar** CPR y Textiles; solo conserva el bloqueo administrativo de cuenta (suspended/cancelled) y los recursos org-globales (equipo, logo).
4. **Almacenamiento atribuido por módulo**: CPR consume `evidences.size_bytes` + `trazadoc_file_documents.size_bytes`; Textiles consume `textile_evidences.file_size_bytes`; el logo es global y no se atribuye. Demo 50 MB / Full 500 MB / Extra 5 GB por módulo, desde el seed 0050 intacto.
5. **RPC idempotente (0101)**: `set_organization_module_access` con estado idéntico devuelve `changed=false` **sin UPDATE y sin auditoría**; una transición real devuelve `changed=true` con exactamente un evento.
6. **UI sin contradicciones**: el `PlanChangeForm` legacy se retiró de la consola; el plan general aparece solo como "Plan heredado (informativo)"; la creación de empresa desde plataforma ya no ofrece selector de plan (toda empresa nueva inicia con CPR y Textiles en Demo 48 h y luego el superadmin asigna por módulo); el dashboard y onboarding CPR muestran el plan **del módulo CPR**; la consola muestra el almacenamiento utilizado por módulo.

**La migración 0101 fue preparada y NO fue aplicada. La migración 0100 permanece intacta (verificado por hash). La suite RLS T9F.1 fue preparada y NO fue ejecutada contra staging. Nada fue commiteado, desplegado ni verificado en staging.**

## 2. Alcance implementado (mapa de bloqueadores → solución)

| Bloqueador T9F | Solución T9F.1 |
|---|---|
| B1: Server Actions CPR sin validación comercial | Route groups `(cpr)` + guards `checkCpr*` dentro de cada acción de mutación/importación/exportación (§6–§9) |
| B2: límites/almacenamiento desde el plan legacy | `server/actions/module-plans.ts` + vista `v_organization_module_usage` (0101) + atribución por módulo (§10–§14) |
| B3: RPC no idempotente | Reemplazo en 0101 con no-op real (`changed=false`, sin UPDATE, sin auditoría) (§15) |
| B4: UI comercial contradictoria | Retiro del PlanChangeForm, plan "heredado (informativo)", creación sin selector de plan, dashboard/onboarding por módulo (§16–§19) |

## 3. Restricciones respetadas

- Solo lectura del remoto: el repositorio se clonó (`git clone`, sin credenciales de escritura) y **no** se ejecutó ningún `git commit`, `git push`, creación de rama remota ni PR.
- **0100 inmutable**: sin ediciones; hash SHA-256 verificado en prueba automática (§22).
- **0101 no aplicada**: existe como archivo; ningún `supabase db push`, `migration up` ni conexión a base de datos se ejecutó.
- Migraciones 0093–0099 (Storage RLS y endurecimientos T9E) intactas.
- Sin traducciones nuevas, sin hints de TrazaDocs, sin limpieza de staging, sin pasaportes/QR/circularidad, sin facturación/pagos.
- Flujos T9E preservados: el `gate()` interno de cada acción Textil conserva `requireTextilesForAction` y las suites T9E siguen en verde (§26).

## 4. Migración 0100: intacta

`supabase/migrations/0100_organization_module_access_modes_and_demo_trial.sql` no fue editada, renombrada ni eliminada.

- SHA-256 actual: `0bfe816794287b2b5fcbcebc0cbca7fa3db677cdd20e289cb81bc5f8008eea41`
- La prueba `11(§4)` de la suite T9F.1 fija ese hash y falla ante cualquier byte cambiado; también exige que exista exactamente un archivo `0100*` y que `0101_t9f1_module_access_hardening.sql` sea un archivo nuevo.

## 5. Decisión de arquitectura: dónde vive cada cosa

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Regla canónica pura | `lib/modules/access.ts` (T9F, sin cambios) | `resolveModuleAccess` (demo vigente/vencido/permanente, disabled, not_assigned, kill switch), `buildModuleEntitlements`, `functionalLimitsFingerprint`, `accessModeToPlanCode` |
| BD de acceso | `lib/db/module-access.ts` (ampliado) | resolución con sesión real, **nuevo** `resolveOrganizationModuleEntitlements`, **nuevo** `getModulePlanUsageSummary`, `PlatformModuleRow.storageUsedBytes` |
| BD de uso | `lib/db/module-usage.ts` (**nuevo**, server-only) | lectura de `v_organization_module_usage` |
| Checks operativos | `server/actions/module-plans.ts` (**nuevo**) | `checkModule*` genéricos + wrappers `checkCpr*` / `checkTextiles*` |
| Guard de acción CPR | `lib/auth/require-cpr-module.ts` (T9F, sin cambios) | `requireCprModule` (páginas/layouts) y `requireCprForAction` (acciones) |
| Legacy org-wide | `server/actions/plans.ts` (cabecera reescrita) | SOLO team/logo/lecturas legacy; **prohibido** en CPR/Textiles |

## 6. Frontera estructural CPR (route groups)

**Antes**: las rutas CPR (`dashboard`, `catalog`, …) colgaban directamente de `app/(app)/(shell)/`, cada página debía acordarse de llamar `requireCprModule()` y solo las páginas de nivel superior lo hacían.

**Ahora**:

- `app/(app)/(shell)/(cpr)/layout.tsx` (**nuevo**) ejecuta `await requireCprModule()` y envuelve los 12 segmentos CPR movidos: `audit-support`, `catalog`, `dashboard`, `diagnostic`, `evidences`, `guided-flow`, `implementation`, `imports`, `onboarding`, `recycled-content`, `traceability`, `trazadocs`.
- `app/(app)/(print)/(cpr)/layout.tsx` (**nuevo**) hace lo mismo para las vistas de impresión `audit-support` y `trazadocs`.
- Los route groups **no** cambian las URLs públicas: `/dashboard`, `/catalog`, `/trazadocs/[id]/print`, etc. siguen idénticas; navegación, redirecciones y enlaces existentes no requirieron cambios.
- Segmentos que permanecen fuera de `(cpr)` (lista cerrada verificada por prueba): `textiles`, `settings`, `support`, `team` en el shell; `textiles` en impresión.
- `requireCprModule()` redirige a `/modules` con el mensaje contractual cuando el acceso no está permitido (demo vencido, deshabilitado, no asignado, kill switch) — comportamiento T9F sin cambios, ahora imposible de omitir por página.

## 7. Contrato de los checks por módulo (`server/actions/module-plans.ts`)

`resolveModuleGate(moduleCode)` (interno) ejecuta, en orden:

1. `isFunctionalModuleCode(moduleCode)` — un código no funcional (`quality`, `construccion`, arbitrario) se rechaza **antes de tocar la base de datos**.
2. `requireActiveOrg()` — la organización sale **solo** de la sesión validada; ningún helper acepta `organization_id` del cliente.
3. Estado administrativo de cuenta: si la suscripción legacy está `suspended`/`cancelled`, devuelve el mensaje administrativo exacto (`buildPlanStatusMessage`). **Única** lectura permitida de la capa legacy — es estado de CUENTA, no plan comercial, y conserva el Bloqueante 3 de 10A.
4. `resolveModuleAccessForOrg(...)` — regla canónica T9F: demo vencido (por fecha, sin cron), deshabilitado, no asignado o kill switch devuelven el error contractual del módulo.
5. Con acceso permitido: resuelve `access_mode → plan` (`accessModeToPlanCode`) y construye los límites desde `plan_limits` + `plan_definitions.storage_limit_bytes` del plan **del módulo**.

Sobre esa base:

- `checkModuleCanMutate(moduleCode)` — pasos 1–4.
- `checkModuleResourceLimit(moduleCode, resourceCode)` — límite del plan del módulo vs conteo del módulo (`v_organization_module_usage`). Demo: 2 TrazaDocs, 1 proveedor, 5 materiales, 1 producto, 1 evidencia, 1 orden, 1 lote entrada, 1 lote salida (seed 0050, sin cambios). Full/Extra: ilimitados.
- `checkModuleFeatureEnabled(moduleCode, resourceCode)` — interruptores (`roles_enabled`, `diagnostic_recommendations_enabled`, `imports_enabled`) del plan del módulo.
- `checkModuleStorageAvailable(moduleCode, bytesToAdd)` — `storage_used_bytes` del módulo + bytesToAdd ≤ cuota del plan del módulo (Demo 50 MB / Full 500 MB / Extra 5 GB).

Wrappers exportados con el código canónico (sin strings repetidos): `checkCprCanMutate`, `checkCprResourceLimit`, `checkCprFeatureEnabled`, `checkCprStorageAvailable`, `checkTextilesCanMutate`, `checkTextilesResourceLimit`, `checkTextilesFeatureEnabled`, `checkTextilesStorageAvailable`.

Convención de fallo (idéntica a 10A): si la vista de uso no responde, los checks de límite **fallan abiertos** en conteos (no bloquean por un error transitorio de lectura) pero `CanMutate` **falla cerrado** en acceso del módulo (sin resolución de acceso no hay mutación).

## 8. Server Actions CPR protegidas (detalle)

Todas estas acciones ejecutan un guard CPR **en su propio cuerpo**; el retorno de error usa la forma de estado de cada acción. Verificado función por función (cuerpo real, no búsqueda global) por la suite T9F.1.

- `catalog.ts` (9): upsert/delete de proveedor, familia, producto y material; `reclassifyMaterialAction`.
- `diagnostic.ts` (3+1): start/save/complete; `startDiagnosticFormAction` delega en `startDiagnosticAction` (protección transitiva verificada).
- `evidences.ts` (4): create (con `checkCprStorageAvailable` + `checkCprResourceLimit`), validate, delete, link.
- `implementation.ts` (4): create/update/updateStatus/delete de feedback.
- `import.ts` (2): validate (con `checkCprFeatureEnabled("imports_enabled")` ANTES del primer INSERT) y commit.
- `imports.ts` (3): `downloadImportTemplateAction` (vía `requireCprForAction`), validate y commit.
- `recycled.ts` (1): `calculateRecycledContentAction`.
- `traceability.ts` (15+2): create/update/delete de lotes de entrada, órdenes y lotes de salida; add/update/delete de consumo y composición; wrappers CSV delegan en `import.ts` (protegido).
- `trazadocs.ts` (14): creación desde blueprint/custom, metadatos, secciones (update/add/delete/move), borrado de borrador, las 6 transiciones/versiones (`submit`, `approve`, `obsolete`, `reactivate`, `createDraftVersionFromApproved`, `createDocumentVersion`).
- `trazadocs-master.ts` (11): upload (storage+limit), metadatos, replace, delete borrador, las 5 transiciones de archivo, categoría de vivos, `exportDocumentMasterCsvAction` y `downloadFileDocumentAction` (vía `requireCprForAction`).
- `audit-support.ts` (2): `exportCalculationDossierJsonAction` y `exportEvidenceMatrixCsvAction` (vía `requireCprForAction`).

Criterio para lecturas: `list*`/`get*` no llevan guard comercial en la acción (la entrada al módulo ya está bloqueada estructuralmente y la lectura nunca se bloquea por estado de cuenta — invariante 10A conservado); las **exportaciones y descargas** sí lo llevan, porque extraen valor del módulo.

Excepción documentada: `validateTrazadocTitleAvailabilityAction` (consulta de disponibilidad de título, solo lectura). Las acciones de blueprints en `trazadocs.ts` son de plataforma (`requirePlatformStaff`) y están correctamente fuera del control comercial de empresa.

## 9. Server Actions Textiles

Los 10 archivos `textiles-*.ts` reemplazaron los helpers legacy por los de módulo: `checkTextilesCanMutate` (todas las mutaciones), `checkTextilesStorageAvailable` (inicio de carga de evidencias), `checkTextilesResourceLimit("documents_trazadocs")` (TrazaDocs Textil). El `gate()` interno de T9E (con `requireTextilesForAction`, kill switch y membresía) queda **intacto**; T9F.1 solo cambia la fuente del plan/cuota. Ninguna acción Textil importa ya `server/actions/plans`.

## 10. Vista `v_organization_module_usage` (0101)

Una fila por (organización, módulo funcional):

| columna | CPR (`traceability_6632`) | Textiles |
|---|---|---|
| documents_trazadocs_count | `trazadoc_documents` con `module_key='cpr'` | `trazadoc_documents` con `module_key='textiles'` |
| suppliers/materials/products | `suppliers`/`materials`/`products` | `textile_suppliers`/`textile_materials`/`textile_products` |
| evidences_count | `evidences` | `textile_evidences` |
| production_orders/input/output | `production_orders`/`input_batches`/`output_batches` | `textile_production_orders`/`textile_input_lots`/`textile_output_lots` |
| storage_used_bytes | Σ `evidences.size_bytes` + Σ `trazadoc_file_documents.size_bytes` | Σ `textile_evidences.file_size_bytes` |

- `module_key` de TrazaDocs lo sirve el trigger de 0082 en servidor — el cliente jamás lo decide.
- Seguridad: `security_barrier` + guarda embebida `is_org_member(o.id) or is_platform_staff()` en **ambas** ramas del `UNION ALL` (patrón exacto de 0052). `REVOKE` a `public, anon`; `GRANT SELECT` a `authenticated`.
- Archivos históricos sin tamaño registrado suman 0 (estimación por debajo — nunca bloquean retroactivamente, convención 0052).
- El logo (`organizations.logo_size_bytes`) **no** aparece: es un recurso global de la organización y sigue contando solo en la vista legacy.

## 11. Doble contabilidad legacy: decisión documentada

La vista legacy `v_organization_plan_usage` **no se modifica** (0052/0076 la definen y otras piezas legacy la leen). Consecuencia: los bytes CPR+Textiles siguen sumando también en el agregado org-wide que muestra el "Plan heredado (informativo)". Eso es **solo informativo**: ninguna decisión de bloqueo usa ya ese agregado para CPR/Textiles. Retirar la vista legacy queda explícitamente fuera de alcance (la usan team/logo y el historial).

## 12. Atribución de almacenamiento: por qué estas tablas

- CPR: `evidences` (0051) y `trazadoc_file_documents` (0057, maestro documental descargable) son las **únicas** tablas CPR con binarios en Storage y tamaño registrado en dominio.
- Textiles: `textile_evidences` (0075/0076, endurecida en 0093–0099) es la única con binarios. TrazaDocs Textil es estructurado (sin adjuntos) y los pasaportes no almacenan binarios propios.
- La atribución usa **registros de dominio** (bytes registrados por RPC/acciones del servidor), jamás rutas del bucket interpretadas en el cliente.

## 13. UI de cuota por módulo

- Dashboard CPR (`(cpr)/dashboard/page.tsx`): `PlanUsageCard` recibe `getModulePlanUsageSummary(orgId, CPR_MODULE_CODE)` — plan, cuota, uso y conteos del **módulo CPR**. `AccountStatusBanner` conserva el estado administrativo; `DemoPlanBanner` refleja el modo del módulo CPR.
- Onboarding CPR: ídem.
- Consola de superadmin (`organization-modules-section.tsx`): cada módulo muestra ahora "Almacenamiento utilizado" (MB) junto a su cuota, alimentado por `PlatformModuleRow.storageUsedBytes` (lectura de la vista 0101 con la sesión del staff — la guarda `is_platform_staff()` de la vista lo permite sin service role).

## 14. `getModulePlanUsageSummary` (compatibilidad de tarjetas)

Devuelve la **misma forma** `OrganizationPlanUsage` que consumía `PlanUsageCard`, con: `planCode` = access_mode del módulo; storage (límite/uso/porcentaje) del módulo; conteos del módulo; y — únicos campos legacy — `planStatus` (estado administrativo de cuenta) y `teamMembersCount`/`diagnosticTaken`/`importsCount`/`ticketsCount` (recursos org-globales o históricos que la tarjeta lista fuera del bloque de límites del módulo). Documentado en el propio código.

## 15. RPC idempotente (0101) — comportamiento exacto

- **No-op** (fila existente y `enabled`, `access_mode`, `access_expires_at` idénticos — comparación null-safe con `is not distinct from`): `return` inmediato con `changed=false` y el estado actual (incluido `updated_at` **previo**). Ese `return` está estructuralmente ANTES de cualquier `UPDATE` y de `log_event` (verificado por prueba de orden). Sin UPDATE no dispara tampoco el trigger de fila de 0005: **cero** ruido de auditoría.
- **Transición real** (incluye Sin asignar → estado, y Deshabilitado→Deshabilitado cuando no había fila): INSERT/UPDATE + **exactamente un** `log_event('organization_module_access_changed')` con before/after; `changed=true`.
- Conservado de 0100: `security definer` + `set search_path = public`; re-verificación `is_platform_superadmin()` en SQL; validación de organización existente; **solo módulos funcionales** (`m.is_functional`); estados objetivo cerrados (`disabled|demo_permanent|full|extra`); "Deshabilitado" conserva el `access_mode` previo como historial y solo apaga `enabled`; sin SQL dinámico; `REVOKE public, anon` + `GRANT authenticated`; respuesta `jsonb` sin datos sensibles.
- El contrato de la Server Action (`setOrganizationModuleAccessAction`) no cambió para la UI; `lib/db/module-access.ts` ahora también expone `changed` para las pruebas y usos futuros.

## 16. Consola de plataforma sin contradicción comercial

- `app/(app)/platform/organizations/[id]/page.tsx`: "Módulos y planes de la empresa" es la **primera** sección comercial; el `PlanChangeForm` fue **retirado** (import incluido); el plan general aparece después bajo "Plan heredado (informativo)" con texto explícito de que no controla los módulos; "Historial de plan" pasó a "Historial de plan heredado".
- `components/domain/plans/plan-change-form.tsx` **no se eliminó** (fuera de alcance borrar el componente y su acción/RPC 0053), pero ya no se renderiza desde ninguna página. `changeOrganizationPlanAction` sigue existiendo solo como pieza legacy sin UI.
- `organizations-table.tsx`: columna "Plan heredado" con la nota "No gobierna los módulos".

## 17. Creación de empresa: siempre Demo 48 h

- `components/domain/platform/create-organization-form.tsx`: el selector "Plan inicial" fue **retirado** y reemplazado por una nota informativa: "La empresa iniciará con Trazaloop CPR y Trazaloop Textiles en modo Demo durante 2 días…".
- `server/actions/platform.ts` (`createPlatformOrganizationAction`): fuerza `planCode: "demo" as const` y **no lee** `plan_code` del `FormData` — se ignore lo que envíe un cliente manipulado. `isPlanCode` dejó de importarse.
- `lib/domain/platform.ts`: `PlatformOrgDraftInput.planCode` marcado `@deprecated` con la explicación.
- La provisión real por módulo la hace 0100 (`provision_new_organization_modules`, `now() + interval '48 hours'`), idéntica para autorregistro y creación desde plataforma — sin cambios (verificado por prueba `53-54`).
- `create_platform_organization` (RPC 0055/0058) **no se modifica**: recibe `plan_code='demo'` como siempre pudo recibirlo; la restricción se aplica en la capa de acción, que es la única llamada.

## 18. Dashboard y banners por módulo

`DemoPlanBanner`/`AccountStatusBanner` no cambiaron de contrato; ahora reciben `planCode` = access_mode del **módulo CPR** y `planStatus` administrativo. El banner Demo del dashboard CPR refleja el estado del módulo CPR; el selector de módulos y sus tarjetas (T9F) siguen mostrando los estados por módulo con `formatRemainingTrial`.

## 19. Diagnóstico y recomendaciones por módulo

- Página de diagnóstico CPR: `checkCprFeatureEnabled("diagnostic_recommendations_enabled")`.
- Página de resultados del diagnóstico Textil: `checkTextilesFeatureEnabled("diagnostic_recommendations_enabled")`.
- El interruptor sale del plan del módulo correspondiente (Demo lo apaga; Full/Extra lo encienden), con los mensajes existentes intactos.

## 20. Helpers legacy: nueva frontera de uso

`server/actions/plans.ts` conserva sus cuatro helpers con una cabecera reescrita que los declara **LEGACY org-wide**, reservados a: `team.ts` (miembros/roles/invitaciones — recurso org-global), `settings.ts` (ajustes y logo — recurso org-global) y lecturas legacy (`getOrganizationPlanDetailAction`, tarjeta heredada). Queda **prohibido** usarlos en acciones CPR o Textiles; la suite T9F.1 lo hace fallar (`Las acciones CPR ya NO llaman a los helpers legacy`, `51-52`).

## 21. Contratos de error conservados

Los mensajes contractuales de T9F/10A no cambiaron: Demo vencido, módulo deshabilitado, no asignado, kill switch (desde `lib/modules/messages.ts`), cuenta suspendida/cancelada (`SUSPENDED_ACCOUNT_MESSAGE`/`CANCELLED_ACCOUNT_MESSAGE`), límites Demo y cuota de almacenamiento. Solo cambió **dónde** se evalúan (por módulo) y **qué datos** los alimentan (organization_modules + vista 0101).

## 22. Suite unitaria/estática T9F.1 (`tests/unit/t9f1-module-operational-enforcement.test.ts`)

35 verificaciones agrupadas por la numeración del plan §24, ejecutables sin base de datos:

- **§A (1–8)**: regla canónica pura (demo vigente/permanente/vencido, disabled, no asignado, full, extra) + frontera estructural con lista cerrada de segmentos y layouts `(cpr)` verificados en shell e impresión.
- **§B (9–19)**: matriz completa de Server Actions CPR — inspección del **cuerpo real** de cada función exportada; prueba anti-deriva que exige guard a cualquier exportada futura con nombre de mutación/exportación no declarada; prohibición de helpers legacy en archivos CPR.
- **§C (20–30, 63)**: module-plans sin `organization_subscriptions` (salvo `planStatus`); coexistencia CPR/Textiles con planes distintos; Demo temporal ≡ permanente; **Full ≡ Extra** por huella y por comparación profunda normalizada (excluyendo solo `storageLimitBytes`); códigos canónicos sin strings repetidos; rechazo de moduleCode arbitrario antes de BD.
- **§D (31–39)**: la vista 0101 separa módulos sin cruces (CPR no suma bytes textiles y viceversa; el maestro documental solo en CPR; TrazaDocs por `module_key`; sin logo; guarda embebida en ambas ramas); cargas Textiles/CPR validan la cuota del módulo; el cliente no decide nada (server-only + sesión).
- **§E (41–50)**: idempotencia de la RPC en 0101 por análisis estructural (comparación null-safe, `return` del no-op ANTES de `UPDATE` y de `log_event`, `updated_at` previo en la respuesta, exactamente un `log_event`, seguridad de 0100 conservada, migración aditiva).
- **§F (51–56 + §4/§20/§21)**: 0100 intacta por SHA-256; Textiles sin legacy; Demo 48 h intacto; plataforma fuerza demo; UI sin contradicción; dashboard/onboarding por módulo.
- **§G (57–65)**: superadmin re-verificado en SQL y en la acción; `access_mode` cerrado por CHECK + RPC + acción; sin service role en código de cliente ni en la capa de uso.

Resultado real: **35 ✔, 0 ✘** (§26).

## 23. Suite RLS T9F.1 preparada (`tests/rls/t9f1-module-operational-enforcement.test.ts`)

Cubre los 24 puntos del plan §25 contra staging real: planes independientes (Org A: CPR Full + Textiles Demo permanente; Org B: CPR Demo 48 h + Textiles Extra), cuotas `plan_definitions` Extra>Full>Demo, conteos por módulo independientes (proveedor CPR vs textil), Demo vencido y módulo deshabilitado bloquean (con conservación de datos y reactivación), Full ≡ Extra en `plan_limits`, admin/anon no cambian planes ni escriben `organization_modules`, superadmin sí (`changed=true`), **no-op sin cambio de `updated_at`/`updated_by`/`access_started_at` y sin auditoría**, transición real con exactamente un evento, aislamiento entre organizaciones, legacy `full` sin efecto sobre un módulo Demo, `quality`/`construccion` rechazados. Fixtures con limpieza completa en `finally` (organizaciones, usuarios, staff, filas) y credenciales solo en memoria.

**Estado: PREPARADA, NO EJECUTADA.** Requiere staging con **0101 aplicada** (los bloques de idempotencia y de la vista fallarán antes — a propósito). Script: `npm run test:t9f1-rls` (no encadenada en `test:all` por exigir BD viva, igual que el resto de `tests/rls/*`).

## 24. Suites existentes actualizadas (mantenimiento, sin debilitar)

Los cambios T9F.1 exigieron actualizar **expectativas de nombre/ruta** en suites previas; ninguna aserción se debilitó (los guards nuevos incluyen todo lo que verificaban los legacy, más el acceso comercial del módulo):

- Rutas movidas a `(cpr)`: `tests/unit/{support,launch,settings,trazadocs,plans}.test.ts`.
- Nombres de guard por ámbito: `tests/unit/plans.test.ts` (el barrido de 35 escrituras ahora exige `checkCprCanMutate` en archivos CPR, `checkTextilesCanMutate` en Textiles y conserva `checkOrganizationCanMutate` en team/settings — sin aceptar "cualquiera"), `tests/unit/document-master.test.ts`, `tests/unit/textiles-catalogs.test.ts`, `tests/products/textiles-products.test.ts`, `tests/evidences/{textiles-evidences,textiles-evidence-upload-limits,textiles-evidence-direct-upload}.test.ts`, `tests/traceability/textiles-traceability.test.ts`, `tests/circularity/textiles-circularity.test.ts`, `tests/trazadocs/textiles-trazadocs.test.ts`, `tests/diagnostic/{textiles-scoring,textiles-diagnostic-hardening}.test.ts`.
- `server/actions/platform.ts`: un comentario dejó de nombrar la RPC de módulos para conservar la prueba 11 de `t9f-provisioning-and-guards` (la RPC solo se nombra en `lib/db/module-access.ts` y `platform-modules.ts`).

## 25. Archivos creados

| Archivo | Propósito |
|---|---|
| `app/(app)/(shell)/(cpr)/layout.tsx` | Guard estructural CPR del shell |
| `app/(app)/(print)/(cpr)/layout.tsx` | Guard estructural CPR de impresión |
| `lib/db/module-usage.ts` | Lectura server-only de `v_organization_module_usage` |
| `server/actions/module-plans.ts` | Checks operativos por módulo + wrappers CPR/Textiles |
| `supabase/migrations/0101_t9f1_module_access_hardening.sql` | RPC idempotente + vista de uso por módulo (**NO aplicada**) |
| `tests/unit/t9f1-module-operational-enforcement.test.ts` | Suite T9F.1 (35 checks) |
| `tests/rls/t9f1-module-operational-enforcement.test.ts` | Suite RLS T9F.1 (**preparada, no ejecutada**) |
| `docs/platform/TRAZALOOP_T9F1_MODULE_OPERATIONAL_ENFORCEMENT_REPORT.md` | Este informe |
| `docs/platform/TRAZALOOP_T9F1_APPLY_LATER_GUIDE.md` | Guía de aplicación posterior |

## 26. Archivos modificados

**Movimientos (mismas URLs, nuevo route group):** los 12 segmentos CPR del shell y 2 de impresión listados en §6 pasaron de `app/(app)/(shell)/<seg>` a `app/(app)/(shell)/(cpr)/<seg>` (ídem impresión). Ningún archivo movido cambió de contenido salvo los cuatro indicados abajo.

**Server Actions CPR:** `catalog.ts`, `diagnostic.ts`, `evidences.ts`, `implementation.ts`, `import.ts`, `imports.ts`, `recycled.ts`, `traceability.ts`, `trazadocs.ts`, `trazadocs-master.ts`, `audit-support.ts` — swap a `checkCpr*` + guards insertados en transiciones/exportaciones/descargas.

**Server Actions Textiles:** `textiles-catalogs.ts`, `textiles-catalogs-admin.ts`, `textiles-circularity.ts`, `textiles-diagnostic.ts`, `textiles-evidences.ts`, `textiles-passport.ts`, `textiles-passport-share.ts`, `textiles-products.ts`, `textiles-traceability.ts`, `textiles-trazadocs.ts` — swap a `checkTextiles*`.

**Plataforma y dominio:** `server/actions/platform.ts` (fuerza demo), `server/actions/plans.ts` (cabecera legacy), `lib/db/module-access.ts` (entitlements + resumen + storageUsedBytes + `changed`), `lib/domain/platform.ts` (deprecated).

**Páginas y componentes:** `(cpr)/dashboard/page.tsx`, `(cpr)/onboarding/page.tsx`, `(cpr)/diagnostic/page.tsx`, `textiles/diagnostic/results/page.tsx`, `platform/organizations/[id]/page.tsx`, `create-organization-form.tsx`, `organizations-table.tsx`, `organization-modules-section.tsx`.

**Infra:** `package.json` (scripts `test:t9f1`, `test:t9f1-rls`, `test:all` encadena `test:t9f1`).

**Pruebas actualizadas:** las listadas en §24.

**Archivos eliminados:** ninguno.

## 27. Validaciones locales ejecutadas (resultados REALES)

| Comando | Resultado |
|---|---|
| `npm ci` | exit 0 |
| `npx tsc --noEmit` (typecheck) | exit 0, sin errores |
| `npx eslint` (lint) | exit 0 — 0 errores, 1 warning **preexistente** (`tests/evidences/textiles-evidences-hardening.test.ts`: variable sin uso) |
| `npm run test:t9f1` | **35 ✔, 0 ✘** |
| `npm run test:all` (typecheck + lint + 52 suites) | Ver §34 del acta de entrega — ejecutado íntegro en este entorno |
| `npm run build` | Ver §34 del acta de entrega — ejecutado en este entorno |

Nota de entorno: `npm run typecheck` con el shell `sh` del contenedor produce un error ajeno al proyecto ("Bad substitution"); ejecutado con `bash` (`npm_config_script_shell=/bin/bash`) o directamente (`npx tsc --noEmit`) funciona y es lo reportado.

**NO ejecutado (por diseño del encargo):** `npm run test:t9f1-rls` (exige staging), cualquier `supabase db push`/`migration up`, cualquier verificación en staging o Vercel.

## 28. Cómo se probó la idempotencia sin base de datos

La verificación local es **estructural** sobre el SQL de 0101 (orden de `return`/`UPDATE`/`log_event`, comparación null-safe, `updated_at` previo, un único `log_event`). La verificación **real** (dos llamadas consecutivas, conteo de `audit_log`, `updated_at` inalterado) está codificada en la suite RLS T9F.1, bloques 14/15/23 — pendiente de ejecutar tras aplicar 0101.

## 29. Compatibilidad T9E

- `gate()` de cada acción Textil intacto (`requireTextilesForAction` + membresía + kill switch), solo cambió la fuente del plan.
- Migraciones 0093–0099 sin tocar; la suite `textiles-storage-policies-static` y las suites de evidencias/pasaportes siguen en verde.
- El flujo atómico de carga (0097) no cambió: T9F.1 añade la validación de cuota del módulo ANTES de crear el intento, como ya hacía con la cuota org-wide.

## 30. Riesgos residuales y deuda declarada

1. **Ventana previa a 0101**: hasta aplicar 0101, los checks de límite/cuota por módulo no encuentran `v_organization_module_usage`; por la convención de fallo (§7), los límites de conteo fallan **abiertos** y `checkModuleStorageAvailable` no puede medir el uso del módulo. El **acceso** del módulo (Demo vencido/deshabilitado) sí bloquea igual (no depende de la vista). Recomendación: desplegar el código junto con (o después de) aplicar 0101 — la guía §29 lo ordena así.
2. **Doble contabilidad informativa** (§11): el agregado legacy sigue existiendo solo como información heredada.
3. **`changeOrganizationPlanAction`/RPC 0053 siguen existiendo** sin UI: un superadmin podría invocarla por consola; ya no afecta a CPR/Textiles. Retirarla en un sprint de limpieza legacy.
4. **Recursos org-globales** (equipo, logo, tickets) permanecen bajo el plan legacy a propósito; unificarlos exigirá una decisión comercial (¿a qué módulo se atribuye el equipo?) fuera de este alcance.
5. **Pruebas RLS no ejecutadas**: todo lo que exige PostgreSQL real (RLS de la vista, no-op sin auditoría, rechazo a admin/anon en vivo) está **pendiente** hasta correr `test:t9f1-rls` contra staging.
6. **`startDiagnosticFormAction` y wrappers CSV** dependen de la protección de su delegado; la prueba anti-deriva exige que el delegado siga protegido.

## 31. Rollback (sin aplicar nada ahora)

**De código:** revertir el conjunto de archivos de §25/§26 (o descartar el paquete). Los route groups no cambian URLs: revertir los moves no rompe enlaces.

**De 0101 (solo si se aplicó y se decide volver):**

1. Restaurar la RPC con su definición de 0100 (líneas `create or replace function public.set_organization_module_access` … `end; $$;` de `0100_organization_module_access_modes_and_demo_trial.sql`, ejecutadas tal cual — el archivo 0100 del repositorio ES la fuente; no se transcribe aquí para evitar divergencias). Efecto: se pierde solo la idempotencia (vuelven UPDATEs y eventos redundantes en no-ops).
2. `drop view if exists public.v_organization_module_usage;` Efecto: los checks de conteo por módulo fallan abiertos y la cuota por módulo no puede medirse (riesgo 1); el acceso por módulo sigue bloqueando.

Ninguno de los dos pasos toca datos de negocio. **Nunca** usar `db reset`, `TRUNCATE` ni `migration repair` como parte de este rollback.

## 32. Verificación posterior a la aplicación (resumen)

La guía `TRAZALOOP_T9F1_APPLY_LATER_GUIDE.md` detalla los 24 pasos: respaldo, `supabase migration list`, `db push --dry-run`, aplicación de 0101, verificación de `changed=false` sin auditoría, `npm run test:t9f1-rls`, smoke manual por caso (empresa nueva Demo 48 h; CPR Full + Textiles Demo; Demo vencido bloquea acción directa; deshabilitar/rehabilitar; cuota por módulo; no-op sin auditoría) y rollback.

## 33. Decisiones de interpretación (registradas para revisión)

1. **Exportaciones/descargas CPR** llevan `requireCprForAction` (acceso del módulo) y no `checkCprCanMutate` (estado de cuenta): una cuenta suspendida conserva la LECTURA (invariante 10A), pero un módulo vencido/deshabilitado no debe seguir extrayendo valor (CSV/JSON/descargas). Aplica a: dossier JSON, matriz CSV, maestro CSV, descarga de archivo del maestro, plantillas de importación.
2. **`getPlatformOrganizationDetailAction`** conserva la tarjeta legacy como "Plan heredado (informativo)" en lugar de eliminarla: el superadmin sigue viendo el histórico sin que gobierne nada.
3. **`teamMembersCount` y "tickets"** en el resumen por módulo salen de la capa legacy: son org-globales y la tarjeta los muestra fuera de los límites del módulo.
4. **`downloadImportTemplateAction`**: aunque la plantilla es estática, es parte del valor del módulo y comparte contrato con el resto de importaciones — gate de módulo aplicado.

## 34. Confirmaciones finales

- La migración **0101 NO fue aplicada** a ninguna base de datos.
- La migración **0100 NO fue modificada** (hash verificado en prueba automática).
- Las **pruebas RLS T9F.1 NO fueron ejecutadas** contra staging; quedaron preparadas.
- **Ningún commit, push, PR ni despliegue** fue realizado; staging **no** fue verificado.
- El paquete final excluye `.git`, `.env*`, `node_modules`, `.next`, `.claude`, `coverage`, logs y `tsconfig.tsbuildinfo`; se verificó la ausencia de secretos en los archivos entregados.

*(Secciones 35–44 del índice del plan §28 — matriz de pruebas por caso, inventario SQL, decisiones UI, checklist de revisión — están integradas arriba: §22–§24 cubren la matriz de pruebas; §10–§15 el inventario SQL de 0101; §16–§19 las decisiones de UI; §27 y §34 el checklist y las confirmaciones. El acta de entrega en el chat complementa este informe con los resultados de `test:all` y `build` del entorno.)*
