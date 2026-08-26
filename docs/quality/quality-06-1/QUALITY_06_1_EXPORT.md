# QUALITY-06.1 · Contrato de exportación

## 1 · Una clave nueva

| Clave | Nombre documental | Tipo | Permiso |
|---|---|---|---|
| `quality.onboarding.detail` | **Onboarding del sistema de gestión** | ficha | `governor` (`admin`/`quality`) |

El identificador que recibe es el de la **asignación**, no el de la persona: un
onboarding es de alguien *en un cargo y entre unas fechas*, y la misma persona
puede tener varios.

Total del registro: **110 claves**. Entidades clasificadas: **127**.

## 2 · La entidad en el inventario

| Eje | Estado | Motivo |
|---|---|---|
| Ficha | `AVAILABLE` · `quality.onboarding.detail` | — |
| Listado | `NOT_APPLICABLE` | Es una proyección de otros registros, no una entidad con identidad propia |
| Histórico | `HISTORICAL_NOT_SUPPORTED` | El perfil del cargo **sí** se lee por la fecha de la asignación, pero el desarrollo abierto, el conocimiento por recibir y las tareas pendientes solo existen en su estado de hoy. Imprimir esas tres como si fueran del pasado sería fabricarlo |

Ese tercer motivo es deliberadamente específico. Decir «no se puede reconstruir»
a secas habría escondido que **una parte sí se reconstruye** —y es justamente la
parte que da sentido al documento.

La entidad se llama «Onboarding del sistema de gestión» y no «Onboarding» porque
CPR ya tiene una entidad con ese nombre: la ayuda de navegación de la
implantación. Dos filas con el mismo nombre convierten el inventario en una
trampa.

## 3 · Q06 + Q06.1: pendientes = 0

Ninguna entidad de los dos sprints queda sin clasificar en los tres ejes, y los
únicos estados posibles siguen siendo los cuatro finales de EXPORT-01.1.

## 4 · El motor, sin tocar

El adaptador produce un `PrintDocumentDraft`. No dibuja su propio PDF, no
devuelve bytes y **no escribe el nombre documental**: lo pone el registro, como
exige EXPORT-01.2 §6. Una prueba cuenta que haya exactamente un `documentName`
por definición.

Encabezado corporativo —logo, empresa y nombre del documento— en **todas** las
páginas, heredado sin cambios de EXPORT-01.2, con la normalización de logo de
EXPORT-01.3. La suite renderiza un onboarding con 45 documentos y comprueba el
encabezado página a página.

## 5 · El PDF de evaluación gana una sección

No una clave nueva: la misma `quality.performance-evaluation.detail`, que ahora
incluye **«Contexto del sistema de gestión»** después de un **salto de página**.

La separación es física a propósito. Un panel de indicadores pegado al resultado
se lee como su justificación, y esa lectura es la que PC-28 prohíbe. Una prueba
renderiza el documento y comprueba que el contexto **no** esté en la página del
resultado.

Solo entra lo que quien generó el PDF podía ver: la sección se construye con su
misma sesión.

## 6 · Alcanzabilidad

`test:export01` comprueba que toda clave del registro se ofrezca en alguna
pantalla. El botón de `quality.onboarding.detail` está en la propia pantalla de
onboarding. Una exportación que nadie puede pulsar no existe.
