# Q0_3_LOCAL_ENVIRONMENT_IMPLEMENTATION

**Sprint:** Q0.3 — Environment Safety Implementation · **Fase A** (seguridad local + Supabase local)
**Fecha:** 2026-08-18
**Veredicto:** **LOCAL NOT READY** — bloqueado por una causa externa al repositorio (§10)

**Decisiones cerradas aplicadas:** DR-15 (PostgreSQL 17 local, CLI 2.114.0 sin actualizar) ·
DR-16 (no renombrar variables heredadas) · DR-17 (CI/CD pospuesto) · DR-19 (toda promoción a
Production exige aprobación humana explícita).

---

## Resumen en una línea

**El objetivo de seguridad se cumplió y persiste** —el repositorio ya no tiene Production como
destino implícito del CLI—, pero **el entorno local no pudo levantarse** porque el disco del host
está al 100 % de capacidad y Docker no puede escribir sus imágenes.

| Paso | Estado |
|---|---|
| 0 · Precheck | ✅ Completado |
| 1 · Unlink | ✅ **Completado y verificado** |
| 2 · `config.toml` | ✅ Completado (aprobado antes de escribir) |
| 3 · Variables locales | ⏸️ **No ejecutado** — depende de las claves que emite `supabase start` |
| 4 · Supabase local | ❌ **BLOQUEADO** — disco lleno |
| 5 · Storage | ❌ No alcanzado |
| 6 · Auth y superadmin | ❌ No alcanzado |
| 7 · Seed | ❌ No alcanzado |
| 8 · Smoke | ❌ No alcanzado |
| 9 · Pruebas | ⚠️ Parcial — solo lo que no requiere base |

---

## 1. Estado inicial

| Elemento | Valor verificado |
|---|---|
| Rama | `hotfix/auth-01-password-recovery` |
| `git status` | Limpio salvo la documentación Q0 sin registrar |
| Supabase CLI | 2.114.0 (**no actualizado**, conforme a DR-15) |
| Docker | Servidor 29.6.2, demonio activo, 0 contenedores |
| Contenedores Supabase previos | Ninguno |
| **Project ref vinculado** | **`mvmpadeixomwkpxbnhky` · `trazaloop-production`** ✅ confirmado |

El precheck confirmó lo que el encargo exigía comprobar: el repositorio seguía vinculado a
Production.

---

## 2. Unlink — completado y verificado

Antes de desvincular se copió `supabase/.temp/` completo al scratchpad de la sesión (fuera del
repositorio), de modo que el vínculo es reconstruible. Su contenido, además, ya estaba documentado
en `Q0_1_REMOTE_VERIFICATION.md` §1.

```text
$ supabase unlink
Unlinking project: mvmpadeixomwkpxbnhky
{"project_ref":"mvmpadeixomwkpxbnhky","message":""}
exit=0
```

`supabase/.temp/` fue **eliminado por completo**.

### Verificación de que Production ya no es destino implícito

Se probaron dos comandos que exigen proyecto remoto. Ambos fallan ahora, que es exactamente el
comportamiento buscado:

```text
$ supabase migration list --linked
{"code":"LegacyProjectNotLinkedError","message":"Cannot find project ref. Have you run supabase link?"}

$ supabase db push --dry-run
{"code":"LegacyProjectNotLinkedError","message":"Cannot find project ref. Have you run supabase link?"}
```

**Este es el resultado más valioso del sprint, y es persistente**: sobrevive al bloqueo posterior.
Antes de Q0.3, un `supabase db push` escrito por costumbre impactaba la base de clientes sin
preguntar. Ahora falla por falta de destino y obliga a un `--project-ref` explícito.

**No se volvió a enlazar Production**, ni se enlazó ningún otro proyecto.

---

## 3. Configuración local — `supabase/config.toml`

Creado tras mostrar el contenido y recibir aprobación explícita.

Para redactarlo con fidelidad a las convenciones del CLI 2.114.0 se generó la plantilla oficial
con `supabase init` **en un directorio temporal fuera del repositorio**, y se adaptó. Eso permitió
detectar y corregir dos errores de mi propuesta original en Q0.2:

| Corrección | Detalle |
|---|---|
| `[inbucket]` → `[local_smtp]` | El CLI 2.114.0 renombró la sección. Lo que propuse en Q0.2 §4.3 no habría funcionado. |
| `major_version = 17` | Ya es el **valor por defecto** de la plantilla; DR-15 se satisface sin forzar nada. |

Y tomar dos decisiones deliberadas, ambas aprobadas:

| Decisión | Motivo |
|---|---|
| `[db.seed] enabled = false` | La plantilla trae `enabled = true` con `sql_paths = ["./seed.sql"]`, archivo que **no existe** en este repositorio. El mecanismo de semilla del proyecto es `scripts/seed-demo.ts`. Dejarlo activo apuntando a un archivo inexistente invitaría a crear un segundo sistema de seed, expresamente prohibido. |
| `storage` fuera de `[api].schemas` | Q0.2 lo proponía; se descartó. La aplicación accede a Storage por su propia API y por SQL directo, nunca por PostgREST. Exponer el esquema ampliaría superficie sin ganancia. |

**Identidad local:** `project_id = "trazaloop-local"`. El ref de Production **no aparece** en el
archivo, y el archivo **no vincula** ningún proyecto remoto. No contiene secretos: las claves
locales las emite `supabase start` en cada arranque.

`supabase/config.toml` **no** está en `.gitignore`, así que se versionará y lo compartirá el
equipo. Es lo deseable para que el entorno local sea reproducible.

---

## 4. Reconstrucción de migraciones — NO ALCANZADA

`supabase db reset` **nunca llegó a ejecutarse**. El stack no arrancó (§10), así que **las 102
migraciones no han sido validadas en local**.

Queda pendiente demostrar que `0001`–`0006` y `0015`–`0110` reconstruyen la base desde cero.

**Ninguna migración histórica fue modificada.** Tampoco había motivo: el fallo se produjo antes de
que ninguna llegara a ejecutarse.

---

## 5. Auth local — NO ALCANZADO

Configurado en `config.toml` pero sin verificar en ejecución:

- `site_url = "http://localhost:3000"` y cuatro `additional_redirect_urls` (localhost y 127.0.0.1,
  exactas y con comodín).
- `[auth.email] enable_confirmations = false` — **diferencia deliberada** con Production, donde
  debe estar habilitada porque Trazaloop no implementa confirmación de correo propia.
- `[local_smtp]` en el puerto 54324 para capturar el correo local.

El primer superadministrador **no se creó**. El SQL correspondiente no llegó a proponerse porque
requiere una base en funcionamiento; queda para la reanudación, y se someterá a aprobación antes
de ejecutarse, solo contra local.

---

## 6. Storage local — NO ALCANZADO

Sin verificar en ejecución. Lo ya establecido documentalmente y que sigue vigente: los **tres
buckets los crean las migraciones** —`evidences` (0015), `organization-assets` (0049),
`trazadocs-documents` (0058)— por lo que **no procede crearlos manualmente**. `config.toml` fija
`[storage] file_size_limit = "50MiB"`.

---

## 7. Seed — NO ALCANZADO

No ejecutado. Se usará `scripts/seed-demo.ts`, el mecanismo existente, tal como exige el encargo.
**No se creó ningún segundo sistema de seed**; de hecho `[db.seed]` se desactivó precisamente para
evitar que apareciera uno por la puerta de atrás.

---

## 8. Smoke — NO ALCANZADO

`scripts/smoke-staging.ts` (vía `npm run test:smoke`) no se ejecutó: requiere una base viva.

---

## 9. Pruebas

Solo pudo ejecutarse lo que no depende de base de datos:

| Prueba | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ **Sin errores** (ejecutado en Q0; sin cambios de código desde entonces) |
| `npm run test:smoke` | ❌ No ejecutable sin base |
| `npm run test:rls` | ❌ No ejecutable sin base |
| Suites unitarias | ⏸️ No ejecutadas — se reservan para cuando el entorno esté completo y su resultado sea interpretable |

**No se corrigió ningún fallo automáticamente.** No apareció ninguna regresión que documentar,
porque no se modificó código de producto: los únicos cambios son `supabase/config.toml` (nuevo) y
la eliminación del vínculo del CLI.

---

## 10. Problemas encontrados

### P-1 · BLOQUEANTE — El disco del host está al 100 %

`supabase start` falló al descargar **todas** las imágenes. El error se repite idéntico en cada
una:

```text
Error response from daemon: write
/var/lib/desktop-containerd/daemon/io.containerd.metadata.v1.bolt/meta.db:
input/output error
```

**Causa raíz:**

```text
Filesystem      Size    Used   Avail Capacity   Mounted on
/dev/disk3s5   228Gi   174Gi   912Mi   100%     /System/Volumes/Data
```

**912 MiB libres de 228 GiB.** El `input/output error` contra la base de metadatos de containerd
es el síntoma característico de disco agotado, no de corrupción. Coherente con ello,
`docker system df` se quedó colgado y hubo que abortarlo por tiempo: el demonio está atascado
intentando escribir donde no cabe.

