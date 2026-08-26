# QUALITY-06 · Cobertura de exportación

**Contrato:** EXPORT-01, 01.1, 01.2 y 01.3 son obligatorios. Toda entidad
empresarial nueva de este sprint declara sus tres ejes —ficha, listado,
histórico— **durante este sprint**. No hay backlog posterior (§60, §85).

## 1 · Resultado

| | |
|---|---|
| Entidades clasificadas en el inventario | **126** |
| Entidades nuevas de QUALITY-06 | **20** |
| Claves distintas en el registro | **109** |
| Claves nuevas de QUALITY-06 | **21** |
| **Entidades Q06 con export pendiente** | **0** |

El inventario vive como **dato** en `lib/export/inventory.ts`; el markdown de
`docs/export/export-01-1/` se genera desde ahí. Un documento de cobertura
desactualizado es peor que no tenerlo, porque se consulta creyendo que dice la
verdad.

## 2 · Las 21 exportaciones nuevas

| Clave | Nombre documental | Tipo | Permiso |
|---|---|---|---|
| `quality.org-unit.list` | Listado de unidades de la empresa | listado | miembro |
| `quality.orgchart.detail` | Organigrama | listado | miembro |
| `quality.position-profile.detail` | Perfil de cargo | histórico | miembro |
| `quality.position-holders.historical` | Titulares de cargos en una fecha | histórico | miembro |
| `quality.person.detail` | Ficha de persona | ficha | **governor** |
| `quality.person.list` | Listado de personas | listado | **governor** |
| `quality.competency.detail` | Ficha de competencia | ficha | miembro |
| `quality.competency.list` | Listado de competencias | listado | miembro |
| `quality.competence-matrix.detail` | Matriz de competencias | listado | **governor** |
| `quality.competence-matrix.historical` | Matriz de competencias en una fecha | histórico | **governor** |
| `quality.person-competence.detail` | Evaluación de competencia | ficha | **governor** |
| `quality.development-need.list` | Listado de necesidades de desarrollo | listado | **governor** |
| `quality.development-plan.detail` | Plan de desarrollo | ficha | **governor** |
| `quality.development-plan.list` | Listado de planes de desarrollo | listado | miembro |
| `quality.learning-activity.detail` | Actividad de aprendizaje | ficha | **governor** |
| `quality.learning-activity.list` | Listado de actividades de aprendizaje | listado | miembro |
| `quality.effectiveness.detail` | Registro de eficacia | ficha | **governor** |
| `quality.performance-cycle.detail` | Ciclo de evaluación de desempeño | ficha | **governor** |
| `quality.performance-evaluation.detail` | Evaluación de desempeño | ficha | **governor** |
| `quality.knowledge.detail` | Ficha de conocimiento | ficha | miembro |
| `quality.knowledge.list` | Listado de conocimiento | listado | miembro |
| `quality.transfer-plan.detail` | Plan de transferencia de conocimiento | ficha | miembro |
| `quality.lesson.detail` | Lección aprendida | ficha | miembro |
| `quality.lesson.list` | Listado de lecciones aprendidas | listado | miembro |

`governor` = `admin`/`quality`. Es la primera puerta; la autorización real la
impone RLS al leer, y el adaptador devuelve `null` cuando RLS no entrega la fila.

## 3 · Un eje que dejó de ser un embebido

El **Cargo** tenía su eje histórico como `EMBEDDED`, con este motivo: «las
titularidades se imprimen con sus vigencias dentro de la ficha del cargo». Era
verdad hasta 0122, porque el cargo no tenía versión.

Ahora la tiene, así que ese eje pasa a `AVAILABLE` con
`quality.position-profile.detail`, y el «Titular de cargo» gana
`quality.position-holders.historical`. El inventario se corrige donde la realidad
cambió; no se deja un motivo que ya no es cierto.

## 4 · Lo que NO se puede imprimir del pasado, y por qué

| Entidad | Eje | Motivo declarado |
|---|---|---|
| Unidad de la empresa | histórico | Las unidades no conservan versión temporal |
| Organigrama | histórico | Las asignaciones sí llevan fechas —de ahí «Titulares de cargos en una fecha»— pero unidades y jerarquía no se versionan: la **estructura** de un día pasado no se puede afirmar con verdad |
| Necesidad de desarrollo | histórico | Conserva su origen y su fecha, no versiones de sí misma |

Ninguno de estos usa `HISTORICAL_NOT_SUPPORTED` como excusa para no implementar
el PDF actual: los tres tienen su ficha o su listado disponibles. Y una prueba
comprueba que ninguna definición diga «actual» sin explicar por qué en
`historicalLimitReason`.

## 5 · Privacidad del papel (§63)

- El **listado de personas** no imprime correo, fechas de vinculación ni notas.
  Que un dato esté en la base no es razón para ponerlo en un papel que se
  reenvía.
- Las fichas con datos de personas llevan un aviso explícito: *un PDF no lleva
  consigo los permisos que lo produjeron*.
- La **evaluación de desempeño** se carga por la misma función que la pantalla:
  si RLS no la entrega, el endpoint responde 404, igual que si no existiera.
- La **matriz** no ordena, no suma y no promedia; el orden del papel es
  exactamente el que se le entregó, y una prueba lo comprueba.

## 6 · Encabezado y logo

Ninguna de las 21 definiciones dibuja su propio PDF ni devuelve bytes: todas
producen un `PrintDocumentDraft`, y el **registro** pone el nombre documental
(EXPORT-01.2 §6). Una prueba cuenta que haya exactamente un `documentName` por
definición y que ninguno esté dentro del `document` que devuelve el adaptador.

El encabezado corporativo —logo + nombre de empresa + nombre del documento en
**todas** las páginas— y la normalización de logo de EXPORT-01.3 se heredan sin
tocar nada. La suite de QUALITY-06 renderiza un organigrama de 144 cargos y una
matriz de 60 filas, y comprueba el encabezado página a página.

## 7 · Alcanzabilidad

`test:export01` comprueba que **toda** clave del registro se ofrezca en alguna
pantalla. Las 21 nuevas tienen su botón «Descargar PDF» en las siete pantallas de
Personas. Una exportación que nadie puede pulsar no existe.
