# QUALITY-12 · Reevaluación de lo diferido en Q08 y Q10

Este documento no marca nada como IMPLEMENTED por el hecho de que ahora exista
IA. Para cada punto: qué cubre QUALITY-12, y qué sigue faltando.

## 1 · QUALITY-08 · lo diferido de la voz del cliente

### VC-14 · Análisis de temas recurrentes en comentarios

**Antes:** DEFERRED. Trazaloop guardaba los comentarios y no hacía nada con
ellos: leerlos era trabajo manual, y con doscientos comentarios nadie los lee.

**Ahora:** PARCIALMENTE CUBIERTO.

- El Copilot puede agrupar comentarios en temas y nombrarlos como los nombraría
  alguien de la empresa (`copilot.customer_themes`).
- Cada tema puede apuntar a los comentarios que lo sostienen, por su número de
  fuente.
- **Los recuentos los calcula el código**, no el modelo (§58): «se leyeron 4
  comentarios» es una cuenta, no una estimación.

**Lo que sigue faltando:**

- Los temas **no se persisten** como entidad con su serie temporal. Se pueden
  guardar como borrador (`customer_theme`), pero no hay «tema recurrente» con
  su histórico de apariciones por periodo.
- El resultado es **derivado de IA**, no un hecho determinístico. Dos consultas
  pueden agrupar distinto, y eso está declarado.

**Veredicto: PARTIAL.**

### VC-15 · Sentimiento

**Antes:** DEFERRED.
**Ahora:** SIGUE DIFERIDO. No se implementa en esta entrega.

Cuando se implemente, tendrá que: etiquetarse como derivado de IA, guardar
modelo y versión, y no presentarse como un hecho objetivo (§59). No se ha hecho
para no añadir una cifra que parezca medición sin haber resuelto antes cómo se
muestra que no lo es.

**Veredicto: DEFERRED.**

### VC-33 · Comparación entre periodos de la voz del cliente

**Antes:** DEFERRED.
**Ahora:** PARCIALMENTE CUBIERTO.

El adaptador `customer_metric` trae la serie con su valor, su tamaño de muestra
y su **rotura de comparabilidad** —que ya calculaba QUALITY-08—. El Copilot
puede narrar la diferencia; los números y la advertencia de comparabilidad
vienen del motor.

**Lo que falta:** la comparación no se materializa como entidad consultable
fuera del Copilot.

**Veredicto: PARTIAL.**

## 2 · QUALITY-10 · los tres PARTIAL

### RD-16 · Comparación entre periodos en la revisión por la dirección

**Antes:** PARTIAL. Había datos de cada revisión, pero la comparación la hacía
una persona a mano.

**Ahora:** CUBIERTO EN SU PARTE DETERMINÍSTICA + NARRATIVA.

El adaptador `management_review` construye la comparación **en el servidor**:
dos revisiones consecutivas, sus decisiones, sus entradas preparadas, y la
diferencia **ya restada**, con las dos revisiones como fuentes. El Copilot la
narra; no la calcula (§62).

**Lo que falta:** la comparación no se guarda como parte del acta —sigue siendo
algo que se consulta—, y el conjunto de cifras comparadas es el que el adaptador
trae, no todas las que una dirección podría querer.

**Veredicto: PARTIAL → mayormente cubierto. Se mantiene PARTIAL** hasta que la
comparación forme parte del propio dominio de la revisión y no solo del Copilot.

### RD-17 · Tendencias

**Antes:** PARTIAL, y QUALITY-11 lo cerró en su parte determinística con
`consecutive_count` y `strictly_decreasing`.

**Ahora:** DETERMINÍSTICO (Q11) + EXPLICACIÓN (Q12).

La tendencia la detecta el motor de QUALITY-11 —«tres periodos seguidos fuera de
meta», «los últimos valores bajan uno tras otro»— y el Copilot la explica en
lenguaje de negocio a partir de la señal, sin recalcular la serie (§61).

**Veredicto: IMPLEMENTED**, con la separación explícita: el dato es
determinístico, la narración es IA y se muestra como tal.

### RD-20 · Temas recurrentes en la revisión

**Antes:** PARTIAL.
**Ahora:** PARCIALMENTE CUBIERTO por la misma vía que VC-14: el Copilot puede
detectar temas recurrentes en el material autorizado y proponerlos como
borrador para el acta.

**Lo que falta:** igual que VC-14, no hay entidad «tema recurrente» con
histórico. Y lo que el Copilot proponga es un borrador que la dirección tiene
que hacer suyo.

**Veredicto: PARTIAL.**

## 3 · Resumen

| Punto | Antes | Ahora | Por qué no más |
|---|---|---|---|
| VC-14 · temas recurrentes | DEFERRED | **PARTIAL** | no se persisten como entidad con serie |
| VC-15 · sentimiento | DEFERRED | **DEFERRED** | no implementado en esta entrega |
| VC-33 · comparación de periodos | DEFERRED | **PARTIAL** | no se materializa fuera del Copilot |
| RD-16 · comparación de periodos | PARTIAL | **PARTIAL** | la comparación vive en el Copilot, no en el acta |
| RD-17 · tendencias | PARTIAL | **IMPLEMENTED** | Q11 detecta, Q12 explica |
| RD-20 · temas recurrentes | PARTIAL | **PARTIAL** | igual que VC-14 |

**Uno pasa a IMPLEMENTED. Tres pasan de DEFERRED/PARTIAL a PARTIAL con alcance
declarado. Uno sigue diferido.** Ninguno se marca como cerrado por tener IA
delante.
