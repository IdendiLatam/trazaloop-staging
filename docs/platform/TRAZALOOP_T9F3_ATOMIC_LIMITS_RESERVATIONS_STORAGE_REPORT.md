# Trazaloop · Sprint T9F.3 — Cierre definitivo: límites atómicos en base de datos, reservas de evidencias y ciclo seguro de archivos

**Informe técnico de entrega.** Estado: implementado y validado localmente (arnés SQL con smoke 32/32 y 3 carreras de concurrencia REALES en verde; `test:all` y `build` en verde); migración `0101` **acumulada T9F.1+T9F.2+T9F.3 y NO aplicada**; suites RLS **preparadas, no ejecutadas** desde este entorno.

---

## 1. Contexto y alcance

T9F.1 hizo operativo el control comercial por módulo; T9F.2 cerró límites Textiles, cuotas reales y concurrencia de la RPC, dejando documentados como riesgo residual la carrera conteo→INSERT y el bypass por INSERT directo. T9F.3 elimina esos residuos: la **base de datos es ahora la autoridad final** de los límites (triggers atómicos), las cargas de evidencias Textiles **reservan** capacidad antes de subir un byte, la eliminación de archivos sigue un **ciclo seguro contabilizable** (pending_delete → deleted/delete_failed), el registro de objetos pendientes quedó **endurecido** (server-only), cada versión cuenta con **su propio tamaño** y los tamaños **desconocidos jamás cuentan cero**.

## 2. Estado de entrada (verificación honesta)

El árbol de trabajo es byte a byte idéntico a `trazaloop2-sprint-T9F2.zip` (verificado con `diff -rq` contra el ZIP descomprimido; exit 0). La rama remota de T9F.2 no existe en GitHub (nunca hubo push, por regla); la base de partida queda acreditada por esa verificación. La 0100 permanece intacta (SHA-256 `0bfe8167…8eea41`, fijado en prueba automática).

## 3. Reglas respetadas

Sin commits, push, PRs ni despliegues; sin conexión a Supabase; ninguna migración aplicada; 0093–0099 y 0100 intactas; sin `DROP` de funciones (la firma 0097 se conserva y delega); sin tocar Storage RLS; sin crear planes, cuotas ni estados comerciales; `audit_log` sigue siendo inmutable e imborrable fila a fila (ver §26 sobre su FK); sin debilitar ninguna aserción de suites previas (donde una expectativa cambió, el invariante nuevo es estrictamente más fuerte y está comentado en el propio test).

## 4. Los bloqueadores A–H — resumen de cierre

**A (límites no atómicos)** → triggers BEFORE INSERT con advisory lock por (org, módulo, recurso): la carrera conteo→INSERT ya no existe. **B (bypass por INSERT directo)** → los mismos triggers aplican a la API de Supabase. **C (cargas sin reserva)** → begin reserva unidad + bytes; finalize revalida todo. **D (registro de huérfanos manipulable)** → register server-only con validación estricta; las vías de cliente derivan TODO de filas de dominio. **E (versiones con tamaño copiado)** → cada objeto conserva SU tamaño (SQL y TypeScript). **F (desconocido = 0)** → NULL cuenta como DESCONOCIDO y bloquea cargas. **G (éxitos silenciosos)** → toda respuesta de Supabase se inspecciona; compensaciones server-only verificadas. **H (residuos de QA)** → limpieza total verificada; la FK de auditoría ya no impide eliminar organizaciones.

## 5. Estrategia adoptada para la atomicidad (opción canónica: triggers)

Se implementó la opción A del plan: **un trigger genérico `enforce_module_resource_limit()` BEFORE INSERT por tabla limitada**. Ventajas frente a "RPC obligatoria por recurso": cubre por construcción el INSERT directo (Bloqueador B) sin reescribir 15 flujos de creación, conserva la RLS como única dueña del aislamiento, y hace de las importaciones una transacción atómica sin SQL nuevo (un statement multi-fila dispara el trigger fila a fila dentro de la MISMA transacción; el exceso aborta TODO).

## 6. Por qué el trigger es SECURITY INVOKER (demostrado, no supuesto)

En una función SECURITY DEFINER `current_user` es el DUEÑO de la función, no el rol que inserta: el gate «solo aplico a `authenticated`» quedaría SIEMPRE en bypass. Se demostró empíricamente en el arnés local (con el trigger definer, inserciones sobre demo vencido pasaban; con INVOKER, el smoke quedó 32/32). El trigger corre como el rol real; sus lecturas usan `resolve_organization_module_access` (definer de 0100, ya concedida a authenticated), `plan_limits` (política de lectura para miembros, 0050) y `count_module_resource` (definer con guard, §8).

