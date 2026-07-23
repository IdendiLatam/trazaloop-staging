# Trazaloop · Sprint T9F.2 — Cierre de límites por módulo, almacenamiento real y concurrencia

**Informe técnico de entrega.** Estado: implementado y validado localmente; migración `0101` corregida y acumulada **NO aplicada**; suites RLS **preparadas, no ejecutadas** desde este entorno.

---

## 1. Contexto y alcance

T9F.1 dejó el control comercial por módulo aplicado operativamente (gates, límites CPR, UI coherente). La auditoría de T9F.2 confirmó seis bloqueadores que impedían considerar el sistema listo: límites Textiles sin aplicar en creaciones, tamaño por archivo TrazaDocs resuelto desde el plan legacy, verificación de almacenamiento que fallaba abierta, contabilización que ignoraba versiones físicas y perdía huérfanos, primera asignación concurrente con `unique_violation`, y una suite RLS con expectativas débiles y limpieza que violaba la inmutabilidad de la auditoría. Este sprint cierra los seis sin rediseñar la arquitectura ni tocar los cierres previos (0093–0099, T9E).

## 2. Estado de entrada (verificación honesta)

El árbol de trabajo se verificó **byte a byte idéntico** al `trazaloop2-sprint-T9F1.zip` entregado (diff recursivo completo, cero diferencias). Nota: la rama remota `feature/t9f1-module-operational-enforcement` **no existe en GitHub** — T9F.1 nunca se subió, cumpliendo la regla de no hacer push; el requisito de partir "exactamente del estado T9F.1" queda garantizado por esa verificación contra el ZIP, no por una rama.

## 3. Reglas respetadas

Sin commits, push, PRs ni deploys. Sin conexión a Supabase staging/producción (la validación SQL usó un PostgreSQL **local efímero**, §33). `0100` intacta (SHA-256 verificado al empaquetar). **No existe 0102**: `0101` se corrigió EN EL MISMO ARCHIVO. Sin cambios en 0093–0099 ni en Storage RLS. `audit_log` intocado. Sin secretos en el código.

## 4. Los seis bloqueadores — resumen de cierre

| # | Bloqueador | Cierre |
|---|---|---|
| 1 | Límites Demo no aplicados en Textiles | Helper canónico con incremento en las 8 creaciones limitadas + decisión en BD |
| 2 | Tamaño por archivo TrazaDocs desde legacy | `access_mode` del módulo CPR; sin fallback; bloquea si no resuelve |
| 3 | Almacenamiento fail-open | Resultado tipado verificado; `?? 0` eliminado; mensaje contractual |
| 4 | Versiones físicas no contadas + huérfanos | Vista con dedup por (bucket, ruta) + versiones + cola contable de huérfanos |
| 5 | `unique_violation` concurrente | Advisory lock transaccional por (org, módulo) + UPSERT |
| 6 | Suite RLS débil y limpieza inválida | T9F.1 corregida (sin tocar auditoría) + T9F.2 nueva con 52 casos concretos |

## 5. Auditoría del Bloqueador 1 — hallazgos

Siete creaciones Textiles ejecutaban gate (`checkTextilesCanMutate`) e insertaban sin consultar `plan_limits`: proveedor, material, producto, evidencia (begin), orden de producción, lote de entrada y lote de salida. Solo TrazaDocs Textil validaba `documents_trazadocs`. Con Textiles en Demo, una empresa podía crear proveedores, materiales, productos, órdenes, lotes y evidencias **sin tope alguno**, mientras el mismo plan en CPR sí limitaba: la promesa comercial del módulo era ficticia.

## 6. Matriz de recursos limitados Textiles (decisión de mapeo)

| Recurso (`plan_limits`) | Tabla | Acción que consume | Límite Demo |
|---|---|---|---|
| suppliers | textile_suppliers | createTextileSupplierAction | 1 |
| materials | textile_materials | createTextileMaterialAction | 5 |
| products | textile_products | createTextileProductAction | 1 |
| evidences | textile_evidences | beginTextileEvidenceUploadAction | 1 |
| production_orders | textile_production_orders | createTextileProductionOrderAction | 1 |
| input_batches | textile_input_lots | createTextileInputLotAction | 1 |
| output_batches | textile_output_lots | createTextileOutputLotAction | 1 |
| documents_trazadocs | trazadoc_documents (textiles) | createTextileTrazadocFromTemplateAction | 2 |

