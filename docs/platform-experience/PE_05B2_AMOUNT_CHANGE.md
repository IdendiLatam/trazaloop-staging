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

*Actualizado el 9 de septiembre de 2026. Antes decía «nada», y era cierto: no
había credenciales. Ya las hay, y ya se probó.*

Se montaron dos suscripciones diarias independientes —una para subir y otra para
bajar, separadas para que un cargo no se pudiera atribuir al experimento
equivocado—, las dos autorizadas por una persona con la cuenta de prueba, y las
dos con su primer cobro aprobado. Sobre la de subida se intentó el cambio de
importe **cuatro veces**, variando una sola cosa cada vez:

| Intento | Body enviado | Respuesta |
|---|---|---|
| 1 · cambio real, sin `reason` | `auto_recurring` con 9000 COP | **400** · `Invalid value for preapproval_plan_id` |
| 2 · cambio real, con `reason` | `reason` real + `auto_recurring` | **400** · el mismo mensaje |
| 3 · NO-OP, con `reason` | `reason` real + el MISMO importe | **400** · el mismo mensaje |
| 4 · cancelar, `{"status":"canceled"}` | una sola clave | **400** · el mismo mensaje |

El mensaje **despista**: `preapproval_plan_id` no se envía en ninguno de los
cuatro —ni con valor, ni nulo, ni vacío: no aparece en la ruta ni en el
adaptador— y la suscripción tampoco lo tiene: su `GET` lo devuelve **ausente**.

Se descartaron por evidencia las dos explicaciones fáciles:

- **No es el SDK.** El forense de `mercadopago@3.6.0` mostró que `update` pasa el
  body ya serializado y el transporte solo añade cabeceras; `preapproval_plan_id`
  no aparece en ningún fichero ejecutable. Y se repitió con `fetch` nativo, sin
  una sola clase del SDK: **mismo 400**.
- **No es la falta de `reason`.** Añadirlo no cambió nada, ni siquiera en el
  NO-OP.

Lo que sí se aprendió: **sobre una suscripción SIN plan, el rechazo no distingue
qué se quiere cambiar**. La cifra y el estado fallan igual, con el mismo mensaje.

Y aquí hay que ser preciso, porque es fácil pasarse de lo observado. Lo único
demostrado con plan asociado es que **una operación concreta funcionó**: la
CANCELACIÓN, con `{"status":"cancelled"}`, devolvió `200` en MP-PLAN-01.

**De ahí no se sigue que el `PUT` funcione con plan en general**, ni que
`transaction_amount` vaya a aceptarse. Esa combinación —cambiar el importe de una
suscripción asociada a un plan— **no se ha probado nunca**:

```
MP_AMOUNT_CHANGE_WITH_PLAN = NOT_TESTED
```

## Full → Extra · `MP_AMOUNT_CHANGE = CLOSED_NOT_REQUIRED_FOR_MVP`

Decisión de producto del 9 de septiembre de 2026. **Se cierra la necesidad, no
la pregunta.**

Las razones, congeladas:

1. Un `preapproval` **sin plan** rechaza el `PUT` con `400 Invalid value for
   preapproval_plan_id`.
2. El rechazo se observó **con `reason` y sin `reason`**.
3. Y **tanto en cambio real como en NO-OP**.
4. Repetirlo no aporta evidencia nueva.
5. Probarlo **con plan** exigiría modificar el disparador de QA, crear otro plan,
   otra suscripción, autorización humana y probablemente otro ciclo de cobro.
6. La arquitectura productiva **no depende** de modificar el importe de una
   suscripción viva.
7. Subir y bajar se implementan con **transiciones de suscripción y de periodo**,
   no mutando `transaction_amount`: subir crea una suscripción nueva y solo
   cancela la anterior cuando hay pago aprobado; bajar se programa al final del
   periodo pagado.

**Esto NO es un FAIL de la integración.** Mercado Pago quedó demostrado como
viable de punta a punta —crear plan, checkout, autorizar, cobrar y cancelar— en
[MP-PROD-ARCH-01](MP_PROD_ARCH_01_DESIGN.md). Lo que se cierra es una
**dependencia** que el MVP no necesita.

Y conviene no confundir dos cosas: **cerrar la necesidad no responde las
preguntas B, C, D, E, F ni I de la tabla de arriba.** Siguen sin documentar y sin
observar. Si algún día hiciera falta cambiar el importe de una suscripción viva
—una exención fiscal aprobada, un cambio de precio autorizado—, este apartado
vuelve a abrirse y hay que probarlo **con plan asociado**, que es la única
combinación que queda por explorar — y sigue sin explorar.

## El impuesto futuro

Ver [la capacidad del proveedor ante un cambio fiscal](PE_05B2_TAX_CHANGE_PROVIDER_CAPABILITY.md).

## El tipo de cambio NO dispara nada

Que la tasa comercial vigente cambie **no** recalcula ninguna suscripción viva.
La base en pesos congelada por B1 sigue mandando, y el importe del proveedor
solo cambia por una acción explícita de ciclo de vida. No hay ni un camino
automático, y una prueba comprueba que B2 no programa ninguno.