Como factor secundario, uno de los intentos recibió además `Rate exceeded` de `public.ecr.aws`,
pero es ruido: los reintentos contra `ghcr.io` y Docker Hub fallaron todos por el mismo problema
de escritura.

**Diagnóstico: causa externa al repositorio.** No es un defecto de Trazaloop, de las migraciones,
del `config.toml` ni del CLI. Un `supabase start` en la misma configuración sobre una máquina con
espacio libre debería funcionar.

**No intenté liberar espacio.** Borrar archivos o purgar cachés de Docker es una acción
destructiva sobre tu sistema, fuera del alcance de este sprint y con datos tuyos de por medio. Es
tu decisión.

**Estado tras el fallo:** no quedaron contenedores de Supabase a medias (`docker ps -a` no
devuelve ninguno), así que no hay nada que limpiar.

### P-2 · El entorno de desarrollo sigue sin funcionar (sin regresión)

`.env.local` **no fue modificado** —conserva su fecha del 16 de agosto— porque el paso 3 depende
de las claves que emite `supabase start`, que nunca llegó a emitirlas. Sigue apuntando al proyecto
retirado `dtrxxqmdweykzncfmahc`.

Conviene ser preciso sobre el balance: el desarrollo local **ya estaba roto antes** de este sprint
(hallazgo de Q0.1). El unlink no lo rompió; retiró una capacidad peligrosa. La situación es
**estrictamente mejor en seguridad e igual en funcionalidad**.

### P-3 · Sin acceso remoto de lectura desde el CLI

Consecuencia esperada y aceptada del unlink: los comandos `--linked` que se usaron en Q0.1 ya no
funcionan. Cualquier lectura remota futura requerirá `--project-ref` explícito, que es
precisamente el comportamiento buscado.

---

## 11. Diferencias local / Production

Las deliberadas, ya fijadas en `config.toml`:

| Aspecto | Local (configurado) | Production (verificado en Q0.1) |
|---|---|---|
| Identidad del proyecto | `trazaloop-local` | `mvmpadeixomwkpxbnhky` |
| PostgreSQL | 17 (`major_version`) | 17.6.1.147 |
| Confirmación de correo | **Deshabilitada** | **Habilitada** (obligatoria) |
| Correo saliente | Capturado en `local_smtp` :54324 | Proveedor real |
| `site_url` | `http://localhost:3000` | Dominio real |
| Semilla SQL | `[db.seed]` desactivado | No aplica |
| Registro público | Se activará en `.env.local` | `false` en el hito técnico |
| Distintivo de ambiente | "Entorno local" | Ninguno |
| Datos | Sintéticos (pendiente) | Reales |

**Diferencia de comportamiento aún sin verificar** y que sigue siendo el argumento central para
que staging exista (Q0.2 §4.5): las migraciones que crean políticas sobre `storage.objects`
—0016, 0049, 0058, 0076, 0099, 0101— se ejecutan en local como superusuario, mientras que en
Supabase gestionado el esquema `storage` pertenece al proveedor. Las propias migraciones 0099 y
0101 documentan que allí `comment on policy` falla con `must be owner of relation objects`. Un
`db reset` limpio en local **no demostraría** que la migración pase en un proyecto gestionado.

---

## 12. `git status` final

```text
?? docs/architecture/
?? docs/quality/
?? supabase/config.toml
```

Sin archivos modificados, borrados ni en stage. **Sin commits, sin push.**

Cambios netos de este sprint:

| Cambio | Naturaleza |
|---|---|
| `supabase/config.toml` | **Nuevo** — versionable |
| `docs/quality/q0/Q0_3_LOCAL_ENVIRONMENT_IMPLEMENTATION.md` | **Nuevo** — este documento |
| `supabase/.temp/` eliminado | Estado local del CLI; estaba en `.gitignore`, no aparece en `git status` |
| `.env.local` | **Sin tocar** |
| Código de producto, migraciones, Vercel, Production | **Sin tocar** |

---

## 13. Veredicto

### **LOCAL NOT READY**

El entorno local **no** puede sustituir hoy a Production para desarrollo, porque no ha llegado a
existir. Los objetivos 1 y 2 de la fase se cumplieron; los objetivos 3 a 7 quedan pendientes.

| # | Objetivo de la fase | Estado |
|---|---|---|
| 1 | Eliminar el vínculo CLI con Production | ✅ **Cumplido y verificado** |
| 2 | Configuración Supabase local reproducible | ✅ **Cumplido** (sin validar en ejecución) |
| 3 | Levantar Supabase local | ❌ Bloqueado por P-1 |
| 4 | Aplicar las 102 migraciones desde cero | ❌ No alcanzado |
| 5 | Datos mínimos para smoke | ❌ No alcanzado |
| 6 | Ejecutar smoke local | ❌ No alcanzado |
| 7 | Desarrollo local sin Production | ❌ No alcanzado |