Full y Extra: ilimitados (seed 0050, sin cambios). Entidades **sin** código de recurso en el catálogo (fibras personalizadas, componentes, procesos, colecciones, referencias, composiciones, circularidad, pasaportes, enlaces de compartición, consumos y pasos de orden) **no se limitan**: inventar límites nuevos estaba prohibido; quedan documentadas aquí y protegidas contra deriva por la prueba estructural (§26).

## 7. Punto único de decisión

Cada creación limitada llama `checkTextilesResourceLimit("<recurso>")` inmediatamente tras el gate y **antes** del INSERT (o de emitir la intención/URL firmada, en evidencias). El helper delega en `checkModuleResourceLimit(módulo, recurso, incremento)`, único punto de decisión para CPR y Textiles.

## 8. Decisión conteo+límite protegida en base de datos

`checkModuleResourceLimit` ya no compone la decisión con dos lecturas separadas desde Next.js: llama a la nueva RPC **`check_module_resource_allowance(org, módulo, recurso, incremento)`** (0101, `security invoker`, `stable`), que en un solo snapshot resuelve: acceso del módulo (reutilizando `resolve_organization_module_access` de 0100 sin modificarla), límite del plan del módulo y conteo real desde `v_organization_module_usage`. Respuesta: `verified` + `allowed` + motivo + conteo y límite exactos. La membresía se aplica dos veces (la resolución de 0100 y la guarda embebida de la vista).

## 9. Incrementos (creación masiva)

`requestedIncrement` (entero ≥ 1; por defecto 1) viaja hasta la RPC, que evalúa `conteo_actual + incremento <= límite`. Los dos importadores CPR (nuevo `imports.ts` y anterior `import.ts`) calculan el incremento en servidor (filas válidas que efectivamente se insertarán, excluyendo las que se saltan por existir) y validan **antes del primer INSERT**: si excede, la operación completa se rechaza — jamás una inserción parcial que deje a la empresa por encima del límite. Hoy Demo ni siquiera alcanza ese punto (imports_enabled=0), pero el cierre no depende de esa coincidencia de catálogo. Textiles no tiene creación masiva propia; si se añade, la matriz estructural obliga a declararla.

## 10. Semántica de conteo (decisión documentada)

Los límites cuentan **todas las filas** (`count(*)`), igual que la vista legacy 0052 y el conteo CPR previo: desactivar (`is_active=false`) o archivar **no libera** la unidad; reactivar o editar **no consume** una nueva (mismo registro); eliminar (donde existe eliminación física, como en CPR) sí libera porque la fila desaparece. Es la semántica coherente con el almacenamiento: una evidencia archivada conserva fila y objeto, y sigue ocupando cuota. La prueba 14-15 de la suite unitaria fija esta decisión.

## 11. Fail-closed también en conteos

La convención T9F.1 ("un fallo de lectura del conteo no bloquea") queda **revocada** por diseño: si la RPC no existe, falla, o devuelve algo no verificado, la creación se bloquea con el mensaje contractual "No fue posible verificar el uso actual de este recurso. Inténtalo nuevamente." y un `console.error` técnico sin secretos. Consecuencia de despliegue: **aplicar 0101 antes del código** (véase §44); con el código nuevo y sin 0101, las creaciones limitadas y las cargas quedan bloqueadas (dirección segura, nunca abierta).

## 12. Bloqueador 2 — tamaño por archivo TrazaDocs CPR

Causa raíz: `uploadFileDocumentAction` y `replaceFileDocumentFileAction` leían `getOrganizationUsage()?.planCode ?? "demo"` (plan **legacy** org-wide). Una empresa con legacy Full y CPR Demo recibía 25 MB por archivo debiendo recibir 10; con legacy Demo y CPR Full/Extra, 10 debiendo recibir 25. Cierre: nuevo `getCprAccessModeForAction()` (module-plans) resuelve el `access_mode` del MÓDULO; `accessModeToPlanCode` (1:1) alimenta la fuente única ya existente `maxFileDocumentSizeForPlan` (demo 10 MB; full 25 MB; **extra = full**, Extra solo difiere en cuota total). Si el modo no puede resolverse, la acción **bloquea** — eliminado el `?? "demo"` y el import del legacy.

## 13. TrazaDocs Textil

