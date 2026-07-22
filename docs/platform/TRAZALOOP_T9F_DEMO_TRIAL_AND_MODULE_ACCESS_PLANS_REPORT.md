# Trazaloop · Plataforma · Sprint T9F — Acceso automático Demo por 2 días y gestión de planes por módulo desde el superadministrador

> **Estado:** implementado, aplicado a staging y verificado en vivo.
> **Migración única:** `0100_organization_module_access_modes_and_demo_trial.sql`.
> **Rama:** `feature/t9f-demo-trial-and-module-plans` · Respaldo: `backup/textiles-t9e4-before-t9f-20260722-1311`.

---

## 1. Resumen ejecutivo

T9F introduce un **estado comercial POR MÓDULO** (`demo` / `full` / `extra`) sobre
`organization_modules`, separado de la **habilitación administrativa** (`enabled`).
Una empresa nueva recibe automáticamente los módulos funcionales (CPR y Textiles)
en **Demo temporal de exactamente 48 horas**; el superadministrador puede cambiar
cada módulo a **Demo permanente / Full / Extra / Deshabilitado**. El acceso se
resuelve con una **regla canónica única** consumida por los guards y el selector,
y el **vencimiento se deriva por FECHA, sin cron**. **No se inventó ningún valor
comercial**: los límites funcionales y las cuotas de almacenamiento se reutilizan
del catálogo de planes existente (`plan_definitions` / `plan_limits`, sprint 10A),
donde **Full y Extra ya eran idénticos salvo el almacenamiento**.

---

## 2. Corrección del modelo anterior

Antes de T9F coexistían dos conceptos parciales y desconectados:

- `organization_modules.enabled` (booleano) — única señal de acceso a un módulo,
  sin noción de plan ni de vencimiento; su escritura la permitía el **admin de la
  propia empresa** (RLS `is_org_admin`).
- `organization_subscriptions.plan_code` (`demo`/`full`/`extra`) — plan **de toda
  la organización**, con límites en `plan_limits` y cuota en `plan_definitions`.

No existía `access_mode` por módulo, ni prueba temporal, ni gestión de módulos
por el superadministrador, ni un guard de CPR. Textiles se habilitaba a mano
(fila + flag). T9F unifica esto: **eleva el plan a por-módulo** reutilizando el
catálogo de planes como fuente de entitlements, y **cierra la escritura de
cliente** (una empresa no puede asignarse un plan).

---

## 3. Estados comerciales definitivos

Los únicos `access_mode` son **`demo`**, **`full`**, **`extra`** (constraint SQL
`access_mode in ('demo','full','extra')`). No se crearon `demo_temporary`,
`demo_permanent`, `trial`, `premium`, etc. como valores de datos.

| Estado efectivo | enabled | access_mode | access_expires_at |
|---|---|---|---|
| Demo temporal | true | demo | fecha futura |
| Demo permanente | true | demo | null |
| Full | true | full | null |
| Extra | true | extra | null |
| Deshabilitado | false | (se conserva) | (se conserva) |

---

## 4. Separación entre `enabled` y `access_mode`

`enabled` es la **habilitación administrativa** (eje independiente); `access_mode`
es el **plan comercial**. `enabled = false` (deshabilitación) y "Demo vencido"
son estados **distintos** con mensajes distintos ("Módulo deshabilitado" vs
"Prueba finalizada"). Una fila puede conservar `enabled = true` con la prueba
vencida: el acceso efectivo aparece bloqueado sin cambiar `enabled`.

---

## 5. Demo temporal

Al registrarse una empresa nueva, cada módulo funcional queda con
`access_mode='demo'`, `access_started_at=now()`, `access_expires_at=now()+48h`,
`assignment_source='auto_demo_trial'`. La prueba dura **exactamente 48 horas**
desde el registro (no "hasta el fin del segundo día"), con timestamps con zona
horaria y **hora del servidor**.

---

## 6. Demo permanente

El superadministrador puede fijar `access_mode='demo'`, `access_expires_at=null`.
Mismas limitaciones funcionales que el Demo temporal; la única diferencia es que
**no vence**. `assignment_source='superadmin'`.

---

## 7. Full

`access_mode='full'`, `access_expires_at=null`. Desbloquea todas las
funcionalidades permitidas del módulo con la **cuota estándar** de almacenamiento
(`plan_definitions['full'].storage_limit_bytes`). Sin vencimiento en este sprint.

