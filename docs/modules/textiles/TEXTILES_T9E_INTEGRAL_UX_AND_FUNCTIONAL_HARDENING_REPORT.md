# Sprint T9E · Auditoría integral, corrección funcional y hardening de producción — Trazaloop Textiles

Fecha: 2026-07-21 · Alcance: módulo Trazaloop Textiles (T1–T9D) · Rama base: `feature/textiles-t1-t9d-implementation`

---

## 1. Resumen ejecutivo

El Sprint T9E auditó el módulo Trazaloop Textiles completo (navegación, branding, selector de módulos, catálogos, formularios, evidencias, circularidad, seguridad multi-tenant) y corrigió la causa raíz de los ocho defectos reportados en pruebas manuales, que las 24 suites existentes no detectaban:

1. **Navegación contextual por módulo (4.1)** — el shell mostraba el menú CPR dentro de `/textiles`. Se creó un registro central de módulos (`lib/modules/registry.ts`) y la navegación y el badge del encabezado se resuelven por módulo activo.
2. **Branding dinámico (4.2)** — el encabezado mostraba "NTC 6632 · UNE-EN 15343" (normas CPR) dentro de Textiles. Ahora cada módulo muestra su identidad; la marca visible se unificó como **"Trazaloop Textiles"** en las 41 superficies del módulo.
3. **Selector principal (4.3)** — la tarjeta de Textiles resolvía mal el caso "sin organización activa" y comunicaba "en preparación". Ahora resuelve cuatro estados explícitos (flag apagado / sin organización / organización no habilitada / disponible) sin depender de CPR ni booleanos hardcodeados.
4. **Catálogo de fibras (4.4)** — era global de solo lectura, sin explicación. Ahora la UI explica el **Catálogo base de Trazaloop** y la migración **0093** habilita **fibras personalizadas por organización** con RLS, unicidad, protección absoluta de las fibras base y aislamiento de uso cross-tenant.
5. **Valores iniciales de selects (4.5, transversal)** — los tres motores de formulario inicializaban los selects en `""` sin opción placeholder: lo visible no era lo enviado ("Tipo … no válido"). Regla uniforme nueva en `lib/domain/textiles-forms.ts`: **el estado inicial de un select es su primera opción real** (+ placeholder de respaldo cuando el valor no coincide con ninguna opción).
6. **Eliminación segura (4.6)** — solo existía activar/desactivar. Nuevas acciones de hard delete **solo sin relaciones** (verificación de uso en servidor + FKs + RLS admin/quality), con diálogo de confirmación accesible; los registros históricos siguen protegidos.
7. **Evidencias > 1 MB (4.7)** — el default de 1 MB de Server Actions bloqueaba la carga. Techo explícito `serverActions.bodySizeLimit: "25mb"` + validación pura compartida cliente/servidor (tamaño 20 MB, MIME, extensión) + mensaje de condiciones antes de subir. Bucket privado y URLs firmadas de corta vida se conservan.
8. **Circularidad (4.8)** — la primera referencia visible se rechazaba (mismo defecto de selects) y la validación de escritura no exigía referencia activa. Corregido por la regla de selects + helper `textileReferenceIsUsableForCircularity` (misma regla en lectura y escritura).

Resultados: **46/46 suites** (39 previas + 7 nuevas de regresión) en verde, `typecheck` ✅, `lint` ✅ (0 errores), `build` ✅, migración 0093 aplicada y verificada en staging, y **prueba funcional manual real** ejecutada con `npm run dev` + navegador (evidencia de cada flujo en §12).

---

## 2. Alcance

- Solo el módulo Textiles y las piezas transversales estrictamente necesarias (shell/nav/portal de módulos). CPR no cambió funcionalmente (verificado por suites previas y prueba manual).
- Migraciones 0070–0092 intactas; una única migración nueva **0093** (aditiva, con rollback documentado).
- Sin cambios de framework ni dependencias (Next.js 16.2.10 se conserva; `experimental.serverActions.bodySizeLimit` es la clave correcta de esta versión, verificada contra el config-schema instalado).

## 3. Estado inicial

- 24 suites textiles en verde, pero los ocho defectos reportados eran reproducibles desde el código (ver causas raíz §4).
- Migraciones 0070–0092 aplicadas; `textile_fiber_types` global de solo lectura; políticas DELETE ya existentes en BD para admin/quality (catálogos y maestros) pero **sin ninguna acción de servidor ni UI** que las usara.