---

## 14. Reanudación

Un único requisito externo desbloquea todo lo demás.

**Prerrequisito:** liberar espacio en `/System/Volumes/Data`. Recomendable **≥ 20 GiB** libres: el
stack de Supabase descarga alrededor de 10 imágenes (postgres, kong, gotrue, storage-api, realtime,
studio, postgres-meta, edge-runtime, logflare, vector, mailpit). Es una acción tuya; no la ejecuté.

Verificación previa a reanudar:

```bash
df -h /System/Volumes/Data     # ≥ 20 GiB disponibles
docker system df               # debe responder sin colgarse
```

Secuencia de reanudación, desde el paso 4 (el 0–2 ya está hecho y no debe repetirse):

```bash
supabase start                 # emite las claves locales
supabase db reset              # aplica las 102 migraciones
# → paso 3: escribir .env.local con las claves locales (aprobado ya, con copia previa)
npm run precheck:env
npm run test:smoke
# → paso 6: proponer el SQL del primer superadministrador y pedir aprobación
```

Si `supabase db reset` falla en alguna migración, **detenerse** y documentar migración, error,
causa probable y diferencia local/gestionado, sin modificar la migración histórica.

---

## 15. Decisiones requeridas

| ID | Decisión |
|---|---|
| **DR-20** | **NUEVA.** Liberar espacio en disco del host (≥ 20 GiB). Es la única acción que desbloquea la Fase A. Requiere decisión y ejecución humanas: no toco archivos del sistema. |
| **DR-21** | **NUEVA.** ¿Se registra `supabase/config.toml` en Git en este momento, o se espera a validarlo con un `supabase start` real? Recomendación: **esperar**, para no versionar una configuración nunca ejecutada. |
| **DR-14** | Sin cambios: la creación de Staging sigue **fuera de alcance** de esta fase y no se ha iniciado. |
| **DR-02** | Sin cambios: pendiente la verificación manual del panel de Vercel. |
| **DR-03 … DR-13, DR-18** | Sin cambios. |

---

## 16. Confirmación de restricciones

- **Cero** `supabase link` a Production — y el vínculo previo fue **eliminado**.
- **Cero** `db push`, `migration repair`, SQL remoto, deploy.
- **Cero** cambios en Vercel, variables de Production, Storage de Production, Auth de Production.
- **Cero** creación de Staging.
- **Cero** esquema, migraciones o código de Quality.
- **Cero** commits, **cero** push.
- **Cero** migraciones históricas modificadas.
- **Cero** archivos del sistema borrados para liberar espacio.
- Las dos acciones que exigían aprobación previa (`config.toml` y `.env.local`) se sometieron a
  aprobación; la primera se ejecutó tras aprobarse y la segunda quedó bloqueada antes de tocar el
  archivo.

---

## Resume after disk-space remediation

**Fecha del intento:** 2026-08-18 · **Resultado: DETENIDO EN EL PASO 4A.**
**El registro de la primera ejecución fallida se conserva íntegro más arriba.** Esta sección
documenta el intento de reanudación, no lo sustituye.

### Espacio disponible al reanudar

```text
Filesystem      Size    Used   Avail Capacity   Mounted on
/dev/disk3s5   228Gi   173Gi   6.7Gi    97%     /System/Volumes/Data
```

| Medición | Valor |
|---|---|
| Libre en el intento anterior | ~929 MiB |
| Libre ahora | **6.7 GiB** |
| Liberado | ~5.8 GiB |
| Umbral de parada (regla del encargo) | **< 15 GiB → DETENERSE** |
| Umbral de advertencia | 15–20 GiB → pedir aprobación |
| Umbral de continuación | ≥ 20 GiB |
| Déficit para alcanzar 15 GiB | **~8.3 GiB** |
| Déficit para alcanzar 20 GiB | ~13.3 GiB |

**6.7 GiB < 15 GiB**, de modo que la regla obliga a detenerse antes de tocar Docker o Supabase.

### Acciones ejecutadas en este intento

Una sola, de lectura:

```bash
df -h /System/Volumes/Data
```

### Acciones NO ejecutadas

- `supabase start` — **no ejecutado** (paso 4C no alcanzado)
- `supabase db reset` — no ejecutado
- Cualquier comando de Docker — **no ejecutado**
- `docker prune`, limpieza de imágenes o cachés — **no ejecutado**
- Borrado de archivos para liberar espacio — **no ejecutado**
- `.env.local` — **sigue sin modificarse**
- Superadministrador, seed, smoke, tests con base — no alcanzados

