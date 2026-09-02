# PE-05B1 · Cimientos de facturación

## Qué se construyó

Migración **0169**, sin ninguna pasarela. Seis tablas, un contrato de proveedor,
un doble determinista y las funciones de dominio que convierten un pago en
derecho comercial.

| Tabla | Qué guarda |
|---|---|
| `billing_service_classes` | qué **clase de servicio** se vende |
| `billing_tax_rules` | tratamiento fiscal **con vigencia**, por clase |
| `commercial_fx_rates` | tipo de cambio comercial **con vigencia** |
| `billing_quotes` | presupuestos **inmutables** |
| `billing_subscriptions` | la suscripción de pago de la empresa |
| `billing_payments` | hechos financieros |

Las seis nacen con RLS, política explícita y grants revisados, y 0169 lleva el
preflight de SEC-01. Tras el replay: **0 tablas de `public` sin RLS**.

## La decisión que da forma a todo lo demás

**El precio de un plan y el impuesto que se le aplica son cosas distintas.**

Full vale USD 40 al mes. Que el cliente pague eso más 19 % de IVA —o eso más
0 % el día que la exención esté aprobada— lo decide una regla fiscal con su
propia vigencia. No existen `full_con_iva` ni `full_sin_iva`; existe **Full**.

Es lo que permite que una futura exención llegue **sin** cambiar el catálogo,
**sin** reescribir un solo cobro pasado y **sin** obligar a nadie a cancelar y
volver a contratar. Ver `PE_05B1_FUTURE_SELF_SERVICE_EXEMPTION.md`.

## Lo que NO se construyó, a propósito

Ni SDK, ni credenciales, ni una llamada de red, ni endpoint de webhook, ni
cupones, ni página pública de precios, ni checkout de Acompañamiento. Todo eso
tiene su tramo.

Lo que sí hay es el **contrato** `BillingProvider` y un **doble determinista**
—el mismo papel que `fakeProvider` cumple en Intelligence—, de modo que el ciclo
entero se comprueba sin depender de que el sandbox de un tercero esté de pie.

## Una extracción que evita repetir un error

La facturación necesita hacer exactamente lo que 0168 arregló: cerrar la
concesión anterior antes de abrir la nueva. Copiar esa lógica habría sido
repetir el fallo que 0168 vino a corregir, así que se **extrajo** a
`commercial_apply_assignment`, y ahora `commercial_assign_plan` y la
facturación la comparten. Las 18 comprobaciones de transición de PE-04B6 siguen
en verde tras la extracción.

## Alcance del cobro

**Una suscripción por empresa**, garantizada por índice único parcial. Al pagar,
el nivel se aplica a **cada módulo funcional habilitado**; un módulo habilitado
después lo hereda sin comprar otra vez.

Pagar **no concede acceso** a ningún módulo: son ejes distintos, y `core` nunca
recibe plan comercial.
