# Trazaloop · Textil · Sprint T9E.4 — Cierre de Storage RLS, eliminación server-only y validación UTF-8 de CSV

> **Estado:** implementado, aplicado a staging y verificado en vivo.
> **Migración única:** `0099_textile_storage_rls_and_csv_utf8_closure.sql`.
> **Alcance:** estrictamente limitado a los tres pendientes detectados fuera de
> las RPC tras T9E.3.

---

## 1. Resumen ejecutivo

T9E.3 dejó la *finalización* de evidencias como operación exclusivamente
server-only, pero **fuera de las RPC** quedaban tres huecos, los tres
**reproducidos contra staging antes de escribir una sola línea de migración**:

- **S1 · INSERT textil arbitrario.** La política `evidences_insert` (0016)
  permitía a cualquier miembro con rol `admin`/`quality`/`consultant` subir
  cualquier objeto bajo el prefijo de su organización, incluidas rutas
  `{org}/textiles/...` sin relación con ningún intento de carga.
- **S2 · DELETE textil directo.** La política `evidences_delete_textiles`
  (0076) permitía a esos mismos roles **borrar físicamente cualquier objeto
  textil**, incluidos los de **evidencias ya finalizadas** — pérdida de
  evidencia desde el navegador.
- **S3 · CSV validado por bytes altos.** La detección de CSV consideraba texto
  cualquier byte `>= 0x80`, de modo que binario evidente pasaba como CSV.

El sprint cierra los tres: `0099` separa la política INSERT en una **legada
(no textil, idéntica a 0016, para preservar CPR)** y una **textil ligada a un
intento EXACTO**, y **elimina** la política DELETE textil sin reemplazo; la
retirada física legítima se movió al **cliente administrativo server-only** con
una cadena de verificación completa; y el CSV pasa a **decodificación UTF-8
estricta**.

---

## 2. Alcance estrictamente limitado

**Incluido:** políticas del bucket `evidences`, INSERT textil ligado a intento,
prohibición de DELETE/UPDATE textil desde clientes, eliminación física
server-only, preservación de CPR, UTF-8 estricto de CSV, pruebas, documentación
y empaquetado.

**Excluido y respetado:** no se modificó ninguna migración `0070`–`0098`; no se
tocó `.env.local`; sin `db reset`, `git reset --hard`, `git clean -fd` ni
`migration repair`; sin `npm audit fix --force`; sin actualizar Next.js ni
dependencias mayores; no se rediseñó la carga directa; no se cambió el límite de
20 MB; el bucket sigue privado; no se corrigieron otros asuntos CPR ni se tocaron
diagnóstico, catálogos, productos, trazabilidad, circularidad, TrazaDocs,
pasaportes, QR, enlaces, navegación, branding, autenticación ni planes.

---

## 3. Políticas iniciales (auditoría en vivo, antes de 0099)

Bucket `evidences` (privado), tres políticas, todas `to authenticated`:

| Política | CMD | Expresión |
|---|---|---|
| `evidences_select` | SELECT | `bucket_id='evidences' AND is_org_member(safe_uuid(foldername[1]))` |
| `evidences_insert` | INSERT | `bucket_id='evidences' AND has_org_role(safe_uuid(foldername[1]), ['admin','quality','consultant'])` |
| `evidences_delete_textiles` | DELETE | `bucket_id='evidences' AND foldername[2]='textiles' AND has_org_role(...)` |

**No existía política UPDATE** para este bucket. Los buckets
`organization-assets` y `trazadocs-documents` tienen políticas propias filtradas
por su `bucket_id` y quedan fuera de alcance.

**Formas de ruta reales:**
- CPR: `{organization_id}/{evidence_id}/{archivo}` → segundo segmento = UUID.
- Textil: `{organization_id}/textiles/{intent_id}/{archivo}` → segundo segmento
  = literal `textiles`.

