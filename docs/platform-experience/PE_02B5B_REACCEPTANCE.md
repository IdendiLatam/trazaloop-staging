# PE-02B5B · La reaceptación

Publicar la política v1.1 obliga a todo el mundo a aceptarla. No es un efecto
secundario ni algo que haya que programar: es la consecuencia de que la
aceptación referencie el **id del documento** y no su tipo.

Este documento explica por qué funciona así, qué se comprobó, y qué le pasa a
cada clase de persona.

---

## 1 · Por qué se pide sola

La puerta compara **los documentos activos requeridos** con lo que cada persona
ha aceptado, **por id**.

Al publicar la v1.1 se crea un documento nuevo, con un id nuevo. Nadie tiene una
aceptación que apunte a él, así que a todo el mundo le falta uno.

Si la comparación fuera por *tipo* —«¿aceptó alguna vez la privacidad?»—, aceptar
una vez valdría para siempre y una versión nueva no la vería nadie. Es la
diferencia entre versionar y sobrescribir, y está en el modelo desde 0068.

---

## 2 · Qué le pasa a cada quien

| | Antes de publicar | Después |
|---|---|---|
| **Aceptó la v1** | al día | **se le pide aceptar** · su aceptación de la v1 se conserva |
| **No había aceptado nada** | se le pedía la v1 | se le pide la v1.1 |
| **Cuenta nueva** | — | se le pide la v1.1, y nunca ve la v1 como vigente |
| **Aceptó la v1.1** | — | al día, y sale de la puerta |

Las 153 aceptaciones de la v1 en Staging **siguen ahí, sin tocar**. Ninguna se
migró, ninguna se reinterpretó, ninguna se marcó como si fuera de la v1.1.

---

## 3 · Lo que se comprobó, y cómo

### Contra la base · `pe02b5b-publication`

**A quien aceptó la v1 se le vuelve a pedir.** Se fabricó el pasado de una cuenta
—una aceptación real de la v1, cuando era la vigente— y se hizo la misma cuenta
que hace la puerta: documentos activos frente a documentos aceptados. Sale
pendiente la privacidad.

**Al aceptar se crea una fila nueva y la vieja sigue.** Quedan dos aceptaciones
de privacidad, `v1` y `v1.1`, y la antigua **sigue apuntando al documento
antiguo**: no se recicló la fila.

**La v1 y la v1.1 son documentos distintos.** Comparten tipo y no comparten id.
Si lo compartieran no serían dos versiones, y la reaceptación no existiría.

**Las aceptaciones de la v1 se conservan enteras**, y ninguna quedó marcada con
otra versión.

### Abriendo la puerta de verdad · `pe02b5b-published`

Contra la base se demuestra que *debería* pedirse. Que se pida —y sobre todo que
se **salga**— solo se ve abriendo las páginas.

**Topa con la puerta.** Una cuenta con aceptación de la v1 pide `/modules` y
recibe un redirección **307 a `/legal/accept`**.

**La pantalla dice qué se acepta**, y enlaza a `/privacy` para poder leerlo antes
de aceptar. Aceptar sin poder leer sería un consentimiento de adorno.

**Se acepta y se sale.** La comprobación que justifica la suite entera: se pide
`/modules` (redirige), se acepta, se vuelve a pedir `/modules` y **responde 200**.
Y se comprueba además que `/legal/accept` no se redirige a sí misma.

Un bucle de aceptación es el peor final posible de esta operación: nadie entra,
nadie puede arreglarlo desde dentro, y afecta a todo el mundo a la vez.

**Y lo que se aceptó es la v1.1**, no la v1.

---

## 4 · Lo que no se hizo, y no se debe hacer

- **No se creó ninguna aceptación en masa.** Cada una la crea la persona.
- **No se aceptó nada automáticamente.** Una aceptación que se da por hecha no es
  un consentimiento.
- **No se tocó ninguna aceptación anterior.** Son prueba de un consentimiento
  real sobre un texto concreto; migrarlas las convertiría en una ficción.
- **No se publicó nada en Producción**, así que allí no hay reaceptación.

---

## 5 · Si hubiera que volver atrás

**No hay «despublicar».** Volver a la v1 sería publicarla otra vez como versión
nueva, y eso **volvería a pedir aceptación a todo el mundo**: dos reaceptaciones
en lugar de una.

Por eso la revisión editorial fue antes y no después. Si aparece un error en el
texto, la vía es redactar una **v1.2**, publicarla y asumir la segunda
reaceptación. Y la v1.1 quedaría archivada con las aceptaciones que haya
recogido, igual que la v1.
