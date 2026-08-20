# QUALITY-01 · Matriz de pruebas

**Total propio del sprint: 98 comprobaciones** — 32 puras/estáticas, 56 contra base real, 10 por
HTTP con sesión real. Todas en verde, en LOCAL y en STAGING.

---

## 1. Las tres suites y por qué son tres

| Suite | Comando | Qué mira | Qué NO puede ver |
|---|---|---|---|
| Unitaria/estática | `npm run test:quality01` | Reglas puras, catálogo, convenciones de la migración, fronteras de capa | Si la base se comporta como se cree |
| RLS | `npm run test:quality01-rls` | Comportamiento real de la base: RLS, triggers, RPC, privilegios, consultas de lectura | Si la pantalla llega a pedir esos datos |
| Recorrido HTTP | `npm run test:quality01-ui` | La aplicación entera, con sesión real, contra el build de producción | — |

La tercera existe porque las dos primeras dejaban una franja ciega, y esa franja tenía un fallo
real dentro: la resolución del kill switch (§4). Ni el typecheck, ni el build, ni las 54
comprobaciones de RLS lo detectaron; solo pedir la página lo hizo.

**Requisitos.** Las suites 2 y 3 necesitan Supabase en marcha y `.env.local` apuntando a él; la 3
necesita además `npm run build` previo. Solo la 1 forma parte de `npm run test:all` (que no
levanta infraestructura).

---

## 2. Suite unitaria/estática — 32 comprobaciones

`tests/unit/quality-01-foundation.test.ts`

### Kill switch y catálogo (1–8)

| # | Comprobación |
|---|---|
| 1 | El switch está **apagado por defecto**; solo `"true"`/`"1"` lo encienden (`"TRUE"`, `" true"`, `"yes"` no) |
| 2 | La variable no lleva prefijo `NEXT_PUBLIC_` y no aparece en ninguno de los 4 componentes de cliente |
| 3 | **Todo** módulo del catálogo con switch se resuelve por su variable: enciende con la suya, apaga sin ella, **no** enciende con una ajena |
| 4 | La regla del switch es idéntica para todos los módulos |
| 5 | La capa de acceso ya no codifica a mano el nombre de cada variable (regresión de §4) |
| 6 | Quality es funcional, con clave `quality` y switch propio |
| 7 | El switch manda sobre la asignación, nunca al revés |
| 8 | Los cuatro estados de la tarjeta del selector |

### Registro del shell (9–11)

| # | Comprobación |
|---|---|
| 9 | `/quality` y sus subrutas activan Quality; **`/quality-x` no** (prefijo estricto, no subcadena); no roba rutas de Textiles; CPR sigue siendo el módulo por defecto |
| 10 | **Cada enlace del menú tiene una página que existe en disco** |
| 11 | CPR cierra el registro |

### Dominio puro (12–19)

| # | Comprobación |
|---|---|
| 12 | Las cuatro categorías base y su orden de lectura |
| 13 | **Vigencia**: el día de cierre pertenece ya a la versión siguiente; para cuatro fechas distintas hay **exactamente una** versión vigente |
| 14 | Solo `draft` es editable (`"DRAFT"` no cuela) |
| 15 | Publicar es de `admin`/`quality`; los cargos también |
| 16 | Un mapa vacío no se publica, y se explica por qué |
| 17 | El mapa agrupa por categoría en orden de lectura, **sin perder las categorías propias** de la empresa, sin bandas vacías |
| 18 | Una interacción se lee como salida desde el origen, como entrada desde el destino, y un tercero no la ve |
| 19 | Validación de nombres, códigos, UUID y fechas ISO antes de tocar la base |

### Fronteras de capa (20–25)

| # | Comprobación |
|---|---|
| 20 | El dominio es **puro**: sin BD, React, Next, `process.env` ni imports |
| 21 | La capa de datos es `server-only` y **no importa `createAdminClient`** |
| 22 | **Las 23 server actions** empiezan por la guarda del módulo y cortan si falla |
| 23 | Todo `organization_id` sale de la sesión; ningún tipo de entrada ni parámetro lo acepta del cliente |
| 24 | El kill switch se evalúa **antes** de exigir sesión, y responde 404 |
| 24b | El panel inverso en TrazaDocs vive **fuera** del namespace, así que comprueba el switch y la habilitación por su cuenta, y calla **en silencio** si no procede |
| 24c | Retirar un proceso es un cambio de estado, nunca un `delete`; exige rol de publicación; al reactivar mira si llegó a publicarse; no hay política de DELETE sobre procesos ni cargos |
| 25 | Todas las páginas de `/quality` son `force-dynamic` |