Un `evidence_id` UUID nunca puede ser la cadena `textiles`, de modo que
`(storage.foldername(name))[2] = 'textiles'` es un discriminador limpio y sin
ambigüedad.

---

## 4. Bypass de INSERT Textiles (S1), reproducido

Con la política original, el usuario A1 (admin de su organización) subió con su
JWT a `{orgA}/textiles/{uuid-inventado}/hackeado.pdf`:

```
B1 · INSERT textil SIN intento (JWT A1) → *** PERMITIDO (bypass reproducido) ***
```

La ruta no quedaba vinculada a ningún intento: bastaba tener rol en la
organización. Cualquier miembro autorizado podía sembrar objetos arbitrarios en
el espacio textil, consumir cuota y dejar huérfanos que la limpieza no conocía.

---

## 5. Bypass de DELETE Textiles (S2), reproducido

Tras finalizar una evidencia real (objeto consumido y ligado), el borrado
directo desde el navegador:

```
B2 · DELETE por CREADOR de objeto finalizado   → *** BORRADO (bypass reproducido) ***
B2 · DELETE por OTRO admin de la misma org     → *** BORRADO (bypass reproducido) ***
B2 · DELETE por admin de OTRA organización     → RECHAZADO/sin efecto
B2 · DELETE por anon                           → RECHAZADO
```

El impacto es pérdida de evidencia: la fila `textile_evidences` seguía
apuntando a un `file_path` cuyo objeto ya no existía. Éste era el hallazgo más
grave del sprint.

---

## 6. Riesgo de sobrescritura (UPDATE / upsert)

Comprobado en vivo **antes** de tocar nada:

```
UP · upsert=true sobre objeto existente (JWT)  → RECHAZADO: new row violates row-level security policy
UP · upload sin upsert sobre existente (JWT)   → RECHAZADO: The resource already exists
```

Como el bucket no tiene política UPDATE, la sobrescritura ya estaba cerrada por
*deny-by-default*. **0099 no crea ninguna política UPDATE**: hacerlo solo podría
abrir permisos. Se añadieron pruebas de regresión para que siga así.

---

## 7. Separación CPR / Textiles

Las políticas PERMISSIVE de PostgreSQL se combinan con `OR`. Para que una ruta
textil no pueda ampararse en la política legada (ni al revés), las dos son
**disjuntas por el segundo segmento**:

- legada: `(storage.foldername(name))[2] IS DISTINCT FROM 'textiles'`
- textil: `(storage.foldername(name))[2] = 'textiles'`

Se usa `IS DISTINCT FROM` (y no `<>`) para que las rutas de dos segmentos, cuyo
`[2]` es `NULL` y que hoy también se admiten, sigan cayendo en la legada sin
cambio de comportamiento.

---

## 8. Política INSERT legado (CPR y no textil)

```sql
create policy evidences_insert_legacy on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidences'
    and (storage.foldername(name))[2] is distinct from 'textiles'
    and public.has_org_role(
      public.safe_uuid((storage.foldername(name))[1]),
      array['admin', 'quality', 'consultant']
    )
  );
```

Condición **idéntica** a la de 0016 más la exclusión del prefijo textil: mismo
bucket, misma organización por ruta, mismos roles. **No amplía ni reduce**
permisos CPR.

---

## 9. Política INSERT Textiles

```sql
create policy evidences_insert_textiles on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidences'
    and (storage.foldername(name))[2] = 'textiles'
    and exists (
      select 1 from public.textile_evidence_upload_intents i
       where i.object_path = storage.objects.name
         and i.bucket_id = 'evidences'
         and i.created_by = auth.uid()
         and i.organization_id = public.safe_uuid((storage.foldername(name))[1])
         and i.status = 'pending'
         and i.expires_at > now()
         and i.evidence_id is null
         and public.has_org_role(i.organization_id, array['admin','quality','consultant'])
         and exists (select 1 from public.organization_modules m
                      where m.organization_id = i.organization_id
                        and m.module_code = 'textiles' and m.enabled)
    )
  );
```

