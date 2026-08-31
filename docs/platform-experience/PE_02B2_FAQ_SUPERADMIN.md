# PE-02B2 · La consola de preguntas frecuentes

**Migración:** ninguna nueva para la FAQ — B1 dejó el esquema hecho.
**Rutas:** `/platform/faq`, `/platform/faq/[id]`, `/platform/faq/categorias`.

---

## 1 · Qué resuelve

Hasta hoy la FAQ existía en la base y no había forma de escribir en ella salvo
con un cliente de base de datos. Ahora se administra desde la consola, **sin
desplegar**, que era el punto de todo el tramo.

---

## 2 · La lista

`/platform/faq` — con búsqueda por identificador y filtros de categoría,
visibilidad, estado de publicación, módulo y destacadas. **Todo en el
servidor**, con paginación: traer todas las preguntas al navegador para
filtrarlas allí funcionaría con treinta y dejaría de funcionar con trescientas,
y para entonces nadie recordaría por qué.

Cada fila muestra lo que hace falta para decidir si hay que abrirla: la pregunta
vigente, su categoría, su visibilidad, sus módulos, su estado, si está destacada
y —lo que más se mira— **si hay un borrador con cambios sin publicar**.

Los identificadores internos no son la interfaz: el enlace es la pregunta, y el
`slug` aparece como dato secundario en la ficha.

---

## 3 · La ficha

`/platform/faq/[id]` pone **lo publicado y el borrador uno al lado del otro**.
Es la pregunta que se hace quien edita —«¿esto ya se ve?»— y merece respuesta a
la vista, no en dos pantallas distintas.

Debajo, cinco bloques en el orden en que se usan:

1. **Procedencia** — el gobierno editorial (§4).
2. **Editar el borrador** — el texto y su respaldo.
3. **Publicar** — con la nota del cambio.
4. **Cómo se presenta** — categoría, visibilidad, alcance, orden, destacada.
5. **Retirar**, solo si está publicada.

Y al final, la **historia**.

---

## 4 · Borrador y publicado, que son dos cosas

| | Dónde vive | Quién lo ve |
|---|---|---|
| Publicado | `faq_entry_revisions`, inmutable | todo el mundo según su visibilidad |
| Borrador | `faq_entry_drafts`, mutable | solo la plataforma |

Guardar el borrador **no toca lo publicado**, y no porque la acción se acuerde:
porque escribe en otra tabla. La pantalla lo dice —«Borrador guardado. Lo
publicado no ha cambiado»— y hay una comprobación contra base real que publica,
edita después, y verifica que lo publicado siguió intacto.

**Crear tampoco publica.** Una pregunta nueva nace en `draft` y no la ve nadie
de fuera.

---

## 5 · La vista previa · §8

Dos caras, y son distintas de verdad:

- **Cara pública** — lo que ve quien no ha iniciado sesión. Si la respuesta está
  marcada «con sesión», **aquí no aparece**, y se dice por qué.
- **Cara con sesión** — lo que ve quien ya entró.

Verlo antes de publicar evita el error de creer que se publicó algo que nadie de
fuera va a encontrar.

La vista previa se pinta en el servidor de la consola con contenido que ya viajó
autorizado a un superadministrador. **No existe ninguna URL que sirva esto a un
visitante**, y no hace falta desplegar para ver cómo queda.

---

## 6 · La gobernanza de lo que se afirma · §7

El bloque de procedencia va **separado** del texto, a propósito: mezclarlos
haría fácil confundir una nota interna con parte de la respuesta. Lleva su
propio aviso —«nada de este bloque sale por la FAQ»— y nunca se proyecta en las
vistas públicas.

Cuando el estado de verificación impide publicar, la pantalla lo dice **antes de
enviar nada**, con qué hacer y no solo qué falta:

| Estado | Lo que se lee |
|---|---|
| depende de una política externa | «Compruébala, anota la fuente y la fecha, y cambia el estado» |
| sin comprobar | «Anota en qué se apoya y cambia su estado» |
| no afirmable | «Publicarla sería decir algo que no es cierto» |
| con salvedad, sin salvedad escrita | «Una salvedad que no se escribe no es una salvedad» |
| fuente externa sin fecha | «Sin fecha no se sabe cuándo dejó de ser cierta» |

