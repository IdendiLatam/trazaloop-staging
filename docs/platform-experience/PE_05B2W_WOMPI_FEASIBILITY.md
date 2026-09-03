# PE-05B2W · Wompi · viabilidad como proveedor de cobro

**Descubrimiento y arquitectura. Sin código, sin migración, sin credenciales,
sin despliegue.** Mercado Pago queda intacto y congelado donde estaba.

---

## Lo que decide el asunto en una frase

**Wompi no programa cobros recurrentes: los inicia el comercio.** Eso convierte
a Trazaloop en dueño del calendario —trabajo nuevo— y a cambio **elimina de
raíz la incógnita que bloquea B2 desde el principio**: no hay que pedirle al
proveedor una recurrencia de doce meses, porque no hay recurrencia del
proveedor.

---

## 1 · El entorno se distingue por la llave

| | Wompi | Mercado Pago |
|---|---|---|
| URL de pruebas | `https://sandbox.wompi.co/v1` | la misma que producción |
| URL de producción | `https://production.wompi.co/v1` | la misma |
| Llaves | `pub_test_` / `prv_test_` **vs** `pub_prod_` / `prv_prod_` | `APP_USR-` en ambos casos |
| ¿Se puede clasificar el entorno? | **Sí, por prefijo y por URL** | **No** — nos costó tres tramos descubrirlo |

Cuatro llaves con papeles separados: **pública** (cliente), **privada**
(servidor), **de eventos** (webhooks) y **de integridad** (firma de
transacciones). Los dos entornos son independientes y el de pruebas no mueve
dinero real.

Esto importa más de lo que parece. El guardia de B2 existe para que nunca se
cobre de verdad sin querer, y con Mercado Pago quedó demostrado que **no hay
forma fiable de saber qué clase de credencial se tiene**. Con Wompi, sí: el
prefijo y la URL lo dicen, y se puede exigir que coincidan.

## 2 · El cobro recurrente, paso a paso

```
tarjeta → tokenización (llave pública, el dato nunca toca Trazaloop)
        → POST /payment_sources  (llave privada + acceptance_token
                                  + accept_personal_auth)
        → payment_source_id  ← esto es lo único que guardamos
        → POST /transactions con payment_source_id, cada periodo
```

`recurrent: true` activa el uso de credencial en archivo (COF) para
VISA/Mastercard, que es lo que corresponde a una suscripción de importe fijo.

Los dos *acceptance tokens* salen de `GET /merchants/info` y son
**obligatorios**: uno es la aceptación de los términos y el otro la
autorización de tratamiento de datos personales. Los dos exigen que la persona
los vea y los acepte de forma explícita, con sus PDF. Eso es una pieza de
**interfaz de checkout**, y es de B4.

**Trazaloop nunca guarda PAN, CVV ni datos de tarjeta.** Guarda un
`payment_source_id`, que es lo mismo que ya prometía el contrato de B1.

## 3 · Quién lleva el calendario · la decisión de arquitectura

Hoy `BillingProvider` está pensado para un proveedor que se encarga de la
recurrencia. Wompi es el otro modelo:

| | **A · el proveedor programa** | **B · programa el comercio** |
|---|---|---|
| Ejemplo | Mercado Pago, ePayco | **Wompi** |
| Recurrencia | objeto del proveedor | una transacción por periodo |
| Anual | hay que pedírsela al proveedor | **se cobra cada doce meses y ya** |
| Reintentos y gracia | los decide el proveedor | los decidimos nosotros |
| Riesgo | depender de su semántica | **cobrar de más o de menos si el planificador falla** |

El contrato de B1 no hay que reescribirlo: hay que **añadirle una capacidad**.
Un proveedor declara qué modelo es, y el dominio decide quién programa. Los dos
modelos comparten lo que ya está: presupuesto autoritativo, conciliación
exacta, idempotencia por identificador de proveedor, activación solo con pago
aprobado verificado en servidor.

