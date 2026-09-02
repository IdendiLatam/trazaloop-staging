# PE-05B1 · Tipo de cambio comercial

## Cuatro monedas, separadas

| | Hoy |
|---|---|
| **Catálogo** | USD — donde vive el precio publicado |
| **Presentación** | COP — lo que el cliente ve |
| **Cobro** | COP — lo que se cobra |
| **Liquidación** | del proveedor, fuera de este modelo |

Que Full valga «USD 40» no significa que se cobren 40 dólares a una tarjeta
colombiana. Son cosas distintas y el modelo las separa.

## Cómo se fija

`commercial_fx_rates`, con vigencia y estado, gestionada por la **administración
de plataforma**. **No hay consulta a ninguna API de divisas al cobrar**: una
pasarela de tipos caída no puede impedir vender, y el cliente tiene derecho a ver
el importe exacto antes de pagar.

## No se sembró ningún tipo

Inventar una tasa habría sido inventar un precio. **La base sale sin ninguna**, y
la consecuencia es explícita: sin tipo vigente, el presupuesto falla con
`FX_RATE_UNAVAILABLE` y dice que no se cobró nada.

> **Antes de vender en Staging o en Producción hay que fijar el tipo.** No es un
> olvido: es la única forma honesta de no publicar un número que nadie decidió.

## Se congela en el presupuesto

El presupuesto guarda el identificador del tipo y su valor en micros. Publicar
una tasa nueva **no mueve** un presupuesto ya emitido — comprobado subiendo la
tasa y verificando que el importe congelado no cambió.

## Y no se recalcula la suscripción

Que el tipo comercial cambie **no** mueve la base de una suscripción existente.
Los clientes nuevos usan la tasa nueva; a quien ya contrató no se le cambia el
precio sin una acción comercial explícita. Reprecificar es una decisión, no un
efecto secundario.

## Aritmética

`rate_micros`: 1 USD = `rate_micros` / 1 000 000 unidades de la moneda de cobro.
Entero, sin coma flotante. La conversión y el redondeo están en
`billing_usd_minor_to_cop`, en `numeric`, redondeando **al peso entero, media
hacia arriba**.