## 7. Matriz de triggers (inventario cerrado)

15 triggers `t_<tabla>_limit`: 8 CPR (suppliers, materials, products, evidences, production_orders, input_batches, output_batches, trazadoc_documents) y 7 Textiles (textile_suppliers, textile_materials, textile_products, textile_evidences, textile_production_orders, textile_input_lots, textile_output_lots). `trazadoc_documents` sirve a dos módulos: el trigger recibe `BY_MODULE_KEY` y resuelve el módulo desde `NEW.module_key` (que fija un trigger de 0082 en servidor, jamás el cliente); claves desconocidas no inventan límite. La suite unitaria fija la matriz completa con regex por trigger: añadir una tabla limitada sin declararla rompe la suite.

## 8. Conteo autoritativo único: `count_module_resource`

Una sola función definer cuenta por (org, módulo, recurso); para `(textiles, evidences)` suma **confirmadas + reservas activas** (§13). La usan el trigger, begin, finalize y la allowance: una única semántica. Guard interno: invocada por un cliente (`current_user='authenticated'`), devuelve NULL si no es miembro — jamás sondas de conteos ajenos; el trigger convierte NULL en `RESOURCE_USAGE_UNVERIFIABLE` (fail-closed).

## 9. Ámbito de roles del trigger (decisión documentada)

El trigger aplica al rol `authenticated` (toda la superficie alcanzable por clientes). `service_role`, `postgres` y las funciones SECURITY DEFINER (begin/finalize, aprovisionamiento, fixtures de QA) son código de servidor confiable **que aplica sus propias validaciones**: finalize revalida límite y cuota por sí mismo (§17); el aprovisionamiento de 0100 no crea recursos limitados. No es un hueco: es la separación explícita cliente/servidor, verificada en el smoke (A8) y en la suite estructural.

## 10. No-miembro: el trigger NO decide aislamiento

Si `resolve` responde `not_member`, el trigger devuelve NEW y deja que la **política RLS** niegue con su error estándar — exactamente el comportamiento previo de todas las suites de aislamiento. Un trigger que respondiera por la RLS habría cambiado la semántica de decenas de casos; se comprobó en la suite RLS T9F.3 (área 6) que el intruso recibe el rechazo de la política, no uno comercial.

## 11. Demo vencido / deshabilitado / sin asignar: barrera también en BD

`MODULE_ACCESS_BLOCKED` con `detail` = motivo. Antes solo bloqueaban las Server Actions; ahora el INSERT directo de un miembro con Demo vencido se rechaza en PostgreSQL (smoke A4/A5; suite RLS área 1–4).

## 12. Semántica de conteo (sin cambios, ahora atómica)

Se conserva la decisión T9F.2: `count(*)` de TODAS las filas (activas e inactivas), igual que la vista. Desactivar no libera, reactivar/editar no consumen (los triggers son SOLO de INSERT), eliminar sí libera. La suite estructural verifica que el conteo no filtra por estado y que ningún trigger escucha UPDATE.

## 13. Importaciones: rechazo íntegro garantizado por transacción

`lib/db/imports.ts` separó el constructor puro (`buildBusinessRowPayload`) del insert y añadió `insertBusinessRows`: **un único INSERT multi-fila** = una única transacción. El trigger ve el acumulado de la propia transacción; si el plan no admite TODAS las filas — incluso por consumo concurrente posterior al pre-check — PostgreSQL revierte la operación completa (smoke A3: 4+2 sobre límite 5 → quedan 4; suite RLS área 7). El pre-check de incremento de T9F.2 se conserva como UX temprana; la autoridad es la transacción. El importador legacy ya insertaba en un solo statement: los triggers lo cubren sin cambios. `RESOURCE_LIMIT_EXCEEDED` en el commit produce el mensaje contractual de rechazo íntegro y marca todas las filas del job como error.

## 14. Reservas de evidencias Textiles — modelo

**El intent pending no vencido ES la reserva**: una unidad del recurso `evidences` + `expected_size_bytes` de almacenamiento. Se reutilizan los estados existentes de 0094/0097 (`pending/consumed/expired/failed`): cancelar (failed) y vencer (`expires_at <= now()`) liberan **por definición** — la contabilidad solo suma `status='pending' AND expires_at > now()`, sin cron. Esa condición gobierna, con el mismo texto, el conteo, la vista, el snapshot y la idempotencia (verificado estructuralmente: ≥4 usos).

