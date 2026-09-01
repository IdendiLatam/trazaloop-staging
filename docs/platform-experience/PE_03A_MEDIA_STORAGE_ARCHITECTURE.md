# PE-03A · Dónde viven los vídeos, y cómo llegan y salen

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


Los tutoriales son **contenido de plataforma**: los administra Trazaloop, no las
empresas. Eso decide casi todo lo que sigue.

---

## PET-01 · Un cubo propio, privado

**`tutorial-media`. Nuevo, privado.**

No se reutiliza ninguno de los tres que hay. `evidences`, `organization-assets` y
`trazadocs-documents` tienen todos la misma convención —`{organization_id}/…`— y
sus políticas operan sobre el primer segmento de la ruta. Un tutorial no tiene
empresa, así que **no puede** tener ese primer segmento, y meterlo ahí obligaría
a poner un `organization_id` falso o a relajar políticas que hoy son estrechas.

Y hay un precedente exacto: 0049 creó un cubo aparte para el logo de empresa con
este mismo razonamiento —«un logo no es una evidencia técnica, no se mezclan»—.

**Privado, no público**, porque la sonda demostró que no hace falta renunciar a la
privacidad para que el vídeo se pueda adelantar: un cubo privado con URL firmada
devuelve `206 Partial Content` con el rango correcto.

| | Cubo privado + firma | Cubo público |
|---|---|---|
| Búsqueda en el vídeo | **sí**, medido | sí |
| Borradores protegidos | **sí** | no, si se adivina la ruta |
| Caché de la red de distribución | limitada | buena |
| Coste por reproducción | ~18 ms de firma + tráfico | solo tráfico |
| Enlace que se puede reenviar | caduca | **eterno** |

Lo que decide es la penúltima fila. En un cubo público, la ruta de un borrador o
de una versión retirada es una URL permanente que cualquiera puede reenviar. Un
tutorial no es secreto, pero **un borrador sin aprobar sí**, y las versiones
históricas también.

---

## PET-02 · La ruta no es la identidad

```
tutorial-media/{tutorial_id}/{version_id}/{nombre_seguro}
```

- **`tutorial_id`** es la identidad estable del tutorial, no su `page_key`. Si
  algún día una pantalla cambia de clave, el objeto no se mueve.
- **`version_id`** hace la ruta única por versión, así que **una versión nueva es
  siempre un objeto nuevo**. Nunca se sobrescribe.
- **`nombre_seguro`** es cosmético: sirve para que quien mire el cubo entienda
  qué hay. **Jamás autoriza nada.** 0015 ya avisa de esto y 0101 lo cerró.

El nombre original que subió la persona se guarda en la base como metadato, no en
la ruta.

---

## PET-03 · Cómo entra un vídeo

**El navegador sube directo a Storage. Los bytes no atraviesan Vercel.**

No es una preferencia. `next.config.ts` dejó las Server Actions en su límite por
defecto de **1 MB** cuando T9E.1 cambió el transporte, y hay pruebas que fallan si
alguien lo vuelve a subir. Un tutorial de tres minutos son decenas de megas.

```
1 · superadministrador elige archivo
2 · servidor: crear reserva  ─→ valida quién, formato y tamaño declarado
                                reserva ruta única y caducidad
3 · navegador → Storage      ─→ los bytes, directos
4 · servidor: finalizar      ─→ lee el objeto REAL: tamaño, tipo, resumen
                                y solo entonces nace la versión candidata
```

**Transporte recomendado: URL de subida firmada**, como Textiles, y no la sesión
con política ligada al intento, como CPR.

El motivo es el hallazgo de 0099: una URL firmada **no pasa** por la política
INSERT de `authenticated`. Para CPR eso era un problema, porque quería que la
base volviera a decidir en cada subida de cada usuario. Aquí es lo contrario:
quien sube es siempre un superadministrador, la decisión es una, y el servidor la
toma al emitir la URL —que queda **atada a esa ruta exacta** y no se puede
redirigir a otra—.

Aun así la política INSERT del cubo se escribe restrictiva (PET-11), porque
cerrarla no rompe el flujo legítimo. Es exactamente lo que 0099 comprobó.

**Nunca `service_role` en el navegador**, y ninguna credencial genérica de
escritura: lo que viaja es un token para una ruta y un rato.

---