Verificado sin lógica de archivos: es estructurado (contenido en BD), sin adjuntos, sin legacy. Sin cambios.

## 14. Bloqueador 3 — capa de uso tipada

`lib/db/module-usage.ts` se reescribió sobre una parte pura nueva (`lib/db/module-usage-shared.ts`, sin `server-only`, ejercitable por pruebas): `fetchOrganizationModuleUsage` devuelve `{ok:true, usage}` **solo** tras una consulta exitosa con todos los valores finitos y ≥ 0; en cualquier otro caso `{ok:false, reason}` con motivo tipado — `query_failed` (error de consulta), `source_unavailable` (vista inexistente, código 42P01, o fila ausente sin error) o `inconsistent_data` (null, negativo, NaN, no numérico). **Solo un cero verificado es cero.** El intérprete de filas (`interpretModuleUsageRow`) es puro y está cubierto caso por caso en la suite unitaria.

## 15. Autorización de cargas fail-closed

`getModuleStorageUsage(módulo)` (nuevo, tipado) exige: acceso vigente + cuota del plan resuelta + uso verificado + **cero conflictos de tamaño**. `checkModuleStorageAvailable` bloquea ante cualquier `ok:false` con el mensaje contractual "No fue posible verificar la capacidad de almacenamiento disponible. Inténtalo nuevamente." — sin iniciar intento, sin URL firmada, sin finalize. El `?? 0` desapareció del código (prohibido por prueba estática). Un uso mayor que la cuota (posible tras reducir plan) no es "inconsistencia": es un resultado verificado con disponible 0 que bloquea cargas nuevas sin insinuar borrado de datos.

## 16. Pantallas informativas

`resolveOrganizationModuleEntitlements` reporta `storageUsedBytes: number | null` (null = no verificado; jamás un 0 inventado); el resumen de plan del dashboard (`getModulePlanUsageSummary`) devuelve null y la tarjeta se omite; la consola de plataforma muestra "—". La AUTORIZACIÓN vive solo en module-plans.

## 17. Bloqueador 4 — hallazgos de contabilización

`trazadoc_file_document_versions` conserva `storage_path`/`size_bytes` por versión; el reemplazo sube **rutas nuevas** (el objeto anterior queda referenciado solo por su versión histórica y no se contaba); las transiciones de estado copian la **misma ruta** a la versión nueva (varias referencias a un mismo objeto). Además `deleteFileDocument` y `deleteEvidenceAction` borraban filas sin retirar objetos: huérfanos físicos invisibles para la cuota. Buckets: `trazadocs-documents` (maestro) y `evidences` (evidencias CPR `{org}/{id}/…` y textiles `{org}/textiles/…`, prefijos disjuntos).

## 18. Identidad física y deduplicación (vista 0101)

El almacenamiento del módulo se calcula sobre **objetos físicos** deduplicados por `(bucket, ruta)`:

- **CPR**: `evidences.storage_path` + `trazadoc_file_documents.storage_path` + **todas** las `trazadoc_file_document_versions.storage_path` + candidatos huérfanos del módulo.
- **Textiles**: `textile_evidences.file_path` + candidatos huérfanos del módulo.

Un objeto referenciado N veces (actual = última versión; transiciones que copian ruta) suma **una sola vez** — validado con bytes exactos en el arnés local (§40) y preparado con bytes exactos en la suite RLS. Rutas vacías (borradores sin archivo) se excluyen; archivos históricos sin tamaño suman 0 (estimación por debajo, convención 0052, nunca bloquea retroactivamente). El logo sigue siendo global sin atribución.

## 19. Tamaños contradictorios (política)

Si dos referencias del mismo objeto declaran tamaños distintos: el uso reportado toma el **máximo** (conservador: nunca subestima la cuota, dirección segura) y la vista expone `storage_object_conflicts > 0`; la capa de aplicación entonces **bloquea cargas nuevas** (dato inconsistente = fail-closed) hasta que la corrección de datos elimine el conflicto. Ni "el menor en silencio" ni resolución permisiva: la política exacta está fijada por pruebas (unitaria 34 + humo SQL local).

## 20. Integridad BD–Storage en eliminaciones (estrategia adoptada: cola contable)

Regla: **todo objeto físico que permanezca en Storage debe seguir siendo contabilizable**. Implementación (opción "cola de limpieza con referencia contable" de §20 del plan):

