# Trazaloop Textil · Sprint T8 — TrazaDocs Textil (Reporte de implementación)

> Julio 2026. TrazaDocs Textil quedó habilitado como módulo documental separado
> sobre el motor TrazaDocs existente, con `module_key` como frontera. CPR no
> cambió funcionalmente. Los documentos y sus referencias técnicas son
> **herramientas de preparación documental**: la plataforma no certifica, no
> garantiza cumplimiento, no reemplaza una auditoría ni emite sellos.

## 1. Qué se implementó

Una empresa de confección con el módulo Textil habilitado puede, desde
`/textiles/trazadocs`: ver 12 estructuras documentales base agrupadas en 8
categorías, crear su documento de empresa desde cada estructura, editar
secciones con tips, guardar borradores, enviar a revisión, aprobar
**internamente** (administración/calidad), crear nuevas versiones desde
aprobado, marcar obsoleto, ver historial de versiones e imprimir con el logo de
la empresa (impresión del navegador, mismo patrón CPR — sin PDF server-side).
Todo reutiliza el motor TrazaDocs (tablas 0043, transiciones/versionado
atómicos de la RPC `change_trazadoc_document_status` de 0046/0047, roles del
dominio y límite de plan `documents_trazadocs`).

## 2. Archivos

**Creados**
- `supabase/migrations/0082_textile_trazadocs.sql`
- `lib/domain/textiles-trazadocs.ts` (categorías, aviso, vínculos por código)
- `lib/db/textiles-trazadocs.ts` (envolturas con módulo fijado en servidor)
- `server/actions/textiles-trazadocs.ts` (crear / editar secciones / enviar a
  revisión / aprobar internamente / obsoleto / nueva versión)
- `components/domain/textiles/trazadoc-editor.tsx`,
  `components/domain/textiles/create-trazadoc-button.tsx`
- `app/(app)/(shell)/textiles/trazadocs/page.tsx`,
  `…/trazadocs/[documentId]/page.tsx`,
  `app/(app)/(print)/textiles/trazadocs/[documentId]/print/page.tsx`
- `tests/trazadocs/textiles-trazadocs.test.ts` (20 checks / 30 puntos §20)

**Modificados (refactor mínimo probado)**
- `lib/db/trazadocs.ts`: tipo `TrazadocModuleKey` y parámetro `moduleKey` con
  **default `'cpr'`** en `listDocuments`, `getDocument`,
  `listAvailableBlueprints`, `getBlueprintByIdForCompany` y
  `findDocumentByNormalizedTitle` — las actions CPR no cambiaron ni una línea y
  conservan su comportamiento; la suite CPR `tests/unit/trazadocs.test.ts`
  sigue en verde.
- `lib/db/trazadocs-master.ts`: el maestro documental filtra `module_key='cpr'`
  (los documentos textiles no se mezclan; la columna deja listo un futuro
  maestro Textil sin forzarlo en T8).
- `app/(app)/(shell)/textiles/page.tsx` (7ª card "TrazaDocs Textil ·
  Disponible"), `lib/modules/textiles.ts` (planificadas → solo "Pasaporte
  técnico textil"), hubs de evidencias/trazabilidad/circularidad (link de una
  línea al procedimiento documental relacionado).
- Pins de suites: `tests/unit/textiles-module.test.ts` (0070–0082, shell con
  `trazadocs`, 1 planificada) y `tests/circularity/textiles-circularity-hardening.test.ts`
  (check 1 fija solo su slot 0081 — misma corrección de deriva T2.1→T7.1).

## 3. Migración `0082_textile_trazadocs.sql` (471 líneas)

1. **`module_key` aditivo** (`text not null default 'cpr'`, check
   `('cpr','textiles')`) en `trazadoc_blueprints` y `trazadoc_documents` +
   índice `(organization_id, module_key)`. Backfill automático por default: lo
   existente es CPR.