### Lo que Trazaloop tendría que construir

`next_charge_at`, identidad del intento, idempotencia por intento, estado de
reintento, gracia de 7 días, cancelación al final del periodo, y las cuatro
salidas —aprobado, rechazado, revisión, proveedor caído—.

Casi todo eso **ya existe** en `billing_subscriptions` de B1:
`current_period_start/end`, `renews_at`, `grace_until`,
`cancel_at_period_end`, `status`. Lo que falta es **quién dispara**, y ahí sí
hace falta una decisión: hoy el repositorio no tiene planificador —el endpoint
de automatización de Quality se resolvió con un disparador HTTP protegido por
secreto, precisamente para no crear uno—. **No se propone nada aquí**: es
decisión de producto y de infraestructura, y es de B5.

## 4 · Mensual y anual

Con B1 mandando en el precio, el proveedor solo recibe un importe ya hecho:

| | Catálogo | Base COP | +19 % | Se cobra |
|---|---|---|---|---|
| Full mensual | USD 40 | 160 000 | 30 400 | **190 400** cada mes |
| Extra mensual | USD 100 | 400 000 | 76 000 | **476 000** cada mes |
| Full anual | USD 400 | 1 600 000 | 304 000 | **1 904 000** cada 12 meses |
| Extra anual | USD 1 000 | 4 000 000 | 760 000 | **4 760 000** cada 12 meses |

*(FX 4 000 COP/USD, ilustrativa. **No** es tasa comercial y no se escribe en
ninguna base.)*

**El anual deja de ser una incógnita.** No hay que preguntarle nada al
proveedor: es la misma transacción, doce meses después.

Wompi cobra **solo en COP**, que es exactamente la moneda de cobro que B1 ya
congela. No es una limitación para nosotros.

## 5 · Eventos y seguridad

`transaction.updated` cuando la transacción llega a estado final —`APPROVED`,
`DECLINED`, `VOIDED`, `ERROR`—.

La firma: se concatenan los valores de los campos que el propio evento lista en
`signature.properties`, se añade el `timestamp` y la **llave de eventos**, y se
compara el **SHA-256** contra `signature.checksum`, disponible también en la
cabecera `X-Event-Checksum`.

Es más simple que el manifiesto de Mercado Pago y encaja sin tocar la ruta:
verificar → anotar → releer el recurso → conciliar → liquidar. **Wompi exige
responder `200`**; si no, reintenta a los 30 minutos, 3 horas y 24 horas — con
la clave única por recurso que ya tiene `billing_provider_events`, eso es
inofensivo.

`reference` es único por transacción y es el sitio natural para la referencia
opaca del intento, igual que hoy con `external_reference`.

Y no cambia lo esencial: **volver del navegador no activa nada**. Solo un pago
aprobado verificado en el servidor concede el derecho.

## 6 · Tarjetas internacionales

Visa, Mastercard y **American Express**, nacionales e internacionales,
**excluidas las virtuales**. El importe siempre se establece en pesos, porque
la liquidación al comercio siempre es en pesos.

Trazaloop apunta a clientes fuera de Colombia, así que esto es un requisito y
está cubierto — con la salvedad de las tarjetas virtuales, que conviene
recordar cuando se escriba el mensaje de rechazo.

## 7 · Coste indicativo

Plan Avanzado: **2,65 % + 700 COP + IVA** sobre el importe cobrado.

| | Se cobra | Comisión aprox. | % del cobro |
|---|---|---|---|
| Full mensual | 190 400 | ~6 837 | 3,59 % |
| Extra mensual | 476 000 | ~15 844 | 3,33 % |
| Full anual | 1 904 000 | ~60 876 | 3,20 % |
| Extra anual | 4 760 000 | ~150 940 | 3,17 % |

