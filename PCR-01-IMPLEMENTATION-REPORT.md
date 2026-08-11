# PCR-01 — IMPLEMENTATION REPORT

Trazaloop v1.0.0 → Sprint PCR-01 (hardening funcional del módulo de plásticos).
Base: `release/v1.0.0-prep` · tag `v1.0.0` · commit `9471bb8` (ZIP sin `.git`; la
integración se hará en la rama local `feature/pcr-01-hardening` del cliente).

---

## 1. Resumen ejecutivo

Se implementaron los puntos 1, 2, 7, 9, 10, 11, 13, 14 y 16 del alcance, más el
cambio de denominación visible **CPR → PCR**. Todo el control es server-side;
no se creó ningún plan nuevo (Demo/Full/Extra intactos, Full≡Extra salvo
almacenamiento); no se tocó producción; la única migración nueva es la
**0103** (aditiva, idempotente donde aplica, con rollback documentado).

Validación en este entorno: `typecheck` ✅ · `lint` ✅ (1 advertencia
preexistente) · `next build --webpack` ✅ · `test:all` con **1421
verificaciones en verde**, incluidas las ~60 suites de Textiles/T9F/T9G sin
regresión y **5 suites PCR-01 nuevas** (56 verificaciones). Los únicos 3 fallos
de `test:all` leen `.env.example`, archivo **excluido del ZIP por las reglas de
exportación del cliente** (`.env.*`); en el repositorio local del cliente, donde
el archivo existe, esas comprobaciones pasan (ver PCR-01-TEST-MATRIX.md §I).

## 2. Punto 16 — BUG CRÍTICO Demo→Full (causa raíz y corrección)

**Causa raíz confirmada en código** (no era caché ni frontend): tras T9F.1 la
autoridad comercial pasó a `organization_modules.access_mode` (RPC
`set_organization_module_access`) y el formulario del plan legacy se retiró de
la consola; pero el subsistema de equipo siguió leyendo la copia obsoleta:

- Crear invitación: `createTeamInvitationAction` → `checkFeatureEnabled("roles_enabled")` /
  `checkResourceLimit("team_members")` → `v_organization_plan_usage` →
  **`organization_subscriptions.plan_code`**.
- Aceptar invitación: RPC `accept_team_invitation` (0056) leía
  **`organization_subscriptions.plan_code`** directo, con default `'demo'`.

Al subir módulos a Full/Extra, esa copia seguía en `'demo'` → bloqueo
persistente en BD que ningún refresh/logout podía resolver.

**Corrección (fuente de verdad, server-side):**

- **0103 §1**: `organization_effective_plan_code(org)` — plan efectivo ORG-WIDE
  = mejor `access_mode` vigente (`extra > full > demo`) entre módulos
  **funcionales y habilitados**; un Demo vencido no aporta; sin filas de módulo
  → fallback al plan legacy con piso `demo` (compatibilidad pre-T9F).
  Server-only (sin EXECUTE para clientes).
- **0103 §2**: RPC `get_organization_effective_plan(org)` con autorización
  (`is_org_member` o `is_platform_staff`) para la lectura desde el servidor.
- **0103 §3**: `CREATE OR REPLACE accept_team_invitation` — mismo cuerpo,
  misma firma y **mensajes idénticos** a 0056; solo cambia la fuente del plan
  comercial. El estado administrativo `suspended/cancelled` sigue leyéndose de
  `organization_subscriptions` (eje independiente, conservado).
- **Servidor**: `lib/db/plans.ts › getOrganizationEffectivePlanCode` (RPC,
  fail-closed → `demo`); `checkFeatureEnabled`/`checkResourceLimit` resuelven
  `plan_limits` con el plan efectivo. Estas dos funciones solo las consume
  `server/actions/team.ts` (alcance acotado y verificado).

**Casos cubiertos** (matriz §H): Demo bloquea con su mensaje; Demo→Full habilita
de inmediato invitar y aceptar; Full→Demo vuelve a restringir; el resultado no
depende de sesión/caché porque cada request consulta la BD. El dashboard y el
onboarding ya usaban el plan POR MÓDULO (T9F.1) y no requirieron cambios.

## 3. Punto 10 — Cantidad obligatoria del lote de entrada

