# PE-03B2 · La consola de tutoriales

`/platform/tutorials`. **Sin migración**: B1 dejó puesto todo lo que hacía falta,
y este tramo solo le pone pantalla.

---

## 1 · Se llega por donde se llega a todo

Entrada **Tutoriales** en el menú de plataforma, junto a Preguntas frecuentes,
Ayuda del producto y Documentos legales. Mismo grupo, mismo lenguaje visual, los
mismos `Field`, `SelectField`, `Button` y `useActionState` de PE-02.

No se creó ningún sistema de diseño nuevo.

---

## 2 · La lista

Dos apartados, porque son dos cosas distintas: **Vídeo de bienvenida** y
**Tutoriales de pantalla**.

Arriba, tres números que responden a la pregunta editorial de verdad:

| | |
|---|---|
| pantallas en el registro | cuántas podrían tener tutorial |
| con tutorial creado | cuántas lo tienen empezado |
| **con vídeo publicado** | cuántas lo tienen de verdad |

Y debajo, en letra pequeña: *que una pantalla no tenga vídeo no es un fallo*.
Es el estado normal de casi todas mientras se graban, y llamarlo «incompleto»
convertiría el trabajo pendiente en una lista de errores.

Cada fila dice: el módulo, la pantalla, si hay vídeo publicado, si hay una
versión sin publicar, cuántas publicaciones lleva y cuántas subidas fallaron.
**Ningún identificador se enseña como si fuera el nombre de algo.**

### Los filtros van en la URL

Búsqueda, módulo, tipo y estado del vídeo, resueltos **en el servidor**. Filtrar
en el navegador sobre una lista parcial enseña «tres resultados» cuando hay
treinta, y nadie lo nota hasta que falta uno.

### Y en tres consultas, no una por fila

Con veinte tutoriales y una consulta por cada uno para saber su versión vigente,
la pantalla haría veintiuna; con cuarenta, cuarenta y una. Hay una comprobación
que **cuenta las consultas de verdad**, envolviendo `from`, y falla si aparece
una tercera.

La historia se carga solo en la ficha. La lista no la necesita.

---

## 3 · La ficha

Tres bloques, en el orden en que se usan:

**Versión publicada** — cuál es, cuándo se publicó y quién, su archivo, tamaño y
duración, la nota de cambio, y un botón para verla. Dice, con esas palabras,
«esto es lo que ve la gente ahora».

Si no hay ninguna, dice qué lee quien abra esa pantalla —el mensaje
congelado— y añade que **no es un fallo**.

**Subir** — arriba del todo cuando el tutorial está activo, porque es a lo que se
viene.

**Listas para revisar** — las versiones verificadas y sin publicar, con su vista
previa, sus metadatos editables y los botones de publicar y descartar.

**Subidas sin terminar** — reservas que no llegaron a nada, separadas para poder
descartarlas.

**Historia** — cada versión con su periodo, quién la publicó, su nota, su archivo
y los primeros caracteres de su resumen. Y al final: *nada de esto se borra*.

---

## 4 · Un callejón sin salida que encontró una prueba

La identidad de un tutorial de pantalla es única **por pantalla**, y esa
unicidad no distingue activo de retirado — ni debe, porque la pantalla es la
misma.

Consecuencia que nadie había visto: **retirar un tutorial dejaba su pantalla sin
forma de volver a tener uno**. Crear otro chocaba con el índice, y no había cómo
reactivar el retirado.

Lo encontró la suite al ejecutarse dos veces. Se resolvió con una acción nueva
—**Volver a activar**—, sin tocar el esquema. Activar no publica: devuelve el
tutorial al trabajo, y su historia sigue donde estaba.

Es el tipo de hallazgo que solo aparece si las pruebas se ejecutan más de una
vez sobre la misma base.

---

## 5 · Quién puede qué

| | Superadministrador | Soporte | Persona normal |
|---|---|---|---|
| Ver la lista y la ficha | sí | **sí** | no |
| Ver la historia | sí | **sí** | no |
| Previsualizar cualquier versión | sí | **sí** | no |
| Crear, subir, publicar, retirar, reponer, descartar | **sí** | no | no |

Soporte **ve**, solo superadministrador **escribe**: la distinción congelada
desde PE-02.

**Y no se esconde nada más que por cortesía.** Una persona normal que escriba
`/platform/tutorials` a mano recibe una redirección fuera de la plataforma — hay
una comprobación que lo pide por HTTP, porque esconder un botón no es una
barrera.

---

## 6 · El cliente administrativo

**La administración normal no lo usa.** Listar, crear, reservar, subir,
verificar, publicar, retirar, reponer y previsualizar van todos con la sesión de
la persona, y la base vuelve a decidir en cada uno.

**Una excepción, declarada y aislada:** descartar una candidata retira su objeto,
y el cubo no tiene política de `DELETE` a propósito — si la tuviera, un objeto
referenciado por una versión publicada podría borrarse desde el cliente. Es el
mismo camino que ya usa `lib/db/storage-deletion.ts` para CPR y TrazaDocs.

Vive en un módulo propio, `lib/db/tutorial-object-cleanup.ts`, lo importa una
sola acción, y **comprueba que ninguna otra versión referencie el objeto antes
de tocarlo**. Esa segunda comprobación no sobra: una versión repuesta comparte
objeto con la original, y borrarlo a ciegas se llevaría un vídeo publicado.

---

## 7 · Lo que este tramo NO hace

- **Sin botón en las pantallas de producto.** Eso es B3.
- **Sin ventana de bienvenida.** Se puede subir y publicar su vídeo desde aquí, y
  no se le muestra a nadie. Eso es B4.
- **Sin preferencias por persona.** Eso es B4.
- Nada comercial.