## 15. `begin_textile_evidence_upload_v2` (0101 §6)

Conserva TODAS las validaciones de 0097 (rol, archivo, MIME, extensión, metadata canónica inmutable, ruta construida en servidor, tope 20 MB por archivo — el caso 33 de la suite RLS T9F.2 sigue recibiendo `FILE_SIZE_INVALID` porque el orden de validación se preservó) y añade, en este orden: acceso del módulo (Demo vencido/deshabilitado/sin asignar **no reservan**), advisory locks idénticos a los del trigger (`module_resource:…/textiles/evidences` y `module_storage:…/textiles`), idempotencia bajo el lock, límite de unidad (confirmadas + reservas activas + 1), y cuota (confirmado + reservado + declarado ≤ cuota) con fail-closed total ante desconocidos o conflictos (`STORAGE_UNVERIFIABLE`). La firma histórica de 0097 se conserva mediante `CREATE OR REPLACE` que **delega** en v2 (sin DROP): T9E y clientes previos reciben las mismas protecciones.

## 16. Idempotencia de begin

Columna aditiva `idempotency_key` + índice único parcial sobre `(org, creador, clave)` con `status='pending'`. La misma clave, resuelta **bajo el lock de la reserva**, devuelve el MISMO intent (`reused: true`) y una sola reserva (smoke B3; §28 del plan). El wrapper TypeScript acepta la clave opcional; la interfaz no cambió.

## 17. `finalize_textile_evidence_upload_server` — revalidación total

Misma firma y grants de 0098 (server-only). Cambios: toma los MISMOS locks **antes** del `FOR UPDATE` del intent (orden idéntico a begin/trigger: serialización completa entre reservas, finalizaciones y creaciones directas); revalida el acceso del módulo leyendo `organization_modules` DIRECTAMENTE — bajo service_role `auth.uid()` es NULL y `resolve` respondería `not_member`; la membresía y el rol del actor real ya se validan contra `p_actor_id` como en 0098 —; revalida el límite con `confirmadas + OTRAS reservas + 1` y la cuota con `confirmado + OTRAS reservas + tamaño real` (esta reserva se convierte en consumo: el comprometido no crece). Idempotencia de 0098 intacta: doble finalize → mismo `evidence_id` (carrera real: `[false] [true]`, una evidencia).

## 18. Contrato estricto de tamaño (decisión: jamás ampliar la reserva)

0098 exige que el tamaño REAL (derivado por el servidor del objeto físico) COINCIDA con el declarado; T9F.3 lo conserva: un real mayor **no amplía la reserva en silencio** — se rechaza (`OBJECT_SIZE_MISMATCH`) y el flujo de fallo existente limpia el objeto. Es más estricto que la alternativa del plan («intentar ampliar atómicamente») y preserva las expectativas de las suites T9E; documentado como contrato del producto: lo declarado es lo reservado y lo reservado es lo que entra.

## 19. Instantánea autoritativa `module_storage_snapshot`

Función definer interna con la MISMA semántica que la vista (mismas fuentes, misma deduplicación, mismos filtros de estado): begin/finalize deciden con ella bajo lock, el TypeScript lee la vista. La duplicación es deliberada (una vista no puede ejecutarse "bajo lock" desde una función con la misma economía); la suite estructural ata ambas a las mismas tablas y filtros para impedir deriva.

## 20. Aritmética de cuota (única en las cuatro superficies)

`comprometido = usado_confirmado + reservado`; `disponible = cuota − comprometido`. La aplican: begin (BD), finalize (BD), `getModuleStorageUsage`/`checkModuleStorageAvailable` (TypeScript, ahora restando reservas) y la vista (que expone `storage_reserved_bytes` para que cualquier pantalla lo muestre sin recalcular).

## 21. Tamaños desconocidos: jamás cero (Bloqueador F)

La vista eliminó todo `COALESCE(size, 0)` de los objetos físicos: un objeto cuyo tamaño no conoce NINGUNA referencia es DESCONOCIDO, no suma al usado y se cuenta en `storage_unknown_size_count`. Con desconocidos > 0: `getModuleStorageUsage` responde `unknown_sizes` (bloquea cargas), y begin/finalize levantan `STORAGE_UNVERIFIABLE`. Si ALGUNA referencia conoce el tamaño, gobierna el MÁXIMO conocido (conservador); tamaños conocidos contradictorios siguen siendo conflicto (política T9F.2 intacta).

## 22. Reconciliación (preparada, §23 del plan)