## 4. Problemas reproducidos y causa raíz

| # | Defecto | Causa raíz (verificada en código) |
|---|---------|-----------------------------------|
| 4.1 | Menú CPR dentro de /textiles | `app/(app)/(shell)/layout.tsx` renderizaba un único `AppNav` estático (grupos CPR) para todas las rutas del shell; no existía noción de "módulo activo". |
| 4.2 | "NTC 6632 · UNE-EN 15343" en Textiles | El mismo layout tenía el badge hardcodeado; el layout de /textiles decía "Módulo privado en preparación". |
| 4.3 | Tarjeta Textiles "deshabilitada" | `/modules` trataba "sin organización activa" (caso típico justo después del login, antes de elegir empresa) igual que "no habilitado" → tarjeta "Próximamente"; y el estado habilitado conservaba copy de "en preparación". |
| 4.4 | Fibras solo lectura sin explicación | `textile_fiber_types` (0073) es global sin `organization_id`, RLS solo SELECT; la página no explicaba procedencia ni ofrecía alternativa. |
| 4.5 | Primer valor visible rechazado | `TextileCatalogManager`, `TextileEntityForm` y `ReferenceAssociationManager` inicializaban selects en `""` sin `<option value="">`: el navegador pinta la primera opción, el estado envía `""`, el servidor rechaza. 14 selects afectados (proveedor, material, componente, proceso, tercerizado, colección, lote, alcance, roles, pasos, circularidad…). |
| 4.6 | No existía eliminar | Decisión T3 deliberada ("delete reservado a RLS, sin UI"); faltaban acciones de servidor con verificación de relaciones y una UX segura. |
| 4.7 | "Body exceeded 1 MB limit" | `next.config.ts` no configuraba `serverActions.bodySizeLimit`; el default de Next.js es 1 MB y el archivo viaja por Server Action. La action ya validaba 20 MB/MIME pero nunca llegaba a ejecutarse. |
| 4.8 | "La referencia seleccionada no es válida" | El formulario usa `TextileEntityForm` con select de referencia sin placeholder y sin `initialValues` → enviaba `""` (misma causa 4.5). Además la validación de escritura no exigía `is_active` (el listado sí). |

## 5. Soluciones

### 5.1 Navegación (4.1)
- **`lib/modules/registry.ts` (nuevo)**: registro central puro con `CPR_SHELL_MODULE` y `TEXTILES_SHELL_MODULE` (nombre, badge del encabezado, homePath, prefijos de ruta, navegación top-level y grupos). `resolveShellModuleForPath()` (prefijo estricto, CPR por defecto) e `isShellNavLinkActive()` (exacto vs prefijo).
- **`components/layout/nav.tsx`**: ahora es cliente (`usePathname`), resuelve el módulo activo y renderiza SU menú + grupos transversales (Sistema, Plataforma condicional) + enlace "⇄ Cambiar de módulo". Marca la opción activa con `aria-current="page"`. Los grupos históricos (`TRAZABILIDAD_GROUP`, etc.) se re-exportan para compatibilidad (tests y consumidores).
- Menú Textil: Inicio Textiles · Gestión textil (Diagnóstico, Catálogos, Productos y referencias, Evidencias, Trazabilidad, Circularidad) · Documentación textil (TrazaDocs Textil, Pasaportes técnicos).
- **Navegación móvil**: el encabezado ahora abre el mismo menú contextual en `<details>` (antes no existía menú en móvil).
- La ruta pública `app/textile-passport-share/[token]` permanece fuera del shell (verificado por test).

### 5.2 Encabezado y metadata (4.2)
- **`components/layout/module-badge.tsx` (nuevo)**: badge del encabezado resuelto por módulo (CPR = normas; Textiles = "Trazaloop Textiles"). El shell ya no hardcodea texto.
- `app/(app)/(shell)/textiles/layout.tsx`: franja de identidad "Módulo · Trazaloop Textiles · {organización}" + `metadata.title` ("%s · Trazaloop Textiles") para el navegador.
- Marca unificada: `Trazaloop Textil` → **`Trazaloop Textiles`** en 41 archivos de UI (regex con guarda `(?!es)`, sin tocar claves técnicas `textiles`).
- Home del módulo (`/textiles`): se retiró el bloque "módulo en preparación / module_key" y la sección vacía "Futuras secciones"; el copy presenta el módulo funcional con lenguaje prudente intacto.