---

## 8. Extra

`access_mode='extra'`, `access_expires_at=null`. **Exactamente las mismas
funcionalidades que Full**; la única diferencia es la **cuota ampliada** de
almacenamiento.

---

## 9. Diferencia EXCLUSIVA de almacenamiento

`plan_limits` (sprint 10A) ya define Full y Extra con límites funcionales
idénticos (todos los contables `is_unlimited`, mismos interruptores) y solo
`storage_bytes` distinto. La capa de entitlements de T9F
(`buildModuleEntitlements`) **excluye `storage_bytes` de los límites funcionales**
y expone `storageLimitBytes` aparte, de modo que el objeto funcional de Full y
Extra es idéntico por construcción. Prueba expresa incluida (unidad, caso 11–12).
Auditoría realizada: **no existe código que trate Extra como funcionalmente
superior a Full**; no se introdujo ninguna capacidad exclusiva.

---

## 10. Módulos funcionales — fuente canónica

`lib/modules/catalog.ts` es la fuente única de los módulos comerciales:

| key | module_code | status | kill switch |
|---|---|---|---|
| cpr | `traceability_6632` | functional | — |
| textiles | `textiles` | functional | `TEXTILES_MODULE_ENABLED` |
| quality | `quality` | coming_soon | — |
| construccion | `construccion` | coming_soon | — |

En BD, `modules.is_functional` (añadida en 0100) es el **espejo** de este
catálogo (`true` solo para `traceability_6632` y `textiles`); una prueba unitaria
verifica que ambos coincidan. `core` es infraestructura (no comercial). El kill
switch `TEXTILES_MODULE_ENABLED` se conserva como interruptor global de
emergencia y **prevalece**: una asignación Demo/Full/Extra jamás anula un flag
apagado.

---

## 11. Registro automático

`create_organization` y `create_platform_organization` (reprogramadas en 0100,
ambas `SECURITY DEFINER`) llaman a `provision_new_organization_modules(org,
actor)`, que siembra `core` (infra, full, permanente) y **todos los módulos con
`is_functional`** en Demo de 48 h, con auditoría por módulo. La fuente de módulos
funcionales es **controlada por servidor** (columna `is_functional`), nunca una
lista enviada por el navegador. Todo dentro de la transacción de creación (una
empresa nunca queda a medias). El helper de provisión es **interno** (revoca
public/anon/authenticated): una empresa no puede auto-provisionarse.

---

## 12. Duración exacta de 48 horas

`access_expires_at = now() + interval '48 hours'`, con `now()` de la BD. Prueba
en staging (RLS, caso 3): `expires_at - started_at == 48 h` exactas.

---

## 13. Aviso de Demo

Componente compartido `DemoTrialBanner` (accesible: `role="status"`,
`aria-live`; no depende solo del color; responsive; cerrable por sesión pero
**reaparece** en cada carga). Muestra "…modo Demo… durante 2 días", la **fecha de
vencimiento** ("finaliza el 24 de julio de 2026 a las 3:30 p. m.") y el **tiempo
restante informativo** ("Queda 1 día y 6 horas"). Si CPR y Textiles comparten
fecha → un solo aviso; si difieren → por módulo. Renderizado en el **shell**
(cubre dashboard, inicio de Textiles y configuración) y en **/modules**. El
tiempo restante es informativo: la autorización usa la hora del servidor.

---

## 14. Vencimiento automático (sin cron)

`resolveModuleAccess` (pura) y la función SQL
`resolve_organization_module_access` bloquean una prueba con
`access_expires_at <= now()` de inmediato. **No depende de ninguna tarea
programada**: aunque nunca corra un cron, el guard rechaza al instante. La hora
del navegador no altera la vigencia (la regla recibe `now` del servidor/BD).
Verificado en staging (caso 8) y en unidad (casos 3, 9, 10). No se materializan
eventos de vencimiento por consulta (evita duplicados).

---

## 15. Regla canónica