`scripts/t9f3-size-reconciliation/reconcile.ts` (+README): DRY-RUN por defecto, `--apply` explícito; localiza size NULL con ruta en `evidences`, `textile_evidences` y la cola (estado ≠ deleted); consulta `storage.info` y actualiza SOLO tamaños confirmados; los objetos inexistentes o sin metadata quedan reportados para decisión manual — jamás se inventan tamaños. Server-only (service role), nunca desde este entorno, nunca en migraciones.

## 23. Vista `v_organization_module_usage` v3

Columnas nuevas: `storage_reserved_bytes` (reservas activas; 0 en CPR) y `storage_unknown_size_count`. Cambios de fuentes: la cola contable entra con `status <> 'deleted'` (el ciclo §25); los tamaños viajan TAL CUAL (NULL = desconocido). Se conservan: identidad física por (bucket, ruta), máximo conocido, columna de conflictos, separación CPR/Textiles por prefijos y `module_key`, guard de membresía/staff, y todos los marcadores estructurales que fijan las suites T9F.1/T9F.2.

## 24. Ciclo seguro de eliminación (Bloqueador D/E, §18 del plan)

Estados: `pending_delete` (la marca nace ANTES de perder la referencia, **en la misma transacción** que borra las filas de dominio) → intento físico → `deleted` (retiro CONFIRMADO: libera cuota) o `delete_failed` (sigue contando, con `error_code` seguro). `storage_orphan_candidates` se rediseñó (mismo nombre): + source_type/source_id/status/last_attempt_at/error_code/deleted_at, `size_bytes` ahora nullable (desconocido cuenta como desconocido), CHECKs canónicos de bucket, prefijo de organización y combinación módulo-bucket; sin políticas RLS y revocada a clientes: solo funciones de dominio y service_role.

## 25. Vías de eliminación por dominio (espejo exacto de la RLS)

`queue_and_delete_trazadoc_draft` y `queue_and_delete_evidence` (definer, authenticated): validan con el MISMO predicado que la política RLS de DELETE correspondiente (0057: miembro + borrador + admin/quality o consultant creador; 0019/0023: admin/quality + estado ≠ valid — el guard de 0023 sigue disparándose en el DELETE), encolan los objetos derivando bucket/ruta/tamaño/fuente **de las filas reales** (jamás del navegador; el maestro encola el actual + TODAS las versiones, cada una con SU tamaño, deduplicadas conservando el mayor conocido) y borran las filas — todo en UNA transacción. Devuelven la lista encolada para que la acción ejecute el retiro server-only. Son los ÚNICOS `DELETE FROM` de toda la 0101 (whitelist fijada por las suites T9F.1/T9F.2).

## 26. `audit_log`: FK a organizations RETIRADA (qué cambia y qué no)

La FK RESTRICT hacía físicamente imborrable cualquier organización con eventos (todas), y el trigger de inmutabilidad — que NO se toca — impide el UPDATE que exigiría `ON DELETE SET NULL`. El plan T9F.3 (§34) exige que los eventos de auditoría no impidan eliminar organizaciones. Se retiró **solo la restricción referencial**: las filas quedan verbatim (organization_id conserva su valor histórico), siguen siendo inmutables e imborrables, el índice por organización se mantiene y ningún evento se reescribe jamás. No es un debilitamiento del registro: es la eliminación del veto de ciclo de vida que el propio producto declaró indeseado. Consecuencia directa: las limpiezas de QA pasan de "neutralización" a **eliminación total verificada**.

## 27. Retiro físico y resolución: server-only por diseño

`lib/db/storage-deletion.ts` (server-only, cliente administrativo): `removeQueuedStorageObject(s)` ejecuta `storage.remove`, INSPECCIONA el error y confirma en la cola vía `resolve_storage_deletion` (service-only); si la resolución no se confirma, el candidato permanece contando (dirección segura). Un cliente jamás puede "declarar eliminado" para liberar cuota: `resolve` y `register` responden `SERVER_ONLY` a authenticated (smoke D5/D9; suite RLS área 21, que además verifica que el candidato no cambió de estado).

## 28. `register_storage_orphan` endurecido (compensaciones §25)

Queda como RPC server-only para el ÚNICO caso sin fila de dominio: un objeto subido cuya finalización/actualización falló. Incluso para el servidor valida organización existente, módulo funcional, bucket permitido, prefijo de la organización y tamaño ≥ 0 o NULL, además de los CHECK canónicos de la tabla (combinación módulo-bucket, prefijo textil). `registerAndRemoveUnreferencedObject` registra PRIMERO (contabilizable) y luego intenta el retiro confirmado: pase lo que pase, el objeto queda contado o eliminado de forma confirmada — jamás invisible.