El rol y el módulo se revalidan **en el momento de la carga**, no en el de crear
el intento: si el usuario pierde el rol o se deshabilita el módulo entre ambos
instantes, la carga se rechaza.

---

## 10. Coincidencia exacta con el intento

La igualdad es `i.object_path = storage.objects.name` — **exacta**, jamás
prefijo, `LIKE`, `position()` ni coincidencia parcial. `object_path` es además
`UNIQUE` en la tabla. Consecuencia directa: cualquier renombrado del archivo,
`intent_id` distinto, subdirectorio extra, traversal (`..`) o backslash produce
un `name` que no coincide con ningún `object_path` almacenado y queda rechazado
sin necesidad de reglas ad-hoc para cada caso.

---

## 11. Restricción por creador

`i.created_by = auth.uid()`: ni siquiera otro administrador de la **misma**
organización puede cargar en el intento ajeno. Verificado en vivo en ambos
sentidos (A1→intento de A2 y A2→intento de A1, ambos rechazados).

---

## 12. Estados permitidos

Solo `status = 'pending'` **y** `expires_at > now()` **y** `evidence_id is
null`. Quedan excluidos por construcción `failed`, `expired` y `consumed`.
Verificado en vivo caso por caso.

> **Nota metodológica honesta:** el primer intento de probar el caso “vencido”
> movía `expires_at` con service_role y **falló**: el guard de 0097 hace
> inmutables los datos declarados del intento (`Los datos declarados de un
> intento de carga son inmutables`), de modo que el `UPDATE` se rechazaba y el
> intento nunca vencía — el fallo estaba en la prueba, no en la política. La
> prueba se corrigió insertando un intento con fechas ya pasadas (única vía
> válida, el CHECK solo exige `expires_at > created_at`); con un intento
> genuinamente vencido la carga directa se rechaza.

---

## 13. Política UPDATE

**No se crea ninguna.** El bucket `evidences` no tenía política UPDATE y sigue
sin tenerla: RLS deniega por defecto. Pruebas de regresión (casos 14 y 15 de la
suite viva) fijan este comportamiento.

---

## 14. Política DELETE

`evidences_delete_textiles` se **elimina sin reemplazo**. Tras 0099 el bucket
`evidences` **no tiene ninguna política DELETE para `authenticated`**: ni CPR
(que jamás la ha tenido) ni textil pueden borrar desde el cliente — sin excepción por
rol, creador ni organización, y con independencia del estado del intento.

---

## 15. Eliminación server-only

`removeTextileEvidenceObject` pasó de usar la sesión del usuario al **cliente
administrativo** (`import "server-only"`), y ahora **no recibe la ruta**: recibe
el `intentId` y **lee `object_path` de la base**, de modo que una ruta arbitraria
del cliente es imposible por construcción. Cadena de verificación antes de
cualquier `remove`:

1. El intento existe y su `bucket_id` es `evidences`.
2. La ruta cumple la forma canónica `{org}/textiles/{intent}/{archivo}`
   (validador puro `isCanonicalTextileObjectPath`: exactamente 4 segmentos, sin
   `..`, sin backslash, sin NUL, sin segmentos vacíos, UUID en su sitio).
3. El intento **no** está `consumed`.
4. El intento **no** tiene `evidence_id`.
5. **No** existe fila en `textile_evidences` con ese `file_path`.
6. Solo entonces se ejecuta `remove` con el cliente administrativo y se
   comprueba el **resultado real**; el cierre del intento sigue haciéndose con
   la RPC server-only de T9E.3 **solo** si el retiro se confirmó, de modo que un
   fallo deja el intento como candidato **recuperable**.

Los cinco llamadores (limpieza oportunista, re-barrido de subidas tardías,
intento vencido en finalize, objeto inválido y firma inválida) pasan ahora el
`intentId`.