**Y el aviso no es la barrera.** La barrera es `faq_publish_entry`, que rechaza
igual. Está comprobado por los dos caminos en la misma prueba: la explicación
previa aparece, y la base rechaza.

---

## 7 · Historia y recuperación

La ficha muestra cada versión con su número, su periodo de vigencia, su autor,
su nota de cambio, su estado de verificación y en qué se apoyaba.

De una versión cerrada se puede **recuperar el texto**: se copia al borrador y
desde ahí se publica como versión nueva. Nunca se reabre. Queda escrito lo que
decía, lo que dijo después y que se volvió a lo primero.

Una versión publicada **no se puede editar ni borrar** desde ninguna parte de la
consola, y tampoco por debajo: la aplicación no tiene permiso de escritura sobre
la tabla de revisiones.

---

## 8 · Categorías · §14

`/platform/faq/categorias` — crear, renombrar, describir, ordenar y activar o
retirar.

El `code` es la identidad y **no se edita**: es lo que enlaza a sus preguntas.
El nombre sí.

**Retirar una categoría que sostiene preguntas** dejaría esas preguntas fuera de
la vista pública sin que nadie hubiera tocado ninguna de ellas. La consola no lo
impide —a veces es lo que se quiere— pero lo **cuenta con su número** y exige
una confirmación explícita. Es la diferencia entre una decisión informada y una
sorpresa.

No se creó la categoría de Construcción: el módulo no existe y una categoría
vacía es una promesa.

---

## 9 · Orden · §15

Numérico, no arrastrable. El repositorio no tiene un patrón de arrastrar y
soltar accesible, y estrenarlo aquí significaría estrenar también sus problemas
de accesibilidad. Un campo de orden se entiende, funciona con teclado y no
sorprende.

---

## 10 · Permisos · §17

| | `superadmin` | `support` | admin de empresa |
|---|---|---|---|
| Ver la lista y las fichas | sí | **sí** | **no** |
| Ver la historia | sí | sí | no |
| Crear, editar, publicar, retirar | **sí** | no | no |
| Categorías | sí | no | no |

Comprobado **con las tres sesiones**, no mirando qué botones se pintan. Y hay un
detalle que solo aparece haciéndolo así:

> Una actualización que la RLS no autoriza **no devuelve error**: devuelve cero
> filas afectadas, con éxito.

Sin tenerlo en cuenta, la consola le habría dicho «guardado» a `support` sin
haber guardado nada. Por eso cada actualización pide de vuelta la fila que tocó
y, si no vuelve ninguna, lo cuenta como falta de permiso. La prueba que lo
destapó sigue en la suite.

---

## 11 · Los errores · §29

Cuatro cosas distintas, contadas distinto:

| | Qué se lee |
|---|---|
| Validación | qué falta, en el campo que falta |
| Rechazo de publicación | **el mensaje de la base, tal cual**: está escrito para una persona y explica por qué |
| Sin permiso | «Tu cuenta no puede administrar el contenido de la plataforma» |
| Avería | «No fue posible consultar… **Es un problema temporal, no una pérdida de contenido**» |

La última es la que importa. Una lectura fallida **nunca** se cuenta como «no
hay preguntas» ni como «no existe»: la lista lo dice como aviso y la ficha
tampoco lo convierte en un 404. Es la misma disciplina que PE-01B aplicó a la
puerta, y se comprueba rompiendo el cliente a propósito.

---

## 12 · Lo que este tramo NO hace

- **No** hay FAQ pública ni centro de ayuda: eso es B3.
- **No** hay ayuda contextual ni se migraron las once ayudas de partes
  interesadas: eso es B4.
- **No** se publicó ninguna respuesta de seguridad: eso es B5.
- **No** se tocaron los carryovers de PE-01: eso es B6.
- **No** hay planes, precios ni pagos.