## 29. Compensación en la creación de documentos (TrazaDocs, §25)

Si `finalizeFileDocumentInitialVersion` falla tras subir: el objeto se registra (server-only) ANTES de perder su identidad y se intenta el retiro confirmado. Retiro confirmado → se limpia también la fila (con su error inspeccionado) y el usuario recibe un fallo limpio; retiro no confirmado → el documento queda con aviso explícito de que el archivo "seguirá contando" hasta la limpieza. La fila con ruta vacía + objeto sin referencia (el estado invisible que prohíbe el plan) ya no puede ocurrir.

## 30. Compensación en el reemplazo (TrazaDocs)

La compensación de T9F.2 migró a la vía server-only: registro pendiente + retiro confirmado. El usuario sigue recibiendo el error real de la RPC.

## 31. Evidencias CPR: fin del éxito silencioso (§25)

El `UPDATE storage_path/size_bytes` posterior a la subida ahora se INSPECCIONA (`.select("id")` + error + cero filas): ante fallo se registra el objeto (server-only), se intenta el retiro confirmado y el usuario recibe el mensaje correspondiente ("fue retirado, adjúntalo de nuevo" o "seguirá contando"). El borrado de evidencias usa `queue_and_delete_evidence` + retiro server-only confirmado.

## 32. Lister por versión (§21)

`listFileDocumentStoragePaths` (string[]) fue reemplazada por `listFileDocumentStorageObjects`: objetos completos `{bucketId, storagePath, sizeBytes, sourceType, sourceId}` con el tamaño DE CADA VERSIÓN, deduplicados por ruta conservando el mayor conocido, sizeBytes null = desconocido. La suite estructural prohíbe el regreso del string[].

## 33. Allowance con reservas (por qué pasó a DEFINER)

`check_module_resource_allowance` debe contar las reservas activas de TODOS los usuarios de la organización, pero la RLS de intents es creator-only: como invoker vería solo las propias. Pasó a SECURITY DEFINER con GATE explícito vía `resolve` (not_member ⇒ decisión verificada y negativa, igual que antes); para `(textiles, evidences)` usa `count_module_resource` (misma semántica del trigger); el resto sigue leyendo la vista, cuyo guard de membresía permanece efectivo (auth.uid() es el del invocante). Invariante equivalente al de T9F.2 — un no-miembro jamás obtiene decisión positiva ni conteos ajenos — fijado en la suite actualizada.

## 34. Mensajes de usuario (contractuales)

Nuevos: módulo no disponible para cargar; límite de evidencias con "las cargas en curso también cuentan"; sin capacidad con "las cargas en curso también comprometen espacio"; límites no verificables; importación "rechazada sin insertar ninguna fila"; archivo "retirado"/"seguirá contando". Todos en español, accionables, sin SQL ni códigos crudos (los códigos viajan en logs técnicos sin secretos).

## 35. Arnés SQL local T9F.3 (nuevo)

`scripts/t9f3-local-sql-harness/`: `shims-extra.sql` (auth.users, cuotas reales 50/500/5120 MB, intents 0094+0097, columnas de dominio, privilegios para `set role authenticated`), `smoke.sql` (32 comprobaciones OK/FAIL con resumen que aborta en rojo), `concurrency.sh` (3 carreras con sesiones psql simultáneas) y `run.sh` (base `t9f3local` recreada: shims T9F.2 → resolve real de 0100 → extras → 0101 → smoke). No sustituye a la suite RLS: valida la BARRERA y el ciclo contable, no el aislamiento.

## 36. Resultados REALES del smoke local (32/32 en verde)

A: primer registro entra, segundo `RESOURCE_LIMIT_EXCEEDED`, importación 2 filas revierte a 0, demo vencido y deshabilitado bloquean, Full ilimitado, tercer documento CPR bloqueado por `module_key`, no-miembro pasa al veredicto RLS. B: reserva de unidad y bytes, segundo begin rechazado, idempotencia (mismo intent), cuota con reservas (494+1+4 cabe; 494+5+2 no), vencimiento y cancelación liberan, desconocido bloquea, vista expone 494 MB/5 MB/1. C: finalize idempotente (una evidencia), revalida límite, contrato de tamaño, revalida acceso. D: borrado encola 3 objetos con SUS tamaños (50 MB siguen contando), deleted libera a 25 MB y delete_failed sigue, no-borrador rechazado, evidencia sin tamaño queda DESCONOCIDA, register/resolve vetados a authenticated, validaciones de bucket/prefijo, registro server-only válido. E: allowance cuenta reservas.

