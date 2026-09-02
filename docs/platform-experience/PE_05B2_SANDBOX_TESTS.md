# PE-05B2 · Lo que se probó, y lo que queda pendiente del sandbox

## Lo que se probó de verdad

**42 comprobaciones de contrato** sin red ni credenciales
(`npm run test:pe05b2-contract`) y **24 contra la base real**
(`npm run test:pe05b2-webhooks`).

Casi todo lo que puede salir mal en una integración de pagos se puede comprobar
sin llamar al proveedor: la traducción de estados, la firma, la conciliación de
importes, la privacidad del sobre, el guardia de entorno, la idempotencia y las
ausencias. Por eso estas pruebas valen igual el día que el sandbox del tercero
esté caído.

Se las vio ponerse rojas: se reintrodujo en la base una liquidación **sin
conciliación y sin guardia de entorno**, y seis comprobaciones cayeron —importe
de menos, importe de más, otra moneda, referencia inválida, evento en vivo y
evento sin entorno—. Un guardia que nadie ha visto fallar no es un guardia.

## Lo que NO se probó

**Ninguna llamada real a Mercado Pago.** No hay credenciales de prueba
configuradas: `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET` están
ausentes. Se comprobó solo que los **nombres** no están configurados; no se
buscó ningún valor en ninguna parte.

Queda pendiente, en este orden:

1. petición autenticada de prueba;
2. crear una suscripción sintética sin plan asociado, mensual;
3. leerla por identificador;
4. comprobar la referencia externa opaca;
5. comprobar el importe exacto en pesos;
6. comprobar la recurrencia;
7. **crear una anual con `frequency: 12`** — la que decide si el anual existe;
8. cambiar el importe recurrente y observar cuándo se aplica;
9. cancelar el artefacto sintético.

Y después el pago y el webhook reales. Ver
[la puesta a punto](PE_05B2_CREDENTIAL_SETUP.md).

## El tipo de cambio de QA · un hallazgo

Para presupuestar hace falta una tasa USD→COP, y B1 no sembró ninguna a
propósito. Las pruebas de B2 siembran una sintética **solo en Local** y la
retiran al terminar.

**El esquema no sabe distinguir una tasa de QA de una comercial.**
`commercial_fx_rates` tiene `note`, que es texto libre, y `billing_resolve_fx`
no lo mira: cualquier tasa `active` y vigente se convierte en precio para quien
presupueste después.

Por eso **no se sembró ninguna tasa en Staging**, y por eso esto se reporta en
vez de resolverse por cuenta propia: añadir una columna de entorno a una tabla
de B1 es una decisión de modelo, no una comodidad de pruebas. Las opciones son
dos: una marca de entorno que el resolutor respete, o aceptar que en Staging la
tasa se fija solo cuando haya una autorizada de verdad.

Mientras tanto, la prueba de B2 **verifica que su tasa se fue**, y grita si
queda alguna. La primera versión la borraba por patrón y no borraba nada —el
comodín de PostgREST no es el de SQL, y un borrado que no encuentra nada no da
error—; se cambió a borrado por identificador con comprobación posterior.

## Residuos de QA

Todo lo sintético lleva nombre reconocible: empresas `QA B2 …`, tasas
`QA PE-05B2 …`, recursos con el sello de la ejecución. La suite lo retira todo
en su bloque final, en orden —los cobros antes que las suscripciones, la tasa
la última porque la suscripción la referencia— y dice en voz alta lo que no
pudo retirar.

Local queda en cero: 0 empresas, 0 tasas, 0 suscripciones, 0 eventos, 0
intentos.

**En Staging no se creó ni un artefacto**: ni empresa, ni presupuesto, ni
suscripción, ni evento. Solo se aplicó el esquema.

## Una prueba heredada que parpadea

`pe04b6-transitions` · comprobación **K** —dos transiciones simultáneas— falló
una vez durante un `test:all` completo y quedó verde en nueve ejecuciones
posteriores, incluidas tres bajo carga provocada. Es de **PE-04B6** y B2 no
toca `commercial_assign_plan` ni `commercial_apply_assignment`.

Lo que la comprobación protege de verdad —que nunca queden dos permanentes
abiertas— **no falló**; lo que falló fue la expectativa adicional de que al
menos una de las dos gane. No se relajó: se le añadió el código de error a su
mensaje, para que la próxima vez diga por qué en vez de decir «no pasó
ninguna».