- Formulario: campo `Cantidad (kg)` obligatorio (required + hint).
- Server action: validación pura compartida
  (`lib/domain/traceability-validation.ts`) con el **mensaje exacto**
  «La cantidad del lote es obligatoria y debe ser mayor que 0 kg.» — aplica a
  crear y a editar (editar un lote legacy exige completar la cantidad real).
- Importación CSV: `quantity_kg` pasó a **obligatoria**
  (`lib/imports/templates.ts` + `validators.ts`, mismo mensaje canónico).
- BD (**0103 §4**, semántica PCR-01.1): trigger
  `t_input_batches_require_quantity` en **INSERT y UPDATE** — INSERT exige
  cantidad válida; en UPDATE, si la cantidad **cambia**
  (`IS DISTINCT FROM`), el nuevo valor debe ser válido (un lote no puede
  degradarse a NULL/0/negativo tras crearse); si no cambia, el UPDATE pasa
  (un lote legacy con NULL sigue editándose sin inventar cantidades).
  Decisión deliberada: ni `NOT NULL` ni `CHECK` global — habrían invalidado
  la EDICIÓN de lotes históricos con `NULL` (p. ej. corregir notas) sin
  proteger mejor. Los datos legacy quedan intactos, visibles con el aviso
  «Lote histórico sin cantidad: edítalo y registra los kg reales recibidos» y
  corregibles cuando la empresa tenga el dato real — **jamás se inventan
  cantidades**. 0103 §5 documenta el SQL de auditoría (solo lectura) para
  dimensionar el volumen legacy antes del despliegue.

## 4. Puntos 1 y 11 — Evidencias: ver archivo y trazabilidad bidireccional

- **No se creó tabla nueva**: se reutiliza la m2m polimórfica existente
  `evidence_links` + las FKs directas de `materials` (origen/reclasificación).
- **Ver evidencia (punto 1)**: nueva capa `lib/db/evidences.ts` con
  `createEvidenceSignedUrl` — URL firmada **bajo demanda**, TTL 600 s, emitida
  con la **sesión real** (la política de Storage `evidences_select` de 0101 §12
  aplica) y con verificación explícita de pertenencia a la empresa activa.
  Server action `getEvidenceViewUrlAction` + componente `ViewEvidenceButton`
  (👁, abre pestaña nueva con apertura síncrona anti-bloqueo de popups; sin
  descarga forzada; la URL jamás se persiste en HTML). Disponible en:
  `/evidences`, evidencias vinculadas de cada registro y soportes por FK de
  materiales.
- **Registro → Evidencia**: `listEvidencesForTargets` (una consulta por página,
  nunca por fila) + `LinkedEvidenceList` bajo cada lote de entrada, orden, lote
  producido, proveedor, familia, producto y material (nombre · tipo · fecha ·
  estado · rol + Ver).
- **Evidencia → Registro**: en `/evidences`, «Utilizada en (n)» expandible
  (`?detail=`) con `listEvidenceUsage`: resuelve la etiqueta humana por tipo en
  lote, incluye los usos por FK de materiales con su rol, deduplica y enlaza al
  registro. Una evidencia puede usarse en 0..n registros.

## 5. Puntos 2, 7 y 14 — Flujo de creación/edición con confirmación

No existía sistema de toasts; el patrón del proyecto son alertas inline. Se
añadió `SuccessAlert` al mismo archivo/lenguaje visual (`components/ui/alert.tsx`)
— sin segundo design system — y el flujo pasó a ser:

- **Crear** (lotes, órdenes, lotes producidos, proveedores, familias, productos,
  materiales): la acción obtiene el id (`insert().select("id")`) y **redirige**
  a `?created=<id>#<ancla>` → banner de confirmación + **resaltado y ancla del
  registro creado** (sin buscarlo manualmente) + chip «Creado correctamente».
- **Editar (punto 7)**: redirect a `?updated=<id>#<ancla>` → cierra el modo
  edición, banner «Cambios guardados correctamente.» y resaltado de la fila
  (caso reportado de familias incluido).
