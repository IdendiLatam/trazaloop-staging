# PE-05B2 · ¿Puede el proveedor pasar de 19 % a 0 % sin romper nada?

La pregunta exacta: ¿puede una suscripción viva pasar de cobrar `base + 19 %` a
cobrar `base + 0 %` en su siguiente cargo, **sin** crear un plan nuevo, **sin**
cambiar el precio base contratado y **sin** perder la identidad de la
suscripción?

## Documentalmente: sí

`PUT /preapproval/{id}` cambia `auto_recurring.transaction_amount` de una
suscripción individual. El identificador no cambia, la frecuencia no cambia, el
historial de cobros no cambia. Es exactamente la forma que hace falta.

Y encaja con la decisión de B1 de **congelar la base y no el total**: si se
hubiera congelado el total con el IVA dentro, quitar el impuesto obligaría a
cancelar y recontratar.

El modelo canónico no se dobla por esto. Mercado Pago guarda **un** número,
`transaction_amount`; Trazaloop sigue guardando `base + impuesto = total` y el
número del proveedor se anota aparte como «lo que está sincronizado con la
pasarela». Son dos representaciones de lo mismo, y la del proveedor no es la
autoridad.

## En sandbox: sin comprobar

No hay credenciales de prueba. La prueba pendiente, con importes sintéticos:

1. crear una suscripción por `base + 19 %`;
2. `PUT` con `transaction_amount = base` (el 0 %);
3. `GET` y comprobar que el importe cambió, que el `id` es el mismo, que
   `frequency` no cambió y que el historial sigue ahí;
4. observar **cuándo** se aplica: en el siguiente cobro o de inmediato.

El paso 4 es el que falta para poder prometer algo a contabilidad.

## Lo que NO se hizo

**No se activó ninguna regla al 0 %**, ni en Local ni en Staging, ni siquiera
en borrador. B1 dejó escrito que activarla exige autodiagnóstico, visto bueno
contable y aprobación de MinTIC, y eso sigue siendo un bloqueador de corte para
PE-06. Aquí solo se comprobó que la **mecánica** existiría.

Todos los importes de las pruebas de B2 usan la regla activa de lanzamiento:
**19 % en `self_service_saas`**.