## 37. Resultados REALES de concurrencia local (3/3 en verde)

Carrera 1 (último proveedor permitido, dos psql simultáneos como authenticated): exits 0/1, 1 fila, 1 `RESOURCE_LIMIT_EXCEEDED`. Carrera 2 (dos begins, límite 1): 1 intent pendiente, 1 `EVIDENCE_LIMIT_EXCEEDED`. Carrera 3 (dos finalizes del MISMO intent): respuestas `[false] [true]`, 1 evidencia.

## 38. Arnés T9F.2 revalidado ÍNTEGRO contra la 0101 nueva

Smoke T9F.2 «TODO EN VERDE» y su concurrencia real en verde (asignación `[false] [true]`, Δ auditoría 1; destinos distintos Δ 2). Ajustes de fixture necesarios y documentados: el shim de versiones ganó la FK con cascade del esquema real (0057) y las rutas del smoke pasaron al prefijo UUID completo que exigen los CHECK canónicos nuevos; su README indica ahora que la 0101 acumulada requiere también los shims extra de T9F.3.

## 39. Suite unitaria/estructural T9F.3 (26 comprobaciones = los 48 ítems de §31)

`tests/unit/t9f3-atomic-limits-reservations-storage.test.ts`: matriz cerrada de 15 triggers; lock antes del conteo; INVOKER; importación atómica; count(*); not_member→RLS; guard de conteos; reservas (locks, aritmética exacta, condición única de reserva activa, idempotencia); finalize (orden de locks, revalidaciones, contrato estricto); intérprete puro (cero verificado, null/negativo); vista sin COALESCE, dedup, desconocidos, versiones, status<>'deleted'; register server-only + 5 validaciones + CHECKs; queue espejo de políticas; inspección total del ciclo TS; compensaciones §25; catálogo 50/500/5120 sin tocar planes; sin `organization_subscriptions` en decisiones; RPC T9F.2 intacta; existencia del arnés/reconciliación/suite RLS + scripts npm encadenados. Los ítems que exigen BD viva citan explícitamente los resultados reales del arnés.

## 40. Suite RLS T9F.3 (25 áreas de §32, PREPARADA)

`tests/rls/t9f3-atomic-limits-reservations-storage.test.ts` (`npm run test:t9f3-rls`): usuarios y organizaciones reales por el flujo real; INSERT directo hasta el límite y rechazo EXACTO; carrera con `Promise.all` (1 fila + 1 rechazo); aislamiento sigue siendo de la RLS; importación 4+2 sobre 5 revierte a 4; begins concurrentes (reserva exacta de 8 KB visible en la vista); cancelación y expiración liberan; **objeto REAL subido** y finalizes simultáneos (`false/true`, 8 KB confirmados); versiones FÍSICAS reales (45 KB deduplicados exactos); ciclo pending_delete con fallo SIMULADO (sigue contando; solo deleted libera a 25 KB); desconocido bloquea begin; register/resolve vetados con candidato intacto; separación CPR/Textiles a 0 cruces; Full/Extra ilimitados con cuotas exactas del catálogo; asignación concurrente con Δ auditoría 1. Todas las expectativas son concretas; ninguna acepta "no lanzó" ni "count ≥ 0".

## 41. Limpieza total verificada (área 25, §34)

Inventaría los objetos físicos del run ANTES de borrar filas; elimina objetos, cola, intents, evidencias, catálogo, documentos, plan/módulos, membresías, ORGANIZACIONES (la eliminación DEBE funcionar tras 0101 — un fallo es RESIDUO, no un aviso), personal de plataforma, perfiles y usuarios Auth; y VERIFICA cero organizaciones, cero usuarios, cero objetos (list por prefijo), cero intents y cero filas del run, con exit 1 si algo queda. Renombrar/neutralizar NO cuenta como limpieza. Los eventos de auditoría permanecen: inmutables, sin secretos, sin bloquear nada.

## 42. Suites RLS previas: fixtures a Extra (por qué)

0100 aprovisiona TODOS los módulos funcionales como **Demo temporal de 48 h** al crear una organización: los triggers nuevos habrían impuesto límites Demo a fixtures que no prueban límites. Isolation y las T9E1/T9E2/T9E4 elevan ahora sus organizaciones a `extra` (ilimitado) en el setup — cambio de fixture comentado en cada suite; ninguna aserción se debilitó. La T9F.1 no lo necesita (sus inserts ocurren bajo Full/demo dentro de límite); la T9F.2 conserva su caso begin 21 MB (`FILE_SIZE_INVALID`, orden preservado) y su caso 41 se ACTUALIZÓ al invariante más fuerte: el registro del miembro queda vetado (SERVER_ONLY) y el del servidor sigue contando (+2 MB exactos).