1. **Maestro (borrador)**: antes de borrar filas se listan TODAS las rutas físicas (`listFileDocumentStoragePaths`: actual + versiones, deduplicadas); se borran las filas (la autorización real sigue siendo RLS/dominio; las versiones caen en cascada); se retiran los objetos **confirmando** cada eliminación. Un retiro fallido se registra vía `register_storage_orphan` y el usuario recibe el aviso de que esos archivos "seguirán contando" hasta completarse la limpieza. Reintentar es idempotente.
2. **Evidencias CPR**: el DELETE devuelve la fila eliminada con su ruta y tamaño (`select("id, storage_path, size_bytes")`); si la RLS rechaza (validada/rol), no se toca nada; con la fila fuera, el retiro fallido registra el candidato.
3. **Reemplazo del maestro**: si la RPC falla tras subir el archivo nuevo, la limpieza confirma el retiro o registra el candidato (el error mostrado sigue siendo el real de la RPC).

`storage_orphan_candidates` (0101): única por (bucket, ruta), RLS sin políticas (clientes ni leen ni escriben directo), registro solo vía función `security definer` con membresía verificada, tamaño conservando el mayor. **La vista la suma**: el objeto pendiente sigue contando. La resolución definitiva (retiro físico + borrado del candidato) es exclusiva de `service_role` (operación/limpieza posterior).

## 21. Textiles y eliminaciones

Las evidencias textiles no tienen eliminación física de usuario (archivado conserva fila y objeto: sigue contando — coherente con §10). Los intentos de carga y su limpieza server-only (0097/0098, con reintentos y barreras) **no se tocaron**: ya cumplen la regla (el intento conserva la referencia hasta confirmar el retiro). Riesgo residual documentado en §43.

## 22. Bloqueador 5 — concurrencia de la RPC

`set_organization_module_access` toma `pg_advisory_xact_lock(hashtextextended('organization_modules:' || org || '/' || módulo, 0))` **antes** de leer estado: dos primeras asignaciones simultáneas quedan serializadas (la segunda espera, ve la fila y resuelve como no-op o transición) — sin `unique_violation`, sin doble fila, sin doble auditoría, sin 500. El lock es por par (cero contención entre organizaciones o módulos distintos) y se libera solo al terminar la transacción. Segunda defensa determinista: el INSERT es ahora `on conflict on constraint organization_modules_org_module_uniq do update` (UPSERT). La idempotencia T9F.1 se conserva intacta: no-op ⇒ `changed=false` sin UPDATE (updated_at/updated_by intactos) y sin auditoría; transición real ⇒ exactamente un evento.

## 23. Validación REAL de la concurrencia (local)

`scripts/t9f2-local-sql-harness/concurrency.sh` ejecutó dos sesiones psql **simultáneas** contra el PostgreSQL local con 0101 aplicada. Resultado real: mismo objetivo ⇒ `[true] [false]`, 1 fila, modo full, auditoría Δ=1, cero `unique_violation`; objetivos distintos (full y extra) ⇒ 1 fila, Δ=2, ambos `changed=true`, estado final serializado. La suite RLS T9F.2 repite ambos escenarios contra staging con `Promise.all` (casos 42–46).

## 24. Bloqueador 6 — qué estaba mal en la suite RLS T9F.1

(a) La limpieza intentaba `DELETE` sobre `audit_log` — prohibido y además imposible: el trigger `t_audit_log_immutable` lo bloquea incluso para el rol de BD. (b) El caso 8 aceptaba `count >= 0` (verdad trivial). (c) La organización quedaba como residuo silencioso: `audit_log.organization_id` tiene FK **RESTRICT** a `organizations`, y como `create_organization` audita siempre, **ninguna organización con auditoría puede eliminarse físicamente, jamás** — el `delete` fallaba en silencio.

## 25. Corrección de la suite T9F.1

Sin tocar auditoría: la limpieza elimina datos funcionales, membresías, módulos, suscripciones y usuarios; intenta el borrado de la organización y, cuando la FK de auditoría lo impide, la deja como **cascarón neutralizado** renombrado `[QA neutralizada] t9f1 <id>` — patrón ya documentado en las suites T9E ("residuo protegido por diseño"). Después **verifica** residuos con expectativas concretas (0 membresías, 0 módulos, 0 proveedores, 0 intentos por organización; usuarios inexistentes) y suma a `failed` si algo queda. El caso 8 ahora exige: resolución `demo_expired` **y** cero evidencias textiles de esa organización.

