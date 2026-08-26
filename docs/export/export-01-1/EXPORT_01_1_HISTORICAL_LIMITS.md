# EXPORT-01.1 · Límites históricos declarados

> No se fabrica verdad histórica. Cuando el dominio no guarda el pasado, el PDF
> dice que retrata el presente.

## El problema que este documento resuelve

EXPORT-01 dejó fuera seis entidades con una razón buena: §24 prohíbe imprimir un
resultado sin saber qué supuestos regían. La conclusión, sin embargo, era
demasiado amplia: de «no puedo afirmar que esto es histórico» se pasó a «no
exporto nada», y el usuario se quedó sin poder descargar su diagnóstico ni su
cálculo de circularidad.

Las dos afirmaciones son distintas:

- **«Este documento reproduce lo que había el 3 de marzo»** — exige que la base
  guarde esa versión.
- **«Este documento refleja lo que hay hoy, y lo dice»** — no exige nada más que
  honestidad.

La segunda es útil, es exportable, y es lo que faltaba.

## Cómo se declara

Cada definición del registro declara qué afirma sobre el tiempo:

```ts
temporality: "historical"     // la base guarda esta versión
temporality: "current"        // + historicalLimitReason obligatorio
```

Una prueba (`B1`) falla si una exportación se declara `current` sin explicar
qué **no** guarda el dominio. Otra (`B2`) falla si una exportación histórica
lleva además el aviso de estado actual: no se pueden decir las dos cosas.

## Lo que ve el lector

En el PDF, un bloque enmarcado:

> **Representación del estado actual.** Este PDF refleja la información vigente
> en Trazaloop al momento de su generación (25/08/2026 22:14 UTC). No es una
> reconstrucción histórica.

Sin tono alarmista —una prueba lo comprueba—. Un lector que sabe qué tiene en
la mano puede usarlo; uno que cree tener otra cosa, no.

## Las 28 declaraciones, por qué

### Cálculos que apuntan a una metodología viva

| Entidad | Qué NO guarda el dominio |
|---|---|
| Contenido reciclado | Guarda fecha, resultado y componentes; **no** una versión temporal de la metodología con la que se calculó |
| Cálculo de soporte | Se arma leyendo el estado actual de las evidencias y de la cadena |
| Matriz de evidencias | Se calcula con el estado de gobernanza **vigente** de cada evidencia |
| Evaluación de circularidad | Apunta a la metodología **activa**, no a una copia congelada de sus criterios |

Para los tres primeros, el **expediente de auditoría** ya es la respuesta: congela
ese contexto con su snapshot y su huella, y por eso sí es histórico.

Para la circularidad, la respuesta futura es la misma que Quality ya tiene con
RO-14: versionar la metodología y que la evaluación apunte a la versión. Este
sprint **no** la inventa.

### Autoevaluaciones sin serie

| Entidad | Qué NO guarda el dominio |
|---|---|
| Diagnóstico PCR | Una fila por empresa con su avance; no las respuestas de una autoevaluación anterior ni el cuestionario que regía entonces |
| Diagnóstico textil | Igual |

### Catálogos

Trece catálogos —productos, materiales, proveedores, familias, fibras,
componentes, procesos, colecciones…— guardan **la ficha vigente**. Nadie
versiona un catálogo, y fingir que sí lo hace sería peor que decirlo.

Lo que sí queda fechado es cada **uso**: un lote recibido, un cálculo hecho, una
orden producida.

### Proyecciones

| Entidad | Por qué |
|---|---|
| Lista Maestra / Maestro de documentos | Es una proyección del estado de hoy; no se guarda una versión de la lista por fecha. La historia vive en las revisiones, que sí se descargan |
| Reporte de contenido reciclado | Cada fila trae el **último** cálculo de su lote |
| Mis tareas | Una vista del trabajo pendiente hoy, para quien la mira |
| Equipo | Guarda estado y fecha de alta, no la serie de cambios de rol |
| Datos de la empresa | Guarda el valor vigente de cada campo |

## Lo que SÍ es histórico, y por qué puede afirmarlo

| Entidad | Qué guarda la base |
|---|---|
| Revisión de proceso | La revisión completa, con su vigencia y su contenido |
| Versión del mapa | El snapshot publicado |
| Revisión documental | Su estado, sus participantes y sus decisiones |
| Medición | **La meta que regía en su periodo** (`appliedTargetValue`) |
| Versión de metodología | Sus escalas y bandas, inmutables |
| Evaluación de riesgo | Su versión de metodología, sus factores y **la eficacia que el control tenía aquel día** |
| Acción | Su fecha objetivo **original** además de la vigente, y sus verificaciones, incluidas las negativas |
| Expediente de auditoría | Snapshot completo con huella |
| Ejercicio de trazabilidad | Snapshot completo con huella |
| Pasaporte técnico | Snapshot con huella |
| Ticket de soporte | Su conversación y su historial de estados |

## La regla, para el futuro

> Si el dominio no guarda la versión, no se imprime como histórico —**y se
> exporta igualmente el estado actual, diciéndolo**.

Clasificar algo como `HISTORICAL_NOT_SUPPORTED` **nunca** autoriza a no
implementar el PDF actual. Una prueba (`A8`) falla si alguien lo intenta.