### Por qué el umbral es razonable

El stack local descarga alrededor de diez imágenes (postgres 17, kong, gotrue, storage-api,
realtime, studio, postgres-meta, edge-runtime, logflare, vector, mailpit). Descomprimidas ocupan
bastante más que su tamaño de descarga, y a eso se suma el volumen de datos de PostgreSQL que crea
`db reset` al aplicar las 102 migraciones.

Con 6.7 GiB el intento tiene alta probabilidad de reproducir exactamente el fallo anterior
—`input/output error` contra la base de metadatos de containerd— y de dejar además capas
parcialmente descargadas que consumirían el poco espacio restante. Detenerse es más barato que
fallar a medias.

### Estado del repositorio tras el intento

Sin cambios respecto al cierre de la primera ejecución: `supabase/config.toml` creado, vínculo a
Production eliminado, `.env.local` intacto, sin commits.

### Veredicto tras la reanudación

**LOCAL NOT READY** — sin cambios. El bloqueo sigue siendo **DR-20** (espacio en disco), ahora
parcialmente atendido pero todavía insuficiente.

### Segundo intento de reanudación — también detenido en 4A

**Resultado: DETENIDO EN EL PASO 4A por segunda vez.**

| Medición | Valor |
|---|---|
| Libre (1.ª ejecución) | ~929 MiB |
| Libre (1.er intento de reanudación) | 6.7 GiB |
| **Libre (2.º intento de reanudación)** | **13.95 GiB** (14.626.488 bloques de 1K) |
| Liberado en total | ~13 GiB |
| Umbral de parada | **< 15 GiB → DETENERSE** |
| Déficit | **1.05 GiB** |

Al estar la cifra en la frontera se midió con precisión (`df -k`) en lugar de confiar en el
redondeo de `df -h`, que mostraba «14Gi». El resultado —13.95 GiB— está genuinamente por debajo
del umbral, no es un artefacto de presentación.

**Acciones ejecutadas:** únicamente `df -h` y `df -k`. Ningún comando de Docker o Supabase.
Ningún borrado, ninguna limpieza, ningún `prune`.

**Estado del repositorio:** sin cambios. `supabase/config.toml` creado, vínculo a Production
eliminado, `.env.local` intacto, sin commits.

**Veredicto:** **LOCAL NOT READY** — sin cambios. Bloqueo **DR-20**, ahora a 1.05 GiB de
resolverse.


---

## Resume after disk-space remediation — TERCER INTENTO (completado)

**Fecha:** 2026-08-18 · **Resultado: entorno local LEVANTADO.**
Los registros de la ejecución fallida y de los dos intentos anteriores se conservan íntegros más
arriba. Esta sección documenta la ejecución que sí completó los pasos 4C a 12.

### Espacio disponible al reanudar

| Momento | Libre |
|---|---|
| 1.ª ejecución (fallo) | ~929 MiB |
| 1.er intento de reanudación (detenido) | 6.7 GiB |
| 2.º intento (detenido) | 13.95 GiB |
| **3.er intento (inicio)** | **17.52 GiB** → banda 15–20, aprobación solicitada y concedida |
| Tras reiniciar Docker | 19.97 GiB |

### Segundo bloqueador descubierto: Docker degradado

Antes de arrancar se detectó que Docker respondía a llamadas triviales (`docker ps`) pero **se
colgaba en todo lo que tocaba el almacén de imágenes** (`docker image ls`, `docker info`,
`docker version` con versión de servidor vacía). Compatible con daño en la base de metadatos de
containerd tras el evento de disco lleno: liberar espacio era necesario pero **no suficiente**.

Reinicio ejecutado con autorización explícita, escalando por pasos: cierre ordenado (ignorado) →
SIGTERM (ignorado por el proceso principal) → **SIGKILL** (autorizado) → relanzamiento. Tras el
reinicio: servidor 29.6.2, `image ls` responde, `docker pull` real funciona. **No se borró ninguna
imagen ni volumen.**

### `supabase start` — correcto

PostgreSQL local **17.6** (Production: 17.6.1.147). 12 contenedores sanos. Servicios: API 54321,
BD 54322, Studio 54323, correo 54324. Las credenciales locales **no se han reproducido en la
conversación**.

### `db reset` — las 102 migraciones reconstruyen la base

Ejecutado **dos veces** (una tras el arranque, otra sobre base limpia para obtener una línea base
fiable de pruebas). Confirmaciones previas en ambas: sin vínculo a Production, destino local, sin
`--project-ref`. Salida: `{"target":"local"}`.

