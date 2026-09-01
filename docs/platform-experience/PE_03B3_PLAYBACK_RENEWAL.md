# PE-03B3 · Renovar la autorización sin cortar el vídeo

Un plazo de seguridad no puede convertirse en un máximo escondido de duración.
Este documento explica cómo se evita.

---

## 1 · El problema, dicho con números

Una URL firmada de reproducción vive **dos horas**
(`TUTORIAL_PLAYBACK_TTL_SECONDS`). Ese plazo existe por seguridad: un enlace que
sigue funcionando una semana después es un enlace que se puede pegar en un chat.

Pero si el plazo fuera lo único, entonces **el producto tendría un máximo de
duración de dos horas** — escondido, sin decirlo en ninguna parte, y apareciendo
como un error a mitad de vídeo. Justo después de que el propietario del producto
dijera que Trazaloop no impone duración máxima.

Las dos formas fáciles de «resolverlo» son las dos malas:

| Atajo | Por qué no |
|---|---|
| Subir el plazo a 24 horas | Deja el enlace vivo un día entero para no tener que escribir la renovación. Es debilitar la seguridad por comodidad. |
| Dejar que falle y que la persona recargue | Pierde el segundo en el que iba, y presenta como avería algo que era previsible. |

---

## 2 · Lo que se hace

Se renueva **antes** de vencer, no al vencer.

```
      0                          ~1h 48m            2h
      ├──────────── reproduciendo ───┤ renueva ├─────┤ (la vieja caduca)
                                      ↑
                       margen = 10 % del plazo, mínimo 30 s
```

Se espera al 90 % del plazo y se pide otra URL. Si se esperara al fallo, la
persona vería un error antes de que llegara la URL nueva — y un error es
exactamente lo que esto existe para no mostrar.

---

## 3 · Y el vídeo no vuelve al principio

Renovar significa cambiar la fuente de un `<video>`, y cambiarla ingenuamente
manda el reproductor al segundo cero. La secuencia es:

1. Se anota **dónde iba** (`currentTime`), si estaba reproduciendo, y el volumen.
2. Se pone la URL nueva y se llama a `load()`.
3. Se **espera a `loadedmetadata`**. Volver al segundo antes de que los metadatos
   estén hace que el navegador lo ignore en silencio: es el fallo clásico de
   esta operación.
4. Se restaura el segundo, el volumen, y —si estaba sonando— se reanuda.

Quien está viendo el vídeo no ve nada. Ese es el criterio de éxito.

---

## 4 · Renovar es lo mismo, no es más

Dos garantías, y las dos tienen prueba.

**La renovación firma la MISMA versión vigente.** La acción recibe una *clave de
pantalla*, no un identificador de versión, y vuelve a resolver cuál es la versión
publicada hoy. Aceptar un `versionId` del navegador habría convertido la
renovación en una vía para pedir cualquier versión — incluida una retirada, o una
que nunca se publicó.

```ts
renewTutorialPlaybackAction(pageKey)   // ← la clave, no la versión
```

**El objeto es inmutable.** La versión que se firma la segunda vez es
bit a bit la misma que la primera: mismo `object_path`, mismo SHA-256. No se está
sustituyendo un vídeo a mitad de reproducción; se está renovando el permiso para
leer el mismo.

Si entre una firma y la siguiente el superadministrador publicara una versión
nueva, la renovación firmaría la nueva. Es lo correcto: la vigente es la
vigente. La prueba D3 comprueba justo eso.

---

## 5 · Qué pasa si la renovación falla

No se rompe nada visible. La acción devuelve `url: null`, el reproductor se queda
con la URL que tenía y sigue reproduciendo hasta que caduque. Quien esté viendo
un vídeo corto no llega a enterarse.

No se cierra el diálogo, no se muestra un error encima del vídeo, y no se
reintenta en bucle.

---

## 6 · Los dos plazos, que no son el mismo

Se nombran distinto a propósito, porque confundirlos fue la causa del problema
que 0160 tuvo que arreglar en la subida.

| Constante | Cuánto | Qué es |
|---|---|---|
| `TUTORIAL_PLAYBACK_TTL_SECONDS` | 2 horas | Plazo de **seguridad** de una URL de lectura. Se renueva. |
| `TUTORIAL_UPLOAD_HORIZON_SECONDS` | 24 horas | Horizonte de una **reserva**. No es un plazo de subida: desde 0160 no forma parte de la autorización para escribir. |

Ninguno de los dos es un límite de duración de vídeo. Trazaloop no tiene uno.