## 26. Suite RLS T9F.2 nueva (52 casos, preparada)

`tests/rls/t9f2-module-limits-storage-and-concurrency.test.ts` — script `npm run test:t9f2-rls`. Fixtures con prefijo `t9f2_<timestamp>_<aleatorio>`; organizaciones por el flujo real (`create_organization`); estados comerciales por la RPC real de superadministrador. Cobertura por bloques: **A (1–15)** límites con datos reales — conteos exactos de la vista, decisión al límite con `current_count`/`limit_value` exactos, incrementos masivos rechazados íntegros, CPR y Textiles sin cruce, `no_limit` e incremento inválido; **B (16–25)** independencia del legacy — legacy Full no relaja Demo del módulo, legacy Demo no recorta Extra (cuota 5 GiB exacta del catálogo), la resolución de `access_mode` (insumo del tamaño por archivo) ignora el legacy; **C (26–34)** almacenamiento — cero VERIFICADO con fila presente, CHECK de negativos en BD, anon sin vista, vencido/deshabilitado bloqueado verificado, begin 0097 rechaza 21 MB con `FILE_SIZE_INVALID`; **D (35–41)** física exacta — 40 MB exactos con actual+v3 deduplicados y v1/v2 históricas + evidencia, textil 1 MB separado, huérfano +2 MB ⇒ 42 MB; **E (42–46)** concurrencia real con `Promise.all`; **F (47–52)** seguridad de la RPC (admin de empresa, usuario normal, admin de otra empresa, anónimo, módulo no funcional, estado arbitrario).

## 27. Separación de responsabilidades de prueba (por qué así)

La suite RLS prueba lo que la BASE DE DATOS debe garantizar sola (vista, allowance, RPC, políticas, CHECKs). Lo que garantizan las Server Actions (orden límite→cuota→INSERT, mensajes contractuales, fail-closed de la capa TS, registro de huérfanos en los flujos) se prueba **localmente**: estructural sobre el código real + arnés SQL local. Los fixtures físicos de la suite RLS se insertan con `service_role` porque la finalización de cargas es server-only por diseño (0098) y no es invocable desde fuera de la aplicación; las **expectativas** se leen siempre con la sesión del miembro real. Los casos cuya única verdad es TypeScript puro (derivación 10/25/25 MB) se prueban en local y la suite RLS fija su **insumo** (el `access_mode` resuelto), documentándolo en el propio caso.

## 28. Limpieza y residuos (suites RLS)

Ambas suites eliminan: objetos Storage del run, datos funcionales, huérfanos registrados, intentos, membresías, módulos, suscripciones, usuarios (incluido `platform_staff`/`profiles`). Verificación final con expectativas concretas: cero filas funcionales por organización del run, cero objetos bajo su prefijo, cero usuarios; cualquier residuo suma un fallo. Las organizaciones cuya eliminación física impide la FK de auditoría quedan como **cascarón neutralizado** renombrado — los eventos inmutables de auditoría no cuentan como residuo funcional (decisión de diseño previa, 0005/0024, que este sprint no podía ni debía debilitar).

## 29. Suite unitaria/estructural T9F.2

`tests/unit/t9f2-limits-storage-concurrency.test.ts` (28 checks agrupando los 48 ítems de §29 del plan): huellas de límites por modo; **matriz Textiles** con verificación de orden (límite antes del INSERT/RPC); anti-deriva (ninguna inserción sobre tabla limitada fuera de la matriz); incrementos e importadores (validación antes del primer INSERT); semántica reactivar/editar/eliminar; tamaños por archivo 10/25/25 y ausencia total de legacy en el maestro; intérprete de uso caso por caso (cero verificado, null, negativo, NaN, infinito, texto); prohibición estática de `?? 0`; orden del begin textil; espejo puro del algoritmo de deduplicación (30 MB exactos; contradictorios ⇒ máximo + conflicto); integridad §20 (rutas antes de borrar, registro de huérfanos, vista que los cuenta); advisory lock + UPSERT + no-op antes de update/log + un solo evento; 0101 aditiva sin 0102; legacy fuera de las decisiones; wrappers canónicos obligatorios; sin service role en cliente; grants/revokes de 0101.