**Ninguna migración falló. Ninguna migración histórica fue modificada.**

### Paridad con Production — exacta

| Objeto | Local | Production (Q0.1) |
|---|---|---|
| Migraciones | 102 | 102 |
| Tablas `public` | 87 | 87 |
| Vistas | 33 | 33 |
| Funciones | 146 | 146 |
| Triggers | 295 | 295 |
| Políticas `public` | 253 | 253 |
| Tablas sin RLS | 0 | 0 |
| Buckets (privados) | 3 | 3 |
| Políticas `storage.objects` | 9 | 9 |

**El riesgo señalado en Q0.2 §4.5 no se materializó:** las políticas sobre `storage.objects` se
aplicaron en local con los mismos nombres y operaciones que en el proyecto gestionado.

### HALLAZGO MAYOR — las migraciones no conceden privilegios de tabla

Al ejecutar el seed apareció `42501 permission denied for table memberships` para el rol
`authenticated`. **No era RLS: eran GRANT de tabla ausentes.**

| | Production | Local recién creado |
|---|---|---|
| Objetos con GRANT a `authenticated` | **118** | **10** (solo vistas) |
| Concedidos por alguna migración | **Ninguno** | Las 10, por `grant` explícito en 0041/0052/0055/0059/0062 |

Production tiene 119 sentencias `GRANT ... TO authenticated` en su esquema que **ninguna migración
crea**: provienen del *bootstrap* del proyecto Supabase, permisivo cuando se creó. Un stack nuevo
con el CLI actual concede a `anon`/`authenticated` solo `Dxtm` por defecto, sin SELECT ni
escritura.

Prueba concluyente de que las migraciones **asumen** esos privilegios: la migración 0028 ejecuta
`revoke insert, update, delete on public.calculation_methodologies from anon, authenticated` — un
`revoke` solo tiene sentido si el privilegio existía.

**Consecuencia para DR-14:** un proyecto de Staging creado hoy desde cero muy probablemente
devolvería 403 en casi toda la aplicación. Esto **cambia el plan de staging** de Q0.2.

**Clasificación: LOCAL/REMOTE DIFFERENCE**, con deuda arquitectónica latente (las migraciones no
son autosuficientes). **No corregido y ninguna migración tocada.**

Resolución local, con aprobación y **fuera del repositorio** (scratchpad de sesión, nunca en
`supabase/migrations`): se replicaron los GRANT que Production ya tiene y se reaplicaron los 12
`revoke` de las migraciones, que se habían ejecutado sobre una base sin privilegios y por tanto no
revocaron nada. Paridad resultante **exacta**: `anon` 108, `authenticated` 118, `service_role` 120;
y `storage_upload_intents` / `storage_orphan_candidates` vuelven a tener **cero** privilegios para
`authenticated`.

### Auth local y superadministrador

Cadena completa por la vía normal de la aplicación, sin mecanismos nuevos:

1. Alta por el endpoint de Auth (misma ruta que `/register`) → HTTP 200.
2. El trigger `handle_new_user` (0004) creó el perfil automáticamente.
3. `create_organization` vía RPC bajo la sesión del usuario → organización + membresía `admin` +
   **3 módulos provisionados**: `core` (full, infraestructura, sin vencimiento) y
   `traceability_6632` + `textiles` en **Demo con vencimiento a 48 h**, `assignment_source =
   auto_demo_trial`. La lógica T9F queda validada de extremo a extremo.
4. Primer superadministrador por SQL, **mostrado y aprobado antes de ejecutarse**, solo contra
   `127.0.0.1:54322`. Es la única vía posible por diseño de 0040.

### Storage

3 buckets creados **por las migraciones**, los tres privados. 9 políticas sobre `storage.objects`,
RLS activa. **No se creó ningún bucket manualmente.**

### `.env.local`

Copia de seguridad previa en `~/trazaloop-env-backup-20260818-213249.bak` (permisos 600). Escrito
con aprobación explícita. Apunta al stack local; **ninguna variable referencia Production ni el
proyecto retirado**; `ACTIVE_ORG_COOKIE_SECRET` nuevo y exclusivo de local;
`PUBLIC_REGISTRATION_ENABLED=true` solo para desarrollo; `VERCEL_OIDC_TOKEN` eliminado. Nombres
heredados conservados conforme a **DR-16**. `precheck:env` → **OK** con 3 advertencias esperadas.

*Incidencia propia, registrada por honestidad:* el primer intento de escritura usó `sed` sobre un
JSON multilínea y dejó el archivo corrupto, lo que además rompió `supabase status` (el CLI lee
`.env.local`). Se rehízo con un script de parseo robusto. Sin impacto fuera de local.