---

## 16. Protección de evidencias consumidas

Doble barrera, verificada en vivo:

- **Storage RLS:** no hay política DELETE → el creador, otro admin de la
  organización, otra organización y anon fallan **todos** al intentar borrar el
  objeto de una evidencia finalizada; la evidencia sigue apuntando a un objeto
  real.
- **Aplicación:** aunque la llamada venga del servidor, el helper se niega si el
  intento está `consumed`, si tiene `evidence_id` o si la ruta pertenece a una
  evidencia; y la RPC de limpieza devuelve `consumed_untouchable`.

---

## 17. Comportamiento de la signed upload URL (verificado, no supuesto)

Experimento real contra staging:

```
SU · createSignedUploadUrl (usuario)      → emitida
SU · uploadToSignedUrl con cliente ANON   → *** PERMITIDO (el token autoriza por sí solo) ***
```

**La URL firmada autoriza por sí misma**: funciona incluso sin JWT de usuario y
por tanto **sin pasar por la política INSERT de `authenticated`**. Dos
consecuencias, ambas centrales para el diseño:

1. Endurecer la política INSERT de `authenticated` **no rompe** el flujo
   legítimo, que sube por URL firmada emitida tras crear el intento.
2. La política INSERT sigue siendo necesaria y suficiente para cerrar la carga
   **directa con SDK/JWT**, que es la vía que el atacante controla.

La ruta queda fijada al emitir el token, así que no puede redirigirse a otra.

---

## 18. Subida tardía y ventana de gracia

La defensa de T9E.3 se conservó y se **volvió a verificar** tras 0099: el token
firmado sigue reutilizable tras un retiro (`el token firmado SE REUTILIZÓ tras
el retiro`), el re-barrido dentro de la ventana de gracia detecta el objeto
reaparecido y lo retira (`el objeto tardío fue retirado por el re-barrido`), y
el intento —ya `expired`— **jamás vuelve a ser finalizable**
(`INTENT_NOT_PENDING`). La nueva Storage RLS no interfiere: el re-barrido usa el
cliente administrativo, no una política de cliente.

---

## 19. Baseline CPR (antes de 0099)

Documentado ejecutando el flujo real antes de aplicar la migración:

| Operación CPR | Resultado baseline |
|---|---|
| INSERT en `{org}/{evidence_id}/archivo` | PERMITIDO |
| Descarga por URL firmada | PERMITIDO |
| DELETE directo desde cliente | RECHAZADO (CPR jamás lo ha tenido) |
| UPDATE / upsert | RECHAZADO (sin política UPDATE) |

El flujo CPR sube con la **sesión del usuario** (`supabase.storage.upload`, sin
upsert) tras crear la fila de evidencia, de modo que depende de la política
INSERT — que es exactamente lo que la política legada preserva.

---

## 20. Validación CPR posterior (regresión)

Caso 23 de la suite viva, ejecutado **después** de aplicar 0099:

```
✔ 23. CPR: INSERT en {org}/{evidence_id}/archivo y descarga → SIGUEN FUNCIONANDO
```

Incluye además que CPR **siga sin poder borrar** desde el cliente. Si 0099
hubiera roto la carga CPR, esta prueba habría fallado explícitamente con el
mensaje `*** 0099 ROMPIÓ la carga CPR ***`.

Si CPR conserva alguna política histórica poco estricta **fuera** del prefijo
textil, se preservó deliberadamente por alcance y **no** se amplió.

---

## 21. Validación CSV anterior

```ts
if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e) || b >= 0x80) printable++;
return printable / sample.length >= 0.95;
```

Cualquier byte `>= 0x80` contaba como imprimible y solo se miraban los primeros
8 KB, así que binario evidente (relleno `0xA0`, UTF-16, secuencias inválidas)
pasaba como CSV.

---

## 22. Decodificación UTF-8 estricta

```ts
text = new TextDecoder("utf-8", { fatal: true }).decode(body);
```

