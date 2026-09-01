# PE-03B5 · El endurecimiento, revalidado antes de cerrar

Todo lo que sigue son **invariantes que ya se ganaron** y que se pueden perder
sin que nadie lo note. Un invariante no falla con un error: falla con un
silencio.

---

## 1 · Ningún tope de producto, por ninguna puerta

Revalidado en cuatro sitios distintos, porque el tope de 200 MB vivía en cuatro.

| Dónde | Cómo se comprueba |
|---|---|
| El código del subsistema | Ninguna constante `MAX_*`, ningún `200 * 1024 * 1024` |
| La última migración que toca el tamaño | 0160 solo exige `> 0`, y ninguna posterior lo revierte |
| El cubo | `file_size_limit = null`, leído por la API de Storage |
| **La base de verdad** | **Se reserva 8 GB y se acepta; se reserva 0 y se rechaza** |

La cuarta es la que vale. Las tres primeras leen texto; esa lo intenta. Si
hubiera un techo en cualquier capa —restricción, función, cubo, proveedor—,
reservar ocho gigas fallaría, viniera de donde viniera.

### Y ninguna duración máxima

Se finaliza una versión declarando **ocho horas** y se acepta. `duration_seconds`
sigue siendo informativa y opcional: nunca decide si algo se publica, y si no se
pudo leer se guarda nula — jamás se inventa.

### Una trampa que casi me como

La primera versión de esta suite leía **las tres migraciones concatenadas** y
encontraba el tope de 200 MB… en el texto de 0159, que lo tenía porque **así
fue**.

Las migraciones son acumulativas: su texto es la historia, no el estado. Es
exactamente la distinción que este subsistema defiende en los datos —una versión
retirada sigue existiendo— y la estuve a punto de romper en las pruebas. Ahora
se lee 0160 sola, y el estado real se comprueba contra la base.

---

## 2 · La memoria no crece con el vídeo

| | |
|---|---|
| La verificación | `createHash` incremental sobre `getReader()`. Ni `arrayBuffer()` ni `.download()` |
| Quien la llama | `finalizeTutorialUpload` no materializa nada |
| El trozo del resumen | ≤ 256 KB declarados |
| El navegador | `file.slice()`, nunca `await file.arrayBuffer()` |

El pico medido en PE-03B3 sigue siendo el de referencia: **64 KB sobre un
archivo de 4 MB**.

`.download()` merece la mención expresa: devuelve un `Blob`, y un `Blob` ya está
entero en memoria antes de que uno pueda mirarlo. Usarlo habría dejado el
problema donde estaba mientras el código parecía arreglado.

---

## 3 · El transporte, y su frontera

- Se usa el extremo **reanudable**, no una sola petición.
- El desplazamiento al reintentar lo dice el **servidor**, con `HEAD`. Nunca una
  cuenta local.
- **Ninguna credencial de servicio baja al navegador.** La subida se autentica
  con el JWT de la sesión de la propia persona.

### La reserva es la frontera; el reloj no

```sql
bucket_id = 'tutorial-media'
and is_platform_superadmin()
and tutorial_media_has_reservation(name)   -- file_state in ('reserved','uploaded')
```

`upload_expires_at` **no está** en el predicado, y esa ausencia es el cambio más
importante de PE-03B3: con él, una subida de dos horas cruzaba su propia
caducidad a mitad de camino y el vídeo se perdía por un reloj.

La constante se llama `TUTORIAL_UPLOAD_HORIZON_SECONDS` y no `_TTL_`. El nombre
es parte del arreglo: «TTL» es lo que hacía pensar que era un plazo de subida.

---

## 4 · La reproducción

| | |
|---|---|
| Plazo | 2 h — de **seguridad**, y menor que el horizonte de la reserva |
| Renovación | Al 90 %, conservando segundo, volumen y si estaba sonando |
| Qué se firma | **Solo la vigente.** La firma no acepta un `versionId` de quien llama |
| Al pintar una pantalla | **Nada.** Ni consulta ni firma |

La tercera se comprueba de dos formas: leyendo que ninguna acción de cliente
maneja versiones, y **comprobando contra la base** que la URL firmada apunta al
objeto de la versión vigente y no al de la histórica.

---

## 5 · Las averías no se presentan como ausencias

El tutorial de pantalla distingue **tres** respuestas y la bienvenida **dos**, y
las dos decisiones son deliberadas.

