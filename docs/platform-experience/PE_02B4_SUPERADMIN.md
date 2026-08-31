# PE-02B4 · La consola de ayuda del producto

`/platform/help` y `/platform/help/[id]`

---

## 1 · La lista

Agrupada **por pantalla**, que es como piensa quien administra: «¿qué explica la
pantalla de partes interesadas?». Dentro, cada ayuda con su título vigente, qué
explica —pantalla, bloque, campo o concepto—, su estado, y si hay **borrador con
cambios**.

Filtros de módulo, pantalla y estado; búsqueda por clave de pantalla o de
elemento. Todo en el servidor.

---

## 2 · La ficha

Lo publicado y la vista previa, uno al lado del otro.

**La vista previa usa el botón «i» de verdad.** No una imitación: el mismo
componente, con el mismo contenido convertido por la misma función. Si aquí se ve
bien, allí también, porque es literalmente el mismo panel. Y debajo, las tres
partes desplegadas, para leerlas sin tener que pulsar.

Un aviso lo deja claro: *esto es el borrador, todavía no lo ve nadie fuera de
esta consola*.

---

## 3 · El editor

Dos bloques, separados a propósito.

**Lo que se lee al pulsar la «i»:** título, qué es, ejemplo, respaldo. Cada campo
con una pista que dice qué se espera — y el del ejemplo dice explícitamente que
**si no hay uno bueno se deja vacío**, porque un ejemplo inventado es peor que
ninguno.

**Solo para la plataforma:** la clasificación normativa y qué no se puede
inventar. Con su propio aviso: *nada de este bloque llega al producto*.

El campo del respaldo lleva la regla escrita en su pista:

> «Relacionado con ISO 9001:2015, 6.1» sí; «esto garantiza el cumplimiento», no.

---

## 4 · Publicar

Crear **no** publica: nace un borrador y el botón «i» sigue sin aparecer en la
pantalla.

Guardar el borrador **no toca lo publicado** —escribe en otra tabla— y la consola
lo dice al guardar.

Publicar cierra la revisión vigente, abre la siguiente y las enlaza. Publicar lo
mismo otra vez **no** crea una revisión.

Retirar hace que el botón «i» deje de aparecer. **No borra nada**: el texto y su
historia se conservan, y se puede volver a publicar.

---

## 5 · Historia y recuperación

Cada versión con su número, periodo de vigencia, autor, nota de cambio y
clasificación normativa.

De una versión cerrada se puede **recuperar el texto**: se copia al borrador y
desde ahí se publica como versión nueva. Nunca se reabre.

Una versión publicada no se edita ni se borra desde ninguna parte, ni por debajo:
la aplicación no tiene permiso de escritura sobre la tabla de revisiones, y el
freno es un disparador —comprobado también contra la clave de servicio—.

---

## 6 · Permisos

| | `superadmin` | `support` | admin de empresa |
|---|---|---|---|
| Ver la lista y las fichas | sí | **sí** | **no** |
| Ver la historia | sí | sí | no |
| Crear, editar, publicar, retirar | **sí** | no | no |

Probado con las tres sesiones, no mirando qué botones se pintan.

---

## 7 · Añadir una pantalla nueva

La consola **rechaza** una clave de pantalla que no esté en el registro, con un
mensaje que dice dónde añadirla: `lib/modules/page-keys.ts`.

Es a propósito. Una ayuda apuntando a una pantalla que nadie declaró es una ayuda
que nadie va a encontrar — y ese registro es también el que usará PE-03 para los
tutoriales.

---

## 8 · Los errores

| | Qué se lee |
|---|---|
| Validación | qué falta, en el campo que falta |
| Clave desconocida | dónde añadirla al registro |
| Duplicado | «Ya hay una ayuda para ese elemento de esa pantalla. Edítala en vez de crear otra» |
| Sin permiso | «Tu cuenta no puede administrar la ayuda del producto» |
| Avería | «No fue posible consultar… **Es un problema temporal, no una pérdida de contenido**» |

La última es la de siempre: una lectura fallida nunca se cuenta como «no hay
ayuda configurada». La lista lo dice como aviso y la ficha no lo convierte en un
404.