Doce cobros mensuales de Full cuestan **~82 044** en comisiones; uno anual,
**~60 876**. **~21 000 COP de diferencia al año, por cliente**, solo por cobrar
una vez en vez de doce. Es un argumento comercial para empujar el anual, y otra
razón para que el anual funcione.

La comisión del procesador **no es** el impuesto de Trazaloop: son cosas
distintas, van a sitios distintos y no se mezclan. El IVA del 19 % que
cobramos es del servicio; el IVA sobre la comisión es un coste nuestro.

## 8 · ePayco, en corto

Existe y se ofrece comercialmente: **planes y suscripciones**, con débito
automático en la fecha establecida y tokenización de tarjetas
(`api.secure.payco.co/recurring/v1/subscription/create`). Es el **modelo A**,
el mismo que Mercado Pago.

**No** se pudo verificar en documentación oficial actual el modo de pruebas ni
la confirmación por webhook de cada cobro recurrente: la página general no lo
cubre. **No se recomienda** sin esa verificación.

Y hay una razón de fondo para no elegirlo hoy: es exactamente la clase de
proveedor que acaba de bloquearnos. Delegar la recurrencia ahorra trabajo
mientras funciona, y cuando no funciona no hay nada que hacer salvo esperar —
que es donde estamos con Mercado Pago.

**PayU** no se considera: su recurrencia está descontinuada. **Stripe** tampoco:
no procede para una entidad colombiana sin evidencia oficial actual de
disponibilidad.

## 9 · Los tres, comparados

| | **Wompi** | **ePayco** | **Mercado Pago** |
|---|---|---|---|
| Estado | documentado y coherente | ofrecido, sin verificar sandbox | **bloqueado sin fecha** |
| Entorno distinguible | **sí** | por verificar | **no** |
| Modelo | comercio programa | proveedor programa | proveedor programa |
| Anual | **resuelto por construcción** | por verificar | **sin poder preguntarse** |
| Firma de eventos | SHA-256 con llave de eventos | por verificar | verificador del SDK |
| Internacionales | Visa, MC, **AMEX** | por verificar | por verificar |
| Comisión | 2,65 % + 700 + IVA | por verificar | por verificar |
| Trabajo nuestro | **planificador** | poco | poco |

## 10 · Riesgos, dichos sin adornos

1. **El planificador es nuestro.** Si se equivoca, se cobra de más o no se
   cobra. Es el riesgo real de este camino y hay que tratarlo como tal:
   idempotencia por periodo, un intento identificable, y jamás conceder
   derecho antes del pago aprobado.
2. **No hay planificador en el repositorio.** Hay que decidir con qué se
   dispara. Es de B5.
3. **Los dos tokens de aceptación** obligan a mostrar contratos en el checkout.
   Es de B4, y conviene saberlo antes de diseñar esa pantalla.
4. **Tarjetas virtuales excluidas.**
5. **Solo COP**, que hoy nos vale y encadena a la tasa de cambio como única
   fuente de verdad del precio.
6. **Dos proveedores conviviendo** es más superficie. El contrato de B1 lo
   permite; la disciplina de no filtrar vocabulario del proveedor fuera de su
   adaptador hay que mantenerla.

## 11 · Lo que haría falta antes de implementar

1. Registro de comercio en Wompi y **llaves de sandbox** (`pub_test_`,
   `prv_test_`, llave de **eventos**, llave de **integridad**).
2. Decidir el plan comercial —el Avanzado es el que tiene tarifa publicada—.
3. Decidir **qué dispara el cobro recurrente**: eso es producto e
   infraestructura, y no lo decide el código.
4. Confirmar que la exclusión de tarjetas virtuales es aceptable.
5. Y una que no es de Wompi: **fijar una tasa USD→COP de verdad**. Sigue sin
   existir, y sin ella no hay precio en ningún proveedor.

Nada de esto se hizo. No se instaló nada, no se escribió ninguna variable, no
se creó ninguna tabla y no se tocó el adaptador de Mercado Pago.