Donde hay un botón que alguien pulsó, una avería tiene que decirse: si se
presentara como «esta pantalla no tiene tutorial», nadie volvería a pulsarlo y el
vídeo estaba ahí. Donde nadie pulsó nada —la bienvenida—, no se abre nada y se
sigue trabajando: **es acompañamiento, no una puerta**.

La comprobación empareja cada estado con su mensaje **en la misma expresión**.
La primera versión lo hacía por cercanía en el fichero, y dos ramas contiguas se
tocan: daba un falso positivo.

Y ningún componente del navegador lanza. Un fallo del tutorial no puede llevarse
por delante la pantalla en la que vive.

---

## 6 · Nada técnico llega al cliente

Ni `objectPath`, ni `content_hash`, ni `storage_path`, ni `uploadedBy`, ni
`versionId`. Y en los **textos que se pintan** —extraídos del JSX, no del
código— no aparecen «TUS», «RLS», «bucket», «Storage», «URL firmada» ni «SHA».

El error crudo del almacenamiento se traduce siempre, y ningún mensaje inventa
un tope en megas o gigas.

**El techo del proveedor se documenta, no se promete.** Se puede escribir lo que
se midió; lo que no se puede es ponerlo en una pantalla como si fuera un
contrato, porque el proveedor lo cambia cuando quiere. Una comprobación busca
`48,8`, `52428800000` y `GiB` en los componentes: cero.

---

## 7 · La credencial de servicio no se ha extendido

Sigue habiendo **un solo módulo** que la usa —`lib/db/tutorial-object-cleanup.ts`—
y **una sola acción** que lo invoca: `discardCandidateAction`.

Comprobado por separado:

| | |
|---|---|
| Módulos que la usan | exactamente 1, y es el esperado |
| Invocaciones | exactamente 1, dentro de `discardCandidateAction` |
| Antes de invocarla | se comprueba `isSuperadmin` y `effective_from is null` |
| Antes de borrar el objeto | se comprueba que **ninguna versión lo referencia** |
| El cubo | sigue **sin política de DELETE** |

La comprobación de referencias no es paranoia: **una versión repuesta comparte
objeto con la original**. Borrar el de una candidata repuesta se llevaría el
vídeo de una publicada.

La ausencia de política de DELETE en el cubo es lo que obliga a este rodeo, y es
deliberada: 0099 documentó el fallo exacto en `evidences` — con la política
puesta, un objeto referenciado por una versión publicada se podía borrar desde el
cliente.

---

## 8 · Ni planes, ni cuotas, ni PE-04

El subsistema entero —17 ficheros— no menciona `organization_modules`,
`plan_code`, `access_mode`, `entitlement`, `storage_limit`, `quota`, `coupon` ni
`payment`.

### Y los medios de tutorial NO cuentan en la cuota de ninguna empresa

Verificado contra la **definición de la vista**, no supuesto.
`v_organization_plan_usage` suma:

```
evidences + organizations.logo_size_bytes + trazadoc_file_documents + textile_evidences
```

`platform_tutorial_versions` no aparece. Un vídeo de plataforma no consume el
plan de un cliente. Y hay una comprobación que recorre **todas** las migraciones
buscando cualquier vista de uso que sume medios de tutorial.

Ninguna tabla de tutoriales tiene `organization_id`. Un tutorial es contenido de
plataforma.

---

## 9 · El fallo, provocado a propósito

| Qué se provoca | Qué pasa |
|---|---|
| Se borra el objeto de la versión vigente | La firma se emite —Storage no comprueba presencia— y **la descarga falla limpiamente** |
| Y la consulta de metadatos | **Sigue funcionando.** La aplicación no se cae |
| Se pide una clave desconocida | Ausencia, **no avería** |
| Se sube un archivo que miente sobre su tamaño | Queda `failed`, y **publicarlo se rechaza** |

La primera merece una nota: Storage firma rutas que no existen. Así que lo que
se comprueba no es que la firma se niegue —no puede— sino que **lo que llega no
es contenido** y que nada más se rompe por el camino.

---

## 10 · Y el mismo vídeo dos veces se admite

Decisión congelada: un `content_hash` repetido no se rechaza ni avisa. Se
comprueba que **no hay un rechazo incorrecto**, y no se añadió ninguna función
para «mejorarlo».