- **Punto 14**: crear una orden redirige a
  `?order=<id>&created=1#consumos-<id>`: la sección **«Materiales / lotes
  consumidos»** se abre con los textos exactos pactados
  («Orden / corrida de producción creada correctamente.» + «Ahora registre los
  lotes y cantidades realmente consumidos en esta producción.») y el formulario
  de consumos confirma cada registro («Consumo registrado correctamente.»)
  permitiendo encadenar varios. El lote producido recibe el flujo análogo hacia
  su composición. Asociar evidencia confirma («Evidencia asociada
  correctamente.») conservando los warnings existentes.

## 6. Punto 13 — Variables de proceso sin JSON manual

- Se conserva el JSONB (`production_orders.process_variables`); cambia la
  captura y la lectura.
- **Editor humano** (`ProcessVariablesEditor`): filas Variable / Valor / Unidad
  con agregar/eliminar; serializa a un hidden que la server action **valida y
  serializa de nuevo en servidor** (cliente no confiable) al formato canónico
  `[{name, value, unit}]` (valores numéricos como number).
- **Compatibilidad sin pérdida** (`lib/domain/process-variables.ts`, puro):
  `{"temperatura_c": 210}` legacy → filas editables; estructuras no
  representables (anidadas, malformadas) se **conservan intactas** como
  «formato heredado» salvo que el usuario marque reemplazarlas. El detalle de
  la orden muestra un resumen legible («Temperatura: 185 °C · …») — nunca JSON
  crudo. Errores en español.

## 7. Punto 9 — Búsqueda y paginación reales

- Dominio puro `lib/domain/pagination.ts` (normalización, rangos, saneamiento
  del término para `or/ilike`, resumen «Mostrando X–Y de Z»; página 20/máx 100).
- Funciones de datos **aditivas** `search*` (ilike + `range()` + `count`)
  en catálogo, trazabilidad y evidencias — las `list*` originales quedan
  intactas para selects, genealogía, flujo guiado, dossier e importaciones.
- Componentes reutilizables server-friendly `ListSearchForm` (GET, conserva
  filtros) y `ListPagination` (enlaces Anterior/Siguiente).
- Aplicado a los 8 listados: evidencias, proveedores, familias, productos,
  materiales, lotes de entrada (conservando filtros proveedor/material),
  órdenes y lotes producidos. Con paginación, el registro en edición o
  expandido se resuelve **por id** (getters nuevos) aunque no esté en la página
  actual; estados vacíos distinguen «sin registros» de «sin resultados».

## 8. Renombrado CPR → PCR (solo denominación visible)

Cambiado en las 2 fuentes canónicas (`lib/modules/catalog.ts`,
`lib/modules/registry.ts`) y en todas las superficies visibles: landing, página
«Acerca de», onboarding, dashboard, alta de empresas, etiqueta de soporte,
mensaje del guard de acceso y mensaje de tope por archivo. **Intactos** (con
prueba que lo garantiza): `CPR_MODULE_CODE='traceability_6632'`, clave de UI
`cpr`, route group `(cpr)`, archivos/funciones `cpr-*`/`Cpr*`, `module_key`
de TrazaDocs, buckets, RLS, migraciones históricas y el badge normativo
«NTC 6632 · UNE-EN 15343».

**Excepción deliberada y documentada**: la transcripción del paquete legal
APROBADO v1.0.0 (`lib/domain/legal-package.ts`) y los seeds legales de 0066
mencionan «Trazaloop CPR». Son documentos legales **versionados y aceptados**:
renombrarlos retroactivamente rompería la correspondencia con el documento
aprobado (la suite de release verifica sus SHA-256). Recomendación: emitir una
versión legal nueva («Trazaloop PCR, antes CPR») por el mecanismo propio de
publicación legal en un release posterior. `modules.name` en BD
('Trazaloop 6632 / UNE-EN 15343') no contiene «CPR» ni se muestra al usuario:
sin migración de nombre.

## 9. Migraciones

Solo **0103_pcr01_effective_plan_and_input_batch_quantity.sql** (nueva,
aditiva): funciones §1/§2, reemplazo conservador de `accept_team_invitation`
(§3), trigger de cantidad (§4), auditoría documentada (§5) y verificaciones
(§6). Sin drops, sin truncates, sin cambios de RLS, sin escritura de datos de
negocio. Las 94 migraciones históricas no se tocaron (verificado por las
suites de integridad, cuyos candados avanzaron al baseline 0103).

