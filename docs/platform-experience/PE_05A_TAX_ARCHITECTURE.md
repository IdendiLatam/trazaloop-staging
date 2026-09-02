# PE-05A · Impuestos

## Lo que ya está congelado

Los precios del catálogo son **antes de impuestos**. Está escrito en 0162
(PEC-18), en la consola comercial y en cada pantalla que muestra un precio. PE-05
no lo cambia: lo respeta.

## Las cuatro cifras, separadas

> **PAY-08** · Todo presupuesto y todo pago guardan **cuatro cifras distintas**,
> nunca una sola:
>
> | | |
> |---|---|
> | `base_amount` | el precio de catálogo, menos el descuento |
> | `tax_amount` | el impuesto calculado |
> | `tax_rate_ref` | qué regla se aplicó, no solo el porcentaje |
> | `total_amount` | lo que se cobra |
>
> Guardar solo el total impide responder a un contador. Guardar solo el
> porcentaje impide explicar por qué a una empresa se le aplicó y a otra no.

`tax_rate_ref` guarda la **referencia a la regla**, no un número suelto: si
mañana el IVA cambia, los cobros viejos siguen explicándose con la regla que se
les aplicó.

## Quién calcula el impuesto

> **PAY-09** · **El servidor.** El navegador puede pedir «Full anual con este
> cupón»; el importe final —base, descuento, impuesto y total— lo resuelve el
> servidor y lo devuelve en un presupuesto cerrado.
>
> Una interfaz que calcule el impuesto por su cuenta acabará, tarde o temprano,
> mostrando una cifra distinta de la que se cobra. Y el cliente creerá la
> pantalla.

## Configuración, no motor

> **PAY-10** · Hace falta que administración pueda ajustar la presentación y el
> comportamiento fiscal **sin tocar código**: si el impuesto aplica, con qué tipo
> y con qué texto se muestra.
>
> Lo que **no** hace falta es un motor fiscal global con reglas por país,
> exenciones y umbrales. Trazaloop factura desde Colombia a clientes que hoy son
> colombianos. Construir un motor internacional antes del primer cliente
> extranjero es construir lo que no se sabe si hará falta.

## Lo que este documento NO hace

**No da asesoría fiscal.** Si Trazaloop/IDENDI debe aplicar IVA a este servicio,
con qué tipo, desde qué umbral y con qué obligaciones formales es una pregunta
para el contador de la empresa, no para el código.

> **Decisión humana pendiente 4** · Validar con contabilidad: si se aplica IVA,
> el tipo, y si cambia según el cliente sea persona natural o jurídica, o esté
> fuera de Colombia. **Bloqueante antes de Producción**, no antes de PE-05B1.

## Recibo de pago ≠ factura electrónica

> **PAY-11** · Son dos cosas y no se mezclan:
>
> - **Recibo de pago**: lo emite el proveedor y prueba que se cobró. Trazaloop
>   puede enlazarlo.
> - **Factura electrónica** (DIAN): una obligación formal con su propio
>   proveedor tecnológico, su numeración y su validación.
>
> **PE-05 no implementa facturación electrónica.** Si el negocio la necesita, es
> una integración aparte que se decide y se contrata aparte.