2. **Trigger `t_trazadoc_documents_module_key`** (verdad en servidor): al
   crear, el documento **hereda** el `module_key` de su estructura — cualquier
   valor del cliente se ignora; al actualizar, el módulo es **inmutable** ("El
   módulo de un documento TrazaDocs no puede cambiarse.").
3. **Vistas ampliadas** (`create or replace` con la columna nueva AL FINAL,
   `security_invoker` conservado): `v_trazadoc_document_summary`,
   `v_trazadoc_blueprint_summary` y `v_trazadoc_document_master` (esta última
   además enruta documentos textiles a `/textiles/trazadocs/[id]` y marca los
   descargables como `'cpr'`).
4. **Seed idempotente** (`on conflict do nothing`, ids fijos
   `d0000000-0000-4000-8000-0000000000NN`): 12 estructuras
   `module_key='textiles'` con **140 secciones**, todas con tip.
5. Sin tablas nuevas, sin `create/alter/drop policy` (RLS deny-by-default de
   0043 intacta), sin drops, sin updates/deletes de filas: CPR no se toca.

## 4. Estructuras documentales (12) y categorías (8)

| Código | Documento | Categoría | Secciones |
|---|---|---|---|
| TXT-MAN-001 | Manual técnico de trazabilidad y circularidad textil | Sistema documental textil | 10 |
| TXT-PRO-002 | Identificación de productos, referencias y composición | Productos, composición y materiales | 11 |
| TXT-PRO-003 | Control de proveedores y procesos tercerizados | Proveedores y evidencias | 11 |
| TXT-PRO-004 | Gestión de evidencias textiles | Proveedores y evidencias | 13 |
| TXT-PRO-005 | Trazabilidad de órdenes, lotes y consumos | Trazabilidad operativa | 13 |
| TXT-PRO-006 | Declaraciones ambientales y claims | Declaraciones ambientales | 13 |
| TXT-PRO-007 | Evaluación de circularidad textil | Circularidad, diseño y fin de vida | 12 |
| TXT-PRO-008 | Diseño para durabilidad, reparación, separabilidad y fin de vida | Circularidad, diseño y fin de vida | 11 |
| TXT-PRO-009 | Producto textil no conforme | No conformidades y capacitación | 13 |
| TXT-PRO-010 | Capacitación del personal | No conformidades y capacitación | 10 |
| TXT-PRO-011 | Control documental textil | Sistema documental textil | 13 |
| TXT-MAT-012 | Matriz de preparación documental textil | Matriz de preparación documental | 10 |

Cada estructura trae: propósito y **referencias técnicas** en su descripción,
secciones editables con **tips** cortos y prácticos (los hints del motor,
gestionables por el superadministrador como cualquier blueprint), estado
documental, versión e historial (motor). Textos obligatorios embebidos:

- TXT-PRO-004: "La aceptación interna de una evidencia no equivale a
  certificación externa ni validación por una autoridad."
- TXT-PRO-006: "Toda declaración ambiental debe estar soportada por evidencia
  suficiente y revisada internamente antes de ser usada en comunicaciones
  externas."
- TXT-PRO-007: "La evaluación de circularidad es una herramienta técnica
  interna. No equivale a certificación, cumplimiento regulatorio ni pasaporte
  oficial."
- TXT-MAT-012: estados **documentado / parcialmente documentado / pendiente /
  no aplica / requiere revisión** — nunca un dictamen de cumplimiento.

## 5. Referencias técnicas usadas (siempre como preparación)

ISO 22095 (cadena de custodia); ISO 2076 (nombres de fibras); ISO 3758
(símbolos de cuidado); ISO 5157 (vocabulario ambiental textil); ISO 14021
(declaraciones ambientales autodeclaradas); ISO 59004 / 59010 / 59020
(economía circular); UNE-EN 15343 (referencia metodológica de trazabilidad de
reciclado); GS1 EPCIS / GS1 Digital Link (interoperabilidad futura); GRS/RCS,
OCS/GOTS y OEKO-TEX MADE IN GREEN (esquemas de referencia cuando aplique);
ESPR (UE) 2024/1781 (marco europeo de ecodiseño y futuro pasaporte digital de
producto); Estrategia de la UE para textiles sostenibles y circulares. Todas
aparecen como "referencias de preparación documental", jamás como promesa.

## 6. Separación CPR / Textil

- `module_key` filtra TODO lo documental: la capa de datos compartida recibe
  el módulo con default `'cpr'` (CPR intacto sin tocar sus actions) y las
  envolturas textiles fijan `'textiles'` **en servidor** (`const MODULE`);
  ningún `module_key` llega del cliente (verificado por test 14).
- El trigger de 0082 hace imposible crear un documento textil sin estructura
  textil (herencia) o cruzarlo de módulo (inmutabilidad).
- Toda mutación textil verifica primero (`getTextileTrazadocDetail`, que exige
  `module_key='textiles'` + `organization_id`) — un documento CPR jamás puede
  leerse ni transicionarse desde rutas textiles, y `/textiles/trazadocs` no
  lista documentos ni tips CPR (y viceversa, por el default `'cpr'`).
- Maestro documental: sigue siendo CPR (filtro en `listDocumentMaster`); los
  documentos textiles viven en su propio listado.
- Multi-tenant: RLS de 0043 intacta (documentos por `organization_id`,
  `is_org_member`/`has_org_role`); FKs compuestas del motor sin cambios.

## 7. Roles, estados y versionamiento (motor reutilizado)

- **consultant**: crea, edita borradores/en revisión y envía a revisión; no
  aprueba (dominio + RLS 0043 + RPC 0047 lo re-exigen).
- **admin / quality**: editan, aprueban internamente, crean nueva versión desde
  aprobado, marcan obsoleto.
- **superadmin de plataforma**: gestiona estructuras y tips desde la consola
  existente `platform/trazadocs` (los blueprints textiles aparecen allí como
  cualquier otro; ver limitaciones).
- Sin membresía / anónimo: sin acceso (guarda + RLS).
- Estados `draft → in_review → approved → obsolete` y versionado idénticos a
  CPR: v1 real al crear, versión aprobada no editable, nueva versión en
  borrador desde aprobado, histórico protegido. "Aprobado internamente" no
  significa aprobado por una entidad externa (texto visible en editor e
  impresión).

## 8. Activación y habilitación

1. `TEXTILES_MODULE_ENABLED=true` en el entorno.
2. Habilitar la organización (tabla real `organization_modules.module_code`):
   ```sql
   insert into organization_modules (organization_id, module_code, enabled)
   values ('<org>', 'textiles', true)
   on conflict (organization_id, module_code) do update set enabled = true;
   ```
3. Aplicar `0082_textile_trazadocs.sql` y entrar a `/textiles/trazadocs`.

## 9. Validación manual (encargo §21)

1. **Acceso**: con flag + habilitación, `/textiles/trazadocs` muestra las 12
   estructuras por categoría. Sin habilitación → fuera del módulo.
2. **Separación**: `/trazadocs` (CPR) no lista documentos ni estructuras TXT;
   `/textiles/trazadocs` no lista nada CPR.
3. **Crear**: "Crear documento" desde una estructura → redirige al detalle con
   secciones y tips; guardar borrador funciona; el duplicado por estructura o
   título ofrece abrir el existente.
4. **Versionamiento**: aprobar → editar directo bloqueado (RLS/estado); "Nueva
   versión (borrador)" habilita edición; historial crece.
5. **Roles**: consultant crea/edita/envía; su aprobación falla (dominio + RPC);
   admin/quality aprueban.
6. **Cross-tenant**: documento de otra organización → `notFound` (RLS +
   `organization_id` en cada consulta).
7. **Textos prudentes**: avisos visibles en listado, detalle, editor e
   impresión; los documentos de evidencias/claims/circularidad incluyen sus
   textos obligatorios.

## 10. Resultados de pruebas

- `npx tsc --noEmit` ✅ · `npm run lint` ✅ (solo el warning preexistente de
  T5.2 en la suite de hardening de evidencias) · `npm run build` ✅ (rutas ƒ
  `/textiles/trazadocs`, `/textiles/trazadocs/[documentId]` y `…/print`).
- Nueva: `test:textiles-trazadocs` → **20/20** (cubre los 30 puntos §20).
- Textiles: módulo ✅ · catálogos ✅ · scoring ✅ · hardening diagnóstico ✅ ·
  productos 21/21 · evidencias 21/21 · hardening evidencias 13/13 ·
  inmutabilidad archivo 11/11 · trazabilidad 22/22 · hardening trazabilidad
  14/14 · circularidad 32/32 · hardening circularidad 12/12.
- Plataforma: `test:platform` ✅ · `test:plans` ✅ · `test:launch` ✅ ·
  `test:compliance` ✅ (420 archivos, incluye 0082 y este reporte) · CPR
  TrazaDocs `tests/unit/trazadocs.test.ts` ✅ · maestro
  `tests/unit/document-master.test.ts` ✅.
- `test:smoke` / `test:rls` requieren `.env.local` con Supabase real
  (limitación ambiental conocida, no de código).
- Nota: el encargo §20 lista la suite T7.1 como
  `textiles-circularity-insert-hardening.test.ts`; el archivo real es
  `tests/circularity/textiles-circularity-hardening.test.ts` (mismo alcance).

## 11. Riesgos y limitaciones conocidas

- **Consola de plataforma sin etiqueta de módulo**: los blueprints textiles
  aparecen en `platform/trazadocs` mezclados con los CPR (gestionables, pero
  sin filtro visual). Selector de módulo → sprint futuro.
- **Onboarding CPR (`has_trazadoc`)**: las vistas 0067/0069 marcan
  `has_trazadoc` si existe CUALQUIER documento vivo — un documento textil lo
  activa. Impacto mínimo (solo organizaciones con ambos módulos); filtrarlo
  requeriría re-emitir la vista de onboarding y se difiere.
- **Título único global (0048)**: el índice único de títulos es por
  organización SIN módulo — una empresa no puede tener un documento CPR y uno
  textil con título idéntico. Los 12 títulos TXT no colisionan con los CPR
  sembrados; se documenta como restricción aceptada.
- **Maestro documental**: sigue CPR; la columna `module_key` de la vista deja
  listo un maestro Textil sin implementarlo en T8.
- Documentos textiles "custom" (sin estructura) no se ofrecen en la UI T8:
  solo creación desde estructura base (decisión de alcance).

## 12. Qué quedó fuera (confirmaciones)

Sin pasaporte técnico textil (T9), sin QR, sin blockchain, sin IA, sin
ACV/huella de carbono, sin emisión de sellos ni certificación, sin exportador
normativo, sin firma electrónica avanzada, sin workflows legales/aprobación
externa, sin imports CSV, sin planes por módulo
(`organization_module_access`/`organization_module_subscriptions` no existen),
sin consola modular avanzada. **CPR no fue modificado funcionalmente**: sus
actions no cambiaron; la capa de datos solo ganó parámetros con default que
preservan el comportamiento (regresión CPR en verde) y el módulo Textil sigue
privado tras flag + `organization_modules.module_code`.


## 13. Hardening posterior (T8.1)

Ver `TEXTILES_T8_1_TRAZADOCS_SECTION_HARDENING_REPORT.md` (migración 0083):
la edición de secciones quedó blindada contra edición cruzada entre
documentos, organizaciones y módulos. El helper inseguro
`updateSectionContent(orgId, sectionId, content)` fue reemplazado por
`updateSectionContentForDocument({...})`, que exige a la vez organización,
documento del módulo esperado, estado editable y pertenencia de la sección
al documento; un trigger BEFORE INSERT OR UPDATE añade padre editable e
inmutabilidad de `document_id`/`section_key` a nivel BD.