Se decodifica el contenido **completo**. El modo `fatal` rechaza secuencias
truncadas, sobrelargas (*overlong*), bytes de inicio ilegales (`FF`, `FE`, `C0`,
`C1`) y subrogados aislados.

---

## 23. Tratamiento del BOM

Se acepta un BOM UTF-8 inicial (`EF BB BF`) y se descarta antes de decodificar.
Un archivo compuesto **solo** por el BOM se rechaza (queda vacío).

---

## 24. Controles permitidos

Únicamente tabulación (`\t`), salto de línea (`\n`) y retorno de carro (`\r`).
Se rechazan NUL, el resto de controles C0, DEL (`0x7F`) y los controles C1
(`U+0080`–`U+009F`). También se rechaza el contenido vacío o compuesto solo por
espacios y controles.

---

## 25. Limitaciones de seguridad del CSV (honestas)

Validar UTF-8 **distingue texto de binario evidente y nada más**. No interpreta
el CSV, no evalúa fórmulas, no transforma el archivo y **no previene inyección
de fórmulas en hojas de cálculo ni malware**. **UTF-8 válido no equivale a
archivo seguro.**

---

## 26. Migración 0099

Única migración del sprint. Contiene: `drop` de `evidences_insert`; creación de
`evidences_insert_legacy` y `evidences_insert_textiles`; `drop` de
`evidences_delete_textiles`; ninguna política UPDATE; ningún cambio de datos ni
de objetos; bucket privado intacto; nada concedido a `anon`; rollback completo
documentado en la cabecera.

> **Limitación técnica demostrada:** `comment on policy … on storage.objects`
> falla con `must be owner of relation objects` (SQLSTATE 42501) — el esquema
> `storage` pertenece a Supabase y el rol de migración no es su dueño, aunque sí
> puede crear y eliminar políticas. El primer `db push` falló por eso y la
> transacción **revirtió limpiamente** (políticas previas intactas, `0099` sin
> registrar, verificado). Se retiraron los `COMMENT` y la documentación de cada
> política vive en los comentarios SQL y en este informe — **no** se dividió en
> una segunda migración.

---

## 27. Consultas de verificación

```sql
-- Registro de la migración
select version, name from supabase_migrations.schema_migrations where version = '0099';

-- Políticas reales (se inspeccionan las EXPRESIONES, no los nombres)
select policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
 order by policyname;
```

Resultado en vivo tras aplicar 0099:

| Política | CMD | Roles |
|---|---|---|
| `evidences_insert_legacy` | INSERT | `{authenticated}` |
| `evidences_insert_textiles` | INSERT | `{authenticated}` |
| `evidences_select` | SELECT | `{authenticated}` |

Comprobaciones explícitas ejecutadas sobre las expresiones (todas ✔): ninguna
política DELETE ni UPDATE para `authenticated` en el bucket; ninguna política
DELETE cubre `(foldername(name))[2]='textiles'`; el INSERT textil exige
`object_path = objects.name`, `created_by = auth.uid()`, `status='pending'`,
`expires_at > now()` y `evidence_id IS NULL`; existe la política legada que
excluye el prefijo textil; nada concedido a `anon`; **bucket sigue privado**.

---

## 28. Pruebas estáticas

`tests/evidences/textiles-storage-policies-static.test.ts` — **18/18 verde**.
Verifica sobre el código y la migración reales: ausencia de políticas
DELETE/UPDATE; coincidencia exacta `object_path = name` (y ausencia de `LIKE` /
`position` / prefijos); `created_by = auth.uid()`; `pending` + vigencia +
`evidence_id is null`; preservación de la condición de 0016 en la política
legada; revalidación de rol y módulo; que 0099 no abra el bucket ni conceda a
`anon` ni modifique datos; que la eliminación use el cliente administrativo y
**no** el de sesión; que la ruta se lea de la base y se valide su forma; que las
barreras se evalúen **antes** del `remove`; que ningún módulo `"use client"`
importe el cliente administrativo; y que el CSV use `TextDecoder` fatal sin
rastro de la regla `byte >= 0x80`.