### 5.3 Selector de módulos (4.3)
- `lib/modules/textiles.ts`: nuevo tipo `TextilesAvailability` + `resolveTextilesAvailability()` (regla pura canónica; 10.2 la cubre exhaustivamente).
- `app/(app)/modules/page.tsx`: tarjeta `TextilesCard` con 4 estados — `available` (enlace activo a `/textiles`, "Disponible para tu organización"), `no_active_org` (explica y enlaza a `/select-org`), `org_not_enabled` (bloqueada con explicación y vía de contacto), `flag_disabled` ("Próximamente"). Se conservan los helpers del guard (`isTextilesModuleEnabled()` + `organizationHasTextiles`) para que selector y guard jamás diverjan. Sin dependencia de CPR ni `comingSoon` hardcodeado.

### 5.4 Fibras (4.4)
**Origen real (auditado):** tabla `public.textile_fiber_types`, creada y sembrada por `0073_textile_catalogs.sql` (19 fibras, `on conflict (code) do nothing`), global (sin `organization_id`), RLS solo `select using (true)`, referenciada por `textile_materials.primary_fiber_type_id` y `textile_reference_fiber_composition.fiber_type_id` (FK simples). Ninguna vía de escritura para organizaciones.

**Decisión:** catálogo base global INTACTO + fibras personalizadas por organización (migración **0093**, ver §8). UI (`catalogs/fibers`):
- Sección "**Catálogo base de Trazaloop**" con la explicación pedida y distintivo "Catálogo base" por fibra.
- Sección "**Fibras personalizadas de tu organización**": crear/editar/desactivar/eliminar (solo admin/quality; solo lectura informativa para otros roles), nombre único contra base y propias, familia del CHECK de 0073, sufijo "(personalizada)" en los selects de materiales y composición.
- Validación org-aware: `textileFiberTypeIsActive(organizationId, fiberId)` acepta solo fibra base o de la MISMA organización (RLS + trigger lo re-verifican en BD).

### 5.5 Valores iniciales (4.5) — corrección transversal
- **`lib/domain/textiles-forms.ts` (nuevo, puro)**: `initialFieldValue` / `emptyFieldValues` (select → primera opción real; checkbox → false), `selectNeedsFallbackPlaceholder` + `SELECT_FALLBACK_PLACEHOLDER_LABEL` ("Seleccione una opción…").
- Los TRES motores (`catalog-manager`, `entity-form`, `reference-association-manager`) consumen la regla única y el `CatalogSelect` compartido: **lo que se ve seleccionado es exactamente lo que se envía**; si el estado no coincide con ninguna opción, se muestra el placeholder deshabilitado (jamás una opción real fantasma). Los selects opcionales conservan su opción explícita `""` ("— Sin … —") como primera opción.
- Defaults semánticos: los selects de valoración (`separability`, `traceabilityRisk`) ahora listan "Sin evaluar" primero (`TEXTILE_*_UI_ORDER`) — un registro nuevo no nace con una valoración accidental. Solo cambia el orden de UI, no los valores del CHECK.
- Servidor: los enums OPCIONALES tratan `""` como ausencia (`cleanText(x) ?? default`) en separabilidad, riesgo, estado de colección, alcance de composición y rol de consumo; los OBLIGATORIOS siguen rechazando `""`.

**Inventario de formularios revisados** (auditoría transversal §5.1 del encargo): los 7 usos de `TextileCatalogManager` (proveedores, materiales, componentes, procesos, tercerizados, colecciones, lotes de entrada), los 8 de `TextileEntityForm` (productos crear/editar, referencia crear/editar, órdenes crear/editar, lote producido crear/editar, circularidad), los 5 de `ReferenceAssociationManager` (fibras/materiales/componentes de referencia, consumos, pasos), y los formularios bespoke (criterios de circularidad, vínculos de evidencia, carga de evidencia, panel de estado, wizard de diagnóstico, editor TrazaDocs, creación de pasaporte, enlaces privados) — estos últimos ya eran correctos (estado inicial válido o placeholder explícito) y no se tocaron, salvo la carga de evidencia (§5.7).

