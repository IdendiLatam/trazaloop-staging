# PE-05A · Seguridad del cobro

## Modelo de amenazas

| Amenaza | Qué pasaría | Defensa |
|---|---|---|
| **Manipular el precio** | pagar 1 en vez de 40 | el importe vive en el presupuesto del servidor; del cliente solo se acepta la intención (PAY-13) |
| **Manipular el descuento** | `discount=90` desde el navegador | el servidor resuelve el cupón; el cliente manda un código (PAY-51) |
| **Falsear el regreso** | abrir `?success=true` y quedar en Full | el redirect no activa nada: manda el evento verificado (PAY-20) |
| **Reenviar un webhook** | activar o renovar dos veces | `provider_event_id` único + efecto idempotente (PAY-40) |
| **Falsificar un webhook** | conceder Extra sin pagar | firma o consulta a la API; sin verificar, cero efecto (PAY-38) |
| **Cobro cruzado** | pagar el plan de otra empresa | el presupuesto nace de la empresa activa del actor; RLS por empresa |
| **Miembro corriente cambia el plan** | un `quality` contrata Extra | solo `admin` (PAY-17), comprobado en servidor |
| **Consultor externo compra** | un asesor compromete a la empresa | `consultant` excluido explícitamente |
| **Secuestro de suscripción** | apuntar la suscripción de otro | las referencias del proveedor se atan a la empresa y no se aceptan del cliente |
| **Caída de la pasarela** | bajar de plan a quien sí pagó | `PROVIDER_UNAVAILABLE` es su propio estado (PAY-26) |
| **Presupuesto viejo** | comprar al precio o al cambio de hace meses | caducidad de 30 minutos (PAY-14) |
| **Manipular la moneda** | pagar 40 pesos en vez de 40 dólares | moneda e importe de cobro se congelan en el presupuesto (PAY-07) |
| **Carrera cancelación/renovación** | cobrar a quien acaba de cancelar | serialización por empresa, como en 0168 |
| **Devolución no reflejada** | seguir con Extra tras devolver | transición explícita, nunca automática (PAY-34) |

## Idempotencia, donde hace falta

> **PAY-54** · Idempotentes por diseño: crear presupuesto, procesar webhook,
> registrar pago, activar suscripción, renovar, transicionar plan y canjear
> cupón.
>
> No es una precaución teórica: los proveedores reintentan, los usuarios pulsan
> dos veces y las redes duplican. Un doble cobro descubierto por el cliente vale
> más caro que todo el trabajo de evitarlo.

## Concurrencia

> **PAY-55** · Serialización **por empresa** —el mismo patrón de PE-04B3, B4, B5
> y 0168— para que no ocurran: dos checkouts a la vez, dos suscripciones activas,
> el mismo cupón canjeado dos veces cuando está limitado, o dos eventos creando
> asignaciones que se contradicen.
>
> Y la invariante de 0168 sigue vigilando el final del camino: **una sola
> concesión comercial permanente abierta por alcance**, garantizada por índice.

## Secretos

> **PAY-56** · Ninguna credencial del proveedor llega al navegador. El secreto de
> webhook no se devuelve por ninguna API, no se guarda en una tabla legible por
> RLS y no aparece en registros. Solo se usan claves públicas donde el proveedor
> las exija para el checkout alojado.

## Tarjetas

> **PAY-04** (repetida aquí porque es la frontera que más importa) · Trazaloop
> **nunca** recibe datos de tarjeta. Checkout alojado o tokenización contra el
> proveedor. Sin número, sin CVV, sin token reutilizable en nuestra base.

## RLS de lo financiero

> **PAY-57** · Todas las tablas nuevas nacen con RLS, política explícita y grants
> revisados — la lección de SEC-01, ya convertida en preflight dentro de las
> migraciones (0166, 0167, 0168) y en guardia permanente.
>
> | Quién | Qué ve |
> |---|---|
> | `admin` de la empresa | plan, estado de pago, próximos cobros e historial **de su empresa** |
> | `quality` / `consultant` | según decida el negocio; por omisión, **nada** de facturación |
> | Soporte de plataforma | lo justo para atender: estado de suscripción y de pago, **sin importes ni datos financieros** que no necesite |
> | Superadministración | gestión operativa completa |
> | `anon` | **nada**. Solo la proyección pública de precios, y solo cuando exista la página |
>
> **PAY-58** · Ningún registro de pago es público. Y ninguna vista de facturación
> expone credenciales del proveedor.

## Auditoría financiera

> **PAY-59** · La historia financiera vive en sus **propias tablas de dominio**
> —presupuesto, checkout, pago, suscripción, canje, efecto sobre el derecho—, no
> en `audit_log`.
>
> `audit_log` es técnico: dice que algo cambió. Aquí hace falta poder explicarle a
> un cliente por qué se le cobró lo que se le cobró, y a un contador por qué el
> ingreso es el que es. Es la misma distinción que PE-04B5 hizo con
> `commercial_assignment_events`.