---

## 29. Pruebas RLS reales (staging)

`tests/rls/textiles-t9e4-storage-policies.test.ts` — **23/23 verde** con dos
organizaciones y cuatro usuarios (A1 creador, A2 admin de la misma organización,
A3 sin membresía, B de otra organización) más `anon`:

INSERT: sin intento, nombre cambiado, `intent_id` cambiado, subdirectorio extra,
intento ajeno en ambos sentidos, otra organización, `anon`, sin membresía,
vencido, `failed` y `expired` → **todos rechazados**; ruta exacta de intento
propio y vigente → **permitido**.
UPDATE: upsert y segunda carga → rechazados.
DELETE: creador, otro admin, otra organización, `anon`, y también sobre un
objeto `pending` → **todos rechazados**, con la evidencia intacta.
Server-only: retirada de un pending seguro permitida; objeto de evidencia
consumida intocable.
CPR: carga y descarga siguen funcionando.

**Suites previas revalidadas tras 0099:** T9E.1 multi-tenant **17/17**, T9E.2/
T9E.3 integridad **17/17** (incluye el experimento del token y el re-barrido).

> La suite T9E.1 tenía dos casos que subían a una ruta textil con un
> `intent_id` **inventado**; con 0099 esa carga se rechaza correctamente, así
> que se adaptaron al mecanismo legítimo (intento real + URL firmada). El objeto
> de esos casos existe igual y las aserciones de aislamiento y expiración se
> mantienen intactas.

---

## 30. Prueba funcional (CSV)

`tests/evidences/textiles-evidence-csv-utf8.test.ts` — **18/18 verde**,
invocando los helpers **reales** de producción. Aceptados: ASCII, tildes, `ñ`,
BOM, tabulaciones, CRLF y Unicode variado (símbolos, CJK, emoji). Rechazados:
`FF FF FF`, `FE` aislado, secuencia truncada, *overlong* (`C0 80`, `C1 BF`),
NUL, controles `0x01`/`0x02`/DEL/C1, binario sin NUL con UTF-8 inválido,
archivo vacío, solo BOM, solo espacios, PDF renombrado a `.csv`, ZIP y DOCX
renombrados a `.csv`, y relleno `0xA0` (regresión explícita de la regla débil).

---

## 30-bis. Prueba manual mínima §22 (dev server, QA desechable)

Usuario QA desechable con organización y módulo textil; sesión inyectada por
cookies minteadas en servidor (sin teclear la contraseña en el formulario);
eliminado al terminar. Resultados **reales**:

| § | Comprobación | Resultado |
|---|---|---|
| 1–3 | Intento + PDF por UI; destino de los bytes | `PUT` a `…supabase.co/storage/v1/object/upload/sign/{org}/textiles/{intent}/manual-t9e4.pdf` — **directo a Storage** |
| 4 | Finalización | 3 intentos `consumed`, los 3 **ligados** a evidencia |
| 5 | `DELETE` del objeto finalizado con el JWT del usuario | **`Access denied`** (HTTP 400) |
| 6 | La evidencia sigue descargando | **HTTP 200**; 3/3 objetos de evidencias intactos |
| 7 | Carga a ruta textil inventada | **`new row violates row-level security policy`** |
| 8 | Carga a ruta exacta sin intento vigente | **rechazada** (HTTP 400) |
| 9 | Overwrite (`PUT`) | **`new row violates row-level security policy`** |
| 10 | Intento no finalizado + limpieza server-only | el CSV inválido dejó intento `failed`, `evidence_id=null` y **objeto retirado** de Storage |
| 11 | CSV UTF-8 con tildes y `ñ` | **aceptado** |
| 12 | CSV con bytes `0xFF` | **rechazado**: “El contenido del archivo no corresponde al tipo declarado.” |
| 13 | CSV con BOM UTF-8 | **aceptado** |
| 14 | Flujo CPR | cubierto por el caso 23 de la suite viva (carga + descarga + sin DELETE) |