### 5.6 Eliminación segura (4.6)
- **`server/actions/textiles-catalogs-admin.ts` (nuevo)**: `deleteTextile{Supplier,Material,Component,Process,OutsourcedProcess}Action` + CRUD de fibras personalizadas. Cada delete: triple guarda del módulo → rol admin/quality en servidor → **conteo de relaciones** (`lib/db/textiles-catalogs.ts`: materiales, componentes, tercerizados, lotes de entrada, pasos de orden / corrida de producción, vínculos de evidencia, referencias, composiciones…) → delete filtrado por organización → FK 23503 como respaldo ante carreras → mensajes claros ("No es posible eliminar X: está en uso por … Desactívalo en su lugar."). Ante un error de conteo se ASUME uso.
- **`components/ui/confirm-dialog.tsx` (nuevo)**: diálogo accesible reutilizable (`role="dialog"`, `aria-modal`, foco en Cancelar, Escape, clic en fondo) — sin `window.confirm`.
- `TextileCatalogManager`: botón "Eliminar" solo con `canDelete` (rol calculado en servidor por página) + diálogo con explicación de impacto + estado de procesamiento + mensaje de éxito.
- **Protección reforzada intacta**: ninguna acción nueva borra evidencias, lotes, órdenes / corridas de producción, lotes producidos / finales, evaluaciones, snapshots ni pasaportes; las políticas de BD existentes se conservan (evidencias `status <> 'accepted'`, pasaportes solo `draft`, etc.). Desactivar sigue disponible en todos los catálogos.

### 5.7 Evidencias > 1 MB (4.7)
> **SUPERADO POR T9E.1.** La solución T9E descrita abajo (elevar
> `serverActions.bodySizeLimit` a 25 MB manteniendo los bytes dentro de la
> Server Action) se consideró insuficiente para producción y fue
> REEMPLAZADA en T9E.1 por carga DIRECTA a Supabase Storage (signed upload
> URL + intentos 0094 + verificación del objeto real); el `bodySizeLimit`
> fue retirado. Ver `TEXTILES_T9E_1_PRODUCTION_CLOSURE_REPORT.md`.

- **Arquitectura evaluada en T9E**: carga directa a Storage con signed upload URL + confirmación se descartó EN ESE SPRINT por la ventana de huérfanos sin limpieza programada (T9E.1 la implementó con la tabla de intentos 0094 + limpieza inmediata/oportunista/script).
- **Solución T9E (retirada en T9E.1)**: `experimental.serverActions.bodySizeLimit: "25mb"`.
- **Constantes centrales** (`lib/domain/textiles-evidences.ts`): `TEXTILE_EVIDENCE_MAX_FILE_BYTES` (20 MB), `TEXTILE_EVIDENCE_MAX_FILE_MB`, `TEXTILE_EVIDENCE_ALLOWED_MIME_TYPES`, **`TEXTILE_EVIDENCE_ALLOWED_EXTENSIONS` (nuevo)**, **`TEXTILE_EVIDENCE_FILE_RULES_MESSAGE` (nuevo, mensaje UX)** y **`validateTextileEvidenceFile()` (nuevo, regla pura compartida)**.
- Cliente: pre-validación con la MISMA regla antes de enviar + condiciones visibles antes de la carga (formatos, tamaño, almacenamiento privado con enlaces firmados temporales).
- Servidor: se añadió la validación de EXTENSIÓN a las existentes (MIME, tamaño, rol, cuota); limpieza de huérfanos, bucket privado, rutas por organización, URL firmada de 10 minutos y nombre sanitizado se conservan y quedan bajo regresión.

### 5.8 Circularidad (4.8)
- Cliente: corregido por la regla de selects (la primera referencia visible ES el valor real).
- Servidor: `textileReferenceIsUsableForCircularity(orgId, refId)` — exactamente la regla del listado (existe + organización activa + `is_active`); mensajes diferenciados: vacío → "Selecciona la referencia / SKU a evaluar.", inválida/inactiva/cross-tenant → "La referencia seleccionada no es válida o está inactiva.". El `organization_id` jamás viene del cliente.

### 5.9 Seguridad (cambios y confirmaciones)
- 0093: RLS estricta (lectura base+propias; escritura solo personalizadas admin/quality), trigger NO security-definer que protege las fibras base incluso ante service_role (patrón 0077), trigger SECURITY DEFINER con `search_path=public` y `revoke execute` que impide usar fibras de otra organización en materiales/composición.
- Confirmado y ahora bajo regresión: sin service_role en cliente, sin `organization_id` del cliente en ninguna action textil, bucket privado, tokens de enlaces hasheados (sha256), sin URLs firmadas permanentes (TTL 600 s), sin errores SQL crudos al usuario, flag sin `NEXT_PUBLIC_`, ruta pública del pasaporte vía RPC controlada sin shell privado.