### Convenciones de 0112 (26–30)

| # | Comprobación |
|---|---|
| 26 | Append-only, sin prefijos duplicados, última migración = 112 |
| 27 | DML enumerado; **sin `GRANT ALL`**, sin `ALTER DEFAULT PRIVILEGES`; revoca `TRUNCATE`/`REFERENCES`/`TRIGGER`; `anon` sin nada |
| 28 | Las 11 tablas con RLS y `organization_id`; las 10 de datos con `unique (organization_id, id)`; el catálogo con sus dos índices parciales; vista con `security_invoker` |
| 29 | Las 4 RPC revocadas de `public`/`anon`, concedidas a `authenticated`, `SECURITY DEFINER` resolviendo con `auth.uid()`; `service_role` no aparece en la lógica |
| 30 | 0112 marca `quality` funcional y **no toca Construcción** |

> Las comprobaciones sobre SQL y TypeScript **eliminan los comentarios antes de buscar**: una
> prohibición se verifica sobre lo que se ejecuta, no sobre la prosa que explica esa prohibición.
> La primera versión de estas pruebas falló precisamente por eso.

---

## 3. Suite de RLS — 56 comprobaciones

`tests/rls/quality-01-process-foundation.test.ts` · contra base real, cuatro usuarios y dos
empresas. El `service_role` solo crea los usuarios; todo lo demás usa sesiones reales bajo RLS.

**Guarda de entorno.** La suite exige que la API y `SUPABASE_DB_URL` apunten al mismo proyecto y
aborta si no. Sin ella, apuntar la API a Staging y olvidar la variable hacía que las cinco
comprobaciones por SQL se ejecutaran contra la base local — dando un verde que no significaba
lo que parecía. Ocurrió durante este sprint.

### Módulo y catálogo (1–4)

| # | Comprobación |
|---|---|
| 1 | `modules.quality` es funcional y disponible |
| 2 | Una empresa **no puede autoasignarse** el módulo |
| 3 | Las cuatro categorías base existen y son visibles |
| 4 | El catálogo base es de solo lectura desde una empresa |

### Cargos (5–11)

| # | Comprobación |
|---|---|
| 5 | Admin crea un cargo |
| 6 | Un `consultant` **no** puede crear cargos |
| 7 | El nombre de cargo es único por empresa (sin distinguir mayúsculas) |
| 8 | Asignación con vigencia; la vigente no tiene fecha de fin |
| 9 | **No se puede asignar a alguien de otra empresa** |
| 10 | **Un solo titular vigente** por cargo |
| 11 | La vista resuelve quién ocupa el cargo |

### Procesos y revisiones (12–24)

| # | Comprobación |
|---|---|
| 12 | Un `consultant` crea un proceso con propietario = cargo; nace en borrador |
| 13 | **El propietario no puede ser un cargo de otra empresa** |
| 14 | La categoría debe existir en el catálogo |
| 15 | Abrir revisión es **idempotente** |
| 16 | Se edita el propósito y el alcance del borrador |
| 17 | Se registran entradas y salidas estructuradas |
| 18 | Un `consultant` **no** puede publicar |
| 19 | `quality` publica; el proceso queda activo con `current_revision = 1` |
| 20 | **Una revisión publicada es inmutable** (se comprueba el estado, no el error) |
| 21 | **No se añaden entradas a una revisión publicada** |
| 22 | La nueva revisión **copia** propósito y las 2 entradas/salidas vigentes, y nace en borrador |
| 23 | Publicar la 2 cierra la vigencia de la 1 y la marca `superseded` |
| 24 | **Se puede responder qué revisión regía el 15/02** — exactamente una |

### Interacciones (25–27)

| # | Comprobación |
|---|---|
| 25 | Interacción estructurada entre dos procesos, con salida y entrada concretas |
| 26 | Un proceso **no puede relacionarse consigo mismo** |
| 27 | **La salida referenciada debe pertenecer al proceso origen** |

### Mapa (28–36)