Los ataques 5 y 7–9 se lanzaron por REST contra Storage con el **JWT real** de
la sesión del usuario, que es exactamente lo que haría alguien evitando la UI.

Limpieza posterior: 3 objetos retirados, organización y dependencias
eliminadas, usuario QA rotado + baneado + soft-delete (el hard-delete lo impide
la FK de intentos consumidos: residuo conocido y no sensible), credencial local
borrada.

---

## 31. `npm ci`

Instalación desde cero real: `rm -rf node_modules .next`, `rm -f
tsconfig.tsbuildinfo`, `npm cache verify`, `npm ci`. Node v22.23.1, npm 10.9.8.
No se ejecutó `npm audit fix --force`; las vulnerabilidades moderadas
preexistentes se documentan como riesgo separado (§36) sin actualizar
dependencias fuera de alcance.

---

## 32. Typecheck

`npm run typecheck` — sin errores.

## 33. Lint

`npm run lint` — **0 errores**. Persiste **1 warning ajeno y preexistente**
(`domainSrc` sin uso en `tests/evidences/textiles-evidences-hardening.test.ts`,
archivo del sprint T5.1 no tocado en T9E.4), ya documentado en T9E.3 y fuera de
alcance.

## 34. Build

`npm run build` — correcto.

## 35. Suites

`npm run test:all` — **exit code 0** (verificado capturando el código de salida
real, sin filtros de `grep`), incluidas las dos suites nuevas encadenadas
(`test:textiles-evidence-csv-utf8`, `test:textiles-storage-policies-static`).
Las suites RLS vivas se ejecutan aparte (exigen BD): T9E.1 **17/17**, T9E.2/3
**17/17**, T9E.4 **23/23**.

> **Corrección honesta sobre el informe T9E.3.** Al capturar aquí el código de
> salida real aparecieron **tres aserciones estáticas en rojo que ya lo estaban
> al cerrar T9E.3** y que su informe dio por verdes: dos checks “sin
> service_role en actions/db” (escritos en el sprint T5, cuando la regla era
> absoluta) que T9E.3 invalidó al introducir deliberadamente el cliente
> administrativo en `lib/db` para las RPC `*_server`, y dos aserciones sobre la
> firma de `cleanupExpiredUploadIntents`/`recordTextileUploadIntentCleanupRpc`
> que T9E.3 cambió al añadir el actor explícito. En T9E.3 la validación se leyó
> a través de `grep … | head -30`, que truncó la salida y ocultó el fallo; el
> `test:all` de aquel sprint **no estaba realmente verde**. En T9E.4 los checks
> se acotaron a la arquitectura real (el cliente administrativo se permite
> **solo** en `finalizeTextileEvidenceUploadRpc`,
> `recordTextileUploadIntentCleanupRpc` y `removeTextileEvidenceObject`, y sigue
> prohibido en la Server Action y la clave incrustada) y las aserciones se
> sincronizaron con el código. Desde ahora la validación se reporta por código
> de salida, no por filtrado de texto.

---

## 36. Riesgos residuales (honestos)

- **La validación de contenido no es antimalware.** Ni la estructura OOXML ni
  el UTF-8 del CSV detectan contenido hostil dentro de un archivo bien formado.
- **Storage RLS no inspecciona el archivo.** Vincula la **ruta** a un intento;
  tamaño, MIME y firma se verifican en la finalización server-only.
- **La URL firmada de subida autoriza por sí sola y es reutilizable ~2 h.**
  Mitigado por el re-barrido en ventana de gracia y por la imposibilidad de
  finalizar un intento no `pending`; no eliminado (comportamiento de Supabase).