### Seed

`scripts/seed-demo.ts`, el mecanismo existente. **No se creó `seed.sql` ni ningún segundo
mecanismo.** Autentica como el usuario con la clave anónima —respetando RLS, sin `service_role`— y
generó la cadena completa: proveedor → evidencia validada → materiales → familia → producto → lote
de entrada → orden → consumo → lote de salida → composición → **cálculo 70,00 % · defensible**.
Solo datos de prueba; ninguna información de clientes.

### Smoke

`scripts/smoke-staging.ts` en su modo local. **No se escribió un segundo runner.** **8 de 8 en
verde.** Los puntos de la lista que ese runner no cubre se verificaron con consultas de solo
lectura:

| # | Punto | Resultado |
|---|---|---|
| 1–3 | Autenticación, organización, membresías | ✅ |
| 4 | **Aislamiento multiempresa** | ✅ control independiente: usuario sin privilegios de plataforma ve **0 filas** en 7 tablas de otra empresa |
| 5–6 | Acceso modular y Demo/Full/Extra | ✅ 3 planes; plan efectivo `demo`; Demo 48 h correcto |
| 7 | TrazaDocs | ✅ 23 estructuras (11 `cpr` + 12 `textiles`), 250 secciones, vista maestra presente |
| 8–9 | Evidencias PCR y Textiles | ✅ las 4 tablas con RLS |
| 10 | Storage | ✅ 3 buckets privados, 9 políticas |
| 11–12 | Módulos PCR y Textiles | ✅ 30 tablas textiles; cadena PCR sembrada |
| 13 | **Quality sigue como placeholder** | ✅ `is_available=false`, `is_functional=false`, **0 tablas `quality_*`**, 0 funciones con «quality» |
| 14 | Ausencia de acceso cross-tenant | ✅ ver punto 4 |

### Aplicación local

`npm run dev` con la configuración del repositorio **sin cambios** (webpack conservado). `/login` y
`/register` responden **HTTP 200**.

### Pruebas y clasificación de fallos

| Prueba | Resultado | Clasificación |
|---|---|---|
| `tsc --noEmit` | ✅ sin errores | — |
| Unitarias (14 suites) | **13 verde / 1 rojo** | ver T-3 |
| `test:rls` (isolation) | **89 verde / 21–22 rojo** | ver T-1 |
| `eslint` | 187 problemas | ver T-2 |

**T-1 · `test:rls`: 21 fallos — PREEXISTING REGRESSION (deriva del suite).**
Reproducibles sobre base **limpia**, sin seed ni superadministrador: no los causó nada de este
sprint. Causas raíz identificadas:

- La prueba 9 espera los módulos `["core","docs","traceability_6632"]`, pero **0042 retiró `docs`**
  de los módulos base y **0100** los sustituyó por `core` + funcionales. El test no se actualizó.
- 4 fallos por `null value in column "produced_quantity_kg"`: **0105** impuso `NOT NULL` y el suite
  sigue insertando sin ese campo.
- ~10 fallos en cascada de los anteriores (`invalid input syntax for type uuid: ""`,
  `Cannot read properties of null`).
- 6 fallos de aparente aislamiento cruzado (71, 74, 83, 91, 100, 102). El suite crea su propio
  `platform_staff` (20 referencias), y un usuario de plataforma **debe** ver esos datos. **Un
  control independiente demostró que el aislamiento funciona correctamente.**

El suite lleva sin sincronizarse con las migraciones desde 0042. **No corregido.**

**T-2 · `eslint`: 186 de 187 problemas están en `supabase/.temp` — CONFIGURATION.**
`eslint.config.mjs` solo ignora `.next/**`, `out/**`, `build/**` y `next-env.d.ts`; no ignora
`supabase/`. Al levantar el stack local, `supabase/.temp/start-secrets` pasa a ser analizado. Solo
**1** problema es real: una variable sin usar en `tests/evidences`. **No corregido.**

**T-3 · `test:compliance`: 2 fallos, ambos causados por documentos que añadí — CONFIGURATION + REAL CODE DEFECT.**

- `docs/architecture/Trazaloop_Documento_Maestro_v1.1.md:1380` → el término normativo que el
  escáner prohíbe. Aparece **literal en el documento rector** incorporado en Q0, en la frase sobre
  modelar las normas como referencias versionadas. El test escanea `docs/`, que antes no contenía
  esos documentos.