| # | Comprobación |
|---|---|
| 28 | Crear mapa y abrir su primera versión |
| 29 | Colocar procesos por categoría |
| 30 | Un proceso **no se repite** en la misma versión |
| 31 | Un `consultant` **no** puede publicar el mapa |
| 32 | Publicar deja la versión vigente, con fecha de publicación |
| 33 | **Una versión publicada no se edita** |
| 34 | **No se añaden nodos a una versión publicada**; conserva sus 2 |
| 35 | **No se publica un mapa vacío** |
| 36 | La nueva versión **hereda** los 2 nodos |

### TrazaDocs (37–39)

| # | Comprobación |
|---|---|
| 37 | Se asocia un documento **existente** |
| 38 | **No se puede asociar un documento de otra empresa** |
| 39 | Asociar **no duplica** el documento (T-03) |

### Aislamiento (40–43)

| # | Comprobación |
|---|---|
| 40 | B no lee **ninguna** fila de las 10 tablas de datos de A |
| 41 | B no puede escribir en A |
| 42 | B no puede publicar una revisión de A **ni con la RPC** |
| 43 | La vista aísla por empresa |

### Capa de lectura — los embeds de PostgREST (44–49)

Las relaciones de Quality usan FK **compuestas**. Un embed sin la pista del constraint queda
ambiguo o es rechazado, y eso **no lo detecta ni el typecheck ni el build**: revienta al abrir la
pantalla. Estas comprobaciones ejecutan literalmente las cadenas `select` de
`lib/db/quality-processes.ts`.

| # | Comprobación |
|---|---|
| 44 | Procesos con el cargo propietario incrustado |
| 45 | Interacciones con origen y destino: **dos FK a la misma tabla** |
| 46 | Asignaciones con la persona correcta — `profile_id`, **no `created_by`** (ambas apuntan a `profiles`) |
| 47 | Documentos con el documento de TrazaDocs incrustado |
| 48 | Nodos del mapa con proceso y cargo: **embed en dos niveles** |
| 48b | **Lectura inversa**: qué procesos usan un documento de TrazaDocs; B no ve esa relación aunque conozca el identificador |
| 48c | **Retirar un proceso conserva sus revisiones**: mismo recuento, la vigente sigue consultable, y se puede devolver al servicio |
| 49 | Miembros con su perfil |

### Invariantes de esquema, por SQL directo (50–54)

| # | Comprobación | Esperado |
|---|---|---|
| 50 | Las 11 tablas con RLS | 11 / 0 sin RLS |
| 51 | Privilegios de `anon` | 0 |
| 52 | `TRUNCATE`/`REFERENCES`/`TRIGGER` de rol cliente | 0 |
| 53 | Tablas sin `organization_id` | 0 |
| 54 | FK compuestas | ≥ 8 (hay 19) |

---

## 4. Recorrido HTTP — 10 comprobaciones

`tests/e2e/quality-01-walkthrough.test.ts` · levanta **dos** servidores del build de producción
(switch encendido y apagado), monta el estado con la sesión real de un usuario y **pide las
páginas** comprobando que el HTML contiene los datos reales.

| # | Comprobación |
|---|---|
| 1 | `/quality` abre y **cuenta el estado real** de la empresa |
| 2 | `/quality/positions` muestra el cargo y su titular vigente |
| 3 | `/quality/processes` lista los procesos con su cargo propietario y la categoría traducida |
| 4 | El detalle reúne propósito, entrada, salida, relaciones y el documento asociado |
| 5 | `/quality/map` agrupa por categoría y ofrece publicar |
| 6 | Publicado: dice "versión oficial", **deja de ofrecer "guardar borrador"** y ofrece abrir una revisión nueva |
| 7 | Mapa publicado: **deja de ofrecer quitar o añadir bloques** |
| 8 | Otra empresa ve su estado vacío; la **URL exacta** de un proceso ajeno da **404** |
| 9 | Sin sesión, `/quality` no entrega contenido |
| 10 | **Switch apagado: las 4 rutas dan 404** con sesión válida, y `/dashboard` sigue en 200 |

Las comprobaciones 6 y 7 verifican **ausencia** de acciones imposibles, no solo presencia de
texto: una interfaz que siguiera ofreciendo "guardar borrador" sobre una versión publicada
pasaría una prueba de presencia y fallaría ésta.

**Autodiagnóstico.** La cookie de sesión es lo único que la prueba fabrica; si no autentica,
todo redirigiría a `/login` y parecería un fallo de la aplicación. Una comprobación previa lo
detecta y da un mensaje claro. También ocurrió durante este sprint.

---

## 5. Resultados