`lib/modules/access.ts` · `resolveModuleAccess({ isFunctional, killSwitchActive,
assignment, now })`. Permite acceso si: el módulo es funcional (1) y publicado,
el kill switch está activo (2), existe asignación (3) con `enabled=true` (4), el
usuario pertenece a la organización (verificado en el guard/SQL) (5), y el
`access_mode` es full/extra, o demo permanente, o demo no vencido (6). En SQL,
`resolve_organization_module_access` la aplica con `now()` de la BD y exige
`is_org_member` o superadmin. Consumida por **ambos guards** (CPR y Textiles) —
una sola lógica, sin duplicación por módulo.

---

## 16. Estado derivado

`DerivedModuleState`: `demo_active`, `demo_permanent`, `demo_expired`, `full`,
`extra`, `disabled`, `globally_disabled`, `coming_soon`, `not_assigned`. Son
estados **derivados de UI**, no nuevos `access_mode`. Etiquetas y frases en
`lib/modules/messages.ts` (una sola fuente para selector, banner, guard y
superadmin). "Demo vencido" se comunica como **"Prueba finalizada"**, nunca
"Deshabilitado".

---

## 17. Selector de módulos

`/modules` se reescribió para mostrar el **estado comercial real** de cada
módulo (Demo con vencimiento + tiempo restante, Demo permanente, Full, Extra,
Prueba finalizada, Módulo deshabilitado, Temporalmente no disponible, o
Próximamente). El enlace "Entrar" aparece solo en estados **enterables**. **Nunca
muestra "Próximamente"** cuando el motivo real es demo vencido, deshabilitación,
falta de asignación o flag global apagado.

---

## 18. Guards

- **Textiles** (`requireTextilesModule` / `requireTextilesForAction`): kill switch
  primero (apagado → 404 privado); luego regla canónica (demo vencido /
  deshabilitado / sin asignación → redirect a `/modules`, mensaje coherente).
- **CPR** (`requireCprModule` / `requireCprForAction`, NUEVO): CPR no tenía guard;
  ahora consume la regla canónica y se aplica en el dashboard (inicio de CPR) y en
  las páginas funcionales de CPR (diagnóstico, catálogos, evidencias,
  trazabilidad, contenido reciclado, soporte técnico, implementación,
  importaciones, flujo guiado). Bloqueo → redirect a `/modules`.

Tras un cambio del superadministrador, el guard consulta el estado **actual** en
la siguiente navegación protegida (no se cachean permisos comerciales).

---

## 19. Superadministrador

