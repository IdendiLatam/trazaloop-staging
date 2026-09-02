# PE-05A · Webhooks

## El principio

El webhook es donde el dinero se convierte en derecho. Es también la superficie
más expuesta del sistema: un endpoint público que, si se cree lo que le llega,
regala el producto.

> **PAY-38** · **El webhook verifica antes de creer.** Firma criptográfica del
> proveedor, o consulta directa a su API con el identificador recibido. Un evento
> sin verificar **no produce ningún efecto de negocio**, jamás.

## Se guarda crudo antes de interpretarlo

> **PAY-39** · El evento se persiste **tal como llegó** antes de procesarlo:
>
> ```
> provider · provider_event_id
> event_type
> raw_payload · headers relevantes (sin secretos)
> received_at
> signature_valid
> processing_status   ← received | processed | ignored | failed | needs_review
> processed_at · semantic_result · error
> ```
>
> Sin esto, cuando dentro de tres meses un cliente diga que pagó y no se activó,
> no habrá forma de saber si el evento no llegó, llegó mal firmado o llegó y se
> procesó mal.

Sobre privacidad: se guarda lo que el proveedor manda **menos** lo que no debe
guardarse. Nada de datos de tarjeta —que no llegan, por PAY-04— y ninguna
credencial. La retención se acota (por ejemplo, doce meses) y se documenta.

## Idempotencia

> **PAY-40** · Un webhook **llega repetido por diseño**: los proveedores
> reintentan cuando no reciben un 200 a tiempo, y a veces también cuando lo
> reciben.
>
> `provider_event_id` es **único**. El segundo intento no reprocesa: reconoce que
> ya está hecho y contesta 200. Y el efecto de negocio también es idempotente por
> su cuenta —activar dos veces la misma suscripción no crea dos asignaciones—,
> porque una sola línea de defensa contra el doble cobro es poca.

Esto encaja con lo que PE-04 ya construyó: `commercial_assign_plan` es idempotente
frente al reintento de la misma transición (0168), y el libro de créditos y los
casos de soporte tienen sus propias claves de idempotencia.

## Fallar cerrado

> **PAY-41** · Tres maneras de no entender un evento, y ninguna concede nada:
>
> | | Qué se hace |
> |---|---|
> | **Firma inválida** | se registra, se responde error, **cero efecto** |
> | **Tipo desconocido** | se guarda como `ignored`, **cero efecto** |
> | **Error al procesar** | `failed` → reintento; si persiste, `needs_review` |
>
> No hay una cuarta rama que, ante la duda, active el plan.

Los eventos en `needs_review` son visibles en la consola de plataforma: un
webhook atascado que nadie ve es un cliente que pagó y no lo sabe nadie.

## Privilegio acotado

> **PAY-42** · El procesamiento de webhooks necesita privilegio: llega sin sesión
> de usuario y tiene que escribir. Ese privilegio vive **solo ahí**, en el
> endpoint y en las funciones que llama, y cada acción privilegiada queda
> documentada.
>
> El `service_role` **no se reparte** por el dominio de checkout. La emisión de
> presupuestos, la lectura de estado y la interfaz de facturación funcionan con
> la sesión del usuario y su RLS, como todo lo demás.

## El entorno viaja en el evento

> **PAY-43** · Cada webhook declara su entorno y se **rechaza** si no coincide con
> el del despliegue. Un evento de sandbox llegando a Producción es un error de
> configuración o un intento de fraude; en ambos casos, no pasa.

## Reconciliación

El webhook puede no llegar. **PAY-44**: existe una lectura de conciliación que
compara suscripciones y pagos contra la API del proveedor y señala diferencias
—como la reconciliación de almacenamiento de PE-04B3—: **informa, no corrige
sola**. Corregir dinero a ciegas es peor que tener una diferencia visible.
