# Trazaloop · Textil · Sprint T9E.3 — Cierre server-only de la finalización de evidencias y validación OOXML estructural

> **Estado:** implementado, aplicado a staging y verificado en vivo.
> **Migración única:** `0098_server_only_textile_evidence_finalize.sql`.
> **Alcance:** extremadamente acotado — cerrar 3 bypasses encontrados por
> revisión independiente sobre T9E.2, sin tocar nada más.

> **Actualización T9E.4 (2026-07-21):** una revisión posterior encontró tres
> pendientes **fuera de las RPC** que este sprint no cubría. T9E.4 los cerró con
> la migración `0099`: (a) restringió el `INSERT` de Storage en rutas Textiles a
> la ruta **exacta** de un intento propio, `pending` y vigente; (b) cerró
> `DELETE` y `UPDATE`/upsert de objetos Textiles para `authenticated` —incluidos
> los de evidencias ya finalizadas—; (c) migró la retirada **física** de objetos
> al cliente administrativo server-only; y (d) endureció la validación de CSV a
> **UTF-8 estricto**. Ver `TEXTILES_T9E_4_STORAGE_RLS_AND_CSV_UTF8_CLOSURE_REPORT.md`.
> Ese informe documenta además que tres aserciones estáticas quedaron en rojo al
> cerrar T9E.3 sin detectarse (validación leída con `grep`/`head` en vez del
> código de salida); están corregidas en T9E.4.

---

## 1. Resumen ejecutivo

La revisión independiente sobre el cierre T9E.2 encontró tres vías por las que
la integridad de la finalización de evidencias podía saltarse:

- **B1 — finalización directa.** `finalize_textile_evidence_upload` tenía
  `GRANT EXECUTE` a `authenticated`: un usuario podía invocarla con su propio
  JWT y registrar una evidencia **sin que existiera el objeto en Storage y sin
  la verificación de firma binaria**, porque esas comprobaciones vivían en la
  Server Action, no en PostgreSQL.
- **B2 — cierre de limpieza afirmado por el navegador.**
  `record_textile_upload_intent_cleanup` tenía `GRANT` a `authenticated`:
  cualquier creador podía afirmar `p_removed = true` sin que Storage hubiera
  confirmado el retiro real del objeto.
- **B3 — OOXML validado por subcadenas.** Un `.docx`/`.xlsx` se aceptaba si los
  bytes empezaban por `PK\x03\x04` y **contenían** las cadenas
  `[Content_Types].xml` y `word/document.xml` / `xl/workbook.xml` en cualquier
  posición — sin abrir el ZIP. Bytes arbitrarios con esas cadenas incrustadas
  pasaban como documentos válidos.

Este sprint sella las dos funciones de 0097, crea variantes **`*_server` con
actor explícito** ejecutables **solo por `service_role`**, mueve **todas** las
verificaciones externas (objeto, tamaño, Content-Type, firma binaria) a la
Server Action antes de invocar la RPC, y reemplaza la validación OOXML por un
**parser ZIP real** (fflate) que exige las entradas requeridas como archivos
reales del directorio central, con límites anti ZIP-bomb.

Se aplicó `0098` a staging siguiendo el protocolo `list → dry-run → push →
verify`, se confirmó **en vivo** que las funciones selladas ya no tienen grant
a `authenticated`, y se pasaron todas las suites (unitarias + dos suites RLS
reales contra staging) y la prueba manual mínima §21 con captura de red.

---

## 2. Alcance estricto

**Incluido:** los 3 bypasses B1/B2/B3 y su verificación. **Una** migración
aditiva (`0098`). Reescritura de las suites afectadas. Verificación de grants en
vivo. Validación limpia. Prueba manual mínima.

**Excluido y respetado:** no se modificó ninguna migración `0070`–`0097`; no se
tocó `.env.local`; no se usó `db reset`, `git reset --hard`, `git clean -fd` ni
`migration repair`; no se actualizó Next.js ni dependencias mayores; no se
ejecutó `npm audit fix --force`; no se “arregló” CPR (sus 9 fallos RLS
preexistentes de `isolation.test.ts` siguen documentados, no corregidos); no se
introdujo la service role key en ningún módulo cliente.