| Suite | LOCAL | STAGING |
|---|---|---|
| `test:quality01` (32) | ✅ 32/32 | n/a (estática) |
| `test:quality01-rls` (56) | ✅ 56/56 | ✅ **56/56** |
| `test:quality01-ui` (10) | ✅ 10/10 | ✅ **10/10** |

La ejecución contra Staging del recorrido HTTP exigió reconstruir con el entorno de Staging: las
variables `NEXT_PUBLIC_*` se incrustan en tiempo de build. El build local se restauró después y
se reverificó.

---

## 6. Regresión de la plataforma

`npm run test:all` (**~1.400 comprobaciones**, 80 suites) → **exit 0**.
`npm run typecheck` → limpio. `npm run lint` → 0 errores (1 aviso preexistente, ajeno).
`npm run build` → compila; las 5 rutas de Quality salen dinámicas (`ƒ`), ninguna prerenderizada.

Suites de RLS con base real:

| Suite | Resultado |
|---|---|
| `test:rls` (aislamiento general) | ✅ 110/110 |
| `test:t9f-rls`, `t9f1-rls`, `t9f2-rls`, `t9f4-rls` | ✅ |
| `test:textiles-rls-multitenant`, `t9e2`, `t9e4` | ✅ |

### Pruebas actualizadas y por qué

Ninguna se debilitó. En cada caso se sustituyó una afirmación que había dejado de ser cierta por
la afirmación equivalente sobre el estado nuevo, conservando o reforzando lo que la prueba
protegía.

| Prueba | Antes | Ahora |
|---|---|---|
| `launch` 21 | 2 `coming_soon`, 2 funcionales | 1 y 3, **más** la exigencia de que Quality declare kill switch |
| `launch` 22 | No debe existir `app/(app)/(shell)/quality` | Quality **debe** tener su layout con guard, y **ninguna** ruta fuera del shell |
| `t9f-module-access` 15–18 | Quality no funcional; solo Textiles con switch | Quality funcional; **ambos** switches, **y ninguno con prefijo público** |
| `t9f-module-access` 17 | El espejo en BD solo miraba 0100 | Mira 0100 **y** 0112 |
| `t9f1` 8 | Lista de segmentos del shell | Añade `quality`, **y exige que cada namespace aplique su guard** |
| `t9f1` 63 | `quality` no operable | `quality` operable; se añade el código vacío como no operable |
| `t9f1-rls` 21–22 | Quality y Construcción no asignables | Construcción y un código inventado no asignables; Quality **sí** |
| `t9f2-rls` 51–52 | Ejemplo de no funcional: `quality` | Ejemplo: `construccion`. Misma regla |
| `t9f-rls` 4 | Quality no se asigna al registrarse | **Sí** se asigna (es funcional); Construcción no |
| `t9f-rls` 21 | Superadmin no puede habilitar Quality | Sí puede, y queda en `full` |
| `t9g-spanish` 10 | Quality «Próximamente» | Solo Construcción; Quality asignable |
| `v1-release` 6, 52, 81 | Quality `coming_soon` | Quality funcional **pero no lanzado**: la portada lo sigue mostrando «Próximamente», que es cierto |
| `textiles-module-selector` 7 | Buscaba `isTextilesModuleEnabled()` literal | Busca el resolutor genérico, **más** la declaración del switch en el catálogo |
| 16 listas de migraciones | Anclajes a 0110/0111 | Declaración única `QUALITY_01_ALLOWED`, con 0111 y 0112 |

> **Hallazgo aparte.** Tres aserciones de `v1-release` («la última migración debe ser 0110»)
> **ya fallaban en la base de la rama** (`ef09356`): 0111 se commiteó sin actualizarlas.
> Verificado ejecutando la suite en un worktree de ese commit. Corregido de paso, sustituyendo el
> número fijo por la lista declarada.

### Dos fallos ajenos, no tocados

| Suite | Situación |
|---|---|
| `test:t9f3-rls` | Las 16 comprobaciones pasan; fallan **2 residuos de limpieza** al no poder borrar un usuario de una organización que la propia suite conserva a propósito. **Reproducido idéntico en `ef09356`.** |
| `test:rls` 80–81 | Verde desde base limpia. Al repetir sobre la misma base chocan con un token de invitación **literal** (`s10a-old-invite-token`, línea 2642), previo y ajeno a Quality. |

Ninguno se modificó: corregirlos habría sido tocar código fuera del alcance de este sprint.
