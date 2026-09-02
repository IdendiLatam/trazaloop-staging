# PE-04B4 · Créditos ponderados

## Una sola unidad comercial

Después de B4 hay **un** medidor de cara al cliente: **créditos ponderados de
Intelligence**. No hay un segundo contador de peticiones, mensajes, tokens ni
llamadas diarias compitiendo con él.

## Una llamada NO es un crédito

Es la regresión explícita del tramo, y hay prueba de ejecución: tres llamadas
—una ligera, una media y una pesada— consumen **8 créditos**, no 3.

## El registro de pesos

`ai_operation_weights` es economía interna **configurable**, no una promesa
pública. Las clases salen de la medición que ya existía en
`intelligence_use_cases` (QUALITY-12.2C/2D/12.1, con llamadas reales), no de una
intuición:

| Clase | Entrada observada | Tope | Créditos |
|---|---|---|---|
| `light` | ~727 tokens | 4 000 | **1** |
| `standard` | ~1 073 tokens | 6 000–8 000 | **2** |
| `heavy` | ~2 700 tokens | 12 000 | **5** |
| `intensive` | — | — | **10** |

`intensive` queda **declarada y sin ninguna operación asignada**: hoy no hay
nada tan pesado en el producto y asignarla a ojo habría sido inventar.

| Operación | Clase | Créditos |
|---|---|---|
| `document.quick_edit` | light | 1 |
| `document.contextual_review` | standard | 2 |
| `customer_themes` | standard | 2 |
| `ask`, `copilot.ask`, `root_cause` | heavy | 5 |
| `explain_signal`, `risk_candidates`, `review_summary`, `audit_prep` | heavy | 5 |

Las cuatro últimas no tenían muestra propia. Se les da la clase **de su
familia** —mismo camino del Copilot, mismos adaptadores de contexto, mismo tope
de 12 000— en vez de una inventada, y el motivo queda escrito en la fila. Si una
medición futura lo justifica, `audit_prep` es la primera candidata a subir: es
la única con dos adaptadores extra.

## Lo que cuesta cada plan, en operaciones

| Plan | Créditos/mes | Preguntas al Copilot | Mejoras de redacción |
|---|---|---|---|
| Free | 25 | 5 | 25 |
| Full | 500 | 100 | 500 |
| Extra | 2 000 | 400 | 2 000 |
| Prueba | +50 (total) | +10 | +50 |

## Cambiar un peso no reescribe lo cobrado

El registro es mutable; el libro guarda el **peso aplicado** en cada movimiento.
Comprobado ejecutando: se cambia `document.quick_edit` de 1 a 7, la siguiente
operación cuesta 7 y **la fila ya cobrada sigue diciendo 1**.

## Una operación sin peso se rechaza

Ni se cobra a ojo ni se deja pasar gratis: `ai_credits_reserve` lanza
`AI_OPERATION_UNKNOWN`. Es lo que obliga a clasificar una capacidad nueva antes
de poder ejecutarla, y lo que hace que el guardia de cobertura tenga dientes.
