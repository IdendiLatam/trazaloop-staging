# QUALITY-07 · Incidentes y señales

> **GP-21 · GP-22 · GP-26 · §27, §31, §32, §33**

## 1 · Un incidente no es una no conformidad

Es la confusión más cara de este dominio, porque las dos palabras se usan como
sinónimas en la conversación diaria y no lo son en un sistema de gestión.

- Un **incidente** es un hecho: llegó incompleto, llegó tarde, el lote venía
  fuera de especificación.
- Una **no conformidad** es una **clasificación** que alguien decide, con las
  consecuencias que QUALITY-04 ya definió: causa, acción, eficacia.

Convertir lo primero en lo segundo automáticamente produce dos daños: infla el
recuento de no conformidades con hechos que no lo eran, y quita a una persona la
decisión que le corresponde.

`quality_supplier_incidents` no tiene ninguna columna de clasificación. La
constante `INCIDENT_IS_NOT_NC` lleva la frase, y la pantalla la muestra junto al
formulario de registro.

## 2 · Escalar, cuando merece la pena

`quality_open_case_from_supplier_incident` abre un `work_case` **sin
clasificar**, con `case_type = 'supplier_incident'` y tres referencias: el
proveedor, el alcance afectado y el incidente que lo originó.

Clasificarlo como no conformidad —o no— es la decisión de siempre, en la ficha
del caso, con el flujo de QUALITY-04 intacto. El mensaje de la acción lo dice:

> «Caso abierto SIN clasificar, con las referencias al proveedor. Clasificarlo
> como no conformidad —o no— es la decisión de siempre, en la ficha del caso.»

Las referencias **enlazan; no duplican**. La ficha del caso puede enseñar el
proveedor y su alcance sin haberlos copiado dentro, así que no hay dos versiones
del mismo dato esperando a divergir.

## 3 · Un fallo del dato no es un deterioro del proveedor

`is_data_issue` existe para lo que pasa de verdad: la integración falló, el
albarán se cargó dos veces, alguien registró el lote equivocado. Sin esa
casilla, esos hechos acaban contados como incumplimientos del proveedor y su
tendencia baja por algo que no hizo.

La pregunta en pantalla está escrita como se piensa:

> «¿Fue un problema del dato y no del proveedor?»

## 4 · Las señales

`quality_supplier_signals` es lo que la ficha enseña sin tener que ir a buscar
avisos. Cinco clases: reevaluación vencida, aprobación caducada, alcance crítico
sin aprobación, documento por vencer, racha de incidentes.

Una señal dice **mira esto**. No suspende, no rechaza, no abre una no
conformidad y no clasifica nada — todo eso lo decide una persona. La política
RLS le concede a la sesión `select` y `update`, y nada más: no se pueden
fabricar señales desde la aplicación, solo atenderlas o descartarlas.

## 5 · GP-26 · La racha

Que un proveedor acumule incidentes es información. Convertir «tres incidentes
en un trimestre» en una suspensión automática sería inventar un umbral que
ninguna empresa aprobó. Lo que hace el sistema es decirlo —alerta
`supplier_incident_streak`— y dejar la decisión donde le corresponde.