## 43. Limpiezas T9F.1/T9F.2 actualizadas

Tras 0101 la eliminación de organizaciones debe funcionar: en ambas suites la "neutralización" pasó de resultado aceptable a **residuo reportado que suma a `failed`** (la etiqueta queda solo como identificación de emergencia).

## 44. Suites previas actualizadas (sin debilitar) — detalle

t9f2 unit (28 ✔): importador → inserción masiva atómica (más fuerte); fila de uso con columnas nuevas; §20 → RPC de encolado + retiro server-only; «sin DELETE» → whitelist EXACTA de los 2 DELETE de dominio de §3; allowance → definer con gate (invariante equivalente demostrado); register → vetado a authenticated + grant service. t9f1 unit (35 ✔): misma whitelist. document-master: la compensación del reemplazo pasa a `registerAndRemoveUnreferencedObject` (server-only) conservando el orden RPC→compensación.

## 45. Cambios en TypeScript — inventario

**Nuevos:** `lib/db/storage-deletion.ts` (ciclo server-only), `scripts/t9f3-size-reconciliation/{reconcile.ts,README.md}`, `scripts/t9f3-local-sql-harness/{shims-extra.sql,smoke.sql,concurrency.sh,run.sh,README.md}`, `tests/unit/t9f3-…`, `tests/rls/t9f3-…`. **Modificados:** `lib/db/imports.ts` (builder puro + `insertBusinessRows`), `server/actions/imports.ts` (commit masivo atómico), `lib/db/module-usage-shared.ts` (+reservado/desconocidos), `server/actions/module-plans.ts` (unknown_sizes; disponible − reservas), `lib/db/trazadocs-master.ts` (`queueAndDeleteFileDocumentDraft`, `listFileDocumentStorageObjects`; retiro de la vía de sesión), `server/actions/trazadocs-master.ts` (§25 y §18), `server/actions/evidences.ts` (§25 y §18), `lib/db/textiles-evidences.ts` (RPC v2 + clave), `server/actions/textiles-evidences.ts` (mensajes de reserva), `package.json` (scripts), suites t9f1/t9f2/document-master, suites RLS isolation/T9E1/T9E2/T9E4/t9f1/t9f2, arnés t9f2 (shims/smoke/README). **Eliminados:** la función `deleteFileDocumentStorageObject` (sustituida por el ciclo server-only; ningún archivo eliminado).

## 46. Migración 0101 — inventario final (acumulada T9F.1+2+3)

§1 cola contable rediseñada; §2 register endurecido + resolve (server-only); §3 dos RPCs de encolado-y-borrado; §4 RPC de asignación T9F.2 sin cambios; §5 conteo autoritativo + trigger + 15 triggers; §6 idempotency_key + snapshot + begin v2 + delegador 0097 + finalize revalidado; §7 vista v3; §8 allowance definer con reservas; §9 FK de audit_log retirada; §10 índices (reservas activas; versiones por organización); §11 verificaciones documentadas. Sin TRUNCATE, sin DROP de funciones, sin backfill, sin tocar 0093–0100, sin crear 0102.

## 47. Por qué NO existe 0102 y por qué 0100 no se toca

0101 jamás fue aplicada: debe llegar a staging como UNA unidad coherente; separar T9F.3 en 0102 crearía un estado intermedio que el código no espera. 0100 sí está aplicada: es historia inmutable (hash fijado por prueba).

## 48. Seguridad — invariantes conservados y nuevos

Conservados: RLS dueña del aislamiento; Storage RLS 0093–0099 intactas; finalize server-only; metadata canónica inmutable; rutas construidas en servidor; auditoría inmutable fila a fila. Nuevos: límites inviolables desde cliente (triggers); reservas que impiden comprometer de más; registro/resolución físicos vetados a clientes; predicados de borrado espejados y citados; cola sin acceso de clientes; guard de conteos; compensaciones sin éxito silencioso.

## 49. Rendimiento

Advisory locks por (org, módulo, recurso): serialización SOLO dentro del mismo par — cero contención entre organizaciones. Conteos sobre índices existentes por organización + índice nuevo de reservas activas `(organization_id, status, expires_at)` e índice de versiones por organización. El trigger sale temprano para roles de servidor, módulos sin límite e ilimitados. La vista añade una CTE de reservas (agregación sobre el índice nuevo).

