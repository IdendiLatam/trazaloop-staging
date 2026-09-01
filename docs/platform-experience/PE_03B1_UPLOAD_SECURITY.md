# PE-03B1 · Quién sube un vídeo, y dónde

> **SUPERSEDED BY PRODUCT OWNER DECISION · 31 de agosto de 2026**
>
> Este documento describe el tope de **200 MB por archivo** que regía cuando se
> escribió. El propietario del producto lo **revocó en PE-03B3, sin sustituirlo
> por otro número**, y también dejó dicho que Trazaloop **no impone una duración
> máxima**.
>
> El texto se conserva tal como se escribió: es el informe de lo que se hizo
> entonces, y reescribirlo dejaría sin explicación las decisiones que sí se
> tomaron con esa regla puesta. Lo que hoy rige está en
> [PE_03B3_LARGE_MEDIA_ARCHITECTURE.md](PE_03B3_LARGE_MEDIA_ARCHITECTURE.md).


Este documento existe para decir una cosa incómoda con claridad, porque
escribirla mal sería peor que no escribirla.

---

## 1 · La política de Storage NO es lo que impide subir un tutorial

PE-03A lo midió, y 0099 lo tenía escrito desde antes:

> «Una *signed upload URL* autoriza POR SÍ MISMA: se comprobó que
> `uploadToSignedUrl` funciona incluso desde un cliente ANÓNIMO, sin JWT de
> usuario y por tanto **sin pasar por la política INSERT** de `authenticated`.»

Es un hecho, no una teoría. Y significa que una frase como «la política del cubo
impide que alguien suba un tutorial» sería **falsa**, y daría tranquilidad donde
no la hay.

**La frontera real es esta secuencia:**

```
1 · tutorial_reserve_upload   ── exige is_platform_superadmin()
                                 y elige ELLA la ruta
2 · se firma esa ruta EXACTA  ── el token queda atado a ella
3 · el navegador sube         ── los bytes, directos a Storage
4 · tutorial_finalize_upload  ── el servidor lee el objeto REAL y compara
```

Lo que impide subir un tutorial es que **solo un superadministrador obtiene una
reserva**, y sin reserva no hay ruta que firmar.

Hay una comprobación dedicada a esto —la **O** de `pe03b1-upload-security`— que
demuestra lo que sí protege en vez de fingir lo otro: una persona normal no
consigue reserva, y tampoco puede firmar una subida a una ruta inventada.

---

## 2 · Y aun así, la política se escribe restrictiva

Porque cerrarla **no rompe el flujo legítimo** —es exactamente lo que 0099
comprobó— y sí cierra la subida directa con el SDK y una sesión.

| Operación | Quién |
|---|---|
| `SELECT` | personal de plataforma, o cualquiera con sesión **solo sobre la versión vigente** |
| `INSERT` | superadministrador **y** ruta con reserva vigente |
| `UPDATE` | **nadie** · sin política, deny-by-default |
| `DELETE` | **nadie desde el cliente** |
| `anon` | nada |

**Sin política de `UPDATE`, a propósito.** 0099 comprobó en vivo que sin ella un
`upsert` sobre un objeto existente es rechazado, y añadir una solo podría abrir
permisos. Un reemplazo es siempre un objeto nuevo.

### El fallo que costó encontrar, y lo que enseñó

La primera versión de la política de lectura llevaba la comprobación escrita
dentro del `using`:

```sql
and exists (select 1 from platform_tutorial_versions v where …)
```

No funcionaba. Una persona normal no podía firmar el vídeo vigente, y el error
decía «Object not found» — que no señala a ninguna parte.

**La subconsulta se evalúa con la identidad de quien pregunta**, así que la RLS
de `platform_tutorial_versions` —que solo deja leer a personal de plataforma— le
devolvía cero filas. La comprobación no comprobaba lo que parecía.

Es el mismo mecanismo que 0141 documentó para las vistas de Intelligence, y se
resuelve igual: una función `security definer`, como
`storage_object_matches_upload_intent` en 0101.

---

## 3 · Los bytes no pasan por Vercel

No es una preferencia de diseño. `next.config.ts` dejó las Server Actions en su
límite por defecto de **1 MB** cuando T9E.1 cambió el transporte, y lo explica:

> «T9E.1 sustituyó ese transporte por CARGA DIRECTA a Supabase Storage […] los
> bytes ya no atraviesan Next.js.»

Un tutorial de tres minutos supera ese límite por un orden de magnitud. Hay una
comprobación que falla si alguien vuelve a fijar `bodySizeLimit`.

---

## 4 · La ruta la decide la base

```
{tutorial_id}/{version_id}/{nombre_seguro}
```

