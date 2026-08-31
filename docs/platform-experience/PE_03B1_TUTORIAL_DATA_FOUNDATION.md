# PE-03B1 · El modelo de datos

Migración **0159**. Dos tablas, una vista, siete funciones y un cubo. Sin
consola, sin botón, sin reproductor y sin un solo vídeo.

---

## 1 · Dos tablas

### `platform_tutorials` · la identidad

Lo estable. Ni el título, ni el archivo, ni la ruta de la pantalla entran en
ella: los tres cambian sin que cambie de qué tutorial hablamos.

**Sin `organization_id`.** No es una omisión: es la decisión. Un tutorial es
contenido de plataforma, y la consecuencia se explica en el § 6.

| Columna | Para qué |
|---|---|
| `tutorial_type` | `page` o `welcome` |
| `page_key` | solo para los de pantalla · la clave de PE-02 |
| `module_key` | el primer segmento de la clave, comprobado |
| `title` | cómo se llama |
| `status` | `active` o `retired` |

**Un tutorial por pantalla**, garantizado por un índice único parcial sobre
`page_key` donde el tipo es `page`. **Y una sola bienvenida**, por otro índice
parcial: sin él, «el vídeo de bienvenida» dejaría de ser una cosa concreta y
habría que decidir cuál gana.

### `platform_tutorial_versions` · el archivo y su vigencia

Una versión es un archivo con un periodo. Reemplazar es crear otra, nunca
sobrescribir: la ruta lleva el `version_id` dentro, así que dos versiones no
pueden compartir objeto por accidente.

Guarda **lo declarado** al reservar y **lo real** leído del objeto, en columnas
distintas. Que estén separadas es lo que permite compararlas — y comparar es
todo lo que hace la finalización.

---

## 2 · Dos vocabularios de estado, no uno

El encargo pide no mezclar estado de subida con estado de publicación. Son
independientes de verdad, así que van por separado.

**`file_state`** — dónde están los bytes:

| | |
|---|---|
| `reserved` | hay reserva, no hay objeto |
| `uploaded` | hay objeto, sin verificar |
| `verified` | el servidor leyó el objeto real y cuadra |
| `failed` | no llegó, o no cuadró |

**La vigencia** — qué se ve:

| | |
|---|---|
| `effective_from` nulo | candidata: existe y no se ve |
| `from` sin `to` | vigente |
| `from` y `to` | histórica |

Un solo enumerado tendría que inventarse un nombre para «verificada pero aún no
publicada», que es un estado perfectamente normal.

Y lo único que la pantalla necesita saber —si hay vídeo o no— **no es una
columna**: es el resultado de consultar la vista. Se llama `NO_VIDEO` cuando no
devuelve nada.

---

## 3 · Por qué NO hay tabla de borradores

Aquí PE-03 se separa de la FAQ y de la ayuda contextual, y conviene decir por
qué en vez de que parezca un olvido.

En la FAQ el borrador vive aparte porque **se edita muchas veces**: alguien
escribe, corrige, vuelve, y mientras tanto lo publicado tiene que seguir intacto
y visible. Un borrador a medias no es historia de nada.

**Un vídeo no se edita. Se sube.** No hay un estado intermedio en el que alguien
va cambiando el archivo palabra por palabra: hay un archivo, y luego hay otro.
Los metadatos que sí se editan —título, descripción, nota de cambio— son cuatro
campos, no un documento.

Así que la versión candidata es una fila con estado propio, y **su inmutabilidad
empieza al publicarse**, no al crearse.

---

## 4 · La inmutabilidad, y dónde está su frontera

Un disparador, no una política: una política no detiene a `service_role`, y de
poco sirve una garantía que se cae con el cliente administrativo.

**Intocable siempre, publicada o no** — lo que identifica los bytes:

- el tutorial, el número de versión y la ruta;
- quién la subió y cuándo;
- el resumen, el tamaño y el tipo reales, **una vez escritos**.

Si eso se pudiera reescribir, la fila podría acabar describiendo un archivo
distinto del que hay, y la historia diría una mentira comprobable.

**Intocable al publicarse** — lo editorial: título, descripción, nota de cambio,
cartel, el inicio de vigencia y quién publicó.

**Y un periodo cerrado no se reabre.** Es lo que impide falsificar la cronología
al reponer una versión antigua.

**Se puede borrar una candidata** que nunca se publicó: no es historia de nada, y
hay que poder limpiarla. Lo publicado no se borra jamás — comprobado incluso con
el cliente administrativo.

---

## 5 · La clave de pantalla, y el límite que la base no puede cruzar

La identidad de un tutorial de pantalla **es el `page_key` de PE-02**. No la
ruta, ni el título, ni el nombre del componente. Una pantalla puede mudarse de
dirección sin que su tutorial deje de ser el suyo.

La base comprueba **la forma** —minúsculas, puntos, y el primer segmento igual al
módulo—, con el mismo patrón que ya usa `help_items` desde 0158.

**Lo que la base no puede saber es si esa clave existe en el registro**, porque
el registro vive en un fichero de TypeScript. Eso lo comprueba
`createPageTutorial`, y una prueba estática vigila que las dos formas sigan
siendo la misma.

Se dice aquí y en la propia migración para que nadie lea el `CHECK` como más de
lo que es. **No se creó un segundo registro de claves**, que era la alternativa
fácil y habría convertido una fuente de verdad en dos.

---

## 6 · Fuera de toda cuota, por construcción

La cuota de una empresa se calcula sumando tamaños desde las **tablas de dominio
con `organization_id`** —`cpr_objects`, `textile_evidences`, los intentos
vencidos—, deduplicando por `(cubo, ruta)`. **No recorre cubos.**

Un tutorial no está en ninguna de esas tablas. Así que **no hay que excluirlo de
la cuota: basta con no incluirlo**, y eso ya está hecho por no haberle puesto
`organization_id`.

Es una propiedad estructural, no una promesa. Hay una comprobación que mide el
consumo antes y después de subir medio mega de vídeo y verifica que no se movió.

---

## 7 · La bienvenida, en el mismo motor

Un discriminante de tipo, no un segundo sistema. Versiones, verificación,
publicación, historia y reposición son idénticas; construir dos motores para eso
sería duplicar el trabajo y la superficie de fallo.

**No cuelga de ninguna clave de pantalla**, y no se le inventó una ruta falsa
para alojarla. La migración crea su identidad —una sola— y **nada más**: sin
vídeo, sin preferencia de persona y sin comportamiento. Eso es B4.

Crear esa fila no muestra nada a nadie: la vista del producto solo devuelve
versiones vigentes, y esta no tiene ninguna.

---

## 8 · Lo que este tramo NO hace

- No hay consola: eso es B2.
- No hay botón ni reproductor: eso es B3.
- No hay preferencia de persona ni comportamiento de bienvenida: eso es B4.
- **No hay ni un vídeo real.** Los de las pruebas son sintéticos, diminutos y se
  borran al terminar.
- No se tocó nada comercial.