---

## 3. Los tres bypasses, en detalle

| ID | Función / lógica | Vía de abuso | Por qué existía |
|----|------------------|--------------|-----------------|
| B1 | `finalize_textile_evidence_upload(uuid,bigint,text)` | JWT de usuario → RPC directa, sin objeto ni firma | La existencia del objeto en Storage y la firma binaria **no son verificables desde PostgreSQL**; se comprobaban en la Server Action, que el atacante evitaba |
| B2 | `record_textile_upload_intent_cleanup(uuid,boolean)` | JWT de usuario → `p_removed=true` sin retiro real | El **resultado real** de `storage.remove()` solo lo conoce el servidor; PostgreSQL no puede confirmarlo |
| B3 | `detectTextileEvidenceFileType` (rama ZIP) | `PK\x03\x04` + cadenas incrustadas | La validación miraba subcadenas de los bytes, no las entradas reales del contenedor |

---

## 4. Causa raíz común (B1/B2)

El diseño T9E.2 puso verificaciones que **PostgreSQL no puede hacer** (existencia
del objeto, tamaño/Content-Type reales, firma binaria, resultado de un
`remove()`) en la Server Action, pero dejó las RPC que consumían esas
verificaciones **ejecutables por `authenticated`**. Confianza mal ubicada: la
frontera de seguridad estaba en el código de aplicación, pero la base de datos
aceptaba órdenes directas que saltaban ese código.

La corrección estructural es hacer que **solo el servidor** pueda invocar la
finalización y el cierre de limpieza, y que la RPC **revalide en SQL** todo lo
que sí es verificable ahí (actor, membresía, rol, creador, estado, expiración,
metadata, coherencia tamaño/MIME) aunque la llamada venga del servidor.

---

## 5. Qué puede y qué NO puede verificar PostgreSQL

**Sí (revalidado en la RPC, jamás delegado al servidor):** que el actor exista;
que sea miembro **activo** de la organización del intento con rol permitido; que
sea el **creador** del intento; el estado (`pending`), la expiración y la
metadata canónica del intento; que el tamaño/MIME declarados coincidan con lo
guardado en el intento y con los límites del dominio; atomicidad e idempotencia.

**No (responsabilidad exclusiva del servidor, antes de invocar la RPC):** que el
objeto **exista** en Storage; su tamaño y Content-Type **reales**; su **firma
binaria**; el **resultado real** de `storage.remove()`.

Esta división es la que fija la arquitectura server-only: las verificaciones no
delegables se hacen en la Server Action; la RPC no confía en el navegador **ni**
en que el servidor haya hecho su parte para lo que la propia BD puede comprobar.

---

## 6. Arquitectura server-only

```
Navegador ── begin (RPC usuario) ──▶ intent + URL firmada          [sesión usuario]
Navegador ── XHR PUT bytes ─────────▶ Supabase Storage (directo)   [nunca al server de la app]
Navegador ── finalize (Server Action) ─▶ el SERVIDOR:
      1) lee el intento (verifica creador == userId)
      2) storage.info(objeto)      → existe, tamaño, Content-Type
      3) descarga bytes (≤20MB)    → firma binaria + estructura OOXML real
      4) si algo falla: remove(objeto) + mark_failed (RPC usuario)
      5) createAdminClient().rpc("finalize_..._server", { p_actor_id: userId, ... })
                                   → RPC SECURITY DEFINER, solo service_role,
                                     revalida TODO en SQL, inserta+consume atómico
```

El actor (`p_actor_id`) lo resuelve el **servidor** desde la sesión
(`currentUserId()`), nunca el cliente. Bajo `service_role`, `auth.uid()` es
`NULL`; por eso la RPC **no** lo usa y recibe el actor de forma explícita.

---

## 7. Migración 0098 · sellado de las funciones de 0097

```sql
revoke all on function public.finalize_textile_evidence_upload(uuid, bigint, text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_textile_upload_intent_cleanup(uuid, boolean)
  from public, anon, authenticated, service_role;
```