## 6. Terminología y lenguaje prudente (§6–§7 del encargo)
- La UI ya usaba "Órdenes / corridas" y "lotes producidos / finales"; no existía ningún "Orden de producción" ni "Lote de salida" a secas (verificado por barrido). Los textos nuevos (conteos de uso) usan "orden / corrida de producción".
- Nombres técnicos de BD intactos. Los disclaimers existentes se conservan; la suite `no-certifier-names` sigue en verde (la 0093 se redactó evitando incluso subcadenas prohibidas).

## 7. Archivos

**Creados (14):**
1. `lib/modules/registry.ts`
2. `lib/domain/textiles-forms.ts`
3. `components/layout/module-badge.tsx`
4. `components/ui/confirm-dialog.tsx`
5. `server/actions/textiles-catalogs-admin.ts`
6. `supabase/migrations/0093_textile_custom_fibers.sql`
7. `tests/unit/textiles-navigation.test.ts`
8. `tests/unit/textiles-module-selector.test.ts`
9. `tests/unit/textiles-custom-fibers.test.ts`
10. `tests/unit/textiles-forms-selects.test.ts`
11. `tests/unit/textiles-safe-deletion.test.ts`
12. `tests/evidences/textiles-evidence-upload-limits.test.ts`
13. `tests/unit/textiles-t9e-security.test.ts`
14. `docs/modules/textiles/TEXTILES_T9E_INTEGRAL_UX_AND_FUNCTIONAL_HARDENING_REPORT.md` (este informe)

**Modificados (funcionales, 26):** `app/(app)/(shell)/layout.tsx` · `components/layout/nav.tsx` · `app/(app)/modules/page.tsx` · `app/(app)/(shell)/textiles/layout.tsx` · `app/(app)/(shell)/textiles/page.tsx` · `lib/modules/textiles.ts` · `lib/domain/textiles-catalogs.ts` · `lib/domain/textiles-evidences.ts` · `lib/db/textiles-catalogs.ts` · `lib/db/textiles-circularity.ts` · `server/actions/textiles-catalogs.ts` · `server/actions/textiles-products.ts` · `server/actions/textiles-traceability.ts` · `server/actions/textiles-circularity.ts` · `server/actions/textiles-evidences.ts` · `components/domain/textiles/catalog-manager.tsx` · `components/domain/textiles/entity-form.tsx` · `components/domain/textiles/reference-association-manager.tsx` · `components/domain/textiles/evidence-upload-form.tsx` · `app/(app)/(shell)/textiles/catalogs/{fibers,suppliers,materials,components,processes,outsourced-processes}/page.tsx` · `app/(app)/(shell)/textiles/references/[id]/page.tsx` · `next.config.ts` · `package.json`.

**Modificados (solo marca "Trazaloop Textiles" o tests):** ~30 páginas textiles adicionales (barrido de marca), `app/page.tsx`, `tests/unit/textiles-module.test.ts` (lista de migraciones extendida a 0093, patrón de cada sprint), `tests/passports/textiles-passports-share.test.ts` (ídem).

**Eliminados:** ninguno.

## 8. Base de datos — migración nueva

**`0093_textile_custom_fibers.sql`** (única; 0070–0092 intactas):
- Columnas: `organization_id uuid NULL REFERENCES organizations ON DELETE RESTRICT` (NULL = catálogo base), `created_by`, `updated_by`.
- Índices: único parcial `(organization_id, lower(name)) WHERE organization_id IS NOT NULL`; índice por organización.
- RLS: SELECT = base o miembro; INSERT/UPDATE/DELETE = solo personalizadas y solo `admin/quality` (`has_org_role`).
- Trigger `protect_global_textile_fiber_types` (sin SECURITY DEFINER: aplica también a service_role): las fibras base no se modifican ni eliminan; una personalizada no cambia de organización.
- Trigger `validate_textile_fiber_org` (SECURITY DEFINER, `search_path=public`, `revoke execute`): materiales y composición solo referencian fibras base o de su MISMA organización.

