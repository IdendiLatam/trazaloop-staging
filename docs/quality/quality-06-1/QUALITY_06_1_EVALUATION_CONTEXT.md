# QUALITY-06.1 · Contexto del sistema de gestión en la evaluación

Cierra **GAP-2** de QUALITY-06 (PC-28, §39 del encargo de QUALITY-06).

## 1 · El principio

Los datos operacionales sirven para **informar al evaluador**. Nunca para
**decidir por él**.

Esa frase está en el producto, no solo en este documento. Aparece en la pantalla
y en el PDF, cada vez que aparece el panel:

> Esta información ofrece contexto del sistema de gestión. No determina
> automáticamente el resultado de la evaluación.

Y va acompañada de la que explica por qué el panel habla de procesos:

> Los indicadores y objetivos miden PROCESOS, no personas. Se muestran porque el
> cargo evaluado participa en ellos, no como medida de quien lo ocupa.

## 2 · El puente: nunca persona → indicador

```
Persona → Asignación → CARGO → Proceso → Dato operacional
```

El contexto parte del `position_id` que la evaluación ya guarda. Sin cargo no
hay contexto de proceso: no se inventa uno mirando qué tocó la persona. Y no
existe ninguna consulta que busque un indicador por `person_id` — una prueba lo
comprueba sobre el código.

## 3 · Qué fuentes entran, y por qué relación

| Fuente | Relación real |
|---|---|
| Indicadores | `scope_process_id` ∈ procesos del cargo, o `owner_position_id` = el cargo |
| Objetivos | `quality_objective_processes` sobre esos procesos |
| Acciones | `work_actions.owner_position_id` = el cargo |
| Casos | `work_cases.owner_position_id` = el cargo |
| Riesgos | `quality_risks.owner_position_id` = el cargo |
| Desarrollo realizado | Participación de la persona en actividades del periodo |
| Competencia declarada | Decisiones de competencia dentro del periodo |

Las dos últimas son de la persona **a propósito**: son las fuentes favorables, y
sin ellas el panel se convertiría en un expediente.

## 4 · El periodo evaluado, no el de hoy

Los indicadores se leen por las **mediciones cuyo periodo cae dentro del periodo
del ciclo**. Si no hay ninguna, la línea dice *«Sin mediciones en el periodo
evaluado»* — nunca se rellena con el último valor conocido. Una prueba comprueba
que el código no use `last_value`.

Cada línea declara qué puede afirmar sobre el tiempo:

- **Del periodo evaluado** — el dato pertenece al periodo.
- **Estado actual** — la fuente no conserva versión por periodo. Es el caso de
  los riesgos, y la línea lo dice en vez de disfrazarlo.

Las acciones se filtran por su fecha de cierre o vencimiento; los casos, por su
fecha de detección; los objetivos comparan su propio periodo con el del ciclo.

## 5 · Nada que se parezca a una nota

- No existe `operational_score`, `employee_score` ni `risk_score_for_person`.
- Ninguna columna nueva: el contexto es una **proyección**, no se persiste.
- El resumen cuenta **hechos por tono** —«3 favorables, 1 desfavorable»— y
  jamás los combina: en cuanto hay un número único, se lee como la nota.
- `looksLikePersonScore()` vive en el dominio, no en las pruebas, para que la
  definición de «puntuación» no se pueda ablandar sin que se note.

Y cada línea nombra primero **de qué habla**: «Proceso Gestión de Compras»,
«Cargo Coordinador de Calidad». Nunca la persona evaluada.

## 6 · El contexto no toca el resultado

- La capa de contexto **no escribe nada**: sin `insert`, `update`, `delete`,
  `upsert` ni `rpc`.
- Ninguna migración relaciona mediciones con evaluaciones.
- `quality_close_performance_evaluation` sigue exigiendo evaluador y al menos un
  criterio escrito, y no mira ningún dato operacional.

La prueba negativa lo demuestra contra base real: se corrige el indicador de 82
a 20 y la evaluación —estado, conclusión, fecha y el resultado de cada línea—
queda byte a byte igual. El contexto sí refleja el 20, porque es contexto.

## 7 · Privacidad

El panel se construye con la **sesión de quien mira**. Si RLS no entrega una
fuente, esa fuente no aparece; si no entrega la evaluación, no hay panel y la
ruta responde 404. El panel no eleva privilegios y no usa `service_role`.

Cuando alguna fuente queda fuera por permisos se dice **cuántas**, nunca cuáles:
el detalle sería precisamente la información que se negó.

Un consultor con acceso general a Quality no puede abrir la evaluación ni su
contexto — comprobado contra base real.

## 8 · En el papel

El PDF de la evaluación incluye el contexto **después de un salto de página**,
con su propio encabezado y sus dos avisos. La separación es física, no
tipográfica: un panel de indicadores pegado al resultado se lee como su
justificación.

Solo entra lo que quien generó el documento podía ver, porque se construye con
su misma sesión.

## 9 · Dónde se ve

Ruta nueva: `/quality/people/performance/[evaluationId]`, enlazada desde el
listado de desempeño. Arriba el resultado; abajo, en un bloque con borde
propio, el contexto.
