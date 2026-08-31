# PE-03B1 · El cubo

`tutorial-media`. Nuevo, privado, y con sus dos topes declarados en el propio
cubo.

---

## 1 · Por qué uno propio

Los tres cubos que había —`evidences`, `organization-assets`,
`trazadocs-documents`— comparten convención: la ruta empieza por
`{organization_id}` y sus políticas operan sobre ese primer segmento.

**Un tutorial no tiene empresa.** Meterlo ahí obligaría a inventar un
`organization_id` o a relajar políticas que hoy son estrechas.

Y hay precedente exacto: 0049 creó un cubo aparte para el logo de empresa con el
mismo razonamiento —«un logo no es una evidencia técnica, no se mezclan»—.

---

## 2 · Privado, y con eso basta

La duda de PE-03A era si un cubo privado permitiría adelantar dentro del vídeo.
**Se midió, y sí.**

| | Local | Staging alojado |
|---|---|---|
| `Content-Type` servido | `video/mp4` | `video/mp4` |
| `Range: bytes=…` | **206** | **206** |
| `content-range` correcto | ✔ | ✔ |
| Bytes del tramo correctos | ✔ | ✔ |
| `Content-Disposition` | ausente → en línea | ausente → en línea |
| `Cache-Control` | ausente | **ausente** |
| URL caducada | 400 | 400 |
| Sin firma | 400 | 400 |

**La duda que PE-03A dejó abierta queda cerrada:** el Supabase alojado se
comporta igual que el local en lo que decide la arquitectura. No añade caché ni
cabeceras de red de distribución sobre un objeto firmado.

*(La única diferencia aparente —`accept-ranges` presente en local y ausente en la
medición alojada— es del método, no del entorno: en local se midió con un GET
sin rango y en Staging con uno con rango, que responde 206 con `content-range` en
lugar de anunciar el soporte.)*

Así que **no hay que renunciar a la privacidad para que un tutorial se pueda
adelantar**, que era el único argumento serio a favor de un cubo público.

---

## 3 · Dos topes en el cubo

A diferencia de los otros tres, este cubo **sí** declara límites:

```sql
file_size_limit    = 200 MB
allowed_mime_types = {video/mp4, video/webm}
```

Los otros no los declaran porque su tamaño depende del plan de cada empresa.
Aquí el tope es uno solo y es del producto, así que se declara en el sitio más
difícil de rodear: **es la única barrera de tamaño que una URL firmada no
sortea.**

---

## 4 · La ruta

```
tutorial-media/{tutorial_id}/{version_id}/{nombre_seguro}
```

- **`tutorial_id`**, no `page_key`: si una pantalla cambiara de clave, el objeto
  no se mueve.
- **`version_id`**: hace que una versión nueva sea **siempre** un objeto nuevo.
  No hay forma de sobrescribir una publicada, porque no hay dos versiones que
  compartan ruta.
- **`nombre_seguro`**: cosmético. Nunca autoriza.

### La excepción, dicha en voz alta

Una versión **repuesta** comparte objeto con la original, así que su ruta **no**
contiene su propio id. Es la única fila del sistema donde eso pasa, y es
deliberado: copiar los bytes a una ruta nueva ocuparía el doble sin que nadie
gane nada.

Por eso `object_path` no es único y el `CHECK` solo exige que empiece por el
tutorial. Está escrito en la migración para que no parezca un descuido.

---

## 5 · Retirar objetos

Tres casos, y solo uno se limpia:

| Caso | Qué se hace |
|---|---|
| Reserva caducada sin subida | vence sola; no hay objeto |
| Objeto cuya versión nunca nació | **se retira**, pasado un margen |
| Versión publicada o histórica | **jamás** |

La regla que lo hace seguro es una consulta, no un contador: *un objeto solo se
retira si ninguna versión lo referencia*. **No hay recuento de referencias**, y no
lo habrá mientras no haga falta: un contador desincronizado borra un vídeo
publicado, y el ahorro de deduplicar no paga ese riesgo.

**La limpieza automática no se implementa en B1.** Se define quién es candidato
y se deja la ejecución para B5, con la operación server-only por el camino que
ya existe para los otros cubos.

---

## 6 · Lo que cuesta

**Nada contra la cuota de ninguna empresa**, y no por una excepción: ver el § 6
de `PE_03B1_TUTORIAL_DATA_FOUNDATION.md`.

Estimación con los números reales del inventario de PE-03A:

| | |
|---|---|
| Primera ola | 15–20 tutoriales |
| Por vídeo (720p, 2–4 min) | 15–30 MB |
| Versiones al año | 2–3 |
| **Almacenamiento al año** | **1–2 GB** |

Despreciable. Lo que crece con el uso es el **tráfico**, y ahí el número honesto
es: sin caché en la respuesta firmada —confirmado también en el alojado— cada
reproducción vuelve a traer el archivo. Cien reproducciones diarias de 20 MB son
**~60 GB al mes**.

Si eso llega a importar, la palanca **no** es hacer público el cubo: es reducir
el peso de los vídeos.