## 10. Archivos nuevos y modificados

**Nuevos**: `supabase/migrations/0103_…sql`, `lib/domain/process-variables.ts`,
`lib/domain/traceability-validation.ts`, `lib/domain/pagination.ts`,
`lib/db/evidences.ts`, `components/ui/list-controls.tsx`,
`components/domain/evidences/view-link.tsx`,
`components/domain/traceability/process-variables-editor.tsx`,
`tests/unit/pcr01-{effective-plan,input-batch-quantity,process-variables,nomenclature,ux-flow}.test.ts`,
y los 5 documentos PCR-01.

**Modificados**: `lib/db/{plans,catalog,traceability}.ts` (aditivo),
`server/actions/{plans,team*,evidences,traceability,catalog}.ts` (*team solo
indirectamente vía plans), `components/ui/alert.tsx`,
`components/domain/traceability/{forms,action-button}.tsx`,
`components/domain/evidences/forms.tsx`, `lib/imports/{templates,validators}.ts`,
las 8 páginas de listado del módulo, las superficies del renombrado (§8),
`package.json` (scripts) y las suites existentes cuyas expectativas codificaban
el comportamiento anterior (nombre CPR y candados de migración congelados en
0102 → baseline 0103; detalladas en la matriz §I).

## 11. Riesgos, deuda técnica y recomendaciones

- **Selects de opciones** (proveedores/materiales/evidencias dentro de
  formularios) siguen cargando el conjunto completo: aceptable hoy, candidato a
  búsqueda asíncrona en PCR-02. Igual el selector de destino de «Asociar
  evidencia».
- **Desvincular evidencia** no existía y quedó fuera de alcance (solo se pidió
  ver/rastrear); candidato natural a PCR-02.
- **Estructura orden→lote** intacta por instrucción expresa (PCR-02).
- Recomendación comercial: nueva versión del paquete legal con la
  denominación PCR (ver §8).
- Recomendación operativa: ejecutar la auditoría legacy de 0103 §5 antes del
  release y acordar con las empresas la corrección de lotes históricos sin
  cantidad.


---

# PCR-01.1 — Correcciones de revisión independiente

Cuatro bloqueantes de aceptación, corregidos sobre el paquete PCR-01 sin
rehacer el sprint ni ampliar el alcance a PCR-02.

## Blocker 1 — El importador REAL aceptaba `quantity_kg` vacío

- **Problema**: `/traceability/input-batches` importa vía `ImportWizard` →
  `server/actions/import.ts` (motor legacy), no vía `lib/imports/*` (el motor
  que PCR-01 había endurecido). En el motor real, la cantidad vacía superaba
  la validación y llegaba al commit como `NULL`.
- **Causa**: existencia de dos motores de importación; PCR-01 endureció el
  que la página no consume.
- **Corrección**: en `server/actions/import.ts › validateRows` (input_batches)
  la cantidad vacía/0/negativa/no numérica se rechaza con el mensaje canónico
  `INPUT_BATCH_QUANTITY_REQUIRED_MESSAGE` importado de
  `lib/domain/traceability-validation.ts` (sin duplicar el texto). Como
  `validateRows` corre en `validateImportAction` **y** en la revalidación
  previa al commit de `commitImportAction`, ambos pasos quedan cubiertos; el
  payload del commit ya no mapea vacío→NULL (`Number(row.quantity_kg)`); el
  trigger 0103 sigue siendo la barrera final en BD. La ayuda del
  `ImportWizard` declara la regla. El segundo motor NO se eliminó (fuera de
  alcance); `lib/imports/*` conserva el endurecimiento de PCR-01.
- **Archivos**: `server/actions/import.ts`,
  `components/domain/import/import-wizard.tsx`.
- **Prueba**: `pcr01-input-batch-quantity` §12 — verifica el FLUJO real
  (página→ImportWizard→server/actions/import.ts), el rechazo de vacío/0/
  negativo/no numérico, la ausencia de la validación condicional anterior, la
  revalidación compartida pre-commit y la ayuda del wizard. Falla si alguien
  vuelve a permitir cantidad vacía en el importador real.

## Blocker 2 — La cantidad podía degradarse por UPDATE