Las funciones **no se eliminan**: se sellan (quedan como legado inerte) y se
comentan explicando por qué. Una llamada directa devuelve un `permission denied`
limpio (SQLSTATE `42501`) en vez de un ambiguo “función inexistente”. Bajo
`service_role` serían inservibles de todos modos (`auth.uid()` NULL).

---

## 8. `finalize_textile_evidence_upload_server` (actor explícito)

`SECURITY DEFINER`, `set search_path = public`. Firma:
`(p_actor_id uuid, p_intent_id uuid, p_file_size_bytes bigint, p_file_mime_type text) → jsonb`.

Revalidación en SQL, en orden:

1. `p_actor_id` no nulo y existe en `auth.users` (`ACTOR_REQUIRED` /
   `ACTOR_NOT_FOUND`).
2. Intento leído con `FOR UPDATE` (`INTENT_NOT_FOUND`).
3. Membresía activa con rol en `('admin','quality','consultant')` para la
   organización del intento (`ROLE_NOT_ALLOWED`).
4. `v_intent.created_by = p_actor_id` (`INTENT_NOT_OWNED`).
5. Idempotencia: si el intento ya está `consumed` con evidencia real, retorna
   `{evidence_id, already_finalized:true}` (o `INTENT_CONSUMED_INCONSISTENT`).
6. Estado `pending`, no expirado, metadata presente.
7. Tamaño/MIME iguales a los declarados en el intento y dentro de límites
   (`OBJECT_SIZE_MISMATCH` / `OBJECT_MIME_MISMATCH`, ≤ 20 MB).
8. `INSERT` en `textile_evidences` desde la **metadata canónica** del intento,
   con `created_by = p_actor_id` (respetado porque `auth.uid()` es NULL bajo
   service_role y el trigger `force_created_by` solo sobrescribe cuando
   `auth.uid()` no es nulo).
9. `UPDATE` del intento a `consumed` + `consumed_at` + `evidence_id`, en la
   **misma transacción**.

`revoke all ... from public, anon, authenticated;` + `grant execute ... to
service_role;`.

---

## 9. `record_textile_upload_intent_cleanup_server`

Mismo principio. Firma `(p_actor_id uuid, p_intent_id uuid, p_removed boolean) →
text`. Revalida actor/membresía/rol/creador; devuelve `not_found`,
`consumed_untouchable`, `still_active`, `linked_evidence`, el estado sin cambio,
o `expired`. **Solo** cierra a `expired` cuando `p_removed = true` (el servidor
confirmó el retiro real); con `false` conserva el estado y suma un reintento.
Nunca toca un intento `consumed` ni una ruta ligada a una evidencia real
(barrera `evidence_id is not null OR exists(... file_path = object_path)`).
Grant únicamente a `service_role`.

---

## 10. La RPC no confía en `auth.uid()`

Bajo `service_role`, `auth.uid()` es `NULL`. Las funciones `*_server` **no lo
leen en ningún punto** (verificado por prueba estática): reciben el actor
explícito y consultan `public.memberships` directamente. El service role **no
sustituye** la validación de membresía/rol/creador: la ejecuta la propia RPC en
SQL. Así, un servidor comprometido que llame con un actor arbitrario sigue
topando con la revalidación (probado: actor de otra org → `ROLE_NOT_ALLOWED`;
mismo-org no creador → `INTENT_NOT_OWNED`; inexistente → `ACTOR_NOT_FOUND`).

---

## 11. Atomicidad e idempotencia conservadas

`FOR UPDATE` + `INSERT`+`UPDATE` en una transacción plpgsql: la evidencia y el
consumo del intento ocurren juntos o no ocurren. Idempotencia por `evidence_id`:
un segundo finalize retorna `already_finalized:true` con el **mismo**
`evidence_id` y sin crear una segunda evidencia. Verificado en staging (una sola
fila tras doble finalize) y en la prueba manual real.

---

## 12. Cliente admin server-only

`lib/supabase/admin.ts` abre con `import "server-only"` y usa
`SUPABASE_SERVICE_ROLE_KEY`. Su **primer y único** consumidor de negocio es
`lib/db/textiles-evidences.ts` para las dos RPC `*_server`. Pruebas estáticas
(suite server-only) garantizan que:

- `admin.ts` importa `"server-only"`;
- **ningún** módulo con `"use client"` importa `@/lib/supabase/admin`;
- la app **no** invoca las RPC selladas de 0097 con sesión de usuario;
- `begin` y `mark_failed` siguen usando la sesión del usuario (no admin).

El bundle de cliente compilado (`.next/static`) se inspeccionó: **0** chunks con
`SUPABASE_SERVICE_ROLE_KEY`, con el valor de la clave, con `createAdminClient` o
con el nombre de las RPC `*_server`.

---

## 13. Capa de aplicación

- `lib/db/textiles-evidences.ts`: `finalizeTextileEvidenceUploadRpc(actorId, …)`
  y `recordTextileUploadIntentCleanupRpc(actorId, …)` usan `createAdminClient()`
  y las RPC `*_server`, pasando `p_actor_id`. Se añadió
  `listRecentlyExpiredTextileUploadIntents` para el re-barrido (§15).
- `server/actions/textiles-evidences.ts`: `finalize` resuelve `userId` en el
  servidor, verifica objeto+bytes+firma **antes** del RPC (el RPC es el último
  paso) y siempre comprueba el `errorCode` devuelto; `begin` resuelve el actor y
  limpia intentos vencidos con el actor explícito.

---

## 14. Validación OOXML con parser ZIP real (B3)

`lib/domain/textiles-evidence-signatures.ts` incorpora
`validateOoxmlContainer(bytes, kind)` sobre **fflate**: `unzipSync(bytes,
{filter})` recorre el **directorio central** del ZIP sin descomprimir ninguna
entrada (el filtro siempre retorna `false`). Un ZIP inválido o truncado lanza y
se rechaza (`contenedor ZIP inválido o truncado`). Se exige que las entradas
requeridas existan como **archivos reales** (tamaño declarado > 0), no como
directorios ni como cadenas incrustadas en el contenido de otro archivo:

- **docx:** `[Content_Types].xml` **y** `word/document.xml`.
- **xlsx:** `[Content_Types].xml` **y** `xl/workbook.xml`.

La detección por firma prueba primero docx, luego xlsx; si ninguna valida,
degrada a `zip` genérico (jamás docx/xlsx).

---

## 15. Límites anti ZIP-bomb

Aplicados sobre la **metadata** del directorio central, sin inflar contenido:

| Límite | Valor |
|--------|-------|
| `OOXML_MAX_ENTRIES` | 4096 entradas |
| `OOXML_MAX_ENTRY_UNCOMPRESSED_BYTES` | 100 MB por entrada (tamaño declarado) |
| `OOXML_MAX_TOTAL_UNCOMPRESSED_BYTES` | 400 MB total declarado |
| `OOXML_MAX_COMPRESSION_RATIO` | 250× (declarado/comprimido) |