## 30. Pruebas estructurales anti-deriva

La matriz `TEXTILES_LIMIT_MATRIX` es un inventario explícito recurso↔tabla↔acción. Una prueba recorre TODOS los archivos `textiles-*` y falla si cualquier función exportada inserta en una tabla limitada sin llamar al helper canónico o sin estar declarada: añadir una creación (o duplicación) nueva sin límite rompe la suite. Otra prueba impide reintroducir el helper genérico con string libre fuera de `module-plans` (solo wrappers canónicos en acciones).

## 31. Suites previas actualizadas (sin debilitar)

`tests/unit/t9f1-module-operational-enforcement.test.ts`: los checks 20-23/40 exigen ahora la capa tipada + la RPC de allowance (invariante igual o más fuerte); los checks 31-34/37-38 validan la nueva estructura física de la vista (CTEs, dedup, conflictos, huérfanos, versiones) manteniendo las prohibiciones de cruce. `tests/unit/document-master.test.ts` (Corrección 11): misma intención, firma reforzada (la limpieza ahora confirma y contabiliza). Ninguna aserción se relajó; el resto de las ~50 suites pasó sin cambios.

## 32. Migración 0101 — inventario final

En el MISMO archivo (634 líneas, acumulada T9F.1+T9F.2, NO aplicada): §1 `storage_orphan_candidates` + `register_storage_orphan` (definer, membresía verificada, upsert conservando el mayor tamaño, sin acceso directo de clientes); §2 `set_organization_module_access` con advisory lock + UPSERT + idempotencia intacta; §3 `v_organization_module_usage` con conteos por módulo y almacenamiento físico deduplicado + `storage_object_conflicts`, guarda embebida en ambas ramas; §4 `check_module_resource_allowance` (invoker, stable, verificada); §5 índice `trazadoc_file_document_versions_org_idx`; §6 consultas de verificación documentadas. Grants mínimos y revokes explícitos en todos los objetos nuevos.

## 33. Por qué NO existe 0102 y por qué 0100 no se toca

0101 **nunca fue aplicada**: corregirla en el mismo archivo entrega una sola unidad de despliegue coherente; una 0102 partiría un cambio indivisible (la vista nueva y la RPC corregida no tienen sentido por separado) y duplicaría objetos en el historial. 0100 **sí está aplicada** en staging: es historia inmutable; el único cambio que necesita (el cuerpo de la RPC) se hace con `create or replace` desde 0101, mecanismo estándar y no destructivo, conservando su seguridad (solo superadmin re-verificado en SQL, solo módulos funcionales, estados válidos).

## 34. Validación SQL local (arnés efímero)

`scripts/t9f2-local-sql-harness/`: PostgreSQL 16 local (sin conexión externa), shims con las columnas EXACTAS del esquema real, la definición REAL de `resolve_organization_module_access` extraída de 0100, y 0101 aplicada tal cual. La creación de la vista valida cada tabla y columna referenciada. Humo con expectativas concretas: **todo en verde** (véase §40). Esto NO sustituye la suite RLS contra staging: la complementa desde este entorno sin violar la prohibición de conexión.

## 35. Cambios en TypeScript — inventario

Nuevos: `lib/db/module-usage-shared.ts` (parte pura). Reescritos/ampliados: `lib/db/module-usage.ts` (tipada, fail-closed, lista para plataforma), `server/actions/module-plans.ts` (allowance por RPC, incrementos, `getModuleStorageUsage`, `getModuleAccessModeForAction`/`getCprAccessModeForAction`, mensajes contractuales, log sin secretos), `lib/db/module-access.ts` (uso null cuando no verificado; resumen null; plataforma "—"). Acciones: 4 archivos Textiles (límites), 2 importadores (incrementos), `trazadocs-master.ts` (tamaño por módulo + eliminación íntegra), `evidences.ts` (eliminación íntegra), `lib/db/trazadocs-master.ts` (rutas + retiro confirmado + registro de huérfanos).

## 36. Mensajes de usuario (contractuales)

Almacenamiento no verificable: "No fue posible verificar la capacidad de almacenamiento disponible. Inténtalo nuevamente." Conteo no verificable: "No fue posible verificar el uso actual de este recurso. Inténtalo nuevamente." Retiro físico pendiente (maestro/evidencias): aviso explícito de que los archivos "seguirán contando" hasta completarse la limpieza. Los mensajes de límite alcanzado y de acceso del módulo son los ya existentes (sin cambios de contrato).

