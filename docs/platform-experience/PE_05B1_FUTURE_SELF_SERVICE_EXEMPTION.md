# PE-05B1 · La futura exención del SaaS autogestionable

## Qué tiene que poder pasar

El día que exista la aprobación —autodiagnóstico, visto bueno contable y
MinTIC—, el SaaS autogestionable pasará del 19 % al 0 %. Y ese cambio tiene que
poder hacerse **sin**:

- tocar código;
- reescribir el catálogo ni el precio de ningún plan;
- crear una identidad de plan nueva;
- modificar un solo cobro, presupuesto o recibo pasado;
- pedirle a nadie que cancele y vuelva a contratar.

## Cómo se hace

Se publica una **regla sucesora** con clase `self_service_saas`, tipo 0 y una
`effective_from` futura, en estado `active` y con su constancia de aprobación.
Nada más. Ni un despliegue.

## Qué pasa entonces, comprobado ejecutando

| | |
|---|---|
| **Antes de la fecha** | sigue mandando el 19 %. Una regla futura **no actúa antes** |
| **El cobro de septiembre** | intacto: base 100, IVA 19, total 119. Publicar la exención no lo tocó |
| **El precio base contratado** | intacto. Se congeló la **base**, no el total con IVA dentro |
| **Después de la fecha** | misma base, impuesto 0, total = base |
| **El Acompañamiento** | **sigue al 19 %**. No hay arrastre |

Esa quinta línea es la razón de que el impuesto se resuelva por clase de
servicio y no por plan ni por empresa.

## Por qué la suscripción congela la BASE y no el total

Si la suscripción hubiera congelado «lo que se cobra cada mes, IVA incluido», la
exención habría obligado a cancelar y recontratar para quitarlo — con
suscripción nueva en la pasarela, cliente nuevo y conversión nueva. Congelando
la **base** y resolviendo el impuesto en cada cobro, el cambio es prospectivo y
no le pide nada al cliente.

## Lo que queda para B2 y B5

**B2** — Mercado Pago puede representar una suscripción con un **único importe
total**. Habrá que averiguar cuál es su mecanismo nativo más seguro para
cambiarlo cuando cambie la regla fiscal. **El modelo canónico no se deforma por
eso**: aquí seguirá siendo base + impuesto = total, y el adaptador traducirá.

**B5** — aplicar el cambio a las suscripciones ya vivas en el proveedor.

## Control de corte para PE-06

> Antes de abrir Producción hay que verificar **explícitamente**:
>
> - qué regla fiscal está activa;
> - si el SaaS autogestionable sigue al 19 % o hay exención aprobada;
> - el estado del autodiagnóstico, del visto bueno contable y de MinTIC;
> - que la configuración fiscal de Producción es la que se decidió.
>
> **Activar el 0 % en Producción sin autorización de la propiedad del producto,
> validación contable y la aprobación externa es un bloqueador de corte.**