- **Problema**: el trigger de 0103 era solo BEFORE INSERT; un UPDATE
  autorizado podía poner `quantity_kg = NULL` en un lote válido (el CHECK
  histórico admite NULL).
- **Corrección** (0103 corregida directamente — **aún no aplicada a
  producción**, no procede una 0104): trigger BEFORE **INSERT OR UPDATE**.
  INSERT: `NOT NULL AND > 0`. UPDATE: si
  `NEW.quantity_kg IS DISTINCT FROM OLD.quantity_kg`, el nuevo valor debe ser
  `NOT NULL AND > 0`. Casos: 100→NULL/0/−5 RECHAZA · 100→80 PERMITE ·
  NULL legacy→80 PERMITE · NULL legacy→NULL editando otro campo PERMITE (no
  se obliga a inventar cantidades). Mensaje canónico intacto.
- **Archivos**: `supabase/migrations/0103_…sql` (§4, cabecera, §6).
- **Prueba**: `pcr01-input-batch-quantity` §10 (candados estáticos de los 5
  escenarios). La ejecución real contra PostgreSQL sigue **BLOCKED** (matriz
  §D6–D8).

## Blocker 3 — Crear/editar + paginación podía perder el registro

- **Problema**: con listados ordenados (p. ej. alfabético), el registro
  recién creado («Zeta Reciclados» entre 200 proveedores) podía quedar fuera
  de la página 1 destino del redirect: confirmación sin registro, sin ancla y
  sin resaltado.
- **Corrección** (server-side, consistente en las 7 páginas): cuando existe
  `created`, `updated` o `focus`, el registro se resuelve **por id** (getters
  existentes) y se **fija al inicio** de la lista solo si no pertenece ya a la
  página actual (sin duplicar, sin cargar el listado completo, sin quitar la
  paginación). El resaltado usa el id enfocado; el chip
  «Creado/Guardado correctamente» solo aparece con `created`/`updated`.
  En órdenes y lotes producidos el fijado convive con los mecanismos
  `?order=`/`?batch=` (el expandido tiene prioridad).
- **Archivos**: las 7 páginas de listado (4 de catálogo + 3 de trazabilidad).
- **Prueba**: `pcr01-ux-flow` §10. El scroll/ancla visual sigue **BLOCKED —
  requiere navegador**.

## Blocker 4 — «Ir al registro» llevaba al listado genérico

- **Problema**: `targetHref` (lib/db/evidences.ts) enviaba supplier, material,
  product, product_family e input_batch al listado sin id: con paginación el
  registro podía no estar visible pese al texto «Ir al registro».
- **Corrección**: todos los tipos con id navegan al registro concreto usando
  el mecanismo del blocker 3: `?focus=<id>#registro-<id>` (catálogo),
  `?focus=<id>#lote-<id>` (lotes de entrada) y los mecanismos específicos
  `?order=<id>#orden-<id>` / `?batch=<id>#lote-<id>` que abren el registro
  expandido.
- **Archivos**: `lib/db/evidences.ts`.
- **Prueba**: `pcr01-ux-flow` §11 — además impide la regresión a enlaces
  genéricos cuando el destino tiene id. El recorrido visual sigue
  **BLOCKED — requiere navegador/BD**.

## Además

- **Matriz** reescrita con estados diferenciados
  (`PASS — lógica pura ejecutada` / `PASS — verificación estática` /
  `BLOCKED — requiere BD` / `BLOCKED — requiere navegador`), corrigiendo en
  particular D4, B1–B3, E2 y E4.
- **Rollback** actualizado con la política contra el drift del historial de
  migraciones (ver PCR-01-ROLLBACK.md §«PCR-01.1»).
- **Paquete** regenerado sin artefactos (`tsconfig.tsbuildinfo`, `run`,
  `test:textiles-rls-t9e2`) ni secretos.
- **Estado real tras PCR-01.1**: `typecheck` ✅ · `lint` ✅ (advertencia
  preexistente) · `build --webpack` ✅ · `test:all` en verde salvo las 3
  comprobaciones que leen `.env.example` (excluido del ZIP de origen por la
  regla `.env.*` del cliente; pasan en su repositorio local). Suites PCR-01:
  59 verificaciones en verde.