Además se rechazan nombres de entrada anómalos: vacíos, con `..` (traversal),
absolutos (`/`…), con `\`, con unidad de Windows (`C:`…) o con NUL.

> **Limitación honesta:** esta validación es **estructural**, no un antivirus.
> Un PDF u OOXML **real** puede contener macros o contenido hostil para el
> visor. Fuera de alcance de este sprint; declarado como riesgo residual (§29).

---

## 16. Experimento del token firmado y defensa contra subidas tardías

**Experimento real en staging (suite T9E.2, caso 17):** se emitió una URL de
subida firmada, se subió el objeto, se retiró con `storage.remove()`, y se
**reintentó** la subida con el **mismo token**. Resultado observado:

> **El token firmado SE REUTILIZÓ tras el retiro (no es de un solo uso).**

Por tanto la defensa por re-barrido es **necesaria**, no decorativa. Diseño:

- `TEXTILE_EVIDENCE_UPLOAD_TOKEN_GRACE_HOURS = 3` (el token dura ~2 h, mayor que
  el TTL del intento de 30 min; la ventana de gracia cubre ese margen).
- **Oportunista** (Server Action `cleanupExpiredUploadIntents`): tras cerrar
  intentos vencidos, re-barre los `expired` recientes del propio actor; si
  reapareció un objeto en una ruta sin `evidence_id` ni evidencia ligada, lo
  retira.
- **Administrativo** (`scripts/cleanup-textile-upload-intents.ts`): mismo
  re-barrido para todas las organizaciones (límite 200), solo conteos.

**Garantía dura:** aunque un objeto tardío reaparezca, el intento ya está
`expired` y la RPC de finalización exige estado `pending` → **jamás** puede
convertirse en evidencia. Nunca se retira un objeto ligado a una evidencia real.
Verificado en el caso 17: `INTENT_NOT_PENDING`, 0 evidencias, objeto tardío
retirado por el re-barrido.

---

## 17. Dependencia añadida: fflate

- **Paquete:** `fflate@^0.8.3`. Minúsculo, sin dependencias transitivas,
  mantenido, ampliamente usado.
- **Uso:** `unzipSync` con filtro que nunca descomprime (validación del
  directorio central) en producción; `zipSync`/`strToU8` para construir ZIP
  **reales** en las pruebas.
- **Por qué:** leer entradas reales del contenedor exige un parser ZIP; escribir
  uno a mano sería peor que usar una librería madura y auditada.
- No se ejecutó `npm audit fix --force`. `npm ci` reproducible desde
  `package-lock.json`.

---

## 18. Script administrativo actualizado

`scripts/cleanup-textile-upload-intents.ts` conserva la máquina recuperable de
T9E.2 (solo cierra a `expired` con retiro confirmado; barrera de evidencia
ligada; consumidos intocables) y añade el re-barrido de subidas tardías (§16).
Sigue imprimiendo **solo conteos**, nunca rutas ni URLs firmadas. Requiere la
service role key, por eso vive en `scripts/` (server-side) y nunca en la app.

---

## 19. Pruebas · suite OOXML estructural (14 casos)

`tests/evidences/textiles-evidence-ooxml-structure.test.ts` — **fixtures ZIP
reales** (fflate), no concatenaciones sintéticas. **14/14 verde.** Cubre: docx y
xlsx mínimos válidos aceptados; PK + cadenas incrustadas rechazado; ZIP truncado
rechazado; falta `[Content_Types].xml`; falta `word/document.xml` / `xl/
workbook.xml`; cadena de la entrada requerida dentro del contenido de otro
archivo rechazada; traversal en nombres; exceso de entradas (anti-bomb);
estructura docx presentada como xlsx y viceversa, ambas rechazadas.

---

## 20. Pruebas · suite server-only estática (10 casos)

`tests/evidences/textiles-evidence-server-only-finalization.test.ts` — **10/10
verde.** Verifica contra el código real y la migración: revokes de 0098; `*_
server` con grant solo a service_role; actor explícito y ausencia de
`auth.uid()`; `admin.ts` server-only; lib/db usa admin + `*_server`; la app no
llama las RPC selladas; ningún cliente importa admin; la Server Action verifica
objeto+bytes+firma antes del RPC; el actor lo pasa el servidor; `begin`/`mark_
failed` siguen siendo RPC de usuario.

---

## 21. Pruebas · firmas binarias con ZIP reales (12 casos)

`tests/evidences/textiles-evidence-signatures.test.ts` — reescrita: los fixtures
docx/xlsx ahora son ZIP reales (`zipSync`) y se añadió un caso de bytes PK con
cadenas incrustadas que debe degradar a `zip`. **12/12 verde.**

---

## 22. Pruebas · RLS reales contra staging (T9E.2 reescrita, 17 casos)

`tests/rls/textiles-t9e2-integrity.test.ts` — reescrita para el modelo sellado.
**17/17 verde** contra staging. Destacados:

- **Ataque B1 (caso 4):** finalize directo sin objeto, para creador, mismo-org,
  otra org y anon → `permission denied` (42501) en los cuatro; 0 evidencias; el
  intento sigue `pending`.
- **Ataque B2 (caso 5):** cleanup directo con `p_removed=true` → `permission
  denied` en los cuatro; intento intacto.
- **Actor incorrecto en `*_server` (caso 7):** mismo-org/otra-org/inexistente/
  null → `INTENT_NOT_OWNED`/`ROLE_NOT_ALLOWED`/`ACTOR_NOT_FOUND`/
  `ACTOR_REQUIRED`, sin efectos.
- Flujo legítimo server-only (caso 9): evidencia + consumo + vínculo atómicos,
  `created_by` = actor real. Idempotencia (caso 10). Consumidos inmutables
  (caso 11). Limpieza recuperable server-only (caso 13). Experimento del token
  y subida tardía (caso 17).

Datos temporales con identificadores aleatorios, credenciales **solo en
memoria**, limpieza en `finally`.

---

## 23. Pruebas · RLS multi-tenant (T9E.1) tras 0098

`tests/rls/textiles-t9e1-multitenant.test.ts` — **17/17 verde**. Se eliminó el
warning de variable sin uso (`intentPathA`, §31) y se anotó que el caso 10 hoy
recibe `permission denied` por el sellado 0098 antes de evaluar la propiedad.

---

## 24. Listas de migraciones bajo control

`tests/unit/textiles-module.test.ts` (caso 10) y
`tests/passports/textiles-passports-share.test.ts` (caso 1) se extendieron para
incluir `0098` y su mensaje `0070–0098` / `0092–0098`. **Verde.**

---

## 25. Verificación de grants EN VIVO (staging)

Consulta a `pg_proc` (`proacl`, `prosecdef`, `proconfig`) tras aplicar 0098:

| Función | secdef | search_path | grants |
|---------|:------:|:-----------:|--------|
| `finalize_textile_evidence_upload` (0097, sellada) | true | public | `postgres` |
| `record_textile_upload_intent_cleanup` (0097, sellada) | true | public | `postgres` |
| `finalize_textile_evidence_upload_server` | true | public | `postgres, service_role` |
| `record_textile_upload_intent_cleanup_server` | true | public | `postgres, service_role` |
| `begin_textile_evidence_upload` | true | public | `authenticated, postgres, service_role` |
| `mark_textile_evidence_upload_failed` | true | public | `authenticated, postgres, service_role` |

Las funciones selladas **ya no tienen** `authenticated`. Las `*_server` solo
`service_role`. La suite server-only **falla** si el grant a `authenticated`
reaparece en las funciones selladas (regresión guardada).

---

## 26. Protocolo de migración (§19 del brief)

1. `migration list` (vía `--db-url`): remoto termina en `0097`, `0098` local
   pendiente.
2. `db push --dry-run`: **solo** `0098_server_only_textile_evidence_finalize.sql`.
3. `db push`: aplicada.
4. Verificación de grants en vivo (§25).

Higiene de secretos en toda invocación de CLI: `set +x`, export acotado de
`SUPABASE_DB_URL`, y filtrado de la salida contra cadenas de conexión/password.

---

## 27. Validación limpia (instalación desde cero)

`rm -rf node_modules .next` · `rm -f tsconfig.tsbuildinfo` · `npm cache verify` ·
`npm ci` (Node v22.23.1, npm 10.9.8) · `npm run build` (OK) · `npm run test:all`
(**rc=0, todo verde**, incluye las suites OOXML estructural, server-only y
firmas). Las dos suites RLS de staging se corrieron aparte (exigen BD viva):
ambas verde.

---

## 28. Prueba manual mínima §21 (dev server, QA desechable, con captura de red)

Usuario QA desechable aprovisionado (org + módulo textil), sesión inyectada por
cookies server-side (sin teclear contraseña en el formulario), y eliminado al
terminar. Resultados:

- **PDF válido e2e:** subido; **captura XHR** confirma que los bytes van por
  `PUT` a `dtrxxqmdweykzncfmahc.supabase.co/storage/v1/object/upload/sign/…` —
  **directo a Storage, jamás al servidor de la app**.
- **Intento consumido:** `status=consumed`, `evidence_id == intent`,
  `consumed_at` no nulo; evidencia con `created_by` = actor real.
- **DOCX real y XLSX real:** aceptados (3 evidencias en la lista).
- **ZIP renombrado a `.docx`:** rechazado — “El contenido del archivo no
  corresponde al tipo declarado”; intento `failed`, objeto retirado.
- **Doble finalize:** idempotente, una sola evidencia.
- **Ataques con el JWT real del usuario:** finalize y cleanup directos →
  `permission denied` (42501); las evidencias de la org siguen en 3.
- **Sin service role en cliente:** 0 chunks en `.next/static`.

Limpieza posterior: 4 objetos de Storage retirados, org y dependencias
eliminadas, usuario QA rotado + baneado + soft-delete (el hard-delete lo bloquea
la FK de intentos consumidos — residuo documentado, no sensible). Credencial
local borrada.

---

## 29. Riesgos residuales (honestos)

- **La validación estructural no es antimalware.** Un archivo real y bien
  formado puede contener contenido hostil para el visor. No se ejecuta contenido
  activo, pero no hay escaneo de malware. Fuera de alcance.
- **URL de subida firmada reutilizable ~2 h.** Mitigado por el re-barrido y por
  la imposibilidad de finalizar un intento no `pending`; no eliminado (es
  comportamiento de Supabase Storage).
- **Residuo por diseño:** intentos `consumed` y cascarones de organización sin
  miembros quedan protegidos por el guard 0097 y el `audit_log` append-only; no
  son sensibles.
- **CPR:** 9 fallos RLS preexistentes en `isolation.test.ts` siguen sin
  corregir, por alcance. No tocados.

---

## 30. Nota sobre el warning de lint ajeno (preexistente)

`npm run lint` reporta **1 warning, 0 errores**: `domainSrc` sin uso en
`tests/evidences/textiles-evidences-hardening.test.ts`. Es un archivo del sprint
T5.1/T9E.2 **no tocado en T9E.3** y el warning es **preexistente** (anterior a
este sprint). Conforme al alcance acotado, se **documenta y no se corrige**. El
único warning que sí correspondía a T9E.3 (`intentPathA` en la suite
multi-tenant) se eliminó.

---

## 31. Rollback (documentado; NO ejecutar sin decisión explícita)

No hay `db reset`. Para revertir 0098:

```sql
drop function if exists public.finalize_textile_evidence_upload_server(uuid, uuid, bigint, text);
drop function if exists public.record_textile_upload_intent_cleanup_server(uuid, uuid, boolean);
grant execute on function public.finalize_textile_evidence_upload(uuid, bigint, text) to authenticated, service_role;
grant execute on function public.record_textile_upload_intent_cleanup(uuid, boolean) to authenticated, service_role;
```

> **ADVERTENCIA:** re-otorgar las funciones de 0097 a `authenticated`
> **REABRE los bypasses B1 y B2**. Nada de esto toca evidencias ni intentos
> consumidos. En la práctica, el rollback correcto es corregir hacia adelante
> con una nueva migración, no revertir 0098.

---

## 32. Checklist final de revisión humana

- [x] B1 cerrado: finalize solo server-only; ataque directo → permission denied,
      0 evidencias (staging + manual).
- [x] B2 cerrado: cleanup solo server-only; `p_removed` afirmado por navegador
      ya no cierra intentos.
- [x] B3 cerrado: OOXML por parser ZIP real con entradas requeridas + límites
      anti-bomb; cadenas incrustadas y truncados rechazados.
- [x] Las RPC `*_server` revalidan actor/membresía/rol/creador en SQL; no leen
      `auth.uid()`.
- [x] Cliente admin server-only; ningún cliente lo importa; 0 service role en el
      bundle.
- [x] Grants verificados en vivo; regresión guardada si `authenticated`
      reaparece.
- [x] `0098` aplicada por protocolo `list → dry-run → push → verify`.
- [x] `npm ci` limpio + typecheck + lint (1 warning ajeno documentado) + build +
      `test:all` verde; dos suites RLS staging verde.
- [x] Prueba manual §21 con captura de red; QA desechable eliminado; staging
      limpio.
- [x] Migraciones `0070`–`0097` intactas; sin `db reset`/`repair`/`audit fix
      --force`; Next.js y dependencias mayores sin tocar.