## 37. Seguridad (invariantes conservados y nuevos)

El cliente jamás decide plan, cuota, conteo, incremento ni módulo (todo en servidor con `requireActiveOrg`). La cola de huérfanos no es legible ni escribible por clientes; su función exige sesión + membresía. La allowance corre como invoker: sin fila de vista (no miembro) no hay decisión positiva posible. Grants nuevos: `authenticated` execute en las dos funciones; `anon` revocado en todo. Sin service role fuera de servidor (prueba estática). El kill switch y el estado administrativo de cuenta siguen aplicándose por encima, sin cambios.

## 38. Rendimiento

La decisión de límites pasó de dos consultas a **una RPC**. La vista añade la tabla de versiones: se creó `trazadoc_file_document_versions_org_idx` (la agregación por organización ya no escanea). El advisory lock es por par (org, módulo): contención solo entre operaciones sobre el MISMO módulo de la MISMA empresa, que es exactamente lo que debe serializarse.

## 39. Validaciones locales ejecutadas (resultados REALES)

- `npx tsc --noEmit`: **0 errores** (verificado tras cada paso).
- `npm run test:all` (bash): **EXIT=0** — 667 líneas de check en verde, 0 fallos; incluye `test:t9f2` nuevo (28 ✔) y `test:t9f1` actualizado (35 ✔).
- `npm run lint` (dentro de test:all): **0 errores**, 1 warning **preexistente** (`tests/evidences/textiles-evidences-hardening.test.ts` — `domainSrc` sin uso, documentado desde T9F.1, intocado).
- `npm run build`: **EXIT=0** ("Compiled successfully").

## 40. Validación SQL local (resultados REALES)

- Aplicación de 0101 sobre shims fieles: **exit 0** (vista y funciones creadas; toda columna referenciada validada).
- `smoke.sql`: **"SMOKE T9F.2 · TODO EN VERDE"** — idempotencia (`changed=false` sin `updated_at` nuevo y con exactamente 1 evento), rechazos (quality, premium, no-superadmin), deduplicación **41 MB exactos** (actual=v3 compartiendo ruta + v1 + v2 + huérfano 1 MB), textil 2 MB separado, conflicto de tamaño ⇒ máximo + `conflicts=1`, aislamiento de la vista, allowance (0/1 permite, incremento 2 excede, 1/1 bloquea con conteo/límite exactos, `no_limit`, incremento 0 no verificado, deshabilitado verificado-bloqueado, Full ilimitado, no-miembro bloqueado).
- `concurrency.sh`: **"CONCURRENCIA T9F.2 · TODO EN VERDE"** — `[true] [false]`, 1 fila, Δ auditoría=1; objetivos distintos: 1 fila, Δ=2, serializado.

Estas validaciones son **locales** (PG efímero): staging queda pendiente de la aplicación de 0101 y de `npm run test:t9f2-rls` desde una máquina autorizada.

## 41. Qué NO se hizo (y por qué)

No se aplicó 0101 (prohibido desde este entorno). No se crearon triggers de límite por tabla: cerrarían al 100 % la carrera conteo→INSERT, pero romperían los flujos legítimos de las suites RLS existentes (que pueblan organizaciones Demo por encima de los límites como fixtures) y de cualquier operación administrativa — véase el riesgo residual §42. No se contabilizan los intentos de carga en tránsito (§43). No se tocó la doble contabilidad informativa legacy (§43). No se inventaron límites para entidades sin código de recurso (§6).

## 42. Riesgo residual — carrera conteo→INSERT (documentada, acotada)

La decisión (RPC) y el INSERT de la acción son dos transacciones: dos solicitudes simultáneas de la MISMA empresa podrían superar el límite en la unidad de la carrera. Mitigación real: la decisión ahora es un snapshot único en BD (ya no dos lecturas TS separadas), la ventana es de milisegundos y el exceso está acotado por las solicitudes simultáneas del propio tenant (que en Demo opera con formularios individuales). El cierre hermético (constraint triggers con advisory lock por recurso) queda descrito como evolución posible y consciente — se descartó aquí por el impacto en flujos existentes (§41).

## 43. Otros riesgos residuales