Quien reserva **no propone dónde escribir**: propone un nombre, y la función lo
limpia y lo coloca en el tercer segmento. Los dos primeros los pone ella.

El nombre es **cosmético**: sirve para que quien mire el cubo entienda qué hay.
**Jamás autoriza nada** — 0015 ya avisaba de esto y 0101 lo cerró.

Se comprobó con nombres hostiles: `../../../etc/passwd`, `a/b/c.mp4`, con
espacios, con etiquetas. Ninguno sale de su carpeta.

Y la limpieza está escrita **dos veces** —en la base y en el dominio— porque el
navegador necesita saber a qué ruta va a escribir antes de escribir. Hay una
comprobación que falla si las dos dejan de coincidir.

---

## 5 · Lo declarado frente a lo real

Storage vincula la ruta a una reserva pero **no inspecciona el contenido**. Lo
dejó escrito 0099 y sigue siendo verdad. Así que entre subir y publicar hay un
paso que lee el objeto y compara: tamaño, tipo y resumen.

Quien declara «10 MB de vídeo» y sube otra cosa **no publica nada**: la versión
queda `failed`, y un `CHECK` exige `verified` para tener vigencia. No hay que
acordarse de comprobarlo al publicar.

### Por qué esa función devuelve un estado en vez de fallar

La primera versión marcaba la versión como fallida y **lanzaba** una excepción.
No funcionaba, y el motivo es instructivo: **la excepción deshace la
transacción**, así que la marca se perdía y la versión se quedaba en `uploaded`
para siempre. Lo encontró una prueba.

Y arreglarlo no era buscar cómo persistir a pesar del error. Era ver que **no es
un error**: que un archivo no coincida con lo reservado es un *resultado* —de un
cliente roto, o de uno hostil—, no una excepción del sistema. Se registra y se
devuelve.

Lo que sí sigue siendo excepción es no tener permiso o pedir una versión que no
existe: eso son errores de quien llama.

---

## 6 · Los tres filtros de formato

Solo `video/mp4` y `video/webm`: los dos que un navegador reproduce sin ayuda.
Un `.mov` en el cubo es un tutorial que alguien no puede ver, y no se sabría
hasta que alguien lo intentara.

Se comprueban los tres, **porque cada uno miente por su lado**:

| | Lo escribe | Se comprueba en |
|---|---|---|
| La extensión | quien nombra el archivo | dominio |
| El tipo declarado | el navegador | dominio y base |
| **La firma binaria** | el programa que produjo el archivo | finalización |

Los dos primeros se cambian a mano en treinta segundos. Hay una comprobación con
un archivo que **miente en los dos**: extensión `.mp4`, tipo `video/mp4`, y bytes
de PDF. Solo el tercero lo detiene.

**La firma se decide con un prefijo de 4 KB**, no con el archivo. Cargar 200 MB
en memoria para mirar doce bytes convertiría cada subida en un pico de memoria
del servidor, y con dos a la vez se nota.

> **SUPERSEDED · PE-03B3.** El tope de 200 MB ya no existe.

---

## 7 · Doscientos megas

Decisión humana congelada, y comprobada en **cuatro** sitios:

| Dónde | Qué hace |
|---|---|
| `TUTORIAL_MAX_FILE_BYTES` | el dominio rechaza antes de llamar |
| `tutorial_reserve_upload` | la base rechaza la reserva |
| `CHECK` de la tabla | ni escribiendo directamente |
| `file_size_limit` del cubo | ni con una URL firmada |

El último es el que importa, y es la respuesta a §14 del encargo: **una URL
firmada no pasa por la política, pero sí por el límite del cubo.** Es la única
barrera de tamaño que un token firmado no rodea.

**200 MB justos se aceptan**; uno más, no. Un límite que rechaza el caso justo
es un límite mal puesto.

> **SUPERSEDED · PE-03B3.** El tope de 200 MB ya no existe.

---

## 8 · Lo que queda por hacer, dicho

**El resumen SHA-256 se calcula sobre el archivo entero en memoria.** Es lo que
significa un resumen, pero para 200 MB es el techo de esta implementación: un
pico de memoria del servidor por cada finalización.

> **SUPERSEDED · PE-03B3.** El tope de 200 MB ya no existe.

Hoy no importa —las finalizaciones son escasas y las hace una persona—, pero se
dice aquí en vez de descubrirse en producción. Si algún día se suben vídeos
grandes con frecuencia, hay que calcularlo en flujo.

**La duración no se lee.** Se guarda si alguien la aporta, y **nula si no**. Leer
la duración de un contenedor MP4 exige interpretarlo, y una duración inventada
es peor que ninguna: se muestra junto al vídeo y la gente la cree.
