# PE-05B2 · Cambiar el importe de una suscripción

Es la primitiva que más adelante servirá para una exención fiscal aprobada, un
cambio de precio autorizado o una subida de plan. **B2 la construye y no la
activa para nada.**

## Lo DOCUMENTADO

| Pregunta | Respuesta oficial |
|---|---|
| A · ¿Se puede cambiar el importe de una suscripción individual? | **Sí.** `PUT /preapproval/{id}` con `auto_recurring.transaction_amount` y `currency_id`. |
| B · ¿Cuándo entra en vigor? | **No documentado.** |
| C · ¿Genera cargo inmediato? | **No documentado.** |
| D · ¿Prorratea? | **No automáticamente.** La guía de gestión menciona un importe prorrateado *configurable*, es decir, opcional y a petición. |
| E · ¿Afecta solo al siguiente cobro? | **No documentado**, aunque es lo que sugiere que exista un prorrateo opcional aparte. |
| F · ¿Difiere mensual de anual? | **No documentado.** |
| G · ¿Se puede cambiar la frecuencia? | **No.** El SDK oficial lo dice literalmente: solo importe y moneda cambian; frecuencia y calendario son inmutables. |
| H · ¿Se puede cambiar la moneda? | **Sí** según el contrato, aunque Trazaloop no lo hará: cambiar la moneda de un contrato vivo es otro contrato. |
| I · ¿Hace falta que el pagador vuelva a autorizar? | **No documentado.** |

## Lo OBSERVADO EN SANDBOX

**Nada.** No hay credenciales de prueba configuradas, así que no se ejecutó ni
una llamada. Las nueve respuestas de arriba son documentales, y las seis que
dicen «no documentado» **siguen abiertas**.

Confundir «la API deja actualizar el importe» con «la política financiera está
resuelta» sería exactamente el error que este apartado existe para evitar.

## Full → Extra

**`REQUIRES_PRODUCT_DECISION`.**

No por falta de primitiva —existe— sino porque B, C, D, E y F están sin
responder. Sin saber si el cambio cobra hoy o el mes que viene, ni si el
proveedor prorratea, cualquier elección de política sería inventada. Y el
encargo prohíbe aritmética propia de prorrateo, con razón: calcularlo nosotros
mientras el proveedor calcula otra cosa produce dos verdades de dinero.

Lo que hay que hacer para cerrarlo, en sandbox: crear una suscripción, dejar
que ocurra el primer cobro, cambiar el importe, y observar **cuándo** llega el
siguiente cobro y **por cuánto**. Eso responde B, C, D y E de una vez. Repetir
con `frequency: 12` responde F.

## El impuesto futuro

Ver [la capacidad del proveedor ante un cambio fiscal](PE_05B2_TAX_CHANGE_PROVIDER_CAPABILITY.md).

## El tipo de cambio NO dispara nada

Que la tasa comercial vigente cambie **no** recalcula ninguna suscripción viva.
La base en pesos congelada por B1 sigue mandando, y el importe del proveedor
solo cambia por una acción explícita de ciclo de vida. No hay ni un camino
automático, y una prueba comprueba que B2 no programa ninguno.