- **Vulnerabilidades moderadas de dependencias** reportadas por `npm audit`: no
  se tocaron por alcance (exigirían `--force` o actualizaciones mayores).
- **CPR fuera de Storage:** los 9 fallos RLS preexistentes de
  `isolation.test.ts` siguen sin corregir, por alcance.
- **Residuo por diseño:** intentos `consumed` y cascarones de organización
  quedan protegidos por el guard 0097 y el `audit_log` append-only.

---

## 37. Despliegue

1. Desplegar el código (la eliminación server-only debe estar viva **antes o a
   la vez** que 0099: al retirar la política DELETE, cualquier ruta de limpieza
   que aún usara la sesión del usuario dejaría de funcionar).
2. `npx supabase migration list --db-url "$SUPABASE_DB_URL"` → el remoto debe
   terminar en `0098`.
3. `npx supabase db push --dry-run --db-url "$SUPABASE_DB_URL"` → debe aparecer
   **solo** `0099`.
4. `npx supabase db push --db-url "$SUPABASE_DB_URL"`.
5. Verificar políticas con las consultas de §27 y ejecutar la suite T9E.4.

---

## 38. Rollback (documentado; NO ejecutar sin decisión explícita)

Sin `db reset`. No borra objetos, evidencias ni intentos, y preserva CPR:

```sql
drop policy if exists evidences_insert_textiles on storage.objects;
drop policy if exists evidences_insert_legacy   on storage.objects;

create policy evidences_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidences'
    and public.has_org_role(
      public.safe_uuid((storage.foldername(name))[1]),
      array['admin', 'quality', 'consultant']
    )
  );

create policy evidences_delete_textiles on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'evidences'
    and (storage.foldername(name))[2] = 'textiles'
    and public.has_org_role(
      public.safe_uuid((storage.foldername(name))[1]),
      array['admin', 'quality', 'consultant']
    )
  );
```

> **ADVERTENCIA:** restaurar `evidences_delete_textiles` **reabre la pérdida de
> evidencias finalizadas** por borrado directo desde el navegador; restaurar
> `evidences_insert` genérico **reabre la carga textil en rutas arbitrarias**.
> Ejecutar las consultas de §27 antes y después para dejar constancia del
> estado. El rollback correcto suele ser corregir hacia adelante con una nueva
> migración.

---

## 39. Checklist final de revisión humana

- [x] INSERT textil arbitrario cerrado; exige intento **exacto**, propio,
      `pending`, vigente y sin evidencia ligada, con rol y módulo revalidados.
- [x] Ruta modificada, `intent_id` ajeno, subdirectorio, otra organización,
      `anon` y usuario sin membresía → rechazados (verificado en vivo).
- [x] Intentos vencido, `failed` y `expired` → rechazados (verificado en vivo).
- [x] UPDATE/upsert textil prohibido; sin política UPDATE creada.
- [x] DELETE textil prohibido para **todos** los clientes, incluido el creador y
      sobre evidencias finalizadas.
- [x] Eliminación física legítima solo con cliente administrativo server-only,
      con la ruta leída de la base y las barreras antes del `remove`.
- [x] Limpieza fallida sigue recuperable; subida tardía retirada en la ventana
      de gracia; el intento nunca vuelve a ser finalizable.
- [x] Bucket privado; nada concedido a `anon`.
- [x] CPR conserva carga y descarga (regresión verde) y sigue sin DELETE.
- [x] CSV con UTF-8 fatal: tildes/ñ/BOM aceptados; `0xFF`, truncados,
      *overlong*, NUL y controles rechazados.
- [x] `0099` es la única migración nueva; `0070`–`0098` intactas.
- [x] `npm ci` limpio, typecheck, lint (0 errores), build y `test:all` verdes;
      suites RLS T9E.1/T9E.2-3/T9E.4 verdes contra staging.
- [x] Sin secretos en repositorio ni en el ZIP.
