# PE-05B2 · El adaptador

## SDK oficial, no REST a mano

Se usa **`mercadopago@3.6.0`**, y la decisión se tomó mirando lo que trae:

| Lo que hace falta | ¿Lo cubre el SDK? |
|---|---|
| Crear, leer y actualizar la suscripción | sí · cliente `PreApproval` |
| Leer un pago | sí · cliente `Payment` |
| Verificar la firma de un webhook | **sí** · `WebhookSignatureValidator` |
| Distinguir caída de rechazo | sí · errores tipados |
| Reintentos acotados con retroceso | sí · `maxRetries`, `retryOn`, jitter |
| Clave de idempotencia | sí · `requestOptions.idempotencyKey` |

No queda ningún hueco, así que no se mezcla REST con SDK. Escribir REST a mano
habría significado reimplementar la verificación de firma, la clasificación de
errores y el reintento —las tres cosas peor y sin mantenimiento del proveedor—.

El paquete no tiene dependencias.

## Dónde vive el vocabulario del proveedor

`lib/billing/providers/mercadopago.ts` es el **único** fichero del producto que
sabe qué es un «preapproval». Fuera de ahí el dominio habla el contrato de B1.
La lista completa de la frontera son cuatro ficheros de servidor, declarados
uno a uno en dos guardias: nombrar la pasarela en un quinto sitio pone las
pruebas en rojo.

Los tres primeros llevan `import "server-only"`; el cuarto es la ruta del
webhook, que por definición es servidor. Una prueba recorre `app/` y
`components/` y comprueba que ninguna pantalla los importa.

## Lo que el adaptador no puede hacer

- **No recibe datos de tarjeta.** El contrato no ofrece por dónde pasarlos.
- **No activa nada.** Devuelve lo que el proveedor dice; el derecho lo concede
  el dominio después de conciliar.
- **No calcula impuestos, ni tipo de cambio, ni descuentos.** El importe llega
  hecho desde B1 y aquí solo se transporta.
- **No propaga el mensaje del proveedor.** Un error de Mercado Pago puede traer
  datos del pagador: hacia arriba viaja la clase, no el texto.

## Suscripción sin plan del proveedor

`POST /preapproval` **sin `preapproval_plan_id`**. La suscripción pertenece a
una empresa concreta, con su base en pesos, su tipo de cambio congelado, su
tratamiento fiscal y su historia de precio. Un plan del proveedor obligaría a
que todas compartieran importe, y entonces la exención fiscal futura o un
precio pactado no cabrían.

No existe ningún objeto `Full Mensual` ni `Extra Anual` en Mercado Pago, y una
prueba comprueba que no aparece.

## Recurrencia

| Intervalo | Lo que se manda |
|---|---|
| Mensual | `frequency: 1, frequency_type: "months"` |
| Anual | `frequency: 12, frequency_type: "months"` |

Meses de calendario, no 30 días: suponer treinta días desplazaría la fecha de
cobro un poco cada mes.

## Los dos métodos que B1 no puede expresar

`createSubscriptionCheckout` y `verifyWebhook` del contrato de B1 devuelven un
fallo explícito en vez de fingir:

- el primero porque el contrato no lleva ni el correo de facturación ni la
  referencia opaca, que aquí son obligatorios — se usa `createSubscription`, y
  **no se inventa un correo** para rellenar el hueco;
- el segundo porque verificar sin las cabeceras crudas delante sería ofrecer
  una puerta que parece segura y no lo es. La verificación vive en la ruta.

## Errores

| Situación | Clase |
|---|---|
| Conexión, tiempo agotado, 5xx, 429 | `provider_unavailable` |
| Credenciales mal puestas (401/403) | `provider_unavailable` |
| Rechazo real del medio de pago | `declined` |
| Petición mal formada | `invalid_request` |

Las credenciales mal puestas son un problema **nuestro**: no pueden acabar
bajándole el plan a un cliente.