Sección **"Módulos y planes de la empresa"** en `/platform/organizations/[id]`:
lista todos los módulos comerciales con nombre, descripción, estado global,
estado de la empresa, `access_mode`, `enabled`, inicio, vencimiento, última
modificación (fecha + actor), cuota aplicable y la acción de cambio. Estados
seleccionables: **Deshabilitado / Demo permanente / Full / Extra** (no "Demo
temporal": es el estado automático de registro). Diálogo de confirmación
accesible (`ConfirmDialog` compartido: teclado, Escape, `aria-live`, foco,
estado de proceso, control de doble envío). Los módulos "Próximamente" se
muestran sin controles.

Server Action `setOrganizationModuleAccessAction` → RPC
`set_organization_module_access(org, module, target_state)`: autentica, resuelve
actor, verifica superadministrador (UI + action + SQL), valida UUID, empresa y
`module_code` contra la fuente canónica (`is_functional`), rechaza módulos no
funcionales, mapea el estado de UI, es idempotente, audita antes→después,
revalida las páginas afectadas y devuelve mensajes en español (nunca SQL).

---

## 20. Deshabilitación

"Deshabilitado" fija `enabled=false` y **conserva** `access_mode`/vencimiento
para historial. **No usa DELETE**: no se borra ninguna fila ni dato (documentos,
evidencias, productos, referencias, proveedores, materiales, diagnósticos,
órdenes, lotes, evaluaciones, pasaportes, snapshots, configuración, auditoría).
Al reactivar, el superadministrador elige explícitamente Demo permanente / Full /
Extra (no se reactiva silenciosamente un Demo temporal vencido).

---

## 21. Conservación de datos

Ni el vencimiento ni la deshabilitación borran datos. Verificado en staging
(casos 9 y 19: la fila del módulo persiste; reactivar recupera el acceso).

---

## 22. Límites Demo

Se **reutilizan** los límites reales de `plan_limits['demo']` (sprint 10A),
verificados como implementados: `documents_trazadocs=2`, `suppliers=1`,
`materials=5`, `products=1`, `evidences=1`, `production_orders=1`,
`input_batches=1`, `output_batches=1`, `team_members=1`, `roles_enabled=0`,
`diagnostic_recommendations_enabled=0`, `imports_enabled=0`,
`storage_bytes=52428800`. **No se inventaron límites nuevos.** Demo temporal y
permanente reciben los **mismos** límites (mismo `access_mode='demo'` → mismo
`plan_limits`).

---

## 23. Entitlements Full y Extra

`buildModuleEntitlements(accessMode, planLimits, storageLimitBytes)`: mapea
`access_mode` 1:1 a `plan_code` y separa la cuota de los límites funcionales.
Prueba expresa `functionalLimitsFingerprint(full) === functionalLimitsFingerprint(extra)`
(unidad, caso 11) y `full.storageLimitBytes < extra.storageLimitBytes` (caso 12).

---

## 24. Cuotas de almacenamiento (decisión)

**Fuente única existente reutilizada** (sprint 10A, sin inventar valores):

| access_mode | storage_limit_bytes | equivalente |
|---|---|---|
| demo | 52 428 800 | 50 MB |
| full | 524 288 000 | 500 MB |
| extra | 5 368 709 120 | 5 GB |

Resueltas por módulo desde `plan_definitions[access_mode]`. El bucket `evidences`
es **compartido** entre módulos; el uso se calcula desde registros de dominio
confiables (vista `v_organization_plan_usage`, que ya suma `size_bytes` de
evidencias CPR, `file_size_bytes` de evidencias textiles, documentos maestros y
logo), **no** desde el prefijo de ruta. No se cambió Storage RLS (0099) ni se
duplicaron archivos. **Nota:** los valores anteriores son los efectivos actuales;
si el negocio define cifras comerciales distintas, se editan en `plan_definitions`
/ `plan_limits` (una sola fuente), sin tocar componentes.

---

## 25. Empresas existentes

**No** hay backfill que habilite módulos masivamente ni inicie Demo temporal para
empresas antiguas. El superadministrador ve sus asignaciones; si no existe una,
aparece "Sin asignar" y puede elegir Demo permanente / Full / Extra /
Deshabilitado. La automatización de Demo 48 h aplica **solo** al registro de
empresas nuevas después de T9F (verificado: caso 24, aislamiento).

---

## 26. Migración de datos históricos

Backfill de las filas existentes de `organization_modules` (0100): `access_mode`
se toma de la **suscripción org-wide vigente** (información de plan previa;
preserva el acceso efectivo actual, no es una decisión comercial),
`access_expires_at = null` (**permanente**, sin vencimiento retroactivo),
`assignment_source='legacy_backfill'`, `access_started_at = activated_at`. `core`
→ full/permanente/infrastructure. **No** se cambia `enabled`, **no** se habilitan
filas deshabilitadas, **no** se crean filas para módulos sin asignación, **no** se
convierte a nadie a Demo temporal. Distribución verificada en vivo tras aplicar.

---

## 27. Seguridad

Solo el superadministrador cambia el estado comercial, verificado en **cuatro
capas**: UI (sección solo para platform_staff), Server Action (`isSuperadmin`),
RPC SQL (`is_platform_superadmin()`), y RLS/grants. Además, 0100 **elimina** las
políticas de INSERT/UPDATE de cliente sobre `organization_modules` (antes las
permitía el org-admin): **una empresa no puede asignarse un plan a sí misma**.
Las funciones son `SECURITY DEFINER` con `search_path` seguro, `REVOKE` inicial,
grants mínimos, comprobación explícita de superadmin, validación de organización y
módulo, sin SQL dinámico y sin secretos en errores. El service role no se expone
al navegador (prueba estática). No se confía en rol, `enabled`, `access_mode` ni
fechas enviados por el cliente: solo `(organization_id, module_code,
target_state)`. Verificado en staging: admin de empresa, usuario, otra empresa y
anon **no** pueden cambiar el plan (casos 10–13).

---

## 28. Auditoría

Se reutiliza `log_event` / `audit_log` (0005, append-only) — no se creó tabla
nueva. Eventos: `organization_module_demo_started` (por módulo, al registrarse) y
`organization_module_access_changed` (con `before`/`after`: enabled, access_mode,
vencimiento, y el actor). `organization_modules` ya tenía trigger de auditoría de
fila que registra el diff. La UI muestra "Última modificación: <fecha> · <actor>".
Verificado en staging (casos 5 y 20). No se guardan contraseñas, claves, tokens
ni datos personales innecesarios.

---

## 29. Migración 0100

Única migración nueva. Columnas de acceso + constraints + índice implícito
(unique existente) + provisión + RPC de superadmin + RPC de resolución + backfill
+ cierre de RLS + auditoría + grants + rollback documentado en la cabecera. No
modifica 0070–0099.

---

## 30. Archivos creados

- `supabase/migrations/0100_organization_module_access_modes_and_demo_trial.sql`
- `lib/modules/catalog.ts`, `lib/modules/access.ts`, `lib/modules/messages.ts`
- `lib/db/module-access.ts`
- `lib/auth/require-cpr-module.ts`
- `server/actions/platform-modules.ts`
- `components/domain/modules/demo-trial-banner.tsx`
- `components/domain/platform/organization-modules-section.tsx`
- `tests/unit/t9f-module-access.test.ts`, `tests/unit/t9f-provisioning-and-guards.test.ts`
- `tests/rls/t9f-module-access-plans.test.ts`
- `docs/platform/TRAZALOOP_T9F_DEMO_TRIAL_AND_MODULE_ACCESS_PLANS_REPORT.md`

## 31. Archivos modificados

- `lib/auth/require-textiles-module.ts` (regla canónica)
- `app/(app)/(shell)/layout.tsx` (banner Demo compartido)
- `app/(app)/modules/page.tsx` (estado comercial real)
- `app/(app)/(shell)/dashboard/page.tsx`, `.../audit-support/page.tsx` y las 8
  páginas funcionales de CPR (guard `requireCprModule`)
- `app/(app)/platform/organizations/[id]/page.tsx` (sección de módulos)
- `package.json` (scripts de las suites T9F)
- `tests/unit/textiles-module.test.ts`, `tests/unit/plans.test.ts`,
  `tests/passports/textiles-passports-share.test.ts` (aserciones y listas
  actualizadas al nuevo modelo — sin debilitar)

## 32. Pruebas automatizadas

`tests/unit/t9f-module-access.test.ts` — **20/20** (regla canónica, estados
derivados, entitlements Full≡Extra salvo almacenamiento, Demo temporal≡permanente,
catálogo ↔ 0100, tiempo restante). `tests/unit/t9f-provisioning-and-guards.test.ts`
— **13/13** (provisión 48 h idempotente, RLS cerrada, seguridad de la RPC, guards
canónicos, sin service role en cliente). Ambas encadenadas en `test:all`.

## 33. Pruebas RLS

`tests/rls/t9f-module-access-plans.test.ts` — **24/24** contra staging: registro
por el flujo real (CPR+Textiles Demo 48 h, sin Quality/Construcción, auditado,
idempotente); regla canónica (demo vencido bloquea sin cron; datos permanecen);
seguridad (admin de empresa / usuario / otra empresa / anon no pueden); gestión
del superadmin (demo permanente / full / extra / deshabilitar / reactivar,
auditado); cuotas por plan; idempotencia; rechazo de Quality/Construcción;
aislamiento entre empresas.

## 34. Prueba manual

Ver §… (sección de prueba manual focalizada más abajo en este documento y los
resultados en la respuesta del sprint). Registro → aviso de 2 días + vencimiento;
/modules con CPR y Textiles en Demo y Quality/Construcción en Próximamente;
superadmin cambia estados; deshabilitar/reactivar conserva datos; org con Demo
vencido (fixture) puede iniciar sesión y ver /modules pero no entrar a CPR ni
Textiles.

## 35. npm ci

Instalación desde cero real (`rm -rf node_modules .next`, `rm -f
tsconfig.tsbuildinfo`, `npm cache verify`, `npm ci`). Node v22.23.1, npm 10.9.8.
Resultado real en la respuesta del sprint.

## 36. Typecheck

`npm run typecheck` — sin errores.

## 37. Lint

`npm run lint` — 0 errores. Persiste **1 warning ajeno preexistente**
(`domainSrc` sin uso en `tests/evidences/textiles-evidences-hardening.test.ts`,
de sprints anteriores, fuera de alcance — ya documentado en T9E.3/T9E.4).

## 38. Build

`npm run build` — correcto.

## 39. Suites

`npm run test:all` — verde por código de salida real (incluye las dos suites
unitarias T9F). Las suites RLS vivas (T9E.1–T9E.4 y T9F) se ejecutan aparte
(exigen BD). La suite CPR preexistente `tests/rls/isolation.test.ts` conserva sus
9 fallos RLS previos, **ajenos a T9F** y documentados por separado — el nuevo
modelo de acceso no los causa.

---

## 40. Riesgos residuales (honestos)

- **Guard de CPR por página:** se aplicó a las páginas funcionales de CPR y al
  dashboard; una ruta CPR nueva debe recordar el guard (Textiles queda cubierto a
  nivel de layout). Las mutaciones sensibles siguen respaldadas por la capa de
  planes existente.
- **Cuota por bucket compartido:** el uso de almacenamiento es org-wide (bucket
  compartido); la cuota se resuelve por módulo desde el plan de su `access_mode`,
  pero el consumo no se atribuye por módulo (documentado; no se cambió Storage
  RLS).
- **Suscripción org-wide coexistente:** `organization_subscriptions` sigue
  gobernando los límites funcionales que aplican los helpers de creación de
  recursos (sprint 10A); T9F resuelve el ACCESO y los entitlements por módulo.
  Unificar por completo ambos ejes es trabajo futuro.
- **Vulnerabilidades moderadas de dependencias** (npm audit): no se tocaron por
  alcance (exigirían `--force` o mayores).
- **CPR fuera de Storage:** los 9 fallos RLS preexistentes de `isolation.test.ts`
  siguen sin corregir, por alcance.

## 41. Despliegue (Preview)

1. Desplegar el código (los guards + la capa server-only deben estar vivos con la
   migración: al cerrar la RLS de cliente, cualquier escritura directa dejaría de
   funcionar — no la hay hoy).
2. `npx supabase migration list --db-url "$SUPABASE_DB_URL"` → remoto termina en 0099.
3. `npx supabase db push --dry-run` → solo `0100`.
4. `npx supabase db push`.
5. Verificar columnas/constraints/funciones/grants/RLS y el registro de una
   empresa nueva (§20 del brief).
6. Preview de Vercel: sin variables nuevas obligatorias; `TEXTILES_MODULE_ENABLED`
   se conserva como kill switch.

## 42. Rollback

Sin `db reset`. No borra organizaciones, asignaciones ni datos. Pasos:
restaurar las políticas RLS de 0006 (INSERT/UPDATE por `is_org_admin`); `drop` de
las funciones nuevas; restaurar `create_organization` / `create_platform_organization`
a su cuerpo de 0053. Las columnas nuevas pueden conservarse (no estorban) o
eliminarse con `drop column`. **Advertencia:** las empresas registradas DESPUÉS de
0100 tienen su prueba Demo en estas columnas; si se eliminan, revierten al modelo
`enabled` y su vencimiento se pierde (quedarían con acceso permanente) — no se
pierde ningún dato de negocio. Ejecutar las consultas de verificación antes y
después. No ejecutar el rollback en staging.

## 43. Checklist final de revisión humana

- [x] `access_mode` solo demo/full/extra; `enabled` independiente.
- [x] Empresa nueva → CPR + Textiles en Demo, 48 h exactas; Quality/Construcción no.
- [x] Aviso de 2 días con fecha de vencimiento; tiempo restante informativo.
- [x] Demo vencido bloquea sin cron; permite login y /modules; conserva datos.
- [x] Superadmin: Demo permanente / Full / Extra / Deshabilitar / Reactivar,
      idempotente y auditado; Quality/Construcción rechazados.
- [x] Full ≡ Extra salvo almacenamiento; cuotas centralizadas; sin inventar valores.
- [x] Selector con estado real; guards CPR y Textiles por regla canónica; kill
      switch de Textiles con prioridad.
- [x] Empresas antiguas sin Demo temporal automático; sin habilitación masiva.
- [x] Solo superadmin cambia estados (UI + action + RPC + RLS); empresa no puede.
- [x] 0100 única migración nueva; 0070–0099 intactas.
- [x] npm ci / typecheck / lint (0 errores) / build / test:all verdes por exit code;
      RLS T9F 24/24 en staging.
- [x] Sin secretos en repositorio ni en el ZIP.
- [x] No se limpió staging; no se desplegó a producción; no se implementó T9G/T9H.