(a) **Intentos en tránsito**: un objeto subido con intento aún no finalizado ocupa Storage sin contar en la vista; acotado por el TTL del intento y la limpieza server-only 0097/0098 (que conserva la referencia hasta confirmar el retiro). (b) **Doble contabilidad informativa**: la vista legacy org-wide (0052/0076) sigue sumando lo suyo para las pantallas legacy; no gobierna ninguna decisión de CPR/Textiles — retirarla es tarea de deprecación futura. (c) **Huérfanos**: la resolución definitiva de candidatos exige una operación `service_role` (retiro + borrado del candidato); mientras tanto la cuota los cuenta (dirección segura). (d) **Cascarones QA**: las organizaciones de prueba con auditoría son imborrables por diseño; quedan neutralizadas y etiquetadas.

## 44. Orden de despliegue (crítico)

1) Aplicar 0101 en staging (SQL editor / CLI, guía §pasos). 2) Verificar con las consultas de la propia migración. 3) Desplegar el código. 4) `npm run test:t9f2-rls` y `npm run test:t9f1-rls` desde máquina autorizada. **Invertir el orden bloquea** (fail-closed) las creaciones limitadas y todas las cargas: dirección segura pero disruptiva — no desplegar código sin 0101.

## 45. Rollback

Documentado en la cabecera de 0101 y en la guía: restaurar la RPC con su definición de 0100 (el archivo del repositorio es la fuente); tras revertir el código, retirar vista/funciones nuevas y, si se desea, la tabla de candidatos (solo referencias contables). Nada borra datos de negocio, módulos asignados, auditoría ni objetos.

## 46. Archivos nuevos

`lib/db/module-usage-shared.ts` · `tests/unit/t9f2-limits-storage-concurrency.test.ts` · `tests/rls/t9f2-module-limits-storage-and-concurrency.test.ts` · `scripts/t9f2-local-sql-harness/{shims.sql, resolve-from-0100.sql, smoke.sql, concurrency.sh, README.md}` · este informe · `docs/platform/TRAZALOOP_T9F2_APPLY_LATER_GUIDE.md`.

## 47. Archivos modificados

`supabase/migrations/0101_t9f1_module_access_hardening.sql` (reescrita acumulada) · `lib/db/module-usage.ts` · `server/actions/module-plans.ts` · `lib/db/module-access.ts` · `server/actions/{textiles-catalogs, textiles-products, textiles-traceability, textiles-evidences}.ts` · `server/actions/{imports, import, trazadocs-master, evidences}.ts` · `lib/db/trazadocs-master.ts` · `tests/unit/{t9f1-module-operational-enforcement, document-master}.test.ts` · `tests/rls/t9f1-module-operational-enforcement.test.ts` · `package.json` (scripts `test:t9f2`, `test:t9f2-rls`; cadena `test:all`) · `docs/platform/TRAZALOOP_T9F1_APPLY_LATER_GUIDE.md` (convertida en puntero a la guía T9F.2).

## 48. Confirmaciones de la entrega

0101 corregida y acumulada, **NO aplicada**. **No existe 0102**. 0100 intacta (hash verificado). Suites RLS **preparadas, no ejecutadas** (staging no verificado desde aquí). Sin commits, push, PRs ni deploys. Sin secretos en el ZIP (barrido previo al empaquetado). Sin cambios en 0093–0099 ni en Storage RLS.

## 49. Definición de "hecho" de T9F.2 (estado)

Implementación y validación local: **completa**. Pendiente fuera de este entorno: aplicar 0101, ejecutar ambas suites RLS en verde, validación manual §38 del plan (Demo Textiles tope+1 con mensaje, subida 11 MB Demo/24 MB Full en TrazaDocs, corte de Storage simulado, doble clic de asignación, revisión de huérfanos tras eliminar documento con versiones).

## 50. Cierre

Los seis bloqueadores están cerrados con la arquitectura existente: la promesa comercial por módulo ahora se **aplica** (Textiles limitado de verdad), se **mide** (objetos físicos, versiones incluidas, sin dobles conteos ni huérfanos invisibles), se **verifica** (nunca un cero inventado; ante la duda, se bloquea) y se **serializa** (asignaciones concurrentes sin errores ni auditoría duplicada). Todo ello demostrado localmente con resultados reales y dejado listo para la verificación final contra staging.
