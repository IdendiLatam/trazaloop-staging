# PE-03B2 · Usar nuevamente un vídeo anterior

---

## 1 · Se llama por lo que hace

**«Usar nuevamente este vídeo»**, y no «Reactivar esta versión».

La diferencia no es de estilo. «Reactivar» insinúa que la versión antigua vuelve
a estar vigente, es decir, que su periodo se reabre — y eso produciría una
historia que dice que un vídeo estuvo publicado de marzo a hoy con un hueco
imposible en medio.

Lo que ocurre es otra cosa: nace una versión **nueva** con el mismo vídeo.

Hay una comprobación que falla si aparece un botón que diga «reactivar» o
«restaurar».

---

## 2 · Qué se enseña antes de hacerlo

El formulario dice cuatro cosas, y la tercera es la que importa:

> **De dónde sale:** versión 2, que estuvo publicada del 3 de marzo al 12 de junio.
>
> **Qué va a pasar:** se crea una versión nueva con el mismo vídeo.
>
> **Lo que NO pasa:** el periodo de la versión 2 no se toca. La historia seguirá
> diciendo cuándo estuvo publicada, y añadirá cuándo se volvió a usar.
>
> La versión nueva nace **sin publicar**.

Se puede escribir una nota de cambio. Si no se escribe, la función pone una:
«Repone el vídeo de la versión 2.»

---

## 3 · No publica

Reponer crea una **candidata**. Aparece en «Listas para revisar» con todo lo
demás, se puede previsualizar, y se publica en un paso aparte y deliberado.

Es lo mismo que pide el encargo: nada se publica sin confirmación explícita.

---

## 4 · Comparte el objeto, y por qué es seguro

La versión repuesta apunta **al mismo objeto** que la original. No se copian los
bytes.

Es seguro precisamente por la promesa del tramo: **nadie sobrescribe nunca un
objeto**. La ruta lleva el id de la versión dentro y no hay política de `UPDATE`
sobre el cubo, así que el objeto no puede cambiar bajo los pies de quien lo
referencia.

Copiar los bytes a una ruta nueva ocuparía el doble sin que nadie gane nada.

### La excepción de la ruta, dicha

Una versión repuesta es la única fila del sistema cuya ruta **no** contiene su
propio id. Está escrito en la migración 0159 para que no parezca un descuido, y
por eso `object_path` no es único.

### Y por eso descartar comprueba dos veces

Descartar una candidata retira su objeto — pero **solo si ninguna otra versión lo
referencia**. Una candidata repuesta comparte objeto con una publicada: borrarlo
a ciegas se llevaría un vídeo que la gente está viendo.

La comprobación está en `lib/db/tutorial-object-cleanup.ts` y devuelve
`still_referenced` en lugar de fallar: que un objeto no se pueda retirar porque
otro lo usa no es un error, es la respuesta correcta.

---

## 5 · Solo se ofrece donde tiene sentido

**En las históricas, nunca en la vigente.** Reponer lo que ya se está viendo no
significa nada.

Y solo a quien puede publicar: a soporte no se le ofrece.

---

## 6 · Cómo se comprueba, y cómo no

**Ver que existe una versión nueva no demuestra nada.** Es la trampa que PE-03A
escribió antes de caer en ella.

La comprobación lee el `effective_to` de la versión antigua **antes y después** de
reponer, y falla si se movió un milisegundo. Y el disparador de 0159 rechaza
reabrirlo incluso con el cliente administrativo, así que la garantía no depende
de que la consola se porte bien.
