# QUALITY-13B2 · CÓMO SE LEE EL MIRADOR

---

## 1 · El patrón, repetido nueve veces

```
NOMBRE DE LA SECCIÓN     [n por atender]  [recuento]
Estado actual
  · fila
  · fila            (máximo cuatro)
  · fila
aclaración, cuando hace falta
Ver <sección>  →
```

Resumen → recuento → muestra pequeña → enlace al dominio dueño. Nada más. El riesgo que
el propio plan de 13A marcó para este tramo era que el mirador se convirtiera en quince
pantallas apiladas; el tope de filas no es cosmético.

---

## 2 · Los cuatro estados de una sección, que no son el mismo

| Estado | Qué se enseña |
|---|---|
| con filas | recuento del dominio, hasta cuatro filas, enlace |
| vacía | «No hay riesgos relacionados con este proceso.» y su enlace |
| **sin acceso** | «Tu rol no da acceso a este dominio.» · **ni recuento, ni filas, ni enlace** |
| **no se pudo leer** | «No fue posible cargar esta sección.» · sin recuento |

Las dos últimas **nunca** se convierten en `0`. Es el fallo que costó un sprint en
QUALITY-12.2F, cuando una lectura denegada se presentó como «todavía no hay consumo».

Y una sección sin acceso **no ofrece su enlace**: llevaría a una pantalla que va a
rechazar a quien la abra, y de paso confirmaría que ahí hay algo.

**El motivo técnico no se pinta jamás.** Trae dentro el mensaje del motor —`PGRST301`,
un nombre de tabla, una traza— y quien mira la pantalla no puede hacer nada con eso.

---

## 3 · El recuento es el del dominio, nunca el de las filas

Cinco riesgos y cuatro filas visibles: se enseña **5**. La cifra la calcula la base con
`head: true`; la muestra va con `limit`. Contar lo que se pintó y llamarlo total es
exactamente lo que hacía la portada vieja.

---

## 4 · Qué requiere atención

Un bloque arriba, y solo cuando hay algo. Tres condiciones, las únicas que hoy se pueden
afirmar sin interpretar nada:

| Condición | De dónde sale |
|---|---|
| *n* riesgos siguen activos | el estado del riesgo |
| *n* hallazgos sin evaluar | el estado de evaluación del hallazgo |
| *n* casos sin cerrar | el estado del caso |

Cada línea lleva su cifra, su momento y **su enlace**. Un aviso que dice «3 vencidas» y
no lleva a ninguna de las tres es una cifra, no un aviso (QI-26).

**El sujeto es el proceso, no cada fila suelta.** El recuento es del dominio y la muestra
son cuatro filas: atribuirlo a filas concretas enseñaría tres cuando el dominio dice
cinco.

**Un indicador fuera de meta no entra.** B1 no lo determina, y determinarlo aquí sería
que la pantalla decidiera qué es un problema en un dominio que no es suyo. La sección lo
dice en voz alta: *no es por sí mismo una no conformidad*.

---

## 5 · El tiempo

Cada sección enseña su etiqueta —hoy todas «Estado actual»— porque un dato temporal sin
etiqueta afirma más de lo que sabe.

Y cuando alguien abre una **revisión pasada** del proceso, el mirador avisa:

> El proceso se muestra tal como rigió · Periodo del … al … Lo que aparece alrededor es
> el estado actual: estos dominios no se reconstruyen a una fecha pasada.

No se esconde el contexto: se **etiqueta**. Esconderlo dejaría la pregunta sin respuesta;
enseñarlo callado afirmaría que aquel proceso tenía estos riesgos.

---

## 6 · Lo relacionado indirectamente

Ni el proveedor ni la retroalimentación de cliente guardan a qué proceso pertenecen, y no
se les añade (QI-23). El bloque aparece **solo si hay algo que derivar**, y cada fila dice
por qué camino llegó:

- «Relacionado por un caso abierto desde un incidente de este proveedor»
- «Relacionado mediante una referencia declarada desde el proveedor»
- «Relacionada por el caso abierto desde esta retroalimentación»

Con la advertencia de que la relación es **derivada** y no una lista que alguien mantenga.

De la queja se enseña el **asunto**, nunca quién: ni el cliente, ni el nombre de quien
reportó, ni la respuesta de encuesta de la que salió. Una campaña anónima deja de serlo
en cuanto una pantalla junta la queja con su cliente.

---

## 7 · Los enlaces

Todos salen de `deepLink`. Ninguno se escribe a mano, y **ninguno sale de Quality**: este
módulo funciona en empresas que no tienen PCR ni Textiles.

Una fila solo se enlaza si esa fila tiene ficha propia. Un hallazgo, una competencia y un
requisito viven dentro de otra pantalla: darle a cada uno un enlace al listado de su
dominio pondría cuatro enlaces idénticos seguidos fingiendo que llevan a sitios
distintos. Para eso está el «Ver…» de la sección.

Y un documento de **otro módulo** se enseña con el módulo del que es, sin enlace: su
ficha existe, pero no aquí.

---

## 8 · Pantalla pequeña y accesibilidad

- Rejilla de dos columnas desde `sm`, apilada debajo. **Ninguna tabla**: en un teléfono se
  sale de la pantalla.
- Encabezados anidados sin saltos: `h1` del proceso → `h2` del mirador → `h3` del bloque →
  `h4` de la sección.
- Cada región con nombre accesible; cada enlace con texto propio.
- El estado nunca se dice solo con color: el distintivo ámbar lleva «*n* por atender»
  dentro.

---

## 9 · Navegación · QI-25

El grupo **«Desempeño»** —objetivos e indicadores— pasa a llamarse **«Evaluación»**. La
entrada de Personas conserva «Desempeño», que es su nombre propio.

No se llama «Evaluación del desempeño»: eso metería el título literal del capítulo 9 en la
navegación por la puerta de atrás, y el principio congelado dice lo contrario.

Auditorías y Revisión por la dirección **no** se mudan dentro. Ningún otro grupo cambia de
nombre ni de sitio, y una prueba compara la lista entera.
