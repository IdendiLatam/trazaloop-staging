# QUALITY-12.1 · Los temas de clientes, persistidos

Cierra el **GAP-03** con el que se entregó QUALITY-12: los temas se proponían y
se perdían al cerrar la pantalla.

## Por qué una tabla, y no un borrador más

`quality_ai_suggestions` sirve para proponer **una vez**. No sirve para lo que
la norma pide de verdad, que es **seguimiento**: el mismo asunto medido en dos
periodos, para poder decir si la satisfacción se mueve y hacia dónde.

Eso necesita tres cosas que un borrador no tiene:

* un **periodo** al que el tema se refiere,
* un identificador **estable entre periodos** —«plazo de entrega» en marzo y en
  junio tienen que caer en la misma serie—,
* y saber **cuántos comentarios** lo sostienen.

## Quién pone qué

| Lo pone el **modelo** | Lo pone el **servidor** |
|---|---|
| la etiqueta del tema | el periodo |
| el resumen | el recuento |
| el tono percibido | la procedencia |
| **qué comentarios van en el tema**, por su número | la evidencia |

El recuento **no lo pone el modelo** (§32). Sale de contar las referencias que
resultan válidas. Un tema que dijera «doce clientes se quejan» apoyándose en
tres comentarios es exactamente el fallo que esta separación impide, y la
prueba `C2` de `test:quality121-rls` compara el recuento guardado con las filas
de evidencia reales.

## La evidencia no lleva a nadie

Un tema apunta a las **referencias de la consulta**, que es lo único que el
modelo pudo citar. Una referencia de comentario anónimo dice *«Comentario
anónimo #3 · campaña Clientes 2026-Q1»* y nada más: no hay respuesta, ni
invitación, ni contacto, ni fecha exacta.

La prueba `C3` toma todas las respuestas y todas las invitaciones de la empresa
con el cliente de servicio, y comprueba que **ninguno de sus identificadores**
aparece en la evidencia del tema.

## Una cita prestada no cuenta

La función que escribe el tema filtra las referencias: solo cuentan las que
pertenecen **a esa misma consulta**. Las demás se descartan sin ruido, y la
consecuencia visible es que el recuento baja —que es exactamente lo que debe
pasar cuando la evidencia no está donde se dice—.

La prueba `C4` lo fabrica a propósito: coge referencias reales de **otra**
consulta y las presenta como respaldo. El tema se escribe con `evidence_count = 0`.

## La serie

`v_quality_ai_customer_theme_series` da, para cada lectura de un tema, el tono
y el respaldo **del periodo anterior del mismo tema** al lado. La comparación
la hace la base de datos, que sabe restar; el modelo no participa.

La vista **no une con `quality_ai_runs`**, y eso es deliberado: una consulta
solo la lee quien la hizo (§119), y un tema es trabajo compartido de la
empresa. Si la procedencia viviera solo en la consulta, el resto del equipo
vería el tema sin poder ver con qué se produjo. Por eso proveedor, modelo,
plantilla y versión se **copian** en la fila del tema al escribirlo: congelados
ahí, cambiar el modelo mañana no reescribe la historia.

## Nace como propuesta

Un tema es una **lectura de un modelo**, no una medición. Nace `proposed` y una
persona lo confirma o lo descarta; la pantalla lo dice con esas palabras.

* **Confirmar** no crea nada en el sistema de gestión: dice que alguien lo ha
  mirado y que sirve para seguirlo.
* **Descartar** no lo borra: queda constando quién lo descartó, que es lo que
  permite explicar dentro de dos años por qué esa serie tiene un hueco.
* **Borrar** es imposible: el mismo freno que protege la historia del Copilot
  (§120).

Confirmar o descartar exige que la fila registre **quién** lo hizo; la
restricción `..._reviewed_consistent` impide que un tema quede resuelto sin
nadie detrás.

## Dónde se ve

En **Voz del cliente**, debajo del resumen. Si el Copilot está apagado o nunca
se usó, la lista está vacía y el bloque no aparece: la Voz del cliente no
depende de la IA.

Cada tema muestra el periodo, el tono, en cuántos comentarios se apoya, cómo
estaba en el periodo anterior, y **con qué modelo y qué versión de las
instrucciones se produjo**.