## 50. Validaciones locales ejecutadas (resultados REALES)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 (tras cada paso) |
| `npm run lint` | 0 errores, 1 warning preexistente (`domainSrc`) |
| `npm run test:t9f1` / `test:t9f2` / `test:t9f3` | 35 ✔ / 28 ✔ / 26 ✔ |
| `npm run test:all` (typecheck + lint + todas las suites) | **exit 0** |
| `npm run build` (producción) | **exit 0** |
| Arnés T9F.3 (`run.sh` + `concurrency.sh`) | smoke **32/32** + 3 carreras en verde |
| Arnés T9F.2 (contra la 0101 nueva) | smoke + concurrencia en verde |

`npm ci` no se ejecutó en esta fase (node_modules preexistente del entorno, idéntico al de T9F.2); queda anotado como no ejecutado.

## 51. Qué NO se hizo (y por qué)

No se aplicó 0101 (prohibido). No se ejecutaron las suites RLS (exigen staging con 0101). No se ejecutó la reconciliación (herramienta preparada; exige service role real). No se añadió límite a `team_members` u otros recursos org-globales (fuera del modelo por módulo; documentado desde T9F.2). No se amplían reservas ante tamaños reales mayores (decisión §18 — contrato estricto). No se migró la importación a RPC SQL (el statement multi-fila ya da la atomicidad exigida con menos superficie).

## 52. Riesgos residuales (honestos)

(1) **Orden de despliegue**: el código nuevo llama RPCs de 0101 (`queue_and_delete_*`, `begin_…_v2`, `resolve`); desplegarlo ANTES de aplicar 0101 deja borrados/creaciones de evidencias y begin **fallando cerrado** con error — nunca fallo abierto, pero sí indisponibilidad de esas operaciones: la guía ordena 0101 primero. (2) `service_role` y las funciones definer siguen pudiendo crear recursos sin trigger: es la frontera declarada cliente/servidor (finalize revalida por sí mismo); un futuro job de servidor que cree recursos limitados debe validar como finalize. (3) Los objetos `delete_failed` requieren operación (reintento server-only) — siguen contando mientras tanto, por diseño. (4) La reconciliación de desconocidos es manual por diseño. (5) Todo lo que exige PostgreSQL real queda pendiente de `npm run test:t9f3-rls` contra staging.

## 53. Orden de despliegue (crítico)

1) Aplicar 0101 (guía, con `db push --dry-run` antes). 2) Desplegar el código. 3) Ejecutar suites RLS (t9f3 + regresión t9f1/t9f2 + T9E). 4) Reconciliación en dry-run y decisión. El orden inverso es fail-closed pero indisponible (§52.1).

## 54. Rollback

Sin `db reset`, sin TRUNCATE, sin borrar datos. Restaurar las funciones reemplazadas desde sus archivos fuente (0097 begin, 0098 finalize, 0100 resolve/aprovisionamiento no se tocaron; allowance/vista/register desde la versión T9F.2 del archivo en el historial del repositorio); retirar triggers/funciones/vista nuevos SOLO tras revertir el código. **Antes de retirar la cola o los intents: verificar cero reservas activas y cero `pending_delete`/`delete_failed` sin resolver** — mientras existan, retirarlos regalaría almacenamiento fantasma. La FK de audit_log NO se recrea en rollback (recrearla exigiría que no existan eventos de organizaciones eliminadas; los datos históricos mandan).

## 55. Confirmaciones de la entrega

0101 preparada y NO aplicada; 0100 intacta (hash verificado en repo y ZIP); ninguna conexión a Supabase; sin commits/push/PR/deploys; suites RLS preparadas y NO ejecutadas; suites T9E no ejecutables desde aquí (exigen staging); barrido de secretos limpio; exclusiones del ZIP verificadas.

## 56. Definición de «hecho» de T9F.3 (estado)

Todo lo automatizable en este entorno está en verde con resultados reales; la autoridad de límites, las reservas, el ciclo de archivos y los desconocidos están implementados en BD y aplicación con una única semántica compartida; queda para el operador: aplicar 0101, desplegar, correr las suites RLS y decidir la reconciliación.

## 57. Cierre

T9F.3 convierte los dos riesgos residuales estructurales de T9F.2 (carrera conteo→INSERT y bypass directo) en imposibilidades verificadas con carreras reales, y deja el almacenamiento bajo una contabilidad sin puntos ciegos: reservado, confirmado, pendiente de retiro y desconocido — cada byte con dueño y cada estado con salida documentada.
