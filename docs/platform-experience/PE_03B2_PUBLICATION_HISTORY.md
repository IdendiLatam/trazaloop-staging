# PE-03B2 · Publicar, y la historia

---

## 1 · Subir no publica

Se dice tres veces, en tres sitios distintos, porque es la confusión que rompe
este flujo:

- en el encabezado de la consola;
- en el formulario de subida, antes de elegir archivo;
- en el estado final de la subida, que se llama **«Listo para revisar»**.

Entre subir y publicar hay una vista previa. La versión existe, está verificada,
y **nadie la ve**.

---

## 2 · Publicar pide confirmación, y dice qué cambia

No un «¿estás seguro?». Un texto que dice lo que va a pasar, y cambia según haya
o no un vídeo publicado:

> Al publicar la versión 3, la que se ve ahora pasa a histórica y **todo el mundo
> verá esta**. La anterior se conserva entera.

o, si es la primera:

> Al publicar, esta pantalla **dejará de decir que el tutorial está en
> actualización** y la gente verá este vídeo.

Se puede escribir una nota de cambio, que queda en la historia para siempre.

Publicar usa la función canónica de B1. **No hay ningún `update` a mano**:
publicar también cierra la vigente, la enlaza con la nueva y deja constancia de
quién, y a mano hay que acertar las tres cosas cada vez.

---

## 3 · Lo que no se puede publicar

| Estado | Qué pasa |
|---|---|
| `reserved` | no aparece el botón, y la base lo rechazaría |
| `uploaded` | íd. |
| `failed` | íd. |
| Ya publicada | la función lo rechaza |
| Ya histórica | la función lo rechaza, y explica que se repone |

La consola solo ofrece publicar lo verificado. **La base sigue siendo la
autoridad**: el `CHECK` de 0159 exige `verified` para que una versión pueda tener
vigencia, así que ni un error de la pantalla podría publicar unos bytes sin
comprobar.

---

## 4 · La versión publicada

Se llama **«Versión publicada»**, no «activa». «Activo» significa cosas distintas
en cada pantalla —un módulo activo, una cuenta activa, un documento activo— y el
verbo concreto siempre gana.

Muestra el número, el título, cuándo se publicó y quién, el archivo, el tamaño,
la duración, la nota y la vista previa. Y dice, con esas palabras: *esto es lo
que ve la gente ahora*.

Una duración que no se pudo leer se muestra como **«—»**, nunca como `0:00`. Un
tamaño desconocido, igual. **Sin dato no es cero.**

---

## 5 · Retirar

Deja de verse. **No borra nada**: la versión queda con su periodo cerrado, la
historia entera, y la pantalla vuelve a decir que el tutorial está en
actualización.

También pide confirmación, y dice exactamente eso.

---

## 6 · La historia

Cada versión que llegó a publicarse, de la más nueva a la más vieja:

- el número y el título;
- **el periodo**: «Publicada del 3 de marzo al 12 de junio», o «a hoy»;
- quién la publicó;
- si repone el vídeo de una anterior;
- la nota de cambio, entre comillas;
- el archivo, su tamaño y los primeros doce caracteres de su resumen;
- su estado: Publicada o Histórica;
- vista previa.

El resumen no es ruido: es lo que permite comparar dos versiones sin descargarlas
y, sobre todo, ver de un vistazo cuándo una versión repone el vídeo de otra.

Y al final, escrito: *nada de esto se borra*.

### La historia vive en las tablas de negocio

No en el registro de auditoría. Quién subió, quién publicó y cuándo se vio cada
versión son datos del contenido, y por eso se pueden responder sin depender de
que nadie haya purgado un log.

---

## 7 · Cómo se comprueba, y cómo no

**«Publicar una versión nueva conserva la anterior» contando filas no demuestra
nada.** Las filas se conservan casi siempre; lo que se puede perder son los
bytes.

La comprobación descarga el objeto de la versión anterior después de publicar la
nueva y **compara su SHA-256** con el que se calculó al verificarla. Es la misma
trampa que PE-03A escribió antes de caer en ella, y sigue escrita.