**Requisitos previos:** 0070–0092 aplicadas (helpers `is_org_member`/`has_org_role` de 0004).

**Estado:** aplicada y verificada en el entorno de `.env.local` (staging del proyecto) el 2026-07-21, en transacción. Verificación posterior: 19 fibras base con `organization_id NULL`, 4 políticas, 3 triggers nuevos, 2 índices.

**Consultas de verificación:**
```sql
select count(*) from public.textile_fiber_types where organization_id is null;             -- 19
select policyname from pg_policies where tablename='textile_fiber_types';                  -- 4 políticas
select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
 where c.relname='textile_fiber_types' and not tgisinternal;                               -- incluye trg_protect_global_textile_fiber_types
```

**Rollback:** documentado en el encabezado del propio archivo 0093 (drop de triggers/funciones/políticas/índices/columnas y restauración de la política de lectura original). Sin `db reset`. Nota: el drop de columnas elimina las fibras personalizadas creadas; respaldar antes si existieran.

## 9. Validaciones técnicas (ejecutadas realmente)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | ✅ exit 0, sin errores |
| `npm run lint` | ✅ exit 0 — 0 errores, 1 warning preexistente (`textiles-evidences-hardening.test.ts:40`, variable sin uso; no introducido por T9E) |
| `npm run build` | ✅ exit 0 (Next 16.2.10, webpack; tabla de rutas completa, `serverActions` experiment activo) |
| Suites | En T9E: 46 aprobadas / 0 fallidas (39 preexistentes + 7 nuevas; `tests/rls/isolation.test.ts` excluido por requerir BD viva). **T9E.1 añadió la suite de carga directa y una prueba RLS multi-tenant real: conteo final en el informe T9E.1 §20.** |
| `npm ci` | **No ejecutado en T9E** (se afirmaba innecesario). **Corrección T9E.1: la instalación limpia (`rm -rf node_modules && npm ci`) fue ejecutada realmente y pasó** — resultado exacto en el informe T9E.1 §16. |

Suites nuevas (con script npm y encadenadas en `test:all`):
`test:textiles-navigation` (12) · `test:textiles-module-selector` (11) · `test:textiles-custom-fibers` (13) · `test:textiles-forms-selects` (12) · `test:textiles-safe-deletion` (11) · `test:textiles-evidence-upload-limits` (13) · `test:textiles-t9e-security` (8) — **80 casos nuevos**. Los dos tests preexistentes que congelaban la lista de migraciones se extendieron a 0093 (mismo patrón usado en cada sprint anterior); ningún assert se relajó.

## 10. Prueba funcional manual (ejecutada de verdad, `npm run dev` + navegador)

Entorno: staging del proyecto (`.env.local`), `TEXTILES_MODULE_ENABLED=true`, migración 0093 aplicada. Usuario QA desechable (tipo `qa-user@example.invalid` / `[REDACTED]`, credencial generada al vuelo) con organización QA temporal habilitada en `organization_modules('textiles', enabled=true)`. **Corrección T9E.1:** las credenciales reales que esta sección exponía fueron purgadas; el usuario QA fue rotado a credencial aleatoria, baneado y eliminado (soft-delete con sesiones revocadas) y sus datos limpiados de staging — ver el informe T9E.1 §14.

