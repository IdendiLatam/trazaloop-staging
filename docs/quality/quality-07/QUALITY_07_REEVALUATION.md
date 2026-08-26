# QUALITY-07 · Reevaluación · vencer no es suspender

> **GP-10 · GP-18 · GP-25 · GP-26 · §28, §29, §31, §73, §74**

## 1 · La afirmación central

Que una reevaluación esté vencida significa que **hay trabajo pendiente**. No
significa que el proveedor haya empeorado, ni que su aprobación deje de valer,
ni que haya que dejar de comprarle.

Lo mismo con un certificado caducado: es un hecho sobre el papel, no sobre la
empresa. El papel pasa a `expired` y se avisa; la aprobación no se toca.

La constante `EXPIRY_IS_NOT_SUSPENSION` lleva esa frase, la pantalla la muestra
donde se produce la confusión y el PDF la imprime.

## 2 · Cuándo toca

```
next_review_on = last_evaluated_on + reevaluation_months
```

- **12 meses** por defecto (`DEFAULT_REEVALUATION_MONTHS`) — el máximo de la
  política aprobada, no una constante del producto.
- **Configurable proveedor a proveedor** en `reevaluation_months`.
- **La criticidad puede acortarla**: si la banda de resultado declara
  `review_months`, manda esa. Depender mucho de alguien se mira más a menudo.

Un proveedor que nunca se ha evaluado **no** aparece como vencido: no hay desde
cuándo contar. La pantalla lo pone en su propia sección, «Sin fecha de
revisión», en vez de mezclarlo con los vencidos.

## 3 · Fuera de ciclo

`EXTRAORDINARY_TRIGGERS` enumera los motivos que justifican reevaluar antes de
tiempo: incidente grave, cambio en el proveedor, cambio en lo que se le compra,
hallazgo de auditoría, decisión de la dirección.

Una reevaluación extraordinaria **es una evaluación más**, con su motivo escrito
en `trigger_reason`. No sustituye a la periódica ni borra la anterior.

## 4 · El barrido

`quality_scan_supplier_reviews(p_organization_id)` es idempotente y hace cinco
cosas, todas de la misma naturaleza:

| Qué mira | Qué produce |
|---|---|
| documento vencido | lo pasa a `expired` · alerta · tarea de renovación |
| reevaluación vencida | alerta · tarea · señal |
| aprobación caducada | alerta · señal |
| alcance crítico sin aprobación vigente | señal |
| documento por vencer (30 días) | alerta · tarea |

Todo lo que produce son **avisos**. Cada inserción lleva su `dedupe_key`, así
que llamarlo dos veces no duplica nada — la prueba G1 de la suite RLS lo corre
dos veces seguidas y cuenta.

Y lo que **no** hace, comprobado leyendo su cuerpo: no toca
`quality_supplier_approval_decisions`. Un barrido que homologara sería un
sistema que decide solo.

La señal de reevaluación vencida se **cierra sola** cuando alguien reevalúa: el
mismo barrido la resuelve. Una señal que hay que apagar a mano después de haber
hecho el trabajo enseña a ignorar las señales.

## 5 · La pantalla

`/quality/suppliers/reevaluations` contesta una sola pregunta —a quién toca
volver a mirar— y se detiene ahí. Tres bloques: vencidas, programadas y sin
fecha. Más el botón de revisar, que recalcula los avisos y dice lo que acaba de
hacer:

> «Revisión hecha. Los avisos que ya existían no se duplican, y ninguno cambia
> por su cuenta la aprobación de nadie.»