## PET-04 · El paso que hace verdad lo declarado

Entre subir y publicar hay una **finalización server-only** que lee el objeto
real y compara con lo que se declaró: tamaño, tipo de contenido y resumen
criptográfico.

Es el mismo principio que 0099 dejó escrito: *Storage vincula la ruta a una
reserva; no inspecciona el contenido*. Quien declara «10 MB de vídeo» y sube otra
cosa no publica nada — la versión no llega a nacer.

Y ahí se calcula la duración si se puede leer de la cabecera del contenedor. Si
no se puede, **se deja vacía en vez de inventarla**.

---

## PET-05 · Formatos y tamaño

**`video/mp4` y `video/webm`.** Nada más.

No porque Storage no acepte otros, sino porque son los dos que un navegador
reproduce sin ayuda. Un `.mov` o un `.avi` en el cubo es un tutorial que alguien
no puede ver, y no se sabría hasta que alguien lo intentara.

Se comprueban **las tres cosas**, porque cada una miente por su lado:
la extensión, el tipo declarado, y la **firma binaria** del archivo real en la
finalización — que es el patrón que ya existe para evidencias textiles.

**El tamaño máximo es una decisión humana** y está en las decisiones pendientes.
Lo que aporta la arquitectura:

- el cubo no impone límite hoy, y el tope estructural de la tabla de reservas de
  CPR es de 25 MB — **insuficiente** para vídeo;
- Storage no pone límite propio; el tope lo pone quien reserva;
- un tutorial de 3 minutos a 1080p ronda **25–60 MB** según codificación;
- a 720p, que para una pantalla de producto sobra, ronda **10–25 MB**.

**Recomendación: 200 MB por archivo**, con el tope declarado en la reserva y
comprobado otra vez al finalizar. Es holgado para un tutorial largo y sigue
siendo un techo que impide subir una película por error.

> **SUPERSEDED · PE-03B3.** El tope de 200 MB ya no existe.

---

## PET-06 · Cómo sale un vídeo

**URL firmada, emitida en el servidor, para la versión vigente.**

La ruta es privada, así que nadie llega por adivinar. El servidor comprueba que
hay sesión, resuelve cuál es la versión **vigente** de ese tutorial, y firma solo
esa. Un borrador o una versión retirada no se firman nunca por esta vía.

Medido: `Accept-Ranges: bytes`, `206` con `content-range` correcto, sin
`Content-Disposition` —así que se reproduce en línea, no se descarga—. La
búsqueda dentro del vídeo funciona sobre un cubo privado.

### El plazo de la firma

Es la decisión fina. Demasiado corto y la firma caduca a mitad, y adelantar
rompe; demasiado largo y el enlace vive más de lo necesario.

Lo que se sabe: la caducidad **es absoluta**, no deslizante, y se aplica de
verdad —una URL de 1 segundo devolvió 400 a los 2,5—. El navegador conserva la
misma URL toda la sesión del `<video>`.

**Recomendación: 2 horas.** Cubre de sobra un tutorial de minutos, incluso si
alguien lo deja abierto y vuelve; y sigue siendo un enlace que muere el mismo día.
Firmar cuesta ~18 ms, así que se firma al abrir el reproductor, no al pintar la
página: una página con el botón no gasta nada.

**Antes de fijarlo en PE-03B hay que repetir la sonda contra Staging**, porque el
Supabase alojado sirve detrás de una red de distribución y puede añadir caché que
en local no aparece.

---

## PET-07 · Quién ve qué

| | Vigente | Candidata | Histórica |
|---|---|---|---|
| Visitante sin sesión | no | no | no |
| Persona con sesión | **sí** | no | no |
| Soporte | sí | **vista previa** | **sí** |
| Superadministrador | sí | sí | sí |

La vía normal de la pantalla **solo puede resolver la versión vigente**. No es
una comprobación añadida: es que la consulta que la resuelve no mira las otras.

Que soporte vea la historia sigue el patrón congelado de PE-02: soporte **ve**,
solo superadministrador **escribe**.

---

## PET-08 · Reemplazar es crear, nunca sobrescribir

**Los bytes de una versión publicada no se tocan.** Archivo nuevo, versión nueva,
objeto nuevo.