| Flujo | Resultado observado |
|---|---|
| Login + aceptación legal | ✅ |
| Selector `/modules` | ✅ Tarjeta "Trazaloop Textiles · **Disponible para tu organización** · Entrar →" ACTIVA; CPR "Disponible"; Quality/Construcción "Próximamente" |
| Entrada a `/textiles` | ✅ Sidebar contextual Textil (Inicio activo resaltado, Gestión textil, Documentación textil, Sistema), badge del encabezado "TRAZALOOP TEXTILES", pestaña "Trazaloop Textiles" |
| CPR (`/dashboard`) | ✅ Identidad intacta: menú CPR, badge "NTC 6632 · UNE-EN 15343" |
| Crear proveedor con el PRIMER tipo visible | ✅ "Textiles del Norte QA · Proveedor de telas" creado SIN tocar el selector (antes: "Tipo de proveedor no válido.") |
| Crear material con el PRIMER tipo visible + fibra base + proveedor | ✅ "Tela Oxford QA · Tela principal · Algodón · Prov.: Textiles del Norte QA" |
| Fibras | ✅ Explicación "Catálogo base de Trazaloop" + 19 fibras con distintivo; fibra personalizada "Bambú (declarado)" creada (con la PRIMERA familia visible) y luego **eliminada sin uso** con diálogo y aviso "eliminado definitivamente" |
| Eliminar proveedor CON relaciones | ✅ Rechazado con motivo exacto: "No es posible eliminar el proveedor: está en uso por 1 material(es). Para conservar la trazabilidad histórica, desactívalo en su lugar." |
| Evidencia **3 MB** (PDF) | ✅ Subida completa (antes: "Body exceeded 1 MB limit"), registrada "Revisión pendiente" y visible en el listado. *Nota T9E.1: entonces viajaba por Server Action; hoy la carga es DIRECTA a Storage.* |
| Archivo 25 MB | ✅ Rechazo inmediato en cliente: "supera el tamaño máximo permitido (20 MB)." |
| Archivo `.txt` | ✅ Rechazo: "Tipo de archivo no permitido (PDF, imagen, Word, Excel o CSV)." |
| Producto + referencia | ✅ "Camiseta básica QA" + "REF-QA-001" creados |
| Circularidad con la PRIMERA referencia visible | ✅ "Evaluación creada como borrador" (antes: "La referencia seleccionada no es válida."); persistente tras recargar (`EC-QA-001 · REF-QA-001 · Borrador`) |
| Pasaportes técnicos | ✅ Renderiza con branding Textiles, sin normas CPR |

No cubierto manualmente (limitación del entorno, cubierto por suites/estático): rol no autorizado (el usuario QA es admin; la regla vive en actions+RLS y está bajo regresión), completar la evaluación de circularidad criterio a criterio, vista de impresión y enlace privado del pasaporte (sin cambios funcionales en T9E; suites previas en verde).

## 11. Datos QA en staging — LIMPIADOS en T9E.1

**Corrección T9E.1:** los datos QA que T9E había dejado en staging (1 proveedor, 1 material, 1 producto, 1 referencia, 1 evaluación borrador, 1 evidencia sintética y su objeto de Storage) fueron **eliminados por completo** (11 filas + 1 objeto; verificación con SELECT previa y posterior). El usuario Auth QA fue rotado a credencial aleatoria, baneado y eliminado con soft-delete (sesiones y refresh tokens revocados). La fila `organizations` de la organización QA quedó como cascarón vacío (0 miembros, 0 módulos, 0 datos) únicamente porque `audit_log` es append-only por diseño del proyecto (trigger `t_audit_log_immutable`, 0005/0024) — residuo documentado y sin riesgo. Detalle en el informe T9E.1.

## 12. Riesgos residuales

1. **`nav.tsx` ahora es cliente**: los enlaces del menú viajan al navegador (no son secretos; "Plataforma" sigue condicionada en servidor y las barreras reales son guards+RLS).
2. **Carga directa a Storage**: ~~pendiente~~ **implementada en T9E.1** (signed upload URL + intentos 0094 + verificación del objeto real + limpieza inmediata/oportunista/script administrativo).
3. **Warning de lint preexistente** en una suite antigua (variable sin uso) — fuera del alcance T9E, sin efecto.
4. **Fibras personalizadas y visibilidad**: por diseño solo las ve su organización; si dos organizaciones crean "Bambú", cada una ve la suya (la unicidad es por tenant + contra el catálogo base visible).
5. **Mobile**: el menú móvil nuevo es funcional pero minimalista (`<details>`); una iteración de UX podría animarlo/cerrarlo al navegar.

## 13. Despliegue, rollback y checklist

**Despliegue:** integrar el código (ver instrucciones de entrega §16.5 de la respuesta del sprint), aplicar `0093` en el entorno destino si aún no está (en el staging de `.env.local` YA está aplicada), `npm run build` y desplegar como siempre. No hay cambios de variables de entorno (el flag `TEXTILES_MODULE_ENABLED` ya existía).

**Rollback de aplicación:** revertir el commit T9E (los cambios son de app + una migración). **Rollback de BD:** script documentado en el encabezado de 0093.

**Checklist de aceptación:** todos los criterios del §18 del encargo quedan en ✅; el checklist funcional paso a paso se entrega en la respuesta del sprint (§16.7) para ejecutarse con un usuario QA propio (el de T9E fue eliminado en T9E.1).
