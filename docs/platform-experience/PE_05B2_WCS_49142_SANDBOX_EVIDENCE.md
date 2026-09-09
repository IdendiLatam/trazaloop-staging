# WCS-49142 · Lo que el sandbox de Mercado Pago contestó

*8 de septiembre de 2026. Todo en Preview, con credenciales de prueba. Ninguna
llamada tocó Producción, y no existe ni una transacción real.*

---

## De qué iba el ticket

Tres incógnitas bloqueaban decidir si Mercado Pago sirve como pasarela:

1. **El pagador.** PE-05B2 se quedó parado aquí: Mercado Pago valida
   `payer_email` **antes** que la recurrencia, así que mientras el correo fuera
   rechazado no se podía ni preguntar lo demás.
2. **El anual.** ¿Existe un ciclo de 12 meses, o el proveedor lo normaliza?
3. **El cambio de importe.** ¿`PUT` solo afecta al próximo cobro, cobra en el
   acto, prorratea?

---

## 1 · El pagador · **CERRADO**

### Lo que ya se había intentado, y falló

| Forma probada | Respuesta |
|---|---|
| `test@testuser.com` — el ejemplo de la documentación | `Payer is associated with a different site` |
| `<apodo en minúsculas>@testuser.com` | `User bad request` |
| `test_user_<User ID>@testuser.com` | `User bad request` |

El primer rechazo era **de sitio**; los otros dos ya no. La identidad MCO existía
y estaba activa: lo que fallaba era la dirección.

### La cuarta forma, la que indicó soporte

El número sale del **apodo** —`TESTUSER<número>`—, **no** del User ID. Son
distintos, y esa distinción es todo el hallazgo: esa forma no se había probado.

```
POST /preapproval
payer_email  test_user_<número del apodo>@testuser.com
status       pending
→ HTTP 201 · status pending · payer_id devuelto · sitio MCO · COP
```

```
MP_TEST_PAYER_EMAIL       = PASS
MERCADOPAGO_PAYER_BLOCKER = CLOSED
```

---

## 2 · La recurrencia anual · **CERRADO**

```
POST /preapproval
auto_recurring  frequency 12 · frequency_type months
                transaction_amount 5000 · currency_id COP
status          pending
→ HTTP 201
   frequency devuelto        12
   frequency_type devuelto   months
```

**La evidencia es lo devuelto, no el código de estado.** Un `201` no basta: un
proveedor puede aceptar la petición y normalizar el ciclo a un mes por dentro sin
decir nada, y quien se fíe del código vendería un plan anual para cobrarlo doce
veces. Por eso la sonda calcula el veredicto leyendo el `auto_recurring` que
vuelve.

```
MP_ANNUAL_12_MONTHS     = PASS
MP_ANNUAL_NORMALIZATION = NONE
```

---

## 3 · El cambio de importe · **BLOQUEADO POR EL PROVEEDOR**

### El montaje

Dos suscripciones diarias independientes —subir y bajar por separado, para que
un cargo no se pueda atribuir al experimento equivocado—. Se autorizó **01C-UP**
con la cuenta de prueba y su tarjeta de sandbox, y llegó su primer cobro:

```
01C-UP   status authorized · transaction_amount 5000 · 1 pago de 5000 aprobado
```

### Intento 1 · sin `reason`

```json
{"auto_recurring":{"transaction_amount":9000,"currency_id":"COP"}}
```

```
→ HTTP 400 · "Invalid value for preapproval_plan_id"
```

El mensaje **despista**: ese campo no se enviaba. Ni con valor, ni como `null`,
ni como cadena vacía — no aparece en la ruta ni en el adaptador. Y la
suscripción se creó **sin plan asociado**: el `GET` confirma que
`preapproval_plan_id` está **ausente**.

### Intento 2 · con `reason`, en modo NO-OP

La documentación de actualización señala que `reason` es requerido para una
suscripción sin plan asociado. Se añadió —**el de la propia suscripción, releído
del proveedor**, no uno inventado— y se probó manteniendo el mismo importe, para
separar «¿se acepta el `PUT`?» de «¿qué significa cambiar la cifra?»:

```json
{"reason":"<el reason actual>",
 "auto_recurring":{"transaction_amount":5000,"currency_id":"COP"}}
```

```
→ HTTP 400 · "Invalid value for preapproval_plan_id"   (otra vez)
```

**La hipótesis del `reason` queda descartada.** El proveedor exige un
identificador de plan a una suscripción que no tiene ninguno, y lo hace tanto si
se cambia la cifra como si no.

```
MP_AMOUNT_CHANGE_NO_PLAN             = BLOCKED_BY_PROVIDER_400
MP_AMOUNT_CHANGE_APPLIED             = NO
MP_IMMEDIATE_CHARGE_ON_AMOUNT_CHANGE = NOT_TESTED
MP_PRORATION_ON_AMOUNT_CHANGE        = NOT_TESTED
MP_NEXT_RENEWAL_USES_NEW_AMOUNT      = NOT_TESTED
```

**Nada de esto se ha probado, y por eso se dice «no probado» y no «no ocurre».**
El cambio real 5 000 → 9 000 **no se ejecutó**, y **01C-DOWN no se ha tocado**:
seguir probando variantes sería adivinar, y cada intento es una llamada real a un
tercero.

### Lo que hay que preguntarle a soporte

Con una suscripción **sin plan asociado**, `authorized`, creada por
`POST /preapproval` y con `preapproval_plan_id` ausente en su `GET`:

1. ¿Cuál es el body correcto de `PUT /preapproval/{id}` para cambiar
   `auto_recurring.transaction_amount`?
2. ¿Por qué el validador exige `preapproval_plan_id` en una suscripción que no
   tiene plan, incluso enviando `reason`?
3. Si cambiar el importe no es posible sin plan asociado, ¿cuál es el camino
   soportado para un cambio de precio: crear otra suscripción y cancelar la
   anterior?

---

## Un fallo nuestro, encontrado por el camino

La herramienta llegó a informar `importe_aplicado: true` **con el `PUT`
rechazado**: en un NO-OP el objetivo coincide con el valor actual, y la
comparación no miraba el código HTTP. Lo cazó el dueño del producto leyendo la
salida.

Un veredicto así es peor que ninguno, porque se lee de un vistazo y se cree.
Ahora la lógica es una función pura con diez casos fijados —el real incluido—:
sin un `2xx`, `put_aceptado`, `importe_aplicado`, `importe_cambiado` y
`cobro_inmediato` son **todos falsos**, y un pago que caiga en esa ventana se
atribuye al ciclo, no al cambio.

---

## Lo que sigue abierto

```
MP_WEBHOOK_BEHAVIOR = DEFERRED
```

Aplazado por decisión de producto: Preview responde 401 a las notificaciones y
apuntarlas a Producción está prohibido.

**Mercado Pago no está integrado en Trazaloop**, y este trabajo no lo integra:
las sondas viven en el disparador temporal de QA, no tocan ninguna tabla, no
dependen de ningún intento de compra y el importe nunca llega de quien llama.

## Higiene

Token y credenciales **siempre en Preview**; no se bajaron a ninguna máquina.
Este documento no contiene el token, ni el secreto de bypass, ni la contraseña
del comprador de prueba, ni ningún identificador de suscripción. Producción se
mantuvo en 0183 con su despliegue del 7 de septiembre y **0 transacciones**.