0101 ya lo dejó escrito para TrazaDocs: sobrescribir la misma ruta invalidaría el
tamaño, el versionado y la historia. Aquí es peor: dejaría la misma identidad de
versión apuntando a un contenido distinto, y la historia diría una mentira
comprobable.

Se consigue solo: la ruta lleva el `version_id`, así que no hay dos versiones que
compartan ruta.

---

## PET-09 · El resumen del contenido

Se guarda **SHA-256** del archivo, calculado en la finalización.

No se usa el `ETag` de Storage: es un detalle de implementación del proveedor,
puede cambiar de forma y en subidas por partes no es el resumen del contenido.

Sirve para tres cosas: comprobar integridad, saber si un archivo ya está subido, y
distinguir en la historia una versión que **repone contenido anterior** de otra
que es de verdad nueva.

---

## PET-10 · Reponer una versión anterior

**Sí, y sin falsear la historia.** Ver `PE_03A_TUTORIAL_VERSIONING.md`.

Sobre el objeto: cuando el resumen coincide con uno ya subido, la versión nueva
**puede apuntar al mismo objeto inmutable**. Es seguro precisamente porque nadie
sobrescribe nunca: el objeto no cambia bajo los pies de quien lo referencia.

**Y no se implementa recuento de referencias.** Sin él, la regla de retirada es
simple y segura: *un objeto solo se retira si ninguna versión lo referencia*, que
es una consulta, no un contador que se puede desincronizar. El ahorro de espacio
de deduplicar no justifica un contador que si se equivoca borra un vídeo
publicado.

---

## PET-11 · Las políticas del cubo

| Operación | Quién |
|---|---|
| `SELECT` | superadministrador y soporte, directamente. Todos los demás, **solo por URL firmada** emitida en el servidor |
| `INSERT` | ligado a una reserva vigente de un superadministrador |
| `UPDATE` | **nadie**, sin política · deny-by-default |
| `DELETE` | **nadie desde el cliente** · la retirada física es server-only |
| `anon` | nada |

No hay política de `UPDATE` **a propósito**: 0099 comprobó en vivo que sin ella
un `upsert` sobre un objeto existente es rechazado, y añadir una solo podría
abrir permisos.

La retirada física va por el mismo camino que ya existe: cola, retirada
server-only con cliente administrativo, confirmación. Nunca un borrado directo
que deje una referencia rota.

---

## PET-12 · Los huérfanos, y lo que jamás se toca

Tres casos, y solo uno se limpia:

| Caso | Qué se hace |
|---|---|
| Reserva que caducó sin subida | la reserva vence; no hay objeto |
| Objeto subido cuya versión nunca nació | **se retira**, pasado un margen |
| Versión publicada o histórica | **jamás se retira** |

La distinción es la que pide el encargo: limpieza operativa no es historia de
negocio. Un objeto que ninguna versión referencia es basura; uno que alguna
referencia es memoria.

Y por si alguien confunde los dos, la regla de PET-10 lo impide sola: se consulta
si hay referencias antes de retirar.

**El caso de emergencia** —contenido ilegal o dañino— existe y se documenta
aparte: es una operación server-only, deliberada, registrada, y **fuera de la
consola**. No se pone un botón de borrado permanente en una pantalla para un caso
que ocurre una vez cada nunca.

---

## PET-13 · Lo que cuesta

**No cuenta contra la cuota de ninguna empresa, y no por una excepción.** La
cuota se calcula sumando tamaños desde las tablas de dominio con
`organization_id`; un tutorial no está en ninguna. No hay que excluirlo: hay que
no incluirlo.

Estimación, con los números del inventario:

| | |
|---|---|
| Páginas normales | 147 |
| Primera ola realista | 15–20 tutoriales |
| Tamaño por vídeo (720p, 2–4 min) | 15–30 MB |
| Versiones por tutorial en un año | 2–3 |
| **Almacenamiento al año** | **1–2 GB** |

Es despreciable como almacenamiento. Lo que crece con el uso es el **tráfico de
reproducción**, y ahí sí conviene decir el número honesto: sin caché en la
respuesta firmada, cada reproducción vuelve a traer el archivo. Cien
reproducciones diarias de vídeos de 20 MB son **~60 GB al mes**.

Si eso llega a importar, la palanca no es hacer público el cubo: es reducir el
peso de los vídeos. Un tutorial de producto a 720p con voz basta.
