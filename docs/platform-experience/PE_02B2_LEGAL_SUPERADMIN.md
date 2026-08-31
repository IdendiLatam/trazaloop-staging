# PE-02B2 · La consola de documentos legales

**Rutas:** `/platform/legal`, `/platform/legal/[id]`.

---

## 1 · La lista

Agrupada por tipo —términos, privacidad, tratamiento de datos— y dentro, por
fecha. De cada versión se ve:

- su número y su título;
- si está **vigente**, **archivada** o es un **borrador**;
- desde cuándo, y hasta cuándo si ya no lo está;
- **cuántas personas la aceptaron**.

Ese último dato es el que cambia cómo se lee todo lo demás: una versión
archivada con 40 aceptaciones no es un borrador viejo, es la prueba de lo que
aceptaron 40 personas.

Arriba de cada tipo, en una línea: cuál es la vigente y desde cuándo.

---

## 2 · La ficha

Dice, en la primera frase, en cuál de las tres situaciones está:

- **vigente** — «esta es la redacción que se acepta hoy»;
- **archivada** — «estuvo vigente del … al …; se conserva porque hay personas
  que aceptaron **este** texto»;
- **borrador** — «no está vigente, no se puede aceptar y no lo ve nadie fuera de
  esta consola».

Debajo, el texto completo. Y si ya se publicó, un aviso que no se puede
malinterpretar:

> Esta versión ya se publicó, así que su texto **no se puede modificar**. Para
> cambiar lo que dice, se publica una versión nueva — y a quien la había
> aceptado se le vuelve a pedir.

---

## 3 · Crear una versión

Desde la lista, o desde la ficha de la vigente —y ahí **el texto viene copiado**,
para partir de él. Editarlo en el formulario no toca la versión publicada.

Se pide tipo, número de versión, título, texto y nota del cambio. Nace como
**borrador**: no está vigente, no se puede aceptar, no lo ve nadie.

---

## 4 · Publicar · la operación más seria de la consola

Antes de dejar publicar, la pantalla dice lo que va a pasar:

> - La versión N de «Política de privacidad» se archiva y deja de estar vigente.
> - A todas las personas que ya habían aceptado **se les volverá a pedir** que
>   acepten esta redacción.
> - El texto archivado se conserva, con las aceptaciones que recibió.

Y exige marcar una confirmación explícita. No es una formalidad: es la operación
más difícil de deshacer de toda la consola, porque **no hay «despublicar»** — se
vuelve al texto anterior publicándolo otra vez, como versión nueva.

El segundo punto es la razón de ser del tramo, y por eso está escrito en la
pantalla y no solo en un documento.

---

## 5 · Descartar

Solo un borrador. Lo que estuvo vigente se archiva; descartarlo se rechaza con
palabras, no con un botón desactivado.

---

## 6 · Permisos

| | `superadmin` | `support` | cualquier otra persona |
|---|---|---|---|
| Ver las versiones y su historia | sí | **sí** | no |
| Crear, editar, publicar, descartar | **sí** | no | no |
| Leer los documentos **vigentes** | sí | sí | **sí, incluso sin sesión** |

La última fila es la de siempre: la política de lectura pública de 0066 no
cambió, y `/terms`, `/privacy` y `/legal` siguen funcionando igual.

Comprobado con las tres sesiones. Y con una advertencia que también aplica aquí:
una actualización que la RLS no autoriza no devuelve error, devuelve cero filas.
La prueba comprueba lo que importa —que el texto no cambió— además de que no se
tocó ninguna fila.

---

## 7 · Los errores

Los mensajes de las funciones legales están escritos para una persona y se
transmiten **tal cual**:

- «El contenido de una versión legal publicada no se modifica. Para cambiar lo
  que dice se publica una versión nueva, y quien la aceptó vuelve a aceptarla.»
- «Una versión legal archivada no vuelve a estar vigente.»
- «Ya existe una versión “X” de ese documento. Usa otro número de versión.»
- «Un documento legal necesita un texto. Este parece incompleto.»

Resumirlos a «no fue posible» perdería justo lo que hay que entender. Lo que sí
se traduce es una avería: «No fue posible consultar los documentos legales. **Es
un problema temporal, no una pérdida de contenido.**»

---

## 8 · La política de privacidad · §23

La consola ya permite gestionarla **sin desplegar**, que es lo que este tramo
tenía que entregar.

**No se ha publicado ninguna versión nueva**, y no se publicará aquí. La vigente
sigue declarándose «versión preliminar … para la beta de Trazaloop CPR» y sigue
sin mencionar al proveedor de IA — el bloqueo editorial que PE-02A identificó y
que impide publicar la FAQ final de seguridad.

Ahora ese bloqueo se resuelve escribiendo, no desplegando. Cuando el texto esté
revisado, es: crear versión → revisar → publicar. Y a todo el mundo se le
volverá a pedir que acepte, que es exactamente lo que debe pasar cuando cambia
una política de privacidad.