- `docs/quality/q0/Q0_DATABASE_SCHEMA_INVENTORY.md:393` → el nombre de una certificadora alemana,
  disparado por la palabra **«obtuvieron»**. El patrón del test carecía de **límites de palabra**,
  mientras sus hermanos sí los tienen
  (`\bicontec\b`, `\baenor\b`, `\bsgs\b`). Cualquier texto en español con *tuvo, estuvo, obtuvo,
  mantuvo, sostuvo* lo dispara. Es un **defecto real del test**, latente hasta ahora porque el
  repositorio no contenía esas palabras en las rutas escaneadas.

**No corregido.** Requiere decisión: excluir `docs/architecture/` del escaneo, o añadir `\b` al
patrón, o ambas.

### Diferencias local vs Production

| Aspecto | Local | Production |
|---|---|---|
| Proyecto | `trazaloop-local` (Docker) | `mvmpadeixomwkpxbnhky` |
| PostgreSQL | 17.6 | 17.6.1.147 |
| Confirmación de correo | **deshabilitada** (deliberado) | habilitada (obligatoria) |
| Correo | Mailpit local :54324 | proveedor real |
| Registro público | `true` | `false` (hito técnico) |
| Distintivo de ambiente | «Entorno local» | ninguno |
| **GRANT de tabla** | **aplicados como paso de entorno** | provistos por el bootstrap de Supabase |
| Datos | sintéticos | reales |
| Esquema, RLS, políticas, Storage | **idénticos** | **idénticos** |

### Verificación de seguridad tras el arranque

`supabase start` recrea `supabase/.temp`, pero **solo con los secretos del stack local**:
`project-ref`, `linked-project.json` y `pooler-url` siguen **ausentes**, no hay ninguna referencia
a `mvmpadeixomwkpxbnhky`, y `supabase db push` continúa fallando con
`LegacyProjectNotLinkedError`. **La garantía del paso 1 se mantiene intacta.**

### Veredicto

**LOCAL READY WITH GAPS**

---

## Addendum Q0.3H — el hallazgo de privilegios queda resuelto

**Fecha:** 2026-08-19 · **Rama:** `chore/quality-q0-platform-hardening`
**Documento completo:** `Q0_3H_PLATFORM_REPRODUCIBILITY_HARDENING.md`
**El histórico previo de este archivo se conserva íntegro.**

El hallazgo mayor registrado más arriba —las migraciones no conceden privilegios de tabla, de modo
que un proyecto nuevo nace inservible— **ha sido resuelto**. Ya no requiere ningún workaround
manual.

| Punto | Estado en Q0.3 | Estado tras Q0.3H |
|---|---|---|
| Privilegios tras `db reset` | Requerían aplicar GRANT a mano | **Los concede la migración `0111_platform_role_privileges.sql`** |
| `anon` / `authenticated` / `service_role` | 0 / 10 / 0 | **108 / 118 / 120** — paridad exacta con producción |
| `TRUNCATE` en manos de roles de cliente | 226 objetos (heredado del entorno) | **0** — retirado explícitamente; bypasea RLS |
| Tablas server-only | Protegidas solo tras el workaround | **Protegidas por la propia migración** |
| `seed-demo.ts` desde cero | Fallaba con `42501` | **Funciona** → cálculo 70,00 % · defensible |
| Migraciones aplicadas | 102 | **103** |

**Consecuencia para DR-14:** la advertencia de que un Staging creado hoy habría nacido roto ya no
aplica. La precondición está cubierta.

### Otros puntos de este documento que Q0.3H cierra

- **T-1 · `test:rls` (21 fallos).** Sincronizado: **110 en verde, 0 en rojo**. Ninguna expectativa
  de seguridad se relajó; un control independiente confirmó que el aislamiento nunca estuvo roto.
  Dos pruebas resultaron estar pasando *por el motivo equivocado* y habrían fallado contra
  producción — detalle en Q0.3H §6.1.
- **T-2 · ESLint (187 problemas).** Reducido a **1 warning** preexistente, ajeno al sprint.
- **T-3 · `test:compliance`.** Limpio sobre 629 archivos. El patrón `/t[üu]v/i` carecía de límites
  de palabra, un defecto real que este documento expuso al introducir texto en español.

### Lo que sigue abierto

`test:t9f3-rls` termina con «limpieza INCOMPLETA: 2 residuos»: el suite retiene una organización
QA por diseño y después no puede borrar al usuario que la creó, porque las claves foráneas
`created_by` hacia `profiles` son `NO ACTION`. Es una limitación preexistente del arnés de
limpieza, no del producto, y queda documentada sin corregir.

**Veredicto de Q0.3 revisado a la luz de Q0.3H: el entorno local es reproducible desde cero.**
